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
await run('ward-wall', () => {
  // The wall round the gate is SEEN, not just bumped into: drawn on the very circle the ward holds the hero at (42 m from the summit), brighter where he leans on
  // it, only while it holds, and gone with the gate's field.
  const G = __game, O = G.objects, S = G.level.summit, p = G.player, R = 42;
  O.barrier.c.solid = true; O.barrier.open = 0; O.barrier.target = 0;                   // (an earlier scenario opened it artificially)
  const w = O.ward && O.ward.model;
  if (!w) return { ok: false, reason: 'the ward has no wall' };
  __bot.tick(2);
  const xz = [];
  w.root.traverse((m) => { const a = m.geometry && m.geometry.attributes.position; if (a) for (let i = 0; i < a.count; i++) xz.push([a.getX(i), a.getZ(i)]); });
  const offCircle = Math.max(...xz.map(([x, z]) => Math.abs(Math.hypot(x - S.x, z - S.z) - R)));
  const out = { wallVertices: xz.length, offCircle: +offCircle.toFixed(3), visibleSealed: w.root.visible };
  // the hero runs at the wall from outside: he is stopped ON it, with the wall right beside him and lit up
  const a = 14 * Math.PI / 180;
  __bot.place(S.x + Math.sin(a) * (R + 9), S.z + Math.cos(a) * (R + 9), Math.PI);
  __bot.goto(S.x, S.z, { tol: 1.5, timeout: 6, auto: false });
  for (let i = 0; i < 40; i++) __bot.tick();
  __bot.tick();
  out.heroDist = +Math.hypot(p.x - S.x, p.z - S.z).toFixed(2);
  out.nearestWall = +Math.min(...xz.map(([x, z]) => Math.hypot(x - p.x, z - p.z))).toFixed(2);
  out.lit = +w.touch.toFixed(2);
  // the gate opens: the wall goes, and the hero can walk in
  O.openBarrier();
  for (let i = 0; i < 300; i++) __bot.tick();
  out.visibleOpen = w.root.visible; out.solidOpen = O.barrier.c.solid;
  __bot.goto(S.x, S.z + 30, { tol: 1.5, timeout: 6, auto: false });
  out.heroDistAfter = +Math.hypot(p.x - S.x, p.z - S.z).toFixed(1);
  const ok = out.wallVertices > 500 && out.offCircle < 0.01 && out.visibleSealed && Math.abs(out.heroDist - R) < 0.3 && out.nearestWall < 1.2 && out.lit > 0.9
    && !out.visibleOpen && !out.solidOpen && out.heroDistAfter < R - 8;
  O.barrier.c.solid = true; O.barrier.open = 0; O.barrier.target = 0;
  return { ok, ...out };
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
await run('ram-jump', () => {
  // In the original you can jump while ramming: hold RAM, tap JUMP, and the ram carries on through the air. From the dock's end that is one 18 m leap across the water to the
  // SECOND lily pad, which a plain jump (8.7 m) cannot reach. The real controller: RAM held from 5 m up the dock, JUMP tapped half a metre before its end.
  const G = __game, p = G.player, ctl = __bot.ctl;
  const pads = G.gameplay.placed.filter((q) => q.name === 'stepping_stone').sort((a, b) => b.z - a.z);
  const pad2 = pads[1], endZ = 66.58;
  const yaw = Math.atan2(pad2.x - -4, pad2.z - 72);
  __bot.place(-4, 72, yaw, 0.3);
  __bot.edge('charge'); ctl.charge = true;
  let jumpedAt = null, airSpeed = 1e9, charging = true;
  for (let i = 0; i < 400 && !p.dead; i++) {
    const dx = pad2.x - p.x, dz = pad2.z - p.z, Y = G.cam.yaw;                          // (steer like the bot's heading helper)
    ctl.my = dx * Math.sin(Y) + dz * Math.cos(Y); ctl.mx = -dx * Math.cos(Y) + dz * Math.sin(Y);
    ctl.jump = false;
    if (jumpedAt === null && p.grounded && p.z < endZ + 0.5) { ctl.jump = true; __bot.edge('jump'); jumpedAt = { x: +p.x.toFixed(1), z: +p.z.toFixed(1), speed: +p.speed.toFixed(1), charging: p.chargeT > 0 }; }
    __bot.tick();
    if (jumpedAt !== null && !p.grounded) { airSpeed = Math.min(airSpeed, p.speed); charging = charging && p.chargeT > 0; }
    if (jumpedAt !== null && p.grounded) break;
  }
  ctl.charge = false; ctl.mx = ctl.my = 0; ctl.jump = false;
  const on = p.dead ? 'dead' : p.grounded && p.groundKind === 'collider' && p.groundC && p.groundC.prop ? p.groundC.prop.name : p.grounded ? p.groundKind : 'air';
  return { ok: !!jumpedAt && jumpedAt.charging && charging && airSpeed > 22 && on === 'stepping_stone' && Math.hypot(p.x - pad2.x, p.z - pad2.z) < 3.4, jumpedAt, airSpeed: +airSpeed.toFixed(1), stillRamming: charging, landedOn: on, at: [+p.x.toFixed(1), +p.z.toFixed(1)], pad2: [pad2.x, pad2.z] };
});
await run('sparx', () => {
  // Sparx as in the original. The game BEGINS with him gold (full health: nothing has hurt him yet when this runs); every hit he takes turns him blue, then green, then he is
  // gone, and the next hit is lights out; butterflies bring him back one colour at a time; a new life starts with gold Sparx again. While he is with Spyro the gems near
  // are pulled in; without him they have to be touched.
  const G = __game, p = G.player, S = G.sparx, out = {};
  const tone = (c) => (c[0] > 0.9 && c[1] > 0.7 && c[2] < 0.4 ? 'gold' : c[2] > 0.8 && c[0] < 0.5 ? 'blue' : c[1] > 0.8 && c[0] < 0.5 && c[2] < 0.4 ? 'green' : '?');
  out.start = [S.hp, tone(S.color)];
  delete p.hurt;                                                                    // (the bot's god mode is off for this)
  const hit = () => { p.invulnT = 0; p.hurtT = 0; p.dead = false; return G.playerHurt(p.x + 1, p.z); };
  out.hits = [];
  for (let i = 0; i < 3; i++) { hit(); S.frame(1 / 60, 1); out.hits.push([S.hp, tone(S.color), p.dead ? 'DEAD' : 'alive', S.model.hp]); }       // gold -> blue -> green -> gone
  hit(); out.fourthHitKills = p.dead;
  G.respawn(); S.frame(1 / 60, 1);
  out.afterRespawn = [S.hp, tone(S.color), p.dead ? 'DEAD' : 'alive'];
  S.reset(1); out.butterflies = [];
  for (let i = 0; i < 4; i++) { const took = S.heal(); out.butterflies.push(`${took ? 'ate' : 'full'} -> ${S.hp}`); }                      // green -> blue -> gold, then no more
  // gems: 3.5 m away, in the open; with him they are pulled in, without him they stay put until they are touched
  __bot.place(0, 150, Math.PI);
  const gem = () => { const it = G.gems._add(p.x + 3.5, p.y + 0.5, p.z, 1, true); it.delay = 0; return it; };
  S.reset(3); let g1 = gem(); __bot.tick(3); out.withSparx = g1.magnet || !g1.alive;
  S.reset(0); let g2 = gem(); __bot.tick(30); out.withoutSparx = { pulled: g2.magnet || !g2.alive, stillThere: g2.alive };
  __bot.goto(g2.x, g2.z, { tol: 1, timeout: 4, auto: false }); __bot.tick(4); out.touched = !g2.alive;
  S.reset(3); __bot.god();
  const ok = out.start[0] === 3 && out.start[1] === 'gold'
    && out.hits.map((h) => h.join()).join('|') === '2,blue,alive,2|1,green,alive,1|0,green,alive,1' && out.fourthHitKills
    && out.afterRespawn.join() === '3,gold,alive' && out.butterflies.join() === 'ate -> 2,ate -> 3,full -> 3,full -> 3'
    && out.withSparx && !out.withoutSparx.pulled && out.withoutSparx.stillThere && out.touched;
  return { ok, ...out };
});
await run('one-hit-enemies', () => {
  // Every Snuffer dies to ONE hit of an attack that works on it (they used to take two): plain ones to a breath of fire or to a ram, bell ones (fire bounces
  // off) to a ram, thorn ones (a ram hurts you) to a breath of fire. Each trial: a fresh Snuffer that holds its ground on a clear stretch of the main road, and
  // the real controller 6.5 m away, facing it. Every call to damage() is counted, so "dead after two hits" fails.
  const G = __game, E = G.enemies, road = G.grid.paths.find((q) => q.id === 'main').pts;
  const far = (x, z) => E.list.every((e) => Math.hypot(e.x - x, e.z - z) > 45);
  let a = null, b = null;
  for (let i = 0; i < road.length && !a; i++) {
    for (let j = i + 1; j < road.length; j++) {
      const d = Math.hypot(road[j][0] - road[i][0], road[j][2] - road[i][2]);
      if (d < 6.5) continue;
      if (d < 7.5 && Math.abs(road[j][1] - road[i][1]) < 0.5 && far(road[i][0], road[i][2]) && far(road[j][0], road[j][2])) { a = road[i]; b = road[j]; }
      break;
    }
  }
  if (!a) return { ok: false, reason: 'no clear stretch of the main road, away from the level\'s own Snuffers' };
  const hits = [];
  let hurts = 0;
  const damage0 = E.damage.bind(E), hurt0 = G.playerHurt.bind(G);
  E.damage = (e, amount, ...rest) => { hits.push(e.variant); return damage0(e, amount, ...rest); };
  G.playerHurt = (...args) => { hurts++; return hurt0(...args); };
  const trial = (variant, attack) => {
    const e = E._make({ x: b[0], z: b[2], variant, patrol: 0 });
    e.V = { ...e.V, speed: 0 };                                       // (it holds its ground: this tests the hit, not the chase)
    E.list.push(e);
    hits.length = 0; hurts = 0;
    __bot.place(a[0], a[2], Math.atan2(b[0] - a[0], b[2] - a[2]), a[1]);
    if (attack === 'fire') { __bot.tap('flame', 4); __bot.tick(40); }                                 // one breath (0.42 s)
    else {
      __bot.edge('charge'); __bot.ctl.charge = true;                                                 // one ram: held until it lands (or 1.5 s)
      for (let i = 0; i < 90 && e.state !== 'dead' && !hurts; i++) __bot.tick();
      __bot.ctl.charge = false; __bot.tick(20);
    }
    const r = { dead: e.state === 'dead' || !E.list.includes(e), hits: hits.length, hurts };
    if (E.list.includes(e)) E._remove(e, E.list.indexOf(e));
    return r;
  };
  //                    fire            ram                 [dead, damage() calls]
  const want = { basic: { fire: [true, 1], ram: [true, 1] }, bell: { fire: [false, 0], ram: [true, 1] }, thorn: { fire: [true, 1], ram: [false, 0] } };
  const out = [];
  let ok = true;
  for (const v of Object.keys(want)) for (const attack of ['fire', 'ram']) {
    const r = trial(v, attack), [dead, n] = want[v][attack];
    const good = r.dead === dead && r.hits === n && (v === 'thorn' && attack === 'ram' ? r.hurts >= 1 : r.hurts === 0);
    out.push(`${v}/${attack}: ${good ? 'ok' : 'FAIL'} (${r.dead ? 'dead' : 'alive'} after ${r.hits} hit${r.hits === 1 ? '' : 's'}${r.hurts ? ', it hurt you' : ''})`);
    ok = ok && good;
  }
  delete E.damage; delete G.playerHurt;
  return { ok, out };
});
await browser.close();
process.exit(failed ? 1 : 0);
