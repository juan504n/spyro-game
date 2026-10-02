// Menu test. On an emulated phone, through real touch events (CDP): the MENU button is there and labelled on the title and in play, it opens
// and closes the menu, the menu rows are finger-sized and tappable (choices, toggles, sub-pages, PLAY), the panel stays clear of the button,
// the thumb controls (JUMP / FIRE / RAM / CAM) hide while a menu is open and come back, nothing stays held, the cutscenes show no buttons,
// the button stays at the top of the picture whatever safe-area inset the platform reports (an app that shows the page under its header says
// 74 px; emulated through CDP), and a browser that hides its touch support still gets the button with its first touch. On a desktop window:
// Esc and the keyboard reach every page, and a mouse click on a row does not capture the mouse.
//   node tools/menu-test.mjs             (needs the dev server on :5173, GV_HMR=0 recommended; GV_URL=file:///.../docs/index.html tests a built file;
//                                         GV_SHOTS=/some/dir also saves screenshots)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import fs from 'node:fs';

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
const only = process.env.GV_ONLY || '';           // GV_ONLY=title|play|portrait|safe|desktop|late runs just that part
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };

// (frames are simulated without drawing them: the software renderer needs about a second to draw one, and the page's main thread is then busy for that long, which holds up the
//  next touch event; a tap made right after a drawn frame would look like a long press. Screenshots call __draw() first.)
async function open(url, vp, insets = null) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  const cdp = await ctx.newCDPSession(page);
  // the platform's safe area (a notch, an app's header drawn over the page): what env(safe-area-inset-*) says in the page; it can change while the page is open
  const setInsets = (i) => cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 0, left: 0, right: 0, ...i } });
  if (insets) await setInsets(insets);
  await page.goto(base + url);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await settleAudio(page);
  // stop the real-time loop (the software renderer needs ~0.4 s a frame, which stretches a 50 ms tap past the 350 ms the game allows for one):
  // the test draws frames itself, exactly as the loop would
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    window.__frame = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { __app.gfx.clearHud(); __app.update(dt); } }; window.__draw = () => { const g = __app.gfx; g.render(__app.scene, __app.camera, __app.overlay); g.renderer.getContext().finish(); };
  });
  await page.waitForTimeout(1500);                                     // (let the frame that was already in flight finish)
  const touch = (type, pts, at) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id = 0]) => ({ x, y, id })), ...(at ? { timestamp: at } : {}) });
  const tap = async (x, y) => { const t = Date.now() / 1000; await touch('touchStart', [[x, y]], t); await touch('touchEnd', [], t + 0.05); await page.evaluate(() => __frame(3)); };       // (a 50 ms tap by the events' own clock, whatever the browser's delivery lag)
  return { ctx, page, touch, tap, setInsets };
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;
const clearOfButton = (R, u) => R.panel.top >= u.rect.bottom - 1 || R.panel.bottom <= u.rect.top + 1;             // (CSS px: the menu panel and the MENU button do not overlap: the panel starts below the button when it sits on the picture's top edge, and ends above it when it sits under the picture)
/** the frame (gfx.frameCss()), the MENU button's rectangle and the window, in CSS px */
const geom = (page) => page.evaluate(() => {
  const f = __app.gfx.frameCss(), r = __game.input.menuBtn.getBoundingClientRect();
  return { f, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, x: r.left + r.width / 2, y: r.top + r.height / 2 }, vw: innerWidth, vh: innerHeight };
});
/** the thumb controls shown now: name and rectangle (CSS px) */
const padRects = (page) => page.evaluate(() => [...__game.input._pads.children].filter((e) => e.style.display !== 'none').map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
/** is there any visible text saying "turn your phone sideways"? */
const sidewaysText = (page) => page.evaluate(() => [...document.body.querySelectorAll('*')].some((e) => e.tagName !== 'SCRIPT' && /SIDEWAYS/i.test(e.childNodes.length && [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(''))));
const shot = async (page, name) => { if (shots) { await page.evaluate(() => { __frame(2); __draw(); }); await page.screenshot({ path: path.join(shots, name + '.png') }); } };

/** the CSS-pixel rectangle of MENU row `i` on the open page, and the panel's, from the game's own layout */
const rows = (page) => page.evaluate(() => {
  const app = __app, m = app.menu, pix = app.gfx.hud, f = app.gfx.frameCss();
  const page = m.stack[m.stack.length - 1];
  if (!page) return { title: '(no menu)', labels: [], depth: 0, rowPx: 0, row: [], panel: { top: 0, bottom: 0, left: 0, right: 0 } };
  const items = page.items.filter((it) => !it.hidden || !it.hidden());
  const L = m.layout(pix.w, pix.h, page, items);
  const px = (u) => u * f.unit;
  return {
    title: page.title, labels: items.map((it) => it.label), depth: m.stack.length,
    rowPx: px(L.rowH), unit: f.unit,
    row: items.map((it, i) => ({ x: f.left + px(L.x + L.w * 0.5), xr: f.left + px(L.x + L.w * 0.85), xl: f.left + px(L.x + L.w * 0.3), y: f.top + px(L.rows0 - 2 + i * L.rowH + L.rowH / 2), h: px(L.rowH), w: px(L.w) })),
    panel: { top: f.top + px(L.y), bottom: f.top + px(L.y + L.h), left: f.left + px(L.x), right: f.left + px(L.x + L.w) },
  };
});
const ui = (page) => page.evaluate(() => {
  const i = __game.input, b = i.menuBtn, r = b.getBoundingClientRect();
  return { state: __app.state, menuShown: b.style.display !== 'none', label: i._menuLabel.textContent, padsShown: i._pads.style.display !== 'none', held: Object.keys(i.held).filter((k) => i.held[k]),
    rect: { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom }, vw: innerWidth, vh: innerHeight, depth: __app.menu.stack.length };
});

// ---- the title screen on a landscape phone -----------------------------------------------------------------------------------------------
if (!only || only === 'title') {
  const { ctx, page, tap } = await open('?preserve=1', { width: 844, height: 390 });
  let u = await ui(page);
  check('title: a MENU button is on screen', u.menuShown && u.label === 'MENU' && u.rect.left >= 0 && u.rect.right <= u.vw && u.rect.top >= 0, `(${Math.round(u.rect.w)}x${Math.round(u.rect.h)} px at ${Math.round(u.rect.x)},${Math.round(u.rect.y)})`);
  check('title: it is finger-sized (44 px tall or more)', u.rect.h >= 44 && u.rect.w >= 80);
  check('title: the thumb controls are not shown', !u.padsShown);
  await shot(page, 'title');

  await tap(u.rect.x, u.rect.y);
  u = await ui(page);
  check('tapping MENU on the title opens the menu (it does not start the game)', u.state === 'title-options' && u.depth === 1, `(state ${u.state})`);
  check('... and the button now reads BACK', u.menuShown && u.label === 'BACK');
  let R = await rows(page);
  check('title menu rows are finger-sized', R.rowPx >= 34, `(${R.labels.join(' / ')}: ${R.rowPx.toFixed(1)} px per row)`);
  check('title menu panel fits the screen, below the button', R.panel.top >= 0 && R.panel.bottom <= u.vh && R.panel.left >= 0 && R.panel.right <= u.vw && clearOfButton(R, u), `(${Math.round(R.panel.top)}..${Math.round(R.panel.bottom)} of ${u.vh}; button ends at ${Math.round(u.rect.bottom)})`);
  await shot(page, 'title-menu');

  // DEBUG MODE row: a tap on its right half steps the choice forward: off > compact > full
  const dbg = R.labels.indexOf('DEBUG MODE');
  await tap(R.row[dbg].xr, R.row[dbg].y);
  check('tapping the DEBUG MODE row turns debug mode on (compact)', (await page.evaluate(() => __app.gfx.settings.debug)) === 1);
  await tap(R.row[dbg].xr, R.row[dbg].y);
  check('... and again for full', (await page.evaluate(() => __app.gfx.settings.debug)) === 2);
  await tap(R.row[dbg].xr, R.row[dbg].y);
  check('... and again for off', (await page.evaluate(() => __app.gfx.settings.debug)) === 0);

  // OPTIONS > GRAPHICS > (a choice) and back out with the BACK button
  await tap(R.row[R.labels.indexOf('OPTIONS')].x, R.row[R.labels.indexOf('OPTIONS')].y);
  R = await rows(page);
  check('OPTIONS opens a short page of sub-pages', R.title === 'OPTIONS' && R.labels.length <= 7 && R.rowPx >= 34, `(${R.labels.join(' / ')})`);
  await shot(page, 'options');
  // the DEBUG page: three rows and a few lines of explanation, all inside the panel, below the button
  await tap(R.row[R.labels.indexOf('DEBUG')].x, R.row[R.labels.indexOf('DEBUG')].y);
  R = await rows(page);
  check('the DEBUG page: mode, colliders and text size rows, finger-sized, inside the screen and below the button', R.title === 'DEBUG' && R.labels.join() === 'DEBUG MODE,SHOW COLLIDERS,TEXT SIZE' && R.rowPx >= 34 && R.panel.bottom <= u.vh && clearOfButton(R, u), `(${R.labels.join(' / ')}: ${R.rowPx.toFixed(1)} px, panel ${Math.round(R.panel.top)}..${Math.round(R.panel.bottom)})`);
  await shot(page, 'debug-page');
  const sc = R.labels.indexOf('SHOW COLLIDERS');
  await tap(R.row[sc].x, R.row[sc].y);
  check('tapping SHOW COLLIDERS toggles it', (await page.evaluate(() => __app.gfx.settings.debugColliders)) === true);
  await tap(R.row[sc].x, R.row[sc].y);
  check('... and again turns it off', (await page.evaluate(() => __app.gfx.settings.debugColliders)) === false);
  u = await ui(page);
  await tap(u.rect.x, u.rect.y);                                       // BACK to OPTIONS
  R = await rows(page);
  await tap(R.row[R.labels.indexOf('GRAPHICS')].x, R.row[R.labels.indexOf('GRAPHICS')].y);
  R = await rows(page);
  check('GRAPHICS is a page of at most 7 finger-sized rows, below the button', R.title === 'GRAPHICS' && R.labels.length <= 7 && R.rowPx >= 34 && R.panel.bottom <= u.vh && clearOfButton(R, u), `(${R.labels.join(' / ')}: ${R.rowPx.toFixed(1)} px, panel ${Math.round(R.panel.top)}..${Math.round(R.panel.bottom)})`);
  await shot(page, 'graphics');
  const before = await page.evaluate(() => __app.gfx.settings.color);
  const ci = R.labels.indexOf('COLORS');
  await tap(R.row[ci].xr, R.row[ci].y);
  const after = await page.evaluate(() => __app.gfx.settings.color);
  check('tapping a choice row changes it (COLORS)', after !== before, `(${before} > ${after})`);
  await page.evaluate(() => __app.gfx.set('color', 0.6));
  u = await ui(page);
  await tap(u.rect.x, u.rect.y);                                       // the BACK button
  R = await rows(page);
  check('the BACK button goes up one page', R.title === 'OPTIONS' && R.depth === 2, `(now ${R.title})`);
  await tap(u.rect.x, u.rect.y);
  R = await rows(page);
  check('... and again to the title menu', R.title === 'MENU' && R.depth === 1);
  u = await ui(page);
  await tap(u.rect.x, u.rect.y);
  u = await ui(page);
  check('... and once more closes the menu, back to the title', u.state === 'title' && u.label === 'MENU', `(state ${u.state})`);

  // PLAY from the menu starts the intro; the cutscene shows no buttons
  await tap(u.rect.x, u.rect.y);
  R = await rows(page);
  await tap(R.row[R.labels.indexOf('PLAY')].x, R.row[R.labels.indexOf('PLAY')].y);
  await page.evaluate(() => __frame(3));
  u = await ui(page);
  check('PLAY starts the intro', u.state === 'intro', `(state ${u.state})`);
  check('the intro shows no buttons', !u.menuShown && !u.padsShown);
  await ctx.close();
}

// ---- in play: MENU opens the pause menu, the thumb controls get out of its way ----------------------------------------------------------------
if (!only || only === 'play') {
  const { ctx, page, tap, touch } = await open('?skip=1&preserve=1', { width: 844, height: 390 });
  await page.evaluate(() => __frame(20));
  let u = await ui(page);
  check('play: the MENU button and the thumb controls are shown', u.state === 'play' && u.menuShown && u.label === 'MENU' && u.padsShown);
  // hold FIRE and JUMP with a finger each, then open the menu with a third: nothing may stay held once the controls hide
  const pads = await page.evaluate(() => [...__game.input._pads.children].map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2 }; }));
  const at = (t) => pads.find((p) => p.t === t);
  await touch('touchStart', [[at('FIRE').x, at('FIRE').y, 1], [at('JUMP').x, at('JUMP').y, 2]]);
  await page.evaluate(() => __frame(3));
  check('holding FIRE and JUMP registers', (await ui(page)).held.includes('flame') && (await ui(page)).held.includes('jump'));
  await touch('touchStart', [[at('FIRE').x, at('FIRE').y, 1], [at('JUMP').x, at('JUMP').y, 2], [u.rect.x, u.rect.y, 3]]);
  await page.evaluate(() => __frame(4));
  u = await ui(page);
  check('MENU in play opens the pause menu', u.state === 'paused' && u.depth === 1, `(state ${u.state})`);
  check('... the thumb controls are hidden, the button reads RESUME', !u.padsShown && u.menuShown && u.label === 'RESUME');
  check('... and nothing is left held down', u.held.length === 0, `(held: ${u.held.join(',') || 'none'})`);
  await touch('touchEnd', []);
  await page.evaluate(() => __frame(2));
  let R = await rows(page);
  check('pause menu rows are finger-sized and fit, below the button (its title is readable)', R.rowPx >= 34 && R.panel.top >= 0 && R.panel.bottom <= u.vh && clearOfButton(R, u), `(${R.labels.join(' / ')}: ${R.rowPx.toFixed(1)} px, panel ${Math.round(R.panel.top)}..${Math.round(R.panel.bottom)})`);
  await shot(page, 'pause');
  check('pause menu has the DEBUG MODE row', R.labels.includes('DEBUG MODE'));
  // CAMERA row: a tap on the right side steps it
  const cam0 = await page.evaluate(() => __app.gfx.settings.camMode);
  await tap(R.row[R.labels.indexOf('CAMERA')].xr, R.row[R.labels.indexOf('CAMERA')].y);
  check('tapping the CAMERA row changes the camera mode', (await page.evaluate(() => __app.gfx.settings.camMode)) !== cam0);
  await page.evaluate(() => __app.gfx.set('camMode', 'active'));
  check('pause menu has the TRAVEL row, and (on a phone) six finger-sized rows with CONTROLS moved into OPTIONS', R.labels.includes('TRAVEL') && !R.labels.includes('CONTROLS') && R.labels.length === 6, `(${R.labels.join(' / ')})`);
  // CONTROLS page names the MENU button: on a touch screen it is a row of OPTIONS
  await tap(R.row[R.labels.indexOf('OPTIONS')].x, R.row[R.labels.indexOf('OPTIONS')].y);
  R = await rows(page);
  check('OPTIONS (from the pause menu) has the CONTROLS row on a touch screen, still finger-sized', R.title === 'OPTIONS' && R.labels.includes('CONTROLS') && R.rowPx >= 34, `(${R.labels.join(' / ')}: ${R.rowPx.toFixed(1)} px)`);
  await tap(R.row[R.labels.indexOf('CONTROLS')].x, R.row[R.labels.indexOf('CONTROLS')].y);
  R = await rows(page);
  check('CONTROLS opens (touch controls listed, with the MENU button)', R.title === 'CONTROLS');
  await shot(page, 'controls');
  u = await ui(page);
  await tap(u.rect.x, u.rect.y);                                       // BACK
  R = await rows(page);
  check('BACK returns to OPTIONS', R.title === 'OPTIONS');
  u = await ui(page);
  await tap(u.rect.x, u.rect.y);                                       // BACK
  R = await rows(page);
  check('BACK returns to the pause menu', R.title === 'PAUSED');
  // RESUME with the button
  u = await ui(page);
  await tap(u.rect.x, u.rect.y);
  u = await ui(page);
  check('RESUME closes the pause menu and the controls come back', u.state === 'play' && u.padsShown && u.label === 'MENU', `(state ${u.state})`);

  // a quick tap on the game screen (nothing to do with a menu) must not linger and hit the menu that opens next: it used to close it at once
  await tap(40, 300);
  await tap(800, 120);
  u = await ui(page);
  await tap(u.rect.x, u.rect.y);
  await page.evaluate(() => __frame(6));
  u = await ui(page);
  check('taps made earlier in play do not close, or press a row of, the menu that opens next', u.state === 'paused' && u.depth === 1 && (await page.evaluate(() => __app.gfx.settings.camMode)) === 'active', `(state ${u.state}, ${u.depth} page open)`);
  await tap(u.rect.x, u.rect.y);
  u = await ui(page);
  check('... and RESUME still closes it', u.state === 'play', `(state ${u.state})`);

  // tapping outside the panel also closes a page
  await tap(u.rect.x, u.rect.y);
  R = await rows(page);
  await tap(R.panel.left - 20 > 5 ? R.panel.left - 20 : R.panel.right + 20, u.vh / 2);
  u = await ui(page);
  check('a tap outside the panel closes the pause menu', u.state === 'play', `(state ${u.state})`);
  await ctx.close();
}

// ---- portrait: the picture sits in the upper part of the screen, the MENU button under it -------------------------------------------------------
// A phone held upright keeps the 4:3 picture at the top of the window (centred, it floated in the middle of the screen), with the black below it for the thumbs and the MENU button right under the
// picture, where it covers none of the view. There is no "turn your phone sideways" text.
if (!only || only === 'portrait') {
  const { ctx, page, tap } = await open('?skip=1&preserve=1', { width: 390, height: 844 });
  await page.evaluate(() => __frame(20));
  let g = await geom(page), u = await ui(page);
  check('portrait: the picture sits at the top of the screen, wholly in its upper half', near(g.f.top, 8, 0.5) && g.f.top + g.f.height <= g.vh / 2 && near(g.f.left + g.f.width / 2, g.vw / 2, 0.5), `(the picture from y ${g.f.top.toFixed(1)} to ${(g.f.top + g.f.height).toFixed(1)} of ${g.vh})`);
  check('portrait: the MENU button is on screen, centred under the picture', u.menuShown && u.rect.left >= 0 && u.rect.right <= u.vw && u.rect.bottom <= u.vh && near(g.rect.top - (g.f.top + g.f.height), 24, 1.5) && near(g.rect.x, g.vw / 2, 1), `(at ${Math.round(u.rect.x)},${Math.round(u.rect.y)}; ${(g.rect.top - (g.f.top + g.f.height)).toFixed(1)} px below the picture)`);
  const pads = await padRects(page);
  check('... clear of the thumb controls (JUMP, FIRE, RAM, CAM)', pads.length >= 4 && !pads.some((p) => overlaps(g.rect, p)), `(${pads.map((p) => p.t).join(' ')})`);
  check('... and nothing says "turn your phone sideways"', !(await sidewaysText(page)));
  await tap(u.rect.x, u.rect.y);
  u = await ui(page);
  check('portrait: a tap on it opens the menu', u.state === 'paused');
  const R = await rows(page);
  check('portrait: the menu fits inside the picture, finger-sized, clear of the button', R.panel.left >= g.f.left && R.panel.right <= g.f.left + g.f.width && R.panel.top >= g.f.top && R.panel.bottom <= g.f.top + g.f.height && R.rowPx >= 34 && clearOfButton(R, u), `(rows ${R.rowPx.toFixed(1)} px, the panel from y ${Math.round(R.panel.top)} to ${Math.round(R.panel.bottom)})`);
  await shot(page, 'pause-portrait');
  await ctx.close();
  {
    // the title in portrait: the button under the picture, no thumb controls, and the title laid out as on any screen (nothing is kept clear for the button)
    const t = await open('?preserve=1', { width: 390, height: 844 });
    await t.page.evaluate(() => __frame(4));
    const gt = await geom(t.page), ut = await ui(t.page);
    check('portrait title: the MENU button is under the picture and the thumb controls are not shown', ut.menuShown && !ut.padsShown && gt.rect.top >= gt.f.top + gt.f.height + 20 && ut.rect.left >= 0 && ut.rect.right <= ut.vw && ut.rect.bottom <= ut.vh, `(at ${Math.round(ut.rect.x)},${Math.round(ut.rect.y)})`);
    check('... and the title\'s logo starts 8% down the picture, as on any screen', await t.page.evaluate(() => { const hud = __app.gfx.hud, w = hud.w; for (let y = 0; y < hud.h; y++) for (let x = 0; x < w; x++) if (hud.data[(y * w + x) * 4 + 3]) return y >= 8 && y <= Math.round(hud.h * 0.08) + 4; return false; }), '');
    await shot(t.page, 'title-portrait');
    await t.ctx.close();
  }
}

// ---- the platform's safe area: an app that shows the page under its own header ----------------------------------------------------------------
// Such an app reports the header's height as the safe-area inset at the top (env(safe-area-inset-top): the claude.ai app seems to say about 74 px; a notch says 47 to 59). Held upright, the picture sits
// just below it (the inset and 8 px), never lower than its centred place, with the MENU button under it. (The inset was once added on top of the button's place on the picture: it sat in the middle of
// the picture, over the title logo and the view ahead.) Where the picture reaches up into the inset (a landscape window) the button sits below it, and the title and the menus keep clear of it.
if (!only || only === 'safe') {
  /** how many pixels of the HUD (the title's logo and texts, the gem counter ...) lie under the button */
  const hudUnder = (page) => page.evaluate(() => {
    const app = __app, hud = app.gfx.hud, r = __game.input.menuBtn.getBoundingClientRect();
    const [x0, y0] = app.menu._toInternal(r.left, r.top), [x1, y1] = app.menu._toInternal(r.right, r.bottom);
    let n = 0;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(hud.h, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(hud.w, Math.ceil(x1)); x++) if (hud.data[(y * hud.w + x) * 4 + 3]) n++;
    return n;
  });

  // portrait, the title: the inset reaches the page, the picture sits just below it, the button under the picture
  for (const T of [0, 47, 74]) {
    const { ctx, page, tap } = await open('?preserve=1', { width: 430, height: 866 }, { top: T, bottom: 34 });
    await page.evaluate(() => __frame(4));
    const g = await geom(page), bottom = g.f.top + g.f.height, centred = (g.vh - g.f.height) / 2;
    check(`portrait 430x866, ${T} px inset: the page sees it`, near(g.f.safeTop, T, 0.5), `(safeTop ${g.f.safeTop.toFixed(1)})`);
    check('... the picture sits 8 px below it, in the upper half of the screen', near(g.f.top, Math.min(T + 8, centred), 0.5) && bottom <= g.vh / 2 + 0.5, `(the picture from y ${g.f.top.toFixed(1)} to ${bottom.toFixed(1)} of ${g.vh})`);
    check('... and the MENU button is centred under it, 24 px below its bottom edge', near(g.rect.top - bottom, 24, 1.5) && near(g.rect.x, g.vw / 2, 1), `(y ${g.rect.top.toFixed(1)} to ${g.rect.bottom.toFixed(1)})`);
    if (T > 0) check('(centred, as the picture used to be, it would have floated across the middle of the screen: the check sees the problem)', centred < g.vh / 2 && centred + g.f.height > g.vh / 2, `(${centred.toFixed(0)} to ${(centred + g.f.height).toFixed(0)} of ${g.vh})`);
    await tap(g.rect.x, g.rect.y);
    const u = await ui(page), R = await rows(page);
    check('... a tap on it opens the menu, which lies inside the picture and clear of the button', u.state === 'title-options' && R.panel.top >= g.f.top && R.panel.bottom <= bottom && clearOfButton(R, u), `(state ${u.state}; the panel from y ${Math.round(R.panel.top)} to ${Math.round(R.panel.bottom)})`);
    if (T === 74) await shot(page, 'title-portrait-inset');
    await ctx.close();
  }

  // portrait, in play: the same, the button clear of the thumb controls, and they keep clear of the home indicator (the bottom inset, which they do count)
  {
    const { ctx, page } = await open('?skip=1&preserve=1', { width: 430, height: 866 }, { top: 74, bottom: 34 });
    await page.evaluate(() => __frame(20));
    const g = await geom(page), pads = await padRects(page);
    const jump = pads.find((p) => p.t === 'JUMP');
    check('portrait in play, 74 px inset: the picture from y 82, the button under it', near(g.f.top, 82, 0.5) && near(g.rect.top - (g.f.top + g.f.height), 24, 1.5), `(the picture from y ${g.f.top.toFixed(1)}; the button from y ${g.rect.top.toFixed(1)})`);
    check('... the button clear of the thumb controls, and JUMP above the home indicator (34 px inset at the bottom)', pads.length >= 4 && !pads.some((p) => overlaps(g.rect, p)) && jump && jump.bottom <= g.vh - 34 + 0.5, `(JUMP's bottom edge at ${jump && jump.bottom.toFixed(0)} of ${g.vh})`);
    // a phone bug report needs the inset: the full debug readout names it in its VIEW row (and says nothing where the platform covers nothing)
    const view = (pg) => pg.evaluate(() => { __app.gfx.set('debug', 2); __frame(8); const l = __debug.text().split('\n').find((r) => r.startsWith('VIEW')); __app.gfx.set('debug', 0); return l || ''; });
    const v74 = await view(page);
    check('the full debug readout names the inset in its VIEW row', /safe top 74\.0/.test(v74), `(${v74})`);
    await shot(page, 'play-portrait-inset');
    await ctx.close();
  }

  // the real loop notices an inset that appears while the page is open (an app showing its header): the picture moves down below it, the button with it
  {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 866 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
    const cdp = await ctx.newCDPSession(page);
    const set = (top) => cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top, bottom: 34, left: 0, right: 0 } });
    await set(0);
    await page.goto(base + '?preserve=1');
    await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
    const top0 = await page.evaluate(() => __app.gfx.frameCss().top);
    await set(74);
    const moved = await page.waitForFunction(() => Math.abs(__app.gfx.frameCss().top - 82) < 1, null, { timeout: 60000, polling: 250 }).then(() => true, () => false);
    await page.waitForFunction(() => { const f = __app.gfx.frameCss(), r = __game.input.menuBtn.getBoundingClientRect(); return Math.abs(r.top - (f.top + f.height + 24)) < 1.5; }, null, { timeout: 60000, polling: 250 }).catch(() => {});
    const g = await geom(page);
    check('an inset that appears while the page is open: the picture moves from y 8 down to y 82, and the button follows it', near(top0, 8, 0.5) && moved && near(g.rect.top - (g.f.top + g.f.height), 24, 1.5), `(the picture from y ${top0.toFixed(1)} to ${g.f.top.toFixed(1)}; the button ${(g.rect.top - (g.f.top + g.f.height)).toFixed(1)} px below it)`);
    await ctx.close();
  }

  // landscape: the picture reaches the top of the window, so the inset counts; it can change while the page is open (an app showing or hiding its header, a rotation)
  {
    const { ctx, page, tap, setInsets } = await open('?preserve=1', { width: 844, height: 330 }, { top: 24 });        // (a phone's landscape viewport with the browser's own bars: 330 px tall, so the picture fills it)
    await page.evaluate(() => __frame(4));
    let g = await geom(page), under = await hudUnder(page);
    check('landscape 844x330, 24 px inset: the picture reaches the top of the window, the button sits 8 px below the inset', near(g.f.top, 0, 0.5) && near(g.rect.top, 32, 1), `(picture from y ${g.f.top.toFixed(1)}, button from y ${g.rect.top.toFixed(1)})`);
    check('... nothing of the title lies under it', under === 0, `(${under} HUD pixels)`);
    const place = async (T) => { await setInsets({ top: T }); await page.evaluate(() => __frame(3)); g = await geom(page); under = await hudUnder(page); };
    await place(0);
    check('the inset goes away while the page is open: the button moves back up to 8 px', near(g.rect.top, 8, 1) && under === 0, `(y ${g.rect.top.toFixed(1)}, ${under} HUD pixels under it)`);
    const v0 = await page.evaluate(() => { __app.gfx.set('debug', 2); __frame(8); const l = __debug.text().split('\n').find((r) => r.startsWith('VIEW')); __app.gfx.set('debug', 0); return l || ''; });
    check('... and the debug readout stops naming one', v0.length > 0 && !/safe top/.test(v0), `(${v0})`);
    await place(47);
    check('a 47 px inset appears: the button moves down to 55 px', near(g.rect.top, 55, 1) && under === 0, `(y ${g.rect.top.toFixed(1)}, ${under} HUD pixels under it)`);
    await tap(g.rect.x, g.rect.y);
    let u = await ui(page), R = await rows(page);
    check('... a tap on it opens the menu, whose panel starts below the button', u.state === 'title-options' && clearOfButton(R, u), `(state ${u.state}; the panel starts at y ${Math.round(R.panel.top)}, the button ends at ${Math.round(u.rect.bottom)})`);
    await tap(u.rect.x, u.rect.y);                                     // (BACK: the menu closes)
    await place(300);
    check('an absurd inset (300 px) counts for at most a quarter of the picture\'s height, so the HUD is not pushed out of the frame', near(g.f.safeTop, g.f.height / 4, 0.5) && near(g.rect.top, 8 + g.f.height / 4, 1) && under === 0, `(counted ${g.f.safeTop.toFixed(1)} px of ${g.f.height.toFixed(0)}; button from y ${g.rect.top.toFixed(1)})`);
    await tap(g.rect.x, g.rect.y);
    u = await ui(page); R = await rows(page);
    check('... and the menu opened then still starts below the button', u.state === 'title-options' && clearOfButton(R, u), `(state ${u.state}; the panel starts at y ${Math.round(R.panel.top)}, the button ends at ${Math.round(u.rect.bottom)})`);
    await ctx.close();
  }
}

// ---- desktop: the keyboard reaches every page, a mouse click does not capture the mouse --------------------------------------------------------
async function openDesktop(url) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto(base + url);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await settleAudio(page);
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    window.__frame = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { __app.gfx.clearHud(); __app.update(dt); } }; window.__draw = () => { const g = __app.gfx; g.render(__app.scene, __app.camera, __app.overlay); g.renderer.getContext().finish(); };
    __frame(10);
  });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
if (!only || only === 'desktop') {
  const { ctx, page } = await openDesktop('?skip=1&preserve=1');
  // (a key is held across a frame or two: a press-and-release inside one frame would never be seen by the game's polling of the arrow keys)
  const key = async (k) => { await page.keyboard.down(k); await page.evaluate(() => __frame(2)); await page.keyboard.up(k); await page.evaluate(() => __frame(2)); };
  const st = () => page.evaluate(() => ({ state: __app.state, depth: __app.menu.stack.length, title: (__app.menu.stack.at(-1) || {}).title, sel: (__app.menu.stack.at(-1) || {}).sel, touchUi: !!__game.input.touchRoot }));
  check('desktop: no touch buttons are created', !(await st()).touchUi);
  await key('Escape');
  let s0 = await st();
  check('desktop: Esc opens the pause menu', s0.state === 'paused' && s0.title === 'PAUSED');
  // DOWN x3 -> OPTIONS (RESUME, CAMERA, DEBUG MODE, OPTIONS), Enter
  for (let i = 0; i < 3; i++) await key('ArrowDown');
  await key('Enter');
  s0 = await st();
  check('desktop: the keyboard opens OPTIONS', s0.title === 'OPTIONS' && s0.depth === 2, `(${s0.title})`);
  for (let i = 0; i < 2; i++) await key('ArrowDown');
  await key('Enter');
  s0 = await st();
  check('desktop: ... and its CAMERA & AIM page', s0.title === 'CAMERA & AIM' && s0.depth === 3, `(${s0.title})`);
  const m0 = await page.evaluate(() => __app.gfx.settings.camMode);
  await key('ArrowRight');
  check('desktop: left / right change a choice', (await page.evaluate(() => __app.gfx.settings.camMode)) !== m0);
  await page.evaluate(() => __app.gfx.set('camMode', 'active'));
  await key('Escape');
  s0 = await st();
  check('desktop: Esc goes up one page', s0.title === 'OPTIONS' && s0.depth === 2, `(${s0.title})`);
  await key('Escape');
  await key('Escape');
  s0 = await st();
  check('desktop: ... and out of the menu', s0.state === 'play' && s0.depth === 0, `(${s0.state})`);

  // the DEBUG page: the toggle and the text size
  await key('Escape');
  for (let i = 0; i < 3; i++) await key('ArrowDown');
  await key('Enter');
  for (let i = 0; i < 4; i++) await key('ArrowDown');
  await key('Enter');
  s0 = await st();
  check('desktop: OPTIONS > DEBUG', s0.title === 'DEBUG', `(${s0.title})`);
  await key('ArrowRight');
  check('desktop: DEBUG MODE steps off > compact', (await page.evaluate(() => __app.gfx.settings.debug)) === 1);
  await page.evaluate(() => __app.gfx.set('debug', 0));
  await key('Escape'); await key('Escape'); await key('Escape');

  // a mouse click on a menu row must not capture the mouse (it did: the cursor vanished after the first click)
  await key('Escape');
  const at = await page.evaluate(() => { const app = __app, m = app.menu, pix = app.gfx.hud, f = app.gfx.frameCss(); const page = m.stack[0]; const L = m.layout(pix.w, pix.h, page, page.items); return { x: f.left + (L.x + L.w / 2) * f.unit, y: f.top + (L.rows0 - 2 + 1.5 * L.rowH) * f.unit }; });
  await page.mouse.move(at.x, at.y); await page.evaluate(() => __frame(3));
  await page.mouse.down(); await page.mouse.up(); await page.evaluate(() => __frame(3));
  check('desktop: clicking a menu row does not capture the mouse', !(await page.evaluate(() => !!document.pointerLockElement || __game.input.locked)));
  check('desktop: ... and the click acted on the row (CAMERA stepped)', (await page.evaluate(() => __app.gfx.settings.camMode)) !== 'active');
  await page.evaluate(() => __app.gfx.set('camMode', 'active'));
  await ctx.close();
}
if (!only || only === 'desktop') {
  // ESC on the title opens the title menu (and the game does not start)
  const { ctx, page } = await openDesktop('?preserve=1');
  await page.keyboard.down('Escape'); await page.evaluate(() => __frame(2)); await page.keyboard.up('Escape'); await page.evaluate(() => __frame(2));
  const s0 = await page.evaluate(() => ({ state: __app.state, title: (__app.menu.stack.at(-1) || {}).title, labels: (__app.menu.stack.at(-1) || { items: [] }).items.map((i) => i.label) }));
  check('desktop: Esc on the title opens the menu, it does not start the game', s0.state === 'title-options' && s0.title === 'MENU', `(${s0.state}: ${s0.labels.join(' / ')})`);
  await page.keyboard.down('Escape'); await page.evaluate(() => __frame(2)); await page.keyboard.up('Escape'); await page.evaluate(() => __frame(2));
  const s1 = await page.evaluate(() => __app.state);
  await page.evaluate(() => __frame(30));
  check('desktop: Esc again closes it and the title waits for a start (the closing does not start it)', s1 === 'title' && (await page.evaluate(() => __app.state)) === 'title');
  await page.keyboard.down('Enter'); await page.evaluate(() => __frame(2)); await page.keyboard.up('Enter'); await page.evaluate(() => __frame(30));
  check('desktop: Enter starts the game from the title', (await page.evaluate(() => __app.state)) === 'intro');
  await ctx.close();
}

// ---- a browser that hides its touch support still gets the button with its first touch ------------------------------------------------------------
if (!only || only === 'late') {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });         // (no touch support reported)
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto(base + '?preserve=1');
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await settleAudio(page);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; window.__frame = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { __app.gfx.clearHud(); __app.update(dt); } }; window.__draw = () => { const g = __app.gfx; g.render(__app.scene, __app.camera, __app.overlay); g.renderer.getContext().finish(); }; __frame(5); });
  check('no touch support reported: no touch buttons yet', await page.evaluate(() => !__game.input.touchRoot));
  await page.evaluate(() => window.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true })));
  await page.evaluate(() => __frame(3));
  const u = await page.evaluate(() => { const i = __game.input; const b = i.menuBtn; return { made: !!i.touchRoot, shown: !!b && b.style.display !== 'none', label: b && i._menuLabel.textContent, w: b && b.getBoundingClientRect().width }; });
  check('... the first touch creates the on-screen controls, MENU included', u.made && u.shown && u.label === 'MENU' && u.w > 80, `(${JSON.stringify(u)})`);
  await ctx.close();
}
if (!only || only === 'late') {
  // the same upright: the picture is centred until the first touch, then it moves up to the top and the button goes under it
  const ctx = await browser.newContext({ viewport: { width: 430, height: 866 }, deviceScaleFactor: 2 });         // (no touch support reported)
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto(base + '?preserve=1');
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await settleAudio(page);
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; window.__frame = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { __app.gfx.clearHud(); __app.update(dt); } }; });
  await page.evaluate(() => __frame(3));
  const before = await page.evaluate(() => __app.gfx.frameCss());
  check('upright, no touch support reported: the picture is centred (a desktop window)', near(before.top, (866 - before.height) / 2, 0.6), `(from y ${before.top.toFixed(1)})`);
  await page.evaluate(() => window.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true })));
  await page.evaluate(() => __frame(3));
  const g = await geom(page);
  check('... the first touch moves it up to the top of the window, and the MENU button goes under it', near(g.f.top, 8, 0.5) && near(g.rect.top - (g.f.top + g.f.height), 24, 1.5), `(the picture from y ${g.f.top.toFixed(1)}; the button ${(g.rect.top - (g.f.top + g.f.height)).toFixed(1)} px below it)`);
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall menu checks passed');
process.exit(failed ? 1 : 0);
