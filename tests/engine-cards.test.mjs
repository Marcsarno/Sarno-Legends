// Card effects that are more than "deal X / gain X": conditions, powers, this-turn effects, growth, healing,
// status cards. Every card is also played once against a dummy to prove nothing throws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../src/game/combat.js';
import { CARDS, cardView } from '../src/game/content/cards.js';

function mk({ deck = Array(20).fill('brace'), enemies = ['sprinter'], hp = 80, seed = 'T' } = {}) {
  const run = { seed, hp, maxHp: 80, weapons: {}, potions: [null, null, null], relics: [],
    deck: deck.map((id, i) => ({ uid: `c${i + 1}`, id, up: false })) };
  const c = createCombat({ run, encounter: { id: 'test', enemies }, rng: seed });
  c.start();
  for (const z of c.state.enemies) { z.hp = z.maxHp = 300; z.statuses = {}; z.block = 0; }
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
const dmgs = c => c.takeEvents().filter(e => e.t === 'damage' && e.target !== 'party').map(e => e.amount);

test('every card can be played (or is correctly unplayable), base and upgraded', () => {
  for (const id of Object.keys(CARDS)) {
    for (const up of [false, true]) {
      const c = mk({ enemies: ['shambler', 'biter'] });
      const [a] = hand(c, [id + (up ? '+' : '')]);
      const view = cardView({ id, up });
      const r = c.playCard(a, E(c).uid);
      if (view.keywords.includes('unplayable')) assert.deepEqual(r, { ok: false, reason: 'unplayable' }, id);
      else assert.ok(r.ok, `${id}${up ? '+' : ''}: ${JSON.stringify(r)}`);
      if (c.state.choice) assert.ok(c.choose(c.state.choice.uids.slice(0, c.state.choice.min)).ok, `${id}: choice`);
      assert.ok(c.over || c.endTurn().ok, id);
    }
  }
});

test('Kick the Door / Aimed Shot / Batter Up: bonus only on a Staggered target (checked before the hit)', () => {
  const c = mk();
  let [a] = hand(c, ['kick_the_door'], 1);
  c.state.draw = c.state.draw.slice(0, 5);
  c.playCard(a, E(c).uid);
  assert.equal(c.state.energy, 0); assert.equal(c.state.hand.length, 0);
  E(c).statuses.vulnerable = 1;
  [a] = hand(c, ['kick_the_door'], 1);
  c.playCard(a, E(c).uid);
  assert.equal(c.state.energy, 1); assert.equal(c.state.hand.length, 1);
  [a] = hand(c, ['aimed_shot']); c.playCard(a, E(c).uid);
  assert.equal(c.state.hand.length, 1);
  [a] = hand(c, ['batter_up']); c.takeEvents(); c.playCard(a, E(c).uid);
  assert.deepEqual(dmgs(c), [12, 12]);
  assert.equal(c.state.hand.length, 1);
});

test('Cover Him draws if any zombie is Staggered', () => {
  const c = mk({ enemies: ['sprinter', 'sprinter'] });
  let [a] = hand(c, ['cover_him']); c.playCard(a);
  assert.equal(c.state.hand.length, 0); assert.equal(P(c).block, 7);
  E(c, 1).statuses.vulnerable = 1;
  [a] = hand(c, ['cover_him']); c.playCard(a);
  assert.equal(c.state.hand.length, 1);
});

test('Deep Breath: Strength for this turn only (Pumped)', () => {
  const c = mk();
  const [a, b] = hand(c, ['deep_breath', 'bat_swing']);
  c.playCard(a);
  assert.deepEqual([P(c).statuses.strength, P(c).statuses.temp_strength], [2, 2]);
  c.takeEvents(); c.playCard(b, E(c).uid);
  assert.deepEqual(dmgs(c), [8]);
  c.state.hand = []; c.endTurn();
  assert.equal(P(c).statuses.strength, undefined);
  assert.equal(P(c).statuses.temp_strength, undefined);
});

test('Swing Guard: block per Attack this turn; Light on Feet: block per Skill; Thick Skin: block at end of turn', () => {
  const c = mk();
  let ids = hand(c, ['swing_guard', 'quick_shot', 'quick_shot', 'light_on_feet', 'brace', 'thick_skin']);
  c.playCard(ids[0]); c.playCard(ids[1], E(c).uid); c.playCard(ids[2], E(c).uid);
  assert.equal(P(c).block, 6);
  c.playCard(ids[3]); c.playCard(ids[4]);
  assert.equal(P(c).block, 6 + 5 + 2);
  c.playCard(ids[5]);
  assert.equal(P(c).statuses.thick_skin, 3);
  c.takeEvents(); c.endTurn();
  const evs = c.takeEvents();
  assert.ok(evs.some(e => e.t === 'block' && e.target === 'party' && e.amount === 3));
  assert.equal(P(c).statuses.swing_guard, undefined, 'Swing Guard ends with the turn');
  [ids[0]] = hand(c, ['quick_shot']);
  const before = P(c).block;
  c.playCard(ids[0], E(c).uid);
  assert.equal(P(c).block, before);
});

test('Berserker gives Strength each turn start; Fortify keeps Block; Pumped Up, Painkillers', () => {
  const c = mk();
  const ids = hand(c, ['berserker', 'fortify', 'pumped_up', 'painkillers']);
  for (const id of ids) c.playCard(id);
  assert.equal(P(c).statuses.strength, 2);
  assert.equal(P(c).statuses.dexterity, 2);
  assert.equal(c.state.powers.length, 4, 'powers leave play');
  P(c).block = 20;
  c.state.hand = []; c.endTurn();
  assert.equal(P(c).statuses.strength, 4);
  assert.equal(P(c).block, 20 - 9);
});

test('Marksman and Dead Eye: Staggered payoffs', () => {
  const c = mk({ deck: Array(20).fill('brace') });
  const ids = hand(c, ['marksman', 'dead_eye', 'quick_shot', 'quick_shot', 'quick_shot', 'quick_shot']);
  c.playCard(ids[0]); c.playCard(ids[1]);
  c.playCard(ids[2], E(c).uid);
  assert.equal(c.state.hand.length, 3, 'not Staggered: no draw');
  E(c).statuses.vulnerable = 3;
  c.takeEvents();
  c.playCard(ids[3], E(c).uid);
  assert.deepEqual(dmgs(c), [Math.floor((4 + 3) * 1.5)]);
  c.playCard(ids[4], E(c).uid);
  c.playCard(ids[5], E(c).uid);
  assert.equal(c.state.hand.length, 2, 'two draws, then no more this turn');
});

test('Dig In doubles Block; Rally doubles Strength; Wrench Arm takes Strength away', () => {
  const c = mk();
  P(c).block = 7; P(c).statuses.strength = 3;
  const ids = hand(c, ['dig_in', 'rally', 'wrench_arm']);
  c.playCard(ids[0]); c.playCard(ids[1]); c.playCard(ids[2], E(c).uid);
  assert.equal(P(c).block, 14);
  assert.equal(P(c).statuses.strength, 6);
  assert.equal(E(c).statuses.strength, -2);
  assert.ok(c.state.exhaust.some(x => x.id === 'rally') && c.state.exhaust.some(x => x.id === 'wrench_arm'));
  const d = mk(); d.state.party.statuses.strength = 1;
  const [r] = hand(d, ['rally+']); d.playCard(r);
  assert.ok(d.state.discard.some(x => x.id === 'rally'), 'upgraded Rally does not exhaust');
});

test('Grit Teeth, Overdrive, Triage, Defibrillator, Adrenaline Shot', () => {
  const c = mk({ hp: 50, deck: Array(30).fill('brace') });
  const ids = hand(c, ['grit_teeth', 'overdrive', 'triage', 'defibrillator', 'adrenaline_shot'], 0);
  c.playCard(ids[0]);
  assert.deepEqual([P(c).hp, c.state.energy], [47, 2]);
  c.playCard(ids[1]);
  assert.deepEqual([P(c).hp, c.state.energy, c.state.hand.length], [41, 4, 6]);
  c.playCard(ids[2]); c.playCard(ids[3]);
  assert.equal(P(c).hp, 41 + 4 + 12);
  c.playCard(ids[4]);
  assert.equal(c.state.energy, 4 - 0 - 2 + 1, 'Triage costs 0 (Bandage Up)');
  for (const id of ['overdrive', 'triage', 'defibrillator', 'adrenaline_shot']) assert.ok(c.state.exhaust.some(x => x.id === id), id);
});

test('Momentum grows each play this fight; Make It Count only rewards a kill', () => {
  const c = mk();
  const [a] = hand(c, ['momentum']);
  c.takeEvents();
  c.playCard(a, E(c).uid);
  const card = c.state.discard.find(x => x.uid === a);
  c.state.discard = c.state.discard.filter(x => x !== card);
  c.state.hand = [card];
  assert.equal(c.previewCard(a, E(c).uid).ops[0].base, 13);
  c.playCard(a, E(c).uid);
  assert.deepEqual(dmgs(c), [8, 13]);
  const [m] = hand(c, ['make_it_count']); c.playCard(m, E(c).uid);
  assert.equal(P(c).maxHp, 80);
  const d = mk({ enemies: ['sprinter', 'sprinter'] });
  E(d).hp = 5;
  const [k] = hand(d, ['make_it_count']); d.playCard(k, E(d).uid);
  assert.deepEqual([P(d).maxHp, P(d).hp], [83, 83], 'raise max HP and heal the same amount');
});

test('Clean Kill: +1 energy and draw 2 on a kill', () => {
  const c = mk({ enemies: ['sprinter', 'sprinter'] });
  E(c).hp = 5;
  const [a] = hand(c, ['clean_kill'], 1);
  c.playCard(a, E(c).uid);
  assert.equal(c.state.energy, 1);
  assert.equal(c.state.hand.length, 2);
});

test('Slow Motion: hand costs 0 this turn, no more draws, costs return next turn', () => {
  const c = mk();
  const ids = hand(c, ['slow_motion', 'grand_slam', 'hold_the_line'], 3);
  c.playCard(ids[0]);
  assert.equal(c.costOf(ids[1]), 0);
  c.playCard(ids[1], E(c).uid);
  c.playCard(ids[2]);
  assert.equal(c.state.hand.length, 0, 'Hold the Line draws nothing');
  assert.equal(c.state.energy, 0);
  c.endTurn();
  const gs = c.findCard(ids[1]);
  assert.equal(c.costOf(gs), 3);
  assert.equal(c.state.hand.length, 5);
});

test('AoE and random: Wild Swing, Ground Pound, Suppressing Fire, Spray and Pray, Covering Fire', () => {
  const c = mk({ enemies: ['sprinter', 'sprinter', 'sprinter'] });
  let [a] = hand(c, ['ground_pound']); c.takeEvents(); c.playCard(a);
  assert.deepEqual(dmgs(c), [4, 4, 4]);
  assert.ok(c.state.enemies.every(z => z.statuses.vulnerable === 1));
  [a] = hand(c, ['wild_swing']); c.playCard(a);
  assert.deepEqual(dmgs(c), [12, 12, 12]);
  [a] = hand(c, ['suppressing_fire']); c.playCard(a);
  assert.ok(c.state.enemies.every(z => z.statuses.weak === 1));
  c.takeEvents();
  [a] = hand(c, ['spray_and_pray']); c.playCard(a);
  const evs = c.takeEvents();
  assert.equal(evs.filter(e => e.t === 'damage').length, 3);
  assert.equal(evs.filter(e => e.t === 'attack').length, 3, 'one shot event per random hit');
  [a] = hand(c, ['covering_fire']); c.playCard(a);
  assert.equal(P(c).block, 4);
});

test('Infection hurts while held; Bile is a dead card that exhausts', () => {
  const c = mk();
  c.state.hand = [c.makeCombatCard({ uid: 'inf', id: 'infection' }), c.makeCombatCard({ uid: 'bile', id: 'bile' })];
  c.state.energy = 3;
  assert.ok(c.playCard('bile').ok);
  assert.ok(c.state.exhaust.some(x => x.uid === 'bile'));
  c.takeEvents();
  c.endTurn();
  const self = c.takeEvents().find(e => e.t === 'damage' && e.target === 'party' && e.kind === 'self');
  assert.equal(self.amount, 1);
});
