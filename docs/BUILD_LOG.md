# Build log: what changed, step by step

The catalog of the build, newest at the bottom. Every step has its screenshots in `public/build-log/frames/`;
play them in order like a flip-book at **/build-log/** on the deployed site (or `npm run dev` → http://localhost:5180/build-log/).
Frame numbers (#n) link to `public/build-log/index.html#n`.

## Stage 0: scaffold and assets (2026-10-23)
- Vite + three 0.186 project, `npm run assets` pipeline: pulls heroes, zombies, weapons, hospital props, CC0 sfx and Marc's music
  out of yola-zombie with a read-only `git archive`, keeps only the clips the game uses (no `kev_`, `t_`, `tripo_` clips),
  WebP textures, gltfpack (quantized geometry, 30 Hz quantized clips, meshopt). Models 43 MB → 15 MB.
- `tools/snap.mjs` build-log camera and the flip-book player.
- `docs/BUILD_SPEC.md`: the build contract (modules, combat event contract, every card/zombie/relic/potion/event/weapon number).
- Shared UI foundation: design tokens, fonts (Bebas Neue, Oswald, Barlow Semi Condensed), DOM and motion helpers, icon API; shared battle camera.
- **Before → after:** nothing → #1 asset check (Marc, Yola and a walker on a flat background).

## Stage 1: the modules, built in parallel (2026-10-23)
Nine agents built the game's modules side by side against `BUILD_SPEC.md`, each in its own lab page (`labs/*.html`).
- **Engine** (`src/game/`): seeded RNG with named streams, the combat engine and its event contract, every card (starter,
  27 Marc, 25 Yola, weapon swaps, status cards), 11 zombie types with their Slay the Spire act-1 AI patterns, 24 relics,
  9 weapons, 10 potions; card text with live numbers.
- **Run layer**: StS map generation, rewards with rarity pity, rest, shop, 10 locked-room events, treasure, Shift Change,
  save/load; meta profile (scrap, weapon unlocks).
- **Rules check** (`docs/STS_NUMBERS_CHECK.md`): our remembered Slay the Spire numbers checked against the wiki; corrections applied.
- **Adversarial review**: 7 bugs found and fixed with regression tests (shop could never sell 21 cards, double-shot
  volleys, revive intent rolled twice, lost Trophy Belt energy, events after combat end, a free re-roll, two stats). 149 tests.
- **Balance sim** (`tools/sim/`, `docs/BALANCE.md`): single fights on target (normal 5.6%, elite 24.6% HP); the Shield
  Guard is the wall (58%); whole runs easier than target because StS's healing (Nurse's Kit + rest row) covers normal
  fights. Two weapon tunes (Nail Swing 5→6, Sledge 14→18). Options for Marc in BALANCE.md.
- **Render core**: stage, battle camera, actors with impact timings measured by tracing the weapon tip, weapon grips ported
  from yola-zombie, blood/muzzle/tracer/shield fx, the director that paces the event contract.
- **Painter + studio**: 10 painted rooms built from the hospital kit and an oil-paint filter; card art for all 70 cards
  posed from the real clips; 3D-rendered relic, potion and weapon icons; portraits.
- **UI kit**: cards, hand with drag/tap/keyboard play and a targeting arrow, HUD, intents, tooltips, pile viewer, top bar,
  ~100 icons. **Screens**: 13 screens (title, Shift Change, blueprint map, rewards, rest, shop, event, treasure, result,
  armory, settings, deck, picker). **Audio**: buses, 166 curated CC0 sounds (1.5 MB), 37 synthesised UI sounds, music.
- **Before → after:** #1 (three figures on grey) → #2–#11: painted rooms, the 3D fight with the bat in Marc's hands and
  the Shield Guard's riot shield, the card HUD on the real engine, title, map, pharmacy and armory screens.
