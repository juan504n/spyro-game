// Reachability QA: drives the real player controller headlessly through every road and objective route.
// Usage: node tools/bot.mjs [scenario ...]   (default: all)  — needs the dev server on :5173 (GV_HMR=0 recommended)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const want = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
await page.goto('http://127.0.0.1:5173/?skip=1&preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
await page.addScriptTag({ path: path.join(here, 'bot-inject.js') });
await page.waitForTimeout(1500);

const run = async (name, fn) => {
  if (want.length && !want.includes(name)) return;
  const t0 = Date.now();
  let r;
  try { r = await page.evaluate(fn); } catch (e) { r = { ok: false, reason: 'exception ' + e.message.slice(0, 200) }; }
  console.log((r && r.ok ? 'PASS' : 'FAIL').padEnd(5), name.padEnd(16), JSON.stringify(r), `(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
};

await page.evaluate(() => __bot.god());
await run('main-road', () => { __bot.place(0, 166, Math.PI); return __bot.follow('main', 0.02, 1, 4); });
await run('west-trail', () => { __bot.place(-3, 80, -1.6); return __bot.follow('west', 0.0, 1, 3); });
await run('east-trail', () => { __bot.place(0, 84, 1.6); return __bot.follow('east', 0.0, 1, 3); });
await run('mill-spiral', () => { __bot.place(88, 44, 0); return __bot.follow('mill', 0.0, 1, 3); });
await run('ring-west', () => { __bot.place(-80, 62, 3.14); return __bot.follow('ringW', 0.0, 1, 3); });
await run('ring-east', () => { __bot.place(76, 58, 3.14); return __bot.follow('ringE', 0.0, 1, 3); });
await run('summit-road', () => { if (__game.objects.barrier) __game.objects.barrier.c.solid = false; __bot.place(0, -86, 0); return __bot.follow('summit', 0.0, 1, 3); });
await run('island-stones', () => {
  const L = __game.level;
  __bot.place(-4, 74, Math.PI);
  const pts = [[-4, 66], [-6, 58], [-2, 52.5], [-7, 47], [-3, 42], [L.island.x, L.island.z + 5]];
  const out = [];
  for (const [x, z] of pts) { const r = __bot.goto(x, z, { tol: 1.4, timeout: 10 }); out.push(r.ok ? 'ok' : r.reason); if (!r.ok) return { ok: false, out, at: [x, z], ...__bot.state() }; }
  return { ok: true, out, end: __bot.state() };
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
await browser.close();
