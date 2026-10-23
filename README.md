# Sarno Legends

A family roguelike deckbuilder built on Slay the Spire's proven rules, with a small spin: Marc and Yola share one deck and one HP bar, Marc staggers zombies and Yola cashes in, and every kill plays a real finisher or death animation. Floor by floor through the hospital; weapon upgrades carry between runs. Painted 2D battle rooms, 3D animated characters.

**Play it:** https://sarno-legends.vercel.app (phone sideways, or desktop). **Watch it being built:** https://sarno-legends.vercel.app/build-log/

**Status:** act 1 is playable start to finish: title → Shift Change → the hospital floor map → fights, elites, supply closets,
pharmacy, locked rooms, a supply crate → the Shield Guard → victory or defeat → scrap into the Armory (weapon unlocks).
Story, event text and voice lines are placeholders for Marc.

## Run and check

```
npm install
npm run dev          # http://localhost:5180/  (?seed=ABC  ?speed=2  ?debug=1  ?shot=<scene>)
npm test             # 150 rules tests (node --test)
npm run playtest     # the bot plays a whole run in headless Chromium; fails on any error or softlock
npm run sim          # balance sim: tools/sim/run.mjs --runs 300 --bot all (docs/BALANCE.md)
npm run build        # vite build -> dist/ (deployed by Vercel on every push to main)
npm run assets       # rebuild public/assets from ../yola-zombie and ../survival (read-only)
npm run bake         # re-bake painted rooms, card art and icons into public/assets/baked/ (after changing painter/studio)
python tools/voice/generate.py --marc am_michael --yola af_heart   # regenerate voice barks (tools/voice/README.md)
node tools/snap.mjs --plan tools/snap-plan.json --stage N --base http://localhost:PORT/   # build-log frames
```
Test pages for each module: `labs/*.html` (render, painter, ui, screens, audio, voice). `/labs/voice.html` is also on the live site for picking voices.

## Code

- `src/game/`: pure rules (no DOM): seeded RNG, combat engine and its event contract, run layer (map, rewards, rest, shop, events), meta (scrap, weapons), all content.
- `src/render/`: three.js stage, actors, weapons, effects, the director (pacing), the room painter and the studio (card art, icons).
- `src/ui/`: cards, hand, HUD, tooltips, coach bubbles, all screens. `src/audio/`: sound, music, voice barks. `src/app/`: the app shell that wires it together, saves, the coach, the debug API (`window.__SL`).
- `docs/BUILD_SPEC.md`: the build contract. `docs/BUILD_LOG.md`: what changed, stage by stage. `docs/STATE.md`: where things stand.

## Docs

- `docs/BUILD_LOG.md` and `docs/STATE.md`: the build, step by step, and where it stands now.
- `docs/GAME_CORE.md`: **start here** for the design. The decided plan: Slay the Spire's rules plus our spins (two heroes, one deck, one HP bar; Marc staggers, Yola cashes in; the kill picks the animation), with starting numbers, zombies, the meta, and the first steps.
- `docs/DECISIONS.md`: Marc's words and decisions, in order.
- `docs/RESEARCH_NOTES.md`: findings and sources from six research passes, plus the critic, verifier and audit verdicts.
- `docs/RESEARCH_DETAIL.md`: the detailed proposals: card pools, family sets, scrap and the bat tree, floor 1, pacing, phone layout, game feel, the drift checklist, sim results.
- `docs/ASSETS.md`: the art we can reuse (heroes, zombies, chapter-2 survivors and looters, weapons, props) and licence notes.
- `docs/DECKBUILDER_PLAN.md`: the earlier, bigger card plan. Mostly parked; `GAME_CORE.md` wins where they differ.
- `docs/COMBAT_DESIGN.md`: the earlier turn-based design (superseded).
- `docs/ROADMAP.md`: milestones, art direction and story structure from the turn-based phase (still useful for look and story).
- `docs/reviews/`: the critic and audit inputs as they were.
- `tools/balance-sim/`, `tools/card-sim/`, `tools/turn-sim-verifier/`: the throwaway sims behind the numbers.

## Rules

- Art comes from `Marcsarno/yola-zombie` and `Marcsarno/survival`. Those repos are **read-only** for this project: copy files out, never write to them.
- Marc decides the story. Don't invent story beats.
