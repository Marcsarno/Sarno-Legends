// Meta progression between runs: the profile (scrap, weapon unlocks and loadout, lifetime stats, the last 20 run
// logs, settings). Pure functions over a plain profile object; the app keeps it in localStorage.
//
//   const profile = loadProfile(JSON.parse(localStorage.profile || 'null'))   // or createProfile()
//   canUnlock(profile, 'nail_bat') -> { ok, reason: 'unknown'|'owned'|'requires'|'scrap', cost, requires }
//   unlockWeapon(profile, id) / equip(profile, hero, id) / setSetting(profile, key, value)   -> { ok, reason? }
//   scrapFor(run) -> { earned, lines: [{ label, amount }] }   (fight 8, elite 20, boss 40, act cleared +15; no toll)
//   recordRun(profile, run) -> { scrap: { before, earned, after, lines }, unlocks: [{ weapon, text }], best }
//     adds the scrap and stats once per run (run.record remembers it, so a reload can show the same tally)
// Weapons are the artifact system: content/weapons.js has the tree (cost in scrap, `requires` = the tier before).

import { WEAPONS, DEFAULT_WEAPONS } from './content/weapons.js';

export const PROFILE_VERSION = 1;
export const SCRAP = { fight: 8, elite: 20, boss: 40, actCleared: 15 };
export const MAX_RUN_LOGS = 20;
export const DEFAULT_SETTINGS = { speed: 1, music: 0.7, sfx: 0.8, shake: true, gore: 'full' };
export const SETTINGS = {
  speed: v => [1, 1.5, 2].includes(v),
  music: v => typeof v === 'number' && v >= 0 && v <= 1,
  sfx: v => typeof v === 'number' && v >= 0 && v <= 1,
  shake: v => typeof v === 'boolean',
  gore: v => v === 'full' || v === 'low',
  voices: v => typeof v === 'boolean',   // the barks (src/audio/voice.js); absent = on (kept out of DEFAULT_SETTINGS for older profiles)
};

const FREE = Object.values(WEAPONS).filter(w => !w.cost).map(w => w.id);

export function createProfile() {
  return {
    version: PROFILE_VERSION,
    scrap: 0,
    unlocked: FREE.slice(),
    equipped: { ...DEFAULT_WEAPONS },
    stats: { runs: 0, wins: 0, losses: 0, bestFloor: 0, kills: 0, finishers: 0, fights: 0, elites: 0, bosses: 0,
      scrapEarned: 0, scrapSpent: 0, streak: 0, bestStreak: 0 },
    runs: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** A profile from storage (or null): missing fields filled, free weapons owned, a bad loadout reset. */
export function loadProfile(data) {
  const base = createProfile();
  if (!data || typeof data !== 'object') return base;
  const p = { ...base, ...data };
  p.version = PROFILE_VERSION;
  p.scrap = Math.max(0, Math.floor(Number(p.scrap) || 0));
  p.unlocked = [...new Set([...(Array.isArray(data.unlocked) ? data.unlocked : []), ...FREE])].filter(id => WEAPONS[id]);
  p.equipped = { ...DEFAULT_WEAPONS, ...(data.equipped || {}) };
  for (const h of ['marc', 'yola']) {
    const w = WEAPONS[p.equipped[h]];
    if (!w || w.hero !== h || !p.unlocked.includes(w.id)) p.equipped[h] = DEFAULT_WEAPONS[h];
  }
  p.stats = { ...base.stats, ...(data.stats || {}) };
  p.runs = Array.isArray(data.runs) ? data.runs.slice(-MAX_RUN_LOGS) : [];
  p.settings = { ...DEFAULT_SETTINGS };
  for (const [k, v] of Object.entries(data.settings || {})) if (SETTINGS[k]?.(v)) p.settings[k] = v;
  return p;
}

// ---------------------------------------------------------------- weapons (the Armory)

export function canUnlock(profile, id) {
  const w = WEAPONS[id];
  if (!w) return { ok: false, reason: 'unknown' };
  const out = { cost: w.cost, requires: w.requires || null };
  if (profile.unlocked.includes(id)) return { ok: false, reason: 'owned', ...out };
  if (w.requires && !profile.unlocked.includes(w.requires)) return { ok: false, reason: 'requires', ...out };
  if (profile.scrap < w.cost) return { ok: false, reason: 'scrap', ...out };
  return { ok: true, ...out };
}

export function unlockWeapon(profile, id) {
  const check = canUnlock(profile, id);
  if (!check.ok) return check;
  profile.scrap -= check.cost;
  profile.stats.scrapSpent = (profile.stats.scrapSpent || 0) + check.cost;
  profile.unlocked.push(id);
  return { ok: true, cost: check.cost };
}

export function equip(profile, hero, id) {
  const w = WEAPONS[id];
  if (!w || w.hero !== hero) return { ok: false, reason: 'hero' };
  if (!profile.unlocked.includes(id)) return { ok: false, reason: 'locked' };
  profile.equipped[hero] = id;
  return { ok: true };
}

export const isUnlocked = (profile, id) => profile.unlocked.includes(id);

/** Weapons you could unlock right now (requirement met and enough scrap), cheapest first. */
export function affordableWeapons(profile) {
  return Object.values(WEAPONS).filter(w => canUnlock(profile, w.id).ok).sort((a, b) => a.cost - b.cost).map(w => w.id);
}

// ---------------------------------------------------------------- settings

export function setSetting(profile, key, value) {
  if (!SETTINGS[key]) return { ok: false, reason: 'unknown' };
  if (!SETTINGS[key](value)) return { ok: false, reason: 'value' };
  profile.settings[key] = value;
  return { ok: true };
}

// ---------------------------------------------------------------- scrap and run records

/** Scrap a run earned: every fight, elite and boss won, +15 for clearing the act. Win or lose, no toll. */
export function scrapFor(run) {
  const S = run.stats || {};
  const lines = [];
  if (S.fights) lines.push({ label: `Fights ×${S.fights}`, amount: S.fights * SCRAP.fight });
  if (S.elites) lines.push({ label: `Elites ×${S.elites}`, amount: S.elites * SCRAP.elite });
  if (S.bosses) lines.push({ label: 'Boss', amount: S.bosses * SCRAP.boss });
  if (run.won) lines.push({ label: 'Floor cleared', amount: SCRAP.actCleared });
  return { earned: lines.reduce((t, l) => t + l.amount, 0), lines };
}

/** The compact log kept in the profile (last 20 runs). */
export function runLog(run, now = Date.now()) {
  const S = run.stats || {};
  return {
    seed: run.seed, at: now, won: !!run.won, floor: run.floor, hp: run.hp, maxHp: run.maxHp, gold: run.gold,
    weapons: { ...run.weapons }, deck: run.deck.map(c => c.id + (c.up ? '+' : '')), relics: run.relics.map(r => r.id),
    kills: S.kills, finishers: S.finishers, turns: S.turns, damageTaken: S.damageTaken, cause: S.cause || null,
    fights: (S.log || []).filter(e => e.t === 'fight').map(e => ({ floor: e.floor, encounter: e.encounter, won: e.won, turns: e.turns,
      hpLost: e.hpBefore - e.hpAfter, damageTaken: e.damageTaken })),
    cards: (S.log || []).filter(e => e.t === 'cards').map(e => ({ floor: e.floor, offered: e.offered, picked: e.picked })),
  };
}

/**
 * Bank a finished run: scrap, lifetime stats, the run log. Safe to call twice (the second call returns the first tally).
 * -> { scrap: { before, earned, after, lines }, unlocks: [{ weapon, text }], best: bool }
 */
export function recordRun(profile, run, { now = Date.now() } = {}) {
  if (run.record) return run.record;
  const { earned, lines } = scrapFor(run);
  const before = profile.scrap;
  const affordableBefore = new Set(affordableWeapons(profile));
  profile.scrap += earned;
  const st = profile.stats;
  st.runs++;
  if (run.won) { st.wins++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak); } else { st.losses++; st.streak = 0; }
  const best = run.floor > st.bestFloor;
  st.bestFloor = Math.max(st.bestFloor, run.floor);
  for (const k of ['kills', 'finishers', 'fights', 'elites', 'bosses']) st[k] = (st[k] || 0) + (run.stats?.[k] || 0);
  st.scrapEarned += earned;
  profile.runs.push(runLog(run, now));
  if (profile.runs.length > MAX_RUN_LOGS) profile.runs.splice(0, profile.runs.length - MAX_RUN_LOGS);
  const unlocks = affordableWeapons(profile).filter(id => !affordableBefore.has(id))
    .map(id => ({ weapon: id, text: `You can afford the ${WEAPONS[id].name}.` }));
  run.record = { scrap: { before, earned, after: profile.scrap, lines }, unlocks, best };
  return run.record;
}
