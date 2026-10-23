// Card elements: the one place a card is drawn, for the hand, rewards, the shop, pile viewers and zoomed previews.
//   cardEl(cardInst, { combat?, targetUid?, size: 'hand'|'reward'|'grid'|'zoom', art?: url, studio?, cost?, upgradeDiff? }) -> HTMLElement
//   updateCardNumbers(el, combat, targetUid)   live numbers (green when buffed, red when reduced) against a target
//   setCardArt(el, url)                        swap the painted placeholder for a studio still once it's ready
//   attachStudioArt(el, studio)                the same, asking studio.cardArt(id) (cached per card id)
//   setCardCost(el, cost)                      a hand card's current cost (green when lowered, red when raised)
// Layout is in em: 1em = a tenth of the card's width (--cw), so every size scales together. Styles: styles/card.css.
// The frame is the hero's colour (Marc red, Yola teal, grey for status/curse cards), the trim is the rarity
// (steel, blue-silver, gold), the cost sits in an energy token top-left, keywords are bold and hover for tooltips.

import { cardView, HEROES } from '../game/content/cards.js';
import { STATUSES } from '../game/content/statuses.js';
import { describeCard, CARD_TYPE_LABELS } from '../game/text.js';
import { h } from './dom.js';
import { icon, hasIcon } from './icons.js';
import './styles/card.css';

// Paper grain and brush-stroke textures, painted once into small PNGs (raster images composite cheaply; SVG noise
// filters and blend modes on every card were far too slow on phones). Exposed as --card-noise / --card-brush.
let texturesReady = false;
export function cardTextures() {
  if (texturesReady || typeof document === 'undefined') return;
  texturesReady = true;
  const make = (w, hgt, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = hgt; draw(c.getContext('2d'), w, hgt); return c.toDataURL('image/png'); };
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const noise = make(128, 128, (g, w, hh) => {
    const img = g.createImageData(w, hh);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rnd(), light = v > 0.5;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 255 : 0;
      img.data[i + 3] = Math.floor(Math.abs(v - 0.5) * 2 * 70);
    }
    g.putImageData(img, 0, 0);
  });
  const brush = make(256, 160, (g, w, hh) => {
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w * 1.2 - w * 0.1, y = rnd() * hh, len = 40 + rnd() * 120, a = -0.25 + rnd() * 0.12;
      g.strokeStyle = rnd() > 0.45 ? `rgba(255,255,255,${0.05 + rnd() * 0.16})` : `rgba(0,0,0,${0.05 + rnd() * 0.18})`;
      g.lineWidth = 2 + rnd() * 9;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len * 0.5, y + Math.sin(a) * len * 0.5 + (rnd() - 0.5) * 10, x + len, y + Math.sin(a) * len); g.stroke();
    }
  });
  const root = document.documentElement.style;
  root.setProperty('--card-noise', `url(${noise})`);
  root.setProperty('--card-brush', `url(${brush})`);
}
cardTextures();

const ART_BY_ID = {
  crowbar_pry: 'weapon_crowbar', pry_loose: 'weapon_crowbar', chop_block: 'weapon_fire_axe', sledge: 'weapon_sledgehammer',
  nail_swing: 'weapon_nail_bat', barbed_swing: 'weapon_wire_bat', buckshot: 'art_shotgun', both_barrels: 'weapon_sawed_off',
  wrench_arm: 'weak', grit_teeth: 'flame', overdrive: 'flame', deep_breath: 'temp_strength', rally: 'strength',
  triage: 'art_heal', defibrillator: 'relic_defib_pads', adrenaline_shot: 'potion_adrenaline', flare: 'art_throw',
  check_mag: 'weapon_pistol', tuck_and_roll: 'art_dodge', cover_him: 'block', dig_in: 'fortify', bolt_the_door: 'fortify',
  swing_guard: 'swing_guard', slow_motion: 'slow_motion', kneecap: 'weak', suppressing_fire: 'art_pistol_burst',
  haymaker: 'art_melee_heavy', jaw_breaker: 'strength', tackle: 'art_melee_heavy', shoulder_check: 'block',
  make_it_count: 'skull', clean_kill: 'skull', headshot: 'marksman', point_blank: 'marksman', aimed_shot: 'marksman',
  panic: 'intent_unknown', bile: 'bleed', infection: 'ritual',
};

/** Which glyph paints a card's placeholder art. */
export function cardArtGlyph(view) {
  if (ART_BY_ID[view.id]) return ART_BY_ID[view.id];
  if (view.type === 'power') {
    const self = view.effects.find(e => e.op === 'apply' && e.to === 'self');
    if (self && hasIcon(self.status)) return self.status;
  }
  const a = 'art_' + (view.anim || 'none');
  return hasIcon(a) ? a : 'art_none';
}

const heroOf = view => (view.hero === 'marc' || view.hero === 'yola' ? view.hero : view.type === 'curse' ? 'curse' : 'neutral');
const trimOf = view => ({ starter: 'common', common: 'common', uncommon: 'uncommon', rare: 'rare', weapon: 'weapon' }[view.rarity] || 'status');

/**
 * Build a card element.
 * inst: CardInst { uid, id, up } (a combat card works too) or a card id string.
 */
export function cardEl(inst, opts = {}) {
  if (typeof inst === 'string') inst = { id: inst, up: false };
  const view = cardView(inst);
  const size = opts.size || 'hand';
  const hero = heroOf(view);
  const el = h(`div.card.card--${size}.card--${hero}.card--${view.type}.trim--${trimOf(view)}`, {
    dataset: { uid: inst.uid || '', id: inst.id },
  });
  if (inst.up) el.classList.add('card--up');
  if (view.cost === null || view.keywords.includes('unplayable')) el.classList.add('card--unplayable');
  el._inst = inst;
  el._view = view;

  const nameEl = h('div.card__name', h('span', view.name));
  if (view.name.length > 13) nameEl.classList.add(view.name.length > 16 ? 'card__name--xlong' : 'card__name--long');

  const artEl = h('div.card__art');
  artEl.append(placeholderArt(view, hero));
  if (opts.art) setArtImg(artEl, opts.art);
  else if (opts.studio) queueMicrotask(() => attachStudioArt(el, opts.studio));

  const typeLabel = CARD_TYPE_LABELS[view.type] || view.type;
  const textEl = h('div.card__text', h('div.card__desc'));
  el.append(
    h('div.card__frame'),
    nameEl,
    artEl,
    h('div.card__type', h('span', typeLabel)),
    textEl,
  );
  if (view.hero) el.append(h('div.card__sigil', { html: icon(view.hero), title: HEROES[view.hero]?.name || '' }));
  if (view.cost !== null && !view.keywords.includes('unplayable')) {
    el.append(h('div.card__cost', h('span.card__costnum', String(view.cost))));
  }
  writeText(el, describeCard(inst, { combat: opts.combat, targetUid: opts.targetUid, upgradeDiff: opts.upgradeDiff }));
  const cost = opts.cost !== undefined ? opts.cost : (opts.combat && inst.uid && typeof opts.combat.costOf === 'function' ? opts.combat.costOf(inst.uid) : undefined);
  if (cost !== undefined) setCardCost(el, cost);
  return el;
}

function writeText(el, html) {
  if (el._descHtml === html) return;
  el._descHtml = html;
  const desc = el.querySelector('.card__desc');
  desc.innerHTML = html;
  const len = desc.textContent.length;
  const box = el.querySelector('.card__text');
  box.classList.toggle('card__text--long', len > 62 && len <= 92);
  box.classList.toggle('card__text--xlong', len > 92);
}

function placeholderArt(view, hero) {
  const glyph = cardArtGlyph(view);
  const tint = view.type === 'power' ? (STATUSES[view.effects.find(e => e.op === 'apply')?.status]?.color || null) : null;
  return h('div.card__ph', { style: tint ? { '--ph-accent': tint } : null },
    h('div.card__ph-paint'),
    h('div.card__ph-glyph', { html: icon(glyph) }),
    h('div.card__ph-grain'),
  );
}

function setArtImg(artEl, url) {
  let img = artEl.querySelector('img');
  if (!img) {
    img = h('img', { alt: '', draggable: false, decoding: 'async' });
    img.addEventListener('load', () => artEl.classList.add('card__art--img'));
    artEl.append(img);
  }
  img.src = url;
}

const artCache = new Map();
/** Ask the studio for a card's still (cached per card id) and drop it into the element when it's ready. */
export function attachStudioArt(el, studio) {
  if (!el || !studio?.cardArt || !el._inst) return;
  const id = el._inst.id;
  let pr = artCache.get(id);
  if (!pr) { pr = Promise.resolve().then(() => studio.cardArt(id)).catch(() => null); artCache.set(id, pr); }
  pr.then(url => { if (url) setCardArt(el, url); });
}

/** Use a studio still in the art window (keeps the placeholder underneath until the image has loaded). */
export function setCardArt(el, url) {
  const art = el?.querySelector('.card__art');
  if (art && url) setArtImg(art, url);
}

/** Show a card's current cost. Lower than printed = green, higher = red; null hides the token. */
export function setCardCost(el, cost) {
  const tok = el.querySelector('.card__cost');
  if (!tok) return;
  const base = el._view.cost;
  const n = tok.querySelector('.card__costnum');
  if (cost === null || cost === undefined) { tok.hidden = true; return; }
  tok.hidden = false;
  if (n.textContent !== String(cost)) n.textContent = String(cost);
  tok.classList.toggle('cost--down', cost < base);
  tok.classList.toggle('cost--up', cost > base);
  el._cost = cost;
}

/** Re-render the card text with live numbers against a target (or none). Cheap when nothing changed. */
export function updateCardNumbers(el, combat, targetUid) {
  if (!el || !el._inst) return;
  writeText(el, describeCard(el._inst, { combat, targetUid }));
}

/** A face-down card (shuffle animations, pile buttons). */
export function cardBack(size = 'hand') {
  return h(`div.card.card--${size}.card--back`, h('div.card__backface', h('div.card__backmark', { html: icon('intent_heal') })));
}
