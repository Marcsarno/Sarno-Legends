// The run layer (src/game/run.js): run start, Shift Change, travel, fights and rewards, rest, shop, treasure, the "?"
// room, boss victory, defeat, save / load. Events have their own file (run-events.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/game/run.js';
import { CARDS, cardPool } from '../src/game/content/cards.js';
import { RELICS } from '../src/game/content/relics.js';
import { POTIONS } from '../src/game/content/potions.js';
import { ENCOUNTERS } from '../src/game/content/encounters.js';

const fresh = (seed = 'T', opts = {}) => R.createRun({ seed, neow: false, ...opts });
/** Walk into the first reachable room of a type (searching row by row), or null. */
function walkTo(run, type) {
  for (let guard = 0; guard < 20; guard++) {
    const opts = R.availableNodes(run);
    const hit = opts.find(id => run.map.nodes[id].type === type);
    if (hit) { R.travel(run, hit); return hit; }
    R.travel(run, opts[0]);
    clearRoom(run);
    if (run.over) return null;
  }
  return null;
}
/** Get through whatever room we're in, as quickly as possible. */
function clearRoom(run) {
  if (run.screen === 'combat') { const c = R.startCombat(run); c.forceWin(); R.finishCombat(run, c); }
  if (run.screen === 'reward') R.leaveRewards(run);
  if (run.screen === 'rest') R.leaveRest(run);
  if (run.screen === 'shop') R.leaveShop(run);
  if (run.screen === 'treasure') R.leaveTreasure(run);
  if (run.screen === 'event') {
    if (run.pending.picker) R.eventPick(run, run.pending.picker.cards[0]?.uid ?? null);
    for (let i = 0; i < 6 && run.screen === 'event'; i++) {
      const p = run.pending;
      if (p.picker) { R.eventPick(run, p.picker.cards[0].uid); continue; }
      const leave = p.choices.findIndex(c => /Leave|Walk away|Continue/.test(c.label));
      R.chooseEvent(run, leave >= 0 ? leave : p.choices.findIndex(c => !c.disabled));
    }
    clearRoom(run);
  }
}
function winFight(run, encounter) {
  R.forceRoom(run, null, { encounter });
  const c = R.startCombat(run);
  c.forceWin();
  return R.finishCombat(run, c);
}

// ---------------------------------------------------------------- start

test('a new run: 80 HP, 99 supplies, 11 cards, Nurse\'s Kit, 3 empty potion slots, a fresh map', () => {
  const run = fresh();
  assert.equal(run.version, R.RUN_VERSION);
  assert.equal(run.hp, 80); assert.equal(run.maxHp, 80); assert.equal(run.gold, 99);
  assert.equal(run.deck.length, 11);
  assert.deepEqual(run.relics, [{ id: 'nurses_kit', counter: 0 }]);
  assert.deepEqual(run.potions, [null, null, null]);
  assert.deepEqual(run.weapons, { marc: 'wood_bat', yola: 'pistol' });
  assert.equal(run.floor, 0); assert.equal(run.node, null); assert.deepEqual(run.path, []);
  assert.equal(run.screen, 'map');
  assert.deepEqual(run.odds, { cardRare: -5, potion: 40, unknown: { fight: 10, treasure: 2, shop: 3 } });
  assert.deepEqual(R.availableNodes(run), run.map.starts);
  assert.equal(new Set(run.deck.map(c => c.uid)).size, 11);
  assert.doesNotThrow(() => JSON.stringify(run));
});

test('weapons: from the profile loadout, with their starter swaps; a wrong hero falls back', () => {
  const run = R.createRun({ seed: 'W', neow: false, profile: { equipped: { marc: 'nail_bat', yola: 'shotgun' } } });
  assert.deepEqual(run.weapons, { marc: 'nail_bat', yola: 'shotgun' });
  assert.equal(run.deck.filter(c => c.id === 'nail_swing').length, 3);
  assert.equal(run.deck.filter(c => c.id === 'buckshot').length, 2);
  const bad = R.createRun({ seed: 'W', neow: false, weapons: { marc: 'shotgun', yola: 'nope' } });
  assert.deepEqual(bad.weapons, { marc: 'wood_bat', yola: 'pistol' });
});

test('Shift Change: three different options; each one does what it says', () => {
  const run = R.createRun({ seed: 'N1' });
  assert.equal(run.screen, 'neow');
  const ids = run.pending.options.map(o => o.id);
  assert.equal(new Set(ids).size, 3);
  for (const o of run.pending.options) assert.ok(o.label && o.desc && R.NEOW_OPTIONS[o.id]);

  const pickOpt = (id, seed = 'N') => { const r = R.createRun({ seed }); r.pending.options = [{ id, ...R.NEOW_OPTIONS[id] }]; return [r, R.chooseNeow(r, 0)]; };
  let [r] = pickOpt('max_hp'); assert.equal(r.maxHp, 88); assert.equal(r.hp, 88); assert.equal(r.screen, 'map');
  [r] = pickOpt('supplies'); assert.equal(r.gold, 199);
  [r] = pickOpt('common_relic'); assert.equal(r.relics.length, 2); assert.equal(RELICS[r.relics[1].id].rarity, 'common');
  [r] = pickOpt('rare_card'); assert.equal(r.deck.length, 12); assert.equal(CARDS[r.deck[11].id].rarity, 'rare');
  let res;
  [r, res] = pickOpt('remove_card');
  assert.equal(r.screen, 'neow'); assert.equal(res.picker.mode, 'remove');
  assert.equal(R.resolvePick(r, null).ok, false, 'not cancelable');
  const gone = r.deck[0].uid;
  assert.ok(R.resolvePick(r, gone).ok);
  assert.equal(r.deck.length, 10); assert.ok(!r.deck.some(c => c.uid === gone)); assert.equal(r.screen, 'map');
  [r, res] = pickOpt('upgrade_card');
  assert.ok(res.picker.cards.every(c => !c.up));
  R.resolvePick(r, res.picker.cards[0].uid);
  assert.equal(r.deck.filter(c => c.up).length, 1);
  for (const id of ['pick_marc', 'pick_yola']) {
    [r, res] = pickOpt(id);
    assert.equal(res.picker.mode, 'pick'); assert.equal(res.picker.cards.length, 3);
    const hero = id === 'pick_marc' ? 'marc' : 'yola';
    assert.ok(res.picker.cards.every(c => CARDS[c.id].hero === hero));
    R.resolvePick(r, res.picker.cards[2].uid);
    assert.equal(r.deck.length, 12); assert.equal(r.deck[11].id, res.picker.cards[2].id);
  }
  assert.equal(R.chooseNeow(r, 0).ok, false, 'only on the Shift Change screen');
});

// ---------------------------------------------------------------- map and fights

test('travel: only to reachable rooms; floor = row; the path is kept', () => {
  const run = fresh('TR');
  const bad = Object.keys(run.map.nodes).find(id => !run.map.starts.includes(id));
  assert.deepEqual(R.travel(run, bad), { ok: false, reason: 'unreachable' });
  const first = run.map.starts[0];
  assert.ok(R.travel(run, first).ok);
  assert.equal(run.floor, 1); assert.equal(run.node, first); assert.deepEqual(run.path, [first]);
  assert.equal(run.screen, 'combat');
  assert.deepEqual(R.availableNodes(run), [], 'no travel mid-room');
  assert.equal(R.travel(run, run.map.nodes[first].next[0]).ok, false);
  clearRoom(run);
  assert.deepEqual(R.availableNodes(run), run.map.nodes[first].next);
});

test('fights: the first 3 come from the easy pool; never the same as either of the last two', () => {
  for (let s = 0; s < 60; s++) {
    const run = fresh(`POOL${s}`);
    const fights = [];
    for (let i = 0; i < 8; i++) {
      R.forceRoom(run, 'fight');
      fights.push(run.pending.encounter);
      const c = R.startCombat(run); c.forceWin(); R.finishCombat(run, c); R.leaveRewards(run);
    }
    fights.slice(0, 3).forEach(id => assert.equal(ENCOUNTERS[id].kind, 'easy'));
    fights.slice(3).forEach(id => assert.equal(ENCOUNTERS[id].kind, 'hard'));
    for (let i = 2; i < fights.length; i++) assert.ok(fights[i] !== fights[i - 1] && fights[i] !== fights[i - 2], fights.join(','));
  }
});

test('startCombat: the same pending fight replays identically (seed fixed on entering the room)', () => {
  const run = fresh('REPLAY');
  R.travel(run, run.map.starts[0]);
  const a = R.startCombat(run), b = R.startCombat(run);
  assert.deepEqual(a.state.enemies.map(e => e.hp), b.state.enemies.map(e => e.hp));
  assert.deepEqual(a.state.hand.map(c => c.uid), b.state.hand.map(c => c.uid));
  assert.equal(a.state.turn, 1, 'started');
  assert.equal(R.startCombat(run, { start: false }).state.turn, 0);
  const saved = R.serialize(run);
  const c = R.startCombat(R.deserialize(saved));
  assert.deepEqual(c.state.hand.map(x => x.uid), a.state.hand.map(x => x.uid), 'a reload replays the same fight');
});

test('finishCombat: HP (Nurse\'s Kit already healed), potions, relic counters, stats, log; then rewards', () => {
  const run = fresh('FIN');
  run.hp = 50;
  run.potions = ['medkit', null, null];
  run.relics.push({ id: 'tally_marks', counter: 3 });
  R.travel(run, run.map.starts[0]);
  const c = R.startCombat(run);
  const e = c.state.enemies[0];
  c.state.hand.filter(x => CARDS[x.id].type === 'attack').slice(0, 1).forEach(x => c.playCard(x.uid, e.uid));
  c.usePotion(0);
  c.forceWin();
  const r = c.result();
  assert.ok(R.finishCombat(run, c).ok);
  assert.equal(run.hp, r.hp);
  assert.equal(run.hp, 50 + 16 + 6, 'Medkit 16 + Nurse\'s Kit 6');
  assert.deepEqual(run.potions, [null, null, null]);
  assert.equal(run.relics.find(x => x.id === 'tally_marks').counter, 4);
  assert.equal(run.stats.fights, 1); assert.equal(run.stats.kills, r.kills); assert.equal(run.stats.potionsUsed, 1);
  const log = run.stats.log.find(x => x.t === 'fight');
  assert.equal(log.encounter, r.encounter); assert.equal(log.hpBefore, 50); assert.equal(log.hpAfter, 72); assert.equal(log.won, true);
  assert.equal(run.screen, 'reward');
  const kinds = run.pending.rewards.map(x => x.kind);
  assert.equal(kinds[0], 'gold'); assert.equal(kinds[kinds.length - 1], 'cards');
  assert.ok(run.pending.rewards[0].amount >= 10 && run.pending.rewards[0].amount <= 20);
  assert.equal(run.pending.rewards.at(-1).cards.length, 3);
  assert.equal(R.finishCombat(run, r).ok, false, 'only once');
});

test('finishCombat refuses an unfinished fight; a lost fight ends the run', () => {
  const run = fresh('LOSE');
  R.travel(run, run.map.starts[0]);
  const c = R.startCombat(run);
  assert.equal(R.finishCombat(run, c).ok, false);
  c.forceLose();
  const res = R.finishCombat(run, c);
  assert.ok(res.ok && res.over);
  assert.equal(run.over, true); assert.equal(run.won, false); assert.equal(run.hp, 0);
  assert.equal(run.screen, 'defeat');
  assert.equal(run.stats.log.at(-1).t, 'death');
  assert.equal(R.travel(run, 'r2c0').ok, false);
  assert.equal(R.runSummary(run).won, false);
});

test('elite rewards: 25-35 supplies, a relic (50/33/17), elite card odds', () => {
  let rel = { common: 0, uncommon: 0, rare: 0 };
  for (let s = 0; s < 300; s++) {
    const run = fresh(`EL${s}`);
    winFight(run, 'big_walker');
    const rw = run.pending.rewards;
    assert.ok(rw[0].amount >= 25 && rw[0].amount <= 35);
    const relic = rw.find(x => x.kind === 'relic');
    assert.ok(relic);
    rel[RELICS[relic.id].rarity]++;
  }
  assert.ok(rel.common > 120 && rel.common < 180, JSON.stringify(rel));
  assert.ok(rel.rare > 25 && rel.rare < 80, JSON.stringify(rel));
});

test('boss: winning ends the run in victory (no rewards screen)', () => {
  const run = fresh('BOSS');
  run.node = Object.values(run.map.nodes).find(n => n.row === 15).id;
  assert.deepEqual(R.availableNodes(run), ['boss']);
  R.travel(run, 'boss');
  assert.equal(run.floor, 16); assert.equal(run.pending.encounter, 'shield_guard'); assert.equal(run.pending.room, 'boss');
  const c = R.startCombat(run); c.forceWin(); R.finishCombat(run, c);
  assert.equal(run.over, true); assert.equal(run.won, true); assert.equal(run.screen, 'victory');
  assert.equal(run.stats.bosses, 1); assert.equal(run.stats.floorsCleared, 16);
  const sum = R.runSummary(run);
  assert.equal(sum.won, true); assert.equal(sum.floor, 16); assert.equal(sum.killedBy, null);
  assert.ok(Array.isArray(sum.deck) && Array.isArray(sum.relics));
});

// ---------------------------------------------------------------- rewards

test('rewards: take gold / potion / relic, pick or skip the card, leave', () => {
  const run = fresh('RW');
  winFight(run, 'two_biters');
  const p = run.pending;
  p.rewards.splice(1, 0, { kind: 'potion', id: 'flashbang' }, { kind: 'relic', id: 'coin_jar' });
  const gold = run.gold;
  assert.ok(R.takeReward(run, 0).ok); assert.equal(run.gold, gold + p.rewards[0].amount);
  assert.equal(R.takeReward(run, 0).reason, 'taken');
  assert.ok(R.takeReward(run, 1).ok); assert.equal(run.potions[0], 'flashbang');
  assert.ok(R.takeReward(run, 2).ok); assert.ok(run.relics.some(r => r.id === 'coin_jar'));
  const ci = p.rewards.findIndex(r => r.kind === 'cards');
  assert.equal(R.takeReward(run, ci).reason, 'cards');
  const before = run.gold;
  const res = R.pickRewardCard(run, ci, 1);
  assert.ok(res.ok);
  assert.equal(run.deck.at(-1).id, p.rewards[ci].cards[1].id);
  assert.equal(run.gold, before + 9, 'Coin Jar');
  assert.equal(R.pickRewardCard(run, ci, 0).reason, 'taken');
  const log = run.stats.log.filter(e => e.t === 'cards');
  assert.equal(log.length, 1); assert.equal(log[0].picked, p.rewards[ci].cards[1].id); assert.equal(log[0].offered.length, 3);
  assert.ok(R.leaveRewards(run).ok); assert.equal(run.screen, 'map');
});

test('rewards: a potion needs a free slot; skipping the cards is logged; leaving logs an unopened pick as skipped', () => {
  const run = fresh('RW2');
  run.potions = ['medkit', 'medkit', 'medkit'];
  winFight(run, 'two_biters');
  run.pending.rewards.splice(1, 0, { kind: 'potion', id: 'flashbang' });
  assert.equal(R.takeReward(run, 1).reason, 'slots');
  assert.ok(R.discardPotion(run, 0).ok);
  assert.ok(R.takeReward(run, 1).ok);
  const ci = run.pending.rewards.findIndex(r => r.kind === 'cards');
  assert.ok(R.skipRewardCards(run, ci).ok);
  assert.equal(run.stats.log.filter(e => e.t === 'cards')[0].picked, null);
  R.leaveRewards(run);
  winFight(run, 'two_biters');
  R.leaveRewards(run);
  assert.equal(run.stats.log.filter(e => e.t === 'cards').length, 2);
  assert.equal(run.stats.log.filter(e => e.t === 'cards')[1].picked, null);
});

test('potion drop: 40%, -10 after a drop, +10 after none (StS)', () => {
  let drops = 0;
  const N = 400;
  for (let s = 0; s < N; s++) {
    const run = fresh(`POT${s}`);
    winFight(run, 'two_biters');
    const dropped = run.pending.rewards.some(r => r.kind === 'potion');
    if (dropped) drops++;
    assert.equal(run.odds.potion, dropped ? 30 : 50);
  }
  assert.ok(drops > N * 0.32 && drops < N * 0.48, `drops ${drops}/${N}`);
});

test('card rarity: StS pity (offset -5 start, +1 per common, reset on rare, cap +40); shops do not move it', () => {
  const run = fresh('RAR');
  // first normal reward can't be rare (rare 3 - 5 < 0); elite rare 5%
  for (let i = 0; i < 300; i++) { run.odds.cardRare = -5; assert.notEqual(R.rollRarity(run, 'fight', false), 'rare'); }
  let rare = 0;
  for (let i = 0; i < 2000; i++) { run.odds.cardRare = -5; if (R.rollRarity(run, 'elite', false) === 'rare') rare++; }
  assert.ok(rare > 60 && rare < 150, `elite rare at -5: ${rare}/2000`);
  run.odds.cardRare = -5;
  let saw = { common: 0, rare: 0 };
  for (let i = 0; i < 400; i++) {
    const before = run.odds.cardRare;
    const r = R.rollRarity(run, 'fight', true);
    if (r === 'common') { saw.common++; assert.equal(run.odds.cardRare, Math.min(40, before + 1)); }
    if (r === 'rare') { saw.rare++; assert.equal(run.odds.cardRare, -5); }
    if (r === 'uncommon') assert.equal(run.odds.cardRare, before);
    assert.ok(run.odds.cardRare <= 40);
  }
  assert.ok(saw.common && saw.rare);
  run.odds.cardRare = 12;
  for (let i = 0; i < 50; i++) R.rollRarity(run, 'shop', false);
  assert.equal(run.odds.cardRare, 12);
  run.odds.cardRare = 7;
  R.forceRoom(run, 'shop');
  assert.equal(run.odds.cardRare, 7, 'opening a shop leaves the pity alone');
});

test('reward cards: 3 different cards from the reward pool, any hero', () => {
  const heroes = new Set();
  for (let s = 0; s < 50; s++) {
    const run = fresh(`RC${s}`);
    const cards = R.rollCards(run, 3);
    assert.equal(new Set(cards.map(c => c.id)).size, 3);
    for (const c of cards) { assert.ok(cardPool().includes(c.id)); heroes.add(CARDS[c.id].hero); }
  }
  assert.deepEqual([...heroes].sort(), ['marc', 'yola']);
});

// ---------------------------------------------------------------- rest

test('rest: heal 30% (rounded down) or upgrade one card, not both', () => {
  const run = fresh('REST');
  run.hp = 30;
  R.forceRoom(run, 'rest');
  assert.equal(run.screen, 'rest'); assert.equal(run.pending.heal, 24);
  const res = R.restHeal(run);
  assert.ok(res.ok); assert.equal(res.healed, 24); assert.equal(run.hp, 54);
  assert.equal(R.restUpgrade(run, run.deck[0].uid).reason, 'done');
  R.leaveRest(run);
  R.forceRoom(run, 'rest');
  assert.equal(R.restUpgrade(run, 'nope').reason, 'card');
  const c = run.deck.find(x => x.id === 'home_run');
  assert.ok(R.restUpgrade(run, c.uid).ok); assert.equal(c.up, true);
  assert.equal(R.restHeal(run).reason, 'done');
  run.hp = 79;
  R.leaveRest(run); R.forceRoom(run, 'rest');
  assert.equal(R.restHeal(run).healed, 1, 'capped at Max HP');
  assert.equal(R.restUpgrade(fresh(), 'c1').reason, 'screen');
});

// ---------------------------------------------------------------- shop

test('shop: 5 cards (Marc attack/skill, Yola attack/skill, any) with one on sale, 3 relics (last a shop relic), 3 potions, StS prices', () => {
  for (let s = 0; s < 120; s++) {
    const run = fresh(`SHOP${s}`);
    R.forceRoom(run, 'shop');
    const sh = run.shop;
    assert.equal(run.screen, 'shop'); assert.equal(sh.cards.length, 5); assert.equal(sh.relics.length, 3); assert.equal(sh.potions.length, 3);
    const h = i => CARDS[sh.cards[i].card.id];
    assert.ok(h(0).hero === 'marc' && h(0).type === 'attack'); assert.ok(h(1).hero === 'marc' && h(1).type !== 'attack');
    assert.ok(h(2).hero === 'yola' && h(2).type === 'attack'); assert.ok(h(3).hero === 'yola' && h(3).type !== 'attack');
    assert.equal(new Set(sh.cards.map(c => c.card.id)).size, 5);
    assert.equal(sh.cards.filter(c => c.sale).length, 1);
    for (const c of sh.cards) {
      const [lo, hi] = R.PRICES.card[CARDS[c.card.id].rarity];
      if (c.sale) { assert.ok(c.was >= lo && c.was <= hi); assert.equal(c.price, Math.floor(c.was / 2)); }
      else assert.ok(c.price >= lo && c.price <= hi, `${c.card.id} ${c.price}`);
    }
    assert.equal(RELICS[sh.relics[2].id].rarity, 'shop');
    assert.equal(new Set(sh.relics.map(r => r.id)).size, 3);
    for (const r of sh.relics) { const [lo, hi] = R.PRICES.relic[RELICS[r.id].rarity]; assert.ok(r.price >= lo && r.price <= hi); }
    for (const p of sh.potions) { const [lo, hi] = R.PRICES.potion[POTIONS[p.id].rarity]; assert.ok(p.price >= lo && p.price <= hi); }
    assert.deepEqual(sh.removal, { price: 75, used: false });
  }
});

test('shop: buying spends supplies; not enough supplies, sold out and full potion slots refuse', () => {
  const run = fresh('BUY');
  run.gold = 1000;
  R.forceRoom(run, 'shop');
  const sh = run.shop;
  const g = run.gold;
  const card = sh.cards[0];
  assert.ok(R.buyCard(run, 0).ok);
  assert.equal(run.gold, g - card.price); assert.equal(run.deck.at(-1).id, card.card.id); assert.equal(card.sold, true);
  assert.equal(R.buyCard(run, 0).reason, 'sold');
  run.potions = ['medkit', 'medkit', null];
  assert.ok(R.buyPotion(run, 0).ok);
  assert.equal(R.buyPotion(run, 1).reason, 'slots');
  const relicId = sh.relics[0].id;
  assert.ok(R.buyRelic(run, 0).ok); assert.ok(run.relics.some(r => r.id === relicId));
  run.gold = 0;
  assert.equal(R.buyCard(run, 1).reason, 'gold');
  assert.equal(run.stats.log.filter(e => e.t === 'buy').length, 3);
  assert.ok(R.leaveShop(run).ok); assert.equal(run.shop, null); assert.equal(run.screen, 'map');
});

test('card removal: 75, then +25 each time, once per visit; Doctor\'s Note makes it 50; Staff Badge halves prices at once', () => {
  const run = fresh('RM');
  run.gold = 1000;
  R.forceRoom(run, 'shop');
  const uid = run.deck[0].uid;
  assert.ok(R.shopRemove(run, uid).ok);
  assert.equal(run.deck.length, 10); assert.equal(run.gold, 925); assert.equal(run.removals, 1);
  assert.equal(R.shopRemove(run, run.deck[0].uid).reason, 'used');
  R.leaveShop(run);
  R.forceRoom(run, 'shop');
  assert.equal(run.shop.removal.price, 100);
  R.leaveShop(run);
  run.relics.push({ id: 'doctors_note', counter: 0 });
  R.forceRoom(run, 'shop');
  assert.equal(run.shop.removal.price, 50);
  R.leaveShop(run);
  run.relics = run.relics.filter(r => r.id !== 'doctors_note');

  // the Staff Badge on the shelf: prices halve the moment it's bought
  let s = 0, r2;
  do { r2 = fresh(`BADGE${s++}`); r2.gold = 1000; R.forceRoom(r2, 'shop'); } while (r2.shop.relics[2].id !== 'staff_badge');
  const before = r2.shop.cards.map(c => c.price);
  const potionBefore = r2.shop.potions.map(p => p.price);
  R.buyRelic(r2, 2);
  r2.shop.cards.forEach((c, i) => assert.ok(Math.abs(c.price - before[i] / 2) <= 1, `${c.price} vs ${before[i]}`));
  r2.shop.potions.forEach((p, i) => assert.ok(Math.abs(p.price - potionBefore[i] / 2) <= 1));
  assert.ok(Math.abs(r2.shop.removal.price - 37.5) <= 1);
});

// ---------------------------------------------------------------- treasure and "?"

test('treasure: chest size 50/33/17, relic odds per size, gold only sometimes', () => {
  const sizes = { small: 0, medium: 0, large: 0 };
  let goldSeen = 0;
  for (let s = 0; s < 600; s++) {
    const run = fresh(`CH${s}`);
    R.forceRoom(run, 'treasure');
    const p = run.pending;
    sizes[p.size]++;
    const rar = RELICS[p.relic].rarity;
    if (p.size === 'small') assert.notEqual(rar, 'rare');
    if (p.size === 'large') assert.notEqual(rar, 'common');
    if (p.gold) { goldSeen++; const [lo, hi] = R.CHESTS[p.size].gold.range; assert.ok(p.gold >= lo && p.gold <= hi); }
    if (s === 0) {
      assert.equal(p.opened, false);
      assert.ok(R.openChest(run).ok); assert.equal(p.opened, true);
      const g = run.gold;
      assert.ok(R.takeTreasure(run).ok);
      assert.ok(run.relics.some(r => r.id === p.relic)); assert.equal(run.gold, g + p.gold);
      assert.equal(R.takeTreasure(run).reason, 'taken');
      assert.ok(R.leaveTreasure(run).ok);
    }
  }
  assert.ok(sizes.small > 250 && sizes.small < 350, JSON.stringify(sizes));
  assert.ok(sizes.large > 60 && sizes.large < 150, JSON.stringify(sizes));
  assert.ok(goldSeen > 200 && goldSeen < 330, `gold in ${goldSeen}/600 chests`);
});

test('"?" rooms: fight 10% (+10), shop 3% (+3), treasure 2% (+2), else an event; the counters move like StS', () => {
  const counts = { fight: 0, shop: 0, treasure: 0, event: 0 };
  for (let s = 0; s < 400; s++) {
    const run = fresh(`Q${s}`);
    run.map.nodes[run.map.starts[0]].type = 'event';
    R.travel(run, run.map.starts[0]);
    const kind = run.screen === 'combat' ? 'fight' : run.screen;
    counts[kind]++;
    const o = run.odds.unknown;
    assert.equal(o.fight, kind === 'fight' ? 10 : 20);
    assert.equal(o.shop, kind === 'shop' ? 3 : 6);
    assert.equal(o.treasure, kind === 'treasure' ? 2 : 4);
    if (kind !== 'event') assert.equal(run.pending.unknown, true);
    assert.equal(run.stats.log.find(e => e.t === 'node').resolved, kind);
  }
  assert.ok(counts.fight > 20 && counts.fight < 65, JSON.stringify(counts));
  assert.ok(counts.event > 300, JSON.stringify(counts));
});

// ---------------------------------------------------------------- relics, potions on the map

test('Granola raises Max HP when picked up; Coin Jar pays for every card; Medkit works on the map, others don\'t', () => {
  const run = fresh('REL');
  run.hp = 40;
  R.addRelic(run, 'granola');
  assert.equal(run.maxHp, 87); assert.equal(run.hp, 47);
  assert.equal(R.addRelic(run, 'granola'), false, 'no duplicates');
  R.addRelic(run, 'coin_jar');
  const g = run.gold;
  R.addCard(run, 'one_two');
  assert.equal(run.gold, g + 9);
  run.potions = ['medkit', 'flashbang', null];
  assert.equal(R.usePotionOnMap(run, 1).reason, 'combat_only');
  const res = R.usePotionOnMap(run, 0);
  assert.ok(res.ok); assert.equal(res.healed, 17); assert.equal(run.hp, 64);
  assert.equal(run.potions[0], null);
});

test('transform: a random different card of the same hero, same deck slot', () => {
  for (let s = 0; s < 40; s++) {
    const run = fresh(`TF${s}`);
    const old = run.deck[9]; // home_run (Marc)
    const card = R.transformCard(run, old.uid);
    assert.notEqual(card.id, old.id);
    assert.equal(CARDS[card.id].hero, CARDS[old.id].hero);
    assert.equal(run.deck[9], card);
  }
});

// ---------------------------------------------------------------- save / load and determinism

function autoplay(run, steps) {
  for (let i = 0; i < steps && !run.over; i++) {
    if (run.screen === 'neow') { if (run.pending.picker) R.resolvePick(run, run.pending.picker.cards[0].uid); else R.chooseNeow(run, 0); continue; }
    if (run.screen === 'map') { const a = R.availableNodes(run); R.travel(run, a[a.length - 1]); continue; }
    if (run.screen === 'reward') { run.pending.rewards.forEach((r, k) => (r.kind === 'cards' ? R.pickRewardCard(run, k, 0) : R.takeReward(run, k))); R.leaveRewards(run); continue; }
    clearRoom(run);
  }
}

test('save after any step, load, carry on: identical to never saving; same seed + same choices = same run', () => {
  const a = R.createRun({ seed: 'SAVE' });
  const b = R.createRun({ seed: 'SAVE' });
  assert.equal(R.serialize(a), R.serialize(b));
  let x = a, y = b;
  for (let step = 0; step < 40 && !x.over; step++) {
    autoplay(x, 1);
    y = R.deserialize(R.serialize(y));
    autoplay(y, 1);
    assert.equal(R.serialize(y), R.serialize(x), `diverged at step ${step} (${x.screen})`);
  }
  assert.ok(x.floor >= 5);
});

test('deserialize: rejects junk; card uids continue after the deck', () => {
  assert.throws(() => R.deserialize('{"version":99}'));
  assert.throws(() => R.deserialize('null'));
  const run = fresh('UID');
  winFight(run, 'two_biters');
  const back = R.deserialize(R.serialize(run));
  const next = R.addCard(back, 'one_two');
  const all = [...back.deck.map(c => c.uid), ...back.pending.rewards.flatMap(r => (r.cards || []).map(c => c.uid))];
  assert.equal(all.filter(u => u === next.uid).length, 1, 'new uid is unique');
});

test('abandon: the run ends as a defeat with the cause recorded', () => {
  const run = fresh('AB');
  assert.ok(R.abandonRun(run).ok);
  assert.equal(run.over, true); assert.equal(run.won, false); assert.equal(run.screen, 'defeat');
  assert.equal(R.runSummary(run).killedBy, null);
  assert.equal(R.runSummary(run).abandoned, true);
  assert.equal(R.abandonRun(run).ok, false);
});

test('a whole run by forced wins reaches the boss and wins (every room type on the way works)', () => {
  for (let s = 0; s < 25; s++) {
    const run = R.createRun({ seed: `WHOLE${s}` });
    autoplay(run, 400);
    assert.ok(run.over, `seed ${s} stuck on ${run.screen}`);
    assert.equal(run.won, true);
    assert.equal(run.path.length, 16);
    assert.ok(run.stats.log.some(e => e.t === 'victory'));
  }
});
