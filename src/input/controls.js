// Keyboard state and the pure mapping from keys + virtual joystick to driving input.

export const KEY_MAP = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'handbrake',
};

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

/**
 * @param {{forward?:boolean, backward?:boolean, left?:boolean, right?:boolean, handbrake?:boolean}} keys
 * @param {{x:number, y:number}} stick joystick in [-1, 1], screen axes (y down)
 * @returns {{throttle:number, steer:number, handbrake:boolean}} steer > 0 means turn left
 */
export function mapInput(keys, stick = { x: 0, y: 0 }, deadzone = 0.15) {
  let throttle = (keys.forward ? 1 : 0) - (keys.backward ? 1 : 0);
  let steer = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  const magnitude = Math.hypot(stick.x, stick.y);
  if (magnitude > deadzone) {
    const k = (magnitude - deadzone) / (1 - deadzone) / magnitude;
    throttle = clamp(throttle - stick.y * k, -1, 1);
    steer = clamp(steer - stick.x * k, -1, 1);
  }
  return { throttle, steer, handbrake: !!keys.handbrake };
}

export class Keyboard {
  constructor(target = window) {
    this.keys = {};
    this.enabled = false;
    this.onReset = null;
    target.addEventListener('keydown', (e) => {
      const action = KEY_MAP[e.code];
      if (action) {
        this.keys[action] = true;
        if (this.enabled) e.preventDefault();
      }
      if (e.code === 'KeyR' && this.enabled && !e.repeat) this.onReset?.();
    });
    target.addEventListener('keyup', (e) => {
      const action = KEY_MAP[e.code];
      if (action) this.keys[action] = false;
    });
    window.addEventListener('blur', () => {
      this.keys = {};
    });
  }

  /** @param {{x:number, y:number}} stick */
  read(stick) {
    return mapInput(this.keys, stick);
  }
}
