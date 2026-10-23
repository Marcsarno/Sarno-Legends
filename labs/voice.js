// Voice lab (port 5188): every bark line on a button, the candidate voices side by side, and the bark rules at work.
//   - Pick the voices: the same 4 lines in every candidate Kokoro voice; "Use" puts it in the regenerate command.
//   - Every line: each speaker's triggers (from tools/voice/lines.json, PLACEHOLDER text) with the rule the game uses.
//   - Try the rules: a busy made-up fight, or the real engine playing itself (src/game/combat.js), fed through
//     audio.event() as the director would; the log shows each line said and each one held back (and why).
// URL: ?auto=1 unlock at load (headless)   ?speed=2 game speed   ?music=1 the fight music under it (hear the ducking)
// window.__vlab = { audio, voice, manifest, script, busy(), fight(enc), decodeAll(), stop(), said } for Playwright.
import '../src/ui/styles/base.css';
import { createAudio } from '../src/audio/audio.js';
import { RULES } from '../src/audio/voice.js';
import { createCombat } from '../src/game/combat.js';
import { makeStarterDeck, makeCard, CARDS } from '../src/game/content/cards.js';
import { ENCOUNTERS } from '../src/game/content/encounters.js';
import script from '../tools/voice/lines.json';
import { h, $ } from '../src/ui/dom.js';

const Q = new URLSearchParams(location.search);
let speed = [1, 1.5, 2].includes(+Q.get('speed')) ? +Q.get('speed') : 1;
let on = true;
const audio = createAudio({ base: new URL('../assets/', location.href).href, autoMusic: false, settings: () => ({ voices: on, speed }) });
const voice = audio.voice;
window.__audio = audio;

const SPEAKER_CLASS = { marc: 'marc', yola: 'yola', guard: 'guard' };
const pct = (x) => Math.round(x * 100) + '%';

// ---------------------------------------------------------------- the log
let logEl = null;
const t0 = performance.now();
function log(text, cls = '') {
  if (!logEl) return;
  const line = h('div', { class: cls }, `${((performance.now() - t0) / 1000).toFixed(1).padStart(6)}  ${text}`);
  logEl.append(line);
  while (logEl.childElementCount > 400) logEl.firstChild.remove();
  logEl.scrollTop = logEl.scrollHeight;
}
const said = [];
voice.on((x) => {
  if (x.type === 'line') {
    said.push({ ...x, at: performance.now() });
    log(`${x.speaker.padEnd(5)} ${String(x.trigger).padEnd(12)} "${x.text || x.file}"  ${x.dur}s${x.evt ? '  <- ' + x.evt : ''}`, 's');
    flash(x.file, x.dur);
  } else if (x.type === 'skip' && x.reason !== 'chance') {
    log(`  held back ${x.speaker}.${x.trigger}: ${x.reason}${x.evt ? '  <- ' + x.evt : ''}`, 'k');
  }
});

const buttons = new Map(); // file -> [button]
function flash(file, dur) {
  for (const b of buttons.get(file) || []) { b.classList.add('playing'); setTimeout(() => b.classList.remove('playing'), Math.max(300, dur * 1000)); }
}
const reg = (file, b) => { (buttons.get(file) || buttons.set(file, []).get(file)).push(b); return b; };

// ---------------------------------------------------------------- simulated events
const ev = {
  start: (o = {}) => ({ t: 'combat_start', encounter: 'lab', name: 'Lab', kind: 'easy', elite: false, boss: false, maxHp: 80,
    enemies: [{ uid: 'e1', id: 'shambler', slot: 0 }, { uid: 'e2', id: 'biter', slot: 1 }, { uid: 'e3', id: 'shambler', slot: 2 }], ...o }),
  card: (hero, id, anim, uid) => ({ t: 'card_played', uid: uid || 'c' + Math.random().toString(36).slice(2, 7), id, hero, anim, type: anim === 'block' || anim === 'dodge' || anim === 'heal' ? 'skill' : 'attack' }),
  hit: (src, target, amount, o = {}) => ({ t: 'damage', source: src, target, amount, blocked: 0, hp: 20, block: 0, kind: src === 'yola' ? 'gun' : 'light', staggered: false, killed: false, hit: 1, hits: 1, ...o }),
  hurt: (hero, amount, hp) => ({ t: 'damage', source: 'e1', target: 'party', amount, blocked: 0, hp, block: 0, kind: 'light', staggered: false, killed: false, hit: 1, hits: 1, hero }),
  stag: (target) => ({ t: 'status', target, status: 'vulnerable', delta: 2, total: 2 }),
  death: (target, by, finisher = false) => ({ t: 'death', target, kind: by === 'yola' ? 'gun' : 'light', finisher, by, cardId: null }),
  turn: (turn) => ({ t: 'turn_start', side: 'player', turn }),
};

// a crowded made-up fight: far more going on than a real one, to show the rules holding the chatter back
function busyScript() {
  const s = [];
  let t = 0;
  const at = (dt, e) => { t += dt; s.push([t, e]); };
  at(0, ev.start({ elite: true, kind: 'elite', enemies: [{ uid: 'e1', id: 'big_walker', slot: 0 }, { uid: 'e2', id: 'biter', slot: 1 }, { uid: 'e3', id: 'shambler', slot: 2 }] }));
  for (let turn = 1; turn <= 4; turn++) {
    at(1.2, ev.turn(turn));
    let c = ev.card('marc', 'bat_swing', 'melee_light'); at(0.5, c); at(0.3, ev.hit('marc', 'e2', 6));
    c = ev.card('marc', 'home_run', 'melee_heavy'); at(0.6, c); at(0.3, ev.hit('marc', 'e1', 16, { kind: 'heavy' })); at(0.02, ev.stag('e1'));
    c = ev.card('yola', 'pistol_shot', 'pistol'); at(0.6, c); at(0.25, ev.hit('yola', 'e1', 9, { staggered: true }));
    c = ev.card('yola', 'clean_shot', 'pistol'); at(0.6, c); at(0.25, ev.hit('yola', 'e2', 8, { killed: true })); at(0.02, ev.death('e2', 'yola'));
    c = ev.card('marc', 'brace', 'block'); at(0.5, c);
    at(1.0, ev.hurt(turn % 2 ? 'marc' : 'yola', 7, 60 - turn * 9));
    at(0.5, ev.hurt(turn % 2 ? 'yola' : 'marc', 5, 55 - turn * 9));
    if (turn === 3) { c = ev.card('marc', 'bat_swing', 'melee_light'); at(0.8, c); at(0.3, ev.hit('marc', 'e3', 9, { staggered: true, killed: true, finisher: true })); at(0.02, ev.death('e3', 'marc', true)); }
  }
  at(1.0, ev.card('yola', 'triage', 'heal'));
  at(0.8, ev.card('yola', 'headshot', 'pistol')); at(0.25, ev.hit('yola', 'e1', 30, { staggered: true, killed: true, finisher: true })); at(0.02, ev.death('e1', 'yola', true));
  at(0.6, { t: 'combat_end', won: true });
  return s;
}

let running = null;
async function playScript(steps, label) {
  audio.unlock();
  stopRun();
  const me = (running = { stop: false });
  log(`--- ${label}`, 'e');
  const n0 = said.length, start = performance.now();
  for (const [at, e] of steps) {
    const wait = start + at * 1000 / speed - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (me.stop) return;
    audio.event(e);
  }
  await new Promise((r) => setTimeout(r, 4000));
  log(`--- ${label}: ${said.length - n0} lines in ${steps.length} events`, 'e');
  if (running === me) running = null;
  return said.slice(n0);
}
const busy = () => playScript(busyScript(), 'a busy made-up fight (' + speed + 'x)');

// the real engine playing itself, its events replayed at roughly the director's pacing
const PACE = { combat_start: 1.1, turn_start: 0.55, card_played: 0.05, attack: 0.27, damage: 0.12, death: 0.35, enemy_move: 0.12, draw: 0.35,
  block: 0.12, status: 0.1, heal: 0.15, energy: 0.02, discard: 0.15, shuffle: 0.3, intent: 0, combat_end: 1.5, mode_shift: 0.8 };
async function fight(enc = 'horde') {
  audio.unlock();
  stopRun();
  const me = (running = { stop: false });
  const weapons = { marc: 'wood_bat', yola: 'pistol' };
  const deck = makeStarterDeck(weapons);
  for (const id of ['wild_swing', 'headshot', 'hold_the_line', 'double_tap', 'triage', 'grand_slam']) if (CARDS[id]) deck.push(makeCard(id, false, deck));
  const boss = ENCOUNTERS[enc]?.kind === 'boss';
  const run = { version: 1, seed: 'voice-lab', act: 1, floor: 3, hp: boss ? 80 : 46, maxHp: 80, gold: 99, deck, weapons, relics: [], potions: [null, null, null] };
  if (boss) for (const id of ['grand_slam', 'headshot', 'double_tap', 'wild_swing']) deck.push(makeCard(id, true, deck));
  let combat;
  try { combat = createCombat({ run, encounter: enc, rng: 'voice-lab-' + Date.now() }); combat.start(); } catch (err) { log('fight failed: ' + err.message, 'w'); return; }
  audio.setParty({ hp: run.hp, maxHp: run.maxHp });
  log(`--- real fight: ${enc} (${speed}x)`, 'e');
  const n0 = said.length;
  const replay = async () => {
    for (const e of combat.takeEvents()) {
      if (me.stop) return;
      audio.event(e);
      await new Promise((r) => setTimeout(r, (PACE[e.t] ?? 0.04) * 1000 / speed));
    }
  };
  await replay();
  let guard = 0;
  while (!combat.over && !me.stop && guard++ < 40) {
    let played = true, n = 0;
    while (played && !combat.over && !me.stop && n++ < 12) {
      played = false;
      const alive = combat.state.enemies.filter((x) => x.alive).sort((a, b) => a.hp - b.hp);
      for (const card of [...combat.state.hand]) {
        const target = alive[0]?.uid;
        if (combat.canPlay(card.uid, target).ok) { combat.playCard(card.uid, target); played = true; break; }
      }
      await replay();
    }
    if (!combat.over && !me.stop) { combat.endTurn(); await replay(); }
  }
  await new Promise((r) => setTimeout(r, 3500));
  log(`--- fight over: ${combat.over ? (combat.state.phase === 'won' ? 'won' : 'lost') : 'stopped'}, ${said.length - n0} lines`, 'e');
  if (running === me) running = null;
  return said.slice(n0);
}
function stopRun() { if (running) running.stop = true; running = null; voice.stop(); }

// ---------------------------------------------------------------- the page
let manifest = null;
const app = $('#app');
const status = h('div.vl-status', 'loading the manifest...');
const unlockBtn = h('button.vl-unlock', { onclick: () => { audio.unlock(); paintUnlock(); } }, 'Tap to enable sound');
function paintUnlock() { setTimeout(() => { if (audio.unlocked) { unlockBtn.classList.add('on'); unlockBtn.textContent = 'Sound on'; } }, 120); }

const seg = (label, options, get, set) => {
  const el = h('span.vl-btns');
  const paint = () => [...el.querySelectorAll('button')].forEach((b, i) => b.classList.toggle('on', options[i][0] === get()));
  options.forEach(([v, t]) => el.append(h('button.vl-b', { onclick: () => { set(v); paint(); } }, t)));
  paint();
  return h('span.vl-ctl', h('span', label), el);
};
const volInput = h('input', { type: 'range', min: 0, max: 100, value: 90, oninput: (e) => audio.setVolume({ voice: e.target.value / 100 }) });
let musicOn = Q.has('music');
const top = h('div.vl-top',
  h('div.vl-logo', h('b', 'VOICE '), h('i', 'LAB')),
  unlockBtn,
  seg('Voices', [[true, 'On'], [false, 'Off']], () => on, (v) => { on = v; if (!v) voice.stop(); }),
  seg('Speed', [[1, '1x'], [1.5, '1.5x'], [2, '2x']], () => speed, (v) => { speed = v; }),
  h('span.vl-ctl', h('span', 'Volume'), volInput),
  seg('Music', [[true, 'On'], [false, 'Off']], () => musicOn, (v) => { musicOn = v; audio.unlock(); audio.music(v ? 'fight' : null); }),
  status);
app.append(top);

function rulesText(tr) {
  const r = RULES[tr];
  if (!r) return '';
  return `${pct(r.chance)} · p${r.pr}${r.gap ? ' · gap ' + r.gap + 's' : ''}${r.low ? ' · off at 2x' : ''}`;
}

function candidatesPanel() {
  const aud = manifest.audition || {};
  const picks = { marc: manifest.voices?.marc, yola: manifest.voices?.yola };
  const cmd = h('div.vl-cmd');
  const paintCmd = () => { cmd.textContent = `python tools/voice/generate.py --marc ${picks.marc} --yola ${picks.yola}`; };
  const col = (who) => {
    const a = aud[who];
    if (!a) return h('div', h('h3', { class: who }, script.speakers[who].name), h('p.vl-note', 'No audition samples: run generate.py without --no-audition.'));
    const table = h('table.vl-cands', h('tr', h('th', 'Voice'), a.lines.map((l, i) => h('th', `${i + 1}`)), h('th', '')));
    const useBtns = [];
    for (const v of a.voices) {
      const isDefault = v.voice === manifest.voices?.[who];
      const use = h('button.vl-b', { onclick: () => { picks[who] = v.voice; useBtns.forEach((b) => b.classList.toggle('on', b === use)); paintCmd(); } }, 'Use');
      if (v.voice === picks[who]) use.classList.add('on');
      useBtns.push(use);
      table.append(h('tr',
        h('td', h('div.vl-vname', v.voice, isDefault ? h('span.vl-badge', 'in game') : null, h('small', v.grade ? `Kokoro grade ${v.grade}` : ''))),
        v.files.map((f) => h('td', reg(f.file, h('button.vl-b', { class: who, title: f.text, onclick: () => { audio.unlock(); paintUnlock(); voice.playFile(f.file, who); } }, '▶', h('small', f.text))))),
        h('td', use)));
    }
    return h('div', h('h3', { class: who }, script.speakers[who].name), table);
  };
  paintCmd();
  return h('section.vl-panel',
    h('h2', 'Pick the voices', h('small', 'the same lines in each candidate Kokoro voice (graded by Kokoro: A best). "in game" = what the game uses now.')),
    h('div.vl-two', col('marc'), col('yola')),
    h('p.vl-note', 'To record every line with the voices you picked (about 15 minutes on a laptop CPU; a blend like ', h('b', 'am_michael:70,am_fenrir:30'), ' works too):'),
    cmd,
    h('p.vl-note', 'Setup once: ', h('b', 'pip install kokoro-onnx soundfile'), ' and ffmpeg. The model (~330 MB) downloads itself the first time, outside the repo. The words are in ', h('b', 'tools/voice/lines.json'), '; see tools/voice/README.md.'));
}

function linesPanel() {
  const wrap = h('section.vl-panel',
    h('h2', 'Every line', h('span.vl-placeholder', 'Placeholder lines'), h('small', 'Marc decides the dialogue: edit tools/voice/lines.json and regenerate. Dashed = the text changed since the audio was made.')));
  for (const [who, sp] of Object.entries(script.speakers)) {
    const got = manifest.speakers?.[who];
    wrap.append(h('h3', { class: who }, `${sp.name}`, h('small', { style: { font: '400 13px var(--f-body)', color: 'var(--ink-faint)', marginLeft: '10px' } }, got ? `voice ${got.voice}` : 'not generated yet')));
    const grid = h('div.vl-trigs');
    for (const [tr, def] of Object.entries(sp.triggers)) {
      const rows = got?.triggers?.[tr] || [];
      const lines = def.lines.map((l, i) => {
        const text = typeof l === 'string' ? l : l.text;
        const row = rows[i];
        const b = h('button.vl-b', { class: SPEAKER_CLASS[who] + (row ? '' : ' miss') + (row && row.text !== text ? ' stale' : ''),
          onclick: () => { audio.unlock(); paintUnlock(); if (row) voice.say(who, tr, { variant: i }); } },
        text, h('small', row ? `${row.dur}s` : 'not generated'));
        return row ? reg(row.file, b) : b;
      });
      grid.append(h('div.vl-trig',
        h('header', h('b', tr), h('span', rulesText(tr))),
        h('p', def.when),
        h('div.vl-lines', lines)));
    }
    wrap.append(grid);
  }
  return wrap;
}

function rulesPanel() {
  const encSel = h('select.vl-sel', Object.keys(ENCOUNTERS).filter((k) => ENCOUNTERS[k].kind !== 'event').map((k) => h('option', { value: k, selected: k === 'horde' }, `${k} (${ENCOUNTERS[k].kind})`)));
  logEl = h('div.vl-log');
  return h('section.vl-panel',
    h('h2', 'Try the rules', h('small', 'events go through audio.event() exactly as the battle director sends them; green = said, grey = held back')),
    h('div.vl-btns',
      h('button.vl-b', { onclick: busy }, 'A busy made-up fight', h('small', '~25 s, far more events than a real turn')),
      encSel, h('button.vl-b', { onclick: () => fight(encSel.value) }, 'Play a real fight', h('small', 'the engine plays itself')),
      h('button.vl-b', { onclick: () => fight('shield_guard') }, 'The boss', h('small', 'Shield Guard')),
      h('button.vl-b', { onclick: stopRun }, 'Stop')),
    h('p.vl-note', 'The rules (src/audio/voice.js RULES): one line at a time; a gap since the last line (shorter for kills and finishers, none for the boss, victory and defeat); a chance per trigger; no variant repeats until the others have played; when both heroes could answer, the one who spoke last stays quiet; at 2x the chatter is skipped. Music and sound dip a little under each line.'),
    logEl);
}

function paintStatus() {
  const s = audio.state(), v = s.voice, tt = manifest?.totals;
  status.innerHTML = '';
  status.append(
    h('div', h('b', manifest ? `${tt?.lines ?? '?'} lines` : 'no manifest'), tt ? ` · ${(tt.bytes / 1024).toFixed(0)} KB · ${tt.lufs_min}..${tt.lufs_max} LUFS · ` : ' · ',
      manifest ? `Marc ${manifest.voices.marc}, Yola ${manifest.voices.yola}, guard ${manifest.voices.guard}` : ''),
    h('div', `ctx ${s.ctx} · decoded ${s.decoded} · said ${v.lines} · ${v.speaking ? 'speaking: ' + v.speaking.speaker + '.' + v.speaking.trigger : 'quiet'}`));
}

voice.manifest().then((m) => {
  manifest = m;
  if (!m) { status.textContent = 'No public/assets/voice/manifest.json yet: run tools/voice/generate.py'; return; }
  app.append(candidatesPanel(), linesPanel(), rulesPanel());
  paintStatus();
  setInterval(paintStatus, 500);
  window.__vlab.manifest = m;
  window.__vlab.ready = true;
});

// decode every game line through the audio module's cache (the same path the game uses) and report each one
async function decodeAll() {
  audio.unlock();
  const files = Object.values(manifest.speakers).flatMap((s) => Object.values(s.triggers).flat().map((r) => r.file));
  const decoded = await voice.preload();
  const m = audio.measurements();
  return { files: files.length, decoded, missing: files.filter((f) => !m[f]), durations: files.map((f) => m[f]?.dur ?? null) };
}

if (Q.has('auto')) { audio.unlock(); paintUnlock(); }
if (musicOn) audio.music('fight');
window.__vlab = { audio, voice, script, busy, fight, decodeAll, stop: stopRun, said, setSpeed: (x) => { speed = x; }, setOn: (v) => { on = v; }, ready: false };
