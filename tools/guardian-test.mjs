// The whole of the last chapter played in the running game, with the real app, the real controller and the real clock: the fifth realm is restored and the hero comes home to Dawnhaven, where the Guardian's
// Gate opens as a moment (the field dissolves, a door of light is lit, a beam climbs into the sky), the Elder says so, the hero walks into the light and stands in the Court, the Guardian is fought to the end
// by the player of tools/lib/duel.mjs, the ending plays (the speech, the credits, the results), the way home is walked, Dawnhaven says the Guardian is free and its beam is gold, and the Court visited again is
// quiet. Between the steps the app's clock is run forward in 1/30 s steps so waiting does not take real time.
//   node tools/guardian-test.mjs        (needs the dev server on :5173, GV_HMR=0 recommended; GV_URL=http://127.0.0.1:PORT/ tests another server)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDriver } from './lib/boss-driver.mjs';
import { standing, standOk } from './lib/standing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.GV_URL || 'http://127.0.0.1:5173/';
const KEY = 'gloaming-vale/progress/v1';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message.slice(0, 300)); });
page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|GL Driver/.test(m.text())) { errors.push(m.text()); console.log('[error]', m.text().slice(0, 300)); } });
const ev = (fn, a) => page.evaluate(fn, a);
const ff = (sec) => ev((s) => { for (let t = 0; t < s; t += 1 / 30) (window.__appUpdate || window.__app.update.bind(window.__app))(1 / 30); }, sec);
let failed = 0;
const check = async (name, fn) => {
  const t0 = Date.now();
  let r;
  try { r = await fn(); } catch (e) { r = { ok: false, reason: 'exception ' + String(e.message).slice(0, 240) }; }
  if (!(r && r.ok)) failed++;
  console.log((r && r.ok ? 'PASS' : 'FAIL').padEnd(5), name.padEnd(34), JSON.stringify(r).slice(0, 700), `(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!(r && r.ok) && process.env.BAIL) { await browser.close(); process.exit(1); }
};
/** run the app until it is `play`ing in `realm` (a trip is over) */
const arrived = (realm, states = ['play']) => page.waitForFunction(([r, st]) => st.includes(window.__app.state) && !window.__app.travel && window.__game.realm.id === r && !window.__game.disposed, [realm, states], { timeout: 240000 });
const runUntil = async (cond, maxSec, step = 0.5) => { for (let t = 0; t < maxSec; t += step) { await ff(step); if (await ev(cond)) return true; } return false; };

// ---- a hero whose five realms burn, in the vale (a progress the way a finished game leaves it: the gate not yet seen) ---------------------------------------------------------------
const progress = { realms: Object.fromEntries(['gloaming', 'frostbloom', 'tideglass', 'emberfall', 'skyweaver'].map((id) => [id, { done: true, gems: 300, gemsTotal: 400, time: 600 }])), home: { visits: 5, secrets: [], gate: false }, guardian: { freed: false, gems: 0, gemsTotal: 0, time: 0, deaths: 0, hits: 0 } };
await page.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* none */ } }, [KEY, progress]);
await page.goto(BASE + '?world=gloaming&skip=1&preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });
await page.focus('canvas').catch(() => {});
await ff(0.5);

await check('home-from-the-last-realm', async () => {
  await ev(() => window.__app.travelTo('home', { from: 'tideglass' }));
  await arrived('home', ['play', 'ceremony']);
  await ff(0.3);
  return ev(() => {
    const g = window.__game, d = g.portals.get('guardian');
    return { ok: g.gateMode === 'ceremony' || g.gateMode === 'open', mode: g.gateMode, state: window.__app.state, hmode: g.mode, closed: d.state === 'closed', barrierShut: g.objects.barrier.c.solid, locked: g.locked, beam: +d.beamK.toFixed(2), saved: window.__app.progress.home.gate, lanterns: g.stats.beacons, total: g.stats.beaconsTotal };
  }).then((r) => ({ ...r, ok: r.state === 'ceremony' && r.hmode === 'ceremony' && r.closed && r.barrierShut && r.locked && r.beam === 0 && r.saved && r.lanterns === 5 && r.total === 5 }));
});

await check('the-gate-opens', async () => {
  const done = await runUntil(() => window.__app.state === 'play' && window.__game.mode === 'play', 40);
  const r = await ev(() => {
    const g = window.__game, d = g.portals.get('guardian'), p = g.player;
    return { state: window.__app.state, open: g.portals.isOpen('guardian'), barrierShut: g.objects.barrier.c.solid, beam: +d.beamK.toFixed(2), locked: g.locked || p.locked, cin: g.cam.inCinematic, hud: g.hud.visible, hint: g.hud.hintState && g.hud.hintState.text, saved: window.__app.progress.home.gate, arrival: Math.hypot(p.x - g.gameplay.arrivals.tideglass.x, p.z - g.gameplay.arrivals.tideglass.z), fade: +g.fade.a.toFixed(2) };
  });
  return { ok: done && r.open && !r.barrierShut && r.beam > 0.5 && !r.locked && !r.cin && r.hud && /GUARDIAN'S GATE IS OPEN/.test(r.hint || '') && r.saved && r.arrival < 1.5, ...r };
});

await check('the-elder-says-it', async () => {
  const r = await ev(() => { const g = window.__game, elder = g.npcs.npcs[0]; elder.talks = 0; return g.npcs.lines(elder).join(' '); });
  return { ok: /GUARDIAN'S GATE IS OPEN/.test(r) && /KEEP MOVING, RAM HIS FISTS/.test(r) && !/WILL OPEN WHEN/.test(r), say: r.slice(0, 200) };
});

await check('the-gate-seen-again-is-open-at-once', async () => {
  // (built again by the title's visit or a TRAVEL place: the gate stands open, with no ceremony and its door at rest)
  await ev(() => window.__app.travelTo('home', { from: null }));
  await arrived('home');
  await ff(1.0);
  const r = await ev(() => { const g = window.__game, d = g.portals.get('guardian'); return { mode: g.gateMode, state: window.__app.state, open: g.portals.isOpen('guardian'), barrierShut: g.objects.barrier.c.solid, beam: +d.beamK.toFixed(2), k: +(d.model.k ?? 1).toFixed(2), locked: g.locked }; });
  return { ok: r.mode === 'open' && r.state === 'play' && r.open && !r.barrierShut && r.beam > 0.95 && r.k > 0.95 && !r.locked, ...r };
});

await check('the-light-takes-him-to-the-court', async () => {
  // the hero is put 8 m in front of the gate looking at it, and walks into the light with the real key
  await ev(() => { const g = window.__game, b = g.gameplay.barrier, p = g.player; p.place(b.x, b.y + 0.05, b.z + 8, Math.PI); g.cam.snapBehind(p); p.invulnT = 5; g.checkpoint = { x: b.x, y: b.y, z: b.z + 8, yaw: Math.PI }; });
  await ff(0.6);
  await page.keyboard.down('KeyW');
  const gone = await runUntil(() => window.__app.state === 'traveling' || window.__game.portals.busy, 6, 0.25);
  await page.keyboard.up('KeyW');
  await arrived('guardian');
  await ff(1.0);
  const r = await ev(() => { const g = window.__game, p = g.player; return { realm: g.realm.id, kind: g.realm.kind, mode: g.mode, boss: g.boss.brain.mode, at: [+p.x.toFixed(1), +p.z.toFixed(1)], banner: g.hud.bannerState && g.hud.bannerState.title, total: g.stats.beaconsTotal, lanterns: g.stats.beacons, freed: g.freed }; });
  const s = await standing(ev);
  return { ok: gone && r.realm === 'guardian' && r.kind === 'arena' && r.mode === 'play' && r.boss === 'asleep' && Math.abs(r.at[1] - 93) < 1.5 && r.total === 3 && r.lanterns === 0 && !r.freed && standOk(s), ...r };
});

await check('the-fight-is-won', async () => {
  await installDriver(page, root);
  const walk = await ev(() => window.__bot.goto(0, 16, { tol: 2, timeout: 40, auto: true }));
  let last = null;
  for (let chunk = 0; chunk < 300; chunk++) {
    last = await ev(() => window.__fight.run(120, {}));
    if (last.mode === 'freed' || last.t > 400) break;
  }
  const log = await ev(() => window.__fight.log);
  return { ok: walk.ok && last.mode === 'freed' && log.lit === 3 && log.cracks >= 6, walked: walk.ok, mode: last.mode, t: last.t, hits: log.hits, deaths: log.deaths, cracks: log.cracks, lit: log.lit, kills: log.kills };
});

await check('the-ending-plays', async () => {
  const states = [];
  for (let i = 0; i < 400; i++) {
    const r = await ev(() => { for (let k = 0; k < 30; k++) { if (window.__game.hud.talking) window.__bot.edge('confirm'); if (window.__app.state === 'credits' || window.__app.state === 'endresults') { window.__bot.edge('confirm'); window.__game.input.uiEdge.confirm = true; } window.__appUpdate(1 / 60); } return { state: window.__app.state, mode: window.__game.mode }; });
    if (!states.length || states[states.length - 1] !== r.state) states.push(r.state);
    if (r.state === 'play' && r.mode === 'complete') break;
  }
  const end = await ev(() => { const pr = window.__app.progress, G = window.__game; return { freed: pr.guardian.freed, stored: JSON.parse(localStorage.getItem('gloaming-vale/progress/v1')).guardian.freed, deaths: pr.guardian.deaths, brain: G.boss.brain.mode, day: +G.day.toFixed(2), beams: +G.boss.beamK.toFixed(2), hud: G.hud.visible, locked: G.locked, lit: G.stats.beacons }; });
  return { ok: states.join('>') === 'ending>credits>endresults>play' && end.freed && end.stored && end.brain === 'freed' && end.day > 0.95 && end.beams > 0.9 && end.hud && !end.locked && end.lit === 3, states: states.join('>'), ...end };
});

// (the next day: the page is loaded again on the Court, and what the hero did is what the game remembers)
await check('the-court-the-next-day', async () => {
  await page.goto(BASE + '?world=guardian&preserve=1');
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });
  await page.focus('canvas').catch(() => {});
  await installDriver(page, root);
  const walk = await ev(() => window.__bot.goto(0, 16, { tol: 2, timeout: 40, auto: true }));
  await ev(() => { for (let i = 0; i < 300; i++) window.__appUpdate(1 / 60); });
  const r = await ev(() => { const g = window.__game, B = g.boss.brain; return { brain: B.mode, lit: B.lit, fists: B.fists.map((f) => f.state).join('/'), day: +g.day.toFixed(2), beams: +g.boss.beamK.toFixed(2), lanterns: g.stats.beacons, freed: g.freed, enemies: g.enemies.list.length, hits: g.boss.hitsTaken, hud: g.boss.hudState().show }; });
  return { ok: walk.ok && r.brain === 'freed' && r.lit === 3 && r.fists === 'gone/gone' && r.day > 0.95 && r.beams > 0.9 && r.lanterns === 3 && r.freed && r.enemies === 0 && !r.hud, walked: walk.ok, ...r };
});

await check('the-way-home', async () => {
  // free roam in the Court: he walks the gorge road to the door at its foot (a hundred metres) and into its light; the clock is the app's own
  const walk = await ev(() => window.__bot.goto(0, 101.5, { tol: 1.6, timeout: 60, auto: true }));
  await ev(() => { const g = window.__game, p = g.player; p.yaw = 0; g.cam.snapBehind(p); window.__bot.ctl.mx = 0; window.__bot.ctl.my = 1; });
  const went = await runUntil(() => window.__app.state === 'traveling', 8, 0.25);
  await ev(() => { window.__bot.ctl.my = 0; });
  const back = await runUntil(() => window.__game.realm.id === 'home' && window.__app.state === 'play' && !window.__app.travel, 90, 0.5);
  await ff(1.5);
  const r = await ev(() => {
    const g = window.__game, p = g.player, a = g.gameplay.arrivals.guardian, d = g.portals.get('guardian'), elder = g.npcs.npcs[0];
    elder.talks = 0;
    return { realm: g.realm.id, arrival: +Math.hypot(p.x - a.x, p.z - a.z).toFixed(2), open: g.portals.isOpen('guardian'), gold: d.done, beamK: +d.beamK.toFixed(2), mode: g.gateMode, words: g.npcs.lines(elder).join(' '), lanterns: g.stats.beacons, total: g.stats.beaconsTotal };
  });
  const s = await standing(ev);
  return { ok: walk.ok && went && back && r.realm === 'home' && r.arrival < 0.6 && r.open && r.gold && r.beamK > 0.9 && /THE GUARDIAN IS FREE/.test(r.words) && r.lanterns === 5 && r.total === 5 && standOk(s), walked: walk.ok, ...r, words: r.words.slice(0, 60) + '...' };
});

await check('no-errors-in-the-page', async () => ({ ok: errors.length === 0, errors: errors.slice(0, 3) }));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
