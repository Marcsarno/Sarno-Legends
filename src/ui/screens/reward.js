// Reward: the "SUPPLIES FOUND" panel over the battle after a win. One row per reward (supplies, a potion, a relic, "Add a
// card to your deck"); tapping a row takes it (coins fly to the supplies counter, potions and relics fly to the bar);
// the card row opens a pick of 3 cards with Skip. Take All grabs everything but the card.
//   ctx: { rewards: [{ kind: 'gold', amount } | { kind: 'potion', id } | { kind: 'relic', id } | { kind: 'cards', cards: [CardInst] },
//          each may carry taken: true], kind?: 'fight'|'elite'|'boss'|'event', backdrop?: room key (when no battle is behind),
//          autoOpenCards?: bool }
//   act: take(i), pickCard(i, cardIdx), skip(i), done()
// After act.take / act.pickCard the app updates the run and calls update(); the screen keeps its own "taken" marks too.

import { shell, backdrop, topbar, itemIcon, relicName, potionName, flyTo, flyClone, barTarget, hoverSounds, ui, guard, enter, h, icon, wait, anim, onEscape } from './common.js';
import { artCard } from './cardgrid.js';
import { RELICS } from '../../game/content/relics.js';
import { POTIONS } from '../../game/content/potions.js';
import { RARITY_LABELS } from '../../game/text.js';
import '../styles/screens-rooms.css';

const KICKER = { fight: 'Ward cleared', elite: 'Elite down', boss: 'The way up is open', event: 'Found something', treasure: 'Crate opened' };

export function mount(root, ctx) {
  const s = shell(root, 'reward', { enter: 'none' });
  const act = ctx.act || {};
  const g = guard();
  const taken = new Set();
  const isTaken = i => taken.has(i) || !!ctx.rewards?.[i]?.taken;

  if (ctx.backdrop) s.el.append(backdrop(ctx, ctx.backdrop, { dim: .35 }));
  s.el.append(h('div.rw-scrim'));
  const bar = topbar(ctx, s.el);

  const list = h('div.rw-list');
  const takeAll = h('button.btn.rw-takeall', { onclick: () => takeEverything() }, h('span', { html: icon('arrow_down') }), 'Take All');
  const cont = h('button.btn.big.primary.rw-continue', { onclick: () => finish() }, 'Continue', h('span', { html: icon('arrow_up'), style: { transform: 'rotate(90deg)', display: 'grid', width: '1em' } }));
  const panel = h('div.rw-panel',
    h('div.rw-tape'),
    h('div.rw-head',
      h('div.scr-kicker', KICKER[ctx.kind] || KICKER.fight),
      h('h2.rw-title', ctx.title || 'Supplies Found')),
    list,
    h('div.rw-foot', takeAll, cont));
  s.el.append(h('div.rw-wrap', panel));

  function potionFull() { return ctx.run?.potions && !ctx.run.potions.some(p => !p); }

  function rowFor(r, i) {
    let ico, label, sub = null, cls = r.kind;
    if (r.kind === 'gold') {
      ico = h('span.rw-coin', { html: icon('supplies') });
      label = h('span', h('b.gold-c', String(r.amount)), ' Supplies');
    } else if (r.kind === 'potion') {
      ico = itemIcon('potion', r.id, ctx, { size: 'md' });
      label = potionName(r.id);
      sub = potionFull() ? h('span.rw-warn', 'Potion slots full') : h('span', RARITY_LABELS[POTIONS[r.id]?.rarity] || 'Potion');
    } else if (r.kind === 'relic') {
      ico = itemIcon('relic', r.id, ctx, { size: 'md' });
      label = relicName(r.id);
      sub = h('span', { html: RELICS[r.id]?.text || '' });
    } else if (r.kind === 'cards') {
      ico = h('span.rw-cardsico', h('i'), h('i'), h('i'));
      label = 'Add a card to your deck';
      sub = h('span', `Pick 1 of ${r.cards?.length || 3}, or skip`);
    } else {
      ico = h('span.rw-coin', { html: icon('star') });
      label = r.label || r.kind;
    }
    const row = h(`button.rw-row.rw-row--${cls}`, {
      dataset: r.kind === 'relic' ? { tip: `relic:${r.id}`, tipSide: 'right' } : r.kind === 'potion' ? { tip: `potion:${r.id}`, tipSide: 'right' } : {},
      onclick: () => (r.kind === 'cards' ? openCards(i) : take(i, row)),
    }, ico, h('span.rw-row__text', h('span.rw-row__label', label), sub ? h('span.rw-row__sub', sub) : null), h('span.rw-row__go', { html: icon(r.kind === 'cards' ? 'deck' : 'arrow_down') }));
    if (r.kind === 'potion' && potionFull()) row.classList.add('rw-row--blocked');
    row._i = i;
    return row;
  }

  function render() {
    list.replaceChildren();
    (ctx.rewards || []).forEach((r, i) => { if (!isTaken(i)) list.append(rowFor(r, i)); });
    const left = (ctx.rewards || []).filter((r, i) => !isTaken(i));
    takeAll.hidden = !left.some(r => r.kind !== 'cards' && !(r.kind === 'potion' && potionFull()));
    if (!left.length) list.append(h('div.rw-empty', 'All packed up.'));
    cont.classList.toggle('rw-continue--ready', !left.length);
  }

  async function take(i, row) {
    const r = ctx.rewards[i];
    if (g.busy || isTaken(i)) return;
    if (r.kind === 'potion' && potionFull()) { ui(ctx, 'deny'); anim(row, [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], 260, 'linear'); return; }
    await g.run(async () => {
      taken.add(i);
      row.classList.add('rw-row--taking');
      const from = row.querySelector('.rw-coin, .scr-item') || row;
      if (r.kind === 'gold') {
        ui(ctx, 'coin');
        const n = Math.max(5, Math.min(14, Math.round(r.amount / 3)));
        const land = flyTo(from, barTarget('gold'), { count: n, stagger: 40, size: 26 });
        await wait(240);
        act.take?.(i);
        await land;
      } else {
        ui(ctx, 'open');
        const land = flyClone(from, barTarget(r.kind === 'potion' ? 'potion' : 'relic'), { scale: .5 });
        act.take?.(i);
        await land;
      }
      await collapse(row);
      bar?.update();
      render();
    });
  }

  function collapse(row) {
    const hgt = row.offsetHeight;
    return anim(row, [{ height: hgt + 'px', opacity: 1, marginBottom: getComputedStyle(row).marginBottom }, { height: '0px', opacity: 0, marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px' }], 200, 'in');
  }

  async function takeEverything() {
    if (g.busy) return;
    // re-query after each take: render() rebuilds the rows
    const next = () => [...list.querySelectorAll('.rw-row')].find(r => !r.classList.contains('rw-row--cards') && !r.classList.contains('rw-row--blocked'));
    for (let row = next(), n = 0; row && n < 8; row = next(), n++) await take(row._i, row);
  }

  // ---- card pick overlay
  let pick = null;
  function openCards(i) {
    if (g.busy || pick) return;
    const r = ctx.rewards[i];
    ui(ctx, 'card');
    const cards = r.cards || [];
    const row = h('div.rw-pick__cards');
    const wrap = h('div.rw-pick',
      h('div.rw-pick__scrim'),
      h('div.rw-pick__head', h('div.scr-kicker', 'Add a card to your deck'), h('h2.rw-title', 'Choose One')),
      row,
      h('div.rw-pick__foot',
        h('button.btn', { onclick: () => closeCards(i, true) }, 'Skip'),
        h('span.rw-pick__hint', 'Or tap a card to add it.')));
    cards.forEach((c, j) => {
      const card = artCard(c, { size: 'reward' }, ctx);
      const cell = h('button.rw-pick__card', { dataset: { tip: `card:${c.id}${c.up ? ':up' : ''}`, tipSide: 'bottom' }, onclick: () => choose(i, j, cell) }, card);
      row.append(cell);
      enter(cell, [{ transform: 'translateY(40%) rotate(' + ((j - 1) * 8) + 'deg) scale(.7)', opacity: 0 }, { transform: 'none', opacity: 1 }], 380, 'back', 60 + j * 90);
    });
    s.el.append(wrap);
    enter(wrap.querySelector('.rw-pick__scrim'), [{ opacity: 0 }, { opacity: 1 }], 220);
    pick = { wrap, i };
  }
  function closeCards(i, skipped) {
    if (!pick) return;
    const w = pick.wrap; pick = null;
    if (skipped) { ui(ctx, 'click'); act.skip?.(i); }
    anim(w, [{ opacity: 1 }, { opacity: 0 }], 160, 'in').then(() => w.remove());
  }
  async function choose(i, j, cell) {
    if (g.busy || !pick) return;
    await g.run(async () => {
      ui(ctx, 'card');
      for (const other of pick.wrap.querySelectorAll('.rw-pick__card')) if (other !== cell) other.classList.add('rw-pick__card--gone');
      cell.classList.add('rw-pick__card--chosen');
      await wait(160);
      const land = flyClone(cell.querySelector('.card'), barTarget('deck'), { scale: .12, duration: 520 });
      cell.style.visibility = 'hidden';
      taken.add(i);
      act.pickCard?.(i, j);
      await land;
      closeCards(i, false);
      bar?.update();
      render();
    });
  }

  function finish() {
    if (g.busy) return;
    ui(ctx, 'click');
    act.done?.();
  }

  render();
  s.cleanup(hoverSounds(ctx, s.el));
  s.cleanup(onEscape(() => pick && closeCards(pick.i, true)));
  enter(panel, [{ transform: 'translateY(calc(var(--u) * 8)) scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }], 380, 'back');
  enter(s.el.querySelector('.rw-scrim'), [{ opacity: 0 }, { opacity: 1 }], 300);
  [...list.children].forEach((row, k) => enter(row, [{ transform: 'translateX(calc(var(--u) * -4))', opacity: 0 }, { transform: 'none', opacity: 1 }], 280, 'out', 200 + k * 80));
  if (ctx.autoOpenCards) {
    const ci = (ctx.rewards || []).findIndex(r => r.kind === 'cards');
    if (ci >= 0) wait(450).then(() => openCards(ci));
  }

  return {
    unmount() { bar?.destroy(); s.unmount(); },
    update(next) { if (next) Object.assign(ctx, next); bar?.update(); if (!g.busy) render(); },
  };
}
