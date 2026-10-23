// The boot screen (drawn by index.html before any script runs): a thin progress bar, a status word and a rotating tip.
//   const boot = createBoot()   boot.progress(0..1, 'Painting the ER')   boot.creep(to, ms)   boot.done() fades it out
// The tips explain rules only (no story: Marc writes that).
const TIPS = [
  'Marc\'s heavy hits leave zombies <b>Staggered</b>: they take 50% more from every attack. Yola cashes in.',
  'Kill a <b>Staggered</b> zombie and you get a <b>Finisher</b>.',
  'Marc and Yola share <b>one HP bar</b>. Block before the big hits.',
  'Every run earns <b>scrap</b>, win or lose. Spend it on new weapons in the <b>Armory</b>.',
  'The number over a zombie\'s head is what it will do on its turn.',
  'Elites guard relics. A supply closet heals you or upgrades a card.',
  'Drag a card up to play it, or onto a zombie to aim it. <b>E</b> ends the turn.',
];

export function createBoot() {
  const el = document.getElementById('boot');
  const fill = el?.querySelector('.boot__fill');
  const status = el?.querySelector('.boot__status');
  const tip = el?.querySelector('.boot__tip');
  let shown = 0, creepT = 0, tipT = 0, tipI = Math.floor(Math.random() * TIPS.length), finished = false;

  function set(v) { shown = Math.max(shown, Math.min(1, v)); if (fill) fill.style.width = (shown * 100).toFixed(1) + '%'; }
  function nextTip() {
    if (!tip || finished) return;
    tip.style.opacity = '0';
    setTimeout(() => { tip.innerHTML = TIPS[tipI++ % TIPS.length]; tip.style.opacity = '1'; }, 380);
  }
  if (tip) { tip.innerHTML = TIPS[tipI++ % TIPS.length]; tipT = setInterval(nextTip, 5200); }

  return {
    progress(v, text) { clearInterval(creepT); set(v); if (text && status) status.textContent = text; },
    /** move the bar slowly toward `to` while something without progress events runs (painting a room) */
    creep(to, ms = 8000, text) {
      clearInterval(creepT);
      if (text && status) status.textContent = text;
      const from = shown, t0 = performance.now();
      creepT = setInterval(() => { const u = Math.min(1, (performance.now() - t0) / ms); set(from + (to - from) * (1 - Math.pow(1 - u, 2))); }, 120);
    },
    done() {
      if (finished) return;
      finished = true;
      clearInterval(creepT); clearInterval(tipT);
      set(1);
      if (status) status.textContent = 'Ready';
      setTimeout(() => el?.classList.add('boot--done'), 180);
      setTimeout(() => el?.remove(), 1000);
    },
    fail(text) { clearInterval(creepT); if (status) status.textContent = text || 'Something went wrong'; },
    get finished() { return finished; },
  };
}
