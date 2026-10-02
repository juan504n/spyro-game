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
  return { realm: g.realm.id, kind: g.realm.kind, goals: g.beacons.list.map((q) => ({ id: q.def.id, name: q.def.name, x: q.x, y: q.y, z: q.z, big: !!q.def.big, sfx: q.def.sfx || null })), gate: b && b.gate ? b.gate.at : null, exit: g.gameplay.portals.find((p) => p.kind === 'lift') };
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

await check('the roads wear the textures the level names (its own, or cobble and dirt)', async () => {
  const r = await ev(() => {
    const g = window.__game, rt = g.level.roadTextures || {};
    return { rt, meshes: g.world.roads.children.map((m) => ({ surface: m.renderOrder === 2 ? 'cobble' : 'dirt', tex: m.material.name })) };
  });
  const bad = r.meshes.filter((m) => m.tex !== (r.rt[m.surface] || m.surface));
  return { ok: r.meshes.length > 0 && bad.length === 0, ...r };
});

// a realm that paints its own sky (its palette's cloudTop / cloudBot / ridge): the clouds and the distant mountains wear it, not the vale's lavender
await check('the sky wears the realm\'s palette', async () => {
  const r = await ev(() => {
    const g = window.__game, W = g.world, env = g.level.environment, own = env && env.sky && env.sky[0], s = W.atm.sky;
    if (!own || (!own.cloudTop && !own.ridge)) return { own: false };
    const c = W.sky.clouds[0].geo.attributes.aCol.array, m = W.sky.mtn[0], pk = m.geo.attributes.aCol.array;
    const near = (a, want, k) => want.every((v, i) => Math.abs(a[i] - Math.min(1, v * k) * 255) <= 3);
    const peak = s.ridge ? s.fog.map((f, i) => f + (s.ridge[i] - f) * m.mixK * 1.15) : null;
    return { own: true, day: +g.day.toFixed(2), clouds: !own.cloudTop || (!!s.cloudTop && near(c.slice(8, 11), s.cloudTop, 0.575)), ridge: !own.ridge || (!!s.ridge && near(pk.slice(4, 7), peak, 0.5)) };
  });
  return { ok: !r.own || (r.clouds && r.ridge), ...r };
});

// a realm whose lake is not water (level.liquid: Emberfall Crags' lava, Skyweaver Spires' sea of cloud): the surface is drawn with the liquid's texture, the dusk's life is the one the level names (embers,
// not fireflies), and a touch of it burns where the descriptor says (water drowns from 0.95 m, lava from `burnDepth`). A SEA (level.sea: the ground that is not an island lies far below the surface)
// has no lake to look for a bed in: the deep is the ground under it, round the hero.
const liquid = await ev(() => { const L = window.__game.level; return L.liquid ? { texture: L.liquid.texture, burnDepth: L.liquid.burnDepth ?? 0.95, splash: L.liquid.splash, sea: !!L.sea, deepHint: L.sea ? L.sea.deepHint : null } : null; });
if (liquid) {
  await check(`the lake is ${liquid.texture}, not water`, async () => {
    const r = await ev(() => window.__game.world.water.children.map((m) => m.material.name));
    return { ok: r.length > 0 && r.every((n) => n === liquid.texture), surfaces: r, want: liquid.texture };
  });
  if (liquid.sea) {
    // a sea is drawn out to the horizon (level.sea.r): not as a lake round a middle, or the cloud would end 100 m from the islands and the world's edge would show
    await check('the sea is drawn out to its radius', async () => {
      const r = await ev(() => {
        const g = window.__game, S = g.level.sea;
        let widest = 0;
        for (const m of g.world.water.children) { m.geometry.computeBoundingSphere(); widest = Math.max(widest, m.geometry.boundingSphere.radius); }
        return { widest: Math.round(widest), want: S.r };
      });
      return { ok: r.widest >= r.want * 0.9, ...r };
    });
  }
  await check('the dusk\'s life is the one the level names', async () => {
    const r = await ev(async () => {
      const g = window.__game, n = { ember: 0, firefly: 0 }, was = { ember: g.fx.ember, firefly: g.fx.firefly };
      for (const k of Object.keys(n)) g.fx[k] = function (...a) { n[k]++; return was[k].apply(this, a); };
      for (let t = 0; t < 4; t += 1 / 30) window.__app.update(1 / 30);
      Object.assign(g.fx, was);
      return { ...n, dusk: (g.level.ambient || {}).dusk || 'firefly', day: +g.day.toFixed(2) };
    });
    return { ok: r.day < 0.1 && (r.dusk === 'ember' ? r.ember > 0 && r.firefly === 0 : r.firefly > 0), ...r };
  });
  const burn1 = async (what, depthLo, depthHi) => {
    // stand the hero on the bed of the lake where it is between depthLo and depthHi deep, and see whether the liquid takes him
    const spot = await ev(([lo, hi]) => {
      const g = window.__game, k = g.level.lake, col = g.collision;
      let best = null;
      if (g.level.sea) {              // (no ellipse: outwards from the hero, ring by ring, to the first cell of the bed that is as deep as asked: the foot of a cliff has every depth)
        for (let r = 6; r <= 220 && !best; r += 2) for (let a = 0; a < 72 && !best; a++) {
          const x = g.player.x + Math.cos((a / 72) * Math.PI * 2) * r, z = g.player.z + Math.sin((a / 72) * Math.PI * 2) * r, d = -col.heightAt(x, z);
          if (d >= lo && d <= hi) best = { x, z, depth: +d.toFixed(2) };
        }
        return best;
      }
      for (let a = 0; a < 48 && !best; a++) for (let f = 0.3; f <= 1.3 && !best; f += 0.01) {
        const x = k.x + Math.cos((a / 48) * Math.PI * 2) * k.rx * f, z = k.z + Math.sin((a / 48) * Math.PI * 2) * k.rz * f, d = -col.heightAt(x, z);
        if (d >= lo && d <= hi) best = { x, z, depth: +d.toFixed(2) };
      }
      return best;
    }, [depthLo, depthHi]);
    if (!spot) return { ok: false, reason: `no ${what} cell found in the lake` };
    const r = await ev(async (s) => {
      const g = window.__game, p = g.player;
      let burned = 0;
      const was = p.on.drown, home = { x: p.x, y: p.y, z: p.z, yaw: p.yaw };           // (where he is taken back to: the place that is dry)
      p.on.drown = (...a) => { burned++; return was && was(...a); };
      p.place(s.x, g.collision.heightAt(s.x, s.z) + 0.05, s.z, 0); p.invulnT = 5; p.safe = home;
      for (let t = 0; t < 1.2; t += 1 / 30) window.__app.update(1 / 30);
      p.on.drown = was;
      return { burned, dead: p.dead, away: +Math.hypot(p.x - s.x, p.z - s.z).toFixed(1), hint: g.hud.hintState ? g.hud.hintState.text : null };
    }, spot);
    return { ok: spot && r.burned === 1 && !r.dead && r.away > 3, spot, ...r };
  };
  await check('the deep of the lake takes the hero out of it', async () => {
    const r = await burn1('deep', liquid.burnDepth + 1.5, liquid.sea ? 40 : 20);
    // (a sea says what it is: the hero who fell in is told, in the realm's words, how to cross it)
    return liquid.sea ? { ...r, ok: r.ok && r.hint === liquid.deepHint, want: liquid.deepHint } : r;
  });
  if (liquid.burnDepth < 0.9) await check(`a touch of the ${liquid.texture} burns (from ${liquid.burnDepth} m, not 0.95)`, () => burn1('shallow', liquid.burnDepth + 0.12, 0.85));
}

// a realm with whirlwinds (gp.whirlwinds: realm/whirl.js, Skyweaver Spires' updrafts): the hero who walks into the foot of one is carried up its column to the top, hovers there and does not fall out of it, and a jump
// at the top starts a glide (the real Player and the real object system, in the real loop)
const whirls = await ev(() => (window.__game.gameplay.whirlwinds || []).map((w) => ({ ...w })));
for (const w of whirls) {
  await check(`the whirlwind ${w.id} carries the hero to its top`, async () => {
    const pre = await ev((w) => {
      const g = window.__game, p = g.player, x = w.x + 1.4, z = w.z, sup = g.collision.support(x, z, w.y0 + 1, 0.9);
      window.__home = { x: p.x, y: p.y, z: p.z, yaw: p.yaw };
      p.place(x, sup.y + 0.05, z, 0); g.cam.snapBehind(p); p.invulnT = 60; p.safe = { x, y: sup.y, z, yaw: 0 };
      return { foot: +sup.y.toFixed(1), model: g.objects.whirlwinds.some((q) => q.id === w.id) };
    }, w);
    await ff(10);
    const top = await ev((w) => { const p = window.__game.player; return { y: +p.y.toFixed(1), speed: +Math.hypot(p.vx, p.vz).toFixed(1), vy: +p.vy.toFixed(1), off: +Math.hypot(p.x - w.x, p.z - w.z).toFixed(1), dead: p.dead }; }, w);
    await page.keyboard.down('Space'); await ff(0.5);                                    // (a glide lasts while jump is held)
    const out = await ev(() => { const p = window.__game.player; return { gliding: !!p.gliding, vy: +p.vy.toFixed(1) }; });
    await page.keyboard.up('Space'); await ff(0.2);
    await ev(() => { const g = window.__game, h = window.__home; g.player.place(h.x, h.y, h.z, h.yaw); g.player.safe = { ...h }; g.cam.snapBehind(g.player); });
    return { ok: pre.model && top.y > w.y0 + w.h - 3.5 && top.y < w.y0 + w.h + 2.5 && top.speed < 6 && !top.dead && out.gliding && out.vy >= -3.3, ...pre, top, out, want: [+(w.y0 + w.h - 3.5).toFixed(1), +(w.y0 + w.h + 2.5).toFixed(1)] };
  });
}

// a realm that colours its gate (gp.barrier.opts.tint): the field's vertex colours are the Dawn Gate's multiplied by it
const gateTint = await ev(() => { const b = window.__game.gameplay.barrier; return b && b.opts && b.opts.tint ? b.opts.tint : null; });
if (gateTint) {
  await check('the gate\'s field wears the realm\'s colour, not the Dawn Gate\'s violet', async () => {
    const r = await ev(async () => {
      const { makeModel } = await import('/src/game/models/fallback.js');
      const g = window.__game, mine = g.objects.barrier.model, plain = makeModel(g.assets, 'barrier');
      const col = (m) => { let out = null; m.root.traverse((o) => { if (!out && o.isMesh && o.name === 'veil') out = Array.from(o.geometry.attributes.aCol.array.slice(0, 3)); }); return out; };
      return { mine: col(mine), plain: col(plain), tint: g.gameplay.barrier.opts.tint };
    });
    const want = r.plain.map((v, i) => Math.min(255, v * r.tint[i]));
    return { ok: r.mine.every((v, i) => Math.abs(v - want[i]) <= 3) && r.mine.some((v, i) => Math.abs(v - r.plain[i]) > 20), ...r, want: want.map(Math.round) };
  });
}

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
    await ev(() => { const g = window.__game; window.__sfx = []; if (g.audio && g.audio.sfx && !g.audio.__spy) { const was = g.audio.sfx.bind(g.audio); g.audio.sfx = (name, o) => { window.__sfx.push(name); return was(name, o); }; g.audio.__spy = true; } });
    await burn();
    const r = await ev((n) => {
      const g = window.__game, b = g.beacons.list[n];
      return { lit: b.litFlag, count: g.stats.beacons, dayTarget: +g.dayTarget.toFixed(3), want: +g.beacons.steps[n + 1].toFixed(3), mode: g.mode, state: window.__app.state, gate: g.objects && g.objects.barrier ? g.objects.barrier.target : null };
    }, i);
    const last = i === goals.length - 1;
    // (a goal that names its own ignition sound - a Windbell rings - is heard to ring it, and not the lantern's whoomp)
    const heard = await ev(() => window.__sfx || []);
    const soundOk = !goals[i].sfx || (heard.includes(goals[i].sfx) && !heard.includes('lantern_ignite'));
    return { ok: before === i && r.lit && r.count === i + 1 && Math.abs(r.dayTarget - r.want) < 0.01 && (last ? r.state === 'finale' : r.state === 'play') && soundOk, ...r, ...(goals[i].sfx ? { sound: goals[i].sfx, heard } : {}) };
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

// a TRAVEL place beyond the realm's gate opens the gate for the hero put there (App._placeHero), or he would stand shut in: on a fresh page, a hop to it
const beyond = await ev(async (rid) => { const { travelPlaces } = await import('/src/game/travel.js'); return travelPlaces(rid).filter((p) => p.opens).map((p) => p.key); }, id);
if (beyond.length) {
  await load(`?world=${id}`);
  await check('a place beyond the gate opens it for the hero put there', async () => {
    const before = await ev(() => { const b = window.__game.objects.barrier; return { shut: !!b && b.c.solid }; });
    await ev(async (key) => { const { findPlace } = await import('/src/game/travel.js'); window.__app.warpTo(findPlace(key)); }, beyond[0]);
    await ff(0.2);
    await arrived(id);
    await ff(1);
    const r = await ev(() => { const g = window.__game, b = g.objects.barrier; return { open: !!b && !b.c.solid && b.open === 1, hint: g.hud.hintState && g.hud.hintState.text, dead: g.player.dead }; });
    return { ok: before.shut && r.open && /GATE WAS OPENED/.test(r.hint || '') && !r.dead, before, ...r, place: beyond[0] };
  });
}

await check('no errors in the page', async () => ({ ok: errors.length === 0, errors: errors.slice(0, 3) }));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : `\nall ${id} journey checks passed`);
process.exitCode = failed ? 1 : 0;
