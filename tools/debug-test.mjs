// Debug mode test, through the real game in the browser: F3 (and the backquote key) cycle off / compact / full, the readout's X / Y / Z are the
// player's, it follows him around and names the place, the crosshair's aim point is where a ray from the middle of the screen really lands,
// collider wireframes switch on and off, errors are logged and shown, the mode is remembered, and none of it gets in the way of touches.
//   node tools/debug-test.mjs         (needs the dev server on :5173, GV_HMR=0 recommended; GV_URL=file:///.../docs/index.html tests a built file;
//                                      GV_SHOTS=/some/dir also saves screenshots)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.GV_URL || 'http://127.0.0.1:5173/';
const shots = process.env.GV_SHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: ARGS });

/** The first gesture makes the game synthesise all its sounds, which keeps the page busy for seconds: do that first, or a tap could be delayed past the 350 ms the game allows for one. */
async function settleAudio(page) {
  await page.evaluate(() => { try { __app.unlockAudio(); } catch (e) { /* no audio */ } });
  await page.waitForFunction(() => !__app.audio || __app.audio.ready, null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(500);
}
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };

// (frames are simulated without drawing them: the software renderer needs about a second to draw one, and the page's main thread is then busy for that long, which holds up the
//  next touch event; a tap made right after a drawn frame would look like a long press. Screenshots call __draw() first.)
async function open(url, vp, opts = {}) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto(base + url);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await settleAudio(page);
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;             // (the test draws the frames: see tools/touch-menu-test.mjs)
    window.__frame = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { __app.gfx.clearHud(); __app.update(dt); } }; window.__draw = () => { const g = __app.gfx; g.render(__app.scene, __app.camera, __app.overlay); g.renderer.getContext().finish(); };
    // put Spyro somewhere, the camera behind him, and let everything settle
    window.__put = (x, z, yaw = 0, y) => { const g = __game; g.player.place(x, (y ?? g.grid.heightAt(x, z)) + 0.05, z, yaw); g.cam.snapBehind(g.player); __frame(24); };
  });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const shot = async (page, name) => { if (shots) { await page.evaluate(() => { __frame(2); __draw(); }); await page.screenshot({ path: path.join(shots, name + '.png') }); } };
const rows = (page) => page.evaluate(() => { const d = document.getElementById('gv-debug'); return { shown: getComputedStyle(d).display !== 'none', text: __debug.text(), dom: d.innerText, rect: d.firstChild.getBoundingClientRect().toJSON() }; });
const row = (text, tag) => { const l = text.split('\n').find((s) => s.startsWith(tag.padEnd(6))); return l ? l.slice(6) : ''; };

const only = process.env.GV_ONLY || '';
// ---- desktop ---------------------------------------------------------------------------------------------------------------------------
if (!only || only === 'desktop') {
  const { ctx, page } = await open('?skip=1&preserve=1', { width: 1100, height: 700 });
  await page.focus('canvas').catch(() => {});
  const lvl = () => page.evaluate(() => __app.gfx.settings.debug);
  check('debug mode is off by default (nothing on screen)', (await lvl()) === 0 && !(await rows(page)).shown);
  check('the build id is known to the readout', await page.evaluate(() => typeof __debug.data() === 'object' || __debug.refresh().build.length > 0));

  await page.keyboard.press('F3'); await page.evaluate(() => __frame(3));
  let r = await rows(page);
  check('F3 turns the compact readout on', (await lvl()) === 1 && r.shown && /^POS/m.test(r.text), `(${r.text.split('\n').length} rows)`);
  const compactRows = r.text.split('\n').length;
  await page.keyboard.press('F3'); await page.evaluate(() => __frame(3));
  r = await rows(page);
  check('F3 again: full (camera, input, performance, view rows)', (await lvl()) === 2 && ['CAM', 'INPUT', 'PERF', 'VIEW'].every((t) => row(r.text, t)) && r.text.split('\n').length > compactRows);
  await shot(page, 'desktop-full');
  await page.keyboard.press('F3'); await page.evaluate(() => __frame(3));
  check('F3 again: off', (await lvl()) === 0 && !(await rows(page)).shown);
  await page.keyboard.press('Backquote'); await page.evaluate(() => __frame(3));
  check('the backquote key does the same', (await lvl()) === 1);

  // X / Y / Z are the player's, in the text and on the page
  await page.evaluate(() => __put(-17, 131, 0.3));
  r = await rows(page);
  let p = await page.evaluate(() => ({ x: __game.player.x, y: __game.player.y, z: __game.player.z }));
  const want = `X ${p.x.toFixed(2)}  Y ${p.y.toFixed(2)}  Z ${p.z.toFixed(2)}`;
  check('POS is the player position (text)', row(r.text, 'POS') === want, `(${row(r.text, 'POS')})`);
  check('... and it is on the page (what a screenshot shows)', r.dom.includes(want.replace(/ {2}/g, ' ')) || r.dom.replace(/\s+/g, ' ').includes(want.replace(/\s+/g, ' ')), `(${r.dom.split('\n').find((s) => s.includes('POS')) || ''})`);
  check('AREA names where he is', row(r.text, 'AREA').startsWith('HEARTH VILLAGE'), `(${row(r.text, 'AREA')})`);
  await page.evaluate(() => __put(112, 40, 1));
  r = await rows(page);
  p = await page.evaluate(() => ({ x: __game.player.x, y: __game.player.y, z: __game.player.z }));
  check('it follows him: new position, new area', row(r.text, 'POS') === `X ${p.x.toFixed(2)}  Y ${p.y.toFixed(2)}  Z ${p.z.toFixed(2)}` && /WINDMILL HILL/.test(row(r.text, 'AREA')), `(${row(r.text, 'POS')}; ${row(r.text, 'AREA')})`);
  check('FLOOR names the ground texture and the rule for it', /^\w+ \(.+\)  slope \d+  y -?\d/.test(row(r.text, 'FLOOR')), `(${row(r.text, 'FLOOR')})`);

  // the aim point is where a ray through the middle of the screen lands: check it against the game's own ground height (looking over open
  // ground) and the camera's own direction
  const look = async (x, z, yaw) => page.evaluate(([x, z, yaw]) => {
    __put(x, z, yaw);
    const d = __debug.refresh(), a = d.aim, g = __game.grid;
    const cam = __game.camera, dir = cam.getWorldDirection(cam.position.clone());
    return { a: { kind: a.kind, x: a.x, y: a.y, z: a.z, t: a.t }, ground: g.heightAt(a.x, a.z), cam: [cam.position.x, cam.position.y, cam.position.z], dir: [dir.x, dir.y, dir.z] };
  }, [x, z, yaw]);
  let aim = null;
  for (const [x, z] of [[30, 86], [56, 74], [-58, 74], [60, 0]]) for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { if (aim && aim.a.kind === 'terrain') break; aim = await look(x, z, yaw); }
  const along = Math.hypot(aim.a.x - aim.cam[0], aim.a.y - aim.cam[1], aim.a.z - aim.cam[2]);
  const onRay = Math.hypot(aim.cam[0] + aim.dir[0] * along - aim.a.x, aim.cam[1] + aim.dir[1] * along - aim.a.y, aim.cam[2] + aim.dir[2] * along - aim.a.z);
  check('AIM lies on the camera\'s centre ray', onRay < 0.05 && Math.abs(along - aim.a.t) < 0.05, `(off the ray by ${onRay.toFixed(3)} m, ${aim.a.kind})`);
  check('... and when it lands on the ground it is at the ground height', aim.a.kind === 'terrain' && Math.abs(aim.a.y - aim.ground) < 0.05, `(${aim.a.kind}: y ${aim.a.y.toFixed(2)}, ground ${aim.ground.toFixed(2)})`);

  // the crosshair sits in the middle of the frame
  const cross = await page.evaluate(() => { const c = document.getElementById('gv-debug').nextElementSibling.getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2, w: innerWidth, h: innerHeight }; });
  check('the crosshair is in the middle of the screen', Math.abs(cross.x - cross.w / 2) < 1.5 && Math.abs(cross.y - cross.h / 2) < 1.5, `(${cross.x.toFixed(1)}, ${cross.y.toFixed(1)} of ${cross.w}x${cross.h})`);

  // collider wireframes
  await page.evaluate(() => { __put(-17, 131, 0.3); });
  const wires = async () => page.evaluate(() => { __frame(8); return __debug.hud.wires.n; });
  const off = await wires();
  await page.evaluate(() => __app.gfx.set('debugColliders', true));
  const on = await wires();
  check('collider wireframes: a few segments (the aim marker) when off, hundreds when on', off <= 12 && on > 200, `(${off} > ${on} segments)`);
  await shot(page, 'desktop-colliders');
  await page.evaluate(() => __app.gfx.set('debugColliders', false));

  // errors are logged and shown
  await page.evaluate(() => { console.error('debug-test boom'); __frame(8); });
  r = await rows(page);
  check('compact mode says errors were logged', /1 error/.test(row(r.text, 'ERR')), `(${row(r.text, 'ERR')})`);
  await page.evaluate(() => { __app.gfx.set('debug', 2); __frame(8); });
  r = await rows(page);
  check('full mode shows the message', /boom/.test(row(r.text, 'ERR')), `(${row(r.text, 'ERR')})`);

  // it does not get in the way of touches / clicks
  const pe = await page.evaluate(() => { const d = document.getElementById('gv-debug'); const b = d.firstChild.getBoundingClientRect(); const el = document.elementFromPoint(b.left + 20, b.top + 20); return { root: getComputedStyle(d).pointerEvents, cross: getComputedStyle(d.nextElementSibling).pointerEvents, under: el && el.tagName }; });
  check('the readout and the crosshair let touches and clicks through', pe.root === 'none' && pe.cross === 'none' && pe.under === 'CANVAS', `(${JSON.stringify(pe)})`);

  // remembered
  await page.evaluate(() => { __app.gfx.set('debug', 2); });
  await page.reload();
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await settleAudio(page);
  check('the mode is remembered after a reload', (await page.evaluate(() => __app.gfx.settings.debug)) === 2);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await ctx.close();
}

// ---- the build id -------------------------------------------------------------------------------------------------------------------------------
if (process.env.GV_URL) {
  const { ctx, page } = await open('?skip=1&preserve=1', { width: 900, height: 600 });
  const id = await page.evaluate(() => __debug.refresh().build);
  const want = execFileSync('node', [path.join(here, 'build-id.mjs')]).toString().trim().split(' ')[0];
  check('a built file reports the hash of the source it was built from', id.startsWith(want), `(${id} vs source ${want})`);
  await ctx.close();
}

// ---- phone -----------------------------------------------------------------------------------------------------------------------------------------
if (!only || only === 'phone') {
  const { ctx, page } = await open('?skip=1&preserve=1', { width: 844, height: 390 }, { hasTouch: true, isMobile: true });
  await page.evaluate(() => { __app.gfx.set('debug', 1); __put(-17, 131, 0.3); });
  const r = await rows(page);
  const f = await page.evaluate(() => __app.gfx.frameCss());
  check('phone: the compact readout is on and narrow enough to leave the middle of the screen (the crosshair) clear', r.shown && r.rect.right < 844 / 2 - 8, `(panel ${Math.round(r.rect.left)}..${Math.round(r.rect.right)} of 844)`);
  check('phone: it sits below the gem and Sparx panels', r.rect.top >= f.top + 36 * f.unit, `(top ${Math.round(r.rect.top)} px, panels end at ${Math.round(f.top + 38 * f.unit)})`);
  check('phone: it fits on the screen', r.rect.bottom <= 390 && r.rect.left >= 0, `(bottom ${Math.round(r.rect.bottom)} of 390)`);
  const sizes = [];
  for (const s of [0, 1, 2]) { await page.evaluate((s) => { __app.gfx.set('debugSize', s); __frame(8); }, s); sizes.push(await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('gv-debug')).fontSize))); }
  check('TEXT SIZE small < normal < large', sizes[0] < sizes[1] && sizes[1] < sizes[2], `(${sizes.map((v) => v.toFixed(1)).join(' < ')} px)`);
  await page.evaluate(() => { __app.gfx.set('debugSize', 1); __app.gfx.set('debug', 2); __frame(8); });
  const full = await rows(page);
  check('phone: the full readout reports the view and touch (what a phone bug report needs)', /touch/.test(row(full.text, 'VIEW')) && /844x390/.test(row(full.text, 'VIEW')), `(${row(full.text, 'VIEW')})`);
  await shot(page, 'phone-full');

  // tap to pin: a touch tap on the screen aims the readout at that spot instead of the middle of the screen
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts, at) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id = 0]) => ({ x, y, id })), ...(at ? { timestamp: at } : {}) });
  const tap = async (x, y) => { const t = Date.now() / 1000; await touch('touchStart', [[x, y]], t); await touch('touchEnd', [], t + 0.05); await page.evaluate(() => __frame(3)); };       // (a 50 ms tap by the events' own clock, whatever the browser's delivery lag)
  await page.evaluate(() => { __app.gfx.set('debug', 1); __put(30, 86, Math.PI / 2); });
  const spot = [640, 250];
  const aimAt = () => page.evaluate(() => {
    const d = __debug.refresh(), a = d.aim, f = __app.gfx.frameCss(), cam = __game.camera;
    const v = new cam.position.constructor(a.x, a.y, a.z).project(cam);        // (the aim point, projected back onto the screen)
    const el = document.getElementById('gv-debug');
    return { pinned: a.pinned, kind: a.kind, sx: f.left + ((v.x + 1) / 2) * f.width, sy: f.top + ((1 - v.y) / 2) * f.height, row: __debug.text().split('\n').find((l) => l.startsWith('PIN') || l.startsWith('AIM')), pinShown: getComputedStyle(el.nextElementSibling.nextElementSibling).display, crossShown: getComputedStyle(el.nextElementSibling).display };
  });
  let a = await aimAt();
  check('no tap yet: the aim is the middle of the screen', !a.pinned && /^AIM/.test(a.row) && a.pinShown === 'none' && a.crossShown === 'block', `(${a.row})`);
  await tap(...spot);
  a = await aimAt();
  check('a tap pins the aim: the point the readout gives is right under the finger', a.pinned && a.kind !== 'none' && Math.abs(a.sx - spot[0]) < 2 && Math.abs(a.sy - spot[1]) < 2, `(aim at ${a.sx.toFixed(1)}, ${a.sy.toFixed(1)} for a tap at ${spot})`);
  check('... the row says PIN and the pin marker replaces the crosshair', /^PIN/.test(a.row) && a.pinShown === 'block' && a.crossShown === 'none', `(${a.row})`);
  await shot(page, 'phone-pin');
  await tap(...spot);
  a = await aimAt();
  check('a tap on the pin lets it go (back to the middle of the screen)', !a.pinned && /^AIM/.test(a.row) && a.pinShown === 'none');
  await tap(...spot); await tap(spot[0] + 200, spot[1] + 40);
  a = await aimAt();
  check('a tap elsewhere moves the pin', a.pinned && Math.abs(a.sx - (spot[0] + 200)) < 2 && Math.abs(a.sy - (spot[1] + 40)) < 2);
  await page.evaluate(() => { __app.gfx.set('debug', 0); __frame(3); __app.gfx.set('debug', 1); __frame(3); });
  a = await aimAt();
  check('turning debug mode off drops the pin', !a.pinned);
  // a tap that picks a menu row (or closes the menu) is not a pin
  await page.evaluate(() => { __app.openPause(); __frame(3); });
  await tap(20, 200);                                                            // outside the panel: closes the menu
  a = await aimAt();
  const after = await page.evaluate(() => ({ state: __app.state, menu: __app.menu.active, pin: __debug.hud.pin }));
  check('a tap that closes the pause menu is not a pin', !a.pinned && after.state === 'play', `(${JSON.stringify(a)} ${JSON.stringify(after)})`);
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall debug mode checks passed');
process.exit(failed ? 1 : 0);
