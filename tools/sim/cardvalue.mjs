#!/usr/bin/env node
// Card value: how much one copy of each reward card is worth to the sensible bot. Every card is added to the starting
// deck in turn and the same seeds are played as a baseline without it, so the difference is the card (common random
// numbers keep the noise down). It reads the bot's in-fight play, not its draft taste, so it shows which cards the bot
// plays well and gives the tier list in bots.mjs (CARD_SCORE) a measured base.
//
//   node tools/sim/cardvalue.mjs --runs 200 --infection 5 [--cards tackle,dig_in] [--json out.json]
// Columns: win % and the change from the baseline, mean score (run.js scoreRun) and its change.

import { BOTS } from './bots.mjs';
import { playRun } from './play.mjs';
import { cardPool } from '../../src/game/content/cards.js';
import { scoreRun } from '../../src/game/run.js';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def; };
const runs = Number(opt('runs', 200));
const infection = Number(opt('infection', 5));
const seed = opt('seed', 'CV');
const bot = BOTS[opt('bot', 'sensible')];
const ids = opt('cards', null) ? opt('cards').split(',') : cardPool();

function measure(addCards) {
  let wins = 0, score = 0;
  for (let i = 0; i < runs; i++) {
    const run = playRun(bot, { seed: `${seed}-${i}`, infection, addCards, neow: false });
    if (run.won) wins++;
    score += scoreRun(run);
  }
  return { win: (wins / runs) * 100, score: score / runs };
}

const t0 = Date.now();
const base = measure([]);
const rows = [];
for (const id of ids) {
  const m = measure([id]);
  rows.push({ id, win: m.win, dWin: m.win - base.win, score: m.score, dScore: m.score - base.score });
  process.stderr.write(`${id} ${m.win.toFixed(1)} (${(m.win - base.win).toFixed(1)})\n`);
}
rows.sort((a, b) => b.dScore - a.dScore);
const r1 = x => (Math.round(x * 10) / 10).toFixed(1);
console.log(`## Card value: one copy added to the starter deck, ${runs} runs each, Infection ${infection}, seed ${seed}`);
console.log(`Baseline: win ${r1(base.win)}%, score ${r1(base.score)}\n`);
console.log('| card | win % | Δ win | score | Δ score |');
console.log('|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.id} | ${r1(r.win)} | ${r.dWin >= 0 ? '+' : ''}${r1(r.dWin)} | ${r1(r.score)} | ${r.dScore >= 0 ? '+' : ''}${r1(r.dScore)} |`);
process.stderr.write(`${ids.length + 1} x ${runs} runs in ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
const out = opt('json', null);
if (out) writeFileSync(out, JSON.stringify({ base, rows }, null, 1));
