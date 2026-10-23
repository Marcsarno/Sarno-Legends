// Sarno Legends: the entry point. Boots the app (src/app/app.js), shows the title, then warms up in idle time.
//   ?seed=XYZ    fixed seed for new runs          ?speed=2    game speed override (1 / 1.5 / 2, or more for tests)
//   ?debug=1     FPS / state overlay              ?shot=<scene>  jump to a deterministic scene (src/app/shots.js)
//   ?autoplay=2  the sensible bot plays at that speed
// window.__SL is the debug API (src/app/debug.js); window.__ready turns true once the title takes input.
import { startApp, warmUp } from './app/app.js';
import { installDebug } from './app/debug.js';
import { installErrorOverlay, showError } from './app/errors.js';
import { createBoot } from './app/loading.js';
import { runShot, shotProfile } from './app/shots.js';

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
let app = null;
installErrorOverlay({ onTitle: () => (app ? app.recover() : location.reload()) });

const boot = createBoot();
try {
  app = await startApp({ params, boot, persist: !shot, profile: shot ? shotProfile() : null });
  installDebug(app);
  await app.toTitle();
  boot.done();
  window.__ready = true;
  if (shot) await runShot(app, shot);
  else warmUp(app);
} catch (e) {
  boot.fail('Could not start');
  showError(e, 'boot');
}
