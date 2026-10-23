// Rest site, the Supply Closet: a calm moment between fights. Two big choices: Rest (heal, with the HP bar showing where
// you'd end up) or Patch Up (upgrade a card: opens the picker with a before / after preview). After the choice the
// room settles, the result shows, and Continue leaves.
//   ctx: { run: { hp, maxHp, deck }, heal?: number (default 30% of max HP, rounded down), rested?: 'rest'|'upgrade' }
//   act: rest(), upgrade(uid), leave()

import { shell, backdrop, topbar, hoverSounds, ui, guard, enter, floatText, st, h, icon, wait } from './common.js';
import { mount as mountPicker } from './picker.js';
import { artCard } from './cardgrid.js';
import { isUpgradable, cardView } from '../../game/content/cards.js';
import { tweenValue } from '../tween.js';
import '../styles/screens-rooms.css';

export function mount(root, ctx) {
  const s = shell(root, 'rest');
  const act = ctx.act || {};
  const g = guard();
  const run = ctx.run;
  const heal = ctx.heal ?? Math.floor((run?.maxHp || 80) * 0.3);
  const upgradable = (run?.deck || []).filter(isUpgradable);
  let picker = null, pickerHost = null;

  const bar = topbar(ctx, s.el);
  const motes = h('div.rs-motes');
  for (let i = 0; i < 18; i++) motes.append(h('i', { style: { left: (10 + Math.random() * 80) + '%', top: (20 + Math.random() * 70) + '%', animationDuration: (10 + Math.random() * 10) + 's', animationDelay: (-Math.random() * 18) + 's' } }));

  // HP preview bar
  const after = Math.min(run.maxHp, run.hp + heal);
  const hpFill = h('i.rs-hp__fill', { style: { width: pct(run.hp) } });
  const hpGain = h('i.rs-hp__gain', { style: { left: pct(run.hp), width: pct(after - run.hp) } });
  const hpText = h('span.rs-hp__text', `${run.hp} / ${run.maxHp}`);
  const hpBar = h('div.rs-hp', hpGain, hpFill, hpText);
  function pct(v) { return (100 * v / run.maxHp).toFixed(2) + '%'; }

  const restBtn = h('button.rs-choice.rs-choice--rest', { onclick: () => doRest() },
    h('span.rs-choice__glow'),
    h('span.rs-choice__ico', { html: icon('heart') }),
    h('span.rs-choice__name', 'Rest'),
    h('span.rs-choice__desc', 'Heal ', h('b.num-up', `${heal} HP`)),
    hpBar,
    h('span.rs-choice__note', run.hp >= run.maxHp ? 'Already at full HP.' : `${run.hp} → ${after} HP`));
  const upBtn = h('button.rs-choice.rs-choice--up', { onclick: () => doUpgrade() },
    h('span.rs-choice__glow'),
    h('span.rs-choice__ico', { html: icon('arrow_up') }),
    h('span.rs-choice__name', 'Patch Up'),
    h('span.rs-choice__desc', 'Upgrade a card'),
    h('span.rs-choice__cards', upgradable.slice(0, 3).map((c, i) => h('i', { class: 'rs-mini rs-mini--' + (cardHero(c)), style: st({ '--i': i }) }))),
    h('span.rs-choice__note', upgradable.length ? `${upgradable.length} card${upgradable.length === 1 ? '' : 's'} can be upgraded` : 'Nothing left to upgrade.'));
  if (!upgradable.length) upBtn.disabled = true;

  const choices = h('div.rs-choices', restBtn, upBtn);
  const result = h('div.rs-result');
  const cont = h('button.btn.big.primary.rs-continue', { onclick: () => { ui(ctx, 'click'); act.leave?.(); } }, 'Continue');
  cont.hidden = true;
  const head = h('div.rs-head', h('div.scr-kicker', 'Supply Closet'), h('h2.scr-title', 'A Quiet Minute'), h('p.scr-sub', 'The door holds. Take one thing before you move on.'));

  s.el.append(backdrop(ctx, 'supply_closet', { dim: .2 }), h('div.rs-warm'), motes,
    h('div.rs-wrap', head, choices, result, cont));

  function settle(chosen) {
    s.el.classList.add('rs--done');
    for (const b of [restBtn, upBtn]) { b.disabled = true; if (b !== chosen) b.classList.add('rs-choice--gone'); }
    chosen.classList.add('rs-choice--chosen');
  }

  async function doRest() {
    await g.run(async () => {
      ui(ctx, 'open');
      settle(restBtn);
      const from = run.hp;
      act.rest?.();
      const to = Math.min(run.maxHp, Math.max(run.hp, from + heal));
      hpGain.style.opacity = '0';
      floatText(restBtn, `+${to - from} HP`, { tone: 'good', dy: -90 });
      await tweenValue(from, to, 1100, v => { hpFill.style.width = pct(v); hpText.textContent = `${Math.round(v)} / ${run.maxHp}`; });
      bar?.update();
      head.querySelector('.scr-sub').textContent = 'You catch your breath.';
      showContinue();
    });
  }

  function doUpgrade() {
    if (g.busy || picker) return;
    ui(ctx, 'click');
    const host = h('div.rs-pickhost');
    s.el.append(host);
    pickerHost = host;
    picker = mountPicker(host, {
      ...ctx, cards: run.deck.filter(isUpgradable), mode: 'upgrade', topbar: false,
      act: {
        choose: uid => { closePicker(); finishUpgrade(uid); },
        cancel: () => closePicker(),
      },
    });
  }
  function closePicker() { const p = picker, host = pickerHost; picker = pickerHost = null; p?.unmount(); wait(400).then(() => host?.remove()); }

  async function finishUpgrade(uid) {
    await g.run(async () => {
      const inst = run.deck.find(c => c.uid === uid);
      settle(upBtn);
      act.upgrade?.(uid);
      ui(ctx, 'open');
      if (inst) {
        const card = artCard({ ...inst, up: true }, { size: 'reward', upgradeDiff: true }, ctx);
        const wrap = h('div.rs-upcard', card, h('span.rs-glintbox', h('i.rs-glint')));
        result.append(wrap);
        enter(wrap, [{ transform: 'translateY(30px) scale(.7) rotate(-6deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], 480, 'back');
        choices.classList.add('rs-choices--away');
      }
      head.querySelector('.scr-sub').textContent = 'Taped, tightened, ready.';
      await wait(500);
      showContinue();
    });
  }

  function showContinue() {
    cont.hidden = false;
    enter(cont, [{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 320, 'out');
    cont.focus({ preventScroll: true });
  }

  // a done state when the app re-mounts after the choice
  if (ctx.rested) { settle(ctx.rested === 'upgrade' ? upBtn : restBtn); showContinue(); }

  s.cleanup(hoverSounds(ctx, s.el));
  enter(head, [{ transform: 'translateY(-14px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 500, 'out', 100);
  enter(restBtn, [{ transform: 'translateY(40px) scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], 460, 'back', 260);
  enter(upBtn, [{ transform: 'translateY(40px) scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], 460, 'back', 360);

  return {
    unmount() { picker?.unmount(); bar?.destroy(); s.unmount(); },
    update(next) { if (next) Object.assign(ctx, next); bar?.update(); },
  };
}

function cardHero(c) {
  try { return cardView(c).hero || 'neutral'; } catch { return 'neutral'; }
}
