// A realm walked by the real player controller: from its start to every goal, in the order of its brief, along the routes the walk map finds (tools/walkmap.mjs: jumps allowed, the gate shut until
// the goals that open it are lit), the hero breathing fire at each goal when he gets there - the way a person plays it, with the controller's own slopes, steps, hops and collisions instead of the
// walk map's cells. A goal on a shelf he cannot walk to (a `glide` goal) is reached the way a person reaches it: he walks to a ledge the glide check found, runs off it and glides, lands on the shelf,
// lights the goal, and glides off again to the walkable country towards the next goal (tools/lib/glide.mjs plans both). In a country of islands joined in the air (brief.air: tools/lib/air.mjs) the
// walk to a goal is a list of legs - walk, glide, lift - and he plays them all: he walks to a launch, runs off and glides to the island the link lands on, or walks into a whirlwind, is carried to
// its top and glides out of it. Time is the bot's (tools/bot-inject.js: the fixed step runs without
// rendering, so a realm is walked in seconds); the hero cannot be hurt (this is a test of the way, not of the Snuffers), but a lake of lava still burns. It catches what a flood fill over cells
// cannot: a stair the body cannot climb, a hop that is a hair too long, a glide that falls short, a slope that slides, a wall of props, a gate that does not open.
//   node tools/realm-bot.mjs <realm id> [--verbose]      (needs the dev server on :5173, GV_HMR=0 recommended; GV_URL=http://127.0.0.1:PORT/ tests another server)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHeadless, addRuntimeColliders } from './headless-world.mjs';
import { makeWalkmap } from './walkmap.mjs';
import { launchCells, exitCells } from './lib/glide.mjs';
import { airTools } from './lib/air.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const id = process.argv[2], verbose = process.argv.includes('--verbose');
if (!id) { console.log('usage: node tools/realm-bot.mjs <realm id> [--verbose]'); process.exit(1); }

// ---- the routes, from the walk map (Node): one leg from where the last goal was lit to the next ------------------------------------------------------------------------------------------
const W = buildHeadless(id);
addRuntimeColliders(W.collision, W.gp, W.grid);
const { flood } = makeWalkmap(W);
const brief = W.level.brief, gateAt = brief && brief.gate ? brief.gate.at : null;
const sp = W.gp.spawn, goals = W.gp.beacons;
const USE = +(process.env.GLIDE_USE || 1.0);                                           // (a glide uses at most this share of the reach the situation check allows: the check's own margin is already a person's, not a ballistic curve's)
// (every third point of a route; every point of a hop: the cells either side of a gap are where he must leave and land, a straight line between waypoints would run off a slab)
const gapAt = (route, k) => k > 0 && Math.hypot(route[k][0] - route[k - 1][0], route[k][2] - route[k - 1][2]) > 2.1;
const thin = (route) => route.filter((_, k) => k % 3 === 0 || k === route.length - 1 || gapAt(route, k) || gapAt(route, k + 1)).map(([x, , z]) => [x, z]);
let from = { x: sp.x, z: sp.z, y: sp.y };
const legs = [];
const airT = brief && brief.air ? airTools({ grid: W.grid, collision: W.collision, gp: W.gp, brief, flood }) : null;
goals.forEach((b, i) => {
  const open = (k) => gateAt !== null && k >= gateAt;      // (the goals that open the gate are behind him by then)
  if (airT) {                                               // (a country of islands: the legs of the journey from where he stands to the goal)
    const acts = airT.path(from, { x: b.x, z: b.z, y: b.y }, { openGate: open(i) });
    if (!acts) { legs.push({ id: b.id, route: null, why: 'the air journey finds no way to it' }); return; }
    const w = acts[acts.length - 1], last = w.route[w.route.length - 1];
    const mapAct = (a) => a.kind === 'walk' ? { kind: 'walk', route: thin(a.route), metres: a.route[a.route.length - 1][3], hops: a.route.some((_, k) => gapAt(a.route, k)) }
      : { kind: a.kind, id: a.link.id, land: [a.link.t.x, a.link.t.z, a.link.t.y], from: [a.link.o.x, a.link.o.z, a.link.o.y], apex: a.link.o.apex, gap: a.link.gap, drop: a.link.drop };
    legs.push({ id: b.id, goal: [b.x, b.z], route: [[b.x, b.z]], acts: acts.map(mapAct), metres: acts.reduce((m, a) => m + (a.kind === 'walk' ? a.route[a.route.length - 1][3] : a.link.cost), 0) });
    from = { x: last[0], z: last[2], y: last[1] };
    return;
  }
  const w = flood([from.x, from.z], { startY: from.y, hop: 6.2, openGate: open(i) });
  const route = w.route(b.x, b.z, 4.5, b.y);
  const kind = brief ? (brief.goals.find((g) => g.id === b.id) || {}).situation : null;
  if ((!route || !route.length) && kind === 'glide') {
    const cands = launchCells(w, b, { use: USE }), L = cands[cands.length - 1];        // (the nearest ledge: the one the situation check found)
    if (!L) { legs.push({ id: b.id, route: null, why: 'no ledge to glide from within reach' }); return; }
    const r1 = w.route(L.x, L.z, 2, L.y);
    // and off again, to the walkable country nearest (on foot) the next goal
    let exit = null;
    const next = goals[i + 1];
    if (next) {
      const wn = flood([next.x, next.z], { startY: next.y, hop: 6.2, openGate: open(i + 1) });
      const wAll = flood([sp.x, sp.z], { hop: 6.2, openGate: open(i + 1) });
      exit = exitCells(wAll, b, { next: wn, use: USE })[0] || null;
    }
    legs.push({ id: b.id, goal: [b.x, b.z], route: thin(r1), metres: r1[r1.length - 1][3], glide: { launch: { x: L.x, y: L.y, z: L.z, gap: L.gap, drop: L.drop }, exit } });
    from = exit ? { x: exit.x, z: exit.z, y: exit.y } : { x: b.x, z: b.z, y: b.y };
    return;
  }
  if ((!route || !route.length) && kind === 'puzzle') {      // (reached by something this walk does not do: the hero is put beside it, and the walk goes on from there)
    const at = { x: b.x + 3.5, z: b.z, y: W.grid.heightAt(b.x + 3.5, b.z) };
    legs.push({ id: b.id, goal: [b.x, b.z], teleport: [at.x, at.y, at.z], route: [], metres: 0, skipped: `a ${kind} goal: not walked` });
    from = at;
    return;
  }
  if (!route || !route.length) { legs.push({ id: b.id, route: null }); return; }
  const last = route[route.length - 1];
  legs.push({ id: b.id, goal: [b.x, b.z], route: thin(route), metres: last[3] });
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
  if (!leg.route) r = { ok: false, reason: leg.why || 'the walk map finds no way to it' };
  else {
    r = await page.evaluate(({ leg, i }) => {
      const G = window.__game;
      let walked = 0;
      const at = () => { const s = __bot.state(); return [s.x, s.y, s.z]; };
      const landed = (x, z, y, what) => {                // (a glide ends on firm ground near where it was meant to)
        __bot.tick(150);
        const s = __bot.state(), d = Math.hypot(s.x - x, s.z - z);
        return s.grounded && d < 9 && Math.abs(s.y - y) < 3 ? null : { ok: false, reason: `the glide to ${what} did not land there`, at: [s.x, s.y, s.z], metresOff: +d.toFixed(1), seconds: +walked.toFixed(1) };
      };
      if (leg.teleport) __bot.place(leg.teleport[0], leg.teleport[2], 0, leg.teleport[1]);
      const notes = [];
      for (const a of leg.acts || []) {
        if (a.kind === 'walk') {
          for (const [x, z] of a.route) {
            const s = __bot.goto(x, z, { tol: 1.8, timeout: 20, auto: true, careful: a.hops });
            walked += s.t || 0;
            if (!s.ok) return { ok: false, reason: `${s.reason} on the way`, at: s.x === undefined ? null : [s.x, s.y, s.z], towards: [+x.toFixed(1), +z.toFixed(1)], seconds: +walked.toFixed(1) };
          }
          continue;
        }
        const s0 = at();
        if (a.kind === 'lift') {                         // (he walks into the foot of the whirlwind and stands there until it has carried him to the top: it hovers him there)
          const w0 = __bot.goto(a.from[0], a.from[1], { tol: 1.2, timeout: 6, auto: false });
          walked += w0.t || 0;
          if (!w0.ok) return { ok: false, reason: `${w0.reason} walking into the whirlwind '${a.id}'`, at: [w0.x, w0.y, w0.z] };
          let waited = 0;
          while (waited < 14 && __bot.state().y < a.apex - 1.6) { __bot.tick(6); waited += 0.1; }
          walked += waited;
          const top = __bot.state();
          if (top.y < a.apex - 1.6) return { ok: false, reason: `the whirlwind '${a.id}' did not carry him to its top (he is at ${top.y} m, the top is ${a.apex.toFixed(1)})`, at: [top.x, top.y, top.z], from: s0 };
          notes.push(`rode '${a.id}' ${a.apex.toFixed(0)} m up`);
        }
        const g = __bot.goto(a.land[0], a.land[1], { glide: true, auto: true, tol: 3, timeout: 25 });
        walked += g.t || 0;
        const bad = landed(a.land[0], a.land[1], a.land[2], `the landing of '${a.id}'`);
        if (bad) return { ...bad, from: s0, link: a.id };
        notes.push(`${a.kind === 'lift' ? 'glided out' : 'glided'} ${a.gap.toFixed(0)} m to ${a.land.slice(0, 2).map((v) => v.toFixed(0)).join(', ')}`);
      }
      for (const [x, z] of leg.acts ? [] : leg.route) {
        const s = __bot.goto(x, z, { tol: 1.8, timeout: 20, auto: true });
        walked += s.t || 0;
        if (!s.ok) return { ok: false, reason: `${s.reason} on the way`, at: s.x === undefined ? null : [s.x, s.y, s.z], towards: [+x.toFixed(1), +z.toFixed(1)], seconds: +walked.toFixed(1) };
      }
      let note = notes.join('; ');
      if (leg.glide) {
        // run off the ledge and glide to the goal: the bot jumps at the edge and holds the glide
        const L = leg.glide.launch, s0 = at();
        const g = __bot.goto(leg.goal[0], leg.goal[1], { glide: true, auto: true, tol: 3, timeout: 25 });
        walked += g.t || 0;
        const bad = landed(leg.goal[0], leg.goal[1], G.beacons.list[i].y, 'the stack');
        if (bad) return { ...bad, from: s0, launch: [+L.x.toFixed(1), +L.y.toFixed(1), +L.z.toFixed(1)] };
        note = `glided ${L.gap.toFixed(0)} m from (${L.x.toFixed(0)}, ${L.y.toFixed(0)}, ${L.z.toFixed(0)}) to the goal`;
      }
      // at the goal: face it (walk the last steps towards it) and breathe fire
      __bot.goto(leg.goal[0], leg.goal[1], { tol: 2.6, timeout: 5, auto: false });                // (close enough to be facing it: he has walked the last steps towards it)
      const b = G.beacons.list[i];
      for (let k = 0; k < 4 && !b.litFlag; k++) { __bot.tap('flame', 36); __bot.tick(20); }
      __bot.tick(30);
      // (the lanterns that open the gate: the barrier is told to open after 1.4 s and eases open; let it)
      if (G.level.goal && G.level.brief && G.level.brief.gate && G.beacons.lit === G.level.brief.gate.at) __bot.tick(60 * 6);
      if (!b.litFlag) return { ok: false, reason: 'he got there, and breathed fire, and it did not light', seconds: +walked.toFixed(1), at: __bot.state(), lit: G.beacons.lit };
      if (leg.glide && leg.glide.exit) {
        const E = leg.glide.exit;
        const g2 = __bot.goto(E.x, E.z, { glide: true, auto: true, tol: 3, timeout: 25 });
        walked += g2.t || 0;
        const bad = landed(E.x, E.z, E.y, 'the walkable country');
        if (bad) return { ...bad, from: 'the goal' };
        note += `; glided off ${E.gap.toFixed(0)} m to (${E.x.toFixed(0)}, ${E.y.toFixed(0)}, ${E.z.toFixed(0)})`;
      }
      return { ok: true, reason: '', seconds: +walked.toFixed(1), at: __bot.state(), lit: G.beacons.lit, note };
    }, { leg, i });
  }
  if (!r.ok) failed++;
  console.log(r.ok ? (leg.skipped ? 'SKIP' : 'PASS') : 'FAIL', `goal ${i + 1} of ${legs.length}, ${leg.id}: ${r.ok ? (leg.skipped ? `${leg.skipped}; put beside it and lit (${r.lit} lit)` : `walked ${leg.metres.toFixed(0)} m of route in ${r.seconds} s${r.note ? `, ${r.note}` : ''}, lit (${r.lit} lit)`) : r.reason}`, r.ok && !verbose ? '' : JSON.stringify(r), `(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
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
