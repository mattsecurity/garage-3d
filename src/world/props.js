// Procedural desk props. Each builder returns a Group resting on y = 0 with its long side along X.
// userData.collider tells Physics how to collide with it (omitted = no collider).
import * as THREE from 'three';
import { jarLabelTexture, rulerTexture } from './textures.js';

const std = (params) => new THREE.MeshStandardMaterial(params);
const metal = () => std({ color: 0xc8ccd0, metalness: 1, roughness: 0.28 });

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function paintJar(lidColor) {
  const g = new THREE.Group();
  const r = 0.42;
  const h = 0.5;
  const labelColor = `#${new THREE.Color(lidColor).getHexString()}`;
  g.add(
    mesh(new THREE.CylinderGeometry(r, r, h, 40), metal(), 0, h / 2),
    mesh(new THREE.CylinderGeometry(r + 0.004, r + 0.004, h * 0.62, 40, 1, true), std({ map: jarLabelTexture(labelColor), roughness: 0.6 }), 0, h * 0.45),
    mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.97, 0.06, 40), std({ color: lidColor, roughness: 0.35, metalness: 0.2 }), 0, h + 0.03),
  );
  g.userData.collider = { shape: 'cylinder', radius: r, halfHeight: (h + 0.06) / 2, dynamic: true };
  return g;
}

export function cutter() {
  const g = new THREE.Group();
  const orange = std({ color: 0xff6a13, roughness: 0.45 });
  g.add(mesh(new THREE.BoxGeometry(3.2, 0.24, 0.46), orange, 0, 0.12));
  for (let i = 0; i < 6; i++) g.add(mesh(new THREE.BoxGeometry(0.08, 0.05, 0.48), std({ color: 0x222222, roughness: 0.8 }), -1.2 + i * 0.22, 0.25));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.03, 0.3), metal(), 2.0, 0.12));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.1, 0.12), std({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 }), 0.6, 0.27, 0));
  g.userData.collider = { shape: 'box' };
  return g;
}

export function scissors() {
  const g = new THREE.Group();
  const blade = metal();
  const handle = std({ color: 0xb5121b, roughness: 0.5 });
  const b1 = mesh(new THREE.BoxGeometry(2.8, 0.05, 0.22), blade, 1.2, 0.05, 0.08);
  b1.rotation.y = 0.12;
  const b2 = mesh(new THREE.BoxGeometry(2.8, 0.05, 0.22), blade, 1.2, 0.1, -0.08);
  b2.rotation.y = -0.12;
  const ring = new THREE.TorusGeometry(0.38, 0.09, 12, 32).rotateX(Math.PI / 2);
  g.add(b1, b2, mesh(ring, handle, -0.5, 0.09, 0.45), mesh(ring.clone(), std({ color: 0x1b1b1b, roughness: 0.5 }), -0.5, 0.09, -0.45));
  return g;
}

export function screwdriver() {
  const g = new THREE.Group();
  const handle = mesh(new THREE.CylinderGeometry(0.24, 0.26, 1.6, 12).rotateZ(Math.PI / 2), std({ color: 0x1b1b1b, roughness: 0.6 }), -0.9, 0.26);
  const shaft = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 12).rotateZ(Math.PI / 2), metal(), 0.85, 0.26);
  const tip = mesh(new THREE.BoxGeometry(0.14, 0.03, 0.12), metal(), 1.85, 0.26);
  g.add(handle, shaft, tip);
  g.userData.collider = { shape: 'box' };
  return g;
}

export function ruler() {
  const g = new THREE.Group();
  const length = 9;
  const width = 0.7;
  const side = metal();
  const top = std({ map: rulerTexture(length, width), metalness: 0.6, roughness: 0.35 });
  g.add(mesh(new THREE.BoxGeometry(length, 0.04, width), [side, side, top, side, side, side], 0, 0.02));
  g.userData.collider = { shape: 'box' };
  return g;
}

export function pencil() {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(0.13, 0.13, 3.2, 6).rotateZ(Math.PI / 2), std({ color: 0xf2b705, roughness: 0.5 }), 0, 0.13);
  const wood = mesh(new THREE.ConeGeometry(0.13, 0.4, 6).rotateZ(-Math.PI / 2), std({ color: 0xe0b98a, roughness: 0.8 }), 1.8, 0.13);
  const lead = mesh(new THREE.ConeGeometry(0.04, 0.12, 6).rotateZ(-Math.PI / 2), std({ color: 0x333333 }), 2.03, 0.13);
  const ferrule = mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.25, 12).rotateZ(Math.PI / 2), metal(), -1.72, 0.13);
  const eraser = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.18, 12).rotateZ(Math.PI / 2), std({ color: 0xe88a9a, roughness: 0.9 }), -1.93, 0.13);
  g.add(body, wood, lead, ferrule, eraser);
  return g;
}

export function eraser() {
  const g = new THREE.Group();
  g.add(
    mesh(new THREE.BoxGeometry(0.9, 0.28, 0.45), std({ color: 0xf4f4f4, roughness: 0.9 }), 0, 0.14),
    mesh(new THREE.BoxGeometry(0.5, 0.3, 0.47), std({ color: 0x123a8c, roughness: 0.7 }), 0.12, 0.14),
  );
  g.userData.collider = { shape: 'box' };
  return g;
}
