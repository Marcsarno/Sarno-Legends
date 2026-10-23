// Title screen: the painted ER behind, the SARNO (red) LEGENDS (teal) logo and the menu on the right, the scrap count and
// version in the corner. The center-left stays clear: the app stands live 3D Marc and Yola there.
//   ctx: { hasSave, save?: { floor, hp, maxHp }, profile: { scrap }, version, rooms, audio }
//   act: continue(), newRun(), armory(), settings()   (with a save, New Run needs a second tap: it abandons that run)

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
  // New Run over a saved run abandons it: the first tap asks, a second tap within a few seconds starts the new run
  let armed = 0;
  function newRun() {
    if (ctx.hasSave && !armed) {
      ui(ctx, 'deny');
      armed = setTimeout(() => { armed = 0; renderMenu(); }, 3500);
      renderMenu();
      menu.querySelector('.ttl-btn--primary')?.focus({ preventScroll: true });
      return;
    }
    clearTimeout(armed); armed = 0;
    ctx.act?.newRun?.();
  }
  function renderMenu() {
    const scrap = ctx.profile?.scrap ?? 0;
    const save = ctx.save || ctx.saveInfo;
    const contNote = save ? [`Floor ${save.floor ?? '?'}`, h('br'), save.hp != null ? `${save.hp}/${save.maxHp} HP` : ''] : null;
    menu.replaceChildren(...[   // (replaceChildren would print a null as the text "null")
      ctx.hasSave ? btn('.ttl-btn--cont', 'arrow_up', 'Continue', contNote, () => ctx.act?.continue?.()) : null,
      btn('.ttl-btn--primary', 'swords', ctx.hasSave ? 'New Run' : 'Start a Run', armed ? ['Tap again to', h('br'), 'abandon the saved run'] : null, newRun),
      btn('', 'weapon_wood_bat', 'Armory', h('span.gold-c', `${scrap} scrap`), () => ctx.act?.armory?.()),
      btn('', 'settings', 'Settings', null, () => ctx.act?.settings?.())].filter(Boolean));
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
