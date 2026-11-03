// Marc beside Yola: the deckbuilder's Marc model, clips and wood bat (weapons.js holds it in both fists). He keeps to
// Yola's right shoulder, and when a zombie gets close he goes for the one that ISN'T staggered yet and swings: his bat
// staggers (the deckbuilder's split: Marc staggers, Yola cashes in). Zombies ignore him; he can't go down.
import * as THREE from 'three';
import { character } from '../render/assets.js';
import { createWeapon } from '../render/weapons.js';
import { collideCircle } from './level.js';

const SWINGS = [
  { clip: 'ual1_Sword_Attack', from: 0.05, impact: 0.45, end: 0.95, rate: 1.25, yaw: 1.45 - Math.PI / 2 },
  { clip: 'ual_Sword_Regular_B', from: 0.0, impact: 0.283, end: 0.55, rate: 1.0, yaw: 1.4 - Math.PI / 2 },
  { clip: 'ual_Sword_Regular_A', from: 0.0, impact: 0.25, end: 0.47, rate: 0.95, yaw: 1.4 - Math.PI / 2 },
];
const IDLE_YAW = 1.7 - Math.PI / 2;
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export async function createMarc({ scene, game, level, sound }) {
  const data = await character('marc');
  const root = new THREE.Group(); root.add(data.root); scene.add(root);
  const pos = root.position; pos.set(1.2, 0, -0.6);
  const mixer = new THREE.AnimationMixer(data.model);
  const bat = await createWeapon('wood_bat', scene);
  const actorLike = { bones: data.bones, rigScale: data.height / 1.62, id: 'marc' };
  let cur = null, curName = '', yaw = Math.PI, faceOff = IDLE_YAW;
  function play(name, { fade = 0.2, loop = true, from = 0, rate = 1 } = {}) {
    const clip = data.clips.get(name); if (!clip) return null;
    const a = mixer.clipAction(clip);
    if (a === cur && loop) { a.timeScale = rate; return a; }
    a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1); a.clampWhenFinished = !loop; a.timeScale = rate; a.time = from;
    a.play(); if (cur && cur !== a) cur.crossFadeTo(a, fade, false);
    cur = a; curName = name; return a;
  }
  play('bat_idle');
  let swing = null, cd = 0, swingN = 0, target = null, status = 'with you';

  function turnTo(dx, dz, dt, rate) {
    const want = Math.atan2(dx, dz); let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    yaw += d * Math.min(1, dt * rate);
  }

  return {
    pos,
    get status() { return status; },
    update(dt, { player, zombies, colliders, playing }) {
      cd -= dt;
      mixer.update(dt);
      if (swing) {
        const z = swing.z;
        if (!z.dead) { _a.copy(z.pos).sub(pos); turnTo(_a.x, _a.z, dt, 8); }
        if (!swing.hit && cur.time >= swing.S.impact) {
          swing.hit = true;
          _a.copy(z.pos).sub(pos).setY(0);
          if (!z.dead && _a.length() < 1.75 * z.scale) { game.batHit(z, _a.normalize()); }
          else sound('swing', pos, { vol: 0.6 });
        }
        if (cur.time >= swing.S.end || !cur.isRunning()) { swing = null; cd = 0.55 + Math.random() * 0.4; }
      } else {
        // pick a target: near Yola, closest, prefer the ones not staggered yet (he staggers, she finishes)
        target = null; let best = 1e9;
        if (playing) for (const z of zombies) {
          if (z.dead || z.state === 'enter') continue;
          const dm = z.pos.distanceTo(pos), dp = z.pos.distanceTo(player.pos);
          if (dp > 7.5 || dm > 9) continue;
          if (level.roomOf(z.pos.x, z.pos.z) !== level.roomOf(pos.x, pos.z) && dm > 3) continue;
          const score = dm + (z.staggered ? 4 : 0) + dp * 0.4;
          if (score < best) { best = score; target = z; }
        }
        let goal = null, run = false;
        if (target) {
          _a.copy(target.pos).sub(pos).setY(0);
          const d = _a.length();
          if (d < 1.25 * target.scale) {
            if (cd <= 0) {
              const S = SWINGS[swingN++ % SWINGS.length];
              play(S.clip, { fade: 0.1, loop: false, from: S.from, rate: S.rate });
              swing = { S, z: target, hit: false }; faceOff = S.yaw;
              sound('swing', pos, { vol: 0.7 });
            }
          } else { goal = _a; run = true; }
          status = 'fighting';
        } else {
          // keep to Yola's right shoulder, a little behind
          const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
          _b.set(player.pos.x + rx * 1.3 - fx * 0.9, 0, player.pos.z + rz * 1.3 - fz * 0.9);
          // if that spot is inside a wall (the corridor), fall in behind her
          const test = _b.clone(); collideCircle(test, 0.35, colliders, { player: true });
          if (test.distanceTo(_b) > 0.2) _b.set(player.pos.x - fx * 1.4, 0, player.pos.z - fz * 1.4);
          // other room: go through the door
          const mr = level.roomOf(pos.x, pos.z), pr = level.roomOf(player.pos.x, player.pos.z);
          if (mr !== pr) { const D = level.doors[Math.min(mr, pr)]; _b.set(D.x, 0, D.z + (pr > mr ? -1 : 1)); }
          _a.copy(_b).sub(pos).setY(0);
          if (_a.length() > 0.6) { goal = _a; run = _a.length() > 2.5; }
          status = 'with you';
        }
        if (!swing) {
          if (goal) {
            const d = goal.length();
            turnTo(goal.x, goal.z, dt, 9);
            const v = Math.min(run ? 4.6 : 2.2, d * 3);
            pos.x += Math.sin(yaw) * v * dt; pos.z += Math.cos(yaw) * v * dt;
            play(v > 2.6 ? 'ual1_Jog_Fwd_Loop' : 'ual1_Walk_Loop', { fade: 0.2, rate: v > 2.6 ? v / 3.6 : Math.max(0.6, v / 1.5) });
            faceOff = 0;
          } else {
            // stand ready, facing where Yola looks (or the nearest zombie)
            if (target) { _a.copy(target.pos).sub(pos); turnTo(_a.x, _a.z, dt, 6); }
            else turnTo(-Math.sin(player.yaw), -Math.cos(player.yaw), dt, 3);
            play('bat_idle', { fade: 0.3 }); faceOff = IDLE_YAW;
          }
        }
      }
      // keep off zombies and out of walls
      for (const z of zombies) {
        if (z.dead) continue;
        const dx = pos.x - z.pos.x, dz = pos.z - z.pos.z, r = z.radius + 0.36, d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2), k = (r - d) / d * 0.5; pos.x += dx * k; pos.z += dz * k; }
      }
      collideCircle(pos, 0.36, colliders, { player: true });
      root.rotation.y = yaw + faceOff;
      root.updateMatrixWorld(true);
      bat.update(dt); bat.place(actorLike);
    },
  };
}
