// The combat engine: one fight, as state plus an ordered event log. Pure logic (no DOM, no three).
// Slay the Spire's rules (BUILD_SPEC section 3, with docs/STS_NUMBERS_CHECK.md corrections): 3 energy, draw 5,
// hand of 10, shared party HP and Block, zombies act left to right, Bleed at the start of its owner's turn.
// Staggered/Weakened/Shaken tick at the end of the round (after the zombies' turn) on both sides; one a zombie
// put on the party during its turn skips that round's tick, so Staggered 2 from a zombie boosts two zombie turns.
//
//   const c = createCombat({ run, encounter: 'shambler_solo', rng, opts })
//   c.start(); c.playCard(uid, targetUid); c.endTurn(); c.takeEvents() ...
//
// The engine resolves everything immediately and queues events (see the event contract in BUILD_SPEC);
// the director replays them with timing. It never mutates `run`: when c.state.phase is 'won' or 'lost',
// c.result() says what the run layer should apply (hp, maxHp, potions, relic counters...).
// rng: the run's named streams (rng.js makeStreams), a single makeRng, a saved streams state, or a seed string.
// It uses the shuffle (draw pile), ai (zombie moves) and misc (zombie HP, random targets) streams.
//
// Public: start(), canPlay(uid, target?), playCard(uid, target?), choose(uids), needsTarget(uid), costOf(uid), hasPlayable(),
//   usePotion(slot, target?), discardPotion(slot), endTurn(), previewCard(uid|inst, target?), intentOf(uid),
//   takeEvents(), result(), forceWin(), forceLose(); getters over, won, party, turn, choosing.
//
// ---- Mid-fight card choices ("Discard a card", "Exhaust a card", "Retain up to 2 cards"...)
// A card whose effects include { op: 'choose', kind, n, optional?, from: 'hand', prompt? } stops there and asks:
//   c.state.choice = { kind: 'discard'|'exhaust'|'upgrade'|'retain', n, min, optional, from: 'hand',
//                      uids: [the hand cards you may pick], prompt: 'Discard a card.', source: { uid, id, name } | null }
//   event { t: 'choice', ...the same fields }   (the UI opens its picker on this event, or whenever state.choice is set)
//   c.choose(uids) -> { ok: true } | { ok: false, reason: 'no_choice'|'card'|'count' }
//     uids: an array (or one uid) from choice.uids, between min and n of them (min = n, or 0 when optional).
//     It applies the choice, emits { t: 'choice_made', kind, uids }, then the card finishes resolving (its remaining
//     effects, then it goes to the discard / exhaust pile as usual) and the normal events follow.
//   While a choice is open: canPlay / playCard / usePotion / endTurn answer { ok: false, reason: 'choice' },
//   hasPlayable() is false and c.choosing is true. state.phase stays 'player'.
//   The card being played sits in state.limbo (not in any pile) until the choice is made.
//   No choice opens when nobody can be picked; when the pick is forced (not optional and the hand has n cards or
//   fewer that fit), it resolves at once without asking (Slay the Spire does the same).
//   Kinds: discard (hand -> discard pile), exhaust (hand -> exhaust pile), upgrade (upgraded for this fight; event
//   { t: 'card_upgraded', uid, id }), retain (stays in hand at the end of this turn).
// c.state (read-only for callers):
//   { turn, phase: 'player'|'enemy'|'won'|'lost', energy, maxEnergy, energyNext (gained on the zombies' turn, for the next turn),
//     hand/draw/discard/exhaust/powers: [{ uid, id, up, cost (printed), costTurn (this turn's override), bonus }]
//       (show a hand card's cost as c.costOf(uid); draw[0] is the top),
//     party: { hp, maxHp, block, statuses },
//     enemies: [{ uid, id, name, hp, maxHp, block, statuses, alive, slot, model, scale, size, tier, pose,
//                 intent: { move, name, type, base, hits, damage (live per hit) }, history, vars }],
//     counters: { attacksThisTurn, skillsThisTurn, cardsThisTurn, cardsPlayed, kills, finishers, damageDealt, damageTaken, bestHit, ... },
//     relics: [{ id, counter, weapon? }] (weapons first), potions: [id|null x3] (this fight's copy),
//     encounter, name, kind, elite, boss, room, music }

import { CARDS, cardView } from './content/cards.js';
import { STATUSES, TURN_STATUSES, isDebuff } from './content/statuses.js';
import { ENEMIES, moveDamage, scaleHit } from './content/enemies.js';
import { infectionRules } from './infection.js';
import { ENCOUNTERS } from './content/encounters.js';
import { RELICS, weaponRelics } from './content/relics.js';
import { POTIONS } from './content/potions.js';
import { toStreams } from './rng.js';
import { runEffects, value } from './effects.js';

export const HAND_LIMIT = 10;
export const DRAW_PER_TURN = 5;
export const BASE_ENERGY = 3;

export function createCombat({ run, encounter, rng, opts = {} }) {
  return new Combat({ run, encounter, rng, opts });
}

function resolveEncounter(encounter) {
  if (typeof encounter === 'string') {
    const e = ENCOUNTERS[encounter];
    if (!e) throw new Error(`Unknown encounter: ${encounter}`);
    return e;
  }
  if (encounter && Array.isArray(encounter.enemies)) {
    return { id: encounter.id || 'custom', name: encounter.name || 'Zombies', kind: encounter.kind || 'hard', room: encounter.room || 'corridor',
      music: encounter.music || 'fight', elite: !!encounter.elite, boss: !!encounter.boss, ...encounter };
  }
  throw new Error('createCombat needs an encounter id or { enemies: [...] }');
}

const clone = o => JSON.parse(JSON.stringify(o));
const CHOICE_PROMPTS = {
  discard: n => (n === 1 ? 'Discard a card.' : `Discard ${n} cards.`),
  exhaust: n => (n === 1 ? 'Exhaust a card.' : `Exhaust ${n} cards.`),
  upgrade: n => (n === 1 ? 'Upgrade a card for this fight.' : `Upgrade ${n} cards for this fight.`),
  retain: n => (n === 1 ? 'Retain a card this turn.' : `Retain up to ${n} cards this turn.`),
};

export class Combat {
  constructor({ run, encounter, rng, opts = {} }) {
    this.run = run;
    this.opts = opts;
    this.enc = resolveEncounter(encounter);
    this.streams = toStreams(rng, run?.seed || 'sarno');
    this.rng = this.streams.misc;
    this.events = [];
    this.log = opts.keepLog ? [] : null;
    this.started = false;
    this.tempSeq = 0;
    this.killOrder = [];
    this.lastIntentShown = new Map();
    this.rules = infectionRules(run?.infection || 0);

    // relics: the equipped weapons first, then run.relics (weapon relics already in run.relics are not doubled)
    const rel = [];
    for (const w of weaponRelics(run.weapons || {})) rel.push({ id: w, counter: 0, data: {}, weapon: true });
    for (const r of run.relics || []) {
      const id = typeof r === 'string' ? r : r.id;
      if (!RELICS[id]) continue;
      const existing = rel.find(x => x.id === id);
      if (existing) { existing.counter = r.counter ?? existing.counter; existing.inRun = true; continue; }
      rel.push({ id, counter: (typeof r === 'object' && r.counter) || 0, data: {}, inRun: true });
    }

    this.state = {
      turn: 0,
      phase: 'setup',
      energy: 0,
      maxEnergy: BASE_ENERGY,
      energyNext: 0, // energy gained during the zombies' turn, added at the next refill
      hand: [], draw: [], discard: [], exhaust: [], powers: [],
      choice: null, limbo: null, infection: this.rules.level,
      party: { hp: run.hp ?? 80, maxHp: run.maxHp ?? 80, block: 0, statuses: {}, flags: {} },
      enemies: [],
      counters: {
        attacksThisTurn: 0, skillsThisTurn: 0, powersThisTurn: 0, cardsThisTurn: 0, deadEyeThisTurn: 0,
        cardsPlayed: 0, attacksPlayed: 0, kills: 0, finishers: 0, damageDealt: 0, damageTaken: 0, bestHit: 0, potionsUsed: 0,
      },
      relics: rel,
      potions: (run.potions || [null, null, null]).slice(),
      encounter: this.enc.id, name: this.enc.name, kind: this.enc.kind, elite: !!this.enc.elite, boss: !!this.enc.boss,
      room: this.enc.room, music: this.enc.music,
      startHp: run.hp ?? 80, startMaxHp: run.maxHp ?? 80, endHp: null, killedBy: null,
    };
  }

  // ================================================================ public API

  get party() { return this.state.party; }
  get turn() { return this.state.turn; }
  get over() { return this.state.phase === 'won' || this.state.phase === 'lost'; }
  get won() { return this.state.phase === 'won'; }
  get choosing() { return !!this.state.choice; }

  start() {
    if (this.started) return this;
    this.started = true;
    const S = this.state;

    // draw pile: the run deck, shuffled, Innate cards on top
    const deck = (this.run.deck || []).map(c => this.makeCombatCard(c));
    this.streams.shuffle.shuffle(deck);
    const innateIds = new Set(this.relicsWith('innate').flatMap(r => RELICS[r.id].innate));
    const isInnate = c => cardView(c).keywords.includes('innate') || innateIds.has(c.id);
    S.draw = [...deck.filter(isInnate), ...deck.filter(c => !isInnate(c))];
    this.innateCount = deck.filter(isInnate).length;

    // zombies
    this.enc.enemies.forEach((id, i) => S.enemies.push(this.spawnEnemy(id, i)));
    this.emit({ t: 'combat_start', encounter: this.enc.id, name: this.enc.name, kind: this.enc.kind,
      elite: S.elite, boss: S.boss, room: S.room, music: S.music, enemies: S.enemies.map(e => this.snapshot(e)) });
    S.phase = 'player'; // lets combat-start relics act

    this.hook('onCombatStart');
    if (!this.isLost()) for (const e of S.enemies) if (e.alive) this.rollIntent(e);
    this.finishIfWon();
    if (!this.over) this.startPlayerTurn();
    return this;
  }

  /** { ok, reason: 'energy'|'unplayable'|'target'|'phase'|'missing'|'choice' } */
  canPlay(uid, targetUid) {
    const S = this.state;
    if (S.phase !== 'player') return { ok: false, reason: 'phase' };
    if (S.choice) return { ok: false, reason: 'choice' };
    const card = S.hand.find(c => c.uid === uid);
    if (!card) return { ok: false, reason: 'missing' };
    const view = cardView(card);
    const cost = this.costOf(card);
    if (cost === null || view.keywords.includes('unplayable')) return { ok: false, reason: 'unplayable' };
    if (cost > S.energy) return { ok: false, reason: 'energy' };
    if (view.target === 'enemy' && !this.resolveTarget(targetUid)) return { ok: false, reason: 'target' };
    return { ok: true };
  }

  /** True if the card needs a zombie picked. */
  needsTarget(uid) {
    const card = this.findCard(uid);
    return !!card && cardView(card).target === 'enemy';
  }

  /** Current cost of a card in hand (Slow Motion etc. applied); null = Unplayable. */
  costOf(card) {
    if (typeof card === 'string') card = this.findCard(card);
    if (!card) return null;
    if (card.cost === null || card.cost === undefined) return null;
    return card.costTurn ?? card.cost;
  }

  /** Is anything in hand playable right now (for the End Turn glow)? */
  hasPlayable() {
    return this.state.hand.some(c => {
      const r = this.canPlay(c.uid, this.alive()[0]?.uid);
      return r.ok;
    });
  }

  playCard(uid, targetUid) {
    const check = this.canPlay(uid, targetUid);
    if (!check.ok) return check;
    const S = this.state;
    const card = S.hand.find(c => c.uid === uid);
    const view = cardView(card);
    const target = view.target === 'enemy' ? this.resolveTarget(targetUid) : null;
    const cost = this.costOf(card);
    S.energy -= cost;
    S.hand.splice(S.hand.indexOf(card), 1);

    const C = S.counters;
    C.cardsThisTurn++; C.cardsPlayed++;
    if (view.type === 'attack') { C.attacksThisTurn++; C.attacksPlayed++; }
    if (view.type === 'skill') C.skillsThisTurn++;
    if (view.type === 'power') C.powersThisTurn++;

    const exhausts = view.keywords.includes('exhaust');
    const to = view.type === 'power' ? 'power' : exhausts ? 'exhaust' : 'discard';
    const pre = {
      targetStaggered: !!target && (target.statuses.vulnerable || 0) > 0,
      anyStaggered: this.alive().some(e => (e.statuses.vulnerable || 0) > 0),
    };
    this.emit({ t: 'card_played', uid, id: card.id, name: view.name, type: view.type, hero: view.hero || null,
      target: target ? target.uid : null, anim: view.anim, clip: view.clip || null, cost, up: !!card.up, to });
    this.emit({ t: 'energy', energy: S.energy, max: S.maxEnergy });

    this.hook('onCardPlay', { ...view, uid, inst: card }, { target, hero: view.hero || null, uid });

    // the card waits in limbo while it resolves (and while a choice it asks for is open)
    S.limbo = { uid, card, to, targetUid: target ? target.uid : null, pre, killed: false, hitTargets: [], exhaust: false, next: 0 };
    this.resolveLimbo();
    return S.choice ? { ok: true, choice: S.choice } : { ok: true };
  }

  /**
   * Answer the open choice (see the header). uids: an array of hand uids from state.choice.uids (or one uid).
   * -> { ok: true, choice? (a further choice the card asks for) } | { ok: false, reason: 'no_choice'|'card'|'count' }
   */
  choose(uids) {
    const S = this.state;
    const ch = S.choice;
    if (!ch) return { ok: false, reason: 'no_choice' };
    const list = Array.isArray(uids) ? uids.slice() : (uids === null || uids === undefined ? [] : [uids]);
    if (new Set(list).size !== list.length || list.some(u => !ch.uids.includes(u))) return { ok: false, reason: 'card' };
    if (list.length < ch.min || list.length > ch.n) return { ok: false, reason: 'count' };
    const pile = S[ch.from] || S.hand;
    const cards = list.map(u => pile.find(c => c.uid === u)).filter(Boolean);
    S.choice = null;
    this.emit({ t: 'choice_made', kind: ch.kind, uids: list });
    this.resolveChoice(ch.kind, cards, ch.from);
    if (S.limbo) this.resolveLimbo();
    return S.choice ? { ok: true, choice: S.choice } : { ok: true };
  }

  /** Run the card in limbo from where it stopped; it pauses again on a choice that has to ask. */
  resolveLimbo() {
    const S = this.state;
    const L = S.limbo;
    if (!L) return;
    const card = L.card;
    const view = cardView(card);
    const target = L.targetUid ? this.enemyByUid(L.targetUid) : null;
    const scope = { source: 'party', card: view, inst: card, hero: view.hero || null, target, pre: L.pre, killed: L.killed,
      hitTargets: L.hitTargets.map(u => this.enemyByUid(u)).filter(Boolean), uid: L.uid, exhaust: L.exhaust };
    const effects = view.effects;
    for (let i = L.next; i < effects.length; i++) {
      const op = effects[i];
      if (op.op === 'choose') {
        if (this.isLost()) break;
        if (this.beginChoice(op, scope)) {
          Object.assign(L, { next: i + 1, killed: scope.killed, hitTargets: scope.hitTargets.map(e => e.uid), exhaust: !!scope.exhaust });
          return;
        }
        continue;
      }
      runEffects(this, [op], scope);
    }
    S.limbo = null;

    // Momentum-style growth stays on this copy of the card for the rest of the fight
    for (const op of view.effects) if (op.op === 'damage' && op.grow) card.bonus = (card.bonus || 0) + op.grow;

    // the card leaves play (quietly if the card itself lost the fight: nothing is emitted after combat_end)
    card.costTurn = undefined;
    const quiet = this.over;
    const to = L.to;
    if (to === 'power') S.powers.push(card);
    else if (to === 'exhaust' || scope.exhaust) { S.exhaust.push(card); if (!quiet) this.emit({ t: 'exhaust', uid: L.uid }); }
    else { S.discard.push(card); if (!quiet) this.emit({ t: 'discard', uids: [L.uid] }); }

    const info = { target, hero: view.hero || null, uid: L.uid };
    if (!this.over) this.afterCardPlayed({ ...view, uid: L.uid, inst: card }, view, { ...info, killed: scope.killed, hitTargets: scope.hitTargets, pre: L.pre });
    this.finishIfWon();
    if (!this.over) this.refreshIntents();
  }

  /**
   * Open a choice for a 'choose' op (or resolve it at once when it is forced). -> true if the play must wait for choose().
   * op: { kind, n, optional?, from?: 'hand', prompt? }; scope: the card's scope (for choice.source).
   */
  beginChoice(op, scope = {}) {
    const S = this.state;
    if (this.blocked()) return false;
    const from = op.from || 'hand';
    const pile = S[from] || [];
    const fits = c => (op.kind === 'upgrade' ? !!CARDS[c.id]?.upgradable && !c.up
      : op.kind === 'retain' ? !c.retainTurn && !cardView(c).keywords.includes('retain') : true);
    const cands = pile.filter(fits);
    const n = Math.max(1, op.n || 1);
    if (!cands.length) return false;
    if (!op.optional && cands.length <= n) { this.resolveChoice(op.kind, cands, from); return false; }
    S.choice = {
      kind: op.kind, n, min: op.optional ? 0 : n, optional: !!op.optional, from, uids: cands.map(c => c.uid),
      prompt: op.prompt || CHOICE_PROMPTS[op.kind](n),
      source: scope.uid ? { uid: scope.uid, id: scope.card?.id || null, name: scope.card?.name || null } : null,
    };
    this.emit({ t: 'choice', ...clone(S.choice) });
    return true;
  }

  /** Apply a choice to the picked cards. */
  resolveChoice(kind, cards, from = 'hand') {
    const S = this.state;
    const pile = S[from] || S.hand;
    const take = c => { const i = pile.indexOf(c); if (i >= 0) pile.splice(i, 1); c.costTurn = undefined; };
    if (kind === 'discard') {
      for (const c of cards) { take(c); S.discard.push(c); }
      if (cards.length) this.emit({ t: 'discard', uids: cards.map(c => c.uid) });
    } else if (kind === 'exhaust') {
      for (const c of cards) { take(c); S.exhaust.push(c); this.emit({ t: 'exhaust', uid: c.uid }); }
    } else if (kind === 'upgrade') {
      for (const c of cards) {
        if (c.up || !CARDS[c.id]?.upgradable) continue;
        c.up = true;
        c.cost = cardView(c).cost;
        this.emit({ t: 'card_upgraded', uid: c.uid, id: c.id });
      }
    } else if (kind === 'retain') {
      for (const c of cards) c.retainTurn = true;
    } else throw new Error(`Unknown choice kind: ${kind}`);
  }

  usePotion(slot, targetUid) {
    const S = this.state;
    if (S.phase !== 'player') return { ok: false, reason: 'phase' };
    if (S.choice) return { ok: false, reason: 'choice' };
    const id = S.potions[slot];
    const def = POTIONS[id];
    if (!def) return { ok: false, reason: 'empty' };
    if (!def.usable) return { ok: false, reason: 'unusable' };
    const target = def.target === 'enemy' ? this.resolveTarget(targetUid) : null;
    if (def.target === 'enemy' && !target) return { ok: false, reason: 'target' };
    S.potions[slot] = null;
    S.counters.potionsUsed++;
    this.emit({ t: 'potion', id, slot, target: target ? target.uid : null, anim: def.anim });
    const pre = { targetStaggered: !!target && (target.statuses.vulnerable || 0) > 0, anyStaggered: this.alive().some(e => (e.statuses.vulnerable || 0) > 0) };
    runEffects(this, def.effects, { source: 'party', potion: def, hero: null, target, pre, killed: false, hitTargets: [] });
    this.finishIfWon();
    if (!this.over) this.refreshIntents();
    return { ok: true };
  }

  discardPotion(slot) {
    if (!this.state.potions[slot]) return { ok: false, reason: 'empty' };
    this.state.potions[slot] = null;
    return { ok: true };
  }

  endTurn() {
    const S = this.state;
    if (S.phase !== 'player') return { ok: false, reason: 'phase' };
    if (S.choice) return { ok: false, reason: 'choice' };
    this.endPlayerTurn();
    if (this.over) return { ok: true };
    this.enemyTurn();
    if (this.over) return { ok: true };
    this.startPlayerTurn();
    return { ok: true };
  }

  /**
   * Live numbers for a card (hand uid, any combat card uid, or a CardInst) against an optional target.
   * -> { damage: [per hit of the main damage op], hits, block, total, ops: [{ index, op, base, value, hits, to }] }
   */
  previewCard(uidOrInst, targetUid) {
    const inst = typeof uidOrInst === 'string' ? this.findCard(uidOrInst) : (this.findCard(uidOrInst?.uid) || uidOrInst);
    if (!inst) return null;
    const view = cardView(inst);
    const target = targetUid ? this.enemyByUid(targetUid) : null;
    const ops = [];
    let total = 0, block = 0, main = null;
    view.effects.forEach((op, index) => {
      if (op.op === 'damage') {
        const base = this.damageBase(op, inst);
        const t = (op.to || 'target') === 'random' ? (target || null) : target;
        const live = t && t.alive ? t : null;
        const v = op.pure ? base : this.calcPartyAttack({ base, op, view, hero: view.hero, target: live, preview: true, uid: inst.uid });
        const hits = op.times || 1;
        // staggered: the live value already includes the target's Staggered bonus (card text drops its "+N if Staggered")
        ops.push({ index, op: 'damage', base, value: v, hits, to: op.to || 'target', staggered: !op.pure && !!live && (live.statuses.vulnerable || 0) > 0 });
        total += v * hits;
        if (!main) main = { v, hits };
      } else if (op.op === 'block') {
        const v = this.calcCardBlock(op.n, { raw: !!op.raw });
        ops.push({ index, op: 'block', base: op.n, value: v });
        block += v;
      } else if (op.op === 'doubleBlock') { // Dig In: the Block it would add now (block from earlier ops of this card not counted)
        const v = this.party.block;
        ops.push({ index, op: 'block', base: v, value: v });
        block += v;
      }
    });
    return { damage: main ? Array(main.hits).fill(main.v) : [], hits: main ? main.hits : 0, block, total, ops };
  }

  /** Live intent for a zombie: { move, name, type, damage (per hit, live), hits, total } */
  intentOf(uid) {
    const e = this.enemyByUid(uid);
    if (!e || !e.alive || !e.intent) return null;
    const i = e.intent;
    const out = { move: i.move, name: i.name, type: i.type, damage: null, hits: 0, total: 0 };
    if (i.base !== null && i.base !== undefined) {
      out.damage = this.calcEnemyAttack(e, i.base);
      out.hits = i.hits;
      out.total = out.damage * i.hits;
    }
    return out;
  }

  takeEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  result() {
    const S = this.state;
    const relicCounters = {};
    for (const r of S.relics) relicCounters[r.id] = r.counter;
    return {
      won: S.phase === 'won', over: this.over,
      hp: S.party.hp, maxHp: S.party.maxHp, maxHpDelta: S.party.maxHp - S.startMaxHp,
      potions: S.potions.slice(), relicCounters, goldStolen: 0,
      kills: S.counters.kills, finishers: S.counters.finishers, turns: S.turn,
      damageTaken: S.counters.damageTaken, damageDealt: S.counters.damageDealt, bestHit: S.counters.bestHit,
      cardsPlayed: S.counters.cardsPlayed, potionsUsed: S.counters.potionsUsed,
      killedBy: S.killedBy, encounter: this.enc.id, elite: S.elite, boss: S.boss,
    };
  }

  /** Debug/playtest helpers (window.__SL.win / lose). */
  forceWin() {
    for (const e of this.alive()) { e.hp = 0; this.killEnemy(e, { kind: 'heavy', by: null, cardId: null, finisher: false }); }
    this.finishIfWon();
  }
  forceLose() {
    if (this.over) return;
    this.party.hp = 0;
    this.lose('debug');
  }

  // ================================================================ helper API for hooks, effects and content (ctx)

  emit(evt) { this.events.push(evt); if (this.log) this.log.push(evt); }
  flash(id) { this.emit({ t: 'relic', id }); }
  isLost() { return this.state.phase === 'lost'; }
  alive() { return this.state.enemies.filter(e => e.alive); }
  allDead() { return this.state.enemies.length > 0 && this.state.enemies.every(e => !e.alive); }
  enemyByUid(uid) { return this.state.enemies.find(e => e.uid === uid) || null; }
  relicsWith(field) { return this.state.relics.filter(r => RELICS[r.id] && RELICS[r.id][field]); }
  hasRelic(id) { return this.state.relics.some(r => r.id === id); }

  findCard(uid) {
    if (!uid) return null;
    const S = this.state;
    for (const pile of [S.hand, S.draw, S.discard, S.exhaust, S.powers]) {
      const c = pile.find(x => x.uid === uid);
      if (c) return c;
    }
    if (S.limbo?.card?.uid === uid) return S.limbo.card;
    return null;
  }

  resolveTarget(uid) {
    if (uid) {
      const e = this.enemyByUid(uid);
      return e && e.alive ? e : null;
    }
    const alive = this.alive();
    return alive.length === 1 ? alive[0] : null;
  }

  // ---- party
  gainBlock(n, { raw = false } = {}) {
    if (this.blocked()) return;
    const amount = raw ? Math.max(0, Math.floor(n)) : this.calcCardBlock(n);
    if (amount <= 0) return;
    this.party.block += amount;
    this.emit({ t: 'block', target: 'party', amount, block: this.party.block });
    const ram = this.party.statuses.battering_ram || 0;
    if (ram > 0 && !this.ramming) { // Battering Ram (Juggernaut): not an attack, so no Strength, Staggered or finisher
      const e = this.rng.pick(this.alive());
      if (!e) return;
      this.ramming = true;
      this.emit({ t: 'attack', by: 'marc', target: e.uid, anim: 'melee_heavy', hits: 1, cardId: null, power: 'battering_ram' });
      this.hitEnemy(e, ram, { kind: 'heavy', by: 'marc', cardId: null, source: 'marc', attack: false });
      this.ramming = false;
      if (this.allDead()) this.finishIfWon();
    }
  }

  gainEnergy(n) {
    if (this.blocked()) return;
    const S = this.state;
    if (S.phase === 'enemy' && n > 0) { // e.g. Trophy Belt on a Bleed kill: kept for the next player turn, not lost to the refill
      S.energyNext = (S.energyNext || 0) + n;
      this.emit({ t: 'energy', energy: S.energy, max: S.maxEnergy, next: S.energyNext });
      return;
    }
    const before = S.energy;
    S.energy = Math.max(0, S.energy + n);
    if (S.energy !== before) this.emit({ t: 'energy', energy: S.energy, max: S.maxEnergy, delta: S.energy - before });
  }

  heal(n) {
    if (this.isLost()) return;
    const p = this.party;
    const amount = Math.max(0, Math.min(Math.floor(n), p.maxHp - p.hp));
    if (amount <= 0) return;
    p.hp += amount;
    this.emit({ t: 'heal', target: 'party', amount, hp: p.hp, maxHp: p.maxHp });
  }

  setHp(n) {
    const p = this.party;
    const before = p.hp;
    p.hp = Math.max(1, Math.min(p.maxHp, Math.floor(n)));
    this.emit({ t: 'heal', target: 'party', amount: p.hp - before, hp: p.hp, maxHp: p.maxHp });
  }

  gainMaxHp(n) {
    if (this.isLost() || n <= 0) return;
    const p = this.party;
    p.maxHp += n;
    p.hp += n;
    this.emit({ t: 'heal', target: 'party', amount: n, hp: p.hp, maxHp: p.maxHp, maxHpDelta: n });
  }

  /** Party loses HP directly (ignores Block): self-damage, Bleed, Infection. */
  loseHp(n, { kind = 'self', hero = null, source = 'party' } = {}) {
    if (this.over || n <= 0) return;
    this.partyHpLoss(n, { kind, hero, source, blocked: 0 });
  }

  applyParty(status, n, { source = null } = {}) {
    if (this.blocked()) return;
    this.applyStatus(this.party, 'party', status, n, source);
  }

  applyEnemy(e, status, n, { source = 'party' } = {}) {
    if (!e || !e.alive || this.isLost()) return;
    this.applyStatus(e, e.uid, status, n, source);
  }

  applyAll(status, n) { for (const e of this.alive()) this.applyEnemy(e, status, n); }

  setStatus(e, status, total) {
    const owner = e === this.party ? 'party' : e.uid;
    const prev = e.statuses[status] || 0;
    if (total === prev) return;
    if (total === 0) delete e.statuses[status]; else e.statuses[status] = total;
    this.emit({ t: 'status', target: owner, status, delta: total - prev, total });
  }

  draw(n) {
    if (this.blocked() || n <= 0) return [];
    const S = this.state;
    if ((S.party.statuses.slow_motion || 0) > 0) return [];
    const drawn = [];
    let batch = [];
    const flush = () => { if (batch.length) { this.emit({ t: 'draw', uids: batch }); batch = []; } };
    for (let i = 0; i < n; i++) {
      if (S.hand.length >= HAND_LIMIT) break;
      if (!S.draw.length) {
        if (!S.discard.length) break;
        flush();
        S.draw = this.streams.shuffle.shuffle(S.discard.splice(0));
        this.emit({ t: 'shuffle', count: S.draw.length });
      }
      const card = S.draw.shift();
      S.hand.push(card);
      batch.push(card.uid);
      drawn.push(card.uid);
    }
    flush();
    return drawn;
  }

  addCard(id, to = 'discard', n = 1, { up = false } = {}) {
    if (this.blocked()) return;
    const S = this.state;
    for (let i = 0; i < n; i++) {
      const card = this.makeCombatCard({ uid: `t${++this.tempSeq}`, id, up });
      let dest = to;
      if (dest === 'hand' && S.hand.length >= HAND_LIMIT) dest = 'discard';
      if (dest === 'hand') S.hand.push(card);
      else if (dest === 'draw') S.draw.splice(this.rng.int(S.draw.length + 1), 0, card);
      else S.discard.push(card);
      this.emit({ t: 'card_created', uid: card.uid, id, to: dest });
    }
  }

  slowMotion() {
    this.applyParty('slow_motion', 1);
    for (const c of this.state.hand) if (c.cost !== null && c.cost !== undefined) c.costTurn = 0;
  }

  // ---- zombies
  enemyBlock(e, n) {
    if (!e.alive || n <= 0) return;
    e.block += n;
    this.emit({ t: 'block', target: e.uid, amount: n, block: e.block });
  }

  healEnemy(e, n) {
    if (!e.alive) return;
    const amount = Math.max(0, Math.min(n, e.maxHp - e.hp));
    if (amount <= 0) return;
    e.hp += amount;
    this.emit({ t: 'heal', target: e.uid, amount, hp: e.hp });
  }

  setIntent(e, moveId) {
    const def = ENEMIES[e.id];
    const move = def.moves[moveId];
    if (!move) throw new Error(`${e.id} has no move ${moveId}`);
    const dmg = moveDamage(move, e);
    e.intent = { move: moveId, name: move.name, type: move.intent, base: dmg ? dmg.damage : null, hits: dmg ? dmg.hits : 0, damage: null };
    if (dmg) e.intent.damage = this.calcEnemyAttack(e, dmg.damage);
    this.emitIntent(e);
  }

  emitIntent(e) {
    const live = this.intentOf(e.uid);
    if (!live) return;
    e.intent.damage = live.damage;
    this.lastIntentShown.set(e.uid, `${live.move}:${live.damage}:${live.hits}`);
    this.emit({ t: 'intent', uid: e.uid, intent: live });
  }

  enemyMove(e, move, name, type) { this.emit({ t: 'enemy_move', uid: e.uid, move, name, type }); }

  wake(e, { stunned = false } = {}) {
    if (!e.alive) return;
    this.setStatus(e, 'asleep', 0);
    if (e.statuses.plating) this.setStatus(e, 'plating', 0);
    this.emit({ t: 'wake', uid: e.uid, stunned });
    if (stunned) this.setIntent(e, 'stunned');
  }

  guardOffensive(e) {
    if (!e.alive) return;
    e.vars.mode = 'offensive';
    if (e.statuses.thorns) this.setStatus(e, 'thorns', 0);
    this.setStatus(e, 'mode_shift', 30 + 10 * e.vars.shifts);
    this.emit({ t: 'mode_shift', uid: e.uid, mode: 'offensive' });
  }

  reviveFallen(nurse, pct = 0.5) {
    const dead = this.killOrder.map(uid => this.enemyByUid(uid)).filter(x => x && !x.alive && x !== nurse);
    const e = dead[dead.length - 1];
    if (!e) return;
    nurse.vars.revives = (nurse.vars.revives || 0) + 1;
    e.alive = true;
    e.hp = Math.max(1, Math.floor(e.maxHp * pct));
    e.block = 0;
    e.statuses = {};
    e.flags = { revivedTurn: this.state.turn };
    e.history = [];
    this.killOrder = this.killOrder.filter(u => u !== e.uid);
    this.emit({ t: 'revive', uid: e.uid, hp: e.hp, by: nurse.uid });
    this.rollIntent(e);
  }

  /** Zombie loses HP without an attack (Bleed, pure damage). */
  enemyLoseHp(e, n, { kind = 'bleed', source = null, by = null } = {}) {
    if (!e.alive || n <= 0) return;
    const amount = Math.min(n, e.hp);
    e.hp -= amount;
    const killed = e.hp <= 0;
    this.emit({ t: 'damage', source, target: e.uid, amount, blocked: 0, hp: e.hp, block: e.block, kind,
      staggered: (e.statuses.vulnerable || 0) > 0, killed, hit: 1, hits: 1 });
    if (killed) this.killEnemy(e, { kind, by, cardId: null, finisher: false });
    else this.enemyHpLost(e, amount);
  }

  /** Pure damage to every zombie (relics, potions): goes through Block, no Strength or Staggered. */
  damageAll(n, { kind = 'blast', pure = true } = {}) {
    if (this.blocked()) return;
    for (const e of this.alive()) this.hitEnemy(e, n, { kind, by: null, cardId: null, source: 'party', attack: !pure, hit: 1, hits: 1 });
  }

  // ================================================================ turn flow

  startPlayerTurn() {
    const S = this.state;
    const P = S.party;
    S.turn += 1;
    S.phase = 'player';
    Object.assign(S.counters, { attacksThisTurn: 0, skillsThisTurn: 0, powersThisTurn: 0, cardsThisTurn: 0, deadEyeThisTurn: 0 });
    this.emit({ t: 'turn_start', side: 'player', turn: S.turn });

    if (P.statuses.barbed) this.setStatus(P, 'barbed', 0); // Barbed Wire lasts until the start of your next turn
    if (S.turn > 1 && P.block > 0 && !(P.statuses.fortify > 0)) {
      const was = P.block;
      P.block = 0;
      this.emit({ t: 'block', target: 'party', amount: -was, block: 0, cleared: true });
    }
    if ((P.statuses.bleed || 0) > 0) {
      this.partyHpLoss(P.statuses.bleed, { kind: 'bleed', hero: null, source: null, blocked: 0 });
      if (this.over) return;
      this.setStatus(P, 'bleed', P.statuses.bleed - 1);
    }

    const keep = this.relicsWith('keepEnergy').length > 0 && S.turn > 1;
    S.energy = (keep ? S.energy + S.maxEnergy : S.maxEnergy) + (S.energyNext || 0);
    S.energyNext = 0;
    this.emit({ t: 'energy', energy: S.energy, max: S.maxEnergy });

    this.hook('onTurnStart', S.turn);
    if (P.statuses.berserker > 0) this.applyParty('strength', P.statuses.berserker);
    if (this.over) return;

    const n = S.turn === 1 ? Math.max(DRAW_PER_TURN, this.innateCount || 0) : DRAW_PER_TURN;
    this.draw(n);
    this.hook('onTurnStartPostDraw', S.turn);
    this.refreshIntents();
  }

  endPlayerTurn() {
    const S = this.state;
    const P = S.party;
    this.hook('onTurnEnd', S.turn);
    if (P.statuses.thick_skin > 0) this.gainBlock(P.statuses.thick_skin, { raw: true });

    // cards that hurt while held (Infection)
    for (const c of S.hand.slice()) {
      const def = CARDS[c.id];
      if (def.endOfTurnInHand) runEffects(this, def.endOfTurnInHand, { source: 'party', card: cardView(c), hero: null, pre: {}, hitTargets: [] });
      if (this.over) return;
    }

    // hand: Fleeting exhausts, Retain stays, the rest is discarded
    const discarded = [];
    for (const c of S.hand.slice()) {
      const kws = cardView(c).keywords;
      c.costTurn = undefined;
      if (c.retainTurn) { c.retainTurn = false; continue; } // retained by a choice (Wait for It) for this turn
      if (kws.includes('retain')) continue;
      S.hand.splice(S.hand.indexOf(c), 1);
      if (kws.includes('fleeting')) { S.exhaust.push(c); this.emit({ t: 'exhaust', uid: c.uid, fleeting: true }); }
      else { S.discard.push(c); discarded.push(c.uid); }
    }
    if (discarded.length) this.emit({ t: 'discard', uids: discarded, endOfTurn: true });

    // this-turn effects end
    if (P.statuses.temp_strength) {
      const t = P.statuses.temp_strength;
      this.setStatus(P, 'temp_strength', 0);
      this.applyStatus(P, 'party', 'strength', -t, 'party', { quiet: true });
    }
    for (const s of ['swing_guard', 'slow_motion']) if (P.statuses[s]) this.setStatus(P, s, 0);

  }

  enemyTurn() {
    const S = this.state;
    S.phase = 'enemy';
    this.emit({ t: 'turn_start', side: 'enemy', turn: S.turn });

    for (const e of this.alive()) {
      if (e.block > 0) {
        const was = e.block;
        e.block = 0;
        this.emit({ t: 'block', target: e.uid, amount: -was, block: 0, cleared: true });
      }
    }
    for (const e of this.alive()) {
      const b = e.statuses.bleed || 0;
      if (b > 0) {
        this.enemyLoseHp(e, b, { kind: 'bleed' });
        if (e.alive) this.setStatus(e, 'bleed', b - 1);
      }
    }
    if (this.finishIfWon()) return;

    for (const e of S.enemies.slice()) {
      if (!e.alive || e.flags.revivedTurn === S.turn) continue;
      this.act(e);
      if (this.over) return;
      if (this.finishIfWon()) return;
    }

    // end of the zombies' turn
    for (const e of this.alive()) {
      if (e.statuses.plating > 0) this.enemyBlock(e, e.statuses.plating);
      if (e.statuses.ritual > 0) {
        if (e.flags.ritualFresh) e.flags.ritualFresh = false;
        else this.applyEnemy(e, 'strength', e.statuses.ritual, { source: e.uid });
      }
      for (const s of TURN_STATUSES) if (e.statuses[s] > 0) this.setStatus(e, s, e.statuses[s] - 1);
    }
    // end of the round: the party's turn debuffs tick, except ones a zombie applied this turn
    const P = S.party;
    for (const s of TURN_STATUSES) {
      if (!(P.statuses[s] > 0)) continue;
      if (P.flags.fresh?.[s]) { delete P.flags.fresh[s]; continue; }
      this.setStatus(P, s, P.statuses[s] - 1);
    }
    P.flags.fresh = {};
    // next intents (a zombie revived this turn already rolled one when it got up; keep the one the player saw)
    for (const e of this.alive()) if (e.flags.revivedTurn !== S.turn || !e.intent) this.rollIntent(e);
  }

  act(e) {
    const def = ENEMIES[e.id];
    const moveId = e.intent ? e.intent.move : def.ai(this.makeAi(e));
    const move = def.moves[moveId];
    this.emit({ t: 'enemy_move', uid: e.uid, move: moveId, name: move.name, type: move.intent, anim: move.anim, clip: move.clip || null });
    if (move.intent === 'stun') this.emit({ t: 'stunned', uid: e.uid });
    e.history.push(moveId);
    runEffects(this, move.effects, { source: e.uid, enemy: e, move, pre: {}, hitTargets: [] });
  }

  rollIntent(e) {
    if (!e.alive) return;
    const moveId = ENEMIES[e.id].ai(this.makeAi(e));
    this.setIntent(e, moveId);
  }

  makeAi(e) {
    const hist = e.history;
    const ai = this.streams.ai;
    return {
      e, rng: ai, turn: this.state.turn, history: hist,
      last: () => hist[hist.length - 1],
      lastMove: m => hist[hist.length - 1] === m,
      lastTwo: m => hist.length >= 2 && hist[hist.length - 1] === m && hist[hist.length - 2] === m,
      first: hist.length === 0,
      roll: () => ai.int(100),
      chance: p => ai.chance(p),
      allies: this.alive().filter(x => x !== e),
      dead: this.state.enemies.filter(x => !x.alive && x !== e),
      slot: this.state.enemies.indexOf(e),
    };
  }

  /** Re-send intents whose live numbers changed (Weakened on a zombie, Staggered on the party, Strength...). */
  refreshIntents() {
    for (const e of this.alive()) {
      if (!e.intent) continue;
      const live = this.intentOf(e.uid);
      const key = `${live.move}:${live.damage}:${live.hits}`;
      if (this.lastIntentShown.get(e.uid) !== key) this.emitIntent(e);
    }
  }

  finishIfWon() {
    if (this.state.phase === 'won') return true;
    if (this.isLost() || !this.allDead()) return false;
    this.win();
    return true;
  }

  /** A fight that ends with a choice open (debug win/lose): the waiting card goes to the discard pile. */
  clearChoice() {
    const S = this.state;
    S.choice = null;
    if (S.limbo) { S.discard.push(S.limbo.card); S.limbo = null; }
  }

  win() {
    const S = this.state;
    this.clearChoice();
    S.phase = 'won';
    S.endHp = S.party.hp;
    for (const s of ['temp_strength']) delete S.party.statuses[s];
    this.hook('onCombatEnd', true);
    this.emit({ t: 'combat_end', won: true });
  }

  lose(killedBy) {
    const S = this.state;
    if (this.over) return;
    this.clearChoice();
    S.phase = 'lost';
    S.endHp = 0;
    S.killedBy = killedBy ?? S.killedBy;
    this.hook('onCombatEnd', false);
    this.emit({ t: 'combat_end', won: false, killedBy: S.killedBy });
  }

  /** While the fight is over (or every zombie is down), card-side effects stop. */
  blocked() { return this.over || this.allDead(); }

  // ================================================================ damage

  damageBase(op, inst) {
    if (op.nFrom === 'block') return this.party.block;
    return (op.n || 0) + (inst?.bonus || 0);
  }

  /** Party attack damage per hit (Slay the Spire order: flat bonuses, then x2s, Weak, Staggered; floor). */
  calcPartyAttack({ base, op, view, hero, target, preview = false, uid = null }) {
    const P = this.party;
    let d = base + (P.statuses.strength || 0) * (op.scaleStr || 1);
    const tStag = !!target && (target.statuses.vulnerable || 0) > 0;
    if (op.bonusStaggered && tStag) d += op.bonusStaggered;
    if (tStag && P.statuses.marksman > 0) d += P.statuses.marksman;
    const info = { card: view, op, hero, target, base, preview, uid };
    for (const r of this.state.relics) {
      const def = RELICS[r.id];
      if (def?.damageBonus) d += def.damageBonus(this, r, info) || 0;
    }
    for (const r of this.state.relics) {
      const def = RELICS[r.id];
      if (def?.modifyDamage) d = def.modifyDamage(this, r, d, info);
    }
    if ((P.statuses.weak || 0) > 0) d *= 0.75;
    if (tStag) d *= this.vulnMult();
    return Math.max(0, Math.floor(d));
  }

  vulnMult() {
    let m = 1.5;
    for (const r of this.relicsWith('vulnMult')) m = Math.max(m, RELICS[r.id].vulnMult);
    return m;
  }

  /** Zombie attack damage per hit against the party. */
  calcEnemyAttack(e, base) {
    let d = base + (e.statuses.strength || 0);
    if ((e.statuses.weak || 0) > 0) d *= 0.75;
    if ((this.party.statuses.vulnerable || 0) > 0) d *= 1.5;
    return Math.max(0, Math.floor(d));
  }

  /** Block from a card: base + Agility, x0.75 if Shaken, floor. */
  calcCardBlock(n, { raw = false } = {}) {
    if (raw) return Math.max(0, Math.floor(n));
    const P = this.party;
    let b = n + (P.statuses.dexterity || 0);
    if ((P.statuses.frail || 0) > 0) b *= 0.75;
    return Math.max(0, Math.floor(b));
  }

  /** A party damage op (card or potion). */
  partyAttack(op, s) {
    const view = s.card || null;
    const hero = s.hero || null;
    const kind = op.kind || view?.kind || 'light';
    const anim = view?.anim || s.potion?.anim || 'none';
    const hits = op.times || 1;
    const cardId = view ? view.id : null;
    const to = op.to || 'target';
    const base = this.damageBase(op, s.inst);
    const killedNow = [];

    // hit / of: this hit's number within its own attack event (the director counts follow-up swings from it)
    const hitOnce = (e, hit, of = hits) => {
      const wasStag = (e.statuses.vulnerable || 0) > 0;
      const dmg = op.pure ? Math.max(0, Math.floor(base)) : this.calcPartyAttack({ base, op, view: view || { id: null, type: 'attack' }, hero, target: e });
      const res = this.hitEnemy(e, dmg, { kind, by: hero, cardId, source: hero || 'party', attack: !op.pure && !!view, hit, hits: of, staggered: wasStag });
      if (!s.hitTargets.includes(e)) s.hitTargets.push(e);
      if (res.killed) { s.killed = true; killedNow.push(e); }
    };

    if (to === 'all') {
      this.emit({ t: 'attack', by: hero || 'party', target: 'all', anim, hits, cardId });
      for (let h = 0; h < hits; h++) {
        for (const e of this.alive()) { hitOnce(e, h + 1); if (this.isLost()) return; }
      }
    } else if (to === 'random') {
      // each random hit is its own one-hit attack event (volley / of say which shot of the card it is)
      for (let h = 0; h < hits; h++) {
        const e = this.rng.pick(this.alive());
        if (!e) break;
        this.emit({ t: 'attack', by: hero || 'party', target: e.uid, anim, hits: 1, volley: h + 1, of: hits, cardId });
        hitOnce(e, 1, 1);
        if (this.isLost()) return;
      }
    } else {
      const e = s.target;
      if (!e || !e.alive) return;
      this.emit({ t: 'attack', by: hero || 'party', target: e.uid, anim, hits, cardId });
      for (let h = 0; h < hits; h++) {
        if (!e.alive) break;
        hitOnce(e, h + 1);
        if (this.isLost()) return;
      }
    }
    for (const e of s.hitTargets) {
      if (!e.flags.hunchPending) continue;
      e.flags.hunchPending = false;
      if (!e.alive || !(e.statuses.hunch > 0)) continue;
      const n = e.statuses.hunch;
      this.setStatus(e, 'hunch', 0);
      this.enemyBlock(e, n);
    }
    if (op.onKill && killedNow.length) runEffects(this, op.onKill, s);
  }

  /**
   * One hit on a zombie: Block absorbs, the rest is HP loss. attack = it's an attack (Hunch and Spiked react).
   * -> { amount, blocked, killed }
   */
  hitEnemy(e, dmg, { kind, by, cardId, source, attack = true, hit = 1, hits = 1, staggered }) {
    const wasStag = staggered ?? (e.statuses.vulnerable || 0) > 0;
    const blocked = Math.min(e.block, dmg);
    e.block -= blocked;
    const loss = Math.min(dmg - blocked, e.hp);
    e.hp -= loss;
    const killed = e.hp <= 0;
    const finisher = killed && wasStag && !!by && attack;
    const C = this.state.counters;
    C.damageDealt += loss;
    C.bestHit = Math.max(C.bestHit, dmg);
    this.emit({ t: 'damage', source, target: e.uid, amount: loss, blocked, hp: e.hp, block: e.block, kind,
      staggered: wasStag, killed, hit, hits, ...(killed ? { finisher } : {}) });

    if (killed) {
      this.killEnemy(e, { kind, by, cardId, finisher });
    } else if (loss > 0) {
      if (attack && e.statuses.hunch > 0) e.flags.hunchPending = true; // curls up after the attack's last hit
      this.enemyHpLost(e, loss);
    }
    return { amount: loss, blocked, killed };
  }

  enemyHpLost(e, amount) {
    const def = ENEMIES[e.id];
    if (def.onHpLost && e.alive) def.onHpLost(this, e, amount);
  }

  killEnemy(e, { kind, by, cardId, finisher }) {
    e.alive = false;
    e.hp = 0;
    e.block = 0;
    e.statuses = {};
    e.intent = null;
    e.diedTurn = this.state.turn;
    this.killOrder.push(e.uid);
    this.lastIntentShown.delete(e.uid);
    this.state.counters.kills++;
    if (finisher) this.state.counters.finishers++;
    this.emit({ t: 'death', target: e.uid, kind, finisher: !!finisher, by: by || null, cardId: cardId || null });
    const def = ENEMIES[e.id];
    if (def.onDeath) def.onDeath(this, e);
    if (!this.allDead()) this.hook('onEnemyDeath', e);
  }

  /** A zombie's damage op against the party. */
  enemyAttack(e, op, s) {
    if (!e.alive) return;
    const base = scaleHit(value(op.n, s), e);
    const hits = op.times || 1;
    const hero = e.slot % 2 === 0 ? 'marc' : 'yola';
    const kind = s.move?.anim === 'melee_heavy' ? 'heavy' : 'light';
    this.emit({ t: 'attack', by: e.uid, target: 'party', anim: s.move?.anim || 'melee_light', hits, hero });
    for (let h = 0; h < hits; h++) {
      if (!e.alive || this.over) return;
      const dmg = this.calcEnemyAttack(e, base);
      this.damageParty(dmg, { source: e.uid, kind, hero, hit: h + 1, hits });
      const barbed = this.party.statuses.barbed || 0;  // Barbed Wire (Flame Barrier): each hit is answered, through Block
      if (barbed > 0 && !this.over && e.alive) this.hitEnemy(e, barbed, { kind: 'thorns', by: 'marc', cardId: null, source: 'marc', attack: false });
    }
  }

  /** Damage to the party that Block can stop (zombie attacks, Spiked). */
  damageParty(dmg, { source, kind, hero = null, hit = 1, hits = 1 }) {
    if (this.over) return;
    const P = this.party;
    const blocked = Math.min(P.block, dmg);
    P.block -= blocked;
    this.partyHpLoss(dmg - blocked, { kind, hero, source, blocked, hit, hits });
  }

  /** Every party HP loss ends here: Steel Plate, the damage event, death and saves. */
  partyHpLoss(raw, { kind, hero, source, blocked = 0, hit = 1, hits = 1 }) {
    const P = this.party;
    let loss = Math.max(0, raw);
    for (const r of this.state.relics) {
      const def = RELICS[r.id];
      if (def?.modifyHpLoss && loss > 0) loss = Math.max(0, def.modifyHpLoss(this, r, loss));
    }
    loss = Math.min(loss, P.hp);
    P.hp -= loss;
    this.state.counters.damageTaken += loss;
    this.emit({ t: 'damage', source, target: 'party', amount: loss, blocked, hp: P.hp, block: P.block, kind,
      staggered: (P.statuses.vulnerable || 0) > 0, killed: P.hp <= 0, hit, hits, hero });
    if (loss > 0) this.hook('onHpLost', loss);
    if (P.hp <= 0) {
      const killer = typeof source === 'string' && this.enemyByUid(source) ? this.enemyByUid(source).id : (kind === 'self' ? 'self' : kind);
      if (!this.trySave()) this.lose(killer);
    }
  }

  /** Epi-Pen (potion) first, then relics like Defib Pads. */
  trySave() {
    const S = this.state;
    const slot = S.potions.findIndex(id => id && POTIONS[id]?.revivePct);
    if (slot >= 0) {
      const id = S.potions[slot];
      S.potions[slot] = null;
      this.emit({ t: 'potion', id, slot, target: null, auto: true });
      this.setHp(Math.max(1, Math.floor(S.party.maxHp * POTIONS[id].revivePct)));
      return true;
    }
    for (const r of S.relics) {
      const def = RELICS[r.id];
      if (def?.onWouldDie && def.onWouldDie(this, r)) return S.party.hp > 0;
    }
    return false;
  }

  // ================================================================ statuses

  applyStatus(owner, ownerId, status, n, source, { quiet = false } = {}) {
    if (!n) return;
    const def = STATUSES[status];
    if (!def) throw new Error(`Unknown status: ${status}`);
    if (isDebuff(status, n) && (owner.statuses.immune || 0) > 0) {
      this.setStatus(owner, 'immune', owner.statuses.immune - 1);
      this.emit({ t: 'immune', target: ownerId, status });
      return;
    }
    const prev = owner.statuses[status] || 0;
    let total = prev + n;
    if (!def.negative && total < 0) total = 0;
    if (total === 0) delete owner.statuses[status]; else owner.statuses[status] = total;
    if (total - prev === 0) return;
    if (status === 'ritual' && ownerId !== 'party' && source === ownerId) owner.flags.ritualFresh = true;
    if (ownerId === 'party' && this.state.phase === 'enemy' && def.stack === 'turns' && n > 0) (owner.flags.fresh ||= {})[status] = true;
    this.emit({ t: 'status', target: ownerId, status, delta: total - prev, total, ...(quiet ? { quiet: true } : {}) });
  }

  // ================================================================ cards played: follow-ups

  afterCardPlayed(cardRef, view, info) {
    const P = this.party;
    const S = this.state;
    if (this.allDead()) { this.hook('onCardPlayed', cardRef, info); return; } // counters still count the killing card
    if (view.type === 'attack') { // Spiked: once per Attack card played (Sharp Hide), whatever it targeted
      for (const e of this.alive()) {
        if (e.statuses.thorns > 0) this.damageParty(e.statuses.thorns, { source: e.uid, kind: 'thorns', hero: view.hero || null });
        if (this.over) return;
      }
    }
    if (view.type === 'attack' && P.statuses.swing_guard > 0) this.gainBlock(P.statuses.swing_guard, { raw: true });
    if (view.type === 'skill' && P.statuses.light_feet > 0) this.gainBlock(P.statuses.light_feet, { raw: true });
    if (view.type === 'skill') {
      for (const e of this.alive()) if (e.statuses.enrage > 0) this.applyEnemy(e, 'strength', e.statuses.enrage, { source: e.uid });
    }
    if (view.type === 'attack' && P.statuses.dead_eye > 0) {
      const onStag = info.pre.targetStaggered || (!info.target && info.pre.anyStaggered);
      if (onStag && S.counters.deadEyeThisTurn < P.statuses.dead_eye) {
        S.counters.deadEyeThisTurn++;
        this.draw(1);
      }
    }
    this.hook('onCardPlayed', cardRef, info);
  }

  // ================================================================ relic hooks

  hook(name, ...args) {
    for (const r of this.state.relics) {
      const def = RELICS[r.id];
      const fn = def && def[name];
      if (typeof fn !== 'function') continue;
      if (this.isLost() && name !== 'onCombatEnd') return;
      if (this.state.phase === 'won' && name !== 'onCombatEnd') return;
      fn.call(def, this, r, ...args);
    }
  }

  // ================================================================ setup helpers

  makeCombatCard(inst) {
    const view = cardView(inst);
    return { uid: inst.uid, id: inst.id, up: !!inst.up, cost: view.cost, costTurn: undefined, bonus: 0 };
  }

  spawnEnemy(id, slot) {
    const def = ENEMIES[id];
    if (!def) throw new Error(`Unknown enemy: ${id}`);
    let hp = this.rng.range(def.hp[0], def.hp[1]);
    // infection levels (infection.js): tougher zombies by tier
    const up = this.rules[def.tier === 'boss' ? 'boss' : def.tier === 'elite' ? 'elite' : 'normal'];
    if (up.hpPct) hp = Math.round(hp * (1 + up.hpPct));
    if (up.hp) hp += up.hp;
    const e = {
      uid: `e${slot + 1}`, id, name: def.name, hp, maxHp: hp, block: 0, statuses: {}, alive: true, slot,
      intent: null, history: [], vars: {}, flags: {},
      model: def.model, scale: def.scale, size: def.size, tier: def.tier, pose: def.pose || null,
    };
    if (up.flat || up.pct) e.dmgUp = { flat: up.flat || 0, pct: up.pct || 0 };
    if (def.onSpawn) def.onSpawn(this, e);
    return e;
  }

  snapshot(e) {
    return { uid: e.uid, id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp, block: e.block, statuses: clone(e.statuses),
      alive: e.alive, slot: e.slot, model: e.model, scale: e.scale, size: e.size, tier: e.tier, pose: e.pose };
  }
}
