# Touch controls for a phone FPS (iPhone landscape, mobile Safari, Three.js)

Research pass, 2026-11-03. Each item says what is **sourced** and what is **our inference**.
Units: on iPhone, 1 CSS px = 1 pt, so Apple's "44 pt" means 44 CSS px in the page.
Current scheme for reference: look = 2.1 * 0.0022 = 0.00462 rad/px = **0.265 deg per CSS px**. On a ~852 px wide iPhone 15/16 in landscape, a ~400 px swipe across the right half turns about 106 deg. That is a fair default, maybe slightly fast for fine aim.

Network note: blog.activision.com, pocketgamer.com and bugnet.io were blocked from direct fetch in this session. Their content below comes from search-result summaries. Allow those hosts in the session's network settings if you want them read in full.

Hard numbers were thin. Big studios don't publish curve shapes or aim-assist strengths. Settings guides publish only player presets, and those conflict. Treat every number not attributed to Apple/Google/MDN as a starting value to tune on a device.

---

## P1: Highest impact (do first)

### 1. Auto-fire / "fire when the crosshair is on an enemy" as the default
- **Dead Trigger 2 (Madfinger, a zombie FPS like ours)** ships auto-fire ("auto-trigger") as the **default**, with a setting to switch to a manual trigger. Madfinger: "It sounds stupid... But it's really fun." Reviewers: it "alleviates a lot of the difficulty involving touchscreen controls" and lets the game "flow faster without the worry of hitting the wrong button". Con: it sometimes engages zombies you'd rather avoid.
  - E3 2013 Madfinger interview, Pocket Gamer: https://www.pocketgamer.com/dead-trigger-2/e3-2013-madfinger-explains-its-always-connected-community-approach-to-zombie-f2p
  - NoypiGeeks review: https://www.noypigeeks.com/?p=19367
  - Making of Dead Trigger (controls inherited from Shadowgun, "tuned for easy use"): https://www.pocketgamer.biz/right-on-target-the-making-of-dead-trigger
- **CoD Mobile "Simple mode"** fires automatically when the crosshair is on an enemy, and has a setting to limit the auto hip-fire range. "Advanced mode" adds a manual fire button. Guides call Simple the beginner mode and Advanced the more accurate one.
  - Activision, "Getting a Grip on the CoD Mobile Controls": https://blog.activision.com/call-of-duty/2019-10/Getting-a-Grip-on-the-Call-of-Duty-Mobile-Controls
- **Fortnite mobile** offers three fire modes: **Auto Fire / Tap Anywhere / Dedicated Button**. Epic and guides recommend Auto Fire for newcomers.
  - Epic, "Getting Started - Fortnite for Mobile" (2020): https://www.fortnite.com/news/getting-started---fortnite-for-mobile
  - Digital Trends beginners guide: https://www.digitaltrends.com/gaming/fortnite-mobile-beginners-guide/
- **Our inference:** zombies are slow and come in hordes, so auto-fire suits this game better than it suits PvP, where it gives away your position. Keep the FIRE button for players who turn auto-fire off. Implementation: raycast from the crosshair each frame. If it hits a zombie hitbox within range (pistol ~15 m, shotgun ~8 m), fire after a short dwell (~100-150 ms, so a sweep across a zombie doesn't trigger) at the weapon's normal rate. The shotgun should probably only auto-fire inside its effective range.

### 2. Touch aim assist: friction (slowdown) first, light magnetism second
- **Apex Legends Mobile:** design director Jordan Patz said mobile aim assist is **noticeably stronger than on PC**. They balanced that with a slightly longer time-to-kill, and tune assist per weapon and per target. Dot Esports: https://dotesports.com/news/does-apex-legends-mobile-have-aim-assist
- How Apex assist feels (player description): rotation speed drops when an enemy is near the crosshair, so the same input turns less. EA forums: https://forums.ea.com/discussions/apex-legends-feedback-en/2024-nerf-aim-assistrespawn/8719175/replies/8719184
- CoD Mobile: aim assist is on by default and helps "when aiming down sights" (Activision blog, above).
- Halo: Spartan Assault (touch): many weapons auto-target enemies in the direction you fire. https://en.wikipedia.org/wiki/Halo:_Spartan_Assault
- General tuning guidance: magnetism pulls the reticle toward a target and friction slows it near one. Keep both subtle so player input always overrides. https://bugnet.io/blog/how-to-fix-aim-assist-over-or-under-correcting
- **No source gives numeric strengths.** Our starting values: friction cone ~4 deg around the target centre (scale with distance so it covers roughly the zombie's width plus a margin), with look sensitivity multiplied by **0.5-0.6** inside it. Magnetism: only while the player is moving the view or firing, rotate toward the target centre at up to **~15-25% of the player's own look delta** (never when the finger is still, so it never "steals" the camera). Optional bullet magnetism: enlarge zombie hit capsules by ~15-25% for touch, or bend the hitscan ray toward a body within ~2 deg. All of these are cheaper than a precise player.

### 3. Fire-and-drag (keep it), plus "tap anywhere" or a left fire button as options
- The current FIRE button that also looks while dragged matches common practice. Apex Mobile has the related "ADS button rotates camera" option. Apex Mobile also offers a **Left Fire Button** (ON / ON while ADS / OFF). CoD Mobile has "Display Left Fire Button".
  - GamingOnPhone Apex Mobile settings guide: https://gamingonphone.com/guides/apex-legends-mobile-best-settings-guide
  - Gamers Decide CoD Mobile settings: https://gamersdecide.com/articles/cod-mobile-best-settings
- **Our inference:** a left fire button lets the right thumb keep aiming while the left fires. It's useful for the pistol, but it costs movement while firing. Make it optional and default it off, since auto-fire is the default.

### 4. Movement stick: floating, appears under the thumb
- **Apple HIG (Game controls, updated June 2025):** "For movement control, opt to show a virtual thumbstick wherever the player lands their thumb instead of a static thumbstick position. For camera control, opt to use direct touch to pan the camera instead of a virtual thumbstick." Also: "Maximize the amount of space... by using as large of an input area as possible." You can also show the stick faintly at rest and brighten it while it's in use. https://developer.apple.com/design/human-interface-guidelines/game-controls
- Shadowgun Legends uses "invisible virtual sticks that reposition automatically" (Multiplayer.it review): https://multiplayer.it/recensioni/197048-shadowgun-legends-la-recensione-di-shadowgun-legends.html
- Counterpoint: a Game Developer article argues for fixed positions in competitive games, because virtual sticks give no tactile cue to their centre. https://www.gamedeveloper.com/design/let-s-talk-about-touching-making-great-touchscreen-controls ; https://www.gamedeveloper.com/design/virtual-dual-stick-controls-usability
- Dead zone: "small" so a resting thumb doesn't drift, plus a response curve with fine control near the centre and full speed at the edge. Output: `dist<DZ ? 0 : clamp(delta, R)/R`. (Cursa tutorial: https://cursa.app/en/page/touch-controls-for-mobile-games-input-patterns-and-feedback ; Enhanced On-Screen Stick: https://github.com/annulusgames/enhancedonscreenstick)
- **"Dynamic" / follow stick:** if the thumb drags beyond the radius, the base follows it, so the player never "runs out" of stick. (Unity Joystick Pack docs.)
- **Sprint:** CoD Mobile has "Joystick Sprint", which sprints when you hold the stick forward (Activision blog). It also has "Joystick Auto-Sprint"; guides disagree on whether to turn it on. Gamers Decide (above); GGRecon: https://www.ggrecon.com/guides/best-call-of-duty-mobile-season-9-settings-guide/
- **Numbers (ours, no source gives radii):** base radius **60 pt** (120 pt diameter knob ring), dead zone **10% of radius (~6 pt)** after rescaling the output so it starts at 0, response `out = in^1.5` for walk precision. If the push goes **>~110% of radius and within ±30 deg of forward for ~250 ms**, enter sprint (show a sprint lock icon above the stick).

### 5. Touch targets, placement and safe areas
- **Apple HIG:** frequently used controls at least **44x44 pt**, less important ones (menus) at least **28x28 pt**. Keep buttons off the Home indicator and Dynamic Island. Put frequent buttons near the thumb but outside the circular regions where move and look happen. Put secondary controls (menus) at the top. Use symbols, not "A/X/R1". Hide controls that aren't currently relevant. Same HIG page, above.
- **Apple HIG (Gestures):** make tap targets bigger than the visible art, because "interaction may start slightly outside of their visual bounds." Don't fight system edge gestures. Native games can use "edge protect", but web pages can't, so stay inside the safe area. https://developer.apple.com/design/human-interface-guidelines/gestures
- **Google / Android:** **48x48 dp (~9 mm)** with **≥8 dp** between targets. https://support.google.com/accessibility/android/answer/7101858 (A W3C thread notes the 8 dp spacing is not independently validated: https://lists.w3.org/Archives/Public/public-low-vision-a11y-tf/2019Jan/0034.html)
- **Safe area:** use `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` and pad HUD containers with `env(safe-area-inset-left/right/bottom)`. WebKit, "Designing Websites for iPhone X": https://webkit.org/?p=7929 ; PlayCanvas safe areas: https://developer.playcanvas.com/user-manual/user-interface/safe-area.md ; WebKit bug on landscape insets: https://bugs.webkit.org/show_bug.cgi?id=236445
- **Customisation:** CoD Mobile's Custom Layout lets players "drag, drop, and change the size and opacity of everything on-screen" (Activision blog). That's worth adding later. A size slider and an opacity slider are the cheap version.

---

## P2: Feel polish

### 6. Look curve, smoothing and frame-rate independence
- Apple: direct touch-pan for the camera (above).
- No mobile studio publishes its curve. One console write-up separates "aim smoothing" (filtering jitter into gradual turning) from "acceleration" (speed-dependent gain). https://drstrangevolt.blogspot.de/2012/12/aim-acceleration-in-console-shooters-part1.html
- Android's pointer ballistics are a piecewise **gain vs finger speed (mm/s)** curve, which is a usable template. https://gerrit.omnirom.org/plugins/gitiles/android_frameworks_native/+/d35a24b0dcb1563f8b80620a2413f3fc7dbeb14c%5E%21
- Players complain when touch aim varies with swipe speed and frame rate, and ask for a fixed, linear option. Minecraft feedback: https://feedback.minecraft.net/hc/en-us/community/posts/45759686198669-Fixed-sensitivity
- **1€ filter** (Casiez et al.) gives adaptive smoothing: little lag when fast, little jitter when slow. Tuning: start with beta=0 and mincutoff ~1 Hz. Lower mincutoff to cut jitter at rest, raise beta to cut lag at speed. https://cristal.univ-lille.fr/~casiez/1euro ; npm `1eurofilter`: https://www.npmjs.org/package/1eurofilter
- **Our recommendation:** apply raw pointer deltas directly to yaw/pitch in the pointermove handler, accumulated and consumed once per frame. Never multiply by frame dt, because a pixel is already a distance. Keep the response **linear by default**, with optional mild acceleration (gain 1.0 below ~300 px/s rising to ~1.3 at ~1500 px/s). If you smooth at all, use a light 1€ filter (mincutoff ~2-3 Hz, beta tuned) or nothing. Never use a fixed-lerp smoother, because it adds visible lag. No dead zone on look, apart from ignoring the first ~3 px of a new touch so a tap on FIRE doesn't nudge aim. Pitch at ~0.8-0.9x yaw is common in presets. Settings slider range **0.3x-3x** of the default.

### 7. Separate ADS / scoped sensitivity
- Every big mobile shooter separates ADS from hip-fire sensitivity. Apex Mobile presets show hip-fire FPP ~210%, 1x ADS ~125%, 10x ADS ~15%. PUBG Mobile scales gyro and touch per scope. Values conflict between guides, and all say to tune in the firing range.
  - Apex Mobile settings (AFK Gaming): https://afkgaming.com/mobileesports/guide/apex-legends-mobile-best-settings-sensitivity-graphics-gameplay
  - PUBG gyro (Android Central): https://www.androidcentral.com/how-use-gyroscope-controls-aiming-pubg-mobile
- **Ours:** if the shotgun or pistol gets an aim-down-sights state, scale look by **~0.6x** with FOV narrowing about 1.3x. Otherwise skip it.

### 8. Gyro aiming (optional, later)
- PUBG Mobile offers gyro (Off / Scope On / Always On), and competitive players commonly use it for fine aim and recoil control. Sportskeeda: https://www.sportskeeda.com/esports/best-sensitivity-settings-for-gyro-players-in-pubg-mobile ; Android Central (above).
- **iOS Safari flow:** `DeviceMotionEvent.requestPermission()` (and `DeviceOrientationEvent.requestPermission()`) must run inside a user gesture handler such as a click. It returns `"granted"` or `"denied"`. Feature-detect with `typeof DeviceMotionEvent.requestPermission === 'function'`. It needs HTTPS. The decision is cached per site, and a denial may stick until Safari is fully quit or site data is cleared.
  - MDN: https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/requestPermission_static
  - Apple forums: https://developer.apple.com/forums/thread/128376 ; WebKit bug 203287: https://bugs.webkit.org/show_bug.cgi?id=203287 ; PlayCanvas forum: https://forum.playcanvas.com/t/asking-for-a-permission-on-ios-12-2/16031
- **Our verdict:** worth a toggle later, not now. Ask from the "Tap to start" button with gyro off by default. Use `devicemotion.rotationRate` (deg/s; `alpha`/`beta`/`gamma`, remapped for landscape orientation) multiplied by dt, rather than absolute orientation angles, which drift and have gimbal problems. Add a small dead zone (~1-2 deg/s) to kill hand tremor. Offer "Always / only while aiming".

### 9. Press feedback: visual, audio, haptics
- **Apple HIG:** "Always include visible and tactile press states." Use a glow or press effect that's visible even when the finger covers the button, and combine it with sound and haptics (game-controls page, above).
- **Haptics in iOS Safari (status Nov 2026):**
  - `navigator.vibrate()` is **not supported** on iOS Safari. It returns false and doesn't vibrate. https://bugnet.io/blog/fix-web-game-vibrate-api-not-available-ios-safari
  - Workaround: the `<input type="checkbox" switch>` element (Safari 17.4+) plays a system haptic when toggled. Libraries `ios-haptics` and WebHaptics triggered it from script. **Apple patched programmatic triggering in iOS 26.5**, and the ios-haptics README says it "only works on iOS 17.4 to 26.4". Only a real tap on a real switch still buzzes.
    - https://github.com/tijnjh/ios-haptics ; https://azukiazusa.dev/en/blog/ios-safari-web-haptics ; https://rapidtoolset.com/en/tool/ios-haptics-tester
  - **Conclusion:** don't plan around haptics in Safari. If you want them, call ios-haptics best-effort on fire and hit (it no-ops on newer iOS). Lean on **audio clicks plus visual punch**: button scale to 0.92 with a brightening glow, a crosshair hit marker, a small screen shake on shotgun fire.
- Opacity: show controls faint at rest (~0.35-0.45) and bright while touched (~0.8). Apple shows the same idea with the "visible vs hidden thumbstick" images.

### 10. Preventing accidental input
- Our recommendations (not sourced): **RELOAD** auto-triggers at 0 ammo (common in all of these shooters). Put the manual reload button **away from FIRE**, at the top of the right cluster, and fire it on release only if the finger stayed inside the button (cancel when dragged off). **SWAP** also triggers on release. **SHOVE** triggers on press, since it's time-critical. Don't place any button within ~12 pt of the look zone's most common thumb landing spot.
- HIG "Combine functionality into a single control": e.g. tap TORCH to toggle it, or hold SWAP to open a wheel (if more weapons come later).

---

## P3: Web plumbing (Safari)

### 11. Events, touch-action, selection, zoom
- Use **Pointer Events** with one handler per `pointerId`. Track which zone/button each pointer started in and route all its moves there ("ownership"). Use `setPointerCapture` so a drag that leaves the button keeps feeding look. javascript.info Pointer events (touch-action: none, pointerId/isPrimary): https://javascript.info/pointer-events ; MDN setPointerCapture: https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture
- `touch-action: none` on the canvas and HUD root removes pan, pinch and double-tap zoom, and with them the old 300 ms tap delay. `manipulation` is enough for plain buttons. Touch interactions tutorial: https://intro-web-tech.pages.dev/css/tutorials/12-mobile/02_touch-interactions.html
- Long-press loupe/callout: set `-webkit-user-select:none; user-select:none; -webkit-touch-callout:none` on everything. The magnifier can still appear on iOS 15+ and was reported again on iOS 26.1, so **also call `preventDefault()` on `touchstart` with `{passive:false}`** on the game root (and on `contextmenu`, `selectstart`, `gesturestart`). WebKit bug 231161: https://bugs.webkit.org/show_bug.cgi?id=231161 ; Apple forum (iOS 26.1): https://developer.apple.com/forums/thread/808606 ; WebKit bug 251572: https://bugs.webkit.org/show_bug.cgi?id=251572
- Use `pointerrawupdate`/`getCoalescedEvents()` only if Safari supports them. Check before relying on them; nothing found in this pass.
- Read input in the event handlers, then apply it at the start of the next `requestAnimationFrame`. Don't do work per event.
- Handle `pointercancel` and `lostpointercapture` (e.g. a Control Center swipe or a notification) by releasing the stick and stopping fire. Otherwise the player keeps walking or shooting.

### 12. Edge gestures in Safari
- Web pages can't opt into "edge protect". The bottom edge (home indicator) and top-right (Control Center) belong to iOS. Keep the move zone and buttons ≥ `env(safe-area-inset-bottom)` + ~8 pt above the bottom and away from the top corners. Running in Safari's tab bar mode wastes space, so suggest "Add to Home Screen" for a standalone PWA (`display: fullscreen/standalone`). Sources: Apple gestures HIG, WebKit safe area post (above).

---

## Top 10 changes for our scheme (concrete values)

1. **Auto-fire on by default.** Raycast the crosshair each frame. If it's on a zombie for ≥120 ms and within range (pistol 15 m, shotgun 7 m), fire at the weapon's rate (pistol 6/s, shotgun normal pump time). Keep FIRE for "manual" mode in settings. (Dead Trigger 2, CoD Mobile Simple, Fortnite Auto Fire.)
2. **Aim friction:** when the crosshair is within a cone of the zombie's half-width + 0.3 m, multiply look sensitivity by **0.55**. Ease in and out over the cone edge.
3. **Light magnetism while the player is already moving the view:** add up to **20%** of the look delta's magnitude toward the nearest target centre within ~5 deg. Nothing when the finger is still. Also **enlarge zombie hit capsules by ~20%** on touch.
4. **Floating, follow-style move stick:** spawns under the thumb in the left 42%, radius **60 pt**, dead zone **6 pt** (10%), response `in^1.5`, base follows the thumb beyond **1.0x** radius. Faint ghost at the last position (opacity 0.3) and bright while held (0.8).
5. **Auto-sprint:** stick pushed to **≥100% of radius within ±30 deg of forward for 250 ms** → sprint, with a "sprint" chip above the stick. Firing or shoving cancels sprint.
6. **Look:** keep it linear and set the default to **0.0040 rad/px (~0.23 deg/pt)**, slightly below the current 0.00462. Add a slider from 0.3x to 3x and pitch = 0.85x yaw. Ignore the first 3 pt of a new right-side touch. Consume accumulated deltas once per frame with no dt scaling. Optional 1€ smoothing (mincutoff 2.5 Hz), off by default.
7. **Buttons:** FIRE **≥80 pt** (visible ~72 pt); SHOVE **64 pt**; RELOAD/SWAP **52 pt**; TORCH **44 pt** (top-right, a secondary control). Leave **≥12 pt** between hit areas and make each hit area ~8 pt bigger than its art. Everything inset by `env(safe-area-inset-*)` + 12 pt, and `viewport-fit=cover`.
8. **Accident-proofing:** reload automatically at 0 ammo. Manual RELOAD and SWAP fire **on release, inside the button only**, and sit above FIRE away from the thumb's resting arc. SHOVE fires on press. Handle `pointercancel` (stop moving and firing).
9. **Feedback:** on press, scale to 0.92 with a glow (visible around the thumb), plus a short click sound (Web Audio, preloaded, < 20 ms). Show a hit marker and a small shake on shotgun fire. Haptics through ios-haptics best-effort only, since Safari blocks programmatic haptics from iOS 26.5.
10. **Safari plumbing:** Pointer Events with per-`pointerId` ownership plus `setPointerCapture`. Add `touch-action:none`, `user-select:none` and `-webkit-touch-callout:none` on the game root. Call `preventDefault` on `touchstart` (`{passive:false}`), `gesturestart`, `contextmenu` and `dblclick`. Add a "Tap to play" overlay that also unlocks audio and, later, asks for gyro permission (gyro off by default, `rotationRate`-based, 1.5 deg/s dead zone).
