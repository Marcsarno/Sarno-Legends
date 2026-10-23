// GLB loading for the battle stage: one cached load per file (meshopt-compressed, see tools/build-assets.mjs), characters
// cloned per actor with SkeletonUtils, scaled to camera.js HEIGHTS, with every clip file of that character merged onto one
// clip map (marc.glb + marc_moves.glb share the skeleton). Props, items and weapons come back as plain clones.
//   preload(keys, onProgress)   keys: 'marc', 'yola', 'z_romero'..., or 'weapon:wood_bat' / 'prop:iv_stand'
//   character(key)              -> { key, root, clips: Map, bones, height, scale }
//   prop(name)                  -> Object3D clone from props/, items/ or weapons/
// The Tripo-made models ship with metalness 1 and a metal/rough map: lit only by lamps they render nearly black, so
// fixMaterial() turns skin and cloth back into dielectrics (the stage adds a dim room environment for the rest).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HEIGHTS } from './camera.js';

// asset root: '/' in dev (labs too), './' in the build (index.html sits at the root)
let BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';
export function setAssetBase(url) { BASE = url.endsWith('/') ? url : url + '/'; }
const url = (p) => BASE + 'assets/' + p;

// Every character the battle uses: base model first, then extra clip files on the same skeleton. Zombies without their
// own move pack borrow one from the model they were made from (scrubs = the nurse's body, patient = the modded patient's).
export const MODELS = {
  marc: ['marc.glb', 'marc_moves.glb'],
  yola: ['yola.glb', 'yola_moves.glb'],
  z_romero: ['z_romero.glb', 'z_romero_moves.glb'],
  z_patient: ['z_patient.glb', 'z_patient_mod_moves.glb', 'z_patient_mod_lay.glb'],
  z_patient_mod: ['z_patient_mod.glb', 'z_patient_mod_moves.glb', 'z_patient_mod_lay.glb'],
  z_scrubs: ['z_scrubs.glb', 'z_nurse_moves.glb'],
  z_girl: ['z_girl.glb', 'z_girl_moves.glb'],
  z_sprinter: ['z_sprinter.glb', 'z_sprinter_moves.glb', 'z_sprinter_moves_b.glb'],
  z_nurse: ['z_nurse.glb', 'z_nurse_moves.glb'],
  z_brute: ['z_brute.glb', 'z_brute_moves.glb'],
  z_guard: ['z_guard.glb', 'z_guard_moves.glb'],
};
export const HEROES = ['marc', 'yola'];
export const WEAPON_FILES = ['wood_bat', 'crowbar', 'fire_axe', 'sledgehammer', 'chainsaw', 'pistol_core', 'pump_shotgun', 'pump_short'];

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const files = new Map();     // path -> Promise<gltf>
const prepared = new Map();  // character key -> Promise<{ gltf, clips, scale, height }>
let manifest = null;

function loadFile(path) {
  if (!files.has(path)) files.set(path, loader.loadAsync(url(path)).catch(e => { files.delete(path); throw e; }));
  return files.get(path);
}

async function getManifest() {
  if (!manifest) manifest = fetch(url('manifest.json')).then(r => r.json()).catch(() => ({ props: [], items: [], weapons: WEAPON_FILES }));
  return manifest;
}

async function propPath(name) {
  if (WEAPON_FILES.includes(name)) return `models/weapons/${name}.glb`;
  const m = await getManifest();
  if (m.items?.includes(name)) return `models/items/${name}.glb`;
  return `models/props/${name}.glb`;
}

/** Load everything for these keys ahead of time. onProgress(done, total, label). */
export async function preload(keys, onProgress) {
  const paths = new Set();
  for (const k of keys) {
    if (MODELS[k]) MODELS[k].forEach(f => paths.add('models/' + f));
    else if (k.startsWith('weapon:')) paths.add(`models/weapons/${k.slice(7)}.glb`);
    else if (k.startsWith('prop:')) paths.add(await propPath(k.slice(5)));
    else if (WEAPON_FILES.includes(k)) paths.add(`models/weapons/${k}.glb`);
  }
  const list = [...paths]; let done = 0;
  onProgress?.(0, list.length, '');
  await Promise.all(list.map(p => loadFile(p).then(() => onProgress?.(++done, list.length, p))));
  await Promise.all(keys.filter(k => MODELS[k]).map(prepare));
}

const isHero = key => HEROES.includes(key);
const boneKey = name => name.replace(/^mixamorig:?/, '');

// Tripo exports: metalness 1 + a metal/rough map. Skin and cloth are dielectrics; keep their roughness map only.
export function fixMaterial(m) {
  if (!m || m.userData.slFixed) return m;
  m.userData.slFixed = true;
  if (m.metalness > 0.3) { m.metalness = 0.04; m.metalnessMap = null; }
  m.roughness = Math.max(m.roughness ?? 1, 0.62);
  if (m.specularIntensity !== undefined) { m.specularIntensity = Math.min(m.specularIntensity, 0.5); }
  if (m.map) { m.map.anisotropy = 4; }
  m.envMapIntensity = 0.7;
  m.needsUpdate = true;
  return m;
}

// The rest-pose hips height of a file's skeleton (to rescale borrowed clips' hips translation onto another body).
function hipsY(scene) {
  let h = null;
  scene.traverse(o => { if (!h && /Hips$/.test(o.name) && (o.isBone || o.type === 'Bone' || o.children.length)) h = o; });
  return h ? h.position.y : null;
}

// Clips: names deduplicated (first file wins), the Hips position track rescaled when a moves file's skeleton is a
// different size, and for heroes the horizontal root travel removed (Marc dashes procedurally; clips must stay in place).
function mergeClips(key, gltfs) {
  const clips = new Map();
  const baseHy = hipsY(gltfs[0].scene);
  gltfs.forEach((g, i) => {
    const hy = i ? hipsY(g.scene) : baseHy;
    const k = baseHy && hy ? baseHy / hy : 1;
    for (const src of g.animations) {
      if (clips.has(src.name)) continue;
      const clip = src.clone();
      for (const t of clip.tracks) {
        if (!/Hips\.position$/.test(t.name)) continue;
        const v = t.values;
        if (Math.abs(k - 1) > 0.01) for (let j = 0; j < v.length; j++) v[j] *= k;
        if (isHero(key) && !KEEP_ROOT.test(clip.name)) {
          // pin x/z to the first frame (keep the vertical bob)
          const x0 = v[0], z0 = v[2];
          for (let j = 0; j < v.length; j += 3) { v[j] = x0; v[j + 2] = z0; }
        }
      }
      clips.set(clip.name, clip);
    }
  });
  return clips;
}
// hero clips that end a fight lying where they fell keep their root motion (everything else plays in place)
const KEEP_ROOT = /death|defeat|fall/i;

async function prepare(key) {
  if (!prepared.has(key)) prepared.set(key, (async () => {
    const list = MODELS[key]; if (!list) throw new Error('unknown character ' + key);
    const gltfs = await Promise.all(list.map(f => loadFile('models/' + f)));
    const g = gltfs[0];
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(fixMaterial);
      if (/^GORE_/.test(o.name)) o.visible = false;   // wound caps and loose pieces: shown by the finisher only
    });
    g.scene.updateMatrixWorld(true);
    // height from the bind pose: head top bone (+ a little for the skull) or the skinned bounds
    const box = new THREE.Box3();
    g.scene.traverse(o => { if (o.isSkinnedMesh) box.expandByObject(o, true); });
    let height = box.isEmpty() ? 1.75 : box.max.y - Math.min(0, box.min.y);
    const target = isHero(key) ? HEIGHTS[key] : HEIGHTS.zombie;
    const scale = target / height;
    return { gltf: g, clips: mergeClips(key, gltfs), scale, height: target, nativeHeight: height };
  })());
  return prepared.get(key);
}

/** A fresh, independently animatable copy of a character, scaled to its battle height. */
export async function character(key) {
  const P = await prepare(key);
  const model = cloneSkinned(P.gltf.scene);
  const root = new THREE.Group(); root.name = key;
  model.scale.setScalar(P.scale);
  root.add(model);
  const bones = {};
  model.traverse(o => {
    if (o.isBone) bones[boneKey(o.name)] = o;
    if (o.isMesh) {
      o.castShadow = true; o.frustumCulled = false;
      // own materials per actor (flash / highlight / dissolve touch them)
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
    }
  });
  return { key, root, model, clips: P.clips, bones, height: P.height, scale: P.scale };
}

/** Plain clone of a prop, item or weapon GLB (shared geometry and materials). */
export async function prop(name) {
  const g = await loadFile(await propPath(name));
  const o = g.scene.clone(true);
  o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return o;
}

/** Raw gltf of a weapon file (weapons.js wraps it). */
export function weaponGltf(name) { return loadFile(`models/weapons/${name}.glb`); }

/** Texture from public/assets/tex (cached). */
const texCache = new Map();
export function texture(name, { srgb = true, repeat = null } = {}) {
  const key = name + (repeat ? repeat.join('x') : '');
  if (!texCache.has(key)) {
    const t = new THREE.TextureLoader().load(url('tex/' + name));
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.anisotropy = 8;
    texCache.set(key, t);
  }
  return texCache.get(key);
}
