// The effect interpreter: runs the small effect lists that cards, potions and zombie moves are made of.
// Pure logic: every op calls a primitive on the combat (cx = the Combat object in combat.js), which applies
// the rule and emits the events. Ops (BUILD_SPEC section 3, plus a few named helpers):
//   damage   { n, times?, to?: 'target'|'all'|'random', kind?, bonusStaggered?, scaleStr?, nFrom?: 'block', grow?, pure?, onKill?: [...] }
//   block    { n, raw? }                     apply { status, n, to?: 'target'|'all'|'self'|'party'|'random' }
//   draw { n }   energy { n }   heal { n | pct }   loseHp { n }   maxHp { n }   addCard { id, n, to }
//   exhaustSelf   if { cond, then, else? }   custom { fn(cx, scope) }
//   tempStrength { n }  doubleBlock  doubleStatus { status }  slowMotion
//   choose { kind: 'discard'|'exhaust'|'upgrade'|'retain', n, optional?, from: 'hand', prompt? }  a card choice; in a card
//     it must be a top-level effect: combat.js pauses the card there until combat.choose(uids) (see its header)
//   zombie-only: healAllies { n }  revive { pct }  sleepTick  guardOffensive
// scope = { source: 'party' | enemy, card?, inst?, hero?, target?, potion?, pre: { targetStaggered, anyStaggered }, killed, hitTargets }
// n may be a function of the zombie for zombie moves (e => e.vars.bite).
// Once every zombie is dead, only ops that still matter run (heal, maxHp, custom, if); once the party is dead nothing runs.

const AFTER_WIN = new Set(['heal', 'maxHp', 'custom', 'if']);

export function value(n, scope) {
  return typeof n === 'function' ? n(scope.enemy || scope) : (n ?? 0);
}

export const CONDITIONS = {
  targetStaggered: (cx, s) => !!s.pre?.targetStaggered,
  anyStaggered: (cx, s) => !!s.pre?.anyStaggered,
  killed: (cx, s) => !!s.killed,
  targetBleeding: (cx, s) => !!s.target && (s.target.statuses.bleed || 0) > 0,
};

export const OPS = {
  damage(cx, op, s) {
    if (s.enemy) cx.enemyAttack(s.enemy, op, s);
    else cx.partyAttack(op, s);
  },

  block(cx, op, s) {
    const n = value(op.n, s);
    if (s.enemy) cx.enemyBlock(s.enemy, n);
    else cx.gainBlock(n, { raw: !!op.raw || !s.card });
  },

  apply(cx, op, s) {
    const n = value(op.n, s);
    const to = op.to || 'target';
    if (s.enemy) {
      if (to === 'self') cx.applyEnemy(s.enemy, op.status, n, { source: s.enemy.uid });
      else if (to === 'party' || to === 'target') cx.applyParty(op.status, n, { source: s.enemy.uid });
      else if (to === 'allies') for (const e of cx.alive()) if (e !== s.enemy) cx.applyEnemy(e, op.status, n, { source: s.enemy.uid });
      return;
    }
    if (to === 'self' || to === 'party') cx.applyParty(op.status, n, { source: 'party' });
    else if (to === 'all') for (const e of cx.alive()) cx.applyEnemy(e, op.status, n, { source: 'party' });
    else if (to === 'random') { const e = cx.rng.pick(cx.alive()); if (e) cx.applyEnemy(e, op.status, n, { source: 'party' }); }
    else if (s.target && s.target.alive) cx.applyEnemy(s.target, op.status, n, { source: 'party' });
  },

  draw(cx, op, s) { cx.draw(value(op.n, s)); },
  energy(cx, op, s) { cx.gainEnergy(value(op.n, s)); },

  heal(cx, op, s) {
    if (s.enemy) { cx.healEnemy(s.enemy, value(op.n, s)); return; }
    const n = op.pct ? Math.floor(cx.party.maxHp * op.pct) : value(op.n, s);
    cx.heal(n);
  },

  loseHp(cx, op, s) {
    if (s.enemy) cx.enemyLoseHp(s.enemy, value(op.n, s), { kind: 'self', source: s.enemy.uid });
    else cx.loseHp(value(op.n, s), { kind: 'self', hero: s.hero || null });
  },

  maxHp(cx, op, s) { cx.gainMaxHp(value(op.n, s)); },

  addCard(cx, op, s) { cx.addCard(op.id, op.to || 'discard', op.n || 1, { up: !!op.up }); },

  exhaustSelf(cx, op, s) { s.exhaust = true; },

  if(cx, op, s) {
    const test = CONDITIONS[op.cond];
    if (!test) throw new Error(`Unknown condition: ${op.cond}`);
    runEffects(cx, test(cx, s) ? op.then : op.else, s);
  },

  custom(cx, op, s) { op.fn(cx, s); },

  tempStrength(cx, op, s) {
    const n = value(op.n, s);
    cx.applyParty('strength', n, { source: 'party' });
    cx.applyParty('temp_strength', n, { source: 'party' });
  },

  doubleBlock(cx) { if (cx.party.block > 0) cx.gainBlock(cx.party.block, { raw: true }); },

  doubleStatus(cx, op) {
    const cur = cx.party.statuses[op.status] || 0;
    if (cur > 0) cx.applyParty(op.status, cur, { source: 'party' });
  },

  slowMotion(cx) { cx.slowMotion(); },

  // only reached outside a card's top level (a potion, an 'if'): the choice opens, the list doesn't wait for it
  choose(cx, op, s) { cx.beginChoice(op, s); },

  // ---- zombie moves
  healAllies(cx, op, s) {
    for (const e of cx.alive()) if (e !== s.enemy) cx.healEnemy(e, value(op.n, s));
  },
  revive(cx, op, s) { cx.reviveFallen(s.enemy, op.pct ?? 0.5); },
  sleepTick(cx, op, s) {
    const e = s.enemy;
    const left = (e.statuses.asleep || 0) - 1;
    if (left > 0) cx.setStatus(e, 'asleep', left);
    else cx.wake(e, { stunned: false });
  },
  guardOffensive(cx, op, s) { cx.guardOffensive(s.enemy); },
};

/** Run an effect list in order against the combat. */
export function runEffects(cx, effects, scope) {
  for (const op of effects || []) {
    if (cx.isLost()) return;
    if (cx.allDead() && !AFTER_WIN.has(op.op)) continue;
    const fn = OPS[op.op];
    if (!fn) throw new Error(`Unknown effect op: ${op.op}`);
    fn(cx, op, scope);
  }
}
