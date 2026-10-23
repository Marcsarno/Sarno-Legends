// The battle stage: renderer, the battle camera (camera.js), lights for a dim night hospital, the room backdrop, a
// shadow-catching floor, the frame loop and the time effects every hit uses (hit-stop, slow-mo, shake, punch-in).
//   const stage = createStage(canvas)
//   stage.onFrame(dt => ...)      dt is game time: x speed (1 / 1.5 / 2), x slow-mo, 0 during a hit-stop
//   stage.project(obj, yOffset)   world -> CSS px on the canvas, for intents, HP bars and numbers
//   stage.pick(x, y)              enemy uid | 'party' | null, from simple box proxies (never the skinned triangles)
// The backdrop is a plane far behind the actors, filling the battle camera's view exactly. Punch-in and shake only turn
// the camera and narrow its lens about its own centre, so the painted room and the 3D bodies stay registered.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BATTLE, SLOTS, applyBattleCamera } from './camera.js';
import { texture } from './assets.js';

const PAINTER = import.meta.glob('./painter.js');
const BACK_DIST = 30;          // backdrop plane distance from the camera (m)
const ROOM_TINT = {            // per-room light colour for the fallback backdrop and the lamps
  default: { wall: 0x2a3a3c, floor: 0x1e2627, key: 0xffd2a6, rim: 0x86c9ff, fog: 0x0d1416, floorTex: 'floor_clinical.webp', wallTex: 'wall_clinical.webp' },
  corridor: { wall: 0x2b3836, floor: 0x1f2524, key: 0xffd9b0, rim: 0x8fd0ff, fog: 0x0e1514, floorTex: 'floor_corridor.webp', wallTex: 'wall_clinical.webp' },
  storage: { wall: 0x33302a, floor: 0x24211d, key: 0xffc890, rim: 0x9ab8d0, fog: 0x15120f, floorTex: 'floor_maintenance.webp', wallTex: 'wall_maintenance.webp' },
  supply_closet: { wall: 0x33302a, floor: 0x24211d, key: 0xffc890, rim: 0x9ab8d0, fog: 0x15120f, floorTex: 'floor_maintenance.webp', wallTex: 'wall_maintenance.webp' },
  security_gate: { wall: 0x2a2f38, floor: 0x1b1f24, key: 0xffb27a, rim: 0x7fb6ff, fog: 0x0c0f14, floorTex: 'floor_maintenance.webp', wallTex: 'wall_maintenance.webp' },
  ward: { wall: 0x2d3d3b, floor: 0x1f2827, key: 0xffd8b2, rim: 0x86e0d6, fog: 0x0d1615, floorTex: 'floor_clinical.webp', wallTex: 'wall_clinical.webp' },
};

export function createStage(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio || 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = opts.shadows !== false;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1416);
  const camera = new THREE.PerspectiveCamera(BATTLE.fov, 16 / 9, BATTLE.near, BATTLE.far);
  const clock = THREE.Timer ? new THREE.Timer() : new THREE.Clock();   // (Timer in three r17x+; Clock before)

  // a dim room environment so PBR materials (weapons, the guard's gear) read instead of going black
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.32;
  pmrem.dispose();

  // ---- lights: cool hospital ambience, a warm key from front-left (the emergency lamps), a cool rim from behind ----
  const hemi = new THREE.HemisphereLight(0xa9c4cc, 0x2a2019, 0.95);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffd2a6, 2.6);
  key.position.set(-3.5, 7.5, 7.5); key.target.position.set(0.6, 0.6, -0.3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -7, right: 7.5, top: 5, bottom: -3.5, near: 1, far: 25 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.025; key.shadow.radius = 4;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x86c9ff, 2.2);
  rim.position.set(2.5, 4.5, -7); rim.target.position.set(0, 1, 0);
  scene.add(rim, rim.target);
  const fill = new THREE.DirectionalLight(0x9fd6d0, 0.55);
  fill.position.set(6, 3, 6); fill.target.position.set(0, 1, 0);
  scene.add(fill, fill.target);
  // a soft warm pool on the party, a sickly cool one over the zombies
  const partyLamp = new THREE.PointLight(0xffc48a, 4.5, 7, 1.6); partyLamp.position.set(-2.0, 2.7, 1.8); scene.add(partyLamp);
  const enemyLamp = new THREE.PointLight(0xb6e8d2, 3.2, 8, 1.6); enemyLamp.position.set(2.8, 3.0, 1.6); scene.add(enemyLamp);
  // flash light (muzzle flashes, finisher burst): fx drives it through stage.flashLight()
  const flashL = new THREE.PointLight(0xffd59a, 0, 3.2, 2); scene.add(flashL);

  // ---- floor: a shadow catcher over whatever backdrop is behind ----
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.ShadowMaterial({ color: 0x050808, opacity: 0.55, depthWrite: false }));
  catcher.rotation.x = -Math.PI / 2; catcher.position.y = 0.002; catcher.receiveShadow = true; catcher.renderOrder = 1;
  scene.add(catcher);
  // a depth-only floor: the painted floor is a picture far behind, so a body sinking through it as it fades (or a foot
  // dipping under it) would draw over the painting; this hides whatever goes below y = 0. In the transparent pass right
  // after the backdrop (so it never hides the painting itself), before every fading body.
  const depthFloor = new THREE.Mesh(catcher.geometry, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true }));
  depthFloor.rotation.x = -Math.PI / 2; depthFloor.position.y = 0; depthFloor.renderOrder = -5; depthFloor.name = 'depth-floor';
  scene.add(depthFloor);

  // ---- backdrop: painted plane (painter.js) or the fallback room ----
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false, toneMapped: false, transparent: true, opacity: 1 }));
  back.renderOrder = -10; back.visible = false; back.frustumCulled = false;
  scene.add(back);
  // the previous room's painting, kept under the new one while it fades in
  const backOld = new THREE.Mesh(back.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false, toneMapped: false }));
  backOld.renderOrder = -11; backOld.visible = false; backOld.frustumCulled = false;
  scene.add(backOld);
  const fallback = buildFallbackRoom();
  scene.add(fallback.group);

  // ---- screen overlay: vignette, damage pulse, white flash (a quad on the camera's near plane) ----
  const overlay = makeOverlay(); camera.add(overlay.mesh); scene.add(camera);

  // ---- state ----
  const frameFns = new Set();
  const pickables = new Map();  // uid -> { actor, proxy }
  let speed = 1, hitStopLeft = 0, slowScale = 1;
  // slow motion: ease in to `scale`, hold, ease back out (real seconds)
  const slow = { on: false, t: 0, inS: 0, holdS: 0, outS: 0, scale: 1, from: 1 };
  let shakeAmp = 0, shakeT = 0, shakeDecay = 1;
  // camera nudge: a damped kick of the view in a direction (a hit pushes the frame along the blow)
  const nudgeS = { x: 0, y: 0, vx: 0, vy: 0 };
  const punch = { t: 0, total: 0, amount: 0, target: new THREE.Vector3(), active: false };
  let width = 1, height = 1, roomKey = null, roomToken = 0, frameNo = 0, running = true, disposed = false;
  const tmpV = new THREE.Vector3(), lookBase = BATTLE.target.clone(), lookNow = new THREE.Vector3();

  function resize() {
    const r = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(r.width || canvas.clientWidth || window.innerWidth));
    height = Math.max(1, Math.round(r.height || canvas.clientHeight || window.innerHeight));
    renderer.setSize(width, height, false);
    applyBattleCamera(camera, width / height);
    fitBackdrop();
    if (roomKey && back.userData.aspect && Math.abs(back.userData.aspect - width / height) > 0.12) repaintSoon();
  }

  // the backdrop plane fills the base battle view (plus a margin for shake) at BACK_DIST
  const baseCam = new THREE.PerspectiveCamera();
  function fitBackdrop() {
    applyBattleCamera(baseCam, width / height);           // (the base view, never the shaken / punched-in one)
    baseCam.updateMatrixWorld(true);
    const h = 2 * BACK_DIST * Math.tan(THREE.MathUtils.degToRad(baseCam.fov / 2)) * 1.06;
    const w = h * baseCam.aspect;
    const dir = tmpV.copy(BATTLE.target).sub(BATTLE.position).normalize();
    back.position.copy(BATTLE.position).addScaledVector(dir, BACK_DIST);
    back.quaternion.copy(baseCam.quaternion);
    back.scale.set(w, h, 1);
    backOld.position.copy(back.position); backOld.quaternion.copy(back.quaternion); backOld.scale.copy(back.scale);
    // a painted texture made for another aspect: cover-crop it
    const t = back.material.map;
    if (t && t.image) {
      const ia = (t.image.width || 16) / (t.image.height || 9), a = w / h;
      t.repeat.set(1, 1);
      if (ia > a) t.repeat.x = a / ia; else t.repeat.y = ia / a;
      // the plane is 6% bigger than the view (shake margin): the painting covers its middle, edges clamp outward
      t.repeat.multiplyScalar(1.06); t.offset.set((1 - t.repeat.x) / 2, (1 - t.repeat.y) / 2);
    }
  }

  let repaintTimer = null;
  function repaintSoon() { clearTimeout(repaintTimer); repaintTimer = setTimeout(() => roomKey && setRoom(roomKey, { force: true }), 400); }

  // opts.look: painter LOOK overrides for this room (the app grades elite rooms harsher)
  let roomLook = null;
  async function setRoom(key, { force = false, look } = {}) {
    if (look !== undefined) { const same = JSON.stringify(look || null) === JSON.stringify(roomLook); roomLook = look || null; if (!same) force = true; }
    if (!force && key === roomKey && back.visible) return;
    roomKey = key; const token = ++roomToken;
    const tint = ROOM_TINT[key] || ROOM_TINT.default;
    applyTint(tint);
    fallback.set(tint);
    let painted = null;
    try {
      const load = opts.painter === false ? null : PAINTER['./painter.js'];   // (import.meta.glob: empty without the module)
      const mod = load ? await load() : null;
      if (mod && typeof mod.paintRoom === 'function') {
        const pw = Math.min(1920, Math.round(width * Math.min(renderer.getPixelRatio(), 1.5))), ph = Math.round(pw * height / width);
        painted = await mod.paintRoom(renderer, key, { width: pw, height: ph, seed: opts.seed, look: roomLook });
      }
    } catch (e) { if (!/painter/.test(String(e?.message))) console.warn('[stage] painter unavailable, using the fallback room:', e?.message || e); }
    if (token !== roomToken || disposed) return;
    if (painted?.texture) {
      const t = painted.texture; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      const old = back.material.map;
      if (old && old !== t && back.visible) {
        backOld.material.map?.dispose?.(); backOld.material.map = old; backOld.material.needsUpdate = true; backOld.visible = true;
      } else if (old && old !== t) old.dispose?.();
      back.material.map = t; back.material.needsUpdate = true; back.userData.aspect = width / height;
      back.visible = true;
      fitBackdrop();
      fadeBackdrop();                              // (the fallback room hides once the painting has faded in)
    } else {
      back.visible = false; fallback.group.visible = true;
    }
  }
  function fadeBackdrop() { back.material.opacity = 0; back.userData.fade = 0.0001; }

  function applyTint(t) {
    key.color.setHex(t.key); rim.color.setHex(t.rim);
    scene.background.setHex(t.fog);
  }

  // ---- time effects ----
  const setSpeed = x => { speed = x > 0 ? x : 1; };
  const hitStop = ms => { hitStopLeft = Math.max(hitStopLeft, (ms / 1000) / Math.sqrt(speed)); };
  /**
   * Slow motion (real time, divided by the speed setting): ease from the current rate down to `scale` over `inMs`, hold
   * it for `holdMs`, ease back to full speed over `outMs`. Called while one is running, it keeps the slow rate it has
   * reached and holds again (the finisher eases in during the swing, then holds through the kill).
   * slowMo(scale, ms) alone: no ease-in, ms in all with the ease-out over its last 35% (the old form).
   */
  function slowMo(scale = 0.3, ms = 600, { inMs = 0, holdMs = null, outMs = null } = {}) {
    if (holdMs == null) { holdMs = ms * 0.65; outMs = ms * 0.35; }
    const k = 1 / 1000 / speed;
    const cur = slowNow();
    slow.from = cur; slow.scale = scale;
    slow.inS = Math.abs(cur - scale) < 0.02 ? 0 : Math.max(inMs, 1) * k;   // (already there: straight to the hold)
    slow.holdS = holdMs * k; slow.outS = Math.max(1e-3, (outMs ?? 0) * k);
    slow.t = 0; slow.on = true;
  }
  function slowNow() {
    if (!slow.on) return 1;
    const t = slow.t;
    if (t < slow.inS) return slow.from + (slow.scale - slow.from) * smooth(t / slow.inS);
    if (t < slow.inS + slow.holdS) return slow.scale;
    const u = (t - slow.inS - slow.holdS) / slow.outS;
    return u >= 1 ? 1 : slow.scale + (1 - slow.scale) * smooth(u);
  }
  function shake(strength = 0.5, ms = 220) { shakeAmp = Math.max(shakeAmp * 0.6, Math.min(1.5, strength)); shakeT = 0; shakeDecay = Math.max(0.05, ms / 1000); }
  /** A directional kick of the frame (screen x right, y up; strength ~0..1). Small: the backdrop has a 6% margin. */
  function nudge(dx = 1, dy = 0, strength = 0.5) { nudgeS.vx += dx * strength * 0.11; nudgeS.vy += dy * strength * 0.11; }
  function punchIn(target, ms = 900, amount = 0.38) {
    const p = target?.isObject3D ? target.getWorldPosition(new THREE.Vector3()) : (target ? target.clone() : BATTLE.target.clone());
    if (target?.isObject3D) p.y = Math.max(p.y, 1.0);
    punch.target.copy(p); punch.total = (ms / 1000) / speed; punch.t = 0; punch.amount = amount; punch.active = true;
  }

  // ---- projection and picking ----
  function project(obj, yOffset = 0) {
    if (obj?.isObject3D) obj.getWorldPosition(tmpV); else tmpV.copy(obj);
    tmpV.y += yOffset;
    const v = tmpV.project(camera);
    return { x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height, visible: v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 };
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  /** enemy uid | 'party' (either hero) | null */
  function pick(clientX, clientY) { const u = pickDetail(clientX, clientY); return u === 'marc' || u === 'yola' ? 'party' : u; }
  /** like pick, but names the hero: enemy uid | 'marc' | 'yola' | null */
  function pickDetail(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    let best = null, bestD = Infinity;
    for (const [uid, p] of pickables) {
      if (!p.proxy.visible || p.enabled === false) continue;
      p.proxy.updateMatrixWorld(true);
      const hit = ray.intersectObject(p.proxy, false)[0];
      if (hit && hit.distance < bestD) { bestD = hit.distance; best = uid; }
    }
    return best;
  }
  // actors register a box proxy: (uid, Object3D proxy) -> unregister
  function addPickable(uid, proxy, owner) { pickables.set(uid, { proxy, owner, enabled: true }); return () => { if (pickables.get(uid)?.proxy === proxy) pickables.delete(uid); }; }
  function setPickable(uid, on) { const p = pickables.get(uid); if (p) p.enabled = on; }

  // ---- the frame ----
  function onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); }

  function step(realDt, draw = true) {
    realDt = Math.min(realDt, 1 / 20);
    frameNo++;
    let k = speed;
    if (hitStopLeft > 0) { hitStopLeft -= realDt; k = 0; }
    else if (slow.on) {
      slow.t += realDt;
      slowScale = slowNow();
      if (slow.t >= slow.inS + slow.holdS + slow.outS) { slow.on = false; slowScale = 1; }
      k *= slowScale;
    } else slowScale = 1;
    const dt = realDt * k;
    for (const fn of frameFns) { try { fn(dt, realDt); } catch (e) { console.error('[stage] frame', e); } }
    updateCamera(realDt);
    if (back.userData.fade) {
      back.userData.fade += realDt / 0.45; back.material.opacity = Math.min(1, back.userData.fade);
      if (back.userData.fade >= 1) { back.userData.fade = 0; fallback.group.visible = false; backOld.visible = false; }
    }
    overlay.update(realDt);
    if (flashL.intensity > 0) flashL.intensity = Math.max(0, flashL.intensity - realDt * 260);
    if (draw) {
      // another module (the painter) may be mid-way through its own passes between awaits: draw to the canvas, then
      // hand its render target and clear state back untouched
      const prevTarget = renderer.getRenderTarget(), prevAuto = renderer.autoClear;
      renderer.setRenderTarget(null); renderer.autoClear = true;
      renderer.render(scene, camera);
      renderer.setRenderTarget(prevTarget); renderer.autoClear = prevAuto;
    }
  }

  let camOverride = null;
  function updateCamera(realDt) {
    if (camOverride) { camOverride(camera, realDt); camera.updateProjectionMatrix(); return; }
    // base view
    applyBattleCamera(camera, width / height);
    let fov = camera.fov;
    lookNow.copy(lookBase);
    // punch-in: turn toward the target and narrow the lens (in 18%, hold, out over the last 35%)
    if (punch.active) {
      punch.t += realDt;
      const u = punch.t / punch.total;
      const w = u < 0.18 ? smooth(u / 0.18) : u < 0.65 ? 1 : 1 - smooth((u - 0.65) / 0.35);
      if (u >= 1) punch.active = false;
      // where the target sits in the base view (NDC); the narrower view may only centre on points that keep it inside
      // the base frame (the backdrop plane covers exactly that frame)
      camera.lookAt(lookBase); camera.updateMatrixWorld(true);
      const zf = fov * (1 - punch.amount * w);
      const s = Math.tan(THREE.MathUtils.degToRad(zf / 2)) / Math.tan(THREE.MathUtils.degToRad(fov / 2)), lim = Math.max(0, (1 - s) * 0.97);
      const n = tmpV.copy(punch.target).project(camera);
      n.x = THREE.MathUtils.clamp(n.x * 0.85 * w, -lim, lim); n.y = THREE.MathUtils.clamp(n.y * 0.85 * w, -lim, lim);
      lookNow.copy(n.unproject(camera));
      fov = zf;
    }
    camera.lookAt(lookNow);
    // nudge: a stiff damped spring (settles in ~0.25 s)
    if (nudgeS.vx || nudgeS.vy || Math.abs(nudgeS.x) > 1e-5 || Math.abs(nudgeS.y) > 1e-5) {
      for (let left = realDt; left > 1e-6; left -= 1 / 120) {
        const h = Math.min(left, 1 / 120);
        nudgeS.vx += (-420 * nudgeS.x - 30 * nudgeS.vx) * h; nudgeS.vy += (-420 * nudgeS.y - 30 * nudgeS.vy) * h;
        nudgeS.x += nudgeS.vx * h; nudgeS.y += nudgeS.vy * h;
      }
      const lim = 0.012;
      nudgeS.x = THREE.MathUtils.clamp(nudgeS.x, -lim, lim); nudgeS.y = THREE.MathUtils.clamp(nudgeS.y, -lim, lim);
      camera.rotateY(-nudgeS.x); camera.rotateX(nudgeS.y);
      if (Math.abs(nudgeS.vx) + Math.abs(nudgeS.vy) < 1e-4 && Math.abs(nudgeS.x) + Math.abs(nudgeS.y) < 1e-5) nudgeS.x = nudgeS.y = nudgeS.vx = nudgeS.vy = 0;
    }
    // shake: small rotations (keep the backdrop registered)
    if (shakeAmp > 0.001) {
      shakeT += realDt;
      const a = shakeAmp * Math.exp(-shakeT / shakeDecay * 2.2) * 0.012;
      const n = shakeT * 38;
      camera.rotateX(Math.sin(n * 1.1) * a); camera.rotateY(Math.sin(n * 0.83 + 1.7) * a * 1.3); camera.rotateZ(Math.sin(n * 1.37 + 0.4) * a * 0.6);
      if (shakeT > shakeDecay * 2.5) shakeAmp = 0;
    }
    if (Math.abs(fov - camera.fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  renderer.setAnimationLoop((now) => { if (clock.update) clock.update(now); if (running) step(clock.getDelta()); });
  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null; ro?.observe(canvas);
  resize();
  fallback.set(ROOM_TINT.default); fallback.group.visible = true;

  function dispose() {
    disposed = true; running = false; renderer.setAnimationLoop(null);
    window.removeEventListener('resize', onResize); ro?.disconnect();
    frameFns.clear(); pickables.clear();
    envTex.dispose(); renderer.dispose();
  }

  return {
    renderer, scene, camera, clock,
    slots: { marc: SLOTS.marc.clone(), yola: SLOTS.yola.clone(), enemy: SLOTS.enemy.map(v => v.clone()), boss: SLOTS.boss.clone() },
    lights: { hemi, key, rim, fill, partyLamp, enemyLamp },
    setRoom, project, onFrame, resize, setSpeed, shake, nudge, hitStop, slowMo, punchIn, pick, pickDetail, dispose,
    slowRate: () => slowScale,                                  // the slow-motion rate now (1 = none)
    setCameraOverride(fn) { camOverride = fn || null; },     // labs / title screen: fn(camera, realDt) replaces the battle view
    addPickable, setPickable,
    getSpeed: () => speed, timeScale: () => (hitStopLeft > 0 ? 0 : speed * slowScale), frame: () => frameNo,
    pause(on) { running = !on; },
    step,                                                       // manual stepping (tests, screenshots)
    flashLight(pos, color = 0xffd59a, intensity = 40) { flashL.position.copy(pos); flashL.color.setHex(color); flashL.intensity = intensity; },
    pulse(color = 0xb3261e, strength = 0.55, ms = 380) { overlay.pulse(color, strength, ms); },
    whiteFlash(strength = 0.6, ms = 160) { overlay.pulse(0xffffff, strength, ms, true); },
    setVignette(v) { overlay.setVignette(v); },
    floorY: 0,
    get width() { return width; }, get height() { return height; },
    get room() { return roomKey; },
  };
}

const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

// The fallback room: a tiled floor running back to a dim wall, a skirting line and two strips of fluorescent glow.
// Used until (or instead of) the painted backdrop.
function buildFallbackRoom() {
  const group = new THREE.Group(); group.name = 'fallback-room';
  const floorTex = texture('floor_clinical.webp', { repeat: [7, 4] });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x56625f, map: floorTex, roughness: 0.42, metalness: 0.0, envMapIntensity: 0.9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 16), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0.5, 0, -2); floor.receiveShadow = true;
  group.add(floor);
  const wallTex = texture('wall_clinical.webp', { repeat: [6, 1.4] });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x45524f, map: wallTex, roughness: 0.85, envMapIntensity: 0.3 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(34, 7), wallMat);
  wall.position.set(0.5, 3.5, -5.2); wall.receiveShadow = true;
  group.add(wall);
  const skirting = new THREE.Mesh(new THREE.BoxGeometry(34, 0.16, 0.06), new THREE.MeshStandardMaterial({ color: 0x223031, roughness: 0.6 }));
  skirting.position.set(0.5, 0.08, -5.15); group.add(skirting);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(34, 0.12, 0.08), new THREE.MeshStandardMaterial({ color: 0x3f5a5c, roughness: 0.5, metalness: 0.2 }));
  rail.position.set(0.5, 1.0, -5.12); group.add(rail);
  // ceiling lights seen as glowing strips on the wall top, one flickering
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xd8fff4, toneMapped: false });
  const strips = [];
  for (const x of [-4.2, 1.2, 6.4]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.1), glowMat.clone());
    s.position.set(x, 4.3, -5.0); group.add(s); strips.push(s);
  }
  // a dark gradient on the floor's far edge and wall foot (depth)
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(34, 3), new THREE.MeshBasicMaterial({ map: gradientTex(['#0d141600', '#0d1416cc']), transparent: true, depthWrite: false }));
  shade.rotation.x = -Math.PI / 2; shade.position.set(0.5, 0.004, -4.1); group.add(shade);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(34, 4), new THREE.MeshBasicMaterial({ map: gradientTex(['#0d1416f0', '#0d141600']), transparent: true, depthWrite: false }));
  top.position.set(0.5, 5.2, -5.1); group.add(top);
  let t = 0;
  group.onBeforeRender = () => {};
  const tick = () => { t += 1 / 60; const f = Math.sin(t * 13) > 0.93 ? 0.35 : 1; strips[1].material.color.setRGB(0.85 * f, 1 * f, 0.96 * f); };
  group.userData.tick = tick;
  floor.onBeforeRender = tick;
  return {
    group,
    set(tint) {
      floorMat.map = texture(tint.floorTex || 'floor_clinical.webp', { repeat: [7, 4] }); floorMat.color.setHex(tint.floorTint || 0x56625f); floorMat.needsUpdate = true;
      wallMat.map = texture(tint.wallTex || 'wall_clinical.webp', { repeat: [6, 1.4] }); wallMat.needsUpdate = true;
    },
  };
}

function gradientTex(stops) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 64); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  x.fillStyle = g; x.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Screen-space overlay quad: a soft vignette always, plus colour pulses (damage red, finisher white).
function makeOverlay() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { uVig: { value: 0.42 }, uPulse: { value: new THREE.Color(0xb3261e) }, uPulseA: { value: 0 }, uFlat: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uVig; uniform vec3 uPulse; uniform float uPulseA; uniform float uFlat;
      void main(){
        vec2 d = vUv - 0.5; d.x *= 1.25; float r = length(d);
        float vig = smoothstep(0.32, 0.95, r) * uVig;
        float edge = mix(smoothstep(0.18, 0.85, r), 1.0, uFlat) * uPulseA;
        vec3 col = mix(vec3(0.0), uPulse, edge / max(0.0001, edge + vig));
        gl_FragColor = vec4(col, clamp(vig + edge, 0.0, 1.0));
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.frustumCulled = false; mesh.renderOrder = 9999; mesh.position.z = -0.2;
  let t = 0, total = 0, peak = 0;
  return {
    mesh,
    pulse(color, strength, ms, flat = false) { mat.uniforms.uPulse.value.setHex(color); peak = strength; total = ms / 1000; t = 0; mat.uniforms.uFlat.value = flat ? 1 : 0; },
    setVignette(v) { mat.uniforms.uVig.value = v; },
    update(dt) {
      if (total <= 0) return;
      t += dt; const u = t / total;
      mat.uniforms.uPulseA.value = u >= 1 ? 0 : peak * (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85);
      if (u >= 1) total = 0;
    },
  };
}
