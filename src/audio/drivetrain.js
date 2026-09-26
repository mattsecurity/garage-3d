// Engine and gearbox behind the sound: turns the car's speed and the player's input into rpm, load, gear changes and
// one-shot events for the synth. Pure (no Web Audio) so it runs in Node tests.

const SHIFT = 0.96; // upshift point at full throttle, as a fraction of redline
const MIN_SHIFT_GAP = 0.12; // s between two gear changes
const COUPLING = 0.05; // s: how fast rpm follows the wheels with the clutch in
const CRANK_RPM = 220;
const LIMITER_CUT = 0.045; // s of fuel cut each time the limiter trips

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const lerp = (a, b, t) => a + (b - a) * t;
const follow = (value, target, tau, dt) => value + (target - value) * (1 - Math.exp(-dt / tau));

/**
 * @typedef {{speed:number, maxSpeed:number, reverseSpeed:number, throttle:number, drifting?:boolean,
 *   wheelspin?:number, contact?:number}} DriveInput
 *   speed: signed forward speed (units/s); throttle in [-1, 1] (< 0 brakes, then reverses); wheelspin 0..1 (rear tyres
 *   spinning faster than the ground); contact: wheels touching the ground
 * @typedef {{phase:string, running:boolean, rpm:number, load:number, cut:number, gear:number, spool:number,
 *   overrun:number, starter:number, whineHz:number, whineAmp:number, gearHz:number, gearAmp:number,
 *   events:{type:'catch'|'crack'|'blip'|'bov', size?:number}[]}} EngineState
 *   load: combustion strength 0..1 (≈0.2 at idle, 0.04 on the overrun); cut: 1 = no ignition (limiter, shift);
 *   gear: -1 reverse, 1..n; overrun: how likely overrun pops are right now
 */
export class Drivetrain {
  /** @param {object} profile an entry of ENGINES */
  constructor(profile) {
    this.p = profile;
    this.phase = 'off';
    this.rpm = 0;
    this.load = 0;
    this.gear = 1;
    this.cut = 0;
    this.spool = 0;
    this.overrun = 0;
    this.flare = 0;
    this.hunt = 0;
    this.huntTarget = 0;
    this.huntTimer = 0;
    this.time = 0;
    this.shiftTimer = 0;
    this.shiftKind = null;
    this.sinceShift = 1;
    this.limiterTimer = 0;
    this.bovCooldown = 0;
    this.events = [];
    this.out = null;
  }

  get gears() {
    return this.p.gearbox.gears;
  }

  /** Cranks the engine with the starter; it catches after `profile.starter.time`. */
  start() {
    this.phase = 'cranking';
    this.time = 0;
    this.gear = 1;
    this.spool = 0;
  }

  /** Cuts the fuel: rpm runs down to zero. */
  stop() {
    if (this.phase !== 'off') this.phase = 'stopping';
  }

  /** rpm with the clutch in, in forward gear `gear`, at speed fraction `s`. */
  gearRpm(gear, s) {
    return (this.p.redline * SHIFT * s) / this.gears[gear - 1];
  }

  /**
   * @param {DriveInput} input
   * @param {number} dt seconds
   * @returns {EngineState}
   */
  update(input, dt) {
    this.events = [];
    dt = Math.min(dt, 0.05);
    if (dt > 0) {
      if (this.phase === 'cranking') this.#crank(dt);
      else if (this.phase === 'running') this.#run(input, dt);
      else if (this.phase === 'stopping') this.#runDown(dt);
    }
    return this.#state(input);
  }

  #crank(dt) {
    const { starter, idle } = this.p;
    this.time += dt;
    const target = starter.type === 'mguk' ? idle * 0.35 : CRANK_RPM;
    this.rpm = follow(this.rpm, target, 0.12, dt);
    this.load = 0.02;
    this.cut = 1;
    if (this.time >= starter.time) {
      this.phase = 'running';
      this.time = 0;
      this.flare = 1;
      this.cut = 0;
      this.events.push({ type: 'catch' });
    }
  }

  #runDown(dt) {
    this.cut = 1;
    this.load = follow(this.load, 0.02, 0.05, dt);
    this.spool = follow(this.spool, 0, 0.2, dt);
    this.rpm = Math.max(0, this.rpm - Math.max(this.rpm * 2.2, 500) * dt);
    if (this.rpm < 80) {
      this.rpm = 0;
      this.phase = 'off';
    }
  }

  #run(input, dt) {
    const p = this.p;
    const R = p.redline;
    const { speed, maxSpeed, reverseSpeed, throttle } = input;
    const contact = input.contact ?? 4;
    const s = Math.max(speed, 0) / maxSpeed;
    const reversing = speed < -0.3 || (throttle < 0 && speed <= 1);
    const braking = throttle < 0 && speed > 1;
    const gas = reversing ? Math.max(-throttle, 0) : Math.max(throttle, 0);
    const airborne = contact === 0;
    this.time += dt;
    this.sinceShift += dt;
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    this.bovCooldown -= dt;

    // Gear selection.
    if (reversing) this.gear = -1;
    else if (this.gear === -1) this.gear = 1;
    if (this.gear >= 1 && !airborne && this.shiftTimer === 0 && this.sinceShift > MIN_SHIFT_GAP) {
      const wheel = this.gearRpm(this.gear, s);
      const upAt = R * (gas > 0.05 ? lerp(0.6, SHIFT, gas) : SHIFT);
      const downAt = R * (braking ? 0.55 : 0.33);
      if (this.gear < this.gears.length && wheel >= upAt) this.#shift(this.gear + 1, 'up', gas, braking);
      else if (this.gear > 1 && wheel < downAt && this.gearRpm(this.gear - 1, s) < R * SHIFT) this.#shift(this.gear - 1, 'down', gas, braking);
    }
    const shifting = this.shiftTimer > 0;
    const blipping = shifting && this.shiftKind === 'blip';

    // Where rpm wants to be.
    this.flare = this.time < 0.3 ? this.flare : this.flare * Math.exp(-dt / 1.2);
    this.huntTimer -= dt;
    if (this.huntTimer <= 0) {
      this.huntTarget = Math.random() * 2 - 1;
      this.huntTimer = 0.25 + Math.random() * 0.5;
    }
    this.hunt = follow(this.hunt, this.huntTarget, 0.3, dt);
    const idle = p.idle * (1 + (p.starter.type === 'mguk' ? 0.3 : 0.8) * this.flare) * (1 + 0.015 * this.hunt);
    let target;
    if (airborne) {
      target = p.idle + gas * (p.limiter + 300 - p.idle);
    } else {
      target = this.gear === -1 ? R * 0.7 * Math.min(Math.max(-speed, 0) / reverseSpeed, 1.1) : this.gearRpm(this.gear, s);
      if (Math.abs(this.gear) === 1 && gas > 0.05) target = Math.max(target, lerp(p.idle * 1.1, R * p.launch, gas)); // clutch slip
      target = Math.max(target, idle); // the clutch opens below idle
      target += (R * 0.97 - target) * clamp(input.wheelspin ?? 0, 0, 1) * 0.55 * gas;
      if (blipping) target *= 1.04;
    }

    // Limiter: cut the fuel for a moment every time it trips, so the revs bounce off it.
    this.limiterTimer -= dt;
    if (this.rpm >= p.limiter) this.limiterTimer = LIMITER_CUT;
    const limiting = this.limiterTimer > 0;
    if (limiting) target = Math.min(target, p.limiter * 0.9);

    // Follow it: stiffly through the drivetrain, at the engine's own rev rate when free.
    const coupled = !airborne && target > idle * 1.01;
    const rise = p.revRate * dt * (coupled ? 1.5 : 1);
    const next = coupled ? follow(this.rpm, target, blipping ? 0.03 : shifting ? p.gearbox.shiftTime / 2 : COUPLING, dt) : target;
    this.rpm = clamp(next, this.rpm - p.revRate * 0.6 * dt * (coupled ? 4 : 1), this.rpm + rise);

    // Combustion strength.
    const prevLoad = this.load;
    let load;
    if (blipping) load = 0.75;
    else if (shifting && this.shiftKind === 'up' && p.gearbox.type === 'manual') load = 0.04; // lift for the clutch
    else if (gas > 0.02) load = 0.2 + 0.8 * gas;
    else if (!airborne && this.rpm > p.idle * 1.25) load = 0.04; // overrun: fuel cut
    else load = 0.18;
    this.load = follow(this.load, load, load > this.load ? 0.03 : 0.06, dt);
    this.cut = limiting || (shifting && this.shiftKind === 'up' && p.gearbox.type !== 'manual') ? 1 : 0;

    // Overrun pops: likely for a second or two after lifting off high in the revs, and after each blip.
    if (prevLoad > 0.5 && load < 0.1 && this.rpm > R * 0.5) this.overrun = 1;
    this.overrun *= Math.exp(-dt / 1.2);

    // Turbo: spools with lag; dumping boost through the blow-off valve when the throttle snaps shut.
    if (p.turbo) {
      const boost = load > 0.3 ? clamp((this.rpm - 0.25 * R) / (0.4 * R), 0, 1) * clamp((load - 0.2) / 0.8, 0, 1) : 0;
      if (p.turbo.bov > 0 && load < 0.15 && prevLoad > 0.5 && this.spool > 0.4 && this.bovCooldown <= 0) {
        this.events.push({ type: 'bov', size: this.spool });
        this.spool *= 0.5;
        this.bovCooldown = 0.5;
      }
      this.spool = follow(this.spool, boost, boost > this.spool ? 0.45 : 0.25, dt);
    }
    this.braking = braking;
    this.gas = gas;
    this.s = s;
  }

  #shift(to, kind, gas, braking) {
    const { type, shiftTime } = this.p.gearbox;
    this.gear = to;
    this.sinceShift = 0;
    if (kind === 'up') {
      this.shiftKind = 'up';
      this.shiftTimer = shiftTime;
      if (gas > 0.7) this.events.push({ type: 'crack', size: type === 'dct' ? 1 : type === 'seamless' ? 0.5 : 0.3 });
    } else if (braking) {
      this.shiftKind = 'blip';
      this.shiftTimer = 0.09;
      this.overrun = Math.max(this.overrun, 0.9);
      this.events.push({ type: 'blip' });
    } else {
      this.shiftKind = 'down';
      this.shiftTimer = shiftTime;
    }
  }

  /** @param {DriveInput} input @returns {EngineState} */
  #state(input) {
    const p = this.p;
    const R = p.redline;
    const cranking = this.phase === 'cranking';
    const running = this.phase === 'running';
    const s = running ? this.s : 0;
    let whineHz = 0;
    let whineAmp = 0;
    if (p.hybrid) {
      whineHz = (p.hybrid.whine * this.rpm) / R;
      if (cranking && p.starter.type === 'mguk') whineAmp = p.hybrid.level * 2.5;
      else if (running) {
        const deploy = this.gas * (0.5 + 0.5 * s);
        const harvest = this.braking ? 0.9 * Math.min(s * 3, 1) : 0;
        whineAmp = p.hybrid.level * Math.max(deploy, harvest);
      }
    }
    let gearHz = 0;
    let gearAmp = 0;
    if (p.gearWhine.teeth && running) {
      gearHz = (this.rpm / 60) * p.gearWhine.teeth;
      const moving = this.gear === -1 ? Math.min(Math.abs(input.speed) * 2, 1) : Math.min(s * 4, 1);
      const boost = this.gear === -1 ? 2.5 : this.gear === 1 ? 1.3 : 1;
      gearAmp = p.gearWhine.level * boost * (0.35 + 0.65 * this.load) * moving;
    }
    return {
      phase: this.phase,
      running,
      rpm: this.rpm,
      load: this.load,
      cut: this.cut,
      gear: this.gear,
      spool: this.spool,
      overrun: running ? this.overrun * p.pops : 0,
      starter: cranking && p.starter.type === 'motor' ? 1 : 0,
      whineHz,
      whineAmp,
      gearHz,
      gearAmp,
      events: this.events,
    };
  }
}
