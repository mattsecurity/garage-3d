import { CARS } from '../cars/catalog.js';

const $ = (id) => document.getElementById(id);

export const PALETTE = [
  { name: 'Originale', color: null },
  { name: 'Rosso corsa', color: '#b5121b' },
  { name: 'Giallo', color: '#f2b705' },
  { name: 'Arancio', color: '#ff6a13' },
  { name: 'Verde', color: '#0f5132' },
  { name: 'Blu', color: '#123a8c' },
  { name: 'Nero', color: '#111111' },
  { name: 'Bianco', color: '#f2f2f2' },
];

/** Hint row per mode: each item shows its `keys` as key caps, then its label. */
const HINTS = {
  kit: [{ label: 'Trascina per ruotare' }, { label: 'Drive monta il kit' }],
  drive: [
    { keys: ['W', 'A', 'S', 'D'], label: 'Guida' },
    { keys: ['Spazio'], label: 'Derapata' },
    { keys: ['R'], label: 'Raddrizza' },
  ],
  driveTouch: [{ label: 'Joystick per guidare · Drift per derapare' }],
  studio: [{ label: 'Galleria del vento' }, { label: 'Trascina per ruotare la vista' }],
};
const HINT_SECONDS = 6;

const pad2 = (n) => String(n).padStart(2, '0');

function element(tag, className, ...children) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.append(...children);
  return el;
}

function link(href, text) {
  const a = element('a', '', text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

/** Buttons drop focus after a click, so Space and the arrow keys keep driving the car. */
function onClick(button, handler) {
  button.addEventListener('click', (e) => {
    handler(e);
    e.currentTarget.blur();
  });
}

/** All DOM overlay: title, hints, mode switcher, colour palette, credits card, loading screen, errors. */
export class Hud {
  /**
   * @param {{onMode:(m:string)=>void, onPrev:()=>void, onNext:()=>void, onPaint:(c:string|null)=>void,
   *   onSound:()=>void}} handlers
   */
  constructor({ onMode, onPrev, onNext, onPaint, onSound }) {
    this.modes = $('modes');
    this.modeButtons = [...this.modes.querySelectorAll('.mode-btn')];
    for (const b of this.modeButtons) onClick(b, () => onMode(b.dataset.mode));
    onClick($('prev-car'), onPrev);
    onClick($('next-car'), onNext);
    onClick($('sound-btn'), onSound);
    this.palette = $('palette');
    this.swatches = PALETTE.map((p, i) => {
      const b = element('button', p.color ? 'swatch' : 'swatch original');
      b.type = 'button';
      b.title = p.name;
      b.setAttribute('aria-label', p.name);
      if (p.color) b.style.background = p.color;
      onClick(b, () => {
        this.setActiveSwatch(i);
        onPaint(p.color);
      });
      this.palette.append(b);
      return b;
    });
    this.#setupCredits();
    this.hintTimer = 0;
    this.toastTimer = 0;
  }

  #setupCredits() {
    const button = $('info-btn');
    const card = $('credits');
    const setOpen = (open) => {
      card.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    };
    onClick(button, () => setOpen(card.hidden));
    document.addEventListener('pointerdown', (e) => {
      if (!card.hidden && !card.contains(e.target) && !button.contains(e.target)) setOpen(false);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  /** @param {boolean} on sound on (speaker icon) or muted */
  setSound(on) {
    const button = $('sound-btn');
    button.classList.toggle('muted', !on);
    button.setAttribute('aria-pressed', String(!on));
    button.setAttribute('aria-label', on ? 'Disattiva audio' : 'Attiva audio');
  }

  setAvailableModes(names) {
    for (const b of this.modeButtons) b.disabled = !names.includes(b.dataset.mode);
  }

  setMode(name) {
    const index = this.modeButtons.findIndex((b) => b.dataset.mode === name);
    this.modeButtons.forEach((b, i) => {
      b.classList.toggle('active', i === index);
      b.setAttribute('aria-pressed', String(i === index));
    });
    this.modes.style.setProperty('--active', String(Math.max(index, 0)));
    this.modes.classList.toggle('has-active', index >= 0);
    const touch = window.matchMedia('(pointer: coarse)').matches;
    this.#showHint((name === 'drive' && touch ? HINTS.driveTouch : HINTS[name]) ?? []);
  }

  #showHint(items) {
    const el = $('hint');
    el.replaceChildren(
      ...items.map(({ keys = [], label }) =>
        element('span', 'hint-item', ...keys.map((k) => element('kbd', '', k)), element('span', 'hint-label', label)),
      ),
    );
    el.classList.toggle('show', items.length > 0);
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => el.classList.remove('show'), HINT_SECONDS * 1000);
  }

  setStage(stage) {
    document.body.classList.toggle('stage-studio', stage === 'studio');
  }

  setCar(index, entry) {
    $('car-name').textContent = entry.name;
    $('car-year').textContent = String(entry.year);
    $('car-count').textContent = `${pad2(index + 1)} / ${pad2(CARS.length)}`;
  }

  setCredits(credit) {
    // An unverified licence is a sentence ("licenza originale non verificata"), not a licence name.
    const license = credit.licenseUrl
      ? ['Licenza ', link(credit.licenseUrl, credit.license)]
      : [credit.license.charAt(0).toUpperCase() + credit.license.slice(1)];
    $('credits').replaceChildren(
      element('h2', '', 'Modello 3D'),
      element('p', '', link(credit.url, `“${credit.title}”`), ` di ${credit.author}`),
      element('p', 'muted', ...license, ' · modificato (ricompresso)'),
      element('p', 'muted', 'Nomi e marchi delle auto appartengono ai rispettivi produttori.'),
    );
  }

  showPalette(visible) {
    this.palette.hidden = !visible;
  }

  setActiveSwatch(index) {
    this.swatches.forEach((s, i) => s.classList.toggle('active', i === index));
  }

  /** @param {boolean} visible @param {number} progress 0..1 @param {boolean} overlay translucent (car switch) */
  setLoading(visible, progress = 0, name = '', overlay = false) {
    const el = $('loading');
    const percent = Math.round(progress * 100);
    el.classList.toggle('hidden', !visible);
    el.classList.toggle('overlay', overlay);
    el.querySelector('.loading-fill').style.width = `${percent}%`;
    el.querySelector('.loading-pct').textContent = `${percent}%`;
    el.querySelector('.loading-name').textContent = name;
  }

  toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  fatal(message) {
    const el = $('fatal');
    el.textContent = message;
    el.hidden = false;
  }
}
