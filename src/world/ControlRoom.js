import * as THREE from 'three';
import { CP_RANGE } from '../aero/flow.js';
import { Crew } from './crew.js';
import { acousticPanelTexture, carpetTexture, ceilingTileTexture, glareTexture, rackTexture } from './tunnelTextures.js';

// The control room sits behind the hall's right wall (x = 11), a step above the hall floor, looking at the car
// through a long window. Tunnel space, metres.
const WALL_X = 11;
const WALL = 0.3; // wall thickness
const BACK_X = 16.8;
const HALF_Z = 5.4;
const FLOOR = 0.95;
const CEILING = 4.1;
const WIN = { z: 4.7, y0: 1.3, y1: 3.6 };
const DESK = { x0: WALL_X + WALL + 0.15, x1: WALL_X + WALL + 1.05, top: FLOOR + 0.74 };
const SEATS = [-3.6, -1.8, 0, 1.8, 3.6];
const CHAIR_X = 12.78;
const HALL = { z0: -8, z1: 10, height: 8 };

const std = (params) => new THREE.MeshStandardMaterial(params);

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

/** Flat wall in its local XY plane (facing +Z) with a rectangular window cut out. */
function wallWithWindow(x0, x1, y0, y1, hole, material) {
  const shape = new THREE.Shape();
  shape.moveTo(x0, y0);
  shape.lineTo(x1, y0);
  shape.lineTo(x1, y1);
  shape.lineTo(x0, y1);
  shape.closePath();
  const path = new THREE.Path();
  path.moveTo(hole.x0, hole.y0);
  path.lineTo(hole.x0, hole.y1);
  path.lineTo(hole.x1, hole.y1);
  path.lineTo(hole.x1, hole.y0);
  path.closePath();
  shape.holes.push(path);
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  mesh.receiveShadow = true;
  return mesh;
}

// Google's Turbo colormap (polynomial fit), t in [0, 1] → [r, g, b] 0..255.
function turbo(t) {
  const x = Math.min(Math.max(t, 0), 1);
  const r = 0.13572138 + x * (4.6153926 + x * (-42.66032258 + x * (132.13108234 + x * (-152.94239396 + x * 59.28637943))));
  const g = 0.09140261 + x * (2.19418839 + x * (4.84296658 + x * (-14.18503333 + x * (4.27729857 + x * 2.82956604))));
  const b = 0.1066733 + x * (12.64194608 + x * (-60.58204836 + x * (110.36276771 + x * (-89.90310912 + x * 27.34824973))));
  return [r, g, b].map((c) => Math.round(Math.min(Math.max(c, 0), 1) * 255));
}

/** A canvas-backed screen image that redraws itself at most `hz` times a second. */
class Screen {
  constructor(width, height, hz, draw) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.period = 1 / hz;
    this.wait = 0;
    this.draw = draw;
  }

  update(dt, state) {
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = this.period;
    this.draw(this.g, this.canvas.width, this.canvas.height, state);
    this.texture.needsUpdate = true;
  }
}

function header(g, w, title, subtitle) {
  g.fillStyle = '#070a0f';
  g.fillRect(0, 0, w, 999);
  g.fillStyle = '#0e1520';
  g.fillRect(0, 0, w, 44);
  g.fillStyle = '#e8eef5';
  g.font = '600 22px Inter, system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(title, 18, 23);
  g.fillStyle = '#7d8a99';
  g.font = '500 16px Inter, system-ui, sans-serif';
  g.textAlign = 'right';
  g.fillText(subtitle, w - 18, 23);
  g.textAlign = 'left';
}

/** Live aero readout with a scrolling history of drag and downforce. */
function drawTelemetry(g, w, h, s) {
  const r = s.readout;
  header(g, w, 'AERO · LIVE', s.carName.toUpperCase());
  g.fillStyle = '#f2f6fa';
  g.font = '600 96px Inter, system-ui, sans-serif';
  g.textBaseline = 'alphabetic';
  g.fillText(String(Math.round(r.kmh)), 22, 150);
  const speedWidth = g.measureText(String(Math.round(r.kmh))).width;
  g.fillStyle = '#7d8a99';
  g.font = '500 24px Inter, system-ui, sans-serif';
  g.fillText('km/h', 32 + speedWidth, 150);
  const lift = r.downforceKg < 0;
  const rows = [
    ['Cx', r.cd.toFixed(3)],
    ['Area', `${r.area.toFixed(2)} m²`],
    ['Resistenza', `${Math.round(r.drag)} N`],
    [lift ? 'Portanza' : 'Deportanza', `${Math.round(Math.abs(r.downforceKg))} kg`],
    ['Potenza', `${r.powerKw.toFixed(1)} kW`],
  ];
  g.font = '500 19px Inter, system-ui, sans-serif';
  rows.forEach(([label, value], i) => {
    const y = 205 + i * 38;
    g.fillStyle = '#7d8a99';
    g.fillText(label, 24, y);
    g.fillStyle = '#e8eef5';
    g.textAlign = 'right';
    g.fillText(value, 300, y);
    g.textAlign = 'left';
  });
  // History chart.
  const x0 = 340;
  const y0 = 70;
  const cw = w - x0 - 22;
  const ch = h - y0 - 30;
  g.strokeStyle = 'rgba(125,138,153,0.18)';
  g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(x0, y0 + (ch * i) / 4);
    g.lineTo(x0 + cw, y0 + (ch * i) / 4);
    g.stroke();
  }
  const hist = s.history;
  const maxDrag = Math.max(200, ...hist.map((p) => p.drag)) * 1.15;
  const maxDown = Math.max(50, ...hist.map((p) => Math.abs(p.down))) * 1.15;
  const plot = (key, max, color) => {
    g.strokeStyle = color;
    g.lineWidth = 2.5;
    g.beginPath();
    hist.forEach((p, i) => {
      const x = x0 + (i / (hist.length - 1 || 1)) * cw;
      const y = y0 + ch - (Math.abs(p[key]) / max) * ch;
      g[i ? 'lineTo' : 'moveTo'](x, y);
    });
    g.stroke();
  };
  plot('drag', maxDrag, '#ff8a3d');
  plot('down', maxDown, '#4fc3ff');
  g.font = '500 15px Inter, system-ui, sans-serif';
  g.fillStyle = '#ff8a3d';
  g.fillText('● Resistenza', x0, h - 10);
  g.fillStyle = '#4fc3ff';
  g.fillText('● Deportanza', x0 + 130, h - 10);
  g.fillStyle = '#7d8a99';
  g.textAlign = 'right';
  g.fillText('ultimi 60 s', x0 + cw, h - 10);
  g.textAlign = 'left';
}

/** Surface pressure seen from above and from the side, read off the solved flow. Drawn once per car. */
function pressureImage(grid) {
  const { nx, ny, nz, solid, cp } = grid;
  const at = (i, j, k) => i + nx * (j + ny * k);
  let k0 = nz;
  let k1 = 0;
  let i0 = nx;
  let i1 = 0;
  let j1 = 0;
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        if (solid[at(i, j, k)]) {
          k0 = Math.min(k0, k);
          k1 = Math.max(k1, k);
          i0 = Math.min(i0, i);
          i1 = Math.max(i1, i);
          j1 = Math.max(j1, j);
        }
  if (k0 > k1) return null;
  const pad = 2;
  k0 = Math.max(0, k0 - pad);
  k1 = Math.min(nz - 1, k1 + pad);
  i0 = Math.max(0, i0 - pad);
  i1 = Math.min(nx - 1, i1 + pad);
  j1 = Math.min(ny - 1, j1 + pad);
  const w = k1 - k0 + 1;
  const toColor = (value) => turbo((value - CP_RANGE[0]) / (CP_RANGE[1] - CP_RANGE[0]));
  const make = (h, sample) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const img = c.getContext('2d').createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const value = sample(k0 + x, y);
        if (value === null) continue;
        const [r, g, b] = toColor(value);
        img.data.set([r, g, b, 255], (y * w + x) * 4);
      }
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  };
  // Top: the highest solid cell of each column, pressure just above it. Air flows left to right.
  const top = make(i1 - i0 + 1, (k, y) => {
    const i = i1 - y;
    for (let j = ny - 2; j >= 0; j--) if (solid[at(i, j, k)]) return cp[at(i, j + 1, k)];
    return null;
  });
  // Side: the outermost solid cell on the viewer's side.
  const side = make(j1 + 1, (k, y) => {
    const j = j1 - y;
    for (let i = nx - 2; i >= 0; i--) if (solid[at(i, j, k)]) return cp[at(i + 1, j, k)];
    return null;
  });
  return { top, side };
}

function drawPressure(g, w, h, s) {
  header(g, w, 'PRESSIONE SUPERFICIALE · Cp', 'CFD · flusso potenziale');
  const img = s.pressure;
  if (!img) return;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  const fit = (c, x, y, maxW, maxH) => {
    const k = Math.min(maxW / c.width, maxH / c.height);
    const dw = c.width * k;
    const dh = c.height * k;
    g.drawImage(c, x + (maxW - dw) / 2, y + (maxH - dh) / 2, dw, dh);
  };
  g.fillStyle = '#7d8a99';
  g.font = '500 15px Inter, system-ui, sans-serif';
  g.fillText('VISTA DALL’ALTO', 22, 70);
  fit(img.top, 20, 80, w - 40, 215);
  g.fillStyle = '#7d8a99';
  g.fillText('VISTA LATERALE', 22, 318);
  fit(img.side, 20, 326, w - 40, 170);
  // Colour bar.
  const bx = 22;
  const by = h - 38;
  const bw = w - 44;
  for (let x = 0; x < bw; x++) {
    const [r, gg, b] = turbo(x / bw);
    g.fillStyle = `rgb(${r},${gg},${b})`;
    g.fillRect(bx + x, by, 1, 10);
  }
  g.fillStyle = '#9aa7b5';
  g.font = '500 14px Inter, system-ui, sans-serif';
  g.fillText(String(CP_RANGE[0]), bx, h - 10);
  g.textAlign = 'center';
  g.fillText('0', bx + (bw * -CP_RANGE[0]) / (CP_RANGE[1] - CP_RANGE[0]), h - 10);
  g.textAlign = 'right';
  g.fillText(`+${CP_RANGE[1]}`, bx + bw, h - 10);
  g.textAlign = 'left';
}

/** Side camera on the smoke: every puff projected onto the car's centre plane, the car as a silhouette. */
function drawSmokeCam(g, w, h, s) {
  const view = { z0: -3.6, z1: 4.4, y0: -0.25 };
  const scale = w / (view.z1 - view.z0);
  const img = s.camImage ?? (s.camImage = g.createImageData(w, h));
  const glow = s.camGlow ?? (s.camGlow = new Float32Array(w * h));
  glow.fill(0);
  const smoke = s.smoke;
  if (smoke)
    for (let i = 0; i < smoke.age.length; i++) {
      if (smoke.age[i] < 0) continue;
      const x = Math.round((smoke.pos[i * 3 + 2] - view.z0) * scale);
      const y = Math.round(h - (smoke.pos[i * 3 + 1] - view.y0) * scale);
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      const a = smoke.fade[i] / (1 + smoke.stir[i] * 6);
      const c = y * w + x;
      glow[c] += a;
      glow[c - 1] += a * 0.35;
      glow[c + 1] += a * 0.35;
      glow[c - w] += a * 0.35;
      glow[c + w] += a * 0.35;
    }
  const data = img.data;
  const silhouette = s.silhouette;
  for (let p = 0, q = 0; p < w * h; p++, q += 4) {
    const y = Math.floor(p / w);
    let base = 10 + (y / h) * 10;
    if (silhouette && silhouette[p]) base = 48;
    const v = Math.min(255, base + glow[p] * 150);
    data[q] = v * 0.94;
    data[q + 1] = v * 0.97;
    data[q + 2] = v;
    data[q + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, w, 34);
  g.fillStyle = '#ff3b30';
  g.beginPath();
  g.arc(20, 17, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e8eef5';
  g.font = '600 16px Inter, system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('CAM 2 · FUMO', 34, 17);
  g.textAlign = 'right';
  g.fillStyle = '#9aa7b5';
  g.fillText(`${Math.round(s.readout.kmh)} km/h · ${new Date().toLocaleTimeString('it-IT')}`, w - 14, 17);
  g.textAlign = 'left';
}

/** The car's side silhouette on the smoke camera, from the flow grid (1 = solid). */
function silhouette(grid, w, h) {
  if (!grid) return null;
  const { nx, ny, nz, h: cell, min, solid } = grid;
  // Side projection first: is any cell across the car solid at this height and station?
  const side = new Uint8Array(ny * nz);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        if (solid[i + nx * (j + ny * k)]) {
          side[j + ny * k] = 1;
          break;
        }
  const view = { z0: -3.6, z1: 4.4, y0: -0.25 };
  const scale = w / (view.z1 - view.z0);
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const j = Math.floor((view.y0 + (h - y - 0.5) / scale - min[1]) / cell);
    if (j < 0 || j >= ny) continue;
    for (let x = 0; x < w; x++) {
      const k = Math.floor((view.z0 + (x + 0.5) / scale - min[2]) / cell);
      if (k >= 0 && k < nz && side[j + ny * k]) mask[y * w + x] = 1;
    }
  }
  return mask;
}

function drawClock(g, w, h) {
  g.fillStyle = '#050608';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#ff453a';
  g.font = '600 70px "DM Mono", ui-monospace, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(new Date().toLocaleTimeString('it-IT'), w / 2, h / 2 + 4);
  g.textAlign = 'left';
}

/** Monitor with a thin bezel on a stand; the screen faces +Z. */
function monitor(texture, width, height, materials) {
  const g = new THREE.Group();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, color: 0xd9dee6 }));
  screen.position.z = 0.016;
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(width + 0.024, height + 0.024, 0.03), materials.plastic);
  const back = new THREE.Mesh(new THREE.BoxGeometry(width * 0.6, height * 0.6, 0.04), materials.plastic);
  back.position.z = -0.03;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.03), materials.metal);
  neck.position.set(0, -height / 2 - 0.06, -0.05);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.015, 0.18), materials.metal);
  foot.position.set(0, -height / 2 - 0.17, -0.02);
  g.add(screen, bezel, back, neck, foot);
  return g;
}

/** Mesh-back office chair; the seat faces +Z. */
function chair(materials) {
  const g = new THREE.Group();
  const seatH = 0.48;
  g.add(box(0.5, 0.07, 0.48, materials.fabric, 0, seatH, 0.02));
  const back = box(0.46, 0.6, 0.05, materials.fabric, 0, seatH + 0.38, -0.24);
  back.rotation.x = -0.12;
  g.add(back);
  for (const s of [-1, 1]) {
    g.add(box(0.04, 0.2, 0.05, materials.black, s * 0.26, seatH + 0.1, -0.02));
    g.add(box(0.06, 0.03, 0.28, materials.black, s * 0.26, seatH + 0.21, 0.02));
  }
  const lift = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 12), materials.metal);
  lift.position.y = 0.26;
  g.add(lift);
  for (let i = 0; i < 5; i++) {
    const leg = box(0.05, 0.035, 0.32, materials.black, 0, 0.07, 0);
    leg.geometry.translate(0, 0, 0.16);
    leg.rotation.y = (i / 5) * Math.PI * 2;
    const caster = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), materials.black);
    caster.position.set(Math.sin(leg.rotation.y) * 0.31, 0.025, Math.cos(leg.rotation.y) * 0.31);
    g.add(leg, caster);
  }
  return g;
}

/**
 * Glass-fronted control room beside the test section: engineers at a console watching the car, their monitors and a
 * wall of live screens (aero figures, surface pressure from the solved flow, a smoke camera).
 */
export class ControlRoom {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'control-room';
    this.time = 0;
    this.history = [];
    this.sampleWait = 0;
    this.state = { carName: '', readout: null, history: this.history, pressure: null, smoke: null, silhouette: null };
    const materials = {
      plastic: std({ color: 0x17191c, roughness: 0.55, metalness: 0.1 }),
      metal: std({ color: 0x7c828a, roughness: 0.35, metalness: 0.8 }),
      black: std({ color: 0x101113, roughness: 0.5, metalness: 0.2 }),
      fabric: std({ color: 0x22252a, roughness: 0.95 }),
      desk: std({ color: 0x2c3036, roughness: 0.45, metalness: 0.15 }),
      deskTop: std({ color: 0x3a3e45, roughness: 0.35, metalness: 0.1 }),
    };
    this.materials = materials;
    this.screens = {
      telemetry: new Screen(1024, 576, 4, drawTelemetry),
      pressure: new Screen(1024, 576, 0.5, drawPressure),
      smoke: new Screen(768, 432, 12, drawSmokeCam),
      clock: new Screen(512, 128, 1, drawClock),
    };
    this.#buildShell();
    this.#buildWindow();
    this.#buildConsole();
    this.#buildVideoWall();
    this.#buildLights();
    const seated = { model: 'm', yaw: -Math.PI / 2, seatHeight: 0.48 };
    this.crew = new Crew(this.group, [
      { ...seated, pose: 'typing', position: [CHAIR_X + 0.06, FLOOR, SEATS[0]], tint: 0x2f3b52, hair: 0x2a1f18, headset: true },
      { ...seated, pose: 'typing', position: [CHAIR_X + 0.06, FLOOR, SEATS[1]], scale: 0.96, tint: 0x3d4450, hair: 0x8a6a4a, beard: false, look: 'car' },
      { ...seated, pose: 'relaxed', position: [CHAIR_X + 0.1, FLOOR, SEATS[2]], yaw: -Math.PI / 2 - 0.15, tint: 0x4a4f57, beard: false, hair: 0xb89a6a, look: 'car' },
      { ...seated, pose: 'typing', position: [CHAIR_X + 0.06, FLOOR, SEATS[3]], scale: 0.98, tint: 0x24262a, hair: 0x6d6a66, headset: true },
      { ...seated, pose: 'relaxed', position: [CHAIR_X + 0.1, FLOOR, SEATS[4]], yaw: -Math.PI / 2 + 0.2, scale: 0.95, tint: 0x5b6470, hair: 0x3b2a1e },
      { model: 'm', pose: 'standing', position: [14.7, FLOOR, 0.95], yaw: -Math.PI / 2 - 0.3, tint: 0x1e2533, hair: 0x15110e, look: 'car' },
    ]);
  }

  #buildShell() {
    // The hall's right wall, with the window cut into it (faces the hall, -X).
    const hallSide = std({ map: acousticPanelTexture([1, 1]), roughness: 0.92 });
    hallSide.map.repeat.set(0.25, 0.25); // shape UVs are in metres
    const outer = wallWithWindow(HALL.z0, HALL.z1, 0, HALL.height, { x0: -WIN.z, x1: WIN.z, y0: WIN.y0, y1: WIN.y1 }, hallSide);
    outer.rotation.y = -Math.PI / 2; // local +X → world +Z, facing -X
    outer.position.x = WALL_X;
    // The same wall seen from inside the room (faces +X).
    const roomWall = std({ map: acousticPanelTexture([1, 1]), roughness: 0.9, color: 0x9aa0a8 });
    roomWall.map.repeat.set(0.25, 0.25);
    const inner = wallWithWindow(-HALF_Z, HALF_Z, FLOOR, CEILING, { x0: -WIN.z, x1: WIN.z, y0: WIN.y0, y1: WIN.y1 }, roomWall);
    inner.rotation.y = Math.PI / 2;
    inner.position.x = WALL_X + WALL;
    this.group.add(outer, inner);

    const depth = BACK_X - (WALL_X + WALL);
    const midX = (BACK_X + WALL_X + WALL) / 2;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(depth, 2 * HALF_Z), std({ map: carpetTexture([depth / 2, HALF_Z]), roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(midX, FLOOR, 0);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(depth, 2 * HALF_Z), std({ map: ceilingTileTexture([depth / 2.4, (2 * HALF_Z) / 2.4]), roughness: 0.95 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(midX, CEILING, 0);
    const walls = std({ map: acousticPanelTexture([depth / 4, (CEILING - FLOOR) / 4]), roughness: 0.9, color: 0x9aa0a8 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF_Z, CEILING - FLOOR), std({ map: acousticPanelTexture([(2 * HALF_Z) / 4, (CEILING - FLOOR) / 4]), roughness: 0.9, color: 0x80868e }));
    back.rotation.y = -Math.PI / 2;
    back.position.set(BACK_X, (FLOOR + CEILING) / 2, 0);
    this.group.add(floor, ceiling, back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(depth, CEILING - FLOOR), walls);
      side.rotation.y = s < 0 ? 0 : Math.PI;
      side.position.set(midX, (FLOOR + CEILING) / 2, s * HALF_Z);
      this.group.add(side);
    }
    // Recessed ceiling light panels.
    const panel = new THREE.MeshBasicMaterial({ color: 0xfff4e6 });
    for (const x of [13.2, 15.4]) for (const z of [-3, 0, 3]) this.group.add(box(0.6, 0.02, 0.6, panel, x, CEILING - 0.01, z));
    // Server rack in the back corner, door with a glass pane.
    const rack = box(0.62, 2.05, 0.9, this.materials.black, BACK_X - 0.5, FLOOR + 1.025, -HALF_Z + 0.5);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 1.95), new THREE.MeshBasicMaterial({ map: rackTexture() }));
    face.rotation.y = -Math.PI / 2;
    face.position.set(BACK_X - 0.81 - 0.001, FLOOR + 1.025, -HALF_Z + 0.5);
    this.group.add(rack, face);
  }

  #buildWindow() {
    // Reveal: sill, head and jambs lining the opening through the wall.
    const frame = std({ color: 0x1a1c20, roughness: 0.4, metalness: 0.6 });
    const cx = WALL_X + WALL / 2;
    const h = WIN.y1 - WIN.y0;
    this.group.add(
      box(WALL, 0.05, 2 * WIN.z, frame, cx, WIN.y0 - 0.025, 0),
      box(WALL, 0.05, 2 * WIN.z, frame, cx, WIN.y1 + 0.025, 0),
      box(WALL, h, 0.05, frame, cx, (WIN.y0 + WIN.y1) / 2, -WIN.z - 0.025),
      box(WALL, h, 0.05, frame, cx, (WIN.y0 + WIN.y1) / 2, WIN.z + 0.025),
    );
    for (const z of [-WIN.z / 2, 0, WIN.z / 2]) this.group.add(box(0.07, h, 0.06, frame, cx, (WIN.y0 + WIN.y1) / 2, z));
    // Glass: a light tint you see through, plus the reflections of the hall's LED strips on top of it.
    const pane = new THREE.PlaneGeometry(2 * WIN.z, h);
    const tint = new THREE.Mesh(pane, new THREE.MeshBasicMaterial({ color: 0x0c1b26, transparent: true, opacity: 0.12, depthWrite: false }));
    const glare = new THREE.Mesh(
      pane,
      new THREE.MeshBasicMaterial({ map: glareTexture(), color: 0x3a4652, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    const sheen = new THREE.Mesh(
      pane,
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0.04,
        metalness: 0,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    for (const [m, dx] of [
      [tint, 0.01],
      [sheen, -0.01],
      [glare, -0.015],
    ]) {
      m.rotation.y = -Math.PI / 2;
      m.position.set(cx + dx, (WIN.y0 + WIN.y1) / 2, 0);
      m.renderOrder = 3;
      this.group.add(m);
    }
  }

  #buildConsole() {
    const { desk, deskTop } = this.materials;
    const len = 2 * (WIN.z - 0.2);
    const depth = DESK.x1 - DESK.x0;
    const midX = (DESK.x0 + DESK.x1) / 2;
    this.group.add(
      box(depth, 0.04, len, deskTop, midX, DESK.top - 0.02, 0),
      box(0.04, DESK.top - FLOOR - 0.04, len, desk, DESK.x0 + 0.02, (DESK.top + FLOOR) / 2 - 0.02, 0),
      box(0.3, DESK.top - FLOOR - 0.04, len, desk, DESK.x0 + 0.17, (DESK.top + FLOOR) / 2 - 0.02, 0),
    );
    // A thin blue light strip under the desk edge, as in most modern control rooms.
    this.group.add(box(0.01, 0.012, len - 0.1, new THREE.MeshBasicMaterial({ color: 0x3b8cff }), DESK.x1 - 0.01, DESK.top - 0.05, 0));
    const feeds = [this.screens.telemetry.texture, this.screens.smoke.texture, this.screens.pressure.texture];
    SEATS.forEach((z, i) => {
      for (const [s, dz] of [
        [-1, -0.31],
        [1, 0.31],
      ]) {
        // Low on the desk, so the window still shows the faces behind them.
        const m = monitor(feeds[(i + (s > 0 ? 1 : 0)) % feeds.length], 0.5, 0.29, this.materials);
        m.position.set(DESK.x0 + 0.4, DESK.top + 0.24, z + dz);
        m.rotation.set(0, Math.PI / 2 - s * 0.22, 0); // screens face the engineer (+X), angled in
        m.rotateX(-0.12);
        this.group.add(m);
      }
      this.group.add(box(0.16, 0.02, 0.44, this.materials.black, DESK.x1 - 0.18, DESK.top + 0.01, z)); // keyboard
      this.group.add(box(0.1, 0.02, 0.06, this.materials.black, DESK.x1 - 0.2, DESK.top + 0.01, z + 0.34)); // mouse
      const seat = chair(this.materials);
      seat.position.set(CHAIR_X, FLOOR, z);
      seat.rotation.y = -Math.PI / 2 + (i % 2 ? 0.1 : -0.08);
      this.group.add(seat);
    });
    // A mug and some paper, lived-in touches.
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.1, 16), std({ color: 0xf2f2f2, roughness: 0.3 }));
    mug.position.set(DESK.x1 - 0.3, DESK.top + 0.05, 0.75);
    const paper = box(0.21, 0.004, 0.297, std({ color: 0xf5f5f0, roughness: 0.9 }), DESK.x1 - 0.35, DESK.top + 0.002, -1.2);
    paper.rotation.y = 0.3;
    this.group.add(mug, paper);
  }

  #buildVideoWall() {
    const w = 2.3;
    const h = w * (9 / 16);
    const y = FLOOR + 1.85;
    [this.screens.pressure, this.screens.telemetry, this.screens.smoke].forEach((screen, i) => {
      const m = monitor(screen.texture, w, h, this.materials);
      m.children.slice(3).forEach((c) => (c.visible = false)); // wall-mounted: no stand
      m.position.set(BACK_X - 0.06, y, (i - 1) * (w + 0.12));
      m.rotation.y = -Math.PI / 2;
      this.group.add(m);
    });
    const clock = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.225), new THREE.MeshBasicMaterial({ map: this.screens.clock.texture }));
    clock.rotation.y = -Math.PI / 2;
    clock.position.set(BACK_X - 0.02, y + h / 2 + 0.3, 0);
    this.group.add(clock, box(0.03, 0.26, 0.94, this.materials.black, BACK_X - 0.005, y + h / 2 + 0.3, 0));
  }

  #buildLights() {
    // Warm ceiling light, the cool glow of the console monitors on the faces, the video wall behind.
    const ceiling = new THREE.PointLight(0xffe2c0, 40, 10, 2);
    ceiling.position.set(14.2, CEILING - 0.3, 0);
    const monitors = new THREE.PointLight(0x8ab8ff, 18, 5, 2);
    monitors.position.set(DESK.x0 + 0.5, DESK.top + 0.45, 0);
    const wall = new THREE.PointLight(0x9fc4ff, 12, 6, 2);
    wall.position.set(BACK_X - 0.8, FLOOR + 1.9, 0);
    this.group.add(ceiling, monitors, wall);
  }

  /** New car on the belt: redraw its pressure map and camera silhouette. */
  setCar(car, grid) {
    this.state.carName = car.entry.name;
    this.state.pressure = pressureImage(grid);
    this.state.silhouette = silhouette(grid, this.screens.smoke.canvas.width, this.screens.smoke.canvas.height);
    this.history.length = 0;
    this.screens.pressure.wait = 0;
  }

  /**
   * @param {number} dt seconds
   * @param {{readout: object, smoke: object, car: THREE.Vector3}} live tunnel readout, smoke particles, car centre
   */
  update(dt, { readout, smoke, car }) {
    this.time += dt;
    this.state.readout = readout;
    this.state.smoke = smoke;
    this.sampleWait -= dt;
    if (this.sampleWait <= 0) {
      this.sampleWait = 0.25;
      // Balance readings wobble a little: real load cells never sit perfectly still.
      const noise = () => 1 + (Math.random() - 0.5) * 0.02;
      this.history.push({ drag: readout.drag * noise(), down: readout.downforceKg * noise() });
      if (this.history.length > 240) this.history.shift();
    }
    for (const screen of Object.values(this.screens)) screen.update(dt, this.state);
    this.crew.update(dt, this.time, car);
  }
}
