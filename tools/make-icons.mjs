// The home-screen / install icons from public/favicon.svg (the split shield and bat), into public/icons/.
//   node tools/make-icons.mjs
// icon-192.png, icon-512.png   "any" purpose: the shield on the app's dark background, a little padding
// maskable-512.png             Android adaptive icons crop to a circle / squircle: the shield sits inside the 80% safe zone
// apple-touch-icon.png (180)   iOS draws its own rounded corners and needs an opaque square
// Linked from index.html and public/manifest.webmanifest. Re-run after changing the favicon.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'public/favicon.svg');
const OUT = path.join(ROOT, 'public/icons');
const BG = '#0d1416';   // --bg in src/ui/styles/tokens.css (and the manifest's background_color)
fs.mkdirSync(OUT, { recursive: true });
const svg = fs.readFileSync(SRC);

// a soft warm glow behind the shield, like the title screen's open ER doors
const glow = size => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs><radialGradient id="g" cx="50%" cy="46%" r="55%"><stop offset="0" stop-color="#ffb76a" stop-opacity=".22"/><stop offset="1" stop-color="#ffb76a" stop-opacity="0"/></radialGradient></defs>
  <rect width="100%" height="100%" fill="${BG}"/><rect width="100%" height="100%" fill="url(#g)"/></svg>`);

async function make(file, size, scale) {
  const inner = Math.round(size * scale);
  const shield = await sharp(svg, { density: Math.ceil(72 * inner / 64) }).resize(inner, inner).png().toBuffer();
  await sharp(glow(size)).composite([{ input: shield, gravity: 'center' }]).png({ compressionLevel: 9 }).toFile(path.join(OUT, file));
  console.log('icons/' + file, size + 'px');
}

await make('icon-192.png', 192, 0.84);
await make('icon-512.png', 512, 0.84);
await make('maskable-512.png', 512, 0.62);
await make('apple-touch-icon.png', 180, 0.78);
