import { VIEWS, flyTo } from '../core/camera.js';

/** The car as a grey model kit on sprues. */
export class KitMode {
  name = 'kit';

  constructor(ctx) {
    this.ctx = ctx;
  }

  async enter(from) {
    const { camera, controls, kit } = this.ctx;
    controls.enabled = false;
    const fly = flyTo(camera, controls.target, VIEWS.kit, from ? 1.3 : 0);
    if (from) await kit.disassemble();
    else kit.applyKit();
    await fly;
    Object.assign(controls, { enabled: true, autoRotate: false, enablePan: false, minDistance: 8, maxDistance: 40, maxPolarAngle: Math.PI * 0.42 });
  }

  async exit() {}

  update() {}

  onCarChanged() {
    this.ctx.kit.applyKit();
  }
}
