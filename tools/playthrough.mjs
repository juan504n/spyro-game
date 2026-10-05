// Full story playthrough with the real controller (fast-forwarded, no rendering): every beacon, the brazier puzzle,
// the sky-isle glide chain, the Dawn Gate barrier, the observatory climb and the sunrise finale.
// Usage: node tools/playthrough.mjs    — needs the dev server on :5173 (GV_HMR=0 recommended; GV_URL=file:///.../docs/index.html tests a built file instead)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
await page.goto((process.env.GV_URL || 'http://127.0.0.1:5173/') + '?skip=1&preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
await page.addScriptTag({ path: path.join(here, 'bot-inject.js') });
await page.addScriptTag({ path: path.join(here, 'lib/trial-driver.js') });
await page.evaluate(() => window.__trialDriver.load());
await page.waitForTimeout(1200);

const stage = async (name, fn) => {
  const t0 = Date.now();
  let r;
  try { r = await page.evaluate(fn); } catch (e) { r = { ok: false, reason: 'exception ' + e.message.slice(0, 300) }; }
  console.log((r && r.ok ? 'PASS' : 'FAIL').padEnd(5), name.padEnd(22), JSON.stringify(r), `(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  return !!(r && r.ok);
};

// shared helpers live on window so every stage can use them
await page.evaluate(() => {
  const G = () => __game;
  window.__pt = {
    /** walk to within 3.2 of (x,z), turn to face it and breathe fire until `until()` is true or frames run out */
    burn(x, z, until, o = {}) {
      const p = G().player;
      const r = __bot.goto(x, z, { tol: o.tol ?? 3.2, timeout: o.timeout ?? 25, auto: o.auto !== false });
      if (!r.ok) return { ok: false, phase: 'approach', ...r };
      for (let i = 0; i < 240 && !until(); i++) {
        p.yaw = Math.atan2(x - p.x, z - p.z);
        __bot.ctl.mx = __bot.ctl.my = 0;
        __bot.ctl.flame = true;
        if (i % 12 === 0) __bot.edge('flame');
        __bot.tick();
      }
      __bot.ctl.flame = false; __bot.tick(2);
      return { ok: !!until() };
    },
    /** follow a list of [x,z] waypoints */
    route(pts, o = {}) {
      for (const [x, z] of pts) {
        const r = __bot.goto(x, z, { tol: o.tol ?? 1.8, timeout: o.timeout ?? 14, auto: o.auto !== false, glide: !!o.glide });
        if (!r.ok) return { ok: false, at: [+x.toFixed(1), +z.toFixed(1)], ...r };
      }
      return { ok: true };
    },
    beacon: (id) => G().beacons.get(id),
    /** the trial that seals a lantern (the Vale has three: tools/lib/trial-driver.js plays it with the real controller from where it begins) */
    trial(goal, o = {}) {
      const t = __trialDriver.trials().find((q) => q.goal === goal);
      if (!t) return { ok: false, reason: `no trial seals '${goal}'` };
      const p = G().player, was = { x: p.x, y: p.y, z: p.z, yaw: p.yaw };
      const r = __trialDriver.solve(t.id, { T: 240, ...o });
      __bot.place(was.x, was.z, was.yaw, was.y);                     // (and he is where he was: the trial was a visit)
      return { ...r, trial: t.id };
    },
  };
});

await page.evaluate(() => __bot.god());
const results = [];
const run = async (n, f) => { results.push(await stage(n, f)); };

await run('1 hearth beacon', () => {
  const G = __game, b = __pt.beacon('hearth');
  __bot.place(G.level.spawn.x, G.level.spawn.z, Math.PI);
  const r = __bot.follow('main', 0, 0.5, 4);
  if (!r.ok) return { ...r, phase: 'main road' };
  const f = __pt.burn(b.x, b.z, () => b.litFlag, { tol: 4 });
  return { ...f, lit: G.stats.beacons, day: +G.dayTarget.toFixed(2) };
});

await run('2a the bells by the pier', () => {              // (the isle's lantern is sealed: the bells play, and the hero answers them)
  const G = __game, b = __pt.beacon('isle');
  const sealed = b.sealed === true;
  const f = __pt.trial('isle');
  return { ...f, sealedBefore: sealed, sealedAfter: b.sealed === true, lit: G.stats.beacons, ready: !!b.ready };
});

await run('2 isle beacon', () => {
  const G = __game, L = G.level, b = __pt.beacon('isle');
  __bot.place(-4, 74, Math.PI);
  const pads = G.gameplay.placed.filter((p) => p.name === 'stepping_stone').sort((a, b) => b.z - a.z);   // the lily-pad crossing, the dock's end first
  const r = __pt.route([[-4, 68], ...pads.map((p) => [p.x, p.z]), [-3.7, 33.5]], { tol: 1.4, timeout: 12 });
  if (!r.ok) return { ...r, phase: 'stones' };
  const f = __pt.burn(b.x, b.z, () => b.litFlag, { tol: 3.4 });
  return { ...f, lit: G.stats.beacons, day: +G.dayTarget.toFixed(2) };
});

await run('3 mill braziers', () => {
  const G = __game;
  const q = G.grid.paths.find((p) => p.id === 'mill').pts[0];
  __bot.place(q[0], q[2], 0);
  const brs = G.objects.braziers;
  // walk the spiral; when a brazier comes within reach, light it
  const path = G.grid.paths.find((p) => p.id === 'mill');
  const log = [];
  for (let i = 0; i < path.pts.length; i += 3) {
    const pt = path.pts[i];
    const r = __bot.goto(pt[0], pt[2], { tol: 2.2, timeout: 12 });
    if (!r.ok) return { ok: false, phase: 'spiral', i, ...r };
    for (const b of brs) {
      if (!b.lit && Math.hypot(G.player.x - b.x, G.player.z - b.z) < 9) {
        const f = __pt.burn(b.x, b.z, () => b.lit, { tol: 3.0 });
        log.push(f.ok ? 'lit' : 'MISS');
      }
    }
  }
  return { ok: brs.every((b) => b.lit), lit: brs.filter((b) => b.lit).length, of: brs.length, log };
});

await run('3b the thief of the east meadow', () => {      // (the mill's lantern is sealed: a Pilferling has run off with its key)
  const G = __game, b = __pt.beacon('mill');
  const sealed = b.sealed === true;
  const f = __pt.trial('mill');
  return { ...f, sealedBefore: sealed, sealedAfter: b.sealed === true, lit: G.stats.beacons, ready: !!b.ready };
});

await run('4 mill stair + beacon', () => {
  const G = __game, L = G.level, W = L.windHill, b = __pt.beacon('mill');
  // tower-local -> world (same transform as ctx.anchor)
  const yaw = Math.atan2(88 - W.x, 46 - W.z), c = Math.cos(yaw), s = Math.sin(yaw);
  const wp = (lx, lz) => [W.x + lx * c + lz * s, W.z - lx * s + lz * c];
  for (let k = 0; k < 90 && G.objects.portcullis.open < 0.6; k++) __bot.tick(10);   // let the portcullis finish rising
  // ... and the bars must really have gone up: the collider opened on its own while the grate never moved (a door you walk through)
  for (let k = 0; k < 60 && !(G.objects.portcullis.model.raised > 0.95); k++) __bot.tick(10);
  if (!(G.objects.portcullis.model.raised > 0.95)) return { ok: false, phase: 'portcullis bars still on the door', raised: G.objects.portcullis.model.raised, open: +G.objects.portcullis.open.toFixed(2) };
  const pts = [];
  for (let phi = 50; phi <= 200; phi += 10) { const r = 8.55, a = (phi * Math.PI) / 180; pts.push(wp(r * Math.sin(a), r * Math.cos(a))); }
  { const a = (195 * Math.PI) / 180; pts.push(wp(6.4 * Math.sin(a), 6.4 * Math.cos(a))); }   // step in from the last tread onto the balcony ring
  const ground = G.grid.heightAt(W.x, W.z);
  const trace = [];
  for (const [x, z] of pts) {
    const r = __bot.goto(x, z, { tol: 1.6, timeout: 10 });
    trace.push(+(G.player.y - ground).toFixed(1));
    if (!r.ok) return { ok: false, phase: 'stair', reason: r.reason, portcullis: +G.objects.portcullis.open.toFixed(2), trace };
  }
  if (G.player.y < ground + 8.5) return { ok: false, phase: 'stair did not climb', y: +(G.player.y - ground).toFixed(1), trace };
  const near = wp(-1.6, -5.4);
  const w = __bot.goto(near[0], near[1], { tol: 1.0, timeout: 8 });
  const yBalcony = +(G.player.y - ground).toFixed(1);
  if (!w.ok) return { ok: false, phase: 'balcony', yBalcony, ...w };
  const f = __pt.burn(b.x, b.z, () => b.litFlag, { tol: 6, timeout: 10 });
  return { ...f, yBalcony, y: +(G.player.y - ground).toFixed(1), pos: [+G.player.x.toFixed(1), +G.player.z.toFixed(1)], beacon: [+b.x.toFixed(1), +b.y.toFixed(1), +b.z.toFixed(1)], lit: G.stats.beacons };
});

await run('5 sky isles + beacon', () => {
  const G = __game, L = G.level, p = G.player, b = __pt.beacon('sky');
  const M = L.mesa;
  __bot.place(M.x, M.z, 0, M.h);
  const legs = [{ near: [M.x, M.z, M.r + 6], to: L.isles[0] }];
  L.isles.slice(0, 3).forEach((I, k) => legs.push({ near: [I.x, I.z, I.r + 2], to: L.isles[k + 1] }));
  for (const leg of legs) {
    const mu = G.gameplay.mushrooms.find((m) => Math.hypot(m.x - leg.near[0], m.z - leg.near[1]) < leg.near[2]);
    if (!mu) return { ok: false, reason: 'no mushroom', to: leg.to.id };
    if (!__bot.goto(mu.x, mu.z, { tol: 6.2, timeout: 15, auto: false }).ok) return { ok: false, phase: 'walk', to: leg.to.id };
    __bot.goto(mu.x, mu.z, { tol: 0.5, timeout: 4, auto: false, jumpNow: true });
    let bounced = false;
    for (let i = 0; i < 90 && !bounced; i++) { __bot.ctl.jump = true; __bot.tick(); bounced = p.vy > 20; }
    __bot.ctl.jump = false;
    if (!bounced) return { ok: false, reason: 'no bounce', to: leg.to.id };
    __bot.goto(leg.to.x, leg.to.z, { tol: 3.5, timeout: 14, auto: false, glide: true });
    for (let i = 0; i < 150 && !p.grounded && !p.dead; i++) __bot.tick();
    if (!(p.grounded && Math.abs(p.y - leg.to.y) < 3)) return { ok: false, reason: 'missed isle', to: leg.to.id, y: +p.y.toFixed(1) };
  }
  const f = __pt.burn(b.x, b.z, () => b.litFlag, { tol: 3.4 });
  return { ...f, lit: G.stats.beacons };
});

await run('6 barrier opens', () => {
  const G = __game;
  for (let i = 0; i < 400 && G.objects.barrier.c.solid; i++) __bot.tick(6);
  return { ok: !G.objects.barrier.c.solid, open: +G.objects.barrier.open.toFixed(2), beacons: G.stats.beacons, day: +G.day.toFixed(2) };
});

await run('6b the siege at the foot of the mountain', () => {         // (the Dawn lantern is sealed: its waves must be seen off first)
  const G = __game, b = __pt.beacon('dawn');
  const sealed = b.sealed === true;
  const f = __pt.trial('dawn');
  return { ...f, sealedBefore: sealed, sealedAfter: b.sealed === true, lit: G.stats.beacons, ready: !!b.ready };
});

await run('7 summit road', () => {
  const G = __game;
  const g = G.level.gate;
  __bot.place(g.x, g.z + 12, 0);
  return __bot.follow('summit', 0, 1, 3);
});

await run('8 observatory + finale', () => {
  const G = __game, S = G.level.summit, b = __pt.beacon('dawn');
  // climb the observatory stair (1.1 turns, mid radius) starting from the summit road's end
  const pts = [];
  // the stair is entered tangentially from the ring: walk in on the ring first, then follow the treads
  for (const phi of [340, 355]) { const a = (phi * Math.PI) / 180; pts.push([S.x + 8.7 * Math.sin(a), S.z + 8.7 * Math.cos(a)]); }
  for (let phi = 20; phi <= 425; phi += 10) { const a = (phi * Math.PI) / 180, r = 8.7; pts.push([S.x + r * Math.sin(a), S.z + r * Math.cos(a)]); }
  const r = __pt.route(pts, { tol: 1.7, timeout: 10 });
  if (!r.ok) return { ...r, phase: 'stair', y: +G.player.y.toFixed(1) };
  const f = __pt.burn(b.x, b.z, () => b.litFlag, { tol: 3.0, timeout: 12 });
  for (let i = 0; i < 40; i++) __bot.tick(10);
  return { ...f, y: +G.player.y.toFixed(1), beacons: G.stats.beacons, mode: G.mode, appState: __app.state };
});

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} stages passed`);
process.exit(passed === results.length ? 0 : 1);
