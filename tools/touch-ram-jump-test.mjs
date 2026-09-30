// Ram + jump on a touch screen, through real touch events (CDP) on an emulated phone: a finger holds RAM, another taps JUMP. As in the original the jump happens with the
// ram kept: the charge carries on through the air and on landing while RAM stays down, and lifting that finger ends it.
//   node tools/touch-ram-jump-test.mjs        (needs the dev server on :5173, GV_HMR=0 recommended; GV_URL=file:///.../docs/index.html tests a built file)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.env.GV_URL || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };

const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
await page.goto(base + '?skip=1&preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.evaluate(() => { try { __app.unlockAudio(); } catch (e) { /* no audio */ } });
await page.waitForFunction(() => !__app.audio || __app.audio.ready, null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(500);
// (frames are simulated without drawing them, as in the other touch tests: the software renderer would hold up the next touch event)
await page.evaluate(() => {
  window.requestAnimationFrame = () => 0;
  window.__frame = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { __app.gfx.clearHud(); __app.update(dt); } };
});
await page.waitForTimeout(1500);
const cdp = await ctx.newCDPSession(page);
let clock = Date.now() / 1000;
const touch = (type, pts) => { clock += 0.02; return cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })), timestamp: clock }); };
const frames = (n) => { clock += n / 60; return page.evaluate((k) => __frame(k), n); };

// where the on-screen buttons are
const btn = await page.evaluate(() => {
  const out = {};
  for (const el of __game.input._pads.children) {
    const r = el.getBoundingClientRect(), label = el.textContent.trim();
    if (label) out[label] = [r.left + r.width / 2, r.top + r.height / 2];
  }
  return out;
});
check('the RAM and JUMP buttons are on screen', !!btn.RAM && !!btn.JUMP, JSON.stringify(btn));

// open ground with nothing on it for 40 m: the main road north of the village (its centre is kept clear of props), run along the chord from one end to the other
const state = () => page.evaluate(() => {
  const p = __game.player, i = __game.input;
  return { ramming: p.chargeT > 0, grounded: p.grounded, vy: +p.vy.toFixed(1), speed: +p.speed.toFixed(1), z: +p.z.toFixed(1), held: Object.keys(i.held).filter((k) => i.held[k]).join(',') };
});
await page.evaluate(() => {
  const p = __game.player, [a, b] = [[0, 118], [-3, 78]];
  p.place(a[0], __game.grid.heightAt(a[0], a[1]) + 0.05, a[1], Math.atan2(b[0] - a[0], b[1] - a[1]));
  __game.cam.snapBehind(p); __frame(40);
});

await touch('touchStart', [[...btn.RAM, 0]]);                                   // finger 1 goes down on RAM and stays there
await frames(30);
const ram = await state();
check('RAM held: he is ramming at full speed', ram.ramming && ram.speed > 22 && ram.grounded, JSON.stringify(ram));

await touch('touchStart', [[...btn.RAM, 0], [...btn.JUMP, 1]]);                 // finger 2 taps JUMP
await frames(3);
const up = await state();
check('... and with a second finger tapping JUMP he leaves the ground, still ramming', !up.grounded && up.vy > 5 && up.ramming && up.held.includes('charge'), JSON.stringify(up));
await touch('touchEnd', [[...btn.JUMP, 1]]);                                    // finger 2 lifts (a touchEnd lists the points that are released), finger 1 stays on RAM
await frames(20);
const mid = await state();
check('... the ram keeps its speed through the air (the jump is long)', !mid.grounded && mid.ramming && mid.speed > 22, JSON.stringify(mid));
await frames(40);
const down = await state();
check('... and on landing he is still ramming while the finger stays on RAM', down.grounded && down.ramming && down.speed > 22 && down.held === 'charge', JSON.stringify(down));
await touch('touchEnd', [[...btn.RAM, 0]]);
await frames(4);
const end = await state();
check('lifting the RAM finger ends the ram', !end.ramming && end.held === '', JSON.stringify(end));

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall touch ram + jump checks passed');
process.exit(failed ? 1 : 0);
