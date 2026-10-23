// Seeded random numbers with named streams. Pure: runs in node and the browser.
// sfc32 seeded from a cyrb128 string hash. A generator's whole state is { seed, s: [4 uint32] },
// so a run can save it as JSON and restore it exactly (restoreRng / restoreStreams).
// Each part of a run draws from its own stream (map, cards, shuffle, ai, potions, relics, events, misc),
// so for example re-rolling a card reward never changes how the deck shuffles.

export const STREAMS = ['map', 'cards', 'shuffle', 'ai', 'potions', 'relics', 'events', 'misc'];

/** cyrb128: a string -> four 32-bit numbers. */
export function hashSeed(str) {
  str = String(str);
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * makeRng(seed) where seed is a string/number, or a saved state { seed, s } from rng.state().
 * -> { next() [0,1), int(n) [0,n), range(a,b) inclusive, pick(arr), shuffle(arr) (in place, returns arr),
 *      chance(p), weighted(entries), state(), fork(name), seed }
 */
export function makeRng(seed = 'sarno') {
  let s, base;
  if (seed && typeof seed === 'object' && Array.isArray(seed.s)) { base = String(seed.seed ?? 'sarno'); s = seed.s.map(x => x >>> 0); }
  else { base = String(seed); s = hashSeed(base); }
  let [a, b, c, d] = s;

  function next() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  // warm up so similar seeds diverge (only for fresh seeds, never on restore)
  if (!(seed && typeof seed === 'object')) for (let i = 0; i < 12; i++) next();

  const rng = {
    seed: base,
    next,
    int: n => Math.floor(next() * n),
    range: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: p => next() < p,
    pick: arr => (arr.length ? arr[Math.floor(next() * arr.length)] : undefined),
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    /** entries: [[item, weight], ...] or { key: weight }. Returns the item (or key). */
    weighted(entries) {
      const list = Array.isArray(entries) ? entries : Object.entries(entries);
      const total = list.reduce((t, [, w]) => t + Math.max(0, w), 0);
      if (total <= 0) return list.length ? list[0][0] : undefined;
      let r = next() * total;
      for (const [item, w] of list) { if (w <= 0) continue; r -= w; if (r < 0) return item; }
      return list[list.length - 1][0];
    },
    state: () => ({ seed: base, s: [a >>> 0, b >>> 0, c >>> 0, d >>> 0] }),
    /** A child generator that depends only on this seed and the name (not on how far this one has run). */
    fork: name => makeRng(`${base}/${name}`),
  };
  return rng;
}

export const restoreRng = state => makeRng(state);

/** One generator per named stream, all derived from the run seed. */
export function makeStreams(seed) {
  const out = {};
  for (const name of STREAMS) out[name] = makeRng(`${seed}/${name}`);
  return out;
}

/** Streams -> plain JSON ({ map: {seed, s}, ... }) for the save file. */
export function streamsState(streams) {
  const out = {};
  for (const name of Object.keys(streams)) if (streams[name]?.state) out[name] = streams[name].state();
  return out;
}

/** JSON from streamsState -> live streams. Missing streams are created from `seed`. */
export function restoreStreams(state, seed = 'sarno') {
  const out = {};
  for (const name of STREAMS) out[name] = state?.[name] ? makeRng(state[name]) : makeRng(`${seed}/${name}`);
  return out;
}

/**
 * Accepts whatever a caller has and returns named streams:
 * a streams object, a single rng (forked per stream), a saved streams state, or a seed string.
 */
export function toStreams(rng, fallbackSeed = 'sarno') {
  if (!rng) return makeStreams(fallbackSeed);
  if (typeof rng === 'string' || typeof rng === 'number') return makeStreams(rng);
  if (typeof rng.next === 'function') {
    const out = {};
    for (const name of STREAMS) out[name] = rng.fork(name);
    return out;
  }
  if (STREAMS.some(n => rng[n] && typeof rng[n].next === 'function')) {
    const out = { ...rng };
    for (const name of STREAMS) if (!out[name] || typeof out[name].next !== 'function') out[name] = makeRng(`${fallbackSeed}/${name}`);
    return out;
  }
  return restoreStreams(rng, fallbackSeed);
}

const SEED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** A fresh human-friendly seed like 'K7QX2M' (uses Math.random: only for picking a new seed). */
export function newSeed(len = 6) {
  let out = '';
  for (let i = 0; i < len; i++) out += SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)];
  return out;
}
