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

const HINTS = {
  kit: 'Trascina per ruotare · [Drive] monta il kit',
  drive: 'WASD / Frecce per guidare · Spazio freno a mano · R raddrizza',
  driveTouch: 'Joystick per guidare',
  studio: 'Trascina per ruotare la vista',
};

/** All DOM overlay: title, hints, mode bar, colour palette, credits, loading screen, errors. */
export class Hud {
  /** @param {{onMode:(m:string)=>void, onPrev:()=>void, onNext:()=>void, onPaint:(c:string|null)=>void}} handlers */
  constructor({ onMode, onPrev, onNext, onPaint }) {
    this.modeButtons = [...document.querySelectorAll('.mode-btn')];
    for (const b of this.modeButtons)
      b.addEventListener('click', (e) => {
        onMode(b.dataset.mode);
        e.currentTarget.blur();
      });
    $('prev-car').addEventListener('click', (e) => {
      onPrev();
      e.currentTarget.blur();
    });
    $('next-car').addEventListener('click', (e) => {
      onNext();
      e.currentTarget.blur();
    });
    this.palette = $('palette');
    this.swatches = PALETTE.map((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = p.color ? 'swatch' : 'swatch original';
      b.title = p.name;
      b.setAttribute('aria-label', p.name);
      if (p.color) b.style.background = p.color;
      b.addEventListener('click', (e) => {
        this.setActiveSwatch(i);
        onPaint(p.color);
        e.currentTarget.blur();
      });
      this.palette.append(b);
      return b;
    });
    this.toastTimer = 0;
  }

  setAvailableModes(names) {
    for (const b of this.modeButtons) b.disabled = !names.includes(b.dataset.mode);
  }

  setMode(name) {
    for (const b of this.modeButtons) {
      const on = b.dataset.mode === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    const touch = window.matchMedia('(pointer: coarse)').matches;
    $('hint').textContent = (name === 'drive' && touch ? HINTS.driveTouch : HINTS[name]) ?? '';
  }

  setStage(stage) {
    document.body.classList.toggle('stage-studio', stage === 'studio');
  }

  setCar(index, entry) {
    $('car-title').textContent = `[${String(index + 1).padStart(2, '0')}] ${entry.name} · ${entry.year}`;
  }

  setCredits(credit) {
    const link = (href, text) => {
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = text;
      return a;
    };
    const license = credit.licenseUrl ? link(credit.licenseUrl, credit.license) : credit.license;
    $('credits').replaceChildren('Modello 3D ', link(credit.url, `"${credit.title}"`), ` di ${credit.author} · `, license, ' · modificato (ricompresso)');
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
    el.classList.toggle('hidden', !visible);
    el.classList.toggle('overlay', overlay);
    el.querySelector('.loading-fill').style.width = `${Math.round(progress * 100)}%`;
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
