// Battle effects: blood (gore Full / Low), sparks, the pistol's muzzle flash + tracer + brass, the block shimmer, buff and
// debuff auras, heal glow, dust, weapon trails and the finisher's head pop. Pooled and bounded; every effect is dressing,
// the fight reads without it. Gore Low = no blood and no dismemberment (sparks and dust instead).
//   const fx = createFx(stage, { gore: 'full' })   it steps itself on stage.onFrame (update(dt) is safe to call too)
// The head pop follows yola-zombie (core/zombies.js EXEC_GORE, render/clipchars.js sever / burstHead): the modular
// zombies (nurse, modded patient) swap the head module for its wound cap and throw the head + cap; the others have the
// head baked from their skin weights (every vertex whose strongest bone is the head) and the head bone collapsed.
import * as THREE from 'three';
import { texture } from './assets.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion();
const rnd = (a, b) => a + Math.random() * (b - a);

function canvasTex(size, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
const dotTex = () => canvasTex(64, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); });
const blobTex = () => canvasTex(64, (g, s) => {
  for (let i = 0; i < 6; i++) { const x = s / 2 + rnd(-8, 8), y = s / 2 + rnd(-8, 8), rr = rnd(12, 22); const r = g.createRadialGradient(x, y, 0, x, y, rr); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }
});
const starTex = () => canvasTex(128, (g, s) => {
  const h = s / 2, r = g.createRadialGradient(h, h, 0, h, h, h); r.addColorStop(0, 'rgba(255,252,230,1)'); r.addColorStop(0.2, 'rgba(255,214,120,.95)'); r.addColorStop(1, 'rgba(255,140,30,0)');
  g.fillStyle = r; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = i % 2 ? h * 0.3 : h * (0.75 + Math.random() * 0.25); g.lineTo(h + Math.cos(a) * rr, h + Math.sin(a) * rr); } g.closePath(); g.fill();
});
const ringTex = () => canvasTex(128, (g, s) => { const h = s / 2, r = g.createRadialGradient(h, h, h * 0.55, h, h, h); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.7, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); });
const shieldTex = () => canvasTex(256, (g, s) => {
  // hex lattice with a soft vertical falloff
  g.clearRect(0, 0, s, s);
  const R = 14, w = Math.sqrt(3) * R;
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.6;
  for (let row = -1; row < s / (R * 1.5) + 1; row++) for (let col = -1; col < s / w + 1; col++) {
    const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * R * 1.5;
    g.beginPath(); for (let i = 0; i <= 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); } g.stroke();
  }
  const fade = g.createLinearGradient(0, 0, s, 0); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.25, 'rgba(0,0,0,0)'); fade.addColorStop(0.75, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 0, s, s);
});

// ---- point particles: one draw per blend mode ----
function makePoints(cap, additive, map) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(cap * 3), col = new Float32Array(cap * 3), size = new Float32Array(cap), alpha = new Float32Array(cap);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uScale: { value: 600 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale;
      void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
      void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA; if (a < 0.004) discard; gl_FragColor = vec4(vC * ${additive ? 'a' : '1.0'}, a); }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = additive ? 20 : 15;
  const parts = Array.from({ length: cap }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color(), s0: 0.05, s1: 0.05, a: 1, g: 0, drag: 0, floor: true, fadeIn: 0 }));
  let next = 0, live = 0;
  return {
    pts,
    spawn(p, v, { life = 0.6, color = 0xffffff, size = 0.06, size1 = null, alpha = 1, gravity = 0, drag = 0, floor = true, fadeIn = 0 } = {}) {
      const q = parts[next]; next = (next + 1) % cap;
      q.p.copy(p); q.v.copy(v); q.life = q.max = life; q.c.set(color); q.s0 = size; q.s1 = size1 ?? size; q.a = alpha; q.g = gravity; q.drag = drag; q.floor = floor; q.fadeIn = fadeIn;
      live++;
    },
    update(dt, scale) {
      mat.uniforms.uScale.value = scale;
      let n = 0;
      for (let i = 0; i < cap; i++) {
        const q = parts[i];
        if (q.life <= 0) { alpha[i] = 0; size[i] = 0; continue; }
        q.life -= dt; n++;
        q.v.y -= q.g * dt; if (q.drag) q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
        q.p.addScaledVector(q.v, dt);
        if (q.floor && q.p.y < 0.01) { q.p.y = 0.01; q.v.set(q.v.x * 0.2, 0, q.v.z * 0.2); }
        const u = 1 - Math.max(0, q.life) / q.max;
        pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.p.y; pos[i * 3 + 2] = q.p.z;
        col[i * 3] = q.c.r; col[i * 3 + 1] = q.c.g; col[i * 3 + 2] = q.c.b;
        size[i] = q.s0 + (q.s1 - q.s0) * u;
        alpha[i] = q.a * (q.fadeIn > 0 && u < q.fadeIn ? u / q.fadeIn : 1) * (u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1);
      }
      live = n;
      if (n || this.dirty) { for (const k of ['position', 'color', 'size', 'alpha']) geo.attributes[k].needsUpdate = true; this.dirty = n > 0; }
    },
    get live() { return live; },
  };
}

// ---- streaks (sparks): line segments from the particle back along its velocity ----
function makeStreaks(cap) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(cap * 6), col = new Float32Array(cap * 6);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const lines = new THREE.LineSegments(geo, mat); lines.frustumCulled = false; lines.renderOrder = 21;
  const parts = Array.from({ length: cap }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color(), len: 0.05 }));
  let next = 0;
  return {
    lines,
    spawn(p, v, { life = 0.25, color = 0xffd27a, len = 0.06 } = {}) { const q = parts[next]; next = (next + 1) % cap; q.p.copy(p); q.v.copy(v); q.life = q.max = life; q.c.set(color); q.len = len; },
    update(dt) {
      for (let i = 0; i < cap; i++) {
        const q = parts[i], o = i * 6;
        if (q.life <= 0) { for (let k = 0; k < 6; k++) { pos[o + k] = 0; col[o + k] = 0; } continue; }
        q.life -= dt; q.v.y -= 9.8 * dt; q.v.multiplyScalar(1 - 2.5 * dt); q.p.addScaledVector(q.v, dt);
        if (q.p.y < 0.01) { q.p.y = 0.01; q.v.y = Math.abs(q.v.y) * 0.35; }
        const k = Math.max(0, q.life / q.max), tail = _v.copy(q.v).normalize().multiplyScalar(-q.len * (0.4 + k));
        pos[o] = q.p.x; pos[o + 1] = q.p.y; pos[o + 2] = q.p.z; pos[o + 3] = q.p.x + tail.x; pos[o + 4] = q.p.y + tail.y; pos[o + 5] = q.p.z + tail.z;
        col[o] = q.c.r * k; col[o + 1] = q.c.g * k; col[o + 2] = q.c.b * k; col[o + 3] = col[o + 4] = col[o + 5] = 0;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
  };
}

export function createFx(stage, { gore = 'full' } = {}) {
  const scene = stage.scene;
  const root = new THREE.Group(); root.name = 'fx'; scene.add(root);
  let goreOn = gore !== 'low';
  const dot = dotTex(), blob = blobTex(), star = starTex(), ring = ringTex();
  const glow = makePoints(700, true, dot);
  const soft = makePoints(900, false, blob);
  const streaks = makeStreaks(220);
  root.add(soft.pts, glow.pts, streaks.lines);
  const timed = [];   // { t, d, fn(u), end() }
  const add = (d, fn, end) => timed.push({ t: 0, d, fn, end });

  // ---- sprites (muzzle flash, impact stars, mist) ----
  const sprites = [];
  function sprite(map, pos, { size = 0.4, size1 = null, life = 0.08, color = 0xffffff, additive = true, opacity = 1, rot = Math.random() * 6.28 } = {}) {
    let s = sprites.find(x => !x.on && x.additive === additive);
    if (!s) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !additive }));
      m.renderOrder = 22; root.add(m); s = { m, additive, on: false }; sprites.push(s);
    }
    s.on = true; s.t = 0; s.life = life; s.size = size; s.size1 = size1 ?? size; s.op = opacity;
    s.m.material.map = map; s.m.material.color.set(color); s.m.material.rotation = rot; s.m.position.copy(pos); s.m.visible = true;
    return s;
  }

  // ---- floor decals: blood pools and scorch/impact rings ----
  const pools = [];
  const splat = texture('blood_splatter.webp');
  function pool(pos, size = 0.6) {
    if (!goreOn) return;
    let d = pools.length >= 26 ? pools.shift() : null;
    if (!d) { d = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: splat, color: 0x5a0606, transparent: true, depthWrite: false, opacity: 0.9, alphaTest: 0.02 })); d.rotation.x = -Math.PI / 2; d.renderOrder = 4; root.add(d); }
    d.position.set(pos.x, 0.008 + pools.length * 0.0004, pos.z); d.rotation.z = Math.random() * 6.28;
    d.userData = { t: 0, size }; d.scale.setScalar(0.01); d.material.opacity = 0.85; d.visible = true;
    pools.push(d);
  }
  const floorRings = [];
  function floorRing(pos, { color = 0xffffff, size = 1.2, life = 0.45, opacity = 0.8 } = {}) {
    let r = floorRings.find(x => !x.on);
    if (!r) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ring, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.renderOrder = 5; root.add(m); r = { m, on: false }; floorRings.push(r); }
    r.on = true; r.t = 0; r.life = life; r.size = size; r.op = opacity; r.m.material.color.set(color); r.m.position.set(pos.x, 0.015, pos.z); r.m.visible = true;
  }

  // ---- blood ----
  const BLOOD = new THREE.Color(0x6e0707), BLOOD_HI = new THREE.Color(0x9c1010);
  function blood(pos, dir = new THREE.Vector3(1, 0, 0), amount = 1) {
    if (!goreOn) { sparks(pos, Math.round(4 + amount * 3), 0xd8d0c0); return; }
    const n = Math.round(14 + amount * 22), d = _v2.copy(dir).setY(0).normalize();
    for (let i = 0; i < n; i++) {
      const sp = rnd(1.2, 3.6) * (0.6 + amount * 0.5);
      const v = _v.copy(d).multiplyScalar(sp).add(_v3.set(rnd(-1, 1), rnd(0.2, 1.6), rnd(-1, 1)).multiplyScalar(sp * 0.45));
      soft.spawn(pos, v, { life: rnd(0.45, 0.9), color: Math.random() < 0.5 ? BLOOD : BLOOD_HI, size: rnd(0.025, 0.06), alpha: 1, gravity: 9.8, drag: 0.6 });
    }
    // mist
    for (let i = 0; i < 3 + amount * 2; i++) soft.spawn(pos, _v.copy(d).multiplyScalar(rnd(0.3, 0.9)).add(_v3.set(rnd(-0.3, 0.3), rnd(0, 0.4), rnd(-0.3, 0.3))), { life: rnd(0.35, 0.6), color: 0x5a0505, size: rnd(0.18, 0.3), size1: rnd(0.45, 0.7), alpha: 0.55, gravity: 0, drag: 3, floor: false });
    if (amount >= 0.8) pool(_v.copy(pos).addScaledVector(d, rnd(0.3, 0.7)), 0.35 + amount * 0.25);
  }
  function sparks(pos, n = 12, color = 0xffd27a, speed = 4) {
    for (let i = 0; i < n; i++) {
      const v = _v.set(rnd(-1, 1), rnd(-0.2, 1.2), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.4, 1) * speed);
      streaks.spawn(pos, v, { life: rnd(0.15, 0.35), color, len: rnd(0.04, 0.09) });
    }
    glow.spawn(pos, _v.set(0, 0, 0), { life: 0.08, color, size: 0.35, size1: 0.6, alpha: 0.8, floor: false });
  }
  /** The impact itself: a bright star where the blow lands + sparks (blunt) or blood (gore). */
  function impact(pos, { dir = new THREE.Vector3(1, 0, 0), strength = 1, blunt = true, blocked = false, heavy = false } = {}) {
    sprite(star, pos, { size: 0.35 + strength * 0.25, size1: 0.7 + strength * 0.4, life: heavy ? 0.12 : 0.09, color: blocked ? 0x9fd0ff : 0xfff2d0 });
    stage.flashLight?.(pos, blocked ? 0x9fd0ff : 0xffe2b8, blocked ? 10 : 8 + strength * 10);
    if (blocked) { sparks(pos, 14, 0xa8d8ff, 4.5); return; }
    // a heavy blow: a shock ring off the contact and more debris
    if (heavy) sprite(ring, pos, { size: 0.25, size1: 1.1 + strength * 0.5, life: 0.2, color: 0xffe8c8, opacity: 0.75, rot: 0 });
    if (blunt) sparks(pos, Math.round(4 + strength * (heavy ? 9 : 5)), 0xffe0a0, heavy ? 4 : 3);
    blood(pos, dir, strength * (heavy ? 1.2 : 1));
  }
  function dust(pos, { amount = 1, color = 0x8a8478 } = {}) {
    for (let i = 0; i < 6 + amount * 6; i++) {
      const a = Math.random() * 6.28, sp = rnd(0.4, 1.2) * amount;
      soft.spawn(_v3.set(pos.x + Math.cos(a) * 0.15, 0.05, pos.z + Math.sin(a) * 0.15), _v.set(Math.cos(a) * sp, rnd(0.1, 0.5), Math.sin(a) * sp * 0.6), { life: rnd(0.5, 0.9), color, size: rnd(0.15, 0.25), size1: rnd(0.4, 0.6), alpha: 0.32, drag: 2.5, floor: false });
    }
  }

  // ---- guns ----
  function muzzle(pos, dir = new THREE.Vector3(1, 0, 0), { big = false } = {}) {
    sprite(star, _v.copy(pos).addScaledVector(dir, 0.06), { size: big ? 0.7 : 0.42, size1: big ? 0.9 : 0.55, life: big ? 0.07 : 0.05, color: 0xffe2a8 });
    sprite(star, _v.copy(pos).addScaledVector(dir, big ? 0.22 : 0.14), { size: big ? 0.45 : 0.25, life: 0.04, color: 0xffb860 });
    for (let i = 0; i < (big ? 10 : 5); i++) streaks.spawn(pos, _v.copy(dir).multiplyScalar(rnd(5, 9)).add(_v3.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1))), { life: rnd(0.05, 0.12), color: 0xffd080, len: 0.08 });
    for (let i = 0; i < (big ? 5 : 2); i++) soft.spawn(pos, _v.copy(dir).multiplyScalar(rnd(0.4, 1)).add(_v3.set(0, rnd(0.1, 0.4), 0)), { life: rnd(0.5, 0.9), color: 0x9a9a92, size: 0.08, size1: 0.3, alpha: 0.25, drag: 2, floor: false });
    stage.flashLight?.(pos, 0xffc070, big ? 30 : 14);
  }
  const tracers = [];
  function tracer(from, to, { color = 0xfff1c4, width = 0.025 } = {}) {
    let t = tracers.find(x => !x.on);
    if (!t) {
      const g = new THREE.PlaneGeometry(1, 1); g.translate(0, 0.5, 0);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
      m.renderOrder = 23; root.add(m); t = { m, on: false }; tracers.push(t);
    }
    const d = _v.copy(to).sub(from), len = d.length();
    t.on = true; t.t = 0; t.life = 0.07; t.m.visible = true; t.m.material.color.set(color);
    t.m.position.copy(from); t.m.quaternion.setFromUnitVectors(UP, d.normalize());
    // face the camera around its own axis
    t.m.scale.set(width, len, 1);
    const camDir = _v2.copy(stage.camera.position).sub(from);
    const axis = _v3.copy(d); const side = new THREE.Vector3().crossVectors(axis, camDir).normalize();
    const m4 = new THREE.Matrix4().makeBasis(side, axis, new THREE.Vector3().crossVectors(side, axis));
    t.m.quaternion.setFromRotationMatrix(m4);
  }
  // brass: little cylinders kicked up and right, bouncing on the floor
  const shells = [];
  const shellGeo = new THREE.CylinderGeometry(0.0062, 0.0062, 0.026, 8); shellGeo.rotateZ(Math.PI / 2);
  const shellMat = new THREE.MeshStandardMaterial({ color: 0xc89a3c, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.5 });
  function shell(pos, side = new THREE.Vector3(0, 0, 1)) {
    let s = shells.find(x => !x.on);
    if (!s) { const m = new THREE.Mesh(shellGeo, shellMat); m.castShadow = false; root.add(m); s = { m, v: new THREE.Vector3(), w: new THREE.Vector3(), on: false }; shells.push(s); }
    s.on = true; s.t = 0; s.m.visible = true; s.m.position.copy(pos);
    s.v.copy(side).multiplyScalar(rnd(1.0, 1.6)).add(_v.set(rnd(-0.3, 0.3), rnd(2.0, 2.8), 0)); s.w.set(rnd(-25, 25), rnd(-25, 25), rnd(-25, 25));
  }

  // ---- auras ----
  function heightOf(actor) { return actor?.height || 1.7; }
  function feet(actor, out = new THREE.Vector3()) { return actor.anchor ? actor.anchor('feet', out) : out.set(0, 0, 0); }
  function buffAura(actor, color = 0xff7a3d) {
    if (!actor) return;
    const f = feet(actor, new THREE.Vector3()), h = heightOf(actor);
    floorRing(f, { color, size: 1.5 * Math.max(1, actor.scale || 1), life: 0.55 });
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * 6.28, r = rnd(0.2, 0.45);
      glow.spawn(_v3.set(f.x + Math.cos(a) * r, rnd(0, h * 0.4), f.z + Math.sin(a) * r), _v.set(0, rnd(1.0, 2.2), 0), { life: rnd(0.5, 0.9), color, size: rnd(0.04, 0.08), alpha: 0.9, floor: false, fadeIn: 0.15 });
    }
    actor.flash?.(color, 0.18);
  }
  function debuffSwirl(actor, color = 0xb06bff) {
    if (!actor) return;
    const c = actor.anchor('head', new THREE.Vector3()); c.y -= 0.05;
    const id = Math.random();
    const N = 14, ph = [];
    for (let i = 0; i < N; i++) ph.push(i / N * Math.PI * 2);
    add(1.1, u => {
      const hp = actor.anchor('head', _v2); const R = 0.32 * (1 - u * 0.3);
      for (let i = 0; i < 2; i++) {
        const a = ph[(Math.random() * N) | 0] + u * 9;
        glow.spawn(_v3.set(hp.x + Math.cos(a) * R, hp.y + 0.08 - u * 0.25 + rnd(-0.05, 0.05), hp.z + Math.sin(a) * R), _v.set(-Math.sin(a), -0.3, Math.cos(a)).multiplyScalar(0.6), { life: 0.35, color, size: rnd(0.05, 0.09), alpha: 0.9, floor: false });
      }
    });
    actor.flash?.(color, 0.12);
    return id;
  }
  function stunStars(actor) { return debuffSwirl(actor, 0xffd34d); }
  function healGlow(actor, color = 0x7cf08a) {
    if (!actor) return;
    const f = feet(actor, new THREE.Vector3()), h = heightOf(actor);
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * 6.28, r = rnd(0.1, 0.4);
      glow.spawn(_v3.set(f.x + Math.cos(a) * r, rnd(0.1, h), f.z + Math.sin(a) * r), _v.set(0, rnd(0.5, 1.2), 0), { life: rnd(0.6, 1.1), color, size: rnd(0.05, 0.1), alpha: 0.85, floor: false, fadeIn: 0.2 });
    }
    floorRing(f, { color, size: 1.3, life: 0.6, opacity: 0.6 });
    actor.flash?.(color, 0.25);
  }

  // ---- the block shimmer: a curved hex panel in front of each hero ----
  const shieldMat = new THREE.MeshBasicMaterial({ map: shieldTex(), color: 0x4f86b0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const shieldGeo = new THREE.CylinderGeometry(0.75, 0.75, 1, 28, 1, true, -0.9, 1.8);
  function shieldShimmer(actors, { hit = false } = {}) {
    for (const a of [].concat(actors).filter(Boolean)) {
      const m = new THREE.Mesh(shieldGeo, shieldMat.clone());
      const h = heightOf(a) * 1.15;
      m.scale.set(1, h, 1); m.renderOrder = 24;
      const f = feet(a, new THREE.Vector3());
      m.position.set(f.x, h / 2, f.z); m.rotation.y = a.isHero === false ? -Math.PI / 2 : Math.PI / 2; root.add(m); // (the arc faces the other side)
      const peak = hit ? 0.85 : 0.7;
      add(hit ? 0.35 : 0.65, u => {
        m.material.opacity = peak * (u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8);
        m.material.map.offset.y = -u * 0.3;
        const s = 1 + (hit ? 0.05 * Math.sin(u * 30) : 0.08 * (1 - u)); m.scale.x = m.scale.z = s;
      }, () => { root.remove(m); m.material.dispose(); });
      if (hit) sparks(_v.set(f.x + (a.isHero === false ? -0.7 : 0.7), h * 0.55, f.z + 0.1), 10, 0xa8d8ff, 3.5);
    }
  }

  // ---- weapon trails ----
  const trails = new Map(); // actor -> trail
  function trail(actor, on = true, { color = 0xffe8c8, opacity = 0.32 } = {}) {
    let T = trails.get(actor);
    if (!T) {
      const N = 16, geo = new THREE.BufferGeometry();
      const pos = new Float32Array(N * 2 * 3), al = new Float32Array(N * 2);
      const idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geo.setIndex(idx); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('alpha', new THREE.BufferAttribute(al, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uOp: { value: opacity } },
        vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 uColor; uniform float uOp; varying float vA; void main(){ float a = vA * uOp; gl_FragColor = vec4(uColor * a, a); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      });
      const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 19; root.add(mesh);
      T = { N, pos, al, geo, mesh, samples: [], on: false, mat }; trails.set(actor, T);
    }
    T.on = on; if (on) { T.samples.length = 0; T.mat.uniforms.uColor.value.set(color); T.mat.uniforms.uOp.value = opacity; }
  }
  function updateTrails(dt) {
    for (const [actor, T] of trails) {
      if (T.on && actor.weapon && actor.weapon.def?.def) {
        const w = actor.weapon, grip = w.obj.getWorldPosition(new THREE.Vector3()), tip = w.tipWorld(new THREE.Vector3());
        const inner = grip.lerp(tip, 0.62), last = T.samples[0];
        if (!last || last.b.distanceToSquared(tip) > 1e-4) T.samples.unshift({ a: inner, b: tip, age: 0 });
      }
      for (const s of T.samples) s.age += dt;
      while (T.samples.length > T.N || (T.samples.length && T.samples[T.samples.length - 1].age > 0.1)) T.samples.pop();
      const n = T.samples.length;
      for (let i = 0; i < T.N; i++) {
        const s = T.samples[Math.min(i, n - 1)];
        const o = i * 6;
        if (!s) { T.al[i * 2] = T.al[i * 2 + 1] = 0; continue; }
        T.pos[o] = s.a.x; T.pos[o + 1] = s.a.y; T.pos[o + 2] = s.a.z; T.pos[o + 3] = s.b.x; T.pos[o + 4] = s.b.y; T.pos[o + 5] = s.b.z;
        const k = i < n ? Math.pow(Math.max(0, 1 - s.age / 0.1) * (1 - i / Math.max(2, n)), 1.6) : 0;
        T.al[i * 2] = 0; T.al[i * 2 + 1] = k;
      }
      T.geo.attributes.position.needsUpdate = true; T.geo.attributes.alpha.needsUpdate = true;
      T.mesh.visible = n > 1;
    }
  }

  // ---- gore: the head pop ----
  const pieces = [];
  const MODULE = { head: /^(Nurse_Head|Patient_Head)$/ };
  const GORE = { head: /^GORE_Head_(Stump|Detached)/ };
  function bakeMeshes(meshes, centre) {
    const g = new THREE.Group();
    for (const o of meshes) {
      if (o.isSkinnedMesh) o.skeleton.update();
      o.updateMatrixWorld(true);
      const sg = o.geometry, n = sg.attributes.position.count, pos = new Float32Array(n * 3), v = new THREE.Vector3();
      for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld).sub(centre); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      if (sg.attributes.uv) geo.setAttribute('uv', sg.attributes.uv); if (sg.index) geo.setIndex(sg.index);
      geo.computeVertexNormals();
      const mat = (Array.isArray(o.material) ? o.material[0] : o.material).clone(); mat.transparent = false; mat.opacity = 1; if (mat.emissive) mat.emissive.setRGB(0, 0, 0);
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m);
    }
    return g;
  }
  // the part of a skinned mesh weighted to `rootBone` and its children, baked in its current pose
  function bakeByWeights(model, rootBone, centre) {
    const g = new THREE.Group(), v = new THREE.Vector3();
    model.traverse(o => {
      if (!o.isSkinnedMesh || !o.visible) return;
      o.skeleton.update(); o.updateMatrixWorld(true);
      const inPart = o.skeleton.bones.map(b => { for (let n = b; n && n.isBone; n = n.parent) if (n === rootBone) return true; return false; });
      const sg = o.geometry, si = sg.attributes.skinIndex, sw = sg.attributes.skinWeight, cnt = sg.attributes.position.count;
      const keep = new Uint8Array(cnt);
      for (let i = 0; i < cnt; i++) { let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } } keep[i] = inPart[bi] ? 1 : 0; }
      const idx = sg.index ? sg.index.array : Array.from({ length: cnt }, (_, i) => i);
      const map = new Map(), pos = [], uv = [], index = [], uvs = sg.attributes.uv;
      for (let t = 0; t < idx.length; t += 3) {
        if (!(keep[idx[t]] && keep[idx[t + 1]] && keep[idx[t + 2]])) continue;
        for (let k = 0; k < 3; k++) {
          const vi = idx[t + k]; let j = map.get(vi);
          if (j === undefined) { j = map.size; map.set(vi, j); o.getVertexPosition(vi, v); v.applyMatrix4(o.matrixWorld).sub(centre); pos.push(v.x, v.y, v.z); if (uvs) uv.push(uvs.getX(vi), uvs.getY(vi)); }
          index.push(j);
        }
      }
      if (!index.length) return;
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      if (uv.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(index); geo.computeVertexNormals();
      const mat = (Array.isArray(o.material) ? o.material[0] : o.material).clone(); mat.transparent = false; mat.opacity = 1; if (mat.emissive) mat.emissive.setRGB(0, 0, 0);
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m);
    });
    return g;
  }
  /** Pop a zombie's head off (finisher). dir: the blow's direction. Gore Low: nothing comes off. */
  function gib(actor, part = 'head', { dir = new THREE.Vector3(1, 0, 0), speed = 4.5, burst = false } = {}) {
    if (!goreOn || !actor || part !== 'head' || actor.headGone) return null;
    const B = actor.bones; if (!B.Head) return null;
    actor.root.updateMatrixWorld(true);
    const centre = B.Head.getWorldPosition(new THREE.Vector3());
    let piece = null;
    const model = actor.data.model, mods = [], gores = {};
    model.traverse(o => { if (MODULE.head.test(o.name)) mods.push(o); const m = GORE.head.exec(o.name); if (m) gores[m[1].toLowerCase()] = o; });
    if (burst) { /* the head bursts apart: nothing flies */ }
    else if (mods.length) {
      const meshes = []; for (const m of mods) m.traverse(o => o.isMesh && meshes.push(o));
      if (gores.detached) gores.detached.traverse(o => o.isMesh && meshes.push(o));
      piece = bakeMeshes(meshes, centre);
    } else piece = bakeByWeights(model, B.Head, centre);
    // hide the head on the body
    if (mods.length) { mods.forEach(m => (m.visible = false)); if (gores.stump) gores.stump.visible = true; }
    else actor.collapsed.push(B.Head);
    actor.headGone = true;
    if (piece) {
      piece.position.copy(centre); root.add(piece);
      const v = _v.copy(dir).setY(0).normalize().multiplyScalar(speed).add(_v3.set(rnd(-0.6, 0.6), rnd(3.2, 4.4), rnd(0.2, 1.2)));
      pieces.push({ obj: piece, v: v.clone(), w: new THREE.Vector3(rnd(-10, 10), rnd(-10, 10), rnd(-14, 14)), t: 0, rest: false, r: 0.11 * (actor.rigScale || 1) });
      if (pieces.length > 8) dropPiece(pieces[0]);
    }
    // the burst: blood out along the blow and up, flesh and bone bits, a fountain from the neck for a moment
    const neck = (B.Neck || B.Head).getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 3; i++) blood(neck, _v2.copy(dir).add(_v3.set(rnd(-0.4, 0.4), 0, rnd(-0.4, 0.4))), 1.4);
    for (let i = 0; i < 24; i++) soft.spawn(neck, _v.copy(dir).multiplyScalar(rnd(1, 4)).add(_v3.set(rnd(-1.5, 1.5), rnd(1, 4), rnd(-1.5, 1.5))), { life: rnd(0.6, 1.2), color: i % 3 ? 0x4a0606 : 0xd8cbb5, size: rnd(0.03, 0.06), gravity: 9.8 });
    pool(_v.copy(neck).addScaledVector(dir, 0.8), 1.1);
    add(1.4, u => { if (Math.random() < 0.7 * (1 - u)) { const p = (B.Neck || B.Head).getWorldPosition(_v2); soft.spawn(p, _v.set(rnd(-0.4, 0.4), rnd(1.5, 2.8) * (1 - u), rnd(-0.4, 0.4)), { life: 0.6, color: BLOOD_HI, size: rnd(0.025, 0.045), gravity: 9.8 }); } });
    return piece;
  }
  function dropPiece(p) { root.remove(p.obj); p.obj.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); pieces.splice(pieces.indexOf(p), 1); }
  function updatePieces(dt) {
    for (const p of [...pieces]) {
      p.t += dt;
      if (!p.rest) {
        p.v.y -= 9.8 * dt; p.obj.position.addScaledVector(p.v, dt);
        p.obj.rotation.x += p.w.x * dt; p.obj.rotation.y += p.w.y * dt; p.obj.rotation.z += p.w.z * dt;
        if (Math.random() < 0.5 && p.t < 1.0 && goreOn) soft.spawn(p.obj.position, _v.set(0, -0.3, 0), { life: 0.5, color: BLOOD, size: 0.03, gravity: 6 });
        if (p.obj.position.y < p.r) {
          p.obj.position.y = p.r;
          if (p.v.y < -1.5) { p.v.y *= -0.3; p.v.x *= 0.5; p.v.z *= 0.5; p.w.multiplyScalar(0.5); pool(p.obj.position, 0.35); }
          else { p.rest = true; }
        }
      }
      if (p.t > 5) { const k = 1 - (p.t - 5) / 0.8; p.obj.traverse(o => { if (o.isMesh) { o.material.transparent = true; o.material.opacity = Math.max(0, k); } }); if (k <= 0) dropPiece(p); }
    }
  }

  // a burst of light and debris for the finisher (and the boss's mode shift / pipe bombs)
  function blast(pos, { color = 0xffb35a, strength = 1, ground = true } = {}) {
    sprite(star, pos, { size: 0.9 * strength, size1: 2.2 * strength, life: 0.18, color });
    sparks(pos, Math.round(24 * strength), 0xffd27a, 6);
    if (ground) { floorRing(_v.set(pos.x, 0, pos.z), { color, size: 3 * strength, life: 0.5 }); dust(_v.set(pos.x, 0, pos.z), { amount: 1.5 * strength }); }
    stage.flashLight?.(pos, color, 80 * strength);
  }

  function setGore(g) { goreOn = g !== 'low' && g !== false; }

  let lastFrame = -1;
  function update(dt) {
    const f = stage.frame?.() ?? -2;
    if (f === lastFrame) return; lastFrame = f;
    const cam = stage.camera, H = stage.renderer.domElement.height || 720;
    const scale = H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    glow.update(dt, scale); soft.update(dt, scale); streaks.update(dt);
    for (const s of sprites) if (s.on) {
      s.t += dt; const u = s.t / s.life;
      if (u >= 1) { s.on = false; s.m.visible = false; continue; }
      const k = s.size + (s.size1 - s.size) * u; s.m.scale.set(k, k, 1); s.m.material.opacity = s.op * (1 - u * u);
    }
    for (const t of tracers) if (t.on) { t.t += dt; const u = t.t / t.life; t.m.material.opacity = Math.max(0, 1 - u); if (u >= 1) { t.on = false; t.m.visible = false; } }
    for (const r of floorRings) if (r.on) { r.t += dt; const u = r.t / r.life; const k = r.size * (0.3 + 0.7 * Math.sqrt(Math.min(1, u))); r.m.scale.set(k, k, 1); r.m.material.opacity = r.op * (1 - u); if (u >= 1) { r.on = false; r.m.visible = false; } }
    for (const d of pools) { const U = d.userData; if (U.t < 1) { U.t = Math.min(1, U.t + dt * 2.2); const k = U.size * (1 - Math.pow(1 - U.t, 3)); d.scale.set(k, k, 1); } }
    for (const s of shells) if (s.on) {
      s.t += dt; s.v.y -= 9.8 * dt; s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += s.w.x * dt; s.m.rotation.y += s.w.y * dt; s.m.rotation.z += s.w.z * dt;
      if (s.m.position.y < 0.006) { s.m.position.y = 0.006; s.v.y = Math.abs(s.v.y) * 0.35; s.v.x *= 0.5; s.v.z *= 0.5; s.w.multiplyScalar(0.4); }
      if (s.t > 1.6) { s.on = false; s.m.visible = false; }
    }
    for (const T of [...timed]) { T.t += dt; const u = Math.min(1, T.t / T.d); T.fn?.(u); if (u >= 1) { T.end?.(); timed.splice(timed.indexOf(T), 1); } }
    updateTrails(dt); updatePieces(dt);
  }
  const unsub = stage.onFrame(dt => update(dt));

  function clear() {
    for (const p of [...pieces]) dropPiece(p);
    for (const d of pools) d.visible = false; pools.length = 0;
  }
  function dispose() { unsub(); clear(); scene.remove(root); }

  return {
    blood, sparks, impact, muzzle, tracer, shell, shieldShimmer, buffAura, debuffSwirl, stunStars, dust, healGlow, gib, blast, pool, floorRing, trail,
    update, setGore, clear, dispose, get gore() { return goreOn ? 'full' : 'low'; },
  };
}
