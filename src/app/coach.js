// The first-run coach: short, one-time callouts that point at the real UI the first time each thing matters. Never a wall
// of text, never modal: one bubble at a time (src/ui/callout.js), a tap on it is "Got it", "Skip tips" turns them all
// off. What has been shown is remembered in the profile (profile.coach = { on, seen: [ids] }), so each tip shows once
// per profile, whoever is holding the phone; Settings > Tips switches them back on, How to Play can replay them.
//   const coach = createCoach(app)
//   coach.screen(name, ctx)   a screen just mounted (app.js mountMain / the reward over the battle / 'combat')
//   coach.fight(fight|null)   a fight opened (its director's events drive the fight tips) or closed
//   coach.on / coach.setOn(bool) / coach.reset()   (Settings, How to Play)        coach.destroy()
// The fight tips, in the order they usually come: drag a card -> what the zombies will do -> Block -> End Turn ->
// Staggered (when Marc's stagger card is in hand); an elite fight explains elites if the map didn't. Between fights:
// the map, HP carrying over (the second map), elites (an elite you can walk into), the first reward, rest and shop.
// Off for ?shot= scenes (add &tips=1 to see them) and while the autoplay bot plays.
import { createCallout } from '../ui/callout.js';
import { cardView } from '../game/content/cards.js';

const TIPS = {
  map: { title: 'Tap a glowing room to go there', sub: 'Paths only lead up. The boss waits at the top.', side: 'right', tapAway: true },
  elite: { title: 'Elites are tough, but drop a relic', sub: 'A relic helps for the rest of the run.', side: 'right', tapAway: true },
  hp: { title: 'Your HP carries from room to room', sub: 'Yola’s Nurse’s Kit heals 6 after each fight. Rest sites heal more.', side: 'bottom', tapAway: true },
  drag: { title: 'Drag a card up to play it', sub: 'Or tap it, then tap it again. Each card costs the energy in its corner.', side: 'top', ring: false, swipe: true },
  intent: { title: 'Zombies show what they’ll do next turn', sub: 'The number is the damage they will deal to you.', side: 'bottom' },
  block: { title: 'Block soaks damage until your next turn', sub: 'Plan it against the damage the zombies show.', side: 'top' },
  endturn: { title: 'End Turn when you’re out of energy', sub: 'Then the zombies act. You get 3 fresh energy and 5 new cards.', side: 'top' },
  stagger: { title: 'Staggered zombies take 50% more damage', sub: 'Marc staggers, Yola cashes in.', side: 'top' },
  elite_fight: { title: 'Elites are tough, but drop a relic', sub: 'Spend your best cards here.', side: 'bottom' },
  reward: { title: 'Take what you like', sub: 'A new card is optional: a small deck draws its best cards more often.', side: 'auto', tapAway: true },
  rest: { title: 'Rest to heal, or Patch Up a card', sub: 'You only get one, so pick what you need most.', side: 'auto', tapAway: true },
  shop: { title: 'Spend your supplies here', sub: 'Paying to remove a weak card makes the deck stronger too.', side: 'auto', tapAway: true },
};
export const TIP_IDS = Object.keys(TIPS);

const $ = sel => document.querySelector(sel);
const shown = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight; };

export function createCoach(app) {
  const disabled = (!!app.params?.get('shot') && !app.params.get('tips')) || app.params?.get('tips') === '0';
  const data = () => {
    const p = app.profile;
    if (!p.coach || typeof p.coach !== 'object') p.coach = { on: true, seen: [] };
    if (!Array.isArray(p.coach.seen)) p.coach.seen = [];
    return p.coach;
  };
  const seen = id => data().seen.includes(id);
  const markSeen = id => { if (seen(id)) return; data().seen.push(id); app.saveProfile?.(); };

  const callout = createCallout({
    onGotIt: () => close(true),
    onSkip: () => { setOn(false); app.audio?.ui?.('close'); },
  });

  // where we are
  const S = { screen: null, ctx: null, t0: 0, fight: null, unsub: null, active: null, shownAt: 0, closedAt: 0, perScreen: 0,
    turnAt: 0, played: 0, blockGained: false, phase: null };
  let timer = 0, tapUnbind = null;

  const now = () => performance.now();
  const enabled = () => !disabled && data().on !== false;

  // ---------------------------------------------------------------- showing and closing

  function open(id, target) {
    const t = TIPS[id];
    S.active = { id, ...t, target };
    S.shownAt = now();
    S.perScreen++;
    markSeen(id);
    callout.show({ id, title: t.title, sub: t.sub, side: t.side || 'auto', ring: t.ring !== false, swipe: !!t.swipe, target });
    if (t.tapAway) {
      // screens: any tap elsewhere (after a moment to read) closes it; the tap still does its job
      const fn = e => { if (now() - S.shownAt > 900 && !e.target.closest?.('.coach__bubble')) close(false); };
      addEventListener('pointerdown', fn, true);
      tapUnbind = () => removeEventListener('pointerdown', fn, true);
    }
  }

  function close() {
    tapUnbind?.(); tapUnbind = null;
    if (!S.active) { callout.hide(); return; }
    S.active = null;
    S.closedAt = now();
    callout.hide();
  }

  // ---------------------------------------------------------------- what is going on right now

  function blocked() {
    if (app.busy) return true;
    if (app.overlays?.length) return true;                                // settings, deck, map view, picker
    if ($('.pv, .rw-pick, .sh-zoom, .rs-pickhost, .sl-err')) return true;   // pile viewer, card pick, shop zoom, a picker
    if (window.__SL?.bot?.running) return true;
    return false;
  }

  function fightInfo() {
    const f = S.fight;
    if (!f || app.fight !== f) return null;
    const M = f.ui?.model;
    if (!M) return null;
    return { f, M, C: f.combat, hand: f.ui.hand, ready: M.phase === 'player' && !M.over && f.director.canAcceptInput() && now() - S.turnAt > 1300 };
  }

  const handEl = uid => S.fight?.ui?.hand?.elOf?.(uid) || null;
  function handCenter() {
    const els = [...document.querySelectorAll('.hand-card:not(.hand-card--out)')].filter(shown);
    if (!els.length) return null;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const el of els) { const q = el.getBoundingClientRect(); l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); }
    const w = Math.min(r - l, 160);
    return { left: (l + r) / 2 - w / 2, right: (l + r) / 2 + w / 2, top: t, bottom: Math.min(b, innerHeight), width: w, height: Math.min(b, innerHeight) - t };
  }
  function intentTarget(fi) {
    const list = [...fi.M.enemies.values()].filter(r => r.alive && r.intent);
    const pick = list.find(r => r.intent.damage != null) || list[0];
    if (!pick) return null;
    const el = pick.intentEl?.querySelector('.intent__inner');
    return el && !pick.intentEl.classList.contains('intent--spent') ? el : null;
  }
  function staggerCard(fi) {
    for (const uid of fi.M.hand) {
      const inst = fi.C.findCard?.(uid);
      if (!inst) continue;
      const v = cardView(inst);
      if (v.hero === 'marc' && v.effects.some(e => e.op === 'apply' && e.status === 'vulnerable')) return uid;
    }
    return null;
  }

  // ---------------------------------------------------------------- the rules, checked a few times a second

  function candidate() {
    const since = now() - S.t0;
    const scr = S.screen;
    if (scr === 'map' && !S.ctx?.viewOnly && S.perScreen < 2) {
      const run = app.run;
      const open = [...document.querySelectorAll('.scr--map:not(.scr--leaving) .map-node--open')];
      if (!run || !open.length || since < (run.path.length ? 900 : 2700) || $('.map--travelling')) return null;
      const elite = open.find(el => el.classList.contains('map-node--elite'));
      if (elite && !seen('elite') && !seen('elite_fight')) return ['elite', () => elite];
      if (!seen('map')) return ['map', () => $('.scr--map:not(.scr--leaving) .map-node--open')];
      if (run.path.length >= 1 && !seen('hp')) return ['hp', () => $('.scr--map:not(.scr--leaving) .tb__hp')];
      return null;
    }
    if (scr === 'reward' && !seen('reward') && since > 1600 && S.perScreen < 1) {
      const row = $('.scr--reward .rw-row--cards') || $('.scr--reward .rw-list');
      return row && shown(row) ? ['reward', () => $('.scr--reward .rw-row--cards') || $('.scr--reward .rw-list')] : null;
    }
    if (scr === 'rest' && !seen('rest') && since > 1400 && S.perScreen < 1) {
      const el = $('.scr--rest .rs-choices');
      return el && shown(el) ? ['rest', () => $('.scr--rest .rs-choices')] : null;
    }
    if (scr === 'shop' && !seen('shop') && since > 1400 && S.perScreen < 1) {
      const el = $('.scr--shop .sh-service') || $('.scr--shop .sh-cards');
      return el && shown(el) ? ['shop', () => $('.scr--shop .sh-service') || $('.scr--shop .sh-cards')] : null;
    }
    if (scr === 'combat') {
      const fi = fightInfo();
      if (!fi || !fi.ready || fi.hand.busy) return null;
      const pend = S.fight.pending || {};
      if ((pend.elite || pend.room === 'elite') && !seen('elite_fight') && !seen('elite')) {
        const el = [...fi.M.enemies.values()].find(r => r.alive && r.tier === 'elite');
        if (el) return ['elite_fight', () => el.root.querySelector('.hpbar')];
      }
      if (!seen('drag') && fi.M.hand.length && document.querySelector('.hand-card.card--playable')) return ['drag', handCenter];
      if (!seen('intent') && seen('drag') && S.played > 0) { const t = intentTarget(fi); if (t) return ['intent', () => intentTarget(fightInfo() || fi)]; }
      if (!seen('block') && S.blockGained && fi.M.party.block > 0) return ['block', () => fi.f.ui.el.querySelector('.ehud--party .ehud__barrow')];
      if (!seen('endturn') && seen('drag') && $('.endturn.endturn--glow:not(:disabled)')) return ['endturn', () => $('.endturn')];
      if (!seen('stagger') && seen('drag')) { const uid = staggerCard(fi); if (uid && handEl(uid)) return ['stagger', () => handEl(uid)]; }
    }
    return null;
  }

  function tick() {
    if (!enabled()) { if (S.active) close(); return; }
    const isBlocked = blocked();
    if (S.active) {
      // hide while something sits on top (a pile viewer, settings), come back after
      callout.el.style.visibility = isBlocked ? 'hidden' : '';
      const fi = S.screen === 'combat' ? fightInfo() : null;
      callout.quiet(!!fi?.hand?.busy);
      return;
    }
    callout.el.style.visibility = '';
    if (isBlocked || now() - S.closedAt < 700) return;
    const c = candidate();
    if (c) open(c[0], c[1]);
  }

  // ---------------------------------------------------------------- fight events

  function onEvent(e) {
    const id = S.active?.id;
    switch (e.t) {
      case 'turn_start':
        S.phase = e.side;
        if (e.side === 'player') S.turnAt = now();
        else if (id && ['drag', 'intent', 'block', 'endturn', 'stagger', 'elite_fight'].includes(id)) close();
        break;
      case 'card_played':
        S.played++;
        if (id === 'drag') close();
        else if (id && now() - S.shownAt > 2600 && ['intent', 'block', 'stagger', 'elite_fight'].includes(id)) close();
        break;
      case 'block':
        if (e.target === 'party' && e.block > 0) S.blockGained = true;
        break;
      case 'combat_end':
        if (id) close();
        break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- the app's hooks

  function screen(name, ctx = null) {
    if (S.screen !== name || S.ctx !== ctx) { close(); S.perScreen = 0; }
    S.screen = name; S.ctx = ctx; S.t0 = now();
  }

  function fight(f) {
    S.unsub?.(); S.unsub = null;
    if (S.fight && S.fight !== f && S.active && S.screen === 'combat') close();
    S.fight = f || null;
    S.played = 0; S.blockGained = false; S.turnAt = now();
    if (f) S.unsub = f.director.on('event', onEvent);
  }

  function setOn(on) {
    data().on = !!on;
    app.saveProfile?.();
    if (!on) close();
  }

  function reset() {
    data().seen = [];
    data().on = true;
    app.saveProfile?.();
    S.closedAt = 0; S.perScreen = 0; S.t0 = now();
  }

  if (!disabled) timer = setInterval(tick, 250);

  return {
    screen, fight, setOn, reset,
    get on() { return data().on !== false; },
    get active() { return S.active?.id || null; },
    seen: () => data().seen.slice(),
    destroy() { clearInterval(timer); close(); S.unsub?.(); callout.destroy(); },
  };
}
