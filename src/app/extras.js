// The app's own corners of the profile (meta.js keeps unknown top-level fields as they are, like profile.coach):
//   profile.seen = { cards: { id: 1 }, relics: { id: 1 }, potions: { id: 1 } }   every item ever offered, found or owned
//                                                                                (the Collection screen's silhouettes)
//   profile.ui = { warnEndTurn?: bool, a2hs?: 'dismissed' }   UI preferences that aren't game settings
//   noteSeen(profile, run) -> bool (anything new)     called on every run save: the deck, relics, potions, a reward's
//                                                     card offers / relic / potion, the shop's shelves, an opened chest
//   warnEndTurn(profile) -> bool   "End turn with energy left?": on for the first 3 runs unless the player set it
//   isIOSSafariTab() -> bool       an iPhone / iPad browser tab (not the home-screen app): the Add to Home Screen hint
import { CARDS } from '../game/content/cards.js';
import { RELICS } from '../game/content/relics.js';
import { POTIONS } from '../game/content/potions.js';

export const WARN_RUNS = 3;

export function seenOf(profile) {
  let s = profile.seen;
  if (!s || typeof s !== 'object') s = profile.seen = {};
  for (const k of ['cards', 'relics', 'potions']) if (!s[k] || typeof s[k] !== 'object') s[k] = {};
  return s;
}
export function uiOf(profile) {
  if (!profile.ui || typeof profile.ui !== 'object') profile.ui = {};
  return profile.ui;
}

export function noteSeen(profile, run) {
  if (!profile || !run) return false;
  const s = seenOf(profile);
  let changed = false;
  const mark = (kind, table, id) => { if (id && table[id] && !s[kind][id]) { s[kind][id] = 1; changed = true; } };
  const card = c => mark('cards', CARDS, typeof c === 'string' ? c : (c?.card?.id || c?.id));
  for (const c of run.deck || []) card(c);
  for (const r of run.relics || []) mark('relics', RELICS, r?.id || r);
  for (const id of run.potions || []) mark('potions', POTIONS, id);
  const p = run.pending;
  if (p) {
    for (const r of p.rewards || []) {
      if (r.kind === 'cards') (r.cards || []).forEach(card);
      else if (r.kind === 'relic') mark('relics', RELICS, r.id);
      else if (r.kind === 'potion') mark('potions', POTIONS, r.id);
    }
    if (p.kind === 'treasure' && p.opened) mark('relics', RELICS, p.relic);
    if (p.picker?.mode === 'pick') (p.picker.cards || []).forEach(card);
  }
  const shop = run.screen === 'shop' ? run.shop : null;
  if (shop) {
    for (const it of shop.cards || []) card(it);
    for (const it of shop.relics || []) mark('relics', RELICS, it.id);
    for (const it of shop.potions || []) mark('potions', POTIONS, it.id);
  }
  return changed;
}

export function warnEndTurn(profile) {
  const v = uiOf(profile).warnEndTurn;
  return typeof v === 'boolean' ? v : (profile.stats?.runs || 0) < WARN_RUNS;
}

export function isIOSSafariTab() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  const standalone = navigator.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches);
  return !standalone;
}
