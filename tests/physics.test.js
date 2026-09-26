import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
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

  it('drives again after removeCar + setCar (e.g. switching cars)', () => {
    physics.removeCar();
    car.root.position.set(0, 0, 0);
    car.root.quaternion.identity();
    physics.setCar(car);
    run(physics, 1.5, { ...idle, throttle: 1 });
    expect(Number.isNaN(car.wheels[0].object.rotation.x)).toBe(false);
    expect(car.root.position.z).toBeGreaterThan(3);
  });

  it('removeCar clears the vehicle', () => {
    physics.removeCar();
    expect(physics.wheelStates()).toEqual([]);
  });
});

describe('Physics timing', () => {
  const distance = async (hz) => {
    const physics = await Physics.create();
    physics.setCar(fakeCar());
    for (let i = 0; i < hz; i++) physics.step(1 / hz, idle); // settle for 1 s
    const z0 = physics.body.translation().z;
    for (let i = 0; i < hz; i++) physics.step(1 / hz, { ...idle, throttle: 1 }); // 1 s full throttle
    return physics.body.translation().z - z0;
  };

  it('covers the same distance at 60, 144 and 240 Hz', async () => {
    const d60 = await distance(60);
    const d144 = await distance(144);
    const d240 = await distance(240);
    expect(d60).toBeGreaterThan(3);
    expect(Math.abs(d144 - d60) / d60).toBeLessThan(0.1);
    expect(Math.abs(d240 - d60) / d60).toBeLessThan(0.1);
  });

  it('does not move on zero-length frames (hidden tab)', async () => {
    const physics = await Physics.create();
    physics.setCar(fakeCar());
    const before = physics.body.translation().y;
    for (let i = 0; i < 30; i++) physics.step(0, { ...idle, throttle: 1 });
    expect(physics.body.translation().y).toBe(before);
  });
});

/** A desk prop as props.js builds it: meshes in a group resting on y = 0, plus collider info. */
function fakeProp(geometry, y, x, z, collider) {
  const object = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.position.y = y;
  object.add(mesh);
  object.position.set(x, 0, z);
  object.userData.collider = collider;
  object.updateMatrixWorld(true);
  return object;
}

describe('Physics props', () => {
  it('knocks a prop away when the car drives into it', async () => {
    const physics = await Physics.create();
    const box = fakeProp(new THREE.BoxGeometry(0.6, 0.6, 0.6), 0.3, 0, 5, { mass: 20 });
    physics.addProps([box]);
    physics.setCar(fakeCar());
    run(physics, 2.5, { ...idle, throttle: 1 });
    expect(box.position.z).toBeGreaterThan(6);
  });

  it('gives each prop the mass it asks for', async () => {
    const physics = await Physics.create();
    const jar = fakeProp(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 24), 0.25, 3, 0, { mass: 30 });
    physics.addProps([jar]);
    physics.world.step();
    expect(physics.props[0].body.mass()).toBeCloseTo(30, 0);
    expect(physics.props[0].body.isDynamic()).toBe(true);
  });

  it('wheels shove a pencil they run over', async () => {
    const physics = await Physics.create();
    const pencil = fakeProp(new THREE.CylinderGeometry(0.13, 0.13, 3.2, 6).rotateZ(Math.PI / 2), 0.13, 0.85, 4, { mass: 5 });
    physics.addProps([pencil]);
    physics.setCar(fakeCar());
    run(physics, 0.5, idle);
    const before = pencil.position.clone();
    run(physics, 2, { ...idle, throttle: 1 });
    expect(pencil.position.distanceTo(before)).toBeGreaterThan(0.1);
  });

  it('resetProps puts every prop back', async () => {
    const physics = await Physics.create();
    const box = fakeProp(new THREE.BoxGeometry(0.6, 0.6, 0.6), 0.3, 0, 5, { mass: 20 });
    physics.addProps([box]);
    physics.props[0].body.setTranslation({ x: 4, y: 1, z: 2 }, true);
    physics.sync();
    physics.resetProps();
    expect(box.position.toArray()).toEqual([0, 0, 5]);
  });
});

describe('Physics car hull', () => {
  it('collides with the car model shape when it has meshes', async () => {
    const physics = await Physics.create();
    const car = fakeCar();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 4.4), new THREE.MeshBasicMaterial());
    body.position.y = 0.75;
    car.root.add(body);
    car.root.updateMatrixWorld(true);
    physics.setCar(car);
    const collider = physics.body.collider(0);
    expect(collider.shape.type).toBe(RAPIER.ShapeType.ConvexPolyhedron);
    run(physics, 1, idle);
    expect(car.root.position.y).toBeCloseTo(0, 1);
  });
});
