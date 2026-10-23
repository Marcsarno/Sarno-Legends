// Motion helpers on top of the Web Animations API and rAF. Everything returns a promise so sequences read top to bottom.
// Global speed (the 1x / 1.5x / 2x setting) divides every duration.

let speed = 1;
export const setSpeed = s => { speed = s || 1; };
export const getSpeed = () => speed;
export const ms = d => d / speed;
export const wait = d => new Promise(r => setTimeout(r, ms(d)));
export const frame = () => new Promise(r => requestAnimationFrame(r));

export const ease = {
  out: 'cubic-bezier(.2,.9,.25,1)', back: 'cubic-bezier(.34,1.56,.64,1)', in: 'cubic-bezier(.55,0,.9,.35)',
  inOut: 'cubic-bezier(.65,0,.35,1)', linear: 'linear',
};

/** el.animate wrapper: keyframes, duration (ms at 1x), easing name or css string. Keeps the end state. */
export function anim(el, keyframes, duration = 240, easing = 'out', opts = {}) {
  if (!el || !el.animate) return Promise.resolve();
  const a = el.animate(keyframes, { duration: ms(duration), easing: ease[easing] || easing, fill: 'forwards', ...opts });
  return a.finished.then(() => { try { a.commitStyles(); a.cancel(); } catch { /* element gone */ } }).catch(() => {});
}

/** Numeric tween with a per-frame callback: tweenValue(0, 100, 400, v => el.textContent = v|0). */
export function tweenValue(from, to, duration, onUpdate, easing = t => 1 - Math.pow(1 - t, 3)) {
  return new Promise(resolve => {
    const t0 = performance.now(), d = Math.max(1, ms(duration));
    const step = now => {
      const t = Math.min(1, (now - t0) / d);
      onUpdate(from + (to - from) * easing(t));
      if (t < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

/** Shake an element (insufficient energy, invalid target). */
export function shake(el, amp = 6, duration = 320) {
  const k = [0, -1, 1, -.7, .7, -.4, .4, 0].map(x => ({ transform: `translateX(${x * amp}px)` }));
  return anim(el, k, duration, 'linear', { composite: 'add' });
}

/** Pop in: scale from 0.6 with overshoot. */
export const popIn = (el, d = 260) => anim(el, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], d, 'back');
export const fadeIn = (el, d = 200) => anim(el, [{ opacity: 0 }, { opacity: 1 }], d, 'out');
export const fadeOut = (el, d = 200) => anim(el, [{ opacity: 1 }, { opacity: 0 }], d, 'in');
