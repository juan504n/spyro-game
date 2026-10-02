// A realm walked by the real player controller: from its start to every goal, in the order of its brief, along the routes the walk map finds (tools/walkmap.mjs: jumps allowed, the gate shut until
// the goals that open it are lit), the hero breathing fire at each goal when he gets there - the way a person plays it, with the controller's own slopes, steps, hops and collisions instead of the
// walk map's cells. Time is the bot's (tools/bot-inject.js: the fixed step runs without rendering, so a realm is walked in seconds); the hero cannot be hurt (this is a test of the way, not of the
// Snuffers). It catches what a flood fill over cells cannot: a stair the body cannot climb, a hop that is a hair too long, a slope that slides, a wall of props, a gate that does not open.
//   node tools/realm-bot.mjs <realm id> [--verbose]      (needs the dev server on :5173, GV_HMR=0 recommended; GV_URL=http://127.0.0.1:PORT/ tests another server)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHeadless, addRuntimeColliders } from './headless-world.mjs';
import { makeWalkmap } from './walkmap.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const id = process.argv[2], verbose = process.argv.includes('--verbose');
if (!id) { console.log('usage: node tools/realm-bot.mjs <realm id> [--verbose]'); process.exit(1); }

// ---- the routes, from the walk map (Node): one leg from where the last goal was lit to the next ------------------------------------------------------------------------------------------
const W = buildHeadless(id);
addRuntimeColliders(W.collision, W.gp, W.grid);
const { flood } = makeWalkmap(W);
const brief = W.level.brief, gateAt = brief && brief.gate ? brief.gate.at : null;
const sp = W.gp.spawn;
let from = { x: sp.x, z: sp.z, y: sp.y };
const legs = [];
W.gp.beacons.forEach((b, i) => {
  const w = flood([from.x, from.z], { startY: from.y, hop: 6.2, openGate: gateAt !== null && i >= gateAt });       // (the goals that open the gate are behind him by then)
  const route = w.route(b.x, b.z, 4.5, b.y);
  const kind = brief ? (brief.goals.find((g) => g.id === b.id) || {}).situation : null;
  if ((!route || !route.length) && (kind === 'glide' || kind === 'puzzle')) {      // (reached by gliding, or by something this walk does not do: the hero is put beside it, and the walk goes on from there)
    const at = { x: b.x + 3.5, z: b.z, y: W.grid.heightAt(b.x + 3.5, b.z) };
    legs.push({ id: b.id, goal: [b.x, b.z], teleport: [at.x, at.y, at.z], route: [], metres: 0, skipped: `a ${kind} goal: not walked` });
    from = at;
    return;
  }
  if (!route || !route.length) { legs.push({ id: b.id, route: null }); return; }
  const pts = route.filter((_, k) => k % 3 === 0 || k === route.length - 1).map(([x, , z]) => [x, z]);
  const last = route[route.length - 1];
  legs.push({ id: b.id, goal: [b.x, b.z], route: pts, metres: last[3] });
  from = { x: last[0], z: last[2], y: last[1] };
});

// ---- the walk, in the page -----------------------------------------------------------------------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message.slice(0, 300)); });
await page.goto((process.env.GV_URL || 'http://127.0.0.1:5173/') + `?world=${id}&preserve=1`);
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });
await page.addScriptTag({ path: path.join(here, 'bot-inject.js') });
await page.waitForTimeout(1500);
await page.evaluate(() => { __bot.god(); __bot.tick(30); });

let failed = 0;
for (let i = 0; i < legs.length; i++) {
  const leg = legs[i], t0 = Date.now();
  let r;
  if (!leg.route) r = { ok: false, reason: 'the walk map finds no way to it' };
  else {
    r = await page.evaluate(({ leg, i }) => {
      const G = window.__game;
      let walked = 0;
      if (leg.teleport) __bot.place(leg.teleport[0], leg.teleport[2], 0, leg.teleport[1]);
      for (const [x, z] of leg.route) {
        const s = __bot.goto(x, z, { tol: 1.8, timeout: 20, auto: true });
        walked += s.t || 0;
        if (!s.ok) return { ok: false, reason: `${s.reason} on the way`, at: s.x === undefined ? null : [s.x, s.y, s.z], towards: [+x.toFixed(1), +z.toFixed(1)], seconds: +walked.toFixed(1) };
      }
      // at the goal: face it (walk the last steps towards it) and breathe fire
      __bot.goto(leg.goal[0], leg.goal[1], { tol: 3.4, timeout: 6, auto: false });
      const b = G.beacons.list[i];
      for (let k = 0; k < 4 && !b.litFlag; k++) { __bot.tap('flame', 36); __bot.tick(20); }
      __bot.tick(30);
      // (the lanterns that open the gate: the barrier is told to open after 1.4 s and eases open; let it)
      if (G.level.goal && G.level.brief && G.level.brief.gate && G.beacons.lit === G.level.brief.gate.at) __bot.tick(60 * 6);
      return { ok: !!b.litFlag, reason: b.litFlag ? '' : 'he got there, and breathed fire, and it did not light', seconds: +walked.toFixed(1), at: __bot.state(), lit: G.beacons.lit };
    }, { leg, i });
  }
  if (!r.ok) failed++;
  console.log(r.ok ? (leg.skipped ? 'SKIP' : 'PASS') : 'FAIL', `goal ${i + 1} of ${legs.length}, ${leg.id}: ${r.ok ? (leg.skipped ? `${leg.skipped}; put beside it and lit (${r.lit} lit)` : `walked ${leg.metres.toFixed(0)} m of route in ${r.seconds} s, lit (${r.lit} lit)`) : r.reason}`, r.ok && !verbose ? '' : JSON.stringify(r), `(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!r.ok) break;                                  // (nothing after a goal that cannot be reached means anything)
}
// the last goal opens the finale; the gate (if any) stands open
if (!failed) {
  const f = await page.evaluate(() => { const G = window.__game; return { state: G.mode, lit: G.beacons.lit, total: G.beacons.list.length, gate: G.objects && G.objects.barrier ? !G.objects.barrier.c.solid : null }; });
  const ok = f.lit === f.total && (f.gate === null || f.gate === true);
  if (!ok) failed++;
  console.log(ok ? 'PASS' : 'FAIL', `every goal lit by the walk (${f.lit} of ${f.total}), the gate ${f.gate === null ? 'none' : f.gate ? 'open' : 'SHUT'}, the game says ${f.state}`);
}
if (errors.length) { failed++; console.log('FAIL errors in the page', errors.slice(0, 2)); }
await browser.close();
console.log(failed ? `\n${failed} FAILED` : `\nall ${id} routes walked with the real controller`);
process.exitCode = failed ? 1 : 0;
