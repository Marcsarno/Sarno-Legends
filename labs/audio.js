// Audio lab (port 5185): every sound the game makes, on buttons. Fire each combat event (as the director would send
// it), every UI sound and every bank; switch the music; move the volume sliders; or "Play a real fight": the real engine
// (src/game/combat.js) plays itself with a simple bot and its event log is replayed through audio.event() at roughly the
// director's pacing. The meter shows the master output; the log shows what played.
// URL: ?enc=horde  the fight for "Play a real fight"   ?zombie=big_walker  who the sample events target   ?auto=1 unlock at load
// window.__lab = { audio, fire(name), fight(enc), measure(keys?), events, samples } for Playwright.
import '../src/ui/styles/base.css';
import { createAudio, BANKS, SYNTHS, UI, TRACKS, filesInUse } from '../src/audio/audio.js';
import { VOICES } from '../src/audio/sfx.js';
import { createCombat } from '../src/game/combat.js';
import { makeStarterDeck, makeCard, CARDS } from '../src/game/content/cards.js';
import { ENCOUNTERS } from '../src/game/content/encounters.js';
import { h, $ } from '../src/ui/dom.js';

const Q = new URLSearchParams(location.search);
const audio = createAudio();
window.__audio = audio;
if (Q.has('auto')) audio.unlock();

// ---------------------------------------------------------------- the sample combat events
const ZOMBIES = ['shambler', 'biter', 'spitter', 'screamer', 'sprinter', 'nurse', 'bloater', 'orderly', 'big_walker', 'sleeping_patient', 'shield_guard'];
let zid = ZOMBIES.includes(Q.get('zombie')) ? Q.get('zombie') : 'shambler';
const Z = 'e1';
const snap = (id, uid = Z, slot = 0) => ({ uid, id, name: id, hp: 40, maxHp: 40, block: 0, statuses: {}, alive: true, slot, tier: VOICES[id]?.big ? 'elite' : 'normal' });
const start = (id = zid) => ({ t: 'combat_start', encounter: 'lab', name: 'Lab', kind: id === 'shield_guard' ? 'boss' : VOICES[id]?.big ? 'elite' : 'easy',
  elite: !!VOICES[id]?.big && id !== 'shield_guard', boss: id === 'shield_guard', music: id === 'shield_guard' ? 'boss' : VOICES[id]?.big ? 'elite' : 'fight',
  enemies: [snap(id), snap('biter', 'e2', 1)] });
const dmg = (o) => ({ t: 'damage', source: 'marc', target: Z, amount: 6, blocked: 0, hp: 30, block: 0, kind: 'light', staggered: false, killed: false, hit: 1, hits: 1, ...o });
const pdmg = (o) => ({ t: 'damage', source: Z, target: 'party', amount: 6, blocked: 0, hp: 60, block: 0, kind: 'light', staggered: false, killed: false, hit: 1, hits: 1, hero: 'marc', ...o });

// name -> [label, css class, [[delay s, event], ...], hint]
const SAMPLES = {
  // Marc
  bat_swing: ['Bat Swing', 'marc', [[0, { t: 'card_played', id: 'bat_swing', hero: 'marc', type: 'attack', anim: 'melee_light' }], [0, { t: 'attack', by: 'marc', target: Z, anim: 'melee_light', hits: 1 }], [0.27, dmg({})]], 'swing + bat hit'],
  home_run: ['Home Run', 'marc', [[0, { t: 'attack', by: 'marc', target: Z, anim: 'melee_heavy', hits: 1 }], [0.3, dmg({ amount: 8, kind: 'heavy' })], [0.32, { t: 'status', target: Z, status: 'vulnerable', delta: 2, total: 2 }]], 'heavy hit, Staggered'],
  stag_hit: ['Hit a Staggered zombie', 'marc', [[0, { t: 'attack', by: 'marc', target: Z, anim: 'melee_light', hits: 1 }], [0.27, dmg({ amount: 9, staggered: true })]], 'the extra crack'],
  wild_swing: ['Wild Swing (all)', 'marc', [[0, { t: 'attack', by: 'marc', target: 'all', anim: 'melee_sweep', hits: 1 }], [0.3, dmg({ amount: 8 })], [0.3, dmg({ amount: 8, target: 'e2' })]], 'two hits at once'],
  brace: ['Brace (block)', 'marc', [[0, { t: 'card_played', id: 'brace', hero: 'marc', type: 'skill', anim: 'block' }], [0.05, { t: 'block', target: 'party', amount: 5, block: 5 }]], 'cloth + shimmer'],
  power: ['Pumped Up (power)', 'marc', [[0, { t: 'card_played', id: 'pumped_up', hero: 'marc', type: 'power', anim: 'buff' }], [0.3, { t: 'status', target: 'party', status: 'strength', delta: 2, total: 2 }]], 'swell + chord'],
  grit: ['Grit Teeth (lose HP)', 'marc', [[0, pdmg({ source: null, kind: 'self', amount: 3, hero: 'marc' })], [0.1, { t: 'energy', energy: 5, max: 3 }]], 'self hit + energy'],
  kick: ['Kick the Door', 'marc', [[0, { t: 'card_played', id: 'kick_the_door', hero: 'marc', type: 'attack', anim: 'melee_light' }]], 'door slam foley'],
  axe: ['Fire Axe hit', 'marc', [[0, { t: 'fx', name: 'swing', by: 'marc', clip: 'x' }], [0.27, dmg({ amount: 8 })]], 'with the axe equipped', () => audio.setLoadout({ marc: 'fire_axe' }), () => audio.setLoadout({ marc: 'wood_bat' })],
  // Yola
  pistol: ['Pistol Shot', 'yola', [[0, { t: 'attack', by: 'yola', target: Z, anim: 'pistol', hits: 1 }], [0.05, dmg({ source: 'yola', kind: 'gun', hero: 'yola' })]], 'shot + bullet hit'],
  double_tap: ['Double Tap', 'yola', [[0, { t: 'attack', by: 'yola', target: Z, anim: 'pistol', hits: 2 }], [0.05, dmg({ source: 'yola', kind: 'gun', amount: 4, hit: 1, hits: 2 })],
    [0.18, { t: 'fx', name: 'pistol', by: 'yola' }], [0.23, dmg({ source: 'yola', kind: 'gun', amount: 4, hit: 2, hits: 2 })]], 'two shots'],
  shotgun: ['Buckshot (shotgun)', 'yola', [[0, { t: 'attack', by: 'yola', target: 'all', anim: 'shotgun', hits: 1 }], [0.05, dmg({ source: 'yola', kind: 'blast', amount: 4 })], [0.06, dmg({ source: 'yola', kind: 'blast', amount: 4, target: 'e2' })]], 'blast + pump'],
  sidestep: ['Sidestep (dodge)', 'yola', [[0, { t: 'card_played', id: 'sidestep', hero: 'yola', type: 'skill', anim: 'dodge' }], [0.05, { t: 'block', target: 'party', amount: 5, block: 5 }]], 'cloth + swish'],
  check_mag: ['Check the Mag', 'yola', [[0, { t: 'card_played', id: 'check_mag', hero: 'yola', type: 'skill', anim: 'none' }]], 'mag out / in / slide'],
  triage: ['Triage (heal)', 'yola', [[0, { t: 'card_played', id: 'triage', hero: 'yola', type: 'skill', anim: 'heal' }], [0.1, { t: 'heal', target: 'party', amount: 4, hp: 64, maxHp: 80 }]], 'warm arpeggio'],
  defib: ['Defibrillator', 'yola', [[0, { t: 'card_played', id: 'defibrillator', hero: 'yola', type: 'skill', anim: 'heal' }], [0.45, { t: 'heal', target: 'party', amount: 12, hp: 72, maxHp: 80 }]], 'arc + monitor beep'],
  flare: ['Flare (Weakened all)', 'yola', [[0, { t: 'card_played', id: 'flare', hero: 'yola', type: 'skill', anim: 'throw' }], [0.3, { t: 'status', target: Z, status: 'weak', delta: 1, total: 1 }]], 'throw + debuff'],
  finisher: ['FINISHER', 'big', [[0, { t: 'attack', by: 'marc', target: Z, anim: 'melee_heavy', hits: 1 }], [0.4, dmg({ amount: 14, kind: 'heavy', staggered: true, killed: true, finisher: true, hp: 0 })], [0.42, { t: 'death', target: Z, kind: 'heavy', finisher: true, by: 'marc' }]], 'kill on a Staggered zombie'],
  gun_finisher: ['Headshot finisher', 'big', [[0, { t: 'attack', by: 'yola', target: Z, anim: 'pistol', hits: 1 }], [0.2, dmg({ source: 'yola', kind: 'gun', amount: 20, staggered: true, killed: true, finisher: true, hp: 0 })], [0.22, { t: 'death', target: Z, kind: 'gun', finisher: true, by: 'yola' }]], 'bullet-time kill'],
  // zombies
  z_start: ['Combat start', 'z', [[0, null]], 'alert cries / intro', () => fireRaw(start())],
  z_attack: ['Zombie attacks', 'z', [[0, { t: 'enemy_move', uid: Z, move: 'bite', name: 'Bite', type: 'attack' }], [0.05, { t: 'attack', by: Z, target: 'party', anim: 'melee_light', hits: 1, hero: 'marc' }], [0.3, pdmg({})]], 'cry + swipe + bite lands'],
  z_heavy: ['Heavy hit on the party', 'z', [[0, { t: 'attack', by: Z, target: 'party', anim: 'melee_heavy', hits: 1, hero: 'marc' }], [0.32, pdmg({ amount: 14 })]], '12+ damage'],
  z_slam: ['Slam move (big ones)', 'z', [[0, { t: 'enemy_move', uid: Z, move: 'shield_bash', name: 'Shield Bash', type: 'attack' }], [0.05, { t: 'attack', by: Z, target: 'party', anim: 'melee_heavy', hits: 1, hero: 'marc' }], [0.35, pdmg({ amount: 32, hp: 30 })]], 'uses the boss slam on big zombies'],
  z_blocked: ['Hit fully blocked', 'z', [[0, { t: 'attack', by: Z, target: 'party', anim: 'melee_light', hits: 1, hero: 'yola' }], [0.3, pdmg({ amount: 0, blocked: 6, hero: 'yola' })]], 'thwack + shimmer'],
  z_hurt: ['Zombie hurt', 'z', [[0, dmg({ amount: 3, kind: 'gun', source: 'yola' })]], '65% chance of a cry'],
  z_death: ['Zombie dies', 'z', [[0, dmg({ amount: 9, killed: true, hp: 0 })], [0.02, { t: 'death', target: Z, kind: 'light', finisher: false, by: 'marc' }]], 'death cry + body fall'],
  z_buff: ['Zombie buffs', 'z', [[0, { t: 'enemy_move', uid: Z, move: 'grow', name: 'Grow', type: 'buff' }], [0.4, { t: 'status', target: Z, status: 'strength', delta: 3, total: 3 }]], 'roar + growl swell'],
  z_block: ['Zombie blocks', 'z', [[0, { t: 'enemy_move', uid: Z, move: 'raise_shield', name: 'Raise Shield', type: 'block' }], [0.1, { t: 'block', target: Z, amount: 9, block: 9 }]], 'metal + cloth'],
  z_hit_block: ['Hit on its block', 'z', [[0, dmg({ amount: 0, blocked: 6 })]], "Marc's shield-hit picks"],
  shriek: ['Screamer: Shriek', 'z', [[0, { t: 'enemy_move', uid: Z, move: 'shriek', name: 'Shriek', type: 'buff' }]], 'scream'],
  spit: ['Spitter: Spit', 'z', [[0, { t: 'enemy_move', uid: Z, move: 'spit', name: 'Spit', type: 'debuff' }], [0.45, { t: 'status', target: 'party', status: 'weak', delta: 2, total: 2 }]], 'spit + debuff'],
  revive: ['Nurse: Revive', 'z', [[0, { t: 'revive', uid: 'e2', hp: 7 }]], 'swell + growl'],
  wake: ['Sleeping Patient wakes', 'z', [[0, { t: 'wake', uid: Z, stunned: true }], [0.6, { t: 'stunned', uid: Z }]], 'roar + stun'],
  shield_break: ['Shield Guard: Shield Up', 'big', [[0, { t: 'mode_shift', uid: Z, mode: 'defensive' }]], 'shield breaking'],
  boss_intro: ['Boss intro', 'big', [[0, null]], 'sting + war drum + steps', () => fireRaw(start('shield_guard'))],
  boss_death: ['Boss dies', 'big', [[0, null]], 'death + boom + floor chime', () => { fireRaw(start('shield_guard')); later(0.4, { t: 'death', target: Z, kind: 'heavy', finisher: false, by: 'marc' }); }],
  bloater: ['Bloater bursts', 'z', [[0, null]], 'spore burst', () => { fireRaw(start('bloater')); later(0.3, { t: 'death', target: Z, kind: 'light', finisher: false }); }],
  // cards and the turn
  draw5: ['Draw 5', 'ui', [[0, { t: 'draw', uids: ['a', 'b', 'c', 'd', 'e'] }]], 'swishes'],
  shuffle: ['Shuffle', 'ui', [[0, { t: 'shuffle', count: 8 }]], 'riffle'],
  discard: ['Discard hand', 'ui', [[0, { t: 'discard', uids: ['a', 'b'], endOfTurn: true }]], ''],
  exhaust: ['Exhaust', 'ui', [[0, { t: 'exhaust', uid: 'a' }]], 'burn'],
  created: ['Card created', 'ui', [[0, { t: 'card_created', uid: 'x', id: 'panic', to: 'discard' }]], ''],
  energy: ['Energy refill', 'ui', [[0, { t: 'energy', energy: 0, max: 3 }], [0.05, { t: 'energy', energy: 3, max: 3 }]], 'two bells'],
  turn_p: ['Your turn', 'ui', [[0, { t: 'turn_start', side: 'player', turn: 2 }]], ''],
  turn_e: ["Zombies' turn", 'ui', [[0, { t: 'turn_start', side: 'enemy', turn: 2 }]], 'low drum'],
  stagger: ['Staggered applied', 'big', [[0, { t: 'status', target: Z, status: 'vulnerable', delta: 2, total: 2 }]], 'the pillar status'],
  buff: ['Party buff', 'ui', [[0, { t: 'status', target: 'party', status: 'dexterity', delta: 2, total: 2 }]], 'rising three'],
  debuff: ['Party debuff', 'ui', [[0, { t: 'status', target: 'party', status: 'frail', delta: 1, total: 1 }]], 'falling pair'],
  relic: ['Relic triggers', 'ui', [[0, { t: 'relic', id: 'pager' }]], 'ding + sparkle'],
  gold: ['Supplies', 'ui', [[0, { t: 'gold', amount: 15, total: 114 }]], 'coins'],
  potion: ['Medkit', 'ui', [[0, { t: 'potion', id: 'medkit', slot: 0, target: null, anim: 'heal' }], [0.2, { t: 'heal', target: 'party', amount: 16, hp: 76, maxHp: 80 }]], 'glass + heal'],
  flashbang: ['Flashbang', 'big', [[0, { t: 'potion', id: 'flashbang', slot: 0, target: null, anim: 'throw' }]], 'throw, bang, ring'],
  pipe_bomb: ['Pipe Bomb', 'big', [[0, { t: 'potion', id: 'pipe_bomb', slot: 0, target: null, anim: 'throw' }]], 'throw, explosion'],
  extinguisher: ['Extinguisher', 'ui', [[0, { t: 'potion', id: 'extinguisher', slot: 0, target: null, anim: 'throw' }]], 'spray'],
  lowhp: ['Low HP (heartbeat)', 'big', [[0, pdmg({ amount: 9, hp: 20 })]], 'heartbeat starts (heal to stop)'],
  lowhp2: ['Critical HP', 'big', [[0, pdmg({ amount: 9, hp: 9 })]], 'faster, deeper'],
  heal_up: ['Heal back up', 'yola', [[0, { t: 'heal', target: 'party', amount: 40, hp: 70, maxHp: 80 }]], 'heartbeat stops'],
  won: ['Fight won', 'big', [[0, { t: 'combat_end', won: true }]], 'victory chord'],
  lost: ['Defeat', 'big', [[0, null]], 'music cuts, heartbeat, flatline', () => { fireRaw(start()); later(0.1, { t: 'combat_end', won: false }); }],
};

// ---------------------------------------------------------------- firing
const logLines = [];
function log(text, cls = '') {
  logLines.push([text, cls]); if (logLines.length > 140) logLines.shift();
  const el = $('#log'); if (!el) return;
  el.innerHTML = logLines.map(([t, c]) => `<div class="${c}">${t.replace(/</g, '&lt;')}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}
function fireRaw(e) {
  const before = audio.state().stats.played + audio.state().stats.synths;
  audio.event(e);
  const after = audio.state().stats.played + audio.state().stats.synths;
  log(`${e.t}${e.name ? ' ' + e.name : ''}${e.status ? ' ' + e.status : ''}${e.kind ? ' ' + e.kind : ''}${e.amount != null ? ' ' + e.amount : ''}  ->  ${after - before} sound(s)`, after > before ? 's' : 'e');
}
const timers = new Set();
function later(sec, e) { const id = setTimeout(() => { timers.delete(id); fireRaw(e); }, sec * 1000); timers.add(id); }
function fire(name) {
  const s = SAMPLES[name]; if (!s) return;
  audio.unlock();
  const [, , steps, , custom, after] = s;
  if (custom) { custom(); if (!steps.some(([, e]) => e)) return; }
  for (const [d, e] of steps) if (e) { if (d <= 0) fireRaw(e); else later(d, e); }
  if (after) setTimeout(after, 1200);
}

// ---------------------------------------------------------------- a real fight, replayed
const PACE = { combat_start: 1.1, turn_start: 0.55, card_played: 0.05, attack: 0.27, damage: 0.12, death: 0.35, enemy_move: 0.12, draw: 0.35,
  block: 0.12, status: 0.1, heal: 0.15, energy: 0.02, discard: 0.15, shuffle: 0.3, intent: 0, combat_end: 1.5 };
let fighting = null;
async function realFight(enc = Q.get('enc') || 'horde') {
  audio.unlock();
  if (fighting) { fighting.stop = true; await new Promise((r) => setTimeout(r, 100)); }
  const me = (fighting = { stop: false });
  const weapons = { marc: 'wood_bat', yola: 'pistol' };
  const deck = makeStarterDeck(weapons);
  for (const id of ['wild_swing', 'headshot', 'hold_the_line', 'double_tap']) if (CARDS[id]) deck.push(makeCard(id, false, deck));
  const run = { version: 1, seed: 'audio-lab', act: 1, floor: 3, hp: 70, maxHp: 80, gold: 99, deck, weapons, relics: [{ id: 'nurses_kit', counter: 0 }, { id: 'pager', counter: 0 }], potions: ['flashbang', null, null] };
  let combat;
  try { combat = createCombat({ run, encounter: enc, rng: 'audio-lab-' + Date.now() }); combat.start(); } catch (err) { log('fight failed: ' + err.message, 'w'); return; }
  audio.setParty({ hp: run.hp, maxHp: run.maxHp });
  log(`--- real fight: ${enc}`, 'e');
  const replay = async () => {
    for (const e of combat.takeEvents()) {
      if (me.stop) return;
      fireRaw(e);
      await new Promise((r) => setTimeout(r, (PACE[e.t] ?? 0.04) * 1000));
    }
  };
  await replay();
  let guard = 0;
  while (!combat.over && !me.stop && guard++ < 60) {
    // the bot: use the flashbang on turn 2, then play whatever it can (attacks on the weakest zombie), then end the turn
    if (combat.state.turn === 2 && run.potions[0]) { try { combat.usePotion(0); } catch { /* fine */ } await replay(); }
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
  log(`--- fight over: ${combat.over ? (combat.state.phase === 'won' ? 'won' : 'lost') : 'stopped'}`, 'e');
  if (fighting === me) fighting = null;
  return combat.result?.();
}

// ---------------------------------------------------------------- measurement (Playwright: how loud is each sound?)
async function measure(keys, { maxMs = 2600 } = {}) {
  audio.unlock();
  const an = audio.meter(); if (!an) return null;
  const buf = new Float32Array(an.fftSize);
  const out = {};
  for (const key of keys) {
    const isUi = UI[key] && !BANKS[key];
    const ok = isUi ? audio.ui(key) : audio.sfx(key);
    let peak = 0, rms = 0, heard = 0, quiet = 0; const t0 = performance.now();
    while (performance.now() - t0 < maxMs) {
      await new Promise((r) => setTimeout(r, 16));
      an.getFloatTimeDomainData(buf);
      let p = 0, s = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > p) p = a; s += buf[i] * buf[i]; }
      const r = Math.sqrt(s / buf.length);
      peak = Math.max(peak, p); rms = Math.max(rms, r);
      if (p > 0.003) { heard++; quiet = 0; } else if (heard && ++quiet > 12) break;
    }
    out[key] = { ok, peakDb: +(20 * Math.log10(peak || 1e-9)).toFixed(1), rmsDb: +(20 * Math.log10(rms || 1e-9)).toFixed(1), ms: Math.round(performance.now() - t0) };
    await new Promise((r) => setTimeout(r, 120));
  }
  return out;
}

// ---------------------------------------------------------------- the page
function render() {
  const app = $('#app');
  const unlockBtn = h('button.al-unlock', { onclick: () => { audio.unlock(); } }, 'Tap to unlock audio');
  const meter = h('canvas.al-meter', { width: 400, height: 68 });
  const status = h('div.al-status');

  const slider = (key, label) => {
    const out = h('output', String(Math.round(audio.volume[key] * 100)));
    const input = h('input', { type: 'range', min: 0, max: 100, step: 1, value: Math.round(audio.volume[key] * 100) });
    input.addEventListener('input', () => { out.textContent = input.value; audio.setVolume({ [key]: input.value / 100 }); });
    input.addEventListener('change', () => audio.ui(key === 'music' ? 'click' : 'card'));
    return h('div.al-row', h('span', label), input, out);
  };
  const np = h('div.al-np');
  const musicBtns = h('div.al-btns', ['menu', 'map', 'fight', 'elite', 'boss'].map((k) =>
    h('button.al-b', { dataset: { track: k }, onclick: () => { audio.unlock(); audio.music(k); } }, k, h('small', TRACKS[k].src.replace('music/', '')))),
    h('button.al-b', { dataset: { track: '' }, onclick: () => audio.music(null) }, 'off', h('small', 'fade out')));

  const zsel = h('select.al-sel', { onchange: (ev) => { zid = ev.target.value; audio.unlock(); fireRaw(start()); } }, ZOMBIES.map((id) => h('option', { value: id, selected: id === zid }, id)));
  const encSel = h('select.al-sel', Object.keys(ENCOUNTERS).map((id) => h('option', { value: id, selected: id === (Q.get('enc') || 'horde') }, id)));

  const sampleBtn = (name) => { const [label, cls, , hint] = SAMPLES[name]; return h(`button.al-b.${cls}`, { dataset: { s: name }, onclick: (ev) => { flash(ev.currentTarget); fire(name); } }, label, hint ? h('small', hint) : null); };
  const group = (title, note, names) => h('section.al-panel', h('h2', title, note ? h('small', note) : null), h('div.al-btns', names.map(sampleBtn)));
  const flash = (el) => { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 180); };

  const uiBtns = h('div.al-btns', Object.keys(UI).map((n) => h('button.al-b.ui', { onclick: (ev) => { flash(ev.currentTarget); audio.unlock(); const ok = audio.ui(n); log(`ui ${n} -> ${ok ? 'played' : 'silent'}`, ok ? 's' : 'w'); } }, n)));
  const extraBtns = h('div.al-btns.sub',
    h('button.al-b.ui', { onclick: () => { audio.unlock(); audio.walk(4); log('walk 4 steps', 's'); } }, 'Map: walk', h('small', '4 footsteps')),
    h('button.al-b.ui', { onclick: () => { audio.unlock(); audio.door('open'); log('door open', 's'); } }, 'Door opens'),
    h('button.al-b.ui', { onclick: () => { audio.unlock(); audio.door('shut'); } }, 'Door shuts'),
    h('button.al-b.ui', { onclick: () => { audio.unlock(); audio.door('lift'); } }, 'Lift doors', h('small', 'the boss elevator')),
    h('button.al-b.ui', { onclick: () => { audio.unlock(); audio.sfx('floor_cleared'); } }, 'Floor cleared'),
    h('button.al-b.ui', { onclick: () => { audio.unlock(); audio.duck(1500, 0.25); log('duck music 1.5 s', 's'); } }, 'Duck music'));

  const bankBtns = h('div.al-btns', Object.keys(BANKS).map((k) => h('button.al-b', { dataset: { bank: k }, onclick: (ev) => { flash(ev.currentTarget); audio.unlock(); const ok = audio.sfx(k); log(`bank ${k} -> ${ok ? 'played' : 'not ready'}`, ok ? 's' : 'w'); } },
    k, h('small', `${BANKS[k].layers.reduce((n, l) => n + (l.files?.length || 0), 0)} takes · ${BANKS[k].layers.length} layers`))));
  const synthBtns = h('div.al-btns.sub', Object.keys(SYNTHS).filter((k) => !UI[k]).map((k) => h('button.al-b', { onclick: (ev) => { flash(ev.currentTarget); audio.unlock(); audio.sfx(k, { bus: 'sfx' }); } }, k)));

  app.append(
    h('div.al-top', h('div.al-logo', h('b', 'SARNO'), ' ', h('i', 'LEGENDS'), ' · audio'), unlockBtn, meter, status),
    h('div.al-grid',
      h('div',
        h('section.al-panel', h('h2', 'Volume'), slider('master', 'Master'), slider('music', 'Music'), slider('sfx', 'Sound'),
          h('p.al-note', 'Sliders are 0-100 like the settings screen (a squared curve: 50 = -12 dB).')),
        h('section.al-panel', h('h2', 'Music', h('small', 'crossfade 1.2 s')), musicBtns, np),
        h('section.al-panel', h('h2', 'A real fight', h('small', 'the engine plays itself')),
          h('div.al-btns', encSel, h('button.al-b.big', { onclick: () => realFight(encSel.value) }, 'Play a real fight'),
            h('button.al-b', { onclick: () => { if (fighting) fighting.stop = true; audio.stopAll(); } }, 'Stop')),
          h('p.al-note', 'Replays the combat event log through audio.event() at about the director\'s pacing.')),
        h('section.al-panel', h('h2', 'Log'), h('div.al-log#log'))),
      h('div',
        h('section.al-panel', h('h2', 'Target zombie', h('small', 'the voice the zombie events use')), h('div.al-btns', zsel,
          h('button.al-b.z', { onclick: () => { audio.unlock(); fireRaw(start()); } }, 'Send combat_start'))),
        group('Marc', 'his weapon picks the hit', ['bat_swing', 'home_run', 'stag_hit', 'wild_swing', 'brace', 'power', 'grit', 'kick', 'axe']),
        group('Yola', '', ['pistol', 'double_tap', 'shotgun', 'sidestep', 'check_mag', 'triage', 'defib', 'flare']),
        group('Zombies', '', ['z_start', 'z_attack', 'z_heavy', 'z_slam', 'z_blocked', 'z_hurt', 'z_death', 'z_buff', 'z_block', 'z_hit_block', 'shriek', 'spit', 'revive', 'wake', 'bloater']),
        group('Big moments', '', ['finisher', 'gun_finisher', 'stagger', 'shield_break', 'boss_intro', 'boss_death', 'flashbang', 'pipe_bomb', 'lowhp', 'lowhp2', 'heal_up', 'won', 'lost']),
        group('Cards, turn, items', '', ['draw5', 'shuffle', 'discard', 'exhaust', 'created', 'energy', 'turn_p', 'turn_e', 'buff', 'debuff', 'relic', 'gold', 'potion', 'extinguisher']),
        h('section.al-panel', h('h2', 'UI sounds', h('small', 'audio.ui(name): synthesised')), uiBtns, extraBtns),
        h('section.al-panel', h('h2', 'Every bank', h('small', `${Object.keys(BANKS).length} banks · ${filesInUse().length} files`)), bankBtns, synthBtns))));

  // live status + meter
  const g = meter.getContext('2d'); let an = null, data = null, hold = 0;
  const tick = () => {
    const s = audio.state();
    unlockBtn.classList.toggle('on', s.ctx === 'running');
    unlockBtn.textContent = s.ctx === 'running' ? 'Audio on' : 'Tap to unlock audio';
    status.innerHTML = `ctx <b>${s.ctx}</b> · ${s.sampleRate ? s.sampleRate / 1000 + ' kHz' : ''} · decoded <b>${s.decoded}/${s.files}</b>` +
      (s.failed.length ? ` · <span style="color:var(--bad)">failed ${s.failed.length}</span>` : '') +
      `<br>voices <b>${s.voices}</b> · played <b>${s.stats.played}</b> · synths ${s.stats.synths} · dropped ${s.stats.dropped} · heartbeat ${s.heartbeat} · duck ${s.duck}`;
    const m = s.music; const p = m.playing;
    np.textContent = p ? `${m.want || 'off'}: ${p.src.replace('music/', '')} ${p.paused ? '(paused)' : '▶ ' + p.time.toFixed(1) + ' s'}${p.fallback ? ' (no Web Audio route)' : ''}` : m.want ? `${m.want} (waiting for unlock)` : 'off';
    musicBtns.querySelectorAll('[data-track]').forEach((b) => b.classList.toggle('on', (b.dataset.track || null) === (m.want || null) && !!m.want));
    if (s.ctx === 'running') {
      an = an || audio.meter(); data = data || new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(data);
      let pk = 0, sum = 0; for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > pk) pk = a; sum += data[i] * data[i]; }
      const rms = Math.sqrt(sum / data.length), toX = (v) => Math.max(0, Math.min(1, (20 * Math.log10(v || 1e-9) + 60) / 60)) * meter.width;
      hold = Math.max(toX(pk), hold - 4);
      g.clearRect(0, 0, meter.width, meter.height);
      g.fillStyle = '#1b2a2e'; g.fillRect(0, 0, meter.width, meter.height);
      g.fillStyle = '#2fa39a'; g.fillRect(0, 10, toX(rms), 22);
      g.fillStyle = '#e3b04b'; g.fillRect(0, 36, toX(pk), 22);
      g.fillStyle = '#ff6b5e'; g.fillRect(hold - 3, 36, 3, 22);
      g.fillStyle = '#64777a'; for (const db of [-48, -36, -24, -12, -6]) g.fillRect(((db + 60) / 60) * meter.width, 0, 1, meter.height);
    }
    requestAnimationFrame(tick);
  };
  tick();
}
render();
log('Tap any button (the first tap unlocks audio). Every sound the game makes is here.', 'e');

window.__lab = { audio, fire, fireRaw, fight: realFight, measure, samples: Object.keys(SAMPLES), banks: Object.keys(BANKS), ui: Object.keys(UI), start };
