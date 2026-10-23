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
- Stage 0 done: scaffold, asset pipeline, spec, build-log tooling (commits 7162637 and after).
- Stage 1 done (commit 76d7f28): all modules built and tested in labs; 149 tests; frames #2-#11.
  Builder reports: /tmp/claude-0/-home-user/d8a7a6c5-169c-5c1d-a65d-4fcaf359827b/tasks/wiaxv90v2.output (scratch; may be gone).
- Stage 2 running: workflow wf_6d3cdcfa-e19 = integrator (index.html, src/main.js, src/app/) then QA (tools/playtest.mjs,
  tools/snap-plan.json, bug fixes).
- Next: Stage 2 integration (src/main.js + src/app/: router, combat screen wiring stage+director+HUD+audio, save/continue,
  debug API window.__SL), playtest bot (tools/playtest.mjs), snap plan, then review/polish loops, deploy.
