import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEnvironment, createRenderer, onResize } from './core/renderer.js';
import { HOME_ROTATION } from './core/camera.js';
import { CARS } from './cars/catalog.js';
import { loadCar } from './cars/garage.js';
import { Desk } from './world/Desk.js';
import { Kit } from './kit/Kit.js';

// Temporary car viewer while the garage is being built. Open /?car=<catalog id>.
const renderer = createRenderer(document.getElementById('webgl'));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e9e9);
scene.fog = new THREE.Fog(0xe9e9e9, 32, 80);
scene.environment = createEnvironment(renderer);
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 250);
camera.position.set(0, 16.5, 15);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true;
onResize(renderer, camera);
scene.add(new Desk().group);

const entry = CARS.find((c) => c.id === new URLSearchParams(location.search).get('car')) ?? CARS[0];
const car = await loadCar(entry, (p) => console.log(`${entry.id}: ${Math.round(p * 100)}%`));
car.root.quaternion.copy(HOME_ROTATION);
scene.add(car.root);
console.table(car.parts.map((p) => ({ id: p.id, label: p.label, meshes: p.meshIds.length })));
window.car = car; // poke at it from the devtools console
const kit = new Kit();
kit.build(car);
kit.applyKit();
// Temporary: press K to assemble / take apart the kit.
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyK' || kit.state === 'animating') return;
  if (kit.state === 'kit') kit.assemble();
  else kit.disassemble();
});
document.getElementById('loading').classList.add('hidden');

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
