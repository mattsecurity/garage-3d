import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader, DRACO_GLTF_CONFIG } from 'three/addons/loaders/DRACOLoader.js';

// DRACO_GLTF_CONFIG points at decoder files that Vite bundles from node_modules.
const draco = new DRACOLoader().setDecoderPath(DRACO_GLTF_CONFIG);
const gltfLoader = new GLTFLoader().setDRACOLoader(draco);

/**
 * @param {string} url
 * @param {(fraction: number) => void} [onProgress]
 * @returns {Promise<import('three/addons/loaders/GLTFLoader.js').GLTF>}
 */
export function loadGLTF(url, onProgress) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      url,
      resolve,
      (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded / event.total);
      },
      reject,
    );
  });
}
