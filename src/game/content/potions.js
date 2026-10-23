// POTIONS: medkit items, 3 slots (run.potions). Pure data.
// target: 'enemy' needs a zombie picked; 'none' just fires. usable: false = automatic (Epi-Pen fires on death).
// effects use the effects.js mini-language; potion damage is pure (no Strength / Staggered), like Slay the Spire's.
// Drop odds live in the run layer (40%, +-10 per fight); rarity weights below.

export const POTIONS = {
  medkit:           { name: 'Medkit',        rarity: 'common',   target: 'none', anim: 'heal',   model: 'items/medkit',
    text: 'Heal 20% of your Max HP.', effects: [{ op: 'heal', pct: 0.2 }] },
  adrenaline:       { name: 'Adrenaline',    rarity: 'common',   target: 'none', anim: 'buff',
    text: 'Gain 2 energy.', effects: [{ op: 'energy', n: 2 }] },
  extinguisher:     { name: 'Extinguisher',  rarity: 'common',   target: 'none', anim: 'throw',  model: 'props/fire_extinguisher',
    text: 'Apply 2 Weakened to ALL zombies.', effects: [{ op: 'apply', status: 'weak', n: 2, to: 'all' }] },
  flashbang:        { name: 'Flashbang',     rarity: 'common',   target: 'none', anim: 'throw',
    text: 'Apply 2 Staggered to ALL zombies.', effects: [{ op: 'apply', status: 'vulnerable', n: 2, to: 'all' }] },
  energy_drink:     { name: 'Energy Drink',  rarity: 'common',   target: 'none', anim: 'buff',   model: 'items/water-bottle',
    text: 'Draw 3 cards.', effects: [{ op: 'draw', n: 3 }] },
  body_armor:       { name: 'Body Armor',    rarity: 'common',   target: 'none', anim: 'block',
    text: 'Gain 12 Block.', effects: [{ op: 'block', n: 12, raw: true }] },
  pipe_bomb:        { name: 'Pipe Bomb',     rarity: 'uncommon', target: 'none', anim: 'throw',
    text: 'Deal 10 damage to ALL zombies.', effects: [{ op: 'damage', n: 10, to: 'all', kind: 'blast', pure: true }] },
  protein_shake:    { name: 'Protein Shake', rarity: 'uncommon', target: 'none', anim: 'buff',
    text: 'Gain 2 Strength.', effects: [{ op: 'apply', status: 'strength', n: 2, to: 'self' }] },
  painkiller_pills: { name: 'Painkillers',   rarity: 'uncommon', target: 'none', anim: 'buff',
    text: 'Gain 2 Agility.', effects: [{ op: 'apply', status: 'dexterity', n: 2, to: 'self' }] },
  epi_pen:          { name: 'Epi-Pen',       rarity: 'rare',     target: 'none', anim: 'heal', usable: false,
    text: 'When you would die, heal to 30% of your Max HP instead. Used automatically.', revivePct: 0.3, effects: [] },
};

for (const [id, p] of Object.entries(POTIONS)) {
  p.id = id;
  if (p.usable === undefined) p.usable = true;
}

export const POTION_RARITY_WEIGHTS = { common: 65, uncommon: 25, rare: 10 };

/** Potion ids of one rarity (or all when rarity is omitted). */
export function potionPool(rarity) {
  return Object.values(POTIONS).filter(p => !rarity || p.rarity === rarity).map(p => p.id);
}

/** Roll a random potion id with the 65/25/10 rarity split. rng = a makeRng stream (run.rng.potions). */
export function rollPotion(rng) {
  const rarity = rng.weighted(POTION_RARITY_WEIGHTS);
  return rng.pick(potionPool(rarity));
}
