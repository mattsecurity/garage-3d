import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { radialTexture } from './textures.js';

const CUBES = 280;
const STREAKS = 90;
const SPAN = 9; // particles flow from nose (-Z) to tail (+Z) between -SPAN and +SPAN, then wrap
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const side = () => (Math.random() < 0.5 ? -1 : 1);

/** Black showroom: mirror floor fading into the dark, spotlights, drifting cubes and air streaks. */
export class Studio {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'studio';
    this.group.visible = false;

    const floor = new THREE.CircleGeometry(30, 64);
    const mirror = new Reflector(floor, { textureWidth: 1024, textureHeight: 1024, color: 0x7f7f7f, clipBias: 0.003 });
    mirror.rotation.x = -Math.PI / 2;
    const veil = new THREE.Mesh(floor, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, alphaMap: radialTexture(), depthWrite: false }));
    veil.rotation.x = -Math.PI / 2;
    veil.position.y = 0.003;
    this.group.add(mirror, veil);

    this.#addLights();
    this.#addCubes();
    this.#addStreaks();
    this.update(0);
  }

  #addLights() {
    const key = new THREE.SpotLight(0xffffff, 260, 30, 0.55, 0.9, 2);
    key.position.set(0, 9, 1.5);
    const rimLeft = new THREE.SpotLight(0xdfe8ff, 140, 30, 0.5, 1, 2);
    rimLeft.position.set(-8, 3, -6);
    const rimRight = new THREE.SpotLight(0xdfe8ff, 140, 30, 0.5, 1, 2);
    rimRight.position.set(8, 3, -6);
    const fill = new THREE.SpotLight(0xffffff, 50, 30, 0.7, 1, 2);
    fill.position.set(0, 2.5, 9);
    for (const light of [key, rimLeft, rimRight, fill]) this.group.add(light, light.target);
  }

  #addCubes() {
    const material = new THREE.MeshStandardMaterial({ color: 0x8c9096, metalness: 0.7, roughness: 0.35 });
    this.cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, CUBES);
    this.cubeData = Array.from({ length: CUBES }, () => ({
      x: side() * (1.5 + Math.random() * 5.5),
      y: 0.1 + Math.random() * 2.8,
      z: (Math.random() * 2 - 1) * SPAN,
      speed: 0.5 + Math.random() * 2,
      spin: [Math.random() * 2, Math.random() * 2],
      size: 0.03 + Math.random() * 0.07,
      rotation: new THREE.Euler(Math.random() * 3, Math.random() * 3, 0),
    }));
    this.group.add(this.cubes);
  }

  #addStreaks() {
    this.streakData = Array.from({ length: STREAKS }, () => ({
      x: side() * (1.25 + Math.random() * 2.2),
      y: 0.15 + Math.random() * 1.6,
      z: (Math.random() * 2 - 1) * SPAN,
      length: 0.8 + Math.random() * 2.2,
      speed: 6 + Math.random() * 8,
    }));
    const colors = new Float32Array(STREAKS * 6);
    for (let i = 0; i < STREAKS; i++) colors.set([0.75, 0.75, 0.75, 0, 0, 0], i * 6); // bright head, dark tail
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.streaks = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.streaks.frustumCulled = false;
    this.group.add(this.streaks);
  }

  update(dt) {
    this.cubeData.forEach((c, i) => {
      c.z += c.speed * dt;
      if (c.z > SPAN) c.z -= 2 * SPAN;
      c.rotation.x += c.spin[0] * dt;
      c.rotation.y += c.spin[1] * dt;
      const fade = Math.max(0, Math.min(1, (SPAN - Math.abs(c.z)) / 2)); // shrink at the ends so wrapping is invisible
      _m.compose(_p.set(c.x, c.y, c.z), _q.setFromEuler(c.rotation), _s.setScalar(c.size * fade));
      this.cubes.setMatrixAt(i, _m);
    });
    this.cubes.instanceMatrix.needsUpdate = true;
    const position = this.streaks.geometry.attributes.position;
    this.streakData.forEach((s, i) => {
      s.z += s.speed * dt;
      if (s.z > SPAN + 1) s.z -= 2 * SPAN + 2;
      position.setXYZ(i * 2, s.x, s.y, s.z);
      position.setXYZ(i * 2 + 1, s.x, s.y, s.z - s.length);
    });
    position.needsUpdate = true;
  }
}
