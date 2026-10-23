// The director turns the combat engine's event log (src/game/combat.js takeEvents(), BUILD_SPEC section 3) into a paced
// show on the battle stage. Pacing (GAME_CORE): a basic card takes 0.5-0.6 s with its hit at ~0.27 s and the next card
// can be played the moment the hit lands; each zombie's turn takes ~0.45 s; the finisher is the one long beat (about
// 2.2 s the first time in a run, ~1.2 s after). The speed setting (1 / 1.5 / 2x) scales everything through the stage.
//   const d = createDirector({ stage, actors: { marc, yola, enemies }, fx, audio, settings })
//   d.push(combat.takeEvents()); d.on('event', e => hud.onEvent(e)); d.on('number', n => hud.number(n)); ...
// Each event "lands" (emits 'event', and audio.event(evt)) at the right moment: an attack lands as its swing starts (or
// as the shot fires), its damage at the impact, a death right after. The HUD updates its numbers when they land.
// Also here: createBattleActors() builds Marc, Yola and the zombies of a combat_start snapshot at their slots.
import * as THREE from 'three';
import { Actor, CLIP_TIMING, HERO_ANIMS, STANCE_YAW } from './actor.js';
import { character, preload } from './assets.js';
import { SLOTS } from './camera.js';
import { createRiotShield } from './weapons.js';

// ---- which clip plays what ----
// card id -> Marc's clip (beats the anim's default); the engine may also send card.clip
export const CARD_CLIPS = {
  home_run: 'bat_swing', grand_slam: 'bat_swing', haymaker: 'bat_swing', batter_up: 'bat_swing',
  overhead_smash: 'ual_Sword_Heavy_D', ground_pound: 'ual_Sword_Heavy_D', sledge: 'ual_Sword_Heavy_D',
  heavy_swing: 'ual_Sword_Regular_C', momentum: 'ual_Sword_Regular_C', make_it_count: 'ual_Sword_Regular_C',
  tackle: 'ual_Sword_Dash', shoulder_check: 'ual_Sword_Dash', kick_the_door: 'ual_Sword_Dash',
};
const ZOMBIE_CLIPS = {
  melee_light: ['ual_Zombie_Scratch', 'scratch', 'attack'],
  melee_heavy: ['attack', 'ual_Zombie_Scratch', 'scratch'],
  melee_combo: ['ual_Zombie_Scratch', 'attack', 'scratch'],
  bite: ['ual_Zombie_Bite', 'ual_Zombie_Scratch', 'scratch'],
};
const ENEMY_CLIPS = { biter: { melee_light: ['ual_Zombie_Bite', 'ual_Zombie_Scratch'] }, shambler: { melee_heavy: ['ual_Zombie_Bite', 'attack'] }, bloater: { melee_light: ['ual_Zombie_Bite', 'scratch'] } };
const STATUS_TEXT = {
  vulnerable: 'Staggered', weak: 'Weakened', frail: 'Shaken', strength: 'Strength', dexterity: 'Agility', bleed: 'Bleed', ritual: 'Frenzy',
  plating: 'Plating', thorns: 'Spiked', enrage: 'Rage', hunch: 'Hunch', immune: 'Immune', temp_strength: 'Pumped', asleep: 'Asleep',
};
const DEBUFF = new Set(['vulnerable', 'weak', 'frail', 'bleed']);
const STATUS_COLOR = { vulnerable: 0xb06bff, weak: 0x9fc27a, frail: 0x7aa0c2, bleed: 0xd8302a, strength: 0xff7a3d, temp_strength: 0xffa04d, dexterity: 0x7cf08a, ritual: 0xff4d4d, enrage: 0xff4d4d, plating: 0x9fb6cc, thorns: 0xd8a24d };
const HERO_COLOR = { marc: 0xff6a4d, yola: 0x47d1c4 };

// ---- pacing: every beat's timing in one place (game seconds at 1x; the speed setting 1 / 1.5 / 2x divides them all) ----
// Marc (2026-10-23): "give them a moment to show what they are doing": a visible wind-up, the strike, a short hold on
// the impact, then the recovery. lead: from the card (or the zombie's move) to the impact, the wind-up and any dash in
// it; snap: the last part of the lead, where the clip snaps from loaded to the hit; hold: the impact pose freezes (the
// next queued card waits for it; input reopens after it); recover: the follow-through back to the stance; hitStop: the
// whole stage freezes at the impact (ms, real time); lean: the procedural lean back in the wind-up (rad).
export const PACING = {
  hero: {
    light: { lead: 0.5, snap: 0.13, hold: 0.14, recover: 0.42, dash: 0.2, hitStop: 60, lean: 0.12 },     // ~1.0 s
    heavy: { lead: 0.72, snap: 0.15, hold: 0.18, recover: 0.55, dash: 0.24, hitStop: 90, lean: 0.22 },   // ~1.45 s
    sweep: { lead: 0.66, snap: 0.15, hold: 0.16, recover: 0.5, dash: 0.24, hitStop: 75, lean: 0.18 },
    combo: { lead: 0.36, snap: 0.12, hold: 0.13, recover: 0.42, dash: 0.1, hitStop: 55, lean: 0.06 },   // each extra hit
    finisher: { lead: 0.78, snap: 0.16, hold: 0.22, recover: 0.6, dash: 0.24, hitStop: 140, lean: 0.2 },
    home: 0.34,          // the walk back to the slot (starts after the hold)
  },
  gun: {
    pistol: { lead: 0.42, hold: 0.12, recover: 0.4, hitStop: 50 },       // raise and aim, the shot, recoil held
    shotgun: { lead: 0.52, hold: 0.18, recover: 0.5, hitStop: 85 },
    burst: 0.26,         // each extra shot of a burst / volley
    finisher: { lead: 0.62, hold: 0.2 },
  },
  zombie: {
    light: { lead: 0.5, snap: 0.13, hold: 0.12, recover: 0.4, dash: 0.26, gap: 0.3, lunge: 0.22, lean: 0.12 },   // ~0.9 s
    heavy: { lead: 0.64, snap: 0.15, hold: 0.16, recover: 0.5, dash: 0.3, gap: 0.36, lunge: 0.3, lean: 0.2 },    // ~1.1 s
    combo: { lead: 0.34, snap: 0.12, hold: 0.1, gap: 0.3, lean: 0.06 },                                           // extra hits
  },
  skill: { block: 0.3, power: 0.36, other: 0.26 },
  banner: { player: 0.3, enemy: 0.55 },
  // the finisher's slow motion (real seconds; the first one of a run is the long beat): ease in during the swing / aim,
  // hold through the impact, the death and the burst, ease out
  finisher: {
    scale: 0.25,
    first: { in: 0.22, hold: 1.4, out: 0.5, punch: 0.42 },
    later: { in: 0.18, hold: 0.95, out: 0.4, punch: 0.32 },
  },
  defeat: { second: 0.38, slow: 0.55, after: 2.4 },
};

// the riot shield on the guard's left forearm (bone frame: +Y runs down the forearm to the hand)
export const SHIELD_FIT = { at: 0.55, out: [0.07, 0, 0], rot: [0, 0, 0] };

let finishersShown = 0;            // in this session; resetFinishers() at a new run
export function resetFinishers() { finishersShown = 0; }

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const flat = v => v.setY(0);

export function createDirector({ stage, actors, fx, audio = null, settings = {} }) {
  const A = { marc: actors.marc, yola: actors.yola, enemies: actors.enemies || new Map() };
  const S = () => (typeof settings === 'function' ? settings() : settings) || {};
  const handlers = new Map();
  const on = (type, fn) => { (handlers.get(type) || handlers.set(type, new Set()).get(type)).add(fn); return () => handlers.get(type)?.delete(fn); };
  const emit = (type, payload) => handlers.get(type)?.forEach(fn => { try { fn(payload); } catch (e) { console.error('[director]', type, e); } });

  const queue = [];
  let now = 0, cursor = 0, realNow = 0, blockReal = 0;
  const timers = [];                 // { at, fn, key }
  let readyWaiters = [];
  let card = null;                   // the card being played
  let atk = null;                    // the attack in flight { by, actor, anim, hits, hit, targets, finisher, kind }
  let lastFrame = -1;
  let lastPartyHero = 'marc';        // who took the last party hit (falls first at a defeat)

  function later(sec, fn, key = null) {
    if (key) for (const t of timers) if (t.key === key) t.dead = true;
    timers.push({ at: now + Math.max(0, sec), fn, key });
  }
  function runTimers() {
    timers.sort((a, b) => a.at - b.at);
    while (timers.length && timers[0].at <= now + 1e-6) { const t = timers.shift(); if (!t.dead) { try { t.fn(); } catch (e) { console.error('[director] timer', e); } } }
  }
  const shakeK = () => { const s = S().shake; return s === false ? 0 : typeof s === 'number' ? s : 1; };
  const goreFull = () => (S().gore || 'full') !== 'low';
  const actorOf = id => id === 'marc' ? A.marc : id === 'yola' ? A.yola : A.enemies.get(id) || null;
  const heroFor = id => (id === 'yola' ? A.yola : id === 'marc' ? A.marc : null);
  const living = () => [...A.enemies.values()].filter(a => !a.dead);
  const sfx = (name, extra) => audio?.event?.({ t: 'fx', name, ...extra });

  // ---- numbers and banners ----
  function number(uid, text, kind, { hero = null, amount = null, big = false } = {}) {
    let act = uid === 'party' ? (hero ? heroFor(hero) : A.marc) : actorOf(uid);
    const world = act ? act.uiAnchor('head', new THREE.Vector3()) : new THREE.Vector3();
    if (uid === 'party' && !hero && A.yola && A.marc) world.lerp(A.yola.uiAnchor('head', _v), 0.5);
    world.x += (Math.random() - 0.5) * 0.25; world.y += Math.random() * 0.12;
    const screen = stage.project(world);
    emit('number', { uid, hero, text: String(text), kind, amount, big, world, x: screen.x, y: screen.y });
  }
  const banner = (text, kind) => emit('banner', { text, kind });

  // ---- choreography ----
  function hitDir(from, to) {
    const d = flat(_v.copy(to.root.position).sub(from.root.position));
    return d.lengthSq() < 1e-6 ? new THREE.Vector3(from.isHero ? 1 : -1, 0, 0) : d.normalize().clone();
  }
  function strikePoint(target, attacker) {
    const p = target.anchor('chest', new THREE.Vector3());
    if (attacker) p.addScaledVector(hitDir(target, attacker), 0.18 * (target.scale || 1));
    return p;
  }
  // Marc steps in front of the nearest target and swings so the impact lands P.lead from now; returns the lead
  function heroMelee(hero, targets, clip, P = PACING.hero.light) {
    if (!targets.length) return 0;
    const T = CLIP_TIMING[clip] || {};
    // stand in front of the nearest target, facing the group (a sweep swings through the front row from there)
    const near = targets.reduce((m, t) => (t.root.position.distanceToSquared(hero.home) < m.root.position.distanceToSquared(hero.home) ? t : m), targets[0]);
    const tp = near.root.position.clone();
    const big = near.scale || 1;
    const dir = flat(_v.copy(tp).sub(hero.home)).normalize();
    const reach = (T.reach ?? 1.1) + 0.32 * (big - 1);
    const dest = tp.clone().addScaledVector(dir, -reach); dest.z += 0.12;
    later(0, () => {}, 'ret:' + hero.id);
    hero.dashTo(dest, P.dash * 1000);
    hero.turnTo((T.yaw ?? Math.PI / 2) + Math.atan2(dir.x, dir.z) - Math.PI / 2, 120);
    hero.lookTarget = near;
    hero.strike(clip, { hitIn: P.lead, snap: P.snap, hold: P.hold, recover: P.recover, lean: P.lean });
    later(Math.max(0, P.lead - P.snap - 0.04), () => fx?.trail?.(hero, true), 'trailOn:' + hero.id);
    later(P.lead + 0.12, () => fx?.trail?.(hero, false), 'trailOff:' + hero.id);
    later(P.lead + P.hold + 0.08, () => { hero.returnHome(PACING.hero.home * 1000); }, 'ret:' + hero.id);
    later(Math.max(0, P.lead - P.snap - 0.05), () => sfx('swing', { by: hero.id, clip }));
    return P.lead;
  }
  // a zombie closes in (a shuffle, then a lunge in the snap) and swipes / bites so the hit lands P.lead from now
  function zombieMelee(z, hero, clip, P = PACING.zombie.light, { ret = true } = {}) {
    const T = CLIP_TIMING[clip] || {};
    const hp = hero.root.position.clone();
    const dir = flat(_v.copy(hp).sub(z.home)).normalize();
    const reach = (T.reach ?? 1.0) * Math.max(1, (z.scale || 1) * 0.92) + (T.travel || 0);
    const dest = hp.clone().addScaledVector(dir, -reach);
    const lunge = P.lunge ?? 0.2;
    later(0, () => {}, 'ret:' + z.uid);
    z.dashTo(dest.clone().addScaledVector(dir, -lunge), P.dash * 1000); z.face(hp, 120);
    later(Math.max(0, P.lead - P.snap - 0.03), () => z.dashTo(dest, (P.snap + 0.03) * 1000));    // the lunge into the blow
    z.lookTarget = hero;
    z.strike(clip, { hitIn: P.lead, snap: P.snap, hold: P.hold, recover: P.recover ?? 0.4, lean: P.lean ?? 0.12 });
    if (ret) later(P.lead + P.hold + 0.12, () => { z.returnHome(320); z.turnTo(z.baseYaw, 320); }, 'ret:' + z.uid);
    later(Math.max(0, P.lead - P.snap - 0.12), () => sfx('zombie_attack', { by: z.uid, clip }));
    return P.lead;
  }
  // turn the shooter so the barrel lines up with the target
  function aimAt(hero, point, ms = 80) {
    if (!hero.weapon) return hero.face(point, ms);
    const fwd = hero.weapon.forward(new THREE.Vector3());
    const m = hero.anchor('muzzle', new THREE.Vector3());
    const want = Math.atan2(point.x - m.x, point.z - m.z), have = Math.atan2(fwd.x, fwd.z);
    let d = want - have; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    hero.turnTo(hero.yawTarget + THREE.MathUtils.clamp(d, -0.9, 0.9), ms);
  }
  function fire(hero, targets, { big = false, head = false } = {}) {
    const m = hero.anchor('muzzle', new THREE.Vector3());
    const fwd = hero.weapon ? hero.weapon.forward(new THREE.Vector3()) : new THREE.Vector3(1, 0, 0);
    fx?.muzzle?.(m, fwd, { big });
    for (const t of targets) {
      const p = t.anchor(head ? 'head' : 'chest', new THREE.Vector3()); if (head) p.y -= 0.08 * (t.scale || 1);
      p.x += (Math.random() - 0.5) * 0.12; p.y += (Math.random() - 0.5) * 0.15;
      fx?.tracer?.(m, p, { width: big ? 0.034 : 0.024 });
      t.lastShotAt = p;
    }
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize().negate();
    fx?.shell?.(hero.anchor('hand', new THREE.Vector3()).addScaledVector(fwd, 0.05), side);
    hero.kickRecoil(big ? 1.25 : 0.9);
    hero.knock.v -= big ? 2.2 : 0.8;                       // the shot rocks her back a touch
    stage.shake((big ? 0.35 : 0.12) * shakeK(), 160);
    stage.nudge(-1, 0.3, (big ? 0.5 : 0.18) * shakeK());
    sfx(big ? 'shotgun' : 'pistol', { by: hero.id });
  }
  // Yola raises and aims over `lead` (the pistol comes up off the low ready), then fires
  function heroShoot(hero, targets, { big = false, lead = PACING.gun.pistol.lead, head = false } = {}) {
    if (!targets.length) return 0;
    hero.aiming = true; hero.lookTarget = targets[0];
    const aimMs = Math.min(220, lead * 600);
    aimAt(hero, targets[0].anchor('chest', new THREE.Vector3()), aimMs);
    later(Math.max(0, lead - 0.1), () => aimAt(hero, targets[0].anchor(head ? 'head' : 'chest', new THREE.Vector3()), 60));   // settle on the mark
    later(lead, () => fire(hero, targets, { big, head }));
    later(lead + 0.75, () => { hero.aiming = false; if (!hero.dead) hero.turnTo(STANCE_YAW[hero.stanceClip()] ?? hero.baseYaw, 300); }, 'aim:' + hero.id);
    return lead;
  }
  function heroPose(hero, anim, clip) {
    if (!hero) return;
    const c = clip && hero.has(clip) ? clip : hero.pickClip(HERO_ANIMS[hero.id]?.[anim] || []);
    if (!c) return;
    const T = CLIP_TIMING[c];
    if (T?.yaw != null) hero.turnTo(T.yaw, 120);
    const cfg = {
      ual_Sword_Block: { from: 0.0, to: 1.05, timeScale: 1.35 }, ual1_Dodge_Right: { from: 0.1, to: 1.2, timeScale: 1.5 },
      ual1_Dodge_Left: { from: 0.1, to: 1.1, timeScale: 1.5 }, pistol_reload: { from: 0.1, to: 1.6, timeScale: 1.5 },
      ual1_Sword_Enter: { from: 0.1, to: 1.25, timeScale: 1.4 }, ual_Sword_Regular_B: { from: 0, to: 0.57, timeScale: 1.1 },
      ual1_Roll: { from: 0.05, to: 1.45, timeScale: 1.5 },
    }[c] || { timeScale: 1.3 };
    hero.play(c, { ...cfg, fade: 0.1 });
  }

  // ---- the finisher (pillar 2: the kill is the show) ----
  // The slow motion eases in during the swing / aim (so the blow lands slowed), holds through the impact, the burst and
  // the start of the fall, then eases out; the camera pushes in on the head for the whole beat. The first finisher of
  // a run is the long one (PACING.finisher.first: ~2.1 s of real time at 1x), later ones are shorter.
  const finisherTiming = () => (finishersShown === 0 ? PACING.finisher.first : PACING.finisher.later);
  function finisherWindup(z, startIn) {
    const F = finisherTiming();
    later(Math.max(0, startIn), () => {
      if (z.finisherCam) return; z.finisherCam = true;
      stage.slowMo(PACING.finisher.scale, 0, { inMs: F.in * 1000, holdMs: 2500, outMs: F.out * 1000 });   // (the hold is set at the impact)
      const head = z.anchor('head', new THREE.Vector3()); head.y = Math.max(1.1, head.y - 0.25 * (z.scale || 1));
      stage.punchIn(head, (F.in + F.hold + F.out + 0.35) * 1000, F.punch);
    });
  }
  function finisherFx(z, attacker, kind, evt) {
    const F = finisherTiming();
    const first = finishersShown === 0; finishersShown++;
    const gun = kind === 'gun' || kind === 'blast';
    const dir = attacker ? hitDir(attacker, z) : new THREE.Vector3(1, 0, 0);
    stage.hitStop(gun ? PACING.gun.pistol.hitStop + 70 : PACING.hero.finisher.hitStop);
    stage.slowMo(PACING.finisher.scale, 0, { inMs: z.finisherCam ? 60 : 90, holdMs: F.hold * 1000, outMs: F.out * 1000 });
    if (!z.finisherCam) { z.finisherCam = true; const h = z.anchor('head', new THREE.Vector3()); h.y = Math.max(1.1, h.y - 0.25 * (z.scale || 1)); stage.punchIn(h, (F.hold + F.out + 0.3) * 1000, F.punch); }
    stage.whiteFlash(0.5, 160);
    stage.shake(0.85 * shakeK(), 420);
    stage.nudge(Math.sign(dir.x) || 1, 0.2, 0.8 * shakeK());
    const head = z.anchor('head', new THREE.Vector3());
    if (goreFull()) fx?.gib?.(z, 'head', { dir, burst: gun, speed: 4.6 });
    fx?.blast?.(head, { color: 0xff5a3a, strength: 0.6, ground: false });
    fx?.impact?.(head, { dir, strength: 1.8, blunt: !gun, heavy: true });
    z.finisherDone = true;
    z.flash(0xffffff, 1);
    z.die(gun ? 'gun' : 'heavy', { finisher: true });
    if (!gun) z.tween(z.root, 'position', z.root.position.clone().addScaledVector(dir, 0.7), 650);
    banner('FINISHER', 'finisher');
    emit('finisher', { uid: z.uid, by: attacker?.id || null, first, kind });
    number(z.uid, evt?.amount ?? '', 'finisher', { amount: evt?.amount, big: true });
    sfx('finisher', { uid: z.uid, kind, first });
    // the queue (and input) wait for the slow beat in real time; the walk home starts as the slow motion eases out
    const sp = stage.getSpeed?.() || 1;
    blockReal = Math.max(blockReal, realNow + (0.15 + F.hold + F.out * 0.6) / sp);
    const backIn = F.hold * PACING.finisher.scale + F.out * 0.5;
    later(backIn, () => { if (attacker?.isHero && !attacker.dead) attacker.returnHome(380); }, 'ret:' + attacker?.id);
  }
  // the attack event: look ahead for a finisher in this attack's damage (a kill on a Staggered zombie)
  function findFinisher() {
    for (const e of queue) {
      if (e.t === 'attack' || e.t === 'card_played' || e.t === 'turn_start' || e.t === 'combat_end') break;
      if ((e.t === 'damage' && e.finisher) || (e.t === 'death' && e.finisher)) return e;
    }
    return null;
  }

  // more hits of this same swing / blast still queued (a sweep or a blast hits every zombie at once; a kill's death and
  // statuses sit between them)? hit null: any hit of that source
  function sameSwing(e) {
    for (const n of queue) {
      if (n.t === 'damage' && n.source === e.source && n.target !== 'party' && (e.hit == null || (n.hit || 1) === (e.hit || 1))) return true;
      if (n.t !== 'death' && n.t !== 'status' && n.t !== 'block' && n.t !== 'energy') return false;
    }
    return false;
  }

  // ---- event handlers: return { delay, after, land } (seconds of game time) ----
  const H = {
    combat_start(e) {
      for (const z of A.enemies.values()) {
        if (z.lying) continue;
        later(Math.random() * 0.25, () => { z.flash(0xffffff, 0.2); if (z.has('react_large_front') && Math.random() < 0.5) z.play('react_large_front', { from: 0.1, to: 0.9, timeScale: 1.4 }); });
      }
      if (e.boss) banner(e.name || 'Boss', 'boss'); else if (e.elite) banner(e.name || 'Elite', 'elite');
      return { after: e.boss || e.elite ? 0.9 : 0.35 };
    },
    turn_start(e) {
      if (e.side === 'enemy') { banner("Zombies' Turn", 'enemy'); return { after: PACING.banner.enemy }; }
      banner('Your Turn', 'player');
      return { after: PACING.banner.player };
    },
    card_played(e) {
      card = e; atk = null;
      const hero = heroFor(e.hero);
      if (!hero) return {};
      if (e.type === 'attack' || /^melee|^pistol|^shotgun/.test(e.anim || '')) return {};
      if (e.anim === 'none') return {};
      heroPose(hero, e.anim, e.clip);
      if (e.type === 'power') { fx?.buffAura?.(hero, HERO_COLOR[hero.id]); sfx('power', { hero: hero.id }); }
      return { after: e.anim === 'block' || e.anim === 'dodge' ? PACING.skill.block : e.type === 'power' ? PACING.skill.power : PACING.skill.other };
    },
    attack(e) {
      const byEnemy = !!A.enemies.get(e.by);
      if (byEnemy) {
        const z = A.enemies.get(e.by); const hero = heroFor(e.hero) || A.marc;
        if (!z || z.dead) return {};
        const anim = e.anim || 'melee_light';
        const pref = ENEMY_CLIPS[z.enemyId]?.[anim] || ZOMBIE_CLIPS[anim] || ZOMBIE_CLIPS.melee_light;
        const clip = (z.nextClip && z.has(z.nextClip)) ? z.nextClip : z.pickClip(pref);
        z.nextClip = null;
        const P = anim === 'melee_heavy' ? PACING.zombie.heavy : PACING.zombie.light;
        atk = { by: e.by, actor: z, hero, anim, hits: e.hits || 1, hit: 1, clips: pref.filter(c => z.has(c)), enemy: true, P };
        return { after: zombieMelee(z, hero, clip, P) };
      }
      const hero = heroFor(e.by) || (card && heroFor(card.hero));
      const targets = e.target === 'all' ? living() : [A.enemies.get(e.target)].filter(Boolean);
      const anim = e.anim || card?.anim || 'melee_light';
      const fin = findFinisher();
      atk = { by: e.by, actor: hero, anim, hits: e.hits || 1, hit: 1, targets, finisher: fin, all: e.target === 'all' };
      if (!hero || !targets.length) return {};
      const gun = /pistol|shotgun/.test(anim);
      if (gun) {
        const big = anim === 'shotgun';
        const G = big ? PACING.gun.shotgun : PACING.gun.pistol;
        atk.P = G;
        // an extra shot of a volley (each random shot is its own attack event): no second raise
        const lead = (e.volley || 1) > 1 ? PACING.gun.burst : G.lead;
        if (fin && !atk.all && (e.hits || 1) <= 1) {
          // bullet time: the slow motion eases in as she aims, the camera pushes in on the head, then the shot
          atk.head = true; atk.P = { ...G, ...PACING.gun.finisher };
          finisherWindup(targets[0], PACING.gun.finisher.lead - 0.18);
          return { delay: heroShoot(hero, targets, { big, lead: PACING.gun.finisher.lead, head: true }), after: 0.03 };
        }
        return { delay: heroShoot(hero, targets, { big, lead }), after: 0.03 };
      }
      // melee
      let clip = (card?.clip && hero.has(card.clip) && CLIP_TIMING[card.clip]) ? card.clip : CARD_CLIPS[card?.id] || null;
      if (fin && !atk.all && hero.has('hub_execution_B_uppercut')) clip = 'hub_execution_B_uppercut';
      if (!clip || !hero.has(clip)) {
        const list = HERO_ANIMS[hero.id]?.[anim] || HERO_ANIMS[hero.id]?.melee_light || [];
        hero.lightIx = (hero.lightIx || 0) + 1;
        clip = anim === 'melee_light' ? list[hero.lightIx % list.length] : hero.pickClip(list);
      }
      atk.clips = HERO_ANIMS[hero.id]?.melee_combo || [clip];
      const H = PACING.hero;
      const P = fin && !atk.all && clip.startsWith('hub_execution') ? H.finisher : anim === 'melee_heavy' ? H.heavy : anim === 'melee_sweep' ? H.sweep : H.light;
      atk.P = P;
      if (P === H.finisher) finisherWindup(targets[0], P.lead - P.snap - 0.03);
      return { after: heroMelee(hero, targets, clip, P) };
    },
    damage(e) {
      // a follow-up hit of a multi-hit attack: swing / shoot again first
      let delay = 0;
      if (atk && e.hit > atk.hit && (e.source === atk.by || A.enemies.get(e.source) === atk.actor)) {
        atk.hit = e.hit;
        if (atk.enemy) {
          const clip = atk.clips[(e.hit - 1) % Math.max(1, atk.clips.length)] || 'scratch';
          const C = PACING.zombie.combo;
          delay = C.lead; atk.actor.strike(clip, { hitIn: C.lead, snap: C.snap, hold: C.hold, recover: 0.35, lean: C.lean });
          later(C.lead + C.hold + 0.15, () => { atk?.actor?.returnHome?.(300); }, 'ret:' + atk.actor.uid);
        } else if (/pistol|shotgun/.test(atk.anim)) {
          const tgt = A.enemies.get(e.target), shooter = atk.actor, big = atk.anim === 'shotgun'; delay = PACING.gun.burst;
          if (tgt) {
            later(0.04, () => aimAt(shooter, tgt.anchor('chest', new THREE.Vector3()), 60));
            later(delay, () => fire(shooter, [tgt], { big }));
          }
        } else {
          const tgt = atk.all ? living() : [A.enemies.get(e.target)].filter(Boolean);
          const clip = atk.clips[(e.hit - 1) % atk.clips.length];
          delay = heroMelee(atk.actor, tgt.length ? tgt : atk.targets, clip, PACING.hero.combo);
        }
      }
      let after = 0;
      if (A.enemies.get(e.source) && e.target === 'party') {
        // a zombie's hit: hold it; after its last hit, a beat before the next zombie moves
        const Z = atk?.P || PACING.zombie.light;
        after = (e.hit || 1) >= (e.hits || 1) ? Z.gap ?? 0.3 : Z.hold;
      } else if (e.target !== 'party' && atk && !atk.enemy) {
        // a hero's hit: the impact holds before anything queued (the next card) starts; a sweep's hits land together
        after = sameSwing(e) ? 0 : (e.hit || 1) > 1 ? PACING.hero.combo.hold : atk.P?.hold ?? 0.12;
      }
      return { delay, after, land: () => landDamage(e) };
    },
    death(e) {
      const z = A.enemies.get(e.target);
      if (!z) return {};
      const hold = sameSwing({ source: e.by, hit: null }) ? 0 : 0.05;
      return { after: hold, land: () => {
        if (z.finisherDone) return;
        if (e.finisher && !z.dead) { finisherFx(z, actorOf(e.by) || A.marc, e.kind, null); return; }
        if (!z.dead) z.die(e.kind || 'light');
        later(1.0, () => fx?.dust?.(z.anchor('hips', new THREE.Vector3()), { amount: 0.8 }));
        sfx('body_fall', { uid: z.uid });
      } };
    },
    block(e) {
      if (e.amount <= 0 || e.cleared) return {};
      return { land: () => {
        if (e.target === 'party') {
          fx?.shieldShimmer?.([A.marc, A.yola]);
          number('party', '+' + e.amount, 'block', { amount: e.amount, hero: card?.hero || null });
        } else {
          const z = A.enemies.get(e.target); if (!z) return;
          fx?.shieldShimmer?.([z]); number(e.target, '+' + e.amount, 'block', { amount: e.amount });
        }
      }, after: 0.05 };
    },
    heal(e) {
      if (!(e.amount > 0)) return {};
      return { land: () => {
        if (e.target === 'party') { fx?.healGlow?.(A.marc); fx?.healGlow?.(A.yola); number('party', '+' + e.amount, 'heal', { amount: e.amount }); }
        else { const z = A.enemies.get(e.target); if (z && !z.dead) { fx?.healGlow?.(z, 0x9ff07c); number(e.target, '+' + e.amount, 'heal', { amount: e.amount }); } }
      }, after: 0.08 };
    },
    status(e) {
      if (e.quiet || !(e.delta > 0)) return {};
      return { land: () => {
        const color = STATUS_COLOR[e.status] || (DEBUFF.has(e.status) ? 0xb06bff : 0xffd166);
        const label = STATUS_TEXT[e.status];
        const bad = DEBUFF.has(e.status) || (e.status === 'strength' && e.delta < 0);
        if (e.target === 'party') {
          const heroes = card?.hero && !bad ? [heroFor(card.hero)] : [A.marc, A.yola];
          heroes.forEach(h => h && (bad ? fx?.debuffSwirl?.(h, color) : fx?.buffAura?.(h, color)));
          if (label) number('party', bad ? label : `+${e.delta} ${label}`, bad ? 'debuff' : 'buff', { hero: heroes.length === 1 ? heroes[0].id : null });
        } else {
          const z = A.enemies.get(e.target); if (!z || z.dead) return;
          if (bad) { fx?.debuffSwirl?.(z, color); if (e.status === 'vulnerable' && !z.lying) z.play(z.pickClip(['hit_stumble', 'react_large_front', 'hit_flinch']), { from: 0.15, to: 0.95, timeScale: 1.5 }); }
          else fx?.buffAura?.(z, color);
          if (label) number(e.target, bad ? label : `+${e.delta} ${label}`, bad ? 'debuff' : 'buff');
        }
      }, after: 0.04 };
    },
    enemy_move(e) {
      const z = A.enemies.get(e.uid); if (!z || z.dead) return {};
      z.flash(0xff9a7a, 0.25);
      if (e.clip) z.nextClip = e.clip;
      const type = e.type || '';
      if (/attack/.test(type)) return { after: 0.04 };
      if (type === 'sleep' || type === 'stun' || e.anim === 'none') return { after: 0.25 };
      // non-attacks: a gesture on the spot
      if (e.anim === 'block' || type === 'block') {
        if (z.has('shield_idle')) z.play('shield_idle', { from: 0, to: 1.0, timeScale: 1.2 });
        else z.play(z.pickClip(['react_large_front', 'hit_flinch']), { from: 0.0, to: 0.8, timeScale: 1.3 });
      } else if (e.anim === 'throw' || type === 'debuff') {
        z.face(A.marc.root.position, 80);
        z.play(z.pickClip(['ual_Zombie_Scratch', 'scratch', 'attack']), { from: 0.25, to: 1.1, timeScale: 1.6 });
        later(0.45, () => z.turnTo(z.baseYaw, 200));
      } else {
        // buff / heal / revive: rear up and roar (the attack's wind-up), a shove of air
        const c = z.pickClip(['attack', 'scratch']);
        z.play(c, { from: 0.2, to: 0.95, timeScale: 1.25 });
        later(0.35, () => { stage.shake(0.25 * shakeK(), 200); fx?.dust?.(z.anchor('feet', new THREE.Vector3()), { amount: 0.6 }); });
        sfx('zombie_roar', { uid: z.uid });
      }
      return { after: 0.42 };
    },
    revive(e) {
      const z = A.enemies.get(e.uid); if (!z) return {};
      return { land: () => {
        z.root.position.copy(z.home); z.headGone = false;
        z.revive(); fx?.dust?.(z.anchor('feet', new THREE.Vector3()), { amount: 1.2 }); fx?.healGlow?.(z, 0x9ff07c);
        number(e.uid, 'REVIVED', 'buff');
      }, after: 1.1 };
    },
    mode_shift(e) {
      const z = A.enemies.get(e.uid); if (!z) return {};
      return { land: () => {
        z.mode = e.mode;
        if (e.mode === 'defensive') {
          const c = z.pickClip(['shield_break']);
          if (c) z.play(c, { timeScale: 1.1, fade: 0.08 }); else z.idle();
          fx?.blast?.(z.anchor('chest', new THREE.Vector3()), { color: 0x6aa9d8, strength: 0.8 });
          fx?.shieldShimmer?.([z], { hit: true });
          stage.shake(0.7 * shakeK(), 400); stage.punchIn(z.anchor('chest', new THREE.Vector3()), 900, 0.18);
          number(e.uid, 'SHIELD UP', 'buff', { big: true });
          sfx('mode_shift', { uid: e.uid, mode: e.mode });
        } else { z.idle({ fade: 0.3 }); number(e.uid, 'OFFENSIVE', 'debuff'); }
      }, after: e.mode === 'defensive' ? 1.0 : 0.4 };
    },
    wake(e) {
      const z = A.enemies.get(e.uid); if (!z) return {};
      return { land: () => { z.wake(); fx?.dust?.(z.anchor('feet', new THREE.Vector3()), { amount: 1 }); stage.shake(0.35 * shakeK(), 300); number(e.uid, e.stunned ? 'WOKEN!' : 'AWAKE', 'debuff'); }, after: 0.9 };
    },
    stunned(e) {
      const z = A.enemies.get(e.uid); if (!z) return {};
      return { land: () => { fx?.stunStars?.(z); number(e.uid, 'STUNNED', 'status'); }, after: 0.35 };
    },
    immune(e) { return { land: () => number(e.target, 'IMMUNE', 'status'), after: 0.1 }; },
    escape(e) {
      const z = A.enemies.get(e.uid); if (!z) return {};
      return { land: () => { z.turnTo(Math.PI / 2, 150); z.play(z.pickClip(['sprint', 'walk']), { loop: true }); z.dashTo(z.root.position.clone().add(new THREE.Vector3(7, 0, 0)), 900).then(() => z.setVisible(false)); }, after: 0.5 };
    },
    potion(e) {
      return { land: () => {
        const yola = A.yola, anim = e.anim;
        if (anim === 'heal') { fx?.healGlow?.(A.marc); fx?.healGlow?.(yola); }
        else if (anim === 'block') fx?.shieldShimmer?.([A.marc, A.yola]);
        else if (anim === 'buff') { fx?.buffAura?.(A.marc, 0xffd166); fx?.buffAura?.(yola, 0xffd166); }
        else if (anim === 'throw') {
          heroPose(yola, 'throw');
          const zs = living(); if (!zs.length) return;
          const c = new THREE.Vector3(); zs.forEach(z => c.add(z.root.position)); c.multiplyScalar(1 / zs.length); c.y = 1.0;
          later(0.25, () => {
            if (e.id === 'flashbang') { stage.whiteFlash(0.8, 260); zs.forEach(z => fx?.stunStars?.(z)); }
            else if (e.id === 'pipe_bomb') { fx?.blast?.(c, { strength: 1.4 }); stage.shake(1 * shakeK(), 450); stage.hitStop(90); }
            else { zs.forEach(z => fx?.dust?.(z.anchor('feet', new THREE.Vector3()), { amount: 1.5, color: 0xdfe6e8 })); }
          });
        }
      }, after: e.anim === 'throw' ? 0.35 : 0.25 };
    },
    relic() { return { after: 0.12 }; },
    combat_end(e) {
      return { land: () => {
        if (e.won) {
          later(0.5, () => { A.marc?.returnHome(300); A.yola?.turnTo(STANCE_YAW[A.yola.stanceClip()] ?? A.yola.baseYaw, 300); });
        } else {
          // the defeat: the hero who took the last hit goes down first, the other a beat later; both stay down
          const D = PACING.defeat;
          stage.slowMo(D.slow, 0, { inMs: 120, holdMs: 700, outMs: 600 }); stage.pulse(0x6a0000, 0.8, 1600);
          const firstDown = heroFor(lastPartyHero) || A.marc, other = firstDown === A.marc ? A.yola : A.marc;
          firstDown?.collapse({ delay: 0.05 });
          other?.collapse({ delay: D.second });
          for (const z of living()) { z.lookTarget = firstDown; }
          const mid = (A.marc?.root.position.clone() || new THREE.Vector3()).lerp(A.yola?.root.position || _v2.set(-3, 0, 0), 0.5); mid.y = 0.9;
          stage.punchIn(mid, 3200, 0.16);
        }
        sfx(e.won ? 'victory' : 'defeat');
      }, after: e.won ? 1.0 : PACING.defeat.after };
    },
  };

  // Every hit reads: the stage freezes for a beat (hit-stop), the target flashes and is knocked back along the blow,
  // blood / sparks at the contact, the frame kicks along the blow and shakes, all scaled by the damage; heavy blows add
  // a white pop, a short push-in and dust off the floor.
  function landDamage(e) {
    if (e.target === 'party') {
      const hero = heroFor(e.hero) || (e.kind === 'self' ? heroFor(card?.hero) || A.marc : A.marc);
      lastPartyHero = hero.id;
      const src = A.enemies.get(e.source);
      const dir = src ? hitDir(src, hero) : new THREE.Vector3(-1, 0, 0);
      const chest = hero.anchor('chest', new THREE.Vector3());
      const heavy = e.kind === 'heavy' || e.amount >= 12;
      if (e.amount > 0) {
        hero.hit({ heavy, fromDir: dir, amount: e.amount });
        if (e.kind !== 'self') fx?.impact?.(chest.clone().addScaledVector(dir, -0.12), { dir, strength: THREE.MathUtils.clamp(e.amount / 12, 0.4, 1.4), blunt: false });
        else fx?.blood?.(chest, new THREE.Vector3(0, -1, 0), 0.25);
        stage.pulse(0xb3261e, Math.min(0.75, 0.3 + e.amount / 30), 420);
        stage.hitStop(heavy ? 80 : 55);
        stage.shake(Math.min(1, 0.25 + e.amount / 20) * shakeK(), 260);
        if (src) stage.nudge(Math.sign(dir.x) || -1, -0.15, THREE.MathUtils.clamp(0.25 + e.amount / 16, 0.3, 1) * shakeK());
        number('party', String(e.amount), 'damage', { hero: hero.id, amount: e.amount, big: e.amount >= 15 });
      }
      if (e.blocked > 0) {
        fx?.shieldShimmer?.([hero], { hit: true });
        if (!(e.amount > 0)) {
          hero.hit({ blocked: true }); stage.hitStop(45); stage.shake(0.15 * shakeK(), 150);
          if (src) stage.nudge(Math.sign(dir.x) || -1, 0, 0.2 * shakeK());
        }
        number('party', e.amount > 0 ? `${e.blocked} blocked` : 'BLOCKED', 'blocked', { hero: hero.id, amount: e.blocked });
      }
      return;
    }
    const z = A.enemies.get(e.target); if (!z) return;
    const attacker = actorOf(e.source);
    const dir = attacker ? hitDir(attacker, z) : new THREE.Vector3(1, 0, 0);
    const gun = e.kind === 'gun' || e.kind === 'blast';
    const p = gun && z.lastShotAt ? z.lastShotAt.clone() : strikePoint(z, attacker);
    // a melee blow lands where the weapon meets the body (the bat's barrel, pulled onto the target)
    if (!gun && attacker?.weapon?.kind === 'melee') { const tip = attacker.anchor('tip', _v2); if (tip.distanceTo(p) < 0.9 * (z.scale || 1)) p.lerp(tip, 0.55); }
    if (!(e.amount > 0)) {
      if (e.blocked > 0) { fx?.impact?.(p, { blocked: true }); z.hit({ blocked: true }); stage.hitStop(45); stage.nudge(Math.sign(dir.x) || 1, 0, 0.2 * shakeK()); number(e.target, 'BLOCKED', 'blocked', { amount: e.blocked }); }
      return;
    }
    // the finisher plays here when this hit kills a Staggered zombie
    if (e.killed && e.finisher && !z.finisherDone) { finisherFx(z, attacker || A.marc, e.kind, e); return; }
    const heavy = e.kind === 'heavy' || e.kind === 'blast' || e.amount >= 14;
    const strength = THREE.MathUtils.clamp(e.amount / 12, 0.45, 1.7);
    const k = THREE.MathUtils.clamp(e.amount / 14, 0.25, 1.2);           // the camera's share
    if (e.kind === 'bleed') fx?.blood?.(z.anchor('chest', new THREE.Vector3()), new THREE.Vector3(0, -1, 0), 0.4);
    else fx?.impact?.(p, { dir, strength, blunt: !gun, heavy });
    if (!e.killed) z.hit({ heavy, fromDir: dir, amount: e.amount }); else { z.flash(0xffffff, 1); z.knock.v -= heavy ? 3 : 1.8; }
    const P = atk && !atk.enemy ? atk.P : null;
    stage.hitStop(e.kind === 'bleed' ? 0 : e.killed ? Math.max(90, P?.hitStop || 0) : P?.hitStop ?? (heavy ? 85 : 55));
    stage.shake(Math.min(1.1, 0.12 + e.amount / 22) * shakeK() * (gun && !heavy ? 0.7 : 1), heavy ? 300 : 230);
    if (e.kind !== 'bleed') stage.nudge(Math.sign(dir.x) || 1, heavy ? -0.25 : 0.1, k * shakeK());
    if (heavy && e.kind !== 'bleed') {
      stage.whiteFlash(0.16, 110);
      stage.punchIn(z.anchor('chest', new THREE.Vector3()), 420, 0.06);
      fx?.dust?.(z.anchor('feet', new THREE.Vector3()), { amount: 0.7 });
    }
    number(e.target, String(e.amount), 'damage', { amount: e.amount, big: e.amount >= 15 || e.staggered });
    if (e.blocked > 0) number(e.target, `${e.blocked} blocked`, 'blocked', { amount: e.blocked });
  }

  // ---- the queue ----
  function startNext() {
    const evt = queue.shift();
    let plan = {};
    try { plan = (H[evt.t] ? H[evt.t](evt) : {}) || {}; } catch (err) { console.error('[director]', evt.t, err); }
    const delay = Math.max(0, plan.delay || 0), after = Math.max(0, plan.after || 0);
    const landAt = now + delay;
    timers.push({ at: landAt, land: true, fn: () => {
      try { plan.land?.(); } catch (err) { console.error('[director] land', evt.t, err); }
      emit('event', evt);
      try { audio?.event?.(evt); } catch { /* audio is optional */ }
    } });
    cursor = landAt + after;
  }
  // who looks at whom: a hero at the zombie it is hitting, else the nearest one; a zombie at the hero it goes for
  function updateLooks() {
    const zs = living();
    for (const h of [A.marc, A.yola]) {
      if (!h || h.dead) continue;
      const t = atk && !atk.enemy && atk.actor === h ? atk.targets?.find(z => !z.dead) : null;
      let best = t || null, bd = Infinity;
      if (!best) for (const z of zs) { const d = z.root.position.distanceToSquared(h.root.position); if (d < bd) { bd = d; best = z; } }
      h.lookTarget = best;
    }
    for (const z of zs) {
      z.lookTarget = atk && atk.enemy && atk.actor === z ? atk.hero : ((z.slot ?? 0) % 2 ? A.yola : A.marc) || A.marc;
      if (z.lookTarget?.dead) z.lookTarget = null;
    }
  }
  function update(dt, realDt = dt) {
    const f = stage.frame?.() ?? -2;
    if (f === lastFrame && f !== -2) return; lastFrame = f;
    now += dt; realNow += realDt;
    updateLooks();
    runTimers();
    let guard = 0;
    while (queue.length && now + 1e-6 >= cursor && realNow >= blockReal && guard++ < 200) { startNext(); runTimers(); }
    if (readyWaiters.length && canAcceptInput()) { const w = readyWaiters; readyWaiters = []; w.forEach(r => r()); }
  }
  const unsub = stage.onFrame((dt, realDt) => update(dt, realDt));
  function canAcceptInput() { return queue.length === 0 && now + 1e-6 >= cursor && realNow >= blockReal && !timers.some(t => t.land && t.at > now); }
  function idle() { return canAcceptInput() && !timers.some(t => !t.dead && t.at > now); }

  return {
    push(events) { for (const e of [].concat(events || [])) if (e && e.t) queue.push(e); },
    update, idle, canAcceptInput, on,
    ready() { return canAcceptInput() ? Promise.resolve() : new Promise(r => readyWaiters.push(r)); },
    setSpeed(x) { stage.setSpeed(x); },
    addEnemy(uid, actor) { A.enemies.set(uid, actor); },
    removeEnemy(uid) { A.enemies.delete(uid); },
    setHeroes({ marc, yola }) { if (marc) A.marc = marc; if (yola) A.yola = yola; },
    get actors() { return A; },
    skip() { queue.length = 0; },    // drop what's queued (leaving combat)
    debug() { return { now: +now.toFixed(3), cursor: +cursor.toFixed(3), realNow: +realNow.toFixed(3), blockReal: +blockReal.toFixed(3), queued: queue.map(e => e.t), timers: timers.filter(t => !t.dead).map(t => ({ at: +t.at.toFixed(3), land: !!t.land, key: t.key })) }; },
    dispose() { unsub(); queue.length = 0; timers.length = 0; handlers.clear(); },
  };
}

// ---- building the cast for a combat ----

/** Where each zombie of a combat_start snapshot stands: one big one in the boss spot, a pair spread out, else the slots. */
export function enemyPositions(snaps) {
  const n = snaps.length;
  if (n === 1) return [snaps[0].size === 'large' || snaps[0].tier !== 'normal' ? SLOTS.boss.clone() : new THREE.Vector3(2.1, 0, 0.3)];
  if (n === 2) return [new THREE.Vector3(1.55, 0, 0.4), new THREE.Vector3(3.35, 0, -0.1)];
  if (n === 3) return [SLOTS.enemy[0].clone(), SLOTS.enemy[1].clone(), SLOTS.enemy[2].clone()];
  return snaps.map((_, i) => SLOTS.enemy[Math.min(i, 4)].clone());
}

/** One zombie actor from an enemy snapshot ({ uid, id, model, scale, size, tier, pose, statuses }). */
export async function createEnemyActor(stage, snap, home) {
  const data = await character(snap.model || 'z_romero');
  const a = new Actor(stage, data, { kind: 'enemy', id: snap.model, uid: snap.uid, scale: snap.scale || 1, home });
  a.enemyId = snap.id; a.slot = snap.slot;
  if (snap.pose === 'lying' || (snap.statuses && snap.statuses.asleep)) await a.lieDown(true, { bed: true });
  if (snap.model === 'z_guard') a.attach(createRiotShield(), 'LeftForeArm', SHIELD_FIT);
  return a;
}

/** Marc, Yola (with their run weapons) and the zombies of a combat_start event. -> { marc, yola, enemies: Map } */
export async function createBattleActors(stage, { enemies = [], weapons = {}, heroes = null } = {}) {
  await preload(['marc', 'yola', ...new Set(enemies.map(e => e.model || 'z_romero'))]);
  let marc = heroes?.marc, yola = heroes?.yola;
  if (!marc) { marc = new Actor(stage, await character('marc'), { kind: 'hero', id: 'marc', home: SLOTS.marc }); }
  if (!yola) { yola = new Actor(stage, await character('yola'), { kind: 'hero', id: 'yola', home: SLOTS.yola }); }
  await Promise.all([marc.setWeapon(weapons.marc || 'wood_bat'), yola.setWeapon(weapons.yola || 'pistol')]);
  const pos = enemyPositions(enemies);
  const map = new Map();
  const list = await Promise.all(enemies.map((e, i) => createEnemyActor(stage, e, pos[i])));
  list.forEach((a, i) => map.set(enemies[i].uid, a));
  return { marc, yola, enemies: map };
}
