import * as THREE from 'three';
import gsap from 'gsap';
import { kitUniforms } from '../cars/CarModel.js';
import { flatOrientation, layoutSprues, packParts } from './packing.js';
import { buildSprue } from './sprue.js';

const SPRUE = { w: 5.6, d: 5.2, pad: 0.35 };
const LIFT = 0.02; // parts float just above the mat

/**
 * Adds to `tl`, at time `at`, a flight of `object` along an arc to `target` ({position, quaternion}).
 * The start pose is read when the flight begins, so it works from wherever the part is.
 */
function addFlight(tl, object, target, at, duration = 1.1) {
  const state = { t: 0 };
  const q1 = target.quaternion.clone();
  let curve = null;
  let q0 = null;
  const begin = () => {
    const a = object.position.clone();
    const b = target.position.clone();
    const lift = 1.6 + a.distanceTo(b) * 0.2;
    curve = new THREE.CubicBezierCurve3(a, a.clone().setY(a.y + lift), b.clone().setY(b.y + lift), b);
    q0 = object.quaternion.clone();
  };
  tl.to(
    state,
    {
      t: 1,
      duration,
      ease: 'power2.inOut',
      onStart: begin,
      onUpdate: () => {
        if (!curve) begin(); // GSAP may render a frame before onStart fires
        curve.getPoint(state.t, object.position);
        object.quaternion.slerpQuaternions(q0, q1, state.t);
      },
    },
    at,
  );
}

/**
 * Lays the current car's parts out on generated sprues and animates between kit and assembled car.
 * Sprues live under the car root, so kit poses are plain car-space poses; keep the car at home while in kit form.
 */
export class Kit {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'kit';
    this.group.visible = false;
    this.material = new THREE.MeshStandardMaterial({ color: kitUniforms.uKitColor.value, roughness: 0.6, transparent: true });
    this.car = null;
    this.slots = new Map();
    /** 'kit' | 'assembled' | 'animating' */
    this.state = 'assembled';
    this.timeline = null;
  }

  build(car) {
    this.#clear();
    this.car = car;
    car.root.add(this.group);
    const items = car.parts.map((part) => {
      const local = {
        min: part.box.min.map((v, i) => v - part.pivot[i]),
        max: part.box.max.map((v, i) => v - part.pivot[i]),
      };
      return { part, local, orient: flatOrientation(local.max.map((v, i) => v - local.min[i])) };
    });
    const size = {
      ...SPRUE,
      w: Math.max(SPRUE.w, ...items.map((it) => it.orient.footprint[0] + 2 * SPRUE.pad)),
      d: Math.max(SPRUE.d, ...items.map((it) => it.orient.footprint[1] + 2 * SPRUE.pad)),
    };
    const { count, placements } = packParts(
      items.map((it, id) => ({ id, w: it.orient.footprint[0], d: it.orient.footprint[1] })),
      size,
    );
    const origins = layoutSprues(count, size, 0.7);
    for (let s = 0; s < count; s++) {
      const sprue = buildSprue(size, placements.filter((p) => p.sprue === s), String.fromCharCode(65 + s), this.material);
      sprue.position.set(origins[s][0], 0, origins[s][1]);
      this.group.add(sprue);
    }
    const box = new THREE.Box3();
    const rotation = new THREE.Matrix4();
    const center = new THREE.Vector3();
    for (const p of placements) {
      const it = items[p.id];
      const q = new THREE.Quaternion().fromArray(it.orient.quaternion);
      box.min.fromArray(it.local.min);
      box.max.fromArray(it.local.max);
      box.applyMatrix4(rotation.makeRotationFromQuaternion(q)).getCenter(center);
      this.slots.set(it.part, {
        position: new THREE.Vector3(origins[p.sprue][0] + p.x - center.x, LIFT - box.min.y, origins[p.sprue][1] + p.z - center.z),
        quaternion: q,
      });
    }
  }

  /** Jumps straight to the kit layout. */
  applyKit() {
    this.#stop();
    for (const [part, slot] of this.slots) {
      part.object.position.copy(slot.position);
      part.object.quaternion.copy(slot.quaternion);
    }
    this.#setOpacity(1);
    this.group.visible = true;
    kitUniforms.uKit.value = 1;
    this.state = 'kit';
  }

  /** Jumps straight to the assembled, painted car. */
  applyAssembled() {
    this.#stop();
    this.car?.resetParts();
    this.group.visible = false;
    kitUniforms.uKit.value = 0;
    this.state = 'assembled';
  }

  /** Kit → car. Resolves when the animation ends. */
  assemble() {
    if (this.state === 'assembled') return Promise.resolve();
    this.#stop();
    this.state = 'animating';
    const tl = (this.timeline = gsap.timeline());
    tl.to(this.#materials(), { opacity: 0, duration: 0.6 }, 0.1);
    this.car.parts.forEach((part, i) => addFlight(tl, part.object, part.assembled, 0.2 + i * 0.08));
    tl.to(kitUniforms.uKit, { value: 0, duration: 0.9, ease: 'power2.inOut' }, '>-0.3');
    return tl.then(() => {
      this.group.visible = false;
      this.state = 'assembled';
      this.timeline = null;
    });
  }

  /** Car → kit. Resolves when the animation ends. */
  disassemble() {
    if (this.state === 'kit') return Promise.resolve();
    this.#stop();
    this.state = 'animating';
    this.#setOpacity(0);
    this.group.visible = true;
    const tl = (this.timeline = gsap.timeline());
    tl.to(kitUniforms.uKit, { value: 1, duration: 0.6, ease: 'power2.inOut' }, 0);
    [...this.car.parts].reverse().forEach((part, i) => addFlight(tl, part.object, this.slots.get(part), 0.3 + i * 0.07));
    tl.to(this.#materials(), { opacity: 1, duration: 0.6 }, '>-0.5');
    return tl.then(() => {
      this.state = 'kit';
      this.timeline = null;
    });
  }

  #materials() {
    const set = new Set();
    this.group.traverse((o) => {
      if (o.material) for (const m of [].concat(o.material)) set.add(m);
    });
    return [...set];
  }

  #setOpacity(value) {
    for (const m of this.#materials()) m.opacity = value;
  }

  #stop() {
    this.timeline?.kill();
    this.timeline = null;
  }

  #clear() {
    this.#stop();
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const m of [].concat(o.material)) {
        if (m === this.material) continue;
        m.map?.dispose();
        m.dispose();
      }
    });
    this.group.clear();
    this.slots.clear();
    this.group.visible = false;
    this.state = 'assembled';
  }
}
