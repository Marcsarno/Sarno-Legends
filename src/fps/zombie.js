// One zombie in the FPS slice: the deckbuilder's GLB and clips (assets.character), moved procedurally (walk / sprint
// loops play in place), hit zones from the bones (head sphere, torso and leg capsules), and the deckbuilder's rule:
// a shove or a leg shot STAGGERS it (it takes +50% damage, like Vulnerable), and a kill on a staggered zombie is a
// FINISHER (slow motion, the head pops). Deaths use the real clips: headshot drops to the knees, the shotgun throws it
// back, anything else collapses.
import * as THREE from 'three';
import { character } from '../render/assets.js';
import { collideCircle } from './level.js';

// types: model, hp, walk speed (m/s), the loop that plays, damage per hit, stagger resistance, size
export const TYPES = {
  walker: { models: ['z_romero', 'z_nurse', 'z_patient', 'z_scrubs', 'z_patient_mod'], hp: 100, speed: [0.9, 1.25], loop: 'walk', dmg: 10, scale: 1 },
  runner: { models: ['z_girl', 'z_romero'], hp: 80, speed: [2.6, 3.0], loop: 'sprint', dmg: 9, scale: 0.97 },
  sprinter: { models: ['z_sprinter'], hp: 70, speed: [3.6, 4.0], loop: 'sprint', dmg: 8, scale: 0.96 },
  brute: { models: ['z_brute'], hp: 340, speed: [1.0, 1.1], loop: 'walk', dmg: 22, scale: 1.18, staggerNeed: 2, heavy: true },
};
// clips whose hips travel is pinned (they play in place; we move the root)
const IN_PLACE = /^(walk|sprint|idle|ual_Zombie_Idle_Loop|hit_flinch|hit_stumble|react_|scratch|attack|ual_Zombie_Scratch|ual_Zombie_Bite|ual1_Hit_)/;
// death clips: [start s, on the floor s]
const DEATH = { death_back: [0.23, 1.77], death_chest_back: [0.5, 2.2], death_forward: [0.33, 2.23], death_headshot_knees: [0.55, 2.33], death_hit_back: [0.23, 1.8], death_hit_forward: [0.33, 2.2], knockback: [0.0, 0.8], stumble_fall: [0.2, 2.0] };
const ATTACKS = [['scratch', 0.15, 0.63], ['ual_Zombie_Scratch', 0.15, 0.63], ['attack', 0.3, 1.08]];

const processed = new Map();   // model key -> Map(name -> clip)
function clipsFor(key, src) {
  if (processed.has(key)) return processed.get(key);
  const out = new Map();
  for (const [name, c0] of src) {
    if (!IN_PLACE.test(name)) { out.set(name, c0); continue; }
    const c = c0.clone();
    for (const t of c.tracks) {
      if (!/Hips\.position$/.test(t.name)) continue;
      const v = t.values, x0 = v[0], z0 = v[2];
      for (let j = 0; j < v.length; j += 3) { v[j] = x0; v[j + 2] = z0; }
    }
    out.set(name, c);
  }
  processed.set(key, out);
  return out;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);
let uidN = 0;

export async function createZombie(game, typeId, at) {
  const T = TYPES[typeId];
  const key = T.models[Math.floor(Math.random() * T.models.length)];
  const data = await character(key);
  return new Zombie(game, typeId, key, data, at);
}

export class Zombie {
  constructor(game, typeId, key, data, at) {
    this.game = game; this.type = TYPES[typeId]; this.typeId = typeId; this.key = key; this.data = data;
    this.uid = 'z' + (++uidN);
    this.bones = data.bones; this.collapsed = []; this.headGone = false;
    this.scale = this.type.scale * rnd(0.97, 1.04);
    this.height = data.height * this.scale; this.rigScale = this.height / 1.62;
    this.root = new THREE.Group(); this.root.add(data.root);
    data.root.scale.setScalar(this.scale);
    this.root.position.copy(at.spawn);
    this.pos = this.root.position;
    this.entry = at.entry.clone();
    this.yaw = Math.atan2(this.entry.x - at.spawn.x, this.entry.z - at.spawn.z); this.root.rotation.y = this.yaw;
    this.radius = 0.32 * this.scale;
    this.hp = this.maxHp = this.type.hp; this.speed = rnd(...this.type.speed);
    this.state = 'enter'; this.t = 0; this.attackCd = rnd(0.2, 0.6); this.staggerT = 0; this.staggerPts = 0; this.hitT = 0;
    this.dead = false; this.deadT = 0; this.knock = new THREE.Vector3();
    this.mixer = new THREE.AnimationMixer(data.model);
    this.clips = clipsFor(key, data.clips);
    this.cur = null;
    this.meshes = []; data.model.traverse(o => { if (o.isMesh) this.meshes.push(o); });   // (character() gave each its own materials)
    this.flash = 0;
    this.limbHp = { LowerLeg_L: 26, LowerLeg_R: 26, Forearm_L: 20, Forearm_R: 20 };
    game.gore?.prepare(this);
    this.loopName = this.clips.has(this.type.loop) ? this.type.loop : 'walk';
    this.play(this.loopName, { fade: 0, timeScale: this.walkRate(), offset: Math.random() });
    // the stagger marker: an amber ring over the head
    this.marker = game.makeMarker(); this.marker.visible = false; this.root.add(this.marker);
    this.marker.position.y = this.height + 0.25;
    this.marker.scale.setScalar(0.55);
  }

  walkRate() { return this.loopName === 'sprint' ? this.speed / 3.6 : this.speed / 1.05; }

  play(name, { fade = 0.18, loop = true, timeScale = 1, from = 0, offset = 0 } = {}) {
    const clip = this.clips.get(name); if (!clip) return null;
    const a = this.mixer.clipAction(clip);
    a.reset(); a.enabled = true; a.setEffectiveWeight(1);
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1); a.clampWhenFinished = !loop;
    a.timeScale = timeScale; a.time = from + offset * clip.duration;
    if (this.cur && this.cur !== a && fade > 0) { a.play(); this.cur.crossFadeTo(a, fade, false); }
    else { if (this.cur && this.cur !== a) this.cur.stop(); a.play(); }
    this.cur = a; this.curName = name;
    return a;
  }

  get staggered() { return this.state === 'stagger' || this.state === 'downed'; }

  // ---- hit zones (world space, refreshed before a shot) ----
  zones() {
    this.root.updateMatrixWorld(true);
    const B = this.bones, s = this.rigScale;
    const P = n => (B[n] ? B[n].getWorldPosition(new THREE.Vector3()) : null);
    const head = P('Head'), top = P('HeadTop_End'), neck = P('Neck'), hips = P('Hips'), sp2 = P('Spine2');
    const hc = head && top ? head.clone().lerp(top, 0.45) : head ? head.clone().add(_a.set(0, 0.09 * s, 0)) : null;
    const z = [];
    if (hc && !this.headGone) z.push({ part: 'head', kind: 'sphere', c: hc, r: 0.135 * s });
    if (hips && (neck || sp2)) z.push({ part: 'body', kind: 'cap', a: hips, b: (neck || sp2), r: (this.type.heavy ? 0.27 : 0.2) * s });
    for (const side of ['Left', 'Right']) {
      const u = P(side + 'UpLeg'), k = P(side + 'Leg'), f = P(side + 'Foot');
      const L = side === 'Left' ? '_L' : '_R', sev = this.severed || new Set();
      if (u && k) z.push({ part: 'leg', kind: 'cap', a: u, b: k, r: 0.105 * s });
      if (k && f && !sev.has('LowerLeg' + L)) z.push({ part: 'leg', limb: 'LowerLeg' + L, kind: 'cap', a: k, b: f, r: 0.085 * s });
      const sh = P(side + 'Arm'), el = P(side + 'ForeArm'), ha = P(side + 'Hand');
      if (sh && el) z.push({ part: 'arm', kind: 'cap', a: sh, b: el, r: 0.07 * s });
      if (el && ha && !sev.has('Forearm' + L)) z.push({ part: 'arm', limb: 'Forearm' + L, kind: 'cap', a: el, b: ha, r: 0.065 * s });
    }
    return z;
  }

  /** Ray (origin o, unit dir d) against the zones: { t, part, point } of the nearest, or null. */
  raycast(o, d, maxT = 80) {
    if (this.dead) return null;
    // quick reject: distance from the ray to the body's centre
    _a.copy(this.pos).setY(this.height * 0.55).sub(o);
    const along = _a.dot(d); if (along < 0 || along > maxT) return null;
    if (_a.addScaledVector(d, -along).lengthSq() > (1.3 * this.scale) ** 2) return null;
    let best = null;
    for (const z of this.zones()) {
      const t = z.kind === 'sphere' ? raySphere(o, d, z.c, z.r) : rayCapsule(o, d, z.a, z.b, z.r);
      if (t !== null && t < maxT && (!best || t < best.t - (z.part === 'head' ? 0.06 : 0))) best = { t, part: z.part, limb: z.limb };
    }
    if (best) best.point = o.clone().addScaledVector(d, best.t);
    return best;
  }

  /** Damage. opts: { part, dir, weapon: 'pistol' | 'shotgun' | 'shove' | 'bat', stagger, pellets }. Returns the result. */
  damage(amount, opts = {}) {
    if (this.dead) return { dead: true, already: true };
    const wasStaggered = this.staggered;
    if (wasStaggered) amount *= 1.5;                      // Staggered = Vulnerable: +50%
    this.hp -= amount; this.flash = 1;
    if (this.state === 'enter') this.state = 'chase';
    // limbs: enough damage on a forearm or a lower leg takes it off (gore.js); a lost leg puts it on the floor
    let severed = null;
    if (opts.limb && this.limbHp[opts.limb] > 0) {
      this.limbHp[opts.limb] -= opts.limbDmg ?? amount;
      if (this.limbHp[opts.limb] <= 0 && this.game.gore?.sever(this, opts.limb, opts.dir || new THREE.Vector3(0, 0, 1), { speed: opts.weapon === 'shotgun' ? 4 : 2.6 })) severed = opts.limb;
    }
    if (this.hp <= 0) {
      const finisher = wasStaggered;
      this.die({ ...opts, finisher });
      return { killed: true, finisher, amount, severed };
    }
    if (severed?.startsWith('LowerLeg')) { this.down(opts); return { staggered: true, downed: true, amount, severed }; }
    if (opts.stagger) {
      this.staggerPts += opts.stagger;
      if (this.staggerPts >= (this.type.staggerNeed || 1)) { this.stagger(opts); return { staggered: true, amount }; }
    }
    if (!wasStaggered) this.flinch(opts);
    return { amount, severed };
  }

  // a lower leg gone: it drops and stays down (no crawl clip in this pack), staggered for good: any kill is a finisher
  down(opts = {}) {
    if (this.state === 'downed') return;
    this.state = 'downed'; this.marker.visible = true; this.t = 0;
    const n = this.clips.has('stumble_fall') ? 'stumble_fall' : 'knockdown';
    this.play(n, { fade: 0.08, loop: false, from: 0.1, timeScale: 1.2 });
    if (opts.dir) this.knock.addScaledVector(_a.copy(opts.dir).setY(0).normalize(), 0.8);
    this.marker.position.y = 0.6;
    this.game.onStagger?.(this);
  }

  flinch(opts) {
    if (this.state === 'downed') return;
    if (this.state === 'attack' && this.t > 0.35) return;     // a swing already coming keeps coming
    this.hitT = opts.weapon === 'shotgun' ? 0.5 : 0.28;
    if (opts.dir) this.knock.addScaledVector(_a.copy(opts.dir).setY(0).normalize(), opts.weapon === 'shotgun' ? 1.6 : 0.5);
    const n = this.clips.has('hit_flinch') ? 'hit_flinch' : 'ual1_Hit_Chest';
    this.play(n, { fade: 0.06, loop: false, timeScale: 1.5 });
    this.state = 'hit';
  }

  stagger(opts = {}) {
    if (this.state === 'downed') return;
    this.state = 'stagger'; this.staggerT = this.type.heavy ? 2.2 : 2.8; this.staggerPts = 0; this.t = 0;
    if (opts.dir) this.knock.addScaledVector(_a.copy(opts.dir).setY(0).normalize(), opts.weapon === 'shove' ? 3.2 : 1.2);
    const n = opts.weapon === 'shove' ? (this.clips.has('react_large_front') ? 'react_large_front' : 'hit_stumble') : (this.clips.has('hit_stumble') ? 'hit_stumble' : 'react_large_front');
    this.play(n, { fade: 0.08, loop: false, timeScale: 1.1 });
    this.marker.visible = true;
    this.game.onStagger?.(this);
  }

  die(opts = {}) {
    if (this.state === 'downed') { this.dead = true; this.state = 'dead'; this.marker.visible = false; this.deadT = 0; this.deathClip = 'downed'; return; }
    this.dead = true; this.state = 'dead'; this.marker.visible = false; this.deadT = 0;
    let clip;
    if (opts.weapon === 'shotgun' && opts.close) clip = this.clips.has('knockback') && Math.random() < 0.5 ? 'knockback' : 'death_chest_back';
    else if (opts.part === 'head' || opts.finisher) clip = 'death_headshot_knees';
    else if (opts.weapon === 'shotgun') clip = 'death_chest_back';
    else clip = ['death_forward', 'death_back', 'stumble_fall', 'death_hit_forward'].filter(n => this.clips.has(n))[Math.floor(Math.random() * 3)] || 'death_back';
    if (!this.clips.has(clip)) clip = 'death_back';
    const D = DEATH[clip] || [0, 1.5];
    if (opts.dir) {
      // face the shot so the clip falls the right way (back = away from the shooter)
      const d = _a.copy(opts.dir).setY(0).normalize();
      this.yaw = Math.atan2(-d.x, -d.z); this.root.rotation.y = this.yaw;
      if (opts.weapon === 'shotgun') this.knock.addScaledVector(d, opts.close ? 3.4 : 1.6);
    }
    this.play(clip, { fade: 0.08, loop: false, from: D[0], timeScale: opts.finisher ? 0.9 : 1.15 });
    this.deathClip = clip;
  }

  update(dt, ctx) {
    const { player, colliders, level, others } = ctx;
    this.t += dt;
    if (!this.dead || this.deadT < 4) this.mixer.update(dt);
    for (const b of this.collapsed) b.scale.setScalar(0.001);
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 7);
      for (const m of this.meshes) for (const mat of (Array.isArray(m.material) ? m.material : [m.material])) if (mat.emissive) mat.emissive.setRGB(this.flash * 0.6, this.flash * 0.15, this.flash * 0.1);
    }
    // knockback slide
    if (this.knock.lengthSq() > 1e-4) {
      this.pos.addScaledVector(this.knock, dt * 4);
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 7));
      collideCircle(this.pos, this.radius, colliders);
    }
    if (this.dead) { this.deadT += dt; return; }
    if (this.marker.visible) { this.marker.rotation.y += dt * 3; this.marker.children[0] && (this.marker.children[0].material.opacity = 0.65 + 0.35 * Math.sin(this.t * 10)); }

    const toP = _b.copy(player.pos).sub(this.pos).setY(0), dist = toP.length();
    this.attackCd -= dt;

    if (this.state === 'hit') {
      this.hitT -= dt;
      if (this.hitT <= 0) { this.state = 'chase'; this.play(this.loopName, { fade: 0.2, timeScale: this.walkRate() }); }
      return;
    }
    if (this.state === 'downed') { this.marker.rotation.y += 0; return; }
    if (this.state === 'stagger') {
      this.staggerT -= dt;
      // after the reaction, sway on the spot
      if (this.cur && !this.cur.isRunning() && this.curName !== 'idle') this.play(this.clips.has('idle') ? 'idle' : 'ual_Zombie_Idle_Loop', { fade: 0.25, timeScale: 0.6 });
      if (this.staggerT <= 0) { this.state = 'chase'; this.marker.visible = false; this.play(this.loopName, { fade: 0.3, timeScale: this.walkRate() }); }
      return;
    }
    if (this.state === 'attack') {
      const A = this.attack;
      this.turnTo(toP, dt, 4);
      if (!A.hit && this.cur && this.cur.time >= A.impact) {
        A.hit = true;
        if (dist < 1.75 * this.scale && !player.dead) this.game.hurtPlayer(this.type.dmg, this);
      }
      if (this.cur && (!this.cur.isRunning() || this.cur.time >= A.end)) { this.state = 'chase'; this.attackCd = rnd(0.5, 1.0); this.play(this.loopName, { fade: 0.2, timeScale: this.walkRate() }); }
      return;
    }

    // enter: walk out of the dark doorway; chase: downhill on the level's flow field (round furniture, through doors),
    // straight at the player for the last couple of metres
    let goal;
    if (this.state === 'enter') {
      goal = _c.copy(this.entry).sub(this.pos).setY(0);
      if (goal.length() < 0.6 || this.t > 4) this.state = 'chase';
    }
    if (this.state === 'chase') {
      const near = dist < 2.2 || level.nav.steps(this.pos) < 5;
      goal = near ? _c.copy(toP) : (level.nav.dir(this.pos, _c)?.multiplyScalar(2) || _c.copy(toP));
      if (dist < 1.25 * this.scale && this.attackCd <= 0 && !player.dead) { this.startAttack(); return; }
    }
    const gl = goal.length();
    if (gl > 0.01) {
      this.turnTo(goal, dt, this.loopName === 'sprint' ? 7 : 3.2);
      const fwd = _a.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const stop = this.state === 'chase' && dist < 1.0 * this.scale;
      if (!stop) this.pos.addScaledVector(fwd, this.speed * dt * Math.min(1, gl / 0.4 + 0.3));
    }
    // keep apart from the others and out of the walls
    for (const o of others) {
      if (o === this || o.dead) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, r = this.radius + o.radius, d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2), k = (r - d) / d * 0.5; this.pos.x += dx * k; this.pos.z += dz * k; }
    }
    // and off the player
    { const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z, r = this.radius + 0.35, d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2), k = (r - d) / d; this.pos.x += dx * k; this.pos.z += dz * k; } }
    collideCircle(this.pos, this.radius, colliders);
  }

  turnTo(v, dt, rate) {
    const want = Math.atan2(v.x, v.z);
    let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * rate); this.root.rotation.y = this.yaw;
  }

  startAttack() {
    const [name, from, impact] = ATTACKS.find(a => this.clips.has(a[0])) || ATTACKS[0];
    const rate = this.type.heavy ? 1.0 : 1.25;
    this.play(name, { fade: 0.12, loop: false, from, timeScale: rate });
    this.attack = { impact, end: impact + 0.55, hit: false };
    this.state = 'attack'; this.t = 0;
    this.game.sound?.(this.type.heavy ? 'brute_attack' : 'z_attack', this.pos);
  }

  dispose(scene) { scene.remove(this.root); this.mixer.stopAllAction(); }
}

// ---- ray maths ----
function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, h = b * b - cc;
  if (h < 0) return null; const t = -b - Math.sqrt(h); return t >= 0 ? t : null;
}
// ray vs capsule (segment a-b, radius r): closest approach between the ray and the segment
function rayCapsule(o, d, a, b, r) {
  const ba = _c.copy(b).sub(a), oa = new THREE.Vector3().copy(o).sub(a);
  const baba = ba.dot(ba), bard = ba.dot(d), baoa = ba.dot(oa), rdoa = d.dot(oa), oaoa = oa.dot(oa);
  const A = baba - bard * bard, B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - r * r * baba;
  const h = B * B - A * C;
  if (h >= 0 && A > 1e-8) {
    const t = (-B - Math.sqrt(h)) / A, y = baoa + t * bard;
    if (y > 0 && y < baba && t >= 0) return t;
    // caps
    const oc = y <= 0 ? oa : new THREE.Vector3().copy(o).sub(b);
    const bb = d.dot(oc), cc = oc.dot(oc) - r * r, hh = bb * bb - cc;
    if (hh > 0) { const tt = -bb - Math.sqrt(hh); if (tt >= 0) return tt; }
  }
  return null;
}
