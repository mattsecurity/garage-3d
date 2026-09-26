import * as THREE from 'three';
import gsap from 'gsap';

/** Cars rest with the nose pointing away from the default camera (towards -Z), so W drives "up" the screen. */
export const HOME_ROTATION = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

export const VIEWS = {
  kit: { position: [0, 16.5, 15], target: [0, 0, 0.8] },
  drive: { position: [0, 13, 15], target: [0, 0, 0] },
  studio: { position: [7.2, 2.1, -7.6], target: [0, 0.6, 0] },
};

/** Pulls the camera back on narrow or portrait screens so the scene still fits. */
export function fitView(view, aspect) {
  const k = aspect < 1.35 ? Math.min(1.35 / aspect, 2.3) : 1;
  return {
    position: view.position.map((v, i) => view.target[i] + (v - view.target[i]) * k),
    target: [...view.target],
  };
}

/**
 * Moves the camera and its look-at point to a view.
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Vector3} target look-at point, mutated (e.g. OrbitControls.target)
 * @param {{position:number[], target:number[]}} view
 * @param {number} duration seconds; 0 jumps
 * @returns {Promise<void>}
 */
export function flyTo(camera, target, view, duration = 1.2) {
  const v = fitView(view, camera.aspect);
  const p = new THREE.Vector3().fromArray(v.position);
  const t = new THREE.Vector3().fromArray(v.target);
  gsap.killTweensOf([camera.position, target]);
  if (duration <= 0) {
    camera.position.copy(p);
    target.copy(t);
    camera.lookAt(target);
    return Promise.resolve();
  }
  return gsap
    .timeline({ onUpdate: () => camera.lookAt(target) })
    .to(camera.position, { x: p.x, y: p.y, z: p.z, duration, ease: 'power2.inOut' }, 0)
    .to(target, { x: t.x, y: t.y, z: t.z, duration, ease: 'power2.inOut' }, 0)
    .then(() => {});
}
