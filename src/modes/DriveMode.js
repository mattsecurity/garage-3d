import * as THREE from 'three';
import gsap from 'gsap';
import { HOME_ROTATION, VIEWS, fitView, flyTo } from '../core/camera.js';
import { MAT } from '../world/Desk.js';
import { telemetry } from '../audio/CarSound.js';

const FOLLOW = 0.9; // how much the camera follows the car (1 = fully)
const ORIGIN = new THREE.Vector3();
const _target = new THREE.Vector3();
const _desired = new THREE.Vector3();

/** Hops the car back to its home pose in the centre of the mat. */
function returnToOrigin(root) {
  const from = root.position.clone();
  const q0 = root.quaternion.clone();
  const state = { t: 0 };
  return gsap
    .to(state, {
      t: 1,
      duration: 0.9,
      ease: 'power2.inOut',
      onUpdate: () => {
        root.position.lerpVectors(from, ORIGIN, state.t);
        root.position.y = from.y * (1 - state.t) + Math.sin(Math.PI * state.t) * 1.2;
        root.quaternion.slerpQuaternions(q0, HOME_ROTATION, state.t);
      },
    })
    .then(() => {});
}

function userError(message, cause) {
  const err = new Error(message, { cause });
  err.userMessage = message;
  return err;
}

/** Assembled car driving on the desk with Rapier physics. */
export class DriveMode {
  name = 'drive';

  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this.lookAt = new THREE.Vector3();
  }

  async #physics() {
    if (!this.ctx.physics) {
      try {
        // Loaded on first drive: Rapier's WebAssembly is the biggest dependency.
        const { Physics } = await import('../physics/Physics.js');
        const physics = await Physics.create();
        physics.addMat(MAT);
        physics.addProps(this.ctx.desk.props);
        this.ctx.physics = physics;
      } catch (err) {
        throw userError('Guida non disponibile su questo dispositivo', err);
      }
    }
    return this.ctx.physics;
  }

  async enter() {
    const { camera, controls, kit, car, keyboard, joystick, sound } = this.ctx;
    if (car.wheels.length !== 4) throw userError('Questo modello non si può guidare');
    const physics = await this.#physics();
    sound.car.setCar(car.entry.id);
    controls.enabled = false;
    this.lookAt.copy(controls.target);
    const fly = flyTo(camera, this.lookAt, VIEWS.drive, 1.2);
    await kit.assemble();
    await fly;
    physics.setCar(car);
    sound.car.start();
    keyboard.enabled = true;
    keyboard.onReset = () => physics.resetCar();
    joystick.setVisible(true);
    this.active = true;
  }

  async exit() {
    const { physics, car, keyboard, joystick, controls, effects, sound } = this.ctx;
    this.active = false;
    sound.car.stop();
    keyboard.enabled = false;
    joystick.setVisible(false);
    physics.removeCar();
    physics.resetProps();
    effects.clear();
    car.resetParts();
    await returnToOrigin(car.root);
    this.ctx.desk.followShadows(ORIGIN);
    controls.target.copy(this.lookAt);
  }

  update(dt) {
    if (!this.active) return;
    const { physics, keyboard, joystick, camera, car, effects } = this.ctx;
    physics.step(dt, keyboard.read(joystick.value));
    physics.sync();
    const wheels = physics.wheelStates();
    effects.feed(wheels, dt);
    this.ctx.sound.car.drive(telemetry(physics, wheels));
    _target.copy(car.root.position).multiplyScalar(FOLLOW).setY(0);
    const k = 1 - Math.exp(-3 * dt);
    this.lookAt.lerp(_target, k);
    _desired.fromArray(fitView(VIEWS.drive, camera.aspect).position).add(this.lookAt);
    camera.position.lerp(_desired, k);
    camera.lookAt(this.lookAt);
    this.ctx.desk.followShadows(this.lookAt);
  }

  onCarChanged(car) {
    if (car.wheels.length !== 4) throw userError('Questo modello non si può guidare');
    const { physics, kit, keyboard, effects, sound } = this.ctx;
    kit.applyAssembled();
    effects.clear();
    physics.resetProps();
    physics.setCar(car);
    sound.car.setCar(car.entry.id);
    sound.car.start();
    keyboard.onReset = () => physics.resetCar();
  }
}
