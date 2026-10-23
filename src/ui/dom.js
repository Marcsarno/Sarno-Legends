// Tiny DOM helpers shared by every UI module. h() builds elements; no framework.
//   h('div.panel#id', { onclick, style: {...}, dataset: {...} }, child, 'text', [more])

export function h(sel, props, ...children) {
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { children.unshift(props); props = null; }
  const m = sel.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i) || [];
  const el = document.createElement(m[1] || 'div');
  for (const part of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Element from an HTML string (first element). */
export function html(str) { const t = document.createElement('template'); t.innerHTML = str.trim(); return t.content.firstElementChild; }

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const clear = el => { while (el.firstChild) el.firstChild.remove(); return el; };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Listen and get an unsubscribe function back. */
export function on(target, type, fn, opts) { target.addEventListener(type, fn, opts); return () => target.removeEventListener(type, fn, opts); }

/** Current CSS unit (--u) in px, for code that needs pixel sizes matching the CSS scale. */
export function unit() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 8; }

/** A simple event emitter (screens and HUD talk to the app through these). */
export function emitter() {
  const m = new Map();
  return {
    on(type, fn) { (m.get(type) || m.set(type, new Set()).get(type)).add(fn); return () => m.get(type)?.delete(fn); },
    emit(type, ...a) { m.get(type)?.forEach(fn => fn(...a)); m.get('*')?.forEach(fn => fn(type, ...a)); },
  };
}
