// Text rendering: card text (static, live, upgrade preview), keywords, statuses, intents.
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeCard, describeRelic, describePotion, describeStatus, describeIntent, intentNumber, cardKeywords, KEYWORDS, highlightKeywords } from '../src/game/text.js';
import { createCombat } from '../src/game/combat.js';
import { STATUSES } from '../src/game/content/statuses.js';
import { ENEMIES } from '../src/game/content/enemies.js';

const strip = s => s.replace(/<[^>]+>/g, '');

test('card text is short and clean', () => {
  assert.equal(strip(describeCard({ id: 'home_run' })), 'Deal 8 damage. Apply 2 Staggered.');
  assert.equal(strip(describeCard({ id: 'clean_shot' })), 'Deal 5 damage, +5 if Staggered.');
  assert.equal(strip(describeCard({ id: 'jaw_breaker', up: true })), 'Deal 13 damage. Apply 2 Weakened and 2 Staggered.');
  assert.equal(strip(describeCard({ id: 'one_two' })), 'Deal 5 damage twice.');
  assert.equal(strip(describeCard({ id: 'bolt_the_door' })), 'Gain 30 Block. Exhaust.');
  assert.equal(strip(describeCard({ id: 'rally', up: true })), 'Double your Strength.');
  assert.equal(strip(describeCard({ id: 'panic' })), 'Unplayable. Fleeting.');
  assert.equal(strip(describeCard({ id: 'spray_and_pray' })), 'Deal 3 damage to a random zombie 3 times.');
  assert.match(describeCard({ id: 'home_run' }), /<b class="kw" data-kw="Staggered">Staggered<\/b>/);
  assert.deepEqual(cardKeywords({ id: 'bolt_the_door' }), ['Block', 'Exhaust']);
});

test('upgrade preview marks raised numbers', () => {
  const html = describeCard({ id: 'home_run', up: true }, { upgradeDiff: true });
  assert.match(html, /num-up">10</);
  assert.match(describeCard({ id: 'brace', up: true }, { upgradeDiff: true }), /num-up">8</);
});

test('live numbers against a hovered zombie', () => {
  const run = { seed: 'X', hp: 80, maxHp: 80, weapons: {}, potions: [null, null, null], relics: [],
    deck: Array(6).fill(0).map((_, i) => ({ uid: `c${i}`, id: 'pistol_shot', up: false })) };
  const c = createCombat({ run, encounter: 'shambler_solo', rng: 'X' });
  c.start();
  const card = c.state.hand[0];
  const z = c.state.enemies[0];
  assert.match(describeCard(card, { combat: c, targetUid: z.uid }), /class="num">6</);
  z.statuses.vulnerable = 1;
  assert.match(describeCard(card, { combat: c, targetUid: z.uid }), /num-up">9</);
  c.state.party.statuses.weak = 1;
  z.statuses = {};
  assert.match(describeCard(card, { combat: c, targetUid: z.uid }), /num-down">4</);
});

test('relic, potion and status text; card names are not keyword-highlighted', () => {
  assert.equal(strip(describeRelic('pager')), 'At the start of each fight, apply 1 Staggered to ALL zombies.');
  assert.ok(!/data-kw="Block">Block<\/b>/.test(describeRelic('fire_axe').split('Chop Block')[0] + 'x') && describeRelic('fire_axe').includes('Chop Block'));
  assert.equal(strip(describePotion('flashbang')), 'Apply 2 Staggered to ALL zombies.');
  assert.equal(strip(describeStatus('vulnerable', 1)), 'Takes 50% more damage from attacks. 1 turn.');
  assert.equal(strip(describeStatus('vulnerable', 3)), 'Takes 50% more damage from attacks. 3 turns.');
  assert.equal(strip(describeStatus('strength', -2)), 'Attacks deal 2 less damage per hit.');
  for (const s of Object.values(STATUSES)) {
    assert.ok(strip(describeStatus(s.id, 2)).length > 10, s.id);
    assert.ok(KEYWORDS[s.name], s.name);
  }
  assert.equal(highlightKeywords('Gain Block.'), 'Gain <b class="kw" data-kw="Block">Block</b>.');
});

test('intent text and numbers', () => {
  assert.equal(strip(describeIntent({ type: 'attack', damage: 11, hits: 1, name: 'Bite Down', move: 'bite_down' })), 'Bite Down. Will attack for 11 damage.');
  assert.equal(strip(describeIntent({ type: 'attack', damage: 5, hits: 4, name: 'Baton Flurry' })), 'Baton Flurry. Will attack for 5 damage 4 times.');
  assert.equal(strip(describeIntent({ type: 'debuff', name: 'Spit', move: 'spit' }, { id: 'spitter' })), 'Spit. Will apply 2 Weakened.');
  assert.equal(strip(describeIntent({ type: 'debuff', name: 'Drain', move: 'drain' }, { id: 'sleeping_patient' })), 'Drain. Will make you lose 1 Strength and 1 Agility.');
  assert.equal(strip(describeIntent({ type: 'buff', name: 'Shriek', move: 'shriek' }, { id: 'screamer' })), 'Shriek. Will gain 3 Frenzy.');
  assert.equal(strip(describeIntent({ type: 'debuff', name: 'Pepper Spray', move: 'pepper_spray' }, { id: 'shield_guard' })), 'Pepper Spray. Will apply 2 Weakened and 2 Staggered.');
  assert.equal(intentNumber({ damage: 5, hits: 4 }), '5x4');
  assert.equal(intentNumber({ damage: 11, hits: 1 }), '11');
  assert.equal(intentNumber({ type: 'buff', damage: null }), '');
  for (const e of Object.values(ENEMIES)) for (const m of Object.values(e.moves)) {
    assert.ok(strip(describeIntent({ type: m.intent, name: m.name, move: m.id, damage: 1, hits: 1 }, e)).length > 5, `${e.id}.${m.id}`);
  }
});
