import * as THREE from 'three';
import { buildFlow, createHeightfield, fillHoles, rasterizeTriangles } from './flow.js';

/** Air box solved around the car, in tunnel space (car centred at the origin, nose towards -Z, air towards +Z). */
export const FLOW_BOUNDS = { min: [-3.5, 0, -6], max: [3.5, 3.5, 9] };
const FLOW_CELL = 0.1;
const HEIGHTFIELD_CELL = 0.025;
// Car space (nose +Z) → tunnel space: the car sits in the tunnel turned by HOME_ROTATION, half a turn about Y.
const CAR_TO_TUNNEL = new THREE.Matrix4().makeRotationY(Math.PI);

const cache = new WeakMap();

/**
 * Flow field around `car` (see flow.js), computed once per car. The car must be assembled.
 * @param {import('../cars/CarModel.js').CarModel} car
 */
export function carFlow(car) {
  if (!cache.has(car)) cache.set(car, solve(car));
  return cache.get(car);
}

function solve(car) {
  const halfX = car.size.x / 2 + 0.1;
  const halfZ = car.size.z / 2 + 0.1;
  const hf = createHeightfield({
    x0: -halfX,
    z0: -halfZ,
    cell: HEIGHTFIELD_CELL,
    nx: Math.ceil((2 * halfX) / HEIGHTFIELD_CELL),
    nz: Math.ceil((2 * halfZ) / HEIGHTFIELD_CELL),
  });
  car.root.updateMatrixWorld(true);
  const toCar = new THREE.Matrix4().copy(car.root.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  car.root.traverseVisible((o) => {
    if (!o.isMesh) return;
    m.multiplyMatrices(CAR_TO_TUNNEL, toCar).multiply(o.matrixWorld);
    const pos = o.geometry.attributes.position;
    const out = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      out[i * 3] = v.x;
      out[i * 3 + 1] = v.y;
      out[i * 3 + 2] = v.z;
    }
    rasterizeTriangles(hf, out, o.geometry.index?.array ?? null);
  });
  fillHoles(hf);
  return buildFlow(hf, { bounds: FLOW_BOUNDS, cell: FLOW_CELL });
}
