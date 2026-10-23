// The mid-fight card choice (combat.state.choice + combat.choose(uids) + the 'choice' event) and the cards of the
// card pass (docs/BALANCE.md "Card pass"): Check the Mag, Tough It Out, Wait for It, Battering Ram, Barbed Wire and
// the changed numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../src/game/combat.js';
import { cardView } from '../src/game/content/cards.js';
import { describeCard } from '../src/game/text.js';
import { chooseFor, settleChoice, cloneCombat } from '../tools/sim/bots.mjs';

function mk({ deck = Array(20).fill('brace'), enemies = ['sprinter'], hp = 80, seed = 'CH' } = {}) {
  const run = { seed, hp, maxHp: 80, weapons: {}, potions: [null, null, null], relics: [],
    deck: deck.map((id, i) => ({ uid: `c${i + 1}`, id, up: false })) };
  const c = createCombat({ run, encounter: { id: 'test', enemies }, rng: seed });
  c.start();
  for (const z of c.state.enemies) { z.hp = z.maxHp = 300; z.statuses = {}; z.block = 0; z.intent = null; }
  c.takeEvents();
  return c;
}
let seq = 0;
function hand(c, ids, energy = 99) {
  c.state.hand = ids.map(id => c.makeCombatCard({ uid: `h${++seq}`, id: id.replace('+', ''), up: id.endsWith('+') }));
  c.state.energy = energy;
  return c.state.hand.map(x => x.uid);
}
const E = (c, i = 0) => c.state.enemies[i];
const P = c => c.state.party;

test('Check the Mag: draws 2, then asks for a discard; the card waits in limbo until choose()', () => {
  const c = mk();
  const [mag, a, b] = hand(c, ['check_mag', 'bat_swing', 'quick_shot']);
  const r = c.playCard(mag);
  assert.ok(r.ok && r.choice, 'the play reports the open choice');
  const ch = c.state.choice;
  assert.equal(ch.kind, 'discard');
  assert.equal(ch.n, 1); assert.equal(ch.min, 1); assert.equal(ch.optional, false); assert.equal(ch.from, 'hand');
  assert.equal(ch.prompt, 'Discard a card.');
  assert.deepEqual(ch.source, { uid: mag, id: 'check_mag', name: 'Check the Mag' });
  assert.equal(c.state.hand.length, 4, '2 cards drawn');
  assert.deepEqual(ch.uids, c.state.hand.map(h => h.uid), 'any hand card can go');
  assert.ok(!ch.uids.includes(mag), 'not the card being played');
  assert.equal(c.state.limbo.card.uid, mag);
  assert.ok(!c.state.discard.some(x => x.uid === mag), 'not discarded yet');
  const evs = c.takeEvents();
  const ev = evs.find(e => e.t === 'choice');
  assert.ok(ev, 'choice event');
  assert.deepEqual({ ...ev, t: undefined }, { ...ch, t: undefined });
  assert.ok(evs.findIndex(e => e.t === 'draw') < evs.findIndex(e => e.t === 'choice'), 'draw first, then the choice');

  // while the choice is open nothing else can happen
  assert.equal(c.choosing, true);
  assert.deepEqual(c.canPlay(a, E(c).uid), { ok: false, reason: 'choice' });
  assert.deepEqual(c.playCard(a, E(c).uid), { ok: false, reason: 'choice' });
  assert.deepEqual(c.endTurn(), { ok: false, reason: 'choice' });
  assert.equal(c.hasPlayable(), false);
  c.state.potions[0] = 'body_armor';
  assert.deepEqual(c.usePotion(0), { ok: false, reason: 'choice' });

  // bad answers change nothing
  assert.deepEqual(c.choose([]), { ok: false, reason: 'count' });
  assert.deepEqual(c.choose([a, b]), { ok: false, reason: 'count' });
  assert.deepEqual(c.choose(['nope']), { ok: false, reason: 'card' });
  assert.deepEqual(c.choose([a, a]), { ok: false, reason: 'card' });
  assert.ok(c.state.choice);

  assert.deepEqual(c.choose([b]), { ok: true });
  assert.equal(c.state.choice, null);
  assert.equal(c.state.limbo, null);
  assert.ok(c.state.discard.some(x => x.uid === b), 'the pick is discarded');
  assert.ok(c.state.discard.some(x => x.uid === mag), 'then the card itself');
  assert.equal(c.state.hand.length, 3);
  const after = c.takeEvents();
  assert.deepEqual(after.find(e => e.t === 'choice_made'), { t: 'choice_made', kind: 'discard', uids: [b] });
  assert.ok(after.some(e => e.t === 'discard' && e.uids[0] === b));
  assert.ok(c.playCard(a, E(c).uid).ok, 'play goes on');
  assert.deepEqual(c.choose([a]), { ok: false, reason: 'no_choice' });
});

test('Check the Mag+: draw 3, discard 2; one uid (not an array) works for n = 1', () => {
  const c = mk();
  const [mag] = hand(c, ['check_mag+']);
  c.playCard(mag);
  assert.equal(c.state.hand.length, 3);
  assert.equal(c.state.choice.n, 2);
  assert.equal(c.state.choice.prompt, 'Discard 2 cards.');
  assert.ok(c.choose(c.state.choice.uids.slice(0, 2)).ok);
  assert.equal(c.state.hand.length, 1);
  const d = mk();
  const [m2] = hand(d, ['check_mag']);
  d.playCard(m2);
  assert.ok(d.choose(d.state.choice.uids[0]).ok);
});

test('a forced choice resolves without asking; no candidates, no choice', () => {
  const c = mk({ deck: [] }); // nothing to draw
  const [mag, a] = hand(c, ['check_mag', 'bat_swing']);
  const r = c.playCard(mag);
  assert.deepEqual(r, { ok: true });
  assert.equal(c.state.choice, null);
  assert.ok(c.state.discard.some(x => x.uid === a), 'the only card is discarded (Slay the Spire)');
  assert.ok(!c.takeEvents().some(e => e.t === 'choice'));
  const d = mk({ deck: [] });
  const [m2] = hand(d, ['check_mag']);
  assert.deepEqual(d.playCard(m2), { ok: true });
  assert.equal(d.state.hand.length, 0);
  assert.ok(d.state.discard.some(x => x.uid === m2));
});

test('Tough It Out: Block, then exhaust a chosen card (7 / 9)', () => {
  const c = mk();
  const [t, a, b] = hand(c, ['tough_it_out', 'bat_swing', 'panic']);
  c.playCard(t);
  assert.equal(P(c).block, 7);
  assert.equal(c.state.choice.kind, 'exhaust');
  assert.equal(c.state.choice.prompt, 'Exhaust a card.');
  assert.ok(c.state.choice.uids.includes(b), 'unplayable cards can be exhausted');
  assert.deepEqual(chooseFor(c), [b], 'the bot exhausts the status card first');
  c.choose([b]);
  assert.ok(c.state.exhaust.some(x => x.uid === b));
  assert.ok(c.state.discard.some(x => x.uid === t));
  assert.deepEqual(c.state.hand.map(x => x.uid), [a]);
  const d = mk();
  const [u] = hand(d, ['tough_it_out+', 'brace', 'brace']);
  d.playCard(u);
  assert.equal(P(d).block, 9);
  assert.match(describeCard({ id: 'tough_it_out', up: false }), /Exhaust.*a card/);
});

test('Wait for It: Block, then Retain up to 2 (optional); retained cards stay one end of turn', () => {
  const c = mk();
  const [w, a, b, d] = hand(c, ['wait_for_it', 'headshot', 'brace', 'bat_swing']);
  c.playCard(w);
  assert.equal(P(c).block, 6);
  const ch = c.state.choice;
  assert.equal(ch.kind, 'retain'); assert.equal(ch.n, 2); assert.equal(ch.min, 0); assert.equal(ch.optional, true);
  assert.deepEqual(c.choose([a, b, d]), { ok: false, reason: 'count' });
  assert.ok(c.choose([a, b]).ok);
  c.endTurn();
  const ids = c.state.hand.map(x => x.uid);
  assert.ok(ids.includes(a) && ids.includes(b), 'retained');
  assert.ok(!ids.includes(d), 'the other card was discarded');
  assert.equal(c.state.hand.length, 7, '2 kept + 5 drawn');
  // only for one turn
  c.endTurn();
  assert.ok(!c.state.hand.some(x => x.uid === a));
  // optional: choosing nothing is fine
  const e = mk();
  const [w2] = hand(e, ['wait_for_it', 'brace']);
  e.playCard(w2);
  assert.ok(e.state.choice.optional, 'an optional choice asks even with few cards');
  assert.ok(e.choose([]).ok);
});

test('upgrade choices upgrade the card for this fight only', () => {
  const c = mk();
  const [a, b] = hand(c, ['tackle', 'bat_swing']);
  assert.equal(c.beginChoice({ kind: 'upgrade', n: 1 }), true, 'opens without a card in limbo');
  assert.equal(c.state.choice.source, null);
  assert.ok(c.choose([a]).ok);
  const t = c.state.hand.find(x => x.uid === a);
  assert.equal(t.up, true);
  assert.equal(c.costOf(t), 0, 'Tackle+ costs 0');
  assert.ok(c.takeEvents().some(e => e.t === 'card_upgraded' && e.uid === a));
  assert.equal(c.run.deck.some(x => x.up), false, 'the run deck is untouched');
  assert.equal(c.state.limbo, null);
  assert.ok(b);
});

test('a fight that ends with a choice open puts the waiting card in the discard pile', () => {
  const c = mk();
  const [mag] = hand(c, ['check_mag', 'brace']);
  c.playCard(mag);
  c.forceWin();
  assert.equal(c.state.choice, null);
  assert.equal(c.state.limbo, null);
  assert.ok(c.state.discard.some(x => x.uid === mag));
});

test('the bots answer choices; copies of a fight with a choice open are independent', () => {
  const c = mk();
  const [mag] = hand(c, ['check_mag', 'panic', 'headshot']);
  c.playCard(mag);
  const k = cloneCombat(c);
  settleChoice(k);
  assert.equal(k.state.choice, null);
  assert.ok(c.state.choice, 'the original still waits');
  assert.ok(c.state.limbo.card !== k.state.limbo?.card);
  const pick = chooseFor(c);
  assert.equal(pick.length, 1);
  assert.equal(c.state.hand.find(h => h.uid === pick[0]).id, 'panic', 'junk goes first');
  settleChoice(c);
  assert.equal(c.state.choice, null);
});

test('Battering Ram: every Block gain hits a random zombie (not an attack: no Strength or Staggered)', () => {
  const c = mk({ enemies: ['shambler', 'shambler'] });
  P(c).statuses.strength = 5;
  E(c, 0).statuses.vulnerable = 2; E(c, 1).statuses.vulnerable = 2;
  const [ram, br] = hand(c, ['battering_ram', 'brace']);
  c.playCard(ram);
  assert.equal(P(c).statuses.battering_ram, 5);
  c.takeEvents();
  c.playCard(br);
  const hits = c.takeEvents().filter(e => e.t === 'damage' && e.target !== 'party');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].amount, 5);
  assert.equal(hits[0].kind, 'heavy');
  // end-of-turn Block (Thick Skin) rams too, and a kill by it wins the fight
  const d = mk({ enemies: ['biter'] });
  E(d).hp = 3;
  d.state.party.statuses.battering_ram = 7;
  d.gainBlock(4, { raw: true });
  assert.ok(d.won);
  assert.equal(cardView({ id: 'battering_ram', up: true }).effects[0].n, 7);
});

test('Barbed Wire: 12 Block, and each zombie hit is answered with 4 until your next turn', () => {
  const c = mk({ enemies: ['shield_guard'] });
  const g = E(c);
  g.statuses = {}; g.vars.mode = 'offensive';
  c.setIntent(g, 'baton_flurry'); // 5 x 4
  const [bw] = hand(c, ['barbed_wire']);
  c.playCard(bw);
  assert.equal(P(c).block, 12);
  assert.equal(P(c).statuses.barbed, 4);
  const hp = g.hp;
  c.endTurn();
  assert.equal(g.hp, hp - 16, '4 hits x 4');
  assert.equal(P(c).statuses.barbed, undefined, 'gone at the start of your turn');
});

test('changed numbers: Double Tap, Kneecap, Quick Shot, Flare, Deep Breath, Triage, Light on Feet', () => {
  const v = (id, up = false) => cardView({ id, up }).effects;
  assert.deepEqual(v('double_tap')[0], { op: 'damage', n: 3, times: 2, bonusStaggered: 3 });
  assert.deepEqual(v('double_tap', true)[0], { op: 'damage', n: 4, times: 2, bonusStaggered: 4 });
  assert.equal(v('kneecap')[0].n, 7); assert.equal(v('kneecap', true)[0].n, 9);
  assert.equal(v('quick_shot')[0].n, 4); assert.equal(v('quick_shot', true)[0].n, 7);
  assert.equal(v('flare')[0].n, 2); assert.equal(v('flare', true)[0].n, 3);
  assert.equal(cardView({ id: 'triage', up: false }).cost, 0);
  assert.equal(v('light_on_feet')[0].n, 2); assert.equal(v('light_on_feet', true)[0].n, 3);

  // Double Tap on a Staggered zombie: (3 + 3) x 1.5 = 9, twice
  const c = mk();
  E(c).statuses.vulnerable = 2;
  const [dt, fl, db, a] = hand(c, ['double_tap', 'flare', 'deep_breath', 'one_two']);
  c.playCard(dt, E(c).uid);
  assert.deepEqual(c.takeEvents().filter(e => e.t === 'damage').map(e => e.amount), [9, 9]);
  c.playCard(fl);
  assert.equal(E(c).statuses.weak, 2);
  const h = c.state.hand.length;
  c.playCard(db);
  assert.equal(P(c).statuses.strength, 2);
  assert.equal(c.state.hand.length, h - 1 + 1, 'Deep Breath draws a card');
  c.takeEvents();
  c.playCard(a, E(c).uid);
  assert.deepEqual(c.takeEvents().filter(e => e.t === 'damage').map(e => e.amount), [10, 10], '(5 + 2) x 1.5');
  assert.match(describeCard({ id: 'deep_breath', up: false }), /Draw 1 card/);
  assert.match(describeCard({ id: 'double_tap', up: false }), /twice, \+3 each if/);
});

test('Dig In previews the Block it adds', () => {
  const c = mk();
  P(c).block = 9;
  const [d] = hand(c, ['dig_in']);
  assert.equal(c.previewCard(d).block, 9);
});
