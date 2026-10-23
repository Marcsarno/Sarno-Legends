# Deckbuilder plan (the card-game direction)

> **`GAME_CORE.md` now decides what the game is** (2026-10-23): Slay the Spire's rules and numbers, one shared HP bar, Vulnerable as "Staggered", and Yola's heal as a starter relic. Where this plan disagrees (per-hero HP and block, the stagger bars, the duo rule, Second Wind and Help Up, the healing cap, the horde clock, family card sets, its numbers), `GAME_CORE.md` wins. Most of this plan is parked; it's kept as reference.

Second draft, 2026-10-23.

**Marc's direction:** a Slay the Spire-style roguelike deckbuilder.
- Runs go through the hospital, floor by floor.
- Two heroes share one deck, and every card plays a real animation.
- Weapon upgrades carry forward between runs.

It replaces the turn-based menu design in `COMBAT_DESIGN.md`. The intents, stagger/break, roles and zombie roster carry over; the numbers don't.

**How this draft was made:** the first draft was reviewed by a critic and checked by a verifier, who simulated the card fights (`RESEARCH_NOTES.md`, pass 5). This draft fixes what they confirmed. **The new numbers haven't been simulated yet; that's the next step.** Nothing is built.

## The short version

- **One shared deck.** Cards are colour-coded by hero: Marc red, Yola teal.
- **Turns:** 3 energy per turn and a 5-card hand.
- **Every card plays an animation.** Big cinematics are kept for finishers and kills.
- **A run is the hospital,** floor by floor. HP carries over from room to room.
- **Rewards:** after each fight, pick 1 of 3 cards or skip.
- **Weapons between runs:** they upgrade, mostly unlocking new cards and looks rather than raw power.

## Closest games to learn from

1. **Slay the Spire:** run structure, intents, the rest-or-upgrade choice. Its weakest point was static animation, which is our strength.
2. **Roguebook:** two heroes, one deck.
3. **Fights in Tight Spaces:** each card is a choreographed animation. Add a speed setting from day one.

**Also useful:**
- **Monster Train:** clans paired per run; clan levels unlock cards.
- **Cobalt Core:** crew members, about 20 cards each.
- **Inscryption, Dawncaster, Draft of Darkness.**

No well-known zombie roguelike deckbuilder turned up.

## Rules

**Energy and hand**
- 3 energy per turn, shared. Most cards cost 0–2.
- A 5-card hand from one shared pile.

**Block**
- Block lasts until your next turn.
- Marc's block goes on Marc.
- **Yola's block cards can go on either hero.** That lets her protect Marc or herself, and keeps her block cards from going to waste.

**Who gets hit**
- **Walkers and the elite** hit Marc.
- **The sprinter and the nurse's jab** hit Yola.
- **The boss:** Bash hits Marc, Dash hits Yola, Leap Slam hits both.
- **A downed hero:** the zombies switch to the one still standing.
- **HP targets are per hero.** In the review simulation Yola lost 0% in every normal fight, so some zombies must go for her.

**Intents**
- Every zombie shows its next move, target and damage.

**Stagger and break**
- **Bars:** cards list a stagger value, and a zombie's stagger bar **carries over between turns**.
- **Break:** at 0 the zombie is broken. Its intent is cancelled, it takes +50% damage until it acts again, and then the bar refills.
- **Bar sizes:** small zombies' bars are scaled down with their HP.
- **What breaking is for:** the boss's main threat is answered by breaking it.

**Duo moves (replaces Grit)**
- **Batter Up** and other duo cards can be played once you've played a Marc card **and** a Yola card this turn.
- There's no meter to track. (Grit filled on hits taken, which rewarded not blocking.)

**Second Wind**
- Once per fight per hero, a hit that would knock them out leaves them at 1 HP instead.

**Downed hero**
- Their cards in the hand turn into 0-cost **Help Up** cards. Play 2 to bring them back at 25% HP.
- A hero still down at the end of the room returns with 1 HP.
- **The run ends only when both heroes are down.**

**Healing has limits**
- Healing in a fight only restores HP lost **in that fight**.
- **Horde clock:** a new walker shambles in every 4 turns, so stalling to heal doesn't pay.
- **Patch Up's value matters most.** In the review it swung Marc's HP loss from 14% to 40% in the same fight. Set it first.

**Killing blow**
- The card that kills picks the death animation:
  - a light hit gives a collapse
  - a heavy hit launches the zombie
  - the shotgun blasts it back
  - a hit on a knocked-down zombie plays an execution finisher

## Starting deck (12 cards, to simulate)

| Card | Hero | Cost | Effect | Animation |
|---|---|---|---|---|
| Bat Swing ×3 | Marc | 1 | 6 damage, stagger 2 | `bat_swing` (2.0 s as is; needs trimming or a faster clip) |
| Brace ×3 | Marc | 1 | 6 block on Marc | `ual_Sword_Block` |
| Home Run ×1 | Marc | 2 | 14 damage, stagger 4; delays a non-boss zombie's move by one turn | home-run clip, **to bake onto Marc** |
| Pistol Shot ×2 | Yola | 1 | 5 damage, stagger 1 | pistol idle + procedural recoil (as in yola-zombie; no licence question) |
| Sidestep ×2 | Yola | 1 | 5 block on **either** hero | `ual1_Dodge_*` |
| Patch Up ×1 | Yola | 1 | Heal 8 (this fight's damage only) | **no clip yet** |

**Why the changes from the first draft**
- **More block.** The review found 32% of hands had no Brace and 21–27% of cards were dead in walker fights. One more Brace, and Sidestep usable on either hero.
- **Home Run** keeps its 14 damage. Its delay now works on non-bosses only.

**Reward cards (first pass)**
- **Cover:** block and a taunt. Mostly useful against sprinters and the Dash, since walkers already hit Marc.
- **Execute:** for elites and bosses. Broken walkers have only about 4 HP left, so any card kills them.
- **Kip Up:** a self get-up.
- **Batter Up:** the duo move.
- **Code Blue:** Yola's ultimate.
- **Weapon cards.**

The card-pool research proposes 2 build styles per hero (Marc: Breaker and Bulwark; Yola: Triage and Marksman), about 24 cards each plus 8 shared, and 8 keywords at most. Those are in `RESEARCH_NOTES.md`, pass 5, still to be chosen.

## Zombies, floor 1 (starting numbers, to simulate)

Party HP: Marc 80, Yola 60.

| Zombie | HP | Stagger | Moves |
|---|---|---|---|
| Walker | 22 | 4 | **Shamble** 5 → Marc; **Bite** 6 → Marc, adds a **Bitten** card. Never Bites twice in a row |
| Nurse | 18 | 3 | **Jab** 5 → Yola; kneels, then **revives** a dead walker at half HP once (corpses stay 2 turns) |
| Sprinter | 16 | 2 | Acts first. **Lunge** 7 → Yola |
| Big Walker (elite) | 60 | 8 | Pound, Pound, Roar (stronger), Bite. A break cancels the Roar |
| Sleeping Patient (elite) | 70 | 8 | Asleep up to 3 turns, gaining block. Awake: Claw, Claw, Moan (adds Bitten) |
| **Shield Guard** (boss) | **~110** (100–120) | 10 → 14 | **Bash** 8 → Marc, **Dash** 10 → Yola, **Leap Slam** 12 → both. The first break knocks off the shield arm; at 0 HP the head comes off |

**Status cards:**
- **Bitten** clogs the hand and costs 1 HP if held at the end of the turn. It's gone after the fight.
- **Infected** is a lasting curse, only from elites and events. It costs both heroes 2 HP if held. A supply closet or the pharmacy removes it.

**In the review simulation, with these attack numbers:**
- **Normal fights:** Marc lost about 10%, Yola 0%.
- **Boss at 160 HP:** 17 turns, too long.
- **Boss at 120 HP:** about 13 turns. Marc lost 18–32%, Yola 32–55%.
- **Boss at 100 HP:** about 11 turns.

Hence ~110 HP. The boss should be judged with the deck you'd have by then (about 5 reward cards), not the starter.

## A run through the hospital

**Run length**
- About **15 minutes per floor** at normal speed, and **auto-save after every card**, so phone interruptions cost nothing.
- 3 floors is about 45 minutes. 25 minutes only works at 2× speed.

**A floor**
- About 8 rows on a floor map, with branching paths.
- **No elite before row 4.**
- **A rest stop in the middle as well as before the boss,** so "heal or upgrade" is a real choice. The review found the single pre-boss closet was the only healing.
- **The boss is shown from the start.**
- **The first two fights** come from an easy pool and double as the tutorial.

| Room | What it is |
|---|---|
| Fight | Easy pool: 2 walkers, walker + sprinter, nurse + walker. Hard pool: 3 walkers, 2 sprinters + nurse… |
| Elite | Big Walker or Sleeping Patient: better rewards |
| Supply closet | Heal ~30% **or** upgrade a card |
| Pharmacy | Spend **supplies** (the in-run money) on cards, items, or removing a card |
| Locked room | An event (6 to write; Marc decides the story ones) |
| Stash | A trinket or items |
| Elevator | The floor boss |

**HP targets, per hero**
- Normal fight: 8–12% of the hero who's hit.
- Elite: about 20%.
- Boss: about 30%.

## The in-run layer (missing from the first draft)

- **Supplies:** money that drops from fights, for the pharmacy. It's separate from scrap and is lost when the run ends.
- **Items (one-use):**
  - medkit: heal
  - adrenaline syringe: revive
  - fire extinguisher: stun every zombie for a turn
- **Trinkets:** lasting bonuses for the run, made from hospital props.
- **Card upgrades:** one rule, either +3 to the number or −1 to the cost. No new art.

## Card odds

- **Rewards:** pick 1 of 3, or skip.
- **Rarity:** normal fights 60/37/3 (common/uncommon/rare), elites 50/40/10, bosses always rare. There's a pity timer on rares.
- **Safety nets:**
  - Every reward offers at least one card per hero.
  - A reward never offers three cards of the same role.

## Weapons between runs (meta-progression)

1. **One currency: scrap.** Every run earns scrap, losses included, and you keep 100% of it, with no toll.
   - Starting numbers: fight 8, elite 20, boss 40, floor cleared +15.
   - The first upgrade (nail bat, 80) is within one or two runs.
2. **New options, not raw power.**
   - **The bat line:**
     - The nail bat adds bleed cards.
     - The wire-and-tape bat adds stagger cards.
     - Each tier changes the look.
   - **Avoiding dilution:** a weapon's new cards **replace or upgrade starter cards** rather than adding to the reward pool, so veteran runs stay consistent.
3. **Cap the raw power** at about 10–15% all together.
4. **Mastery goals** (e.g. "break 5 zombies in one turn") unlock **looks only**. That's Marc's call.
5. **Infection levels** after the first clear add one rule each:
   1. more elites
   2. normal zombies +1 damage
   3. bites add two status cards
   4. bosses hit harder
   5. post-boss heal 75%
   6. start with an Infected curse

   Story mode and "ease up" go the other way.
6. **If a change ever weakens a weapon, refund its scrap.** That replaces "never nerf", which would lock in placeholder mistakes.

## Animation pacing

**The clips are longer than the plan assumed:**
- `bat_swing` 2.0 s
- `ual_Sword_Block` 1.27 s
- dodges 1.33 s
- Short swings exist: `ual_Sword_Regular_A` is 0.47 s and `_B` 0.57 s.

**How to get there:**
- Trim wind-ups.
- Play basics faster.
- Blend each recovery into the next card.

**Targets:**
- A basic attack lands its hit within about 0.3 s.
- Five normal cards take about 4–5 s.
- **Marc fights from a forward melee spot**, so the zombies come to him and there's no walking back and forth. The finisher clips already carry a lunge.

**Clips to make or find:**
1. Yola's heal
2. a buff
3. the home run (bake the existing FBX onto Marc)
4. reviving the other hero

**Licence:** settle the `t_` clips' licence before Batter Up's kick depends on it.

**Finishers:** they have no zombie "victim" clips. Reuse yola-zombie's gore and body-burst system instead (`zombies.js` EXEC_GORE, read-only reference).

**Speed setting:** 1×, 1.5×, 2× or skip. The next card can be played as soon as the hit lands, and zombies act together.

## Phone screen (landscape)

- **Stage:** heroes left, zombies right.
- **Zombies:** intent and HP above each one.
- **Heroes:** HP and block under their feet.
- **Hand:** one straight row of 5 cards along the bottom.
- **Controls:** energy and draw pile bottom-left; discard and a big End Turn button bottom-right.
- **Playing cards:** drag up to play, tap to read. A tap never plays a card.
- **Card art:** stills from the animation clips, all with the same camera, light, grade and frame.

## Family: their own card sets

Marc's idea, the same pattern as Monster Train's clans and Cobalt Core's crew.

- **Joining a run:** you choose who comes along, and **their own card set joins the deck for that run**. Their 3 starter cards replace 3 basics, so the deck stays at 12, plus about 9 cards in the reward pool.
- **One clear style each,** for example traps, speed, or shielding. Who does what is Marc's call.
- **Utility cards, not top damage:** draw, cleanse, block on either hero. A weak set then never feels bad for the person it's based on.
- **Their cut-ins trigger something real on stage,** so they don't look cheap next to the 3D heroes. For example, a thrown medkit, barbed wire, or Marc's phone-call clip.
- **Start small:** the kids' 1–2-card "help from home" set first, then add family sets one at a time.
- **Unlocking:** one set from the start, more through milestones such as a rescue event, not scrap.

## First playable (cut)

- **In:** energy, intents, block, stagger and break, the Second Wind and downed rules, a duo card, one floor of about 8 rooms, about 25 cards, walker, nurse, sprinter and the Shield Guard, card removal and upgrades, auto-save.
- **Not yet:** family sets, scrap and weapon upgrades, infection levels, trinkets.

## Decided (2026-10-23)

- **One shared deck.**
  - Safety nets: every reward offers a card per hero, and some cards draw a named hero's card.
  - Separate decks were set aside: two hands on a small screen, more deck-building, and harder to add family sets.
- **What carries between runs:** currency and upgrades only. Nothing story-like is left behind.
- **Family:** each person brings their own card set for the mission.

## Open questions for Marc

1. Who and what are the floor bosses, the events and the story beats?
2. Which family members get card sets, and what's each one's style?
3. Should mastery goals unlock looks only, or small upgrades too?
