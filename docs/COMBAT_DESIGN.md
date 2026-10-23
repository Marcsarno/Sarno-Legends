# Combat design (draft 3)

> **Superseded on 2026-10-23 by the card-game direction in `DECKBUILDER_PLAN.md`.** The intents, stagger/break, roles and zombie roster carry over; the menu combat and its numbers don't.

Last updated 2026-10-23. Approved direction by Marc ("I like where it's headed"); numbers, names and stats are still drafts. Draft 2 was reviewed by a critic and a verifier and simulated (see `RESEARCH_NOTES.md`); draft 3 is the fixed version, simulated with `tools/balance-sim/`.

## Decided

- Turn-based, no clock. The two leads are Marc (tank) and Yola (healer).
- Chapter 1 is cut down: 3 moves per hero, an ultimate each and one duo move. Everything else unlocks in later chapters.
- **HP carries over between fights**, with a full heal at checkpoints (Marc, 2026-10-23).

## The short version

- **Turns:** a bar at the top shows who goes next. Every zombie shows what it will do next and who it will hit.
- **Grit:** a shared pool, max 4. Basic attacks and defends earn it; big moves spend it.
- **Stun (stagger):** hits fill a zombie's bar. When it breaks, the zombie loses a turn and takes extra damage.
- **Ultimates:** charge up over time and play the finisher animations.
- **Marc (tank):** Bat Swing, Home Run, Cover, Sarno Slam.
- **Yola (healer):** Pistol Shot, Patch Up, Sidestep, Code Blue.
- **Together:** Batter Up.
- **Not stressful:** no timers, no misses, one Second Wind per fight, instant retry, a full heal at checkpoints.

## Rules (chapter 1)

- **Turn order:** action value = 10000 / SPD; the lowest value acts next. The order is always on screen, with a preview of how the chosen move changes it.
- **Intents:** each zombie shows its next move, its target and the damage. It picks the target when the intent appears, so the player can react to it.
- **Grit:** starts at 2, max 4.
  - Basic attacks and defends give +1.
  - Skills cost 2.
  - The duo move costs all 4.
- **Stagger and break:**
  - Every hit removes stagger from the zombie's bar. At 0 the zombie is **broken**: it loses its next turn and takes +50% damage until it acts again, then the bar refills.
  - Damage bonuses add, they don't multiply.
  - No damage types in chapter 1.
- **Damage:** `ATK × Power% × K / (K + DEF)`, where `K = 100 + 10 × attacker level`.
  - Damage varies ±5%. A crit does ×1.5 (Marc 10%, Yola 5%).
  - Heroes never miss.
- **Ultimate meter:** 0–100.
  - It fills +0.3 per point of damage dealt, +10 per hit taken and +20 per heal.
  - It carries over between fights.
- **Second Wind:** once per fight per hero, a hit that would knock them out leaves them at 1 HP instead.
- **Between fights:** HP carries over. A full heal at checkpoints, about every 3 fights (Story mode heals after every fight).
- **Timed taps:** optional, and only when being hit in chapter 1.
  - Good: −30% damage.
  - Perfect: −60% damage.
  - Story mode gives "good" automatically.
  - Taps on attacks come later.
- **Retry:** instant, from the start of the fight. After 2 losses the game offers "ease up" (−15% zombie HP).
- **Difficulty:** two multipliers on the zombies and nothing else.

| | Zombie ATK | Zombie HP |
|---|---|---|
| Story | ×0.7 | ×0.8 |
| Normal | ×1 | ×1 |
| Hard | ×1.25 | ×1.2 |

## Heroes (level 1; stats ×3.03 at level 30, linear +7% a level, SPD in flat steps)

| | HP | ATK | DEF | SPD | Crit |
|---|---|---|---|---|---|
| Marc | 400 | 50 | 30 | 100 | 10% |
| Yola | 300 | 40 | 20 | 108 | 5% |

### Marc: tank and breaker

| Move | Clip (placeholder) | Power | Stagger | Grit | What it does |
|---|---|---|---|---|---|
| Bat Swing | `bat_swing` | 100 | 2 | +1 | Basic attack |
| Home Run | `melee_horizontal` (the real home-run clip still needs adding to Marc) | 180 | 4 | −2 | Knocks the target 30% back in turn order (15% on bosses) |
| Cover | `ual_Sword_Block` | – | – | +1 | Hits aimed at Yola go to Marc at −40%; 2-turn cooldown |
| Sarno Slam (ultimate) | `ual_Sword_Heavy_Combo` → `hub_execution_B_uppercut` | 250 | 6 | meter | Plays the execution finisher if it kills |

### Yola: healer, with a damage role

| Move | Clip (placeholder) | Power | Stagger | Grit | What it does |
|---|---|---|---|---|---|
| Pistol Shot | pistol clips | 110 | 1 | +1 | Basic attack |
| Patch Up | **no clip yet** | Heals 25% of the target's max HP | – | −2 | Heal |
| Sidestep | `ual1_Dodge_Left/Right`, `ual1_Roll` | – | – | +1 | Dodges the next hit; 2-turn cooldown |
| Code Blue (ultimate) | `ual_Slide` → `ual_KipUp` | Heals both 50% | – | meter | Revives Marc, +2 Grit |

### Duo move

**Batter Up:** Yola's kick launches the zombie, then Marc swings. It costs all 4 Grit and does 250 power with 8 stagger (4 against bosses). Yola's next turn is pushed back 50%. Build it as a camera cut between two solo clips, not a synced animation.

## Chapter 1 zombies (level 1)

| Zombie | HP | ATK | DEF | SPD | Stagger bar | Moves |
|---|---|---|---|---|---|---|
| Walker | 110 | 50 | 20 | 95 | 5 | Scratch (100); Bite every 3rd turn (150), shown a turn ahead |
| Nurse | 90 | 35 | 15 | 100 | 4 | Scratch. Kneels a turn ahead, then revives a dead walker at half HP. Chapter 1's only "undo" move |
| Sprinter | 80 | 45 | 10 | 125 | 3 | Lunge at whichever hero has the lowest HP. Cover doesn't stop it |
| Elite (big walker) | 300 | 60 | 35 | 100 | 10 | Walker moves, hits harder |
| **Shield Guard** (boss) | 800 | 60 | 40 | 95 | 14 → 18 | See below |

**Shield Guard:**
1. **Shield up:** he takes 30% less damage.
   - Bash hits Marc (120). Dash hits Yola (150).
   - Every 3rd turn he does a Leap Slam on both (200).
2. **First break:** the arm-off finisher plays and the shield is gone.
   - His stagger bar grows to 18.
   - From now on Leap Slam comes every 2nd turn, alternating with Dash.
3. **0 HP:** the head-off finisher plays. Health, not stagger, ends the fight.

He takes half the turn-order push. Leap Slam can be softened but never cancelled.

## What the simulation says

A sensible player, 600–1,500 runs per row. A round is one of Marc's turns.

| Fight | Rounds | Party HP lost | Yola heals | Notes |
|---|---|---|---|---|
| 3 walkers | 3.9 | 25% (18% with average taps) | 0 | |
| 2 walkers + nurse | 3.9 | 25% | 0 | |
| Sprinter + 2 walkers | 4.0 | 29% | 0 | Batter Up used |
| Elite + 2 walkers | 5.6 | 36% | 0.1 | Marc's ultimate usually fires |
| 3 fights in a row (HP carries) | – | The weaker hero ends at ~60% | ~1.5 | No knockouts |
| Boss, Normal, no taps | 11.7 | – | 3 | Second Wind saves someone in 85% of fights; always won |
| Boss, Normal, average taps | 10.7 | – | 1 | Ultimates: Marc ×2, Yola ×1 |
| Boss, Hard, tested at 900 HP | – | – | – | Lost without taps; won 87% with average taps |

What this means:
- On Normal, careless play gives a tense win and good play a comfortable one. Hard needs the taps.
- Caveats: a button-masher loses more HP, and human playtests come next.

## Later chapters

- Damage types and weaknesses (Blunt, Blade, Gun).
- New moves:
  - Marc's Cleave (hits all zombies and slows them).
  - Yola's Adrenaline (Marc acts next, with extra stagger) and Stopper Shot (cancels a normal zombie's charged move, never a boss's).
  - A mark that doubles the stagger of Marc's next hit.
- Two more duo moves:
  - **Lights Out:** finishes a broken zombie.
  - **Cover Fire:** Marc guards while Yola fires back at every attacker.
- Taps on attacks.
- New zombies:
  - The **Orderly**: Restrain takes away 1 turn.
  - The **Acid Lady**: acid that stacks; a headshot kill means no splash.
- Dropped: the crawler.

## Progression (outline)

- **Levels:** up to 30.
  - All XP is shared, including with benched heroes.
  - About 3–4 levels per chapter.
  - Zombie levels are fixed per chapter, so the heroes visibly outgrow earlier areas.
- **Weapons:**
  - Three looks each, all cheap to make in Blender (bat → nail bat → wire-and-tape bat).
  - Each weapon teaches one move that the hero keeps.
  - Two mod slots under a point budget. Mods change a rule rather than a number (nails cause bleeding, tape adds stagger).
  - Materials are found at set spots, never random drops.
- **Family:**
  - The kids at home give 2 chosen buffs.
  - One call-in per fight, each with its own signature effect, using a painted portrait cut-in.
  - No extra characters to level.
- **Not used:** random paid pulls (gacha), energy timers, random gear stats.

## Game feel (targets)

- **Basic attack:** 1.5–2.5 s.
- **Skill:** 3–4 s.
- **Break:** about 1.2 s, with a shatter effect and a "BREAK" banner.
- **Finisher or ultimate:** 5–7 s the first time, about 2.5 s on repeat views; skippable.
- **Every hit stacks the same effects:** a short freeze (0.05–0.12 s), a flash, a shake, a sound, a damage number and a phone buzz, all scaled to the size of the move.
- **Options:** 2× speed, auto-battle for repeat fights, and "reduce flashes and shake".

## Open

- Yola's heal clip. Options: put the kneeling or interact clip from Marc's neighborhood pack onto her, or find one Mixamo clip.
- A buff clip.
- Bake the home-run clip onto Marc.
- Check the `t_` clips' licence (see `ASSETS.md`).
- The enemy targeting rule for Walkers (random for now).
- What happens when one hero is down.
- Items: a first-aid kit and an adrenaline syringe that revives.
- Rewards and star ratings.
- The auto-battle AI.
