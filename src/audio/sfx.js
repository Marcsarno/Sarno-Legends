// What every sound is made of, and which sound each combat event plays.
// Three parts, all data + small functions (no DOM, importable in node so tools can list the files in use):
//   BANKS    recorded sounds: layers of takes from public/assets/sfx (all CC0, see CREDITS.md). One take per layer is
//            picked at random (never the same twice running) with pitch/level jitter; layers play together.
//   SYNTHS   sounds made in code (UI ticks, card swishes, stingers): soft sines, triangles and filtered noise.
//   createEventSounds(api)   the combat event contract (BUILD_SPEC section 3) -> sounds, plus the director's 'fx' events.
// Takes are chosen from Marc's own Sound Board verdicts in yola-zombie (assets/sfx/selection.json, 2026-10-17..19)
// wherever he judged them ("yes" = his pick); the rest are picked by name and measured level, not by ear.
//
// Layer fields: files [paths under assets/]   gain (x)   pitch [lo, hi] semitones of random detune   rate (fixed st)
//   at  delay in s (or [lo, hi])   wet  reverb send   chance  0..1   offset  start this far into the take (s)
//   maxDur  stop after s (with a fade of `fade` s)   lp / hp  filter Hz   synth  a SYNTHS recipe instead of files
// Bank fields: layers   gain   cooldown (s: a second play inside it is dropped, or played softer when stack: true)
//   minor (dropped first when many voices ring)   duck { ms, amount } (music dips under it)   bus 'sfx' | 'ui'

const S = 'sfx/';
const take = (dir, name, ...nums) => nums.map((n) => `${S}${dir}/${name}_${String(n).padStart(2, '0')}.mp3`);
const one = (dir, name) => [`${S}${dir}/${name}.mp3`];
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export const BANKS = {
  // ---------------------------------------------------------------- heroes attack
  // Marc's swing through the air (the whoosh before the hit lands)
  swing: { cooldown: 0.05, layers: [
    { files: take('reveal', 'whoosh', 1, 2, 6, 10), gain: 0.5, pitch: [-1.5, 1], wet: 0.08 },
  ] },
  // a big two-handed swing (Home Run, Overhead Smash, finisher clips): slower, deeper air
  swing_heavy: { cooldown: 0.05, layers: [
    { files: [...take('reveal', 'slowswish', 1, 3, 4), ...take('reveal', 'whoosh', 9)], gain: 0.55, pitch: [-1, 0.5], wet: 0.1 },
  ] },
  // Yola's pistol: Marc kept pistol 01-06 ("yes"), plus a felt thump under it for headphones
  pistol: { cooldown: 0.03, layers: [
    { files: take('guns', 'pistol', ...range(1, 6)), gain: 1.1, pitch: [-0.6, 0.5], wet: 0.28 },
    { synth: 'kick', gain: 0.45 },
  ] },
  // the shotgun: Marc rejected the close blasts and kept the 4 distant long-echo ones; the pump follows
  shotgun: { cooldown: 0.05, duck: { ms: 260, amount: 0.6 }, layers: [
    { files: take('guns', 'shotgun', 9, 10, 11, 12), gain: 1.3, pitch: [-0.8, 0.3], wet: 0.2 },
    { synth: 'kick_big', gain: 0.6 },
    { files: [...one('guns', 'pump_fwd'), ...take('lib', 'rack', 4)], gain: 0.32, pitch: [-0.4, 0.4], at: [0.42, 0.5], wet: 0.1 },
  ] },

  // ---------------------------------------------------------------- hits on a zombie (damage kind)
  // the bat lands (light): Marc's batHit picks (thwacks + wood cracks) over his heavy-punch body
  bat_hit: { cooldown: 0.03, stack: true, layers: [
    { files: [...take('lib', 'thwack', 2, 3, 5), ...take('lib', 'wood', 2, 6, 10)], gain: 0.8, pitch: [-1, 0.8], wet: 0.14 },
    { files: take('lib', 'punchheavy', 1, 2, 3), gain: 0.62, pitch: [-1.5, 0.5], wet: 0.05 },
  ] },
  // a heavy blow (Home Run, Overhead Smash, Grand Slam): crack + body + a deep thump, sometimes bone
  heavy_hit: { cooldown: 0.04, stack: true, layers: [
    { files: [...take('lib', 'wood', 1, 2, 3), ...take('lib', 'thwack', 5)], gain: 0.85, pitch: [-2, 0], wet: 0.16 },
    { files: take('lib', 'punchheavy', 1, 2, 3), gain: 0.8, pitch: [-2.5, -0.5], wet: 0.05 },
    { files: [...take('reveal', 'thump', 9), ...take('zombie', 'stomp', 11)], gain: 0.5, pitch: [-1, 0.5] },
    { files: take('reveal', 'sbone', 1, 2), gain: 0.4, pitch: [-1, 1], chance: 0.5 },
  ] },
  // the fire axe: Marc's axeHit picks (blade 04/05) + wet + body
  axe_hit: { cooldown: 0.03, stack: true, layers: [
    { files: take('lib', 'blade', 4, 5), gain: 0.8, pitch: [-1, 1], wet: 0.12 },
    { files: take('lib', 'squish', 4, 5), gain: 0.42, pitch: [-1.5, 0.5] },
    { files: take('lib', 'punchheavy', 1, 2), gain: 0.6, pitch: [-1.5, 0.5] },
  ] },
  // nail / wire bat: the bat plus a wet tear
  nail_hit: { cooldown: 0.03, stack: true, layers: [
    { files: [...take('lib', 'thwack', 2, 3, 5), ...take('lib', 'wood', 2, 6)], gain: 0.75, pitch: [-1, 0.8], wet: 0.14 },
    { files: take('lib', 'squish', 1, 4, 6), gain: 0.5, pitch: [-1, 1] },
    { files: take('lib', 'punchheavy', 1, 2), gain: 0.5, pitch: [-1.5, 0.5] },
  ] },
  // crowbar / sledgehammer: a duller metal-backed blow
  metal_hit: { cooldown: 0.03, stack: true, layers: [
    { files: take('lib', 'punchheavy', 1, 2, 3), gain: 0.85, pitch: [-2, 0], wet: 0.08 },
    { files: take('lib', 'metal', 6, 8), gain: 0.22, pitch: [-4, -2], wet: 0.2 },
    { files: take('lib', 'thwack', 3, 5), gain: 0.5, pitch: [-2, 0] },
  ] },
  // a bullet hits a zombie: Marc's bulletHit pick (scrack 06) with real body punches, sometimes wet
  bullet_hit: { cooldown: 0.025, stack: true, layers: [
    { files: [...take('reveal', 'scrack', 6), ...take('lib', 'punch', 2, 3, 6)], gain: 0.62, pitch: [-1, 1.5], wet: 0.06 },
    { files: take('lib', 'squish', 1, 4, 7), gain: 0.34, pitch: [-1, 1], chance: 0.7 },
  ] },
  // buckshot / a blast: everything at once, meatier
  blast_hit: { cooldown: 0.04, stack: true, layers: [
    { files: take('lib', 'punchheavy', 1, 2, 3), gain: 0.8, pitch: [-1.5, 0.5] },
    { files: take('lib', 'squish', 4, 5, 6), gain: 0.55, pitch: [-1.5, 0.5] },
    { files: take('reveal', 'scrack', 3, 6), gain: 0.45, pitch: [-1, 1] },
  ] },
  // the extra crack under any hit on a Staggered zombie (the pillar's payoff should sound bigger)
  stagger_crack: { cooldown: 0.05, layers: [
    { files: take('reveal', 'sbone', 1, 2), gain: 0.55, pitch: [-1, 1.5] },
    { files: take('reveal', 'thump', 5, 8), gain: 0.3, pitch: [-1, 0.5] },
  ] },
  bleed_tick: { cooldown: 0.08, minor: true, layers: [
    { files: take('lib', 'squish', 1, 5, 6), gain: 0.38, pitch: [-2, 0] },
  ] },
  thorns: { cooldown: 0.06, minor: true, layers: [
    { files: take('lib', 'metal', 7, 8), gain: 0.26, pitch: [1, 3], wet: 0.1 },
    { files: take('lib', 'squish', 8), gain: 0.25, pitch: [0, 2] },
  ] },
  // a hit taken fully on a zombie's block (the guard's shield: Marc's shieldHit picks) or on the party's
  block_hit: { cooldown: 0.04, stack: true, layers: [
    { files: take('lib', 'thwack', 7, 10), gain: 0.7, pitch: [-2, 0], wet: 0.16 },
    { files: take('lib', 'metal', 3, 7), gain: 0.28, pitch: [-1, 1], chance: 0.6, wet: 0.2 },
  ] },
  party_blocked: { cooldown: 0.05, stack: true, layers: [
    { files: take('lib', 'thwack', 7, 10), gain: 0.62, pitch: [-1, 1], wet: 0.12 },
    { files: take('lib', 'cloth', 3), gain: 0.3, pitch: [-1, 1] },
    { synth: 'shield', gain: 0.5 },
  ] },

  // ---------------------------------------------------------------- the party gets hit
  // a zombie's bite / claw lands: Marc's zombieBite pick (bite 04) + wet + body punch
  party_hit: { cooldown: 0.05, stack: true, layers: [
    { files: [...take('zombie', 'bite', 4), ...take('lib', 'squish', 4, 6)], gain: 0.52, pitch: [-1.5, 1], wet: 0.06 },
    { files: take('lib', 'punch', 2, 3, 4, 5), gain: 0.75, pitch: [-1, 1], wet: 0.05 },
  ] },
  // a big blow (12+): body punch + a deep thump
  party_hit_heavy: { cooldown: 0.06, stack: true, duck: { ms: 220, amount: 0.7 }, layers: [
    { files: take('lib', 'punchheavy', 1, 2, 3), gain: 0.9, pitch: [-2.5, -0.5], wet: 0.06 },
    { files: take('reveal', 'thump', 9), gain: 0.5, pitch: [-1, 0.5] },
    { files: take('lib', 'squish', 4, 6), gain: 0.4, pitch: [-1.5, 0.5] },
  ] },
  // the shield guard / big walker's heavy blows: Marc's guardSlam (grunt, deep punches, debris) + sub
  boss_slam: { cooldown: 0.1, duck: { ms: 350, amount: 0.55 }, layers: [
    { files: take('zombie', 'stomp', 11, 12), gain: 0.95, pitch: [-1, 0.5], wet: 0.25 },
    { files: take('zombie', 'debris', 1, 2), gain: 0.45, pitch: [-1, 1], at: [0.05, 0.12], wet: 0.15 },
    { files: take('lib', 'punchheavy', 1, 2), gain: 0.6, pitch: [-3, -1] },
    { synth: 'kick_big', gain: 0.7 },
  ] },
  self_hit: { cooldown: 0.08, layers: [
    { files: take('lib', 'punch', 6, 7, 8), gain: 0.42, pitch: [-2, 0] },
    { synth: 'pulse_low', gain: 0.5 },
  ] },

  // ---------------------------------------------------------------- skills, block, heal, status
  // Marc braces (block anim): cloth + a light metal tick under a soft shimmer
  block: { cooldown: 0.08, layers: [
    { files: take('lib', 'cloth', 1, 3), gain: 0.65, pitch: [-1, 1] },
    { files: take('lib', 'metal', 7, 8), gain: 0.15, pitch: [2, 4], at: 0.05, wet: 0.2 },
    { synth: 'shield', gain: 0.55 },
  ] },
  // Yola sidesteps (dodge anim): cloth + a short swish
  dodge: { cooldown: 0.08, layers: [
    { files: take('lib', 'cloth', 2, 4), gain: 0.62, pitch: [-1, 1] },
    { files: take('reveal', 'whoosh', 14, 15, 16, 17), gain: 0.32, pitch: [0, 2], wet: 0.05 },
    { synth: 'shield', gain: 0.4 },
  ] },
  heal: { cooldown: 0.25, layers: [
    { synth: 'heal', gain: 1 },
    { files: take('reveal', 'ding', 3), gain: 0.3, rate: -5, pitch: [-0.3, 0.3], wet: 0.45, at: 0.04 },
  ] },
  buff: { cooldown: 0.15, layers: [{ synth: 'buff', gain: 1 }] },
  power: { cooldown: 0.2, layers: [
    { synth: 'power', gain: 1 },
    { files: take('lib', 'cloth', 1), gain: 0.3, pitch: [-2, 0] },
  ] },
  debuff: { cooldown: 0.15, layers: [{ synth: 'debuff', gain: 1 }] },
  // a zombie becomes Staggered: a dull knock and a dizzy falling ring
  stagger: { cooldown: 0.12, layers: [
    { files: take('reveal', 'thump', 5, 8), gain: 0.35, pitch: [-0.5, 0.5] },
    { synth: 'stagger', gain: 1 },
  ] },
  enemy_debuff: { cooldown: 0.12, minor: true, layers: [{ synth: 'debuff', gain: 0.55, rate: 3 }] },
  enemy_buff: { cooldown: 0.15, minor: true, layers: [{ synth: 'enemy_buff', gain: 1 }] },
  enemy_heal: { cooldown: 0.25, minor: true, layers: [{ synth: 'enemy_heal', gain: 1 }] },
  immune: { cooldown: 0.12, minor: true, layers: [{ synth: 'immune', gain: 1 }] },
  stun: { cooldown: 0.2, layers: [{ synth: 'stun', gain: 1 }] },
  // zombies raise their guard (Raise Shield, Shamble): cloth + a metal clank (Marc's clank picks)
  zombie_block: { cooldown: 0.1, minor: true, layers: [
    { files: take('lib', 'metal', 3, 7, 8), gain: 0.3, pitch: [-2, 0], wet: 0.2 },
    { files: take('lib', 'cloth', 3), gain: 0.35, pitch: [-3, -1] },
  ] },

  // ---------------------------------------------------------------- cards with their own foley
  check_mag: { cooldown: 0.2, layers: [
    { files: one('guns', 'mag_out'), gain: 0.42, pitch: [-0.5, 0.5], wet: 0.08 },
    { files: one('guns', 'mag_in'), gain: 0.48, pitch: [-0.5, 0.5], at: 0.3, wet: 0.08 },
    { files: one('guns', 'slide'), gain: 0.3, pitch: [-0.4, 0.4], at: 0.52, wet: 0.1 },
  ] },
  kick_door: { cooldown: 0.2, layers: [
    { files: take('lib', 'doorshut', 3), gain: 0.55, pitch: [-1, 0.5], wet: 0.3 },
    { files: take('lib', 'punchheavy', 3), gain: 0.5, pitch: [-2, 0] },
  ] },
  bolt_door: { cooldown: 0.2, layers: [
    { files: take('lib', 'doorshut', 1), gain: 0.55, pitch: [-1, 0], wet: 0.3 },
    { files: take('lib', 'click', 2), gain: 0.5, pitch: [-1, 0], at: 0.28, wet: 0.1 },
  ] },
  // Defibrillator / Epi-Pen: Marc's electrical arc picks + a monitor beep
  defib: { cooldown: 0.3, duck: { ms: 400, amount: 0.6 }, layers: [
    { files: take('reveal', 'arc', 2, 6), gain: 0.45, pitch: [-1, 1], wet: 0.2 },
    { files: take('reveal', 'ecg', 5), gain: 0.28, at: 0.35, wet: 0.2 },
    { synth: 'kick', gain: 0.6 },
  ] },
  adrenaline: { cooldown: 0.2, layers: [
    { files: take('lib', 'click', 3), gain: 0.35, pitch: [2, 3] },
    { synth: 'power', gain: 0.7, at: 0.06 },
  ] },

  // ---------------------------------------------------------------- items, supplies, relics
  supplies: { cooldown: 0.12, bus: 'ui', layers: [
    { files: take('lib', 'pickup', 4, 5), gain: 0.9, pitch: [-1, 1] },
    { synth: 'coin', gain: 0.8, at: 0.02 },
  ] },
  relic: { cooldown: 0.25, layers: [
    { files: take('reveal', 'ding', 2, 4), gain: 0.38, rate: 3, pitch: [-0.5, 0.5], wet: 0.35 },
    { synth: 'sparkle', gain: 0.7 },
  ] },
  pickup: { cooldown: 0.12, bus: 'ui', layers: [
    { files: [...take('lib', 'cloth', 1, 4), ...take('lib', 'pickup', 1)], gain: 0.85, pitch: [-1, 1] },
  ] },
  potion: { cooldown: 0.15, layers: [
    { files: take('lib', 'glass', 7, 8), gain: 0.5, pitch: [2, 4], wet: 0.12 },
    { files: take('lib', 'cloth', 2), gain: 0.5, pitch: [-1, 1] },
  ] },
  throw: { cooldown: 0.1, layers: [
    { files: take('reveal', 'whoosh', 2, 6), gain: 0.45, pitch: [-1, 1], wet: 0.06 },
  ] },
  flashbang: { cooldown: 0.3, duck: { ms: 1400, amount: 0.25 }, layers: [
    { files: take('reveal', 'boom', 5, 6), gain: 0.85, at: 0.25, pitch: [-0.5, 0.5], wet: 0.35 },
    { files: take('reveal', 'ring', 1), gain: 0.05, at: 0.3, maxDur: 2.2, fade: 1.4 },
    { synth: 'kick_big', gain: 0.6, at: 0.25 },
  ] },
  pipe_bomb: { cooldown: 0.3, duck: { ms: 1200, amount: 0.3 }, layers: [
    { files: take('reveal', 'boom', 7), gain: 0.95, at: 0.25, wet: 0.3 },
    { files: take('reveal', 'boom', 8), gain: 0.7, at: 0.25 },
    { files: take('zombie', 'debris', 1, 2), gain: 0.5, at: 0.36, pitch: [-1, 1] },
    { synth: 'kick_big', gain: 0.8, at: 0.25 },
  ] },
  spray: { cooldown: 0.3, layers: [{ synth: 'spray', gain: 1, at: 0.22 }] },

  // ---------------------------------------------------------------- zombie voices
  z_alert: { cooldown: 0.12, layers: [
    { files: take('zombie', 'alert', 3, 7, 9, 12), gain: 0.55, pitch: [-1, 1], wet: 0.25 },
  ] },
  z_attack: { cooldown: 0.1, layers: [
    { files: take('zombie', 'attack', 1, 2, 3, 6, 7), gain: 0.55, pitch: [-1, 1], wet: 0.15 },
  ] },
  z_hurt: { cooldown: 0.12, minor: true, layers: [
    { files: take('zombie', 'hurt', 1, 2, 3, 4, 7), gain: 0.45, pitch: [-1.5, 1.5], wet: 0.12 },
  ] },
  z_death: { cooldown: 0.08, layers: [
    { files: take('zombie', 'death', 2, 3, 5, 7, 8), gain: 0.62, pitch: [-1.5, 1], wet: 0.22 },
  ] },
  // the zombie's swipe through the air (under its attack cry)
  z_swipe: { cooldown: 0.06, minor: true, layers: [
    { files: take('reveal', 'whoosh', 1, 6, 10), gain: 0.32, rate: -3, pitch: [-1, 1], wet: 0.06 },
  ] },
  body_fall: { cooldown: 0.06, stack: true, layers: [
    { files: [...take('lib', 'soft', 1, 2, 3), ...take('reveal', 'bodyfall', 4)], gain: 0.7, pitch: [-2, 0], wet: 0.18 },
  ] },
  heavy_fall: { cooldown: 0.1, layers: [
    { files: take('zombie', 'stomp', 1, 2), gain: 0.85, pitch: [-1, 0], wet: 0.25 },
    { files: take('reveal', 'bodyfall', 2), gain: 0.55, pitch: [-2, -1], wet: 0.2 },
  ] },
  // the Screamer's shriek (Marc's sprinterScream pick + one more)
  scream: { cooldown: 0.4, layers: [
    { files: take('zombie', 'scream', 2, 5), gain: 0.55, pitch: [-0.5, 0.5], wet: 0.35 },
  ] },
  sprinter_charge: { cooldown: 0.12, layers: [
    { files: take('zombie', 'charge', 5, 7), gain: 0.6, pitch: [-1, 0.5], wet: 0.15 },
  ] },
  sprinter_death: { cooldown: 0.1, layers: [
    { files: take('zombie', 'sdeath', 2), gain: 0.65, pitch: [-1, 0.5], wet: 0.25 },
  ] },
  spit: { cooldown: 0.15, layers: [
    { files: take('zombie', 'bite', 13, 15), gain: 0.5, pitch: [-1, 1], wet: 0.1 },
  ] },
  // big ones (Big Walker, Sleeping Patient, Shield Guard): Marc's guard picks
  brute_roar: { cooldown: 0.3, duck: { ms: 700, amount: 0.6 }, layers: [
    { files: take('zombie', 'groar', 6, 13, 14), gain: 0.72, pitch: [-0.5, 0.5], wet: 0.35 },
  ] },
  brute_attack: { cooldown: 0.12, layers: [
    { files: take('zombie', 'gattack', 1, 2, 14), gain: 0.65, pitch: [-1, 0.5], wet: 0.2 },
  ] },
  brute_pain: { cooldown: 0.25, minor: true, layers: [
    { files: take('zombie', 'gpain', 3, 4, 7), gain: 0.55, pitch: [-0.5, 0.5], wet: 0.25 },
  ] },
  brute_death: { cooldown: 0.2, duck: { ms: 900, amount: 0.45 }, layers: [
    { files: take('zombie', 'gdeath', 2), gain: 0.85, pitch: [-0.5, 0.5], wet: 0.4 },
    { files: take('zombie', 'stomp', 1, 2), gain: 0.8, pitch: [-1, 0], at: [0.6, 0.75], wet: 0.3 },
  ] },
  big_step: { cooldown: 0.15, minor: true, layers: [
    { files: take('reveal', 'bigstep', 1, 3), gain: 0.5, pitch: [-1, 0.5], wet: 0.2 },
  ] },
  // the Bloater's spore burst
  bloater_burst: { cooldown: 0.2, layers: [
    { files: take('reveal', 'swet', 1), gain: 0.65, pitch: [-2, 0], wet: 0.25 },
    { files: take('lib', 'squish', 4, 6), gain: 0.55, pitch: [-2, 0], at: 0.04 },
  ] },
  revive: { cooldown: 0.3, layers: [
    { files: take('zombie', 'alert', 4), gain: 0.5, rate: -1.5, pitch: [-0.5, 0.5], wet: 0.4 },
    { synth: 'revive', gain: 1 },
  ] },
  wake: { cooldown: 0.3, duck: { ms: 900, amount: 0.5 }, layers: [
    { files: take('zombie', 'groar', 13), gain: 0.75, wet: 0.35 },
    { files: take('lib', 'soft', 3), gain: 0.5, at: 0.1, pitch: [-2, -1] },
  ] },
  // the Shield Guard's shield breaks / it switches stance: wood splitting, a crack, a board knock, a low boom
  shield_break: { cooldown: 0.4, duck: { ms: 900, amount: 0.4 }, layers: [
    { files: take('reveal', 'scrack', 14), gain: 0.8, wet: 0.2 },
    { files: take('reveal', 'crack', 2), gain: 0.65, wet: 0.25 },
    { files: take('lib', 'thwack', 10), gain: 0.55, pitch: [-2, -1] },
    { files: take('reveal', 'boom', 8), gain: 0.55, wet: 0.3 },
    { files: take('lib', 'metal', 3), gain: 0.3, pitch: [-2, -1], at: 0.05, wet: 0.3 },
  ] },

  // ---------------------------------------------------------------- the big moments
  // the finisher (a kill on a Staggered zombie): Marc's revealSmash + revealCutHit + revealSpinSwish picks
  finisher: { cooldown: 0.3, duck: { ms: 1500, amount: 0.3 }, layers: [
    { files: take('reveal', 'boom', 8), gain: 0.7, wet: 0.35 },
    { files: take('reveal', 'sbone', 1), gain: 0.7, pitch: [-1, 0.5], wet: 0.15 },
    { files: take('lib', 'squish', 7), gain: 0.55, pitch: [-1, 0.5] },
    { files: take('reveal', 'scrack', 3), gain: 0.5, pitch: [-0.5, 0.5] },
    { files: take('reveal', 'thump', 9), gain: 0.55 },
    { files: take('reveal', 'slowswish', 2), gain: 0.5, at: 0.08, wet: 0.2 },
    { synth: 'kick_big', gain: 0.75 },
  ] },
  combat_won: { cooldown: 1, bus: 'ui', layers: [
    { synth: 'victory', gain: 1, at: 0.15 },
    { files: take('reveal', 'ding', 4), gain: 0.45, rate: -2, wet: 0.4, at: 0.15 },
  ] },
  // the boss is down / the floor is cleared: a long low chime (the big lift bell)
  floor_cleared: { cooldown: 2, bus: 'ui', duck: { ms: 2500, amount: 0.35 }, layers: [
    { files: take('reveal', 'ding', 8), gain: 1.0, wet: 0.4, maxDur: 4.5, fade: 1.5 },
    { synth: 'victory', gain: 0.9, at: 0.1 },
  ] },
  boss_death: { cooldown: 2, duck: { ms: 2600, amount: 0.25 }, layers: [
    { files: take('reveal', 'boom', 1), gain: 0.55, at: 0.15, maxDur: 5, fade: 2.5, wet: 0.2 },
  ] },
  boss_intro: { cooldown: 2, duck: { ms: 2200, amount: 0.3 }, layers: [
    { files: take('zombie', 'sting', 2), gain: 0.7, wet: 0.3 },
    { files: take('reveal', 'drum', 6), gain: 0.6, at: 0.15, wet: 0.3 },
  ] },
  elite_intro: { cooldown: 2, duck: { ms: 1200, amount: 0.45 }, layers: [
    { files: take('reveal', 'drum', 5), gain: 0.6, wet: 0.3 },
    { files: take('zombie', 'groar', 13), gain: 0.45, at: 0.18, wet: 0.35 },
  ] },
  // the monitor's flatline (the long tone only: the file's own beeps come before 6 s)
  flatline: { cooldown: 3, layers: [
    { files: take('reveal', 'flatline', 1), gain: 0.22, offset: 5.85, maxDur: 2.4, fade: 1.6 },
  ] },
  heartbeat: { cooldown: 0.2, layers: [
    { files: take('reveal', 'heart', 1, 2, 3), gain: 0.36, pitch: [-0.4, 0.4], lp: 1400 },
  ] },
  heartbeat_deep: { cooldown: 0.2, layers: [
    { files: take('reveal', 'heart', 15, 16), gain: 0.42, pitch: [-0.4, 0.2], lp: 1100 },
  ] },
  turn_enemy: { cooldown: 0.5, minor: true, layers: [
    { files: take('reveal', 'drum', 1), gain: 0.22, lp: 1500, pitch: [-0.5, 0.5], wet: 0.25 },
  ] },

  // ---------------------------------------------------------------- the map and rooms
  step: { cooldown: 0.05, bus: 'ui', minor: true, layers: [
    { files: take('lib', 'step', 11, 12, 13, 14), gain: 0.75, pitch: [-1, 1], wet: 0.15 },
  ] },
  door: { cooldown: 0.4, bus: 'ui', layers: [
    { files: take('lib', 'door', 1, 2), gain: 1.0, pitch: [-0.5, 0.5], wet: 0.3 },
  ] },
  door_shut: { cooldown: 0.4, bus: 'ui', layers: [
    { files: take('lib', 'doorshut', 1, 4), gain: 1.0, pitch: [-0.5, 0.5], wet: 0.3 },
  ] },
  lift_open: { cooldown: 1, bus: 'ui', layers: [
    { files: take('reveal', 'ldoorsopen', 4), gain: 0.95, wet: 0.2 },
  ] },
  lift_close: { cooldown: 1, bus: 'ui', layers: [
    { files: take('reveal', 'ldoorsclose', 4), gain: 0.95, wet: 0.2 },
  ] },
};

// ---------------------------------------------------------------- synthesised sounds
// Each recipe gets the synth kit `k` from audio.js (k.tone, k.noise, k.bell, all scheduled at absolute ctx time) and
// { t, gain, rate } (rate: semitones). Kept soft: sines and triangles, slow-ish attacks, everything low-passed, and
// no square waves. Levels assume the UI bus; gain scales the whole recipe.
const st = (n) => Math.pow(2, n / 12);
export const SYNTHS = {
  // the tiniest tick: a filtered click and a short high sine
  hover(k, { t, gain }) {
    k.noise({ t, dur: 0.025, gain: 0.11 * gain, filter: 'bandpass', f: 3800, q: 1.4 });
    k.tone({ t, f: 2100, dur: 0.035, gain: 0.055 * gain, attack: 0.002 });
  },
  // a soft button press: a quick pitch-dropping sine thump + a muted click
  click(k, { t, gain }) {
    k.tone({ t, f: 820, f2: 520, glide: 0.05, dur: 0.07, gain: 0.165 * gain, attack: 0.002 });
    k.noise({ t, dur: 0.02, gain: 0.075 * gain, filter: 'highpass', f: 2400 });
  },
  // a card leaving the hand: a paper whoosh rising, with a soft low push
  card(k, { t, gain }) {
    k.noise({ t, dur: 0.2, gain: 0.288 * gain, attack: 0.05, filter: 'bandpass', f: 700, f2: 2600, q: 1.1 });
    k.tone({ t, f: 170, f2: 120, glide: 0.08, dur: 0.1, gain: 0.144 * gain, attack: 0.01 });
  },
  // a card into the hand: a short high swish
  draw(k, { t, gain }) {
    k.noise({ t, dur: 0.1, gain: 0.175 * gain, attack: 0.02, filter: 'bandpass', f: 1900 + Math.random() * 500, f2: 4200, q: 1.6 });
  },
  // the hand goes to the discard: a longer, lower swish
  discard(k, { t, gain }) {
    k.noise({ t, dur: 0.24, gain: 0.176 * gain, attack: 0.06, filter: 'bandpass', f: 2600, f2: 900, q: 1.1 });
  },
  // the discard pile riffles back into the draw pile
  shuffle(k, { t, gain }) {
    for (let i = 0; i < 9; i++) k.noise({ t: t + i * 0.028, dur: 0.03, gain: (0.05 + 0.015 * Math.sin(i)) * gain, filter: 'bandpass', f: 2200 + i * 160, q: 2 });
    k.noise({ t: t + 0.26, dur: 0.06, gain: 0.225 * gain, filter: 'lowpass', f: 900 });
  },
  // exhausted: a soft burn, the top falling away
  exhaust(k, { t, gain }) {
    k.noise({ t, dur: 0.45, gain: 0.198 * gain, attack: 0.03, filter: 'lowpass', f: 4200, f2: 260, q: 0.8 });
    for (let i = 0; i < 4; i++) k.noise({ t: t + 0.05 + Math.random() * 0.25, dur: 0.012, gain: 0.088 * gain, filter: 'highpass', f: 3000 });
  },
  // a card made from nothing (Panic, a copy): a quick bright swish up
  created(k, { t, gain }) {
    k.noise({ t, dur: 0.12, gain: 0.14 * gain, attack: 0.03, filter: 'bandpass', f: 1400, f2: 3800, q: 1.4 });
    k.tone({ t: t + 0.04, f: 1320, dur: 0.12, gain: 0.05 * gain });
  },
  // energy back: two soft bell notes (E5, B5), a monitor-like sweetness
  energy(k, { t, gain }) {
    k.bell({ t, f: 659.3, dur: 0.6, gain: 0.105 * gain });
    k.bell({ t: t + 0.07, f: 987.8, dur: 0.75, gain: 0.09 * gain });
  },
  // not allowed: a low, round double buzz (triangles through a low-pass, never harsh)
  deny(k, { t, gain }) {
    for (const d of [0, 0.1]) {
      k.tone({ t: t + d, type: 'triangle', f: 150, dur: 0.075, gain: 0.168 * gain, attack: 0.006, lp: 700 });
      k.tone({ t: t + d, type: 'triangle', f: 157, dur: 0.075, gain: 0.112 * gain, attack: 0.006, lp: 700 });
    }
  },
  // supplies: three quick little bells
  coin(k, { t, gain }) {
    [2637, 3136, 3520].forEach((f, i) => k.bell({ t: t + i * 0.05, f: f * (0.98 + Math.random() * 0.04), dur: 0.28, gain: 0.09 * gain, partials: [[1, 1], [2.76, 0.25]] }));
  },
  // a panel opens: a soft rising swoosh with a sine glide
  open(k, { t, gain }) {
    k.noise({ t, dur: 0.22, gain: 0.12 * gain, attack: 0.06, filter: 'bandpass', f: 500, f2: 1800, q: 1.2 });
    k.tone({ t, f: 330, f2: 660, glide: 0.18, dur: 0.24, gain: 0.08 * gain, attack: 0.03 });
  },
  close(k, { t, gain }) {
    k.noise({ t, dur: 0.2, gain: 0.1 * gain, attack: 0.04, filter: 'bandpass', f: 1600, f2: 450, q: 1.2 });
    k.tone({ t, f: 600, f2: 320, glide: 0.16, dur: 0.2, gain: 0.07 * gain, attack: 0.02 });
  },
  // a map node chosen: a wooden tock + a rising fifth
  select(k, { t, gain }) {
    k.tone({ t, f: 520, f2: 380, glide: 0.04, dur: 0.06, gain: 0.176 * gain, attack: 0.002 });
    k.bell({ t: t + 0.03, f: 784, dur: 0.35, gain: 0.099 * gain });
    k.bell({ t: t + 0.1, f: 1175, dur: 0.45, gain: 0.088 * gain });
  },
  // end turn: a soft low knock and a falling pair
  end_turn(k, { t, gain }) {
    k.tone({ t, f: 240, f2: 150, glide: 0.06, dur: 0.12, gain: 0.16 * gain, attack: 0.003 });
    k.bell({ t: t + 0.04, f: 880, dur: 0.35, gain: 0.056 * gain });
    k.bell({ t: t + 0.12, f: 659.3, dur: 0.45, gain: 0.056 * gain });
  },
  // your turn: a gentle rising pair
  your_turn(k, { t, gain }) {
    k.bell({ t, f: 523.3, dur: 0.4, gain: 0.08 * gain });
    k.bell({ t: t + 0.09, f: 784, dur: 0.55, gain: 0.09 * gain });
  },
  toggle(k, { t, gain }) { k.tone({ t, f: 1100, f2: 900, glide: 0.03, dur: 0.05, gain: 0.12 * gain, attack: 0.002 }); },
  // a card upgraded / something improved: a rising arpeggio with shimmer
  upgrade(k, { t, gain }) {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => k.bell({ t: t + i * 0.06, f, dur: 0.5, gain: 0.077 * gain }));
    k.noise({ t, dur: 0.45, gain: 0.055 * gain, attack: 0.1, filter: 'highpass', f: 6000 });
  },
  // a card removed: a downward burn
  remove(k, { t, gain }) {
    k.noise({ t, dur: 0.5, gain: 0.16 * gain, attack: 0.04, filter: 'lowpass', f: 3500, f2: 200 });
    k.tone({ t, f: 440, f2: 180, glide: 0.4, dur: 0.45, gain: 0.06 * gain, attack: 0.02 });
  },
  buy(k, o) { SYNTHS.click(k, o); SYNTHS.coin(k, { ...o, t: o.t + 0.03 }); },

  // ---- combat stingers (sfx bus)
  // a felt low thump under gunshots (headphones get the weight, phones don't miss it)
  kick(k, { t, gain }) { k.tone({ t, f: 130, f2: 48, glide: 0.09, dur: 0.16, gain: 0.32 * gain, attack: 0.002 }); },
  kick_big(k, { t, gain }) {
    k.tone({ t, f: 110, f2: 34, glide: 0.18, dur: 0.38, gain: 0.42 * gain, attack: 0.003 });
    k.noise({ t, dur: 0.12, gain: 0.08 * gain, filter: 'lowpass', f: 400 });
  },
  pulse_low(k, { t, gain }) { k.tone({ t, f: 90, f2: 60, glide: 0.1, dur: 0.22, gain: 0.25 * gain, attack: 0.01 }); },
  // block shimmer: two detuned high sines, quick in, slow out
  shield(k, { t, gain }) {
    k.tone({ t, f: 1568, dur: 0.35, gain: 0.025 * gain, attack: 0.01 });
    k.tone({ t, f: 1576, dur: 0.4, gain: 0.02 * gain, attack: 0.015 });
    k.noise({ t, dur: 0.18, gain: 0.025 * gain, attack: 0.02, filter: 'highpass', f: 5000 });
  },
  // heal: a warm major arpeggio, triangle + sine, slow attack
  heal(k, { t, gain }) {
    [523.3, 659.3, 784, 1046.5].forEach((f, i) => {
      k.tone({ t: t + i * 0.07, type: 'triangle', f, dur: 0.7, gain: 0.07 * gain, attack: 0.04, lp: 2500 });
      k.tone({ t: t + i * 0.07, f: f * 2, dur: 0.5, gain: 0.024 * gain, attack: 0.04 });
    });
  },
  // a buff: three rising notes (D5, A5, D6)
  buff(k, { t, gain }) {
    [587.3, 880, 1174.7].forEach((f, i) => k.tone({ t: t + i * 0.055, type: 'triangle', f, dur: 0.32, gain: 0.1 * gain, attack: 0.01, lp: 3000 }));
  },
  // a power card: a slow swell into a bright chord
  power(k, { t, gain }) {
    k.noise({ t, dur: 0.4, gain: 0.06 * gain, attack: 0.3, filter: 'bandpass', f: 400, f2: 2400, q: 0.9 });
    [440, 554.4, 659.3, 880].forEach((f) => k.tone({ t: t + 0.28, type: 'triangle', f, dur: 0.7, gain: 0.0312 * gain, attack: 0.02, lp: 2800 }));
  },
  // a debuff on the party: a falling, darker pair + a hiss
  debuff(k, { t, gain, rate = 0 }) {
    const r = st(rate);
    k.tone({ t, type: 'triangle', f: 392 * r, f2: 370 * r, glide: 0.2, dur: 0.3, gain: 0.11 * gain, attack: 0.01, lp: 1400 });
    k.tone({ t: t + 0.12, type: 'triangle', f: 277 * r, f2: 262 * r, glide: 0.25, dur: 0.4, gain: 0.11 * gain, attack: 0.01, lp: 1200 });
    k.noise({ t, dur: 0.3, gain: 0.055 * gain, attack: 0.05, filter: 'bandpass', f: 1200, f2: 500, q: 1 });
  },
  // Staggered: a ringing knock that wobbles down (dizzy)
  stagger(k, { t, gain }) {
    k.tone({ t, f: 620, f2: 410, glide: 0.4, dur: 0.5, gain: 0.09 * gain, attack: 0.004, vibrato: { rate: 11, depth: 18 } });
    k.tone({ t, f: 1240, f2: 830, glide: 0.4, dur: 0.35, gain: 0.0324 * gain, attack: 0.004 });
  },
  // a zombie powers up: a low growl-like swell
  enemy_buff(k, { t, gain }) {
    k.tone({ t, type: 'sawtooth', f: 82, f2: 110, glide: 0.35, dur: 0.45, gain: 0.065 * gain, attack: 0.12, lp: 500 });
    k.tone({ t, type: 'triangle', f: 165, f2: 220, glide: 0.35, dur: 0.45, gain: 0.039 * gain, attack: 0.12, lp: 900 });
  },
  enemy_heal(k, { t, gain }) {
    [349.2, 440, 523.3].forEach((f, i) => k.tone({ t: t + i * 0.08, type: 'triangle', f, dur: 0.5, gain: 0.055 * gain, attack: 0.05, lp: 1300 }));
  },
  immune(k, { t, gain }) { k.bell({ t, f: 1975, dur: 0.25, gain: 0.066 * gain, partials: [[1, 1], [1.5, 0.4]] }); },
  stun(k, { t, gain }) {
    for (let i = 0; i < 3; i++) k.bell({ t: t + i * 0.09, f: 2349 * (1 - i * 0.06), dur: 0.3, gain: 0.0625 * gain });
  },
  sparkle(k, { t, gain }) {
    for (let i = 0; i < 5; i++) k.bell({ t: t + i * 0.035, f: 2000 + i * 330 + Math.random() * 80, dur: 0.25, gain: 0.028 * gain, partials: [[1, 1]] });
  },
  revive(k, { t, gain }) {
    k.noise({ t, dur: 0.9, gain: 0.05 * gain, attack: 0.7, filter: 'bandpass', f: 200, f2: 1400, q: 1.2 });
    k.tone({ t, type: 'triangle', f: 110, f2: 220, glide: 0.8, dur: 0.95, gain: 0.03 * gain, attack: 0.6, lp: 800 });
  },
  // pepper spray / extinguisher: a pressurised hiss
  spray(k, { t, gain }) {
    k.noise({ t, dur: 0.7, gain: 0.24 * gain, attack: 0.03, filter: 'bandpass', f: 5200, f2: 3800, q: 0.7 });
    k.noise({ t, dur: 0.7, gain: 0.1 * gain, attack: 0.05, filter: 'lowpass', f: 900 });
  },
  // a fight won: a short warm major chord, rolled
  victory(k, { t, gain }) {
    [392, 493.9, 587.3, 784].forEach((f, i) => {
      k.tone({ t: t + i * 0.06, type: 'triangle', f, dur: 1.1, gain: 0.105 * gain, attack: 0.02, lp: 2400 });
      k.tone({ t: t + i * 0.06, f: f * 2, dur: 0.8, gain: 0.03 * gain, attack: 0.02 });
    });
  },
};

// the UI names (audio.ui(name)) and what they play: a synth recipe, or a bank
export const UI = {
  hover: 'hover', tick: 'hover', click: 'click', card: 'card', deny: 'deny', error: 'deny', coin: 'coin', open: 'open',
  close: 'close', select: 'select', draw: 'draw', energy: 'energy', end_turn: 'end_turn', shuffle: 'shuffle',
  discard: 'discard', exhaust: 'exhaust', upgrade: 'upgrade', remove: 'remove', buy: 'buy', toggle: 'toggle',
  your_turn: 'your_turn', pickup: 'pickup', supplies: 'supplies', door: 'door',
};

// ---------------------------------------------------------------- per-zombie voices
// Which banks each zombie uses and how it is pitched (semitones). Small zombies sit higher, big ones lower.
const NORMAL = { alert: 'z_alert', attack: 'z_attack', hurt: 'z_hurt', death: 'z_death', roar: 'z_alert', fall: 'body_fall', pitch: 0 };
const BRUTE = { alert: 'brute_roar', attack: 'brute_attack', hurt: 'brute_pain', death: 'brute_death', roar: 'brute_roar', fall: 'heavy_fall', pitch: 0, big: true };
export const VOICES = {
  default: NORMAL,
  shambler: { ...NORMAL, pitch: -0.8 },
  biter: { ...NORMAL, pitch: 2.5 },
  spitter: { ...NORMAL, pitch: 3 },
  screamer: { ...NORMAL, alert: 'scream', roar: 'scream', pitch: 1.5 },
  sprinter: { ...NORMAL, attack: 'sprinter_charge', death: 'sprinter_death', pitch: 0.5 },
  nurse: { ...NORMAL, pitch: 1 },
  bloater: { ...NORMAL, pitch: -2 },
  orderly: { ...NORMAL, pitch: -1.2 },
  big_walker: { ...BRUTE },
  sleeping_patient: { ...BRUTE, pitch: 1 },
  shield_guard: { ...BRUTE, pitch: -0.8, boss: true },
};
// heavy moves that land as a slam (the hit uses boss_slam instead of the bite)
const SLAMS = new Set(['shield_bash', 'shield_charge', 'double_slam', 'charge', 'flail', 'headbutt']);

// card id -> a bank played when the card is played (on top of the normal card sound)
export const CARD_SFX = {
  check_mag: 'check_mag', kick_the_door: 'kick_door', bolt_the_door: 'bolt_door', defibrillator: 'defib',
  adrenaline_shot: 'adrenaline', overdrive: 'defib', tuck_and_roll: 'dodge', flare: 'throw',
};
// Marc's equipped weapon -> the bank his light and heavy hits use
export const WEAPON_HITS = {
  wood_bat: { light: 'bat_hit', heavy: 'heavy_hit' },
  nail_bat: { light: 'nail_hit', heavy: 'heavy_hit' },
  wire_bat: { light: 'nail_hit', heavy: 'heavy_hit' },
  crowbar: { light: 'metal_hit', heavy: 'heavy_hit' },
  fire_axe: { light: 'axe_hit', heavy: 'axe_hit' },
  sledgehammer: { light: 'metal_hit', heavy: 'heavy_hit' },
};

const PARTY_BUFFS = new Set(['strength', 'dexterity', 'plating', 'thorns', 'temp_strength', 'swing_guard', 'thick_skin', 'berserker',
  'fortify', 'marksman', 'light_feet', 'dead_eye', 'ritual', 'immune', 'enrage', 'hunch']);
const DEBUFFS = new Set(['vulnerable', 'weak', 'frail', 'bleed']);
const HEAVY_CLIP = /bat_swing|Heavy|Regular_C|execution|Dash/i;

// ---------------------------------------------------------------- the event map
// api (from audio.js): play(key, opts) -> bool, synth(name, opts), duck(ms, amount), heartbeat(level), music(track),
//   locate(uid) -> pan | null (optional), autoMusic (bool)
// opts for play: { vol, pitch (st), pan (-1..1), delay (s) }
export function createEventSounds(api) {
  const enemies = new Map();        // uid -> { id, slot, tier }
  const fxAt = new Map();           // director fx name -> performance.now() it arrived
  const hurtAt = new Map();         // uid -> last hurt cry
  const lastMove = new Map();       // uid -> move id of its current action
  let energy = null, hp = null, maxHp = 80, ended = false, bossDown = false, lastCard = null, lastCardAt = 0, lastHurtAny = 0, turnAt = 0;
  let weapons = { marc: 'wood_bat', yola: 'pistol' };

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const recent = (name, ms = 350) => { const t = fxAt.get(name); return t != null && now() - t < ms; };
  const voice = (uid) => VOICES[enemies.get(uid)?.id] || VOICES.default;
  // a zombie uid: one from combat_start, or anything that isn't a hero / the party (so a missed combat_start still works)
  const isEnemy = (uid) => enemies.has(uid) || (typeof uid === 'string' && uid !== 'marc' && uid !== 'yola' && uid !== 'party');
  function pan(uid) {
    const p = api.locate?.(uid);
    if (typeof p === 'number' && isFinite(p)) return Math.max(-1, Math.min(1, p));
    if (uid === 'marc') return -0.28;
    if (uid === 'yola') return -0.48;
    if (uid === 'party' || uid == null) return -0.38;
    const e = enemies.get(uid); if (!e) return 0.3;
    return [0.2, 0.42, 0.62, 0.3, 0.52][e.slot] ?? 0.35;
  }
  const play = (key, o = {}) => api.play(key, o);
  const vox = (uid, what, o = {}) => { const v = voice(uid); return play(v[what], { pitch: v.pitch, pan: pan(uid), ...o }); };

  function hitBank(e) {
    const by = e.hero || (e.source === 'marc' || e.source === 'yola' ? e.source : null);
    switch (e.kind) {
      case 'gun': return 'bullet_hit';
      case 'blast': return 'blast_hit';
      case 'bleed': return 'bleed_tick';
      case 'thorns': return 'thorns';
      case 'heavy': return (by !== 'yola' && WEAPON_HITS[weapons.marc]?.heavy) || 'heavy_hit';
      default: return (by !== 'yola' && WEAPON_HITS[weapons.marc]?.light) || 'bat_hit';
    }
  }

  function setHp(v, max) {
    if (typeof max === 'number' && max > 0) maxHp = max;
    if (typeof v !== 'number') return;
    hp = v;
    if (ended) { api.heartbeat(0); return; } // (a relic's heal after the fight must not restart it on the map)
    const low = hp > 0 && hp <= maxHp * 0.3;
    api.heartbeat(low ? (hp <= maxHp * 0.15 ? 2 : 1) : 0);
  }

  function finish(won) {
    if (ended) return; ended = true;
    if (won) { api.heartbeat(0); if (!bossDown) play('combat_won'); return; }
    // defeat: the music cuts, two last slow heartbeats, then the flatline
    api.heartbeat(0);
    api.music?.(null, { fade: 0.35 });
    play('heartbeat_deep', { vol: 0.9 });
    play('heartbeat_deep', { vol: 0.6, delay: 1.0, pitch: -1 });
    play('flatline', { delay: 1.75 });
  }

  // the director's own moments (render/director.js sends { t: 'fx', name, ... } at the exact frame)
  function fx(e) {
    fxAt.set(e.name, now());
    switch (e.name) {
      case 'swing': {
        const heavy = HEAVY_CLIP.test(e.clip || '');
        play(heavy ? 'swing_heavy' : 'swing', { pan: pan(e.by || 'marc') });
        break;
      }
      case 'pistol': play('pistol', { pan: pan(e.by || 'yola') }); break;
      case 'shotgun': play('shotgun', { pan: pan(e.by || 'yola') }); break;
      case 'zombie_attack': zombieAttack(e.by); break;
      case 'finisher': play('finisher', { vol: e.first === false ? 0.85 : 1 }); break;
      case 'power': play('power', { pan: pan(e.hero) }); break;
      case 'body_fall': {
        const v = voice(e.uid);
        play(v.fall, { pan: pan(e.uid), delay: v.big ? 0.65 : 0.45 });
        break;
      }
      case 'zombie_roar': vox(e.uid, 'roar'); break;
      case 'mode_shift': if (e.mode === 'defensive') play('shield_break', { pan: pan(e.uid) }); else vox(e.uid, 'roar'); break;
      case 'victory': finish(true); break;
      case 'defeat': finish(false); break;
      default: if (api.has?.(e.name)) play(e.name, { pan: e.uid ? pan(e.uid) : 0 });
    }
  }

  function zombieAttack(uid) {
    const v = voice(uid);
    vox(uid, 'attack');
    play('z_swipe', { pan: pan(uid), delay: 0.12, pitch: v.big ? -3 : 0 });
    if (v.big && SLAMS.has(lastMove.get(uid))) play('big_step', { pan: pan(uid), delay: 0.05 });
  }

  function handle(e) {
    if (!e || typeof e !== 'object') return;
    switch (e.t) {
      case 'fx': fx(e); break;

      case 'combat_start': {
        enemies.clear(); hurtAt.clear(); lastMove.clear(); fxAt.clear();
        energy = null; ended = false; bossDown = false; lastCard = null;
        if (typeof e.maxHp === 'number') maxHp = e.maxHp;
        for (const s of e.enemies || []) enemies.set(s.uid, { id: s.id, slot: s.slot ?? 0, tier: s.tier });
        if (api.autoMusic) api.music?.(e.music || (e.boss ? 'boss' : e.elite ? 'elite' : 'fight'));
        const list = (e.enemies || []).filter((s) => s.pose !== 'lying');
        if (e.boss) {
          play('boss_intro');
          play('big_step', { pan: 0.45, delay: 0.5 }); play('big_step', { pan: 0.45, delay: 1.05, vol: 0.9 });
          list.slice(0, 1).forEach((s) => vox(s.uid, 'alert', { delay: 1.4 }));
        } else if (e.elite) {
          play('elite_intro');
          list.slice(0, 1).forEach((s) => vox(s.uid, 'alert', { delay: 0.45 }));
        } else {
          list.slice(0, 2).forEach((s, i) => vox(s.uid, 'alert', { delay: 0.15 + i * 0.38, vol: i ? 0.8 : 1 }));
        }
        break;
      }
      case 'turn_start':
        if (e.side === 'enemy') play('turn_enemy');
        else { turnAt = now(); if (e.turn > 1) api.synth('your_turn', { vol: 0.9 }); }
        break;
      case 'energy':
        // the refill at the start of a turn rides on the "your turn" bells; a gain mid-turn chimes on its own
        if (energy != null && e.energy > energy && now() - turnAt > 400) api.synth('energy');
        energy = e.energy;
        break;
      case 'draw': {
        const n = Math.min(6, (e.uids || []).length || 1);
        for (let i = 0; i < n; i++) api.synth('draw', { delay: i * 0.06, vol: 1 - i * 0.08 });
        break;
      }
      case 'shuffle': api.synth('shuffle'); break;
      // a played card going to the discard pile is silent (the hand's own 'card' whoosh covers it); the end-of-turn
      // discard and discard effects (Check the Mag) swish
      case 'discard': if (e.endOfTurn || (e.uids || []).length > 1 || !lastCard || lastCard.uid !== e.uids?.[0]) api.synth('discard', { vol: e.endOfTurn ? 1 : 0.6 }); break;
      case 'exhaust': api.synth('exhaust', { vol: e.fleeting ? 0.6 : 1 }); break;
      case 'card_created': api.synth('created'); break;

      case 'card_played': {
        lastCard = e; lastCardAt = now();
        const extra = CARD_SFX[e.id];
        if (extra) play(extra, { pan: pan(e.hero) });
        else if (e.anim === 'throw') play('throw', { pan: pan(e.hero) });
        // the director sends its own 'power' fx just before this event lands; without a director it plays from here
        if (e.type === 'power' && !recent('power')) play('power', { pan: pan(e.hero) });
        break;
      }
      case 'attack': {
        if (isEnemy(e.by)) { if (!recent('zombie_attack')) zombieAttack(e.by); break; }
        const anim = e.anim || '';
        if (/pistol/.test(anim)) { if (!recent('pistol')) play('pistol', { pan: pan(e.by) }); }
        else if (/shotgun/.test(anim)) { if (!recent('shotgun')) play('shotgun', { pan: pan(e.by) }); }
        else if (/^melee/.test(anim)) { if (!recent('swing')) play(/heavy|sweep/.test(anim) ? 'swing_heavy' : 'swing', { pan: pan(e.by) }); }
        break;
      }
      case 'damage': damage(e); break;
      case 'block': {
        if (e.cleared || !(e.amount > 0)) break;
        if (e.target === 'party') {
          const fromCard = lastCard && now() - lastCardAt < 1500;
          const dodge = fromCard && lastCard.anim === 'dodge';
          play(dodge ? 'dodge' : 'block', { pan: pan(fromCard ? lastCard.hero || 'marc' : 'party'), vol: fromCard ? 1 : 0.7 });
        } else play('zombie_block', { pan: pan(e.target) });
        break;
      }
      case 'heal':
        if (e.target === 'party') { if (e.amount > 0) play('heal', { pan: -0.35 }); setHp(e.hp, e.maxHp); }
        else if (e.amount > 0) play('enemy_heal', { pan: pan(e.target) });
        break;
      case 'status': status(e); break;
      case 'death': death(e); break;
      case 'enemy_move': enemyMove(e); break;
      case 'revive': play('revive', { pan: pan(e.uid) }); break;
      case 'mode_shift':
        if (e.mode === 'defensive') { if (!recent('mode_shift', 1200)) play('shield_break', { pan: pan(e.uid) }); }
        else vox(e.uid, 'roar', { vol: 0.8 });
        break;
      case 'wake': play('wake', { pan: pan(e.uid) }); break;
      case 'stunned': play('stun', { pan: pan(e.uid) }); break;
      case 'immune': play('immune', { pan: pan(e.target) }); break;
      case 'escape': for (let i = 0; i < 4; i++) play('step', { pan: pan(e.uid), delay: i * 0.16, vol: 1 - i * 0.2 }); break;
      case 'relic': play('relic'); break;
      case 'gold': if (e.amount > 0) play('supplies'); break;
      case 'potion': potion(e); break;
      case 'combat_end': finish(!!e.won); break;
      default: break;
    }
  }

  function damage(e) {
    if (e.target === 'party') {
      setHp(e.hp);
      const by = e.source;
      if (e.kind === 'self') { if (e.amount > 0) play('self_hit', { pan: pan(e.hero) }); return; }
      if (e.kind === 'bleed') { if (e.amount > 0) play('bleed_tick', { pan: -0.38 }); return; }
      const p = pan(e.hero || 'party');
      if (e.amount > 0) {
        const slam = isEnemy(by) && voice(by).big && SLAMS.has(lastMove.get(by));
        if (slam) play('boss_slam', { pan: p });
        else play(e.amount >= 12 ? 'party_hit_heavy' : 'party_hit', { pan: p });
        if (e.blocked > 0) play('party_blocked', { pan: p, vol: 0.6 });
      } else if (e.blocked > 0) play('party_blocked', { pan: p });
      return;
    }
    // a zombie is hit
    const p = pan(e.target);
    if (e.amount > 0) {
      play(hitBank(e), { pan: p, vol: e.amount >= 15 ? 1.1 : 1 });
      if (e.staggered && /light|heavy|gun|blast/.test(e.kind || 'light')) play('stagger_crack', { pan: p, vol: 0.9 });
      if (!e.killed && e.kind !== 'bleed' && e.kind !== 'thorns') {
        const t = now(), last = hurtAt.get(e.target) || 0;
        if (t - last > 450 && t - lastHurtAny > 140 && Math.random() < 0.65) {
          hurtAt.set(e.target, t); lastHurtAny = t;
          vox(e.target, 'hurt', { delay: 0.04 });
        }
      }
    }
    if (e.blocked > 0) play('block_hit', { pan: p, vol: e.amount > 0 ? 0.55 : 1 });
  }

  function status(e) {
    if (e.quiet || !e.delta) return;
    if (e.delta < 0 && e.status !== 'strength' && e.status !== 'dexterity') return; // a status wearing off: silent
    const bad = DEBUFFS.has(e.status) || ((e.status === 'strength' || e.status === 'dexterity') && e.delta < 0);
    if (e.target === 'party') {
      if (bad) play('debuff', { pan: -0.38 });
      else if (PARTY_BUFFS.has(e.status) && !recent('power', 500)) play('buff', { pan: -0.38 });
      return;
    }
    if (!isEnemy(e.target)) return;
    if (e.status === 'vulnerable' && e.delta > 0) play('stagger', { pan: pan(e.target) });
    else if (bad) play('enemy_debuff', { pan: pan(e.target) });
    else if (e.delta > 0 && e.status !== 'asleep' && e.status !== 'mode_shift') play('enemy_buff', { pan: pan(e.target) });
  }

  function death(e) {
    const v = voice(e.target), p = pan(e.target), id = enemies.get(e.target)?.id;
    if (e.finisher && !recent('finisher', 600)) play('finisher');
    vox(e.target, 'death', { delay: e.finisher ? 0.06 : 0.02 });
    if (id === 'bloater') play('bloater_burst', { pan: p, delay: 0.1 });
    if (v.boss) { bossDown = true; play('boss_death', { pan: p }); play('floor_cleared', { delay: 2.4 }); }
    // the body hits the floor (the director sends body_fall itself; without it, play it from here)
    if (!e.finisher && !recent('body_fall', 400)) play(v.fall, { pan: p, delay: v.big ? 0.75 : 0.5 });
    if (e.finisher) play(v.fall, { pan: p, delay: 0.9 });
  }

  function enemyMove(e) {
    lastMove.set(e.uid, e.move);
    const type = e.type || '';
    if (/attack/.test(type)) return; // the attack plays its cry (with the swing)
    if (type === 'sleep' || type === 'stun' || e.anim === 'none') return;
    const id = enemies.get(e.uid)?.id;
    switch (e.move) {
      case 'shriek': play('scream', { pan: pan(e.uid) }); return;
      case 'spit': vox(e.uid, 'attack', { vol: 0.7 }); play('spit', { pan: pan(e.uid), delay: 0.2 }); return;
      case 'shove': vox(e.uid, 'attack', { vol: 0.8 }); play('party_blocked', { pan: -0.3, delay: 0.25, vol: 0.5 }); return;
      case 'pepper_spray': vox(e.uid, 'attack', { vol: 0.7 }); play('spray', { pan: -0.2 }); return;
      case 'drain': vox(e.uid, 'roar', { vol: 0.7 }); return;
      case 'shield_wall': play('zombie_block', { pan: pan(e.uid), vol: 1.2 }); return; // (Raise Shield: its block event plays it)
      case 'mend': vox(e.uid, 'alert', { vol: 0.6 }); return;
      default: break;
    }
    if (/buff|heal/.test(type) && !recent('zombie_roar')) vox(e.uid, 'roar', { vol: id === 'biter' || id === 'spitter' ? 0.7 : 1 });
  }

  function potion(e) {
    switch (e.id) {
      case 'flashbang': play('throw'); play('flashbang'); break;
      case 'pipe_bomb': play('throw'); play('pipe_bomb'); break;
      case 'extinguisher': play('spray'); break;
      case 'epi_pen': play('defib'); break;
      case 'adrenaline': play('potion'); play('adrenaline', { delay: 0.15 }); break;
      default: play('potion');
    }
  }

  return {
    handle,
    reset() { enemies.clear(); fxAt.clear(); hurtAt.clear(); lastMove.clear(); energy = null; ended = false; api.heartbeat(0); },
    setLoadout(w = {}) { weapons = { ...weapons, ...w }; },
    setParty({ hp: v, maxHp: m } = {}) { setHp(v ?? hp, m); },
    get state() { return { enemies: [...enemies.entries()], hp, maxHp, energy, weapons }; },
  };
}

// every file the game can play (for tools/sfx-keep.json and the lab's checks)
export function filesInUse() {
  const s = new Set();
  for (const b of Object.values(BANKS)) for (const l of b.layers) for (const f of l.files || []) s.add(f);
  return [...s].sort();
}
