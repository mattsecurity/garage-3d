import { describe, it, expect } from 'vitest';
import { flatOrientation, packParts, layoutSprues } from '../src/kit/packing.js';

describe('flatOrientation', () => {
  it('keeps a car body flat and turns its length along X', () => {
    const o = flatOrientation([2, 1.2, 4.5]);
    expect(o.footprint[0]).toBeCloseTo(4.5);
    expect(o.footprint[1]).toBeCloseTo(2);
    expect(o.height).toBeCloseTo(1.2);
  });

  it('lays a wheel on its side', () => {
    const o = flatOrientation([0.3, 0.7, 0.7]);
    expect(o.height).toBeCloseTo(0.3);
    expect(o.footprint[0]).toBeCloseTo(0.7);
    expect(o.footprint[1]).toBeCloseTo(0.7);
  });

  it('lays a thin upright panel down', () => {
    const o = flatOrientation([1.6, 0.5, 0.05]);
    expect(o.height).toBeCloseTo(0.05);
    expect(o.footprint[0]).toBeCloseTo(1.6);
    expect(o.footprint[1]).toBeCloseTo(0.5);
  });

  it('returns a unit quaternion', () => {
    const [x, y, z, w] = flatOrientation([0.3, 0.7, 2]).quaternion;
    expect(Math.hypot(x, y, z, w)).toBeCloseTo(1);
  });
});

describe('packParts', () => {
  const sprue = { w: 5.6, d: 5.2, pad: 0.35 };
  const items = [
    { id: 0, w: 4.5, d: 2.0 },
    { id: 1, w: 4.4, d: 1.9 },
    { id: 2, w: 4.0, d: 1.6 },
    { id: 3, w: 1.6, d: 0.5 },
    { id: 4, w: 0.7, d: 0.7 },
    { id: 5, w: 0.7, d: 0.7 },
    { id: 6, w: 0.7, d: 0.7 },
    { id: 7, w: 0.7, d: 0.7 },
  ];
  const { count, placements } = packParts(items, sprue);

  it('places every item exactly once', () =>
    expect(placements.map((p) => p.id).sort((a, b) => a - b)).toEqual(items.map((i) => i.id)));

  it('keeps items inside their sprue, away from the frame', () => {
    for (const p of placements) {
      expect(Math.abs(p.x) + p.w / 2).toBeLessThanOrEqual(sprue.w / 2 - sprue.pad + 1e-9);
      expect(Math.abs(p.z) + p.d / 2).toBeLessThanOrEqual(sprue.d / 2 - sprue.pad + 1e-9);
    }
  });

  it('never overlaps items on the same sprue', () => {
    for (const a of placements)
      for (const b of placements) {
        if (a === b || a.sprue !== b.sprue) continue;
        const apartX = Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - 1e-9;
        const apartZ = Math.abs(a.z - b.z) >= (a.d + b.d) / 2 - 1e-9;
        expect(apartX || apartZ).toBe(true);
      }
  });

  it('opens new sprues when one is full', () => expect(count).toBeGreaterThan(1));

  it('handles an empty list', () => expect(packParts([], sprue)).toEqual({ count: 0, placements: [] }));
});

describe('layoutSprues', () => {
  it('centres a single sprue', () => {
    const [[x, z]] = layoutSprues(1, { w: 5, d: 4 }, 1);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(0);
  });

  it('puts three sprues in a row', () => {
    const p = layoutSprues(3, { w: 5, d: 4 }, 1);
    expect(p.map((q) => q[0])).toEqual([-6, 0, 6]);
    for (const q of p) expect(q[1]).toBeCloseTo(0);
  });

  it('uses a 2x2 grid for four', () => {
    const p = layoutSprues(4, { w: 5, d: 4 }, 1);
    expect(new Set(p.map((q) => q[0])).size).toBe(2);
    expect(new Set(p.map((q) => q[1])).size).toBe(2);
  });
});
