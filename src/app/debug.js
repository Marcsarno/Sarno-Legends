// The debug / playtest API (BUILD_SPEC section 8) and the ?debug=1 overlay.
//   window.__SL = { state(), app, newRun(seed?, opts?), goto(screen, opts?), combat(encounterId?, opts?), play(handIndex,
//     targetIndex?), endTurn(), autoplay(on, speed?), setSpeed(x), win(), lose(), give({ relic, card, potion, gold }), seed }
// Every call that changes screens returns a promise that settles when the new screen is up. play / endTurn go through
// the same path as the player's input (the fight's play -> director -> HUD).
import * as R from '../game/run.js';
import { RELICS } from '../game/content/relics.js';
import { CARDS } from '../game/content/cards.js';
import { POTIONS } from '../game/content/potions.js';
import { ENCOUNTERS } from '../game/content/encounters.js';
import { createAutoplay } from './autoplay.js';

export function installDebug(app) {
  const bot = createAutoplay(app);
  const ensureRun = () => { if (!app.run || app.run.over) throw new Error('No run in progress: call __SL.newRun() first'); return app.run; };
  const fight = () => { if (!app.fight) throw new Error('Not in a fight'); return app.fight; };

  const SL = {
    app,
    get seed() { return app.run?.seed ?? null; },
    state() {
      const run = app.run, f = app.fight, c = f?.combat;
      return {
        screen: app.screen, busy: app.busy, overlays: app.overlays.map(o => o.name),
        profile: { scrap: app.profile.scrap, unlocked: app.profile.unlocked.slice(), equipped: { ...app.profile.equipped }, runs: app.profile.stats.runs },
        run: run ? { seed: run.seed, screen: run.screen, floor: run.floor, hp: run.hp, maxHp: run.maxHp, gold: run.gold, deck: run.deck.length,
          relics: run.relics.map(r => r.id), potions: run.potions.slice(), over: run.over, won: run.won, node: run.node, pending: run.pending?.kind || null } : null,
        combat: c ? { encounter: c.state.encounter, turn: c.state.turn, phase: c.state.phase, energy: c.state.energy, over: c.over, won: c.won,
          party: { hp: c.state.party.hp, block: c.state.party.block, statuses: { ...c.state.party.statuses } },
          hand: c.state.hand.map(k => k.id + (k.up ? '+' : '')), handUids: f.handUids(),
          enemies: c.state.enemies.map(e => ({ uid: e.uid, id: e.id, hp: e.hp, block: e.block, alive: e.alive, intent: e.intent?.type || null, statuses: { ...e.statuses } })),
          directorIdle: f.director.idle(), canAct: f.director.canAcceptInput() } : null,
        autoplay: bot.running, speed: app.settings().speed,
      };
    },
    newRun(seed, opts = {}) { return app.newRun({ seed: seed ?? undefined, ...opts }); },
    goto(screen, opts = {}) {
      switch (screen) {
        case 'title': return app.toTitle();
        case 'armory': return app.toArmory();
        case 'settings': app.openSettings(); return Promise.resolve();
        case 'deck': ensureRun(); app.openDeck(); return Promise.resolve();
        case 'intro': return app.newRun({ seed: opts.seed, neow: true });
        case 'map': {
          const run = app.run && !app.run.over ? app.run : null;
          if (!run) return app.newRun({ seed: opts.seed, neow: false });
          if (run.screen !== 'map') { run.screen = 'map'; run.pending = null; run.shop = null; }   // (debug: leave the room as it is)
          return app.showRun();
        }
        case 'combat': case 'fight': return app.forceRoom('fight', { encounter: opts.encounter });
        case 'elite': return app.forceRoom('elite', { encounter: opts.encounter || 'big_walker' });
        case 'boss': return app.forceRoom('boss', { encounter: 'shield_guard' });
        case 'rest': case 'shop': case 'treasure': case 'unknown': return app.forceRoom(screen, opts);
        case 'event': return app.forceRoom('event', { event: opts.event });
        default: throw new Error('Unknown screen: ' + screen);
      }
    },
    combat(encounterId, opts = {}) {
      if (encounterId && !ENCOUNTERS[encounterId]) throw new Error('Unknown encounter: ' + encounterId);
      return app.forceRoom('fight', { encounter: encounterId || 'shambler_solo', ...opts });
    },
    play(handIndex = 0, targetIndex = 0) {
      const f = fight();
      const uid = f.handUids()[handIndex] ?? f.combat.state.hand[handIndex]?.uid;
      if (!uid) return { ok: false, reason: 'no card' };
      return f.play(uid, f.targets()[targetIndex] ?? f.targets()[0]);
    },
    endTurn() { return fight().endTurn(); },
    autoplay(on = true, speed = 2) { if (on) bot.start(speed); else { bot.stop(); app.setSpeedOverride(null); } return bot.running; },
    setSpeed(x) { app.setSpeedOverride(x); return app.settings().speed; },
    win() { fight().win(); },
    lose() { fight().lose(); },
    give({ relic, card, potion, gold } = {}) {
      const run = ensureRun();
      if (relic) { if (!RELICS[relic]) throw new Error('Unknown relic ' + relic); R.addRelic(run, relic, 'debug'); }
      if (card) { if (!CARDS[String(card).replace('+', '')]) throw new Error('Unknown card ' + card); R.addCard(run, String(card).replace('+', ''), String(card).endsWith('+'), 'debug'); }
      if (potion) {
        if (!POTIONS[potion]) throw new Error('Unknown potion ' + potion);
        const slot = R.addPotion(run, potion);
        const c = app.fight?.combat;
        if (c && slot >= 0 && !c.state.potions[slot]) { c.state.potions[slot] = potion; app.fight.ui.sync?.(); }
      }
      if (gold) R.gainGold(run, Number(gold));
      app.saveRun(); app.refresh();
      return SL.state().run;
    },
    bot,
  };
  window.__SL = SL;
  if (app.params.get('debug') === '1') debugOverlay(app);
  if (app.params.get('autoplay')) app.go(() => {}).then(() => bot.start(Number(app.params.get('autoplay')) || 2));
  return SL;
}

/** ?debug=1: frames per second and where the game is, top-left. */
function debugOverlay(app) {
  const el = document.createElement('div');
  el.className = 'sl-debug';
  document.body.append(el);
  let frames = 0, last = performance.now(), fps = 0;
  const count = () => { frames++; requestAnimationFrame(count); };
  requestAnimationFrame(count);
  const loop = () => {
    const now = performance.now();
    if (now - last >= 500) { fps = frames * 1000 / (now - last); frames = 0; last = now; }
    const s = window.__SL.state();
    const c = s.combat;
    el.textContent = [
      `${fps.toFixed(0)} fps  ${app.screen || '-'}${s.overlays.length ? ' +' + s.overlays.join('+') : ''}  x${s.speed}${s.autoplay ? ' AUTO' : ''}`,
      s.run ? `seed ${s.run.seed}  floor ${s.run.floor}  ${s.run.hp}/${s.run.maxHp} HP  ${s.run.gold} sup  deck ${s.run.deck}` : 'no run',
      c ? `${c.encounter} t${c.turn} ${c.phase} E${c.energy}  ${c.enemies.map(e => `${e.id}:${e.alive ? e.hp : 'x'}`).join(' ')}  ${c.directorIdle ? 'idle' : 'busy'}` : '',
    ].filter(Boolean).join('\n');
    setTimeout(loop, 250);
  };
  loop();
}
