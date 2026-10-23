#!/usr/bin/env node
// Balance sim CLI: plays full act-1 runs headless with a bot and prints the balance report (docs/BALANCE.md reads it).
//
//   node tools/sim/run.mjs --runs 300 --bot sensible          (bots: random, greedy, sensible, expert, all)
//   node tools/sim/run.mjs --runs 100 --bot all --weapons nail_bat,shotgun --seed X --json /tmp/out.json
// Seeds are `${seed}-${i}`, so a run can be replayed exactly (playRun(BOTS[bot], { seed })).

import { BOTS } from './bots.mjs';
import { playRun } from './play.mjs';
import { summarize, formatReport } from './report.mjs';
import { WEAPONS } from '../../src/game/content/weapons.js';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def; };
const runs = Number(opt('runs', 100));
const which = opt('bot', 'sensible');
const seed = opt('seed', 'BAL');
const weapons = {};
for (const id of String(opt('weapons', '')).split(',').filter(Boolean)) {
  if (!WEAPONS[id]) { console.error(`unknown weapon ${id}`); process.exit(1); }
  weapons[WEAPONS[id].hero] = id;
}
const bots = which === 'all' ? Object.keys(BOTS) : which.split(',');
for (const b of bots) if (!BOTS[b]) { console.error(`unknown bot ${b} (random, greedy, sensible, expert, all)`); process.exit(1); }

const byBot = {};
const raw = {};
for (const b of bots) {
  const t0 = Date.now();
  const list = [];
  for (let i = 0; i < runs; i++) {
    list.push(playRun(BOTS[b], { seed: `${seed}-${i}`, weapons }));
    if (!args.includes('--quiet') && (i + 1) % 50 === 0) process.stderr.write(`${b}: ${i + 1}/${runs}\n`);
  }
  byBot[b] = summarize(list);
  raw[b] = list.map(r => ({ seed: r.seed, won: r.won, floor: r.floor, log: r.stats.log.filter(e => e.t === 'fight') }));
  process.stderr.write(`${b}: ${runs} runs in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
}
console.log(`## Sim: ${runs} runs per bot, seed ${seed}, weapons ${JSON.stringify({ marc: 'wood_bat', yola: 'pistol', ...weapons })}\n`);
console.log(formatReport(byBot));
const json = opt('json', null);
if (json) writeFileSync(json, JSON.stringify({ byBot, raw }, null, 1));
