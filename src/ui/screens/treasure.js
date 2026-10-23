// Treasure, a supply crate: a locked crate in the storage room. Tap it: the padlock rattles and drops, the lid pops, light
// spills out and the relic and supplies rise. Take them (they fly to the bar), then Continue.
//   ctx: { treasure: { relic: id, gold: n, opened?, taken? } }   (the app may fill relic/gold only after act.open())
//   act: open(), take(), leave()

import { shell, backdrop, topbar, itemIcon, relicName, flyTo, flyClone, barTarget, hoverSounds, ui, guard, enter, h, icon, anim } from './common.js';
import { RELICS } from '../../game/content/relics.js';
import { RARITY_LABELS } from '../../game/text.js';
import '../styles/screens-rooms.css';

export function mount(root, ctx) {
  const s = shell(root, 'treasure');
  const act = ctx.act || {};
  const g = guard();
  let opened = !!ctx.treasure?.opened;
  let taken = !!ctx.treasure?.taken;

  const bar = topbar(ctx, s.el);
  const crate = h('button.tr-crate', { 'aria-label': 'Open the crate', onclick: () => open() }, h('div.tr-rays'), h('div.tr-art', { html: crateSvg() }));
  const loot = h('div.tr-loot');
  const prompt = h('div.tr-prompt', 'Tap the crate to open it');
  const takeBtn = h('button.btn.big.gold.tr-take', { onclick: () => take() }, h('span', { html: icon('arrow_down') }), 'Take');
  const cont = h('button.btn.big.primary.tr-cont', { onclick: () => { ui(ctx, 'click'); act.leave?.(); } }, 'Continue');
  takeBtn.hidden = cont.hidden = true;

  s.el.append(backdrop(ctx, 'storage', { dim: .3 }), h('div.tr-pool'),
    h('div.tr-wrap',
      h('div.tr-stage', h('div.tr-head', h('div.scr-kicker', 'Storage'), h('h2.scr-title', 'Supply Crate'), h('p.scr-sub', 'Somebody locked this up and never came back for it.')), loot, crate),
      prompt, h('div.tr-btns', takeBtn, cont)));

  function lootEls() {
    const t = ctx.treasure || {};
    loot.replaceChildren();
    if (t.relic) {
      const r = RELICS[t.relic];
      loot.append(h('div.tr-item.tr-item--relic', { dataset: { tip: `relic:${t.relic}`, tipSide: 'right' } },
        itemIcon('relic', t.relic, ctx, { size: 'xl', tip: false }),
        h('div.tr-item__name', relicName(t.relic)),
        h('div.tr-item__sub', RARITY_LABELS[r?.rarity] || 'Relic'),
        h('div.tr-item__text', { html: r?.text || '' })));
    }
    if (t.gold) {
      loot.append(h('div.tr-item.tr-item--gold',
        h('span.rw-coin.tr-coin', { html: icon('supplies') }),
        h('div.tr-item__name', h('b.gold-c', String(t.gold)), ' Supplies')));
    }
  }

  async function open() {
    if (opened || g.busy) return;
    await g.run(async () => {
      ui(ctx, 'click');
      const lock = crate.querySelector('.tr-lock');
      await anim(lock, [{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(12deg)' }, { transform: 'rotate(-8deg)' }, { transform: 'rotate(0)' }], 360, 'linear');
      act.open?.();
      opened = true;
      showOpen(true);
    });
  }

  function showOpen(animate) {
    crate.classList.add('tr-crate--open');
    s.el.classList.add('tr--open');
    crate.disabled = true;
    prompt.hidden = true;
    lootEls();
    if (animate) {
      ui(ctx, 'open');
      const lock = crate.querySelector('.tr-lock');
      anim(lock, [{ transform: 'translateY(0) rotate(0)', opacity: 1 }, { transform: 'translateY(140%) rotate(40deg)', opacity: 0 }], 520, 'in');
      crate.querySelector('.tr-lid').animate([{ transform: 'translateY(0) scaleY(1) rotate(0)' }, { transform: 'translateY(-90%) scaleY(.8) rotate(-5deg)', offset: .4 }, { transform: 'translateY(-58%) scaleY(.55) rotate(-2deg)' }], { duration: 560, easing: 'cubic-bezier(.2,.9,.25,1)' });
      [...loot.children].forEach((el, k) => enter(el, [{ transform: 'translateY(70%) scale(.4)', opacity: 0 }, { transform: 'translateY(-8%) scale(1.06)', opacity: 1, offset: .7 }, { transform: 'none', opacity: 1 }], 620, 'out', 260 + k * 160));
    }
    if (!taken) { takeBtn.hidden = false; if (animate) enter(takeBtn, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], 300, 'out', 700); }
    else cont.hidden = false;
  }

  async function take() {
    if (taken || g.busy) return;
    await g.run(async () => {
      taken = true;
      takeBtn.hidden = true;
      const t = ctx.treasure || {};
      ui(ctx, 'coin');
      const jobs = [];
      const relicEl = loot.querySelector('.tr-item--relic .scr-item');
      const goldEl = loot.querySelector('.tr-coin');
      if (relicEl) jobs.push(flyClone(relicEl, barTarget('relic'), { scale: .35 }));
      if (goldEl) jobs.push(flyTo(goldEl, barTarget('gold'), { count: Math.max(5, Math.min(12, Math.round((t.gold || 20) / 3))), stagger: 40 }));
      act.take?.();
      for (const el of loot.children) anim(el, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-20px) scale(.9)' }], 420, 'in');
      await Promise.all(jobs);
      bar?.update();
      cont.hidden = false;
      enter(cont, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], 300, 'out');
      cont.focus({ preventScroll: true });
    });
  }

  if (opened) showOpen(false);
  s.cleanup(hoverSounds(ctx, s.el));
  enter(crate, [{ transform: 'translateY(-30px) scale(.9)', opacity: 0 }, { transform: 'translateY(4px) scale(1.02)', opacity: 1, offset: .7 }, { transform: 'none', opacity: 1 }], 520, 'out', 120);

  return {
    unmount() { bar?.destroy(); s.unmount(); },
    update(next) {
      if (next) Object.assign(ctx, next);
      bar?.update();
      if (ctx.treasure?.opened && !opened) { opened = true; showOpen(true); }
      else if (opened && !g.busy && !taken) lootEls();
    },
  };
}

/** The crate: olive-drab supply box with a stencilled red cross, steel corners, a hasp and a padlock. */
function crateSvg() {
  return `<svg viewBox="0 0 320 240" aria-hidden="true">
  <defs>
    <linearGradient id="trBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d7350"/><stop offset=".55" stop-color="#4f5539"/><stop offset="1" stop-color="#2f3322"/></linearGradient>
    <linearGradient id="trLid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#848b62"/><stop offset="1" stop-color="#555b3d"/></linearGradient>
    <linearGradient id="trSteel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8dcdc"/><stop offset=".5" stop-color="#8b9293"/><stop offset="1" stop-color="#4b5152"/></linearGradient>
    <linearGradient id="trGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d27a"/><stop offset="1" stop-color="#a87a22"/></linearGradient>
    <radialGradient id="trGlow" cx=".5" cy="1" r=".8"><stop offset="0" stop-color="#fff2c0" stop-opacity=".95"/><stop offset=".5" stop-color="#ffcf6a" stop-opacity=".5"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
    <pattern id="trPlank" width="320" height="26" patternUnits="userSpaceOnUse"><rect width="320" height="26" fill="none"/><path d="M0 25.5H320" stroke="#00000055" stroke-width="1.5"/><path d="M0 1H320" stroke="#ffffff14" stroke-width="1"/></pattern>
  </defs>
  <ellipse cx="160" cy="226" rx="150" ry="12" fill="#000" opacity=".55"/>
  <g class="tr-inside"><rect x="26" y="92" width="268" height="26" fill="#1a1c12"/><rect x="26" y="70" width="268" height="60" fill="url(#trGlow)" class="tr-light"/></g>
  <g class="tr-body">
    <rect x="22" y="100" width="276" height="120" rx="6" fill="url(#trBody)"/>
    <rect x="22" y="100" width="276" height="120" rx="6" fill="url(#trPlank)"/>
    <rect x="22" y="100" width="276" height="120" rx="6" fill="none" stroke="#1d2014" stroke-width="3"/>
    <g fill="#b3261e" opacity=".85"><rect x="146" y="128" width="28" height="72" rx="2"/><rect x="124" y="150" width="72" height="28" rx="2"/></g>
    <g fill="none" stroke="#e9e1c8" stroke-opacity=".35" stroke-width="1.2" stroke-dasharray="3 4"><rect x="118" y="122" width="84" height="84" rx="4"/></g>
    <text x="64" y="205" font-family="Oswald, sans-serif" font-size="13" letter-spacing="3" fill="#e9e1c8" fill-opacity=".45">MED-04</text>
    <path d="M22 106 h28 v-6 h-22 a6 6 0 0 0 -6 6z M298 106 h-28 v-6 h22 a6 6 0 0 1 6 6z M22 214 h28 v6 h-22 a6 6 0 0 1 -6 -6z M298 214 h-28 v6 h22 a6 6 0 0 0 6 -6z" fill="url(#trSteel)"/>
    <rect x="22" y="100" width="12" height="120" fill="url(#trSteel)" opacity=".8"/><rect x="286" y="100" width="12" height="120" fill="url(#trSteel)" opacity=".8"/>
    <rect x="146" y="98" width="28" height="24" rx="3" fill="url(#trSteel)" stroke="#2a2e2f" stroke-width="1.5"/>
  </g>
  <g class="tr-lid">
    <rect x="14" y="66" width="292" height="40" rx="7" fill="url(#trLid)" stroke="#1d2014" stroke-width="3"/>
    <rect x="14" y="66" width="292" height="12" rx="6" fill="#ffffff12"/>
    <rect x="14" y="66" width="16" height="40" rx="4" fill="url(#trSteel)" opacity=".85"/><rect x="290" y="66" width="16" height="40" rx="4" fill="url(#trSteel)" opacity=".85"/>
    <rect x="148" y="86" width="24" height="26" rx="3" fill="url(#trSteel)" stroke="#2a2e2f" stroke-width="1.5"/>
    <circle cx="160" cy="104" r="4" fill="#23272a"/>
  </g>
  <g class="tr-lock">
    <path d="M148 118 v-14 a12 12 0 0 1 24 0 v14" fill="none" stroke="url(#trSteel)" stroke-width="5"/>
    <rect x="140" y="116" width="40" height="34" rx="6" fill="url(#trGold)" stroke="#5c4310" stroke-width="2"/>
    <circle cx="160" cy="130" r="4.5" fill="#3a2a08"/><rect x="158.4" y="131" width="3.2" height="9" rx="1.5" fill="#3a2a08"/>
  </g>
</svg>`;
}
