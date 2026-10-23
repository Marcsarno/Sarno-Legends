// Shop, the Pharmacy: cards on the top shelf (one on sale), relics and medicine on the counter, and the card removal
// service. Prices dim red when you can't afford them; buying flies the item to the bar and leaves a SOLD tag.
// On touch screens a card tap first opens a big preview with a Buy button (the shelf cards are small on a phone).
//   ctx: { run: { gold, potions, deck }, shop: {
//          cards:   [{ card: CardInst | id, price, sale?, was?, sold? }],
//          relics:  [{ id, price, sold? }],  potions: [{ id, price, sold? }],
//          removal: { price, used? } } }
//   act: buyCard(i), buyRelic(i), buyPotion(i), remove(uid), leave()   (a buy* that returns false means "didn't happen")

import { shell, backdrop, topbar, itemIcon, relicName, potionName, priceTag, stamp, flyClone, barTarget, floatText, hoverSounds, ui, guard, enter, asInst, h, icon, wait } from './common.js';
import { artCard } from './cardgrid.js';
import { mount as mountPicker } from './picker.js';
import { shake } from '../tween.js';
import { RELICS } from '../../game/content/relics.js';
import '../styles/screens-rooms.css';

export function mount(root, ctx) {
  const s = shell(root, 'shop');
  const act = ctx.act || {};
  const g = guard();
  const run = ctx.run;
  const touch = matchMedia('(pointer: coarse)').matches || matchMedia('(max-height: 460px)').matches;
  const sold = { card: new Set(), relic: new Set(), potion: new Set() };
  let removalUsed = false;
  let picker = null, pickerHost = null, zoom = null;

  const bar = topbar(ctx, s.el);
  const gold = () => run?.gold ?? 0;
  const potionFull = () => run?.potions && !run.potions.some(p => !p);

  const shelf = h('div.sh-cards');
  const relics = h('div.sh-row');
  const potions = h('div.sh-row');
  const service = h('button.sh-service', { onclick: () => openRemoval() });
  const leave = h('button.btn.big.sh-leave', { onclick: () => { ui(ctx, 'click'); act.leave?.(); } }, 'Leave', h('span', { html: icon('arrow_up'), style: 'display:grid;width:1em;transform:rotate(90deg)' }));

  s.el.append(
    backdrop(ctx, 'pharmacy', { dim: .42 }),
    h('div.sh-wrap',
      h('div.sh-top',
        h('div.sh-sign', h('span.sh-sign__cross'), h('span.sh-sign__text', 'Pharmacy'), h('span.sh-sign__sub', 'Open late'))),
      h('div.sh-shelf', shelf, h('div.sh-plank')),
      h('div.sh-counter',
        h('div.sh-group', h('div.sh-label', 'Relics'), relics),
        h('div.sh-group', h('div.sh-label', 'Medicine'), potions),
        h('div.sh-group.sh-group--svc', h('div.sh-label', 'Service'), service)),
      leave));

  // ---- render everything from ctx.shop (+ our own sold marks)
  function render() {
    const shop = ctx.shop || {};
    shelf.replaceChildren();
    (shop.cards || []).forEach((it, i) => shelf.append(cardSlot(it, i)));
    requestAnimationFrame(() => fitNames(shelf));
    relics.replaceChildren();
    (shop.relics || []).forEach((it, i) => relics.append(itemSlot('relic', it, i)));
    potions.replaceChildren();
    (shop.potions || []).forEach((it, i) => potions.append(itemSlot('potion', it, i)));
    renderService();
  }

  function cardSlot(it, i) {
    const inst = asInst(it);
    const isSold = it.sold || sold.card.has(i);
    const slot = h('div.sh-slot.sh-slot--card');
    if (isSold) { slot.classList.add('sh-slot--sold'); slot.append(h('div.sh-empty', h('span', 'Sold')), h('span.scr-price.sh-price-ghost', '-')); return slot; }
    const card = artCard(inst, { size: 'grid' }, ctx);
    const btn = h('button.sh-card', { dataset: { tip: `card:${inst.id}${inst.up ? ':up' : ''}`, tipSide: 'bottom' }, onclick: () => (touch ? openZoom(it, i) : buyCard(i, btn)) }, card);
    if (it.sale) btn.append(h('span.sh-sale', 'Sale'));
    const price = priceTag(it.price, gold(), { was: it.sale ? (it.was || it.price * 2) : null });
    slot.append(btn, price);
    if (gold() < it.price) slot.classList.add('sh-slot--short');
    return slot;
  }

  function itemSlot(kind, it, i) {
    const isSold = it.sold || sold[kind].has(i);
    const slot = h(`div.sh-slot.sh-slot--item.sh-slot--${kind}`);
    if (isSold) { slot.classList.add('sh-slot--sold'); slot.append(h('div.sh-empty.sh-empty--item', h('span', 'Sold')), h('span.sh-item__name', ' '), h('span.scr-price.sh-price-ghost', '-')); return slot; }
    const name = kind === 'relic' ? relicName(it.id) : potionName(it.id);
    const btn = h('button.sh-item', { 'aria-label': `${name}, ${it.price} supplies`, onclick: () => buyItem(kind, i, btn) },
      itemIcon(kind, it.id, ctx, { size: 'lg' }),
      h('span.sh-item__name', name));
    if (kind === 'relic' && RELICS[it.id]?.rarity === 'shop') btn.append(h('span.sh-tag', 'Staff only'));
    slot.append(btn, priceTag(it.price, gold()));
    if (gold() < it.price) slot.classList.add('sh-slot--short');
    if (kind === 'potion' && potionFull()) slot.classList.add('sh-slot--full');
    return slot;
  }

  function renderService() {
    const r = ctx.shop?.removal;
    const used = removalUsed || !r || r.used;
    service.replaceChildren(
      h('span.sh-service__ico', { html: icon('exhaust') }),
      h('span.sh-service__text', h('b', 'Card Removal'), h('span', used ? 'Done for this visit.' : 'Take a card out of your deck.')),
      ...(used ? [] : [priceTag(r.price, gold())]));
    service.disabled = used;
    service.classList.toggle('sh-service--used', used);
    service.classList.toggle('sh-slot--short', !used && gold() < r.price);
  }

  // ---- buying
  function cantAfford(el, price) {
    ui(ctx, 'deny');
    shake(el, 8);
    floatText(el.closest('.sh-slot') || el, gold() < price ? 'Not enough supplies' : 'No room', { tone: 'bad', dy: -40 });
  }

  async function buyCard(i, btn) {
    const it = ctx.shop.cards[i];
    if (g.busy) return;
    if (gold() < it.price) return cantAfford(btn, it.price);
    await g.run(async () => {
      const ok = act.buyCard?.(i);
      if (ok === false) return cantAfford(btn, it.price);
      ui(ctx, 'coin');
      sold.card.add(i);
      const land = flyClone(btn.querySelector('.card'), barTarget('deck'), { scale: .12 });
      btn.style.visibility = 'hidden';
      await land;
      bar?.update();
      render();
    });
  }

  async function buyItem(kind, i, btn) {
    const it = (kind === 'relic' ? ctx.shop.relics : ctx.shop.potions)[i];
    if (g.busy) return;
    if (gold() < it.price) return cantAfford(btn, it.price);
    if (kind === 'potion' && potionFull()) return cantAfford(btn, 0);
    await g.run(async () => {
      const ok = kind === 'relic' ? act.buyRelic?.(i) : act.buyPotion?.(i);
      if (ok === false) return cantAfford(btn, it.price);
      ui(ctx, 'coin');
      sold[kind].add(i);
      const land = flyClone(btn.querySelector('.scr-item'), barTarget(kind === 'relic' ? 'relic' : 'potion'), { scale: .45 });
      btn.style.visibility = 'hidden';
      await land;
      bar?.update();
      render();
    });
  }

  function openRemoval() {
    const r = ctx.shop?.removal;
    if (g.busy || picker || !r || r.used || removalUsed) return;
    if (gold() < r.price) return cantAfford(service, r.price);
    ui(ctx, 'click');
    const host = h('div.rs-pickhost');
    s.el.append(host);
    pickerHost = host;
    picker = mountPicker(host, {
      ...ctx, cards: run.deck, mode: 'remove', topbar: false,
      sub: `Costs ${r.price} supplies. The card is gone for the rest of the run.`,
      act: {
        choose: uid => { closePicker(); removalUsed = true; act.remove?.(uid); bar?.update(); render(); stamp(service, 'Done', { tone: 'green', rot: -8 }); },
        cancel: () => closePicker(),
      },
    });
  }
  function closePicker() { const p = picker, host = pickerHost; picker = pickerHost = null; p?.unmount(); wait(400).then(() => host?.remove()); }

  // ---- touch: preview a shelf card before buying
  function openZoom(it, i) {
    if (zoom || g.busy) return;
    ui(ctx, 'card');
    const inst = asInst(it);
    const card = artCard(inst, { size: 'zoom' }, ctx);
    const afford = gold() >= it.price;
    const buy = h('button.btn.big.gold', { onclick: () => { closeZoom(); const btn = shelf.children[i]?.querySelector('.sh-card'); if (btn) buyCard(i, btn); } },
      'Buy', h('span.scr-gold', h('span.scr-gold__ico', { html: icon('supplies') }), String(it.price)));
    if (!afford) buy.disabled = true;
    zoom = h('div.sh-zoom', { onclick: e => { if (e.target === zoom) closeZoom(); } },
      h('div.sh-zoom__inner', card, h('div.sh-zoom__btns', h('button.btn', { onclick: closeZoom }, 'Back'), buy),
        afford ? null : h('div.sh-zoom__note', 'Not enough supplies.')));
    s.el.append(zoom);
    enter(zoom.firstChild, [{ transform: 'scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], 220, 'back');
  }
  function closeZoom() { zoom?.remove(); zoom = null; }

  render();
  s.cleanup(hoverSounds(ctx, s.el));
  // entrance: the shelf fills left to right, then the counter
  [...shelf.children].forEach((el, k) => enter(el, [{ transform: 'translateY(-30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 380, 'back', 120 + k * 70));
  [...relics.children, ...potions.children, service].forEach((el, k) => enter(el, [{ transform: 'translateY(24px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 340, 'out', 400 + k * 50));

  return {
    unmount() { picker?.unmount(); bar?.destroy(); s.unmount(); },
    update(next) { if (next) Object.assign(ctx, next); bar?.update(); if (!g.busy) render(); },
  };
}

/** Shelf card names keep a 12 px floor on phones (screens-extra.css): the few long ones are narrowed, not shrunk. */
function fitNames(host) {
  for (const n of host.querySelectorAll('.card__name')) {
    const sp = n.querySelector('span');
    if (!sp) continue;
    sp.style.transform = ''; sp.style.display = 'inline-block';
    const over = sp.scrollWidth / Math.max(1, n.clientWidth - 2);
    if (over > 1) { sp.style.transform = `scaleX(${(1 / over).toFixed(3)})`; sp.style.transformOrigin = 'center'; }
  }
}
