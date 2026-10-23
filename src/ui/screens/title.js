// Title screen: the painted ER behind, the SARNO (red) LEGENDS (teal) logo and the menu on the right, the scrap count and
// version in the corner. The center-left stays clear: the app stands live 3D Marc and Yola there.
//   ctx: { hasSave, save?: { floor, hp, maxHp, daily? }, profile: { scrap }, version, rooms, audio,
//          daily?: { label: 'Oct 23', best: number | null } (the Daily Run button; none without the engine's daily seed),
//          a2hs?: bool (iPhone Safari tab: the one-time Add to Home Screen hint) }
//   act: continue(), newRun(), daily(), armory(), settings(), howTo(), history(), collection(), dismissA2hs()
//   (with a save, New Run and Daily Run need a second tap: they abandon that run)

import { shell, backdrop, hoverSounds, ui, st, h, icon, anim, wait, enter } from './common.js';

export function mount(root, ctx) {
  const s = shell(root, 'title', { enter: 'none' });

  const logo = h('h1.ttl-logo', { 'aria-label': 'Sarno Legends' },
    h('span.ttl-logo__line.ttl-logo__a', { dataset: { t: 'SARNO' } }, h('span', 'SARNO')),
    h('span.ttl-logo__line.ttl-logo__b.ttl-logo__line--flick', { dataset: { t: 'LEGENDS' } }, h('span', 'LEGENDS')));

  const btn = (cls, ico, label, note, fn) => h(`button.ttl-btn${cls}`, {
    onclick: () => { ui(ctx, 'click'); fn?.(); },
  }, h('span.ttl-btn__ico', { html: icon(ico) }), h('span', label), note ? h('span.ttl-btn__note', note) : null);

  // the menu and the scrap chip are rebuilt on update() (a reset profile or an abandoned run changes them)
  const menu = h('nav.ttl-menu');
  const scrapN = h('span');
  // New Run (or the Daily Run) over a saved run abandons it: the first tap asks, a second tap within a few seconds goes
  let armed = 0, armedFor = null;
  function confirmThen(which, fn) {
    if (ctx.hasSave && armedFor !== which) {
      ui(ctx, 'deny');
      clearTimeout(armed);
      armedFor = which;
      armed = setTimeout(() => { armed = 0; armedFor = null; renderMenu(); }, 3500);
      renderMenu();
      menu.querySelector(`[data-act="${which}"]`)?.focus({ preventScroll: true });
      return;
    }
    clearTimeout(armed); armed = 0; armedFor = null;
    fn?.();
  }
  const tapAgain = ['Tap again', h('br'), 'to abandon it'];
  const small = (cls, ico, label, fn, aria) => h(`button.ttl-btn.ttl-btn--sm${cls}`, {
    onclick: () => { ui(ctx, 'click'); fn?.(); }, 'aria-label': aria || label, title: aria || label,
  }, h('span.ttl-btn__ico', { html: icon(ico) }), label ? h('span', label) : null);
  function renderMenu() {
    const scrap = ctx.profile?.scrap ?? 0;
    const save = ctx.save || ctx.saveInfo;
    const contNote = save ? [save.daily ? 'Daily · ' : '', `Floor ${save.floor ?? '?'}`, h('br'), save.hp != null ? `${save.hp}/${save.maxHp} HP` : ''] : null;
    const d = ctx.daily;
    const dailyBtn = d ? btn('.ttl-btn--daily', 'star', 'Daily Run',
      armedFor === 'daily' ? tapAgain : [d.label || 'Today', h('br'), d.best != null ? `Best ${d.best}` : 'Not played'],
      () => confirmThen('daily', () => ctx.act?.daily?.())) : null;
    if (dailyBtn) dailyBtn.dataset.act = 'daily';
    const newBtn = btn('.ttl-btn--primary', 'swords', ctx.hasSave ? 'New Run' : 'Start a Run', armedFor === 'new' ? tapAgain : null, () => confirmThen('new', () => ctx.act?.newRun?.()));
    newBtn.dataset.act = 'new';
    menu.replaceChildren(...[   // (replaceChildren would print a null as the text "null")
      ctx.hasSave ? btn('.ttl-btn--cont', 'arrow_up', 'Continue', contNote, () => ctx.act?.continue?.()) : null,
      newBtn,
      h('div.ttl-row', dailyBtn, btn('', 'weapon_wood_bat', 'Armory', h('span.gold-c', `${scrap} scrap`), () => ctx.act?.armory?.())),
      h('div.ttl-row.ttl-row--sm',
        small('', 'node_fight', 'Runs', () => ctx.act?.history?.(), 'Run history'),
        small('', 'deck', 'Cards', () => ctx.act?.collection?.(), 'Collection'),
        small('.ttl-btn--help.ttl-btn--icon', 'info', null, () => ctx.act?.howTo?.(), 'How to Play'),
        small('.ttl-btn--icon', 'settings', null, () => ctx.act?.settings?.(), 'Settings'))].filter(Boolean));
    scrapN.textContent = String(scrap);
  }
  renderMenu();

  const dust = h('div.ttl-dust');
  for (let i = 0; i < 26; i++) {
    const d = h('i', { style: st({
      left: (5 + Math.random() * 60) + '%', top: (40 + Math.random() * 60) + '%',
      animationDuration: (9 + Math.random() * 12) + 's', animationDelay: (-Math.random() * 20) + 's',
      '--dx': ((Math.random() - .5) * 120) + 'px', scale: (.5 + Math.random()).toFixed(2),
    }) });
    dust.append(d);
  }

  s.el.append(
    backdrop(ctx, 'title', { dim: 0 }),
    h('div.ttl-glow'), h('div.ttl-siren'), dust, h('div.ttl-shade'),
    h('div.ttl-right', logo, h('div.ttl-tag', h('i'), 'A hospital roguelike', h('i')), menu),
    h('div.ttl-foot',
      h('span.ttl-scrap', { 'data-tip': 'text:Scrap|Earned every run, win or lose. Spend it in the Armory on new weapons.' },
        h('span', { html: icon('scrap') }), scrapN, h('small', 'SCRAP')),
      h('span', ctx.version ? 'v' + String(ctx.version).replace(/^v/, '') : '')),
  );
  s.cleanup(hoverSounds(ctx, s.el));
  s.cleanup(() => clearTimeout(armed));

  // iPhone Safari wipes a site's saved data after 7 days without a visit; a home-screen app keeps it. Shown once.
  if (ctx.a2hs) {
    const share = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
    const tip = h('div.ttl-a2hs', { role: 'note' },
      h('span.ttl-a2hs__ico', { html: share }),
      h('div.ttl-a2hs__text', h('b', 'Add Sarno Legends to your Home Screen'),
        h('span', 'It keeps your progress safe and plays full screen. Tap ', h('i', { html: share }), ' Share, then ', h('em', 'Add to Home Screen'), '.')),
      h('button.ttl-a2hs__ok', { onclick: () => { ui(ctx, 'click'); tip.classList.add('ttl-a2hs--gone'); ctx.act?.dismissA2hs?.(); setTimeout(() => tip.remove(), 300); } }, 'Got it'));
    s.el.append(tip);
    enter(tip, [{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 420, 'out', 1100);
  }

  // entrance: logo slams in, the menu slides after it
  anim(s.el, [{ opacity: 0 }, { opacity: 1 }], 500, 'out');
  const [a, b] = logo.children;
  enter(a, [{ transform: 'translateX(8%) scale(1.15)', opacity: 0, filter: 'blur(8px)' }, { transform: 'none', opacity: 1, filter: 'blur(0)' }], 520, 'out');
  enter(b, [{ transform: 'translateX(-6%)', opacity: 0 }, { transform: 'none', opacity: 1 }], 520, 'out', 120);
  [...menu.children].forEach((el, i) => {
    enter(el, [{ transform: 'translateX(calc(var(--u) * 6))', opacity: 0 }, { transform: 'none', opacity: 1 }], 360, 'out', 320 + i * 70);
  });
  wait(500).then(() => menu.querySelector('button')?.focus({ preventScroll: true }));

  return { unmount: s.unmount, update(next) { if (next) Object.assign(ctx, next); renderMenu(); } };
}
