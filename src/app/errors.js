// Error safety: any uncaught error or rejected promise is logged and shows a friendly panel with "Back to title" (and
// Reload), so the player never sits in front of a frozen or blank screen.
//   installErrorOverlay({ onTitle })   onTitle() tries to rebuild the title screen; if that throws, the page reloads
//   showError(err, where)              show the panel for a caught error (the app's own try/catch around screen changes)
// Noise that isn't a game bug (audio autoplay refusals, ResizeObserver loop notes, aborted fetches) is only logged.
const IGNORE = /ResizeObserver loop|NotAllowedError|AbortError|play\(\) request|The play\(\) request|interrupted by a call to pause|Load failed|NetworkError when attempting/i;

let panel = null, handler = null, count = 0;

export function installErrorOverlay({ onTitle } = {}) {
  handler = onTitle || null;
  window.addEventListener('error', e => {
    if (e?.target && e.target !== window && !(e.error instanceof Error)) return;   // a failed <img>/<audio> load
    report(e.error || e.message, 'error');
  });
  window.addEventListener('unhandledrejection', e => report(e.reason, 'promise'));
}

function report(err, where) {
  const msg = String(err?.message || err || 'Unknown error');
  if (IGNORE.test(msg) || (err && IGNORE.test(String(err.name || '')))) { console.warn('[sarno] ignored:', msg); return; }
  showError(err, where);
}

export function showError(err, where = '') {
  console.error('[sarno] ' + (where ? where + ': ' : ''), err);
  count++;
  window.__errors = (window.__errors || []).concat(String(err?.stack || err?.message || err));
  if (panel) { panel.querySelector('.sl-err__msg').textContent = String(err?.message || err); return; }
  panel = document.createElement('div');
  panel.className = 'sl-err';
  panel.setAttribute('role', 'alertdialog');
  panel.innerHTML = `<div class="sl-err__card">
    <div class="sl-err__ecg"><svg viewBox="0 0 200 40" preserveAspectRatio="none"><path d="M0 22 H70 L78 22 L84 8 L92 36 L100 14 L106 22 H200"/></svg></div>
    <h2>Something went wrong</h2>
    <p>The game hit a problem it didn't expect. Your profile is safe, and a run in progress continues from its last room.</p>
    <code class="sl-err__msg"></code>
    <div class="sl-err__btns"><button class="btn primary" data-act="title">Back to title</button><button class="btn" data-act="reload">Reload</button></div>
  </div>`;
  panel.querySelector('.sl-err__msg').textContent = String(err?.message || err);
  panel.addEventListener('click', async e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'reload') return location.reload();
    if (act === 'title') {
      const p = panel; panel = null; p.remove();
      try { if (!handler) throw new Error('no title'); await handler(); } catch (e2) { console.error('[sarno] back to title failed', e2); location.reload(); }
    }
  });
  document.body.append(panel);
  document.getElementById('boot')?.classList.add('boot--done');
}

export const errorCount = () => count;
