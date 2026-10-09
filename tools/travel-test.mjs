// The TRAVEL menu, end to end in the running game, through real input: the keyboard and the mouse on a desktop window, taps (CDP touch events) on a phone held either way. The title menu and the
// pause menu both lead to the worlds, the groups of places and the places; a place asks ARE YOU SURE? (the cursor starts on NO, Esc or a tap outside is NO too), and only YES takes the hero
// there: in the world he is already in the screen blinks and nothing is rebuilt (what he did there stays), in the other world a trip is made like a portal's and the world is built fresh.
// Every one of the places is gone to through the pause menu's pages, and he must stand on it: grounded, alive, unhurt, facing the way the place says with the camera behind him, the place's
// name on the banner, the place his checkpoint (a death brings him back there), and he stays where he stands.
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
/** through the pages of the TRAVEL menu with the keyboard, up to ARE YOU SURE? for the place (the menu is already open on its first page: the title menu or the pause menu) */
async function toConfirm(t, place) {
  const w = TRAVEL.find((x) => x.world === place.world), g = w.groups.find((x) => x.places.some((p) => p.id === place.id));
  await pick(t, 'TRAVEL');
  await pick(t, w.name);
  await pick(t, g.name);
  return pick(t, place.name);
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

// ---- part 1: the title menu, with the keyboard --------------------------------------------------------------------------------------------------
if (wanted('title')) {
  const t = await open('?preserve=1');
  const { ev, key } = t;
  await key('Escape');
  let s = await menuNow(ev);
  check('title: Esc opens the menu, with the TRAVEL row among its rows', s.state === 'title-options' && s.title === 'MENU' && s.labels.includes('TRAVEL') && s.labels.indexOf('TRAVEL') > s.labels.indexOf('PLAY') && s.labels.indexOf('TRAVEL') < s.labels.indexOf('OPTIONS'), `(${s.labels.join(' / ')})`);
  await ev(() => { window.__keep = __game; window.__pos0 = [__game.player.x, __game.player.z]; });
  await t.shot('1-title-menu');
  s = await pick(t, 'TRAVEL');
  await t.shot('2-worlds');
  check('TRAVEL lists the worlds', s.title === 'TRAVEL TO' && s.labels.slice(0, TRAVEL.length).join() === TRAVEL.map((w) => w.name).join(), `(${s.labels.join(' / ')})`);
  s = await pick(t, 'GLOAMING VALE');
  const gv = TRAVEL.find((w) => w.world === 'gloaming');
  check('... a world lists its groups of places', s.title === 'GLOAMING VALE' && gv.groups.every((g) => s.labels.includes(g.name)), `(${s.labels.join(' / ')})`);
  await t.shot('3-groups');
  s = await pick(t, 'THE HEIGHTS');
  await t.shot('4-places');
  check('... a group lists its places', s.title === 'THE HEIGHTS' && gv.groups.find((g) => g.name === 'THE HEIGHTS').places.every((p) => s.labels.includes(p.name)), `(${s.labels.join(' / ')})`);              // (by its name: a world's groups have grown before, with THE TRIALS)
  s = await pick(t, 'HERON POINT');
  const fits = s.extra && s.extra.every((l) => measureText(l).w <= s.width - 20);
  check('... a place asks ARE YOU SURE?, YES or NO, with the cursor on NO and the place named', s.title === 'ARE YOU SURE?' && s.labels.join() === 'YES,NO' && s.sel === 1 && s.extra.join(' ').includes('HERON POINT') && s.extra.join(' ').includes('GLOAMING VALE'), `(${s.title}: ${s.labels.join('/')}, on ${s.labels[s.sel]}; ${(s.extra || []).join(' | ')})`);
  check('... the text fits the panel, and there is no warning of leaving the world (it is the world he is in)', fits && !s.extra.join(' ').includes('LEAVE'), `(${(s.extra || []).map((l) => measureText(l).w).join(', ')} px of ${s.width - 20})`);
  await t.shot('5-are-you-sure');

  // NO (Enter on the cursor's first place): nothing happens, and the menu is back on the places
  s = await pick(t, 'NO');
  let st = await ev(() => ({ same: window.__keep === __game, scripted: !!__game.player.script, moved: Math.hypot(__game.player.x - window.__pos0[0], __game.player.z - window.__pos0[1]) }));
  // (the hero of the title is Spyro flying in, played by the opening's script: he moves; what must not change is the world, and that no trip began)
  check('NO: back on the page of places, and no trip has begun (the title waits: the same world, the opening still playing)', s.title === 'THE HEIGHTS' && s.state === 'title-options' && !s.travel && st.same && st.scripted, `(${s.title}, ${s.state}, ${st.moved.toFixed(2)} m)`);
  // Enter alone on ARE YOU SURE? is NO, too (the cursor starts there): a stray press cannot send him away
  await pick(t, 'HERON POINT');
  await key('Enter');
  s = await menuNow(ev);
  check('Enter at once on ARE YOU SURE? is NO', s.title === 'THE HEIGHTS' && !s.travel && s.state === 'title-options', `(${s.title}, ${s.state})`);
  // Esc on it is NO as well, and goes up the pages one at a time
  await pick(t, 'HERON POINT');
  await key('Escape');
  s = await menuNow(ev);
  check('Esc on ARE YOU SURE? is NO, too', s.title === 'THE HEIGHTS' && s.depth === 4 && !s.travel, `(${s.title}, ${s.depth} pages open)`);
  const up = [];
  for (let i = 0; i < 4; i++) { await key('Escape'); up.push(String((await menuNow(ev)).title)); }
  check('... and Esc climbs the pages to the title menu, and out of it, to the title screen', up.join() === 'GLOAMING VALE,TRAVEL TO,MENU,null' && (await menuNow(ev)).state === 'title', `(${up.join(' > ')})`);

  // YES: from the title, in the vale's own world: the title ends and he is on the place, playing
  await key('Escape');
  await toConfirm(t, placeOf('gloaming/heron'));
  await key('ArrowUp');
  s = await menuNow(ev);
  check('YES is one row up from NO', s.labels[s.sel] === 'YES', `(on ${s.labels[s.sel]})`);
  await key('Enter');
  st = await ev(() => ({ state: __app.state, travel: __app.travel && { id: __app.travel.id, hop: __app.travel.hop, at: __app.travel.at && __app.travel.at.name }, locked: __game.locked, menu: __app.menu.stack.length, sametitle: window.__keep === __game }));
  check('YES starts the trip at once (the menu is closed, the hero held), a hop within the vale', st.state === 'traveling' && st.travel && st.travel.id === 'gloaming' && st.travel.hop === true && st.travel.at === 'HERON POINT' && st.locked && st.menu === 0, JSON.stringify(st));
  await arrived(t, 'gloaming');
  let r = await here(ev, placeOf('gloaming/heron'));
  check('he is on HERON POINT, playing: facing the lantern road, the camera behind him, the checkpoint here, the name on the banner', arrivalOk(r, placeOf('gloaming/heron'), true), describe(r));
  check('... the title is over: the game is in play mode and the same world was kept (nothing rebuilt)', r.mode === 'play' && (await ev(() => window.__keep === __game)));
  check('... and, as PLAY would have done, a line of controls comes up', /WASD MOVE/.test((r.arrival && r.arrival.hint) || ''), `(${r.arrival && r.arrival.hint})`);
  await t.frame(90, 1 / 30);
  r = await here(ev, placeOf('gloaming/heron'));
  check('... he stands there (grounded, not hurt, not drifting), the white has cleared', r.grounded && !r.dead && r.off < 0.75 && Math.abs(r.dy) < 0.6 && r.fade < 0.05, describe(r) + ` grounded ${r.grounded}, fade ${r.fade.toFixed(2)}`);
  // he can be played from there: a key moves him
  const x0 = await ev(() => [__game.player.x, __game.player.z]);
  await t.page.keyboard.down('KeyW'); await t.frame(30, 1 / 30); await t.page.keyboard.up('KeyW'); await t.frame(3);
  const x1 = await ev(() => [__game.player.x, __game.player.z]);
  check('... and he is playable: W walks him', Math.hypot(x1[0] - x0[0], x1[1] - x0[1]) > 2, `(${Math.hypot(x1[0] - x0[0], x1[1] - x0[1]).toFixed(1)} m)`);
  await t.ctx.close();
}

// ---- part 2: the pause menu, with the keyboard: a hop keeps the world, a trip builds the other one fresh --------------------------------------------
if (wanted('pause')) {
  const t = await open('?skip=1&preserve=1');
  const { ev, key } = t;
  await t.frame(30, 1 / 30);
  const v = placeOf('gloaming/village');
  await ev((v) => { const g = __game; window.__keep = g; g.stats.gems = 7; g.player.place(v.x + 3, g.grid.heightAt(v.x + 3, v.z) + 0.05, v.z, 1); window.__pos0 = [g.player.x, g.player.z]; }, v);
  await key('Escape');
  let s = await menuNow(ev);
  check('pause: Esc opens the menu, with TRAVEL in it (after CONTROLS)', s.state === 'paused' && s.labels.includes('TRAVEL') && s.labels.indexOf('TRAVEL') > s.labels.indexOf('CONTROLS'), `(${s.labels.join(' / ')})`);
  // NO: nothing happens, the pause menu stays open on the places
  await toConfirm(t, placeOf('gloaming/dock'));
  s = await pick(t, 'NO');
  let st = await ev(() => ({ same: window.__keep === __game, d: Math.hypot(__game.player.x - window.__pos0[0], __game.player.z - window.__pos0[1]), gems: __game.stats.gems }));
  check('pause: NO leaves him where he is, and the pause menu is open on the places', s.state === 'paused' && s.title === 'THE VALE' && !s.travel && st.same && st.d < 0.01 && st.gems === 7, `(${s.state}, ${s.title}, ${st.d.toFixed(2)} m)`);
  // YES, in the same world: a hop
  await pick(t, 'MIRRORMERE DOCK');
  await key('ArrowUp');
  await key('Enter');
  st = await ev(() => ({ state: __app.state, hop: __app.travel && __app.travel.hop, paused: __game.paused, menu: __app.menu.stack.length, inv: __game.player.invulnT }));
  check('pause: YES closes the menu and starts a hop (the vale is not rebuilt), the hero held and untouchable while the old place fades out under the white', st.state === 'traveling' && st.hop === true && st.menu === 0 && st.inv > 1.5, JSON.stringify(st));
  await arrived(t, 'gloaming');
  await t.frame(6, 1 / 30);
  const inv0 = (await here(ev, placeOf('gloaming/dock'))).inv;
  await t.frame(54, 1 / 30);
  let r = await here(ev, placeOf('gloaming/dock'));
  st = await ev(() => ({ same: window.__keep === __game, gems: __game.stats.gems }));
  check('pause: he is on the dock, the game running again, the same world, what he did there kept (the 7 gems are in the bag, and the dock\'s own may be too)', arrivalOk(r, placeOf('gloaming/dock'), true) && r.paused === false && st.same && st.gems >= 7, describe(r) + ` gems ${st.gems}`);
  check('... he stands there', r.grounded && r.off < 0.75 && !r.dead, `(grounded ${r.grounded}, ${f1(r.off)} m)`);
  await t.frame(90, 1 / 30);
  const inv1 = (await here(ev, placeOf('gloaming/dock'))).inv;
  check('... he blinks untouchable for 3 seconds after he arrives (as after a respawn), and not for longer', inv0 > 2.5 && inv0 <= 3 && inv1 === 0, `(${inv0.toFixed(2)} s left at the start, ${inv1.toFixed(2)} after 3.5 s)`);
  // a death brings him back to the place, not the start of the vale
  await ev(() => { __game.player.kill(); });
  await t.frame(240, 1 / 30);
  r = await here(ev, placeOf('gloaming/dock'));
  check('a death brings him back to the place he travelled to (his checkpoint), alive', r.deaths === 1 && !r.dead && r.off < 1.2 && r.realm === 'gloaming', describe(r) + ` deaths ${r.deaths}`);

  // a Snuffer that notices him as he arrives (Shrine Isle: one patrols the islet, 7 m away) gets no free blow: the grace covers the seconds it needs to reach him
  await key('Escape');
  await toConfirm(t, placeOf('gloaming/shrine'));
  await key('ArrowUp');
  await key('Enter');
  await arrived(t, 'gloaming');
  const guard = { alerted: false, hp: [], struck: false };
  for (let i = 0; i < 26; i++) {
    const q = await ev(() => { __frame(3, 1 / 30); const g = __game, p = g.player, near = g.enemies.list.filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < 12 && e.state !== 'dead'); return { hp: g.sparx.hp, dead: p.dead, inv: p.invulnT, alert: near.some((e) => e.state === 'alert' || e.state === 'chase' || e.state === 'attack'), struck: near.some((e) => e.state === 'attack' && e.struck) }; });
    guard.hp.push(q.hp); guard.alerted ||= q.alert; guard.struck ||= q.struck; guard.dead ||= q.dead; guard.inv = q.inv;
  }
  check('a Snuffer that notices him on arrival gets no free blow: it comes at him, and he is not hurt in the first 2.6 s', guard.alerted && !guard.dead && new Set(guard.hp).size === 1 && guard.inv > 0, `(noticed ${guard.alerted}, struck ${guard.struck}, hp ${[...new Set(guard.hp)].join('/')}, ${guard.inv.toFixed(2)} s of grace left)`);

  // YES in the other world: ARE YOU SURE? warns, the trip is a portal's, and the new world is fresh
  const valeGems = await ev(() => __game.stats.gems);
  await key('Escape');
  s = await toConfirm(t, placeOf('home/echo-hall'));
  check('pause: for a place in the other world ARE YOU SURE? says he leaves this world, and what was done in it is not kept', s.sel === 1 && s.extra.join(' ').includes('YOU LEAVE THIS WORLD') && s.extra.join(' ').includes('NOT KEPT') && s.extra.join(' ').includes('ECHO HALL') && s.extra.every((l) => measureText(l).w <= s.width - 20), `(${s.extra.join(' | ')})`);
  await t.shot('6-are-you-sure-other-world');
  await key('ArrowUp');
  await key('Enter');
  st = await ev(() => ({ state: __app.state, hop: __app.travel && __app.travel.hop, to: __app.travel && __app.travel.id, color: __app.travel && __app.travel.color.join() }));
  check('... YES starts a trip (white, as a portal\'s) to Dawnhaven', st.state === 'traveling' && st.hop === false && st.to === 'home' && st.color === '1,1,1', JSON.stringify(st));
  await arrived(t, 'home');
  await t.frame(60, 1 / 30);
  r = await here(ev, placeOf('home/echo-hall'));
  st = await ev(() => ({ fresh: window.__keep !== __game, old: window.__keep.disposed, restored: __game.restored }));
  check('pause: he is in Dawnhaven, in the Echo Hall, a world of its own (the vale he left was let go of, as for a portal)', arrivalOk(r, placeOf('home/echo-hall'), true) && st.fresh && st.old, describe(r) + ` ${JSON.stringify(st)}`);
  check('... he stands there', r.grounded && r.off < 0.75 && !r.dead, `(grounded ${r.grounded}, ${f1(r.off)} m)`);
  // and the way back: the vale is built fresh, not "restored" (nothing was finished in it)
  await key('Escape');
  await toConfirm(t, placeOf('gloaming/mesa'));
  await key('ArrowUp');
  await key('Enter');
  await arrived(t, 'gloaming');
  await t.frame(60, 1 / 30);
  r = await here(ev, placeOf('gloaming/mesa'));
  st = await ev(() => ({ restored: __game.restored, mode: __game.mode, gems: __game.stats.gems }));
  check(`pause: and back to the vale (Launch Mesa): the vale is built fresh (the ${valeGems} gems of the one he left are gone), not restored, he stands on the mesa`, valeGems >= 7 && arrivalOk(r, placeOf('gloaming/mesa'), true) && !st.restored && st.mode === 'play' && st.gems === 0 && r.grounded, describe(r) + ` ${JSON.stringify(st)}`);

  // the summit of the vale is sealed by a ward while the Dawn Gate is shut, and it throws out whoever stands inside it: the places in the observatory open the gate (once, for good)
  const ward = await ev(() => { const g = __game, b = g.objects.barrier, S = g.level.summit; return { shut: b.c.solid, S: [S.x, S.z] }; });
  check('the Dawn Gate is shut in a vale that has just been built (at the mesa)', ward.shut === true);
  await key('Escape');
  await toConfirm(t, placeOf('gloaming/observatory'));
  await key('ArrowUp');
  await key('Enter');
  await arrived(t, 'gloaming');
  await t.frame(60, 1 / 30);
  r = await here(ev, placeOf('gloaming/observatory'));
  st = await ev(() => { const g = __game, b = g.objects.barrier, w = g.objects.ward; return { solid: b.c.solid, open: b.open, ward: w ? w.model.root.visible : null }; });
  check('the Observatory (inside the ward): the Dawn Gate stands open, with a hint saying so, and he stands on the floor of the observatory, not thrown out of the precinct', arrivalOk(r, placeOf('gloaming/observatory'), false) && r.grounded && r.off < 0.75 && !r.gateShut && st.open === 1 && /DAWN GATE/.test(r.hint || ''), describe(r) + ` ${JSON.stringify(st)} hint: ${r.hint}`);
  await ev(() => { const g = __game; g.player.invulnT = 0; });

  // a double press of YES: one trip, one world built
  await key('Escape');
  await toConfirm(t, placeOf('home/cove'));
  st = await ev(() => {
    const a = __app, pg = a.menu.stack[a.menu.stack.length - 1], yes = pg.items[0], builds = [], b0 = a._build.bind(a);
    a._build = (...args) => { builds.push(args[0]); return b0(...args); };
    yes.action(a.menu); const t1 = a.travel; yes.action(a.menu);
    window.__builds = builds;
    return { once: a.travel === t1 && !!t1, state: a.state };
  });
  await arrived(t, 'home');
  const builds = await ev(() => window.__builds.slice());
  check('a double YES makes one trip and builds one world', st.once && st.state === 'traveling' && builds.join() === 'home', `(${builds.join()})`);
  await t.ctx.close();
}

// ---- part 3: every place, through the pause menu's pages ---------------------------------------------------------------------------------------
if (wanted('sweep')) {
  const SHOT_PLACES = new Set(['gloaming/dock', 'gloaming/isle2', 'gloaming/observatory', 'home/echo-hall', 'home/grotto', 'home/summit']);          // (the views GV_SHOTS saves)
  const t = await open('?skip=1&preserve=1');
  const { ev, key } = t;
  await t.frame(30, 1 / 30);
  const bad = [], gates = [], realmGates = [];
  let n = 0, widest = 0, trips = 0, opened = false, openedRealm = false;
  for (const w of TRAVEL) {
    for (const place of travelPlaces(w.world)) {
      const before = await ev(() => ({ realm: __game.realm.id, hp: __game.sparx ? __game.sparx.hp : null, deaths: __game.stats.deaths }));
      await key('Escape');
      const s = await toConfirm(t, place);
      const away = before.realm !== place.world;
      const why = [];
      if (s.title !== 'ARE YOU SURE?' || s.sel !== 1 || s.labels.join() !== 'YES,NO') why.push(`confirm page (${s.title}, on ${s.labels[s.sel]})`);
      if (!s.extra || !s.extra.join(' ').includes(place.name)) why.push('the page does not name the place');
      if (!!(s.extra && s.extra.join(' ').includes('LEAVE')) !== away) why.push('the warning of leaving the world is wrong');
      if (s.extra) for (const l of s.extra) { const wd = measureText(l).w; widest = Math.max(widest, wd); if (wd > s.width - 20) why.push(`"${l}" is ${wd} px of ${s.width - 20}`); }
      await key('ArrowUp');
      await key('Enter');
      await arrived(t, place.world, place.key);
      if (away) { trips++; opened = false; openedRealm = false; }
      await t.frame(6, 1 / 30);
      const r0 = await here(ev, place);
      await t.frame(60, 1 / 30);
      // (the stack of a course of rings that is not flown yet: the gust comes after 1.6 s and carries him to the ledge, where he stands when the ride is over)
      const gust = await ev((place) => { const G = __game; if (!G.trials) return null; const q = G.trials.list.find((r) => r.t.kind === 'rings' && !r.done && Math.hypot(place.x - r.t.land.x, place.z - r.t.land.z) < r.t.land.r); return q ? { x: q.t.x, y: q.t.y, z: q.t.z } : null; }, place);
      if (gust) {
        for (let i = 0; i < 12 && !(await ev(() => !!__game.player.carry)); i++) await t.frame(8, 1 / 30);
        for (let i = 0; i < 30 && (await ev(() => !!__game.player.carry)); i++) await t.frame(8, 1 / 30);
        await t.frame(15, 1 / 30);
      }
      const r = await here(ev, gust ? { ...place, ...gust } : place);
      if (shots && SHOT_PLACES.has(place.key)) await t.shot('arrive-' + place.key.replace('/', '-'));
      if (!arrivalOk(r0, place, false)) why.push('arrival ' + describe(r0));
      if (!(r0.inv > 2.5 && r0.inv <= 3)) why.push(`no grace (${r0.inv.toFixed(2)} s)`);
      const hint = (r0.arrival && r0.arrival.hint) || '';
      if (!away && hint && !/DAWN GATE/.test(hint)) why.push(`a hop within the world repeats its hint (${hint})`);
      if (away && place.world === 'home' && !/REALMS RESTORED/.test(hint)) why.push('a trip into Dawnhaven brings no word of the realms');
      if (r0.banner !== place.name) why.push(`the banner was taken over by ${r0.banner} (a realm door beside him announcing itself)`);
      if (!(r.grounded && !r.dead && r.off < 0.9 && Math.abs(r.dy) < 0.6 && r.fade < 0.05)) why.push(`not standing there after 2 s (${describe(r)} grounded ${r.grounded}, fade ${r.fade.toFixed(2)})`);
      if (!away && before.hp !== null && r.hp !== before.hp) why.push(`hurt (hp ${before.hp} > ${r.hp})`);
      if (r.deaths !== (away ? 0 : before.deaths)) why.push(`died (${r.deaths})`);
      // the Dawn Gate: shut until a place inside its ward opens it (and then open for the rest of that visit to the vale)
      if (r.gate && place.world === 'gloaming') {
        const inside = await ev((place) => { const S = __game.level.summit; return !!S && Math.hypot(place.x - S.x, place.z - S.z) < 42; }, place);
        if (inside) { gates.push(place.key); if (r.gateShut) why.push('inside the ward, and the Dawn Gate is still shut'); if (!/DAWN GATE/.test(r.hint || '') && !opened) why.push(`no hint that the gate was opened (${r.hint})`); opened = true; }
        else if (!opened && r.gateShut === false) why.push('the Dawn Gate was opened by a place outside its ward');
      }
      // a realm's own gate (the ice gate of Frostbloom Hollow): shut until a place beyond it (`opens`) is gone to, which opens it for him, with a hint saying so
      if (r.gate && place.world !== 'gloaming' && place.world !== 'home') {
        if (place.opens) { realmGates.push(place.key); if (r.gateShut) why.push('beyond the gate, and the gate is still shut'); if (!/GATE WAS OPENED/.test(r.hint || '') && !openedRealm) why.push(`no hint that the gate was opened (${r.hint})`); openedRealm = true; }
        else if (!openedRealm && r.gateShut === false) why.push('the gate was opened by a place that is not beyond it');
      }
      n++;
      if (why.length) bad.push(`${place.key}: ${why.join('; ')}`);
    }
  }
  const total = TRAVEL.reduce((a, w) => a + travelPlaces(w.world).length, 0);
  check(`every place of the list (${n} of ${total}) was gone to through the menu pages: asked ARE YOU SURE? on NO, took him there, he stands on it`, bad.length === 0 && n === total, bad.length ? bad.join('\n      ') : `(${trips} trip(s) between the worlds, the rest hops; the widest line of text ${widest} px)`);
  check('the places inside the Dawn Gate\'s ward (and only those) opened the gate for him', gates.join() === 'gloaming/observatory,gloaming/beacon-room', `(${gates.join(', ')})`);
  const beyond = TRAVEL.filter((w) => w.world !== 'gloaming' && w.world !== 'home').flatMap((w) => travelPlaces(w.world).filter((p) => p.opens).map((p) => p.key));
  check('the places of a realm that lie beyond its gate (and only those) opened it for him', realmGates.join() === beyond.join() && beyond.length > 0, `(${realmGates.join(', ')})`);
  await t.ctx.close();
}

// ---- part 4: the mouse on a desktop window --------------------------------------------------------------------------------------------------------
if (wanted('mouse')) {
  const t = await open('?preserve=1');
  const { ev, page } = t;
  /** the pixel of row `label` of the open page, and the panel's, from the game's own layout (CSS px) */
  const rowAt = (label) => ev((label) => {
    const app = __app, m = app.menu, pix = app.gfx.hud, f = app.gfx.frameCss(), pg = m.stack[m.stack.length - 1];
    const items = pg.items.filter((it) => !it.hidden || !it.hidden()), L = m.layout(pix.w, pix.h, pg, items), i = items.findIndex((it) => it.label === label);
    return { x: f.left + (L.x + L.w / 2) * f.unit, y: f.top + (L.rows0 - 2 + (i + 0.5) * L.rowH) * f.unit, out: { x: f.left + Math.max(2, L.x - 20) * f.unit, y: f.top + (L.y + 5) * f.unit }, i };
  }, label);
  const click = async (x, y) => { await page.mouse.move(x, y); await t.frame(2); await page.mouse.down(); await page.mouse.up(); await t.frame(3); };
  const clickRow = async (label) => { const p = await rowAt(label); if (p.i < 0) throw new Error('no row ' + label); await click(p.x, p.y); return menuNow(ev); };
  await t.key('Escape');
  await ev(() => { window.__keep = __game; });
  let s = await clickRow('TRAVEL');
  check('mouse: a click on TRAVEL opens the worlds', s.title === 'TRAVEL TO', `(${s.title})`);
  s = await clickRow('DAWNHAVEN');
  s = await clickRow('LAKE AND CANYON');
  check('mouse: ... the groups, and the places', s.title === 'LAKE AND CANYON' && s.labels.includes('TIDEGLASS PIER'), `(${s.title}: ${s.labels.join(' / ')})`);
  s = await clickRow('TIDEGLASS PIER');
  check('mouse: ... a click on a place asks ARE YOU SURE? (the world is the other one: it says so)', s.title === 'ARE YOU SURE?' && s.extra.join(' ').includes('LEAVE'), `(${s.title})`);
  s = await clickRow('NO');
  check('mouse: a click on NO goes back, no trip', s.title === 'LAKE AND CANYON' && !s.travel && s.state === 'title-options', `(${s.title}, ${s.state})`);
  await clickRow('TIDEGLASS PIER');
  const o = await rowAt('YES');
  await click(o.out.x, o.out.y);                                 // a click outside the panel goes back (NO)
  s = await menuNow(ev);
  check('mouse: a click outside the panel on ARE YOU SURE? is NO, too', s.title === 'LAKE AND CANYON' && !s.travel && s.state === 'title-options', `(${s.title}, ${s.state})`);
  await clickRow('TIDEGLASS PIER');
  const y = await rowAt('YES');
  await click(y.x, y.y);
  const st = await ev(() => ({ state: __app.state, locked: !!(document.pointerLockElement || __game.input.locked) }));
  check('mouse: a click on YES starts the trip (the title menu is closed)', st.state === 'traveling', JSON.stringify(st));
  await arrived(t, 'home');
  await t.frame(60, 1 / 30);
  const r = await here(ev, placeOf('home/pier-end'));
  const gone = await ev(() => window.__keep !== __game && window.__keep.disposed);
  check('mouse: he is on the Tideglass Pier in Dawnhaven (on the pier, not the water below it), a fresh world', arrivalOk(r, placeOf('home/pier-end'), true) && r.grounded && gone, describe(r));
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
  /** a tap on the picture, outside the panel (the panel is centred: the picture's left edge is clear of it): goes back one page */
  const outside = async () => { const R = await rowsOf(ev); await tap(R.frame.left + 12, (R.frame.top + R.frame.bottom) / 2); return rowsOf(ev); };
  let R = await rowsOf(ev);
  await tap(R.button.x, R.button.y);                                   // (the MENU button)
  R = await rowsOf(ev);
  check(`${label}: the title menu (with VISIT DAWNHAVEN, as after a restored realm) has TRAVEL, and it is tappable`, R.title === 'MENU' && R.labels.includes('TRAVEL') && R.labels.includes('VISIT DAWNHAVEN') && tappable(R), rowLine(R));
  await ev(() => { window.__keep = __game; window.__pos0 = [__game.player.x, __game.player.z]; });
  R = await press('TRAVEL');
  check(`${label}: the worlds`, R.title === 'TRAVEL TO' && R.labels.length === TRAVEL.length && tappable(R), rowLine(R));
  await t.shot(`${shotName}-worlds`);
  // every page of the lists is finger-sized and fits, from a tap on the world to the places of each group (a tap outside the panel goes back one page)
  const sizes = [];
  for (const w of TRAVEL) {
    R = await press(w.name);
    if (!(R.title === w.name && tappable(R))) sizes.push(rowLine(R));
    for (const g of w.groups) {
      R = await press(g.name);
      if (!(R.title === g.name && R.labels.length === g.places.length && tappable(R))) sizes.push(rowLine(R));
      R = await outside();                                          // (outside the panel: back to the groups)
      if (R.title !== w.name) sizes.push(`a tap outside did not go back from ${g.name} (on ${R.title})`);
    }
    R = await outside();
    if (R.title !== 'TRAVEL TO') sizes.push(`a tap outside did not go back from ${w.name} (on ${R.title})`);
  }
  check(`${label}: every page of worlds, groups and places is finger-sized (34 px a row or more) and inside the picture, clear of the MENU button, and a tap outside goes back`, sizes.length === 0, sizes.join('; '));

  // the summit of Dawnhaven (a trip to the other world), asked first: a tap on NO, and a tap outside, are both NO
  R = await press('DAWNHAVEN');
  R = await press('UP AND AWAY');
  R = await press('THE SUMMIT');
  check(`${label}: ARE YOU SURE? is tappable: YES and NO finger-sized, the four lines of text inside the picture, clear of the button`, R.title === 'ARE YOU SURE?' && R.labels.join() === 'YES,NO' && tappable(R), rowLine(R));
  await t.shot(`${shotName}-confirm`);
  R = await press('NO');
  check(`${label}: a tap on NO goes back to the places, no trip`, R.title === 'UP AND AWAY' && !R.travel && R.state === 'title-options' && (await ev(() => window.__keep === __game)), `(${R.title}, ${R.state})`);
  R = await press('THE SUMMIT');
  R = await outside();
  check(`${label}: a tap outside the panel on ARE YOU SURE? is NO, too`, R.title === 'UP AND AWAY' && !R.travel && R.state === 'title-options', `(${R.title}, ${R.state})`);
  R = await press('THE SUMMIT');
  R = await press('YES');
  check(`${label}: a tap on YES starts the trip`, R.state === 'traveling' && R.depth === 0, `(${R.state}, ${R.depth} pages open)`);
  await arrived(t, 'home');
  await t.frame(60, 1 / 30);
  let r = await here(ev, placeOf('home/summit'));
  check(`${label}: he is on the Summit in Dawnhaven (a floor 35 m up, on the crag), playing, the buttons back`, arrivalOk(r, placeOf('home/summit'), true) && r.grounded && (await ev(() => __game.input._pads.style.display !== 'none' && __game.input.menuBtn.style.display !== 'none')), describe(r));

  // the pause menu on the phone: TRAVEL is a row (six finger-sized rows), and a hop within the world he is in keeps it
  await ev(() => { window.__keep = __game; __game.stats.gems = 5; });
  R = await rowsOf(ev);
  await tap(R.button.x, R.button.y);
  R = await rowsOf(ev);
  check(`${label}: the pause menu has TRAVEL and is tappable (six rows)`, R.title === 'PAUSED' && R.labels.includes('TRAVEL') && R.labels.length === 6 && tappable(R), rowLine(R));
  R = await press('TRAVEL');
  R = await press('DAWNHAVEN');
  R = await press('THE COUNTRY');
  R = await press('LANDING COVE');
  const lines = await menuNow(ev);
  check(`${label}: ... in the same world ARE YOU SURE? has no warning of leaving it`, R.title === 'ARE YOU SURE?' && !lines.extra.join(' ').includes('LEAVE') && tappable(R), rowLine(R));
  await t.shot(`${shotName}-confirm-same`);
  await press('YES');
  await arrived(t, 'home');
  await t.frame(60, 1 / 30);
  r = await here(ev, placeOf('home/cove'));
  const kept = await ev(() => ({ same: window.__keep === __game, gems: __game.stats.gems, pads: __game.input._pads.style.display !== 'none' }));
  check(`${label}: a hop: he is at the Landing Cove, the world and the 5 gems are kept, the thumb controls are back`, arrivalOk(r, placeOf('home/cove'), true) && kept.same && kept.gems === 5 && kept.pads && r.grounded, describe(r) + ` ${JSON.stringify(kept)}`);
  await t.ctx.close();
}
if (wanted('touch')) await phone('phone landscape', { width: 844, height: 390 }, 'phone-landscape');
if (wanted('portrait')) await phone('phone portrait', { width: 390, height: 844 }, 'phone-portrait');

check('no page errors, no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall travel tests passed');
process.exit(failed ? 1 : 0);
