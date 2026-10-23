// The app's view of the engine's daily run and Infection levels (src/game/meta.js / run.js), in one place so the screens
// don't care which module exports what, and the app still runs on an engine without them (no Daily button, no picker).
//   G.levels() -> [{ level, name, desc }]      INFECTION_LEVELS (level 0 = the family level)
//   G.unlocked() -> highest playable level    profile.infection.unlocked
//   G.canPickInfection() -> bool              after the first win (or once a level above 0 is open)
//   G.dailySeed(date) | null   G.today() -> 'YYYY-MM-DD' (local)   G.dateLabel(date) -> 'Oct 23'
//   G.dailyInfo() -> { date, label, best } | null   (the title's Daily Run button)
//   G.runDaily(run) -> date | null   G.score(run) -> number | null
import * as M from '../game/meta.js';
import * as R from '../game/run.js';

const pick = name => M[name] ?? R[name];

export function createGameApi(getProfile) {
  const G = {
    levels() {
      const L = pick('INFECTION_LEVELS');
      return Array.isArray(L) ? L.map((l, i) => ({ level: l.level ?? i, name: l.name || '', desc: l.desc || '' })) : [];
    },
    unlocked() {
      const p = getProfile();
      const u = Number(p?.infection?.unlocked ?? 0);
      const max = Math.max(0, ...G.levels().map(l => l.level));
      return Math.max(0, Math.min(Number.isFinite(u) ? u : 0, max));
    },
    canPickInfection() { const p = getProfile(); return G.levels().length > 1 && ((p?.stats?.wins || 0) > 0 || G.unlocked() > 0); },
    get dailySeed() { const f = pick('dailySeed'); return typeof f === 'function' ? f : null; },
    today(d = new Date()) {
      const z = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
    },
    dateLabel(date) {
      const [y, m, d] = String(date).split('-').map(Number);
      if (!y || !m || !d) return String(date || '');
      return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    },
    dailyInfo() {
      if (!G.dailySeed) return null;
      const date = G.today();
      const best = getProfile()?.daily?.[date];
      return { date, label: G.dateLabel(date), best: best ?? null };
    },
    runDaily(run) {
      if (!run?.daily) return null;
      if (typeof run.daily === 'string') return run.daily;
      if (typeof run.daily === 'object' && run.daily.date) return run.daily.date;
      return run.dailyDate || G.today();
    },
    score(run) {
      const f = pick('scoreRun');
      if (typeof f !== 'function') return null;
      try { const v = f(run); return typeof v === 'number' ? v : (v?.score ?? v?.total ?? null); } catch { return null; }
    },
  };
  return G;
}
