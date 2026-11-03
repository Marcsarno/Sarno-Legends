// The hands and gun in first person: Mixamo's Y Bot (assets/models/fps/ybot.glb, converted from yola-zombie's
// assets/mixamo/reference/ref_xbot_pistol_idle.fbx, with its own Mixamo pistol idle) wearing purple nitrile gloves, driven
// by the Quaternius Universal Animation Library pistol clips (CC0; Pistol_Idle_Loop / Pistol_Shoot / Pistol_Reload,
// re-baked on the Mixamo skeleton in yola-zombie assets/test_clips/ual_pistol.glb) and, for the shotgun, the Mixamo
// rifle_aim_idle hold with a procedural shell-by-shell reload. The weapon is held by weapons.js (placePistol / the long-gun
// fit). The body hangs off the camera so the camera sits behind the hands: per stance, a fixed transform puts the eyes at
// the camera and turns the barrel onto the crosshair (measured from the stance's first frame). The head is collapsed.
// It draws on layer 1 with its own narrower lens, after the world with the depth cleared, so only the hands and the gun
// show and the gun never pokes into walls (main.js enables layer 1 on every light).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { character } from '../render/assets.js';
import { retargetClip } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createWeapon } from '../render/weapons.js';

const params = new URLSearchParams(location.search);
export const VM_LAYER = 1;
export const VM_FOV = 54;   // the arms' own lens (vertical deg): narrower than the world's, so the gun reads big and the arms run off-screen
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();

// per weapon: idle clip (and the frame it's measured at), reload clip [from, to] in clip s, where the eyes sit relative
// to the camera (x right, y up, z back, m), and how far below / right of the crosshair the barrel points (rad)
const STANCE = {
  pistol: { idle: params.get('idle') || 'xbot_pistol_idle', at: 0.2, reload: ['ual_Pistol_Reload', 0, null], shoot: null, eye: [0.02, -0.03, 0.07], drop: 0.0, right: 0.0, push: [0.02, 0.07, 0.06] },
  shotgun: { idle: params.get('idle') || 'xbot_pistol_idle', at: 0.2, reload: null, custom: true, eye: [0.06, 0.02, 0.02], drop: 0.0, right: 0.0, push: [0.03, 0.05, 0.02] },
};

const BASE = ((import.meta.env && import.meta.env.BASE_URL) || '/') + 'assets/';
const GLOVE = 0x6d5fd8, CUFF = 0x2b2650;

// the body: Y Bot + its clips (its own pistol idle, the UAL pistol set, the deckbuilder's rifle hold for the shotgun)
async function loadBody() {
  const L = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [fbx, ual] = await Promise.all([new FBXLoader().loadAsync(BASE + 'models/fps/ybot_pistol_idle.fbx'), L.loadAsync(BASE + 'models/fps/ual_pistol.glb')]);
  const bot = { scene: fbx, animations: fbx.animations.filter(a => a.tracks.length) };
  const yola = await character('yola');
  const model = bot.scene;
  const height = 1.72, root = new THREE.Group(); root.add(model);
  const bones = {};
  model.traverse(o => {
    if (o.isMesh) {
      o.frustumCulled = false;
      const joints = /Joints/i.test(o.name);
      o.material = new THREE.MeshStandardMaterial({ color: joints ? CUFF : GLOVE, roughness: joints ? 0.55 : 0.38, metalness: 0, envMapIntensity: 0.8 });
    }
  });
  // the bones the mesh is skinned to (the FBX conversion left a second, unused copy of the hierarchy under the same names)
  model.traverse(o => { if (o.isSkinnedMesh) for (const b of o.skeleton.bones) bones[b.name.replace(/^mixamorig:?/, '')] ||= b; });
  // size it from its bones (the FBX's unit scales are nested): head bone ~1.6 m above the feet
  model.updateMatrixWorld(true);
  const hy = bones.Head.getWorldPosition(new THREE.Vector3()).y, fy = Math.min(bones.LeftFoot.getWorldPosition(new THREE.Vector3()).y, bones.RightFoot.getWorldPosition(new THREE.Vector3()).y);
  model.scale.multiplyScalar(1.56 / Math.max(1e-6, hy - fy)); model.updateMatrixWorld(true);
  // clips: rotations only (the body hangs off the camera; hips travel would drift it)
  const clips = new Map();
  const add = (c, name) => { const k = c.clone(); k.name = name; k.tracks = k.tracks.filter(t => !/\.position$/.test(t.name) && !/\.scale$/.test(t.name)); for (const t of k.tracks) t.name = t.name.replace(/^\.bones\[([^\]]+)\]/, '$1'); clips.set(name, k); };
  for (const c of bot.animations) add(c, 'xbot_pistol_idle');
  // clips made on Yola's skeleton (the UAL pistol set was re-baked onto it, the rifle hold is hers): retargeted onto the
  // bot through world-space bone directions (SkeletonUtils.retargetClip), not copied by name: Mixamo bodies differ in
  // their rest poses, so a clip copied by name twists the arms and the long gun ends up across the chest
  let botMesh = null, yolaMesh = null;
  model.traverse(o => { if (o.isSkinnedMesh && !botMesh) botMesh = o; });
  yola.model.traverse(o => { if (o.isSkinnedMesh && !yolaMesh) yolaMesh = o; });
  model.updateMatrixWorld(true); yola.root.updateMatrixWorld(true);
  const rt = (c) => {
    if (!params.has('rt') || !botMesh || !yolaMesh) return c;
    try { return retargetClip(botMesh, yolaMesh.skeleton, c, { hip: 'mixamorigHips', fps: 30, preserveBonePositions: true }); }
    catch (e) { console.warn('[fps] retarget failed', c.name, e); return c; }
  };
  for (const c of ual.animations) add(rt(c), c.name.replace(/^ual1_/, 'ual_').replace(/_REBAKE_test$/, ''));
  for (const n of ['rifle_aim_idle', 'pistol_idle']) if (yola.clips.get(n)) add(rt(yola.clips.get(n)), n);
  botMesh?.skeleton.pose();
  return { root, model, bones, clips, height };
}

function onLayer(o) { o.traverse(m => { m.layers.set(VM_LAYER); if (m.isMesh) { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; } }); }

export async function createViewmodel({ scene, camera }) {
  const data = await loadBody();
  const mixer = new THREE.AnimationMixer(data.model);
  const B = data.bones;
  // three groups: kick (recoil / bob, in camera space) > stance (the measured fit) > body (data.root, the model)
  const kick = new THREE.Group(); camera.add(kick);
  const stance = new THREE.Group(); kick.add(stance);
  stance.add(data.root);
  onLayer(data.root);
  const actorLike = { bones: B, rigScale: data.height / 1.62, id: 'marc' };   // (Marc's pistol fit: a man's hand, like the bot's)
  const weapons = { pistol: await createWeapon('pistol', scene), shotgun: await createWeapon('shotgun', scene) };
  for (const w of Object.values(weapons)) { onLayer(w.obj); w.obj.visible = false; }
  // the head (and hair) never shows: collapse it into the neck
  const collapse = [B.Head].filter(Boolean);

  let cur = 'pistol', act = null, actName = '', oneShot = null;
  function play(name, { fade = 0.15, loop = true, from = 0, rate = 1, to = null } = {}) {
    const clip = data.clips.get(name); if (!clip) return null;
    const a = mixer.clipAction(clip);
    if (a === act && loop && !oneShot) return a;
    a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1); a.clampWhenFinished = !loop;
    a.timeScale = rate; a.time = from; a.setEffectiveWeight(1); a.play();
    if (act && act !== a) act.crossFadeTo(a, fade, false);
    act = a; actName = name;
    oneShot = loop ? null : { a, to: to ?? clip.duration };
    return a;
  }
  function pose() {
    mixer.update(0);
    for (const b of collapse) b.scale.setScalar(0.001);
    data.root.updateMatrixWorld(true);
    const w = weapons[cur]; w.place(actorLike);
  }

  // ---- measure each stance: eyes to the camera, barrel to the crosshair ----
  // (a clip from another library starts from its own idle: the reload gets its own framing, measured on its first frame,
  // and the stance blends into it for the reload, so the gun stays where it was instead of jumping across the screen)
  const fits = {};
  function measure(k, clipName, at, S) {
    cur = k; for (const w of Object.values(weapons)) w.obj.visible = w === weapons[k];
    stance.position.set(0, 0, 0); stance.quaternion.identity(); kick.position.set(0, 0, 0); kick.quaternion.identity();
    camera.remove(kick); kick.updateMatrixWorld(true);
    mixer.stopAllAction(); act = null; oneShot = null;
    play(clipName, { fade: 0 }); act.time = at; pose();
    const head = B.Head.getWorldPosition(new THREE.Vector3());
    const neck = (B.Neck || B.Head).getWorldPosition(new THREE.Vector3());
    const eye = head.clone().lerp(neck, -0.2);                           // a touch above the head bone: the eyes
    const barrel = weapons[k].forward(new THREE.Vector3()).normalize();
    // the eyes look along the barrel: q = Rx(-pitch) * Ry(-yaw) turns the barrel onto -Z
    const yaw = Math.atan2(-barrel.x, -barrel.z), pitch = Math.asin(THREE.MathUtils.clamp(barrel.y, -1, 1));
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw + S.right);
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitch + S.drop);
    const q = qx.multiply(qy);
    const eyeR = eye.clone().applyQuaternion(q);
    camera.add(kick);
    return { q, base: eyeR.clone().negate(), pos: eyeR.negate().add(new THREE.Vector3(...S.eye)) };
  }
  for (const k of ['pistol', 'shotgun']) {
    const S = STANCE[k];
    // the shotgun is placed by code along the pistol hold's aim (placeShotgun): it shares the pistol's framing
    if (S.custom) { const F = fits.pistol; fits[k] = { q: F.q.clone(), base: F.base.clone(), pos: F.base.clone().add(new THREE.Vector3(...S.eye)) }; continue; }
    fits[k] = measure(k, S.idle, S.at, S);
    if (S.reload && data.clips.get(S.reload[0])) fits[k + ':reload'] = measure(k, S.reload[0], (S.reload[1] || 0) + 0.03, S);
  }
  mixer.stopAllAction(); act = null;
  cur = 'pistol'; weapons.pistol.obj.visible = true;
  function applyFit() { const F = fits[cur]; stance.quaternion.copy(F.q); stance.position.copy(F.pos); follow.set(0, 0, 0); followQ?.identity(); }
  // where the hands sit (in the kick group's space) in each stance's idle: during a reload or a flinch the clip carries
  // the hands down to the waist, so the stance follows them (most of the way) to keep the hands and gun on screen
  const follow = new THREE.Vector3(), _fw = new THREE.Vector3(), followQ = new THREE.Quaternion(), _qI = new THREE.Quaternion();
  const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  data.root.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) m.clippingPlanes = [clip]; });
  for (const w of Object.values(weapons)) w.obj.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) { m.clippingPlanes = [clip]; m.side = THREE.DoubleSide; } });
  const handsMid = (out) => B.LeftHand.getWorldPosition(out).add(B.RightHand.getWorldPosition(_fw)).multiplyScalar(0.5);
  for (const k of ['pistol', 'shotgun']) {
    cur = k; applyFit(); mixer.stopAllAction(); act = null; play(STANCE[k].idle, { fade: 0 }); act.time = STANCE[k].at; mixer.update(0);
    camera.updateMatrixWorld(true); kick.updateMatrixWorld(true);
    fits[k].mid = kick.worldToLocal(handsMid(new THREE.Vector3()));
  }
  cur = 'pistol';
  applyFit();
  play(STANCE.pistol.idle, { fade: 0 });

  // ---- the shotgun: grip in the right fist, barrel down the crosshair, the left hand on the pump by two-bone IK ----
  const sg = weapons.shotgun, sgInner = sg.obj.children[0];
  const sgGripL = sgInner.getObjectByName('GameGrip_L'), sgPump = sgInner.getObjectByName('Shotgun_Pump') || sgInner.getObjectByName('Pump');
  if (sgGripL && sgPump) sgPump.attach(sgGripL);                      // the support grip rides the pump
  const _kq = new THREE.Quaternion(), _tq = new THREE.Quaternion(), _r = new THREE.Vector3(), _t = new THREE.Vector3(), _pole = new THREE.Vector3();
  const SG_GRIP = new THREE.Vector3(...(params.get('sggrip') || '0.12,-0.21,-0.07').split(',').map(Number));   // kick space
  const SG_TURN = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.02, Math.PI, 0));
  // a shell for the reload (yola-zombie's shotgun_shell.glb), in the left hand
  let shell = null;
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(BASE + 'models/fps/shotgun_shell.glb').then(g => {
    shell = g.scene; const bb = new THREE.Box3().setFromObject(shell), sz = bb.getSize(new THREE.Vector3());
    shell.scale.setScalar(0.07 / Math.max(sz.x, sz.y, sz.z, 0.001)); onLayer(shell); shell.visible = false; scene.add(shell);
    shell.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) m.clippingPlanes = [clip]; });
  }).catch(() => {});
  function rotateBone(bone, from, to) {
    if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
    _tq.setFromUnitVectors(from.normalize(), to.normalize());
    const pw = bone.parent.getWorldQuaternion(new THREE.Quaternion()), bw = bone.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(pw.invert().multiply(_tq.multiply(bw)));
    bone.updateMatrixWorld(true);
  }
  function ikArm(side, T, pole) {
    const A = B[side + 'Arm'], E = B[side + 'ForeArm'], H = B[side + 'Hand']; if (!A || !E || !H) return;
    const a = A.getWorldPosition(new THREE.Vector3()), e = E.getWorldPosition(new THREE.Vector3()), h = H.getWorldPosition(new THREE.Vector3());
    const l1 = a.distanceTo(e), l2 = e.distanceTo(h);
    const dir = T.clone().sub(a); const d = THREE.MathUtils.clamp(dir.length(), 0.02, (l1 + l2) * 0.999); dir.normalize();
    const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const elbow = a.clone().addScaledVector(dir, cosA * l1).addScaledVector(perp, sinA * l1);
    rotateBone(A, e.clone().sub(a), elbow.clone().sub(a));
    const e2 = E.getWorldPosition(new THREE.Vector3()), h2 = H.getWorldPosition(new THREE.Vector3());
    rotateBone(E, h2.sub(e2), T.clone().sub(e2));
  }
  let dbgT = null;
  function placeShotgun(dt) {
    // grip: between the right wrist and the middle knuckle; aim: the camera's forward (the kick group's -Z)
    kick.getWorldQuaternion(_kq);
    // the right hand comes in to a long-gun grip (the pistol hold has the arms out straight: the pump would be out of reach)
    ikArm('Right', kick.localToWorld(_t.copy(SG_GRIP).add(_r.set(-0.03, 0.05, -0.1).multiplyScalar(st.sgLoad))), _pole.set(0.7, -1, 0.2).applyQuaternion(_kq));
    const R = B.RightHand.getWorldPosition(_r); if (B.RightHandMiddle1) R.lerp(B.RightHandMiddle1.getWorldPosition(_t), 0.5);
    sg.obj.quaternion.copy(_kq).multiply(SG_TURN);
    // reload: the gun rolls over to show its loading port
    if (st.sgLoad > 0.001) sg.obj.quaternion.multiply(_tq.setFromEuler(new THREE.Euler(-0.1 * st.sgLoad, 0, -0.65 * st.sgLoad)));
    sg.obj.position.copy(R); sg.obj.scale.setScalar(1);
    sg.obj.updateMatrixWorld(true);
    // the left hand: on the pump, or fetching a shell from the belt to the port under the receiver
    const pump = sgGripL ? sgGripL.getWorldPosition(new THREE.Vector3()) : sg.obj.localToWorld(new THREE.Vector3(0, -0.03, 0.4));
    let T = pump.addScaledVector(_t.set(0, -1, 0).applyQuaternion(_kq), 0.035);
    if (st.shellT >= 0) {
      const port = sgInner.localToWorld(new THREE.Vector3(0.06, -0.06, 0));
      const belt = kick.localToWorld(new THREE.Vector3(-0.05, -0.27, -0.42));
      const u = st.shellT, k = u < 0.45 ? u / 0.45 : u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;   // belt -> port, push, back
      const from = u < 0.45 ? belt : port, pushIn = u >= 0.45 && u < 0.75 ? (u - 0.45) / 0.3 : 0;
      T = belt.clone().lerp(port, Math.min(1, k)).add(_t.set(0, 0, -0.04 * pushIn).applyQuaternion(_kq));
      if (shell) { shell.visible = u < 0.7; shell.position.copy(T); shell.quaternion.copy(sg.obj.quaternion); shell.updateMatrixWorld(true); }
    } else if (shell) shell.visible = false;
    _pole.set(-0.6, -1, 0.3).applyQuaternion(_kq);
    ikArm('Left', T, _pole);
    dbgT = T.clone();
  }

  let swapT = -1, swapTo = null, onMid = null, reloadT = 0;
  const st = { bob: 0, bobAmp: 0, swayX: 0, swayY: 0, kick: 0, kickRot: 0, land: 0, shove: 0, reload: 0, reloadDur: 1, slapped: false, rfit: 0, sgLoad: 0, sgLoading: false, shellT: -1 };

  return {
    weapons,
    get current() { return cur; },
    get weapon() { return weapons[cur]; },
    setAspect() {},
    /** debug: move a stance's eye offset live */
    tune(k, eye) { STANCE[k].eye = eye; fits[k].pos.copy(fits[k].base).add(new THREE.Vector3(...eye)); if (k === cur) applyFit(); },
    muzzleWorld(out = new THREE.Vector3()) { kick.updateMatrixWorld(true); return weapons[cur].muzzleWorld(out); },
    fire() {
      st.kick = 1; st.kickRot = 1; weapons[cur].kick(1);
      const S = STANCE[cur];
      if (S.shoot && data.clips.get(S.shoot) && !(oneShot && oneShot.reload)) play(S.shoot, { fade: 0.04, loop: false, rate: 1.6, to: 0.5 });
    },
    // reloads are first-person moves on top of her idle hold (her full-body reload clips swing the gun round her body,
    // which reads badly from behind the hands): tilt the gun in and down, a slap / pump halfway, back up
    // the shotgun: shell by shell (main.js calls insertShell for each, endReload at the end)
    debug() { const c = camera, f = (o) => c.worldToLocal(o.getWorldPosition(new THREE.Vector3())).toArray().map(v => +v.toFixed(3)); const w = (o) => o.getWorldPosition(new THREE.Vector3()).toArray().map(v => +v.toFixed(3)); let sm = null; data.model.traverse(o => { if (o.isSkinnedMesh && !sm) sm = o; }); const chain = []; for (let n = B.RightHand; n; n = n.parent) chain.push(n.name + ':' + n.scale.x.toFixed(3)); return { T: dbgT && camera.worldToLocal(dbgT.clone()).toArray().map(v => +v.toFixed(3)), grip: sgGripL && f(sgGripL), pumpN: sgPump && f(sgPump), la: f(B.LeftArm), lfa: f(B.LeftForeArm), cam: w(camera), headW: w(B.Head), rhW: w(B.RightHand), smScaleW: sm.getWorldScale(new THREE.Vector3()).x, boneInSkel: sm.skeleton.bones.includes(B.RightHand), chain: chain.slice(-6), cur, sgVis: sg.obj.visible, sg: f(sg.obj), rh: f(B.RightHand), lh: f(B.LeftHand), head: f(B.Head), sgParent: sg.obj.parent?.type, scale: sg.obj.scale.x, kids: sg.obj.children.length }; },
    insertShell() { st.shellT = 0; },
    endReload() { if (st.sgLoading) { st.sgLoading = false; st.shellT = -1; setTimeout(() => weapons.shotgun.kick(1), 160); } },
    reload(dur) {
      if (cur === 'shotgun') { st.sgLoading = true; return; }
      const R = STANCE[cur].reload, clip = R && data.clips.get(R[0]);
      if (clip && !params.has('procreload')) {
        const from = R[1] || 0, to = R[2] ?? clip.duration;
        play(R[0], { fade: 0.1, loop: false, from, to, rate: (to - from) / dur }); oneShot.reload = true;
      } else { st.reload = 0.0001; st.reloadDur = dur; weapons[cur].kick(0); }
    },
    cancelReload() { st.reload = 0; st.sgLoading = false; st.shellT = -1; if (oneShot?.reload) { oneShot = null; play(STANCE[cur].idle, { fade: 0.12 }); } },
    pumpAction() { weapons[cur].kick(1); },
    shove() { st.shove = 0.0001; },
    swap(to, mid) { if (to === cur || swapTo) return false; swapTo = to; swapT = 0; onMid = mid; return true; },
    get swapping() { return !!swapTo; },
    hit() { st.land = 1; },
    setVisible(v) { kick.visible = v; for (const w of Object.values(weapons)) w.obj.visible = v && w === weapons[cur]; },
    update(dt, { speed = 0, lookDX = 0, lookDY = 0, t = 0 }) {
      mixer.update(dt);
      if (oneShot && (oneShot.a.time >= oneShot.to || !oneShot.a.isRunning())) { oneShot = null; play(STANCE[cur].idle, { fade: 0.2 }); }
      for (const b of collapse) b.scale.setScalar(0.001);
      // swap: down, change, up
      let sw = 0;
      if (swapTo) {
        swapT += dt / 0.45;
        if (swapT >= 0.5 && cur !== swapTo) {
          weapons[cur].obj.visible = false; cur = swapTo; weapons[cur].obj.visible = true; applyFit();
          oneShot = null; play(STANCE[cur].idle, { fade: 0.05 }); onMid?.();
        }
        sw = Math.sin(Math.min(1, swapT) * Math.PI);
        if (swapT >= 1) swapTo = null;
      }
      // walk bob, breathing, look sway
      st.bobAmp += (Math.min(1, speed / 4.2) - st.bobAmp) * damp(8, dt);
      st.bob += dt * (6.5 + speed * 0.6);
      const bx = Math.cos(st.bob) * 0.012 * st.bobAmp, by = -Math.abs(Math.sin(st.bob)) * 0.014 * st.bobAmp, br = Math.sin(t * 1.6) * 0.003;
      st.swayX += (-lookDX * 0.0008 - st.swayX) * damp(10, dt); st.swayY += (lookDY * 0.0008 - st.swayY) * damp(10, dt);
      st.swayX = THREE.MathUtils.clamp(st.swayX, -0.04, 0.04); st.swayY = THREE.MathUtils.clamp(st.swayY, -0.03, 0.03);
      // recoil
      st.kick = Math.max(0, st.kick - dt * (cur === 'shotgun' ? 4 : 9));
      st.kickRot = Math.max(0, st.kickRot - dt * (cur === 'shotgun' ? 3 : 7));
      const P = STANCE[cur].push, k2 = st.kick * st.kick, kr = Math.sin(Math.min(1, st.kickRot) * Math.PI * 0.5);
      // shove: the whole body lunges forward and drops the gun a little
      let sh = 0;
      if (st.shove > 0) { st.shove += dt / 0.34; const u = Math.min(1, st.shove); sh = u < 0.3 ? u / 0.3 : 1 - (u - 0.3) / 0.7; sh = sh * sh * (3 - 2 * sh); if (u >= 1) st.shove = 0; }
      st.land = Math.max(0, st.land - dt * 4);
      // reload: in (0-30%), the work (30-75%, a slap or pump at ~55%), out
      let rl = 0, slap = 0;
      if (st.reload > 0) {
        st.reload += dt / st.reloadDur; const u = Math.min(1, st.reload);
        rl = u < 0.3 ? u / 0.3 : u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1; rl = rl * rl * (3 - 2 * rl);
        if (u > 0.55 && !st.slapped) { st.slapped = true; weapons[cur].kick(1); }
        slap = u > 0.55 && u < 0.65 ? Math.sin((u - 0.55) / 0.1 * Math.PI) : 0;
        if (u >= 1) { st.reload = 0; st.slapped = false; }
      }
      const pis = cur === 'pistol';
      kick.position.set(bx + st.swayX - sh * 0.05 - rl * (pis ? 0.04 : 0.02), by + br + st.swayY - sw * 0.35 - st.land * 0.03 - sh * 0.04 - rl * 0.05 + slap * 0.015, k2 * P[2] - sh * 0.22 + rl * 0.04);
      kick.rotation.set(kr * P[1] * 3 - sw * 0.5 + sh * 0.25 + rl * (pis ? 0.35 : 0.12) + slap * 0.08 + st.land * 0.1, st.swayX * 2 - sh * 0.35 + rl * (pis ? 0.25 : 0.1), st.swayX * 3 + bx * 2 + sh * 0.3 + rl * (pis ? 0.7 : 0.25));
      // every turn pivots on the hands (fits[].mid), not on the eye, so the gun tilts in place instead of swinging past the face
      { const mid = fits[cur].mid; kick.position.add(mid).sub(_a.copy(mid).applyEuler(kick.rotation)); }
      kick.updateMatrixWorld(true);
      // the reload's own framing, blended in and out
      {
        const R = fits[cur + ':reload'], F = fits[cur];
        st.rfit += ((oneShot?.reload ? 1 : 0) - st.rfit) * damp(10, dt);
        if (R && st.rfit > 0.001) {
          stance.position.copy(F.pos).lerp(_b.copy(R.base).add(new THREE.Vector3(...STANCE[cur].eye)), st.rfit);
          stance.quaternion.copy(F.q).slerp(R.q, st.rfit);
        } else { stance.position.copy(F.pos); stance.quaternion.copy(F.q); }
        kick.updateMatrixWorld(true);
      }
      // nothing of her closer than 15 cm to the eye draws (the shoulders in a reload)
      camera.getWorldDirection(_fw); clip.normal.copy(_fw); clip.constant = -_fw.dot(camera.getWorldPosition(_a)) - 0.06;
      const w = weapons[cur]; w.update(dt);
      if (cur === 'shotgun') {
        st.sgLoad += ((st.sgLoading ? 1 : 0) - st.sgLoad) * damp(9, dt);
        if (st.shellT >= 0) { st.shellT += dt / 0.42; if (st.shellT >= 1) st.shellT = -1; }
        placeShotgun(dt);
      } else w.place(actorLike);
    },
  };
}
