// Shift Change: the run-start bonus. Three option cards, pick one (a Slay the Spire Neow, simplified). The pick stamps
// TAKEN, the others fade, then act.choose(i). The framing line is a placeholder until Marc writes it.
//   ctx.options: [{ id, label, desc (html ok), icon?: icons.js name, hero?: 'marc'|'yola', cost?: drawback text }]
//   act: choose(i)

import { shell, backdrop, stamp, hoverSounds, ui, guard, enter, h, icon, wait } from './common.js';
import { highlightKeywords } from '../../game/text.js';
import '../styles/screens.css';

// a glyph for an option from its id / kind ('max_hp', 'remove_card', 'pick_yola', ...)
const ICON_RULES = [[/hp|heal/, 'heart'], [/remove/, 'exhaust'], [/upgrade/, 'arrow_up'], [/transform/, 'flame'], [/relic/, 'relic'],
  [/gold|suppl/, 'supplies'], [/marc/, 'marc'], [/yola/, 'yola'], [/rare/, 'star'], [/potion/, 'potion']];
const iconFor = o => o.icon || ICON_RULES.find(([re]) => re.test(`${o.id || ''} ${o.kind || ''}`))?.[1] || (o.hero || 'star');

export function mount(root, ctx) {
  const s = shell(root, 'intro');
  const act = ctx.act || {};
  const g = guard();
  const opts = ctx.options || [];

  const cards = opts.map((o, i) => {
    const ico = iconFor(o);
    const hero = o.hero || (/marc/.test(o.id || '') ? 'marc' : /yola/.test(o.id || '') ? 'yola' : null);
    const cls = hero ? `.intro-opt--${hero}` : o.cost ? '.intro-opt--risk' : '';
    return h(`button.intro-opt${cls}`, { onclick: () => choose(i) },
      h('span.intro-opt__tag', `Option ${i + 1}`),
      h('span.intro-opt__ico', { html: icon(ico) }),
      h('span.intro-opt__name', o.label || o.title || o.name || ''),
      h('span.intro-opt__desc', { html: highlightKeywords(o.desc || o.text || '') }),
      o.cost ? h('span.intro-opt__cost', o.cost) : null);
  });

  s.el.append(
    backdrop(ctx, 'er_lobby', { dim: .45 }),
    h('div.intro-wrap',
      h('div.intro-head',
        h('div.scr-kicker', 'Before the first floor'),
        h('h2.scr-title', 'Shift Change'),
        h('div.scr-rule'),
        h('p.scr-sub', ctx.line || 'The night shift left a few things behind. Take one.')),
      h('div.intro-opts', cards),
      h('div.intro-foot', 'Pick one to start the run.')));

  async function choose(i) {
    if (g.busy) return;
    await g.run(async () => {
      ui(ctx, 'open');
      cards.forEach((c, k) => { c.disabled = true; if (k !== i) c.classList.add('intro-opt--gone'); });
      stamp(cards[i], 'Taken', { tone: 'gold', rot: -10 });
      await wait(650);
      act.choose?.(i);
    });
  }

  s.cleanup(hoverSounds(ctx, s.el));
  enter(s.el.querySelector('.intro-head'), [{ transform: 'translateY(-16px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 500, 'out', 100);
  cards.forEach((c, k) => enter(c, [{ transform: 'translateY(50px) rotate(' + ((k - 1) * 4) + 'deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], 480, 'back', 300 + k * 110));
  return { unmount: s.unmount, update() {} };
}
