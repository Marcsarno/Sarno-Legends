// Build-log camera: screenshots a page (or the running game in a given state) and appends the frame to
// public/build-log/frames.json, so the build can be replayed like a flip-book at /build-log/.
// Usage:
//   node tools/snap.mjs --url http://localhost:5180/ --title "Asset check" --caption "..." [--stage 0] [--eval "js"] [--wait 1500]
//   node tools/snap.mjs --plan tools/snap-plan.json --stage 3 --base http://localhost:5180/   (every shot in a plan)
//   a plan entry: { url, title, caption, ready?, eval?, until?, timeout? (ms for until, default 120000), wait? }
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { launch } from './browser.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = path.join(ROOT, 'public/build-log');
const LIST = path.join(DIR, 'frames.json');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));

const frames = fs.existsSync(LIST) ? JSON.parse(fs.readFileSync(LIST, 'utf8')) : [];
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

async function shoot(page, shot, stage) {
  await page.goto(shot.url, { waitUntil: 'load', timeout: 180000 });
  if (shot.ready !== false) await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }).catch(() => {});
  if (shot.eval) await page.evaluate(shot.eval);
  if (shot.until) await page.waitForFunction(shot.until, null, { timeout: Number(shot.timeout ?? 120000) }).catch(() => console.warn('until timed out', shot.title));
  await page.waitForTimeout(Number(shot.wait ?? 1200));
  const n = (frames.at(-1)?.n ?? 0) + 1;
  const file = `frames/${String(n).padStart(4, '0')}-${slug(shot.title)}.jpg`;
  const png = await page.screenshot();
  await sharp(png).resize(1280, 720, { fit: 'inside' }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(DIR, file));
  frames.push({ n, file, title: shot.title, caption: shot.caption || '', stage: Number(stage ?? 0), date: new Date().toISOString().slice(0, 16).replace('T', ' ') });
  fs.writeFileSync(LIST, JSON.stringify(frames, null, 1));   // saved after every shot, so a crash never loses frames
  console.log(`frame ${n}: ${shot.title}`);
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: Number(args.w || 1280), height: Number(args.h || 720) } });
page.on('pageerror', e => console.log('pageerror:', e.message));
const shots = args.plan
  ? JSON.parse(fs.readFileSync(args.plan, 'utf8')).map(s => ({ ...s, url: new URL(s.url || '', args.base || 'http://localhost:5180/').href }))
  : [{ url: args.url, title: args.title, caption: args.caption, eval: args.eval, until: args.until, wait: args.wait, ready: args.ready !== 'false' }];
// --from N skips the first N-1 plan entries (resume a run that stopped part way)
for (const s of shots.slice(Math.max(0, Number(args.from || 1) - 1))) {
  for (let attempt = 1; ; attempt++) {
    try { await shoot(page, s, args.stage); break; }
    catch (e) { console.warn(`shot "${s.title}" failed (attempt ${attempt}): ${e.message.split('\n')[0]}`); if (attempt >= 2) break; }
  }
}
await browser.close();
