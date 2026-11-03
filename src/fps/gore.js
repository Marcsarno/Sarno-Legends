// Dismemberment for the FPS slice, ported from yola-zombie (render/clipchars.js ZombieView.sever / burstHead /
// cutByWeights; core/zombies.js limb HP): a shot can take a zombie's head, a forearm or a lower leg off.
//   - the modular zombies (nurse, modded patient, brute) are built in parts: the part's module (Nurse_Head,
//     Patient_LeftLowerLeg, Mod_Head__...) is baked in its current pose into a loose piece together with its wound cap
//     (GORE_<part>_Detached), the module is hidden and the stump's cap (GORE_<part>_Stump) is shown;
//   - the others are cut from their own skin weights (every triangle whose strongest bone is under the part's root
//     bone), the piece thrown and the bone collapsed into its joint;
//   - a head can instead burst (no piece: a spray of blood, flesh, skull and brain).
// Pieces fly along the shot, tumble, bounce and settle on the floor, bleed for a moment, and fade after a while.
import * as THREE from 'three';

const MODULE_NAMES = {
  Head: /^(Nurse_Head|Patient_Head)$/, Forearm_L: /^(Nurse_Forearm_L|Patient_LeftForearm)$/, Forearm_R: /^(Nurse_Forearm_R|Patient_RightForearm)$/,
  LowerLeg_L: /^(Nurse_LowerLeg_L|Patient_LeftLowerLeg)$/, LowerLeg_R: /^(Nurse_LowerLeg_R|Patient_RightLowerLeg)$/,
};
const MOD_PIECE = /^Mod_(Head|Forearm_L|Forearm_R|LowerLeg_L|LowerLeg_R)__/;
const GORE_NAME = /^GORE_(Head|Forearm_L|Forearm_R|LowerLeg_L|LowerLeg_R)_(Stump|Detached)/;
// a weight cut: [root bone of the piece, its far end, radius at 1.7 m], the bone the stump bleeds from
const CUT = {
  Head: ['Head', 'HeadTop_End', 0.1, 'Neck'], Forearm_L: ['LeftForeArm', 'LeftHand', 0.05, 'LeftArm'], Forearm_R: ['RightForeArm', 'RightHand', 0.05, 'RightArm'],
  LowerLeg_L: ['LeftLeg', 'LeftFoot', 0.06, 'LeftUpLeg'], LowerLeg_R: ['RightLeg', 'RightFoot', 0.06, 'RightUpLeg'],
};
const MAX_PIECES = 24;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

export function createGore(scene, fx) {
  const pieces = [];

  /** Index a zombie's modules and gore caps once (Zombie constructor). */
  function prepare(z) {
    z.modules = {}; z.goreCaps = {}; z.severed = new Set(); z.bleed = {};
    const groups = {};
    z.data.model.traverse(o => {
      for (const [k, re] of Object.entries(MODULE_NAMES)) if (re.test(o.name)) z.modules[k] = [o];
      const g = GORE_NAME.exec(o.name); if (g) (z.goreCaps[g[1]] ||= {})[g[2].toLowerCase()] = o;
      const m = MOD_PIECE.exec(o.name); if (m) (groups[m[1]] ||= []).push(o);
    });
    for (const [k, list] of Object.entries(groups)) z.modules[k] = list;
    for (const caps of Object.values(z.goreCaps)) { if (caps.stump) caps.stump.visible = false; if (caps.detached) caps.detached.visible = false; }
  }

  // bake skinned meshes (or the part of them weighted to a bone) in their current pose, centred on c
  function bake(meshes, c, rootBone = null) {
    const g = new THREE.Group();
    for (const o of meshes) o.traverse(m => {
      if (!m.isSkinnedMesh) return;
      m.skeleton.update(); m.updateMatrixWorld(true);
      const sg = m.geometry, n = sg.attributes.position.count;
      let keep = null;
      if (rootBone) {
        const inPart = m.skeleton.bones.map(b => { for (let x = b; x && x.isBone; x = x.parent) if (x === rootBone) return true; return false; });
        const si = sg.attributes.skinIndex, sw = sg.attributes.skinWeight; keep = new Uint8Array(n);
        for (let i = 0; i < n; i++) { let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } } keep[i] = inPart[bi] ? 1 : 0; }
      }
      const idx = sg.index ? sg.index.array : Array.from({ length: n }, (_, i) => i);
      const map = new Map(), pos = [], uv = [], index = [], uvs = sg.attributes.uv;
      for (let t = 0; t < idx.length; t += 3) {
        if (keep && !(keep[idx[t]] && keep[idx[t + 1]] && keep[idx[t + 2]])) continue;
        for (let k = 0; k < 3; k++) {
          const vi = idx[t + k]; let j = map.get(vi);
          if (j === undefined) { j = map.size; map.set(vi, j); m.getVertexPosition(vi, _v); _v.applyMatrix4(m.matrixWorld).sub(c); pos.push(_v.x, _v.y, _v.z); if (uvs) uv.push(uvs.getX(vi), uvs.getY(vi)); }
          index.push(j);
        }
      }
      if (!index.length) return;
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      if (uv.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(index); geo.computeVertexNormals();
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material).clone(); if (mat.emissive) mat.emissive.setRGB(0, 0, 0); mat.side = THREE.DoubleSide;
      g.add(new THREE.Mesh(geo, mat));
    });
    return g;
  }

  /** Take a part off. part: Head | Forearm_L | Forearm_R | LowerLeg_L | LowerLeg_R. dir: the shot (world). */
  function sever(z, part, dir, { speed = 3, burst = false } = {}) {
    if (!z.severed || z.severed.has(part)) return false;
    const B = z.bones, C = CUT[part]; if (!B[C[0]]) return false;
    z.severed.add(part);
    z.root.updateMatrixWorld(true);
    const a = B[C[0]].getWorldPosition(new THREE.Vector3());
    const b = B[C[1]] ? B[C[1]].getWorldPosition(new THREE.Vector3()) : a.clone().add(_v.set(0, 0.2 * z.rigScale, 0));
    const c = a.clone().lerp(b, 0.5);
    const d = dir.clone().setY(0).normalize();
    const stumpAt = (B[C[3]] || B[C[0]]).getWorldPosition(new THREE.Vector3());
    if (burst && part === 'Head') {
      hide(z, part);
      // the head bursts apart: no piece, a spray of blood, flesh, skull and brain along the shot
      for (let i = 0; i < 3; i++) fx.blood(a, _w.copy(d).add(_v.set(rnd(-0.4, 0.4), rnd(0.2, 0.8), rnd(-0.4, 0.4))), 1.5);
      bits(a, d, 22, 0x5e0b0b); bits(a, d, 10, 0xe6dccb); bits(a, d, 8, 0xc98a8a);
      fx.pool(_v.copy(a).addScaledVector(d, 0.9).setY(0), 1.2);
      z.bleed.Head = 2.5;
      return true;
    }
    // the loose piece
    const mods = z.modules[part], caps = z.goreCaps[part] || {};
    let obj;
    if (mods) { const meshes = [...mods]; if (caps.detached) { caps.detached.visible = true; meshes.push(caps.detached); } obj = bake(meshes, c); if (caps.detached) caps.detached.visible = false; }
    else obj = bake([z.data.model], c, B[C[0]]);
    hide(z, part);
    obj.position.copy(c); scene.add(obj);
    obj.traverse(m => { if (m.isMesh) m.castShadow = false; });
    const vel = d.clone().multiplyScalar(speed * rnd(0.8, 1.2)).add(_v.set(rnd(-0.6, 0.6), rnd(2.2, 3.4), rnd(-0.6, 0.6)));
    pieces.push({ obj, vel, spin: new THREE.Vector3(rnd(-12, 12), rnd(-8, 8), rnd(-12, 12)), r: C[2] * z.rigScale * 1.6, t: 0, rest: false });
    if (pieces.length > MAX_PIECES) drop(pieces[0]);
    // blood at the stump
    fx.blood(stumpAt, d, part === 'Head' ? 1.6 : 1.1);
    fx.pool(_v.copy(stumpAt).addScaledVector(d, 0.4).setY(0), part === 'Head' ? 1.0 : 0.7);
    z.bleed[part] = 2.5;
    return true;
  }

  function hide(z, part) {
    const mods = z.modules[part], caps = z.goreCaps[part] || {};
    if (mods) { for (const m of mods) m.visible = false; if (caps.stump) caps.stump.visible = true; }
    else z.collapsed.push(z.bones[CUT[part][0]]);
    if (part === 'Head') z.headGone = true;
  }

  // flesh / bone chips: small spinning cubes
  const chipGeo = new THREE.BoxGeometry(0.03, 0.02, 0.025);
  const chipMats = new Map();
  function bits(p, d, n, color) {
    if (!chipMats.has(color)) chipMats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(chipGeo, chipMats.get(color)); m.position.copy(p); m.scale.setScalar(rnd(0.6, 1.6)); scene.add(m);
      pieces.push({ obj: m, vel: d.clone().multiplyScalar(rnd(1.5, 4.5)).add(_v.set(rnd(-1.4, 1.4), rnd(1, 3.6), rnd(-1.4, 1.4))), spin: new THREE.Vector3(rnd(-20, 20), rnd(-20, 20), rnd(-20, 20)), r: 0.012, t: 0, rest: false, chip: true });
    }
    while (pieces.length > MAX_PIECES + 60) drop(pieces.find(q => q.chip) || pieces[0]);
  }

  function drop(p) { scene.remove(p.obj); if (!p.chip) p.obj.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); pieces.splice(pieces.indexOf(p), 1); }

  function update(dt, zombies) {
    for (const p of [...pieces]) {
      p.t += dt;
      if (!p.rest) {
        p.vel.y -= 9.8 * dt; p.obj.position.addScaledVector(p.vel, dt);
        p.obj.rotation.x += p.spin.x * dt; p.obj.rotation.y += p.spin.y * dt; p.obj.rotation.z += p.spin.z * dt;
        if (!p.chip && p.t < 1.2 && Math.random() < 0.5) fx.blood(p.obj.position, _v.set(0, -1, 0), 0.05);
        if (p.obj.position.y < p.r) {
          p.obj.position.y = p.r;
          if (p.vel.y < -1.5) { p.vel.y *= -0.3; p.vel.x *= 0.5; p.vel.z *= 0.5; p.spin.multiplyScalar(0.4); if (!p.chip) fx.pool(p.obj.position, 0.3); }
          else p.rest = true;
        }
      }
      if (p.t > (p.chip ? 6 : 25)) drop(p);
    }
    // stumps bleed for a while
    for (const z of zombies) if (z.bleed) for (const [part, t] of Object.entries(z.bleed)) {
      if (t <= 0) continue; z.bleed[part] = t - dt;
      if (Math.random() < dt * 14) { const b = z.bones[CUT[part][3]] || z.bones[CUT[part][0]]; if (b) fx.blood(b.getWorldPosition(_w), _v.set(rnd(-0.3, 0.3), 0.6, rnd(-0.3, 0.3)), 0.12); }
    }
  }

  return { prepare, sever, update, get count() { return pieces.length; } };
}
