import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { Physics } from '../src/physics/Physics.js';

// Minimal stand-in for a CarModel: what Physics reads.
function fakeCar() {
  const root = new THREE.Group();
  const wheels = [
    [0.85, 1.4],
    [-0.85, 1.4],
    [0.85, -1.4],
    [-0.85, -1.4],
  ].map(([x, z]) => {
    const object = new THREE.Group();
    object.rotation.order = 'YXZ';
    object.position.set(x, 0.35, z);
    root.add(object);
    return { pivot: [x, 0.35, z], radius: 0.35, object };
  });
  return { entry: { id: 'fake' }, root, wheels, size: new THREE.Vector3(2, 1.2, 4.5) };
}

const idle = { throttle: 0, steer: 0, handbrake: false };
const run = (physics, seconds, input) => {
  for (let t = 0; t < seconds; t += 1 / 60) physics.step(1 / 60, input);
  physics.sync();
};

describe('Physics', () => {
  let physics;
  let car;
  beforeAll(async () => {
    physics = await Physics.create();
    car = fakeCar();
    physics.setCar(car);
  });

  it('settles on its wheels at ground level', () => {
    run(physics, 1, idle);
    expect(car.root.position.y).toBeCloseTo(0, 1);
    expect(physics.wheelStates().every((w) => w.contact)).toBe(true);
  });

  it('drives forward along +Z', () => {
    run(physics, 1.5, { ...idle, throttle: 1 });
    expect(car.root.position.z).toBeGreaterThan(3);
    expect(Math.abs(car.root.position.x)).toBeLessThan(0.2);
    expect(physics.forwardSpeed()).toBeGreaterThan(8);
  });

  it('positive steer turns left (+X)', () => {
    const x0 = car.root.position.x;
    run(physics, 1, { ...idle, throttle: 1, steer: 1 });
    expect(car.root.position.x).toBeGreaterThan(x0 + 1);
  });

  it('spins the wheels forward and places them on the suspension', () => {
    expect(car.wheels[0].object.rotation.x).toBeGreaterThan(1);
    expect(car.wheels[0].object.position.y).toBeCloseTo(0.35, 1);
  });

  it('handbrake at speed gives rear skid', () => {
    run(physics, 0.3, { throttle: 0, steer: -1, handbrake: true });
    const states = physics.wheelStates();
    expect(states[2].skid).toBeGreaterThan(0.5);
  });

  it('resetCar levels the car', () => {
    car.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
    physics.body.setRotation({ x: 0, y: 0, z: 1, w: 0 }, true);
    physics.resetCar();
    physics.sync();
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(car.root.quaternion).y).toBeCloseTo(1);
  });

  it('removeCar clears the vehicle', () => {
    physics.removeCar();
    expect(physics.wheelStates()).toEqual([]);
  });
});
