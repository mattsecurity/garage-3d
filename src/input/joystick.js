/** On-screen joystick for touch devices. `value` is in [-1, 1] on screen axes (y down). */
export class Joystick {
  constructor(el) {
    this.el = el;
    this.base = el.querySelector('.joystick-base');
    this.knob = el.querySelector('.joystick-knob');
    this.value = { x: 0, y: 0 };
    this.pointerId = null;
    this.base.addEventListener('pointerdown', (e) => {
      this.pointerId = e.pointerId;
      this.base.setPointerCapture(e.pointerId);
      this.#move(e);
    });
    this.base.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointerId) this.#move(e);
    });
    const end = (e) => {
      if (e.pointerId === this.pointerId) this.#release();
    };
    this.base.addEventListener('pointerup', end);
    this.base.addEventListener('pointercancel', end);
  }

  #move(e) {
    const r = this.base.getBoundingClientRect();
    const max = r.width / 2;
    let x = e.clientX - (r.left + max);
    let y = e.clientY - (r.top + max);
    const len = Math.hypot(x, y);
    if (len > max) {
      x *= max / len;
      y *= max / len;
    }
    this.value.x = x / max;
    this.value.y = y / max;
    this.knob.style.transform = `translate(${x}px, ${y}px)`;
  }

  #release() {
    this.pointerId = null;
    this.value.x = 0;
    this.value.y = 0;
    this.knob.style.transform = '';
  }

  /** Shown only on touch screens. */
  setVisible(visible) {
    this.el.classList.toggle('visible', visible && window.matchMedia('(pointer: coarse)').matches);
    if (!visible) this.#release();
  }
}
