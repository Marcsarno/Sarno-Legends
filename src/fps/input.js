// Controls. Desktop: pointer lock, WASD, mouse look, click to shoot, R reload, Space / E / right-click shove, 1 / 2 / Q /
// wheel to swap, Shift to run, F torch. iPhone (landscape): a floating stick on the left half, drag anywhere on the
// right half to look, and FIRE / SHOVE / RELOAD / SWAP buttons (dragging from FIRE also looks, so you can shoot and aim).
export const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export function createInput(canvas, touchRoot) {
  const keys = new Set();
  const S = {
    move: { x: 0, y: 0 }, lookDX: 0, lookDY: 0, fire: false, firePressed: false, shove: false, reload: false, swap: null, run: false, torch: false,
    locked: false, touch: isTouch(),
  };
  let sens = 0.0022;

  // ---------------- desktop ----------------
  const down = e => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyR') S.reload = true;
    if (e.code === 'Space' || e.code === 'KeyE') { S.shove = true; e.preventDefault(); }
    if (e.code === 'Digit1') S.swap = 'pistol';
    if (e.code === 'Digit2') S.swap = 'shotgun';
    if (e.code === 'KeyQ') S.swap = 'toggle';
    if (e.code === 'KeyF') S.torch = true;
  };
  const up = e => keys.delete(e.code);
  addEventListener('keydown', down); addEventListener('keyup', up);
  addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousedown', e => {
    if (!S.locked) return;
    if (e.button === 0) { S.fire = true; S.firePressed = true; }
    if (e.button === 2) S.shove = true;
  });
  addEventListener('mouseup', e => { if (e.button === 0) S.fire = false; });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('wheel', e => { if (S.locked) S.swap = 'toggle'; }, { passive: true });
  addEventListener('mousemove', e => { if (S.locked) { S.lookDX += e.movementX; S.lookDY += e.movementY; } });
  document.addEventListener('pointerlockchange', () => { S.locked = document.pointerLockElement === canvas; if (!S.locked) { S.fire = false; keys.clear(); } });

  // ---------------- touch ----------------
  let stick = null, look = null, fireTouch = null;
  const stickEl = touchRoot.querySelector('.tc-stick'), knobEl = touchRoot.querySelector('.tc-knob');
  const R = 56;
  const btn = name => touchRoot.querySelector(`[data-b="${name}"]`);
  function onStart(e) {
    for (const t of e.changedTouches) {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const b = el?.closest?.('[data-b]')?.dataset.b;
      if (b) {
        e.preventDefault();
        if (b === 'fire') { S.fire = true; S.firePressed = true; fireTouch = { id: t.identifier, x: t.clientX, y: t.clientY }; btn('fire').classList.add('on'); }
        else if (b === 'shove') S.shove = true;
        else if (b === 'reload') S.reload = true;
        else if (b === 'swap') S.swap = 'toggle';
        else if (b === 'torch') S.torch = true;
        continue;
      }
      if (el && el.closest('.ov')) continue;           // overlays (title, end screens) handle their own taps
      e.preventDefault();
      if (t.clientX < innerWidth * 0.42 && !stick) {
        stick = { id: t.identifier, x: t.clientX, y: t.clientY };
        stickEl.style.left = t.clientX + 'px'; stickEl.style.top = t.clientY + 'px'; stickEl.classList.add('on');
        knobEl.style.transform = 'translate(-50%,-50%)';
      } else if (!look) look = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  }
  function onMove(e) {
    for (const t of e.changedTouches) {
      if (stick && t.identifier === stick.id) {
        let dx = t.clientX - stick.x, dy = t.clientY - stick.y; const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        S.move.x = dx / R; S.move.y = -dy / R;
        knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        e.preventDefault();
      } else if (look && t.identifier === look.id) {
        S.lookDX += (t.clientX - look.x) * 2.1; S.lookDY += (t.clientY - look.y) * 2.1; look.x = t.clientX; look.y = t.clientY; e.preventDefault();
      } else if (fireTouch && t.identifier === fireTouch.id) {
        S.lookDX += (t.clientX - fireTouch.x) * 2.1; S.lookDY += (t.clientY - fireTouch.y) * 2.1; fireTouch.x = t.clientX; fireTouch.y = t.clientY; e.preventDefault();
      }
    }
  }
  function onEnd(e) {
    for (const t of e.changedTouches) {
      if (stick && t.identifier === stick.id) { stick = null; S.move.x = S.move.y = 0; stickEl.classList.remove('on'); }
      if (look && t.identifier === look.id) look = null;
      if (fireTouch && t.identifier === fireTouch.id) { fireTouch = null; S.fire = false; btn('fire')?.classList.remove('on'); }
    }
  }
  touchRoot.addEventListener('touchstart', onStart, { passive: false });
  touchRoot.addEventListener('touchmove', onMove, { passive: false });
  touchRoot.addEventListener('touchend', onEnd); touchRoot.addEventListener('touchcancel', onEnd);

  return {
    state: S,
    lock() { if (!S.touch) canvas.requestPointerLock?.()?.catch?.(() => {}); },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
    setSensitivity(v) { sens = v; },
    get sens() { return sens; },
    /** Read this frame's input and clear the one-shot presses. */
    read() {
      if (!S.touch || (!stick && keys.size)) {
        const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
        const r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
        if (f || r || !S.touch) { S.move.x = r; S.move.y = f; }
        S.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
      }
      const out = { ...S, move: { ...S.move } };
      S.lookDX = 0; S.lookDY = 0; S.firePressed = false; S.shove = false; S.reload = false; S.swap = null; S.torch = false;
      return out;
    },
    release() { S.fire = false; stick = null; look = null; fireTouch = null; S.move.x = S.move.y = 0; stickEl?.classList.remove('on'); },
  };
}
