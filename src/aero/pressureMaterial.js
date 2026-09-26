import * as THREE from 'three';
import { CP_RANGE, packPressure } from './flow.js';

/**
 * CFD-style surface pressure: the car turns into a single matte material coloured by the pressure coefficient read
 * from a 3D texture of the solved flow, sampled just off the surface, with thin isobar lines.
 */
export function createPressureMaterial() {
  const uniforms = {
    uCp: { value: null },
    uGridMin: { value: new THREE.Vector3() },
    uGridSize: { value: new THREE.Vector3(1, 1, 1) },
    uCpRange: { value: new THREE.Vector2(...CP_RANGE) },
    uOffset: { value: 0.17 }, // pressure is constant across the boundary layer: read it just clear of the voxel steps
  };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCfdPos;\nvarying vec3 vCfdNormal;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvCfdPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvCfdNormal = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform highp sampler3D uCp;
        uniform vec3 uGridMin;
        uniform vec3 uGridSize;
        uniform vec2 uCpRange;
        uniform float uOffset;
        varying vec3 vCfdPos;
        varying vec3 vCfdNormal;
        // Google's Turbo colormap, polynomial fit.
        vec3 turbo(float x) {
          const vec4 kr4 = vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234);
          const vec4 kg4 = vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333);
          const vec4 kb4 = vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771);
          const vec2 kr2 = vec2(-152.94239396, 59.28637943);
          const vec2 kg2 = vec2(4.27729857, 2.82956604);
          const vec2 kb2 = vec2(-89.90310912, 27.34824973);
          x = clamp(x, 0.0, 1.0);
          vec4 v4 = vec4(1.0, x, x * x, x * x * x);
          vec2 v2 = v4.zw * v4.z;
          return vec3(dot(v4, kr4) + dot(v2, kr2), dot(v4, kg4) + dot(v2, kg2), dot(v4, kb4) + dot(v2, kb2));
        }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec3 cfdN = normalize(vCfdNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 uvw = (vCfdPos + cfdN * uOffset - uGridMin) / uGridSize;
        float cp = mix(uCpRange.x, uCpRange.y, texture(uCp, uvw).r);
        float t = (cp - uCpRange.x) / (uCpRange.y - uCpRange.x);
        vec3 cfd = pow(turbo(t), vec3(2.2));
        // Isobars every 0.1 of Cp, drawn with screen-space derivatives so they stay one pixel wide.
        float f = cp * 10.0;
        float line = 1.0 - smoothstep(0.0, 1.2 * fwidth(f), abs(fract(f + 0.5) - 0.5));
        diffuseColor.rgb = cfd * (1.0 - 0.28 * line);`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.22;');
  };
  material.customProgramCacheKey = () => 'cfd-pressure-v1';
  material.userData.uniforms = uniforms;
  return material;
}

/** Loads a solved flow's pressure field into the material. */
export function setPressureField(material, grid) {
  const { uniforms } = material.userData;
  uniforms.uCp.value?.dispose();
  const texture = new THREE.Data3DTexture(packPressure(grid), grid.nx, grid.ny, grid.nz);
  texture.format = THREE.RedFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  uniforms.uCp.value = texture;
  uniforms.uGridMin.value.fromArray(grid.min);
  uniforms.uGridSize.value.set(grid.max[0] - grid.min[0], grid.max[1] - grid.min[1], grid.max[2] - grid.min[2]);
}
