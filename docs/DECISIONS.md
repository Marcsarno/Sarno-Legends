# Decision log

What Marc said and decided, in order, with what was done about it. All on 2026-10-23, in one Claude Code session. Quotes are Marc's own words.

## Setup

1. **A new repo for a new project.**
   - Marc: "I want a new repository … I only want to use the connected ones right now, like the Yola zombie, for art assets. I don't want to write to them."
   - Done:
     - Marc created `Marcsarno/sarno-legends` on github.com, after Claude's GitHub app couldn't create repos.
     - yola-zombie and survival are **read-only**.
2. **What it is (first idea).** "A family version spin of Raid Shadow Legends or Marvel Strike Force, FF7 style game … using Zombie assets and the Sarno family."
3. **The name.** "Sarno Legends … hell yeah." The repo was later renamed to `Sarno-Legends` on GitHub; the old URL redirects.

## Turn-based phase (superseded, but the ideas carried over)

4. **Planning only, no code.** Marc's brief:
   - **Family:** Marc, wife Yola, daughters Arianna and Lilah; in-laws Chris and Kayla and their kids Jax and Harper; other friends and family.
   - **The kids:** "most the time the kids are at home"; Marc and Yola "would swap out team mates depending on the story."
   - **Animations:** "We have great combat animations already… great death animations… using that in turn base combat could be fun and look really cool."
   - **Rooms:** "the arena can be beautiful 2d painted rooms. Don't need 3d blender environments. Gives us options to go anywhere."
   - **Story:** "we stick to the same story [hospital + neighbourhood] … just change the game play."
   - **Assets:** "The easy thing in blender for AI is weapons, props … New characters are very hard."
   - **Ideas:** "I'm already hitting a wall with my imagination."
   - "Don't build or code anything. Right now I need design planning and help."
5. **Marc's model exists:** "I have a Marc in the game … might be called bearded man … should have the same amount of animations as Yola."
   - Found: `male1.glb` on yola-zombie's `neighborhood-level` branch, with Yola's clips retargeted onto him: 50 + 39 clips, plus 5 neighbourhood clips.
6. **Research, roles and difficulty.**
   - Marc asked for 3 research agents, then 3 more plus a critic (session default model) and a verifier (Opus).
   - **Roles:** "the holy trinity might be important … having just one character may not be fun … Marc either the tank or damage, Yola the heals, buffs, damage."
   - **Moves:** need names and power scores, for enemies too.
   - **Difficulty:** "challenging enough to feel rewarding and not frustrating or stressful."
7. **Draft 3 liked; HP carries.** Marc liked turn-based draft 3, and chose "the HP carries" between fights. Saved as `COMBAT_DESIGN.md`.
8. **What to focus on next?** Research on prototyping, art direction and story structure. Saved as `ROADMAP.md`.

## The pivot to a deckbuilder

9. **Roguelike deckbuilder.**
   - Marc: "rouge like.. slay the spire … can upgrade weapons that can carry forward for future runs. I think we go the card route. Two heroes. Their moves are animated … balance … the random chance of cards as you go floor to floor of the hospital. Some rooms sort of easy … but even the easy ones, you can want to conserve HP … I love love love that idea."
   - Saved as `DECKBUILDER_PLAN.md`.
10. **Deck, carry-over and family.**
    - Deck: "Probably 1 shared deck" (after hearing pros and cons).
    - Between runs: "just currency or upgrades."
    - Family: "family members could be rare cards … or even better.. when you add them.. they have their own card sets that get added for that mission."
11. **Bosses and new characters.**
    - Marc: "I only have the shield guard as the boss until we create more characters."
    - Chapter 2 of yola-zombie added Unity and Mixamo characters:
      - looters with guns
      - survivors
      - zombified survivors
    - Catalogued in `ASSETS.md`.

## Re-centring

12. **Drift.**
    - Marc: "I think we're drifting and losing strong ideas and strong true game developer like thinking."
    - Then: "Really learn what's fun, how to balance and what we should do with what we have."
    - Done: a research pass plus a design-director audit, giving the pitch, pillars and keep/cut/park.
13. **Uniqueness isn't the aim.** "I don't need to do something new no other game does."
14. **The final direction.**
    - Marc: "I would rather copy something proven that works. And add a slight spin to it."
    - Recommended:
      - Slay the Spire's rules and numbers.
      - Two heroes, one deck and **one shared HP bar**.
      - Marc applies Vulnerable and Yola cashes in.
      - The kill picks the finisher or death animation.
    - Marc: **"I like it now."**
    - Saved as `GAME_CORE.md`.
15. **Saving for compaction.** "Save and commit everything we talked about. Keep strong details of the plan, not very vague. Keep strong amount of research."

16. **Engine: Three.js.**
    - Marc: "I think three js is the right engine.. everything from one game will translate and transfer nicely."
    - It's the same browser stack as yola-zombie and survival (Vite + three in survival; three 0.180 + esbuild in yola-zombie).
    - What carries over:
      - The GLB heroes and zombies, and their clips (Mixamo bone names).
      - The finisher and gore code (`zombies.js` EXEC_GORE).
      - The procedural pistol recoil.
      - The asset pipelines.
    - It deploys to Vercel like the others.

## Standing rules from Marc's other projects (carried over)

- Marc decides story beats. Names, lines and stats are placeholders until he approves them.
- Get Marc something playable early, before long automated passes.
- Kevin Iglesias clips can never ship.
- Don't hand-edit generated assets.
- Record every downloaded asset's licence.

## Open decisions

- **Family:** one call-in per run (recommended), or full card sets per person (Marc's idea, parked)?
- **Story:** why Marc and Yola fight together in the hospital (the two earlier games have them apart). Recommended: together in every fight; the story reason is Marc's.
- **Chapter-2 characters:** who's an enemy, who's a friendly face, who's a boss.
- **Shared HP:** confirm in the paper test.
- **Licences:** the `t_` clips and the Unity characters.
