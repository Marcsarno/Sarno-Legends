// Engine core rules: damage and block math, statuses and their timing, draw/shuffle/energy, card keywords,
// targeting, finishers, previews, determinism. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../src/game/combat.js';
import { CARDS, cardView, makeStarterDeck, upgradeCard, isUpgradable, cardPool, newUid, syncUids } from '../src/game/content/cards.js';
import { makeRng, makeStreams, streamsState, restoreStreams, toStreams } from '../src/game/rng.js';
import { describeCard } from '../src/game/text.js';

// ---------------------------------------------------------------- helpers

function mk({ deck = ['bat_swing', 'bat_swing', 'bat_swing', 'bat_swing', 'bat_swing'], enemies = ['shambler'], relics = [], potions = [null, null, null],
  weapons = {}, hp = 80, maxHp = 80, seed = 'T', start = true } = {}) {
  const run = {
    seed, hp, maxHp, weapons, potions,
    deck: deck.map((id, i) => ({ uid: `c${i + 1}`, id: id.replace('+', ''), up: id.endsWith('+') })),
    relics: relics.map(id => ({ id, counter: 0 })),
  };
  const c = createCombat({ run, encounter: { id: 'test', enemies }, rng: seed });
  if (start) c.start();
  return c;
}

/** Replace the hand with fresh copies of these cards (and give energy). */
function hand(c, ids, energy = 99) {
  c.state.hand = ids.map((id, i) => c.makeCombatCard({ uid: `h${i + 1}`, id: id.replace('+', ''), up: id.endsWith('+') }));
  c.state.energy = energy;
  return c.state.hand.map(x => x.uid);
}

const E = (c, i = 0) => c.state.enemies[i];
const ev = (c, t) => c.takeEvents().filter(e => !t || e.t === t);
function setHp(e, hp) { e.hp = hp; e.maxHp = Math.max(e.maxHp, hp); }

// ---------------------------------------------------------------- rng

test('rng: deterministic, restorable, independent streams', () => {
  const a = makeRng('ABC'), b = makeRng('ABC');
  const xs = Array.from({ length: 20 }, () => a.next());
  assert.deepEqual(xs, Array.from({ length: 20 }, () => b.next()));
  const saved = a.state();
  const after = Array.from({ length: 5 }, () => a.int(1000));
  const r = makeRng(saved);
  assert.deepEqual(Array.from({ length: 5 }, () => r.int(1000)), after);
  for (let i = 0; i < 500; i++) { const n = a.range(3, 7); assert.ok(n >= 3 && n <= 7); }
  const s = makeStreams('X');
  s.shuffle.next(); s.shuffle.next();
  const restored = restoreStreams(JSON.parse(JSON.stringify(streamsState(s))));
  assert.equal(restored.shuffle.next(), s.shuffle.next());
  assert.notEqual(makeStreams('X').map.next(), makeStreams('X').cards.next());
  assert.equal(makeRng('Q').fork('a').next(), makeRng('Q').fork('a').next());
  assert.ok(toStreams('S').ai && toStreams(makeRng('S')).misc && toStreams(makeStreams('S')).events);
  const w = makeRng('W'); const counts = { a: 0, b: 0 };
  for (let i = 0; i < 4000; i++) counts[w.weighted({ a: 3, b: 1 })]++;
  assert.ok(counts.a > 2700 && counts.a < 3300, JSON.stringify(counts));
});

// ---------------------------------------------------------------- cards and decks

test('starter deck: 11 cards, and each weapon swaps the right cards', () => {
  const ids = d => d.map(c => c.id).sort().join(',');
  const base = makeStarterDeck({ marc: 'wood_bat', yola: 'pistol' });
  assert.equal(base.length, 11);
  assert.equal(new Set(base.map(c => c.uid)).size, 11);
  assert.equal(ids(base), 'bat_swing,bat_swing,bat_swing,brace,brace,clean_shot,home_run,pistol_shot,pistol_shot,sidestep,sidestep');
  const count = (d, id) => d.filter(c => c.id === id).length;
  assert.equal(count(makeStarterDeck({ marc: 'nail_bat' }), 'nail_swing'), 3);
  assert.equal(count(makeStarterDeck({ marc: 'wire_bat' }), 'barbed_swing'), 3);
  assert.equal(count(makeStarterDeck({ marc: 'crowbar' }), 'pry_loose'), 1);
  assert.equal(count(makeStarterDeck({ marc: 'crowbar' }), 'home_run'), 0);
  const axe = makeStarterDeck({ marc: 'fire_axe' });
  assert.equal(count(axe, 'chop_block'), 1); assert.equal(count(axe, 'brace'), 1);
  assert.equal(count(makeStarterDeck({ marc: 'sledgehammer' }), 'sledge'), 1);
  const sg = makeStarterDeck({ yola: 'shotgun' });
  assert.equal(count(sg, 'buckshot'), 2); assert.equal(count(sg, 'pistol_shot'), 0);
  assert.equal(count(makeStarterDeck({ yola: 'sawed_off' }), 'both_barrels'), 1);
  for (const d of [base, axe, sg]) assert.equal(d.length, 11);
});

test('cards: upgrades, pools, uids', () => {
  const c = { uid: 'c1', id: 'home_run', up: false };
  assert.ok(isUpgradable(c));
  assert.equal(upgradeCard(c), c);
  assert.equal(c.up, true);
  assert.equal(cardView(c).name, 'Home Run+');
  assert.equal(cardView(c).effects[0].n, 10);
  assert.ok(!isUpgradable(c));
  assert.equal(cardView({ id: 'tackle', up: true }).cost, 0);
  assert.deepEqual(cardView({ id: 'rally', up: true }).keywords, []);
  assert.ok(!isUpgradable({ id: 'panic', up: false }));
  const marc = cardPool({ hero: 'marc' }), yola = cardPool({ hero: 'yola' });
  assert.equal(marc.length, 30);
  assert.equal(yola.length, 26);
  assert.ok(!marc.includes('bat_swing') && !marc.includes('nail_swing'));
  assert.equal(cardPool({ hero: 'yola', rarity: 'rare' }).length, 6);
  syncUids([{ uid: 'c40' }]);
  assert.equal(newUid(), 'c41');
  for (const def of Object.values(CARDS)) {
    assert.ok(typeof def.name === 'string' && def.type && def.rarity, def.id);
    if (def.type === 'attack') assert.ok(['light', 'heavy', 'gun', 'blast'].includes(def.kind), def.id);
    assert.ok(describeCard({ id: def.id }).length > 3, def.id);
    assert.ok(describeCard({ id: def.id, up: true }).length > 3, def.id);
  }
});

// ---------------------------------------------------------------- damage math

test('damage: Strength per hit, Weakened x0.75, Staggered x1.5, one floor at the end', () => {
  const c = mk();
  const z = E(c); setHp(z, 200); z.block = 0;
  const [a] = hand(c, ['bat_swing']);
  c.state.party.statuses.strength = 2;
  c.state.party.statuses.weak = 1;
  z.statuses.vulnerable = 1;
  c.takeEvents();
  c.playCard(a, z.uid);
  const dmg = ev(c, 'damage')[0];
  assert.equal(dmg.amount, Math.floor((6 + 2) * 0.75 * 1.5)); // 9
  assert.equal(dmg.staggered, true);

  const c2 = mk();
  const z2 = E(c2); setHp(z2, 200);
  const [b] = hand(c2, ['one_two']);
  c2.state.party.statuses.strength = 3;
  c2.takeEvents();
  c2.playCard(b, z2.uid);
  const hits = ev(c2, 'damage');
  assert.deepEqual(hits.map(h => h.amount), [8, 8]);
  assert.deepEqual(hits.map(h => [h.hit, h.hits]), [[1, 2], [2, 2]]);

  // floors: 9 on Staggered = 13
  const c3 = mk(); const z3 = E(c3); setHp(z3, 200); z3.statuses.vulnerable = 2;
  const [d] = hand(c3, ['bat_swing+']); c3.takeEvents(); c3.playCard(d, z3.uid);
  assert.equal(ev(c3, 'damage')[0].amount, 13);
});

test('damage: Hollow Points makes Staggered x1.75', () => {
  const c = mk({ relics: ['hollow_points'] });
  const z = E(c); setHp(z, 200); z.statuses.vulnerable = 1;
  const [a] = hand(c, ['pistol_shot']); c.takeEvents();
  c.playCard(a, z.uid);
  assert.equal(ev(c, 'damage')[0].amount, Math.floor(6 * 1.75)); // 10
});

test('damage: Heavy Swing counts Strength 3x, Staggered bonus cards, Marksman, Tackle', () => {
  const c = mk(); const z = E(c); setHp(z, 300);
  c.state.party.statuses.strength = 2;
  let [a] = hand(c, ['heavy_swing']); c.takeEvents(); c.playCard(a, z.uid);
  assert.equal(ev(c, 'damage')[0].amount, 14 + 6);
  c.state.party.statuses.strength = 0;
  [a] = hand(c, ['clean_shot']); c.playCard(a, z.uid);
  assert.equal(ev(c, 'damage')[0].amount, 5);
  z.statuses.vulnerable = 1;
  [a] = hand(c, ['clean_shot']); c.playCard(a, z.uid);
  assert.equal(ev(c, 'damage')[0].amount, Math.floor((5 + 5) * 1.5));
  c.state.party.statuses.marksman = 3;
  [a] = hand(c, ['pistol_shot']); c.playCard(a, z.uid);
  assert.equal(ev(c, 'damage')[0].amount, Math.floor((6 + 3) * 1.5));
  c.state.party.statuses.marksman = 0; z.statuses = {}; z.block = 0;
  c.state.party.block = 17;
  [a] = hand(c, ['tackle']); c.playCard(a, z.uid);
  assert.equal(ev(c, 'damage')[0].amount, 17);
});

test('damage: Block absorbs first, the rest is HP; zombie attacks use Strength, Weakened and party Staggered', () => {
  const c = mk(); const z = E(c); setHp(z, 100);
  z.block = 4;
  const [a] = hand(c, ['bat_swing']); c.takeEvents(); c.playCard(a, z.uid);
  const d = ev(c, 'damage')[0];
  assert.equal(d.blocked, 4); assert.equal(d.amount, 2); assert.equal(d.block, 0); assert.equal(d.hp, 98);

  // zombie side: Bite Down 11 (+3 Strength) x0.75 Weakened x1.5 party Staggered
  z.statuses.strength = 3; z.statuses.weak = 1;
  c.state.party.statuses.vulnerable = 1;
  c.setIntent(z, 'bite_down');
  assert.equal(c.intentOf(z.uid).damage, Math.floor(14 * 0.75 * 1.5));
});

test('block: Agility adds, Shaken x0.75, floor; raw block ignores both', () => {
  const c = mk();
  c.state.party.statuses.dexterity = 2;
  c.state.party.statuses.frail = 1;
  let [a] = hand(c, ['brace']); c.takeEvents(); c.playCard(a);
  assert.equal(ev(c, 'block')[0].amount, Math.floor((5 + 2) * 0.75)); // 5
  delete c.state.party.statuses.frail;
  [a] = hand(c, ['brace']); c.playCard(a);
  assert.equal(ev(c, 'block')[0].amount, 7);
  c.gainBlock(6, { raw: true });
  assert.equal(ev(c, 'block')[0].amount, 6);
  c.state.party.statuses.dexterity = -9;
  [a] = hand(c, ['brace']); c.playCard(a);
  assert.equal(ev(c, 'block').length, 0, 'negative block gives nothing');
});

test('block timing: party block clears at its turn start (not with Dug In); zombie block clears at its turn start', () => {
  const c = mk({ enemies: ['sprinter'] });
  const z = E(c); setHp(z, 100);
  c.state.party.block = 20;
  z.block = 7;
  c.takeEvents();
  c.endTurn();
  const evs = c.takeEvents();
  const zClear = evs.find(e => e.t === 'block' && e.target === z.uid && e.cleared);
  assert.ok(zClear, 'zombie block cleared at its turn');
  const hit = evs.find(e => e.t === 'damage' && e.target === 'party');
  assert.equal(hit.blocked, 9); assert.equal(hit.amount, 0);
  const pClear = evs.find(e => e.t === 'block' && e.target === 'party' && e.cleared);
  assert.equal(pClear.amount, -11);
  assert.equal(c.state.party.block, 0);

  const d = mk({ enemies: ['sprinter'] });
  setHp(E(d), 100);
  d.state.party.statuses.fortify = 1;
  d.state.party.block = 30;
  d.endTurn();
  assert.equal(d.state.party.block, 21, 'Dug In keeps block');
});

test('bleed: start of the zombie turn, ignores block, then -1; a bleed kill is not a finisher', () => {
  const c = mk({ enemies: ['sprinter'] });
  const z = E(c); setHp(z, 50); z.block = 0;
  const [a] = hand(c, ['nail_swing']); c.takeEvents();
  c.playCard(a, z.uid);
  assert.equal(z.statuses.bleed, 2);
  c.state.hand = [];
  c.endTurn();
  const evs = c.takeEvents();
  const bleed = evs.find(e => e.t === 'damage' && e.kind === 'bleed');
  assert.equal(bleed.amount, 2);
  assert.equal(z.hp, 50 - 6 - 2); // Nail Swing 6 (docs/BALANCE.md)
  assert.equal(z.statuses.bleed, 1);
  const move = evs.findIndex(e => e.t === 'enemy_move');
  assert.ok(evs.indexOf(bleed) < move, 'bleed before the zombie acts');

  const k = mk({ enemies: ['sprinter'] });
  const kz = E(k); kz.hp = 2; kz.statuses.bleed = 3; kz.statuses.vulnerable = 2;
  k.state.hand = []; k.takeEvents(); k.endTurn();
  const death = k.takeEvents().find(e => e.t === 'death');
  assert.equal(death.kind, 'bleed'); assert.equal(death.finisher, false);
  assert.equal(k.state.phase, 'won');
});

test('debuff timing: zombie debuffs tick at the end of its turn; a zombie debuff on the party survives into the next player turn', () => {
  const c = mk({ enemies: ['sprinter'] });
  const z = E(c); setHp(z, 200);
  const [a] = hand(c, ['home_run']); c.playCard(a, z.uid);
  assert.equal(z.statuses.vulnerable, 2);
  c.state.hand = []; c.endTurn();
  assert.equal(z.statuses.vulnerable, 1, 'after zombie turn 1');
  c.state.hand = []; c.endTurn();
  assert.equal(z.statuses.vulnerable, undefined, 'gone after zombie turn 2');

  // party Staggered 2 from a zombie boosts the rest of that zombie turn, and two more zombie turns
  const d = mk({ enemies: ['big_walker'] });
  const w = E(d); setHp(w, 300);
  d.setIntent(w, 'headbutt'); w.history = ['roar'];
  d.state.hand = []; d.endTurn(); // headbutt: 6 + 2 Staggered
  assert.equal(d.state.party.statuses.vulnerable, 2, 'fresh: skips the first tick');
  d.setIntent(w, 'charge');
  assert.equal(d.intentOf(w.uid).damage, 21, 'next zombie turn boosted');
  d.state.hand = []; d.endTurn();
  assert.equal(d.state.party.statuses.vulnerable, 1);
  d.state.hand = []; d.endTurn();
  assert.equal(d.state.party.statuses.vulnerable, undefined);

  // Weakened from a Spitter lasts 2 player turns
  const s = mk({ enemies: ['spitter'] });
  const sp = E(s); setHp(sp, 300); sp.statuses = {};
  s.setIntent(sp, 'spit'); s.state.hand = []; s.endTurn();
  assert.equal(s.state.party.statuses.weak, 2);
  s.state.hand = []; s.endTurn();
  assert.equal(s.state.party.statuses.weak, 1);
});

// ---------------------------------------------------------------- turn flow

test('draw, shuffle, hand limit, energy', () => {
  const deck = Array.from({ length: 12 }, () => 'brace');
  const c = mk({ deck, enemies: ['sprinter'] });
  setHp(E(c), 300);
  assert.equal(c.state.hand.length, 5);
  assert.equal(c.state.energy, 3);
  assert.equal(c.state.draw.length, 7);
  const r = c.canPlay(c.state.hand[0].uid);
  assert.ok(r.ok);
  c.playCard(c.state.hand[0].uid);
  assert.equal(c.state.energy, 2);
  c.state.energy = 0;
  assert.deepEqual(c.canPlay(c.state.hand[0].uid), { ok: false, reason: 'energy' });
  c.endTurn();
  assert.equal(c.state.energy, 3);
  assert.equal(c.state.hand.length, 5);
  assert.equal(c.state.draw.length, 2);
  c.takeEvents();
  c.endTurn();
  const evs = c.takeEvents();
  const sh = evs.find(e => e.t === 'shuffle');
  assert.ok(sh && sh.count === 10, 'discard shuffled into draw');
  const draws = evs.filter(e => e.t === 'draw');
  assert.equal(draws.reduce((t, d) => t + d.uids.length, 0), 5);
  assert.ok(evs.indexOf(draws[0]) < evs.indexOf(sh) && evs.indexOf(sh) < evs.indexOf(draws[1]));
  // hand limit 10
  c.draw(20);
  assert.equal(c.state.hand.length, 10);
});

test('exhaust, Fleeting (Panic), Unplayable, Innate, Retain', () => {
  const c = mk({ deck: ['bolt_the_door', 'brace', 'brace', 'brace', 'brace', 'brace', 'brace'] });
  setHp(E(c), 300);
  const [a] = hand(c, ['bolt_the_door']);
  c.takeEvents(); c.playCard(a);
  assert.ok(c.state.exhaust.some(x => x.uid === a));
  assert.ok(ev(c, 'exhaust').length === 1);

  c.addCard('panic', 'hand', 1);
  const panic = c.state.hand.find(x => x.id === 'panic');
  assert.deepEqual(c.canPlay(panic.uid), { ok: false, reason: 'unplayable' });
  c.takeEvents(); c.endTurn();
  assert.ok(c.state.exhaust.some(x => x.uid === panic.uid), 'Panic exhausts at end of turn');

  // Innate: the Pistol makes Clean Shot start in hand; an Innate keyword works too
  for (let seed = 0; seed < 20; seed++) {
    const d = mk({ deck: makeStarterDeck({}).map(x => x.id), weapons: { yola: 'pistol' }, seed: 'S' + seed });
    assert.ok(d.state.hand.some(x => x.id === 'clean_shot'), 'clean shot innate');
  }

  // Retain (no card has it yet; a test card proves the rule)
  CARDS.test_retain = { ...CARDS.brace, id: 'test_retain', keywords: ['retain'], up: {} };
  const r = mk({ deck: ['brace', 'brace', 'brace', 'brace', 'brace', 'brace'] });
  setHp(E(r), 300);
  r.state.hand.push(r.makeCombatCard({ uid: 'keep', id: 'test_retain' }));
  r.endTurn();
  assert.ok(r.state.hand.some(x => x.uid === 'keep'), 'retained');
  delete CARDS.test_retain;
});

test('targeting: needs a living target; auto-targets a lone zombie; phase checks', () => {
  const c = mk({ enemies: ['biter', 'spitter'] });
  const [a] = hand(c, ['bat_swing']);
  assert.deepEqual(c.canPlay(a), { ok: false, reason: 'target' });
  assert.ok(c.canPlay(a, E(c, 1).uid).ok);
  E(c, 0).alive = false;
  assert.ok(c.canPlay(a).ok, 'one zombie left: auto target');
  assert.deepEqual(c.canPlay(a, E(c, 0).uid), { ok: false, reason: 'target' });
  assert.ok(c.needsTarget(a));
  const [b] = hand(c, ['brace']);
  assert.ok(!c.needsTarget(b));
  c.forceWin();
  assert.deepEqual(c.canPlay(b), { ok: false, reason: 'phase' });
  assert.deepEqual(c.endTurn(), { ok: false, reason: 'phase' });
});

test('finisher: a hero kill on a Staggered zombie; plain kills and potion kills are not', () => {
  const c = mk({ enemies: ['biter', 'biter', 'biter'] });
  for (const z of c.state.enemies) { z.hp = 5; z.block = 0; z.statuses = {}; }
  E(c, 0).statuses.vulnerable = 1;
  let [a] = hand(c, ['pistol_shot']); c.takeEvents();
  c.playCard(a, E(c, 0).uid);
  let death = ev(c, 'death')[0];
  assert.deepEqual([death.finisher, death.by, death.kind, death.cardId], [true, 'yola', 'gun', 'pistol_shot']);
  [a] = hand(c, ['bat_swing']);
  c.playCard(a, E(c, 1).uid);
  death = ev(c, 'death')[0];
  assert.deepEqual([death.finisher, death.by, death.kind], [false, 'marc', 'light']);
  E(c, 2).statuses.vulnerable = 1;
  c.state.potions = ['pipe_bomb', null, null];
  c.usePotion(0);
  death = ev(c, 'death')[0];
  assert.equal(death.finisher, false);
  assert.equal(c.state.phase, 'won');
  assert.equal(c.result().finishers, 1);
});

test('combat end: winning stops the fight, follow-up effects after the last kill are skipped (but Make It Count still counts)', () => {
  const c = mk();
  const z = E(c); z.hp = 3; z.block = 0;
  const [a] = hand(c, ['make_it_count']);
  c.takeEvents();
  c.playCard(a, z.uid);
  const evs = c.takeEvents();
  assert.equal(c.state.phase, 'won');
  assert.equal(c.result().maxHp, 83);
  assert.equal(c.result().maxHpDelta, 3);
  assert.equal(evs[evs.length - 1].t, 'combat_end');
  const d = mk(); const dz = E(d); dz.hp = 3;
  const [b] = hand(d, ['clean_kill']); d.takeEvents(); d.playCard(b, dz.uid);
  assert.equal(d.takeEvents().filter(e => e.t === 'draw').length, 0, 'no draws after the win');
});

test('losing: party HP 0 ends the fight, killedBy is the zombie', () => {
  const c = mk({ enemies: ['shambler'], hp: 5 });
  c.setIntent(E(c), 'bite_down');
  c.state.hand = [];
  c.endTurn();
  assert.equal(c.state.phase, 'lost');
  const r = c.result();
  assert.equal(r.won, false); assert.equal(r.hp, 0); assert.equal(r.killedBy, 'shambler');
  const evs = c.takeEvents();
  assert.equal(evs[evs.length - 1].t, 'combat_end');
  assert.equal(evs.filter(e => e.t === 'turn_start' && e.side === 'player').length, 1, 'no new player turn');
});

test('previewCard and intentOf use live statuses', () => {
  const c = mk({ enemies: ['shambler'] });
  const z = E(c); setHp(z, 100);
  const [a, b, d] = hand(c, ['headshot', 'brace', 'wild_swing']);
  let p = c.previewCard(a, z.uid);
  assert.deepEqual([p.damage, p.hits, p.total], [[10], 1, 10]);
  z.statuses.vulnerable = 1;
  c.state.party.statuses.strength = 1;
  p = c.previewCard(a, z.uid);
  assert.equal(p.total, Math.floor((10 + 1 + 10) * 1.5));
  assert.equal(p.ops[0].base, 10);
  c.state.party.statuses.dexterity = 3;
  assert.equal(c.previewCard(b).block, 8);
  assert.equal(c.previewCard(d, z.uid).total, Math.floor(9 * 1.5));
  const html = describeCard(c.state.hand[0], { combat: c, targetUid: z.uid });
  assert.match(html, /num-up">31</);
  c.state.party.statuses.weak = 2; z.statuses = {};
  assert.match(describeCard(c.state.hand[0], { combat: c, targetUid: z.uid }), /num-down">8</);
  // intent
  c.setIntent(z, 'bite_down');
  assert.deepEqual(c.intentOf(z.uid), { move: 'bite_down', name: 'Bite Down', type: 'attack', damage: 11, hits: 1, total: 11 });
  c.applyEnemy(z, 'weak', 1);
  c.refreshIntents();
  const intentEvt = c.takeEvents().filter(e => e.t === 'intent').pop();
  assert.equal(intentEvt.intent.damage, 8);
});

test('event contract: names and fields', () => {
  const c = mk({ enemies: ['biter', 'spitter'], deck: makeStarterDeck({ marc: 'wood_bat', yola: 'pistol' }).map(x => x.id), weapons: { marc: 'wood_bat', yola: 'pistol' } });
  const evs = c.takeEvents();
  assert.equal(evs[0].t, 'combat_start');
  assert.equal(evs[0].enemies.length, 2);
  for (const e of evs[0].enemies) for (const k of ['uid', 'id', 'name', 'hp', 'maxHp', 'block', 'statuses', 'slot']) assert.ok(k in e, k);
  const card = c.state.hand.find(x => cardView(x).type === 'attack');
  c.playCard(card.uid, E(c, 0).uid);
  const play = c.takeEvents();
  const cp = play.find(e => e.t === 'card_played');
  for (const k of ['uid', 'id', 'hero', 'target', 'anim', 'cost']) assert.ok(k in cp, k);
  const atk = play.find(e => e.t === 'attack');
  for (const k of ['by', 'target', 'anim', 'hits']) assert.ok(k in atk, k);
  const dm = play.find(e => e.t === 'damage');
  for (const k of ['source', 'target', 'amount', 'blocked', 'hp', 'block', 'kind', 'staggered', 'killed', 'hit', 'hits']) assert.ok(k in dm, k);
  c.state.hand = [];
  c.endTurn();
  const zt = c.takeEvents();
  assert.ok(zt.some(e => e.t === 'turn_start' && e.side === 'enemy'));
  assert.ok(zt.some(e => e.t === 'enemy_move' && e.uid && e.move && e.name && e.type));
  const pd = zt.find(e => e.t === 'damage' && e.target === 'party');
  if (pd) assert.ok(['marc', 'yola'].includes(pd.hero));
  assert.ok(zt.some(e => e.t === 'intent' && e.intent && e.intent.type));
  const known = new Set(['combat_start', 'turn_start', 'energy', 'draw', 'shuffle', 'discard', 'exhaust', 'card_created', 'card_played', 'attack',
    'damage', 'block', 'heal', 'status', 'death', 'enemy_move', 'intent', 'revive', 'mode_shift', 'wake', 'stunned', 'relic', 'potion', 'gold',
    'escape', 'combat_end', 'immune']);
  for (const e of [...evs, ...play, ...zt]) assert.ok(known.has(e.t), e.t);
});

test('determinism: same seed, same events; different seed, different fight', () => {
  const play = seed => {
    const run = { seed, hp: 80, maxHp: 80, deck: makeStarterDeck({ marc: 'wood_bat', yola: 'pistol' }), relics: [{ id: 'nurses_kit', counter: 0 }],
      potions: [null, null, null], weapons: { marc: 'wood_bat', yola: 'pistol' } };
    const c = createCombat({ run, encounter: 'three_biters', rng: makeStreams(seed) });
    c.start();
    for (let t = 0; t < 30 && !c.over; t++) {
      for (let k = 0; k < 10 && !c.over; k++) {
        const tgt = c.alive()[0]?.uid;
        const card = c.state.hand.find(x => c.canPlay(x.uid, tgt).ok);
        if (!card) break;
        c.playCard(card.uid, tgt);
      }
      if (!c.over) c.endTurn();
    }
    return JSON.stringify(c.takeEvents());
  };
  assert.equal(play('DET1'), play('DET1'));
  assert.notEqual(play('DET1'), play('DET2'));
});

test('the run is never mutated; result() carries what changed', () => {
  const run = { seed: 'M', hp: 50, maxHp: 80, deck: makeStarterDeck({}), relics: [{ id: 'nurses_kit', counter: 0 }, { id: 'tally_marks', counter: 4 }],
    potions: ['medkit', null, null], weapons: {} };
  const before = JSON.stringify(run);
  const c = createCombat({ run, encounter: 'shambler_solo', rng: 'M' });
  c.start();
  c.usePotion(0);
  const card = c.state.hand.find(x => cardView(x).type === 'attack');
  c.playCard(card.uid, E(c).uid);
  c.forceWin();
  assert.equal(JSON.stringify(run), before);
  const r = c.result();
  assert.equal(r.won, true);
  assert.deepEqual(r.potions, [null, null, null]);
  assert.equal(r.relicCounters.tally_marks, 5);
  assert.equal(r.hp, Math.min(80, 50 + 16 + 6));
});
