# Card-fight sim (verifier, card plan draft 1)

These are the throwaway scripts the verifier used on 2026-10-23 to check the first card plan, kept for reference and reuse.

What they model:
- **Deck and turn:** the 12-card starter deck (80/60 HP heroes), 3 energy, a 5-card hand, and block on each hero that expires each turn.
- **Zombies:** they target Marc by default; the sprinter targets Yola.
- **Player:** a greedy player that looks one turn ahead.

Damage tables:
- **Table `a`:** draft-3 numbers divided by 5. Walker 8, Bite 12, Bash 11, Dash 15, Leap 19/20.
- **Table `b`:** the critic's proposal. Walker 5, Bite 6, sprinter 7, Bash 8, Dash 10, Slam 12.

Scripts:
- `sim.py`: the main fights.
- `stall.py`: heal-stalling.
- `breaks.py`: how often stagger breaks things.
- `guard.py`: Shield Guard HP sweeps.
- `execute.py`: whether Execute matters.
- `glbclips.py`: reads clip lengths from a GLB.

Run with `python3 -I sim.py`. The results are in `docs/RESEARCH_NOTES.md` (pass 5) and `docs/RESEARCH_DETAIL.md`.

**These rules are not the current design** (see `docs/GAME_CORE.md`). Adapt the sim to the Slay the Spire rules before trusting any number.
