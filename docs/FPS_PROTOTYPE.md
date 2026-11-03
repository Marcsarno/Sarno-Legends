# FPS prototype

An experiment next to the deckbuilder, not a replacement: Sarno Legends as a first-person zombie shooter. Its own page,
`fps.html` (code in `src/fps/`), on the `fps-prototype` branch only. The live game on `main` is untouched.

## What it is
One player (Yola, purple nitrile gloves), first person, in a hospital built for a shooter. Three large open floors
link through short corridors: the ER lobby, an open ward and an atrium cafeteria. Each floor has its own wave of
zombies, coming through dark doorways on several sides. Pillars and hospital props give cover. Clearing a floor opens
the swing doors to the next. You find a pump shotgun in the first corridor. Medkits and ammo lie around, and zombies
sometimes drop them. Clear the atrium to win; lose at 0 HP. (Marc fighting beside her was the first prototype; Marc
dropped him: "we're just having one character".)

**The deckbuilder's rule carries over: stagger, then finish.** A shove or a leg shot staggers a zombie (amber ring).
Staggered zombies take +50% damage, like Vulnerable. Killing a staggered zombie plays a slow-motion finisher with
letterbox bars and its head coming off.

**Gore** (ported from yola-zombie's `ZombieView.sever` / `burstHead` / `cutByWeights`): a lower leg or forearm shot can
come off. A zombie that loses a leg drops and stays down, staggered for good. Headshots pop or burst the head, and the
shotgun up close tears arms off. The nurse, the modded patient and the brute use their modular parts and `GORE_*` wound
caps. The others are cut from their skin weights.

**The hands** (Marc: "a Mixamo or Quaternius body where the hands are just perfect on the gun"):
- Mixamo's Y Bot, loaded straight from its FBX, holding the pistol in its own Mixamo two-handed idle.
- The pistol reload is the Quaternius Universal Animation Library's Pistol_Reload (CC0). The view blends into that
  clip's own framing for the reload, so the gun stays in front of you.
- The shotgun has no first-person clip in any of our libraries. It sits in the right hand down the crosshair, and
  two-bone IK puts the left hand on the pump, so the hand rides the pump on every shot. It reloads shell by shell, the
  left hand carrying each shell to the port, then a pump.
- Only the hands and gun show: they draw in their own pass with a narrower lens (54°).

**Zombie pathing:** a flow field over a 0.5 m grid of the floor plan, rebuilt when a door opens and re-flooded from the
player 3 times a second. Zombies walk downhill on it, round furniture and through doors, and straight at you for the
last couple of metres.

## Controls
- **Desktop:** click Start (pointer lock). WASD move, mouse look, click shoot, R reload, Space / E / right-click shove,
  1 / 2 / Q / wheel swap, Shift run, F torch. Esc pauses.
- **iPhone (landscape):** left thumb anywhere on the left = stick, drag on the right = look, FIRE (drag it to aim while
  shooting), SHOVE, R, ⇄ swap, ☀ torch. The touch guard is installed.

## What it reuses from the deckbuilder
- The pistol and shotgun models, held by `weapons.js` (the pistol with its Rig Lab fit).
- Zombies: every model and its walk / sprint / scratch / hit / stumble / death clips (`death_headshot_knees` for
  headshots, `death_chest_back` / `knockback` for the shotgun).
- `fx.js` (blood, pools, tracers, sparks, blasts), `audio.js` banks (pistol, shotgun, zombie, finisher, pickups) and
  Marc's music (tension while exploring, `ch2_c_action` in fights, victory / defeat), the hospital kit props, wall and
  floor textures, `touchguard.js`.
- New files (all in `CREDITS.md`): the Mixamo Y Bot FBX, the Quaternius UAL pistol clips (CC0) and the shell prop,
  copied from yola-zombie.

## Felt good / bad (before Marc has played this version)
- Good: the stagger-then-finish loop reads instantly in first person; leg shots that take a leg off and drop the zombie
  are satisfying; the bot's hands sit right on the pistol; the open floors give room to back off and use cover.
- Rough: the floors are blockout walls with kit props; the shove uses no clip of its own (the hands lunge
  procedurally); the shotgun's left hand is IK, not an authored clip; performance on an iPhone isn't measured yet.

## Research
Three research passes (game feel, phones, touch controls) and the plan they point to: `docs/fps-research/`.

## Ideas
- A crawl clip so legless zombies drag themselves at you.
- Magazine props in the pistol reload (yola-zombie has the timings: drop at frame 6, insert 23-28).
- The phone aim help from the research (auto-fire on target, aim friction), then the frame-rate governor.
- The Quaternius mannequin (the body the UAL clips were made on) in place of the Y Bot, if Marc uploads it.
