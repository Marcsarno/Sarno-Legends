// Plays whole act-1 runs headless: src/game/run.js for the run, the combat engine for every fight, a bot from
// bots.mjs for every decision. Pure ES module (no node built-ins).
//
//   const run = playRun(BOTS.sensible, { seed: 'S1', weapons: { marc: 'nail_bat' } })
//   run.stats.log has every fight ({ t: 'fight', encounter, room, hpBefore, hpAfter, damageTaken, turns, won }),
//   card offer ({ t: 'cards', offered, picked }), rest, buy, event and the death / victory entry.
// A fight that runs past maxTurns (a stall) is lost on purpose so a bad bot can't hang the sim.

import * as R from '../../src/game/run.js';
import { makeRng } from '../../src/game/rng.js';
import { deckDpt } from './bots.mjs';

export function playRun(bot, { seed = 'SIM', weapons, neow = true, maxTurns = 60, profile } = {}) {
  const run = R.createRun({ seed, weapons, neow, profile });
  const ctx = { rng: makeRng(`bot/${bot.name}/${seed}`), cancelled: false };
  for (let steps = 0; !run.over && steps < 3000; steps++) {
    switch (run.screen) {
      case 'neow': {
        const pk = run.pending.picker;
        if (pk) R.resolvePick(run, bot.pick(run, pk, ctx) ?? pk.cards[0].uid);
        else R.chooseNeow(run, bot.neow(run, ctx));
        break;
      }
      case 'map': {
        bot.mapPotions(run, ctx);
        ctx.cancelled = false;
        R.travel(run, bot.path(run, R.availableNodes(run), ctx));
        break;
      }
      case 'combat': fight(run, bot, ctx, maxTurns); break;
      case 'reward': bot.rewards(run, ctx); if (run.screen === 'reward') R.leaveRewards(run); break;
      case 'rest': bot.rest(run, ctx); if (run.screen === 'rest') R.leaveRest(run); break;
      case 'shop': bot.shop(run, ctx); if (run.screen === 'shop') R.leaveShop(run); break;
      case 'treasure': R.takeTreasure(run); R.leaveTreasure(run); break;
      case 'event': eventStep(run, bot, ctx); break;
      default: throw new Error(`sim stuck on screen ${run.screen}`);
    }
  }
  if (!run.over) throw new Error(`sim did not finish (seed ${seed}, screen ${run.screen})`);
  return run;
}

function eventStep(run, bot, ctx) {
  const p = run.pending;
  const leave = p.choices.findIndex(c => /^(Leave|Walk away)$/.test(c.label) && !c.disabled);
  if (p.picker) {
    let uid = bot.pick(run, p.picker, ctx);
    if (uid == null && (p.picker.cancelable === false || leave < 0)) uid = p.picker.cards[0]?.uid;
    if (uid == null) ctx.cancelled = true;
    R.eventPick(run, uid ?? null);
    return;
  }
  if (p.done) { R.chooseEvent(run, 0); return; }
  let i = ctx.cancelled && leave >= 0 ? leave : bot.event(run, ctx);
  if (i < 0 || !p.choices[i] || p.choices[i].disabled) i = leave >= 0 ? leave : p.choices.findIndex(c => !c.disabled);
  const r = R.chooseEvent(run, i);
  if (!r.ok) throw new Error(`event ${p.id}: choice ${i} failed (${r.reason})`);
}

/** One fight with the bot; the Combat is returned for inspection. */
export function fight(run, bot, ctx, maxTurns = 60) {
  const c = R.startCombat(run);
  const info = { dpt: deckDpt(run), rng: ctx.rng, run };
  let turns = 0;
  while (!c.over && turns < maxTurns) {
    bot.turn(c, info);
    if (!c.over) c.endTurn();
    c.takeEvents();
    turns++;
  }
  if (!c.over) c.forceLose();
  c.takeEvents();
  R.finishCombat(run, c);
  return c;
}
