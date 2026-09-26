import './tunnelPanel.css';
import { CP_RANGE } from '../aero/flow.js';

const TEMPLATE = /* html */ `
  <details open>
    <summary>
      <span class="t-title">Galleria del vento</span>
      <span class="t-live"><i></i><span data-out="live"></span></span>
    </summary>
    <div class="t-body">
      <section class="t-group">
        <div class="t-head">
          <span class="t-label">Vento</span>
          <output class="t-value" data-out="kmh"></output>
        </div>
        <input type="range" min="0" max="320" step="10" data-input="kmh" aria-label="Velocità del vento" />
      </section>

      <section class="t-group">
        <div class="t-head">
          <span class="t-label">Fumo</span>
          <button type="button" class="t-switch" role="switch" data-toggle="smoke" aria-label="Fumo"><i></i></button>
        </div>
        <div class="t-sub" data-when="smoke">
          <div class="t-seg" role="radiogroup" aria-label="Pettine del fumo">
            <button type="button" role="radio" data-rake="vertical">Verticale</button>
            <button type="button" role="radio" data-rake="horizontal">Orizzontale</button>
          </div>
          <div class="t-head t-head-small">
            <span class="t-label" data-out="posLabel"></span>
            <output class="t-value-small" data-out="pos"></output>
          </div>
          <input type="range" min="-1" max="1" step="0.02" data-input="rakePos" aria-label="Posizione del pettine" />
        </div>
      </section>

      <section class="t-group">
        <div class="t-head">
          <span class="t-label">Mappa di pressione</span>
          <button type="button" class="t-switch" role="switch" data-toggle="pressure" aria-label="Mappa di pressione"><i></i></button>
        </div>
        <div class="t-sub" data-when="pressure">
          <div class="t-bar"></div>
          <div class="t-scale"><span data-out="cpMin"></span><span>Cp</span><span data-out="cpMax"></span></div>
        </div>
      </section>

      <dl class="t-data">
        <div><dt>Cx</dt><dd data-out="cd"></dd></div>
        <div><dt>Area frontale</dt><dd data-out="area"></dd></div>
        <div><dt>Resistenza</dt><dd data-out="drag"></dd></div>
        <div><dt data-out="liftLabel"></dt><dd data-out="down"></dd></div>
        <div><dt>Potenza</dt><dd data-out="power"></dd></div>
        <div><dt>Press. dinamica</dt><dd data-out="q"></dd></div>
      </dl>
      <p class="t-note">Flusso calcolato sulla forma del modello · coefficienti indicativi</p>
    </div>
  </details>`;

const kpa = (pa) => `${pa >= 0 ? '+' : '−'}${Math.abs(pa / 1000).toFixed(1)} kPa`;
const unit = (value, u) => `${value}<small>${u}</small>`;

/** Wind-tunnel controls and live aero figures (Studio mode). Builds its own DOM. */
export class TunnelPanel {
  /** @param {{onChange:(changes:object)=>void}} handlers */
  constructor({ onChange }) {
    this.el = document.createElement('section');
    this.el.id = 'tunnel';
    this.el.hidden = true;
    this.el.setAttribute('aria-label', 'Galleria del vento');
    this.el.innerHTML = TEMPLATE;
    document.body.append(this.el);
    this.out = Object.fromEntries([...this.el.querySelectorAll('[data-out]')].map((e) => [e.dataset.out, e]));
    this.inputs = Object.fromEntries([...this.el.querySelectorAll('[data-input]')].map((e) => [e.dataset.input, e]));
    this.settings = null;
    this.shown = {};
    this.onChange = onChange;

    for (const [key, input] of Object.entries(this.inputs))
      input.addEventListener('input', () => this.#change({ [key]: Number(input.value) }));
    for (const b of this.el.querySelectorAll('[data-rake]')) b.addEventListener('click', () => this.#change({ rake: b.dataset.rake }));
    for (const b of this.el.querySelectorAll('[data-toggle]'))
      b.addEventListener('click', () => this.#change({ [b.dataset.toggle]: !this.settings[b.dataset.toggle] }));
    // Keys pressed on a slider stay with it (no page-level shortcuts while adjusting).
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
  }

  #change(changes) {
    this.settings = { ...this.settings, ...changes };
    this.onChange(changes);
    this.#sync();
  }

  #sync() {
    const s = this.settings;
    for (const [key, input] of Object.entries(this.inputs)) {
      input.value = String(s[key]);
      const t = (s[key] - input.min) / (input.max - input.min);
      input.style.setProperty('--fill', `${(t * 100).toFixed(1)}%`);
    }
    this.out.kmh.innerHTML = unit(s.kmh, 'km/h');
    this.out.live.textContent = s.kmh > 0 ? 'In funzione' : 'Ferma';
    this.el.classList.toggle('running', s.kmh > 0);
    const vertical = s.rake === 'vertical';
    this.out.posLabel.textContent = vertical ? 'Posizione laterale' : 'Altezza dal suolo';
    this.out.pos.textContent = vertical ? `${(s.rakePos * 1.3).toFixed(2)} m` : `${(0.12 + ((s.rakePos + 1) / 2) * 1.3).toFixed(2)} m`;
    for (const b of this.el.querySelectorAll('[data-rake]')) b.setAttribute('aria-checked', String(b.dataset.rake === s.rake));
    for (const b of this.el.querySelectorAll('[data-toggle]')) b.setAttribute('aria-checked', String(!!s[b.dataset.toggle]));
    for (const e of this.el.querySelectorAll('[data-when]')) e.classList.toggle('open', !!s[e.dataset.when]);
  }

  /** @param {boolean} visible @param {object} [settings] current tunnel settings to show */
  show(visible, settings) {
    if (settings) {
      this.settings = { ...settings };
      this.#sync();
    }
    if (visible && !this.el.dataset.seen) {
      this.el.dataset.seen = '1';
      if (window.matchMedia('(max-width: 640px)').matches) this.el.querySelector('details').open = false;
    }
    this.el.hidden = !visible;
    document.body.classList.toggle('tunnel-open', visible);
  }

  /** @param {{cd:number, area:number, drag:number, downforceKg:number, powerKw:number, q:number}} r */
  setReadout(r) {
    const lift = r.downforceKg < 0;
    const html = {
      cd: r.cd.toFixed(2),
      area: unit(r.area.toFixed(2), 'm²'),
      drag: unit(Math.round(r.drag), 'N'),
      liftLabel: lift ? 'Portanza' : 'Deportanza',
      down: unit(Math.round(Math.abs(r.downforceKg)), 'kg'),
      power: unit(r.powerKw.toFixed(1), 'kW'),
      q: unit((r.q / 1000).toFixed(2), 'kPa'),
      cpMin: `${CP_RANGE[0]} · ${kpa(CP_RANGE[0] * r.q)}`,
      cpMax: `+${CP_RANGE[1]} · ${kpa(CP_RANGE[1] * r.q)}`,
    };
    for (const [key, value] of Object.entries(html)) {
      if (this.shown[key] === value) continue;
      this.shown[key] = value;
      this.out[key].innerHTML = value;
    }
  }
}
