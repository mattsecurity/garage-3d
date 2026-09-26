import { describe, it, expect } from 'vitest';
import { AERO, aeroFor, aeroForces } from '../src/aero/aeroData.js';
import { CARS } from '../src/cars/catalog.js';

describe('aero data', () => {
  it('has coefficients for every car in the garage', () => {
    for (const car of CARS) expect(AERO[car.id], car.id).toBeDefined();
  });

  it('falls back for unknown cars', () => expect(aeroFor('nope').cd).toBeGreaterThan(0));

  it('matches Ferrari’s 140 kg of downforce at 200 km/h on a ~2 m² frontal area', () => {
    const { downforceKg } = aeroForces(AERO['ferrari-458'], 2.0, 200);
    expect(downforceKg).toBeGreaterThan(125);
    expect(downforceKg).toBeLessThan(155);
  });

  it('grows with the square of speed; power with the cube', () => {
    const slow = aeroForces({ cd: 0.3, cl: -0.2 }, 2, 100);
    const fast = aeroForces({ cd: 0.3, cl: -0.2 }, 2, 200);
    expect(fast.drag / slow.drag).toBeCloseTo(4, 5);
    expect(fast.powerKw / slow.powerKw).toBeCloseTo(8, 5);
    expect(aeroForces({ cd: 0.3, cl: -0.2 }, 2, 0).drag).toBe(0);
  });

  it('reports lift as negative downforce', () => expect(aeroForces({ cd: 0.4, cl: 0.25 }, 1.6, 150).downforceKg).toBeLessThan(0));
});
