import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { aim } from '../src/world/crew.js';

// A person (turned to face -X, like the engineers at the console) with a thigh → shin chain hanging straight down.
function leg() {
  const person = new THREE.Group();
  person.rotation.y = -Math.PI / 2;
  const hip = new THREE.Bone();
  hip.position.set(0.1, 1, 0);
  hip.rotation.set(0.3, -0.7, 0.2); // arbitrary local axes, as in real rigs
  const knee = new THREE.Bone();
  knee.position.copy(new THREE.Vector3(0, -0.45, 0).applyQuaternion(hip.quaternion.clone().invert()));
  hip.add(knee);
  person.add(hip);
  person.updateMatrixWorld(true);
  return { person, hip, knee };
}

const direction = (person, a, b) =>
  b
    .getWorldPosition(new THREE.Vector3())
    .sub(a.getWorldPosition(new THREE.Vector3()))
    .normalize()
    .applyQuaternion(person.getWorldQuaternion(new THREE.Quaternion()).invert());

describe('aim', () => {
  it('points a bone along a direction given in the person’s own space', () => {
    const { person, hip, knee } = leg();
    aim(person, hip, knee, new THREE.Vector3(0.1, -0.1, 1));
    const d = direction(person, hip, knee);
    const want = new THREE.Vector3(0.1, -0.1, 1).normalize();
    expect(d.x).toBeCloseTo(want.x, 5);
    expect(d.y).toBeCloseTo(want.y, 5);
    expect(d.z).toBeCloseTo(want.z, 5);
  });

  it('keeps the bone length', () => {
    const { person, hip, knee } = leg();
    aim(person, hip, knee, new THREE.Vector3(0, 0, 1));
    expect(knee.getWorldPosition(new THREE.Vector3()).distanceTo(hip.getWorldPosition(new THREE.Vector3()))).toBeCloseTo(0.45, 5);
  });

  it('ignores missing bones', () => {
    const { person, hip } = leg();
    expect(() => aim(person, hip, undefined, new THREE.Vector3(0, 0, 1))).not.toThrow();
  });
});
