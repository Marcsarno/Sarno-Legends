// Regressions from the adversarial logic review of src/game (2026-10-23): one test per bug found, each written to
// fail before its fix. Run: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../src/game/combat.js';
import { cardPool } from '../src/game/content/cards.js';
import * as R from '../src/game/run.js';

function mk({ deck = ['bat_swing', 'bat_swing', 'bat_swing', 'bat_swing', 'bat_swing', 'brace', 'brace', 'brace'], enemies = ['shambler'],
  relics = [], potions = [null, null, null], hp = 80, seed = 'REG' } = {}) {
  const run = { seed, hp, maxHp: 80, weapons: {}, potions,
    deck: deck.map((id, i) => ({ uid: `c${i + 1}`, id, up: false })), relics: relics.map(id => ({ id, counter: 0 })) };
  const c = createCombat({ run, encounter: { id: 'test', enemies }, rng: seed });
  c.start();
  return c;
}
function hand(c, ids, energy = 99) {
  c.state.hand = ids.map((id, i) => c.makeCombatCard({ uid: `h${i + 1}`, id, up: false }));
  c.state.energy = energy;
  return c.state.hand.map(x => x.uid);
}

// ---------------------------------------------------------------- run layer

test('run rng: two handles on one stream continue one sequence (the shop no longer reuses its rarity roll as its pick)', () => {
  const run = R.createRun({ seed: 'RNG', neow: false });
  const a = R.runRng(run, 'cards'), b = R.runRng(run, 'cards');
  assert.notEqual(a.next(), b.next(), 'a second handle must not replay the first one\'s number');

  // before the fix the shop's card pick reused the rarity roll, so a rare was always the first rare in its pool
  const seen = new Set();
  for (let i = 0; i < 600; i++) {
    const r = R.createRun({ seed: `SHOP${i}`, neow: false });
    R.forceRoom(r, 'shop');
    for (const c of r.shop.cards) seen.add(c.card.id);
  }
  const never = cardPool({}).filter(id => !seen.has(id));
  assert.deepEqual(never, [], `cards the Pharmacy never sold in 600 visits: ${never.join(', ')}`);
});

test('shop card removal logs the price that was paid, not the next one', () => {
  const run = R.createRun({ seed: 'RM', neow: false });
  R.forceRoom(run, 'shop');
  run.gold = 500;
  const before = run.gold;
  assert.ok(R.shopRemove(run, run.deck[0].uid).ok);
  const entry = run.stats.log.filter(e => e.t === 'buy' && e.kind === 'removal').at(-1);
  assert.equal(entry.price, before - run.gold);
  assert.equal(entry.price, 75);
});

test('A Note on the Wall: putting the cards back and reading again shows the same three cards (no free re-roll)', () => {
  const run = R.createRun({ seed: 'NOTE', neow: false });
  R.forceRoom(run, null, { event: 'survivor_note' });
  R.chooseEvent(run, 0);
  const first = run.pending.picker.cards.map(c => c.id);
  assert.ok(R.eventPick(run, null).ok, 'cancel');
  R.chooseEvent(run, 0);
  assert.deepEqual(run.pending.picker.cards.map(c => c.id), first);
  // and it still saves / loads mid-pick
  const loaded = R.deserialize(R.serialize(run));
  assert.deepEqual(loaded.pending.picker.cards.map(c => c.id), first);
});

// ---------------------------------------------------------------- combat engine

test('event contract: damage hit/hits count within the attack event before them (random volleys too)', () => {
  const c = mk({ enemies: ['biter', 'biter', 'biter'] });
  for (const e of c.state.enemies) { e.hp = e.maxHp = 200; e.statuses = {}; }
  c.takeEvents();
  for (const id of ['spray_and_pray', 'double_tap', 'wild_swing', 'triple_tap', 'bat_swing']) {
    const [u] = hand(c, [id]);
    assert.ok(c.playCard(u, 'e2').ok, id);
    let atk = null;
    for (const e of c.takeEvents()) {
      if (e.t === 'attack') atk = e;
      if (e.t === 'damage' && e.target !== 'party') {
        assert.ok(atk, `${id}: a damage event needs an attack event first`);
        assert.equal(e.hits, atk.hits, `${id}: damage.hits must match its attack event (the director counts follow-up swings from it)`);
        assert.ok(e.hit >= 1 && e.hit <= atk.hits, `${id}: hit ${e.hit} of ${atk.hits}`);
      }
    }
  }
});

test('Nurse revive: the revived zombie shows one intent, kept into the next turn (not re-rolled at the end of the turn)', () => {
  const c = mk({ enemies: ['biter', 'nurse', 'biter'] });
  const [nurse, dead] = [c.state.enemies[1], c.state.enemies[2]];
  const [u] = hand(c, ['grand_slam']);
  c.playCard(u, dead.uid);
  assert.equal(dead.alive, false);
  c.setIntent(nurse, 'revive');
  c.takeEvents();
  c.endTurn();
  const evs = c.takeEvents();
  const shown = evs.filter(e => e.t === 'intent' && e.uid === dead.uid);
  assert.ok(dead.alive, 'revived');
  assert.equal(shown.length, 1, 'one intent for the revived zombie this turn');
  assert.equal(dead.intent.move, shown[0].intent.move);
});

test('Trophy Belt: a zombie that bleeds out on the zombies\' turn still pays its energy (on the next turn)', () => {
  const c = mk({ enemies: ['shambler', 'shambler'], relics: ['trophy_belt'] });
  const z = c.state.enemies[0];
  z.hp = 2;
  z.statuses.bleed = 5;
  c.endTurn();
  assert.equal(z.alive, false);
  assert.equal(c.state.phase, 'player');
  assert.equal(c.state.energy, 4, '3 + 1 from the Trophy Belt');
  assert.equal(c.state.hand.length, 6, 'the extra card waits in hand too');
  c.endTurn();
  assert.equal(c.state.energy, 3, 'only once');
});

test('nothing is emitted after combat_end (a card that loses the fight leaves play quietly)', () => {
  const tail = c => { const evs = c.takeEvents(); const i = evs.findIndex(e => e.t === 'combat_end'); return i < 0 ? null : evs.slice(i + 1).map(e => e.t); };
  // Grit Teeth at 3 HP
  let c = mk({ hp: 3 });
  let [u] = hand(c, ['grit_teeth']);
  c.takeEvents();
  c.playCard(u);
  assert.equal(c.state.phase, 'lost');
  assert.deepEqual(tail(c), []);
  assert.ok(c.state.discard.some(x => x.uid === u), 'the card still moved to its pile');
  // Kneecap into Spiked at 2 HP: Weakened changes the zombie's intent, but the fight is already over
  c = mk({ hp: 2, enemies: ['shield_guard'] });
  c.state.enemies[0].statuses.thorns = 3;
  c.state.enemies[0].statuses.mode_shift = 999;
  [u] = hand(c, ['kneecap']);
  c.takeEvents();
  c.playCard(u);
  assert.equal(c.state.phase, 'lost');
  assert.deepEqual(tail(c), []);
});

test('Coin Jar supplies count in the run stats (supplies = 99 + earned - spent)', () => {
  const run = R.createRun({ seed: 'JAR', neow: false });
  R.addRelic(run, 'coin_jar');
  R.addCard(run, 'one_two');
  R.transformCard(run, run.deck[0].uid);
  assert.equal(run.gold, 99 + 18);
  assert.equal(run.gold, 99 + run.stats.goldEarned - run.stats.goldSpent);
});
