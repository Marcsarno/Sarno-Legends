// ?shot=<scene>: jump straight to one deterministic moment of the game for the build-log camera (tools/snap.mjs) and
// sets window.__shotReady = true once it has settled. The profile lives in memory only (nothing is saved), the seed is
// ?seed= or SHOT1. Scenes:
//   title armory intro map combat combat_target combat_enemy finisher elite boss reward card_pick rest upgrade shop event
//   treasure deck victory defeat settings
//   history collection savecode infection choice endturn_ask a2hs (the save-safety and replay screens)
import { createProfile } from '../game/meta.js';

export const SHOT_SCENES = ['title', 'armory', 'intro', 'map', 'combat', 'combat_target', 'combat_enemy', 'finisher', 'elite', 'boss',
  'reward', 'card_pick', 'rest', 'upgrade', 'shop', 'event', 'treasure', 'deck', 'victory', 'defeat', 'settings',
  'history', 'collection', 'savecode', 'infection', 'choice', 'endturn_ask', 'a2hs'];

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, timeout = 60000, step = 100) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeout) { try { if (fn()) return true; } catch { /* not yet */ } await sleep(step); }
  console.warn('[shot] timed out waiting for', fn.toString().slice(0, 80));
  return false;
}

const shown = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
/** The stage's painted backdrop has faded in (or the stage isn't showing). */
function stagePainted(app) {
  if (!document.body.classList.contains('sl-stage-title') && !document.body.classList.contains('sl-stage-battle')) return true;
  const back = app.stage.scene.children.find(o => o.renderOrder === -10);
  return !!back?.visible && back.material.opacity >= 1;
}
/** Wait for the slow parts (on a software GPU a room takes ~10 s to paint): painted rooms, card art, portraits. */
async function settle(app, { cards = true } = {}) {
  await until(() => [...document.querySelectorAll('.scr-bg')].every(b => b.classList.contains('scr-bg--painted') || !shown(b)), 90000, 250);
  await until(() => stagePainted(app), 90000, 250);
  if (cards) await until(() => [...document.querySelectorAll('.card__art')].filter(shown).every(a => a.classList.contains('card__art--img')), 60000, 250);
  // relic, potion and weapon icons (studio renders), then their 0.3 s fade-in
  await until(() => [...document.querySelectorAll('.scr-item')].filter(shown).every(e => e.classList.contains('scr-item--img')), 60000, 250);
  await sleep(800);
  await until(() => [...document.querySelectorAll('.tb__face')].every(f => f.classList.contains('tb__face--img')), 40000, 250);
}

/** Every finite DOM animation has finished (on a software GPU the page runs at a few frames a second). */
const animationsDone = () => until(() => document.getAnimations().every(a => a.playState !== 'running' || !Number.isFinite(a.effect?.getComputedTiming?.().endTime)), 30000, 200);

/** The profile a shot starts from: a few runs in (some scrap, the Nail Bat owned). */
export function shotProfile() {
  const p = createProfile();
  p.scrap = 185;
  p.unlocked.push('nail_bat');
  p.stats.runs = 3; p.stats.losses = 3; p.stats.bestFloor = 9;
  return p;
}

/** A profile with some history (?shot=history / collection / infection): a few runs, one won, a part-seen collection. */
export function shotHistoryProfile() {
  const p = shotProfile();
  const day = 864e5, now = Date.now();
  const deck = ['bat_swing', 'bat_swing', 'bat_swing', 'brace', 'brace', 'pistol_shot', 'pistol_shot', 'sidestep', 'sidestep', 'home_run', 'clean_shot', 'tough_it_out+', 'check_mag', 'wait_for_it'];
  const fights = (n, lostLast) => Array.from({ length: n }, (_, i) => ({ floor: [1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 16][i] ?? i + 1,
    encounter: i === 10 ? 'shield_guard' : i === 4 ? 'big_walker' : ['shambler_solo', 'screamer_solo', 'biter_pair', 'two_biters'][i % 4],
    won: !(lostLast && i === n - 1), turns: 3 + (i % 3), hpLost: [4, 0, 9, 6, 14, 3, 7, 0, 5, 11, 22][i] ?? 5, damageTaken: 6 }));
  p.runs = [
    { seed: 'K3F9Q', at: now - 3 * day, won: false, floor: 6, hp: 0, maxHp: 80, gold: 64, weapons: { marc: 'wood_bat', yola: 'pistol' }, deck: deck.slice(0, 10),
      relics: ['nurses_kit', 'wood_bat', 'pistol'], kills: 9, finishers: 3, turns: 21, damageTaken: 80, cause: 'screamer', fights: fights(5, true), scrap: 52 },
    { seed: 'DAILY-2026-10-22', at: now - day, won: false, floor: 9, hp: 0, maxHp: 80, gold: 110, weapons: { marc: 'wood_bat', yola: 'pistol' }, deck: deck.slice(0, 12),
      relics: ['nurses_kit', 'coffee_thermos'], kills: 14, finishers: 5, turns: 33, damageTaken: 92, cause: 'big_walker', fights: fights(7, true), daily: '2026-10-22', score: 118 },
    { seed: 'Z8M2P', at: now - 2 * 3600e3, won: true, floor: 16, hp: 41, maxHp: 86, gold: 140, weapons: { marc: 'nail_bat', yola: 'pistol' }, deck,
      relics: ['nurses_kit', 'nail_bat', 'pistol', 'duct_tape', 'riot_vest', 'pager'], kills: 27, finishers: 11, turns: 58, damageTaken: 151, cause: null, fights: fights(11, false), scrap: 167, score: 431 },
  ];
  p.stats = { ...p.stats, runs: 3, wins: 1, losses: 2, bestFloor: 16 };
  p.infection = { unlocked: 1 };
  p.seen = { cards: {}, relics: {}, potions: {} };
  for (const id of [...deck, 'bat_swing', 'brace', 'pistol_shot', 'sidestep', 'nail_swing', 'pry_loose', 'buckshot', 'clean_shot']) p.seen.cards[id.replace('+', '')] = 1;
  for (const id of ['nurses_kit', 'duct_tape', 'riot_vest', 'pager', 'coffee_thermos', 'granola']) p.seen.relics[id] = 1;
  for (const id of ['medkit', 'adrenaline', 'flashbang']) p.seen.potions[id] = 1;
  return p;
}

export async function runShot(app, scene) {
  const SL = window.__SL;
  const seed = app.params.get('seed') || 'SHOT1';
  const ready = () => { window.__shotReady = true; document.body.dataset.shot = scene; };
  const idleFight = () => until(() => {
    const f = app.fight;
    return f && !app.busy && f.combat.state.phase === 'player' && f.director.idle() && f.handUids().length > 0;
  });
  // a fresh run on the map, then into its first room (row 1 is always a fight)
  const firstFight = async () => {
    await SL.newRun(seed, { neow: false });
    const run = app.run;
    const first = run.map.starts.slice().sort()[Math.floor(run.map.starts.length / 2)];
    app.mainScreen().ctx.act.travel(first);
    await until(() => app.screen === 'combat' && !app.busy);
    await idleFight();
    await sleep(1000);
  };
  window.__shot = { scene, seed };

  switch (scene) {
    case 'title': await settle(app); await sleep(800); await animationsDone(); break;
    case 'armory': await app.toArmory(); await settle(app); await sleep(2500); await animationsDone(); break;
    case 'intro': await SL.newRun(seed, { neow: true }); await settle(app); await sleep(600); await animationsDone(); break;
    case 'map': await SL.newRun(seed, { neow: false }); await settle(app); await sleep(3200); break;
    case 'deck': await SL.newRun(seed, { neow: false }); SL.goto('deck'); await settle(app); await sleep(800); await animationsDone(); break;
    case 'combat': await firstFight(); await settle(app); await sleep(400); break;
    case 'combat_target': {
      await firstFight();
      await settle(app);
      const f = app.fight, c = f.combat;
      const uid = f.handUids().find(u => c.needsTarget(u));
      const tgt = f.targets()[0];
      if (uid && tgt) {
        const head = f.ui.screenOf(tgt, 'head'), feet = f.ui.screenOf(tgt, 'feet');
        f.ui.hand.debugPose(uid, 'drag', { x: head.x, y: head.y + (feet.y - head.y) * 0.45 });
        await sleep(1200);
      }
      break;
    }
    case 'combat_enemy': {
      await firstFight();
      await settle(app);
      const f = app.fight;
      let hit = false;
      const off = f.director.on('event', e => { if (e.t === 'damage' && e.target === 'party') hit = true; });
      f.endTurn();
      await until(() => hit, 30000, 16);
      off();
      await sleep(140);
      app.stage.pause(true);
      await sleep(400);
      break;
    }
    case 'finisher': {
      await SL.combat('shambler_solo');
      await idleFight();
      await settle(app);
      const f = app.fight, c = f.combat;
      const z = c.state.enemies[0];
      z.hp = 6; z.statuses.vulnerable = 2;
      const card = c.state.hand.find(k => k.id === 'bat_swing') || c.state.hand[0];
      card.id = 'home_run'; card.cost = 0; card.costTurn = undefined;
      f.ui.sync();
      await sleep(600);
      let fin = false;
      const off = f.director.on('finisher', () => { fin = true; });
      f.play(card.uid, z.uid);
      await until(() => fin, 30000, 16);
      off();
      await sleep(420);
      app.stage.pause(true);
      await sleep(300);
      break;
    }
    case 'elite': await SL.goto('elite', { encounter: 'big_walker' }); await idleFight(); await settle(app); await sleep(800); break;
    case 'boss': await SL.goto('boss'); await idleFight(); await settle(app); await sleep(800); break;
    case 'reward': case 'card_pick': {
      await firstFight();
      await settle(app, { cards: false });
      SL.win();
      await until(() => app.screen === 'reward', 180000);
      await sleep(1300);
      if (scene === 'card_pick') { document.querySelector('.rw-row--cards')?.click(); await sleep(600); await settle(app); await sleep(600); }
      await animationsDone();
      break;
    }
    case 'rest': case 'upgrade': {
      await SL.newRun(seed, { neow: false });
      app.run.hp = 47;
      await SL.goto('rest');
      await settle(app);
      await sleep(800);
      if (scene === 'upgrade') { document.querySelector('.rs-choice--up')?.click(); await sleep(600); await settle(app); await sleep(600); }
      await animationsDone();
      break;
    }
    case 'shop': await SL.newRun(seed, { neow: false }); SL.give({ gold: 140 }); await SL.goto('shop'); await settle(app); await sleep(1500); await animationsDone(); break;
    case 'event': await SL.newRun(seed, { neow: false }); await SL.goto('event', { event: app.params.get('event') || 'break_room' }); await settle(app); await sleep(1200); await animationsDone(); break;
    case 'treasure': await SL.newRun(seed, { neow: false }); await SL.goto('treasure'); await settle(app); await sleep(1200); await animationsDone(); break;
    case 'victory': case 'defeat': {
      if (scene === 'victory') { await SL.goto('boss'); } else { await SL.combat('horde'); }
      await idleFight();
      if (scene === 'victory') SL.win(); else SL.lose();
      await until(() => app.screen === 'result' && !app.busy, 240000);
      await settle(app);
      await sleep(3500);
      await animationsDone();
      break;
    }
    case 'settings': await settle(app); app.openSettings(); await sleep(900); await animationsDone(); break;
    case 'history': await settle(app); app.openHistory(); await sleep(700); document.querySelector('.hi-row__head')?.click(); await sleep(900); await settle(app, { cards: false }); await animationsDone(); break;
    case 'collection': await settle(app); app.openCollection(); await sleep(900); await settle(app); await animationsDone(); break;
    case 'savecode': await settle(app); app.openSaveCode(app.params.get('mode') || 'export'); await sleep(1500); await animationsDone(); break;
    case 'infection': await settle(app); app.startNewRun(); await sleep(900); await animationsDone(); break;
    case 'a2hs': await settle(app); await sleep(2200); await animationsDone(); break;
    case 'choice': case 'endturn_ask': {
      await SL.combat('shambler_solo');
      await idleFight();
      await settle(app);
      const f = app.fight, c = f.combat;
      if (scene === 'choice') {
        const card = c.state.hand.find(k => k.id !== 'check_mag') || c.state.hand[0];
        card.id = 'check_mag'; card.cost = 0; card.costTurn = undefined;
        f.ui.sync();
        await sleep(400);
        f.play(card.uid);
        await until(() => f.choice?.open, 30000, 50);
        await sleep(700);
        await settle(app);
      } else {
        (app.profile.ui ||= {}).warnEndTurn = true;
        app.fight.ui.el.querySelector('.endturn')?.click();
        await sleep(700);
      }
      await animationsDone();
      break;
    }
    default: console.warn('[shot] unknown scene', scene, '- scenes:', SHOT_SCENES.join(' '));
  }
  ready();
}
