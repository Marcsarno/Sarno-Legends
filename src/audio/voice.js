// Voice barks: Marc and Yola say a few words during fights, and the Shield Guard mutters fragments of his old job.
// The lines are PLACEHOLDERS for Marc to rewrite (tools/voice/lines.json -> tools/voice/generate.py -> public/assets/voice/).
// Regular zombies never speak (they have their groans in sfx.js).
//
//   const voice = createVoice({ base, ctx, bus, load, duck, settings })     (audio.js makes one; nothing here throws)
//     ctx()      -> a running AudioContext or null        bus() -> the 'voice' GainNode (its volume is the voice slider)
//     load(path) -> Promise<{ buf } | null> (audio.js's cached decoder)   duck(sec) -> music and sfx dip under a line
//     settings() -> { voices, speed } (optional; falls back to the game's live settings, window.__SL.app.settings())
//   voice.event(evt)          every combat event and director { t: 'fx' } moment (audio.event routes them here)
//   voice.say(speaker, trigger, { variant, force })   play a line now (the lab); force skips the rules
//   voice.setEnabled(bool | null)  voice.setSpeed(x | null)   explicit overrides (null = follow the settings)
//   voice.setParty({ hp, maxHp })  voice.reset()  voice.stop()  voice.preload()  voice.manifest()  voice.state()
//   voice.on(fn)              fn({ type: 'line' | 'skip', speaker, trigger, text, file, reason, evt }) -> unsubscribe
//
// The rules, so it never gets annoying: one line at a time; a global gap since the last line started (shorter for kills
// and finishers, none for the boss, victory and defeat); a chance per trigger; a per-trigger cooldown; a shuffle bag
// per trigger so a variant never repeats until the others have played (and never twice in a row); when both heroes
// could answer, the one who didn't speak last does; at 2x speed the chatter (low) triggers are skipped and at 1.5x
// they're rarer. A higher-priority line takes the slot from a lower one that hasn't started yet, waits for a short one
// that is playing, and the boss / defeat lines (priority 4) cut in. Marc and Yola are panned left, the boss right.

// trigger -> pr (priority 0..4), chance, gap (s since any line started; ignored if this line outranks it), own
// (s since this speaker's trigger last spoke), delay (s after the event, divided by the game speed), wait (s it may
// queue behind a playing line), low (chatter: skipped at 2x)
export const RULES = {
  swing:       { pr: 0, chance: 0.12, gap: 7,   own: 20, delay: 0.05, low: true },
  shot:        { pr: 0, chance: 0.12, gap: 7,   own: 20, delay: 0.05, low: true },
  turn:        { pr: 0, chance: 0.08, gap: 9,   own: 40, delay: 0.6,  low: true },
  block:       { pr: 0, chance: 0.2,  gap: 6,   own: 15, delay: 0.1,  low: true },
  dodge:       { pr: 0, chance: 0.25, gap: 6,   own: 15, delay: 0.1,  low: true },
  stagger:     { pr: 1, chance: 0.35, gap: 6,   own: 10, delay: 0.3,  low: true },
  praise_marc: { pr: 1, chance: 0.35, gap: 6,   own: 10, delay: 0.35, low: true },
  cash_in:     { pr: 1, chance: 0.35, gap: 6,   own: 10, delay: 0.2,  low: true },
  hurt:        { pr: 1, chance: 0.3,  gap: 6,   own: 10, delay: 0.15, low: true },
  yola_hurt:   { pr: 1, chance: 0.3,  gap: 6,   own: 10, delay: 0.2,  low: true },
  marc_hurt:   { pr: 1, chance: 0.3,  gap: 6,   own: 10, delay: 0.2,  low: true },
  heal:        { pr: 1, chance: 0.6,  gap: 5,   own: 12, delay: 0.15 },
  big_hit:     { pr: 2, chance: 0.6,  gap: 4,   own: 8,  delay: 0.25, wait: 0.8 },
  kill:        { pr: 2, chance: 0.5,  gap: 3.5, own: 6,  delay: 0.35, wait: 0.8 },
  praise_yola: { pr: 2, chance: 0.5,  gap: 3.5, own: 6,  delay: 0.45, wait: 0.8 },
  low_hp:      { pr: 2, chance: 1,    gap: 2,   own: 30, delay: 0.6,  wait: 1.5 },
  finisher:    { pr: 3, chance: 0.9,  gap: 2,   own: 3,  delay: 0.9,  wait: 2 },
  elite:       { pr: 3, chance: 0.9,  gap: 0,   own: 0,  delay: 1.3,  wait: 3 },
  boss:        { pr: 3, chance: 1,    gap: 0,   own: 0,  delay: 0.4,  wait: 6 },
  victory:     { pr: 3, chance: 0.85, gap: 0,   own: 0,  delay: 0.9,  wait: 4 },
  defeat:      { pr: 4, chance: 1,    gap: 0,   own: 0,  delay: 0.35 },
  start:       { pr: 4, chance: 1,    gap: 0,   own: 0,  delay: 2.3 },   // the guard, after the boss sting and his steps
  shift:       { pr: 4, chance: 1,    gap: 0,   own: 8,  delay: 0.6 },   // the guard raises his shield
  death:       { pr: 4, chance: 1,    gap: 0,   own: 0,  delay: 0.2 },   // the guard falls
};
const PAN = { marc: -0.35, yola: -0.55, guard: 0.5 };
const GAIN = { marc: 1, yola: 1, guard: 1.1 };
const BIG_CARDS = new Set(['home_run', 'grand_slam', 'overhead_smash']);
const TAIL_MS = 250;              // quiet after a line before the next may start
const MIN_GAP = 2;                // s between the starts of two lines offered fresh (a queued line may follow at once)
const LOG_MAX = 60;

export function createVoice(o = {}) {
  const hasWindow = typeof window !== 'undefined';
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const base = o.base || './assets/';
  let man = null, manP = null, forcedOn = null, forcedSpeed = null;

  // ---- per-session state
  let current = null;             // { speaker, trigger, pr, src, out, endsAt, file }
  let reserved = null;            // a line scheduled to start: { speaker, trigger, pr, timer, at }
  let queued = null;              // a line waiting for the current one: { cands, rule, evt, expires }
  let queueTimer = 0;
  let lastStart = -1e9, lastPr = -1, lastHero = null, ids = 0;
  const lastBy = new Map();       // 'marc.kill' -> perf ms it last started
  const bags = new Map();         // 'marc.kill' -> remaining variant indices
  const lastIdx = new Map();      // 'marc.kill' -> the variant played last
  const listeners = new Set();
  const stats = { lines: 0, skipped: {} };
  const log = [];
  // ---- per-combat state
  let enemies = new Map(), ended = false, lowSaid = false, lastCard = null, cardSaid = new Set(), shiftAt = 0;
  let hp = null, maxHp = 80;

  const live = () => { try { return (o.settings ? o.settings() : hasWindow && window.__SL?.app?.settings?.()) || {}; } catch { return {}; } };
  const enabled = () => (forcedOn != null ? forcedOn : live().voices !== false);
  const speed = () => { const s = forcedSpeed ?? +live().speed; return s > 0 && isFinite(s) ? s : 1; };
  const lines = (sp, tr) => man?.speakers?.[sp]?.triggers?.[tr] || [];
  const emit = (x) => { log.push({ ...x, at: Math.round(now()) }); if (log.length > LOG_MAX) log.shift(); listeners.forEach((fn) => { try { fn(x); } catch { /* listener */ } }); };
  const skip = (reason, sp, tr, evt) => { stats.skipped[reason] = (stats.skipped[reason] || 0) + 1; emit({ type: 'skip', reason, speaker: sp, trigger: tr, evt: evt?.t }); return false; };

  function loadManifest() {
    if (man || manP) return manP || Promise.resolve(man);
    manP = (typeof fetch === 'function' ? fetch(base + 'voice/manifest.json') : Promise.reject(new Error('no fetch')))
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((m) => { man = m && m.speakers ? m : null; if (!man) manP = null; return man; });
    return manP;
  }

  // a shuffle bag per trigger: every variant once before any repeats, never the same one twice in a row
  function pickVariant(key, n) {
    let bag = bags.get(key);
    if (!bag || !bag.length) {
      bag = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      if (n > 1 && bag[bag.length - 1] === lastIdx.get(key)) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      bags.set(key, bag);
    }
    const i = bag.pop();
    lastIdx.set(key, i);
    return i;
  }

  const longest = (sp, tr) => Math.max(0.8, ...lines(sp, tr).map((r) => r.dur || 0));
  function busyUntil() {
    if (reserved) return reserved.at + reserved.est * 1000 + TAIL_MS;
    return current ? current.endsAt + TAIL_MS : 0;
  }

  // ---- the decision: cands = [[speaker, trigger], ...], the first is the natural speaker
  function offer(cands, evt, { force = false } = {}) {
    if (!enabled() && !force) return skip('off', cands[0]?.[0], cands[0]?.[1], evt);
    if (!man) { loadManifest(); return skip('loading', cands[0]?.[0], cands[0]?.[1], evt); }
    const [sp0, tr0] = cands[0];
    const rule = RULES[tr0] || RULES.kill;
    const t = now(), x = speed();
    let list = cands.filter(([s, tr]) => lines(s, tr).length);
    if (!list.length) return skip('no lines', sp0, tr0, evt);
    if (!force) {
      if (rule.low && x >= 2) return skip('speed', sp0, tr0, evt);
      const chance = rule.chance * (rule.low && x >= 1.5 ? 0.6 : 1);
      if (Math.random() >= chance) return skip('chance', sp0, tr0, evt);
      list = list.filter(([s, tr]) => t - (lastBy.get(s + '.' + tr) ?? -1e9) >= (RULES[tr]?.own ?? rule.own) * 1000);
      if (!list.length) return skip('repeat', sp0, tr0, evt);
    }
    // the hero who didn't speak last answers, when either could
    const pickOne = () => (list.find(([s]) => s !== 'guard' && s !== lastHero) || list[0]);

    if (!force) {
      const busy = busyUntil() > t;
      if (busy) {
        const other = reserved || current;
        if (rule.pr >= 4) stop(0.08);                                     // the boss / defeat cut in
        else if (reserved && reserved.pr < rule.pr) cancelReserved();     // take the slot from a smaller line
        else if (rule.wait && (rule.pr > (other?.pr ?? -1) || rule.pr >= 3) && busyUntil() - t <= rule.wait * 1000 + (reserved ? 4000 : 0)) {
          if (!queued || queued.rule.pr <= rule.pr) {
            queued = { cands: list, rule, evt, behind: other?.id, expires: Math.max(t + rule.wait * 1000, busyUntil() + 1500) };
            armQueue();
            return true;
          }
          return skip('busy', sp0, tr0, evt);
        } else return skip('busy', sp0, tr0, evt);
      }
      if (rule.pr < 3 && t - lastStart < MIN_GAP * 1000) return skip('cooldown', sp0, tr0, evt);
      if (t - lastStart < rule.gap * 1000 && rule.pr <= lastPr) return skip('cooldown', sp0, tr0, evt);
    } else stop(0.05);
    const [sp, tr] = pickOne();
    schedule(sp, tr, rule, (rule.delay || 0) / Math.max(1, x), evt, { force });
    return true;
  }

  function schedule(sp, tr, rule, delay, evt, opt = {}) {
    cancelReserved();
    const r = { id: ++ids, speaker: sp, trigger: tr, pr: rule.pr, at: now() + delay * 1000, est: longest(sp, tr), timer: 0 };
    r.timer = setTimeout(() => { if (reserved === r) { reserved = null; start(sp, tr, rule, evt, { ...opt, id: r.id }); } }, Math.max(0, delay * 1000));
    reserved = r;
  }
  function cancelReserved() { if (reserved) { clearTimeout(reserved.timer); reserved = null; } }

  function armQueue() {
    clearTimeout(queueTimer);
    if (!queued) return;
    const wait = Math.max(0, busyUntil() - now());
    queueTimer = setTimeout(() => {
      const q = queued;
      if (!q) return;
      if (busyUntil() > now() + 5) {
        if ((reserved || current)?.id === q.behind) q.expires = Math.max(q.expires, busyUntil() + 1500); // still the line it waits for
        armQueue(); return;
      }
      queued = null;
      if (now() > q.expires) { skip('expired', q.cands[0][0], q.cands[0][1], q.evt); return; }
      const [sp, tr] = q.cands.find(([s]) => s !== 'guard' && s !== lastHero) || q.cands[0];
      schedule(sp, tr, q.rule, 0.05, q.evt);
    }, wait + 10);
  }

  async function start(sp, tr, rule, evt, { variant, force, id } = {}) {
    if (!enabled() && !force) return skip('off', sp, tr, evt);
    const c = o.ctx?.(), bus = o.bus?.();
    if (!c || !bus || c.state !== 'running') return skip('locked', sp, tr, evt);
    const rows = lines(sp, tr);
    if (!rows.length) return skip('no lines', sp, tr, evt);
    const key = sp + '.' + tr;
    const i = variant != null ? Math.max(0, Math.min(rows.length - 1, variant)) : pickVariant(key, rows.length);
    const row = rows[i];
    // claim the slot while it decodes (usually instant: preload() decodes everything after the first tap)
    const claim = { id, speaker: sp, trigger: tr, pr: rule.pr, endsAt: now() + 400, file: row.file };
    current = claim;
    const asked = now();
    let en = null;
    try { en = await o.load?.(row.file); } catch { en = null; }
    if (current !== claim) return false;                                  // something cut in meanwhile
    if (!en?.buf || now() - asked > 450) { current = null; armQueue(); return skip(en?.buf ? 'late' : 'missing', sp, tr, evt); }
    try {
      const out = c.createGain();
      out.gain.value = GAIN[sp] ?? 1;
      let tail = out;
      if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = PAN[sp] ?? 0; out.connect(p); tail = p; }
      tail.connect(bus);
      const src = c.createBufferSource();
      src.buffer = en.buf;
      src.connect(out);
      src.start(c.currentTime + 0.01);
      const dur = en.buf.duration;
      claim.src = src; claim.out = out; claim.tail = tail; claim.endsAt = now() + dur * 1000 + 10;
      src.onended = () => {
        try { src.disconnect(); out.disconnect(); if (tail !== out) tail.disconnect(); } catch { /* gone */ }
        if (current === claim) { current = null; armQueue(); }
      };
      lastStart = now(); lastPr = rule.pr; lastBy.set(key, lastStart);
      if (sp !== 'guard') lastHero = sp;
      stats.lines++;
      o.duck?.(dur);
      emit({ type: 'line', speaker: sp, trigger: tr, text: row.text, file: row.file, variant: i, dur: +dur.toFixed(2), evt: evt?.t });
      return true;
    } catch (err) {
      current = null;
      return skip('error', sp, tr, evt);
    }
  }

  function stop(fade = 0.08) {
    cancelReserved();
    const cur = current;
    current = null;
    if (cur?.out) {
      try {
        const c = o.ctx?.(), t = c?.currentTime ?? 0;
        cur.out.gain.setTargetAtTime(0, t, fade / 3);
        cur.src.stop(t + fade + 0.02);
      } catch { /* gone */ }
    }
  }

  // ---- the event map
  const recentCard = (ms = 2000) => lastCard && now() - lastCard.at < ms;
  const oncePerCard = (tag) => { if (!lastCard) return true; const k = lastCard.uid + ':' + tag; if (cardSaid.has(k)) return false; cardSaid.add(k); return true; };

  function setHp(v, m) {
    if (typeof m === 'number' && m > 0) maxHp = m;
    if (typeof v !== 'number') return;
    hp = v;
    if (hp > maxHp * 0.45) lowSaid = false;
  }

  function lowCheck(evt) {
    if (lowSaid || ended || hp == null || hp <= 0 || hp > maxHp * 0.3) return;
    if (offer([['marc', 'low_hp'], ['yola', 'low_hp']], evt)) lowSaid = true;
  }

  function end(won, evt) {
    if (ended) return;
    ended = true;
    if (won) offer([['marc', 'victory'], ['yola', 'victory']], evt);
    else offer([['marc', 'defeat'], ['yola', 'defeat']], evt);
  }

  function handle(e) {
    if (!e || typeof e !== 'object') return;
    if (!enabled() && (current || reserved)) stop(0.1);
    switch (e.t) {
      case 'combat_start': {
        resetCombat();
        for (const s of e.enemies || []) enemies.set(s.uid, s.id);
        if (typeof e.maxHp === 'number') maxHp = e.maxHp;
        if (e.boss || [...enemies.values()].includes('shield_guard')) {
          offer([['guard', 'start']], e);
          offer([['marc', 'boss'], ['yola', 'boss']], e);
        } else if (e.elite) offer([['marc', 'elite'], ['yola', 'elite']], e);
        break;
      }
      case 'turn_start':
        if (e.side === 'player' && e.turn > 1) offer([['marc', 'turn']], e);
        break;
      case 'card_played': {
        lastCard = { uid: e.uid, id: e.id, hero: e.hero, anim: e.anim || '', at: now() };
        const a = lastCard.anim;
        if (e.hero === 'marc' && /^melee/.test(a)) offer([['marc', 'swing']], e);
        else if (e.hero === 'yola' && /pistol|shotgun/.test(a)) offer([['yola', 'shot']], e);
        else if (a === 'block' || a === 'dodge') offer(e.hero === 'yola' ? [['yola', 'dodge']] : [['marc', 'block']], e);
        else if (a === 'heal' && e.hero === 'yola') offer([['yola', 'heal']], e);
        break;
      }
      case 'damage': {
        if (e.target === 'party') {
          setHp(e.hp);
          if (e.amount > 0 && !e.killed && e.kind !== 'self' && e.kind !== 'bleed' && (e.hit ?? 1) === 1) {
            const h = e.hero === 'yola' ? 'yola' : 'marc', other = h === 'marc' ? 'yola' : 'marc';
            offer([[h, 'hurt'], [other, h + '_hurt']], e);
          }
          lowCheck(e);
          break;
        }
        if (e.killed || !(e.amount > 0)) break;
        const by = e.source === 'marc' || e.source === 'yola' ? e.source : null;
        if (by === 'yola' && e.staggered && recentCard() && oncePerCard('cash')) offer([['yola', 'cash_in']], e);
        else if (by === 'marc' && ((e.kind === 'heavy' && BIG_CARDS.has(lastCard?.id)) || e.amount >= 14) && oncePerCard('big')) offer([['marc', 'big_hit']], e);
        break;
      }
      case 'status':
        if (e.status === 'vulnerable' && e.delta > 0 && e.target !== 'party' && lastCard?.hero === 'marc' && recentCard() && oncePerCard('stag')) {
          offer([['marc', 'stagger'], ['yola', 'praise_marc']], e);
        }
        break;
      case 'heal':
        if (e.target === 'party') setHp(e.hp, e.maxHp);
        break;
      case 'death': {
        if (enemies.get(e.target) === 'shield_guard') { offer([['guard', 'death']], e); break; }
        const big = BIG_CARDS.has(lastCard?.id) && recentCard(2500) && lastCard.hero === 'marc';
        if (e.by === 'marc') offer(e.finisher ? [['marc', 'finisher']] : big ? [['marc', 'big_hit']] : [['marc', 'kill']], e);
        else if (e.by === 'yola') offer(e.finisher ? [['yola', 'finisher']] : [['yola', 'kill'], ['marc', 'praise_yola']], e);
        break;
      }
      case 'mode_shift':
        if (e.mode === 'defensive' && now() - shiftAt > 1500) { shiftAt = now(); offer([['guard', 'shift']], e); }
        break;
      case 'combat_end': end(!!e.won, e); break;
      case 'fx':
        if (e.name === 'victory') end(true, e);
        else if (e.name === 'defeat') end(false, e);
        else if (e.name === 'mode_shift' && e.mode === 'defensive' && now() - shiftAt > 1500) { shiftAt = now(); offer([['guard', 'shift']], e); }
        break;
      default: break;
    }
  }

  function resetCombat() {
    enemies = new Map(); ended = false; lowSaid = false; lastCard = null; cardSaid = new Set(); shiftAt = 0;
    queued = null; clearTimeout(queueTimer);
  }

  // decode every line in the background (after the first tap), a couple at a time
  let preloading = null;
  function preload() {
    if (preloading) return preloading;
    preloading = loadManifest().then((m) => {
      if (!m || !o.load) { preloading = null; return 0; }
      const files = Object.values(m.speakers).flatMap((s) => Object.values(s.triggers).flat().map((r) => r.file));
      let i = 0, done = 0;
      const worker = async () => { while (i < files.length) { const f = files[i++]; try { if (await o.load(f)) done++; } catch { /* skip */ } } };
      return Promise.all([worker(), worker()]).then(() => done);
    });
    return preloading;
  }
  if (o.prefetch !== false) loadManifest();

  const safe = (fn, fb) => (...a) => { try { return fn(...a); } catch (err) { console.warn('[voice]', err); return fb; } };
  return {
    event: safe(handle),
    say: safe((sp, tr, { variant, force = true } = {}) => {
      if (!man) { loadManifest(); return false; }
      if (force) { stop(0.05); queued = null; schedule(sp, tr, RULES[tr] || RULES.kill, 0, { t: 'lab' }, { variant, force: true }); return true; }
      return offer([[sp, tr]], { t: 'lab' });
    }, false),
    // play any file from the manifest (the lab's audition samples)
    playFile: safe(async (file, sp = 'marc') => {
      stop(0.05); queued = null;
      const c = o.ctx?.(), bus = o.bus?.(); if (!c || !bus) return false;
      const en = await o.load?.(file); if (!en?.buf) return false;
      const out = c.createGain(); out.gain.value = GAIN[sp] ?? 1; out.connect(bus);
      const src = c.createBufferSource(); src.buffer = en.buf; src.connect(out); src.start();
      const claim = { speaker: sp, trigger: 'audition', pr: 4, src, out, endsAt: now() + en.buf.duration * 1000, file };
      current = claim; src.onended = () => { try { out.disconnect(); } catch { /* gone */ } if (current === claim) current = null; };
      o.duck?.(en.buf.duration);
      emit({ type: 'line', speaker: sp, trigger: 'audition', file, dur: +en.buf.duration.toFixed(2) });
      return true;
    }, false),
    setEnabled: safe((on) => { forcedOn = on == null ? null : !!on; if (!enabled()) stop(0.1); }),
    setSpeed: safe((x) => { forcedSpeed = x == null ? null : +x || 1; }),
    setParty: safe(({ hp: v, maxHp: m } = {}) => setHp(v ?? hp, m)),
    reset: safe(() => { stop(0.1); resetCombat(); }),
    stop: safe(() => { stop(0.08); queued = null; clearTimeout(queueTimer); }),
    preload: safe(preload, Promise.resolve(0)),
    manifest: () => loadManifest(),
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    get enabled() { return enabled(); },
    state: () => ({
      enabled: enabled(), speed: speed(), loaded: !!man, lines: stats.lines, skipped: { ...stats.skipped },
      speaking: current ? { speaker: current.speaker, trigger: current.trigger, file: current.file } : null,
      reserved: reserved ? { speaker: reserved.speaker, trigger: reserved.trigger } : null,
      queued: queued ? { trigger: queued.cands[0][1] } : null, lastHero, hp, maxHp, log: log.slice(),
    }),
  };
}
