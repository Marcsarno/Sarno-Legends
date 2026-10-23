# Balance: what the sim says about act 1

Measured 2026-10-23 with the headless sim (`tools/sim/`), seed `BAL`, starter weapons (Wood Bat + Pistol) unless a
table says otherwise. Targets are GAME_CORE's.

## Pass 8 (2026-10-23): card pass, Infection levels, Daily Run

**Short version**
- **Every card now has a place.** Before the pass, 13 reward cards were never picked by the sensible bot and 9 more
  under 11%. After it, every common and uncommon is picked in some runs (lowest: Grit Teeth 1.5%, Tackle 4.9%), and
  the build-around rares that a balanced draft skips (Fortify, Dead Eye, Rally) are taken 74-86% of the time by a bot
  that drafts their build (`--archetype`).
- Both sides were fixed: 9 cards changed or redesigned with Slay the Spire's numbers, 5 new ones (Check the Mag's
  choice, 2 choice cards, 2 Bulwark payoffs), and the bot learned to rate synergies and to play the cards it used to
  waste (heals, Wrench Arm, Strength-this-turn, Dig In, Fortify, cash-ins held for the Staggered turn).
- **Bulwark is a real build**: drafting it wins 96.7% at Infection 0 and 48% at Infection 5, level with the Staggered
  build (98% / 50%).
- **Infection 0 got easier** (sensible 92.7% → 99%, boss 58% → 44% of Max HP). About 3.5 points come from the
  better bot (old cards with the new bot: 96.3%) and about 3 from the card pass. Infection 0 stays the family level;
  the ladder does the rest: **99 / 98 / 98 / 89 / 73 / 60%** at Infection 0-5 (greedy bot: 81% at 0, 22% at 5).
- New engine step: a mid-fight card choice (`combat.state.choice` + `combat.choose(uids)`, documented at the top of
  `src/game/combat.js`). New tool: `tools/sim/cardvalue.mjs` (what one copy of each card is worth).

### Results at Infection 0 (300 runs per bot)

| | random | greedy | **sensible** | expert | sensible before | target |
|---|---|---|---|---|---|---|
| win rate % | 0 | 81.3 (was 72.3) | **99** | 99 (was 99.3) | 92.7 | sensible 40-60 |
| reach the boss % | 5 | 97 | 100 | 100 | 99.0 | |
| HP entering the boss % (mean / p10 / p90) | 54.3 / 17.5 / 92 | 71.2 / 53.8 / 91.3 | **85.9 / 72.5 / 98.8** | 86.1 / 72.5 / 100 | 84.8 / 71.3 / 97.6 | 40-60 |
| normal fight: HP lost % (mean / p90) | 25.5 / 58.8 | 7.5 / 18.8 | **5.2 / 12.5** | 4 / 12.6 | 5.6 / 12.9 | 5-15 |
| elite fight: HP lost % (mean / p90) | 68.3 / 100 | 30.1 / 51.1 | **22 / 41.2** | 19.3 / 37.5 | 24.6 / 46.3 | 20-30 |
| boss fight: HP lost % (mean / p90) | 63.2 / 108.7 | 62.8 / 83.8 | **44.5 / 69.9** | 36.9 / 60 | 57.9 / 83.8 | 30-45 |
| turns: normal / elite / boss | 4.7 / 7.1 / 6.9 | 2.9 / 5.5 / 8.4 | 2.7 / 5.6 / 10.1 | 2.5 / 5.1 / 8.3 | 2.9 / 5.9 / 11.1 | |
| card picks skipped % | 24.4 | 0 | 1.2 | 1.2 | 5.7 | |
| final deck / relics / supplies | 14.3 / 1.7 / 158 | 20.5 / 5.2 / 184 | 18 / 5.1 / 140 | 18 / 5.1 / 135 | 17.6 / 4.9 / 140 | |

### Card changes

Names kept; numbers are Slay the Spire's where a card has an StS twin (BUILD_SPEC section 4's "StS" column).

| card | was | now | why |
|---|---|---|---|
| Check the Mag | 0: 2 Block, draw 1 (no choice step yet) | 0: draw 2, discard 1 (+: draw 3, discard 2) | the engine has the choice now; a Prepared-style filter |
| Double Tap | 1: 4 ×2 (6 ×2) | 1: 3 ×2, +3 each if Staggered (4 ×2, +4) | was a weaker copy of Marc's One-Two; now a Yola cash-in (6 plain, 18 Staggered) |
| Kneecap | 1: 6 + 1 Weakened (8, 2) | 1: 7 + 1 Weakened (9, 2) | Sucker Punch's numbers |
| Quick Shot | 0: 3 (5) | 0: 4 (7) | measured strong already; 4 reads less like filler |
| Flare | 1: 1 Weakened to ALL, draw 1 (2) | 1: 2 Weakened to ALL, draw 1 (3) | one round of Weakened didn't pay for the energy |
| Deep Breath | 0: +2 Strength this turn (+4) | the same, and draw 1 | Flex never had a place without multi-hits; the draw makes it never dead |
| Triage | 1: heal 4, exhaust (6) | 0: heal 4, exhaust (6) | Bandage Up's cost |
| Light on Feet | power 1: +1 Block per Skill (2) | +2 Block per Skill (3) | Feel No Pain's 3/4 is for a narrower trigger; 1 was below Thick Skin |
| **Tough It Out** (new, Marc common) | | 1: 7 Block, exhaust a card from your hand (9) | True Grit; the spin: you choose even before the upgrade. Thins starters, feeds Bulwark |
| **Wait for It** (new, Yola common) | | 1: 6 Block, Retain up to 2 cards this turn (9) | Equilibrium's idea at common size: hold a cash-in for the turn Marc staggers |
| **Barbed Wire** (new, Marc uncommon) | | 2: 12 Block; until your next turn each zombie hit is answered with 4 (16, 6) | Flame Barrier: Bulwark's uncommon payoff |
| **Battering Ram** (new, Marc rare power) | | 2: whenever you gain Block, 5 damage to a random zombie (7) | Juggernaut: the Bulwark finisher |

Kept as Slay the Spire has them (their place is a build, which the bot now sees): Heavy Swing (Heavy Blade), Tackle
(Body Slam), Dig In (Entrench), Fortify (Barricade), Swing Guard (Rage), Grit Teeth (Bloodletting), Rally (Limit
Break), Momentum (Rampage), Haymaker (Clothesline), Spray and Pray (Sword Boomerang), One-Two (Twin Strike),
Shoulder Check (Iron Wave), Slow Motion (Bullet Time), Cheap Shot.

### The bot's side (tools/sim/bots.mjs)

- **Ratings**: half the old hand-made tier list, half the measured value of the card (below). Build-around cards keep
  a low base and earn the rest from the deck: Staggered sources and cash-ins, Strength sources and the multi-hit
  cards that multiply them, Bulwark engines (Block makers) and payoffs (Tackle, Dig In, Fortify, Barbed Wire,
  Battering Ram), energy cards for expensive hands, thinning for starter-heavy decks.
- **Play**: free heals when hurt; Strength-this-turn and Swing Guard only when this turn's attacks use them; Wrench Arm
  on the focus in long fights; cash-ins wait while a Staggered card is in hand; Weakened counts as Block; Grit Teeth /
  Slow Motion only when the hand needs the energy; Bulwark order (Block, Dig In, then Tackle); synergy powers only in
  decks and fights that use them (Dead Eye needs 2 Staggered sources, Fortify needs Block and a long fight); 2-energy
  heals on a quiet turn.
- **Choices**: `chooseFor(c)` / `settleChoice(c)` answer any open choice (discard what it can't use, exhaust statuses
  and starter basics, retain what it can't afford or cash-ins while nothing is Staggered, upgrade the biggest gain).
  The random bot picks randomly; the expert resolves choices inside its search the same way.
- `--archetype bulwark|strength|stagger` drafts like a person committing to a build: payoffs whenever offered, support
  once a payoff is in the deck. Play is unchanged.

### Pick rates (sensible bot, Infection 0) and card value

Pick rate = picked / offered (before: 300 runs; after: 1000 runs). A card offered with two better ones loses the
pick, so 33% is a strong card. **Value** = the change in win rate when one copy is added to the starter deck,
Infection 5, 1500 runs per card, same seeds (`node tools/sim/cardvalue.mjs`; baseline 50.3%). Value is the card on its
own: build-around cards (Dig In, Fortify, Dead Eye, Rally) score low there by design, and noise is about ±2.5 points.

| card | pick % before | pick % after | value (Δ win %) |
|---|---|---|---|
| jaw_breaker | 83.3 | 98.4 | +17.6 |
| overhead_smash | 84.7 | 94 | +12.7 |
| point_blank | 100 | 89.5 | +7.2 |
| grand_slam | 58.3 | 86.6 | +10.3 |
| pumped_up | 73 | 81 | +6.3 |
| berserker | 86.4 | 77.4 | +1.6 |
| thick_skin | 48.2 | 72.6 | +15.3 |
| barbed_wire | new | 71.8 | +2.7 |
| ground_pound | 82.9 | 67.4 | +3.0 |
| crowbar_pry | 51.8 | 63.7 | +8.8 |
| adrenaline_shot | 57.1 | 59.4 | +11.7 |
| batter_up | 59.4 | 58.1 | +4.0 |
| covering_fire | 68.7 | 57.2 | +3.5 |
| hold_the_line | 68.8 | 56.8 | +8.5 |
| make_it_count | 28.6 | 52.4 | +10.1 |
| painkillers | 52.9 | 47.1 | +2.8 |
| haymaker | 11.2 | 42.4 | +10.8 |
| cheap_shot | 7.4 | 41.6 | +12.5 |
| wild_swing | 44.8 | 39.2 | +3.7 |
| battering_ram | new | 39 | +6.8 |
| triage | 0 | 37.8 | +11.5 |
| triple_tap | 63.6 | 36.8 | -1.6 |
| kneecap | 14.1 | 36.5 | +10.9 |
| shoulder_check | 16.4 | 34.5 | +7.7 |
| headshot | 93.5 | 32.6 | -3.7 |
| clean_kill | 45.5 | 32 | +2.6 |
| deep_breath | 0 | 31.2 | +11.5 |
| double_tap | 10.1 | 31.1 | +5.3 |
| wrench_arm | 53.2 | 28.7 | +7.8 |
| one_two | 10.6 | 26.6 | +6.7 |
| overdrive | 100 | 26.3 | -1.9 |
| quick_shot | 0 | 24.8 | +8.3 |
| tough_it_out | new | 22.9 | +2.5 |
| momentum | 4.5 | 22 | +8.8 |
| check_mag | 0 | 20.5 | +2.1 |
| cover_him | 40.7 | 20.1 | +2.1 |
| bolt_the_door | 87 | 17.8 | +0.7 |
| aimed_shot | 36 | 17.3 | +1.1 |
| marksman | 76.5 | 12.6 | +0.3 |
| spray_and_pray | 8.5 | 12.4 | +0.5 |
| swing_guard | 0 | 12.2 | +5.9 |
| light_on_feet | 3.9 | 12 | +4.6 |
| suppressing_fire | 27.7 | 11.8 | +3.5 |
| fortify | 0 | 10.7 | -10.7 |
| kick_the_door | 26.4 | 9.9 | -3.2 |
| heavy_swing | 0 | 9.1 | -1.1 |
| tuck_and_roll | 52.6 | 7 | -4.3 |
| wait_for_it | new | 6.4 | -1.0 |
| dig_in | 0 | 6 | -14.0 |
| flare | 3.7 | 5.6 | +3.3 |
| slow_motion | 8.6 | 5 | -3.3 |
| tackle | 0 | 4.9 | -3.9 |
| defibrillator | 25 | 4.5 | -5.3 |
| dead_eye | 13 | 3.7 | -13.0 |
| grit_teeth | 0 | 1.5 | -1.1 |
| rally | 0 | 1.3 | -7.0 |

Build-around cards inside their build (1000 runs each, `--archetype`): Bulwark picks Barbed Wire 99.7%, Battering Ram
98.7%, Fortify 86%, Dig In 77%, Tackle 74%; Staggered picks Dead Eye 74%.

### Builds (500-1000 runs each, sensible play, `--archetype`)

| draft | Infection 0 win % | Infection 5 win % |
|---|---|---|
| balanced (no lean) | 99.2 | 60.2 |
| Bulwark | 96.7 | 48.4 |
| Strength | 98.4 | 55.2 |
| Staggered | 98.0 | 49.6 |

Inside Bulwark at Infection 5, what the deck ended with matters: Battering Ram + Barbed Wire won 80%, Tackle +
Battering Ram 75%, Barbed Wire alone 49%, Tackle alone 38%. Body Slam needs a Block engine, as it does in Slay the Spire.

## Infection levels (our Ascension)

Level 0 is the game above (the family level). Each level adds its change to every level below it.
`src/game/infection.js` has the numbers and `INFECTION_LEVELS` (names and text are placeholders for Marc).
Slay the Spire spreads these over 20 Ascensions, so each step here is a little bigger than its StS counterpart.

| level | name | adds | StS |
|---|---|---|---|
| 0 | Family | — | A0 |
| 1 | Outbreak | more elites: 12.8% of map rooms instead of 8% | A1 |
| 2 | Spreading | normal zombies +20% damage (Bite Down 11 → 14) and +10% HP | A2 + A7 |
| 3 | Mutation | elites +15% damage (Charge 14 → 17, Flail 18 → 21) and +10% HP | A3 + A8 |
| 4 | Quarantine | the boss +20% damage (Shield Bash 32 → 39) and +30 HP (240 → 270) | A4 + A9 |
| 5 | Pandemic | Nurse's Kit heals 4 instead of 6; resting heals 25% instead of 30% | (asked for) |

Sensible bot, 500 runs per level:

| infection | win % | reach boss % | HP entering the boss % (mean / p10 / p90) | normal HP lost % | elite HP lost % | boss HP lost % | deaths |
|---|---|---|---|---|---|---|---|
| 0 | 99.2 | 100 | 85.6 / 72.5 / 98.8 | 5.3 | 22.1 | 44.5 | boss 4 |
| 1 | 98.4 | 99.8 | 85.0 / 72.5 / 97.7 | 5.0 | 21.5 | 44.5 | boss 7, Orderlies 1 |
| 2 | 97.8 | 99.0 | 83.9 / 72.4 / 96.3 | 8.1 | 21.3 | 46.7 | boss 6, Orderlies 4, a Biter 1 |
| 3 | 89.4 | 92.8 | 81.3 / 70 / 96.3 | 8.2 | 36.1 | 49.0 | boss 17, Sleeping Patient 14, Orderlies 13, others 9 |
| 4 | 73.2 | 92.8 | 81.3 / 70 / 96.3 | 8.2 | 36.1 | 72.2 | boss 98, elites 31, others 5 |
| 5 | 60.2 | 89.6 | 75.7 / 61.2 / 90 | 8.2 | 37.3 | 73.4 | boss 147, elites 41, others 11 |

Greedy bot: 81.3% at Infection 0, 22.3% at Infection 5. Levels 1 and 2 barely move the sensible bot (as A1 and A2
barely move a good StS player: the extra elites pay for themselves in relics, and the Nurse's Kit erases a harder
hallway fight). The steps that bite are elites (3) and the boss (4). Infection 5 lands the sensible bot inside the
40-60% band GAME_CORE wants for a careful player.

Unlocks (meta.js): `profile.infection = { unlocked }`; a win at your highest unlocked level opens the next.

## Daily Run and score

- `dailySeed(date)` → `DAILY-YYYY-MM-DD` from the local date. `createRun({ daily: 'YYYY-MM-DD' })` uses it with the
  free weapons and Infection 0 whatever the profile has, so everyone gets the same map, fights, rewards and Shift
  Change that day (and the same shuffles while their choices match).
- `scoreRun(run)`: 10 per floor reached, 2 per zombie killed, 10 per elite and 50 for the boss beaten, and on a win
  100 + 1 per HP left. No time component. `scoreBreakdown(run)` has the lines; `runSummary(run).score` too.
  A sensible-bot win scores about 360-460 (median 409).
- `profile.daily = { 'YYYY-MM-DD': bestScore }` (latest 90 days).

## Earlier passes

Everything below is from before the card pass (Pass 7). Its numbers are the "before" column above; the per-encounter,
lever and weapon tables were not re-run.

## How to run it

```
node tools/sim/run.mjs --runs 300 --bot all              # full runs, every bot, prints the markdown report
node tools/sim/run.mjs --runs 100 --bot sensible --weapons nail_bat,shotgun --json /tmp/out.json
node tools/sim/bench.mjs --fights 50 --bot greedy,sensible,expert   # each encounter with the starter deck at 80 HP
node tools/sim/run.mjs --runs 500 --bot sensible --infection 5      # an Infection level (0-5)
node tools/sim/run.mjs --runs 1000 --bot sensible --archetype bulwark   # draft toward a build (bulwark, strength, stagger)
node tools/sim/cardvalue.mjs --runs 1500 --infection 5 [--cards tackle,dig_in]   # one copy of each card vs the starter deck
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

