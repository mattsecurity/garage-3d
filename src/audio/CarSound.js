import * as THREE from 'three';
import workletUrl from './engine.worklet.js?worker&url';
import { engineFor } from './engines.js';
import { Drivetrain } from './drivetrain.js';
import { impulseResponse } from './reverb.js';
import { VEHICLE } from '../physics/driving.js';

const _v = new THREE.Vector3();
const _nose = new THREE.Vector3();
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/**
 * What the engine and tyre sound needs from one physics frame.
 * @param {{forwardSpeed:()=>number, lastInput:{throttle:number}, drifting:boolean, car:{root:THREE.Object3D}}} physics
 * @param {{contact:boolean, skid:number}[]} wheels Physics.wheelStates()
 */
export function telemetry(physics, wheels) {
  const speed = physics.forwardSpeed();
  const { throttle } = physics.lastInput;
  let contact = 0;
  let skid = 0;
  for (const w of wheels) {
    if (!w.contact) continue;
    contact++;
    skid = Math.max(skid, w.skid);
  }
  const pace = Math.min(Math.abs(speed) / VEHICLE.maxSpeed, 1);
  const launch = throttle > 0.5 && speed >= 0 && speed < 4;
  return {
    speed,
    maxSpeed: VEHICLE.maxSpeed,
    reverseSpeed: VEHICLE.reverseSpeed,
    throttle,
    drifting: physics.drifting,
    wheelspin: physics.drifting ? 0.7 : launch ? 0.5 : 0,
    contact,
    squeal: skid * Math.min(Math.abs(speed) / 3, 1),
    scrub: skid * Math.min(pace * 2, 1) * 0.5,
    roll: pace * (contact / 4),
    position: physics.car.root.position,
    quaternion: physics.car.root.quaternion,
  };
}

/** Engine, tyres and a small room around them: drivetrain on the main thread, synthesis in an AudioWorklet. */
export class CarSound {
  /** @param {import('./AudioEngine.js').AudioEngine} audio */
  constructor(audio) {
    this.audio = audio;
    this.node = null;
    this.carId = null;
    this.profile = null;
    this.drivetrain = null;
    this.data = null;
    this.quietFrames = 0;
    audio.onReady((ctx) => this.#load(ctx).catch((err) => console.warn('Suono del motore non disponibile', err)));
  }

  async #load(ctx) {
    if (!ctx.audioWorklet) return;
    await ctx.audioWorklet.addModule(workletUrl);
    this.node = new AudioWorkletNode(ctx, 'car-engine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    this.node.onprocessorerror = (err) => console.warn('Suono del motore interrotto', err);
    this.panner = ctx.createStereoPanner();
    this.level = ctx.createGain();
    const room = ctx.createConvolver();
    room.buffer = impulseResponse(ctx, { seconds: 0.8, damping: 5000, predelay: 0.012 });
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    const bus = this.audio.bus('car');
    this.node.connect(this.panner).connect(this.level).connect(bus);
    this.level.connect(room).connect(wet).connect(bus);
    if (this.profile) this.#post({ type: 'profile', profile: this.profile });
  }

  #post(message) {
    this.node?.port.postMessage(message);
  }

  /** @param {string} carId */
  setCar(carId) {
    if (carId === this.carId) return;
    this.carId = carId;
    this.profile = engineFor(carId);
    this.drivetrain = new Drivetrain(this.profile);
    this.#post({ type: 'profile', profile: this.profile });
  }

  /** Starter, then idle. */
  start() {
    this.drivetrain?.start();
  }

  /** Switches the engine off (it runs down on its own). */
  stop() {
    this.drivetrain?.stop();
    this.data = null;
  }

  /** @param {ReturnType<typeof telemetry>|null} data latest physics frame while driving */
  drive(data) {
    this.data = data;
  }

  /** Every frame: advances the drivetrain and sends the synth its targets. */
  update(dt, camera) {
    const d = this.drivetrain;
    if (!d) return;
    const t = this.data;
    const state = d.update(t ?? { speed: 0, maxSpeed: 1, reverseSpeed: 1, throttle: 0, contact: 4 }, dt);
    if (!this.node) return;
    if (state.phase === 'off' && !t) {
      if (this.quietFrames++ > 30) return;
    } else this.quietFrames = 0;
    for (const event of state.events) this.#post({ type: 'event', event });
    const params = {
      rpm: state.rpm,
      load: state.load,
      cut: state.cut,
      spool: state.spool,
      overrun: state.overrun,
      starter: state.starter,
      whineHz: state.whineHz,
      whineAmp: state.whineAmp,
      gearHz: state.gearHz,
      gearAmp: state.gearAmp,
      squeal: t?.squeal ?? 0,
      scrub: t?.scrub ?? 0,
      roll: t?.roll ?? 0,
    };
    if (t) {
      // The exhaust sounds open when the tail points at the camera, muffled by the body when the nose does.
      _nose.set(0, 0, 1).applyQuaternion(t.quaternion).setY(0).normalize();
      _v.subVectors(camera.position, t.position).setY(0).normalize();
      params.exhaustOpen = 0.5 - 0.5 * _nose.dot(_v);
      const now = this.node.context.currentTime;
      const pan = clamp(_v.copy(t.position).project(camera).x * 0.7, -0.9, 0.9);
      this.panner.pan.setTargetAtTime(Number.isFinite(pan) ? pan : 0, now, 0.05);
      this.level.gain.setTargetAtTime(clamp(21 / camera.position.distanceTo(t.position), 0.5, 1.3), now, 0.1);
    }
    this.#post({ type: 'params', params });
  }
}
