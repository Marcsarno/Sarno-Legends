// WEAPONS: the meta unlock tree (the Armory), Sarno Legends' "artifact system".
// Bought with scrap between runs, one equipped per hero. An equipped weapon is two things in a run:
//   1. a relic with rarity 'weapon' (same id; its passive lives in relics.js and shows in the relic bar), and
//   2. card swaps applied to the starter deck by makeStarterDeck() in cards.js.
// cost = scrap; tier 1 is free. model = the weapon GLB in public/assets/models/weapons/ (deco = procedural extras).
// Sidegrades, not raw power; tier 3 is a little stronger.

export const WEAPONS = {
  wood_bat: {
    hero: 'marc', name: 'Wood Bat', tier: 1, cost: 0, model: 'wood_bat',
    swaps: [],
    blurb: 'The bat Marc started with.',
  },
  nail_bat: {
    hero: 'marc', name: 'Nail Bat', tier: 2, cost: 80, model: 'wood_bat', deco: 'nails', requires: 'wood_bat',
    swaps: [{ from: 'bat_swing', to: 'nail_swing' }],
    blurb: 'Nails through the barrel. Every swing opens a wound.',
  },
  wire_bat: {
    hero: 'marc', name: 'Wire-and-Tape Bat', tier: 3, cost: 200, model: 'wood_bat', deco: 'wire', requires: 'nail_bat',
    swaps: [{ from: 'bat_swing', to: 'barbed_swing' }],
    blurb: 'Barbed wire under the tape. Bleeding zombies take more from Marc.',
  },
  crowbar: {
    hero: 'marc', name: 'Crowbar', tier: 2, cost: 120, model: 'crowbar', requires: 'wood_bat',
    swaps: [{ from: 'home_run', to: 'pry_loose', count: 1 }],
    blurb: 'Opens doors and guards alike.',
  },
  fire_axe: {
    hero: 'marc', name: 'Fire Axe', tier: 3, cost: 250, model: 'fire_axe', requires: 'crowbar',
    swaps: [{ from: 'brace', to: 'chop_block', count: 1 }],
    blurb: 'Heavy and sharp. Hard to defend with.',
  },
  sledgehammer: {
    hero: 'marc', name: 'Sledgehammer', tier: 3, cost: 350, model: 'sledgehammer', requires: 'crowbar',
    swaps: [{ from: 'home_run', to: 'sledge', count: 1 }],
    blurb: 'Slow to get going. Nothing stands back up.',
  },
  pistol: {
    hero: 'yola', name: 'Pistol', tier: 1, cost: 0, model: 'pistol_core',
    swaps: [],
    blurb: 'Yola\'s sidearm. She always has the first shot ready.',
  },
  shotgun: {
    hero: 'yola', name: 'Pump Shotgun', tier: 2, cost: 150, model: 'pump_shotgun', requires: 'pistol',
    swaps: [{ from: 'pistol_shot', to: 'buckshot', count: 2 }],
    blurb: 'Clears a hallway.',
  },
  sawed_off: {
    hero: 'yola', name: 'Sawed-Off', tier: 3, cost: 300, model: 'pump_short', requires: 'shotgun',
    swaps: [{ from: 'clean_shot', to: 'both_barrels', count: 1 }],
    blurb: 'Short barrels for close work on staggered targets.',
  },
};

for (const [id, w] of Object.entries(WEAPONS)) { w.id = id; w.relic = id; }

export const DEFAULT_WEAPONS = { marc: 'wood_bat', yola: 'pistol' };

/** Weapons for one hero, in Armory order (tier, then cost). */
export function weaponsFor(hero) {
  return Object.values(WEAPONS).filter(w => w.hero === hero).sort((a, b) => a.tier - b.tier || a.cost - b.cost);
}
