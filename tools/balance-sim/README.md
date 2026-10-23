# Balance sim

A throwaway check of the combat numbers in `docs/COMBAT_DESIGN.md`. It is not game code. It plays each fight thousands of times with a scripted "sensible player" and prints rounds, HP lost, heals, breaks, ultimates and Second Wind saves.

```
python3 run.py
```

- `sim.py`: the rules, the hero and zombie stats, and the fight sets in `SETS`.
- `run.py`: the fights reported in the design doc.
- A "round" is one of Marc's turns.
- `taps`:
  - `none`: no timed taps.
  - `avg`: 30% miss, 50% good, 20% perfect.
  - `story`: always good.

Its player is smarter than a button-masher, so treat the numbers as a floor for how hard a fight is. Real playtests win over the sim.
