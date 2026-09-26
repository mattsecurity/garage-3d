// Pure logic: turns a flat list of meshes (with car-space bounding boxes) into model-kit parts.
// Car space: forward +Z, up +Y, left +X, ground at y = 0.

export const CATEGORY_LABELS = {
  chassis: 'Telaio',
  body: 'Carrozzeria',
  interior: 'Abitacolo',
  glass: 'Vetri',
  lights: 'Fari',
  wheel: 'Ruota',
};

const KIND_ORDER = ['chassis', 'body', 'interior', 'glass', 'lights', 'wheel'];
const WHEEL_LABELS = { fl: 'Ruota ant. sx', fr: 'Ruota ant. dx', rl: 'Ruota post. sx', rr: 'Ruota post. dx' };

const CATEGORY_RULES = [
  ['lights', /light|lamp|leds?\b|indicator|signal|headl|taill|lens|projector/i],
  ['glass', /glass|window|windshield|windscreen|vitre|vetro/i],
  ['interior', /interior|\bint_|seat|leather|carpet|steer|dash|gauge|velvet|suede|belt|stitch|cockpit|display|button/i],
];

/** @param {{name?: string, material?: string, isPaint?: boolean}} mesh */
export function classifyMesh({ name = '', material = '', isPaint = false }) {
  if (isPaint) return 'body';
  const text = `${name} ${material}`;
  for (const [category, re] of CATEGORY_RULES) if (re.test(text)) return category;
  return 'chassis';
}

export const boxSize = (b) => b.max.map((v, i) => v - b.min[i]);
export const boxCenter = (b) => b.min.map((v, i) => (v + b.max[i]) / 2);
const boxDiag = (b) => Math.hypot(...boxSize(b));
const boxVolume = (b) => boxSize(b).reduce((acc, v) => acc * Math.max(v, 1e-4), 1);
const boxUnion = (a, b) => ({
  min: a.min.map((v, i) => Math.min(v, b.min[i])),
  max: a.max.map((v, i) => Math.max(v, b.max[i])),
});

function boxesNear(a, b, gap) {
  for (let i = 0; i < 3; i++) if (a.min[i] - gap > b.max[i] || b.min[i] - gap > a.max[i]) return false;
  return true;
}

function clusterByProximity(items, gap) {
  const parent = items.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) if (boxesNear(items[i].box, items[j].box, gap)) parent[find(i)] = find(j);
  const groups = new Map();
  items.forEach((item, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item);
  });
  return [...groups.values()];
}

/**
 * @param {Array<{id:number, name:string, material:string, isPaint:boolean, isWheel:boolean, box:{min:number[], max:number[]}}>} meshes
 * @param {{carLength:number, maxParts?:number}} options maxParts caps the non-wheel parts
 * @returns {Array<{id:string, kind:string, label:string, meshIds:number[], box:{min:number[], max:number[]}, pivot:number[], wheel?:string, radius?:number}>}
 *   ordered for assembly: chassis, body, interior, glass, lights, then wheels FL, FR, RL, RR
 */
export function buildParts(meshes, { carLength, maxParts = 10 }) {
  const parts = [];

  // Wheels: one part per corner. Left is +X, front is +Z.
  const corners = { fl: [], fr: [], rl: [], rr: [] };
  for (const m of meshes) {
    if (!m.isWheel) continue;
    const [x, , z] = boxCenter(m.box);
    corners[(z >= 0 ? 'f' : 'r') + (x >= 0 ? 'l' : 'r')].push(m);
  }
  for (const [key, members] of Object.entries(corners)) {
    if (!members.length) continue;
    // The tyre is the mesh with the largest diameter (its tread when sidewall and tread are separate meshes).
    const diameter = (m) => Math.max(...boxSize(m.box).slice(1));
    const main = members.reduce((a, b) => {
      const d = diameter(b) - diameter(a);
      return d > 1e-3 || (Math.abs(d) <= 1e-3 && boxVolume(b.box) > boxVolume(a.box)) ? b : a;
    });
    const [, sy, sz] = boxSize(main.box);
    parts.push({
      id: `wheel-${key}`,
      kind: 'wheel',
      wheel: key,
      label: WHEEL_LABELS[key],
      meshIds: members.map((m) => m.id),
      box: members.map((m) => m.box).reduce(boxUnion),
      pivot: boxCenter(main.box),
      radius: Math.max(sy, sz) / 2,
    });
  }

  // Everything else: group by category, then split each category into spatial clusters.
  const byKind = new Map();
  for (const m of meshes) {
    if (m.isWheel) continue;
    const kind = classifyMesh(m);
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(m);
  }
  const clusters = [];
  for (const [kind, list] of byKind)
    for (const members of clusterByProximity(list, carLength * 0.03))
      clusters.push({ kind, members, box: members.map((m) => m.box).reduce(boxUnion) });
  clusters.sort((a, b) => boxDiag(b.box) - boxDiag(a.box));

  if (clusters.length) {
    // Tiny clusters (and anything over the cap) are glued onto the biggest chassis cluster.
    const host = clusters.find((c) => c.kind === 'chassis') ?? clusters[0];
    const kept = [host];
    for (const c of clusters) {
      if (c === host) continue;
      if (boxDiag(c.box) >= carLength * 0.08 && kept.length < maxParts) kept.push(c);
      else {
        host.members.push(...c.members);
        host.box = boxUnion(host.box, c.box);
      }
    }
    kept.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || boxDiag(b.box) - boxDiag(a.box));
    const counts = {};
    for (const c of kept) {
      counts[c.kind] = (counts[c.kind] ?? 0) + 1;
      const n = counts[c.kind];
      parts.push({
        id: `${c.kind}-${n}`,
        kind: c.kind,
        label: n === 1 ? CATEGORY_LABELS[c.kind] : `${CATEGORY_LABELS[c.kind]} ${n}`,
        meshIds: c.members.map((m) => m.id),
        box: c.box,
        pivot: boxCenter(c.box),
      });
    }
  }
  return parts.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}
