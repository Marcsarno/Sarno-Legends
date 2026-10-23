// CARDS: every card in the game, plus the deck helpers the run layer and UI use. Pure data + small pure functions.
//
// A card definition:
//   { id, name, hero: 'marc'|'yola'|null, type: 'attack'|'skill'|'power'|'status'|'curse',
//     rarity: 'starter'|'common'|'uncommon'|'rare'|'weapon'|'status'|'curse',
//     cost: number | null (null = Unplayable), target: 'enemy'|'none' (inferred from effects),
//     anim: presentation hint (melee_light, melee_heavy, melee_sweep, melee_combo, pistol, pistol_burst, shotgun,
//           block, dodge, heal, buff, debuff, throw, none), clip?: a specific clip the director may prefer,
//     kind: how a kill with this card looks ('light'|'heavy'|'gun'|'blast'),
//     effects: [...] (effects.js mini-language), keywords: ['exhaust','innate','fleeting','retain','unplayable'],
//     up: { cost?, effects? (full replacement), keywords? }   the upgraded (+) version,
//     text?: (v) => html  custom description (text.js passes helpers; otherwise text is generated from effects) }
// A card in a deck is a CardInst { uid, id, up }.
//
// Numbers are Slay the Spire's (see docs/BUILD_SPEC.md section 4); names and text are ours.

import { WEAPONS } from './weapons.js';

export const HEROES = {
  marc: { id: 'marc', name: 'Marc', color: '#c8483a' },
  yola: { id: 'yola', name: 'Yola', color: '#2fa39a' },
};

// effect shorthands (see effects.js for every op)
const D = (n, x = {}) => ({ op: 'damage', n, ...x });
const B = (n, x = {}) => ({ op: 'block', n, ...x });
const A = (status, n, to = 'target') => ({ op: 'apply', status, n, to });
const SELF = (status, n) => ({ op: 'apply', status, n, to: 'self' });
const DRAW = n => ({ op: 'draw', n });
const EN = n => ({ op: 'energy', n });
const HEAL = n => ({ op: 'heal', n });
const LOSE = n => ({ op: 'loseHp', n });
const IF = (cond, then, otherwise) => ({ op: 'if', cond, then, ...(otherwise ? { else: otherwise } : {}) });
// a mid-fight card choice from the hand (combat.js: state.choice + choose(uids)); must be a top-level effect
const CHOOSE = (kind, n = 1, x = {}) => ({ op: 'choose', kind, n, from: 'hand', ...x });

const DEFS = {
  // ---------------------------------------------------------------- starter (11 cards)
  bat_swing: { name: 'Bat Swing', hero: 'marc', type: 'attack', rarity: 'starter', cost: 1, anim: 'melee_light', kind: 'light',
    effects: [D(6)], up: { effects: [D(9)] }, tags: ['bat'] },
  pistol_shot: { name: 'Pistol Shot', hero: 'yola', type: 'attack', rarity: 'starter', cost: 1, anim: 'pistol', kind: 'gun',
    effects: [D(6)], up: { effects: [D(9)] } },
  brace: { name: 'Brace', hero: 'marc', type: 'skill', rarity: 'starter', cost: 1, anim: 'block',
    effects: [B(5)], up: { effects: [B(8)] } },
  sidestep: { name: 'Sidestep', hero: 'yola', type: 'skill', rarity: 'starter', cost: 1, anim: 'dodge',
    effects: [B(5)], up: { effects: [B(8)] } },
  home_run: { name: 'Home Run', hero: 'marc', type: 'attack', rarity: 'starter', cost: 2, anim: 'melee_heavy', kind: 'heavy',
    effects: [D(8), A('vulnerable', 2)], up: { effects: [D(10), A('vulnerable', 3)] } },
  clean_shot: { name: 'Clean Shot', hero: 'yola', type: 'attack', rarity: 'starter', cost: 1, anim: 'pistol', kind: 'gun',
    effects: [D(5, { bonusStaggered: 5 })], up: { effects: [D(7, { bonusStaggered: 7 })] } },

  // ---------------------------------------------------------------- Marc: commons
  crowbar_pry: { name: 'Crowbar Pry', hero: 'marc', type: 'attack', rarity: 'common', cost: 1, anim: 'melee_light', kind: 'light',
    effects: [D(6), A('vulnerable', 1)], up: { effects: [D(8), A('vulnerable', 2)] } },
  shoulder_check: { name: 'Shoulder Check', hero: 'marc', type: 'attack', rarity: 'common', cost: 1, anim: 'melee_light', kind: 'light',
    effects: [B(5), D(5)], up: { effects: [B(7), D(7)] } },
  wild_swing: { name: 'Wild Swing', hero: 'marc', type: 'attack', rarity: 'common', cost: 1, anim: 'melee_sweep', kind: 'light',
    effects: [D(8, { to: 'all' })], up: { effects: [D(11, { to: 'all' })] } },
  heavy_swing: { name: 'Heavy Swing', hero: 'marc', type: 'attack', rarity: 'common', cost: 2, anim: 'melee_heavy', kind: 'heavy',
    effects: [D(14, { scaleStr: 3 })], up: { effects: [D(14, { scaleStr: 5 })] } },
  one_two: { name: 'One-Two', hero: 'marc', type: 'attack', rarity: 'common', cost: 1, anim: 'melee_combo', kind: 'light',
    effects: [D(5, { times: 2 })], up: { effects: [D(7, { times: 2 })] } },
  hold_the_line: { name: 'Hold the Line', hero: 'marc', type: 'skill', rarity: 'common', cost: 1, anim: 'block',
    effects: [B(8), DRAW(1)], up: { effects: [B(11), DRAW(1)] } },
  // Flex (StS +2 / +4 Strength this turn) plus a card, so it is never a dead draw in a hand without multi-hits
  deep_breath: { name: 'Deep Breath', hero: 'marc', type: 'skill', rarity: 'common', cost: 0, anim: 'buff',
    effects: [{ op: 'tempStrength', n: 2 }, DRAW(1)], up: { effects: [{ op: 'tempStrength', n: 4 }, DRAW(1)] } },
  // True Grit (StS 7 / 9). The spin: you pick the card even before the upgrade (StS: random until upgraded)
  tough_it_out: { name: 'Tough It Out', hero: 'marc', type: 'skill', rarity: 'common', cost: 1, anim: 'block',
    effects: [B(7), CHOOSE('exhaust', 1, { prompt: 'Exhaust a card.' })], up: { effects: [B(9), CHOOSE('exhaust', 1, { prompt: 'Exhaust a card.' })] },
    text: v => `Gain ${v.b(0)} ${v.kw('Block')}. ${v.kw('Exhaust')} a card from your hand.` },
  kick_the_door: { name: 'Kick the Door', hero: 'marc', type: 'attack', rarity: 'common', cost: 1, anim: 'melee_light', kind: 'light',
    effects: [D(5), IF('targetStaggered', [EN(1), DRAW(1)])], up: { effects: [D(8), IF('targetStaggered', [EN(1), DRAW(1)])] },
    text: v => `Deal ${v.d(0)} damage. If the zombie is ${v.kw('Staggered')}, gain 1 energy and draw 1 card.` },
  haymaker: { name: 'Haymaker', hero: 'marc', type: 'attack', rarity: 'common', cost: 2, anim: 'melee_heavy', kind: 'heavy',
    effects: [D(12), A('weak', 2)], up: { effects: [D(14), A('weak', 3)] } },
  tackle: { name: 'Tackle', hero: 'marc', type: 'attack', rarity: 'common', cost: 1, anim: 'melee_heavy', kind: 'heavy',
    effects: [D(0, { nFrom: 'block' })], up: { cost: 0 },
    text: v => v.live ? `Deal damage equal to your ${v.kw('Block')} (${v.d(0)}).` : `Deal damage equal to your ${v.kw('Block')}.` },

  // ---------------------------------------------------------------- Marc: uncommons
  batter_up: { name: 'Batter Up', hero: 'marc', type: 'attack', rarity: 'uncommon', cost: 2, anim: 'melee_combo', kind: 'heavy',
    effects: [D(8, { times: 2 }), IF('targetStaggered', [DRAW(1)])], up: { effects: [D(10, { times: 2 }), IF('targetStaggered', [DRAW(1)])] },
    text: v => `Deal ${v.d(0)} damage twice. If the zombie is ${v.kw('Staggered')}, draw 1 card.` },
  overhead_smash: { name: 'Overhead Smash', hero: 'marc', type: 'attack', rarity: 'uncommon', cost: 2, anim: 'melee_heavy', kind: 'heavy',
    effects: [D(14), A('vulnerable', 2)], up: { effects: [D(18), A('vulnerable', 3)] } },
  ground_pound: { name: 'Ground Pound', hero: 'marc', type: 'attack', rarity: 'uncommon', cost: 1, anim: 'melee_heavy', kind: 'heavy',
    effects: [D(4, { to: 'all' }), A('vulnerable', 1, 'all')], up: { effects: [D(7, { to: 'all' }), A('vulnerable', 1, 'all')] },
    text: v => `Deal ${v.d(0)} damage and apply 1 ${v.kw('Staggered')} to ALL zombies.` },
  momentum: { name: 'Momentum', hero: 'marc', type: 'attack', rarity: 'uncommon', cost: 1, anim: 'melee_light', kind: 'light',
    effects: [D(8, { grow: 5 })], up: { effects: [D(8, { grow: 8 })] },
    text: v => `Deal ${v.d(0)} damage. Each play this combat adds ${v.e[0].grow} damage to this card.` },
  dig_in: { name: 'Dig In', hero: 'marc', type: 'skill', rarity: 'uncommon', cost: 2, anim: 'block',
    effects: [{ op: 'doubleBlock' }], up: { cost: 1 },
    text: v => `Double your ${v.kw('Block')}.` },
  // Flame Barrier (StS 12 Block, 4 back / 16, 6): Bulwark's uncommon payoff, Block that hits back
  barbed_wire: { name: 'Barbed Wire', hero: 'marc', type: 'skill', rarity: 'uncommon', cost: 2, anim: 'block',
    effects: [B(12), SELF('barbed', 4)], up: { effects: [B(16), SELF('barbed', 6)] },
    text: v => `Gain ${v.b(0)} ${v.kw('Block')}. Until your next turn, whenever a zombie hits you, it takes ${v.n(v.e[1].n)} damage.` },
  thick_skin: { name: 'Thick Skin', hero: 'marc', type: 'power', rarity: 'uncommon', cost: 1, anim: 'buff',
    effects: [SELF('thick_skin', 3)], up: { effects: [SELF('thick_skin', 4)] },
    text: v => `At the end of your turn, gain ${v.n(v.e[0].n)} ${v.kw('Block')}.` },
  pumped_up: { name: 'Pumped Up', hero: 'marc', type: 'power', rarity: 'uncommon', cost: 1, anim: 'buff',
    effects: [SELF('strength', 2)], up: { effects: [SELF('strength', 3)] } },
  swing_guard: { name: 'Swing Guard', hero: 'marc', type: 'skill', rarity: 'uncommon', cost: 0, anim: 'buff',
    effects: [SELF('swing_guard', 3)], up: { effects: [SELF('swing_guard', 5)] },
    text: v => `This turn, whenever you play an Attack, gain ${v.n(v.e[0].n)} ${v.kw('Block')}.` },
  jaw_breaker: { name: 'Jaw Breaker', hero: 'marc', type: 'attack', rarity: 'uncommon', cost: 2, anim: 'melee_heavy', kind: 'heavy',
    clip: 'hub_execution_B_uppercut',
    effects: [D(13), A('weak', 1), A('vulnerable', 1)], up: { effects: [D(13), A('weak', 2), A('vulnerable', 2)] } },
  wrench_arm: { name: 'Wrench Arm', hero: 'marc', type: 'skill', rarity: 'uncommon', cost: 1, anim: 'debuff', keywords: ['exhaust'],
    effects: [A('strength', -2)], up: { effects: [A('strength', -3)] },
    text: v => `The zombie loses ${v.n(-v.e[0].n)} ${v.kw('Strength')}.` },
  grit_teeth: { name: 'Grit Teeth', hero: 'marc', type: 'skill', rarity: 'uncommon', cost: 0, anim: 'buff',
    effects: [LOSE(3), EN(2)], up: { effects: [LOSE(3), EN(3)] } },

  // ---------------------------------------------------------------- Marc: rares
  berserker: { name: 'Berserker', hero: 'marc', type: 'power', rarity: 'rare', cost: 3, anim: 'buff',
    effects: [SELF('berserker', 2)], up: { effects: [SELF('berserker', 3)] },
    text: v => `At the start of your turn, gain ${v.n(v.e[0].n)} ${v.kw('Strength')}.` },
  grand_slam: { name: 'Grand Slam', hero: 'marc', type: 'attack', rarity: 'rare', cost: 3, anim: 'melee_heavy', kind: 'heavy',
    effects: [D(32)], up: { effects: [D(42)] } },
  bolt_the_door: { name: 'Bolt the Door', hero: 'marc', type: 'skill', rarity: 'rare', cost: 2, anim: 'block', keywords: ['exhaust'],
    effects: [B(30)], up: { effects: [B(40)] } },
  fortify: { name: 'Fortify', hero: 'marc', type: 'power', rarity: 'rare', cost: 3, anim: 'buff',
    effects: [SELF('fortify', 1)], up: { cost: 2 },
    text: v => `${v.kw('Block')} is no longer removed at the start of your turn.` },
  // Juggernaut (StS 5 / 7): the Bulwark payoff
  battering_ram: { name: 'Battering Ram', hero: 'marc', type: 'power', rarity: 'rare', cost: 2, anim: 'buff',
    effects: [SELF('battering_ram', 5)], up: { effects: [SELF('battering_ram', 7)] },
    text: v => `Whenever you gain ${v.kw('Block')}, deal ${v.n(v.e[0].n)} damage to a random zombie.` },
  make_it_count: { name: 'Make It Count', hero: 'marc', type: 'attack', rarity: 'rare', cost: 1, anim: 'melee_heavy', kind: 'heavy', keywords: ['exhaust'],
    effects: [D(10, { onKill: [{ op: 'maxHp', n: 3 }] })], up: { effects: [D(12, { onKill: [{ op: 'maxHp', n: 4 }] })] },
    text: v => `Deal ${v.d(0)} damage. If this kills, raise your Max HP by ${v.n(v.e[0].onKill[0].n)}.` },
  rally: { name: 'Rally', hero: 'marc', type: 'skill', rarity: 'rare', cost: 1, anim: 'buff', keywords: ['exhaust'],
    effects: [{ op: 'doubleStatus', status: 'strength' }], up: { keywords: [] },
    text: v => `Double your ${v.kw('Strength')}.` },

  // ---------------------------------------------------------------- Yola: commons
  // was 4 x2 (a weaker Twin Strike than Marc's One-Two): now a two-shot cash-in, 6 plain / 18 on a Staggered zombie
  double_tap: { name: 'Double Tap', hero: 'yola', type: 'attack', rarity: 'common', cost: 1, anim: 'pistol_burst', kind: 'gun',
    effects: [D(3, { times: 2, bonusStaggered: 3 })], up: { effects: [D(4, { times: 2, bonusStaggered: 4 })] } },
  aimed_shot: { name: 'Aimed Shot', hero: 'yola', type: 'attack', rarity: 'common', cost: 1, anim: 'pistol', kind: 'gun',
    effects: [D(8), IF('targetStaggered', [DRAW(1)])], up: { effects: [D(11), IF('targetStaggered', [DRAW(1)])] },
    text: v => `Deal ${v.d(0)} damage. If the zombie is ${v.kw('Staggered')}, draw 1 card.` },
  // Sucker Punch (StS 7, 1 Weak / 9, 2); was 6 / 8
  kneecap: { name: 'Kneecap', hero: 'yola', type: 'attack', rarity: 'common', cost: 1, anim: 'pistol', kind: 'gun',
    effects: [D(7), A('weak', 1)], up: { effects: [D(9), A('weak', 2)] } },
  suppressing_fire: { name: 'Suppressing Fire', hero: 'yola', type: 'attack', rarity: 'common', cost: 1, anim: 'pistol_burst', kind: 'gun',
    effects: [D(3, { to: 'all' }), A('weak', 1, 'all')], up: { effects: [D(5, { to: 'all' }), A('weak', 1, 'all')] },
    text: v => `Deal ${v.d(0)} damage and apply 1 ${v.kw('Weakened')} to ALL zombies.` },
  cover_him: { name: 'Cover Him', hero: 'yola', type: 'skill', rarity: 'common', cost: 1, anim: 'dodge',
    effects: [B(7), IF('anyStaggered', [DRAW(1)])], up: { effects: [B(10), IF('anyStaggered', [DRAW(1)])] },
    text: v => `Gain ${v.b(0)} ${v.kw('Block')}. If any zombie is ${v.kw('Staggered')}, draw 1 card.` },
  tuck_and_roll: { name: 'Tuck and Roll', hero: 'yola', type: 'skill', rarity: 'common', cost: 1, anim: 'dodge', clip: 'ual1_Roll',
    effects: [B(5), DRAW(2)], up: { effects: [B(8), DRAW(2)] } },
  // Prepared-style filter with the in-fight choice (was 2 Block + draw 1 while the engine had no choice step)
  check_mag: { name: 'Check the Mag', hero: 'yola', type: 'skill', rarity: 'common', cost: 0, anim: 'buff', clip: 'pistol_reload',
    effects: [DRAW(2), CHOOSE('discard', 1, { prompt: 'Discard a card.' })], up: { effects: [DRAW(3), CHOOSE('discard', 2, { prompt: 'Discard 2 cards.' })] },
    text: v => `Draw ${v.n(v.e[0].n)} cards. Discard ${v.e[1].n === 1 ? 'a card' : v.n(v.e[1].n) + ' cards'}.` },
  // Equilibrium's idea at common size, with the choice: keep the cash-in for the turn Marc staggers
  wait_for_it: { name: 'Wait for It', hero: 'yola', type: 'skill', rarity: 'common', cost: 1, anim: 'dodge',
    effects: [B(6), CHOOSE('retain', 2, { optional: true, prompt: 'Retain up to 2 cards.' })],
    up: { effects: [B(9), CHOOSE('retain', 2, { optional: true, prompt: 'Retain up to 2 cards.' })] },
    text: v => `Gain ${v.b(0)} ${v.kw('Block')}. ${v.kw('Retain')} up to 2 cards in your hand this turn.` },
  // was 1 Weakened to ALL: 2 turns of Weakened is what makes a 1-energy defensive Skill worth a slot
  flare: { name: 'Flare', hero: 'yola', type: 'skill', rarity: 'common', cost: 1, anim: 'throw',
    effects: [A('weak', 2, 'all'), DRAW(1)], up: { effects: [A('weak', 3, 'all'), DRAW(1)] } },
  // was 3 / 5. A free shot measured strong already (docs/BALANCE.md card values); 4 / 7 reads less like filler
  quick_shot: { name: 'Quick Shot', hero: 'yola', type: 'attack', rarity: 'common', cost: 0, anim: 'pistol', kind: 'gun',
    effects: [D(4)], up: { effects: [D(7)] } },
  cheap_shot: { name: 'Cheap Shot', hero: 'yola', type: 'attack', rarity: 'common', cost: 0, anim: 'pistol', kind: 'gun',
    effects: [D(3, { bonusStaggered: 4 })], up: { effects: [D(4, { bonusStaggered: 6 })] } },

  // ---------------------------------------------------------------- Yola: uncommons
  headshot: { name: 'Headshot', hero: 'yola', type: 'attack', rarity: 'uncommon', cost: 2, anim: 'pistol', kind: 'gun',
    effects: [D(10, { bonusStaggered: 10 })], up: { effects: [D(13, { bonusStaggered: 13 })] } },
  // Bandage Up (StS 0 cost, heal 4 / 6); was 1 energy
  triage: { name: 'Triage', hero: 'yola', type: 'skill', rarity: 'uncommon', cost: 0, anim: 'heal', keywords: ['exhaust'],
    effects: [HEAL(4)], up: { effects: [HEAL(6)] } },
  adrenaline_shot: { name: 'Adrenaline Shot', hero: 'yola', type: 'skill', rarity: 'uncommon', cost: 0, anim: 'buff', keywords: ['exhaust'],
    effects: [EN(1), DRAW(1)], up: { effects: [EN(2), DRAW(1)] } },
  marksman: { name: 'Marksman', hero: 'yola', type: 'power', rarity: 'uncommon', cost: 1, anim: 'buff',
    effects: [SELF('marksman', 3)], up: { effects: [SELF('marksman', 4)] },
    text: v => `Your attacks deal ${v.n(v.e[0].n)} more damage to ${v.kw('Staggered')} zombies.` },
  spray_and_pray: { name: 'Spray and Pray', hero: 'yola', type: 'attack', rarity: 'uncommon', cost: 1, anim: 'pistol_burst', kind: 'gun',
    effects: [D(3, { to: 'random', times: 3 })], up: { effects: [D(3, { to: 'random', times: 4 })] } },
  painkillers: { name: 'Painkillers', hero: 'yola', type: 'power', rarity: 'uncommon', cost: 1, anim: 'buff',
    effects: [SELF('dexterity', 2)], up: { effects: [SELF('dexterity', 3)] } },
  light_on_feet: { name: 'Light on Feet', hero: 'yola', type: 'power', rarity: 'uncommon', cost: 1, anim: 'buff',
    effects: [SELF('light_feet', 2)], up: { effects: [SELF('light_feet', 3)] }, // was 1 / 2 (Feel No Pain's 3 / 4 for a narrower trigger)
    text: v => `Whenever you play a Skill, gain ${v.n(v.e[0].n)} ${v.kw('Block')}.` },
  triple_tap: { name: 'Triple Tap', hero: 'yola', type: 'attack', rarity: 'uncommon', cost: 2, anim: 'pistol_burst', kind: 'gun',
    effects: [D(4, { times: 3, bonusStaggered: 2 })], up: { effects: [D(5, { times: 3, bonusStaggered: 3 })] } },
  covering_fire: { name: 'Covering Fire', hero: 'yola', type: 'attack', rarity: 'uncommon', cost: 1, anim: 'pistol_burst', kind: 'gun',
    effects: [D(4, { to: 'all' }), B(4)], up: { effects: [D(6, { to: 'all' }), B(6)] } },

  // ---------------------------------------------------------------- Yola: rares
  clean_kill: { name: 'Clean Kill', hero: 'yola', type: 'attack', rarity: 'rare', cost: 1, anim: 'pistol', kind: 'gun',
    effects: [D(9, { onKill: [EN(1), DRAW(2)] })], up: { effects: [D(12, { onKill: [EN(1), DRAW(2)] })] },
    text: v => `Deal ${v.d(0)} damage. If this kills, gain 1 energy and draw 2 cards.` },
  overdrive: { name: 'Overdrive', hero: 'yola', type: 'skill', rarity: 'rare', cost: 0, anim: 'buff', keywords: ['exhaust'],
    effects: [LOSE(6), EN(2), DRAW(3)], up: { effects: [LOSE(6), EN(2), DRAW(5)] } },
  slow_motion: { name: 'Slow Motion', hero: 'yola', type: 'skill', rarity: 'rare', cost: 3, anim: 'buff', keywords: ['exhaust'],
    effects: [{ op: 'slowMotion' }], up: { cost: 2 },
    text: v => `Cards in your hand cost 0 this turn. You can't draw more cards this turn.` },
  dead_eye: { name: 'Dead Eye', hero: 'yola', type: 'power', rarity: 'rare', cost: 1, anim: 'buff',
    effects: [SELF('dead_eye', 2)], up: { cost: 0 },
    text: v => `The first ${v.n(v.e[0].n)} Attacks you play each turn on a ${v.kw('Staggered')} zombie draw a card.` },
  defibrillator: { name: 'Defibrillator', hero: 'yola', type: 'skill', rarity: 'rare', cost: 2, anim: 'heal', keywords: ['exhaust'],
    effects: [HEAL(12)], up: { effects: [HEAL(16)] } },
  point_blank: { name: 'Point Blank', hero: 'yola', type: 'attack', rarity: 'rare', cost: 2, anim: 'pistol', kind: 'gun',
    effects: [D(16, { bonusStaggered: 10 })], up: { effects: [D(20, { bonusStaggered: 14 })] } },

  // ---------------------------------------------------------------- weapon swaps (starter deck changes from the Armory)
  // Nail Swing 6 (was 5 in BUILD_SPEC): the sim had the 80-scrap Nail Bat weaker than the free Wood Bat (docs/BALANCE.md)
  nail_swing: { name: 'Nail Swing', hero: 'marc', type: 'attack', rarity: 'weapon', cost: 1, anim: 'melee_light', kind: 'light',
    effects: [D(6), A('bleed', 2)], up: { effects: [D(8), A('bleed', 3)] }, tags: ['bat'] },
  barbed_swing: { name: 'Barbed Swing', hero: 'marc', type: 'attack', rarity: 'weapon', cost: 1, anim: 'melee_light', kind: 'light',
    effects: [D(6), A('bleed', 2)], up: { effects: [D(8), A('bleed', 3)] }, tags: ['bat'] },
  pry_loose: { name: 'Pry Loose', hero: 'marc', type: 'attack', rarity: 'weapon', cost: 2, anim: 'melee_heavy', kind: 'heavy', clip: 'hub_crowbar_combo',
    effects: [D(9), A('vulnerable', 2), DRAW(1)], up: { effects: [D(12), A('vulnerable', 3), DRAW(1)] } },
  chop_block: { name: 'Chop Block', hero: 'marc', type: 'attack', rarity: 'weapon', cost: 1, anim: 'melee_heavy', kind: 'heavy',
    effects: [D(6), B(4)], up: { effects: [D(8), B(6)] } },
  // Sledge 18 (was 14 in BUILD_SPEC): with the turn-1 energy loss the 350-scrap Sledgehammer simmed below the free bat
  sledge: { name: 'Sledge', hero: 'marc', type: 'attack', rarity: 'weapon', cost: 2, anim: 'melee_heavy', kind: 'heavy',
    effects: [D(18), A('vulnerable', 3)], up: { effects: [D(22), A('vulnerable', 4)] } },
  buckshot: { name: 'Buckshot', hero: 'yola', type: 'attack', rarity: 'weapon', cost: 1, anim: 'shotgun', kind: 'blast',
    effects: [D(4, { to: 'all' })], up: { effects: [D(6, { to: 'all' })] } },
  both_barrels: { name: 'Both Barrels', hero: 'yola', type: 'attack', rarity: 'weapon', cost: 2, anim: 'shotgun', kind: 'blast',
    effects: [D(7, { times: 2, bonusStaggered: 4 })], up: { effects: [D(9, { times: 2, bonusStaggered: 5 })] } },

  // ---------------------------------------------------------------- status and curse cards (no hero)
  panic: { name: 'Panic', hero: null, type: 'status', rarity: 'status', cost: null, anim: 'none', keywords: ['unplayable', 'fleeting'],
    effects: [], upgradable: false },
  bile: { name: 'Bile', hero: null, type: 'status', rarity: 'status', cost: 1, anim: 'none', keywords: ['exhaust'],
    effects: [], upgradable: false, text: v => `Does nothing. ${v.kw('Exhaust')}.` },
  infection: { name: 'Infection', hero: null, type: 'curse', rarity: 'curse', cost: null, anim: 'none', keywords: ['unplayable'],
    effects: [], upgradable: false, endOfTurnInHand: [{ op: 'loseHp', n: 1 }],
    text: v => `${v.kw('Unplayable')}. At the end of your turn, if this is in your hand, lose 1 HP.` },
};

// ---------------------------------------------------------------- finalize: ids, defaults, inferred targets

function needsTarget(effects) {
  for (const e of effects || []) {
    if (e.op === 'damage' && (e.to || 'target') === 'target') return true;
    if (e.op === 'apply' && (e.to || 'target') === 'target') return true;
    if (e.op === 'if' && (needsTarget(e.then) || needsTarget(e.else))) return true;
  }
  return false;
}

for (const [id, c] of Object.entries(DEFS)) {
  c.id = id;
  c.keywords = c.keywords || [];
  c.tags = c.tags || [];
  c.kind = c.kind || (c.type === 'attack' ? 'light' : null);
  c.up = c.up || {};
  if (c.upgradable === undefined) c.upgradable = true;
  c.target = c.target || (needsTarget(c.effects) ? 'enemy' : 'none');
  if (c.cost === null && !c.keywords.includes('unplayable')) c.keywords.push('unplayable');
}

export const CARDS = DEFS;

export const STARTER = ['bat_swing', 'bat_swing', 'bat_swing', 'pistol_shot', 'pistol_shot', 'brace', 'brace', 'sidestep', 'sidestep', 'home_run', 'clean_shot'];

// ---------------------------------------------------------------- instance helpers

const viewCache = new Map();

/**
 * The resolved definition for a card instance (or id): upgrade applied, name with "+".
 * -> { ...def, name, cost, effects, keywords, target, up: bool }
 */
export function cardView(instOrId, up) {
  const id = typeof instOrId === 'string' ? instOrId : instOrId.id;
  const isUp = typeof instOrId === 'string' ? !!up : !!instOrId.up;
  const key = id + (isUp ? '+' : '');
  let v = viewCache.get(key);
  if (v) return v;
  const def = CARDS[id];
  if (!def) throw new Error(`Unknown card: ${id}`);
  v = { ...def, base: def, up: isUp };
  if (isUp) {
    v.name = def.name + '+';
    if (def.up.cost !== undefined) v.cost = def.up.cost;
    if (def.up.effects) v.effects = def.up.effects;
    if (def.up.keywords) v.keywords = def.up.keywords;
    v.target = needsTarget(v.effects) ? 'enemy' : (def.target === 'enemy' ? 'enemy' : 'none');
  }
  viewCache.set(key, v);
  return v;
}

export const cardDef = id => CARDS[id];
/** Printed cost (null = Unplayable). Combat has its own current cost on each hand card. */
export const cardCost = inst => cardView(inst).cost;
export const isUpgradable = inst => !!CARDS[inst.id]?.upgradable && !inst.up;
export const hasKeyword = (inst, kw) => cardView(inst).keywords.includes(kw);

/** Upgrades in place and returns the same instance (so both `upgradeCard(c)` and `deck[i] = upgradeCard(deck[i])` work). */
export function upgradeCard(inst) {
  if (isUpgradable(inst)) inst.up = true;
  return inst;
}

let uidCounter = 0;
/** Next card uid ('c12'). Pass the current deck to continue after its highest uid (after loading a save). */
export function newUid(existing) {
  if (existing) syncUids(existing);
  uidCounter += 1;
  return 'c' + uidCounter;
}
/** Make sure future uids don't collide with these cards (call after loading a save). */
export function syncUids(cards) {
  for (const c of cards || []) {
    const m = /^c(\d+)$/.exec(c?.uid || '');
    if (m) uidCounter = Math.max(uidCounter, Number(m[1]));
  }
}

export function makeCard(id, up = false, existing) {
  if (!CARDS[id]) throw new Error(`Unknown card: ${id}`);
  return { uid: newUid(existing), id, up: !!up };
}

/**
 * The 11-card starter deck with the equipped weapons' card swaps.
 * weapons = { marc: 'wood_bat', yola: 'pistol' } -> CardInst[] with uids c1..c11 (fresh numbering per run).
 */
export function makeStarterDeck(weapons = {}) {
  const ids = STARTER.slice();
  for (const hero of ['marc', 'yola']) {
    const w = WEAPONS[weapons[hero]];
    if (!w) continue;
    for (const swap of w.swaps || []) {
      let left = swap.count ?? Infinity;
      for (let i = 0; i < ids.length && left > 0; i++) {
        if (ids[i] === swap.from) { ids[i] = swap.to; left--; }
      }
    }
  }
  uidCounter = 0;
  return ids.map(id => ({ uid: newUid(), id, up: false }));
}

/**
 * Reward-eligible card ids. hero: 'marc' | 'yola' | undefined (both). rarity: 'common'|'uncommon'|'rare'|undefined.
 */
export function cardPool({ hero, rarity } = {}) {
  return Object.values(CARDS)
    .filter(c => ['common', 'uncommon', 'rare'].includes(c.rarity))
    .filter(c => !hero || hero === 'any' || c.hero === hero)
    .filter(c => !rarity || c.rarity === rarity)
    .map(c => c.id);
}

export const isAttack = inst => cardView(inst).type === 'attack';
export const isSkill = inst => cardView(inst).type === 'skill';
