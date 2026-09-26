// Canvas-generated textures for the wind tunnel hall, so it needs no image files.
import * as THREE from 'three';

function canvas(width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return [c, c.getContext('2d')];
}

function toTexture(c, { repeat = [1, 1], srgb = true } = {}) {
  const texture = new THREE.CanvasTexture(c);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  return texture;
}

function mottle(g, w, h, count, alpha, light = true) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = light ? `rgba(255,255,255,${Math.random() * alpha})` : `rgba(0,0,0,${Math.random() * alpha})`;
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, 8 + Math.random() * 90, 0, Math.PI * 2);
    g.fill();
  }
}

/** Perforated acoustic wall panels, 1 x 2 m, with seams. One texture covers 4 x 4 m. */
export function acousticPanelTexture(repeat) {
  const [c, g] = canvas(1024, 1024);
  const ppm = 256;
  g.fillStyle = '#2a2d32';
  g.fillRect(0, 0, 1024, 1024);
  for (let px = 0; px < 4; px++)
    for (let py = 0; py < 2; py++) {
      const shade = 40 + Math.floor(Math.random() * 8);
      g.fillStyle = `rgb(${shade},${shade + 3},${shade + 8})`;
      g.fillRect(px * ppm + 3, py * 2 * ppm + 3, ppm - 6, 2 * ppm - 6);
    }
  g.fillStyle = 'rgba(0,0,0,0.55)';
  for (let y = 10; y < 1024; y += 9)
    for (let x = 10; x < 1024; x += 9) if (x % ppm > 8 && x % ppm < ppm - 8 && y % (2 * ppm) > 8 && y % (2 * ppm) < 2 * ppm - 8) g.fillRect(x, y, 2, 2);
  mottle(g, 1024, 1024, 120, 0.025);
  return toTexture(c, { repeat });
}

/** Smooth painted steel for the nozzle and collector ducts. */
export function ductTexture(repeat) {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#50555c';
  g.fillRect(0, 0, 512, 512);
  mottle(g, 512, 512, 90, 0.04);
  mottle(g, 512, 512, 60, 0.05, false);
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 2;
  for (let x = 0; x <= 512; x += 128) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 512);
    g.stroke();
  }
  return toTexture(c, { repeat });
}

/**
 * Epoxy test-hall floor seen from above, `w` x `d` metres, centred on x = 0 and running from z = z0: turntable ring,
 * safety lines, hazard bands at the nozzle and collector, flow arrows.
 */
export function hallFloorTexture(w, d, z0, { nozzleZ, collectorZ, nozzleW, collectorW, turntable }) {
  const ppm = 64;
  const [c, g] = canvas(Math.round(w * ppm), Math.round(d * ppm));
  const X = (x) => (x + w / 2) * ppm;
  const Z = (z) => (z - z0) * ppm;
  g.fillStyle = '#1c1e21';
  g.fillRect(0, 0, c.width, c.height);
  mottle(g, c.width, c.height, 900, 0.03);
  mottle(g, c.width, c.height, 500, 0.05, false);
  for (let i = 0; i < 400; i++) {
    g.strokeStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    g.lineWidth = 1;
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    const a = Math.random() * Math.PI;
    const l = 20 + Math.random() * 120;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  // Turntable: a flush steel disc with a seam and a ring of bolts.
  const cx = X(0);
  const cz = Z(0);
  const r = turntable * ppm;
  const grad = g.createRadialGradient(cx, cz, r * 0.2, cx, cz, r);
  grad.addColorStop(0, '#2a2d31');
  grad.addColorStop(1, '#25282c');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cz, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.lineWidth = 5;
  g.stroke();
  g.strokeStyle = 'rgba(200,205,212,0.35)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cz, r - 5, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(210,214,220,0.45)';
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 36) {
    g.beginPath();
    g.arc(cx + Math.cos(a) * (r - 22), cz + Math.sin(a) * (r - 22), 3, 0, Math.PI * 2);
    g.fill();
  }
  // Angle ticks around the turntable (yaw testing).
  g.strokeStyle = 'rgba(230,232,236,0.55)';
  for (let deg = 0; deg < 360; deg += 5) {
    const a = (deg * Math.PI) / 180;
    const l = deg % 30 === 0 ? 26 : 12;
    g.lineWidth = deg % 30 === 0 ? 3 : 1.5;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (r + 8), cz + Math.sin(a) * (r + 8));
    g.lineTo(cx + Math.cos(a) * (r + 8 + l), cz + Math.sin(a) * (r + 8 + l));
    g.stroke();
  }
  // Yellow safety line around the test area.
  g.strokeStyle = '#e1b400';
  g.lineWidth = 7;
  g.setLineDash([36, 20]);
  g.strokeRect(X(-6.2), Z(nozzleZ + 1.4), 12.4 * ppm, (collectorZ - nozzleZ - 2.8) * ppm);
  g.setLineDash([]);
  // Hazard bands in front of the nozzle and the collector.
  const hazard = (x0, x1, z, depth) => {
    g.save();
    g.beginPath();
    g.rect(X(x0), Z(z), (x1 - x0) * ppm, depth * ppm);
    g.clip();
    g.fillStyle = '#d9a900';
    g.fillRect(X(x0), Z(z), (x1 - x0) * ppm, depth * ppm);
    g.fillStyle = '#121212';
    for (let x = X(x0) - depth * ppm; x < X(x1); x += 40) {
      g.beginPath();
      g.moveTo(x, Z(z));
      g.lineTo(x + 20, Z(z));
      g.lineTo(x + 20 + depth * ppm, Z(z + depth));
      g.lineTo(x + depth * ppm, Z(z + depth));
      g.fill();
    }
    g.restore();
  };
  hazard(-nozzleW / 2, nozzleW / 2, nozzleZ + 0.05, 0.28);
  hazard(-collectorW / 2, collectorW / 2, collectorZ - 0.33, 0.28);
  // Flow arrows.
  g.fillStyle = 'rgba(235,238,242,0.5)';
  for (const x of [-4.8, 4.8])
    for (const z of [-5.5, -1.5, 2.5, 6.5]) {
      g.beginPath();
      g.moveTo(X(x - 0.35), Z(z));
      g.lineTo(X(x), Z(z + 0.55));
      g.lineTo(X(x + 0.35), Z(z));
      g.lineTo(X(x + 0.35), Z(z - 0.18));
      g.lineTo(X(x), Z(z + 0.37));
      g.lineTo(X(x - 0.35), Z(z - 0.18));
      g.fill();
    }
  g.font = `bold ${Math.round(0.34 * ppm)}px "DM Mono", monospace`;
  g.textAlign = 'center';
  g.fillStyle = 'rgba(235,238,242,0.45)';
  g.save();
  g.translate(X(-5.6), Z(1));
  g.rotate(Math.PI / 2);
  g.fillText('TEST SECTION · 1', 0, 0);
  g.restore();
  return toTexture(c);
}

/** Stainless rolling-road belt: brushed steel with faint cross streaks so its motion reads. 1.6 m per tile. */
export function beltTexture() {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#8b9097';
  g.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 512; y++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`;
    g.fillRect(0, y, 256, 1);
  }
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.1})`;
    g.fillRect(0, Math.random() * 512, 256, 2 + Math.random() * 6);
  }
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(255,255,255,${Math.random() * 0.12})`;
    g.beginPath();
    const x = Math.random() * 256;
    g.moveTo(x, Math.random() * 512);
    g.lineTo(x + (Math.random() - 0.5) * 6, Math.random() * 512);
    g.stroke();
  }
  return toTexture(c);
}

/** Flow-straightener honeycomb at the back of the nozzle, lit from behind. */
export function honeycombTexture(repeat) {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#d9dde3';
  g.fillRect(0, 0, 512, 512);
  const r = 16;
  const hw = Math.sqrt(3) * r;
  g.strokeStyle = '#3b3f45';
  g.lineWidth = 3;
  for (let row = -1; row < 512 / (1.5 * r) + 1; row++)
    for (let col = -1; col < 512 / hw + 1; col++) {
      const x = col * hw + (row % 2 ? hw / 2 : 0);
      const y = row * 1.5 * r;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.closePath();
      g.stroke();
    }
  const grad = g.createRadialGradient(256, 256, 40, 256, 256, 360);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  return toTexture(c, { repeat });
}

/** White stencil lettering on a transparent strip. */
export function signTexture(text, width = 2048, height = 160) {
  const [c, g] = canvas(width, height);
  g.fillStyle = 'rgba(235,238,242,0.85)';
  g.font = `500 ${Math.round(height * 0.62)}px "DM Mono", monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, width / 2, height / 2 + 4);
  const texture = toTexture(c);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Soft dark blob for contact shadows: opaque centre fading to clear at the edge (use as alphaMap). */
export function blobTexture() {
  const [c, g] = canvas(256, 256);
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, '#8c8c8c');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return toTexture(c, { srgb: false });
}

/** Dark blue-grey carpet tiles, 50 cm, for the control room floor. One texture covers 2 x 2 m. */
export function carpetTexture(repeat) {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#23272e';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.08})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 2;
  for (let x = 0; x <= 512; x += 128) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 512);
    g.stroke();
    g.beginPath();
    g.moveTo(0, x);
    g.lineTo(512, x);
    g.stroke();
  }
  return toTexture(c, { repeat });
}

/** Suspended-ceiling acoustic tiles, 60 cm. One texture covers 2.4 x 2.4 m. */
export function ceilingTileTexture(repeat) {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#2b2e33';
  g.fillRect(0, 0, 512, 512);
  mottle(g, 512, 512, 200, 0.03);
  g.fillStyle = '#16181b';
  for (let x = 0; x < 512; x += 128) {
    g.fillRect(x, 0, 4, 512);
    g.fillRect(0, x, 512, 4);
  }
  return toTexture(c, { repeat });
}

/** Front of a server rack: dark perforated doors with rows of status LEDs. */
export function rackTexture() {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#15171a';
  g.fillRect(0, 0, 256, 512);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 8; y < 512; y += 6) for (let x = 8; x < 248; x += 6) g.fillRect(x, y, 2, 2);
  for (let u = 0; u < 20; u++) {
    const y = 20 + u * 24;
    g.fillStyle = '#0c0d0f';
    g.fillRect(14, y, 228, 18);
    for (let k = 0; k < 6; k++) {
      g.fillStyle = ['#2bd46b', '#2bd46b', '#3aa0ff', '#ffb020', '#2bd46b', '#2bd46b'][(u + k) % 6];
      g.globalAlpha = Math.random() < 0.8 ? 1 : 0.25;
      g.fillRect(24 + k * 10, y + 7, 4, 4);
      g.globalAlpha = 1;
    }
  }
  return toTexture(c);
}

/** Hair: fine dark strands over mid tones, used as a multiply map on the hair shells. */
export function hairTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const l = 6 + Math.random() * 18;
    const shade = Math.random() < 0.5 ? 40 + Math.random() * 60 : 150 + Math.random() * 90;
    g.strokeStyle = `rgba(${shade},${shade},${shade},0.55)`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 3, y + l);
    g.stroke();
  }
  return toTexture(c, { repeat: [3, 2] });
}

/** Soft diagonal glare bands for window glass (use as an additive map). */
export function glareTexture() {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 256);
  for (const [x, w, a] of [
    [60, 70, 0.5],
    [150, 18, 0.35],
    [300, 110, 0.28],
    [440, 26, 0.4],
  ]) {
    const grad = g.createLinearGradient(x - w, 0, x + w, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.save();
    g.transform(1, 0, -0.45, 1, 60, 0); // slant
    g.fillStyle = grad;
    g.fillRect(x - w, 0, 2 * w, 256);
    g.restore();
  }
  const texture = toTexture(c);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
