import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { VEHICLE, driveCommand } from './driving.js';

const WORLD_HALF = { x: 26, z: 18 }; // invisible walls around the desk
const HULL_POINTS = 8000; // vertices sampled for the car's collision hull
const MAX_KICK = 4; // largest speed change (units/s) a wheel can give a prop in one step
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _axle = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _impulse = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const hullCache = new WeakMap();

/**
 * Flat xyz vertex positions of every visible mesh under `root`, in `root`'s own space.
 * @param {THREE.Object3D} root
 * @param {number} maxPoints subsample to about this many points
 * @param {(v: THREE.Vector3) => void} [adjust] tweaks each point in place
 * @returns {Float32Array[]} one array per mesh
 */
function localPoints(root, maxPoints, adjust) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const meshes = [];
  root.traverseVisible((o) => {
    if (o.isMesh && o !== root) meshes.push(o);
  });
  const total = meshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0);
  const stride = Math.max(1, Math.ceil(total / maxPoints));
  return meshes.map((mesh) => {
    _m.multiplyMatrices(_inv, mesh.matrixWorld);
    const pos = mesh.geometry.attributes.position;
    const out = new Float32Array(Math.ceil(pos.count / stride) * 3);
    for (let i = 0, k = 0; i < pos.count; i += stride, k += 3) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
      adjust?.(_v);
      out[k] = _v.x;
      out[k + 1] = _v.y;
      out[k + 2] = _v.z;
    }
    return out;
  });
}

/** Car-space points for the chassis hull: the whole car, flattened underneath so it clears the ground. */
function carHullPoints(car) {
  if (!hullCache.has(car)) {
    const clearance = Math.min(0.12, Math.max(...car.wheels.map((w) => w.radius)) * 0.35);
    const parts = localPoints(car.root, HULL_POINTS, (v) => (v.y = Math.max(v.y, clearance)));
    const all = new Float32Array(parts.reduce((n, a) => n + a.length, 0));
    parts.reduce((offset, a) => (all.set(a, offset), offset + a.length), 0);
    hullCache.set(car, all.length >= 12 ? all : null);
  }
  return hullCache.get(car);
}

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
    this.drifting = false;
    this.rearGrip = 1;
    this.path = { heading: 0, rate: 0 };
    this.props = [];
    this.lastInput = { throttle: 0, steer: 0, handbrake: false };
    this.upsideDown = 0;

    this.ground = this.world.createCollider(RAPIER.ColliderDesc.cuboid(60, 0.5, 60).setTranslation(0, -0.5, 0).setFriction(1));
    const { x: W, z: D } = WORLD_HALF;
    for (const [x, z, hx, hz] of [
      [0, -D, W, 0.5],
      [0, D, W, 0.5],
      [-W, 0, 0.5, D],
      [W, 0, 0.5, D],
    ])
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, 3, hz).setTranslation(x, 3, z).setRestitution(0.3));
  }

  /** Raises a cutting mat of the given size above the table: its top stays at y = 0, the table drops below it. */
  addMat({ w, d, thickness }) {
    this.ground.setTranslation({ x: 0, y: -0.5 - thickness, z: 0 });
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, thickness / 2, d / 2).setTranslation(0, -thickness / 2, 0).setFriction(1));
  }

  /**
   * Makes every desk prop a dynamic body. Its collision shape is the convex hull of each of its meshes (or of all of
   * them together with `hull: 'merged'`), so it tips, rolls and slides like the object it looks like.
   * @param {THREE.Object3D[]} objects props with `userData.collider = {mass, friction?, restitution?, hull?}`
   */
  addProps(objects) {
    for (const object of objects) {
      const info = object.userData.collider;
      if (!info) continue;
      const { position: p, quaternion: q } = object;
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(p.x, p.y, p.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setCcdEnabled(true)
          .setLinearDamping(0.1)
          .setAngularDamping(0.3),
      );
      let hulls = localPoints(object, 4000);
      if (info.hull === 'merged') hulls = [Float32Array.from(hulls.flatMap((a) => [...a]))];
      const colliders = hulls
        .map((points) => RAPIER.ColliderDesc.convexHull(points))
        .filter(Boolean)
        .map((desc) => this.world.createCollider(desc.setFriction(info.friction ?? 0.5).setRestitution(info.restitution ?? 0.2), body));
      // Overlapping hulls (a label around a tin) count their volume twice: close enough for the mass split.
      const volume = colliders.reduce((v, c) => v + c.volume(), 0);
      for (const c of colliders) c.setDensity(info.mass / volume);
      this.props.push({ object, body, home: { position: p.clone(), quaternion: q.clone() } });
    }
  }

  /** Puts knocked-over props back where they started. */
  resetProps() {
    for (const prop of this.props) {
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
        .setCcdEnabled(true)
        .setLinearDamping(0.05)
        .setAngularDamping(0.4)
        .setAdditionalMassProperties(
          m,
          { x: 0, y: VEHICLE.comHeight, z: 0 },
          { x: (m / 12) * (Y * Y + Z * Z), y: (m / 12) * (X * X + Z * Z), z: (m / 12) * (X * X + Y * Y) },
          { w: 1, x: 0, y: 0, z: 0 },
        ),
    );
    // Collide with the car's real shape; a box stands in for models without meshes (tests).
    const hull = carHullPoints(car);
    const halfHeight = Y * 0.22;
    const bottom = Math.max(...car.wheels.map((w) => w.radius)) * 0.9;
    const shape =
      (hull && RAPIER.ColliderDesc.convexHull(hull)) ??
      RAPIER.ColliderDesc.cuboid(X * 0.42, halfHeight, Z * 0.46).setTranslation(0, bottom + halfHeight, 0);
    this.world.createCollider(shape.setDensity(0).setFriction(0.3).setRestitution(0.1), this.body);

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
    this.drifting = false;
    this.rearGrip = 1;
    this.path = { heading: 0, rate: 0 };
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

  /** How fast the ground velocity turns (rad/s, > 0 = left), smoothed over a few steps. */
  #pathRate(h) {
    const v = this.body.linvel();
    if (Math.hypot(v.x, v.z) < 1) return (this.path.rate = 0);
    const heading = Math.atan2(v.x, v.z);
    const turn = Math.atan2(Math.sin(heading - this.path.heading), Math.cos(heading - this.path.heading));
    this.path.heading = heading;
    this.path.rate += (turn / h - this.path.rate) * 0.3;
    return this.path.rate;
  }

  /** Drift angle: between the nose and the ground velocity, in rad, > 0 when sliding towards the car's left. */
  slipAngle() {
    const v = this.body.linvel();
    const q = this.#rotation();
    const forward = _v.set(0, 0, 1).applyQuaternion(q);
    const along = v.x * forward.x + v.z * forward.z;
    const left = _v.set(1, 0, 0).applyQuaternion(q);
    const across = v.x * left.x + v.z * left.z;
    return Math.hypot(along, across) < 1 ? 0 : Math.atan2(across, along);
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
    const state = {
      speed: this.forwardSpeed(),
      slip: this.slipAngle(),
      pathRate: this.#pathRate(h),
      steer: this.steer,
      drifting: this.drifting,
      rearGrip: this.rearGrip,
    };
    const cmd = driveCommand(input, state, h);
    this.steer = cmd.steer;
    this.drifting = cmd.drifting;
    this.rearGrip = cmd.rearGrip;
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
    this.#pushGround(h);
    this.world.step();

    // Flip back automatically after lying on the roof/side for a while.
    const upright = _v.set(0, 1, 0).applyQuaternion(this.#rotation()).y;
    this.upsideDown = upright < 0.3 ? this.upsideDown + h : 0;
    if (this.upsideDown > 1.5) this.resetCar();
  }

  /**
   * Rapier's ray-cast wheels push the chassis but not what they stand on: give a dynamic prop under a tyre the
   * opposite of the suspension load and tyre grip, so a pencil gets squashed and flicked away instead of acting
   * as a fixed bump.
   */
  #pushGround(h) {
    const rotation = this.#rotation();
    for (let i = 0; i < 4; i++) {
      if (!this.vehicle.wheelIsInContact(i)) continue;
      const body = this.vehicle.wheelGroundObject(i)?.parent();
      if (!body?.isDynamic()) continue;
      const n = this.vehicle.wheelContactNormal(i);
      _n.set(n.x, n.y, n.z);
      _axle.set(-1, 0, 0).applyAxisAngle(UP, this.vehicle.wheelSteering(i) ?? 0).applyQuaternion(rotation);
      _fwd.crossVectors(_n, _axle);
      _impulse
        .copy(_n)
        .multiplyScalar(-(this.vehicle.wheelSuspensionForce(i) ?? 0) * h)
        .addScaledVector(_fwd, -(this.vehicle.wheelForwardImpulse(i) ?? 0))
        .addScaledVector(_axle, -(this.vehicle.wheelSideImpulse(i) ?? 0));
      const max = body.mass() * MAX_KICK;
      if (_impulse.length() > max) _impulse.setLength(max);
      body.applyImpulseAtPoint(_impulse, this.vehicle.wheelContactPoint(i), true);
    }
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
      if (prop.body.isSleeping()) continue;
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
      if (rear && (this.drifting || (handbrake && speed > 2))) skid = Math.max(skid, 0.8);
      if (rear && throttle > 0.5 && speed < 4) skid = Math.max(skid, 0.6); // launch wheelspin
      const contact = this.vehicle.wheelIsInContact(i);
      const p = contact ? this.vehicle.wheelContactPoint(i) : null;
      return { contact, point: p ? new THREE.Vector3(p.x, p.y, p.z) : null, skid, right, width: wheel.radius * 0.6 };
    });
  }
}
