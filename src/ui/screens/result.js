// Result: the end of a run, won or lost. A big title (FLOOR CLEARED / YOU WERE OVERRUN) over a heart-monitor line that
// keeps beating (win) or goes flat (loss), the run summary, the scrap tally counting up line by line, hints about weapons
// you can now afford, the deck and relics you ended with. Buttons: Armory, Title.
//   ctx.summary: { won, floor, kills, turns, fights?, elites?, cardsPlayed?, damageTaken?, bestHit?: { amount, card },
//                  killedBy?, seed?, deck: [CardInst], relics: [id], weapons?: { marc, yola },
//                  scrap: { before, earned, lines: [{ label, amount }] }, unlocks?: [{ weapon, text }],
//                  daily?: { label, score, best, newBest }, infection?: { level, name } (the run's, when above 0),
//                  infectionUnlocked?: { level, name, desc } }
//   act: armory(), title()

import { shell, backdrop, itemIcon, countUp, hoverSounds, ui, enter, h, icon, wait } from './common.js';
import { cardEl } from '../card.js';
import { cardView } from '../../game/content/cards.js';
import { WEAPONS } from '../../game/content/weapons.js';
import '../styles/screens-meta.css';

const BOSS_FLOOR = 16;

export function mount(root, ctx) {
  const sum = ctx.summary || {};
  const won = !!sum.won;
  const s = shell(root, 'result', { enter: 'none' });
  s.el.classList.add(won ? 'res--won' : 'res--lost');
  const act = ctx.act || {};

  const scrap = sum.scrap || { before: 0, earned: 0, lines: [] };
  const total = h('b.res-scrap__n', String(scrap.before || 0));
  const lines = h('div.res-lines');
  const hints = h('div.res-hints');

  const stat = (label, value, sub, cls = '') => h(`div.res-stat${cls}`, h('span.res-stat__v', String(value ?? '-')), h('span.res-stat__l', label), sub ? h('span.res-stat__s', sub) : null);
  const best = sum.bestHit?.amount ? sum.bestHit : null;
  let bestName = '';
  try { bestName = best?.card ? cardView(best.card).name : ''; } catch { /* unknown card */ }

  const deck = (sum.deck || []).slice().sort((a, b) => order(a) - order(b));
  const deckRow = h('div.res-deck', deck.map((c, i) => h('div.res-mini', { style: `--i:${i}`, dataset: { tip: `card:${c.id}${c.up ? ':up' : ''}` } }, cardEl(c, { size: 'grid' }))));
  const weapons = sum.weapons ? ['marc', 'yola'].map(hr => sum.weapons[hr]).filter(Boolean) : [];
  const relicRow = h('div.res-relics',
    weapons.map(id => itemIcon('weapon', id, ctx, { size: 'sm' })),
    (sum.relics || []).filter(id => !weapons.includes(id)).map(id => itemIcon('relic', id, ctx, { size: 'sm' })));

  const subtitle = won
    ? 'The elevator doors open. Floor 2 is coming soon.'
    : `${sum.killedBy ? `Brought down by the ${sum.killedBy}` : 'Brought down'} on floor ${sum.floor ?? '?'}.`;

  // the daily run's score and the Infection level, under the subtitle
  function tagsRow() {
    const d = sum.daily, inf = sum.infection;
    if (!d && !inf) return null;
    return h('div.res-tags',
      inf?.level ? h('span.res-tag.res-tag--inf', `Infection ${inf.level}${inf.name ? ' · ' + inf.name : ''}`) : null,
      d ? h('span.res-tag.res-tag--daily', h('span', { html: icon('star') }), `Daily Run · ${d.label || 'Today'}`,
        h('b', `Score ${d.score ?? 0}`),
        d.newBest ? h('em', 'New best!') : d.best != null ? h('small', `Best ${d.best}`) : null) : null);
  }

  const motes = h('div.res-motes');
  for (let i = 0; i < (won ? 30 : 12); i++) motes.append(h('i', { style: `left:${(Math.random() * 100).toFixed(1)}%;top:${(50 + Math.random() * 50).toFixed(1)}%;animation-duration:${(7 + Math.random() * 8).toFixed(1)}s;animation-delay:${(-Math.random() * 14).toFixed(1)}s;--dx:${((Math.random() - .5) * 80).toFixed(0)}px` }));
  s.el.append(
    backdrop(ctx, won ? 'title' : 'corridor', { dim: .5 }),
    h('div.res-tint'), motes,
    h('div.res-wrap',
      h('header.res-head',
        h('div.scr-kicker', won ? 'Act 1 · The hospital' : 'Run over'),
        h('h1.res-title', won ? 'Floor Cleared' : 'You Were Overrun'),
        h('div.res-ecg', { html: ecg(won) }),
        h('p.res-sub', subtitle),
        tagsRow()),
      h('div.res-mid',
        h('section.res-panel.res-run',
          h('h3.res-h', 'The run'),
          h('div.res-stats',
            stat('Floor', `${sum.floor ?? 0}`, `of ${BOSS_FLOOR}`, won ? '.res-stat--hi' : ''),
            stat('Zombies', sum.kills ?? 0),
            stat('Turns', sum.turns ?? 0),
            stat('Best hit', best ? best.amount : '-', bestName),
            stat('Elites', sum.elites ?? 0, sum.fights != null ? `${sum.fights} fights` : null),
            stat('Cards played', sum.cardsPlayed ?? '-'))),
        h('section.res-panel.res-scrap',
          h('h3.res-h', 'Scrap'),
          lines,
          h('div.res-scrap__total', h('span.res-scrap__ico', { html: icon('scrap') }), total, h('small', 'scrap')),
          hints)),
      h('div.res-bottom',
        h('div.res-carry', h('h3.res-h', `Deck · ${deck.length}`), deckRow, relicRow),
        h('div.res-btns',
          h('button.btn.big.gold', { onclick: () => { ui(ctx, 'click'); act.armory?.(); } }, h('span', { html: icon('weapon_crowbar') }), 'Armory'),
          h('button.btn.big', { onclick: () => { ui(ctx, 'click'); act.title?.(); } }, 'Title')))));

  s.cleanup(hoverSounds(ctx, s.el));

  // the beat: title slams in, stats rise, then the scrap counts up line by line
  anim0();
  async function anim0() {
    enter(s.el, [{ opacity: 0 }, { opacity: 1 }], 600);
    const t = s.el.querySelector('.res-title');
    enter(t, [{ transform: 'scale(1.5)', opacity: 0, filter: 'blur(10px)' }, { transform: 'scale(.97)', opacity: 1, filter: 'blur(0)', offset: .7 }, { transform: 'none', opacity: 1 }], 620, 'out', 150);
    [...s.el.querySelectorAll('.res-stat')].forEach((el, k) => enter(el, [{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 320, 'out', 600 + k * 70));
    enter(s.el.querySelector('.res-bottom'), [{ transform: 'translateY(20px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 400, 'out', 900);
    await wait(1000);
    let running = scrap.before || 0;
    for (const ln of scrap.lines || []) {
      if (s.gone) return;
      const row = h('div.res-line', h('span', ln.label), h('b', `+${ln.amount}`));
      lines.append(row);
      enter(row, [{ transform: 'translateX(-12px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 220, 'out');
      ui(ctx, 'coin');
      await countUp(total, running, running + ln.amount, 380);
      running += ln.amount;
      await wait(90);
    }
    const end = (scrap.before || 0) + (scrap.earned ?? (scrap.lines || []).reduce((a, l) => a + l.amount, 0));
    if (running !== end) await countUp(total, running, end, 300);
    if (!(scrap.lines || []).length && scrap.earned) lines.append(h('div.res-line', h('span', 'Earned'), h('b', `+${scrap.earned}`)));
    total.parentElement.classList.add('res-scrap__total--done');
    if (sum.infectionUnlocked && !s.gone) {
      const u = sum.infectionUnlocked;
      const hint = h('div.res-hint.res-hint--inf', h('span.res-hint__ico', { html: icon('flame') }),
        h('span', h('b', `Infection ${u.level} unlocked`), u.name ? ` · ${u.name}` : '', u.desc ? h('small', u.desc) : null));
      hints.append(hint);
      ui(ctx, 'upgrade');
      enter(hint, [{ transform: 'scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], 360, 'back');
      await wait(200);
    }
    for (const [k, u] of (sum.unlocks || []).entries()) {
      const w = WEAPONS[u.weapon];
      const hint = h('button.res-hint', { onclick: () => { ui(ctx, 'click'); act.armory?.(); } },
        itemIcon('weapon', u.weapon, ctx, { size: 'sm', tip: false }),
        h('span', u.text || `You can afford the ${w?.name || u.weapon}.`));
      hints.append(hint);
      enter(hint, [{ transform: 'scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], 320, 'back', k * 120);
    }
  }

  return { unmount: s.unmount, update() {} };
}

function order(c) {
  try { const v = cardView(c); return ({ marc: 0, yola: 100 }[v.hero] ?? 200) + ({ attack: 0, skill: 10, power: 20 }[v.type] ?? 30); } catch { return 999; }
}

/** A heart-monitor trace: steady beats when you won, beats that die into a flat line when you lost. */
function ecg(won) {
  const beat = (x) => `L${x} 30 L${x + 6} 30 L${x + 10} 22 L${x + 14} 30 L${x + 20} 30 L${x + 24} 4 L${x + 29} 52 L${x + 34} 26 L${x + 40} 30`;
  let d = 'M0 30';
  if (won) { for (let x = 20; x < 560; x += 90) d += beat(x); d += ' L600 30'; }
  else { d += beat(30) + beat(120) + 'L200 30 L216 30 L222 24 L228 34 L234 30 L600 30'; }
  return `<svg viewBox="0 0 600 56" preserveAspectRatio="none" aria-hidden="true"><path class="res-ecg__glow" d="${d}"/><path class="res-ecg__line" d="${d}"/></svg>`;
}
