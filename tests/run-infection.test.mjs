// Infection levels (src/game/infection.js: our Ascension), the Daily Run (run.js dailySeed / createRun({ daily })),
// the run score, and what meta.js keeps of them (profile.infection, profile.daily).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/game/run.js';
import * as M from '../src/game/meta.js';
import { INFECTION_LEVELS, MAX_INFECTION, infectionRules, infectionLevel } from '../src/game/infection.js';
import { roomCounts } from '../src/game/map.js';
import { createCombat } from '../src/game/combat.js';
import { describeRelic } from '../src/game/text.js';
import { BOTS } from '../tools/sim/bots.mjs';
import { playRun } from '../tools/sim/play.mjs';

const fight = (infection, encounter) => {
  const run = R.createRun({ seed: 'INF', neow: false, infection });
  R.forceRoom(run, 'fight', { encounter });
  return { run, c: R.startCombat(run) };
};

test('INFECTION_LEVELS: 0..5 with a name and a description each; rules are cumulative', () => {
  assert.equal(MAX_INFECTION, 5);
  assert.deepEqual(INFECTION_LEVELS.map(l => l.level), [0, 1, 2, 3, 4, 5]);
  for (const l of INFECTION_LEVELS) assert.ok(l.name && l.desc, l.level);
  assert.deepEqual(M.INFECTION_LEVELS, INFECTION_LEVELS, 'meta re-exports them for the UI');
  assert.equal(infectionLevel('3'), 3); assert.equal(infectionLevel(9), 5); assert.equal(infectionLevel(-1), 0); assert.equal(infectionLevel(undefined), 0);
  const r = [0, 1, 2, 3, 4, 5].map(infectionRules);
  assert.equal(r[0].eliteOdds, 0.08); assert.equal(r[1].eliteOdds, 0.128); assert.equal(r[5].eliteOdds, 0.128);
  assert.equal(r[1].normal.pct, 0); assert.ok(r[2].normal.pct > 0); assert.ok(r[5].normal.pct > 0);
  assert.equal(r[2].elite.pct, 0); assert.ok(r[3].elite.pct > 0 && r[3].elite.hpPct > 0);
  assert.equal(r[3].boss.hp, 0); assert.ok(r[4].boss.hp > 0 && r[4].boss.pct > 0);
  assert.deepEqual([r[4].kitHeal, r[4].restHeal], [6, 0.3]);
  assert.deepEqual([r[5].kitHeal, r[5].restHeal], [4, 0.25]);
});

test('level 0 is today\'s game: same map and same save as a run made without the option', () => {
  assert.equal(R.serialize(R.createRun({ seed: 'SAME' })), R.serialize({ ...R.createRun({ seed: 'SAME', infection: 0 }) }));
  const run = R.createRun({ seed: 'SAME' });
  assert.equal(run.infection, 0);
  assert.equal(run.daily, null);
});

test('Infection 1: more elites on the map', () => {
  let a = 0, b = 0;
  for (let i = 0; i < 40; i++) {
    a += roomCounts(R.createRun({ seed: `E${i}`, neow: false }).map).elite || 0;
    b += roomCounts(R.createRun({ seed: `E${i}`, neow: false, infection: 1 }).map).elite || 0;
  }
  assert.ok(b > a * 1.3, `${a} -> ${b}`);
});

test('Infection 2: normal zombies hit harder and have more HP (intents show it)', () => {
  const z0 = fight(0, 'shambler_solo').c, z2 = fight(2, 'shambler_solo').c;
  const e0 = z0.state.enemies[0], e2 = z2.state.enemies[0];
  assert.equal(e0.intent.move, 'bite_down'); assert.equal(e2.intent.move, 'bite_down');
  assert.equal(z0.intentOf(e0.uid).damage, 11);
  assert.equal(z2.intentOf(e2.uid).damage, 14);
  assert.equal(e2.maxHp, Math.round(e0.maxHp * 1.1));
  z2.endTurn();
  const hit = z2.takeEvents().find(e => e.t === 'damage' && e.target === 'party');
  assert.equal(hit.amount + hit.blocked, 14, 'the real hit matches the intent');
  assert.equal(z2.state.infection, 2);
  // elites are untouched at 2
  const run = R.createRun({ seed: 'INF', neow: false, infection: 2 });
  R.forceRoom(run, 'elite', { encounter: 'big_walker' });
  const c = R.startCombat(run);
  assert.equal(c.state.enemies[0].dmgUp, undefined);
});

test('Infection 3 and 4: elites, then the boss, are tougher', () => {
  const mk = (inf, enc) => { const run = R.createRun({ seed: 'INF', neow: false, infection: inf }); R.forceRoom(run, 'elite', { encounter: enc }); return R.startCombat(run); };
  const w2 = mk(2, 'big_walker').state.enemies[0], w3 = mk(3, 'big_walker').state.enemies[0];
  assert.equal(w3.maxHp, Math.round(w2.maxHp * 1.1));
  const c3 = mk(3, 'big_walker');
  c3.setIntent(c3.state.enemies[0], 'charge');
  assert.equal(c3.intentOf(c3.state.enemies[0].uid).damage, 17, 'Charge 14 -> 17');
  const g3 = mk(3, 'shield_guard').state.enemies[0], g4 = mk(4, 'shield_guard').state.enemies[0];
  assert.equal(g3.maxHp, 240);
  assert.equal(g4.maxHp, 270);
  const c4 = mk(4, 'shield_guard');
  c4.setIntent(c4.state.enemies[0], 'shield_bash');
  assert.equal(c4.intentOf(c4.state.enemies[0].uid).damage, 39, 'Shield Bash 32 -> 39');
});

test('Infection 5: the Nurse\'s Kit heals 4 and resting heals 25%', () => {
  for (const [inf, kit, rest] of [[4, 6, 24], [5, 4, 20]]) {
    const { run, c } = fight(inf, 'two_biters');
    c.state.party.hp = 50;
    c.forceWin();
    assert.equal(c.state.party.hp, 50 + kit, `kit at ${inf}`);
    assert.equal(R.restAmount(run), rest, `rest at ${inf}`);
  }
  assert.match(describeRelic('nurses_kit', { infection: 5 }), /heal 4 HP/);
  assert.match(describeRelic('nurses_kit'), /heal 6 HP/);
});

test('infection survives save / load; old saves load as level 0', () => {
  const run = R.createRun({ seed: 'SV', infection: 4 });
  const back = R.deserialize(R.serialize(run));
  assert.equal(back.infection, 4);
  const old = JSON.parse(R.serialize(R.createRun({ seed: 'OLD' })));
  delete old.infection; delete old.daily;
  const loaded = R.deserialize(JSON.stringify(old));
  assert.equal(loaded.infection, 0);
  assert.equal(loaded.daily, null);
  // a combat built from a run without the field is level 0
  const c = createCombat({ run: { seed: 'X', hp: 80, maxHp: 80, deck: [], relics: [], potions: [null, null, null], weapons: {} }, encounter: 'shambler_solo', rng: 'X' });
  c.start();
  assert.equal(c.state.infection, 0);
});

test('profile.infection: a win at your highest unlocked level unlocks the next, up to 5', () => {
  const p = M.createProfile();
  assert.deepEqual(p.infection, { unlocked: 0 });
  assert.equal(M.canUseInfection(p, 0), true);
  assert.equal(M.canUseInfection(p, 1), false);
  const finished = (infection, won) => Object.assign(R.createRun({ seed: `W${infection}${won}`, neow: false, infection }), { over: true, won, floor: 16 });
  let rec = M.recordRun(p, finished(0, false));
  assert.equal(rec.infection.newlyUnlocked, null);
  assert.equal(p.infection.unlocked, 0);
  rec = M.recordRun(p, finished(0, true));
  assert.deepEqual(rec.infection, { level: 0, unlocked: 1, newlyUnlocked: 1 });
  assert.equal(M.canUseInfection(p, 1), true);
  M.recordRun(p, finished(0, true));
  assert.equal(p.infection.unlocked, 1, 'a win below your highest level unlocks nothing');
  for (let l = 1; l <= 5; l++) M.recordRun(p, finished(l, true));
  assert.equal(p.infection.unlocked, 5, 'capped at 5');
  const loaded = M.loadProfile(JSON.parse(JSON.stringify(p)));
  assert.equal(loaded.infection.unlocked, 5);
  assert.deepEqual(M.loadProfile({ scrap: 3 }).infection, { unlocked: 0 }, 'old profiles start at 0');
  assert.equal(M.loadProfile({ infection: { unlocked: 99 } }).infection.unlocked, 5);
});

test('dailySeed: one seed per local date; the Daily Run is the same for everyone that day', () => {
  assert.equal(R.dailySeed(new Date(2026, 9, 23, 23, 59)), 'DAILY-2026-10-23');
  assert.equal(R.dailySeed(new Date(2026, 9, 24, 0, 1)), 'DAILY-2026-10-24');
  assert.equal(R.dailySeed('2026-01-05'), 'DAILY-2026-01-05');
  assert.equal(R.dailyDate(new Date(2026, 0, 5)), '2026-01-05');
  assert.throws(() => R.dailySeed('Oct 23'));
  assert.match(R.dailySeed(), /^DAILY-\d{4}-\d{2}-\d{2}$/);

  const a = R.createRun({ daily: '2026-10-23', profile: { equipped: { marc: 'fire_axe', yola: 'shotgun' } }, infection: 4 });
  const b = R.createRun({ daily: '2026-10-23', weapons: { marc: 'nail_bat' } });
  assert.equal(a.daily, '2026-10-23');
  assert.equal(a.seed, 'DAILY-2026-10-23');
  assert.deepEqual(a.weapons, { marc: 'wood_bat', yola: 'pistol' }, 'everyone plays the free weapons');
  assert.equal(a.infection, 0, 'and Infection 0');
  assert.equal(R.serialize(a), R.serialize(b), 'same map, Shift Change, everything');
  assert.notEqual(R.createRun({ daily: '2026-10-24' }).seed, a.seed);
  assert.equal(R.deserialize(R.serialize(a)).daily, '2026-10-23');
  // the same choices give the same run (fights, rewards)
  const p1 = playRun(BOTS.sensible, { daily: '2026-10-23' }), p2 = playRun(BOTS.sensible, { daily: '2026-10-23' });
  assert.equal(R.serialize(p1), R.serialize(p2));
});

test('scoreRun: floors, kills, elites, the boss, and on a win 100 + HP left; no time', () => {
  const run = R.createRun({ seed: 'SC', neow: false });
  assert.equal(R.scoreRun(run), 0);
  Object.assign(run, { floor: 9 });
  Object.assign(run.stats, { kills: 12, elites: 2, bosses: 0 });
  assert.equal(R.scoreRun(run), 9 * 10 + 12 * 2 + 2 * 10);
  Object.assign(run, { floor: 16, won: true, over: true, hp: 41 });
  Object.assign(run.stats, { kills: 30, elites: 3, bosses: 1 });
  const b = R.scoreBreakdown(run);
  assert.equal(b.total, 160 + 60 + 30 + 50 + 100 + 41);
  assert.equal(b.total, R.scoreRun(run));
  assert.ok(b.lines.every(l => l.label && l.points > 0));
  assert.equal(R.runSummary(run).score.total, b.total);
});

test('profile.daily keeps the best score per day', () => {
  const p = M.createProfile();
  assert.deepEqual(p.daily, {});
  const daily = (score, date = '2026-10-23') => {
    const run = R.createRun({ daily: date, neow: false });
    Object.assign(run, { over: true, won: false, floor: score / 10 });
    return run;
  };
  let rec = M.recordRun(p, daily(50));
  assert.deepEqual(rec.daily, { date: '2026-10-23', score: 50, best: 50, newBest: true });
  rec = M.recordRun(p, daily(30));
  assert.deepEqual(rec.daily, { date: '2026-10-23', score: 30, best: 50, newBest: false });
  rec = M.recordRun(p, daily(80));
  assert.equal(p.daily['2026-10-23'], 80);
  M.recordRun(p, daily(10, '2026-10-24'));
  assert.deepEqual(p.daily, { '2026-10-23': 80, '2026-10-24': 10 });
  assert.equal(M.recordRun(p, R.createRun({ seed: 'NOTDAILY' })).daily, null);
  assert.deepEqual(M.loadProfile(JSON.parse(JSON.stringify(p))).daily, p.daily);
  assert.deepEqual(M.loadProfile({ daily: { bad: 3, '2026-10-01': 'x', '2026-10-02': 7 } }).daily, { '2026-10-02': 7 });
  assert.equal(p.runs.at(-1).score, 0, 'the run log has the score');
});

test('the sim steps down with infection (smoke: 40 runs at 0 and 5)', () => {
  const win = inf => { let w = 0; for (let i = 0; i < 40; i++) if (playRun(BOTS.sensible, { seed: `STEP-${i}`, infection: inf }).won) w++; return w; };
  assert.ok(win(5) < win(0));
});
