import * as THREE from 'three';
import { isSolid, sampleScalar, sampleVelocity } from './flow.js';

const MAX = 26000;
const SPACING = 0.016; // metres of flow between two puffs from the same nozzle
const KILL_Z = 9.4;
const MAX_LINK = 0.3; // puffs further apart than this are not joined into a filament
const MODES = 10; // random Fourier modes of the synthetic wake turbulence

/**
 * Divergence-free synthetic turbulence: a sum of plane waves with amplitudes perpendicular to their wave vectors,
 * wavelengths 0.2–1.4 m and a Kolmogorov-like spectrum (amplitude ∝ k^-5/6), scaled to unit RMS.
 */
function turbulenceModes(seed = 7) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const modes = [];
  let norm = 0;
  for (let m = 0; m < MODES; m++) {
    const lambda = 0.2 + 1.2 * (m / (MODES - 1)) ** 1.5;
    const k = (2 * Math.PI) / lambda;
    const dir = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    const amp = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).projectOnPlane(dir).normalize();
    const weight = k ** (-5 / 6);
    norm += weight * weight;
    modes.push({ kx: dir.x * k, ky: dir.y * k, kz: dir.z * k, ax: amp.x * weight, ay: amp.y * weight, az: amp.z * weight, phase: rand() * 6.283, omega: 0.5 + rand() * 2 });
  }
  const scale = Math.sqrt(2 / norm);
  for (const md of modes) {
    md.ax *= scale;
    md.ay *= scale;
    md.az *= scale;
  }
  return modes;
}

const COMMON_VERTEX = /* glsl */ `
  attribute float aStir;
  attribute float aFade;
  varying float vAlpha;
  varying float vLight;
  float light(vec3 p) { return 0.72 + 0.28 * clamp(p.y / 1.8, 0.0, 1.0); }
`;

/**
 * Wind-tunnel smoke: puffs leave the rake's nozzles and ride the solved air flow over the car. Puffs from the same
 * nozzle are joined into a thin filament while the smoke is still coherent; as it is stirred in the wake the filament
 * fades and the puffs swell into soft, thinning clouds.
 */
export class Smoke {
  constructor() {
    this.pos = new Float32Array(MAX * 3);
    this.age = new Float32Array(MAX).fill(-1); // < 0 = free slot
    this.stir = new Float32Array(MAX); // turbulence a puff has been through: swells and thins it
    this.fade = new Float32Array(MAX);
    this.seed = Float32Array.from({ length: MAX }, () => Math.random());
    this.gen = new Uint32Array(MAX); // bumped on every reuse, so stale links are detected
    this.prev = new Int32Array(MAX).fill(-1); // puff emitted just before this one by the same nozzle
    this.prevGen = new Uint32Array(MAX);
    this.free = new Int32Array(MAX);
    this.freeCount = 0;

    const position = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    const stir = new THREE.BufferAttribute(this.stir, 1).setUsage(THREE.DynamicDrawUsage);
    const fade = new THREE.BufferAttribute(this.fade, 1).setUsage(THREE.DynamicDrawUsage);
    const uniforms = { uScale: { value: 800 }, uColor: { value: new THREE.Color(0xeef2f7) } };

    const puffs = new THREE.BufferGeometry();
    puffs.setAttribute('position', position);
    puffs.setAttribute('aStir', stir);
    puffs.setAttribute('aFade', fade);
    puffs.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    this.points = new THREE.Points(
      puffs,
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: /* glsl */ `${COMMON_VERTEX}
          attribute float aSeed;
          uniform float uScale;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = max(0.04 * (1.0 + aStir * 6.0) * (0.85 + 0.3 * aSeed) * uScale / -mv.z, 1.5);
            // A faint halo around the filament at first, then soft clouds that thin as they spread.
            vAlpha = aFade * (0.1 + 0.38 * min(aStir * 6.0, 1.0)) / (1.0 + aStir * 6.0);
            vLight = light(position);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying float vAlpha;
          varying float vLight;
          void main() {
            vec2 d = gl_PointCoord - 0.5;
            float a = vAlpha * exp(-dot(d, d) * 10.0);
            if (a < 0.003) discard;
            gl_FragColor = vec4(uColor * vLight, a);
          }`,
        transparent: true,
        depthWrite: false,
      }),
    );

    const filaments = new THREE.BufferGeometry();
    filaments.setAttribute('position', position);
    filaments.setAttribute('aStir', stir);
    filaments.setAttribute('aFade', fade);
    this.links = new Uint32Array(MAX * 2);
    filaments.setIndex(new THREE.BufferAttribute(this.links, 1).setUsage(THREE.DynamicDrawUsage));
    filaments.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(
      filaments,
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: /* glsl */ `${COMMON_VERTEX}
          void main() {
            vAlpha = aFade * 0.85 / (1.0 + aStir * aStir * 900.0);
            vLight = light(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying float vAlpha;
          varying float vLight;
          void main() { gl_FragColor = vec4(uColor * vLight, vAlpha); }`,
        transparent: true,
        depthWrite: false,
      }),
    );

    this.object = new THREE.Group();
    this.object.add(this.points, this.lines);
    for (const o of [this.points, this.lines]) {
      o.frustumCulled = false;
      o.renderOrder = 2;
    }
    this.uniforms = uniforms;
    this.modes = turbulenceModes();
    this.nozzles = [];
    this.pending = [];
    this.last = [];
    this.grid = null;
    this.time = 0;
    this.emitting = true;
    this._v = [0, 0, 0];
    this.clear();
  }

  /** @param {object|null} grid flow field from buildFlow, or null for free stream */
  setGrid(grid) {
    this.grid = grid;
    this.clear();
  }

  /** @param {Array<number[]>} nozzles tunnel-space nozzle tips [x, y, z] */
  setNozzles(nozzles) {
    this.nozzles = nozzles;
    this.pending = nozzles.map(() => Math.random());
    this.last = nozzles.map(() => -1);
  }

  clear() {
    this.age.fill(-1);
    this.fade.fill(0);
    this.prev.fill(-1);
    for (let i = 0; i < MAX; i++) this.free[i] = MAX - 1 - i;
    this.freeCount = MAX;
    this.last = this.nozzles.map(() => -1);
    this.lines.geometry.setDrawRange(0, 0);
    this.points.geometry.attributes.aFade.needsUpdate = true;
  }

  /** Keeps puff sprites the right size: call on resize. */
  setViewport(heightPx, fovDeg) {
    this.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  #emit(k, x, y, z) {
    if (!this.freeCount) return; // full: skip a puff rather than cut a filament short
    const i = this.free[--this.freeCount];
    this.pos[i * 3] = x + (Math.random() - 0.5) * 0.003;
    this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.003;
    this.pos[i * 3 + 2] = z;
    this.age[i] = 0;
    this.stir[i] = 0;
    this.gen[i]++;
    const p = this.last[k];
    this.prev[i] = p;
    this.prevGen[i] = p >= 0 ? this.gen[p] : 0;
    this.last[k] = i;
  }

  #kill(i) {
    this.age[i] = -1;
    this.fade[i] = 0;
    this.free[this.freeCount++] = i;
  }

  /**
   * @param {number} dt seconds
   * @param {number} speed air speed as drawn, m/s (the real speed slowed down so the smoke can be followed)
   */
  update(dt, speed) {
    if (dt <= 0) return;
    this.time += dt;
    const { pos, age, stir, fade, modes, grid, _v } = this;
    if (this.emitting && speed > 0.05) {
      const rate = speed / SPACING;
      this.nozzles.forEach((n, k) => {
        this.pending[k] += rate * dt;
        const count = Math.floor(this.pending[k]);
        this.pending[k] -= count;
        // Oldest first, spread along the path travelled since leaving the nozzle.
        for (let e = count - 1; e >= 0; e--) this.#emit(k, n[0], n[1], n[2] + (speed * (this.pending[k] + e)) / rate);
      });
    }
    const t = this.time;
    const drift = speed * t; // eddies are carried downstream with the flow
    const sqrtDt = Math.sqrt(dt);
    for (let i = 0; i < MAX; i++) {
      if (age[i] < 0) continue;
      const o = i * 3;
      let x = pos[o];
      let y = pos[o + 1];
      let z = pos[o + 2];
      let wake = 0;
      if (grid) {
        sampleVelocity(grid, x, y, z, _v);
        wake = sampleScalar(grid, grid.wake, x, y, z);
      } else {
        _v[0] = 0;
        _v[1] = 0;
        _v[2] = 1;
      }
      // Separated air behind the car moves slower and churns.
      const mean = speed * (1 - 0.5 * wake);
      let vx = _v[0] * mean;
      let vy = _v[1] * mean;
      let vz = _v[2] * mean;
      if (wake > 0.02) {
        const amp = speed * 0.55 * wake;
        const zz = z - drift;
        let tx = 0;
        let ty = 0;
        let tz = 0;
        for (let m = 0; m < MODES; m++) {
          const md = modes[m];
          const c = Math.cos(md.kx * x + md.ky * y + md.kz * zz + md.phase + md.omega * t);
          tx += md.ax * c;
          ty += md.ay * c;
          tz += md.az * c;
        }
        vx += tx * amp;
        vy += ty * amp;
        vz += tz * amp;
      }
      // Small-scale mixing: a tiny random walk. Kept small so neighbouring puffs stay coherent (eddies do the rest).
      const jitter = (0.0015 + 0.014 * wake) * Math.sqrt(speed + 0.1) * sqrtDt;
      x += vx * dt + (Math.random() - 0.5) * jitter;
      y += vy * dt + (Math.random() - 0.5) * jitter;
      z += vz * dt + (Math.random() - 0.5) * jitter;
      if (y < 0.01) y = 0.01;
      age[i] += dt;
      stir[i] += (wake * 0.9 + 0.006) * dt * (0.4 + speed * 0.15);
      if (z > KILL_Z || Math.abs(x) > 6 || y > 5 || age[i] > 14 || (grid && isSolid(grid, x, y, z))) {
        this.#kill(i);
        continue;
      }
      pos[o] = x;
      pos[o + 1] = y;
      pos[o + 2] = z;
      // Fade in off the nozzle, out into the collector.
      fade[i] = Math.min(1, age[i] * 20) * Math.min(1, (KILL_Z - z) / 2.5);
    }
    // Join each puff to the one its nozzle emitted just before, while they are still close together.
    const { links, gen, prev, prevGen } = this;
    let n = 0;
    const max2 = MAX_LINK * MAX_LINK;
    for (let i = 0; i < MAX; i++) {
      if (age[i] < 0) continue;
      const p = prev[i];
      if (p < 0 || age[p] < 0 || gen[p] !== prevGen[i]) continue;
      const dx = pos[i * 3] - pos[p * 3];
      const dy = pos[i * 3 + 1] - pos[p * 3 + 1];
      const dz = pos[i * 3 + 2] - pos[p * 3 + 2];
      if (dx * dx + dy * dy + dz * dz > max2) continue;
      links[n++] = p;
      links[n++] = i;
    }
    const lineGeometry = this.lines.geometry;
    lineGeometry.index.needsUpdate = true;
    lineGeometry.setDrawRange(0, n);
    const { attributes } = this.points.geometry;
    attributes.position.needsUpdate = true;
    attributes.aStir.needsUpdate = true;
    attributes.aFade.needsUpdate = true;
  }
}
