// Room painter: the painted battle rooms. Each room is a small 3D set dressed from the hospital kit
// (public/assets/models/props), textured walls and floor (public/assets/tex), blood decals, ceiling panels, signs and haze,
// rendered from EXACTLY the battle camera (camera.js applyBattleCamera) so the 3D characters stand on its floor, then run
// through a painterly post pass: bloom, ACES + a colour grade per room, an anisotropic Kuwahara oil-paint filter, pigment
// edge darkening, brush streaks along the image structure, canvas grain and a vignette.
//   const { texture, url } = await paintRoom(renderer, 'ward', { width: 1280, height: 720, seed: 7 })
//     texture  a THREE.CanvasTexture (sRGB, fresh per call) for scene.background or a backdrop plane
//     url      an image URL of the room (the live painting's JPEG, or the baked file)
//   await roomUrl(renderer, 'pharmacy', { width, height })   the room framed for a CSS backdrop of that size
// Baked first: tools/bake-art.mjs (npm run bake) paints every room ahead of time into public/assets/baked/rooms, and
// paintRoom crops the baked picture to the screen in a few milliseconds (see "baked rooms" below). Live painting is the
// fallback (a room that wasn't baked, a stale bake, a failed download, a seed other than 1, ?baked=0 in the URL).
// Live paintings are cached by key + size + seed; painted at most ~1600x900 (MAX_PIXELS) and at half size on a software
// GPU (SwiftShader), where a 1280x720 room takes ~15 s instead of well under a second. The stage area (x -3.5..4.5,
// z -1.5..0.8) stays clear: props stand behind z = -2.3 or off its sides. ROOMS holds the recipes (palette, light, look,
// dressing). The studio paints card art through the same pipeline (renderPainted). Uses the caller's renderer and
// restores its state (render target, clear colour, shadows).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { BATTLE, applyBattleCamera } from './camera.js';

// ---------------------------------------------------------------- assets
// asset root: '/' in dev (labs too), './' in the build (index.html sits at the root)
let BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';
export function setAssetBase(url) { BASE = url.endsWith('/') ? url : url + '/'; }
export const assetUrl = p => BASE + 'assets/' + p;

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const gltfs = new Map();
/** Cached raw gltf of public/assets/models/<path>.glb ('props/iv_stand', 'items/medkit', 'weapons/crowbar', 'marc'). */
export function loadGltf(path) {
  const p = path.replace(/\.glb$/, '');
  if (!gltfs.has(p)) gltfs.set(p, loader.loadAsync(assetUrl('models/' + p + '.glb')).then(g => { sanitize(g.scene); return g; })
    .catch(e => { gltfs.delete(p); throw e; }));
  return gltfs.get(p);
}
// Some kit GLBs (wet_floor_sign, janitor_cart, curtain_panel, locker_bank, coffee_*, the elevator...) carry a root node
// with a null translation that three turns into a NaN pivot: reset any non-finite transform so they show.
function sanitize(root) {
  root.traverse(o => {
    if (![o.position.x, o.position.y, o.position.z].every(Number.isFinite)) o.position.set(0, 0, 0);
    if (![o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w].every(Number.isFinite)) o.quaternion.identity();
    if (![o.scale.x, o.scale.y, o.scale.z].every(Number.isFinite)) o.scale.set(1, 1, 1);
    if (o.pivot && ![o.pivot.x, o.pivot.y, o.pivot.z].every(Number.isFinite)) o.pivot = null;
    o.updateMatrix();
  });
}
/** A clone of a model (shared geometry and materials). */
export async function loadModel(path) { return (await loadGltf(path)).scene.clone(true); }

const texLoader = new THREE.TextureLoader();
const texs = new Map();
/** A texture from public/assets/tex (cached; clone() it to set your own repeat). */
export function loadTex(name, srgb = true) {
  if (!texs.has(name)) texs.set(name, texLoader.loadAsync(assetUrl('tex/' + name)).then(t => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return t;
  }).catch(e => { texs.delete(name); throw e; }));
  return texs.get(name);
}

// ---------------------------------------------------------------- small helpers
/** Seeded random (mulberry32 over a string hash): r() in [0,1), r.range(a,b), r.pick(arr), r.chance(p). */
export function seededRandom(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  const r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  return r;
}
const D2R = Math.PI / 180;
export const SIGN_FONT = '"Bebas Neue", "Oswald", Impact, "Arial Narrow", "Helvetica Neue", Arial, sans-serif';

export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function canvasTex(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = makeCanvas(w, h); draw(c.getContext('2d'), w, h, c);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
// soft speckle / stain noise on a 2D canvas
function speckle(ctx, w, h, r, n, color, size = [1, 3], alpha = [0.05, 0.25]) {
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = r.range(alpha[0], alpha[1]); ctx.fillStyle = color;
    const s = r.range(size[0], size[1]); ctx.fillRect(r() * w, r() * h, s, s);
  }
  ctx.globalAlpha = 1;
}
function stain(ctx, x, y, rad, color, a = 0.25) {
  const g = ctx.createRadialGradient(x, y, rad * 0.15, x, y, rad);
  g.addColorStop(0, color.replace('A', a)); g.addColorStop(0.75, color.replace('A', a * 0.6)); g.addColorStop(1, color.replace('A', 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color.replace('A', a * 0.8); ctx.lineWidth = Math.max(1, rad * 0.03); ctx.beginPath(); ctx.arc(x, y, rad * 0.92, 0, Math.PI * 2); ctx.stroke();
}
function gradientTex(stops, { w = 4, h = 256 } = {}) {
  return canvasTex(w, h, (ctx, W, H) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    for (const [o, c] of stops) g.addColorStop(o, c);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }, { srgb: false });
}
function radialTex(stops, size = 128) {
  return canvasTex(size, size, (ctx, W) => {
    const g = ctx.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    for (const [o, c] of stops) g.addColorStop(o, c);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
  }, { srgb: false });
}

// ---------------------------------------------------------------- the room kit (builds one room's scene)
class RoomKit {
  constructor(key, recipe, rng) {
    this.key = key; this.recipe = recipe; this.r = rng;
    this.scene = new THREE.Scene();
    this.owned = [];             // geometries / materials / textures to dispose after painting
    this.wallZ = recipe.wallZ ?? -5.5;
    this.ceilH = recipe.ceilH ?? 3.1;
  }
  own(...xs) { this.owned.push(...xs); return xs[0]; }
  mat(params, Type = THREE.MeshStandardMaterial) { return this.own(new Type(params)); }
  add(o) { this.scene.add(o); return o; }
  mesh(geo, mat, at = [0, 0, 0], rot = [0, 0, 0]) {
    this.own(geo);
    const m = new THREE.Mesh(geo, mat); m.position.set(...at); m.rotation.set(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R);
    m.castShadow = true; m.receiveShadow = true;
    return this.add(m);
  }
  box(w, h, d, mat, at, rot) { return this.mesh(new THREE.BoxGeometry(w, h, d), mat, at, rot); }

  // ---- shell ----
  async floor({ tex = 'floor_clinical.webp', tile = 2.4, color = 0xffffff, rough = 0.42, z0 = 10 } = {}) {
    const t = (await loadTex(tex)).clone(); this.own(t);
    const W = 60, D = z0 - (this.recipe.floorEnd ?? (this.wallZ - 0.5));
    t.repeat.set(W / tile, D / tile); t.needsUpdate = true;
    const f = this.mesh(new THREE.PlaneGeometry(W, D), this.mat({ map: t, color, roughness: rough, metalness: 0.0 }), [0, 0, z0 - D / 2], [-90, 0, 0]);
    f.castShadow = false;
    // grime: darker, rougher patches so the floor isn't uniformly clean
    const gt = this.own(grimeTex(this.r)); gt.repeat.set(W / 9, D / 9);
    const g = this.mesh(new THREE.PlaneGeometry(W, D), this.mat({ map: gt, transparent: true, depthWrite: false, roughness: 0.9, color: 0x2a2620, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -1 }), [0, 0.001, z0 - D / 2], [-90, 0, 0]);
    g.castShadow = false;
    return f;
  }
  // the lower wall (the texture's wainscot), a plaster band above it, a chair rail, grime along the floor
  async wall({ tex = 'wall_clinical.webp', texH = 2.3, color = 0xffffff, plaster = null, z = this.wallZ, x0 = -30, x1 = 30, side = null } = {}) {
    const base = await loadTex(tex);
    const lowT = base.clone(); this.own(lowT);
    const len = x1 - x0; lowT.repeat.set(len / texH, 1); lowT.wrapT = THREE.ClampToEdgeWrapping; lowT.needsUpdate = true;
    const lowM = this.mat({ map: lowT, color, roughness: 0.82 });
    const upH = Math.max(0.1, this.ceilH - texH + 0.02);
    const upT = this.own(plasterTex(base.image, this.r)); upT.repeat.set(len / 2.4, Math.max(1, upH / 2.4));
    const upM = this.mat({ map: upT, color: plaster ?? color, roughness: 0.9 });
    const g = new THREE.Group();
    const lo = new THREE.Mesh(this.own(new THREE.PlaneGeometry(len, texH)), lowM); lo.position.set((x0 + x1) / 2, texH / 2, 0);
    const up = new THREE.Mesh(this.own(new THREE.PlaneGeometry(len, upH)), upM); up.position.set((x0 + x1) / 2, texH + upH / 2 - 0.01, 0);
    const rail = new THREE.Mesh(this.own(new THREE.BoxGeometry(len, 0.05, 0.035)), this.mat({ color: 0x8d8a80, roughness: 0.6 }));
    rail.position.set((x0 + x1) / 2, texH * 0.475, 0.017);
    const top = new THREE.Mesh(this.own(new THREE.BoxGeometry(len, 0.12, 0.05)), this.mat({ color: 0x77746c, roughness: 0.8 }));
    top.position.set((x0 + x1) / 2, this.ceilH - 0.06, 0.02);
    const grime = new THREE.Mesh(this.own(new THREE.PlaneGeometry(len, 0.8)), this.own(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false,
      alphaMap: this.own(gradientTex([[0, '#000'], [1, '#aaa']])), opacity: 0.5 })));
    grime.position.set((x0 + x1) / 2, 0.4, 0.004);
    for (const m of [lo, up, rail, top]) { m.receiveShadow = true; m.castShadow = false; g.add(m); }
    g.add(grime);
    const ao = new THREE.Mesh(this.own(new THREE.PlaneGeometry(len, 1.0)), this.own(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false,
      alphaMap: this.own(gradientTex([[0, '#000'], [1, '#999']])), opacity: 0.55 })));
    ao.rotation.x = -Math.PI / 2; ao.position.set((x0 + x1) / 2, 0.003, 0.5);
    g.add(ao);
    if (side === 'left') { g.rotation.y = Math.PI / 2; g.position.set(z, 0, 0); }
    else if (side === 'right') { g.rotation.y = -Math.PI / 2; g.position.set(z, 0, 0); }
    else g.position.z = z;
    return this.add(g);
  }
  // acoustic tiles with stains and gaps
  ceiling({ color = 0xb9b6ac, missing = 0.06 } = {}) {
    const t = this.own(ceilingTex(this.r, missing)); t.repeat.set(60 / 2.4, 40 / 2.4);
    const c = this.mesh(new THREE.PlaneGeometry(60, 40), this.mat({ map: t, color, roughness: 0.95 }), [0, this.ceilH, -12], [90, 0, 0]);
    c.castShadow = false;
    return c;
  }
  // a fluorescent ceiling panel: state 1 = on, 0 = dead, between = flickering/dim. light: 'area' (soft), 'spot' (shadows)
  panel(x, z, { state = 1, color = 0xdff3ff, w = 1.2, d = 0.6, power = 1, light = 'area', shadow = false, hang = 0, y = this.ceilH } = {}) {
    const col = new THREE.Color(color);
    const g = new THREE.Group(); g.position.set(x, y - 0.03, z);
    const housing = new THREE.Mesh(this.own(new THREE.BoxGeometry(w + 0.08, 0.06, d + 0.08)), this.mat({ color: 0x9a978f, roughness: 0.7, metalness: 0.3 }));
    const lens = new THREE.Mesh(this.own(new THREE.PlaneGeometry(w, d)), this.own(new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(state > 0 ? 1.4 + 3.0 * state * power : 0.1) })));
    lens.rotation.x = Math.PI / 2; lens.position.y = -0.032;
    g.add(housing, lens);
    if (hang) {
      g.rotation.set(hang * 0.4 * D2R, 0, hang * D2R); g.position.y -= Math.abs(Math.sin(hang * D2R)) * w * 0.5;
      const wire = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.006, 0.006, 0.7)), this.mat({ color: 0x222222 })); wire.position.set(-w * 0.45, 0.35, 0); g.add(wire);
    }
    this.add(g);
    if (state > 0) {
      const I = state * power;
      if (light === 'area') {
        RectAreaLightUniformsLib.init();
        const L = new THREE.RectAreaLight(col, 6 * I, w, d); L.position.set(x, y - 0.07, z); L.lookAt(x, 0, z); this.add(L);
      } else {
        const L = new THREE.SpotLight(col, 40 * I, 14, 62 * D2R, 0.9, 1.6); L.position.set(x, y - 0.1, z); L.target.position.set(x, 0, z);
        if (shadow) shadowed(L, 1024);
        this.add(L); this.add(L.target);
      }
    }
    return g;
  }
  point(x, y, z, color, intensity, dist = 8, decay = 1.6) { const L = new THREE.PointLight(color, intensity, dist, decay); L.position.set(x, y, z); return this.add(L); }
  spot(from, to, color, intensity, { angle = 40, penumbra = 0.8, dist = 18, decay = 1.4, shadow = false } = {}) {
    const L = new THREE.SpotLight(color, intensity, dist, angle * D2R, penumbra, decay); L.position.set(...from); L.target.position.set(...to);
    if (shadow) shadowed(L, 1024);
    this.add(L); this.add(L.target); return L;
  }
  // a wall washer: a ceiling spot close to the back wall throwing a scallop of light down it
  wash(x, { color = 0xdff3ff, power = 1, angle = 36, shadow = false, z = this.wallZ, y = this.ceilH - 0.12, reach = 0.75 } = {}) {
    return this.spot([x, y, z + reach], [x, 0.2, z + 0.02], color, 38 * power, { angle, penumbra: 0.75, dist: 9, decay: 1.5, shadow });
  }
  // an overhead pool of light on the floor
  pool(x, z, { color = 0xdff3ff, power = 1, angle = 42, shadow = false, y = this.ceilH - 0.1 } = {}) {
    return this.spot([x, y, z], [x, 0, z], color, 30 * power, { angle, penumbra: 0.85, dist: 10, decay: 1.5, shadow });
  }
  // the battle lights, so the painted floor carries the same warm (party) and cool (zombies) pools as the 3D bodies
  battlePools({ warm = 0xffc48a, cool = 0xb6e8d2, w = 1, c = 1 } = {}) {
    if (w) this.spot([-2.4, 3.4, 2.4], [-2.2, 0, -0.2], warm, 30 * w, { angle: 46, penumbra: 1, dist: 12 });
    if (c) this.spot([2.9, 3.4, 1.8], [2.7, 0, -0.4], cool, 22 * c, { angle: 48, penumbra: 1, dist: 12 });
  }

  // ---- props ----
  // A kit model, re-centred on its footprint: x/z = where its centre stands, y = its base. ry/rx/rz in degrees.
  // wall: true puts its back against the back wall (z ignored). settle: re-floor after tipping it over.
  async prop(name, x, z, { y = 0, ry = 0, rx = 0, rz = 0, s = 1, wall = false, settle = true, color = null, shadow = true } = {}) {
    let o;
    try { o = await loadModel(name.includes('/') ? name : 'props/' + name); } catch (e) { console.warn('[painter] missing model', name); return null; }
    const inner = new THREE.Group(); inner.add(o);
    const box = new THREE.Box3().setFromObject(o);
    const c = box.getCenter(new THREE.Vector3());
    o.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
    const g = new THREE.Group(); g.add(inner);
    inner.scale.setScalar(s);
    inner.rotation.set(rx * D2R, ry * D2R, rz * D2R, 'YXZ');
    if (wall) z = this.wallZ + (box.max.z - box.min.z) * s / 2 + 0.01;
    g.position.set(x, y, z);
    if ((rx || rz) && settle) { g.updateMatrixWorld(true); const b2 = new THREE.Box3().setFromObject(g); g.position.y += y - b2.min.y; }
    g.traverse(m => {
      if (!m.isMesh) return;
      m.castShadow = shadow; m.receiveShadow = true;
      if (color) { m.material = this.own(m.material.clone()); m.material.color.multiply(new THREE.Color(color)); }
      fixKitMaterial(m.material);
    });
    return this.add(g);
  }

  // ---- decals and dressing ----
  async decal(tex, x, z, { s = 1.5, ry = 0, wall = false, y = 1.2, opacity = 0.92, color = 0xe0b0aa, rough = 0.32, sx = 1, wallX = null } = {}) {
    const t = await loadTex(tex);
    const m = this.mat({ map: t, color, transparent: true, depthWrite: false, roughness: rough, opacity, polygonOffset: true, polygonOffsetFactor: -2 });
    const d = new THREE.Mesh(this.own(new THREE.PlaneGeometry(s * sx, s)), m);
    if (wallX !== null) { d.position.set(wallX + (wallX < 0 ? 0.008 : -0.008), y, z); d.rotation.set(0, (wallX < 0 ? 90 : -90) * D2R, ry * D2R); }
    else if (wall) { d.position.set(x, y, this.wallZ + 0.008); d.rotation.z = ry * D2R; }
    else { d.position.set(x, 0.004 + this.r() * 0.002, z); d.rotation.set(-Math.PI / 2, 0, ry * D2R); }
    d.receiveShadow = true;
    return this.add(d);
  }
  // loose papers / charts on the floor in a region
  papers(n, [x0, x1], [z0, z1], { color = 0xe8e2d2 } = {}) {
    const m = this.mat({ color, roughness: 0.85, side: THREE.DoubleSide });
    const geo = this.own(new THREE.PlaneGeometry(0.21, 0.29));
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(geo, m); p.rotation.set(-Math.PI / 2 + this.r.range(-0.05, 0.05), 0, this.r() * Math.PI * 2);
      p.position.set(this.r.range(x0, x1), 0.006 + i * 0.0004, this.r.range(z0, z1)); p.receiveShadow = true; this.add(p);
    }
  }
  // a sign board: text on a plate; glow > 0 makes it a lit sign (and adds a little coloured light)
  sign(text, x, y, z, { w = 1.6, h = 0.42, bg = '#1f3f45', fg = '#e9efe9', glow = 0, light = null, font = 0.62, wallMount = true, arrow = null, sub = null } = {}) {
    const px = 512, ph = Math.max(32, Math.round(px * h / w));
    const t = this.own(canvasTex(px, ph, (ctx, W, H) => {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = Math.max(2, H * 0.04); ctx.strokeRect(H * 0.08, H * 0.08, W - H * 0.16, H - H * 0.16);
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(H * font)}px ${SIGN_FONT}`;
      const tx = arrow === 'left' ? W * 0.56 : arrow === 'right' ? W * 0.44 : W / 2;
      ctx.fillText(text, tx, sub ? H * 0.4 : H * 0.55, W * 0.8);
      if (sub) { ctx.font = `600 ${Math.round(H * 0.2)}px ${SIGN_FONT}`; ctx.globalAlpha = 0.8; ctx.fillText(sub, tx, H * 0.78, W * 0.8); ctx.globalAlpha = 1; }
      if (arrow) { ctx.font = `700 ${Math.round(H * 0.6)}px Arial, sans-serif`; ctx.fillText(arrow === 'left' ? '←' : '→', arrow === 'left' ? W * 0.1 : W * 0.9, H * 0.52); }
      speckle(ctx, W, H, this.r, 260, '#000', [1, 3], [0.05, 0.2]);
    }));
    const m = glow ? this.own(new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1, 1, 1).multiplyScalar(1 + glow) })) : this.mat({ map: t, roughness: 0.55 });
    const g = new THREE.Group();
    const plate = new THREE.Mesh(this.own(new THREE.PlaneGeometry(w, h)), m); plate.position.z = 0.026;
    const back = new THREE.Mesh(this.own(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.05)), this.mat({ color: 0x2a2c2c, roughness: 0.6, metalness: 0.4 }));
    g.add(back, plate);
    g.position.set(x, y, wallMount ? this.wallZ + 0.03 : z);
    if (light) this.point(x, y - h * 0.3, (wallMount ? this.wallZ : z) + 0.7, light, 2.5 * (glow || 1), 5, 1.8);
    return this.add(g);
  }
  // a window high in the back wall: night outside, blinds, a cool shaft of moonlight
  window(x, y, { w = 2.0, h = 1.2, blinds = 0.7, moon = 0x9fc4ff, shaft = true, power = 1 } = {}) {
    const z = this.wallZ;
    const g = new THREE.Group(); g.position.set(x, y, z);
    const night = this.own(canvasTex(256, 160, (ctx, W, H) => {
      const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0d1c2e'); gr.addColorStop(0.7, '#1f3550'); gr.addColorStop(1, '#3a4f66');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 9; i++) {
        const bw = 20 + this.r() * 40, bh = 30 + this.r() * 70, bx = this.r() * W;
        ctx.fillStyle = '#0a121c'; ctx.fillRect(bx, H - bh, bw, bh);
        ctx.fillStyle = 'rgba(255,214,150,0.6)'; for (let k = 0; k < 4; k++) if (this.r() < 0.35) ctx.fillRect(bx + 4 + this.r() * (bw - 8), H - bh + 6 + this.r() * (bh - 12), 3, 3);
      }
    }));
    const glass = new THREE.Mesh(this.own(new THREE.PlaneGeometry(w, h)), this.own(new THREE.MeshBasicMaterial({ map: night, color: new THREE.Color(0xb0c4dd).multiplyScalar(1.3) })));
    const frameM = this.mat({ color: 0xcfcabc, roughness: 0.6 });
    const fr = (fw, fh, fx, fy) => { const b = new THREE.Mesh(this.own(new THREE.BoxGeometry(fw, fh, 0.08)), frameM); b.position.set(fx, fy, 0.03); b.castShadow = true; g.add(b); };
    fr(w + 0.12, 0.07, 0, h / 2); fr(w + 0.12, 0.09, 0, -h / 2); fr(0.07, h, -w / 2, 0); fr(0.07, h, w / 2, 0); fr(0.04, h, 0, 0);
    g.add(glass);
    if (blinds) {
      const bt = this.own(canvasTex(64, 256, (ctx, W, H) => {
        ctx.clearRect(0, 0, W, H);
        for (let i = 0; i < 26; i++) { const yy = i * (H / 26); if (yy > H * blinds && this.r() < 0.85) continue; ctx.fillStyle = 'rgba(214,208,192,0.95)'; ctx.fillRect(0, yy, W, H / 26 * 0.62); }
      }));
      const bl = new THREE.Mesh(this.own(new THREE.PlaneGeometry(w * 0.98, h * 0.98)), this.mat({ map: bt, transparent: true, alphaTest: 0.3, roughness: 0.7, side: THREE.DoubleSide }));
      bl.position.z = 0.05; bl.rotation.z = this.r.range(-0.03, 0.03); bl.castShadow = true; g.add(bl);
    }
    this.add(g);
    this.point(x, y - 0.2, z + 1.0, moon, 3.5 * power, 6, 1.6);
    if (shaft) this.shaft([x, y - h * 0.3, z + 0.1], [x + 0.6, 0, z + 2.2], w * 0.8, moon, 0.1 * power);
    return g;
  }
  // an additive shaft of light: one tapered quad from a source down to the floor, turned to face the battle camera
  shaft(from, to, width, color, opacity = 0.08, spread = 1.8) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const u = b.clone().sub(a).normalize(), mid = a.clone().add(b).multiplyScalar(0.5);
    const view = BATTLE.position.clone().sub(mid).normalize();
    const side = new THREE.Vector3().crossVectors(u, view).normalize();
    const w0 = width / 2, w1 = width * spread / 2;
    const P = [a.clone().addScaledVector(side, -w0), a.clone().addScaledVector(side, w0), b.clone().addScaledVector(side, -w1), b.clone().addScaledVector(side, w1)];
    const geo = this.own(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap(p => p.toArray()), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
    geo.setIndex([0, 2, 1, 1, 2, 3]);
    const m = this.own(new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 color; uniform float opacity; varying vec2 vUv; void main(){ float across = sin(vUv.x * 3.14159); float along = smoothstep(0.0, 0.25, vUv.y) * (0.35 + 0.65 * vUv.y); gl_FragColor = vec4(color * across * across * along * opacity, 1.0); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    return this.add(new THREE.Mesh(geo, m));
  }
  // a soft additive pool of light lying on the floor (light spilling through a door, off a lightbox)
  floorGlow(x, z, { w = 2.4, d = 4, color = 0xffe6c8, opacity = 0.18, ry = 0 } = {}) {
    const m = this.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(opacity), map: this.own(radialTex([[0, '#fff'], [0.4, '#777'], [1, '#000']])), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const q = new THREE.Mesh(this.own(new THREE.PlaneGeometry(w, d)), m); q.rotation.set(-Math.PI / 2, 0, ry * D2R); q.position.set(x, 0.008, z);
    return this.add(q);
  }
  // a cone of light under a lamp
  cone(x, y, z, { r = 1.6, color = 0xdff3ff, opacity = 0.05 } = {}) {
    const t = this.own(gradientTex([[0, '#fff'], [0.7, '#333'], [1, '#000']]));
    const m = this.own(new THREE.MeshBasicMaterial({ color, alphaMap: t, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const c = new THREE.Mesh(this.own(new THREE.ConeGeometry(r, y, 24, 1, true)), m); c.position.set(x, y / 2, z); return this.add(c);
  }
  // a soft glow sprite (light bloom around a source)
  glow(x, y, z, { color = 0xffffff, s = 1, opacity = 0.5 } = {}) {
    const sp = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: this.own(radialTex([[0, '#fff'], [0.25, '#888'], [1, '#000']])), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
    sp.position.set(x, y, z); sp.scale.set(s, s, 1); return this.add(sp);
  }
  // a cardboard box or wooden crate (procedural)
  crate(x, z, { w = 0.6, h = 0.45, d = 0.45, ry = 0, y = 0, wood = false, label = null, color = null } = {}) {
    const t = this.own(wood ? woodTex(this.r) : cardboardTex(this.r, label));
    return this.box(w, h, d, this.mat({ map: t, roughness: 0.85, color: color ?? (wood ? 0xb89a72 : 0xcfb38a) }), [x, y + h / 2, z], [0, ry, 0]);
  }
  // a hanging bare bulb (warm) with a shade, the light it throws (with shadows)
  bulb(x, z, { y = this.ceilH - 0.9, color = 0xffc070, power = 1, shade = true } = {}) {
    const cord = this.box(0.01, this.ceilH - y, 0.01, this.mat({ color: 0x111111 }), [x, (this.ceilH + y) / 2, z]);
    cord.castShadow = false;
    const glow = new THREE.Mesh(this.own(new THREE.SphereGeometry(0.06, 16, 12)), this.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(6) })));
    glow.position.set(x, y, z); this.add(glow);
    if (shade) { const s = new THREE.Mesh(this.own(new THREE.ConeGeometry(0.22, 0.18, 20, 1, true)), this.mat({ color: 0x2f3a36, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide })); s.position.set(x, y + 0.06, z); s.castShadow = false; this.add(s); }
    const L = new THREE.PointLight(color, 10 * power, 10, 1.5); L.position.set(x, y - 0.08, z);
    L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.bias = -0.002; L.shadow.radius = 4; this.add(L);
    return L;
  }
  // caution tape between two points
  tape(a, b, { color = '#e8c228', text = 'CAUTION' } = {}) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
    const t = this.own(canvasTex(512, 32, (ctx, W, H) => {
      ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#151515'; ctx.font = `700 ${H * 0.75}px ${SIGN_FONT}`; ctx.textBaseline = 'middle';
      for (let x = 6; x < W; x += 128) ctx.fillText(text, x, H * 0.54);
    }));
    t.wrapS = THREE.RepeatWrapping; t.repeat.set(len / 1.4, 1);
    const m = new THREE.Mesh(this.own(new THREE.PlaneGeometry(len, 0.075)), this.mat({ map: t, roughness: 0.6, side: THREE.DoubleSide }));
    m.position.copy(A).add(B).multiplyScalar(0.5); m.position.y -= 0.04;
    m.rotation.y = -Math.atan2(B.z - A.z, B.x - A.x); m.rotation.x = 0.1; m.castShadow = true;
    return this.add(m);
  }
  // a big soft haze card (the hazy depth between the stage and the far wall)
  haze(z, { color = 0x6f8f92, opacity = 0.08, y = 1.6, w = 40, h = 4 } = {}) {
    const m = this.own(new THREE.MeshBasicMaterial({ color, map: this.own(hazeTex(this.r)), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const q = new THREE.Mesh(this.own(new THREE.PlaneGeometry(w, h)), m); q.position.set(0, y, z); return this.add(q);
  }
  dispose() {
    this.scene.traverse(o => { if (o.isLight && o.shadow?.map) o.shadow.map.dispose(); });
    for (const o of this.owned) o?.dispose?.();
    this.owned.length = 0;
  }
}
function shadowed(L, size) { L.castShadow = true; L.shadow.mapSize.set(size, size); L.shadow.bias = -0.0005; L.shadow.normalBias = 0.02; L.shadow.radius = 4; return L; }

// kit materials: Tripo-style PBR exports can come in very metallic; keep them readable under room lights
function fixKitMaterial(m) {
  for (const x of Array.isArray(m) ? m : [m]) {
    if (!x || x.userData.painterFixed) continue;
    x.userData.painterFixed = true;
    if (x.metalness > 0.6) x.metalness = 0.35;
    x.roughness = Math.max(0.4, x.roughness ?? 1);
    if (x.map) x.map.anisotropy = 4;
  }
}

// ---- procedural textures ----
function ceilingTex(r, missing) {
  return canvasTex(1024, 1024, (ctx, W, H) => {
    ctx.fillStyle = '#cfccc2'; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, r, 9000, '#6d6a62', [1, 2.5], [0.08, 0.3]);
    const n = 4, s = W / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (r() < missing) { ctx.fillStyle = '#141514'; ctx.fillRect(i * s, j * s, s, s); ctx.fillStyle = '#3a3a36'; ctx.fillRect(i * s + s * 0.1, j * s + s * 0.2, s * 0.25, s * 0.05); continue; }
      if (r() < 0.35) stain(ctx, i * s + r() * s, j * s + r() * s, s * r.range(0.15, 0.45), 'rgba(122,96,60,A)', r.range(0.12, 0.3));
    }
    ctx.strokeStyle = '#7d7a72'; ctx.lineWidth = 7;
    for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(W, i * s); ctx.stroke(); }
  }, { repeat: true });
}
// the upper wall: the top band of the wall texture, mirrored so it tiles, with drips and stains
function plasterTex(img, r) {
  return canvasTex(512, 512, (ctx, W, H) => {
    const sh = img.height * 0.32;
    ctx.drawImage(img, 0, img.height * 0.04, img.width, sh, 0, 0, W, H / 2);
    ctx.save(); ctx.translate(0, H); ctx.scale(1, -1); ctx.drawImage(img, 0, img.height * 0.04, img.width, sh, 0, 0, W, H / 2); ctx.restore();
    for (let i = 0; i < 5; i++) stain(ctx, r() * W, r() * H, r.range(30, 110), 'rgba(110,92,64,A)', r.range(0.05, 0.14));
    ctx.globalAlpha = 0.12; ctx.fillStyle = '#4c4232';
    for (let i = 0; i < 14; i++) ctx.fillRect(r() * W, r() * H * 0.3, r.range(1, 3), r.range(30, 200));
    ctx.globalAlpha = 1;
  }, { repeat: true });
}
// floor grime: soft dark blotches and scuffs (alpha in the texture)
function grimeTex(r) {
  return canvasTex(512, 512, (ctx, W, H) => {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) { const x = r() * W, y = r() * H, rad = r.range(30, 120);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(0,0,0,${r.range(0.15, 0.4)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineCap = 'round';
    for (let i = 0; i < 40; i++) { ctx.lineWidth = r.range(1, 4); ctx.beginPath(); const x = r() * W, y = r() * H; ctx.moveTo(x, y); ctx.quadraticCurveTo(x + r.range(-60, 60), y + r.range(-20, 20), x + r.range(-120, 120), y + r.range(-30, 30)); ctx.stroke(); }
  }, { repeat: true });
}
function cardboardTex(r, label) {
  return canvasTex(256, 256, (ctx, W, H) => {
    ctx.fillStyle = '#c49a64'; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, r, 1500, '#7a5a34', [1, 3], [0.05, 0.2]);
    ctx.fillStyle = 'rgba(150,140,120,0.55)'; ctx.fillRect(W * 0.42, 0, W * 0.16, H);
    if (label) { ctx.fillStyle = '#efe9da'; ctx.fillRect(W * 0.1, H * 0.55, W * 0.5, H * 0.24); ctx.fillStyle = '#3a3a3a'; ctx.font = `700 ${H * 0.15}px ${SIGN_FONT}`; ctx.textBaseline = 'middle'; ctx.fillText(label, W * 0.14, H * 0.68, W * 0.44); }
    if (r() < 0.5) stain(ctx, r() * W, r() * H, r.range(20, 60), 'rgba(90,60,30,A)', 0.25);
  });
}
function woodTex(r) {
  return canvasTex(256, 256, (ctx, W, H) => {
    for (let i = 0; i < 6; i++) { ctx.fillStyle = `hsl(32, ${30 + r() * 15}%, ${38 + r() * 12}%)`; ctx.fillRect(0, i * H / 6, W, H / 6 - 4); }
    ctx.fillStyle = 'rgba(40,25,10,0.35)'; for (let i = 0; i < 80; i++) ctx.fillRect(0, r() * H, W, 1);
    ctx.fillStyle = '#4a3420'; ctx.fillRect(W * 0.05, 0, W * 0.08, H); ctx.fillRect(W * 0.87, 0, W * 0.08, H);
  });
}
function hazeTex(r) {
  return canvasTex(512, 128, (ctx, W, H) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) { const x = r() * W, y = H * r.range(0.25, 0.8), rad = r.range(20, 80);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(255,255,255,${r.range(0.05, 0.16)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    const v = ctx.createLinearGradient(0, 0, 0, H); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.35, 'rgba(0,0,0,0)'); v.addColorStop(0.75, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  });
}
function xrayTex(r) {
  return canvasTex(512, 256, (ctx, W, H) => {
    ctx.fillStyle = '#cfe6f2'; ctx.fillRect(0, 0, W, H);
    for (let f = 0; f < 3; f++) {
      const x0 = 12 + f * (W - 24) / 3, fw = (W - 24) / 3 - 12, cx = x0 + fw / 2;
      ctx.fillStyle = '#0d1b24'; ctx.fillRect(x0, 14, fw, H - 28);
      ctx.strokeStyle = 'rgba(220,240,255,0.8)'; ctx.lineCap = 'round';
      if (f === 1) { // skull
        ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(cx, H * 0.42, fw * 0.3, H * 0.27, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(220,240,255,0.5)'; ctx.beginPath(); ctx.ellipse(cx - fw * 0.12, H * 0.45, fw * 0.07, H * 0.05, 0, 0, 7); ctx.ellipse(cx + fw * 0.12, H * 0.45, fw * 0.07, H * 0.05, 0, 0, 7); ctx.fill();
        ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - fw * 0.16, H * 0.72); ctx.lineTo(cx + fw * 0.16, H * 0.72); ctx.stroke();
      } else { // ribs and spine
        ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx, 28); ctx.lineTo(cx, H - 30); ctx.stroke();
        ctx.lineWidth = 3.5;
        for (let i = 0; i < 7; i++) { const y = 40 + i * 24; ctx.beginPath(); ctx.ellipse(cx, y + 18, fw * (0.22 + i * 0.02), 20, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); }
      }
    }
    speckle(ctx, W, H, r, 500, '#fff', [1, 2], [0.03, 0.12]);
  });
}
function trefoilTex() {
  return canvasTex(256, 256, (ctx, W, H) => {
    ctx.fillStyle = '#e6b923'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#141414'; const cx = W / 2, cy = H * 0.44;
    ctx.beginPath(); ctx.arc(cx, cy, W * 0.07, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 3; ctx.beginPath(); ctx.arc(cx, cy, W * 0.3, a - 0.52, a + 0.52); ctx.arc(cx, cy, W * 0.11, a + 0.52, a - 0.52, true); ctx.closePath(); ctx.fill(); }
    ctx.font = `700 ${H * 0.13}px ${SIGN_FONT}`; ctx.textAlign = 'center'; ctx.fillText('RADIATION', cx, H * 0.9);
  });
}
function corkTex(r) {
  return canvasTex(512, 320, (ctx, W, H) => {
    ctx.fillStyle = '#9c7449'; ctx.fillRect(0, 0, W, H); speckle(ctx, W, H, r, 3000, '#5a3d20', [1, 3], [0.1, 0.4]);
    for (let i = 0; i < 9; i++) {
      ctx.save(); ctx.translate(30 + r() * (W - 80), 20 + r() * (H - 90)); ctx.rotate(r.range(-0.15, 0.15));
      ctx.fillStyle = r.pick(['#efe9d8', '#f2e47a', '#cfe3f0', '#efe9d8']); ctx.fillRect(0, 0, 70 + r() * 30, 60 + r() * 30);
      ctx.fillStyle = 'rgba(40,40,40,0.5)'; for (let l = 0; l < 5; l++) ctx.fillRect(8, 12 + l * 9, 40 + r() * 30, 2);
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(35, 4, 4, 0, 7); ctx.fill(); ctx.restore();
    }
    ctx.strokeStyle = '#5b3f22'; ctx.lineWidth = 14; ctx.strokeRect(0, 0, W, H);
  });
}

// ---------------------------------------------------------------- the painterly pipeline (shaders)
// ShaderMaterial on WebGL2 compiles as GLSL ES 3.00 (dynamic loops are fine); written with the GLSL1 aliases three defines.
const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const NOISE = `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }`;

const SHADERS = {
  // soft-threshold downsample of the HDR render for bloom
  bright: `uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold; varying vec2 vUv;
    void main() { vec3 c = vec3(0.0);
      c += texture2D(tSrc, vUv + texel * vec2(-1.0, -1.0)).rgb; c += texture2D(tSrc, vUv + texel * vec2(1.0, -1.0)).rgb;
      c += texture2D(tSrc, vUv + texel * vec2(-1.0, 1.0)).rgb; c += texture2D(tSrc, vUv + texel * vec2(1.0, 1.0)).rgb; c *= 0.25;
      float l = max(c.r, max(c.g, c.b)); float k = max(0.0, l - threshold); k = k * k / (l + 0.25 + k);
      gl_FragColor = vec4(c * (k / max(l, 1e-4)), 1.0); }`,
  // separable gaussian (dir = one step in uv)
  blur: `uniform sampler2D tSrc; uniform vec2 dir; uniform float sigma; varying vec2 vUv;
    void main() { vec4 acc = vec4(0.0); float wsum = 0.0;
      for (int i = -8; i <= 8; i++) { float x = float(i); float w = exp(-x * x / (2.0 * sigma * sigma)); acc += texture2D(tSrc, vUv + dir * x) * w; wsum += w; }
      gl_FragColor = acc / wsum; }`,
  // HDR -> exposure -> ACES (three's fit) -> sRGB -> lift/gamma/gain, saturation, contrast, split tone
  grade: `uniform sampler2D tSrc; uniform sampler2D tBloom; uniform float exposure, bloom, contrast, saturation, warm;
    uniform vec3 lift, gamma, gain, shadowTint, highTint; varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 color) {
      const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color = inM * (color / 0.6); color = RRTAndODTFit(color); return clamp(outM * color, 0.0, 1.0); }
    vec3 toSRGB(vec3 c) { return mix(pow(max(c, 0.0), vec3(1.0 / 2.4)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
    void main() {
      vec4 s = texture2D(tSrc, vUv);
      vec3 c = s.rgb + texture2D(tBloom, vUv).rgb * bloom;
      c = toSRGB(aces(c * exposure));
      c = pow(max(gain * (c + lift * (1.0 - c)), 0.0), 1.0 / gamma);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.45) * contrast + 0.45;
      c += shadowTint * (1.0 - smoothstep(0.0, 0.45, l)) + highTint * smoothstep(0.45, 1.0, l);
      c.r += warm * 0.03; c.b -= warm * 0.03;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), s.a); }`,
  // structure tensor from Sobel derivatives
  sst: `uniform sampler2D tSrc; uniform vec2 texel; varying vec2 vUv;
    vec3 T(float x, float y) { return texture2D(tSrc, vUv + texel * vec2(x, y)).rgb; }
    void main() {
      vec3 sx = (T(1.0, -1.0) + 2.0 * T(1.0, 0.0) + T(1.0, 1.0) - T(-1.0, -1.0) - 2.0 * T(-1.0, 0.0) - T(-1.0, 1.0)) / 4.0;
      vec3 sy = (T(-1.0, 1.0) + 2.0 * T(0.0, 1.0) + T(1.0, 1.0) - T(-1.0, -1.0) - 2.0 * T(0.0, -1.0) - T(1.0, -1.0)) / 4.0;
      gl_FragColor = vec4(dot(sx, sx), dot(sy, sy), dot(sx, sy), 1.0); }`,
  // anisotropic Kuwahara with polynomial sector weights (Kyprianidis et al. 2009/2011)
  akf: `uniform sampler2D tSrc; uniform sampler2D tTfm; uniform vec2 texel; uniform float radius, alpha, hardness, sharpness, zeta, zeroCross; varying vec2 vUv;
    void main() {
      vec3 g = texture2D(tTfm, vUv).xyz;
      float E = g.x, G = g.y, F = g.z;
      float D = sqrt(max(0.0, (E - G) * (E - G) + 4.0 * F * F));
      float l1 = 0.5 * (E + G + D), l2 = 0.5 * (E + G - D);
      vec2 t = vec2(l1 - E, -F); t = length(t) > 0.0 ? normalize(t) : vec2(0.0, 1.0);
      float phi = -atan(t.y, t.x);
      float A = (l1 + l2 > 0.0) ? (l1 - l2) / (l1 + l2) : 0.0;
      float a = radius * clamp((alpha + A) / alpha, 0.1, 2.0), b = radius * clamp(alpha / (alpha + A), 0.1, 2.0);
      float cp = cos(phi), sp = sin(phi);
      mat2 SR = mat2(0.5 / a, 0.0, 0.0, 0.5 / b) * mat2(cp, sp, -sp, cp);
      int maxX = int(sqrt(a * a * cp * cp + b * b * sp * sp)), maxY = int(sqrt(a * a * sp * sp + b * b * cp * cp));
      float sz = sin(zeroCross), eta = (zeta + cos(zeroCross)) / (sz * sz);
      vec4 m[8]; vec3 s[8];
      for (int k = 0; k < 8; k++) { m[k] = vec4(0.0); s[k] = vec3(0.0); }
      float alphaAcc = 0.0, alphaW = 0.0;
      for (int y = -maxY; y <= maxY; y++) for (int x = -maxX; x <= maxX; x++) {
        vec2 v = SR * vec2(float(x), float(y));
        if (dot(v, v) > 0.25) continue;
        vec4 c4 = texture2D(tSrc, vUv + vec2(float(x), float(y)) * texel); vec3 c = c4.rgb;
        float w[8]; float sum = 0.0, z, vxx, vyy;
        vxx = zeta - eta * v.x * v.x; vyy = zeta - eta * v.y * v.y;
        z = max(0.0, v.y + vxx); w[0] = z * z; sum += w[0];
        z = max(0.0, -v.x + vyy); w[2] = z * z; sum += w[2];
        z = max(0.0, -v.y + vxx); w[4] = z * z; sum += w[4];
        z = max(0.0, v.x + vyy); w[6] = z * z; sum += w[6];
        v = 0.70710678 * vec2(v.x - v.y, v.x + v.y);
        vxx = zeta - eta * v.x * v.x; vyy = zeta - eta * v.y * v.y;
        z = max(0.0, v.y + vxx); w[1] = z * z; sum += w[1];
        z = max(0.0, -v.x + vyy); w[3] = z * z; sum += w[3];
        z = max(0.0, -v.y + vxx); w[5] = z * z; sum += w[5];
        z = max(0.0, v.x + vyy); w[7] = z * z; sum += w[7];
        float gw = exp(-3.125 * dot(v, v)) / max(sum, 1e-6);
        for (int k = 0; k < 8; k++) { float wk = w[k] * gw; m[k] += vec4(c * wk, wk); s[k] += c * c * wk; }
        alphaAcc += c4.a; alphaW += 1.0;
      }
      vec4 o = vec4(0.0);
      for (int k = 0; k < 8; k++) {
        if (m[k].w <= 0.0) continue;
        vec3 mu = m[k].rgb / m[k].w; vec3 sk = abs(s[k] / m[k].w - mu * mu);
        float w = 1.0 / (1.0 + pow(hardness * 1000.0 * (sk.r + sk.g + sk.b), 0.5 * sharpness));
        o += vec4(mu * w, w);
      }
      vec4 center = texture2D(tSrc, vUv);
      gl_FragColor = vec4(o.w > 0.0 ? o.rgb / o.w : center.rgb, alphaW > 0.0 ? alphaAcc / alphaW : center.a); }`,
  // paint finish: some detail back, pigment edge darkening, brush streaks along the flow, canvas grain, vignette
  finish: NOISE + `uniform sampler2D tSrc; uniform sampler2D tTfm; uniform sampler2D tDetail; uniform vec2 texel; uniform vec2 res;
    uniform float edge, stroke, grain, vignette, seed, detail, tone; uniform vec3 vigColor; varying vec2 vUv;
    float L(vec2 o) { return dot(texture2D(tSrc, vUv + o * texel).rgb, vec3(0.299, 0.587, 0.114)); }
    void main() {
      vec4 c4 = texture2D(tSrc, vUv); vec3 c = c4.rgb;
      c = mix(c, texture2D(tDetail, vUv).rgb, detail);
      float gx = L(vec2(1, 0)) - L(vec2(-1, 0)), gy = L(vec2(0, 1)) - L(vec2(0, -1));
      float e = smoothstep(0.04, 0.22, length(vec2(gx, gy)));
      c = mix(c, c * c * 0.92, e * edge);
      vec3 g = texture2D(tTfm, vUv).xyz; float D = sqrt(max(0.0, (g.x - g.y) * (g.x - g.y) + 4.0 * g.z * g.z));
      vec2 t = vec2(0.5 * (g.x + g.y + D) - g.x, -g.z); t = length(t) > 1e-6 ? normalize(t) : vec2(0.7071, 0.7071);
      vec2 p = vUv * vec2(res.x / res.y, 1.0) * 720.0;   // pixels at a 720-line reference, so the look holds at any size
      float n = 0.0;
      for (int i = -6; i <= 6; i++) n += vnoise((p + t * float(i) * 1.6) * 0.42 + seed);
      n /= 13.0;
      float n2 = vnoise(p * 0.06 + seed * 1.7);
      c *= 1.0 + (n - 0.5) * stroke * 2.2 + (n2 - 0.5) * stroke * 0.8;
      float n3 = vnoise(p * 0.012 + seed * 3.1) - 0.5;   // underpainting: slow warm/cool drift
      c += vec3(n3, n3 * 0.2, -n3) * tone;
      float weave = (sin(p.x * 2.1) * 0.5 + 0.5) * (sin(p.y * 2.1) * 0.5 + 0.5);
      float tooth = vnoise(p * 0.9 + 13.1) * 0.6 + vnoise(p * 0.23 + 7.7) * 0.4;
      c *= 1.0 + ((weave - 0.25) * 0.5 + (tooth - 0.5)) * grain;
      vec2 q = (vUv - 0.5) * vec2(1.0, 0.86); float v = smoothstep(0.78, 0.18, length(q) * 1.18);
      c = mix(c * vigColor, c, mix(1.0, v, vignette));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), c4.a); }`,
};

const pipes = new WeakMap();   // renderer -> { quad scene, mats, render targets by size, env map }
function getPipe(renderer) {
  let P = pipes.get(renderer);
  if (P) return P;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false;
  const qs = new THREE.Scene(); qs.add(quad);
  const mats = {};
  for (const [name, frag] of Object.entries(SHADERS)) mats[name] = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: {}, depthTest: false, depthWrite: false });
  P = { quad, qs, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mats, targets: new Map(), env: null };
  pipes.set(renderer, P);
  return P;
}
function rt(w, h, { type = THREE.HalfFloatType, samples = 0, depth = false } = {}) {
  const t = new THREE.WebGLRenderTarget(w, h, { type, samples, depthBuffer: depth, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: false });
  t.texture.colorSpace = THREE.NoColorSpace;
  return t;
}
function targetsFor(P, w, h) {
  const key = w + 'x' + h;
  if (P.targets.has(key)) { const T = P.targets.get(key); P.targets.delete(key); P.targets.set(key, T); return T; }
  const qw = Math.max(1, Math.round(w / 4)), qh = Math.max(1, Math.round(h / 4));
  const T = { scene: rt(w, h, { samples: 4, depth: true }), base: rt(w, h), a: rt(w, h), b: rt(w, h), paint: rt(w, h), out: rt(w, h, { type: THREE.UnsignedByteType }), q1: rt(qw, qh), q2: rt(qw, qh) };
  P.targets.set(key, T);
  while (P.targets.size > 3) { const [k, old] = P.targets.entries().next().value; for (const x of Object.values(old)) x.dispose(); P.targets.delete(k); }
  return T;
}
function pass(renderer, P, name, uniforms, target) {
  const m = P.mats[name];
  for (const [k, v] of Object.entries(uniforms)) { if (m.uniforms[k]) m.uniforms[k].value = v; else m.uniforms[k] = { value: v }; }
  P.quad.material = m;
  renderer.setRenderTarget(target);
  renderer.render(P.qs, P.cam);
}
/** A dim room environment map for kit materials (one per renderer). */
export function roomEnvironment(renderer) {
  const P = getPipe(renderer);
  if (!P.env) { const pm = new THREE.PMREMGenerator(renderer); P.env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); }
  return P.env;
}

// the default look (a room recipe's `look` overrides any of these)
export const LOOK = {
  exposure: 1.0, bloom: 0.5, threshold: 1.3, contrast: 1.06, saturation: 0.86, warm: 0,
  lift: [0.02, 0.035, 0.04], gamma: [1, 1, 1], gain: [1, 1, 1], shadowTint: [-0.01, 0.01, 0.025], highTint: [0.03, 0.015, -0.01],
  radius: 6.5, alpha: 1, hardness: 8, sharpness: 6, zeta: 0.17, zeroCross: 0.58, passes: 1,
  edge: 0.7, stroke: 0.09, grain: 0.07, vignette: 1.0, paint: true, vigColor: [0.12, 0.14, 0.16], detail: 0.05, tone: 0.05, clear: [0.02, 0.03, 0.035, 1],
};

/**
 * Render scene/camera at w x h through the painterly pipeline; returns a canvas of display-ready sRGB pixels.
 * look: LOOK overrides. transparent: keep alpha (icons, cut-outs). The renderer's state is restored.
 */
export async function renderPainted(renderer, scene, camera, w, h, look = {}, { transparent = false } = {}) {
  const L = { ...LOOK, ...look };
  const P = getPipe(renderer), T = targetsFor(P, w, h);
  const prev = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear, clearColor: renderer.getClearColor(new THREE.Color()), clearAlpha: renderer.getClearAlpha(), shadow: renderer.shadowMap.enabled };
  const tx = new THREE.Vector2(1 / w, 1 / h);
  try {
    renderer.shadowMap.enabled = true;
    renderer.autoClear = true;
    renderer.setClearColor(new THREE.Color(L.clear[0], L.clear[1], L.clear[2]), transparent ? 0 : L.clear[3]);
    if (renderer.compileAsync && renderer.extensions?.has?.('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera).catch(() => {});
    renderer.setRenderTarget(T.scene); renderer.clear(); renderer.render(scene, camera);
    const qx = new THREE.Vector2(1 / T.q1.width, 1 / T.q1.height);
    pass(renderer, P, 'bright', { tSrc: T.scene.texture, texel: tx, threshold: L.threshold }, T.q1);
    pass(renderer, P, 'blur', { tSrc: T.q1.texture, dir: new THREE.Vector2(qx.x * 1.5, 0), sigma: 4 }, T.q2);
    pass(renderer, P, 'blur', { tSrc: T.q2.texture, dir: new THREE.Vector2(0, qx.y * 1.5), sigma: 4 }, T.q1);
    pass(renderer, P, 'grade', {
      tSrc: T.scene.texture, tBloom: T.q1.texture, exposure: L.exposure, bloom: L.bloom, contrast: L.contrast, saturation: L.saturation, warm: L.warm,
      lift: new THREE.Vector3(...L.lift), gamma: new THREE.Vector3(...L.gamma), gain: new THREE.Vector3(...L.gain),
      shadowTint: new THREE.Vector3(...L.shadowTint), highTint: new THREE.Vector3(...L.highTint),
    }, T.base);
    pass(renderer, P, 'sst', { tSrc: T.base.texture, texel: tx }, T.a);
    pass(renderer, P, 'blur', { tSrc: T.a.texture, dir: new THREE.Vector2(tx.x, 0), sigma: 2.0 }, T.b);
    pass(renderer, P, 'blur', { tSrc: T.b.texture, dir: new THREE.Vector2(0, tx.y), sigma: 2.0 }, T.a);   // a = smoothed tensor
    // Kuwahara radius scales with the image height, so 1920- and 844-wide paintings look alike
    const r = Math.max(1.5, L.radius * h / 720);
    const akf = { tTfm: T.a.texture, texel: tx, alpha: L.alpha, hardness: L.hardness, sharpness: L.sharpness, zeta: L.zeta, zeroCross: L.zeroCross };
    let src = T.base;
    if (L.paint !== false) { pass(renderer, P, 'akf', { ...akf, tSrc: T.base.texture, radius: r }, T.paint); src = T.paint; }
    if (L.paint !== false && L.passes > 1) { pass(renderer, P, 'akf', { ...akf, tSrc: T.paint.texture, radius: r * 0.6 }, T.b); src = T.b; }
    pass(renderer, P, 'finish', {
      tSrc: src.texture, tTfm: T.a.texture, tDetail: T.base.texture, texel: tx, res: new THREE.Vector2(w, h), edge: L.paint === false ? 0 : L.edge, stroke: L.paint === false ? 0 : L.stroke,
      grain: L.paint === false ? 0 : L.grain, tone: L.paint === false ? 0 : L.tone, vignette: transparent ? 0 : L.vignette, seed: (L.seed ?? 0) % 97, detail: L.detail, vigColor: new THREE.Vector3(...L.vigColor),
    }, T.out);
    const px = new Uint8Array(w * h * 4);
    if (renderer.readRenderTargetPixelsAsync) await renderer.readRenderTargetPixelsAsync(T.out, 0, 0, w, h, px);
    else renderer.readRenderTargetPixels(T.out, 0, 0, w, h, px);
    return pixelsToCanvas(px, w, h);
  } finally {
    renderer.setRenderTarget(prev.target); renderer.autoClear = prev.autoClear; renderer.setClearColor(prev.clearColor, prev.clearAlpha);
    renderer.shadowMap.enabled = prev.shadow;
  }
}
function pixelsToCanvas(px, w, h) {
  const c = makeCanvas(w, h), ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), row = w * 4;
  for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);   // GL rows are bottom-up
  ctx.putImageData(img, 0, 0);
  return c;
}
/** canvas -> object URL (JPEG for rooms, PNG/WebP for cut-outs); falls back to a data URL. */
export function canvasUrl(canvas, type = 'image/jpeg', quality = 0.9) {
  return new Promise(res => canvas.toBlob(b => res(b ? URL.createObjectURL(b) : canvas.toDataURL(type, quality)), type, quality));
}

// ---------------------------------------------------------------- rooms
// Recipe: name, wallZ (back wall), ceilH, fog [colour, density], hemi [sky, ground, intensity], look (LOOK overrides),
// build(k) (async, dresses the RoomKit k). Props stand behind z = -2.3 or outside x = -5..5.6 so the stage stays clear.
export const ROOMS = {
  er_lobby: {
    name: 'ER lobby', wallZ: -6.2, ceilH: 3.1, fog: [0x0c1517, 0.03], hemi: [0x8fb0b8, 0x2a2018, 0.1],
    look: { exposure: 1.1, lift: [0.01, 0.03, 0.04], highTint: [0.04, 0.02, -0.01] },
    async build(k) {
      await k.floor({ tex: 'floor_clinical.webp', tile: 2.4, color: 0xb9bdb8, rough: 0.42 });
      await k.wall({ tex: 'wall_clinical.webp', texH: 2.3, color: 0xa9aea8 });
      k.ceiling({ missing: 0.07 });
      // most of the ceiling is dead: a few panels on, one flickering, one hanging
      for (const [x, z, st, extra] of [[-5.4, -4.4, 0.8], [-1.8, -4.4, 0], [1.8, -4.4, 0.7], [5.4, -4.4, 0.3], [-3.6, -1.8, 0], [0.6, -1.8, 0.9], [4.2, -1.8, 0, { hang: 24 }], [-3.6, 1.2, 0], [2.4, 1.2, 0.5]])
        k.panel(x, z, { state: st, power: 0.6, ...extra });
      k.wash(-4.8, { power: 1.1, shadow: true });
      k.wash(5.0, { power: 0.5, color: 0xbfe0ff });
      k.wash(1.2, { power: 0.7, color: 0xff8a70, angle: 30 });
      k.pool(0.6, -0.6, { power: 0.9, angle: 50, shadow: true });
      k.battlePools();
      await k.prop('Hospital_Braced_DoubleDoor', 1.2, 0, { wall: true });
      k.sign('EMERGENCY', 1.2, 2.86, 0, { w: 2.2, h: 0.4, bg: '#6a120e', fg: '#ffe8e0', glow: 0.55, light: 0xff4a3a });
      k.glow(1.2, 2.86, k.wallZ + 0.2, { color: 0xff4030, s: 3.2, opacity: 0.35 });
      await k.prop('reception_desk', -4.6, -4.6, { ry: 8 });
      await k.prop('desktop_computer', -4.9, -4.7, { y: 1.12, ry: 20 });
      k.point(-4.85, 1.45, -4.3, 0x8fd8ff, 1.2, 2.5);   // the monitor's glow
      await k.prop('check_in_kiosk', -2.6, -5.5, { ry: -6 });
      await k.prop('lobby_t2_wayfinding', -4.6, 0, { wall: true, y: 2.35 });
      await k.prop('reception_poster_heart', -2.0, 0, { wall: true, y: 1.25 });
      await k.prop('wall_clock', -0.9, 0, { wall: true, y: 2.45 });
      await k.prop('waiting_chair_section', 5.0, -4.9, { ry: -4 });
      await k.prop('waiting_chair_section', 5.6, -3.3, { ry: 172 });
      await k.prop('visitor_chair', 3.5, -3.0, { rz: 90, ry: 30 });
      await k.prop('wheelchair', -6.3, -2.6, { ry: 40 });
      await k.prop('floor_planter', 7.6, -5.6);
      await k.prop('water_cooler', -7.4, 0, { wall: true });
      await k.prop('magazine_rack', 3.4, 0, { wall: true });
      await k.prop('medical_poster_family', 4.4, 0, { wall: true, y: 1.35 });
      await k.prop('fire_extinguisher', -1.6, 0, { wall: true, y: 0.55 });
      await k.decal('blood_drag.webp', 2.2, -3.6, { s: 2.6, ry: 64 });
      await k.decal('blood_drag.webp', 3.4, -2.0, { s: 2.2, ry: 50, opacity: 0.7 });
      await k.decal('blood_splatter.webp', -3.2, -3.2, { s: 1.8, ry: 30 });
      await k.decal('blood_handprint.webp', 2.75, 0, { wall: true, y: 1.25, s: 0.6, ry: -12 });
      await k.decal('blood_splatter.webp', -5.8, 0, { wall: true, y: 0.9, s: 1.4 });
      await k.decal('blood_splatter.webp', 4.8, 2.4, { s: 1.6, ry: 200, opacity: 0.75 });
      k.papers(14, [-6, -2.5], [-4, -2.4]); k.papers(6, [5.2, 7.5], [-2, 1.5]); k.papers(4, [-4.5, -3], [1.2, 2.6]);
      k.haze(-4.0, { color: 0x86a6a8, opacity: 0.07 });
    },
  },
  ward: {
    name: 'Ward', wallZ: -5.6, ceilH: 3.0, fog: [0x0b1615, 0.035], hemi: [0x86aab0, 0x221c16, 0.1],
    look: { exposure: 1.12, lift: [0.0, 0.035, 0.035], saturation: 0.84, shadowTint: [-0.015, 0.015, 0.02] },
    async build(k) {
      await k.floor({ tex: 'floor_clinical.webp', tile: 2.0, color: 0xaab5ae, rough: 0.42 });
      await k.wall({ tex: 'wall_clinical.webp', texH: 2.2, color: 0xa3b3ab });
      k.ceiling({ missing: 0.05, color: 0xaeb3aa });
      for (const [x, z, st] of [[-4.5, -3.9, 0.7], [-0.8, -3.9, 0], [2.9, -3.9, 0.8], [6.4, -3.9, 0.3], [-2.6, -1.0, 0], [1.6, -1.0, 0.6]])
        k.panel(x, z, { state: st, color: 0xd6f5ee, power: 0.5 });
      // moonlight through the blinds, a lamp over two beds, the rest dark
      k.wash(-5.6, { power: 0.8, color: 0xd6f5ee, shadow: true });
      k.wash(2.6, { power: 1.0, color: 0xd6f5ee, shadow: true });
      k.pool(0.6, -0.5, { power: 0.8, angle: 50, color: 0xd6f5ee, shadow: true });
      k.battlePools();
      for (const [x, ry] of [[-5.6, 0], [-1.6, 0], [2.6, 14], [6.6, 0]]) await k.prop('recovery_bed', x, -4.45, { ry });
      await k.prop('curtain_panel', -3.55, -4.4, { ry: 90, s: 0.85 });
      await k.prop('privacy_screen', 0.6, -4.4, { ry: 90, s: 0.9 });
      await k.prop('curtain_panel', 4.65, -4.4, { ry: 90, s: 0.85 });
      await k.prop('patient_monitor', -4.4, -5.2, { ry: -10 });
      k.point(-4.4, 1.35, -4.9, 0x7dffb0, 1.4, 2.5);   // a monitor still on
      await k.prop('patient_monitor', 3.8, -5.25, { ry: 10 });
      await k.prop('iv_stand', -0.4, -4.9, { ry: 20 });
      await k.prop('iv_stand', 5.6, -3.0, { rz: 80, ry: 70 });
      await k.prop('bedside_cabinet', -7.0, -5.2);
      await k.prop('over_bed_table', 1.6, -3.0, { rz: 90, ry: -20 });
      await k.prop('medical_gas_cylinder', -2.8, -5.3);
      await k.prop('sharps_container', -0.1, 0, { wall: true, y: 1.2 });
      for (const x of [-5.6, -1.6, 2.6, 6.6]) k.window(x, 2.0, { w: 1.6, h: 0.85, blinds: 0.55 + k.r() * 0.3, shaft: true, power: 1.3 });
      k.sign('WARD 3', -7.6, 2.45, 0, { w: 1.3, h: 0.4, bg: '#1d4a48' });
      await k.decal('blood_splatter.webp', 2.6, -4.4, { s: 1.6, ry: 10 });
      await k.decal('blood_drag.webp', 4.6, -2.6, { s: 2.4, ry: -30 });
      await k.decal('blood_drag.webp', -4.6, 1.8, { s: 2.0, ry: 160, opacity: 0.7 });
      await k.decal('blood_handprint.webp', -3.0, 0, { wall: true, y: 1.1, s: 0.55, ry: 10 });
      await k.decal('blood_splatter.webp', 6.0, 0, { wall: true, y: 1.5, s: 1.2 });
      k.papers(8, [-6.5, -3], [-3.2, -2.4]);
      k.haze(-3.5, { color: 0x7fa29c, opacity: 0.06 });
    },
  },
  corridor: {
    name: 'Corridor', wallZ: -34, ceilH: 2.9, floorEnd: -35, fog: [0x0c1517, 0.032], hemi: [0x86a4ac, 0x201a14, 0.14],
    look: { exposure: 1.1, lift: [0.01, 0.03, 0.045], saturation: 0.8, highTint: [0.03, 0.025, 0.0] },
    async build(k) {
      const L = -4.9, R = 5.7;   // side walls: just outside the stage, running away from the camera
      await k.floor({ tex: 'floor_corridor.webp', tile: 2.2, color: 0xc8ccc4, rough: 0.42 });
      await k.wall({ tex: 'wall_clinical.webp', texH: 2.2, color: 0xd6dbd2, side: 'left', z: L, x0: -35, x1: 10 });
      await k.wall({ tex: 'wall_clinical.webp', texH: 2.2, color: 0xd6dbd2, side: 'right', z: R, x0: -10, x1: 35 });
      await k.wall({ tex: 'wall_clinical.webp', texH: 2.2, color: 0xcfd3cb, x0: -8, x1: 9 });
      k.ceiling({ missing: 0.08 });
      const states = [1, 0.9, 0, 1, 0.8, 0.25, 1, 0, 0.9, 1];
      for (let i = 0; i < states.length; i++) k.panel(0.4, 1.5 - i * 3.3, { state: states[i], w: 1.2, d: 0.5, light: i < 7 ? 'area' : 'spot', power: 1.3 });
      k.spot([0.4, 2.8, -4.6], [0.4, 0, -6.4], 0xdff3ff, 46, { angle: 70, shadow: true });
      k.spot([0.4, 2.8, -15.6], [0.4, 0, -17], 0xdff3ff, 40, { angle: 70 });
      k.battlePools();
      // the far doors, lit from behind
      await k.prop('Hospital_Braced_DoubleDoor', 0.4, 0, { wall: true });
      k.mesh(new THREE.PlaneGeometry(2.6, 2.4), k.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.6, 2.8) })), [0.4, 1.2, k.wallZ - 0.05]).castShadow = false;
      k.point(0.4, 1.4, k.wallZ + 1.2, 0xbfe8ff, 8, 10);
      k.sign('EXIT', 0.4, 2.75, 0, { w: 0.9, h: 0.32, bg: '#0f4a24', fg: '#e0ffe0', glow: 0.8, light: 0x46ff7a });
      k.glow(0.4, 2.75, k.wallZ + 0.2, { color: 0x40ff70, s: 1.6, opacity: 0.4 });
      await k.prop('procedure_stretcher', L + 0.7, -6.5, { ry: 4 });
      await k.prop('procedure_stretcher', R - 0.7, -12.5, { ry: 8 });
      await k.prop('wheelchair', L + 0.7, -13, { ry: 70 });
      await k.prop('wet_floor_sign', 2.6, -9.5, { ry: -30 });
      await k.prop('janitor_cart', R - 0.6, -4.2, { ry: -90 });
      await k.prop('mop_bucket', R - 1.4, -5.8, { ry: -40 });
      await k.prop('sawhorse_barrier', -1.2, -19, { ry: 12 });
      await k.prop('fire_extinguisher', L + 0.15, -10, { y: 0.4, ry: 90 });
      await k.prop('linen_cabinet', L + 0.4, -17, { ry: 90 });
      await k.prop('biohazard_bin', R - 0.3, -16, { ry: -90 });
      await k.prop('visitor_chair', R - 0.5, -8.0, { ry: -90 });
      await k.prop('visitor_chair', R - 0.5, -8.6, { ry: -90 });
      const doorM = k.mat({ color: 0x24363a, roughness: 0.7 }), frameM = k.mat({ color: 0xbfbab0, roughness: 0.6 });
      for (const z of [-4.2, -11, -18, -25]) {
        k.box(0.06, 2.2, 1.1, doorM, [L + 0.03, 1.1, z]); k.box(0.08, 2.32, 1.26, frameM, [L + 0.01, 1.16, z]).position.x = L + 0.005;
        k.box(0.06, 2.2, 1.1, doorM, [R - 0.03, 1.1, z - 3.5]); k.box(0.08, 2.32, 1.26, frameM, [R - 0.005, 1.16, z - 3.5]);
      }
      k.sign('RADIOLOGY', L + 0.04, 2.45, -8, { w: 1.4, h: 0.32, bg: '#1d3f4a', wallMount: false, arrow: 'right' }).rotation.y = Math.PI / 2;
      k.sign('WARD 2', R - 0.04, 2.45, -14.5, { w: 1.1, h: 0.32, bg: '#1d3f4a', wallMount: false }).rotation.y = -Math.PI / 2;
      await k.decal('blood_drag.webp', 0.8, -9, { s: 3.2, ry: 92 });
      await k.decal('blood_drag.webp', 0.2, -14, { s: 3.0, ry: 88, opacity: 0.6 });
      await k.decal('blood_splatter.webp', L + 1.2, -5.5, { s: 1.6 });
      await k.decal('blood_splatter.webp', 4.4, 2.0, { s: 1.5, ry: 140, opacity: 0.8 });
      await k.decal('blood_handprint.webp', 0, -9.5, { wallX: R, y: 1.3, s: 0.6 });
      await k.decal('blood_splatter.webp', 0, -15, { wallX: L, y: 1.0, s: 1.4 });
      k.papers(10, [-3.5, 4.5], [-14, -3.5]);
      k.haze(-10, { opacity: 0.08 }); k.haze(-20, { opacity: 0.1, color: 0x9ab6b8 });
    },
  },
  supply_closet: {
    name: 'Supply closet (rest)', wallZ: -4.6, ceilH: 2.9, fog: [0x140f0b, 0.03], hemi: [0xb0a080, 0x241a10, 0.12],
    look: { exposure: 1.12, lift: [0.035, 0.025, 0.01], gain: [1.05, 1.0, 0.93], saturation: 0.98, warm: 1, shadowTint: [0.01, 0.0, -0.01], highTint: [0.05, 0.025, -0.02], vigColor: [0.16, 0.12, 0.09] },
    async build(k) {
      await k.floor({ tex: 'floor_maintenance.webp', tile: 3, color: 0xa89a88, rough: 0.5 });
      await k.wall({ tex: 'wall_maintenance.webp', texH: 2.3, color: 0xc4b6a2 });
      k.ceiling({ missing: 0.03, color: 0xa79c88 });
      k.panel(-3.6, -2.0, { state: 0 }); k.panel(3.4, -2.0, { state: 0.2, color: 0xcfe6ff, power: 0.5 });
      // one warm bulb over a cot: the safe corner
      k.bulb(-0.6, -3.1, { y: 2.15, power: 1.6 });
      k.cone(-0.6, 2.15, -3.1, { r: 1.5, color: 0xffc070, opacity: 0.05 });
      k.glow(-0.6, 2.12, -3.1, { color: 0xffb060, s: 1.2, opacity: 0.5 });
      k.spot([-2.5, 2.8, 2.4], [-2.2, 0, -0.4], 0xffbf80, 26, { angle: 50, penumbra: 1 });
      k.spot([2.9, 2.8, 1.6], [2.8, 0, -0.4], 0xd8c8a8, 12, { angle: 50, penumbra: 1 });
      k.wash(4.0, { power: 0.35, color: 0x9fc0e0 });
      await k.prop('supply_shelf', -5.0, 0, { wall: true });
      await k.prop('supply_shelf', -3.5, 0, { wall: true });
      await k.prop('linen_cabinet', 2.4, 0, { wall: true });
      await k.prop('supply_shelf', 4.0, 0, { wall: true });
      await k.prop('recovery_bed_open_nx', -0.7, -3.4, { ry: 90 });
      await k.prop('storage_bins', 5.6, -3.8, { ry: -10 });
      await k.prop('courier_coolers', 6.0, -2.8, { ry: -20 });
      await k.prop('first_aid_case_closed', 1.0, -3.9, { ry: 20 });
      await k.prop('visitor_chair', 1.4, -3.0, { ry: -30 });
      await k.prop('laundry_hamper', -6.6, -2.8, { ry: 20 });
      await k.prop('items/water-bottle', 1.25, -3.75, { ry: 10 });
      await k.prop('items/lantern', 0.3, -3.6, { ry: 30 });
      k.crate(5.4, -2.5, { w: 0.7, h: 0.5, d: 0.5, ry: 10, label: 'GAUZE' });
      k.crate(5.5, -2.5, { w: 0.6, h: 0.4, d: 0.45, y: 0.5, ry: -6 });
      k.crate(-6.2, -4.0, { w: 0.8, h: 0.6, d: 0.6, ry: 4, label: 'IV SETS' });
      k.box(0.9, 0.08, 0.7, k.mat({ color: 0x5d6f7a, roughness: 0.95 }), [-0.7, 0.62, -3.25], [0, 8, 0]);   // a folded blanket
      k.sign('STAFF ONLY', 4.0, 2.45, 0, { w: 1.3, h: 0.34, bg: '#3a2f22', fg: '#f0e2c8' });
      k.haze(-2.8, { color: 0xb08a5a, opacity: 0.06 });
    },
  },
  pharmacy: {
    name: 'Pharmacy (shop)', wallZ: -5.4, ceilH: 3.0, fog: [0x0a150f, 0.032], hemi: [0x96c0a0, 0x1c2016, 0.1],
    look: { exposure: 1.12, lift: [0.0, 0.04, 0.02], gain: [0.96, 1.04, 0.98], saturation: 0.92, shadowTint: [-0.015, 0.02, 0.0], highTint: [0.01, 0.035, 0.0], vigColor: [0.1, 0.16, 0.12] },
    async build(k) {
      await k.floor({ tex: 'floor_clinical.webp', tile: 2.0, color: 0xa9b8a8, rough: 0.42 });
      await k.wall({ tex: 'wall_clinical.webp', texH: 2.25, color: 0xa7bca9 });
      k.ceiling({ missing: 0.04, color: 0xa9b2a2 });
      for (const [x, z, st] of [[-4.2, -3.6, 0.8], [-0.6, -3.6, 0.9], [3.0, -3.6, 0.4], [6.6, -3.6, 0], [-2.4, -1.0, 0], [1.2, -1.0, 0.6]])
        k.panel(x, z, { state: st, color: 0xd2ffe0, power: 0.55 });
      k.wash(-4.2, { power: 1.0, color: 0xd2ffe0, shadow: true });
      k.wash(1.0, { power: 1.1, color: 0xd2ffe0, shadow: true });
      k.wash(5.2, { power: 0.45, color: 0xd2ffe0 });
      k.pool(0.6, -0.5, { power: 0.8, angle: 50, color: 0xe2fff0, shadow: true });
      k.battlePools({ cool: 0xb8f0c8 });
      for (const x of [-5.0, -3.4, 0.2, 1.8, 5.2]) await k.prop('pharmacy_medicine_shelf', x, 0, { wall: true });
      await k.prop('reception_desk', -4.2, -3.8);
      await k.prop('reception_desk', 1.0, -3.8);
      await k.prop('pharmacy_locked_cupboard', -1.6, 0, { wall: true, y: 1.45 });
      await k.prop('pharmacy_locked_cupboard', 3.6, 0, { wall: true, y: 1.4 });
      await k.prop('first_aid_case_closed', -4.4, -3.75, { y: 1.3, ry: -15 });
      await k.prop('sharps_container', 1.4, -3.7, { y: 1.3, ry: 10 });
      await k.prop('lab_sample_rack', 0.5, -3.75, { y: 1.3 });
      await k.prop('items/medkit', -3.6, -3.7, { y: 1.3, ry: 20 });
      await k.prop('specimen_fridge', 7.0, 0, { wall: true });
      k.point(7.0, 1.2, k.wallZ + 1.1, 0xd8f0ff, 2.5, 4);
      await k.prop('check_in_kiosk', -7.0, -4.4, { ry: 10 });
      const cross = k.own(canvasTex(256, 256, (ctx, W) => { ctx.fillStyle = '#062012'; ctx.fillRect(0, 0, W, W); ctx.fillStyle = '#5dff92'; ctx.fillRect(W * 0.36, W * 0.12, W * 0.28, W * 0.76); ctx.fillRect(W * 0.12, W * 0.36, W * 0.76, W * 0.28); }));
      k.mesh(new THREE.PlaneGeometry(0.62, 0.62), k.own(new THREE.MeshBasicMaterial({ map: cross, color: new THREE.Color(1.6, 1.9, 1.6) })), [-1.6, 2.6, k.wallZ + 0.05]).castShadow = false;
      k.glow(-1.6, 2.6, k.wallZ + 0.15, { color: 0x40ff80, s: 1.8, opacity: 0.4 });
      k.point(-1.6, 2.5, k.wallZ + 0.6, 0x46ff7a, 3.5, 5);
      k.sign('PHARMACY', 1.8, 2.62, 0, { w: 2.0, h: 0.4, bg: '#0f2d1e', fg: '#c8f5d6' });
      const pillM = [0xe8ecef, 0xc8daf0, 0xf0d8c8].map(c => k.mat({ color: c, roughness: 0.6 }));
      for (let i = 0; i < 12; i++) k.box(0.14, 0.07, 0.1, k.r.pick(pillM), [k.r.range(-6, 6.5), 0.035, k.r.range(-3.3, -2.4)], [0, k.r() * 180, 0]);   // spilled pill boxes
      await k.decal('blood_splatter.webp', -2.2, -3.0, { s: 1.4, ry: 40 });
      await k.decal('blood_drag.webp', 4.6, -2.6, { s: 2.0, ry: -20, opacity: 0.7 });
      await k.decal('blood_handprint.webp', 3.0, 0, { wall: true, y: 0.9, s: 0.5, ry: 8 });
      k.haze(-3.2, { color: 0x86b896, opacity: 0.06 });
    },
  },
  security_gate: {
    name: 'Security gate (boss)', wallZ: -6.0, ceilH: 3.3, fog: [0x120606, 0.04], hemi: [0x7a5a5a, 0x1a0e0c, 0.1],
    look: { exposure: 1.1, contrast: 1.14, saturation: 0.9, lift: [0.03, 0.01, 0.015], gain: [1.04, 0.97, 0.96], shadowTint: [0.015, -0.01, 0.0], highTint: [0.04, 0.0, -0.02], vigColor: [0.16, 0.06, 0.06], bloom: 0.8 },
    async build(k) {
      await k.floor({ tex: 'floor_maintenance.webp', tile: 3, color: 0x9a9690, rough: 0.42 });
      await k.wall({ tex: 'wall_maintenance.webp', texH: 2.3, color: 0xa8a298 });
      k.ceiling({ missing: 0.12, color: 0x8f8a80 });
      k.panel(-4.0, -4.0, { state: 0 }); k.panel(4.6, -4.0, { state: 0.35, color: 0xdfe8ff, power: 0.6 }); k.panel(-1.0, -1.6, { state: 0, hang: 30 }); k.panel(3.0, -1.6, { state: 0 });
      // harsh red beacons either side of the lift, one cold work light on it
      for (const x of [-2.6, 3.8]) {
        const bm = new THREE.Mesh(k.own(new THREE.SphereGeometry(0.12, 16, 10)), k.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 0.6, 0.4) })));
        bm.position.set(x, 2.95, k.wallZ + 0.15); k.add(bm);
        k.glow(x, 2.95, k.wallZ + 0.2, { color: 0xff3020, s: 1.6, opacity: 0.55 });
        k.spot([x, 2.85, k.wallZ + 0.4], [x * 0.6, 0, -1.6], 0xff2a1a, 34, { angle: 52, penumbra: 0.6, shadow: x < 0 });
      }
      k.spot([0.6, 3.1, -2.2], [0.6, 0.8, k.wallZ], 0xd8e4ff, 22, { angle: 32, penumbra: 0.6, shadow: true });
      k.pool(0.6, -0.4, { power: 0.6, angle: 50, color: 0xc8d4ff });
      k.spot([-3, 3.2, 3], [-2.2, 0, -0.2], 0xff7050, 22, { angle: 50, penumbra: 1 });
      k.spot([3, 3.2, 2], [2.8, 0, -0.4], 0xc0d0ff, 14, { angle: 50, penumbra: 1 });
      await k.prop('Hospital_Elevator_Outbreak', 0.6, k.wallZ - 1.2, { s: 0.85, color: 0x6c6a64 });
      k.sign('SECURITY', 0.6, 3.05, 0, { w: 1.8, h: 0.34, bg: '#1c2024', fg: '#e8d8c8' });
      // a walk-through metal detector and the guard's desk: the checkpoint
      const detM = k.mat({ color: 0x8a8e90, roughness: 0.5, metalness: 0.4 }), detD = k.mat({ color: 0x2a2e30, roughness: 0.6 });
      for (const x of [-4.55, -3.45]) k.box(0.16, 2.1, 0.5, detM, [x, 1.05, -3.9]);
      k.box(1.26, 0.22, 0.52, detM, [-4.0, 2.2, -3.9]); k.box(0.9, 0.08, 0.06, detD, [-4.0, 2.2, -3.63]);
      const led = new THREE.Mesh(k.own(new THREE.PlaneGeometry(0.16, 0.05)), k.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.3) }))); led.position.set(-4.0, 2.2, -3.635); k.add(led);
      await k.prop('team_desk', -6.4, -3.6, { ry: 30 });
      await k.prop('desktop_computer', -6.5, -3.7, { y: 1.12, ry: 40 });
      k.point(-6.3, 1.5, -3.3, 0x9fd8ff, 1.5, 3);
      await k.prop('wheelchair', 5.6, -3.6, { rz: 85, ry: -40 });
      await k.prop('procedure_stretcher', -2.0, -4.6, { ry: 70, rz: 0 });
      k.wash(-6.2, { power: 0.5, color: 0xbfd0ff });
      await k.prop('sign_elevator', -3.6, 0, { wall: true, y: 2.4 });
      await k.prop('sawhorse_barrier', -2.6, -3.3, { ry: 12 });
      await k.prop('sawhorse_barrier', 3.8, -3.2, { ry: -16 });
      await k.prop('sawhorse_barrier', 6.4, -2.6, { ry: 50, rz: 88 });
      await k.prop('ceiling_collapse', -6.2, -4.2, { s: 0.9 });
      await k.prop('guard_duffel_open', 5.4, -4.2, { ry: -30 });
      await k.prop('status_amber_fault', 4.6, 0, { wall: true, y: 1.5 });
      await k.prop('fire_extinguisher', 6.8, -3.0, { rz: 90, ry: 20 });
      await k.prop('filing_cabinet', 7.6, 0, { wall: true });
      k.tape([-3.7, 1.0, -3.4], [-1.5, 0.95, -3.2]); k.tape([2.7, 1.0, -3.3], [5.0, 0.95, -3.1]);
      const st = k.own(canvasTex(512, 64, (ctx, W, H) => { ctx.fillStyle = '#d9b11f'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#151515'; for (let x = -H; x < W; x += H) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H / 2, 0); ctx.lineTo(x + H, 0); ctx.lineTo(x + H / 2, H); ctx.fill(); } }));
      k.mesh(new THREE.PlaneGeometry(5.6, 0.35), k.mat({ map: st, roughness: 0.6, transparent: true, opacity: 0.85 }), [0.6, 0.004, k.wallZ + 1.2], [-90, 0, 0]);
      for (const [x, z, s, r] of [[-1.0, -4.4, 2.4, 20], [2.4, -3.9, 2.0, -40], [-4.8, -2.8, 1.8, 80], [5.4, -2.0, 1.6, 0], [-4.4, 2.2, 1.8, 0]]) await k.decal(r === 0 ? 'blood_splatter.webp' : 'blood_drag.webp', x, z, { s, ry: r });
      await k.decal('blood_splatter.webp', -1.9, 0, { wall: true, y: 1.6, s: 1.6 });
      await k.decal('blood_drag.webp', 0.6, -4.7, { s: 2.6, ry: 92 });
      await k.decal('blood_splatter.webp', 0.2, -4.2, { s: 2.2, ry: 140 });
      await k.decal('blood_handprint.webp', 3.4, 0, { wall: true, y: 1.2, s: 0.6, ry: 20 });
      await k.decal('blood_handprint.webp', 4.1, 0, { wall: true, y: 1.0, s: 0.55, ry: -10 });
      k.papers(10, [-6, 6], [-4.5, -2.4], { color: 0xd8d0c0 });
      k.haze(-4.0, { color: 0xb04a3a, opacity: 0.08 });
    },
  },
  break_room: {
    name: 'Break room', wallZ: -5.0, ceilH: 2.9, fog: [0x11120d, 0.032], hemi: [0xa8a890, 0x221c14, 0.1],
    look: { exposure: 1.12, lift: [0.025, 0.025, 0.015], saturation: 0.95, highTint: [0.04, 0.025, -0.01], vigColor: [0.15, 0.13, 0.1] },
    async build(k) {
      await k.floor({ tex: 'floor_clinical.webp', tile: 1.6, color: 0xbdb6a6, rough: 0.42 });
      await k.wall({ tex: 'wall_clinical.webp', texH: 2.2, color: 0xc4b8a2 });
      k.ceiling({ missing: 0.05, color: 0xb4ab98 });
      for (const [x, z, st] of [[-3.8, -3.4, 0.8], [0.2, -3.4, 0.4], [4.2, -3.4, 0], [-1.8, -0.8, 0], [2.2, -0.8, 0]]) k.panel(x, z, { state: st, color: 0xfff1d8, power: 0.55 });
      k.wash(-4.4, { power: 1.0, color: 0xfff1d8, shadow: true });
      k.pool(-1.9, -3.2, { power: 0.9, color: 0xfff1d8, angle: 36, shadow: true });
      k.pool(0.6, -0.3, { power: 0.7, angle: 50, color: 0xfff1d8 });
      k.battlePools();
      await k.prop('cafeteria_vending_machine', 5.6, 0, { wall: true });
      k.point(5.6, 1.6, k.wallZ + 0.7, 0xcfe8ff, 2.5, 4);
      k.glow(5.6, 1.3, k.wallZ + 0.9, { color: 0xbfe0ff, s: 2.4, opacity: 0.25 });
      await k.prop('cafeteria_vending_machine', 6.9, -3.4, { ry: -60 });
      await k.prop('coffee_counter', -4.6, 0, { wall: true });
      await k.prop('coffee_machine', -4.9, -4.55, { y: 1.0 });
      await k.prop('mug', -4.2, -4.5, { y: 1.0, ry: 30 }); await k.prop('mug', -3.95, -4.6, { y: 1.0, rz: 90 });
      await k.prop('wall_cupboard', -4.6, 0, { wall: true, y: 1.75 });
      await k.prop('sofa', 1.4, 0, { wall: true });
      await k.prop('water_cooler', -6.6, 0, { wall: true });
      await k.prop('wall_clock', 1.4, 0, { wall: true, y: 2.2 });
      const tm = k.mat({ color: 0xd8d2c4, roughness: 0.5 });
      k.mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 32), tm, [-1.9, 0.74, -3.2]);
      k.mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.72, 12), k.mat({ color: 0x555a5c, metalness: 0.6, roughness: 0.4 }), [-1.9, 0.36, -3.2]);
      k.mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.03, 24), k.mat({ color: 0x3a3e40 }), [-1.9, 0.015, -3.2]);
      await k.prop('visitor_chair', -2.7, -3.4, { ry: 70 });
      await k.prop('visitor_chair', -1.2, -3.7, { ry: -110 });
      await k.prop('visitor_chair', -1.5, -2.6, { rz: 90, ry: 160 });
      await k.prop('mug', -1.8, -3.1, { y: 0.765 });
      await k.prop('items/food-can', -2.1, -3.3, { y: 0.765, ry: 40 });
      k.mesh(new THREE.PlaneGeometry(1.5, 0.95), k.mat({ map: k.own(corkTex(k.r)), roughness: 0.9 }), [3.4, 1.55, k.wallZ + 0.02]).castShadow = false;
      k.wash(3.4, { power: 0.6, color: 0xfff1d8 });
      await k.decal('blood_splatter.webp', 0.6, -3.0, { s: 1.6, ry: 120 });
      await k.decal('blood_drag.webp', 3.8, -2.4, { s: 2.2, ry: 20, opacity: 0.75 });
      await k.decal('blood_handprint.webp', 0.0, 0, { wall: true, y: 1.3, s: 0.5 });
      k.papers(6, [-4, 4], [-3, -2.4]);
      k.haze(-3.0, { color: 0xa09878, opacity: 0.05 });
    },
  },
  xray: {
    name: 'X-ray', wallZ: -5.4, ceilH: 3.0, fog: [0x09121a, 0.035], hemi: [0x7fa0b8, 0x161a1e, 0.1],
    look: { exposure: 1.12, lift: [0.0, 0.025, 0.05], gain: [0.96, 1.0, 1.05], saturation: 0.86, shadowTint: [-0.02, 0.0, 0.03], highTint: [0.0, 0.02, 0.04], vigColor: [0.09, 0.12, 0.17] },
    async build(k) {
      await k.floor({ tex: 'floor_clinical.webp', tile: 2.4, color: 0xa3aeb6, rough: 0.62 });
      await k.wall({ tex: 'wall_clinical.webp', texH: 2.3, color: 0xa4b0b8 });
      k.ceiling({ missing: 0.05, color: 0xa4abb0 });
      for (const [x, z, st] of [[-4.0, -3.5, 0], [0.0, -3.5, 0.5], [4.0, -3.5, 0], [-2.0, -1.0, 0], [2.0, -1.0, 0.35]]) k.panel(x, z, { state: st, color: 0xcfe6ff, power: 0.6 });
      k.battlePools({ cool: 0xa8d8ff });
      k.pool(0.6, -0.5, { power: 0.6, angle: 50, color: 0xcfe6ff });
      // the lightbox with films: the main light in the room
      k.mesh(new THREE.PlaneGeometry(2.6, 1.3), k.own(new THREE.MeshBasicMaterial({ map: k.own(xrayTex(k.r)), color: new THREE.Color(1.6, 1.85, 2.1) })), [-1.4, 1.75, k.wallZ + 0.04]).castShadow = false;
      k.box(2.75, 1.45, 0.06, k.mat({ color: 0x3a4248, metalness: 0.5, roughness: 0.4 }), [-1.4, 1.75, k.wallZ + 0.01]);
      k.spot([-1.4, 1.75, k.wallZ + 0.3], [-1.3, 0, k.wallZ + 2.2], 0xbfe6ff, 7, { angle: 60, penumbra: 1, shadow: true });
      k.glow(-1.4, 1.75, k.wallZ + 0.3, { color: 0x9fd8ff, s: 4.0, opacity: 0.18 });
      k.floorGlow(-1.4, k.wallZ + 1.6, { w: 3.4, d: 3.0, color: 0xbfe6ff, opacity: 0.16 });
      k.wash(3.0, { power: 0.8, color: 0xcfe6ff, shadow: true });
      await k.prop('mobile_xray', 3.0, -4.0, { ry: -30 });
      await k.prop('mobile_xray', -5.8, -3.6, { ry: 50 });
      await k.prop('operating_table', 1.2, -4.2, { ry: 90 });
      await k.prop('biohazard_bin', 5.0, 0, { wall: true });
      await k.prop('sharps_container', 4.2, 0, { wall: true, y: 1.2 });
      await k.prop('filing_cabinet', 6.2, 0, { wall: true });
      await k.prop('ppe_trolley', -7.0, -4.6, { ry: 20 });
      for (let i = 0; i < 4; i++) {   // lead aprons on hooks
        const x = 2.3 + i * 0.45;
        k.box(0.42, 0.95, 0.05, k.mat({ color: [0x2f4a6a, 0x3d3d44, 0x6a2f3a, 0x2f4a6a][i], roughness: 0.7 }), [x, 1.42, k.wallZ + 0.08], [0, 0, k.r.range(-4, 4)]);
        k.box(0.04, 0.04, 0.12, k.mat({ color: 0x999999, metalness: 0.8, roughness: 0.3 }), [x, 1.95, k.wallZ + 0.06]);
      }
      k.mesh(new THREE.PlaneGeometry(0.5, 0.5), k.mat({ map: k.own(trefoilTex()), roughness: 0.5 }), [0.6, 2.45, k.wallZ + 0.03]).castShadow = false;
      k.sign('RADIOLOGY', -5.0, 2.5, 0, { w: 1.6, h: 0.36, bg: '#1d3446' });
      k.sign('X-RAY IN USE', 3.0, 2.55, 0, { w: 1.4, h: 0.34, bg: '#521010', fg: '#ffd8d0', glow: 0.5, light: 0xff4030 });
      await k.decal('blood_splatter.webp', 2.2, -3.4, { s: 1.5, ry: 200 });
      await k.decal('blood_drag.webp', -3.6, -2.6, { s: 2.2, ry: -50, opacity: 0.7 });
      await k.decal('blood_handprint.webp', -3.0, 0, { wall: true, y: 1.2, s: 0.55, ry: -6 });
      k.papers(5, [-5, 5], [-3.4, -2.4], { color: 0xd8e4ea });
      k.haze(-3.4, { color: 0x7fa6c0, opacity: 0.06 });
    },
  },
  storage: {
    name: 'Storage (treasure)', wallZ: -5.0, ceilH: 3.1, fog: [0x110e0a, 0.035], hemi: [0x9a9080, 0x1e1810, 0.1],
    look: { exposure: 1.12, lift: [0.03, 0.024, 0.012], gain: [1.04, 1.0, 0.95], saturation: 0.92, warm: 0.6, highTint: [0.05, 0.03, -0.02], vigColor: [0.14, 0.11, 0.08] },
    async build(k) {
      await k.floor({ tex: 'floor_maintenance.webp', tile: 3, color: 0xa29a8c, rough: 0.45 });
      await k.wall({ tex: 'wall_maintenance.webp', texH: 2.3, color: 0xb0a898 });
      k.ceiling({ missing: 0.1, color: 0x8f877a });
      k.panel(-4.2, -3.2, { state: 0 }); k.panel(3.6, -3.2, { state: 0.3, color: 0xdfe8ff, power: 0.5 }); k.panel(0, -1.0, { state: 0 });
      k.bulb(0.4, -3.4, { y: 2.3, power: 1.6 });
      k.cone(0.4, 2.3, -3.4, { r: 1.8, color: 0xffc070, opacity: 0.045 });
      k.glow(0.4, 2.28, -3.4, { color: 0xffb060, s: 1.3, opacity: 0.5 });
      k.window(-3.2, 2.45, { w: 1.4, h: 0.55, blinds: 0, shaft: true, power: 1.4 });
      k.spot([-2.5, 2.8, 2.4], [-2.2, 0, -0.4], 0xffc890, 20, { angle: 50, penumbra: 1 });
      k.spot([2.9, 2.8, 1.6], [2.8, 0, -0.4], 0xc8d8f0, 14, { angle: 50, penumbra: 1 });
      for (const x of [-5.6, 4.6, 6.0]) await k.prop('supply_shelf', x, 0, { wall: true });
      await k.prop('filing_cabinet', -4.2, 0, { wall: true });
      await k.prop('courier_coolers', 2.8, -4.4, { ry: -12 });
      await k.prop('storage_bins', -1.6, -4.6, { ry: 4 });
      await k.prop('guard_duffel_open', -2.4, -3.4, { ry: 30 });
      await k.prop('items/backpack', 2.1, -3.3, { ry: -20 });
      await k.prop('laundry_hamper', 7.2, -3.0, { ry: -40 });
      await k.prop('medical_gas_cylinder', -6.8, -3.4, { rz: 90, ry: 10 });
      for (const [x, z, n, wood] of [[-0.6, -4.3, 3, true], [0.5, -4.5, 2, false], [1.6, -4.1, 2, true], [-6.6, -2.4, 2, false], [6.6, -1.4, 1, true]]) {
        let y = 0;
        for (let i = 0; i < n; i++) { const h = wood ? 0.55 : 0.42; k.crate(x + k.r.range(-0.05, 0.05), z, { w: wood ? 0.8 : 0.62, h, d: wood ? 0.6 : 0.5, y, ry: k.r.range(-8, 8), wood, label: !wood && i === 0 ? k.r.pick(['GLOVES', 'SALINE', 'MASKS']) : null }); y += h; }
      }
      await k.decal('blood_splatter.webp', 3.2, -3.0, { s: 1.2, ry: 60, opacity: 0.7 });
      k.papers(4, [-5, 3], [-3.2, -2.4], { color: 0xd8ccb0 });
      k.haze(-3.0, { color: 0xb09870, opacity: 0.06 });
    },
  },
  title: {
    name: 'Title (ER at night)', wallZ: -9.0, ceilH: 3.4, fog: [0x0a1214, 0.05], hemi: [0x7f9ea6, 0x1c1610, 0.08],
    look: { exposure: 1.15, contrast: 1.12, bloom: 0.9, lift: [0.0, 0.025, 0.04], highTint: [0.05, 0.02, -0.02], vignette: 1, vigColor: [0.08, 0.1, 0.12] },
    async build(k) {
      await k.floor({ tex: 'floor_clinical.webp', tile: 2.4, color: 0xaeb4ae, rough: 0.42 });
      await k.wall({ tex: 'wall_clinical.webp', texH: 2.3, color: 0x9ea49e });
      k.ceiling({ missing: 0.1 });
      for (const [x, z, st, extra] of [[-5.2, -6.5, 0], [-1.6, -6.5, 0.5], [2.0, -6.5, 0], [5.6, -6.5, 0.6], [-3.4, -3.5, 0, { hang: 28 }], [3.8, -3.5, 0.25], [0.2, -0.5, 0]])
        k.panel(x, z, { state: st, power: 0.5, ...extra });
      k.battlePools({ w: 0.8, c: 0.7 });
      // the doors to the ambulance bay, light pouring through them
      await k.prop('Hospital_Braced_DoubleDoor', 0.6, 0, { wall: true });
      k.mesh(new THREE.PlaneGeometry(2.6, 2.4), k.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.0, 2.6) })), [0.6, 1.2, k.wallZ - 0.05]).castShadow = false;
      k.spot([0.6, 2.7, k.wallZ + 0.5], [0.6, 0, k.wallZ + 2.6], 0xffe6c8, 26, { angle: 40, penumbra: 0.9, dist: 9 });
      k.floorGlow(0.6, k.wallZ + 2.2, { w: 3.2, d: 4.4, opacity: 0.22 });
      k.glow(0.6, 1.3, k.wallZ + 0.4, { color: 0xffe0c0, s: 5, opacity: 0.25 });
      k.sign('EMERGENCY', 0.6, 2.95, 0, { w: 2.6, h: 0.48, bg: '#6a120e', fg: '#ffe8e0', glow: 0.6, light: 0xff4a3a });
      k.glow(0.6, 2.95, k.wallZ + 0.2, { color: 0xff4030, s: 3.6, opacity: 0.35 });
      k.wash(-5.0, { power: 0.7, shadow: true }); k.wash(5.4, { power: 0.5, color: 0xbfe0ff });
      await k.prop('reception_desk', -5.0, -7.4, { ry: 10 });
      await k.prop('waiting_chair_section', 5.4, -7.6, { ry: -6 });
      await k.prop('procedure_stretcher', 3.4, -5.0, { ry: -24 });
      await k.prop('wheelchair', -3.0, -5.4, { ry: 140, rz: 86 });
      await k.prop('iv_stand', -1.8, -6.8, { ry: 20 });
      await k.prop('wet_floor_sign', 2.4, -7.6, { ry: -20 });
      await k.decal('blood_drag.webp', 0.6, -5.2, { s: 3.4, ry: 90 });
      await k.decal('blood_drag.webp', 0.9, -2.6, { s: 3.0, ry: 96, opacity: 0.6 });
      await k.decal('blood_handprint.webp', -0.9, 0, { wall: true, y: 1.3, s: 0.6, ry: 14 });
      k.papers(12, [-5, 5], [-7, -3]);
      k.haze(-6.5, { color: 0x9ab4b6, opacity: 0.1 }); k.haze(-3.0, { color: 0x6f8f92, opacity: 0.05 });
    },
  },
};

// ---------------------------------------------------------------- paintRoom
const cache = new Map();   // key|w x h|seed -> Promise<{ canvas, url, ms }>
const CACHE_MAX = 14;
let fontsReady = null;
function waitFonts() {
  if (!fontsReady) fontsReady = typeof document !== 'undefined' && document.fonts
    ? Promise.race([document.fonts.load('700 48px "Bebas Neue"').catch(() => null), new Promise(r => setTimeout(r, 1500))]) : Promise.resolve();
  return fontsReady;
}

/**
 * Paint a room. key: a ROOMS key ('er_lobby', 'ward', ...; an unknown key paints the ER lobby).
 * Returns { texture (a fresh CanvasTexture per call; the caller may dispose it), url (shared object URL, or the baked
 * file), canvas, width, height (the painted size), ms, timing, baked (true when it came from public/assets/baked) }.
 * A baked room comes back at the asked aspect, at most as sharp as the baked pixels it covers. opts.live skips it.
 * A live painting is capped at MAX_PIXELS (about 1600x900): a painted backdrop has no fine detail, so a 1920 screen just
 * stretches it. On a software GPU (SwiftShader: headless playtests) it paints at half size unless opts.full is set.
 */
export const MAX_PIXELS = 1600 * 900;
export async function paintRoom(renderer, key, { width = 1280, height = 720, seed = 1, look = null, full = false, live = false } = {}) {
  width = Math.max(64, Math.round(width)); height = Math.max(36, Math.round(height));
  if (!ROOMS[key]) { console.warn('[painter] unknown room', key, '- painting er_lobby'); key = 'er_lobby'; }
  // a baked picture cropped to this screen (no GPU work), when there is one for this room and look
  if (!live && String(seed) === '1') {
    const t0 = performance.now();
    const b = await bakedRoom(key, width, height, look).catch(e => { warnOnce('room ' + key, e); return null; });
    if (b) {
      const texture = new THREE.CanvasTexture(b.canvas);
      texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
      const ms = Math.round(performance.now() - t0);
      return { texture, url: b.url, canvas: b.canvas, width: b.canvas.width, height: b.canvas.height, ms, timing: { baked: ms }, key, baked: true };
    }
  }
  let k = Math.min(1, Math.sqrt(MAX_PIXELS / (width * height)));
  if (!full && isSoftwareGL(renderer)) k *= 0.5;
  if (k < 1) { width = Math.round(width * k); height = Math.round(height * k); }
  const ck = `${key}|${width}x${height}|${seed}${look ? '|' + JSON.stringify(look) : ''}`;
  if (!cache.has(ck)) {
    cache.set(ck, queue(() => paint(renderer, key, width, height, seed, look)).catch(e => { cache.delete(ck); throw e; }));
    while (cache.size > CACHE_MAX) { const [k0, p] = cache.entries().next().value; cache.delete(k0); p.then(r => URL.revokeObjectURL(r.url)).catch(() => {}); }
  }
  const res = await cache.get(ck);
  const texture = new THREE.CanvasTexture(res.canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
  return { texture, url: res.url, canvas: res.canvas, width, height, ms: res.ms, timing: res.timing, key };
}
let softGL = null;
/** True on a software rasteriser (SwiftShader / llvmpipe), where painting is slow. */
export function isSoftwareGL(renderer) {
  if (softGL !== null) return softGL;
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    softGL = /swiftshader|llvmpipe|software/i.test(name);
  } catch (e) { softGL = false; }
  return softGL;
}
// one painting at a time (rooms and studio renders share render targets and the GPU)
let chain = Promise.resolve();
export function runExclusive(fn) { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; }
const queue = runExclusive;

async function paint(renderer, key, w, h, seed, lookOverride) {
  const t0 = performance.now(), timing = {};
  await waitFonts();
  const recipe = ROOMS[key];
  const k = new RoomKit(key, recipe, seededRandom(`${key}:${seed}`));
  const scene = k.scene;
  scene.environment = roomEnvironment(renderer); scene.environmentIntensity = recipe.env ?? 0.1;
  scene.background = new THREE.Color(recipe.fog?.[0] ?? 0x0d1416);
  if (recipe.fog) scene.fog = new THREE.FogExp2(recipe.fog[0], recipe.fog[1]);
  const [sky, ground, hi] = recipe.hemi || [0x8fb0b8, 0x2a2018, 0.15];
  scene.add(new THREE.HemisphereLight(sky, ground, hi));
  try {
    await recipe.build(k);
    timing.build = Math.round(performance.now() - t0);
    const camera = applyBattleCamera(new THREE.PerspectiveCamera(), w / h);
    const t1 = performance.now();
    const canvas = await renderPainted(renderer, scene, camera, w, h, { ...recipe.look, ...(lookOverride || {}), seed: hashNum(seed) });
    timing.paint = Math.round(performance.now() - t1);
    const t2 = performance.now();
    const url = await canvasUrl(canvas, 'image/jpeg', 0.9);
    timing.encode = Math.round(performance.now() - t2);
    return { canvas, url, ms: Math.round(performance.now() - t0), timing };
  } finally {
    k.dispose();
  }
}
const hashNum = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h; };

/** Room keys in display order (no aliases). */
export const ROOM_KEYS = Object.keys(ROOMS);

// ---------------------------------------------------------------- baked rooms
// tools/bake-art.mjs paints each room (and each look the app grades a room with, rooms.js BAKE_ROOMS) with paint() above,
// vignette off, in two framings of the battle camera (camera.js applyBattleCamera):
//   wide  2.4:1   the 32 degree lens every screen of 16:9 or wider uses (a wider screen just sees more of the sides)
//   tall  4:3     the widened lens of narrower screens (they all show the same width, more or less floor and ceiling)
// Every screen's view is then a centred crop of one of the two: bakedRoom picks the framing that covers it, crops it
// (or mirrors the picture outward past its edges for a screen even wider or taller), and multiplies the room's vignette
// over the result exactly as the paint shader would have for a painting of that size. The characters stand on the same
// floor as on a live painting. public/assets/baked/manifest.json lists the files with a content hash (for caching) and the
// BAKE_VERSION they were painted for: a bake made for another version is ignored (live painting) until it is re-baked.
export const BAKE_VERSION = 'rooms-1';          // bump when a ROOMS recipe or the paint look changes, then npm run bake
export const BAKE_SIZES = { wide: [1920, 800], tall: [1200, 900] };
const NO_BAKED = typeof location !== 'undefined' && /[?&]baked=0(&|$)/.test(location.search || '');
const IMAGES_MAX = 5;                           // decoded baked rooms kept in memory (~6 MB each)
const URLS_MAX = 8;                             // composed CSS backdrops kept as object URLs

let manifestP = null;
/** public/assets/baked/manifest.json (tools/bake-art.mjs), or null without one (or with ?baked=0). Revalidated per load. */
export function bakedManifest() {
  if (!manifestP) manifestP = NO_BAKED || typeof fetch !== 'function' ? Promise.resolve(null)
    : fetch(assetUrl('baked/manifest.json'), { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  return manifestP;
}
/** URL of a baked file from its manifest entry ({ file, hash }); the hash keeps a re-bake from hitting a stale cache. */
export const bakedUrl = f => assetUrl('baked/' + f.file) + (f.hash ? '?h=' + f.hash : '');
const warned = new Set();
function warnOnce(what, e) { if (warned.has(what)) return; warned.add(what); console.warn(`[painter] baked ${what} unavailable, painting it live:`, e?.message || e); }

const lookKey = look => (look ? JSON.stringify(look) : '');
async function bakedEntry(key, look) {
  const m = await bakedManifest();
  if (!m?.rooms || m.rooms.version !== BAKE_VERSION) return null;
  return (m.rooms.list || []).find(e => e.key === key && lookKey(e.look) === lookKey(look) && e.variants?.length) || null;
}
/** Tangents of the battle camera's half angles at an aspect: { th, tv } (the view a picture of that aspect shows). */
function viewTan(aspect) {
  const cam = applyBattleCamera(new THREE.PerspectiveCamera(), aspect);
  const tv = Math.tan(cam.fov * D2R / 2);
  return { th: tv * aspect, tv };
}
/** The framing that covers a width x height screen's view with the most pixels (or, if none covers it, the closest). */
function pickVariant(entry, width, height) {
  const D = viewTan(width / height);
  let best = null;
  for (const v of entry.variants) {
    const S = viewTan(v.w / v.h), fx = D.th / S.th, fy = D.tv / S.tv;      // the screen's share of the picture
    const score = Math.max(fx, fy) <= 1.002 ? Math.min(1, fx) * v.w * Math.min(1, fy) * v.h : -Math.max(fx, fy);
    if (!best || score > best.score) best = { v, fx, fy, score };
  }
  return best;
}
const images = new Map();   // file -> Promise<ImageBitmap | HTMLImageElement> (LRU)
function loadImage(f) {
  const hit = images.get(f.file);
  if (hit) { images.delete(f.file); images.set(f.file, hit); return hit; }
  const url = bakedUrl(f);
  const p = (async () => {
    if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${f.file}`);
      return createImageBitmap(await r.blob());          // decoded off the main thread
    }
    const img = new Image(); img.decoding = 'async';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('could not load ' + f.file)); img.src = url; });
    return img;
  })();
  p.catch(() => { if (images.get(f.file) === p) images.delete(f.file); });
  images.set(f.file, p);
  while (images.size > IMAGES_MAX) images.delete(images.keys().next().value);
  return p;
}
/** The baked room for a width x height screen: { canvas (sRGB, the screen's aspect), url (the baked file) } or null. */
async function bakedRoom(key, width, height, look) {
  const e = await bakedEntry(key, look);
  if (!e) return null;
  const pick = pickVariant(e, width, height);
  if (!pick) return null;
  const img = await loadImage(pick.v);
  // no sharper than the baked pixels this view spans (a 1920 screen gets ~1920 px across a 16:9 crop of 1920x800)
  const k = Math.min(1, (pick.fx * pick.v.w) / width);
  const W = Math.max(16, Math.round(width * k)), H = Math.max(9, Math.round(height * k));
  const canvas = makeCanvas(W, H), ctx = canvas.getContext('2d');
  // the whole picture's size and place on this canvas (its view centred on the screen's)
  const w = W / pick.fx, h = H / pick.fy, x0 = (W - w) / 2, y0 = (H - h) / 2;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) {   // the picture, and mirror images of it past its edges
    const x = x0 + i * w, y = y0 + j * h;
    if (x >= W || y >= H || x + w <= 0 || y + h <= 0) continue;
    ctx.setTransform(i ? -1 : 1, 0, 0, j ? -1 : 1, i ? x + w : x, j ? y + h : y);
    ctx.drawImage(img, 0, 0, w, h);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  vignette2d(ctx, W, H, { ...LOOK, ...(ROOMS[key].look || {}), ...(look || {}) });
  return { canvas, url: bakedUrl(pick.v) };
}
// The finish shader's vignette (SHADERS.finish), as a multiply over a 2D canvas: an ellipse in the picture's own uv space.
function vignette2d(ctx, W, H, L) {
  const amount = L.vignette ?? 0;
  if (!(amount > 0)) return;
  const vc = L.vigColor || [0, 0, 0], R = 0.78 / 1.18, N = 40;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  for (let i = 0; i <= N; i++) {
    const x = (R * i / N) * 1.18, t = Math.min(1, Math.max(0, (x - 0.78) / (0.18 - 0.78))), v = t * t * (3 - 2 * t);
    const m = 1 - amount * (1 - v);
    g.addColorStop(i / N, `rgb(${vc.map(c => Math.round(255 * Math.min(1, Math.max(0, c + (1 - c) * m)))).join(',')})`);
  }
  ctx.save();
  ctx.setTransform(W, 0, 0, H / 0.86, W / 2, H / 2);    // q = (uv - 0.5) * (1, 0.86)
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

const urls = new Map();   // key|size|look -> Promise<{ url, own }> (LRU; own: an object URL made here, revoked on eviction)
/**
 * A room framed for a CSS backdrop of width x height (the DOM screens): the baked room composed for that size as a JPEG
 * object URL, or the live painting's URL. Promise<url>.
 */
export function roomUrl(renderer, key, { width = 1280, height = 720, look = null } = {}) {
  if (!ROOMS[key]) key = 'er_lobby';
  width = Math.max(64, Math.round(width)); height = Math.max(36, Math.round(height));
  const ck = `${key}|${width}x${height}|${lookKey(look)}`;
  let p = urls.get(ck);
  if (p) { urls.delete(ck); urls.set(ck, p); return p.then(r => r.url); }
  p = (async () => {
    const b = await bakedRoom(key, width, height, look).catch(e => { warnOnce('room ' + key, e); return null; });
    if (b) return { url: await canvasUrl(b.canvas, 'image/jpeg', 0.88), own: true };
    const r = await paintRoom(renderer, key, { width, height, look, live: true });
    r.texture?.dispose?.();
    return { url: r.url, own: false };
  })();
  p.catch(() => urls.delete(ck));
  urls.set(ck, p);
  while (urls.size > URLS_MAX) { const [k0, old] = urls.entries().next().value; urls.delete(k0); old.then(r => r.own && URL.revokeObjectURL(r.url)).catch(() => {}); }
  return p.then(r => r.url);
}

/**
 * Get a room ready ahead of time for a width x height screen: download and decode its baked picture, or (opts.live, the
 * default) paint it live when it has none. Resolves true when it's ready, false when there was nothing to do.
 */
export async function prefetchRoom(renderer, key, { width = innerWidth, height = innerHeight, look = null, live = true } = {}) {
  if (!ROOMS[key]) key = 'er_lobby';
  const e = await bakedEntry(key, look).catch(() => null);
  if (e) {
    const pick = pickVariant(e, Math.max(1, width), Math.max(1, height));
    if (pick && await loadImage(pick.v).then(() => true, err => { warnOnce('room ' + key, err); return false; })) return true;
  }
  if (!live || !renderer) return false;
  const r = await paintRoom(renderer, key, { width, height, look, live: true });
  r.texture?.dispose?.();
  return true;
}

/** True when a baked picture exists for this room and look (and this BAKE_VERSION). */
export async function hasBakedRoom(key, look = null) { return !!(await bakedEntry(key, look).catch(() => null)); }

/**
 * For tools/bake-art.mjs: paint one room for the bake at exactly width x height (no size cap, no cache), vignette off
 * (paintRoom lays it on for each screen's frame). Returns the canvas.
 */
export async function bakeRoom(renderer, key, { width, height, look = null } = {}) {
  if (!ROOMS[key]) throw new Error('unknown room ' + key);
  const r = await queue(() => paint(renderer, key, width, height, 1, { ...(look || {}), vignette: 0 }));
  URL.revokeObjectURL(r.url);
  return r.canvas;
}
/** A renderer set up like the stage's (sRGB output, ACES, PCF shadows) for off-screen work: the bake tool, the labs. */
export function offlineRenderer() {
  const r = new THREE.WebGLRenderer({ canvas: makeCanvas(64, 64), antialias: false, alpha: true, preserveDrawingBuffer: false });
  r.setPixelRatio(1); r.setSize(64, 64, false);
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
  return r;
}
