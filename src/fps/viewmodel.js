// Yola's arms and gun in first person, from her real rig: the deckbuilder's yola.glb with her own clips (pistol_idle /
// pistol_reload for the pistol, rifle_aim_idle / sg_reload for the shotgun, pistol_hit when she's hurt, a sword jab for the
// shove) and the weapon held by weapons.js exactly as in the battles (placePistol with her Rig Lab fit; the shotgun along
// her forearm). The whole body hangs off the camera so the camera sits just behind her arms: per stance, a fixed
// transform puts her eyes at the camera and turns the barrel onto the crosshair (measured from the stance's first frame).
// Her head is collapsed (never in view). She draws on layer 1, after the world with the depth cleared, so the gun never
// pokes into walls but is lit by the room's own lights (main.js enables layer 1 on every light).
// Procedural feel on top: walk bob, look sway, recoil kick, slide / pump kick, the hit flinch.
import * as THREE from 'three';
import { character } from '../render/assets.js';
import { createWeapon } from '../render/weapons.js';

export const VM_LAYER = 1;
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();

// per weapon: idle clip (and the frame it's measured at), reload clip [from, to] in clip s, where the eyes sit relative
// to the camera (x right, y up, z back, m), and how far below / right of the crosshair the barrel points (rad)
const STANCE = {
  pistol: { idle: 'pistol_idle', at: 0.2, reload: ['pistol_reload', 0.1, 1.6], eye: [0.0, -0.06, -0.06], drop: 0.0, right: 0.0, push: [0.02, 0.07, 0.06] },
  shotgun: { idle: 'rifle_aim_idle', at: 0.3, reload: ['sg_reload', 0.3, 3.0], eye: [0.0, 0.08, 0.0], drop: 0.0, right: 0.0, push: [0.03, 0.05, 0.02] },
};

function onLayer(o) { o.traverse(m => { m.layers.set(VM_LAYER); if (m.isMesh) { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; } }); }

export async function createViewmodel({ scene, camera }) {
  const data = await character('yola');
  const mixer = new THREE.AnimationMixer(data.model);
  const B = data.bones;
  // three groups: kick (recoil / bob, in camera space) > stance (the measured fit) > body (data.root, the model)
  const kick = new THREE.Group(); camera.add(kick);
  const stance = new THREE.Group(); kick.add(stance);
  stance.add(data.root);
  onLayer(data.root);
  const actorLike = { bones: B, rigScale: data.height / 1.62, id: 'yola' };
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
  const fits = {};
  for (const k of ['pistol', 'shotgun']) {
    const S = STANCE[k];
    cur = k; weapons[k].obj.visible = true;
    stance.position.set(0, 0, 0); stance.quaternion.identity(); kick.position.set(0, 0, 0); kick.quaternion.identity();
    // measure in camera space: detach the chain from the camera for the measurement
    camera.remove(kick);
    kick.updateMatrixWorld(true);
    play(S.idle, { fade: 0 }); act.time = S.at; pose();
    const head = B.Head.getWorldPosition(new THREE.Vector3());
    const neck = (B.Neck || B.Head).getWorldPosition(new THREE.Vector3());
    const eye = head.clone().lerp(neck, -0.2);                           // a touch above the head bone: the eyes
    const barrel = weapons[k].forward(new THREE.Vector3()).normalize();
    // the eyes look along the barrel: yaw then pitch so the barrel becomes -Z (with the stance's small aim offsets)
    const yaw = Math.atan2(-barrel.x, -barrel.z), pitch = Math.asin(THREE.MathUtils.clamp(barrel.y, -1, 1));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch + S.drop, -yaw + S.right, 0, 'XYZ'));
    // apply yaw first then pitch: q = Rx(-pitch) * Ry(-yaw)
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw + S.right);
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitch + S.drop);
    q.copy(qx).multiply(qy);
    const eyeR = eye.clone().applyQuaternion(q);
    fits[k] = { q, pos: eyeR.negate().add(new THREE.Vector3(...S.eye)) };
    camera.add(kick);
    weapons[k].obj.visible = false;
  }
  cur = 'pistol'; weapons.pistol.obj.visible = true;
  function applyFit() { const F = fits[cur]; stance.quaternion.copy(F.q); stance.position.copy(F.pos); }
  applyFit();
  play(STANCE.pistol.idle, { fade: 0 });

  let swapT = -1, swapTo = null, onMid = null, reloadT = 0;
  const st = { bob: 0, bobAmp: 0, swayX: 0, swayY: 0, kick: 0, kickRot: 0, land: 0, shove: 0 };

  return {
    weapons,
    get current() { return cur; },
    get weapon() { return weapons[cur]; },
    setAspect() {},
    muzzleWorld(out = new THREE.Vector3()) { kick.updateMatrixWorld(true); return weapons[cur].muzzleWorld(out); },
    fire() {
      st.kick = 1; st.kickRot = 1; weapons[cur].kick(cur === 'shotgun' ? 1 : 1);
    },
    reload(dur) {
      const [clip, from, to] = STANCE[cur].reload;
      play(clip, { fade: 0.12, loop: false, from, to, rate: (to - from) / dur });
      reloadT = dur;
    },
    cancelReload() { if (oneShot) { oneShot = null; play(STANCE[cur].idle, { fade: 0.15 }); } reloadT = 0; },
    pumpAction() { weapons[cur].kick(1); },
    shove() { st.shove = 0.0001; },
    swap(to, mid) { if (to === cur || swapTo) return false; swapTo = to; swapT = 0; onMid = mid; return true; },
    get swapping() { return !!swapTo; },
    hit() { st.land = 1; if (!oneShot) play('pistol_hit', { fade: 0.08, loop: false, from: 0.15, to: 0.7, rate: 1.6 }); },
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
      kick.position.set(bx + st.swayX - sh * 0.05, by + br + st.swayY - sw * 0.35 - st.land * 0.03 - sh * 0.04, k2 * P[2] + P[0] * kr * 0 - sh * 0.22);
      kick.rotation.set(kr * P[1] * 3 - sw * 0.5 + sh * 0.25, st.swayX * 2 - sh * 0.35, st.swayX * 3 + bx * 2 + sh * 0.3);
      kick.updateMatrixWorld(true);
      const w = weapons[cur]; w.update(dt); w.place(actorLike);
    },
  };
}
