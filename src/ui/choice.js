// A card choice in the middle of a fight ("Discard a card", "Choose 2 cards to Exhaust", "Put a card from your discard
// pile on top"): the cards big over the dimmed battle, tap to pick n of them, then Confirm (or Skip when it's optional).
// The engine pauses on combat.state.choice = { kind, n, from, uids, prompt, optional } until combat.choose(uids).
//   const c = openChoice({ root, choice, cards: [CardInst], studio?, audio?, onConfirm(uids), onSkip?() })
//   c.close()   c.el
// Nothing is sent until Confirm; the overlay closes itself after it.

import { h } from './dom.js';
import { anim, ms } from './tween.js';
import { icon } from './icons.js';
import { cardEl, setCardArt } from './card.js';
import { bindTips, hideTip } from './tooltip.js';
import './styles/screens-extra.css';

const FROM = { hand: 'your hand', draw: 'your draw pile', discard: 'your discard pile', exhaust: 'the exhausted cards' };
const VERB = { discard: 'discard', exhaust: 'exhaust', upgrade: 'upgrade', retain: 'keep', top: 'put on top', copy: 'copy', return: 'take back' };

export function openChoice({ root, choice, cards, studio = null, audio = null, onConfirm, onSkip }) {
  const n = Math.max(1, Math.min(choice.n || 1, cards.length || 1));
  const optional = !!choice.optional;
  const picked = [];
  const verb = VERB[choice.kind] || 'choose';
  const prompt = choice.prompt || `Choose ${n === 1 ? 'a card' : n + ' cards'} to ${verb}${choice.from && choice.from !== 'hand' ? ` from ${FROM[choice.from] || choice.from}` : ''}.`;

  const count = h('span.ch-count');
  const confirm = h('button.btn.big.gold.ch-ok', { type: 'button', onclick: () => done() }, h('span', { html: icon('check'), style: 'display:grid;width:1em;height:1em' }), 'Confirm');
  const skip = optional ? h('button.btn.big.ch-skip', { type: 'button', onclick: () => { if (closed) return; audio?.ui?.('click'); close(); onSkip ? onSkip() : onConfirm?.([]); } }, 'Skip') : null;
  const row = h('div.ch-cards', { role: 'listbox', 'aria-multiselectable': String(n > 1) });
  const el = h('div.ch', { role: 'dialog', 'aria-label': prompt },
    h('div.ch-scrim'),
    h('div.ch-panel',
      h('div.ch-head', h('div.ch-kicker', choice.from && choice.from !== 'hand' ? `From ${FROM[choice.from] || choice.from}` : 'From your hand'), h('h2.ch-prompt', prompt)),
      row,
      h('div.ch-foot', count, skip, confirm)));
  if (cards.length > 5) row.classList.add('ch-cards--many');
  if (cards.length > 8) row.classList.add('ch-cards--lots');

  cards.forEach((inst, i) => {
    const card = cardEl(inst, { size: 'reward' });
    if (studio?.cardArt) Promise.resolve().then(() => studio.cardArt(inst.id)).then(url => url && setCardArt(card, url)).catch(() => {});
    const cell = h('button.ch-cell', { type: 'button', role: 'option', 'aria-selected': 'false', dataset: { uid: inst.uid, tip: `card:${inst.id}${inst.up ? ':up' : ''}`, tipSide: 'top' },
      onclick: () => toggle(inst.uid, cell) }, card, h('span.ch-mark', { html: icon('check') }));
    row.append(cell);
    // (no fill forwards: the CSS lifts a picked card with transform)
    cell.animate?.([{ opacity: 0, transform: 'translateY(30px) scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: ms(260), delay: ms(i * 40), easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'backwards' });
  });

  function toggle(uid, cell) {
    if (closed) return;
    const at = picked.indexOf(uid);
    if (at >= 0) picked.splice(at, 1);
    else {
      if (picked.length >= n) {
        if (n !== 1) { audio?.ui?.('deny'); anim(count, [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], 240); return; }
        picked.length = 0;   // one to pick: tapping another swaps
      }
      picked.push(uid);
    }
    audio?.ui?.('card');
    paint();
  }
  const need = () => (optional ? picked.length >= 1 : picked.length === n);
  function paint() {
    for (const c of row.children) {
      const on = picked.includes(c.dataset.uid);
      c.classList.toggle('ch-cell--on', on);
      c.setAttribute('aria-selected', String(on));
    }
    count.textContent = n === 1 ? (picked.length ? '' : 'Tap a card') : `${picked.length} / ${n} chosen`;
    confirm.disabled = !need();
  }
  let closed = false;
  function done() {
    if (closed || !need()) return;
    audio?.ui?.('select');
    const uids = picked.slice();
    close();
    onConfirm?.(uids);
  }
  function close() {
    if (closed) return;
    closed = true;
    hideTip();
    unbind();
    removeEventListener('keydown', onKey, true);
    el.style.pointerEvents = 'none';
    anim(el, [{ opacity: 1 }, { opacity: 0 }], 160).then(() => el.remove());
  }
  const onKey = e => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(); }
    else if (/^[1-9]$/.test(e.key) && row.children[+e.key - 1]) { e.preventDefault(); e.stopPropagation(); row.children[+e.key - 1].click(); }
    else if (e.key === 'e' || e.key === 'E') e.stopPropagation();   // not End Turn while choosing
  };
  addEventListener('keydown', onKey, true);
  for (const ev of ['pointerdown', 'pointerup', 'pointermove']) el.addEventListener(ev, e => e.stopPropagation());
  root.append(el);
  const unbind = bindTips(el);
  anim(el.querySelector('.ch-scrim'), [{ opacity: 0 }, { opacity: 1 }], 220);
  anim(el.querySelector('.ch-head'), [{ opacity: 0, transform: 'translateY(-12px)' }, { opacity: 1, transform: 'none' }], 260, 'out');
  paint();
  return { el, close, get open() { return !closed; } };
}
