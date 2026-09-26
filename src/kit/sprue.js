import * as THREE from 'three';
import { letterTexture } from '../world/textures.js';

export const SPRUE_TUBE = 0.06;
const UP = new THREE.Vector3(0, 1, 0);

function tube(a, b, radius, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 10), material);
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A sprue centred on the origin: outer frame, a runner above each shelf of parts, a gate into each part
 * and a lettered tag.
 * @param {{w:number, d:number, pad:number}} size
 * @param {Array<{x:number, z:number, w:number, d:number}>} placements parts on this sprue (sprue-local centres)
 * @param {string} letter
 * @param {THREE.Material} material shared plastic
 */
export function buildSprue({ w, d, pad }, placements, letter, material) {
  const group = new THREE.Group();
  const y = SPRUE_TUBE;
  const hw = w / 2;
  const hd = d / 2;
  const P = (x, z) => new THREE.Vector3(x, y, z);
  group.add(
    tube(P(-hw, -hd), P(hw, -hd), SPRUE_TUBE, material),
    tube(P(-hw, hd), P(hw, hd), SPRUE_TUBE, material),
    tube(P(-hw, -hd), P(-hw, hd), SPRUE_TUBE, material),
    tube(P(hw, -hd), P(hw, hd), SPRUE_TUBE, material),
  );
  const shelfTops = [...new Set(placements.map((p) => Math.round((p.z - p.d / 2) * 1000) / 1000))];
  for (const top of shelfTops) group.add(tube(P(-hw, top - pad / 2), P(hw, top - pad / 2), SPRUE_TUBE * 0.8, material));
  for (const p of placements) {
    const top = p.z - p.d / 2;
    group.add(tube(P(p.x, top - pad / 2), P(p.x, top + 0.05), SPRUE_TUBE * 0.45, material));
  }
  const face = new THREE.MeshStandardMaterial({ map: letterTexture(letter), roughness: 0.6, transparent: true });
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.5), [material, material, face, material, material, material]);
  tag.position.set(-hw + 0.5, 0.03, -hd - 0.33);
  tag.castShadow = true;
  group.add(tag, tube(P(-hw + 0.5, -hd - 0.08), P(-hw + 0.5, -hd), SPRUE_TUBE * 0.5, material));
  return group;
}
