// A realm played end to end in the running game, whatever it is: it boots at ?world=<id>, the hero stands on its ground, every goal is lit by breathing fire at it (real keys, the real loop), the
// day climbs, the gate (if the brief has one) opens, the last goal starts the finale and opens the ring of light over it, a jump in the ring carries the hero up and out to the world the realm
// leads to, and the realm entered again from there is found restored. Between the steps the app's clock is run forward in 1/30 s steps so waiting does not take real time.
//   node tools/realm-test.mjs <realm id>      (needs the dev server on :5173, GV_HMR=0 recommended; GV_URL=http://127.0.0.1:PORT/ tests another server, e.g. a scratch checkout's)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const id = process.argv[2];
if (!id) { console.log('usage: node tools/realm-test.mjs <realm id>'); process.exit(1); }
const BASE = process.env.GV_URL || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message.slice(0, 300)); });
page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|GL Driver/.test(m.text())) { errors.push(m.text()); console.log('[error]', m.text().slice(0, 300)); } });

const ev = (fn, arg) => page.evaluate(fn, arg);
const ff = (sec) => ev((s) => { for (let t = 0; t < s; t += 1 / 30) window.__app.update(1 / 30); }, sec);
const load = async (query) => {
  await page.goto(BASE + query + (query.includes('?') ? '&' : '?') + 'preserve=1');
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });
  const err = await ev(() => window.__error);
  if (err) throw new Error('boot error: ' + String(err).slice(0, 300));
  await page.focus('canvas').catch(() => {});
  await ff(0.5);
};
let failed = 0;
const check = async (name, fn) => {
  const t0 = Date.now();
  let r;
  try { r = await fn(); } catch (e) { r = { ok: false, reason: 'exception ' + String(e.message).slice(0, 240) }; }
  if (!(r && r.ok)) failed++;
  console.log((r && r.ok ? 'PASS' : 'FAIL').padEnd(5), name.padEnd(24), JSON.stringify(r), `(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!(r && r.ok) && process.env.BAIL) { await browser.close(); process.exit(1); }
};
const arrived = async (realm) => {
  await page.waitForFunction((r) => window.__app.state === 'play' && !window.__app.travel && window.__game.realm.id === r && !window.__game.disposed, realm, { timeout: 180000 });
};

await load(`?world=${id}`);
const info = await ev(() => {
  const g = window.__game, b = g.level.brief;
  return { realm: g.realm.id, kind: g.realm.kind, goals: g.beacons.list.map((q) => ({ id: q.def.id, name: q.def.name, x: q.x, y: q.y, z: q.z, big: !!q.def.big })), gate: b && b.gate ? b.gate.at : null, exit: g.gameplay.portals.find((p) => p.kind === 'lift') };
});
const { goals } = info;

await check('boot', async () => {
  const r = await ev(() => {
    const g = window.__game, p = g.player, gp = g.gameplay;
    const gy = g.collision.support(p.x, p.z, p.y + 1, 0.9).y;
    return { realm: g.realm.id, mode: g.mode, state: window.__app.state, grounded: p.grounded, onGround: Math.abs(p.y - gy) < 0.3, hud: g.hud.visible, total: g.stats.beaconsTotal, gems: g.stats.gemsTotal, enemies: gp.enemies.length, sealed: !g.portals.isOpen(gp.portals.find((q) => q.kind === 'lift').id) };
  });
  return { ok: r.realm === id && r.mode === 'play' && r.state === 'play' && r.onGround && r.hud && r.total === goals.length && r.gems % 50 === 0 && r.sealed, ...r };
});

await check('the world holds still', async () => {
  // a few seconds of standing: nothing hurts him at the start (no Snuffer near), he does not slide or fall
  const a = await ev(() => { const p = window.__game.player; return [p.x, p.y, p.z]; });
  await ff(4);
  const b = await ev(() => { const g = window.__game, p = g.player; return { at: [p.x, p.y, p.z], dead: p.dead, sparx: g.sparx ? g.sparx.hp ?? true : null }; });
  return { ok: !b.dead && Math.hypot(b.at[0] - a[0], b.at[2] - a[2]) < 0.5 && Math.abs(b.at[1] - a[1]) < 0.3, from: a.map((v) => +v.toFixed(1)), ...b };
});

const light = async (i) => {
  // where the TRAVEL menu puts him in front of the goal (travel.js: found and checked by tools/realm-travel.mjs), facing it
  return ev(async ([gid, rid]) => {
    const { findPlace, heroSpot } = await import('/src/game/travel.js');
    const g = window.__game, pl = findPlace(`${rid}/${gid}`);
    if (!pl) return { place: false };
    const sp = heroSpot(g.grid, pl);
    g.player.place(sp.x, sp.y, sp.z, sp.yaw);
    g.cam.snapBehind(g.player);
    g.player.invulnT = 5;
    return { place: true };
  }, [goals[i].id, id]);
};
const burn = async () => { await page.keyboard.down('KeyJ'); await ff(0.9); await page.keyboard.up('KeyJ'); await ff(0.3); };

for (let i = 0; i < goals.length; i++) {
  await check(`light ${goals[i].id}`, async () => {
    const pl = await light(i);
    if (!pl.place) return { ok: false, reason: `no TRAVEL place '${id}/${goals[i].id}' (node tools/realm-travel.mjs ${id})` };
    await ff(0.6);
    const before = await ev((n) => window.__game.stats.beacons + 0 * n, i);
    await burn();
    const r = await ev((n) => {
      const g = window.__game, b = g.beacons.list[n];
      return { lit: b.litFlag, count: g.stats.beacons, dayTarget: +g.dayTarget.toFixed(3), want: +g.beacons.steps[n + 1].toFixed(3), mode: g.mode, state: window.__app.state, gate: g.objects && g.objects.barrier ? g.objects.barrier.target : null };
    }, i);
    const last = i === goals.length - 1;
    return { ok: before === i && r.lit && r.count === i + 1 && Math.abs(r.dayTarget - r.want) < 0.01 && (last ? r.state === 'finale' : r.state === 'play'), ...r };
  });
  if (info.gate !== null && i + 1 === info.gate) {
    await check('the gate opens', async () => {
      await ff(2.5);
      return await ev(() => { const g = window.__game; return { ok: !!g.objects.barrier && g.objects.barrier.target === 1, target: g.objects.barrier && g.objects.barrier.target }; });
    });
  }
}

await check('finale opens the ring', async () => {
  await ff(14);
  const r = await ev(() => {
    const g = window.__game, d = g.portals.list.find((q) => q.def.kind === 'lift'), s = JSON.parse(localStorage.getItem('gloaming-vale/progress/v1'));
    return { state: window.__app.state, open: d.state === 'open', k: +d.model.k.toFixed(2), visible: d.model.root.visible, beacons: g.stats.beacons, saved: !!(s && s.realms && s.realms[g.realm.id] && s.realms[g.realm.id].done), day: +g.day.toFixed(2) };
  });
  return { ok: r.state === 'results' && r.open && r.k > 0.9 && r.visible && r.beacons === goals.length && r.saved && r.day > 0.9, ...r };
});

await ev(() => window.__app.resumeFromResults());
await ff(0.5);
await ev(() => { window.__events = []; window.__game.on('portal', (d) => window.__events.push(d.id)); });

await check('the ring carries him out', async () => {
  const ring = await ev(() => { const g = window.__game, q = g.portals.list.find((r) => r.def.kind === 'lift').def, c = g.collision.support(q.x + 2.4, q.z + 3.2, q.y + 1, 0.9); g.player.place(q.x + 2.4, c.y + 0.05, q.z + 3.2, Math.PI); g.cam.snapBehind(g.player); return { x: q.x, y: q.y, z: q.z, target: q.target }; });
  await ff(0.6);
  const inZone = await ev(() => !!window.__game.portals.list.find((r) => r.def.kind === 'lift').inZone);
  await page.keyboard.down('Space'); await ff(0.1); await page.keyboard.up('Space');
  await ff(0.4);
  const a = await ev(() => { const g = window.__game, p = g.player; return { carry: !!p.carry, y: +p.y.toFixed(1) }; });
  let b = null;
  for (let i = 0; i < 16 && !(b && b.state === 'traveling'); i++) { await ff(0.4); b = await ev(() => ({ state: window.__app.state, events: window.__events.slice() })); }
  return { ok: inZone && a.carry && b.state === 'traveling' && b.events.length === 1, inZone, ride: a, travelling: b && b.state, target: ring.target };
});
await arrived('home');

await check('Dawnhaven receives him', async () => {
  const r = await ev(() => { const g = window.__game; return { realm: g.realm.id, mode: g.mode, hud: g.hud.visible }; });
  return { ok: r.realm === 'home' && r.mode === 'play' && r.hud, ...r };
});

await check('the realm entered again is restored', async () => {
  await ev((rid) => window.__app.travelTo(rid, { from: 'home' }), id);
  await arrived(id);
  await ff(1);
  const r = await ev(() => {
    const g = window.__game, d = g.portals.list.find((q) => q.def.kind === 'lift');
    return { realm: g.realm.id, restored: g.restored, mode: g.mode, lit: g.beacons.list.every((b) => b.litFlag), day: +g.day.toFixed(2), open: d.state === 'open' };
  });
  return { ok: r.realm === id && r.restored && r.mode === 'complete' && r.lit && r.day > 0.95 && r.open, ...r };
});

// the door the hero came in by stands at the start of the realm and is awake: walked into, it leads back to the world he came from, and he comes out of the door of this realm there
const door = await ev(() => { const q = window.__game.gameplay.portals.find((p) => p.kind === 'door' && p.target); return q ? { id: q.id, target: q.target, x: q.x, y: q.y, z: q.z, yaw: q.yaw } : null; });
if (door) {
  await check('the door behind him leads back', async () => {
    await ev((d) => {
      const g = window.__game, s = Math.sin(d.yaw), c = Math.cos(d.yaw), sup = g.collision.support(d.x + s * 5, d.z + c * 5, d.y + 1, 0.9);
      window.__events = []; g.on('portal', (q) => window.__events.push(q.id));
      g.player.place(d.x + s * 5, sup.y + 0.05, d.z + c * 5, d.yaw + Math.PI); g.cam.snapBehind(g.player); g.player.invulnT = 5;
    }, door);
    await ff(0.5);
    await page.keyboard.down('KeyW');
    let b = null;
    for (let i = 0; i < 16 && !(b && b.state === 'traveling'); i++) { await ff(0.25); b = await ev(() => ({ state: window.__app.state, events: window.__events.slice() })); }
    await page.keyboard.up('KeyW');
    return { ok: !!b && b.state === 'traveling' && b.events.join() === door.id, state: b && b.state, events: b && b.events, target: door.target };
  });
  await arrived(door.target);
  await check('... and he comes out where the way from this realm comes out', async () => {
    const r = await ev((from) => {
      const g = window.__game, p = g.player, a = g.gameplay.arrivals && g.gameplay.arrivals[from];
      return { realm: g.realm.id, mode: g.mode, hud: g.hud.visible, arrival: a ? Math.hypot(p.x - a.x, p.z - a.z) : null };
    }, id);
    return { ok: r.realm === door.target && r.mode === 'play' && r.hud && (r.arrival === null || r.arrival < 2.5), ...r };
  });
}

await check('no errors in the page', async () => ({ ok: errors.length === 0, errors: errors.slice(0, 3) }));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : `\nall ${id} journey checks passed`);
process.exitCode = failed ? 1 : 0;
