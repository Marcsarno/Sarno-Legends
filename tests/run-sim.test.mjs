// Balance sim smoke test (tools/sim): every bot plays whole runs without errors, deterministically, and the report
// reads them. The real numbers come from `node tools/sim/run.mjs --runs 300 --bot all` (docs/BALANCE.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOTS } from '../tools/sim/bots.mjs';
import { playRun } from '../tools/sim/play.mjs';
import { summarize, formatReport } from '../tools/sim/report.mjs';
import { serialize } from '../src/game/run.js';
import { recordRun, createProfile } from '../src/game/meta.js';

test('every bot finishes full runs; logs are consistent; the report reads them', () => {
  const by = {};
  for (const name of Object.keys(BOTS)) {
    const n = name === 'expert' ? 2 : 6;
    const runs = [];
    for (let i = 0; i < n; i++) {
      const run = playRun(BOTS[name], { seed: `SMOKE-${name}-${i}` });
      assert.ok(run.over, `${name} ${i}`);
      assert.ok(run.hp >= 0 && run.hp <= run.maxHp);
      const fights = run.stats.log.filter(e => e.t === 'fight');
      assert.ok(fights.length >= 1);
      for (const f of fights) assert.ok(f.hpAfter <= f.maxHp && f.damageTaken >= 0);
      if (run.won) assert.equal(fights.at(-1).encounter, 'shield_guard');
      else assert.equal(fights.at(-1).won, false);
      assert.ok(new Set(run.deck.map(c => c.uid)).size === run.deck.length, 'unique uids');
      recordRun(createProfile(), run);
      runs.push(run);
    }
    by[name] = summarize(runs);
    assert.equal(by[name].runs, n);
  }
  const md = formatReport(by);
  assert.match(md, /win rate/);
  assert.match(md, /per encounter/);
});

test('the sim is deterministic: same bot, same seed, same run', () => {
  for (const name of ['random', 'greedy', 'sensible']) {
    assert.equal(serialize(playRun(BOTS[name], { seed: 'DET' })), serialize(playRun(BOTS[name], { seed: 'DET' })));
  }
});

test('weapon loadouts play through', () => {
  for (const weapons of [{ marc: 'nail_bat', yola: 'shotgun' }, { marc: 'sledgehammer', yola: 'sawed_off' }, { marc: 'fire_axe' }]) {
    const run = playRun(BOTS.sensible, { seed: `WPN-${weapons.marc}`, weapons });
    assert.ok(run.over);
    assert.equal(run.weapons.marc, weapons.marc);
  }
});
