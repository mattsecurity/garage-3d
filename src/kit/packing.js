// Pure layout logic for the model kit: how each part lies on a sprue, and where sprues sit on the mat.
import * as THREE from 'three';

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

function rotatedSize(size, q) {
  const [sx, sy, sz] = size;
  const box = new THREE.Box3(new THREE.Vector3(-sx / 2, -sy / 2, -sz / 2), new THREE.Vector3(sx / 2, sy / 2, sz / 2));
  return box.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q)).getSize(new THREE.Vector3());
}

/**
 * Rotation that lays a part flat: its thinnest axis becomes vertical and its longest side runs along X.
 * @param {number[]} size [x, y, z] bounding-box size of the part
 * @returns {{quaternion: number[], footprint: number[], height: number}} footprint = [width along X, depth along Z]
 */
export function flatOrientation(size) {
  const [sx, sy, sz] = size;
  const q = new THREE.Quaternion();
  if (sx <= sy && sx <= sz) q.setFromAxisAngle(Z, Math.PI / 2);
  else if (sz < sy) q.setFromAxisAngle(X, Math.PI / 2);
  let s = rotatedSize(size, q);
  if (s.z > s.x) {
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(Y, Math.PI / 2));
    s = rotatedSize(size, q);
  }
  return { quaternion: q.toArray(), footprint: [s.x, s.z], height: s.y };
}

/**
 * Shelf packing of rectangles onto as many sprues as needed. Items must fit inside one sprue.
 * @param {Array<{id:number, w:number, d:number}>} items
 * @param {{w:number, d:number, pad:number}} sprue
 * @returns {{count:number, placements:Array<{id:number, sprue:number, x:number, z:number, w:number, d:number}>}}
 *   x/z are item centres relative to the sprue centre
 */
export function packParts(items, { w, d, pad }) {
  const sorted = [...items].sort((a, b) => b.d - a.d || b.w - a.w);
  const placements = [];
  let sprue = 0;
  let x = pad;
  let z = pad;
  let shelf = 0;
  for (const it of sorted) {
    if (x + it.w > w - pad && x > pad) {
      x = pad;
      z += shelf + pad;
      shelf = 0;
    }
    if (z + it.d > d - pad && z > pad) {
      sprue++;
      x = pad;
      z = pad;
      shelf = 0;
    }
    placements.push({ id: it.id, sprue, x: x + it.w / 2 - w / 2, z: z + it.d / 2 - d / 2, w: it.w, d: it.d });
    x += it.w + pad;
    shelf = Math.max(shelf, it.d);
  }
  return { count: placements.length ? sprue + 1 : 0, placements };
}

/**
 * Centres of `count` sprues laid out in a grid around the origin (x, z).
 * @returns {number[][]} [[x, z], ...]
 */
export function layoutSprues(count, { w, d }, gap) {
  const cols = count <= 3 ? count : count === 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const out = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? count - r * cols : cols;
    out.push([(c - (inRow - 1) / 2) * (w + gap), (r - (rows - 1) / 2) * (d + gap)]);
  }
  return out;
}
