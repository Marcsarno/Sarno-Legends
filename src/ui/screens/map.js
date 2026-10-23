// Map: the act as a hospital floor plan (blueprint). Navy paper, cyan grid and linework, hand-inked room icons; the
// lobby at the bottom, the boss elevator at the top (always shown). Dashed corridors join the rooms, the path walked so
// far is inked solid, the current room pulses, the rooms you can reach next glow and take a tap; then a marker walks
// the corridor and act.travel(nodeId) fires. The first look at a fresh floor pans down from the boss to the lobby.
//   ctx: { run: { map, node, path, floor, act }, viewOnly?, bossName?, intro? (false skips the pan), topbar? }
//   act: travel(nodeId), openDeck(), close() (view-only), openMap/settings/potion (top bar)
// run.map = { rows, width, nodes: { id: { id, row, col, x, y, type, next } }, starts, boss } (src/game/map.js).

import { shell, topbar, hoverSounds, ui, h, icon, wait, closeBtn, onEscape } from './common.js';
import { on, unit, clamp } from '../dom.js';
import { anim, ms } from '../tween.js';
import '../styles/screens-map.css';

export const ROOM_TYPES = {
  fight:    { name: 'Zombies',       label: 'WARD',     tip: 'A fight. Supplies, maybe a potion, and a new card.' },
  elite:    { name: 'Elite',         label: 'ICU',      tip: 'Something big. A hard fight, and a relic if you win.' },
  rest:     { name: 'Supply Closet', label: 'CLOSET',   tip: 'Rest to heal, or patch up a card.' },
  shop:     { name: 'Pharmacy',      label: 'PHARMACY', tip: 'Spend supplies on cards, relics and potions, or have a card removed.' },
  event:    { name: 'Locked Room',   label: 'LOCKED',   tip: 'Something behind a locked door. Could be anything.' },
  treasure: { name: 'Supply Crate',  label: 'STORAGE',  tip: 'A locked crate: a relic and some supplies.' },
  boss:     { name: 'Boss',          label: 'ELEVATOR', tip: 'The way up. Something stands in front of it.' },
};
const LEGEND_ORDER = ['fight', 'elite', 'event', 'rest', 'shop', 'treasure', 'boss'];
const COLS = 'ABCDEFGHIJ';

export function mount(root, ctx) {
  const s = shell(root, 'map');
  const act = ctx.act || {};
  const run = ctx.run;
  const map = run.map || { nodes: {} };
  const nodes = { ...map.nodes };
  // the boss is always drawn: use the map's boss node, or make one when the map only names it (or doesn't)
  const bossId = map.boss || Object.values(nodes).find(n => n.type === 'boss')?.id || 'boss';
  if (!nodes[bossId]) nodes[bossId] = { id: bossId, type: 'boss', row: Infinity, col: Math.floor((map.width || 7) / 2), next: [] };
  const rowsOf = Object.values(nodes).filter(n => n.id !== bossId).map(n => n.row);
  if (!rowsOf.length) rowsOf.push(1);
  const minRow = Math.min(...rowsOf), maxRow = Math.max(...rowsOf);
  const starts = map.starts?.length ? map.starts : Object.values(nodes).filter(n => n.row === minRow).map(n => n.id);
  const width = map.width || 7;
  const viewOnly = !!ctx.viewOnly;

  // ---- static DOM
  const bar = topbar(ctx, s.el);
  const scroll = h('div.map-scroll');
  const sheet = h('div.map-sheet');
  const svg = svgEl('svg', { class: 'map-svg' });
  // the moving lines (open corridors, the walk) live in their own small layer so the big plan never repaints per frame
  const live = svgEl('svg', { class: 'map-svg map-svg--live' });
  const nodeLayer = h('div.map-nodes');
  const marker = h('div.map-marker', { 'aria-hidden': 'true' }, h('i.map-marker__m', { html: icon('marc') }), h('i.map-marker__y', { html: icon('yola') }));
  sheet.append(svg, live, nodeLayer, marker);
  scroll.append(sheet);

  const legend = h('div.map-legend', h('div.map-legend__title', 'Legend'),
    LEGEND_ORDER.map(t => h('div.map-legend__row', {
      dataset: { type: t },
      onpointerenter: () => sheet.classList.add('hl', 'hl--' + t),
      onpointerleave: () => sheet.classList.remove('hl', 'hl--' + t),
    }, h('span.map-legend__ico', { html: icon('node_' + t) }), h('span', ROOM_TYPES[t].name))));
  const floorNo = run.act || 1;
  const head = h('div.map-head',
    h('div.map-head__floor', h('small', 'Level'), h('b', String(floorNo))),
    h('div.map-head__text', h('b', viewOnly ? 'Floor plan' : 'Choose your way up'), h('span.map-head__prog')));
  const block = h('div.map-titleblock',
    h('div.map-tb__row', h('span', 'Sheet'), h('b', `A-${floorNo}`)),
    h('div.map-tb__row', h('span', 'Plan'), h('b', `Level ${floorNo}`)),
    h('div.map-tb__row', h('span', 'Scale'), h('b', '1 : 200')),
    h('div.map-tb__north', { html: northArrow() }));
  s.el.append(h('div.map-paper'), scroll, h('div.map-edge'), head, legend, block);
  if (viewOnly) {
    const close = () => act.close?.();
    s.el.append(h('div.map-close', closeBtn(close, 'Close map')));
    s.cleanup(onEscape(close));
  }
  s.cleanup(hoverSounds(ctx, s.el));

  // ---- layout (px), rebuilt on resize
  let L = null;
  const nodeEls = new Map();
  let busy = false;

  function layout() {
    const W = scroll.clientWidth || innerWidth, H = scroll.clientHeight || innerHeight;
    const u = unit();
    const sheetW = clamp(W - u * 70, u * 86, u * 122);
    const pad = u * 9;
    const rowGap = Math.max(u * 12, 44);
    const lobbyGap = rowGap * 1.25, bossGap = rowGap * 1.7;
    const padTop = u * 20, padBottom = u * 12;
    const span = maxRow - minRow;
    const sheetH = padTop + bossGap + span * rowGap + lobbyGap + padBottom;
    const xs = Object.values(nodes).filter(n => n.id !== bossId).map(n => n.x ?? n.col);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const nx = v => pad + (maxX > minX ? (v - minX) / (maxX - minX) : .5) * (sheetW - pad * 2);
    const rowY = r => sheetH - padBottom - lobbyGap - (r - minRow) * rowGap;
    const pos = new Map();
    for (const n of Object.values(nodes)) {
      if (n.id === bossId) continue;
      let y = rowY(n.row);
      const jy = typeof n.y === 'number' ? n.y - n.row : 0;
      if (Math.abs(jy) < 1) y -= clamp(jy, -.35, .35) * rowGap * .7;
      pos.set(n.id, { x: nx(n.x ?? n.col), y });
    }
    const topY = rowY(maxRow);
    pos.set(bossId, { x: sheetW / 2, y: topY - bossGap });
    const lobby = { x: sheetW / 2, y: sheetH - padBottom, w: Math.min(sheetW * .46, u * 42), h: Math.max(u * 6, 26) };
    const lobbyPt = x => ({ x: clamp(x, lobby.x - lobby.w / 2 + u * 2.5, lobby.x + lobby.w / 2 - u * 2.5), y: lobby.y - lobby.h / 2 });
    L = { W, H, u, sheetW, sheetH, pad, rowGap, pos, lobby, lobbyPt, rowY, topY, bossY: topY - bossGap, nodeR: Math.max(u * 3.6, 17) };
    sheet.style.width = sheetW + 'px';
    sheet.style.height = sheetH + 'px';
    svg.setAttribute('viewBox', `0 0 ${sheetW} ${sheetH}`);
    svg.setAttribute('width', sheetW); svg.setAttribute('height', sheetH);
    for (const a of ['viewBox', 'width', 'height']) live.setAttribute(a, svg.getAttribute(a));
  }

  function draw() {
    layout();
    const { pos, lobby, sheetW, sheetH, u, rowY } = L;
    svg.replaceChildren();
    const defs = svgEl('defs');
    defs.innerHTML = `<filter id="map-ink" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="2.2"/></filter>`;
    svg.append(defs);

    // the building: outer double wall with the entrance at the bottom and the elevator shaft at the top
    const g = svgEl('g', { class: 'map-plan' });
    const x0 = L.pad * .35, x1 = sheetW - L.pad * .35, y0 = L.bossY - u * 9, y1 = lobby.y + u * 5;
    const gapW = u * 16, cx = sheetW / 2, shaftW = u * 22;
    for (const k of [0, 1]) {
      const o = k * u * .9;
      g.append(svgEl('path', { class: 'map-wall', d: `M${cx - gapW / 2} ${y1 - o} H${x0 + o} V${y0 + o} H${cx - shaftW / 2} M${cx + shaftW / 2} ${y0 + o} H${x1 - o} V${y1 - o} H${cx + gapW / 2}` }));
    }
    // elevator shaft at the top
    g.append(svgEl('rect', { class: 'map-wall map-wall--thin', x: cx - shaftW / 2, y: y0 - u * 7, width: shaftW, height: u * 7 }));
    g.append(svgEl('path', { class: 'map-wall map-wall--thin', d: `M${cx - shaftW / 2} ${y0 - u * 7} L${cx + shaftW / 2} ${y0} M${cx + shaftW / 2} ${y0 - u * 7} L${cx - shaftW / 2} ${y0}` }));
    // entrance doors (two swing arcs)
    g.append(svgEl('path', { class: 'map-wall map-wall--thin', d: `M${cx - gapW / 2} ${y1} A${gapW / 2} ${gapW / 2} 0 0 1 ${cx} ${y1 - gapW / 2} M${cx + gapW / 2} ${y1} A${gapW / 2} ${gapW / 2} 0 0 0 ${cx} ${y1 - gapW / 2}` }));
    // partition walls between wards every few rows, with door gaps
    const rnd = seeded(hashStr(run.seed || 'map'));
    for (let r = minRow + 2; r < maxRow; r += 3) {
      const y = (rowY(r) + rowY(r + 1)) / 2;
      let x = x0 + u * .9;
      const doors = [rnd(), rnd(), rnd()].map(v => x0 + (x1 - x0) * (.1 + v * .8)).sort((a, b) => a - b);
      let d = '';
      for (const dx of doors) { if (dx - u * 4 > x) d += `M${x} ${y} H${dx - u * 4} `; x = dx + u * 4; }
      d += `M${x} ${y} H${x1 - u * .9}`;
      g.append(svgEl('path', { class: 'map-wall map-wall--part', d }));
    }
    // grid references: column letters top and bottom, row numbers both sides
    const colX = c => {
      const xs = Object.values(nodes).filter(n => n.col === c && n.id !== bossId).map(n => pos.get(n.id).x);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : L.pad + (width > 1 ? c / (width - 1) : .5) * (sheetW - L.pad * 2);
    };
    for (let c = 0; c < width; c++) {
      const x = colX(c);
      for (const y of [y0 - u * 2.2, y1 + u * 4.4]) g.append(svgText(COLS[c] || '', x, y, 'map-ref'));
      g.append(svgEl('path', { class: 'map-tick', d: `M${x} ${y1 + u * 1.2} v${u * 1.4}` }));
    }
    for (let r = minRow; r <= maxRow; r++) {
      const y = rowY(r);
      g.append(svgText(String(r).padStart(2, '0'), x0 - u * 3, y + u * .7, 'map-ref'));
      g.append(svgText(String(r).padStart(2, '0'), x1 + u * 3, y + u * .7, 'map-ref'));
    }
    // the lobby: a wide room against the entrance wall
    for (const k of [0, 1]) {
      const o = k * u * .7;
      g.append(svgEl('rect', { class: 'map-wall' + (k ? ' map-wall--thin' : ''), x: lobby.x - lobby.w / 2 + o, y: lobby.y - lobby.h / 2 + o, width: lobby.w - o * 2, height: lobby.h - o * 2, rx: u * .6 }));
    }
    g.append(svgText('LOBBY', cx, lobby.y + u * .8, 'map-room-label map-room-label--big'));
    svg.append(g);

    // corridors
    const cg = svgEl('g', { class: 'map-corridors' });
    const seen = new Set();
    const addCor = (aId, bId, a, b) => {
      const key = aId + '>' + bId;
      if (seen.has(key)) return; seen.add(key);
      const p = svgEl('path', { class: 'cor', d: corridor(a, b, L.nodeR * (aId === 'lobby' ? .2 : 1.05), L.nodeR * (bId === bossId ? 2.3 : 1.05), hashStr(key)), dataset: { a: aId, b: bId } });
      cg.append(p);
    };
    for (const id of starts) if (pos.has(id)) addCor('lobby', id, L.lobbyPt(pos.get(id).x), pos.get(id));
    for (const n of Object.values(nodes)) {
      const next = n.next?.length ? n.next : (n.row === maxRow && n.id !== bossId ? [bossId] : []);
      for (const m of next) if (pos.has(m)) addCor(n.id, m, pos.get(n.id), pos.get(m));
    }
    svg.append(cg);
    svg.append(svgEl('g', { class: 'map-ink' }));

    // rooms
    nodeLayer.replaceChildren();
    nodeEls.clear();
    for (const n of Object.values(nodes)) {
      const p = pos.get(n.id);
      if (!p) continue;
      const t = ROOM_TYPES[n.type] ? n.type : 'fight';
      const isBoss = n.id === bossId;
      const label = isBoss ? 'ELEVATOR' : `${String(n.row).padStart(2, '0')}${COLS[n.col] || ''}`;
      const tipBody = isBoss && ctx.bossName ? `${ROOM_TYPES.boss.tip}<br><b>${ctx.bossName}</b>` : ROOM_TYPES[t].tip;
      const el = h(`button.map-node.map-node--${t}`, {
        style: { left: p.x + 'px', top: p.y + 'px' }, dataset: { id: n.id, tip: `text:${ROOM_TYPES[t].name}|${tipBody}`, tipSide: 'right' },
        'aria-label': ROOM_TYPES[t].name,
        onclick: () => choose(n.id),
      },
      h('span.map-node__ring'),
      h('span.map-node__room', h('span.map-node__ico', { html: icon('node_' + t) })),
      h('span.map-node__label', label),
      h('span.map-node__check', { html: circleMark(hashStr(n.id)) }));
      if (isBoss) el.classList.add('map-node--boss');
      nodeLayer.append(el);
      nodeEls.set(n.id, el);
    }
    paint();
  }

  // ---- state: visited, current, reachable
  const reachable = () => {
    if (!run.node) return starts.slice();
    const n = nodes[run.node];
    if (!n) return [];
    if (n.next?.length) return n.next.slice();
    return n.row === maxRow && n.id !== bossId ? [bossId] : [];
  };

  function paint() {
    const path = run.path || [];
    const visited = new Set(path);
    const open = new Set(viewOnly && !ctx.showOpen ? [] : reachable());
    const curRow = run.node ? nodes[run.node]?.row ?? minRow - 1 : minRow - 1;
    for (const [id, el] of nodeEls) {
      const n = nodes[id];
      el.classList.toggle('map-node--visited', visited.has(id) && id !== run.node);
      el.classList.toggle('map-node--current', id === run.node);
      el.classList.toggle('map-node--open', open.has(id));
      el.classList.toggle('map-node--past', !visited.has(id) && n.row <= curRow && id !== bossId);
      el.disabled = viewOnly || !open.has(id);
      el.tabIndex = open.has(id) && !viewOnly ? 0 : -1;
    }
    // corridors: walked (solid ink), open (marching), the rest dashed
    const walked = new Set();
    if (path.length) walked.add('lobby>' + path[0]);
    for (let i = 0; i + 1 < path.length; i++) walked.add(path[i] + '>' + path[i + 1]);
    const from = run.node || 'lobby';
    const ink = svg.querySelector('.map-ink');
    ink.replaceChildren();
    live.replaceChildren();
    for (const p of svg.querySelectorAll('.cor')) {
      const key = p.dataset.a + '>' + p.dataset.b;
      const isWalked = walked.has(key);
      const isOpen = p.dataset.a === from && open.has(p.dataset.b);
      p.classList.toggle('cor--walked', isWalked);
      p.classList.toggle('cor--open', isOpen && !viewOnly);
      p.classList.toggle('cor--past', !isWalked && (p.dataset.a === 'lobby' ? curRow >= minRow : (nodes[p.dataset.a]?.row ?? 0) < curRow));
      if (isWalked) ink.append(svgEl('path', { class: 'cor-ink', d: p.getAttribute('d') }));
      if (isOpen && !viewOnly) live.append(svgEl('path', { class: 'cor-glow', d: p.getAttribute('d') }), svgEl('path', { class: 'cor-live', d: p.getAttribute('d') }));
    }
    const at = run.node ? L.pos.get(run.node) : { x: L.lobby.x + L.lobby.w / 2 - L.u * 2, y: L.lobby.y };
    placeMarker(at);
    const prog = head.querySelector('.map-head__prog');
    const done = path.length;
    prog.textContent = done ? `Room ${done} of ${maxRow - minRow + 2}` : 'Start in the lobby';
  }

  function placeMarker(p) {
    marker.style.transform = `translate(${p.x}px, ${p.y}px)`;
  }

  // ---- travel
  async function choose(id) {
    if (busy || viewOnly) return;
    const el = nodeEls.get(id);
    if (!el || !el.classList.contains('map-node--open')) return;
    busy = true;
    s.el.classList.add('map--travelling');
    ui(ctx, 'click');
    const b = L.pos.get(id);
    const a = run.node ? L.pos.get(run.node) : L.lobbyPt(b.x);
    const cor = svg.querySelector(`.cor[data-a="${run.node || 'lobby'}"][data-b="${id}"]`);
    const d = cor ? cor.getAttribute('d') : `M${a.x} ${a.y} L${b.x} ${b.y}`;
    // ink the corridor as the marker walks it
    const walk = svgEl('path', { class: 'cor-ink cor-ink--walk', d });
    live.replaceChildren(walk);
    const len = walk.getTotalLength ? walk.getTotalLength() : 100;
    walk.style.strokeDasharray = `${len}`;
    walk.style.strokeDashoffset = `${len}`;
    keepVisible(b.y);
    const dur = clamp(len * 2.4, 420, 820);
    walk.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: ms(dur), easing: 'cubic-bezier(.45,0,.4,1)', fill: 'forwards' });
    // the marker follows the path, leaving footprints
    const t0 = performance.now();
    let lastStep = 0, side = 1;
    await new Promise(resolve => {
      const step = now => {
        const t = clamp((now - t0) / ms(dur), 0, 1);
        const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const pt = walk.getPointAtLength ? walk.getPointAtLength(e * len) : { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
        placeMarker(pt);
        if (now - lastStep > ms(95) && t < .96) { lastStep = now; side = -side; footprint(pt, side); }
        if (t < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
    el.classList.add('map-node--arrive');
    ui(ctx, 'open');
    await wait(220);
    busy = false;
    s.el.classList.remove('map--travelling');
    act.travel?.(id);
  }

  function footprint(pt, side) {
    const f = h('i.map-step', { style: { transform: `translate(${pt.x + side * L.u * .5}px, ${pt.y}px)` } });
    sheet.append(f);
    anim(f, [{ opacity: .9 }, { opacity: 0 }], 900, 'in').then(() => f.remove());
  }

  function keepVisible(y) {
    const top = scroll.scrollTop, H = scroll.clientHeight;
    if (y < top + H * .2 || y > top + H * .85) smoothScroll(clamp(y - H * .45, 0, scroll.scrollHeight - H), 420);
  }

  let scrollAnim = 0;
  function smoothScroll(to, dur) {
    cancelAnimationFrame(scrollAnim);
    const from = scroll.scrollTop, t0 = performance.now();
    return new Promise(resolve => {
      const step = now => {
        const t = clamp((now - t0) / ms(dur), 0, 1);
        const e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        scroll.scrollTop = from + (to - from) * e;
        if (t < 1) scrollAnim = requestAnimationFrame(step); else resolve();
      };
      scrollAnim = requestAnimationFrame(step);
    });
  }
  const stopPan = () => cancelAnimationFrame(scrollAnim);
  s.cleanup(on(scroll, 'wheel', stopPan, { passive: true }));
  s.cleanup(on(scroll, 'pointerdown', stopPan));
  s.cleanup(() => cancelAnimationFrame(scrollAnim));

  // drag-to-scroll with the mouse (touch scrolls natively)
  let drag = null;
  s.cleanup(on(scroll, 'pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('.map-node')) return;
    drag = { y: e.clientY, top: scroll.scrollTop };
    scroll.classList.add('map-scroll--drag');
  }));
  s.cleanup(on(window, 'pointermove', e => { if (drag) scroll.scrollTop = drag.top - (e.clientY - drag.y); }));
  s.cleanup(on(window, 'pointerup', () => { drag = null; scroll.classList.remove('map-scroll--drag'); }));

  function scrollToCurrent(instant = true) {
    const p = run.node ? L.pos.get(run.node) : L.lobby;
    const target = clamp(p.y - scroll.clientHeight * .72, 0, Math.max(0, scroll.scrollHeight - scroll.clientHeight));
    if (instant) scroll.scrollTop = target;
    return target;
  }

  // ---- go
  draw();
  const fresh = !(run.path || []).length && ctx.intro !== false && !viewOnly;
  if (fresh) {
    scroll.scrollTop = 0;
    const target = scrollToCurrent(false);
    scroll.scrollTop = 0;
    wait(500).then(() => { if (!s.gone) smoothScroll(target, 1700); });
  } else {
    scrollToCurrent(true);
  }
  // nodes ink in row by row
  for (const [id, el] of nodeEls) {
    const r = id === bossId ? maxRow + 1 : nodes[id].row;
    el.style.setProperty('--d', `${(fresh ? (maxRow + 1 - r) : Math.abs(r - (nodes[run.node]?.row ?? minRow))) * 28}ms`);
  }
  s.el.classList.add('map--enter');
  wait(900).then(() => s.el.classList.remove('map--enter'));

  const ro = new ResizeObserver(() => {
    if (!L || Math.abs(scroll.clientWidth - L.W) < 2 && Math.abs(scroll.clientHeight - L.H) < 2) return;
    const frac = scroll.scrollTop / Math.max(1, scroll.scrollHeight);
    draw();
    scroll.scrollTop = frac * scroll.scrollHeight;
  });
  ro.observe(scroll);
  s.cleanup(() => ro.disconnect());

  return {
    unmount() { bar?.destroy(); s.unmount(); },
    update(next) {
      if (next) Object.assign(ctx, next);
      bar?.update();
      if (!busy) { paint(); }
    },
  };
}

// ---------------------------------------------------------------- drawing helpers

const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'dataset') for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
    else el.setAttribute(k, v);
  }
  return el;
}
function svgText(text, x, y, cls) { const t = svgEl('text', { x, y, class: cls, 'text-anchor': 'middle' }); t.textContent = text; return t; }

/** A slightly hand-drawn corridor from a to b, trimmed by ra / rb at the ends. */
function corridor(a, b, ra, rb, seed) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  const ax = a.x + ux * ra, ay = a.y + uy * ra, bx = b.x - ux * rb, by = b.y - uy * rb;
  const wob = ((seed % 1000) / 1000 - .5) * Math.min(14, L * .08);
  const mx = (ax + bx) / 2 - uy * wob, my = (ay + by) / 2 + ux * wob;
  return `M${ax.toFixed(1)} ${ay.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`;
}

function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function seeded(seed) { let s = seed || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

/** A loop of pencil around a visited room (rotated a little differently each time), with a small tick. */
function circleMark(seed) {
  const rot = (seed % 70) - 35;
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><g transform="rotate(${rot} 50 50)"><path d="M80 20 C62 3, 22 5, 11 33 C1 62, 25 94, 55 91 C85 88, 98 60, 89 33 C85 21, 74 13, 60 11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></g></svg>`;
}
function northArrow() {
  return '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="22" r="13" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M20 4 L25 24 L20 21 L15 24 Z" fill="currentColor"/><text x="20" y="39" text-anchor="middle" font-size="7" fill="currentColor" font-family="Oswald, sans-serif">N</text></svg>';
}
