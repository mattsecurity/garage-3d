// Pure aerodynamics for the wind tunnel: no three.js, so it runs (and is tested) in Node.
// Tunnel space: metres, ground at y = 0, air flowing towards +Z at unit speed (scale it when drawing).
//
// The car is voxelised from a heightfield (lowest and highest point of the body over each patch of floor), then the
// flow around it is solved as potential flow — Laplace's equation for the velocity potential, relaxed with red-black
// SOR on a coarse grid first and a fine one after. Potential flow has no drag and closes up neatly behind the car, so
// a wake is marched downstream from every rear-facing surface: it slows the air, stirs the smoke and sets the base
// pressure the way separated flow does.

const CP_BASE = -0.25; // pressure coefficient in separated flow (behind the car)
const CP_RANGE = [-1.2, 1]; // what the pressure texture (and its colour scale) can hold

/**
 * @param {{x0:number, z0:number, cell:number, nx:number, nz:number}} layout XZ grid: origin, cell size, cell counts
 * @returns heightfield with `top` / `bottom` per cell (-Infinity / Infinity where nothing was drawn)
 */
export function createHeightfield({ x0, z0, cell, nx, nz }) {
  return {
    x0,
    z0,
    cell,
    nx,
    nz,
    top: new Float32Array(nx * nz).fill(-Infinity),
    bottom: new Float32Array(nx * nz).fill(Infinity),
  };
}

function splat(hf, x, y, z) {
  const i = Math.floor((x - hf.x0) / hf.cell);
  const k = Math.floor((z - hf.z0) / hf.cell);
  if (i < 0 || k < 0 || i >= hf.nx || k >= hf.nz) return;
  const c = i + hf.nx * k;
  if (y > hf.top[c]) hf.top[c] = y;
  if (y < hf.bottom[c]) hf.bottom[c] = y;
}

/**
 * Draws triangles into the heightfield: their XZ footprint with interpolated heights, plus points along every edge so
 * vertical faces (door panels) count too.
 * @param {ReturnType<typeof createHeightfield>} hf
 * @param {ArrayLike<number>} positions flat xyz in tunnel space
 * @param {ArrayLike<number>|null} index triangle index, or null for a plain triangle list
 */
export function rasterizeTriangles(hf, positions, index) {
  const { x0, z0, cell, nx, nz, top, bottom } = hf;
  const step = cell * 0.5;
  const edge = (ax, ay, az, bx, by, bz) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / step);
    for (let s = 0; s <= n; s++) {
      const t = n ? s / n : 0;
      splat(hf, ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
    }
  };
  const count = index ? index.length / 3 : positions.length / 9;
  for (let t = 0; t < count; t++) {
    const a = (index ? index[t * 3] : t * 3) * 3;
    const b = (index ? index[t * 3 + 1] : t * 3 + 1) * 3;
    const c = (index ? index[t * 3 + 2] : t * 3 + 2) * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    edge(ax, ay, az, bx, by, bz);
    edge(bx, by, bz, cx, cy, cz);
    edge(cx, cy, cz, ax, ay, az);
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(det) < 1e-12) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / cell));
    const i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / cell));
    const k0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / cell));
    const k1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - z0) / cell));
    for (let k = k0; k <= k1; k++) {
      const pz = z0 + (k + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        const px = x0 + (i + 0.5) * cell;
        const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / det;
        const l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const y = l1 * ay + l2 * by + l3 * cy;
        const ci = i + nx * k;
        if (y > top[ci]) top[ci] = y;
        if (y < bottom[ci]) bottom[ci] = y;
      }
    }
  }
}

/** Closes small gaps (cells no triangle reached) enclosed by drawn cells along X or Z. */
export function fillHoles(hf, reach = 4) {
  const { nx, nz, top, bottom } = hf;
  const t0 = top.slice();
  const b0 = bottom.slice();
  const probe = (i, k, di, dk) => {
    for (let s = 1; s <= reach; s++) {
      const ii = i + di * s;
      const kk = k + dk * s;
      if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) return -1;
      const c = ii + nx * kk;
      if (t0[c] >= b0[c]) return c;
    }
    return -1;
  };
  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      const c = i + nx * k;
      if (t0[c] >= b0[c]) continue;
      for (const [di, dk] of [
        [1, 0],
        [0, 1],
      ]) {
        const p = probe(i, k, di, dk);
        const q = probe(i, k, -di, -dk);
        if (p < 0 || q < 0) continue;
        top[c] = Math.max(top[c], Math.min(t0[p], t0[q]));
        bottom[c] = Math.min(bottom[c], Math.max(b0[p], b0[q]));
      }
    }
}

function makeGrid({ min, max }, h) {
  const nx = Math.round((max[0] - min[0]) / h);
  const ny = Math.round((max[1] - min[1]) / h);
  const nz = Math.round((max[2] - min[2]) / h);
  const n = nx * ny * nz;
  const phi = new Float32Array(n);
  for (let k = 0; k < nz; k++) phi.fill(min[2] + (k + 0.5) * h, k * nx * ny, (k + 1) * nx * ny);
  return { min: [...min], max: [min[0] + nx * h, min[1] + ny * h, min[2] + nz * h], h, nx, ny, nz, solid: new Uint8Array(n), phi };
}

/** A cell is solid when more than half of the heightfield under it covers the cell's centre height. */
function markSolid(grid, hf) {
  const { nx, ny, nz, h, min, solid } = grid;
  for (let k = 0; k < nz; k++) {
    const za = min[2] + k * h;
    const ka = Math.max(0, Math.floor((za - hf.z0) / hf.cell));
    const kb = Math.min(hf.nz - 1, Math.ceil((za + h - hf.z0) / hf.cell) - 1);
    if (ka > kb) continue;
    for (let i = 0; i < nx; i++) {
      const xa = min[0] + i * h;
      const ia = Math.max(0, Math.floor((xa - hf.x0) / hf.cell));
      const ib = Math.min(hf.nx - 1, Math.ceil((xa + h - hf.x0) / hf.cell) - 1);
      if (ia > ib) continue;
      const cells = [];
      for (let kk = ka; kk <= kb; kk++)
        for (let ii = ia; ii <= ib; ii++) {
          const c = ii + hf.nx * kk;
          if (hf.top[c] >= hf.bottom[c]) cells.push(c);
        }
      const need = ((ib - ia + 1) * (kb - ka + 1)) / 2;
      if (cells.length <= need) continue;
      for (let j = 0; j < ny; j++) {
        const y = min[1] + (j + 0.5) * h;
        let covered = 0;
        for (const c of cells) if (y >= hf.bottom[c] && y <= hf.top[c]) covered++;
        if (covered > need) solid[i + nx * (j + ny * k)] = 1;
      }
    }
  }
}

/**
 * Red-black SOR on the velocity potential. The inlet, outlet, sides and top hold the free stream (an open jet); the
 * floor and the car are walls (zero normal velocity: missing neighbours drop out of the average).
 */
function relax(grid, iterations, omega = 1.88) {
  const { nx, ny, nz, solid, phi } = grid;
  const sy = nx;
  const sz = nx * ny;
  for (let it = 0; it < iterations; it++)
    for (let parity = 0; parity < 2; parity++)
      for (let k = 1; k < nz - 1; k++)
        for (let j = 0; j < ny - 1; j++) {
          const row = nx * (j + ny * k);
          for (let i = 1 + ((1 + j + k + parity) & 1); i < nx - 1; i += 2) {
            const c = row + i;
            if (solid[c]) continue;
            let sum = 0;
            let n = 0;
            if (!solid[c - 1]) (sum += phi[c - 1]), n++;
            if (!solid[c + 1]) (sum += phi[c + 1]), n++;
            if (j > 0 && !solid[c - sy]) (sum += phi[c - sy]), n++;
            if (!solid[c + sy]) (sum += phi[c + sy]), n++;
            if (!solid[c - sz]) (sum += phi[c - sz]), n++;
            if (!solid[c + sz]) (sum += phi[c + sz]), n++;
            if (n) phi[c] += omega * (sum / n - phi[c]);
          }
        }
}

/** Replaces each solid cell of `field` with the mean of its non-solid neighbours, `passes` layers deep. */
function dilate(grid, field, passes) {
  const { nx, ny, nz, solid } = grid;
  const sy = nx;
  const sz = nx * ny;
  let known = Uint8Array.from(solid, (s) => 1 - s);
  for (let p = 0; p < passes; p++) {
    const next = known.slice();
    for (let k = 0; k < nz; k++)
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const c = i + nx * (j + ny * k);
          if (known[c]) continue;
          let sum = 0;
          let n = 0;
          if (i > 0 && known[c - 1]) (sum += field[c - 1]), n++;
          if (i < nx - 1 && known[c + 1]) (sum += field[c + 1]), n++;
          if (j > 0 && known[c - sy]) (sum += field[c - sy]), n++;
          if (j < ny - 1 && known[c + sy]) (sum += field[c + sy]), n++;
          if (k > 0 && known[c - sz]) (sum += field[c - sz]), n++;
          if (k < nz - 1 && known[c + sz]) (sum += field[c + sz]), n++;
          if (n) {
            field[c] = sum / n;
            next[c] = 1;
          }
        }
    known = next;
  }
}

/** Trilinear read of a cell-centred field; positions outside the grid are clamped to its edge. */
export function sampleScalar(grid, field, x, y, z) {
  const { nx, ny, nz, h, min } = grid;
  const fx = Math.min(Math.max((x - min[0]) / h - 0.5, 0), nx - 1.0001);
  const fy = Math.min(Math.max((y - min[1]) / h - 0.5, 0), ny - 1.0001);
  const fz = Math.min(Math.max((z - min[2]) / h - 0.5, 0), nz - 1.0001);
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const k = Math.floor(fz);
  const tx = fx - i;
  const ty = fy - j;
  const tz = fz - k;
  const c = i + nx * (j + ny * k);
  const sy = nx;
  const sz = nx * ny;
  const x00 = field[c] + (field[c + 1] - field[c]) * tx;
  const x10 = field[c + sy] + (field[c + sy + 1] - field[c + sy]) * tx;
  const x01 = field[c + sz] + (field[c + sz + 1] - field[c + sz]) * tx;
  const x11 = field[c + sy + sz] + (field[c + sy + sz + 1] - field[c + sy + sz]) * tx;
  const y0 = x00 + (x10 - x00) * ty;
  const y1 = x01 + (x11 - x01) * ty;
  return y0 + (y1 - y0) * tz;
}

/**
 * Air velocity at a point (free stream = [0, 0, 1]); outside the grid it is the free stream.
 * @param {number[]} out receives [vx, vy, vz]
 */
export function sampleVelocity(grid, x, y, z, out) {
  const { min, max } = grid;
  if (x < min[0] || x > max[0] || y < min[1] || y > max[1] || z < min[2] || z > max[2]) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 1;
    return out;
  }
  out[0] = sampleScalar(grid, grid.u, x, y, z);
  out[1] = sampleScalar(grid, grid.v, x, y, z);
  out[2] = sampleScalar(grid, grid.w, x, y, z);
  return out;
}

/** Whether the cell containing a point is inside the car. */
export function isSolid(grid, x, y, z) {
  const { nx, ny, nz, h, min } = grid;
  const i = Math.floor((x - min[0]) / h);
  const j = Math.floor((y - min[1]) / h);
  const k = Math.floor((z - min[2]) / h);
  if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return false;
  return grid.solid[i + nx * (j + ny * k)] === 1;
}

function computeVelocity(grid) {
  const { nx, ny, nz, h, solid, phi } = grid;
  const sy = nx;
  const sz = nx * ny;
  const n = nx * ny * nz;
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  const w = new Float32Array(n);
  // Central differences. A wall neighbour mirrors the cell (zero normal gradient); at the open edges of the grid the
  // difference is one-sided.
  const diff = (c, lo, hi, loWall, hiWall, loEdge, hiEdge) => {
    const a = loEdge ? null : loWall ? phi[c] : phi[lo];
    const b = hiEdge ? null : hiWall ? phi[c] : phi[hi];
    if (a === null) return (b - phi[c]) / h;
    if (b === null) return (phi[c] - a) / h;
    return (b - a) / (2 * h);
  };
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const c = i + nx * (j + ny * k);
        if (solid[c]) continue;
        u[c] = diff(c, c - 1, c + 1, i > 0 && solid[c - 1], i < nx - 1 && solid[c + 1], i === 0, i === nx - 1);
        v[c] = diff(c, c - sy, c + sy, j === 0 || solid[c - sy], j < ny - 1 && solid[c + sy], false, j === ny - 1);
        w[c] = diff(c, c - sz, c + sz, k > 0 && solid[c - sz], k < nz - 1 && solid[c + sz], k === 0, k === nz - 1);
      }
  // Solid cells take their neighbours' velocity so smoke brushing the body slides along it instead of stalling.
  for (const field of [u, v, w]) dilate(grid, field, 2);
  Object.assign(grid, { u, v, w });
}

/**
 * Marches the wake downstream: every rear-facing surface sheds turbulence (a tall step fully, a gentle slope a little),
 * which spreads sideways and fades with distance.
 */
function computeWake(grid, length) {
  const { nx, ny, nz, h, solid } = grid;
  const sy = nx;
  const sz = nx * ny;
  const wake = new Float32Array(nx * ny * nz);
  const decay = Math.exp(-h / length);
  const run = new Uint8Array(ny);
  for (let k = 1; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      // Height (in cells) of each vertical run of rear-facing cells in this column.
      for (let j = 0; j < ny; j++) {
        const c = i + nx * (j + ny * k);
        run[j] = !solid[c] && solid[c - sz] ? 1 : 0;
      }
      for (let j = 0; j < ny; ) {
        if (!run[j]) {
          j++;
          continue;
        }
        let e = j;
        while (e < ny && run[e]) e++;
        for (let jj = j; jj < e; jj++) run[jj] = Math.min(e - j, 255);
        j = e;
      }
      for (let j = 0; j < ny; j++) {
        const c = i + nx * (j + ny * k);
        if (solid[c]) continue;
        const p = c - sz;
        let blurred = wake[p] * 0.5;
        blurred += (i > 0 ? wake[p - 1] : 0) * 0.125 + (i < nx - 1 ? wake[p + 1] : 0) * 0.125;
        blurred += (j > 0 ? wake[p - sy] : wake[p]) * 0.125 + (j < ny - 1 ? wake[p + sy] : 0) * 0.125;
        const source = run[j] ? Math.min(1, run[j] / 4) : 0;
        wake[c] = Math.max(blurred * decay, source);
      }
    }
  grid.wake = wake;
}

function computePressure(grid) {
  const { u, v, w, wake, solid } = grid;
  const cp = new Float32Array(u.length);
  for (let c = 0; c < cp.length; c++) {
    if (solid[c]) continue;
    const attached = 1 - (u[c] * u[c] + v[c] * v[c] + w[c] * w[c]);
    const value = attached + (CP_BASE - attached) * wake[c];
    cp[c] = Math.min(Math.max(value, CP_RANGE[0]), CP_RANGE[1]);
  }
  dilate(grid, cp, 3);
  grid.cp = cp;
}

function computeFrontalArea(grid) {
  const { nx, ny, nz, h, solid } = grid;
  let cells = 0;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++)
      for (let k = 0; k < nz; k++)
        if (solid[i + nx * (j + ny * k)]) {
          cells++;
          break;
        }
  grid.frontalArea = cells * h * h;
}

/**
 * Solves the flow around the body drawn into `hf`.
 * @param {ReturnType<typeof createHeightfield>} hf
 * @param {{bounds:{min:number[], max:number[]}, cell:number, wakeLength?:number, coarseIterations?:number,
 *   fineIterations?:number}} options
 * @returns grid with `u v w` (velocity), `wake` (0..1), `cp` (pressure coefficient), `solid`, `frontalArea` (m²)
 */
export function buildFlow(hf, { bounds, cell, wakeLength = 2.5, coarseIterations = 260, fineIterations = 70 }) {
  const coarse = makeGrid(bounds, cell * 2);
  markSolid(coarse, hf);
  relax(coarse, coarseIterations);
  dilate(coarse, coarse.phi, 2);

  const grid = makeGrid(bounds, cell);
  markSolid(grid, hf);
  const { nx, ny, nz, h, min, phi } = grid;
  for (let k = 1; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++)
        phi[i + nx * (j + ny * k)] = sampleScalar(coarse, coarse.phi, min[0] + (i + 0.5) * h, min[1] + (j + 0.5) * h, min[2] + (k + 0.5) * h);
  relax(grid, fineIterations);

  computeVelocity(grid);
  computeWake(grid, wakeLength);
  computePressure(grid);
  computeFrontalArea(grid);
  return grid;
}

/** Separable [1 2 1] blur of a cell-centred field along X, Y and Z, `passes` times. */
function blur3(grid, field, passes) {
  const { nx, ny, nz } = grid;
  const strides = [
    [1, nx],
    [nx, ny],
    [nx * ny, nz],
  ];
  let a = field.slice();
  let b = new Float32Array(a.length);
  for (let p = 0; p < passes; p++)
    for (const [stride, n] of strides) {
      for (let c = 0; c < a.length; c++) {
        const i = Math.floor(c / stride) % n;
        const lo = i > 0 ? a[c - stride] : a[c];
        const hi = i < n - 1 ? a[c + stride] : a[c];
        b[c] = 0.25 * lo + 0.5 * a[c] + 0.25 * hi;
      }
      [a, b] = [b, a];
    }
  return a;
}

/**
 * The pressure coefficient packed into bytes for a 3D texture (0 → CP_RANGE[0], 255 → CP_RANGE[1]), smoothed so the
 * voxel steps of the body don't show up as bands on the paint.
 */
export function packPressure(grid) {
  const [lo, hi] = CP_RANGE;
  return Uint8Array.from(blur3(grid, grid.cp, 2), (v) => Math.round(((v - lo) / (hi - lo)) * 255));
}

export { CP_RANGE };
