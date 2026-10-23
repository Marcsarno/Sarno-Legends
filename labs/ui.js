// UI lab (port 5183): the combat HUD on its own, driving the REAL engine (src/game/combat.js) with no 3D.
// A fake stage (painted gradient + silhouettes at the battle camera's projected slots) implements project()/pick(),
// and a small timed "director" replays the engine's events into ui.onEvent() so numbers, intents and banners land
// with roughly the real pacing. Play it: drag cards up (or click / tap), E ends the turn.
// URL options:
//   ?enc=horde|shambler_solo|big_walker|orderlies|shield_guard|...   ?seed=abc   ?hp=50   ?speed=1.5
//   ?cards=headshot,wild_swing   extra cards in the deck   ?relics=pager,tally_marks   ?potions=medkit,flashbang
//   ?bat=nail_bat&gun=shotgun   weapons      ?sheet=icons | ?sheet=cards&size=reward   reference sheets
//   ?shots=1   hide the lab buttons (screenshots)
// window.__lab = { ui, combat, play(handIndex, enemyIndex), endTurn(), cardRect(i), enemyPoint(i) } for Playwright.
import '../src/ui/styles/base.css';
import { createCombat } from '../src/game/combat.js';
import { CARDS, makeStarterDeck, makeCard } from '../src/game/content/cards.js';
import { ENEMIES } from '../src/game/content/enemies.js';
import { setSpeed } from '../src/ui/tween.js';
import { createCombatUI } from '../src/ui/hud.js';
import { cardEl } from '../src/ui/card.js';
import { icon, iconNames } from '../src/ui/icons.js';
import { h } from '../src/ui/dom.js';

const Q = new URLSearchParams(location.search);
const uiRoot = document.getElementById('ui');
if (Q.has('shots')) document.body.classList.add('shots');

// ---------------------------------------------------------------- the fake stage

// screen fractions of the battle camera's slots (render/camera.js projected at 16:9 and at phone 2.16:1)
const FR = {
  wide: { marc: [.288, .74, .318], yola: [.099, .681, .333], e: [[.631, .74], [.771, .71], [.939, .743], [.669, .643], [.801, .641]], boss: [.753, .71] },
  phone: { marc: [.326, .74, .318], yola: [.17, .682, .332], e: [[.608, .74], [.723, .711], [.861, .744], [.639, .643], [.748, .641]], boss: [.709, .711] },
};
function frac(key, i) {
  const a = innerWidth / innerHeight, t = Math.min(1, Math.max(0, (a - 16 / 9) / (2.164 - 16 / 9)));
  const A = key === 'e' ? FR.wide.e[i] : FR.wide[key], B = key === 'e' ? FR.phone.e[i] : FR.phone[key];
  return A.map((v, k) => v + (B[k] - v) * t);
}

function makeFakeStage(combat) {
  const host = document.getElementById('fake-stage');
  const actors = new Map();
  const vh = () => innerHeight, vw = () => innerWidth;
  const headH = 0.42;                       // body height as a fraction of the screen (feet .74 -> head .32)
  function spot(id) {
    if (id === 'marc' || id === 'yola') { const f = frac(id); return { x: f[0] * vw(), feet: f[1] * vh(), head: f[2] * vh(), w: (f[1] - f[2]) * vh() * 0.42 }; }
    const e = combat.state.enemies.find(x => x.uid === id);
    if (!e) return null;
    const solo = combat.state.enemies.length === 1 && e.size === 'large';
    const f = solo ? frac('boss') : frac('e', e.slot % 5);
    const depth = f[1] < 0.7 ? 0.9 : 1;
    const hh = headH * vh() * depth * (ENEMIES[e.id]?.scale || 1) * (e.size === 'small' ? 0.92 : 1);
    return { x: f[0] * vw(), feet: f[1] * vh(), head: f[1] * vh() - hh, w: hh * 0.42 };
  }
  function draw() {
    for (const [id, a] of actors) {
      const s = spot(id);
      if (!s) continue;
      a.style.left = s.x + 'px'; a.style.top = s.feet + 'px';
      a.style.width = s.w * 1.6 + 'px'; a.style.height = (s.feet - s.head) + 'px';
    }
  }
  function add(id, kind) {
    const a = h('div.fake-actor', { html: silhouette(kind) });
    host.append(a);
    actors.set(id, a);
    draw();
  }
  add('yola', 'yola'); add('marc', 'marc');
  for (const e of combat.state.enemies) add(e.uid, e.size === 'large' ? 'big' : e.size === 'small' ? 'small' : 'zombie');
  addEventListener('resize', draw);
  return {
    actors,
    slots: null,
    project(p) { return { x: p.x, y: p.y, visible: true }; },
    anchor(id, where) {
      if (id === 'party') { const m = spot('marc'), y = spot('yola'); return { x: (m.x + y.x) / 2, y: where === 'head' ? Math.min(m.head, y.head) : Math.max(m.feet, y.feet), visible: true }; }
      const s = spot(id);
      return s ? { x: s.x, y: where === 'head' ? s.head : s.feet, visible: true } : null;
    },
    pick(x, y) {
      for (const e of combat.state.enemies) {
        if (!e.alive) continue;
        const s = spot(e.uid);
        if (s && Math.abs(x - s.x) < s.w * 0.75 && y > s.head && y < s.feet) return e.uid;
      }
      for (const id of ['marc', 'yola']) { const s = spot(id); if (Math.abs(x - s.x) < s.w * 0.7 && y > s.head && y < s.feet) return 'party'; }
      return null;
    },
    hit(id) { const a = actors.get(id); if (a) { a.classList.remove('hit'); void a.offsetWidth; a.classList.add('hit'); } },
    die(id) { actors.get(id)?.classList.add('dead'); },
    revive(id) { actors.get(id)?.classList.remove('dead'); },
  };
}

// painted-looking stand-in bodies (rim-lit silhouettes) so the HUD reads against something body-shaped
function silhouette(kind) {
  const C = { marc: ['#4a1e18', '#ff8a6a'], yola: ['#163a38', '#7fe0d4'], zombie: ['#2a3326', '#b8d49a'], small: ['#2c2f28', '#c9d6a8'], big: ['#30271f', '#e8b48a'] }[kind];
  const lean = kind === 'marc' || kind === 'yola' ? 1 : -1;
  const hunch = kind === 'zombie' || kind === 'small' || kind === 'big' ? 1 : 0;
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  const body = `M50 4 a10 11 0 1 1 -0.1 0 z
    M36 26 Q50 ${20 + hunch * 4} 64 26 L${70 + hunch * 4} 58 Q66 62 62 58 L60 46 L60 62 Q62 80 60 98 L54 98 L50 70 L46 98 L40 98 Q38 80 40 62 L40 46 L38 58 Q34 62 ${30 - hunch * 4} 58 Z`;
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><defs>
    <linearGradient id="${id}" x1="${lean > 0 ? 1 : 0}" y1="0" x2="${lean > 0 ? 0 : 1}" y2="0"><stop offset="0" stop-color="${C[1]}" stop-opacity=".95"/><stop offset=".22" stop-color="${C[0]}"/><stop offset="1" stop-color="#0b0f0f"/></linearGradient>
    <radialGradient id="${id}s"><stop offset="0" stop-color="#000" stop-opacity=".6"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="50" cy="99" rx="30" ry="3.5" fill="url(#${id}s)"/>
    <g transform="${hunch ? 'rotate(' + (6 * lean) + ' 50 98)' : ''}"><path d="${body}" fill="url(#${id})" stroke="${C[1]}" stroke-opacity=".35" stroke-width=".6"/></g></svg>`;
}

// ---------------------------------------------------------------- a tiny timed director

function makeDirector(ui, stage) {
  const queue = [];
  let busy = false, speed = Number(Q.get('speed') || 1);
  const pace = { card_played: 90, attack: 230, damage: 140, death: 260, turn_start: 520, enemy_move: 330, block: 120, heal: 160, status: 90, combat_start: 900, shuffle: 260, draw: 60, discard: 60 };
  async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const e = queue.shift();
      if (e.t === 'turn_start' && e.side === 'player') ui.setInputEnabled(true);
      ui.onEvent(e);
      if (e.t === 'damage' && e.target !== 'party') { stage.hit(e.target); ui.setInputEnabled(true); }
      if (e.t === 'death') stage.die(e.target);
      if (e.t === 'revive') stage.revive(e.uid);
      if (e.t === 'combat_end') ui.setInputEnabled(false);
      const d = (pace[e.t] ?? 30) / speed;
      if (d > 0) await new Promise(r => setTimeout(r, d));
    }
    busy = false;
    ui.setInputEnabled(true);
  }
  return {
    push(events, { card = false } = {}) {
      if (card && events.some(e => e.t === 'damage')) ui.setInputEnabled(false);
      queue.push(...events); pump();
    },
    idle: () => !busy && !queue.length,
  };
}

// ---------------------------------------------------------------- the fight

function fight() {
  const seed = Q.get('seed') || 'ui-lab';
  setSpeed(Number(Q.get('speed') || 1));
  const weapons = { marc: Q.get('bat') || 'wood_bat', yola: Q.get('gun') || 'pistol' };
  const deck = makeStarterDeck(weapons);
  const extra = (Q.get('cards') ?? 'wild_swing,headshot,hold_the_line,adrenaline_shot').split(',').filter(Boolean);
  for (const id of extra) if (CARDS[id]) deck.push(makeCard(id.replace('+', ''), id.endsWith('+'), deck));
  const run = {
    version: 1, seed, act: 1, floor: Number(Q.get('floor') || 4),
    hp: Number(Q.get('hp') || 62), maxHp: 80, gold: 137,
    deck, weapons,
    relics: ['nurses_kit', ...(Q.get('relics') ?? 'pager,tally_marks').split(',').filter(Boolean)].map(id => ({ id, counter: id === 'tally_marks' ? 6 : 0 })),
    potions: (Q.get('potions') ?? 'medkit,flashbang,').split(',').map(x => x || null).slice(0, 3),
  };
  while (run.potions.length < 3) run.potions.push(null);
  const combat = createCombat({ run, encounter: Q.get('enc') || 'horde', rng: seed });
  combat.start();                         // events wait in the engine until the director takes them
  if (Q.get('hand')) forceHand(combat, Q.get('hand').split(','));
  const stage = makeFakeStage(combat);
  let director;
  const ui = createCombatUI({
    root: uiRoot, stage, getRun: () => run, combat,
    anchor: (id, where) => stage.anchor(id, where),
    autoNumbers: true,
    onPlay(uid, t) { const r = combat.playCard(uid, t); if (!r.ok) console.warn('play failed', r); director.push(combat.takeEvents(), { card: true }); },
    onEndTurn() { combat.endTurn(); director.push(combat.takeEvents()); },
    onPotion(slot, t, action) {
      if (action === 'discard') { combat.discardPotion(slot); return; }
      combat.usePotion(slot, t); director.push(combat.takeEvents());
    },
    onOpenDeck() { ui.toast('Deck view: screens module'); },
    onOpenMap() { ui.toast('Map: screens module'); },
    onSettings() { ui.toast('Settings: screens module'); },
  });
  director = makeDirector(ui, stage);
  director.push(combat.takeEvents());

  window.__lab = {
    ui, combat, run, director, stage,
    play(i, e = 0) { const c = combat.state.hand[i]; const t = combat.state.enemies.filter(x => x.alive)[e]; return ui.hand && c ? (combat.playCard(c.uid, t?.uid), director.push(combat.takeEvents(), { card: true })) : null; },
    endTurn() { combat.endTurn(); director.push(combat.takeEvents()); },
    cardRect(i) { const uid = ui.hand.uids()[i]; const el = ui.hand.elOf(uid); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, uid }; },
    enemyPoint(i) { const e = combat.state.enemies.filter(x => x.alive)[i]; const a = stage.anchor(e.uid, 'head'), b = stage.anchor(e.uid, 'feet'); return { x: a.x, y: (a.y + b.y) / 2, uid: e.uid }; },
    idle: () => director.idle(),
  };

  // lab buttons
  const bar = document.getElementById('lab-bar');
  const btn = (label, fn) => bar.append(h('button', { onclick: fn }, label));
  btn('Finisher', () => ui.banner('FINISHER', 'finisher'));
  btn('Your turn', () => ui.banner('Your Turn ' + Math.random().toFixed(2).slice(2), 'player'));
  btn('Hurt 15', () => { combat.party.hp = Math.max(1, combat.party.hp - 15); ui.onEvent({ t: 'damage', source: 'e1', target: 'party', amount: 15, blocked: 0, hp: combat.party.hp, block: combat.party.block, kind: 'light', hero: 'marc' }); });
  btn('Heal 10', () => { combat.heal(10); director.push(combat.takeEvents()); });
  btn('Win', () => { combat.forceWin(); director.push(combat.takeEvents()); });
  btn('Restart', () => location.reload());
  setTimeout(() => { window.__ready = true; }, 300);
}

// ?hand=id,id: swap those cards into the opening hand (patches the queued draw event so the HUD sees the same thing)
function forceHand(combat, ids) {
  const S = combat.state;
  const swaps = new Map();
  const before = S.hand.map(c => c.uid);
  ids.forEach((id, i) => {
    if (!S.hand[i] || S.hand[i].id === id) return;
    const k = S.hand.findIndex((c, n) => n > i && c.id === id);
    if (k >= 0) { [S.hand[i], S.hand[k]] = [S.hand[k], S.hand[i]]; return; }
    const j = S.draw.findIndex(c => c.id === id);
    if (j < 0) return;
    [S.hand[i], S.draw[j]] = [S.draw[j], S.hand[i]];
  });
  before.forEach((u, n) => swaps.set(u, S.hand[n].uid));
  for (const e of combat.events) if (e.t === 'draw') e.uids = e.uids.map(u => swaps.get(u) || u);
}

// ---------------------------------------------------------------- start

if (Q.get('sheet') === 'icons') {
  const s = h('div.sheet');
  for (const n of iconNames()) s.append(h('div.ic', { html: icon(n) + `<span>${n}</span>` }));
  document.body.append(s);
  window.__ready = true;
} else if (Q.get('sheet') === 'cards') {
  const s = h('div.sheet');
  const ids = Q.get('ids') ? Q.get('ids').split(',') : Object.keys(CARDS);
  for (const id of ids) s.append(cardEl({ uid: 'x' + id, id, up: Q.has('up') && CARDS[id].upgradable }, { size: Q.get('size') || 'reward' }));
  document.body.append(s);
  window.__ready = true;
} else {
  fight();
}
