import { describe, it, expect } from 'vitest';
import { createHeightfield, rasterizeTriangles, fillHoles, buildFlow, sampleVelocity, sampleScalar } from '../src/aero/flow.js';

// Axis-aligned box as 12 triangles (flat xyz, non-indexed).
function boxTriangles([x0, y0, z0], [x1, y1, z1]) {
  const c = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const faces = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0],
  ];
  const out = [];
  for (const [a, b, cc, d] of faces) out.push(...c[a], ...c[b], ...c[cc], ...c[a], ...c[cc], ...c[d]);
  return new Float32Array(out);
}

const BOX_MIN = [-0.5, 0.1, -0.7];
const BOX_MAX = [0.5, 0.7, 0.7];

function boxHeightfield() {
  const hf = createHeightfield({ x0: -1.5, z0: -1.5, cell: 0.05, nx: 60, nz: 60 });
  rasterizeTriangles(hf, boxTriangles(BOX_MIN, BOX_MAX), null);
  fillHoles(hf);
  return hf;
}

const BOUNDS = { min: [-2, 0, -3], max: [2, 2, 4] };
const speed = (g, x, y, z) => {
  const v = sampleVelocity(g, x, y, z, [0, 0, 0]);
  return Math.hypot(...v);
};

describe('heightfield', () => {
  it('records the top and bottom of a box seen from above', () => {
    const hf = boxHeightfield();
    const cell = (x, z) => Math.floor((x - hf.x0) / hf.cell) + hf.nx * Math.floor((z - hf.z0) / hf.cell);
    expect(hf.top[cell(0.1, 0.2)]).toBeCloseTo(0.7, 5);
    expect(hf.bottom[cell(0.1, 0.2)]).toBeCloseTo(0.1, 5);
    expect(hf.top[cell(1.2, 0.2)]).toBe(-Infinity);
  });
});

describe('flow around nothing', () => {
  const grid = buildFlow(createHeightfield({ x0: -1, z0: -1, cell: 0.1, nx: 20, nz: 20 }), { bounds: BOUNDS, cell: 0.1 });

  it('is the free stream everywhere', () => {
    for (const p of [[0, 0.5, 0], [1.2, 1.4, -2], [-1.5, 0.2, 3]]) {
      const v = sampleVelocity(grid, ...p, [0, 0, 0]);
      expect(v[0]).toBeCloseTo(0, 2);
      expect(v[1]).toBeCloseTo(0, 2);
      expect(v[2]).toBeCloseTo(1, 2);
    }
  });

  it('has no wake and zero pressure coefficient', () => {
    expect(sampleScalar(grid, grid.wake, 0, 0.5, 2)).toBe(0);
    expect(sampleScalar(grid, grid.cp, 0, 0.5, 0)).toBeCloseTo(0, 2);
    expect(grid.frontalArea).toBe(0);
  });
});

describe('flow around a box', () => {
  const grid = buildFlow(boxHeightfield(), { bounds: BOUNDS, cell: 0.1 });

  it('marks the box as solid', () => {
    const at = (x, y, z) => grid.solid[Math.floor((x - grid.min[0]) / grid.h) + grid.nx * (Math.floor((y - grid.min[1]) / grid.h) + grid.ny * Math.floor((z - grid.min[2]) / grid.h))];
    expect(at(0, 0.4, 0)).toBe(1);
    expect(at(0, 0.9, 0)).toBe(0);
    expect(at(0, 0.03, 0)).toBe(0); // gap under the box
  });

  it('slows to a stop in front of the box', () => expect(speed(grid, 0, 0.4, -0.8)).toBeLessThan(0.45));

  it('speeds up over the top and around the sides', () => {
    expect(speed(grid, 0, 0.78, -0.5)).toBeGreaterThan(1.15); // strongest just past the leading edge
    expect(speed(grid, 0, 0.8, 0)).toBeGreaterThan(1.05);
    expect(speed(grid, 0.6, 0.4, 0)).toBeGreaterThan(1.05);
  });

  it('flows along the faces, not through them', () => {
    const v = sampleVelocity(grid, 0, 0.8, 0, [0, 0, 0]);
    expect(Math.abs(v[1])).toBeLessThan(0.2 * v[2]);
  });

  it('turns up in front of the box', () => expect(sampleVelocity(grid, 0, 0.62, -0.9, [0, 0, 0])[1]).toBeGreaterThan(0.1));

  it('leaves a turbulent wake behind, none ahead', () => {
    expect(sampleScalar(grid, grid.wake, 0, 0.4, 0.85)).toBeGreaterThan(0.5);
    expect(sampleScalar(grid, grid.wake, 0, 0.4, -1.2)).toBe(0);
  });

  it('has high pressure on the nose and suction on the roof and behind', () => {
    expect(sampleScalar(grid, grid.cp, 0, 0.4, -0.8)).toBeGreaterThan(0.5);
    expect(sampleScalar(grid, grid.cp, 0, 0.78, 0)).toBeLessThan(-0.1);
    expect(sampleScalar(grid, grid.cp, 0, 0.4, 0.78)).toBeLessThan(0);
  });

  it('measures the frontal area', () => expect(grid.frontalArea).toBeCloseTo(0.6, 1));
});

describe('flow performance', () => {
  it('solves a car-sized tunnel in well under two seconds', () => {
    const hf = createHeightfield({ x0: -1.2, z0: -2.4, cell: 0.025, nx: 96, nz: 192 });
    rasterizeTriangles(hf, boxTriangles([-1, 0.12, -2.3], [1, 1.3, 2.3]), null);
    const t0 = performance.now();
    const grid = buildFlow(hf, { bounds: { min: [-3.5, 0, -6], max: [3.5, 3.5, 9] }, cell: 0.1 });
    const ms = performance.now() - t0;
    expect(grid.nx * grid.ny * grid.nz).toBeGreaterThan(300000);
    expect(ms).toBeLessThan(2000);
  });
});
