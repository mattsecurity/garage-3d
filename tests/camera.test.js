import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { VIEWS, fitView, flyTo } from '../src/core/camera.js';

describe('fitView', () => {
  it('leaves wide screens alone', () => expect(fitView(VIEWS.kit, 16 / 9)).toEqual(VIEWS.kit));

  it('backs off on portrait screens, keeping the target', () => {
    const v = fitView(VIEWS.kit, 0.5);
    expect(v.target).toEqual(VIEWS.kit.target);
    const dist = (a) => Math.hypot(...a.position.map((x, i) => x - a.target[i]));
    expect(dist(v)).toBeCloseTo(dist(VIEWS.kit) * 2.3);
  });
});

describe('flyTo', () => {
  it('jumps immediately with duration 0', async () => {
    const camera = new THREE.PerspectiveCamera(35, 16 / 9);
    const target = new THREE.Vector3();
    await flyTo(camera, target, VIEWS.studio, 0);
    expect(camera.position.toArray()).toEqual(VIEWS.studio.position);
    expect(target.toArray()).toEqual(VIEWS.studio.target);
  });
});
