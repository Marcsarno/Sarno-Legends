// Card picker: the deck grid in a mode. Upgrade (Patch Up, events), remove (the pharmacy's removal service, events),
// transform, or pick (choose one of these). In upgrade mode hovering a card shows its upgraded version in place; picking a
// card opens a before / after confirmation. Nothing changes until act.choose(uid).
//   ctx: { cards: [CardInst], mode: 'upgrade'|'remove'|'transform'|'pick', title?, sub?, cancelable? (default true),
//          confirmLabel?, filter?: inst -> bool (false greys a card out) }
//   act: choose(uid), cancel()

import { shell, h, icon, closeBtn, onEscape, hoverSounds, ui, anim } from './common.js';
import { cardGrid, sortControl, artCard } from './cardgrid.js';
import { isUpgradable } from '../../game/content/cards.js';
import '../styles/screens.css';

const MODES = {
  upgrade: { title: 'Patch Up', sub: 'Choose a card to upgrade.', confirm: 'Upgrade', icon: 'arrow_up' },
  remove: { title: 'Remove a Card', sub: 'Choose a card to take out of your deck for good.', confirm: 'Remove', icon: 'close' },
  transform: { title: 'Transform', sub: 'Choose a card. It becomes a random card of the same hero.', confirm: 'Transform', icon: 'flame' },
  pick: { title: 'Choose a Card', sub: '', confirm: 'Take', icon: 'check' },
};

export function mount(root, ctx) {
  const mode = MODES[ctx.mode] ? ctx.mode : 'pick';
  const M = MODES[mode];
  const s = shell(root, 'picker', { modal: true, enter: 'rise' });
  s.el.dataset.mode = mode;
  const act = ctx.act || {};
  const cancelable = ctx.cancelable !== false;
  const cards = ctx.cards || [];
  const filter = ctx.filter || (mode === 'upgrade' ? isUpgradable : null);
  let sort = ctx.sort || 'order';
  let chosen = null;

  const few = mode === 'pick' && cards.length <= 5;   // "choose 1 of 3": big cards in a row, like a reward
  const grid = cardGrid({
    cards, ctx, sort, pickable: true, size: few ? 'reward' : 'grid',
    disabled: filter ? inst => !filter(inst) : null,
    onPick: inst => preview(inst),
    onHover: mode === 'upgrade' ? (inst, cell) => hoverUp(inst, cell) : null,
  });

  // upgrade mode: the hovered card shows its + version in place
  let hovered = null;
  function hoverUp(inst, cell) {
    if (hovered && hovered.cell !== cell) { hovered.cell.replaceChildren(hovered.orig); hovered = null; }
    if (!cell || !isUpgradable(inst) || hovered) return;
    const orig = cell.firstChild;
    hovered = { cell, orig };
    cell.replaceChildren(artCard({ ...inst, up: true }, { size: 'grid', upgradeDiff: true }, ctx));
  }

  // the confirmation: before -> after for upgrades, the card alone otherwise
  const pv = h('div.pk-preview');
  const pvCards = h('div.pk-cards', { style: { display: 'flex', alignItems: 'center', gap: 'calc(var(--u) * 3)' } });
  const confirmBtn = h('button.btn.big', { onclick: () => confirm() }, h('span', { html: icon(M.icon) }), ctx.confirmLabel || M.confirm);
  if (mode === 'remove') confirmBtn.classList.add('primary'); else if (mode === 'upgrade') confirmBtn.classList.add('teal'); else confirmBtn.classList.add('gold');
  const backBtn = h('button.btn', { onclick: () => closePreview() }, 'Back');
  pv.append(h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'calc(var(--u) * 3)' } },
    pvCards, h('div', { style: { display: 'flex', gap: 'calc(var(--u) * 2)' } }, backBtn, confirmBtn)));
  pv.addEventListener('click', e => { if (e.target === pv) closePreview(); });

  function preview(inst) {
    ui(ctx, 'card');
    chosen = inst;
    grid.select(inst.uid);
    pvCards.replaceChildren();
    if (mode === 'upgrade') {
      pvCards.append(
        h('div.pk-col', h('span', 'Now'), artCard(inst, { size: 'zoom' }, ctx)),
        h('div.pk-arrow', { html: icon('arrow_up') }),
        h('div.pk-col', h('span', 'Patched up'), artCard({ ...inst, up: true }, { size: 'zoom', upgradeDiff: true }, ctx)));
      pvCards.querySelector('.pk-arrow svg').style.transform = 'rotate(90deg)';
    } else {
      const c = artCard(inst, { size: 'zoom' }, ctx);
      const wrap = h('div.pk-col', h('span', mode === 'remove' ? 'Remove this card?' : mode === 'transform' ? 'Transform this card?' : 'Take this card?'), mode === 'remove' ? h('div.pk-burn', c) : c);
      pvCards.append(wrap);
    }
    pv.classList.add('pk-preview--on');
    anim(pvCards, [{ transform: 'scale(.85)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], 220, 'back');
    confirmBtn.focus({ preventScroll: true });
  }
  function closePreview() { pv.classList.remove('pk-preview--on'); chosen = null; grid.select(null); }
  let done = false;
  function confirm() {
    if (!chosen || done) return;
    done = true;
    ui(ctx, mode === 'remove' ? 'deny' : 'open');
    act.choose?.(chosen.uid);
  }
  const cancel = () => { if (done) return; ui(ctx, 'click'); act.cancel?.(); };

  if (few) grid.el.classList.add('dk-grid--few');
  s.el.append(
    h('div.scr-scrim'),
    grid.el,
    h('div.dk-head',
      h('h2', ctx.title || M.title, h('small', ctx.sub ?? M.sub)),
      few ? null : sortControl(sort, k => { sort = k; grid.setSort(k); hovered = null; })),
    h('div.dk-foot',
      cancelable ? h('button.btn', { onclick: cancel }, 'Cancel') : null),
    pv,
  );
  if (cancelable) s.el.querySelector('.dk-head').append(closeBtn(cancel, 'Cancel'));
  s.cleanup(onEscape(() => (pv.classList.contains('pk-preview--on') ? closePreview() : cancelable && cancel())));
  s.cleanup(hoverSounds(ctx, s.el));
  return {
    unmount: s.unmount,
    update(next) { if (next) Object.assign(ctx, next); grid.setCards(ctx.cards || []); done = false; },
  };
}
