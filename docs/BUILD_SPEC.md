# Build spec v1: Act 1, playable start to finish

The contract the build works to (2026-10-23). `GAME_CORE.md` is the design; this page turns it into modules, data and numbers.
Where this page and GAME_CORE disagree on a number, GAME_CORE's [StS, memory] numbers are being checked in `STS_NUMBERS_CHECK.md`; apply its corrections here.

Goal (Marc): "a fully playable loop start to finish like act one of slay the spire. Weapon unlocks can be sort of the artifact system." Polish, organisation, balance and feel.


> **Build corrections (2026-10-23).** The engine follows `STS_NUMBERS_CHECK.md` and the balance sim; the tables below are updated where a number changed. Rules that changed:
> - Party debuffs tick at the end of the round (after the zombies' turn), so Staggered 2 from a zombie lasts through two of your turns, as in StS.
> - Spiked (Shield Guard) hits once per Attack card, not per hit; Mode Shift counts HP lost after block.
> - Hunch triggers after the attack's last hit.
> - Sleeping Patient: stunned only when damage wakes it; a timer wake (after 3 turns) attacks right away; Plating is removed on waking.
> - Shield Guard: on the switch it gains 20 block, then spends a turn raising Spiked 3 before Shield Charge.
> - Treasure: chest size first (small 50 / medium 33 / large 17); relic rarity by size 75/25/0, 35/50/15, 0/75/25; gold not guaranteed (small 50% 23–27, medium 35% 45–55, large 50% 68–82).
> - Card rarity pity: shortfall below zero comes out of uncommon; offset capped at +40; shop rolls don't move it.
> - Map: no rest site on row 14; room odds are shares of the whole map.
> - Potion prices: common 48–53, uncommon 71–79.
> - Finishers only count when a hero's attack lands the kill (not Bleed, potions or relics).

## 0. Ground rules for everyone building

- **Copy mechanics, never Slay the Spire's names, text or art.** All names below are ours.
- **Story is Marc's.** Event text and flavour lines are placeholders; keep them short, neutral and in the hospital world (Yola's hospital, Marc fighting beside her). Don't invent canon (no backstory, no named NPCs beyond what's here).
- **Asset repos are read-only.** All assets are already in `public/assets/` (built by `npm run assets`, list in `public/assets/manifest.json`). Don't edit `public/assets/models/` by hand.
- **No `t_` / `tripo_` / `kev_` clips** (licence). The build pipeline already strips them.
- **Plain JS (ES modules), Vite, three 0.186, no UI framework.** DOM + CSS for UI, three.js for the battle stage and renders.
- **Phone-friendly landscape**: everything must work at 844×390 (phone landscape) up to 1920×1080. Touch and mouse. Use `vmin`/`clamp()` sizing.
- **Don't run `npm install`** (all deps are installed). **Don't commit.** Only touch the files you own (listed per module).
- Every module documents itself with a short header comment, in the voice of the existing tools (plain, specific).

## 1. Layout

```
index.html                 the game
src/main.js                boot + app state machine (integration)
src/app/                   app shell: router, screens wiring, save/continue, debug API (integration)
src/game/                  PURE logic. No DOM, no three. Runs in node for tests and the balance sim.
  rng.js                   seeded RNG with named streams
  combat.js                combat engine (state + event log)
  effects.js               card/potion/enemy effect interpreter
  run.js                   run state, node entry, rewards, rest, shop, events, treasure
  map.js                   map generation (StS rules)
  meta.js                  scrap, weapon unlocks, profile, settings, stats (pure functions over a profile object)
  content/cards.js         CARDS
  content/statuses.js      STATUSES
  content/enemies.js       ENEMIES
  content/encounters.js    ENCOUNTERS + pools
  content/relics.js        RELICS (incl. weapons as rarity 'weapon')
  content/potions.js       POTIONS
  content/events.js        EVENTS (locked rooms)
  content/weapons.js       WEAPONS (meta unlock tree; each grants a weapon relic + card swaps)
  text.js                  card/relic/status text rendering with live numbers
src/render/                three.js
  stage.js                 renderer, battle camera, lights, room backdrop, world→screen anchors, frame loop
  assets.js                GLB loading/caching (Meshopt), character factory
  actor.js                 Actor: animation state machine, dash/lunge, hit/death, weapon attach, highlight
  weapons.js               weapon models + hand fits
  fx.js                    particles, flashes, shake, hit-stop, floating numbers (world-anchored DOM or sprites)
  director.js              turns combat events into a paced animation timeline
  painter.js               painted room backdrops built from the hospital kit (kuwahara/paint shader)
  studio.js                card art stills, relic/potion/weapon icons rendered from models
src/ui/                    DOM
  dom.js tween.js icons.js tooltip.js
  card.js hand.js targeting.js hud.js piles.js
  screens/ title.js map.js reward.js rest.js shop.js event.js treasure.js result.js armory.js settings.js deck.js picker.js intro.js
  styles/ *.css
src/audio/ audio.js sfx.js music.js
tools/  build-assets.mjs snap.mjs playtest.mjs sim/
tests/  *.test.mjs (node --test)
public/assets/ ... public/build-log/ ...
```

## 2. Game data model (shared by everyone)

```js
// a card in a deck / pile
CardInst = { uid: 'c17', id: 'bat_swing', up: false }        // up = upgraded (+)

Run = {
  version: 1, seed: 'ABC123', act: 1, floor: 0,              // floor = rows climbed (0 before the first room), boss = 16
  hp: 80, maxHp: 80, gold: 99,                               // "Supplies" in the UI
  deck: [CardInst], relics: [{ id: 'nurses_kit', counter: 0 }], potions: [null, null, null],
  weapons: { marc: 'wood_bat', yola: 'pistol' },             // equipped from the meta armory at run start
  map: Map, node: null | nodeId, path: [nodeId],             // path = visited nodes
  rng: { map, cards, shuffle, ai, potions, relics, events, misc },   // serialisable stream states
  odds: { cardRare: -5, potion: 40, unknown: { fight: 10, treasure: 2, shop: 3 } },
  shop: null | ShopState, removals: 0,
  screen: 'neow'|'map'|'combat'|'reward'|'rest'|'shop'|'event'|'treasure'|'victory'|'defeat',
  pending: null | { kind, ... },                             // what the current screen is resolving (combat, reward list, event step…)
  stats: { kills: 0, damageTaken: 0, cardsPlayed: 0, fights: 0, elites: 0, floorsCleared: 0, log: [] },
  over: false, won: false,
}
Map = { rows: 15, width: 7, nodes: { [id]: { id, row, col, x, y, type, next: [id] } }, starts: [id], boss: id }
// node.type: 'fight'|'elite'|'rest'|'shop'|'event'|'treasure'|'boss'   ('event' = the "?" locked room)
```

## 3. Combat engine contract (`src/game/combat.js`)

```js
const c = createCombat({ run, encounter: 'shambler_solo', rng, opts })   // rng = run's streams; opts.debug
c.start()                       // shuffles, innate, relic/weapon onCombatStart, enemy onSpawn, rolls intents, starts turn 1
c.state                         // see below (read-only for callers)
c.canPlay(uid, targetUid?)      // { ok, reason: 'energy'|'unplayable'|'target'|'phase' }
c.playCard(uid, targetUid?)     // resolves fully (may kill, may end combat)
c.usePotion(slot, targetUid?)   // run.potions slot
c.discardPotion(slot)
c.endTurn()                     // end-of-turn effects, discard, ENEMY TURN (all enemies act in order), next player turn
c.previewCard(uid, targetUid?)  // { damage: [n per hit], hits, block, total } with live statuses, for card text and hover numbers
c.intentOf(enemyUid)            // { type, damage, hits, total } with live statuses
c.takeEvents()                  // drains the event queue (array, in order)
c.result()                      // when over: { won, hp, potions, relicCounters, goldStolen, kills, turns, damageTaken, killedBy }
```

State:
```js
{ turn, phase: 'player'|'enemy'|'won'|'lost', energy, maxEnergy,
  hand: [CardInst + {cost (current), costTurn?}], draw: [...], discard: [...], exhaust: [...],
  party: { hp, maxHp, block, statuses: { strength: 2, vulnerable: 1, ... } },
  enemies: [{ uid: 'e1', id: 'shambler', name, hp, maxHp, block, statuses, alive, slot: 0..4, intent: { move, type, damage, hits }, history: [moveId] }],
  counters: { attacksThisTurn, skillsThisTurn, cardsThisTurn, ... }, relics: [{ id, counter }] }
```

Rules (Slay the Spire):
- 3 energy, draw 5, max hand 10 (extra draws are skipped). Hand discarded at end of turn (except Retain). Draw pile empty → shuffle discard into draw (`shuffle` event).
- Party block clears at the start of the player's turn; enemy block at the start of the enemy's turn.
- Attack damage: `base (+ strength per hit)` → `×0.75 if attacker Weakened` → `×1.5 if target Staggered` (×1.75 with Hollow Points) → floor, min 0. Then block absorbs, the rest is HP loss.
- Block from cards: `base + agility` → `×0.75 if Shaken` → floor.
- Turn-based debuffs (Staggered, Weakened, Shaken) tick down by 1 at the end of the owner's own turn (player's at the end of the player turn; an enemy's at the end of the enemy turn). A debuff applied by an enemy during the enemy turn to the party therefore lasts through the next player turn.
- Bleed (Poison): at the start of the owner's turn, lose HP equal to Bleed (ignores block), then Bleed −1.
- Enemy intents are rolled at the start of the player's turn for the coming enemy turn (and at combat start). They are always shown and never change except via Mode Shift / stun / sleep.
- All enemies act left to right in the enemy turn. Dead enemies don't act.
- Combat ends immediately when all enemies are dead (won) or party HP ≤ 0 (lost, unless a revive relic/potion fires).
- Killing blow bookkeeping: each `damage` event carries `kind` and `staggered` (target had Staggered before the hit). A kill on a Staggered zombie is a **finisher** (`death.finisher = true`).

### Event contract (presentation reads these; the engine already applied them)
Every event: `{ t, ...payload }`. The director plays them in order; HUD numbers update when the matching event plays.
```
combat_start { enemies: [snapshot] }
turn_start   { side: 'player'|'enemy', turn }
energy       { energy, max }                        draw { uids: [...] }      shuffle { count }
discard      { uids }      exhaust { uid }         card_created { uid, id, to: 'hand'|'draw'|'discard' }
card_played  { uid, id, hero: 'marc'|'yola'|null, target: uid|null, anim, cost }
attack       { by: 'marc'|'yola'|enemyUid, target: uid|'party'|'all', anim, hits }     // the swing/shot starts
damage       { source, target, amount, blocked, hp, block, kind: 'light'|'heavy'|'gun'|'blast'|'bleed'|'thorns'|'self',
               staggered: bool, killed: bool, hit: 1, hits: 1, hero?: 'marc'|'yola' }    // hero = which hero took it (party target)
block        { target, amount, block }             heal { target, amount, hp }
status       { target, status, delta, total }       // total 0 = removed
death        { target: uid, kind, finisher: bool, by: 'marc'|'yola'|null, cardId }
enemy_move   { uid, move, name, type }              intent { uid, intent }
revive       { uid, hp }                            mode_shift { uid, mode: 'defensive'|'offensive' }
wake         { uid }                                stunned { uid }
relic        { id }                                 potion { id, target }
gold         { amount, total }                      escape { uid }
combat_end   { won }
```
`anim` hints (presentation picks clips): `melee_light, melee_heavy, melee_sweep, melee_combo, pistol, pistol_burst, shotgun, block, dodge, heal, buff, debuff, throw, none`.
The party is hit as a whole (shared HP); for show, an enemy's attack picks a hero: melee zombies hit **Marc** (the forward melee spot) unless Marc is "covering" nobody… keep it simple: alternate per enemy slot (even slots → Marc, odd → Yola) and put that in `damage.hero`.

### Effects mini-language (`effects.js`)
Cards, potions and enemy moves list effects; the interpreter runs them in order:
```
{ op: 'damage', n: 6, times?: 1, to?: 'target'|'all'|'random', kind?: 'light', bonusStaggered?: 5, scaleStr?: 1 }
{ op: 'block', n: 5 }      { op: 'apply', status: 'vulnerable', n: 2, to?: 'target'|'all'|'self' }
{ op: 'draw', n: 1 }       { op: 'energy', n: 1 }     { op: 'heal', n: 4 }     { op: 'loseHp', n: 3 }
{ op: 'addCard', id: 'panic', n: 2, to: 'discard' }    { op: 'exhaustSelf' }  { op: 'if', cond: 'targetStaggered'|'killed'|..., then: [...] }
{ op: 'custom', fn: (ctx) => {...} }   // escape hatch; ctx exposes the engine helpers
```
Upgrades: `up: { cost?, effects?: [...] (full replacement), keywords? }` (simple and explicit).

## 4. Content

Names in **bold** are what the player sees. "StS" column is only for us.

### Statuses
| id | Shown as | Kind | Rule |
|---|---|---|---|
| vulnerable | **Staggered** | debuff, turns | takes 50% more attack damage |
| weak | **Weakened** | debuff, turns | deals 25% less attack damage |
| frail | **Shaken** | debuff, turns | gains 25% less block |
| strength | **Strength** | buff (can go negative) | +N damage per hit |
| dexterity | **Agility** | buff (can go negative) | +N block from cards |
| bleed | **Bleed** | debuff, intensity | start of turn: lose N HP, N−1 |
| ritual | **Frenzy** | buff | end of its turn: gain N Strength (skips the turn it was gained) |
| plating | **Plating** | buff | end of turn: gain N block (Metallicize) |
| thorns | **Spiked** | buff | when attacked: attacker takes N |
| enrage | **Rage** | buff | whenever the player plays a Skill: gain N Strength |
| hunch | **Hunch** | buff | first time it takes attack damage: gain N block, then removed |
| immune | **Immune** | buff | negates the next N debuffs |
| asleep | **Asleep** | special | Sleeping Patient: skips turns; wakes when it loses HP or after 3 turns |
| mode_shift | **Shield Up** | special | Shield Guard: N damage until it switches to defensive mode |
| temp_strength | **Pumped** | buff | Strength that's lost at end of turn |
| swing_guard | **Swing Guard** | buff | this turn, attacks give N block |
| thick_skin | **Thick Skin** | power | end of turn: gain N block |
| berserker | **Berserker** | power | start of turn: gain N Strength |
| fortify | **Dug In** | power | block isn't removed at the start of your turn |
| marksman | **Marksman** | power | attacks deal +N damage to Staggered zombies |
| light_feet | **Light on Feet** | power | whenever you play a Skill, gain N block |
| dead_eye | **Dead Eye** | power | first 2 attacks each turn on a Staggered zombie draw 1 |

### Starter (11 cards): from GAME_CORE
| id | Name | Hero | Cost | Type | Effect | Upgrade | anim |
|---|---|---|---|---|---|---|---|
| bat_swing ×3 | **Bat Swing** | Marc | 1 | Attack | 6 dmg | 9 | melee_light |
| pistol_shot ×2 | **Pistol Shot** | Yola | 1 | Attack | 6 dmg | 9 | pistol |
| brace ×2 | **Brace** | Marc | 1 | Skill | 5 block | 8 | block |
| sidestep ×2 | **Sidestep** | Yola | 1 | Skill | 5 block | 8 | dodge |
| home_run | **Home Run** | Marc | 2 | Attack | 8 dmg, 2 Staggered | 10, 3 Staggered | melee_heavy |
| clean_shot | **Clean Shot** | Yola | 1 | Attack | 5 dmg; +5 if Staggered | 7; +7 | pistol |

### Marc's pool (red)
| id | Name | Rarity | Cost | Type | Effect | Upgrade | StS |
|---|---|---|---|---|---|---|---|
| crowbar_pry | **Crowbar Pry** | common | 1 | A | 6 dmg, 1 Staggered | 8, 2 | — |
| shoulder_check | **Shoulder Check** | common | 1 | A | 5 dmg, 5 block | 7, 7 | Iron Wave |
| wild_swing | **Wild Swing** | common | 1 | A | 8 dmg to ALL | 11 | Cleave |
| heavy_swing | **Heavy Swing** | common | 2 | A | 14 dmg; Strength counts ×3 | ×5 | Heavy Blade |
| one_two | **One-Two** | common | 1 | A | 5 dmg ×2 | 7 ×2 | Twin Strike |
| hold_the_line | **Hold the Line** | common | 1 | S | 8 block, draw 1 | 11 | Shrug It Off |
| deep_breath | **Deep Breath** | common | 0 | S | +2 Pumped (Strength this turn) | +4 | Flex |
| kick_the_door | **Kick the Door** | common | 1 | A | 5 dmg; if Staggered: +1 energy, draw 1 | 8 | Dropkick |
| haymaker | **Haymaker** | common | 2 | A | 12 dmg, 2 Weakened | 14, 3 | Clothesline |
| tackle | **Tackle** | common | 1 | A | damage = your Block | cost 0 | Body Slam |
| batter_up | **Batter Up** | uncommon | 2 | A | 8 dmg ×2; if Staggered draw 1 | 10 ×2 | our duo card |
| overhead_smash | **Overhead Smash** | uncommon | 2 | A | 14 dmg, 2 Staggered | 18, 3 | — |
| ground_pound | **Ground Pound** | uncommon | 1 | A | 4 dmg + 1 Staggered to ALL | 7 | Thunderclap |
| momentum | **Momentum** | uncommon | 1 | A | 8 dmg; +5 to this card each play this combat | +8 | Rampage |
| dig_in | **Dig In** | uncommon | 2 | S | double your Block | cost 1 | Entrench |
| thick_skin | **Thick Skin** | uncommon | 1 | P | end of turn gain 3 block | 4 | Metallicize |
| pumped_up | **Pumped Up** | uncommon | 1 | P | +2 Strength | +3 | Inflame |
| swing_guard | **Swing Guard** | uncommon | 0 | S | this turn, each attack gives 3 block | 5 | Rage |
| jaw_breaker | **Jaw Breaker** | uncommon | 2 | A | 13 dmg, 1 Weakened, 1 Staggered | 2/2 | Uppercut |
| wrench_arm | **Wrench Arm** | uncommon | 1 | S, exhaust | enemy loses 2 Strength | 3 | Disarm |
| grit_teeth | **Grit Teeth** | uncommon | 0 | S | lose 3 HP, +2 energy | +3 energy | Bloodletting |
| berserker | **Berserker** | rare | 3 | P | start of turn +2 Strength | +3 | Demon Form |
| grand_slam | **Grand Slam** | rare | 3 | A | 32 dmg | 42 | Bludgeon |
| bolt_the_door | **Bolt the Door** | rare | 2 | S, exhaust | 30 block | 40 | Impervious |
| fortify | **Fortify** | rare | 3 | P | block no longer clears at turn start | cost 2 | Barricade |
| make_it_count | **Make It Count** | rare | 1 | A, exhaust | 10 dmg; if it kills, +3 max HP | 12, +4 | Feed |
| rally | **Rally** | rare | 1 | S, exhaust | double your Strength | no exhaust | Limit Break |

### Yola's pool (teal)
| id | Name | Rarity | Cost | Type | Effect | Upgrade | StS |
|---|---|---|---|---|---|---|---|
| double_tap | **Double Tap** | common | 1 | A | 4 dmg ×2 | 6 ×2 | — |
| aimed_shot | **Aimed Shot** | common | 1 | A | 8 dmg; if Staggered draw 1 | 11 | — |
| kneecap | **Kneecap** | common | 1 | A | 6 dmg, 1 Weakened | 8, 2 | — |
| suppressing_fire | **Suppressing Fire** | common | 1 | A | 3 dmg + 1 Weakened to ALL | 5 | — |
| cover_him | **Cover Him** | common | 1 | S | 7 block; if any zombie is Staggered draw 1 | 10 | — |
| tuck_and_roll | **Tuck and Roll** | common | 1 | S | 5 block, draw 2 | 8 | Backflip |
| check_mag | **Check the Mag** | common | 0 | S | 2 block, draw 1 (no in-fight card choice yet) | 4 block | Prepared |
| flare | **Flare** | common | 1 | S | 1 Weakened to ALL, draw 1 | 2 Weakened | — |
| quick_shot | **Quick Shot** | common | 0 | A | 3 dmg | 5 | — |
| cheap_shot | **Cheap Shot** | common | 0 | A | 3 dmg; +4 if Staggered | 4; +6 | — |
| headshot | **Headshot** | uncommon | 2 | A | 10 dmg; +10 if Staggered | 13; +13 | GAME_CORE |
| triage | **Triage** | uncommon | 1 | S, exhaust | heal 4 | 6 | GAME_CORE |
| adrenaline_shot | **Adrenaline Shot** | uncommon | 0 | S, exhaust | +1 energy, draw 1 | +2 energy | GAME_CORE |
| marksman | **Marksman** | uncommon | 1 | P | attacks deal +3 to Staggered zombies | +4 | our pillar power |
| spray_and_pray | **Spray and Pray** | uncommon | 1 | A | 3 dmg to a random zombie ×3 | ×4 | Sword Boomerang |
| painkillers | **Painkillers** | uncommon | 1 | P | +2 Agility | +3 | Footwork |
| light_on_feet | **Light on Feet** | uncommon | 1 | P | whenever you play a Skill gain 1 block | 2 | — |
| triple_tap | **Triple Tap** | uncommon | 2 | A | 4 dmg ×3; +2 each if Staggered | 5 ×3; +3 | — |
| covering_fire | **Covering Fire** | uncommon | 1 | A | 4 dmg to ALL, 4 block | 6, 6 | — |
| clean_kill | **Clean Kill** | rare | 1 | A | 9 dmg; if it kills: +1 energy, draw 2 | 12 | — |
| overdrive | **Overdrive** | rare | 0 | S, exhaust | lose 6 HP, +2 energy, draw 3 | draw 5 | Offering |
| slow_motion | **Slow Motion** | rare | 3 | S, exhaust | your cards cost 0 this turn; you can't draw more this turn | cost 2 | Bullet Time |
| dead_eye | **Dead Eye** | rare | 1 | P | first 2 attacks each turn on a Staggered zombie draw 1 | cost 0 | — |
| defibrillator | **Defibrillator** | rare | 2 | S, exhaust | heal 12 | 16 | GAME_CORE (scarce heal) |
| point_blank | **Point Blank** | rare | 2 | A | 16 dmg; +10 if Staggered | 20; +14 | — |

### Status and curse cards (no hero)
| id | Name | Rule |
|---|---|---|
| panic | **Panic** | unplayable, Fleeting (exhausts at end of turn if in hand). Added by Orderlies |
| bile | **Bile** | costs 1, exhaust, does nothing. Added by the Spitter's spit? (no: Spitter applies Weak; Bile is from the Bloater's death in events) |
| infection | **Infection** | curse, unplayable; at end of turn while in hand lose 1 HP. From events |

### Zombies (StS act-1 templates, A0 numbers)
| id | Name | Model | HP | Moves (intent) | AI |
|---|---|---|---|---|---|
| shambler | **Shambler** | z_romero | 40–44 | Bite Down 11 (atk); Shamble 7 + 5 block (atk+def); Groan +3 Str, 6 block (buff) | Jaw Worm: first Bite Down; then Groan 45 / Shamble 30 / Bite 25, never Groan twice, never Shamble 3×, never Bite Down twice |
| biter | **Biter** | z_patient | 10–15 | Bite D (5–7 fixed per zombie); Grow +3 Str | Red Louse: Bite 75 / Grow 25, never same 3×; starts with Hunch 3–7 |
| spitter | **Spitter** | z_patient_mod | 11–17 | Bite D (5–7); Spit 2 Weakened (debuff) | Green Louse: Bite 75 / Spit 25; never same 3×; Hunch 3–7 |
| screamer | **Screamer** | z_girl | 48–54 | turn 1 Shriek (gain Frenzy 3); then Claw 6 every turn | Cultist |
| sprinter | **Sprinter** | z_sprinter | 10–14 | Lunge 9 every turn | kill-it-first pressure (Sneaky Gremlin) |
| nurse | **Nurse** | z_nurse | 28–32 | Jab 6; Mend: other zombies +5 HP, self 6 block; Revive: a dead zombie gets up at 50% HP (buff) | if a zombie died and revives < 2: Revive; else alternate Jab / Mend (Jab first) |
| bloater | **Bloater** | z_scrubs | 22–28 | Bite 6; Grow +3 Str; on death: Spore Burst, party gets 2 Staggered | Fungi Beast: Bite 60 / Grow 40, never Bite 3×, never Grow 2× |
| **Elite** big_walker | **Big Walker** | z_brute ×1.3 | 82–86 | turn 1 Roar (gain Rage 2); Charge 14; Headbutt 6 + 2 Staggered | Gremlin Nob: after Roar, Headbutt 33 / Charge 67, never Charge 3× |
| **Elite** sleeping_patient | **Sleeping Patient** | z_patient ×1.15, lying | 109–111 | Asleep (Plating 8) up to 3 turns or until it loses HP; wakes stunned 1 turn; then Flail 18, Flail 18, Drain (party −1 Strength, −1 Agility), repeat | Lagavulin |
| **Elite** orderly (×3) | **Orderly** | z_scrubs | 38–42 | Shove (add 2 Panic to discard; debuff); Swipe 9 | Sentries: alternate; middle starts with Swipe, sides with Shove. Each starts with Immune 1 |
| **Boss** shield_guard | **Shield Guard** | z_guard ×1.25 | 240 | Offensive cycle: Raise Shield (9 block) → Shield Bash 32 → Pepper Spray (2 Weakened, 2 Staggered on party) → Baton Flurry 5×4 → repeat. Shield Up 30: after taking 30 damage (40, 50… each later time) it switches to Defensive: gains 20 block and Spiked 3, then Shield Charge 9 → Double Slam 8×2 (loses Spiked, back to Offensive, continues with Baton Flurry) | The Guardian |

Presentation notes: the Sleeping Patient lies on a recovery bed (`ual_IdleToLay` held at its end / `ual_LayToIdle` or `patient_bed_rise` on wake). The Shield Guard's first switch to defensive plays `shield_break` (the arm/shield moment); at 0 HP the finisher (head comes off). Big Walker is the brute model scaled up.

### Encounters (act 1)
- **Easy pool** (first 3 fights): `shambler_solo`, `screamer_solo`, `biter_pair` (biter + spitter), `two_biters` (2 biters).
- **Hard pool**: `shambler_nurse`, `sprinters` (2 sprinters + biter), `three_biters` (biter, spitter, biter), `bloaters` (2 bloaters), `screamer_biter`, `horde` (shambler + 2 biters), `nurse_pack` (nurse + 2 biters).
- No repeat of the previous two encounters (StS rule).
- **Elites**: `big_walker`, `sleeping_patient`, `orderlies`. No same elite twice in a row.
- **Boss**: `shield_guard`.

### Relics (things found in the hospital)
| id | Name | Rarity | Effect | StS |
|---|---|---|---|---|
| nurses_kit | **Nurse's Kit** | starter | at the end of combat heal 6 | Burning Blood |
| duct_tape | **Duct Tape** | common | start each combat with 10 block | Anchor |
| coffee_thermos | **Coffee Thermos** | common | +1 energy on the first turn of each combat | Lantern |
| stethoscope | **Stethoscope** | common | draw 2 more cards on the first turn | Bag of Prep |
| pager | **Pager** | common | start of combat: 1 Staggered to ALL zombies | Bag of Marbles |
| protein_bar | **Protein Bar** | common | start each combat with 1 Strength | Vajra |
| knee_brace | **Knee Brace** | common | start each combat with 1 Agility | Oddly Smooth Stone |
| granola | **Granola Bar** | common | +7 max HP (and heal 7) | Strawberry |
| iv_bag | **IV Bag** | common | heal 2 at the start of each combat | Blood Vial |
| coin_jar | **Coin Jar** | common | gain 9 supplies whenever you add a card | Ceramic Fish |
| tally_marks | **Tally Marks** | common | every 10th attack deals double damage (counter) | Pen Nib |
| riot_vest | **Riot Vest** | common | end of turn with no block: gain 6 block | Orichalcum |
| combo_counter | **Combo Counter** | uncommon | every 3rd attack in a turn: +1 Strength | Kunai/Shuriken |
| box_cutter | **Box Cutter** | uncommon | every 3rd Skill in a turn: 5 dmg to ALL | Letter Opener |
| door_wedge | **Door Wedge** | uncommon | turn 2: gain 14 block | Horn Cleat |
| trophy_belt | **Trophy Belt** | uncommon | when a zombie dies: +1 energy, draw 1 | Gremlin Horn |
| emergency_rations | **Emergency Rations** | uncommon | end of combat at ≤50% HP: heal 12 | Meat on the Bone |
| hollow_points | **Hollow Points** | uncommon | Staggered zombies take 75% more (not 50%) | Paper Phrog |
| steel_plate | **Steel Plate** | rare | whenever you'd lose HP, lose 1 less | Tungsten Rod |
| defib_pads | **Defib Pads** | rare | once: when you'd die, heal to 50% instead | Lizard Tail |
| cooler | **Cooler** | rare | unspent energy carries to next turn | Ice Cream |
| staff_badge | **Staff Badge** | shop | pharmacy prices −50% | Membership Card |
| doctors_note | **Doctor's Note** | shop | card removal always costs 50 | Smiling Mask |

### Weapons = the artifact system (meta unlocks, equip one per hero before a run)
Bought in the **Armory** with **scrap** (earned every run, win or lose, no toll: fight 8, elite 20, boss 40, act cleared +15). Each equipped weapon is a relic (rarity `weapon`) shown in the relic bar, plus card swaps to the starter deck. Sidegrades, not raw power; tier 3 is a little stronger. The 3D weapon model is the one in the hero's hand.

| id | Hero | Name | Cost | Model | Passive | Starter swap |
|---|---|---|---|---|---|---|
| wood_bat | Marc | **Wood Bat** | free | wood_bat | the first Bat Swing each combat deals double | — |
| nail_bat | Marc | **Nail Bat** | 80 | wood_bat + nails (procedural) | — | all 3 Bat Swings → **Nail Swing** (1: 6 dmg, 2 Bleed; up 8, 3) (sim tune: was 5) |
| wire_bat | Marc | **Wire-and-Tape Bat** | 200 | wood_bat + wire wrap (procedural) | Bleed on zombies also makes them take +2 from Marc's attacks | all 3 Bat Swings → **Barbed Swing** (1: 6 dmg, 2 Bleed; up 8, 3) |
| crowbar | Marc | **Crowbar** | 120 | crowbar | your first attack each combat applies 2 Staggered | Home Run → **Pry Loose** (2: 9 dmg, 2 Staggered, draw 1; up 12, 3) |
| fire_axe | Marc | **Fire Axe** | 250 | fire_axe | Marc's attacks deal +2; you start each combat with 1 Shaken | Brace ×1 → **Chop Block** (1: 6 dmg, 4 block) |
| sledgehammer | Marc | **Sledgehammer** | 350 | sledgehammer | first turn of each combat: −1 energy | Home Run → **Sledge** (2: 18 dmg, 3 Staggered; up 22, 4) (sim tune: was 14) |
| pistol | Yola | **Pistol** | free | pistol_core | Clean Shot is Innate (starts in hand) | — |
| shotgun | Yola | **Pump Shotgun** | 150 | pump_shotgun | — | Pistol Shot ×2 → **Buckshot** (1: 4 dmg to ALL; up 6) |
| sawed_off | Yola | **Sawed-Off** | 300 | pump_short | Yola's attacks deal +3 to Staggered zombies | Clean Shot → **Both Barrels** (2: 7 dmg ×2; +4 each if Staggered) |

### Potions (medkit items, 3 slots)
| id | Name | Rarity | Effect |
|---|---|---|---|
| medkit | **Medkit** | common | heal 20% max HP |
| adrenaline | **Adrenaline** | common | +2 energy |
| extinguisher | **Extinguisher** | common | 2 Weakened to ALL |
| flashbang | **Flashbang** | common | 2 Staggered to ALL |
| energy_drink | **Energy Drink** | common | draw 3 |
| body_armor | **Body Armor** | common | 12 block |
| pipe_bomb | **Pipe Bomb** | uncommon | 10 dmg to ALL |
| protein_shake | **Protein Shake** | uncommon | +2 Strength |
| painkiller_pills | **Painkillers** | uncommon | +2 Agility |
| epi_pen | **Epi-Pen** | rare | when you'd die, heal to 30% instead (automatic) |
Potion drop chance 40%, ±10 after each fight (dropped / not). Rarity 65/25/10.

### Locked rooms (events). Text is placeholder; Marc decides story.
| id | Title | Choices |
|---|---|---|
| vending | **Vending Machine** | Smash it (lose 3 HP; 25% a relic falls, +10% per try, repeatable) / Walk away |
| break_room | **Break Room** | Coffee (heal 1/3 max HP) / Donuts (+5 max HP) / Grab the snack box (random relic + Infection curse) |
| wounded_doctor | **A Doctor Who Stayed** | Pay 35 supplies: heal 25% / Pay 50: remove a card / Leave |
| supply_cart | **Abandoned Supply Cart** | Search (find supplies, a potion, then a relic; each search 25%/50%/75% chance a Big Walker wakes → elite fight with the loot as reward) / Leave |
| xray | **X-Ray Room** | Step in (upgrade 2 random cards, lose 20% max HP as HP) / Leave |
| blood_bank | **Blood Bank** | Donate (lose 10 HP, gain 75 supplies) / Steal plasma (heal 15, gain Infection) / Leave |
| pharmacy_cabinet | **Locked Cabinet** | Pry it (Marc: lose 8 HP, 2 potions) / Pick it (Yola: 50% a potion, else nothing) / Leave |
| intercom | **The Intercom** | Forget (remove a card) / Change (transform a card) / Practise (upgrade a card) |
| survivor_note | **A Note on the Wall** | Pick 1 of 3 cards (one Marc, one Yola, one random) / Leave |
| gurney | **Overturned Gurney** | Look under it: fight 2 Biters, then a relic / Leave |
"?" room roll (StS): fight 10% (+10 each time not rolled), treasure 2% (+2), shop 3% (+3), else an event (no repeats in a run).

### Run start bonus: "Shift Change" (Neow, simplified)
Before floor 1 pick 1 of 3: +8 max HP / remove a card / upgrade a card / a random common relic / 100 supplies / a random rare card (Marc or Yola) / choose 1 of 3 Marc cards / choose 1 of 3 Yola cards. Three random options each run.

## 5. Run rules
- 80 HP, 99 supplies, Nurse's Kit, 11-card starter deck (with weapon swaps), 3 empty potion slots.
- Map: 7 columns × 15 rows + boss. 6 paths from row 1. Row 1 all fights; row 9 all treasure; row 15 all rest. No elite or rest before row 6. A node's type differs from its parent's for elite/rest/shop/event... (StS: no two consecutive elites, rests or shops; siblings from one parent get different types). Odds: shop 5, rest 12, event 22, elite 8, else fight. Boss at the top, shown from the start.
- Fight rewards: supplies (fight 10–20, elite 25–35, boss 95–105), potion roll, card pick (3 cards, any hero; can skip). Elites also a relic (common 50 / uncommon 33 / rare 17). Treasure: a relic (common 50/uncommon 33/rare 17) + 25–35 supplies... (StS chest: small/medium/large; keep simple).
- Card rarity: normal 60/37/3 + pity offset (starts −5; +1 per common shown; reset to −5 on a rare); elites 50/40/10; boss all rare (not used: the boss ends the act). Upgraded reward cards: none in act 1.
- Rest site ("Supply Closet"): **Rest** heal 30% max HP, or **Patch Up** upgrade a card.
- Shop ("Pharmacy"): 5 cards (2 Marc, 2 Yola, 1 any; one on sale at 50%), 3 relics (one shop relic), 3 potions, card removal (75, +25 each). Prices: card common 45–55, uncommon 68–82, rare 135–165; relic common 143–157, uncommon 238–262, rare 285–315, shop 143–157; potion common 48–52, uncommon 72–78, rare 95–105.
- After the boss: **Floor cleared** → victory screen (act 1 is the whole game for now; "Floor 2 coming soon"). Scrap tallied.
- Death: defeat screen with the run summary and scrap.
- Save after every node; Continue from the title screen. One run at a time.

## 6. Presentation

### Battle staging (`render/`)
- Landscape. Camera: ~40 mm, 10–15° above eye level, party left (Marc forward at the melee spot, Yola behind and to the left), zombies right in up to 5 slots (front row 3, back row 2, staggered), each ~35–45% of screen height.
- Painted room backdrop (`painter.js`) behind, lit to match: warm key, cool fill, rim light; soft contact shadows (shadow catcher).
- **Pacing** (GAME_CORE): basic card 0.5–0.6 s with the hit at 0.25–0.3 s; the next card can be played as soon as the hit lands (cards queue). Zombies act together quickly (0.45 s per zombie attack). The finisher is the one long beat: ≤2–3 s, shorter after the first time each run. Speed setting 1× / 1.5× / 2×.
- **Melee**: Marc dashes to the target (≤0.12 s), swings (clip trimmed to the impact window via timeScale + start offset), dashes back. Yola shoots from her spot: pistol idle pose + procedural recoil, muzzle flash, tracer, shell casing, pistol sfx.
- **Hits**: hit-stop 50–80 ms, flash the target white, small knockback, blood puff (gore setting), damage number pops (big, outlined, red for HP, grey "Blocked"), screen shake scaled to damage.
- **Deaths** (pillar 2): the killing card's `kind` picks the clip: light → `death_forward`/`death_back`; gun → `death_headshot_knees`; heavy/blast → `death_chest_back`/`death_hit_back`/`knockback`. **Finisher** (kill on a Staggered zombie): slow-mo 0.3×, camera punch-in, Marc's `hub_execution_*` (melee) or Yola's headshot burst (gun), blood burst, "FINISHER" stamp. Bodies fade out after ~1.5 s (sink + dissolve).
- **Block**: Marc `ual_Sword_Block`, Yola `ual1_Dodge_*`; a translucent shield shimmer on the party; block badge pops.
- **Party damage**: chosen hero plays `hit_body`/`pistol_hit`; red vignette pulse; HP bar drains with a white "ghost" bar that catches up.
- **Defeat**: both heroes `death_defeat` / `death_fall`, music cuts to a flatline.
- Enemy idle variety: random time offsets so zombies don't sync.
- Gore setting: Full (blood bursts, finisher dismemberment) / Low (no blood). Default Full.

### HUD (`ui/`)
- Top bar: hero portraits (Marc + Yola) with the shared HP "80/80", supplies, potion slots, floor number, relic tray (with weapon relics first), deck button, map button, settings.
- Party HP bar under the heroes (world-anchored), with block badge and status icons. Each zombie: HP bar + block + status icons under it, intent icon + number above its head (world-anchored DOM).
- Bottom: energy orb left ("3/3", ECG-line motif), draw pile count left, discard + exhaust right, **End Turn** right (glows when you have no playable cards).
- Hand: one gentle arc/row, hover lifts and enlarges, drag up to play, drag onto a zombie for targeted cards with a bezier arrow; tap to select then tap a target also works. Unplayable cards dim; insufficient energy shakes. Cards fly in from the draw pile and out to the discard (and burn for exhaust).
- Card text shows live numbers (green when buffed, red when reduced) against the hovered target.
- Tooltips for every keyword, status, relic, potion and intent (hover or long-press).
- Turn banners ("Your Turn" / "Zombies' Turn"), combat-start banner with the encounter name, elite/boss intro banner.

### Screens
- **Title**: painted ER backdrop, logo (SARNO in red, LEGENDS in teal), live 3D Marc and Yola idling, Continue / New Run / Armory / Settings, scrap count.
- **Armory**: weapon racks for Marc and Yola, 3D-rendered weapon icons, lock/unlock with scrap, equip, passive + card swap shown as cards.
- **Shift Change** (run start bonus).
- **Map**: a hospital floor plan (blueprint style) scrolling up from the lobby to the boss elevator; room icons; legend; current position pulsing; reachable nodes glow; tap to travel (a short path animation).
- **Reward**: panel over the battle: supplies, potion, relic, "Add a card" → pick 1 of 3 or skip.
- **Rest**: painted supply-closet backdrop, Rest (shows the heal amount) / Patch Up (opens the upgrade picker with before/after preview).
- **Shop**: pharmacy backdrop, cards on the shelf, relics and potions with prices, card removal.
- **Event**: painted backdrop + title, text, choices with clear costs/rewards.
- **Treasure**: a locked crate opens → relic + supplies.
- **Result** (victory/defeat): run summary (floor, kills, best hit, deck), scrap counter animation, unlock hints, Armory / Title.
- **Settings**: speed, music, sfx, screen shake, gore, reset profile.
- **Deck / piles**: grid of cards (sortable), pile viewers in combat.

### Audio
- SFX from `public/assets/sfx/` (CC0, credited) mapped to events: card draw/play swish, bat thwack, pistol, shotgun, block (cloth/metal), zombie vocals (alert/attack/pain/death), heal ding, energy, supplies pickup, UI clicks, map footsteps, door on room entry, boss booms, heartbeat at low HP, flatline on defeat.
- Music: map/menu `ch2_a_tension`, fights `agile_groove` (Marc's track), elites/boss `ch2_c_action`. Crossfades. Starts on first user gesture.

### Visual identity
- Night hospital: deep teal-black (#0d1416) with sickly fluorescent whites, warm emergency light, blood red accents.
- Marc red #c8483a, Yola teal #2fa39a, supplies gold #e3b04b, card paper #efe6d2, dark ink #1a1a1a.
- Fonts (bundled via @fontsource): **Bebas Neue** (titles, numbers), **Oswald** (card names, buttons), **Barlow Semi Condensed** (body, card text).
- Cards: hero-coloured frame, rarity trim (common steel, uncommon blue-silver, rare gold), cost token top-left, art window (studio render), type ribbon, text box with keywords bolded.

## 7. Balance and logging
- `tools/sim/`: headless runs with random / greedy / sensible bots over full act-1 runs; report fight HP loss per encounter, elite and boss, HP entering the boss, win rate per bot, card pick rates.
- Targets (GAME_CORE): normal fight 5–15% HP lost, elite 20–30%, boss 30–45%, reach the boss with 40–60% HP; sensible bot wins ~40–60% (a new human ~40%).
- In-game log (run.stats.log): card offered/picked/skipped, each fight's turns, HP lost and killing card, floor reached and cause of death. Kept in the save and the profile's last 20 runs.

## 8. Debug API (for playtests and the build-log camera)
`window.__SL` = `{ state(), app, newRun(seed?, opts?), goto(screen, opts?), combat(encounterId?, opts?), play(handIndex, targetIndex?), endTurn(), autoplay(on, speed?), setSpeed(x), win(), lose(), give({relic|card|potion|gold}), seed }`; `window.__ready = true` once the title is interactive. `?debug=1` shows an FPS/state overlay. `?seed=XYZ` fixes the seed. `?shot=<scene>` jumps straight to a scene for screenshots.

## 9. Module interfaces (so modules built in parallel plug together)

Everything is an ES module with named exports. Keep these signatures; add extra options freely.

```js
// src/render/assets.js
export async function preload(keys, onProgress)              // keys: 'marc','yola', enemy model keys ('z_romero', ...), weapons
export async function character(key)                         // -> { root: Object3D (cloned, skinned), clips: Map<name, AnimationClip>, bones, height }
export async function prop(name)                             // -> Object3D clone of public/assets/models/props/<name>.glb (also items/, weapons/)
export const MODELS = { marc: ['marc.glb','marc_moves.glb'], yola: [...], z_romero: ['z_romero.glb','z_romero_moves.glb'], ... }

// src/render/stage.js
export function createStage(canvas, opts) -> {
  renderer, scene, camera, clock,
  setRoom(key) -> Promise                                    // painted backdrop for 'er_lobby' | 'ward' | 'corridor' | 'supply_closet' | 'pharmacy' | 'security_gate' | 'break_room' | 'xray' | 'storage' | 'title'
  slots: { marc: Vector3, yola: Vector3, enemy: [Vector3 x5] },
  project(obj3dOrVec3, yOffset = 0) -> { x, y, visible },    // CSS px, for world-anchored DOM (intents, HP bars, numbers)
  onFrame(fn(dt)) -> unsubscribe, resize(), setSpeed(x), shake(strength, ms), hitStop(ms), slowMo(scale, ms), punchIn(target, ms),
  pick(clientX, clientY) -> enemyUid | 'party' | null,      // raycast for targeting on the 3D bodies
  dispose()
}

// src/render/actor.js
export class Actor {                                         // wraps a character
  constructor(stage, characterData, { kind: 'hero'|'enemy', id, uid, scale })
  play(clip, { loop, fade, timeScale, from, to, then }) -> Promise   // resolves at the end (or at `to`)
  idle()                                                     // back to its stance idle (bat_idle / pistol_idle / zombie idle)
  dashTo(vec3, ms) / returnHome(ms)
  hit({ heavy, fromDir }) / die(kind, { finisher }) / revive()
  setWeapon(weaponId)                                        // attach weapon model to the right hand (hero only)
  highlight(on, color) / flash(color)
  anchor(name) -> Vector3                                    // 'head' | 'chest' | 'feet' world position (for intents, numbers, effects)
  dispose()
}

// src/render/director.js: plays combat events with the pacing rules
export function createDirector({ stage, actors: { marc, yola, enemies: Map<uid, Actor> }, fx, audio, settings }) -> {
  push(events),                     // queue events from combat.takeEvents()
  update(dt),                       // called every frame by the stage
  idle() -> boolean,                // nothing playing or queued
  ready() -> Promise,               // resolves when the queue drains
  canAcceptInput() -> boolean,      // true once the current card's hit has landed (cards can queue)
  on(type, fn),                     // 'event' (evt) fired the moment an event "lands" (HUD updates numbers then),
                                    // 'number' ({ uid|'party', text, kind }) for floating numbers, 'banner' ({ text, kind })
  setSpeed(x), addEnemy(uid, actor), removeEnemy(uid)
}

// src/render/fx.js
export function createFx(stage) -> { blood(pos, dir, amount), sparks(pos), muzzle(pos, dir), tracer(from, to), shell(pos),
  shieldShimmer(actors), buffAura(actor, color), debuffSwirl(actor, color), dust(pos), healGlow(actor), gib(actor, part), update(dt) }

// src/render/painter.js
export async function paintRoom(renderer, key, { width, height, seed }) -> { texture: THREE.Texture, url: string /* objectURL or dataURL for CSS backgrounds */ }
export const ROOMS = { er_lobby: {...}, ... }                 // recipes: props, layout, palette, light

// src/render/studio.js
export function createStudio(renderer) -> {
  cardArt(cardId) -> Promise<url>,       // hero posed mid-clip (card's anim) over a painted gradient; cached
  relicIcon(id) -> Promise<url>, potionIcon(id) -> Promise<url>, weaponIcon(id) -> Promise<url>,
  portrait(key /* 'marc'|'yola'|enemyId */) -> Promise<url>
}

// src/ui/card.js
export function cardEl(cardInst, { combat?, targetUid?, size: 'hand'|'reward'|'grid'|'zoom', art?: url }) -> HTMLElement
export function updateCardNumbers(el, combat, targetUid)   // live numbers (green/red)

// src/ui/hud.js  (the whole combat UI: HUD + hand + targeting + piles + world anchors)
export function createCombatUI({ root, stage, studio, getRun, combat, onPlay(uid, targetUid), onEndTurn(), onPotion(slot, targetUid), onOpenDeck(), onOpenMap(), onSettings() }) -> {
  sync(),                       // re-read combat.state (hand, energy, piles, intents) immediately
  onEvent(evt),                 // the director says this event just landed: update HP/block/status/intents with motion
  number({ target, text, kind }), banner(text, kind),
  setInputEnabled(bool), destroy()
}
export function createTopBar({ root, getRun, onDeck, onMap, onSettings, onPotion }) -> { update(), destroy() }  // shared by map/shop/etc.

// src/ui/screens/<name>.js
export function mount(root, ctx) -> { unmount(), update?() }
// ctx = { run, profile, studio, audio, act: { ...callbacks named per screen }, rooms: paintRoom url getter }
// title:    act.continue(), act.newRun(), act.armory(), act.settings()
// intro (Shift Change): ctx.options -> act.choose(index)
// map:      act.travel(nodeId), act.openDeck()
// reward:   ctx.rewards [{ kind: 'gold'|'potion'|'relic'|'cards', ... }] -> act.take(i), act.pickCard(i, cardIdx), act.skip(), act.done()
// rest:     act.rest(), act.upgrade(uid), act.leave()
// shop:     ctx.shop -> act.buyCard(i), act.buyRelic(i), act.buyPotion(i), act.remove(uid), act.leave()
// event:    ctx.event { title, text, choices: [{ label, desc, disabled }] , room } -> act.choose(i), act.pickCard(...) when asked
// treasure: act.open(), act.take(), act.leave()
// result:   ctx.summary -> act.armory(), act.title()
// armory:   ctx.profile -> act.unlock(weaponId), act.equip(hero, weaponId), act.back()
// settings: ctx.settings -> act.set(key, value), act.close(), act.abandonRun()
// deck:     ctx.cards, ctx.title -> act.close()
// picker:   ctx.cards, ctx.mode 'upgrade'|'remove'|'transform'|'pick' -> act.choose(uid), act.cancel()

// src/audio/audio.js
export function createAudio() -> { unlock(), sfx(key, { vol, rate, at }), event(combatEvt), ui(name /* 'click'|'hover'|'card'|'deny'|'coin'|'open' */),
  music(track /* 'menu'|'map'|'fight'|'elite'|'boss'|null */), setVolume({ master, music, sfx }), duck(ms) }
```

Ports for module lab pages (each module ships a `labs/<name>.html` to see it in isolation): render 5181, painter 5182, ui 5183, screens 5184, audio 5185, integration 5180.
