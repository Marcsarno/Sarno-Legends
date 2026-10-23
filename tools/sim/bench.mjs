#!/usr/bin/env node
// Encounter bench: every encounter fought with the starter deck (or a given deck) at full HP by each bot, many seeds.
// Separates "how hard is this fight" from "how strong has the deck got by then" (the full-run sim mixes both).
//
//   node tools/sim/bench.mjs --fights 50 --bot sensible,greedy [--weapons crowbar,shotgun] [--enc horde,big_walker]

import { BOTS, deckDpt } from './bots.mjs';
import { ENCOUNTERS } from '../../src/game/content/encounters.js';
import { WEAPONS } from '../../src/game/content/weapons.js';
import { createRun, startCombat } from '../../src/game/run.js';
import { makeRng } from '../../src/game/rng.js';
import { pct } from './report.mjs';

/** Fight one encounter with a fresh starter run; returns the combat result. */
export function benchFight(bot, encounter, { seed = 'B', weapons, hp = 80, deck, relics } = {}) {
  const run = createRun({ seed, weapons, neow: false });
  run.hp = hp;
  if (deck) run.deck = deck;
  if (relics) run.relics = relics;
  run.screen = 'combat';
  run.pending = { kind: 'combat', room: 'fight', encounter, seed: `bench/${seed}/${encounter}` };
  const c = startCombat(run);
  const info = { dpt: deckDpt(run), rng: makeRng(`bench/${seed}`), run };
  let turns = 0;
  while (!c.over && turns < 60) { bot.turn(c, info); if (!c.over) c.endTurn(); c.takeEvents(); turns++; }
  if (!c.over) c.forceLose();
  return c.result();
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
  const N = Number(opt('fights', 40));
  const bots = String(opt('bot', 'sensible,greedy')).split(',');
  const weapons = {};
  for (const id of String(opt('weapons', '')).split(',').filter(Boolean)) weapons[WEAPONS[id].hero] = id;
  const encs = opt('enc', null)?.split(',') || Object.keys(ENCOUNTERS);
  console.log(`| encounter | ${bots.map(b => `${b} HP lost mean / p90 / win% / turns`).join(' | ')} |`);
  console.log(`|---|${bots.map(() => '---|').join('')}`);
  for (const enc of encs) {
    const cells = bots.map(b => {
      const lost = [], turns = []; let wins = 0;
      for (let i = 0; i < N; i++) {
        const r = benchFight(BOTS[b], enc, { seed: `${enc}-${i}`, weapons });
        lost.push(r.damageTaken); turns.push(r.turns); if (r.won) wins++;
      }
      const m = lost.reduce((a, x) => a + x, 0) / N;
      return `${m.toFixed(1)} / ${pct(lost, 0.9)} / ${Math.round(wins / N * 100)} / ${(turns.reduce((a, x) => a + x, 0) / N).toFixed(1)}`;
    });
    console.log(`| ${enc} | ${cells.join(' | ')} |`);
  }
}
