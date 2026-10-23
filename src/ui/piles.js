// Pile viewer: a modal grid of cards (draw, discard and exhaust piles in combat; the deck from the top bar).
//   const v = openPileViewer({ title, cards: [CardInst], note?, combat?, studio?, sort?: 'type'|'none', root?, onClose?, icon? })
//   v.close()
// The draw pile is shown sorted (hero, type, cost, name) so the order isn't given away. Esc, the X, or a tap on the
// backdrop closes it. Hovering (or long-pressing) a card shows its keyword tooltips. Styles: hud.css (.pv).

import { cardView } from '../game/content/cards.js';
import { h } from './dom.js';
import { anim } from './tween.js';
import { icon } from './icons.js';
import { cardEl } from './card.js';
import { showTip, hideTip, tipCardKeywords } from './tooltip.js';

const TYPE_ORDER = { attack: 0, skill: 1, power: 2, status: 3, curse: 4 };
const HERO_ORDER = { marc: 0, yola: 1 };

export function sortCards(cards) {
  return cards.slice().sort((a, b) => {
    const A = cardView(a), B = cardView(b);
    return (HERO_ORDER[A.hero] ?? 2) - (HERO_ORDER[B.hero] ?? 2)
      || (TYPE_ORDER[A.type] ?? 9) - (TYPE_ORDER[B.type] ?? 9)
      || (A.cost ?? 9) - (B.cost ?? 9)
      || A.name.localeCompare(B.name);
  });
}

export function openPileViewer({ title, cards = [], note = '', combat = null, studio = null, sort = 'type', root = document.body, onClose = null, icon: iconName = 'deck' }) {
  const list = sort === 'none' ? cards : sortCards(cards);
  const grid = h('div.pv__grid');
  for (const c of list) {
    const el = cardEl(c, { size: 'grid', combat, studio });
    el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { const t = tipCardKeywords(c); if (t.length) showTip(el, t, { side: 'right', key: el }); } });
    el.addEventListener('pointerleave', () => hideTip(el));
    grid.append(el);
  }
  if (!list.length) grid.append(h('div.pv__empty', 'Nothing here.'));
  const closeBtn = h('button.pv__close', { 'aria-label': 'Close', html: icon('close') });
  const panel = h('div.pv__panel',
    h('div.pv__head',
      h('span.pv__icon', { html: icon(iconName) }),
      h('span.pv__title', title),
      h('span.pv__count', `${cards.length} card${cards.length === 1 ? '' : 's'}`),
      note ? h('span.pv__note', note) : null,
      closeBtn),
    h('div.pv__scroll.scroll', grid));
  const el = h('div.pv', h('div.pv__scrim'), panel);
  root.append(el);
  anim(panel, [{ transform: 'translateY(18px) scale(.97)', opacity: 0 }, { transform: 'none', opacity: 1 }], 220, 'out');
  anim(el.firstChild, [{ opacity: 0 }, { opacity: 1 }], 180);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    hideTip();
    removeEventListener('keydown', key, true);
    anim(el, [{ opacity: 1 }, { opacity: 0 }], 140, 'in').then(() => el.remove());
    onClose?.();
  }
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
  addEventListener('keydown', key, true);
  closeBtn.addEventListener('click', close);
  el.firstChild.addEventListener('click', close);
  return { close, el };
}
