import { describe, it, expect } from 'vitest';
import { mapInput } from '../src/input/controls.js';

describe('mapInput', () => {
  it('is neutral with nothing pressed', () => expect(mapInput({})).toEqual({ throttle: 0, steer: 0, handbrake: false }));

  it('maps keys', () => {
    expect(mapInput({ forward: true, left: true })).toEqual({ throttle: 1, steer: 1, handbrake: false });
    expect(mapInput({ backward: true, right: true, handbrake: true })).toEqual({ throttle: -1, steer: -1, handbrake: true });
  });

  it('opposite keys cancel out', () => expect(mapInput({ left: true, right: true }).steer).toBe(0));

  it('joystick up is full throttle', () => expect(mapInput({}, { x: 0, y: -1 }).throttle).toBeCloseTo(1));

  it('joystick right steers right', () => expect(mapInput({}, { x: 1, y: 0 }).steer).toBeCloseTo(-1));

  it('ignores the joystick inside the dead zone', () => {
    const r = mapInput({}, { x: 0.05, y: -0.1 });
    expect(r.throttle).toBe(0);
    expect(r.steer).toBe(0);
  });

  it('the Drift button pulls the handbrake', () => expect(mapInput({}, { x: 0, y: 0, handbrake: true }).handbrake).toBe(true));

  it('clamps keys + joystick together', () => expect(mapInput({ forward: true }, { x: 0, y: -1 }).throttle).toBe(1));
});
