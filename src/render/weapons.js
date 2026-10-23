// Weapons in the heroes' hands. The models are the hospital pack's (public/assets/models/weapons, origin at the right-hand
// grip GameGrip_R); the hold math is yola-zombie's (src/render/holdfit.js and clipchars.js pistolInFist, ported here):
//   - a fist frame from the finger joints: centre of the curled index..pinky joints, the grip axis (pinky -> index
//     knuckle: a handle runs this way through a closed fist) and the knuckle direction;
//   - a one-handed weapon: its grip point in the fist centre, shaft along the grip axis; with both fists on it (the batting
//     idle) the shaft runs through both fist centres;
//   - the pistol: its grip line along the knuckles, the barrel toward the forearm's direction;
//   - then Marc's per-weapon fit from yola-zombie's Rig Lab (assets/hold/weapon_fit.json, pistol_fit.json): a move in mm
//     along the weapon's own axes and a turn in degrees, pivoting on the grip.
// Each weapon is a holder Group placed in WORLD space every frame (after the mixer), so nothing is parented to a bone.
// Tiers: the nail bat and the wire-and-tape bat are the wood bat with procedural nails / wire coils and tape bands.
import * as THREE from 'three';
import { weaponGltf } from './assets.js';

const D2R = Math.PI / 180;

// ---- data sheets (model frame): grip_primary, shaft_axis, ref_axis (a side of the head/barrel), tip, impact ----
const BAT = { grip_primary: [0, 0, 0], shaft_axis: [0, 1, 0], ref_axis: [1, 0, 0], tip: [0, 0.768, 0], impact: [0, 0.655, 0], two: true };
export const WEAPONS = {
  // Marc
  wood_bat: { hero: 'marc', file: 'wood_bat', kind: 'melee', def: BAT, fit: { fwd: -11, up: 28, side: 10, tilt: -1, turn: 20, roll: 21 }, label: 'Wood Bat' },
  nail_bat: { hero: 'marc', file: 'wood_bat', kind: 'melee', def: BAT, fit: { fwd: -11, up: 28, side: 10, tilt: -1, turn: 20, roll: 21 }, extra: 'nails', label: 'Nail Bat', edged: true },
  wire_bat: { hero: 'marc', file: 'wood_bat', kind: 'melee', def: BAT, fit: { fwd: -11, up: 28, side: 10, tilt: -1, turn: 20, roll: 21 }, extra: 'wire', label: 'Wire-and-Tape Bat', edged: true },
  crowbar: { hero: 'marc', file: 'crowbar', kind: 'melee', def: { grip_primary: [0, 0, 0], shaft_axis: [0, 1, 0], ref_axis: [1, 0, 0], tip: [-0.08, 0.5, 0], impact: [-0.06, 0.46, 0], two: true }, fit: { fwd: 10, up: 20, side: 8, tilt: 0, turn: 20, roll: 21 }, label: 'Crowbar', metal: true },
  fire_axe: { hero: 'marc', file: 'fire_axe', kind: 'melee', def: { grip_primary: [0, 0, 0], shaft_axis: [0, 1, 0], ref_axis: [-1, 0, 0], tip: [0, 0.8, 0], impact: [-0.135, 0.694, 0], two: true }, fit: { fwd: -11, up: 28, side: 10, tilt: -1, turn: 20, roll: 21 }, label: 'Fire Axe', edged: true },
  sledgehammer: { hero: 'marc', file: 'sledgehammer', kind: 'melee', def: { grip_primary: [0, 0, 0], shaft_axis: [0, 1, 0], ref_axis: [1, 0, 0], tip: [0, 0.705, 0], impact: [0.137, 0.632, 0], two: true }, fit: { fwd: -40, up: 28, side: 10, tilt: -1, turn: 20, roll: 21 }, label: 'Sledgehammer', heavy: true, metal: true },
  // Yola
  pistol: { hero: 'yola', file: 'pistol_core', kind: 'pistol', label: 'Pistol' },
  shotgun: { hero: 'yola', file: 'pump_shotgun', kind: 'shotgun', label: 'Pump Shotgun' },
  sawed_off: { hero: 'yola', file: 'pump_short', kind: 'shotgun', label: 'Sawed-Off' },
};
// the run's weapon ids (content/weapons.js) to the model each hero shows; unknown ids fall back to the starter
export const DEFAULT_WEAPON = { marc: 'wood_bat', yola: 'pistol' };

// pistol_core grip, measured in yola-zombie (clipchars.js PG_*): the fist's point on the grip, the grip line, the barrel
const PISTOL_SCALE = 0.8;
const PG_AT = new THREE.Vector3(0, 0.005, 0.0026);
const PG_AXIS = new THREE.Vector3(0, 0.9509, 0.3094).normalize();
const PG_BARREL = new THREE.Vector3(0, 0, 1).addScaledVector(PG_AXIS, -PG_AXIS.z).normalize();
// Rig Lab pistol fits per character (pistol_fit.json: male1 = Marc, yola2 = Yola)
const PISTOL_FIT = {
  marc: { size: 100, fwd: -37, up: 0, side: 6, tilt: 8, turn: -14, roll: -13 },
  yola: { size: 101, fwd: -21, up: 7, side: 14, tilt: 17, turn: -18, roll: -11 },
};
// shotguns: in the right fist (barrel along the forearm), set back so the stock meets the shoulder line
const SHOTGUN_FIT = {
  shotgun: { fwd: 0, up: 0, side: 0, tilt: 0, turn: 0, roll: 0 },
  sawed_off: { fwd: 0, up: 0, side: 0, tilt: 0, turn: 0, roll: 0 },
};

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();

// ---- the fist ----
const FR = () => ({ c: new THREE.Vector3(), a: new THREE.Vector3(), k: new THREE.Vector3() });
export function fistFrame(bones, side, out) {
  const H = side + 'Hand', c = out.c.set(0, 0, 0); let n = 0;
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const i of [1, 2, 3]) { const b = bones[H + f + i]; if (b) { c.add(b.getWorldPosition(_a)); n++; } }
  if (!n || !bones[H + 'Index1'] || !bones[H + 'Pinky1'] || !bones[H + 'Middle1']) return null;
  c.multiplyScalar(1 / n);
  out.a.copy(bones[H + 'Index1'].getWorldPosition(_a)).sub(bones[H + 'Pinky1'].getWorldPosition(_b)).normalize();
  out.k.copy(bones[H + 'Middle1'].getWorldPosition(_a)).sub(c); out.k.addScaledVector(out.a, -out.k.dot(out.a)).normalize();
  c.addScaledVector(out.k, -0.01 * (out.scale || 1)); // the curled fingers' centroid sits on the knuckle side of the handle
  return out;
}

// the fit on top of a base orientation q0 and grip point c (k = rig scale for the mm moves)
export function applyFit(o, c, q0, F, gripPoint, baseScale = 1, k = 1) {
  const s = baseScale * ((F?.size ?? 100) / 100);
  o.scale.setScalar(s);
  o.quaternion.copy(q0).multiply(_q.setFromEuler(_e.set((F?.tilt || 0) * D2R, (F?.turn || 0) * D2R, (F?.roll || 0) * D2R, 'YXZ')));
  o.position.copy(c).add(_b.set(F?.side || 0, F?.up || 0, F?.fwd || 0).multiplyScalar(0.001 * k).applyQuaternion(q0))
    .sub(_c.copy(gripPoint).multiplyScalar(s).applyQuaternion(o.quaternion));
}

const F1 = FR(), F2 = FR();
function basisQuat(def, dir, kn) {
  const s = _a.set(...def.shaft_axis).normalize(), r = _d.set(...def.ref_axis); r.addScaledVector(s, -r.dot(s)).normalize();
  _m1.makeBasis(s, r, new THREE.Vector3().crossVectors(s, r));
  _m2.makeBasis(dir, kn, new THREE.Vector3().crossVectors(dir, kn));
  return new THREE.Quaternion().setFromRotationMatrix(_m2.multiply(_m1.transpose()));
}
export function placeOneHanded(bones, side, o, def, fit, k = 1) {
  const F = fistFrame(bones, side, F1); if (!F) return false;
  const q0 = basisQuat(def, F.a.clone(), F.k.clone());
  applyFit(o, F.c, q0, fit, new THREE.Vector3(...def.grip_primary), 1, k);
  return true;
}
// both fists on it (closer than `apart`): along the line through both fist centres, barrel toward the index knuckles
export function placeBat(bones, o, def, fit, k = 1, apart = 0.2) {
  const R = fistFrame(bones, 'Right', F1); if (!R) return false;
  const L = fistFrame(bones, 'Left', F2);
  if (!L || !def.two || R.c.distanceTo(L.c) > apart * k) return placeOneHanded(bones, 'Right', o, def, fit, k);
  const d = new THREE.Vector3().subVectors(L.c, R.c).normalize();
  if (d.dot(_a.copy(R.a).add(L.a)) < 0) d.negate();
  const low = R.c.dot(d) < L.c.dot(d) ? R : L, kn = low.k.clone().addScaledVector(d, -low.k.dot(d));
  if (kn.lengthSq() < 1e-6) return placeOneHanded(bones, 'Right', o, def, fit, k); // (knuckles along the line: degenerate)
  kn.normalize();
  applyFit(o, low.c, basisQuat(def, d, kn), fit, new THREE.Vector3(...def.grip_primary), 1, k);
  if (!Number.isFinite(o.quaternion.x) || !Number.isFinite(o.position.x)) return placeOneHanded(bones, 'Right', o, def, fit, k);
  return true;
}

// the pistol in the right fist (clipchars.js pistolInFist)
const _pf = new THREE.Vector3(), _pf2 = new THREE.Vector3(), _pf3 = new THREE.Vector3(), _pq = new THREE.Quaternion();
export function placePistol(bones, o, P, k = 1) {
  const B = bones;
  if (!B.RightHandIndex1 || !B.RightHandPinky1) return false;
  const c = _pf.set(0, 0, 0); let n = 0;
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const i of [1, 2, 3]) { const b = B['RightHand' + f + i]; if (b) { c.add(b.getWorldPosition(_pf2)); n++; } }
  c.multiplyScalar(1 / n);
  const A = B.RightHandIndex1.getWorldPosition(_pf2).sub(B.RightHandPinky1.getWorldPosition(_pf3)).normalize().clone();
  const F = B.RightHand.getWorldPosition(_pf3).sub(B.RightForeArm.getWorldPosition(_a)); F.addScaledVector(A, -F.dot(A)).normalize();
  _m1.makeBasis(PG_AXIS, PG_BARREL, _b.crossVectors(PG_AXIS, PG_BARREL));
  _m2.makeBasis(A, F, _c.crossVectors(A, F)).multiply(_m1.transpose());
  _pq.setFromRotationMatrix(_m2);
  const size = (P.size ?? 100) / 100;
  o.scale.setScalar(size);
  o.quaternion.copy(_pq).multiply(_q.setFromEuler(_e.set((P.tilt || 0) * D2R, (P.turn || 0) * D2R, (P.roll || 0) * D2R, 'YXZ')));
  o.position.copy(c).add(_pf2.set(P.side || 0, P.up || 0, P.fwd || 0).multiplyScalar(0.001 * k).applyQuaternion(_pq))
    .sub(_pf3.copy(PG_AT).multiplyScalar(size * PISTOL_SCALE).applyQuaternion(o.quaternion));
  return true;
}

// ---- procedural tier extras on the wood bat (model frame: the bat runs up +Y from the grip at the origin) ----
function batRadiusAt(y) { // the wood bat's profile, roughly (m)
  if (y < 0.1) return 0.0145; if (y < 0.3) return 0.0145 + (y - 0.1) * 0.02; return Math.min(0.031, 0.0185 + (y - 0.3) * 0.032);
}
function addNails(group) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x9a9a96, metalness: 0.85, roughness: 0.38 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x6b4128, metalness: 0.5, roughness: 0.7 });
  const shaft = new THREE.CylinderGeometry(0.0022, 0.0016, 0.05, 5); shaft.translate(0, 0.025, 0);
  const head = new THREE.CylinderGeometry(0.005, 0.005, 0.002, 8);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 16; i++) {
    const y = 0.47 + (i / 16) * 0.26 + rnd() * 0.02, ang = i * 2.4 + rnd() * 0.5, r = batRadiusAt(y);
    const nail = new THREE.Group();
    const s = new THREE.Mesh(shaft, rnd() < 0.3 ? rust : steel); nail.add(s);
    nail.position.set(Math.cos(ang) * r * 0.85, y, Math.sin(ang) * r * 0.85);
    nail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(ang), (rnd() - 0.5) * 0.4, Math.sin(ang)).normalize());
    const h = new THREE.Mesh(head, steel); h.position.set(0, -0.001, 0); nail.add(h);
    group.add(nail);
  }
}
function addWire(group) {
  const wire = new THREE.MeshStandardMaterial({ color: 0x8c8f92, metalness: 0.9, roughness: 0.35 });
  const tape = new THREE.MeshStandardMaterial({ color: 0x3a3d40, metalness: 0.0, roughness: 0.75 });
  const tapeLight = new THREE.MeshStandardMaterial({ color: 0xb8b2a2, metalness: 0.0, roughness: 0.85 });
  // barbed-wire coil: a helix tube round the barrel, with barbs
  const pts = [];
  for (let i = 0; i <= 140; i++) { const u = i / 140, y = 0.42 + u * 0.3, a = u * Math.PI * 2 * 5.5, r = batRadiusAt(y) + 0.004; pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)); }
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 220, 0.0016, 5), wire));
  const barb = new THREE.CylinderGeometry(0.0009, 0.0009, 0.016, 4);
  for (let i = 0; i < 14; i++) {
    const p = pts[Math.floor((i + 0.5) / 14 * pts.length)];
    const m = new THREE.Mesh(barb, wire); m.position.copy(p); m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); group.add(m);
  }
  // tape bands
  for (const [y, h, mat] of [[0.36, 0.03, tape], [0.55, 0.022, tapeLight], [0.74, 0.02, tape]]) {
    const r = batRadiusAt(y) + 0.0025;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18, 1, true), mat); band.position.y = y; group.add(band);
  }
}

/**
 * Build a held weapon. Returns { id, kind, obj, muzzle (Object3D or null), place(actor), tipWorld(out), muzzleWorld(out),
 * kick(strength), update(dt), dispose() }. obj goes in the scene (world space).
 */
export async function createWeapon(id, scene) {
  const W = WEAPONS[id] || WEAPONS[DEFAULT_WEAPON.marc];
  const g = await weaponGltf(W.file);
  const inner = g.scene.clone(true);
  inner.traverse(m => {
    if (!m.isMesh) return;
    m.castShadow = true; m.frustumCulled = false;
    m.material = m.material.clone();
    if (m.material.metalness > 0.5 && !W.metal && W.kind === 'melee') m.material.metalness = 0.2;
    m.material.roughness = Math.max(0.35, m.material.roughness);
    m.material.envMapIntensity = 1.2;
  });
  const obj = new THREE.Group(); obj.name = 'weapon:' + id;
  let muzzle = null, slide = null, slide0 = null, pump = null, pump0 = 0;
  if (W.kind === 'pistol') {
    // wrapped as yola-zombie does: barrel along +Z, origin at the grip, 80% size
    inner.rotation.y = -Math.PI / 2; inner.scale.setScalar(PISTOL_SCALE);
    obj.add(inner);
    muzzle = inner.getObjectByName('Muzzle'); slide = inner.getObjectByName('Pistol_Slide'); slide0 = slide?.position.clone();
  } else if (W.kind === 'shotgun') {
    inner.rotation.y = -Math.PI / 2; // barrel +X -> +Z
    obj.add(inner);
    muzzle = inner.getObjectByName('Muzzle'); pump = inner.getObjectByName('Pump') || inner.getObjectByName('Shotgun_Pump'); pump0 = pump?.position.x || 0;
  } else {
    obj.add(inner);
    if (W.extra === 'nails') addNails(inner);
    if (W.extra === 'wire') addWire(inner);
  }
  scene.add(obj);

  let kickT = 1, kickS = 0;
  const tipLocal = W.def ? new THREE.Vector3(...(W.def.impact || W.def.tip)) : null;
  // dropped (a defeat): it leaves the hand and tumbles to the floor; pickUp() puts it back in the hand
  let dropped = null;
  const half = W.kind === 'pistol' ? 0.03 : W.kind === 'shotgun' ? 0.05 : 0.035; // resting height of its centre

  return {
    id, kind: W.kind, def: W, obj, muzzle,
    /** pose it in the actor's hand this frame (after the mixer). */
    place(actor) {
      if (dropped) return;
      const B = actor.bones, k = actor.rigScale || 1;
      if (W.kind === 'pistol') placePistol(B, obj, PISTOL_FIT[actor.id] || PISTOL_FIT.yola, k);
      else if (W.kind === 'shotgun') {
        // the long gun rides the right hand: barrel along the forearm, the left fist ahead on the pump
        const R = fistFrame(B, 'Right', F1); if (!R) return;
        const fore = B.RightHand.getWorldPosition(_a).sub(B.RightForeArm.getWorldPosition(_b)).normalize();
        const L = B.LeftHand ? fistFrame(B, 'Left', F2) : null;
        let dir = fore.clone();
        if (L && L.c.distanceTo(R.c) > 0.12 * k) dir.copy(L.c).sub(R.c).normalize(); // two-handed: through both fists
        const up = R.k.clone().negate(); up.addScaledVector(dir, -up.dot(dir)).normalize();
        _m2.makeBasis(new THREE.Vector3().crossVectors(up, dir), up, dir);
        obj.quaternion.setFromRotationMatrix(_m2);
        obj.quaternion.multiply(_q.setFromEuler(_e.set((SHOTGUN_FIT[id]?.tilt || 0) * D2R, (SHOTGUN_FIT[id]?.turn || 0) * D2R, (SHOTGUN_FIT[id]?.roll || 0) * D2R, 'YXZ')));
        obj.position.copy(R.c).add(_b.set(0, -0.02, -0.02).applyQuaternion(obj.quaternion));
        obj.scale.setScalar(1);
      } else placeBat(B, obj, W.def, W.fit, k);
      // procedural slide / pump kick after a shot
      if (kickT < 1) {
        const u = kickT, s = Math.sin(Math.min(1, u) * Math.PI) * kickS;
        if (slide && slide0) slide.position.x = slide0.x - 0.018 * s;
        if (pump) pump.position.x = pump0 - 0.07 * s;
      }
      obj.updateMatrixWorld(true);
    },
    tipWorld(out = new THREE.Vector3()) { return tipLocal ? out.copy(tipLocal).applyMatrix4(inner.matrixWorld) : obj.getWorldPosition(out); },
    muzzleWorld(out = new THREE.Vector3()) { return muzzle ? muzzle.getWorldPosition(out) : obj.getWorldPosition(out); },
    forward(out = new THREE.Vector3()) { return out.set(0, 0, 1).transformDirection(obj.matrixWorld); },
    kick(strength = 1) { kickT = 0; kickS = strength; },
    /** Let go: it keeps its place and falls with this velocity (world m/s) and a tumble. */
    drop(v = new THREE.Vector3(0, 0.8, 0)) {
      if (dropped) return;
      dropped = { v: v.clone(), w: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 9), rest: false, bounces: 0 };
    },
    pickUp() { dropped = null; },
    get dropped() { return !!dropped; },
    update(dt) {
      if (kickT < 1) kickT = Math.min(1, kickT + dt / (W.kind === 'shotgun' ? 0.5 : 0.09));
      if (dropped && !dropped.rest && dt > 0) {
        const D = dropped;
        D.v.y -= 9.8 * dt; obj.position.addScaledVector(D.v, dt);
        _q.setFromEuler(_e.set(D.w.x * dt, D.w.y * dt, D.w.z * dt)); obj.quaternion.premultiply(_q);
        if (obj.position.y < half) {
          obj.position.y = half;
          if (D.v.y < -1.2 && D.bounces < 2) { D.v.y *= -0.28; D.v.x *= 0.45; D.v.z *= 0.45; D.w.multiplyScalar(0.4); D.bounces++; }
          else {
            // settle flat: keep its heading, lie along the floor
            D.rest = true;
            const gun = W.kind !== 'melee', up = _c.set(0, 1, 0);
            const along = _a.set(0, gun ? 0 : 1, gun ? 1 : 0).applyQuaternion(obj.quaternion); along.y = 0;  // shaft / barrel
            if (along.lengthSq() < 1e-4) along.set(1, 0, 0);
            along.normalize();
            if (gun) _m1.makeBasis(up, _b.crossVectors(along, up), along);           // on its side, barrel level
            else { const side = _b.crossVectors(along, up).normalize(); _m1.makeBasis(side, along, _d.crossVectors(side, along)); }
            obj.quaternion.setFromRotationMatrix(_m1);
          }
        }
        obj.updateMatrixWorld(true);
      }
    },
    setVisible(v) { obj.visible = v; },
    dispose() { scene.remove(obj); obj.traverse(m => { if (m.isMesh) m.material.dispose?.(); }); }, // (geometry is the cached GLB's)
  };
}

// The Shield Guard's riot shield (procedural): a smoked polycarbonate panel with a rubber rim, a "SECURITY" band and a
// handle behind it. Frame: face toward +Z, up +Y, the handle (where the forearm goes) at the origin.
// The band is its own small plane so it always reads right from the camera: each frame (userData.faceCamera, called by
// the actor after posing) it sits on whichever face the camera sees and turns in quarter steps so the lettering runs
// left to right and upright on screen, never mirrored or upside down, however the forearm swings the shield.
export function createRiotShield() {
  const g = new THREE.Group(); g.name = 'riot_shield';
  const W = 0.56, H = 0.98, R = 0.08;
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2 + R, -H / 2); shape.lineTo(W / 2 - R, -H / 2); shape.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + R);
  shape.lineTo(W / 2, H / 2 - R); shape.quadraticCurveTo(W / 2, H / 2, W / 2 - R, H / 2); shape.lineTo(-W / 2 + R, H / 2);
  shape.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - R); shape.lineTo(-W / 2, -H / 2 + R); shape.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + R, -H / 2);
  const panelGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 2, curveSegments: 6 });
  panelGeo.translate(0, 0, 0.05);
  // scratches on the face
  const c = document.createElement('canvas'); c.width = 128; c.height = 224; const x = c.getContext('2d');
  x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 1.5; for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(10 + i * 20, 5); x.lineTo(i * 20 - 30, 220); x.stroke(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(panelGeo, new THREE.MeshStandardMaterial({ color: 0x55707c, transparent: true, opacity: 0.62, roughness: 0.12, metalness: 0.15, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide }));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.94, H * 0.94), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4, depthWrite: false, side: THREE.DoubleSide }));
  face.position.z = 0.068;
  // the band: lettering on a pale strip, long enough to run across the width or along the length
  const lc = document.createElement('canvas'); lc.width = 512; lc.height = 96; const lx = lc.getContext('2d');
  lx.fillStyle = 'rgba(235,235,225,0.94)'; lx.fillRect(0, 0, 512, 96);
  lx.fillStyle = '#1b2228'; lx.font = 'bold 66px Oswald, Impact, sans-serif'; lx.textAlign = 'center'; lx.textBaseline = 'middle'; lx.fillText('SECURITY', 256, 52);
  const ltex = new THREE.CanvasTexture(lc); ltex.colorSpace = THREE.SRGBColorSpace; ltex.anisotropy = 4;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.086), new THREE.MeshStandardMaterial({ map: ltex, roughness: 0.45, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  label.name = 'shield_label';
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x16191c, roughness: 0.8 });
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.05), rimMat); handle.position.set(0, 0, 0.02);
  g.add(panel, face, label, handle);
  g.traverse(m => { if (m.isMesh) { m.castShadow = m !== label; m.renderOrder = 6; } });
  label.renderOrder = 7;

  // pick the label's face and quarter turn for this camera (with a little hysteresis so it doesn't flicker)
  let pick = -1;
  const cands = [];
  for (const side of [1, -1]) for (let k = 0; k < 4; k++) cands.push({ side, k });
  const _cp = new THREE.Vector3(), _n = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _cq = new THREE.Quaternion(), _lq = new THREE.Quaternion(), _ce = new THREE.Euler();
  g.userData.faceCamera = (camera) => {
    g.updateMatrixWorld(true);
    const gq = g.getWorldQuaternion(_cq);
    const toCam = _cp.setFromMatrixPosition(camera.matrixWorld).sub(_n.setFromMatrixPosition(g.matrixWorld));
    const front = _n.set(0, 0, 1).applyQuaternion(gq).dot(toCam) >= 0 ? 1 : -1;
    const camInv = camera.matrixWorldInverse;
    let best = -1, bestS = -Infinity;
    cands.forEach((C, i) => {
      if (C.side !== front) return;
      _lq.setFromEuler(_ce.set(0, C.side < 0 ? Math.PI : 0, C.k * Math.PI / 2));
      _lq.premultiply(gq);
      _r.set(1, 0, 0).applyQuaternion(_lq).transformDirection(camInv);   // the text's "right" in view space
      _u.set(0, 1, 0).applyQuaternion(_lq).transformDirection(camInv);   // and its "up"
      const sc = _r.x + 0.6 * _u.y + (i === pick ? 0.35 : 0);
      if (sc > bestS) { bestS = sc; best = i; }
    });
    if (best !== pick) {
      pick = best; const C = cands[best];
      label.rotation.set(0, C.side < 0 ? Math.PI : 0, C.k * Math.PI / 2);
      label.position.set(0, 0.12 * (C.k % 2 ? 0 : 1), C.side > 0 ? 0.0705 : 0.041);
    }
  };
  g.userData.faceCamera.label = label;
  return g;
}
