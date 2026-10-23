// ENCOUNTERS: who you fight, and the act-1 pools the map draws from (Slay the Spire's Exordium rules).
// An encounter: { id, name (banner text), kind: 'easy'|'hard'|'elite'|'boss'|'event', enemies: [enemyId...] (left to right =
// slot 0..4 = acting order), room (painted backdrop key), music }.
// Pools: the first 3 fights come from 'easy', later ones from 'hard'; no repeat of the previous two fights;
// no same elite twice in a row. pickEncounter() applies those rules.

export const ENCOUNTERS = {
  // easy pool (first 3 fights)
  shambler_solo:  { name: 'Shambler',            kind: 'easy',  enemies: ['shambler'],                    room: 'er_lobby' },
  screamer_solo:  { name: 'Screamer',            kind: 'easy',  enemies: ['screamer'],                    room: 'corridor' },
  biter_pair:     { name: 'Biter and Spitter',   kind: 'easy',  enemies: ['biter', 'spitter'],            room: 'ward' },
  two_biters:     { name: 'Two Biters',          kind: 'easy',  enemies: ['biter', 'biter'],              room: 'ward' },

  // hard pool
  shambler_nurse: { name: 'Shambler and Nurse',  kind: 'hard',  enemies: ['shambler', 'nurse'],           room: 'er_lobby' },
  sprinters:      { name: 'Sprinters',           kind: 'hard',  enemies: ['sprinter', 'sprinter', 'biter'], room: 'corridor' },
  three_biters:   { name: 'Biters',              kind: 'hard',  enemies: ['biter', 'spitter', 'biter'],   room: 'ward' },
  bloaters:       { name: 'Bloaters',            kind: 'hard',  enemies: ['bloater', 'bloater'],          room: 'storage' },
  screamer_biter: { name: 'Screamer and Biter',  kind: 'hard',  enemies: ['biter', 'screamer'],           room: 'corridor' },
  horde:          { name: 'Horde',               kind: 'hard',  enemies: ['shambler', 'biter', 'biter'],  room: 'er_lobby' },
  nurse_pack:     { name: 'Nurse and Biters',    kind: 'hard',  enemies: ['biter', 'nurse', 'biter'],     room: 'ward' },

  // elites
  big_walker:       { name: 'Big Walker',        kind: 'elite', enemies: ['big_walker'],                  room: 'security_gate', music: 'elite' },
  sleeping_patient: { name: 'Sleeping Patient',  kind: 'elite', enemies: ['sleeping_patient'],            room: 'ward',          music: 'elite' },
  orderlies:        { name: 'Orderlies',         kind: 'elite', enemies: ['orderly', 'orderly', 'orderly'], room: 'corridor',    music: 'elite' },

  // boss
  shield_guard:     { name: 'Shield Guard',      kind: 'boss',  enemies: ['shield_guard'],                room: 'security_gate', music: 'boss' },

  // event fights (locked rooms)
  gurney_biters:    { name: 'Under the Gurney',  kind: 'event', enemies: ['biter', 'biter'],              room: 'ward' },
  cart_walker:      { name: 'Big Walker',        kind: 'event', enemies: ['big_walker'],                  room: 'storage', music: 'elite', elite: true },
};

for (const [id, e] of Object.entries(ENCOUNTERS)) {
  e.id = id;
  e.music = e.music || 'fight';
  if (e.elite === undefined) e.elite = e.kind === 'elite';
  e.boss = e.kind === 'boss';
}

/** Weighted pools (Exordium weights, rounded). */
export const POOLS = {
  easy:  { shambler_solo: 2, screamer_solo: 2, biter_pair: 2, two_biters: 2 },
  hard:  { shambler_nurse: 2, sprinters: 1, three_biters: 2, bloaters: 2, screamer_biter: 2, horde: 1.5, nurse_pack: 1.5 },
  elite: { big_walker: 1, sleeping_patient: 1, orderlies: 1 },
  boss:  { shield_guard: 1 },
};

export const EASY_FIGHTS = 3;

/**
 * Pick the next encounter id.
 *   kind: 'easy' | 'hard' | 'elite' | 'boss' | 'fight' ('fight' = easy for the first 3 fights, then hard)
 *   rng: a makeRng stream (run.rng.map or misc), history: encounter ids already fought this run (oldest first),
 *   fightsSoFar: normal fights already fought (for 'fight').
 * Rules: normal fights never repeat either of the previous two normal fights; an elite never repeats the previous elite.
 */
export function pickEncounter(kind, rng, history = [], fightsSoFar) {
  if (kind === 'fight') {
    const normalDone = fightsSoFar ?? history.filter(id => ['easy', 'hard'].includes(ENCOUNTERS[id]?.kind)).length;
    kind = normalDone < EASY_FIGHTS ? 'easy' : 'hard';
  }
  const pool = POOLS[kind];
  if (!pool) throw new Error(`Unknown encounter pool: ${kind}`);
  let banned = [];
  if (kind === 'easy' || kind === 'hard') {
    banned = history.filter(id => ['easy', 'hard'].includes(ENCOUNTERS[id]?.kind)).slice(-2);
  } else if (kind === 'elite') {
    banned = history.filter(id => ENCOUNTERS[id]?.kind === 'elite').slice(-1);
  }
  let entries = Object.entries(pool).filter(([id]) => !banned.includes(id));
  if (!entries.length) entries = Object.entries(pool);
  return rng.weighted(entries);
}
