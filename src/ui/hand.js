// The hand: cards in one gentle arc along the bottom, and every way to play them.
//   const hand = createHand({ layer, arrowLayer, getCombat, pick, targets, targetPoint, pilePos, energy, canAct,
//                             inputOpen, onPlay, onDeny, onTarget, onPreview, onHover, studio, audio })
//   onPreview(cardUid|null, targetUid|null): a card is aimed at a zombie, or held above the play line (AoE previews)
//   hand.set(uids)                 match the hand to this list (new cards fly in from the draw pile, missing ones to discard)
//   hand.add(uid, from)            from: 'draw' | 'center' (a card made mid-fight)
//   hand.remove(uid, fate)         fate: 'discard' | 'exhaust' | 'power' | 'vanish' (played cards stop at the play spot first)
//   hand.refresh()                 playable glow, red costs, live numbers (call when energy or statuses change)
//   hand.cancel(), hand.aim({ from, onPick, onCancel }) (potion targeting), hand.destroy()
// Input: mouse hover lifts and zooms the card under the pointer (by x position, so neighbours don't flicker) and
// spreads its neighbours. Drag up past the play line to play; targeted cards then aim a curved arrow at the zombie
// under the pointer (snapped, highlighted). A mouse click picks a card up (it follows the pointer; click to play,
// right-click or click the hand to put it back). On touch, tap selects (zoomed), tap again or tap a zombie to play;
// sliding a finger along the hand scrubs through the cards. Keys: 1-9/0 pick, Left/Right/Tab pick a target,
// Enter/Space play, Esc cancel. Positions are springs updated every frame, so every motion can be interrupted.

import { cardView } from '../game/content/cards.js';
import { cardEl, attachStudioArt, setCardCost, updateCardNumbers } from './card.js';
import { h, clamp, safeInsets } from './dom.js';
import { getSpeed } from './tween.js';
import { showTip, hideTip, tipCardKeywords, suppressTips } from './tooltip.js';
import { createTargeting } from './targeting.js';
import './styles/hand.css';

const IN_HAND = new Set(['hand', 'drag', 'carry', 'select', 'aim', 'pending']);

export function createHand(o) {
  const layer = h('div.hand');
  o.layer.append(layer);
  const arrow = createTargeting(o.arrowLayer || o.layer);
  const cards = new Map();        // uid -> record (cards that belong to the hand)
  const flying = new Set();       // records on their way out
  let order = [];                 // uid order of the hand
  let G = geometry();
  let hovered = null;             // uid
  let mode = 'idle';              // idle | press | drag | carry | select
  let active = null;              // the record being pressed / dragged / carried / selected
  let press = null;               // { x0, y0, t0, id, type, gx, gy }
  let pointer = { x: -1, y: -1, type: 'mouse', vx: 0, t: 0 };
  let target = null;              // aimed zombie uid
  let kbTarget = null;
  let potionAim = null;           // { from, onPick, onCancel }
  let visible = true, destroyed = false, raf = 0, lastT = performance.now();
  let tipFor = null, tipT = 0, wasBusy = false, previewKey = '';

  // ---------------------------------------------------------------- geometry

  function geometry() {
    const vw = innerWidth, vh = innerHeight;
    const probe = layer.querySelector('.card') || (() => { const p = cardEl('bat_swing', { size: 'hand' }); p.style.visibility = 'hidden'; layer.append(p); return p; })();
    const W = probe.offsetWidth || 120;
    if (probe.style.visibility === 'hidden') probe.remove();
    const H = W * 1.4;
    const phone = vh < 520;
    const zoom = clamp(vh * (phone ? 0.6 : 0.5) / H, 1.25, phone ? 1.85 : 1.6);
    const sink = -0.03;
    const side = Math.max(vw * 0.165, 120);
    // a notched phone's home bar: the hand sits above it (a drag that starts on the very edge is the system's swipe)
    const sab = safeInsets().b;
    return { vw, vh, W, H, zoom, sink, side, sab, baseY: vh - sab - H / 2 + H * sink, lineY: vh - sab - H * 1.18, phone };
  }

  function slots() {
    const list = order.filter(uid => cards.get(uid)?.state === 'hand' || (cards.get(uid)?.state === 'select' && !needsTarget(cards.get(uid))));
    const n = list.length;
    const avail = Math.max(G.W * 2, G.vw - G.side * 2);
    const spacing = n > 1 ? Math.min(G.W * 0.94, (avail - G.W) / (n - 1)) : 0;
    const fan = n > 1 ? Math.min(3.4, 24 / n) : 0;
    const out = new Map();
    list.forEach((uid, i) => {
      const t = i - (n - 1) / 2;
      const drop = Math.min(G.H * 0.05, (t * fan) * (t * fan) * G.H * 0.0009);
      out.set(uid, { i, x: G.vw / 2 + t * spacing, y: G.baseY + drop, r: t * fan });
    });
    return { map: out, list, spacing, n };
  }

  // ---------------------------------------------------------------- records

  function make(uid, from = 'draw', delay = 0) {
    const C = o.getCombat();
    const inst = C?.findCard?.(uid) || { uid, id: 'bile', up: false };
    const el = cardEl(inst, { size: 'hand', combat: C });
    el.classList.add('hand-card');
    el.dataset.uid = uid;
    layer.append(el);
    const view = cardView(inst);
    const rec = { uid, el, view, inst, x: 0, y: 0, r: 0, s: 1, o: 0, tx: 0, ty: 0, tr: 0, ts: 1, to: 1, k: 14, state: 'hand', born: performance.now() + delay, shake: 0, steps: null };
    const p = from === 'center' ? { x: G.vw / 2, y: G.vh * 0.42 } : (o.pilePos?.('draw') || { x: 40, y: G.vh - 40 });
    Object.assign(rec, from === 'center' ? { x: p.x, y: p.y, s: 1.15, r: 0, o: 0 } : { x: p.x, y: p.y, s: 0.18, r: -24, o: 0 });
    el.addEventListener('pointerdown', e => onCardDown(e, rec));
    el.addEventListener('contextmenu', e => e.preventDefault());
    attachStudioArt(el, o.studio);
    apply(rec);
    return rec;
  }

  function needsTarget(rec) { return rec.view.target === 'enemy'; }

  function set(uids, { from = 'draw' } = {}) {
    for (const [uid, rec] of cards) if (!uids.includes(uid) && rec.state !== 'pending') remove(uid, 'discard');
    let d = 0;
    for (const uid of uids) if (!cards.has(uid)) { cards.set(uid, make(uid, from, d * 85)); d++; }
    order = uids.filter(u => cards.has(u)).concat(order.filter(u => cards.get(u)?.state === 'pending' && !uids.includes(u)));
    G = geometry();
    refresh();
  }

  function add(uid, from = 'draw', delay = 0) {
    if (cards.has(uid)) return;
    cards.set(uid, make(uid, from, delay));
    order.push(uid);
    refresh();
  }

  /** Send a hand card out. fate: discard | exhaust | power | vanish; play: stop at the play spot first. */
  function remove(uid, fate = 'discard', { play = false } = {}) {
    const rec = cards.get(uid);
    if (!rec) return false;
    if (active === rec) endInteraction(false);
    if (hovered === uid) hovered = null;
    cards.delete(uid);
    order = order.filter(u => u !== uid);
    rec.state = 'fly';
    rec.el.classList.remove('card--playable', 'card--dim', 'card--selected', 'card--ready', 'card--hover');
    rec.el.classList.add('hand-card--out');
    const spot = playSpot();
    const steps = [];
    if (play) steps.push({ tx: spot.x, ty: spot.y, ts: G.phone ? 1.05 : 1.1, tr: 0, to: 1, k: 20, dur: 260 });
    if (fate === 'discard') { const p = o.pilePos?.('discard') || { x: G.vw - 40, y: G.vh - 40 }; steps.push({ tx: p.x, ty: p.y, ts: 0.18, tr: 28, to: 0.0, k: 9, ko: 5, dur: 430 }); }
    else if (fate === 'exhaust') steps.push({ burn: true, dur: 640, k: 4 });
    else if (fate === 'power') { const p = o.pilePos?.('party') || { x: G.vw * 0.22, y: G.vh * 0.5 }; steps.push({ cls: 'hand-card--power', tx: p.x, ty: p.y, ts: 0.2, tr: 0, to: 0, k: 7, ko: 4, dur: 520 }); }
    else steps.push({ ts: 0.85, to: 0, k: 10, ko: 9, dur: 300 });
    rec.steps = steps; rec.step = -1; rec.stepT = 0;
    flying.add(rec);
    nextStep(rec);
    hideTipFor(rec);
    return true;
  }

  function nextStep(rec) {
    rec.step++;
    rec.stepT = performance.now();
    const st = rec.steps[rec.step];
    if (!st) { rec.el.remove(); flying.delete(rec); return; }
    for (const k of ['tx', 'ty', 'ts', 'tr', 'to']) if (st[k] !== undefined) rec[k] = st[k];
    rec.k = st.k ?? 14; rec.ko = st.ko;
    if (st.cls) rec.el.classList.add(st.cls);
    if (st.burn) burn(rec);
  }

  function burn(rec) {
    rec.el.classList.add('hand-card--burn');
    for (let i = 0; i < 12; i++) {
      const e = h('span.ember', { style: { left: `${10 + Math.random() * 80}%`, top: `${30 + Math.random() * 65}%`, animationDelay: `${Math.random() * 260}ms`, '--dx': `${(Math.random() - 0.5) * 60}px` } });
      rec.el.append(e);
    }
  }

  // ---------------------------------------------------------------- per frame

  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastT) / 1000) * Math.max(1, getSpeed() * 0.85);
    lastT = now;
    const S = slots();
    const hov = hovered && cards.get(hovered)?.state === 'hand' ? hovered : null;
    const hi = hov ? S.map.get(hov)?.i : null;
    const push = hov !== null ? Math.max(0, G.W * G.zoom * 0.5 + G.W * 0.42 - S.spacing) : 0;

    for (const rec of cards.values()) {
      const slot = S.map.get(rec.uid);
      if (now < rec.born) { const p = o.pilePos?.('draw'); if (p) { rec.x = p.x; rec.y = p.y; } continue; }
      if (rec.state === 'hand' || (rec.state === 'select' && slot)) {
        if (!slot) continue;
        if (rec.uid === hov || rec.state === 'select') {
          rec.tx = clamp(slot.x, G.W * G.zoom / 2 + 4, G.vw - G.W * G.zoom / 2 - 4);
          rec.ty = G.vh - G.sab - G.H * G.zoom / 2 - 4;
          rec.tr = 0; rec.ts = G.zoom; rec.z = 200;
        } else {
          let dx = 0;
          if (hi !== null && hi !== undefined) {
            const d = slot.i - hi, ad = Math.abs(d);
            dx = Math.sign(d) * push * (ad === 1 ? 1 : ad === 2 ? 0.6 : 0.35);
          }
          rec.tx = slot.x + dx; rec.ty = slot.y + (hov ? G.H * 0.012 : 0); rec.tr = slot.r; rec.ts = 1; rec.z = 10 + slot.i;
        }
        rec.to = 1; rec.k = 16;
      } else if (rec.state === 'drag' || rec.state === 'carry') {
        const above = pointer.y < G.lineY;
        if (needsTarget(rec) && above && !potionAim) {
          const a = aimSpot();
          rec.tx = a.x; rec.ty = a.y; rec.ts = 1.08; rec.tr = 0; rec.k = 18;
        } else {
          const touch = pointer.type !== 'mouse';
          rec.tx = pointer.x - (touch ? 0 : press?.gx || 0);
          rec.ty = pointer.y - (touch ? G.H * 0.42 : press?.gy || 0);
          rec.ts = 1.08; rec.tr = clamp(pointer.vx * 0.012, -9, 9); rec.k = 30;
        }
        rec.z = 400; rec.to = 1;
        rec.el.classList.toggle('card--ready', above && !needsTarget(rec));
      } else if (rec.state === 'select' || rec.state === 'aim' || rec.state === 'pending') {
        const a = rec.state === 'pending' ? playSpot() : aimSpot();
        rec.tx = a.x; rec.ty = a.y; rec.ts = rec.state === 'pending' ? 1.05 : 1.08; rec.tr = 0; rec.k = 18; rec.z = 400; rec.to = 1;
      }
      const held = rec.state !== 'hand' && !(rec.state === 'select' && slot);
      if (rec._held !== held) { rec.el.classList.toggle('hand-card--held', held); rec._held = held; }
      step(rec, dt);
      apply(rec);
    }
    for (const rec of flying) {
      const st = rec.steps[rec.step];
      if (st && now - rec.stepT > st.dur / Math.max(1, getSpeed())) { nextStep(rec); if (!flying.has(rec)) continue; }
      rec.z = 300;
      step(rec, dt);
      apply(rec);
    }
    // aiming: the arrow and the target under it (no hover tooltips meanwhile)
    const busy = mode === 'drag' || mode === 'carry' || !!potionAim || (mode === 'select' && active && needsTarget(active));
    if (busy !== wasBusy) { suppressTips(busy); wasBusy = busy; }
    updateAim();
    // pending plays wait for the director to land the previous hit
    if (active && active.state === 'pending') {
      if (!o.canAct()) { putBack(active); }
      else if (o.inputOpen()) { const r = active; const t = r.pendTarget; active = null; mode = 'idle'; commit(r, t); }
      else if (now - active.pendT > 3000) putBack(active);
    }
  }

  function step(rec, dt) {
    const a = 1 - Math.exp(-rec.k * dt), ao = 1 - Math.exp(-(rec.ko || rec.k) * dt);
    rec.x += (rec.tx - rec.x) * a;
    rec.y += (rec.ty - rec.y) * a;
    rec.r += (rec.tr - rec.r) * a;
    rec.s += (rec.ts - rec.s) * a;
    rec.o += (rec.to - rec.o) * ao;
  }

  function apply(rec) {
    let sx = 0;
    if (rec.shake) {
      const t = (performance.now() - rec.shake) / 380;
      if (t >= 1) rec.shake = 0; else sx = Math.sin(t * 38) * (1 - t) * G.W * 0.07;
    }
    const tf = `translate3d(${(rec.x - G.W / 2 + sx).toFixed(1)}px, ${(rec.y - G.H / 2).toFixed(1)}px, 0) rotate(${rec.r.toFixed(2)}deg) scale(${rec.s.toFixed(3)})`;
    if (rec._tf !== tf) { rec.el.style.transform = tf; rec._tf = tf; }
    const op = rec.o.toFixed(2);
    if (rec._o !== op) { rec.el.style.opacity = op; rec._o = op; }
    const z = String(rec.z || 10);
    if (rec._z !== z) { rec.el.style.zIndex = z; rec._z = z; }
  }

  const playSpot = () => ({ x: G.vw * 0.5, y: G.phone ? G.vh * 0.44 : G.vh * 0.45 });
  const aimSpot = () => ({ x: G.vw * 0.5, y: G.vh - G.sab - G.H * (G.phone ? 0.78 : 0.82) });

  // ---------------------------------------------------------------- targeting

  function aimingRec() {
    if (!active) return null;
    if (potionAim) return null;
    if (!needsTarget(active)) return null;
    if (active.state === 'select' || active.state === 'aim') return active;
    if ((active.state === 'drag' || active.state === 'carry') && pointer.y < G.lineY) return active;
    return null;
  }

  function updateAim() {
    const rec = aimingRec();
    let from = null, want = null;
    if (potionAim) { from = potionAim.from(); want = pickAt(pointer.x, pointer.y) || soloTarget() || kbTarget; }
    else if (rec) {
      from = { x: rec.x, y: rec.y - G.H * rec.s / 2 + G.H * 0.06 };
      if (rec.state === 'select' && pointer.type !== 'mouse') want = kbTarget || soloTarget();
      else want = (pointer.type === 'mouse' || rec.state === 'drag' ? pickAt(pointer.x, pointer.y) : null) || kbTarget || soloTarget();
    }
    if (want !== target) {
      target = want;
      o.onTarget?.(target);
      if (rec) updateCardNumbers(rec.el, o.getCombat(), target);
    }
    // what the HUD should preview: the aimed card on its target, or a non-target card held above the line
    let pc = null, pt = null;
    if (rec) { pc = rec.uid; pt = target; }
    else if (active && (active.state === 'drag' || active.state === 'carry') && pointer.y < G.lineY && !needsTarget(active)) pc = active.uid;
    const pk = `${pc}|${pt}`;
    if (pk !== previewKey) { previewKey = pk; o.onPreview?.(pc, pt); }
    if (from) {
      const tp = target ? o.targetPoint?.(target) : null;
      const showArrow = tp || pointer.type === 'mouse' || (active && active.state === 'drag') || potionAim;
      if (showArrow) arrow.show(from, tp || pointer, { hot: !!tp, scale: G.phone ? 0.8 : 1 });
      else arrow.hide();
    } else arrow.hide();
  }

  function pickAt(x, y) {
    if (x < 0) return null;
    const u = o.pick?.(x, y);
    return u && o.targets().includes(u) ? u : null;
  }
  function soloTarget() { const t = o.targets(); return t.length === 1 ? t[0] : null; }

  // ---------------------------------------------------------------- playing

  function tryPlay(rec, tgt) {
    const C = o.getCombat();
    if (!C) return false;
    if (needsTarget(rec) && !tgt) { tgt = soloTarget(); if (!tgt) { putBack(rec); o.onDeny?.('target', rec.uid); return false; } }
    if (!o.canAct()) { putBack(rec); return false; }
    const check = C.canPlay(rec.uid, tgt || undefined);
    if (!check.ok && check.reason !== 'phase') { deny(rec, check.reason); return false; }
    if (!o.inputOpen() || !check.ok) {
      // the previous card's hit hasn't landed yet: hold this one at the play spot until it has
      rec.state = 'pending'; rec.pendTarget = tgt; rec.pendT = performance.now();
      active = rec; mode = 'pending';
      return true;
    }
    endInteraction(true);
    commit(rec, tgt);
    return true;
  }

  function commit(rec, tgt) {
    const C = o.getCombat();
    const check = C.canPlay(rec.uid, tgt || undefined);
    if (!check.ok) { deny(rec, check.reason); return; }
    const exhaust = rec.view.keywords.includes('exhaust');
    const fate = rec.view.type === 'power' ? 'power' : exhaust ? 'exhaust' : 'discard';
    remove(rec.uid, fate, { play: true });
    target = null; o.onTarget?.(null);
    hideTip();
    o.audio?.ui?.('card');
    o.onPlay?.(rec.uid, tgt || null);
  }

  function deny(rec, reason) {
    putBack(rec);
    rec.shake = performance.now();
    rec.el.classList.remove('card--deny'); void rec.el.offsetWidth; rec.el.classList.add('card--deny');
    setTimeout(() => rec.el.classList.remove('card--deny'), 700);
    o.audio?.ui?.('deny');
    o.onDeny?.(reason, rec.uid);
  }

  function putBack(rec) {
    if (!rec || !cards.has(rec.uid)) return;
    rec.state = 'hand';
    rec.el.classList.remove('card--selected', 'card--ready');
    if (active === rec) { active = null; mode = 'idle'; }
    updateCardNumbers(rec.el, o.getCombat(), null);
    arrow.hide();
    if (target) { target = null; o.onTarget?.(null); }
  }

  function endInteraction(keep) {
    if (active && !keep) putBack(active);
    active = null; mode = 'idle'; press = null; kbTarget = null;
    arrow.hide();
  }

  // ---------------------------------------------------------------- pointer input

  function onCardDown(e, rec) {
    if (destroyed || !visible || rec.state === 'fly' || rec.state === 'pending') return;
    if (potionAim) return;
    e.stopPropagation(); e.preventDefault();
    hideTip();
    if (e.button === 2) { endInteraction(false); return; }
    if (mode === 'carry' || mode === 'select') {
      if (active === rec) {
        // a second tap on the selected card: play it (non-target) or put it back
        if (!needsTarget(rec)) { tryPlay(rec, null); return; }
        if (mode === 'select' && kbTarget) { tryPlay(rec, kbTarget); return; }
        endInteraction(false); hovered = rec.uid; return;
      }
      endInteraction(false);
    }
    pointer = { ...pointer, x: e.clientX, y: e.clientY, type: e.pointerType || 'mouse' };
    mode = 'press'; active = rec; hovered = rec.uid;
    press = { x0: e.clientX, y0: e.clientY, t0: performance.now(), id: e.pointerId, type: e.pointerType || 'mouse', gx: e.clientX - rec.x, gy: e.clientY - rec.y };
    o.onHover?.(rec.uid);
    // touch: holding a card still zooms it (above) and, after a moment, explains its keywords
    if (press.type !== 'mouse') { const p = press; setTimeout(() => { if (press === p && mode === 'press' && active === rec) showTipFor(rec, true); }, 360); }
  }

  function onMove(e) {
    const now = performance.now();
    const dtm = Math.max(1, now - pointer.t);
    const vx = (e.clientX - pointer.x) / dtm * 16;
    pointer = { x: e.clientX, y: e.clientY, type: e.pointerType || 'mouse', vx: pointer.vx * 0.6 + vx * 0.4, t: now };
    if (destroyed || !visible) return;
    if (mode === 'idle' && pointer.type === 'mouse' && !potionAim) hoverAt(e.clientX, e.clientY);
    else if (mode === 'press' && press) {
      const dx = e.clientX - press.x0, dy = e.clientY - press.y0, dist = Math.hypot(dx, dy);
      if (press.type !== 'mouse' && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2 && e.clientY > G.vh - G.sab - G.H * G.zoom) {
        // scrub along the hand with a finger
        const u = nearestSlot(e.clientX);
        if (u && u !== active?.uid) { active = cards.get(u); hovered = u; press.x0 = e.clientX; press.y0 = e.clientY; o.onHover?.(u); }
        return;
      }
      if (dy < -16 || dist > 26) {
        mode = 'drag'; active.state = 'drag';
        hideTipFor(active);
        o.audio?.ui?.('hover');
      }
    }
  }

  function onUp(e) {
    if (destroyed) return;
    if (mode === 'press' && active) {
      const rec = active;
      if (press?.type === 'mouse') {
        // click: pick the card up; it follows the pointer until the next click
        mode = 'carry'; rec.state = 'carry';
        press.gx = 0; press.gy = 0;
      } else {
        mode = 'select'; rec.state = 'select'; rec.el.classList.add('card--selected');
        if (needsTarget(rec)) kbTarget = soloTarget();
        showTipFor(rec, true);
      }
      press = null;
      return;
    }
    if (mode === 'drag' && active) {
      const rec = active;
      press = null;
      if (e.clientY < G.lineY) {
        if (needsTarget(rec)) { const t = target || pickAt(e.clientX, e.clientY); if (t) tryPlay(rec, t); else putBack(rec); }
        else tryPlay(rec, null);
      } else putBack(rec);
      if (mode === 'drag') { mode = 'idle'; active = null; }
      hovered = pointer.type === 'mouse' ? nearestSlotIfInZone(e.clientX, e.clientY) : null;
    }
  }

  // clicks on the stage while a card is carried / selected, or while a potion aims
  function onDownAnywhere(e) {
    if (destroyed || !visible) return;
    if (e.target.closest?.('.hand-card')) return;
    if (potionAim) {
      const t = pickAt(e.clientX, e.clientY) || (e.target.closest?.('[data-target-uid]')?.dataset.targetUid);
      const pa = potionAim; potionAim = null; arrow.hide(); target = null; o.onTarget?.(null);
      if (t && o.targets().includes(t)) pa.onPick(t); else pa.onCancel?.();
      e.stopPropagation(); e.preventDefault();
      return;
    }
    if (mode !== 'carry' && mode !== 'select') return;
    const control = e.target.closest?.('button, .tbwrap, .cui-ctl');
    const rec = active;
    if (pointer.type !== 'mouse') hovered = null;
    if (control) { endInteraction(false); return; }
    e.stopPropagation(); e.preventDefault();
    if (e.button === 2) { endInteraction(false); return; }
    const hitUid = pickAt(e.clientX, e.clientY) || (e.target.closest?.('[data-target-uid]')?.dataset.targetUid);
    if (needsTarget(rec)) {
      const t = hitUid && o.targets().includes(hitUid) ? hitUid : (mode === 'carry' && e.clientY < G.lineY ? target : null);
      if (t) tryPlay(rec, t); else endInteraction(false);
    } else if (e.clientY < G.lineY || (mode === 'select' && hitUid)) tryPlay(rec, null);
    else endInteraction(false);
  }

  function hoverAt(x, y) {
    const u = nearestSlotIfInZone(x, y);
    if (u !== hovered) {
      if (hovered) hideTipFor(cards.get(hovered));
      hovered = u;
      if (u) { o.onHover?.(u); o.audio?.ui?.('hover'); showTipFor(cards.get(u)); } else o.onHover?.(null);
    }
  }

  function nearestSlot(x) {
    const S = slots();
    let best = null, bd = Infinity;
    for (const [uid, s] of S.map) { const d = Math.abs(s.x - x); if (d < bd) { bd = d; best = uid; } }
    return best;
  }
  function nearestSlotIfInZone(x, y) {
    const S = slots();
    if (!S.n) return null;
    const first = S.map.get(S.list[0]), last = S.map.get(S.list[S.n - 1]);
    const top = hovered ? G.vh - G.sab - G.H * G.zoom - 6 : G.vh - G.sab - G.H * (1 - G.sink) - 4;
    if (y < top || x < first.x - G.W / 2 - 4 || x > last.x + G.W / 2 + 4) return null;
    return nearestSlot(x);
  }

  // keyword tooltips beside the zoomed card
  function showTipFor(rec, now = false) {
    if (!rec) return;
    clearTimeout(tipT);
    tipT = setTimeout(() => {
      if (!cards.has(rec.uid) || (hovered !== rec.uid && rec.state !== 'select')) return;
      const t = tipCardKeywords(rec.inst);
      if (!t.length) return;
      const w = G.W * G.zoom, hh = G.H * G.zoom;
      const x = rec.tx, y = rec.ty;
      tipFor = rec.uid;
      showTip({ left: x - w / 2, right: x + w / 2, top: y - hh / 2, bottom: y + hh / 2, width: w, height: hh }, t, { side: x > G.vw * 0.62 ? 'left' : 'right', key: 'hand' });
    }, now ? 60 : 220);
  }
  function hideTipFor(rec) { clearTimeout(tipT); if (!rec || tipFor === rec.uid) { hideTip('hand'); tipFor = null; } }

  // ---------------------------------------------------------------- keyboard

  function onKey(e) {
    if (destroyed || !visible || e.target.closest?.('input, textarea')) return;
    const k = e.key;
    if (/^[0-9]$/.test(k)) {
      const idx = k === '0' ? 9 : Number(k) - 1;
      const uid = order.filter(u => cards.get(u) && IN_HAND.has(cards.get(u).state))[idx];
      const rec = uid && cards.get(uid);
      if (!rec || rec.state === 'pending') return;
      e.preventDefault();
      if (active === rec && (mode === 'select' || mode === 'carry')) { if (!needsTarget(rec)) tryPlay(rec, null); else if (kbTarget || target) tryPlay(rec, kbTarget || target); return; }
      endInteraction(false);
      active = rec; mode = 'select'; rec.state = 'select'; rec.el.classList.add('card--selected'); hovered = uid;
      pointer.type = 'key';
      if (needsTarget(rec)) kbTarget = target && o.targets().includes(target) ? target : o.targets()[0] || null;
      showTipFor(rec, true);
      return;
    }
    if (!active || (mode !== 'select' && mode !== 'carry')) return;
    if (k === 'Escape') { e.preventDefault(); endInteraction(false); return; }
    if ((k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Tab') && needsTarget(active)) {
      e.preventDefault();
      const list = o.targets();
      if (!list.length) return;
      const i = list.indexOf(kbTarget);
      const d = k === 'ArrowLeft' || (k === 'Tab' && e.shiftKey) ? -1 : 1;
      kbTarget = list[(i + d + list.length) % list.length];
      pointer.type = 'key';
      return;
    }
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (needsTarget(active)) { const t = kbTarget || target || soloTarget(); if (t) tryPlay(active, t); }
      else tryPlay(active, null);
    }
  }

  // ---------------------------------------------------------------- state from the HUD

  function refresh() {
    const C = o.getCombat();
    const energy = o.energy();
    const can = o.canAct();
    for (const rec of cards.values()) {
      const cost = C?.costOf ? C.costOf(rec.uid) : rec.view.cost;
      setCardCost(rec.el, cost);
      const unplayable = cost === null || rec.view.keywords.includes('unplayable');
      const afford = !unplayable && cost <= energy;
      rec.el.classList.toggle('card--playable', can && afford);
      rec.el.classList.toggle('card--noenergy', !unplayable && !afford);
      rec.el.classList.toggle('card--dim', !can || !afford);
      if (rec !== aimingRec()) updateCardNumbers(rec.el, C, null);
    }
  }

  /** Aim from a potion slot (or any element): onPick(uid) when a zombie is clicked, onCancel otherwise. */
  function aim({ from, onPick, onCancel }) {
    endInteraction(false);
    const fromFn = typeof from === 'function' ? from : () => { const r = from.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom }; };
    potionAim = { from: fromFn, onPick, onCancel };
    kbTarget = soloTarget();
  }

  function setVisible(on) {
    visible = on;
    layer.classList.toggle('hand--hidden', !on);
    if (!on) { endInteraction(false); hovered = null; hideTip('hand'); }
  }

  function cancel() { endInteraction(false); if (potionAim) { const pa = potionAim; potionAim = null; pa.onCancel?.(); } }

  const onResize = () => { G = geometry(); };
  const onLeave = () => { if (mode === 'idle') { hovered = null; hideTip('hand'); } };
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', () => { if (mode === 'drag' || mode === 'press') endInteraction(false); });
  addEventListener('pointerdown', onDownAnywhere, true);
  addEventListener('keydown', onKey);
  addEventListener('resize', onResize);
  document.documentElement.addEventListener('pointerleave', onLeave);
  raf = requestAnimationFrame(frame);

  function destroy() {
    destroyed = true;
    cancelAnimationFrame(raf);
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointerdown', onDownAnywhere, true);
    removeEventListener('keydown', onKey);
    removeEventListener('resize', onResize);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    hideTip('hand');
    if (wasBusy) suppressTips(false);
    arrow.el.remove();
    layer.remove();
  }

  return {
    el: layer, set, add, remove, refresh, cancel, aim, setVisible, destroy,
    has: uid => cards.has(uid),
    uids: () => order.slice(),
    get target() { return target; },
    get busy() { return mode !== 'idle' || !!potionAim; },
    get hovered() { return hovered; },
    /** y of the top of the resting hand (the HUD keeps world bars above it) */
    restTop: () => G.vh - G.sab - G.H * (1 - G.sink),
    elOf: uid => cards.get(uid)?.el || null,
    /** test hooks (labs / playtests): put a card in a pose without the pointer */
    debugPose(uid, pose, opts = {}) {
      const rec = cards.get(uid); if (!rec) return;
      endInteraction(false);
      if (pose === 'hover') { hovered = uid; showTipFor(rec, true); }
      if (pose === 'drag' || pose === 'carry') { active = rec; mode = pose; rec.state = pose; pointer = { x: opts.x, y: opts.y, type: 'mouse', vx: 0, t: performance.now() }; press = { gx: 0, gy: 0 }; }
      if (pose === 'select') { active = rec; mode = 'select'; rec.state = 'select'; rec.el.classList.add('card--selected'); kbTarget = opts.target || null; pointer.type = 'key'; }
    },
    debugPointer(x, y) { pointer = { ...pointer, x, y }; },
  };
}
