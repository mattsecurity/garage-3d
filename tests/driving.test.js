import { describe, it, expect } from 'vitest';
import { driveCommand, VEHICLE } from '../src/physics/driving.js';

const input = (over = {}) => ({ throttle: 0, steer: 0, handbrake: false, ...over });

describe('driveCommand', () => {
  it('drives the rear wheels from rest', () => {
    const c = driveCommand(input({ throttle: 1 }), 0, 0, 1 / 60);
    expect(c.rear.engine).toBe(VEHICLE.engineForce / 2);
    expect(c.front.brake).toBe(0);
  });

  it('stops pushing at top speed', () => {
    expect(driveCommand(input({ throttle: 1 }), VEHICLE.maxSpeed, 0, 1 / 60).rear.engine).toBe(0);
  });

  it('brakes instead of reversing while still rolling forward', () => {
    const c = driveCommand(input({ throttle: -1 }), 5, 0, 1 / 60);
    expect(c.rear.engine).toBe(0);
    expect(c.rear.brake).toBe(VEHICLE.brakeForce);
    expect(c.front.brake).toBe(VEHICLE.brakeForce);
  });

  it('reverses slower than it goes forward', () => {
    const c = driveCommand(input({ throttle: -1 }), 0, 0, 1 / 60);
    expect(c.rear.engine).toBeCloseTo((-VEHICLE.engineForce * VEHICLE.reverseFactor) / 2);
  });

  it('applies a light rolling brake with no input', () => {
    const c = driveCommand(input(), 4, 0, 1 / 60);
    expect(c.front.brake).toBe(VEHICLE.rollingBrake);
    expect(c.rear.brake).toBe(VEHICLE.rollingBrake);
  });

  it('ramps the steering instead of snapping', () => {
    expect(driveCommand(input({ steer: 1 }), 0, 0, 0.1).steer).toBeCloseTo(VEHICLE.steerSpeed * 0.1);
  });

  it('limits the steering angle at speed', () => {
    const c = driveCommand(input({ steer: 1 }), 30, 0.3, 0.1);
    expect(c.steer).toBeCloseTo(VEHICLE.maxSteer * (1 - VEHICLE.steerFalloffMax));
  });

  it('handbrake locks the rear and asks for drift yaw', () => {
    const c = driveCommand(input({ throttle: 1, steer: -1, handbrake: true }), 8, 0, 1 / 60);
    expect(c.rear.engine).toBe(0);
    expect(c.rear.brake).toBe(VEHICLE.handbrakeForce);
    expect(c.rear.sideFriction).toBe(VEHICLE.driftSideFriction);
    expect(c.yawTarget).toBeCloseTo(-VEHICLE.driftYawRate);
  });

  it('no drift assist when crawling', () => {
    expect(driveCommand(input({ steer: 1, handbrake: true }), 1, 0, 1 / 60).yawTarget).toBeNull();
  });
});
