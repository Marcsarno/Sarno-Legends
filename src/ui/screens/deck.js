// Deck viewer (and the combat pile viewers): every card in a grid, sortable by found / type / cost / hero, with a
// "show upgrades" toggle so you can read what Patch Up would do. Tapping a card zooms it (with its upgrade beside it).
//   ctx: { cards: [CardInst], title?: 'Your Deck' | 'Draw Pile' | ..., note?: 'Shown in random order.', sort? }
//   act: close()

import { shell, h, icon, closeBtn, onEscape, hoverSounds, ui, enter } from './common.js';
import { cardGrid, sortControl, artCard } from './cardgrid.js';
import { isUpgradable } from '../../game/content/cards.js';
import '../styles/screens.css';

export function mount(root, ctx) {
  const s = shell(root, 'deck', { modal: true, enter: 'rise' });
  const act = ctx.act || {};
  const cards = ctx.cards || [];
  let sort = ctx.sort || 'order';
  const grid = cardGrid({ cards, ctx, sort, pickable: true, onPick: inst => zoom(inst) });
  const close = () => { ui(ctx, 'click'); act.close?.(); };
  const canUp = cards.some(c => isUpgradable(c));
  const upToggle = canUp ? h('label.dk-up', h('input', { type: 'checkbox', onchange: e => grid.setShowUp(e.target.checked) }), h('span', 'Show upgrades')) : null;

  // zoom: the card big, and its upgraded version when it has one
  const pv = h('div.pk-preview', { onclick: () => unzoom() });
  function zoom(inst) {
    ui(ctx, 'card');
    const row = h('div.pk-cards', { style: 'display:flex;align-items:center;gap:calc(var(--u) * 3)' },
      h('div.pk-col', h('span', inst.up ? 'Upgraded' : 'Now'), artCard(inst, { size: 'zoom' }, ctx)));
    if (isUpgradable(inst)) {
      row.append(h('div.pk-arrow', { html: icon('arrow_up'), style: 'transform:rotate(90deg)' }),
        h('div.pk-col', h('span', 'Patched up'), artCard({ ...inst, up: true }, { size: 'zoom', upgradeDiff: true }, ctx)));
    }
    pv.replaceChildren(h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:calc(var(--u) * 2.4)' },
      row, h('div.dk-foot__hint', 'Tap anywhere to close')));
    pv.classList.add('pk-preview--on');
    enter(row, [{ transform: 'scale(.85)', opacity: 0 }, { transform: 'none', opacity: 1 }], 220, 'back');
  }
  function unzoom() { pv.classList.remove('pk-preview--on'); }

  s.el.append(
    h('div.scr-scrim', { onclick: close }),
    grid.el,
    h('div.dk-head',
      h('h2', ctx.title || 'Your Deck', h('small', `${cards.length} card${cards.length === 1 ? '' : 's'}`)),
      ctx.note ? h('span.dk-note', ctx.note) : null,
      sortControl(sort, k => { sort = k; grid.setSort(k); }),
      upToggle,
      closeBtn(close)),
    pv,
  );
  s.cleanup(onEscape(() => (pv.classList.contains('pk-preview--on') ? unzoom() : close())));
  s.cleanup(hoverSounds(ctx, s.el));
  return {
    unmount: s.unmount,
    update(next) { if (next) Object.assign(ctx, next); grid.setCards(ctx.cards || []); },
  };
}
