# Sarno Legends

A family roguelike deckbuilder built on Slay the Spire's proven rules, with a small spin: Marc and Yola share one deck and one HP bar, Marc staggers zombies and Yola cashes in, and every kill plays a real finisher or death animation. Floor by floor through the hospital; weapon upgrades carry between runs. Painted 2D battle rooms, 3D animated characters.

**Status:** design only. Nothing is built yet.

## Docs

- `docs/GAME_CORE.md`: **start here.** The decided plan: Slay the Spire's rules plus our spins (two heroes, one deck, one HP bar; Marc staggers, Yola cashes in; the kill picks the animation), with starting numbers, zombies, the meta, and the first steps.
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
