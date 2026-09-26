import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CarModel, kitUniforms } from '../src/cars/CarModel.js';

// Raw model at 2x scale, nose pointing -Z, wheels named like the Ferrari 458 file.
function fakeFerrari() {
  const scene = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ name: 'Body_Color', color: 0xff0000 });
  const black = new THREE.MeshStandardMaterial({ name: 'Black' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 9), paint);
  body.position.y = 1.6;
  scene.add(body);
  for (const [name, x, z] of [
    ['wheel_fl', -1.8, -3],
    ['wheel_fr', 1.8, -3],
    ['wheel_rl', -1.8, 3],
    ['wheel_rr', 1.8, 3],
  ]) {
    const wheel = new THREE.Group();
    wheel.name = name;
    wheel.position.set(x, 0.7, z);
    wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.5, 16).rotateZ(Math.PI / 2), black));
    scene.add(wheel);
  }
  return scene;
}

const ferrariEntry = { id: 'fake', forward: '-z', length: 4.5, wheelPattern: /^wheel_(fl|fr|rl|rr)$/i, paintPattern: /^Body_Color$/i };

describe('CarModel', () => {
  const car = new CarModel(ferrariEntry, fakeFerrari());

  it('normalizes length and stands on the ground, centred', () => {
    const box = new THREE.Box3().setFromObject(car.root);
    expect(box.max.z - box.min.z).toBeCloseTo(4.5, 2);
    expect(box.min.y).toBeCloseTo(0, 3);
    expect((box.max.x + box.min.x) / 2).toBeCloseTo(0, 3);
    expect(car.size.z).toBeCloseTo(4.5, 2);
  });

  it('finds four wheels ordered FL FR RL RR, front at +Z and left at +X', () => {
    expect(car.wheels.map((w) => w.wheel)).toEqual(['fl', 'fr', 'rl', 'rr']);
    const fl = car.wheels[0].object.position;
    expect(fl.z).toBeGreaterThan(0);
    expect(fl.x).toBeGreaterThan(0);
  });

  it('scales the wheel radius', () => expect(car.wheels[0].radius).toBeCloseTo(0.35, 2));

  it('records the assembled pose of every part', () => {
    for (const p of car.parts) expect(p.object.position.equals(p.assembled.position)).toBe(true);
  });

  it('resetParts undoes moves', () => {
    car.parts[0].object.position.x += 3;
    car.resetParts();
    expect(car.parts[0].object.position.equals(car.parts[0].assembled.position)).toBe(true);
  });

  it('paints and restores the original colour', () => {
    expect(car.paintable).toBe(true);
    car.setPaint('#00ff00');
    expect(car.paintMaterials[0].color.getHexString()).toBe('00ff00');
    car.setPaint(null);
    expect(car.paintMaterials[0].color.getHexString()).toBe('ff0000');
  });

  it('patches materials for the kit look without switching it on', () => {
    expect(car.paintMaterials[0].userData.kitPatched).toBe(true);
    expect(kitUniforms.uKit.value).toBe(0);
  });

  it('splits axle meshes into left and right wheels', () => {
    const scene = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ name: 'Body' });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4.5), mat);
    body.position.y = 0.8;
    scene.add(body);
    const tyre = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16).rotateZ(Math.PI / 2);
    const axle = mergeGeometries([tyre.clone().translate(-0.9, 0, 0), tyre.clone().translate(0.9, 0, 0)]);
    for (const [name, z] of [['front_wheels_7', 1.5], ['back_wheels_1', -1.5]]) {
      const m = new THREE.Mesh(axle, mat);
      m.name = name;
      m.position.set(0, 0.35, z);
      scene.add(m);
    }
    const f1 = new CarModel({ id: 'axle', forward: '+z', length: 4.5, wheelPattern: /^(front_wheels|back_wheels)/i, paintPattern: null }, scene);
    expect(f1.wheels.map((w) => w.wheel)).toEqual(['fl', 'fr', 'rl', 'rr']);
    expect(f1.wheels[0].object.position.x).toBeCloseTo(0.9, 2);
    expect(f1.wheels[1].object.position.x).toBeCloseTo(-0.9, 2);
    expect(f1.paintable).toBe(false);
  });
});
