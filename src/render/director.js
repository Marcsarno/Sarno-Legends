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
  function heroMelee(hero, targets, clip, { hitIn = 0.27, dash = 0.12, after = 1.25 } = {}) {
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
    hero.dashTo(dest, dash * 1000);
    hero.turnTo((T.yaw ?? Math.PI / 2) + Math.atan2(dir.x, dir.z) - Math.PI / 2, 90);
    hero.strike(clip, { hitIn, after });
    fx?.trail?.(hero, true);
    later(hitIn + 0.16, () => fx?.trail?.(hero, false), 'trail:' + hero.id);
    later(hitIn + 0.34, () => { hero.returnHome(230); }, 'ret:' + hero.id);
    sfx('swing', { by: hero.id, clip });
    return hitIn;
  }
  function zombieMelee(z, hero, clip, { hitIn = 0.28, dash = 0.15, ret = true } = {}) {
    const T = CLIP_TIMING[clip] || {};
    const hp = hero.root.position.clone();
    const dir = flat(_v.copy(hp).sub(z.home)).normalize();
    const reach = (T.reach ?? 1.0) * Math.max(1, (z.scale || 1) * 0.92) + (T.travel || 0);
    const dest = hp.clone().addScaledVector(dir, -reach);
    later(0, () => {}, 'ret:' + z.uid);
    z.dashTo(dest, dash * 1000); z.face(hp, 90);
    z.strike(clip, { hitIn, after: 1.35 });
    if (ret) later(hitIn + 0.3, () => { z.returnHome(260); z.turnTo(z.baseYaw, 260); }, 'ret:' + z.uid);
    sfx('zombie_attack', { by: z.uid, clip });
    return hitIn;
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
      fx?.tracer?.(m, p, { width: big ? 0.03 : 0.022 });
      t.lastShotAt = p;
    }
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize().negate();
    fx?.shell?.(hero.anchor('hand', new THREE.Vector3()).addScaledVector(fwd, 0.05), side);
    hero.kickRecoil(big ? 1.25 : 0.85);
    stage.shake((big ? 0.35 : 0.12) * shakeK(), 160);
    sfx(big ? 'shotgun' : 'pistol', { by: hero.id });
  }
  function heroShoot(hero, targets, { big = false, hitIn = 0.09, head = false } = {}) {
    if (!targets.length) return 0;
    hero.aiming = true;
    aimAt(hero, targets[0].anchor('chest', new THREE.Vector3()), Math.min(80, hitIn * 900));
    later(hitIn, () => fire(hero, targets, { big, head }));
    later(hitIn + 0.7, () => { hero.aiming = false; if (!hero.dead) hero.turnTo(STANCE_YAW[hero.stanceClip()] ?? hero.baseYaw, 260); }, 'aim:' + hero.id);
    return hitIn;
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
  function finisherFx(z, attacker, kind, evt) {
    const first = finishersShown === 0; finishersShown++;
    const gun = kind === 'gun' || kind === 'blast';
    const dir = attacker ? hitDir(attacker, z) : new THREE.Vector3(1, 0, 0);
    stage.hitStop(first ? 150 : 110);
    stage.slowMo(0.25, first ? 1300 : 700);
    stage.punchIn(z.anchor('head', new THREE.Vector3()).setY(Math.max(1.1, z.anchor('head', _v2).y - 0.25)), first ? 1900 : 1150, first ? 0.42 : 0.3);
    stage.whiteFlash(0.45, 150);
    stage.shake(0.8 * shakeK(), 380);
    const head = z.anchor('head', new THREE.Vector3());
    if (goreFull()) fx?.gib?.(z, 'head', { dir, burst: gun, speed: 4.6 });
    fx?.blast?.(head, { color: 0xff5a3a, strength: 0.55, ground: false });
    fx?.impact?.(head, { dir, strength: 1.6, blunt: !gun });
    z.finisherDone = true;
    z.die(gun ? 'gun' : 'heavy', { finisher: true });
    if (!gun) z.tween(z.root, 'position', z.root.position.clone().addScaledVector(dir, 0.7), 650);
    banner('FINISHER', 'finisher');
    emit('finisher', { uid: z.uid, by: attacker?.id || null, first, kind });
    number(z.uid, evt?.amount ?? '', 'finisher', { amount: evt?.amount, big: true });
    sfx('finisher', { uid: z.uid, kind, first });
    blockReal = Math.max(blockReal, realNow + (first ? 2.0 : 1.05));
    later(first ? 0.6 : 0.35, () => { if (attacker?.isHero) attacker.returnHome(300); }, 'ret:' + attacker?.id);
  }
  // the attack event: look ahead for a finisher in this attack's damage (a kill on a Staggered zombie)
  function findFinisher() {
    for (const e of queue) {
      if (e.t === 'attack' || e.t === 'card_played' || e.t === 'turn_start' || e.t === 'combat_end') break;
      if ((e.t === 'damage' && e.finisher) || (e.t === 'death' && e.finisher)) return e;
    }
    return null;
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
      if (e.side === 'enemy') { banner("Zombies' Turn", 'enemy'); return { after: 0.5 }; }
      banner('Your Turn', 'player');
      return { after: 0.25 };
    },
    card_played(e) {
      card = e; atk = null;
      const hero = heroFor(e.hero);
      if (!hero) return {};
      if (e.type === 'attack' || /^melee|^pistol|^shotgun/.test(e.anim || '')) return {};
      if (e.anim === 'none') return {};
      heroPose(hero, e.anim, e.clip);
      if (e.type === 'power') { fx?.buffAura?.(hero, HERO_COLOR[hero.id]); sfx('power', { hero: hero.id }); }
      return { after: e.anim === 'block' || e.anim === 'dodge' ? 0.16 : 0.2 };
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
        atk = { by: e.by, actor: z, hero, anim, hits: e.hits || 1, hit: 1, clips: pref.filter(c => z.has(c)), enemy: true };
        const t = zombieMelee(z, hero, clip, { hitIn: anim === 'melee_heavy' ? 0.32 : 0.27 });
        return { after: t };
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
        if (fin && !atk.all && e.hits <= 1) {
          // bullet time: slow, push in on the head, then the shot
          stage.slowMo(0.35, 650); stage.punchIn(targets[0].anchor('head', new THREE.Vector3()), 1500, 0.32);
          atk.head = true;
          return { delay: heroShoot(hero, targets, { big, hitIn: 0.2, head: true }), after: 0.03 };
        }
        return { delay: heroShoot(hero, targets, { big, hitIn: 0.08 }), after: 0.035 };
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
      const hitIn = fin && clip.startsWith('hub_execution') ? 0.42 : anim === 'melee_heavy' || anim === 'melee_sweep' ? 0.3 : 0.27;
      const t = heroMelee(hero, targets, clip, { hitIn });
      return { after: t };
    },
    damage(e) {
      // a follow-up hit of a multi-hit attack: swing / shoot again first
      let delay = 0;
      if (atk && e.hit > atk.hit && (e.source === atk.by || A.enemies.get(e.source) === atk.actor)) {
        atk.hit = e.hit;
        if (atk.enemy) {
          const clip = atk.clips[(e.hit - 1) % Math.max(1, atk.clips.length)] || 'scratch';
          delay = 0.2; atk.actor.strike(clip, { hitIn: 0.2, after: 1.35 });
          later(0.5, () => { atk?.actor?.returnHome?.(260); }, 'ret:' + atk.actor.uid);
        } else if (/pistol|shotgun/.test(atk.anim)) {
          const tgt = A.enemies.get(e.target), shooter = atk.actor, big = atk.anim === 'shotgun'; delay = 0.13;
          if (tgt) {
            later(0.03, () => aimAt(shooter, tgt.anchor('chest', new THREE.Vector3()), 50));
            later(0.1, () => fire(shooter, [tgt], { big }));
          }
        } else {
          const tgt = atk.all ? living() : [A.enemies.get(e.target)].filter(Boolean);
          const clip = atk.clips[(e.hit - 1) % atk.clips.length];
          delay = heroMelee(atk.actor, tgt.length ? tgt : atk.targets, clip, { hitIn: 0.22, dash: 0.08 });
        }
      }
      // a zombie's last hit: a beat before the next zombie moves (~0.45 s a zombie in all)
      const after = A.enemies.get(e.source) && e.target === 'party' && (e.hit || 1) >= (e.hits || 1) ? 0.13 : 0;
      return { delay, after, land: () => landDamage(e) };
    },
    death(e) {
      const z = A.enemies.get(e.target);
      if (!z) return {};
      return { land: () => {
        if (z.finisherDone) return;
        if (e.finisher && !z.dead) { finisherFx(z, actorOf(e.by) || A.marc, e.kind, null); return; }
        if (!z.dead) z.die(e.kind || 'light');
        later(1.0, () => fx?.dust?.(z.anchor('hips', new THREE.Vector3()), { amount: 0.8 }));
        sfx('body_fall', { uid: z.uid });
      }, after: 0.05 };
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
          stage.slowMo(0.45, 1200); stage.pulse(0x6a0000, 0.8, 1600);
          for (const h of [A.marc, A.yola]) if (h) { const c = h.pickClip(HERO_ANIMS[h.id]?.defeat || []); if (c) { h.dead = false; h.play(c, { timeScale: c === 'death_defeat' ? 1.6 : 1.1, then: 'hold', fade: 0.15 }); h.dead = true; } }
        }
        sfx(e.won ? 'victory' : 'defeat');
      }, after: e.won ? 1.0 : 2.2 };
    },
  };

  function landDamage(e) {
    if (e.target === 'party') {
      const hero = heroFor(e.hero) || (e.kind === 'self' ? heroFor(card?.hero) || A.marc : A.marc);
      const src = A.enemies.get(e.source);
      const dir = src ? hitDir(src, hero) : new THREE.Vector3(-1, 0, 0);
      const chest = hero.anchor('chest', new THREE.Vector3());
      if (e.amount > 0) {
        hero.hit({ heavy: e.amount >= 12, fromDir: dir });
        if (e.kind !== 'self') fx?.blood?.(chest, dir, Math.min(1, 0.3 + e.amount / 20)); else fx?.blood?.(chest, new THREE.Vector3(0, -1, 0), 0.25);
        stage.pulse(0xb3261e, Math.min(0.75, 0.3 + e.amount / 30), 420);
        stage.hitStop(e.amount >= 12 ? 70 : 45);
        stage.shake(Math.min(1, 0.25 + e.amount / 20) * shakeK(), 260);
        number('party', String(e.amount), 'damage', { hero: hero.id, amount: e.amount, big: e.amount >= 15 });
      }
      if (e.blocked > 0) {
        fx?.shieldShimmer?.([hero], { hit: true });
        if (!(e.amount > 0)) { hero.hit({ blocked: true }); stage.hitStop(35); stage.shake(0.12 * shakeK(), 150); }
        number('party', e.amount > 0 ? `${e.blocked} blocked` : 'BLOCKED', 'blocked', { hero: hero.id, amount: e.blocked });
      }
      return;
    }
    const z = A.enemies.get(e.target); if (!z) return;
    const attacker = actorOf(e.source);
    const dir = attacker ? hitDir(attacker, z) : new THREE.Vector3(1, 0, 0);
    const gun = e.kind === 'gun' || e.kind === 'blast';
    const p = gun && z.lastShotAt ? z.lastShotAt.clone() : strikePoint(z, attacker);
    if (!(e.amount > 0)) {
      if (e.blocked > 0) { fx?.impact?.(p, { blocked: true }); z.hit({ blocked: true }); stage.hitStop(40); number(e.target, 'BLOCKED', 'blocked', { amount: e.blocked }); }
      return;
    }
    // the finisher plays here when this hit kills a Staggered zombie
    if (e.killed && e.finisher && !z.finisherDone) { finisherFx(z, attacker || A.marc, e.kind, e); return; }
    const heavy = e.kind === 'heavy' || e.kind === 'blast' || e.amount >= 14;
    const strength = THREE.MathUtils.clamp(e.amount / 12, 0.45, 1.7);
    if (e.kind === 'bleed') fx?.blood?.(z.anchor('chest', new THREE.Vector3()), new THREE.Vector3(0, -1, 0), 0.4);
    else fx?.impact?.(p, { dir, strength, blunt: !gun });
    if (!e.killed) z.hit({ heavy, fromDir: dir, amount: e.amount }); else z.flash(0xffffff, 0.7);
    stage.hitStop(e.killed ? 85 : heavy ? 72 : e.kind === 'bleed' ? 0 : 52);
    stage.shake(Math.min(1, 0.12 + e.amount / 26) * shakeK() * (gun ? 0.7 : 1), 230);
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
  function update(dt, realDt = dt) {
    const f = stage.frame?.() ?? -2;
    if (f === lastFrame && f !== -2) return; lastFrame = f;
    now += dt; realNow += realDt;
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
