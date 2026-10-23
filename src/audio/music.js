// The music: three of Marc's supplied tracks, streamed from <audio> elements through the music bus (decoding a whole
// 3-4 MB MP3 would hold ~80 MB of samples on a phone). One element per file, created the first time it is asked for.
//   menu / map  -> ch2_a_tension.mp3   (resumes where it left off between screens)
//   fight       -> agile_groove.mp3    (Marc's track from yola-zombie; restarts at each fight)
//   elite / boss -> ch2_c_action.mp3   (restarts at each fight)
// Switching crossfades (default 1.2 s). Before the first user gesture the wanted track is remembered and starts on
// unlock. The page going to the background pauses it; coming back resumes it. A missing or blocked file is skipped
// quietly. The three files measure within 0.5 LU of each other (-15.7 to -16.2 LUFS), so no per-track trims.
//   const m = createMusic({ base, bus: () => audioBusOrNull, ctx: () => audioContextOrNull })
//   m.play('fight') / m.play(null) / m.unlock() / m.suspend() / m.resume() / m.state()

export const TRACKS = {
  menu: { src: 'music/ch2_a_tension.mp3', level: 1, restart: false },
  map: { src: 'music/ch2_a_tension.mp3', level: 1, restart: false },
  fight: { src: 'music/agile_groove.mp3', level: 1, restart: true },
  elite: { src: 'music/ch2_c_action.mp3', level: 1, restart: true },
  boss: { src: 'music/ch2_c_action.mp3', level: 1, restart: true },
};

export function createMusic({ base = '/assets/', bus, ctx }) {
  const entries = new Map();          // src -> { el, src, gain, node, failed, fallback }
  let want = null;                    // the track asked for (key in TRACKS) or null
  let cur = null;                     // the entry playing (or fading in)
  let unlocked = false, hidden = false;

  function entry(src) {
    let en = entries.get(src);
    if (en) return en;
    en = { src, el: null, gain: null, node: null, failed: false, fallback: false, level: 1, fadeTimer: 0 };
    try {
      const el = new Audio();
      el.preload = 'auto'; el.loop = true; el.crossOrigin = 'anonymous';
      el.setAttribute('playsinline', '');
      el.addEventListener('error', () => { en.failed = true; if (cur === en) cur = null; });
      el.src = base + src;
      en.el = el;
    } catch { en.failed = true; }
    entries.set(src, en);
    return en;
  }

  // route the element through the music bus (needs the AudioContext); if that fails, the element plays on its own
  function connect(en) {
    if (en.node || en.fallback || en.failed) return;
    const c = ctx(), b = bus();
    if (!c || !b) return;
    try {
      en.node = c.createMediaElementSource(en.el);
      en.gain = c.createGain(); en.gain.gain.value = 0;
      en.node.connect(en.gain); en.gain.connect(b);
    } catch { en.fallback = true; en.el.volume = 0; }
  }

  function ramp(en, to, secs) {
    const c = ctx();
    if (en.gain && c) {
      const g = en.gain.gain, t = c.currentTime;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(Math.max(0, to), t + Math.max(0.01, secs));
    } else if (en.fallback && en.el) {
      // no Web Audio route: step the element's own volume
      clearInterval(en.fadeTimer);
      const from = en.el.volume, t0 = performance.now(), ms = Math.max(10, secs * 1000);
      en.fadeTimer = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        try { en.el.volume = Math.max(0, Math.min(1, from + (to - from) * k)); } catch { /* ignore */ }
        if (k >= 1) clearInterval(en.fadeTimer);
      }, 30);
    }
  }

  function start(en) {
    if (!en.el || en.failed || hidden) return;
    try { const p = en.el.play(); p?.catch?.(() => { /* no gesture yet: unlock() retries */ }); } catch { /* ignore */ }
  }

  function fadeOut(en, secs) {
    ramp(en, 0, secs);
    setTimeout(() => { if (cur !== en) { try { en.el?.pause(); } catch { /* ignore */ } } }, secs * 1000 + 80);
  }

  function play(track, { fade = 1.2 } = {}) {
    want = track && TRACKS[track] ? track : null;
    if (!unlocked) return;
    if (!want) { if (cur) fadeOut(cur, fade); cur = null; return; }
    const T = TRACKS[want];
    const en = entry(T.src);
    if (en.failed) { if (cur && cur !== en) fadeOut(cur, fade); cur = null; return; }
    connect(en);
    if (cur === en) { start(en); ramp(en, T.level, fade * 0.5); return; }   // same file (menu -> map, elite -> boss)
    if (cur) fadeOut(cur, fade);
    cur = en;
    if (T.restart) { try { en.el.currentTime = 0; } catch { /* not seekable yet */ } }
    start(en);
    ramp(en, T.level, fade);
  }

  return {
    play,
    stop(fade = 0.8) { play(null, { fade }); },
    // the first gesture: start what was asked for (iOS lets a media element start only inside a tap)
    unlock() {
      if (unlocked) { if (cur?.el?.paused && !hidden) start(cur); return; }
      unlocked = true;
      if (want) play(want, { fade: 1.5 });
    },
    // fetch the track's file early (no decode): call while loading
    preload(track) { const T = TRACKS[track]; if (T) { const en = entry(T.src); try { en.el?.load(); } catch { /* ignore */ } } },
    suspend() { hidden = true; for (const en of entries.values()) { try { en.el?.pause(); } catch { /* ignore */ } } },
    resume() { hidden = false; if (cur && unlocked) start(cur); },
    get track() { return want; },
    state() {
      return { want, unlocked, hidden, playing: cur ? { src: cur.src, paused: !!cur.el?.paused, time: cur.el?.currentTime || 0, routed: !!cur.node, fallback: cur.fallback } : null,
        files: [...entries.values()].map((en) => ({ src: en.src, failed: en.failed, ready: en.el?.readyState || 0, paused: !!en.el?.paused, gain: en.gain ? +en.gain.gain.value.toFixed(3) : null })) };
    },
  };
}
