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

import * as R from '../../src/game/run.js';
import { CARDS, cardView, isUpgradable } from '../../src/game/content/cards.js';
import { RELICS } from '../../src/game/content/relics.js';
import { POTIONS } from '../../src/game/content/potions.js';
import { restoreStreams, streamsState } from '../../src/game/rng.js';

// ================================================================ ratings (a human-ish tier list, 0..10)

export const CARD_SCORE = {
  // starter + weapon swaps (only used for removal / upgrade order)
  bat_swing: 1, pistol_shot: 1, brace: 1.5, sidestep: 1.5, home_run: 5, clean_shot: 4,
  nail_swing: 2.5, barbed_swing: 3, pry_loose: 6, chop_block: 4, sledge: 6, buckshot: 3.5, both_barrels: 5,
  // Marc
  crowbar_pry: 5.5, shoulder_check: 5, wild_swing: 5.5, heavy_swing: 4, one_two: 5, hold_the_line: 6.5, deep_breath: 3,
  kick_the_door: 5, haymaker: 5, tackle: 3, batter_up: 6, overhead_smash: 6.5, ground_pound: 6, momentum: 4.5, dig_in: 2.5,
  thick_skin: 6, pumped_up: 7, swing_guard: 4, jaw_breaker: 6.5, wrench_arm: 6, grit_teeth: 4,
  berserker: 7, grand_slam: 6.5, bolt_the_door: 7, fortify: 3, make_it_count: 6, rally: 3,
  // Yola
  double_tap: 5, aimed_shot: 5.5, kneecap: 5, suppressing_fire: 5, cover_him: 5.5, tuck_and_roll: 6, check_mag: 3.5, flare: 4.5,
  quick_shot: 4, cheap_shot: 4.5, headshot: 7, triage: 4, adrenaline_shot: 6, marksman: 6.5, spray_and_pray: 5, painkillers: 6.5,
  light_on_feet: 4.5, triple_tap: 6, covering_fire: 6, clean_kill: 6, overdrive: 7.5, slow_motion: 5, dead_eye: 5,
  defibrillator: 5.5, point_blank: 7.5,
  // status / curse
  panic: -5, bile: -3, infection: -6,
};
const STAGGER_SOURCES = new Set(['home_run', 'pry_loose', 'sledge', 'crowbar_pry', 'overhead_smash', 'ground_pound', 'jaw_breaker']);
const CASH_INS = new Set(['clean_shot', 'cheap_shot', 'headshot', 'triple_tap', 'point_blank', 'aimed_shot', 'kick_the_door',
  'batter_up', 'dead_eye', 'marksman', 'both_barrels', 'cover_him']);
const REMOVE_ORDER = ['infection', 'bile', 'panic', 'bat_swing', 'pistol_shot', 'nail_swing', 'brace', 'sidestep', 'buckshot'];

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

/** How much a card would add to this deck right now (tier list + Staggered synergy + defence need + copies). */
export function rateCard(run, id) {
  let s = CARD_SCORE[id] ?? 4;
  const deck = run.deck;
  const stag = countIds(deck, STAGGER_SOURCES) + (run.relics.some(r => r.id === 'pager') ? 1 : 0) + (run.weapons?.marc === 'crowbar' ? 1 : 0);
  const cash = countIds(deck, CASH_INS);
  if (CASH_INS.has(id)) s += Math.min(1.5, 0.35 * (stag - 1));
  if (STAGGER_SOURCES.has(id)) s += Math.min(1.5, 0.3 * cash);
  const def = CARDS[id];
  const blocks = deck.filter(c => cardView(c).effects.some(e => e.op === 'block')).length;
  if (def.effects.some(e => e.op === 'block') && blocks < deck.length * 0.3) s += 0.8;
  if (def.effects.some(e => e.op === 'damage' && e.to === 'all')) s += 0.4;
  s -= 0.8 * deck.filter(c => c.id === id).length;
  if (def.type === 'power') s -= 0.3 * deck.filter(c => CARDS[c.id].type === 'power').length;
  return s;
}

/** The bar a card must clear to be worth adding (bigger decks are pickier). */
export const takeBar = run => (run.deck.length <= 14 ? 4.2 : run.deck.length <= 20 ? 5.2 : 6.2);

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
  let D = info.dpt + strPerm * 2.5 + (st.berserker || 0) * 4 + (st.marksman || 0) * 1 + (st.dead_eye ? 2 : 0);
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
  usePotionsSensibly(c, info);
  for (let guard = 0; guard < 12 && !c.over && c.state.phase === 'player'; guard++) {
    const seq = planTurn(c, info);
    if (!seq.length) return;
    for (const o of seq) {
      if (c.over || !c.playCard(o.uid, o.target).ok) break;
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
  const S = c.state;
  const out = [];
  for (const card of S.hand) {
    const cost = c.costOf(card);
    if (cost === null || cost > S.energy) continue;
    const view = cardView(card);
    if (view.keywords.includes('unplayable')) continue;
    const targets = view.target === 'enemy' ? alive : [null];
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
      const eff = view.effects.flatMap(e => (e.op === 'if' ? e.then : [e]));
      out.push({ uid: card.uid, target: t?.uid, card, view, cost, dmg, kills, block: p.block,
        stagger: eff.some(e => e.op === 'apply' && e.status === 'vulnerable'),
        weak: eff.some(e => e.op === 'apply' && e.status === 'weak'),
        draw: eff.some(e => e.op === 'draw' || e.op === 'energy'),
        selfHarm: eff.some(e => e.op === 'loseHp'), heal: eff.some(e => e.op === 'heal') });
    }
  }
  return out;
}

/**
 * Rules, in order, one card at a time: kill what you can; block when the coming hit is big (less when the Big Walker
 * punishes Skills); play powers early; draw and energy; put Staggered on the focus zombie before attacking it;
 * then the best damage per energy on the focus (Yola's cash-ins shine here); spare energy goes into Block.
 */
function sensibleTurn(c, info) {
  usePotionsSensibly(c, info);
  let blockSpent = 0, swung = false;
  for (let guard = 0; guard < 25 && !c.over && c.state.phase === 'player'; guard++) {
    const S = c.state, P = S.party;
    const alive = c.alive();
    const incoming = alive.reduce((t, e) => t + (c.intentOf(e.uid)?.total || 0), 0);
    const need = Math.max(0, incoming - P.block);
    const enraged = alive.some(e => (e.statuses.enrage || 0) > 0);
    const thorns = alive.reduce((t, e) => t + (e.statuses.thorns || 0), 0);
    const focus = focusTarget(c, alive);
    const opts = ruleOptions(c, alive).filter(o => o.view.type !== 'status' && o.view.type !== 'curse');
    if (!opts.length) return;
    const per = o => o.cost || 0.5;
    const by = (list, f) => list.slice().sort((a, b) => f(b) - f(a))[0];
    let pick = null;
    // 1. a kill (cheapest first)
    const killers = opts.filter(o => o.kills > 0);
    if (killers.length) pick = killers.sort((a, b) => a.cost - b.cost || b.kills - a.kills)[0];
    // 2. block a big hit (with the Big Walker's Rage up, only to stay alive: every Skill makes it stronger)
    const blockers = opts.filter(o => o.block > 0 && (!enraged || o.view.type !== 'skill' || need >= P.hp - 8));
    const enemyHp = alive.reduce((t, e) => t + e.hp + e.block, 0);
    const racing = enemyHp <= S.energy * info.dpt / 3 * 1.2; // we can probably finish it this turn
    // block some, hit some: unless the hit is a big share of HP, the main swing goes first if it leaves energy to block
    const moderate = need < P.hp * 0.3;
    const blockBudget = moderate ? Math.ceil(S.maxEnergy / 2) : Infinity;
    const mainSwing = moderate && !swung ? by(opts.filter(o => o.dmg > 0 && o.cost >= 2 && o.cost < S.energy && (o.stagger || o.dmg >= 10)), o => o.dmg + (o.stagger ? 6 : 0)) : null;
    if (!pick && mainSwing && need >= 6) pick = mainSwing;
    if (!pick && blockers.length && !racing && blockSpent < blockBudget && need >= Math.max(6, P.hp * 0.08)) pick = by(blockers, o => Math.min(o.block, need) / per(o) + o.dmg * 0.3);
    // 3. powers early, draw / energy
    if (!pick && S.turn <= 3) pick = opts.find(o => o.view.type === 'power' && (!enraged || need < 10)) || null;
    if (!pick) pick = opts.find(o => o.draw && o.cost === 0 && !o.selfHarm && (!enraged || o.view.type === 'attack')) || null;
    if (!pick && S.turn > 3) pick = opts.find(o => o.view.type === 'power' && need < 8 && !enraged) || null;
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
    // 6. heals when hurt, leftover energy into Block
    if (!pick) pick = opts.find(o => o.heal && P.hp < P.maxHp * 0.6) || null;
    if (!pick && blockers.length && need > 0) pick = by(blockers, o => o.block / per(o));
    if (!pick) pick = opts.find(o => o.draw && !o.selfHarm && !enraged) || null;
    if (!pick) return;
    if (pick.block > 0 && pick.dmg === 0) blockSpent += pick.cost;
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
