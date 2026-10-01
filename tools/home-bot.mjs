// Reachability QA for Dawnhaven, the homeworld: drives the real player controller headlessly (tools/bot-inject.js) through the roads, the doors, the three secrets, the Elder and the gate.
// Usage: node tools/home-bot.mjs [scenario ...]   (default: all)  - needs the dev server on :5173 (GV_HMR=0 recommended; GV_URL=file:///.../docs/index.html tests a built file instead)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const want = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
await page.goto((process.env.GV_URL || 'http://127.0.0.1:5173/') + '?world=home&skip=1&preserve=1');
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
await run('world', () => {
  const G = __game;
  return { ok: G.realm.id === 'home' && G.realm.kind === 'homeworld' && G.day === 1 && G.gameplay.portals.length === 5 && !!G.portals && G.portals.list.length === 5 && G.level.name === 'Dawnhaven' && G.stats.gemsTotal === 250, realm: G.realm.id, day: G.day, portals: G.portals && G.portals.list.length };
});
await run('spokes', () => {
  // each spoke road can be driven end to end with the real controller, and the gems strewn along it are picked up on the way
  const G = __game, out = [], gems = {};
  for (const id of ['gloaming', 'frostbloom', 'tideglass', 'emberfall', 'skyweaver']) {
    const q = G.grid.paths.find((p) => p.id === 'spoke_' + id).pts[0];
    const g0 = G.stats.gems;
    __bot.place(q[0], q[2], 0);
    const r = __bot.follow('spoke_' + id, 0, 1, 3);
    gems[id] = G.stats.gems - g0;
    out.push(`${id}: ${r.ok ? 'ok' : r.reason + ' at ' + r.at + '/' + r.of} +${gems[id]}`);
    if (!r.ok) return { ok: false, out };
  }
  // (a bot that cuts corners misses some, and the Gloaming spoke's gems sit 2 m off the road: only a floor is asked for)
  const total = Object.values(gems).reduce((a, b) => a + b, 0), thin = ['frostbloom', 'tideglass', 'emberfall', 'skyweaver'].filter((id) => gems[id] < 2);
  return { ok: thin.length === 0 && total >= 20, out, gems, total, thin };
});
await run('north-road', () => {
  const q = __game.grid.paths.find((p) => p.id === 'north').pts[0];
  __bot.place(q[0], q[2], Math.PI);
  const r = __bot.follow('north', 0, 1, 3);
  return { ok: r.ok && __game.player.z < -80, ...r };
});
await run('arrival', () => {
  // the hero starts where he comes out of the Gloaming door's light, and is not on its trigger
  const G = __game, p = G.player, a = G.gameplay.arrivals.gloaming, d = G.portals.get('gloaming').def;
  __bot.place(a.x, a.z, a.yaw);
  __bot.tick(120);
  return { ok: Math.hypot(p.x - a.x, p.z - a.z) < 0.5 && !G.player.locked && !G.portals.busy && Math.hypot(p.x - d.x, p.z - d.z) > 9, at: [+p.x.toFixed(1), +p.z.toFixed(1)] };
});
await run('door-opens', () => {
  // walking into the awake door's light raises the 'portal' event (the app turns it into the trip to Gloaming Vale); the others only talk
  const G = __game, p = G.player;
  const seen = [];
  G.on('portal', (d) => seen.push(d.id));
  const d = G.portals.get('gloaming').def, s = Math.sin(d.yaw), c = Math.cos(d.yaw);
  __bot.place(d.x + s * 10, d.z + c * 10, d.yaw + Math.PI);
  __bot.goto(d.x, d.z, { tol: 0.5, timeout: 8, auto: false });
  __bot.tick(10);
  const r = { seen: seen.slice(), locked: p.locked, busy: !!G.portals.busy };
  G.portals.busy = null; p.locked = false; G.locked = false;
  return { ok: r.seen.join() === 'gloaming' && r.locked && r.busy, ...r };
});
await run('sealed-doors', () => {
  // the doors that still sleep stay shut: the hero runs at each one and is stopped by the stone, no trip begins, and the first one says what it is
  const G = __game, p = G.player, out = [];
  const seen = [];
  G.on('portal', (d) => seen.push(d.id));
  for (const id of ['frostbloom', 'tideglass', 'emberfall', 'skyweaver']) {
    const d = G.portals.get(id).def, s = Math.sin(d.yaw), c = Math.cos(d.yaw);
    __bot.place(d.x + s * 9, d.z + c * 9, d.yaw + Math.PI);
    __bot.goto(d.x - s * 3, d.z - c * 3, { tol: 0.4, timeout: 6, auto: false });
    __bot.tick(30);
    const along = (p.x - d.x) * s + (p.z - d.z) * c;
    out.push([id, +along.toFixed(1)]);
    if (along < 0.2) return { ok: false, reason: `${id}: he got through the stone`, out };
  }
  return { ok: seen.length === 0, out, trips: seen };
});
await run('gate-holds', () => {
  // the Guardian's gate is sealed: not through the field, not up the buttresses beside it, not round by gliding off the mountains
  const G = __game, p = G.player, L = G.level.guard, gz = L.z + 4;
  const log = [];
  const trials = [[0, gz + 14, 0, gz - 12], [-14, gz + 12, -4, gz - 14], [14, gz + 12, 4, gz - 14], [-26, gz + 14, 0, gz - 30], [26, gz + 14, 0, gz - 30]];
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
  // the first secret: from the south shore, hop the three stepping stones to the islet and its chest; the real controller, plain jumps
  const G = __game, K = G.level.lake, p = G.player;
  const stones = G.gameplay.placed.filter((q) => q.name === 'stepping_stone').sort((a, b) => b.z - a.z);
  const chest = G.gameplay.chests.find((c) => c.secret === 'pond');
  __bot.place(K.x, K.z + K.rz * 1.1, Math.PI);
  const out = [];
  for (const [x, z] of [...stones.map((q) => [q.x, q.z]), [chest.x, chest.z + 2.6]]) {
    const r = __bot.goto(x, z, { tol: 1.2, timeout: 9, auto: true });
    for (let i = 0; i < 90 && !p.grounded && !p.dead; i++) __bot.tick();
    out.push(r.ok ? 'ok' : r.reason);
    if (!r.ok || p.dead) return { ok: false, out, ...__bot.state() };
  }
  const drowned = p.dead || p.waterT > 0.1;
  return { ok: !drowned && Math.hypot(p.x - chest.x, p.z - chest.z) < 4 && p.y > -0.3, out, at: __bot.state() };
});
await run('pond-chest', () => {
  // ... and the chest opens to a breath of fire, and the secret is kept
  const G = __game, p = G.player, chest = G.gameplay.chests.find((c) => c.secret === 'pond');
  const c = G.objects.chests.find((q) => q.secret === 'pond');
  const before = G.stats.gems;
  __bot.place(chest.x, chest.z + 3.0, Math.PI, chest.y);
  for (let k = 0; k < 4 && !c.opened; k++) { __bot.tap('flame', 4); __bot.tick(30); }
  __bot.tick(120);
  return { ok: c.opened && G.stats.gems > before && __app.progress.home.secrets.includes('pond'), opened: c.opened, gems: G.stats.gems - before, secrets: __app.progress.home.secrets.slice() };
});
await run('elder', () => {
  // the Elder talks, in turn: a welcome, the doors that sleep, the gate, a hint, the count of secrets found
  const G = __game, p = G.player, N = G.npcs.npcs[0];
  const d = N.model.root;
  __bot.place(N.x + 2, N.z + 3, 0);
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
  const ok = speaker === 'ELDER WICK' && first && first.length >= 4 && /DAWNHAVEN/.test(first[0]) && /SLEEP/.test(first[1]) && /GUARDIAN/.test(first[2]) && second && second.length >= 2 && second.length < first.length && /SECRETS/.test(second.at(-1)) && !!d;
  return { ok, speaker, first, second };
});
await run('mill-lookout', () => {
  // the second: up the windmill road, round the hill, up the mill's wooden stair to the lookout at the top, where the chest stands
  const G = __game, p = G.player, W = G.level.windHill;
  const mill = G.gameplay.chests.find((c) => c.secret === 'mill');
  const q = G.grid.paths.find((r) => r.id === 'mill').pts[0];
  __bot.place(q[0], q[2], 0);
  const r = __bot.follow('mill', 0, 1, 3);
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
await run('garden-wall', () => {
  // the third: the hidden garden is sealed all round; a ram at its cracked wall opens it, and the chest inside is reachable
  const G = __game, p = G.player, K = G.level.garden, ux = Math.cos(K.open), uz = Math.sin(K.open);
  const wall = G.objects.walls[0];
  // sealed first: from eight directions he runs at the middle of the glade, gliding, and gets no nearer than the foot of the rock
  const near = [];
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2, sx = K.x + Math.cos(ang) * (K.r + 24), sz = K.z + Math.sin(ang) * (K.r + 24);
    __bot.place(sx, sz, Math.atan2(K.x - sx, K.z - sz));
    __bot.goto(K.x, K.z, { tol: 1.2, timeout: 7, auto: true, glide: true });
    __bot.tick(40);
    near.push(+Math.hypot(p.x - K.x, p.z - K.z).toFixed(1));
  }
  const sealed = Math.min(...near) > K.r + 0.5;
  // the ram: down the strip towards the wall, RAM held
  const sx = K.x + ux * (K.r + 22), sz = K.z + uz * (K.r + 22);
  __bot.place(sx, sz, Math.atan2(-ux, -uz));
  __bot.edge('charge'); __bot.ctl.charge = true;
  for (let i = 0; i < 240 && !wall.broken; i++) { __bot.ctl.my = 1; __bot.ctl.mx = 0; __bot.tick(); }
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
await run('all-secrets', () => {
  // all three are found and kept, and the Elder knows
  const G = __game, N = G.npcs.npcs[0];
  N.talks = 5;
  const lines = G.npcs.lines(N);
  const secrets = __app.progress.home.secrets.slice().sort();
  return { ok: secrets.join() === 'garden,mill,pond' && /ALL 3 SECRETS/.test(lines.join(' ')), secrets, last: lines.at(-1) };
});
await browser.close();
process.exit(failed ? 1 : 0);
