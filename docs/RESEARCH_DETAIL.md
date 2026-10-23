# Research detail (the full proposals)

`RESEARCH_NOTES.md` has the findings and sources for each research pass. This file keeps the **detailed proposals**: card lists, numbers, templates and checklists that the research agents produced, so they survive. They were written against earlier drafts, so fit them to `GAME_CORE.md` (Slay the Spire rules, shared HP, Vulnerable as "Staggered") before using them.

All numbers are starting points.
- **[memory]:** recalled by an agent, not sourced.
- **[proposal]:** an agent's own design.

## 1. Card pools (pass 5)

**Size**
- Cobalt Core has about 20 cards per crew member ([AV Club](https://avclub.com/game-theory-the-super-charming-cobalt-core-got-us-thro-1851138951)).
- Slay the Spire has about 75 per character: ~4 basic, ~19 common, ~35 uncommon, ~19 rare [memory].
- **Proposed for a first release:** ~24 per hero plus 8 shared, about 56 in all.
  - Per hero: 9 common, 11 uncommon, 4 rare.
  - By type: attacks ~45%, skills ~40%, powers ~15%.
- **Keywords:** 8 at most, for phone readability.

**Proposed keywords (8)**
- Break (now: Vulnerable / "Staggered")
- Guard (taunt)
- Evade (negate the next hit)
- Loaded (shotgun shells)
- Bleed
- Duo (needs both heroes' cards this turn)
- Exhaust
- Retain

**How builds work [memory/inference]**
- Each Slay the Spire character has 2–4 engines.
- **Build-arounds** (rare or uncommon) change how you play.
- **Enablers and payoffs** are uncommon.
- **Glue** cards (common, solid damage or block) fill most common slots, so a mid-run pick is never dead.
- Avoid one dominant build: each engine needs a different resource and weakness, and a cap.
- Reward offers should never hold three cards of the same role.

**Marc A: Breaker** (bat, greatsword)

| Card | Cost | Rarity | Effect | Animation |
|---|---|---|---|---|
| Bat Swing | 1 | Basic | 6 damage, stagger 2 | bat swing |
| Knock Loose | 1 | Common | 5 damage, stagger 3 | bat swing |
| Home Run | 2 | Common | 14 damage, stagger 4, delays intent | heavy bat |
| Follow Through | 1 | Uncommon | 4 damage, +6 if broken | bat swing |
| Cleave | 2 | Uncommon | 8 to all, stagger 2 | greatsword sweep |
| Executioner | 2 | Uncommon | Kill a broken non-boss; costs 0 if it kills | execution |
| Overhead Smash | 3 | Rare | 24 damage, stagger 8 | heavy greatsword |
| Momentum | 1 | Rare power | Breaking a zombie gives 1 energy (once per turn) | — |
| Rampage | 1 | Uncommon | Draw 1 per broken enemy | bat swing |

**Marc B: Bulwark** (block, Guard, shotgun)

| Card | Cost | Rarity | Effect | Animation |
|---|---|---|---|---|
| Brace | 1 | Basic | 6 block | block |
| Hold the Door | 1 | Common | 8 block, Guard | block |
| Shoulder Check | 1 | Common | Damage equal to your block (max 10) | bat swing |
| Shells | 0 | Common | Gain 2 Loaded, Exhaust | reload |
| Point Blank | 1 | Uncommon | 4 per Loaded (spends all), stagger 3 | shotgun |
| Steel Resolve | 2 | Uncommon | 12 block, Retain | block |
| Stand Your Ground | 1 | Uncommon | Deal 3 back per hit taken this turn | block |
| Buckshot Wall | 2 | Rare | 10 to all, stagger 3, +1 Loaded | shotgun |
| Fortress | 2 | Rare power | Half your block carries over each turn | block |

**Yola A: Triage** (healing and support)

| Card | Cost | Rarity | Effect | Animation |
|---|---|---|---|---|
| Patch Up | 1 | Basic | Heal 6 | heal (no clip yet) |
| Bandage | 1 | Common | Heal 4, remove Bleed | heal |
| Sedate | 1 | Common | Target's intent deals 4 less | heal gesture |
| Stim | 1 | Uncommon | Next card costs 1 less, Exhaust | heal |
| Triage Tag | 0 | Uncommon | Heal 3 to the lower-HP hero | heal |
| Kip Up | 2 | Uncommon | Revive at 25% | kip-up |
| Defib | 2 | Rare | Revive at 50%, Exhaust | kip-up |
| Field Hospital | 2 | Rare power | Excess healing becomes block | heal |
| Code Blue | 3 | Rare | Heal both 10, draw 2 | heal |

**Yola B: Marksman** (pistol, evade, cheap cycling)

| Card | Cost | Rarity | Effect | Animation |
|---|---|---|---|---|
| Pistol Shot | 1 | Basic | 5 damage, stagger 1 | pistol |
| Sidestep | 1 | Basic | 5 block, draw 1 | dodge |
| Snap Shot | 0 | Common | 3 damage, Exhaust | pistol |
| Roll Away | 1 | Common | Evade, draw 1 | roll |
| Double Tap | 1 | Common | 4 damage ×2 | pistol |
| Headshot | 2 | Uncommon | 12 damage, +8 if broken | pistol |
| Close Call | 1 | Uncommon | Evade; deal 6 when a hit is dodged | dodge |
| Keep Moving | 1 | Rare power | Each Evade draws 1 and gives 1 block | dodge |
| Last Round | 3 | Rare | 24 damage, Exhaust | pistol |

**Duo cards**
- **Cover Fire** (1): Marc Guards; Yola's next pistol card does +4.
- **Pin and Smash** (2): Yola does stagger 3; Marc's next attack does +6 on a broken target.
- **Second Wind** (1): heal Marc 5; his next attack does +3.
- **Crossfire** (2, rare): each hero deals 8 to a different enemy; stagger 2 each if both are alive.

**Two heroes in one deck: rules [inference]**
- A drawn hand always holds at least 1 card per hero; if not, swap the weakest card.
- Each hero's block stays theirs. This is moot now that HP is shared.
- Duo cards pay off only when both heroes played a card this turn.
- A downed hero's cards are skipped on draw.
- Give each hero about the same number of commons.

**Healing budget [proposal]**
- In-fight heals restore only that fight's damage.
- Heal cards Exhaust, cost 2+, or heal 4 or less.
- Cap healing at about 15% of party HP per fight, 25% for a healing build; the excess becomes half-value block.
- **Test:** a run with no healing loses about 15% per fight, a Triage run about 10%. Under 5% means tighten.
- Wildfrost warning: a healing deck "will carry you" ([Siliconera](https://www.siliconera.com/review-wildfrost-promises-hours-of-brutal-fun/)).

## 2. Family sets, scrap and weapons (pass 5)

**Family set template [proposal, parked]: 12 cards**
- 3 starters that replace 3 basics, so the deck stays the same size.
- 9 reward cards: 4 common, 3 uncommon, 2 rare.
- One signature keyword on at least 5 cards. One rare is a cut-in finisher.
- 2 cards care about Marc, 2 about Yola.
- Effects rather than new animation, plus 1 portrait and 12 card art pieces.

**Example sets (mechanics only; Marc assigns people):**
- **Helper A, "Setup" (Trap):** delayed effects that trigger on a zombie's intent.
- **Helper B, "Tempo" (Rush):** 0-cost draw and energy refunds.
- **Helper C, "Cover" (Shield):** shared block, taunts, revives.

**Unlocking [proposal]**
- **Helper sets:**
  - A from the start.
  - B after the first floor-1 boss win (around run 2–4).
  - C after the first full clear, or a rescue event.
- **References:** Cobalt Core starts 3 of 8 crew open; Monster Train 2 starts 2 of 5 clans.
- **How to unlock:** characters by milestone, not currency; currency is for weapons.

**Scrap economy [proposal]**

| Source | Scrap |
|---|---|
| Fight | 8 |
| Elite | 20 |
| Boss | 40 |
| Stash or event | 10 |
| Floor cleared | +15 |
| Full-clear bonus | +25% |

- A floor gives about 100–110; a win about 400.
- A loss keeps 100% of what you earned (no Rogue Legacy-style toll).
- A first-run death on floor 1 still gives about 30–60.

**Bat tree [proposal]**
- **Tier 1, Bat:** the base cards.
- **Tier 2, Nail Bat (80 scrap):**
  - Adds Bleed and 3 Marc cards: Rake, Hook, Rusty Flurry.
  - Nails show on the model, the card frame and the hit effect.
- **Tier 3, Wire-and-Tape Bat (200 scrap):**
  - Adds 3 stagger cards (one rare) and a Break finisher.
  - Optional +1 on Bat Swing, with flat bonuses capped at about 10%.
- **Optional (Hades-style):** at tier 3, choose Wire (stagger) or Nail+ (bleed).

**Rule from the critic and verifier:** new weapon cards should replace or upgrade starters rather than dilute the reward pool.

**Currency references** (`RESEARCH_NOTES.md` pass 5):
- Hades' first mirror ranks cost 10–30.
- Enter the Gungeon's "more than one run per item" draws grind complaints.
- Vampire Survivors' prices rise about 10% per rank.

## 3. Floor 1 proposal (pass 5, before the Slay the Spire re-base)

**Zombie patterns** (the old scale: Marc 80 / Yola 60 HP)
- **Walker** (22 HP)
  - Shamble 7 → Marc (60%), or Bite 5 + a Bitten card (40%).
  - Never Bites twice in a row or Shambles three times; always opens with Shamble.
  - Stagger 4.
- **Nurse** (18 HP)
  - Jab 5 → Yola, then Revive (a fallen zombie at 50%), or Tend (+4 block to all) if there's no corpse.
  - Corpses last 2 turns.
- **Sprinter** (16 HP)
  - Acts first. Lunge 4×2 → Yola, or Scratch 5 → Marc.
  - Always opens with Lunge.
- **Big Walker** (elite, 60 HP)
  - Pound 12, Pound 12, Roar (+3 Strength), Bite 10 + Bitten.
  - A break cancels the Roar.
- **Sleeping Patient** (elite, 70 HP)
  - Asleep 3 turns or until damage gets through, gaining 8 block a turn.
  - Then Claw 14, Claw 14, Feverish Moan (2 Bitten + Weak).
- **Shield Guard** (160 HP; the verifier found ~100–120 needed at that scale)
  - **Phase 1:**
    - A 30-block shield that regenerates; stagger 10.
    - Shield Bash 10 → Marc, Brace +15 block, Dash 14 → Yola.
    - First break: the arm is off. He's stunned a turn and gains Reckless Swing 14.
  - **Phase 2:** Call for Help, 2 walkers, once.
  - **At 25% HP:** Frenzy 8×2 every turn. The killing blow takes the head off.

**Encounters**
- **Easy pool:** 2 walkers / walker + sprinter / nurse + walker.
- **Hard pool:** 3 walkers / 2 sprinters + nurse / nurse + 2 walkers / walker + 2 sprinters.

**Status cards**
- **Bitten:** unplayable; 1 HP if held; gone after the fight.
- **Stumble:** unplayable, ethereal.
- **Infected:** a curse from elites and events. Both heroes lose 2 HP if it's held. Removed at a closet or the pharmacy.

**Map template (8 rows × 3 columns)**
- **The rows:**
  - Row 1: fights.
  - Row 2: fight, event, fight.
  - Row 3: fight, pharmacy, event.
  - Row 4: elite, fight, stash.
  - Row 5: fight, event, fight.
  - Row 6: elite, fight, fight.
  - Row 7: all closets.
  - Row 8: the boss.
- **Rules:**
  - No elite before row 4.
  - No consecutive shops, rests or elites on one path.
  - Every room has at least 2 exits.

**Infection levels [proposal]**
1. more elites
2. +1 zombie damage
3. bites add 2 statuses
4. bosses harder
5. post-boss heal 75%
6. start with Infected

**Win-rate goal [judgment]:** a new player wins about 40–55% of first runs. Losses should come at the elite and the boss, almost never in rooms 1–2.

## 4. Deckbuilders: what to borrow (pass 4)

**Closest models**
1. **Slay the Spire:** the structure. Static animation was its weak spot.
2. **Roguebook:** two heroes, one deck. Its swapping was criticised as bookkeeping, and its downed-hero rule is disputed between sources.
3. **Fights in Tight Spaces:** every card is an animation. Some players found them long ([Tildes](https://tildes.net/~games/1guy/knights_in_tight_spaces_reveal_trailer)).

**Steal / avoid**

*Steal:*
- **Inscryption:** a run can feed the next. Avoid changing rules mid-game.
- **Wildfrost:** never lock away companions after a win.
- **Griftlands:** don't punish one hero's build with forced room types.
- **Balatro:** sequence the feedback (bonus, then combo, then finisher).
- **Monster Train:** floors as space; clan pairing; avoid counter-bosses.
- **Marvel Snap:** per-character entrances; fast-forward long chains of effects.
- **Dawncaster:** a premium phone model with no ads or timers. But it hides cards behind the UI.
- **Draft of Darkness:** ammo as a resource.

*Avoid:*
- **Legends of Runeterra and Hearthstone:** both sped up animations after complaints.
- **Slay the Spire mobile:** tiny tap targets; tap and drag conflict.
- **Pirates Outlaws:** always allow "skip reward".

**Animation pacing [proposal]**

| Card type | Time to impact | Total |
|---|---|---|
| Basic attack | ~0.25 s | 0.5–0.6 s |
| Heavy or multi-hit | ~0.4 s | 0.9–1.1 s |
| Block, dodge, buff | instant | 0.3–0.4 s |
| Heal | instant | 0.5 s |
| Status effect or reaction | none | ≤ 0.2 s |
| Cinematic | — | 2–3 s, at most one per turn, shortened once seen |

- Five normal cards take about 4 s.
- **Card queueing:** buffer one input; the next card can be played when the hit lands.
- **Zombie turn:** attacks overlap, offset by 0.15 s.
- **Speed setting:** 1× / 1.5× / 2×, plus skip effects.
- **Animation budget:** shared animation families per weapon (about 25–40 hero clips cover 60–80 cards). Vary hit-stop, camera nudge, sound and VFX colour.
  - Unique animations only for signature or rare cards; players remember 5–10 special moments a run.
  - Zombie reaction variety is cheaper and more visible than attack variety.

**Measured clip lengths (verifier):**
- `bat_swing` 2.00 s
- `ual_Sword_Block` 1.27 s
- dodges 1.33 s
- `ual_Sword_Regular_A` 0.47 s
- `ual_Sword_Regular_B` 0.57 s

**Phone layout [proposal]**
- **Orientation:** landscape, with a 16:9 safe area.
- **Stage:** heroes on the left third, zombies on the right two-thirds.
- **Above each zombie:** an intent icon and number, and a thin HP bar.
- **Under the heroes:** HP and block.
- **Hand:** one row of 5 cards (not a fan), with icon-first text. The selected card lifts.
- **Controls:**
  - energy orb and draw pile bottom-left
  - discard pile and a big End Turn button bottom-right
- **Input:**
  - Drag up past a line to play.
  - Tap or long-press to read; a tap never plays a card.
- **Settings:** text size.
- **Card frame:** colour shows the owner (Marc orange/red, Yola blue/teal), and the owning hero steps forward when their card is selected.

**Card art recipe [proposal]**
- Capture the impact frame from each clip with a fixed camera per hero, the same key and rim light, a crop of a painted hospital plate, one colour grade, and one frame.
- Heal and buff cards need staged poses.
- Animated art only on rares.

## 5. Encounter and boss principles (pass 2)

- **Phases change the rules, not just the numbers:**
  - FF10 Yunalesca ([Samurai Gamers](https://samurai-gamers.com/final-fantasy-x-x2-hd-remaster/yunalesca-boss-guide/))
  - FF7 Remake's Hell House
  - Octopath's post-break changes
- **A steady rhythm to plan around** (Raid's Demon Lord), not a hard enrage. "Gets stronger each round" is gentler.
- **Fairness test:** "if a player watching their death replay can see what they should have done, the design works" ([Choost](https://choostgames.com/blog/what-makes-a-good-boss-fight/)). No instant kills; every heavy hit shown a turn ahead.
- **Encounters:** variety comes from formations, not complex individual enemies. A kill-order puzzle is a priority target (healer, reviver) behind a tough blocker.
- **Teaching:** introduce a mechanic alone, then paired, then tested by the boss (Chrono Trigger's Cathedral → Yakra).
- **Enemy AI:** scripted cycles with intents shown. Bosses get one reactive rule per phase, readable from a status icon. No weighted randomness for anything damaging.

## 6. Game feel (pass 2)

**What every hit stacks:** a freeze (hit-stop 0.05–0.12 s), a flash, a shake, a sound layer, a damage number and a haptic buzz, all scaled to the move. Sources:
- Capcom's 8/12/16-frame example ([Capcom](https://game.capcom.com/cfn/sfv/column/131545?lang=en))
- a 3D study's best range of 0.1–0.2 s ([paper](https://www.scitepress.org/Papers/2024/124614/124614.pdf))

**Per beat:**
- **Basic hit:** 0.3 s windup; on contact a 0.06 s hit-stop, a 2-frame white flash, a 1–2% camera kick and a shake decaying in 0.15 s. The damage number pops from 1.4 to 1.0 in 0.15 s and fades over 0.8 s.
- **Break:** a 0.15 s stop, a shatter, a glass-crack sound, a "BREAK" banner and a strong buzz. The enemy stays visibly dazed.
- **Finisher:**
  - The screen dims and freezes for 0.25 s, then a flat colour field or portrait card (the Persona 5 trick).
  - A cut to the execution, a 0.12–0.2 s hit-stop and a 0.3 s slow-motion.
  - 7 s at most, skippable.
- **Enemy death:** a 0.1 s stop, then the death clip, then a fade. Let the clip finish before the camera moves.

**Options:**
- **Reduce flashes and shake.** Star Rail added this after complaints ([Yahoo/GamesRadar](https://malaysia.news.yahoo.com/honkai-star-rails-best-dps-204042766.html)).
- **Haptics:** crisp, short and synced ([Android](https://developer.android.com/develop/ui/views/haptics/haptics-principles)).

## 7. Core and drift (pass 6)

**Ask before adding any system**
1. Is it in the one-sentence pitch?
2. What's the central decision each turn, and does this add to it or sit beside it?
3. Does it strengthen the spin or compete with it?
4. Does it make a turn's result more readable or less?
5. Would the game still work without it?
6. What's the smallest prototype that tests it?
7. What does it replace?
8. Does it make Marc's or Yola's fantasy clearer?
9. Does it fit a phone session?
10. Would it make the top three?

**Warning signs of drift**
- The pitch needs "and also".
- Research has replaced playing.
- A new system needs another to fix it.
- The core decision gets harder to explain.
- Features serve the theme rather than the decision.

**Five twists considered**
- **(A) Nobody kills alone:** Marc opens, Yola finishes. It became the soft "Marc staggers, Yola cashes in".
- **(B) The kill is the card:** body-part thresholds, and the death clip pays a bonus. Kept as presentation.
- **(C) Every action is loud:** noise brings more zombies; ammo runs out. The best theme hook, but two resources is heavy on a phone.
- **(D) Two settings with different rules:** the hospital with zombies, the neighbourhood with looters, cover and reload. Most expensive.
- **(E) The weapon is the deck:** the cheapest to build.

**Relationship tests** (what makes a pair mechanical, not cosmetic):
1. One partner's ability is useless without the other.
2. The partner's wellbeing is a cost.
3. It shows in every turn.
4. It changes with shared history.

Sources: It Takes Two, Brothers, Ico, Mario & Luigi, Hades ([RESEARCH_NOTES pass 6](RESEARCH_NOTES.md)).

**Market:** about 316 roguelike deckbuilders released on Steam by September 2026 (17 in 2020). The breakouts changed the player's verb ([Steam Page Analyzer](https://www.steampageanalyzer.com/niches/roguelike-deckbuilder)).

## 8. Simulation results kept

**Turn-based draft 2 (verifier, 2000 seeds):**
- 3 walkers lasted 2.55 walker cycles, with 5–7% party HP lost per round and 0 heals.
- The Shield Guard died to breaks in 3–7 rounds, with 535–770 of his 1000 HP left.

**Turn-based draft 3 (`tools/balance-sim`):**
- Normal fights ran 3.9–5.6 rounds, losing 25–36% HP (no taps).
- The 800-HP boss on Normal took 11.7 rounds with 3 heals (no taps), or 10.7 rounds with average taps.
- Hard is lost without taps.

**Card plan draft 1** (verifier, `tools/card-sim`, 400–1000 fights per case):

| Fight | Damage table | Heal | Turns | Marc | Yola | Party |
|---|---|---|---|---|---|---|
| 3 walkers | a | 25% | 6.2 | 14% | 0% | 8% |
| 3 walkers | a | 8 | 6.0 | 40% | 0% | 23% |
| Shield Guard 160 | a | either | 11–13 | wiped | wiped | 98–100% losses |
| 3 walkers | b | 8 | 5.9 | 10% | 0% | 6% |
| Shield Guard 160 | b | 8 / 25% | 17.3 | 49% / 26% | 83% / 47% | 63% / 35% |
| Shield Guard 120 | b | 8 / 25% | 12.8 | 32% / 18% | 55% / 32% | 42% / 24% |
| Shield Guard 100 | b | 8 / 25% | 10.8 | 26% / 16% | 50% / 31% | 36% / 23% |

- **Hands:** 31–32% had no Brace (Slay the Spire is about 2% with no Defend), and 21–27% of cards were dead in walker fights.
- **Heal-stalling:** worked with a 25% heal.
- **Execute:** pointless against walkers, which are left with about 4 HP when broken.
- **Run length:** about 14 s per turn → about 15 minutes a floor and 45 a run.

The shared-HP Slay the Spire base in `GAME_CORE.md` avoids most of these problems by design. Its numbers should still be simulated.
