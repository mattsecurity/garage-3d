// One AudioContext for the whole site. Browsers only let audio start after a user gesture, so the context is created
// on the first click, tap or key press; it is suspended while the tab is hidden or the sound is muted.

const STORAGE_KEY = 'garage3d.muted';
const BUSES = { car: 0.9, fx: 0.8, music: 0.5, ambience: 0.45 };

function readMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = readMuted();
    this.buses = {};
    this.waiting = [];
    this.suspendTimer = 0;
    const unlock = () => this.unlock();
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'])
      window.addEventListener(type, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => this.#sync());
  }

  /** Creates (first gesture) or resumes the context. */
  unlock() {
    if (!this.ctx) {
      const Context = window.AudioContext ?? window.webkitAudioContext;
      if (!Context) return;
      try {
        this.ctx = new Context({ latencyHint: 'interactive' });
      } catch (err) {
        console.warn('Audio non disponibile', err);
        return;
      }
      this.#build();
      for (const fn of this.waiting.splice(0)) fn(this.ctx);
    }
    this.#sync();
  }

  #build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // Gentle glue, then a limiter-like stage so engines, bangs and music never clip together.
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -14;
    glue.ratio.value = 3;
    glue.knee.value = 8;
    glue.attack.value = 0.01;
    glue.release.value = 0.2;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -2;
    limit.ratio.value = 20;
    limit.knee.value = 0;
    limit.attack.value = 0.002;
    limit.release.value = 0.1;
    this.master.connect(glue).connect(limit).connect(ctx.destination);
    for (const [name, level] of Object.entries(BUSES)) {
      const bus = ctx.createGain();
      bus.gain.value = level;
      bus.connect(this.master);
      this.buses[name] = bus;
    }
  }

  /** Runs `fn(ctx)` once the context exists (now, or after the first gesture). */
  onReady(fn) {
    if (this.ctx) fn(this.ctx);
    else this.waiting.push(fn);
  }

  /** @param {'car'|'fx'|'music'|'ambience'} name */
  bus(name) {
    return this.buses[name];
  }

  setMuted(muted) {
    this.muted = muted;
    try {
      localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // private mode: the choice lasts for this visit only
    }
    this.#sync();
  }

  #sync() {
    const ctx = this.ctx;
    if (!ctx) return;
    const on = !this.muted && !document.hidden;
    const t = ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 1 : 0, t, 0.06);
    clearTimeout(this.suspendTimer);
    if (on) ctx.resume().catch(() => {});
    else this.suspendTimer = setTimeout(() => ctx.suspend().catch(() => {}), 300);
  }
}
