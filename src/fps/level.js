// The FPS slice's hospital: three rooms in a line along -z (ER lobby -> corridor -> ward), blockout walls with the
// deckbuilder's clinical wall / floor textures, hospital-kit props, dim lights and an emergency red in the corridor.
// Zombies come in through dark side doorways (voids behind sawhorses the player can't pass). Two swing doors open when a
// room is cleared. Collision is 2D: axis-aligned boxes on the floor plan (walls, props, doors).
//   const level = await buildLevel(scene)
//   level.colliders   [{ minX, maxX, minZ, maxZ, playerOnly?, door? }]
//   level.rooms / level.roomOf(x, z) / level.spawns[room] / level.doors[i].open() / level.update(dt, t)
//   level.rayMeshes   meshes bullets stop on
import * as THREE from 'three';
import { prop, texture } from '../render/assets.js';

const H = 3.1;     // ceiling height
const T = 0.3;     // wall thickness

// rooms: x and z ranges (z goes negative ahead)
export const ROOMS = [
  { name: 'ER Lobby', x: [-7, 7], z: [-12, 0], floor: 'floor_clinical.webp' },
  { name: 'Corridor', x: [-1.6, 1.6], z: [-26, -12], floor: 'floor_corridor.webp' },
  { name: 'Ward', x: [-7, 7], z: [-38, -26], floor: 'floor_clinical.webp' },
];
// doors between room i and i+1 (centre)
export const DOORS = [{ z: -12, x: 0, w: 3.2 }, { z: -26, x: 0, w: 3.2 }];

// side doorways zombies come through: the gap in the wall, a dark void behind it, the spawn point in the void and the
// entry point a step inside the room
const GAPS = [
  { room: 0, wall: 'x', at: -7, from: -6.2, to: -4.2, dir: -1 },
  { room: 0, wall: 'x', at: 7, from: -9.6, to: -7.6, dir: 1 },
  { room: 0, wall: 'x', at: 7, from: -3.6, to: -1.8, dir: 1 },
  { room: 1, wall: 'x', at: 1.6, from: -20, to: -18.2, dir: 1 },
  { room: 1, wall: 'x', at: -1.6, from: -24.6, to: -22.8, dir: -1 },
  { room: 2, wall: 'z', at: -38, from: -5.2, to: -3.4, dir: -1 },
  { room: 2, wall: 'z', at: -38, from: 3.4, to: 5.2, dir: -1 },
  { room: 2, wall: 'x', at: -7, from: -33, to: -31.2, dir: -1 },
  { room: 2, wall: 'x', at: 7, from: -30.6, to: -28.8, dir: 1 },
];

export async function buildLevel(scene, { lowPower = false } = {}) {
  const root = new THREE.Group(); root.name = 'level'; scene.add(root);
  const colliders = [], rayMeshes = [], flick = [];
  const wallTex = (w, h) => texture('wall_clinical.webp', { repeat: [Math.max(1, Math.round(w / 2.4)), Math.max(1, Math.round(h / 2.6))] });
  const wallMat = new Map();
  const matFor = (w, h) => {
    const k = Math.round(w) + 'x' + Math.round(h);
    if (!wallMat.has(k)) wallMat.set(k, new THREE.MeshStandardMaterial({ map: wallTex(w, h), color: 0xb7c2bf, roughness: 0.85, metalness: 0 }));
    return wallMat.get(k);
  };
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 1 });

  // a wall box from (x0,z0) to (x1,z1) on the floor plan
  function wall(x0, x1, z0, z1, { h = H, mat = null, collide = true, ray = true } = {}) {
    const w = Math.abs(x1 - x0), d = Math.abs(z1 - z0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || matFor(Math.max(w, d), h));
    m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2); m.receiveShadow = true;
    root.add(m); if (ray) rayMeshes.push(m);
    if (collide) colliders.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1) });
    return m;
  }
  // a run of wall along x = const (or z = const) from a to b, leaving out the given gaps [[from, to], ...]
  function wallRun(axis, at, a, b, gaps = [], opts) {
    const cuts = gaps.slice().sort((p, q) => p[0] - q[0]);
    let s = a;
    const seg = (p, q) => { if (q - p < 0.01) return; if (axis === 'x') wall(at - T / 2, at + T / 2, p, q, opts); else wall(p, q, at - T / 2, at + T / 2, opts); };
    for (const [f, t] of cuts) { seg(s, f); s = t; }
    seg(s, b);
  }

  // ---- floors and ceilings ----
  for (const R of ROOMS) {
    const w = R.x[1] - R.x[0], d = R.z[1] - R.z[0];
    const ft = texture(R.floor, { repeat: [w / 2.2, d / 2.2] });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: ft, color: 0x9aa39f, roughness: 0.55, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set((R.x[0] + R.x[1]) / 2, 0, (R.z[0] + R.z[1]) / 2); floor.receiveShadow = true;
    root.add(floor); rayMeshes.push(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: texture('wall_maintenance.webp', { repeat: [w / 3, d / 3] }), color: 0x8a9294, roughness: 0.95 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(floor.position.x, H, floor.position.z);
    root.add(ceil);
    // ceiling light panels (emissive; a few flicker)
    for (let z = R.z[1] - 2.5; z > R.z[0] + 1; z -= 4) for (const x of w > 4 ? [R.x[0] + w * 0.28, R.x[1] - w * 0.28] : [(R.x[0] + R.x[1]) / 2]) {
      const dead = Math.random() < 0.3;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), new THREE.MeshBasicMaterial({ color: dead ? 0x1d2224 : 0xdfeef0, toneMapped: true }));
      m.rotation.x = Math.PI / 2; m.position.set(x, H - 0.01, z); root.add(m);
      if (!dead && Math.random() < 0.35) flick.push({ m, base: new THREE.Color(0xdfeef0), seed: Math.random() * 100 });
    }
  }
  // the void floors behind the side doorways (dark)
  // ---- walls ----
  const gapsOn = (room, wallAxis, at) => GAPS.filter(g => g.room === room && g.wall === wallAxis && g.at === at).map(g => [g.from, g.to]);
  // lobby
  wallRun('z', 0, -7 - T / 2, 7 + T / 2);
  wallRun('x', -7, -12, 0, gapsOn(0, 'x', -7));
  wallRun('x', 7, -12, 0, gapsOn(0, 'x', 7));
  wallRun('z', -12, -7 - T / 2, 7 + T / 2, [[-1.6, 1.6]]);
  // corridor
  wallRun('x', -1.6, -26, -12, gapsOn(1, 'x', -1.6));
  wallRun('x', 1.6, -26, -12, gapsOn(1, 'x', 1.6));
  // ward
  wallRun('z', -26, -7 - T / 2, 7 + T / 2, [[-1.6, 1.6]]);
  wallRun('z', -38, -7 - T / 2, 7 + T / 2, gapsOn(2, 'z', -38));
  wallRun('x', -7, -38, -26, gapsOn(2, 'x', -7));
  wallRun('x', 7, -38, -26, gapsOn(2, 'x', 7));
  // a lintel over every opening (door frames read better)
  for (const D of DOORS) wall(D.x - D.w / 2, D.x + D.w / 2, D.z - T / 2, D.z + T / 2, { h: 0.6, collide: false }).position.y = H - 0.3;

  // the voids: a dark closet behind each side doorway; spawn inside, entry a step into the room
  const spawns = ROOMS.map(() => []);
  for (const G of GAPS) {
    const mid = (G.from + G.to) / 2, depth = 2.6;
    let sx, sz, ex, ez;
    if (G.wall === 'x') {
      const x0 = G.at, x1 = G.at + G.dir * depth;
      wall(Math.min(x0, x1), Math.max(x0, x1), G.from - 0.8 - T, G.from - 0.8, { mat: darkMat });
      wall(Math.min(x0, x1), Math.max(x0, x1), G.to + 0.8, G.to + 0.8 + T, { mat: darkMat });
      wall(x1 - T / 2, x1 + T / 2, G.from - 0.8, G.to + 0.8, { mat: darkMat });
      const vf = new THREE.Mesh(new THREE.PlaneGeometry(depth, G.to - G.from + 1.6), darkMat); vf.rotation.x = -Math.PI / 2; vf.position.set((x0 + x1) / 2, 0.002, mid); root.add(vf);
      const vc = vf.clone(); vc.position.y = H; vc.rotation.x = Math.PI / 2; root.add(vc);
      sx = G.at + G.dir * (depth - 0.8); sz = mid; ex = G.at - G.dir * 1.1; ez = mid;
      colliders.push({ minX: G.at - 0.2, maxX: G.at + 0.2, minZ: G.from, maxZ: G.to, playerOnly: true });
    } else {
      const z0 = G.at, z1 = G.at + G.dir * depth;
      wall(G.from - 0.8 - T, G.from - 0.8, Math.min(z0, z1), Math.max(z0, z1), { mat: darkMat });
      wall(G.to + 0.8, G.to + 0.8 + T, Math.min(z0, z1), Math.max(z0, z1), { mat: darkMat });
      wall(G.from - 0.8, G.to + 0.8, z1 - T / 2, z1 + T / 2, { mat: darkMat });
      const vf = new THREE.Mesh(new THREE.PlaneGeometry(G.to - G.from + 1.6, depth), darkMat); vf.rotation.x = -Math.PI / 2; vf.position.set(mid, 0.002, (z0 + z1) / 2); root.add(vf);
      const vc = vf.clone(); vc.position.y = H; vc.rotation.x = Math.PI / 2; root.add(vc);
      sx = mid; sz = G.at + G.dir * (depth - 0.8); ex = mid; ez = G.at - G.dir * 1.1;
      colliders.push({ minX: G.from, maxX: G.to, minZ: G.at - 0.2, maxZ: G.at + 0.2, playerOnly: true });
    }
    // lintel over the gap
    if (G.wall === 'x') wall(G.at - T / 2, G.at + T / 2, G.from, G.to, { h: 0.7, collide: false }).position.y = H - 0.35;
    else wall(G.from, G.to, G.at - T / 2, G.at + T / 2, { h: 0.7, collide: false }).position.y = H - 0.35;
    spawns[G.room].push({ spawn: new THREE.Vector3(sx, 0, sz), entry: new THREE.Vector3(ex, 0, ez), gap: G });
  }

  // ---- swing doors between rooms ----
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x3c5a52, roughness: 0.6, metalness: 0.15 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd6d0, emissive: 0x2a4a46, emissiveIntensity: 0.6, roughness: 0.2, transparent: true, opacity: 0.55 });
  const barMat = new THREE.MeshStandardMaterial({ color: 0xb8b8b0, metalness: 0.8, roughness: 0.35 });
  const doors = DOORS.map((D, i) => {
    const leaves = [];
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(D.x + side * D.w / 2, 0, D.z); root.add(hinge);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(D.w / 2 - 0.04, 2.45, 0.07), doorMat);
      leaf.position.set(-side * (D.w / 4), 1.225, 0); hinge.add(leaf);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.55), glassMat); win.position.set(-side * (D.w / 4), 1.65, 0.04); hinge.add(win);
      const win2 = win.clone(); win2.position.z = -0.04; win2.rotation.y = Math.PI; hinge.add(win2);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(D.w / 2 - 0.4, 0.06, 0.06), barMat); bar.position.set(-side * (D.w / 4), 1.05, 0.08); hinge.add(bar);
      rayMeshes.push(leaf);
      leaves.push({ hinge, side });
    }
    const col = { minX: D.x - D.w / 2, maxX: D.x + D.w / 2, minZ: D.z - 0.12, maxZ: D.z + 0.12, door: i };
    colliders.push(col);
    let t = -1;
    return {
      ...D, leaves, open() { if (t < 0) { t = 0; const k = colliders.indexOf(col); if (k >= 0) colliders.splice(k, 1); } },
      get isOpen() { return t >= 0; },
      update(dt) { if (t < 0 || t >= 1) return; t = Math.min(1, t + dt / 0.7); const e = 1 - Math.pow(1 - t, 3); for (const L of leaves) L.hinge.rotation.y = L.side * e * 1.75; },
    };
  });

  // ---- lights ----
  const lights = [];
  const amb = new THREE.HemisphereLight(0x9fb4c0, 0x1a1210, lowPower ? 0.42 : 0.34); root.add(amb);
  function lamp(x, y, z, color, intensity, { flicker = 0, pulse = 0, dist = 14 } = {}) {
    const l = new THREE.PointLight(color, intensity, dist, 1.6); l.position.set(x, y, z); root.add(l);
    lights.push({ l, base: intensity, flicker, pulse, seed: Math.random() * 100 });
    return l;
  }
  lamp(-2.5, 2.8, -4, 0xd6e6ff, 9);
  lamp(3.5, 2.8, -9, 0xffd9a8, 7, { flicker: 1 });
  lamp(0, 2.6, -19, 0xff2a1a, 9, { pulse: 1, dist: 12 });
  lamp(-3, 2.8, -31, 0xbfe8d8, 7, { flicker: 0.6 });
  lamp(3.5, 2.8, -35.5, 0xffc9a0, 6);

  // ---- props (hospital kit) ----
  const placed = [];
  async function put(name, x, z, ry = 0, { s = 1, y = 0, collide = true, pad = 0.02, maxH = 0 } = {}) {
    try {
      const o = await prop(name);
      const holder = new THREE.Group(); holder.add(o);
      o.updateMatrixWorld(true);
      const b0 = new THREE.Box3().setFromObject(o);
      // centre on the footprint, feet on the floor
      const c = b0.getCenter(new THREE.Vector3());
      o.position.x -= c.x; o.position.z -= c.z; o.position.y -= b0.min.y;
      let k = s;
      if (maxH && (b0.max.y - b0.min.y) * k > maxH) k = maxH / (b0.max.y - b0.min.y);
      holder.scale.setScalar(k);
      holder.position.set(x, y, z); holder.rotation.y = ry;
      root.add(holder); holder.updateMatrixWorld(true);
      holder.traverse(m => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; if (m.material?.metalness > 0.6 && !m.material.metalnessMap) m.material.metalness = 0.5; } });
      const b = new THREE.Box3().setFromObject(holder);
      if (collide) {
        colliders.push({ minX: b.min.x - pad, maxX: b.max.x + pad, minZ: b.min.z - pad, maxZ: b.max.z + pad, prop: name });
        holder.traverse(m => { if (m.isMesh) rayMeshes.push(m); });
      }
      placed.push({ name, holder, box: b });
      return holder;
    } catch (e) { console.warn('[fps] prop failed', name, e); return null; }
  }
  const P = Math.PI;
  await Promise.all([
    // lobby: the front desk, waiting chairs, a kiosk, vending, plants, a wheelchair left in the way
    put('round_reception_desk', -3.8, -8.6, P / 2),
    put('waiting_chair_section', 4.8, -1.2, P),
    put('waiting_chair_section', 6.3, -5.2, -P / 2),
    put('waiting_chair_section', -6.3, -1.8, P / 2),
    put('cafeteria_vending_machine', 6.4, -11.2, -P / 2),
    put('water_cooler', -6.5, -10.9, P / 2),
    put('floor_planter', -6.4, -0.6, 0),
    put('floor_planter', 2.2, -11.4, 0),
    put('check_in_kiosk', -2.3, -11.4, 0),
    put('wheelchair', 2.6, -5.6, 0.7),
    put('wet_floor_sign', -0.6, -7.2, 0.4, { collide: false }),
    put('lobby_t2_wayfinding', 0, -11.75, 0, { collide: false }),
    // corridor: a stretcher and carts along the walls
    put('procedure_stretcher', -1.0, -15.2, 0),
    put('janitor_cart', 1.05, -22.4, P),
    put('mop_bucket', 0.6, -21.4, 0, { collide: false }),
    put('iv_stand', -1.2, -17.6, 0, { collide: false }),
    put('biohazard_bin', -1.25, -25.3, 0),
    put('fire_extinguisher', 1.35, -13.2, -P / 2, { collide: false }),
    put('sign_elevator', -1.43, -20.5, P / 2, { y: 1.6, collide: false }),
    // ward: beds along both walls, monitors, a privacy screen, a supply cart
    put('recovery_bed', -5.7, -28.6, P / 2),
    put('recovery_bed', -5.7, -35.4, P / 2),
    put('recovery_bed', 5.7, -32.6, -P / 2),
    put('recovery_bed_open_nx', 5.7, -36.4, -P / 2),
    put('patient_monitor', -6.6, -30.4, P / 2),
    put('iv_stand', -4.4, -34.0, 0, { collide: false }),
    put('privacy_screen', -2.4, -29.4, 0.3),
    put('supply_cart', 2.6, -36.8, P),
    put('over_bed_table', 4.2, -34.2, -P / 2),
    put('medical_gas_cylinder', 6.6, -27.0, 0),
    put('bedside_cabinet', -6.5, -32.4, P / 2),
  ]);

  // ---- shooting through: what bullets stop on ----
  function roomOf(x, z) { return z > -12 ? 0 : z > -26 ? 1 : 2; }

  function update(dt, t) {
    for (const L of lights) {
      let k = 1;
      if (L.flicker) { const n = Math.sin(t * 23 + L.seed) * Math.sin(t * 7.3 + L.seed * 2); k = n > 0.92 ? 0.15 : 1 - L.flicker * 0.08 * Math.random(); }
      if (L.pulse) k = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 3.1), 2);
      L.l.intensity = L.base * k;
    }
    for (const F of flick) { const n = Math.sin(t * 17 + F.seed) * Math.sin(t * 5.1 + F.seed); F.m.material.color.copy(F.base).multiplyScalar(n > 0.85 ? 0.12 : 1); }
    for (const D of doors) D.update(dt);
  }

  return { root, colliders, rayMeshes, rooms: ROOMS, doors, spawns, roomOf, update, placed, H };
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
      // centre inside the box: out along the shallowest side
      const l = p.x - c.minX, rr = c.maxX - p.x, b = p.z - c.minZ, f = c.maxZ - p.z, m = Math.min(l, rr, b, f);
      if (m === l) p.x = c.minX - r; else if (m === rr) p.x = c.maxX + r; else if (m === b) p.z = c.minZ - r; else p.z = c.maxZ + r;
    }
  }
  return p;
}
