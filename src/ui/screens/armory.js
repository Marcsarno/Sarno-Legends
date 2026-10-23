// Armory: the weapon racks, Sarno Legends' artifact system. Marc's melee tree and Yola's guns, each weapon locked, ready to
// unlock (scrap), owned or equipped. The panel on the right shows the selected weapon: its passive (a relic in the run) and
// the starter-deck swap as real cards (Bat Swing -> Nail Swing). Unlock and equip go through act; the app saves the profile
// and calls update().
//   ctx.profile: { scrap, unlocked: [weaponId], equipped: { marc, yola } }   (profile.weapons.{unlocked,equipped} also read)
//   act: unlock(weaponId) (false = didn't happen), equip(hero, weaponId), back()

import { shell, backdrop, itemIcon, stamp, countUp, hoverSounds, ui, guard, enter, h, icon, wait, onEscape, on } from './common.js';
import { artCard } from './cardgrid.js';
import { shake } from '../tween.js';
import { WEAPONS, DEFAULT_WEAPONS, weaponsFor } from '../../game/content/weapons.js';
import { STARTER } from '../../game/content/cards.js';
import { RELICS } from '../../game/content/relics.js';
import { highlightKeywords } from '../../game/text.js';
import '../styles/screens-meta.css';

const HERO = { marc: { name: 'Marc', role: 'Melee' }, yola: { name: 'Yola', role: 'Guns' } };
const TIER = ['', 'I', 'II', 'III'];

/** Read the armory part of a profile, whatever shape meta.js settles on. */
export function armoryState(profile = {}) {
  const w = profile.weapons || profile.armory || {};
  const unlocked = new Set(profile.unlocked || w.unlocked || []);
  for (const id of Object.values(DEFAULT_WEAPONS)) unlocked.add(id);
  const equipped = { ...DEFAULT_WEAPONS, ...(profile.equipped || w.equipped || profile.loadout || {}) };
  return { scrap: profile.scrap ?? 0, unlocked, equipped };
}

export function mount(root, ctx) {
  const s = shell(root, 'armory');
  const act = ctx.act || {};
  const g = guard();
  let A = armoryState(ctx.profile);
  let sel = A.equipped.marc;

  const scrapN = h('b', String(A.scrap));
  const racks = h('div.ar-racks');
  const detail = h('section.ar-detail');
  const back = () => { ui(ctx, 'click'); act.back?.(); };

  s.el.append(
    backdrop(ctx, 'storage', { dim: .55 }),
    h('div.ar-wrap',
      h('header.ar-head',
        h('button.btn.ar-back', { onclick: back }, h('span', { html: icon('arrow_up'), style: 'display:grid;width:1em;transform:rotate(-90deg)' }), 'Back'),
        h('div.ar-title', h('h1.scr-title', 'Armory'), h('p.scr-sub', 'Weapons stay unlocked between runs. Equip one for each of them before you go in.')),
        h('div.ar-scrap', { dataset: { tip: 'text:Scrap|Earned every run, win or lose: 8 a fight, 20 an elite, 40 the boss, 15 for clearing a floor.' } },
          h('span.ar-scrap__ico', { html: icon('scrap') }), scrapN, h('small', 'scrap'))),
      h('div.ar-body', racks, detail)));

  function state(w) {
    if (A.equipped[w.hero] === w.id) return 'equipped';
    if (A.unlocked.has(w.id)) return 'owned';
    if (w.requires && !A.unlocked.has(w.requires)) return 'locked';
    return 'available';
  }

  // ---- racks: a small tree per hero, tiers left to right
  function renderRacks() {
    racks.replaceChildren();
    for (const hero of ['marc', 'yola']) {
      const list = weaponsFor(hero);
      const tiers = [1, 2, 3].map(t => list.filter(w => w.tier === t));
      orderTier3(tiers);
      const cols = tiers.map((ws, t) => h('div.ar-col', h('div.ar-col__t', `Tier ${TIER[t + 1]}`), ws.map(w => tile(w))));
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('ar-links');
      const tree = h('div.ar-tree', svg, cols);
      racks.append(h(`section.ar-rack.ar-rack--${hero}`,
        h('div.ar-rack__head', h('span.ar-rack__face', { html: icon(hero) }), h('b', HERO[hero].name), h('span', HERO[hero].role)),
        tree));
    }
    requestAnimationFrame(drawLinks);
  }
  function orderTier3(tiers) {
    // keep each tier-3 weapon level with its tier-2 parent where possible
    const parentIdx = id => tiers[1].findIndex(w => w.id === WEAPONS[id].requires);
    tiers[2].sort((a, b) => parentIdx(a.id) - parentIdx(b.id));
  }

  function tile(w) {
    const st = state(w);
    const b = h(`button.ar-wpn.ar-wpn--${st}`, { dataset: { id: w.id }, onclick: () => select(w.id) },
      itemIcon('weapon', w.id, ctx, { size: 'md', tip: false }),
      h('span.ar-wpn__name', w.name),
      h('span.ar-wpn__state', st === 'equipped' ? h('span', h('i', { html: icon('check') }), 'Equipped')
        : st === 'owned' ? 'Owned'
        : st === 'locked' ? h('span', h('i', { html: icon('lock') }), WEAPONS[w.requires]?.name || 'Locked')
        : h('span.ar-cost', h('i', { html: icon('scrap') }), String(w.cost))));
    if (st === 'available' && A.scrap >= w.cost) b.classList.add('ar-wpn--afford');
    if (w.id === sel) b.classList.add('ar-wpn--sel');
    return b;
  }

  function drawLinks() {
    for (const tree of racks.querySelectorAll('.ar-tree')) {
      const svg = tree.querySelector('.ar-links');
      const box = tree.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
      svg.replaceChildren();
      for (const el of tree.querySelectorAll('.ar-wpn')) {
        const w = WEAPONS[el.dataset.id];
        if (!w.requires) continue;
        const from = tree.querySelector(`.ar-wpn[data-id="${w.requires}"]`);
        if (!from) continue;
        const a = from.getBoundingClientRect(), b = el.getBoundingClientRect();
        const x1 = a.right - box.left, y1 = a.top + a.height / 2 - box.top, x2 = b.left - box.left, y2 = b.top + b.height / 2 - box.top;
        const mx = (x1 + x2) / 2;
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`);
        p.setAttribute('class', A.unlocked.has(w.id) ? 'ar-link ar-link--on' : A.unlocked.has(w.requires) ? 'ar-link ar-link--next' : 'ar-link');
        svg.append(p);
      }
    }
  }

  // ---- detail panel
  function renderDetail() {
    const w = WEAPONS[sel];
    if (!w) { detail.replaceChildren(); return; }
    const st = state(w);
    const relic = RELICS[w.id];
    const swaps = w.swaps || [];
    const times = sw => Math.min(sw.count ?? Infinity, STARTER.filter(id => id === sw.from).length);
    const swapEls = swaps.length
      ? swaps.map(sw => h('div.ar-swap',
          h('div.ar-swap__card', artCard({ id: sw.from, up: false }, { size: 'grid' }, ctx), times(sw) > 1 ? h('span.ar-swap__x', `×${times(sw)}`) : null),
          h('span.ar-swap__arrow', { html: icon('arrow_up') }),
          h('div.ar-swap__card.ar-swap__card--to', artCard({ id: sw.to, up: false }, { size: 'grid' }, ctx), times(sw) > 1 ? h('span.ar-swap__x', `×${times(sw)}`) : null)))
      : [h('p.ar-none', 'No changes to your starting deck.')];
    let btn;
    if (st === 'equipped') btn = h('button.btn.big.ar-act', { disabled: true }, h('span', { html: icon('check') }), `Equipped for ${HERO[w.hero].name}`);
    else if (st === 'owned') btn = h('button.btn.big.teal.ar-act', { onclick: () => equip(w) }, `Equip for ${HERO[w.hero].name}`);
    else if (st === 'locked') btn = h('button.btn.big.ar-act', { disabled: true }, h('span', { html: icon('lock') }), `Unlock the ${WEAPONS[w.requires]?.name} first`);
    else {
      btn = h('button.btn.big.gold.ar-act', { onclick: () => unlock(w, btn) }, h('span', { html: icon('scrap') }), `Unlock · ${w.cost} scrap`);
      if (A.scrap < w.cost) { btn.classList.add('disabled'); btn.append(h('small.ar-need', `need ${w.cost - A.scrap} more`)); }
    }
    detail.className = `ar-detail ar-detail--${w.hero} ar-detail--${st}`;
    detail.replaceChildren(
      h('div.ar-d__top',
        h('div.ar-d__icon', itemIcon('weapon', w.id, ctx, { size: 'xl', tip: false })),
        h('div.ar-d__name',
          h('div.ar-d__meta', `${HERO[w.hero].name} · Tier ${TIER[w.tier]}`),
          h('h2', w.name),
          h('p.ar-d__blurb', w.blurb || ''))),
      h('div.ar-d__box', h('div.ar-d__label', 'Passive'), h('p', { html: highlightKeywords(relic?.text || '—') })),
      h('div.ar-d__box.ar-d__box--deck', h('div.ar-d__label', 'Starting deck'), h('div.ar-swaps', swapEls)),
      btn);
  }

  function select(id) {
    if (id === sel) return;
    ui(ctx, 'click');
    sel = id;
    for (const t of racks.querySelectorAll('.ar-wpn')) t.classList.toggle('ar-wpn--sel', t.dataset.id === id);
    renderDetail();
    enter(detail, [{ opacity: 0, transform: 'translateX(12px)' }, { opacity: 1, transform: 'none' }], 220, 'out');
  }

  async function unlock(w, btn) {
    if (g.busy) return;
    if (A.scrap < w.cost) { ui(ctx, 'deny'); shake(btn, 8); shake(s.el.querySelector('.ar-scrap'), 6); return; }
    await g.run(async () => {
      const before = A.scrap;
      const ok = act.unlock?.(w.id);
      if (ok === false) { ui(ctx, 'deny'); shake(btn, 8); return; }
      ui(ctx, 'coin');
      A = armoryState(ctx.profile);
      if (!A.unlocked.has(w.id)) { A.unlocked.add(w.id); A.scrap = before - w.cost; }
      countUp(scrapN, before, A.scrap, 600);
      renderRacks();
      renderDetail();
      const t = racks.querySelector(`.ar-wpn[data-id="${w.id}"]`);
      if (t) {
        t.classList.add('ar-wpn--new');
        const st = stamp(t, 'Unlocked', { tone: 'gold', rot: -8 });
        wait(1600).then(() => st.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).finished.then(() => st.remove()).catch(() => {}));
      }
      await wait(400);
    });
  }

  function equip(w) {
    if (g.busy) return;
    ui(ctx, 'open');
    act.equip?.(w.hero, w.id);
    A = armoryState(ctx.profile);
    if (A.equipped[w.hero] !== w.id) A.equipped[w.hero] = w.id;
    renderRacks();
    renderDetail();
    const t = racks.querySelector(`.ar-wpn[data-id="${w.id}"]`);
    t?.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }

  renderRacks();
  renderDetail();
  s.cleanup(onEscape(back));
  s.cleanup(hoverSounds(ctx, s.el));
  s.cleanup(on(window, 'resize', () => requestAnimationFrame(drawLinks)));
  [...racks.querySelectorAll('.ar-wpn')].forEach((t, k) => enter(t, [{ transform: 'translateY(14px) scale(.92)', opacity: 0 }, { transform: 'none', opacity: 1 }], 300, 'back', 80 + k * 45));
  enter(detail, [{ transform: 'translateX(24px)', opacity: 0 }, { transform: 'none', opacity: 1 }], 380, 'out', 200);
  wait(700).then(drawLinks);

  return {
    unmount: s.unmount,
    update(next) {
      if (next) Object.assign(ctx, next);
      if (g.busy) return;
      A = armoryState(ctx.profile);
      scrapN.textContent = String(A.scrap);
      renderRacks();
      renderDetail();
    },
  };
}
