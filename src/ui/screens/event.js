// Event, a "?" locked room: the painted room behind, a panel with the title, the text and the choices. Each choice shows
// what it costs (red) and what it gives (green). Picking one calls act.choose(i); the app answers with the outcome step
// (new text, result chips, a single Continue) through update(). When a step needs a card (remove / upgrade / transform /
// pick), ctx.event.picker opens the picker and its answer goes to act.pickCard(uid).
//   ctx.event: { id, title, text (html ok), room: painter room key, choices: [{ label, desc?, disabled?, reason? }],
//                result?: [{ text, tone: 'good'|'bad'|'' }], done?: bool,
//                picker?: { mode, cards, title?, sub?, cancelable? } }
//   act: choose(i), pickCard(uid | null)

import { shell, backdrop, topbar, hoverSounds, ui, guard, enter, h, icon, wait, anim, on } from './common.js';
import { mount as mountPicker } from './picker.js';
import { highlightKeywords } from '../../game/text.js';
import '../styles/screens-rooms.css';

const BAD = /\b(lose|lost|pay|costs?|curse|infection|wakes?|fight|damage|bleed|hurt)\b/i;
const GOOD = /\b(gain|heal|get|gets|remove|upgrade|transform|relic|potion|supplies|card|max hp|choose|find|obtain|add)\b/i;
const CHANCE = /\d+\s*%/;

/** Split a choice description into coloured pieces: costs red, rewards green, odds gold. */
export function toneParts(desc) {
  if (!desc) return [];
  if (Array.isArray(desc)) return desc.map(p => (typeof p === 'string' ? { text: p, tone: toneOf(p) } : p));
  return String(desc).split(/(?<=[.!])\s+/).filter(Boolean).map(t => ({ text: t, tone: toneOf(t) }));
}
function toneOf(t) {
  if (BAD.test(t)) return 'bad';
  if (CHANCE.test(t) && !GOOD.test(t)) return 'odds';
  if (GOOD.test(t)) return 'good';
  return '';
}

export function mount(root, ctx) {
  const s = shell(root, 'event');
  const act = ctx.act || {};
  const g = guard();
  let ev = ctx.event || {};
  let picker = null, pickerFor = null, pickerHost = null;

  const bar = topbar(ctx, s.el);
  const bg = h('div.ev-bg');
  const title = h('h2.ev-title');
  const text = h('div.ev-text');
  const result = h('div.ev-result');
  const choices = h('div.ev-choices');
  const panel = h('div.ev-panel',
    h('div.scr-kicker.ev-kicker', h('span', { html: icon('node_event') }), 'Locked room'),
    title, h('div.scr-rule'), text, result, choices);
  s.el.append(bg, h('div.ev-shade'), h('div.ev-wrap', panel));

  let room = null;
  function setRoom(key) {
    if (key === room) return;
    room = key;
    const old = bg.firstChild;
    const b = backdrop(ctx, key || 'corridor', { dim: .05 });
    bg.append(b);
    if (old) anim(old, [{ opacity: 1 }, { opacity: 0 }], 600).then(() => old.remove());
  }

  function render(first) {
    ev = ctx.event || {};
    setRoom(ev.room);
    const changed = title.textContent !== (ev.title || '') || text.dataset.src !== (ev.text || '');
    title.textContent = ev.title || '';
    text.dataset.src = ev.text || '';
    text.innerHTML = paragraphs(ev.text || '');
    result.replaceChildren(...(ev.result || []).map(r => h(`span.ev-chip.ev-chip--${r.tone || 'n'}`, r.text)));
    choices.replaceChildren();
    (ev.choices || []).forEach((c, i) => choices.append(choiceEl(c, i)));
    if (!first && changed) {
      enter(text, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 360, 'out');
      [...result.children].forEach((c, k) => enter(c, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], 320, 'back', 150 + k * 90));
    }
    [...choices.children].forEach((c, k) => enter(c, [{ opacity: 0, transform: 'translateX(calc(var(--u) * 4))' }, { opacity: 1, transform: 'none' }], 300, 'out', (first ? 420 : 200) + k * 70));
    syncPicker();
  }

  function choiceEl(c, i) {
    const parts = toneParts(c.desc);
    const b = h('button.ev-choice', { onclick: () => choose(i, b), disabled: !!c.disabled },
      h('span.ev-choice__key', String(i + 1)),
      h('span.ev-choice__body',
        h('span.ev-choice__label', c.label || '...'),
        parts.length ? h('span.ev-choice__desc', parts.map(p => h(`span.ev-tone.ev-tone--${p.tone || 'n'}`, { html: highlightKeywords(p.text) + ' ' }))) : null,
        c.disabled && c.reason ? h('span.ev-choice__reason', c.reason) : null));
    if (ev.done || (ev.choices || []).length === 1) b.classList.add('ev-choice--go');
    return b;
  }

  async function choose(i, b) {
    const c = ev.choices?.[i];
    if (!c || c.disabled || g.busy || picker) return;
    await g.run(async () => {
      ui(ctx, 'click');
      b.classList.add('ev-choice--picked');
      for (const o of choices.children) if (o !== b) o.classList.add('ev-choice--dim');
      await wait(160);
      act.choose?.(i);
    });
    bar?.update();
  }

  function syncPicker() {
    const p = ev.picker;
    if (p && pickerFor !== p) {
      picker?.unmount();
      pickerFor = p;
      const host = h('div.rs-pickhost');
      s.el.append(host);
      pickerHost = host;
      picker = mountPicker(host, {
        ...ctx, cards: p.cards || ctx.run?.deck || [], mode: p.mode || 'pick', title: p.title, sub: p.sub, topbar: false,
        cancelable: p.cancelable === true, filter: p.filter,
        act: {
          choose: uid => { closePicker(); act.pickCard?.(uid); },
          cancel: () => { closePicker(); act.pickCard?.(null); },
        },
      });
    } else if (!p && picker) closePicker();
  }
  function closePicker() { const pk = picker, host = pickerHost; picker = pickerHost = null; pickerFor = null; pk?.unmount(); wait(400).then(() => host?.remove()); }

  // number keys pick choices
  s.cleanup(on(window, 'keydown', e => {
    if (picker || !/^[1-9]$/.test(e.key)) return;
    const b = choices.children[+e.key - 1];
    if (b && !b.disabled) b.click();
  }));
  s.cleanup(hoverSounds(ctx, s.el));

  render(true);
  enter(panel, [{ opacity: 0, transform: 'translateX(calc(var(--u) * 6))' }, { opacity: 1, transform: 'none' }], 420, 'out', 80);

  return {
    unmount() { picker?.unmount(); bar?.destroy(); s.unmount(); },
    update(next) { if (next) Object.assign(ctx, next); bar?.update(); render(false); },
  };
}

function paragraphs(t) {
  const html = String(t);
  if (/<p[ >]/.test(html)) return html;
  return html.split(/\n{2,}|\n/).filter(Boolean).map(p => `<p>${highlightKeywords(p)}</p>`).join('');
}
