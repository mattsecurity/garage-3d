import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { VEHICLE, driveCommand } from './driving.js';

const WORLD_HALF = { x: 26, z: 18 }; // invisible walls around the desk
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Rapier world with the desk, its props and a ray-cast vehicle for the current car. */
export class Physics {
  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: VEHICLE.gravity, z: 0 });
    this.car = null;
    this.body = null;
    this.vehicle = null;
    this.steer = 0;
    this.props = [];
    this.lastInput = { throttle: 0, steer: 0, handbrake: false };
    this.upsideDown = 0;

    this.world.createCollider(RAPIER.ColliderDesc.cuboid(60, 0.5, 60).setTranslation(0, -0.5, 0).setFriction(1));
    const { x: W, z: D } = WORLD_HALF;
    for (const [x, z, hx, hz] of [
      [0, -D, W, 0.5],
      [0, D, W, 0.5],
      [-W, 0, 0.5, D],
      [W, 0, 0.5, D],
    ])
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, 3, hz).setTranslation(x, 3, z).setRestitution(0.3));
  }

  /**
   * Adds colliders for desk props. `object.userData.collider` describes the shape;
   * `object.userData.localBox` (THREE.Box3 in the prop's own space) sizes box colliders.
   */
  addProps(objects) {
    for (const object of objects) {
      const info = object.userData.collider;
      if (!info) continue;
      const { position: p, quaternion: q } = object;
      const desc = (info.dynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed())
        .setTranslation(p.x, p.y, p.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      const body = this.world.createRigidBody(desc);
      let collider;
      if (info.shape === 'cylinder') {
        collider = RAPIER.ColliderDesc.cylinder(info.halfHeight, info.radius).setTranslation(0, info.halfHeight, 0).setDensity(40);
      } else {
        const box = object.userData.localBox;
        const c = box.getCenter(new THREE.Vector3());
        const s = box.getSize(new THREE.Vector3());
        collider = RAPIER.ColliderDesc.cuboid(s.x / 2, s.y / 2, s.z / 2).setTranslation(c.x, c.y, c.z);
      }
      this.world.createCollider(collider.setFriction(0.6).setRestitution(0.2), body);
      this.props.push({ object, body, dynamic: !!info.dynamic, home: { position: p.clone(), quaternion: q.clone() } });
    }
  }

  /** Puts knocked-over props back where they started. */
  resetProps() {
    for (const prop of this.props) {
      if (!prop.dynamic) continue;
      const { position: p, quaternion: q } = prop.home;
      prop.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
      prop.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      prop.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      prop.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      prop.object.position.copy(p);
      prop.object.quaternion.copy(q);
    }
  }

  /** Builds the chassis and wheels for `car`, starting from `car.root`'s current pose. */
  setCar(car) {
    this.removeCar();
    if (car.wheels.length !== 4) throw new Error(`${car.entry.id}: expected 4 wheels, found ${car.wheels.length}`);
    const { x: X, y: Y, z: Z } = car.size;
    const m = VEHICLE.mass;
    const { position: p, quaternion: q } = car.root;
    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.x, p.y + 0.05, p.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setCanSleep(false)
        .setLinearDamping(0.05)
        .setAngularDamping(0.4)
        .setAdditionalMassProperties(
          m,
          { x: 0, y: VEHICLE.comHeight, z: 0 },
          { x: (m / 12) * (Y * Y + Z * Z), y: (m / 12) * (X * X + Z * Z), z: (m / 12) * (X * X + Y * Y) },
          { w: 1, x: 0, y: 0, z: 0 },
        ),
    );
    const halfHeight = Y * 0.22;
    const bottom = Math.max(...car.wheels.map((w) => w.radius)) * 0.9;
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(X * 0.42, halfHeight, Z * 0.46)
        .setTranslation(0, bottom + halfHeight, 0)
        .setDensity(0)
        .setFriction(0.3)
        .setRestitution(0.1),
      this.body,
    );

    this.vehicle = this.world.createVehicleController(this.body);
    // Mount points sit higher by the static sag so the body rests at y = 0 with the tyres on the ground.
    const sag = -VEHICLE.gravity / (4 * VEHICLE.suspensionStiffness);
    car.wheels.forEach((wheel, i) => {
      const [x, , z] = wheel.pivot;
      this.vehicle.addWheel(
        { x, y: wheel.radius + VEHICLE.suspensionRest - sag, z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 }, // with a -X axle, positive engine force drives towards +Z
        VEHICLE.suspensionRest,
        wheel.radius,
      );
      this.vehicle.setWheelSuspensionStiffness(i, VEHICLE.suspensionStiffness);
      this.vehicle.setWheelSuspensionCompression(i, VEHICLE.suspensionCompression);
      this.vehicle.setWheelSuspensionRelaxation(i, VEHICLE.suspensionRelaxation);
      this.vehicle.setWheelMaxSuspensionForce(i, VEHICLE.maxSuspensionForce);
      this.vehicle.setWheelFrictionSlip(i, VEHICLE.frictionSlip);
    });
    // Rapier only finalises a new body's mass and broad-phase entry during world.step(); updating the
    // vehicle before that yields NaN once the world has already been stepped (e.g. switching cars).
    this.world.step();
    this.car = car;
    this.steer = 0;
    this.upsideDown = 0;
  }

  removeCar() {
    if (this.vehicle) this.world.removeVehicleController(this.vehicle);
    if (this.body) this.world.removeRigidBody(this.body);
    this.vehicle = null;
    this.body = null;
    this.car = null;
  }

  #rotation() {
    const r = this.body.rotation();
    return _q.set(r.x, r.y, r.z, r.w);
  }

  /** Signed speed along the car's nose (+Z). */
  forwardSpeed() {
    const v = this.body.linvel();
    _v.set(0, 0, 1).applyQuaternion(this.#rotation());
    return v.x * _v.x + v.y * _v.y + v.z * _v.z;
  }

  /**
   * Advances the simulation by one frame.
   * @param {number} dt seconds since the last frame
   * @param {{throttle:number, steer:number, handbrake:boolean}} input
   */
  step(dt, input) {
    // THREE.Timer reports dt = 0 while the tab is hidden: keep the world paused then.
    if (!this.vehicle || dt < 1e-4) return;
    const h = Math.min(dt, 1 / 30);
    this.world.timestep = h;
    this.lastInput = input;
    const cmd = driveCommand(input, this.forwardSpeed(), this.steer, h);
    this.steer = cmd.steer;
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      const axle = front ? cmd.front : cmd.rear;
      this.vehicle.setWheelSteering(i, front ? cmd.steer : 0);
      this.vehicle.setWheelEngineForce(i, front ? 0 : axle.engine);
      this.vehicle.setWheelBrake(i, axle.brake);
      this.vehicle.setWheelFrictionSlip(i, axle.frictionSlip);
      this.vehicle.setWheelSideFrictionStiffness(i, axle.sideFriction);
    }
    if (cmd.yawTarget !== null) {
      const { x, z } = this.car.size;
      const inertiaY = (VEHICLE.mass / 12) * (x * x + z * z);
      const yawRate = this.body.angvel().y;
      this.body.applyTorqueImpulse({ x: 0, y: (cmd.yawTarget - yawRate) * inertiaY * VEHICLE.driftYawGain * h, z: 0 }, true);
    }
    this.vehicle.updateVehicle(h);
    this.world.step();

    // Flip back automatically after lying on the roof/side for a while.
    const upright = _v.set(0, 1, 0).applyQuaternion(this.#rotation()).y;
    this.upsideDown = upright < 0.3 ? this.upsideDown + h : 0;
    if (this.upsideDown > 1.5) this.resetCar();
  }

  /** Lifts the car, levels it (keeping its heading) and stops it. */
  resetCar() {
    if (!this.body) return;
    const t = this.body.translation();
    const nose = _v.set(0, 0, 1).applyQuaternion(this.#rotation());
    const yaw = Math.atan2(nose.x, nose.z);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const clamp = (v, max) => Math.min(Math.max(v, -max), max);
    this.body.setTranslation({ x: clamp(t.x, WORLD_HALF.x - 3), y: 0.6, z: clamp(t.z, WORLD_HALF.z - 3) }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.upsideDown = 0;
  }

  /** Copies the simulation onto the car model and the dynamic props. */
  sync() {
    if (this.body) {
      const t = this.body.translation();
      const r = this.body.rotation();
      this.car.root.position.set(t.x, t.y, t.z);
      this.car.root.quaternion.set(r.x, r.y, r.z, r.w);
      this.car.wheels.forEach((wheel, i) => {
        const mount = this.vehicle.wheelChassisConnectionPointCs(i);
        const length = this.vehicle.wheelSuspensionLength(i) ?? VEHICLE.suspensionRest;
        wheel.object.position.set(wheel.pivot[0], mount.y - length, wheel.pivot[2]);
        wheel.object.rotation.y = this.vehicle.wheelSteering(i) ?? 0;
        (wheel.hub ?? wheel.object).rotation.x = this.vehicle.wheelRotation(i) ?? 0;
      });
    }
    for (const prop of this.props) {
      if (!prop.dynamic) continue;
      const t = prop.body.translation();
      const r = prop.body.rotation();
      prop.object.position.set(t.x, t.y, t.z);
      prop.object.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  /** Per-wheel contact info used for skid marks and tyre smoke. */
  wheelStates() {
    if (!this.vehicle) return [];
    const right = new THREE.Vector3(-1, 0, 0).applyQuaternion(this.#rotation());
    const v = this.body.linvel();
    const lateral = Math.abs(v.x * right.x + v.z * right.z);
    const speed = Math.abs(this.forwardSpeed());
    const { throttle, handbrake } = this.lastInput;
    return this.car.wheels.map((wheel, i) => {
      const rear = i >= 2;
      let skid = Math.min(Math.max((lateral - 2.5) / 5, 0), 1);
      if (rear && handbrake && speed > 2) skid = Math.max(skid, 0.8);
      if (rear && throttle > 0.5 && speed < 4) skid = Math.max(skid, 0.6); // launch wheelspin
      const contact = this.vehicle.wheelIsInContact(i);
      const p = contact ? this.vehicle.wheelContactPoint(i) : null;
      return { contact, point: p ? new THREE.Vector3(p.x, p.y, p.z) : null, skid, right, width: wheel.radius * 0.6 };
    });
  }
}
