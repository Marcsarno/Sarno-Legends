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

## Stage 2: one game (2026-10-23)
- **Integration** (`src/app/`): boot screen, one shared renderer, router for every screen, combat wiring
  (engine → director → HUD → audio), painted rooms per room type, live 3D heroes on the title, save after every room and
  Continue (a reload mid-fight restarts that fight), the debug API (`window.__SL`) and `?shot=<scene>` for the build-log
  camera. Cross-module fixes: map row jitter, 11 invisible props, camera height (HP bars clear the hand), doubled
  "+N if Staggered" text, Wood Bat preview, long card text auto-fits, harsher elite rooms, a stray "null".
- **QA** (`tools/playtest.mjs`): the autoplay bot plays whole runs in the real browser. Fixed: knockback springs exploding
  at high speed (bodies thrown kilometres away, the one NaN error), NaN number positions, Medkit usable on the map,
  New Run over a save now asks, abandon during a killing blow, the bot now shops/rests/chooses like the sim. Result:
  5 full runs, all reached the Shield Guard with 60–67 HP, 4 wins, 0 errors. Every manual check passed (mouse and touch).
- **Voices**: 126 placeholder barks generated with Kokoro-82M (Marc am_michael, Yola af_heart, the Shield Guard
  processed to sound zombified), a bark director with cooldowns, a Voices toggle; audition page /labs/voice.html.
- **Deploy**: https://sarno-legends.vercel.app, auto-deploying from main.
- **Before → after:** #5–#11 (separate test pages) → #12–#21 work in progress → the full scene set captured from the
  frozen build (title, armory, Shift Change, map, fights, targeting, zombie turn, finisher, elite, boss, rewards, card
  pick, rest, upgrade, shop, event, treasure, deck, victory, defeat, settings).

## Stage 3: polish after Marc played it (2026-10-23)
Three agents in parallel, then a full playtest on the built game.
- **Marc's notes** ("Marc needs to actually face the zombies", "the finishers need more time to slow motion",
  "the attacks all happen so quick … give them a moment"):
  - Marc's batting stance turned to face the zombies (it was aimed at Yola); a look-at turns both heroes' heads to their
    target and each zombie to the hero it attacks.
  - Every attack has a wind-up, a fast strike, a short freeze on the hit and a follow-through: light ~1.15 s, heavy
    ~1.55 s, pistol ~1–1.25 s, zombie attacks ~0.9–1.1 s (one `PACING` table in `src/render/director.js`; 2× halves it).
  - Finisher slow motion eases in during the swing, holds at 0.25× through the hit, the burst and the start of the fall,
    then eases out: about 3 s on the first finisher of a run, 2.5 s after.
  - Defeat: both heroes collapse (the one hit last first), drop their weapons and stay down. The Shield Guard's
    "SECURITY" label reads the right way round.
- **Phone speed:** the 10 painted rooms (+ elite looks), 68 card arts, 42 icons and 13 portraits are baked into 148
  WebP files (2.8 MB) by `npm run bake`; live painting only as a fallback. A room appears in 1–150 ms instead of
  10–55 s of live painting (software GPU); time to title on the test machine 75–90 s → 21–27 s.
- **First-time players:** a one-time coach (drag a card, the zombie's intent, Block, End Turn, Staggered, then the map,
  HP carrying over, elites, rewards, rest, shop), skippable, with a Tips toggle and a How to Play panel. Phones: bigger
  card text (~11–12 px), 44 px tap targets, notch/home-bar safe areas, tap-for-tooltip on touch, an incoming-damage
  chip by the party HP ("Lethal" when the hit would end the run).

## Stage 4: balance and everything that didn't need a human (2026-10-23)
After the research pass (RESEARCH_NOTES pass 7). Three agents in parallel on branch `polish2`, then checks and a playtest.
- **Card pass** ("every card should have a place"): never-picked cards 13 → 0. Check the Mag back to draw 2 / discard 1
  through a new mid-fight choice step; Double Tap, Kneecap, Quick Shot, Flare, Deep Breath, Triage, Light on Feet buffed;
  new Tough It Out, Wait for It, Barbed Wire, Battering Ram give Marc's block ("Bulwark") build a payoff: it now wins as
  often as the stagger build. The sim bot learned synergies (`tools/sim/cardvalue.mjs`).
- **Infection 0–5** (our Ascension; 0 = the family level), **Daily Run** with a score, **Run history**, **Collection**.
- **Save safety** for iPhone: installable web app (manifest, icons, full-screen landscape), `navigator.storage.persist()`,
  a save code backup/restore, an Add to Home Screen hint in Safari.
- **Kids and phones**: "End turn with energy left?" (first 3 runs), coach bubble kept clear of the HP bar, 12 px shop
  names, 44 px tap areas for statuses/relics/potions.
- **Visuals**: the bat follows the blow in the finisher, auto-quality for weak phones (pixel ratio, then shadows), enemy
  looks (olive wide Bloater, navy Orderly, grey hunched Biter, thin bile-yellow Spitter), hit squash, a Staggered slump
  with a violet pulse. Boot: no fallback textures, sounds wait for the first fight's models.
- **Before → after:** #43–#47 → #48–#55.
