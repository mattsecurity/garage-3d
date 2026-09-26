// Pure helpers for wheel parts: undo a steer angle baked into the model and tell spinning parts from fixed ones.

const DEG = Math.PI / 180;

/**
 * Finds the steer angle a wheel was exported with. The axle is the direction in which the wheel is thinnest,
 * searched within ±45° of the car's X axis.
 * @param {ArrayLike<number>} xz flat [x0, z0, x1, z1, ...] vertex positions of the wheel
 * @param {{minAngle?:number, minGain?:number}} [options] ignore angles below minAngle (rad) or narrowing below minGain
 * @returns {number} yaw about +Y (three.js convention: axle = X rotated by yaw), 0 when the wheel is straight
 */
export function bakedWheelYaw(xz, { minAngle = 1.5 * DEG, minGain = 0.05 } = {}) {
  // Width of the wheel measured along (cos t, sin t) in the XZ plane.
  const width = (t) => {
    const c = Math.cos(t);
    const s = Math.sin(t);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < xz.length; i += 2) {
      const d = xz[i] * c + xz[i + 1] * s;
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    return hi - lo;
  };
  const straight = width(0);
  let best = 0;
  let bestWidth = straight;
  for (let deg = -45; deg <= 45; deg++) {
    const w = width(deg * DEG);
    if (w < bestWidth) [best, bestWidth] = [deg * DEG, w];
  }
  for (let step = 0.5 * DEG; step > 0.02 * DEG; step /= 2)
    for (const t of [best - step, best + step]) {
      const w = width(t);
      if (w < bestWidth) [best, bestWidth] = [t, w];
    }
  if (Math.abs(best) < minAngle || bestWidth > straight * (1 - minGain)) return 0;
  // The thinnest direction (cos t, 0, sin t) is X rotated by -t about +Y.
  return -best;
}

/**
 * Whether a wheel mesh spins with the wheel: tyre, rim and disc are round and centred on the axle, while a brake
 * caliper (or its hardware) sits off to one side and only steers. Small bits such as valve stems follow the rim.
 * @param {{min:number[], max:number[]}} box mesh bounds relative to the wheel centre, axle along X
 * @param {number} radius wheel radius
 */
export function spinsWithWheel(box, radius) {
  const sy = box.max[1] - box.min[1];
  const sz = box.max[2] - box.min[2];
  if (Math.max(sy, sz) < 0.4 * radius) return true;
  const centred = Math.hypot(box.min[1] + box.max[1], box.min[2] + box.max[2]) / 2 <= 0.15 * radius;
  const round = Math.abs(sy - sz) <= 0.15 * Math.max(sy, sz);
  return centred && round;
}
