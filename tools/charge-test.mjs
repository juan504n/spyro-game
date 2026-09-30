// Charge regression test: charging lasts exactly as long as the charge button is held.
//   node tools/charge-test.mjs      (needs the dev server on :5173, GV_HMR=0 recommended)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
await page.goto('http://127.0.0.1:5173/?skip=1&preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
await page.addScriptTag({ path: path.join(here, 'bot-inject.js') });
await page.waitForTimeout(1200);

const r = await page.evaluate(() => {
  const B = __bot, G = __game, p = G.player;
  B.install();
  B.god();
  const out = {};
  // a long, open run-up: the western meadow, heading east (the charge must not end on a wall)
  const flat = () => {
    B.place(-100, 50, Math.PI / 2); B.ctl.mx = B.ctl.my = 0; B.ctl.charge = false; B.tick(30);
    const Y = G.cam.yaw, dx = 1, dz = 0;
    B.ctl.my = dx * Math.sin(Y) + dz * Math.cos(Y); B.ctl.mx = -dx * Math.cos(Y) + dz * Math.sin(Y);
    B.tick(20);
  };
  const steps = (n, fn) => { const log = []; for (let i = 0; i < n; i++) { fn?.(i); B.tick(1); log.push({ c: p.chargeT > 0, s: p.speed }); } return log; };

  // 1) a short tap (5 steps held) — charging must stop the moment the button is released
  flat();
  B.tick(30);
  B.ctl.charge = true; B.edge('charge');
  const held = steps(5);
  B.ctl.charge = false;
  const after = steps(30);
  out.tapChargedWhileHeld = held.some((x) => x.c);
  out.tapChargingAfterRelease = after.filter((x) => x.c).length;
  out.tapMaxSpeedAfterRelease = +Math.max(...after.map((x) => x.s)).toFixed(2);

  // 2) holding for 1.5 s keeps charging the whole time, at charge speed
  flat();
  B.ctl.charge = true; B.edge('charge');
  const hold = steps(90);
  out.holdChargingSteps = hold.filter((x) => x.c).length;
  out.holdEndSpeed = +hold[hold.length - 1].s.toFixed(1);
  B.ctl.charge = false;
  const rel = steps(3);
  out.afterReleaseCharging = rel.some((x) => x.c);
  out.speedRightAfterRelease = +rel[0].s.toFixed(1);

  // 3) pressing again while holding does not restart it and a tap edge without the button held does nothing
  flat();
  B.ctl.mx = B.ctl.my = 0; B.tick(30);
  B.edge('charge');                                 // edge only (button already up again): must not charge
  out.edgeOnlyCharges = steps(10).some((x) => x.c);
  return out;
});
console.log(JSON.stringify(r, null, 1));
const ok = r.tapChargedWhileHeld && r.tapChargingAfterRelease === 0 && r.tapMaxSpeedAfterRelease <= 12.6
  && r.holdChargingSteps >= 88 && r.holdEndSpeed > 20 && !r.afterReleaseCharging && r.speedRightAfterRelease <= 11.6 && !r.edgeOnlyCharges;
console.log(ok ? 'PASS  charge only while held' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
