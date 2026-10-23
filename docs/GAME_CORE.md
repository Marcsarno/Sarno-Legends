# Sarno Legends: the core (start here)

This page decides what the game is, as of 2026-10-23. It comes from the sixth research pass and a design-director audit (`RESEARCH_NOTES.md`, pass 6).

**When a new idea comes up, test it against the three pillars below.** `DECKBUILDER_PLAN.md` is the bigger reference plan. Most of it is **parked** (listed below) until the core is proven fun.

## Pitch

**A Slay the Spire-style deckbuilder where nobody kills alone.** Marc cracks zombies open and Yola finishes them with a cinematic kill. Every hit point you spend getting through the hospital is one you won't have at the boss.

## Three pillars

1. **Marc opens, Yola closes.**
   - Only Marc's cards break a zombie. Only Yola's cards cash a break in for the kill.
   - A card that lets one hero do both jobs alone is a no.
2. **The kill is the payoff.**
   - A finisher on a broken zombie is the best play in the game.
   - It plays the best animation and pays something back: a card, energy, or a little HP.
   - A feature that doesn't make kills better, faster or more varied is a no.
3. **Every hit point is a choice.**
   - Zombies show their next move and damage, and nothing about damage is random.
   - Healing is scarce, and HP carries from room to room.
   - A free heal, or a hit the player couldn't see coming, is a no.

Family, weapons and painted rooms are content. They serve the pillars rather than being pillars themselves.

## Familiar is fine

Marc, 2026-10-23: "I don't need to do something new no other game does."

**The aim:** a well-made Slay the Spire-style game with our own heart. That means the family, the animations, and the hospital and neighbourhood already built.

**What the pillars are for:** stopping the design from drifting, not making the game novel. "Marc opens, Yola closes" comes from Marc's early asks: both heroes have to matter, and the finisher animations are the reward.

Borrowing proven Slay the Spire structure is welcome wherever it serves the pillars.

## The core loop

- **A turn:** read the zombies' next moves, then split 3 energy between blocking, breaking (Marc) and finishing (Yola).
- **A fight:** 2–4 zombies, 3–5 turns. Every kill is a finisher. HP lost stays lost.
- **After a fight:** take 1 of 3 cards or skip. Then choose the next room on the map.
- **A run:** one hospital floor of about 8 rooms, ending at the Shield Guard.
  - Breaking him knocks his arm off.
  - Finishing him takes his head off.
- **Between runs:** scrap buys the next weapon (bat → nail bat). It swaps in new break or finish cards, a new look and a new kill.

## Keep, cut, park

**Keep (the first playable):**
- **Deck and turns:** one shared, colour-coded deck; 3 energy and 5 cards; Yola's block can go on Marc.
- **The core mechanic:**
  - Zombie intents that show the target.
  - Stagger that carries over between turns.
  - Breaking: Marc only.
  - Finishing: Yola only. The killing blow picks the animation.
  - Batter Up as the one duo card.
- **Attrition:** HP carries between rooms.
- **Zombies:** walker; nurse (her revive creates "who dies first?"); sprinter; one elite (the Big Walker, whose Roar a break cancels); the Shield Guard.
- **The run:** a small branching map, a mid-floor rest (heal or upgrade), the boss shown from the start, one card-upgrade rule, and 1-of-3 rewards with at least one card per hero.
- **Between runs:** scrap and one weapon step.
- **Presentation:** fast play (the next card is playable when the hit lands), landscape, card art from clip stills, auto-save.

**Cut:**
- The duo colour rule (pillar 1 replaces it).
- The healing cap and the horde clock. Set Patch Up's number instead.
- Second Wind, Help Up and Kip Up. One downed rule replaces them: out for the fight, back at 1 HP, and the run ends when both are down.
- The Infected curse, the rarity pity timer, and the "three of a role" rule.
- Cover's taunt.
- The per-zombie targeting table (intents carry the target).
- Everything left over from the turn-based design (turn order, Grit, levels, timed taps).
- Full family card sets.

**Park (good, after the core is proven):**
- **Statuses and enemies:** Bitten cards, the second elite, the chapter-2 looters and zombified survivors.
- **Shop and loot:** supplies, the pharmacy, items, trinkets, card removal, events, the stash.
- **Difficulty and options:** rarity tiers, infection levels, mastery goals, Story mode, the speed menu.
- **Content:** family call-ins, Code Blue, floors 2–3, extra painted rooms.

## The riskiest assumption, and the cheap test

**Assumption:** with a random shared hand, "Marc opens, Yola closes" gives real decisions, not dead hands (Marc's cards but nothing to finish with) or a fixed two-step routine.

**The test is a paper prototype, played in one evening** with Yola and one of the kids:
- **Materials:** 12 index cards, dice for HP and stagger, and zombies' moves written on paper.
- **Fights:** 3 walkers, then a nurse + 2 walkers, then the Shield Guard.
- **Count:** the turns with nothing to open or nothing to finish.

**Fun looks like:**
- People planning across turns out loud: "I'll break him now, you finish next turn… but then nobody blocks the bite."
- Arguing about killing the nurse first.
- A missed finish feeling like their own mistake.
- Asking for another go.

**It's broken if:**
- More than about a quarter of turns have no matching half.
- Every turn plays the same way.

**If dead hands are the problem, test one fix at a time:**
- Yola's finish cards stay in hand.
- A break lasts until the zombie's next turn, and it stands back up if nobody finishes it (Persona-style).

Only after this passes do we build one fight on the phone. That build tests the other risk: whether 1–2-second clips keep a 5-card turn snappy.

**Paper test cards** (starting numbers, not simulated):

| Hero | Card | Cost | Effect |
|---|---|---|---|
| Marc | Bat Swing ×3 | 1 | 5 damage, stagger 2 |
| Marc | Brace ×2 | 1 | 6 block on Marc |
| Marc | Home Run ×1 | 2 | 10 damage, stagger 4 |
| Yola | Finish ×2 | 1 | Broken zombie only: kill it if it has 15 HP or less, otherwise 10 damage. Draw 1 on a kill |
| Yola | Pistol Shot ×1 | 1 | 4 damage, no stagger |
| Yola | Sidestep ×2 | 1 | 5 block on either hero |
| Yola | Patch Up ×1 | 1 | Heal 6 (this fight's damage only) |
| Both | Batter Up | 2 | Needs a Marc and a Yola card played this turn: 12 damage, stagger 4 |

**Paper zombies:**
- **Walker:** 18 HP, stagger bar 4. Shamble 5 at Marc, or Bite 6.
- **Nurse:** 14 HP, bar 3. Jab 5 at Yola; kneels, then revives a dead walker at half HP.
- **Sprinter:** 12 HP, bar 2. Lunge 7 at Yola.
- **Shield Guard:**
  - 100 HP, bar 10.
  - Bash 8 at Marc, Dash 10 at Yola, then Leap 12 at both.
  - First break: the arm comes off, Bash is gone.
  - At 0 HP: the head comes off.
- **Breaking:** a full stagger bar breaks the zombie. It skips its next move. A break that nobody finishes ends when the zombie acts again.

**Heroes:** Marc 50 HP, Yola 40 HP (paper scale).

## How we'll balance (from pass 6)

- **Log from day one:**
  - Every card offered, picked or skipped.
  - Every fight's turns, HP lost per hero, and the killing blow.
  - Every run's floor reached and cause of death.
- **A headless sim with three bots:** random, greedy, and sensible. The sensible bot should clearly beat the random one. That gap is a rough measure of skill.
- **Target numbers at base difficulty:**
  - Normal fight: 5–15% HP lost (under ~3% means easy rooms don't make you conserve HP).
  - Elite: 20–30%.
  - Boss: 30–45%.
  - Arrive at the boss with 40–60% HP.
  - A new player wins about 40% of first runs.
- **Reading card data:**
  - A card taken less than ~10% of the time is dead: check whether it's weak or just unclear.
  - A card whose win rate is 15+ points above average is suspect: check with the sim before nerfing.
  - Prefer buffing over nerfing, and leave a few broken combos in on purpose.
- **Playtests:** 5–8 people who haven't seen the cards. Watch where they stop, not what they say.
- **Don't compete on:** card count (25 cards first, 60–80 eventually), endless combos, or piles of systems. Klei scrapped an open-world Griftlands because "the whole was never better than the pieces."

## Decisions for Marc

1. **Hard split** (only Marc breaks, only Yola finishes) **or soft** (both do everything)? Recommended: hard. It's the identity, and the paper test will show whether it holds.
2. **Family:** one call-in card per run, **or** full card sets? Recommended: call-ins first. They're cheap, and nobody's set can feel weak.
3. **Story:** Marc and Yola together in every fight, **or** split hospital and neighbourhood tracks that reunite? Recommended: together in fights, since the couple is the mechanic. How the story brings them together is yours.

**Next:** stop research passes until the paper fight has been played. The next document should be its playtest notes.
