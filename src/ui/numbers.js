// Floating combat text: damage pops, BLOCKED, heals, status words, the finisher's big number.
//   const nums = createNumbers(layerEl);  nums.pop({ x, y, text, kind, big, key })
// kind: 'damage' | 'blocked' | 'block' | 'heal' | 'buff' | 'debuff' | 'status' | 'finisher' | 'energy' | 'gold'
// Each pop is a DOM element in screen px, animated with the Web Animations API (arc up and out, then fade).
// Pops at the same spot within a quarter second stack upward so multi-hits stay readable. Styles: hud.css (.fnum).

import { h } from './dom.js';
import { ms } from './tween.js';
import { icon } from './icons.js';

const RISE = { damage: 1, blocked: .7, block: .8, heal: .9, buff: .75, debuff: .75, status: .7, finisher: .5, energy: .8, gold: .8 };

export function createNumbers(layer) {
  const recent = new Map();   // key -> { t, n }

  function pop({ x, y, text, kind = 'damage', big = false, key = null }) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;   // (no anchor on screen: nothing to pop)
    const now = performance.now();
    const k = key ?? `${Math.round(x / 40)}:${Math.round(y / 40)}`;
    const r = recent.get(k);
    const stack = r && now - r.t < 260 ? r.n + 1 : 0;
    recent.set(k, { t: now, n: stack });
    if (recent.size > 40) for (const [kk, v] of recent) if (now - v.t > 1000) recent.delete(kk);

    const amount = Number(String(text).replace(/[^\d]/g, '')) || 0;
    const el = h(`div.fnum.fnum--${kind}`);
    if (big) el.classList.add('fnum--big');
    if (kind === 'damage' && amount >= 25) el.classList.add('fnum--huge');
    if (kind === 'blocked') el.innerHTML = icon('block') + `<span>${esc(text)}</span>`;
    else if (kind === 'block') el.innerHTML = icon('block') + `<span>${esc(text)}</span>`;
    else el.innerHTML = `<span>${esc(text)}</span>`;
    layer.append(el);

    const em = el.offsetHeight || 40;
    const sy = -stack * em * .62;
    const dir = (Math.random() < .5 ? -1 : 1) * (0.4 + Math.random() * 0.6);
    const rise = (RISE[kind] || .8) * em;
    const at = (dx, dy, s, o) => ({ transform: `translate(${x + dx}px, ${y + sy + dy}px) translate(-50%, -50%) scale(${s})`, opacity: o });
    let frames, dur;
    if (kind === 'damage') {
      const dx = dir * em * 1.1;
      frames = [at(0, 0, 2.1, 0), { ...at(0, -em * .15, .92, 1), offset: .07 }, { ...at(dx * .2, -rise * .9, 1.05, 1), offset: .22 },
        { ...at(dx * .7, -rise * 1.15, 1, 1), offset: .55 }, at(dx, -rise * .55, .85, 0)];
      dur = 1050;
    } else if (kind === 'finisher') {
      frames = [at(0, 0, 3.2, 0), { ...at(0, 0, .95, 1), offset: .08 }, { ...at(0, -rise * .3, 1.05, 1), offset: .6 }, at(0, -rise, 1.1, 0)];
      dur = 1500;
    } else {
      frames = [at(0, em * .2, .6, 0), { ...at(0, 0, 1.08, 1), offset: .14 }, { ...at(0, -rise * .6, 1, 1), offset: .6 }, at(0, -rise * 1.3, .95, 0)];
      dur = kind === 'blocked' ? 900 : 1150;
    }
    const a = el.animate(frames, { duration: ms(dur), easing: 'cubic-bezier(.25,.6,.35,1)', fill: 'forwards' });
    a.finished.then(() => el.remove(), () => el.remove());
    return el;
  }

  return { pop, clear: () => layer.replaceChildren() };
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
