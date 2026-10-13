// The TRAVEL menu, end to end in the running game, through real input: the keyboard and the mouse on a desktop window, taps (CDP touch events) on a phone held either way. The title menu and the
// pause menu both lead to ONE page of levels, a row each: one choice takes the hero to the start of the level (no groups, no ARE YOU SURE?). In the level he is already in the screen blinks and
// nothing is rebuilt (what he did there stays); in another a trip is made like a portal's and the level is built fresh. Every level's start is gone to through the pause menu, and he must stand
// on it: grounded, alive, unhurt, facing the way the place says with the camera behind him, the place's name on the banner, the place his checkpoint (a death brings him back there).
//   node tools/travel-test.mjs      (needs the dev server on :5173, GV_HMR=0 recommended; GV_URL=file:///.../docs/index.html tests a built file instead;
//                                    GV_ONLY=title|pause|sweep|mouse|touch|portrait (or the same as the first argument) runs just that part; GV_SHOTS=/some/dir also saves screenshots)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { TRAVEL, travelPlaces, findPlace } from '../src/game/travel.js';
import { REALMS } from '../src/game/realms.js';
import { measureText } from '../src/engine/textures/font.js';

const base = process.env.GV_URL || 'http://127.0.0.1:5173/';
const only = process.env.GV_ONLY || process.argv[2] || '';
const shots = process.env.GV_SHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });
const PROGRESS_KEY = 'gloaming-vale/progress/v1';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : detail); };
const wanted = (part) => !only || only === part;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const f1 = (v) => (typeof v === 'number' ? v.toFixed(1) : String(v));

/** The first gesture makes the game synthesise all its sounds, which keeps the page busy for seconds: do that first, or a tap could be delayed past the 350 ms the game allows for one. */
async function settleAudio(page) {
  await page.evaluate(() => { try { __app.unlockAudio(); } catch (e) { /* no audio */ } });
  await page.waitForFunction(() => !__app.audio || __app.audio.ready, null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(300);
}

/**
 * A page of the game with the real-time loop stopped: the test draws frames itself, exactly as the loop would (the software renderer needs ~0.4 s a frame, which would stretch a key or a tap
 * past what the game allows). A world is still built the real way, behind the loading bar, by its own timers.
 */
async function open(url, { vp = { width: 1000, height: 700 }, touch = false, progress = null } = {}) {
  const ctx = await browser.newContext({ viewport: vp, ...(touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
  if (progress) await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* no storage */ } }, [PROGRESS_KEY, progress]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message.slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|GL Driver/.test(m.text())) { errors.push(m.text()); console.log('[error]', m.text().slice(0, 300)); } });
  const cdp = touch ? await ctx.newCDPSession(page) : null;
  await page.goto(base + url);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error('boot error: ' + String(err).slice(0, 300));
  await page.waitForTimeout(1200);
  await settleAudio(page);
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    window.__frame = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { __app.gfx.clearHud(); __app.update(dt); } };
    window.__draw = () => { const g = __app.gfx; g.render(__app.scene, __app.camera, __app.overlay); g.renderer.getContext().finish(); };
    __frame(10);
    // what each arrival leaves on the banner and the hint at once (an area's own banner, or a realm door's, may replace it a moment later)
    const a = __app, arrive = a._arrive.bind(a);
    window.__arrivals = [];
    a._arrive = (g, tr) => { arrive(g, tr); window.__arrivals.push({ banner: g.hud.bannerState && g.hud.bannerState.title, sub: g.hud.bannerState && g.hud.bannerState.sub, hint: g.hud.hintState && g.hud.hintState.text, realm: g.realm.id, hop: !!tr.hop }); };
  });
  await page.waitForTimeout(1200);                                       // (let the frame that was already in flight finish)
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const frame = (n = 2, dt = 1 / 60) => ev(([n, dt]) => __frame(n, dt), [n, dt]);
  /** a key held across two frames (a press-and-release inside one frame would never be seen by the game's polling of the arrow keys) */
  const key = async (k) => { await page.keyboard.down(k); await frame(2); await page.keyboard.up(k); await frame(2); };
  const touchEv = (type, pts, at) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id = 0]) => ({ x, y, id })), ...(at ? { timestamp: at } : {}) });
  const tap = async (x, y) => { const t = Date.now() / 1000; await touchEv('touchStart', [[x, y]], t); await touchEv('touchEnd', [], t + 0.05); await frame(3); };       // (a 50 ms tap by the events' own clock)
  const shot = async (name) => { if (shots) { await ev(() => { __frame(2); __draw(); }); await page.screenshot({ path: path.join(shots, name + '.png') }); } };
  return { ctx, page, ev, frame, key, tap, shot };
}

// ---- reading the menu --------------------------------------------------------------------------------------------------------------------------
/** the open page of the menu: its title, the rows now shown, the chosen row, and the page's own text lines */
const menuNow = (ev) => ev(() => {
  const a = __app, m = a.menu, pg = m.stack[m.stack.length - 1];
  if (!pg) return { depth: 0, title: null, labels: [], sel: -1, state: a.state, extra: null, width: 0, travel: !!a.travel };
  const items = pg.items.filter((it) => !it.hidden || !it.hidden());
  return { depth: m.stack.length, title: pg.title, labels: items.map((i) => i.label), sel: pg.sel, state: a.state, extra: pg.extra ? pg.extra.slice() : null, width: pg.width, travel: !!a.travel };
});
/** move the cursor to the row `label` with the arrow keys and press Enter on it */
async function pick(t, label) {
  const s = await menuNow(t.ev), i = s.labels.indexOf(label);
  if (i < 0) throw new Error(`no row ${label} on ${s.title} (${s.labels.join(' / ')})`);
  const down = (i - s.sel + s.labels.length) % s.labels.length;
  const dir = down <= s.labels.length - down ? 'ArrowDown' : 'ArrowUp', n = dir === 'ArrowDown' ? down : s.labels.length - down;
  for (let k = 0; k < n; k++) await t.key(dir);
  await t.key('Enter');
  return menuNow(t.ev);
}
// ---- the world he is in ------------------------------------------------------------------------------------------------------------------------
/**
 * run the app's clock until the trip is over and the hero stands in `realm` (a world is built for real, so the page also gets time between the frames); if he never does, nothing after it
 * means anything: the run ends there, saying what the game was doing
 */
async function arrived(t, realm, what = '', maxMs = 120000) {
  const t0 = Date.now();
  let s = null;
  while (Date.now() - t0 < maxMs) {
    s = await t.ev(() => { for (let k = 0; k < 8; k++) __frame(1, 1 / 30); const a = __app; return { state: a.state, travel: !!a.travel, phase: a.travel && a.travel.phase, realm: a.game.realm.id, disposed: !!a.game.disposed, error: window.__error || null }; });
    if (s.error) break;
    if (s.state === 'play' && !s.travel && s.realm === realm && !s.disposed) return s;
    await t.page.waitForTimeout(s.phase === 'load' ? 40 : 0);
  }
  console.log('FAIL'.padEnd(5), `no arrival in ${realm}${what ? ` (${what})` : ''}`, JSON.stringify(s));
  await browser.close();
  console.log('\nFAILED (the run ends: nothing after a trip that does not arrive means anything)');
  process.exit(1);
}
/** where the hero is against a place: how far from it on the ground and in height, how he faces, how the camera looks, and what the game says of him */
const here = (ev, place) => ev((place) => {
  const g = __game, p = g.player, cp = g.checkpoint, turn = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const floor = place.y ?? g.grid.heightAt(place.x, place.z);
  return {
    realm: g.realm.id, off: Math.hypot(p.x - place.x, p.z - place.z), dy: p.y - floor, grounded: p.grounded, dead: p.dead, hp: g.sparx ? g.sparx.hp : null, deaths: g.stats.deaths, gems: g.stats.gems, inv: p.invulnT, spx: g.sparx ? Math.hypot(g.sparx.x - p.x, g.sparx.y - p.y - 1.5, g.sparx.z - p.z) : 0,
    gateShut: !!(g.objects && g.objects.barrier && g.objects.barrier.c.solid), gate: !!(g.objects && g.objects.barrier), arrival: window.__arrivals[window.__arrivals.length - 1] || null,
    dyaw: turn(p.yaw, place.yaw), cyaw: turn(g.cam.yaw, place.yaw), locked: !!(g.locked || p.locked), carry: !!p.carry, hud: g.hud.visible, mode: g.mode, state: __app.state, paused: g.paused, menu: __app.menu.stack.length,
    cp: cp ? { dx: Math.hypot(cp.x - place.x, cp.z - place.z), dy: cp.y - floor, yaw: turn(cp.yaw, place.yaw) } : null,
    banner: g.hud.bannerState && g.hud.bannerState.title, hint: g.hud.hintState && g.hud.hintState.text, fade: g.fade.a, cinematic: !!g.cam.inCinematic, travel: !!__app.travel,
  };
}, place);
const placeOf = (key) => findPlace(key);
/** the checks that tell he has been brought to a place and is well there (just after the arrival: the fade has not cleared yet) */
const arrivalOk = (r, place, away) => r.realm === place.world && r.state === 'play' && r.mode !== 'title' && r.mode !== 'intro' && r.hud && !r.locked && !r.carry && !r.dead && !r.cinematic && !r.paused && r.menu === 0 && !r.travel
  && r.off < 0.75 && Math.abs(r.dy) < 0.6 && Math.abs(r.dyaw) < 0.2 && Math.abs(r.cyaw) < 0.5
  && r.cp && r.cp.dx < 0.1 && Math.abs(r.cp.dy) < 0.2 && Math.abs(r.cp.yaw) < 0.01 && (!away || r.deaths === 0) && r.spx < 3.5 && arrivalBanner(r, place);
/** the banner the arrival itself put up: the place's name over the world's */
const arrivalBanner = (r, place) => !!r.arrival && r.arrival.banner === place.name && r.arrival.sub === REALMS[place.world].name && r.arrival.realm === place.world;
const describe = (r) => `(${r.realm}: ${f1(r.off)} m off, dy ${f1(r.dy)}, yaw ${r.dyaw.toFixed(2)}, cam ${r.cyaw.toFixed(2)}, Sparx ${f1(r.spx)} m, ${r.state}/${r.mode}, banner ${r.arrival && r.arrival.banner}${r.cp ? `, checkpoint ${f1(r.cp.dx)} m off` : ', no checkpoint'})`;

const STARTS = TRAVEL.map((w) => ({ ...w.groups[0].places[0], world: w.world, level: w.name }));
const startOf = (world) => STARTS.find((p) => p.world === world);

// ---- part 1: the title menu, with the keyboard --------------------------------------------------------------------------------------------------
if (wanted('title')) {
  const t = await open('?preserve=1');
  const { ev, key } = t;
  await key('Escape');
  let s = await menuNow(ev);
  check('title: Esc opens the menu, with the TRAVEL row among its rows', s.state === 'title-options' && s.title === 'MENU' && s.labels.includes('TRAVEL') && s.labels.indexOf('TRAVEL') > s.labels.indexOf('PLAY') && s.labels.indexOf('TRAVEL') < s.labels.indexOf('OPTIONS'), `(${s.labels.join(' / ')})`);
  await ev(() => { window.__keep = __game; });
  s = await pick(t, 'TRAVEL').catch(async (e) => { console.log(String(e)); return menuNow(ev); });
  await t.shot('1-levels');
  check('TRAVEL lists the levels, one row each, and nothing else but BACK', s.title === 'TRAVEL TO' && s.labels.slice(0, TRAVEL.length).join() === TRAVEL.map((w) => w.name).join() && s.labels.length === TRAVEL.length + 1 && s.labels[TRAVEL.length] === 'BACK', `(${s.labels.join(' / ')})`);
  // Esc climbs out
  const up = [];
  for (let i = 0; i < 2; i++) { await key('Escape'); up.push(String((await menuNow(ev)).title)); }
  check('Esc on the levels goes back to the title menu, and out of it to the title screen', up.join() === 'MENU,null' && (await menuNow(ev)).state === 'title', `(${up.join(' > ')})`);

  // one choice: the title ends and he is at the start of the vale, playing
  await key('Escape');
  await pick(t, 'TRAVEL');
  await pick(t, 'GLOAMING VALE');
  let st = await ev(() => ({ state: __app.state, travel: __app.travel && { id: __app.travel.id, hop: __app.travel.hop, at: __app.travel.at && __app.travel.at.name }, locked: __game.locked, menu: __app.menu.stack.length }));
  check('one choice starts the trip at once (the menu closed, the hero held), a hop within the vale', st.state === 'traveling' && st.travel && st.travel.id === 'gloaming' && st.travel.hop === true && st.travel.at === 'THE START' && st.locked && st.menu === 0, JSON.stringify(st));
  await arrived(t, 'gloaming');
  const place = startOf('gloaming');
  let r = await here(ev, place);
  check('he is at THE START, playing: the camera behind him, the checkpoint here, the name on the banner', arrivalOk(r, place, true), describe(r));
  check('... the title is over: the game is in play mode and the same world was kept (nothing rebuilt)', r.mode === 'play' && (await ev(() => window.__keep === __game)));
  await t.frame(90, 1 / 30);
  r = await here(ev, place);
  check('... he stands there (grounded, not hurt), the white has cleared', r.grounded && !r.dead && r.off < 0.75 && Math.abs(r.dy) < 0.6 && r.fade < 0.05, describe(r));
  const x0 = await ev(() => [__game.player.x, __game.player.z]);
  await t.page.keyboard.down('KeyW'); await t.frame(30, 1 / 30); await t.page.keyboard.up('KeyW'); await t.frame(3);
  const x1 = await ev(() => [__game.player.x, __game.player.z]);
  check('... and he is playable: W walks him', Math.hypot(x1[0] - x0[0], x1[1] - x0[1]) > 2, `(${Math.hypot(x1[0] - x0[0], x1[1] - x0[1]).toFixed(1)} m)`);
  await t.ctx.close();
}

// ---- part 2: the pause menu: the level he is in keeps its world, another is built fresh --------------------------------------------------------------
if (wanted('pause')) {
  const t = await open('?skip=1&preserve=1');
  const { ev, key } = t;
  await t.frame(30, 1 / 30);
  const v = findPlace('gloaming/village');
  await ev((v) => { const g = __game; window.__keep = g; g.stats.gems = 7; g.player.place(v.x + 3, g.grid.heightAt(v.x + 3, v.z) + 0.05, v.z, 1); }, v);
  await key('Escape');
  let s = await menuNow(ev);
  check('pause: Esc opens the menu, with TRAVEL in it (after CONTROLS)', s.state === 'paused' && s.labels.includes('TRAVEL') && s.labels.indexOf('TRAVEL') > s.labels.indexOf('CONTROLS'), `(${s.labels.join(' / ')})`);
  await pick(t, 'TRAVEL');
  await pick(t, 'GLOAMING VALE');
  let st = await ev(() => ({ state: __app.state, hop: __app.travel && __app.travel.hop, paused: __game.paused, menu: __app.menu.stack.length, inv: __game.player.invulnT }));
  check('pause: one choice closes the menu and starts a hop (the vale is not rebuilt), the hero held and untouchable', st.state === 'traveling' && st.hop === true && st.menu === 0 && st.inv > 1.5, JSON.stringify(st));
  await arrived(t, 'gloaming');
  await t.frame(60, 1 / 30);
  const place = startOf('gloaming');
  let r = await here(ev, place);
  st = await ev(() => ({ same: window.__keep === __game, gems: __game.stats.gems }));
  check('pause: he is at THE START, the game running again, the same world, what he did there kept (7 gems)', arrivalOk(r, place, true) && r.paused === false && st.same && st.gems >= 7, describe(r) + ` gems ${st.gems}`);
  await t.frame(90, 1 / 30);
  await ev(() => { __game.player.kill(); });
  await t.frame(240, 1 / 30);
  r = await here(ev, place);
  check('a death brings him back to the start he travelled to (his checkpoint), alive', r.deaths === 1 && !r.dead && r.off < 1.2 && r.realm === 'gloaming', describe(r) + ` deaths ${r.deaths}`);

  // another level: a trip like a portal's, and the new world is fresh
  await key('Escape');
  await pick(t, 'TRAVEL');
  await pick(t, 'DAWNHAVEN');
  st = await ev(() => ({ state: __app.state, hop: __app.travel && __app.travel.hop, id: __app.travel && __app.travel.id }));
  check('pause: DAWNHAVEN from the vale is a trip, not a hop', st.state === 'traveling' && st.hop === false && st.id === 'home', JSON.stringify(st));
  await arrived(t, 'home');
  await t.frame(60, 1 / 30);
  const hp = startOf('home');
  r = await here(ev, hp);
  const gone = await ev(() => window.__keep !== __game && window.__keep.disposed);
  check('pause: he is at the start of Dawnhaven, a fresh world (the vale left behind)', arrivalOk(r, hp, true) && r.grounded && gone, describe(r));
  await t.ctx.close();
}

// ---- part 3: every level's start, through the pause menu -------------------------------------------------------------------------------------------
if (wanted('sweep')) {
  const t = await open('?skip=1&preserve=1');
  const { ev, key } = t;
  await t.frame(30, 1 / 30);
  const bad = [];
  let n = 0;
  for (const place of STARTS) {
    await key('Escape');
    const s0 = await menuNow(ev);
    if (s0.state !== 'paused') { bad.push(`${place.level}: the pause menu did not open (${s0.state})`); break; }
    await pick(t, 'TRAVEL');
    await pick(t, place.level);
    await arrived(t, place.world);
    await t.frame(90, 1 / 30);
    const r = await here(ev, place);
    const why = [];
    if (!arrivalOk(r, place, true)) why.push('arrival');
    if (!r.grounded || r.dead) why.push('stand');
    if (why.length) bad.push(`${place.level}: ${why.join(', ')} ${describe(r)}`); else n++;
  }
  check(`every level (${n} of ${STARTS.length}) was gone to by one choice from the pause menu: he stands at its start`, bad.length === 0 && n === STARTS.length, bad.join('\n      '));
  await t.ctx.close();
}

// ---- part 4: the mouse on a desktop window --------------------------------------------------------------------------------------------------------
if (wanted('mouse')) {
  const t = await open('?preserve=1');
  const { ev, page } = t;
  const rowAt = (label) => ev((label) => {
    const app = __app, m = app.menu, pix = app.gfx.hud, f = app.gfx.frameCss(), pg = m.stack[m.stack.length - 1];
    const items = pg.items.filter((it) => !it.hidden || !it.hidden()), L = m.layout(pix.w, pix.h, pg, items), i = items.findIndex((it) => it.label === label);
    return { x: f.left + (L.x + L.w / 2) * f.unit, y: f.top + (L.rows0 - 2 + (i + 0.5) * L.rowH) * f.unit, i };
  }, label);
  const click = async (x, y) => { await page.mouse.move(x, y); await t.frame(2); await page.mouse.down(); await page.mouse.up(); await t.frame(3); };
  const clickRow = async (label) => { const p = await rowAt(label); if (p.i < 0) throw new Error('no row ' + label); await click(p.x, p.y); return menuNow(ev); };
  await t.key('Escape');
  await ev(() => { window.__keep = __game; });
  let s = await clickRow('TRAVEL');
  check('mouse: a click on TRAVEL opens the levels', s.title === 'TRAVEL TO', `(${s.title})`);
  s = await clickRow('TIDEGLASS REACH');
  const st = await ev(() => ({ state: __app.state, id: __app.travel && __app.travel.id, menu: __app.menu.stack.length }));
  check('mouse: one click on a level starts the trip to it (the title menu is closed)', st.state === 'traveling' && st.id === 'tideglass' && st.menu === 0, JSON.stringify(st));
  await arrived(t, 'tideglass');
  await t.frame(60, 1 / 30);
  const place = startOf('tideglass');
  const r = await here(ev, place);
  const gone = await ev(() => window.__keep !== __game && window.__keep.disposed);
  check('mouse: he is at the start of Tideglass Reach, a fresh world', arrivalOk(r, place, true) && r.grounded && gone, describe(r));
  await t.ctx.close();
}

// ---- part 5: a phone, held either way: taps ------------------------------------------------------------------------------------------------------
/** CSS-pixel geometry of the open page's rows and panel, from the game's own layout (the MENU button's and the picture's too, whether a page is open or not) */
const rowsOf = (ev) => ev(() => {
  const app = __app, m = app.menu, pix = app.gfx.hud, f = app.gfx.frameCss(), pg = m.stack[m.stack.length - 1], px = (u) => u * f.unit;
  const b = __game.input.menuBtn.getBoundingClientRect();
  const R = { title: null, labels: [], depth: 0, state: app.state, travel: !!app.travel, vw: innerWidth, vh: innerHeight, frame: { left: f.left, top: f.top, right: f.left + f.width, bottom: f.top + f.height }, button: { top: b.top, bottom: b.bottom, x: b.left + b.width / 2, y: b.top + b.height / 2 } };
  if (!pg) return R;
  const items = pg.items.filter((it) => !it.hidden || !it.hidden()), L = m.layout(pix.w, pix.h, pg, items);
  return {
    ...R, title: pg.title, labels: items.map((it) => it.label), depth: m.stack.length, sel: pg.sel, rowPx: px(L.rowH),
    row: items.map((it, i) => ({ x: f.left + px(L.x + L.w * 0.5), y: f.top + px(L.rows0 - 2 + i * L.rowH + L.rowH / 2) })),
    panel: { top: f.top + px(L.y), bottom: f.top + px(L.y + L.h), left: f.left + px(L.x), right: f.left + px(L.x + L.w) },
  };
});
const clearOfButton = (R) => R.panel.top >= R.button.bottom - 1 || R.panel.bottom <= R.button.top + 1;
/** the page is finger-sized, inside the picture and clear of the MENU button */
const tappable = (R) => R.rowPx >= 34 && R.panel.left >= R.frame.left - 0.5 && R.panel.right <= R.frame.right + 0.5 && R.panel.top >= R.frame.top - 0.5 && R.panel.bottom <= R.frame.bottom + 0.5 && R.panel.bottom <= R.vh && clearOfButton(R);
const rowLine = (R) => `(${R.title}: ${R.labels.join(' / ')}: ${R.rowPx.toFixed(1)} px a row, the panel y ${Math.round(R.panel.top)}..${Math.round(R.panel.bottom)})`;

async function phone(label, vp, shotName) {
  const t = await open('?preserve=1', { vp, touch: true, progress: { realms: { gloaming: { done: true, gems: 400, gemsTotal: 700, time: 600 } }, home: { visits: 1, secrets: [] } } });
  const { ev, tap } = t;
  const press = async (title) => { const R = await rowsOf(ev); const i = R.labels.indexOf(title); if (i < 0) throw new Error(`no row ${title} on ${R.title}: ${R.labels.join(' / ')}`); await tap(R.row[i].x, R.row[i].y); return rowsOf(ev); };
  const outside = async () => { const R = await rowsOf(ev); await tap(R.frame.left + 12, (R.frame.top + R.frame.bottom) / 2); return rowsOf(ev); };
  let R = await rowsOf(ev);
  await tap(R.button.x, R.button.y);                                   // (the MENU button)
  R = await rowsOf(ev);
  check(`${label}: the title menu has TRAVEL, and it is tappable`, R.title === 'MENU' && R.labels.includes('TRAVEL') && tappable(R), rowLine(R));
  await ev(() => { window.__keep = __game; });
  R = await press('TRAVEL');
  check(`${label}: the levels, one row each, finger-sized and inside the picture, clear of the MENU button`, R.title === 'TRAVEL TO' && R.labels.length === TRAVEL.length && tappable(R), rowLine(R));
  await t.shot(`${shotName}-levels`);
  R = await outside();
  check(`${label}: a tap outside the panel goes back`, R.title === 'MENU', `(${R.title})`);
  R = await press('TRAVEL');
  R = await press('DAWNHAVEN');
  check(`${label}: one tap on a level starts the trip`, R.state === 'traveling' && R.depth === 0, `(${R.state}, ${R.depth} pages open)`);
  await arrived(t, 'home');
  await t.frame(60, 1 / 30);
  const place = startOf('home');
  let r = await here(ev, place);
  check(`${label}: he is at the start of Dawnhaven, playing, the buttons back`, arrivalOk(r, place, true) && r.grounded && (await ev(() => __game.input._pads.style.display !== 'none' && __game.input.menuBtn.style.display !== 'none')), describe(r));

  // the pause menu on the phone: TRAVEL is a row (six finger-sized rows), and the level he is in is a hop that keeps the world
  await ev(() => { window.__keep = __game; __game.stats.gems = 5; });
  R = await rowsOf(ev);
  await tap(R.button.x, R.button.y);
  R = await rowsOf(ev);
  check(`${label}: the pause menu has TRAVEL and is tappable (six rows)`, R.title === 'PAUSED' && R.labels.includes('TRAVEL') && R.labels.length === 6 && tappable(R), rowLine(R));
  R = await press('TRAVEL');
  R = await press('DAWNHAVEN');
  await arrived(t, 'home');
  await t.frame(60, 1 / 30);
  r = await here(ev, place);
  const kept = await ev(() => ({ same: window.__keep === __game, gems: __game.stats.gems, pads: __game.input._pads.style.display !== 'none' }));
  check(`${label}: a hop: he is at the start of Dawnhaven again, the world and the 5 gems are kept, the thumb controls are back`, arrivalOk(r, place, true) && kept.same && kept.gems === 5 && kept.pads && r.grounded, describe(r) + ` ${JSON.stringify(kept)}`);
  await t.ctx.close();
}
if (wanted('touch')) await phone('phone landscape', { width: 844, height: 390 }, 'phone-landscape');
if (wanted('portrait')) await phone('phone portrait', { width: 390, height: 844 }, 'phone-portrait');

check('no page errors, no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall travel tests passed');
process.exit(failed ? 1 : 0);
