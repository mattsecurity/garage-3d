import './style.css';
import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEnvironment, createRenderer, onResize } from './core/renderer.js';
import { CARS } from './cars/catalog.js';
import { loadCar } from './cars/garage.js';
import { Desk } from './world/Desk.js';
import { Effects } from './world/Effects.js';
import { Kit } from './kit/Kit.js';
import { Keyboard } from './input/controls.js';
import { Joystick } from './input/joystick.js';
import { Hud } from './ui/hud.js';
import { createCurtain } from './ui/curtain.js';
import { HOME_ROTATION } from './core/camera.js';
import { KitMode } from './modes/KitMode.js';
import { DriveMode } from './modes/DriveMode.js';

const DESK_BG = 0xe9e9e9;

let ctx = null;
let modes = {};
let mode = null;
let busy = false;
let carIndex = 0;

const hud = new Hud({
  onMode: (name) => setMode(name),
  onPrev: () => setCar(carIndex - 1),
  onNext: () => setCar(carIndex + 1),
  onPaint: (color) => ctx?.car?.setPaint(color),
});

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
    mode = modes.kit;
    hud.setMode('kit');
    await mode.enter(null);
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
    ctx.scene.add(car.root);
    ctx.kit.build(car);
    mode?.onCarChanged(car);
    carIndex = i;
    hud.setCar(i, entry);
    hud.setCredits(entry.credit);
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
  scene.background = new THREE.Color(DESK_BG);
  scene.fog = new THREE.Fog(DESK_BG, 32, 80);
  scene.environment = createEnvironment(renderer);
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 250);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enabled = false;

  const desk = new Desk();
  scene.add(desk.group);
  const effects = new Effects(scene);

  ctx = {
    renderer,
    scene,
    camera,
    controls,
    desk,
    effects,
    hud,
    kit: new Kit(),
    keyboard: new Keyboard(),
    joystick: new Joystick(document.getElementById('joystick')),
    curtain: createCurtain(document.getElementById('curtain')),
    physics: null,
    car: null,
  };
  modes = { kit: new KitMode(ctx), drive: new DriveMode(ctx) };
  hud.setAvailableModes(Object.keys(modes));

  const viewport = () => effects.setViewport(renderer.domElement.height, camera.fov);
  onResize(renderer, camera, viewport);
  viewport();

  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 1 / 20);
    mode?.update(dt);
    effects.update(dt);
    if (controls.enabled) controls.update(dt);
    renderer.render(scene, camera);
  });

  await setCar(0, { initial: true });
  await setMode('kit');
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
