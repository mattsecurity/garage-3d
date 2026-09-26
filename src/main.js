import './style.css';
import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEnvironment, createRenderer, onResize } from './core/renderer.js';
import { CARS } from './cars/catalog.js';
import { loadCar } from './cars/garage.js';
import { Desk } from './world/Desk.js';
import { WindTunnel } from './world/WindTunnel.js';
import { Effects } from './world/Effects.js';
import { Kit } from './kit/Kit.js';
import { Keyboard } from './input/controls.js';
import { Joystick } from './input/joystick.js';
import { Hud } from './ui/hud.js';
import { TunnelPanel } from './ui/tunnelPanel.js';
import { createCurtain } from './ui/curtain.js';
import { HOME_ROTATION } from './core/camera.js';
import { KitMode } from './modes/KitMode.js';
import { DriveMode } from './modes/DriveMode.js';
import { StudioMode } from './modes/StudioMode.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { CarSound } from './audio/CarSound.js';
import { Impacts } from './audio/impacts.js';
import { StudioSound } from './audio/StudioSound.js';

const DESK_BG = 0xe9e9e9;

let ctx = null;
let modes = {};
let mode = null;
let busy = false;
let carIndex = 0;

const audio = new AudioEngine();
const sound = { audio, car: new CarSound(audio), impacts: new Impacts(audio), studio: new StudioSound(audio) };

const hud = new Hud({
  onMode: (name) => setMode(name),
  onPrev: () => setCar(carIndex - 1),
  onNext: () => setCar(carIndex + 1),
  onPaint: (color) => ctx?.car?.setPaint(color),
  onSound: () => {
    audio.setMuted(!audio.muted);
    hud.setSound(!audio.muted);
  },
});
hud.setSound(!audio.muted);

async function setMode(name) {
  if (busy || !modes[name] || mode?.name === name) return;
  busy = true;
  const prev = mode;
  hud.setMode(name);
  try {
    await prev?.exit(name);
    mode = modes[name];
    await mode.enter(prev?.name ?? null);
  } catch (err) {
    console.error(err);
    hud.toast(err.userMessage ?? 'Modalità non disponibile');
    try {
      mode = modes.kit;
      hud.setMode('kit');
      await ctx.setStage('desk');
      await mode.enter(null);
    } catch (fatal) {
      console.error(fatal);
      hud.fatal('Qualcosa è andato storto. Ricarica la pagina.');
    }
  } finally {
    busy = false;
  }
}

async function setCar(index, { initial = false } = {}) {
  if (busy) return;
  busy = true;
  const i = (index + CARS.length) % CARS.length;
  const entry = CARS[i];
  hud.setLoading(true, 0, entry.name, !initial);
  try {
    const car = await loadCar(entry, (p) => hud.setLoading(true, p, entry.name, !initial));
    if (ctx.car) ctx.scene.remove(ctx.car.root);
    car.root.position.set(0, 0, 0);
    car.root.quaternion.copy(HOME_ROTATION);
    car.setPaint(null);
    hud.setActiveSwatch(0);
    ctx.car = car;
    carIndex = i;
    hud.setCar(i, entry);
    hud.setCredits(entry.credit);
    ctx.scene.add(car.root);
    ctx.kit.build(car);
    mode?.onCarChanged(car);
  } catch (err) {
    console.error(err);
    hud.toast(`Modello non disponibile: ${entry.name}`);
    if (initial) throw err;
  } finally {
    if (!initial) hud.setLoading(false);
    busy = false;
  }
}

async function boot() {
  const renderer = createRenderer(document.getElementById('webgl'));
  const scene = new THREE.Scene();
  const deskFog = new THREE.Fog(DESK_BG, 32, 80);
  scene.background = new THREE.Color(DESK_BG);
  scene.fog = deskFog;
  const deskEnvironment = createEnvironment(renderer);
  scene.environment = deskEnvironment;
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 250);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enabled = false;

  const desk = new Desk();
  const tunnel = new WindTunnel(renderer);
  scene.add(desk.group, tunnel.group);
  const effects = new Effects(scene);

  ctx = {
    renderer,
    scene,
    camera,
    controls,
    desk,
    tunnel,
    tunnelPanel: new TunnelPanel({
      onChange: ({ music, ...changes }) => {
        if (music !== undefined) sound.studio.setMusic(music);
        tunnel.set(changes);
        if (changes.kmh !== undefined) sound.studio.setWind(changes.kmh);
      },
    }),
    effects,
    hud,
    sound,
    kit: new Kit(),
    keyboard: new Keyboard(),
    joystick: new Joystick(document.getElementById('joystick')),
    curtain: createCurtain(document.getElementById('curtain')),
    physics: null,
    car: null,
    stage: 'desk',
    /** Swaps desk ↔ wind tunnel behind a black curtain; `whileHidden` runs while the screen is black. */
    async setStage(stage, whileHidden) {
      if (ctx.stage === stage) {
        whileHidden?.();
        return;
      }
      await ctx.curtain.close();
      const inStudio = stage === 'studio';
      desk.group.visible = !inStudio;
      tunnel.group.visible = inStudio;
      scene.background.copy(inStudio ? tunnel.background : new THREE.Color(DESK_BG));
      scene.fog = inStudio ? tunnel.fog : deskFog;
      scene.environment = inStudio ? tunnel.environment : deskEnvironment;
      ctx.stage = stage;
      hud.setStage(stage);
      whileHidden?.();
      await ctx.curtain.open();
    },
  };
  modes = { kit: new KitMode(ctx), drive: new DriveMode(ctx), studio: new StudioMode(ctx) };
  hud.setAvailableModes(Object.keys(modes));

  const viewport = () => {
    effects.setViewport(renderer.domElement.height, camera.fov);
    tunnel.setViewport(renderer.domElement.height, camera.fov);
  };
  onResize(renderer, camera, viewport);
  viewport();

  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 1 / 20);
    mode?.update(dt);
    effects.update(dt);
    sound.car.update(dt, camera);
    if (controls.enabled) controls.update(dt);
    renderer.render(scene, camera);
  });

  // Dev-only handle for stepping the app from the console while the tab is hidden (the timer then reports dt = 0).
  if (import.meta.env.DEV) window.__garage = { ctx, setMode, setCar, get mode() { return mode; } };

  await setCar(0, { initial: true });
  await setMode('kit');
  // Warm the module cache so the first Drive doesn't stall on Rapier's download.
  setTimeout(() => import('./physics/Physics.js').catch(() => {}), 1500);
  hud.setLoading(false);
}

if (!WebGL.isWebGL2Available()) {
  hud.setLoading(false);
  hud.fatal('Questo browser non supporta WebGL 2, che serve per mostrare le auto in 3D.');
} else {
  boot().catch((err) => {
    console.error(err);
    hud.setLoading(false);
    hud.fatal('Qualcosa è andato storto durante il caricamento. Ricarica la pagina.');
  });
}
