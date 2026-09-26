import { describe, it, expect } from 'vitest';
import { driveCommand, VEHICLE } from '../src/physics/driving.js';

const input = (over = {}) => ({ throttle: 0, steer: 0, handbrake: false, ...over });
const state = (over = {}) => ({ speed: 0, slip: 0, pathRate: 0, steer: 0, drifting: false, rearGrip: 1, ...over });
const dt = 1 / 60;

describe('driveCommand', () => {
  it('drives the rear wheels from rest', () => {
    const c = driveCommand(input({ throttle: 1 }), state(), dt);
    expect(c.rear.engine).toBe(VEHICLE.engineForce / 2);
    expect(c.front.brake).toBe(0);
  });

  it('stops pushing at top speed', () => {
    expect(driveCommand(input({ throttle: 1 }), state({ speed: VEHICLE.maxSpeed }), dt).rear.engine).toBe(0);
  });

  it('brakes instead of reversing while still rolling forward', () => {
    const c = driveCommand(input({ throttle: -1 }), state({ speed: 5 }), dt);
    expect(c.rear.engine).toBe(0);
    expect(c.rear.brake).toBe(VEHICLE.brakeForce);
    expect(c.front.brake).toBe(VEHICLE.brakeForce);
  });

  it('reverses slower than it goes forward', () => {
    const c = driveCommand(input({ throttle: -1 }), state(), dt);
    expect(c.rear.engine).toBeCloseTo((-VEHICLE.engineForce * VEHICLE.reverseFactor) / 2);
  });

  it('applies a light rolling brake with no input', () => {
    const c = driveCommand(input(), state({ speed: 4 }), dt);
    expect(c.front.brake).toBe(VEHICLE.rollingBrake);
    expect(c.rear.brake).toBe(VEHICLE.rollingBrake);
  });

  it('ramps the steering instead of snapping', () => {
    expect(driveCommand(input({ steer: 1 }), state(), 0.1).steer).toBeCloseTo(VEHICLE.steerSpeed * 0.1);
  });

  it('limits the steering angle at speed', () => {
    const c = driveCommand(input({ steer: 1 }), state({ speed: 30, steer: 0.3 }), 0.1);
    expect(c.steer).toBeCloseTo(VEHICLE.maxSteer * (1 - VEHICLE.steerFalloffMax));
  });

  it('keeps full grip and no yaw assist when not drifting', () => {
    const c = driveCommand(input({ throttle: 1, steer: 1 }), state({ speed: 8 }), dt);
    expect(c.drifting).toBe(false);
    expect(c.rear.sideFriction).toBe(1);
    expect(c.yawTarget).toBeNull();
  });
});

describe('drift', () => {
  it('Space at speed starts a drift: the rear lets go while the engine keeps pushing', () => {
    const c = driveCommand(input({ throttle: 1, steer: 1, handbrake: true }), state({ speed: 8 }), dt);
    expect(c.drifting).toBe(true);
    expect(c.rear.engine).toBe(VEHICLE.engineForce / 2);
    expect(c.rear.brake).toBe(0);
    expect(c.rear.sideFriction).toBeLessThan(1);
  });

  it('Space when slow is a plain handbrake', () => {
    const c = driveCommand(input({ throttle: 1, handbrake: true }), state({ speed: 2 }), dt);
    expect(c.drifting).toBe(false);
    expect(c.rear.engine).toBe(0);
    expect(c.rear.brake).toBe(VEHICLE.handbrakeForce);
  });

  it('rear grip drops fast and comes back gradually', () => {
    const lost = driveCommand(input({ handbrake: true }), state({ speed: 8 }), 0.5);
    expect(lost.rearGrip).toBe(VEHICLE.driftSideFriction);
    const back = driveCommand(input(), state({ speed: 8, rearGrip: VEHICLE.driftSideFriction }), 0.1);
    expect(back.rearGrip).toBeCloseTo(VEHICLE.driftSideFriction + VEHICLE.driftGripRecovery * 0.1);
  });

  it('steering left swings the tail out: the nose turns faster than the path', () => {
    const c = driveCommand(input({ throttle: 1, steer: 1, handbrake: true }), state({ speed: 8, pathRate: 1 }), dt);
    expect(c.yawTarget).toBeGreaterThan(1);
  });

  it('holds the drift angle picked by the steering', () => {
    const slip = -VEHICLE.driftSlip; // nose inside a left turn at full lock
    const c = driveCommand(input({ throttle: 1, steer: 1, handbrake: true }), state({ speed: 8, slip, pathRate: 2 }), dt);
    expect(c.yawTarget).toBeCloseTo(2);
  });

  it('counter-steers on its own: the front wheels follow the slide', () => {
    const c = driveCommand(input({ throttle: 1, handbrake: true }), state({ speed: 8, slip: -0.4 }), 0.1);
    expect(c.steer).toBeCloseTo(-0.4); // wheels pointing right while the car slides left-nosed
  });

  it('keeps sliding after Space is released while the slide is wide', () => {
    const c = driveCommand(input({ throttle: 1, steer: 1 }), state({ speed: 8, slip: -0.5, drifting: true }), dt);
    expect(c.drifting).toBe(true);
  });

  it('ends once the car has straightened', () => {
    const c = driveCommand(input({ throttle: 1 }), state({ speed: 8, slip: -0.05, drifting: true }), dt);
    expect(c.drifting).toBe(false);
  });

  it('ends when the car slows down', () => {
    const c = driveCommand(input({ steer: 1 }), state({ speed: 2, slip: -0.5, drifting: true }), dt);
    expect(c.drifting).toBe(false);
  });
});
