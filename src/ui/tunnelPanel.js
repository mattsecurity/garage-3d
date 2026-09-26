import './tunnelPanel.css';
import { CP_RANGE } from '../aero/flow.js';

const TEMPLATE = /* html */ `
  <details open>
    <summary>Galleria del vento</summary>
    <div class="t-body">
      <label class="t-row">
        <span class="t-label">Vento</span>
        <input type="range" min="0" max="320" step="10" data-input="kmh" aria-label="Velocità del vento" />
        <output data-out="kmh"></output>
      </label>
      <div class="t-row">
        <span class="t-label">Fumo</span>
        <div class="t-seg" role="group" aria-label="Pettine del fumo">
          <button type="button" data-rake="vertical">Verticale</button>
          <button type="button" data-rake="horizontal">Orizzontale</button>
          <button type="button" data-rake="off">Spento</button>
        </div>
      </div>
      <label class="t-row" data-row="pos">
        <span class="t-label" data-out="posLabel"></span>
        <input type="range" min="-1" max="1" step="0.02" data-input="rakePos" aria-label="Posizione del pettine" />
        <output data-out="pos"></output>
      </label>
      <div class="t-row">
        <span class="t-label">Pressione</span>
        <div class="t-seg" role="group" aria-label="Mappa di pressione">
          <button type="button" data-pressure="false">Off</button>
          <button type="button" data-pressure="true">Mappa Cp</button>
        </div>
      </div>
      <div class="t-legend" hidden>
        <div class="t-bar"></div>
        <div class="t-scale"><span data-out="cpMin"></span><span>Cp</span><span data-out="cpMax"></span></div>
      </div>
      <dl class="t-data">
        <div><dt>Cx</dt><dd data-out="cd"></dd></div>
        <div><dt>Area frontale</dt><dd data-out="area"></dd></div>
        <div><dt>Resistenza</dt><dd data-out="drag"></dd></div>
        <div><dt data-out="liftLabel"></dt><dd data-out="down"></dd></div>
        <div><dt>Potenza</dt><dd data-out="power"></dd></div>
      </dl>
      <p class="t-note">Flusso calcolato sulla forma del modello · coefficienti indicativi</p>
    </div>
  </details>`;

const kpa = (pa) => `${pa >= 0 ? '+' : '−'}${Math.abs(pa / 1000).toFixed(1)} kPa`;

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

    for (const [key, input] of Object.entries(this.inputs))
      input.addEventListener('input', () => this.#change({ [key]: Number(input.value) }));
    for (const b of this.el.querySelectorAll('[data-rake]')) b.addEventListener('click', () => this.#change({ rake: b.dataset.rake }));
    for (const b of this.el.querySelectorAll('[data-pressure]'))
      b.addEventListener('click', () => this.#change({ pressure: b.dataset.pressure === 'true' }));
    // Keys pressed on a slider stay with it (no page-level shortcuts while adjusting).
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
    this.onChange = onChange;
  }

  #change(changes) {
    this.settings = { ...this.settings, ...changes };
    this.onChange(changes);
    this.#sync();
  }

  #sync() {
    const s = this.settings;
    this.inputs.kmh.value = String(s.kmh);
    this.inputs.rakePos.value = String(s.rakePos);
    this.out.kmh.textContent = `${s.kmh} km/h`;
    const vertical = s.rake === 'vertical';
    this.out.posLabel.textContent = vertical ? 'Laterale' : 'Altezza';
    this.out.pos.textContent = vertical ? `${(s.rakePos * 1.3).toFixed(1)} m` : `${(0.12 + ((s.rakePos + 1) / 2) * 1.3).toFixed(2)} m`;
    this.el.querySelector('[data-row="pos"]').classList.toggle('disabled', s.rake === 'off');
    this.inputs.rakePos.disabled = s.rake === 'off';
    for (const b of this.el.querySelectorAll('[data-rake]')) b.setAttribute('aria-pressed', String(b.dataset.rake === s.rake));
    for (const b of this.el.querySelectorAll('[data-pressure]')) b.setAttribute('aria-pressed', String(b.dataset.pressure === String(s.pressure)));
    this.el.querySelector('.t-legend').hidden = !s.pressure;
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
    const text = {
      cd: r.cd.toFixed(2),
      area: `${r.area.toFixed(2)} m²`,
      drag: `${Math.round(r.drag)} N`,
      liftLabel: lift ? 'Portanza' : 'Deportanza',
      down: `${Math.round(Math.abs(r.downforceKg))} kg`,
      power: `${r.powerKw.toFixed(1)} kW`,
      cpMin: `${CP_RANGE[0]} · ${kpa(CP_RANGE[0] * r.q)}`,
      cpMax: `+${CP_RANGE[1]} · ${kpa(CP_RANGE[1] * r.q)}`,
    };
    for (const [key, value] of Object.entries(text)) {
      if (this.shown[key] === value) continue;
      this.shown[key] = value;
      this.out[key].textContent = value;
    }
  }
}
