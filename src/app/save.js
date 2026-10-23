// Saves in localStorage: the profile (scrap, weapons, settings, the last 20 run logs) and the run in progress.
//   const saves = createSaves({ persist })   persist false keeps everything in memory (?shot= scenes, playtests)
//   saves.loadProfile() -> profile (meta.js loadProfile fills gaps)      saves.saveProfile(profile)
//   saves.loadRun() -> run | null (a finished or unreadable save is dropped)   saves.saveRun(run)   saves.clearRun()
//   saves.runInfo() -> { floor, hp, maxHp } | null   (the title screen's Continue note)
// The run is plain JSON (run.js serialize), saved after every room entry and every resolved choice. A reload in the
// middle of a fight continues from the start of that fight (its seed is in run.pending), as in Slay the Spire.
import { loadProfile } from '../game/meta.js';
import { serialize, deserialize } from '../game/run.js';

const KEYS = { profile: 'sarno-legends:profile', run: 'sarno-legends:run' };

export function createSaves({ persist = true } = {}) {
  const mem = new Map();
  const get = k => {
    if (persist) { try { const v = localStorage.getItem(k); if (v !== null) return v; } catch { /* private mode: memory only */ } }
    return mem.get(k) ?? null;
  };
  const set = (k, v) => {
    mem.set(k, v);
    if (!persist) return;
    try { localStorage.setItem(k, v); } catch (e) { console.warn('[save] could not write', k, e?.message || e); }
  };
  const del = k => {
    mem.delete(k);
    if (!persist) return;
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  };

  return {
    persist,
    loadProfile() {
      let data = null;
      try { data = JSON.parse(get(KEYS.profile) || 'null'); } catch { data = null; }
      return loadProfile(data);
    },
    saveProfile(profile) { set(KEYS.profile, JSON.stringify(profile)); },
    loadRun() {
      const s = get(KEYS.run);
      if (!s) return null;
      try {
        const run = deserialize(s);
        if (run.over) { del(KEYS.run); return null; }
        return run;
      } catch (e) {
        console.warn('[save] dropped an unreadable run:', e?.message || e);
        del(KEYS.run);
        return null;
      }
    },
    saveRun(run) { if (run && !run.over) set(KEYS.run, serialize(run)); },
    clearRun() { del(KEYS.run); },
    runInfo() {
      const s = get(KEYS.run);
      if (!s) return null;
      try { const r = JSON.parse(s); return r && !r.over ? { floor: r.floor || 0, hp: r.hp, maxHp: r.maxHp } : null; } catch { return null; }
    },
  };
}
