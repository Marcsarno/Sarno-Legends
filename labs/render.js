// Render lab (port 5181): the battle stage on its own. Loads Marc, Yola and zombies and, by default, plays a scripted,
// contract-shaped event sequence on a loop through the director (bat swings, pistol shots, block, zombie attacks on each
// hero, a stagger, a kill per death kind, a finisher, a nurse revive, the boss mode shift). Buttons trigger each beat.
// Hover a zombie to see the target highlight (stage.pick), click it to swing the bat at it.
// URL options:
//   ?cast=ward|horde|boss|walker|sleeper   who's on stage        ?room=<painter key>   ?speed=1.5   ?gore=low
//   ?bat=nail_bat&gun=shotgun   the heroes' weapons            ?noloop=1   don't start the loop   ?beat=finisher   run one
//   ?nopaint=1   skip the painted backdrop (fallback room)     ?hidebar=1   no buttons (screenshots)
//   ?inspect=marc&clip=bat_swing&t=1.2&weapon=crowbar&yaw=1.4&zoom=1.6   one character frozen on a clip frame (holds)
//   ?measure=marc   window.__measure([clips]) / window.__path(clip, t0, t1): impact frames and strike headings (CLIP_TIMING)
//   ?lineup=1   every character model side by side
// Scripted screenshots: window.__runBeat(name) then window.__advance(seconds) steps the paused stage at 60 fps.
import * as THREE from 'three';
import { createStage } from '../src/render/stage.js';
import { preload, character, MODELS } from '../src/render/assets.js';
import { Actor, CLIP_TIMING } from '../src/render/actor.js';
import { createFx } from '../src/render/fx.js';
import { createDirector, createBattleActors, resetFinishers } from '../src/render/director.js';

const Q = new URLSearchParams(location.search);
const canvas = document.getElementById('stage');
const logEl = document.getElementById('log');
const log = (...a) => { logEl.textContent = a.join(' '); };
const stage = createStage(canvas, { preserveDrawingBuffer: true, painter: !Q.has('nopaint') });
window.__stage = stage;
stage.setRoom(Q.get('room') || 'ward');

async function main() {
  if (Q.has('inspect')) return inspect();
  if (Q.has('lineup')) return lineup();
  if (Q.has('measure')) return measure();
  return battle();
}

// one character on a frozen frame, camera close
async function inspect() {
  const key = Q.get('inspect');
  await preload([key]);
  const a = new Actor(stage, await character(key), { kind: key === 'marc' || key === 'yola' ? 'hero' : 'enemy', id: key, home: new THREE.Vector3(0, 0, 0), yaw: +(Q.get('yaw') ?? (key === 'marc' || key === 'yola' ? Math.PI / 2 - 0.32 : -Math.PI / 2 + 0.3)) });
  a.lockYaw = Q.has('yaw'); if (a.lockYaw) a.yawTarget = +Q.get('yaw');
  if (Q.get('weapon') || key === 'marc' || key === 'yola') await a.setWeapon(Q.get('weapon') || (key === 'marc' ? 'wood_bat' : 'pistol'));
  const clip = Q.get('clip');
  if (clip) { a.play(clip, { loop: true, fade: 0, timeScale: 0, from: +(Q.get('t') || 0) }); }
  const z = +(Q.get('zoom') || 1);
  const c = { x: +(Q.get('cx') || 0), y: +(Q.get('cy') || 1.0), d: 4.2 / z, ox: +(Q.get('ox') || 0) };
  stage.setCameraOverride(cam => { cam.fov = 32; cam.position.set(c.x + c.ox, c.y + 0.25, c.d); cam.lookAt(c.x, c.y, 0); });
  log(`${key} ${clip || ''} t=${Q.get('t') || 0}`);
  window.__actor = a; window.__inspectCam = c;
  window.__ready = true;
}

async function lineup() {
  const keys = Object.keys(MODELS).filter(k => k.startsWith('z_'));
  await preload(['marc', 'yola', ...keys]);
  const xs = keys.length + 2; let i = 0;
  for (const key of ['marc', 'yola', ...keys]) {
    const hero = key === 'marc' || key === 'yola';
    const a = new Actor(stage, await character(key), { kind: hero ? 'hero' : 'enemy', id: key, home: new THREE.Vector3(-4.6 + i * (9.6 / (xs - 1)), 0, 0), yaw: 0.25 * (hero ? 1 : -1) });
    if (key === 'marc') await a.setWeapon('wood_bat'); if (key === 'yola') await a.setWeapon('pistol');
    const tag = document.createElement('div'); tag.className = 'tag'; tag.textContent = key; document.getElementById('ui').append(tag);
    stage.onFrame(() => { const p = stage.project(a.uiAnchor('head')); tag.style.left = p.x + 'px'; tag.style.top = p.y + 'px'; });
    i++;
  }
  window.__ready = true;
}

// impact times: where the weapon tip (heroes) or the faster hand (zombies) moves fastest in each attack clip
async function measure() {
  const key = Q.get('measure');
  await preload([key]);
  const hero = key === 'marc' || key === 'yola';
  const a = new Actor(stage, await character(key), { kind: hero ? 'hero' : 'enemy', id: key, home: new THREE.Vector3(), yaw: 0 });
  a.lockYaw = true; a.yawTarget = 0;
  if (hero) await a.setWeapon(Q.get('weapon') || (key === 'marc' ? 'wood_bat' : 'pistol'));
  stage.pause(true);
  window.__measure = (clips) => {
    const out = {};
    for (const name of clips) {
      const c = a.clip(name); if (!c) continue;
      const act = a.mixer.clipAction(c); a.mixer.stopAllAction(); act.reset().play(); act.setEffectiveWeight(1); act.paused = false;
      const pts = [], dt = 1 / 60;
      for (let t = 0; t <= c.duration + 1e-6; t += dt) {
        act.time = t; a.mixer.update(0); a.root.updateMatrixWorld(true); a.postPose(0);
        const p = hero ? a.anchor('tip') : null;
        const r = a.bones.RightHand.getWorldPosition(new THREE.Vector3()), l = a.bones.LeftHand.getWorldPosition(new THREE.Vector3());
        const hip = a.bones.Hips.getWorldPosition(new THREE.Vector3());
        pts.push({ t, p: p ? p.clone() : null, r, l, hip });
      }
      const sp = [];
      for (let i = 1; i < pts.length; i++) {
        const A = pts[i - 1], B = pts[i];
        const v = hero ? B.p.distanceTo(A.p) / dt : Math.max(B.r.distanceTo(A.r), B.l.distanceTo(A.l)) / dt;
        const P = hero ? B.p : (B.r.distanceTo(A.r) > B.l.distanceTo(A.l) ? B.r : B.l), P0 = hero ? A.p : (P === B.r ? A.r : A.l);
        // model space (yaw 0: forward +z, left +x): the strike's heading (deg) and where the striking point is from the hips
        sp.push({ t: B.t, v, aim: Math.atan2(P.x - P0.x, P.z - P0.z) * 180 / Math.PI, at: [P.x - B.hip.x, P.y, P.z - B.hip.z].map(x => +x.toFixed(2)), hip: [B.hip.x, B.hip.z].map(x => +x.toFixed(2)) });
      }
      const best = sp.reduce((m, s) => s.v > m.v ? s : m, sp[0]);
      out[name] = { dur: +c.duration.toFixed(2), peak: +best.t.toFixed(2), v: +best.v.toFixed(1), aim: Math.round(best.aim), at: best.at, hip: best.hip, top: sp.slice().sort((x, y) => y.v - x.v).slice(0, 4).map(s => +s.t.toFixed(2)) };
    }
    return out;
  };
  // the striking point's path (model space at yaw 0, relative to the hips): [t, x, y, z, heading of the point in deg]
  window.__path = (name, t0 = 0, t1 = 99, step = 1 / 30) => {
    const c = a.clip(name); const act = a.mixer.clipAction(c); a.mixer.stopAllAction(); act.reset().play();
    const rows = [];
    for (let t = t0; t <= Math.min(t1, c.duration) + 1e-6; t += step) {
      act.time = t; a.mixer.update(0); a.root.updateMatrixWorld(true); a.postPose(0);
      const p = hero ? a.anchor('tip') : a.bones.RightHand.getWorldPosition(new THREE.Vector3());
      const h = a.bones.Hips.getWorldPosition(new THREE.Vector3());
      rows.push([+t.toFixed(3), +(p.x - h.x).toFixed(2), +p.y.toFixed(2), +(p.z - h.z).toFixed(2), Math.round(Math.atan2(p.x - h.x, p.z - h.z) * 180 / Math.PI)]);
    }
    return rows;
  };
  window.__ready = true;
}

// ---- the battle loop: scripted, contract-shaped events through the director ----
const CASTS = {
  ward: { room: 'ward', enemies: [
    { uid: 'e1', id: 'shambler', name: 'Shambler', model: 'z_romero', scale: 1, size: 'medium', tier: 'normal', slot: 0, hp: 42 },
    { uid: 'e2', id: 'biter', name: 'Biter', model: 'z_patient', scale: 0.92, size: 'small', tier: 'normal', slot: 1, hp: 14 },
    { uid: 'e3', id: 'nurse', name: 'Nurse', model: 'z_nurse', scale: 1, size: 'medium', tier: 'normal', slot: 2, hp: 30 },
  ] },
  horde: { room: 'corridor', enemies: [
    { uid: 'e1', id: 'sprinter', model: 'z_sprinter', scale: 1, slot: 0, hp: 16 }, { uid: 'e2', id: 'spitter', model: 'z_patient_mod', scale: 0.92, slot: 1, hp: 14 },
    { uid: 'e3', id: 'bloater', model: 'z_scrubs', scale: 1.05, slot: 2, hp: 25 }, { uid: 'e4', id: 'screamer', model: 'z_girl', scale: 1, slot: 3, hp: 50 },
    { uid: 'e5', id: 'biter', model: 'z_patient', scale: 0.92, slot: 4, hp: 12 },
  ] },
  boss: { room: 'security_gate', enemies: [{ uid: 'e1', id: 'shield_guard', name: 'Shield Guard', model: 'z_guard', scale: 1.25, size: 'large', tier: 'boss', slot: 0, hp: 240 }] },
  walker: { room: 'storage', enemies: [{ uid: 'e1', id: 'big_walker', name: 'Big Walker', model: 'z_brute', scale: 1.3, size: 'large', tier: 'elite', slot: 0, hp: 84 }] },
  sleeper: { room: 'ward', enemies: [{ uid: 'e1', id: 'sleeping_patient', name: 'Sleeping Patient', model: 'z_patient', scale: 1.15, size: 'large', tier: 'elite', slot: 0, pose: 'lying', statuses: { asleep: 3 }, hp: 110 }] },
};

let cast = null, director = null, fx = null, castKey = null;
const alive = new Map(); // uid -> hp
const ui = document.getElementById('ui');

function numberEl(n) {
  const el = document.createElement('div');
  el.className = 'num ' + ({ damage: 'hp', finisher: 'hp big', blocked: 'blocked', block: 'block', heal: 'heal', buff: 'status', debuff: 'status', status: 'status' }[n.kind] || '') + (n.big ? ' big' : '');
  el.textContent = n.kind === 'damage' || n.kind === 'finisher' ? n.text : n.text.toUpperCase();
  el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
  ui.append(el);
  const dx = (Math.random() - 0.5) * 60;
  el.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 }, { transform: 'translate(-50%,-90%) scale(1.25)', opacity: 1, offset: 0.12 },
    { transform: `translate(calc(-50% + ${dx * 0.5}px),-120%) scale(1)`, opacity: 1, offset: 0.55 }, { transform: `translate(calc(-50% + ${dx}px),-190%) scale(.9)`, opacity: 0 }],
    { duration: 1100 / stage.getSpeed(), easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'forwards' }).finished.then(() => el.remove());
}
function bannerEl(b) {
  const el = document.createElement('div'); el.className = 'banner ' + (b.kind || ''); el.textContent = b.text; document.body.append(el);
  el.animate([{ opacity: 0, transform: el.style.transform + ' scale(1.6)' }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: (b.kind === 'finisher' ? 1500 : 900) / stage.getSpeed(), fill: 'forwards' }).finished.then(() => el.remove());
}

async function setCast(key) {
  if (cast) { for (const a of cast.enemies.values()) a.dispose(); fx?.clear(); director?.dispose(); }
  castKey = key; const C = CASTS[key];
  stage.setRoom(Q.get('room') || C.room);
  const heroes = cast ? { marc: cast.marc, yola: cast.yola } : null;
  if (heroes) { heroes.marc.root.position.copy(heroes.marc.home); heroes.yola.root.position.copy(heroes.yola.home); heroes.marc.dead = heroes.yola.dead = false; heroes.marc.idle(); heroes.yola.idle(); }
  cast = await createBattleActors(stage, { enemies: C.enemies, weapons: { marc: Q.get('bat') || 'wood_bat', yola: Q.get('gun') || 'pistol' }, heroes });
  alive.clear(); C.enemies.forEach(e => alive.set(e.uid, e.hp));
  fx = fx || createFx(stage, { gore: Q.get('gore') || 'full' });
  director = createDirector({ stage, actors: cast, fx, settings: { gore: Q.get('gore') || 'full', shake: 1 } });
  director.on('number', numberEl); director.on('banner', bannerEl);
  director.on('event', e => { if (e.t !== 'energy') log(`${castKey}  ${e.t} ${e.target || e.uid || e.by || ''} ${e.amount ?? ''}`); });
  window.__director = director; window.__cast = cast;
  director.push([{ t: 'combat_start', enemies: C.enemies, name: C.enemies[0].name, elite: C.enemies[0].tier === 'elite', boss: C.enemies[0].tier === 'boss' }, { t: 'turn_start', side: 'player', turn: 1 }]);
}

// beats: functions that return the events the engine would emit
const first = () => [...alive.keys()][0], second = () => [...alive.keys()][1] || first(), last = () => [...alive.keys()].at(-1);
const dmg = (source, target, amount, kind, extra = {}) => {
  const hp = Math.max(0, (alive.get(target) ?? 30) - amount); const killed = hp <= 0;
  if (killed) alive.delete(target); else alive.set(target, hp);
  return { t: 'damage', source, target, amount, blocked: 0, hp, block: 0, kind, staggered: !!extra.staggered, killed, hit: extra.hit || 1, hits: extra.hits || 1, ...(killed ? { finisher: !!extra.finisher } : {}) };
};
const death = (target, kind, by, finisher = false) => ({ t: 'death', target, kind, finisher, by, cardId: null });
const card = (id, hero, anim, type = 'attack', target = null, clip = null) => ({ t: 'card_played', uid: 'c' + Math.random().toString(36).slice(2, 6), id, hero, anim, type, target, clip, cost: 1 });
const BEATS = {
  bat: () => { const t = first(); return [card('bat_swing', 'marc', 'melee_light', 'attack', t), { t: 'attack', by: 'marc', target: t, anim: 'melee_light', hits: 1 }, dmg('marc', t, 6, 'light'), { t: 'energy', energy: 2, max: 3 }]; },
  home_run: () => { const t = first(); return [card('home_run', 'marc', 'melee_heavy', 'attack', t), { t: 'attack', by: 'marc', target: t, anim: 'melee_heavy', hits: 1 }, dmg('marc', t, 8, 'heavy'), { t: 'status', target: t, status: 'vulnerable', delta: 2, total: 2 }]; },
  smash: () => { const t = first(); return [card('overhead_smash', 'marc', 'melee_heavy', 'attack', t), { t: 'attack', by: 'marc', target: t, anim: 'melee_heavy', hits: 1 }, dmg('marc', t, 14, 'heavy'), { t: 'status', target: t, status: 'vulnerable', delta: 2, total: 2 }]; },
  one_two: () => { const t = first(); return [card('one_two', 'marc', 'melee_combo', 'attack', t), { t: 'attack', by: 'marc', target: t, anim: 'melee_combo', hits: 2 }, dmg('marc', t, 5, 'light', { hit: 1, hits: 2 }), dmg('marc', t, 5, 'light', { hit: 2, hits: 2 })]; },
  sweep: () => [card('wild_swing', 'marc', 'melee_sweep', 'attack'), { t: 'attack', by: 'marc', target: 'all', anim: 'melee_sweep', hits: 1 }, ...[...alive.keys()].map(u => dmg('marc', u, 8, 'light'))],
  pistol: () => { const t = second(); return [card('pistol_shot', 'yola', 'pistol', 'attack', t), { t: 'attack', by: 'yola', target: t, anim: 'pistol', hits: 1 }, dmg('yola', t, 6, 'gun')]; },
  double_tap: () => { const t = second(); return [card('double_tap', 'yola', 'pistol_burst', 'attack', t), { t: 'attack', by: 'yola', target: t, anim: 'pistol_burst', hits: 2 }, dmg('yola', t, 4, 'gun', { hit: 1, hits: 2 }), dmg('yola', t, 4, 'gun', { hit: 2, hits: 2 })]; },
  brace: () => [card('brace', 'marc', 'block', 'skill'), { t: 'block', target: 'party', amount: 5, block: 5 }],
  sidestep: () => [card('sidestep', 'yola', 'dodge', 'skill'), { t: 'block', target: 'party', amount: 5, block: 10 }],
  buff: () => [card('pumped_up', 'marc', 'buff', 'power'), { t: 'status', target: 'party', status: 'strength', delta: 2, total: 2 }],
  heal: () => [card('triage', 'yola', 'heal', 'skill'), { t: 'heal', target: 'party', amount: 4, hp: 70 }],
  enemy_turn: () => {
    const ev = [{ t: 'turn_start', side: 'enemy', turn: 1 }];
    [...alive.keys()].forEach((u, i) => {
      const hero = i % 2 ? 'yola' : 'marc';
      if (i === 2) { ev.push({ t: 'enemy_move', uid: u, move: 'groan', name: 'Groan', type: 'block_buff', anim: 'buff' }, { t: 'status', target: u, status: 'strength', delta: 3, total: 3 }, { t: 'block', target: u, amount: 6, block: 6 }); return; }
      ev.push({ t: 'enemy_move', uid: u, move: 'bite', name: 'Bite', type: 'attack', anim: i ? 'melee_light' : 'melee_heavy' }, { t: 'attack', by: u, target: 'party', anim: i ? 'melee_light' : 'melee_heavy', hits: 1, hero },
        { t: 'damage', source: u, target: 'party', amount: i ? 6 : 6, blocked: i ? 0 : 5, hp: 60, block: 0, kind: i ? 'light' : 'heavy', hit: 1, hits: 1, hero });
    });
    ev.push({ t: 'turn_start', side: 'player', turn: 2 });
    return ev;
  },
  kill_light: () => { const t = first(); const hp = alive.get(t); return [card('bat_swing', 'marc', 'melee_light', 'attack', t), { t: 'attack', by: 'marc', target: t, anim: 'melee_light', hits: 1 }, dmg('marc', t, hp, 'light'), death(t, 'light', 'marc')]; },
  kill_gun: () => { const t = second(); const hp = alive.get(t); return [card('pistol_shot', 'yola', 'pistol', 'attack', t), { t: 'attack', by: 'yola', target: t, anim: 'pistol', hits: 1 }, dmg('yola', t, hp, 'gun'), death(t, 'gun', 'yola')]; },
  kill_heavy: () => { const t = first(); const hp = alive.get(t); return [card('home_run', 'marc', 'melee_heavy', 'attack', t), { t: 'attack', by: 'marc', target: t, anim: 'melee_heavy', hits: 1 }, dmg('marc', t, hp, 'heavy'), death(t, 'heavy', 'marc')]; },
  finisher: () => { const t = first(); const hp = alive.get(t); return [card('bat_swing', 'marc', 'melee_light', 'attack', t), { t: 'attack', by: 'marc', target: t, anim: 'melee_light', hits: 1 }, dmg('marc', t, hp, 'light', { staggered: true, finisher: true }), death(t, 'light', 'marc', true)]; },
  finisher_gun: () => { const t = last(); const hp = alive.get(t); return [card('clean_shot', 'yola', 'pistol', 'attack', t), { t: 'attack', by: 'yola', target: t, anim: 'pistol', hits: 1 }, dmg('yola', t, hp, 'gun', { staggered: true, finisher: true }), death(t, 'gun', 'yola', true)]; },
  revive: () => {
    const nurse = [...cast.enemies.entries()].find(([u, a]) => a.enemyId === 'nurse' && !a.dead);
    const dead = [...cast.enemies.entries()].find(([u, a]) => a.dead);
    if (!nurse || !dead) return [];
    alive.set(dead[0], 20);
    return [{ t: 'enemy_move', uid: nurse[0], move: 'revive', name: 'Revive', type: 'buff', anim: 'buff' }, { t: 'revive', uid: dead[0], hp: 20, by: nurse[0] }];
  },
  mode_shift: () => [{ t: 'mode_shift', uid: 'e1', mode: 'defensive', first: true }, { t: 'status', target: 'e1', status: 'thorns', delta: 3, total: 3 }, { t: 'block', target: 'e1', amount: 20, block: 20 }],
  guard_turn: () => [{ t: 'turn_start', side: 'enemy', turn: 2 }, { t: 'enemy_move', uid: 'e1', move: 'shield_bash', name: 'Shield Bash', type: 'attack', anim: 'melee_heavy', clip: 'shield_bash' },
    { t: 'attack', by: 'e1', target: 'party', anim: 'melee_heavy', hits: 1, hero: 'marc' }, { t: 'damage', source: 'e1', target: 'party', amount: 22, blocked: 10, hp: 40, block: 0, kind: 'heavy', hit: 1, hits: 1, hero: 'marc' },
    { t: 'turn_start', side: 'player', turn: 3 }],
  wake: () => [{ t: 'wake', uid: 'e1', stunned: true }, { t: 'stunned', uid: 'e1' }],
  reset: () => { setCast(castKey); return []; },
};

// the default loop: a little fight in the ward, start to finish, then again
const LOOP = ['bat', 'pistol', 'home_run', 'brace', 'enemy_turn', 'double_tap', 'one_two', 'kill_gun', 'revive', 'sweep', 'sidestep', 'buff', 'finisher', 'heal', 'enemy_turn', 'kill_light', 'finisher_gun', 'reset'];
let loopOn = !Q.has('beat') && !Q.has('noloop'), loopIx = 0;

// a kill always has its death event right after the damage (as the engine emits it)
function withDeaths(ev) {
  const out = [];
  for (const e of ev) {
    out.push(e);
    if (e.t === 'damage' && e.killed && e.target !== 'party' && !ev.some(d => d.t === 'death' && d.target === e.target)) out.push(death(e.target, e.kind, e.source, !!e.finisher));
  }
  return out;
}
async function runBeat(name) {
  const ev = withDeaths(BEATS[name]?.() || []);
  director.push(ev);
  await director.ready();
}

async function battle() {
  await setCast(Q.get('cast') || 'ward');
  const speed = +(Q.get('speed') || 1); stage.setSpeed(speed);
  // buttons
  const bar = document.getElementById('bar');
  const btn = (label, fn, cls) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; if (cls) b.className = cls; bar.append(b); return b; };
  for (const k of Object.keys(BEATS)) btn(k.replace('_', ' '), () => { loopOn = false; loopBtn.classList.remove('on'); runBeat(k); });
  for (const k of Object.keys(CASTS)) btn('cast: ' + k, () => { loopOn = false; loopBtn.classList.remove('on'); setCast(k); });
  const loopBtn = btn('loop', () => { loopOn = !loopOn; loopBtn.classList.toggle('on', loopOn); if (loopOn) loop(); }, loopOn ? 'on' : '');
  const spBtn = btn('speed ' + speed + 'x', () => { const s = { 1: 1.5, 1.5: 2, 2: 1 }[stage.getSpeed()] || 1; stage.setSpeed(s); spBtn.textContent = 'speed ' + s + 'x'; });
  btn('gore', () => { const g = fx.gore === 'full' ? 'low' : 'full'; fx.setGore(g); });
  if (Q.has('hidebar')) bar.style.display = 'none';
  // targeting check: hover highlights the zombie under the pointer (stage.pick), a click swings the bat at it
  let hovered = null;
  canvas.addEventListener('pointermove', e => {
    const uid = stage.pickDetail(e.clientX, e.clientY);
    if (uid === hovered) return;
    if (hovered && cast.enemies.get(hovered)) cast.enemies.get(hovered).highlight(false);
    hovered = uid && cast.enemies.get(uid) ? uid : null;
    if (hovered) cast.enemies.get(hovered).highlight(true, 0xffd166);
    canvas.style.cursor = hovered ? 'crosshair' : uid === 'marc' || uid === 'yola' ? 'pointer' : 'default';
  });
  canvas.addEventListener('click', e => {
    const uid = stage.pick(e.clientX, e.clientY); if (!uid || !alive.has(uid) || !director.canAcceptInput()) return;
    loopOn = false; loopBtn.classList.remove('on');
    director.push([card('bat_swing', 'marc', 'melee_light', 'attack', uid), { t: 'attack', by: 'marc', target: uid, anim: 'melee_light', hits: 1 }, dmg('marc', uid, 6, 'light'), ...(alive.has(uid) ? [] : [death(uid, 'light', 'marc')])]);
  });
  window.__pick = (x, y) => stage.pick(x, y);
  window.__project = (uid) => { const a = cast.enemies.get(uid) || cast[uid]; return a ? stage.project(a.uiAnchor('chest')) : null; };
  // deterministic stepping for screenshots: pause the loop, then __advance(seconds) at 60 fps
  window.__runBeat = (n) => { director.push(withDeaths(BEATS[n]?.() || [])); };
  window.__advance = (sec, fps = 60) => { stage.pause(true); const n = Math.max(1, Math.round(sec * fps)); for (let i = 0; i < n; i++) stage.step(1 / fps, i === n - 1); };
  window.__setCast = setCast;
  window.__ready = true;
  if (Q.get('beat')) { await director.ready(); window.__runBeat(Q.get('beat')); }
  if (loopOn) loop();
}
async function loop() {
  while (loopOn) {
    const name = LOOP[loopIx++ % LOOP.length];
    await runBeat(name);
    await new Promise(r => setTimeout(r, 650 / stage.getSpeed()));
  }
}

main().catch(e => { console.error(e); log('error: ' + e.message); });
