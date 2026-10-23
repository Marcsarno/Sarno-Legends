# Roadmap: what to focus on

> **Update 2026-10-23:** the milestones below were written for the turn-based design. For the card game, step 0 is the paper test in `GAME_CORE.md`; milestone 1 becomes one card fight on the phone. The playtest and look sections still apply.

From the third research pass (2026-10-23: prototyping and playtesting, battle presentation, story structure). Marc approves each step.

## The focus

**Prove the fight is fun before making anything pretty.** Every team the research found (Banner Saga, Into the Breach, Slay the Spire, Monster Train) built the combat core first, in the cheapest form they could, and cut or changed big ideas once it was played. The simulation says the numbers are sane, but only people playing can say the choices are fun.

## Milestones

| # | Milestone | What it proves | Left out |
|---|---|---|---|
| 1 | **Sandbox fight on the phone.** Marc and Yola vs 2 walkers, plain background. Turn order, intents, Grit, break, 3 moves each, instant retry, a log of every turn | The decisions are interesting and readable on a phone | Painted rooms, timed taps, ultimates, the duo move, story, menus |
| 2 | **Full chapter-1 move set.** Ultimates, Batter Up, nurse, sprinter, elite. Re-run the sim against the playtest log | Every move gets used; the draft-3 numbers hold | Polish |
| 3 | **One fight made beautiful.** One painted room, the real clips, camera cuts, damage numbers, the game-feel timings | The look works; turns don't drag | Other rooms |
| 4 | **Chapter-1 fight ladder.** 5–6 fights with HP carrying over, checkpoint heals, the Shield Guard boss | Wearing down feels tense but fair; the boss teaches break | Story, loot, XP |
| 5 | **Timed taps.** Story / Normal / Auto | They add fun without a skill wall; kids manage on Story | |
| 6 | **Losing, retry, difficulty.** Tuning round with 5–6 testers | Frustration stays low | |
| 7 | **Chapter shell.** Text scenes, map nodes, save, menus | It plays like a game | Chapter 2 |
| 8 | **Chapter 1 release.** Deploy and a family playthrough | Whether to keep going | |

## First playtest (milestone 1)

- **Testers:** 6 people: two gamers, two non-gamers, two kids.
- **Session:** 15 minutes each. Give no instructions before the first fight, and let them play 3–5 fights.
- **Watch for:**
  - Hesitating more than 10 seconds.
  - Mashing the basic attack.
  - Missing the intent icons.
  - Asking "what does that do?"
  - Wanting another go.
- **Ask adults:** "What was your plan?"
- **Ask kids:** "Show me the best thing you did," and "Do you want another go?"
- **Success:**
  - 5 of 6 notice the intents without being told.
  - Fights are won with 40–70% HP left.
  - 4 of 6 ask to play again.
  - Every move is used by at least half the testers.

## Look (for milestone 3)

**Screen and staging**
- Landscape, with key content inside a 16:9 safe area.
- Fixed camera 10–15° above eye level, at about 35–50 mm.
- Heroes on the left, zombies on the right in 1–2 staggered rows, each about 35–45% of screen height.
- Bottom ~25% of the screen for buttons.

**Building one painted room**
1. Render the existing hospital or neighborhood scene from the battle camera: a clean pass, a depth pass and a lighting pass.
2. Paint over it, by hand or with AI locked to the depth, using 3–5 style-anchor paintings.
3. Hand-fix the AI mistakes, and keep the floor where characters stand calm.
4. Split it into layers: back, mid, a foreground cut-out, and fog.
5. In the game, match the camera, the key light and a rim light, and add soft contact shadows.
6. Put one colour grade over the whole frame.

**Five things that look cheap**
1. Lighting or horizon that doesn't match the painting.
2. No contact shadows.
3. A painted style that drifts from room to room.
4. Visible AI mistakes: hands, text, faces.
5. A busy background behind the fighters.

**Portraits**
- Head and shoulders, three-quarter view, the same crop and light for everyone.
- A full version and a small icon version.
- Two expressions: neutral and hurt.

**Family likeness**
- Ask every adult before using their likeness. For the kids, it's the parents' call.
- Keep the game private until you decide otherwise.
- Don't upload the kids' photos to services that train on them.
- Decide who may be shown bitten or knocked out.

## Story structure (Marc decides the beats)

**Chapter template**
- About 8 stops and 20–30 minutes, with a natural break every 5–8 minutes:
  - 4 battles
  - 2 story stops (one cuts to the other lead)
  - 2 search stops
- The chapter ends on a boss and a hook.
- Three stars per chapter, for example: win, nobody knocked out, under a turn count.

**Cutting between Yola and Marc**
- Alternate whole chapters at first, then cut mid-chapter as the story tightens.
- End every part on an open question, and open the next with a one-line recap of the other lead's stakes.
- Share a thread between them: a phone call, an object, "same night".
- Show both tracks on the chapter list, so the wait never feels random.

**The reunion**
- Make it a visible change in how the game plays: the duo moves and the shared party screen arrive.

**Family**
- Bonds rise through short scenes at home, tied to the story (Expedition 33's model).
- Bond levels unlock buffs, then call-ins, then the top duo moves.

**Tone**
- Aim for E10+-style: knockouts and zombies collapsing, no gore.
- Humor comes from the family, never from mocking the danger.
- One fully sincere beat per chapter.

**Losing in the story**
- No forced-loss fights. If the story needs a loss, use a cutscene, a survive-N-turns fight or an escape.

## Questions for Marc

1. Do the leads switch at fixed points, or does the player choose?
2. Is the reunion one chapter, or does it build over several?
3. Which family members are home team and which are call-ins? And can the kids ever be in danger scenes?
4. Target rating (E or E10+)? How are infected people shown?
5. Does Arianna have a gameplay role, or does she stay the goal?
