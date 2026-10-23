// Balance report: turns a list of finished runs (from play.mjs) into the numbers docs/BALANCE.md tracks against the
// GAME_CORE targets, and formats them as markdown. Pure ES module.
//
//   const stats = summarize(runs)          // one bot's runs
//   console.log(formatReport({ sensible: stats, greedy: ... }, { targets: TARGETS }))
// HP lost per fight = damage taken in that fight as a share of Max HP (before the Nurse's Kit heal).

export const TARGETS = {
  normal: [5, 15], elite: [20, 30], boss: [30, 45], bossEntry: [40, 60], sensibleWin: [40, 60],
};

const mean = a => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : 0);
export function pct(a, q) {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}
const r1 = x => Math.round(x * 10) / 10;

function group(f) { return f.room === 'boss' ? 'boss' : f.room === 'elite' ? 'elite' : 'normal'; }

export function summarize(runs) {
  const fights = [];
  const deaths = {};
  const causes = {};
  const offers = {};
  const bossEntry = [];
  let wins = 0, skips = 0, offersN = 0;
  const finals = { deck: [], gold: [], relics: [], floor: [] };
  for (const run of runs) {
    if (run.won) wins++;
    else { deaths[run.floor] = (deaths[run.floor] || 0) + 1; const c = run.stats.cause || '?'; causes[c] = (causes[c] || 0) + 1; }
    finals.deck.push(run.deck.length); finals.gold.push(run.gold); finals.relics.push(run.relics.length); finals.floor.push(run.floor);
    for (const e of run.stats.log) {
      if (e.t === 'fight') {
        const mh = e.maxHp || 80;
        fights.push({ ...e, group: group(e), dmgPct: (e.damageTaken / mh) * 100, netPct: ((e.hpBefore - e.hpAfter) / mh) * 100 });
        if (e.room === 'boss') bossEntry.push((e.hpBefore / mh) * 100);
      }
      if (e.t === 'cards') {
        offersN++;
        if (!e.picked) skips++;
        for (const id of e.offered) { offers[id] ||= { offered: 0, picked: 0 }; offers[id].offered++; }
        if (e.picked) { offers[e.picked] ||= { offered: 0, picked: 0 }; offers[e.picked].picked++; }
      }
    }
  }
  const byGroup = {};
  for (const g of ['normal', 'elite', 'boss']) {
    const fs = fights.filter(f => f.group === g);
    byGroup[g] = { n: fs.length, mean: r1(mean(fs.map(f => f.dmgPct))), p90: r1(pct(fs.map(f => f.dmgPct), 0.9)),
      net: r1(mean(fs.map(f => f.netPct))), turns: r1(mean(fs.map(f => f.turns))), lost: fs.filter(f => !f.won).length };
  }
  const byEnc = {};
  for (const f of fights) {
    const b = (byEnc[f.encounter] ||= { group: f.group, list: [], turns: [], lost: 0 });
    b.list.push(f.dmgPct); b.turns.push(f.turns); if (!f.won) b.lost++;
  }
  const encounters = Object.entries(byEnc).map(([id, b]) => ({ id, group: b.group, n: b.list.length, mean: r1(mean(b.list)), p90: r1(pct(b.list, 0.9)),
    turns: r1(mean(b.turns)), lossRate: r1((b.lost / b.list.length) * 100) }))
    .sort((a, b) => ['normal', 'elite', 'boss'].indexOf(a.group) - ['normal', 'elite', 'boss'].indexOf(b.group) || b.mean - a.mean);
  const cards = Object.entries(offers).map(([id, o]) => ({ id, offered: o.offered, picked: o.picked, rate: r1((o.picked / Math.max(1, o.offered)) * 100) }))
    .sort((a, b) => b.rate - a.rate);
  return {
    runs: runs.length, wins, winRate: r1((wins / Math.max(1, runs.length)) * 100),
    reachBoss: r1((bossEntry.length / Math.max(1, runs.length)) * 100),
    bossEntry: { n: bossEntry.length, mean: r1(mean(bossEntry)), p10: r1(pct(bossEntry, 0.1)), p50: r1(pct(bossEntry, 0.5)), p90: r1(pct(bossEntry, 0.9)) },
    groups: byGroup, encounters, deaths, causes, cards, skipRate: r1((skips / Math.max(1, offersN)) * 100),
    finals: { deck: r1(mean(finals.deck)), gold: r1(mean(finals.gold)), relics: r1(mean(finals.relics)), floor: r1(mean(finals.floor)) },
  };
}

const mark = (v, [lo, hi]) => (v < lo ? ' (below)' : v > hi ? ' (above)' : ' (ok)');

/** Markdown for one or more bots' summaries. */
export function formatReport(byBot, { targets = TARGETS } = {}) {
  const out = [];
  const bots = Object.keys(byBot);
  out.push('| | ' + bots.join(' | ') + ' | target |');
  out.push('|---|' + bots.map(() => '---|').join('') + '---|');
  const row = (label, f, target) => out.push(`| ${label} | ${bots.map(b => f(byBot[b])).join(' | ')} | ${target || ''} |`);
  row('runs', s => s.runs);
  row('win rate %', s => s.winRate + (bots.length && s === byBot.sensible ? mark(s.winRate, targets.sensibleWin) : ''), `sensible ${targets.sensibleWin.join('-')}`);
  row('reach the boss %', s => s.reachBoss);
  row('HP entering the boss % (mean / p10 / p90)', s => `${s.bossEntry.mean} / ${s.bossEntry.p10} / ${s.bossEntry.p90}` + mark(s.bossEntry.mean, targets.bossEntry), targets.bossEntry.join('-'));
  for (const g of ['normal', 'elite', 'boss']) {
    row(`${g} fight: HP lost % mean / p90`, s => `${s.groups[g].mean} / ${s.groups[g].p90}` + mark(s.groups[g].mean, targets[g]), targets[g].join('-'));
    row(`${g} fight: turns / losses`, s => `${s.groups[g].turns} / ${s.groups[g].lost}`);
  }
  row('card picks skipped %', s => s.skipRate);
  row('final deck / relics / supplies', s => `${s.finals.deck} / ${s.finals.relics} / ${s.finals.gold}`);
  out.push('');
  for (const b of bots) {
    const s = byBot[b];
    out.push(`### ${b}: per encounter (HP lost % of Max HP)`);
    out.push('| encounter | kind | fights | mean | p90 | turns | lost % |');
    out.push('|---|---|---|---|---|---|---|');
    for (const e of s.encounters) out.push(`| ${e.id} | ${e.group} | ${e.n} | ${e.mean} | ${e.p90} | ${e.turns} | ${e.lossRate} |`);
    out.push('');
    const floors = Object.keys(s.deaths).map(Number).sort((a, b) => a - b);
    out.push(`Floor of death (${b}): ` + (floors.length ? floors.map(f => `${f}: ${s.deaths[f]}`).join(', ') : 'none'));
    out.push(`Killed by (${b}): ` + Object.entries(s.causes).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(', '));
    out.push('');
  }
  if (byBot.sensible) {
    const cards = byBot.sensible.cards;
    out.push('### sensible: card pick rate (picked / offered)');
    out.push(cards.map(c => `${c.id} ${c.rate}% (${c.picked}/${c.offered})`).join(', '));
    out.push('');
  }
  return out.join('\n');
}
