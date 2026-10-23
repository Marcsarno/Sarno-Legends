// Map generation (src/game/map.js): Slay the Spire's map rules checked over 500 seeds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, parentsOf, edgesOf, roomCounts, MAP_ROWS, MAP_WIDTH, NO_REPEAT_TYPES, SIBLING_TYPES } from '../src/game/map.js';
import { makeRng, makeStreams } from '../src/game/rng.js';

const SEEDS = Array.from({ length: 500 }, (_, i) => `MAP-${i}`);
const maps = SEEDS.map(s => generateMap(makeRng(s)));
const rooms = m => Object.values(m.nodes).filter(n => n.id !== m.boss);

test('shape: 7 x 15 grid, ids, starts on row 1, the boss on row 16, corridors climb one row', () => {
  for (const m of maps) {
    assert.equal(m.rows, MAP_ROWS);
    assert.equal(m.width, MAP_WIDTH);
    const boss = m.nodes[m.boss];
    assert.equal(boss.type, 'boss');
    assert.equal(boss.row, 16);
    assert.deepEqual(boss.next, []);
    assert.ok(m.starts.length >= 2 && m.starts.length <= 6, `starts ${m.starts.length}`);
    for (const id of m.starts) assert.equal(m.nodes[id].row, 1);
    for (const n of rooms(m)) {
      assert.equal(n.id, `r${n.row}c${n.col}`);
      assert.ok(n.row >= 1 && n.row <= 15 && n.col >= 0 && n.col < 7);
      assert.ok(n.next.length >= 1, `${n.id} is a dead end`);
      for (const to of n.next) {
        const t = m.nodes[to];
        assert.ok(t, `${n.id} -> missing ${to}`);
        if (n.row === 15) assert.equal(to, m.boss);
        else { assert.equal(t.row, n.row + 1); assert.ok(Math.abs(t.col - n.col) <= 1); }
      }
    }
  }
});

test('every room is on a path: reachable from row 1 and leads to the boss', () => {
  for (const m of maps) {
    const seen = new Set(m.starts);
    const stack = [...m.starts];
    while (stack.length) for (const to of m.nodes[stack.pop()].next) if (!seen.has(to)) { seen.add(to); stack.push(to); }
    assert.equal(seen.size, Object.keys(m.nodes).length, 'all rooms reachable');
    const parents = parentsOf(m);
    for (const n of rooms(m)) if (n.row > 1) assert.ok(parents[n.id]?.length, `${n.id} has no way in`);
  }
});

test('no two corridors cross', () => {
  for (const m of maps) {
    const edges = edgesOf(m).filter(([, b]) => b !== m.boss).map(([a, b]) => [m.nodes[a], m.nodes[b]]);
    for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
      const [a, b] = edges[i], [c, d] = edges[j];
      if (a.row !== c.row) continue;
      const crosses = (a.col < c.col && b.col > d.col) || (a.col > c.col && b.col < d.col);
      assert.ok(!crosses, `${a.id}->${b.id} crosses ${c.id}->${d.id}`);
    }
  }
});

test('fixed rows: row 1 fights, row 9 treasure, row 15 rest; no elite or rest before row 6; no rest on row 14', () => {
  for (const m of maps) for (const n of rooms(m)) {
    if (n.row === 1) assert.equal(n.type, 'fight');
    else if (n.row === 9) assert.equal(n.type, 'treasure');
    else if (n.row === 15) assert.equal(n.type, 'rest');
    else assert.ok(['fight', 'elite', 'rest', 'shop', 'event'].includes(n.type), n.type);
    if (n.row < 6) assert.ok(n.type !== 'elite' && n.type !== 'rest', `${n.type} on row ${n.row}`);
    if (n.row === 14) assert.notEqual(n.type, 'rest');
  }
});

test('no elite, rest, shop or treasure straight after the same type on any path', () => {
  for (const m of maps) for (const n of rooms(m)) for (const to of n.next) {
    const t = m.nodes[to];
    if (NO_REPEAT_TYPES.includes(n.type) && t.type === n.type) {
      // the fixed rows (9 treasure, 15 rest) have no same-type parent by construction
      assert.fail(`${n.id} ${n.type} -> ${t.id} ${t.type}`);
    }
  }
});

test('siblings differ (only the last-minute fight fill may repeat, and rarely)', () => {
  let pairs = 0, fightPairs = 0;
  for (const m of maps) for (const n of rooms(m)) {
    if (n.row === 8 || n.row === 14) continue; // children are on a fixed row
    const kids = n.next.map(id => m.nodes[id]);
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      pairs++;
      if (kids[i].type !== kids[j].type) continue;
      assert.ok(SIBLING_TYPES.includes(kids[i].type));
      assert.equal(kids[i].type, 'fight', `${n.id}: siblings both ${kids[i].type}`);
      fightPairs++;
    }
  }
  assert.ok(fightPairs / pairs < 0.08, `fight siblings ${fightPairs}/${pairs}`);
});

test('room mix over 500 maps looks like Slay the Spire (shares of the whole map)', t => {
  const tot = {};
  let all = 0;
  for (const m of maps) for (const [k, v] of Object.entries(roomCounts(m))) { if (k === 'boss') continue; tot[k] = (tot[k] || 0) + v; all += v; }
  const share = k => (tot[k] || 0) / all;
  t.diagnostic(Object.entries(tot).map(([k, v]) => `${k} ${(v / all * 100).toFixed(1)}%`).join(', '));
  assert.ok(share('fight') > 0.40 && share('fight') < 0.60);
  assert.ok(share('event') > 0.15 && share('event') < 0.26);
  assert.ok(share('rest') > 0.15 && share('rest') < 0.26, 'rest incl. row 15');
  assert.ok(share('elite') > 0.03 && share('elite') < 0.10);
  assert.ok(share('shop') > 0.02 && share('shop') < 0.07);
  assert.ok(maps.every(m => roomCounts(m).elite >= 1), 'every map has an elite');
  const avgRooms = maps.reduce((a, m) => a + rooms(m).length, 0) / maps.length;
  assert.ok(avgRooms > 40 && avgRooms < 70, `rooms per map ${avgRooms}`);
});

test('layout: x, y normalised 0..1, rows strictly ordered bottom to top, boss on top', () => {
  for (const m of maps) {
    for (const n of Object.values(m.nodes)) {
      assert.ok(n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1, `${n.id} ${n.x},${n.y}`);
    }
    for (let r = 1; r < 15; r++) {
      const lo = rooms(m).filter(n => n.row === r).map(n => n.y);
      const hi = rooms(m).filter(n => n.row === r + 1).map(n => n.y);
      assert.ok(Math.max(...lo) < Math.min(...hi), `row ${r} overlaps row ${r + 1}`);
    }
    assert.equal(m.nodes.boss.y, 1);
    const xs = rooms(m).map(n => n.x);
    for (const n of rooms(m)) assert.ok(Math.abs(n.x - n.col / 6) <= 0.05, 'jitter stays within a quarter column');
    assert.ok(Math.min(...xs) <= 0.2 || Math.max(...xs) >= 0.8);
  }
});

test('deterministic: the same seed (string, rng or stream) gives the same map', () => {
  assert.deepEqual(generateMap('A1'), generateMap(makeRng('A1')));
  assert.deepEqual(generateMap(makeStreams('S').map), generateMap(makeStreams('S').map));
  assert.notDeepEqual(generateMap('A1'), generateMap('A2'));
  assert.deepEqual(JSON.parse(JSON.stringify(maps[0])), maps[0], 'plain JSON');
});
