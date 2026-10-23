// Infection levels: our Ascension ladder (GAME_CORE "Ascension ladder"). Level 0 is today's game, the family level.
// Each level adds its change on top of every level below it (cumulative), as Slay the Spire's Ascension does.
// Pure data + one function; run.js (map, rest), combat.js (zombie HP and damage) and relics.js (Nurse's Kit) read it.
//
//   INFECTION_LEVELS = [{ level, name, desc }]   for the UI (names and text are placeholders until Marc approves them)
//   infectionRules(level) -> the numbers in force at that level (all levels <= it applied)
//   MAX_INFECTION = 5
// Tuned with the balance sim (docs/BALANCE.md "Infection levels").

export const MAX_INFECTION = 5;

export const INFECTION_LEVELS = [
  { level: 0, name: 'Family', desc: 'The hospital as it is. Start here.' },
  { level: 1, name: 'Outbreak', desc: 'More elite zombies on the map.' },
  { level: 2, name: 'Spreading', desc: 'Normal zombies hit harder and have more HP.' },
  { level: 3, name: 'Mutation', desc: 'Elite zombies are tougher and hit harder.' },
  { level: 4, name: 'Quarantine', desc: 'The boss has more HP and hits harder.' },
  { level: 5, name: 'Pandemic', desc: 'The Nurse\'s Kit heals 4 instead of 6, and resting heals 25% instead of 30%.' },
];

/** Clamp anything (undefined, strings, out of range) to a level 0..5. */
export const infectionLevel = n => Math.max(0, Math.min(MAX_INFECTION, Math.floor(Number(n) || 0)));

/**
 * The rules at a level. Zombie damage is per hit: base + flat + ceil(base * pct); HP is rolled, then x (1 + hpPct) or + hp.
 * Slay the Spire spreads these over 20 Ascensions; five levels need bigger steps, so each one is a little stronger
 * than its StS counterpart (sim: docs/BALANCE.md "Infection levels").
 *   eliteOdds  share of map rooms that are elites (StS A1: 8% -> x1.6 = 12.8%)
 *   normal     normal zombies +20% damage, +10% HP (StS A2 damage + A7 HP): Bite 5-7 -> 6-9, Bite Down 11 -> 14
 *   elite      elites +15% damage, +10% HP (StS A3 + A8): Charge 14 -> 17, Flail 18 -> 21, Swipe 9 -> 11
 *   boss       the boss +20% damage, +30 HP (StS A4 + A9): Shield Bash 32 -> 39, Baton Flurry 5 -> 6 x4, 240 -> 270 HP
 *   kitHeal    the Nurse's Kit's end-of-fight heal (6, StS Burning Blood)
 *   restHeal   the Supply Closet's rest, share of Max HP (StS 30%)
 */
export function infectionRules(level = 0) {
  const L = infectionLevel(level);
  return {
    level: L,
    eliteOdds: L >= 1 ? 0.128 : 0.08,
    normal: L >= 2 ? { flat: 0, pct: 0.2, hpPct: 0.1 } : { flat: 0, pct: 0, hpPct: 0 },
    elite: L >= 3 ? { flat: 0, pct: 0.15, hpPct: 0.1 } : { flat: 0, pct: 0, hpPct: 0 },
    boss: L >= 4 ? { flat: 0, pct: 0.2, hp: 30 } : { flat: 0, pct: 0, hp: 0 },
    kitHeal: L >= 5 ? 4 : 6,
    restHeal: L >= 5 ? 0.25 : 0.3,
  };
}
