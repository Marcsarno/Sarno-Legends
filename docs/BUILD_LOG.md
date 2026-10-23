# Build log: what changed, step by step

The catalog of the build, newest at the bottom. Every step has its screenshots in `public/build-log/frames/`;
play them in order like a flip-book at **/build-log/** on the deployed site (or `npm run dev` → http://localhost:5180/build-log/).
Frame numbers (#n) link to `public/build-log/index.html#n`.

## Stage 0: scaffold and assets (2026-10-23)
- Vite + three 0.186 project, `npm run assets` pipeline: pulls heroes, zombies, weapons, hospital props, CC0 sfx and Marc's music
  out of yola-zombie with a read-only `git archive`, keeps only the clips the game uses (no `kev_`, `t_`, `tripo_` clips),
  WebP textures, gltfpack (quantized geometry, 30 Hz quantized clips, meshopt). Models 43 MB → 15 MB.
- `tools/snap.mjs` build-log camera and the flip-book player.
- `docs/BUILD_SPEC.md`: the build contract (modules, combat event contract, every card/zombie/relic/potion/event/weapon number).
- Shared UI foundation: design tokens, fonts (Bebas Neue, Oswald, Barlow Semi Condensed), DOM and motion helpers, icon API; shared battle camera.
- **Before → after:** nothing → #1 asset check (Marc, Yola and a walker on a flat background).
