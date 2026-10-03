// The way between the worlds, end to end in the running game: the last lantern of Gloaming Vale opens a portal over it, a jump in its ring of light carries the hero up into it, Dawnhaven
// receives him, and the door there takes him back to the vale, restored (and the portal over the lantern takes him home again). Real keys and the real loop; between the steps the app's clock is
// run forward in 1/30 s steps so a trip does not wait in real time (a world is still built the real way, behind the loading bar).
//   node tools/portal-test.mjs      (needs the dev server on :5173, GV_HMR=0 recommended; GV_URL=file:///.../docs/index.html tests a built file instead)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = process.env.GV_URL || 'http://127.0.0.1:5173/';
const KEY = 'gloaming-vale/progress/v1';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message.slice(0, 300)); });
page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|GL Driver/.test(m.text())) { errors.push(m.text()); console.log('[error]', m.text().slice(0, 300)); } });

const ev = (fn, arg) => page.evaluate(fn, arg);
const ff = (sec) => ev((s) => { for (let t = 0; t < s; t += 1 / 30) window.__app.update(1 / 30); }, sec);
const press = async (key) => { await page.keyboard.down(key); await ff(0.1); await page.keyboard.up(key); };
const load = async (query) => {
  await page.goto(BASE + query + (query.includes('?') ? '&' : '?') + 'preserve=1');
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  const err = await ev(() => window.__error);
  if (err) throw new Error('boot error: ' + String(err).slice(0, 300));
  await page.focus('canvas').catch(() => {});
  await ff(0.5);
};
/** wait until the trip is over and the hero stands in `realm` (the world is built for real, behind the loading bar); if he never does, nothing after it means anything: the run ends */
const arrived = async (realm) => {
  try { await page.waitForFunction((r) => window.__app.state === 'play' && !window.__app.travel && window.__game.realm.id === r && !window.__game.disposed, realm, { timeout: 120000 }); }
  catch (e) {
    console.log('FAIL '.padEnd(6) + `arrival in ${realm}`.padEnd(22), JSON.stringify(await ev(() => ({ state: window.__app.state, realm: window.__game.realm.id, travel: window.__app.travel && window.__app.travel.phase }))));
    await browser.close();
    process.exit(1);
  }
};
/** what is on the GPU: everything the scene draws is uploaded once first (a geometry or a texture only goes up when it is first drawn, so the count would otherwise depend on where the camera happened to look) */
const memory = () => ev(() => {
  const g = window.__game, r = g.gfx.renderer, culled = [], root = g.counter.root, shown = root.visible;
  g.scene.traverse((o) => { if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
  r.render(g.scene, g.camera);
  root.visible = true; r.render(g.overlay.scene, g.overlay.camera); root.visible = shown;          // (the gem counter's numerals go up when it first shows)
  for (const o of culled) o.frustumCulled = true;
  const m = r.info.memory, uniq = (root) => { const set = new Set(); root.traverse((o) => { if (o.geometry) set.add(o.geometry); }); return set.size; };
  return { geos: m.geometries, tex: m.textures, scene: uniq(g.scene), overlay: uniq(g.overlay.scene) };
});
const saved = () => ev((k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, KEY);
/** the lantern room of the Great Beacon: where the ring of light lies */
const inRoom = (dx, dz) => ev(([dx, dz]) => { const g = window.__game, B = g.beacons.list.find((b) => b.def.id === 'dawn'); g.player.place(B.x + dx, B.y - 1.0 + 0.05, B.z + dz, Math.PI); g.cam.snapBehind(g.player); }, [dx, dz]);

let failed = 0;
const check = async (name, fn) => {
  const t0 = Date.now();
  let r;
  try { r = await fn(); } catch (e) { r = { ok: false, reason: 'exception ' + String(e.message).slice(0, 240) }; }
  if (!(r && r.ok)) failed++;
  console.log((r && r.ok ? 'PASS' : 'FAIL').padEnd(5), name.padEnd(22), JSON.stringify(r), `(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
};

await load('?skip=1');
const mem = {};

await check('boot', async () => {
  const r = await ev(() => { const g = window.__game, d = g.portals.get('dawn'); return { realm: g.realm.id, restored: g.restored, state: d && d.state, visible: d && d.model.root.visible, beacons: g.stats.beacons }; });
  return { ok: r.realm === 'gloaming' && r.restored === false && r.state === 'closed' && !r.visible && r.beacons === 0, ...r };
});

await ev(() => window.__game.objects.openBarrier());
await ff(5);

await check('shut-until-last-lantern', async () => {
  // before the last lantern burns there is no ring of light on the floor of the lantern room: a jump there is only a jump
  await inRoom(2.4, 3.2);
  await ff(0.5);
  await press('Space');
  await ff(1);
  const r = await ev(() => { const g = window.__game, p = g.player; return { carry: !!p.carry, state: window.__app.state, travel: !!window.__app.travel }; });
  return { ok: !r.carry && r.state === 'play' && !r.travel, ...r };
});

await check('finale-opens-portal', async () => {
  await ev(() => { const g = window.__game; for (const b of g.beacons.list) g.beacons.ignite(b); });
  await ff(14);
  const r = await ev(() => { const g = window.__game, d = g.portals.get('dawn'), p = d.def; return { state: window.__app.state, open: g.portals.isOpen('dawn'), k: +d.model.k.toFixed(2), visible: d.model.root.visible, at: [p.x, p.y + p.cy, p.z].map((v) => +v.toFixed(1)), beacons: g.stats.beacons }; });
  const s = await saved();
  const done = !!(s && s.realms && s.realms.gloaming && s.realms.gloaming.done);
  return { ok: r.state === 'results' && r.open && r.k > 0.9 && r.visible && r.beacons === 5 && done, saved: done, ...r };
});

await ev(() => window.__app.resumeFromResults());
await ff(0.5);
await ev(() => { window.__events = []; window.__game.on('portal', (d) => window.__events.push(d.id)); });

await check('jump-outside-the-ring', async () => {
  // a jump from the floor of the lantern room but outside the ring of light (6.6 m from the axis, the ring is 5.4 m) does not carry him
  await inRoom(6.6, 0);
  await ff(0.5);
  const before = await ev(() => { const g = window.__game, d = g.portals.get('dawn'); return { inZone: !!d.inZone }; });
  await press('Space');
  await ff(1.2);
  const r = await ev(() => { const g = window.__game, p = g.player; return { carry: !!p.carry, state: window.__app.state, events: window.__events.length }; });
  return { ok: !before.inZone && !r.carry && r.state === 'play' && r.events === 0, ...before, ...r };
});

await check('jump-inside-the-ring', async () => {
  // inside it the light picks him up: he is carried (no control), spirals up round the lantern and the trip begins when he enters the portal
  await inRoom(2.4, 3.2);
  await ff(0.5);
  const inZone = await ev(() => !!window.__game.portals.get('dawn').inZone);
  await press('Space');
  await ff(0.4);
  const a = await ev(() => { const g = window.__game, p = g.player; return { carry: !!p.carry, locked: g.locked, y: +p.y.toFixed(1), state: window.__app.state }; });
  await ff(0.8);
  const y1 = await ev(() => +window.__game.player.y.toFixed(1));
  let b = null;
  for (let i = 0; i < 12 && !(b && b.state === 'traveling'); i++) { await ff(0.4); b = await ev(() => ({ state: window.__app.state, events: window.__events.slice() })); }
  await ff(1.5);
  const c = await ev(() => { const g = window.__game; return { state: window.__app.state, fadeA: +g.fade.a.toFixed(2), color: g.fade.color.slice(), phase: window.__app.travel && window.__app.travel.phase, events: window.__events.slice() }; });
  return { ok: inZone && a.carry && a.locked && a.state === 'play' && y1 > a.y + 3 && b.state === 'traveling' && c.fadeA > 0.9 && c.color.join() === '1,1,1' && c.events.join() === 'dawn', inZone, ride: a, y1, travelling: b && b.state, ...c };
});

await arrived('home');
await ff(1);
mem.home1 = await memory();

await check('arrive-in-dawnhaven', async () => {
  const r = await ev(() => {
    const g = window.__game, p = g.player, d = g.portals.get('gloaming'), a = d.def;
    const el = g.npcs.npcs[0];
    return {
      realm: g.realm.id, kind: g.realm.kind, mode: g.mode, day: g.day, lanterns: g.stats.beacons, locked: g.locked || p.locked, gold: d.done, restored: g.restored,
      fromDoor: +Math.hypot(p.x - a.x, p.z - a.z).toFixed(1), elder: el && el.name, banner: g.hud.bannerState && g.hud.bannerState.title, carry: !!p.carry, vanished: !!p.vanished, secrets: window.__app.progress.home.secrets.length,
    };
  });
  return { ok: r.realm === 'home' && r.kind === 'homeworld' && r.mode === 'play' && r.day === 1 && r.lanterns === 1 && !r.locked && r.gold && !r.restored && r.fromDoor > 9 && r.fromDoor < 25 && r.elder === 'ELDER WICK' && r.banner === 'DAWNHAVEN' && !r.carry, ...r };
});

await check('doors-know-the-realms', async () => {
  const r = await ev(() => { const g = window.__game; return g.portals.list.map((x) => [x.def.id, x.state, x.done]); });
  const gold = r.filter((x) => x[2]).map((x) => x[0]), open = r.filter((x) => x[1] === 'open').map((x) => x[0]);
  return { ok: gold.join() === 'gloaming' && open.join() === 'gloaming,frostbloom,tideglass,emberfall,skyweaver', gold, open };          // (all five doors awake; only the realm he has restored is gold)
});

await check('title-offers-dawnhaven', async () => {
  const r = await ev(() => { const it = window.__app.titlePage().items.find((i) => i.label === 'VISIT DAWNHAVEN'); return { has: !!it, hidden: it ? it.hidden() : null }; });
  return { ok: r.has && r.hidden === false, ...r };
});

// the door: walk into the light
await ev(() => { const g = window.__game, d = g.portals.get('gloaming').def, s = Math.sin(d.yaw), c = Math.cos(d.yaw); g.player.place(d.x + s * 0.3, g.grid.heightAt(d.x, d.z) + 0.05, d.z + c * 0.3, d.yaw + Math.PI); });
await ff(0.2);
await check('door-starts-the-trip', async () => {
  const r = await ev(() => { const g = window.__game; return { state: window.__app.state, to: window.__app.travel && window.__app.travel.id, color: window.__app.travel && window.__app.travel.color.join(), locked: g.locked }; });
  return { ok: r.state === 'traveling' && r.to === 'gloaming' && r.color === '1,1,1' && r.locked, ...r };
});
await ff(3);
await arrived('gloaming');
await ff(1);
mem.realm2 = await memory();

await check('vale-is-restored', async () => {
  const r = await ev(() => {
    const g = window.__game, o = g.objects, pc = o.portcullis, b = o.barrier, d = g.portals.get('dawn');
    return {
      restored: g.restored, mode: g.mode, state: window.__app.state, day: g.day, lanterns: g.stats.beacons, lit: g.beacons.list.map((x) => x.litFlag && x.lit === 1).every(Boolean), count: g.beacons.list.length,
      braziers: o.braziers.every((x) => x.lit && x.l === 1), portcullis: pc.open === 1 && !pc.c.solid && Math.abs(pc.model.raised - 1) < 0.01, gate: b.open === 1 && !b.c.solid && !b.model.root.visible, ward: !o.ward.model.root.visible,
      portal: g.portals.isOpen('dawn'), settled: +d.model.k.toFixed(2), banner: g.hud.bannerState && g.hud.bannerState.sub, gems: g.stats.gems, total: g.stats.gemsTotal, snuffers: g.enemies.list ? g.enemies.list.length : null,
    };
  });
  return { ok: r.restored && r.mode === 'complete' && r.state === 'play' && r.day === 1 && r.lanterns === 5 && r.lit && r.count === 5 && r.braziers && r.portcullis && r.gate && r.ward && r.portal && r.settled === 1 && /RESTORED/.test(r.banner) && r.gems < 5 && r.total === 700, ...r };         // (a visit counts its own gems: the pier's first one may be in the bag)
});

await check('no-finale-again', async () => {
  // nothing of it plays out again: no finale, no results, no banner of a lantern lit, and the lantern room's ring is there for the ride home
  await ff(6);
  const r = await ev(() => { const g = window.__game; return { state: window.__app.state, mode: g.mode, cin: g.cam.inCinematic, banner: g.hud.bannerState && g.hud.bannerState.title, hint: g.hud.hintState && g.hud.hintState.text }; });
  return { ok: r.state === 'play' && r.mode === 'complete' && !r.cin && !/LIT|SUN RISES|OPENED/.test(r.banner || ''), ...r };
});

await check('realm-spawn-is-fresh-world', async () => {
  // everything else is as on the first visit: the hero starts on the pier, the vases are whole, the Snuffers are about
  const r = await ev(() => { const g = window.__game, s = g.gameplay.spawn; return { vases: g.objects.vases.filter((v) => !v.broken).length, of: g.objects.vases.length, enemies: g.gameplay.enemies.length, atSpawn: +Math.hypot(g.player.x - s.x, g.player.z - s.z).toFixed(1) }; });
  return { ok: r.vases === r.of && r.of >= 10 && r.enemies >= 10 && r.atSpawn < 3, ...r };
});

// and home again by the ring of light
await inRoom(2.4, 3.2);
await ff(0.5);
await ev(() => { window.__events = []; window.__game.on('portal', (d) => window.__events.push(d.id)); window.__game.stats.gems = 123; });
await check('ride-home-again', async () => {
  const inZone = await ev(() => !!window.__game.portals.get('dawn').inZone);
  await press('Space');
  await ff(0.4);
  const carry = await ev(() => !!window.__game.player.carry);
  for (let i = 0; i < 20; i++) { await ff(0.5); if (await ev(() => window.__app.state === 'traveling')) break; }
  const s = await saved();
  return { ok: inZone && carry && s.realms.gloaming.gems >= 123, inZone, carry, bestGems: s.realms.gloaming.gems };
});
await ff(3);
await arrived('home');
await ff(1);
mem.home2 = await memory();

await check('no-leak-between-trips', async () => {
  // a world that is let go of leaves nothing on the GPU: the same world built a second time costs exactly what the first did
  const d = { geos: mem.home2.geos - mem.home1.geos, tex: mem.home2.tex - mem.home1.tex };
  return { ok: d.geos === 0 && d.tex === 0, home1: mem.home1, home2: mem.home2, realm: mem.realm2, diff: d };
});

await check('best-gems-kept', async () => {
  const s = await saved();
  const r = s.realms.gloaming;
  return { ok: r.done && r.gems >= 123 && r.gemsTotal === 700, ...r };
});

// ---- the homeworld on its own: entered by name, and what it has found is kept ----------------------------------------------
await load('?world=home&skip=1');
await check('world=home', async () => {
  const r = await ev(() => { const g = window.__game; return { realm: g.realm.id, lanterns: g.stats.beacons, gold: g.portals.get('gloaming').done, state: window.__app.state, mode: g.mode }; });
  return { ok: r.realm === 'home' && r.lanterns === 1 && r.gold && r.state === 'play', ...r };
});
await check('secret-is-kept', async () => {
  await ev(() => { const g = window.__game, c = g.objects.chests.find((q) => q.secret === 'pond'); g.objects._openChest(c); });
  await ff(0.5);
  const s1 = await saved();
  await load('?world=home&skip=1');
  const r = await ev(() => { const g = window.__game, N = g.npcs.npcs[0]; N.talks = 5; return { secrets: window.__app.progress.home.secrets.slice(), lines: g.npcs.lines(N), total: g.objects.chests.filter((q) => q.secret).length }; });
  return { ok: s1.home.secrets.join() === 'pond' && r.secrets.join() === 'pond' && r.total === 5 && new RegExp(`1 OF ${r.total} SECRETS`).test(r.lines.join(' ')), stored: s1.home.secrets, after: r.secrets, total: r.total, lines: r.lines.slice(-1) };
});

// ---- and by the title screen's menu, from the vale's title ----------------------------------------------------------------
await load('');
await check('title-visit-dawnhaven', async () => {
  const before = await ev(() => ({ state: window.__app.state, realm: window.__game.realm.id }));
  await ev(() => { const a = window.__app; a.titlePage().items.find((i) => i.label === 'VISIT DAWNHAVEN').action(a.menu); });
  await ff(3);
  await arrived('home');
  await ff(1);
  const r = await ev(() => { const g = window.__game; return { realm: g.realm.id, mode: g.mode, state: window.__app.state, hud: g.hud.visible, locked: !!(g.locked || g.player.locked), cinematic: g.cam.inCinematic, lanterns: g.stats.beacons }; });
  return { ok: before.state === 'title' && before.realm === 'gloaming' && r.realm === 'home' && r.mode === 'play' && r.state === 'play' && r.hud && !r.locked && !r.cinematic && r.lanterns === 1, before, ...r };
});

await check('no-errors', async () => ({ ok: errors.length === 0, errors: errors.slice(0, 3) }));

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
