// Asset check: Marc, Yola and a walker in one frame (build-log frame 1).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1b2426);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100); cam.position.set(0, 1.4, 7); cam.lookAt(0, 0.9, 0);
scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x2a2018, 1.2)); const sun = new THREE.DirectionalLight(0xffe0b0, 2); sun.position.set(3, 5, 4); scene.add(sun);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const load = (u) => loader.loadAsync('assets/models/' + u);
const mixers = [];
async function actor(base, extra, x, clip, face) {
  const [g, m] = await Promise.all([load(base), extra ? load(extra) : null]);
  const o = clone(g.scene); o.position.x = x; o.rotation.y = face; scene.add(o);
  const clips = [...g.animations, ...(m ? m.animations : [])];
  const mx = new THREE.AnimationMixer(o); const c = clips.find(c => c.name === clip) || clips[0];
  mx.clipAction(c).play(); mixers.push(mx);
  window.__clips = window.__clips || {}; window.__clips[base] = clips.map(c => c.name + ':' + c.duration.toFixed(2));
  return o;
}
await Promise.all([
  actor('marc.glb', 'marc_moves.glb', -1.6, 'bat_idle', Math.PI / 2),
  actor('yola.glb', 'yola_moves.glb', -0.6, 'pistol_idle', Math.PI / 2),
  actor('z_romero.glb', 'z_romero_moves.glb', 1.6, 'idle', -Math.PI / 2),
]);
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => { const dt = clock.getDelta(); mixers.forEach(m => m.update(dt)); renderer.render(scene, cam); });
window.__ready = true;
