import './style.css';
import * as THREE from 'three';

// Temporary: proves the toolchain works. Replaced in Task 6.
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('webgl'), antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e9e9);
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 250);
camera.position.set(0, 3, 8);
camera.lookAt(0, 0, 0);
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshNormalMaterial());
scene.add(cube);
document.getElementById('loading').classList.add('hidden');
renderer.setAnimationLoop((time) => {
  cube.rotation.y = time / 1000;
  renderer.render(scene, camera);
});
