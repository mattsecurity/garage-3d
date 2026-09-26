import * as THREE from 'three';
import { buildParts } from './parts.js';
import { splitTrianglesByX, compactIndices } from './split.js';

/** Shared by every car material: uKit = 0 shows the real materials, 1 shows grey kit plastic. */
export const kitUniforms = {
  uKit: { value: 0 },
  uKitColor: { value: new THREE.Color(0xa9adb3) },
};

const PAINT_FINISH = { roughness: 0.3, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.05 };

/** Injects the kit-plastic blend into a standard/physical material (once). */
export function patchKitMaterial(material) {
  if (!material?.isMeshStandardMaterial || material.userData.kitPatched) return;
  material.userData.kitPatched = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uKit = kitUniforms.uKit;
    shader.uniforms.uKitColor = kitUniforms.uKitColor;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uKit;\nuniform vec3 uKitColor;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uKitColor, uKit);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.6, uKit);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, uKit);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0 - uKit;')
      .replace(
        '#include <lights_physical_fragment>',
        '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= 1.0 - uKit;\n#endif',
      );
  };
  material.customProgramCacheKey = () => 'kit-v1';
}

/**
 * Replaces a mesh holding both wheels of an axle with a left wheel, a right wheel and (if any) the shaft between.
 * @returns {Array<{mesh: THREE.Mesh, wheel: boolean}>}
 */
function splitAxleMesh(mesh, gap) {
  const geometry = mesh.geometry;
  const pos = geometry.attributes.position;
  const positions = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    positions[i * 3] = pos.getX(i);
    positions[i * 3 + 1] = pos.getY(i);
    positions[i * 3 + 2] = pos.getZ(i);
  }
  const { left, right, middle } = splitTrianglesByX(positions, geometry.index?.array ?? null, mesh.matrixWorld.elements, gap);
  const pieces = [];
  for (const [side, triangles] of [['L', left], ['R', right], ['M', middle]]) {
    if (!triangles.length) continue;
    const { vertices, index } = compactIndices(triangles);
    const half = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(geometry.attributes)) {
      const array = new Float32Array(vertices.length * attr.itemSize);
      for (let v = 0; v < vertices.length; v++)
        for (let c = 0; c < attr.itemSize; c++) array[v * attr.itemSize + c] = attr.getComponent(vertices[v], c);
      half.setAttribute(name, new THREE.BufferAttribute(array, attr.itemSize));
    }
    half.setIndex(new THREE.BufferAttribute(index, 1));
    const piece = new THREE.Mesh(half, mesh.material);
    piece.name = `${mesh.name}_${side}`;
    piece.position.copy(mesh.position);
    piece.quaternion.copy(mesh.quaternion);
    piece.scale.copy(mesh.scale);
    mesh.parent.add(piece);
    piece.updateMatrixWorld(true);
    pieces.push({ mesh: piece, wheel: side !== 'M' });
  }
  mesh.removeFromParent();
  return pieces;
}

/**
 * A catalog car turned into a normalized, part-based model.
 * Car space: forward +Z, up +Y, left +X, wheels on the ground at y = 0, centred on x/z.
 */
export class CarModel {
  /**
   * @param {object} entry catalog entry (see catalog.js)
   * @param {THREE.Object3D} source loaded glTF scene (consumed)
   */
  constructor(entry, source) {
    this.entry = entry;
    this.root = new THREE.Group();
    this.root.name = `car:${entry.id}`;
    /** @type {Array<object>} parts from buildParts + {object: THREE.Group, assembled: {position, quaternion}} */
    this.parts = [];
    /** Wheel parts ordered FL, FR, RL, RR. */
    this.wheels = [];
    this.paintMaterials = [];
    const holder = this.#normalize(source);
    this.#buildParts(holder);
    this.#prepareMaterials();
    this.size = new THREE.Box3().setFromObject(this.root, true).getSize(new THREE.Vector3());
  }

  get paintable() {
    return this.paintMaterials.length > 0;
  }

  /** @param {string|null} color CSS color, or null to restore the original paint */
  setPaint(color) {
    for (const m of this.paintMaterials) {
      if (color == null) m.color.copy(m.userData.originalColor);
      else m.color.set(color);
    }
  }

  /** Puts every part back where it belongs on the assembled car. */
  resetParts() {
    for (const p of this.parts) {
      p.object.position.copy(p.assembled.position);
      p.object.quaternion.copy(p.assembled.quaternion);
    }
  }

  #normalize(source) {
    const holder = new THREE.Group();
    holder.add(source);
    if (this.entry.forward === '-z') holder.rotation.y = Math.PI;
    holder.updateMatrixWorld(true);
    const raw = new THREE.Box3().setFromObject(holder, true);
    holder.scale.setScalar(this.entry.length / (raw.max.z - raw.min.z));
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder, true);
    holder.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    this.root.add(holder);
    this.root.updateMatrixWorld(true);
    return holder;
  }

  #buildParts(holder) {
    const { wheelPattern, paintPattern, bodyPattern, length } = this.entry;
    const width = new THREE.Box3().setFromObject(holder, true).getSize(new THREE.Vector3()).x;
    const isWheel = (object) => {
      for (let o = object; o && o !== holder; o = o.parent) if (wheelPattern.test(o.name)) return true;
      return false;
    };

    const found = [];
    holder.traverse((o) => {
      if (o.isMesh) found.push(o);
    });
    const meshes = [];
    for (const mesh of found) {
      const box = new THREE.Box3().setFromObject(mesh, true);
      if (box.isEmpty()) continue;
      const wheel = isWheel(mesh);
      if (wheel && box.min.x < -0.15 * width && box.max.x > 0.15 * width) meshes.push(...splitAxleMesh(mesh, 0.25 * width));
      else meshes.push({ mesh, wheel });
    }

    const infos = meshes.map(({ mesh, wheel }, id) => {
      const box = new THREE.Box3().setFromObject(mesh, true);
      const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.name ?? '';
      return {
        id,
        name: mesh.name,
        material,
        isWheel: wheel,
        isPaint: !!(paintPattern?.test(material) || bodyPattern?.test(material)),
        box: { min: box.min.toArray(), max: box.max.toArray() },
      };
    });

    for (const def of buildParts(infos, { carLength: length })) {
      const group = new THREE.Group();
      group.name = def.id;
      group.position.fromArray(def.pivot);
      if (def.kind === 'wheel') group.rotation.order = 'YXZ'; // steer (Y) first, then spin (X)
      this.root.add(group);
      group.updateMatrixWorld(true);
      for (const id of def.meshIds) group.attach(meshes[id].mesh);
      const part = {
        ...def,
        object: group,
        assembled: { position: group.position.clone(), quaternion: group.quaternion.clone() },
      };
      this.parts.push(part);
      if (def.kind === 'wheel') this.wheels.push(part);
    }
    holder.removeFromParent();
  }

  #prepareMaterials() {
    const seen = new Set();
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!material || seen.has(material)) continue;
        seen.add(material);
        patchKitMaterial(material);
        if (this.entry.paintPattern?.test(material.name)) {
          material.userData.originalColor = material.color.clone();
          material.roughness = PAINT_FINISH.roughness;
          material.metalness = PAINT_FINISH.metalness;
          if (material.isMeshPhysicalMaterial) {
            material.clearcoat = PAINT_FINISH.clearcoat;
            material.clearcoatRoughness = PAINT_FINISH.clearcoatRoughness;
          }
          this.paintMaterials.push(material);
        }
      }
    });
  }
}
