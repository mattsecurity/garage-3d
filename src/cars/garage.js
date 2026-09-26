import { loadGLTF } from '../core/loader.js';
import { CarModel } from './CarModel.js';

const cache = new Map();

/**
 * Loads a catalog car once and keeps it for later switches.
 * @param {object} entry catalog entry
 * @param {(fraction: number) => void} [onProgress]
 * @returns {Promise<CarModel>}
 */
export function loadCar(entry, onProgress) {
  if (!cache.has(entry.id)) {
    const promise = loadGLTF(`${import.meta.env.BASE_URL}${entry.file}`, onProgress).then((gltf) => new CarModel(entry, gltf.scene));
    promise.catch(() => cache.delete(entry.id));
    cache.set(entry.id, promise);
  }
  return cache.get(entry.id);
}
