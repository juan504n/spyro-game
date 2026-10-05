// Every way of putting the hero somewhere leaves him standing, in the running game, in every world: a fresh start, each place of the TRAVEL menu (a hop within the world), a respawn at the start's
// checkpoint and at the checkpoint of every goal, and a set-back that would take him again. "Standing" is tools/lib/standing.mjs: grounded and alive, his feet on the floor the collision layer says is
// under him, over the water, no drowning hint on the screen - and where he was put is where he is, two seconds later (a place that drowns him sets him back to itself).
//
// Round twenty-five's lesson: Dawnhaven's arrival for Tideglass Reach had no height, so the game put the hero on the bed of the lake and he drowned there for ever; every test of the arrival compared where
// he stood on the map. The doors are asked in tools/portal-test.mjs and tools/realm-test.mjs (tools/lib/homecoming.mjs); the other ways are asked here.
//   node tools/arrival-test.mjs [world ...]     (needs the dev server on :5173, GV_HMR=0 recommended; GV_URL=http://127.0.0.1:PORT/ tests another server, e.g. a scratch checkout's)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { standing, standOk } from './lib/standing.mjs';

const BASE = process.env.GV_URL || 'http://127.0.0.1:5173/';
const WORLDS = process.argv.slice(2).length ? process.argv.slice(2) : ['gloaming', 'home', 'frostbloom', 'emberfall', 'skyweaver', 'tideglass', 'guardian'];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message.slice(0, 300)); });
page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|GL Driver/.test(m.text())) { errors.push(m.text()); console.log('[error]', m.text().slice(0, 300)); } });

const ev = (fn, arg) => page.evaluate(fn, arg);
const ff = (sec) => ev((s) => { for (let t = 0; t < s; t += 1 / 30) window.__app.update(1 / 30); }, sec);
const load = async (query) => {
  await page.goto(BASE + query + (query.includes('?') ? '&' : '?') + 'preserve=1');
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });
  const err = await ev(() => window.__error);
  if (err) throw new Error('boot error: ' + String(err).slice(0, 300));
  await page.focus('canvas').catch(() => {});
  await ff(0.5);
};
let failed = 0;
const check = async (name, fn) => {
  const t0 = Date.now();
  let r;
  try { r = await fn(); } catch (e) { r = { ok: false, reason: 'exception ' + String(e.message).slice(0, 240) }; }
  if (!(r && r.ok)) failed++;
  console.log((r && r.ok ? 'PASS' : 'FAIL').padEnd(5), name.padEnd(34), JSON.stringify(r).slice(0, 900), `(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
};
/** run the app's clock until the trip is over (a hop within a world needs no loading) */
const settle = async () => {
  for (let i = 0; i < 60; i++) { await ff(0.25); if (await ev(() => window.__app.state === 'play' && !window.__app.travel)) return; }
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

for (const id of WORLDS) {
  await load(`?world=${id}&skip=1`);
  await ff(2);

  // a fresh start
  await check(`${id}: a fresh start`, async () => {
    const r = await standing(ev), s = await ev(() => { const sp = window.__game.gameplay.spawn || window.__game.level.spawn; return [sp.x, 0, sp.z]; });
    return { ok: standOk(r) && dist(r.at, s) < 0.5 && r.trail[0] === 'STARTED', ...r, spawn: s };
  });

  // every place of the TRAVEL menu, by hop (the trip of the menu: the screen blinks, nothing is rebuilt)
  const places = await ev(async (w) => { const { travelPlaces } = await import('/src/game/travel.js'); return travelPlaces(w).map((p) => ({ key: p.key, x: p.x, z: p.z })); }, id);
  await check(`${id}: all ${places.length} places of the TRAVEL menu`, async () => {
    const bad = [];
    for (const p of places) {
      await ev(async (key) => { const { findPlace } = await import('/src/game/travel.js'); window.__app.warpTo(findPlace(key)); }, p.key);
      await settle();
      await ff(2);                                                    // (two seconds of standing there)
      // (a place on the stack of a course of rings that is not flown yet is one the gust comes to: after 1.6 s he is carried to the ledge, and it is there that he stands when the ride is over)
      const land = await ev(() => (window.__game.trials ? window.__game.trials.list.filter((q) => q.t.kind === 'rings' && !q.done).map((q) => ({ pad: [q.t.x, 0, q.t.z], at: [q.t.land.x, 0, q.t.land.z], r: q.t.land.r })) : []));
      const gust = land.find((q) => dist([p.x, 0, p.z], q.at) < q.r);
      if (gust) for (let i = 0; i < 16 && !(await ev(() => !!window.__game.player.carry)); i++) await ff(0.25);
      for (let i = 0; i < 60 && (await ev(() => !!window.__game.player.carry)); i++) await ff(0.25);
      await ff(0.5);
      let r = await standing(ev);
      // (a place inside a siege's ring is one where its Snuffers may land a blow just as the three seconds of grace run out: the knock is waited out, and he is asked to stand when he has come down)
      for (let i = 0; i < 12 && !r.grounded && r.trail[r.trail.length - 1] === 'HURT'; i++) { await ff(0.15); r = await standing(ev); }
      const want = gust ? gust.pad : [p.x, 0, p.z];
      if (!(standOk(r) && dist(r.at, want) < 0.6)) bad.push({ key: p.key, at: r.at, floor: r.floor, kind: r.kind, water: r.water, grounded: r.grounded, trail: r.trail });
    }
    return { ok: places.length > 0 && bad.length === 0, places: places.length, bad: bad.slice(0, 4), nBad: bad.length };
  });

  // a respawn: at the checkpoint the world began with, and at the checkpoint of every goal but the last (the last one is the finale)
  await check(`${id}: a respawn at his checkpoint`, async () => {
    await ev(() => { const g = window.__game; g.player.place(g.player.x + 3, g.player.y, g.player.z + 3, 0); g.player.kill(); });
    await ff(5);
    const r = await standing(ev), c = await ev(() => { const g = window.__game; return [g.checkpoint.x, 0, g.checkpoint.z]; });
    return { ok: standOk(r) && dist(r.at, c) < 0.6, ...r, checkpoint: c };
  });
  const goals = await ev(() => (window.__game.beacons ? window.__game.beacons.list.length : 0));
  if (goals > 1) {
    await check(`${id}: a respawn at each of ${goals - 1} goals' checkpoints`, async () => {
      const bad = [];
      for (let i = 0; i < goals - 1; i++) {
        // (the Snuffers are sent away first: a hero set back beside one can be struck and thrown a few metres, and this is about where he is put, not about the fight he is put into)
        await ev((k) => { const g = window.__game; for (const e of g.enemies.list.slice()) g.enemies._remove(e, g.enemies.list.indexOf(e)); g.beacons.ignite(g.beacons.list[k]); g.player.invulnT = 0; g.player.kill(); }, i);
        await ff(5);
        const r = await standing(ev), c = await ev(() => { const g = window.__game; return [g.checkpoint.x, 0, g.checkpoint.z]; });
        if (!(standOk(r) && dist(r.at, c) < 0.6)) bad.push({ goal: i, at: r.at, floor: r.floor, checkpoint: c, trail: r.trail });
      }
      return { ok: bad.length === 0, bad: bad.slice(0, 3) };
    });
  }

  // a set-back that would take him again: put him in the deep with his safe spot there (what place() does), and he is set back at the start of the world, once, and stands there dry
  await check(`${id}: a safe spot that takes him again`, async () => {
    await load(`?world=${id}&skip=1`);
    await ff(1);
    const put = await ev(() => {
      const g = window.__game, p = g.player, grid = g.grid, lethal = p.lethalDepth;
      let best = null;
      for (let x = -grid.half + 10; x < grid.half - 10; x += 6) for (let z = -grid.half + 10; z < grid.half - 10; z += 6) {
        const sup = g.collision.support(x, z, grid.heightAt(x, z) + 0.5, 0.9);
        if (sup.kind === 'terrain' && g.waterY - sup.y > lethal + 0.6 && Math.hypot(x - 0, z - 0) < grid.half - 30) { const d = Math.hypot(x - p.x, z - p.z); if (!best || d < best.d) best = { x, z, y: sup.y, d }; }
      }
      if (!best) return null;
      p.place(best.x, best.y + 0.05, best.z, 0);
      return { x: best.x, z: best.z, y: best.y };
    });
    if (!put) return { ok: true, skipped: 'this world has no water deep enough to drown in' };
    await ff(3);
    const r = await standing(ev), sp = await ev(() => { const g = window.__game, s = g.gameplay.spawn || g.level.spawn; return [s.x, 0, s.z]; }), drowns = await ev(() => { const e = window.__game.trail.find((q) => q.text === 'SET BACK'); return e ? e.n : 0; });          // (set back: by the drowning, or by the kill plane under a sea of cloud)
    return { ok: standOk({ ...r, hint: null }) && dist(r.at, sp) < 0.6 && drowns === 1, ...r, setBacks: drowns, start: sp, from: put };          // (the hint of the one drowning is still on the screen: the count is what says it was once)
  });
}

await check('no errors in the page', async () => ({ ok: errors.length === 0, errors: errors.slice(0, 3) }));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall arrival checks passed');
process.exit(failed ? 1 : 0);
