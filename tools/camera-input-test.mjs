// Camera input test, through the REAL game loop in the browser: R, the gamepad's Y and the touch CAM button must swing the camera behind
// Spyro whatever the frame rate (they didn't: the camera looked for the press after the step loop had already cleared it, so R only
// worked on rare frames), C cycles the camera mode, and the default mode is Active.
//   node tools/camera-input-test.mjs      (needs the dev server on :5173, GV_HMR=0 recommended; GV_URL=file:///.../docs/index.html tests a built file)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.GV_URL || 'http://127.0.0.1:5173/';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: ARGS });
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };

async function open(ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 480 }, ...ctxOpts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto(base + '?skip=1&preserve=1');
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  await page.addScriptTag({ path: path.join(here, 'bot-inject.js') });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    __bot.install(); __bot.god();
    window.requestAnimationFrame = () => 0;                          // no more drawing: the software renderer needs ~0.4 s a frame, which delays real key / touch events (a
                                                                     // 150 ms tap reached the page as 440 ms); the test steps the game itself, exactly as the loop would
    window.__angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
    // a frame at rate `hz`: exactly what the real loop does per rendered frame
    window.__frames = (n, hz) => { for (let i = 0; i < n; i++) __game.update(1 / hz); };
    // put Spyro somewhere open, camera behind him, then turn the camera away with the "mouse"
    window.__setup = (hz) => {
      __bot.place(-6, 116, 0.6);
      __game.cam.snapBehind(__game.player);
      __frames(30, hz);
      __game.input.look.x = 1.4;                                      // (a mouse drag: the camera yaw changes by -1.4 x speed)
      __frames(4, hz);
      return window.__angDiff(__game.cam.yaw, __game.player.yaw);
    };
    window.__behind = () => Math.abs(window.__angDiff(__game.cam.yaw, __game.player.yaw));
  });
  await page.waitForTimeout(1500);                                     // (let the frame that was already in flight finish)
  return { ctx, page };
}

// ---- keyboard / mouse / gamepad --------------------------------------------------------------------------------------------------
{
  const { ctx, page } = await open();
  await page.focus('canvas').catch(() => {});
  check('the default camera is Active', (await page.evaluate(() => __game.gfx.settings.camMode)) === 'active');

  for (const hz of [30, 60, 90, 144, 240]) {
    const off = await page.evaluate((hz) => __setup(hz), hz);
    await page.keyboard.press('KeyR');                                // a real key press (down + up) through the page's own handlers
    const after = await page.evaluate((hz) => { __frames(10, hz); return __behind(); }, hz);
    check(`R swings the camera behind Spyro at ${hz} frames per second`, Math.abs(off) > 0.8 && after < 0.05, `(was ${off.toFixed(2)} rad off, now ${after.toFixed(3)})`);
  }
  {
    const off = await page.evaluate(() => __setup(60));
    await page.evaluate(() => { __game.input._press('camReset'); });   // the gamepad's Y button: held for a while
    const after = await page.evaluate(() => { __frames(10, 60); return __behind(); });
    await page.evaluate(() => { __game.input._release('camReset'); });
    check('the gamepad button (Y) swings it behind Spyro', Math.abs(off) > 0.8 && after < 0.05, `(now ${after.toFixed(3)})`);
  }
  {
    // a press must act once, not hold the camera behind him: turn it away again and it stays away
    await page.evaluate(() => __setup(60));
    await page.keyboard.press('KeyR'); await page.evaluate(() => __frames(6, 60));
    await page.evaluate(() => { __game.input.look.x = 1.0; __frames(6, 60); });
    check('one press acts once (the camera can be turned away again)', await page.evaluate(() => __behind() > 0.6));
  }
  {
    await page.evaluate(() => { __game.gfx.set('camMode', 'active'); __frames(2, 60); });
    const seq = [];
    for (let i = 0; i < 4; i++) { await page.keyboard.press('KeyC'); await page.evaluate(() => __frames(4, 60)); seq.push(await page.evaluate(() => __game.gfx.settings.camMode)); }
    check('C cycles the mode: active > smart > passive > active', seq.join() === 'smart,passive,active,smart', seq.join(' > '));
    check('the mode is saved with the options', (await page.evaluate(() => JSON.parse(localStorage.getItem('gloaming-vale/settings/v2')).camMode)) === 'smart');
  }
  await ctx.close();
}

// ---- touch: the CAM button ---------------------------------------------------------------------------------------------------------
{
  const { ctx, page } = await open({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id = 0]) => ({ x, y, id })) });
  const btn = await page.evaluate(() => { const b = __game.input.camBtn.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
  check('the CAM button exists on a touch screen', !!btn && btn[0] > 0);
  await page.evaluate(() => { __game.gfx.set('camMode', 'active'); });

  const off = await page.evaluate(() => __setup(60));
  await touch('touchStart', [[btn[0], btn[1], 3]]); await page.waitForTimeout(150); await touch('touchEnd', []);
  const after = await page.evaluate(() => { __frames(10, 60); return __behind(); });
  check('tapping CAM swings the camera behind Spyro', Math.abs(off) > 0.8 && after < 0.05, `(was ${off.toFixed(2)} rad off, now ${after.toFixed(3)})`);
  check('... and a tap does not change the mode', (await page.evaluate(() => __game.gfx.settings.camMode)) === 'active');

  await touch('touchStart', [[btn[0], btn[1], 4]]); await page.waitForTimeout(900); await touch('touchEnd', []);
  await page.evaluate(() => __frames(6, 60));
  check('holding CAM cycles the camera mode', (await page.evaluate(() => __game.gfx.settings.camMode)) === 'smart');
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall camera input checks passed');
process.exit(failed ? 1 : 0);
