// Collection: every card, relic and potion in the game. The ones you've been offered, found or owned show in full (tap
// or hover for the details); the rest are dark silhouettes, so there's always something left to find. Tabs with counts
// ("38 / 65 cards seen"); cards are grouped Marc / Yola / either, then by rarity.
//   ctx: { seen: { cards: { id: 1 }, relics: {}, potions: {} }, studio?, audio?, tab?: 'cards'|'relics'|'potions' }
//   act: close()

import { shell, h, closeBtn, onEscape, hoverSounds, ui, enter, itemIcon, relicName, potionName } from './common.js';
import { artCard } from './cardgrid.js';
import { cardEl } from '../card.js';
import { CARDS } from '../../game/content/cards.js';
import { RELICS } from '../../game/content/relics.js';
import { POTIONS } from '../../game/content/potions.js';
import '../styles/screens-extra.css';

const RARITY = { starter: 0, common: 1, uncommon: 2, rare: 3, weapon: 4, shop: 5, curse: 6 };
const HERO = { marc: 0, yola: 1 };

/** What the Collection counts (status cards are made mid-fight and weapon relics live in the Armory, so neither is). */
export function collectionLists() {
  const cards = Object.entries(CARDS).filter(([, c]) => c.type !== 'status').map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => (HERO[a.hero] ?? 2) - (HERO[b.hero] ?? 2) || (RARITY[a.rarity] ?? 9) - (RARITY[b.rarity] ?? 9) || a.name.localeCompare(b.name));
  const relics = Object.entries(RELICS).filter(([, r]) => r.rarity !== 'weapon').map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => (RARITY[a.rarity] ?? 9) - (RARITY[b.rarity] ?? 9) || a.name.localeCompare(b.name));
  const potions = Object.entries(POTIONS).map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (RARITY[a.rarity] ?? 9) - (RARITY[b.rarity] ?? 9) || a.name.localeCompare(b.name));
  return { cards, relics, potions };
}

export function mount(root, ctx) {
  const s = shell(root, 'collection', { modal: true, enter: 'rise' });
  const act = ctx.act || {};
  const close = () => { ui(ctx, 'click'); act.close?.(); };
  const seen = ctx.seen || { cards: {}, relics: {}, potions: {} };
  const L = collectionLists();
  const count = k => L[k].filter(x => seen[k]?.[x.id]).length;
  let tab = ctx.tab || 'cards';

  const tabs = h('div.seg.col-tabs', { role: 'tablist' });
  const TABS = [['cards', 'Cards'], ['relics', 'Relics'], ['potions', 'Medicine']];
  for (const [k, label] of TABS) {
    tabs.append(h('button', { role: 'tab', 'aria-pressed': String(k === tab), dataset: { tab: k }, onclick: () => { if (tab === k) return; ui(ctx, 'click'); tab = k; render(); } },
      label, h('small', `${count(k)}/${L[k].length}`)));
  }
  const note = h('span.col-note');
  const body = h('div.scr-modal__body.col-body');

  function render() {
    for (const b of tabs.children) b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
    const n = count(tab), total = L[tab].length;
    note.replaceChildren(h('b', `${n} / ${total}`), ` ${tab === 'potions' ? 'medicines' : tab} seen`);
    body.replaceChildren(tab === 'cards' ? cardsView() : itemsView(tab));
    body.scrollTop = 0;
  }

  function cardsView() {
    const groups = [['marc', 'Marc'], ['yola', 'Yola'], [null, 'Either hero']];
    return h('div.col-groups', groups.map(([hero, label]) => {
      const list = L.cards.filter(c => (c.hero || null) === hero);
      if (!list.length) return null;
      const got = list.filter(c => seen.cards[c.id]).length;
      return h(`section.col-group.col-group--${hero || 'any'}`,
        h('h4', label, h('small', `${got}/${list.length}`)),
        h('div.col-cards', list.map((c, i) => {
          const known = !!seen.cards[c.id];
          const inst = { id: c.id, up: false, uid: 'col-' + c.id };
          const card = known ? artCard(inst, { size: 'grid' }, ctx) : cardEl(inst, { size: 'grid' });
          const cell = h(`div.col-cell${known ? '' : '.col-cell--ghost'}`, known ? { dataset: { tip: `card:${c.id}`, tipSide: 'right' } } : { 'aria-label': 'Not found yet' }, card,
            known ? null : h('span.col-q', '?'));
          cell.style.animationDelay = Math.min(i * 14, 300) + 'ms';
          return cell;
        })));
    }));
  }

  function itemsView(kind) {
    const one = kind === 'relics' ? 'relic' : 'potion';
    return h('div.col-items', L[kind].map((it, i) => {
      const known = !!seen[kind]?.[it.id];
      const name = kind === 'relics' ? relicName(it.id) : potionName(it.id);
      const cell = h(`div.col-item${known ? '' : '.col-item--ghost'}`,
        itemIcon(one, it.id, known ? ctx : null, { size: 'lg', tip: known }),
        h('span.col-item__name', known ? name : '???'),
        h(`span.col-item__rar.col-item__rar--${it.rarity}`, known ? it.rarity : ''));
      cell.style.animationDelay = Math.min(i * 18, 300) + 'ms';
      return cell;
    }));
  }

  s.el.append(
    h('div.scr-scrim', { onclick: close }),
    h('div.scr-modal.col-modal', { role: 'dialog', 'aria-label': 'Collection' },
      h('div.scr-modal__head', h('h2', 'Collection'), tabs, note, closeBtn(close)),
      body));
  render();
  s.cleanup(onEscape(close));
  s.cleanup(hoverSounds(ctx, s.el));
  enter(s.el.querySelector('.col-modal'), [{ transform: 'translate(-50%, -46%) scale(.97)', opacity: 0 }, { transform: 'translate(-50%, -50%)', opacity: 1 }], 260, 'out');
  return { unmount: s.unmount, update(next) { if (next) Object.assign(ctx, next); render(); } };
}

