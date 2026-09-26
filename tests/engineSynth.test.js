import { describe, it, expect } from 'vitest';
import { EngineSynth } from '../src/audio/dsp/engineSynth.js';
import { ENGINES } from '../src/audio/engines.js';

const SR = 48000;

/** Renders `seconds` of steady running and returns the left channel after a settling half second. */
function render(profile, params, seconds = 1.5) {
  const synth = new EngineSynth(SR, 5);
  synth.setProfile(profile);
  synth.set(params);
  synth.v = { ...synth.v, ...synth.target }; // start already at the targets
  const n = Math.floor((seconds * SR) / 128) * 128;
  const out = new Float32Array(n);
  const left = new Float32Array(128);
  const right = new Float32Array(128);
  for (let i = 0; i < n; i += 128) {
    synth.process(left, right);
    out.set(left, i);
  }
  return out.subarray(SR / 2);
}

/** Power at `hz` (Goertzel, Hann window). */
function power(x, hz) {
  const w = (2 * Math.PI * hz) / SR;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < x.length; i++) {
    const s = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / x.length)) + c * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
}

describe('EngineSynth', () => {
  it('stays finite and bounded for every engine, idle to full throttle', () => {
    for (const [id, p] of Object.entries(ENGINES)) {
      for (const [rpm, load] of [
        [p.idle, 0.18],
        [p.redline * 0.95, 1],
        [p.redline * 0.7, 0.04],
      ]) {
        const x = render(p, { rpm, load, overrun: 0.5, spool: 0.8, whineAmp: 0.1, whineHz: 2000, squeal: 1, roll: 1 }, 1);
        let peak = 0;
        let energy = 0;
        for (const v of x) {
          expect(Number.isFinite(v), id).toBe(true);
          peak = Math.max(peak, Math.abs(v));
          energy += v * v;
        }
        expect(peak, id).toBeLessThanOrEqual(1);
        expect(Math.sqrt(energy / x.length), `${id} ${rpm}`).toBeGreaterThan(0.005);
      }
    }
  });

  it('puts its energy on the firing frequency and its harmonics', () => {
    const p = ENGINES['ferrari-458'];
    const rpm = 6000;
    const firing = (rpm / 60 / 2) * p.cylinders.length; // 400 Hz
    const x = render(p, { rpm, load: 1 });
    const onHarmonic = power(x, firing);
    const between = power(x, firing * 1.37);
    expect(onHarmonic).toBeGreaterThan(between * 30);
  });

  it('gives a cross-plane V8 more half-order burble than a flat-plane one', () => {
    const flat = ENGINES['ferrari-458'];
    const cross = { ...flat, cylinders: ENGINES['corvette-c8'].cylinders };
    const rpm = 3000;
    const half = (x) => [0.5, 1.5, 2.5, 3.5].reduce((s, order) => s + power(x, (rpm / 60) * order), 0);
    const burble = (p) => {
      const x = render(p, { rpm, load: 1 });
      return half(x) / power(x, (rpm / 60) * 4);
    };
    expect(burble(cross)).toBeGreaterThan(burble(flat) * 3);
  });

  it('is silent when the engine is off', () => {
    const x = render(ENGINES['mini-cooper-s'], { rpm: 0, load: 0 });
    expect(Math.max(...x.map(Math.abs))).toBeLessThan(1e-6);
  });
});

describe('EngineSynth without a profile', () => {
  it('outputs silence instead of throwing', () => {
    const synth = new EngineSynth(SR);
    const left = new Float32Array(128).fill(1);
    const right = new Float32Array(128).fill(1);
    synth.process(left, right);
    expect(Math.max(...left, ...right)).toBe(0);
  });
});
