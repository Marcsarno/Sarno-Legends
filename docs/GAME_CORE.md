# Sarno Legends: the core plan (start here)

Decided with Marc on 2026-10-23 ("I like it now").

- **The base:** copy Slay the Spire's proven rules and numbers, and add a small spin of our own. Marc: "I would rather copy something proven that works. And add a slight spin to it."
- **Not the goal:** novelty. Marc: "I don't need to do something new no other game does."
- **How to read this page:** where it disagrees with an older doc, this page wins.

Older docs:
- `DECKBUILDER_PLAN.md`: the bigger card plan. Mostly parked.
- `COMBAT_DESIGN.md`: the turn-based design, superseded.

Copying how a game plays is normal. **Don't copy Slay the Spire's card names, text or art.**

Numbers marked **[StS, memory]** are Slay the Spire values recalled from memory. Check them against the wiki (slaythespire.wiki.gg) before building; that's a fast win.

## Pitch

**A Slay the Spire-style deckbuilder starring Marc and Yola.**
- Marc staggers the zombies and Yola cashes in.
- Every kill plays one of the real finisher and death animations.
- Every hit point you spend getting through the hospital is one you won't have at the boss.

## Three pillars (they settle yes/no arguments and stop drift)

1. **Both heroes matter.**
   - Marc's heavy hits make a zombie Vulnerable, and many of Yola's cards hit harder on a Vulnerable zombie.
   - Both can deal damage, so a hand is never dead.
   - The roles come from Marc's early ask: Marc tank or damage, Yola heals, buffs and some damage.
2. **The kill is the show.**
   - The killing blow picks the death animation.
   - A kill on a Vulnerable zombie plays a finisher.
   - The animations are the payoff, and they never slow a turn down.
3. **Every hit point is a choice.**
   - Zombies always show their next move and its damage.
   - Damage is never random, and healing is scarce.
   - HP carries from room to room. Marc: "even the easy ones, you can want to conserve HP."

Family, weapons and painted rooms are content. They serve the pillars rather than being pillars themselves.

## Copied from Slay the Spire (the proven base)

**Turn**
- 3 energy and 5 cards drawn per turn [StS, memory].
- Unplayed cards are discarded at end of turn. When the draw pile runs out, the discard pile is reshuffled.
- Block lasts until your next turn.

**Statuses**
- Vulnerable: takes +50% damage.
- Weak: deals −25% damage.
- Strength: + damage per hit.

[StS, memory]

**Intents**
- Every enemy shows its next move: attack and damage, block, buff, debuff, or unknown.
- Enemy moves follow constrained-random patterns. Example: Jaw Worm never uses Bellow twice in a row, never Thrash three times in a row, never Chomp twice ([slaythespire.gg](https://slaythespire.gg/monsters/Jaw_Worm)).
- Elites and bosses use fixed cycles.

**Rewards**
- After a fight: gold, sometimes a potion, and a pick of 1 of 3 cards or skip.
- Card rarity:
  - normal fights: 60/37/3 common/uncommon/rare
  - elites: 50/40/10
  - bosses: always rare
  - a rare chance that rises after each common (pity)
  - ([wiki](https://slay-the-spire.fandom.com/wiki/Card_Rewards))
- Potion drop about 40% after a fight, adjusted up or down by ±10% each time [StS, memory]. 3 potion slots.

**Map (one act = one hospital floor)**
- About 15 rows plus the boss, with branching paths ([wiki](https://slaythespire.wiki.gg/wiki/Map_Generation)).
- Room odds: fight 53%, elite 8%, rest 12%, shop 5%, unknown 22%.
- Fixed rows:
  - row 1 is always fights
  - about halfway is a treasure row
  - the row before the boss is always rest sites
- Placement rules [StS fan guide, verify]:
  - no elites or rests before row 6
  - no two shops, rests or elites in a row on one path
- The boss is shown at the top of the map from the start.

**Rest site**
- Heal 30% of max HP **or** upgrade one card [StS, memory].

**Shop**
- Buy cards, potions and relics.
- Remove a card: 75 gold the first time, +25 each time after [StS, memory].

**Gold**
- Start with 99.
- Normal fight 10–20, elite 25–35, boss about 100.
- [StS, memory]

**Relics**
- One starter relic.
- Elites and treasure give relics; bosses let you choose one of 3 boss relics.

**Encounter pools**
- The first 3 fights of act 1 come from an easy pool, later ones from a hard pool ([Steam guide quote](https://steamcommunity.com/app/646570/discussions/0/3809531058952880820)).

**Between acts**
- The party heals fully [StS, memory]. Ascension 5 makes that 75% of missing HP.

**Ascension ladder** (later)
1. more elites
2. normal enemies hit harder
3. elites hit harder
4. bosses hit harder
5. post-boss heal 75%
6. start 10% hurt
7. and up: more enemy HP …

([TrueAchievements](https://i1.trueachievements.com/game/Slay-The-Spire/walkthrough/2)). We'd call them infection levels.

## Our spins (small, on purpose)

1. **Two heroes, one deck, one HP bar.**
   - Every card belongs to Marc (red frame) or Yola (teal frame), and that hero plays its animation.
   - **HP and block are shared by the party**, exactly like Slay the Spire's math. This was recommended as the most proven option and accepted with the direction; confirm it in the paper test.
   - Separate HP per hero (Roguebook-style, "protect Yola") was considered and set aside as more rules and less proven.
2. **Marc staggers, Yola cashes in.**
   - Marc's heavy cards apply **Vulnerable**. We call it "Staggered" on the card; it's the same rule.
   - Several of Yola's cards add damage or effects against Vulnerable zombies.
   - It's a soft split: both heroes deal damage, so there are no dead hands. The earlier hard split (only Marc breaks, only Yola finishes) was dropped for this.
3. **The kill is the show.**
   - The card that lands the killing blow picks the death animation. The zombies have about 6 deaths each:
     - a light hit gives a collapse (`death_forward`, `death_back`)
     - a pistol headshot drops it to its knees (`death_headshot_knees`)
     - a heavy hit or shotgun throws it back (`death_chest_back`, `death_hit_back`)
   - A kill on a Vulnerable zombie plays an **execution finisher**: Marc's `hub_execution_*` clips, or the yola-zombie gore and burst system, since the finishers have no zombie victim clips.
   - Presentation only to start. An optional bonus (draw 1 on a finisher) is something to test, not decided.
4. **Yola's healing is her starter relic.**
   - "Nurse's Kit": heal 6 HP at the end of every fight. That's Slay the Spire's Ironclad starter relic (Burning Blood) in a nurse's hands, a proven number.
   - A few rare Yola cards heal more, but they're scarce and usually exhaust.
5. **Theme mapping** (same mechanics, new skin):

| Slay the Spire | Sarno Legends |
|---|---|
| Acts | Hospital floors (floor 1 lobby/ER, then wards, then basement are label ideas; the story is Marc's) |
| Rest site | Supply closet |
| Shop | Pharmacy (James's shop-counter clips could run it) |
| Gold | Supplies |
| Potions | Medkit (heal), adrenaline (energy or revive), extinguisher (enemies Weak) |
| Relics | Things found in the hospital (props are cheap to make) |
| Unknown rooms | Locked rooms (events; Marc decides the story ones) |
| Card unlocks between runs | Weapon tiers (see between runs) |

## Starting numbers (copied from Slay the Spire's Ironclad, mapped to the couple)

**Party:** 80 HP, starting gold 99, starter relic Nurse's Kit [StS: Ironclad 80 HP, Burning Blood heals 6].

**Starter deck: 11 cards.**
- Ironclad's 10: 5 Strikes, 4 Defends, Bash.
- Plus one Yola signature card.

| Card | Hero | Cost | Effect | StS source | Animation |
|---|---|---|---|---|---|
| Bat Swing ×3 | Marc | 1 | 6 damage | Strike | `bat_swing` (2.0 s as is; trim or speed up) |
| Pistol Shot ×2 | Yola | 1 | 6 damage | Strike | pistol idle + procedural recoil (no licence question) |
| Brace ×2 | Marc | 1 | 5 block | Defend | `ual_Sword_Block` |
| Sidestep ×2 | Yola | 1 | 5 block | Defend | `ual1_Dodge_Left/Right`, `ual1_Roll` |
| Home Run | Marc | 2 | 8 damage, apply 2 Vulnerable (Staggered) | Bash | home-run swing (FBX exists, bake onto Marc) |
| Clean Shot | Yola | 1 | 5 damage; +5 if the target is Vulnerable | our spin | pistol |

**Early reward-card ideas** (StS-style templates, our names, not tuned):

*Marc:*
- **Shotgun Blast** (2): 10 damage to all.
- **Crowbar Pry** (1): 6 damage, 1 Vulnerable.
- **Hold the Line** (1): 8 block.
- **Sledgehammer** (2): 14 damage, Vulnerable 2.
- **Batter Up** (2): 8 damage twice. If the target is Vulnerable, also draw 1. The duo idea as a single card.

*Yola:*
- **Double Tap** (1): 4 damage twice.
- **Triage** (1): heal 4, exhaust.
- **Adrenaline Shot** (0): gain 1 energy, exhaust.
- **Cover Him** (1): 7 block, draw 1.
- **Headshot** (2): 12 damage; doubled on a Vulnerable zombie.

The card-pool research proposed two build styles per hero (Marc: Breaker / Bulwark; Yola: Triage / Marksman). Those lists are in `RESEARCH_DETAIL.md`, to be fitted to these rules.

## Zombies (Slay the Spire act-1 templates, re-skinned)

Starting points [StS, memory], to check against the wiki.

| Zombie | Template | HP | Moves |
|---|---|---|---|
| Walker | Jaw Worm | 40–44 | Chomp 11; Shamble 7 + 5 block; Groan +3 Strength (with Jaw Worm's no-repeat rules) |
| Small walkers (in groups of 2–3) | Louse | 10–15 | Bite 5–7. Teaches groups |
| Sprinter | Louse / Fungi beast, fast | 12–16 | Lunge 6. It's the "kill it first" pressure |
| Nurse | Darkling's revive (act 3 in StS) | about 30 | Jab 5. Kneels to revive a fallen zombie unless the last two die in the same turn. This is a proven revive rule. |
| **Elite: Big Walker** | Gremlin Nob | 82–86 | Gets stronger whenever you play a skill (block). Punishes turtling |
| **Elite: Sleeping Patient** | Lagavulin | about 110 | Asleep and armoured for up to 3 turns, then heavy hits that drain Strength. Set up, then burst |
| **Boss: Shield Guard** | The Guardian | about 240 | Shield mode = The Guardian's defensive mode (thorns-like shield, rolling bash). His mode shift after a damage threshold is when the **arm comes off**. Offensive mode: Fierce Bash 32, Vent (Weak + Vulnerable on you), Whirlwind 5×4. At 0 HP the **head comes off** (finisher) |

Later, once the core is proven:
- More enemy types: the chapter-2 **looters** (pistol, cover = block, reload = a free turn for you) and the **zombified survivors** (Bryce, David, Remy).
- More bosses, for example a looter leader, or Adam turning mid-fight (he has both pistol and zombie clips).

## Between runs (meta)

- **Slay the Spire's own rule:** unlock new cards over time, never raw power.
- **Our version:**
  - **Scrap**, earned every run, wins and losses, with no toll, buys **weapon tiers**: bat → nail bat → wire-and-tape bat.
  - Each tier swaps or adds Marc cards (for example nails add bleed cards) and changes the bat's look.
  - Starting numbers: fight 8, elite 20, boss 40, floor cleared +15; nail bat 80, wire bat 200.
- **Infection levels** (Ascension) come after a first clear.
- **If a change ever weakens a weapon, refund its scrap.**

## Family (parked until the core is fun)

- **Recommended: one call-in card per run.** You choose who comes along, and their painted portrait cut-in plays one effect. It's cheap and personal, and nobody's card can feel weak.
- **Marc's bigger idea, each family member bringing their own card set for the mission, is parked.** It's about 12 cards plus a portrait per person.
- The kids "at home" could give one small buff.
- Who's who is Marc's call.

## Presentation

- **Screen:** landscape. Painted room, heroes on the left, zombies on the right with their intents above them.
- **Hand:** one straight row of cards along the bottom.
- **Controls:** energy bottom-left, End Turn bottom-right. Drag up to play a card; tap to read it.
- **Pacing:**
  - Basic cards take about 0.5–0.6 s; the hit lands around 0.25–0.3 s.
  - Five cards take about 4–5 s.
  - The next card can be played as soon as the hit lands.
  - Zombies act together.
  - The finisher is the one long beat: 2–3 s at most, and shorter once you've seen it.
- **Speed setting** (1×, 1.5×, 2×) from day one.
- **Marc fights from a forward melee spot,** so there's no walking back and forth.
- **Card art:** stills from the animation clips, all with the same camera, light and frame.

## First steps

1. **Check the [StS, memory] numbers** above against the Slay the Spire wiki.
2. **Paper test, one evening, with Yola and one kid:**
   - **Setup:** the 11-card starter deck on index cards, one shared HP of 80 tracked with dice, and the zombies' intents written on cards.
   - **Fights:** 3 small walkers, then Walker + Nurse, then the Big Walker (elite).
   - **Count:** turns where the hand felt useless, and whether Clean Shot after Home Run felt good.
   - **Fun looks like:** planning out loud ("Home Run him, then I Clean Shot"), arguing about killing the nurse first, and asking to play again.
3. **One fight on the phone:** the same deck against 2 walkers, with real clips and logging. This tests pacing (2.0 s clips need trimming) and the finisher feel.
4. **Then floor 1:** the map, rewards, rest, shop, the elite and the Shield Guard. Play it with 5–8 family testers.

**Balancing method (from research):**
- **Log from day one:** card offered, picked or skipped; each fight's turns, HP lost and killing card; each run's floor reached and cause of death.
- **A headless sim** with random, greedy and sensible bots.
- **Targets:**
  - normal fight 5–15% HP lost
  - elite 20–30%
  - boss 30–45%
  - reach the boss with 40–60% HP
  - new players win about 40% of first runs
- **Reading the data:**
  - A card taken less than ~10% of the time is dead.
  - A win rate 15+ points above average is suspect: check with the sim first.
  - Prefer buffs over nerfs.
  - Leave a few broken combos in on purpose.
- **Don't compete on:** card count (25 first, 60–80 eventually) or piles of systems.

## Open (Marc's calls)

- Story: why Marc and Yola are together in the hospital, the floor bosses beyond the Shield Guard, and the events.
- Which family members, and what each one's call-in does.
- Which chapter-2 people are enemies, which are friendly faces (shop, events), and which could be bosses.
- Licences: the `t_` clips and the Unity store characters (see `ASSETS.md`).
