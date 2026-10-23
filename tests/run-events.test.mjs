// Locked rooms (content/events.js run by run.js): every event, every choice, pickers, event fights, loot.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/game/run.js';
import { EVENTS, EVENT_IDS } from '../src/game/content/events.js';
import { CARDS } from '../src/game/content/cards.js';
import { RELICS } from '../src/game/content/relics.js';

const at = (id, seed = 'EV', setup) => {
  const run = R.createRun({ seed, neow: false });
  if (setup) setup(run);
  R.forceRoom(run, 'event', { event: id });
  return run;
};
const choice = (run, label) => {
  const i = run.pending.choices.findIndex(c => c.label === label);
  assert.ok(i >= 0, `no choice "${label}" in ${run.pending.choices.map(c => c.label)}`);
  return R.chooseEvent(run, i);
};
const finish = run => { assert.equal(run.pending.done, true); assert.deepEqual(run.pending.choices, [{ label: 'Continue' }]); R.chooseEvent(run, 0); };

test('ten events, each with a title, a room, start text and plain-JSON choices', () => {
  assert.equal(EVENT_IDS.length, 10);
  for (const id of EVENT_IDS) {
    const run = at(id);
    const p = run.pending;
    assert.equal(run.screen, 'event'); assert.equal(p.kind, 'event'); assert.equal(p.id, id);
    assert.ok(p.title && p.room && p.text, id);
    assert.ok(p.choices.length >= 2);
    for (const c of p.choices) assert.ok(typeof c.label === 'string' && !('go' in c));
    assert.doesNotThrow(() => JSON.parse(R.serialize(run)));
    assert.ok(p.text.length < 140, `${id}: keep placeholder text short`);
  }
});

test('Vending Machine: 3 HP (+1 per try), 25% (+10% per try) for a relic; Walk away leaves at once', () => {
  let relics = 0, tries = 0;
  for (let s = 0; s < 60; s++) {
    const run = at('vending', `V${s}`);
    for (let k = 0; k < 6 && run.screen === 'event' && !run.pending.done; k++) {
      const taken = run.stats.damageTaken;
      const cost = 3 + k;
      assert.match(run.pending.choices[0].desc, new RegExp(`Lose ${cost} HP. ${25 + 10 * k}%`));
      choice(run, 'Smash it');
      tries++;
      assert.equal(run.stats.damageTaken, taken + cost);
      assert.equal(run.pending.result[0].text, `-${cost} HP`);
    }
    if (run.pending?.done) { relics++; assert.equal(run.relics.length, 2); finish(run); assert.equal(run.screen, 'map'); }
  }
  assert.ok(relics > 30, `relics ${relics}`);
  const run = at('vending');
  choice(run, 'Walk away');
  assert.equal(run.screen, 'map');
  const low = at('vending', 'V', r => { r.hp = 3; });
  assert.equal(low.pending.choices[0].disabled, true);
  assert.equal(R.chooseEvent(low, 0).reason, 'disabled');
});

test('Break Room: coffee heals a third, donuts +5 Max HP, the snack box is a relic and an Infection', () => {
  let run = at('break_room', 'B', r => { r.hp = 20; });
  choice(run, 'Coffee'); assert.equal(run.hp, 20 + 26); assert.deepEqual(run.pending.result, [{ text: '+26 HP', tone: 'good' }]); finish(run);
  run = at('break_room');
  choice(run, 'Donuts'); assert.equal(run.maxHp, 85); assert.equal(run.hp, 85);
  run = at('break_room');
  choice(run, 'Grab the snack box');
  assert.equal(run.relics.length, 2); assert.equal(run.deck.at(-1).id, 'infection');
  assert.ok(run.pending.result.some(r => r.tone === 'bad'));
});

test('A Doctor Who Stayed: 35 heals 25%, 50 removes a card (cancel costs nothing), greyed out when short', () => {
  let run = at('wounded_doctor', 'D', r => { r.hp = 30; });
  choice(run, 'Treatment'); assert.equal(run.gold, 64); assert.equal(run.hp, 50); finish(run);
  run = at('wounded_doctor');
  choice(run, 'Cut it out');
  assert.equal(run.pending.picker.mode, 'remove'); assert.equal(run.gold, 99, 'pays on the pick');
  assert.ok(R.chooseEvent(run, 0).reason === 'picker');
  assert.ok(R.eventPick(run, null).cancelled);
  assert.equal(run.gold, 99); assert.equal(run.pending.picker, null);
  choice(run, 'Cut it out');
  const uid = run.deck[0].uid;
  R.eventPick(run, uid);
  assert.equal(run.gold, 49); assert.equal(run.deck.length, 10); assert.equal(run.pending.done, true);
  run = at('wounded_doctor', 'D2', r => { r.gold = 40; });
  assert.equal(run.pending.choices[1].disabled, true); assert.ok(!run.pending.choices[0].disabled);
});

test('Abandoned Supply Cart: supplies, then a potion, then a relic; a wake-up is an elite fight with the rest as loot', () => {
  let woke = 0, all = 0;
  for (let s = 0; s < 80; s++) {
    const run = at('supply_cart', `C${s}`);
    const gold = run.gold;
    for (let k = 0; k < 3 && run.screen === 'event' && !run.pending.done; k++) {
      assert.match(run.pending.choices[0].desc, new RegExp(`${25 * (k + 1)}% chance`));
      choice(run, 'Search');
    }
    if (run.screen === 'combat') {
      woke++;
      const p = run.pending;
      assert.equal(p.encounter, 'cart_walker'); assert.equal(p.room, 'elite'); assert.equal(p.event, 'supply_cart');
      const found = (run.gold > gold ? 1 : 0) + (run.potions.some(Boolean) ? 1 : 0);
      assert.equal(p.loot.length, 3 - found);
      assert.equal(p.loot.at(-1).kind, 'relic');
      const c = R.startCombat(run); c.forceWin(); R.finishCombat(run, c);
      const kinds = run.pending.rewards.map(r => r.kind);
      assert.equal(kinds.filter(k => k === 'relic').length, 1, 'the loot relic, no extra elite relic');
      assert.equal(kinds.at(-1), 'cards');
      assert.equal(run.stats.elites, 1);
    } else if (run.pending.done) {
      all++;
      assert.equal(run.gold, gold + 30); assert.ok(run.potions.some(Boolean)); assert.equal(run.relics.length, 2);
    }
  }
  assert.ok(woke > 30 && all > 5, `woke ${woke}, all ${all}`);
});

test('X-Ray Room: upgrade 2 random cards for 20% Max HP', () => {
  const run = at('xray');
  choice(run, 'Step in');
  assert.equal(run.hp, 80 - 16);
  assert.equal(run.deck.filter(c => c.up).length, 2);
  const low = at('xray', 'X', r => { r.hp = 16; });
  assert.equal(low.pending.choices[0].disabled, true);
});

test('Blood Bank: donate 10 HP for 75; plasma heals 15 and adds Infection', () => {
  let run = at('blood_bank');
  choice(run, 'Donate'); assert.equal(run.hp, 70); assert.equal(run.gold, 174);
  run = at('blood_bank', 'BB', r => { r.hp = 50; });
  choice(run, 'Steal plasma'); assert.equal(run.hp, 65); assert.equal(run.deck.at(-1).id, 'infection');
});

test('Locked Cabinet: pry = 8 HP for 2 potions (no room: they wait on a reward screen); pick = 50%', () => {
  let run = at('pharmacy_cabinet');
  choice(run, 'Pry it open');
  assert.equal(run.hp, 72); assert.equal(run.potions.filter(Boolean).length, 2);
  finish(run); assert.equal(run.screen, 'map');
  run = at('pharmacy_cabinet', 'PC', r => { r.potions = ['medkit', 'medkit', null]; });
  choice(run, 'Pry it open');
  assert.equal(run.potions.filter(Boolean).length, 3);
  finish(run);
  assert.equal(run.screen, 'reward'); assert.equal(run.pending.source, 'event');
  assert.equal(run.pending.rewards.length, 1); assert.equal(run.pending.rewards[0].kind, 'potion');
  assert.equal(R.takeReward(run, 0).reason, 'slots');
  R.discardPotion(run, 0);
  assert.ok(R.takeReward(run, 0).ok);
  R.leaveRewards(run); assert.equal(run.screen, 'map');
  let got = 0;
  for (let s = 0; s < 60; s++) { const r = at('pharmacy_cabinet', `PK${s}`); choice(r, 'Pick the lock'); if (r.potions.some(Boolean)) got++; assert.equal(r.pending.done, true); }
  assert.ok(got > 15 && got < 45, `lock picked ${got}/60`);
});

test('The Intercom: remove, transform (same hero) or upgrade a card through the picker', () => {
  let run = at('intercom');
  choice(run, 'Forget');
  const uid = run.deck[3].uid;
  R.eventPick(run, uid);
  assert.equal(run.deck.length, 10); assert.ok(!run.deck.some(c => c.uid === uid));
  run = at('intercom');
  choice(run, 'Change');
  const old = run.deck[9];
  R.eventPick(run, old.uid);
  assert.notEqual(run.deck[9].id, 'home_run'); assert.equal(CARDS[run.deck[9].id].hero, 'marc');
  run = at('intercom');
  choice(run, 'Practise');
  assert.ok(run.pending.picker.cards.every(c => !c.up));
  R.eventPick(run, run.pending.picker.cards[0].uid);
  assert.equal(run.deck.filter(c => c.up).length, 1);
  assert.equal(R.eventPick(run, 'c1').reason, 'picker');
});

test('A Note on the Wall: 3 cards (one Marc, one Yola, one either); take one, or put it back', () => {
  const run = at('survivor_note');
  choice(run, 'Read it');
  const cards = run.pending.picker.cards;
  assert.equal(cards.length, 3); assert.equal(new Set(cards.map(c => c.id)).size, 3);
  assert.equal(CARDS[cards[0].id].hero, 'marc'); assert.equal(CARDS[cards[1].id].hero, 'yola');
  assert.equal(R.eventPick(run, 'c1').reason, 'card', 'only one of the offered cards');
  R.eventPick(run, cards[1].uid);
  assert.equal(run.deck.at(-1).id, cards[1].id); assert.equal(run.deck.length, 12);
  const r2 = at('survivor_note');
  choice(r2, 'Read it'); R.eventPick(r2, null);
  choice(r2, 'Leave'); assert.equal(r2.screen, 'map'); assert.equal(r2.deck.length, 11);
});

test('Overturned Gurney: 2 Biters, then normal rewards plus a relic', () => {
  const run = at('gurney');
  choice(run, 'Look under it');
  assert.equal(run.screen, 'combat'); assert.equal(run.pending.encounter, 'gurney_biters'); assert.equal(run.pending.room, 'fight');
  const c = R.startCombat(run); c.forceWin(); R.finishCombat(run, c);
  const rw = run.pending.rewards;
  assert.equal(rw[0].kind, 'gold');
  assert.ok(rw.some(r => r.kind === 'relic' && RELICS[r.id]));
  assert.equal(run.stats.fights, 1);
});

test('events are not repeated in a run until every one has been seen', () => {
  const run = R.createRun({ seed: 'NOREP', neow: false });
  const seen = [];
  for (let i = 0; i < 10; i++) {
    R.forceRoom(run, 'event');
    seen.push(run.pending.id);
    run.screen = 'map'; run.pending = null;
  }
  assert.equal(new Set(seen).size, 10);
  R.forceRoom(run, 'event');
  assert.ok(EVENTS[run.pending.id]);
});

test('event HP loss never kills; event saves load mid-event and carry on', () => {
  const run = at('vending', 'SV', r => { r.hp = 5; });
  choice(run, 'Smash it');
  assert.ok(run.hp >= 1);
  const back = R.deserialize(R.serialize(at('intercom')));
  choice(back, 'Forget');
  const saved = R.deserialize(R.serialize(back));
  R.eventPick(saved, saved.deck[0].uid);
  assert.equal(saved.deck.length, 10);
  finish(saved);
  assert.equal(saved.screen, 'map');
});
