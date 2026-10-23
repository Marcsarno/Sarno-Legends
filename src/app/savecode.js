// Save codes: the whole profile (scrap, weapons, settings, run history, what you've seen) plus the run in progress as one
// copy-pasteable string, a backup for phones that wipe site data (iPhone Safari clears it after 7 days unused).
//   await encodeSave({ profile, run }) -> 'SL1.<base64url>'    (deflate-raw when the browser has CompressionStream)
//   await decodeSave(code) -> { ok: true, profile, run | null, info } | { ok: false, reason }
//   info: { scrap, runs, wins, weapons, run: { floor, hp, maxHp } | null, at }   (what the Import confirm shows)
// 'SL1.' = deflated JSON, 'SL0.' = plain JSON (browsers without CompressionStream). Whitespace and line breaks pasted
// along with the code are ignored. The profile goes through meta.js loadProfile and the run through run.js deserialize,
// so a code from an older build is filled in and a broken one is refused before anything is replaced.
import { loadProfile } from '../game/meta.js';
import { deserialize } from '../game/run.js';

const MAGIC = 'SL';
const hasStreams = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

function toB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str) {
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export async function encodeSave({ profile, run = null, now = Date.now() }) {
  const json = JSON.stringify({ v: 1, at: now, profile, run: run && !run.over ? run : null });
  const raw = new TextEncoder().encode(json);
  if (hasStreams()) {
    try { return `${MAGIC}1.${toB64url(await pipe(raw, new CompressionStream('deflate-raw')))}`; } catch { /* fall through */ }
  }
  return `${MAGIC}0.${toB64url(raw)}`;
}

export async function decodeSave(code) {
  const s = String(code || '').replace(/\s+/g, '');
  if (!s) return { ok: false, reason: 'Paste a save code first.' };
  const m = s.match(/^SL([01])\.([A-Za-z0-9_-]+)$/);
  if (!m) return { ok: false, reason: 'That doesn’t look like a Sarno Legends save code (they start with SL1.).' };
  let data;
  try {
    let bytes = fromB64url(m[2]);
    if (m[1] === '1') {
      if (!hasStreams()) return { ok: false, reason: 'This browser can’t open compressed save codes. Try Safari or Chrome.' };
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    }
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, reason: 'The code is incomplete or damaged. Copy the whole thing and try again.' };
  }
  if (!data || typeof data !== 'object' || !data.profile || typeof data.profile !== 'object') return { ok: false, reason: 'The code has no profile in it.' };
  let profile, run = null;
  try { profile = loadProfile(data.profile); } catch { return { ok: false, reason: 'The profile in the code can’t be read.' }; }
  // loadProfile keeps the app's own fields (coach tips, seen items, ui prefs) as they are
  if (data.run) {
    try { run = deserialize(JSON.stringify(data.run)); if (run.over) run = null; } catch { run = null; }
  }
  const st = profile.stats || {};
  return {
    ok: true, profile, run,
    info: {
      scrap: profile.scrap, runs: st.runs || 0, wins: st.wins || 0, weapons: (profile.unlocked || []).length,
      run: run ? { floor: run.floor, hp: run.hp, maxHp: run.maxHp } : null, at: Number(data.at) || null,
    },
  };
}
