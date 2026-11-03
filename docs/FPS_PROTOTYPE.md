# FPS prototype

An experiment next to the deckbuilder, not a replacement: Sarno Legends as a first-person zombie shooter. Its own page,
`fps.html` (code in `src/fps/`), on the `fps-prototype` branch only. The live game on `main` is untouched.

## What it is
Yola in first person in the hospital: an ER lobby, a corridor and a ward, one wave of zombies per room. Clearing a room
opens its swing doors. Marc fights beside her with his bat. You find a pump shotgun in the corridor. Medkits and ammo lie
around, and zombies sometimes drop them. Win when the ward is clear; lose at 0 HP.

**The deckbuilder's rule carries over: stagger, then finish.** A shove, a leg shot or a hit from Marc's bat staggers a
zombie (amber ring over its head). Staggered zombies take +50% damage, like Vulnerable. Killing a staggered zombie plays a
slow-motion finisher with letterbox bars and its head coming off. Marc goes for zombies that aren't staggered yet: he
staggers, Yola finishes.

**Gore** (ported from yola-zombie's `ZombieView.sever` / `burstHead` / `cutByWeights`): a lower leg or forearm shot can
come off. A zombie that loses a leg drops and stays down, staggered for good. Headshots pop or burst the head, and the
shotgun up close tears arms off. The nurse, the modded patient and the brute use their modular parts and `GORE_*` wound
caps. The others are cut from their skin weights.

## Controls
- **Desktop:** click Start (pointer lock). WASD move, mouse look, click shoot, R reload, Space / E / right-click shove,
  1 / 2 / Q / wheel swap, Shift run, F torch. Esc pauses.
- **iPhone (landscape):** left thumb anywhere on the left = stick, drag on the right = look, FIRE (drag it to aim while
  shooting), SHOVE, R, ⇄ swap, ☀ torch. The touch guard is installed.

## What it reuses from the deckbuilder
- Yola's own `yola.glb` rig for the arms: her `pistol_idle` and `rifle_aim_idle` holds. Only her hands and the gun show:
  she draws in her own pass with a narrower lens (54°), pulled back so the arms run off-screen, with a near clip plane.
  Her full-body reload clips swing the gun round her body and read badly in first person, so reloads are a procedural
  tilt and slap / pump pivoting on her hands (Marc's note: "you should really only see the hands and the gun").
- `weapons.js` holds the pistol and shotgun exactly as in the battles (Rig Lab fits), and Marc's wood bat.
- Zombies: every model and its walk / sprint / scratch / hit / stumble / death clips (`death_headshot_knees` for
  headshots, `death_chest_back` / `knockback` for the shotgun).
- `fx.js` (blood, pools, tracers, sparks, blasts), `audio.js` banks (pistol, shotgun, zombie, finisher, pickups) and
  Marc's music (tension while exploring, `ch2_c_action` in fights, victory / defeat), the hospital kit props, wall and
  floor textures, `touchguard.js`.
- No new downloaded assets.

## Felt good / bad (first pass, before Marc has played it)
- Good: the stagger-then-finish loop reads instantly in first person; leg shots that take a leg off and drop the zombie
  are satisfying; Marc swinging next to you gives the fight company.
- Rough: the rooms are blockout walls with kit props; zombies walk straight at you (no real pathing around props);
  the shove uses no clip of its own (the arms lunge procedurally); Marc can stand in your line of fire (bullets pass
  through him); performance on an iPhone isn't measured yet.

## Research
Three research passes (game feel, phones, touch controls) and the plan they point to: `docs/fps-research/`.

## Ideas
- Marc's own finisher when he hits a zombie Yola has staggered (`hub_execution_B_uppercut`).
- A crawl clip so legless zombies drag themselves at you.
- Use the painted rooms' lighting rigs per room, and the deckbuilder's auto quality step-down on phones.
- Swap who you play (Marc in first person with the bat).
