import { BPM, BEATS_PER_BAR, createComposer } from './composer.js';
import { impulseResponse } from './reverb.js';

const BEAT = 60 / BPM;
const LOOKAHEAD = 0.4; // s of music scheduled ahead of the audio clock
const TICK = 50; // ms between scheduler runs
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** Plays the composer's bars with Web Audio instruments: pads, FM arpeggio, sub bass, soft drums, blips. */
export class StudioMusic {
  /** @param {AudioContext} ctx @param {AudioNode} destination */
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.timer = 0;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = impulseResponse(ctx, { seconds: 3.2, damping: 5000, predelay: 0.03 });
    this.reverb = ctx.createGain();
    this.reverb.connect(reverb).connect(this.out);

    // Ping-pong delay, dotted eighths, darkening with each repeat.
    this.delay = ctx.createGain();
    const left = ctx.createDelay(2);
    const right = ctx.createDelay(2);
    left.delayTime.value = right.delayTime.value = BEAT * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    const merge = ctx.createChannelMerger(2);
    this.delay.connect(left);
    left.connect(right).connect(tone).connect(feedback).connect(left);
    left.connect(merge, 0, 0);
    right.connect(merge, 0, 1);
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.6;
    merge.connect(delayOut).connect(this.out);
    delayOut.connect(this.reverb);

    // Pads through a slowly breathing low-pass; pads and bass duck under the kick.
    this.pad = ctx.createGain();
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 1300;
    padFilter.Q.value = 0.8;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 550;
    lfo.connect(lfoDepth).connect(padFilter.frequency);
    lfo.start();
    this.padDuck = ctx.createGain();
    this.pad.connect(padFilter).connect(this.padDuck).connect(this.out);
    this.padDuck.connect(this.reverb);

    this.arp = ctx.createGain();
    this.arp.connect(this.out);
    const arpSend = ctx.createGain();
    arpSend.gain.value = 0.4;
    this.arp.connect(arpSend).connect(this.delay);
    const arpVerb = ctx.createGain();
    arpVerb.gain.value = 0.3;
    this.arp.connect(arpVerb).connect(this.reverb);

    this.bass = ctx.createGain();
    this.bassDuck = ctx.createGain();
    const bassFilter = ctx.createBiquadFilter();
    bassFilter.type = 'lowpass';
    bassFilter.frequency.value = 320;
    this.bass.connect(bassFilter).connect(this.bassDuck).connect(this.out);

    this.drums = ctx.createGain();
    this.drums.connect(this.out);
    const drumVerb = ctx.createGain();
    drumVerb.gain.value = 0.15;
    this.drums.connect(drumVerb).connect(this.reverb);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  get playing() {
    return this.timer !== 0;
  }

  /** Fades in and keeps scheduling bars until stop(). */
  start() {
    const { ctx } = this;
    clearTimeout(this.stopTimer);
    const t = ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(1, t + 3);
    if (this.timer) return;
    this.composer = createComposer(1 + Math.floor(Math.random() * 1e9));
    this.nextBar = t + 0.1;
    this.timer = setInterval(() => this.#schedule(), TICK);
    this.#schedule();
  }

  /** Fades out, then stops scheduling. */
  stop() {
    const { ctx } = this;
    const t = ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + 1.5);
    clearTimeout(this.stopTimer);
    this.stopTimer = setTimeout(() => {
      clearInterval(this.timer);
      this.timer = 0;
    }, 1700);
  }

  #schedule() {
    this.scheduleUntil(this.ctx.currentTime + LOOKAHEAD);
  }

  /** Schedules every bar that starts before `time` (s on the audio clock); also used to render offline. */
  scheduleUntil(time) {
    const { ctx } = this;
    // After a long pause (a suspended context does not advance, but timers may lag) never schedule in the past.
    if (this.nextBar < ctx.currentTime) this.nextBar = ctx.currentTime + 0.05;
    while (this.nextBar < time) {
      const bar = this.composer.next();
      for (const note of bar.notes) this.#play(note, this.nextBar + note.time * BEAT);
      this.nextBar += BEATS_PER_BAR * BEAT;
    }
  }

  #play(note, t) {
    const d = note.duration * BEAT;
    const v = note.velocity;
    switch (note.voice) {
      case 'pad':
        for (const midi of note.notes) this.#padVoice(hz(midi), t, d);
        break;
      case 'arp':
        this.#pluck(hz(note.notes[0]), t, v);
        break;
      case 'bass':
        this.#bassNote(hz(note.notes[0]), t, d, v);
        break;
      case 'kick':
        this.#kick(t, v);
        break;
      case 'snare':
        this.#snare(t, v);
        break;
      case 'hat':
        this.#hat(t, v);
        break;
      case 'blip':
        this.#blip(hz(note.notes[0]), t, v);
        break;
    }
  }

  #envelope(t, peak, attack, release, end) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(0, end, release);
    return g;
  }

  #osc(type, freq, t, stop, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.start(t);
    o.stop(stop);
    return o;
  }

  /** Two detuned saws and a soft sub-octave triangle, slow attack and release. */
  #padVoice(f, t, d) {
    const end = t + d;
    const env = this.#envelope(t, 0.045, 1.8, 0.9, end);
    env.connect(this.pad);
    for (const detune of [-8, 8]) this.#osc('sawtooth', f, t, end + 5, detune).connect(env);
    const sub = this.ctx.createGain();
    sub.gain.value = 0.6;
    this.#osc('triangle', f / 2, t, end + 5).connect(sub).connect(env);
  }

  /** FM pluck: the modulator's index decays fast, leaving a soft bell-like tone. */
  #pluck(f, t, v) {
    const { ctx } = this;
    const carrier = this.#osc('sine', f, t, t + 1.4);
    const mod = this.#osc('sine', f * 2, t, t + 1.4);
    const index = ctx.createGain();
    index.gain.setValueAtTime(f * 2.2 * v, t);
    index.gain.setTargetAtTime(f * 0.15, t, 0.06);
    mod.connect(index).connect(carrier.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.11 * v, t + 0.004);
    env.gain.setTargetAtTime(0, t + 0.006, 0.14);
    carrier.connect(env).connect(this.arp);
  }

  #bassNote(f, t, d, v) {
    const end = t + d;
    const env = this.#envelope(t, 0.2 * v, 0.02, 0.08, end);
    env.connect(this.bass);
    this.#osc('sine', f, t, end + 0.6).connect(env);
    const body = this.ctx.createGain();
    body.gain.value = 0.25;
    this.#osc('triangle', f, t, end + 0.6).connect(body).connect(env);
  }

  #kick(t, v) {
    const { ctx } = this;
    const o = this.#osc('sine', 120, t, t + 0.6);
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.45 * v, t);
    env.gain.setTargetAtTime(0, t + 0.01, 0.12);
    o.connect(env).connect(this.drums);
    for (const duck of [this.padDuck.gain, this.bassDuck.gain]) {
      duck.setValueAtTime(1, t);
      duck.linearRampToValueAtTime(0.65, t + 0.015);
      duck.setTargetAtTime(1, t + 0.03, 0.15);
    }
  }

  #noise(t, stop) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.start(t, Math.random() * 0.8);
    src.stop(stop);
    return src;
  }

  #hat(t, v) {
    const { ctx } = this;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.13 * v, t);
    env.gain.setTargetAtTime(0, t + 0.002, 0.022);
    this.#noise(t, t + 0.15).connect(hp).connect(env).connect(this.drums);
  }

  /** Soft clap/snare: band of noise plus a short body tone, with more reverb. */
  #snare(t, v) {
    const { ctx } = this;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.9;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.22 * v, t);
    env.gain.setTargetAtTime(0, t + 0.003, 0.07);
    this.#noise(t, t + 0.4).connect(bp).connect(env).connect(this.drums);
    env.connect(this.reverb);
    const bodyEnv = ctx.createGain();
    bodyEnv.gain.setValueAtTime(0.12 * v, t);
    bodyEnv.gain.setTargetAtTime(0, t + 0.002, 0.05);
    this.#osc('sine', 190, t, t + 0.3).connect(bodyEnv).connect(this.drums);
  }

  /** Control-room blip: a short high sine into the delay. */
  #blip(f, t, v) {
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.05 * v, t + 0.003);
    env.gain.setTargetAtTime(0, t + 0.005, 0.06);
    this.#osc('sine', f, t, t + 0.5).connect(env);
    env.connect(this.out);
    env.connect(this.delay);
    env.connect(this.reverb);
  }
}
