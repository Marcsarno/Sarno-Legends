// Shared bits for the screens outside the fight: the screen shell (mount/unmount with a fade), painted backdrops with a
// stand-in gradient underneath, the shared top bar, item icons (glyph first, studio render when it arrives), price tags,
// stamps, count-ups and the fly-to motion (coins to the supplies counter, a card to the deck button).
// Screens hold no game logic: they read ctx and call ctx.act.*; these helpers only draw and move things.

import { h, on } from '../dom.js';
import { anim, wait, tweenValue, ms } from '../tween.js';
import { icon, relicGlyph, potionGlyph } from '../icons.js';
import { bindTips, hideTip } from '../tooltip.js';
import { createTopBar } from '../topbar.js';
import { RELICS } from '../../game/content/relics.js';
import { POTIONS } from '../../game/content/potions.js';
import '../styles/screens.css';

/** A style string from an object, so CSS custom properties work too: h('div', { style: st({ '--rc': red, opacity: 1 }) }). */
export function st(obj) {
  return Object.entries(obj).filter(([, v]) => v != null).map(([k, v]) => `${k.startsWith('--') ? k : k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${v}`).join(';');
}

/**
 * The root element every screen draws into.
 *   const s = shell(root, 'map', { modal: false });  s.el, s.cleanup(fn), s.unmount()
 * unmount fades the screen out and removes it (the next screen can mount at once: they overlap for the fade).
 */
export function shell(root, name, { modal = false, enter = 'fade' } = {}) {
  const el = h(`div.scr.scr--${name}`, { dataset: { screen: name } });
  if (modal) el.classList.add('scr--modal');
  root.append(el);
  const fns = [];
  fns.push(bindTips(el));
  if (enter === 'fade') anim(el, [{ opacity: 0 }, { opacity: 1 }], 220, 'out');
  else if (enter === 'rise') anim(el, [{ opacity: 0, transform: 'translateY(2%)' }, { opacity: 1, transform: 'none' }], 260, 'out');
  let gone = false;
  return {
    el,
    cleanup(fn) { fns.push(fn); return fn; },
    unmount() {
      if (gone) return; gone = true;
      hideTip();
      for (const fn of fns.splice(0)) { try { fn(); } catch (e) { console.warn('[screens] cleanup', e); } }
      el.style.pointerEvents = 'none';
      el.classList.add('scr--leaving');
      anim(el, [{ opacity: 1 }, { opacity: 0 }], 180, 'in').then(() => el.remove());
    },
    get gone() { return gone; },
  };
}

/**
 * Painted backdrop: a stand-in gradient for the room right away, the painted room (ctx.rooms(key) -> url | Promise<url>)
 * fading in on top when it's ready, then a vignette and film grain. dim 0..1 darkens it under panels.
 */
export function backdrop(ctx, key, { dim = 0, drift = true } = {}) {
  const img = h('div.scr-bg__img');
  const el = h('div.scr-bg', { dataset: { room: key }, style: st({ '--dim': dim }) },
    h('div.scr-bg__fallback'), img, h('div.scr-bg__light'), h('div.scr-bg__vignette'), h('div.scr-bg__grain'));
  if (drift) el.classList.add('scr-bg--drift');
  let url = null;
  try { url = ctx?.rooms ? ctx.rooms(key) : null; } catch (e) { console.warn('[screens] rooms()', e); }
  Promise.resolve(url).then(u => {
    if (!u) return;
    const pre = new Image();
    pre.onload = () => { img.style.backgroundImage = `url("${u}")`; el.classList.add('scr-bg--painted'); };
    pre.src = u;
  }).catch(() => {});
  return el;
}

/**
 * The shared top bar (src/ui/topbar.js, the UI kit's). Screens that sit inside a run show it unless ctx.topbar === false
 * (an app that keeps one bar mounted across screens passes false). Returns { el, update(), destroy() } or null.
 */
export function topbar(ctx, host) {
  if (ctx.topbar === false || !ctx.run) { host.classList.add('scr--nobar'); return null; }
  const slot = h('div.scr-topbar');
  host.append(slot);
  const act = ctx.act || {};
  const bar = createTopBar({
    root: slot, getRun: () => ctx.run, studio: ctx.studio || null,
    onDeck: () => act.openDeck?.(),
    onMap: act.openMap ? () => act.openMap() : null,
    onSettings: () => (act.settings ? act.settings() : act.openSettings?.()),
    onPotion: act.potion ? (i, action, el) => act.potion(i, action, el) : null,
    canUsePotion: act.canUsePotion ? (i, id) => act.canUsePotion(i, id) : null,   // outside a fight: the Medkit
  });
  // measure the bar (and the relic tray hanging under it) so screens can lay out below them
  let ro = null;
  const measure = () => {
    const wrap = slot.firstElementChild;
    const tb = wrap?.querySelector('.tb') || wrap;
    if (!tb) return;
    host.style.setProperty('--scr-topbar-h', Math.round(tb.getBoundingClientRect().height) + 'px');
    host.style.setProperty('--scr-tray-h', Math.round(wrap.getBoundingClientRect().height) + 'px');
  };
  requestAnimationFrame(measure);
  if (window.ResizeObserver && slot.firstElementChild) { ro = new ResizeObserver(measure); ro.observe(slot.firstElementChild); }
  return {
    el: slot,
    get bar() { return bar; },
    update() { bar?.update?.(); },
    destroy() { ro?.disconnect(); bar?.destroy?.(); slot.remove(); },
  };
}

/** The element in the top bar that a flying thing should land on: 'gold' | 'deck' | 'potion' | 'relic' | 'hp'. */
export function barTarget(kind) {
  const sel = {
    gold: '.tb__gold, [data-bar="gold"], .topbar__gold',
    deck: '.tb__btn--deck, [data-bar="deck"], .topbar__deck',
    potion: '.tb__potions, [data-bar="potions"], .topbar__potions',
    relic: '.tb__relics, [data-bar="relics"], .topbar__relics',
    hp: '.tb__hp, [data-bar="hp"], .topbar__hp',
  }[kind];
  return (sel && document.querySelector(sel)) || null;
}

// ---------------------------------------------------------------- items

const RARITY_C = { starter: '#a8adb3', common: '#a8adb3', uncommon: '#79b4e0', rare: '#e3b04b', shop: '#7cc96b', weapon: '#cf8f50', special: '#c77ad8' };
export const rarityColor = r => RARITY_C[r] || '#a8adb3';

/**
 * A relic / potion / weapon icon in a little medallion. Starts as the inline glyph; when ctx.studio can render the
 * item, the 3D still replaces it. kind: 'relic' | 'potion' | 'weapon'.
 */
export function itemIcon(kind, id, ctx, { size = 'md', tip = true, counter } = {}) {
  const glyph = kind === 'potion' ? potionGlyph(id) : kind === 'weapon' ? 'weapon_' + id : relicGlyph(id);
  const data = kind === 'potion' ? POTIONS[id] : RELICS[id];
  const rarity = data?.rarity || (kind === 'weapon' ? 'weapon' : 'common');
  const el = h(`span.scr-item.scr-item--${kind}.scr-item--${size}`, {
    style: st({ '--rc': kind === 'weapon' ? (data?.hero === 'yola' ? 'var(--yola)' : 'var(--marc)') : rarityColor(rarity) }),
    dataset: tip ? { tip: kind === 'potion' ? `potion:${id}` : `relic:${id}${counter !== undefined ? ':' + counter : ''}` } : {},
  }, h('span.scr-item__glyph', { html: icon(glyph) }));
  const studio = ctx?.studio;
  const fn = studio && (kind === 'potion' ? studio.potionIcon : kind === 'weapon' ? studio.weaponIcon : studio.relicIcon);
  if (fn && ctx.studioIcons !== false) {
    Promise.resolve().then(() => fn.call(studio, id)).then(url => {
      if (!url) return;
      const img = h('img.scr-item__img', { alt: '', draggable: false, src: url });
      img.onload = () => el.classList.add('scr-item--img');
      el.append(img);
    }).catch(() => {});
  }
  return el;
}

export const relicName = id => RELICS[id]?.name || id;
export const potionName = id => POTIONS[id]?.name || id;

/** Price tag for shop items: red when you can't afford it, a struck-through old price on sale. */
export function priceTag(price, gold, { was } = {}) {
  const el = h('span.scr-price', h('span.scr-price__ico', { html: icon('supplies') }), h('span.scr-price__n', String(price)));
  if (was && was > price) el.prepend(h('s.scr-price__was', String(was)));
  el.classList.toggle('scr-price--short', gold < price);
  return el;
}

/** A rubber stamp ("SOLD", "TAKEN", "FINISHER") pressed onto an element. */
export function stamp(host, text, { tone = 'red', rot = -12 } = {}) {
  const s = h(`div.scr-stamp.scr-stamp--${tone}`, { style: st({ '--rot': rot + 'deg' }) }, text);
  host.append(s);
  anim(s, [
    { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(2.2)`, opacity: 0 },
    { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(.92)`, opacity: 1, offset: .7 },
    { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1)`, opacity: 1 },
  ], 260, 'out');
  return s;
}

/** Count a number up in an element (scrap, supplies). */
export function countUp(el, from, to, duration = 900, fmt = v => String(Math.round(v))) {
  el.textContent = fmt(from);
  return tweenValue(from, to, duration, v => { el.textContent = fmt(v); });
}

function centerOf(target) {
  if (!target) return null;
  if (target instanceof Element) {
    const r = target.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return target;
}

/**
 * Fly copies of some html from one element to another along an arc (coins to the supplies counter).
 *   flyTo(fromEl, toEl | {x,y} | null, { html, count, spread, size, duration, stagger, cls })
 * With no target it flies up and fades. Resolves when the last one lands; calls onLand() for each arrival.
 */
export async function flyTo(from, to, { html = icon('supplies'), count = 1, spread = 22, size = 28, duration = 620, stagger = 55, cls = '', onLand } = {}) {
  const a = centerOf(from);
  if (!a) return;
  let b = centerOf(to);
  const fallback = !b;
  if (!b) b = { x: a.x, y: a.y - 120 };
  const layer = flyLayer();
  const runs = [];
  for (let i = 0; i < count; i++) {
    const sx = a.x + (Math.random() - .5) * spread * 2, sy = a.y + (Math.random() - .5) * spread;
    const el = h(`div.scr-fly${cls ? '.' + cls : ''}`, { html, style: { width: size + 'px', height: size + 'px', opacity: '0', transform: `translate(${sx - size / 2}px, ${sy - size / 2}px)` } });
    layer.append(el);
    const mx = (sx + b.x) / 2 + (Math.random() - .5) * 80, my = Math.min(sy, b.y) - 60 - Math.random() * 60;
    const kf = [
      { transform: `translate(${sx - size / 2}px, ${sy - size / 2}px) scale(.4)`, opacity: 0 },
      { transform: `translate(${sx - size / 2}px, ${sy - size / 2 - 14}px) scale(1.15)`, opacity: 1, offset: .14 },
      { transform: `translate(${mx - size / 2}px, ${my - size / 2}px) scale(1)`, opacity: 1, offset: .55 },
      { transform: `translate(${b.x - size / 2}px, ${b.y - size / 2}px) scale(${fallback ? 1.2 : .55})`, opacity: fallback ? 0 : .9 },
    ];
    runs.push(wait(i * stagger).then(() => anim(el, kf, duration, 'inOut')).then(() => { el.remove(); onLand?.(i); }));
  }
  await Promise.all(runs);
  if (!fallback && to instanceof Element) anim(to, [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], 260, 'out');
}

let flyEl = null;
function flyLayer() {
  if (flyEl && flyEl.isConnected) return flyEl;
  flyEl = h('div.scr-flylayer');
  document.body.append(flyEl);
  return flyEl;
}

/** Fly a clone of an element (a card, an icon) to a target, shrinking as it goes. */
export async function flyClone(el, to, { duration = 560, scale = .18 } = {}) {
  const r = el.getBoundingClientRect();
  const b = centerOf(to) || { x: r.left + r.width / 2, y: -80 };
  const c = el.cloneNode(true);
  c.classList.add('scr-flyclone');
  Object.assign(c.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', margin: 0 });
  flyLayer().append(c);
  const dx = b.x - (r.left + r.width / 2), dy = b.y - (r.top + r.height / 2);
  await anim(c, [
    { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
    { transform: `translate(${dx * .25}px, ${dy * .1 - 30}px) scale(1.06) rotate(-4deg)`, opacity: 1, offset: .25 },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(8deg)`, opacity: .2 },
  ], duration, 'inOut');
  c.remove();
  if (to instanceof Element) anim(to, [{ transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }], 260, 'out');
}

/**
 * An entrance animation that leaves no inline styles behind (tween.anim commits its end state, which would block
 * CSS :hover transforms). delay in ms at 1x.
 */
export function enter(el, keyframes, duration = 300, easing = 'out', delay = 0) {
  if (!el?.animate) return Promise.resolve();
  const first = keyframes[0];
  for (const k of Object.keys(first)) if (k !== 'offset') el.style[k] = first[k];
  const go = () => {
    for (const k of Object.keys(first)) if (k !== 'offset') el.style[k] = '';
    const a = el.animate(keyframes, { duration: ms(duration), easing: EASE[easing] || easing, fill: 'backwards' });
    return a.finished.catch(() => {});
  };
  return delay ? wait(delay).then(go) : go();
}
const EASE = {
  out: 'cubic-bezier(.2,.9,.25,1)', back: 'cubic-bezier(.34,1.56,.64,1)', in: 'cubic-bezier(.55,0,.9,.35)', inOut: 'cubic-bezier(.65,0,.35,1)', linear: 'linear',
};

/** Little floating "+24 HP" text from an element. */
export function floatText(host, text, { tone = 'good', dy = -60 } = {}) {
  const t = h(`div.scr-float.scr-float--${tone}`, text);
  host.append(t);
  anim(t, [
    { transform: 'translate(-50%, 0) scale(.6)', opacity: 0 },
    { transform: 'translate(-50%, -10px) scale(1.1)', opacity: 1, offset: .2 },
    { transform: `translate(-50%, ${dy}px) scale(1)`, opacity: 0 },
  ], 1400, 'out').then(() => t.remove());
}

/** One-shot click guard: ignores clicks while `busy` (screens lock input during their little animations). */
export function guard() {
  let busy = false;
  return {
    get busy() { return busy; },
    async run(fn) { if (busy) return; busy = true; try { await fn(); } finally { busy = false; } },
    lock() { busy = true; }, unlock() { busy = false; },
  };
}

/** Play a UI sound if the app gave us audio. name: 'click' | 'hover' | 'card' | 'deny' | 'coin' | 'open'. */
export function ui(ctx, name) { try { ctx?.audio?.ui?.(name); } catch { /* audio is optional */ } }

/** Hover sounds for every button inside an element (cheap: one listener). */
export function hoverSounds(ctx, el) {
  if (!ctx?.audio?.ui) return () => {};
  let last = null;
  return on(el, 'pointerover', e => {
    const b = e.target instanceof Element ? e.target.closest('button, .scr-hover') : null;
    if (b && b !== last && !b.disabled) { last = b; ui(ctx, 'hover'); }
    if (!b) last = null;
  });
}

/** A closing "x" button for overlays. */
export function closeBtn(onClick, label = 'Close') {
  return h('button.scr-x', { onclick: onClick, title: label, 'aria-label': label, html: icon('close') });
}

/** Keyboard: Escape calls fn while the screen is mounted. */
export function onEscape(fn) {
  return on(window, 'keydown', e => { if (e.key === 'Escape') { e.preventDefault(); fn(); } });
}

/** Normalise a card reference from the run layer: CardInst, { card }, { inst }, or an id string. */
export function asInst(c) {
  if (!c) return null;
  if (typeof c === 'string') return { id: c, up: false };
  if (c.card) return typeof c.card === 'string' ? { id: c.card, up: !!c.up } : c.card;
  if (c.inst) return c.inst;
  return c;
}

export { h, on, anim, wait, ms, icon };
