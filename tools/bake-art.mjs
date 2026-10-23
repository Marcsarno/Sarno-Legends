// Bake the painted art ahead of time, so a phone downloads small WebP pictures instead of painting rooms and rendering
// card art on its own GPU. It drives the real painter and studio (src/render/painter.js, studio.js) in headless Chromium
// on a Vite dev server and writes public/assets/baked/:
//   rooms/<room>[-<look>]-wide.webp   1920x800 (2.4:1): the battle camera's 32 degree view, cropped at runtime to any
//                                     screen of 16:9 or wider (painter.js "baked rooms" frames it and adds the vignette)
//   rooms/<room>[-<look>]-4x3.webp    1200x900: the widened view of narrower screens (iPad, 16:10 laptops)
//   cards/<id>.webp                   every card's art, 480x360            icons/<kind>-<id>.webp   relics, potions,
//   portraits/<id>.webp               Marc, Yola and every zombie, 256     weapons: 256x256 with alpha
//   manifest.json                     what exists, each file's content hash, and the painter / studio versions it fits
// Rooms are every ROOMS recipe plus the looks the app grades them with (src/app/rooms.js BAKE_ROOMS: the elite rooms);
// room pictures are squeezed under --max-kb by stepping the WebP quality down.
// Usage:
//   npm run bake                                   everything, on its own dev server (~15-25 min on a software GPU)
//   node tools/bake-art.mjs --only rooms           one part: rooms | cards | icons | portraits (the rest of the manifest stays)
//   node tools/bake-art.mjs --only cards --ids bat_swing,flare     only these ids (room keys for --only rooms)
//   node tools/bake-art.mjs --base http://localhost:5180/          use a dev server that is already running
//   --max-kb 240   room size target (KB)    --quality 90   room WebP quality to start from    --verbose
// Re-bake after changing a room recipe or the paint look (painter.js), a card pose, an icon or a portrait recipe
// (studio.js), or after adding a card / relic / potion / weapon / zombie. Bump painter.js BAKE_VERSION or studio.js
// VERSION when players should stop seeing the old pictures right away: until a bake for the new version is published
// the game paints those live (slowly, but correct). Files the new manifest no longer lists are deleted.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { launch } from './browser.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'public/assets/baked');
const MANIFEST = path.join(OUT, 'manifest.json');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const PARTS = ['rooms', 'cards', 'icons', 'portraits'];
const ONLY = args.only ? String(args.only).split(',') : PARTS;
for (const p of ONLY) if (!PARTS.includes(p)) throw new Error(`--only ${p}: one of ${PARTS.join(', ')}`);
const IDS = args.ids ? new Set(String(args.ids).split(',')) : null;
const MAX_KB = Number(args['max-kb'] || 240), Q0 = Number(args.quality || 90), Q_MIN = 50;
const t0 = Date.now();
const say = (...a) => { const s = Math.round((Date.now() - t0) / 1000); console.log(`[${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}]`, ...a); };

// ---------------------------------------------------------------- the dev server
let server = null;
async function startServer() {
  if (args.base) return String(args.base).replace(/\/?$/, '/');
  const port = await freePort(5189);
  server = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  server.stdout.on('data', d => { out += d; });
  server.stderr.on('data', d => { out += d; });
  const base = `http://localhost:${port}/`;
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error('vite exited:\n' + out);
    try { if ((await fetch(base)).ok) return base; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('vite did not start:\n' + out);
}
const stopServer = () => { if (server && server.exitCode === null) server.kill('SIGTERM'); server = null; };
process.on('exit', stopServer);
process.on('SIGINT', () => { stopServer(); process.exit(130); });
function freePort(p) {
  return new Promise(res => { const s = net.createServer(); s.once('error', () => res(freePort(p + 1))); s.listen(p, () => s.close(() => res(p))); });
}

// ---------------------------------------------------------------- the page: the game's own modules and fonts, nothing else
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>bake</title>
<link rel="stylesheet" href="/src/ui/styles/tokens.css"></head><body style="background:#000">
<script type="module">
  const [P, S, Rm, C, R, Po, W, E] = await Promise.all(['/src/render/painter.js', '/src/render/studio.js', '/src/app/rooms.js',
    '/src/game/content/cards.js', '/src/game/content/relics.js', '/src/game/content/potions.js', '/src/game/content/weapons.js',
    '/src/game/content/enemies.js'].map(u => import(u)));
  await Promise.all(['700 48px "Bebas Neue"', '400 48px "Bebas Neue"', '600 20px Oswald', '500 20px "Barlow Semi Condensed"'].map(f => document.fonts.load(f).catch(() => null)));
  const renderer = P.offlineRenderer();
  const studio = S.createStudio(renderer, { cache: false, baked: false });
  const png = c => c.toDataURL('image/png');
  window.__bake = {
    info: () => ({
      bakeVersion: P.BAKE_VERSION, sizes: P.BAKE_SIZES, studioVersion: S.VERSION, studioSizes: S.SIZES,
      rooms: Rm.BAKE_ROOMS, cards: Object.keys(C.CARDS), relics: Object.entries(R.RELICS).map(([id, r]) => ({ id, weapon: r.rarity === 'weapon' })),
      potions: Object.keys(Po.POTIONS), weapons: Object.keys(W.WEAPONS), enemies: Object.keys(E.ENEMIES),
      fonts: document.fonts.check('48px "Bebas Neue"'), gpu: (() => { const gl = renderer.getContext(), x = gl.getExtension('WEBGL_debug_renderer_info'); return String(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); })(),
    }),
    room: async (key, look, w, h) => png(await P.bakeRoom(renderer, key, { width: w, height: h, look })),
    art: async (kind, id) => png(await studio.render(kind, id)),
  };
  window.__bakeReady = true;
</script></body></html>`;

// ---------------------------------------------------------------- main
const old = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
const base = await startServer();
say('dev server', base);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (args.verbose || m.type() === 'warning') console.log('  page:', m.text()); });
await page.route('**/__bake.html', r => r.fulfill({ contentType: 'text/html', body: PAGE }));
async function open() {
  await page.goto(base + '__bake.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__bakeReady === true, null, { timeout: 180000 });
}
await open();
// a call into the page; once more after a reload (Vite reloads the page when it optimises a new dependency)
async function call(fn, ...a) {
  try { return await page.evaluate(fn, a); } catch (e) {
    if (!/context was destroyed|Target closed|navigat|__bake/i.test(e.message)) throw e;
    say('  (page reloaded, retrying)'); await open(); return page.evaluate(fn, a);
  }
}
const info = await call(() => window.__bake.info());
say(`painter ${info.bakeVersion}, studio ${info.studioVersion}, GPU: ${info.gpu}${info.fonts ? '' : ' (WARNING: Bebas Neue did not load; signs would use a fallback font)'}`);

const fromPng = dataUrl => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
const hash = buf => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
function write(rel, buf) { fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true }); fs.writeFileSync(path.join(OUT, rel), buf); return { file: rel, hash: hash(buf), kb: Math.round(buf.length / 102.4) / 10 }; }
const wanted = id => !IDS || IDS.has(id);

// ---- rooms
const rooms = old.rooms?.version === info.bakeVersion ? old.rooms : { version: info.bakeVersion, list: [] };
if (old.rooms && old.rooms.version !== info.bakeVersion && ONLY.includes('rooms') && IDS) say(`rooms: the old bake is for ${old.rooms.version}: only the rooms baked now will be listed`);
rooms.version = info.bakeVersion; rooms.sizes = info.sizes;
if (ONLY.includes('rooms')) {
  for (const { key, look, tag } of info.rooms) {
    if (!wanted(key)) continue;
    const name = key + (tag ? '-' + tag : '');
    const variants = [];
    for (const [kind, [w, h]] of Object.entries(info.sizes)) {
      const t1 = Date.now();
      const png = fromPng(await call(([k, l, ww, hh]) => window.__bake.room(k, l, ww, hh), key, look, w, h));
      let q = Q0, buf;
      for (;;) { buf = await sharp(png).webp({ quality: q, effort: 6, smartSubsample: true }).toBuffer(); if (buf.length <= MAX_KB * 1024 || q <= Q_MIN) break; q -= 4; }
      const f = write(`rooms/${name}-${kind === 'wide' ? 'wide' : '4x3'}.webp`, buf);
      variants.push({ ...f, w, h, q });
      say(`room ${name} ${kind} ${w}x${h}: ${f.kb} KB (q${q}, ${Math.round((Date.now() - t1) / 1000)} s)`);
    }
    rooms.list = rooms.list.filter(e => !(e.key === key && JSON.stringify(e.look || null) === JSON.stringify(look || null)));
    rooms.list.push({ key, look: look || null, tag: tag || '', variants });
  }
  // keep the list in BAKE_ROOMS order, and only rooms that still exist
  const order = info.rooms.map(r => r.key + '|' + JSON.stringify(r.look || null));
  rooms.list = rooms.list.filter(e => order.includes(e.key + '|' + JSON.stringify(e.look || null)))
    .sort((a, b) => order.indexOf(a.key + '|' + JSON.stringify(a.look || null)) - order.indexOf(b.key + '|' + JSON.stringify(b.look || null)));
}

// ---- studio art
const sizeKey = a => (Array.isArray(a) ? a.join('x') : String(a));
const sizes = { card: sizeKey(info.studioSizes.card), relic: sizeKey(info.studioSizes.icon), potion: sizeKey(info.studioSizes.icon), weapon: sizeKey(info.studioSizes.icon), portrait: sizeKey(info.studioSizes.portrait) };
const fresh = old.studio?.version === info.studioVersion && JSON.stringify(old.studio.sizes) === JSON.stringify(sizes);
if (old.studio && !fresh) say(`studio: the old bake is for ${old.studio.version}: only the pictures baked now will be listed`);
const studio = { version: info.studioVersion, sizes, files: fresh ? { ...old.studio.files } : {} };
const ENC = {   // WebP settings per kind
  card: { quality: 75, effort: 6, smartSubsample: true },
  relic: { quality: 82, alphaQuality: 90, effort: 6 }, potion: { quality: 82, alphaQuality: 90, effort: 6 }, weapon: { quality: 82, alphaQuality: 90, effort: 6 },
  portrait: { quality: 80, effort: 6, smartSubsample: true },
};
const jobs = [];
if (ONLY.includes('cards')) for (const id of info.cards) jobs.push(['card', id, `cards/${id}.webp`]);
if (ONLY.includes('icons')) {
  for (const id of info.weapons) jobs.push(['weapon', id, `icons/weapon-${id}.webp`]);
  // a weapon relic renders exactly as its weapon (studio.js iconSubject): it shares the weapon's file
  for (const { id, weapon } of info.relics) jobs.push(weapon && info.weapons.includes(id) ? ['relic', id, null, `weapon:${id}`] : ['relic', id, `icons/relic-${id}.webp`]);
  for (const id of info.potions) jobs.push(['potion', id, `icons/potion-${id}.webp`]);
}
if (ONLY.includes('portraits')) for (const id of ['marc', 'yola', ...info.enemies]) jobs.push(['portrait', id, `portraits/${id}.webp`]);
let n = 0;
for (const [kind, id, rel, alias] of jobs) {
  if (!wanted(id)) continue;
  if (alias) { if (studio.files[alias]) studio.files[`${kind}:${id}`] = { ...studio.files[alias] }; continue; }
  const t1 = Date.now();
  const png = fromPng(await call(([k, i]) => window.__bake.art(k, i), kind, id));
  const f = write(rel, await sharp(png).webp(ENC[kind]).toBuffer());
  studio.files[`${kind}:${id}`] = f;
  n++;
  if (args.verbose || n % 10 === 1) say(`${kind} ${id}: ${f.kb} KB (${Date.now() - t1} ms)`);
}
// aliases whose weapon was baked in this run (or before) but listed after them
for (const [kind, id, , alias] of jobs) if (alias && wanted(id) && studio.files[alias]) studio.files[`${kind}:${id}`] = { ...studio.files[alias] };

// ---------------------------------------------------------------- manifest + clean-up
const manifest = { generated: new Date().toISOString(), note: 'tools/bake-art.mjs (npm run bake). Do not edit by hand.', rooms, studio };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
const listed = new Set([...rooms.list.flatMap(e => e.variants.map(v => v.file)), ...Object.values(studio.files).map(f => f.file)]);
let removed = 0;
for (const dir of ['rooms', 'cards', 'icons', 'portraits']) {
  const d = path.join(OUT, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) if (!listed.has(`${dir}/${f}`)) { fs.unlinkSync(path.join(d, f)); removed++; }
}
await browser.close();
stopServer();

const kb = files => Math.round(files.reduce((a, f) => a + f.kb, 0));
const roomFiles = rooms.list.flatMap(e => e.variants), art = Object.entries(studio.files).filter(([k]) => !k.startsWith('relic:') || !studio.files[k].file.startsWith('icons/weapon-')).map(([, f]) => f);
const by = p => art.filter(f => f.file.startsWith(p));
say(`done. rooms: ${roomFiles.length} pictures ${kb(roomFiles)} KB (largest ${Math.max(0, ...roomFiles.map(f => f.kb))} KB); cards ${by('cards/').length} ${kb(by('cards/'))} KB; icons ${by('icons/').length} ${kb(by('icons/'))} KB; portraits ${by('portraits/').length} ${kb(by('portraits/'))} KB${removed ? `; ${removed} old files removed` : ''}`);
if (errors.length) { console.log('page errors:\n  ' + errors.slice(0, 20).join('\n  ')); process.exitCode = 1; }
