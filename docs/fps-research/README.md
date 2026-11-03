# FPS prototype: research passes

Three research passes (November 2026), each a prioritised checklist with sources:
- `fps-feel.md`: what makes a shooter feel good (weapon feel, hit feedback, hurt feedback, movement, pacing, aim help).
- `phone-performance.md`: making it run and read well in iPhone Safari (frame rate, memory, fill rate, readability, sessions).
- `touch-controls.md`: making touch controls feel good (look, firing, aim assist, stick, button layout, Safari plumbing).

Hard published numbers are rare (studios don't publish aim-assist strengths or look curves). Each file marks which
numbers come from a source and which are starting values to tune on a real phone.

## What it means for this prototype, in order
Done:
- Only the hands and gun show: Yola's real idle holds, drawn in their own pass with a narrower lens (54° vertical vs the
  world's 74–78°). Her full-body reload clips swung the gun round her body, so reloads are now a first-person tilt and
  slap (pistol) or pump (shotgun) pivoting on her hands. A near clip plane keeps her body out of the camera.
- Pixel ratio capped at 1.5 on phones, no antialiasing on touch (fill rate is the iPhone's limit).

Next (biggest win per hour first):
1. **Phone aim help** (touch-controls 1–3): auto-fire when the crosshair rests on a zombie (~120 ms; pistol 15 m,
   shotgun 7 m) as the phone default; aim friction near zombies (look x0.55); ~20% bigger hitboxes on touch.
2. **Look and stick tuning** (touch-controls 4–6): stick radius ~60 pt with a 6 pt dead zone and a `x^1.5` curve; auto-run
   when held at the edge; look linear ~0.004 rad/px with a sensitivity slider; buttons FIRE 80 / SHOVE 64 / R and swap
   52 pt, all inside the safe area, with a press glow and click. Pointer Events with pointer capture.
3. **Hit feel** (fps-feel 3, 4, 8, 9): spring-based split recoil (camera + gun), a short hit-stop on the zombie only
   for big hits, a head snap on headshots, a distinct headshot / kill sound, a directional damage arc.
4. **Shake and comfort** (fps-feel 6): trauma-squared shake on rotation only; a head-bob off switch.
5. **Performance governor** (phone-performance): watch frame time, step pixel ratio down 1.5 -> 1.25 -> 1; pause on
   `visibilitychange`; keep draw calls under ~100 and lights fixed (no shader recompiles); warm shaders before Start.
6. **Pacing** (fps-feel 10): telegraph every spawn with its sound from its doorway 1–2 s before; a sound per zombie type.
7. Later: gyro aim as an option (needs a permission tap on iOS), Add to Home Screen for true fullscreen.
