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
- Stage 1 running: workflow wf_52a84bc0-8c2 builds engine, run+sim, render, painter+studio, UI kit, screens, audio,
  StS check, logic review in parallel (module ownership in the workflow prompts / BUILD_SPEC section 9).
- Next: Stage 2 integration (src/main.js + src/app/: router, combat screen wiring stage+director+HUD+audio, save/continue,
  debug API window.__SL), playtest bot (tools/playtest.mjs), snap plan, then review/polish loops, deploy.
