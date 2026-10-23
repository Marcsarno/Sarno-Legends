# Research notes

Condensed from the research passes of 2026-10-23. Each pass was a set of web-research agents, plus a critic and a verifier for draft 2. Most sources are guides, wikis, reviews and interviews, not official documentation. Raid's exact turn-meter constant and Marvel Strike Force's formulas were not found.

## Pass 1: design, balance, movesets

**Strategy comes from information**
- **FF10's turn list:** the order is visible, and it previews how a move changes it. [Giant Bomb](https://giantbomb.com/wiki/Concepts/Conditional_Turn_Based_Battle)
- **Raid's turn meter:** a turn meter you can push forward or back. [HellHades](https://hellhades.com/how-speed-works-in-raid-shadow-legends/)
- **Slay the Spire's intents:** each enemy shows its next move. [Wikipedia](https://en.wikipedia.org/wiki/Slay_the_Spire)
- **Into the Breach:** chose determinism over hit chances. [Cliqist](https://cliqist.com/2018/03/06/into-the-breach-building-a-better-mech-with-subset-games-justin-ma/)

**Build up, then cash in**
- **Octopath:** break an enemy's shield, then spend banked Boost on it. [GamerGuides](https://www.gamerguides.com/octopath-traveler/guide/the-basics/game-mechanics/battle-system)
- **FF7 Remake:** stagger multiplies damage taken. [RPG Site](https://www.rpgsite.net/feature/9641-final-fantasy-vii-remake-how-to-increase-stagger-bonus-to-200-and-300)
- **Persona 5:** hit a weakness and you get "1 More" turn. [Twinfinite](https://twinfinite.net/?p=270868)

**Shared resource**
- **Star Rail:** a shared skill-point pool. Basics earn points and skills spend them. [Prydwen](https://www.prydwen.gg/star-rail/guides/combat-and-exploration)

**Two heroes**
- **Mario & Luigi:** both heroes act on every turn, including the enemy's. [MarioWiki](https://www.mariowiki.com/Action_Command)
- **FF7 Rebirth:** paired Synergy moves. [RPG Site](https://www.rpgsite.net/guide/15564-final-fantasy-vii-rebirth-synergy-skills-and-synergy-abilities-every-synergy-action-and-how-to-unlock-it)
- **Darkest Dungeon:** a Guard mechanic for tanking. [wiki](https://darkestdungeon.wiki.gg/wiki/Guard)
- **The lesson:** use hybrid roles. A healer with nothing to heal still needs a good turn.

**Not stressful**
- **Persona 5 Royal:** Safety mode with unlimited retries. [Prima](https://primagames.com/tips/persona-5-royal-difficulties-explained)
- **Expedition 33:** Story mode widens the timing windows and cuts incoming damage. [RPG Site](https://www.rpgsite.net/news/17707-clair-obscur-expedition-33-patch-1-3-0-simon-rematch-story-mode-easy-difficulty-challenge-modifiers)
- **Bravely Default:** speed-up and an encounter slider, because only 20% of players reached the true ending. [Kotaku](https://kotaku.com/the-one-feature-all-modern-jrpgs-should-have-1508232852)
- **Expedition 33:** a full heal at checkpoints. [PlayNews](https://www.playnews.gg/en/guides/clair-obscur-expedition-33-guide-healing-and-potions)

**Balance math**
- **Damage formula:** a ratio, `K/(K+DEF)` with K tied to level, never reaches zero and keeps buffs meaningful. [Prydwen](https://prydwen.gg/star-rail/guides/damage-formula), [Yanfly](https://yanfly.moe/wiki/Armor_Scaling_(YEP))
- **Speed:**
  - Action value = 10000/SPD. [esports.gg](https://esports.gg/guides/honkai-star-rail/what-does-speed-do-in-honkai-star-rail)
  - A ~10% speed gap decides who goes first, ~33% gives an extra turn every third round, and 2× gives double turns.
- **Randomness:** keep variance small, about ±5%. Players read 3:1 odds as a sure thing (Sid Meier, GDC 2010). [VentureBeat](https://venturebeat.com/2010/03/12/quotes-from-sid-meiers-keynote-gdc-speech)

**Avoid from Raid and Marvel Strike Force**
- Energy timers, random gear stats, currency walls, gacha and pay-to-win. [GameRefinery](https://www.gamerefinery.com/raid-shadow-legends-a-player-perspective/)
- **Keep:** turn-meter tactics, team synergy, predictable enemy AI, and auto-battle for repeat fights.

## Pass 2: bosses, progression, game feel

**Bosses**
- **Phases that change the rules:**
  - FF10 Yunalesca. [Samurai Gamers](https://samurai-gamers.com/final-fantasy-x-x2-hd-remaster/yunalesca-boss-guide/)
  - FF7 Remake Hell House. [Inverse](https://www.inverse.com/gaming/final-fantasy-7-remake-hell-house-weaknesses-how-to-beat-best-materia-equipment)
  - Octopath's breaks that change the boss. [Prima](https://primagames.com/tips/how-to-beat-warden-davids-in-octopath-traveler-2)
- **A steady rhythm to plan around:** Raid's Demon Lord. [Inteleria](https://www.inteleria.com/raid-speed-tuned-clan-boss-teams/)
- **What feels cheap:** instant kills with no warning. The test: "if a player watching their death replay can see what they should have done, the design works." [Choost](https://choostgames.com/blog/what-makes-a-good-boss-fight/)

**Encounters**
- Variety comes from which enemies come together, more than from complex individual enemies. [Reverse Design: Chrono Trigger](https://www.quaddicted.com/webarchive/thegamedesignforum.com_20160521/features/reverse_design_CT_2.html)
- Teach a mechanic alone, then combined, then on the boss.
- Use fixed patterns with intents shown, not weighted random.

**Progression**
- **Weapons that teach a skill you keep:** FF9, FF7 Remake, Expedition 33. [RPGamer](https://archive.rpgamer.com/games/ff/ff9/reviews/ff9rdrev2.html), [Maxroll](https://maxroll.gg/clair-obscur-expedition-33/guides/weapon-attributes-upgrades-guide)
- **Slot budgets force choices:** FF7 materia slots, Paper Mario badge points. [Paper Mario Wiki](https://papermario.fandom.com/wiki/Badge_Point)
- **Traps to avoid:**
  - FF8's scaling and stacking were easy to exploit. [GameSpot](https://gamespot.com/articles/final-fantasy-8-director-would-make-one-big-change-to-the-game-if-it-ever-got-remade/1100-6520884/)
  - FF10's Sphere Grid looks open but is mostly linear. [Kotaku](https://kotaku.com/final-fantasy-x-was-less-complex-than-it-seemed-5766535)
  - Scaling every enemy to the player kills the sense of growth. [Giant Bomb](https://giantbomb.com/wiki/Concepts/Level_Scaling)
- **Sea of Stars:** shares XP across the whole party and rubber-bands it to the story. [Nintendo World Report](https://www.nintendoworldreport.com/preview/59815)
- **Motivation:** feeling competent and in control predicts fun. Random, timed and paid rewards feel manipulative. [Ryan, Rigby, Przybylski 2006](https://www.rochester.edu/warner/lida/wp-content/uploads/2022/11/02bfe513dd59366750000000.pdf)

**Game feel**
- **Many small effects per hit:** layer several small effects, each fading fast. ["Juice it or lose it"](https://www.gamedeveloper.com/business/has-your-game-got-juice-more-), [Art of Screenshake notes](https://infovore.org/?p=5275)
- **Hit-stop:** about 0.1–0.2 s feels best in 3D. [paper](https://www.scitepress.org/Papers/2024/124614/124614.pdf)
- **Persona 5's flat colour cut-ins:** a cheap way to make big moves look spectacular. [Automaton](https://automaton-media.com/en/news/clair-obscur-expedition-33-lead-says-persona-5-is-the-best-game-in-the-world-when-it-comes-to-ui-and-combat-visuals/)
- **Haptics:** short, crisp buzzes synced to the hit. [Android](https://developer.android.com/develop/ui/views/haptics/haptics-principles)
- **Thumb reach:** the bottom centre of the screen is easiest. [Smashing](https://smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users)
- **Timed taps:** no fake-outs, and failing is never punished beyond losing the bonus. [Automaton](https://automaton-media.com/en/news/clair-obscur-expedition-33s-battle-system-was-designed-around-the-premise-of-no-frustrating-deaths-and-a-game-you-can-clear-with/)

## Critic and verifier on draft 2 (what led to draft 3)

The verifier re-simulated each claim: 2000 runs per case.

**Confirmed**
- Normal fights were too easy: only about 3 zombie hits landed (~6% of party HP per round), and Yola never healed.
- The boss died from stagger in 3–7 rounds with half its HP left, and Leap Slam fired 0–1 times.
- Break rules were undefined.
- The Gun weakness didn't fit the kits.
- Yola's non-heal turns were weak.
- The boss could be cheesed.
- There were too many systems for chapter 1.
- Ultimates and Last Stand never triggered.

**Wrong**
- The `t_` clips are not Kevin Iglesias clips (see `ASSETS.md`).

**Missed by the critic, found by the verifier**
- One duo move could break the boss.
- The difficulty settings didn't affect the boss.
- Walkers always acted last.

## Pass 3: what to build first, the look, story structure

The full summary and the plan that came out of it are in `ROADMAP.md`. Source quality was thinner this time: some page fetches failed, and several points are the agents' own judgment.

**Build the combat core first, cheaply**
- **Banner Saga:** prototyped combat on a chess board and called combat "the riskiest system". [interview](https://game-wisdom.com/guest/beards-kickstarters-and-vikings-a-banner-saga-interview)
- **Into the Breach:** spent years finding the combat, then cut about 60% of the planned game. [Kotaku](https://kotaku.com/the-creators-of-into-the-breach-came-very-close-to-givi-1833498295)
- **Slay the Spire:** balanced with metrics. [GDC](https://www.gdcvault.com/browse/gdc-19/play/1025731)
- **Monster Train:** started as a game jam and picked its theme only after the gameplay worked. [Q&A](https://www.digitallydownloaded.net/2020/02/developer-q-a-monster-train-a-deckbuilding-roguelike-with-a-hellish-theme.html)
- **Chained Echoes:** a solo developer's seven years, as scope grew. [Gamasutra](https://gamasutra.com/production/matthias-linda-s-seven-year-quest-to-make-retro-jrpg-chained-echoes)

**Playtesting**
- About 5 testers per round finds most problems. [Game Developer](https://www.gamedeveloper.com/design/how-many-players-should-you-playtest-with-)
- With kids, watch what they do more than what they say. [GamesUserResearch](https://gamesuserresearch.com/how-to-test-games-with-kids/)

**3D characters on painted backgrounds**
- **Pre-rendered backgrounds** (FF7–9, Resident Evil): the game camera must match the render camera. [Giant Bomb](https://giantbomb.com/wiki/Concepts/Pre_rendered_Backgrounds)
- **Octopath HD-2D:** effect lights cast shadows onto the scene. [Unreal](https://www.unrealengine.com/en-us/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style)
- **Disco Elysium:** made its 3D characters look painted. [GDC](https://gdconf.com/news/come-gdc-and-see-how-disco-elysiums-unique-style-was-achieved-0)
- **AI paintings:** locked to the layout with depth or edge control, plus style references. [Runware](https://runware.ai/docs/guides/game-assets-canny)

**Real people in the art**
- Get consent for every real likeness, and take extra care with children. [Partnership on AI](https://arxiv.org/pdf/2407.13025), [BBB National Programs](https://bbbprograms.org/media/insights/blog/use-caution-ai-children)

**Story structure**
- **Octopath:** its stories that never cross are the main complaint. [Kotaku](https://kotaku.com/octopath-traveler-the-kotaku-review-1827537100)
- **Expedition 33:** relationship levels unlock team attacks. [PlayNews](https://www.playnews.gg/en/guides/clair-obscur-expedition-33-relationship-levels-all-rewards-romance-and-gradient-attacks)
- **Persona 5:** confidant ranks unlock perks. [Push Square](https://www.pushsquare.com/guides/persona-5-royal-confidants-guide-where-to-find-all-confidants-and-how-to-rank-up-fast)
- **Raid and MSF campaigns:** about 6 stages per chapter, with 3-star ratings. [Gamer Empire](https://gamerempire.net/raid-shadow-legends-how-to-get-3-stars-from-stages/)
- **Session length:** phone sessions run anywhere from a 5–6 minute median to about 37 minutes for RPGs. [GameDev Reports](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks)
- **Ratings:** E10+ allows mild fantasy violence. [Nintendo support](https://en-americas-support.nintendo.com/app/answers/detail/a_id/1398/~/entertainment-software-rating-board-%28esrb%29-software-rating-information)

## Pass 4: roguelike deckbuilders (the card pivot)

The plan that came out of this is in `DECKBUILDER_PLAN.md`. Page fetches failed in this pass, so most of it comes from search snippets, and the agents flagged numbers taken from memory.

**Closest models**
- **Slay the Spire:** run structure, intents, rest-or-upgrade. Critics called its animation static. [notebookcheck](https://www.notebookcheck.net/90-off-on-Steam-This-roguelike-has-never-been-cheaper-194K-reviews-97-positive.1189359.0.html)
- **Roguebook:** two heroes share one deck; the front hero takes hits. [Game Developer](https://www.gamedeveloper.com/design/tackling-deckbuilding-design-in-abrakam-s-roguebook), [LessWrong review](https://www.lesswrong.com/posts/QRJkxcDtJ58j8XN6A/spoiler-free-review-roguebook)
- **Fights in Tight Spaces:** each card is a fight animation; players say the animations can run long. [GGRecon](https://www.ggrecon.com/reviews/fights-in-tight-spaces-review/), [Tildes](https://tildes.net/~games/1guy/knights_in_tight_spaces_reveal_trailer)

**Run structure and odds (Slay the Spire)**
- **Room odds and map:** normal 53%, elite 8%, rest 12%, shop 5%, unknown 22%; the room before each boss is always a rest site. [wiki](https://slaythespire.wiki.gg/wiki/Map_Generation)
- **Card rewards:** 60/37/3 from normal fights, 50/40/10 from elites, rare from bosses, plus a rare pity offset. [wiki](https://slay-the-spire.fandom.com/wiki/Card_Rewards)
- **Balance by metrics:** track pick rates and win rates. [GDC 2019](https://www.gdcvault.com/browse/gdc-19/play/1025731)

**Meta-progression**
- Unlocks and side-grades beat raw power. Stat upgrades in Hades made it easy and needed Heat to rebalance. [Steam](https://steamcommunity.com/app/1076200/discussions/0/3070873501568676154)
- **Hades God Mode:** starts at 20% damage resistance and adds 2% per death. [Inverse](https://www.inverse.com/gaming/hades-god-mode-interview)
- **Never take progress away or nerf invested builds.** Slay the Spire 2's balance-patch backlash and Wildfrost's companion lockout both drew criticism. [Player.one](https://www.player.one/slay-spire-2-update-triggers-fanbase-major-nerfs-boss-buffs-early-access-162528), [TapTap](https://www.taptap.io/br/post/5234225)

**Pace**
- Legends of Runeterra and Hearthstone both sped up their animations after complaints. [Inven](https://invenglobal.com/articles/10550/patch-091-speeds-up-animations-introduces-jinx-and-garen-themed-boards-to-legends-of-runeterra), [Hearthstone Top Decks](https://www.hearthstonetopdecks.com/minion-animations-triggers-will-be-sped-up-significantly-in-regular-game-too/)
- Marvel Snap fast-forwards long chains of card effects. [Twinfinite](https://twinfinite.net/marvel-snap/what-is-fast-forwarding-in-marvel-snap-explained/)

**Phone**
- **Slay the Spire mobile:** small touch targets, and tap and drag controls that clash. [TouchArcade](https://toucharcade.com/2020/06/15/slay-the-spire-ios-review-iphone-ipad-performance-icloud-megacrit-humble-games/)
- **Dawncaster:** portrait, no ads, no timers; cards hidden behind the UI. [Pocket Gamer](https://www.pocketgamer.com/dawncaster/review/)

**Niche:** no well-known zombie roguelike deckbuilder. Draft of Darkness, a survival-horror deckbuilder with ammo, is the nearest. [GamingOnLinux](https://www.gamingonlinux.com/2021/08/draft-of-darkness-is-a-deckbuilder-like-nothing-else-with-a-horror-theme)
