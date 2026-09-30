// Gem flight regression test: a gem that Sparx pulls in is LOBBED (up, then down into Spyro), not slid in a straight line.
//   node tools/gem-flight-test.mjs      (needs the dev server on :5173, GV_HMR=0 recommended; GV_URL=file:///.../docs/index.html tests a built file instead)
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
await page.waitForTimeout(1200);

const r = await page.evaluate(() => {
  const B = __bot, g = __game, F = g.gems, p = g.player;
  B.install(); B.god();
  const out = {};
  const statics = () => F.items.filter((i) => i && !i.dynamic && i.alive);
  // a static red gem on reasonably open ground
  const G = statics().find((i) => i.value === 1 && Math.abs(i.y - g.grid.heightAt(i.x, i.z)) < 2.2);
  const home = { x: G.x, y: G.y, z: G.z };
  const before = g.stats.gems;
  // stand 4 m away (same ground), Sparx alive
  // (no settling ticks after placing him: the pull starts on the very first step, and the recording must not miss it)
  const put = (x, z) => { p.place(x, g.grid.heightAt(x, z) + 0.05, z, 0); g.cam.snapBehind(p); };   // (B.place() would run 30 steps)
  const standAt = (dx, dz) => { B.ctl.mx = B.ctl.my = 0; put(G.x + dx, G.z + dz); };
  standAt(4, 0);
  out.sparx = g.sparx.hp;
  // ---- 1. stationary target: record the whole flight
  const S = [];
  let launchedAt = -1, collectedAt = -1;
  for (let i = 0; i < 90; i++) {
    B.tick(1);
    S.push({ x: G.x, y: G.y, z: G.z, m: G.magnet, a: G.alive, py: p.y + 0.5, px: p.x, pz: p.z });
    if (launchedAt < 0 && G.magnet) launchedAt = i;
    if (collectedAt < 0 && !G.alive) { collectedAt = i; break; }
  }
  const fl = S.slice(Math.max(0, launchedAt), collectedAt < 0 ? S.length : collectedAt);
  const n = fl.length;
  const chest = { x: p.x, y: p.y + 0.5, z: p.z };
  let apexI = 0, maxBump = 0, maxStep = 0, riseAbove = -1e9;
  fl.forEach((s, i) => {
    const u = i / Math.max(1, n - 1);
    const lineY = fl[0].y + (chest.y - fl[0].y) * Math.pow(u, 1.35);
    maxBump = Math.max(maxBump, s.y - lineY);
    if (s.y > fl[apexI].y) apexI = i;
    riseAbove = Math.max(riseAbove, s.y - fl[0].y);
    if (i) maxStep = Math.max(maxStep, Math.hypot(s.x - fl[i - 1].x, s.y - fl[i - 1].y, s.z - fl[i - 1].z));
  });
  const tail = fl.slice(Math.floor(n * 0.7));
  out.flight = { launchedAt, collectedAt, ticks: n, secs: +(n / 60).toFixed(2), apexAt: +(apexI / n).toFixed(2), rise: +riseAbove.toFixed(2), bump: +maxBump.toFixed(2), maxStep: +maxStep.toFixed(2),
    diving: tail.every((s, i) => i === 0 || s.y <= tail[i - 1].y + 0.02), collected: !G.alive, gained: g.stats.gems - before };
  // ---- 2. moving target: Spyro runs away while the gem is in the air; it must still arrive
  G.alive = true; G.magnet = false; G.x = home.x; G.y = home.y; G.z = home.z; g.stats.gems = before;
  standAt(4.5, 0);
  B.ctl.my = 1;                                        // (camera-relative forward: some direction away or across; it moves either way)
  let arrived = -1;
  for (let i = 0; i < 120; i++) { B.tick(1); if (!G.alive) { arrived = i; break; } }
  B.ctl.mx = B.ctl.my = 0;
  out.moving = { arrivedTicks: arrived, gained: g.stats.gems - before };
  // ---- 3. cancel: teleport Spyro away mid-flight -> the pull lets go and the gem is back where it hangs
  G.alive = true; G.magnet = false; G.x = home.x; G.y = home.y; G.z = home.z; g.stats.gems = before;
  standAt(4, 0);
  for (let i = 0; i < 12 && !G.magnet; i++) B.tick(1);
  const wasMagnet = G.magnet;
  B.tick(8);
  put(G.hx + 60, G.hz + 60);
  B.tick(3);
  out.cancel = { wasMagnet, magnetAfter: G.magnet, alive: G.alive, home: Math.hypot(G.x - home.x, G.y - home.y, G.z - home.z) < 1e-6 };
  // ---- 4. burst gems: everything that flies out arrives, and the total is exact
  standAt(20, 0);
  B.ctl.mx = B.ctl.my = 0;
  const b0 = g.stats.gems;
  F.burst(p.x + 1.5, p.y + 1, p.z, [1, 1, 2, 5, 10, 1, 2, 25], 1);
  B.tick(60 * 4);
  out.burst = { gained: g.stats.gems - b0, expected: 1 + 1 + 2 + 5 + 10 + 1 + 2 + 25, leftInAir: F.items.filter((i) => i && i.dynamic && i.alive).length };
  return out;
});
console.log(JSON.stringify(r, null, 1));
const f = r.flight;
const ok = r.sparx > 0 && f.collected && f.gained === 1
  && f.secs >= 0.3 && f.secs <= 0.7                      // 0.32 s + 0.05 s per metre of pull
  && f.rise >= 1.0 && f.bump >= 1.2                      // it goes UP first (the old straight line had no hump at all)
  && f.apexAt > 0.25 && f.apexAt < 0.7                   // the top of the hop is in the middle of the flight
  && f.diving && f.maxStep < 0.9                         // ... then it dives into Spyro, without any jump
  && r.moving.arrivedTicks > 0 && r.moving.gained === 1
  && r.cancel.wasMagnet && !r.cancel.magnetAfter && r.cancel.alive && r.cancel.home
  && r.burst.gained === r.burst.expected && r.burst.leftInAir === 0;
console.log(ok ? 'PASS  gems are lobbed: up, then down into Spyro; moving target, cancel and bursts behave' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
