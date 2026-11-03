# Making a phone FPS feel good: experience and performance (iPhone Safari, three.js)

Research pass done 2026-11-03. Scope: the experience and performance work, not the control scheme.
Confidence tags: **[official]** is Apple, WebKit or Unity docs. **[measured]** is a benchmark or bug report with numbers. **[anecdote]** is a forum post or community guide. **[judgment]** is my own inference, with no source.
Gaps: gamedeveloper.com ("UX deep dive: painful reality of building FPS experiences on mobile") could not be fetched from this session because the host is blocked. No first-party GDC talk turned up for CoD Mobile, PUBG Mobile, Into the Dead 2 or Dead Trigger 2. No 2026 Apple statement on Vibration, Fullscreen or 120 Hz turned up either.

---

## P0: do these first, or the prototype will feel broken

### 1. Cap the pixel ratio. Fill rate is the main cost on iPhone.
- An iPhone has a devicePixelRatio of 3. Rendering at the native ratio means about 9x the pixels of CSS size. Going from DPR 3 to 2 removes more than 55% of the fragment work. A single-mesh scene dropped to about 40 fps on iOS at native DPR. **[anecdote]**
- Typical caps are `Math.min(devicePixelRatio, 2)`, and 1.5 for mobile games. **[anecdote]** For an FPS, start at 1.25 to 1.5 and drop to 1.0 under load. **[judgment]**
- Sources: "Low fps on ios mobile with pixel ratio set as window.devicePixelRatio", https://discourse.threejs.org/t/low-fps-on-ios-mobile-with-pixel-ration-set-as-window-devicepixelratio/4963 ; "Three.js Mobile Performance: Limit Device Pixel Ratio", https://salivity.github.io/three.js/article/three-js-mobile-performance-limit-device-pixel-ratio ; WebKit bug 230973 (DPR degrades perf on iOS 15), https://lists.webkit.org/pipermail/webkit-unassigned/2021-September/998815.html

### 2. Turn off MSAA (`antialias:false`) on iOS. Use FXAA only if needed.
- WebKit bug 276959 tested a three.js scene with skinned meshes on iPhone 12 / Safari 17.5. It ran at about 20 fps with antialias on and about 120 fps with it off, at only 42 draw calls. So it was not bound by draw calls. **[measured, single report]**
- At DPR 1.5 or higher, aliasing is barely visible on a phone anyway. **[judgment]**
- Source: WebKit Bugzilla 276959, https://bugs.webkit.org/show_bug.cgi?id=276959

### 3. Use dynamic resolution and a stable frame-rate target, and plan for thermals.
- **Target a locked 60 fps on mid and recent iPhones, with a fallback lock at 30.** CoD Mobile's stated target was a stable 57 to 60 fps. With Samsung's Adaptive Performance, it lowered the target fps when temperature rose quickly, to limit peak heat. The result was more stable fps and an average about 7% higher. **[official vendor case study]** GameBench measured CoD Mobile at a solid 60 fps on iPhone 11 Pro Max. **[measured]**
  - "Call of Duty: Mobile and Adaptive Performance" (Samsung), https://developer.samsung.com/galaxy-gamedev/gamedev-blog/cod.html
  - GameBench "PUBG vs Call of Duty Mobile Performance Report 2020", https://quality.gamebench.net/hubfs/GameBench_PubG_vs_Call_of_Duty_Mobile_Performance_Report_2_2020.pdf
  - "Crossing platforms: bringing Call of Duty to mobile" (Unite 2019 slides; thermal throttling and lack of active cooling were the main limits), https://dcmpx.remotevs.com/net/slideshare/www/SL/unity3d/crossing-platforms-bringing-call-of-duty-to-mobile
- **Thermals are real on iPhone.** In Notebookcheck's GPU stress test, the iPhone 15 Pro Max throttled by up to 40%, with a Wild Life stress stability of about 52%. The A17 Pro throttled within the first minute. The iPhone 17 Pro Max reached about 65% stability over a 20-minute loop. **[measured]** So whatever runs at 60 fps in minute 1 needs about 1.5 to 2x headroom by minute 10.
  - Notebookcheck, https://www.notebookcheck.com/Apple-iPhone-15-Pro-Max-drosselt-in-unserem-GPU-Stresstest-bis-zu-40-ist-trotzdem-schneller-als-iPhone-14-Pro-Max.756382.0.html ; Appuals, https://appuals.com/a17-pro-throttling-patterns ; Tom's Guide (iPhone 17 Pro Max), https://www.tomsguide.com/phones/iphones/iphone-17-pro-max-endurance-tested-does-the-new-design-actually-improve-performance
- **Apex Legends Mobile** offered frame-rate tiers of 30, 40, 50 and 60 fps, plus a limiter for heat and battery. **[anecdote, guides]** https://beebom.com/apex-legends-mobile-best-fps-graphics-settings
- **Implementation [judgment]:**
  - Measure a rolling 1 to 2 s average of frame time.
  - If it stays above 18 ms, step `setPixelRatio` down: 1.5, then 1.25, then 1.0, then 0.85.
  - If it stays under 12 ms for about 10 s, step back up.
  - Use hysteresis so it does not oscillate.
  - Never resize the canvas element itself. Change only the drawing-buffer ratio (see item 5 on the resize memory leak).
  - Offer a "Battery saver (30 fps)" toggle. To pace at 30, skip every other rAF tick. Do not use setTimeout.
- **ProMotion 120 Hz:** Safari caps rAF near 60 fps by default. 120 Hz requires the user to turn off the experimental flag "Prefer Page Rendering Updates near 60fps". A Home Screen web app also stayed at 60 by default. **[anecdote and WebKit bug]** Conclusion: design for 60. Never assume 120, and do not tie game logic to the frame rate.
  - WebKit bug 173434, https://bugs.webkit.org/show_bug.cgi?id=173434 ; WebKit bug 294338, https://bugs.webkit.org/show_bug.cgi?id=294338

### 4. Use a fixed-timestep simulation and decouple it from rendering.
- This follows from item 3. Frame rate will vary between 30, 60 and 120 and with throttling, so movement, enemy speed and fire rate must not change with it. **[judgment, standard practice]**

### 5. Stay inside iOS Safari's memory limits, or the tab silently reloads.
- iOS kills tabs with heavy WebGL and texture use under memory pressure, then auto-reloads them. This can loop until Safari shows "A problem repeatedly occurred". **[WebKit bug 300782, Oct 2025]** https://bugs.webkit.org/show_bug.cgi?id=300782
- The threshold is undocumented. Reports range from a reload at about 80 to 100 MB on old devices to about 512 MB on 4 GB devices. **[anecdote]** Unity threads: https://discussions.unity.com/t/webgl-memory-increment-issue-and-crash-on-ios/894771 ; Apple forum "Browser memory limit on IOS", https://developer.apple.com/forums/thread/741624
- Each canvas resize can allocate a new backing store that is not freed promptly. Set the canvas size once and debounce resizes. **[anecdote]** "iOS Safari gotchas", https://abratabia.com/mobile-web-games/ios-safari-gotchas.php
- Handle `webglcontextlost` and `webglcontextrestored`. **[anecdote, same source]**
- Avoid extra CSS compositing layers (blur, filters, many transformed elements) over the canvas. They contributed to Safari crashes in one dev log. https://hacklines.com/en/editions/331993/click
- **Budget [judgment]:**
  - Keep total GPU texture memory under about 150 MB.
  - Keep the JS heap small.
  - Dispose geometries, materials and textures between floors or levels.
  - Watch `renderer.info.memory`.

### 6. Compress textures with KTX2 (Basis UASTC/ETC1S) and keep them small.
- KTX2 stays compressed in VRAM. On iPhone it transcodes to ASTC; one forum post shows the iPhone choosing `RGBA_ASTC_4x4`. This cuts texture memory roughly 4 to 8x. **[vendor claim]**
- Watch for the KTX2Loader fallback: "No suitable compressed texture format found. Decoding to RGBA32".
- Sources: https://discourse.threejs.org/t/ktx-astc-etc-support/50815 ; https://discourse.threejs.org/t/basis-textures-with-alpha-appearing-fully-black-and-white-on-some-ipads-and-older-mobile-devices-when-rgb-pvrtc-4bppv1-format-is-used/22575
- **[judgment]** Use 1024 px maximum for characters and 512 px for props, with mipmaps on. Run `gltf-transform` (`etc1s`/`uastc`, `resize`) on the yola-zombie GLBs before shipping.

### 7. Warm up shaders during loading to avoid first-shot and first-zombie hitches.
- Call `renderer.compileAsync(scene, camera)` on the loading screen.
- Also call `renderer.initTexture(tex)` for each texture. Texture and geometry upload is often the real stutter, not the shader compile.
- Render one frame through any post-processing chain, because `compile` misses EffectComposer passes.
- Check that `renderer.info.programs.length` stops growing once play starts.
- Set `toneMapping` and `outputColorSpace` before compiling, otherwise the cache key changes.
- Pre-spawn one of every enemy, muzzle flash, decal and blood effect off-screen during loading. **[anecdote and judgment]**
- Sources: three.js PR 19752, https://github.com/mrdoob/three.js/pull/19752 ; "Reduce first render lag? renderer.compileAsync() is not doing anything", https://discourse.threejs.org/t/reduce-first-render-lag-renderer-compileasync-is-not-doing-anything/86191 ; https://discourse.threejs.org/t/webglrenderer-compile-async-and-possible-wrong-shader-cache-key/89007

### 8. Lock down the page: no scrolling, zoom, rubber-banding or text selection.
- On `html` and `body`, set:
  - `position:fixed; inset:0; overflow:hidden; overscroll-behavior:none`
  - `touch-action:none` on the canvas and the touch layer
  - `-webkit-user-select:none; -webkit-touch-callout:none`
- Call `preventDefault()` on touchmove from a `{passive:false}` listener.
- `user-scalable=no` is unreliable on current iOS. Use `touch-action` instead.
- A 2025 WebKit comment reports that `overscroll-behavior` on `<html>` no longer stops pull-to-refresh. Test both Safari tab-bar layouts. **[anecdote]**
- Sources: WebKit bug 240183, https://bugs.webkit.org/show_bug.cgi?id=240183 ; Chrome "overscroll-behavior", https://developer.chrome.com/blog/overscroll-behavior

### 9. Treat "fullscreen" as Add to Home Screen.
- iPhone Safari has no element Fullscreen API. It works on iPad and Mac only. Support briefly appeared in Safari 17.2 beta and was removed by iOS 17.4 beta. The WebKit bug from 2020 is still open. **[forum and bug]** https://developer.apple.com/forums/thread/770080 ; https://developer.apple.com/forums/thread/133248 ; https://bugs.webkit.org/show_bug.cgi?id=206854
- The fix is a web app manifest with `"display":"standalone"` or `"fullscreen"`, plus `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black-translucent`, `viewport-fit=cover` and an opaque `apple-touch-icon`. Show an "Add to Home Screen for full screen" hint in Safari. Detect standalone mode with `navigator.standalone` or `matchMedia('(display-mode: standalone)')`. **[vendor docs]** https://intercom.help/progressier/en/articles/7999596-understanding-pwa-display-modes
- In plain Safari, landscape still shows the tab and address bars. Size the canvas with `100svh`/`100dvh` (iOS 15.4 and later), not `100vh`. **[anecdote]** https://blog.openreplay.com/es/5-mobile-web-problemas-soluciones/

### 10. Orientation: iOS can't lock it.
- `screen.orientation.lock()` is unsupported in iOS Safari through 26.4, and it requires fullscreen anyway. Show a "rotate your phone" overlay in portrait and pause the game. A manifest `"orientation":"landscape"` value is unverified on iOS. **[caniuse]** https://caniuse.com/mdn-api_screenorientation_lock ; https://bugs.webkit.org/show_bug.cgi?id=257695

### 11. Safe areas: notch and Dynamic Island in landscape.
- With `viewport-fit=cover`, read `env(safe-area-inset-left/right/bottom)`. In landscape the notch side changes when the phone flips. Keep the HUD and buttons inside the insets with a floor, for example `max(12px, env(...))`.
- A canvas-drawn HUD can't see the insets. Read them from a CSS probe element and convert them to canvas units, or build the HUD in HTML over the canvas. **[official WebKit and PlayCanvas docs]**
- Sources: "Designing Websites for iPhone X" (WebKit), https://webkit.org/?p=7929 ; PlayCanvas "Safe Areas", https://developer.playcanvas.com/user-manual/user-interface/safe-area.md

### 12. Audio unlock.
- Create or `resume()` one AudioContext inside the first `touchend` (the "Tap to start" button). Reuse a single context; Safari reportedly caps the number of contexts.
- With the ringer switch on silent, Web Audio is muted. The workaround is to play a looping silent `<audio>` element on the same gesture, which moves Web Audio to the media channel.
- After a tab switch, audio may need another tap. Resume on the next touch.
- Sources: unmute-ios-audio, https://github.com/feross/unmute-ios-audio ; swevans/unmute, https://github.com/swevans/unmute ; "Unlock JavaScript Web Audio in Safari", https://www.mattmontag.com/web/unlock-web-audio-in-safari-for-ios-and-macos

### 13. Auto-pause on interruption.
- On `visibilitychange` (hidden), `pagehide` and `blur`:
  - pause the simulation
  - suspend the AudioContext
  - stop the rAF loop
  - release all touches, so the virtual stick doesn't stay stuck held
- On return, show a pause menu. Never resume straight into combat.
- Clamp the frame delta after any gap, for example to a maximum of 100 ms, so a returning frame doesn't fast-forward enemies. Also pause any countdowns that run separately from the game loop.
- Pause on `touchcancel` and on the portrait overlay too. Incoming calls, Control Center and notification pulls all interrupt play. **[W3C spec and judgment]**
- Sources: W3C Page Visibility, https://www.w3.org/TR/2016/WD-page-visibility-2-20161026 ; html5gamedevs thread, https://html5gamedevs.com/topic/20379-pause-and-resume-with-disabled-visibility-change

---

## P1: rendering budgets (mobile WebGL)

| Item | Budget | Source / confidence |
|---|---|---|
| Draw calls | Comfortable under about 100 to 150 at 60 fps. Mid-range phones struggle past a few hundred. Aim for **under 100** and check `renderer.info.render.calls`. | Third-party guides **[anecdote]**: https://hyperyond-website.pages.dev/blog/webgl-performance-optimization-2025 ; https://digitalstrategyforce.com/journal/how-do-you-optimize-threejs-performance-for-mobile-devices/ |
| Instancing | InstancedMesh for repeated props, BatchedMesh or merged static geometry for level kits. Can collapse hundreds of calls into single digits. | same |
| Skinned characters | One skinned mesh and 1 to 3 materials per character. About 30 bones is the classic mobile target. **[judgment]** Allow 6 to 10 animated zombies on screen at once. Freeze or lower the animation rate of distant ones. Swap far ones to a baked static pose. | Unity "Modeling characters for optimal performance", https://docs.unity3d.com/560/Documentation/Manual/ModelingOptimizedCharacters.html ; Unity mobile tips part 2, https://unity.com/how-to/mobile-game-optimization-tips-part-2 |
| Lights | Shadowgun used almost no dynamic lights: lightmaps, light probes for characters, fake bump detail. Use baked or lightmapped rooms, one hemisphere/ambient light plus at most one directional, and a muzzle flash as a short-lived point light or an emissive sprite. Avoid many point lights, because each one adds shader cost on every lit material. | Unity "Practical rendering optimizations" (Shadowgun), https://docs.unity3d.com/2018.3/Documentation/Manual/MobileOptimizationPracticalRenderingOptimizations.html ; "Shadowgun: optimizing for mobile sample level", https://blog.unity.com/games/shadowgun-optimizing-for-mobile-sample-level |
| Shadows | Shadowgun used blob shadows plus lightmaps, with no real-time shadows. Disable `renderer.shadowMap` on phones. Use a dark radial decal under each zombie. | same, and Unity tips part 2 |
| Fog | Shadowgun found fog dropped fps on old devices. three.js linear `Fog` is cheap (per-fragment math). Use it to hide draw distance, which lets you cull aggressively. | Shadowgun blog **[official, older hardware]** |
| Post-processing | Avoid full-screen bloom, SSAO, SSR, DOF, motion blur and multi-pass EffectComposer chains. Glow-type full-screen effects visibly slow mobile. If needed, use one half-resolution pass at most. Do vignette and damage flash as an HTML overlay or one cheap quad. | Unity tips part 2 **[official]**; half-resolution post claim **[anecdote]** |
| Overdraw | Avoid big transparent particles and smoke layers near the camera, because fill rate is the bottleneck (see item 1). **[judgment]** | |
| Materials | Prefer `MeshLambertMaterial` or baked `MeshBasicMaterial` over `MeshStandardMaterial`/`MeshPhysicalMaterial` for environment pieces. **[judgment]** | |

---

## P1: readability on a 6-inch screen

- **Touch targets:** Apple's game controls guidance sets at least 44x44 pt for frequent controls and 28x28 pt for menus. Respect safe areas, show or hide controls by context, and make the movement and camera areas as large as possible. **[official]** https://developer.apple.com/design/human-interface-guidelines/game-controls
- **Text:** Use 17 pt by default and never below 11 pt on iOS. Thin weights need to be larger. Test game text on the actual device. Apple's game guidance says text should be no smaller than the platform minimum. **[official]** https://developer.apple.com/design/human-interface-guidelines/typography ; "Adapting your game interface for smaller screens", https://developer.apple.com/documentation/metal/adapting-your-game-interface-for-smaller-screens
  - **[judgment]** Make HUD numbers (ammo, HP) about 20 to 24 pt and bold, with a dark outline or shadow. CSS px equal pt on iPhone.
- **HUD placement [judgment, following CoD Mobile and PUBG Mobile convention]:**
  - HP top-left, ammo bottom-right next to the fire button, pause top-right.
  - Keep the screen centre clear. Thumbs cover the bottom corners.
  - Use a minimal HUD and convey state through the world: screen-edge red on damage, audio cues.
- **Crosshair [judgment]:**
  - About 24 to 32 px with a 2 px stroke and a dark outline, so it reads on light and dark backgrounds.
  - Change its colour or expand it when it is over an enemy. This doubles as aim feedback.
  - Add a hit-marker flash and sound on every hit. On a small screen, feedback matters more than precision.
- **Enemy readability in dark scenes:**
  - Fatshark added a subtle rim light to *every* enemy shader in Darktide because dark environments made enemies hard to spot. They set readability priority by enemy type, range and role. **[official dev blog]** https://devtrackers.gg/darktide/p/67a2496a-darktide-101-enemy-character-art-dev-blog
  - Dark scenes that look fine on a monitor look much darker on phones. Players reported that dark enemies were invisible on first appearance. **[anecdote]** Test with the phone at around 50% brightness, outdoors and with Night Shift on.
  - **[judgment]** Light-hued zombie skin against dark hospital walls. Use a cheap fresnel rim in `onBeforeCompile`, or an emissive eye or wound accent. Keep a brightness slider.
- **Field of view:** No controlled studies were found. Community practice for CoD Mobile and Warzone Mobile is about 80 on phones, with 85 to 90 only on screens over about 7 inches. A wider FOV makes enemies smaller and stretches the edges. **[anecdote]** https://www.sportskeeda.com/esports/cod-mobile-optimal-field-view-fov-multiplayer-battle-royale-matches-2 ; https://mobilematters.gg/gaming/warzone-mobile-fov-slider
  - **[judgment]** Use a three.js *vertical* FOV of about 60 to 65 in landscape. On a 19.5:9 phone this gives roughly 100 to 110 horizontal, which is already wide. Don't go wider, or the zombies get small. A narrower FOV also draws fewer objects.
- **Haptics:**
  - iOS Safari has **no** `navigator.vibrate()`. WebKit is opposed to it. **[multiple sources, current through 2025]**
  - Workaround: since Safari 17.4, toggling a hidden `<input type="checkbox" switch>` fires the system haptic. Libraries: `ios-haptics`, `web-haptics`.
  - It's a hack and may break, and it's a light tick only, with no patterns or strength control. Use it sparingly, for hits and for taking damage. Feature-detect, and treat it as a nice-to-have.
  - Sources: https://azukiazusa.dev/en/blog/ios-safari-web-haptics ; https://www.cssscript.com/haptic-feedback-web/

---

## P1: session design and touch-aim difficulty

- **Session length:** GameAnalytics' 2025 report puts the median mobile session at 5 to 6 minutes, and 8 to 9 minutes for the top 25% of games. The Q1 2024 median was about 4.5 minutes, with 4 to 5 sessions a day. **[measured]** https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks ; https://gameanalytics.com/reports/mobile-games-benchmarks-q1-2024
  - **[judgment]** Make each level or wave chunk 3 to 6 minutes. Checkpoint between them, and allow quitting at any point without losing a run.
- **Aim assist is standard on mobile shooters.** PUBG Mobile pulls the crosshair toward the torso. Reviewers describe needing it because touch aiming is imprecise. Warzone Mobile's assist was reported to be weaker on touch than on controller. Into the Dead 2 uses forgiving aim: if you're in front of a zombie, you hit. **[anecdote]**
  - https://vice.com/en/article/pubg-mobile-review-playerunknown-battlegrounds ; https://www.pocketgamer.com/articles/076689/r/ ; https://www.ggrecon.com/articles/warzone-mobile-aim-assist-is-stronger-if-you-use-a-controller ; https://www.pocketgamer.com/articles/075562/into-the-dead-2-review-reanimated-smarter/
- **Tuning [judgment, since no first-party numbers were found]:**
  - *Slowdown:* cut look sensitivity to about 40 to 60% while the crosshair is within about 3 to 5 degrees of a zombie.
  - *Magnetism:* gently pull toward the target's centre, only while the player is moving or turning.
  - *Bullet bending:* accept hits within an enlarged cone.
  - Make hitboxes about 1.2 to 1.5x the visual mesh. Make the head hitbox generous.
  - Use slow shambling zombies (about 1 to 1.5 m/s) and few fast "runners".
  - Telegraph attacks with a windup of about 0.5 to 1 s.
  - Keep enemies mostly in front of the player. Avoid attacks from behind, since turning 180 degrees on touch is slow.
  - Offer auto-fire when the crosshair is on target as an option. CoD Mobile's "simple mode" is the reference, though it was not sourced in this pass.
- **Battery:** offer a 30 fps mode. Stop rendering entirely in menus and on pause; render only on change.

---

## Top 10 for a three.js FPS in iPhone Safari

1. **Set `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))`, with `antialias:false`.** Together these are the biggest single win. One WebKit report shows 20 fps with MSAA and 120 fps without it.
2. **Add a dynamic resolution governor.** Step the pixel ratio between 1.5 and 0.85 based on rolling frame time. Assume 30 to 40% thermal throttling after a few minutes.
3. **Target a locked 60 fps, with a 30 fps battery mode.** Safari caps at 60 by default, so ignore 120. Run a fixed-timestep simulation and clamp the delta.
4. **Stay under 100 draw calls with no real-time shadows.** Use baked or lightmapped rooms, at most one directional light plus a hemisphere light, blob shadows, InstancedMesh for props, and merged level geometry. Avoid bloom, SSAO and other full-screen post effects.
5. **Budget memory: KTX2/ASTC textures at 1024 px or less, one canvas size, and dispose between levels.** iOS silently kills and reloads heavy WebGL tabs. Handle context loss.
6. **Warm up on the loading screen.** Run `compileAsync`, `initTexture` and one frame of every effect and enemy before the "Tap to start" screen, which also unlocks audio. Add the silent `<audio>` trick so sound plays with the ringer switch on silent.
7. **Lock the page and design for Home Screen.** Use `touch-action:none`, `overscroll-behavior:none`, `position:fixed`, `100svh`, a manifest with `display:standalone`/`fullscreen`, and an "Add to Home Screen" hint. The Fullscreen API and orientation lock don't exist on iPhone, so show a "rotate to landscape" overlay that also pauses.
8. **Respect safe areas.** Use `viewport-fit=cover` and `env(safe-area-inset-*)` with a 12 px floor. Build the HUD in HTML/CSS over the canvas. Controls are at least 44 pt and text at least 11 pt; HUD numbers are about 20 pt bold and outlined.
9. **Make dark scenes readable.** Put a rim or fresnel light on every zombie. Use an outlined crosshair that turns red over targets, hit markers, and a vertical FOV of about 60 to 65 degrees (about 80 in CoD-style horizontal terms). Test at 50% screen brightness.
10. **Pause on interruptions and add touch-friendly difficulty.** Pause on `visibilitychange`, `pagehide` and `touchcancel`, and resume into a pause menu. Use 3 to 6 minute chunks, slowdown and magnetism aim assist, hitboxes about 1.3x the mesh, slow telegraphed zombies, and few threats from behind. Haptics come only through the `<input switch>` hack, as an optional extra.
