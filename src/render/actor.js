// An Actor is one character on the battle stage: Marc, Yola or a zombie. It owns the animation mixer (every clip file of
// the character on one skeleton), the stance idle, crossfades, the melee dash, hit reactions, deaths, revive, the weapon
// in hand, the target highlight, the white hit flash and the world anchors the HUD hangs things on.
//   const a = new Actor(stage, await character('marc'), { kind: 'hero', id: 'marc' })
//   await a.play('ual_Sword_Regular_A', { from: 0.05, timeScale: 1.4 })     resolves at the end (or at `to`)
//   a.attack('melee_light', target)   the director's helper: picks the clip, times it so the hit lands at ~0.27 s
// Long clips (bat_swing is 2 s) are played from an offset at a speed so the impact lands on the beat: CLIP_TIMING holds,
// per clip, where the motion starts, the impact frame (measured: where the weapon tip / striking hand moves fastest) and
// where it is done. Everything runs on the stage's game time (speed setting, slow-mo, hit-stop).
import * as THREE from 'three';
import { createWeapon, WEAPONS, DEFAULT_WEAPON } from './weapons.js';

// clip: { start, impact, end } in clip seconds, measured in labs/render.html?measure=<who> (impact: where the weapon tip,
// or a zombie's faster hand, moves fastest), then nudged by eye on contact sheets. yaw: the hero's world facing for a
// target straight along +x (the batting clips swing toward the model's left, the sword set toward its front); reach: how
// far ahead of the target's centre the striker stands (m); travel: forward root motion the clip already has (zombies).
export const CLIP_TIMING = {
  // Marc: every strike sweeps through the front of the body at its impact (the heading of the bat tip ~0), so the yaws
  // face the target, turned ~0.15 rad toward the camera
  bat_swing: { start: 0.9, impact: 1.245, end: 1.75, yaw: 1.4, reach: 1.15 },
  ual1_Sword_Attack: { start: 0.2, impact: 0.45, end: 1.05, yaw: 1.45, reach: 1.25 },
  ual_Sword_Regular_A: { start: 0.0, impact: 0.25, end: 0.47, yaw: 1.4, reach: 1.1 },
  ual_Sword_Regular_B: { start: 0.05, impact: 0.283, end: 0.57, yaw: 1.4, reach: 1.15 },
  ual_Sword_Regular_C: { start: 0.4, impact: 0.7, end: 1.35, yaw: 1.45, reach: 1.25 },
  ual_Sword_Heavy_D: { start: 0.3, impact: 0.655, end: 1.3, yaw: 1.15, reach: 1.3 },
  ual_Sword_Dash: { start: 0.12, impact: 0.35, end: 1.0, yaw: 1.4, reach: 1.15 },
  melee_horizontal: { start: 0.62, impact: 0.985, end: 1.6, yaw: 1.5, reach: 1.2 },
  hub_crowbar_combo: { start: 0.42, impact: 0.67, end: 1.45, yaw: 1.4, reach: 1.1 },
  hub_execution_B_uppercut: { start: 0.1, impact: 0.685, end: 1.6, yaw: 1.55, reach: 1.15 },
  hub_execution_C_uppercut_mirrored: { start: 0.1, impact: 0.685, end: 1.6, yaw: 1.55, reach: 1.15 },
  gs_low_slash: { start: 0.6, impact: 0.985, end: 1.5, yaw: 1.45, reach: 1.0 },
  ual_Sword_Block: { start: 0.0, impact: 0.25, end: 1.1, yaw: 1.25 },
  // zombies (they keep their root motion; reach = hips to the hero's centre at the impact)
  ual_Zombie_Scratch: { start: 0.3, impact: 0.63, end: 1.3, reach: 0.8 },
  scratch: { start: 0.3, impact: 0.63, end: 1.3, reach: 0.8 },
  attack: { start: 0.6, impact: 1.08, end: 1.8, reach: 0.85 },
  ual_Zombie_Bite: { start: 0.15, impact: 0.47, end: 1.1, reach: 0.7 },
  shield_bash: { start: 0.0, impact: 0.13, end: 0.85, reach: 1.0 },
  slam: { start: 0.3, impact: 0.75, end: 1.37, reach: 0.9, travel: 0.9 },
  slam_b: { start: 0.3, impact: 0.72, end: 1.6, reach: 0.9 },
  shield_dash: { start: 0.0, impact: 0.45, end: 1.1, reach: 0.9 },
  guard_leap_slam: { start: 1.3, impact: 2.5, end: 3.4, reach: 1.0 },
};

// deaths: [clip, start s, on the floor s] (yola-zombie's DEATHS table, 30 fps frames / 30)
const DEATH = {
  death_back: [0.23, 1.77], death_chest_back: [0.67, 2.2], death_forward: [0.33, 2.23], death_headshot_knees: [0.6, 2.33],
  death_hit_back: [0.23, 1.8], death_hit_forward: [0.33, 2.2], knockback: [0.0, 0.8], death_defeat: [0.0, 3.2], death_fall: [0.0, 1.9],
};

// which clip each card anim plays on each hero (first available wins)
export const HERO_ANIMS = {
  marc: {
    melee_light: ['ual1_Sword_Attack', 'bat_swing'], melee_heavy: ['bat_swing', 'ual_Sword_Regular_C'], smash: ['ual_Sword_Heavy_D'],
    melee_sweep: ['melee_horizontal'], melee_combo: ['ual1_Sword_Attack', 'ual_Sword_Regular_B', 'bat_swing'],
    block: ['ual_Sword_Block'], dodge: ['ual1_Dodge_Left'], buff: ['ual1_Sword_Enter'], debuff: ['ual_Sword_Regular_B'], throw: ['ual_Sword_Regular_B'],
    heal: ['ual1_Sword_Enter'], hit: ['hit_body'], finisher: ['hub_execution_B_uppercut'],
    defeat: ['death_defeat', 'death_fall'], victory: ['ual1_Sword_Exit'],
  },
  yola: {
    block: ['ual1_Dodge_Right'], dodge: ['ual1_Dodge_Right', 'ual1_Dodge_Left'], buff: ['pistol_reload'], heal: ['pistol_reload'],
    debuff: ['pistol_reload'], throw: ['pistol_reload'], hit: ['pistol_hit', 'hit_body'], defeat: ['death_fall', 'death_defeat'],
    reload: ['pistol_reload'], melee_light: ['ual_Sword_Regular_A'],
  },
};
// world facing of each stance for zombies straight along +x (the batting stance faces the camera, front shoulder to them)
export const STANCE_YAW = { bat_idle: 0.32, pistol_idle: Math.PI / 2 - 0.3, rifle_aim_idle: Math.PI / 2 - 0.3, ual1_Idle_Loop: Math.PI / 2 - 0.35, ual_Sword_Block: 1.2 };
export const LOW_READY = { arm: 0.42, wrist: -0.15, chest: 0.05 };
const ZOMBIE_IDLES = ['idle', 'ual_Zombie_Idle_Loop'];
const ZOMBIE_ATTACKS = ['ual_Zombie_Scratch', 'scratch', 'ual_Zombie_Bite', 'attack'];

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

let blobTex = null;
function blobTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.5, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c); return blobTex;
}

export class Actor {
  constructor(stage, data, { kind = 'enemy', id, uid, scale = 1, home, yaw, model } = {}) {
    this.stage = stage; this.data = data; this.kind = kind;
    this.id = id || data.key; this.uid = uid || this.id; this.model = model || data.key;
    this.bones = data.bones; this.clips = data.clips;
    this.isHero = kind === 'hero';
    this.scale = scale;
    this.height = data.height * scale;
    this.rigScale = this.height / 1.62;
    this.root = new THREE.Group(); this.root.name = 'actor:' + this.uid;
    this.body = new THREE.Group(); this.root.add(this.body);
    data.root.scale.setScalar(scale);
    this.body.add(data.root);
    this.home = (home || new THREE.Vector3()).clone();
    this.root.position.copy(this.home);
    this.baseYaw = yaw ?? (this.isHero ? Math.PI / 2 - 0.32 : -Math.PI / 2 + 0.3);
    this.yaw = this.baseYaw; this.yawTarget = this.baseYaw;
    this.body.rotation.y = this.baseYaw;
    this.mixer = new THREE.AnimationMixer(data.model);
    this.actions = new Map();
    this.cur = null; this.pending = null; this.alt = false;
    this.weapon = null; this.weaponId = null;
    this.dead = false; this.lying = false; this.hidden = false;
    this.knock = { v: 0, x: 0 };                 // knockback spring along -facing (m)
    this.bend = { v: 0, x: 0 };                  // spine flinch spring (rad)
    this.recoil = 0;                             // Yola's arm kick (0..1)
    this.flashI = 0; this.flashC = new THREE.Color(1, 1, 1);
    this.hl = 0; this.hlTarget = 0; this.hlC = new THREE.Color(0xffd166);
    this.fade = 1; this.sink = 0;
    this.tweens = [];
    this.collapsed = [];                          // bones scaled to nothing after the mixer (a popped head)
    this.mats = [];
    data.model.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.emissive) this.mats.push(m); m.userData.baseEmissive = m.emissive?.clone(); m.userData.baseTransparent = m.transparent; }); });
    this.gripPose = null;
    this.saved = new Map();                       // bone -> its clip pose before this frame's corrections

    // contact blob under the hips
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.75 }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.renderOrder = 2;
    const bs = (this.isHero ? 0.9 : 0.95) * Math.max(1, scale * 0.95);
    this.blob.scale.set(bs, bs * 0.62, 1);
    stage.scene.add(this.blob);
    // target ring
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 48), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.012; this.ring.scale.setScalar(Math.max(1, scale)); this.ring.renderOrder = 3;
    this.root.add(this.ring);
    // pick proxy (a box round the body; raycast only)
    this.proxy = new THREE.Mesh(new THREE.BoxGeometry(0.85 * Math.max(1, scale * 0.9), this.height * 1.02, 0.85), new THREE.MeshBasicMaterial({ visible: false }));
    this.proxy.position.y = this.height * 0.51;
    this.body.add(this.proxy);
    this.unpick = stage.addPickable ? stage.addPickable(this.isHero ? this.id : this.uid, this.proxy, this) : null;

    stage.scene.add(this.root);
    this.unsub = stage.onFrame(dt => this.update(dt));
    this.idle({ fade: 0, phase: Math.random() });
  }

  // ---- clips ----
  clip(name) { return this.clips.get(name) || null; }
  has(name) { return this.clips.has(name); }
  pickClip(list) { for (const n of [].concat(list)) if (this.has(n)) return n; return null; }
  action(name, alt = false) {
    const key = alt ? name + '#alt' : name;
    let a = this.actions.get(key);
    if (!a) {
      let c = this.clip(name); if (!c) return null;
      if (alt) { c = c.clone(); c.name = key; }
      a = this.mixer.clipAction(c); this.actions.set(key, a);
    }
    return a;
  }
  duration(name) { return this.clip(name)?.duration || 0; }

  /** Play a clip. Resolves at its end (or when it reaches `to`). then: 'idle' (default) | 'hold' | null | a clip name. */
  play(name, { loop = false, fade = 0.12, timeScale = 1, from = 0, to = null, then = 'idle', thenFade = 0.22 } = {}) {
    if (!this.has(name)) return Promise.resolve(false);
    if (this.pending) { const p = this.pending; this.pending = null; p.resolve(false); }
    // replaying the clip that is playing: use its twin so the two can crossfade
    const alt = this.cur && this.cur.getClip().name.replace('#alt', '') === name ? !this.cur.getClip().name.endsWith('#alt') : false;
    const a = this.action(name, alt);
    a.reset(); a.enabled = true;
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.timeScale = timeScale; a.time = Math.max(0, from);
    a.setEffectiveWeight(1);
    a.play();
    if (this.cur && this.cur !== a && fade > 0) this.cur.crossFadeTo(a, fade, false);
    else if (this.cur && this.cur !== a) this.cur.stop();
    for (const [, other] of this.actions) if (other !== a && other !== this.cur && other.isRunning() && other.getEffectiveWeight() < 1e-3) other.stop();
    this.cur = a;
    if (loop && to == null) return Promise.resolve(true);
    const end = to ?? a.getClip().duration;
    return new Promise(resolve => { this.pending = { a, end: Math.min(end, a.getClip().duration - 1e-3), resolve, then, thenFade }; });
  }

  stanceClip() {
    if (this.isHero) {
      const w = this.weapon?.kind;
      if (this.id === 'marc') return w === 'pistol' ? 'pistol_idle' : this.pickClip(['bat_idle', 'ual1_Sword_Idle', 'ual1_Idle_Loop']);
      return w === 'shotgun' ? this.pickClip(['rifle_aim_idle', 'pistol_idle']) : this.pickClip(['pistol_idle', 'ual1_Idle_Loop']);
    }
    if (this.mode === 'defensive' && this.has('shield_idle')) return 'shield_idle';
    if (!this.idleName) this.idleName = this.pickClip(Math.random() < 0.5 ? ZOMBIE_IDLES : [...ZOMBIE_IDLES].reverse());
    return this.idleName;
  }

  /** Back to the stance idle (looping; zombies get a random phase and rate so they don't sync). */
  idle({ fade = 0.25, phase = null } = {}) {
    if (this.dead) return;
    if (this.lying) return this.holdLying();
    const name = this.stanceClip(); if (!name) return;
    const rate = this.isHero ? 1 : 0.85 + Math.random() * 0.3;
    if (this.isHero && !this.lockYaw) this.turnTo(STANCE_YAW[name] ?? this.baseYaw, fade > 0 ? 220 : 0);
    this.play(name, { loop: true, fade, timeScale: rate, from: phase != null ? phase * this.duration(name) : 0 });
  }

  // ---- movement ----
  tween(obj, key, to, ms, ease = easeOut) {
    return new Promise(resolve => {
      const from = obj[key].clone ? obj[key].clone() : obj[key];
      for (const t of this.tweens) if (t.obj === obj && t.key === key && !t.done) { t.done = true; t.resolve(false); }
      this.tweens.push({ obj, key, from, to: to.clone ? to.clone() : to, t: 0, d: Math.max(1e-3, ms / 1000), ease, resolve });
    });
  }
  /** Dash the whole actor to a world point (melee step-in). */
  dashTo(vec3, ms = 120) { return this.tween(this.root, 'position', vec3.clone().setY(0), ms, easeOut); }
  returnHome(ms = 200) { return this.tween(this.root, 'position', this.home.clone(), ms, easeInOut); }
  setHome(v) { this.home.copy(v); }
  /** Turn to face a world point (yaw in the floor plane), or back to the base facing with null. */
  face(point, ms = 100) {
    let y = this.baseYaw;
    if (point) { const d = _v.copy(point).sub(this.root.position); y = Math.atan2(d.x, d.z); }
    return this.turnTo(y, ms);
  }
  /** Turn to a world yaw (rad). */
  turnTo(yaw, ms = 120) {
    let d = yaw - this.yawTarget; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    if (ms <= 0) { for (const t of this.tweens) if (t.obj === this && t.key === 'yawTarget' && !t.done) { t.done = true; t.resolve(false); } this.yawTarget = this.yawTarget + d; return Promise.resolve(true); }
    return this.tween(this, 'yawTarget', this.yawTarget + d, ms, easeOut);
  }
  /** Facing direction on the floor (unit). */
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  // ---- combat beats ----
  /** A timed strike: plays `clip` so its impact lands `hitIn` seconds from now; resolves at the impact. */
  strike(clip, { hitIn = 0.27, after = 1.25, then = 'idle', fade = 0.08 } = {}) {
    const T = CLIP_TIMING[clip] || { start: 0, impact: this.duration(clip) * 0.45, end: this.duration(clip) };
    const rate = Math.max(0.6, (T.impact - T.start) / hitIn);
    this.play(clip, { from: T.start, timeScale: rate, fade, to: T.end, then });
    this.afterImpact = { a: this.cur, impact: T.impact, rate: after };
    return new Promise(resolve => this.timer(hitIn, () => resolve(true)));
  }
  timer(sec, fn) { this.tweens.push({ timer: true, t: 0, d: sec, fn }); }
  wait(sec) { return new Promise(r => this.timer(sec, r)); }

  /** Hit reaction: flash, a knock back along the hit, a short flinch clip. heavy: bigger. */
  hit({ heavy = false, fromDir = null, amount = 0, blocked = false } = {}) {
    if (this.dead) return;
    this.flash(blocked ? 0x9fd0ff : this.isHero ? 0xff8a7a : 0xffffff, blocked ? 0.6 : this.isHero ? 0.55 : 0.8);
    const k = blocked ? 0.04 : heavy ? 0.22 : 0.12;
    this.knock.v -= k * 14; this.bend.v -= (heavy ? 0.9 : 0.55) * (blocked ? 0.4 : 1) * 10;
    if (blocked) return;
    if (this.lying) return;
    if (this.isHero) {
      const c = this.pickClip(HERO_ANIMS[this.id]?.hit || ['hit_body']);
      if (c) this.play(c, { from: c === 'pistol_hit' ? 0.25 : 0.05, timeScale: 1.6, to: c === 'pistol_hit' ? 1.3 : 0.9, fade: 0.06 });
      return;
    }
    const c = heavy ? this.pickClip(['react_large_front', 'ual_Hit_Knockback', 'hit_stumble']) : this.pickClip(['ual1_Hit_Chest', 'ual1_Hit_Head', 'react_small_front', 'hit_flinch']);
    if (!c) return;
    const span = { ual1_Hit_Chest: [0, 0.37, 1.1], ual1_Hit_Head: [0, 0.47, 1.1], react_small_front: [0.05, 0.9, 1.5], hit_flinch: [0.1, 0.9, 1.6], react_large_front: [0.0, 1.2, 1.6], ual_Hit_Knockback: [0, 0.8, 1.2], hit_stumble: [0.1, 1.2, 1.7] }[c] || [0, 0.8, 1.4];
    this.play(c, { from: span[0], to: span[1], timeScale: span[2], fade: 0.05 });
  }

  /** Death: the killing kind picks the clip. Resolves when the body is on the floor; it sinks and fades after. */
  die(kind = 'light', { finisher = false, fadeAfter = 1.5, keep = false } = {}) {
    if (this.dead) return Promise.resolve();
    this.dead = true; this.highlight(false);
    this.stage.setPickable?.(this.uid, false);
    const has = n => this.has(n);
    let clip;
    if (this.lying) clip = null;
    else if (kind === 'gun') clip = has('death_headshot_knees') ? 'death_headshot_knees' : 'death_back';
    else if (kind === 'heavy' || kind === 'blast') clip = this.pickClip(Math.random() < 0.5 ? ['death_hit_back', 'death_chest_back'] : ['death_chest_back', 'death_hit_back']);
    else if (kind === 'bleed' || kind === 'self') clip = 'death_forward';
    else clip = Math.random() < 0.7 ? 'death_forward' : 'death_back';   // (forward: into the open floor, not onto the zombie behind)
    if (!has(clip)) clip = this.pickClip(['death_back', 'death_forward', 'death_fall']);
    const [s, floor] = DEATH[clip] || [0, this.duration(clip) * 0.6];
    const fall = finisher ? 1.3 : 1.05;
    const rate = (floor - s) / fall;
    if (clip) this.play(clip, { from: s, timeScale: rate, fade: 0.08, then: 'hold' });
    this.knock.v -= (kind === 'heavy' || kind === 'blast' ? 3.4 : 2.2);
    // the back-falls travel ~1 m: take half of it off so a body doesn't land on the zombie behind it
    if (clip && /back|knockback/.test(clip) && !finisher) this.tween(this.root, 'position', this.root.position.clone().addScaledVector(this.forward(new THREE.Vector3()), 0.5), fall * 1000);
    return new Promise(resolve => this.timer(fall, () => {
      resolve();
      if (!keep) this.timer(fadeAfter, () => this.vanish());
    }));
  }
  /** Sink through the floor and fade out (~0.8 s). */
  vanish(ms = 800) {
    this.fading = { t: 0, d: ms / 1000 };
    this.mats.forEach(m => { m.transparent = true; m.depthWrite = true; m.needsUpdate = true; });
  }
  /** Back on its feet (Nurse revive): rises with the spawn clip. */
  async revive() {
    this.dead = false; this.hidden = false; this.fading = null; this.fade = 1; this.sink = 0;
    this.root.visible = true; this.blob.visible = true;
    this.mats.forEach(m => { m.opacity = 1; m.transparent = !!m.userData.baseTransparent; m.needsUpdate = true; });
    this.restoreGore();
    this.stage.setPickable?.(this.uid, true);
    const c = this.pickClip(['ual_Zombie_Spawn', 'ual_KipUp', 'standup_back']);
    if (c === 'ual_Zombie_Spawn') await this.play(c, { from: 0.35, timeScale: 1.9, fade: 0.3, to: 2.75 });
    else if (c) await this.play(c, { timeScale: c === 'standup_back' ? 1.8 : 1.2, fade: 0.25 });
    this.idle();
  }

  /** A hero back on their feet at home (a new combat after a defeat, the title screen). */
  reset() {
    this.dead = false; this.hidden = false; this.fading = null; this.fade = 1; this.sink = 0; this.lift = 0;
    this.knock.x = this.knock.v = this.bend.x = this.bend.v = 0; this.recoil = 0; this.aiming = false;
    this.root.position.copy(this.home); this.setVisible(true);
    this.mats.forEach(m => { m.opacity = 1; m.transparent = !!m.userData.baseTransparent; m.needsUpdate = true; });
    this.restoreGore(); this.highlight(false);
    this.stage.setPickable?.(this.isHero ? this.id : this.uid, true);
    this.idle({ fade: 0.15 });
  }

  // put a popped head back (revive): bones back to size, head modules shown, wound caps hidden
  restoreGore() {
    for (const b of this.collapsed) b.scale.setScalar(1);
    this.collapsed.length = 0; this.headGone = false; this.finisherDone = false;
    this.data.model.traverse(o => { if (/^GORE_/.test(o.name)) o.visible = false; else if (/^(Nurse_Head|Patient_Head)$/.test(o.name)) o.visible = true; });
  }

  // ---- lying (the Sleeping Patient, on a recovery bed) ----
  async lieDown(on = true, { bed = false } = {}) {
    this.lying = on;
    if (on && bed && !this.bed) {
      try {
        const { prop } = await import('./assets.js');
        const b = await prop('recovery_bed');
        const box = new THREE.Box3().setFromObject(b), size = box.getSize(new THREE.Vector3());
        // long side along x, at the actor's spot; the body is raised to the mattress
        if (size.z > size.x) b.rotation.y = Math.PI / 2;
        const k = 2.1 / Math.max(size.x, size.z); b.scale.setScalar(k);
        b.position.copy(this.home); b.position.y = 0;
        this.stage.scene.add(b); this.bed = b;
        this.bedHeight = size.y * k * 0.78 + 0.08;
        b.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      } catch (e) { console.warn('[actor] no bed', e?.message); }
    }
    this.lift = on && this.bed ? (this.bedHeight || 0.55) : 0;
    if (on) this.holdLying(); else this.idle();
  }
  holdLying() {
    const c = this.pickClip(['ual_IdleToLay']);
    if (c) { const d = this.duration(c); this.play(c, { from: d - 0.06, to: d - 0.05, timeScale: 1, then: 'hold', fade: 0.0 }); }
  }
  async wake() {
    this.lying = false;
    const c = this.pickClip(['ual_LayToIdle', 'standup_back']);
    // off the bed: the body comes down to the floor in front of it as it sits up
    if (this.bed) { this.tween(this, 'lift', 0, 600); this.tween(this.root, 'position', this.home.clone().add(new THREE.Vector3(-0.75, 0, 0.35)), 600); this.home.add(new THREE.Vector3(-0.75, 0, 0.35)); }
    if (c) await this.play(c, { timeScale: 1.25, fade: 0.15 });
    this.idle();
  }

  // ---- attachments (the guard's shield): a child of a bone, placed in the bone's frame ----
  attach(obj, boneName, { at = 0.5, out = [0, 0, 0], rot = [0, 0, 0] } = {}) {
    const b = this.bones[boneName]; if (!b || !obj) return null;
    this.root.updateMatrixWorld(true);
    // the bone chain's scale (Mixamo rigs may be in cm): offsets in metres, the prop at its own size x the actor's scale
    const ws = b.getWorldScale(new THREE.Vector3()).x || 1;
    const child = b.children.find(c => c.isBone);
    const len = child ? child.position.length() : 0.25 / ws;
    obj.position.set(out[0] / ws, len * at + out[1] / ws, out[2] / ws);
    obj.rotation.set(rot[0], rot[1], rot[2]);
    obj.scale.setScalar((this.scale || 1) / ws);
    b.add(obj);
    (this.attachments ||= []).push(obj);
    return obj;
  }

  // ---- weapons ----
  async setWeapon(weaponId) {
    if (!this.isHero) return;
    const id = WEAPONS[weaponId] ? weaponId : DEFAULT_WEAPON[this.id];
    if (this.weaponId === id && this.weapon) return;
    const w = await createWeapon(id, this.stage.scene);
    this.weapon?.dispose();
    this.weapon = w; this.weaponId = id;
    this.gripPose = this.readGripPose(w.kind === 'melee' ? 'bat_idle' : w.kind === 'pistol' ? 'pistol_idle' : 'rifle_aim_idle', w.kind === 'melee');
    this.idle({ fade: 0.2 });
  }
  // the fingers of the weapon's idle at its first frame: closed round the handle in every clip
  readGripPose(clipName, twoHands) {
    const c = this.clip(clipName); if (!c) return null;
    const pose = [];
    for (const t of c.tracks) {
      const m = /^(mixamorig:?)?((Right|Left)Hand(Index|Middle|Ring|Pinky|Thumb)\d)\.quaternion$/.exec(t.name);
      if (!m || (!twoHands && m[3] === 'Left')) continue;
      const b = this.bones[m[2]]; if (!b) continue;
      pose.push([b, new THREE.Quaternion().fromArray(t.values, 0)]);
    }
    return pose;
  }

  // ---- looks ----
  highlight(on, color = 0xffd166) { this.hlTarget = on ? 1 : 0; if (color != null) { this.hlC.set(color); this.ring.material.color.set(color); } }
  flash(color = 0xffffff, strength = 1) { this.flashC.set(color); this.flashI = Math.max(this.flashI, strength); }
  setVisible(v) { this.root.visible = v; this.blob.visible = v; if (this.weapon) this.weapon.setVisible(v); }

  /** World anchors: 'head' (top of the head), 'overhead', 'chest', 'feet', 'hand', 'muzzle', 'tip'. */
  anchor(name = 'chest', out = new THREE.Vector3()) {
    const B = this.bones;
    this.root.updateMatrixWorld(true);
    switch (name) {
      case 'head': case 'overhead': {
        if (this.lying || this.dead) { (B.Hips || this.root).getWorldPosition(out); out.y = Math.max(out.y, 0.3) + 0.45; }
        else if (B.HeadTop_End) B.HeadTop_End.getWorldPosition(out);
        else if (B.Head) B.Head.getWorldPosition(out).y += 0.15 * this.rigScale;
        else this.root.getWorldPosition(out).y += this.height;
        if (name === 'overhead') out.y += 0.32;
        return out;
      }
      case 'chest': return (B.Spine2 || B.Spine || this.root).getWorldPosition(out);
      case 'hips': return (B.Hips || this.root).getWorldPosition(out);
      case 'hand': return (B.RightHand || this.root).getWorldPosition(out);
      case 'muzzle': return this.weapon ? this.weapon.muzzleWorld(out) : this.anchor('hand', out);
      case 'tip': return this.weapon ? this.weapon.tipWorld(out) : this.anchor('hand', out);
      case 'neck': return (B.Neck || B.Head || this.root).getWorldPosition(out);
      case 'feet': default: { (B.Hips || this.root).getWorldPosition(out); out.y = 0; return out; }
    }
  }
  /** Fixed anchor for UI (doesn't wobble with the idle): root + height. */
  uiAnchor(name = 'head', out = new THREE.Vector3()) {
    this.root.getWorldPosition(out);
    const h = this.lying ? 0.9 : this.height;
    if (name === 'head') out.y += h + 0.08; else if (name === 'chest') out.y += h * 0.62; else if (name === 'overhead') out.y += h + 0.35;
    return out;
  }

  // ---- frame ----
  update(dt) {
    // tweens and timers (a snapshot: callbacks may add more)
    if (this.tweens.length) {
      for (const t of [...this.tweens]) {
        if (t.done) continue;
        t.t += dt;
        if (t.timer) { if (t.t >= t.d) { t.done = true; t.fn(); } continue; }
        const u = Math.min(1, t.t / t.d), e = t.ease(u);
        if (t.from && t.from.isVector3) t.obj[t.key].lerpVectors(t.from, t.to, e);
        else t.obj[t.key] = t.from + (t.to - t.from) * e;
        if (u >= 1) { t.done = true; t.resolve(true); }
      }
      this.tweens = this.tweens.filter(t => !t.done);
    }
    // the strike's follow-through slows after the impact
    if (this.afterImpact && this.cur === this.afterImpact.a && this.cur.time >= this.afterImpact.impact) { this.cur.timeScale = this.afterImpact.rate; this.afterImpact = null; }
    // springs, in small steps: a whole frame in one step (dt is game time: x speed, and a slow device's frame can be
    // 1/20 s) makes them blow up, throwing the actor kilometres off screen
    const sp = (s, k, c) => {
      for (let left = dt; left > 1e-6; left -= 1 / 120) { const h = Math.min(left, 1 / 120); s.v += (-k * s.x - c * s.v) * h; s.x += s.v * h; }
    };
    sp(this.knock, 160, 18); sp(this.bend, 220, 20);
    // yaw
    this.yaw = this.yawTarget;
    this.body.rotation.y = this.yaw;
    const f = this.forward(_v);
    this.body.position.set(f.x * this.knock.x, (this.lift || 0) - this.sink, f.z * this.knock.x);

    // three's mixer only writes a bone when the clip's value changed, so last frame's corrections are taken off first
    // (otherwise they pile up during a hit-stop or on a held pose)
    for (const [b, q] of this.saved) b.quaternion.copy(q);
    this.saved.clear();
    this.mixer.update(dt);
    // pending play() resolution
    const p = this.pending;
    if (p && (p.a.time >= p.end - 1e-4 || !p.a.isRunning() || !p.a.enabled)) {
      this.pending = null;
      if (p.then === 'idle') this.idle({ fade: p.thenFade });
      else if (p.then === 'hold') { p.a.paused = true; }
      else if (typeof p.then === 'string' && p.then) this.play(p.then, { loop: true, fade: p.thenFade });
      p.resolve(true);
    }
    this.root.updateMatrixWorld(true);
    this.postPose(dt);
    this.updateLooks(dt);
  }

  // bone corrections after the clip: grip fingers, flinch bend, recoil, collapsed bones; then the weapon follows the hand
  postPose(dt) {
    const B = this.bones;
    if (this.gripPose && this.weapon && !this.dead) for (const [b, q] of this.gripPose) { this.touch(b); b.quaternion.slerp(q, 0.85); }
    if (Math.abs(this.bend.x) > 1e-3 && B.Spine1) this.rotateAbout(B.Spine1, this.lateral(_v2), this.bend.x * 0.25);
    // guns at low ready while idle (so Yola isn't aiming at Marc's head); raised for the shot
    if (this.weapon && this.weapon.kind !== 'melee') {
      const want = this.dead || this.aiming || !this.cur || this.cur.getClip().name.replace('#alt', '') !== this.stanceClip() ? 0 : 1;
      this.lowReady = (this.lowReady ?? want) + (want - (this.lowReady ?? want)) * Math.min(1, dt * (want ? 6 : 30));
      if (this.lowReady > 0.001) {
        const ax = this.lateral(_v2), k = this.lowReady;
        if (B.RightArm) this.rotateAbout(B.RightArm, ax, LOW_READY.arm * k);
        if (B.LeftArm) this.rotateAbout(B.LeftArm, ax, LOW_READY.arm * k);
        if (B.RightHand) this.rotateAbout(B.RightHand, ax, LOW_READY.wrist * k);
        if (B.Spine2) this.rotateAbout(B.Spine2, ax, LOW_READY.chest * k);
      }
    }
    if (this.recoil > 0.001) {
      const k = this.recoil * this.recoil, ax = this.lateral(_v2);
      if (B.Spine2) this.rotateAbout(B.Spine2, ax, -0.08 * k);
      if (B.RightArm) this.rotateAbout(B.RightArm, ax, -0.35 * k);
      if (B.RightForeArm) this.rotateAbout(B.RightForeArm, ax, -0.25 * k);
      if (B.LeftArm) this.rotateAbout(B.LeftArm, ax, -0.2 * k);
      this.recoil = Math.max(0, this.recoil - dt * 7);
    }
    for (const b of this.collapsed) b.scale.setScalar(0.001);
    this.data.model.updateMatrixWorld(true);
    if (this.weapon) { this.weapon.update(dt); this.weapon.setVisible(this.root.visible && !this.hidden); if (this.root.visible) this.weapon.place(this); }
  }
  // the character's own left-right axis in the world
  lateral(out) { return out.crossVectors(UP, this.forward(_v3)).normalize(); }
  touch(bone) { if (!this.saved.has(bone)) this.saved.set(bone, bone.quaternion.clone()); }
  rotateAbout(bone, axisWorld, angle) {
    this.touch(bone);
    const pq = bone.parent.getWorldQuaternion(_q2);
    const local = _v.copy(axisWorld).applyQuaternion(pq.invert());
    bone.quaternion.premultiply(_q.setFromAxisAngle(local, angle));
  }
  kickRecoil(s = 1) { this.recoil = Math.min(1.2, this.recoil + s); this.weapon?.kick(s); }

  updateLooks(dt) {
    // highlight + flash on the materials' emissive
    this.hl += (this.hlTarget - this.hl) * Math.min(1, dt * 12 + (dt === 0 ? 0 : 0));
    this.flashI = Math.max(0, this.flashI - dt * 15);
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 160);
    const hlI = this.hl * 0.16 * (0.7 + 0.3 * pulse);
    if (hlI > 0.001 || this.flashI > 0.001 || this.lastEm) {
      for (const m of this.mats) {
        m.emissive.copy(this.hlC).multiplyScalar(hlI).add(_c.copy(this.flashC).multiplyScalar(this.flashI * 0.45));
        if (m.userData.baseEmissive) m.emissive.add(m.userData.baseEmissive);
      }
      this.lastEm = hlI > 0.001 || this.flashI > 0.001;
    }
    this.ring.material.opacity = this.hl * (0.55 + 0.35 * pulse);
    this.ring.visible = this.hl > 0.01;
    // dissolve after death
    if (this.fading) {
      this.fading.t += dt; const u = Math.min(1, this.fading.t / this.fading.d);
      this.sink = 0.35 * u * u; this.fade = 1 - u;
      for (const m of this.mats) m.opacity = this.fade;
      this.blob.material.opacity = 0.75 * this.fade;
      if (u >= 1) { this.fading = null; this.hidden = true; this.root.visible = false; this.blob.visible = false; this.weapon?.setVisible(false); }
    }
    // blob under the hips
    const h = (this.bones.Hips || this.root).getWorldPosition(_v);
    this.blob.position.set(h.x, 0.006, h.z);
    if (!this.fading && !this.hidden) this.blob.material.opacity = this.dead ? 0.55 : 0.75;
  }

  dispose() {
    this.unsub?.(); this.unpick?.();
    this.mixer.stopAllAction();
    this.weapon?.dispose();
    this.stage.scene.remove(this.root); this.stage.scene.remove(this.blob);
    if (this.bed) { this.stage.scene.remove(this.bed); this.bed = null; }
    this.blob.geometry.dispose(); this.blob.material.dispose(); this.ring.geometry.dispose(); this.ring.material.dispose();
    this.data.model.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); });
  }
}
const _c = new THREE.Color();

/** Convenience: build an actor for a hero or a zombie model key at a slot. */
export function heroYaw() { return Math.PI / 2 - 0.32; }
export function enemyYaw() { return -Math.PI / 2 + 0.3; }
export { ZOMBIE_ATTACKS };
