// Sarno Legends, first-person prototype: Yola with her pistol (and a shotgun found in the corridor) pushes through the
// ER lobby, the corridor and a ward, three waves, Marc fighting beside her with his bat. The deckbuilder's rule carries
// over: a shove, a leg shot or Marc's bat STAGGERS a zombie (+50% damage taken); killing a staggered zombie is a
// slow-motion FINISHER with the head pop. Everything visual and audible is the deckbuilder's: models, clips, effects,
// sounds, Marc's music. See docs/FPS_PROTOTYPE.md.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { preload, prop, weaponGltf } from '../render/assets.js';
import { createFx } from '../render/fx.js';
import { createAudio } from '../audio/audio.js';
import { installTouchGuard } from '../app/touchguard.js';
import { buildLevel, collideCircle } from './level.js';
import { createZombie, TYPES } from './zombie.js';
import { createViewmodel, VM_LAYER, VM_FOV } from './viewmodel.js';
import { createInput, isTouch } from './input.js';
import { createGore } from './gore.js';
import './fps.css';

const $ = s => document.querySelector(s);
const touch = isTouch();
if (touch) document.body.classList.add('touch');
installTouchGuard();
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- renderer, scene, camera
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 2));   // fill rate is the phone's limit (docs/fps-research)
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
renderer.autoClear = false;
renderer.localClippingEnabled = true;   // Yola's arms are clipped near the eye (viewmodel.js)
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040506);
scene.fog = new THREE.FogExp2(0x06080a, 0.06);
{
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.18;
}
const camera = new THREE.PerspectiveCamera(74, 1, 0.05, 60);
camera.rotation.order = 'YXZ';
scene.add(camera);
// Yola's torch: a spotlight from just under the eyes
const torch = new THREE.SpotLight(0xfff0d8, 26, 24, 0.5, 0.6, 1.5);
torch.position.set(0.12, -0.12, 0); camera.add(torch); camera.add(torch.target); torch.target.position.set(0, -0.1, -5);
let torchOn = true;

// the effects module wants a "stage": scene, camera, renderer, per-frame callbacks and a light flash
const frameFns = new Set(); let frameN = 0;
const flashL = new THREE.PointLight(0xffc070, 0, 9, 2); scene.add(flashL);
let flashLevel = 0;
const stage = {
  scene, camera, renderer,
  onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); },
  frame: () => frameN,
  flashLight(pos, color, intensity) { if (intensity / 10 < flashLevel * 0.6) return; flashL.position.copy(pos); flashL.color.set(color); flashLevel = Math.min(6, intensity / 10); },
};
const fx = createFx(stage, { gore: 'full' });
const audio = createAudio({ autoMusic: false });
const gore = createGore(scene, fx);

// ---------------------------------------------------------------- state
const P = {
  pos: new THREE.Vector3(0, 0, -1.6), yaw: 0, pitch: 0, hp: 100, maxHp: 100, dead: false, vel: new THREE.Vector3(),
  weapon: 'pistol', ammo: { pistol: { mag: 12, size: 12, res: 48 }, shotgun: { mag: 6, size: 6, res: 12, owned: false } },
  fireCd: 0, reload: null, shoveCd: 0, recoil: 0, shake: 0, hurtT: 0, eye: 1.58, bob: 0, fovKick: 0,
};
const G = {
  state: 'loading', zombies: [], pickups: [], wave: -1, waveQ: [], spawnT: 0, alive: 0, room: 0, t: 0, timeScale: 1, slowT: 0,
  kills: 0, finishers: 0, headshots: 0, shots: 0, hits: 0, startT: 0, endT: 0, hintStagger: false, msgT: 0,
};
let level, vm, input;

// waves: one per room, triggered on entering it
const WAVES = [
  { room: 0, list: ['walker', 'walker', 'walker', 'runner', 'walker', 'walker', 'runner', 'walker', 'walker', 'runner'], max: 5, gap: 1.7, title: 'ER Lobby', sub: 'Hold the lobby' },
  { room: 2, list: ['walker', 'runner', 'walker', 'walker', 'sprinter', 'walker', 'runner', 'brute', 'walker', 'walker', 'sprinter', 'runner', 'walker', 'walker'], max: 6, gap: 1.4, title: 'The ward', sub: 'Clear the ward' },
  { room: 4, list: ['walker', 'runner', 'walker', 'sprinter', 'walker', 'walker', 'runner', 'brute', 'walker', 'sprinter', 'walker', 'runner', 'walker', 'walker', 'sprinter', 'runner', 'walker', 'brute'], max: 7, gap: 1.2, title: 'The atrium', sub: 'Last stand' },
];

// ---------------------------------------------------------------- HUD
const hud = {
  hpFill: $('.hpfill'), hpN: $('.hpn'), mag: $('.mag'), res: $('.res'), wname: $('.wname'), rl: $('.rl'), obj: $('.obj'), msg: $('.msg'),
  hm: $('.hm'), vig: $('.vig'), low: $('.lowhp'), bars: $('.bars'), fin: $('.fin'), stats: $('.stats'), mst: $('.mst'),
};
let hmT = 0;
function hitMarker(kill) { hud.hm.classList.add('on'); hud.hm.classList.toggle('kill', !!kill); hmT = 0.12; }
function message(html, secs = 2.2) { hud.msg.innerHTML = html; hud.msg.classList.add('on'); G.msgT = secs; }
function updateHud() {
  const A = P.ammo[P.weapon];
  hud.hpFill.style.width = Math.max(0, P.hp / P.maxHp * 100) + '%'; hud.hpN.textContent = Math.max(0, Math.ceil(P.hp));
  hud.mag.textContent = A.mag; hud.mag.classList.toggle('low', A.mag <= Math.ceil(A.size / 4));
  hud.res.textContent = '/ ' + A.res; hud.wname.textContent = P.weapon === 'pistol' ? 'Pistol' : 'Pump shotgun';
  hud.rl.classList.toggle('on', !!P.reload);
  hud.low.style.opacity = P.hp < 35 ? (0.5 + 0.5 * Math.sin(G.t * 6)) * (1 - P.hp / 35) + 0.25 : 0;
  hud.stats.innerHTML = `Kills ${G.kills} · Finishers ${G.finishers}`;
}

// ---------------------------------------------------------------- sound helpers
const _sv = new THREE.Vector3();
function sound(key, pos, o = {}) {
  if (!pos) return audio.sfx(key, o);
  _sv.copy(pos).sub(P.pos); const d = Math.hypot(_sv.x, _sv.z);
  const right = Math.cos(P.yaw) * _sv.x - Math.sin(P.yaw) * _sv.z;
  const vol = Math.max(0.12, Math.min(1, 1.25 - d / 16)) * (o.vol ?? 1);
  audio.sfx(key, { ...o, vol, pan: Math.max(-0.8, Math.min(0.8, right / Math.max(1, d))) });
}

// ---------------------------------------------------------------- marker for staggered zombies
const markerTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.strokeStyle = '#ffc34d'; x.lineWidth = 10; x.shadowColor = '#ff8a1a'; x.shadowBlur = 14;
  for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(64, 64, 44, i * 2.09 + 0.25, i * 2.09 + 1.6); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const game = {
  makeMarker() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: markerTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false }));
    m.rotation.x = -Math.PI / 2; g.add(m); return g;
  },
  hurtPlayer, sound, gore,
  onStagger(z) {
    sound('stagger', z.pos);
    if (!G.hintStagger) { G.hintStagger = true; message('Staggered<small>Kill it now for a finisher</small>', 2); }
  },
};

// ---------------------------------------------------------------- loading
async function load() {
  const fill = $('.fill0'), lt = $('.load');
  const keys = ['yola', 'z_romero', 'z_nurse', 'z_patient', 'z_scrubs', 'z_patient_mod', 'z_girl', 'z_sprinter', 'z_brute', 'weapon:pistol_core', 'weapon:pump_short', 'prop:medkit', 'prop:first_aid_case_closed'];
  await preload(keys, (d, n) => { fill.style.width = (n ? d / n * 70 : 0) + '%'; });
  lt.textContent = 'Building the ER…';
  level = await buildLevel(scene, { lowPower: touch });
  fill.style.width = '85%';
  vm = await createViewmodel({ scene, camera }); resize();
  // every light also lights Yola's arms (drawn on their own layer)
  scene.traverse(o => { if (o.isLight && o !== torch) o.layers.enable(VM_LAYER); });
  input = createInput(canvas, $('#touch'));
  await placePickups();
  fill.style.width = '100%';
  // warm up: compile the shaders with a zombie in view so the first spawn doesn't hitch
  try {
    const z = await createZombie(game, 'walker', { spawn: new THREE.Vector3(0, 0, -6), entry: new THREE.Vector3(0, 0, -5) });
    scene.add(z.root); renderer.compile(scene, camera); render(0.016); z.dispose(scene);
  } catch (e) { console.warn(e); }
  lt.textContent = 'Ready';
  const go = $('.go'); go.disabled = false; go.textContent = 'Start';
  G.state = 'title';
  resetPlayer();
  audio.music('menu');
}

// ---------------------------------------------------------------- pickups
const pickupGlow = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const r = x.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = r; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
})();
function ammoBox() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.2), new THREE.MeshStandardMaterial({ color: 0x4a5434, roughness: 0.7 }));
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.305, 0.04, 0.205), new THREE.MeshStandardMaterial({ color: 0xd9a830, roughness: 0.5, emissive: 0x3a2800 }));
  b.position.y = 0.08; s.position.y = 0.1; g.add(b, s); return g;
}
async function makePickup(type, x, z, { y = 0, drop = false } = {}) {
  let obj;
  if (type === 'med') { obj = await prop('first_aid_case_closed').catch(() => null); if (obj) { const bb = new THREE.Box3().setFromObject(obj); const s = 0.36 / Math.max(0.05, bb.max.x - bb.min.x); obj.scale.setScalar(s); } }
  if (type === 'ammo' || !obj) obj = ammoBox();
  if (type === 'shotgun') { obj = new THREE.Group(); const m = (await weaponGltf('pump_short')).scene.clone(true); m.rotation.z = 0.1; obj.add(m); }
  const g = new THREE.Group(); g.add(obj); g.position.set(x, y, z);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: pickupGlow, color: type === 'med' ? 0x7cf08a : type === 'shotgun' ? 0xffd27a : 0xffc34d, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.45 }));
  glow.scale.setScalar(0.9); glow.position.y = 0.25; g.add(glow);
  scene.add(g);
  const p = { type, g, obj, y, t: Math.random() * 6, taken: false, drop };
  G.pickups.push(p); return p;
}
async function placePickups() {
  await Promise.all([
    // lobby
    makePickup('ammo', -6.8, -7.8), makePickup('med', 10.6, -1.2), makePickup('ammo', 6.8, -13.8),
    // corridor A: the shotgun
    makePickup('shotgun', 0.3, -21.5), makePickup('ammo', -0.9, -25.5),
    // ward
    makePickup('med', -6, -30.5), makePickup('ammo', 6, -30.5), makePickup('ammo', -4.2, -46.5), makePickup('med', 9.8, -46),
    // corridor B
    makePickup('ammo', 0.8, -51.5), makePickup('med', -0.8, -56.5),
    // atrium
    makePickup('ammo', -11.5, -62), makePickup('ammo', 11.5, -64), makePickup('med', 0, -66), makePickup('ammo', -9, -79), makePickup('med', 9, -73),
  ]);
}
function updatePickups(dt) {
  for (const p of G.pickups) {
    if (p.taken) continue;
    p.t += dt; p.obj.rotation.y += dt * 1.2; p.obj.position.y = 0.12 + Math.sin(p.t * 2.4) * 0.04;
    const dx = p.g.position.x - P.pos.x, dz = p.g.position.z - P.pos.z;
    if (dx * dx + dz * dz > 1.0 || P.dead) continue;
    if (p.type === 'med') { if (P.hp >= P.maxHp) continue; P.hp = Math.min(P.maxHp, P.hp + 40); audio.sfx('heal'); message('<small>+40 health</small>', 1.0); }
    else if (p.type === 'ammo') { P.ammo.pistol.res += 24; if (P.ammo.shotgun.owned) P.ammo.shotgun.res += 6; audio.sfx('supplies'); message(P.ammo.shotgun.owned ? '<small>+24 rounds · +6 shells</small>' : '<small>+24 rounds</small>', 1.0); }
    else if (p.type === 'shotgun') { P.ammo.shotgun.owned = true; audio.sfx('pickup'); swapTo('shotgun'); message('Pump shotgun<small>' + (touch ? 'Tap ⇄ to swap' : 'Press 1 / 2 or Q to swap') + '</small>', 2.4); }
    p.taken = true; scene.remove(p.g);
  }
}

// ---------------------------------------------------------------- the player
function resetPlayer() {
  P.pos.copy(level?.start || new THREE.Vector3(0, 0, -2.5)); P.yaw = 0; P.pitch = -0.02; P.hp = P.maxHp; P.dead = false; P.reload = null; P.fireCd = 0; P.shoveCd = 0;
  P.ammo.pistol.mag = 12; P.ammo.pistol.res = 48; P.ammo.shotgun.mag = 6; P.ammo.shotgun.res = 12; P.ammo.shotgun.owned = false; P.weapon = 'pistol';
}
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3(), _o = new THREE.Vector3(), _m = new THREE.Vector3();
let lastLook = { dx: 0, dy: 0 };

function updatePlayer(dt, I) {
  if (P.dead) return;
  // look
  const sens = input.sens * (touch ? 1.0 : 1);
  P.yaw -= I.lookDX * sens; P.pitch -= I.lookDY * sens;
  P.pitch = Math.max(-1.35, Math.min(1.35, P.pitch));
  lastLook = { dx: I.lookDX, dy: I.lookDY };
  // move
  _f.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); _r.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  const mag = Math.min(1, Math.hypot(I.move.x, I.move.y));
  const speed = (I.run && I.move.y > 0 ? 6.2 : 4.2) * (P.reload ? 0.85 : 1);
  _d.set(0, 0, 0).addScaledVector(_f, I.move.y).addScaledVector(_r, I.move.x);
  if (_d.lengthSq() > 0) _d.normalize().multiplyScalar(speed * mag);
  P.vel.lerp(_d, 1 - Math.exp(-12 * dt));
  P.pos.addScaledVector(P.vel, dt);
  collideCircle(P.pos, 0.34, level.colliders, { player: true });
  // zombies push back a little (no walking through them)
  for (const z of G.zombies) if (!z.dead) {
    const dx = P.pos.x - z.pos.x, dz = P.pos.z - z.pos.z, r = z.radius + 0.34, d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2), k = (r - d) / d * 0.6; P.pos.x += dx * k; P.pos.z += dz * k; }
  }
  collideCircle(P.pos, 0.34, level.colliders, { player: true });
  const sp = Math.hypot(P.vel.x, P.vel.z);
  const prevBob = P.bob;
  P.bob += dt * sp * 1.9;
  if (Math.floor(prevBob / Math.PI) !== Math.floor(P.bob / Math.PI) && sp > 1) audio.sfx('step', { vol: 0.35 });

  // weapons
  P.fireCd -= dt; P.shoveCd -= dt;
  if (I.torch) { torchOn = !torchOn; torch.visible = torchOn; audio.sfx('click_02') || audio.ui?.('click'); }
  if (I.swap) {
    const to = I.swap === 'toggle' ? (P.weapon === 'pistol' ? 'shotgun' : 'pistol') : I.swap;
    if (to !== P.weapon && (to === 'pistol' || P.ammo.shotgun.owned)) swapTo(to);
  }
  if (I.reload) startReload();
  if (I.shove && P.shoveCd <= 0 && !vm.swapping) shove();
  const A = P.ammo[P.weapon];
  // reload ticking
  if (P.reload) {
    P.reload.t -= dt;
    if (P.weapon === 'shotgun') {
      // shell by shell: one in every SHELL_T s (the clip's carry to the port); firing stops the reload once a shell is in
      if (P.reload.t <= 0) {
        if (A.mag < A.size && A.res > 0) { vm.insertShell(SHELL_T); P.reload.pending = SHELL_T * 0.86; P.reload.t = SHELL_T; }
        else { vm.endReload(); P.reload = null; P.fireCd = Math.max(P.fireCd, 0.55); audio.sfx('check_mag', { rate: 1.3, vol: 0.5 }); }
      }
      if (P.reload?.pending > 0) { P.reload.pending -= dt; if (P.reload.pending <= 0) { A.mag++; A.res--; audio.sfx('pickup', { vol: 0.45, rate: 1.3 }); } }
      if (P.reload && I.firePressed && A.mag > 0) { vm.endReload(true); P.reload = null; P.fireCd = Math.max(P.fireCd, 0.12); }
    } else if (P.reload.t <= 0) {
      const n = Math.min(A.size - A.mag, A.res); A.mag += n; A.res -= n; P.reload = null;
    }
  }
  const wantFire = P.weapon === 'pistol' ? (I.firePressed || I.fire) : (I.firePressed || I.fire);
  if (wantFire && P.fireCd <= 0 && !P.reload && !vm.swapping) {
    if (A.mag > 0) fire();
    else if (I.firePressed) { audio.sfx('click_02', { vol: 0.6 }); startReload(); }
  }
  // auto-reload when the magazine runs dry
  if (A.mag === 0 && !P.reload && A.res > 0 && P.fireCd < -0.15) startReload();
}

function swapTo(to) {
  if (to === P.weapon || vm.swapping) return;
  P.reload = null; vm.cancelReload();
  vm.swap(to, () => { P.weapon = to; });
  audio.sfx('check_mag', { vol: 0.4 });
  P.fireCd = 0.45;
}

const SHELL_T = 0.62;   // s per shell
function startReload() {
  const A = P.ammo[P.weapon];
  if (P.reload || A.mag >= A.size || A.res <= 0 || vm.swapping) return;
  if (P.weapon === 'pistol') { P.reload = { t: 1.6 }; vm.reload(1.6); audio.sfx('check_mag'); }
  else { P.reload = { t: 0.4 }; vm.reload(0.4); audio.sfx('check_mag', { rate: 0.8, vol: 0.5 }); }
}

// ---------------------------------------------------------------- shooting
const ray = new THREE.Raycaster();
const _md = new THREE.Vector3();
function muzzleWorld(out) { return vm.muzzleWorld(out); }

function traceShot(o, d, maxT = 60) {
  // nearest zombie part, then the world in front of it
  let best = null;
  for (const z of G.zombies) { const h = z.raycast(o, d, maxT); if (h && (!best || h.t < best.t)) best = { ...h, z }; }
  ray.set(o, d); ray.far = best ? best.t : maxT; ray.near = 0;
  const w = ray.intersectObjects(level.rayMeshes, false)[0];
  if (w && (!best || w.distance < best.t)) return { wall: true, point: w.point, normal: w.face?.normal ? w.face.normal.clone().transformDirection(w.object.matrixWorld) : null, t: w.distance };
  return best;
}

function fire() {
  const A = P.ammo[P.weapon]; A.mag--; G.shots++;
  const shotgun = P.weapon === 'shotgun';
  P.fireCd = shotgun ? 0.82 : 0.17;
  vm.fire(); if (shotgun) setTimeout(() => vm.pumpAction(), 260);
  sound(shotgun ? 'shotgun' : 'pistol');
  P.recoil += shotgun ? 0.07 : 0.022; P.shake = Math.max(P.shake, shotgun ? 0.5 : 0.15); P.fovKick = shotgun ? 3.5 : 1.2;
  camera.updateMatrixWorld();
  const o = camera.getWorldPosition(new THREE.Vector3());
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion), rt = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const mw = muzzleWorld(new THREE.Vector3());
  stage.flashLight(mw, 0xffc070, shotgun ? 60 : 30);
  const moving = Math.hypot(P.vel.x, P.vel.z) / 4.2;
  const pellets = shotgun ? 9 : 1, spread = shotgun ? 0.055 : 0.004 + moving * 0.012 + Math.min(0.02, P.recoil * 0.25);
  const perZ = new Map();
  for (let i = 0; i < pellets; i++) {
    const a = Math.random() * Math.PI * 2, r = spread * (shotgun ? Math.sqrt(Math.random()) : Math.random());
    const d = fwd.clone().addScaledVector(rt, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    const h = traceShot(o, d);
    const end = h ? h.point : o.clone().addScaledVector(d, 40);
    if (!shotgun || i < 4) fx.tracer(mw, end, { width: shotgun ? 0.012 : 0.018 });
    if (!h) continue;
    if (h.wall) { fx.sparks(h.point, shotgun ? 3 : 6, 0xffe0a0, 2.5); if (i === 0 || Math.random() < 0.3) fx.dust(h.point, { amount: 0.3, color: 0x9a9890 }); continue; }
    const e = perZ.get(h.z) || { z: h.z, n: 0, head: 0, leg: 0, body: 0, arm: 0, point: h.point, dir: d, t: h.t, limbs: {} };
    e.n++; e[h.part]++; if (h.part === 'head') e.point = h.point;
    if (h.limb) e.limbs[h.limb] = (e.limbs[h.limb] || 0) + 1;
    perZ.set(h.z, e);
    fx.blood(h.point, d, shotgun ? 0.5 : (h.part === 'head' ? 1.2 : 0.8));
    if (!shotgun) fx.sparks(h.point, 2, 0xffb0a0, 1.5);
  }
  for (const e of perZ.values()) {
    G.hits++;
    let dmg, part, stagger = 0;
    if (shotgun) {
      dmg = e.head * 30 + e.body * 17 + e.arm * 12 + e.leg * 14;
      if (e.t < 3) dmg *= 1.25; else if (e.t > 9) dmg *= 0.6;
      part = e.head >= 2 ? 'head' : e.leg > e.body ? 'leg' : 'body';
      if (e.n >= 3) stagger = 1;
    } else {
      part = e.head ? 'head' : e.leg ? 'leg' : e.arm ? 'arm' : 'body';
      dmg = { head: 110, body: 34, arm: 22, leg: 24 }[part];
      if (part === 'leg') stagger = 1;
    }
    // the limb that took the most (a lower leg or forearm shot can come off: gore.js)
    let limb = null, ln = 0; for (const [k, n] of Object.entries(e.limbs)) if (n > ln) { limb = k; ln = n; }
    const limbDmg = limb ? (shotgun ? ln * 16 * (e.t < 4 ? 1.6 : 1) : (limb.startsWith('Lower') ? 16 : 12) * (Math.random() < 0.4 ? 2 : 1)) : 0;
    const res = e.z.damage(dmg, { part, dir: e.dir, weapon: P.weapon, stagger, close: e.t < 4.5, limb, limbDmg });
    onDamageResult(e.z, res, { part, dir: e.dir, point: e.point, weapon: P.weapon, close: e.t < 4.5 });
  }
}

function onDamageResult(z, res, { part, dir, point, weapon, close }) {
  if (!res || res.already) return;
  hitMarker(res.killed);
  if (part === 'head' && weapon !== 'shotgun') sound('stagger_crack', z.pos, { vol: 0.6 });
  sound(weapon === 'shove' ? 'heavy_hit' : weapon === 'bat' ? 'bat_hit' : 'bullet_hit', z.pos, { vol: 0.8 });
  if (res.killed) {
    G.kills++; if (part === 'head') G.headshots++;
    sound(z.typeId === 'brute' ? 'brute_death' : z.typeId === 'sprinter' ? 'sprinter_death' : 'z_death', z.pos);
    setTimeout(() => sound('body_fall', z.pos), 900);
    if (res.finisher) finisher(z, { dir, point, part });
    else if (part === 'head' && weapon === 'pistol') gore.sever(z, 'Head', dir, { burst: Math.random() < 0.5, speed: 2.8 });
    else if (part === 'head' && weapon === 'shotgun') gore.sever(z, 'Head', dir, { burst: true });
    else if (weapon === 'shotgun' && close && Math.random() < 0.6) gore.sever(z, Math.random() < 0.5 ? 'Forearm_L' : 'Forearm_R', dir, { speed: 4.5 });
    // drops
    if (Math.random() < (res.finisher ? 0.5 : 0.22)) makePickup(Math.random() < 0.7 || P.hp > 70 ? 'ammo' : 'med', z.pos.x, z.pos.z, { drop: true });
    G.alive--;
  } else if (!res.staggered) sound(z.typeId === 'brute' ? 'brute_pain' : 'z_hurt', z.pos, { vol: 0.7 });
}

// ---------------------------------------------------------------- shove (and Marc's bat): the staggers
function shove() {
  P.shoveCd = 0.65; vm.shove(); audio.sfx('swing', { vol: 0.8 });
  const fwd = _f.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  let hit = 0;
  setTimeout(() => {
    for (const z of G.zombies) {
      if (z.dead) continue;
      _m.copy(z.pos).sub(P.pos).setY(0); const d = _m.length();
      if (d > 2.0 * z.scale || _m.normalize().dot(fwd) < 0.55) continue;
      hit++;
      const res = z.damage(z.staggered ? 70 : 8, { part: 'body', dir: fwd.clone(), weapon: 'shove', stagger: 2 });
      const pt = z.pos.clone().setY(z.height * 0.62);
      fx.impact(pt, { dir: fwd, strength: 0.6, blunt: true });
      onDamageResult(z, res, { part: 'body', dir: fwd.clone(), point: pt, weapon: 'shove' });
    }
    if (hit) { P.shake = Math.max(P.shake, 0.35); }
  }, 90);
}
// a melee hit that staggers (kept for a future melee weapon)
game.batHit = (z, dir) => {
  const res = z.damage(z.staggered ? 30 : 18, { part: 'body', dir, weapon: 'bat', stagger: 1 });
  const pt = z.pos.clone().setY(z.height * 0.75);
  fx.impact(pt, { dir, strength: 0.9, blunt: true, heavy: true });
  onDamageResult(z, res, { part: 'body', dir, point: pt, weapon: 'bat' });
  return res;
};
game.zombies = () => G.zombies;
game.player = P;

// ---------------------------------------------------------------- the finisher
function finisher(z, { dir, part }) {
  G.finishers++;
  G.slowT = 0.95;                          // real seconds of slow motion
  gore.sever(z, 'Head', dir, { burst: part === 'head' && Math.random() < 0.5, speed: 4.5 });
  fx.blast(z.pos.clone().setY(z.height * 0.85), { color: 0xff5a3a, strength: 0.6, ground: false });
  audio.sfx('finisher');
  hud.bars.classList.add('on'); hud.fin.classList.add('on');
  P.fovKick = -9;
  setTimeout(() => { hud.bars.classList.remove('on'); hud.fin.classList.remove('on'); }, 1050);
}

// ---------------------------------------------------------------- taking hits
function hurtPlayer(dmg, z) {
  if (P.dead || G.state !== 'play') return;
  P.hp -= dmg; P.hurtT = 1; P.shake = Math.max(P.shake, 0.6); vm.hit();
  audio.sfx(dmg > 15 ? 'party_hit_heavy' : 'party_hit');
  fx.blood(camera.position.clone().addScaledVector(_f.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), 0.5).setY(1.3), _f, 0.3);
  // knocked back a little
  if (z) { _m.copy(P.pos).sub(z.pos).setY(0).normalize(); P.vel.addScaledVector(_m, z.type.heavy ? 6 : 2.5); }
  if (P.hp <= 0) { P.hp = 0; P.dead = true; endGame(false); }
}

// ---------------------------------------------------------------- waves
function startWave(i) {
  G.wave = i; G.waveDone = false; const W = WAVES[i];
  G.waveQ = W.list.slice(); G.spawnT = 1.4; G.alive = 0;
  hud.obj.textContent = W.title + ' · ' + W.sub;
  message(W.title + '<small>' + W.sub + '</small>', 2.4);
  audio.music('elite');
  sound('z_alert', null, { vol: 0.7 });
}
async function spawnOne(typeId) {
  const W = WAVES[G.wave];
  const pts = level.spawns[W.room];
  // prefer a doorway the player isn't standing next to and can't see straight into
  const sorted = pts.map(p => ({ p, d: p.entry.distanceTo(P.pos) + Math.random() * 4 })).filter(x => x.d > 3.5).sort((a, b) => b.d - a.d);
  const at = (sorted[0] || { p: pts[0] }).p;
  G.alive++;
  const z = await createZombie(game, typeId, at);
  if (G.state !== 'play' && G.state !== 'end') { G.alive--; return; }
  scene.add(z.root); G.zombies.push(z);
  sound(typeId === 'brute' ? 'brute_roar' : typeId === 'sprinter' ? 'sprinter_charge' : 'z_alert', z.pos);
  if (typeId === 'brute') message('Brute<small>Stagger it, then finish it</small>', 2.2);
  z.growlT = 2 + Math.random() * 5;
  // bodies pile up: keep the newest dozen
  const dead = G.zombies.filter(q => q.dead);
  if (dead.length > 12) { const q = dead[0]; q.dispose(scene); G.zombies.splice(G.zombies.indexOf(q), 1); }
}
function updateWaves(dt) {
  // entering the next room starts its wave (its door must be open)
  const room = level.roomOf(P.pos.x, P.pos.z);
  const nextW = WAVES[G.wave + 1];
  if (G.wave >= 0 && G.waveDone && nextW && room === nextW.room && P.pos.z < level.rooms[room].z[1] - 2) { G.waveDone = false; startWave(G.wave + 1); }
  if (G.wave < 0 || G.waveDone) return;
  G.spawnT -= dt;
  if (G.waveQ.length && G.spawnT <= 0 && G.alive < WAVES[G.wave].max) {
    const last = G.waveQ.length === 1 && G.waveQ[0] === 'brute' && G.wave === WAVES.length - 1;
    if (!last || G.alive === 0) { spawnOne(G.waveQ.shift()); G.spawnT = WAVES[G.wave].gap * (0.7 + Math.random() * 0.6); }
  }
  if (!G.waveQ.length && G.alive <= 0) {
    G.waveDone = true;
    audio.music('menu');
    if (G.wave < WAVES.length - 1) {
      level.doors[G.wave].open(); sound('door', new THREE.Vector3(0, 0, level.doors[G.wave].z));
      message('Floor clear<small>The doors are open</small>', 2.6);
      hud.obj.textContent = G.wave === 0 ? 'Through to the ward' : 'Through to the atrium';
    } else setTimeout(() => endGame(true), 1800);
  }
}

// ---------------------------------------------------------------- game flow
function begin() {
  if (G.state === 'title') {
    $('#title').classList.add('hide');
    G.state = 'play'; G.startT = G.t; G.wave = -1; G.waveDone = true;
    audio.unlock(); if (!params.has('nolock')) input.lock();
    setTimeout(() => { if (G.state === 'play' && G.wave < 0) startWave(0); }, 1500);
    hud.obj.textContent = 'Night shift · ER';
  }
}
function endGame(won) {
  if (G.state === 'end') return;
  G.state = 'end'; G.endT = G.t; input.unlock(); input.release();
  audio.music(won ? 'victory' : 'defeat');
  if (!won) audio.sfx('flatline');
  setTimeout(() => {
    $('#end').classList.remove('hide');
    $('.etitle').textContent = won ? 'Ward cleared' : 'Overrun';
    const secs = Math.round(G.endT - G.startT), acc = G.shots ? Math.round(G.hits / G.shots * 100) : 0;
    $('.estats').innerHTML = `${won ? 'Yola and Marc held the ER.' : 'Yola went down in the ' + level.rooms[level.roomOf(P.pos.x, P.pos.z)].name.toLowerCase() + '.'}<br>
      Kills <b>${G.kills}</b> · Finishers <b>${G.finishers}</b> · Headshots <b>${G.headshots}</b><br>Accuracy ${acc}% · Time ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  }, won ? 600 : 1600);
}
function restart() { location.reload(); }

$('.go').addEventListener('click', begin);
$('.again').addEventListener('click', restart);
$('.resume').addEventListener('click', () => { $('#pause').classList.add('hide'); input.lock(); G.paused = false; });
document.addEventListener('pointerlockchange', () => {
  if (touch || G.state !== 'play' || params.has('nolock')) return;
  if (!document.pointerLockElement) { G.paused = true; $('#pause').classList.remove('hide'); }
  else { G.paused = false; $('#pause').classList.add('hide'); }
});
canvas.addEventListener('click', () => { if (G.state === 'play' && !touch && !document.pointerLockElement) input.lock(); });

// ---------------------------------------------------------------- frame
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w / h < 1.5 ? 78 : 74; camera.updateProjectionMatrix();
  vm?.setAspect(w / h);
}
addEventListener('resize', resize);

function render() {
  renderer.clear();
  camera.layers.set(0);
  renderer.render(scene, camera);
  if (vm && G.state !== 'title' && !P.dead) { renderer.clearDepth(); camera.layers.set(VM_LAYER); const bg = scene.background, fov = camera.fov, near = camera.near;
    scene.background = null; camera.fov = window.__vmFov || VM_FOV; camera.near = 0.01; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    scene.background = bg; camera.fov = fov; camera.near = near; camera.updateProjectionMatrix(); camera.layers.set(0); }
}

let last = performance.now(), stepping = false;
function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.state === 'loading' || !level || stepping) { return; }
  if (G.paused) { render(); return; }
  tick(real);
  render();
}
function tick(real) {
  // slow motion for the finisher
  if (G.slowT > 0) { G.slowT -= real; G.timeScale += (0.16 - G.timeScale) * (1 - Math.exp(-30 * real)); }
  else G.timeScale += (1 - G.timeScale) * (1 - Math.exp(-6 * real));
  const dt = real * G.timeScale;
  G.t += real; frameN++;

  const I = input.read();
  if (G.state === 'play') { updatePlayer(dt, I); updateWaves(dt); updatePickups(dt); }
  else if (G.state === 'title') { P.yaw = Math.sin(G.t * 0.15) * 0.35; P.pitch = -0.05; }

  // camera: eye height, bob, recoil, shake, hurt flinch
  P.recoil = Math.max(0, P.recoil - dt * (P.recoil * 9 + 0.02));
  P.shake = Math.max(0, P.shake - real * 2.2);
  P.hurtT = Math.max(0, P.hurtT - real * 2.2);
  P.fovKick += (0 - P.fovKick) * (1 - Math.exp(-(G.slowT > 0 ? 2 : 8) * real));
  const sp = Math.hypot(P.vel.x, P.vel.z);
  const s = P.shake * P.shake;
  camera.position.set(P.pos.x, (P.dead ? 0.35 : P.eye) + Math.sin(P.bob * 2) * 0.025 * Math.min(1, sp / 4), P.pos.z);
  camera.rotation.set(P.pitch + P.recoil + (Math.random() - 0.5) * s * 0.05, P.yaw + (Math.random() - 0.5) * s * 0.05, Math.sin(P.bob) * 0.006 * Math.min(1, sp / 4) + (P.dead ? 0.6 : 0));
  const baseFov = innerWidth / innerHeight < 1.5 ? 78 : 74;
  camera.fov = baseFov + P.fovKick; camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // world
  level.update(dt, G.t, P.pos);
  // the zombies' flow field toward the player, a few times a second
  G.navT = (G.navT || 0) - dt; if (G.navT <= 0 && G.state === 'play') { G.navT = 0.3; level.nav.update(P.pos); }
  const ctx = { player: P, colliders: level.colliders, level, others: G.zombies };
  for (const z of G.zombies) {
    z.update(dt, ctx);
    if (!z.dead && G.state === 'play') { z.growlT -= dt; if (z.growlT <= 0) { z.growlT = 3 + Math.random() * 6; sound(z.typeId === 'brute' ? 'brute_roar' : 'z_alert', z.pos, { vol: 0.45 }); } }
  }
  gore.update(dt, G.zombies);
  for (const fn of frameFns) fn(dt);
  flashLevel = Math.max(0, flashLevel - real * 40); flashL.intensity = flashLevel * 10;

  if (vm) vm.update(real * Math.max(0.35, G.timeScale), { speed: sp, lookDX: lastLook.dx, lookDY: lastLook.dy, t: G.t });
  // HUD
  hud.vig.style.opacity = P.hurtT * 0.9;
  if (hmT > 0) { hmT -= real; if (hmT <= 0) hud.hm.classList.remove('on'); }
  if (G.msgT > 0) { G.msgT -= real; if (G.msgT <= 0) hud.msg.classList.remove('on'); }
  updateHud();
}

// ---------------------------------------------------------------- debug hooks (headless checks)
window.__fpsCam = camera; window.__fpsRenderer = renderer;
window.__fps = { swapTo, startReload, 
  G, P, get zombies() { return G.zombies; }, begin, startWave, spawnOne, fire, shove, endGame, level: () => level,
  look(yaw, pitch) { P.yaw = yaw; P.pitch = pitch; },
  step(n = 30, dt = 1 / 30) { stepping = true; for (let i = 0; i < n; i++) tick(dt); render(); stepping = false; },
  input: () => input, gore, vm: () => vm,
  aimAt(x, y, z) { const dx = x - P.pos.x, dy = y - P.eye, dz = z - P.pos.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz)); },
  async put(type, x, z) { const W = G.wave; const zz = await createZombie(game, type, { spawn: new THREE.Vector3(x, 0, z), entry: new THREE.Vector3(x, 0, z + 0.5) }); zz.state = 'chase'; scene.add(zz.root); G.zombies.push(zz); G.alive++; return zz; }, tp(x, z) { P.pos.set(x, 0, z); },
};

resize();
requestAnimationFrame(frame);
load().catch(e => { console.error(e); $('.load').textContent = 'Failed to load: ' + e.message; });
if (params.has('autostart')) { const iv = setInterval(() => { if (G.state === 'title') { clearInterval(iv); begin(); } }, 100); }
