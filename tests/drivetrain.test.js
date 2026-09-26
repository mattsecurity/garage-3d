import { describe, it, expect } from 'vitest';
import { Drivetrain } from '../src/audio/drivetrain.js';
import { ENGINES } from '../src/audio/engines.js';

const DT = 1 / 60;
const MAX = 11;
const input = (speed, throttle, extra = {}) => ({ speed, maxSpeed: MAX, reverseSpeed: 6, throttle, contact: 4, ...extra });

/** Runs `seconds` of frames; `frame(t)` gives the input. Returns every state. */
function run(dt, seconds, frame) {
  const states = [];
  for (let t = 0; t < seconds; t += DT) states.push(dt.update(frame(t), DT));
  return states;
}

function running(profile = ENGINES['ferrari-458']) {
  const d = new Drivetrain(profile);
  d.start();
  run(d, profile.starter.time + 3, () => input(0, 0));
  return d;
}

describe('Drivetrain', () => {
  it('cranks, catches with a flare and settles at idle', () => {
    const p = ENGINES['ferrari-458'];
    const d = new Drivetrain(p);
    d.start();
    const states = run(d, p.starter.time + 4, () => input(0, 0));
    expect(states[0].starter).toBe(1);
    expect(states.some((s) => s.events.some((e) => e.type === 'catch'))).toBe(true);
    expect(Math.max(...states.map((s) => s.rpm))).toBeGreaterThan(p.idle * 1.4);
    const last = states.at(-1);
    expect(last.running).toBe(true);
    expect(last.rpm).toBeGreaterThan(p.idle * 0.95);
    expect(last.rpm).toBeLessThan(p.idle * 1.1);
    expect(last.load).toBeLessThan(0.25);
  });

  it('upshifts through every gear at full throttle without hitting the limiter', () => {
    for (const [id, p] of Object.entries(ENGINES)) {
      const d = running(p);
      const states = run(d, 3, (t) => input(Math.min(9 * t, MAX), 1));
      const gears = states.map((s) => s.gear);
      expect(Math.max(...gears), id).toBe(p.gearbox.gears.length);
      const ups = gears.filter((g, i) => i > 0 && g > gears[i - 1]).length;
      expect(ups, id).toBe(p.gearbox.gears.length - 1);
      expect(Math.max(...states.map((s) => s.rpm)), id).toBeLessThan(p.limiter);
      const top = states.at(-1);
      expect(top.rpm, id).toBeGreaterThan(p.redline * 0.8);
      expect(top.load, id).toBeGreaterThan(0.9);
    }
  });

  it('downshifts with throttle blips when braking hard', () => {
    const d = running();
    run(d, 3, (t) => input(Math.min(9 * t, MAX), 1));
    const states = run(d, 0.4, (t) => input(Math.max(MAX - 24 * t, 0), -1)); // stops short of reversing
    const blips = states.flatMap((s) => s.events).filter((e) => e.type === 'blip');
    expect(blips.length).toBeGreaterThanOrEqual(2);
    expect(states.at(-1).gear).toBeLessThanOrEqual(2);
    expect(Math.max(...states.map((s) => s.overrun))).toBeGreaterThan(0.2);
  });

  it('bounces off the limiter with the wheels in the air', () => {
    const p = ENGINES['ferrari-458'];
    const d = running(p);
    const states = run(d, 2, () => input(0, 1, { contact: 0 }));
    const tail = states.slice(-60);
    const cuts = tail.filter((s, i) => i > 0 && s.cut && !tail[i - 1].cut).length;
    expect(cuts).toBeGreaterThanOrEqual(3);
    expect(Math.max(...tail.map((s) => s.rpm))).toBeLessThan(p.limiter + 500);
    expect(Math.min(...tail.map((s) => s.rpm))).toBeGreaterThan(p.redline * 0.85);
  });

  it('selects reverse', () => {
    const d = running();
    const states = run(d, 1, (t) => input(-Math.min(5 * t, 6), -1));
    expect(states.at(-1).gear).toBe(-1);
    expect(states.at(-1).rpm).toBeGreaterThan(ENGINES['ferrari-458'].idle * 2);
  });

  it('spools the turbo and dumps it on lift-off', () => {
    const d = running(ENGINES['gtr-r35']);
    const on = run(d, 3, (t) => input(Math.min(9 * t, MAX), 1));
    expect(on.at(-1).spool).toBeGreaterThan(0.6);
    const off = run(d, 0.5, () => input(MAX, 0));
    expect(off.flatMap((s) => s.events).some((e) => e.type === 'bov')).toBe(true);
  });

  it('whines electrically when an F1 car deploys', () => {
    const d = running(ENGINES['redbull-rb22']);
    const states = run(d, 2, (t) => input(Math.min(9 * t, MAX), 1));
    expect(states.at(-1).whineAmp).toBeGreaterThan(0.1);
    expect(states.at(-1).whineHz).toBeGreaterThan(2000);
  });

  it('runs down to zero when stopped', () => {
    const d = running();
    d.stop();
    const states = run(d, 1.5, () => input(0, 0));
    expect(states.at(-1).rpm).toBe(0);
    expect(states.at(-1).phase).toBe('off');
  });
});
