# Deckbuilder plan (the card-game direction)

2026-10-23. Marc chose the roguelike deckbuilder direction: Slay the Spire-style runs through the hospital, with two heroes whose cards trigger real animations, and weapon upgrades that carry forward between runs. This replaces the turn-based menu design in `COMBAT_DESIGN.md`. Its intents, stagger/break, roles and zombie roster carry over; its numbers do not.

Nothing is built. All numbers are starting points, to be simulated before any building.

## The short version

- **One shared deck** with cards colour-coded by hero (Marc red, Yola teal). 3 energy per turn, a 5-card hand, a 12-card starting deck (6 each).
- **Every card plays an animation.** Basic cards are fast (about half a second). Big cinematics are kept for finishers and kills.
- **A run is the hospital,** floor by floor. HP carries from room to room, so even easy rooms cost something.
- **After each fight,** pick 1 of 3 new cards, or skip.
- **Weapons upgrade between runs.** Upgrades mostly unlock new cards and looks rather than raw power, so the game never gets trivial.

## Closest games to learn from

1. **Slay the Spire:** the run structure, enemy intents, and the "rest or upgrade" choice. Its weakest point was static animation, which is our strength.
2. **Roguebook:** two heroes and one shared deck. The front hero takes the hits. A downed hero loses their cards until revived. Reviewers said its hero swapping was mostly bookkeeping; ours should create real decisions.
3. **Fights in Tight Spaces:** every card is a choreographed animation. Players said the animations could run long, so add a speed setting from day one.

Also useful:
- **Monster Train:** floors as space, clan levels unlocking cards.
- **Inscryption:** a failed run feeds the next.
- **Dawncaster:** a premium phone deckbuilder, with no ads or timers.
- **Draft of Darkness:** survival horror with ammo as a resource.

No well-known zombie roguelike deckbuilder turned up, so the niche looks open.

## Rules (starting point)

- **Energy:** 3 per turn, shared by both heroes. Most cards cost 0–2.
- **Hand and deck:**
  - A 5-card hand, drawn from one shared pile.
  - The deck starts at 12 cards, so you see about half of it each turn.
- **Who gets hit:**
  - Block lives on each hero.
  - Zombies aim at Marc by default.
  - Sprinters and the Shield Guard's Dash go for Yola. That's the protect-the-healer puzzle.
- **Intents:** every zombie shows its next move, target and damage.
- **Stagger and break:** cards list a stagger value. At 0 the zombie is broken: its intent is cancelled and it takes +50% damage.
- **Grit:** no longer a cost. It becomes a 4-pip combo meter, filled by attacks and hits taken, that powers the duo move and ultimates.
- **A downed hero:** their cards leave the hand until revived (a Kip Up card, a rest stop or the floor's end).
- **Killing blows:** the card that kills picks the death animation (light → collapse, heavy → launch, shotgun → blast back, on a knocked-down zombie → execution finisher).

## Starting deck (placeholders)

| Card | Hero | Cost | Effect | Animation |
|---|---|---|---|---|
| Bat Swing ×3 | Marc | 1 | 6 damage, stagger 2 | `bat_swing` |
| Brace ×2 | Marc | 1 | 6 block on Marc | `ual_Sword_Block` |
| Home Run ×1 | Marc | 2 | 14 damage, stagger 4, pushes the intent back | home-run clip (to bake onto Marc) |
| Pistol Shot ×3 | Yola | 1 | 5 damage, stagger 1 | pistol clips |
| Sidestep ×2 | Yola | 1 | 5 block on Yola | `ual1_Dodge_*` |
| Patch Up ×1 | Yola | 1 | Heal (to be tuned) | **no clip yet** |

**Early reward cards:**
- **Cover:** block plus a taunt.
- **Execute:** kills a broken non-boss and plays the finisher.
- **Kip Up:** revives.
- **Batter Up:** the duo move, which needs the Grit meter.
- **Code Blue:** Yola's ultimate.
- **Weapon cards:** each weapon brings its own reward cards (crowbar, fire axe, shotgun, greatsword…).

**Starting HP** (draft-3 numbers ÷ 5):
- Heroes: Marc 80, Yola 60.
- Zombies: Walker 22, Nurse 18, Sprinter 16, Elite 60, Shield Guard 160.
- These are to be re-simulated.

## A run through the hospital

- **Floors:** 3 floors of about 8 rooms each, about 25 minutes in all.
- **Each floor holds:** 4 fights, 1 optional elite, 1 rest stop, 1 shop or event, and 1 boss.
- **Paths:** you choose between them on a floor map.

| Room | What it is |
|---|---|
| Fight | 2–3 zombies |
| Elite | Big walker; better rewards |
| Supply closet (rest) | Heal ~30% **or** upgrade a card |
| Pharmacy (shop) | Buy cards, remove a card |
| Locked room (event) | A story moment or a choice |
| Stash | Treasure |
| Elevator | The floor boss |

- **Before the boss:** the room before every boss is a supply closet.
- **After the boss:** beating the boss gives a full heal.
- **HP targets per room:**
  - About 15% of party HP for a normal fight.
  - About 30% for an elite.
  - About 40% for a boss.
- **Bosses:**
  - Floor 1: the Shield Guard.
  - Floors 2–3: the Orderly and the Acid Lady are candidates.
  - Marc decides the story.

## Card odds

- **Rewards:** pick 1 of 3, or skip.
- **Rarity odds (Slay the Spire):**
  - Normal fights: 60% common, 37% uncommon, 3% rare.
  - Elites: 50/40/10.
  - Bosses: always rare.
- **Rare pity timer:** the rare chance rises by 1% after every common and resets after a rare.
- **No hopeless runs:**
  - Every reward offers at least one card per hero.
  - The first two fights are safe.
  - Rest stops and shops can fix a weak deck.
  - Intents mean losses feel like your choice, not bad luck.

## Weapons between runs (meta-progression)

1. **New options, not raw power.** A bat becomes a nail bat (adds bleed cards), then a wire-and-tape bat (adds stagger cards). Each tier also changes how the weapon looks.
2. **Cap the raw power.** All flat bonuses together stay under about 10–15%.
3. **A difficulty ladder:** after a first clear, "infection levels" add one rule each, like Slay the Spire's Ascension. Story mode and "ease up" go the other way.
4. **Earn upgrades by mastery, not grinding.** For example: "break 5 zombies in one turn". Materials sit at set spots, never random drops.
5. **Never take progress away,** and never nerf a weapon someone has invested in. Slay the Spire 2 and Wildfrost were both criticised for doing this.

## Animation pacing (starting numbers)

| Card type | Total time |
|---|---|
| Basic attack | 0.5–0.6 s (the hit lands at ~0.25 s) |
| Heavy or multi-hit | 0.9–1.1 s |
| Block, dodge, buff | 0.3–0.4 s |
| Heal | 0.5 s |
| Status effect or reaction | ≤ 0.2 s |
| Cinematic (finisher, boss kill) | 2–3 s, at most one per turn; shortened once seen |

- **Five normal cards ≈ 4 seconds.**
- **Card queueing:** the next card can be played as soon as the hit lands.
- **Zombie turn:** zombies act together, with short overlaps between them.
- **Speed setting:** 1×, 1.5×, 2×, or skip. Legends of Runeterra, Hearthstone and Roguebook were all criticised for slow animations.
- **Animation budget:** about 25–40 hero clips can cover 60–80 cards. Unique animations go to signature and rare cards only. Zombie hit and death reactions give the most variety for the least work.

## Phone screen (landscape)

- **Stage:** the painted room fills the screen. Heroes stand on the left, zombies on the right.
- **Above each zombie:** its intent and HP.
- **Under each hero's feet:** HP and block.
- **The hand:** one straight row of 5 cards along the bottom (not a fan), with big text and icons.
- **Selecting a card:** the hero who owns it steps forward.
- **Controls:**
  - Energy at bottom-left.
  - Draw pile at bottom-left.
  - Discard pile and a large End Turn button at bottom-right.
- **Input:**
  - Drag a card up to play it. Tap to read it; a tap never plays.
  - A text-size setting.
- **Card art:** rendered stills from the animation clips, at the moment of impact. All use the same camera, light, colour grade and frame, and sit over a crop of the painted room. Heal and buff cards need a staged pose.

## Family: their own card sets

Marc's idea (2026-10-23), the same pattern as Monster Train's clans and Cobalt Core's crew.

- **Choosing helpers:** at the start of a mission you choose who comes along. Their **own card set joins the deck for that run**: a few starter cards, plus their cards in the reward pool.
- **One clear identity each.** Who does what is Marc's call; for example, one person's cards are about traps, another's about speed.
- **No 3D model needed.** Their cards play a painted portrait cut-in with an effect. Each person costs about 10–15 card designs and one painted portrait.
- **Replay value:** each pairing plays differently.
- **The kids:** could get a smaller "help from home" set of 1–2 cards.

## Decided (2026-10-23)

- **One shared deck** (Marc's lean).
  - Safety net: every reward offers at least one card per hero.
  - Some cards draw a card for a named hero.
  - Separate decks were weighed and set aside: two hands on a small screen, more deck-building, and harder to add family sets.
- **What carries between runs:** currency and upgrades only.
  - A lost run still earns some currency (e.g. scrap) for weapon upgrades.
  - Nothing story-like is left behind.
- **Family:** they bring their own card sets for the mission (above).

## Open questions for Marc

1. Who and what are the floor bosses and story beats?
2. Which family members get card sets, and what is each one's style?
