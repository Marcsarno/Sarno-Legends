// Text for cards, relics, potions, statuses and intents, as small HTML strings. Pure (no DOM).
// Markup the UI styles:  <b class="kw" data-kw="Staggered">Staggered</b> for keywords (tooltips via KEYWORDS),
//                        <span class="num">6</span>, <span class="num-up">9</span>, <span class="num-down">4</span>
// for numbers (up/down = changed by live statuses against the hovered target, or by an upgrade in a preview).
// Card text is generated from the card's effects unless the card has its own text(v) function (cards.js).

import { CARDS, cardView } from './content/cards.js';
import { STATUSES } from './content/statuses.js';
import { RELICS } from './content/relics.js';
import { POTIONS } from './content/potions.js';
import { ENEMIES, INTENT_TYPES, moveDamage } from './content/enemies.js';

// ---------------------------------------------------------------- keyword glossary (tooltips)

export const KEYWORDS = {
  Block: 'Stops damage until your next turn.',
  Staggered: 'Takes 50% more damage from attacks. Goes down by 1 each round.',
  Weakened: 'Deals 25% less damage with attacks. Goes down by 1 each round.',
  Shaken: 'Gains 25% less Block from cards. Goes down by 1 each round.',
  Strength: 'Adds damage to every hit of an attack.',
  Agility: 'Adds Block to every card that gives Block.',
  Bleed: 'Loses that much HP at the start of its turn, then Bleed goes down by 1. Ignores Block.',
  Exhaust: 'Removed until the end of the fight.',
  Innate: 'Starts each fight in your hand.',
  Fleeting: 'If it is still in your hand at the end of the turn, it is Exhausted.',
  Retain: 'Stays in your hand at the end of the turn.',
  Unplayable: 'Can\'t be played.',
  Finisher: 'A kill on a Staggered zombie.',
  Energy: 'Spent to play cards. Refills to 3 each turn.',
};
for (const s of Object.values(STATUSES)) {
  if (!KEYWORDS[s.name]) KEYWORDS[s.name] = fillN(s.text, 'X').replace(/X (\w+)\(s\)/g, 'X $1s');
}

const KW_NAMES = Object.keys(KEYWORDS).sort((a, b) => b.length - a.length);
const KW_RE = new RegExp(`\\b(${KW_NAMES.map(escapeRe).join('|')})\\b`, 'g');

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function fillN(text, n) { return String(text).replace(/\{n\}/g, n); }
function plural(text) {
  return text.replace(/(-?\d+)(<\/span>)? (\w+)\(s\)/g, (m, n, close, w) => `${n}${close || ''} ${Math.abs(Number(n)) === 1 ? w : w + 's'}`);
}

export const kw = name => `<b class="kw" data-kw="${name}">${name}</b>`;

// card names (e.g. "Chop Block") must not get a keyword highlighted inside them
const CARD_NAMES = Object.values(CARDS).map(c => c.name).filter(n => KW_RE.test(n) && !(KW_RE.lastIndex = 0)).sort((a, b) => b.length - a.length);
KW_RE.lastIndex = 0;

/** Wrap known keyword names found in plain text (relic / potion / status text). Card names are left alone. */
export function highlightKeywords(text) {
  const kept = [];
  let s = String(text);
  for (const name of CARD_NAMES) s = s.split(name).join(`\u0000${kept.push(name) - 1}\u0000`);
  s = s.replace(KW_RE, m => kw(m));
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => kept[Number(i)]);
}

export function num(value, base = value) {
  const cls = value > base ? 'num-up' : value < base ? 'num-down' : 'num';
  return `<span class="${cls}">${value}</span>`;
}

const TIMES = n => (n === 2 ? 'twice' : `${n} times`);

// ---------------------------------------------------------------- cards

/**
 * describeCard(cardInst, { combat?, targetUid?, upgradeDiff? }) -> HTML
 *   combat: a live combat (createCombat) to show live numbers (Strength, Weakened, the target's Staggered, relics...)
 *   targetUid: the hovered zombie
 *   upgradeDiff: for an upgraded card, mark numbers that the upgrade raised (upgrade previews)
 */
export function describeCard(inst, opts = {}) {
  if (typeof inst === 'string') inst = { id: inst, up: false };
  const view = cardView(inst);
  const base = opts.upgradeDiff && inst.up ? cardView(inst.id, false) : null;
  let preview = null;
  if (opts.combat && typeof opts.combat.previewCard === 'function') {
    try { preview = opts.combat.previewCard(inst.uid ? inst.uid : inst, opts.targetUid); } catch { preview = null; }
  }
  const v = makeHelpers(view, base, preview);
  let body = typeof view.text === 'function' ? view.text(v) : autoText(view, v);
  const pre = [], post = [];
  for (const k of view.keywords) {
    if (k === 'exhaust') post.push(kw('Exhaust') + '.');
    else if (k === 'unplayable') { if (typeof view.text !== 'function') pre.push(kw('Unplayable') + '.'); }
    else pre.push(kw(cap(k)) + '.');
  }
  if (typeof view.text === 'function' && view.keywords.includes('exhaust') && /data-kw="Exhaust"/.test(body)) post.length = 0;
  return plural([...pre, body, ...post].filter(Boolean).join(' '));
}

function cap(s) { return s[0].toUpperCase() + s.slice(1); }

function makeHelpers(view, base, preview) {
  const dmgOps = [], blkOps = [];
  view.effects.forEach((e, i) => { if (e.op === 'damage') dmgOps.push(i); if (e.op === 'block') blkOps.push(i); });
  const baseOf = (i) => base?.effects?.[i]?.n;
  const fmt = (i) => {
    const e = view.effects[i];
    const live = preview?.ops?.find(o => o.index === i);
    if (live) return num(live.value, live.base);
    const b = baseOf(i);
    return b !== undefined && e.n > b ? num(e.n, b) : num(e.n);
  };
  return {
    e: view.effects, up: view.up, live: !!preview, view,
    d: (k = 0) => (dmgOps[k] !== undefined ? fmt(dmgOps[k]) : num(0)),
    b: (k = 0) => (blkOps[k] !== undefined ? fmt(blkOps[k]) : num(0)),
    n: x => num(x),
    kw,
  };
}

function autoText(view, v) {
  const out = [];
  let di = 0, bi = 0;
  for (const e of view.effects) {
    switch (e.op) {
      case 'damage': {
        const D = v.d(di++);
        const times = e.times || 1;
        let s;
        if (e.to === 'all') s = `Deal ${D} damage to ALL zombies`;
        else if (e.to === 'random') s = `Deal ${D} damage to a random zombie ${TIMES(times)}`;
        else s = `Deal ${D} damage${times > 1 ? ' ' + TIMES(times) : ''}`;
        if (e.bonusStaggered) s += `, +${e.bonusStaggered}${times > 1 ? ' each' : ''} if ${kw('Staggered')}`;
        s += '.';
        if (e.scaleStr && e.scaleStr !== 1) s += ` ${kw('Strength')} counts ${e.scaleStr} times.`;
        out.push(s);
        break;
      }
      case 'block': out.push(`Gain ${v.b(bi++)} ${kw('Block')}.`); break;
      case 'apply': {
        const prev = view.effects[view.effects.indexOf(e) - 1];
        const merge = prev && prev.op === 'apply' && (prev.to || 'target') === 'target' && (e.to || 'target') === 'target' && prev.n > 0 && e.n > 0;
        if (merge) out[out.length - 1] = out[out.length - 1].replace(/\.$/, '') + ` and ${num(e.n)} ${kw(STATUSES[e.status]?.name || e.status)}.`;
        else out.push(applyText(e));
        break;
      }
      case 'draw': out.push(e.n === 1 ? 'Draw 1 card.' : `Draw ${num(e.n)} cards.`); break;
      case 'energy': out.push(`Gain ${num(e.n)} energy.`); break;
      case 'heal': out.push(e.pct ? `Heal ${Math.round(e.pct * 100)}% of your Max HP.` : `Heal ${num(e.n)} HP.`); break;
      case 'loseHp': out.push(`Lose ${num(e.n)} HP.`); break;
      case 'maxHp': out.push(`Raise your Max HP by ${num(e.n)}.`); break;
      case 'tempStrength': out.push(`Gain ${num(e.n)} ${kw('Strength')} this turn.`); break;
      case 'addCard': out.push(`Add ${e.n || 1} ${CARDS[e.id]?.name || e.id} to your ${e.to || 'discard'} pile.`); break;
      default: break;
    }
  }
  return out.join(' ');
}

function applyText(e) {
  const s = STATUSES[e.status];
  const name = kw(s ? s.name : e.status);
  const n = e.n;
  const to = e.to || 'target';
  if (to === 'self' || to === 'party') return n >= 0 ? `Gain ${num(n)} ${name}.` : `Lose ${num(-n)} ${name}.`;
  if (to === 'all') return n >= 0 ? `Apply ${num(n)} ${name} to ALL zombies.` : `ALL zombies lose ${num(-n)} ${name}.`;
  return n >= 0 ? `Apply ${num(n)} ${name}.` : `The zombie loses ${num(-n)} ${name}.`;
}

/** Keyword names a card's tooltip should explain (in order of appearance). */
export function cardKeywords(inst) {
  const html = describeCard(inst);
  const found = [];
  for (const m of html.matchAll(/data-kw="([^"]+)"/g)) if (!found.includes(m[1])) found.push(m[1]);
  return found;
}

export const CARD_TYPE_LABELS = { attack: 'Attack', skill: 'Skill', power: 'Power', status: 'Status', curse: 'Curse' };
export const RARITY_LABELS = { starter: 'Starter', common: 'Common', uncommon: 'Uncommon', rare: 'Rare', weapon: 'Weapon', status: 'Status', curse: 'Curse', shop: 'Shop', special: 'Special' };

// ---------------------------------------------------------------- relics, potions, statuses

export function describeRelic(id) {
  const r = RELICS[id];
  return r ? highlightKeywords(r.text) : '';
}

export function describePotion(id) {
  const p = POTIONS[id];
  return p ? highlightKeywords(p.text) : '';
}

/** describeStatus('vulnerable', 2) -> 'Takes 50% more damage from attacks. 2 turns.' (HTML) */
export function describeStatus(id, amount = 1) {
  const s = STATUSES[id];
  if (!s) return '';
  const neg = s.negative && amount < 0;
  const text = neg && s.textNeg ? s.textNeg : s.text;
  return plural(highlightKeywords(fillN(text, `<span class="num">${Math.abs(amount)}</span>`)));
}

export const statusName = id => STATUSES[id]?.name || id;

// ---------------------------------------------------------------- intents

/**
 * describeIntent(intent, enemy?) -> HTML for the intent tooltip.
 * intent: { type, damage, hits, name, move } (use combat.intentOf(uid) for live damage numbers).
 */
export function describeIntent(intent, enemy) {
  if (!intent) return '';
  const name = intent.name ? `<b>${intent.name}</b>. ` : '';
  const hits = intent.hits || 1;
  const dmg = intent.damage !== undefined && intent.damage !== null
    ? (hits > 1 ? `${num(intent.damage)} damage ${TIMES(hits)}` : `${num(intent.damage)} damage`)
    : '';
  const move = enemy && ENEMIES[enemy.id]?.moves?.[intent.move];
  const extras = move ? moveExtras(move) : '';
  switch (intent.type) {
    case 'attack': return `${name}Will attack for ${dmg}.`;
    case 'attack_block': return `${name}Will attack for ${dmg} and gain ${kw('Block')}.`;
    case 'attack_debuff': return `${name}Will attack for ${dmg}${extras ? ' and ' + extras : ' and apply a debuff'}.`;
    case 'attack_buff': return `${name}Will attack for ${dmg} and grow stronger.`;
    case 'block': return `${name}Will gain ${kw('Block')}.`;
    case 'buff': return `${name}${extras ? 'Will ' + extras : 'Will grow stronger'}.`;
    case 'block_buff': return `${name}Will gain ${kw('Block')} and grow stronger.`;
    case 'debuff': return `${name}${extras ? 'Will ' + extras : 'Will apply a debuff'}.`;
    case 'heal': return `${name}Will heal the other zombies and gain ${kw('Block')}.`;
    case 'sleep': return `${name}It is ${kw('Asleep')}. It wakes when it loses HP.`;
    case 'stun': return `${name}Stunned. It won't act this turn.`;
    default: return `${name}Its next move is unknown.`;
  }
}

function moveExtras(move) {
  const give = [], take = [], gain = [], other = [];
  for (const e of move.effects || []) {
    const s = STATUSES[e.status];
    if (e.op === 'apply' && e.to === 'party') (e.n >= 0 ? give : take).push(`${num(Math.abs(e.n))} ${kw(s.name)}`);
    else if (e.op === 'apply' && e.to === 'self') gain.push(`${num(e.n)} ${kw(s.name)}`);
    else if (e.op === 'addCard') other.push(`add ${e.n || 1} ${CARDS[e.id]?.name || e.id} to your discard pile`);
    else if (e.op === 'revive') other.push('bring a fallen zombie back');
  }
  const and = list => list.join(' and ');
  return [give.length && `apply ${and(give)}`, take.length && `make you lose ${and(take)}`, gain.length && `gain ${and(gain)}`, ...other]
    .filter(Boolean).join(' and ');
}

/** Short label for the intent's type ('Attack', 'Block and Buff'...). */
export const intentLabel = type => INTENT_TYPES[type] || 'Unknown';

/** The number to print over a zombie's head: '11', '5x4', or '' for non-attacks. */
export function intentNumber(intent) {
  if (!intent || intent.damage === undefined || intent.damage === null) return '';
  return (intent.hits || 1) > 1 ? `${intent.damage}x${intent.hits}` : String(intent.damage);
}

export { moveDamage };
