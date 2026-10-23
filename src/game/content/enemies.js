// ENEMIES: the act-1 zombies. Each is a Slay the Spire act-1 template (A0 numbers) in a hospital skin.
// Pure data + small functions; combat.js runs them.
//
// An enemy definition:
//   { id, name, model (GLB key in public/assets/models), scale, size: 'small'|'medium'|'large', tier: 'normal'|'elite'|'boss',
//     hp: [min, max], moves: { moveId: { name, intent, anim, effects } },
//     ai(ai) -> moveId                      picks the next move (called when intents roll)
//     onSpawn?(ctx, e)                      set starting statuses / per-zombie numbers (e.vars)
//     onHpLost?(ctx, e, amount)             it just lost HP (Sleeping Patient wakes, Shield Guard counts to its mode shift)
//     onDeath?(ctx, e)                      Bloater's spore burst }
// Move effects are relative to the zombie: damage hits the party, block/'self' statuses go on the zombie,
// apply to 'party' debuffs the heroes. n may be a function of the zombie (e => e.vars.bite).
// intent types (icons.js draws 'intent_<type>'): see INTENT_TYPES.
// The ai helper: { e, rng, turn, history, last(), lastMove(id), lastTwo(id), first, roll() 0..99, chance(p),
//                  allies (other living zombies), dead (dead zombies of this fight), slot (0-based order in the fight) }

export const INTENT_TYPES = {
  attack:        'Attack',
  attack_block:  'Attack and Block',
  attack_debuff: 'Attack and Debuff',
  attack_buff:   'Attack and Buff',
  block:         'Block',
  buff:          'Buff',
  block_buff:    'Block and Buff',
  debuff:        'Debuff',
  heal:          'Heal',
  sleep:         'Sleeping',
  stun:          'Stunned',
  unknown:       'Unknown',
};

const hit = (n, times) => ({ op: 'damage', n, ...(times ? { times } : {}) });
const guard = n => ({ op: 'block', n });
const buff = (status, n) => ({ op: 'apply', status, n, to: 'self' });
const debuff = (status, n) => ({ op: 'apply', status, n, to: 'party' });

const louseSpawn = (ctx, e) => {
  e.vars.bite = ctx.rng.range(5, 7);
  e.statuses.hunch = ctx.rng.range(3, 7);
};

export const ENEMIES = {
  // ---------------------------------------------------------------- normal
  shambler: { // Jaw Worm
    name: 'Shambler', model: 'z_romero', scale: 1, size: 'medium', tier: 'normal', hp: [40, 44],
    moves: {
      bite_down: { name: 'Bite Down', intent: 'attack',       anim: 'melee_heavy', effects: [hit(11)] },
      shamble:   { name: 'Shamble',   intent: 'attack_block', anim: 'melee_light', effects: [hit(7), guard(5)] },
      groan:     { name: 'Groan',     intent: 'block_buff',   anim: 'buff',        effects: [buff('strength', 3), guard(6)] },
    },
    ai(ai) {
      if (ai.first) return 'bite_down';
      const n = ai.roll();
      if (n < 25) return ai.lastMove('bite_down') ? (ai.chance(0.5625) ? 'groan' : 'shamble') : 'bite_down';
      if (n < 55) return ai.lastTwo('shamble') ? (ai.chance(0.357) ? 'bite_down' : 'groan') : 'shamble';
      return ai.lastMove('groan') ? (ai.chance(0.416) ? 'bite_down' : 'shamble') : 'groan';
    },
  },

  biter: { // Red Louse
    name: 'Biter', model: 'z_patient', scale: 0.92, size: 'small', tier: 'normal', hp: [10, 15],
    moves: {
      bite: { name: 'Bite', intent: 'attack', anim: 'melee_light', effects: [hit(e => e.vars.bite)] },
      grow: { name: 'Grow', intent: 'buff',   anim: 'buff',        effects: [buff('strength', 3)] },
    },
    onSpawn: louseSpawn,
    ai(ai) {
      const n = ai.roll();
      if (n < 25) return ai.lastTwo('grow') ? 'bite' : 'grow';
      return ai.lastTwo('bite') ? 'grow' : 'bite';
    },
  },

  spitter: { // Green Louse
    name: 'Spitter', model: 'z_patient_mod', scale: 0.92, size: 'small', tier: 'normal', hp: [11, 17],
    moves: {
      bite: { name: 'Bite', intent: 'attack', anim: 'melee_light', effects: [hit(e => e.vars.bite)] },
      spit: { name: 'Spit', intent: 'debuff', anim: 'throw',       effects: [debuff('weak', 2)] },
    },
    onSpawn: louseSpawn,
    ai(ai) {
      const n = ai.roll();
      if (n < 25) return ai.lastTwo('spit') ? 'bite' : 'spit';
      return ai.lastTwo('bite') ? 'spit' : 'bite';
    },
  },

  screamer: { // Cultist
    name: 'Screamer', model: 'z_girl', scale: 1, size: 'medium', tier: 'normal', hp: [48, 54],
    moves: {
      shriek: { name: 'Shriek', intent: 'buff',   anim: 'buff',        effects: [buff('ritual', 3)] },
      claw:   { name: 'Claw',   intent: 'attack', anim: 'melee_light', effects: [hit(6)] },
    },
    ai(ai) { return ai.first ? 'shriek' : 'claw'; },
  },

  sprinter: { // Sneaky Gremlin
    name: 'Sprinter', model: 'z_sprinter', scale: 1, size: 'medium', tier: 'normal', hp: [10, 14],
    moves: {
      lunge: { name: 'Lunge', intent: 'attack', anim: 'melee_heavy', effects: [hit(9)] },
    },
    ai() { return 'lunge'; },
  },

  nurse: { // Darkling's revive, simplified
    name: 'Nurse', model: 'z_nurse', scale: 1, size: 'medium', tier: 'normal', hp: [28, 32],
    moves: {
      jab:    { name: 'Jab',    intent: 'attack', anim: 'melee_light', effects: [hit(6)] },
      mend:   { name: 'Mend',   intent: 'heal',   anim: 'buff',        effects: [{ op: 'healAllies', n: 5 }, guard(6)] },
      revive: { name: 'Revive', intent: 'buff',   anim: 'buff',        effects: [{ op: 'revive', pct: 0.5 }] },
    },
    onSpawn(ctx, e) { e.vars.revives = 0; },
    ai(ai) {
      if (ai.dead.length && ai.e.vars.revives < 2) return 'revive';
      const lastCare = [...ai.history].reverse().find(m => m === 'jab' || m === 'mend');
      return lastCare === 'jab' ? 'mend' : 'jab';
    },
  },

  bloater: { // Fungi Beast
    name: 'Bloater', model: 'z_scrubs', scale: 1.05, size: 'medium', tier: 'normal', hp: [22, 28],
    moves: {
      bite: { name: 'Bite', intent: 'attack', anim: 'melee_light', effects: [hit(6)] },
      grow: { name: 'Swell', intent: 'buff',  anim: 'buff',        effects: [buff('strength', 3)] },
    },
    onDeath(ctx, e) {
      if (!ctx.alive().length) return; // the fight is already won
      ctx.enemyMove(e, 'spore_burst', 'Spore Burst', 'debuff');
      ctx.applyParty('vulnerable', 2, { source: e.uid });
    },
    deathText: 'When it dies, it bursts: the party gets 2 Staggered.',
    ai(ai) {
      const n = ai.roll();
      if (n < 60) return ai.lastTwo('bite') ? 'grow' : 'bite';
      return ai.lastMove('grow') ? 'bite' : 'grow';
    },
  },

  // ---------------------------------------------------------------- elites
  big_walker: { // Gremlin Nob
    name: 'Big Walker', model: 'z_brute', scale: 1.3, size: 'large', tier: 'elite', hp: [82, 86],
    moves: {
      roar:     { name: 'Roar',     intent: 'buff',          anim: 'buff',        effects: [buff('enrage', 2)] },
      charge:   { name: 'Charge',   intent: 'attack',        anim: 'melee_heavy', effects: [hit(14)] },
      headbutt: { name: 'Headbutt', intent: 'attack_debuff', anim: 'melee_heavy', effects: [hit(6), debuff('vulnerable', 2)] },
    },
    ai(ai) {
      if (ai.first) return 'roar';
      if (ai.roll() < 33) return 'headbutt';
      return ai.lastTwo('charge') ? 'headbutt' : 'charge';
    },
  },

  sleeping_patient: { // Lagavulin
    name: 'Sleeping Patient', model: 'z_patient', scale: 1.15, size: 'large', tier: 'elite', hp: [109, 111],
    pose: 'lying', anims: { sleep: 'ual_IdleToLay', wake: 'ual_LayToIdle' },
    moves: {
      sleep:   { name: 'Sleeping', intent: 'sleep',  anim: 'none',        effects: [{ op: 'sleepTick' }] },
      stunned: { name: 'Stunned',  intent: 'stun',   anim: 'none',        effects: [] },
      flail:   { name: 'Flail',    intent: 'attack', anim: 'melee_heavy', effects: [hit(18)] },
      drain:   { name: 'Drain',    intent: 'debuff', anim: 'debuff',      effects: [debuff('strength', -1), debuff('dexterity', -1)] },
    },
    onSpawn(ctx, e) {
      e.statuses.asleep = 3;
      e.statuses.plating = 8;
      e.block = 8;
    },
    onHpLost(ctx, e) {
      if ((e.statuses.asleep || 0) > 0) ctx.wake(e, { stunned: true });
    },
    ai(ai) {
      if ((ai.e.statuses.asleep || 0) > 0) return 'sleep';
      const awake = ai.history.filter(m => m !== 'sleep' && m !== 'stunned').length;
      return ['flail', 'flail', 'drain'][awake % 3];
    },
  },

  orderly: { // Sentry
    name: 'Orderly', model: 'z_scrubs', scale: 1, size: 'medium', tier: 'elite', hp: [38, 42],
    moves: {
      shove: { name: 'Shove', intent: 'debuff', anim: 'melee_light', effects: [{ op: 'addCard', id: 'panic', n: 2, to: 'discard' }] },
      swipe: { name: 'Swipe', intent: 'attack', anim: 'melee_heavy', effects: [hit(9)] },
    },
    onSpawn(ctx, e) { e.statuses.immune = 1; },
    ai(ai) {
      if (ai.first) return ai.slot % 2 === 0 ? 'shove' : 'swipe';
      return ai.lastMove('swipe') ? 'shove' : 'swipe';
    },
  },

  // ---------------------------------------------------------------- boss
  shield_guard: { // The Guardian
    name: 'Shield Guard', model: 'z_guard', scale: 1.25, size: 'large', tier: 'boss', hp: [240, 240],
    moves: {
      raise_shield:  { name: 'Raise Shield',  intent: 'block',  anim: 'block',       effects: [guard(9)] },
      shield_bash:   { name: 'Shield Bash',   intent: 'attack', anim: 'melee_heavy', clip: 'shield_bash', effects: [hit(32)] },
      pepper_spray:  { name: 'Pepper Spray',  intent: 'debuff', anim: 'debuff',      effects: [debuff('weak', 2), debuff('vulnerable', 2)] },
      baton_flurry:  { name: 'Baton Flurry',  intent: 'attack', anim: 'melee_combo', effects: [hit(5, 4)] },
      shield_wall:   { name: 'Shield Wall',   intent: 'buff',   anim: 'block',       effects: [buff('thorns', 3)] },
      shield_charge: { name: 'Shield Charge', intent: 'attack', anim: 'melee_heavy', clip: 'shield_dash', effects: [hit(9)] },
      double_slam:   { name: 'Double Slam',   intent: 'attack', anim: 'melee_heavy', clip: 'slam', effects: [hit(8, 2), { op: 'guardOffensive' }] },
    },
    onSpawn(ctx, e) {
      e.vars.mode = 'offensive';
      e.vars.shifts = 0;
      e.statuses.mode_shift = 30;
    },
    onHpLost(ctx, e, amount) {
      if (e.vars.mode !== 'offensive' || !e.statuses.mode_shift) return;
      const left = e.statuses.mode_shift - amount;
      if (left > 0) { ctx.setStatus(e, 'mode_shift', left); return; }
      // Mode shift: the shield comes up (the arm moment in presentation, first time only)
      ctx.setStatus(e, 'mode_shift', 0);
      e.vars.mode = 'defensive';
      e.vars.shifts += 1;
      ctx.emit({ t: 'mode_shift', uid: e.uid, mode: 'defensive', first: e.vars.shifts === 1 });
      ctx.enemyBlock(e, 20);
      ctx.setIntent(e, 'shield_wall');
    },
    ai(ai) {
      const last = ai.last();
      if (ai.e.vars.mode === 'defensive') {
        if (last === 'shield_wall') return 'shield_charge';
        if (last === 'shield_charge') return 'double_slam';
        return 'shield_wall';
      }
      if (last === 'double_slam') return 'baton_flurry';
      const cycle = ['raise_shield', 'shield_bash', 'pepper_spray', 'baton_flurry'];
      return cycle[(cycle.indexOf(last) + 1) % cycle.length];
    },
  },
};

for (const [id, e] of Object.entries(ENEMIES)) {
  e.id = id;
  for (const [mid, m] of Object.entries(e.moves)) m.id = mid;
}

/**
 * A zombie's hit with its infection-level bonus (enemy.dmgUp = { flat, pct }, set by combat.js at spawn):
 * n + flat + ceil(n * pct). Level 0 zombies have no dmgUp and hit for n.
 */
export function scaleHit(n, enemy) {
  const up = enemy?.dmgUp;
  if (!up || !(n > 0)) return n;
  return n + (up.flat || 0) + Math.ceil(n * (up.pct || 0) - 1e-9);
}

/** The first damage op of a move -> { damage (base per hit, for this zombie, infection level included), hits }, or null. */
export function moveDamage(move, enemy) {
  for (const op of move.effects || []) {
    if (op.op === 'damage') {
      const n = typeof op.n === 'function' ? op.n(enemy) : op.n;
      return { damage: scaleHit(n, enemy), hits: op.times || 1 };
    }
  }
  return null;
}
