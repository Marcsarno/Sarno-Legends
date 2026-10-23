// Autoplay: the balance sim's sensible bot (tools/sim/bots.mjs) playing the real game through the app, so a whole run
// can be watched or played headless. Fights go through the same path as the player's input (fight.play / endTurn /
// potion, the director, the HUD); every other screen through the same app actions the screens call.
//   const bot = createAutoplay(app)   bot.start(speed = 2) / bot.stop()   bot.running
// The bot's card choice comes from a copy of the fight: its turn is played on the copy and the first card (or potion) it
// plays there is the one played for real, then it looks again once the director has landed that card.
// Run choices are the sim bot's too: rewards (everything, a card if it clears the bot's bar), its path, rest or upgrade,
// shopping, event choices, Medkits on the map; pickers ask the bot; the result screen stops it. The sim bots change the
// run directly, so those decisions are made on a copy of the run and then done here through the screens' own actions.
import * as R from '../game/run.js';
import * as SIM from '../../tools/sim/bots.mjs';
import { makeRng } from '../game/rng.js';

const { BOTS, cloneCombat, deckDpt } = SIM;
const BOT = BOTS.sensible;

export function createAutoplay(app) {
  let timer = 0, running = false, waitUntil = 0, lastFight = null, failed = new Set(), steps = 0;
  let shopping = null, cancelled = false;   // the purchases planned for this shop visit; an event picker was declined
  const rng = makeRng('autoplay');
  const ctx = () => ({ rng, run: app.run });
  const copy = run => R.deserialize(R.serialize(run));

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
    // a card asked for a choice: answer it the sim bot's way (through the fight, which closes the overlay)
    if (c.state.choice) {
      if (!f.director.idle()) return;
      const ch = c.state.choice;
      let uids = null;
      try { uids = SIM.chooseFor?.(c); } catch (e) { console.warn('[autoplay] chooseFor', e); }
      f.choose(uids || (ch.optional ? [] : ch.uids.slice(0, ch.n)));
      return;
    }
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

  /** The bot's shopping, as moves for the shop screen's buttons, in the order it bought. */
  function shopMoves(run) {
    const k = copy(run), ks = k.shop, start = k.stats.log.length;
    BOT.shop(k, ctx());
    const used = new Set(), moves = [];
    for (const e of k.stats.log.slice(start)) {
      if (e.t !== 'buy') continue;
      if (e.kind === 'removal') {
        const gone = run.deck.find(c => !k.deck.some(d => d.uid === c.uid));
        if (gone) moves.push({ kind: 'remove', uid: gone.uid });
        continue;
      }
      const list = { card: 'cards', relic: 'relics', potion: 'potions' }[e.kind];
      const i = ks[list].findIndex((it, j) => it.sold && !run.shop[list][j]?.sold && !used.has(list + j) && (it.card?.id ?? it.id) === e.id);
      if (i >= 0) { used.add(list + i); moves.push({ kind: e.kind, i }); }
    }
    return moves;
  }

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
          cancelled = false;
          // a Medkit when the bot would drink one
          const k = copy(run);
          BOT.mapPotions(k, ctx());
          const slot = run.potions.findIndex((id, i) => id && !k.potions[i]);
          if (slot >= 0) { a.potion?.(slot, 'use'); return pause(400); }
          const nodes = R.availableNodes(run);
          if (nodes.length) a.travel?.(BOT.path(run, nodes, ctx()));
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
            const k = copy(run);
            BOT.rest(k, ctx());
            const up = k.deck.find(c => c.up && !run.deck.find(d => d.uid === c.uid)?.up);
            if (up) a.upgrade?.(up.uid); else a.rest?.();
            return pause(300);
          }
          a.leave?.();
          return pause(500);
        }
        case 'shop': {
          const key = run.path.join('>');
          if (shopping?.key !== key) shopping = { key, moves: shopMoves(run) };
          const m = shopping.moves.shift();
          if (!m) { a.leave?.(); return pause(500); }
          if (m.kind === 'remove') a.remove?.(m.uid);
          else a[{ card: 'buyCard', relic: 'buyRelic', potion: 'buyPotion' }[m.kind]]?.(m.i);
          return pause(400);
        }
        case 'treasure': {
          if (!run.pending.taken) { a.open?.(); a.take?.(); return pause(300); }
          a.leave?.();
          return pause(500);
        }
        case 'event': {
          // (as the sim plays it: tools/sim/play.mjs eventStep)
          const p = run.pending;
          const leave = p.choices.findIndex(c => /^(Leave|Walk away)$/.test(c.label) && !c.disabled);
          if (p.picker) {
            let uid = BOT.pick(run, p.picker, ctx());
            if (uid == null && (p.picker.cancelable === false || leave < 0)) uid = p.picker.cards[0]?.uid;
            if (uid == null) cancelled = true;
            a.pickCard?.(uid ?? null);
            return pause(400);
          }
          let i = p.done ? 0 : cancelled && leave >= 0 ? leave : BOT.event(run, ctx());
          if (!p.done && (i < 0 || !p.choices[i] || p.choices[i].disabled)) i = leave >= 0 ? leave : p.choices.findIndex(c => !c.disabled);
          a.choose?.(Math.max(0, i));
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
