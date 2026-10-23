// STATUSES: every buff, debuff and power a party or zombie can carry. Pure data.
// id = the engine name (Slay the Spire's rule it copies); name = what the player sees.
// kind:   'buff' | 'debuff' | 'power' (the party's played powers) | 'special'
// stack:  'turns'     ticks down by 1 at the end of each round, after the zombies' turn (Staggered, Weakened, Shaken);
//                     one an enemy put on the party during the zombies' turn skips that round's tick (Slay the Spire)
//         'intensity' a number that only changes through effects (Strength, Bleed...)
//         'counter'   counts down toward something (Asleep, Shield Up)
// negative: true when the amount may go below 0 (Strength, Agility); the sign decides buff vs debuff.
// text: tooltip text; {n} is the amount. text.js (describeStatus) renders it.
// icon: the icons.js glyph name (the UI kit draws them; an unknown name shows a neutral dot).
// hidden: engine bookkeeping that the HUD shouldn't draw.

export const STATUSES = {
  vulnerable:    { name: 'Staggered',     kind: 'debuff', stack: 'turns',     color: '#e3863b', text: 'Takes 50% more damage from attacks. {n} turn(s).' },
  weak:          { name: 'Weakened',      kind: 'debuff', stack: 'turns',     color: '#9a8fb8', text: 'Deals 25% less damage with attacks. {n} turn(s).' },
  frail:         { name: 'Shaken',        kind: 'debuff', stack: 'turns',     color: '#8fa7b8', text: 'Gains 25% less Block from cards. {n} turn(s).' },
  strength:      { name: 'Strength',      kind: 'buff',   stack: 'intensity', color: '#d9543f', negative: true, text: 'Attacks deal {n} more damage per hit.', textNeg: 'Attacks deal {n} less damage per hit.' },
  dexterity:     { name: 'Agility',       kind: 'buff',   stack: 'intensity', color: '#4fb3a9', negative: true, text: 'Gains {n} more Block from cards.', textNeg: 'Gains {n} less Block from cards.' },
  bleed:         { name: 'Bleed',         kind: 'debuff', stack: 'intensity', color: '#b3192b', text: 'At the start of its turn, loses {n} HP, then Bleed goes down by 1.' },
  ritual:        { name: 'Frenzy',        kind: 'buff',   stack: 'intensity', color: '#c23b5a', text: 'At the end of its turn, gains {n} Strength.' },
  plating:       { name: 'Plating',       kind: 'buff',   stack: 'intensity', color: '#9fb0b8', text: 'At the end of its turn, gains {n} Block.' },
  thorns:        { name: 'Spiked',        kind: 'buff',   stack: 'intensity', color: '#c9a14a', text: 'Whenever you play an Attack, you take {n} damage.' },
  enrage:        { name: 'Rage',          kind: 'buff',   stack: 'intensity', color: '#e0442e', text: 'Whenever you play a Skill, gains {n} Strength.' },
  hunch:         { name: 'Hunch',         kind: 'buff',   stack: 'intensity', color: '#a3b18a', text: 'The first time an attack hurts it, it curls up and gains {n} Block after the attack.' },
  immune:        { name: 'Immune',        kind: 'buff',   stack: 'intensity', color: '#e8e1c9', text: 'Shrugs off the next {n} debuff(s).' },
  asleep:        { name: 'Asleep',        kind: 'special', stack: 'counter',  color: '#6c7fa8', text: 'Sleeping. Wakes up when it loses HP, or in {n} turn(s).' },
  mode_shift:    { name: 'Shield Up',     kind: 'special', stack: 'counter',  color: '#7aa0c8', text: 'After it takes {n} more damage, it raises its shield and turns defensive.' },
  temp_strength: { name: 'Pumped',        kind: 'buff',   stack: 'intensity', color: '#ef7d57', text: 'Loses {n} Strength at the end of this turn.' },
  swing_guard:   { name: 'Swing Guard',   kind: 'buff',   stack: 'intensity', color: '#c8483a', text: 'This turn, whenever you play an Attack, gain {n} Block.' },
  slow_motion:   { name: 'Slow Motion',   kind: 'buff',   stack: 'intensity', color: '#7fd1c7', text: 'Cards in your hand cost 0 this turn. You can\'t draw more cards this turn.' },
  thick_skin:    { name: 'Thick Skin',    kind: 'power',  stack: 'intensity', color: '#b08560', text: 'At the end of your turn, gain {n} Block.' },
  berserker:     { name: 'Berserker',     kind: 'power',  stack: 'intensity', color: '#d9543f', text: 'At the start of your turn, gain {n} Strength.' },
  fortify:       { name: 'Dug In',        kind: 'power',  stack: 'intensity', color: '#a08f6a', text: 'Block is not removed at the start of your turn.', flag: true },
  marksman:      { name: 'Marksman',      kind: 'power',  stack: 'intensity', color: '#2fa39a', text: 'Attacks deal {n} more damage to Staggered zombies.' },
  light_feet:    { name: 'Light on Feet', kind: 'power',  stack: 'intensity', color: '#55c2b5', text: 'Whenever you play a Skill, gain {n} Block.' },
  dead_eye:      { name: 'Dead Eye',      kind: 'power',  stack: 'intensity', color: '#e3b04b', text: 'The first {n} Attacks you play each turn on a Staggered zombie draw a card.' },
};

for (const [id, s] of Object.entries(STATUSES)) {
  s.id = id;
  s.icon = s.icon || id;
}

/** Statuses that tick down by 1 at the end of the owner's turn. */
export const TURN_STATUSES = Object.keys(STATUSES).filter(id => STATUSES[id].stack === 'turns');

/** True when applying `n` of `id` is a debuff (Immune blocks it): debuffs, and negative Strength/Agility. */
export function isDebuff(id, n = 1) {
  const s = STATUSES[id];
  if (!s) return false;
  if (s.negative) return n < 0;
  return s.kind === 'debuff';
}

/** For the HUD: is this amount of this status good for its owner? */
export function isPositive(id, n) {
  const s = STATUSES[id];
  if (!s) return true;
  if (s.negative) return n >= 0;
  return s.kind !== 'debuff';
}
