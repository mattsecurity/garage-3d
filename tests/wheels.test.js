import { describe, it, expect } from 'vitest';
import { bakedWheelYaw, spinsWithWheel } from '../src/cars/wheels.js';

/** Flat [x, z, ...] samples of a tyre (axle along X) turned by `yaw` about +Y, three.js convention. */
function tyre(radius, halfWidth, yaw = 0) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const xz = [];
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 24)
    for (const x of [-halfWidth, 0, halfWidth]) {
      const z = Math.sin(a) * radius;
      xz.push(x * c + z * s, -x * s + z * c);
    }
  return xz;
}

describe('bakedWheelYaw', () => {
  it('is 0 for a straight wheel', () => expect(bakedWheelYaw(tyre(0.35, 0.12))).toBe(0));

  it('finds a steer angle baked into the model', () => {
    expect(bakedWheelYaw(tyre(0.35, 0.12, 0.52))).toBeCloseTo(0.52, 2);
    expect(bakedWheelYaw(tyre(0.35, 0.12, -0.3))).toBeCloseTo(-0.3, 2);
  });

  it('handles wide racing tyres', () => {
    expect(bakedWheelYaw(tyre(0.33, 0.2))).toBe(0);
    expect(bakedWheelYaw(tyre(0.33, 0.2, 0.2))).toBeCloseTo(0.2, 2);
  });

  it('ignores tiny angles', () => expect(bakedWheelYaw(tyre(0.35, 0.12, 0.01))).toBe(0));
});

describe('spinsWithWheel', () => {
  it('spins tyres, rims and discs centred on the axle', () => {
    expect(spinsWithWheel({ min: [-0.1, -0.35, -0.35], max: [0.1, 0.35, 0.35] }, 0.35)).toBe(true);
    expect(spinsWithWheel({ min: [-0.02, -0.3, -0.31], max: [0.02, 0.31, 0.3] }, 0.35)).toBe(true);
  });

  it('keeps a caliper sitting behind the disc still', () => {
    expect(spinsWithWheel({ min: [0.05, -0.18, -0.23], max: [0.14, 0.17, -0.08] }, 0.35)).toBe(false);
  });

  it('keeps non-round brake hardware still even when roughly centred', () => {
    expect(spinsWithWheel({ min: [-0.07, -0.127, -0.227], max: [0.07, 0.127, 0.122] }, 0.354)).toBe(false);
  });

  it('lets small bits such as a valve stem follow the rim', () => {
    expect(spinsWithWheel({ min: [0.074, -0.262, -0.007], max: [0.108, -0.238, 0.007] }, 0.34)).toBe(true);
  });
});
