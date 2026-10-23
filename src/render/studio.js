// Studio: card art, relic / potion / weapon icons and portraits, rendered from the game's own models and painted through
// the room painter's pipeline (painter.js renderPainted) so cards and rooms share one hand.
//   const studio = createStudio(renderer)
//   await studio.cardArt('bat_swing')     -> object URL (JPEG, 4:3): the card's hero posed mid-clip over a painted
//                                            gradient in the hero colour (Marc red, Yola teal, status cards grey)
//   await studio.relicIcon('duct_tape')   -> object URL (PNG, square, transparent): a kit model or a small procedural one
//   await studio.potionIcon('flashbang')  -> idem;  studio.weaponIcon('nail_bat') -> idem;  studio.portrait('shambler') -> PNG
// Every picture uses the same camera, lights and frame for its kind. Results are cached in memory and in IndexedDB
// (keys carry VERSION: bump it when a recipe changes). One render at a time, shared with the painter (runExclusive).
// Card poses come from CARD_POSES (by card id) or POSE_BY_ANIM (by the card's anim); clips and frames were picked from
// contact sheets in labs/painter.html?poses=marc.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadGltf, loadModel, renderPainted, canvasTex, makeCanvas, seededRandom, runExclusive, roomEnvironment, SIGN_FONT } from './painter.js';

export const VERSION = 'studio-1';
const D2R = Math.PI / 180;

// ---------------------------------------------------------------- characters
// base model first, then extra clip files on the same skeleton (the same lists as assets.js MODELS)
const MODEL_FILES = {
  marc: ['marc', 'marc_moves'], yola: ['yola', 'yola_moves'],
  z_romero: ['z_romero', 'z_romero_moves'], z_patient: ['z_patient', 'z_patient_mod_moves'], z_patient_mod: ['z_patient_mod', 'z_patient_mod_moves'],
  z_scrubs: ['z_scrubs', 'z_nurse_moves'], z_girl: ['z_girl', 'z_girl_moves'], z_sprinter: ['z_sprinter', 'z_sprinter_moves'],
  z_nurse: ['z_nurse', 'z_nurse_moves'], z_brute: ['z_brute', 'z_brute_moves'], z_guard: ['z_guard', 'z_guard_moves'],
};
// enemy id -> model (content/enemies.js has the same; kept here so the studio works on its own)
const ENEMY_MODEL = {
  shambler: 'z_romero', biter: 'z_patient', spitter: 'z_patient_mod', screamer: 'z_girl', sprinter: 'z_sprinter', nurse: 'z_nurse',
  bloater: 'z_scrubs', big_walker: 'z_brute', sleeping_patient: 'z_patient', orderly: 'z_scrubs', shield_guard: 'z_guard',
};
const HEIGHT = { marc: 1.82, yola: 1.68, zombie: 1.76 };
const boneKey = n => n.replace(/^mixamorig:?/, '');

const rigs = new Map();
async function loadRig(key) {
  if (!rigs.has(key)) rigs.set(key, (async () => {
    const files = MODEL_FILES[key]; if (!files) throw new Error('studio: no model ' + key);
    const gl = await Promise.all(files.map(f => loadGltf(f)));
    const base = gl[0];
    base.scene.traverse(o => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) fixSkin(m);
      if (/^GORE_/.test(o.name)) o.visible = false;
    });
    base.scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    base.scene.traverse(o => { if (o.isSkinnedMesh) box.expandByObject(o, true); });
    const h = box.isEmpty() ? 1.75 : box.max.y - Math.min(0, box.min.y);
    const scale = (HEIGHT[key] || HEIGHT.zombie) / h;
    // clips: first file wins; a moves file on a different-size skeleton gets its hips track rescaled; root travel pinned
    const clips = new Map(), hipsY = s => { let y = null; s.traverse(o => { if (y == null && /Hips$/.test(o.name)) y = o.position.y; }); return y; };
    const y0 = hipsY(base.scene);
    gl.forEach((g, i) => {
      const k = i && y0 ? y0 / (hipsY(g.scene) || y0) : 1;
      for (const src of g.animations) {
        if (clips.has(src.name)) continue;
        const clip = src.clone();
        for (const t of clip.tracks) if (/Hips\.position$/.test(t.name)) {
          const v = t.values; if (Math.abs(k - 1) > 0.01) for (let j = 0; j < v.length; j++) v[j] *= k;
          if (!/death|knockdown|getup|KipUp|Roll|Slide|fall|lay|Lay/i.test(clip.name)) { const x0 = v[0], z0 = v[2]; for (let j = 0; j < v.length; j += 3) { v[j] = x0; v[j + 2] = z0; } }
        }
        clips.set(clip.name, clip);
      }
    });
    return { base, clips, scale };
  })());
  return rigs.get(key);
}
// Tripo exports: metalness 1 + a metal/rough map; skin and cloth are dielectrics
function fixSkin(m) {
  if (!m || m.userData.studioFixed) return;
  m.userData.studioFixed = true;
  if (m.metalness > 0.3) { m.metalness = 0.04; m.metalnessMap = null; }
  m.roughness = Math.max(m.roughness ?? 1, 0.6);
  m.needsUpdate = true;
}
/** A posed copy: { root, model, bones, clips, pose(clip, t) }. */
async function character(key) {
  const R = await loadRig(key);
  const model = cloneSkinned(R.base.scene);
  model.scale.setScalar(R.scale);
  const root = new THREE.Group(); root.add(model);
  const bones = {};
  model.traverse(o => { if (o.isBone) bones[boneKey(o.name)] = o; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const mixer = new THREE.AnimationMixer(model);
  return {
    root, model, bones, clips: R.clips, rigScale: (HEIGHT[key] || HEIGHT.zombie) / 1.62, id: key,
    has: name => R.clips.has(name),
    dispose() { mixer.stopAllAction(); model.traverse(o => { if (o.isSkinnedMesh) o.skeleton.dispose(); }); },
    duration: name => R.clips.get(name)?.duration || 0,
    pose(name, t) {
      mixer.stopAllAction();
      const clip = R.clips.get(name);
      if (clip) { const a = mixer.clipAction(clip); a.reset().play(); a.time = Math.min(t, clip.duration - 1e-3); a.paused = true; mixer.update(0); }
      root.updateMatrixWorld(true);
      return !!clip;
    },
    // fingers closed round a handle: the first frame of a weapon idle's finger tracks (as actor.js does)
    grip(clipName, twoHands = true, amount = 0.85) {
      const c = R.clips.get(clipName); if (!c) return;
      for (const t of c.tracks) {
        const m = /^(mixamorig:?)?((Right|Left)Hand(Index|Middle|Ring|Pinky|Thumb)\d)\.quaternion$/.exec(t.name);
        if (!m || (!twoHands && m[3] === 'Left')) continue;
        const b = bones[m[2]]; if (b) b.quaternion.slerp(new THREE.Quaternion().fromArray(t.values, 0), amount);
      }
      root.updateMatrixWorld(true);
    },
  };
}

// ---------------------------------------------------------------- weapons in hand
let weaponsMod;   // render core's weapons.js (hand fits, nails/wire tiers); optional
async function heldWeapon(id, scene, actor) {
  if (weaponsMod === undefined) weaponsMod = await import('./weapons.js').catch(e => { console.warn('[studio] weapons.js unavailable:', e.message); return null; });
  if (!weaponsMod?.createWeapon) return null;
  try {
    const w = await weaponsMod.createWeapon(id, scene);
    w.place(actor);
    return w;
  } catch (e) { console.warn('[studio] weapon', id, e.message); return null; }
}

// ---------------------------------------------------------------- what each card shows
// hero clip and the moment (seconds into the clip). yaw: the body's facing (0 = toward the camera, +90 = toward the
// zombies on the right). weapon: override the hero's starter weapon. flash: muzzle flash. grip: close the hands.
const MARC_W = 'wood_bat', YOLA_W = 'pistol';
export const POSE_BY_ANIM = {
  marc: {
    melee_light: { clip: 'bat_swing', t: 1.2, yaw: 70 },
    melee_heavy: { clip: 'bat_swing', t: 1.0, yaw: 60 },
    melee_sweep: { clip: 'melee_horizontal', t: 0.95, yaw: 70 },
    melee_combo: { clip: 'ual_Sword_Regular_B', t: 0.26, yaw: 70 },
    block: { clip: 'ual_Sword_Block', t: 0.35, yaw: 60 },
    dodge: { clip: 'ual1_Dodge_Left', t: 0.35, yaw: 60 },
    buff: { clip: 'ual1_Sword_Enter', t: 0.8, yaw: 35 },
    debuff: { clip: 'ual_Sword_Regular_B', t: 0.2, yaw: 70 },
    heal: { clip: 'ual1_Sword_Enter', t: 0.5, yaw: 35 },
    throw: { clip: 'ual_Sword_Regular_B', t: 0.15, yaw: 70 },
    none: { clip: 'bat_idle', t: 0.5, yaw: 40 },
  },
  yola: {
    pistol: { clip: 'pistol_idle', t: 0.3, yaw: 75, flash: true },
    pistol_burst: { clip: 'pistol_idle', t: 0.8, yaw: 70, flash: true },
    shotgun: { clip: 'rifle_aim_idle', t: 0.3, yaw: 75, flash: true, weapon: 'shotgun' },
    block: { clip: 'ual1_Dodge_Right', t: 0.35, yaw: 60 },
    dodge: { clip: 'ual1_Dodge_Left', t: 0.35, yaw: 60 },
    buff: { clip: 'pistol_reload', t: 0.9, yaw: 40 },
    debuff: { clip: 'pistol_idle', t: 0.6, yaw: 70 },
    heal: { clip: 'yola_getup', t: 0.6, yaw: 30 },
    throw: { clip: 'pistol_reload', t: 0.5, yaw: 50 },
    melee_light: { clip: 'ual_Sword_Regular_A', t: 0.25, yaw: 70 },
    none: { clip: 'pistol_idle', t: 0.3, yaw: 50 },
  },
};
// per-card picks (override the anim default): give cards that share an anim their own moment
export const CARD_POSES = {
  // Marc (picked from labs/painter.html?poses=marc)
  bat_swing: { clip: 'bat_swing', t: 1.18, yaw: 30 },
  home_run: { clip: 'bat_swing', t: 0.8, yaw: 30 },
  brace: { clip: 'ual_Sword_Block', t: 0.42, yaw: 55 },
  crowbar_pry: { clip: 'ual_Sword_Regular_B', t: 0.44, yaw: 60, weapon: 'crowbar' },
  shoulder_check: { clip: 'ual_Sword_Dash', t: 0.25, yaw: 65 },
  wild_swing: { clip: 'melee_horizontal', t: 0.9, yaw: 60 },
  heavy_swing: { clip: 'ual_Sword_Heavy_D', t: 0.53, yaw: 50 },
  one_two: { clip: 'ual_Sword_Regular_A', t: 0.18, yaw: 60 },
  hold_the_line: { clip: 'ual_Sword_Block', t: 0.12, yaw: 40 },
  deep_breath: { clip: 'ual1_Sword_Enter', t: 0.6, yaw: 35 },
  kick_the_door: { clip: 'ual_Sword_Dash', t: 0.7, yaw: 70 },
  haymaker: { clip: 'ual1_Sword_Attack', t: 0.35, yaw: 55 },
  tackle: { clip: 'ual_Sword_Dash', t: 0.18, yaw: 70 },
  batter_up: { clip: 'ual1_Sword_Attack', t: 0.7, yaw: 60 },
  overhead_smash: { clip: 'ual_Sword_Regular_C', t: 0.45, yaw: 55 },
  ground_pound: { clip: 'ual_Sword_Heavy_D', t: 0.9, yaw: 55 },
  momentum: { clip: 'ual_Sword_Heavy_Combo', t: 0.49, yaw: 60 },
  dig_in: { clip: 'ual1_Dodge_Left', t: 0.75, yaw: 50 },
  thick_skin: { clip: 'ual1_Sword_Enter', t: 1.04, yaw: 30 },
  pumped_up: { clip: 'ual1_Sword_Exit', t: 0.3, yaw: 30 },
  swing_guard: { clip: 'ual1_Dodge_Left', t: 0.45, yaw: 55 },
  jaw_breaker: { clip: 'hub_execution_B_uppercut', t: 0.48, yaw: 60 },
  wrench_arm: { clip: 'hub_crowbar_combo', t: 0.77, yaw: 55 },
  grit_teeth: { clip: 'hit_body', t: 0.5, yaw: 40 },
  berserker: { clip: 'ual1_Sword_Exit', t: 0.44, yaw: 25 },
  grand_slam: { clip: 'ual_Sword_Heavy_Combo', t: 2.43, yaw: 50 },
  bolt_the_door: { clip: 'ual1_Sword_Exit', t: 0.89, yaw: 35 },
  fortify: { clip: 'ual_Sword_Block', t: 0.0, yaw: 30 },
  make_it_count: { clip: 'ual_Sword_Regular_C', t: 0.68, yaw: 55 },
  rally: { clip: 'ual1_Idle_LookAround_Loop', t: 2.57, yaw: 30 },
  nail_swing: { clip: 'bat_swing', t: 1.18, yaw: 30, weapon: 'nail_bat' },
  barbed_swing: { clip: 'melee_horizontal', t: 0.85, yaw: 60, weapon: 'wire_bat' },
  pry_loose: { clip: 'hub_crowbar_combo', t: 0.26, yaw: 55, weapon: 'crowbar' },
  chop_block: { clip: 'ual_Sword_Regular_C', t: 0.9, yaw: 55, weapon: 'fire_axe' },
  sledge: { clip: 'ual_Sword_Heavy_D', t: 0.53, yaw: 50, weapon: 'sledgehammer' },
  // Yola (labs/painter.html?poses=yola)
  pistol_shot: { clip: 'pistol_idle', t: 0.3, yaw: 70, flash: true },
  sidestep: { clip: 'ual1_Dodge_Left', t: 0.45, yaw: 55 },
  clean_shot: { clip: 'rifle_aim_idle', t: 1.0, yaw: 75, flash: true },
  double_tap: { clip: 'pistol_idle', t: 0.6, yaw: 60, flash: true },
  aimed_shot: { clip: 'rifle_aim_idle', t: 2.0, yaw: 85, close: true },
  kneecap: { clip: 'pistol_idle', t: 0.2, yaw: 50, flash: true },
  suppressing_fire: { clip: 'pistol_hit', t: 0.31, yaw: 60, flash: true },
  cover_him: { clip: 'ual1_Dodge_Right', t: 0.44, yaw: 60 },
  tuck_and_roll: { clip: 'ual1_Roll', t: 0.17, yaw: 70 },
  check_mag: { clip: 'pistol_reload', t: 0.76, yaw: 40, close: true },
  flare: { clip: 'pistol_reload', t: 0.19, yaw: 45, hold: 'flare' },
  quick_shot: { clip: 'pistol_idle', t: 0.1, yaw: 85, flash: true },
  cheap_shot: { clip: 'pistol_hit', t: 0.15, yaw: 50, flash: true },
  headshot: { clip: 'rifle_aim_idle', t: 0.35, yaw: 88, flash: true, close: true },
  triage: { clip: 'yola_getup', t: 3.35, yaw: 40, hold: 'items/medkit' },
  adrenaline_shot: { clip: 'pistol_reload', t: 0.94, yaw: 35, hold: 'injector' },
  marksman: { clip: 'rifle_aim_idle', t: 2.44, yaw: 80 },
  spray_and_pray: { clip: 'yola_knockdown', t: 0.63, yaw: 60, flash: true },
  painkillers: { clip: 'pistol_reload', t: 1.13, yaw: 35, hold: 'pills' },
  light_on_feet: { clip: 'ual1_Dodge_Right', t: 0.3, yaw: 55 },
  triple_tap: { clip: 'pistol_idle', t: 0.9, yaw: 65, flash: true },
  covering_fire: { clip: 'rifle_aim_idle', t: 1.39, yaw: 60, flash: true },
  clean_kill: { clip: 'rifle_aim_idle', t: 2.79, yaw: 85, flash: true },
  overdrive: { clip: 'pistol_hit', t: 1.23, yaw: 45 },
  slow_motion: { clip: 'ual1_Roll', t: 0.33, yaw: 70, flash: true },
  dead_eye: { clip: 'rifle_aim_idle', t: 0.7, yaw: 90, close: true },
  defibrillator: { clip: 'yola_getup', t: 2.68, yaw: 40, hold: 'pads' },
  point_blank: { clip: 'pistol_idle', t: 0.45, yaw: 60, flash: true, close: true },
  buckshot: { clip: 'rifle_aim_idle', t: 0.3, yaw: 75, flash: true, weapon: 'shotgun' },
  both_barrels: { clip: 'sg_reload', t: 2.96, yaw: 70, flash: true, weapon: 'sawed_off' },
};
// status and curse cards: a prop in a grey room, no hero
export const STATUS_ART = {
  panic: { model: 'props/patient_monitor', yaw: -25, tint: 0xff4a3a, top: 0.42 },
  bile: { model: 'props/biohazard_bin', yaw: 20, tint: 0x9adf4a },
  infection: { model: 'props/sharps_container', yaw: -20, tint: 0x9adf4a },
};
// hero colours (card backgrounds, rims)
const HERO_COLOR = { marc: 0xc8483a, yola: 0x2fa39a, none: 0x8b8f94 };

let cardsMod;   // content/cards.js (hero + anim per card) when present
async function cardDef(id) {
  if (cardsMod === undefined) cardsMod = await import('../game/content/cards.js').catch(() => null);
  return cardsMod?.CARDS?.[id] || null;
}

// ---------------------------------------------------------------- shared scene bits
function backdropTex(hex, seed, { dark = 0.16 } = {}) {
  const c = new THREE.Color(hex), r = seededRandom(seed);
  const css = (col, a = 1) => `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${a})`;
  const light = c.clone().lerp(new THREE.Color(0xfff1d8), 0.35), deep = c.clone().multiplyScalar(dark);
  return canvasTex(512, 384, (ctx, W, H) => {
    const g = ctx.createRadialGradient(W * 0.55, H * 0.42, 10, W * 0.5, H * 0.5, W * 0.72);
    g.addColorStop(0, css(light)); g.addColorStop(0.45, css(c)); g.addColorStop(1, css(deep));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // loose brush strokes in the hero colour, light and dark (the Kuwahara pass turns them into paint)
    for (let i = 0; i < 70; i++) {
      const lightStroke = r() < 0.5;
      ctx.strokeStyle = css(lightStroke ? light : deep, r.range(0.08, 0.22));
      ctx.lineWidth = r.range(8, 34); ctx.lineCap = 'round';
      const x = r() * W, y = r() * H, a = r.range(-0.6, 0.6) + (r() < 0.5 ? 0 : Math.PI), len = r.range(60, 220);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + r.range(-30, 30), y + Math.sin(a) * len * 0.5 + r.range(-30, 30), x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
    }
  });
}
function addLights(scene, rimHex, { key = 2.6, rim = 3.2, fill = 0.5 } = {}) {
  const k = new THREE.DirectionalLight(0xffe2c4, key); k.position.set(-2.5, 4.5, 4.5); k.castShadow = true;
  k.shadow.mapSize.set(1024, 1024); Object.assign(k.shadow.camera, { left: -2, right: 2, top: 2.5, bottom: -1, near: 0.5, far: 15 }); k.shadow.bias = -0.0005; k.shadow.normalBias = 0.02;
  const rimL = new THREE.DirectionalLight(new THREE.Color(rimHex).lerp(new THREE.Color(0xffffff), 0.35), rim); rimL.position.set(3, 3, -4);
  const rim2 = new THREE.DirectionalLight(0x9fd8ff, rim * 0.35); rim2.position.set(-4, 2, -3);
  const hemi = new THREE.HemisphereLight(0xb8d0d8, 0x2a2018, fill);
  scene.add(k, rimL, rim2, hemi);
  return k;
}
// fit a camera looking along `dir` at a box, at fov, so the box fills `fill` of the frame
function frameBox(cam, box, dir, fill = 0.86, bias = new THREE.Vector3()) {
  const c = box.getCenter(new THREE.Vector3()).add(bias), size = box.getSize(new THREE.Vector3());
  const vf = THREE.MathUtils.degToRad(cam.fov) / 2, hf = Math.atan(Math.tan(vf) * cam.aspect);
  // project the box extents onto the camera's right/up axes
  const fwd = dir.clone().normalize().negate(), right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(right, fwd);
  let w = 0, h = 0, d = 0;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Vector3(sx * size.x / 2, sy * size.y / 2, sz * size.z / 2);
    w = Math.max(w, Math.abs(p.dot(right))); h = Math.max(h, Math.abs(p.dot(up))); d = Math.max(d, Math.abs(p.dot(fwd)));
  }
  const dist = Math.max(h / Math.tan(vf), w / Math.tan(hf)) / fill + d * 0.4;
  cam.position.copy(c).addScaledVector(dir.clone().normalize(), dist);
  cam.lookAt(c); cam.near = Math.max(0.01, dist * 0.05); cam.far = dist * 6; cam.updateProjectionMatrix();
  return { center: c, dist };
}
function boneBox(actor, extra = [], close = false) {
  const box = new THREE.Box3(), v = new THREE.Vector3();
  const minY = close && actor.bones.Hips ? actor.bones.Hips.getWorldPosition(new THREE.Vector3()).y - 0.05 : -Infinity;
  for (const [name, b] of Object.entries(actor.bones)) {
    if (b.getWorldPosition(v).y < minY) continue; if (/Hand(Index|Middle|Ring|Pinky|Thumb)|Toe_End|HeadTop/.test(name) && !/HeadTop/.test(name)) continue; box.expandByPoint(b.getWorldPosition(v)); }
  if (actor.bones.HeadTop_End) box.expandByPoint(actor.bones.HeadTop_End.getWorldPosition(v));
  else if (actor.bones.Head) box.expandByPoint(actor.bones.Head.getWorldPosition(v).add(new THREE.Vector3(0, 0.18, 0)));
  for (const o of extra) if (o) { const b2 = new THREE.Box3().setFromObject(o); if (close) b2.min.y = Math.max(b2.min.y, minY); box.union(b2); }
  box.expandByScalar(0.08);
  return box;
}
// a small prop in the left fist (medkit, injector, pill bottle, pads, a lit flare)
const HOLD_SIZE = { 'items/medkit': 0.32, injector: 0.15, pills: 0.09, pads: 0.2, flare: 0.28 };
async function heldProp(name, actor, seed) {
  let o;
  if (name === 'flare') {
    o = new THREE.Group();
    o.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.24, 16), M(0xc8302a, { roughness: 0.5 })));
    const tip = mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 2.4, 1.2) }), [0, 0.13, 0]); o.add(tip);
    const L = new THREE.PointLight(0xff5030, 6, 3, 1.5); L.position.set(0, 0.16, 0); o.add(L);
  } else if (name.includes('/')) o = await loadModel(name);
  else o = proc(name === 'injector' ? 'injector:#e8c228' : name, seed);
  const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3());
  o.position.sub(box.getCenter(new THREE.Vector3()));
  const g = new THREE.Group(); g.add(o);
  g.scale.setScalar((HOLD_SIZE[name] || 0.2) / Math.max(size.x, size.y, size.z, 1e-3));
  const B = actor.bones, F = weaponsMod?.fistFrame ? weaponsMod.fistFrame(B, 'Left', { c: new THREE.Vector3(), a: new THREE.Vector3(), k: new THREE.Vector3() }) : null;
  const at = F ? F.c.clone() : (B.LeftHand || B.Hips).getWorldPosition(new THREE.Vector3());
  if (F) at.addScaledVector(F.k, 0.03);
  g.position.copy(at); g.rotation.set(0.3, 0.6, 0.2);
  const owned = []; g.traverse(m => { if (m.isMesh) { m.castShadow = true; if (m.userData.studioOwned) owned.push(m); } });
  g.userData.owned = owned;
  return g;
}

// ---------------------------------------------------------------- the studio
export function createStudio(renderer, { cache = true, cardSize = [480, 360], iconSize = 256, portraitSize = 256 } = {}) {
  const mem = new Map();
  const db = cache ? openDb() : null;

  function cached(kind, id, size, make) {
    const key = `${VERSION}|${kind}|${id}|${size}`;
    if (!mem.has(key)) mem.set(key, (async () => {
      const hit = db && await dbGet(db, key).catch(() => null);
      if (hit) return URL.createObjectURL(hit);
      const canvas = await runExclusive(make);
      const type = kind === 'card' ? 'image/jpeg' : 'image/png';
      const blob = await new Promise(res => canvas.toBlob(res, type, 0.9));
      if (!blob) return canvas.toDataURL(type, 0.9);
      if (db) dbPut(db, key, blob).catch(() => {});
      return URL.createObjectURL(blob);
    })().catch(e => { mem.delete(key); throw e; }));
    return mem.get(key);
  }

  // ---- card art ----
  async function renderCard(id) {
    const [W, H] = cardSize;
    const def = await cardDef(id);
    const status = STATUS_ART[id] || (def && !def.hero ? STATUS_ART.panic : null);
    const hero = status ? null : (def?.hero || guessHero(id));
    const scene = new THREE.Scene();
    scene.environment = roomEnvironment(renderer); scene.environmentIntensity = 0.25;
    const color = HERO_COLOR[hero || 'none'];
    const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 50);
    const owned = [];
    addLights(scene, status ? status.tint : color);
    let subjectBox, weapon = null, actor = null;
    const centerBias = new THREE.Vector3();
    if (status) {
      const o = await loadModel(status.model); const g = new THREE.Group(); g.add(o);
      const b0 = new THREE.Box3().setFromObject(o); o.position.sub(b0.getCenter(new THREE.Vector3())).add(new THREE.Vector3(0, (b0.max.y - b0.min.y) / 2, 0));
      g.rotation.y = status.yaw * D2R; scene.add(g); g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      const L = new THREE.PointLight(status.tint, 6, 4, 1.5); L.position.set(0.4, 1.0, 0.8); scene.add(L);
      subjectBox = new THREE.Box3().setFromObject(g).expandByScalar(0.1);
      if (status.top) subjectBox.min.y = subjectBox.max.y - (subjectBox.max.y - subjectBox.min.y) * status.top;
    } else {
      const P = { ...(POSE_BY_ANIM[hero]?.[def?.anim] || POSE_BY_ANIM[hero].none), ...(CARD_POSES[id] || {}) };
      actor = await character(hero);
      actor.root.rotation.y = (P.yaw ?? 60) * D2R;
      scene.add(actor.root);
      const clip = actor.has(P.clip) ? P.clip : (hero === 'marc' ? 'bat_idle' : 'pistol_idle');
      actor.pose(clip, P.t ?? 0.5);
      const wid = P.weapon || (hero === 'marc' ? MARC_W : YOLA_W);
      weapon = await heldWeapon(wid, scene, actor);
      if (weapon) { actor.grip(weapon.kind === 'melee' ? 'bat_idle' : weapon.kind === 'pistol' ? 'pistol_idle' : 'rifle_aim_idle', weapon.kind === 'melee'); weapon.place(actor); }
      if (P.flash && weapon?.muzzle) {
        const m = weapon.muzzleWorld(new THREE.Vector3()), f = weapon.forward(new THREE.Vector3());
        const fl = muzzleFlash(); fl.position.copy(m).addScaledVector(f, 0.12); fl.lookAt(cam.position); scene.add(fl); owned.push(fl);
        const L = new THREE.PointLight(0xffc070, 4, 3, 1.5); L.position.copy(m); scene.add(L);
      }
      if (P.hold) { const held = await heldProp(P.hold, actor, id); if (held) { scene.add(held); owned.push(...held.userData.owned); } }
      subjectBox = boneBox(actor, weapon ? [weapon.obj] : [], P.close);
      // keep the body near the middle even when the weapon sticks far out to one side
      const body = boneBox(actor, [], P.close).getCenter(new THREE.Vector3()), all = subjectBox.getCenter(new THREE.Vector3());
      centerBias.set((body.x - all.x) * 0.5, 0, (body.z - all.z) * 0.5);
    }
    // ground shadow + painted backdrop
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.45 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const dir = new THREE.Vector3(0.18, 0.16, 1);
    if (actor && actor.bones.Hips && actor.bones.Hips.getWorldPosition(new THREE.Vector3()).y > 0.75) subjectBox.min.y = Math.max(subjectBox.min.y, 0.32);
    frameBox(cam, subjectBox, dir, status ? 0.95 : 0.98, centerBias.add(new THREE.Vector3(0, -0.02, 0)));
    // background: the hero colour; skills a shade darker and cooler, powers lit warm from the centre
    const type = def?.type || 'attack';
    const bgCol = new THREE.Color(status ? 0x6f7479 : color);
    if (type === 'skill') bgCol.lerp(new THREE.Color(0x1d2a33), 0.3);
    if (type === 'power') bgCol.lerp(new THREE.Color(0xe3b04b), 0.22);
    const bt = backdropTex(bgCol.getHex(), id, { dark: type === 'power' ? 0.22 : 0.14 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: bt, color: new THREE.Color(0.75, 0.75, 0.75), depthWrite: false }));
    placeBehind(back, cam, subjectBox, 2.5);
    back.renderOrder = -1; scene.add(back);
    try {
      return await renderPainted(renderer, scene, cam, W, H, {
        exposure: 1.15, bloom: 0.35, threshold: 1.4, radius: 4.2, edge: 0.6, stroke: 0.08, grain: 0.06, vignette: 0.7, vigColor: [0.25, 0.2, 0.2], detail: 0.08,
        lift: [0.02, 0.02, 0.025], saturation: 0.95, contrast: 1.08, seed: hashNum(id),
      });
    } finally {
      weapon?.dispose?.(); actor?.dispose(); bt.dispose(); back.geometry.dispose(); back.material.dispose(); ground.geometry.dispose(); ground.material.dispose();
      owned.forEach(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
    }
  }

  // ---- icons (relics, potions, weapons) ----
  async function renderIcon(kind, id) {
    const S = iconSize;
    const scene = new THREE.Scene();
    scene.environment = roomEnvironment(renderer); scene.environmentIntensity = 0.5;
    const obj = await iconSubject(kind, id, scene);
    const g = new THREE.Group(); g.add(obj); scene.add(g);
    // centre it, turn it to a 3/4 view
    const b0 = new THREE.Box3().setFromObject(obj); obj.position.sub(b0.getCenter(new THREE.Vector3()));
    const cam = new THREE.PerspectiveCamera(26, 1, 0.01, 50);
    const key = new THREE.DirectionalLight(0xfff0dc, 3.0); key.position.set(-2, 4, 5);
    const rim = new THREE.DirectionalLight(0x9fe0ff, 3.5); rim.position.set(3, 2.5, -4);
    const rim2 = new THREE.DirectionalLight(0xffb070, 1.6); rim2.position.set(-4, 1, -3);
    scene.add(key, rim, rim2, new THREE.HemisphereLight(0xdfe8ec, 0x302820, 0.7));
    const box = new THREE.Box3().setFromObject(g);
    frameBox(cam, box, new THREE.Vector3(0.0, 0.32, 1), 0.8);
    try {
      const canvas = await renderPainted(renderer, scene, cam, S, S, {
        exposure: 1.2, bloom: 0.2, threshold: 1.6, radius: 2.6 * 720 / S * 0.5, edge: 0.45, stroke: 0.05, grain: 0.0, vignette: 0, detail: 0.15,
        saturation: 1.0, contrast: 1.08, lift: [0, 0, 0], shadowTint: [0, 0, 0], highTint: [0.02, 0.01, 0], tone: 0, seed: hashNum(id), clear: [0, 0, 0, 0],
      }, { transparent: true });
      return outlined(canvas);
    } finally { disposeTree(obj); }
  }

  // ---- portraits ----
  async function renderPortrait(key) {
    const S = portraitSize;
    const model = MODEL_FILES[key] ? key : ENEMY_MODEL[key] || 'z_romero';
    const hero = model === 'marc' || model === 'yola';
    const scene = new THREE.Scene();
    scene.environment = roomEnvironment(renderer); scene.environmentIntensity = 0.25;
    const color = hero ? HERO_COLOR[model] : key === 'shield_guard' ? 0x8a2a20 : ['big_walker', 'sleeping_patient', 'orderly'].includes(key) ? 0x6a5a2a : 0x4f6248;
    addLights(scene, color, { key: 2.4, rim: 3.6 });
    const a = await character(model);
    scene.add(a.root);
    const idle = hero ? (model === 'marc' ? 'ual1_Idle_Loop' : 'ual1_Sword_Exit') : (a.has('ual_Zombie_Idle_Loop') ? 'ual_Zombie_Idle_Loop' : 'idle');
    a.pose(idle, model === 'yola' ? 1.3 : 0.4);
    a.root.rotation.y = (hero ? 28 : -28) * D2R;
    a.root.updateMatrixWorld(true);
    const v = new THREE.Vector3(), head = (a.bones.Head || a.bones.Neck).getWorldPosition(new THREE.Vector3());
    const box = new THREE.Box3().setFromCenterAndSize(head.clone().add(new THREE.Vector3(0, -0.06, 0)), new THREE.Vector3(0.5, 0.5, 0.3));
    if (a.bones.HeadTop_End) box.expandByPoint(a.bones.HeadTop_End.getWorldPosition(v));
    const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 30);
    frameBox(cam, box, new THREE.Vector3(hero ? 0.12 : -0.12, 0.05, 1), 0.92, new THREE.Vector3(0, -0.04, 0));
    const bt = backdropTex(color, key, { dark: 0.1 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: bt, color: new THREE.Color(0.6, 0.6, 0.6), depthWrite: false }));
    placeBehind(back, cam, box, 1.2); scene.add(back);
    try {
      return await renderPainted(renderer, scene, cam, S, S, {
        exposure: 1.15, bloom: 0.3, threshold: 1.4, radius: 3.0 * 720 / S * 0.5, edge: 0.55, stroke: 0.07, grain: 0.05, vignette: 0.9, vigColor: [0.15, 0.13, 0.13],
        detail: 0.1, saturation: 0.95, contrast: 1.1, seed: hashNum(key),
      });
    } finally { a.dispose(); bt.dispose(); back.geometry.dispose(); back.material.dispose(); }
  }

  const sizeKey = (a) => Array.isArray(a) ? a.join('x') : String(a);
  return {
    cardArt: id => cached('card', id, sizeKey(cardSize), () => renderCard(id)),
    relicIcon: id => cached('relic', id, iconSize, () => renderIcon('relic', id)),
    potionIcon: id => cached('potion', id, iconSize, () => renderIcon('potion', id)),
    weaponIcon: id => cached('weapon', id, iconSize, () => renderIcon('weapon', id)),
    portrait: key => cached('portrait', key, portraitSize, () => renderPortrait(key)),
    /** Render a list of card ids ahead of time (e.g. the starter deck behind the title screen). */
    async prewarm(ids = []) { for (const id of ids) await this.cardArt(id).catch(() => {}); },
    /** Drop the memory cache (and, with persistent: true, the IndexedDB entries). */
    async clear({ persistent = false } = {}) { for (const p of mem.values()) p.then(u => u?.startsWith?.('blob:') && URL.revokeObjectURL(u)).catch(() => {}); mem.clear(); if (persistent && db) await dbClear(db).catch(() => {}); },
  };
}
const guessHero = id => /shot|tap|pistol|aim|kneecap|cover|tuck|mag|flare|triage|adrenaline|marksman|spray|painkiller|feet|kill|overdrive|slow|eye|defib|blank|buck|barrel|sidestep|fire/.test(id) ? 'yola' : 'marc';
const hashNum = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h; };

// a plane behind the subject that fills the camera's view
function placeBehind(mesh, cam, box, extra = 2) {
  const c = box.getCenter(new THREE.Vector3());
  const dir = new THREE.Vector3().subVectors(c, cam.position).normalize();
  const dist = cam.position.distanceTo(c) + box.getSize(new THREE.Vector3()).length() / 2 + extra;
  mesh.position.copy(cam.position).addScaledVector(dir, dist);
  mesh.quaternion.copy(cam.quaternion);
  const h = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * 1.15;
  mesh.scale.set(h * cam.aspect, h, 1);
}
function muzzleFlash() {
  const t = canvasTex(128, 128, (ctx, W) => {
    const g = ctx.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.2, 'rgba(255,200,90,0.9)'); g.addColorStop(0.55, 'rgba(255,120,30,0.35)'); g.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = 'rgba(255,240,200,0.8)';
    for (let i = 0; i < 6; i++) { ctx.save(); ctx.translate(W / 2, W / 2); ctx.rotate(i * Math.PI / 3 + 0.3); ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(W * 0.48, 0); ctx.lineTo(0, 4); ctx.fill(); ctx.restore(); }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(4, 3.4, 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  return m;
}
// a soft dark outline + drop shadow so an icon reads on any panel
function outlined(src) {
  const c = makeCanvas(src.width, src.height), ctx = c.getContext('2d');
  try { ctx.filter = 'drop-shadow(0 0 1.5px rgba(0,0,0,0.9)) drop-shadow(0 3px 4px rgba(0,0,0,0.55))'; } catch (e) { /* no canvas filters */ }
  ctx.drawImage(src, 0, 0);
  ctx.filter = 'none';
  return c;
}
function disposeTree(o) { o.traverse(m => { if (m.userData.studioOwned) { m.geometry?.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => { x?.map?.dispose(); x?.dispose(); }); } }); }

// ---------------------------------------------------------------- icon subjects
// kit models where one fits; small procedural ones otherwise (marked studioOwned so they get disposed)
const RELIC_ART = {
  nurses_kit: 'items/medkit', emergency_rations: 'items/food-can', cooler: 'props/courier_coolers', combo_counter: 'stopwatch',
  duct_tape: 'tape', coffee_thermos: 'thermos', stethoscope: 'stethoscope', pager: 'pager', protein_bar: 'bar:#c8483a:PROTEIN', granola: 'bar:#c99a3a:GRANOLA',
  knee_brace: 'brace', iv_bag: 'ivbag', coin_jar: 'jar', tally_marks: 'tally', riot_vest: 'vest', box_cutter: 'cutter', door_wedge: 'wedge',
  trophy_belt: 'belt', hollow_points: 'bullets', steel_plate: 'plate', defib_pads: 'pads', staff_badge: 'badge', doctors_note: 'note',
};
const POTION_ART = {
  medkit: 'props/first_aid_case_closed', adrenaline: 'injector:#e8c228', extinguisher: 'props/fire_extinguisher', flashbang: 'grenade', energy_drink: 'can',
  body_armor: 'armor', pipe_bomb: 'pipebomb', protein_shake: 'shaker', painkiller_pills: 'pills', epi_pen: 'injector:#3a7bd5',
};
let relicsMod;
async function iconSubject(kind, id, scene) {
  if (kind === 'weapon') {
    if (weaponsMod === undefined) weaponsMod = await import('./weapons.js').catch(() => null);
    if (weaponsMod?.createWeapon) {
      const w = await weaponsMod.createWeapon(id, scene);
      scene.remove(w.obj);
      const o = new THREE.Group(); o.add(w.obj);
      w.obj.position.set(0, 0, 0); w.obj.quaternion.identity(); w.obj.scale.setScalar(1);
      // lay it diagonally across the frame, head up-right
      if (w.kind === 'melee') w.obj.rotation.set(0, 0, -50 * D2R); else w.obj.rotation.set(0, -90 * D2R, 12 * D2R);
      return o;
    }
    const file = { wood_bat: 'wood_bat', nail_bat: 'wood_bat', wire_bat: 'wood_bat', crowbar: 'crowbar', fire_axe: 'fire_axe', sledgehammer: 'sledgehammer', pistol: 'pistol_core', shotgun: 'pump_shotgun', sawed_off: 'pump_short' }[id] || 'wood_bat';
    const o = await loadModel('weapons/' + file); return o;
  }
  let art = kind === 'relic' ? RELIC_ART[id] : POTION_ART[id];
  if (!art && kind === 'relic') {
    if (relicsMod === undefined) relicsMod = await import('../game/content/relics.js').catch(() => null);
    const R = relicsMod?.RELICS?.[id];
    if (R?.rarity === 'weapon') return iconSubject('weapon', id, scene);
    art = R?.model || 'items/radio';
  }
  if (!art) art = 'injector:#8b8f94';
  if (art.includes('/')) {
    const o = await loadModel(art);
    o.rotation.y = -30 * D2R;
    return o;
  }
  return proc(art, id);
}

// ---- procedural props (metres; roughly real size, the camera fits them anyway) ----
function M(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o }); }
function mesh(geo, mat, at = [0, 0, 0], rot = [0, 0, 0]) { const m = new THREE.Mesh(geo, mat); m.position.set(...at); m.rotation.set(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R); m.userData.studioOwned = true; m.castShadow = true; return m; }
function labelTex(text, bg, fg, w = 256, h = 128, font = 0.42) {
  return canvasTex(w, h, (ctx, W, H) => { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.fillStyle = fg; ctx.font = `700 ${Math.round(H * font)}px ${SIGN_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, W / 2, H * 0.54, W * 0.9); });
}
function proc(art, id) {
  const g = new THREE.Group();
  const add = (...ms) => { ms.forEach(m => g.add(m)); return g; };
  const [kind, a1, a2] = art.split(':');
  switch (kind) {
    case 'tape': { // a roll of grey duct tape standing on its edge, the torn tail hanging off the bottom
      const tape = M(0x5a6064, { roughness: 0.5, metalness: 0.25 });
      add(mesh(new THREE.TorusGeometry(0.052, 0.024, 20, 48), tape));
      add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.046, 32, 1, true), M(0xa8824e, { side: THREE.DoubleSide, roughness: 0.8 }), [0, 0, 0], [90, 0, 0]));
      const tail = new THREE.PlaneGeometry(0.046, 0.08, 1, 6); const p = tail.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, 0.01 * Math.sin(p.getY(i) * 40));
      tail.computeVertexNormals();
      add(mesh(tail, M(0x5a6064, { roughness: 0.5, metalness: 0.25, side: THREE.DoubleSide }), [0.01, -0.11, 0.0], [0, 90, 8]));
      g.rotation.y = 35 * D2R; return g;
    }
    case 'thermos': {
      add(mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.2, 32), M(0x8f979c, { metalness: 0.8, roughness: 0.3 }), [0, 0.1, 0]));
      add(mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.06, 32), M(0xb33a2c, { roughness: 0.4 }), [0, 0.225, 0]));
      add(mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.05, 32), M(0x2c3a36), [0, 0.03, 0]));
      add(mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 24, Math.PI), M(0x2c3a36), [0.045, 0.13, 0], [0, 0, -90]));
      return g;
    }
    case 'stethoscope': {
      const tube = M(0x22272a, { roughness: 0.35 }), steel = M(0xc8ccd0, { metalness: 0.9, roughness: 0.25 });
      const curve = new THREE.CatmullRomCurve3([[-0.08, 0.2, 0], [-0.1, 0.12, 0.01], [-0.05, 0.03, 0.02], [0, 0.0, 0.02], [0.05, 0.03, 0.02], [0.1, 0.12, 0.01], [0.08, 0.2, 0]].map(p => new THREE.Vector3(...p)));
      add(mesh(new THREE.TubeGeometry(curve, 64, 0.006, 8), tube));
      const stem = new THREE.CatmullRomCurve3([[0, 0.0, 0.02], [0.02, -0.06, 0.03], [0.06, -0.11, 0.03], [0.1, -0.12, 0.02]].map(p => new THREE.Vector3(...p)));
      add(mesh(new THREE.TubeGeometry(stem, 32, 0.006, 8), tube));
      add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.014, 32), steel, [0.12, -0.12, 0.02], [0, 0, 90]));
      add(mesh(new THREE.SphereGeometry(0.009, 12, 8), steel, [-0.08, 0.2, 0]), mesh(new THREE.SphereGeometry(0.009, 12, 8), steel, [0.08, 0.2, 0]));
      return g;
    }
    case 'pager': {
      add(mesh(new THREE.BoxGeometry(0.07, 0.05, 0.02), M(0x2a2e30, { roughness: 0.4 })));
      const scr = new THREE.MeshBasicMaterial({ map: labelTex('CODE', '#1a3a1a', '#8dff8d', 128, 64, 0.5), color: new THREE.Color(1.6, 1.8, 1.6) });
      add(mesh(new THREE.PlaneGeometry(0.048, 0.022), scr, [0, 0.008, 0.0101]));
      add(mesh(new THREE.BoxGeometry(0.012, 0.008, 0.004), M(0x6a7072), [-0.02, -0.016, 0.011]), mesh(new THREE.BoxGeometry(0.012, 0.008, 0.004), M(0x6a7072), [0.0, -0.016, 0.011]));
      return g;
    }
    case 'bar': { // a wrapped bar with crimped ends
      const t = labelTex(a2 || 'BAR', a1 || '#c8483a', '#fff4e0', 256, 96, 0.5);
      add(mesh(new THREE.BoxGeometry(0.13, 0.035, 0.018), [M(a1), M(a1), M(a1), M(a1), new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 }), M(a1)]));
      for (const x of [-0.072, 0.072]) add(mesh(new THREE.BoxGeometry(0.014, 0.03, 0.006), M(0xd8d8d0, { metalness: 0.6, roughness: 0.3 }), [x, 0, 0]));
      g.rotation.z = 12 * D2R; return g;
    }
    case 'brace': {
      add(mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.14, 32, 1, true), M(0x3a4248, { roughness: 0.7, side: THREE.DoubleSide })));
      add(mesh(new THREE.TorusGeometry(0.022, 0.007, 10, 24), M(0x3d4448), [0, 0, 0.048]));
      for (const y of [-0.05, 0.05]) add(mesh(new THREE.TorusGeometry(0.051, 0.006, 8, 32), M(0x2fa39a), [0, y, 0], [90, 0, 0]));
      g.rotation.set(35 * D2R, 0, 20 * D2R); return g;
    }
    case 'ivbag': {
      const bag = new THREE.MeshStandardMaterial({ color: 0xe8f0e8, roughness: 0.15, transparent: true, opacity: 0.75 });
      const b = mesh(new THREE.SphereGeometry(0.06, 24, 16), bag); b.scale.set(1, 1.5, 0.35); add(b);
      const fl = mesh(new THREE.SphereGeometry(0.052, 24, 16), M(0xd8c060, { roughness: 0.2, transparent: true, opacity: 0.85 }), [0, -0.012, 0]); fl.scale.set(1, 1.2, 0.3); add(fl);
      add(mesh(new THREE.PlaneGeometry(0.06, 0.04), new THREE.MeshStandardMaterial({ map: labelTex('SALINE', '#ffffff', '#1f5fa8', 128, 64, 0.4) }), [0, 0.02, 0.022]));
      const tube = new THREE.CatmullRomCurve3([[0, -0.09, 0], [0.01, -0.13, 0.01], [0.05, -0.16, 0.0], [0.08, -0.14, -0.01]].map(p => new THREE.Vector3(...p)));
      add(mesh(new THREE.TubeGeometry(tube, 24, 0.004, 8), bag));
      add(mesh(new THREE.TorusGeometry(0.012, 0.003, 8, 16), M(0x9aa0a4, { metalness: 0.7 }), [0, 0.1, 0]));
      return g;
    }
    case 'jar': {
      add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.11, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0xcfe3e8, roughness: 0.05, transparent: true, opacity: 0.35, side: THREE.DoubleSide }), [0, 0.055, 0]));
      add(mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.015, 32), M(0xb08a3a, { metalness: 0.7, roughness: 0.35 }), [0, 0.118, 0]));
      const coin = M(0xd8b04a, { metalness: 0.9, roughness: 0.3 }), copper = M(0xb0673a, { metalness: 0.9, roughness: 0.35 });
      const r = seededRandom(id);
      for (let i = 0; i < 26; i++) add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.003, 16), r() < 0.3 ? copper : coin, [r.range(-0.035, 0.035), 0.004 + i * 0.0026, r.range(-0.035, 0.035)], [r.range(-30, 30), 0, r.range(-30, 30)]));
      return g;
    }
    case 'tally': {
      const t = canvasTex(256, 320, (ctx, W, H) => {
        ctx.fillStyle = '#efe8d6'; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = '#7a1a14'; ctx.lineWidth = 7; ctx.lineCap = 'round';
        for (let row = 0; row < 3; row++) for (let grp = 0; grp < 2; grp++) { const x0 = 30 + grp * 110, y0 = 60 + row * 90; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x0 + i * 18, y0); ctx.lineTo(x0 + i * 18 + 3, y0 + 55); ctx.stroke(); } if (row < 2 || grp === 0) { ctx.beginPath(); ctx.moveTo(x0 - 8, y0 + 40); ctx.lineTo(x0 + 70, y0 + 12); ctx.stroke(); } }
      });
      add(mesh(new THREE.BoxGeometry(0.16, 0.22, 0.006), [M(0x7a5a3a), M(0x7a5a3a), M(0x7a5a3a), M(0x7a5a3a), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }), M(0x7a5a3a)]));
      add(mesh(new THREE.BoxGeometry(0.07, 0.02, 0.012), M(0xb8bcc0, { metalness: 0.9, roughness: 0.3 }), [0, 0.105, 0.006]));
      g.rotation.z = -6 * D2R; return g;
    }
    case 'vest': {
      const cloth = M(0x24303a, { roughness: 0.8 });
      add(mesh(new THREE.BoxGeometry(0.34, 0.4, 0.08), cloth, [0, 0, 0]));
      add(mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), cloth, [-0.12, 0.25, 0]), mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), cloth, [0.12, 0.25, 0]));
      add(mesh(new THREE.PlaneGeometry(0.24, 0.07), new THREE.MeshStandardMaterial({ map: labelTex('SECURITY', '#24303a', '#e8e2d0', 256, 72, 0.6) }), [0, 0.06, 0.041]));
      for (const y of [-0.08, -0.15]) add(mesh(new THREE.BoxGeometry(0.36, 0.025, 0.09), M(0x101418), [0, y, 0]));
      return g;
    }
    case 'cutter': {
      add(mesh(new THREE.BoxGeometry(0.13, 0.026, 0.012), M(0xe8c228, { roughness: 0.4 })));
      add(mesh(new THREE.BoxGeometry(0.05, 0.016, 0.002), M(0xd0d4d8, { metalness: 1, roughness: 0.15 }), [0.085, 0.002, 0]));
      add(mesh(new THREE.BoxGeometry(0.03, 0.006, 0.014), M(0x333333), [-0.02, 0.014, 0]));
      g.rotation.z = 25 * D2R; return g;
    }
    case 'wedge': {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.14, 0); sh.lineTo(0.14, 0.045); sh.lineTo(0, 0.008); sh.lineTo(0, 0);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2 }); geo.center();
      add(mesh(geo, M(0xd8742a, { roughness: 0.7 })));
      return g;
    }
    case 'belt': { // a leather belt in a loose loop with a brass buckle and trophy tags
      add(mesh(new THREE.TorusGeometry(0.1, 0.006, 8, 64, Math.PI * 1.85), M(0x6a4024, { roughness: 0.55 }), [0, 0, 0], [0, 0, -77]));
      const band = mesh(new THREE.TorusGeometry(0.1, 0.022, 4, 64, Math.PI * 1.85), M(0x5a3820, { roughness: 0.6 }), [0, 0, 0], [0, 0, -77]); band.scale.z = 0.25; add(band);
      add(mesh(new THREE.BoxGeometry(0.06, 0.05, 0.012), M(0xc8a040, { metalness: 0.9, roughness: 0.3 }), [0, -0.1, 0.006]));
      add(mesh(new THREE.BoxGeometry(0.04, 0.03, 0.014), M(0x5a3820), [0, -0.1, 0.006]));
      for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.42 + Math.PI / 2; add(mesh(new THREE.BoxGeometry(0.018, 0.03, 0.004), M(0xd8d0b8, { roughness: 0.5 }), [Math.cos(a) * 0.1, Math.sin(a) * 0.1 - 0.03, 0.01], [0, 0, (a - Math.PI / 2) / D2R])); }
      return g;
    }
    case 'bullets': {
      const brass = M(0xc89a3a, { metalness: 0.95, roughness: 0.25 }), lead = M(0x8a6a50, { metalness: 0.6, roughness: 0.4 });
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.022, b = new THREE.Group();
        b.add(mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.022, 16), brass, [0, 0.011, 0]));
        b.add(mesh(new THREE.CylinderGeometry(0.0035, 0.0055, 0.011, 16), lead, [0, 0.0275, 0]));
        b.add(mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.002, 12), M(0x111111), [0, 0.0335, 0]));
        b.position.set(x, 0, i === 1 ? 0.01 : 0); b.rotation.z = (i - 1) * -8 * D2R; g.add(b);
      }
      return g;
    }
    case 'plate': {
      const geo = new THREE.BoxGeometry(0.22, 0.28, 0.018, 4, 4, 1);
      const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, p.getZ(i) + 0.02 * (1 - (x * x) / 0.0121) * 0.6 - Math.max(0, y - 0.1) * 0.0); }
      geo.computeVertexNormals();
      add(mesh(geo, M(0x7d868c, { metalness: 0.85, roughness: 0.35 })));
      for (const [x, y] of [[-0.09, 0.12], [0.09, 0.12], [-0.09, -0.12], [0.09, -0.12]]) add(mesh(new THREE.SphereGeometry(0.008, 10, 8), M(0x4a5054, { metalness: 0.9 }), [x, y, 0.016]));
      return g;
    }
    case 'pads': {
      const pad = M(0xe8e4dc, { roughness: 0.6 });
      for (const [x, r] of [[-0.06, -12], [0.06, 10]]) {
        const p = mesh(new THREE.BoxGeometry(0.09, 0.12, 0.012), pad, [x, 0, 0], [0, 0, r]); g.add(p);
        const bolt = new THREE.MeshStandardMaterial({ map: labelTex('⚡', '#e8e4dc', '#d8a020', 128, 128, 0.7) });
        g.add(mesh(new THREE.PlaneGeometry(0.06, 0.06), bolt, [x, 0.01, 0.007], [0, 0, r]));
      }
      const wire = new THREE.CatmullRomCurve3([[-0.06, -0.06, 0], [-0.04, -0.12, 0.01], [0.0, -0.14, 0.0], [0.04, -0.12, 0.01], [0.06, -0.06, 0]].map(p => new THREE.Vector3(...p)));
      add(mesh(new THREE.TubeGeometry(wire, 32, 0.004, 8), M(0xb8342a)));
      return g;
    }
    case 'badge': {
      const t = canvasTex(256, 384, (ctx, W, H) => {
        ctx.fillStyle = '#f2efe6'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#2fa39a'; ctx.fillRect(0, 0, W, H * 0.2);
        ctx.fillStyle = '#fff'; ctx.font = `700 ${H * 0.12}px ${SIGN_FONT}`; ctx.textAlign = 'center'; ctx.fillText('STAFF', W / 2, H * 0.15);
        ctx.fillStyle = '#9aa6aa'; ctx.fillRect(W * 0.25, H * 0.26, W * 0.5, H * 0.36); ctx.fillStyle = '#5f6a6e'; ctx.beginPath(); ctx.arc(W / 2, H * 0.38, W * 0.12, 0, 7); ctx.fill(); ctx.fillRect(W * 0.32, H * 0.5, W * 0.36, H * 0.12);
        ctx.fillStyle = '#333'; for (let i = 0; i < 3; i++) ctx.fillRect(W * 0.18, H * (0.7 + i * 0.08), W * (0.64 - i * 0.12), H * 0.03);
      });
      add(mesh(new THREE.BoxGeometry(0.054, 0.085, 0.002), [M(0xeeeeee), M(0xeeeeee), M(0xeeeeee), M(0xeeeeee), new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 }), M(0xeeeeee)]));
      add(mesh(new THREE.BoxGeometry(0.016, 0.012, 0.004), M(0xb8bcc0, { metalness: 0.9, roughness: 0.3 }), [0, 0.048, 0]));
      const lan = new THREE.CatmullRomCurve3([[0, 0.054, 0], [-0.03, 0.09, -0.01], [-0.05, 0.14, -0.02]].map(p => new THREE.Vector3(...p)));
      add(mesh(new THREE.TubeGeometry(lan, 16, 0.003, 6), M(0x2fa39a)));
      g.rotation.z = -8 * D2R; return g;
    }
    case 'note': {
      const t = canvasTex(256, 320, (ctx, W, H) => {
        ctx.fillStyle = '#f4f0e2'; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = '#a8c0d8'; ctx.lineWidth = 2; for (let y = 70; y < H; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        ctx.fillStyle = '#c8483a'; ctx.fillRect(20, 16, 34, 10); ctx.fillRect(32, 4, 10, 34);
        ctx.font = `700 26px ${SIGN_FONT}`; ctx.fillStyle = '#1f3a6a'; ctx.fillText('Rx', 70, 38);
        ctx.strokeStyle = '#1f3a6a'; ctx.lineWidth = 3; const r = seededRandom('note');
        for (let l = 0; l < 7; l++) { ctx.beginPath(); let x = 24; const y = 92 + l * 26; ctx.moveTo(x, y); while (x < W - 30 - r() * 60) { x += 8; ctx.lineTo(x, y - 4 + r() * 8); } ctx.stroke(); }
      });
      const geo = new THREE.PlaneGeometry(0.15, 0.19, 8, 1); const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / 0.15 + 0.5) * Math.PI) * 0.012);
      geo.computeVertexNormals();
      add(mesh(geo, new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, side: THREE.DoubleSide })));
      g.rotation.z = 8 * D2R; return g;
    }
    case 'stopwatch': {
      add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.022, 40), M(0xc8ccd0, { metalness: 0.9, roughness: 0.25 }), [0, 0, 0], [90, 0, 0]));
      const face = canvasTex(256, 256, (ctx, W) => { ctx.fillStyle = '#f2efe6'; ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2, 0, 7); ctx.fill(); ctx.strokeStyle = '#222'; ctx.lineWidth = 6; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * W * 0.38, W / 2 + Math.sin(a) * W * 0.38); ctx.lineTo(W / 2 + Math.cos(a) * W * 0.46, W / 2 + Math.sin(a) * W * 0.46); ctx.stroke(); } ctx.strokeStyle = '#c8483a'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(W / 2, W / 2); ctx.lineTo(W * 0.78, W * 0.3); ctx.stroke(); });
      add(mesh(new THREE.CircleGeometry(0.045, 40), new THREE.MeshStandardMaterial({ map: face, roughness: 0.3 }), [0, 0, 0.0115]));
      add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.018, 16), M(0xc8ccd0, { metalness: 0.9, roughness: 0.25 }), [0, 0.06, 0]));
      add(mesh(new THREE.TorusGeometry(0.012, 0.003, 8, 20), M(0xc8ccd0, { metalness: 0.9 }), [0, 0.078, 0]));
      return g;
    }
    case 'injector': { // auto-injector / syringe in a colour
      const body = M(a1 || '#e8c228', { roughness: 0.35 });
      add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.13, 24), body, [0, 0, 0]));
      add(mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.04, 24), M(0x2a2e30), [0, 0.07, 0]));
      add(mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.02, 24), M(0xff7a2a), [0, -0.075, 0]));
      add(mesh(new THREE.PlaneGeometry(0.03, 0.06), new THREE.MeshStandardMaterial({ map: labelTex(id === 'epi_pen' ? 'EPI' : 'ADR', '#ffffff', '#111', 128, 64, 0.55), side: THREE.DoubleSide }), [0, 0.0, 0.0146]));
      g.rotation.z = -35 * D2R; return g;
    }
    case 'grenade': {
      add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.1, 24), M(0x3d4a3a, { roughness: 0.5 })));
      for (const y of [-0.035, 0.0, 0.035]) add(mesh(new THREE.CylinderGeometry(0.0295, 0.0295, 0.006, 24), M(0x2a3228), [0, y, 0]));
      add(mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.02, 16), M(0x8a8f94, { metalness: 0.8, roughness: 0.3 }), [0, 0.06, 0]));
      add(mesh(new THREE.BoxGeometry(0.008, 0.08, 0.004), M(0x8a8f94, { metalness: 0.8 }), [0.022, 0.035, 0], [0, 0, 8]));
      add(mesh(new THREE.TorusGeometry(0.012, 0.0022, 8, 20), M(0xc8ccd0, { metalness: 0.9 }), [-0.02, 0.072, 0], [0, 40, 0]));
      return g;
    }
    case 'can': {
      const t = canvasTex(512, 256, (ctx, W, H) => { ctx.fillStyle = '#5fd12a'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#141814'; for (const x0 of [0.02, 0.52]) { ctx.beginPath(); ctx.moveTo(W * (x0 + 0.12), 0); ctx.lineTo(W * (x0 + 0.2), 0); ctx.lineTo(W * (x0 + 0.1), H); ctx.lineTo(W * (x0 + 0.02), H); ctx.fill(); ctx.font = `700 ${H * 0.36}px ${SIGN_FONT}`; ctx.fillText('VOLT', W * (x0 + 0.22), H * 0.62); } });
      add(mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 32), [new THREE.MeshStandardMaterial({ map: t, roughness: 0.3, metalness: 0.4 }), M(0xc0c4c8, { metalness: 0.9, roughness: 0.25 }), M(0xc0c4c8, { metalness: 0.9, roughness: 0.25 })]));
      g.rotation.y = 40 * D2R; return g;
    }
    case 'armor': {
      add(mesh(new THREE.BoxGeometry(0.3, 0.36, 0.05), M(0x3a4a5c, { roughness: 0.6 })));
      add(mesh(new THREE.BoxGeometry(0.22, 0.26, 0.02), M(0x6a7884, { metalness: 0.7, roughness: 0.35 }), [0, 0.01, 0.034]));
      for (const y of [-0.06, -0.12]) add(mesh(new THREE.BoxGeometry(0.32, 0.022, 0.06), M(0x15191c), [0, y, 0]));
      return g;
    }
    case 'pipebomb': {
      add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 24), M(0x7a7f84, { metalness: 0.8, roughness: 0.4 }), [0, 0, 0], [0, 0, 90]));
      for (const x of [-0.085, 0.085]) add(mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.022, 6), M(0x5a5f64, { metalness: 0.8, roughness: 0.4 }), [x, 0, 0], [0, 0, 90]));
      add(mesh(new THREE.CylinderGeometry(0.0235, 0.0235, 0.035, 24), M(0x2a3a5a, { roughness: 0.5 }), [0.02, 0, 0], [0, 0, 90]));
      const fuse = new THREE.CatmullRomCurve3([[0.095, 0, 0], [0.12, 0.02, 0], [0.13, 0.05, 0.01]].map(p => new THREE.Vector3(...p)));
      add(mesh(new THREE.TubeGeometry(fuse, 16, 0.003, 6), M(0xb8342a)));
      g.rotation.z = 15 * D2R; return g;
    }
    case 'shaker': {
      add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.14, 32), new THREE.MeshStandardMaterial({ color: 0xf2e6ea, roughness: 0.2, transparent: true, opacity: 0.85 })));
      add(mesh(new THREE.CylinderGeometry(0.031, 0.027, 0.08, 32), M(0xd88aa0, { roughness: 0.6 }), [0, -0.028, 0]));
      add(mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.03, 32), M(0x2a2e30), [0, 0.085, 0]));
      add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 12), M(0x2a2e30), [0.012, 0.108, 0]));
      return g;
    }
    case 'pills': {
      add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.07, 28), new THREE.MeshStandardMaterial({ color: 0xe88a2a, roughness: 0.2, transparent: true, opacity: 0.8 })));
      add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 28), M(0xf2f2ee), [0, 0.045, 0]));
      add(mesh(new THREE.PlaneGeometry(0.05, 0.035), new THREE.MeshStandardMaterial({ map: labelTex('Rx', '#ffffff', '#1f3a6a', 128, 96, 0.6), side: THREE.DoubleSide }), [0, 0, 0.0262]));
      const pill = M(0xf2f2ee); for (const [x, z, r] of [[0.045, 0.02, 30], [0.06, -0.01, -20], [0.04, 0.045, 80]]) add(mesh(new THREE.CapsuleGeometry(0.006, 0.012, 4, 8), pill, [x, -0.03, z], [90, r, 0]));
      return g;
    }
    default: return proc('injector:#8b8f94', id);
  }
}

// ---------------------------------------------------------------- IndexedDB (blob cache)
function openDb() {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((res) => {
    try {
      const rq = indexedDB.open('sarno-studio', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('art');
      rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}
async function dbGet(dbp, key) { const db = await dbp; if (!db) return null; return new Promise((res, rej) => { const rq = db.transaction('art').objectStore('art').get(key); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => rej(rq.error); }); }
async function dbPut(dbp, key, blob) { const db = await dbp; if (!db) return; return new Promise((res, rej) => { const tx = db.transaction('art', 'readwrite'); tx.objectStore('art').put(blob, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
async function dbClear(dbp) { const db = await dbp; if (!db) return; return new Promise(res => { const tx = db.transaction('art', 'readwrite'); tx.objectStore('art').clear(); tx.oncomplete = res; tx.onerror = res; }); }

// ---------------------------------------------------------------- debug: a clip's frames as a contact sheet (unfiltered)
/** Render n frames of a clip on one hero into a canvas grid (pose picking). */
export async function poseSheet(renderer, key, clip, { n = 12, cols = 6, size = 200, weapon = null } = {}) {
  const a = await character(key);
  const dur = a.duration(clip); if (!dur) return null;
  const scene = new THREE.Scene();
  addLights(scene, key === 'marc' ? HERO_COLOR.marc : HERO_COLOR.yola);
  scene.add(a.root); a.root.rotation.y = 60 * D2R;
  const w = weapon ? await heldWeapon(weapon, scene, a) : null;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const rows = Math.ceil(n / cols), out = makeCanvas(cols * size, rows * size), ctx = out.getContext('2d');
  for (let i = 0; i < n; i++) {
    const t = dur * i / (n - 1);
    a.pose(clip, t); if (w) { a.grip(w.kind === 'melee' ? 'bat_idle' : 'pistol_idle', w.kind === 'melee'); w.place(a); }
    frameBox(cam, new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 0.95, 0), new THREE.Vector3(2.0, 2.1, 1)), new THREE.Vector3(0.18, 0.16, 1), 1);
    const c = await runExclusive(() => renderPainted(renderer, scene, cam, size, size, { paint: false, vignette: 0, bloom: 0, exposure: 1.3, clear: [0.19, 0.22, 0.23, 1] }));
    ctx.drawImage(c, (i % cols) * size, Math.floor(i / cols) * size);
    ctx.fillStyle = '#fff'; ctx.font = '13px monospace'; ctx.fillText(`${clip} ${t.toFixed(2)}s`, (i % cols) * size + 4, Math.floor(i / cols) * size + 15);
  }
  w?.dispose?.(); a.dispose();
  return out;
}
