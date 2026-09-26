import * as THREE from 'three';
import { cuttingMatTexture } from './textures.js';
import { cutter, eraser, paintJar, pencil, ruler, screwdriver, scissors } from './props.js';

export const MAT = { w: 20, d: 14, thickness: 0.04 };

/** Table, cutting mat, desk props and the daylight that lights them (Kit and Drive modes). */
export class Desk {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'desk';
    /** Props with colliders, for Physics.addProps. */
    this.props = [];

    const table = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: 0xededed, roughness: 0.92 }));
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

  #place(object, x, z, rotationY = 0) {
    object.userData.localBox = new THREE.Box3().setFromObject(object, true);
    object.position.set(x, 0, z);
    object.rotation.y = rotationY;
    this.group.add(object);
    if (object.userData.collider) this.props.push(object);
  }

  #addProps() {
    this.#place(ruler(), 0.5, -8.4, 0);
    this.#place(pencil(), -4, -9.1, 0.04);
    this.#place(eraser(), 5.3, -8.9, 0.25);
    const jars = [
      [0xb5121b, 11.3, -6.6],
      [0x1b1b1b, 12.4, -5.4],
      [0xf2f2f2, 11.6, -4.1],
      [0x8a8f96, 12.8, -2.9],
      [0xf2b705, 11.9, -1.6],
      [0x123a8c, -12.1, 3.7],
      [0x0f5132, -11.5, 5.2],
    ];
    for (const [color, x, z] of jars) this.#place(paintJar(color), x, z);
    this.#place(scissors(), -12.6, -2.6, 0.7);
    this.#place(screwdriver(), -12.4, -6.3, -0.4);
    this.#place(cutter(), 12.8, 4, -0.55);
  }

  #addLights() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0xd9d9d9, 0.7);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-6, 22, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 15, bottom: -15, near: 1, far: 60 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    this.group.add(hemi, sun);
  }
}
