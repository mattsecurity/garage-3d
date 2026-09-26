import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { CARS, getCar } from '../src/cars/catalog.js';

describe('catalog', () => {
  it('has eleven cars with unique ids', () => {
    expect(CARS).toHaveLength(11);
    expect(new Set(CARS.map((c) => c.id)).size).toBe(11);
  });

  it('every entry is complete', () => {
    for (const c of CARS) {
      expect(c.name, c.id).toBeTruthy();
      expect(c.year, c.id).toBeGreaterThan(1900);
      expect(c.file, c.id).toBe(`models/${c.id}.glb`);
      expect(c.sourceUrl, c.id).toMatch(/^https:\/\//);
      expect(['+z', '-z'], c.id).toContain(c.forward);
      expect(c.length, c.id).toBeGreaterThan(3);
      expect(c.wheelPattern, c.id).toBeInstanceOf(RegExp);
      expect(c.paintPattern === null || c.paintPattern instanceof RegExp, c.id).toBe(true);
      expect(c.credit.title && c.credit.author && c.credit.license && c.credit.url, c.id).toBeTruthy();
      expect(c.credit.licenseUrl === null || /^https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/$/.test(c.credit.licenseUrl), c.id).toBe(true);
      if (c.credit.license === 'CC-BY-4.0') expect(c.credit.licenseUrl, c.id).toBeTruthy();
      expect(c.maxTextureSize === undefined || (Number.isInteger(c.maxTextureSize) && c.maxTextureSize >= 256), c.id).toBe(true);
    }
  });

  it('every model has been downloaded (npm run models)', () => {
    for (const c of CARS) {
      const url = new URL(`../public/${c.file}`, import.meta.url);
      expect(existsSync(url), c.file).toBe(true);
      expect(statSync(url).size, c.file).toBeGreaterThan(100_000);
    }
  });

  it('getCar finds by id', () => {
    expect(getCar('mclaren-p1').name).toBe('McLaren P1');
    expect(getCar('nope')).toBeNull();
  });
});
