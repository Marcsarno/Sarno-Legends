// Which painted room goes with which screen, and the painted backdrops for the DOM screens.
//   battleRoom(run) -> { key, look }   the fight's room: fights rotate ER lobby / ward / corridor by floor, elites get the
//                                       corridor or the ward with a harsher grade, the boss is the security gate
//   const rooms = createRooms(stage)    rooms(key, look?) -> Promise<url> for ctx.rooms (screens' CSS backdrops)
//                                       rooms.prepaint(key, look?, { live? }) gets a room ready ahead of time (the map, boot)
//   BAKE_ROOMS                          every (room, look) the game shows: what tools/bake-art.mjs bakes
// Rooms come from painter.js: the baked pictures (public/assets/baked, npm run bake) framed for the screen in a few
// milliseconds, or a live painting on the shared renderer when a room has none. Either way at the size the stage paints
// its backdrop (stage.js setRoom), so a live painting is made once per screen size and shared by both.
import { roomUrl, prefetchRoom, ROOM_KEYS } from '../render/painter.js';

export const FIGHT_ROOMS = ['er_lobby', 'ward', 'corridor'];
// elites: darker, redder, harder contrast (painter LOOK overrides)
export const ELITE_LOOK = { exposure: 0.92, contrast: 1.2, saturation: 0.72, highTint: [0.08, 0.0, -0.03], shadowTint: [0.02, -0.01, -0.01], vignette: 1.3, vigColor: [0.2, 0.04, 0.03] };
// every room as itself, plus the rooms battleRoom grades for elites (tag: the baked file's suffix)
export const BAKE_ROOMS = [
  ...ROOM_KEYS.map(key => ({ key, look: null, tag: '' })),
  ...['corridor', 'ward'].map(key => ({ key, look: ELITE_LOOK, tag: 'elite' })),
];

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
  function rooms(key, look = null) {
    if (!key) return null;
    return roomUrl(stage.renderer, key, { ...paintSize(stage), look })     // (painter.js caches the framed pictures)
      .catch(e => { console.warn('[rooms] paint failed', key, e?.message || e); return null; });
  }
  /** opts.live: false only warms a baked room (no live painting when the room has none). */
  rooms.prepaint = (key, look = null, { live = true } = {}) =>
    prefetchRoom(stage.renderer, key, { ...paintSize(stage), look, live })
      .catch(e => { console.warn('[rooms] prepaint failed', key, e?.message || e); return false; });
  return rooms;
}
