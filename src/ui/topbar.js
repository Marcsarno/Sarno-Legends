// The top bar, shared by combat and every non-combat screen: Marc + Yola portraits with the shared HP, supplies,
// potion slots, floor, deck / map / settings buttons, and the relic tray under it (equipped weapons first).
//   const bar = createTopBar({ root, getRun, onDeck, onMap, onSettings, onPotion, studio?, live?, canUsePotion? })
//   bar.update()              re-read the run (cheap; numbers tween when they change)
//   bar.flashRelic(id)        a relic just did something
//   bar.potionEl(slot)        the slot element (targeting starts from it)
//   bar.destroy()
// onPotion(slot, action, el): action 'use' | 'discard'. Tapping a potion opens a small Use / Discard menu; Use only
// shows when canUsePotion(slot, potionId) says yes (in combat: it's your turn; outside combat: never by default).
// live() may override what the run says (in combat: { hp, maxHp, potions, relics } from the fight).

import { RELICS, weaponRelics } from '../game/content/relics.js';
import { POTIONS } from '../game/content/potions.js';
import { h, clamp } from './dom.js';
import { anim, tweenValue, popIn } from './tween.js';
import { icon, relicGlyph, potionGlyph } from './icons.js';
import { hideTip } from './tooltip.js';
import './styles/hud.css';

export const POTION_COLOR = {
  medkit: '#e2574c', adrenaline: '#ffd166', extinguisher: '#e0483c', flashbang: '#d9e2e6', energy_drink: '#8fe05a',
  body_armor: '#6aa9d8', pipe_bomb: '#e3843b', protein_shake: '#d8b98a', painkiller_pills: '#b8d4f0', epi_pen: '#f0b63c',
};
export const RELIC_TINT = { starter: '#efe6d2', common: '#d7dde2', uncommon: '#9fd0f5', rare: '#f2c55e', shop: '#9fe07a' };

export function createTopBar({ root, getRun, onDeck, onMap, onSettings, onPotion, studio = null, live = null, canUsePotion = null }) {
  const run = () => (getRun ? getRun() : null) || {};
  const faces = ['marc', 'yola'].map(id => {
    const f = h(`div.tb__face.tb__face--${id}`, { html: icon(id) });
    studio?.portrait?.(id)?.then(url => { if (url) { f.style.backgroundImage = `url(${url})`; f.classList.add('tb__face--img'); } }).catch(() => {});
    return f;
  });
  const hpNum = h('span.tb__val', '0/0');
  const hp = h('div.tb__stat.tb__hp', { dataset: { tip: 'text:Shared HP|Marc and Yola share one HP bar. If it reaches 0, the run is over.' } }, h('span.tb__ico', { html: icon('hp') }), hpNum);
  const goldNum = h('span.tb__val', '0');
  const gold = h('div.tb__stat.tb__gold', { dataset: { tip: 'text:Supplies|Spend them in the Pharmacy.' } }, h('span.tb__ico', { html: icon('supplies') }), goldNum);
  const potWrap = h('div.tb__potions');
  const floorNum = h('span.tb__floornum', '1');
  const floor = h('div.tb__floor', { dataset: { tip: 'text:Floor|How far up the hospital you are. The boss waits at the top.' } }, h('span.tb__floorlbl', 'Floor'), floorNum);
  const deckCount = h('span.tb__badge', '0');
  const btn = (name, label, fn, extra) => h(`button.tb__btn.tb__btn--${name}`, { 'aria-label': label, dataset: { tip: `text:${label}` }, onclick: e => { e.stopPropagation(); hideTip(); fn?.(); } }, h('span', { html: icon(name) }), extra);
  const right = h('div.tb__right',
    onMap !== null ? btn('map', 'Map', onMap) : null,
    btn('deck', 'Deck', onDeck, deckCount),
    btn('settings', 'Settings', onSettings));
  const bar = h('div.tb',
    h('div.tb__left', h('div.tb__heroes', { dataset: { tip: 'text:Marc and Yola|One deck, one HP bar. Red cards are Marc\'s, teal cards are Yola\'s.' } }, faces), hp, gold, potWrap),
    h('div.tb__mid', floor),
    right);
  const relics = h('div.tb__relics');
  const el = h('div.tbwrap', bar, relics);
  root.append(el);

  let shown = { hp: null, maxHp: null, gold: null, floor: null, deck: null, potions: '', relics: '' };
  let menu = null;
  const tweens = { hp: 0, gold: 0 };

  function data() {
    const r = run();
    const o = (live && live()) || {};
    const relicList = o.relics || [
      ...weaponRelics(r.weapons || {}).map(id => ({ id, counter: 0, weapon: true })),
      ...(r.relics || []).filter(x => !weaponRelics(r.weapons || {}).includes(x.id || x)).map(x => (typeof x === 'string' ? { id: x, counter: 0 } : x)),
    ];
    return {
      hp: o.hp ?? r.hp ?? 0, maxHp: o.maxHp ?? r.maxHp ?? 0, gold: o.gold ?? r.gold ?? 0,
      floor: o.floor ?? r.floor ?? 0, deck: o.deckCount ?? (r.deck ? r.deck.length : 0),
      potions: o.potions || r.potions || [null, null, null], relics: relicList,
    };
  }

  function update() {
    const d = data();
    if (d.hp !== shown.hp || d.maxHp !== shown.maxHp) {
      const from = shown.hp ?? d.hp;
      if (shown.hp !== null && d.hp !== from) {
        hp.classList.remove('tb--up', 'tb--down'); void hp.offsetWidth; hp.classList.add(d.hp < from ? 'tb--down' : 'tb--up');
        const id = ++tweens.hp;
        tweenValue(from, d.hp, 450, v => { if (tweens.hp === id) hpNum.textContent = `${Math.round(v)}/${d.maxHp}`; });
      } else hpNum.textContent = `${d.hp}/${d.maxHp}`;
      hp.classList.toggle('tb__hp--low', d.maxHp > 0 && d.hp / d.maxHp <= 0.3);
      shown.hp = d.hp; shown.maxHp = d.maxHp;
    }
    if (d.gold !== shown.gold) {
      const from = shown.gold ?? d.gold;
      if (shown.gold !== null && from !== d.gold) {
        gold.classList.remove('tb--up', 'tb--down'); void gold.offsetWidth; gold.classList.add(d.gold < from ? 'tb--down' : 'tb--up');
        const id = ++tweens.gold;
        tweenValue(from, d.gold, 500, v => { if (tweens.gold === id) goldNum.textContent = String(Math.round(v)); });
      } else goldNum.textContent = String(d.gold);
      shown.gold = d.gold;
    }
    if (d.floor !== shown.floor) { floorNum.textContent = d.floor >= 16 ? 'Boss' : String(Math.max(1, d.floor)); shown.floor = d.floor; }
    if (d.deck !== shown.deck) { deckCount.textContent = String(d.deck); if (shown.deck !== null) popIn(deckCount, 240); shown.deck = d.deck; }
    const pk = d.potions.join(',');
    if (pk !== shown.potions) { renderPotions(d.potions); shown.potions = pk; }
    const rk = d.relics.map(r => `${r.id}:${r.counter ?? 0}`).join(',');
    if (rk !== shown.relics) { renderRelics(d.relics, shown.relics); shown.relics = rk; }
  }

  function renderPotions(list) {
    const before = [...potWrap.children].map(c => c.dataset.id || '');
    potWrap.replaceChildren();
    list.forEach((id, i) => {
      const p = POTIONS[id];
      const slot = h('button.tb__potion', { dataset: { slot: i, id: id || '', tip: `potion:${id || ''}` }, 'aria-label': p ? p.name : 'Empty potion slot' });
      if (p) {
        slot.style.setProperty('--pc', POTION_COLOR[id] || '#efe6d2');
        slot.innerHTML = icon(potionGlyph(id));
        slot.classList.add('tb__potion--full');
        if (before[i] !== id) popIn(slot, 320);
      } else slot.innerHTML = '<span class="tb__potion-empty"></span>';
      slot.addEventListener('click', e => { e.stopPropagation(); if (p) openMenu(i, id, slot); });
      potWrap.append(slot);
    });
  }

  function openMenu(slot, id, slotEl) {
    closeMenu();
    hideTip();
    const p = POTIONS[id];
    const usable = p.usable !== false && (canUsePotion ? canUsePotion(slot, id) : false);
    const m = h('div.tb__menu',
      h('div.tb__menu-name', p.name),
      usable ? h('button.tb__menu-btn.tb__menu-btn--use', { onclick: e => { e.stopPropagation(); closeMenu(); onPotion?.(slot, 'use', slotEl); } }, 'Use') : null,
      h('button.tb__menu-btn', { onclick: e => { e.stopPropagation(); closeMenu(); onPotion?.(slot, 'discard', slotEl); } }, 'Discard'));
    el.append(m);
    const r = slotEl.getBoundingClientRect(), er = el.getBoundingClientRect();
    m.style.left = `${clamp(r.left + r.width / 2 - er.left - m.offsetWidth / 2, 4, innerWidth - m.offsetWidth - 4)}px`;
    m.style.top = `${r.bottom - er.top + 6}px`;
    popIn(m, 180);
    menu = m;
    setTimeout(() => addEventListener('pointerdown', outside, true), 0);
  }
  const outside = e => { if (menu && !menu.contains(e.target)) closeMenu(); };
  function closeMenu() { if (menu) { menu.remove(); menu = null; } removeEventListener('pointerdown', outside, true); }

  function renderRelics(list, prevKey) {
    const had = new Set(String(prevKey || '').split(',').filter(Boolean).map(s => s.split(':')[0]));
    relics.replaceChildren();
    for (const r of list) {
      const def = RELICS[r.id];
      if (!def) continue;
      const weapon = def.rarity === 'weapon';
      const b = h(`div.tb__relic${weapon ? '.tb__relic--weapon' : ''}`, {
        dataset: { id: r.id, tip: `relic:${r.id}:${r.counter ?? 0}`, tipSide: 'bottom' },
        style: { '--rc': weapon ? (def.hero === 'yola' ? '#2fa39a' : '#c8483a') : (RELIC_TINT[def.rarity] || '#d7dde2') },
        html: icon(relicGlyph(r.id)),
      });
      if (r.counter === -1) b.classList.add('tb__relic--used');
      if (def.counterMax || (r.counter > 0 && !weapon)) b.append(h('span.tb__relic-count', String(Math.max(0, r.counter || 0))));
      relics.append(b);
      if (prevKey && !had.has(r.id)) popIn(b, 360);
    }
  }

  function flashRelic(id) {
    const b = relics.querySelector(`[data-id="${id}"]`);
    if (!b) return;
    anim(b, [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.45) rotate(-8deg)', filter: 'brightness(2.2)', offset: .3 }, { transform: 'scale(1)', filter: 'brightness(1)' }], 520, 'out');
    const ring = h('span.tb__relic-ring');
    b.append(ring);
    anim(ring, [{ transform: 'scale(.6)', opacity: 1 }, { transform: 'scale(2.2)', opacity: 0 }], 600, 'out').then(() => ring.remove());
  }

  update();
  return {
    el, update, flashRelic, closeMenu,
    potionEl: slot => potWrap.children[slot] || null,
    hpEl: hp,
    destroy() { closeMenu(); el.remove(); },
  };
}
