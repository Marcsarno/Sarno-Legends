// The run layer: one act-1 run as a plain JSON object and the functions that move it along. Pure logic (no DOM,
// no three): the app calls these and shows run.screen; the balance sim (tools/sim) plays the same functions headless.
//
// The run is always plain JSON (BUILD_SPEC section 2): the rng streams are kept as saved states in run.rng and every
// roll writes its stream back at once, so serialize(run) after any call is a complete save. Fights get their own
// streams from a seed fixed when you enter the room, so a reload replays the same fight.
//
// Flow (run.screen, with run.pending saying what that screen is resolving):
//   createRun({ seed, weapons, profile, infection: 0..5, daily: 'YYYY-MM-DD' })
//                                              -> 'neow'   pending { kind: 'neow', options, picker? }   chooseNeow(run, i)
//     infection: the Infection level (infection.js; run.infection). daily: the Daily Run of that local date
//     (run.daily): seed dailySeed(date), the free weapons and Infection 0 for everyone, so the family compares scores.
//     dailySeed(date = new Date()) -> 'DAILY-2026-10-23'; scoreRun(run) -> points (scoreBreakdown(run) has the lines).
//   availableNodes(run) / travel(run, nodeId)  -> 'combat' pending { kind: 'combat', room, encounter, seed, loot? }
//                                                 'rest'   pending { kind: 'rest', heal, rested }
//                                                 'shop'   run.shop { cards, relics, potions, removal } (pending { kind: 'shop' })
//                                                 'event'  pending { kind: 'event', id, title, text, room, choices, result, done, picker? }
//                                                 'treasure' pending { kind: 'treasure', size, relic, gold, opened, taken }
//   startCombat(run) -> the engine Combat (started); finishCombat(run, combat or combat.result())
//                                              -> 'reward' pending { kind: 'reward', source, rewards: [{ kind, ..., taken? }] }
//                                                 'victory' (boss down) / 'defeat'   (run.over, run.won)
//   rewards: takeReward(run, i), pickRewardCard(run, i, cardIdx), skipRewardCards(run, i), leaveRewards(run)
//   rest: restHeal(run), restUpgrade(run, uid), leaveRest(run)
//   shop: buyCard(run, i), buyRelic(run, i), buyPotion(run, i), shopRemove(run, uid), leaveShop(run)
//   event: chooseEvent(run, i), eventPick(run, uid | null)      treasure: openChest(run), takeTreasure(run), leaveTreasure(run)
//   any picker (Shift Change / event): resolvePick(run, uid | null)      debug: forceRoom(run, type, { encounter, event })
//   potions on the map: usePotionOnMap(run, slot) (Medkit), discardPotion(run, slot); abandonRun(run)
//   serialize(run) / deserialize(str); runSummary(run) for the result screen (meta.recordRun adds the scrap)
//   helpers (also for __SL.give): newCard, addCard, removeCard, transformCard, addRelic, addPotion, gainGold, heal,
//   rollCards, rollRarity, rollRelicId, removalPrice, canUpgrade, usableOnMap
// Every action returns { ok: true, ... } or { ok: false, reason }; nothing throws on a wrong click.
// Card uids come from run.uidSeq (never module state), so the same seed and choices give the same save byte for byte.
//
// Numbers are Slay the Spire's (BUILD_SPEC section 5 with docs/STS_NUMBERS_CHECK.md corrections); the tables are
// exported below so the sim and docs/BALANCE.md read the same values.

import { makeRng, makeStreams, streamsState, newSeed } from './rng.js';
import { generateMap, nextNodes, BOSS_ROW } from './map.js';
import { createCombat } from './combat.js';
import { CARDS, cardView, cardPool, makeStarterDeck, isUpgradable, syncUids } from './content/cards.js';
import { RELICS, relicPool, STARTER_RELICS } from './content/relics.js';
import { POTIONS, rollPotion } from './content/potions.js';
import { ENCOUNTERS, pickEncounter } from './content/encounters.js';
import { ENEMIES } from './content/enemies.js';
import { DEFAULT_WEAPONS, WEAPONS } from './content/weapons.js';
import { EVENTS } from './content/events.js';
import { infectionRules, infectionLevel } from './infection.js';

export const RUN_VERSION = 1;

// ---------------------------------------------------------------- tables (Slay the Spire, A0)

export const START = { hp: 80, gold: 99, potionSlots: 3 };
export const REWARD_GOLD = { fight: [10, 20], elite: [25, 35], boss: [95, 105] };
/** Card reward rarity, percent: rare first, then uncommon, the rest common. Shops use their own (StS ShopRoom 9/37). */
export const CARD_RARITY = { fight: { rare: 3, uncommon: 37 }, elite: { rare: 10, uncommon: 40 }, shop: { rare: 9, uncommon: 37 }, boss: { rare: 100, uncommon: 0 } };
/** Rare pity: run.odds.cardRare is added to the rare chance (shortfall below 0 comes out of uncommon). */
export const PITY = { start: -5, step: 1, cap: 40 };
export const POTION_DROP = { start: 40, step: 10 };
export const UNKNOWN_ODDS = { fight: 10, treasure: 2, shop: 3 };         // base = step; reset to base when rolled
export const RELIC_ODDS = { common: 50, uncommon: 33, rare: 17 };        // elites, shops, events
export const CHESTS = {
  small:  { weight: 50, relic: { common: 75, uncommon: 25, rare: 0 },  gold: { chance: 50, range: [23, 27] } },
  medium: { weight: 33, relic: { common: 35, uncommon: 50, rare: 15 }, gold: { chance: 35, range: [45, 55] } },
  large:  { weight: 17, relic: { common: 0, uncommon: 75, rare: 25 },  gold: { chance: 50, range: [68, 82] } },
};
export const PRICES = {
  card:   { common: [45, 55], uncommon: [68, 82], rare: [135, 165] },
  relic:  { common: [143, 157], uncommon: [238, 262], rare: [285, 315], shop: [143, 157] },
  potion: { common: [48, 53], uncommon: [71, 79], rare: [95, 105] },
  removal: { base: 75, step: 25 },
};
export const REST_HEAL = 0.3;
export const NEOW_OPTIONS = {
  max_hp:       { label: '+8 Max HP', desc: 'Raise your Max HP by 8.', icon: 'heart' },
  remove_card:  { label: 'Travel Light', desc: 'Remove a card from your deck.' },
  upgrade_card: { label: 'Patch Up', desc: 'Upgrade a card in your deck.' },
  common_relic: { label: 'Something Useful', desc: 'Get a random common relic.', icon: 'relic' },
  supplies:     { label: 'Spare Supplies', desc: 'Gain 100 supplies.' },
  rare_card:    { label: 'Something Rare', desc: 'Add a random rare card to your deck.', icon: 'star' },
  pick_marc:    { label: 'Marc\'s Pick', desc: 'Choose 1 of 3 Marc cards to add to your deck.', hero: 'marc' },
  pick_yola:    { label: 'Yola\'s Pick', desc: 'Choose 1 of 3 Yola cards to add to your deck.', hero: 'yola' },
};
const NO_UPGRADE = new Set(['panic', 'bile', 'infection']);

// ---------------------------------------------------------------- rng: plain states in run.rng, written back on every roll

/**
 * A handle on one of the run's streams. Every call reads the stream's state from run.rng and writes it back, so any
 * number of handles on the same stream (a function holding one while it calls a helper that makes its own) continue
 * one sequence. (A handle that kept its own copy replayed numbers: the shop's card pick reused its rarity roll.)
 */
export function runRng(run, name) {
  const live = () => makeRng(run.rng?.[name] || `${run.seed}/${name}`);
  const out = {};
  for (const k of ['next', 'int', 'range', 'chance', 'pick', 'shuffle', 'weighted']) {
    out[k] = (...a) => { const r = live(); const v = r[k](...a); (run.rng ||= {})[name] = r.state(); return v; };
  }
  out.state = () => live().state();
  return out;
}

// ---------------------------------------------------------------- create

/**
 * A new run. weapons default to the profile's equipped weapons, then the starter pair.
 * opts.neow === false skips Shift Change (straight to the map).
 */
export function createRun({ seed, weapons, profile, neow = true, infection = 0, daily = null } = {}) {
  if (daily) {
    daily = dailyDate(daily === true ? new Date() : daily);
    seed = dailySeed(daily);
    weapons = { ...DEFAULT_WEAPONS }; profile = null; infection = 0; // the same run for everyone that day
  }
  seed = String(seed ?? newSeed());
  const level = infectionLevel(infection);
  const equipped = { ...DEFAULT_WEAPONS, ...(profile?.equipped || {}), ...(weapons || {}) };
  for (const h of ['marc', 'yola']) if (!WEAPONS[equipped[h]] || WEAPONS[equipped[h]].hero !== h) equipped[h] = DEFAULT_WEAPONS[h];
  const streams = makeStreams(seed);
  const map = generateMap(streams.map, level ? { odds: { elite: infectionRules(level).eliteOdds } } : {});
  const run = {
    version: RUN_VERSION, seed, act: 1, floor: 0, infection: level, daily: daily || null,
    hp: START.hp, maxHp: START.hp, gold: START.gold,
    deck: makeStarterDeck(equipped),
    relics: STARTER_RELICS.map(id => ({ id, counter: 0 })),
    potions: Array(START.potionSlots).fill(null),
    weapons: equipped,
    map, node: null, path: [],
    rng: streamsState(streams),
    odds: { cardRare: PITY.start, potion: POTION_DROP.start, unknown: { ...UNKNOWN_ODDS } },
    shop: null, removals: 0, uidSeq: 0, // newCard() continues after the deck's highest uid
    screen: 'map', pending: null,
    seen: { encounters: [], events: [] },
    stats: {
      kills: 0, finishers: 0, damageTaken: 0, cardsPlayed: 0, turns: 0, potionsUsed: 0,
      fights: 0, elites: 0, bosses: 0, floorsCleared: 0, goldEarned: 0, goldSpent: 0,
      bestHit: { amount: 0, card: null }, cause: null, log: [],
    },
    over: false, won: false,
  };
  if (neow) {
    const keys = runRng(run, 'misc').shuffle(Object.keys(NEOW_OPTIONS)).slice(0, 3);
    run.screen = 'neow';
    run.pending = { kind: 'neow', options: keys.map(id => ({ id, ...NEOW_OPTIONS[id] })), chosen: null, picker: null };
  }
  return run;
}

// ---------------------------------------------------------------- Shift Change (run start bonus)

export function chooseNeow(run, index) {
  const p = run.pending;
  if (run.screen !== 'neow' || p?.kind !== 'neow') return fail('screen');
  if (p.picker) return fail('picker');
  const opt = p.options[index];
  if (!opt) return fail('index');
  p.chosen = opt.id;
  log(run, { t: 'neow', option: opt.id });
  switch (opt.id) {
    case 'max_hp': gainMaxHp(run, 8); break;
    case 'common_relic': { const id = rollRelicId(run, { common: 1 }); if (id) addRelic(run, id, 'neow'); break; }
    case 'supplies': gainGold(run, 100); break;
    case 'rare_card': addCard(run, runRng(run, 'cards').pick(cardPool({ rarity: 'rare' })), false, 'neow'); break;
    case 'remove_card':
      p.picker = { mode: 'remove', cards: run.deck.slice(), title: opt.label, cancelable: false };
      return { ok: true, picker: p.picker };
    case 'upgrade_card': {
      const cards = run.deck.filter(canUpgrade);
      if (!cards.length) break;
      p.picker = { mode: 'upgrade', cards, title: opt.label, cancelable: false };
      return { ok: true, picker: p.picker };
    }
    case 'pick_marc': case 'pick_yola': {
      const hero = opt.id === 'pick_marc' ? 'marc' : 'yola';
      p.picker = { mode: 'pick', cards: rollCards(run, 3, { kind: 'fight', hero, movePity: false }), title: opt.label, sub: 'Take one card.', cancelable: false };
      return { ok: true, picker: p.picker };
    }
    default: break;
  }
  toMap(run);
  return { ok: true };
}

// ---------------------------------------------------------------- map

/** Room ids you can travel to now (empty unless the map screen is up). */
export function availableNodes(run) {
  if (run.over || run.screen !== 'map') return [];
  return nextNodes(run.map, run.node);
}

/** Walk into a room: sets run.screen and run.pending for it. */
export function travel(run, nodeId) {
  if (run.over) return fail('over');
  if (!availableNodes(run).includes(nodeId)) return fail('unreachable');
  const prev = run.node ? run.map.nodes[run.node] : null;
  const node = run.map.nodes[nodeId];
  run.node = nodeId;
  run.path.push(nodeId);
  run.floor = node.type === 'boss' ? BOSS_ROW : node.row;
  log(run, { t: 'node', floor: run.floor, type: node.type });
  enterRoom(run, node.type, { from: prev?.type });
  return { ok: true, screen: run.screen };
}

function enterRoom(run, type, { from } = {}) {
  switch (type) {
    case 'fight': return enterFight(run, 'fight');
    case 'elite': return enterFight(run, 'elite');
    case 'boss': return enterFight(run, 'boss');
    case 'rest': run.screen = 'rest'; run.pending = { kind: 'rest', heal: restAmount(run), rested: null }; return;
    case 'shop': return openShop(run);
    case 'treasure': return enterTreasure(run);
    case 'event': return enterUnknown(run, from);
    default: throw new Error(`Unknown room type: ${type}`);
  }
}

/** The "?" room roll (StS): fight 10% (+10 each miss), shop 3% (+3), treasure 2% (+2), else an event. */
function enterUnknown(run, from) {
  const o = run.odds.unknown;
  const shop = from === 'shop' ? 0 : o.shop;
  const roll = runRng(run, 'events').int(100);
  let type = 'event';
  if (roll < o.fight) type = 'fight';
  else if (roll < o.fight + shop) type = 'shop';
  else if (roll < o.fight + shop + o.treasure) type = 'treasure';
  o.fight = type === 'fight' ? UNKNOWN_ODDS.fight : o.fight + UNKNOWN_ODDS.fight;
  o.shop = type === 'shop' ? UNKNOWN_ODDS.shop : o.shop + UNKNOWN_ODDS.shop;
  o.treasure = type === 'treasure' ? UNKNOWN_ODDS.treasure : o.treasure + UNKNOWN_ODDS.treasure;
  const last = run.stats.log[run.stats.log.length - 1];
  if (last?.t === 'node') last.resolved = type;
  if (type === 'event') return startEvent(run);
  enterRoom(run, type);
  if (run.pending) run.pending.unknown = true;
}

/**
 * Debug / playtest: open a room right here without walking the map (for __SL.goto / __SL.combat and tests).
 * type: 'fight'|'elite'|'boss'|'rest'|'shop'|'treasure'|'event' (a locked room) |'unknown' (the "?" roll);
 * opts.encounter picks the fight, opts.event the locked room.
 */
export function forceRoom(run, type, { encounter, event } = {}) {
  if (run.over) return fail('over');
  if (event) { if (!EVENTS[event]) return fail('unknown'); startEvent(run, event); return { ok: true, screen: run.screen }; }
  if (encounter) {
    const def = ENCOUNTERS[encounter];
    if (!def) return fail('unknown');
    enterFight(run, def.boss ? 'boss' : def.elite ? 'elite' : 'fight', { encounter });
    return { ok: true, screen: run.screen };
  }
  if (type === 'event') startEvent(run);           // a locked room straight away
  else if (type === 'unknown') enterUnknown(run);  // the "?" roll (fight / shop / treasure / event)
  else enterRoom(run, type);
  return { ok: true, screen: run.screen };
}

// ---------------------------------------------------------------- combat

function enterFight(run, room, { encounter, loot, event } = {}) {
  const enc = encounter || (room === 'boss' ? 'shield_guard' : pickEncounter(room, runRng(run, 'misc'), run.seen.encounters));
  run.seen.encounters.push(enc);
  const def = ENCOUNTERS[enc];
  run.screen = 'combat';
  run.pending = {
    kind: 'combat', room: def.boss ? 'boss' : def.elite ? 'elite' : 'fight', encounter: enc,
    name: def.name, elite: !!def.elite, boss: !!def.boss,
    seed: `${run.seed}/fight${run.seen.encounters.length}/${run.node || 'start'}`,
    ...(loot ? { loot } : {}), ...(event ? { event } : {}),
  };
}

/** The engine combat for the pending fight (started unless opts.start === false). Same seed, same fight. */
export function startCombat(run, opts = {}) {
  const p = run.pending;
  if (run.screen !== 'combat' || p?.kind !== 'combat') throw new Error('No fight to start');
  const { start = true, ...engineOpts } = opts;
  const c = createCombat({ run, encounter: p.encounter, rng: makeStreams(p.seed), opts: engineOpts });
  if (start) c.start();
  return c;
}

/**
 * Apply a finished fight: HP (Nurse's Kit and the other end-of-fight relics already healed inside the engine), Max HP,
 * potions, relic counters, stats and the log. Then rewards, the victory screen (boss) or the defeat screen.
 * Accepts the Combat itself or combat.result().
 */
export function finishCombat(run, res) {
  const p = run.pending;
  if (run.screen !== 'combat' || p?.kind !== 'combat') return fail('screen');
  if (res && typeof res.result === 'function') res = res.result();
  if (!res || res.won === undefined || res.over === false) return fail('not_over');
  const hpBefore = run.hp;
  run.maxHp = res.maxHp ?? run.maxHp;
  run.hp = res.won ? Math.max(1, Math.min(run.maxHp, res.hp)) : 0;
  if (Array.isArray(res.potions)) run.potions = run.potions.map((_, i) => res.potions[i] ?? null);
  for (const r of run.relics) if (res.relicCounters && r.id in res.relicCounters) r.counter = res.relicCounters[r.id];

  const S = run.stats;
  S.kills += res.kills || 0;
  S.finishers += res.finishers || 0;
  S.damageTaken += res.damageTaken || 0;
  S.cardsPlayed += res.cardsPlayed || 0;
  S.turns += res.turns || 0;
  S.potionsUsed += res.potionsUsed || 0;
  if ((res.bestHit || 0) > S.bestHit.amount) S.bestHit = { amount: res.bestHit, card: res.bestHitCard || null };
  log(run, { t: 'fight', floor: run.floor, encounter: p.encounter, room: p.room, won: !!res.won, turns: res.turns,
    hpBefore, hpAfter: run.hp, maxHp: run.maxHp, damageTaken: res.damageTaken || 0, kills: res.kills || 0, finishers: res.finishers || 0,
    potionsUsed: res.potionsUsed || 0, ...(res.won ? {} : { killedBy: res.killedBy || null }) });

  if (!res.won) {
    S.cause = res.killedBy || p.encounter;
    return endRun(run, false, { encounter: p.encounter, killedBy: res.killedBy || null });
  }
  if (p.room === 'boss') { S.bosses++; S.floorsCleared = BOSS_ROW; return endRun(run, true, { encounter: p.encounter }); }
  if (p.room === 'elite') S.elites++; else S.fights++;

  run.screen = 'reward';
  run.pending = { kind: 'reward', source: p.room, encounter: p.encounter, rewards: makeRewards(run, p.room, p.loot) };
  return { ok: true, screen: run.screen };
}

function endRun(run, won, info = {}) {
  run.over = true;
  run.won = won;
  run.screen = won ? 'victory' : 'defeat';
  run.pending = { kind: run.screen, ...info };
  log(run, won ? { t: 'victory', floor: run.floor } : { t: 'death', floor: run.floor, cause: run.stats.cause });
  return { ok: true, screen: run.screen, over: true, won };
}

/** Give up: the run ends as a defeat (scrap still counts). */
export function abandonRun(run) {
  if (run.over) return fail('over');
  run.stats.cause = 'abandoned';
  return endRun(run, false, { killedBy: 'abandoned' });
}

// ---------------------------------------------------------------- rewards

function makeRewards(run, room, loot = []) {
  const out = [];
  const g = REWARD_GOLD[room] || REWARD_GOLD.fight;
  out.push({ kind: 'gold', amount: runRng(run, 'misc').range(g[0], g[1]) });
  const potion = rollPotionDrop(run);
  if (potion) out.push({ kind: 'potion', id: potion });
  if (room === 'elite' && !loot.some(l => l.kind === 'relic')) {
    const id = rollRelicId(run, RELIC_ODDS);
    if (id) out.push({ kind: 'relic', id });
  }
  for (const l of loot) out.push({ ...l });
  out.push({ kind: 'cards', cards: rollCards(run, 3, { kind: room === 'elite' ? 'elite' : 'fight' }) });
  return out;
}

/** 40% (+10 after a fight without one, -10 after one), StS. */
function rollPotionDrop(run) {
  const r = runRng(run, 'potions');
  const drop = r.int(100) < run.odds.potion;
  run.odds.potion = Math.max(0, Math.min(100, run.odds.potion + (drop ? -POTION_DROP.step : POTION_DROP.step)));
  return drop ? rollPotion(r) : null;
}

export function takeReward(run, i) {
  const p = run.pending;
  if (run.screen !== 'reward' || p?.kind !== 'reward') return fail('screen');
  const r = p.rewards[i];
  if (!r) return fail('index');
  if (r.taken) return fail('taken');
  if (r.kind === 'gold') gainGold(run, r.amount);
  else if (r.kind === 'potion') { if (addPotion(run, r.id) < 0) return fail('slots'); }
  else if (r.kind === 'relic') addRelic(run, r.id, 'reward');
  else return fail('cards');
  r.taken = true;
  return { ok: true };
}

export function pickRewardCard(run, i, cardIdx) {
  const p = run.pending;
  if (run.screen !== 'reward' || p?.kind !== 'reward') return fail('screen');
  const r = p.rewards[i];
  if (!r || r.kind !== 'cards') return fail('index');
  if (r.taken) return fail('taken');
  const card = r.cards[cardIdx];
  if (!card) return fail('index');
  addCardInst(run, card, 'reward');
  r.taken = true;
  r.picked = card.id;
  logCards(run, r, card.id);
  return { ok: true, card };
}

/** Skip the card pick (the row closes; it is logged as skipped). */
export function skipRewardCards(run, i) {
  const p = run.pending;
  if (run.screen !== 'reward' || p?.kind !== 'reward') return fail('screen');
  const r = p.rewards[i];
  if (!r || r.kind !== 'cards') return fail('index');
  if (r.taken) return fail('taken');
  r.taken = true;
  r.skipped = true;
  logCards(run, r, null);
  return { ok: true };
}

/** Done with the rewards: anything not taken is left behind (an unopened card pick counts as skipped). */
export function leaveRewards(run) {
  const p = run.pending;
  if (run.screen !== 'reward' || p?.kind !== 'reward') return fail('screen');
  for (const r of p.rewards) if (r.kind === 'cards' && !r.taken) { r.skipped = true; logCards(run, r, null); }
  toMap(run);
  return { ok: true };
}

function logCards(run, r, picked) {
  if (r.logged) return;
  r.logged = true;
  log(run, { t: 'cards', floor: run.floor, offered: r.cards.map(c => c.id), picked });
}

// ---------------------------------------------------------------- rest (Supply Closet)

export const restAmount = run => Math.floor(run.maxHp * (run.infection ? infectionRules(run.infection).restHeal : REST_HEAL));

export function restHeal(run) {
  const p = run.pending;
  if (run.screen !== 'rest' || p?.kind !== 'rest') return fail('screen');
  if (p.rested) return fail('done');
  const healed = heal(run, restAmount(run));
  p.rested = 'rest';
  p.healed = healed;
  log(run, { t: 'rest', floor: run.floor, choice: 'rest', healed });
  return { ok: true, healed };
}

export function restUpgrade(run, uid) {
  const p = run.pending;
  if (run.screen !== 'rest' || p?.kind !== 'rest') return fail('screen');
  if (p.rested) return fail('done');
  const card = run.deck.find(c => c.uid === uid);
  if (!card || !canUpgrade(card)) return fail('card');
  card.up = true;
  p.rested = 'upgrade';
  p.card = card.id;
  log(run, { t: 'rest', floor: run.floor, choice: 'upgrade', card: card.id });
  return { ok: true, card };
}

export function leaveRest(run) {
  if (run.screen !== 'rest') return fail('screen');
  toMap(run);
  return { ok: true };
}

// ---------------------------------------------------------------- shop (Pharmacy)

function openShop(run) {
  const cr = runRng(run, 'cards');
  // 5 cards: a Marc Attack, a Marc Skill/Power, the same for Yola, then one of either (StS: typed slots per class)
  const slots = [['marc', true], ['marc', false], ['yola', true], ['yola', false], [null, null]];
  const used = new Set();
  const cards = slots.map(([hero, attack]) => {
    const rarity = rollRarity(run, 'shop', false);
    const fits = id => !used.has(id) && (attack === null || (CARDS[id].type === 'attack') === attack);
    let pool = cardPool({ hero: hero || undefined, rarity }).filter(fits);
    if (!pool.length) pool = cardPool({ hero: hero || undefined }).filter(fits);
    const id = cr.pick(pool);
    used.add(id);
    const base = cr.range(...PRICES.card[CARDS[id].rarity]);
    return { card: newCard(run, id, false), base, price: base, sold: false };
  });
  const saleIdx = cr.int(cards.length);
  cards[saleIdx].sale = true;
  cards[saleIdx].was = cards[saleIdx].base;
  cards[saleIdx].base = Math.floor(cards[saleIdx].base / 2);

  const rr = runRng(run, 'relics');
  const relics = [];
  const taken = run.relics.map(r => r.id);
  for (let i = 0; i < 2; i++) {
    const id = rollRelicId(run, RELIC_ODDS, [...taken, ...relics.map(r => r.id)]);
    if (id) relics.push({ id, base: rr.range(...PRICES.relic[RELICS[id].rarity]), price: 0, sold: false });
  }
  const shopOnly = relicPool('shop', [...taken, ...relics.map(r => r.id)]);
  const third = shopOnly.length ? rr.pick(shopOnly) : rollRelicId(run, RELIC_ODDS, [...taken, ...relics.map(r => r.id)]);
  if (third) relics.push({ id: third, base: rr.range(...PRICES.relic[RELICS[third].rarity]), price: 0, sold: false });

  const pr = runRng(run, 'potions');
  const potions = [0, 1, 2].map(() => {
    const id = rollPotion(pr);
    return { id, base: pr.range(...PRICES.potion[POTIONS[id].rarity]), price: 0, sold: false };
  });

  run.shop = { cards, relics, potions, removal: { price: 0, used: false } };
  priceShop(run);
  run.screen = 'shop';
  run.pending = { kind: 'shop' };
}

/** Prices with the Staff Badge discount; card removal 75 (+25 each), or 50 with the Doctor's Note. */
function priceShop(run) {
  const s = run.shop;
  const disc = run.relics.reduce((m, r) => (RELICS[r.id]?.shopDiscount ? m * RELICS[r.id].shopDiscount : m), 1);
  for (const list of [s.cards, s.relics, s.potions]) for (const it of list) it.price = Math.round(it.base * disc);
  for (const c of s.cards) if (c.sale) c.was = Math.round((c.wasBase ??= c.was) * disc);
  s.removal.price = removalPrice(run);
}

export function removalPrice(run) {
  const fixed = run.relics.map(r => RELICS[r.id]?.removalCost).find(v => v !== undefined);
  if (fixed !== undefined) return fixed;
  const disc = run.relics.reduce((m, r) => (RELICS[r.id]?.shopDiscount ? m * RELICS[r.id].shopDiscount : m), 1);
  return Math.round((PRICES.removal.base + PRICES.removal.step * run.removals) * disc);
}

function shopItem(run, list, i) {
  if (run.screen !== 'shop' || !run.shop) return [null, fail('screen')];
  const it = run.shop[list][i];
  if (!it) return [null, fail('index')];
  if (it.sold) return [null, fail('sold')];
  if (run.gold < it.price) return [null, fail('gold')];
  return [it, null];
}

export function buyCard(run, i) {
  const [it, err] = shopItem(run, 'cards', i);
  if (err) return err;
  spend(run, it.price);
  it.sold = true;
  addCardInst(run, it.card, 'shop');
  log(run, { t: 'buy', floor: run.floor, kind: 'card', id: it.card.id, price: it.price });
  return { ok: true, card: it.card };
}

export function buyRelic(run, i) {
  const [it, err] = shopItem(run, 'relics', i);
  if (err) return err;
  spend(run, it.price);
  it.sold = true;
  addRelic(run, it.id, 'shop');
  log(run, { t: 'buy', floor: run.floor, kind: 'relic', id: it.id, price: it.price });
  priceShop(run); // the Staff Badge / Doctor's Note change the prices at once
  return { ok: true, id: it.id };
}

export function buyPotion(run, i) {
  const [it, err] = shopItem(run, 'potions', i);
  if (err) return err;
  if (freeSlot(run) < 0) return fail('slots');
  spend(run, it.price);
  it.sold = true;
  addPotion(run, it.id);
  log(run, { t: 'buy', floor: run.floor, kind: 'potion', id: it.id, price: it.price });
  return { ok: true, id: it.id };
}

/** The Pharmacy's card removal (once per visit). */
export function shopRemove(run, uid) {
  if (run.screen !== 'shop' || !run.shop) return fail('screen');
  const rm = run.shop.removal;
  if (rm.used) return fail('used');
  if (run.gold < rm.price) return fail('gold');
  if (!run.deck.some(c => c.uid === uid)) return fail('card');
  const price = rm.price;
  spend(run, price);
  const card = removeCard(run, uid, 'shop');
  run.removals++;
  rm.used = true;
  priceShop(run); // rm.price is now the next removal's price
  log(run, { t: 'buy', floor: run.floor, kind: 'removal', id: card.id, price });
  return { ok: true, card, price };
}

export function leaveShop(run) {
  if (run.screen !== 'shop') return fail('screen');
  run.shop = null;
  toMap(run);
  return { ok: true };
}

// ---------------------------------------------------------------- treasure (supply crate)

function enterTreasure(run) {
  const m = runRng(run, 'misc');
  const size = m.weighted(Object.entries(CHESTS).map(([k, c]) => [k, c.weight]));
  const chest = CHESTS[size];
  const relic = rollRelicId(run, chest.relic);
  const gold = m.int(100) < chest.gold.chance ? m.range(...chest.gold.range) : 0;
  run.screen = 'treasure';
  run.pending = { kind: 'treasure', size, relic, gold, opened: false, taken: false };
}

export function openChest(run) {
  const p = run.pending;
  if (run.screen !== 'treasure' || p?.kind !== 'treasure') return fail('screen');
  p.opened = true;
  return { ok: true, relic: p.relic, gold: p.gold };
}

export function takeTreasure(run) {
  const p = run.pending;
  if (run.screen !== 'treasure' || p?.kind !== 'treasure') return fail('screen');
  if (p.taken) return fail('taken');
  p.opened = true;
  p.taken = true;
  if (p.relic) addRelic(run, p.relic, 'treasure');
  if (p.gold) gainGold(run, p.gold);
  return { ok: true, relic: p.relic, gold: p.gold };
}

export function leaveTreasure(run) {
  if (run.screen !== 'treasure') return fail('screen');
  toMap(run);
  return { ok: true };
}

// ---------------------------------------------------------------- events (locked rooms)

function startEvent(run, id) {
  if (!id) {
    let pool = Object.values(EVENTS).filter(e => !run.seen.events.includes(e.id) && (!e.canAppear || e.canAppear(run))).map(e => e.id);
    if (!pool.length) pool = Object.values(EVENTS).filter(e => !e.canAppear || e.canAppear(run)).map(e => e.id); // all seen: allow repeats
    id = runRng(run, 'events').pick(pool);
  }
  run.seen.events.push(id);
  run.screen = 'event';
  run.pending = { kind: 'event', id, step: 'start', vars: {}, title: EVENTS[id].title, room: EVENTS[id].room,
    text: '', choices: [], result: [], done: false, picker: null, loot: [] };
  refreshEvent(run);
  log(run, { t: 'event', floor: run.floor, id });
}

/** Re-read the step's text and choices into run.pending (plain data for the screen). */
function refreshEvent(run, keepText = false) {
  const p = run.pending;
  const def = EVENTS[p.id];
  if (p.done) { p.choices = [{ label: 'Continue' }]; return; }
  const step = def.steps[p.step];
  if (!keepText) p.text = typeof step.text === 'function' ? step.text(run, p.vars) : step.text;
  p.room = step.room || def.room;
  p.choices = step.choices(run, p.vars).map(c => ({ label: c.label, ...(c.desc ? { desc: c.desc } : {}),
    ...(c.disabled ? { disabled: true, reason: c.reason || '' } : {}) }));
}

/** Pick an event choice. When the event is done, choice 0 (Continue) leaves (through the reward screen if loot is waiting). */
export function chooseEvent(run, i) {
  const p = run.pending;
  if (run.screen !== 'event' || p?.kind !== 'event') return fail('screen');
  if (p.picker) return fail('picker');
  if (p.done) return leaveEvent(run);
  const def = EVENTS[p.id];
  const choices = def.steps[p.step].choices(run, p.vars);
  const c = choices[i];
  if (!c) return fail('index');
  if (c.disabled) return fail('disabled');
  p.result = [];
  const x = eventApi(run);
  log(run, { t: 'event_choice', floor: run.floor, id: p.id, choice: c.label });
  c.go(x);
  if (run.pending === p && run.screen === 'event') refreshEvent(run, x.textSet);
  return { ok: true, screen: run.screen };
}

/** Answer the event's card picker (uid), or cancel it (null) when it is cancelable. */
export function eventPick(run, uid) {
  const p = run.pending;
  if (run.screen !== 'event' || !p?.picker) return fail('picker');
  if (uid === null || uid === undefined) {
    if (p.picker.cancelable === false) return fail('required');
    p.picker = null;
    refreshEvent(run);
    return { ok: true, cancelled: true };
  }
  const pk = p.picker;
  const ok = pk.mode === 'pick' ? pk.cards.some(c => c.uid === uid) : run.deck.some(c => c.uid === uid);
  if (!ok) return fail('card');
  if (pk.mode === 'upgrade' && !canUpgrade(run.deck.find(c => c.uid === uid))) return fail('card');
  p.picker = null;
  p.result = [];
  const x = eventApi(run, pk);
  EVENTS[p.id].picks[pk.then](x, uid);
  if (run.pending === p && run.screen === 'event') refreshEvent(run, x.textSet);
  return { ok: true, screen: run.screen };
}

function leaveEvent(run) {
  const p = run.pending;
  if (p.loot?.length) { // potions that didn't fit: offer them on the reward screen so a slot can be freed
    run.screen = 'reward';
    run.pending = { kind: 'reward', source: 'event', rewards: p.loot.map(l => ({ ...l })) };
    return { ok: true, screen: run.screen };
  }
  toMap(run);
  return { ok: true, screen: run.screen };
}

/** The helper an event's go(x) / picks get (see content/events.js). */
function eventApi(run, picker) {
  const p = run.pending;
  const chip = (text, tone = '') => p.result.push({ text, tone });
  const x = {
    run, vars: p.vars, textSet: false,
    rng: { events: runRng(run, 'events'), cards: runRng(run, 'cards'), relics: runRng(run, 'relics'), potions: runRng(run, 'potions') },
    chip,
    loseHp(n) { const lost = loseHp(run, n); if (lost) chip(`-${lost} HP`, 'bad'); return lost; },
    heal(n) { const h = heal(run, n); chip(`+${h} HP`, 'good'); return h; },
    gainMaxHp(n) { gainMaxHp(run, n); chip(`+${n} Max HP`, 'good'); },
    gainGold(n) { gainGold(run, n); chip(`+${n} supplies`, 'good'); },
    loseGold(n) { spend(run, Math.min(n, run.gold)); chip(`-${n} supplies`, 'bad'); },
    addCard(id, up = false) { const c = addCard(run, id, up, 'event'); chip(`${cardView(c).name} added`, CARDS[id].type === 'curse' ? 'bad' : 'good'); return c; },
    rollRelic: () => rollRelicId(run, RELIC_ODDS),
    rollPotion: () => rollPotion(runRng(run, 'potions')),
    relic(id) { id = id || rollRelicId(run, RELIC_ODDS); if (!id) { gainGold(run, 50); chip('+50 supplies', 'good'); return null; } addRelic(run, id, 'event'); chip(RELICS[id].name, 'good'); return id; },
    potion(id) {
      id = id || rollPotion(runRng(run, 'potions'));
      if (addPotion(run, id) < 0) { p.loot.push({ kind: 'potion', id }); chip(`${POTIONS[id].name} (no free slot)`, ''); }
      else chip(POTIONS[id].name, 'good');
      return id;
    },
    upgradeRandom(n) {
      const pool = run.deck.filter(canUpgrade);
      runRng(run, 'events').shuffle(pool);
      for (const c of pool.slice(0, n)) { c.up = true; chip(`${cardView(c).name}`, 'good'); }
    },
    upgradeCard(uid) { const c = run.deck.find(k => k.uid === uid); if (c && canUpgrade(c)) { c.up = true; chip(cardView(c).name, 'good'); } },
    removeCard(uid) { const c = removeCard(run, uid, 'event'); if (c) chip(`${cardView(c).name} removed`, 'good'); },
    transformCard(uid) {
      const old = run.deck.find(c => c.uid === uid);
      if (!old) return;
      const c = transformCard(run, uid);
      chip(`${cardView(old).name} became ${cardView(c).name}`, 'good');
    },
    noteCards() {
      const kind = 'fight';
      const a = rollCards(run, 1, { kind, hero: 'marc', movePity: false });
      const b = rollCards(run, 1, { kind, hero: 'yola', movePity: false, exclude: a.map(c => c.id) });
      const c = rollCards(run, 1, { kind, movePity: false, exclude: [...a, ...b].map(k => k.id) });
      return [...a, ...b, ...c];
    },
    addPicked(uid) {
      const card = picker?.cards?.find(c => c.uid === uid);
      if (!card) return;
      addCardInst(run, card, 'event');
      chip(`${cardView(card).name} added`, 'good');
    },
    pick(mode, { then, cards, title, sub, cancelable = true } = {}) {
      const list = cards || (mode === 'upgrade' ? run.deck.filter(canUpgrade) : run.deck.slice());
      p.picker = { mode, cards: list, then, ...(title ? { title } : {}), ...(sub ? { sub } : {}), cancelable };
    },
    fight(encounter, { loot } = {}) {
      p.done = true;
      enterFight(run, ENCOUNTERS[encounter].elite ? 'elite' : 'fight', { encounter, loot: [...(loot || []), ...p.loot], event: p.id });
    },
    text(t) { p.text = t; x.textSet = true; },
    step(name) { p.step = name; x.textSet = false; },
    done(text) { p.done = true; if (text) { p.text = text; x.textSet = true; } },
    leave() { p.done = true; leaveEvent(run); },
  };
  return x;
}

// ---------------------------------------------------------------- pickers (one entry point for the app)

/** Answer whatever card picker is open (Shift Change, an event). uid null = cancel when allowed. */
export function resolvePick(run, uid) {
  if (run.screen === 'event') return eventPick(run, uid);
  const p = run.pending;
  if (run.screen !== 'neow' || !p?.picker) return fail('picker');
  const pk = p.picker;
  if (uid === null || uid === undefined) return fail('required');
  if (pk.mode === 'pick') {
    const card = pk.cards.find(c => c.uid === uid);
    if (!card) return fail('card');
    addCardInst(run, card, 'neow');
  } else if (pk.mode === 'remove') {
    if (!removeCard(run, uid, 'neow')) return fail('card');
  } else if (pk.mode === 'upgrade') {
    const c = run.deck.find(k => k.uid === uid);
    if (!c || !canUpgrade(c)) return fail('card');
    c.up = true;
  }
  p.picker = null;
  toMap(run);
  return { ok: true };
}

// ---------------------------------------------------------------- potions outside a fight

/** Potions that work on the map (only healing ones: the Medkit). */
export const usableOnMap = id => !!POTIONS[id] && POTIONS[id].usable && POTIONS[id].effects.length > 0 && POTIONS[id].effects.every(e => e.op === 'heal');

export function usePotionOnMap(run, slot) {
  if (run.over || run.screen === 'combat') return fail('screen');
  const id = run.potions[slot];
  if (!id) return fail('empty');
  if (!usableOnMap(id)) return fail('combat_only');
  let healed = 0;
  for (const e of POTIONS[id].effects) healed += heal(run, e.pct ? Math.floor(run.maxHp * e.pct) : e.n);
  run.potions[slot] = null;
  run.stats.potionsUsed++;
  log(run, { t: 'potion', floor: run.floor, id, healed });
  return { ok: true, healed };
}

export function discardPotion(run, slot) {
  if (run.screen === 'combat') return fail('screen'); // in a fight, use combat.discardPotion
  if (!run.potions[slot]) return fail('empty');
  run.potions[slot] = null;
  return { ok: true };
}

// ---------------------------------------------------------------- deck, relics, potions, gold, HP

export const canUpgrade = c => !!c && !NO_UPGRADE.has(c.id) && isUpgradable(c);

/**
 * A new CardInst with the run's next uid ('c12'...). Uids come from run.uidSeq (saved with the run), never from
 * module state, so the same seed and choices give the same uids in any session and after a reload.
 */
export function newCard(run, id, up = false) {
  if (!CARDS[id]) throw new Error(`Unknown card: ${id}`);
  let n = run.uidSeq || 0;
  for (const c of run.deck) { const m = /^c(\d+)$/.exec(c.uid || ''); if (m) n = Math.max(n, Number(m[1])); }
  run.uidSeq = n + 1;
  return { uid: 'c' + run.uidSeq, id, up: !!up };
}

/** Add a card by id (Coin Jar etc. fire). Returns the CardInst. */
export function addCard(run, id, up = false, source = 'other') {
  return addCardInst(run, newCard(run, id, up), source);
}

function addCardInst(run, card, source) {
  if (run.deck.some(c => c.uid === card.uid)) card = newCard(run, card.id, card.up);
  run.deck.push(card);
  cardAddedHooks(run, card);
  log(run, { t: 'card', floor: run.floor, id: card.id, up: !!card.up, source });
  return card;
}

/** Relics that react to a new card (Coin Jar). Supplies they hand out count as earned in the run stats. */
function cardAddedHooks(run, card) {
  const before = run.gold;
  for (const r of run.relics) RELICS[r.id]?.onCardAdded?.(run, card);
  if (run.gold > before) run.stats.goldEarned += run.gold - before;
}

export function removeCard(run, uid, source = 'other') {
  const i = run.deck.findIndex(c => c.uid === uid);
  if (i < 0) return null;
  const [card] = run.deck.splice(i, 1);
  log(run, { t: 'remove', floor: run.floor, id: card.id, source });
  return card;
}

/** Transform: a random card of the same hero (any hero for curses and statuses), never the same card. */
export function transformCard(run, uid) {
  const i = run.deck.findIndex(c => c.uid === uid);
  if (i < 0) return null;
  const old = run.deck[i];
  const hero = CARDS[old.id].hero || undefined;
  const pool = cardPool({ hero }).filter(id => id !== old.id);
  const card = newCard(run, runRng(run, 'cards').pick(pool), false);
  run.deck[i] = card;
  cardAddedHooks(run, card);
  log(run, { t: 'transform', floor: run.floor, from: old.id, to: card.id });
  return card;
}

export function addRelic(run, id, source = 'other') {
  if (!RELICS[id] || run.relics.some(r => r.id === id)) return false;
  run.relics.push({ id, counter: 0 });
  RELICS[id].onPickup?.(run);
  log(run, { t: 'relic', floor: run.floor, id, source });
  return true;
}

export const freeSlot = run => run.potions.indexOf(null);

/** Put a potion in the first free slot. Returns the slot, or -1 when all are full. */
export function addPotion(run, id) {
  const slot = freeSlot(run);
  if (slot < 0 || !POTIONS[id]) return -1;
  run.potions[slot] = id;
  return slot;
}

export function gainGold(run, n) { run.gold += n; run.stats.goldEarned += n; }
function spend(run, n) { run.gold -= n; run.stats.goldSpent += n; }
export function heal(run, n) { const h = Math.max(0, Math.min(Math.floor(n), run.maxHp - run.hp)); run.hp += h; return h; }
export function gainMaxHp(run, n) { run.maxHp += n; run.hp += n; }
/** Lose HP outside a fight (events). Never kills: you stay on 1 (events grey out choices you can't afford). */
export function loseHp(run, n) { const l = Math.max(0, Math.min(Math.floor(n), run.hp - 1)); run.hp -= l; run.stats.damageTaken += l; return l; }

// ---------------------------------------------------------------- rolls

/** One card rarity. kind: 'fight' | 'elite' | 'shop' | 'boss'. movePity: card rewards move the pity offset, shops don't. */
export function rollRarity(run, kind = 'fight', movePity = true) {
  const base = CARD_RARITY[kind] || CARD_RARITY.fight;
  const roll = runRng(run, 'cards').int(100) - run.odds.cardRare;
  const rarity = roll < base.rare ? 'rare' : roll < base.rare + base.uncommon ? 'uncommon' : 'common';
  if (movePity) {
    if (rarity === 'rare') run.odds.cardRare = PITY.start;
    else if (rarity === 'common') run.odds.cardRare = Math.min(PITY.cap, run.odds.cardRare + PITY.step);
  }
  return rarity;
}

/** n different reward cards (CardInst). opts: { kind, hero, movePity, exclude: [ids] }. */
export function rollCards(run, n = 3, { kind = 'fight', hero, movePity = true, exclude = [] } = {}) {
  const used = new Set(exclude);
  const out = [];
  for (let i = 0; i < n; i++) {
    const rarity = rollRarity(run, kind, movePity);
    let pool = cardPool({ hero, rarity }).filter(id => !used.has(id));
    if (!pool.length) pool = cardPool({ hero }).filter(id => !used.has(id));
    if (!pool.length) break;
    const id = runRng(run, 'cards').pick(pool);
    used.add(id);
    out.push(newCard(run, id, false));
  }
  return out;
}

/** A relic id the run doesn't have, rarity by weights ({ common, uncommon, rare }); falls back to other rarities. */
export function rollRelicId(run, weights = RELIC_ODDS, exclude = []) {
  const r = runRng(run, 'relics');
  const owned = [...run.relics.map(x => x.id), ...exclude];
  const rarity = r.weighted(Object.entries(weights));
  const order = [rarity, 'common', 'uncommon', 'rare'];
  if (rarity === 'rare') order.splice(1, 0, 'uncommon');
  for (const rr of order) {
    const pool = relicPool(rr, owned);
    if (pool.length) return r.pick(pool);
  }
  return null;
}

// ---------------------------------------------------------------- moving on

function toMap(run) {
  run.screen = 'map';
  run.pending = null;
  run.stats.floorsCleared = Math.max(run.stats.floorsCleared, run.floor);
}

function log(run, entry) { run.stats.log.push(entry); }
function fail(reason) { return { ok: false, reason }; }

// ---------------------------------------------------------------- save / load

/** The whole run as a string (it is already plain JSON). */
export function serialize(run) { return JSON.stringify(run); }

/** A run from serialize(); card uids continue after the deck's highest. */
export function deserialize(str) {
  const run = typeof str === 'string' ? JSON.parse(str) : JSON.parse(JSON.stringify(str));
  if (!run || typeof run !== 'object' || run.version !== RUN_VERSION) throw new Error('Not a Sarno Legends save (or an old version)');
  run.infection = infectionLevel(run.infection); // saves from before Infection levels and the Daily Run
  run.daily ??= null;
  const extra = [];
  const p = run.pending;
  if (p?.picker?.cards) extra.push(...p.picker.cards);
  if (p?.rewards) for (const r of p.rewards) if (r.cards) extra.push(...r.cards);
  if (run.shop?.cards) extra.push(...run.shop.cards.map(c => c.card));
  syncUids([...run.deck, ...extra]);
  return run;
}

// ---------------------------------------------------------------- summary (result screen)

/**
 * The run summary for the result screen. The app adds the scrap tally and unlock hints:
 *   ctx.summary = { ...runSummary(run), ...recordRun(profile, run) }   (meta.js; recordRun is safe to call twice)
 * killedBy is the zombie's name (null for a win, an abandoned run or self-damage). bestHit.card is null: the engine
 * reports the best hit's amount only.
 */
export function runSummary(run) {
  const S = run.stats;
  const killer = S.cause && ENEMIES[S.cause] ? ENEMIES[S.cause].name : null;
  return {
    won: !!run.won, over: !!run.over, floor: run.floor, kills: S.kills, finishers: S.finishers, turns: S.turns,
    fights: S.fights, elites: S.elites, bosses: S.bosses, cardsPlayed: S.cardsPlayed, damageTaken: S.damageTaken,
    potionsUsed: S.potionsUsed, goldEarned: S.goldEarned,
    bestHit: S.bestHit.amount ? { ...S.bestHit } : null,
    killedBy: run.won ? null : killer, abandoned: S.cause === 'abandoned', seed: run.seed, deck: run.deck.map(c => ({ ...c })),
    relics: run.relics.map(r => r.id), weapons: { ...run.weapons }, hp: run.hp, maxHp: run.maxHp,
    infection: run.infection || 0, daily: run.daily || null, score: scoreBreakdown(run),
  };
}

// ---------------------------------------------------------------- Daily Run and score

/** 'YYYY-MM-DD' for a Date (local time) or a date string. */
export function dailyDate(date = new Date()) {
  if (typeof date === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
    if (!m) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
    return m[0];
  }
  const d = date instanceof Date ? date : new Date(date);
  const p2 = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** The Daily Run's seed for a local date (Date or 'YYYY-MM-DD'): the same map, fights, rewards and Shift Change for everyone. */
export function dailySeed(date = new Date()) {
  return `DAILY-${dailyDate(date)}`;
}

/** Points per thing a run did (scoreRun). No time component: a slow, careful turn never costs points. */
export const SCORE = { floor: 10, kill: 2, elite: 10, boss: 50, win: 100, hpLeft: 1 };

/**
 * A run's score with its lines: 10 per floor reached (the boss is floor 16), 2 per zombie killed, 10 per elite and
 * 50 for the boss beaten, and on a win 100 more plus 1 per HP left.
 * -> { total, lines: [{ label, points }] }
 */
export function scoreBreakdown(run) {
  const S = run.stats || {};
  const lines = [];
  const add = (label, points) => { if (points) lines.push({ label, points }); };
  add(`Floors reached ×${run.floor || 0}`, (run.floor || 0) * SCORE.floor);
  add(`Zombies killed ×${S.kills || 0}`, (S.kills || 0) * SCORE.kill);
  add(`Elites beaten ×${S.elites || 0}`, (S.elites || 0) * SCORE.elite);
  add('Boss beaten', (S.bosses || 0) * SCORE.boss);
  if (run.won) { add('Floor cleared', SCORE.win); add(`HP left ×${run.hp}`, run.hp * SCORE.hpLeft); }
  return { total: lines.reduce((t, l) => t + l.points, 0), lines };
}

/** The run's score (a number), for the Daily Run's best and for comparing any two runs. */
export const scoreRun = run => scoreBreakdown(run).total;
