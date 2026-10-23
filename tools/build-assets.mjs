// Builds public/assets/ from Marc's other repos, read-only.
// - Pulls files out of yola-zombie (branch neighborhood-level) with `git archive` into .cache/ (never touches that repo).
// - Copies a few CC0 item models from the survival repo's working tree.
// - Keeps only the animation clips the game uses (no Kevin Iglesias `kev_` clips, no `t_` / Tripo clips: licence open),
//   shrinks textures to WebP, resamples clips and compresses geometry with meshopt.
// Run: npm run assets   (needs ../yola-zombie and ../survival next to this repo)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, prune, dedup, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const YZ = path.resolve(ROOT, '../yola-zombie');
const SURV = path.resolve(ROOT, '../survival');
const CACHE = path.join(ROOT, '.cache/yz');
const OUT = path.join(ROOT, 'public/assets');
const BRANCH = 'origin/neighborhood-level';
const A = 'yolanda/zombie/assets';

// ---------- what we take ----------
const HERO_CLIPS = [
  // idles and stances
  'ual1_Idle_Loop', 'ual1_Idle_LookAround_Loop', 'bat_idle', 'pistol_idle', 'rifle_aim_idle', 'ual1_Sword_Idle', 'kk_Melee_2H_Idle',
  // attacks
  'bat_swing', 'bat_swing_m', 'melee_horizontal', 'gs_low_slash', 'ual_Sword_Regular_A', 'ual_Sword_Regular_B', 'ual_Sword_Regular_C',
  'ual_Sword_Regular_A_Rec', 'ual_Sword_Regular_B_Rec', 'ual_Sword_Heavy_D', 'ual_Sword_Heavy_Combo', 'ual_Sword_Regular_Combo',
  'ual_Sword_Dash', 'ual1_Sword_Attack', 'hub_crowbar_combo',
  // finishers
  'hub_execution_B_uppercut', 'hub_execution_B_uppercut_2_4m', 'hub_execution_B_uppercut_3_4m', 'hub_execution_C_uppercut_mirrored',
  'hub_execution_C_uppercut_mirrored_2_4m', 'hub_execution_C_uppercut_mirrored_3_4m', 'hub_execution_shotgun_slide_short',
  'hub_execution_shotgun_slide_mid', 'hub_execution_shotgun_slide_long',
  // guns
  'pistol_reload', 'sg_reload', 'reload_rifle_stand',
  // defence and movement
  'ual_Sword_Block', 'ual1_Dodge_Left', 'ual1_Dodge_Right', 'ual1_Roll', 'ual_SafetyVault', 'ual_Slide_Start', 'ual_Slide_Loop', 'ual_Slide_Exit',
  'ual_KipUp', 'ual1_Sword_Enter', 'ual1_Sword_Exit', 'ual1_Walk_Loop', 'ual1_Jog_Fwd_Loop', 'ual1_Sprint_Loop', 'ual1_Jog_Bwd_Loop',
  // hits, down, defeat
  'hit_body', 'pistol_hit', 'yola_knockdown', 'yola_getup', 'death_defeat', 'death_fall',
];
const ZOMBIE_CLIPS = [
  'idle', 'walk', 'sprint', 'attack', 'scratch', 'hit_flinch', 'hit_stumble', 'react_large_front', 'react_large_back', 'react_large_left',
  'react_large_right', 'react_small_front', 'react_gut', 'knockback', 'knockdown', 'stumble_fall', 'standup_back', 'standup_stomach',
  'death_back', 'death_forward', 'death_chest_back', 'death_headshot_knees', 'death_hit_back', 'death_hit_forward',
  'shield_bash', 'shield_break', 'shield_dash', 'shield_idle', 'slam', 'slam_b',
];
const ZOMBIE_EXTRA_CLIPS = [
  'ual_Zombie_Bite', 'ual_Zombie_Spawn', 'ual_Zombie_Scratch', 'ual_Zombie_Idle_Loop', 'ual_Hit_Knockback', 'ual_KipUp', 'ual_LayToIdle',
  'ual_IdleToLay', 'ual1_Sitting_Idle_Loop', 'ual1_Sitting_Exit', 'guard_leap_slam', 'patient_bed_rise', 'ual1_Hit_Chest', 'ual1_Hit_Head',
];

// [source in yola-zombie assets, output name, clip list, texture max size]
const CHARACTERS = [
  ['male1.glb', 'marc.glb', HERO_CLIPS, 1024],
  ['male1_ual.glb', 'marc_moves.glb', HERO_CLIPS, 1024],
  ['yola2.glb', 'yola.glb', HERO_CLIPS, 1024],
  ['yola2_ual.glb', 'yola_moves.glb', HERO_CLIPS, 1024],
  ['zombie-romero.glb', 'z_romero.glb', ZOMBIE_CLIPS, 1024],
  ['zombie-patient.glb', 'z_patient.glb', ZOMBIE_CLIPS, 1024],
  ['zombie-scrubs.glb', 'z_scrubs.glb', ZOMBIE_CLIPS, 1024],
  ['zombie-zombiegirl.glb', 'z_girl.glb', ZOMBIE_CLIPS, 1024],
  ['zombie-sprinter.glb', 'z_sprinter.glb', ZOMBIE_CLIPS, 1024],
  ['zombie-nurse-mod.glb', 'z_nurse.glb', ZOMBIE_CLIPS, 1024],
  ['zombie-patient-mod.glb', 'z_patient_mod.glb', ZOMBIE_CLIPS, 1024],
  ['zombie-male-aab.glb', 'z_brute.glb', ZOMBIE_CLIPS, 1024],
  ['zombie-guard.glb', 'z_guard.glb', ZOMBIE_CLIPS, 1024],
  ['zombie_moves/romero.glb', 'z_romero_moves.glb', ZOMBIE_EXTRA_CLIPS, 0],
  ['zombie_moves/zombiegirl.glb', 'z_girl_moves.glb', ZOMBIE_EXTRA_CLIPS, 0],
  ['zombie_moves/male-aab.glb', 'z_brute_moves.glb', ZOMBIE_EXTRA_CLIPS, 0],
  ['zombie_moves/sprinter.glb', 'z_sprinter_moves.glb', ZOMBIE_EXTRA_CLIPS, 0],
  ['zombie_moves/sprinter-b.glb', 'z_sprinter_moves_b.glb', ZOMBIE_EXTRA_CLIPS, 0],
  ['zombie_moves/nurse-mod-b.glb', 'z_nurse_moves.glb', ZOMBIE_EXTRA_CLIPS, 0],
  ['zombie_moves/patient-mod-b.glb', 'z_patient_mod_moves.glb', ZOMBIE_EXTRA_CLIPS, 0],
  ['zombie_moves/patient-mod-c.glb', 'z_patient_mod_lay.glb', ZOMBIE_EXTRA_CLIPS, 0],
  ['zombie_moves/guard.glb', 'z_guard_moves.glb', ZOMBIE_EXTRA_CLIPS, 0],
];
const WEAPONS = ['wood_bat', 'crowbar', 'fire_axe', 'sledgehammer', 'chainsaw', 'pistol_core', 'pump_shotgun', 'pump_short'];
const HOSPITAL_PROPS = [
  'hospital/reception_desk', 'hospital/waiting_chair_section', 'hospital/wheelchair', 'hospital/iv_stand', 'hospital/recovery_bed',
  'hospital/recovery_bed_open_nx', 'hospital/supply_cart', 'hospital/supply_shelf', 'hospital/wet_floor_sign', 'hospital/janitor_cart',
  'hospital/privacy_screen', 'hospital/curtain_panel', 'hospital/curtain_rail', 'hospital/patient_monitor', 'hospital/medical_gas_cylinder',
  'hospital/linen_cabinet', 'hospital/locker_bank', 'hospital/water_cooler', 'hospital/wall_clock', 'hospital/biohazard_bin',
  'hospital/procedure_stretcher', 'hospital/operating_table', 'hospital/check_in_kiosk', 'hospital/sofa', 'hospital/magazine_rack',
  'hospital/floor_planter', 'hospital/coffee_machine', 'hospital/coffee_counter', 'hospital/mop_bucket', 'hospital/lidded_waste_bin',
  'hospital/medical_poster_family', 'hospital/reception_poster_heart', 'hospital/lobby_t2_wayfinding', 'hospital/assessment_status_board',
  'hospital/visitor_chair', 'hospital/wall_cupboard', 'hospital/storage_bins', 'hospital/laundry_hamper', 'hospital/team_desk',
  'hospital/desktop_computer', 'hospital/handwash_basin', 'hospital/sharps_container', 'hospital/mug', 'hospital/bedside_cabinet',
  'kit/Hospital_Braced_DoubleDoor', 'kit/Hospital_Elevator_Outbreak', 'kit/cafeteria_vending_machine', 'kit/pharmacy_medicine_shelf',
  'kit/pharmacy_locked_cupboard', 'kit/first_aid_case_closed', 'kit/guard_duffel_open', 'kit/sign_elevator', 'kit/sign_maintenance',
  'kit/status_amber_fault', 'kit/lab_microscope', 'kit/lab_sample_rack', 'kit/isolation_ppe_sign',
  'props/fire_extinguisher', 'props/filing_cabinet', 'props/mobile_xray', 'props/over_bed_table', 'props/ppe_trolley',
  'props/round_reception_desk', 'props/sawhorse_barrier', 'props/specimen_fridge', 'props/ceiling_collapse', 'props/courier_coolers',
  'props/intake_station', 'props/surgeon_cap', 'props/room_mechanics/o2_cylinder',
];
const TEXTURES = ['hospital_outbreak/blood_drag.webp', 'hospital_outbreak/blood_handprint.webp', 'hospital_outbreak/blood_splatter.webp',
  'hospital_outbreak/floor_clinical.jpg', 'hospital_outbreak/floor_corridor.jpg', 'hospital_outbreak/floor_maintenance.jpg',
  'hospital_outbreak/wall_clinical.jpg', 'hospital_outbreak/wall_maintenance.jpg'];
const SURVIVAL_ITEMS = ['medkit', 'radio', 'food-can', 'matchbox', 'water-bottle', 'backpack', 'lantern', 'pistol', 'axe'];
// sfx: all CC0 (see yola-zombie SOUND_PLAN.md "Sources used so far"); copied whole folders, trimmed below
const SFX_DIRS = ['sfx/guns', 'sfx/lib', 'sfx/zombie', 'sfx/reveal'];
const MUSIC = ['music/agile_groove.mp3', 'neighborhood/music/ch2_a_tension.mp3', 'neighborhood/music/ch2_c_action.mp3'];

// ---------- extract (read-only) ----------
function extract() {
  fs.mkdirSync(CACHE, { recursive: true });
  const paths = [
    ...CHARACTERS.map(c => `${A}/${c[0]}`), ...WEAPONS.map(w => `${A}/weapons/${w}.glb`),
    ...HOSPITAL_PROPS.map(p => `${A}/${p}.glb`), ...TEXTURES.map(t => `${A}/${t}`), ...SFX_DIRS.map(d => `${A}/${d}`),
    ...MUSIC.map(m => `${A}/${m}`),
  ];
  const missing = paths.filter(p => !fs.existsSync(path.join(CACHE, p)));
  if (!missing.length) return;
  console.log(`extracting ${missing.length} paths from yola-zombie ${BRANCH} (read-only git archive)`);
  execSync(`git -C "${YZ}" archive ${BRANCH} ${missing.map(p => `"${p}"`).join(' ')} | tar -x -C "${CACHE}"`, { stdio: 'inherit', maxBuffer: 1 << 30 });
}

async function io() {
  await MeshoptEncoder.ready; await MeshoptDecoder.ready;
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
}

async function optimize(io, src, dst, { clips = null, tex = 1024, compress = true } = {}) {
  const doc = await io.read(src);
  const root = doc.getRoot();
  const before = root.listAnimations().length;
  if (clips) for (const a of root.listAnimations()) if (!clips.includes(a.getName())) a.dispose();
  const kept = root.listAnimations().map(a => a.getName());
  const ops = [dedup(), resample({ tolerance: 1e-4 }), prune({ keepLeaves: true, keepAttributes: false })];
  if (tex > 0 && root.listTextures().length) ops.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 82 }));
  await doc.transform(...ops);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  await io.write(dst, doc);
  // gltfpack: quantized geometry + 30 Hz quantized animation + meshopt compression (about 4x smaller clips);
  // -kn/-km/-ke keep node (bone), material and extras names the game looks up
  if (compress) execSync(`npx gltfpack -i "${dst}" -o "${dst}" -cc -kn -km -ke`, { cwd: ROOT, stdio: 'pipe' });
  const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0);
  console.log(`${path.basename(dst).padEnd(28)} ${kb(src).padStart(6)}K -> ${kb(dst).padStart(5)}K  clips ${before} -> ${kept.length}`);
  return kept;
}

async function main() {
  extract();
  const gio = await io();
  const manifest = { characters: {}, weapons: [], props: [], items: [] };
  for (const [src, out, clips, tex] of CHARACTERS) {
    manifest.characters[out] = await optimize(gio, path.join(CACHE, A, src), path.join(OUT, 'models', out), { clips, tex });
  }
  for (const w of WEAPONS) {
    await optimize(gio, path.join(CACHE, A, 'weapons', w + '.glb'), path.join(OUT, 'models/weapons', w + '.glb'), { tex: 512 });
    manifest.weapons.push(w);
  }
  for (const p of HOSPITAL_PROPS) {
    const name = path.basename(p);
    await optimize(gio, path.join(CACHE, A, p + '.glb'), path.join(OUT, 'models/props', name + '.glb'), { tex: 512 });
    manifest.props.push(name);
  }
  for (const it of SURVIVAL_ITEMS) {
    const src = path.join(SURV, 'public/assets/models', it + '.glb');
    if (!fs.existsSync(src)) { console.warn('missing survival item', it); continue; }
    await optimize(gio, src, path.join(OUT, 'models/items', it + '.glb'), { tex: 256 });
    manifest.items.push(it);
  }
  for (const t of TEXTURES) {
    const dst = path.join(OUT, 'tex', path.basename(t).replace(/\.(jpg|png)$/, '.webp'));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    await sharp(path.join(CACHE, A, t)).resize(1024, 1024, { fit: 'inside' }).webp({ quality: 80 }).toFile(dst);
  }
  // only the sounds the game plays (tools/sfx-keep.json, generated from src/audio/sfx.js banks)
  const keepFile = path.join(ROOT, 'tools/sfx-keep.json');
  const keep = fs.existsSync(keepFile) ? new Set(JSON.parse(fs.readFileSync(keepFile, 'utf8')).files) : null;
  fs.rmSync(path.join(OUT, 'sfx'), { recursive: true, force: true });
  for (const d of SFX_DIRS) {
    const dir = path.join(CACHE, A, d);
    const dst = path.join(OUT, d);
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.mp3') && (!keep || keep.has(`${d}/${f}`))) fs.copyFileSync(path.join(dir, f), path.join(dst, f));
    }
  }
  fs.mkdirSync(path.join(OUT, 'music'), { recursive: true });
  for (const m of MUSIC) fs.copyFileSync(path.join(CACHE, A, m), path.join(OUT, 'music', path.basename(m)));
  manifest.sfx = Object.fromEntries(SFX_DIRS.map(d => [d, fs.readdirSync(path.join(OUT, d)).filter(f => f.endsWith('.mp3'))]));
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log('done; manifest at public/assets/manifest.json');
}
main().catch(e => { console.error(e); process.exit(1); });
