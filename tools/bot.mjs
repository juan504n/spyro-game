// Reachability QA: drives the real player controller headlessly through every road and objective route.
// Usage: node tools/bot.mjs [scenario ...]   (default: all)  — needs the dev server on :5173 (GV_HMR=0 recommended; GV_URL=file:///.../docs/index.html tests a built file instead)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const want = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
await page.goto((process.env.GV_URL || 'http://127.0.0.1:5173/') + '?skip=1&preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
await page.addScriptTag({ path: path.join(here, 'bot-inject.js') });
await page.waitForTimeout(1500);

let failed = 0;
const run = async (name, fn) => {
  if (want.length && !want.includes(name)) return;
  const t0 = Date.now();
  let r;
  try { r = await page.evaluate(fn); } catch (e) { r = { ok: false, reason: 'exception ' + e.message.slice(0, 200) }; }
  if (!(r && r.ok)) failed++;
  console.log((r && r.ok ? 'PASS' : 'FAIL').padEnd(5), name.padEnd(16), JSON.stringify(r), `(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
};

await page.evaluate(() => __bot.god());
await run('main-road', () => { __bot.place(0, 166, Math.PI); return __bot.follow('main', 0.02, 1, 4); });
await run('west-trail', () => { __bot.place(-3, 80, -1.6); return __bot.follow('west', 0.0, 1, 3); });
await run('east-trail', () => { __bot.place(0, 84, 1.6); return __bot.follow('east', 0.0, 1, 3); });
await run('mill-spiral', () => { const q = __game.grid.paths.find((p) => p.id === 'mill').pts[0]; __bot.place(q[0], q[2], 0); return __bot.follow('mill', 0.0, 1, 3); });
await run('ring-west', () => { __bot.place(-80, 62, 3.14); return __bot.follow('ringW', 0.0, 1, 3); });
await run('ring-east', () => { __bot.place(76, 58, 3.14); return __bot.follow('ringE', 0.0, 1, 3); });
await run('summit-road', () => { if (__game.objects.barrier) __game.objects.barrier.c.solid = false; __bot.place(0, -86, 0); return __bot.follow('summit', 0.0, 1, 3); });
await run('island-stones', () => {
  const G = __game, L = G.level;
  __bot.place(-4, 74, Math.PI);
  const pads = G.gameplay.placed.filter((p) => p.name === 'stepping_stone').sort((a, b) => b.z - a.z);   // the lily-pad crossing, the dock's end first
  const pts = [[-4, 68], ...pads.map((p) => [p.x, p.z]), [-3.7, 33.5], [L.island.x, L.island.z + 5]];     // (the shrine's monoliths ring the island: go through the gap they leave to the south)
  const out = [];
  for (const [x, z] of pts) { const r = __bot.goto(x, z, { tol: 1.4, timeout: 10 }); out.push(r.ok ? 'ok' : r.reason); if (!r.ok) return { ok: false, out, at: [x, z], ...__bot.state() }; }
  return { ok: true, out, end: __bot.state() };
});
await run('dock-hop', () => {
  // The lily-pad crossing has to be easy: from a standstill on the dock's far end (west edge, middle, east edge) one plain jump (no glide) lands on
  // the first pad, and the same from the near rim of each pad to the next one (and from the last pad to the island's beach).
  const G = __game, p = G.player;
  const pads = G.gameplay.placed.filter((q) => q.name === 'stepping_stone').sort((a, b) => b.z - a.z);
  const on = () => (p.dead ? 'dead' : p.grounded && p.groundKind === 'collider' && p.groundC && p.groundC.prop ? p.groundC.prop.name : p.grounded ? p.groundKind : 'air');
  const out = [];
  const hop = (label, x, z, y, tx, tz, want) => {
    __bot.place(x, z, Math.atan2(tx - x, tz - z), y);
    const r = __bot.goto(tx, tz, { tol: 1.4, timeout: 5, auto: false, jumpNow: true });
    for (let i = 0; i < 180 && !p.grounded && !p.dead; i++) __bot.tick();                // (goto returns once above the target: let it land)
    const at = on();
    out.push(`${label}: ${r.ok && at === want ? 'ok' : 'FAIL ' + (r.reason || at) + ' at ' + r.x + ',' + r.z}`);
    return r.ok && at === want;
  };
  let ok = true;
  for (const x of [-6.4, -4, -1.6]) ok = hop(`dock x${x}`, x, 66.9, 0.3, pads[0].x, pads[0].z, 'stepping_stone') && ok;
  const R = 3.0;                                                                        // (a start 0.4 m inside the rim of the pad)
  for (let i = 0; i < pads.length; i++) {
    const a = pads[i], b = pads[i + 1] || { x: -3.7, z: 33.5 };
    const d = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / d, uz = (b.z - a.z) / d;
    ok = hop(i + 1 < pads.length ? `pad ${i + 1} -> ${i + 2}` : `pad ${i + 1} -> island`, a.x + ux * R, a.z + uz * R, 0.45, b.x, b.z, i + 1 < pads.length ? 'stepping_stone' : 'terrain') && ok;
  }
  return { ok, out };
});
await run('mesa-launch', () => {
  const M = __game.level.mesa, i1 = __game.level.isles[0];
  const mu = __game.gameplay.mushrooms.find((m) => Math.hypot(m.x - M.x, m.z - M.z) < M.r + 6);
  const mx = mu.x, mz = mu.z;
  __bot.place(M.x, M.z, 0, M.h);
  const a = __bot.goto(mx, mz, { tol: 3.6, timeout: 15, auto: false });
  if (!a.ok) return { ok: false, phase: 'walk to mushroom', ...a };
  __bot.goto(mx, mz, { tol: 0.5, timeout: 4, auto: false, jumpNow: true });
  let maxY = 0;
  for (let i = 0; i < 90; i++) { __bot.tick(); maxY = Math.max(maxY, __game.player.y); }
  const s = __bot.state();
  return { ok: maxY > M.h + 5, maxY: +maxY.toFixed(1), pad: [+mx.toFixed(1), +mz.toFixed(1)], at: s };
});
await run('heron-point', () => {
  const G = __game, H = G.level.heron;
  const q = G.grid.paths.find((p) => p.id === 'heron');
  if (!q) return { ok: false, reason: 'no heron path' };
  __bot.place(q.pts[0][0], q.pts[0][2], 0);
  const r = __bot.follow('heron', 0, 1, 3);
  if (!r.ok) return r;
  const y = G.player.y;
  return { ok: y > H.h - 3, y: +y.toFixed(1), plateau: H.h };
});
await run('ward-holds', () => {
  // with the Dawn Gate sealed nobody may get into the summit precinct: not through the arch, not around it
  const G = __game, S = G.level.summit, p = G.player;
  G.objects.barrier.c.solid = true;                     // (an earlier scenario opened it artificially)
  const minR = { v: 1e9 };
  const trials = [[-8, -80, -8, -100], [0, -80, 0, -120], [-30, -100, 0, -125], [30, -100, 0, -125], [-50, -110, 0, -132]];
  const log = [];
  for (const [sx, sz, tx, tz] of trials) {
    __bot.place(sx, sz, 0);
    __bot.goto(tx, tz, { tol: 1.5, timeout: 8, auto: true, glide: true });
    for (let i = 0; i < 60; i++) __bot.tick();
    const r = Math.hypot(p.x - S.x, p.z - S.z);
    minR.v = Math.min(minR.v, r);
    log.push(+r.toFixed(1));
  }
  return { ok: minR.v >= 41.5, minDistToSummit: +minR.v.toFixed(1), log };
});
await run('glide-climb', () => {
  // gliding into a cliff face must not carry the hero up it (the cascade plateau is 27 m above this spot)
  const G = __game, p = G.player;
  let maxY = -1e9;
  const attempts = [[72, -58, 72, -100], [40, -60, 40, -110], [-104, 60, -130, 60]];
  for (const [sx, sz, tx, tz] of attempts) {
    __bot.place(sx, sz, 0);
    __bot.goto(tx, tz, { tol: 2, timeout: 7, auto: false, glide: true });
    for (let i = 0; i < 120; i++) { __bot.ctl.jump = true; __bot.tick(); maxY = Math.max(maxY, p.y - G.grid.heightAt(sx, sz)); }
    __bot.ctl.jump = false;
  }
  return { ok: maxY < 12, maxRiseAboveStart: +maxY.toFixed(1) };
});
await run('sky-route', () => {
  // bounce off the mesa mushroom, glide to isle 1, then mushroom + glide island to island up to the Sky Beacon isle
  const G = __game, L = G.level, p = G.player;
  const M = L.mesa;
  const legs = [{ near: [M.x, M.z, M.r + 6], to: L.isles[0] }];
  L.isles.slice(0, 3).forEach((I, k) => legs.push({ near: [I.x, I.z, I.r + 2], to: L.isles[k + 1] }));
  __bot.place(M.x, M.z, 0, M.h);
  const log = [];
  for (const leg of legs) {
    const mu = G.gameplay.mushrooms.find((m) => Math.hypot(m.x - leg.near[0], m.z - leg.near[1]) < leg.near[2]);
    if (!mu) return { ok: false, reason: 'no mushroom', leg: leg.to.id, log };
    const a = __bot.goto(mu.x, mu.z, { tol: 6.2, timeout: 15, auto: false });   // a full-height jump from ~6 units lands on the cap
    if (!a.ok) return { ok: false, phase: 'walk to mushroom', leg: leg.to.id, ...a, log };
    __bot.goto(mu.x, mu.z, { tol: 0.5, timeout: 4, auto: false, jumpNow: true });
    // finish the hop onto the cap, holding jump like a player would, until the bounce fires
    let bounced = false;
    for (let i = 0; i < 90 && !bounced; i++) { __bot.ctl.jump = true; __bot.tick(); bounced = p.vy > 20; }
    __bot.ctl.jump = false;
    if (!bounced) return { ok: false, reason: 'no bounce', leg: leg.to.id, log, at: __bot.state() };
    const b = __bot.goto(leg.to.x, leg.to.z, { tol: 3.5, timeout: 14, auto: false, glide: true });
    for (let i = 0; i < 150 && !p.grounded && !p.dead; i++) __bot.tick();
    const onIsle = p.grounded && Math.abs(p.y - leg.to.y) < 3 && Math.hypot(p.x - leg.to.x, p.z - leg.to.z) < leg.to.r;
    log.push([leg.to.id, b.ok ? 'reached' : b.reason, onIsle ? 'landed' : 'MISSED', +p.y.toFixed(1)]);
    if (!onIsle) return { ok: false, log, at: __bot.state() };
  }
  return { ok: true, log, end: __bot.state() };
});
await browser.close();
process.exit(failed ? 1 : 0);
