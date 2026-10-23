// Run History: the last 20 runs from the profile (meta.js runLog), newest first. Each row: won / lost, the date, how
// far it got, what ended it, the two weapons, the deck size and the scrap it banked; a tap opens the detail (the deck,
// the relics, every fight with the HP it cost). A daily run shows its date tag and score, a harder Infection its level.
//   ctx: { runs: [runLog], stats?: profile.stats, studio?, audio?, infection?: [{ level, name }] }
//   act: close()

import { shell, h, icon, closeBtn, onEscape, hoverSounds, ui, enter, itemIcon } from './common.js';
import { CARDS } from '../../game/content/cards.js';
import { ENEMIES } from '../../game/content/enemies.js';
import { ENCOUNTERS } from '../../game/content/encounters.js';
import { WEAPONS } from '../../game/content/weapons.js';
import '../styles/screens-extra.css';

const BOSS_FLOOR = 16;
const SCRAP = { fight: 8, elite: 20, boss: 40, actCleared: 15 };   // meta.js SCRAP, for logs from before the tally was kept

export function mount(root, ctx) {
  const s = shell(root, 'history', { modal: true, enter: 'rise' });
  const act = ctx.act || {};
  const close = () => { ui(ctx, 'click'); act.close?.(); };
  const runs = (ctx.runs || []).slice().reverse();
  const st0 = ctx.stats || {};
  let open = -1;

  const list = h('div.hi-list', { role: 'list' });
  function render() {
    list.replaceChildren();
    if (!runs.length) {
      list.append(h('div.hi-empty', h('span', { html: icon('node_fight') }), h('b', 'No runs yet'), h('p', 'Every run you play, won or lost, shows up here.')));
      return;
    }
    runs.forEach((r, i) => list.append(row(r, i)));
  }

  function row(r, i) {
    const isOpen = i === open;
    const killer = r.won ? null : causeName(r.cause);
    const scrap = r.scrap ?? estimateScrap(r);
    const head = h('button.hi-row__head', { 'aria-expanded': String(isOpen), onclick: () => { ui(ctx, isOpen ? 'close' : 'open'); open = isOpen ? -1 : i; render(); if (open === i) list.children[i]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); } },
      h(`span.hi-badge.hi-badge--${r.won ? 'won' : 'lost'}`, r.won ? 'Won' : 'Lost'),
      h('span.hi-when', h('b', fmtDate(r.at)), h('small', fmtTime(r.at))),
      h('span.hi-floor', h('b', `Floor ${r.floor ?? 0}`), h('small', r.won ? 'Cleared the boss' : killer ? `by the ${killer}` : r.cause === 'abandoned' ? 'Abandoned' : 'Brought down')),
      h('span.hi-weapons', ['marc', 'yola'].map(hr => r.weapons?.[hr]).filter(Boolean).map(id => itemIcon('weapon', id, ctx, { size: 'sm' }))),
      h('span.hi-num', { title: 'Deck size' }, h('span', { html: icon('deck') }), String((r.deck || []).length)),
      h('span.hi-num.hi-num--scrap', { title: 'Scrap banked' }, h('span', { html: icon('scrap') }), `+${scrap}`),
      tags(r),
      h('span.hi-chev', { html: icon('arrow_down') }));
    const el = h(`div.hi-row${isOpen ? '.hi-row--open' : ''}${r.won ? '.hi-row--won' : ''}`, { role: 'listitem' }, head);
    if (isOpen) el.append(detail(r));
    return el;
  }

  function tags(r) {
    const out = [];
    if (r.daily) out.push(h('span.hi-tag.hi-tag--daily', `Daily${r.score != null ? ' · ' + r.score : ''}`));
    if (r.infection) {
      const lv = (ctx.infection || []).find(l => l.level === r.infection);
      out.push(h('span.hi-tag.hi-tag--inf', { title: lv?.name || '' }, `Infection ${r.infection}`));
    }
    return h('span.hi-tags', out);   // (always there: it holds its grid column)
  }

  function detail(r) {
    const deck = groupDeck(r.deck || []);
    const fights = r.fights || [];
    const lost = fights.reduce((t, f) => t + Math.max(0, f.hpLost || 0), 0);
    const box = h('div.hi-detail',
      h('div.hi-stats',
        stat('Zombies', r.kills ?? 0), stat('Finishers', r.finishers ?? 0), stat('Turns', r.turns ?? 0),
        stat('HP at end', r.won || r.hp ? `${r.hp ?? 0}/${r.maxHp ?? '?'}` : `0/${r.maxHp ?? '?'}`), stat('Supplies', r.gold ?? 0),
        r.seed ? stat('Seed', r.seed) : null),
      h('div.hi-cols',
        h('section.hi-sec',
          h('h4', `Deck · ${(r.deck || []).length}`),
          h('div.hi-deck', deck.map(d => h(`span.hi-card.hi-card--${d.hero || 'any'}${d.up ? '.hi-card--up' : ''}`, { dataset: { tip: `card:${d.id}${d.up ? ':up' : ''}` } },
            d.name + (d.up ? '+' : ''), d.n > 1 ? h('small', `×${d.n}`) : null))),
          (r.relics || []).length ? h('h4', `Relics · ${(r.relics || []).filter(id => !isWeaponRelic(id)).length}`) : null,
          h('div.hi-relics', (r.relics || []).filter(id => !isWeaponRelic(id)).map(id => itemIcon('relic', id, ctx, { size: 'sm' })))),
        h('section.hi-sec.hi-sec--fights',
          h('h4', `Fights · ${fights.length}`, lost ? h('small', ` ${lost} HP lost`) : null),
          fights.length ? h('ol.hi-fights', fights.map(f => {
            const enc = ENCOUNTERS[f.encounter];
            const kind = enc?.boss ? 'boss' : enc?.elite ? 'elite' : 'fight';
            return h(`li.hi-fight.hi-fight--${kind}${f.won ? '' : '.hi-fight--lost'}`,
              h('span.hi-fight__floor', `F${f.floor ?? '?'}`),
              h('span.hi-fight__ico', { html: icon(kind === 'boss' ? 'node_boss' : kind === 'elite' ? 'node_elite' : 'node_fight') }),
              h('span.hi-fight__name', enc?.name || f.encounter || 'Fight'),
              h('span.hi-fight__turns', `${f.turns ?? '?'} turn${f.turns === 1 ? '' : 's'}`),
              h('span.hi-fight__hp', f.won ? (f.hpLost > 0 ? `−${f.hpLost} HP` : 'No damage') : 'Lost'));
          })) : h('p.hi-none', 'No fights.'))));
    enter(box, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], 200, 'out');
    return box;
  }

  const stat = (label, v) => h('div.hi-stat', h('b', String(v)), h('small', label));

  const wins = st0.wins ?? runs.filter(r => r.won).length;
  s.el.append(
    h('div.scr-scrim', { onclick: close }),
    h('div.scr-modal.hi-modal', { role: 'dialog', 'aria-label': 'Run history' },
      h('div.scr-modal__head',
        h('h2', 'Run History'),
        h('span.hi-sum', `${st0.runs ?? runs.length} run${(st0.runs ?? runs.length) === 1 ? '' : 's'} · ${wins} won · best floor ${st0.bestFloor ?? Math.max(0, ...runs.map(r => r.floor || 0))} of ${BOSS_FLOOR}`),
        closeBtn(close)),
      h('div.scr-modal__body.hi-body', list,
        runs.length >= 20 ? h('p.hi-foot', 'The last 20 runs are kept.') : null)));
  render();
  s.cleanup(onEscape(close));
  s.cleanup(hoverSounds(ctx, s.el));
  enter(s.el.querySelector('.hi-modal'), [{ transform: 'translate(-50%, -46%) scale(.97)', opacity: 0 }, { transform: 'translate(-50%, -50%)', opacity: 1 }], 260, 'out');
  return { unmount: s.unmount, update() {} };
}

function causeName(cause) {
  if (!cause || cause === 'abandoned') return null;
  return ENEMIES[cause]?.name || ENCOUNTERS[cause]?.name || null;
}
const isWeaponRelic = id => !!WEAPONS[id];

/** Scrap from the fights in the log (meta.js scrapFor), for logs made before the app stored the tally. */
function estimateScrap(r) {
  let n = 0;
  for (const f of r.fights || []) {
    if (!f.won) continue;
    const e = ENCOUNTERS[f.encounter];
    n += e?.boss ? SCRAP.boss : e?.elite ? SCRAP.elite : SCRAP.fight;
  }
  return n + (r.won ? SCRAP.actCleared : 0);
}

function groupDeck(ids) {
  const m = new Map();
  for (const raw of ids) {
    const key = String(raw);
    const id = key.replace(/\+$/, ''), up = key.endsWith('+');
    const def = CARDS[id];
    const g = m.get(key) || { id, up, n: 0, name: def?.name || id, hero: def?.hero || null, type: def?.type };
    g.n++;
    m.set(key, g);
  }
  const H = { marc: 0, yola: 1 };
  return [...m.values()].sort((a, b) => (H[a.hero] ?? 2) - (H[b.hero] ?? 2) || a.name.localeCompare(b.name));
}

function fmtDate(at) {
  if (!at) return '—';
  const d = new Date(at), now = new Date();
  const day = 864e5, a = new Date(d.getFullYear(), d.getMonth(), d.getDate()), b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((b - a) / day);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
function fmtTime(at) { return at ? new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''; }
