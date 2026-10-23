// Save Code (from Settings): back up the profile and the run in progress as one string, or bring one back.
//   Export: the code is made, copied to the clipboard, and shown selected in a box (copy it by hand if the copy failed).
//   Import: paste a code, Check reads it and shows what it holds, then Restore (a second tap) replaces this device's
//   progress with it.
//   ctx: { inRun?: bool, audio? }
//   act: exportCode() -> Promise<string>, check(code) -> Promise<{ ok, reason?, info? }>, restore() (the checked code), close()
//   info: { scrap, runs, wins, weapons, run: { floor, hp, maxHp } | null, at }

import { shell, h, icon, closeBtn, onEscape, hoverSounds, ui, enter } from './common.js';
import '../styles/screens-extra.css';

export function mount(root, ctx) {
  const s = shell(root, 'savecode', { modal: true });
  const act = ctx.act || {};
  const close = () => { ui(ctx, 'click'); act.close?.(); };
  let mode = ctx.mode || 'export';
  let checked = null, armed = false, armT = 0;
  s.cleanup(() => clearTimeout(armT));

  const tabs = h('div.seg', { role: 'tablist' },
    h('button', { dataset: { m: 'export' }, onclick: () => setMode('export') }, 'Back up'),
    h('button', { dataset: { m: 'import' }, onclick: () => setMode('import') }, 'Restore'));
  const body = h('div.sc-body');

  function setMode(m) {
    if (m !== mode) ui(ctx, 'click');
    mode = m;
    for (const b of tabs.children) b.setAttribute('aria-pressed', String(b.dataset.m === mode));
    checked = null; armed = false;
    body.replaceChildren(mode === 'export' ? exportView() : importView());
  }

  function exportView() {
    const box = h('textarea.sc-code', { readOnly: true, rows: 3, spellcheck: false, 'aria-label': 'Your save code', placeholder: 'Making your code…' });
    const status = h('div.sc-status');
    const copyLabel = h('span', 'Copy');
    const copy = h('button.btn.teal', { onclick: () => doCopy() }, h('span.sc-ico', { html: icon('check') }), copyLabel);
    copy.hidden = true;
    const select = () => { try { box.focus({ preventScroll: true }); box.select(); box.setSelectionRange(0, box.value.length); } catch { /* ignore */ } };
    box.addEventListener('focus', select);
    box.addEventListener('click', select);
    // the first copy runs after the code is made (no longer inside the tap on some phones, so it may be refused);
    // then the button copies inside its own tap
    async function doCopy(auto = false) {
      let ok = false;
      // (a browser that would ask for permission can leave writeText pending: give up on it after a moment)
      try { if (navigator.clipboard?.writeText) ok = await Promise.race([navigator.clipboard.writeText(box.value).then(() => true), new Promise(r => setTimeout(() => r(false), 1500))]); } catch { ok = false; }
      if (!ok) { select(); try { ok = document.execCommand?.('copy') === true; } catch { ok = false; } }
      status.className = 'sc-status ' + (ok ? 'sc-status--ok' : 'sc-status--warn');
      status.textContent = ok ? 'Copied. Paste it somewhere safe: a note, a message to yourself, an email.'
        : auto ? 'Tap Copy (or copy it from the box), then paste it somewhere safe.' : 'Couldn’t copy: the code is selected, copy it from the box.';
      if (!auto || ok) ui(ctx, ok ? 'coin' : 'deny');
      copyLabel.textContent = ok ? 'Copy again' : 'Copy';
      copy.hidden = false;
      select();
    }
    Promise.resolve().then(() => act.exportCode?.()).then(code => {
      if (s.gone) return;
      box.value = code || '';
      status.className = 'sc-status';
      status.textContent = `${(code || '').length.toLocaleString()} characters.`;
      doCopy(true);
    }).catch(e => { status.className = 'sc-status sc-status--bad'; status.textContent = 'Couldn’t make a code: ' + (e?.message || e); });
    return h('div.sc-pane',
      h('p.sc-lead', 'Your scrap, weapons, settings, run history and ', ctx.inRun ? 'the run you’re on' : 'everything you’ve found', ', in one code. Keep it somewhere safe: if this browser ever loses its data, Restore brings it all back.'),
      box, h('div.sc-row', status, copy));
  }

  function importView() {
    const box = h('textarea.sc-code.sc-code--in', { rows: 3, spellcheck: false, autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Paste a save code', placeholder: 'Paste a save code here (it starts with SL1.)' });
    const status = h('div.sc-status');
    const summary = h('div.sc-summary');
    const checkBtn = h('button.btn.teal', { onclick: () => check() }, 'Check code');
    const restoreBtn = h('button.btn.danger', { onclick: () => restore() }, 'Restore');
    restoreBtn.hidden = true;
    box.addEventListener('input', () => { checked = null; restoreBtn.hidden = true; summary.replaceChildren(); status.textContent = ''; disarm(); });
    async function check() {
      ui(ctx, 'click');
      status.className = 'sc-status'; status.textContent = 'Reading…';
      const r = await Promise.resolve(act.check?.(box.value)).catch(e => ({ ok: false, reason: e?.message || String(e) }));
      if (s.gone) return;
      if (!r?.ok) { status.className = 'sc-status sc-status--bad'; status.textContent = r?.reason || 'That code didn’t work.'; ui(ctx, 'deny'); checked = null; restoreBtn.hidden = true; summary.replaceChildren(); return; }
      checked = r;
      const i = r.info || {};
      status.className = 'sc-status sc-status--ok'; status.textContent = 'This code holds:';
      summary.replaceChildren(
        line('scrap', `${i.scrap ?? 0} scrap`), line('weapon_wood_bat', `${i.weapons ?? 0} weapons`),
        line('node_boss', `${i.runs ?? 0} runs, ${i.wins ?? 0} won`),
        line('arrow_up', i.run ? `A run on floor ${i.run.floor}, ${i.run.hp}/${i.run.maxHp} HP` : 'No run in progress'),
        i.at ? h('small.sc-when', `Saved ${new Date(i.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`) : null);
      restoreBtn.hidden = false;
      ui(ctx, 'open');
    }
    function disarm() { armed = false; clearTimeout(armT); restoreBtn.classList.remove('armed'); restoreBtn.textContent = 'Restore'; }
    function restore() {
      if (!checked) return;
      if (!armed) {
        armed = true; restoreBtn.classList.add('armed'); restoreBtn.textContent = 'Tap again to replace'; ui(ctx, 'deny');
        clearTimeout(armT); armT = setTimeout(disarm, 4000);
        return;
      }
      clearTimeout(armT); ui(ctx, 'upgrade');
      act.restore?.();
    }
    return h('div.sc-pane',
      h('p.sc-lead', 'Paste a code you saved before. Restoring replaces the progress on this device', ctx.inRun ? ', and the run you’re on now' : '', '.'),
      box, h('div.sc-row', status, checkBtn, restoreBtn), summary);
  }
  const line = (ico, text) => h('div.sc-line', h('span.sc-ico', { html: icon(ico) }), text);

  const modal = h('div.scr-modal.sc-modal', { role: 'dialog', 'aria-label': 'Save code' },
    h('div.scr-modal__head', h('h2', 'Save Code'), tabs, closeBtn(close)),
    h('div.scr-modal__body', body));
  s.el.append(h('div.scr-scrim', { onclick: close }), modal);
  setMode(mode);
  s.cleanup(onEscape(close));
  s.cleanup(hoverSounds(ctx, s.el));
  enter(modal, [{ transform: 'translate(-50%, -46%) scale(.96)', opacity: 0 }, { transform: 'translate(-50%, -50%)', opacity: 1 }], 260, 'out');
  return { unmount: s.unmount, update() {} };
}
