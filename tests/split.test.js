import { describe, it, expect } from 'vitest';
import { splitTrianglesByX, compactIndices } from '../src/cars/split.js';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
// Triangle 0 sits at x ≈ +1, triangle 1 at x ≈ -1.
const positions = [1, 0, 0, 1.2, 0, 0, 1, 1, 0, -1, 0, 0, -1.2, 0, 0, -1, 1, 0];

describe('splitTrianglesByX', () => {
  it('splits non-indexed geometry', () => {
    const { left, right } = splitTrianglesByX(positions, null, identity);
    expect([...left]).toEqual([0, 1, 2]);
    expect([...right]).toEqual([3, 4, 5]);
  });

  it('follows the index buffer', () => {
    const { left, right } = splitTrianglesByX(positions, [3, 4, 5, 0, 1, 2], identity);
    expect([...left]).toEqual([0, 1, 2]);
    expect([...right]).toEqual([3, 4, 5]);
  });

  it('puts triangles near the centre line in the middle band', () => {
    const withShaft = [...positions, -0.1, 0, 0, 0.1, 0, 0, 0, 0.2, 0];
    const { left, right, middle } = splitTrianglesByX(withShaft, null, identity, 0.5);
    expect([...left]).toEqual([0, 1, 2]);
    expect([...right]).toEqual([3, 4, 5]);
    expect([...middle]).toEqual([6, 7, 8]);
  });

  it('applies the matrix before testing X', () => {
    const shifted = [...identity];
    shifted[12] = -5; // translate x by -5: everything ends up on the right
    const { left, right } = splitTrianglesByX(positions, null, shifted);
    expect(left).toHaveLength(0);
    expect(right).toHaveLength(6);
  });
});

describe('compactIndices', () => {
  it('keeps only used vertices, in first-use order', () => {
    const { vertices, index } = compactIndices([7, 9, 7, 3]);
    expect([...vertices]).toEqual([7, 9, 3]);
    expect([...index]).toEqual([0, 1, 0, 2]);
  });
});
