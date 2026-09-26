import * as THREE from 'three';

const MAX_SEGMENTS = 1600;
const MARK_LIFE = 12; // seconds before a skid mark has faded out
const MAX_PUFFS = 220;

/** Ring buffer of tyre-mark quads on the ground, fading with age in the shader. */
class SkidMarks {
  constructor() {
    this.position = new Float32Array(MAX_SEGMENTS * 4 * 3);
    this.birth = new Float32Array(MAX_SEGMENTS * 4).fill(-1);
    this.strength = new Float32Array(MAX_SEGMENTS * 4);
    const index = new Uint32Array(MAX_SEGMENTS * 6);
    for (let i = 0; i < MAX_SEGMENTS; i++) index.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 1, i * 4 + 2, i * 4 + 3], i * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aBirth', new THREE.BufferAttribute(this.birth, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aStrength', new THREE.BufferAttribute(this.strength, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLife: { value: MARK_LIFE }, uColor: { value: new THREE.Color(0x151515) } },
      vertexShader: /* glsl */ `
        attribute float aBirth;
        attribute float aStrength;
        uniform float uTime;
        uniform float uLife;
        varying float vAlpha;
        void main() {
          vAlpha = aBirth < 0.0 ? 0.0 : aStrength * clamp(1.0 - (uTime - aBirth) / uLife, 0.0, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(uColor, vAlpha * 0.5);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.cursor = 0;
    this.last = [];
  }

  add(wheel, point, right, width, strength, time) {
    const prev = this.last[wheel];
    if (!prev) {
      this.last[wheel] = point.clone();
      return;
    }
    const d2 = prev.distanceToSquared(point);
    if (d2 < 0.0025) return; // wait until the wheel has moved 5 cm
    this.last[wheel] = point.clone();
    if (d2 > 1) return; // teleported (reset): start a new trail
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_SEGMENTS;
    const hw = width / 2;
    const corners = [
      [prev.x + right.x * hw, prev.z + right.z * hw],
      [prev.x - right.x * hw, prev.z - right.z * hw],
      [point.x + right.x * hw, point.z + right.z * hw],
      [point.x - right.x * hw, point.z - right.z * hw],
    ];
    corners.forEach(([x, z], k) => {
      const v = i * 4 + k;
      this.position.set([x, 0.006, z], v * 3);
      this.birth[v] = time;
      this.strength[v] = strength;
    });
    const { attributes } = this.mesh.geometry;
    attributes.position.needsUpdate = true;
    attributes.aBirth.needsUpdate = true;
    attributes.aStrength.needsUpdate = true;
  }

  lift(wheel) {
    this.last[wheel] = null;
  }

  clear() {
    this.birth.fill(-1);
    this.last = [];
    this.mesh.geometry.attributes.aBirth.needsUpdate = true;
  }
}

/** Soft grey tyre-smoke puffs rendered as point sprites. */
class Smoke {
  constructor() {
    this.pos = new Float32Array(MAX_PUFFS * 3);
    this.vel = new Float32Array(MAX_PUFFS * 3);
    this.age = new Float32Array(MAX_PUFFS).fill(1e9);
    this.life = new Float32Array(MAX_PUFFS).fill(1);
    this.size = new Float32Array(MAX_PUFFS);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aAge', new THREE.BufferAttribute(this.age, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 800 }, uColor: { value: new THREE.Color(0xdedede) } },
      vertexShader: /* glsl */ `
        attribute float aAge;
        attribute float aLife;
        attribute float aSize;
        uniform float uScale;
        varying float vAlpha;
        void main() {
          float t = clamp(aAge / aLife, 0.0, 1.0);
          vAlpha = aAge < aLife ? (1.0 - t) * smoothstep(0.0, 0.08, t) * 0.4 : 0.0;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (1.0 + 2.5 * t) * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float a = vAlpha * smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
          if (a < 0.003) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.cursor = 0;
  }

  emit(point, strength) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PUFFS;
    const r = () => Math.random() * 2 - 1;
    this.pos.set([point.x + r() * 0.15, 0.15, point.z + r() * 0.15], i * 3);
    this.vel.set([r() * 0.6, 0.6 + Math.random() * 0.8, r() * 0.6], i * 3);
    this.age[i] = 0;
    this.life[i] = 0.9 + Math.random() * 0.9;
    this.size[i] = (0.5 + Math.random() * 0.4) * (0.6 + strength * 0.6);
  }

  update(dt) {
    for (let i = 0; i < MAX_PUFFS; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      this.vel[i * 3] *= 1 - 1.5 * dt;
      this.vel[i * 3 + 1] *= 1 - 0.8 * dt;
      this.vel[i * 3 + 2] *= 1 - 1.5 * dt;
    }
    const { attributes } = this.points.geometry;
    attributes.position.needsUpdate = true;
    attributes.aAge.needsUpdate = true;
    attributes.aLife.needsUpdate = true;
    attributes.aSize.needsUpdate = true;
  }

  clear() {
    this.age.fill(1e9);
    this.points.geometry.attributes.aAge.needsUpdate = true;
  }
}

/** Skid marks + tyre smoke, fed with Physics.wheelStates() every frame while driving. */
export class Effects {
  constructor(scene) {
    this.time = 0;
    this.marks = new SkidMarks();
    this.smoke = new Smoke();
    this.pending = [0, 0, 0, 0];
    scene.add(this.marks.mesh, this.smoke.points);
  }

  feed(states, dt) {
    states.forEach((s, i) => {
      if (s.contact && s.skid > 0.3) this.marks.add(i, s.point, s.right, s.width, s.skid, this.time);
      else this.marks.lift(i);
      if (i < 2 || !s.contact || s.skid <= 0.45) return;
      this.pending[i] += s.skid * 40 * dt;
      while (this.pending[i] >= 1) {
        this.pending[i] -= 1;
        this.smoke.emit(s.point, s.skid);
      }
    });
  }

  update(dt) {
    this.time += dt;
    this.marks.material.uniforms.uTime.value = this.time;
    this.smoke.update(dt);
  }

  clear() {
    this.marks.clear();
    this.smoke.clear();
  }

  /** Keeps smoke sprites the right size: call on resize. */
  setViewport(heightPx, fovDeg) {
    this.smoke.material.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }
}
