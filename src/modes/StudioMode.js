import { VIEWS, fitView, flyTo } from '../core/camera.js';

const CEILING = 7.7; // keep the orbiting camera under the hall's light fixtures
const MAX_FOV = 60;

/** Wind tunnel: the car on a rolling road with smoke, a pressure map, paint colours and live aero figures. */
export class StudioMode {
  name = 'studio';

  constructor(ctx) {
    this.ctx = ctx;
    this.fov = null;
    // Re-pick the lens when the window changes shape (main.js has already updated the aspect by then).
    this.onResize = () => {
      this.#setLens(false);
      this.#setLens(true);
    };
  }

  /** The hall is too small to back away from the car on portrait screens: widen the lens instead (and undo it). */
  #setLens(widen) {
    const { camera, renderer, tunnel } = this.ctx;
    if (widen && this.fov === null && camera.aspect < 1.35) {
      this.fov = camera.fov;
      camera.fov = Math.min(MAX_FOV, camera.fov * Math.sqrt(1.35 / camera.aspect));
    } else if (!widen && this.fov !== null) {
      camera.fov = this.fov;
      this.fov = null;
    } else return;
    camera.updateProjectionMatrix();
    tunnel.setViewport(renderer.domElement.height, camera.fov);
  }

  async enter() {
    const { kit, controls, camera, hud, car, tunnel, tunnelPanel, sound } = this.ctx;
    controls.enabled = false;
    if (kit.state !== 'assembled') await kit.assemble();
    sound.studio.start(tunnel.settings.kmh);
    await this.ctx.setStage('studio', () => {
      this.#setLens(true);
      flyTo(camera, controls.target, VIEWS.studio, 0);
      tunnel.setCar(car);
    });
    // Narrow screens need the camera further back to fit the car; stay inside the hall either way.
    const v = VIEWS.studio;
    const fit = fitView(v, camera.aspect).position.map((p, i) => p - v.target[i]);
    const maxDistance = Math.min(Math.max(Math.hypot(...fit), 7.6), 9.6);
    Object.assign(controls, {
      enabled: true,
      autoRotate: true,
      autoRotateSpeed: 0.3,
      enablePan: false,
      minDistance: 4.6,
      maxDistance,
      minPolarAngle: Math.acos(Math.min((CEILING - v.target[1]) / maxDistance, 1)),
      maxPolarAngle: Math.PI * 0.49,
    });
    hud.showPalette(car.paintable);
    tunnelPanel.show(true, { ...tunnel.settings, music: sound.studio.music });
    window.addEventListener('resize', this.onResize);
  }

  async exit(to) {
    const { controls, camera, hud, tunnel, tunnelPanel, sound } = this.ctx;
    window.removeEventListener('resize', this.onResize);
    sound.studio.stop();
    Object.assign(controls, { enabled: false, autoRotate: false, minPolarAngle: 0 });
    hud.showPalette(false);
    tunnelPanel.show(false);
    await this.ctx.setStage('desk', () => {
      this.#setLens(false);
      tunnel.releaseCar();
      flyTo(camera, controls.target, to === 'kit' ? VIEWS.kit : VIEWS.drive, 0);
    });
  }

  update(dt) {
    const { tunnel, tunnelPanel } = this.ctx;
    tunnel.update(dt);
    tunnelPanel.setReadout(tunnel.readout);
  }

  onCarChanged(car) {
    const { kit, tunnel, hud } = this.ctx;
    kit.applyAssembled();
    tunnel.setCar(car);
    hud.showPalette(car.paintable);
  }
}
