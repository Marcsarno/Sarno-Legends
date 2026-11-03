// The FPS level: three large open hospital floors (ER lobby, open ward, atrium cafeteria) linked by short corridors, built
// as blockout walls with the deckbuilder's clinical wall / floor textures, pillars and hospital-kit props for cover, and
// lit like the game (dim, flickering panels, an emergency red in each corridor). Zombies come through dark side doorways
// (voids behind sawhorses the player can't pass). A corridor's swing doors open when the floor before it is clear.
// Collision is 2D (boxes on the floor plan); zombies path with a flow field over a 0.5 m grid (nav).
//   const level = await buildLevel(scene)
//   level.colliders / level.rayMeshes / level.rooms / level.roomOf(x, z) / level.spawns[room] / level.doors[i].open()
//   level.nav.update(target) / level.nav.dir(pos, out) / level.update(dt, t, playerPos)
import * as THREE from 'three';
import { prop, texture } from '../render/assets.js';

const H = 3.4;     // ceiling height on the floors (corridors 3.0)
const T = 0.3;     // wall thickness

// rooms: x and z ranges (z goes negative ahead). arena: a floor with a wave
export const ROOMS = [
  { name: 'ER Lobby', x: [-12, 12], z: [-18, 0], floor: 'floor_clinical.webp', arena: true },
  { name: 'Corridor', x: [-2, 2], z: [-27, -18], floor: 'floor_corridor.webp', corridor: true, h: 3.0 },
  { name: 'Ward', x: [-13, 13], z: [-49, -27], floor: 'floor_clinical.webp', arena: true },
  { name: 'Service corridor', x: [-2, 2], z: [-58, -49], floor: 'floor_maintenance.webp', corridor: true, h: 3.0 },
  { name: 'Atrium', x: [-14, 14], z: [-82, -58], floor: 'floor_clinical.webp', arena: true, h: 4.2 },
];
// swing doors (closed until the floor before them is clear): at the far end of each arena's exit
export const DOORS = [{ z: -18, x: 0, w: 4, room: 0 }, { z: -49, x: 0, w: 4, room: 2 }];
// the zombies' side doorways: wall side, along-wall centre, the room
const GAPS = [
  { room: 0, side: 'w', at: -5 }, { room: 0, side: 'w', at: -14 }, { room: 0, side: 'e', at: -4 }, { room: 0, side: 'e', at: -13 }, { room: 0, side: 's', at: 8 },
  { room: 2, side: 'w', at: -32 }, { room: 2, side: 'w', at: -44 }, { room: 2, side: 'e', at: -31 }, { room: 2, side: 'e', at: -44 }, { room: 2, side: 'n', at: -8 }, { room: 2, side: 'n', at: 8 },
  { room: 4, side: 'w', at: -64 }, { room: 4, side: 'w', at: -76 }, { room: 4, side: 'e', at: -66 }, { room: 4, side: 'e', at: -77 }, { room: 4, side: 'n', at: -7 }, { room: 4, side: 'n', at: 7 },
];
const GAP_W = 2.0, VOID = 2.8;
// lamps (the pool lights the nearest few: see update)
const LAMPS = [
  { x: -6, z: -5, c: 0xd6e6ff, i: 10 }, { x: 6, z: -12, c: 0xffd9a8, i: 9, flicker: 1 }, { x: 5, z: -3, c: 0xcfe0f0, i: 6 }, { x: -6, z: -14, c: 0xbfe8d8, i: 7 },
  { x: 0, z: -22.5, c: 0xff2a1a, i: 9, pulse: 1, dist: 10 },
  { x: -7, z: -33, c: 0xbfe8d8, i: 9, flicker: 0.6 }, { x: 7, z: -38, c: 0xffc9a0, i: 8 }, { x: -6, z: -45, c: 0xd6e6ff, i: 8 }, { x: 6, z: -45, c: 0xffd9a8, i: 7, flicker: 1 },
  { x: 0, z: -53.5, c: 0xff2a1a, i: 9, pulse: 1, dist: 10 },
  { x: -8, z: -63, c: 0xffe0b0, i: 11 }, { x: 8, z: -66, c: 0xd6e6ff, i: 10, flicker: 0.6 }, { x: -7, z: -76, c: 0xbfe8d8, i: 10 }, { x: 7, z: -77, c: 0xffc9a0, i: 9, flicker: 1 }, { x: 0, z: -70, c: 0xfff0d8, i: 8 },
];
const POOL = 5;

export async function buildLevel(scene, { lowPower = false } = {}) {
  const root = new THREE.Group(); root.name = 'level'; scene.add(root);
  const colliders = [], rayMeshes = [], flick = [];
  const wallMat = new Map();
  const matFor = (w, h, tex = 'wall_clinical.webp') => {
    const k = tex + Math.round(w) + 'x' + Math.round(h);
    if (!wallMat.has(k)) wallMat.set(k, new THREE.MeshStandardMaterial({ map: texture(tex, { repeat: [Math.max(1, Math.round(w / 2.4)), Math.max(1, Math.round(h / 2.6))] }), color: 0xb7c2bf, roughness: 0.85, metalness: 0 }));
    return wallMat.get(k);
  };
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 1 });

  function box(x0, x1, z0, z1, { h = H, y = 0, mat = null, collide = true, ray = true, tex } = {}) {
    const w = Math.abs(x1 - x0), d = Math.abs(z1 - z0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || matFor(Math.max(w, d), h, tex));
    m.position.set((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2);
    root.add(m); if (ray) rayMeshes.push(m);
    if (collide) colliders.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) });
    return m;
  }
  // a wall along x = at (axis 'x') or z = at (axis 'z') from a to b, minus the openings [[from, to], ...]
  function wallRun(axis, at, a, b, cuts, opts) {
    const list = cuts.slice().sort((p, q) => p[0] - q[0]);
    let s = a;
    const seg = (p, q) => { if (q - p < 0.01) return; if (axis === 'x') box(at - T / 2, at + T / 2, p, q, opts); else box(p, q, at - T / 2, at + T / 2, opts); };
    for (const [f, t] of list) { seg(s, f); s = t; }
    seg(s, b);
  }

  // ---- floors, ceilings, light panels ----
  for (const R of ROOMS) {
    const h = R.h || H, w = R.x[1] - R.x[0], d = R.z[1] - R.z[0];
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: texture(R.floor, { repeat: [w / 2.2, d / 2.2] }), color: 0x9aa39f, roughness: 0.55, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set((R.x[0] + R.x[1]) / 2, 0, (R.z[0] + R.z[1]) / 2);
    root.add(floor); rayMeshes.push(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: texture('wall_maintenance.webp', { repeat: [w / 3, d / 3] }), color: 0x8a9294, roughness: 0.95 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(floor.position.x, h, floor.position.z); root.add(ceil);
    const xs = R.corridor ? [(R.x[0] + R.x[1]) / 2] : [R.x[0] + w * 0.2, (R.x[0] + R.x[1]) / 2, R.x[1] - w * 0.2];
    for (let z = R.z[1] - 2.5; z > R.z[0] + 1; z -= 4.5) for (const x of xs) {
      const dead = Math.random() < 0.3;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), new THREE.MeshBasicMaterial({ color: dead ? 0x1d2224 : 0xdfeef0 }));
      m.rotation.x = Math.PI / 2; m.position.set(x, h - 0.01, z); root.add(m);
      if (!dead && Math.random() < 0.3) flick.push({ m, base: new THREE.Color(0xdfeef0), seed: Math.random() * 100 });
    }
  }

  // ---- walls ----
  const gapCuts = (room, side) => GAPS.filter(g => g.room === room && g.side === side).map(g => [g.at - GAP_W / 2, g.at + GAP_W / 2]);
  for (let i = 0; i < ROOMS.length; i++) {
    const R = ROOMS[i], h = R.h || H, prev = ROOMS[i - 1], next = ROOMS[i + 1];
    if (R.corridor) {
      wallRun('x', R.x[0], R.z[0], R.z[1], [], { h, tex: 'wall_maintenance.webp' });
      wallRun('x', R.x[1], R.z[0], R.z[1], [], { h, tex: 'wall_maintenance.webp' });
      continue;
    }
    // south (z1) and north (z0) walls, cut where a corridor joins
    const sCuts = [...gapCuts(i, 's')], nCuts = [...gapCuts(i, 'n')];
    if (prev?.corridor) sCuts.push([prev.x[0], prev.x[1]]);
    if (next?.corridor) nCuts.push([next.x[0], next.x[1]]);
    wallRun('z', R.z[1], R.x[0] - T / 2, R.x[1] + T / 2, sCuts, { h });
    wallRun('z', R.z[0], R.x[0] - T / 2, R.x[1] + T / 2, nCuts, { h });
    wallRun('x', R.x[0], R.z[0], R.z[1], gapCuts(i, 'w'), { h });
    wallRun('x', R.x[1], R.z[0], R.z[1], gapCuts(i, 'e'), { h });
    // the wall above a corridor opening (the corridor is lower than the floor)
    for (const [z, C] of [[R.z[1], prev], [R.z[0], next]]) if (C?.corridor) box(C.x[0], C.x[1], z - T / 2, z + T / 2, { h: h - (C.h || 3), y: C.h || 3, collide: false });
  }

  // ---- side doorways: a dark void behind each (spawn inside, entry a step into the room) ----
  const spawns = ROOMS.map(() => []);
  for (const G of GAPS) {
    const R = ROOMS[G.room], h = R.h || H;
    const a = G.at - GAP_W / 2, b = G.at + GAP_W / 2;
    let sx, sz, ex, ez;
    if (G.side === 'w' || G.side === 'e') {
      const x0 = G.side === 'w' ? R.x[0] : R.x[1], dir = G.side === 'w' ? -1 : 1, x1 = x0 + dir * VOID;
      box(Math.min(x0, x1), Math.max(x0, x1), a - 0.6 - T, a - 0.6, { mat: darkMat, h });
      box(Math.min(x0, x1), Math.max(x0, x1), b + 0.6, b + 0.6 + T, { mat: darkMat, h });
      box(x1 - T / 2, x1 + T / 2, a - 0.6, b + 0.6, { mat: darkMat, h });
      const vf = new THREE.Mesh(new THREE.PlaneGeometry(VOID, GAP_W + 1.2), darkMat); vf.rotation.x = -Math.PI / 2; vf.position.set((x0 + x1) / 2, 0.002, G.at); root.add(vf);
      box(x0 - T / 2, x0 + T / 2, a, b, { h: h - 2.5, y: 2.5, collide: false });                       // lintel
      colliders.push({ minX: x0 - 0.2, maxX: x0 + 0.2, minZ: a, maxZ: b, playerOnly: true });
      sx = x0 + dir * (VOID - 0.9); sz = G.at; ex = x0 - dir * 1.2; ez = G.at;
    } else {
      const z0 = G.side === 'n' ? R.z[0] : R.z[1], dir = G.side === 'n' ? -1 : 1, z1 = z0 + dir * VOID;
      box(a - 0.6 - T, a - 0.6, Math.min(z0, z1), Math.max(z0, z1), { mat: darkMat, h });
      box(b + 0.6, b + 0.6 + T, Math.min(z0, z1), Math.max(z0, z1), { mat: darkMat, h });
      box(a - 0.6, b + 0.6, z1 - T / 2, z1 + T / 2, { mat: darkMat, h });
      const vf = new THREE.Mesh(new THREE.PlaneGeometry(GAP_W + 1.2, VOID), darkMat); vf.rotation.x = -Math.PI / 2; vf.position.set(G.at, 0.002, (z0 + z1) / 2); root.add(vf);
      box(a, b, z0 - T / 2, z0 + T / 2, { h: h - 2.5, y: 2.5, collide: false });
      colliders.push({ minX: a, maxX: b, minZ: z0 - 0.2, maxZ: z0 + 0.2, playerOnly: true });
      sx = G.at; sz = z0 + dir * (VOID - 0.9); ex = G.at; ez = z0 - dir * 1.2;
    }
    spawns[G.room].push({ spawn: new THREE.Vector3(sx, 0, sz), entry: new THREE.Vector3(ex, 0, ez), gap: G });
  }

  // ---- pillars (cover on the open floors) ----
  const PILLARS = [[-6, -7], [6, -7], [-6, -13], [6, -13], [-5, -35], [5, -35], [-5, -42], [5, -42], [-8, -66], [8, -66], [-8, -74], [8, -74], [0, -70]];
  for (const [x, z] of PILLARS) {
    const p = box(x - 0.4, x + 0.4, z - 0.4, z + 0.4, { h: z < -57 ? 4.2 : H });
    p.material = matFor(1, 3, 'wall_clinical.webp');
  }

  // ---- swing doors ----
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x3c5a52, roughness: 0.6, metalness: 0.15 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd6d0, emissive: 0x2a4a46, emissiveIntensity: 0.6, roughness: 0.2, transparent: true, opacity: 0.55 });
  const barMat = new THREE.MeshStandardMaterial({ color: 0xb8b8b0, metalness: 0.8, roughness: 0.35 });
  const doors = DOORS.map((D, i) => {
    const leaves = [];
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(D.x + side * D.w / 2, 0, D.z); root.add(hinge);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(D.w / 2 - 0.04, 2.6, 0.07), doorMat); leaf.position.set(-side * (D.w / 4), 1.3, 0); hinge.add(leaf);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.6), glassMat); win.position.set(-side * (D.w / 4), 1.75, 0.04); hinge.add(win);
      const win2 = win.clone(); win2.position.z = -0.04; win2.rotation.y = Math.PI; hinge.add(win2);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(D.w / 2 - 0.4, 0.06, 0.06), barMat); bar.position.set(-side * (D.w / 4), 1.05, 0.08); hinge.add(bar);
      rayMeshes.push(leaf); leaves.push({ hinge, side, leaf });
    }
    const col = { minX: D.x - D.w / 2, maxX: D.x + D.w / 2, minZ: D.z - 0.12, maxZ: D.z + 0.12, door: i };
    colliders.push(col);
    let t = -1;
    return {
      ...D,
      open() { if (t < 0) { t = 0; const k = colliders.indexOf(col); if (k >= 0) colliders.splice(k, 1); for (const L of leaves) { const r = rayMeshes.indexOf(L.leaf); if (r >= 0) rayMeshes.splice(r, 1); } nav.dirty = true; } },
      get isOpen() { return t >= 0; },
      update(dt) { if (t < 0 || t >= 1) return; t = Math.min(1, t + dt / 0.7); const e = 1 - Math.pow(1 - t, 3); for (const L of leaves) L.hinge.rotation.y = L.side * e * 1.75; },
    };
  });

  // ---- lights: a hemisphere, and a pool of point lights moved onto the nearest lamps (a fixed light count: no shader
  // recompiles as you walk, and a phone only ever lights a handful) ----
  root.add(new THREE.HemisphereLight(0x9fb4c0, 0x1a1210, lowPower ? 0.42 : 0.34));
  const pool = [];
  for (let i = 0; i < POOL; i++) { const l = new THREE.PointLight(0xffffff, 0, 16, 1.6); root.add(l); pool.push({ l, lamp: null, k: 0 }); }
  for (const L of LAMPS) L.seed = Math.random() * 100;

  // ---- props (hospital kit): cover and dressing ----
  async function put(name, x, z, ry = 0, { s = 1, y = 0, collide = true, pad = 0.02 } = {}) {
    try {
      const o = await prop(name);
      const holder = new THREE.Group(); holder.add(o);
      o.updateMatrixWorld(true);
      const b0 = new THREE.Box3().setFromObject(o), c = b0.getCenter(new THREE.Vector3());
      o.position.x -= c.x; o.position.z -= c.z; o.position.y -= b0.min.y;
      holder.scale.setScalar(s); holder.position.set(x, y, z); holder.rotation.y = ry;
      root.add(holder); holder.updateMatrixWorld(true);
      holder.traverse(m => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
      const b = new THREE.Box3().setFromObject(holder);
      if (collide) { colliders.push({ minX: b.min.x - pad, maxX: b.max.x + pad, minZ: b.min.z - pad, maxZ: b.max.z + pad, prop: name }); holder.traverse(m => { if (m.isMesh) rayMeshes.push(m); }); }
      return holder;
    } catch (e) { console.warn('[fps] prop failed', name, e); return null; }
  }
  const P = Math.PI;
  await Promise.all([
    // ER lobby: the round desk in the middle, waiting rows, kiosks, vending, an abandoned wheelchair and stretcher
    put('round_reception_desk', 0, -9.5, 0),
    put('waiting_chair_section', -9, -2.5, P / 2), put('waiting_chair_section', -9, -9, P / 2), put('waiting_chair_section', 9.5, -8.5, -P / 2),
    put('waiting_chair_section', 3.5, -1.2, P), put('cafeteria_vending_machine', 11.4, -16.5, -P / 2), put('water_cooler', -11.4, -16.6, P / 2),
    put('check_in_kiosk', -3.5, -16.8, 0), put('check_in_kiosk', 3.5, -16.8, 0), put('floor_planter', -11.3, -0.7, 0), put('floor_planter', 11.3, -0.7, 0),
    put('wheelchair', 4.5, -5, 0.7), put('procedure_stretcher', -4, -14.5, 1.2), put('wet_floor_sign', -2, -5, 0.4, { collide: false }),
    put('lobby_t2_wayfinding', 0, -17.75, 0, { collide: false }), put('sawhorse_barrier', 8, -15.5, 0.3),
    // corridor A
    put('iv_stand', -1.5, -20, 0, { collide: false }), put('fire_extinguisher', 1.75, -24, -P / 2, { collide: false }), put('mop_bucket', 1.2, -21.5, 0, { collide: false }),
    // the ward: two rows of beds with screens, a nurse station island in the middle
    put('recovery_bed', -11.8, -30.5, P / 2), put('recovery_bed', -11.8, -36.5, P / 2), put('recovery_bed', -11.8, -40.5, P / 2), put('recovery_bed_open_nx', -11.8, -47, P / 2),
    put('recovery_bed', 11.8, -30, -P / 2), put('recovery_bed', 11.8, -36.5, -P / 2), put('recovery_bed_open_nx', 11.8, -40.5, -P / 2), put('recovery_bed', 11.8, -47.2, -P / 2),
    put('privacy_screen', -9.2, -33.5, 0), put('privacy_screen', 9.2, -33.6, 0), put('privacy_screen', -9.2, -43.8, 0.2),
    put('team_desk', 0, -38.5, 0), put('team_desk', 0, -40.2, P), put('patient_monitor', -12.4, -34, P / 2), put('iv_stand', -9.6, -38.6, 0, { collide: false }),
    put('supply_cart', 3.2, -30.5, 0.4), put('medical_gas_cylinder', 12.4, -28.3, 0), put('linen_cabinet', -12.4, -28.4, P / 2), put('janitor_cart', -3.5, -46.5, 0.6),
    // corridor B
    put('biohazard_bin', 1.6, -55.8, 0), put('sign_maintenance', -1.83, -53.5, P / 2, { y: 1.6, collide: false }),
    // the atrium cafeteria: counter, vending, tables (team desks) with chairs, planters
    put('coffee_counter', 0, -80.6, 0), put('coffee_machine', -1.8, -80.9, 0, { collide: false }), put('cafeteria_vending_machine', -13.4, -60.5, P / 2), put('cafeteria_vending_machine', 13.4, -60.5, -P / 2),
    put('team_desk', -4, -63.5, 0), put('team_desk', 4, -63.5, 0), put('team_desk', -4, -69.5, 0.2), put('team_desk', 4, -70.5, -0.15), put('team_desk', -3.5, -76, 0), put('team_desk', 4, -76.5, 0.1),
    put('visitor_chair', -4.6, -62.5, P), put('visitor_chair', 4.4, -64.6, 0), put('visitor_chair', -3, -70.6, 0.3), put('visitor_chair', 4.8, -77.6, 0),
    put('floor_planter', -13.3, -81.3, 0), put('floor_planter', 13.3, -81.3, 0), put('floor_planter', -10.5, -70, 0), put('floor_planter', 10.5, -70, 0),
    put('ceiling_collapse', 9.5, -79.3, 0.5),
  ]);

  // ---- the flow field: every 0.5 m cell's walking distance to the target (the player), zombies walk downhill ----
  const nav = (() => {
    const X0 = -18, X1 = 18, Z0 = -86, Z1 = 3, S = 0.5, NX = Math.ceil((X1 - X0) / S), NZ = Math.ceil((Z1 - Z0) / S);
    const blocked = new Uint8Array(NX * NZ), dist = new Float32Array(NX * NZ), queue = new Int32Array(NX * NZ);
    const api = { dirty: true, NX, NZ };
    const idx = (x, z) => { const i = Math.floor((x - X0) / S), k = Math.floor((z - Z0) / S); return i < 0 || k < 0 || i >= NX || k >= NZ ? -1 : k * NX + i; };
    function rebuild() {
      blocked.fill(1);
      // walkable: inside a room or a void
      const open = (x, z) => ROOMS.some(R => x > R.x[0] && x < R.x[1] && z > R.z[0] && z < R.z[1]) || spawns.some(l => l.some(sp => {
        const G = sp.gap; return Math.abs((G.side === 'w' || G.side === 'e' ? z : x) - G.at) < GAP_W / 2 + 0.5 && (G.side === 'w' || G.side === 'e' ? Math.abs(x - sp.spawn.x) < VOID : Math.abs(z - sp.spawn.z) < VOID);
      }));
      const r = 0.28;
      for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
        const x = X0 + (i + 0.5) * S, z = Z0 + (k + 0.5) * S;
        if (!open(x, z)) continue;
        let hit = false;
        for (const c of colliders) { if (c.playerOnly) continue; if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) { hit = true; break; } }
        blocked[k * NX + i] = hit ? 1 : 0;
      }
      api.dirty = false;
    }
    let tgt = -1;
    api.update = (target) => {
      if (api.dirty) rebuild();
      let t = idx(target.x, target.z); if (t < 0) return;
      if (blocked[t]) { // the player's cell reads blocked (hugging a prop): use the nearest open neighbour
        for (let r = 1; r < 4 && blocked[t]; r++) for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) { const j = t + dk * NX + di; if (j >= 0 && j < blocked.length && !blocked[j]) { t = j; dk = di = 99; } }
      }
      tgt = t; dist.fill(1e9); dist[t] = 0; let h = 0, n = 0; queue[n++] = t;
      while (h < n) {
        const c = queue[h++], ci = c % NX, d = dist[c] + 1;
        if (ci > 0 && !blocked[c - 1] && dist[c - 1] > d) { dist[c - 1] = d; queue[n++] = c - 1; }
        if (ci < NX - 1 && !blocked[c + 1] && dist[c + 1] > d) { dist[c + 1] = d; queue[n++] = c + 1; }
        if (c >= NX && !blocked[c - NX] && dist[c - NX] > d) { dist[c - NX] = d; queue[n++] = c - NX; }
        if (c < blocked.length - NX && !blocked[c + NX] && dist[c + NX] > d) { dist[c + NX] = d; queue[n++] = c + NX; }
      }
    };
    /** Direction (unit, xz) to walk from pos toward the target, or null if it can't be reached / is right there. */
    api.dir = (pos, out) => {
      const c = idx(pos.x, pos.z); if (c < 0 || dist[c] >= 1e9) return null;
      const ci = c % NX, ck = (c - ci) / NX; let best = dist[c], bi = 0, bk = 0;
      for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
        if (!di && !dk) continue; const i = ci + di, k = ck + dk; if (i < 0 || k < 0 || i >= NX || k >= NZ) continue;
        const j = k * NX + i; if (blocked[j]) continue;
        if (di && dk && (blocked[ck * NX + i] || blocked[k * NX + ci])) continue;   // no cutting corners
        const v = dist[j] + (di && dk ? 0.42 : 0); if (v < best) { best = v; bi = di; bk = dk; }
      }
      if (!bi && !bk) return null;
      return out.set(bi, 0, bk).normalize();
    };
    api.steps = (pos) => { const c = idx(pos.x, pos.z); return c < 0 ? 1e9 : dist[c]; };
    return api;
  })();

  function roomOf(x, z) { for (let i = 0; i < ROOMS.length; i++) { const R = ROOMS[i]; if (z <= R.z[1] + 0.01 && z > R.z[0]) return i; } return z > 0 ? 0 : ROOMS.length - 1; }

  const _p = new THREE.Vector3();
  function update(dt, t, player) {
    // light pool: the lamps nearest the player
    if (player) {
      const want = LAMPS.map(L => ({ L, d: Math.hypot(L.x - player.x, L.z - player.z) })).sort((a, b) => a.d - b.d).slice(0, POOL).map(o => o.L);
      for (const p of pool) if (p.lamp && !want.includes(p.lamp)) p.lamp = null;
      for (const L of want) if (!pool.some(p => p.lamp === L)) { const p = pool.find(q => !q.lamp); if (p) { p.lamp = L; p.k = 0; p.l.position.set(L.x, (ROOMS[roomOf(L.x, L.z)].h || H) - 0.35, L.z); p.l.color.setHex(L.c); p.l.distance = L.dist || 16; } }
    }
    for (const p of pool) {
      const L = p.lamp; p.k = Math.min(1, p.k + dt * 2);
      if (!L) { p.l.intensity = 0; continue; }
      let k = 1;
      if (L.flicker) { const n = Math.sin(t * 23 + L.seed) * Math.sin(t * 7.3 + L.seed * 2); k = n > 0.92 ? 0.15 : 1 - L.flicker * 0.08 * Math.random(); }
      if (L.pulse) k = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 3.1), 2);
      p.l.intensity = L.i * k * p.k;
    }
    for (const F of flick) { const n = Math.sin(t * 17 + F.seed) * Math.sin(t * 5.1 + F.seed); F.m.material.color.copy(F.base).multiplyScalar(n > 0.85 ? 0.12 : 1); }
    for (const D of doors) D.update(dt);
  }

  return { root, colliders, rayMeshes, rooms: ROOMS, doors, spawns, roomOf, update, nav, H, start: new THREE.Vector3(0, 0, -2.5) };
}

// ---- 2D collision: push a circle out of the boxes ----
export function collideCircle(p, r, colliders, { player = false } = {}) {
  for (let pass = 0; pass < 2; pass++) for (const c of colliders) {
    if (c.playerOnly && !player) continue;
    const cx = Math.max(c.minX, Math.min(p.x, c.maxX)), cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
    else {
      const l = p.x - c.minX, rr = c.maxX - p.x, b = p.z - c.minZ, f = c.maxZ - p.z, m = Math.min(l, rr, b, f);
      if (m === l) p.x = c.minX - r; else if (m === rr) p.x = c.maxX + r; else if (m === b) p.z = c.minZ - r; else p.z = c.maxZ + r;
    }
  }
  return p;
}
