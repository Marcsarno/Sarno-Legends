// Meta progression (src/game/meta.js): the profile, scrap, the weapon tree (the Armory), settings, run records.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/game/meta.js';
import * as R from '../src/game/run.js';
import { WEAPONS } from '../src/game/content/weapons.js';

test('a new profile: no scrap, the two free weapons owned and equipped, default settings', () => {
  const p = M.createProfile();
  assert.equal(p.scrap, 0);
  assert.deepEqual(p.unlocked.sort(), ['pistol', 'wood_bat']);
  assert.deepEqual(p.equipped, { marc: 'wood_bat', yola: 'pistol' });
  assert.deepEqual(p.settings, { speed: 1, music: 0.7, sfx: 0.8, shake: true, gore: 'full' });
  assert.deepEqual(p.runs, []);
  assert.equal(p.stats.runs, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(p)), p);
});

test('unlocks follow the tree and cost scrap; equip needs the right hero and an owned weapon', () => {
  const p = M.createProfile();
  assert.equal(M.canUnlock(p, 'nail_bat').reason, 'scrap');
  assert.equal(M.canUnlock(p, 'wire_bat').reason, 'requires');
  assert.equal(M.canUnlock(p, 'wood_bat').reason, 'owned');
  assert.equal(M.canUnlock(p, 'laser').reason, 'unknown');
  assert.equal(M.equip(p, 'marc', 'nail_bat').reason, 'locked');
  p.scrap = 1000;
  assert.ok(M.unlockWeapon(p, 'nail_bat').ok);
  assert.equal(p.scrap, 1000 - WEAPONS.nail_bat.cost);
  assert.equal(M.unlockWeapon(p, 'nail_bat').reason, 'owned');
  assert.ok(M.canUnlock(p, 'wire_bat').ok);
  assert.ok(M.equip(p, 'marc', 'nail_bat').ok);
  assert.equal(M.equip(p, 'yola', 'nail_bat').reason, 'hero');
  assert.deepEqual(p.equipped, { marc: 'nail_bat', yola: 'pistol' });
  for (const w of Object.values(WEAPONS)) {
    if (!w.requires) continue;
    assert.ok(WEAPONS[w.requires], `${w.id} requires a real weapon`);
    assert.equal(WEAPONS[w.requires].hero, w.hero);
    assert.ok(WEAPONS[w.requires].tier < w.tier);
  }
  const q = M.createProfile();
  q.scrap = 150;
  assert.deepEqual(M.affordableWeapons(q), ['nail_bat', 'crowbar', 'shotgun']);
});

test('settings are validated', () => {
  const p = M.createProfile();
  assert.ok(M.setSetting(p, 'speed', 2).ok);
  assert.equal(M.setSetting(p, 'speed', 3).reason, 'value');
  assert.ok(M.setSetting(p, 'gore', 'low').ok);
  assert.equal(M.setSetting(p, 'gore', 'none').reason, 'value');
  assert.ok(M.setSetting(p, 'music', 0).ok);
  assert.equal(M.setSetting(p, 'volume', 1).reason, 'unknown');
  assert.deepEqual(p.settings, { speed: 2, music: 0, sfx: 0.8, shake: true, gore: 'low' });
});

test('scrap: fight 8, elite 20, boss 40, floor cleared +15; win or lose, no toll', () => {
  const run = R.createRun({ seed: 'S', neow: false });
  Object.assign(run.stats, { fights: 7, elites: 2, bosses: 0 });
  assert.deepEqual(M.scrapFor(run), { earned: 96, lines: [{ label: 'Fights ×7', amount: 56 }, { label: 'Elites ×2', amount: 40 }] });
  Object.assign(run.stats, { bosses: 1 });
  run.won = true;
  assert.equal(M.scrapFor(run).earned, 96 + 40 + 15);
  assert.equal(M.scrapFor(R.createRun({ seed: 'E', neow: false })).earned, 0);
});

test('recordRun: banks scrap and stats once, keeps the last 20 run logs, hints at newly affordable weapons', () => {
  const p = M.createProfile();
  p.scrap = 70;
  const run = R.createRun({ seed: 'REC', neow: false });
  R.forceRoom(run, null, { encounter: 'two_biters' });
  const c = R.startCombat(run); c.forceWin(); R.finishCombat(run, c); R.leaveRewards(run);
  R.forceRoom(run, null, { encounter: 'big_walker' });
  const d = R.startCombat(run); d.forceLose(); R.finishCombat(run, d);
  const rec = M.recordRun(p, run, { now: 1 });
  assert.deepEqual(rec.scrap, { before: 70, earned: 8, after: 78, lines: [{ label: 'Fights ×1', amount: 8 }] });
  assert.deepEqual(rec.unlocks, []);
  assert.equal(p.stats.runs, 1); assert.equal(p.stats.losses, 1); assert.equal(p.stats.fights, 1);
  assert.equal(p.runs.length, 1);
  const log = p.runs[0];
  assert.equal(log.seed, 'REC'); assert.equal(log.won, false); assert.equal(log.cause, 'debug', 'forceLose names no zombie');
  assert.equal(log.fights.length, 2); assert.equal(log.cards.length, 1);
  assert.equal(M.recordRun(p, run), rec, 'a second call changes nothing');
  assert.equal(p.scrap, 78);

  const win = R.createRun({ seed: 'W', neow: false });
  Object.assign(win.stats, { fights: 8, elites: 2, bosses: 1 });
  win.won = true; win.over = true; win.floor = 16;
  const r2 = M.recordRun(p, win, { now: 2 });
  assert.equal(r2.scrap.earned, 64 + 40 + 40 + 15);
  assert.ok(r2.unlocks.some(u => u.weapon === 'nail_bat') && r2.unlocks.every(u => /You can afford/.test(u.text)));
  assert.equal(p.stats.wins, 1); assert.equal(p.stats.streak, 1); assert.equal(p.stats.bestFloor, 16); assert.equal(r2.best, true);
  for (let i = 0; i < 25; i++) M.recordRun(p, { ...R.createRun({ seed: `X${i}`, neow: false }) });
  assert.equal(p.runs.length, 20);
});

test('loadProfile: fills gaps, keeps valid data, resets a loadout that is not owned', () => {
  assert.deepEqual(M.loadProfile(null), M.createProfile());
  const p = M.loadProfile({ scrap: 120.7, unlocked: ['nail_bat', 'bogus'], equipped: { marc: 'fire_axe', yola: 'pistol' }, settings: { speed: 1.5, gore: 'gross' }, runs: Array(30).fill({}) });
  assert.equal(p.scrap, 120);
  assert.deepEqual(p.unlocked.sort(), ['nail_bat', 'pistol', 'wood_bat']);
  assert.deepEqual(p.equipped, { marc: 'wood_bat', yola: 'pistol' });
  assert.equal(p.settings.speed, 1.5); assert.equal(p.settings.gore, 'full');
  assert.equal(p.runs.length, 20);
  assert.equal(p.stats.runs, 0);
});
