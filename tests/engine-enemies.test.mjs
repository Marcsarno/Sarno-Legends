// Zombie AI and behaviour: every no-repeat rule over 1000 seeds, the fixed cycles, and the special rules
// (Hunch, Frenzy, Rage, Sleeping Patient waking, Shield Guard mode shift, Nurse revives, Orderlies' Panic, Spore Burst).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../src/game/combat.js';
import { ENEMIES } from '../src/game/content/enemies.js';
import { ENCOUNTERS, POOLS, pickEncounter } from '../src/game/content/encounters.js';
import { makeRng } from '../src/game/rng.js';

function mk({ deck = Array(10).fill('brace'), enemies = ['shambler'], relics = [], potions = [null, null, null], hp = 80, seed = 'T' } = {}) {
  const run = { seed, hp, maxHp: 80, weapons: {}, potions,
    deck: deck.map((id, i) => ({ uid: `c${i + 1}`, id: id.replace('+', ''), up: id.endsWith('+') })),
    relics: relics.map(id => ({ id, counter: 0 })) };
  const c = createCombat({ run, encounter: { id: 'test', enemies }, rng: seed });
  c.start();
  return c;
}
function hand(c, ids, energy = 99) {
  c.state.hand = ids.map((id, i) => c.makeCombatCard({ uid: `h${i + 1}_${c.state.turn}`, id: id.replace('+', ''), up: id.endsWith('+') }));
  c.state.energy = energy;
  return c.state.hand.map(x => x.uid);
}
const E = (c, i = 0) => c.state.enemies[i];
const pass = c => { c.state.hand = []; c.endTurn(); };

/** Run an enemy's AI `n` times (pushing its history) for each of `seeds` seeds; returns the move lists. */
function sequences(id, { seeds = 1000, n = 30, slot = 0, enemies } = {}) {
  const out = [];
  for (let s = 0; s < seeds; s++) {
    const c = mk({ enemies: enemies || [id], seed: `AI${s}` });
    const e = E(c, slot);
    e.history = [];
    const seq = [];
    for (let i = 0; i < n; i++) {
      const m = ENEMIES[id].ai(c.makeAi(e));
      assert.ok(ENEMIES[id].moves[m], `${id} picked unknown move ${m}`);
      e.history.push(m); seq.push(m);
    }
    out.push(seq);
  }
  return out;
}
const runs = (seq, m, k) => seq.some((_, i) => i + k <= seq.length && seq.slice(i, i + k).every(x => x === m));
function share(seqs, m) { const all = seqs.flat(); return all.filter(x => x === m).length / all.length; }

// ---------------------------------------------------------------- AI patterns (1000 seeds each)

test('Shambler (Jaw Worm): opens with Bite Down; never Groan twice, Shamble 3x or Bite Down twice', () => {
  const seqs = sequences('shambler');
  for (const s of seqs) {
    assert.equal(s[0], 'bite_down');
    assert.ok(!runs(s, 'groan', 2) && !runs(s, 'shamble', 3) && !runs(s, 'bite_down', 2), s.join(' '));
  }
  const g = share(seqs, 'groan'), sh = share(seqs, 'shamble'), b = share(seqs, 'bite_down');
  assert.ok(g > 0.3 && g < 0.5 && sh > 0.25 && b > 0.15, `groan ${g} shamble ${sh} bite ${b}`);
});

test('Biter and Spitter (louses): never the same move 3 times; Hunch 3-7 and bite 5-7 rolled per zombie', () => {
  for (const id of ['biter', 'spitter']) {
    const seqs = sequences(id);
    for (const s of seqs) for (const m of Object.keys(ENEMIES[id].moves)) assert.ok(!runs(s, m, 3), `${id}: ${s.join(' ')}`);
    const bite = share(seqs, 'bite');
    assert.ok(bite > 0.5 && bite < 0.7, `${id} bite share ${bite}`); // 75% raw, ~59% once "never 3 in a row" bites
  }
  const seen = new Set();
  for (let s = 0; s < 200; s++) {
    const c = mk({ enemies: ['biter', 'spitter'], seed: 'L' + s });
    for (const e of c.state.enemies) {
      assert.ok(e.vars.bite >= 5 && e.vars.bite <= 7);
      assert.ok(e.statuses.hunch >= 3 && e.statuses.hunch <= 7);
      seen.add(e.vars.bite);
    }
    assert.ok(E(c, 0).maxHp >= 10 && E(c, 0).maxHp <= 15 && E(c, 1).maxHp >= 11 && E(c, 1).maxHp <= 17);
  }
  assert.equal(seen.size, 3);
});

test('Bloater (Fungi Beast): never Bite 3x, never Swell twice', () => {
  for (const s of sequences('bloater')) assert.ok(!runs(s, 'bite', 3) && !runs(s, 'grow', 2), s.join(' '));
});

test('Screamer, Sprinter: fixed patterns', () => {
  for (const s of sequences('screamer', { seeds: 50 })) { assert.equal(s[0], 'shriek'); assert.ok(s.slice(1).every(m => m === 'claw')); }
  for (const s of sequences('sprinter', { seeds: 50 })) assert.ok(s.every(m => m === 'lunge'));
  const c = mk({ enemies: ['sprinter'] });
  assert.ok(E(c).maxHp >= 10 && E(c).maxHp <= 14);
});

test('Big Walker (Gremlin Nob): Roar first, then Headbutt ~33% / Charge, never Charge 3x', () => {
  const seqs = sequences('big_walker');
  for (const s of seqs) {
    assert.equal(s[0], 'roar');
    assert.ok(!s.slice(1).includes('roar'));
    assert.ok(!runs(s, 'charge', 3), s.join(' '));
  }
  const h = share(seqs.map(s => s.slice(1)), 'headbutt');
  assert.ok(h > 0.3 && h < 0.5, `headbutt ${h}`);
});

test('Orderlies (Sentries): sides open with Shove, the middle with Swipe; then they alternate', () => {
  for (const slot of [0, 1, 2]) {
    for (const s of sequences('orderly', { seeds: 30, slot, enemies: ['orderly', 'orderly', 'orderly'] })) {
      assert.equal(s[0], slot === 1 ? 'swipe' : 'shove');
      for (let i = 1; i < s.length; i++) assert.notEqual(s[i], s[i - 1]);
    }
  }
});

test('Shield Guard cycle: Raise Shield, Shield Bash, Pepper Spray, Baton Flurry, repeat', () => {
  const [s] = sequences('shield_guard', { seeds: 1, n: 9 });
  assert.deepEqual(s, ['raise_shield', 'shield_bash', 'pepper_spray', 'baton_flurry', 'raise_shield', 'shield_bash', 'pepper_spray', 'baton_flurry', 'raise_shield']);
});

// ---------------------------------------------------------------- behaviour in real fights

test('Hunch: the first attack that hurts gives block after the last hit; kills and pure damage do not trigger it', () => {
  const c = mk({ enemies: ['biter'] });
  const z = E(c); z.hp = z.maxHp = 40; z.statuses.hunch = 5; z.block = 0;
  const [a] = hand(c, ['one_two']); c.takeEvents();
  c.playCard(a, z.uid);
  const evs = c.takeEvents();
  const hits = evs.filter(e => e.t === 'damage');
  assert.deepEqual(hits.map(h => h.blocked), [0, 0], 'both hits land before it curls');
  assert.equal(z.block, 5);
  assert.equal(z.statuses.hunch, undefined);
  assert.ok(evs.findIndex(e => e.t === 'block' && e.target === z.uid) > evs.indexOf(hits[1]));
  const [b] = hand(c, ['bat_swing']); c.playCard(b, z.uid);
  assert.equal(z.block, 0, 'only once');

  const d = mk({ enemies: ['biter'], potions: ['pipe_bomb', null, null] });
  const dz = E(d); dz.hp = dz.maxHp = 40; dz.statuses.hunch = 5;
  d.usePotion(0);
  assert.equal(dz.statuses.hunch, 5, 'pure damage does not trigger Hunch');
});

test('Screamer: Frenzy skips its first turn, so Claw hits 6, 9, 12', () => {
  const c = mk({ enemies: ['screamer'] });
  E(c).hp = E(c).maxHp = 500;
  const claws = [];
  for (let t = 0; t < 4; t++) {
    c.takeEvents(); pass(c);
    const d = c.takeEvents().find(e => e.t === 'damage' && e.target === 'party');
    if (d) claws.push(d.amount + d.blocked);
  }
  assert.deepEqual(claws, [6, 9, 12]);
});

test('Big Walker: Rage gives it Strength whenever a Skill is played', () => {
  const c = mk({ enemies: ['big_walker'] });
  const w = E(c); w.hp = w.maxHp = 300;
  pass(c); // Roar
  assert.equal(w.statuses.enrage, 2);
  const [a, b] = hand(c, ['brace', 'bat_swing']);
  c.playCard(a); c.playCard(b, w.uid);
  assert.equal(w.statuses.strength, 2);
});

test('Sleeping Patient: sleeps 3 turns with Plating, then attacks unstunned on turn 4; Flail, Flail, Drain', () => {
  const c = mk({ enemies: ['sleeping_patient'] });
  const p = E(c);
  assert.equal(p.statuses.asleep, 3); assert.equal(p.block, 8);
  assert.equal(p.intent.type, 'sleep');
  const moves = [];
  for (let t = 0; t < 7; t++) {
    c.takeEvents(); pass(c);
    const evs = c.takeEvents();
    moves.push(evs.find(e => e.t === 'enemy_move').move);
    if (t < 2) assert.equal(p.block, 8, 'plating while asleep');
    if (t === 2) assert.ok(evs.some(e => e.t === 'wake' && e.stunned === false));
  }
  assert.deepEqual(moves, ['sleep', 'sleep', 'sleep', 'flail', 'flail', 'drain', 'flail']);
  assert.equal(p.statuses.plating, undefined, 'plating removed on waking');
  assert.equal(c.state.party.statuses.strength, -1);
  assert.equal(c.state.party.statuses.dexterity, -1);
});

test('Sleeping Patient: block soaks a hit without waking it; losing HP wakes it stunned for one turn', () => {
  const c = mk({ enemies: ['sleeping_patient'] });
  const p = E(c);
  let [a] = hand(c, ['bat_swing']); c.playCard(a, p.uid);
  assert.equal(p.statuses.asleep, 3, 'block took it all');
  [a] = hand(c, ['bat_swing']); c.takeEvents(); c.playCard(a, p.uid);
  const evs = c.takeEvents();
  assert.ok(evs.some(e => e.t === 'wake' && e.stunned));
  assert.equal(p.intent.type, 'stun');
  assert.ok(evs.some(e => e.t === 'intent' && e.intent.type === 'stun'));
  pass(c);
  const turn = c.takeEvents();
  assert.ok(turn.some(e => e.t === 'stunned' && e.uid === p.uid));
  assert.ok(!turn.some(e => e.t === 'damage' && e.target === 'party'));
  assert.equal(p.intent.move, 'flail');
});

test('Shield Guard: Shield Up after 30 HP lost (after block), 20 block, Spiked once per Attack card, then 40 next time', () => {
  const c = mk({ enemies: ['shield_guard'] });
  const g = E(c);
  assert.equal(g.statuses.mode_shift, 30);
  g.block = 9;
  c.state.party.statuses.strength = 4;
  let [a] = hand(c, ['bat_swing']); c.playCard(a, g.uid); // 10 dmg, 9 blocked
  assert.equal(g.statuses.mode_shift, 29);
  c.state.party.statuses.strength = 0;
  [a] = hand(c, ['grand_slam']); c.takeEvents(); c.playCard(a, g.uid);
  let evs = c.takeEvents();
  const ms = evs.find(e => e.t === 'mode_shift');
  assert.deepEqual([ms.mode, ms.first], ['defensive', true]);
  assert.equal(g.block, 20);
  assert.equal(g.intent.move, 'shield_wall');
  assert.equal(g.statuses.mode_shift, undefined);
  pass(c); // Shield Wall: Spiked 3
  assert.equal(g.statuses.thorns, 3);
  const hpBefore = c.state.party.hp;
  [a] = hand(c, ['one_two']); c.takeEvents(); c.playCard(a, g.uid);
  evs = c.takeEvents();
  const spikes = evs.filter(e => e.t === 'damage' && e.target === 'party' && e.kind === 'thorns');
  assert.equal(spikes.length, 1, 'once per card, not per hit');
  assert.equal(c.state.party.hp, hpBefore - 3);
  [a] = hand(c, ['brace']); c.takeEvents(); c.playCard(a);
  assert.ok(!c.takeEvents().some(e => e.kind === 'thorns'), 'skills are safe');
  assert.equal(g.intent.move, 'shield_charge');
  pass(c); // Shield Charge 9
  assert.equal(g.intent.move, 'double_slam');
  pass(c); // Double Slam 8x2, back to offensive
  assert.equal(g.vars.mode, 'offensive');
  assert.equal(g.statuses.thorns, undefined);
  assert.equal(g.statuses.mode_shift, 40);
  assert.equal(g.intent.move, 'baton_flurry');
  // the counter only runs in offensive mode, and the second shift needs 40
  c.state.party.hp = 80;
  g.block = 0;
  [a] = hand(c, ['grand_slam']); c.playCard(a, g.uid);
  assert.equal(g.vars.mode, 'offensive'); assert.equal(g.statuses.mode_shift, 8);
  [a] = hand(c, ['bat_swing+']); c.playCard(a, g.uid);
  assert.equal(g.vars.mode, 'defensive'); assert.equal(g.vars.shifts, 2);
});

test('Nurse: revives the last fallen zombie at 50% HP (at most twice), alternates Jab and Mend', () => {
  const c = mk({ enemies: ['biter', 'nurse'] });
  const [b, n] = c.state.enemies;
  n.hp = n.maxHp = 300;
  assert.equal(n.intent.move, 'jab');
  b.hp = 1; b.statuses = {};
  let [a] = hand(c, ['bat_swing']); c.playCard(a, b.uid);
  assert.ok(!b.alive);
  assert.equal(n.intent.move, 'jab', 'intents do not change mid-turn');
  pass(c);
  assert.equal(n.intent.move, 'revive');
  c.takeEvents(); pass(c);
  let evs = c.takeEvents();
  const rv = evs.find(e => e.t === 'revive');
  assert.equal(rv.uid, b.uid); assert.equal(rv.hp, Math.floor(b.maxHp * 0.5));
  assert.ok(b.alive);
  assert.ok(!evs.some(e => e.t === 'enemy_move' && e.uid === b.uid), 'the revived zombie waits a turn');
  assert.ok(b.intent, 'it shows an intent right away');
  // second revive, then no more
  for (let k = 0; k < 2; k++) {
    b.hp = 1; b.block = 0; b.statuses = {};
    [a] = hand(c, ['bat_swing']); c.playCard(a, b.uid);
    pass(c);
    if (k === 0) { assert.equal(n.intent.move, 'revive'); pass(c); assert.ok(b.alive); }
    else assert.notEqual(n.intent.move, 'revive', 'revive cap is 2');
  }
  assert.equal(n.vars.revives, 2);
  // Mend: other zombies +5, Nurse 6 block
  const d = mk({ enemies: ['biter', 'nurse'] });
  const [db, dn] = d.state.enemies;
  db.hp = 3; db.maxHp = 15; dn.hp = dn.maxHp = 300;
  d.setIntent(dn, 'mend'); d.setIntent(db, 'grow');
  pass(d);
  assert.equal(db.hp, 8);
  const lastCare = dn.history.filter(m => m !== 'revive').pop();
  assert.equal(lastCare, 'mend');
  assert.equal(dn.intent.move, 'jab');
});

test('Orderlies: Immune shrugs off the first debuff; Shove shuffles 2 Panic into the discard pile', () => {
  const c = mk({ enemies: ['orderly', 'orderly', 'orderly'], relics: ['pager'] });
  for (const o of c.state.enemies) {
    assert.equal(o.statuses.immune, undefined, 'Pager used up their Immune');
    assert.equal(o.statuses.vulnerable, undefined);
  }
  const evs = c.takeEvents();
  assert.equal(evs.filter(e => e.t === 'immune').length, 3);
  const [a] = hand(c, ['home_run']);
  c.playCard(a, E(c, 1).uid);
  assert.equal(E(c, 1).statuses.vulnerable, 2, 'the second debuff lands');
  c.takeEvents(); pass(c);
  const created = c.takeEvents().filter(e => e.t === 'card_created');
  assert.equal(created.length, 4, 'two side Orderlies x 2 Panic');
  assert.ok(created.every(e => e.id === 'panic' && e.to === 'discard'));
});

test('Bloater: Spore Burst gives the party 2 Staggered, unless it was the last zombie', () => {
  const c = mk({ enemies: ['bloater', 'bloater'] });
  E(c, 0).hp = 1;
  let [a] = hand(c, ['bat_swing']); c.playCard(a, E(c, 0).uid);
  assert.equal(c.state.party.statuses.vulnerable, 2);
  c.state.party.statuses = {};
  E(c, 1).hp = 1;
  [a] = hand(c, ['bat_swing']); c.playCard(a, E(c, 1).uid);
  assert.equal(c.state.party.statuses.vulnerable, undefined);
  assert.equal(c.state.phase, 'won');
});

test('zombies act left to right; party damage alternates Marc (even slots) and Yola (odd slots)', () => {
  const c = mk({ enemies: ['sprinter', 'sprinter', 'sprinter'] });
  for (const z of c.state.enemies) z.hp = z.maxHp = 100;
  c.takeEvents(); pass(c);
  const evs = c.takeEvents();
  assert.deepEqual(evs.filter(e => e.t === 'enemy_move').map(e => e.uid), ['e1', 'e2', 'e3']);
  assert.deepEqual(evs.filter(e => e.t === 'damage' && e.target === 'party').map(e => e.hero), ['marc', 'yola', 'marc']);
});

// ---------------------------------------------------------------- encounters

test('encounters: pools, no repeat of the last two fights, no elite twice in a row', () => {
  for (const id of Object.keys(ENCOUNTERS)) for (const z of ENCOUNTERS[id].enemies) assert.ok(ENEMIES[z], `${id}: ${z}`);
  for (const [pool, entries] of Object.entries(POOLS)) for (const id of Object.keys(entries)) assert.equal(ENCOUNTERS[id].kind, pool);
  const rng = makeRng('ENC');
  for (let i = 0; i < 300; i++) {
    const history = [];
    for (let f = 0; f < 10; f++) {
      const id = pickEncounter('fight', rng, history);
      assert.equal(ENCOUNTERS[id].kind, f < 3 ? 'easy' : 'hard');
      assert.ok(!history.slice(-2).includes(id), `repeat ${id} after ${history.slice(-2)}`);
      history.push(id);
    }
    const elites = [];
    for (let k = 0; k < 6; k++) {
      const id = pickEncounter('elite', rng, elites);
      assert.notEqual(id, elites[elites.length - 1]);
      elites.push(id);
    }
  }
  assert.equal(pickEncounter('boss', rng), 'shield_guard');
});
