// Inline SVG icons. icon(name, { size, color, title }) returns an SVG string; iconEl() returns an element.
// Single-colour glyphs on a 24x24 grid drawn with currentColor so CSS can tint them.
// Owner: the UI kit. Other modules only call icon(); an unknown name renders a neutral dot (never throws).
// Names in use (see BUILD_SPEC.md): intent_*, status ids, node_*, hp, block, energy, supplies, scrap, potion, relic,
// deck, draw, discard, exhaust, map, settings, lock, check, close, marc, yola, skull, star, arrow_up, arrow_down.

const P = {
  dot: '<circle cx="12" cy="12" r="5"/>',
  hp: '<path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.2C19.5 16.4 12 21 12 21z"/>',
  block: '<path d="M12 2 4 5v6.5c0 5 3.4 9.1 8 10.5 4.6-1.4 8-5.5 8-10.5V5l-8-3z"/>',
  energy: '<path d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6.2L13.5 2z"/>',
  supplies: '<path d="M4 8h16v12H4zM8 4h8v4H8z" opacity=".35"/><path d="M10.5 10h3v2.5H16v3h-2.5V18h-3v-2.5H8v-3h2.5z"/>',
  scrap: '<path d="M7 3h4l1 3 3-2 3 3-2 3 3 1v4l-3 1 2 3-3 3-3-2-1 3H7l-1-3-3 2-3-3 2-3-3-1V9l3-1-2-3 3-3 3 2 1-3z" transform="scale(.9) translate(1.6 1.6)"/>',
  lock: '<path d="M7 10V7a5 5 0 0 1 10 0v3h1.5v11h-13V10H7zm2.5 0h5V7a2.5 2.5 0 0 0-5 0v3z"/>',
  check: '<path d="m9.5 17.5-6-6 2.1-2.1 3.9 3.9 8.4-8.4 2.1 2.1z"/>',
  close: '<path d="m6.3 4.2 5.7 5.7 5.7-5.7 2.1 2.1-5.7 5.7 5.7 5.7-2.1 2.1-5.7-5.7-5.7 5.7-2.1-2.1 5.7-5.7-5.7-5.7z"/>',
  arrow_up: '<path d="M12 3 4 12h5v9h6v-9h5z"/>',
  arrow_down: '<path d="M12 21 4 12h5V3h6v9h5z"/>',
  star: '<path d="m12 2 2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.8-6.3 3.8 1.7-7L2 9.2l7.1-.6z"/>',
  skull: '<path d="M12 2C6.9 2 3 5.7 3 10.4c0 2.8 1.4 5 3.5 6.4V20a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3.2c2.1-1.4 3.5-3.6 3.5-6.4C21 5.7 17.1 2 12 2zM8.5 14a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4zm7 0a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4z"/>',
  settings: '<path d="M10 2h4l.6 2.6 2.3 1 2.3-1.4 2.8 2.8-1.4 2.3 1 2.3L24 12v0l-2.4.4-1 2.3 1.4 2.3-2.8 2.8-2.3-1.4-2.3 1L14 22h-4l-.6-2.6-2.3-1-2.3 1.4L2 17l1.4-2.3-1-2.3L0 12l2.4-.4 1-2.3L2 7l2.8-2.8 2.3 1.4 2.3-1z" transform="scale(.92) translate(1 1)"/><circle cx="12" cy="12" r="3.4" fill="#0006"/>',
};

export function icon(name, { size = '1em', color = 'currentColor', title = '' } = {}) {
  const body = P[name] || P.dot;
  return `<svg class="ico ico-${name}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}" aria-hidden="${title ? 'false' : 'true'}">${title ? `<title>${title}</title>` : ''}${body}</svg>`;
}

export function iconEl(name, opts) {
  const t = document.createElement('template'); t.innerHTML = icon(name, opts); return t.content.firstElementChild;
}

/** Register or replace glyphs (the UI kit extends the set; paths on a 24x24 grid). */
export function defineIcons(map) { Object.assign(P, map); }
export const hasIcon = name => name in P;
