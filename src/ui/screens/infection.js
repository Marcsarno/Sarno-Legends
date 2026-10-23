// Infection (the New Run flow, once you've won a run): pick how hard the hospital is. Level 0 is the family level; each
// win at the highest level you've unlocked opens the next one. Locked levels show what unlocks them.
//   ctx: { levels: [{ level, name, desc }], unlocked: number (highest playable level), selected?: number, audio? }
//   act: start(level), close()

import { shell, h, icon, closeBtn, onEscape, hoverSounds, ui, enter } from './common.js';
import '../styles/screens-extra.css';

export function mount(root, ctx) {
  const s = shell(root, 'infection', { modal: true });
  const act = ctx.act || {};
  const close = () => { ui(ctx, 'click'); act.close?.(); };
  const levels = (ctx.levels || []).slice().sort((a, b) => a.level - b.level);
  const unlocked = Math.max(0, ctx.unlocked | 0);
  let sel = Math.min(Math.max(0, ctx.selected ?? unlocked), unlocked);

  const list = h('div.inf-list', { role: 'radiogroup', 'aria-label': 'Infection level' });
  const startBtn = h('button.btn.big.primary.inf-start', { onclick: () => start() });
  function render() {
    list.replaceChildren(...levels.map(l => {
      const locked = l.level > unlocked;
      const on = l.level === sel;
      const b = h(`button.inf-lv${on ? '.inf-lv--on' : ''}${locked ? '.inf-lv--locked' : ''}`, {
        role: 'radio', 'aria-checked': String(on), 'aria-disabled': String(locked), dataset: { level: l.level },
        onclick: () => { if (locked) { ui(ctx, 'deny'); return; } if (sel !== l.level) { sel = l.level; ui(ctx, 'select'); render(); } },
      },
      h('span.inf-lv__n', locked ? h('span', { html: icon('lock') }) : String(l.level)),
      h('span.inf-lv__text', h('b', l.name || `Infection ${l.level}`),
        h('small', locked ? (l.level === unlocked + 1 ? `Win a run at Infection ${unlocked} to unlock.` : `Win at Infection ${l.level - 1} to unlock.`) : (l.desc || ''))));
      return b;
    }));
    const cur = levels.find(l => l.level === sel);
    startBtn.replaceChildren(h('span', { html: icon('swords') }), sel ? `Start · Infection ${sel}` : 'Start the run');
    startBtn.title = cur?.name || '';
  }
  let done = false;
  function start() { if (done) return; done = true; ui(ctx, 'click'); act.start?.(sel); }

  const modal = h('div.scr-modal.inf-modal', { role: 'dialog', 'aria-label': 'Choose infection level' },
    h('div.scr-modal__head', h('h2', 'Infection'), h('span.inf-sub', 'How bad is it in there tonight?'), closeBtn(close)),
    h('div.scr-modal__body.inf-body', list),
    h('div.inf-foot', h('button.btn', { onclick: close }, 'Back'), startBtn));
  s.el.append(h('div.scr-scrim', { onclick: close }), modal);
  render();
  s.cleanup(onEscape(close));
  s.cleanup(hoverSounds(ctx, s.el));
  enter(modal, [{ transform: 'translate(-50%, -46%) scale(.96)', opacity: 0 }, { transform: 'translate(-50%, -50%)', opacity: 1 }], 260, 'out');
  requestAnimationFrame(() => list.querySelector('.inf-lv--on')?.scrollIntoView?.({ block: 'nearest' }));
  return { unmount: s.unmount, update() { render(); } };
}
