import { VIEWS, flyTo } from '../core/camera.js';

/** Dark showroom: reflective floor, particles, orbiting camera and paint colours. */
export class StudioMode {
  name = 'studio';

  constructor(ctx) {
    this.ctx = ctx;
  }

  async enter() {
    const { kit, controls, camera, hud, car } = this.ctx;
    controls.enabled = false;
    if (kit.state !== 'assembled') await kit.assemble();
    await this.ctx.setStage('studio', () => flyTo(camera, controls.target, VIEWS.studio, 0));
    Object.assign(controls, {
      enabled: true,
      autoRotate: true,
      autoRotateSpeed: 0.7,
      enablePan: false,
      minDistance: 5,
      maxDistance: 16,
      maxPolarAngle: Math.PI * 0.48,
    });
    hud.showPalette(car.paintable);
  }

  async exit(to) {
    const { controls, camera, hud } = this.ctx;
    Object.assign(controls, { enabled: false, autoRotate: false });
    hud.showPalette(false);
    await this.ctx.setStage('desk', () => flyTo(camera, controls.target, to === 'kit' ? VIEWS.kit : VIEWS.drive, 0));
  }

  update(dt) {
    this.ctx.studio.update(dt);
  }

  onCarChanged(car) {
    this.ctx.kit.applyAssembled();
    this.ctx.hud.showPalette(car.paintable);
  }
}
