// Canvas-generated textures, so the scene needs no image files.
import * as THREE from 'three';

function canvas(width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return [c, c.getContext('2d')];
}

function toTexture(c) {
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Blue self-healing cutting mat: worn surface, grid, diagonals, ruler ticks and numbers. */
export function cuttingMatTexture(w, d, ppu = 100) {
  const [c, g] = canvas(Math.round(w * ppu), Math.round(d * ppu));
  g.fillStyle = '#284470';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
    g.beginPath();
    g.arc(Math.random() * c.width, Math.random() * c.height, 20 + Math.random() * 140, 0, Math.PI * 2);
    g.fill();
  }
  const margin = 0.6 * ppu;
  const line = (x1, y1, x2, y2) => {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };
  g.strokeStyle = 'rgba(190,210,240,0.22)';
  g.lineWidth = 1;
  for (let x = margin; x <= c.width - margin + 1; x += ppu * 0.5) line(x, margin, x, c.height - margin);
  for (let y = margin; y <= c.height - margin + 1; y += ppu * 0.5) line(margin, y, c.width - margin, y);
  g.strokeStyle = 'rgba(220,235,255,0.5)';
  g.lineWidth = 2;
  for (let x = margin; x <= c.width - margin + 1; x += ppu * 2) line(x, margin, x, c.height - margin);
  for (let y = margin; y <= c.height - margin + 1; y += ppu * 2) line(margin, y, c.width - margin, y);
  g.strokeStyle = 'rgba(220,235,255,0.25)';
  g.lineWidth = 1.5;
  const cx = c.width / 2;
  const cy = c.height / 2;
  const r = Math.min(cx, cy) - margin;
  line(cx - r, cy - r, cx + r, cy + r);
  line(cx - r, cy + r, cx + r, cy - r);
  g.beginPath();
  g.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
  g.stroke();
  // Ruler ticks on every edge, longer every whole unit.
  g.strokeStyle = 'rgba(235,242,255,0.8)';
  g.lineWidth = 2;
  for (let x = margin, i = 0; x <= c.width - margin + 1; x += ppu * 0.25, i++) {
    const len = i % 4 === 0 ? 0.28 * ppu : 0.14 * ppu;
    line(x, margin - len, x, margin);
    line(x, c.height - margin, x, c.height - margin + len);
  }
  for (let y = margin, i = 0; y <= c.height - margin + 1; y += ppu * 0.25, i++) {
    const len = i % 4 === 0 ? 0.28 * ppu : 0.14 * ppu;
    line(margin - len, y, margin, y);
    line(c.width - margin, y, c.width - margin + len, y);
  }
  g.fillStyle = 'rgba(235,242,255,0.85)';
  g.font = `${Math.round(ppu * 0.2)}px "DM Mono", monospace`;
  g.textAlign = 'center';
  for (let x = margin, n = 0; x <= c.width - margin + 1; x += ppu * 2, n += 2) g.fillText(String(n), x, margin - 0.34 * ppu);
  return toTexture(c);
}

/** Ruler face: metric ticks and numbers on brushed aluminium. */
export function rulerTexture(length, width, ppu = 120) {
  const [c, g] = canvas(Math.round(length * ppu), Math.round(width * ppu));
  g.fillStyle = '#c9ccd0';
  g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < c.height; y += 2) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`;
    g.fillRect(0, y, c.width, 1);
  }
  g.strokeStyle = '#2a2a2a';
  g.fillStyle = '#2a2a2a';
  g.font = `${Math.round(ppu * 0.16)}px "DM Mono", monospace`;
  const step = ppu * 0.1;
  for (let i = 0, x = ppu * 0.2; x < c.width - ppu * 0.2; i++, x += step) {
    const len = i % 10 === 0 ? 0.3 : i % 5 === 0 ? 0.2 : 0.12;
    g.lineWidth = i % 10 === 0 ? 2 : 1;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, len * ppu);
    g.stroke();
    if (i % 10 === 0) g.fillText(String(i / 10), x + 3, 0.46 * ppu);
  }
  return toTexture(c);
}

/** Paint-tin label band: coloured stripe with a generic name. */
export function jarLabelTexture(color) {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#f1efe8';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = color;
  g.fillRect(0, 76, 512, 30);
  g.fillStyle = '#1b1b1b';
  g.font = 'bold 34px "DM Mono", monospace';
  for (const x of [20, 276]) g.fillText('ENAMEL', x, 56);
  g.font = '16px "DM Mono", monospace';
  for (const x of [190, 446]) g.fillText('14ml', x, 56);
  return toTexture(c);
}

/** Radial gradient for alpha maps: `inner` grey level at the centre, white at the rim. */
export function radialTexture(inner = 110) {
  const [c, g] = canvas(256, 256);
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, `rgb(${inner},${inner},${inner})`);
  grad.addColorStop(0.35, `rgb(${inner + 50},${inner + 50},${inner + 50})`);
  grad.addColorStop(1, 'rgb(255,255,255)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(c);
  return texture;
}

/** Small tag with a sprue letter (A, B, C...). */
export function letterTexture(letter) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#c4c7cb';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#8d9196';
  g.font = 'bold 84px "DM Mono", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 64, 70);
  return toTexture(c);
}
