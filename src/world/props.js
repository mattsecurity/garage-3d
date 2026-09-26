// Procedural desk props. Each builder returns a Group resting on y = 0 with its long side along X.
// userData.collider makes it a dynamic body in Drive: {mass, friction, restitution, hull, sound}. Physics wraps each
// mesh in a convex hull (hull: 'merged' = one hull around all of them). Masses are relative to the 1200 of the car.
// sound: the material it rings like when hit (audio/impacts.js).
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
  g.userData.collider = { mass: 30, friction: 0.35, restitution: 0.25, hull: 'merged', sound: 'tin' };
  return g;
}

export function cutter() {
  const g = new THREE.Group();
  const orange = std({ color: 0xff6a13, roughness: 0.45 });
  g.add(mesh(new THREE.BoxGeometry(3.2, 0.24, 0.46), orange, 0, 0.12));
  for (let i = 0; i < 6; i++) g.add(mesh(new THREE.BoxGeometry(0.08, 0.05, 0.48), std({ color: 0x222222, roughness: 0.8 }), -1.2 + i * 0.22, 0.25));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.03, 0.3), metal(), 2.0, 0.12));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.1, 0.12), std({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 }), 0.6, 0.27, 0));
  g.userData.collider = { mass: 35, friction: 0.45, restitution: 0.2, sound: 'plastic' };
  return g;
}

/**
 * Flat outline (x along the scissors, y across) extruded upwards: the result lies on y = 0 in the prop's space.
 * `side` mirrors the outline across the long axis (-1 for the lower half of the pair).
 */
function flatPiece(outline, holes, thickness, bevel, side) {
  const flip = (points) => points.map(([x, y]) => new THREE.Vector2(x, y * side));
  const shape = new THREE.Shape(flip(outline));
  for (const hole of holes) shape.holes.push(new THREE.Path(flip(hole)));
  const depth = Math.max(thickness - 2 * bevel, 0.001);
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3 })
    .rotateX(-Math.PI / 2)
    .translate(0, bevel, 0);
}

const ellipse = (cx, cy, rx, ry, from, to, steps = 40) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });

/** Office scissors, slightly open: two steel blades crossing at a screw, moulded plastic finger loops. */
export function scissors() {
  const g = new THREE.Group();
  const steel = std({ color: 0xd9dce0, metalness: 1, roughness: 0.22 });
  const plastic = std({ color: 0x232326, roughness: 0.55 });
  const deg = Math.PI / 180;
  // One half: blade to +X from the pivot (spine on +y, cutting edge along y = 0), its tang running back into the
  // plastic handle, whose loop sits behind the pivot on -y.
  const blade = [[-0.3, -0.05], [2.35, 0], ...ellipse(0.5, 0, 1.85, 0.26, 0, 90 * deg, 16).slice(1), [0.05, 0.27], [-0.3, 0.05]];
  const half = (side, loop, lift, plasticHeight) => {
    const part = new THREE.Group();
    const { cx, cy, rx, ry } = loop;
    const outline = [
      ...ellipse(cx, cy, rx, ry, 60 * deg, 350 * deg),
      ...ellipse(-0.24, -0.01, 0.08, 0.11, -90 * deg, 90 * deg, 12), // rounded end towards the pivot
    ];
    const hole = ellipse(cx, cy, rx - 0.085, ry - 0.085, 0, 2 * Math.PI).slice(1);
    // The halves' plastic overlaps behind the pivot: different heights keep their top faces apart.
    part.add(mesh(flatPiece(outline, [hole], plasticHeight, 0.035, side), plastic));
    part.add(mesh(flatPiece(blade, [], 0.035, 0.006, side), steel, 0, lift));
    part.rotation.y = 0.1 * side; // slightly open
    return part;
  };
  g.add(half(1, { cx: -0.8, cy: -0.4, rx: 0.36, ry: 0.3 }, 0.08, 0.16)); // thumb loop, upper blade
  g.add(half(-1, { cx: -0.92, cy: -0.4, rx: 0.48, ry: 0.3 }, 0.045, 0.15)); // finger loop, lower blade
  const screw = new THREE.SphereGeometry(0.1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1);
  g.add(mesh(screw, steel, 0, 0.115)); // domed pivot screw
  g.userData.collider = { mass: 45, friction: 0.35, restitution: 0.15, sound: 'steel' };
  return g;
}

export function screwdriver() {
  const g = new THREE.Group();
  const handle = mesh(new THREE.CylinderGeometry(0.24, 0.26, 1.6, 12).rotateZ(Math.PI / 2), std({ color: 0x1b1b1b, roughness: 0.6 }), -0.9, 0.26);
  const shaft = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 12).rotateZ(Math.PI / 2), metal(), 0.85, 0.26);
  const tip = mesh(new THREE.BoxGeometry(0.14, 0.03, 0.12), metal(), 1.85, 0.26);
  g.add(handle, shaft, tip);
  g.userData.collider = { mass: 50, friction: 0.45, restitution: 0.2, sound: 'steel' };
  return g;
}

export function ruler() {
  const g = new THREE.Group();
  const length = 9;
  const width = 0.7;
  const side = metal();
  const top = std({ map: rulerTexture(length, width), metalness: 0.6, roughness: 0.35 });
  g.add(mesh(new THREE.BoxGeometry(length, 0.04, width), [side, side, top, side, side, side], 0, 0.02));
  g.userData.collider = { mass: 60, friction: 0.3, restitution: 0.1, sound: 'steel' };
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
  g.userData.collider = { mass: 5, friction: 0.5, restitution: 0.2, hull: 'merged', sound: 'wood' };
  return g;
}

export function eraser() {
  const g = new THREE.Group();
  g.add(
    mesh(new THREE.BoxGeometry(0.9, 0.28, 0.45), std({ color: 0xf4f4f4, roughness: 0.9 }), 0, 0.14),
    mesh(new THREE.BoxGeometry(0.5, 0.3, 0.47), std({ color: 0x123a8c, roughness: 0.7 }), 0.12, 0.14),
  );
  g.userData.collider = { mass: 15, friction: 0.9, restitution: 0.45, hull: 'merged', sound: 'rubber' };
  return g;
}

/** 1:18 traffic cone: black base, orange cone, two white reflective bands. */
export function cone() {
  const g = new THREE.Group();
  const h = 0.66;
  const orange = std({ color: 0xff5a14, roughness: 0.55 });
  const white = std({ color: 0xf4f4f4, roughness: 0.3, metalness: 0.1 });
  g.add(mesh(new THREE.BoxGeometry(0.46, 0.04, 0.46), std({ color: 0x1b1b1b, roughness: 0.8 }), 0, 0.02));
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.17, h, 28), orange, 0, 0.04 + h / 2));
  // Bands hug the cone: their radii follow its taper at their height.
  const radiusAt = (y) => 0.17 + (0.035 - 0.17) * ((y - 0.04) / h);
  for (const [y0, y1] of [
    [0.3, 0.38],
    [0.47, 0.53],
  ])
    g.add(mesh(new THREE.CylinderGeometry(radiusAt(y1) + 0.004, radiusAt(y0) + 0.004, y1 - y0, 28, 1, true), white, 0, (y0 + y1) / 2));
  g.userData.collider = { mass: 12, friction: 0.7, restitution: 0.3, hull: 'merged', sound: 'plastic' };
  return g;
}

/** Roll of masking tape lying flat. */
export function tapeRoll() {
  const g = new THREE.Group();
  const outer = 0.46;
  const inner = 0.3;
  const h = 0.3;
  const tape = std({ color: 0xe6d6ad, roughness: 0.85 });
  const core = std({ color: 0xb08d5a, roughness: 0.9, side: THREE.DoubleSide });
  g.add(mesh(new THREE.CylinderGeometry(outer, outer, h, 48, 1, true), tape, 0, h / 2));
  g.add(mesh(new THREE.CylinderGeometry(inner, inner, h, 48, 1, true), core, 0, h / 2));
  for (const y of [0, h]) {
    const ring = mesh(new THREE.RingGeometry(inner, outer, 48).rotateX(y ? -Math.PI / 2 : Math.PI / 2), std({ color: 0xd9c89c, roughness: 0.9 }), 0, y);
    g.add(ring);
  }
  g.userData.collider = { mass: 40, friction: 0.6, restitution: 0.25, hull: 'merged', sound: 'card' };
  return g;
}

/** Bottle of plastic cement, standing. */
export function glueBottle() {
  const g = new THREE.Group();
  const r = 0.3;
  const h = 0.9;
  g.add(
    mesh(new THREE.CylinderGeometry(r, r, h, 32), std({ color: 0xf6f6f2, roughness: 0.35 }), 0, h / 2),
    mesh(new THREE.CylinderGeometry(r + 0.004, r + 0.004, h * 0.5, 32, 1, true), std({ map: jarLabelTexture('#0f5132'), roughness: 0.5 }), 0, h * 0.45),
    mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.6, 0.34, 24), std({ color: 0x1b1b1b, roughness: 0.4 }), 0, h + 0.17),
  );
  g.userData.collider = { mass: 25, friction: 0.45, restitution: 0.2, hull: 'merged', sound: 'plastic' };
  return g;
}

/** Paint brush lying on its side: round handle, metal ferrule, bristles. */
export function brush(handleColor = 0xb5121b) {
  const g = new THREE.Group();
  const y = 0.08;
  g.add(
    mesh(new THREE.CylinderGeometry(0.05, 0.08, 2.4, 16).rotateZ(Math.PI / 2), std({ color: handleColor, roughness: 0.35 }), -0.3, y),
    mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.45, 16).rotateZ(Math.PI / 2), metal(), 1.12, y),
    mesh(new THREE.ConeGeometry(0.07, 0.36, 16).rotateZ(-Math.PI / 2), std({ color: 0x3a2a1a, roughness: 0.9 }), 1.52, y),
  );
  g.userData.collider = { mass: 6, friction: 0.5, restitution: 0.2, sound: 'wood' };
  return g;
}
