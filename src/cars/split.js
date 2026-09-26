// Pure helpers used to split a mesh that holds both wheels of an axle into a left and a right half.

/**
 * Splits triangles by their centroid's X in car space: left (x >= gap), right (x <= -gap), middle (the rest,
 * e.g. an axle shaft between the wheels).
 * @param {ArrayLike<number>} positions flat xyz vertex positions, mesh-local
 * @param {ArrayLike<number>|null} index triangle index, or null for non-indexed geometry
 * @param {ArrayLike<number>} m column-major 4x4 matrix (THREE.Matrix4.elements), mesh-local → car space
 * @param {number} [gap] half-width of the middle band
 * @returns {{left: Uint32Array, right: Uint32Array, middle: Uint32Array}} vertex indices, three per triangle
 */
export function splitTrianglesByX(positions, index, m, gap = 0) {
  const triangles = index ? index.length / 3 : positions.length / 9;
  const worldX = (v) => m[0] * positions[v * 3] + m[4] * positions[v * 3 + 1] + m[8] * positions[v * 3 + 2] + m[12];
  const left = [];
  const right = [];
  const middle = [];
  for (let t = 0; t < triangles; t++) {
    const a = index ? index[t * 3] : t * 3;
    const b = index ? index[t * 3 + 1] : t * 3 + 1;
    const c = index ? index[t * 3 + 2] : t * 3 + 2;
    const centroidX = (worldX(a) + worldX(b) + worldX(c)) / 3;
    const bucket = centroidX >= gap ? left : centroidX < -gap ? right : middle;
    bucket.push(a, b, c);
  }
  return { left: Uint32Array.from(left), right: Uint32Array.from(right), middle: Uint32Array.from(middle) };
}

/**
 * Re-indexes a triangle list so it only references the vertices it uses.
 * @param {ArrayLike<number>} index
 * @returns {{vertices: Uint32Array, index: Uint32Array}} vertices[newIndex] = oldIndex
 */
export function compactIndices(index) {
  const remap = new Map();
  const vertices = [];
  const out = new Uint32Array(index.length);
  for (let i = 0; i < index.length; i++) {
    let v = remap.get(index[i]);
    if (v === undefined) {
      v = vertices.length;
      remap.set(index[i], v);
      vertices.push(index[i]);
    }
    out[i] = v;
  }
  return { vertices: Uint32Array.from(vertices), index: out };
}
