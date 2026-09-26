import * as THREE from 'three';
import { impulseResponse } from './reverb.js';

// Modal synthesis: a hit rings each material's resonant modes, each decaying at its own rate, after a short click.
// hz / decay (s) / level per mode; click: level of the contact noise, clickHz: its brightness.
const MATERIALS = {
  tin: {
    modes: [[410, 0.35, 1], [980, 0.25, 0.7], [1720, 0.18, 0.5], [2650, 0.12, 0.35], [3900, 0.08, 0.25]],
    click: 0.4,
    clickHz: 6000,
    level: 0.9,
  },
  steel: {
    modes: [[1250, 0.6, 1], [2890, 0.4, 0.6], [4700, 0.25, 0.4], [6900, 0.15, 0.25]],
    click: 0.3,
    clickHz: 9000,
    level: 0.55,
  },
  plastic: { modes: [[520, 0.06, 1], [1180, 0.04, 0.6], [2300, 0.03, 0.35]], click: 0.6, clickHz: 5000, level: 0.8 },
  wood: { modes: [[950, 0.04, 1], [2100, 0.025, 0.5], [3600, 0.015, 0.3]], click: 0.5, clickHz: 7000, level: 0.6 },
  rubber: { modes: [[180, 0.05, 1], [420, 0.03, 0.4]], click: 0.15, clickHz: 1200, level: 0.7 },
  card: { modes: [[260, 0.05, 1], [700, 0.03, 0.5], [1500, 0.02, 0.3]], click: 0.3, clickHz: 2500, level: 0.7 },
  body: {
    modes: [[95, 0.12, 1], [210, 0.08, 0.7], [480, 0.05, 0.45], [1100, 0.03, 0.3]],
    click: 0.5,
    clickHz: 3000,
    level: 1,
  },
};
const VARIANTS = 3;
const MAX_VOICES = 10;
const _v = new THREE.Vector3();

/** @param {BaseAudioContext} ctx */
function renderHit(ctx, { modes, click, clickHz }) {
  const sr = ctx.sampleRate;
  const length = Math.max(...modes.map(([, decay]) => decay)) * 5 + 0.03;
  const buffer = ctx.createBuffer(1, Math.ceil(length * sr), sr);
  const data = buffer.getChannelData(0);
  const detune = () => 1 + (Math.random() - 0.5) * 0.12;
  for (const [hz, decay, level] of modes) {
    const w = (2 * Math.PI * hz * detune()) / sr;
    const phase = Math.random() * Math.PI * 2;
    const d = decay * detune();
    for (let i = 0; i < data.length; i++) data[i] += Math.sin(w * i + phase) * level * Math.exp(-i / (d * sr));
  }
  // Contact click: a few ms of low-passed noise.
  const a = 1 - Math.exp((-2 * Math.PI * clickHz) / sr);
  let lp = 0;
  for (let i = 0; i < 0.004 * sr; i++) {
    lp += a * (Math.random() * 2 - 1 - lp);
    data[i] += lp * click * 3 * (1 - i / (0.004 * sr));
  }
  // Soft attack (no click from the sines starting at full level), then normalise.
  const attack = Math.round(0.0008 * sr);
  for (let i = 0; i < attack; i++) data[i] *= i / attack;
  const peak = data.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  for (let i = 0; i < data.length; i++) data[i] *= 0.8 / peak;
  return buffer;
}

/** Knocks, clinks and thuds when the car or the desk props hit something. */
export class Impacts {
  /** @param {import('./AudioEngine.js').AudioEngine} audio */
  constructor(audio) {
    this.audio = audio;
    this.buffers = null;
    this.voices = 0;
    audio.onReady((ctx) => {
      this.buffers = Object.fromEntries(
        Object.entries(MATERIALS).map(([name, m]) => [name, Array.from({ length: VARIANTS }, () => renderHit(ctx, m))]),
      );
      this.out = ctx.createGain();
      const room = ctx.createConvolver();
      room.buffer = impulseResponse(ctx, { seconds: 0.6, damping: 6000 });
      const wet = ctx.createGain();
      wet.gain.value = 0.25;
      this.out.connect(audio.bus('fx'));
      this.out.connect(room).connect(wet).connect(audio.bus('fx'));
    });
  }

  /**
   * @param {{material:string, speed:number, position:THREE.Vector3}} hit relative speed in units/s
   * @param {THREE.Camera} camera
   */
  play(hit, camera) {
    const ctx = this.audio.ctx;
    const variants = this.buffers?.[hit.material] ?? this.buffers?.plastic;
    if (!variants || ctx.state !== 'running' || this.voices >= MAX_VOICES) return;
    const strength = Math.min(Math.max((hit.speed - 1) / 8, 0), 1);
    if (strength <= 0) return;
    const source = ctx.createBufferSource();
    source.buffer = variants[Math.floor(Math.random() * variants.length)];
    source.playbackRate.value = 0.93 + Math.random() * 0.14;
    const gain = ctx.createGain();
    gain.gain.value = strength ** 1.3 * MATERIALS[hit.material in MATERIALS ? hit.material : 'plastic'].level;
    const pan = ctx.createStereoPanner();
    const x = _v.copy(hit.position).project(camera).x;
    pan.pan.value = Number.isFinite(x) ? Math.min(Math.max(x * 0.7, -0.9), 0.9) : 0;
    source.connect(gain).connect(pan).connect(this.out);
    this.voices++;
    source.onended = () => {
      this.voices--;
      pan.disconnect();
    };
    source.start();
  }
}
