// Adds existing screenshots to the build log (public/build-log/frames.json), for shots taken by other tools.
// Usage: node tools/add-frames.mjs list.json --stage 2
//   list.json = [{ "src": "/path/shot.png", "title": "...", "caption": "..." }, ...]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR = path.join(ROOT, 'public/build-log');
const LIST = path.join(DIR, 'frames.json');
const [specFile, , stageArg] = process.argv.slice(2);
const stage = Number(stageArg ?? 0);
const frames = fs.existsSync(LIST) ? JSON.parse(fs.readFileSync(LIST, 'utf8')) : [];
for (const { src, title, caption = '' } of JSON.parse(fs.readFileSync(specFile, 'utf8'))) {
  const n = (frames.at(-1)?.n ?? 0) + 1;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const file = `frames/${String(n).padStart(4, '0')}-${slug}.jpg`;
  await sharp(src).resize(1280, 720, { fit: 'inside' }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(DIR, file));
  frames.push({ n, file, title, caption, stage, date: new Date().toISOString().slice(0, 16).replace('T', ' ') });
  console.log(`frame ${n}: ${title}`);
}
fs.writeFileSync(LIST, JSON.stringify(frames, null, 1));
