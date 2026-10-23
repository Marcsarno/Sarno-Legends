// Bots for the balance sim: four players of different skill that drive src/game/run.js and the combat engine
// headless. Pure ES module (no node built-ins), so the app's autoplay could import it too.
//
//   BOTS.random    plays random cards at random targets, takes random paths and choices.
//   BOTS.greedy    the engine test's greedy fighter (scores each card by its preview numbers, no lookahead); picks the
//                  highest-rated card every time, rests under half HP, takes the first non-leave event choice.
//   BOTS.sensible  BUILD_SPEC's sensible player, rule-based, one card at a time: kill what it can, block when the coming
//                  hit is big (less when the Big Walker's Rage punishes Skills), powers early, Staggered on the focus
//                  zombie before the cash-ins, then the best damage per energy. Run choices: a route planner (elites when
//                  healthy, rests when hurt, shops with supplies), a card tier list with Staggered synergy and deck-size
//                  discipline, removal of starter cards, rest under half HP (70% before the boss) or upgrade, potions in
//                  elite/boss fights or when in danger.
//   BOTS.expert    the same run choices, but each turn is planned by searching card orders on copies of the fight and
//                  scoring the end state (HP now, the hit that is coming, a rough cost of the rest of the fight). It never
//                  peeks at draws. An upper bound: a careful player who plans every turn.
// A bot: { name, neow(run), pick(run, picker) -> uid|null, path(run, nodes) -> id, turn(combat, info),
//          rewards(run), rest(run), shop(run), event(run) -> choice index, mapPotions(run) }. (play.mjs always takes treasure.)
// Card choices in a fight (combat.state.choice: Check the Mag, Tough It Out, Wait for It): every bot answers them;
// chooseFor(combat) -> uids is the sensible answer and settleChoice(combat) applies it (the app's autoplay can use both).
// Card ratings: CARD_SCORE (base) + rateCard (the deck's builds: Staggered, Strength, Bulwark...). withArchetype(bot,
// 'bulwark'|'strength'|'stagger') drafts toward one build for the --archetype sim.

import * as R from '../../src/game/run.js';
import { CARDS, cardView, isUpgradable } from '../../src/game/content/cards.js';
import { RELICS } from '../../src/game/content/relics.js';
import { POTIONS } from '../../src/game/content/potions.js';
import { restoreStreams, streamsState } from '../../src/game/rng.js';

// ================================================================ ratings (a human-ish tier list, 0..10)

// Base ratings: half the old hand-made tier list, half the measured value of one copy in the starter deck at Infection 5
// (tools/sim/cardvalue.mjs, docs/BALANCE.md). Synergy cards keep a low base: rateCard adds their archetype's value.
export const CARD_SCORE = {
  // starter + weapon swaps (only used for removal / upgrade order)
  bat_swing: 1, pistol_shot: 1, brace: 1.5, sidestep: 1.5, home_run: 5, clean_shot: 4,
  nail_swing: 2.5, barbed_swing: 3, pry_loose: 6, chop_block: 4, sledge: 6, buckshot: 3.5, both_barrels: 5,
  // Marc
  crowbar_pry: 5.8, shoulder_check: 5.5, wild_swing: 5.3, heavy_swing: 4.5, one_two: 5.4, hold_the_line: 5.9, deep_breath: 5.4,
  tough_it_out: 4.4, kick_the_door: 5, haymaker: 5.8, tackle: 2.8, batter_up: 5.6, overhead_smash: 7.2, ground_pound: 5.5,
  momentum: 5.4, dig_in: 2.8, thick_skin: 6.7, pumped_up: 6.8, swing_guard: 4.6, jaw_breaker: 7.6, wrench_arm: 5.6, grit_teeth: 4.4,
  berserker: 6.5, grand_slam: 6.5, bolt_the_door: 5.4, fortify: 3, battering_ram: 4.2, make_it_count: 6, rally: 3,
  // Yola
  double_tap: 5.2, aimed_shot: 5.2, kneecap: 5.7, suppressing_fire: 5, cover_him: 4.9, tuck_and_roll: 4.8, check_mag: 4.6,
  wait_for_it: 4.6, flare: 5.3, quick_shot: 5.6, cheap_shot: 5.6, headshot: 5.5, triage: 5.8, adrenaline_shot: 6.3, marksman: 5.2,
  spray_and_pray: 4.7, painkillers: 6, light_on_feet: 4.8, triple_tap: 5.1, covering_fire: 5.5, clean_kill: 5.7, overdrive: 5.7,
  slow_motion: 4.4, dead_eye: 4.6, defibrillator: 5.2, point_blank: 6.8, barbed_wire: 5,
  // status / curse
  panic: -5, bile: -3, infection: -6,
};
const STAGGER_SOURCES = new Set(['home_run', 'pry_loose', 'sledge', 'crowbar_pry', 'overhead_smash', 'ground_pound', 'jaw_breaker']);
const CASH_INS = new Set(['clean_shot', 'cheap_shot', 'headshot', 'triple_tap', 'point_blank', 'aimed_shot', 'kick_the_door',
  'batter_up', 'dead_eye', 'marksman', 'both_barrels', 'cover_him', 'double_tap']);
const REMOVE_ORDER = ['infection', 'bile', 'panic', 'bat_swing', 'pistol_shot', 'nail_swing', 'brace', 'sidestep', 'buckshot'];
// Strength: sources (how much each gives, roughly) and the cards that multiply it (hits per play, or Heavy Swing's x3)
const STRENGTH_SOURCES = { pumped_up: 2, berserker: 3, deep_breath: 1, wrench_arm: 0 };
const STRENGTH_PAYOFFS = { heavy_swing: 3, one_two: 2, double_tap: 2, triple_tap: 3, batter_up: 2, spray_and_pray: 3, rally: 2,
  deep_breath: 1, wild_swing: 1, momentum: 1 };
// Bulwark (Marc's Block build): engines make Block, payoffs spend or keep it
const BLOCK_ENGINES = new Set(['thick_skin', 'painkillers', 'light_on_feet', 'swing_guard', 'bolt_the_door', 'hold_the_line',
  'shoulder_check', 'tough_it_out', 'covering_fire', 'wait_for_it', 'cover_him', 'tuck_and_roll']);
const BULWARK_PAYOFFS = new Set(['tackle', 'dig_in', 'fortify', 'battering_ram', 'barbed_wire']);
/**
 * Draft leanings for the --archetype sim (withArchetype), the way a person commits to a build: payoffs whenever they
 * show up, support once a payoff is in the deck.
 */
export const ARCHETYPES = {
  bulwark: { payoffs: BULWARK_PAYOFFS, support: BLOCK_ENGINES },
  strength: { payoffs: new Set(['pumped_up', 'berserker', 'rally', 'heavy_swing']), support: new Set([...Object.keys(STRENGTH_SOURCES), ...Object.keys(STRENGTH_PAYOFFS)]) },
  stagger: { payoffs: new Set(['marksman', 'dead_eye', 'headshot', 'point_blank']), support: new Set([...STAGGER_SOURCES, ...CASH_INS]) },
};

export const RELIC_SCORE = {
  steel_plate: 9, protein_bar: 8, riot_vest: 7, duct_tape: 7, coffee_thermos: 7, defib_pads: 7, cooler: 6, hollow_points: 6,
  trophy_belt: 6, emergency_rations: 6, door_wedge: 6, combo_counter: 6, stethoscope: 6, pager: 6, knee_brace: 6, granola: 6,
  tally_marks: 6, iv_bag: 5, box_cutter: 4, staff_badge: 4, coin_jar: 3, doctors_note: 3,
};
export const POTION_SCORE = { epi_pen: 8, medkit: 6, pipe_bomb: 6, flashbang: 5.5, protein_shake: 5.5, adrenaline: 5, body_armor: 5,
  extinguisher: 5, energy_drink: 4.5, painkiller_pills: 4.5 };

// ================================================================ shared helpers

const hpPct = run => run.hp / run.maxHp;
const countIds = (deck, set) => deck.filter(c => set.has(c.id)).length;
const isRemovable = c => REMOVE_ORDER.includes(c.id);

/**
 * How much a card would add to this deck right now: the base rating, then the deck's builds (Staggered sources and
 * cash-ins, Strength and the multi-hit cards that multiply it, Bulwark engines and payoffs, energy for expensive hands,
 * thinning for starter-heavy decks), the defence the deck still lacks, and fewer points for copies and extra powers.
 */
export function rateCard(run, id) {
  let s = CARD_SCORE[id] ?? 4;
  const deck = run.deck;
  const has = r => run.relics.some(x => x.id === r);
  const def = CARDS[id];
  const ids = deck.map(c => c.id);
  // Staggered: Marc sets it up, Yola cashes in
  const stag = countIds(deck, STAGGER_SOURCES) + (has('pager') ? 1 : 0) + (run.weapons?.marc === 'crowbar' ? 1 : 0);
  const cash = countIds(deck, CASH_INS);
  if (CASH_INS.has(id)) s += id === 'dead_eye' ? Math.min(2.5, 0.5 * (stag - 1)) : Math.min(1.5, 0.35 * (stag - 1));
  if (id === 'wait_for_it') s += Math.min(1, 0.15 * cash); // Retain holds a cash-in for the turn Marc staggers
  if (STAGGER_SOURCES.has(id)) s += Math.min(1.5, 0.3 * cash);
  // Strength
  const str = ids.reduce((t, k) => t + (STRENGTH_SOURCES[k] || 0), 0) + (has('protein_bar') ? 1 : 0);
  const multi = ids.reduce((t, k) => t + (STRENGTH_PAYOFFS[k] ? 1 : 0), 0);
  if (STRENGTH_PAYOFFS[id]) s += Math.min(id === 'rally' ? 3.5 : 2, 0.25 * str * STRENGTH_PAYOFFS[id]);
  if (STRENGTH_SOURCES[id]) s += Math.min(1.5, 0.3 * multi);
  // Bulwark
  const blocks = deck.filter(c => cardView(c).effects.some(e => e.op === 'block')).length;
  const engines = countIds(deck, BLOCK_ENGINES) + (has('duct_tape') || has('riot_vest') || has('door_wedge') ? 1 : 0);
  const payoffs = countIds(deck, BULWARK_PAYOFFS);
  if (BULWARK_PAYOFFS.has(id)) s += Math.min(3.5, 0.15 * blocks + 0.6 * engines + 0.8 * payoffs);
  if (BLOCK_ENGINES.has(id)) s += Math.min(1.5, 0.6 * payoffs);
  if (id === 'light_on_feet') s += Math.min(1.5, 0.12 * deck.filter(c => CARDS[c.id].type === 'skill').length);
  if (id === 'swing_guard') s += Math.min(1, 0.08 * deck.filter(c => CARDS[c.id].type === 'attack').length);
  // energy for expensive hands, thinning for decks full of starters
  if (id === 'grit_teeth' || id === 'slow_motion') s += Math.min(1.5, 0.25 * deck.filter(c => (cardView(c).cost ?? 0) >= 2).length);
  if (id === 'tough_it_out' || id === 'check_mag') s += Math.min(1, 0.12 * deck.filter(c => REMOVE_ORDER.includes(c.id)).length);
  // defence the deck lacks, AoE, copies, powers
  if (def.effects.some(e => e.op === 'block') && blocks < deck.length * 0.3) s += 0.8;
  if (def.effects.some(e => e.op === 'damage' && e.to === 'all')) s += 0.4;
  s -= 0.8 * deck.filter(c => c.id === id).length;
  if (def.type === 'power') s -= 0.3 * deck.filter(c => CARDS[c.id].type === 'power').length;
  if (archBias) {
    const committed = deck.some(c => archBias.payoffs.has(c.id));
    s += archBias.payoffs.has(id) ? 2.5 : archBias.support.has(id) ? (committed ? 1.5 : 0.5) : -0.3;
  }
  return s;
}

let archBias = null;
/** A bot that drafts toward one build (ARCHETYPES): its card picks and shopping lean that way, its play is the same. */
export function withArchetype(bot, name) {
  const set = ARCHETYPES[name];
  if (!set) throw new Error(`unknown archetype ${name} (${Object.keys(ARCHETYPES).join(', ')})`);
  const wrap = f => (...a) => { const prev = archBias; archBias = set; try { return f(...a); } finally { archBias = prev; } };
  return { ...bot, name: `${bot.name}+${name}`, pick: wrap(bot.pick), rewards: wrap(bot.rewards), shop: wrap(bot.shop), neow: wrap(bot.neow) };
}

/** The bar a card must clear to be worth adding (bigger decks are pickier). */
export const takeBar = run => (run.deck.length <= 14 ? 4.4 : run.deck.length <= 20 ? 5.4 : 6.4);

/** How much upgrading this card helps (from the numbers the upgrade changes). */
export function upgradeGain(c) {
  if (!R.canUpgrade(c)) return -1;
  const a = cardView(c.id, false), b = cardView(c.id, true);
  let g = 0;
  if (b.cost !== a.cost) g += 4 * (a.cost - b.cost);
  if (a.keywords.includes('exhaust') && !b.keywords.includes('exhaust')) g += 3;
  const ops = (list) => list.flatMap(e => (e.op === 'if' ? e.then : [e]));
  const ea = ops(a.effects), eb = ops(b.effects);
  for (let i = 0; i < Math.min(ea.length, eb.length); i++) {
    const x = ea[i], y = eb[i];
    if (x.op !== y.op) continue;
    const dn = (typeof y.n === 'number' ? y.n : 0) - (typeof x.n === 'number' ? x.n : 0);
    if (x.op === 'damage') g += dn * (y.times || 1) * (y.to === 'all' ? 1.5 : 1) + ((y.times || 1) - (x.times || 1)) * (y.n || 0)
      + ((y.bonusStaggered || 0) - (x.bonusStaggered || 0)) * 0.5 + ((y.scaleStr || 1) - (x.scaleStr || 1)) + ((y.grow || 0) - (x.grow || 0)) * 0.5;
    else if (x.op === 'block') g += dn;
    else if (x.op === 'apply') g += Math.abs(dn) * (['strength', 'dexterity', 'berserker', 'thick_skin', 'marksman'].includes(x.status) ? 4 : 2.5);
    else if (x.op === 'draw' || x.op === 'energy') g += dn * 3;
    else if (x.op === 'heal') g += dn * 0.7;
    else if (x.op === 'tempStrength') g += dn;
  }
  return g + (CARD_SCORE[c.id] || 3) * 0.15;
}

function bestUpgrade(run) {
  let best = null, bg = 0;
  for (const c of run.deck) { const g = upgradeGain(c); if (g > bg) { bg = g; best = c; } }
  return best;
}

function worstCard(cards) {
  for (const id of REMOVE_ORDER) { const c = cards.find(k => k.id === id); if (c) return c; }
  return cards.slice().sort((a, b) => (CARD_SCORE[a.id] ?? 4) - (CARD_SCORE[b.id] ?? 4))[0];
}

// ================================================================ combat: copies of a fight (for lookahead)

/** A deep copy of a live combat that can be played forward without touching the original. */
export function cloneCombat(c) {
  const k = Object.create(Object.getPrototypeOf(c));
  Object.assign(k, c);
  k.state = JSON.parse(JSON.stringify(c.state));
  k.streams = restoreStreams(streamsState(c.streams));
  k.rng = k.streams.misc;
  k.events = [];
  k.log = null;
  k.killOrder = c.killOrder.slice();
  k.lastIntentShown = new Map(c.lastIntentShown);
  return k;
}

/** Distinct (card, target) plays available now. */
function playOptions(c) {
  const S = c.state;
  const alive = c.alive();
  const seen = new Set();
  const out = [];
  for (const card of S.hand) {
    const cost = c.costOf(card);
    if (cost === null || cost > S.energy) continue;
    const view = cardView(card);
    if (view.keywords.includes('unplayable')) continue;
    const targets = view.target === 'enemy' ? alive.map(e => e.uid) : [undefined];
    for (const t of targets) {
      const key = `${card.id}${card.up ? '+' : ''}:${cost}:${card.bonus || 0}:${t || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ uid: card.uid, target: t, id: card.id });
    }
  }
  return out;
}

function stateKey(c) {
  const S = c.state;
  return JSON.stringify([S.energy, S.hand.map(h => h.id + (h.up ? '+' : '') + (h.costTurn ?? '')).sort(), S.party.hp, S.party.block, S.party.statuses,
    S.enemies.map(e => [e.hp, e.block, e.alive, e.statuses]), S.draw.length, S.discard.length, S.exhaust.length, S.powers.length]);
}

// ================================================================ combat: the sensible evaluation

// expected damage per zombie turn (a rough average of its move set at A0)
const DANGER = { shambler: 8, biter: 5, spitter: 4, screamer: 7, sprinter: 9, nurse: 7, bloater: 5, big_walker: 13,
  sleeping_patient: 12, orderly: 6, shield_guard: 14 };

/** Our damage per turn from this deck (playing it evenly), for the fight-length estimate. */
export function deckDpt(run) {
  let dmg = 0, cost = 0;
  for (const c of run.deck) {
    const v = cardView(c);
    if (v.cost === null) continue;
    cost += Math.max(0.5, v.cost);
    for (const e of v.effects) if (e.op === 'damage') dmg += (e.n || 0) * (e.times || 1) + (e.bonusStaggered || 0) * 0.4 + (e.nFrom ? 6 : 0);
  }
  return cost ? Math.max(6, (dmg / cost) * 3) : 8;
}

/**
 * Score a fight state as if the turn ended now: HP, minus the hit that is coming, minus a rough cost of the rest
 * of the fight (each zombie's danger over the turns it takes to kill them in the best order).
 */
export function evaluate(c, info, W = EXPERT_WEIGHTS) {
  const S = c.state, P = S.party;
  if (S.phase === 'lost') return -10000;
  if (S.phase === 'won') return P.hp + P.maxHp * 0.5 + 20;
  const st = P.statuses;
  const strPerm = (st.strength || 0) - (st.temp_strength || 0);
  let D = info.dpt + strPerm * 2.5 + (st.berserker || 0) * 4 + (st.marksman || 0) * 1 + (st.dead_eye ? 2 : 0) + (st.battering_ram || 0) * 1.5;
  if ((st.weak || 0) > 1) D *= 0.85;
  D = Math.max(4, D);

  // the coming zombie turn
  let incoming = 0;
  for (const e of c.alive()) { const it = c.intentOf(e.uid); if (it && it.total) incoming += it.total; }
  const infections = S.hand.filter(h => h.id === 'infection').length;
  let loss = Math.max(0, incoming - P.block) + infections;
  if (c.hasRelic('steel_plate')) loss = Math.max(0, loss - 1);
  let v = P.hp - loss;
  if (P.hp - loss <= 0) v -= 400;

  // the rest of the fight
  const foes = c.alive().map(e => {
    let danger = (DANGER[e.id] ?? 6) + (e.statuses.strength || 0) * (e.id === 'shield_guard' ? 2 : 1) + (e.statuses.ritual || 0) * 2;
    const wRem = Math.max(0, (e.statuses.weak || 0) - 1);
    let hp = e.hp + (e.statuses.plating || 0) * 2 + (e.statuses.hunch || 0);
    const vRem = Math.max(0, (e.statuses.vulnerable || 0) - 1);
    hp = Math.max(1, hp - Math.min(vRem, 3) * D * 0.4);
    return { e, danger, hp, wRem };
  });
  foes.sort((a, b) => b.danger / b.hp - a.danger / a.hp);
  let t = 0, future = 0;
  for (const f of foes) {
    t += f.hp / D;
    future += f.danger * t - 0.25 * f.danger * Math.min(f.wRem, t);
  }
  const tTotal = t;
  const pv = Math.max(0, (st.vulnerable || 0) - 1);
  if (pv) future += 0.5 * foes.reduce((a, f) => a + f.danger, 0) * Math.min(pv, tTotal);
  let mitigation = ((st.thick_skin || 0) + (st.dexterity || 0) * 1.5 + (st.light_feet || 0) * 1.5 + (st.fortify ? 3 : 0)) * tTotal;
  const thorns = foes.reduce((a, f) => a + (f.e.statuses.thorns || 0), 0);
  future += thorns * 3;
  v -= W.future * Math.max(0, future - mitigation);
  if (c.hasRelic('cooler')) v += S.energy * 0.8;
  return v;
}

export const EXPERT_WEIGHTS = { future: 0.75, maxNodes: 350, drawValue: 0.6 };

/**
 * Search card orders on copies of the fight; return the best sequence of plays for this turn.
 * No peeking: a play that draws cards ends its branch (scored with a flat value per card drawn), and the bot plans
 * again once the real cards are in hand, the way a person would.
 */
export function planTurn(c, info, W = EXPERT_WEIGHTS) {
  let best = { score: evaluate(c, info, W), seq: [] };
  const seen = new Set();
  let nodes = 0;
  const dfs = (cc, seq) => {
    const handBefore = new Set(cc.state.hand.map(h => h.uid));
    for (const o of playOptions(cc)) {
      if (nodes >= W.maxNodes) return;
      const k = cloneCombat(cc);
      nodes++;
      if (!k.playCard(o.uid, o.target).ok) continue;
      settleChoice(k);
      const drawn = k.state.hand.filter(h => !handBefore.has(h.uid)).length;
      const key = stateKey(k);
      if (!drawn && seen.has(key)) continue;
      seen.add(key);
      let s = evaluate(k, info, W);
      if (drawn && !k.over) s += drawn * W.drawValue * (info.dpt / 3) * (k.state.energy > 0 ? 1 : 0.35);
      const nseq = [...seq, o];
      if (s > best.score + 1e-9) best = { score: s, seq: nseq };
      if (!k.over && !drawn) dfs(k, nseq);
    }
  };
  dfs(c, []);
  return best.seq;
}

function expertTurn(c, info) {
  settleChoice(c);
  usePotionsSensibly(c, info);
  for (let guard = 0; guard < 12 && !c.over && c.state.phase === 'player'; guard++) {
    settleChoice(c);
    const seq = planTurn(c, info);
    if (!seq.length) return;
    for (const o of seq) {
      if (c.over || !c.playCard(o.uid, o.target).ok) break;
      settleChoice(c);
    }
  }
}

// ================================================================ combat: the sensible (rule-based) player

/** The zombie to focus: the most danger for the HP it has left (Staggered ones count as softer). Stable turn to turn. */
function focusTarget(c, alive) {
  let best = null, bs = -Infinity;
  for (const e of alive) {
    const danger = (DANGER[e.id] ?? 6) + (e.statuses.strength || 0) + (e.statuses.ritual || 0) * 2;
    const eff = (e.hp + e.block) / ((e.statuses.vulnerable || 0) > 0 ? 1.5 : 1);
    const s = danger / Math.max(1, eff);
    if (s > bs) { bs = s; best = e; }
  }
  return best;
}

/** Every playable (card, target) with its preview numbers. AoE / random damage is summed over the zombies. */
function ruleOptions(c, alive) {
  const S = c.state, P = S.party;
  const out = [];
  const ram = P.statuses.battering_ram || 0;
  for (const card of S.hand) {
    const cost = c.costOf(card);
    if (cost === null || cost > S.energy) continue;
    const view = cardView(card);
    if (view.keywords.includes('unplayable')) continue;
    const targets = view.target === 'enemy' ? alive : [null];
    const eff = view.effects.flatMap(e => (e.op === 'if' ? e.then : [e]));
    for (const t of targets) {
      const p = c.previewCard(card.uid, t?.uid);
      let dmg = 0, kills = 0;
      for (const op of p.ops) {
        if (op.op !== 'damage') continue;
        if (op.to === 'all') for (const e of alive) {
          const v = c.previewCard(card.uid, e.uid).ops.find(x => x.index === op.index).value * op.hits;
          dmg += Math.min(v, e.hp + e.block);
          if (v >= e.hp + e.block) kills++;
        } else if (op.to === 'random') dmg += op.value * op.hits;
        else if (t) { const v = op.value * op.hits; dmg += Math.min(v, t.hp + t.block); if (v >= t.hp + t.block) kills++; }
      }
      // Weakened on attackers is Block you don't have to play: a quarter of what they are about to hit for
      let mitig = 0;
      for (const e of eff) {
        if (e.op !== 'apply' || e.status !== 'weak') continue;
        const hit = (z) => (z.statuses.weak > 0 ? 0 : (c.intentOf(z.uid)?.total || 0) * 0.25);
        if (e.to === 'all') mitig += alive.reduce((a, z) => a + hit(z), 0);
        else if (t) mitig += hit(t);
      }
      const blockOps = p.ops.filter(o => o.op === 'block').length;
      const barbed = eff.reduce((a, e) => a + (e.op === 'apply' && e.status === 'barbed' ? e.n : 0), 0);
      if (barbed) for (const z of alive) { const it = c.intentOf(z.uid); if (it?.hits) dmg += Math.min(z.hp, barbed * it.hits) * 0.8; }
      if (ram && blockOps) dmg += ram * blockOps * 0.8; // Battering Ram: each Block gain hits a random zombie
      out.push({ uid: card.uid, target: t?.uid, card, view, cost, dmg, kills, block: p.block, mitig: Math.floor(mitig),
        stagger: eff.some(e => e.op === 'apply' && e.status === 'vulnerable'),
        weak: eff.some(e => e.op === 'apply' && e.status === 'weak'),
        draw: eff.some(e => e.op === 'draw' || e.op === 'energy'),
        energy: eff.reduce((a, e) => a + (e.op === 'energy' ? e.n : 0), 0),
        selfHarm: eff.some(e => e.op === 'loseHp'), heal: eff.reduce((a, e) => a + (e.op === 'heal' ? (e.n || 0) : 0), 0),
        tempStr: eff.reduce((a, e) => a + (e.op === 'tempStrength' ? e.n : e.op === 'doubleStatus' && e.status === 'strength' ? Math.max(0, P.statuses.strength || 0) : 0), 0),
        swingGuard: eff.reduce((a, e) => a + (e.op === 'apply' && e.status === 'swing_guard' ? e.n : 0), 0),
        slowMo: eff.some(e => e.op === 'slowMotion'),
        disarm: eff.reduce((a, e) => a + (e.op === 'apply' && e.status === 'strength' && e.n < 0 && (e.to || 'target') === 'target' ? -e.n : 0), 0),
        cashIn: eff.some(e => e.op === 'damage' && e.bonusStaggered) });
    }
  }
  return out;
}

/** All the fight's cards (hand, piles, the played powers). */
const fightCards = c => { const S = c.state; return [...S.hand, ...S.draw, ...S.discard, ...S.exhaust]; };

/**
 * Is a power worth its energy in this fight? Synergy powers need their partners in the deck (Dead Eye: Staggered
 * sources; Fortify: Block to keep, or a long fight), and the slow ones wait for a fight that lasts.
 */
function powerFits(c, view) {
  const S = c.state;
  const long = longFight(c);
  const cards = fightCards(c);
  if (view.id === 'dead_eye') return long && cards.filter(k => STAGGER_SOURCES.has(k.id)).length + (c.hasRelic('pager') ? 1 : 0) >= 2;
  if (view.id === 'fortify') {
    const blocks = cards.filter(k => cardView(k).effects.some(e => e.op === 'block')).length;
    return long && (blocks >= 8 || (blocks >= 5 && cards.some(k => BULWARK_PAYOFFS.has(k.id))));
  }
  if (view.cost >= 3) return long;
  return long || S.turn <= 2;
}

const longFight = c => c.state.elite || c.state.boss || c.alive().reduce((t, e) => t + e.hp, 0) > 70;

/** Hits of damage the attacks in hand could land this turn with `energy` (cheapest first; AoE counts each zombie). */
function hitsInHand(c, energy, exceptUid) {
  const atk = [];
  for (const card of c.state.hand) {
    if (card.uid === exceptUid) continue;
    const v = cardView(card);
    const cost = c.costOf(card);
    if (v.type !== 'attack' || cost === null) continue;
    let hits = 0;
    for (const e of v.effects) if (e.op === 'damage') hits += (e.times || 1) * (e.to === 'all' ? c.alive().length : 1);
    atk.push({ cost, hits });
  }
  atk.sort((a, b) => a.cost - b.cost);
  let left = energy, hits = 0, count = 0;
  for (const a of atk) { if (a.cost > left) continue; left -= a.cost; hits += a.hits; count++; }
  return { hits, count };
}

/** Energy the rest of the hand would like to spend (playable cards only). */
const handCost = (c, exceptUid) => c.state.hand.reduce((t, k) => {
  if (k.uid === exceptUid) return t;
  const v = cardView(k), cost = c.costOf(k);
  return cost === null || v.type === 'status' || v.type === 'curse' ? t : t + cost;
}, 0);

/** Answer any open card choice (Check the Mag, Tough It Out, Wait for It) the bot's way. */
export function settleChoice(c) {
  for (let g = 0; g < 6 && c.state.choice; g++) if (!c.choose(chooseFor(c)).ok) break;
}

/**
 * The bot's pick for an open choice (combat.state.choice) -> uids. Discard: the least useful card now (statuses and
 * curses, then what it can't afford, then the lowest rated). Exhaust: curses and statuses, then starter basics.
 * Retain: what it can't afford this turn, and Yola's cash-ins while nothing is Staggered. Upgrade: the biggest gain.
 * The app's autoplay can call it too: c.choose(chooseFor(c)).
 */
export function chooseFor(c) {
  const S = c.state, ch = S.choice;
  if (!ch) return [];
  const cards = ch.uids.map(u => (S[ch.from] || S.hand).find(h => h.uid === u)).filter(Boolean);
  const junk = k => ['status', 'curse'].includes(cardView(k).type);
  const keepNow = k => {
    if (junk(k)) return -10;
    const cost = c.costOf(k);
    if (cost === null) return -8;
    return (CARD_SCORE[k.id] ?? 4) + (k.up ? 0.5 : 0) - (cost > S.energy ? 2.5 : 0);
  };
  const take = (list, f, n) => list.slice().sort((a, b) => f(a) - f(b)).slice(0, n).map(k => k.uid);
  if (ch.kind === 'upgrade') return take(cards, k => -upgradeGain(k), ch.n);
  if (ch.kind === 'retain') {
    const anyStag = c.alive().some(e => e.statuses.vulnerable > 0);
    const keep = cards.filter(k => !junk(k) && ((c.costOf(k) ?? 0) > S.energy && (CARD_SCORE[k.id] ?? 4) >= 4 || (!anyStag && CASH_INS.has(k.id))));
    return take(keep, k => -keepNow(k), ch.n);
  }
  if (ch.kind === 'exhaust') {
    const rank = k => (junk(k) ? -20 : REMOVE_ORDER.includes(k.id) ? -10 + REMOVE_ORDER.indexOf(k.id) * 0.1 : keepNow(k));
    return take(cards, rank, Math.max(ch.min, 1));
  }
  return take(cards, keepNow, Math.max(ch.min, 1));
}

/**
 * Rules, in order, one card at a time: free heals and set-up buffs (Strength for this turn, Swing Guard) when the hand
 * can use them; kill what you can; block when the coming hit is big (less when the Big Walker punishes Skills; Weakened
 * counts as Block); play powers early; draw and energy (Grit Teeth / Slow Motion only when the hand needs the energy);
 * Bulwark: Block first when Tackle is in hand; Staggered on the focus zombie before attacking it; then the best damage
 * per energy on the focus (Yola's cash-ins shine here); spare energy goes into Block.
 */
function sensibleTurn(c, info) {
  settleChoice(c);
  usePotionsSensibly(c, info);
  let blockSpent = 0, swung = false;
  for (let guard = 0; guard < 25 && !c.over && c.state.phase === 'player'; guard++) {
    settleChoice(c);
    const S = c.state, P = S.party;
    const alive = c.alive();
    const incoming = alive.reduce((t, e) => t + (c.intentOf(e.uid)?.total || 0), 0);
    const fortified = (P.statuses.fortify || 0) > 0;
    const need = Math.max(0, incoming - P.block);
    const enraged = alive.some(e => (e.statuses.enrage || 0) > 0);
    const thorns = alive.reduce((t, e) => t + (e.statuses.thorns || 0), 0);
    const focus = focusTarget(c, alive);
    const opts = ruleOptions(c, alive).filter(o => o.view.type !== 'status' && o.view.type !== 'curse');
    if (!opts.length) return;
    const isDig = o => o.view.effects.some(e => e.op === 'doubleBlock');
    const per = o => o.cost || 0.5;
    const by = (list, f) => list.slice().sort((a, b) => f(b) - f(a))[0];
    let pick = null;
    // 0. free heals when hurt; set-up buffs when this turn's attacks can use them
    pick = opts.find(o => o.heal && o.cost === 0 && P.maxHp - P.hp >= o.heal) || null;
    if (!pick && !enraged) pick = opts.find(o => o.tempStr > 0 && o.tempStr * hitsInHand(c, S.energy - o.cost, o.uid).hits >= 5) || null;
    if (!pick && need > 0) pick = opts.find(o => o.swingGuard > 0 && o.swingGuard * hitsInHand(c, S.energy - o.cost, o.uid).count >= 6) || null;
    // 1. a kill (cheapest first)
    const killers = opts.filter(o => o.kills > 0);
    if (!pick && killers.length) pick = killers.sort((a, b) => a.cost - b.cost || b.kills - a.kills)[0];
    // 2. block a big hit (with the Big Walker's Rage up, only to stay alive: every Skill makes it stronger)
    const blockers = opts.filter(o => (o.block > 0 || o.mitig > 0) && (!isDig(o) || o.block >= 6) && (!enraged || o.view.type !== 'skill' || need >= P.hp - 8));
    const cover = o => o.block + o.mitig;
    const enemyHp = alive.reduce((t, e) => t + e.hp + e.block, 0);
    const racing = enemyHp <= S.energy * info.dpt / 3 * 1.2; // we can probably finish it this turn
    // block some, hit some: unless the hit is a big share of HP, the main swing goes first if it leaves energy to block
    const moderate = need < P.hp * 0.3;
    const blockBudget = moderate ? Math.ceil(S.maxEnergy / 2) : Infinity;
    const canStagger = opts.some(o => o.stagger);
    const waitForStagger = o => o.cashIn && canStagger && !o.stagger && !(alive.find(e => e.uid === o.target)?.statuses.vulnerable > 0);
    const mainSwing = moderate && !swung ? by(opts.filter(o => o.dmg > 0 && o.cost >= 2 && o.cost < S.energy && (o.stagger || o.dmg >= 10) && !waitForStagger(o)), o => o.dmg + (o.stagger ? 6 : 0)) : null;
    if (!pick && mainSwing && need >= 6) pick = mainSwing;
    if (!pick && blockers.length && !racing && blockSpent < blockBudget && (need >= Math.max(6, P.hp * 0.08) || (fortified && need > 0))) pick = by(blockers, o => Math.min(cover(o), need) / per(o) + o.dmg * 0.3);
    // 3. powers early (the ones this deck can use), draw / energy
    if (!pick && S.turn <= 3) pick = opts.find(o => o.view.type === 'power' && powerFits(c, o.view) && (!enraged || need < 10)) || null;
    if (!pick && longFight(c)) pick = opts.find(o => o.disarm && o.target === focus?.uid && (focus.statuses.strength || 0) >= 0) || null;
    if (!pick) pick = opts.find(o => o.draw && o.cost === 0 && !o.selfHarm && (!enraged || o.view.type === 'attack')) || null;
    if (!pick && P.hp > P.maxHp * 0.45 && !enraged) pick = opts.find(o => o.selfHarm && o.energy > 0 && handCost(c, o.uid) > S.energy) || null;
    if (!pick) pick = opts.find(o => o.slowMo && handCost(c, o.uid) - (S.energy - o.cost) >= 2) || null;
    if (!pick && S.turn > 3) pick = opts.find(o => o.view.type === 'power' && powerFits(c, o.view) && need < 8 && !enraged) || null;
    // 3b. Bulwark: with Tackle in hand (or the Block kept by Fortify), Block first, then Dig In, then Tackle
    const tackle = opts.find(o => o.view.effects.some(e => e.op === 'damage' && e.nFrom === 'block'));
    if (!pick && tackle && !enraged) {
      const room = S.energy - tackle.cost;
      const b = opts.filter(o => o.block > 0 && o.uid !== tackle.uid && o.cost <= room && !isDig(o));
      const best = b.length ? by(b, o => o.block / per(o)) : null;
      const dig = opts.find(o => isDig(o) && o.cost <= room && P.block >= 8);
      if (best && P.block + best.block >= 10) pick = best;
      else if (dig) pick = dig;
    }
    // 4. Staggered on the focus before hitting it
    if (!pick && focus && !(focus.statuses.vulnerable > 0)) {
      const st = opts.filter(o => o.stagger && (o.target === focus.uid || !o.view.target || o.view.target === 'none'));
      if (st.length) pick = by(st, o => o.dmg / per(o));
    }
    // 5. damage on the focus (or AoE); skip chip attacks into Spiked
    if (!pick) {
      const atk = opts.filter(o => o.dmg > 0 && (o.target === focus?.uid || !o.target) && (!thorns || o.dmg >= 8));
      if (atk.length) pick = by(atk, o => o.dmg / per(o) + (o.weak ? 2 : 0));
    }
    if (!pick) {
      const atk = opts.filter(o => o.dmg > 0 && (!thorns || o.dmg >= 8));
      if (atk.length) pick = by(atk, o => o.dmg / per(o));
    }
    // 6. heals when hurt, leftover energy into Block (all of it when Fortify keeps it)
    if (!pick) pick = opts.find(o => o.heal && P.maxHp - P.hp >= o.heal && (P.hp < P.maxHp * 0.5 || need === 0 || racing)) || null;
    const realBlock = blockers.filter(o => !isDig(o) || (o.block >= 8 && (need > P.block || fortified)));
    if (!pick && realBlock.length && (need > 0 || fortified)) pick = by(realBlock, o => cover(o) / per(o));
    if (!pick) pick = opts.find(o => o.draw && !o.selfHarm && !enraged) || null;
    if (!pick) return;
    if ((pick.block > 0 || pick.mitig > 0) && pick.dmg === 0) blockSpent += pick.cost;
    if (pick.dmg > 0) swung = true;
    if (!c.playCard(pick.uid, pick.target).ok) return;
  }
}

function usePotionsSensibly(c, info) {
  const S = c.state, P = S.party;
  const incoming = c.alive().reduce((t, e) => t + (c.intentOf(e.uid)?.total || 0), 0);
  const danger = P.hp - Math.max(0, incoming - P.block) < P.maxHp * 0.3;
  const big = S.elite || S.boss;
  S.potions.forEach((id, slot) => {
    if (!id || c.over) return;
    const def = POTIONS[id];
    if (!def.usable) return;
    let use = false;
    if (id === 'medkit') use = P.hp < P.maxHp * (big ? 0.5 : 0.35);
    else if (id === 'body_armor') use = (big || danger) && incoming - P.block >= 10;
    else if (id === 'pipe_bomb') use = big ? S.turn <= 2 : (danger || c.alive().some(e => e.hp <= 10 && e.block === 0) && c.alive().length > 1);
    else use = (big && S.turn <= 2) || danger;
    if (use) c.usePotion(slot);
  });
}

// ================================================================ combat: greedy (engine test bot) and random

function greedyTurn(c) {
  for (let guard = 0; guard < 30 && !c.over && c.state.phase === 'player'; guard++) {
    settleChoice(c);
    const alive = c.alive();
    const incoming = alive.reduce((t, e) => t + (c.intentOf(e.uid)?.total || 0), 0);
    const options = [];
    for (const card of c.state.hand) {
      const view = cardView(card);
      const targets = view.target === 'enemy' ? alive : [null];
      for (const t of targets) {
        if (!c.canPlay(card.uid, t?.uid).ok) continue;
        const p = c.previewCard(card.uid, t?.uid);
        const cost = Math.max(0.5, c.costOf(card) || 0);
        let score = 0;
        if (t && p.total >= t.hp + t.block) score += 100 + t.hp;
        score += p.total / cost;
        if (incoming > c.state.party.block) score += Math.min(p.block, incoming - c.state.party.block) * 1.2 / cost;
        if (view.type === 'power') score += 12;
        if (t && view.effects.some(e => e.op === 'apply' && e.status === 'vulnerable') && !(t.statuses.vulnerable > 0)) score += 8;
        if (view.effects.some(e => e.op === 'draw' || e.op === 'energy')) score += 3;
        if (view.type === 'status' || view.type === 'curse') score -= 5;
        options.push({ uid: card.uid, target: t?.uid, score });
      }
    }
    options.sort((a, b) => b.score - a.score);
    if (!options.length || options[0].score <= 0) break;
    if (!c.playCard(options[0].uid, options[0].target).ok) break;
    settleChoice(c);
  }
  const P = c.state.party;
  if (!c.over && P.hp < P.maxHp * 0.3) c.state.potions.forEach((id, slot) => { if (id && POTIONS[id].usable && !c.over) c.usePotion(slot); });
}

function randomTurn(c, info) {
  const rng = info.rng;
  for (let guard = 0; guard < 20 && !c.over && c.state.phase === 'player'; guard++) {
    const opts = playOptions(c);
    if (!opts.length || rng.next() < 0.12) break;
    const o = rng.pick(opts);
    c.playCard(o.uid, o.target);
    if (c.state.choice) { // a random pick between min and n
      const ch = c.state.choice;
      const n = ch.min + rng.int(ch.n - ch.min + 1);
      c.choose(rng.shuffle(ch.uids.slice()).slice(0, n));
    }
  }
  if (!c.over && rng.next() < 0.1) {
    const slot = c.state.potions.findIndex(id => id && POTIONS[id].usable);
    if (slot >= 0) c.usePotion(slot);
  }
}

// ================================================================ run decisions

function neowSensible(run) {
  const rank = { remove_card: 5, common_relic: 4.6, upgrade_card: 4.4, rare_card: 4, pick_yola: 3.6, pick_marc: 3.6, max_hp: 3.4, supplies: 2.5 };
  const opts = run.pending.options;
  let best = 0;
  opts.forEach((o, i) => { if ((rank[o.id] || 0) > (rank[opts[best].id] || 0)) best = i; });
  return best;
}

function pickSensible(run, picker) {
  const cards = picker.cards;
  if (picker.mode === 'remove') return worstCard(cards)?.uid ?? null;
  if (picker.mode === 'upgrade') {
    let best = null, bg = -1;
    for (const c of cards) { const g = upgradeGain(c); if (g > bg) { bg = g; best = c; } }
    return best?.uid ?? null;
  }
  if (picker.mode === 'transform') return worstCard(cards)?.uid ?? null;
  // pick: best rated, or none when cancelable and nothing clears the bar
  const scored = cards.map(c => ({ c, s: rateCard(run, c.id) })).sort((a, b) => b.s - a.s);
  if (!scored.length) return null;
  if (picker.cancelable !== false && scored[0].s < takeBar(run)) return null;
  return scored[0].c.uid;
}

/** Best route value from each node to the top (dynamic programming over the map). */
function routeValues(run) {
  const map = run.map;
  const pct = hpPct(run);
  const val = n => {
    switch (n.type) {
      case 'fight': return 1.0 - (pct < 0.4 ? 0.8 : 0);
      case 'elite': return n.row < 6 ? -5 : pct > 0.75 ? 2.6 : pct > 0.55 ? 1.0 : -3.5;
      case 'rest': return pct < 0.5 ? 3.2 : pct < 0.75 ? 2 : 1.3;
      case 'shop': return run.gold >= 170 ? 2.6 : run.gold >= 100 ? 1.4 : 0.3;
      case 'event': return 1.5;
      case 'treasure': return 2.2;
      default: return 0;
    }
  };
  const best = {};
  const ids = Object.keys(map.nodes).sort((a, b) => map.nodes[b].row - map.nodes[a].row);
  for (const id of ids) {
    const n = map.nodes[id];
    const nexts = n.next.map(x => best[x] ?? 0);
    best[id] = val(n) + (nexts.length ? Math.max(...nexts) : 0);
  }
  return best;
}

function pathSensible(run, nodes) {
  const best = routeValues(run);
  return nodes.slice().sort((a, b) => best[b] - best[a])[0];
}

function rewardsSensible(run) {
  const p = run.pending;
  p.rewards.forEach((r, i) => {
    if (r.taken) return;
    if (r.kind === 'gold' || r.kind === 'relic') R.takeReward(run, i);
    else if (r.kind === 'potion') {
      if (R.freeSlot(run) < 0) {
        const worst = run.potions.map((id, s) => [s, POTION_SCORE[id] ?? 4]).sort((a, b) => a[1] - b[1])[0];
        if (worst && worst[1] < (POTION_SCORE[r.id] ?? 4)) R.discardPotion(run, worst[0]);
      }
      R.takeReward(run, i);
    } else if (r.kind === 'cards') {
      const uid = pickSensible(run, { mode: 'pick', cards: r.cards, cancelable: true });
      if (uid) R.pickRewardCard(run, i, r.cards.findIndex(c => c.uid === uid));
      else R.skipRewardCards(run, i);
    }
  });
  R.leaveRewards(run);
}

function restSensible(run) {
  const beforeBoss = run.floor >= 15;
  const up = bestUpgrade(run);
  if (hpPct(run) < (beforeBoss ? 0.7 : 0.5) || !up) R.restHeal(run);
  else R.restUpgrade(run, up.uid);
  R.leaveRest(run);
}

function shopSensible(run) {
  const s = run.shop;
  // 1. removal of a starter card or a curse
  const target = worstCard(run.deck.filter(isRemovable));
  if (target && !s.removal.used && run.gold >= s.removal.price && (target.id === 'infection' || run.deck.length > 10)) R.shopRemove(run, target.uid);
  // 2. the best things per supply, while they clear the bar
  for (let guard = 0; guard < 8; guard++) {
    const opts = [];
    s.relics.forEach((it, i) => { if (!it.sold && it.price <= run.gold) opts.push({ kind: 'relic', i, value: (RELIC_SCORE[it.id] ?? 5) + 3, price: it.price }); });
    s.cards.forEach((it, i) => {
      if (it.sold || it.price > run.gold) return;
      const v = rateCard(run, it.card.id);
      if (v >= takeBar(run) + 0.8) opts.push({ kind: 'card', i, value: v, price: it.price });
    });
    s.potions.forEach((it, i) => { if (!it.sold && it.price <= run.gold - 20 && R.freeSlot(run) >= 0) opts.push({ kind: 'potion', i, value: (POTION_SCORE[it.id] ?? 4) - 1, price: it.price }); });
    if (!opts.length) break;
    opts.sort((a, b) => b.value * 100 / (b.price + 40) - a.value * 100 / (a.price + 40));
    const o = opts[0];
    if (o.kind === 'relic') R.buyRelic(run, o.i); else if (o.kind === 'card') R.buyCard(run, o.i); else R.buyPotion(run, o.i);
  }
  R.leaveShop(run);
}

function eventSensible(run) {
  const p = run.pending;
  const pct = hpPct(run);
  const label = l => p.choices.findIndex(c => c.label === l && !c.disabled);
  const leave = () => { const i = p.choices.findIndex(c => /Leave|Walk away/.test(c.label)); return i >= 0 ? i : 0; };
  switch (p.id) {
    case 'vending': return (pct > 0.5 && (p.vars.tries || 0) < 3) ? label('Smash it') : leave();
    case 'break_room': return pct < 0.65 ? label('Coffee') : label('Donuts');
    case 'wounded_doctor': {
      if (run.gold >= 50 && (run.deck.some(c => c.id === 'infection') || run.deck.length > 12) && label('Cut it out') >= 0) return label('Cut it out');
      if (pct < 0.6 && label('Treatment') >= 0) return label('Treatment');
      return leave();
    }
    case 'supply_cart': return pct > 0.7 && (p.vars.found || 0) < 2 ? label('Search') : leave();
    case 'xray': { const i = label('Step in'); return i >= 0 && pct > 0.55 ? i : leave(); }
    case 'blood_bank': return pct > 0.6 ? label('Donate') : pct < 0.35 ? label('Steal plasma') : leave();
    case 'pharmacy_cabinet': return pct > 0.5 && run.potions.filter(x => !x).length >= 2 ? label('Pry it open') : label('Pick the lock');
    case 'intercom': return run.deck.some(isRemovable) ? label('Forget') : label('Practise') >= 0 ? label('Practise') : label('Change');
    case 'survivor_note': return label('Read it');
    case 'gurney': return pct > 0.5 ? label('Look under it') : leave();
    default: return Math.max(0, p.choices.findIndex(c => !c.disabled));
  }
}

function mapPotionsSensible(run) {
  run.potions.forEach((id, slot) => { if (id && R.usableOnMap(id) && hpPct(run) < 0.4) R.usePotionOnMap(run, slot); });
}

// ---- greedy run decisions: highest rated, no planning

function pathGreedy(run, nodes) {
  const pref = hpPct(run) < 0.5 ? ['rest', 'event', 'treasure', 'shop', 'fight', 'elite'] : ['treasure', 'elite', 'event', 'fight', 'rest', 'shop'];
  return nodes.slice().sort((a, b) => pref.indexOf(run.map.nodes[a].type) - pref.indexOf(run.map.nodes[b].type))[0];
}

function rewardsGreedy(run) {
  run.pending.rewards.forEach((r, i) => {
    if (r.taken) return;
    if (r.kind === 'cards') {
      const best = r.cards.map((c, k) => [k, CARD_SCORE[c.id] ?? 4]).sort((a, b) => b[1] - a[1])[0];
      R.pickRewardCard(run, i, best[0]);
    } else R.takeReward(run, i);
  });
  R.leaveRewards(run);
}

function restGreedy(run) {
  const up = bestUpgrade(run);
  if (hpPct(run) < 0.5 || !up) R.restHeal(run); else R.restUpgrade(run, up.uid);
  R.leaveRest(run);
}

function shopGreedy(run) {
  for (let guard = 0; guard < 8; guard++) {
    const s = run.shop;
    const all = [...s.relics.map((it, i) => ['relic', i, it]), ...s.cards.map((it, i) => ['card', i, it])].filter(([, , it]) => !it.sold && it.price <= run.gold);
    if (!all.length) break;
    all.sort((a, b) => b[2].price - a[2].price);
    const [kind, i] = all[0];
    if (kind === 'relic') R.buyRelic(run, i); else R.buyCard(run, i);
  }
  R.leaveShop(run);
}

function eventGreedy(run) {
  const i = run.pending.choices.findIndex(c => !c.disabled && !/Leave|Walk away/.test(c.label));
  return i >= 0 ? i : 0;
}

// ---- random

function randIndex(rng, list, ok = () => true) {
  const idx = list.map((x, i) => i).filter(i => ok(list[i]));
  return idx.length ? rng.pick(idx) : 0;
}

// ================================================================ the bots

export const BOTS = {
  random: {
    name: 'random',
    neow: (run, ctx) => ctx.rng.int(run.pending.options.length),
    pick: (run, picker, ctx) => (picker.cards.length ? ctx.rng.pick(picker.cards).uid : null),
    path: (run, nodes, ctx) => ctx.rng.pick(nodes),
    turn: (c, info) => randomTurn(c, info),
    rewards(run, ctx) {
      run.pending.rewards.forEach((r, i) => {
        if (r.taken) return;
        if (r.kind === 'cards') { const k = ctx.rng.int(r.cards.length + 1); if (k < r.cards.length) R.pickRewardCard(run, i, k); else R.skipRewardCards(run, i); }
        else R.takeReward(run, i);
      });
      R.leaveRewards(run);
    },
    rest(run, ctx) {
      const ups = run.deck.filter(R.canUpgrade);
      if (ctx.rng.next() < 0.5 || !ups.length) R.restHeal(run); else R.restUpgrade(run, ctx.rng.pick(ups).uid);
      R.leaveRest(run);
    },
    shop(run, ctx) {
      const s = run.shop;
      if (ctx.rng.next() < 0.5) { const i = ctx.rng.int(s.cards.length); R.buyCard(run, i); }
      if (ctx.rng.next() < 0.3) { const i = ctx.rng.int(s.relics.length); R.buyRelic(run, i); }
      R.leaveShop(run);
    },
    event: (run, ctx) => randIndex(ctx.rng, run.pending.choices, c => !c.disabled),
    mapPotions() {},
  },
  greedy: {
    name: 'greedy',
    neow: () => 0,
    pick: (run, picker) => (picker.mode === 'pick' ? picker.cards.slice().sort((a, b) => (CARD_SCORE[b.id] ?? 4) - (CARD_SCORE[a.id] ?? 4))[0]?.uid : pickSensible(run, picker)) ?? null,
    path: pathGreedy,
    turn: c => greedyTurn(c),
    rewards: rewardsGreedy,
    rest: restGreedy,
    shop: shopGreedy,
    event: eventGreedy,
    mapPotions() {},
  },
  sensible: {
    name: 'sensible',
    neow: neowSensible,
    pick: pickSensible,
    path: pathSensible,
    turn: (c, info) => sensibleTurn(c, info),
    rewards: rewardsSensible,
    rest: restSensible,
    shop: shopSensible,
    event: eventSensible,
    mapPotions: mapPotionsSensible,
  },
  expert: {
    name: 'expert',
    neow: neowSensible,
    pick: pickSensible,
    path: pathSensible,
    turn: (c, info) => expertTurn(c, info),
    rewards: rewardsSensible,
    rest: restSensible,
    shop: shopSensible,
    event: eventSensible,
    mapPotions: mapPotionsSensible,
  },
};

export { hpPct, isUpgradable, RELICS };
