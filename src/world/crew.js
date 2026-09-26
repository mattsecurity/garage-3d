import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGLTF } from '../core/loader.js';
import { hairTexture } from './tunnelTextures.js';

// Rigged people (Mixamo-compatible skeletons) posed in code: seated at a console, or standing with arms folded.
const MODELS = { m: 'models/people/engineer.glb' };

const UP = new THREE.Vector3(0, 1, 0);
let hairMap = null;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _p = new THREE.Quaternion();
const _r = new THREE.Quaternion();
const _v = new THREE.Vector3();

/** Bones by Mixamo name, whatever prefix the file uses (mixamorig:, mixamorig, none). */
function boneMap(root) {
  const bones = {};
  root.traverse((o) => {
    if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o;
  });
  return bones;
}

/** Rotates `bone` by a world-space quaternion about its own pivot (children follow). */
function rotateWorld(bone, q) {
  bone.parent.getWorldQuaternion(_p);
  _r.copy(_p).invert().multiply(q).multiply(_p);
  bone.quaternion.premultiply(_r);
  bone.updateMatrixWorld(true);
}

/**
 * Turns `bone` so the segment from it to `child` points along `dir`, given in the person's own space
 * (+Z forward, +Y up, +X to their left). Independent of how the rig's local axes happen to be set up.
 */
export function aim(person, bone, child, dir) {
  if (!bone || !child) return;
  person.updateMatrixWorld(true);
  const from = child.getWorldPosition(_a).sub(bone.getWorldPosition(_b)).normalize();
  const to = _v.copy(dir).normalize().applyQuaternion(person.getWorldQuaternion(_p));
  rotateWorld(bone, _q.setFromUnitVectors(from, to));
}

const v = (x, y, z) => new THREE.Vector3(x, y, z);

// Segment directions per pose, person space. Mirrored for the right side (x → -x).
const POSES = {
  typing: {
    spine: v(0, 1, 0.18),
    chest: v(0, 1, 0.12),
    neck: v(0, 1, 0.2),
    thigh: v(0.12, -0.1, 1),
    shin: v(0.02, -1, 0.12),
    foot: v(0, -0.3, 1),
    arm: v(0.32, -0.72, 0.62),
    forearm: v(-0.12, 0.05, 1),
    hand: v(-0.05, -0.25, 1),
  },
  relaxed: {
    spine: v(0, 1, -0.1),
    chest: v(0, 1, -0.05),
    neck: v(0, 1, 0.12),
    thigh: v(0.16, -0.02, 1),
    shin: v(0.05, -1, 0.35),
    foot: v(0, -0.25, 1),
    arm: v(0.42, -0.9, 0.12),
    forearm: v(0.05, -0.15, 1),
    hand: v(0, -0.3, 1),
  },
  standing: {
    spine: v(0, 1, 0.02),
    chest: v(0, 1, 0),
    neck: v(0, 1, 0.08),
    thigh: v(0.06, -1, 0.02),
    shin: v(0.03, -1, -0.02),
    foot: v(0, -0.35, 1),
    arm: v(0.18, -1, 0.22),
    forearm: v(-0.85, 0.28, 0.45), // folded across the chest
    hand: v(-0.9, 0.1, 0.2),
  },
};

function pose(person, bones, name) {
  const p = POSES[name];
  aim(person, bones.Spine, bones.Spine1, p.spine);
  aim(person, bones.Spine1, bones.Spine2, p.chest);
  aim(person, bones.Neck, bones.Head, p.neck);
  for (const [side, s] of [
    ['Left', 1],
    ['Right', -1],
  ]) {
    const m = (d) => v(d.x * s, d.y, d.z);
    aim(person, bones[`${side}UpLeg`], bones[`${side}Leg`], m(p.thigh));
    aim(person, bones[`${side}Leg`], bones[`${side}Foot`], m(p.shin));
    aim(person, bones[`${side}Foot`], bones[`${side}ToeBase`], m(p.foot));
    aim(person, bones[`${side}Arm`], bones[`${side}ForeArm`], m(p.arm));
    // Folded arms: the right forearm sits a little higher so the two don't intersect.
    const forearm = name === 'standing' && s < 0 ? v(p.forearm.x, p.forearm.y + 0.22, p.forearm.z + 0.05) : p.forearm;
    aim(person, bones[`${side}ForeArm`], bones[`${side}Hand`], m(forearm));
    aim(person, bones[`${side}Hand`], bones[`${side}HandMiddle1`], m(p.hand));
  }
}

/** Where the skull is: centre and radius, in world space, from the head bones. */
function skull(bones) {
  const head = bones.Head.getWorldPosition(new THREE.Vector3());
  const top = (bones.HeadTop_End ?? bones.Head).getWorldPosition(new THREE.Vector3());
  const height = Math.max(top.distanceTo(head), 0.18);
  return { centre: head.lerp(top, 0.55), radius: height * 0.47 };
}

/**
 * Short hair that fits the skull exactly: the head mesh again, a few millimetres proud of the scalp, cut away below a
 * hairline (high on the forehead, low at the nape, clear of the ears). Heights are in the avatar's bind pose.
 */
function hair(person, color) {
  let head = null;
  person.traverse((o) => {
    if (o.isSkinnedMesh && /head/i.test(o.name)) head = o;
  });
  if (!head) return;
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.85, map: (hairMap ??= hairTexture()) });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;\ntransformed += normal * 0.0045;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind;').replace(
      'void main() {',
      `void main() {
        float front = smoothstep(-0.02, 0.09, vBind.z);
        float line = mix(1.615, 1.795, front);
        float ears = smoothstep(0.06, 0.095, abs(vBind.x)) * smoothstep(-0.06, 0.0, vBind.z);
        line = mix(line, max(line, 1.725), ears);
        if (vBind.y < line) discard;`,
    );
  };
  material.customProgramCacheKey = () => 'crew-hair-v1';
  const shell = new THREE.SkinnedMesh(head.geometry, material);
  shell.bind(head.skeleton, head.bindMatrix);
  shell.frustumCulled = false;
  head.parent.add(shell);
}

/** Over-ear headset with a boom mic, parented to the head so it follows every glance. */
function headset(person, bones) {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.45, metalness: 0.3 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.009, 8, 32, Math.PI), black);
  band.rotation.y = Math.PI / 2;
  g.add(band);
  for (const s of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 20).rotateZ(Math.PI / 2), black);
    cup.position.set(s * 0.093, -0.012, 0);
    g.add(cup);
  }
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.14, 6).rotateX(Math.PI / 2), black);
  boom.position.set(0.1, -0.06, 0.06);
  boom.rotation.y = -0.35;
  g.add(boom);
  // Place it in person space around the skull, then hand it to the head bone.
  person.updateMatrixWorld(true);
  const { centre, radius } = skull(bones);
  g.position.copy(centre).addScaledVector(UP, radius * 0.1);
  g.quaternion.copy(person.getWorldQuaternion(_q));
  g.scale.setScalar(radius / 0.092); // the band above is drawn for a 9 cm skull
  person.parent.add(g);
  g.updateMatrixWorld(true);
  bones.Head.attach(g);
}

/**
 * Loads the crew and places them. Each spot: {model: 'm', pose, position: [x, y, z] of the feet / seat base,
 * yaw (rad, 0 = facing +Z), seatHeight (seated poses), scale, tint (jacket), trousers, hair (colour), beard,
 * headset, look: 'car' to watch the car more often}.
 */
export class Crew {
  constructor(parent, spots) {
    this.parent = parent;
    this.spots = spots;
    this.people = [];
    this.ready = this.#load().catch((err) => console.warn('Control room crew not loaded', err));
  }

  async #load() {
    const base = import.meta.env.BASE_URL;
    const sources = Object.fromEntries(
      await Promise.all(Object.entries(MODELS).map(async ([key, file]) => [key, (await loadGLTF(`${base}${file}`)).scene])),
    );
    this.spots.forEach((spot, i) => this.#place(sources[spot.model], spot, i));
  }

  #place(source, spot, index) {
    const person = cloneSkinned(source);
    const holder = new THREE.Group();
    holder.add(person);
    this.parent.add(holder);
    holder.rotation.y = spot.yaw ?? 0;
    holder.position.set(...spot.position);
    person.scale.multiplyScalar(spot.scale ?? 1);
    holder.updateMatrixWorld(true);
    const bones = boneMap(person);
    person.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false; // bounds come from the bind pose, not this one
      o.castShadow = false;
      const m = (o.material = o.material.clone());
      // Skin and cloth: no metal (the source files ship metallic maps that turn them into shiny plastic).
      m.metalness = 0;
      m.metalnessMap = null;
      m.roughness = Math.max(m.roughness, 0.75);
      if (spot.tint && /outfit_top/i.test(m.name)) m.color.set(spot.tint);
      if (/outfit_bottom/i.test(m.name)) m.color.set(spot.trousers ?? 0x2e3036);
      if (spot.beard === false && /beard/i.test(m.name)) o.visible = false;
    });
    pose(holder, bones, spot.pose);
    // Stand on the floor, or sit on the seat.
    holder.updateMatrixWorld(true);
    const lowest = Math.min(...['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'].filter((n) => bones[n]).map((n) => bones[n].getWorldPosition(_a).y));
    if (spot.pose === 'standing') person.position.y += spot.position[1] + 0.03 - lowest;
    else {
      const hips = bones.Hips.getWorldPosition(_a).y;
      person.position.y += spot.position[1] + spot.seatHeight + 0.09 - hips;
    }
    holder.updateMatrixWorld(true);
    if (spot.hair) hair(person, spot.hair);
    if (spot.headset) headset(holder, bones);

    // Rest pose of the bones we animate, so the idle motion is always an offset from it.
    const rest = {};
    for (const name of ['Spine2', 'Neck', 'Head', 'LeftHand', 'RightHand'])
      if (bones[name]) rest[name] = bones[name].quaternion.clone();
    this.people.push({
      holder,
      bones,
      rest,
      spot,
      phase: index * 1.7,
      look: new THREE.Vector2(), // current head yaw / pitch
      target: new THREE.Vector2(),
      nextGlance: 1 + index,
    });
  }

  /**
   * Idle motion: breathing, typing, and glances between the car (world point `car`) and the screens.
   * @param {number} dt seconds
   * @param {number} t elapsed seconds
   * @param {THREE.Vector3} car
   */
  update(dt, t, car) {
    for (const p of this.people) {
      const { bones, rest, holder, spot } = p;
      for (const [name, q] of Object.entries(rest)) bones[name].quaternion.copy(q);
      // Breathing.
      rotateWorld(bones.Spine2, _q.setFromAxisAngle(_a.set(1, 0, 0).applyQuaternion(holder.quaternion), Math.sin(t * 1.4 + p.phase) * 0.015));
      // Typing: small, quick, out-of-phase wrist movements.
      if (spot.pose === 'typing')
        for (const [side, k] of [
          ['LeftHand', 0],
          ['RightHand', 2.1],
        ])
          if (bones[side]) rotateWorld(bones[side], _q.setFromAxisAngle(_a.set(0, 0, 1).applyQuaternion(holder.quaternion), Math.max(0, Math.sin(t * 9 + k + p.phase)) * 0.06));
      // Glances: now the car, now the screen in front, now somewhere between.
      p.nextGlance -= dt;
      if (p.nextGlance <= 0) {
        p.nextGlance = 2.5 + Math.random() * 5;
        const atCar = Math.random() < (spot.look === 'car' ? 0.7 : 0.4);
        if (atCar) {
          holder.worldToLocal(_b.copy(car));
          _b.sub(_a.set(0, 1.4, 0));
          p.target.set(Math.atan2(_b.x, _b.z), Math.atan2(_b.y, Math.hypot(_b.x, _b.z)));
        } else p.target.set((Math.random() - 0.5) * 0.5, -0.25 + Math.random() * 0.15);
        p.target.x = THREE.MathUtils.clamp(p.target.x, -1.1, 1.1);
        p.target.y = THREE.MathUtils.clamp(p.target.y, -0.5, 0.35);
      }
      const k = 1 - Math.exp(-4 * dt);
      p.look.lerp(p.target, k);
      const yaw = _q.setFromAxisAngle(_a.copy(UP), p.look.x * 0.6);
      rotateWorld(bones.Neck, yaw);
      rotateWorld(bones.Head, _q.setFromAxisAngle(_a.copy(UP), p.look.x * 0.4));
      rotateWorld(bones.Head, _q.setFromAxisAngle(_a.set(1, 0, 0).applyAxisAngle(UP, holder.rotation.y + p.look.x), -p.look.y));
    }
  }
}

