import { describe, it, expect } from 'vitest';
import { classifyMesh, buildParts } from '../src/cars/parts.js';

const box = (cx, cy, cz, sx, sy, sz) => ({
  min: [cx - sx / 2, cy - sy / 2, cz - sz / 2],
  max: [cx + sx / 2, cy + sy / 2, cz + sz / 2],
});
const mesh = (id, props) => ({ id, name: `m${id}`, material: 'mat', isPaint: false, isWheel: false, ...props });

describe('classifyMesh', () => {
  it('paint wins over everything', () => expect(classifyMesh({ name: 'x', material: 'Glass', isPaint: true })).toBe('body'));
  it('taillight glass is a light', () => expect(classifyMesh({ name: 'brakes', material: 'Taillight_Glass' })).toBe('lights'));
  it('windshield is glass', () => expect(classifyMesh({ name: 'Glasses_Windshield_0', material: 'Windshield' })).toBe('glass'));
  it('seat is interior', () => expect(classifyMesh({ name: 'seat_l', material: 'Leather' })).toBe('interior'));
  it('falls back to chassis', () => expect(classifyMesh({ name: 'bumper', material: 'Black' })).toBe('chassis'));
});

describe('buildParts', () => {
  const car = [
    mesh(0, { isPaint: true, box: box(0, 0.7, 0, 2, 1.1, 4.5) }),
    mesh(1, { material: 'Black', box: box(0, 0.4, 0, 1.9, 0.6, 4.3) }),
    mesh(2, { isWheel: true, box: box(0.9, 0.35, 1.4, 0.3, 0.7, 0.7) }), // tyre FL
    mesh(3, { isWheel: true, box: box(0.95, 0.35, 1.4, 0.05, 0.5, 0.5) }), // rim FL
    mesh(4, { isWheel: true, box: box(-0.9, 0.35, 1.4, 0.3, 0.7, 0.7) }),
    mesh(5, { isWheel: true, box: box(0.9, 0.35, -1.4, 0.3, 0.7, 0.7) }),
    mesh(6, { isWheel: true, box: box(-0.9, 0.35, -1.4, 0.3, 0.7, 0.7) }),
    mesh(7, { material: 'Headlight', box: box(0, 0.6, 2.2, 1.6, 0.2, 0.1) }),
    mesh(8, { material: 'Taillight', box: box(0, 0.8, -2.2, 1.6, 0.2, 0.1) }),
    mesh(9, { material: 'Gauge', box: box(0.3, 0.9, 0.4, 0.05, 0.05, 0.02) }), // tiny interior bit
  ];
  const parts = buildParts(car, { carLength: 4.5 });
  const byId = Object.fromEntries(parts.map((p) => [p.id, p]));

  it('makes one part per wheel corner, in FL FR RL RR order', () => {
    expect(parts.filter((p) => p.kind === 'wheel').map((p) => p.wheel)).toEqual(['fl', 'fr', 'rl', 'rr']);
    expect([...byId['wheel-fl'].meshIds].sort()).toEqual([2, 3]);
  });

  it('uses the biggest wheel mesh for pivot and radius', () => {
    const [x, y, z] = byId['wheel-fl'].pivot;
    expect(x).toBeCloseTo(0.9);
    expect(y).toBeCloseTo(0.35);
    expect(z).toBeCloseTo(1.4);
    expect(byId['wheel-fl'].radius).toBeCloseTo(0.35);
  });

  it('puts painted meshes in the body', () => expect(byId['body-1'].meshIds).toEqual([0]));

  it('splits far-apart lights into two parts', () => expect(parts.filter((p) => p.kind === 'lights')).toHaveLength(2));

  it('glues tiny clusters onto the chassis', () => {
    expect(byId['chassis-1'].meshIds).toContain(9);
    expect(parts.some((p) => p.kind === 'interior')).toBe(false);
  });

  it('orders parts for assembly', () =>
    expect(parts.map((p) => p.kind)).toEqual(['chassis', 'body', 'lights', 'lights', 'wheel', 'wheel', 'wheel', 'wheel']));

  it('caps the number of non-wheel parts and keeps every mesh', () => {
    const many = Array.from({ length: 20 }, (_, i) => mesh(i, { material: 'Black', box: box(i * 2, 0.5, 0, 0.8, 0.8, 0.8) }));
    const capped = buildParts(many, { carLength: 4.5, maxParts: 5 });
    expect(capped).toHaveLength(5);
    expect(capped.flatMap((p) => p.meshIds).sort((a, b) => a - b)).toEqual(many.map((m) => m.id));
  });

  it('returns nothing for an empty model', () => expect(buildParts([], { carLength: 4.5 })).toEqual([]));
});
