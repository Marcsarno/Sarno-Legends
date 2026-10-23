# Balance: what the sim says about act 1

Measured 2026-10-23 with the headless sim (`tools/sim/`), 300 full runs per bot, seed `BAL`, starter weapons
(Wood Bat + Pistol) unless a table says otherwise. Targets are GAME_CORE's. The headline and per-encounter tables were
re-run after the logic review's fixes (see "Logic review" at the end); the lever and weapon tables are from before it
and moved by less than the run-to-run noise.

**Short version**
- Single fights cost what the targets ask: a normal fight costs the sensible bot 5.6% of Max HP and an elite 24.6%.
  Both are inside the 5-15% and 20-30% bands.
- The boss is the wall. It costs 58% of Max HP (target 30-45%), and almost every death is there.
- Whole runs are easier than the targets. The sensible bot wins 93% and reaches the boss with 85% HP; the targets are
  40-60% for both. The cause is Slay the Spire's own healing, not any one fight (see "Why runs are easy").
  No A0 number was changed for it. The levers are measured below for Marc to choose from.
- One tune applied: the Nail Bat and the Sledgehammer simmed **weaker** than the free Wood Bat, against the
  "sidegrades, tier 3 a little stronger" rule. Nail Swing went from 5 to 6 damage and Sledge from 14 to 18 (details below).

## How to run it

```
node tools/sim/run.mjs --runs 300 --bot all              # full runs, every bot, prints the markdown report
node tools/sim/run.mjs --runs 100 --bot sensible --weapons nail_bat,shotgun --json /tmp/out.json
node tools/sim/bench.mjs --fights 50 --bot greedy,sensible,expert   # each encounter with the starter deck at 80 HP
```

Same seed, same bot, same run (`playRun(BOTS.sensible, { seed: 'BAL-17' })` replays run 17).
A sensible-bot run takes about 5 ms and an expert run about 70 ms.

**HP lost per fight** = damage taken in that fight ÷ Max HP. It is measured before the Nurse's Kit heals 6 at the end.

## The bots

| bot | how it fights | how it runs |
|---|---|---|
| random | random playable cards at random targets | random path, choices, picks |
| greedy | the engine test's bot: scores each card by its preview numbers, no lookahead | always takes the best-rated card (never skips), rests under 50% HP, takes the first event choice that isn't Leave |
| **sensible** | BUILD_SPEC's player, rule by rule: kill what it can; block a big hit (block some, hit some, never feed the Big Walker's Rage); powers early; Staggered on the focus zombie, then the cash-ins; best damage per energy | route planner (elites when healthy, rests when hurt, shops with supplies); card tier list with Staggered synergy and a deck-size bar; removes starter cards; rests under 50% (70% before the boss), otherwise upgrades; potions in elite and boss fights or when in danger |
| expert | searches card orders on copies of the fight and scores the end state (HP, the coming hit, a rough cost of the rest of the fight). It never peeks at draws: it plans up to a draw, then plans again | same as sensible |

The sensible bot stands in for "a person who reads the intents and plays carefully". It makes none of a new player's
mistakes: no misreads, no forgotten Staggered, no bad picks. Read it as the upper end of "new", not the middle.

## Results against the targets (300 runs per bot)

| | random | greedy | **sensible** | expert | target |
|---|---|---|---|---|---|
| win rate % | 0 | 72.3 | **92.7** | 99.3 | sensible 40-60 |
| reach the boss % | 3.7 | 97.3 | 99.0 | 99.7 | |
| HP entering the boss % (mean / p10 / p90) | 43.9 / 17.5 / 90 | 70.1 / 52.9 / 89.7 | **84.8 / 71.3 / 97.6** | 85.4 / 72.5 / 98.8 | 40-60 |
| normal fight: HP lost % (mean / p90) | 24.9 / 57.5 | 8.2 / 20 | **5.6 / 12.9** | 4.1 / 13.8 | 5-15 |
| elite fight: HP lost % (mean / p90) | 65.0 / 100 | 31.9 / 53.8 | **24.6 / 46.3** | 21.2 / 41.3 | 20-30 |
| boss fight: HP lost % (mean / p90) | 53.2 / 100 | 65.0 / 86.3 | **57.9 / 83.8** | 36.9 / 60 | 30-45 |
| turns: normal / elite / boss | 4.6 / 6.5 / 5.4 | 3.0 / 5.6 / 8.6 | 2.9 / 5.9 / 11.1 | 2.6 / 5.3 / 8.5 | |
| card picks skipped % | 23.5 | 0 | 5.7 | 5.8 | |
| final deck / relics / supplies | 14.3 / 1.7 / 156 | 20.5 / 5.1 / 181 | 17.6 / 4.9 / 140 | 17.7 / 5.0 / 137 | |

Where runs end:
- greedy: 75 of 83 deaths are at the boss (the rest are on floors 6 to 11: Orderlies, Big Walker, Sleeping Patient and two hallway fights).
- sensible: 19 of 22 deaths are at the boss (one each to the Sleeping Patient, Orderlies and a Nurse fight).
- expert: 1 of 2 deaths is at the boss.
- random: deaths spread from floor 1 to 16, mostly the first elites (Big Walker 57, Sleeping Patient 51, Orderlies 46).

That is Slay the Spire's shape: the act-1 boss is the exam.

### Per encounter, sensible bot, full runs (HP lost % of Max HP)

| encounter | kind | fights | mean | p90 | turns |
|---|---|---|---|---|---|
| shambler_nurse | hard | 96 | 14.8 | 24.1 | 5.3 |
| horde | hard | 90 | 12.7 | 25 | 4.2 |
| shambler_solo | easy | 236 | 7.4 | 12.5 | 2.8 |
| sprinters | hard | 62 | 5.7 | 15 | 2.5 |
| bloaters / three_biters / nurse_pack | hard | ~88 each | 5.0-5.6 | 13.8 | 2.7-3.8 |
| biter_pair / two_biters / screamer_solo | easy | ~220 each | 3.0-4.0 | 7.5-8.8 | 2.1-2.7 |
| screamer_biter | hard | 102 | 3.2 | 8.7 | 3.5 |
| gurney_biters (event) | event | 93 | 2.4 | 7.5 | 1.9 |
| sleeping_patient | elite | 179 | 30.3 | 51.8 | 6.4 |
| orderlies | elite | 180 | 26.8 | 46.3 | 8.1 |
| cart_walker (event) | elite | 44 | 20.9 | 35 | 3.7 |
| big_walker | elite | 160 | 16.9 | 33.8 | 3.6 |
| shield_guard | boss | 297 | 57.9 | 83.8 | 11.1 |

### Each encounter with the starter deck at 80 HP (bench, 50 seeds; HP lost mean / p90)

This answers "how hard is the fight itself", without the deck growth the full runs add.

| encounter | greedy | sensible | expert |
|---|---|---|---|
| shambler_solo | 7.9 / 11 | 7.3 / 10 | 5.7 / 11 |
| screamer_solo | 4.7 / 6 | 4.1 / 6 | 4.1 / 6 |
| biter_pair | 4.4 / 9 | 4.5 / 8 | 1.8 / 7 |
| two_biters | 3.6 / 7 | 4.1 / 7 | 1.4 / 5 |
| shambler_nurse | 30.8 / 44 | 28.0 / 35 | 29.5 / 37 |
| sprinters | 15.4 / 22 | 15.1 / 22 | 11.6 / 16 |
| three_biters | 10.9 / 16 | 8.5 / 16 | 6.3 / 12 |
| bloaters | 12.6 / 18 | 9.0 / 13 | 7.0 / 13 |
| screamer_biter | 11.6 / 22 | 10.1 / 12 | 10.8 / 16 |
| horde | 33.0 / 45 | 28.0 / 42 | 25.2 / 36 |
| nurse_pack | 15.2 / 28 | 9.0 / 13 | 8.3 / 14 |
| big_walker | 35.0 / 52 | 28.3 / 34 | 27.2 / 34 |
| sleeping_patient | 53.9 / 67 | 59.0 / 72 (2% lost) | 52.1 / 62 |
| orderlies | 52.0 / 61 | 52.5 / 61 | 48.0 / 57 |
| shield_guard | always lost | always lost | always lost |

Read with the full runs:
- The easy pool is easy (1-8 HP), as Slay the Spire's first three fights are.
- **Shambler + Nurse** and **Horde** are the two rough hallway fights. They cost about 28-33 HP with the starter
  deck, which is where the engine's first read flagged them. In real runs they cost 13-15%, because by then the deck
  has grown. That is the top of the band, not over it, so no change.
- **Sleeping Patient** is the hardest elite, as Lagavulin is for a starter deck. **Big Walker** is the easiest for a
  player who stops playing Skills once it roars. The greedy bot doesn't stop, so it loses about 7 more HP to it.
- **Orderlies** is long (8-12 turns): three 40-HP zombies, Immune, and Panic cards, with no AoE in the starter deck.
- The starter deck never beats the Shield Guard, as a starter deck never beats The Guardian.

## Why runs are easy (and why no A0 number was changed)

The per-fight costs are on target. The run-level targets can't be met with Slay the Spire's own healing:

- **Nurse's Kit heals 6 after every fight** (Burning Blood). A normal fight costs the sensible bot about 4.5 HP, so
  hallway fights are net positive.
- **Row 15 is all rest sites.** Anyone below 70% rests for 24 HP right before the boss, so reaching the boss with
  40-60% would need a player who reaches row 15 at 10-30%.
- Our starter is a little stronger than the Ironclad's: 11 cards, Clean Shot is Innate, and the Wood Bat doubles the
  first Bat Swing. That is our spin, Marc's design.

Slay the Spire's act 1 is also beaten by most careful players at Ascension 0. Its act-1 deaths come at the boss and
the first elites, which is what the sim shows here.

Levers measured (200 runs each; greedy / sensible win %; base is 73.5 / 93.0). **None applied**:

| change | greedy win % | sensible win % | note |
|---|---|---|---|
| more elites (StS Ascension 1: elite share 8% → 12.8%) | 74.0 | 92.5 | no effect: the extra relics pay for the extra damage |
| starter weapons without passives (no double first Bat Swing, Clean Shot not Innate) | 65.0 | 91.0 | our spin is worth about 2-8 points |
| Nurse's Kit heals 4 instead of 6 | 69.0 | 89.0 | changes a proven StS number |
| boss hits harder (Shield Bash 36, Shield Charge 10; StS A4-style) | 72.5 | 90.5 | the boss is already the wall |

Recommendation:
1. Keep A0 as is for the first family playtests, since humans make mistakes the bots don't.
2. If testers find it easy, the proven answer is Slay the Spire's ladder ("Infection levels" in GAME_CORE).
   It stacks several small changes, and the sim can check each step:
   `node tools/sim/run.mjs` after the change.

## Weapons (the artifact system): one tune applied

GAME_CORE wants weapons to be sidegrades, with tier 3 a little stronger. The sim had two weapons weaker than the free
Wood Bat:
- The first 80-scrap unlock (Nail Bat). Nail Swing's 5 damage + 2 Bleed doesn't make up for losing the Wood Bat's double swing.
- The 350-scrap Sledgehammer. Its turn-1 energy loss outweighs Sledge.

300 runs per row. The bench columns are the starter deck vs Big Walker / Horde (sensible, HP lost).

| loadout | change | greedy win % | sensible win % | sensible boss HP lost % | bench Big Walker / Horde |
|---|---|---|---|---|---|
| Wood Bat + Pistol (free) | none | 75.0 | 93.3 | 57.5 | 29.9 / 28.6 |
| Nail Bat, **before** | Nail Swing 5 dmg + 2 Bleed (7 + 3) | 69.0 | 90.7 | 59.7 | 29.1 / 38.9 |
| Nail Bat, **after** | **Nail Swing 6 dmg + 2 Bleed (8 + 3)** | 72.7 | 92.0 | 57.2 | 26.1 / 35.2 |
| Sledgehammer, **before** | Sledge 14 + 3 Staggered (18 + 4), −1 energy turn 1 | 67.0 | 92.7 | 58.7 | 27.6 / 31.9 |
| Sledgehammer, **after** | **Sledge 18 + 3 Staggered (22 + 4)**, drawback kept | 77.0 | 95.7 | 54.1 | 27.1 / 31.6 |
| Wire-and-Tape Bat | none | 80.3 | 95.3 | 52.8 | 23.3 / 32.7 |
| Crowbar | none | 83.0 | 95.7 | 52.8 | 23.4 / 36.3 |
| Fire Axe | none | 85.0 | 96.7 | 48.9 | 22.0 / 28.6 |
| Pump Shotgun | none | 75.3 | 91.0 | 58.9 | 31.4 / 28.6 |
| Sawed-Off | none | 84.7 | 97.7 | 48.9 | 21.7 / 20.1 |

Why these two fixes:
- **Nail Swing now matches Bat Swing's 6**, so the Bleed is the gain for giving up the double first swing. It is
  level with the Wood Bat: a sidegrade, better on single big zombies and worse on groups.
- It now has the same numbers as Barbed Swing. The Wire Bat stays the tier-3 step up through its passive (+2 to Bleeding zombies).
- **Sledge 18** keeps the Sledgehammer's identity ("slow to get going", −1 energy on turn 1) and makes tier 3 a
  little stronger than the free bat.
- The other sims, considered and not chosen:
  - Removing the drawback: 80 / 96, stronger but it loses the identity.
  - Sledge 16: 72 / 94, still under the free bat for the greedy bot.

Others:
- Crowbar (tier 2) is already above the free bat.
- Fire Axe and Sawed-Off are the strongest, which is fine for tier 3 at 250 and 300 scrap.
- Pump Shotgun is a true sidegrade: better on groups, worse on single zombies.

Both changes are buffs, so no refunds are due ("if a change ever weakens a weapon, refund its scrap").
The Nail Swing and Sledge numbers in BUILD_SPEC section 4 need updating to match `src/game/content/cards.js`.

## Card pick rates

The pick rates follow the bot's own tier list, so they can't tell us which cards are dead. That needs people
(GAME_CORE: under ~10% is dead). Every reward card was offered; the sensible bot's numbers are in the report
(`--bot sensible`).

Cards the tier list never takes are still worth a look in playtests:
- heavy_swing, deep_breath, tackle, dig_in, swing_guard, rally, fortify: Strength or Block engines that need support.
- check_mag, quick_shot, triage: weak filler.

## Slay the Spire numbers the run layer uses

These come from docs/STS_NUMBERS_CHECK.md; `src/game/run.js` exports them as tables.
- **Map:**
  - 6 paths on 7 × 15 with no crossing corridors.
  - Row 1 is all fights, row 9 all treasure, row 15 all rest.
  - No elite or rest before row 6, and no rest on row 14.
  - No elite, rest, shop or treasure straight after the same type.
  - Siblings differ.
  - Room shares count the whole map (shop 5, rest 12, event 22, elite 8, the rest fights) and are handed out with rule re-rolls.
  - Measured over 500 maps: fight 41%, event 22%, rest 17.6% (including row 15), treasure 6.5%, elite 8%, shop 5%.
- **"?" rooms:** fight 10% (+10 each miss), shop 3% (+3), treasure 2% (+2), reset when rolled, otherwise an event.
  No shop straight after a shop [M]. Events don't repeat until all ten have been seen.
- **Rewards:**
  - Supplies: fight 10-20, elite 25-35.
  - Potion drop: 40%, −10 after a drop and +10 after none.
  - Cards: 3, any hero.
  - Rarity: normal 3/37 and elite 10/40, plus the pity offset (starts −5, +1 per common, reset on a rare, capped at +40,
    any shortfall taken from uncommon). So the first normal reward can't be rare.
  - Elite relic: 50/33/17.
- **Treasure:** small, medium or large chest (50/33/17).
  - Relic odds by size: 75/25/0, 35/50/15, 0/75/25.
  - Gold only sometimes: 50% for 23-27, 35% for 45-55, 50% for 68-82.
- **Shop:**
  - 5 cards: a Marc Attack, a Marc Skill or Power, the same two for Yola, and one of either. One is half price.
    Shop rarity is 9/37 [M] (Slay the Spire's ShopRoom) and never moves the pity offset.
  - 3 relics: two at 50/33/17 and one shop relic.
  - 3 potions.
  - Prices: cards 45-55 / 68-82 / 135-165; relics 143-157 / 238-262 / 285-315 (shop relic 143-157); potions 48-53 / 71-79 / 95-105.
  - Removal costs 75 (+25 each time), once per visit. The Doctor's Note makes it 50. The Staff Badge halves everything,
    removal included [M], from the moment it is bought.
- **Rest:** heal 30% of Max HP (rounded down), or upgrade one card.

[M] = from memory of the game; check before relying on it.

## Limits of the sim

- The bots don't make human mistakes, and their card ratings are mine, not measured. Treat the win rates as a ceiling
  for a new player.
- The bots use potions by simple rules, and the Medkit on the map only under 40% HP.
- Event and shop choices are hand-written rules per event.
- The expert bot sees enemy intents (as players do) and random targets inside its own lookahead. It plans
  only up to a draw.

## Logic review (2026-10-23)

An adversarial review of `src/game` fixed seven bugs (each has a test in `tests/regressions.test.mjs`). Two touched what
the sim measures:
- **The Pharmacy reused random numbers.** Two handles on the same run stream each kept their own copy of its state, so
  the shop's card pick reused its rarity roll. A rare was always the first rare in its pool: 8 of the 12 rares, 5
  uncommons and 3 commons could never be sold, and the relic shelf's rarity and price were tied together. Now every
  handle reads and writes the run's saved state, so all cards and relics can show up.
- **Trophy Belt energy from a Bleed kill on the zombies' turn was lost** at the next refill. It now carries to the next
  turn (the card it draws already did).

The sensible bot's numbers moved by less than the noise between seeds (win 93.0 → 92.7%, boss 58.2 → 57.9%), so
the conclusions above stand and nothing was re-tuned.

