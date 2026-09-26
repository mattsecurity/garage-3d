import { StudioMusic } from './StudioMusic.js';

const STORAGE_KEY = 'garage3d.music';
const MAX_KMH = 320;
const FAN_BLADES = 12;
const FAN_MAX_RPS = 6.5; // fan revolutions per second at full wind

function noiseBuffer(ctx, seconds, brown) {
  const buffer = ctx.createBuffer(1, Math.floor(seconds * ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = brown ? (last + 0.02 * white) / 1.02 : white;
    data[i] = brown ? last * 3.5 : white;
  }
  return buffer;
}

/** The wind tunnel's own noise: fan tone, airflow and rumble, following the wind speed as the fan spools. */
class TunnelAmbience {
  /** @param {AudioContext} ctx @param {AudioNode} destination */
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);
    const brown = noiseBuffer(ctx, 4, true);
    const white = noiseBuffer(ctx, 4, false);
    const loop = (buffer) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.start(0, Math.random() * 3);
      return src;
    };
    const biquad = (type, frequency, Q = 0.7) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = frequency;
      f.Q.value = Q;
      return f;
    };
    const gain = (value) => {
      const g = ctx.createGain();
      g.gain.value = value;
      return g;
    };

    // Low rumble of the duct, the rush of air across the hall, the fan's blade-pass tone and the hall's hum.
    this.rumbleFilter = biquad('lowpass', 60);
    this.rumble = gain(0);
    loop(brown).connect(this.rumbleFilter).connect(this.rumble).connect(this.out);
    this.airFilter = biquad('bandpass', 500, 0.6);
    this.air = gain(0);
    loop(white).connect(this.airFilter).connect(this.air).connect(this.out);
    this.fan = ctx.createOscillator();
    this.fan.type = 'sawtooth';
    this.fan.frequency.value = 1;
    this.fanGain = gain(0);
    this.fan.connect(biquad('lowpass', 320)).connect(this.fanGain).connect(this.out);
    this.fan.start();
    const hum = ctx.createOscillator();
    hum.frequency.value = 100;
    hum.connect(gain(0.012)).connect(this.out);
    hum.start();
  }

  /** @param {number} kmh @param {number} [tau] spool time constant (s) */
  setWind(kmh, tau = 1.5) {
    const t = this.ctx.currentTime;
    const w = Math.min(Math.max(kmh / MAX_KMH, 0), 1);
    this.rumbleFilter.frequency.setTargetAtTime(60 + 220 * w, t, tau);
    this.rumble.gain.setTargetAtTime(0.08 + 0.55 * w ** 1.5, t, tau);
    this.airFilter.frequency.setTargetAtTime(500 + 1600 * w, t, tau);
    this.air.gain.setTargetAtTime(0.3 * w ** 2, t, tau);
    this.fan.frequency.setTargetAtTime(Math.max(FAN_BLADES * FAN_MAX_RPS * w, 1), t, tau);
    this.fanGain.gain.setTargetAtTime(0.1 * w ** 2, t, tau);
  }

  fade(to, seconds) {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(to, t + seconds);
  }
}

/** Everything heard in Studio: the generative music and the tunnel itself. */
export class StudioSound {
  /** @param {import('./AudioEngine.js').AudioEngine} audio */
  constructor(audio) {
    this.audio = audio;
    this.active = false;
    this.kmh = 0;
    this.music = true;
    try {
      this.music = localStorage.getItem(STORAGE_KEY) !== '0';
    } catch {
      // storage unavailable: music on
    }
    audio.onReady((ctx) => {
      this.player = new StudioMusic(ctx, audio.bus('music'));
      this.tunnel = new TunnelAmbience(ctx, audio.bus('ambience'));
      if (this.active) this.#apply();
    });
  }

  /** Entering Studio. @param {number} kmh wind speed */
  start(kmh) {
    this.active = true;
    this.kmh = kmh;
    this.#apply(true);
  }

  /** Leaving Studio. */
  stop() {
    this.active = false;
    this.#apply();
  }

  /** @param {number} kmh */
  setWind(kmh) {
    this.kmh = kmh;
    if (this.active) this.tunnel?.setWind(kmh);
  }

  /** @param {boolean} on */
  setMusic(on) {
    this.music = on;
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch {
      // storage unavailable: remembered for this visit only
    }
    this.#apply();
  }

  #apply(entering = false) {
    if (!this.player) return;
    if (this.active && this.music) this.player.start();
    else if (this.player.playing) this.player.stop();
    if (this.active) {
      this.tunnel.setWind(this.kmh, entering ? 0.8 : 1.5);
      this.tunnel.fade(1, entering ? 2 : 0.5);
    } else this.tunnel.fade(0, 1);
  }
}
