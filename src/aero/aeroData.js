// Indicative aerodynamic coefficients per car, from published figures where there are any, otherwise estimates for
// the body type. cd = drag coefficient, cl = lift coefficient (negative = downforce), both on the frontal area the
// tunnel measures from the model.

export const AERO = {
  'ferrari-458': { cd: 0.33, cl: -0.36 }, // Ferrari quotes 140 kg of downforce at 200 km/h
  'corvette-c8': { cd: 0.34, cl: -0.2 },
  'mclaren-p1': { cd: 0.34, cl: -0.9 }, // up to 600 kg of downforce in Race mode
  'huracan-evo': { cd: 0.36, cl: -0.3 },
  'gtr-r35': { cd: 0.26, cl: -0.06 },
  'mclaren-mp45': { cd: 1.0, cl: -2.8 }, // late-80s Formula 1: drag and downforce of a winged open-wheeler
  'ferrari-f1-75': { cd: 0.8, cl: -3.2 }, // 2022–25 ground-effect Formula 1: most of the downforce comes from the floor
  'mclaren-mcl39': { cd: 0.8, cl: -3.2 }, // same generation as the F1-75
  'redbull-rb22': { cd: 0.7, cl: -2.2 }, // 2026 rules: roughly a third less downforce, and less drag, than 2025
  'haas-vf26': { cd: 0.7, cl: -2.2 }, // same 2026 body as the RB22
  'mini-cooper-s': { cd: 0.4, cl: 0.25 }, // 1960s saloon: boxy, with some lift
};

const FALLBACK = { cd: 0.35, cl: 0 };
const AIR_DENSITY = 1.225; // kg/m³ at sea level, 15 °C
const G = 9.81;

/** @param {string} id catalog id */
export function aeroFor(id) {
  return AERO[id] ?? FALLBACK;
}

/**
 * Forces on the car at a given air speed.
 * @param {{cd:number, cl:number}} coefficients
 * @param {number} area frontal area, m²
 * @param {number} kmh air speed
 * @returns {{q:number, drag:number, downforceKg:number, powerKw:number}} dynamic pressure (Pa), drag (N),
 *   downforce (kg, negative = lift) and the power needed to push through the air (kW)
 */
export function aeroForces({ cd, cl }, area, kmh) {
  const v = kmh / 3.6;
  const q = 0.5 * AIR_DENSITY * v * v;
  const drag = q * cd * area;
  return { q, drag, downforceKg: (-q * cl * area) / G, powerKw: (drag * v) / 1000 };
}
