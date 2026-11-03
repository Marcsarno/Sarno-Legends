# FPS game feel ("juice") research: small Three.js zombie shooter

Scope: pistol + pump shotgun, melee shove, zombies with hit reactions, dismemberment, slow-motion finisher. Browser / Three.js.

**How to read the sourcing.** Each item is tagged:
- **[SRC]**: the number or rule comes from the source named.
- **[SEC]**: secondary source (fan wiki, mod config, forum, vendor blog). Treat as a hint, not a spec.
- **[DEFAULT]**: my own starting value. No source gave a number, so this is a tuning starting point to playtest. It is not a citation.

**Gaps.** The GDC Vault pages (Doom "Push Forward Combat", "Techniques for Building Aim Assist", Eiserloh camera talk) need a login or video, so their numbers could not be read. theastronauts.com, halopedia.org and pcgamer.com were blocked by the session's network allowlist, so those pages are cited from search snippets only. No developer source gave hit-marker durations, recoil-curve values or CoD-style tuning numbers.

---

## P0: do these first (cheap, biggest payoff)

### 1. Feedback on the input frame (responsiveness)
- Muzzle flash, sound, camera kick and the hit test all happen on the frame the button goes down. Never wait for an animation event. Fire on `pointerdown`, not on `click`.
- Swink's definition of game feel needs a feedback loop under ~100 ms [SEC, review of Swink]. Aiming studies find diminishing returns below ~40 ms system latency [SEC].
- Valve's TF2 resolves the hit before the gun animation starts, so the hit and the flash land on the same frame [SEC].
- Sources: Steve Swink, *Game Feel*, via review https://lizengland.com/blog/review-game-feel-by-steve-swink/ ; AnandTech latency testing https://www.anandtech.com/show/2803/6 ; Mick West, "Programming Responsiveness" https://cowboyprogramming.com/2008/05/ ; low-latency aiming study https://ar5iv.labs.arxiv.org/html/2105.10498

### 2. Sound is most of the weapon (layered gunshot)
- "Sound is 70% of the feel of a great shotgun" (developer quoted by PC Gamer) [SRC, opinion].
- Layers: **transient/punch** (sharp crack, 0–30 ms), **body/sub** (low end that "makes recoil feel physical"), **mechanical** (slide, pump, shell, click), **tail** (reverb and decay). Russom: the first few hundred ms have little character, and a neglected tail makes all guns sound alike [SRC].
- Keep the dry shot separate from the tail so each room gets its own reverb [SEC]. In Web Audio: a dry buffer, plus a ConvolverNode or a pre-baked tail per room type (hospital corridor, ward, stairwell).
- Small timing offsets between transient and body change the perceived size [SEC]. Keep the sub and tail envelopes short so fast fire doesn't turn to mud.
- Random pitch ±3–5% and 3–4 variants per layer so repeated shots don't sound identical [DEFAULT].
- Pump shotgun: put the pump "rack" sound on its own timing (it is the "ready" cue). Pistol: a dry-fire click when empty.
- Sources: PC Gamer, "An ode to the shotgun" https://www.pcgamer.com/an-ode-to-the-shotgun/ ; Chuck Russom on gun sound design (Designing Sound) https://designingsound.org/2010/04/chuck-russom-special-gun-sound-design/ ; Splice weapon sound guide https://splice.com/blog/?p=16617 ; FPS gun sound write-up https://www.liortega.com/post/first-person-shooter-gun-sound-design

### 3. Recoil: split the camera kick from the viewmodel kick, drive both with springs
- Apply recoil to the camera and to the viewmodel separately. Putting it all on one is "a common mistake". Rapid kicks **add** to the current offset instead of restarting it [SEC, Roblox dev guide].
- **Return slower than kick.** Vertical and horizontal kick reset at different speeds, with horizontal faster, so sustained fire stays controllable [SEC, dev write-up].
- Use spring–damper integration (stiffness, damping) for recovery. Apply impulses once, not scaled by dt, but step the spring with dt so it doesn't depend on frame rate [SEC].
- Apply the procedural recoil *after* the baked animation, or the gun appears to sink [SEC, Killhouse write-up].
- Visual vs real: Bungie removed camera recoil on PC in Destiny 2 because "a mouse should not move without the player moving it" [SRC, Noseworthy interview]. **For mouse play, make the kick visual and self-recovering** (the camera returns to the aim point) rather than a permanent aim drift.
- The missing viewmodel kick is why Doom 2016's guns felt like "weightless bubbles" to PC Gamer's reviewer [SRC, opinion].
- Starting values [DEFAULT]: pistol camera pitch kick 1.0–1.5°, recover in ~120–180 ms. Shotgun camera kick 3–5° pitch + 0.5° random yaw + small FOV punch (+2–3° for ~80 ms), recover in ~250–350 ms. Viewmodel: shotgun moves back 4–6 cm and rotates up 6–10°; spring stiffness ~150–300, damping ratio ~0.5–0.7 so it overshoots slightly.
- Sources: Forbes on Destiny 2 PC recoil https://www.forbes.com/sites/insertcoin/2017/06/22/bungie-says-that-guns-wont-have-any-recoil-in-destiny-2-on-pc/ ; PC Gamer, "Doom's guns, judged" https://www.pcgamer.com/doom-guns-judged/ ; Roblox recoil guide https://robloxgunrecoilscriptprocedural.pages.dev ; Dev_Unallocated procedural weapon animations https://www.devunallocated.com/projects/project-killhouse/procedural-weapon-animations ; Roblox CoD-style recoil issue https://github.com/charlieadc/untitled-roblox-project/issues/8 ; Opsive spring docs https://opsive.com/support/documentation/ultimate-character-controller/animation

### 4. Screen shake: trauma model, Perlin noise, rotation over translation
- Eiserloh (GDC 2016): keep a `trauma` value in 0..1 that events add to and that decays linearly. Shake amount = trauma² (or trauma³), so small hits barely shake and big ones really do. Drive the offset with smooth noise (Perlin or simplex), not `Math.random()` per frame [SRC as described by implementations of the talk].
- In first person, shake **rotation** (pitch, yaw, roll) more than position. Position shake makes the camera clip. Max rotation ~2–4°, decay ~1.0–1.5 trauma/s [DEFAULT].
- A three.js forum thread implements this talk [SEC].
- Put shake on a separate slider (0–100%) for comfort (see 13).
- Sources: GDC Vault, "Math for Game Programmers: Juicing Your Cameras With Math" https://gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing ; Game Developer summary https://gamedeveloper.com/programming/video-sprucing-up-cameras-with-math ; three.js forum implementation https://discourse.threejs.org/t/camera-shake-or-much-damage-such-wow/8963 ; Vlambeer "Art of Screenshake" (Jan Willem Nijman: about 30 small tweaks such as camera kick, shake and muzzle flash turn a dull shooter into a good one) https://gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games

### 5. Enemy hit reactions (the zombie must answer every bullet)
- Use **additive, upper-body-masked flinch** clips layered over the running locomotion. Full-body weight makes the character "spaz out". Pick the clip by hit direction; one dev used 8 directional poses [SEC].
- Game Developer, "The role of animations in hit effects": additive shakes on the body while the enemy's own animation keeps running, plus direction-correct reaction clips [SRC].
- Procedural option (no clips needed): add a decaying rotation impulse to the hit bone and its parent (chest, head, upper arm, pelvis), about 10–25° and recovering over ~150–250 ms [DEFAULT]. Cheap in Three.js: offset `bone.quaternion` after `mixer.update()`.
- Ladder of reactions [DEFAULT]: pistol body = additive flinch only; pistol head = head snaps back + short stagger; shotgun close = full stagger/knockback (break the zombie's attack); shove = stumble back 1–1.5 m. Keep a short reaction cooldown (~0.3 s) so the horde can't be stun-locked forever by a pistol.
- PC Gamer argues that good in-world hit reactions can replace UI hit markers [SRC, opinion]. For a zombie game, the zombie's body *is* the hit marker.
- Sources: Game Developer, "The role of animations in hit effects" https://www.gamedeveloper.com/programming/the-role-of-animations-in-hit-effects ; Unreal forum on directional additive hits https://forums.unrealengine.com/t/how-to-do-directional-additive-hit-animations/2063951 ; direction-based hit reaction devlog https://swearsoft.itch.io/jackmclantern/devlog/76709/direction-based-hit-reaction ; PC Gamer, "Hit markers are an FPS crutch" https://www.pcgamer.com/games/fps/hit-markers-are-an-fps-crutch/

### 6. Hit-stop (tiny freeze on impact): use it only on big hits
- Typical: light hits 30–50 ms, heavy 60–100 ms, crits 100–150 ms. Hades is about 30–50 ms. "2–3 frames" is enough to read. Too long feels like a hang [SEC].
- Academic work tested 0–0.7 s and found pleasant and unpleasant bands [SRC, scitepress 2024].
- In an FPS, never freeze the player's camera or input. Freeze only the **target** (its animation mixer time scale goes to 0) plus maybe the gore particles. Use it for shotgun point-blank hits, headshot kills and the shove [DEFAULT]. Don't use it on every pistol hit.
- Sources: Godot hitstop notes https://uhiyama-lab.com/en/notes/godot/hit-feedback-hitstop/ ; "Dynamic hit stop using eye gaze" https://scitepress.org/PublishedPapers/2024/124614 ; IEICE study https://ken.ieice.org/ken/paper/20230315OCSt/eng/

---

## P1: core feel, second pass

### 7. Hit marker, headshot and kill confirmation
- Popularized by CoD4: an "X" glyph plus a "thwip" sound [SRC, PC Gamer]. MW2/MW3 let players switch the hit-marker sound, which shows that players care about it [SEC].
- Starting values [DEFAULT]: small X at the crosshair, 100–150 ms visible then a ~100 ms fade. Headshot = different colour/size and a distinct sound (a wet "crack" plus a bell-like ping). Kill = a bigger or red X held ~250 ms with a separate kill sound. Damage numbers: **no**. They fight the hospital horror tone. Use body reactions and gore instead.
- Sources: PC Gamer, "Hit markers are an FPS crutch" https://www.pcgamer.com/games/fps/hit-markers-are-an-fps-crutch/ ; Prima on MW3 hitmarker sounds https://primagames.com/gaming/how-to-enable-classic-hitmarker-sounds-in-modern-warfare-3

### 8. Gore and dismemberment that reads
- **L4D2 wounds (Valve, GDC 2010, Alex Vlachos):** wounds are ellipsoids. The vertex shader computes each vertex's position inside the ellipsoid, and the fragment shader discards pixels inside it (cutting a hole into the mesh). A separate pre-made "wound interior" mesh fills the hole. Blood is projected along one ellipsoid axis with a gradient falloff. Wound size scales with weapon strength. Placement is accurate to the hit. Shipped limit: **2 active wounds per zombie**. About 15 vertex-shader instructions, one draw call. L4D1 had 5 built-in wound variants that were always fatal [SRC, slides].
  - Three.js equivalent: `onBeforeCompile` on the zombie material. Pass up to 2 ellipsoid matrices as uniforms, `discard` inside them, and spawn a small interior/stump mesh. Very feasible.
- **Killing Floor 2 M.E.A.T.:** 19–22 pre-cut dismemberment points per zed (KF1 had 5). Each limb is pre-cut with bone, meat and sinew modelled inside. Blood decals persist on the floor for the match. You can dismember corpses too [SRC, press coverage].
  - Takeaway for a small project: pre-cut 4–6 points (head, 2 arms at the elbow or shoulder, 2 legs at the knee), each a hidden stump mesh. Hide the limb's bones (scale to 0) and spawn a physics gib.
- Readability rules [DEFAULT]: the limb comes off on the killing shot or on a heavy (shotgun) hit; a big spurt of blood particles for ~0.3 s; a stump cap with a red interior. A floor decal under the corpse stays (cap at ~50–100 decals, oldest fades).
- Sources: Vlachos, "Left 4 Dead 2 Wounds" GDC 2010 slides https://es.slideshare.net/alexvlachos/gdc-2010-left4dead2-wounds and https://www.scribd.com/document/63836738/gdc2010-vlachos-l4d2wounds ; Valve "Infected" shader https://developer.valvesoftware.com/wiki/Infected_(shader) ; Kotaku, "The people trying to make the goriest video game ever" https://kotaku.com/the-people-trying-to-make-the-goriest-video-game-ever-1697101145 ; PCGamesN on M.E.A.T. https://pcgamesn.com/killing-floor-2/painting-paris-red-with-killing-floor-2s-meat-system ; GamesBeat https://gamesbeat.com/developers-killing-floor-2-will-have-the-most-dynamic-video-game-gore-system-in-history-will-hit-early-access-with-gallery/

### 9. Death: animation vs ragdoll
- KF2 shipped about 95 death animations with the gore system [SRC, PSX coverage]. Most small teams blend: play a short authored death (0.3–0.6 s) chosen by hit zone and direction, then switch to ragdoll or freeze on the last frame [DEFAULT].
- For the slow-motion finisher, use **authored** animations. Ragdoll is unpredictable in slow motion.
- Source: GameWatcher on KF2 dismemberment panel https://www.gamewatcher.com/2014-12-12-tripwire-interactive-talks-killing-floor-2-and-enhanced-dismemberment-engines-during-panel-event

### 10. Slow-motion finisher (KF2 "Zed Time" is the model)
- Zed Time: a random chance on each kill, higher for close-range kills and long-range headshots. It affects everyone. Kills during it can extend it. Players say it lasts about 5 s [SEC]. The world slows and the player (in feel) does not.
- For this game [DEFAULT]: world `timeScale` 0.2–0.3, player look speed unscaled, ease in over ~100 ms and out over ~300 ms. Low-pass the audio (BiquadFilter around 800 Hz) and pitch it down. Total length 1.5–3 s for a scripted finisher. Trigger it on a guaranteed event (the killing blow), not at random. Never use slow motion while the player can still be hit by unseen enemies.
- Doom 2016/Eternal: staggered enemies glow and can be glory-killed for a health reward. id dropped the system in Dark Ages partly because when two enemies were staggered side by side, one often recovered before the player reached it [SEC, Hugo Martin]. Lesson: a stagger window must outlast the walk to the target, or the finisher must be triggerable from range.
- Sources: Wikipedia, *Killing Floor 2* https://en.wikipedia.org/wiki/Killing_Floor_2 ; Steam discussion on Zed Time https://steamcommunity.com/app/232090/discussions/0/1700542332330743065 ; PC Gamer on Dark Ages glory kills https://www.pcgamer.com/games/fps/doom-the-dark-ages-is-overhauling-glory-kills-so-you-can-transition-from-melee-strikes-to-guns-to-shield-play-to-an-execution-without-interrupting-your-demonslaying-momentum

### 11. Melee shove (L4D is the model)
- L4D: the shove does **no damage**, staggers commons, and buys space. Fatigue (a longer delay between shoves) starts after the 5th consecutive shove in versus/survival and the 7th in the L4D2 campaign. Mod cvars put the min/max penalty at 5 and 8 swings. A HUD shows the shove cooldown [SEC, wiki and mod config].
- [DEFAULT]: shove = 90° cone, 1.5–2 m reach, knocks zombies back 1–1.5 m with a 0.6–0.8 s stagger, ~0.5 s base cooldown, rising with spam. Add a 40–60 ms target hit-stop, a camera nudge forward and a heavy thud. A shove that interrupts an attack is the most satisfying "save".
- Sources: Left 4 Dead Wiki, Melee https://left4dead.fandom.com/wiki/Melee ; Valve update notes https://store.steampowered.com/oldnews/2380

### 12. Viewmodel: idle sway, bob, look inertia, separate FOV
- Lack of sway makes the viewmodel feel stiff [SEC, project feedback]. When looking around, the weapon lags behind, driven by a spring (feels like arm muscles resisting) [SEC].
- [DEFAULT] values: look lag = viewmodel rotation offset = −mouseDelta × 0.02–0.05°/px, clamped ±4–6°, spring back ~8–12/s. Walk bob = figure-eight, horizontal 1–1.5 cm and vertical 0.5–1 cm, tied to step cadence (~1.8–2 steps/s walking). Idle breathing ±0.2–0.4 cm at ~0.25 Hz. Landing dip 2–4 cm.
- **Separate viewmodel FOV:** draw the gun in a second pass with its own camera (narrower, ~50–60° vertical) after `renderer.clearDepth()`. This stops the gun clipping into walls and stops the wide world FOV from stretching it. CS2 exposes `viewmodel_fov` separately [SEC]. Caveat: mismatched FOVs misalign things attached to the barrel, such as lasers or muzzle effects spawned in world space (Tarkov bug) [SEC]. Spawn the muzzle flash in the viewmodel scene and tracers from a world-space point projected from it.
- ADS: not needed for a zombie hip-fire prototype (Doom has none). If added: zoom the FOV by ~15–25% over ~150–200 ms [DEFAULT].
- Sources: gamedev.net feedback thread https://gamedev.net/forums/topic/703104-feedback-please-fps-project/5409663/ ; Unreal forum on separate weapon rendering https://forums.unrealengine.com/t/how-to-render-the-weapon-of-an-fps-separately/3661 ; Xash3D projection-swap discussion https://github.com/FWGS/xash3d-fwgs/issues/1600 ; Tarkov FOV mismatch https://devtrackers.gg/escapefromtarkov/p/aa2ffd69-more-information-on-weapons-not-firing-where-they-should-in-game-with-reproducible-in-game-proof ; CS2 FOV guide https://blog.cs2.ad/how-to-change-fov-in-cs2/

### 13. FOV and comfort (Three.js `fov` is VERTICAL)
- three.js `PerspectiveCamera.fov` = vertical degrees. Convert: `vFov = 2·atan(tan(hFov/2) / aspect)`. At 16:9: **hFov 70 → v 43.3; 80 → 50.5; 90 → 58.7; 100 → 67.6; 103 → 70.5; 110 → 78.6**. Use Hor+: fix vFov and let width grow on wider screens [SRC formula: gamedev.net; values computed].
- Shooter defaults on PC are usually 90–103° horizontal at 16:9 (v ≈ 59–71) [DEFAULT, common practice]. Offer a slider (one doc suggests −10 to +20° around the default).
- **Head bob:** Xbox Accessibility Guideline 117: avoid camera shake and bobbing or give an option to turn them off. Make bob a slider *with a true off*. A Battlefield 6 beta thread shows players need a full off, not just "reduced". Boltgun has a head-bob toggle in Accessibility [SRC].
- Keep camera head bob small (≤1–2 cm vertical, no roll) and put most of the motion on the viewmodel instead. That reads as walking without moving the horizon [DEFAULT].
- Sources: Xbox Accessibility Guideline 117 https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117 ; Godot camera comfort doc https://www.strayspark.studio/docs/godot-camera-system/comfort-and-accessibility ; PC Gamer on headbob https://www.pcgamer.com/games/rpg/i-didnt-realize-how-important-headbob-was-until-i-played-an-rpg-without-it ; gamedev.net FOV conversion https://www.gamedev.net/topic/431111-perspective-math-calculating-horisontal-fov-from-vertical/

### 14. Player hurt feedback
- Choices run from Doom's full-screen colour flash, through 2D directional arcs, to 3D-style front/back cues (Destiny 2). Overwatch scales the indicator by damage size [SRC, UX analysis].
- Autodesk Scaleform HUD kit: 8 red semicircle segments around the screen, the one facing the damage source lights up, and each fades over ~1 s [SRC].
- [DEFAULT]: red vignette whose strength follows the damage taken (fade ~0.4–0.6 s); a directional arc toward the attacker that tracks the attacker as you turn (recompute the angle every frame) and fades over ~1 s; camera punch 2–4° away from the hit direction with spring recovery ~200 ms; muffle audio (low-pass) + heartbeat below 30% HP; desaturate as HP drops. A zombie grab gets a stronger camera shove plus the zombie's face in view.
- Sources: Jasper Stephenson, "A UX Analysis of FPS Damage Indicators" https://medium.com/@jasper.stephenson/a-ux-analysis-of-first-person-shooter-damage-indicators-59ac9d41caf8 ; Autodesk Scaleform directional hit https://help.autodesk.com/cloudhelp/ENU/Scaleform-Help/scaleform_help/hud_kit/hud_view/directional_hit.html

### 15. Weapon numbers (pistol, pump shotgun)
- Pump shotgun: ~1 shot/s is typical (Fortnite pump 0.8 shots/s, GTA 75 RPM = 0.8 s, Q3 1 shot/s). 10–16 pellets. Classic Doom shotgun aggregate horizontal spread averages ~5.9° [SEC, wikis]. The post-shot delay should last only as long as the pump animation [SEC, Doomworld].
- [DEFAULT] pistol: semi-auto, cap at ~6–8 shots/s (a 120–160 ms cooldown) so clicking fast is rewarded but capped. 12–15 round magazine, ~1.2–1.5 s reload. First-shot accuracy perfect; small bloom on spam.
- [DEFAULT] pump: 8–10 pellets in a fixed pattern (not random), so it can be learned, cone ~6–8°. Pump at ~0.75–0.9 s. Shell-by-shell reload (~0.45–0.55 s per shell) that **can be interrupted by fire at any time**, with each shell counted when it goes in.
- Reload cancel rules: Halo Infinite lets you interrupt reloads at any time [SEC]. The common rule: the magazine counts only once it is "seated", so a cancel before that point keeps the old count [SEC]. For a pistol, count at the mag-insert frame (~60% through). Sprint/shove cancels a reload.
- Sources: Doom Wiki, Shotgun https://www.doomwiki.org/wiki/Shotgun ; GTABoom pump shotgun https://www.gtaboom.com/weapons/pump-shotgun-b502 ; Q3JS shotgun https://q3js.com/weapons/shotgun ; Doomworld, "Top 6 mistakes ... designing shotguns" https://test.doomworld.com/forum/topic/118513-top-6-mistakes-moddersgame-devs-make-when-designing-shotguns-in-their-fpss ; reload timing guide https://www.itechguides.com/how-to-time-reloads-safely-in-competitive-fps-games/

### 16. Muzzle flash and shell ejection
- A flash makes the weapon feel alive and briefly disorients the shooter, like recoil. Players often find big flashes unrealistic, so keep it small [SEC, dev forum].
- [DEFAULT]: 1–2 rendered frames (~30–50 ms) of a random-rotation flash sprite + a PointLight (intensity spike, decay in ~50 ms; reuse one light, don't create new ones, because three.js recompiles shaders when the light count changes). Shell: a pooled mesh, eject velocity up-right 1.5–2.5 m/s + spin, ~1 s life, with a tink sound when it hits the floor. Shotgun shell ejects on the *pump*, not the shot.
- Source: Roblox dev forum, "Making gun recoil feel more alive" https://devforum.roblox.com/t/making-gun-recoil-feel-more-alive/782763 ; The Astronauts, "Making gun come to life" (Witchfire; camera shake + flash on fire) https://www.theastronauts.com/2019/03/making-gun-come-to-life/

---

## P2: encounter, movement, assists

### 17. Movement
- Reference speeds (Valve HL2/CS:S, 1 unit ≈ 1 inch ≈ 2.54 cm): walk 150 u/s ≈ 3.8 m/s, run 190 u/s ≈ 4.8 m/s, sprint 320 u/s ≈ 8.1 m/s. The wiki's own km/h figures (10.3/13/21.9) agree. Quake 320 u/s. Carmack slowed Quake's player down vs Doom to make small levels feel bigger [SRC].
- Lesson for a hospital: slower movement = bigger-feeling corridors and more horror. [DEFAULT] walk 3.5–4 m/s, sprint 5.5–6.5 m/s, backpedal 70–80% of walk. Accelerate to full in ~0.1–0.15 s, decelerate in ~0.08–0.12 s (snappy, not icy). Zombie shamble 1–1.5 m/s, runner 4–5 m/s (just under player sprint, so escape is possible but tense).
- Sources: Valve Developer Wiki, Dimensions https://developer.valvesoftware.com/wiki/Dimensions_(Half-Life_2_and_Counter-Strike:_Source) ; PC Gamer on Quake vs Doom speed https://pcgamer.com/quakes-player-speed-was-slower-than-dooms-and-heres-why

### 18. Horde pacing and telegraphing (L4D AI Director)
- Booth (GDC): the Director controls zombie placement and pacing, with build-up, peak, relax tempo cycles [SRC, coverage]. Hordes are triggered by events (alarm, Boomer bile) or by a long lull with no combat [SEC].
- Audio as information: Valve's audio talk treated every zombie sound, line and note of music as a potential clue. Each special infected has its own musical "tell". The music acts as a second Director [SEC, audiogang wrap-up].
- Back 4 Blood's Director also changes conditions (fog, darkness) and where things spawn [SRC, Inverse interview].
- Doom "push forward combat": enemies are the resource pickups (ammo, health, armour) so the player attacks instead of hiding. Fast movement, distinct weapons, strong AI archetypes [SRC, GDC 2018 coverage].
- [DEFAULT] for this game: every spawn gets a 1–2 s tell (a door bangs, a vent rattles, a scream from the direction it will come from, a light flickers). Never spawn in view or behind the player within ~8 m. Each zombie type gets a unique idle sound audible at 10–15 m. Run waves in cycles: ~20–40 s of pressure, then 10–20 s of quiet for reloading and looting. Ammo: drop it from kills (shove-kill or finisher → shotgun shells) so pressing forward pays, Doom style.
- Sources: Shacknews, L4D at GDC https://www.shacknews.com/article/57892/left-4-dead-at-gdc ; Game Developer, "The discomfort zone: the hidden potential of Valve's AI Director" https://www.gamedeveloper.com/design/the-discomfort-zone-the-hidden-potential-of-valve-s-ai-director ; GANG summer summit 2010 (Valve audio) https://www.audiogang.org/valve-gang-summer-summit-2010-wrapup/ ; Inverse, Back 4 Blood interview https://inverse.com/gaming/back-4-blood-matt-odriscoll-interview-ai-card-system ; GDC Vault, "Embracing Push Forward Combat in DOOM" https://gdcvault.com/play/1024940/Embracing-Push-Forward-Combat-in ; Game Developer, Doom Eternal resource management https://www.gamedeveloper.com/design/the-aggressive-resource-management-of-i-doom-eternal-i-

### 19. Aim assist (useful even on mouse, and essential on touch or gamepad)
- Three parts (Halo/Destiny vocabulary): **friction/slowdown** (look sensitivity drops while the reticle is over a target), **magnetism** (reticle pulled toward the target; Halo game files call friction "magnetism"), **bullet bending / auto-aim** (shots bend toward a target inside a small cone; Halo's red reticle tells you it is active) [SEC, Halopedia/Destiny wiki].
- Halo applies bullet bending on mouse and keyboard too. Friction and magnetism are controller-only [SEC]. Griesemer: "If it's an enemy, we can assume that when you slow down, you're trying to aim" [SRC, Engadget interview].
- GDC Vault has "Techniques for Building Aim Assist in Console Shooters" (magnetism, centering, friction) [SRC, title only].
- [DEFAULT] for mouse: no friction or magnetism. A small bullet-bend cone (~1–1.5° for the pistol, against the head hitbox only: a near-miss to the head becomes a headshot), and generous zombie hitboxes (+10–15%). For gamepad or touch: friction to 40–60% sensitivity inside ~3°, light magnetism only while the player is moving.
- Sources: Halopedia, Aim assist https://www.halopedia.org/Aim_assist ; Destiny wiki, Aim Assistance https://d2.destinygamewiki.com/wiki/Aim_Assistance ; Engadget, "Half-Minute Halo: An Interview with Jaime Griesemer" https://www.engadget.com/2011-07-14-half-minute-halo-an-interview-with-jaime-griesemer.html ; GDC Vault, "Techniques for Building Aim Assist" https://www.gdcvault.com/play/1017942/Techniques-for-Building-Aim-Assist ; Game Developer, Titanfall controls (studied Halo CE's aim assist and stable camera) https://www.gamedeveloper.com/design/designer-interview-getting-i-titanfall-i-s-controls-just-right

### 20. "Juice" philosophy and its limit
- Juice It or Lose It (Jonasson and Purho, GDC Europe 2012): no new mechanics, just tweening/easing, colour, particles, shake and sound layered on Breakout. "Art of Screenshake" (Nijman): about 30 small tweaks to a dull shooter.
- Counterpoint: too much juice costs readability and immersion. Overwatch players complain about visual overload [SEC]. Horror needs restraint: keep the juice on *your* shots and *their* bodies, keep the screen clear otherwise.
- Sources: GDC Vault, "Juice It or Lose It" https://gdcvault.com/play/1016487/ ; Game Developer on Vlambeer talk https://gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games ; Overwatch feedback thread https://us.forums.blizzard.com/en/overwatch/t/ow2-has-visualacoustic-feedback-problems/680537

---

## Top 10 for a small browser zombie shooter

1. **Same-frame feedback.** Fire on `pointerdown`. Flash, sound, kick and hitscan all on that frame. Target under 100 ms total.
2. **A layered gunshot through Web Audio**: transient + body + mechanical + room tail (convolver per room), ±4% pitch, 3–4 variants. The pump rack is its own "ready" sound.
3. **Split spring-based recoil**: camera kick (visual, self-recovering on mouse) + viewmodel kick, impulses adding up, return slower than kick. Shotgun ≈ 3–5° plus a quick FOV punch, pistol ≈ 1–1.5°.
4. **Zombies react to every hit**: additive, upper-body, direction-picked flinch, or procedural bone impulses. Head snap on headshots. Shotgun and shove stagger and break attacks.
5. **L4D2-style ellipsoid wound cutting** in a `onBeforeCompile` shader (max 2 per zombie) + 4–6 pre-cut limb stumps (KF2 idea, smaller). Persistent, capped blood decals.
6. **Trauma-based shake** (trauma², Perlin noise, rotation only), with a separate shake slider and a head-bob slider that has a true off (Xbox AG 117).
7. **Separate viewmodel pass** (own camera, ~50–60° vertical, `clearDepth`) with look lag, walk bob on the gun rather than the camera, and idle breathing. World FOV set as vertical (90 h ≈ 59 v at 16:9).
8. **Hit-stop only on the target, only on big hits** (shotgun point-blank, headshot kill, shove: 40–100 ms), never on the player's camera.
9. **A short hit marker + a distinct headshot/kill sound**, no damage numbers. Player hurt: a vignette sized to the damage + a directional arc that fades over ~1 s + a camera punch away from the hit.
10. **Director-lite pacing**: every spawn telegraphed by sound from its direction 1–2 s before, a unique sound per zombie type, pressure/relief cycles, Doom-style ammo from kills. The slow-motion finisher is authored (not ragdoll), the world at 0.2–0.3×, audio low-passed, and the stagger window longer than the walk to the target.
