// Settings: a modal over whatever is behind it. Game speed, music and sound volume, screen shake, gore, and the two
// destructive buttons (abandon this run, reset the whole profile), each needing a second tap to confirm.
// Every change goes out at once through act.set(key, value) so the app can apply it live.
//   ctx: { settings: { speed: 1|1.5|2, music: 0..1, sfx: 0..1, voices: bool, shake: bool, gore: 'full'|'low', tips: bool }, inRun?: bool, version? }
//   act: set(key, value), close(), abandonRun(), resetProfile(), howTo()   (tips: the first-run coach, src/app/coach.js)

import { shell, h, closeBtn, onEscape, hoverSounds, ui, enter } from './common.js';
import '../styles/screens.css';

export function mount(root, ctx) {
  const s = shell(root, 'settings', { modal: true });
  const act = ctx.act || {};
  const cur = { speed: 1, music: .7, sfx: .8, voices: true, shake: true, gore: 'full', tips: true, ...(ctx.settings || {}) };
  const close = () => { ui(ctx, 'click'); act.close?.(); };
  const set = (k, v) => { cur[k] = v; act.set?.(k, v); if (k === 'voices' && !v) ctx.audio?.voice?.stop?.(); };

  const seg = (key, options) => {
    const el = h('div.seg', { role: 'group' });
    for (const [value, label] of options) {
      const b = h('button', { 'aria-pressed': String(cur[key] === value), onclick: () => {
        for (const x of el.children) x.setAttribute('aria-pressed', String(x === b));
        ui(ctx, 'click');
        set(key, value);
      } }, label);
      el.append(b);
    }
    return el;
  };
  const slider = key => {
    const out = h('output', String(Math.round(cur[key] * 100)));
    const input = h('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(cur[key] * 100), 'aria-label': key });
    const paint = () => { input.style.setProperty('--p', input.value + '%'); out.textContent = input.value; };
    input.addEventListener('input', () => { paint(); set(key, +input.value / 100); });
    input.addEventListener('change', () => ui(ctx, key === 'sfx' ? 'card' : 'click'));
    paint();
    return h('div.set-slider', input, out);
  };
  const row = (label, sub, control) => h('div.set-row', h('div.set-row__label', h('b', label), sub ? h('small', sub) : null), control);

  // two-step confirm for the dangerous ones
  const danger = (label, armedLabel, fn) => {
    let armed = false, t = 0;
    const b = h('button.btn.danger', { onclick: () => {
      if (!armed) {
        armed = true; b.classList.add('armed'); b.textContent = armedLabel; ui(ctx, 'deny');
        clearTimeout(t); t = setTimeout(() => { armed = false; b.classList.remove('armed'); b.textContent = label; }, 3500);
        return;
      }
      clearTimeout(t); ui(ctx, 'click'); fn?.();
    } }, label);
    s.cleanup(() => clearTimeout(t));
    return b;
  };

  const modal = h('div.scr-modal', { role: 'dialog', 'aria-label': 'Settings' },
    h('div.scr-modal__head', h('h2', 'Settings'), closeBtn(close)),
    h('div.scr-modal__body',
      row('Game speed', 'How fast fights and animations play.', seg('speed', [[1, '1×'], [1.5, '1.5×'], [2, '2×']])),
      row('Tips', 'Short hints the first time something new comes up.', seg('tips', [[true, 'On'], [false, 'Off']])),
      row('Music', null, slider('music')),
      row('Sound', null, slider('sfx')),
      row('Voices', 'Marc and Yola talk during fights.', seg('voices', [[true, 'On'], [false, 'Off']])),
      row('Screen shake', 'Big hits shake the camera.', seg('shake', [[true, 'On'], [false, 'Off']])),
      row('Gore', 'Low turns off blood and dismemberment.', seg('gore', [['full', 'Full'], ['low', 'Low']])),
      h('div.set-danger',
        h('div.set-danger__label', 'Careful'),
        ctx.inRun ? danger('Abandon run', 'Tap again to abandon', act.abandonRun) : null,
        danger('Reset profile', 'Tap again: erase everything', act.resetProfile)),
      h('div.set-foot', h('span.set-ver', ctx.version ? `Sarno Legends v${String(ctx.version).replace(/^v/, '')}` : 'Sarno Legends'),
        act.howTo ? h('button.btn', { onclick: () => { ui(ctx, 'click'); act.howTo(); } }, 'How to Play') : null,
        h('button.btn.teal', { onclick: close }, 'Done'))));

  s.el.append(h('div.scr-scrim', { onclick: close }), modal);
  s.cleanup(onEscape(close));
  s.cleanup(hoverSounds(ctx, s.el));
  enter(modal, [{ transform: 'translate(-50%, -46%) scale(.96)', opacity: 0 }, { transform: 'translate(-50%, -50%)', opacity: 1 }], 260, 'out');
  return { unmount: s.unmount, update() {} };
}
