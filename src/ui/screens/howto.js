// How to Play: a short modal from the title (and Settings), six little boxes instead of a manual. "Show tips again"
// replays the first-run coach (src/app/coach.js).
//   ctx: { tipsOn?: bool }
//   act: close(), replayTips()

import { shell, h, icon, closeBtn, onEscape, hoverSounds, ui, enter } from './common.js';
import '../styles/coach.css';

const ITEMS = [
  { ico: 'node_boss', c: '#ff7a66', title: 'Get to the top',
    body: 'Fight up the hospital room by room. The boss waits by the elevator at the top of the map.' },
  { ico: 'energy', c: '#ffd166', title: 'Play cards',
    body: 'Each turn: <span class="kw">3 energy</span> and 5 cards. Drag a card up to play it (or tap it twice). Its cost is in the corner.' },
  { ico: 'intent_attack', c: '#ff6a55', title: 'Read the zombies',
    body: 'The icon over a zombie is its next move. A number is the damage it will deal.' },
  { ico: 'block', c: '#6aa9d8', title: 'Block',
    body: '<span class="kw">Block</span> soaks damage until your next turn. End Turn when you’re out of energy.' },
  { ico: 'vulnerable', c: '#ff8a5c', title: 'Stagger, then cash in',
    body: '<span class="kw">Staggered</span> zombies take 50% more. <span class="m">Marc</span> staggers, <span class="y">Yola</span> cashes in.' },
  { ico: 'hp', c: '#e2574c', title: 'Every hit point counts',
    body: 'HP carries from room to room. Rest at supply closets; elites are tough but drop relics.' },
];

export function mount(root, ctx) {
  const s = shell(root, 'howto', { modal: true });
  const act = ctx.act || {};
  const close = () => { ui(ctx, 'click'); act.close?.(); };
  const replay = h('button.btn.teal', { onclick: () => { ui(ctx, 'click'); act.replayTips?.(); close(); } }, h('span', { html: icon('info'), style: { display: 'grid', width: '1.1em', height: '1.1em' } }), 'Show tips again');

  const modal = h('div.scr-modal', { role: 'dialog', 'aria-label': 'How to play' },
    h('div.scr-modal__head', h('h2', 'How to Play'), closeBtn(close)),
    h('div.scr-modal__body',
      h('div.ht-grid', ITEMS.map(it => h('div.ht-item', { style: { '--c': it.c } },
        h('span.ht-item__ico', { html: icon(it.ico) }), h('b', it.title), h('p', { html: it.body })))),
      h('div.ht-foot',
        h('span.ht-foot__note', matchMedia?.('(hover: none)').matches ? 'Press and hold anything to see what it does.' : 'Hover over anything to see what it does (or press and hold it).'),
        replay,
        h('button.btn.primary', { onclick: close }, 'Got it'))));

  s.el.append(h('div.scr-scrim', { onclick: close }), modal);
  s.cleanup(onEscape(close));
  s.cleanup(hoverSounds(ctx, s.el));
  enter(modal, [{ transform: 'translate(-50%, -46%) scale(.96)', opacity: 0 }, { transform: 'translate(-50%, -50%)', opacity: 1 }], 260, 'out');
  return { unmount: s.unmount, update() {} };
}
