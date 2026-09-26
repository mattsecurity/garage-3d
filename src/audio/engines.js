// Engine sound profile per car. Pure data (no Web Audio) so Node tests and the audio worklet can both read it.
//
// cylinders: crank angle (degrees in the 720° four-stroke cycle) at which each cylinder fires, and the exhaust bank
// it blows into. rpm figures are real; `gearbox.gears` are "audio gears": the speed fraction (of the game's top speed)
// at which each gear reaches its upshift rpm. The driving model reaches top speed in ~1.3 s, so real 7–8 speed boxes are
// folded into 4–5 evenly spread gears. exhaust.pipes: length in metres of each bank's pipe; muffler: low-pass (Hz);
// brightness: how much of the radiated (differentiated) flow is heard vs the raw flow; body: [Hz, dB, Q] resonance.
// turbo.whistle: whistle pitch (Hz) at no/full spool; hybrid.whine / gearWhine: electric and straight-cut gear whines.

/**
 * @param {number[]} order firing order (cylinder numbers from 1)
 * @param {(cylinder:number) => number} bankOf exhaust bank (0 or 1) of each cylinder
 * @returns {{angle:number, bank:number}[]} one entry per cylinder, in cylinder-number order, evenly spaced firing
 */
export function evenFiring(order, bankOf = () => 0) {
  const step = 720 / order.length;
  return order
    .map((cylinder, i) => ({ cylinder, angle: i * step, bank: bankOf(cylinder) }))
    .sort((a, b) => a.cylinder - b.cylinder)
    .map(({ angle, bank }) => ({ angle, bank }));
}

const firstHalf = (n) => (c) => (c <= n ? 0 : 1);
const oddEven = (c) => (c % 2 === 1 ? 0 : 1);

// Ferrari numbering: 1–4 right bank, 5–8 left. Flat-plane crank: each bank fires every 180°, like two inline fours.
const V8_FLAT = evenFiring([1, 5, 3, 7, 4, 8, 2, 6], firstHalf(4));
// GM LT numbering: odd cylinders on the left bank. Cross-plane crank: each bank fires at 180/270/180/90°, the burble.
const V8_CROSS = evenFiring([1, 8, 7, 2, 6, 5, 4, 3], oddEven);
// 90° V10 with split crankpins: even 72° firing, each bank every 144°.
const V10 = evenFiring([1, 6, 5, 10, 2, 7, 3, 8, 4, 9], firstHalf(5));
const V6_60 = evenFiring([1, 2, 3, 4, 5, 6], oddEven);
// F1 1.6 V6: both banks feed the single turbine, so one exhaust.
const V6_F1 = evenFiring([1, 4, 2, 5, 3, 6]);
const I4 = evenFiring([1, 3, 4, 2]);

const BASE = {
  launch: 0.42, // clutch-slip rpm while launching, as a fraction of redline
  revRate: 14000, // free-revving speed (rpm/s)
  variability: 0.05, // cycle-to-cycle combustion spread
  pops: 0.2, // overrun pops and crackles
  turbo: null,
  hybrid: null,
  gearWhine: { teeth: 0, level: 0 },
  starter: { type: 'motor', time: 0.7 },
  squealHz: 900,
  gain: 1,
};

/** Modern hybrid F1 power unit (2014–2025): shared by the F1-75 and the MCL39, tweaked per car. */
const F1_HYBRID = {
  ...BASE,
  label: '1.6 V6 turbo ibrido',
  cylinders: V6_F1,
  idle: 4500,
  redline: 12000,
  limiter: 12500,
  launch: 0.62,
  revRate: 32000,
  variability: 0.035,
  exhaust: { pipes: [1.4], muffler: 7000, reflection: -0.45, brightness: 1.2, level: 1, body: [260, 2, 1] },
  intake: { level: 0.45, airbox: 420 },
  mechanical: { level: 0.2, modes: [950, 2300, 4600], valves: 0.05 },
  turbo: { whistle: [3500, 9000], level: 0.08, bov: 0, muffle: 0.25 },
  hybrid: { whine: 3100, level: 0.1 },
  gearWhine: { teeth: 21, level: 0.035 },
  gearbox: { gears: [0.24, 0.43, 0.62, 0.8, 1.06], type: 'seamless', shiftTime: 0.015 },
  pops: 0.6,
  starter: { type: 'mguk', time: 0.8 },
  squealHz: 620,
};

/** 2026 power unit: no MGU-H (a louder turbo and exhaust) and a much stronger MGU-K. */
const F1_2026 = {
  ...F1_HYBRID,
  label: '1.6 V6 turbo ibrido (2026)',
  idle: 4600,
  redline: 11800,
  limiter: 12300,
  exhaust: { ...F1_HYBRID.exhaust, muffler: 7500, brightness: 1.3 },
  turbo: { ...F1_HYBRID.turbo, level: 0.14, muffle: 0.15 },
  hybrid: { whine: 3400, level: 0.2 },
  pops: 0.55,
};

export const ENGINES = {
  'ferrari-458': {
    ...BASE,
    label: '4.5 V8 aspirato, albero piatto',
    cylinders: V8_FLAT,
    idle: 1000,
    redline: 9000,
    limiter: 9100,
    revRate: 16000,
    exhaust: { pipes: [2.4, 2.4], muffler: 6000, reflection: -0.5, brightness: 1, level: 1, body: [110, 3, 1.2] },
    intake: { level: 0.35, airbox: 280 },
    mechanical: { level: 0.25, modes: [620, 1450, 2900], valves: 0.12 },
    gearbox: { gears: [0.3, 0.55, 0.8, 1.08], type: 'dct', shiftTime: 0.06 },
    pops: 0.5,
    starter: { type: 'motor', time: 0.6 },
  },
  'corvette-c8': {
    ...BASE,
    label: '6.2 V8 aspirato, albero a croce',
    cylinders: V8_CROSS,
    idle: 650,
    redline: 6600,
    limiter: 6700,
    revRate: 11000,
    variability: 0.07,
    exhaust: { pipes: [3.0, 3.1], muffler: 3200, reflection: -0.55, brightness: 0.7, level: 1, body: [85, 5, 1] },
    intake: { level: 0.3, airbox: 180 },
    mechanical: { level: 0.3, modes: [420, 1050, 2300], valves: 0.2 },
    gearbox: { gears: [0.3, 0.55, 0.8, 1.08], type: 'dct', shiftTime: 0.08 },
    pops: 0.3,
  },
  'mclaren-p1': {
    ...BASE,
    label: '3.8 V8 biturbo ibrido',
    cylinders: V8_FLAT,
    idle: 850,
    redline: 8500,
    limiter: 8600,
    revRate: 15000,
    exhaust: { pipes: [2.0, 2.0], muffler: 4200, reflection: -0.5, brightness: 0.9, level: 1, body: [120, 2, 1] },
    intake: { level: 0.3, airbox: 260 },
    mechanical: { level: 0.22, modes: [640, 1500, 3000], valves: 0.1 },
    turbo: { whistle: [2600, 7200], level: 0.18, bov: 0.25, muffle: 0.3 },
    hybrid: { whine: 2400, level: 0.05 },
    gearbox: { gears: [0.3, 0.55, 0.8, 1.08], type: 'dct', shiftTime: 0.06 },
    pops: 0.35,
  },
  'huracan-evo': {
    ...BASE,
    label: '5.2 V10 aspirato',
    cylinders: V10,
    idle: 1000,
    redline: 8500,
    limiter: 8700,
    revRate: 15000,
    exhaust: { pipes: [2.2, 2.2], muffler: 5500, reflection: -0.5, brightness: 1.1, level: 1, body: [140, 2, 1] },
    intake: { level: 0.4, airbox: 300 },
    mechanical: { level: 0.22, modes: [680, 1600, 3100], valves: 0.1 },
    gearbox: { gears: [0.3, 0.55, 0.8, 1.08], type: 'dct', shiftTime: 0.06 },
    pops: 0.9,
  },
  'gtr-r35': {
    ...BASE,
    label: '3.8 V6 biturbo',
    cylinders: V6_60,
    idle: 750,
    redline: 7000,
    limiter: 7100,
    revRate: 12000,
    exhaust: { pipes: [2.6, 2.6], muffler: 3000, reflection: -0.5, brightness: 0.8, level: 1, body: [100, 3, 1.1] },
    intake: { level: 0.35, airbox: 240 },
    mechanical: { level: 0.25, modes: [560, 1300, 2700], valves: 0.12 },
    turbo: { whistle: [2200, 6800], level: 0.3, bov: 0.6, muffle: 0.35 },
    gearWhine: { teeth: 29, level: 0.05 },
    gearbox: { gears: [0.3, 0.55, 0.8, 1.08], type: 'dct', shiftTime: 0.1 },
    pops: 0.15,
  },
  'mclaren-mp45': {
    ...BASE,
    label: '3.5 V10 aspirato (Honda, 1989)',
    cylinders: V10,
    idle: 3500,
    redline: 13000,
    limiter: 13300,
    launch: 0.55,
    revRate: 30000,
    variability: 0.04,
    exhaust: { pipes: [0.9, 0.9], muffler: 11000, reflection: -0.35, brightness: 1.4, level: 1, body: null },
    intake: { level: 0.6, airbox: 520 },
    mechanical: { level: 0.3, modes: [900, 2100, 4200], valves: 0.15 },
    gearWhine: { teeth: 23, level: 0.04 },
    gearbox: { gears: [0.26, 0.48, 0.7, 0.88, 1.06], type: 'manual', shiftTime: 0.16 },
    pops: 0.35,
    starter: { type: 'motor', time: 0.9 },
    squealHz: 700,
  },
  'ferrari-f1-75': F1_HYBRID,
  'mclaren-mcl39': {
    ...F1_HYBRID,
    idle: 4300,
    exhaust: { ...F1_HYBRID.exhaust, muffler: 6200, brightness: 1.1 },
    hybrid: { ...F1_HYBRID.hybrid, level: 0.11 },
    pops: 0.5,
  },
  'redbull-rb22': F1_2026,
  'haas-vf26': {
    ...F1_2026,
    exhaust: { ...F1_2026.exhaust, muffler: 7200, brightness: 1.25 },
    turbo: { ...F1_2026.turbo, level: 0.12 },
    hybrid: { ...F1_2026.hybrid, level: 0.18 },
  },
  'mini-cooper-s': {
    ...BASE,
    label: '1.3 4 cilindri in linea',
    cylinders: I4,
    idle: 800,
    redline: 6800,
    limiter: 7000,
    revRate: 9000,
    variability: 0.08,
    exhaust: { pipes: [2.8], muffler: 3800, reflection: -0.55, brightness: 0.9, level: 1, body: [160, 3, 1.3] },
    intake: { level: 0.5, airbox: 350 },
    mechanical: { level: 0.45, modes: [760, 1700, 3300], valves: 0.35 },
    gearWhine: { teeth: 37, level: 0.12 },
    gearbox: { gears: [0.3, 0.55, 0.8, 1.08], type: 'manual', shiftTime: 0.3 },
    pops: 0.1,
    starter: { type: 'motor', time: 0.8 },
    squealHz: 1100,
  },
};

/** @param {string} carId */
export function engineFor(carId) {
  return ENGINES[carId] ?? ENGINES['ferrari-458'];
}
