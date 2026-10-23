// The app shell: boot, the shared stage / studio / audio, the profile and the run, and the screen flow.
//   title -> armory | settings -> New Run -> Shift Change -> map -> room (fight | rest | shop | event | treasure)
//   -> rewards -> map ... -> boss -> result (Floor Cleared) ; death -> result (overrun) -> scrap banked -> armory / title
// One WebGLRenderer (the stage's) draws the battle, the title, the painted rooms (painter.js) and the card art and icons
// (studio.js). The run is saved after every room entry and every resolved choice (save.js); Continue on the title picks
// it up, and a fight in progress restarts from its first turn.
// Screens (ui/screens) only draw and call ctx.act.*: every act here changes the run through run.js, saves, then either
// calls the screen's update() or moves to the next screen behind a short fade.
import '../ui/styles/base.css';
import '../ui/styles/card.css';
import '../ui/styles/hand.css';
import '../ui/styles/hud.css';
import '../ui/styles/tooltip.css';
import '../ui/styles/screens.css';
import '../ui/styles/screens-map.css';
import '../ui/styles/screens-rooms.css';
import '../ui/styles/screens-meta.css';
import '../ui/styles/app.css';
import * as THREE from 'three';
import { createStage } from '../render/stage.js';
import { createStudio } from '../render/studio.js';
import { preload, character, MODELS } from '../render/assets.js';
import { Actor, heroYaw } from '../render/actor.js';
import { SLOTS } from '../render/camera.js';
import { resetFinishers } from '../render/director.js';
import { createAudio } from '../audio/audio.js';
import { setSpeed as setUiSpeed } from '../ui/tween.js';
import { SCREENS } from '../ui/screens/index.js';
import * as R from '../game/run.js';
import * as M from '../game/meta.js';
import { STARTER, CARDS } from '../game/content/cards.js';
import { ENCOUNTERS } from '../game/content/encounters.js';
import { ENEMIES } from '../game/content/enemies.js';
import { createSaves } from './save.js';
import { createRooms, battleRoom } from './rooms.js';
import { openCombat } from './combat.js';
import { createBoot } from './loading.js';
import { showError } from './errors.js';

export const VERSION = '0.2.0';
const BOSS_NAME = 'Shield Guard';
// where Marc and Yola stand on the title screen (the clear area left of the menu), turned toward the camera
const TITLE_SPOT = { marc: new THREE.Vector3(-0.55, 0, 2.3), yola: new THREE.Vector3(-1.85, 0, 1.55) };
const TITLE_YAW = { marc: 0.5, yola: 0.75 };

export async function startApp({ params = new URLSearchParams(location.search), persist = true, boot = createBoot(), profile: given = null } = {}) {
  const uiRoot = document.getElementById('ui');
  const canvas = document.getElementById('stage');
  const saves = createSaves({ persist });
  let profile = given || saves.loadProfile();
  const over = { speed: Number(params.get('speed')) || null };   // URL / autoplay overrides on top of the settings

  boot.progress(0.04, 'Waking the night shift');
  await Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 2500))]).catch(() => {});

  // ---- the shared renderer and friends
  const stage = createStage(canvas, { maxPixelRatio: 1.75 });
  const studio = createStudio(stage.renderer);
  const audio = createAudio({ volume: { music: profile.settings.music, sfx: profile.settings.sfx } });
  const rooms = createRooms(stage);

  const app = {
    version: VERSION, params, stage, studio, audio, rooms, saves, uiRoot,
    get profile() { return profile; },
    run: null, fight: null, screen: null, busy: false,
    settings: () => ({ ...profile.settings, ...(over.speed ? { speed: over.speed } : {}) }),
    setSpeedOverride(x) { over.speed = x || null; applySettings(); },
  };

  // ---------------------------------------------------------------- settings
  function applySettings() {
    const s = app.settings();
    stage.setSpeed(s.speed);
    setUiSpeed(Math.min(3, s.speed));
    audio.setVolume({ music: s.music, sfx: s.sfx });
    app.fight?.fx?.setGore?.(s.gore);
  }
  applySettings();
  const saveProfile = () => saves.saveProfile(profile);
  const saveRun = () => { if (app.run && !app.run.over) saves.saveRun(app.run); };

  // ---------------------------------------------------------------- the heroes (built once, used by the title and every fight)
  let heroesP = null;
  app.heroes = () => (heroesP ||= (async () => {
    await preload(['marc', 'yola']);
    const marc = new Actor(stage, await character('marc'), { kind: 'hero', id: 'marc', home: SLOTS.marc });
    const yola = new Actor(stage, await character('yola'), { kind: 'hero', id: 'yola', home: SLOTS.yola });
    await Promise.all([marc.setWeapon(profile.equipped.marc), yola.setWeapon(profile.equipped.yola)]);
    return { marc, yola };
  })());

  async function titleHeroes() {
    const h = await app.heroes();
    await Promise.all([h.marc.setWeapon(profile.equipped.marc), h.yola.setWeapon(profile.equipped.yola)]);
    for (const id of ['marc', 'yola']) {
      const a = h[id];
      a.setHome(TITLE_SPOT[id]); a.reset();
      a.lockYaw = true; a.yawTarget = TITLE_YAW[id]; a.turnTo(TITLE_YAW[id], 0);
      a.setVisible(true);
    }
  }

  // ---------------------------------------------------------------- screens: one main screen, overlays on top, a fade between
  const veil = document.createElement('div');
  veil.className = 'sl-veil';
  document.body.append(veil);
  let main = null;            // { name, handle, ctx }
  const overlays = [];        // [{ name, handle }]
  let chain = Promise.resolve();

  const fadeVeil = (on, ms) => new Promise(res => {
    veil.style.transition = `opacity ${ms}ms ease`;
    veil.classList.toggle('sl-veil--on', on);
    setTimeout(res, ms + 20);
  });

  /** Run fn behind the veil (fade to black, swap, fade back). Transitions queue; errors show the error panel. */
  function go(fn, { fade = true } = {}) {
    chain = chain.then(async () => {
      app.busy = true;
      try {
        if (fade) await fadeVeil(true, 160);
        await fn();
      } catch (e) {
        showError(e, 'screen change');
      } finally {
        if (fade) await fadeVeil(false, 260);
        app.busy = false;
      }
    });
    return chain;
  }
  app.go = go;
  /** After an error: drop whatever transition was stuck and rebuild the title. */
  app.recover = () => { chain = Promise.resolve(); fadeVeil(false, 200); app.busy = false; return app.toTitle(); };

  function closeOverlays() { while (overlays.length) overlays.pop().handle.unmount(); }
  function unmountMain() { closeOverlays(); main?.handle?.unmount?.(); main = null; }
  function mountMain(name, ctx) {
    unmountMain();
    const handle = SCREENS[name].mount(uiRoot, ctx);
    main = { name, handle, ctx };
    app.screen = name;
    document.body.dataset.screen = name;
    return handle;
  }
  function openOverlay(name, ctx) {
    const handle = SCREENS[name].mount(uiRoot, ctx);
    const o = { name, handle, ctx };
    overlays.push(o);
    return o;
  }
  function closeOverlay(o) {
    const i = overlays.indexOf(o);
    if (i >= 0) overlays.splice(i, 1);
    o.handle.unmount();
  }
  const topOverlay = name => overlays.find(o => o.name === name);
  const refresh = () => main?.handle?.update?.();

  /** The stage behind the screens: 'title' (painted ER + the heroes), 'battle' (a fight), 'off' (paused under a screen). */
  function stageMode(mode) {
    document.body.classList.toggle('sl-stage-title', mode === 'title');
    document.body.classList.toggle('sl-stage-battle', mode === 'battle');
    stage.pause(mode === 'off');
    titleLights(mode === 'title');
  }
  // the title: the heroes stand in the dark ER lit from the open doors behind them (a warm rim, a softer key)
  const LIGHTS = ['hemi', 'key', 'rim', 'fill', 'partyLamp', 'enemyLamp'];
  let battleLights = null;
  function titleLights(on) {
    const L = stage.lights;
    battleLights ||= Object.fromEntries(LIGHTS.map(k => [k, { i: L[k].intensity, p: L[k].position.clone() }]));
    for (const k of LIGHTS) { L[k].intensity = battleLights[k].i; L[k].position.copy(battleLights[k].p); }
    if (!on) return;
    L.hemi.intensity *= 0.62; L.key.intensity *= 0.72; L.fill.intensity *= 0.6; L.enemyLamp.intensity = 0;
    L.rim.color.setHex(0xffd3a6); L.rim.intensity = 3.4; L.rim.position.set(0.6, 3.2, -8);
    L.partyLamp.position.set(-1.0, 2.5, 3.6); L.partyLamp.intensity = 3.2;
  }

  // ---------------------------------------------------------------- shared ctx for the screens of a run
  function base(extra = {}) {
    const act = {
      openDeck: () => app.openDeck(),
      openMap: () => app.openMapView(),
      settings: () => app.openSettings(),
      potion: (i, action) => mapPotion(i, action),
      ...(extra.act || {}),
    };
    return { run: app.run, profile, studio, audio, rooms, version: VERSION, ...extra, act };
  }
  function mapPotion(slot, action) {
    if (!app.run) return;
    const r = action === 'use' ? R.usePotionOnMap(app.run, slot) : R.discardPotion(app.run, slot);
    if (r.ok) { audio.ui(action === 'use' ? 'open' : 'close'); saveRun(); refresh(); }
  }

  app.openDeck = () => {
    if (!app.run) return;
    const ex = topOverlay('deck'); if (ex) return closeOverlay(ex);
    audio.ui('open');
    const o = openOverlay('deck', { cards: app.run.deck, title: 'Your Deck', studio, audio, act: { close: () => { audio.ui('close'); closeOverlay(o); } } });
  };
  app.openMapView = () => {
    if (!app.run) return;
    const ex = topOverlay('map'); if (ex) return closeOverlay(ex);
    audio.ui('open');
    const o = openOverlay('map', base({ viewOnly: true, intro: false, bossName: BOSS_NAME, act: { close: () => { audio.ui('close'); closeOverlay(o); }, openMap: undefined } }));
  };
  app.openSettings = () => {
    const ex = topOverlay('settings'); if (ex) return closeOverlay(ex);
    const o = openOverlay('settings', {
      settings: { ...profile.settings }, inRun: !!(app.run && !app.run.over), version: VERSION, audio,
      act: {
        set: (k, v) => { const r = M.setSetting(profile, k, v); if (r.ok) { saveProfile(); applySettings(); } },
        close: () => closeOverlay(o),
        abandonRun: () => { closeOverlay(o); abandonRun(); },
        resetProfile: () => { closeOverlay(o); resetProfile(); },
      },
    });
  };

  // ---------------------------------------------------------------- title, armory
  app.toTitle = () => go(async () => {
    disposeFight();
    unmountMain();
    if (app.run?.over) app.run = null;
    await titleHeroes();
    stage.setRoom('title', { look: null });
    stageMode('title');
    const info = saves.runInfo();
    mountMain('title', {
      hasSave: !!info, save: info, profile, version: VERSION, rooms, audio, studio,
      act: {
        continue: () => app.continueRun(),
        newRun: () => app.newRun(),
        armory: () => app.toArmory(),
        settings: () => app.openSettings(),
      },
    });
    audio.music('menu');
  });

  app.toArmory = () => go(async () => {
    disposeFight();
    stageMode('off');
    const h = mountMain('armory', {
      profile, studio, audio, rooms, topbar: false,
      act: {
        unlock: id => { const r = M.unlockWeapon(profile, id); if (!r.ok) return false; saveProfile(); audio.ui('buy'); h.update?.(); return true; },
        equip: (hero, id) => { const r = M.equip(profile, hero, id); if (r.ok) { saveProfile(); audio.ui('select'); h.update?.(); } return r.ok; },
        back: () => app.toTitle(),
      },
    });
    audio.music('menu');
  });

  // ---------------------------------------------------------------- runs
  app.newRun = ({ seed, neow = true, weapons } = {}) => go(async () => {
    const old = saves.loadRun();
    if (old && !old.over) { R.abandonRun(old); M.recordRun(profile, old); saveProfile(); }   // a new run abandons the saved one
    disposeFight();
    const run = R.createRun({ seed: seed ?? params.get('seed') ?? undefined, profile, weapons, neow });
    app.run = run;
    resetFinishers();
    saveRun();
    await showRun();
  });

  app.continueRun = () => go(async () => {
    const run = saves.loadRun();
    if (!run) return app.toTitle();
    disposeFight();
    app.run = run;
    await showRun();
  });

  /** Show whatever the run is on (run.screen). Called inside a transition. */
  async function showRun() {
    const run = app.run;
    if (!run) return;
    switch (run.screen) {
      case 'neow': return showIntro();
      case 'map': return showMap();
      case 'combat': return showCombat();
      case 'reward': return showReward(false);
      case 'rest': return showRest();
      case 'shop': return showShop();
      case 'event': return showEvent();
      case 'treasure': return showTreasure();
      case 'victory': case 'defeat': return showResult();
      default: throw new Error('Unknown run screen: ' + run.screen);
    }
  }
  app.showRun = () => go(showRun);

  function enterRoom() {
    const n = app.run.node ? app.run.map.nodes[app.run.node] : null;
    audio.door(n?.type === 'boss' ? 'lift' : 'open');
  }

  // Shift Change
  function showIntro() {
    disposeFight();
    stageMode('off');
    const run = app.run;
    mountMain('intro', base({
      options: run.pending.options, topbar: false,
      act: {
        choose: i => {
          const r = R.chooseNeow(run, i);
          if (!r.ok) return;
          saveRun();
          if (run.pending?.picker) neowPicker(); else go(showRun);
        },
      },
    }));
    if (run.pending.picker) neowPicker();
    audio.music('map');
  }
  function neowPicker() {
    const run = app.run, pk = run.pending.picker;
    const o = openOverlay('picker', {
      cards: pk.cards, mode: pk.mode, title: pk.title, sub: pk.sub, cancelable: false, studio, audio, run,
      act: {
        choose: uid => { const r = R.resolvePick(run, uid); if (!r.ok) return; closeOverlay(o); saveRun(); audio.ui('upgrade'); go(showRun); },
        cancel: () => {},
      },
    });
  }

  // the map
  function showMap() {
    disposeFight();
    stageMode('off');
    const run = app.run;
    const a = audio;
    const mapAudio = { ...a, ui: name => { if (name === 'click') { a.ui('select'); a.walk(4); } else if (name !== 'open') a.ui(name); } };
    mountMain('map', base({
      bossName: BOSS_NAME, intro: run.path.length === 0, audio: mapAudio,
      act: {
        openMap: undefined,
        travel: id => {
          const r = R.travel(run, id);
          if (!r.ok) { console.warn('[app] travel refused', r.reason); return; }
          saveRun();
          enterRoom();
          go(showRun);
        },
      },
    }));
    audio.music('map');
    // the rooms of the fights you can walk into paint in the background while you read the map
    idle(() => {
      const seen = new Set();
      for (const id of R.availableNodes(run)) {
        const n = run.map.nodes[id];
        if (!['fight', 'elite', 'boss'].includes(n.type)) continue;
        const r = battleRoom({ floor: n.type === 'boss' ? 16 : n.row, pending: { room: n.type } });
        const k = r.key + (r.look ? '+' : '');
        if (!seen.has(k)) { seen.add(k); rooms.prepaint(r.key, r.look); }
      }
    });
  }

  // a fight
  async function showCombat() {
    unmountMain();
    disposeFight();
    stageMode('battle');
    const fight = await openCombat(app, { onOver: f => fightOver(f) });
    app.fight = fight;
    main = { name: 'combat', handle: { unmount() {}, update() {} }, ctx: {} };
    app.screen = 'combat';
    document.body.dataset.screen = 'combat';
    // the stage needs a moment for the first frame of the new cast
    await new Promise(r => setTimeout(r, 120));
  }
  function disposeFight() { if (app.fight) { app.fight.dispose(); app.fight = null; } }

  function fightOver(fight) {
    const run = app.run;
    if (!run || app.fight !== fight) return;
    const res = R.finishCombat(run, fight.combat);
    if (!res.ok) { showError(new Error('finishCombat: ' + res.reason), 'fight'); return; }
    if (run.screen === 'reward') {
      saveRun();
      fight.closeHud();
      showReward(true);
      return;
    }
    if (run.over) {
      bankRun();
      if (run.won) {
        fight.ui.banner('Floor Cleared', 'boss', 'The way up is open');
        audio.music('menu');
        setTimeout(() => { fight.closeHud(); app.go(showResult); }, 2600);
      } else {
        setTimeout(() => { fight.closeHud(); app.go(showResult); }, 1400);
      }
    }
  }

  // rewards: over the battle right after a win, or on the fight's painted room after a reload
  function showReward(overBattle) {
    const run = app.run, p = run.pending;
    if (!overBattle) { disposeFight(); stageMode('off'); }
    const room = p.source === 'event' ? 'corridor' : battleRoom({ floor: run.floor, pending: { room: p.source } }).key;
    let h = null;
    const ctx = base({
      rewards: p.rewards, kind: p.source === 'elite' ? 'elite' : p.source === 'event' ? 'event' : 'fight',
      backdrop: overBattle ? null : room,
      act: {
        take: i => { const r = R.takeReward(run, i); if (r.ok) saveRun(); else if (r.reason === 'slots') audio.ui('deny'); },
        pickCard: (i, j) => { const r = R.pickRewardCard(run, i, j); if (r.ok) saveRun(); },
        skip: i => { R.skipRewardCards(run, i); saveRun(); },
        done: () => { R.leaveRewards(run); saveRun(); go(showRun); },
        potion: (i, action) => { mapPotion(i, action); h?.update?.(); },
      },
    });
    if (overBattle) {
      // the fight's room stays up behind the panel; the reward becomes the main screen
      closeOverlays();
      h = SCREENS.reward.mount(uiRoot, ctx);
      main = { name: 'reward', handle: h, ctx };
      app.screen = 'reward';
      document.body.dataset.screen = 'reward';
    } else {
      h = mountMain('reward', ctx);
      audio.music('map');
    }
  }

  function showRest() {
    disposeFight();
    stageMode('off');
    const run = app.run, p = run.pending;
    mountMain('rest', base({
      heal: p.heal, rested: p.rested,
      act: {
        rest: () => { const r = R.restHeal(run); if (r.ok) saveRun(); },
        upgrade: uid => { const r = R.restUpgrade(run, uid); if (r.ok) { saveRun(); audio.ui('upgrade'); } },
        leave: () => { R.leaveRest(run); saveRun(); go(showRun); },
      },
    }));
    audio.music('map');
  }

  function showShop() {
    disposeFight();
    stageMode('off');
    const run = app.run;
    let h = null;
    const buy = fn => i => { const r = fn(run, i); if (!r.ok) { audio.ui('deny'); return false; } saveRun(); audio.ui('buy'); h?.update?.({ shop: run.shop }); return true; };
    h = mountMain('shop', base({
      shop: run.shop,
      act: {
        buyCard: buy(R.buyCard), buyRelic: buy(R.buyRelic), buyPotion: buy(R.buyPotion),
        remove: uid => { const r = R.shopRemove(run, uid); if (!r.ok) { audio.ui('deny'); return false; } saveRun(); audio.ui('remove'); h?.update?.({ shop: run.shop }); return true; },
        leave: () => { R.leaveShop(run); saveRun(); go(showRun); },
      },
    }));
    audio.music('map');
  }

  function showEvent() {
    disposeFight();
    stageMode('off');
    const run = app.run;
    let h = null;
    const after = () => {
      saveRun();
      if (run.screen === 'event') h?.update?.({ event: run.pending });
      else { if (run.screen === 'combat') enterRoom(); go(showRun); }
    };
    h = mountMain('event', base({
      event: run.pending,
      act: {
        choose: i => { const r = R.chooseEvent(run, i); if (!r.ok) { audio.ui('deny'); h?.update?.({ event: run.pending }); return; } after(); },
        pickCard: uid => { const r = R.eventPick(run, uid ?? null); if (!r.ok) { h?.update?.({ event: run.pending }); return; } after(); },
      },
    }));
    audio.music('map');
  }

  function showTreasure() {
    disposeFight();
    stageMode('off');
    const run = app.run;
    let h = null;
    h = mountMain('treasure', base({
      treasure: run.pending,
      act: {
        open: () => { R.openChest(run); saveRun(); },
        take: () => { const r = R.takeTreasure(run); if (r.ok) { saveRun(); audio.ui('pickup'); h?.update?.({ treasure: run.pending }); } },
        leave: () => { R.leaveTreasure(run); saveRun(); go(showRun); },
      },
    }));
    audio.music('map');
  }

  // the end of a run: bank the scrap once (recordRun remembers), drop the save
  function bankRun() {
    const run = app.run;
    if (!run?.over) return null;
    const rec = M.recordRun(profile, run);
    saveProfile();
    saves.clearRun();
    return rec;
  }
  function showResult() {
    disposeFight();
    stageMode('off');
    const run = app.run;
    const rec = bankRun();
    mountMain('result', {
      run, profile, studio, audio, rooms, topbar: false, version: VERSION,
      summary: { ...R.runSummary(run), ...rec },
      act: {
        armory: () => { app.run = null; app.toArmory(); },
        title: () => { app.run = null; app.toTitle(); },
      },
    });
    audio.music(run.won ? 'menu' : null);
  }

  function abandonRun() {
    if (!app.run || app.run.over) return;
    R.abandonRun(app.run);
    bankRun();
    go(showResult);
  }
  function resetProfile() {
    profile = M.createProfile();
    saveProfile();
    saves.clearRun();
    app.run = null;
    applySettings();
    app.toTitle();
  }
  app.abandonRun = abandonRun;

  // ---------------------------------------------------------------- debug helpers the API uses (src/app/debug.js)
  app.forceRoom = (type, opts = {}) => go(async () => {
    if (!app.run || app.run.over) { app.run = R.createRun({ seed: params.get('seed') ?? undefined, profile, neow: false }); resetFinishers(); }
    disposeFight();
    if (app.run.screen !== 'map') { app.run.screen = 'map'; app.run.pending = null; }
    const r = R.forceRoom(app.run, type, opts);
    if (!r.ok) throw new Error(`forceRoom ${type}: ${r.reason}`);
    // a forced room still sits on a sensible floor (the boss is floor 16, elites appear from row 6)
    const p = app.run.pending;
    if (p?.boss) app.run.floor = 16; else if (p?.elite) app.run.floor = Math.max(app.run.floor, 6); else app.run.floor = Math.max(app.run.floor, 1);
    saveRun();
    await showRun();
  });
  app.saveRun = saveRun;
  app.saveProfile = saveProfile;
  app.refresh = refresh;
  app.overlays = overlays;
  app.mainScreen = () => main;
  app.bankRun = bankRun;

  // ---------------------------------------------------------------- boot: heroes, the title room, then the title
  // the heroes, and the zombies of a saved fight (a new player's first zombies load right after the title, in idle time)
  const saved = saves.loadRun();
  const savedZombies = saved?.pending?.encounter ? (ENCOUNTERS[saved.pending.encounter]?.enemies || []).map(id => ENEMIES[id]?.model).filter(Boolean) : [];
  boot.progress(0.08, 'Loading Marc and Yola');
  await preload(['marc', 'yola', ...new Set(savedZombies)], (done, total) => boot.progress(0.08 + 0.42 * (total ? done / total : 1), 'Loading Marc and Yola'));
  await app.heroes();
  boot.progress(0.56, 'Arming them');
  await titleHeroes();
  boot.creep(0.95, 9000, 'Painting the ER');
  await stage.setRoom('title').catch(e => console.warn('[app] title room', e));
  return app;
}

/** Work for when the browser is idle (never in the way of input). */
export function idle(fn, timeout = 1500) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), { timeout });
  else setTimeout(fn, 60);
}

/** After the title is up: the coming fights' zombies, the portraits, the first room, the deck's card art, then every other
 *  zombie, one job per idle slot so input never waits on it. */
export function warmUp(app) {
  const run = app.saves.loadRun();
  const ids = [...new Set([...(run?.deck || []).map(c => c.id), ...STARTER, 'nail_swing', 'pry_loose', 'buckshot'])].filter(id => CARDS[id]);
  const first = [];
  if (run?.pending?.encounter) for (const id of ENCOUNTERS[run.pending.encounter]?.enemies || []) first.push(ENEMIES[id]?.model);
  for (const enc of ['shambler_solo', 'screamer_solo', 'biter_pair', 'two_biters']) for (const id of ENCOUNTERS[enc]?.enemies || []) first.push(ENEMIES[id]?.model);
  const firstSet = [...new Set(first.filter(Boolean))];
  const rest = Object.keys(MODELS).filter(k => k.startsWith('z_') && !firstSet.includes(k));
  const model = m => () => preload([m]).catch(() => {});
  const jobs = [
    ...firstSet.map(model),
    () => app.studio.portrait('marc').catch(() => {}),
    () => app.studio.portrait('yola').catch(() => {}),
    () => app.rooms.prepaint('er_lobby'),
    ...ids.map(id => () => app.studio.cardArt(id).catch(() => {})),
    ...rest.map(model),
  ];
  const next = () => {
    const job = jobs.shift();
    if (!job) return;
    idle(() => Promise.resolve(job()).finally(() => setTimeout(next, 30)));
  };
  next();
}
