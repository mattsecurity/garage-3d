import { describe, it, expect } from 'vitest';
import { CARS } from '../src/cars/catalog.js';
import { ENGINES, engineFor, evenFiring } from '../src/audio/engines.js';

const bankGaps = (cylinders, bank) => {
  const angles = cylinders
    .filter((c) => c.bank === bank)
    .map((c) => c.angle)
    .sort((a, b) => a - b);
  return angles.map((a, i) => ((angles[(i + 1) % angles.length] - a + 720) % 720) || 720);
};

describe('engine profiles', () => {
  it('every car has one', () => {
    for (const car of CARS) {
      expect(ENGINES[car.id], car.id).toBeTruthy();
      expect(engineFor(car.id), car.id).toBe(ENGINES[car.id]);
    }
  });

  it('are complete and consistent', () => {
    for (const [id, e] of Object.entries(ENGINES)) {
      expect(e.label, id).toBeTruthy();
      expect(e.cylinders.length, id).toBeGreaterThanOrEqual(4);
      for (const c of e.cylinders) {
        expect(c.angle, id).toBeGreaterThanOrEqual(0);
        expect(c.angle, id).toBeLessThan(720);
        expect([0, 1], id).toContain(c.bank);
      }
      expect(new Set(e.cylinders.map((c) => c.angle)).size, id).toBe(e.cylinders.length);
      const banks = new Set(e.cylinders.map((c) => c.bank)).size;
      expect(e.exhaust.pipes.length, id).toBe(banks);
      expect(e.idle, id).toBeLessThan(e.redline * 0.5);
      expect(e.limiter, id).toBeGreaterThan(e.redline);
      const { gears, type, shiftTime } = e.gearbox;
      expect(gears.length, id).toBeGreaterThanOrEqual(4);
      gears.forEach((g, i) => i > 0 && expect(g, id).toBeGreaterThan(gears[i - 1]));
      expect(gears.at(-1), id).toBeGreaterThanOrEqual(1);
      expect(['dct', 'seamless', 'manual'], id).toContain(type);
      expect(shiftTime, id).toBeGreaterThan(0);
    }
  });

  it('fire evenly overall', () => {
    for (const [id, e] of Object.entries(ENGINES)) {
      const angles = e.cylinders.map((c) => c.angle).sort((a, b) => a - b);
      const step = 720 / angles.length;
      angles.forEach((a, i) => expect(a, id).toBeCloseTo(i * step));
    }
  });

  it('give a flat-plane V8 even banks and a cross-plane V8 uneven ones', () => {
    expect(bankGaps(ENGINES['ferrari-458'].cylinders, 0)).toEqual([180, 180, 180, 180]);
    expect(bankGaps(ENGINES['ferrari-458'].cylinders, 1)).toEqual([180, 180, 180, 180]);
    const cross = bankGaps(ENGINES['corvette-c8'].cylinders, 0);
    expect(new Set(cross).size).toBeGreaterThan(1);
    expect(cross.reduce((a, b) => a + b)).toBe(720);
  });

  it('evenFiring places cylinders in firing order', () => {
    expect(evenFiring([1, 3, 4, 2]).map((c) => c.angle)).toEqual([0, 540, 180, 360]);
  });
});
