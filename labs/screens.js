// Screens lab (port 5184): mount any out-of-fight screen with rich mock data.
//   /labs/screens.html?screen=map&v=mid      one screen in one state (the bar at the bottom lists them all)
//   &clean=1   hide the lab bar and log (screenshots)       &paint=1   real painted rooms (painter.js) behind the screens
//   &studio=1  3D-rendered relic / potion / weapon icons (studio.js; slow on SwiftShader)
//   &bar=0     no top bar
// The act callbacks log what the screen asked for and fake the app's answer (gold drops, items sell, the event steps on),
// then call handle.update() the way the app will. The real map generator (src/game/map.js) is used when it exists.
import '../src/ui/styles/base.css';
import { makeStarterDeck, makeCard, cardPool, isUpgradable } from '../src/game/content/cards.js';
import { WEAPONS } from '../src/game/content/weapons.js';

const Q = new URLSearchParams(location.search);
const ui = document.getElementById('ui');
const logEl = document.getElementById('lab-log');
if (Q.get('clean') === '1') document.body.classList.add('clean');

const SCREENS = {
  title: ['save', 'new'],
  intro: ['default'],
  map: ['start', 'mid', 'late', 'view'],
  reward: ['fight', 'elite', 'cards', 'full'],
  rest: ['default', 'low'],
  shop: ['default', 'poor'],
  event: ['break_room', 'vending', 'outcome', 'intercom'],
  treasure: ['closed', 'open'],
  result: ['victory', 'defeat'],
  armory: ['default', 'rich', 'new'],
  settings: ['run', 'menu'],
  deck: ['default'],
  picker: ['upgrade', 'remove', 'transform', 'pick'],
};
const screen = Q.get('screen') || 'title';
const variant = Q.get('v') || SCREENS[screen]?.[0];

// ---------------------------------------------------------------- lab bar + log
const bar = document.getElementById('lab-bar');
bar.innerHTML = '<b><em>SARNO</em> <i>LEGENDS</i> · screens</b>';
for (const [name, vs] of Object.entries(SCREENS)) {
  const a = document.createElement('a'); a.textContent = name; a.href = link(name, vs[0]); if (name === screen) a.className = 'on'; bar.append(a);
}
bar.append(' · ');
for (const v of SCREENS[screen] || []) { const a = document.createElement('a'); a.textContent = v; a.href = link(screen, v); a.className = 'v' + (v === variant ? ' on' : ''); bar.append(a); }
function link(s, v) { const p = new URLSearchParams(location.search); p.set('screen', s); p.set('v', v); return '?' + p; }
const lines = [];
function log(...a) { lines.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); while (lines.length > 8) lines.shift(); logEl.textContent = lines.join('\n'); console.log('[act]', ...a); }

// ---------------------------------------------------------------- painted rooms / studio (optional)
let renderer = null;
async function getRenderer() {
  if (renderer) return renderer;
  const THREE = await import('three');
  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
  renderer.setPixelRatio(1); renderer.setSize(64, 64, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  return renderer;
}
const roomCache = new Map();
function rooms(key) {
  if (Q.get('paint') !== '1') return null;
  if (!roomCache.has(key)) {
    roomCache.set(key, (async () => {
      const { paintRoom } = await import('../src/render/painter.js');
      const r = await paintRoom(await getRenderer(), key, { width: 1280, height: 720, seed: 1, full: false });
      return r.url;
    })().catch(e => { console.warn('paint failed', key, e); return null; }));
  }
  return roomCache.get(key);
}
let studio = null;
if (Q.get('studio') === '1') {
  const { createStudio } = await import('../src/render/studio.js');
  studio = createStudio(await getRenderer(), { cache: true });
}

// ---------------------------------------------------------------- mock map (same shape as src/game/map.js)
function mockMap(seed = 7) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const W = 7, ROWS = 15, nodes = {};
  const id = (r, c) => `n${r}_${c}`;
  const edges = new Set();
  const starts = new Set();
  for (let p = 0; p < 6; p++) {
    let c = Math.floor(rnd() * W);
    if (p === 1) while (starts.has(c) && starts.size < W) c = Math.floor(rnd() * W);
    starts.add(c);
    for (let r = 1; r <= ROWS; r++) {
      nodes[id(r, c)] ||= { id: id(r, c), row: r, col: c, next: [] };
      if (r === ROWS) break;
      let d = Math.floor(rnd() * 3) - 1, nc = Math.max(0, Math.min(W - 1, c + d));
      if (edges.has(`${r}:${nc}>${c}`) && nc !== c) nc = c; // no crossing corridors
      edges.add(`${r}:${c}>${nc}`);
      const n = nodes[id(r, c)];
      if (!n.next.includes(id(r + 1, nc))) n.next.push(id(r + 1, nc));
      c = nc;
    }
  }
  const boss = { id: 'boss', row: ROWS + 1, col: 3, x: 3, y: ROWS + 1, type: 'boss', next: [] };
  for (const n of Object.values(nodes)) {
    n.x = n.col + (rnd() - .5) * .5; n.y = n.row + (rnd() - .5) * .3;
    if (n.row === 1) n.type = 'fight';
    else if (n.row === 9) n.type = 'treasure';
    else if (n.row === ROWS) n.type = 'rest';
    else {
      const t = rnd() * 100;
      n.type = t < 5 ? 'shop' : t < 17 ? 'rest' : t < 39 ? 'event' : t < 47 ? 'elite' : 'fight';
      if (n.row < 6 && (n.type === 'elite' || n.type === 'rest')) n.type = 'fight';
    }
    if (n.row === ROWS) n.next = ['boss'];
  }
  nodes.boss = boss;
  return { rows: ROWS, width: W, nodes, starts: Object.values(nodes).filter(n => n.row === 1).map(n => n.id), boss: 'boss' };
}
let genMap = null;
try {
  const mapPath = '../src/game/map.js';
  const m = await import(/* @vite-ignore */ mapPath);
  genMap = m.generateMap || m.createMap || m.makeMap || null;
} catch { /* not there yet: mock */ }
const { makeRng, makeStreams } = await import('../src/game/rng.js');
function makeMapFor(seed) {
  if (genMap) {
    // the generator's signature isn't pinned in the spec: try the likely ones, keep the first that returns nodes
    const tries = [() => genMap(makeRng('LAB' + seed)), () => genMap({ seed: 'LAB' + seed, act: 1, rng: makeRng('LAB' + seed) }), () => genMap('LAB' + seed),
      () => genMap(makeStreams('LAB' + seed).map), () => genMap({ rng: makeStreams('LAB' + seed) })];
    for (const t of tries) {
      try { const m = t(); if (m && m.nodes && Object.keys(m.nodes).length) { log('map: src/game/map.js'); return m; } } catch { /* next */ }
    }
    console.warn('src/game/map.js is there but none of the calls worked: using the mock');
  }
  return mockMap(seed);
}
/** Walk a plausible path n rows up the map. */
function walk(map, rows) {
  const path = [];
  let cur = map.starts[Math.floor(map.starts.length / 2)];
  for (let i = 0; i < rows && cur; i++) {
    path.push(cur);
    const n = map.nodes[cur];
    cur = n.next[(i * 7) % Math.max(1, n.next.length)];
  }
  return path;
}

// ---------------------------------------------------------------- mock run
const deck = makeStarterDeck({ marc: 'wood_bat', yola: 'pistol' });
for (const [id, up] of [['batter_up', false], ['headshot', true], ['tuck_and_roll', false], ['ground_pound', false], ['marksman', false], ['haymaker', true]]) deck.push(makeCard(id, up, deck));
deck[0].up = true;
const run = {
  version: 1, seed: 'K7Q2ZX', act: 1, floor: 0, hp: 61, maxHp: 80, gold: 187,
  deck, relics: [{ id: 'nurses_kit', counter: 0 }, { id: 'pager', counter: 0 }, { id: 'tally_marks', counter: 6 }],
  potions: ['flashbang', null, 'medkit'], weapons: { marc: 'crowbar', yola: 'pistol' },
  map: makeMapFor(7), node: null, path: [], stats: { kills: 23, fights: 6 },
};
const profile = {
  scrap: 245, unlocked: ['wood_bat', 'pistol', 'nail_bat', 'crowbar'], equipped: { marc: 'crowbar', yola: 'pistol' },
  settings: { speed: 1.5, music: 0.6, sfx: 0.8, shake: true, gore: 'full' }, runs: 7, wins: 1,
};
const pick3 = (hero, n = 3, seed = 1) => { const pool = cardPool({ hero }); return Array.from({ length: n }, (_, i) => makeCard(pool[(seed * 7 + i * 11) % pool.length], false, run.deck)); };

// ---------------------------------------------------------------- ctx per screen
let handle = null;
const update = () => handle?.update?.();
const base = (act) => ({
  run, profile, studio, rooms, audio: { ui: n => log('ui', n), sfx: () => {} }, version: '0.1.0',
  topbar: Q.get('bar') === '0' ? false : undefined,
  act: { openDeck: () => log('openDeck'), openMap: () => log('openMap'), settings: () => log('settings'), potion: i => log('potion', i), ...act },
});

const builders = {
  title(v) {
    return { ...base({ continue: () => log('continue'), newRun: () => log('newRun'), armory: () => log('armory'), settings: () => log('settings') }),
      hasSave: v === 'save', save: { floor: 7, hp: 52, maxHp: 80 } };
  },
  intro() {
    return { ...base({ choose: i => log('choose', i) }),
      options: [
        { id: 'max_hp', label: '+8 Max HP', desc: 'Raise your Max HP by 8.', icon: 'heart' },
        { id: 'pick_yola', label: 'Yola\'s Pick', desc: 'Choose 1 of 3 Yola cards to add to your deck.', icon: 'yola', hero: 'yola' },
        { id: 'rare', label: 'Something Rare', desc: 'Add a random rare card to your deck.', icon: 'star', cost: null },
      ] };
  },
  map(v) {
    const rows = { start: 0, mid: 6, late: 14, view: 6 }[v] ?? 0;
    run.path = walk(run.map, rows); run.node = run.path.at(-1) || null; run.floor = run.path.length;
    return { ...base({ travel: id => { log('travel', id); run.path.push(id); run.node = id; run.floor++; update(); }, close: () => log('close') }),
      viewOnly: v === 'view', bossName: 'Shield Guard', intro: Q.get('intro') !== '0' };
  },
  reward(v) {
    const rewards = [{ kind: 'gold', amount: v === 'elite' ? 31 : 17 }];
    if (v !== 'fight' || true) rewards.push({ kind: 'potion', id: v === 'elite' ? 'pipe_bomb' : 'energy_drink' });
    if (v === 'elite') rewards.push({ kind: 'relic', id: 'coffee_thermos' });
    rewards.push({ kind: 'cards', cards: [...pick3('marc', 2, 3), ...pick3('yola', 1, 5)] });
    if (v === 'full') run.potions = ['flashbang', 'adrenaline', 'medkit'];
    const ctx = { ...base({
      take: i => { log('take', i); const r = ctx.rewards[i]; r.taken = true; if (r.kind === 'gold') run.gold += r.amount; if (r.kind === 'potion') { const s = run.potions.indexOf(null); if (s >= 0) run.potions[s] = r.id; } if (r.kind === 'relic') run.relics.push({ id: r.id, counter: 0 }); update(); },
      pickCard: (i, j) => { log('pickCard', i, j); ctx.rewards[i].taken = true; run.deck.push(ctx.rewards[i].cards[j]); update(); },
      skip: i => log('skip', i), done: () => log('done'),
    }), rewards, kind: v === 'elite' ? 'elite' : 'fight', autoOpenCards: v === 'cards' };
    return ctx;
  },
  rest(v) {
    if (v === 'low') run.hp = 23;
    return { ...base({ rest: () => { log('rest'); run.hp = Math.min(run.maxHp, run.hp + 24); update(); }, upgrade: uid => { log('upgrade', uid); run.deck.find(c => c.uid === uid).up = true; update(); }, leave: () => log('leave') }),
      heal: Math.floor(run.maxHp * 0.3) };
  },
  shop(v) {
    if (v === 'poor') run.gold = 61;
    const ctx = { ...base({
      buyCard: i => buy(ctx.shop.cards[i], 'card'), buyRelic: i => buy(ctx.shop.relics[i], 'relic'), buyPotion: i => buy(ctx.shop.potions[i], 'potion'),
      remove: uid => { log('remove', uid); run.gold -= ctx.shop.removal.price; ctx.shop.removal.used = true; run.deck = run.deck.filter(c => c.uid !== uid); update(); },
      leave: () => log('leave'),
    }), shop: {
      cards: [
        { card: makeCard('heavy_swing'), price: 52 }, { card: makeCard('jaw_breaker'), price: 39, sale: true, was: 78 },
        { card: makeCard('double_tap'), price: 48 }, { card: makeCard('point_blank'), price: 151 },
        { card: makeCard('swing_guard'), price: 74 },
      ],
      relics: [{ id: 'riot_vest', price: 247 }, { id: 'knee_brace', price: 149 }, { id: 'staff_badge', price: 151 }],
      potions: [{ id: 'medkit', price: 51 }, { id: 'protein_shake', price: 74 }, { id: 'epi_pen', price: 99 }],
      removal: { price: 75, used: false },
    } };
    function buy(item, kind) {
      log('buy', kind, item.price);
      if (run.gold < item.price) return false;
      run.gold -= item.price; item.sold = true;
      if (kind === 'card') run.deck.push(item.card);
      update(); return true;
    }
    return ctx;
  },
  event(v) {
    const EV = {
      break_room: { id: 'break_room', room: 'break_room', title: 'Break Room', text: 'A coffee pot still warm on the counter. Someone left in a hurry. There is a box of snacks on the top shelf, sealed.',
        choices: [{ label: 'Coffee', desc: 'Heal 26 HP.' }, { label: 'Donuts', desc: 'Gain 5 Max HP.' }, { label: 'Grab the snack box', desc: 'Get a random relic. Gain Infection, a curse.' }] },
      vending: { id: 'vending', room: 'corridor', title: 'Vending Machine', text: 'The glass is cracked. Something shiny is stuck behind the last coil.',
        choices: [{ label: 'Smash it', desc: 'Lose 3 HP. 25%: a relic falls out.' }, { label: 'Walk away' }] },
      intercom: { id: 'intercom', room: 'security_gate', title: 'The Intercom', text: 'Static, then a voice counting slowly. It stops when you lean in.',
        choices: [{ label: 'Forget', desc: 'Remove a card from your deck.' }, { label: 'Change', desc: 'Transform a card.' }, { label: 'Practise', desc: 'Upgrade a card.' }, { label: 'Hang up', desc: 'Requires 50 supplies.', disabled: true }] },
    };
    const ev = structuredClone(EV[v === 'outcome' ? 'break_room' : v]);
    const ctx = { ...base({
      choose: i => {
        log('choose', i);
        if (ctx.event.done) return log('leave');
        if (ev.id === 'intercom' && i < 3) { ctx.event.picker = { mode: ['remove', 'transform', 'upgrade'][i], cards: run.deck.filter(c => i !== 2 || isUpgradable(c)) }; update(); return; }
        ctx.event = { ...ctx.event, text: i === 0 ? 'You drink it standing up. It is terrible, and it helps.' : 'You take what you can carry.', choices: [{ label: 'Continue' }], done: true, result: i === 0 ? [{ text: '+26 HP', tone: 'good' }] : [{ text: '+5 Max HP', tone: 'good' }] };
        update();
      },
      pickCard: uid => { log('pickCard', uid); ctx.event = { ...ctx.event, picker: null, text: 'The voice stops counting.', choices: [{ label: 'Continue' }], done: true }; update(); },
    }), event: ev };
    if (v === 'outcome') Object.assign(ev, { text: 'You drink it standing up. It is terrible, and it helps.', choices: [{ label: 'Continue' }], done: true, result: [{ text: '+26 HP', tone: 'good' }] });
    return ctx;
  },
  treasure(v) {
    const ctx = { ...base({ open: () => { log('open'); ctx.treasure.opened = true; update(); }, take: () => { log('take'); ctx.treasure.taken = true; run.gold += 31; update(); }, leave: () => log('leave') }),
      treasure: { relic: 'door_wedge', gold: 31, opened: v === 'open' } };
    return ctx;
  },
  result(v) {
    const won = v === 'victory';
    return { ...base({ armory: () => log('armory'), title: () => log('title') }), topbar: false,
      summary: {
        won, floor: won ? 16 : 11, kills: won ? 41 : 27, turns: won ? 94 : 63, fights: won ? 9 : 7, elites: won ? 2 : 1,
        bestHit: { amount: won ? 42 : 27, card: won ? 'grand_slam' : 'home_run' }, damageTaken: 188, cardsPlayed: 312,
        killedBy: won ? null : 'Big Walker', seed: run.seed, deck: run.deck, relics: run.relics.map(r => r.id), weapons: run.weapons,
        scrap: { before: 245, earned: won ? 151 : 76, lines: won
          ? [{ label: 'Fights ×9', amount: 72 }, { label: 'Elites ×2', amount: 40 }, { label: 'Boss', amount: 40 }, { label: 'Floor cleared', amount: 15 }]
          : [{ label: 'Fights ×7', amount: 56 }, { label: 'Elites ×1', amount: 20 }] },
        unlocks: won ? [{ weapon: 'wire_bat', text: 'You can afford the Wire-and-Tape Bat.' }, { weapon: 'shotgun', text: 'You can afford the Pump Shotgun.' }] : [{ weapon: 'shotgun', text: 'You can afford the Pump Shotgun.' }],
      } };
  },
  armory(v) {
    if (v === 'rich') profile.scrap = 900;
    if (v === 'new') { profile.scrap = 60; profile.unlocked = ['wood_bat', 'pistol']; profile.equipped = { marc: 'wood_bat', yola: 'pistol' }; }
    const ctx = { ...base({
      unlock: id => { log('unlock', id); const w = WEAPONS[id]; if (profile.scrap < w.cost) return false; profile.scrap -= w.cost; profile.unlocked.push(id); update(); return true; },
      equip: (hero, id) => { log('equip', hero, id); profile.equipped[hero] = id; update(); },
      back: () => log('back'),
    }), topbar: false };
    return ctx;
  },
  settings(v) {
    return { ...base({ set: (k, val) => { log('set', k, val); profile.settings[k] = val; }, close: () => log('close'), abandonRun: () => log('abandonRun'), resetProfile: () => log('resetProfile') }),
      settings: profile.settings, inRun: v === 'run', topbar: false };
  },
  deck() {
    return { ...base({ close: () => log('close') }), cards: run.deck, title: 'Your Deck', topbar: false };
  },
  picker(v) {
    const cards = v === 'upgrade' ? run.deck.filter(isUpgradable) : v === 'pick' ? [...pick3('marc', 1, 2), ...pick3('yola', 1, 4), ...pick3(undefined, 1, 9)] : run.deck;
    return { ...base({ choose: uid => log('choose', uid), cancel: () => log('cancel') }), cards, mode: v, topbar: false,
      title: v === 'pick' ? 'A Note on the Wall' : undefined, sub: v === 'pick' ? 'Take one card.' : undefined };
  },
};

// ---------------------------------------------------------------- mount
const t0 = performance.now();
try {
  const mod = await import(`../src/ui/screens/${screen}.js`);
  const ctx = builders[screen](variant);
  window.__ctx = ctx;
  handle = mod.mount(ui, ctx);
  log(`mounted ${screen}/${variant} in ${Math.round(performance.now() - t0)} ms`);
} catch (e) {
  console.error(e);
  log('ERROR ' + e.message);
  window.__error = String(e.stack || e);
}
window.__handle = handle;
window.__ready = true;
