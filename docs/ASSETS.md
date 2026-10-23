# Reusable art (read-only sources)

Everything here lives in Marc's other repos. Those repos are **read-only** for this project: copy files into this repo, never change them. Clip counts were read from the GLB files on 2026-10-23.

## Heroes: `Marcsarno/yola-zombie`, branch `neighborhood-level`, `yolanda/zombie/assets/`

| File | What | Clips |
|---|---|---|
| `male1.glb` + `male1_ual.glb` | **Marc** (bearded man). Yola's clips were retargeted onto him, so the two move the same | 50 + 39 |
| `neighborhood/moves/marc-hood.glb` | Marc's neighborhood moves: interact, kneeling pick-up, crouch idle/walk, phone call | 5 |
| `yola2.glb` + `yola2_ual.glb` | **Yola**, the game's current model | 50 + 32 |

**Shared clips that fit battle moves:**
- **Attacks:**
  - Bat: `bat_swing`, `bat_swing_m`, `melee_horizontal`.
  - Sword: `ual_Sword_Regular_A/B/C`, `ual_Sword_Regular_Combo`, `ual_Sword_Heavy_Combo`, `ual_Sword_Heavy_D`, `ual_Sword_Dash`, `gs_low_slash`.
  - Melee: `hub_crowbar_combo`, `t_chop`, `t_box_01-03`, `t_kick_01/02`.
  - Guns: `t_shoot` and the pistol, rifle and shotgun clips.
- **Defence:** `ual_Sword_Block`, `ual1_Dodge_Left/Right`, `ual1_Roll`, `ual_Slide_*`, `ual_SafetyVault`.
- **Hit reactions:** `t_hit_body_01/02`, `t_hit_head`, `t_hit_side`, `t_hit_stomach`, `hit_body`, `pistol_hit`.
- **Down and back up:**
  - Knockdowns: `yola_knockdown`, `yola_getup`, `ual_KipUp`.
  - Defeats: `death_defeat`, `death_fall`, `t_defeat_02/03`, `t_fall`, `t_dive`.
- **Finishers:** `hub_execution_B_uppercut` (plus 2/4 and 3/4 m variants), `hub_execution_C_uppercut_mirrored`, `hub_execution_shotgun_slide_short/mid/long`.
- **Other:** `t_greet_01/04` (waves), `tripo_idle`, `ual1_Idle_Loop`, the `ual1_*` walk/jog/sprint loops.
- **Not there yet:**
  - A heal, inject or treat clip for Yola.
  - A buff or cast clip.
  - The baseball home-run swing: `assets/mixamo/yola_baseball_homerun.fbx` exists but isn't baked onto either model.

## Zombies: same branch, `yolanda/zombie/assets/`

| File | Clips |
|---|---|
| `zombie-patient.glb`, `zombie-scrubs.glb`, `zombie-nurse-mod.glb`, `zombie-patient-mod.glb` | 22 each |
| `zombie-sprinter.glb`, `zombie-romero(-mod).glb`, `zombie-zombiegirl(-mod).glb` | 21 each |
| `zombie-male-aab.glb` | 20 |
| `zombie-guard.glb` | 26, adding `shield_bash`, `shield_dash`, `shield_break`, `shield_idle`, `slam`, `slam_b` |
| `zombie_moves/*.glb` | Extra Quaternius zombie packs: bite, scratch, spawn, crawl, lay/rise; `guard_leap_slam`; `patient_bed_rise` |

The shared zombie clips:
- **Movement:** `walk`, `idle`, `crawl`, `sprint` (on the fast ones).
- **Attacks:** `attack`, `scratch`.
- **Hits:** `hit_flinch`, `hit_stumble`, `react_large_front/back/left/right`, `react_small_front`, `react_gut`, `knockback`.
- **Down and back up:** `knockdown`, `stumble_fall`, `standup_back`, `standup_stomach`.
- **Deaths:** `death_back`, `death_forward`, `death_chest_back`, `death_headshot_knees`, `death_hit_back/forward`.

Some files have 0–1 clips and are model-only variants: `zombie-a`, `zombie-nurse-burst`, `zombie-patient-burst`, and the `*-scratch` files.

## Weapons and props

- **Weapons (yola-zombie `yolanda/zombie/assets/weapons/`):**
  - Melee: wood bat, aluminum bat, crowbar, fire axe, sledgehammer, chainsaw.
  - Guns: pistol, pump shotgun, short pump; shells and magazines.
  - The bed shield is in `shield/`.
- **Hospital props:** `props/` and `hospital/` hold carts, an X-ray, a fridge, an extinguisher, scaffolding and more. The hospital kit is in `yolanda/assets/models/`, with upgrade tiers (starter/standard/advanced) for many items.
- **Neighborhood:**
  - yola-zombie `neighborhood/` has cars, barrels and barbed wire.
  - survival's `public/assets/models/kit/` has houses, a broken car, gates, fences, swings and slide, palms and oaks, a suitcase, a cooler, a fallen street lamp and a bunny.
- **Items (survival `public/assets/models/`):** medkit, water bottle, food can, radio, backpack, lantern, axe, pistol.

## Licences

- **Kevin Iglesias clips** (prefixed `kev_` / `kevs_` in yola-zombie's `tools/anim/export_lib.py`) can **never ship**.
- **Mixamo, Quaternius UAL 1/2 and KayKit** are fine to ship.
- **`t_` clips: open question.** yola-zombie's `PROGRESS.md`, `OPENING_MAPS_HANDOFF.md` and `UAL_PACKS.md` call them Tripo's own clips. But `assets/moves/catalog.json` labels `t_box` / `t_kick` / `t_chop` as Mixamo. Check the Tripo plan's commercial terms before shipping them.
- **Downloaded assets:** record each one here or in a `CREDITS.md`, with its licence.
