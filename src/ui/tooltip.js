// Tooltips for keywords, statuses, intents, relics, potions and cards. One floating layer for the whole app.
//   showTip(anchor, content, { side, key })   anchor: Element | DOMRect | { x, y }; content: Tip | Tip[]
//                                              Tip = { title, body (html), icon?, color?, sub? }
//   hideTip(key?)                              hides (only if `key` matches the shown tip, when given)
//   bindTips(root)                             hover (mouse) or long-press (touch) on any element with data-tip
//                                              (or data-kw, which card text puts on its keywords):
//       data-tip="kw:Staggered" | "status:vulnerable:2" | "relic:pager:3" | "potion:medkit" | "card:<cardId>[:up]"
//       | "text:Title|Body html" | "<source>:<arg>" for a source added with tipSource(name, fn(arg, el) -> content)
//   tipSource('intent', uid => tipIntent(...))  the HUD registers live sources (intents need the combat)
//   tipKeyword / tipStatus / tipRelic / tipPotion / tipIntent / tipCardKeywords   content builders
// A long-press that showed a tip swallows the click that follows, so holding a potion never also uses it. On touch, a
// plain tap on something that does nothing else (a relic, a status, an intent, the HP) shows its tip for a few seconds.

import { KEYWORDS, describeStatus, statusName, describeIntent, intentLabel, describeRelic, describePotion, cardKeywords, RARITY_LABELS } from '../game/text.js';
import { STATUSES, isPositive } from '../game/content/statuses.js';
import { RELICS } from '../game/content/relics.js';
import { POTIONS } from '../game/content/potions.js';
import { h, clamp } from './dom.js';
import { icon, relicGlyph, potionGlyph, intentGlyph } from './icons.js';
import './styles/tooltip.css';

let layer = null, shownKey = null, shownFor = null, suppressed = false;
const sources = new Map();

/** Hover / long-press tips off while a card or potion is being dragged or aimed (direct showTip still works). */
export function suppressTips(on) { suppressed = !!on; if (on) hideTip(); }

function ensureLayer() {
  if (layer && layer.isConnected) return layer;
  layer = h('div.tips', { 'aria-live': 'polite' });
  document.body.append(layer);
  return layer;
}

// ---------------------------------------------------------------- content builders

const STATUS_KW = new Set(Object.values(STATUSES).map(s => s.name));

export function tipKeyword(name) {
  const st = Object.values(STATUSES).find(s => s.name === name);
  if (st) return { title: name, body: KEYWORDS[name] || '', icon: st.icon, color: st.color };
  return { title: name, body: KEYWORDS[name] || '', icon: name === 'Block' ? 'block' : name === 'Energy' ? 'energy' : name === 'Exhaust' ? 'exhaust' : null };
}

export function tipStatus(id, n = 1) {
  const s = STATUSES[id];
  if (!s) return { title: id, body: '' };
  const good = isPositive(id, n);
  const amount = s.flag ? '' : ` ${n}`;
  return { title: `${statusName(id)}${amount}`, body: describeStatus(id, n), icon: s.icon, color: s.color, sub: s.kind === 'power' ? 'Power' : good ? 'Buff' : 'Debuff', tone: good ? 'good' : 'bad' };
}

export function tipRelic(id, counter) {
  const r = RELICS[id];
  if (!r) return { title: id, body: '' };
  let body = describeRelic(id);
  if (r.counterMax && counter >= 0) body += `<div class="tip__extra">Count: ${counter} / ${r.counterMax}</div>`;
  if (counter === -1) body += '<div class="tip__extra">Used up.</div>';
  return { title: r.name, body, icon: relicGlyph(id), color: r.rarity === 'weapon' ? (r.hero === 'yola' ? '#2fa39a' : '#c8483a') : RARITY_COLOR[r.rarity], sub: r.rarity === 'weapon' ? 'Weapon' : RARITY_LABELS[r.rarity] };
}

export function tipPotion(id) {
  const p = POTIONS[id];
  if (!p) return { title: 'Empty slot', body: 'Potions you find go here.', icon: 'potion' };
  return { title: p.name, body: describePotion(id), icon: potionGlyph(id), color: RARITY_COLOR[p.rarity], sub: RARITY_LABELS[p.rarity] };
}

/** intent: combat.intentOf(uid) (live numbers) or the enemy's stored intent; enemy: { id, name } */
export function tipIntent(intent, enemy) {
  if (!intent) return null;
  const color = INTENT_COLOR[intent.type] || '#9fb0ae';
  return { title: intentLabel(intent.type), body: describeIntent(intent, enemy), icon: intentGlyph(intent.type), color, sub: enemy?.name || '' };
}

/** The keyword boxes shown beside a zoomed card. */
export function tipCardKeywords(inst) {
  return cardKeywords(inst).filter(k => KEYWORDS[k] || STATUS_KW.has(k)).map(tipKeyword);
}

export const RARITY_COLOR = { starter: '#a8adb3', common: '#a8adb3', uncommon: '#79b4e0', rare: '#e3b04b', shop: '#7cc96b', special: '#c77ad8', weapon: '#cf8f50' };
export const INTENT_COLOR = {
  attack: '#ff6a55', attack_block: '#ff8a5c', attack_debuff: '#ff7aa0', attack_buff: '#ff9b4a',
  block: '#6aa9d8', buff: '#8fd16a', block_buff: '#7ec7c0', debuff: '#c77ad8', heal: '#7ee08a',
  sleep: '#8fa0c8', stun: '#e8d27a', unknown: '#b9c2c4',
};

/** Register a live tip source: data-tip="<name>:<arg>" calls fn(arg, el). */
export function tipSource(name, fn) { sources.set(name, fn); return () => sources.delete(name); }

function resolve(el) {
  if (!el.dataset.tip && el.dataset.kw) return tipKeyword(el.dataset.kw);
  const spec = el.dataset.tip || '';
  const i = spec.indexOf(':');
  const kind = i < 0 ? spec : spec.slice(0, i), arg = i < 0 ? '' : spec.slice(i + 1);
  if (sources.has(kind)) return sources.get(kind)(arg, el);
  switch (kind) {
    case 'kw': return tipKeyword(arg);
    case 'status': { const [id, n] = arg.split(':'); return tipStatus(id, Number(n ?? 1)); }
    case 'relic': { const [id, c] = arg.split(':'); return tipRelic(id, c === undefined ? undefined : Number(c)); }
    case 'potion': return tipPotion(arg);
    case 'card': { const [id, up] = arg.split(':'); return tipCardKeywords({ id, up: up === 'up' }); }
    case 'text': { const [title, body] = arg.split('|'); return { title, body: body || '' }; }
    default: return null;
  }
}

// ---------------------------------------------------------------- showing

function tipBox(t) {
  return h('div.tip', { style: t.color ? { '--tip-c': t.color } : null, class: t.tone ? 'tip--' + t.tone : null },
    h('div.tip__head',
      t.icon ? h('span.tip__icon', { html: icon(t.icon) }) : null,
      h('span.tip__title', t.title || ''),
      t.sub ? h('span.tip__sub', t.sub) : null),
    t.body ? h('div.tip__body', { html: t.body }) : null);
}

function rectOf(anchor) {
  if (!anchor) return null;
  if (anchor instanceof Element) return anchor.getBoundingClientRect();
  if (typeof anchor.left === 'number' && typeof anchor.width === 'number') return anchor;
  return { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0, height: 0 };
}

export function showTip(anchor, content, { side = 'auto', key = null, gap = 8 } = {}) {
  const list = (Array.isArray(content) ? content : [content]).filter(Boolean);
  const L = ensureLayer();
  L.replaceChildren();
  shownKey = key; shownFor = anchor instanceof Element ? anchor : null;
  if (!list.length) { L.classList.remove('tips--on'); return; }
  const col = h('div.tips__col', list.map(tipBox));
  L.append(col);
  L.classList.add('tips--on');
  const r = rectOf(anchor);
  const vw = innerWidth, vh = innerHeight, m = 6;
  const w = col.offsetWidth, hh = col.offsetHeight;
  const room = { right: vw - r.right, left: r.left, top: r.top, bottom: vh - r.bottom };
  let s = side;
  if (s === 'auto') s = room.bottom >= hh + gap ? 'bottom' : room.top >= hh + gap ? 'top' : room.right >= room.left ? 'right' : 'left';
  if (s === 'right' && room.right < w + gap && room.left > room.right) s = 'left';
  if (s === 'left' && room.left < w + gap && room.right > room.left) s = 'right';
  if (s === 'top' && room.top < hh + gap && room.bottom > room.top) s = 'bottom';
  if (s === 'bottom' && room.bottom < hh + gap && room.top > room.bottom) s = 'top';
  let x, y;
  if (s === 'right') { x = r.right + gap; y = r.top + r.height / 2 - hh / 2; }
  else if (s === 'left') { x = r.left - gap - w; y = r.top + r.height / 2 - hh / 2; }
  else if (s === 'top') { x = r.left + r.width / 2 - w / 2; y = r.top - gap - hh; }
  else { x = r.left + r.width / 2 - w / 2; y = r.bottom + gap; }
  x = clamp(x, m, vw - w - m); y = clamp(y, m, vh - hh - m);
  col.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  col.dataset.side = s;
}

export function hideTip(key) {
  if (!layer) return;
  if (key !== undefined && key !== null && key !== shownKey) return;
  layer.classList.remove('tips--on');
  layer.replaceChildren();
  shownKey = null; shownFor = null;
}

export const tipShownFor = () => shownFor;

// ---------------------------------------------------------------- delegated hover / long-press

const HOVER_DELAY = 140, PRESS_DELAY = 380, TAP_HOLD = 3200;
// things a tap already does something with: they only show their tip on a long-press
const INTERACTIVE = 'button, a, input, select, label, textarea, .hand-card, [role="button"]';

/** Hover (mouse) and long-press (touch / pen) tooltips for every [data-tip] inside root. Returns an unbind function. */
export function bindTips(root = document.body) {
  let hoverT = 0, pressT = 0, pressEl = null, pressXY = null, pressShown = false, tapEl = null, tapT = 0;
  const target = e => e.target instanceof Element ? e.target.closest('[data-tip],[data-kw]') : null;

  const over = e => {
    if (e.pointerType !== 'mouse' || suppressed) return;
    const el = target(e);
    if (!el || !root.contains(el)) return;
    clearTimeout(hoverT);
    hoverT = setTimeout(() => {
      if (suppressed || !el.isConnected || !el.matches(':hover')) return;
      const c = resolve(el);
      if (c) showTip(el, c, { key: el, side: el.dataset.tipSide || 'auto' });
    }, shownKey ? 0 : HOVER_DELAY);
  };
  const out = e => {
    if (e.pointerType !== 'mouse') return;
    const el = target(e);
    if (!el) return;
    const to = e.relatedTarget instanceof Element ? e.relatedTarget.closest('[data-tip],[data-kw]') : null;
    if (to === el) return;
    clearTimeout(hoverT);
    hideTip(el);
  };
  const down = e => {
    if (e.pointerType === 'mouse') { clearTimeout(hoverT); hideTip(); return; }
    if (tapEl) { clearTimeout(tapT); hideTip(tapEl); tapEl = null; }
    const el = target(e);
    if (!el || !root.contains(el)) return;
    pressEl = el; pressXY = [e.clientX, e.clientY]; pressShown = false;
    clearTimeout(pressT);
    pressT = setTimeout(() => {
      if (!pressEl || suppressed) return;
      const c = resolve(pressEl);
      if (c) { showTip(pressEl, c, { key: pressEl, side: pressEl.dataset.tipSide || 'auto' }); pressShown = true; }
    }, PRESS_DELAY);
  };
  const move = e => {
    if (!pressEl || !pressXY) return;
    if (Math.hypot(e.clientX - pressXY[0], e.clientY - pressXY[1]) > 12) { clearTimeout(pressT); pressEl = null; if (pressShown) hideTip(); }
  };
  const up = e => {
    clearTimeout(pressT);
    if (pressShown) {
      // swallow the click that ends a long-press
      const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 350);
      const el = pressEl;
      setTimeout(() => hideTip(el), 1600);
    } else if (pressEl && e?.type === 'pointerup' && e.pointerType !== 'mouse' && !suppressed && pressXY
      && Math.hypot(e.clientX - pressXY[0], e.clientY - pressXY[1]) < 12 && !pressEl.closest(INTERACTIVE)) {
      // a quick tap on something with nothing else to do: show its tip for a moment
      const el = pressEl, c = resolve(el);
      if (c) {
        showTip(el, c, { key: el, side: el.dataset.tipSide || 'auto' });
        tapEl = el;
        clearTimeout(tapT);
        tapT = setTimeout(() => { hideTip(el); if (tapEl === el) tapEl = null; }, TAP_HOLD);
      }
    }
    pressEl = null; pressShown = false;
  };
  root.addEventListener('pointerover', over);
  root.addEventListener('pointerout', out);
  root.addEventListener('pointerdown', down, true);
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  const scroll = () => hideTip();
  window.addEventListener('wheel', scroll, { passive: true });
  return () => {
    clearTimeout(hoverT); clearTimeout(pressT); clearTimeout(tapT);
    root.removeEventListener('pointerover', over);
    root.removeEventListener('pointerout', out);
    root.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    window.removeEventListener('wheel', scroll);
  };
}
