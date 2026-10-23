// Map generation for one act (one hospital floor), Slay the Spire's algorithm. Pure: runs in node and the browser.
//
//   const map = generateMap(rng)     // rng: a makeRng stream (run.rng.map restored) or a seed string
//   map = { rows: 15, width: 7, nodes: { [id]: { id, row, col, x, y, type, next: [id] } }, starts: [id], boss: 'boss' }
//
// How it is built (StS, BUILD_SPEC section 5 + docs/STS_NUMBERS_CHECK.md):
//   1. Six paths climb a 7 x 15 grid from row 1. Each step goes up-left, up or up-right. The second path never starts
//      in the first path's column. A step that would cross an existing corridor goes straight up instead, so no two
//      corridors ever cross. Grid cells no path touches are dropped.
//   2. Fixed rows: row 1 all fights, row 9 all treasure, row 15 all rest (the supply closets before the boss).
//   3. The other rooms come from a shuffled list sized as shares of the whole map (shop 5%, rest 12%, event 22%,
//      elite 8%, the rest fights), handed out row by row. A room type is skipped for a node when it breaks a rule:
//        - no elite or rest before row 6, no rest on row 14;
//        - no elite, rest, shop or treasure straight after the same type (on any path into the node);
//        - siblings (other rooms reachable from the same parent) never share a type (fight, event, elite, rest, shop).
//      A node no listed type fits becomes a fight (StS's last-minute fill), so a few fight siblings can remain.
//   4. Every row-15 room leads to the boss node (row 16), shown from the start.
// Layout: x, y are normalised 0..1 for drawing with a little jitter. x: 0 = left column, 1 = right column.
// y: 0 = the bottom row (row 1, next to the lobby) up to 1 = the boss at the top. node.row/col are the grid cell.

import { makeRng } from './rng.js';

export const MAP_ROWS = 15;
export const MAP_WIDTH = 7;
export const MAP_PATHS = 6;
export const BOSS_ROW = MAP_ROWS + 1;

export const ROOM_ODDS = { shop: 0.05, rest: 0.12, event: 0.22, elite: 0.08 }; // the rest are fights
export const FIXED_ROWS = { 1: 'fight', 9: 'treasure', 15: 'rest' };
export const NO_REPEAT_TYPES = ['elite', 'rest', 'shop', 'treasure'];      // can't follow the same type on a path
export const SIBLING_TYPES = ['fight', 'event', 'elite', 'rest', 'shop'];  // children of one parent differ
export const EARLIEST = { elite: 6, rest: 6 };                            // first row these may appear on
export const NO_REST_ROW = 14;

export const nodeId = (row, col) => `r${row}c${col}`;

/** Build a map. rng: a makeRng-like generator ({ int, range, next, shuffle }) or a seed string. */
export function generateMap(rng, opts = {}) {
  if (!rng || typeof rng !== 'object' || typeof rng.next !== 'function') rng = makeRng(rng ?? 'map');
  const rows = opts.rows || MAP_ROWS;
  const width = opts.width || MAP_WIDTH;
  const paths = opts.paths || MAP_PATHS;

  // ---- 1. paths
  const cells = new Map(); // id -> { row, col, next: Set }
  const cell = (r, c) => {
    const id = nodeId(r, c);
    if (!cells.has(id)) cells.set(id, { id, row: r, col: c, next: new Set() });
    return cells.get(id);
  };
  const hasEdge = (r, c, toCol) => cells.get(nodeId(r, c))?.next.has(nodeId(r + 1, toCol));

  let firstStart = -1;
  for (let p = 0; p < paths; p++) {
    let col = rng.int(width);
    if (p === 0) firstStart = col;
    if (p === 1) while (col === firstStart) col = rng.int(width);
    for (let r = 1; r < rows; r++) {
      const here = cell(r, col);
      let to = col + rng.int(3) - 1;
      to = Math.max(0, Math.min(width - 1, to));
      // no crossing: going right is blocked if the room to our right already goes left (and the mirror case)
      if (to === col + 1 && hasEdge(r, col + 1, col)) to = col;
      if (to === col - 1 && hasEdge(r, col - 1, col)) to = col;
      here.next.add(nodeId(r + 1, to));
      cell(r + 1, to);
      col = to;
    }
  }

  // ---- nodes (only cells on a path exist), sorted row by row, left to right
  const nodes = {};
  const order = [...cells.values()].sort((a, b) => a.row - b.row || a.col - b.col);
  for (const c of order) {
    nodes[c.id] = { id: c.id, row: c.row, col: c.col, x: 0, y: 0, type: null,
      next: [...c.next].sort((a, b) => cells.get(a).col - cells.get(b).col) };
  }
  const parents = {};
  for (const n of Object.values(nodes)) for (const to of n.next) (parents[to] ||= []).push(n.id);

  // ---- 2. fixed rows
  for (const n of Object.values(nodes)) if (FIXED_ROWS[n.row]) n.type = FIXED_ROWS[n.row];

  // ---- 3. room list as shares of the whole map, then hand them out with the rules
  const total = Object.keys(nodes).length;
  const open = Object.values(nodes).filter(n => !n.type).sort((a, b) => a.row - b.row || a.col - b.col);
  const list = [];
  for (const [type, share] of Object.entries(ROOM_ODDS)) for (let i = 0; i < Math.round(total * share); i++) list.push(type);
  while (list.length < open.length) list.push('fight');
  rng.shuffle(list);

  const fits = (n, type) => {
    if (EARLIEST[type] && n.row < EARLIEST[type]) return false;
    if (type === 'rest' && n.row === NO_REST_ROW) return false;
    const ps = parents[n.id] || [];
    if (NO_REPEAT_TYPES.includes(type) && ps.some(p => nodes[p].type === type)) return false;
    if (SIBLING_TYPES.includes(type)) {
      for (const p of ps) for (const sib of nodes[p].next) if (sib !== n.id && nodes[sib].type === type) return false;
    }
    // a child that is already typed (fixed rows) can't repeat a no-repeat type either (rest before the rest row)
    if (NO_REPEAT_TYPES.includes(type) && n.next.some(c => nodes[c]?.type === type)) return false;
    return true;
  };
  for (const n of open) {
    const i = list.findIndex(type => fits(n, type));
    if (i >= 0) n.type = list.splice(i, 1)[0];
  }
  for (const n of open) if (!n.type) n.type = 'fight';

  // ---- 4. boss + layout
  const boss = { id: 'boss', row: rows + 1, col: Math.floor(width / 2), x: 0.5, y: 1, type: 'boss', next: [] };
  for (const n of Object.values(nodes)) {
    if (n.row === rows) n.next = ['boss'];
    const jx = (rng.next() - 0.5) * 0.5;   // up to a quarter column each way
    const jy = (rng.next() - 0.5) * 0.4;   // up to a fifth of a row each way
    n.x = round3(clamp01((n.col + jx) / (width - 1)));
    n.y = round3(clamp01((n.row - 1 + jy) / rows));
  }
  nodes.boss = boss;
  const starts = Object.values(nodes).filter(n => n.row === 1).map(n => n.id);
  return { rows, width, nodes, starts, boss: 'boss' };
}

const clamp01 = v => Math.max(0, Math.min(1, v));
const round3 = v => Math.round(v * 1000) / 1000;

/** Ids of the rooms you can walk to next: the row-1 rooms before the first step, then the current room's corridors. */
export function nextNodes(map, fromId) {
  if (!fromId) return map.starts.slice();
  return (map.nodes[fromId]?.next || []).slice();
}

/** Parent ids of every node (rooms with a corridor into it). */
export function parentsOf(map) {
  const out = {};
  for (const n of Object.values(map.nodes)) for (const to of n.next) (out[to] ||= []).push(n.id);
  return out;
}

/** All corridors as [fromId, toId] pairs (handy for drawing and tests). */
export function edgesOf(map) {
  const out = [];
  for (const n of Object.values(map.nodes)) for (const to of n.next) out.push([n.id, to]);
  return out;
}

/** Count of each room type on the map (handy for tests and the sim). */
export function roomCounts(map) {
  const out = {};
  for (const n of Object.values(map.nodes)) out[n.type] = (out[n.type] || 0) + 1;
  return out;
}
