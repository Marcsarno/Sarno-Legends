// Playtest: plays whole runs of the real game in headless Chromium and fails on any error or softlock.
// Each run starts from a fresh profile on the title screen: the mouse clicks Start a Run, then the sensible bot
// (window.__SL.autoplay, src/app/autoplay.js) plays Shift Change, the map, every room and the boss through the same
// paths the player's input takes. The result screen's Title button (clicked with the mouse) must bring the title back
// with the scrap banked and no save left behind.
// Usage:
//   npm run playtest                                        1 run, seed PT1, its own dev server
//   node tools/playtest.mjs --runs 3 --seed PT --speed 8    seeds PT-1, PT-2, PT-3
//   node tools/playtest.mjs --base http://localhost:5180/   use a server that is already running
//   node tools/playtest.mjs --preview                       vite build, then play the built game (vite preview)
// Options:
//   --runs N          runs to play (default 1)                 --seed S       one seed, or the stem of several (default PT1)
//   --speed X         game speed for the bot (default 8)       --until end|boss   stop at the result (default) or the boss door
//   --shots DIR       checkpoint screenshots (the first of each screen and room type, the result, any failure)
//   --assist          the bot starts with a strong kit (relics, upgraded cards) so a slow software GPU still sees a win;
//                     the summary marks those runs "assisted"
//   --w 1280 --h 720  viewport                                 --timeout 60   minutes per run
//   --stuck 150       seconds with nothing changing = a softlock          --json FILE   the summary as JSON
//   --verbose         print every screen change
// The summary lists each run's rooms and fights ("orderlies 8t -10hp": 8 turns, 10 HP lost net of end-of-fight heals).
// Exit code 0 only if every run reached its goal (the result screen, or the boss with --until boss) with no page error,
// console error, failed request, bot step failure or softlock. A lost run is a result, not a failure.
// Speed note: on a software GPU (SwiftShader) the page draws 1-2 frames a second and the stage clamps each frame's time
// step, so a full run takes 10-30 minutes even at --speed 8. A real GPU is about 30x faster.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { launch } from './browser.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = parseArgs(process.argv.slice(2));
const RUNS = Number(args.runs || 1);
const SPEED = Number(args.speed || 8);
const UNTIL = args.until === 'boss' ? 'boss' : 'end';
const W = Number(args.w || 1280), H = Number(args.h || 720);
const RUN_TIMEOUT = Number(args.timeout || 60) * 60e3;
const STUCK = Number(args.stuck || 150) * 1e3;
const SHOTS = args.shots ? path.resolve(String(args.shots)) : null;
const ASSIST = !!args.assist;
const VERBOSE = !!args.verbose;
const seedFor = i => (RUNS === 1 ? String(args.seed || 'PT1') : `${args.seed || 'PT'}-${i + 1}`);
// the assist kit: common/uncommon relics that make the starter deck sturdier, and a few upgrades
const ASSIST_KIT = { relics: ['duct_tape', 'pager', 'riot_vest', 'coffee_thermos', 'steel_plate'], cards: ['home_run+', 'buckshot+'], gold: 150 };

if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const t0 = Date.now();
const clock = () => { const s = Math.round((Date.now() - t0) / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const say = (...a) => console.log(`[${clock()}]`, ...a);

// ---------------------------------------------------------------- the server
let server = null;
async function startServer() {
  if (args.base) return String(args.base).replace(/\/?$/, '/');
  const port = await freePort(Number(args.port || 5188));
  const vite = path.join(ROOT, 'node_modules/.bin/vite');
  if (args.preview) {
    say('building (vite build)...');
    const b = spawnSync(vite, ['build'], { cwd: ROOT, stdio: 'inherit' });
    if (b.status !== 0) throw new Error('vite build failed');
  }
  server = spawn(vite, [args.preview ? 'preview' : '', '--port', String(port), '--strictPort'].filter(Boolean), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  server.stdout.on('data', d => { out += d; });
  server.stderr.on('data', d => { out += d; });
  const base = `http://localhost:${port}/`;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('the server exited:\n' + out);
    try { if ((await fetch(base)).ok) { say(`${args.preview ? 'preview' : 'dev'} server on ${base}`); return base; } } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('the server did not start:\n' + out);
}
function stopServer() { if (server && server.exitCode === null) server.kill('SIGTERM'); server = null; }
process.on('SIGINT', () => { stopServer(); process.exit(130); });
process.on('exit', stopServer);

// ---------------------------------------------------------------- one run
/** What the page is doing, read in one go (also the softlock fingerprint). */
function snapshot() {
  const SL = window.__SL, app = SL?.app;
  if (!SL || !app) return { boot: true };
  const s = SL.state(), run = app.run;
  const node = run?.node ? run.map.nodes[run.node] : null;
  return {
    screen: s.screen, busy: s.busy, overlays: s.overlays,
    run: s.run && { ...s.run, room: node?.type || null, resolved: run.pending?.kind === 'combat' ? run.pending.room : run.pending?.kind || null },
    combat: s.combat && { encounter: s.combat.encounter, turn: s.combat.turn, phase: s.combat.phase, energy: s.combat.energy, over: s.combat.over,
      hp: s.combat.party.hp, block: s.combat.party.block, hand: s.combat.hand.length, enemies: s.combat.enemies.map(e => `${e.id}:${e.alive ? e.hp + '/' + e.block : 'x'}`).join(' '),
      idle: s.combat.directorIdle, canAct: s.combat.canAct },
    autoplay: s.autoplay, scrap: s.profile.scrap, runs: s.profile.runs,
    // the screen is settled enough for a picture: no fade, and the fight's painted room is up
    settled: !document.querySelector('.sl-veil--on') && (s.screen !== 'combat' || app.stage.scene.children.some(o => o.renderOrder === -10 && o.visible && o.material.opacity >= 1)),
  };
}
const fingerprint = s => JSON.stringify({ ...s, busy: undefined, settled: undefined, combat: s.combat && { ...s.combat, idle: undefined, canAct: undefined } });

async function playRun(browser, base, i) {
  const seed = seedFor(i);
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });   // a fresh profile: no save, no scrap
  // the dev server's live reload is cut off: the run keeps playing the code it loaded while files change underneath
  await ctx.routeWebSocket(/./, () => {});
  const page = await ctx.newPage();
  const R = { seed, assisted: ASSIST, result: null, floor: 0, reachedBoss: false, won: false, minutes: 0, rooms: {}, fights: [],
    errors: [], warnings: [], screens: [], hpAtBoss: null, scrapBanked: 0, problems: [] };
  const err = (kind, text) => { const line = `${kind}: ${String(text).slice(0, 400)}`; if (!R.errors.includes(line)) { R.errors.push(line); say(`  ! ${line}`); } };
  page.on('pageerror', e => err('pageerror', e.stack || e.message));
  page.on('console', m => {
    const text = m.text();
    if (m.type() === 'error') err('console.error', text);
    else if (m.type() === 'warning') {
      if (/\[autoplay\] step failed|travel refused|\[app\]|\[save\] dropped|finishCombat/.test(text)) err('warning', text);
      else if (!R.warnings.includes(text.slice(0, 200))) R.warnings.push(text.slice(0, 200));
    }
  });
  page.on('requestfailed', r => { if (!/net::ERR_ABORTED/.test(r.failure()?.errorText || '') || !/\.(mp3|ogg|m4a)(\?|$)/.test(r.url())) err('requestfailed', `${r.url()} ${r.failure()?.errorText}`); });
  page.on('response', r => { if (r.status() >= 400) err('http ' + r.status(), r.url()); });
  const shotsTaken = new Set();
  const shot = async (key, force = false) => {
    if (!SHOTS || (!force && shotsTaken.has(key))) return;
    shotsTaken.add(key);
    const file = path.join(SHOTS, `${seed}-${String(shotsTaken.size).padStart(2, '0')}-${key}.png`);
    await page.screenshot({ path: file }).catch(() => {});
  };
  const started = Date.now();
  const get = () => page.evaluate(snapshot);
  const waitFor = async (fn, ms, what) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const s = await get(); if (fn(s)) return s; await sleep(500); }
    throw new Error('timed out waiting for ' + what);
  };

  try {
    say(`run ${i + 1}/${RUNS}: seed ${seed}${ASSIST ? ' (assisted)' : ''}`);
    await page.goto(`${base}?seed=${encodeURIComponent(seed)}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 240e3 });
    await waitFor(s => s.screen === 'title' && !s.busy, 60e3, 'the title');
    await shot('title');
    // the player's first click
    await page.click('.ttl-btn--primary');
    await page.mouse.move(W / 2, H * 0.1);   // (out of the way: a resting pointer would hover a zombie and hold its tooltip open)
    await waitFor(s => s.screen === 'intro' && !s.busy, 120e3, 'Shift Change');
    await shot('intro');
    if (ASSIST) {
      await page.evaluate(kit => {
        for (const relic of kit.relics) window.__SL.give({ relic });
        for (const card of kit.cards) window.__SL.give({ card });
        window.__SL.give({ gold: kit.gold });
      }, ASSIST_KIT);
    }
    await page.evaluate(sp => window.__SL.autoplay(true, sp), SPEED);

    let last = '', lastChange = Date.now(), lastKey = '', lastFloor = -1, lastBeat = 0;
    for (;;) {
      if (Date.now() - started > RUN_TIMEOUT) throw new Error(`run timeout (${RUN_TIMEOUT / 60e3} min)`);
      const s = await get();
      const run = s.run;
      // progress: screens and rooms
      const key = `${s.screen}${s.overlays?.length ? '+' + s.overlays.join('+') : ''}`;
      if (key !== lastKey) {
        lastKey = key;
        R.screens.push(key);
        if (VERBOSE) say(`  ${key}  floor ${run?.floor ?? '-'}  ${run ? run.hp + '/' + run.maxHp + ' HP' : ''}`);
      }
      if (s.settled && s.screen !== 'combat') await shot(s.screen);
      if (s.settled && s.screen === 'combat' && s.combat?.canAct && run?.resolved) await shot(`combat-${run.resolved}`);
      if (run && run.floor !== lastFloor) {
        lastFloor = run.floor;
        R.floor = Math.max(R.floor, run.floor);
        say(`  floor ${run.floor}: ${run.room || '-'}${run.resolved && run.resolved !== run.room ? ' -> ' + run.resolved : ''}  ${run.hp}/${run.maxHp} HP  ${run.gold} supplies  deck ${run.deck}`);
      }
      if (run && run.floor === 16 && run.screen === 'combat' && !R.reachedBoss) {
        R.reachedBoss = true;
        R.hpAtBoss = `${run.hp}/${run.maxHp}`;
        if (UNTIL === 'boss') {
          await waitFor(x => x.screen === 'combat' && x.combat?.canAct, 180e3, 'the boss fight');
          await shot('boss', true);
          R.result = 'boss';
          break;
        }
      }
      if (s.screen === 'result' && !s.busy) break;
      // softlock watch
      const fp = fingerprint(s);
      if (fp !== last) { last = fp; lastChange = Date.now(); }
      else if (Date.now() - lastChange > STUCK) {
        await shot('stuck', true);
        throw new Error(`softlock: nothing changed for ${Math.round(STUCK / 1000)} s on ${key} (${JSON.stringify(s).slice(0, 600)})`);
      }
      if (!s.autoplay && s.screen !== 'result') {
        // the bot stops only on the result screen (or a page reload): restart it once, and say so
        R.problems.push(`autoplay stopped on ${key}`);
        await page.evaluate(sp => window.__SL.autoplay(true, sp), SPEED);
      }
      if (Date.now() - lastBeat > 60e3) { lastBeat = Date.now(); if (s.combat) say(`    ${s.combat.encounter} turn ${s.combat.turn}: ${s.combat.hp} HP vs ${s.combat.enemies}`); }
      await sleep(1000);
    }

    if (R.result !== 'boss') {
      // the result screen, then back to the title with the mouse
      await sleep(2500);
      const end = await page.evaluate(() => {
        const run = window.__SL.app.run;
        return { won: !!run?.won, floor: run?.floor, log: run?.stats?.log || [], cause: run?.stats?.cause || null };
      });
      R.won = end.won;
      R.result = end.won ? 'won' : 'lost';
      R.cause = end.cause;
      R.floor = Math.max(R.floor, end.floor || 0);
      for (const e of end.log) {
        if (e.t === 'node') R.rooms[e.resolved || e.type] = (R.rooms[e.resolved || e.type] || 0) + 1;
        if (e.t === 'fight') R.fights.push(`${e.encounter}${e.won ? '' : ' (lost)'} ${e.turns}t -${Math.max(0, e.hpBefore - e.hpAfter)}hp`);
      }
      await shot('result', true);
      const before = await get();
      const title = await page.$('.scr--result .res-btns button:has-text("Title")');
      if (!title) throw new Error('no Title button on the result screen');
      await title.click();
      const t = await waitFor(x => x.screen === 'title' && !x.busy, 60e3, 'the title after the result');
      R.scrapBanked = t.scrap;
      const cont = await page.$('.ttl-btn--cont');
      if (cont) R.problems.push('the title still offers Continue after a finished run');
      if (t.runs < 1) R.problems.push('the profile did not count the run');
      if (VERBOSE) say(`  back on the title: ${t.scrap} scrap, ${t.runs} runs (was ${before.scrap})`);
    }
  } catch (e) {
    R.problems.push(e.message.split('\n')[0]);
    say(`  ! ${e.message.split('\n')[0]}`);
    await shot('failure', true);
    if (!R.result) R.result = 'failed';
  } finally {
    R.minutes = +((Date.now() - started) / 60e3).toFixed(1);
    await ctx.close().catch(() => {});
  }
  R.ok = R.errors.length === 0 && R.problems.length === 0 && (UNTIL === 'boss' ? R.result === 'boss' : R.result === 'won' || R.result === 'lost');
  return R;
}

// ---------------------------------------------------------------- main
const base = await startServer();
const browser = await launch();
const results = [];
try {
  for (let i = 0; i < RUNS; i++) results.push(await playRun(browser, base, i));
} finally {
  await browser.close().catch(() => {});
  stopServer();
}

console.log('\n================ playtest summary ================');
console.log(`${results.length} run(s), speed ${SPEED}, until ${UNTIL}, ${W}x${H}${ASSIST ? ', assisted' : ''}, ${clock()} total`);
for (const r of results) {
  console.log(`\n${r.ok ? 'PASS' : 'FAIL'}  seed ${r.seed}: ${r.result}${r.assisted ? ' (assisted)' : ''}, floor ${r.floor}${r.reachedBoss ? `, reached the boss with ${r.hpAtBoss}` : ''}, ${r.minutes} min` +
    (r.cause && !r.won ? `, died to ${r.cause}` : '') + (r.result === 'won' || r.result === 'lost' ? `, ${r.scrapBanked} scrap banked` : ''));
  if (Object.keys(r.rooms).length) console.log('  rooms:  ' + Object.entries(r.rooms).map(([k, n]) => `${k} ${n}`).join(', '));
  if (r.fights.length) console.log('  fights: ' + r.fights.join(' | '));
  for (const e of r.errors) console.log('  error:  ' + e);
  for (const p of r.problems) console.log('  problem: ' + p);
  if (VERBOSE) for (const w of r.warnings) console.log('  warning: ' + w);
}
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed; wins ${results.filter(r => r.won).length}, reached the boss ${results.filter(r => r.reachedBoss).length}`);
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(results, null, 1));
process.exitCode = failed ? 1 : 0;

// ---------------------------------------------------------------- helpers
function parseArgs(list) {
  const out = {};
  for (let i = 0; i < list.length; i++) {
    if (!list[i].startsWith('--')) continue;
    const k = list[i].slice(2), v = list[i + 1];
    if (v === undefined || v.startsWith('--')) out[k] = true; else { out[k] = v; i++; }
  }
  return out;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function freePort(from) {
  return new Promise((resolve, reject) => {
    const tryPort = p => {
      if (p > from + 40) return reject(new Error('no free port'));
      const s = net.createServer().once('error', () => tryPort(p + 1)).once('listening', () => s.close(() => resolve(p))).listen(p, '127.0.0.1');
    };
    tryPort(from);
  });
}
