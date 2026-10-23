// Every relic's trigger, every potion, and every weapon passive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../src/game/combat.js';
import { RELICS, relicPool, weaponRelics } from '../src/game/content/relics.js';
import { POTIONS, potionPool, rollPotion } from '../src/game/content/potions.js';
import { WEAPONS, weaponsFor } from '../src/game/content/weapons.js';
import { CARDS } from '../src/game/content/cards.js';
import { makeRng } from '../src/game/rng.js';
import { describeRelic, describePotion } from '../src/game/text.js';

function mk({ deck = Array(10).fill('brace'), enemies = ['sprinter'], relics = [], potions = [null, null, null], weapons = {}, hp = 80, maxHp = 80, seed = 'T', counters = {} } = {}) {
  const run = { seed, hp, maxHp, weapons, potions,
    deck: deck.map((id, i) => ({ uid: `c${i + 1}`, id: id.replace('+', ''), up: id.endsWith('+') })),
    relics: relics.map(id => ({ id, counter: counters[id] ?? 0 })) };
  const c = createCombat({ run, encounter: { id: 'test', enemies }, rng: seed });
  c.start();
  for (const z of c.state.enemies) { z.hp = z.maxHp = 300; }
  return c;
}
let seq = 0;
function hand(c, ids, energy = 99) {
  c.state.hand = ids.map(id => c.makeCombatCard({ uid: `h${++seq}`, id: id.replace('+', ''), up: id.endsWith('+') }));
  c.state.energy = energy;
  return c.state.hand.map(x => x.uid);
}
const E = (c, i = 0) => c.state.enemies[i];
const pass = c => { c.state.hand = []; c.endTurn(); };
const lastDamage = c => c.takeEvents().filter(e => e.t === 'damage' && e.target !== 'party').map(e => e.amount);

// ---------------------------------------------------------------- relics

test("Nurse's Kit heals 6 after a win, not after a loss", () => {
  const c = mk({ relics: ['nurses_kit'], hp: 50 });
  c.forceWin();
  assert.equal(c.result().hp, 56);
  const d = mk({ relics: ['nurses_kit'], hp: 50 });
  d.forceLose();
  assert.equal(d.result().hp, 0);
});

test('combat-start relics: Duct Tape, Pager, Protein Bar, Knee Brace, IV Bag', () => {
  const c = mk({ relics: ['duct_tape', 'pager', 'protein_bar', 'knee_brace', 'iv_bag'], enemies: ['biter', 'sprinter'], hp: 50 });
  assert.equal(c.state.party.block, 10);
  for (const z of c.state.enemies) assert.equal(z.statuses.vulnerable, 1);
  assert.equal(c.state.party.statuses.strength, 1);
  assert.equal(c.state.party.statuses.dexterity, 1);
  assert.equal(c.state.party.hp, 52);
  const relicEvents = c.takeEvents().filter(e => e.t === 'relic').map(e => e.id);
  assert.deepEqual(relicEvents, ['duct_tape', 'pager', 'protein_bar', 'knee_brace', 'iv_bag']);
});

test('first-turn relics: Coffee Thermos +1 energy, Stethoscope +2 cards, Door Wedge on turn 2', () => {
  const c = mk({ relics: ['coffee_thermos', 'stethoscope', 'door_wedge'], deck: Array(20).fill('brace') });
  assert.equal(c.state.energy, 4);
  assert.equal(c.state.hand.length, 7);
  pass(c);
  assert.equal(c.state.energy, 3);
  assert.equal(c.state.hand.length, 5);
  assert.equal(c.state.party.block, 14);
});

test('run relics: Granola Bar, Coin Jar, Staff Badge, Doctor\'s Note', () => {
  const run = { hp: 60, maxHp: 80, gold: 10 };
  RELICS.granola.onPickup(run);
  assert.deepEqual([run.hp, run.maxHp], [67, 87]);
  RELICS.coin_jar.onCardAdded(run, { id: 'bat_swing' });
  assert.equal(run.gold, 19);
  assert.equal(RELICS.staff_badge.shopDiscount, 0.5);
  assert.equal(RELICS.doctors_note.removalCost, 50);
});

test('Tally Marks: the 10th Attack deals double, then the count starts over (and carries between fights)', () => {
  const c = mk({ relics: ['tally_marks'], counters: { tally_marks: 8 } });
  let [a] = hand(c, ['bat_swing']); c.takeEvents(); c.playCard(a, E(c).uid);
  assert.deepEqual(lastDamage(c), [6]);
  assert.equal(c.state.relics.find(r => r.id === 'tally_marks').counter, 9);
  [a] = hand(c, ['one_two']);
  assert.equal(c.previewCard(a, E(c).uid).total, 20);
  c.playCard(a, E(c).uid);
  assert.deepEqual(lastDamage(c), [10, 10]);
  assert.equal(c.result().relicCounters.tally_marks, 0);
  [a] = hand(c, ['brace']); c.playCard(a);
  assert.equal(c.result().relicCounters.tally_marks, 0, 'skills do not count');
});

test('Riot Vest: 6 block when a turn ends with none', () => {
  const c = mk({ relics: ['riot_vest'] });
  c.takeEvents(); pass(c);
  const hit = c.takeEvents().find(e => e.t === 'damage' && e.target === 'party');
  assert.deepEqual([hit.blocked, hit.amount], [6, 3]);
  const d = mk({ relics: ['riot_vest'] });
  d.state.party.block = 2; d.takeEvents(); pass(d);
  assert.ok(!d.takeEvents().some(e => e.t === 'relic' && e.id === 'riot_vest'));
});

test('Combo Counter: every 3rd Attack in a turn gives 1 Strength; Box Cutter: every 3rd Skill hits ALL for 5 (pure)', () => {
  const c = mk({ relics: ['combo_counter', 'box_cutter'], enemies: ['sprinter', 'sprinter'] });
  const ids = hand(c, ['quick_shot', 'quick_shot', 'quick_shot', 'quick_shot']);
  for (const id of ids) c.playCard(id, E(c).uid);
  assert.equal(c.state.party.statuses.strength, 1);
  pass(c);
  const [s1, s2] = hand(c, ['quick_shot', 'quick_shot']);
  c.playCard(s1, E(c).uid); c.playCard(s2, E(c).uid);
  assert.equal(c.state.party.statuses.strength, 1, 'counter resets each turn');
  E(c, 1).statuses.vulnerable = 3;
  const hp = E(c, 1).hp;
  const sk = hand(c, ['deep_breath', 'deep_breath', 'deep_breath']);
  c.takeEvents();
  for (const id of sk) c.playCard(id);
  assert.equal(E(c, 1).hp, hp - 5, 'Staggered does not boost it');
  assert.ok(c.takeEvents().some(e => e.t === 'relic' && e.id === 'box_cutter'));
});

test('Trophy Belt: +1 energy and a card when a zombie dies (not the last one)', () => {
  const c = mk({ relics: ['trophy_belt'], enemies: ['biter', 'biter'], deck: Array(20).fill('brace') });
  E(c, 0).hp = 1;
  const [a] = hand(c, ['quick_shot'], 1);
  c.playCard(a, E(c, 0).uid);
  assert.equal(c.state.energy, 2, 'Quick Shot costs 0, the belt gives 1');
  assert.equal(c.state.hand.length, 1);
});

test('Emergency Rations: heal 12 when a fight ends at 50% or less', () => {
  const c = mk({ relics: ['emergency_rations', 'nurses_kit'], hp: 40 });
  c.forceWin();
  assert.equal(c.result().hp, 58);
  const d = mk({ relics: ['emergency_rations'], hp: 41 });
  d.forceWin();
  assert.equal(d.result().hp, 41);
});

test('Steel Plate: every HP loss is 1 less (attacks, self-damage)', () => {
  const c = mk({ relics: ['steel_plate'] });
  pass(c);
  assert.equal(c.state.party.hp, 80 - 8);
  const [a] = hand(c, ['grit_teeth']); c.playCard(a);
  assert.equal(c.state.party.hp, 72 - 2);
});

test('Defib Pads: once per run, heal to 50% instead of dying', () => {
  const c = mk({ relics: ['defib_pads'], hp: 5 });
  pass(c);
  assert.equal(c.state.phase, 'player');
  assert.equal(c.state.party.hp, 40);
  assert.equal(c.result().relicCounters.defib_pads, -1);
  const d = mk({ relics: ['defib_pads'], hp: 5, counters: { defib_pads: -1 } });
  pass(d);
  assert.equal(d.state.phase, 'lost');
});

test('Cooler: unspent energy carries over', () => {
  const c = mk({ relics: ['cooler'] });
  c.state.hand = [];
  c.state.energy = 2;
  c.endTurn();
  assert.equal(c.state.energy, 5);
});

test('every relic has a name, rarity and text; pools exclude starter and weapons', () => {
  for (const r of Object.values(RELICS)) {
    assert.ok(r.name && r.rarity && r.text, r.id);
    assert.ok(describeRelic(r.id).length > 5);
  }
  assert.ok(!relicPool('common').includes('nurses_kit'));
  assert.ok(relicPool('common').includes('riot_vest'));
  assert.ok(relicPool('uncommon').includes('hollow_points'));
  assert.deepEqual(relicPool('shop').sort(), ['doctors_note', 'staff_badge']);
  assert.ok(!relicPool('common', [{ id: 'pager' }]).includes('pager'));
  assert.deepEqual(weaponRelics({ marc: 'crowbar', yola: 'pistol' }), ['crowbar', 'pistol']);
});

// ---------------------------------------------------------------- weapons

test('Wood Bat: the first Bat Swing each fight deals double (and previews it)', () => {
  const c = mk({ weapons: { marc: 'wood_bat' } });
  const [a, b] = hand(c, ['bat_swing', 'bat_swing']);
  assert.equal(c.previewCard(a, E(c).uid).total, 12);
  assert.equal(c.previewCard(b, E(c).uid).total, 6); // only the first Bat Swing in hand previews double
  c.takeEvents();
  c.playCard(a, E(c).uid);
  assert.deepEqual(lastDamage(c), [12]);
  assert.equal(c.previewCard(b, E(c).uid).total, 6);
  c.playCard(b, E(c).uid);
  assert.deepEqual(lastDamage(c), [6]);
});

test('Wire-and-Tape Bat: Marc deals +2 to Bleeding zombies; Nail Swing makes them Bleed', () => {
  const c = mk({ weapons: { marc: 'wire_bat' } });
  const [a, b, d] = hand(c, ['barbed_swing', 'barbed_swing', 'pistol_shot']);
  c.takeEvents();
  c.playCard(a, E(c).uid);
  assert.deepEqual(lastDamage(c), [6]);
  assert.equal(E(c).statuses.bleed, 2);
  c.playCard(b, E(c).uid);
  assert.deepEqual(lastDamage(c), [8]);
  c.playCard(d, E(c).uid);
  assert.deepEqual(lastDamage(c), [6], 'Yola gets no bonus');
});

test('Crowbar: the first Attack each fight also applies 2 Staggered (after it lands)', () => {
  const c = mk({ weapons: { marc: 'crowbar' } });
  const [a, b] = hand(c, ['pistol_shot', 'pistol_shot']);
  c.takeEvents();
  c.playCard(a, E(c).uid);
  assert.deepEqual(lastDamage(c), [6]);
  assert.equal(E(c).statuses.vulnerable, 2);
  c.playCard(b, E(c).uid);
  assert.deepEqual(lastDamage(c), [9]);
  assert.equal(E(c).statuses.vulnerable, 2, 'only the first');
});

test('Fire Axe: Marc +2 damage, start with 1 Shaken; Sledgehammer: 1 less energy on turn 1', () => {
  const c = mk({ weapons: { marc: 'fire_axe' } });
  assert.equal(c.state.party.statuses.frail, 1);
  const [a, b, d] = hand(c, ['bat_swing', 'pistol_shot', 'brace']);
  c.takeEvents();
  c.playCard(a, E(c).uid); assert.deepEqual(lastDamage(c), [8]);
  c.playCard(b, E(c).uid); assert.deepEqual(lastDamage(c), [6]);
  c.playCard(d);
  assert.equal(c.state.party.block, 3, 'Shaken 5 -> 3');
  pass(c);
  assert.equal(c.state.party.statuses.frail, undefined, 'Shaken gone after the first round');
  const s = mk({ weapons: { marc: 'sledgehammer' } });
  assert.equal(s.state.energy, 2);
  pass(s);
  assert.equal(s.state.energy, 3);
});

test('Sawed-Off: Yola deals +3 to Staggered zombies (before the x1.5)', () => {
  const c = mk({ weapons: { yola: 'sawed_off' } });
  E(c).statuses.vulnerable = 2;
  const [a, b] = hand(c, ['pistol_shot', 'bat_swing']);
  c.takeEvents();
  c.playCard(a, E(c).uid); assert.deepEqual(lastDamage(c), [Math.floor(9 * 1.5)]);
  c.playCard(b, E(c).uid); assert.deepEqual(lastDamage(c), [9]);
  const [d] = hand(c, ['both_barrels']);
  c.playCard(d, E(c).uid);
  assert.deepEqual(lastDamage(c), [Math.floor((7 + 4 + 3) * 1.5), Math.floor((7 + 4 + 3) * 1.5)]);
});

test('weapons: each is a weapon relic with valid swaps and an Armory tree', () => {
  for (const w of Object.values(WEAPONS)) {
    assert.equal(RELICS[w.id].rarity, 'weapon', w.id);
    assert.equal(RELICS[w.id].hero, w.hero);
    for (const s of w.swaps) { assert.ok(CARDS[s.from] && CARDS[s.to], w.id); assert.equal(CARDS[s.to].rarity, 'weapon'); }
    if (w.requires) assert.equal(WEAPONS[w.requires].hero, w.hero);
  }
  assert.deepEqual(weaponsFor('marc').map(w => w.id), ['wood_bat', 'nail_bat', 'crowbar', 'wire_bat', 'fire_axe', 'sledgehammer']);
  assert.deepEqual(weaponsFor('yola').map(w => w.id), ['pistol', 'shotgun', 'sawed_off']);
  // weapons are relics in combat even when run.relics doesn't list them, and never twice
  const c = mk({ weapons: { marc: 'wood_bat', yola: 'pistol' }, relics: ['wood_bat', 'nurses_kit'] });
  assert.deepEqual(c.state.relics.map(r => r.id), ['wood_bat', 'pistol', 'nurses_kit']);
});

// ---------------------------------------------------------------- potions

test('potions: each one does what it says', () => {
  const use = (id, setup) => {
    const c = mk({ potions: [id, null, null], enemies: ['sprinter', 'sprinter'], hp: 40, deck: Array(20).fill('brace') });
    if (setup) setup(c);
    c.takeEvents();
    const r = c.usePotion(0);
    assert.ok(r.ok, id);
    assert.equal(c.state.potions[0], null);
    const evs = c.takeEvents();
    assert.equal(evs[0].t, 'potion');
    return c;
  };
  assert.equal(use('medkit').state.party.hp, 56);
  assert.equal(use('adrenaline').state.energy, 5);
  assert.ok(use('extinguisher').state.enemies.every(z => z.statuses.weak === 2));
  assert.ok(use('flashbang').state.enemies.every(z => z.statuses.vulnerable === 2));
  assert.equal(use('energy_drink').state.hand.length, 8);
  assert.equal(use('body_armor', c => { c.state.party.statuses.frail = 2; }).state.party.block, 12);
  const pb = use('pipe_bomb', c => { E(c, 0).statuses.vulnerable = 2; });
  assert.ok(pb.state.enemies.every(z => z.hp === 290), 'pure: Staggered does not boost it');
  assert.equal(use('protein_shake').state.party.statuses.strength, 2);
  assert.equal(use('painkiller_pills').state.party.statuses.dexterity, 2);
});

test('Epi-Pen: cannot be drunk; when you would die it heals you to 30%', () => {
  const c = mk({ potions: [null, 'epi_pen', null], hp: 3 });
  assert.deepEqual(c.usePotion(1), { ok: false, reason: 'unusable' });
  c.takeEvents(); pass(c);
  assert.equal(c.state.phase, 'player');
  assert.equal(c.state.party.hp, 24);
  assert.deepEqual(c.state.potions, [null, null, null]);
  assert.ok(c.takeEvents().some(e => e.t === 'potion' && e.id === 'epi_pen' && e.auto));
});

test('potion slots: empty and discard; rarity roll 65/25/10', () => {
  const c = mk({ potions: ['medkit', null, 'adrenaline'] });
  assert.deepEqual(c.usePotion(1), { ok: false, reason: 'empty' });
  assert.ok(c.discardPotion(2).ok);
  assert.deepEqual(c.state.potions, ['medkit', null, null]);
  for (const p of Object.values(POTIONS)) assert.ok(p.name && p.text && describePotion(p.id), p.id);
  assert.equal(potionPool().length, 10);
  const rng = makeRng('POT'); const tally = { common: 0, uncommon: 0, rare: 0 };
  for (let i = 0; i < 5000; i++) tally[POTIONS[rollPotion(rng)].rarity]++;
  assert.ok(Math.abs(tally.common / 5000 - 0.65) < 0.03 && Math.abs(tally.rare / 5000 - 0.1) < 0.02, JSON.stringify(tally));
});
