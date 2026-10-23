# Sarno Legends: combat design, draft 2 (for review)

Context: a family-made, phone-friendly, turn-based battle RPG. Marc (bearded husband) and Yola (wife) fight zombies in a hospital and a South Florida neighborhood. Painted 2D battle backgrounds, 3D animated characters (existing Mixamo/Quaternius-rigged models with ~90 clips each; zombies have ~20 clips each). Reference games: Raid: Shadow Legends, Marvel Strike Force, FF7/8/10. Goal: real strategy, rewarding but never frustrating or stressful. Party is usually just Marc + Yola. Nothing is built yet.

## Research consensus used
1. Visible turn order with preview of how your move shifts it (FF10 CTB). No clock.
2. Every enemy shows its next move: icon + target + damage number (Slay the Spire intents).
3. Break: wear down a stagger bar -> enemy loses a turn, takes +50% damage (Octopath, FF7R).
4. Shared resource: basics earn, skills spend (Star Rail skill points).
5. Both heroes matter every turn, including the enemy's turn, via optional timed taps (Mario & Luigi, Expedition 33).
6. Little RNG, short fights, instant retries.

## Roles (trinity with two)
- Marc: tank + breaker. Protects Yola, breaks shields/stagger. Damage peaks on breaks.
- Yola: healer + buffer + finisher. Heals, pushes Marc up the timeline, interrupts, +50% damage to broken enemies.

## Rules
- Turn order: speed-based timeline (action value = 10000/SPD), preview before confirm.
- Grit: shared pool, start 3, max 5. Basic +1. Skills cost 1-2.
- Stagger bar per enemy; damage types Blunt/Blade/Gun; weakness = 2x stagger. Broken = loses next turn, +50% damage taken.
- Per-hero ultimate meter.
- Timed taps (optional): perfect attack +25%; on enemy hit: good = -30% damage, perfect = -60% + counter. Settings Story (wide window + auto "good"), Normal, Auto.
- Damage = ATK x Power% x K/(K+DEF), K = 100 + 10 x attacker level; +/-5% variance; crit x1.5 (5-10%); heroes never miss.
- Stats Lv1 (x3.03 at Lv30, linear 7%/level; SPD flat increments):
  Marc HP 400 ATK 50 DEF 30 SPD 100 crit 10%
  Yola HP 300 ATK 40 DEF 20 SPD 108 crit 5%

## Marc (Power = % of ATK; Lv1 dmg vs Walker DEF 20)
| Move | Clip | Power | Lv1 dmg | Stagger | Grit | CD | Effect |
| Bat Swing (basic) | bat_swing | 100 Blunt | 42 | 2 | +1 | - | builds Grit |
| Home Run | melee_horizontal (real home-run fbx not yet baked on Marc) | 180 Blunt | 76 | 4 | 2 | - | target -30% turn meter |
| Cleave | ual_Sword_Heavy_Combo -> gs_low_slash | 110 Blade AoE | 47 each | 1 each | 2 | 2 | all enemies -20 SPD 2 turns |
| Cover (defend) | ual_Sword_Block | - | - | - | 0 | 2 | attacks on Yola redirect to Marc, Marc -40% dmg taken; perfect block -> t_kick_01 counter 60 |
| Sarno Slam (ult) | Sword_Heavy_Combo + taps -> hub_execution_B_uppercut | 300 Blunt | 127 | 6 | - | meter | executes non-boss <25% HP |
Marc ult meter: +10 per hit taken, +15 per hit taken for Yola.

## Yola
| Move | Clip | Power | Lv1 dmg | Stagger | Grit | CD | Effect |
| Scalpel Flurry (basic) | ual_Sword_Regular_A/B/C | 100 Blade | 34 | 1 | +1 | - | perfect last tap marks target: Marc's next hit on it crits |
| Patch Up (heal) | no clip yet | heal 200% ATK | 80 | - | 2 | - | +50% (120) on a covering Marc; overheal -> shield |
| Adrenaline (buff) | ual_Sword_Dash -> t_greet_01 | - | - | - | 2 | 3 | Marc +25% ATK 2 turns, +40% turn meter |
| Stopper Shot | t_shoot | 70 Gun | 24 | 2 | 1 | 3 | cancels a charged enemy move |
| Sidestep (defend) | ual1_Dodge_L/R, ual1_Roll | - | - | - | 0 | 2 | dodge next attack; perfect refunds 1 Grit |
| Code Blue (ult) | ual_Slide -> ual_KipUp | heal 50% each | - | - | - | meter | heals both, revives Marc, cleanses Acid, +2 Grit |
Yola ult meter: +20 per heal, +15 per perfect dodge. Passive Steady Hands: +50% damage to broken enemies.

## Duo moves (3 Grit; partner's next turn pushed back 50%)
- Batter Up: Yola kick launches -> Marc bat swing; 250 Blunt (106), 8 stagger; alternating taps.
- Lights Out: Yola slide -> Marc shotgun-slide execution; kills a broken non-boss; 400 on a boss.
- Cover Fire: Marc blocks in front, Yola fires from behind; Marc covers party this round; Yola returns 50 Gun on each attacker.

## Zombies (Lv1; dmg shown vs Marc/Yola)
| Zombie | HP | ATK | DEF | SPD | Stagger/weak | Moves | Counter |
| Walker | 75 | 50 | 20 | 85 | 3 / Blunt | Scratch 100 (39/42); Grab & Bite telegraphed 160 (63/68), heals self | Home Run it back / knock down. Blade kills leave a 25 HP crawler |
| Nurse | 70 | 35 | 15 | 95 | 3 / Gun | Scratch 80 (22/24); Revive (kneels a turn ahead) raises fallen zombie at 50% | kill first or Stopper Shot |
| Orderly | 160 | 45 | 60 | 80 | 6 / Blade | Body Slam 120 (42/46); Restrain: grabbed hero skips turns until partner hits Orderly twice | teamwork |
| Sprinter | 55 | 40 | 10 | 125 | 2 / Gun | Lunge 110 (35/37), ignores Cover, targets lowest-HP hero, acts ~1.5x | Cleave slow, perfect Sidestep counter |
| Acid Lady | 65 | 35 | 15 | 100 | 3 / Gun | Spit 60 (17/18) + Acid 6% HP/turn stacking; Acid Burst telegraphed 120 both (33/36); back row: only Gun + Home Run reach her while others stand; headshot kill = no acid, other kills splash acid | Stopper Shot the burst; Code Blue cleanse |
| Shield Guard (boss) | 1000 | 70 | 40 | 95 | shield bar 12 (Blunt/Gun only) | Shield Bash 120 (66/71); Shield Dash at Yola 150 (89; Cover intercepts); Leap Slam every 3rd turn telegraphed 200 both (110/118) + knockdown, Cover can't stop, only timed Sidestep | 1st break -> arm off (no more Bash); 2nd break -> head off (kill) |

## Not stressful
- Turn order + intents always visible; heroes never miss; +/-5% variance; crit 5-10%.
- Last Stand: above 50% HP, a lethal hit leaves 1 HP, once per fight per hero.
- Full heal after every fight on Story/Normal; Hard heals at checkpoints only.
- Instant retry from fight start; after 2 losses offer "ease up" (-15% zombie HP).
- Fights 3-4 rounds normal, 5-7 elite, 8-12 boss with a phase change at 50%. 2x speed + auto for repeat fights.
- Targets: walker dies in 2 hits; party takes ~15% HP per round; one heal covers ~2 rounds; Yola heals ~1 turn in 3.
- Difficulty: Story zombie ATK x0.7 HP x0.8; Normal x1; Hard ATK x1.25 HP x1.2.
- Each new zombie type appears alone first.

## Chapter shape (10 battles)
1-2 walkers; 3 nurse alone; 4 mix; 5 breather; 6 elite; 7 sprinter + orderly; 8 breather; 9 elite + 2; 10 Shield Guard. ~3 hero levels per chapter; zombies on the same growth curve.

## Animation gaps
Yola heal clip (kneeling pick-up/interact from Marc's neighborhood pack could be put on her, or a new Mixamo clip); a buff clip; bake the home-run clip onto Marc; confirm origin/licence of the t_ clips (Kevin Iglesias clips can't ship).
