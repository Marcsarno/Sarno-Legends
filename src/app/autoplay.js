// Autoplay: the balance sim's sensible bot (tools/sim/bots.mjs) playing the real game through the app, so a whole run
// can be watched or played headless. Fights go through the same path as the player's input (fight.play / endTurn /
// potion, the director, the HUD); every other screen through the same app actions the screens call.
//   const bot = createAutoplay(app)   bot.start(speed = 2) / bot.stop()   bot.running
// The bot's card choice comes from a copy of the fight: its turn is played on the copy and the first card (or potion) it
// plays there is the one played for real, then it looks again once the director has landed that card.
// Run choices: rewards (everything, a card if it clears the bot's bar), the bot's path, rest under half HP else upgrade,
// shops are left, events take the first open choice, pickers ask the bot, the result screen stops it.
import * as R from '../game/run.js';
import { BOTS, cloneCombat, deckDpt, upgradeGain } from '../../tools/sim/bots.mjs';
import { makeRng } from '../game/rng.js';

const BOT = BOTS.sensible;

export function createAutoplay(app) {
  let timer = 0, running = false, waitUntil = 0, lastFight = null, failed = new Set(), steps = 0;
  const rng = makeRng('autoplay');

  function start(speed = 2) {
    stop();
    running = true;
    app.setSpeedOverride(speed);
    timer = setInterval(tick, 90);
    tick();
  }
  function stop() {
    running = false;
    clearInterval(timer); timer = 0;
  }

  // the bot's next move in a fight, read off a copy
  function nextMove(c) {
    const k = cloneCombat(c);
    let move = null;
    k.playCard = (uid, target) => { move ||= { kind: 'card', uid, target }; return { ok: false, reason: 'autoplay' }; };
    k.usePotion = (slot, target) => {
      if (!failed.has('p' + slot)) move ||= { kind: 'potion', slot, target };
      return { ok: false, reason: 'autoplay' };
    };
    try { BOT.turn(k, { dpt: deckDpt(app.run), rng, run: app.run }); } catch (e) { console.warn('[autoplay] bot', e); }
    return move || { kind: 'end' };
  }

  function fightStep(f) {
    if (f !== lastFight) { lastFight = f; failed = new Set(); }
    const c = f.combat;
    if (c.over || c.state.phase !== 'player') return;
    if (!f.director.canAcceptInput()) return;
    const m = nextMove(c);
    if (m.kind === 'card') {
      const r = f.play(m.uid, m.target ?? f.targets()[0]);
      if (!r.ok) f.endTurn();
    } else if (m.kind === 'potion') {
      const r = f.potion(m.slot, m.target ?? f.targets()[0], 'use');
      if (!r.ok) failed.add('p' + m.slot);
    } else {
      failed = new Set();
      f.endTurn();
    }
  }

  function act() { return app.mainScreen()?.ctx?.act || {}; }

  function tick() {
    if (!running || app.busy || performance.now() < waitUntil) return;
    steps++;
    try {
      const run = app.run;
      const screen = app.screen;
      if (screen === 'title') { app.newRun(); return pause(600); }
      if (screen === 'result') { stop(); return; }
      if (!run) return;
      if (screen === 'combat' && app.fight) return fightStep(app.fight);
      const a = act();
      switch (run.screen) {
        case 'neow': {
          const pk = run.pending.picker;
          const pickerOverlay = app.overlays.find(o => o.name === 'picker');
          if (pk && pickerOverlay) pickerOverlay.ctx.act.choose(BOT.pick(run, pk) ?? pk.cards[0]?.uid);
          else if (!pk) a.choose?.(BOT.neow(run));
          return pause(500);
        }
        case 'map': {
          const nodes = R.availableNodes(run);
          if (nodes.length) a.travel?.(BOT.path(run, nodes));
          return pause(500);
        }
        case 'reward': {
          const p = run.pending;
          const i = p.rewards.findIndex(r => !r.taken && r.kind !== 'cards' && !(r.kind === 'potion' && R.freeSlot(run) < 0));
          if (i >= 0) { a.take?.(i); app.refresh(); return pause(250); }
          const ci = p.rewards.findIndex(r => !r.taken && r.kind === 'cards');
          if (ci >= 0) {
            const r = p.rewards[ci];
            const uid = BOT.pick(run, { mode: 'pick', cards: r.cards, cancelable: true });
            if (uid) a.pickCard?.(ci, r.cards.findIndex(c => c.uid === uid)); else a.skip?.(ci);
            app.refresh();
            return pause(250);
          }
          a.done?.();
          return pause(500);
        }
        case 'rest': {
          if (!run.pending.rested) {
            let best = null, bg = 0;
            for (const c of run.deck) { if (!R.canUpgrade(c)) continue; const g = upgradeGain(c); if (g > bg) { bg = g; best = c; } }
            if (run.hp / run.maxHp < 0.5 || !best) a.rest?.(); else a.upgrade?.(best.uid);
            return pause(300);
          }
          a.leave?.();
          return pause(500);
        }
        case 'shop': a.leave?.(); return pause(500);
        case 'treasure': {
          if (!run.pending.taken) { a.open?.(); a.take?.(); return pause(300); }
          a.leave?.();
          return pause(500);
        }
        case 'event': {
          const p = run.pending;
          if (p.picker) {
            let uid = BOT.pick(run, p.picker);
            if (uid == null && p.picker.cancelable === false) uid = p.picker.cards[0]?.uid;
            a.pickCard?.(uid ?? null);
            return pause(400);
          }
          const i = p.done ? 0 : Math.max(0, p.choices.findIndex(c => !c.disabled));
          a.choose?.(i);
          return pause(400);
        }
        default: return;
      }
    } catch (e) {
      console.warn('[autoplay] step failed', e);
      pause(500);
    }
  }
  function pause(ms) { waitUntil = performance.now() + ms / Math.max(1, app.settings().speed); }

  return {
    start, stop,
    get running() { return running; },
    get steps() { return steps; },
  };
}
