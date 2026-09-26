import * as THREE from 'three';
import { cuttingMatTexture } from './textures.js';
import { brush, cone, cutter, eraser, glueBottle, paintJar, pencil, ruler, screwdriver, scissors, tapeRoll } from './props.js';

export const MAT = { w: 20, d: 14, thickness: 0.04 };

const SUN_OFFSET = new THREE.Vector3(-6, 22, 10); // sun position relative to the centre of its shadow box
const _p = new THREE.Vector3();

/** Table, cutting mat, desk props and the daylight that lights them (Kit and Drive modes). */
export class Desk {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'desk';
    /** Props that become dynamic bodies in Drive (Physics.addProps). */
    this.props = [];

    const table = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0xededed, roughness: 0.92 }));
    table.rotation.x = -Math.PI / 2;
    table.position.y = -MAT.thickness;
    table.receiveShadow = true;

    const side = new THREE.MeshStandardMaterial({ color: 0x1f3557, roughness: 0.8 });
    const top = new THREE.MeshStandardMaterial({ map: cuttingMatTexture(MAT.w, MAT.d), roughness: 0.78 });
    const mat = new THREE.Mesh(new THREE.BoxGeometry(MAT.w, MAT.thickness, MAT.d), [side, side, top, side, side, side]);
    mat.position.y = -MAT.thickness / 2;
    mat.receiveShadow = true;

    this.group.add(table, mat);
    this.#addProps();
    this.#addLights();
  }

  /**
   * Centres the sun's shadow box on `point` (Drive keeps it on the car), snapped to whole shadow-map texels so the
   * shadows of still objects don't shimmer while it moves.
   * @param {THREE.Vector3} point
   */
  followShadows(point) {
    const { sun, sunAxes } = this;
    const cam = sun.shadow.camera;
    const snap = (v, texel) => Math.round(v / texel) * texel;
    _p.copy(sunAxes.z)
      .multiplyScalar(point.dot(sunAxes.z))
      .addScaledVector(sunAxes.x, snap(point.dot(sunAxes.x), (cam.right - cam.left) / sun.shadow.mapSize.x))
      .addScaledVector(sunAxes.y, snap(point.dot(sunAxes.y), (cam.top - cam.bottom) / sun.shadow.mapSize.y));
    sun.target.position.copy(_p);
    sun.position.copy(_p).add(SUN_OFFSET);
  }

  #place(object, x, z, rotationY = 0) {
    const onMat = Math.abs(x) <= MAT.w / 2 && Math.abs(z) <= MAT.d / 2;
    object.position.set(x, onMat ? 0 : -MAT.thickness, z);
    object.rotation.y = rotationY;
    this.group.add(object);
    if (object.userData.collider) this.props.push(object);
  }

  #addProps() {
    // Props lie on the table just past the mat's edges: E is the right edge (x), N the near edge (z).
    const E = MAT.w / 2;
    const N = MAT.d / 2;
    this.#place(ruler(), 0.5, -N - 1.4, 0);
    this.#place(pencil(), -4, -N - 2.1, 0.04);
    this.#place(eraser(), 5.3, -N - 1.9, 0.25);
    const jars = [
      [0xb5121b, E + 1.3, -6.6],
      [0x1b1b1b, E + 2.4, -5.4],
      [0xf2f2f2, E + 1.6, -4.1],
      [0x8a8f96, E + 2.8, -2.9],
      [0xf2b705, E + 1.9, -1.6],
      [0x123a8c, -E - 2.1, 3.7],
      [0x0f5132, -E - 1.5, 5.2],
    ];
    for (const [color, x, z] of jars) this.#place(paintJar(color), x, z);
    this.#place(scissors(), -E - 2.6, -2.6, 0.7);
    this.#place(screwdriver(), -E - 2.4, -6.3, -0.4);
    this.#place(cutter(), E + 2.8, 4, -0.55);
    this.#place(tapeRoll(), -8.3, -N - 1.7);
    this.#place(glueBottle(), 8.4, -N - 1.8);
    this.#place(brush(0xb5121b), E + 1.9, 1.1, 0.12);
    this.#place(brush(0x1b1b1b), E + 2.1, 1.8, -0.08);
    // A slalom of 1:18 cones along the near edge of the mat.
    for (let i = 0; i < 6; i++) this.#place(cone(), -6.25 + i * 2.5, N + 1.4 + (i % 2) * 0.5);
  }

  #addLights() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0xd9d9d9, 0.7);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.copy(SUN_OFFSET);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 15, bottom: -15, near: 1, far: 60 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    this.sun = sun;
    // The shadow camera's axes (it looks from SUN_OFFSET towards the origin), for followShadows' texel snapping.
    const basis = new THREE.Matrix4().lookAt(SUN_OFFSET, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    this.sunAxes = { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };
    basis.extractBasis(this.sunAxes.x, this.sunAxes.y, this.sunAxes.z);
    this.group.add(hemi, sun, sun.target);
  }
}
