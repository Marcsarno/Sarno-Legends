// Inline SVG icons. icon(name, { size, color, title }) returns an SVG string; iconEl() returns an element.
// Glyphs sit on a 24x24 grid, drawn with currentColor so CSS can tint them; darker cut-outs use a translucent black.
// Owner: the UI kit. Other modules only call icon(); an unknown name renders a neutral dot (never throws).
// Names (see BUILD_SPEC.md):
//   intents   intent_attack, intent_attack_block, intent_attack_debuff, intent_attack_buff, intent_block, intent_buff,
//             intent_block_buff, intent_debuff, intent_heal, intent_sleep, intent_stun, intent_unknown
//   statuses  every id in content/statuses.js (vulnerable, weak, frail, strength, dexterity, bleed, ritual, plating, ...)
//   map       node_fight, node_elite, node_rest, node_shop, node_event, node_treasure, node_boss
//   HUD       hp, block, energy, supplies, scrap, potion, relic, deck, draw, discard, exhaust, map, settings, lock, check,
//             close, marc, yola, skull, star, arrow_up, arrow_down, end_turn, info, flame, card_attack, card_skill, card_power
//   items     weapon_<weapon id> (wood_bat, nail_bat, wire_bat, crowbar, fire_axe, sledgehammer, pistol, shotgun, sawed_off),
//             relic_<relic id>, potion_<potion id>; relicGlyph(id) / potionGlyph(id) pick the right one.
//   card art  art_<anim> placeholders (melee_light, melee_heavy, pistol, shotgun, block, dodge, heal, buff, debuff, throw)

const f = n => +n.toFixed(2);

// ---- small shape builders (everything still ends up as plain path data on the 24 grid) ----

/** A tapered, slightly curved slash from a to b (claw marks). */
function slash(ax, ay, bx, by, w = 2.4, bend = 1.2) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
  const nx = -dy / L, ny = dx / L;
  return `<path d="M${f(ax)} ${f(ay)}Q${f(mx + nx * (bend + w))} ${f(my + ny * (bend + w))} ${f(bx)} ${f(by)}Q${f(mx + nx * (bend - w))} ${f(my + ny * (bend - w))} ${f(ax)} ${f(ay)}z"/>`;
}
/** A straight bar from a to b, width wa at a and wb at b, round ends. */
function taper(ax, ay, bx, by, wa, wb) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  const p = (x, y, w, s) => `${f(x + nx * w * s)} ${f(y + ny * w * s)}`;
  return `<path d="M${p(ax, ay, wa / 2, 1)}L${p(bx, by, wb / 2, 1)}A${f(wb / 2)} ${f(wb / 2)} 0 0 0 ${p(bx, by, wb / 2, -1)}L${p(ax, ay, wa / 2, -1)}A${f(wa / 2)} ${f(wa / 2)} 0 0 0 ${p(ax, ay, wa / 2, 1)}z"/>`;
}
/** A star polygon: points, outer radius, inner radius. */
function star(cx, cy, R, r, n = 5, rot = -90) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (rot + i * 180 / n) * Math.PI / 180, rr = i % 2 ? r : R;
    pts.push(`${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`);
  }
  return `<path d="M${pts.join('L')}z"/>`;
}
/** A gear: teeth around a ring with a hole. */
function gear(cx, cy, R, r, teeth, hole) {
  const pts = [];
  const step = Math.PI * 2 / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    for (const [da, rr] of [[-0.3, r], [-0.18, R], [0.18, R], [0.3, r]]) {
      pts.push(`${f(cx + Math.cos(a + da * step * 1.6) * rr)} ${f(cy + Math.sin(a + da * step * 1.6) * rr)}`);
    }
  }
  return `<path fill-rule="evenodd" d="M${pts.join('L')}zM${f(cx + hole)} ${cy}a${hole} ${hole} 0 1 0 ${-hole * 2} 0a${hole} ${hole} 0 1 0 ${hole * 2} 0z"/>`;
}
const g = (t, body) => `<g transform="${t}">${body}</g>`;
const cut = (body, o = '.55') => `<g fill="#000" fill-opacity="${o}">${body}</g>`;
const line = (d, w = 1.8, extra = '') => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const cutLine = (d, w = 1.4) => `<path d="${d}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** A small badge in the corner of a compound glyph, outlined so it reads on top. */
const badge = body => `<g stroke="#000" stroke-opacity=".6" stroke-width="2.2" paint-order="stroke" stroke-linejoin="round">${body}</g>`;

// ---- shared parts ----
const SHIELD = 'M12 2 4 5v6.5c0 5 3.4 9.1 8 10.5 4.6-1.4 8-5.5 8-10.5V5l-8-3z';
const CLAW = slash(3.4, 18.2, 13.6, 2.6, 2.7) + slash(7.6, 21, 18.4, 4.2, 2.9) + slash(12.6, 22, 21.2, 8.8, 2.5);
const CHEV_UP = '<path d="M12 2 21 11h-5.2L12 7.2 8.2 11H3z"/><path d="M12 10.5 21 19.5h-5.2L12 15.7l-3.8 3.8H3z"/>';
const CHEV_DOWN = '<path d="M12 22 3 13h5.2l3.8 3.8 3.8-3.8H21z"/><path d="M12 13.5 3 4.5h5.2l3.8 3.8 3.8-3.8H21z"/>';
const CROSS = '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>';
const ZZ = '<path d="M2 9h9.5v2.4L5.6 18h5.9v2.4H2V18l5.9-6.6H2z"/><path d="M13 3h8v2l-4.8 5.2H21v2h-8v-2l4.8-5.2H13z"/>';
const QMARK = '<path d="M12 2.5c-3.7 0-6.2 2.2-6.5 5.6h3.6c.2-1.5 1.3-2.5 2.9-2.5s2.8 1 2.8 2.4c0 1.2-.6 1.8-2 2.8-1.8 1.2-2.6 2.5-2.6 4.7v.7h3.4v-.5c0-1.3.4-1.9 2-3 1.8-1.3 3-2.7 3-4.9 0-3.3-2.8-5.3-6.6-5.3zM10.1 18h3.8v3.6h-3.8z"/>';
const FIST = '<path d="M7 9.6a1.9 1.9 0 0 1 3.8 0v-.9a1.9 1.9 0 0 1 3.8 0v.5a1.9 1.9 0 0 1 3.8 0v.8a1.9 1.9 0 0 1 2.1 1.9v4.3c0 3.5-2.8 6.3-6.3 6.3h-2.4A6.3 6.3 0 0 1 7 18.2z"/><path d="M3.6 13.2c0-1.4 1.1-2.4 2.4-2.4h4.6v2.6c0 1.4-1.1 2.5-2.5 2.5H6c-1.3 0-2.4-1.2-2.4-2.7z"/>' + cutLine('M10.8 9.6v2.4M14.6 9.2v2.6M18.4 10.1v2.2', 1);
const SKULL = '<path d="M12 2C6.9 2 3 5.7 3 10.4c0 2.8 1.4 5 3.5 6.4V20a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3.2c2.1-1.4 3.5-3.6 3.5-6.4C21 5.7 17.1 2 12 2z"/>' + cut('<circle cx="8.6" cy="11.6" r="2.3"/><circle cx="15.4" cy="11.6" r="2.3"/><path d="M12 14.2l1.3 2.4h-2.6z"/><path d="M9.5 19h1.2v3H9.5zM13.3 19h1.2v3h-1.2z"/>', '.6');
const HORNS = '<path d="M5.2 6.2C2.6 5.4 1.4 3.2 1.6.9 3.1 3 5 3.4 7.4 3.6z"/><path d="M18.8 6.2c2.6-.8 3.8-3 3.6-5.3-1.5 2.1-3.4 2.5-5.8 2.7z"/>';
const DROP = '<path d="M12 2.2c3.4 4.8 6.8 8.9 6.8 12.6a6.8 6.8 0 0 1-13.6 0c0-3.7 3.4-7.8 6.8-12.6z"/>';
const FLAME = '<path d="M12.6 1.8c.9 3.8-1.4 5.7-3.2 7.7C7.8 11.2 6.6 13.2 6.6 15.6a5.4 5.4 0 0 0 10.8 0c0-1.5-.5-2.9-1.4-4-.3 1.4-1.1 2.4-2.2 2.9.9-4.2-.1-9.1-1.2-12.7z"/>';
const CARD = (x, y, r = 0) => `<rect x="${x}" y="${y}" width="11" height="15" rx="1.8" transform="rotate(${r} ${x + 5.5} ${y + 7.5})"/>`;
const VEST = '<path d="M8 2.5h2.2c.3 1.4 1 2.1 1.8 2.1s1.5-.7 1.8-2.1H16l4 3.2-1.5 4.3V20c0 .9-.7 1.5-1.5 1.5H7c-.8 0-1.5-.6-1.5-1.5V10L4 5.7z"/>' + cutLine('M12 7.5v14M8.2 12.5h2.2M13.6 12.5h2.2M8.2 16h2.2M13.6 16h2.2', 1.1);
const KIT = '<path d="M9 3.5h6v2.2h4.6c.9 0 1.6.7 1.6 1.6v11.6c0 .9-.7 1.6-1.6 1.6H4.4c-.9 0-1.6-.7-1.6-1.6V7.3c0-.9.7-1.6 1.6-1.6H9zm1.6 1.4v.8h2.8v-.8z"/>' + cut('<path d="M10.7 8.6h2.6v2.7H16v2.6h-2.7v2.7h-2.6v-2.7H8v-2.6h2.7z"/>');
const BULLET = (x, y, s = 1) => g(`translate(${x} ${y}) scale(${s})`, '<path d="M0 6V2.2C0 .6 1 -1.4 2 -2.6c1 1.2 2 3.2 2 4.8V6z"/><rect x="-.2" y="6.6" width="4.4" height="5" rx=".4"/>');
const SYRINGE = g('rotate(45 12 12)', '<rect x="10" y="2" width="4" height="1.6" rx=".5"/><rect x="11.3" y="3.4" width="1.4" height="3"/><rect x="8.2" y="6.2" width="7.6" height="1.6" rx=".6"/><rect x="9.2" y="7.6" width="5.6" height="10" rx=".8"/>' + cut('<rect x="10.4" y="11.6" width="3.2" height="5.2" rx=".4"/>', '.35') + '<path d="M11.4 17.6h1.2v4.6l-.6 1.4-.6-1.4z"/>');

const P = {
  dot: '<circle cx="12" cy="12" r="5"/>',

  // ---------------------------------------------------------------- HUD basics
  hp: '<path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.2C19.5 16.4 12 21 12 21z"/>',
  block: `<path d="${SHIELD}"/>` + `<path d="M12 4.3 6 6.6v4.9c0 3.9 2.5 7.1 6 8.3z" fill="#fff" fill-opacity=".18"/>`,
  energy: '<path d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6.2L13.5 2z"/>',
  supplies: '<path d="M3.5 8.5 12 4l8.5 4.5v10L12 22.5l-8.5-4z" opacity=".38"/><path d="M12 4 20.5 8.5 12 13 3.5 8.5z"/>' + '<path d="M10.8 14.4h2.4v2h2v2.3h-2v2h-2.4v-2h-2v-2.3h2z"/>',
  scrap: gear(12, 12, 10.4, 7.4, 8, 3.3),
  lock: '<path d="M7 10V7a5 5 0 0 1 10 0v3h1.5v11h-13V10H7zm2.5 0h5V7a2.5 2.5 0 0 0-5 0v3z"/>',
  check: '<path d="m9.5 17.5-6-6 2.1-2.1 3.9 3.9 8.4-8.4 2.1 2.1z"/>',
  close: '<path d="m6.3 4.2 5.7 5.7 5.7-5.7 2.1 2.1-5.7 5.7 5.7 5.7-2.1 2.1-5.7-5.7-5.7 5.7-2.1-2.1 5.7-5.7-5.7-5.7z"/>',
  arrow_up: '<path d="M12 3 4 12h5v9h6v-9h5z"/>',
  arrow_down: '<path d="M12 21 4 12h5V3h6v9h5z"/>',
  star: star(12, 12.5, 10.5, 4.4),
  skull: SKULL,
  settings: gear(12, 12, 10.6, 8.1, 8, 3.4),
  info: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.4 8h2.8v8h-2.8zm1.4-5a1.7 1.7 0 1 1 0 3.4A1.7 1.7 0 0 1 12 5z"/>',
  flame: FLAME,
  potion: '<path d="M9 2h6v2.2h-1v3.6l4.8 8.2a3.6 3.6 0 0 1-3.1 5.4H8.3A3.6 3.6 0 0 1 5.2 16L10 7.8V4.2H9z"/>' + cut('<path d="M7.4 15.2h9.2l1 1.8a2 2 0 0 1-1.8 2.9H8.2a2 2 0 0 1-1.8-2.9z"/>', '.3'),
  relic: '<path d="M7 3h10l4.5 6L12 21.5 2.5 9z"/>' + cut('<path d="M7 3 9.6 9h4.8L17 3zM2.5 9h7.1L12 21.5z"/>', '.25') + '<path d="M9.6 9h4.8L12 21.5z" fill="#fff" fill-opacity=".2"/>',
  deck: CARD(8.5, 2.5, 10) + `<g fill="#000" fill-opacity=".45">${CARD(5.5, 5, -2)}</g>` + CARD(5, 5.5, -4),
  draw: `<g opacity=".55">${CARD(9, 2.5, 8)}</g>` + CARD(5, 5, -6) + cut('<path d="M10.5 9.5v5H8l3.5 3.8 3.5-3.8h-2.5v-5z"/>', '.5'),
  discard: `<g opacity=".55">${CARD(4, 4.5, -10)}</g>` + CARD(8, 5, 8) + cut('<path d="M11 13.5h4.2V11l3.8 3.5-3.8 3.5v-2.5H11z"/>', '.5'),
  exhaust: '<path d="M12.5 1.5c.8 3.4-1.2 5-2.8 6.8C8.3 9.8 7.3 11.6 7.3 13.7a4.7 4.7 0 0 0 9.4 0c0-1.3-.4-2.5-1.2-3.5-.3 1.2-1 2.1-1.9 2.5.8-3.7-.1-8-1.1-11.2z"/><path d="M5 17.5h14l-1.2 4.5H6.2z" opacity=".6"/>',
  map: '<path d="M2.5 5.5 8.5 3l7 2.5 6-2.5v15.5l-6 2.5-7-2.5-6 2.5z"/>' + cut('<path d="M8.5 3h.9v15.5h-.9zM15.5 5.5h.9V21h-.9z"/>', '.35') + cutLine('M4.8 15.5c2-1.2 3.2-3.6 5.4-4.2 2.4-.6 3.4 1.6 5.6.8 1.4-.5 2.2-2.4 3.4-3.6', 1),
  end_turn: '<path d="M12 3a9 9 0 1 1-8.5 6h3.3A6 6 0 1 0 12 6v3L7 4.5 12 0z" transform="translate(0 1.5)"/>',
  heart: '<path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.2C19.5 16.4 12 21 12 21z"/>',
  card_attack: taper(4.5, 19.5, 19, 5, 1.6, 4) + '<circle cx="4.2" cy="19.8" r="1.9"/>',
  card_skill: `<path d="${SHIELD}"/>`,
  card_power: star(12, 12, 10.5, 4, 8, -90),
  swords: taper(4, 20, 19, 5, 1.6, 3.6) + g('scale(-1 1) translate(-24 0)', taper(4, 20, 19, 5, 1.6, 3.6)),
  marc: '<path d="M6.6 7.6C6.8 4.4 9.1 2.3 12 2.3s5.2 2.1 5.4 5.3h1.9v1.6H4.7V7.6z"/><path d="M7.3 9.4h9.4c-.1 2.9-2.1 5.2-4.7 5.2s-4.6-2.3-4.7-5.2z"/><path d="M2.5 22c.3-4.3 3.2-6.4 6.3-6.9 1 .9 2 1.3 3.2 1.3s2.2-.4 3.2-1.3c3.1.5 6 2.6 6.3 6.9z"/>',
  yola: '<circle cx="12" cy="3.6" r="2.4"/><path d="M12 5.2c2.9 0 4.8 2.3 4.8 5.1 0 1.8.4 3.5 1.7 4.9-1.7.6-3.4.4-4.6-.4a4.6 4.6 0 0 1-3.8 0c-1.2.8-2.9 1-4.6.4 1.3-1.4 1.7-3.1 1.7-4.9 0-2.8 1.9-5.1 4.8-5.1z"/><path d="M3.5 22c.3-3.8 2.8-5.9 5.7-6.4.8.6 1.8 1 2.8 1s2-.4 2.8-1c2.9.5 5.4 2.6 5.7 6.4z"/>',

  // ---------------------------------------------------------------- intents
  intent_attack: CLAW,
  intent_attack_block: g('translate(-1.5 -1.5) scale(.86)', CLAW) + badge(g('translate(11.5 11) scale(.52)', `<path d="${SHIELD}"/>`)),
  intent_attack_debuff: g('translate(-1.5 -1.5) scale(.86)', CLAW) + badge(g('translate(12 11.5) scale(.48)', CHEV_DOWN)),
  intent_attack_buff: g('translate(-1.5 -1.5) scale(.86)', CLAW) + badge(g('translate(12 11.5) scale(.48)', CHEV_UP)),
  intent_block: `<path d="${SHIELD}"/>` + `<path d="M12 4.3 6 6.6v4.9c0 3.9 2.5 7.1 6 8.3z" fill="#fff" fill-opacity=".22"/>`,
  intent_buff: CHEV_UP,
  intent_block_buff: g('translate(-1 0) scale(.86)', `<path d="${SHIELD}"/>`) + badge(g('translate(11.5 11.5) scale(.5)', CHEV_UP)),
  intent_debuff: CHEV_DOWN,
  intent_heal: CROSS,
  intent_sleep: ZZ,
  intent_stun: star(5.5, 9, 3.4, 1.4) + star(12, 5.5, 3.8, 1.6) + star(18.5, 9, 3.4, 1.4) + line('M3.5 15.5c3 3 14 3 17 0', 1.6) ,
  intent_unknown: QMARK,

  // ---------------------------------------------------------------- statuses
  vulnerable: g('rotate(-7 8 21)', '<path d="M12 2.2 4 5v6.5c0 5 3.4 9.1 7.4 10.4l1.1-5.3-2-3.4 2.3-3.4-1.9-3.3z"/>')
    + g('rotate(7 16 21)', '<path d="M13.3 2.2 20 5v6.5c0 5-3.4 9.1-7 10.3l1.3-5.2-2-3.4 2.3-3.4-1.9-3.3z"/>'),
  weak: '<circle cx="3.6" cy="20.4" r="1.9"/>' + taper(3.9, 20.1, 7, 17, 2.1, 2.1) + taper(3.6, 14, 10, 20.4, 2.2, 2.2)
    + taper(7.2, 16.8, 12.2, 11.8, 3.4, 3.2) + g('translate(1.6 1.4) rotate(14 14 11)', taper(13.6, 10.4, 20.6, 3.4, 3.1, .6))
    + cutLine('M12.6 11.2l-1.2 1.6 1.4.6', .9) + line('M15 17.5l1.2 2.4M18 15.6l2.4 1.2', 1.3),
  frail: `<path d="M12 4.4 6.6 6.4v4.6c0 3.6 2.3 6.5 5.4 7.6 3.1-1.1 5.4-4 5.4-7.6V6.4z" opacity=".9"/>` + line('M3 7.5l1.6 1.8L3 11.1l1.6 1.8L3 14.7', 1.5) + line('M21 7.5l-1.6 1.8 1.6 1.8-1.6 1.8 1.6 1.8', 1.5) + line('M9 21h6', 1.6),
  strength: FIST,
  dexterity: '<path d="M20.5 2.8C13.2 3.2 7.6 8.9 6.6 16.1l-2.8 4.3 1.1 1 3.4-3.8c6.9-1 12.2-6.8 12.2-14.8z"/>' + cutLine('M18.4 5.4 7.6 17.6M11.4 11.6l3.6.6M13.8 8.8l3.4.4M9.4 14.4l3.2.8', 1),
  bleed: DROP + '<path d="M9.2 15.6c.2 1.6 1.2 2.6 2.6 2.8" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.4" stroke-linecap="round"/>',
  ritual: FLAME + cut('<path d="M12 21a2.8 2.8 0 0 1-2.8-2.8c0-1.6 1.3-2.6 2.2-3.8.4 1 1.2 1.6 2 2 .9.5 1.4 1.2 1.4 1.8A2.8 2.8 0 0 1 12 21z"/>', '.35'),
  plating: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.2"/>' + cut('<circle cx="7" cy="7" r="1.2"/><circle cx="17" cy="7" r="1.2"/><circle cx="7" cy="17" r="1.2"/><circle cx="17" cy="17" r="1.2"/>', '.5') + '<path d="M5.5 10.5 10.5 5.5h3l-8 8z" fill="#fff" fill-opacity=".25"/>',
  thorns: star(12, 12, 11, 5, 8, -90) + cut('<circle cx="12" cy="12" r="2.6"/>', '.35'),
  // Barbed Wire: two twisted strands with two barbs
  barbed: line('M1.5 12c1.9-3.6 4.2-3.6 6 0s4.1 3.6 6 0 4.1-3.6 6 0 2.1 2.4 3 2.2', 1.6) + line('M1.5 12c1.9 3.6 4.2 3.6 6 0s4.1-3.6 6 0 4.1 3.6 6 0 2.1-2.4 3-2.2', 1.6)
    + line('M5 8.6l5 6.8M10 8.6l-5 6.8M14 8.6l5 6.8M19 8.6l-5 6.8', 1.3),
  // Battering Ram: a log driven into a shield, with the knock
  battering_ram: g('translate(13.2 4.2) scale(.46)', `<path d="${SHIELD}"/>`)
    + g('rotate(-14 7 14)', '<rect x="0.4" y="11" width="11.6" height="6" rx="2.4"/>' + cutLine('M4 11.6v4.8M7.6 11.6v4.8', 1.1))
    + line('M12.6 8.2l-1.2-2M12.4 17.6l-.8 2.2', 1.3),
  enrage: [0, 90, 180, 270].map(r => g(`rotate(${r} 12 12)`, '<path d="M2.6 10.2c2.6.2 4.8-1.3 5.4-4h3c-.6 4.3-4 7.3-8.4 7.2z"/>')).join(''),
  hunch: line('M12 12m-1.4 0a1.4 1.4 0 1 1 2.8 0a2.8 2.8 0 1 1-5.6 0a4.4 4.4 0 1 1 8.8 0a6 6 0 1 1-12 0a7.6 7.6 0 1 1 15.2 0', 2.2),
  immune: `<path d="${SHIELD}"/>` + cutLine('m8 11.8 3 3 5.4-5.6', 2.2),
  asleep: ZZ,
  mode_shift: '<rect x="5.5" y="2.5" width="13" height="19" rx="2.6"/>' + cut('<rect x="8" y="5" width="8" height="4" rx="1"/>', '.5') + cutLine('M8.5 13h7M8.5 16h7', 1.2),
  temp_strength: g('translate(-1 1.5) scale(.9)', FIST) + star(19.5, 4.5, 4, 1.6),
  swing_guard: g('translate(3 3) scale(.75)', `<path d="${SHIELD}"/>`) + badge(taper(3, 21, 19.5, 4.5, 1.6, 3.6)),
  slow_motion: '<path d="M5.5 2h13v2.2h-1.3c0 3.4-1.8 5.4-3.7 6.6v2.4c1.9 1.2 3.7 3.2 3.7 6.6h1.3V22h-13v-2.2h1.3c0-3.4 1.8-5.4 3.7-6.6v-2.4C8.6 9.6 6.8 7.6 6.8 4.2H5.5z"/>' + cut('<path d="M9.2 6.6h5.6c-.5 1.4-1.6 2.4-2.8 3.1-1.2-.7-2.3-1.7-2.8-3.1zM12 15.6c1.5.8 2.8 2 3 4.2H9c.2-2.2 1.5-3.4 3-4.2z"/>', '.4'),
  thick_skin: '<path d="M3 8.5c2.2-3 5.5-4.8 9-4.8s6.8 1.8 9 4.8c-2.6 1-5.8 1.6-9 1.6S5.6 9.5 3 8.5z"/><path d="M3 13.6c2.4-1.6 5.6-2.4 9-2.4s6.6.8 9 2.4c-2.6 1.4-5.8 2-9 2s-6.4-.6-9-2z" opacity=".85"/><path d="M5 18.4c2-1.2 4.4-1.8 7-1.8s5 .6 7 1.8c-1.8 1.8-4.3 2.8-7 2.8s-5.2-1-7-2.8z" opacity=".7"/>',
  berserker: g('translate(0 1.5) scale(.92) translate(1 0)', SKULL) + HORNS,
  fortify: '<path d="M3 22V6.5h3.4v3h2.8v-3h3.6v3h2.8v-3H19v3h2V22z"/>' + cut('<path d="M10 22v-4.6a2 2 0 0 1 4 0V22z"/>', '.45') + cut('<rect x="6" y="12.5" width="2.4" height="2.4"/><rect x="15.6" y="12.5" width="2.4" height="2.4"/>', '.35'),
  marksman: line('M12 12m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0', 2) + line('M12 1.5v5.5M12 17v5.5M1.5 12H7M17 12h5.5', 2) + '<circle cx="12" cy="12" r="1.8"/>',
  light_feet: '<path d="M2.5 15.8c0-1.1.7-1.9 1.8-2l3.3-.4 3.4-4.6 2.6 1.8 3 2.6 4.1 1.3c.9.3 1.5 1 1.5 1.9v1.5c0 .8-.7 1.4-1.5 1.4H4c-.9 0-1.5-.6-1.5-1.5z"/>' + cut('<path d="M2.5 17.4h19v1.1h-19z"/>', '.4') + line('M1.5 8h5M3 5h4.5M.8 11h3.4', 1.4),
  dead_eye: '<path d="M12 6.2C6.8 6.2 3.2 12 3.2 12s3.6 5.8 8.8 5.8 8.8-5.8 8.8-5.8-3.6-5.6-8.8-5.6z"/>' + cut('<circle cx="12" cy="12" r="3.3"/>', '.65') + line('M12 1.5v3.2M12 19.3v3.2M1 12h1.6M21.4 12H23', 1.6) + '<circle cx="12" cy="12" r="1.1" fill="#fff" fill-opacity=".7"/>',

  // ---------------------------------------------------------------- map rooms
  node_fight: '<path d="M12 2.2c-4.9 0-8.6 3.6-8.6 8.4 0 2.6 1 4.6 2.9 6l.2 3.4c.1 1 .9 1.8 2 1.8h7c1.1 0 1.9-.8 2-1.8l.2-3.4c1.9-1.4 2.9-3.4 2.9-6 0-4.8-3.7-8.4-8.6-8.4z"/>'
    + cut('<path d="M6.6 9.4l3.6 1.2-.4 2.2-3.2-.6z"/><circle cx="15.6" cy="11.2" r="2"/><path d="M8.4 17.2h7.2v1.4H8.4z"/>', '.65') + cutLine('M9.6 16.4v2.8M12 16.4v2.8M14.4 16.4v2.8', .9),
  node_elite: g('translate(0 2) scale(.92) translate(1 0)', SKULL) + HORNS,
  node_rest: '<path d="M2 19.5V7h2.2v7.5H22v5h-2.2V17.5H4.2v2z"/><rect x="5" y="10.6" width="5.4" height="3.2" rx="1.4"/><path d="M11.2 10.4h7.8c1.6 0 3 1.3 3 3v.6h-10.8z"/>',
  node_shop: g('rotate(-45 12 12)', '<rect x="3" y="8" width="18" height="8" rx="4"/>') + cut(g('rotate(-45 12 12)', '<path d="M12 8h5a4 4 0 0 1 0 8h-5z"/>'), '.4') + '<path d="M7 8.6 9.5 6.1" stroke="#fff" stroke-opacity=".4" stroke-width="1.3" stroke-linecap="round"/>',
  node_event: '<path d="M5 22V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v18z"/>' + cut(g('translate(5.6 4.4) scale(.53)', QMARK), '.6') + cut('<circle cx="16" cy="13.5" r="1"/>', '.6'),
  node_treasure: '<path d="M2.5 9.5h19V20c0 .8-.7 1.5-1.5 1.5H4c-.8 0-1.5-.7-1.5-1.5z"/><path d="M2.5 8.2C2.5 5.3 4.8 3 7.7 3h8.6c2.9 0 5.2 2.3 5.2 5.2v.3h-19z"/>' + cut('<rect x="10.2" y="7.6" width="3.6" height="5" rx=".8"/><path d="M2.5 14h19v1.2h-19z"/>', '.45'),
  node_boss: g('translate(0 3.2) scale(.86) translate(2 0)', SKULL) + '<path d="M4 7.5 5.5 1.5l3.7 3.4L12 .5l2.8 4.4 3.7-3.4L20 7.5z"/>',

  // ---------------------------------------------------------------- card art placeholders (by anim)
  art_melee_light: taper(4, 20.5, 19, 5.5, 1.8, 4.4) + '<circle cx="3.8" cy="20.8" r="2"/>',
  art_melee_heavy: taper(3.5, 21, 16.5, 8, 1.8, 4.6) + '<circle cx="3.3" cy="21.3" r="2"/>' + star(18.5, 5.5, 5.2, 2, 7),
  art_melee_sweep: taper(3, 20, 19, 9, 1.8, 4.2) + '<circle cx="2.8" cy="20.2" r="1.9"/>' + line('M5 5.5c4-2.4 10-2.4 15 1.5', 1.6) + line('M4 9c3-1.6 7-1.6 10 0', 1.2),
  art_melee_combo: taper(3.5, 20.5, 17.5, 6.5, 1.6, 4) + '<circle cx="3.3" cy="20.8" r="1.8"/>' + slash(9, 6, 20, 3, 1.2, .6) + slash(12, 21, 22, 13, 1.2, .6),
  art_pistol: '<path d="M2.5 6.5h16.2l1.3 1.3v3.6h-7.4l-1.2 1.5v1.7c0 .7-.5 1.2-1.2 1.2H9.2l-1.6 6H3.9l1.8-7.5-3.2-3.8z"/>' + cut('<path d="M9.6 12.7c.5 1.2 1.4 1.7 2.6 1.6v-1.6z"/>', '.5') + '<path d="M21.3 7.6h1.8v2.6h-1.8z" opacity=".7"/>',
  art_pistol_burst: g('translate(-1 2) scale(.84)', '<path d="M2.5 6.5h16.2l1.3 1.3v3.6h-7.4l-1.2 1.5v1.7c0 .7-.5 1.2-1.2 1.2H9.2l-1.6 6H3.9l1.8-7.5-3.2-3.8z"/>') + star(20.5, 8.8, 3.6, 1.4, 6) + '<circle cx="22" cy="3.5" r="1.2"/><circle cx="22.6" cy="14.5" r="1"/>',
  art_shotgun: '<path d="M1 9.6h13.5v-1H23v2.6h-8.5v.9h-3l-.6 1.5H9L7.4 15 3 17.6 1 14.4z"/>' + '<rect x="15" y="11.8" width="5" height="2" rx=".7"/>',
  art_block: `<path d="${SHIELD}"/>` + `<path d="M12 4.3 6 6.6v4.9c0 3.9 2.5 7.1 6 8.3z" fill="#fff" fill-opacity=".2"/>`,
  art_dodge: '<circle cx="15.5" cy="4" r="2.4"/><path d="M13.6 7.4 9.4 9.2 7 13.4l1.8 1 1.9-3.1 1.6-.6-1.4 4.6-4.4 3.4 1.3 1.6 5.1-3.8 1.8 2.4.2 4.1h2.2l-.3-4.8-2.3-3.2 1.2-3.8 1.3 1.6 3.3.8.5-2-2.7-.7-2.5-3.4c-.6-.8-1.6-1.1-2.5-.8z"/>' + line('M1.5 9h4M.8 12.5h3.6M2 16h3', 1.3),
  art_heal: CROSS + '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="#fff" fill-opacity=".15" transform="translate(-1 -1) scale(1.08)"/>',
  art_buff: FIST + star(20, 3.8, 3.4, 1.4),
  art_debuff: CHEV_DOWN,
  art_throw: '<circle cx="9" cy="15" r="6"/>' + cut('<path d="M5.2 13h7.6v1.4H5.2z"/>', '.35') + '<rect x="7.6" y="7" width="3" height="3" rx=".6"/>' + line('M10.5 7.5c1.6-2.2 4-3.2 6.5-2.6', 1.4) + star(19.5, 4.2, 3.2, 1.2, 6),
  art_none: QMARK,

  // ---------------------------------------------------------------- weapons (diagonal: handle bottom-left, head top-right)
  weapon_wood_bat: taper(4, 20.5, 19, 5.5, 1.8, 4.4) + '<circle cx="3.8" cy="20.8" r="2"/>' + cutLine('M7.2 15.9 9 17.6', 1.1),
  weapon_nail_bat: taper(4, 20.5, 19, 5.5, 1.8, 4.4) + '<circle cx="3.8" cy="20.8" r="2"/>' + line('M13 8.5l-1.6-1.6M15.6 10.6l1.6 1.6M16.2 5.4 15 3.8M19.6 8.6l1.8 1.2M18.4 3.2l.4-1.6', 1.1),
  weapon_wire_bat: taper(4, 20.5, 19, 5.5, 1.8, 4.4) + '<circle cx="3.8" cy="20.8" r="2"/>' + cutLine('M12.2 9.4l3 3M14 7.6l3 3M15.8 5.8l3 3M17.6 4.2l2.6 2.6', 1),
  weapon_crowbar: line('M5.5 20.5 16.6 6.2c1.3-1.7 3.9-1 4 1.2', 2.6) + line('M5.5 20.5 3 21.5M5.5 20.5l-.6 2.4', 2),
  weapon_fire_axe: taper(3.5, 21, 15.5, 6, 1.8, 2.2) + '<path d="M12.6 4.6 15.4 2l2.6 2.4c1.6-.4 3.2 0 4.4 1.2-1 2.6-3 4.2-5.6 4.6l-2.6-2.4-2 1.6-1.8-1.8z"/>' + '<path d="M13.2 6.4 11 3.2l1.6-.8 2 2.4z" opacity=".8"/>',
  weapon_sledgehammer: taper(3.5, 21, 15, 9, 1.8, 2) + g('rotate(-45 16.5 7.5)', '<rect x="11.5" y="4" width="10" height="7" rx="1.2"/>') + cut(g('rotate(-45 16.5 7.5)', '<rect x="11.5" y="4" width="10" height="1.4"/>'), '.3'),
  weapon_pistol: '<path d="M2.5 6.5h16.2l1.3 1.3v3.6h-7.4l-1.2 1.5v1.7c0 .7-.5 1.2-1.2 1.2H9.2l-1.6 6H3.9l1.8-7.5-3.2-3.8z"/>' + cut('<path d="M9.6 12.7c.5 1.2 1.4 1.7 2.6 1.6v-1.6z"/><path d="M4 8h12v.9H4z"/>', '.45'),
  weapon_shotgun: '<path d="M1 9.6h13.5v-1H23v2.6h-8.5v.9h-3l-.6 1.5H9L7.4 15 3 17.6 1 14.4z"/><rect x="15" y="11.8" width="5" height="2" rx=".7"/>',
  weapon_sawed_off: '<path d="M2 9.4h10.5v-.9h7.5v2.8h-7.5v.8H10l-.6 1.6H8L6.6 15 3.2 17.4 1.6 14.6z"/><rect x="13" y="12" width="4.5" height="2" rx=".7"/>' + cut('<path d="M12.5 9.7H20v.5h-7.5z"/>', '.4'),

  // ---------------------------------------------------------------- relics
  relic_nurses_kit: KIT,
  relic_duct_tape: '<path fill-rule="evenodd" d="M10.5 3.5a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 4.6a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8z"/><path d="M15.5 16.5 22 16v3.4l-1.2-.8-1 .9-1-.9-1.1.9-1-.8z"/>',
  relic_coffee_thermos: '<rect x="7" y="2" width="10" height="3.6" rx="1"/><path d="M6.5 6.2h11v14c0 1-.8 1.8-1.8 1.8H8.3c-1 0-1.8-.8-1.8-1.8z"/>' + cut('<rect x="6.5" y="10" width="11" height="5"/>', '.3') + line('M17.5 9.5h1.8c.8 0 1.4.6 1.4 1.4v3.2c0 .8-.6 1.4-1.4 1.4h-1.8', 1.6),
  relic_stethoscope: line('M6 2.5v5.5a5 5 0 0 0 10 0V2.5', 1.8) + line('M11 13v3.5a4.5 4.5 0 0 0 9 0V14', 1.8) + '<circle cx="20" cy="11.5" r="3"/>' + cut('<circle cx="20" cy="11.5" r="1.2"/>', '.5') + '<rect x="4.6" y="1.5" width="2.8" height="2" rx=".8"/><rect x="14.6" y="1.5" width="2.8" height="2" rx=".8"/>',
  relic_pager: '<rect x="3" y="5" width="18" height="14" rx="2.4"/>' + cut('<rect x="5.4" y="7.4" width="13.2" height="5.4" rx=".8"/><circle cx="8" cy="16" r="1.2"/><circle cx="12" cy="16" r="1.2"/><circle cx="16" cy="16" r="1.2"/>', '.55') + '<rect x="16" y="2.6" width="3" height="2.6" rx=".6"/>',
  relic_protein_bar: g('rotate(-35 12 12)', '<rect x="4" y="8.5" width="16" height="7" rx="1.2"/><path d="M1.5 8.5 4 9.6v4.8l-2.5 1.1L2.6 12zM22.5 8.5 20 9.6v4.8l2.5 1.1-1.1-3.5z"/>') + cut(g('rotate(-35 12 12)', '<rect x="9" y="8.5" width="6" height="7"/>'), '.3'),
  relic_knee_brace: '<path d="M8.5 2h6l-.6 6.4c2.2 1 3.6 3.2 3.6 5.6 0 2.4-1.4 4.6-3.6 5.6L14.5 22h-6l.6-2.4c-2.2-1-3.6-3.2-3.6-5.6 0-2.4 1.4-4.6 3.6-5.6z"/>' + cut('<circle cx="12" cy="14" r="2.6"/><path d="M5.5 10h12.8v1.4H5.5zM5.5 16.6h12.8V18H5.5z"/>', '.4'),
  relic_granola: g('rotate(-20 12 12)', '<rect x="3" y="8" width="18" height="8" rx="2.4"/>') + cut('<circle cx="7.5" cy="13.4" r="1"/><circle cx="11" cy="11.2" r=".9"/><circle cx="14.6" cy="11" r="1.1"/><circle cx="17.2" cy="8.6" r=".8"/><circle cx="12.4" cy="14.4" r=".8"/>', '.4'),
  relic_iv_bag: '<path d="M6.5 2.5h11v10c0 3-2.5 5.5-5.5 5.5s-5.5-2.5-5.5-5.5z"/>' + cut('<path d="M6.5 7.8h11v1H6.5zM9 10.5h6v1.2H9zM9 13h4v1.2H9z"/>', '.35') + line('M12 18v4.5', 1.6) + '<rect x="10.6" y="1" width="2.8" height="2.2" rx=".6"/>',
  relic_coin_jar: '<path d="M7 3.5h10v2.2c1.8 1 3 2.8 3 5V19c0 1.4-1.1 2.5-2.5 2.5h-11C5.1 21.5 4 20.4 4 19v-8.3c0-2.2 1.2-4 3-5z"/>' + cut('<rect x="9" y="2" width="6" height="1.4" rx=".6"/><circle cx="12" cy="14.5" r="3.6"/>', '.4') + '<circle cx="12" cy="14.5" r="2.2"/>',
  relic_tally_marks: '<rect x="4" y="3.5" width="2.2" height="17" rx="1.1"/><rect x="8.6" y="3.5" width="2.2" height="17" rx="1.1"/><rect x="13.2" y="3.5" width="2.2" height="17" rx="1.1"/><rect x="17.8" y="3.5" width="2.2" height="17" rx="1.1"/>' + taper(1.5, 18.5, 22.5, 5.5, 2.2, 2.2),
  relic_riot_vest: VEST,
  relic_combo_counter: '<circle cx="12" cy="13" r="8.5"/>' + cut('<rect x="7" y="10.5" width="10" height="5" rx="1"/>', '.6') + '<rect x="10.5" y="1.5" width="3" height="3" rx=".8"/>' + '<path d="M8.6 11.6h1.2v2.8H8.6zM11.4 11.6h1.2v2.8h-1.2zM14.2 11.6h1.2v2.8h-1.2z" fill="#fff" fill-opacity=".65"/>',
  relic_box_cutter: g('rotate(-35 12 12)', '<rect x="2" y="9.5" width="13" height="5.2" rx="1.4"/><path d="M15 10.2h4.6l3 1.9-3 1.9H15z"/>') + cut(g('rotate(-35 12 12)', '<rect x="5" y="9.5" width="1.4" height="5.2"/><rect x="8.6" y="9.5" width="1.4" height="5.2"/>'), '.35'),
  relic_door_wedge: '<path d="M2 19.5 21.5 9.5 22 19.5z"/>' + cut('<path d="M8.2 17.4 19.8 11.6l.2 1.4-11 5z"/>', '.3') + '<path d="M1 21h22v1.4H1z" opacity=".5"/>',
  relic_trophy_belt: '<path d="M1 9h22v6H1z"/>' + cut('<path d="M1 10.2h22v.8H1zM1 13h22v.8H1z"/>', '.3') + '<rect x="8" y="6.5" width="8" height="11" rx="1.6"/>' + cut('<rect x="10" y="8.6" width="4" height="6.8" rx=".8"/>', '.55') + '<rect x="11.4" y="10.6" width="5.6" height="2.8" rx=".6"/>',
  relic_emergency_rations: '<path d="M4.5 5.5C4.5 4.1 7.9 3 12 3s7.5 1.1 7.5 2.5v13c0 1.4-3.4 2.5-7.5 2.5s-7.5-1.1-7.5-2.5z"/>' + cut('<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 9.5c2 .8 4.6 1.2 7.5 1.2s5.5-.4 7.5-1.2v6c-2 .8-4.6 1.2-7.5 1.2s-5.5-.4-7.5-1.2z"/>', '.35') + '<path d="M10.8 11.6h2.4v1.2h1.2v2.4h-1.2v1.2h-2.4v-1.2H9.6v-2.4h1.2z"/>',
  relic_hollow_points: BULLET(3.5, 7, 1.15) + BULLET(10, 6, 1.15) + BULLET(16.5, 7, 1.15) + cut('<circle cx="5.8" cy="5.4" r=".9"/><circle cx="12.3" cy="4.4" r=".9"/><circle cx="18.8" cy="5.4" r=".9"/>', '.6'),
  relic_steel_plate: '<path d="M12 2 20.7 7v10L12 22l-8.7-5V7z"/>' + cut('<circle cx="12" cy="5.3" r="1.1"/><circle cx="12" cy="18.7" r="1.1"/><circle cx="6.2" cy="8.8" r="1.1"/><circle cx="17.8" cy="8.8" r="1.1"/><circle cx="6.2" cy="15.2" r="1.1"/><circle cx="17.8" cy="15.2" r="1.1"/>', '.5') + '<path d="M7.6 11 12 7.4l1.6 1L9.2 12z" fill="#fff" fill-opacity=".25"/>',
  relic_defib_pads: '<rect x="1.5" y="9" width="8" height="10" rx="2.4"/><rect x="14.5" y="9" width="8" height="10" rx="2.4"/>' + '<rect x="4" y="4" width="3" height="5.4" rx="1"/><rect x="17" y="4" width="3" height="5.4" rx="1"/>' + '<path d="M13 2.5 9.6 8.6h2.6l-1.4 4.6 3.6-6.4h-2.6z"/>',
  relic_cooler: '<path d="M2.5 9h19v10.5c0 .8-.7 1.5-1.5 1.5H4c-.8 0-1.5-.7-1.5-1.5z"/><path d="M2 6.5c0-.8.7-1.5 1.5-1.5h17c.8 0 1.5.7 1.5 1.5v2.2H2z"/>' + '<path d="M8.5 2.2h7v3h-1.6v-1.4h-3.8v1.4H8.5z"/>' + cutLine('M12 11v8M8.6 13l6.8 4M15.4 13l-6.8 4', 1.2),
  relic_staff_badge: '<rect x="4.5" y="5" width="15" height="17" rx="2"/>' + cut('<rect x="9.5" y="5.8" width="5" height="1.6" rx=".8"/><circle cx="12" cy="11.6" r="2.6"/><path d="M7.6 18.4c.4-2 2.2-3.2 4.4-3.2s4 1.2 4.4 3.2z"/><rect x="7.5" y="19.4" width="9" height="1"/>', '.45') + '<rect x="10.8" y="1" width="2.4" height="5" rx="1"/>',
  relic_doctors_note: '<path d="M5 2h10l4.5 4.5V22H5z"/>' + cut('<path d="M15 2v4.5h4.5z"/><path d="M8 11h8.5v1.2H8zM8 14h8.5v1.2H8zM8 17h5.5v1.2H8z"/>', '.38') + cut('<path d="M8.9 4.6h1.4v1.4h1.4v1.4h-1.4v1.4H8.9V7.4H7.5V6h1.4z"/>', '.55'),

  // ---------------------------------------------------------------- potions (medkit items)
  potion_medkit: KIT,
  potion_adrenaline: SYRINGE,
  potion_extinguisher: '<rect x="7" y="7.5" width="9" height="14.5" rx="3.2"/>' + '<path d="M8.6 3.6h5.4l.8 3.9H8z"/><path d="M14 3.4 20.5 2v1.8L14.4 5z"/>' + line('M8.6 4.4C5.4 4.6 3.6 6.6 3.6 10v3', 1.5) + cut('<rect x="7" y="11.5" width="9" height="4.5"/>', '.3'),
  potion_flashbang: '<rect x="7" y="7" width="10" height="15" rx="2.4"/>' + cut('<path d="M7 10.6h10v1.4H7zM7 17h10v1.4H7z"/><circle cx="9.5" cy="14.4" r=".9"/><circle cx="12" cy="14.4" r=".9"/><circle cx="14.5" cy="14.4" r=".9"/>', '.4') + '<rect x="9.5" y="3.5" width="5" height="3.8" rx=".8"/>' + line('M14.5 4.6c2.4-1.6 4.8-1 5.2 1.2.3 1.7-1 3-2.6 2.8', 1.4),
  potion_energy_drink: '<path d="M6.5 4.5c0-.8.6-1.4 1.4-1.4h8.2c.8 0 1.4.6 1.4 1.4l-.6 1.6v12.2l.6 1.6c0 .8-.6 1.4-1.4 1.4H7.9c-.8 0-1.4-.6-1.4-1.4l.6-1.6V6.1z"/>' + cut('<path d="M13.2 7 9.4 13h2.6L10.8 17l3.8-6h-2.6z"/>', '.55'),
  potion_body_armor: VEST,
  potion_pipe_bomb: g('rotate(-30 12 13)', '<rect x="4.5" y="9.5" width="15" height="7.4" rx="1.4"/><rect x="2.8" y="8.6" width="3" height="9.2" rx=".8"/><rect x="18.2" y="8.6" width="3" height="9.2" rx=".8"/>') + line('M17.4 6.2c1.2-1.2 1.6-2.6 1-4', 1.3) + star(18.6, 2.4, 2.6, 1, 6),
  potion_protein_shake: '<path d="M7 7.5h10l-1.2 13c-.1.8-.8 1.5-1.6 1.5H9.8c-.8 0-1.5-.7-1.6-1.5z"/><path d="M6.5 4.5h11v3h-11z"/><rect x="9.5" y="1.6" width="5" height="3.2" rx="1"/>' + cut('<path d="M7.6 12h8.8l-.4 4H8z"/>', '.3'),
  potion_painkiller_pills: '<rect x="6" y="2" width="12" height="4" rx="1.2"/><path d="M6.8 6.5h10.4v13.8c0 .9-.7 1.7-1.7 1.7h-7c-.9 0-1.7-.8-1.7-1.7z"/>' + cut('<rect x="6.8" y="10" width="10.4" height="7" rx=".4"/>', '.35') + g('rotate(-35 12 13.5)', '<rect x="8.6" y="12" width="6.8" height="3" rx="1.5"/>'),
  potion_epi_pen: g('rotate(-40 12 12)', '<rect x="9.6" y="1.5" width="4.8" height="17" rx="2.2"/><rect x="10.4" y="18.2" width="3.2" height="2.6" rx=".6"/><path d="M11.5 20.6h1l-.5 2.6z"/>') + cut(g('rotate(-40 12 12)', '<rect x="9.6" y="7" width="4.8" height="5.4"/>'), '.35'),
};

// relic and potion glyph lookup (weapon relics share the weapon glyphs)
const WEAPON_IDS = ['wood_bat', 'nail_bat', 'wire_bat', 'crowbar', 'fire_axe', 'sledgehammer', 'pistol', 'shotgun', 'sawed_off'];

/** Glyph name for a relic id (weapons included); falls back to the generic relic gem. */
export function relicGlyph(id) {
  if (WEAPON_IDS.includes(id)) return 'weapon_' + id;
  return P['relic_' + id] ? 'relic_' + id : 'relic';
}
/** Glyph name for a potion id; falls back to a flask. */
export const potionGlyph = id => (P['potion_' + id] ? 'potion_' + id : 'potion');
/** Glyph name for an intent type ('attack_block' -> 'intent_attack_block'). */
export const intentGlyph = type => (P['intent_' + type] ? 'intent_' + type : 'intent_unknown');

export function icon(name, { size = '1em', color = 'currentColor', title = '' } = {}) {
  const body = P[name] || P.dot;
  return `<svg class="ico ico-${name}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}" aria-hidden="${title ? 'false' : 'true'}">${title ? `<title>${title}</title>` : ''}${body}</svg>`;
}

export function iconEl(name, opts) {
  const t = document.createElement('template'); t.innerHTML = icon(name, opts); return t.content.firstElementChild;
}

/** Register or replace glyphs (paths on a 24x24 grid). */
export function defineIcons(map) { Object.assign(P, map); }
export const hasIcon = name => name in P;
/** Every glyph name (the lab's icon sheet). */
export const iconNames = () => Object.keys(P);
