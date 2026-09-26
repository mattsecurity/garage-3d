import { describe, it, expect } from 'vitest';
import { CHORDS, KEY, createComposer } from '../src/audio/composer.js';

const bars = (seed, n) => {
  const c = createComposer(seed);
  return Array.from({ length: n }, () => c.next());
};

describe('composer', () => {
  it('keeps every note in D minor', () => {
    for (const bar of bars(3, 200))
      for (const note of bar.notes) for (const midi of note.notes) expect(KEY, `${bar.index} ${note.voice}`).toContain(midi % 12);
    for (const chord of Object.values(CHORDS)) for (const midi of [chord.bass, ...chord.pad]) expect(KEY).toContain(midi % 12);
  });

  it('is repeatable for a seed and different for another', () => {
    const a = JSON.stringify(bars(7, 64));
    expect(JSON.stringify(bars(7, 64))).toBe(a);
    expect(JSON.stringify(bars(8, 64))).not.toBe(a);
  });

  it('builds up: pads and blips first, drums later', () => {
    const all = bars(1, 80);
    const voices = (from, to) => new Set(all.slice(from, to).flatMap((b) => b.notes.map((n) => n.voice)));
    expect(voices(0, 8).has('pad')).toBe(true);
    expect(voices(0, 8).has('kick')).toBe(false);
    expect(voices(0, 8).has('arp')).toBe(false);
    expect(voices(8, 16).has('arp')).toBe(true);
    expect(voices(16, 80).has('kick')).toBe(true);
    expect(voices(16, 80).has('snare')).toBe(true);
  });

  it('starts a pad chord every two bars and keeps notes inside the bar', () => {
    for (const bar of bars(5, 64)) {
      expect(bar.notes.some((n) => n.voice === 'pad')).toBe(bar.index % 2 === 0);
      for (const n of bar.notes) {
        expect(n.time).toBeGreaterThanOrEqual(0);
        expect(n.time).toBeLessThan(4);
      }
    }
  });
});
