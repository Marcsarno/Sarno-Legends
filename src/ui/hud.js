// The combat UI: top bar, energy orb, piles, End Turn, the hand, targeting, world-anchored HP bars / intents /
// statuses for the party and each zombie, floating numbers, banners, the FINISHER stamp and the damage vignettes.
//   const ui = createCombatUI({ root, stage, studio, getRun, combat, onPlay(uid, targetUid), onEndTurn(),
//                               onPotion(slot, targetUid, action), onOpenDeck(), onOpenMap(), onSettings(), ...extras })
//   ui.onEvent(evt)      the director says this event just landed: HP, block, statuses, intents and the hand move then
//   ui.sync()            re-read combat.state right now (use when not feeding events, or to correct drift)
//   ui.number({ target|uid, hero?, text, kind, x?, y?, big? })    ui.banner(text, kind, sub?)
//   ui.setInputEnabled(bool)   false while the director is still landing a hit: cards released meanwhile wait and play
//                              the moment it opens (they queue). Phase (player / zombies' turn) is tracked from events.
//   ui.destroy()
// Extras (all optional): anchor(id, where) -> Vector3 | Object3D | { x, y } screen px, for id = enemy uid | 'party' |
//   'marc' | 'yola' and where = 'head' | 'feet' (without it the HUD uses stage.slots); audio ({ ui(name) } hooks:
//   'card' 'deny' 'hover' 'click' 'end_turn'); autoNumbers (make floating numbers from events when no director sends
//   them); autoBanners (turn / encounter / finisher banners from events; default true, repeats from the director are
//   merged); onTarget(uid|null) (highlight the 3D zombie); onDeny(reason, uid); onLowHp(bool) (heartbeat audio);
//   onDiscardPotion(slot) (else onPotion(slot, null, 'discard')).
// The HUD keeps its own model, moved only by events, because the engine resolves instantly and runs ahead of the show.

import { STATUSES, isPositive } from '../game/content/statuses.js';
import { ENEMIES } from '../game/content/enemies.js';
import { POTIONS } from '../game/content/potions.js';
import { cardView } from '../game/content/cards.js';
import { statusName } from '../game/text.js';
import { h, clamp } from './dom.js';
import { anim, tweenValue, popIn, shake } from './tween.js';
import { icon, intentGlyph } from './icons.js';
import { cardBack } from './card.js';
import { createHand } from './hand.js';
import { createNumbers } from './numbers.js';
import { openPileViewer } from './piles.js';
import { createTopBar } from './topbar.js';
import { bindTips, tipSource, tipIntent, tipStatus, hideTip } from './tooltip.js';
import './styles/hud.css';

export { createTopBar };

const ECG = 'M4 54 H30 L36 54 L41 38 L47 74 L54 22 L60 62 L64 54 H96';

export function createCombatUI(opts) {
  const {
    root, stage = null, studio = null, getRun = () => null,
    onPlay, onEndTurn, onPotion, onOpenDeck, onOpenMap, onSettings,
    anchor = null, audio = null, autoNumbers = false, autoBanners = true,
    onTarget = null, onDeny = null, onLowHp = null, onDiscardPotion = null,
  } = opts;
  let C = opts.combat;

  // ---------------------------------------------------------------- model (moved by events)
  const S0 = C.state;
  const M = {
    phase: S0.phase === 'setup' ? 'setup' : S0.phase, turn: S0.turn, energy: S0.energy, maxEnergy: S0.maxEnergy,
    hand: [], draw: S0.draw.length, discard: S0.discard.length, exhaust: S0.exhaust.length,
    party: { hp: S0.party.hp, maxHp: S0.party.maxHp, block: S0.party.block, statuses: { ...S0.party.statuses } },
    potions: S0.potions.slice(), enemies: new Map(), over: false, low: false,
  };
  let inputOpen = true, targets = [], target = null, hoverUid = null, destroyed = false;

  // ---------------------------------------------------------------- layers
  const el = h('div.cui');
  const vig = h('div.cui-vig', h('div.cui-vig__low'), h('div.cui-vig__hit'));
  const world = h('div.cui-world');
  const ctl = h('div.cui-hud');
  const handLayer = h('div.cui-handlayer');
  const fx = h('div.cui-fx');
  const bannerLayer = h('div.cui-banners');
  const toastEl = h('div.cui-toast');
  el.append(vig, world, ctl, handLayer, fx, bannerLayer, toastEl);
  root.append(el);
  const nums = createNumbers(fx);
  const unbindTips = bindTips(el);

  // ---------------------------------------------------------------- top bar
  const topbar = createTopBar({
    root: el, getRun, studio,
    onDeck: onOpenDeck, onMap: onOpenMap, onSettings,
    live: () => ({ hp: M.party.hp, maxHp: M.party.maxHp, potions: M.potions, relics: C.state.relics }),
    canUsePotion: (slot, id) => M.phase === 'player' && !M.over && POTIONS[id]?.usable !== false,
    onPotion: (slot, action, slotEl) => potion(slot, action, slotEl),
  });

  // ---------------------------------------------------------------- controls: energy orb, piles, end turn
  const orbCur = h('span.orb__cur', '0'), orbMax = h('span.orb__max', '3');
  const orb = h('div.orb.cui-ctl', { dataset: { tip: 'kw:Energy' } },
    h('div.orb__ring'), h('div.orb__core'),
    h('div.orb__ecg', { html: `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path class="orb__trace-dim" d="${ECG}"/><path class="orb__trace" d="${ECG}" pathLength="100"/></svg>` }),
    h('div.orb__num', orbCur, h('span.orb__slash', '/'), orbMax));
  const pileBtn = (name, label, tip) => {
    const count = h('span.pile__count', '0');
    const b = h(`button.pile.pile--${name}.cui-ctl`, { 'aria-label': label, dataset: { tip: `text:${label}|${tip}` } },
      h('span.pile__stack', h('i'), h('i'), h('i', { html: icon(name === 'exhaust' ? 'exhaust' : name === 'draw' ? 'draw' : 'discard') })), count);
    b._count = count;
    return b;
  };
  const drawBtn = pileBtn('draw', 'Draw pile', 'Cards you draw from. When it runs out, the discard pile is shuffled back in.');
  const discardBtn = pileBtn('discard', 'Discard pile', 'Played and discarded cards. Shuffled back into the draw pile when it runs out.');
  const exhaustBtn = pileBtn('exhaust', 'Exhausted', 'Cards removed for the rest of this fight.');
  const endLabel = h('span.endturn__label', 'End Turn');
  const endBtn = h('button.endturn.cui-ctl', { 'aria-label': 'End turn' }, h('span.endturn__glow'), endLabel, h('kbd.endturn__key', 'E'));
  ctl.append(h('div.cui-left', orb, drawBtn), h('div.cui-right', endBtn, h('div.cui-piles', exhaustBtn, discardBtn)));

  drawBtn.addEventListener('click', () => openPile('draw'));
  discardBtn.addEventListener('click', () => openPile('discard'));
  exhaustBtn.addEventListener('click', () => openPile('exhaust'));
  endBtn.addEventListener('click', () => endTurn());

  function openPile(name) {
    hideTip();
    hand.cancel();
    audio?.ui?.('open');
    const S = C.state;
    const cfg = {
      draw: { title: 'Draw pile', cards: S.draw, note: 'Sorted, not in draw order', icon: 'draw' },
      discard: { title: 'Discard pile', cards: S.discard, icon: 'discard' },
      exhaust: { title: 'Exhausted', cards: S.exhaust, icon: 'exhaust' },
    }[name];
    openPileViewer({ ...cfg, combat: C, studio, root: el });
  }

  // ---------------------------------------------------------------- the hand
  const hand = createHand({
    layer: handLayer, arrowLayer: handLayer, getCombat: () => C, studio, audio,
    pick: (x, y) => pick(x, y),
    targets: () => targets,
    targetPoint: uid => { const a = screenOf(uid, 'feet'), b = screenOf(uid, 'head'); return a && b ? { x: (a.x + b.x) / 2, y: b.y + (a.y - b.y) * 0.4 } : a; },
    pilePos: name => {
      if (name === 'party') { const p = screenOf('party', 'head'); return p ? { x: p.x, y: p.y + 40 } : null; }
      const b = { draw: drawBtn, discard: discardBtn, exhaust: exhaustBtn }[name];
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    energy: () => M.energy,
    canAct: () => M.phase === 'player' && !M.over,
    inputOpen: () => inputOpen,
    onPlay: (uid, t) => {
      const i = M.hand.indexOf(uid);
      if (i >= 0) M.hand.splice(i, 1);
      // spend the energy on screen now; the engine's energy event confirms it
      const cost = C.costOf ? C.costOf(uid) : null;
      if (cost) setEnergy(Math.max(0, M.energy - cost), M.maxEnergy, { quiet: true });
      onPlay?.(uid, t);
      refreshPlayable();
    },
    onDeny: (reason, uid) => {
      if (reason === 'energy') { shake(orb, 7, 380); orb.classList.remove('orb--deny'); void orb.offsetWidth; orb.classList.add('orb--deny'); toast('Not enough energy'); }
      else if (reason === 'unplayable') toast('This card can\'t be played');
      else if (reason === 'target') toast('Pick a zombie');
      onDeny?.(reason, uid);
    },
    onTarget: uid => setTarget(uid),
    onPreview: (cardUid, targetUid) => preview(cardUid, targetUid),
  });

  // ---------------------------------------------------------------- anchors

  function screenOf(id, where) {
    if (anchor) {
      const a = anchor(id, where);
      if (a) return a.isVector3 || a.isObject3D ? stage.project(a) : a;
    }
    const S = stage?.slots;
    if (!S || !stage.project) return null;
    if (id === 'party' || id === 'marc' || id === 'yola') {
      const v = id === 'yola' ? S.yola : id === 'marc' ? S.marc : S.marc.clone().lerp(S.yola, 0.5);
      return stage.project(v, where === 'head' ? 1.95 : 0);
    }
    const e = M.enemies.get(id);
    if (!e) return null;
    const solo = M.enemies.size === 1 && e.size === 'large' && S.boss;
    const v = solo ? S.boss : S.enemy[e.slot % S.enemy.length];
    return stage.project(v, where === 'head' ? 1.76 * (ENEMIES[e.id]?.scale || 1) + 0.12 : 0);
  }

  function pick(x, y) {
    let u = stage?.pick?.(x, y);
    if (u && M.enemies.get(u)?.alive) return u;
    for (const n of document.elementsFromPoint(x, y)) {
      const t = n.dataset?.targetUid;
      if (t && M.enemies.get(t)?.alive) return t;
    }
    return null;
  }

  // ---------------------------------------------------------------- party HUD
  const party = makeBarGroup('party');
  party.root.classList.add('ehud--party');
  party.body = h('div.ehud__body.ehud__body--party', { dataset: { tip: 'party:', tipSide: 'right' } });
  party.root.prepend(h('div.ehud__pips', h('i.pip--marc'), h('i.pip--yola')));
  world.append(party.body, party.root);

  function makeBarGroup(uid) {
    const fill = h('div.hpbar__fill'), ghost = h('div.hpbar__ghost'), bleed = h('div.hpbar__bleed'), text = h('div.hpbar__text', '');
    const blockNum = h('span.blockb__num', '0');
    const blockEl = h('div.blockb', { html: icon('block') }, blockNum);
    const bar = h('div.hpbar', ghost, fill, bleed, h('div.hpbar__gloss'), text);
    const name = h('div.ehud__name');
    const statusEl = h('div.statuses');
    const root = h('div.ehud', name, h('div.ehud__barrow', blockEl, bar), statusEl);
    return { uid, root, bar, fill, ghost, bleed, text, blockEl, blockNum, name, statusEl, chips: new Map(), shownHp: null, shownBlock: 0 };
  }

  // ---------------------------------------------------------------- zombie HUDs
  function ensureEnemy(s) {
    let r = M.enemies.get(s.uid);
    if (!r) {
      r = makeBarGroup(s.uid);
      Object.assign(r, { id: s.id, slot: s.slot, size: s.size || ENEMIES[s.id]?.size || 'medium', tier: s.tier || 'normal', alive: true, hp: s.hp, maxHp: s.maxHp, block: s.block || 0, statuses: { ...(s.statuses || {}) }, intent: null, intentKey: '' });
      r.root.classList.add(`ehud--${r.size}`, `ehud--${r.tier}`);
      r.root.dataset.targetUid = s.uid;
      r.name.textContent = s.name || ENEMIES[s.id]?.name || s.id;
      r.body = h('div.ehud__body', { dataset: { targetUid: s.uid, tip: `enemy:${s.uid}`, tipSide: 'left' } });
      r.intentIcon = h('span.intent__icon');
      r.intentNum = h('span.intent__num');
      r.intentEl = h('div.intent.intent--none', { dataset: { tip: `intent:${s.uid}`, targetUid: s.uid } }, h('div.intent__inner', r.intentIcon, r.intentNum));
      r.moveEl = h('div.movename');
      r.body.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { hoverUid = s.uid; r.root.classList.add('ehud--hover'); } });
      r.body.addEventListener('pointerleave', () => { if (hoverUid === s.uid) hoverUid = null; r.root.classList.remove('ehud--hover'); });
      world.append(r.body, r.root, r.intentEl, r.moveEl);
      M.enemies.set(s.uid, r);
      renderBar(r, true);
      renderStatuses(r);
      popIn(r.root.querySelector('.ehud__barrow'), 300);
    }
    return r;
  }

  function updateTargets() {
    targets = [...M.enemies.values()].filter(r => r.alive).sort((a, b) => a.slot - b.slot).map(r => r.uid);
  }

  // ---------------------------------------------------------------- bars, block, statuses

  function renderBar(r, instant = false) {
    const hp = Math.max(0, r === party ? M.party.hp : r.hp), max = Math.max(1, r === party ? M.party.maxHp : r.maxHp);
    const block = r === party ? M.party.block : r.block;
    const statuses = r === party ? M.party.statuses : r.statuses;
    const pct = clamp(hp / max * 100, 0, 100);
    if (instant || r.shownHp === null) {
      r.ghost.style.transition = 'none'; r.fill.style.transition = 'none';
      r.ghost.style.width = r.fill.style.width = pct + '%';
      void r.ghost.offsetWidth; r.ghost.style.transition = r.fill.style.transition = '';
      r.text.textContent = `${hp}/${max}`;
    } else if (hp !== r.shownHp || max !== r.shownMax) {
      const from = r.shownHp;
      if (hp > from) { r.ghost.style.transition = 'none'; r.ghost.style.width = pct + '%'; void r.ghost.offsetWidth; r.ghost.style.transition = ''; r.bar.classList.remove('hpbar--heal'); void r.bar.offsetWidth; r.bar.classList.add('hpbar--heal'); }
      else { r.bar.classList.remove('hpbar--hit'); void r.bar.offsetWidth; r.bar.classList.add('hpbar--hit'); }
      r.fill.style.width = pct + '%';
      setTimeout(() => { r.ghost.style.width = pct + '%'; }, 30);
      const id = (r.tweenId = (r.tweenId || 0) + 1);
      tweenValue(from, hp, 420, v => { if (r.tweenId === id) r.text.textContent = `${Math.round(v)}/${max}`; });
    }
    r.shownHp = hp; r.shownMax = max;
    // Bleed: the part of the bar it will take at the start of the next turn
    const bl = Math.min(hp, statuses.bleed || 0);
    r.bleed.style.display = bl > 0 ? '' : 'none';
    if (bl > 0) { r.bleed.style.left = ((hp - bl) / max * 100) + '%'; r.bleed.style.width = (bl / max * 100) + '%'; }
    // block
    const had = r.shownBlock;
    r.bar.classList.toggle('hpbar--block', block > 0);
    if (block > 0) {
      r.blockEl.classList.remove('blockb--break');
      r.blockEl.classList.add('blockb--on');
      r.blockNum.textContent = String(block);
      if (block > had) anim(r.blockEl, [{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], 260, 'back');
      else if (block < had) anim(r.blockEl, [{ transform: 'translateX(-3px) rotate(-8deg)' }, { transform: 'none' }], 220, 'out');
    } else if (had > 0) {
      r.blockEl.classList.remove('blockb--on');
      r.blockEl.classList.remove('blockb--break'); void r.blockEl.offsetWidth; r.blockEl.classList.add('blockb--break');
    }
    r.shownBlock = block;
  }

  function renderStatuses(r) {
    const st = r === party ? M.party.statuses : r.statuses;
    const seen = new Set();
    for (const [id, n] of Object.entries(st)) {
      const def = STATUSES[id];
      if (!def || def.hidden || !n) continue;
      seen.add(id);
      let chip = r.chips.get(id);
      const good = isPositive(id, n);
      if (!chip) {
        chip = h(`div.st.st--${good ? 'good' : 'bad'}`, { style: { '--sc': def.color || '#ccc' }, html: icon(def.icon || id) }, h('span.st__n'));
        chip._n = null;
        r.statusEl.append(chip);
        r.chips.set(id, chip);
        anim(chip, [{ transform: 'scale(0) rotate(-30deg)', opacity: 0 }, { transform: 'scale(1.35)', opacity: 1, offset: .6 }, { transform: 'scale(1)' }], 320, 'out');
      }
      chip.dataset.tip = `status:${id}:${n}`;
      chip.classList.toggle('st--good', good); chip.classList.toggle('st--bad', !good);
      const label = def.flag ? '' : String(n);
      if (chip._n !== label) {
        chip.querySelector('.st__n').textContent = label;
        if (chip._n !== null) anim(chip, [{ transform: 'scale(1.45)' }, { transform: 'scale(1)' }], 240, 'back');
        chip._n = label;
      }
    }
    for (const [id, chip] of r.chips) if (!seen.has(id)) {
      r.chips.delete(id);
      anim(chip, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0)', opacity: 0 }], 200, 'in').then(() => chip.remove());
    }
  }

  // ---------------------------------------------------------------- intents

  function setIntent(uid, intent) {
    const r = M.enemies.get(uid);
    if (!r) return;
    const key = intent ? `${intent.type}:${intent.hits || 0}:${intent.move || ''}` : '';
    const dmgChanged = r.intent && intent && key === r.intentKey && r.intent.damage !== intent.damage;
    const prevDmg = r.intent?.damage;
    r.intent = intent;
    if (dmgChanged) {
      writeIntent(r);
      const up = intent.damage > prevDmg;
      r.intentEl.classList.remove('intent--up', 'intent--down'); void r.intentEl.offsetWidth; r.intentEl.classList.add(up ? 'intent--up' : 'intent--down');
      anim(r.intentNum, [{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], 300, 'back');
      return;
    }
    if (key === r.intentKey && !r.intentEl.classList.contains('intent--spent')) { writeIntent(r); return; }
    r.intentKey = key;
    const inner = r.intentEl.firstChild;
    const wasShown = !r.intentEl.classList.contains('intent--none') && !r.intentEl.classList.contains('intent--spent');
    const swap = () => { writeIntent(r); r.intentEl.classList.remove('intent--spent'); return anim(inner, [{ transform: 'rotateX(90deg) scale(.8)', opacity: 0 }, { transform: 'rotateX(0) scale(1)', opacity: 1 }], 240, 'back'); };
    if (wasShown) anim(inner, [{ transform: 'rotateX(0)', opacity: 1 }, { transform: 'rotateX(90deg)', opacity: 0 }], 140, 'in').then(swap);
    else swap();
  }

  function writeIntent(r) {
    const it = r.intent;
    const type = it ? it.type : 'unknown';
    r.intentEl.className = `intent intent--${type}`;
    r.intentEl.style.setProperty('--ic', INTENT_TINT[type] || '#b9c2c4');
    const dmg = it && it.damage !== null && it.damage !== undefined ? it.damage : null;
    const total = dmg !== null ? dmg * Math.max(1, it.hits || 1) : 0;
    if (dmg !== null) r.intentEl.classList.add(total >= 20 ? 'intent--t3' : total >= 10 ? 'intent--t2' : 'intent--t1');
    r.intentIcon.innerHTML = icon(intentGlyph(type));
    if (dmg !== null) r.intentNum.innerHTML = `${dmg}${(it.hits || 1) > 1 ? `<small>×${it.hits}</small>` : ''}`;
    else r.intentNum.textContent = type === 'unknown' ? '' : '';
  }

  function spendIntent(uid, moveName) {
    const r = M.enemies.get(uid);
    if (!r) return;
    if (moveName) {
      r.moveEl.textContent = moveName;
      r.moveEl.classList.remove('movename--on'); void r.moveEl.offsetWidth; r.moveEl.classList.add('movename--on');
    }
    if (r.intentEl.classList.contains('intent--spent')) return;
    anim(r.intentEl.firstChild, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.5)', opacity: 0 }], 260, 'out').then(() => {
      r.intentEl.classList.add('intent--spent');
      r.intentEl.firstChild.style.opacity = '';
      r.intentEl.firstChild.style.transform = '';
    });
  }

  // ---------------------------------------------------------------- damage preview while aiming
  // The part of each zombie's HP bar the held card would take flashes; a lethal hit shows a skull, and a lethal hit on
  // a Staggered zombie says FINISHER (the kill will play a finisher).

  function preview(cardUid, targetUid) {
    for (const r of M.enemies.values()) {
      let loss = 0, lethal = false;
      if (cardUid && r.alive && C.previewCard) {
        const pv = C.previewCard(cardUid, r.uid);
        let dmg = 0;
        for (const op of pv?.ops || []) if (op.op === 'damage' && (op.to === 'all' || (op.to === 'target' && r.uid === targetUid))) dmg += op.value * op.hits;
        loss = Math.max(0, Math.min(r.hp, dmg - r.block));
        lethal = dmg > 0 && loss >= r.hp;
      }
      setPred(r, loss, lethal);
    }
  }

  function setPred(r, loss, lethal) {
    if (!r.pred) {
      r.pred = h('div.hpbar__pred', { style: { display: 'none' } });
      r.bar.insertBefore(r.pred, r.bar.querySelector('.hpbar__gloss'));
      r.kill = h('div.ehud__kill');
      r.root.querySelector('.ehud__barrow').append(r.kill);
    }
    const max = Math.max(1, r.maxHp);
    r.pred.style.display = loss > 0 ? '' : 'none';
    if (loss > 0) { r.pred.style.left = ((r.hp - loss) / max * 100) + '%'; r.pred.style.width = (loss / max * 100) + '%'; }
    const fin = lethal && (r.statuses.vulnerable || 0) > 0;
    r.root.classList.toggle('ehud--lethal', lethal);
    r.root.classList.toggle('ehud--finisher', fin);
    if (lethal) r.kill.innerHTML = fin ? '<span>Finisher</span>' : icon('skull');
  }

  // ---------------------------------------------------------------- targeting highlight

  function setTarget(uid) {
    if (target === uid) return;
    if (target) M.enemies.get(target)?.root.classList.remove('ehud--targeted');
    target = uid;
    if (uid) M.enemies.get(uid)?.root.classList.add('ehud--targeted');
    reticle.classList.remove('reticle--on'); void reticle.offsetWidth;
    reticle.classList.toggle('reticle--on', !!uid);
    onTarget?.(uid);
  }
  const reticle = h('div.reticle', h('i'), h('i'), h('i'), h('i'));
  world.append(reticle);

  // ---------------------------------------------------------------- per frame: follow the stage

  let raf = 0;
  function frame() {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    // world bars sit under the feet, but never down in the hand: lift bar + status row above its resting top
    const vmin = Math.min(innerWidth, innerHeight) / 100;
    const blockH = clamp(4.3 * vmin, 19, 32) + clamp(2.4 * vmin, 11, 18) + 3 * Math.max(2, 0.5 * vmin);
    const floorY = hand.restTop() - blockH - 8;
    place(party, screenOf('party', 'feet'), screenOf('party', 'head'), floorY, true);
    for (const r of M.enemies.values()) place(r, screenOf(r.uid, 'feet'), screenOf(r.uid, 'head'), floorY, false);
    if (target) {
      const r = M.enemies.get(target);
      if (r?._box) { const b = r._box; reticle.style.transform = `translate(${b.x}px, ${b.y}px)`; reticle.style.width = b.w + 'px'; reticle.style.height = b.h + 'px'; }
    }
  }

  function place(r, feet, head, floorY, isParty) {
    const vis = !feet || feet.visible === false ? 'hidden' : '';
    if (r._vis !== vis) { r.root.style.visibility = vis; if (r.intentEl) r.intentEl.style.visibility = vis; r._vis = vis; }
    if (!feet) return;
    const y = Math.min(feet.y + 4, floorY);
    const tf = `translate(${feet.x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    if (r._tf !== tf) { r.root.style.transform = tf; r._tf = tf; }
    if (head) {
      const hgt = Math.max(40, feet.y - head.y);
      const w = hgt * (isParty ? 1.25 : (r.size === 'large' ? 0.6 : 0.5));
      const box = { x: feet.x - w / 2, y: head.y - hgt * 0.04, w, h: hgt * 1.02 };
      if (isParty) { const m = screenOf('marc', 'feet'), yo = screenOf('yola', 'feet'); if (m && yo) { box.x = Math.min(m.x, yo.x) - hgt * 0.22; box.w = Math.abs(m.x - yo.x) + hgt * 0.44; } }
      r._box = box;
      const bs = `translate(${box.x.toFixed(1)}px, ${box.y.toFixed(1)}px)`;
      if (r.body && r._bs !== bs + box.w + box.h) { r.body.style.transform = bs; r.body.style.width = box.w + 'px'; r.body.style.height = box.h + 'px'; r._bs = bs + box.w + box.h; }
      if (r.intentEl) {
        const it = `translate(${head.x.toFixed(1)}px, ${(head.y - 6).toFixed(1)}px)`;
        if (r._it !== it) { r.intentEl.style.transform = it; r.moveEl.style.transform = `translate(${head.x.toFixed(1)}px, ${(head.y - 6).toFixed(1)}px)`; r._it = it; }
      }
    }
  }

  // ---------------------------------------------------------------- energy, piles, end turn

  function setEnergy(n, max = M.maxEnergy, { quiet = false } = {}) {
    const gained = n > M.energy;
    M.energy = n; M.maxEnergy = max;
    orbCur.textContent = String(n); orbMax.textContent = String(max);
    orb.classList.toggle('orb--empty', n <= 0);
    orb.classList.toggle('orb--over', n > max);
    if (gained && !quiet) { orb.classList.remove('orb--gain'); void orb.offsetWidth; orb.classList.add('orb--gain'); }
    refreshPlayable();
  }

  function updatePiles() {
    for (const [b, n] of [[drawBtn, M.draw], [discardBtn, M.discard], [exhaustBtn, M.exhaust]]) {
      if (b._count.textContent !== String(n)) {
        b._count.textContent = String(n);
        anim(b._count, [{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], 220, 'back');
      }
    }
    exhaustBtn.classList.toggle('pile--empty', M.exhaust === 0);
  }

  function playableNow(uid) {
    const c = C.findCard?.(uid);
    if (!c) return false;
    const cost = C.costOf ? C.costOf(uid) : c.cost;
    return cost !== null && cost !== undefined && cost <= M.energy && !cardView(c).keywords.includes('unplayable');
  }

  function refreshPlayable() {
    hand.refresh();
    const can = M.phase === 'player' && !M.over;
    const any = M.hand.some(playableNow);
    endBtn.classList.toggle('endturn--glow', can && !any);
  }

  function setEndTurn(state) {
    endBtn.dataset.state = state;
    endBtn.disabled = state !== 'ready';
    endLabel.textContent = state === 'enemy' ? 'Zombies’ Turn' : state === 'over' ? (M.phase === 'won' ? 'Cleared' : '—') : state === 'wait' ? 'Ending…' : 'End Turn';
    refreshPlayable();
  }

  function endTurn() {
    if (M.phase !== 'player' || M.over || endBtn.disabled) return;
    hand.cancel();
    hideTip();
    audio?.ui?.('end_turn');
    setEndTurn('wait');
    onEndTurn?.();
  }

  // ---------------------------------------------------------------- potions

  function potion(slot, action, slotEl) {
    const id = M.potions[slot];
    if (!id) return;
    if (action === 'discard') {
      if (onDiscardPotion) onDiscardPotion(slot); else onPotion?.(slot, null, 'discard');
      M.potions[slot] = null;
      topbar.update();
      return;
    }
    const def = POTIONS[id];
    if (def?.target === 'enemy') {
      toast('Pick a zombie');
      hand.aim({ from: slotEl, onPick: uid => onPotion?.(slot, uid, 'use'), onCancel: () => {} });
    } else onPotion?.(slot, null, 'use');
  }

  // ---------------------------------------------------------------- banners, stamp, toast, vignettes

  const recentBanners = new Map();
  let bannerEl = null;
  function banner(text, kind = 'info', sub = '') {
    const key = `${kind === 'encounter' || kind === 'elite' || kind === 'boss' ? 'enc' : kind}|${String(text).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const now = performance.now();
    if (now - (recentBanners.get(key) || -1e9) < 2500) return;
    recentBanners.set(key, now);
    if (kind === 'finisher') return stamp(text);
    if (bannerEl) { const old = bannerEl; anim(old, [{ opacity: 1 }, { opacity: 0 }], 120).then(() => old.remove()); }
    const chip = kind === 'elite' ? 'Elite' : kind === 'boss' ? 'Boss' : null;
    const b = h(`div.banner.banner--${kind}`, h('div.banner__band'),
      h('div.banner__content', chip ? h('div.banner__chip', chip) : null, h('div.banner__text', text), sub ? h('div.banner__sub', sub) : null));
    bannerLayer.append(b);
    bannerEl = b;
    const hold = kind === 'player' || kind === 'enemy' ? 650 : 1250;
    anim(b.firstChild, [{ transform: 'scaleY(0)', opacity: 0 }, { transform: 'scaleY(1)', opacity: 1 }], 200, 'out');
    anim(b.lastChild, [{ transform: 'translateX(6%)', opacity: 0, letterSpacing: '.3em' }, { transform: 'none', opacity: 1, letterSpacing: '.06em' }], 320, 'out')
      .then(() => new Promise(res => setTimeout(res, hold)))
      .then(() => anim(b, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-4%)' }], 260, 'in'))
      .then(() => { b.remove(); if (bannerEl === b) bannerEl = null; });
  }

  function stamp(text = 'FINISHER') {
    const s = h('div.stamp', h('div.stamp__splat'), h('div.stamp__ink', text));
    bannerLayer.append(s);
    anim(s, [{ transform: 'translate(-50%, -50%) rotate(-14deg) scale(2.8)', opacity: 0 }, { transform: 'translate(-50%, -50%) rotate(-7deg) scale(.94)', opacity: 1, offset: .7 }, { transform: 'translate(-50%, -50%) rotate(-7deg) scale(1)', opacity: 1 }], 190, 'in')
      .then(() => { shake(el, 10, 300); return new Promise(res => setTimeout(res, 950)); })
      .then(() => anim(s, [{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%, -50%) rotate(-7deg) scale(1.08)' }], 320, 'in'))
      .then(() => s.remove());
  }

  let toastT = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.remove('cui-toast--on'); void toastEl.offsetWidth; toastEl.classList.add('cui-toast--on');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('cui-toast--on'), 1400);
  }

  function hitVignette(frac) {
    const k = clamp(0.35 + frac * 5, 0.35, 1);
    anim(vig.lastChild, [{ opacity: 0 }, { opacity: k, offset: .15 }, { opacity: 0 }], 650, 'out');
  }

  function checkLow() {
    const low = M.party.hp > 0 && M.party.hp / Math.max(1, M.party.maxHp) <= 0.3;
    if (low !== M.low) { M.low = low; el.classList.toggle('cui--low', low); onLowHp?.(low); }
  }

  // ---------------------------------------------------------------- floating numbers

  function number({ target: t, uid, hero, text, kind = 'damage', x, y, big = false }) {
    const id = t ?? uid;
    let px = x, py = y;
    if (px == null || py == null) {
      const who = id === 'party' ? (hero || 'party') : id;
      const head = screenOf(who, 'head'), feet = screenOf(who, 'feet');
      if (!head) return;
      px = head.x + (Math.random() - 0.5) * 20;
      py = feet ? head.y + (feet.y - head.y) * 0.3 : head.y + 30;
    }
    nums.pop({ x: px, y: py, text, kind, big, key: `${id}:${kind === 'damage' || kind === 'blocked' ? 'd' : 's'}` });
  }

  // ---------------------------------------------------------------- events

  function onEvent(e) {
    if (destroyed || !e) return;
    switch (e.t) {
      case 'combat_start': {
        M.over = false;
        M.draw = C.run?.deck?.length ?? M.draw;
        for (const s of e.enemies || []) ensureEnemy(s);
        updateTargets(); updatePiles();
        if (autoBanners) banner(e.name || 'Zombies', e.boss ? 'boss' : e.elite ? 'elite' : 'encounter', e.boss ? 'The way up is through it' : e.elite ? 'A tough one' : '');
        break;
      }
      case 'turn_start':
        M.turn = e.turn; M.phase = e.side;
        if (e.side === 'player') setEndTurn('ready'); else { hand.cancel(); setEndTurn('enemy'); }
        if (autoBanners) banner(e.side === 'player' ? 'Your Turn' : 'Zombies’ Turn', e.side === 'player' ? 'player' : 'enemy', e.side === 'player' ? `Turn ${e.turn}` : '');
        refreshPlayable();
        break;
      case 'energy': setEnergy(e.energy, e.max ?? M.maxEnergy); break;
      case 'draw':
        for (const u of e.uids) if (!M.hand.includes(u)) M.hand.push(u);
        M.draw = Math.max(0, M.draw - e.uids.length);
        hand.set(M.hand); updatePiles(); refreshPlayable();
        break;
      case 'shuffle': M.draw = e.count; M.discard = 0; shuffleFx(); updatePiles(); break;
      case 'discard': {
        let k = 0;
        for (const u of e.uids) {
          const i = M.hand.indexOf(u);
          if (i >= 0) { M.hand.splice(i, 1); const d = k++ * 45; d ? setTimeout(() => hand.remove(u, 'discard'), d) : hand.remove(u, 'discard'); }
        }
        M.discard += e.uids.length; updatePiles(); refreshPlayable();
        break;
      }
      case 'exhaust': {
        const i = M.hand.indexOf(e.uid);
        if (i >= 0) { M.hand.splice(i, 1); hand.remove(e.uid, 'exhaust'); }
        M.exhaust += 1; updatePiles(); refreshPlayable();
        break;
      }
      case 'card_created':
        if (e.to === 'hand') { M.hand.push(e.uid); hand.add(e.uid, 'center'); }
        else { if (e.to === 'draw') M.draw++; else M.discard++; ghostCard(e.to); updatePiles(); }
        refreshPlayable();
        break;
      case 'card_played': {
        const i = M.hand.indexOf(e.uid);
        if (i >= 0) { M.hand.splice(i, 1); hand.remove(e.uid, e.to === 'power' ? 'power' : e.to === 'exhaust' ? 'exhaust' : 'discard', { play: true }); }
        break;
      }
      case 'damage': onDamage(e); break;
      case 'block': {
        if (e.target === 'party') M.party.block = e.block; else { const r = M.enemies.get(e.target); if (r) r.block = e.block; }
        renderBar(e.target === 'party' ? party : M.enemies.get(e.target) || party);
        if (autoNumbers && e.amount > 0) number({ target: e.target, text: '+' + e.amount, kind: 'block' });
        if (e.target === 'party') refreshPlayable();
        break;
      }
      case 'heal': {
        if (e.target === 'party') { M.party.hp = e.hp; if (e.maxHp) M.party.maxHp = e.maxHp; renderBar(party); topbar.update(); checkLow(); }
        else { const r = M.enemies.get(e.target); if (r) { r.hp = e.hp; renderBar(r); } }
        if (autoNumbers && e.amount > 0) number({ target: e.target, text: '+' + e.amount, kind: 'heal' });
        break;
      }
      case 'status': {
        const owner = e.target === 'party' ? M.party : M.enemies.get(e.target);
        if (!owner) break;
        if (e.total === 0) delete owner.statuses[e.status]; else owner.statuses[e.status] = e.total;
        const r = e.target === 'party' ? party : owner;
        renderStatuses(r); renderBar(r);
        if (autoNumbers && !e.quiet && e.delta) {
          const good = isPositive(e.status, e.delta);
          const name = statusName(e.status);
          number({ target: e.target, text: e.delta > 0 && STATUSES[e.status]?.stack !== 'counter' ? `+${e.delta} ${name}` : name, kind: good ? 'buff' : 'debuff' });
        }
        if (e.target === 'party') refreshPlayable();
        break;
      }
      case 'death': {
        const r = M.enemies.get(e.target);
        if (!r) break;
        r.alive = false; r.hp = 0; renderBar(r);
        r.root.classList.add('ehud--dead'); r.intentEl.classList.add('intent--dead'); r.body.classList.add('ehud__body--dead');
        if (target === e.target) { hand.cancel(); setTarget(null); }
        updateTargets();
        if (autoBanners && e.finisher) banner('FINISHER', 'finisher');
        break;
      }
      case 'revive': {
        const r = M.enemies.get(e.uid);
        if (!r) break;
        r.alive = true; r.hp = e.hp;
        r.root.classList.remove('ehud--dead'); r.intentEl.classList.remove('intent--dead'); r.body.classList.remove('ehud__body--dead');
        renderBar(r); popIn(r.root.querySelector('.ehud__barrow'), 360); updateTargets();
        if (autoNumbers) number({ target: e.uid, text: 'REVIVED', kind: 'buff' });
        break;
      }
      case 'escape': { const r = M.enemies.get(e.uid); if (r) { r.alive = false; r.root.classList.add('ehud--dead'); r.intentEl.classList.add('intent--dead'); updateTargets(); } break; }
      case 'intent': setIntent(e.uid, e.intent); break;
      case 'enemy_move': spendIntent(e.uid, e.name); break;
      case 'relic': topbar.flashRelic(e.id); topbar.update(); break;
      case 'potion': if (e.slot !== undefined) M.potions[e.slot] = null; topbar.update(); break;
      case 'gold': topbar.update(); break;
      case 'combat_end':
        M.over = true; M.phase = e.won ? 'won' : 'lost';
        hand.cancel(); setTarget(null);
        setEndTurn('over');
        setTimeout(() => { if (!destroyed) hand.setVisible(false); }, 500);
        break;
      default: break;
    }
  }

  function onDamage(e) {
    if (e.target === 'party') {
      M.party.hp = e.hp; M.party.block = e.block;
      renderBar(party);
      if (e.amount > 0) {
        hitVignette(e.amount / Math.max(1, M.party.maxHp));
        shake(party.root.querySelector('.ehud__barrow'), 6, 300);
      }
      topbar.update(); checkLow();
    } else {
      const r = M.enemies.get(e.target);
      if (!r) return;
      r.hp = e.hp; r.block = e.block;
      if (r.pred) setPred(r, 0, false);
      renderBar(r);
      if (e.amount > 0) { r.root.classList.remove('ehud--hit'); void r.root.offsetWidth; r.root.classList.add('ehud--hit'); }
    }
    if (autoNumbers) {
      if (e.amount > 0) number({ target: e.target, hero: e.hero, text: String(e.amount), kind: 'damage', big: e.amount >= 15 || e.staggered });
      if (e.blocked > 0) number({ target: e.target, hero: e.hero, text: e.amount > 0 ? `${e.blocked} blocked` : 'BLOCKED', kind: 'blocked' });
    }
  }

  // a face-down card flying between piles (shuffles and created cards)
  function flyBack(from, to, delay = 0, size = 0.32) {
    const b = cardBack('hand');
    b.classList.add('cui-ghost');
    fx.append(b);
    const w = b.offsetWidth, hh = b.offsetHeight;
    const at = (p, s, r, o) => ({ transform: `translate(${p.x - w / 2}px, ${p.y - hh / 2}px) rotate(${r}deg) scale(${s})`, opacity: o });
    const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - innerHeight * 0.18 };
    b.animate([at(from, size, 10, 0), { ...at(from, size, 10, 1), offset: .08 }, { ...at(mid, size * 1.3, -160, 1), offset: .5 }, at(to, size, -350, 0.2)], { duration: 520, delay, easing: 'cubic-bezier(.4,.1,.4,1)', fill: 'both' })
      .finished.then(() => b.remove(), () => b.remove());
  }
  function pileCenter(b) { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function shuffleFx() { const a = pileCenter(discardBtn), b = pileCenter(drawBtn); for (let i = 0; i < 5; i++) flyBack(a, b, i * 60); }
  function ghostCard(to) { const p = { x: innerWidth / 2, y: innerHeight * 0.45 }; flyBack(p, pileCenter(to === 'draw' ? drawBtn : discardBtn), 0, 0.6); }

  // ---------------------------------------------------------------- tooltips with live data

  const unsources = [
    tipSource('intent', uid => { const r = M.enemies.get(uid); if (!r || !r.alive) return null; return tipIntent(C.intentOf?.(uid) || r.intent, { id: r.id, name: r.name.textContent }); }),
    tipSource('enemy', uid => {
      const r = M.enemies.get(uid);
      if (!r || !r.alive) return null;
      const list = [{ title: r.name.textContent, body: `<b>${r.hp}/${r.maxHp}</b> HP${r.block ? ` · <b>${r.block}</b> ${'Block'}` : ''}`, icon: r.tier === 'boss' ? 'node_boss' : r.tier === 'elite' ? 'node_elite' : 'node_fight', color: r.tier === 'boss' ? '#ff5a47' : r.tier === 'elite' ? '#e3b04b' : '#9fb0ae', sub: r.tier === 'normal' ? '' : r.tier }];
      const it = tipIntent(C.intentOf?.(uid) || r.intent, { id: r.id, name: '' });
      if (it) list.push(it);
      for (const [id, n] of Object.entries(r.statuses)) if (STATUSES[id] && n) list.push(tipStatus(id, n));
      return list;
    }),
    tipSource('party', () => {
      const list = [{ title: 'Marc & Yola', body: `<b>${M.party.hp}/${M.party.maxHp}</b> shared HP${M.party.block ? ` · <b>${M.party.block}</b> Block` : ''}. Zombies hit one of them, but the HP is shared.`, icon: 'hp', color: '#d94a3d' }];
      for (const [id, n] of Object.entries(M.party.statuses)) if (STATUSES[id] && n) list.push(tipStatus(id, n));
      return list;
    }),
  ];

  // ---------------------------------------------------------------- sync (read the engine directly)

  function sync() {
    const S = C.state;
    M.phase = S.phase === 'setup' ? M.phase : S.phase; M.turn = S.turn; M.over = C.over;
    M.hand = S.hand.map(c => c.uid);
    M.draw = S.draw.length; M.discard = S.discard.length; M.exhaust = S.exhaust.length;
    M.party = { hp: S.party.hp, maxHp: S.party.maxHp, block: S.party.block, statuses: { ...S.party.statuses } };
    M.potions = S.potions.slice();
    for (const e of S.enemies) {
      const r = ensureEnemy(e);
      Object.assign(r, { hp: e.hp, maxHp: e.maxHp, block: e.block, statuses: { ...e.statuses } });
      if (r.alive !== e.alive) { r.alive = e.alive; r.root.classList.toggle('ehud--dead', !e.alive); r.intentEl.classList.toggle('intent--dead', !e.alive); r.body.classList.toggle('ehud__body--dead', !e.alive); }
      renderBar(r); renderStatuses(r);
      if (e.alive) setIntent(e.uid, C.intentOf?.(e.uid) || e.intent);
    }
    for (const uid of [...M.enemies.keys()]) if (!S.enemies.find(e => e.uid === uid)) { const r = M.enemies.get(uid); r.root.remove(); r.body.remove(); r.intentEl.remove(); r.moveEl.remove(); M.enemies.delete(uid); }
    updateTargets();
    renderBar(party); renderStatuses(party);
    setEnergy(S.energy, S.maxEnergy, { quiet: true });
    updatePiles();
    setEndTurn(M.over ? 'over' : M.phase === 'player' ? 'ready' : 'enemy');
    hand.setVisible(!M.over);
    hand.set(M.hand);
    topbar.update(); checkLow();
    refreshPlayable();
  }

  // ---------------------------------------------------------------- keys, start

  const onKey = e => {
    if (e.target.closest?.('input, textarea')) return;
    if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); endTurn(); }
  };
  addEventListener('keydown', onKey);

  renderBar(party, true); renderStatuses(party);
  checkLow();
  setEnergy(M.energy, M.maxEnergy, { quiet: true });
  updatePiles();
  setEndTurn(M.phase === 'player' ? 'ready' : M.phase === 'setup' ? 'setup' : 'enemy');
  raf = requestAnimationFrame(frame);

  function destroy() {
    destroyed = true;
    cancelAnimationFrame(raf);
    removeEventListener('keydown', onKey);
    unbindTips(); unsources.forEach(f => f());
    hideTip();
    hand.destroy(); topbar.destroy();
    clearTimeout(toastT);
    el.remove();
  }

  return {
    el, hand, topbar, model: M,
    sync, onEvent, number, banner, toast, destroy,
    finisher: () => banner('FINISHER', 'finisher'),
    setInputEnabled(on) { inputOpen = !!on; },
    setCombat(c) { C = c; sync(); },
    screenOf,
  };
}

const INTENT_TINT = {
  attack: '#ff6a55', attack_block: '#ff8a5c', attack_debuff: '#ff7aa0', attack_buff: '#ff9b4a',
  block: '#7fb8e6', buff: '#9fe07a', block_buff: '#7ed6c8', debuff: '#cf8ae0', heal: '#86e88f',
  sleep: '#9fb0d8', stun: '#f0d878', unknown: '#c8cfd2',
};
