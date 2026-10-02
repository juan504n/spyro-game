// Reachability QA for Dawnhaven, the homeworld: drives the real player controller headlessly (tools/bot-inject.js) along its long roads, through the Crag's tunnels, halls and ledge road, out
// along the pier and up to the summit, to every door, the five secrets, the Elder and the gate.
// Usage: node tools/home-bot.mjs [scenario ...]   (default: all)  - needs the dev server on :5173 (GV_HMR=0 recommended; GV_URL=file:///.../docs/index.html tests a built file instead)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TUNNELS, RAMP, SUMMIT, CHAMBERS, tunnelAt, tunnelLength } from '../src/game/home/crag.js';
import { DOORS, GARDEN, inFront } from '../src/game/home/level.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const want = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
await page.goto((process.env.GV_URL || 'http://127.0.0.1:5173/') + '?world=home&skip=1&preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });
await page.addScriptTag({ path: path.join(here, 'bot-inject.js') });
await page.waitForTimeout(1500);

// geometry the scenarios share (computed here from the level's own data and handed to the page)
const tun = (name, step = 5) => { const L = tunnelLength(name), out = []; for (let s = 0; s <= L; s += step) { const q = tunnelAt(name, s); out.push([q.x, q.z]); } const e = tunnelAt(name, L); out.push([e.x, e.z]); return out; };
const dais = (id) => { const d = DOORS.find((q) => q.id === id); return inFront(d, 4.5); };
const DATA = {
  gate: tun('gate', 6), stair: tun('stair', 5), north: tun('north', 5), east: tun('east', 5),
  hall: [CHAMBERS.hall.x, CHAMBERS.hall.z], grotto: [CHAMBERS.grotto.x, CHAMBERS.grotto.z],
  ramp: RAMP.filter((_, i) => i % 2 === 0 || i === RAMP.length - 1).map((p) => [p[0], p[1]]),
  dais: Object.fromEntries(DOORS.map((d) => [d.id, dais(d.id)])),
  summit: { x: SUMMIT.x, y: SUMMIT.y, z: SUMMIT.z, r: SUMMIT.r },
  garden: { x: GARDEN.x, z: GARDEN.z, r: GARDEN.r, h: GARDEN.h, open: GARDEN.open },
  vaultTunnel: [tunnelAt('vault', 0), tunnelAt('vault', 5.5)].map((q) => [q.x, q.z]),
};
void TUNNELS;

let failed = 0;
const run = async (name, fn) => {
  if (want.length && !want.includes(name)) return;
  const t0 = Date.now();
  let r;
  try { r = await page.evaluate(fn, DATA); } catch (e) { r = { ok: false, reason: 'exception ' + e.message.slice(0, 200) }; }
  if (!(r && r.ok)) failed++;
  console.log((r && r.ok ? 'PASS' : 'FAIL').padEnd(5), name.padEnd(16), JSON.stringify(r), `(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
};

await page.evaluate(() => __bot.god());
await run('world', () => {
  const G = __game;
  return { ok: G.realm.id === 'home' && G.realm.kind === 'homeworld' && G.day === 1 && G.gameplay.portals.length === 5 && !!G.portals && G.portals.list.length === 5 && G.level.name === 'Dawnhaven' && G.stats.gemsTotal === G.gameplay.gemsTotal && G.gameplay.gemsTotal % 50 === 0, realm: G.realm.id, day: G.day, portals: G.portals && G.portals.list.length, gems: G.stats.gemsTotal };
});
await run('trunk-road', () => {
  // from where the hero comes out of the first door, the cobbled trunk road to the Crag: the whole of it, the gems along it picked up on the way
  const G = __game, a = G.gameplay.arrivals.gloaming;
  __bot.place(a.x, a.z, a.yaw);
  const g0 = G.stats.gems;
  const r = __bot.goto(28, 150, { tol: 2, timeout: 20, auto: true });
  if (!r.ok) return { ok: false, phase: 'to the road', ...r };
  const q = __bot.follow('main', 0, 1, 3);
  return { ok: q.ok && __game.player.z < -10, gems: G.stats.gems - g0, ...q };
});
await run('roads', () => {
  // each road can be driven end to end with the real controller (the Landing Cove's road to the Crag is above)
  const G = __game, out = [];
  for (const id of ['west', 'lake', 'ledgeway', 'canyon', 'crageast', 'ascent']) {
    const road = G.grid.paths.find((p) => p.id === id), q = road.pts[0];
    const g0 = G.stats.gems;
    __bot.place(q[0], q[2], 0, q[1]);
    const r = __bot.follow(id, 0, id === 'ascent' ? 0.9 : 1, 3);                     // (the Ascent's last stretch lies behind the sealed gate)
    out.push(`${id}: ${r.ok ? 'ok' : r.reason + ' at ' + r.at + '/' + r.of} +${G.stats.gems - g0}`);
    if (!r.ok) return { ok: false, out };
  }
  return { ok: true, out };
});
await run('crag-hall', (D) => {
  // the gate tunnel from the forecourt into the Echo Hall, to its middle
  const G = __game;
  __bot.place(6, -2, Math.PI);
  for (const [x, z] of [...D.gate, D.hall]) { const r = __bot.goto(x, z, { tol: 1.8, timeout: 14, auto: true }); if (!r.ok) return { ok: false, at: [x, z], ...r }; }
  return { ok: G.player.y < 10 && G.player.z < -44, end: __bot.state(), enclosure: +G.enclosure.toFixed(2) };
});
await run('crag-grotto', (D) => {
  // ... down the winding way to the Frost Grotto and across it to the Frostbloom door's dais
  const G = __game;
  __bot.place(D.hall[0], D.hall[1], 0);
  for (const [x, z] of [...D.stair, D.grotto, D.dais.frostbloom]) { const r = __bot.goto(x, z, { tol: 1.8, timeout: 14, auto: true }); if (!r.ok) return { ok: false, at: [x, z], ...r }; }
  return { ok: G.player.y < 6 && G.player.x > 30, end: __bot.state() };
});
await run('crag-north', (D) => {
  // ... and from the grotto north through the passage, out onto the Ascent
  const G = __game;
  __bot.place(D.grotto[0], D.grotto[1], 0);
  for (const [x, z] of D.north) { const r = __bot.goto(x, z, { tol: 1.8, timeout: 14, auto: true }); if (!r.ok) return { ok: false, at: [x, z], ...r }; }
  return { ok: G.player.z < -126, end: __bot.state() };
});
await run('crag-east', (D) => {
  // ... and from the hall east through its passage and out along the road to the canyon
  const G = __game;
  __bot.place(D.hall[0], D.hall[1], 0);
  for (const [x, z] of D.east) { const r = __bot.goto(x, z, { tol: 1.8, timeout: 14, auto: true }); if (!r.ok) return { ok: false, at: [x, z], ...r }; }
  return { ok: G.player.x > 55, end: __bot.state() };
});
await run('ledge', (D) => {
  // the ledge road: from the forecourt, under its arch, once and a bit round the mountain, up to the summit, and across it to the Skyweaver door's dais
  const G = __game;
  const q = G.grid.paths.find((p) => p.id === 'ledgeway').pts[0];
  __bot.place(q[0], q[2], 0);
  const f = __bot.follow('ledgeway', 0, 1, 2);
  if (!f.ok) return { ok: false, phase: 'ledgeway', ...f };
  for (const [i, [x, z]] of D.ramp.entries()) { const r = __bot.goto(x, z, { tol: 1.8, timeout: 14, auto: true }); if (!r.ok) return { ok: false, phase: 'ramp ' + i + '/' + D.ramp.length, at: [x, z], ...r }; }
  const [dx, dz] = D.dais.skyweaver;
  const r = __bot.goto(dx, dz, { tol: 1.6, timeout: 10, auto: true });
  return { ok: r.ok && G.player.y > D.summit.y - 1, end: __bot.state(), summitY: D.summit.y };
});
await run('pier', (D) => {
  // out along the lake road, the long pier, to the Tideglass door's dais
  const G = __game;
  const q = G.grid.paths.find((p) => p.id === 'lake').pts[0];
  __bot.place(q[0], q[2], 0);
  const f = __bot.follow('lake', 0, 1, 3);
  if (!f.ok) return { ok: false, phase: 'lake road', ...f };
  const [dx, dz] = D.dais.tideglass;
  for (const [x, z] of [[dx, dz + 38], [dx, dz + 22], [dx, dz + 8], [dx, dz]]) { const r = __bot.goto(x, z, { tol: 1.6, timeout: 12, auto: false }); if (!r.ok) return { ok: false, phase: 'pier', at: [x, z], ...r }; }
  __bot.tick(30);
  return { ok: G.player.y > 0 && G.player.y < 1.5 && !G.player.inWater, end: __bot.state() };
});
await run('forge', (D) => {
  // up the canyon to the forge's court and the Emberfall door's dais
  const G = __game;
  const q = G.grid.paths.find((p) => p.id === 'canyon').pts[0];
  __bot.place(q[0], q[2], 0);
  const f = __bot.follow('canyon', 0, 1, 3);
  if (!f.ok) return { ok: false, phase: 'canyon', ...f };
  const [dx, dz] = D.dais.emberfall;
  const r = __bot.goto(dx, dz, { tol: 1.6, timeout: 12, auto: true });
  return { ok: r.ok && G.player.z < -150, end: __bot.state() };
});
await run('arrival', () => {
  // the hero starts where he comes out of the Gloaming door's light, and is not on its trigger
  const G = __game, p = G.player, a = G.gameplay.arrivals.gloaming, d = G.portals.get('gloaming').def;
  __bot.place(a.x, a.z, a.yaw);
  __bot.tick(120);
  return { ok: Math.hypot(p.x - a.x, p.z - a.z) < 0.5 && !G.player.locked && !G.portals.busy && Math.hypot(p.x - d.x, p.z - d.z) > 9 && Math.hypot(G.gameplay.spawn.x - a.x, G.gameplay.spawn.z - a.z) < 0.5, at: [+p.x.toFixed(1), +p.z.toFixed(1)] };
});
for (const door of ['gloaming', 'frostbloom', 'emberfall']) { DATA.door = door; await run(`door-opens-${door}`, (D) => {
  // walking into an awake door's light raises the 'portal' event (the app turns it into the trip to the realm behind it); the others only talk
  const G = __game, p = G.player, door = D.door;
  const seen = [];
  G.on('portal', (d) => seen.push(d.id));
  const d = G.portals.get(door).def, s = Math.sin(d.yaw), c = Math.cos(d.yaw);
  __bot.place(d.x + s * 10, d.z + c * 10, d.yaw + Math.PI, d.y);
  __bot.goto(d.x, d.z, { tol: 0.5, timeout: 8, auto: false });
  __bot.tick(10);
  const r = { seen: seen.slice(), locked: p.locked, busy: !!G.portals.busy };
  G.portals.busy = null; p.locked = false; G.locked = false;
  return { ok: r.seen.join() === door && r.locked && r.busy, ...r };
}); }
await run('sealed-doors', () => {
  // the doors that still sleep stay shut: the hero runs at each one and is stopped by the stone, no trip begins
  const G = __game, p = G.player, out = [];
  const seen = [];
  G.on('portal', (d) => seen.push(d.id));
  for (const id of ['tideglass', 'skyweaver']) {
    const dd = G.portals.get(id).def, s = Math.sin(dd.yaw), c = Math.cos(dd.yaw);
    __bot.place(dd.x + s * 5, dd.z + c * 5, dd.yaw + Math.PI, dd.y);
    __bot.goto(dd.x - s * 3, dd.z - c * 3, { tol: 0.4, timeout: 6, auto: false });
    __bot.tick(30);
    const along = (p.x - dd.x) * s + (p.z - dd.z) * c;
    out.push([id, +along.toFixed(1)]);
    if (along < 0.2) return { ok: false, reason: `${id}: he got through the stone`, out };
  }
  return { ok: seen.length === 0, out, trips: seen };
});
await run('gate-holds', () => {
  // the Guardian's gate is sealed: not through the field, not up the buttresses beside it, not round by gliding off the mountains
  const G = __game, p = G.player, L = G.level.guard, gz = L.z + 6;
  const log = [];
  // (all from the court's floor, where he can walk: the buttresses' feet begin at z = gz + 7)
  const trials = [[0, gz + 14, 0, gz - 14], [-8, gz + 12, -4, gz - 16], [8, gz + 12, 4, gz - 16], [-11, gz + 13, -9, gz - 22], [11, gz + 13, 9, gz - 22], [-6, gz + 22, 0, gz - 30]];
  for (const [sx, sz, tx, tz] of trials) {
    __bot.place(sx, sz, Math.atan2(tx - sx, tz - sz));
    __bot.goto(tx, tz, { tol: 1.5, timeout: 9, auto: true, glide: true });
    __bot.tick(80);
    log.push(+p.z.toFixed(1));
  }
  const behind = log.filter((z) => z < gz - 1.2);
  return { ok: behind.length === 0, gateZ: gz, endsAt: log };
});
await run('pond-stones', () => {
  // the first secret: from the long pier, hop the three stepping stones west to the islet and its chest; the real controller, plain jumps
  const G = __game, p = G.player;
  const stones = G.gameplay.placed.filter((q) => q.name === 'stepping_stone').sort((a, b) => b.x - a.x);
  const chest = G.gameplay.chests.find((c) => c.secret === 'pond');
  const td = G.portals.get('tideglass').def;
  __bot.place(td.x, stones[0].z + 1, -Math.PI / 2, 0.3);
  const out = [];
  for (const [x, z] of [...stones.map((q) => [q.x, q.z]), [chest.x + 2.6, chest.z]]) {
    const r = __bot.goto(x, z, { tol: 1.2, timeout: 9, auto: true });
    for (let i = 0; i < 90 && !p.grounded && !p.dead; i++) __bot.tick();
    out.push(r.ok ? 'ok' : r.reason);
    if (!r.ok || p.dead) return { ok: false, out, ...__bot.state() };
  }
  const drowned = p.dead || p.waterT > 0.1;
  return { ok: !drowned && Math.hypot(p.x - chest.x, p.z - chest.z) < 4 && p.y > -0.3, out, at: __bot.state() };
});
const openChest = (secret) => () => 0;
void openChest;
await run('pond-chest', () => {
  // ... and the chest opens to a breath of fire, and the secret is kept
  const G = __game, p = G.player, chest = G.gameplay.chests.find((c) => c.secret === 'pond');
  const c = G.objects.chests.find((q) => q.secret === 'pond');
  const before = G.stats.gems;
  __bot.place(chest.x + 3.0, chest.z, -Math.PI / 2, chest.y);
  for (let k = 0; k < 4 && !c.opened; k++) { __bot.tap('flame', 4); __bot.tick(30); }
  __bot.tick(120);
  return { ok: c.opened && G.stats.gems > before && __app.progress.home.secrets.includes('pond'), opened: c.opened, gems: G.stats.gems - before, secrets: __app.progress.home.secrets.slice() };
});
await run('elder', () => {
  // the Elder talks, in turn: a welcome, the lie of the land, the doors that sleep, the gate, then a hint and the count of secrets found
  const G = __game, p = G.player, N = G.npcs.npcs[0];
  const d = N.model.root;
  __bot.place(N.x - 2, N.z + 3, 0);
  __bot.tick(10);
  G.hud.dlg = null; G.locked = false; p.locked = false; N.talking = false; N.talks = 0;      // (he greeted the hero as he came close: start again)
  G.npcs.talk(N);
  const dlg = G.hud.dlg;
  const first = dlg && dlg.pages.slice();
  const speaker = dlg && dlg.speaker;
  G.hud.dlg = null; G.locked = false; p.locked = false; N.talking = false;
  G.npcs.talk(N);
  const second = G.hud.dlg && G.hud.dlg.pages.slice();
  G.hud.dlg = null; G.locked = false; p.locked = false; N.talking = false;
  const a = G.gameplay.arrivals.gloaming;
  const ok = speaker === 'ELDER WICK' && first && first.length >= 5 && /DAWNHAVEN/.test(first[0]) && /CRAG/.test(first[1]) && /SLEEP/.test(first[2]) && /GUARDIAN/.test(first[3]) && second && second.length >= 2 && second.length < first.length && /SECRETS/.test(second.at(-1)) && !!d && Math.hypot(N.x - a.x, N.z - a.z) < 30;
  return { ok, speaker, first, second };
});
await run('mill-lookout', () => {
  // the second: up the terraces' road to the windmill on the ridge, up the mill's wooden stair to the lookout at the top, where the chest stands
  const G = __game, p = G.player;
  const mill = G.gameplay.chests.find((c) => c.secret === 'mill');
  const W = G.gameplay.placed.find((q) => q.name === 'windmill_body');
  const road = G.grid.paths.find((r) => r.id === 'west'), q = road.pts[0];
  __bot.place(q[0], q[2], Math.PI);
  const r = __bot.follow('west', 0, 1, 3);
  if (!r.ok) return { ok: false, phase: 'road', ...r };
  const steps = G.collision.colliders.filter((c) => c.tag === 'step' && c.top && Math.hypot(c.x - W.x, c.z - W.z) < 12).sort((a, b) => a.y1 - b.y1);
  let last = null;
  for (const s of steps) {
    const g = __bot.goto(s.x, s.z, { tol: 0.9, timeout: 4, auto: true });
    if (!g.ok) return { ok: false, phase: 'stair', stepY: +s.y1.toFixed(1), ...g, steps: steps.length };
    last = s;
  }
  const g2 = __bot.goto(mill.x, mill.z, { tol: 2.4, timeout: 8, auto: true });
  return { ok: g2.ok && p.y > mill.y - 1.5, steps: steps.length, y: +p.y.toFixed(1), lookout: +mill.y.toFixed(1), last: last && +last.y1.toFixed(1) };
});
await run('mill-chest', () => {
  // ... and the chest up there opens to a breath of fire: the second secret is kept
  const G = __game, p = G.player, chest = G.gameplay.chests.find((c) => c.secret === 'mill'), c = G.objects.chests.find((q) => q.secret === 'mill');
  const before = G.stats.gems;
  for (let k = 0; k < 4 && !c.opened; k++) {
    __bot.place(p.x, p.z, Math.atan2(chest.x - p.x, chest.z - p.z), p.y);
    __bot.tap('flame', 4); __bot.tick(30);
  }
  __bot.tick(120);
  return { ok: c.opened && G.stats.gems > before && __app.progress.home.secrets.includes('mill'), opened: c.opened, gems: G.stats.gems - before, secrets: __app.progress.home.secrets.slice() };
});
await run('garden-wall', (D) => {
  // the third: the hidden garden is sealed all round; a ram at its cracked wall opens it, and the chest inside is reachable
  const G = __game, p = G.player, K = D.garden, ux = Math.cos(K.open), uz = Math.sin(K.open);
  const wall = G.objects.walls.find((w) => Math.hypot(w.x - (K.x + ux * (K.r + 5.5)), w.z - (K.z + uz * (K.r + 5.5))) < 3);
  if (!wall) return { ok: false, reason: 'no wall at the garden\'s mouth' };
  // sealed first: from eight directions he runs at the middle of the glade, gliding, and gets no nearer than the foot of the rock
  const near = [];
  for (let a = 0; a < 16; a++) {
    // (from the open ground round about: the starts that lie up on the mountains, where he cannot walk, are not tried)
    const ang = (a / 16) * Math.PI * 2, sx = K.x + Math.cos(ang) * (K.r + 26), sz = K.z + Math.sin(ang) * (K.r + 26);
    if (G.grid.heightAt(sx, sz) > K.h + 6 || G.grid.slopeAt(sx, sz) > 0.3) continue;
    __bot.place(sx, sz, Math.atan2(K.x - sx, K.z - sz));
    __bot.goto(K.x, K.z, { tol: 1.2, timeout: 7, auto: true, glide: true });
    __bot.tick(40);
    near.push(+Math.hypot(p.x - K.x, p.z - K.z).toFixed(1));
  }
  const sealed = near.length >= 3 && Math.min(...near) > K.r + 0.5;
  // the ram: along the strip towards the wall, RAM held
  const sx = K.x + ux * (K.r + 24), sz = K.z + uz * (K.r + 24);
  __bot.place(sx, sz, Math.atan2(-ux, -uz));
  __bot.edge('charge'); __bot.ctl.charge = true;
  for (let i = 0; i < 260 && !wall.broken; i++) { __bot.ctl.my = 1; __bot.ctl.mx = 0; __bot.tick(); }
  __bot.ctl.charge = false; __bot.ctl.my = 0;
  const broken = wall.broken;
  __bot.tick(60);
  const chest = G.gameplay.chests.find((c) => c.secret === 'garden');
  const r = __bot.goto(chest.x, chest.z, { tol: 1.8, timeout: 12, auto: true });
  return { ok: sealed && broken && r.ok, sealed, nearest: near, broken, chestReached: r.ok, at: __bot.state() };
});
await run('garden-chest', () => {
  // ... and the garden's chest: the third secret is kept
  const G = __game, p = G.player, chest = G.gameplay.chests.find((c) => c.secret === 'garden'), c = G.objects.chests.find((q) => q.secret === 'garden');
  const before = G.stats.gems;
  for (let k = 0; k < 4 && !c.opened; k++) {
    __bot.place(p.x, p.z, Math.atan2(chest.x - p.x, chest.z - p.z), p.y);
    __bot.tap('flame', 4); __bot.tick(30);
  }
  __bot.tick(120);
  return { ok: c.opened && G.stats.gems > before && __app.progress.home.secrets.includes('garden'), opened: c.opened, gems: G.stats.gems - before, secrets: __app.progress.home.secrets.slice() };
});
await run('vault-wall', (D) => {
  // the fourth: the hall's north passage is shut by a cracked wall; a ram opens it, and the chest in the little crystal room behind is reachable
  const G = __game, p = G.player;
  const [a, b] = D.vaultTunnel;
  const wall = G.objects.walls.find((w) => Math.hypot(w.x - b[0], w.z - b[1]) < 3);
  if (!wall) return { ok: false, reason: 'no wall in the vault passage' };
  const chest = G.gameplay.chests.find((c) => c.secret === 'vault');
  // shut: he walks at it and is stopped
  __bot.place(a[0], a[1] + 4, Math.PI);
  __bot.goto(chest.x, chest.z, { tol: 1.5, timeout: 6, auto: true });
  const stopped = p.z > b[1] && !wall.broken;
  // the ram: from the hall, just outside the ring of stones, along the passage, RAM held (pressed again whenever a charge has run out)
  __bot.place(a[0], a[1] + 4.5, Math.PI);
  for (let i = 0; i < 200 && !wall.broken; i++) { if (!p.chargeT) { __bot.edge('charge'); } __bot.ctl.charge = true; __bot.ctl.my = 1; __bot.ctl.mx = 0; __bot.tick(); }
  __bot.ctl.charge = false; __bot.ctl.my = 0;
  const broken = wall.broken;
  __bot.tick(60);
  const r = __bot.goto(chest.x, chest.z + 2.2, { tol: 1.8, timeout: 12, auto: true });
  return { ok: stopped && broken && r.ok, stopped, broken, chestReached: r.ok, at: __bot.state() };
});
await run('vault-chest', () => {
  // ... and the vault's chest: the fourth secret is kept
  const G = __game, p = G.player, chest = G.gameplay.chests.find((c) => c.secret === 'vault'), c = G.objects.chests.find((q) => q.secret === 'vault');
  const before = G.stats.gems;
  for (let k = 0; k < 4 && !c.opened; k++) {
    __bot.place(p.x, p.z, Math.atan2(chest.x - p.x, chest.z - p.z), p.y);
    __bot.tap('flame', 4); __bot.tick(30);
  }
  __bot.tick(120);
  return { ok: c.opened && G.stats.gems > before && __app.progress.home.secrets.includes('vault'), opened: c.opened, gems: G.stats.gems - before, secrets: __app.progress.home.secrets.slice() };
});
await run('summit-chest', (D) => {
  // the fifth: on the summit beside the Skyweaver door; the chest opens to a breath of fire
  const G = __game, p = G.player, chest = G.gameplay.chests.find((c) => c.secret === 'summit'), c = G.objects.chests.find((q) => q.secret === 'summit');
  const before = G.stats.gems;
  __bot.place(chest.x + 3, chest.z + 1, Math.atan2(chest.x - chest.x - 3, -1), D.summit.y);
  for (let k = 0; k < 4 && !c.opened; k++) {
    __bot.place(p.x, p.z, Math.atan2(chest.x - p.x, chest.z - p.z), p.y);
    __bot.tap('flame', 4); __bot.tick(30);
  }
  __bot.tick(120);
  return { ok: c.opened && G.stats.gems > before && __app.progress.home.secrets.includes('summit'), opened: c.opened, gems: G.stats.gems - before, secrets: __app.progress.home.secrets.slice() };
});
await run('all-secrets', () => {
  // all five are found and kept, and the Elder knows
  const G = __game, N = G.npcs.npcs[0];
  N.talks = 5;
  const lines = G.npcs.lines(N);
  const secrets = __app.progress.home.secrets.slice().sort();
  return { ok: secrets.join() === 'garden,mill,pond,summit,vault' && /ALL 5 SECRETS/.test(lines.join(' ')), secrets, last: lines.at(-1) };
});
await browser.close();
process.exit(failed ? 1 : 0);
