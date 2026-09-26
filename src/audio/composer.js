// Generative ambient-electronic music for the wind tunnel. Pure: turns a seed into an endless list of bars (notes in
// beats); StudioMusic.js plays them. D minor, 92 BPM, chords every two bars, 8-bar phrases whose layers come and go.

export const BPM = 92;
export const BEATS_PER_BAR = 4;
/** Pitch classes of D natural minor. */
export const KEY = [2, 4, 5, 7, 9, 10, 0];

// Voicings (MIDI): pad without the root (the bass plays it), kept close so the chords glide into each other.
export const CHORDS = {
  Dm9: { bass: 38, pad: [53, 57, 60, 64] },
  Bbmaj9: { bass: 34, pad: [53, 57, 60, 62] },
  Fmaj9: { bass: 41, pad: [55, 57, 60, 64] },
  Csus: { bass: 36, pad: [55, 57, 62, 64] },
  Gm9: { bass: 43, pad: [53, 57, 58, 62] },
  Bbmaj7s11: { bass: 34, pad: [53, 57, 62, 64] },
  A7sus: { bass: 33, pad: [55, 57, 62, 64] },
};

const PROGRESSIONS = [
  { chords: ['Dm9', 'Bbmaj9', 'Fmaj9', 'Csus'], weight: 3 },
  { chords: ['Gm9', 'Dm9', 'Bbmaj7s11', 'A7sus'], weight: 2 },
  { chords: ['Dm9', 'Fmaj9', 'Bbmaj7s11', 'Csus'], weight: 2 },
  { chords: ['Bbmaj9', 'Csus', 'Dm9', 'Dm9'], weight: 1 },
];

// Layers per phrase: the first two build up, then the piece cycles through the rest in a shuffled order.
const INTRO = [
  { pad: 1, arp: 0, bass: 0, kick: 0, hats: 0, snare: 0, blips: 1 },
  { pad: 1, arp: 1, bass: 0, kick: 0, hats: 0, snare: 0, blips: 1 },
];
const SECTIONS = [
  { pad: 1, arp: 1, bass: 1, kick: 0, hats: 1, snare: 0, blips: 0 }, // groove without kick
  { pad: 1, arp: 1, bass: 1, kick: 1, hats: 1, snare: 0, blips: 1 },
  { pad: 1, arp: 1, bass: 1, kick: 1, hats: 1, snare: 1, blips: 0 }, // full
  { pad: 1, arp: 0.5, bass: 1, kick: 0, hats: 0, snare: 0, blips: 1 }, // breakdown
  { pad: 1, arp: 1, bass: 1, kick: 1, hats: 1, snare: 1, blips: 1 },
];
const BLIP_NOTES = [86, 89, 91, 93, 96]; // D minor pentatonic, high
const BASS_RHYTHMS = [
  [[0, 1.5], [2.5, 0.5], [3, 1]],
  [[0, 2], [2.75, 1.25]],
  [[0, 0.75], [1.5, 1], [3, 0.75]],
];

/** Small seeded PRNG (mulberry32). */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @typedef {{voice:'pad'|'arp'|'bass'|'kick'|'hat'|'snare'|'blip', time:number, duration:number, velocity:number,
 *   notes:number[]}} Note  time and duration in beats from the start of the bar; notes: MIDI numbers
 * @typedef {{index:number, chord:string, layers:object, notes:Note[]}} Bar
 */

/** @param {number} seed @returns {{next: () => Bar}} */
export function createComposer(seed = 1) {
  const rnd = random(seed);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const weighted = (list) => {
    let r = rnd() * list.reduce((s, item) => s + item.weight, 0);
    return list.find((item) => (r -= item.weight) < 0) ?? list[0];
  };

  let index = 0;
  let progression = PROGRESSIONS[0].chords;
  let layers = INTRO[0];
  let order = [];
  let arp = [];
  let bassRhythm = BASS_RHYTHMS[0];

  /** 16 steps: an index into the chord's arpeggio tones, or -1 for a rest. */
  function newArp() {
    let tone = Math.floor(rnd() * 3);
    return Array.from({ length: 16 }, (_, step) => {
      if (step % 4 !== 0 && rnd() < 0.3) return -1;
      tone = Math.min(Math.max(tone + pick([-1, 1, 1, 2, -2]), 0), 5);
      return tone;
    });
  }

  function startPhrase(phrase) {
    progression = phrase === 0 ? PROGRESSIONS[0].chords : weighted(PROGRESSIONS).chords;
    if (phrase < INTRO.length) layers = INTRO[phrase];
    else {
      if (!order.length) order = [...SECTIONS].sort(() => rnd() - 0.5);
      layers = order.pop();
    }
    if (!arp.length) arp = newArp();
    else for (let i = 0; i < 3; i++) arp[Math.floor(rnd() * 16)] = rnd() < 0.25 ? -1 : Math.floor(rnd() * 6); // mutate
    bassRhythm = pick(BASS_RHYTHMS);
  }

  function next() {
    const barInPhrase = index % 8;
    if (barInPhrase === 0) startPhrase(index / 8);
    const name = progression[Math.floor(barInPhrase / 2)];
    const chord = CHORDS[name];
    const notes = [];
    if (barInPhrase % 2 === 0) notes.push({ voice: 'pad', time: 0, duration: 8, velocity: 1, notes: chord.pad });

    if (layers.arp) {
      const tones = [...chord.pad.map((n) => n + 12), chord.pad[0] + 24, chord.pad[1] + 24];
      arp.forEach((tone, step) => {
        if (tone < 0 || (layers.arp < 1 && step % 2 === 1) || rnd() < 0.08) return;
        const accent = step % 4 === 0 ? 0.9 : 0.55 + rnd() * 0.15;
        notes.push({ voice: 'arp', time: step / 4, duration: 0.2, velocity: accent, notes: [tones[tone]] });
      });
    }
    if (layers.bass) {
      for (const [time, duration] of bassRhythm) {
        const note = time > 0 && rnd() < 0.2 ? chord.bass + 12 : chord.bass;
        notes.push({ voice: 'bass', time, duration, velocity: time === 0 ? 1 : 0.8, notes: [note] });
      }
    }
    if (layers.kick) {
      notes.push({ voice: 'kick', time: 0, duration: 0.5, velocity: 1, notes: [] });
      notes.push({ voice: 'kick', time: 2.5, duration: 0.5, velocity: 0.85, notes: [] });
      if (rnd() < 0.3) notes.push({ voice: 'kick', time: 3.75, duration: 0.25, velocity: 0.5, notes: [] });
    }
    if (layers.snare) {
      notes.push({ voice: 'snare', time: 1, duration: 0.5, velocity: 0.8, notes: [] });
      notes.push({ voice: 'snare', time: 3, duration: 0.5, velocity: 0.85, notes: [] });
    }
    if (layers.hats) {
      for (let eighth = 0; eighth < 8; eighth++) {
        const off = eighth % 2 === 1;
        const time = eighth / 2 + (off ? 0.08 : 0); // a little swing
        notes.push({ voice: 'hat', time, duration: 0.1, velocity: (off ? 0.22 : 0.35) + rnd() * 0.1, notes: [] });
        if (off && rnd() < 0.15) notes.push({ voice: 'hat', time: time + 0.25, duration: 0.1, velocity: 0.15, notes: [] });
      }
    }
    if (layers.blips && rnd() < 0.5) {
      const count = 1 + Math.floor(rnd() * 2);
      for (let i = 0; i < count; i++)
        notes.push({ voice: 'blip', time: Math.floor(rnd() * 16) / 4, duration: 0.1, velocity: 0.6 + rnd() * 0.4, notes: [pick(BLIP_NOTES)] });
    }
    return { index: index++, chord: name, layers, notes };
  }

  return { next };
}
