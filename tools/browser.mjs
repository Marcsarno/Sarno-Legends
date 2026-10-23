// Shared headless Chromium launcher for screenshots and playtests (WebGL through SwiftShader).
import { chromium } from 'playwright';
import fs from 'node:fs';

export function launch(opts = {}) {
  const exe = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(f => fs.existsSync(f));
  return chromium.launch({
    executablePath: process.env.CHROME_PATH || exe,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
    ...opts,
  });
}
