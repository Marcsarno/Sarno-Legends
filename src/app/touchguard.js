// Touch guard: a game screen never zooms or opens the text menu. iOS Safari ignores user-scalable=no, so pinch
// (gesture* events), double-tap zoom, long-press selection and the Copy/Paste callout are stopped here, except inside
// text fields (the save code box) and the error report, which stay selectable.
const editable = t => !!t?.closest?.('input, textarea, [contenteditable], .sl-err__msg');

export function installTouchGuard() {
  const stop = e => { if (!editable(e.target)) e.preventDefault(); };
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
  document.addEventListener('selectstart', stop);
  document.addEventListener('contextmenu', stop);
  // a selection that slipped through (a long press on text) is dropped so the loupe and callout go away
  document.addEventListener('selectionchange', () => {
    const s = getSelection();
    if (s && !s.isCollapsed && !editable(s.anchorNode?.parentElement || s.anchorNode)) s.removeAllRanges();
  });
}
