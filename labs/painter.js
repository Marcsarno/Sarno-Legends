// Painter lab (port 5182): every painted room at 1280x720 plus the studio's card art, icons and portraits.
//   /labs/painter.html                  the gallery (rooms first, then studio sheets)
//   ?room=ward [&w=1280&h=720&seed=3]   one room full-window (screenshots); &raw=1 skips the paint filter
//   ?only=rooms|cards|icons|portraits   one section of the gallery
//   ?props=1 | items | weapons          survey sheet: every kit model with its size (placement work)
//   ?poses=marc|yola [&clips=a,b]       contact sheets of the hero clips (picking card-art frames)
//   &cache=1  studio renders use the IndexedDB cache (off by default here, so recipe edits show)  &fast=1  half-size rooms on SwiftShader
//   &ids=a,b  only these card / relic / potion / weapon / portrait ids
import '../src/ui/styles/tokens.css';
import * as THREE from 'three';
import { paintRoom, ROOMS, ROOM_KEYS, loadModel } from '../src/render/painter.js';
import { createStudio, poseSheet } from '../src/render/studio.js';

const Q = new URLSearchParams(location.search);
const app = document.getElementById('app');
const info = window.__info = { rooms: {}, errors: [] };
window.addEventListener('error', e => info.errors.push(String(e.message)));

function makeRenderer() {
  const canvas = document.createElement('canvas');
  const r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: false });
  r.setPixelRatio(1); r.setSize(64, 64, false);
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
  return r;
}
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

async function single() {
  const renderer = makeRenderer();
  const key = Q.get('room'), w = +(Q.get('w') || innerWidth), hh = +(Q.get('h') || innerHeight);
  const t0 = performance.now();
  const r = await paintRoom(renderer, key, { width: w, height: hh, seed: Q.get('seed') || 1, look: Q.has('raw') ? { paint: false } : null, full: !Q.has('fast') });
  info.timing = r.timing; info.size = [r.width, r.height];
  info.rooms[key] = { ms: Math.round(performance.now() - t0) };
  const fig = h('figure', 'single'); const img = new Image(); img.src = r.url; fig.append(img); app.append(fig);
  await img.decode().catch(() => {});
  window.__ready = true;
}

async function gallery() {
  app.append(h('h1', '', '<b>SARNO</b> <i>LEGENDS</i> &middot; painter lab'));
  const nav = h('nav'); for (const [k, l] of [['', 'all'], ['rooms', 'rooms'], ['cards', 'card art'], ['icons', 'icons'], ['portraits', 'portraits']]) { const a = h('a', '', l); a.href = '?' + (k ? 'only=' + k : ''); nav.append(a); }
  app.append(nav);
  const log = h('div'); log.id = 'log'; app.append(log);
  const only = Q.get('only');
  const renderer = makeRenderer();
  if (!only || only === 'rooms') {
    app.append(h('h2', '', 'Painted rooms (battle camera, 1280&times;720)'));
    const grid = h('div', 'rooms'); app.append(grid);
    for (const key of ROOM_KEYS) {
      const fig = h('figure', 'room'); const img = new Image(); fig.append(img);
      const cap = h('figcaption', '', `${ROOMS[key].name}<span>${key}</span>`); fig.append(cap); grid.append(fig);
      const t0 = performance.now();
      try {
        const r = await paintRoom(renderer, key, { width: 1280, height: 720, seed: Q.get('seed') || 1, full: !Q.has('fast') });
        img.src = r.url; const ms = Math.round(performance.now() - t0);
        cap.querySelector('span').textContent = `${key} · ${ms} ms`; info.rooms[key] = { ms };
      } catch (e) { console.error(e); info.errors.push(key + ': ' + e.message); cap.querySelector('span').textContent = 'ERROR ' + e.message; }
      log.textContent = Object.entries(info.rooms).map(([k, v]) => `${k} ${v.ms}ms`).join('  ');
    }
  }
  if (!only || ['cards', 'icons', 'portraits'].includes(only)) {
    try { await studioSheets(renderer, only); }
    catch (e) { console.error(e); info.errors.push('studio: ' + e.message); }
  }
  window.__ready = true;
}

// ---- studio sheets (card art, icons, portraits) ----
async function studioSheets(renderer, only) {
  const studio = createStudio(renderer, { cache: Q.get('cache') === '1' });
  window.__studio = studio;
  const [{ CARDS }, { RELICS }, { POTIONS }, { WEAPONS }, { ENEMIES }] = await Promise.all([
    import('../src/game/content/cards.js'), import('../src/game/content/relics.js'), import('../src/game/content/potions.js'),
    import('../src/game/content/weapons.js'), import('../src/game/content/enemies.js')]);
  const pick = (all) => Q.get('ids') ? Q.get('ids').split(',').filter(i => i in all) : Object.keys(all);
  async function sheet(title, ids, make, cls, label) {
    app.append(h('h2', '', title));
    const grid = h('div', 'sheet'); app.append(grid);
    for (const id of ids) {
      const fig = h('figure', 'tile ' + cls(id)); const img = new Image(); fig.append(img);
      fig.append(h('figcaption', '', `${label(id)}<small>${id}</small>`)); grid.append(fig);
      const t0 = performance.now();
      try { img.src = await make(id); fig.querySelector('small').textContent = `${id} ${Math.round(performance.now() - t0)}ms`; }
      catch (e) { console.error(id, e); info.errors.push(id + ': ' + e.message); fig.querySelector('small').textContent = 'ERROR ' + e.message; }
    }
  }
  if (!only || only === 'cards') await sheet('Card art (hero posed mid-clip, painted)', pick(CARDS), id => studio.cardArt(id), id => CARDS[id]?.hero || '', id => CARDS[id]?.name || id);
  if (!only || only === 'icons') {
    await sheet('Relics', pick(RELICS).filter(id => RELICS[id].rarity !== 'weapon'), id => studio.relicIcon(id), () => 'sq', id => RELICS[id].name);
    await sheet('Weapons (armory)', pick(WEAPONS), id => studio.weaponIcon(id), id => 'sq ' + WEAPONS[id].hero, id => WEAPONS[id].name);
    await sheet('Potions', pick(POTIONS), id => studio.potionIcon(id), () => 'sq', id => POTIONS[id].name);
  }
  if (!only || only === 'portraits') await sheet('Portraits', ['marc', 'yola', ...Object.keys(ENEMIES)].filter(id => !Q.get('ids') || Q.get('ids').includes(id)), id => studio.portrait(id), id => 'pt ' + (id === 'marc' || id === 'yola' ? id : ''), id => ENEMIES[id]?.name || id);
}

async function poses() {
  const renderer = makeRenderer();
  const key = Q.get('poses');
  const clips = Q.get('clips') ? Q.get('clips').split(',') : key === 'yola'
    ? ['pistol_idle', 'pistol_reload', 'rifle_aim_idle', 'ual1_Dodge_Left', 'ual1_Dodge_Right', 'ual1_Roll', 'yola_getup', 'yola_knockdown', 'sg_reload', 'ual_Sword_Regular_A', 'hit_body', 'pistol_hit']
    : ['bat_swing', 'bat_swing_m', 'bat_idle', 'ual_Sword_Block', 'melee_horizontal', 'ual_Sword_Regular_A', 'ual_Sword_Regular_B', 'ual_Sword_Regular_C', 'ual_Sword_Heavy_D', 'ual_Sword_Heavy_Combo', 'ual_Sword_Dash', 'hub_crowbar_combo', 'hub_execution_B_uppercut', 'hub_execution_C_uppercut_mirrored', 'ual1_Sword_Enter', 'ual1_Sword_Exit', 'ual1_Sword_Idle', 'ual1_Idle_LookAround_Loop', 'ual1_Dodge_Left', 'hit_body', 'ual1_Sword_Attack'];
  for (const c of clips) {
    const cv = await poseSheet(renderer, key, c, { n: +(Q.get('n') || 10), cols: +(Q.get('n') || 10), size: 240, weapon: Q.get('weapon') || (key === 'marc' ? 'wood_bat' : 'pistol') });
    if (!cv) { app.append(h('div', '', 'missing clip ' + c)); continue; }
    cv.style.display = 'block'; cv.style.width = '100%'; app.append(cv);
  }
  window.__ready = true;
}

async function props() {
  const man = await fetch('/assets/manifest.json').then(r => r.json());
  const which = Q.get('props');
  const names = which === 'items' ? man.items.map(n => 'items/' + n) : which === 'weapons' ? man.weapons.map(n => 'weapons/' + n) : man.props.map(n => 'props/' + n);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(200, 200); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const grid = h('div', 'props'); app.append(grid);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x30383a);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2.2));
  const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(3, 5, 6); scene.add(d);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  const out = [];
  for (const n of names) {
    let o; try { o = await loadModel(n); } catch (e) { continue; }
    const box = new THREE.Box3().setFromObject(o), s = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    scene.add(o);
    const r = Math.max(s.x, s.y, s.z);
    cam.position.set(c.x + r * 0.9, c.y + r * 0.6, c.z + r * 2.2); cam.lookAt(c);
    renderer.render(scene, cam); scene.remove(o);
    const fig = h('figure', 'tile sq'); const img = new Image(); img.src = renderer.domElement.toDataURL('image/jpeg', 0.8); fig.append(img);
    fig.append(h('figcaption', '', `${n.split('/')[1]}<small>${s.x.toFixed(2)} x ${s.y.toFixed(2)} x ${s.z.toFixed(2)} | y0 ${box.min.y.toFixed(2)}</small>`));
    grid.append(fig);
    out.push([n, +s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2), +box.min.y.toFixed(2), +c.x.toFixed(2), +c.z.toFixed(2)]);
  }
  window.__survey = out; window.__ready = true;
}

if (Q.has('props')) props();
else if (Q.has('poses')) poses().catch(e => { info.errors.push(e.message); console.error(e); window.__ready = true; });
else if (Q.has('room')) single().catch(e => { info.errors.push(e.message); console.error(e); window.__ready = true; });
else gallery();
