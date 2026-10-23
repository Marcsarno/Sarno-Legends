// A sortable grid of cards, shared by the deck viewer and the picker (and anything else that lists cards).
//   const g = cardGrid({ cards, ctx, sort: 'order', showUp: false, pickable, onPick(inst, cell), onHover(inst, cell|null) })
//   g.el  the grid element;  g.setSort(key);  g.setShowUp(bool);  g.cells  Map<uid|index, cell>;  g.select(uid|null)
// Sort keys: 'order' (as given), 'type', 'cost', 'hero'. Studio art is requested for each card when ctx.studio exists.

import { h } from '../dom.js';
import { cardEl, setCardArt } from '../card.js';
import { cardView, isUpgradable } from '../../game/content/cards.js';
import { icon } from '../icons.js';

const TYPE_ORDER = { attack: 0, skill: 1, power: 2, status: 3, curse: 4 };
const HERO_ORDER = { marc: 0, yola: 1 };
const RARITY_ORDER = { rare: 0, uncommon: 1, common: 2, weapon: 3, starter: 4 };

export const SORTS = [
  { key: 'order', label: 'Found' },
  { key: 'type', label: 'Type' },
  { key: 'cost', label: 'Cost' },
  { key: 'hero', label: 'Hero' },
];

export function sortCards(cards, key) {
  const list = cards.map((c, i) => ({ c, i, v: safeView(c) }));
  const byName = (a, b) => (a.v?.name || '').localeCompare(b.v?.name || '') || a.i - b.i;
  const cmp = {
    order: (a, b) => a.i - b.i,
    type: (a, b) => (TYPE_ORDER[a.v?.type] ?? 9) - (TYPE_ORDER[b.v?.type] ?? 9) || (RARITY_ORDER[a.v?.rarity] ?? 9) - (RARITY_ORDER[b.v?.rarity] ?? 9) || byName(a, b),
    cost: (a, b) => (a.v?.cost ?? 99) - (b.v?.cost ?? 99) || (TYPE_ORDER[a.v?.type] ?? 9) - (TYPE_ORDER[b.v?.type] ?? 9) || byName(a, b),
    hero: (a, b) => (HERO_ORDER[a.v?.hero] ?? 2) - (HERO_ORDER[b.v?.hero] ?? 2) || (TYPE_ORDER[a.v?.type] ?? 9) - (TYPE_ORDER[b.v?.type] ?? 9) || byName(a, b),
  }[key] || ((a, b) => a.i - b.i);
  return list.sort(cmp).map(x => x.c);
}
function safeView(c) { try { return cardView(c); } catch { return null; } }

/** cardEl plus the studio still when there is one. */
export function artCard(inst, opts, ctx) {
  const el = cardEl(inst, opts);
  const st = ctx?.studio;
  if (st?.cardArt && ctx.studioArt !== false) {
    Promise.resolve().then(() => st.cardArt(inst.id)).then(url => url && setCardArt(el, url)).catch(() => {});
  }
  return el;
}

export function cardGrid({ cards, ctx, sort = 'order', showUp = false, pickable = false, disabled = null, onPick, onHover, size = 'grid' }) {
  const el = h('div.dk-grid', { role: pickable ? 'listbox' : 'list' });
  const cells = new Map();
  let selected = null;

  function build() {
    el.replaceChildren();
    cells.clear();
    const list = sortCards(cards, sort);
    if (!list.length) { el.append(h('div.dk-empty', 'No cards here.')); return; }
    list.forEach((inst, i) => {
      const off = disabled ? disabled(inst) : false;
      const shown = showUp && isUpgradable(inst) ? { ...inst, up: true } : inst;
      const card = artCard(shown, { size, upgradeDiff: showUp && shown !== inst }, ctx);
      const cell = h('div.dk-cell', {
        role: pickable ? 'option' : 'listitem', tabIndex: pickable && !off ? 0 : -1,
        dataset: { uid: inst.uid || String(i), tip: `card:${inst.id}${shown.up ? ':up' : ''}`, tipSide: 'right' },
      }, card);
      cell._inst = inst;
      if (off) cell.classList.add('dk-cell--off');
      if (pickable && !off) {
        cell.classList.add('dk-cell--pick');
        cell.addEventListener('click', () => onPick?.(inst, cell));
        cell.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick?.(inst, cell); } });
      }
      if (onHover) {
        cell.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') onHover(inst, cell); });
        cell.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') onHover(inst, null); });
      }
      if (selected && (inst.uid || String(i)) === selected) cell.classList.add('dk-cell--sel');
      el.append(cell);
      cells.set(inst.uid || String(i), cell);
      cell.style.animationDelay = Math.min(i * 18, 360) + 'ms';
    });
  }
  build();

  return {
    el, cells,
    setSort(k) { sort = k; build(); },
    setShowUp(v) { showUp = v; build(); },
    setCards(c) { cards = c; build(); },
    select(uid) {
      selected = uid;
      for (const [k, c] of cells) {
        c.classList.toggle('dk-cell--sel', k === uid);
        c.querySelector('.dk-cell__mark')?.remove();
        if (k === uid) c.append(h('span.dk-cell__mark', { html: icon('check') }));
      }
    },
  };
}

/** The little "Sort: Found / Type / Cost / Hero" segmented control. */
export function sortControl(current, onChange) {
  const seg = h('div.seg', { role: 'group', 'aria-label': 'Sort cards' });
  for (const s of SORTS) {
    const b = h('button', { 'aria-pressed': String(s.key === current), onclick: () => {
      for (const x of seg.children) x.setAttribute('aria-pressed', String(x === b));
      onChange(s.key);
    } }, s.label);
    seg.append(b);
  }
  return h('div.dk-sort', h('span', 'Sort'), seg);
}
