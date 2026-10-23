# Build state (for picking up after a context reset)

Marc asked (2026-10-23) to build the game now: a fully playable act-1 loop like Slay the Spire, weapon unlocks as the
artifact system, maximum polish/organisation/balance/feel, a catalogued build with before/after screenshots that play
like a video, push to GitHub and Vercel at the end; save and commit before any compaction.

## Where things are
- Contract: `docs/BUILD_SPEC.md` (sections 1-9). Design: `docs/GAME_CORE.md`.
- Catalog: `docs/BUILD_LOG.md`; frames: `public/build-log/` (`node tools/snap.mjs ...`).
- Assets: `npm run assets` (needs ../yola-zombie and ../survival; read-only).
- Vercel: account marc731-6361, team "Marc Sarno" (team_Yn8TA4orIzgoGr4SXz38FNIV, slug marcsarno). The MCP connection
  needed team authorisation (link sent to Marc); deploy via the Vercel MCP (create_git_project on Marcsarno/sarno-legends
  or create_deployment). Never the hornerxpress account.

## Stage log
- Stage 0 done: scaffold, asset pipeline, spec, build-log tooling.
- Stage 1 done (76d7f28): all modules built and tested in labs; frames #2-#11.
- Stage 2 done (de61676): integration (src/app/) + QA. tools/playtest.mjs: 5 full bot runs to the boss, 0 errors
  (4 wins). Debug API window.__SL, ?shot=<scene> (21 scenes, tools/snap-plan.json). Voice barks (Kokoro-82M via
  kokoro-onnx; tools/voice/, placeholder lines; /labs/voice.html is in the build for auditioning).
- **Live:** https://sarno-legends.vercel.app (Vercel project sarno-legends, team marcsarno, linked to GitHub; every push
  to main deploys). Build log at /build-log/.
- Stage 3 running: three parallel polish agents: (1) phone speed: prebaked rooms/card art (tools/bake-art.mjs,
  public/assets/baked/), (2) combat feel + defeat pose + mirrored shield label (src/render), (3) first-run coach +
  phone readability (src/ui, src/app/coach.js).
- Open for Marc: story/event/voice text (all placeholders), voice picks (/labs/voice.html), balance levels (BALANCE.md),
  family call-ins, chapter-2 characters, t_ clip licence (none shipped).
