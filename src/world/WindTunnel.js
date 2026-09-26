import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { carFlow } from '../aero/carFlow.js';
import { Smoke } from '../aero/Smoke.js';
import { createPressureMaterial, setPressureField } from '../aero/pressureMaterial.js';
import { aeroFor, aeroForces } from '../aero/aeroData.js';
import {
  acousticPanelTexture,
  beltTexture,
  blobTexture,
  controlRoomTexture,
  ductTexture,
  hallFloorTexture,
  honeycombTexture,
  signTexture,
} from './tunnelTextures.js';

// Open-jet test hall, in metres. Air leaves the nozzle (-Z), crosses the hall over the car and enters the collector.
const HALL = { halfWidth: 11, height: 8, nozzleZ: -8, collectorZ: 10 };
const NOZZLE = { w: 7.2, h: 3.9, depth: 6 };
const COLLECTOR = { w: 9.4, h: 5.2, depth: 6 };
const BELT = { w: 2.5, l: 6.4, tile: 1.6 };
const TURNTABLE = 4.4;
const RAKE_Z = -4.1;
const RAKE_TOP = 1.7;
const CEILING_RAIL = HALL.height - 0.12;
/** Air speed as drawn (m/s) per real km/h: slowed right down so the smoke can be followed by eye. */
const DRAWN_SPEED = 1 / 40;

const std = (params) => new THREE.MeshStandardMaterial(params);

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Wall with a rectangular opening at floor level, facing +Z (turn it for the other end). */
function wallWithOpening(halfWidth, height, openingW, openingH, material) {
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, 0);
  shape.lineTo(halfWidth, 0);
  shape.lineTo(halfWidth, height);
  shape.lineTo(-halfWidth, height);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-openingW / 2, 0);
  hole.lineTo(-openingW / 2, openingH);
  hole.lineTo(openingW / 2, openingH);
  hole.lineTo(openingW / 2, 0);
  hole.closePath();
  shape.holes.push(hole);
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  mesh.receiveShadow = true;
  return mesh;
}

/** Open rectangular duct running from z = 0 to z = depth (towards +Z), faces pointing inwards. */
function duct(w, h, depth, material) {
  const g = new THREE.Group();
  const side = new THREE.PlaneGeometry(depth, h);
  const left = new THREE.Mesh(side, material);
  left.rotation.y = Math.PI / 2;
  left.position.set(-w / 2, h / 2, depth / 2);
  const right = new THREE.Mesh(side, material);
  right.rotation.y = -Math.PI / 2;
  right.position.set(w / 2, h / 2, depth / 2);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w, depth), material);
  top.rotation.x = Math.PI / 2;
  top.position.set(0, h, depth / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, depth), material);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.001, depth / 2);
  for (const m of [left, right, top, floor]) m.receiveShadow = true;
  g.add(left, right, top, floor);
  return g;
}

/** Canvas screen on the hall wall showing the live test data. */
class WallDisplay {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 512;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    const bezel = box(4.16, 2.16, 0.06, std({ color: 0x0c0d0f, roughness: 0.5 }), 0, 0, -0.035);
    this.group = new THREE.Group();
    this.group.add(bezel, this.mesh);
    this.key = '';
  }

  draw(lines) {
    const key = JSON.stringify(lines);
    if (key === this.key) return;
    this.key = key;
    const g = this.canvas.getContext('2d');
    g.fillStyle = '#05070a';
    g.fillRect(0, 0, 1024, 512);
    g.fillStyle = 'rgba(120,180,255,0.06)';
    for (let y = 0; y < 512; y += 4) g.fillRect(0, y, 1024, 1);
    g.textBaseline = 'alphabetic';
    g.font = '500 30px "DM Mono", monospace';
    g.fillStyle = '#7f8b99';
    g.fillText(lines.title, 48, 70);
    g.font = '500 120px "DM Mono", monospace';
    g.fillStyle = '#f2f5f8';
    g.fillText(lines.speed, 44, 200);
    g.font = '500 34px "DM Mono", monospace';
    g.fillStyle = '#7f8b99';
    g.fillText('km/h', 50 + g.measureText(lines.speed).width * 3.6, 200);
    lines.rows.forEach(([label, value, color], i) => {
      const y = 290 + i * 54;
      g.font = '500 30px "DM Mono", monospace';
      g.fillStyle = '#7f8b99';
      g.fillText(label, 48, y);
      g.fillStyle = color ?? '#e9eef3';
      g.font = '500 36px "DM Mono", monospace';
      g.textAlign = 'right';
      g.fillText(value, 980, y);
      g.textAlign = 'left';
    });
    this.texture.needsUpdate = true;
  }
}

/**
 * Automotive wind tunnel for Studio mode: open-jet hall with a moving steel belt, smoke rake and a pressure view, plus
 * the flow solved around the current car (aero/flow.js) that drives the smoke and the pressure colours.
 */
export class WindTunnel {
  constructor(renderer) {
    this.group = new THREE.Group();
    this.group.name = 'wind-tunnel';
    this.group.visible = false;
    this.background = new THREE.Color(0x0d0f12);
    this.fog = new THREE.Fog(0x0d0f12, 16, 42);
    this.settings = { kmh: 160, rake: 'vertical', rakePos: 0, pressure: false };
    this.car = null;
    this.grid = null;
    this.savedMaterials = new Map();
    this.pressureMaterial = createPressureMaterial();

    this.#buildHall();
    this.#buildNozzle();
    this.#buildCollector();
    this.#buildRollingRoad();
    this.#buildLights();
    this.#buildRake();
    this.smoke = new Smoke();
    this.group.add(this.smoke.object);
    this.display = new WallDisplay();
    this.display.group.rotation.y = Math.PI / 2;
    this.display.group.position.set(-HALL.halfWidth + 0.08, 3.7, 1.2);
    this.group.add(this.display.group);
    this.environment = this.#buildEnvironment(renderer);
    this.#placeRake();
  }

  #buildHall() {
    const { halfWidth, height, nozzleZ, collectorZ } = HALL;
    const length = collectorZ - nozzleZ;
    const midZ = (nozzleZ + collectorZ) / 2;

    const floor = new THREE.PlaneGeometry(2 * halfWidth, length);
    const mirror = new Reflector(floor, { textureWidth: 1024, textureHeight: 1024, color: 0x8c8c8c, clipBias: 0.003 });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.z = midZ;
    const epoxy = new THREE.Mesh(
      floor,
      std({
        map: hallFloorTexture(2 * halfWidth, length, nozzleZ, {
          nozzleZ,
          collectorZ,
          nozzleW: NOZZLE.w,
          collectorW: COLLECTOR.w,
          turntable: TURNTABLE,
        }),
        roughness: 0.42,
        metalness: 0.1,
        transparent: true,
        opacity: 0.86,
      }),
    );
    epoxy.rotation.x = -Math.PI / 2;
    epoxy.position.set(0, 0.002, midZ);
    epoxy.receiveShadow = true;
    this.group.add(mirror, epoxy);

    const wall = std({ map: acousticPanelTexture([length / 4, height / 4]), roughness: 0.92 });
    for (const sign of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(length, height), wall);
      side.rotation.y = -sign * (Math.PI / 2);
      side.position.set(sign * halfWidth, height / 2, midZ);
      side.receiveShadow = true;
      this.group.add(side);
    }
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(2 * halfWidth, length), std({ color: 0x15171a, roughness: 0.95 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, height, midZ);
    this.group.add(ceiling);

    // Control room window on the right wall.
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.9), new THREE.MeshBasicMaterial({ map: controlRoomTexture(), color: 0x9aa3b0 }));
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(halfWidth - 0.02, 2.75, -0.5);
    const frame = std({ color: 0x0f1113, roughness: 0.6, metalness: 0.4 });
    this.group.add(glass, box(0.08, 0.1, 6.6, frame, halfWidth - 0.05, 1.75, -0.5), box(0.08, 0.1, 6.6, frame, halfWidth - 0.05, 3.75, -0.5));

    // Overhead LED strip fixtures and the rails that carry them.
    this.fixtures = [];
    const led = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const housing = std({ color: 0x2b2e33, roughness: 0.6, metalness: 0.5 });
    for (const x of [-4.5, -1.5, 1.5, 4.5])
      for (const z of [-5.6, -1.6, 2.4, 6.4]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 3.4), led);
        strip.position.set(x, height - 0.1, z);
        this.group.add(strip, box(0.26, 0.08, 3.5, housing, x, height - 0.05, z));
      }
  }

  #buildNozzle() {
    const { halfWidth, height, nozzleZ } = HALL;
    const wall = std({ map: acousticPanelTexture([1, 1]), roughness: 0.9 });
    wall.map.repeat.set(0.25, 0.25); // shape UVs are in metres
    const face = wallWithOpening(halfWidth, height, NOZZLE.w, NOZZLE.h, wall);
    face.position.z = nozzleZ;
    const inside = duct(NOZZLE.w, NOZZLE.h, NOZZLE.depth, std({ map: ductTexture([2, 1]), roughness: 0.55, metalness: 0.3 }));
    inside.rotation.y = Math.PI; // runs upstream, towards -Z
    inside.position.z = nozzleZ;
    const honeycomb = new THREE.Mesh(
      new THREE.PlaneGeometry(NOZZLE.w, NOZZLE.h),
      new THREE.MeshBasicMaterial({ map: honeycombTexture([6, 3.25]), color: 0x8e96a0 }),
    );
    honeycomb.position.set(0, NOZZLE.h / 2, nozzleZ - NOZZLE.depth + 0.05);
    // Rounded lip around the jet exit.
    const lip = std({ color: 0xa3a9b1, roughness: 0.35, metalness: 0.7 });
    const t = 0.28;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9 * (160 / 2048)),
      new THREE.MeshBasicMaterial({ map: signTexture('GALLERIA DEL VENTO  ·  CAMERA DI PROVA 1'), transparent: true, depthWrite: false }),
    );
    sign.position.set(0, NOZZLE.h + 1.1, nozzleZ + 0.02);
    this.group.add(
      face,
      inside,
      honeycomb,
      sign,
      box(NOZZLE.w + 2 * t, t, 0.5, lip, 0, NOZZLE.h + t / 2, nozzleZ + 0.1),
      box(t, NOZZLE.h, 0.5, lip, -NOZZLE.w / 2 - t / 2, NOZZLE.h / 2, nozzleZ + 0.1),
      box(t, NOZZLE.h, 0.5, lip, NOZZLE.w / 2 + t / 2, NOZZLE.h / 2, nozzleZ + 0.1),
    );
  }

  #buildCollector() {
    const { halfWidth, height, collectorZ } = HALL;
    const wall = std({ map: acousticPanelTexture([1, 1]), roughness: 0.9 });
    wall.map.repeat.set(0.25, 0.25);
    const face = wallWithOpening(halfWidth, height, COLLECTOR.w, COLLECTOR.h, wall);
    face.rotation.y = Math.PI;
    face.position.z = collectorZ;
    const inside = duct(COLLECTOR.w, COLLECTOR.h, COLLECTOR.depth, std({ color: 0x24272b, roughness: 0.7, metalness: 0.3 }));
    inside.position.z = collectorZ;
    const bell = std({ color: 0x3a3e44, roughness: 0.4, metalness: 0.6 });
    const t = 0.45;
    this.group.add(
      face,
      inside,
      box(COLLECTOR.w + 2 * t, t, 0.7, bell, 0, COLLECTOR.h + t / 2, collectorZ - 0.2),
      box(t, COLLECTOR.h, 0.7, bell, -COLLECTOR.w / 2 - t / 2, COLLECTOR.h / 2, collectorZ - 0.2),
      box(t, COLLECTOR.h, 0.7, bell, COLLECTOR.w / 2 + t / 2, COLLECTOR.h / 2, collectorZ - 0.2),
    );

    // The fan at the end of the collector duct, behind a guard.
    const fanZ = collectorZ + COLLECTOR.depth - 0.8;
    const fanY = COLLECTOR.h / 2;
    const dark = std({ color: 0x1b1d20, roughness: 0.5, metalness: 0.6 });
    const bladeMaterial = std({ color: 0x5b6068, roughness: 0.4, metalness: 0.7 });
    this.fan = new THREE.Group();
    this.fan.position.set(0, fanY, fanZ);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.9, 32).rotateX(Math.PI / 2), dark);
    this.fan.add(hub);
    for (let i = 0; i < 9; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.95, 0.62), bladeMaterial);
      blade.position.y = 0.55 + 0.97;
      blade.rotation.y = 0.55; // pitch
      const arm = new THREE.Group();
      arm.rotation.z = (i / 9) * Math.PI * 2;
      arm.add(blade);
      this.fan.add(arm);
    }
    const shroud = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.1, 12, 64), dark);
    shroud.position.set(0, fanY, fanZ);
    const guard = new THREE.Group();
    guard.position.set(0, fanY, fanZ - 0.7);
    for (let r = 0.7; r < 2.7; r += 0.5) guard.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 6, 64), dark));
    for (let i = 0; i < 12; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.7, 0.04), dark);
      bar.position.y = 1.35;
      const spoke = new THREE.Group();
      spoke.rotation.z = (i / 12) * Math.PI * 2;
      spoke.add(bar);
      guard.add(spoke);
    }
    const fanLight = new THREE.PointLight(0x9fb2d9, 14, 9, 2);
    fanLight.position.set(0, COLLECTOR.h - 0.6, fanZ - 2.2);
    this.group.add(this.fan, shroud, guard, fanLight);
  }

  #buildRollingRoad() {
    this.beltMap = beltTexture();
    this.beltMap.repeat.set(1, BELT.l / BELT.tile);
    const belt = new THREE.Mesh(
      new THREE.PlaneGeometry(BELT.w, BELT.l),
      std({ map: this.beltMap, metalness: 0.7, roughness: 0.42, color: 0x7b8087 }),
    );
    belt.rotation.x = -Math.PI / 2;
    belt.position.y = 0.006;
    belt.receiveShadow = true;
    const steel = std({ color: 0x5d6168, roughness: 0.4, metalness: 0.8 });
    const housing = std({ color: 0x1f2226, roughness: 0.6, metalness: 0.4 });
    this.group.add(
      belt,
      box(0.14, 0.014, BELT.l + 0.3, steel, -BELT.w / 2 - 0.07, 0.007, 0),
      box(0.14, 0.014, BELT.l + 0.3, steel, BELT.w / 2 + 0.07, 0.007, 0),
      box(BELT.w + 0.28, 0.012, 0.18, housing, 0, 0.006, -BELT.l / 2 - 0.09),
      box(BELT.w + 0.28, 0.012, 0.18, housing, 0, 0.006, BELT.l / 2 + 0.09),
    );
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, alphaMap: blobTexture(), opacity: 0.6, depthWrite: false }),
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.009;
    this.group.add(this.blob);
  }

  #buildLights() {
    const hemi = new THREE.HemisphereLight(0xb9c4d4, 0x0a0b0d, 0.35);
    const key = new THREE.DirectionalLight(0xf4f6ff, 1.9);
    key.position.set(1.2, 12, -1.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -4.5, right: 4.5, top: 5.5, bottom: -5.5, near: 4, far: 20 });
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    this.group.add(hemi, key, key.target);
    for (const [x, z, intensity] of [
      [-5, 1.5, 110],
      [5, 1.5, 110],
      [0, -6, 70],
      [0, 7, 60],
    ]) {
      const spot = new THREE.SpotLight(0xffffff, intensity, 22, 0.55, 0.95, 2);
      spot.position.set(x, HALL.height - 0.3, z);
      spot.target.position.set(0, 0.6, 0);
      this.group.add(spot, spot.target);
    }
  }

  #buildRake() {
    const metal = std({ color: 0x9ea4ab, roughness: 0.3, metalness: 0.9 });
    const dark = std({ color: 0x2a2d31, roughness: 0.5, metalness: 0.6 });
    // Traverse rail on the ceiling: the rake slides along it.
    this.group.add(box(12, 0.14, 0.22, dark, 0, CEILING_RAIL, RAKE_Z));
    this.rake = new THREE.Group();
    this.rakeParts = { metal, dark };
    this.group.add(this.rake);
  }

  /** Rebuilds the rake for the current settings and tells the smoke where its nozzles are. */
  #placeRake() {
    const { rake: mode, rakePos } = this.settings;
    this.rake.traverse((o) => o.geometry?.dispose());
    this.rake.clear();
    const { metal, dark } = this.rakeParts;
    const nozzles = [];
    const tube = (from, to, radius, material) => {
      const a = new THREE.Vector3(...from);
      const b = new THREE.Vector3(...to);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 10), material);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      m.castShadow = true;
      this.rake.add(m);
    };
    const tip = (x, y) => {
      tube([x, y, RAKE_Z], [x, y, RAKE_Z + 0.07], 0.006, metal);
      nozzles.push([x, y, RAKE_Z + 0.075]);
    };
    if (mode === 'vertical') {
      const x = rakePos * 1.3;
      tube([x, 0.08, RAKE_Z], [x, RAKE_TOP, RAKE_Z], 0.016, metal);
      tube([x, RAKE_TOP, RAKE_Z], [x, CEILING_RAIL, RAKE_Z], 0.024, dark);
      for (let y = 0.1; y <= RAKE_TOP - 0.05; y += 0.125) tip(x, y);
    } else if (mode === 'horizontal') {
      const y = 0.12 + ((rakePos + 1) / 2) * 1.3;
      tube([-1.55, y, RAKE_Z], [1.55, y, RAKE_Z], 0.016, metal);
      for (const x of [-1.55, 1.55]) tube([x, y, RAKE_Z], [x, CEILING_RAIL, RAKE_Z], 0.022, dark);
      for (let x = -1.4; x <= 1.401; x += 0.2) tip(x, y);
    } else {
      tube([0, CEILING_RAIL - 1.2, RAKE_Z], [0, CEILING_RAIL, RAKE_Z], 0.024, dark); // parked up by the ceiling
    }
    this.rake.add(box(0.2, 0.18, 0.3, dark, mode === 'vertical' ? rakePos * 1.3 : 0, CEILING_RAIL - 0.12, RAKE_Z));
    this.smoke.setNozzles(nozzles);
    this.smoke.emitting = mode !== 'off';
  }

  /** Reflections for the car paint: the dark hall with its rows of LED strips and the glowing nozzle. */
  #buildEnvironment(renderer) {
    const room = new THREE.Scene();
    const shell = new THREE.Mesh(new THREE.BoxGeometry(22, 8, 26), new THREE.MeshBasicMaterial({ color: 0x1b1d21, side: THREE.BackSide }));
    shell.position.y = 4;
    room.add(shell);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 26), new THREE.MeshBasicMaterial({ color: 0x0e0f11 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    room.add(floor);
    const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(14) });
    for (const x of [-4.5, -1.5, 1.5, 4.5])
      for (const z of [-5.6, -1.6, 2.4, 6.4]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 3.4), strip);
        m.rotation.x = Math.PI / 2;
        m.position.set(x, 7.9, z);
        room.add(m);
      }
    const nozzle = new THREE.Mesh(new THREE.PlaneGeometry(NOZZLE.w, NOZZLE.h), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.37, 0.4) }));
    nozzle.position.set(0, NOZZLE.h / 2, -12.9);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.14, 0.26) }));
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(10.9, 2.75, -0.5);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.22, 0.26) }));
    screen.rotation.y = Math.PI / 2;
    screen.position.set(-10.9, 3.7, 1.2);
    room.add(nozzle, glass, screen);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const texture = pmrem.fromScene(room, 0.02).texture;
    pmrem.dispose();
    return texture;
  }

  /** Puts `car` on the belt: solves (or reuses) its flow field and sizes its contact shadow. */
  setCar(car) {
    if (this.car && this.car !== car) this.releaseCar();
    this.car = car;
    this.grid = carFlow(car);
    this.smoke.setGrid(this.grid);
    setPressureField(this.pressureMaterial, this.grid);
    this.blob.scale.set(car.size.x * 1.25, car.size.z * 1.12, 1);
    this.#applyPressure();
  }

  /** Gives the car back its own materials and stops its wheels. */
  releaseCar() {
    for (const [mesh, material] of this.savedMaterials) mesh.material = material;
    this.savedMaterials.clear();
    for (const w of this.car?.wheels ?? []) w.hub?.rotation.set(0, 0, 0);
    this.smoke.clear();
    this.car = null;
  }

  #applyPressure() {
    if (!this.car) return;
    if (this.settings.pressure && !this.savedMaterials.size)
      this.car.root.traverseVisible((o) => {
        if (!o.isMesh) return;
        this.savedMaterials.set(o, o.material);
        o.material = this.pressureMaterial;
      });
    else if (!this.settings.pressure) {
      for (const [mesh, material] of this.savedMaterials) mesh.material = material;
      this.savedMaterials.clear();
    }
  }

  /** @param {Partial<{kmh:number, rake:'vertical'|'horizontal'|'off', rakePos:number, pressure:boolean}>} changes */
  set(changes) {
    const before = { ...this.settings };
    Object.assign(this.settings, changes);
    if (before.rake !== this.settings.rake || before.rakePos !== this.settings.rakePos) this.#placeRake();
    if (before.pressure !== this.settings.pressure) this.#applyPressure();
  }

  /** Aerodynamic figures for the current car at the current wind speed. */
  get readout() {
    const aero = aeroFor(this.car?.entry.id);
    const area = this.grid?.frontalArea ?? 0;
    return { ...aero, area, kmh: this.settings.kmh, ...aeroForces(aero, area, this.settings.kmh) };
  }

  setViewport(heightPx, fovDeg) {
    this.smoke.setViewport(heightPx, fovDeg);
  }

  update(dt) {
    const speed = this.settings.kmh * DRAWN_SPEED;
    this.beltMap.offset.y += (speed * dt) / BELT.tile;
    this.fan.rotation.z -= (this.settings.kmh / 320) * 9 * dt;
    for (const w of this.car?.wheels ?? []) if (w.hub) w.hub.rotation.x += (speed / w.radius) * dt;
    this.smoke.update(dt, speed);
    const r = this.readout;
    const lift = r.downforceKg < 0;
    this.display.draw({
      title: `${this.car?.entry.name ?? ''} · GALLERIA DEL VENTO`.toUpperCase(),
      speed: String(Math.round(r.kmh)),
      rows: [
        ['Cx · Area frontale', `${r.cd.toFixed(2)} · ${r.area.toFixed(2)} m²`],
        ['Resistenza', `${Math.round(r.drag)} N`],
        [lift ? 'Portanza' : 'Deportanza', `${Math.round(Math.abs(r.downforceKg))} kg`, lift ? '#ff8a65' : '#7fd1ff'],
        ['Potenza assorbita', `${r.powerKw.toFixed(1)} kW`],
      ],
    });
  }
}
