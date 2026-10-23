// Smoke test: a simple greedy bot plays every encounter with the starter deck (and with every weapon) over many
// seeds. Each fight must end, win or lose, without an exception, and the event log must stay consistent with the
// state. The bot's HP loss per encounter is printed as a diagnostic (a first balance read, not a target check).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../src/game/combat.js';
import { ENCOUNTERS } from '../src/game/content/encounters.js';
import { cardView, makeStarterDeck } from '../src/game/content/cards.js';
import { WEAPONS } from '../src/game/content/weapons.js';
import { makeStreams } from '../src/game/rng.js';

/** Greedy: kill if possible, Stagger before Yola's payoffs, block when the hit is coming, else hit the weakest. */
function botTurn(c) {
  for (let guard = 0; guard < 30 && !c.over && c.state.phase === 'player'; guard++) {
    const alive = c.alive();
    const incoming = alive.reduce((t, e) => t + (c.intentOf(e.uid)?.total || 0), 0);
    const options = [];
    for (const card of c.state.hand) {
      const view = cardView(card);
      const targets = view.target === 'enemy' ? alive : [null];
      for (const t of targets) {
        if (!c.canPlay(card.uid, t?.uid).ok) continue;
        const p = c.previewCard(card.uid, t?.uid);
        const cost = Math.max(0.5, c.costOf(card) || 0);
        let score = 0;
        const dmg = p.total;
        if (t && dmg >= t.hp + t.block) score += 100 + t.hp;
        score += dmg / cost;
        if (incoming > c.state.party.block) score += Math.min(p.block, incoming - c.state.party.block) * 1.2 / cost;
        if (view.type === 'power') score += 12;
        if (t && view.effects.some(e => e.op === 'apply' && e.status === 'vulnerable') && !(t.statuses.vulnerable > 0)) score += 8;
        if (view.effects.some(e => e.op === 'draw' || e.op === 'energy')) score += 3;
        if (view.type === 'status' || view.type === 'curse') score -= 5;
        options.push({ uid: card.uid, target: t?.uid, score });
      }
    }
    options.sort((a, b) => b.score - a.score);
    if (!options.length || options[0].score <= 0) break;
    const r = c.playCard(options[0].uid, options[0].target);
    assert.ok(r.ok, JSON.stringify(r));
  }
}

function fight(encounter, seed, weapons = { marc: 'wood_bat', yola: 'pistol' }, hp = 80) {
  const run = { seed, hp, maxHp: 80, deck: makeStarterDeck(weapons), relics: [{ id: 'nurses_kit', counter: 0 }],
    potions: [null, null, null], weapons };
  const c = createCombat({ run, encounter, rng: makeStreams(seed) });
  c.start();
  let turns = 0;
  while (!c.over && turns < 80) {
    botTurn(c);
    if (!c.over) c.endTurn();
    turns++;
  }
  return c;
}

function checkLog(c) {
  const evs = c.takeEvents();
  assert.equal(evs[0].t, 'combat_start');
  assert.equal(evs[evs.length - 1].t, 'combat_end');
  assert.equal(evs.filter(e => e.t === 'combat_end').length, 1);
  const hp = new Map(evs[0].enemies.map(e => [e.uid, e.hp]));
  let party = c.state.startHp;
  for (const e of evs) {
    if (e.t === 'damage' && e.target === 'party') party = e.hp;
    if (e.t === 'heal' && e.target === 'party') party = e.hp;
    if (e.t === 'damage' && e.target !== 'party') hp.set(e.target, e.hp);
    if (e.t === 'heal' && e.target !== 'party') hp.set(e.target, e.hp);
    if (e.t === 'revive') hp.set(e.uid, e.hp);
    assert.ok(!(e.t === 'damage' && e.amount < 0), 'no negative damage');
  }
  assert.equal(party, c.state.party.hp, 'HP from events matches state');
  for (const z of c.state.enemies) if (z.alive) assert.equal(hp.get(z.uid), z.hp, `${z.uid} HP from events`);
  return evs;
}

test('greedy bot finishes every encounter (20 seeds each) without errors; events match the state', t => {
  const lines = [];
  for (const id of Object.keys(ENCOUNTERS)) {
    let wins = 0, lost = 0, turns = 0;
    const N = 20;
    for (let s = 0; s < N; s++) {
      const c = fight(id, `${id}-${s}`);
      assert.ok(c.over, `${id} seed ${s} did not finish`);
      checkLog(c);
      const r = c.result();
      if (r.won) wins++;
      lost += 80 - (r.won ? c.state.endHp : 0);
      turns += r.turns;
    }
    lines.push(`${id.padEnd(17)} win ${String(Math.round(wins / N * 100)).padStart(3)}%  HP lost ${(lost / N).toFixed(1).padStart(5)}  turns ${(turns / N).toFixed(1)}`);
  }
  t.diagnostic('starter deck, greedy bot, 80 HP each fight:');
  for (const l of lines) t.diagnostic(l);
});

test('every weapon loadout plays through a hard fight, an elite and the boss', () => {
  const marc = Object.values(WEAPONS).filter(w => w.hero === 'marc').map(w => w.id);
  const yola = Object.values(WEAPONS).filter(w => w.hero === 'yola').map(w => w.id);
  for (const m of marc) for (const y of yola) {
    for (const enc of ['horde', 'orderlies', 'shield_guard']) {
      const c = fight(enc, `W-${m}-${y}-${enc}`, { marc: m, yola: y });
      assert.ok(c.over, `${m}/${y} ${enc}`);
      checkLog(c);
    }
  }
});

test('the bot is deterministic: same seed, same result', () => {
  const a = fight('nurse_pack', 'SAME');
  const b = fight('nurse_pack', 'SAME');
  assert.deepEqual(a.result(), b.result());
});
