// The game's sound: one WebAudio graph, recorded sound banks, synthesised UI sounds, the music, and the combat event map.
//   const audio = createAudio({ base?, autoUnlock?: true, autoMusic?: true, locate?: (uid) => pan })
//   audio.unlock()                      call from the first user gesture (also done automatically on the first tap/key)
//   audio.event(combatEvt)              every combat event as it lands (render/director.js), incl. its { t: 'fx' } moments
//   audio.ui('click' | 'hover' | 'card' | 'deny' | 'coin' | 'open' | 'close' | 'select' | 'end_turn' | ...)
//   audio.sfx(key, { vol, rate, pitch, at, pan, delay })   any bank or synth by name (sfx.js); at = screen x in px
//   audio.music('menu' | 'map' | 'fight' | 'elite' | 'boss' | null)   crossfades; waits for unlock if needed
//   audio.setVolume({ master, music, sfx, voice, voices })   0..1 each (the settings sliders); voices: the barks on/off
//   audio.voice                         the bark director (voice.js): Marc, Yola and the Shield Guard speak; duck(ms, amount)
//   extras: walk(steps), door(kind), setLoadout({ marc, yola }), setParty({ hp, maxHp }), lowHp(bool), preload(),
//           stopAll(), mute(bool), meter(), state(), has(key), destroy()
// Graph: sfx bus -> glue compressor -> master -> limiter -> out; ui bus and music bus -> master; a generated room
// reverb (hospital tile, ~0.8 s) fed by each layer's send. Files are fetched lazily, decoded once (after the first
// gesture, in the background), trimmed to their real start (MP3s carry encoder silence) and level-matched within
// +-6 dB so variants of one sound play at one loudness. Nothing here throws: a missing file, a locked context or a
// browser without Web Audio just means silence.
import { BANKS, SYNTHS, UI, createEventSounds, filesInUse } from './sfx.js';
import { createMusic, TRACKS } from './music.js';
import { createVoice } from './voice.js';

const DEFAULT_BASE = ((import.meta.env && import.meta.env.BASE_URL) || '/') + 'assets/';
const MAX_VOICES = 28;                         // recorded voices ringing at once (synths are short and not counted)
const TRIM = { sfx: 0.95, ui: 0.8, music: 0.6, voice: 1.0 }; // bus levels under the player's volume sliders
const REF_DB = -16;                            // takes are matched to this loudest-50-ms RMS (within +-6 dB)
const PRELOAD_ORDER = ['swing', 'bat_hit', 'pistol', 'party_hit', 'z_attack', 'z_hurt', 'z_death', 'z_alert', 'body_fall',
  'block', 'dodge', 'heavy_hit', 'bullet_hit', 'stagger', 'stagger_crack', 'finisher', 'supplies', 'step', 'door'];

const curve = (v) => { v = +v; if (!isFinite(v)) return 1; if (v > 1) v /= 100; v = Math.max(0, Math.min(1, v)); return v * v; };
const rand = (a, b) => a + Math.random() * (b - a);
const pick2 = (x) => (Array.isArray(x) ? rand(x[0], x[1]) : x || 0);
const isIOS = () => typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// a 0.1 s silent WAV: looping it inside the first tap moves iOS Web Audio out of the ring/silent switch's control
const SILENT_WAV = (() => {
  try {
    const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer), s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    s(0, 'RIFF'); v.setUint32(4, 36 + n, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); s(36, 'data'); v.setUint32(40, n, true);
    b.fill(128, 44); let str = ''; for (const x of b) str += String.fromCharCode(x);
    return 'data:audio/wav;base64,' + btoa(str);
  } catch { return null; }
})();

export function createAudio(opts = {}) {
  const base = opts.base || DEFAULT_BASE;
  const hasWindow = typeof window !== 'undefined';
  let c = null, N = null, unlocked = false, destroyed = false, muted = false;
  const vol = { master: 1, music: 0.7, sfx: 0.8, voice: 0.9, ...(opts.volume || {}) };

  const raw = new Map();       // path -> Promise<ArrayBuffer | null>   (fetch only, works before unlock)
  const loading = new Map();   // path -> Promise<entry | null>
  const decoded = new Map();   // path -> { buf, start, norm, db }
  const failed = new Set();
  const lastTake = new Map();  // layer key -> path
  const lastPlay = new Map();  // bank key -> ctx time
  const lastSynth = new Map(); // synth name -> ctx time
  const stacked = new Map();   // bank key -> extra plays stacked inside its cooldown
  let voices = [];
  const stats = { played: 0, dropped: 0, late: 0, synths: 0 };
  let duckUntil = 0, duckLevel = 1, beatTimer = 0, beatLevel = 0, preloading = false;
  const listeners = [];

  // ------------------------------------------------------------------ the graph
  function ensureCtx() {
    if (c || destroyed) return c;
    const AC = hasWindow && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try { c = new AC({ latencyHint: 'interactive' }); } catch { try { c = new AC(); } catch { c = null; return null; } }
    try { buildGraph(); } catch (err) { console.warn('[audio] graph failed', err); c = null; N = null; }
    return c;
  }

  function buildGraph() {
    const comp = (o) => { const n = c.createDynamicsCompressor(); for (const [k, v] of Object.entries(o)) n[k].value = v; return n; };
    N = {};
    N.limiter = comp({ threshold: -2.5, knee: 0, ratio: 20, attack: 0.002, release: 0.15 });
    N.master = c.createGain();
    N.master.connect(N.limiter); N.limiter.connect(c.destination);
    N.glue = comp({ threshold: -18, knee: 10, ratio: 2.5, attack: 0.005, release: 0.2 });
    N.sfxDuck = c.createGain(); N.glue.connect(N.sfxDuck); N.sfxDuck.connect(N.master); // dips a little under a voice line
    N.voice = c.createGain(); N.voice.connect(N.master);                                  // the barks (voice.js)
    N.sfx = c.createGain(); N.sfx.connect(N.glue);
    N.ui = c.createGain(); N.ui.connect(N.master);
    N.music = c.createGain(); N.music.connect(N.master);
    N.musicDuck = c.createGain(); N.musicDuck.connect(N.music);
    // the room: a generated impulse response, returned into the glue so it sits with the dry hits
    try {
      N.reverbIn = c.createGain();
      const conv = c.createConvolver(); conv.buffer = roomIR(c);
      N.reverbOut = c.createGain(); N.reverbOut.gain.value = 0.55;
      N.reverbIn.connect(conv); conv.connect(N.reverbOut); N.reverbOut.connect(N.glue);
    } catch { N.reverbIn = null; }
    // white noise for the synths
    const len = Math.floor(c.sampleRate * 1.2);
    N.noise = c.createBuffer(1, len, c.sampleRate);
    const d = N.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    applyVolume();
  }

  // ~0.8 s hospital room: early reflections off tile, then a tail whose top dies faster than its body
  function roomIR(ctx, secs = 0.8, pre = 0.008) {
    const sr = ctx.sampleRate, n = Math.floor(sr * (secs + pre)), ir = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lo = 0;
      for (let i = Math.floor(pre * sr); i < n; i++) {
        const t = i / sr - pre, w = Math.random() * 2 - 1;
        lo += (w - lo) * 0.09;
        d[i] = lo * 2.0 * Math.exp(-6.9 * t / secs) + (w - lo) * 0.4 * Math.exp(-6.9 * t / (secs * 0.3));
      }
      for (const [ms, a] of [[9, 0.45], [14, 0.34], [21, 0.3], [29, 0.24], [37, 0.18], [48, 0.14]]) {
        const i = Math.floor((pre + (ms + (ch ? 2.3 : 0)) / 1000) * sr); if (i < n) d[i] += a * (ch ? -1 : 1) * rand(0.8, 1.2);
      }
    }
    return ir;
  }

  function applyVolume() {
    if (!N) return;
    const t = c.currentTime, set = (node, v) => { node.gain.cancelScheduledValues(t); node.gain.setTargetAtTime(v, t, 0.03); };
    set(N.master, muted ? 0 : curve(vol.master));
    set(N.sfx, curve(vol.sfx) * TRIM.sfx);
    set(N.ui, curve(vol.ui ?? vol.sfx) * TRIM.ui);
    set(N.music, curve(vol.music) * TRIM.music);
    set(N.voice, curve(vol.voice) * TRIM.voice);
  }

  const running = () => !!c && c.state === 'running' && !destroyed;

  // ------------------------------------------------------------------ loading
  function fetchRaw(path) {
    let p = raw.get(path);
    if (p) return p;
    p = (typeof fetch === 'function' ? fetch(base + path) : Promise.reject(new Error('no fetch')))
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null)
      .then((ab) => { if (!ab) failed.add(path); return ab; });
    raw.set(path, p);
    return p;
  }

  function loadFile(path) {
    if (decoded.has(path)) return Promise.resolve(decoded.get(path));
    if (failed.has(path) || !ensureCtx()) return Promise.resolve(null);
    let p = loading.get(path);
    if (p) return p;
    p = fetchRaw(path).then((ab) => {
      if (!ab || !c) return null;
      raw.delete(path); // the decoder detaches the bytes
      return new Promise((res) => {
        let done = false; const ok = (b) => { if (!done) { done = true; res(b); } }, bad = () => { if (!done) { done = true; res(null); } };
        try { const pr = c.decodeAudioData(ab, ok, bad); pr?.then?.(ok, bad); } catch { bad(); }
      });
    }).then((buf) => {
      if (!buf) { failed.add(path); return null; }
      const en = analyse(buf); decoded.set(path, en); return en;
    }).catch(() => { failed.add(path); return null; });
    loading.set(path, p);
    return p;
  }

  // where the sound really starts (first sample over 2% of the peak, less 1 ms) and its loudest-50-ms level
  function analyse(buf) {
    const d = buf.getChannelData(0), sr = buf.sampleRate;
    let pk = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; }
    let start = 0; const th = pk * 0.02;
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > th) { start = Math.max(0, i / sr - 0.001); break; }
    const w = Math.max(1, Math.floor(sr * 0.05)); let best = 0, acc = 0;
    for (let i = 0; i < d.length; i++) { acc += d[i] * d[i]; if (i >= w) acc -= d[i - w] * d[i - w]; if (i >= w - 1 && acc > best) best = acc; }
    const db = 10 * Math.log10(Math.max(1e-12, best / w));
    const norm = Math.max(0.5, Math.min(2, Math.pow(10, (REF_DB - db) / 20)));
    return { buf, start, norm, db: +db.toFixed(1), peak: +(20 * Math.log10(pk || 1e-9)).toFixed(1) };
  }

  const bankFiles = (key) => (BANKS[key]?.layers || []).flatMap((l) => l.files || []);
  const loadBank = (key) => Promise.all(bankFiles(key).map(loadFile));
  // a bank is ready when every recorded layer has at least one decoded take (or nothing left that could load)
  function bankReady(key) {
    for (const l of BANKS[key].layers) {
      if (!l.files?.length) continue;
      if (!l.files.some((f) => decoded.has(f)) && !l.files.every((f) => failed.has(f))) return false;
    }
    return true;
  }

  function startPreload() {
    if (preloading || !c) return; preloading = true;
    const order = [...new Set([...PRELOAD_ORDER, ...Object.keys(BANKS)])].flatMap(bankFiles);
    const queue = [...new Set(order)];
    let active = 0;
    const next = () => {
      while (active < 4 && queue.length) {
        const f = queue.shift(); active++;
        loadFile(f).finally(() => { active--; next(); });
      }
    };
    next();
  }

  // ------------------------------------------------------------------ voices
  function prune() { const t = c.currentTime; voices = voices.filter((v) => v.end > t); }
  function makeVoice(bus, panValue, gain) {
    const out = c.createGain(); out.gain.value = gain;
    let tail = out;
    if (panValue && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, panValue)); out.connect(p); tail = p; }
    tail.connect(bus);
    return out;
  }
  function release(out, at) {
    const ms = Math.max(0, (at - c.currentTime) * 1000) + 600;
    setTimeout(() => { try { out.disconnect(); } catch { /* gone */ } }, ms);
  }

  // the synth kit handed to SYNTHS recipes: everything lands on `out`
  function kit(out) {
    const env = (g, t, gain, attack, dur) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, dur));
    };
    const k = {
      tone({ t, type = 'sine', f = 440, f2, glide, dur = 0.2, gain = 0.1, attack = 0.005, lp, vibrato }) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t);
        if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + (glide || dur));
        let head = o;
        if (lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; fl.Q.value = 0.5; o.connect(fl); head = fl; }
        head.connect(g); g.connect(out); env(g, t, gain, attack, dur);
        let lfo = null;
        if (vibrato) { lfo = c.createOscillator(); const lg = c.createGain(); lfo.frequency.value = vibrato.rate || 6; lg.gain.value = vibrato.depth || 5; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.05); }
        o.start(t); o.stop(t + dur + 0.05);
        o.onended = () => { try { o.disconnect(); g.disconnect(); head !== o && head.disconnect(); lfo?.disconnect(); } catch { /* gone */ } };
      },
      noise({ t, dur = 0.2, gain = 0.1, attack = 0.005, filter = 'bandpass', f = 1000, f2, q = 1 }) {
        const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
        s.buffer = N.noise; s.loop = true;
        fl.type = filter; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
        if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
        s.connect(fl); fl.connect(g); g.connect(out); env(g, t, gain, attack, dur);
        s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
        s.onended = () => { try { s.disconnect(); fl.disconnect(); g.disconnect(); } catch { /* gone */ } };
      },
      // a soft bell: a few sine partials, the higher ones dying sooner
      bell({ t, f = 880, dur = 0.5, gain = 0.05, partials = [[1, 1], [2.01, 0.3], [3.02, 0.12]] }) {
        partials.forEach(([m, a], i) => k.tone({ t, f: f * m, dur: dur / Math.sqrt(i + 1), gain: gain * a, attack: 0.004 }));
      },
    };
    return k;
  }

  function runSynth(name, { vol: v = 1, delay = 0, pan = 0, bus = 'ui', rate = 0, t } = {}) {
    const recipe = SYNTHS[name];
    if (!recipe || !running()) return false;
    const at = t ?? c.currentTime + Math.max(0, delay) + 0.003;
    const last = lastSynth.get(name);
    if (t == null && last != null && Math.abs(at - last) < 0.02) { stats.dropped++; return false; }
    lastSynth.set(name, at);
    const out = makeVoice(N[bus] || N.ui, pan, 1);
    try { recipe(kit(out), { t: at, gain: v, rate }); } catch (err) { console.warn('[audio] synth', name, err); }
    release(out, at + 2);
    stats.synths++;
    return true;
  }

  function play(key, o = {}) {
    try {
      const bank = BANKS[key];
      if (!bank) return SYNTHS[key] ? runSynth(key, o) : false;
      if (!running()) { if (c) loadBank(key); return false; }
      const delay = Math.max(0, o.delay || 0);
      if (!bankReady(key)) {
        // not decoded yet: load it, and play it only if that was quick (a late hit is worse than none)
        const asked = performance.now();
        loadBank(key).then(() => {
          const late = (performance.now() - asked) / 1000;
          if (late < 0.22 && bankReady(key)) { stats.late++; play(key, { ...o, delay: Math.max(0, delay - late) }); }
        });
        return false;
      }
      const t0 = c.currentTime + delay + 0.004;
      let k = 1;
      const last = lastPlay.get(key);
      // inside the cooldown: dropped, or (stack: a sweep hitting three zombies) one softer second layer, then dropped
      if (last != null && Math.abs(t0 - last) < (bank.cooldown || 0)) {
        if (!bank.stack || (stacked.get(key) || 0) >= 1) { stats.dropped++; return false; }
        stacked.set(key, (stacked.get(key) || 0) + 1);
        k = 0.6;
      } else stacked.set(key, 0);
      prune();
      if (voices.length >= MAX_VOICES) {
        if (bank.minor) { stats.dropped++; return false; }
        const victim = voices.find((v) => v.minor) || voices[0];
        try { victim.out.gain.setTargetAtTime(0, c.currentTime, 0.02); } catch { /* gone */ }
        victim.end = 0; prune();
      }
      if (k === 1) lastPlay.set(key, t0);
      const bus = N[bank.bus || 'sfx'] || N.sfx;
      const out = makeVoice(bus, o.pan ?? panFromAt(o.at), (o.vol ?? 1) * (bank.gain ?? 1) * k);
      let end = t0;
      bank.layers.forEach((l, li) => {
        if (l.chance != null && Math.random() > l.chance) return;
        const t = t0 + pick2(l.at);
        if (l.synth) {
          const r = SYNTHS[l.synth];
          if (r) { try { r(kit(out), { t, gain: l.gain ?? 1, rate: l.rate || 0 }); } catch { /* skip */ } }
          end = Math.max(end, t + 1);
          return;
        }
        const f = chooseTake(key + '#' + li, l.files);
        const en = f && decoded.get(f);
        if (!en) return;
        const s = c.createBufferSource(); s.buffer = en.buf;
        const semis = (l.rate || 0) + (l.pitch ? rand(l.pitch[0], l.pitch[1]) : 0) + (o.pitch || 0);
        const pr = Math.pow(2, semis / 12) * (o.rate || 1);
        s.playbackRate.value = pr;
        const g = c.createGain();
        const level = en.norm * (l.gain ?? 1) * Math.pow(10, rand(-1, 1) / 20);
        g.gain.value = level;
        let head = s;
        for (const [type, hz] of [['lowpass', l.lp], ['highpass', l.hp]]) {
          if (!hz) continue;
          const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = hz; fl.Q.value = 0.6; head.connect(fl); head = fl;
        }
        head.connect(g); g.connect(out);
        let wet = null;
        if (l.wet && N.reverbIn) { wet = c.createGain(); wet.gain.value = l.wet * (o.vol ?? 1) * (bank.gain ?? 1) * k; g.connect(wet); wet.connect(N.reverbIn); }
        const offset = l.offset != null ? Math.min(l.offset, en.buf.duration - 0.05) : en.start;
        let stopAt = t + (en.buf.duration - offset) / pr;
        if (l.maxDur) {
          const fade = l.fade || 0.2, endAt = t + l.maxDur;
          g.gain.setValueAtTime(level, Math.max(t, endAt - fade));
          g.gain.linearRampToValueAtTime(0.0001, endAt);
          stopAt = Math.min(stopAt, endAt + 0.02);
        }
        s.start(t, Math.max(0, offset));
        s.stop(stopAt + 0.01);
        s.onended = () => { try { s.disconnect(); g.disconnect(); wet?.disconnect(); if (head !== s) head.disconnect(); } catch { /* gone */ } };
        end = Math.max(end, stopAt);
      });
      voices.push({ out, end, minor: !!bank.minor, key });
      release(out, end);
      if (bank.duck) duck(bank.duck.ms, bank.duck.amount, delay);
      stats.played++;
      return true;
    } catch (err) {
      console.warn('[audio] play', key, err);
      return false;
    }
  }

  // a random take from a layer, never the one it played last time
  function chooseTake(lkey, files) {
    const have = files.filter((f) => decoded.has(f));
    if (!have.length) return null;
    let i = Math.floor(Math.random() * have.length);
    if (have.length > 1 && have[i] === lastTake.get(lkey)) i = (i + 1 + Math.floor(Math.random() * (have.length - 1))) % have.length;
    lastTake.set(lkey, have[i]);
    return have[i];
  }

  function panFromAt(at) {
    if (at == null || !hasWindow) return 0;
    if (typeof at === 'object') { if (typeof at.pan === 'number') return at.pan; at = at.x; }
    if (typeof at !== 'number' || !isFinite(at)) return 0;
    const w = window.innerWidth || 1;
    return Math.max(-1, Math.min(1, (at / w) * 2 - 1)) * 0.8;
  }

  // ------------------------------------------------------------------ ducking and the heartbeat
  function duck(ms = 600, amount = 0.35, delay = 0) {
    if (!N || !c) return;
    try {
      const g = N.musicDuck.gain, t = c.currentTime + Math.max(0, delay);
      const until = t + Math.max(0.05, ms / 1000);
      duckLevel = c.currentTime < duckUntil ? Math.min(duckLevel, amount) : amount;
      duckUntil = Math.max(duckUntil, until);
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(duckLevel, t + 0.06);
      g.setValueAtTime(duckLevel, duckUntil);
      g.linearRampToValueAtTime(1, duckUntil + 0.7);
    } catch { /* ignore */ }
  }

  // the low-HP heartbeat: 0 off, 1 slow (~61 bpm), 2 faster and deeper (~83 bpm, at 15% HP or less)
  function heartbeat(level) {
    level = Math.max(0, Math.min(2, Math.round(+level || 0)));
    if (level === beatLevel) return;
    beatLevel = level;
    clearTimeout(beatTimer);
    if (!level) return;
    const beat = () => {
      if (!beatLevel || destroyed) return;
      if (!(hasWindow && document.hidden)) play(beatLevel >= 2 ? 'heartbeat_deep' : 'heartbeat', { pan: -0.3, vol: beatLevel >= 2 ? 1 : 0.85 });
      beatTimer = setTimeout(beat, beatLevel >= 2 ? 720 : 980);
    };
    beatTimer = setTimeout(beat, 250);
  }

  // ------------------------------------------------------------------ music
  const music = createMusic({ base, bus: () => N?.musicDuck || null, ctx: () => c });

  // ------------------------------------------------------------------ voice barks (voice.js): their own bus, ducking the rest
  const voice = createVoice({
    base, load: loadFile, ctx: () => (running() ? c : null), bus: () => N?.voice || null, settings: opts.settings,
    prefetch: hasWindow && opts.preload !== false,
    duck: (sec) => {
      duck(sec * 1000 + 150, 0.6);
      try { const g = N.sfxDuck.gain, t = c.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(0.78, t, 0.03); g.setTargetAtTime(1, t + sec + 0.1, 0.12); } catch { /* ignore */ }
    },
  });

  // ------------------------------------------------------------------ the event map
  const events = createEventSounds({
    play: (key, o) => play(key, o),
    synth: (name, o = {}) => runSynth(name, { ...o, bus: 'ui' }),
    duck, heartbeat,
    music: (track, o) => music.play(track, o),
    locate: opts.locate || null,
    autoMusic: opts.autoMusic !== false,
    has: (k) => !!BANKS[k] || !!SYNTHS[k],
  });

  // ------------------------------------------------------------------ unlock, visibility
  function unlock() {
    if (destroyed) return false;
    const ctx = ensureCtx();
    if (!ctx) return false;
    try { if (ctx.state !== 'running') ctx.resume().catch(() => {}); } catch { /* ignore */ }
    if (!unlocked) {
      unlocked = true;
      if (isIOS()) {
        try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
        try { if (SILENT_WAV) { const el = new Audio(SILENT_WAV); el.loop = true; el.setAttribute('playsinline', ''); el.play()?.catch?.(() => {}); N.keepAlive = el; } } catch { /* ignore */ }
      }
      if (opts.preload !== false) { startPreload(); setTimeout(() => voice.preload(), 1500); }
    }
    music.unlock();
    return true;
  }

  // fetch the sound files' bytes while the page is idle (no gesture needed); they decode quickly on unlock
  if (hasWindow && opts.preload !== false) {
    const prefetch = () => {
      if (destroyed) return;
      const queue = [...new Set([...new Set([...PRELOAD_ORDER, ...Object.keys(BANKS)])].flatMap(bankFiles))];
      let active = 0;
      const next = () => { while (active < 3 && queue.length) { const f = queue.shift(); if (decoded.has(f) || loading.has(f)) continue; active++; fetchRaw(f).finally(() => { active--; next(); }); } };
      next();
    };
    setTimeout(() => (window.requestIdleCallback ? window.requestIdleCallback(prefetch, { timeout: 4000 }) : prefetch()), 2500);
  }

  if (hasWindow && opts.autoUnlock !== false) {
    const onGesture = () => { if (!c || c.state !== 'running' || !unlocked) unlock(); else music.unlock(); };
    for (const type of ['pointerdown', 'keydown', 'touchend', 'mousedown']) {
      window.addEventListener(type, onGesture, { capture: true, passive: true });
      listeners.push(() => window.removeEventListener(type, onGesture, { capture: true }));
    }
  }
  if (hasWindow && typeof document !== 'undefined') {
    const onVis = () => {
      if (!c) return;
      try {
        if (document.hidden) { music.suspend(); c.suspend?.().catch?.(() => {}); }
        else { c.resume?.().catch?.(() => {}); music.resume(); }
      } catch { /* ignore */ }
    };
    document.addEventListener('visibilitychange', onVis);
    listeners.push(() => document.removeEventListener('visibilitychange', onVis));
    const onShow = (e) => { if (e.persisted) onVis(); };
    window.addEventListener('pageshow', onShow);
    listeners.push(() => window.removeEventListener('pageshow', onShow));
  }

  const safe = (fn, fallback) => (...a) => { try { return fn(...a); } catch (err) { console.warn('[audio]', err); return fallback; } };

  // ------------------------------------------------------------------ the public API
  const api = {
    unlock: safe(unlock, false),
    get unlocked() { return unlocked && running(); },
    get context() { return c; },

    sfx: safe((key, o = {}) => play(key, o), false),
    event: (evt) => { try { events.handle(evt); } catch (err) { console.warn('[audio]', err); } voice.event(evt); },
    voice,
    ui: safe((name, o = {}) => {
      const k = UI[name] || (SYNTHS[name] || BANKS[name] ? name : 'click');
      return BANKS[k] ? play(k, o) : runSynth(k, { ...o, bus: 'ui' });
    }, false),
    music: safe((track, o) => music.play(track, o)),
    setVolume: safe((v = {}) => {
      if ('voices' in v) voice.setEnabled(v.voices == null ? null : !!v.voices);
      for (const k of ['master', 'music', 'sfx', 'ui', 'voice']) {
        if (v[k] == null || !isFinite(+v[k])) continue;
        const x = +v[k] > 1 ? +v[k] / 100 : +v[k];          // 0..1 (or 0..100 from a raw slider)
        vol[k] = Math.max(0, Math.min(1, x));
      }
      applyVolume();
    }),
    get volume() { return { ...vol }; },
    mute: safe((on = true) => { muted = !!on; applyVolume(); }),
    duck: safe((ms, amount) => duck(ms, amount)),

    // map footsteps: n steps on the tile, left-right
    walk: safe((n = 4, { interval = 0.27, vol: v = 1 } = {}) => {
      for (let i = 0; i < n; i++) play('step', { delay: i * interval, pan: i % 2 ? 0.12 : -0.12, vol: v * (i === n - 1 ? 0.8 : 1) });
    }),
    // a room's door as you enter: 'open' | 'shut' | 'lift' (the boss elevator)
    door: safe((kind = 'open') => play({ open: 'door', shut: 'door_shut', lift: 'lift_open', lift_close: 'lift_close' }[kind] || 'door')),
    setLoadout: safe((w) => events.setLoadout(w)),
    setParty: safe((p) => { events.setParty(p); voice.setParty(p); }),
    // the HUD's onLowHp(bool): start / stop the heartbeat (the event map also does this from the party's HP)
    lowHp: safe((on) => heartbeat(on === true ? 1 : on || 0)),
    resetCombat: safe(() => { events.reset(); voice.reset(); }),
    // fetch the files now (no decode needed: works before the first gesture); 'all' or a list of bank keys / tracks
    preload: safe((what = 'all') => {
      const keys = what === 'all' ? Object.keys(BANKS) : [].concat(what);
      for (const k of keys) { if (TRACKS[k]) music.preload(k); else bankFiles(k).forEach(fetchRaw); }
    }),
    stopAll: safe(() => {
      if (!c) return; const t = c.currentTime;
      for (const v of voices) { try { v.out.gain.setTargetAtTime(0, t, 0.02); } catch { /* gone */ } }
      voices = []; heartbeat(0); voice.stop();
    }),
    has: (key) => !!BANKS[key] || !!SYNTHS[key] || !!UI[key],
    keys: () => ({ banks: Object.keys(BANKS), synths: Object.keys(SYNTHS), ui: Object.keys(UI), tracks: Object.keys(TRACKS) }),
    // an AnalyserNode on the master output (for meters and tests)
    meter: safe(() => {
      if (!ensureCtx()) return null;
      if (!N.analyser) { N.analyser = c.createAnalyser(); N.analyser.fftSize = 2048; N.limiter.connect(N.analyser); }
      return N.analyser;
    }, null),
    state: () => ({
      ctx: c ? c.state : 'none', unlocked, sampleRate: c?.sampleRate || 0, volume: { ...vol }, muted,
      files: filesInUse().length, decoded: decoded.size, failed: [...failed], voices: c ? (prune(), voices.length) : 0,
      stats: { ...stats }, heartbeat: beatLevel, duck: N ? +N.musicDuck.gain.value.toFixed(3) : 1,
      music: music.state(), combat: events.state, voice: (({ log, ...v }) => v)(voice.state()),
    }),
    // per-file measurements after decode (lab)
    measurements: () => Object.fromEntries([...decoded.entries()].map(([f, en]) => [f, { db: en.db, peak: en.peak, norm: +en.norm.toFixed(2), start: +en.start.toFixed(3), dur: +en.buf.duration.toFixed(2) }])),
    destroy: safe(() => {
      destroyed = true; clearTimeout(beatTimer); music.play(null, { fade: 0.2 }); voice.stop();
      listeners.forEach((off) => off());
      setTimeout(() => { try { c?.close(); } catch { /* ignore */ } }, 300);
    }),
  };
  return api;
}

export { BANKS, SYNTHS, UI, TRACKS, filesInUse };
