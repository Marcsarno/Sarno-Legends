# StS numbers check (Ascension 0)

Checked 2026-10-23 against `BUILD_SPEC.md` sections 3-5 and `GAME_CORE.md`. Apply the "Corrections to apply" list at the bottom to `BUILD_SPEC.md` (it already says to).

## How this was checked, and its limits

- WebFetch could not open any host in this sandbox (every URL failed DNS), and a direct request to slaythespire.wiki.gg was refused by the egress proxy. So **no page was read in full**. Every value below comes from WebSearch result text that quoted the named wiki page (slaythespire.wiki.gg, slay-the-spire.fandom.com, slaythespire.gg), cross-read where two wikis were returned.
- Confidence tags in the verdict column:
  - **[W]** the value was stated in search excerpts of the wiki page in the Source column.
  - **[M]** not found in the excerpts; it is my memory of the game's behaviour. Treat as unverified and re-check on the wiki before building on it.
  - **[X]** sources disagree or are silent; the note says how.
- Most sources mix Slay the Spire 1 and Slay the Spire 2 pages. Only StS1 values are used here; StS2 differences are mentioned only where they could mislead.
- Where the wiki.gg `Map_Generation` page was reachable only through summaries, the map-rule detail comes from two fan guides (KosGames, a Steam guide copy) that repeat the same text. They are one underlying source, not two.

---

## 1. Turn, rest, gold

| item | our value | StS value | source | verdict |
|---|---|---|---|---|
| Energy per turn | 3 | 3 | https://slay-the-spire.fandom.com/wiki/Energy | ok [W] |
| Cards drawn per turn | 5 | 5 | https://slaythespire.wiki.gg/wiki/Mechanics | ok [W] |
| Hand limit | 10; extra draws skipped | 10; a draw that would exceed it leaves the cards in the draw pile | https://slaythespire.wiki.gg/wiki/Mechanics | ok [W]. Created cards that don't fit go to the discard pile [M] |
| End of turn | hand discarded except Retain; discard reshuffles when draw is empty | same; Ethereal cards exhaust | https://slay-the-spire.fandom.com/wiki/Gameplay | ok [W] |
| Player Block | clears at start of the player's turn | removed at the start of your next turn (Barricade is the exception) | https://slaythespire.wiki.gg/wiki/Keywords | ok [W]. Enemy block clearing at the start of its own turn is [M] |
| Starting HP / starter relic | 80 HP; Nurse's Kit heals 6 | Ironclad 80 HP; Burning Blood heals 6 at end of combat | https://slaythespire.wiki.gg/wiki/Ironclad | ok [W] |
| Starting gold | 99 | 99 | https://slaythespire.wiki.gg/wiki/Gold | ok [W] |
| Gold, normal fight | 10-20 | 10-20 | https://slaythespire.wiki.gg/wiki/Monsters | ok [W] |
| Gold, elite | 25-35 | 25-35 | https://slaythespire.wiki.gg/wiki/Elites | ok [W] |
| Gold, boss | 95-105 (spec section 5: 95-105) | 95-105 after the Act 1 / Act 2 boss (the fandom Gameplay page says a looser "90-110"; use 95-105) | https://slaythespire.wiki.gg/wiki/Monsters | ok [W] |
| Rest heal | 30% max HP | 30% of max HP, rounded down | https://slaythespire.wiki.gg/wiki/Rest_Sites | ok [W]. Use floor |
| Rest alternative | Patch Up = upgrade a card | Smith = upgrade a card (once per card) | https://slaythespire.wiki.gg/wiki/Rest_Sites | ok [W] |
| Heal between acts | full | A0: full heal at start of next act. Ascension 5: 75% of missing HP | https://slay-the-spire.fandom.com/wiki/Ascension | ok [W] |
| Card removal | 75, +25 each time | 75, +25 each purchase, one removal per shop | https://slaythespire.wiki.gg/wiki/The_Merchant | ok [W] |
| Doctor's Note (Smiling Mask) | removal always 50 | always 50; Membership Card and Courier no longer lower it | https://slaythespire.wiki.gg/wiki/Smiling_Mask | ok [W] |

## 2. Shop

| item | our value | StS value | source | verdict |
|---|---|---|---|---|
| Cards on shelf | 5 (2 Marc, 2 Yola, 1 any) | 5 class cards (always 2 Attack, 2 Skill, 1 Power) **plus 2 colorless** (one uncommon, one rare) | https://slaythespire.wiki.gg/wiki/The_Merchant | ok with a known deviation: we have no colorless pool. Optional: type the 5 slots as 2 Attack / 2 Skill / 1 Power instead of by hero |
| Sale | one card at 50% | one class card always 50% off | https://slaythespire.wiki.gg/wiki/The_Merchant | ok [W] |
| Relics / potions | 3 relics (one shop relic), 3 potions | 3 relics (rightmost is the shop-only relic; other two roll common/uncommon/rare 50/33/17), 3 potions | https://slay-the-spire.fandom.com/wiki/Merchant | ok [W] |
| Card price, common | 45-55 | 45-55 | https://slaythespire.wiki.gg/wiki/The_Merchant | ok [W] |
| Card price, uncommon | 68-82 | 68-82 on one wiki, 68-83 on another (rounding) | https://slay-the-spire.fandom.com/wiki/Merchant | ok [X] |
| Card price, rare | 135-165 | 135-165 | https://slaythespire.wiki.gg/wiki/The_Merchant | ok [W] |
| Relic price, common | 143-157 | 143-157 (one wiki 143-158) | https://slaythespire.wiki.gg/wiki/The_Merchant | ok [W] |
| Relic price, uncommon | 238-262 | 238-262 (one wiki 238-263) | https://slaythespire.wiki.gg/wiki/The_Merchant | ok [W] |
| Relic price, rare | 285-315 | 285-315 | https://slaythespire.wiki.gg/wiki/The_Merchant | ok [W] |
| Shop relic price | 143-157 | 143-158 (a 2.0 patch raised base to 200, a later patch reverted to 150) | https://slaythespire.wiki.gg/wiki/The_Merchant | ok [W] |
| Potion price, common | 48-52 | 48-53 | https://slaythespire.wiki.gg/wiki/The_Merchant | fix: 48-53 |
| Potion price, uncommon | 72-78 | 71-79 | https://slaythespire.wiki.gg/wiki/The_Merchant | fix: 71-79 |
| Potion price, rare | 95-105 | 95-105 | https://slaythespire.wiki.gg/wiki/The_Merchant | ok [W] |
| Staff Badge (Membership Card) | pharmacy prices -50% | 50% off all products; shop-only relic | https://slaythespire.wiki.gg/wiki/Membership_Card | ok [W] |

## 3. Rewards and odds

| item | our value | StS value | source | verdict |
|---|---|---|---|---|
| Cards per reward | 3, skippable | 3, skippable (the wiki excerpts show Skip; the count of 3 was not restated) | https://slay-the-spire.fandom.com/wiki/Card_Rewards | ok [M] |
| Card rarity, normal fight | 60 / 37 / 3 | 60 / 37 / 3 (common / uncommon / rare) | https://slay-the-spire.fandom.com/wiki/Card_Rewards | ok [W] |
| Card rarity, elite | 50 / 40 / 10 | 50 / 40 / 10 | https://slay-the-spire.fandom.com/wiki/Card_Rewards | ok [W] |
| Card rarity, boss | all rare (3 cards) | choice of 3 Rare cards (plus a boss-relic pick of 3) | https://slaythespire.wiki.gg/wiki/Bosses | ok [W]. Our boss ends the act, so unused |
| Rare pity offset, start | -5 | -5 | https://slay-the-spire.fandom.com/wiki/Card_Rewards | ok [W] |
| Pity step | +1 per common rolled | +1 each time a common is rolled | https://slay-the-spire.fandom.com/wiki/Card_Rewards | ok [W] |
| Pity reset | to -5 on a rare | to -5 | https://slay-the-spire.fandom.com/wiki/Card_Rewards | ok [W] |
| Pity cap | none stated | caps at +40 | https://slay-the-spire.fandom.com/wiki/Card_Rewards | fix: cap offset at +40 |
| How the offset is applied | "60/37/3 + pity offset" | rare chance = base rare + offset; if that goes below 0, the shortfall is taken from uncommon. So at the start of a run (offset -5): normal = 65 common / 35 uncommon / 0 rare; elite = 55 / 40 / 5 | https://slay-the-spire.fandom.com/wiki/Card_Rewards | fix: implement as stated; the first normal reward cannot be rare |
| Shop cards and pity | not stated | shop cards (and The Library event's cards) use the rare chance but do not move the offset | https://slay-the-spire.fandom.com/wiki/Card_Rewards | fix: shop rolls must not change the offset |
| Upgraded reward cards | none in act 1 | Act 1 0%, Act 2 25%, Act 3 50% | https://slay-the-spire.fandom.com/wiki/Card_Rewards | ok [W] |
| Potion drop chance | 40% | 40%, resets at the start of each act | https://slaythespire.wiki.gg/wiki/Potions | ok [W] |
| Potion chance step | +/-10 (dropped / not) | drop: -10; no drop: +10 | https://slaythespire.wiki.gg/wiki/Potions | ok [W]. Clamp to 0-100 (no clamp is documented) |
| Elite potion bonus | none | StS1 pages do not mention one. The StS2 wiki gives elites +12.5%. | https://slaythespire.wiki.gg/wiki/Potions | ok [X]. Optional: +12 for elites; I recall the StS1 code having it, but it is unverified here |
| Potion rarity | 65 / 25 / 10 | 65 / 25 / 10 | https://slaythespire.wiki.gg/wiki/Potions | ok [W] |
| Elite relic rarity | common 50 / uncommon 33 / rare 17 | 50 / 33 / 17 | https://slaythespire.wiki.gg/wiki/Relics | ok [W] |
| Treasure chest relic rarity | same 50 / 33 / 17 | depends on chest size: small 75 / 25 / 0, medium 35 / 50 / 15, large 0 / 75 / 25 | https://slaythespire.wiki.gg/wiki/Relics | fix: roll the chest size first |
| Chest size odds | not modelled | small 50%, medium 33%, large 17% | https://slay-the-spire.fandom.com/wiki/Chest | fix: add |
| Chest gold | "25-35 supplies" always | gold is not guaranteed: small 50% chance of 23-27, medium 35% chance of 45-55, large 50% chance of 68-82 (wiki.gg says 23-28 and 68-83) | https://slay-the-spire.fandom.com/wiki/Chest | fix: use these chances and amounts [X on +/-1] |
| "?" room odds | fight 10 (+10), treasure 2 (+2), shop 3 (+3), else event | Monster 10% (+10 each "?" without one), Treasure 2% (+2), Shop 3% (+3), otherwise Event; a type resets to its base when it is rolled | https://slay-the-spire.fandom.com/wiki/Unknown_Location | ok [W]. Cap the three at 100 total |
| Events repeat | no repeats in a run | events are not repeated within a run [M] | https://slaythespire.wiki.gg/wiki/Events | ok [M] |

## 4. Map generation

| item | our value | StS value | source | verdict |
|---|---|---|---|---|
| Grid | 7 columns, 15 rows + boss | 7 x 15 grid; boss after floor 15 | https://steamcommunity.com/sharedfiles/filedetails/?id=2830078257 (removed guide, copy seen via search) | ok [W] for 7x15; the boss as floor 16 is [M] |
| Paths | 6 from row 1 | 6 paths, drawn without crossing; unused rooms dropped | same | ok [W] |
| Fixed rows | row 1 fights, row 9 treasure, row 15 rest | floor 1 ordinary combat (easy pool), floor 9 all treasure, floor 15 all rest | https://slaythespire.wiki.gg/wiki/Map_Generation | ok [W] |
| Room odds | shop 5, rest 12, event 22, elite 8, else fight | Normal 53, Elite 8, Rest 12, Merchant 5, Unknown 22 | https://slaythespire.wiki.gg/wiki/Map_Generation | ok [W]. Treasure appears only on its fixed row or from "?" |
| No elite/rest early | none before row 6 | elites and rest sites not allowed below floor 6 | https://kosgames.com/slay-the-spire-map-generation-guide-26769/ | ok [W] |
| Rest on row 14 | not stated | rest sites cannot be on floor 14 (the row before the all-rest floor 15) | https://kosgames.com/slay-the-spire-map-generation-guide-26769/ | fix: add "no rest on row 14" |
| Consecutive rooms | no two elites / rests / shops in a row on a path | elite, merchant and rest cannot be directly connected to a room of the same kind. Treasure belongs to this rule in the code [M] | https://kosgames.com/slay-the-spire-map-generation-guide-26769/ | ok [W] |
| Siblings | siblings from one parent get different types | a room with two or more outgoing paths must lead to different room types | https://kosgames.com/slay-the-spire-map-generation-guide-26769/ | ok [W]. In the code it covers rest, fight, event, elite, shop [M] |
| Rule failure | not stated | a type that breaks a rule is re-rolled | https://kosgames.com/slay-the-spire-map-generation-guide-26769/ | ok [W] |
| Odds meaning | per-node odds (implied) | the percentages are shares of the whole map handed out and re-rolled on violations, not independent per-node rolls (I recall the code allocating counts) | https://slaythespire.wiki.gg/wiki/Map_Generation | ok [X]. A count-based fill gives a steadier map; per-node rolls need the same rules to work |
| Ascension 1 elites | not modelled | 8% -> 16% elites, fights 53% -> 45% (wiki says "about +60%") | https://kosgames.com/slay-the-spire-map-generation-guide-26769/ | later; [X] on exact figure |
| Boss visible | from the start | boss shown at the top of the map | https://slaythespire.wiki.gg/wiki/Map_Locations | ok [W] |

## 5. Encounter pools (Act 1)

| item | our value | StS value | source | verdict |
|---|---|---|---|---|
| First 3 fights | easy pool: shambler_solo, screamer_solo, biter_pair, two_biters | weak pool: Cultist, Jaw Worm, 2 Louse, Small Slimes, weight 2 each (25% each) | https://slaythespire.wiki.gg/wiki/Exordium | ok [W] |
| Later fights | hard pool (7 listed, unweighted) | strong pool by weight: Gremlin Gang 1, Large Slime 2, Swarm of Slimes 1, Blue Slaver 2, Red Slaver 1, 3 Louse 2, 2 Fungi Beasts 2, Exordium Thugs 1.5, Exordium Wildlife 1.5, Looter 2 (sum 16) | https://slaythespire.wiki.gg/wiki/Exordium | ok. Weights are optional; ours are a re-skin |
| Repeat rule | no repeat of the previous two encounters | the same encounter cannot come up again within the next 2 monster encounters | https://slaythespire.wiki.gg/wiki/Monsters | ok [W] |
| First-hard-fight limits | none | 3 Louse can't follow 2 Louse; Large Slime / Swarm can't follow Small Slimes; Exordium Thugs can't follow Looter | https://slaythespire.wiki.gg/wiki/Exordium | optional: mirror as "no `three_biters` right after `biter_pair`" |
| Elite pool | big_walker, sleeping_patient, orderlies; no same elite twice in a row | Gremlin Nob, Lagavulin, 3 Sentries. A forum post says 1 in 3 each; the no-repeat rule was not confirmed | https://slay-the-spire.fandom.com/wiki/Act_1 | ok [X]. Our no-repeat rule is fine as a design choice |

## 6. Status math

| item | our value | StS value | source | verdict |
|---|---|---|---|---|
| Vulnerable | takes 50% more attack damage | 50% more damage from Attacks only (not Poison, Thorns, orbs) | https://slaythespire.wiki.gg/wiki/Vulnerable | ok [W]. So Box Cutter damage, Bleed and Spiked ignore it |
| Weak | deals 25% less | 25% less Attack damage (not Poison/Thorns) | https://slaythespire.wiki.gg/wiki/Weak | ok [W] |
| Frail | 25% less block from cards | 25% less Block from cards; not from relics, Metallicize, Plated Armor; rounds down (a 5 Defend gives 3) | https://slay-the-spire.fandom.com/wiki/Frail | ok [W]. Keep Plating, Riot Vest and Duct Tape unaffected |
| Damage order | base (+Strength per hit) -> x0.75 Weak -> x1.5 Vulnerable -> floor, min 0 | Strength is added first, then the multipliers (6+2)x1.5 = 12, not 6x1.5+2 = 11. Rounding: StS1 floors the result (9 on Vulnerable = 13). StS2 wiki example: 9 x 0.75 x 1.5 = 10.125 -> 10. | https://slay-the-spire.fandom.com/wiki/Vulnerable | ok [W]. One floor at the end, as we do |
| Block order | base + Agility -> x0.75 Shaken -> floor | Dexterity adds to card block, Frail multiplies, floor. The excerpts don't state the order | https://slay-the-spire.fandom.com/wiki/Frail | ok [M] |
| Hollow Points | x1.75 | x1.75 (Paper Phrog: 50% -> 75%) | https://slaythespire.wiki.gg/wiki/Paper_Phrog | ok [W] |
| Stacking | stacks add turns | extra stacks extend duration, not intensity | https://slaythespire.wiki.gg/wiki/Vulnerable | ok [W] |
| When Vulnerable / Weak / Frail tick down | at the end of the **owner's own turn** (the party's at the end of the player turn, an enemy's at the end of the enemy turn) | all of them tick at the **end of the round**, i.e. after the enemies' turn, for both sides. A debuff an enemy applies during its own turn skips that round's tick [M], so the party keeps it through the next player turn and the next enemy turn. | https://slay-the-spire.fandom.com/wiki/Vault (lists the three as "End of Round") | **fix: tick the party's debuffs after the enemy turn, and skip a debuff applied during that same enemy turn.** Why it matters: Staggered 2 on the party (Big Walker's Headbutt, the Shield Guard's Pepper Spray) should boost two enemy turns, not one. Weak and Shaken on the party last the same number of player turns either way. Enemy-side ticking already matches |
| Bleed (Poison) | lose N at the start of owner's turn, N-1, ignores block | StS Poison does this | https://slaythespire.wiki.gg/wiki/Poison | ok [M] |
| Frenzy (Ritual) | gain N Strength at end of own turn, skips the turn it was gained | Cultist: Incantation turn 1, Dark Strike 6 on turn 2, then 9, 12 | https://slaythespire.wiki.gg/wiki/Cultist | ok [M] (progression matches) |
| Strength (Pumped) | Flex-style temporary Strength lost at end of turn | Flex gives Strength and a Strength Down that removes it at end of turn | https://slaythespire.wiki.gg/wiki/Flex | ok [W] |

## 7. Monsters (A0)

| item | our value | StS value | source | verdict |
|---|---|---|---|---|
| Shambler HP | 40-44 | Jaw Worm 40-44 | https://slaythespire.wiki.gg/wiki/Jaw_Worm | ok [W] |
| Shambler moves | Bite Down 11; Shamble 7 + 5 block; Groan +3 Str, 6 block | Chomp 11; Thrash 7 + 5 block; Bellow +3 Strength, 6 block | https://slaythespire.wiki.gg/wiki/Jaw_Worm | ok [W] |
| Shambler AI | first Bite Down; then Groan 45 / Shamble 30 / Bite 25; no Groan twice, no Shamble 3x, no Bite Down twice | opening Chomp; then Bellow 45 / Thrash 30 / Chomp 25; no Bellow twice, no Thrash 3x, no Chomp twice | https://slay-the-spire.fandom.com/wiki/Jaw_Worm | ok [W]. wiki.gg gives conditional odds (after Chomp: 59 Bellow / 41 Thrash; after 2 Thrash: 64 / 36). Renormalising the weights gives 60 / 40 and 56 / 44: close enough |
| Biter HP / bite | 10-15; Bite 5-7 fixed per zombie | Red Louse 10-15; Bite 5-7 rolled at fight start | https://slaythespire.wiki.gg/wiki/Louses | ok [W] |
| Biter moves / AI | Grow +3 Str; Bite 75 / Grow 25; not the same move 3x | Grow +3 Strength; Bite 75 / Grow 25; same move not 3x in a row | https://slay-the-spire.fandom.com/wiki/Louses | ok [W] |
| Hunch (Curl Up) | 3-7 block the first time it takes attack damage | Curl Up 3-7 block on the first hit; a multi-hit attack must land all its hits before it triggers | https://slaythespire.wiki.gg/wiki/Louses | ok [W]. Decide whether multi-hit cards trigger it after the last hit (StS) or the first |
| Spitter HP / moves | 11-17; Bite 5-7; Spit 2 Weakened; Bite 75 / Spit 25; not 3x | Green Louse 11-17; Bite 5-7; Spit Web 2 Weak; 75 / 25; not the same move 3x | https://slay-the-spire.fandom.com/wiki/Louses | ok [W] |
| Screamer HP / moves | 48-54; turn 1 Shriek (Frenzy 3), Claw 6 every turn | Cultist 48-54; Incantation (Ritual 3), Dark Strike 6 | https://slaythespire.wiki.gg/wiki/Cultist | ok [W] |
| Sprinter | 14-18 HP, Lunge 9 every turn (GAME_CORE says 12-16, Lunge 6) | Sneaky Gremlin 10-14 HP, Puncture 9 every turn | https://slaythespire.wiki.gg/wiki/Gremlins | fix: HP 10-14 if a straight copy; and make GAME_CORE agree (Lunge 9, not 6) |
| Bloater | 22-28; Bite 6; Grow +3; 60 / 40; no Bite 3x, no Grow 2x; death: 2 Staggered on party | Fungi Beast 22-28; Bite 6; Grow +3 Strength; 60 / 40; no Bite 3x, no Grow twice; Spore Cloud 2 Vulnerable on death | https://slaythespire.wiki.gg/wiki/Fungi_Beast | ok [W] |
| Nurse revive | Revive a dead zombie at 50% HP; only if one died and revives < 2; Jab 6 / Mend alternate | Darkling: when one hits 0 HP while another is alive it "regrows" and Reincarnates on its next turn at 50% max HP; if every Darkling is dead/regrowing at once they all die. Darkling HP 48-56 (Nip 7-11 or 9-13 [X], Chomp 8x2, Harden 12 block) | https://slay-the-spire.fandom.com/wiki/Darkling | ok as an adaptation (it is a support enemy, not a copy). Our cap of 2 revives is not an StS rule. Excerpts say "half of its HP": read as 50% of max HP [X] |
| Big Walker HP | 82-86 | Gremlin Nob 82-86 | https://slaythespire.wiki.gg/wiki/Gremlin_Nob | ok [W] |
| Big Walker moves | Roar (Rage 2); Charge 14; Headbutt 6 + 2 Staggered | Bellow (Enrage 2); Rush 14; Skull Bash 6 + 2 Vulnerable | https://slay-the-spire.fandom.com/wiki/Gremlin_Nob | ok [W] |
| Big Walker AI | Roar first, then Headbutt 33 / Charge 67, no Charge 3x | Bellow first, then Skull Bash 33 / Rush 67, no Rush 3x. Enrage triggers on Skills only | https://slay-the-spire.fandom.com/wiki/Gremlin_Nob | ok [W] (one page said "Attacks"; the rest and the card text say Skills) |
| Sleeping Patient HP / Plating | 109-111; Plating 8 | Lagavulin 109-111; Metallicize 8 | https://slaythespire.wiki.gg/wiki/Lagavulin | ok [W] |
| Sleeping Patient moves | Flail 18, Flail 18, Drain (-1 Strength, -1 Agility), repeat | Attack 18, Attack 18, Siphon Soul (-1 Dexterity, -1 Strength), repeat | https://slay-the-spire.fandom.com/wiki/Lagavulin | ok [W] |
| Sleeping Patient waking | asleep up to 3 turns or until it loses HP; "wakes stunned 1 turn" | Wakes at the end of its 3rd turn, or sooner when damage gets through block. **Stunned for a turn only if woken by damage.** If it wakes on its own it attacks on turn 4 unstunned. Waking removes Metallicize. Poison also wakes it and uses up the stun. | https://slaythespire.wiki.gg/wiki/Lagavulin | **fix: stun only when woken by damage; remove Plating on waking; a timer wake attacks on turn 4** |
| Orderly HP / moves | 38-42; Swipe 9; Shove adds 2 Panic to discard; Immune 1 | Sentry 38-42; Beam 9; Bolt adds 2 Dazed to discard; Artifact 1 | https://slaythespire.wiki.gg/wiki/Sentry | ok [W] |
| Orderly AI | alternate; middle starts Swipe, sides Shove | Bolt, Beam alternate; sources conflict on the middle Sentry: one says it opens with Beam, another says Bolt | https://slaythespire.wiki.gg/wiki/Sentry | ok [X]. Ours (middle opens with the damage move) matches the wiki.gg reading and is also what I recall |
| Shield Guard HP | 240 | The Guardian 240 | https://slaythespire.wiki.gg/wiki/The_Guardian | ok [W] |
| Shield Guard offensive cycle | Raise Shield 9 block -> Shield Bash 32 -> Pepper Spray (2 Weakened, 2 Staggered on party) -> Baton Flurry 5x4 | Charging Up 9 block -> Fierce Bash 32 -> Vent Steam (2 Weak, 2 Vulnerable) -> Whirlwind 5x4 | https://slaythespire.wiki.gg/wiki/The_Guardian | ok [W] |
| Mode Shift | 30 damage, then 40, 50... | Mode Shift 30; each return to Offensive adds 10. It counts HP lost, so block absorbs it. | https://slay-the-spire.fandom.com/wiki/The_Guardian | ok [W]. Spec should say "HP lost (after block)" |
| Defensive mode entry | +20 block and Spiked 3 | gains 20 Block and Sharp Hide 3 | https://slaythespire.wiki.gg/wiki/The_Guardian | ok [W] |
| Spiked in defensive mode | `thorns`: attacker takes N whenever attacked (per hit) | **Sharp Hide: deals damage whenever you play an Attack card, once per card, not per hit** (a multi-hit card triggers it once) | https://slay-the-spire.fandom.com/wiki/Thorns | **fix: trigger once per attack card played** (or accept per-hit as a deliberate change; it punishes One-Two / Triple Tap far more than StS punishes Twin Strike) |
| Defensive moves | Shield Charge 9 -> Double Slam 8x2 (loses Spiked, back to Offensive), then Baton Flurry | Roll Attack 9 -> Twin Slam 8x2 (removes Sharp Hide, back to Offensive) -> Whirlwind | https://slaythespire.wiki.gg/wiki/The_Guardian | ok [W] |

## 8. Relics

| item | our value | StS value | source | verdict |
|---|---|---|---|---|
| Nurse's Kit | heal 6 at end of combat | Burning Blood: heal 6 | https://slay-the-spire.fandom.com/wiki/Burning_Blood | ok [W] |
| Duct Tape | 10 block at combat start | Anchor: 10 Block | https://slaythespire.wiki.gg/wiki/Relics_List | ok [W] |
| Coffee Thermos | +1 energy on the first turn | Lantern: +1 Energy first turn | https://slaythespire.wiki.gg/wiki/Relics_List | ok [W] |
| Stethoscope | draw 2 more on the first turn | Bag of Preparation: draw 2 additional cards at combat start | https://slaythespire.wiki.gg/wiki/Bag_of_Preparation | ok [W] |
| Pager | 1 Staggered to ALL at combat start | Bag of Marbles: 1 Vulnerable to ALL | https://slaythespire.wiki.gg/wiki/Bag_of_Marbles | ok [W] |
| Protein Bar | 1 Strength at combat start | Vajra: 1 Strength | https://slay-the-spire.fandom.com/wiki/Vajra | ok [W] |
| Knee Brace | 1 Agility at combat start | Oddly Smooth Stone: 1 Dexterity | https://slaythespire.wiki.gg/wiki/Oddly_Smooth_Stone | ok [W] |
| Granola Bar | +7 max HP (and heal 7) | Strawberry: raise max HP by 7 | https://slay-the-spire.fandom.com/wiki/Strawberry | ok [W] |
| IV Bag | heal 2 at combat start | Blood Vial: heal 2 at combat start | https://slaythespire.wiki.gg/wiki/Blood_Vial | ok [W] |
| Coin Jar | 9 supplies per card added | Ceramic Fish: 9 gold whenever a card is added (rewards, shop, events, transforms) | https://slaythespire.wiki.gg/wiki/Ceramic_Fish | ok [W] |
| Tally Marks | every 10th attack double damage, counter | Pen Nib: 10th Attack doubled; counter carries between fights; multi-hit attacks double every hit | https://slay-the-spire.fandom.com/wiki/Pen_Nib | ok [W] |
| Riot Vest | end of turn with no block: 6 block; uncommon | Orichalcum: no Block at end of turn -> 6 Block; **common** | https://slaythespire.wiki.gg/wiki/Relics_List | ok on the number; rarity differs (StS common) [W] |
| Combo Counter | every 3rd attack in a turn: +1 Strength | Shuriken: every 3 Attacks in a turn, +1 Strength (Kunai gives Dexterity instead). Both uncommon, can trigger more than once per turn | https://slay-the-spire.fandom.com/wiki/Kunai | ok [W] (it is Shuriken; the spec's "Kunai/Shuriken" label should say Shuriken) |
| Box Cutter | every 3rd Skill in a turn: 5 to ALL | Letter Opener: every 3 Skills in a turn, 5 damage to ALL; not attack damage, so no Thorns | https://slay-the-spire.fandom.com/wiki/Letter_Opener | ok [W] |
| Door Wedge | turn 2: 14 block | Horn Cleat: start of your 2nd turn, 14 Block | https://slay-the-spire.fandom.com/wiki/Horn_Cleat | ok [W] |
| Trophy Belt | zombie dies: +1 energy, draw 1 | Gremlin Horn: enemy dies -> 1 Energy and draw 1; a kill on the enemy turn carries to your next turn | https://slay-the-spire.fandom.com/wiki/Gremlin_Horn | ok [W] |
| Emergency Rations | end of combat at 50% HP or less: heal 12 | Meat on the Bone: at or below 50% at end of combat, heal 12 | https://slaythespire.wiki.gg/wiki/Meat_on_the_Bone | ok [W] |
| Hollow Points | x1.75 Staggered; **rare** | Paper Phrog: 75%; Ironclad **uncommon** | https://slaythespire.wiki.gg/wiki/Paper_Phrog | ok on the number; rarity differs (StS uncommon) [W] |
| Steel Plate | lose 1 less HP | Tungsten Rod: rare, reduces any HP loss by 1 | https://slaythespire.wiki.gg/wiki/Relics_List | ok [W] |
| Defib Pads | once: heal to 50% when you'd die | Lizard Tail: rare, once, heal to 50% max HP | https://slaythespire.wiki.gg/wiki/Lizard_Tail | ok [W] |
| Cooler | unspent energy carries | Ice Cream: rare, energy is conserved between turns | https://slaythespire.wiki.gg/wiki/Relics_List | ok [W] |
| Staff Badge | shop relic, -50% | Membership Card: shop-only, 50% off | https://slaythespire.wiki.gg/wiki/Membership_Card | ok [W] |
| Doctor's Note | rarity "shop" | Smiling Mask is a **common** relic (elites, small/medium chests, events) and **cannot be bought** | https://slaythespire.wiki.gg/wiki/Smiling_Mask | ok on the effect; rarity differs by design. Only fix if you want it findable outside the shop |
| Other rarities | Duct Tape / Thermos / Stethoscope / Pager / Protein Bar / Knee Brace / Granola / IV Bag / Coin Jar / Tally Marks common; Door Wedge, Trophy Belt, Box Cutter, Combo Counter, Emergency Rations uncommon | Anchor, Lantern, Bag of Preparation, Bag of Marbles, Vajra, Oddly Smooth Stone, Strawberry, Blood Vial, Ceramic Fish, Pen Nib common; Kunai/Shuriken, Letter Opener, Horn Cleat, Gremlin Horn, Meat on the Bone uncommon | https://slaythespire.wiki.gg/wiki/Relics_List | ok [W] |

## 9. Cards (only where the spec's StS column claims a copy)

| item | our value | StS value | source | verdict |
|---|---|---|---|---|
| Bat Swing / Pistol Shot (Strike) | 1 cost, 6 (9) | Strike 6 (9) | https://slaythespire.wiki.gg/wiki/Ironclad | ok [W] |
| Brace / Sidestep (Defend) | 5 (8) | Defend 5 (8) | https://slaythespire.wiki.gg/wiki/Ironclad | ok [W] |
| Home Run (Bash) | 2 cost, 8 + 2 Staggered (10 + 3) | Bash 2 cost, 8 + 2 Vulnerable (10 + 3) | https://slaythespire.wiki.gg/wiki/Ironclad | ok [W] |
| Shoulder Check (Iron Wave) | 5 dmg + 5 block (7 / 7) | Iron Wave 5 / 5 (7 / 7) | https://slay-the-spire.fandom.com/wiki/Ironclad_Cards | ok [W] (shown on the StS2 list; same in StS1 by my memory) |
| Wild Swing (Cleave) | 8 ALL (11) | Cleave 8 ALL (11) | https://slay-the-spire.fandom.com/wiki/Ironclad_Cards | ok [M] |
| Heavy Swing (Heavy Blade) | 2 cost, 14, Strength x3 (x5) | Heavy Blade 14, Strength counts 3 times (5 upgraded) | https://slay-the-spire.fandom.com/wiki/Heavy_Blade | ok [W] |
| One-Two (Twin Strike) | 5 x2 (7 x2) | Twin Strike 5 x2 (7 x2) | https://slay-the-spire.fandom.com/wiki/Ironclad_Cards | ok [W] |
| Hold the Line (Shrug It Off) | 8 block, draw 1 (11) | Shrug It Off 8 block, draw 1 (11) | https://slay-the-spire.fandom.com/wiki/Ironclad_Cards | ok [M] |
| Deep Breath (Flex) | 0 cost, +2 Pumped (+4) | Flex 0 cost, +2 Strength lost at end of turn (+4) | https://slaythespire.wiki.gg/wiki/Flex | ok [W] |
| Kick the Door (Dropkick) | 1 cost, 5 (8); if Staggered +1 energy, draw 1 | Dropkick 1 cost, 5 (8); if Vulnerable +1 Energy, draw 1 | https://slaythespire.wiki.gg/wiki/Dropkick | ok [W] |
| Haymaker (Clothesline) | 2 cost, 12 + 2 Weakened (14 + 3) | Clothesline 2 cost, 12 + 2 Weak (14 + 3) | https://slay-the-spire.fandom.com/wiki/Clothesline | ok [W] |
| Tackle (Body Slam) | 1 cost, damage = Block (cost 0) | Body Slam 1 cost, damage = Block; upgrade costs 0 | https://slaythespire.wiki.gg/wiki/Body_Slam | ok [W] |
| Jaw Breaker (Uppercut) | 2 cost, 13 + 1 Weakened + 1 Staggered (2 / 2) | Uppercut 2 cost, 13 + 1 Weak + 1 Vulnerable (2 / 2 upgraded) | https://slaythespire.wiki.gg/wiki/Uppercut | ok [W] |
| Ground Pound (Thunderclap) | 1 cost, 4 + 1 Staggered ALL (7) | Thunderclap 4 (7) + 1 Vulnerable to ALL | https://slaythespire.wiki.gg/wiki/Thunderclap | ok [W] |
| Momentum (Rampage) | 1 cost, 8, +5 each play (+8) | Rampage 8, +5 per play (+8 upgraded) | https://slaythespire.wiki.gg/wiki/Rampage | ok [W] |
| Dig In (Entrench) | 2 cost, double Block (cost 1) | Entrench 2 cost, doubles Block; upgrade costs 1 | https://slaythespire.wiki.gg/wiki/Entrench | ok [W] |
| Thick Skin (Metallicize) | 1 cost, 3 (4) | Metallicize 3 (4) | https://slaythespire.wiki.gg/wiki/Metallicize | ok [W] |
| Pumped Up (Inflame) | 1 cost, +2 (+3) | Inflame 2 (3) | https://slaythespire.wiki.gg/wiki/Inflame | ok [W] |
| Swing Guard (Rage) | 0 cost, 3 block per attack (5) | Rage 3 Block per Attack this turn (5) | https://slaythespire.wiki.gg/wiki/Rage | ok [W] |
| Wrench Arm (Disarm) | 1 cost, -2 Strength, exhaust (3) | Disarm -2 (3), exhaust | https://slaythespire.wiki.gg/wiki/Disarm | ok [W] |
| Grit Teeth (Bloodletting) | 0 cost, lose 3 HP, +2 energy (3) | Bloodletting 0 cost, 3 HP, 2 Energy (3) | https://slaythespire.wiki.gg/wiki/Bloodletting | ok [W] |
| Berserker (Demon Form) | 3 cost, +2 Strength per turn (+3) | Demon Form 3 cost, +2 per turn (+3) | https://slaythespire.wiki.gg/wiki/Demon_Form | ok [W] |
| Grand Slam (Bludgeon) | 3 cost, 32 (42) | Bludgeon 3 cost, 32 (+10 = 42) | https://slaythespire.wiki.gg/wiki/Bludgeon | ok [W] |
| Bolt the Door (Impervious) | 2 cost, 30 block exhaust (40) | Impervious 30 (40), exhaust | https://slaythespire.wiki.gg/wiki/Impervious | ok [W] |
| Fortify (Barricade) | 3 cost, block no longer clears (cost 2) | Barricade 3, upgrade 2 (excerpts list the card but not its cost) | https://slaythespire.wiki.gg/wiki/Cards_List | ok [M] |
| Make It Count (Feed) | 1 cost, 10, +3 max HP if it kills (12, +4), exhaust | Feed 10 (12), +3 (+4) max HP if fatal, exhaust | https://slaythespire.wiki.gg/wiki/Feed | ok [W] |
| Rally (Limit Break) | 1 cost, double Strength, exhaust (no exhaust) | Limit Break 1 cost, doubles Strength; upgrade doesn't exhaust | https://slaythespire.wiki.gg/wiki/Limit_Break | ok [W] |
| Tuck and Roll (Backflip) | 1 cost, 5 block, draw 2 (8) | Backflip 5 (8) Block, draw 2 | https://slay-the-spire.fandom.com/wiki/Backflip | ok [W] |
| Check the Mag (Prepared) | 0 cost, draw 1 discard 1 (2 / 2) | Prepared 0 cost, draw 1 discard 1 (2 / 2) | https://slay-the-spire.fandom.com/wiki/Prepared | ok [W] |
| Painkillers (Footwork) | 1 cost, +2 Agility (+3) | Footwork 1 cost, +2 Dexterity (+3) | https://slaythespire.wiki.gg/wiki/Footwork | ok [W] |
| Overdrive (Offering) | 0 cost, lose 6 HP, +2 energy, draw 3 (5), exhaust | Offering 0 cost, 6 HP, 2 Energy, draw 3 (5) | https://slaythespire.wiki.gg/wiki/Offering | ok [W] |
| **Spray and Pray (Sword Boomerang)** | 1 cost, 3 dmg to a random zombie **x4 (x5)** | Sword Boomerang 3 damage x **3 (4)** hits at random enemies; each hit gets Strength | https://slay-the-spire.fandom.com/wiki/Sword_Boomerang | **fix: x3 (x4)**, or mark the +1 hit as a deliberate buff |
| **Slow Motion (Bullet Time)** | **2 cost** (1), your cards cost 0 this turn, exhaust | Bullet Time **3 cost (2)**, cards in hand cost 0 this turn **and you cannot draw more this turn** | https://slaythespire.wiki.gg/wiki/Bullet_Time | **fix: cost 3 (2) and add "No Draw this turn"**, or treat as a deliberate buff. Note it only discounts cards in hand when played |

## 10. Potions (not in the request list but the spec says "copy")

| item | our value | StS value | source | verdict |
|---|---|---|---|---|
| Medkit | common, heal 20% max HP | Blood Potion 20%, common | https://slaythespire.wiki.gg/wiki/Potions_List | ok [W] |
| Adrenaline | common, +2 energy | Energy Potion +2, common | https://slaythespire.wiki.gg/wiki/Potions_List | ok [W] |
| Energy Drink | common, draw 3 | Swift Potion draw 3, common | https://slaythespire.wiki.gg/wiki/Potions_List | ok [W] |
| Body Armor | common, 12 block | Block Potion 12, common | https://slaythespire.wiki.gg/wiki/Block_Potion | ok [W] |
| Pipe Bomb | **uncommon**, 10 to ALL | Explosive Potion 10 to ALL, **common** | https://slaythespire.wiki.gg/wiki/Potions_List | ok on the number; rarity differs |
| Protein Shake | **uncommon**, +2 Strength | Strength Potion +2, **common** | https://slaythespire.wiki.gg/wiki/Potions_List | ok on the number; rarity differs |
| Painkillers (pills) | **uncommon**, +2 Agility | Dexterity Potion +2, **common** | https://slaythespire.wiki.gg/wiki/Potions_List | ok on the number; rarity differs |
| Extinguisher | common, **2 Weakened to ALL** | Weak Potion **3 Weak to one target**, common | https://slaythespire.wiki.gg/wiki/Potions_List | ok as a design change (ALL is stronger); copy value would be 3 on one target |
| Flashbang | common, **2 Staggered to ALL** | Fear Potion **3 Vulnerable to one target**, common | https://slaythespire.wiki.gg/wiki/Potions_List | same as above |
| Epi-Pen | rare, heal to 30% on death | Fairy in a Bottle: rare, heals to 30% max HP (buffed from 10% in V2.0) | https://slaythespire.wiki.gg/wiki/Fairy_in_a_Bottle | ok [W] |

---

## Corrections to apply

Real rule or number differences first, then small ones. Items marked "(design)" are fine to keep if Marc prefers; note the choice in `BUILD_SPEC.md`.

1. **Party debuff timing (section 3, Rules).** Tick the party's Staggered / Weakened / Shaken after the **enemy** turn (end of round), skipping any debuff an enemy applied during that same enemy turn. Today Staggered 2 on the party boosts only one enemy turn instead of two. Enemy-side ticking is already right. Confidence: end-of-round [W], skip-first [M].
2. **Treasure (section 5).** Roll a chest size first: small 50% / medium 33% / large 17%. Relic rarity small 75/25/0, medium 35/50/15, large 0/75/25. Gold only sometimes: small 50% for 23-27, medium 35% for 45-55, large 50% for 68-82. Elite relics stay 50/33/17.
3. **Card rarity pity (section 5).** Rare chance = base + offset; any shortfall below 0 comes out of uncommon. At the start: normal 65/35/0, elite 55/40/5. Offset starts -5, +1 per common, reset to -5 on a rare, **cap +40**. Shop card rolls must not change the offset.
4. **Shield Guard Spiked (section 4).** Make it trigger once per Attack card played, not per hit (design: keep per-hit). Mode Shift counts HP lost after block.
5. **Sleeping Patient.** Stun for one turn only when woken by damage. A timer wake (after 3 turns) attacks on turn 4 unstunned. Plating is removed on waking.
6. **Spray and Pray:** x3 (x4), not x4 (x5) (design).
7. **Slow Motion:** cost 3 (2 upgraded) and no further draws that turn (design).
8. **Sprinter:** HP 10-14, Lunge 9. Make `GAME_CORE.md` match (it says 12-16 and Lunge 6; the spec says 14-18).
9. **Map:** add "no rest sites on row 14". Note that the room percentages are shares of the whole map, re-rolled on rule breaks.
10. **Potion shop prices:** common 48-53, uncommon 71-79. (Uncommon card 68-83 is within a coin of ours.)
11. **Rarities (design):** Riot Vest (Orichalcum) is common in StS; Hollow Points (Paper Phrog) is uncommon; Pipe Bomb, Protein Shake and Painkiller pills are common potions. Smiling Mask is common and not sold, ours is shop-only.
12. **Spec labels:** the Combo Counter is Shuriken (Strength); Kunai gives Dexterity.
13. **Optional:** elite potion bonus (+12 to +12.5%); shop colorless slots; Louse-style multi-hit Curl Up trigger; Darkling-style Nurse (revive automatically next turn, all die if none left alive).
