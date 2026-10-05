// A realm walked by the real player controller: from its start to every goal, in the order of its brief, along the routes the walk map finds (tools/walkmap.mjs: jumps allowed, the gate shut until
// the goals that open it are lit), the hero breathing fire at each goal when he gets there - the way a person plays it, with the controller's own slopes, steps, hops and collisions instead of the
// walk map's cells. A goal on a shelf he cannot walk to (a `glide` goal) is reached the way a person reaches it: he walks to a ledge the glide check found, runs off it and glides, lands on the shelf,
// lights the goal, and glides off again to the walkable country towards the next goal (tools/lib/glide.mjs plans both). In a country of islands joined in the air (brief.air: tools/lib/air.mjs) the
// walk to a goal is a list of legs - walk, glide, lift - and he plays them all: he walks to a launch, runs off and glides to the island the link lands on, or walks into a whirlwind, is carried to
// its top and glides out of it. Time is the bot's (tools/bot-inject.js: the fixed step runs without
// rendering, so a realm is walked in seconds); the hero cannot be hurt (this is a test of the way, not of the Snuffers), but a lake of lava still burns. It catches what a flood fill over cells
// cannot: a stair the body cannot climb, a hop that is a hair too long, a glide that falls short, a slope that slides, a wall of props, a gate that does not open. In a realm with a TIDE (level.tide) the
// walk map is the low tide's, so each leg is set out as the water ebbs into the last quarter of its fall - the way a person waits for the sea at the cairns - and a leg on which the sea drowns the hero
// is a failed leg; and a realm with a gate (gp.barrier) has it tried first by the real controller, which runs, jumps and glides at it from the side he comes from: shut, it holds (nothing round the
// pillars, nothing over them).
//   node tools/realm-bot.mjs <realm id> [--verbose | --plan]      (--plan prints the routes and does not walk them; needs the dev server on :5173 otherwise, GV_HMR=0 recommended; GV_URL=http://127.0.0.1:PORT/ tests another server)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHeadless, addRuntimeColliders } from './headless-world.mjs';
import { makeWalkmap } from './walkmap.mjs';
import { launchCells, exitCells } from './lib/glide.mjs';
import { airTools } from './lib/air.mjs';
import { tideLow } from '../src/game/realm/tide.js';
import { startOf } from './lib/trial-plays.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const id = process.argv[2], verbose = process.argv.includes('--verbose');
if (!id) { console.log('usage: node tools/realm-bot.mjs <realm id> [--verbose]'); process.exit(1); }

// ---- the routes, from the walk map (Node): one leg from where the last goal was lit to the next ------------------------------------------------------------------------------------------
const W = buildHeadless(id);
addRuntimeColliders(W.collision, W.gp, W.grid);
const { flood } = makeWalkmap(W);
const brief = W.level.brief, gateAt = brief && brief.gate ? brief.gate.at : null;
const sp = W.gp.spawn, goals = W.gp.beacons;
// (a realm with a tide: the routes are the walk map's with the water where it stands at the START of the window each leg is begun in - 0.5 m over the low tide, ebbing - so that no route cuts across ground
// that is only wadable at the very bottom of the tide; the road, and the sand the road crosses, are all safe from there for the 35 s or so before the water comes up to drown him)
const WATER = W.level.tide ? tideLow(W.level.tide) + 0.5 : undefined, WATER_ON = WATER !== undefined;
// (how near a waypoint of a route he must come before he turns to the next: the route of a country of cliffs runs up narrow ramps, 1.5 m apart, and a runner who cuts a corner of 1.8 m runs into the face beside the ramp and slides)
const TOL = WATER_ON ? 1.0 : 1.8;
const USE = +(process.env.GLIDE_USE || 1.0);                                           // (a glide uses at most this share of the reach the situation check allows: the check's own margin is already a person's, not a ballistic curve's)
// (every third point of a route; every point of a hop: the cells either side of a gap are where he must leave and land, a straight line between waypoints would run off a slab)
const gapAt = (route, k) => k > 0 && Math.hypot(route[k][0] - route[k - 1][0], route[k][2] - route[k - 1][2]) > 2.1;
// (a realm with a tide has cliffs into the sea all along its roads, and the shortest route hugs every corner of them: a straight line between points three cells apart would cut the corner and walk off
// the rim, so every cell of the route is a point of it there)
const rimOf = (m) => (x, y, z) => {                    // (a cell is off the rim when, on the ground, nothing within m metres falls more than 4 m below it; on a deck over the water, when a metre of deck lies all round it)
  if (y > W.grid.heightAt(x, z) + 1.0) {
    for (let k = 0; k < 8; k++) if (W.collision.support(x + Math.cos(k * Math.PI / 4), z + Math.sin(k * Math.PI / 4), y + 0.7, 0.3).y < y - 0.6) return false;
    return true;
  }
  for (let k = 0; k < 8; k++) if (y - W.grid.heightAt(x + Math.cos(k * Math.PI / 4) * m, z + Math.sin(k * Math.PI / 4) * m) > 4) return false;
  return true;
};
const thin = (route) => route.filter((_, k) => WATER_ON || k % 3 === 0 || k === route.length - 1 || gapAt(route, k) || gapAt(route, k + 1)).map(([x, , z]) => [x, z]);
let from = { x: sp.x, z: sp.z, y: sp.y };
const legs = [];
const airT = brief && brief.air ? airTools({ grid: W.grid, collision: W.collision, gp: W.gp, brief, flood }) : null;
// (the walk to a goal that a trial seals has a stop on the way: where the trial begins. There he plays it with the real controller (tools/lib/trial-driver.js), the seal breaks, and the walk goes on from there to the lantern)
const trialOf = (goalId) => (W.gp.trials || []).find((t) => t.goal === goalId);
const planLeg = (b, i, id, kind, trialSpec) => {
  const tl = { gi: i, ...(trialSpec ? { trial: trialSpec.id, trialKind: trialSpec.kind } : {}) };         // (gi: the goal this leg is for: the legs are more than the goals now)
  const open = (k) => gateAt !== null && k >= gateAt;      // (the goals that open the gate are behind him by then)
  if (airT) {                                               // (a country of islands: the legs of the journey from where he stands to the goal)
    const acts = airT.path(from, { x: b.x, z: b.z, y: b.y }, { openGate: open(i) });
    if (!acts) { legs.push({ id, ...tl, route: null, why: 'the air journey finds no way to it' }); return; }
    const w = acts[acts.length - 1], last = w.route[w.route.length - 1];
    const mapAct = (a) => a.kind === 'walk' ? { kind: 'walk', route: thin(a.route), metres: a.route[a.route.length - 1][3], hops: a.route.some((_, k) => gapAt(a.route, k)) }
      : { kind: a.kind, id: a.link.id, land: [a.link.t.x, a.link.t.z, a.link.t.y], from: [a.link.o.x, a.link.o.z, a.link.o.y], apex: a.link.o.apex, gap: a.link.gap, drop: a.link.drop };
    legs.push({ id, ...tl, goal: [b.x, b.z], route: [[b.x, b.z]], acts: acts.map(mapAct), metres: acts.reduce((m, a) => m + (a.kind === 'walk' ? a.route[a.route.length - 1][3] : a.link.cost), 0) });
    from = { x: last[0], z: last[2], y: last[1] };
    return;
  }
  // (a route that needs no jump is the one a person walks - the roads - and the one he is held to; the jumps of the walk map are for the goals that cannot be reached without them. In a realm with a tide
  // a route keeps 3 m (or the most the country allows: 2.5, 2) from the edge of a cliff into the sea where it can: the shortest path hugs every rim, and a runner does not turn on a rim)
  let w = null, route = null;
  for (const hop of [0, 6.2]) for (const mask of WATER_ON ? [rimOf(3), rimOf(2.5), rimOf(2), undefined] : [undefined]) {
    if (route && route.length) break;
    w = flood([from.x, from.z], { startY: from.y, hop, openGate: open(i), water: WATER, mask });
    route = w.route(b.x, b.z, 4.5, b.y);
  }
  if ((!route || !route.length) && kind === 'glide') {
    const cands = launchCells(w, b, { use: USE }), L = cands[cands.length - 1];        // (the nearest ledge: the one the situation check found)
    if (!L) { legs.push({ id, ...tl, route: null, why: 'no ledge to glide from within reach' }); return; }
    const r1 = w.route(L.x, L.z, 2, L.y);
    // and off again, to the walkable country nearest (on foot) the next goal
    let exit = null;
    const next = goals[i + 1];
    if (next) {
      const wn = flood([next.x, next.z], { startY: next.y, hop: 6.2, openGate: open(i + 1) });
      const wAll = flood([sp.x, sp.z], { hop: 6.2, openGate: open(i + 1) });
      exit = exitCells(wAll, b, { next: wn, use: USE })[0] || null;
    }
    legs.push({ id, ...tl, goal: [b.x, b.z], route: thin(r1), metres: r1[r1.length - 1][3], glide: { launch: { x: L.x, y: L.y, z: L.z, gap: L.gap, drop: L.drop }, exit } });
    from = exit ? { x: exit.x, z: exit.z, y: exit.y } : { x: b.x, z: b.z, y: b.y };
    return;
  }
  if ((!route || !route.length) && kind === 'puzzle') {      // (reached by something this walk does not do: the hero is put beside it, and the walk goes on from there)
    const at = { x: b.x + 3.5, z: b.z, y: W.grid.heightAt(b.x + 3.5, b.z) };
    legs.push({ id, ...tl, goal: [b.x, b.z], teleport: [at.x, at.y, at.z], route: [], metres: 0, skipped: `a ${kind} goal: not walked` });
    from = at;
    return;
  }
  if (!route || !route.length) { legs.push({ id, ...tl, route: null }); return; }
  const last = route[route.length - 1];
  legs.push({ id, ...tl, goal: [b.x, b.z], route: thin(route), metres: last[3] });
  from = { x: last[0], z: last[2], y: last[1] };
};
goals.forEach((b, i) => {
  const T = trialOf(b.id), sit = brief ? (brief.goals.find((g) => g.id === b.id) || {}).situation : null;
  if (T) { const st = startOf(T); planLeg({ id: b.id, x: st.x, z: st.z, y: W.grid.heightAt(st.x, st.z) }, i, `${b.id}:${T.kind}`, null, T); }
  planLeg(b, i, b.id, sit, null);
});

if (process.argv.includes('--plan')) {                  // (the routes as planned, one line a leg - the points he walks through, and how far - and no walk)
  for (const l of legs) console.log(l.id, l.route ? `${Math.round(l.metres)} m, ${l.route.length} points:` : `no route: ${l.why || ''}`, l.route ? l.route.map(([x, z]) => `${Math.round(x)},${Math.round(z)}`).join(' ') : '');
  process.exit(0);
}

// ---- the gate, tried first: the side he comes from is the side of the walk's cells before the gate (the walk to the last goal with the gate open crosses it) ----------------------------------------------------
let gateTrial = null;
if (W.gp.barrier && gateAt !== null && !airT) {
  const B = W.gp.barrier, fx = Math.sin(B.yaw || 0), fz = Math.cos(B.yaw || 0), last = goals[goals.length - 1];
  const route = flood([sp.x, sp.z], { hop: 6.2, openGate: true, water: WATER }).route(last.x, last.z, 4.5, last.y) || [];
  const k = route.findIndex((c) => Math.hypot(c[0] - B.x, c[2] - B.z) < 4);
  if (k > 8) {
    const c = route[k - 8], side = Math.sign((c[0] - B.x) * fx + (c[2] - B.z) * fz) || 1;
    gateTrial = { x: B.x, z: B.z, y: B.y, fx, fz, side };
  }
}

// ---- the walk, in the page -----------------------------------------------------------------------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message.slice(0, 300)); });
await page.goto((process.env.GV_URL || 'http://127.0.0.1:5173/') + `?world=${id}&preserve=1`);
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });
await page.addScriptTag({ path: path.join(here, 'bot-inject.js') });
await page.addScriptTag({ path: path.join(here, 'lib/trial-driver.js') });
await page.evaluate(() => window.__trialDriver.load());
await page.waitForTimeout(1500);
await page.evaluate(() => { __bot.god(); __bot.tick(30); });

let failed = 0;
if (gateTrial) {
  // (from the side he comes from, with jumps and glides: seven straight runs across the neck at the gate, from 9 and 14 m before it to 14 m past it, and runs that swing out round the pillars' outer faces
  // at 7 to 10 m from the middle, from 6, 9 and 14 m before; each ends four seconds later. None may end standing beyond the gate: grounded, alive, and still up on its ridge)
  const r = await page.evaluate((T) => {
    const G = window.__game, p = G.player, ends = [], t0 = G.time;
    const px = T.fz, pz = -T.fx;                                                    // (across the gate)
    const along = (x, z) => ((x - T.x) * T.fx + (z - T.z) * T.fz) * -T.side;       // (positive: beyond the gate)
    const at = (a, lat) => [T.x - T.fx * T.side * a + px * lat, T.z - T.fz * T.side * a + pz * lat];         // (a metres beyond the gate - before it when negative - and lat metres across)
    const runs = [];
    for (const lat of [-6.5, -4, -2, 0, 2, 4, 6.5]) for (const from of [9, 14]) runs.push(['straight', lat, from, at(-from, lat), at(14, lat)]);
    for (const lat of [-6.5, 6.5]) for (const from of [6, 9, 14]) for (const [ta, tl] of [[5, 10], [8, 8.5], [11, 7]]) for (const sg of [-1, 1]) if (Math.sign(lat) === sg) runs.push(['round', lat, from, at(-from, lat), at(ta, tl * sg)]);
    for (const [kind, lat, from, [sx, sz], [tx, tz]] of runs) {
      __bot.place(sx, sz, Math.atan2(tx - sx, tz - sz));
      __bot.goto(tx, tz, { tol: 1.5, timeout: 9, auto: true, glide: true });
      __bot.tick(240);
      ends.push([kind, lat, from, +along(p.x, p.z).toFixed(1), +p.y.toFixed(1), p.grounded && !p.dead]);
    }
    return { runs: ends.length, ends, through: ends.filter((e) => e[3] > 1.5 && e[4] > T.y - 3 && e[5]), furthest: Math.max(...ends.map((e) => e[3])), clock: +(G.time - t0).toFixed(0) };
  }, gateTrial);
  const ok = r.through.length === 0;
  if (!ok) failed++;
  console.log(ok ? 'PASS' : 'FAIL', `the gate holds against the real controller (${r.runs} runs, jumps and glides, straight at it and round the pillars, from the side he comes from: none ends standing beyond it)`, ok && !verbose ? `(the furthest any got was ${r.furthest} m past the line, in the air or on the sea's cliff, and was put back)` : JSON.stringify(r));
  await page.evaluate((s) => { __bot.place(s.x, s.z, s.yaw); __bot.tick(30); }, sp);
}
for (let i = 0; i < legs.length; i++) {
  const leg = legs[i], t0 = Date.now();
  let r;
  if (!leg.route) r = { ok: false, reason: leg.why || 'the walk map finds no way to it' };
  else {
    r = await page.evaluate(({ leg, i, TOL }) => {
      const G = window.__game, P = G.player;
      let walked = 0, waited = 0, drowned = 0;
      const drownAt = [];
      // (a realm with a tide: the walk map is the low tide's, so the leg is set out as the water ebbs into the last quarter of its fall, below 0.5 m over its lowest: he lets it rise past the window if he is
      // in it, then waits for it to go down to it - the way a person waits for the sea at the cairns - and the crossing of the sand is done before it turns)
      if (G.tide) {
        while (G.waterY < G.waterLo + 0.9 && waited < 200) { __bot.tick(30); waited += 0.5; }
        while (G.waterY > G.waterLo + 0.5 && waited < 200) { __bot.tick(30); waited += 0.5; }
      }
      const wasDrown = P.on.drown;
      P.on.drown = (...a) => { drowned++; drownAt.push([+P.x.toFixed(0), +P.z.toFixed(0), +G.waterY.toFixed(2)]); return wasDrown && wasDrown(...a); };
      const body = () => {
      const at = () => { const s = __bot.state(); return [s.x, s.y, s.z]; };
      const landed = (x, z, y, what) => {                // (a glide ends on firm ground near where it was meant to)
        __bot.tick(150);
        const s = __bot.state(), d = Math.hypot(s.x - x, s.z - z);
        return s.grounded && d < 9 && Math.abs(s.y - y) < 3 ? null : { ok: false, reason: `the glide to ${what} did not land there`, at: [s.x, s.y, s.z], metresOff: +d.toFixed(1), seconds: +walked.toFixed(1) };
      };
      if (!leg.trial && G.beacons.list[leg.gi].litFlag) return { ok: true, reason: '', seconds: 0, at: __bot.state(), lit: G.beacons.lit, note: 'its trial lit it as it was solved' };          // (the lantern was near its trial: the trial's end lit it; and if it was the last the finale has begun)
      if (leg.teleport) __bot.place(leg.teleport[0], leg.teleport[2], 0, leg.teleport[1]);
      const notes = [], slips = [];
      const slipped = () => (slips.length ? `slipped off the way ${slips.length} time(s) towards ${slips.map(([x, z]) => `(${x}, ${z})`).join(' ')} and stepped back` : '');
      for (const a of leg.acts || []) {
        if (a.kind === 'walk') {
          const s = __bot.walk(a.route, { tol: TOL, timeout: 20, auto: true, careful: a.hops });
          walked += s.t || 0;
          slips.push(...s.slips);
          if (!s.ok) return { ok: false, reason: `${s.reason} on the way`, at: s.x === undefined ? null : [s.x, s.y, s.z], towards: s.towards, seconds: +walked.toFixed(1), trace: s.trace, slips };
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
      if (!leg.acts) {
        const s = __bot.walk(leg.route, { tol: TOL, timeout: 20, auto: true });
        walked += s.t || 0;
        slips.push(...s.slips);
        if (!s.ok) return { ok: false, reason: `${s.reason} on the way`, at: s.x === undefined ? null : [s.x, s.y, s.z], towards: s.towards, seconds: +walked.toFixed(1), trace: s.trace, slips };
      }
      if (leg.trial) {                                   // (a stop on the way to a sealed lantern: he is where the trial begins; he plays it, the seal breaks, and the lantern is lit if it is near, else freed)
        const res = window.__trialDriver.solve(leg.trial, { place: false, T: 240 });
        if (!res.ok) return { ok: false, reason: `the ${leg.trialKind} trial '${leg.trial}' was not solved`, seconds: +walked.toFixed(1), ...res };
        __bot.tick(60 * 3);
        return { ok: true, reason: '', seconds: +walked.toFixed(1), at: __bot.state(), lit: G.beacons.lit, note: `played the ${leg.trialKind}: solved in ${res.t} s (hurt ${res.hurts}, began again ${res.fails})${slips.length ? '; ' + slipped() : ''}` };
      }
      let note = notes.join('; ');
      if (leg.glide) {
        // run off the ledge and glide to the goal: the bot jumps at the edge and holds the glide
        const L = leg.glide.launch, s0 = at();
        const g = __bot.goto(leg.goal[0], leg.goal[1], { glide: true, auto: true, tol: 3, timeout: 25 });
        walked += g.t || 0;
        const bad = landed(leg.goal[0], leg.goal[1], G.beacons.list[leg.gi].y, 'the stack');
        if (bad) return { ...bad, from: s0, launch: [+L.x.toFixed(1), +L.y.toFixed(1), +L.z.toFixed(1)] };
        note = `glided ${L.gap.toFixed(0)} m from (${L.x.toFixed(0)}, ${L.y.toFixed(0)}, ${L.z.toFixed(0)}) to the goal`;
      }
      // at the goal: face it (walk the last steps towards it) and breathe fire
      __bot.goto(leg.goal[0], leg.goal[1], { tol: 2.6, timeout: 5, auto: false });                // (close enough to be facing it: he has walked the last steps towards it)
      const b = G.beacons.list[leg.gi];
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
      return { ok: true, reason: '', seconds: +walked.toFixed(1), at: __bot.state(), lit: G.beacons.lit, note: [note, slipped()].filter(Boolean).join('; ') };
      };
      const out = body();
      P.on.drown = wasDrown;
      if (drowned) return { ...out, ok: false, reason: `the sea drowned him ${drowned} time(s) on the way (the water stood at ${G.waterY.toFixed(1)} m, the tide is ${G.tide ? G.tide.period : 0} s round)`, waited, drownedAt: drownAt };
      return G.tide ? { ...out, waited, note: `${out.note ? out.note + '; ' : ''}waited ${waited.toFixed(0)} s for the ebb` } : out;
    }, { leg, i, TOL });
  }
  if (!r.ok) {
    failed++;
    // (what the world says about the gate and the tide at the failure: a hero held by a gate that did not open, or by the sea, is told apart from one held by a step)
    r.world = await page.evaluate(() => {
      const G = window.__game, b = G.objects && G.objects.barrier, p = G.player, near = (o) => Math.hypot(o.x - p.x, o.z - p.z);
      // (and what is within 3 m of him: a Snuffer, a collider his body overlaps - the difference between a step he cannot climb and something standing in his way)
      const snuffers = ((G.enemies && G.enemies.list) || []).filter((e) => near(e) < 4).map((e) => `${e.variant || e.kind || '?'}@${e.x.toFixed(1)},${e.z.toFixed(1)}${e.dead ? ' dead' : ''}`);
      const solid = G.collision.near(p.x, p.z).filter((c) => c.solid && c.y1 > p.y + 0.3 && c.y0 < p.y + 1.0 && G.collision.inside(c, p.x, p.z, 0.8)).map((c) => `${c.tag || c.type}[${c.x.toFixed(1)},${c.z.toFixed(1)} y${c.y0.toFixed(1)}..${c.y1.toFixed(1)}]`);
      return { lit: G.beacons.lit, gate: b ? { target: b.target, open: +b.open.toFixed(2), solid: !!b.c.solid } : null, water: +G.waterY.toFixed(2), t: +G.time.toFixed(0), grounded: p.grounded, kind: p.groundKind, snuffers, solid };
    });
  }
  console.log(r.ok ? (leg.skipped ? 'SKIP' : 'PASS') : 'FAIL', `${leg.trial ? 'trial' : 'goal'} ${i + 1} of ${legs.length}, ${leg.id}: ${r.ok ? (leg.skipped ? `${leg.skipped}; put beside it and lit (${r.lit} lit)` : `walked ${leg.metres.toFixed(0)} m of route in ${r.seconds} s${r.note ? `, ${r.note}` : ''}, lit (${r.lit} lit)`) : r.reason}`, r.ok && !verbose ? '' : JSON.stringify(r), `(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
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
