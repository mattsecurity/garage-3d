// Physically informed engine and tyre synthesis, one sample at a time. Runs inside the AudioWorklet (engine.worklet.js)
// and in Node tests, so it must not touch any Web Audio API.
//
// Exhaust: every cylinder fires at its crank angle; its exhaust valve then releases a blowdown pulse (steep front,
// sharper with load, varying from cycle to cycle) plus turbulent noise. Pulses reach their bank's collector through
// runners of slightly different lengths, travel down a pipe (a waveguide with a lossy, inverting reflection at the open
// end) and a muffler, and radiate as the derivative of the outlet flow. Intake suction pulses excite the airbox, each
// combustion knocks the block's resonances, and turbo, hybrid and gear whines, pops, the blow-off valve, the starter
// and the tyres are layered on top.

const TAU = Math.PI * 2;
const SPEED_OF_SOUND = 343;
const PULSE_WINDOW = 1 / 3; // exhaust event length: ~240° of the 720° cycle
const INTAKE_FROM = 0.5; // intake stroke: 360–540°
const INTAKE_LEN = 0.25;
const QUIET_AFTER = 0.3; // s of silence before processing is skipped
const RADIATION = 0.28; // share of the differentiated (radiated) flow in the exhaust sound

class Rng {
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  /** uniform in [0, 1) */
  next() {
    let s = this.s;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.s = s >>> 0;
    return this.s / 4294967296;
  }
  /** uniform in [-1, 1) */
  noise() {
    return this.next() * 2 - 1;
  }
  /** roughly normal, σ ≈ 1 */
  gauss() {
    return (this.next() + this.next() + this.next() - 1.5) * 2;
  }
}

class OnePole {
  constructor(hz, sr) {
    this.z = 0;
    this.set(hz, sr);
  }
  set(hz, sr) {
    this.a = 1 - Math.exp((-TAU * Math.min(hz, sr * 0.45)) / sr);
  }
  process(x) {
    return (this.z += this.a * (x - this.z));
  }
}

/** RBJ biquad. */
class Biquad {
  constructor(type, hz, q, sr, gainDb = 0) {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(type, hz, q, sr, gainDb);
  }
  set(type, hz, q, sr, gainDb = 0) {
    const w = (TAU * Math.min(hz, sr * 0.45)) / sr;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lowpass') {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = b0;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
    } else if (type === 'bandpass') {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
    } else {
      // peaking
      const A = 10 ** (gainDb / 40);
      b0 = 1 + alpha * A;
      b1 = -2 * cos;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cos;
      a2 = 1 - alpha / A;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Two-pole resonator ringing at `hz` for about `decay` seconds (modal synthesis). */
class Resonator {
  constructor(hz, decay, sr) {
    const r = Math.exp(-1 / (decay * sr));
    this.c1 = 2 * r * Math.cos((TAU * hz) / sr);
    this.c2 = -r * r;
    this.g = 1 - r;
    this.y1 = this.y2 = 0;
  }
  process(x) {
    const y = this.g * x + this.c1 * this.y1 + this.c2 * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Removes DC and rumble below ~20 Hz. */
class DcBlock {
  constructor(sr) {
    this.r = 1 - (TAU * 20) / sr;
    this.x1 = this.y1 = 0;
  }
  process(x) {
    const y = x - this.x1 + this.r * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
}

/** Random value gliding to a new target every `period` seconds: pitch wander, roughness. */
class Wander {
  constructor(period, sr, rng) {
    this.n = Math.max(1, Math.round(period * sr));
    this.i = 0;
    this.value = 0;
    this.target = 0;
    this.step = 0;
    this.rng = rng;
  }
  next() {
    if (this.i-- <= 0) {
      this.i = this.n;
      this.target = this.rng.noise();
      this.step = (this.target - this.value) / this.n;
    }
    return (this.value += this.step);
  }
}

const pow2Above = (n) => 2 ** Math.ceil(Math.log2(n + 2));

/** Smoothing times (s) of each control parameter. */
const SMOOTH = {
  rpm: 0.012,
  load: 0.01,
  cut: 0.002,
  spool: 0.05,
  overrun: 0.05,
  starter: 0.02,
  whineHz: 0.02,
  whineAmp: 0.05,
  gearHz: 0.02,
  gearAmp: 0.05,
  squeal: 0.04,
  squealHz: 0.1,
  scrub: 0.05,
  roll: 0.08,
  exhaustOpen: 0.1,
  gain: 0.05,
};

export class EngineSynth {
  /** @param {number} sampleRate @param {number} [seed] */
  constructor(sampleRate, seed = 1) {
    this.sr = sampleRate;
    this.rng = new Rng(seed);
    this.target = {
      rpm: 0,
      load: 0,
      cut: 0,
      spool: 0,
      overrun: 0,
      starter: 0,
      whineHz: 0,
      whineAmp: 0,
      gearHz: 0,
      gearAmp: 0,
      squeal: 0,
      squealHz: 900,
      scrub: 0,
      roll: 0,
      exhaustOpen: 0.7,
      gain: 1,
    };
    this.v = { ...this.target };
    this.k = Object.fromEntries(Object.entries(SMOOTH).map(([key, tau]) => [key, 1 - Math.exp(-1 / (tau * sampleRate))]));
    this.p = null;
    this.phase = 0;
    this.quiet = 0;
    this.pops = [];
    this.bov = { age: 1, amp: 0 };
    this.pendingCrackles = [];
    this.mechKick = 0;
    this.whinePhase = 0;
    this.gearPhase = 0;
    this.turboPhase = 0;
    this.starterPhase = 0;
    const sr = sampleRate;
    const rng = this.rng;
    this.tyre = {
      voices: [0, 1].map((i) => ({
        phase: 0,
        ratio: i ? 1.12 : 1,
        amp: i ? 0.7 : 1,
        drift: new Wander(0.14 + i * 0.05, sr, rng),
        jitter: new Wander(0.004, sr, rng),
        rough: new Wander(0.012, sr, rng),
      })),
      band: new Biquad('bandpass', 1100, 3, sr),
      scrub: new OnePole(600, sr),
      roll: new OnePole(250, sr),
      rollBand: new Biquad('bandpass', 1100, 1, sr),
    };
    this.bovFilter = new Biquad('bandpass', 2800, 1.3, sr);
    this.whooshFilter = new Biquad('bandpass', 2000, 1.1, sr);
    this.gearWobble = new Wander(0.05, sr, rng);
    this.turboWobble = new Wander(0.03, sr, rng);
    this.starterBrush = new Biquad('bandpass', 3000, 0.8, sr);
    this.dc = [new DcBlock(sr), new DcBlock(sr)];
    this.turbLP = new OnePole(1500, sr);
  }

  /** @param {object} p an entry of ENGINES */
  setProfile(p) {
    const sr = this.sr;
    this.p = p;
    const n = p.cylinders.length;
    this.scale = 2 / Math.sqrt(n);
    this.cyl = p.cylinders.map((c, i) => ({
      offset: c.angle / 720,
      bank: c.bank,
      // Headers of slightly different lengths (0.25–0.6 ms) colour each cylinder's pulse a little differently.
      runner: Math.round(((0.25 + (0.35 * ((i * 7) % 5)) / 4) * sr) / 1000),
      prev: (this.phase - c.angle / 720 + 1) % 1,
      amp: 0,
      riseSec: 0.0004,
      rise: 0.01,
      turb: 0,
      intake: 0,
    }));
    const { exhaust } = p;
    this.banks = exhaust.pipes.map((length) => {
      const delay = Math.round(((2 * length) / SPEED_OF_SOUND) * sr);
      const chamber = Math.round(((2 * 0.3) / SPEED_OF_SOUND) * sr);
      return {
        collector: new Float32Array(1024),
        pipe: new Float32Array(pow2Above(delay)),
        delay,
        chamberBuf: new Float32Array(pow2Above(chamber)),
        chamber,
        loss: new OnePole(3500, sr),
        muffler: new Biquad('lowpass', exhaust.muffler, 0.6, sr),
        body: exhaust.body ? new Biquad('peaking', exhaust.body[0], exhaust.body[2], sr, exhaust.body[1]) : null,
        dc: new DcBlock(sr),
        prev: 0,
        out: 0,
      };
    });
    this.w = 0;
    this.helmholtz = new Biquad('bandpass', p.intake.airbox, 2.5, sr);
    this.induction = new Biquad('bandpass', 1400, 0.7, sr);
    this.mech = p.mechanical.modes.map((hz, i) => new Resonator(hz, 0.045 - i * 0.01, sr));
    this.valve = new Resonator(5200, 0.003, sr);
    this.target.squealHz = p.squealHz;
    this.v.squealHz = p.squealHz;
    this.blockCount = 0;
  }

  /** @param {Partial<typeof this.target>} params */
  set(params) {
    if (params.starter > 0 && this.target.starter === 0) this.mechKick += 2; // solenoid clunk
    Object.assign(this.target, params);
  }

  /** One-shot sounds: `crack` (upshift), `blip` / `catch` (a pop or two), `bov` (blow-off valve). */
  trigger(event) {
    if (!this.p) return;
    const size = event.size ?? 1;
    if (event.type === 'crack') {
      for (let b = 0; b < this.banks.length; b++) this.#pop(b, 1.6 * size);
      for (let i = 0; i < 3; i++) this.pendingCrackles.push(Math.round((0.01 + this.rng.next() * 0.06) * this.sr));
    } else if (event.type === 'catch') {
      this.#pop(0, 0.8);
      this.mechKick += 2;
    } else if (event.type === 'blip') {
      if (this.rng.next() < this.p.pops) this.#pop(Math.floor(this.rng.next() * this.banks.length), 0.8);
    } else if (event.type === 'bov' && this.p.turbo?.bov) {
      this.bov = { age: 0, amp: this.p.turbo.bov * size };
    }
  }

  #pop(bank, size) {
    if (this.pops.length >= 8) this.pops.shift();
    this.pops.push({ bank, age: 0, amp: size, tau: (0.002 + this.rng.next() * 0.006) * this.sr });
  }

  #fire(c, rpmFraction) {
    const v = this.v;
    const p = this.p;
    const load = v.load;
    if (v.cut < 0.5 && load > 0.06) {
      const spread = p.variability * (1 + 2 * (1 - load));
      // Gas flow, and so the pulse, grows with rpm as well as with load.
      c.amp = (0.2 + 0.8 * load) * (0.2 + 1.1 * rpmFraction) * Math.max(0.2, 1 + this.rng.gauss() * spread);
      c.riseSec = 0.0004 + (0.00012 - 0.0004) * load;
      c.turb = 0.06 + 0.2 * load;
      this.mechKick += c.amp;
    } else {
      // No combustion: the piston only pumps air. Unburnt fuel may go off in the hot exhaust.
      c.amp = 0.4 * (0.3 + 0.9 * rpmFraction);
      c.riseSec = 0.0008;
      c.turb = 0.15;
      const chance = v.overrun * 0.35 + (v.cut > 0.5 && load > 0.3 ? 0.08 * p.pops : 0);
      if (rpmFraction > 0.3 && this.rng.next() < chance) this.#pop(c.bank, 0.4 + 2.2 * this.rng.next() ** 3);
    }
    c.intake = 0.3 + 0.7 * load;
  }

  /** Fills one block of stereo output. */
  process(left, right) {
    const n = left.length;
    const p = this.p;
    const t = this.target;
    const silent =
      !p ||
      (t.rpm < 1 && this.v.rpm < 1 && t.squeal + t.scrub + t.roll + t.whineAmp < 1e-4 && !this.pops.length && this.bov.age > 1);
    if (!p || (silent && this.quiet > QUIET_AFTER * this.sr)) {
      left.fill(0);
      right.fill(0);
      return;
    }
    const sr = this.sr;
    const v = this.v;
    const k = this.k;
    const rng = this.rng;
    const banks = this.banks;
    const cyl = this.cyl;
    const nb = banks.length;
    const { exhaust, intake, mechanical, turbo } = p;
    const radiate = (3 * sr) / 48000;
    const turboMuffle = turbo ? turbo.muffle : 0;

    // Slow-moving filter settings, once per block.
    const open = v.exhaustOpen;
    const muffler = exhaust.muffler * (0.45 + 0.55 * open) * (0.7 + 0.3 * v.load) * (1 - 0.3 * turboMuffle);
    for (const b of banks) b.muffler.set('lowpass', muffler, 0.6, sr);
    this.whooshFilter.set('bandpass', 1200 + 3200 * v.spool, 1.1, sr);
    const squealHz = v.squealHz;
    this.tyre.band.set('bandpass', squealHz * 1.25, 3, sr);

    for (let i = 0; i < n; i++) {
      for (const key in k) v[key] += (t[key] - v[key]) * k[key];
      const rpm = v.rpm;
      const rpmFraction = rpm / p.redline;

      // Crank. The starter drags the engine unevenly: it slows on every compression stroke.
      let dphase = rpm / 120 / sr;
      if (v.starter > 0.01) dphase *= 1 + 0.35 * v.starter * Math.sin(TAU * cyl.length * this.phase);
      this.phase += dphase;
      if (this.phase >= 1) this.phase -= 1;
      const windowSec = rpm > 1 ? (PULSE_WINDOW * 120) / rpm : 1;

      // Cylinders → collectors (scatter-add into the future by each runner's delay).
      let suction = 0;
      let ticks = 0;
      const w = this.w;
      const turbulence = this.turbLP.process(rng.noise()) * 2.5;
      for (let c = 0; c < cyl.length; c++) {
        const cy = cyl[c];
        let local = this.phase - cy.offset;
        if (local < 0) local += 1;
        if (local < cy.prev && rpm > 1) {
          this.#fire(cy, rpmFraction);
          cy.rise = Math.max(cy.riseSec / windowSec, 0.003);
        }
        if ((cy.prev < 0.3 && local >= 0.3) || (cy.prev < 0.8 && local >= 0.8)) ticks += 1;
        cy.prev = local;
        if (local < PULSE_WINDOW && cy.amp > 0) {
          const x = local / PULSE_WINDOW;
          const env = (1 - Math.exp(-x / cy.rise)) * Math.exp(-3.2 * x) * (1 - x);
          const flow = cy.amp * env * (1 + cy.turb * turbulence);
          banks[cy.bank].collector[(w + cy.runner) & 1023] += flow * this.scale;
        } else if (local >= INTAKE_FROM && local < INTAKE_FROM + INTAKE_LEN) {
          const s = Math.sin((Math.PI * (local - INTAKE_FROM)) / INTAKE_LEN);
          suction += s * s * cy.intake;
        }
      }

      // Pops and crackles: bursts of flow straight into the pipe.
      for (let j = this.pendingCrackles.length - 1; j >= 0; j--) {
        if (--this.pendingCrackles[j] <= 0) {
          this.pendingCrackles.splice(j, 1);
          this.#pop(Math.floor(rng.next() * nb), 0.5 + rng.next());
        }
      }
      for (let j = this.pops.length - 1; j >= 0; j--) {
        const pop = this.pops[j];
        const a = pop.amp * Math.exp(-pop.age / pop.tau) * Math.min(pop.age / 12, 1);
        banks[pop.bank].collector[w] += a * (0.55 + 0.9 * rng.noise());
        if (++pop.age > pop.tau * 8) this.pops.splice(j, 1);
      }

      // Exhaust: pipe waveguide, muffler chamber, low-pass, radiation.
      let exL = 0;
      let exR = 0;
      for (let b = 0; b < nb; b++) {
        const bank = banks[b];
        const x = bank.collector[w];
        bank.collector[w] = 0;
        const pipeMask = bank.pipe.length - 1;
        const delayed = bank.pipe[(w - bank.delay) & pipeMask];
        const y = x + exhaust.reflection * bank.loss.process(delayed);
        bank.pipe[w & pipeMask] = y;
        const chamberMask = bank.chamberBuf.length - 1;
        const y2 = y + 0.3 * bank.chamberBuf[(w - bank.chamber) & chamberMask];
        bank.chamberBuf[w & chamberMask] = y2;
        let out = bank.muffler.process(y2);
        if (bank.body) out = bank.body.process(out);
        const rad = (out - bank.prev) * radiate * exhaust.brightness * RADIATION + out;
        bank.prev = out;
        bank.out = bank.dc.process(rad);
        if (b === 0) exL = bank.out;
        else exR = bank.out;
      }
      if (nb === 1) exR = exL;
      this.w = (w + 1) & 1023;
      const exGain = exhaust.level * (0.55 + 0.45 * open) * (1 - 0.35 * turboMuffle);

      // Intake: airbox resonance and induction roar.
      const induct = this.induction.process(rng.noise()) * v.load * rpmFraction * 0.5;
      const intakeOut = (this.helmholtz.process(suction * this.scale) * 4 + induct) * intake.level * (0.3 + 0.7 * rpmFraction) * (1.15 - 0.3 * open);

      // Block and valvetrain.
      const kick = this.mechKick;
      this.mechKick = 0;
      let mech = 0;
      for (const r of this.mech) mech += r.process(kick);
      mech += this.valve.process(ticks * mechanical.valves * (rng.next() + 0.5)) * 0.6;
      mech *= mechanical.level * 6 * (0.3 + 0.7 * Math.min(rpmFraction, 1));

      // Turbo whistle and whoosh, blow-off valve.
      let extra = 0;
      if (turbo && v.spool > 0.001) {
        const hz = (turbo.whistle[0] + (turbo.whistle[1] - turbo.whistle[0]) * v.spool) * (1 + 0.004 * this.turboWobble.next());
        this.turboPhase = (this.turboPhase + hz / sr) % 1;
        const tone = Math.sin(TAU * this.turboPhase) + 0.25 * Math.sin(2 * TAU * this.turboPhase);
        extra += tone * turbo.level * v.spool * v.spool * (0.35 + 0.65 * v.load) * 0.25;
        extra += this.whooshFilter.process(rng.noise()) * turbo.level * v.spool * v.load * 0.9;
      }
      if (this.bov.age < 1) {
        const age = this.bov.age;
        const env = (1 - Math.exp(-age / 0.004)) * Math.exp(-age / 0.18);
        extra += this.bovFilter.process(rng.noise()) * env * this.bov.amp * 1.2;
        this.bov.age += 1 / sr;
      }

      // Electric (MGU-K) and straight-cut gear whines, starter motor.
      if (v.whineAmp > 1e-4) {
        this.whinePhase = (this.whinePhase + v.whineHz / sr) % 2;
        const ph = TAU * this.whinePhase;
        extra += (Math.sin(ph) + 0.3 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph) + 0.08 * Math.sin(1.5 * ph)) * v.whineAmp * 0.3;
      }
      if (v.gearAmp > 1e-4) {
        this.gearPhase = (this.gearPhase + v.gearHz / sr) % 1;
        const ph = TAU * this.gearPhase;
        extra += (Math.sin(ph) + 0.25 * Math.sin(2 * ph)) * (0.85 + 0.15 * this.gearWobble.next()) * v.gearAmp * 0.4;
      }
      if (v.starter > 0.001) {
        this.starterPhase = (this.starterPhase + (rpm / 60) * 144 / sr) % 1;
        const ph = TAU * this.starterPhase;
        const tone = Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.33 * Math.sin(3 * ph);
        extra += (tone * 0.04 + this.starterBrush.process(rng.noise()) * 0.025) * v.starter;
      }

      // Engine mix with a soft saturation (the "grit" of a loud engine and of the microphone).
      const engineMono = (exL + exR) * 0.5 * exGain + intakeOut + mech + extra;
      const width = 0.2 * (exL - exR) * exGain;
      const drive = 1.4;
      let l = Math.tanh((engineMono + width) * drive * p.gain) / drive;
      let r = Math.tanh((engineMono - width) * drive * p.gain) / drive;

      // Tyres: two squealing voices with wandering pitch and stick-slip roughness, scrub and rolling noise.
      if (v.squeal > 1e-4 || v.scrub > 1e-4 || v.roll > 1e-4) {
        let tyre = 0;
        if (v.squeal > 1e-4) {
          for (const voice of this.tyre.voices) {
            const hz = squealHz * voice.ratio * (1 + 0.1 * voice.drift.next() + 0.02 * voice.jitter.next()) * (1 + 0.1 * v.squeal);
            voice.phase = (voice.phase + hz / sr) % 1;
            const ph = TAU * voice.phase;
            const tone = Math.sin(ph) + 0.45 * Math.sin(2 * ph + 0.3) + 0.2 * Math.sin(3 * ph);
            tyre += tone * (0.65 + 0.35 * voice.rough.next()) * voice.amp;
          }
          tyre = (tyre * 0.18 + this.tyre.band.process(rng.noise()) * 0.5) * v.squeal * v.squeal;
        }
        tyre += this.tyre.scrub.process(rng.noise()) * v.scrub * 0.6;
        const hiss = rng.noise();
        tyre += (this.tyre.roll.process(hiss) * 0.5 + this.tyre.rollBand.process(hiss) * 0.04) * v.roll;
        l += tyre;
        r += tyre;
      }

      l = this.dc[0].process(l) * v.gain;
      r = this.dc[1].process(r) * v.gain;
      left[i] = l > 1 ? 1 : l < -1 ? -1 : l;
      right[i] = r > 1 ? 1 : r < -1 ? -1 : r;
    }
    const peak = Math.abs(left[n - 1]) + Math.abs(left[0]);
    this.quiet = silent && peak < 1e-5 ? this.quiet + n : 0;
  }
}
