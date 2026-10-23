// Coach callouts (the first-run tips, src/app/coach.js): one short bubble at a time that points at a real piece of UI,
// with a soft pulsing ring on the thing it talks about. It follows its target every frame (cards spring, intents ride
// the 3D stage) and steps aside while the target is gone. Never modal: only the bubble itself takes taps.
//   const c = createCallout({ onGotIt(id), onSkip(id) })
//   c.show({ id, title, sub?, target: () => Element | DOMRect | null, side?: 'top'|'bottom'|'left'|'right'|'auto',
//            ring?: true, pad?: 6 })                         replaces whatever is shown
//   c.hide()     c.quiet(bool)  (faded and click-through, e.g. while a card is dragged)     c.shown -> id | null
//   c.destroy()
// A tap anywhere on the bubble is "Got it"; "Skip tips" turns the coach off (Settings > Tips turns it back on).

import { h, clamp } from './dom.js';
import { icon } from './icons.js';
import './styles/coach.css';

export function createCallout({ onGotIt, onSkip } = {}) {
  const ring = h('div.coach__ring');
  const arrow = h('i.coach__arrow');
  const title = h('div.coach__title');
  const sub = h('div.coach__sub');
  const skip = h('button.coach__skip', { type: 'button' }, 'Skip tips');
  const ok = h('button.coach__ok', { type: 'button' }, h('span', { html: icon('check') }), 'Got it');
  const bubble = h('div.coach__bubble', { role: 'status', 'aria-live': 'polite' },
    arrow, h('div.coach__text', title, sub), h('div.coach__btns', skip, ok));
  const safe = h('i.coach__safe');   // a box inset by the safe areas (notches, home bar): the bubble stays inside it
  const layer = h('div.coach', safe, ring, bubble);
  document.body.append(layer);

  let cur = null, raf = 0, quietOn = false, lastKey = '';
  const stop = e => { e.stopPropagation(); };
  for (const ev of ['pointerdown', 'pointerup']) bubble.addEventListener(ev, stop);
  skip.addEventListener('click', e => { e.stopPropagation(); const id = cur?.id; hide(); onSkip?.(id); });
  bubble.addEventListener('click', e => { e.stopPropagation(); const id = cur?.id; if (!id) return; hide(); onGotIt?.(id); });

  function show(tip) {
    cur = { side: 'auto', ring: true, pad: 6, ...tip };
    title.textContent = cur.title || '';
    sub.textContent = cur.sub || '';
    sub.hidden = !cur.sub;
    layer.dataset.tip = cur.id;
    layer.classList.remove('coach--on'); void layer.offsetWidth;
    lastKey = '';
    place();
    layer.classList.add('coach--on');
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function hide() {
    cur = null;
    cancelAnimationFrame(raf);
    layer.classList.remove('coach--on', 'coach--lost');
    delete layer.dataset.tip;
  }

  function quiet(on) { quietOn = !!on; layer.classList.toggle('coach--quiet', quietOn); }

  function loop() {
    if (!cur) return;
    place();
    raf = requestAnimationFrame(loop);
  }

  function rectOf(t) {
    if (!t) return null;
    if (t instanceof Element) {
      if (!t.isConnected) return null;
      const r = t.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      const cs = getComputedStyle(t);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return null;
      return r;
    }
    if (typeof t.left === 'number') return t;
    return null;
  }

  function place() {
    let t = null;
    try { t = cur.target?.(); } catch { t = null; }
    const r0 = rectOf(t);
    const vw = innerWidth, vh = innerHeight;
    const lost = !r0 || r0.bottom < 0 || r0.top > vh || r0.right < 0 || r0.left > vw;
    layer.classList.toggle('coach--lost', lost);
    if (lost) return;
    const pad = cur.pad;
    const r = { left: r0.left - pad, top: r0.top - pad, right: r0.right + pad, bottom: r0.bottom + pad };
    r.width = r.right - r.left; r.height = r.bottom - r.top;
    ring.style.display = cur.ring ? '' : 'none';
    ring.style.transform = `translate(${Math.round(r.left)}px, ${Math.round(r.top)}px)`;
    ring.style.width = Math.round(r.width) + 'px';
    ring.style.height = Math.round(r.height) + 'px';

    // the bubble: on the preferred side if it fits, else the side with the most room
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    const S = safe.getBoundingClientRect();
    const m = 8, gap = 14;
    const box = { l: S.left + m, t: S.top + m, r: (S.right || vw) - m, b: (S.bottom || vh) - m };
    const room = { top: r.top - box.t, bottom: box.b - r.bottom, left: r.left - box.l, right: box.r - r.right };
    const fits = s => (s === 'top' || s === 'bottom') ? room[s] >= bh + gap : room[s] >= bw + gap;
    let side = cur.side;
    if (side === 'auto' || !fits(side)) {
      const order = side === 'auto' ? ['top', 'bottom', 'right', 'left'] : [side, side === 'top' ? 'bottom' : side === 'bottom' ? 'top' : side === 'left' ? 'right' : 'left', 'top', 'bottom', 'right', 'left'];
      side = order.find(fits) || Object.entries(room).sort((a, b) => b[1] - a[1])[0][0];
    }
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    let x, y;
    if (side === 'top') { x = cx - bw / 2; y = r.top - gap - bh; }
    else if (side === 'bottom') { x = cx - bw / 2; y = r.bottom + gap; }
    else if (side === 'left') { x = r.left - gap - bw; y = cy - bh / 2; }
    else { x = r.right + gap; y = cy - bh / 2; }
    x = clamp(x, box.l, Math.max(box.l, box.r - bw));
    y = clamp(y, box.t, Math.max(box.t, box.b - bh));
    // the arrow sits on the edge facing the target, lined up with its centre
    const ax = side === 'top' || side === 'bottom' ? clamp(cx - x, 18, bw - 18) : null;
    const ay = side === 'left' || side === 'right' ? clamp(cy - y, 16, bh - 16) : null;
    const key = `${side}|${Math.round(x)}|${Math.round(y)}|${ax ?? ''}|${ay ?? ''}`;
    if (key === lastKey) return;
    lastKey = key;
    bubble.dataset.side = side;
    bubble.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    arrow.style.left = ax !== null ? `${Math.round(ax)}px` : '';
    arrow.style.top = ay !== null ? `${Math.round(ay)}px` : '';
  }

  return {
    show, hide, quiet,
    get shown() { return cur?.id || null; },
    get el() { return layer; },
    destroy() { hide(); layer.remove(); },
  };
}
