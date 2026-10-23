// The fight screen: the engine (run.js startCombat), the 3D cast on the painted room (stage + director + fx) and the
// combat HUD (ui/hud.js), wired together.
//   const fight = await openCombat(app, { onOver })   onOver(fight) fires once the fight is over AND the show has played
//   fight.play(uid, targetUid) / fight.endTurn() / fight.potion(slot, targetUid)   the same path the HUD's input takes
//   fight.closeHud()   drop the HUD (the reward panel goes over the battle)      fight.dispose()   leave the room
// Flow: HUD input -> combat.playCard -> director.push(combat.takeEvents()); the director lands each event with its
// timing and the HUD updates its numbers then ('event' -> ui.onEvent, 'number' -> ui.number, 'banner' -> ui.banner).
// The director also plays every event's sound (audio.event). Input reopens the moment a card's hit has landed.
import * as THREE from 'three';
import * as R from '../game/run.js';
import { createBattleActors, createDirector } from '../render/director.js';
import { createFx } from '../render/fx.js';
import { SLOTS } from '../render/camera.js';
import { heroYaw } from '../render/actor.js';
import { createCombatUI } from '../ui/hud.js';
import { battleRoom } from './rooms.js';

export async function openCombat(app, { onOver } = {}) {
  const { stage, studio, audio } = app;
  const run = app.run;
  const pending = run.pending;
  const room = battleRoom(run);
  stage.pause(false);
  // the room paints while the cast loads; the fight opens on it if it's ready within a moment (prepainted on the map)
  const painted = stage.setRoom(room.key, { look: room.look }).catch(() => {});

  const combat = R.startCombat(run);
  const first = combat.takeEvents();
  const start = first.find(e => e.t === 'combat_start') || { enemies: combat.state.enemies };

  // the cast: the shared heroes back at their battle spots, this fight's zombies
  const heroes = await app.heroes();
  for (const [id, a] of Object.entries(heroes)) { a.lockYaw = false; a.baseYaw = heroYaw(); a.setHome(SLOTS[id]); a.reset(); }
  const actors = await createBattleActors(stage, { enemies: start.enemies, weapons: run.weapons, heroes });
  await Promise.race([painted, new Promise(r => setTimeout(r, 2500))]);
  const fx = createFx(stage, { gore: app.settings().gore });
  const director = createDirector({ stage, actors, fx, audio, settings: () => app.settings() });
  let disposed = false, over = false, hudGone = false;

  // ---- world anchors for the HUD: the actors' home spots (steady while they dash and flinch)
  const _v = new THREE.Vector3();
  function anchor(id, where) {
    const head = where === 'head';
    if (id === 'party') {
      const v = actors.marc.home.clone().lerp(actors.yola.home, 0.5); v.y = 0;
      if (head) v.y = Math.max(actors.marc.height, actors.yola.height) + 0.08;
      return v;
    }
    const a = id === 'marc' ? actors.marc : id === 'yola' ? actors.yola : actors.enemies.get(id);
    if (!a) return null;
    const v = _v.copy(a.home).setY(0).clone();
    if (head) v.y = (a.lying ? (a.lift || 0) + 0.75 : a.height) + 0.08;
    return v;
  }

  const ui = createCombatUI({
    root: app.uiRoot, stage, studio, audio, combat, getRun: () => run, anchor,
    onPlay: (uid, t) => play(uid, t),
    onEndTurn: () => endTurn(),
    onPotion: (slot, t, action) => potion(slot, t, action),
    onTarget: uid => { for (const a of actors.enemies.values()) a.highlight(!!uid && a.uid === uid, 0xffd166); },
    onLowHp: low => audio?.lowHp?.(low),
    onOpenDeck: () => app.openDeck(),
    onOpenMap: () => app.openMapView(),
    onSettings: () => app.openSettings(),
  });

  director.on('event', e => { if (!hudGone) ui.onEvent(e); });
  director.on('number', n => { if (!hudGone) ui.number({ ...n, target: n.uid }); });
  director.on('banner', b => { if (!hudGone) ui.banner(b.text, b.kind); });
  director.on('finisher', () => { if (!hudGone) ui.finisher?.(); });

  audio?.setLoadout?.(run.weapons);
  audio?.setParty?.({ hp: run.hp, maxHp: run.maxHp });

  // every frame: input opens when the director has landed the last hit; the fight ends when the show is over
  const unframe = stage.onFrame(() => {
    if (disposed) return;
    if (!hudGone) ui.setInputEnabled(director.canAcceptInput());
    if (!over && combat.over && director.idle()) { over = true; setTimeout(() => !disposed && onOver?.(fight), 120); }
  });

  function play(uid, targetUid) {
    if (combat.over) return { ok: false, reason: 'over' };
    const r = combat.playCard(uid, targetUid);
    if (!r.ok) { if (!hudGone) ui.sync(); return r; }
    director.push(combat.takeEvents());
    return r;
  }
  function endTurn() {
    const r = combat.endTurn();
    director.push(combat.takeEvents());
    return r;
  }
  function potion(slot, targetUid, action = 'use') {
    if (action === 'discard') { const r = combat.discardPotion(slot); audio?.ui?.('close'); return r; }
    const r = combat.usePotion(slot, targetUid);
    if (r.ok) director.push(combat.takeEvents()); else if (!hudGone) ui.sync();
    return r;
  }

  const fight = {
    combat, director, ui, actors, fx, room, pending,
    get over() { return over; },
    play, endTurn, potion,
    /** the HUD's hand order (what the player sees), falling back to the engine's */
    handUids: () => (hudGone ? [] : ui.hand?.uids?.() || combat.state.hand.map(c => c.uid)),
    targets: () => combat.state.enemies.filter(e => e.alive).sort((a, b) => a.slot - b.slot).map(e => e.uid),
    win() { if (!combat.over) { combat.forceWin(); director.push(combat.takeEvents()); } },
    lose() {
      if (combat.over) return;
      // the debug loss shows as one last hit, so the bar empties before the heroes fall
      const hp = combat.state.party.hp, by = fight.targets()[0] || 'party';
      combat.forceLose();
      director.push([{ t: 'damage', source: by, target: 'party', amount: hp, blocked: 0, hp: 0, block: 0, kind: 'heavy', hero: 'marc', hit: 1, hits: 1 }, ...combat.takeEvents()]);
    },
    closeHud() { if (hudGone) return; hudGone = true; ui.destroy(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      unframe();
      fight.closeHud();
      director.dispose();
      for (const a of actors.enemies.values()) a.dispose();
      fx.dispose();
      for (const a of [actors.marc, actors.yola]) a.highlight(false);
    },
  };

  director.push(first);
  return fight;
}
