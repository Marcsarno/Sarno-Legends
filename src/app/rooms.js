// Which painted room goes with which screen, and the painted backdrops for the DOM screens.
//   battleRoom(run) -> { key, look }   the fight's room: fights rotate ER lobby / ward / corridor by floor, elites get the
//                                       corridor or the ward with a harsher grade, the boss is the security gate
//   const rooms = createRooms(stage)    rooms(key) -> Promise<url> for ctx.rooms (screens' CSS backdrops); rooms.prepaint(key, look)
// Paintings come from painter.js on the shared renderer, at the same size the stage paints its backdrop, so a room is
// painted once per screen size and reused by both (painter.js caches by key, size, seed and look).
import { paintRoom } from '../render/painter.js';

export const FIGHT_ROOMS = ['er_lobby', 'ward', 'corridor'];
// elites: darker, redder, harder contrast (painter LOOK overrides)
export const ELITE_LOOK = { exposure: 0.92, contrast: 1.2, saturation: 0.72, highTint: [0.08, 0.0, -0.03], shadowTint: [0.02, -0.01, -0.01], vignette: 1.3, vigColor: [0.2, 0.04, 0.03] };

export function battleRoom(run) {
  const p = run?.pending || {};
  const floor = Math.max(1, run?.floor || 1);
  if (p.room === 'boss' || p.boss) return { key: 'security_gate', look: null };
  if (p.room === 'elite' || p.elite) return { key: floor % 2 ? 'corridor' : 'ward', look: ELITE_LOOK };
  return { key: FIGHT_ROOMS[(floor - 1) % FIGHT_ROOMS.length], look: null };
}

/** The size the stage paints its backdrop at (stage.js setRoom), so DOM backdrops share its cached paintings. */
export function paintSize(stage) {
  const w = Math.max(1, stage.width || innerWidth), h = Math.max(1, stage.height || innerHeight);
  const pw = Math.min(1920, Math.round(w * Math.min(stage.renderer.getPixelRatio(), 1.5)));
  return { width: pw, height: Math.round(pw * h / w) };
}

export function createRooms(stage) {
  const cache = new Map();   // key|w|h|look -> Promise<url | null>
  function rooms(key, look = null) {
    if (!key) return null;
    const { width, height } = paintSize(stage);
    const ck = `${key}|${width}x${height}|${look ? JSON.stringify(look) : ''}`;
    if (!cache.has(ck)) {
      cache.set(ck, paintRoom(stage.renderer, key, { width, height, look })
        .then(r => { r.texture?.dispose?.(); return r.url; })
        .catch(e => { console.warn('[rooms] paint failed', key, e?.message || e); cache.delete(ck); return null; }));
    }
    return cache.get(ck);
  }
  rooms.prepaint = (key, look = null) => rooms(key, look);
  return rooms;
}
