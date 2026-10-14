// The supercharge ramps of Emberfall Crags (src/game/systems/ramps.js, props/nature/ember.js, foes/brute.js, objectives/duel.js), played by the REAL controller in the real game (time is the bot's: tools/bot-inject.js):
// a hero who runs or rams up a ramp is supercharged (the ram goes a half faster for seven seconds and he is thrown up the ramp), one who runs down it or across it is not; a supercharged ram kills a Slag Brute
// in ONE blow (any state), an ordinary one rings off its coat and the three hits on the open hatch are still the other way; the charge is spent on it; and a supercharged ram into the Colossus's open hatch
// is three wounds. Gloaming Vale has no ramps.
//   node tools/ramp-test.mjs        (needs the dev server on :5173, GV_HMR=0 recommended)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.GV_URL || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : detail); };

async function open(q) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 480 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message.slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|GL Driver/.test(m.text())) { errors.push(m.text()); console.log('[error]', m.text().slice(0, 300)); } });
  await page.goto(base + q);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });
  if (await page.evaluate(() => window.__error)) throw new Error('boot error');
  await page.waitForTimeout(1200);
  await page.addScriptTag({ path: path.join(here, 'bot-inject.js') });
  return { ctx, page };
}

const { ctx, page } = await open('?world=emberfall&preserve=1&skip=1');
await page.evaluate(() => {
  __bot.install();
  const G = () => window.__game, ctl = __bot.ctl;
  /** run in direction (dx, dz) for `sec` seconds, ramming or not; returns what the hero did (max speed, max height, super at the end, the time it first became supercharged) */
  window.__run = (dx, dz, sec, ram) => {
    const p = G().player;
    const y0 = p.y;
    let maxV = 0, maxY = -1e9, superAt = -1, vyAtSuper = null, peak = 0;
    if (ram) __bot.edge('charge');
    for (let i = 0; i < sec * 60; i++) {
      const Y = G().cam.yaw;
      ctl.my = dx * Math.sin(Y) + dz * Math.cos(Y); ctl.mx = -dx * Math.cos(Y) + dz * Math.sin(Y);
      ctl.charge = !!ram;
      const was = p.superT;
      G().update(1 / 60);
      if (was <= 0 && p.superT > 0 && superAt < 0) { superAt = i / 60; vyAtSuper = p.vy; }
      peak = Math.max(peak, p.superT);
      maxV = Math.max(maxV, Math.hypot(p.vx, p.vz)); maxY = Math.max(maxY, p.y - y0);
    }
    ctl.mx = ctl.my = 0; ctl.charge = false;
    return { maxV, rise: maxY, superT: p.superT, peak, superAt, vyAtSuper };
  };
  window.__ramp = (k) => { const r = G().gameplay.ramps[k], dx = Math.sin(r.rot), dz = Math.cos(r.rot); return { ...r, dx, dz }; };
  window.__stand = (x, z, dx, dz) => { __bot.place(x, z, Math.atan2(dx, dz)); G().cam.yaw = Math.atan2(dx, dz) + Math.PI; };
});
const info = await page.evaluate(() => ({ ramps: window.__game.gameplay.ramps.length, brutes: window.__game.gameplay.enemies.filter((e) => e.variant === 'brute').length, sys: !!window.__game.ramps }));
check('the realm has its ramps, one for each Slag Brute, and the game runs the system', info.ramps >= info.brutes && info.brutes >= 4 && info.sys, JSON.stringify(info));

// ---- running and ramming up a ramp -----------------------------------------------------------------------------------------------------------
const up = async (ram, k = 0) => page.evaluate(({ ram, k }) => {
  const r = __ramp(k);
  __stand(r.x - r.dx * 14, r.z - r.dz * 14, r.dx, r.dz);
  __game.player.superT = 0;
  return __run(r.dx, r.dz, 3.2, ram);
}, { ram, k });
{
  const a = await up(true);
  check('ramming up a ramp supercharges the hero (the full seven seconds at the lip)', a.superAt >= 0 && a.peak > 6.9, `(supercharged after ${a.superAt.toFixed(2)} s, ${a.peak.toFixed(1)} s)`);
  check('... he is thrown up it: off the ramp\'s lip he goes up at once (vy ' + (a.vyAtSuper ?? 0).toFixed(1) + ') and over 1.5 m high', a.vyAtSuper > 8 && a.rise > 1.5, `(rose ${a.rise.toFixed(1)} m)`);
  check('... and the charge is half as fast again as an ordinary one (24 m/s)', a.maxV > 33, `(${a.maxV.toFixed(1)} m/s)`);
  const b = await up(false, 1);
  check('running up a ramp supercharges as well (a boost pad: ram is not asked)', b.superAt >= 0 && b.peak > 6.9, `(after ${b.superAt.toFixed(2)} s)`);
  const down = await page.evaluate(() => { const r = __ramp(2); __stand(r.x + r.dx * 14, r.z + r.dz * 14, -r.dx, -r.dz); __game.player.superT = 0; return __run(-r.dx, -r.dz, 3.2, true); });
  check('running down a ramp from its lip does not', down.superAt < 0 && down.superT === 0, `(super ${down.superT})`);
  const across = await page.evaluate(() => { const r = __ramp(3); __stand(r.x - r.dz * 14, r.z + r.dx * 14, r.dz, -r.dx); __game.player.superT = 0; return __run(r.dz, -r.dx, 3.2, true); });
  check('running across a ramp (past it) does not', across.superAt < 0, `(super ${across.superT})`);
  const walk = await page.evaluate(() => { const r = __ramp(0); __stand(r.x - r.dx * 9, r.z - r.dz * 9, r.dx, r.dz); __game.player.superT = 0; const o = __run(r.dx, r.dz, 0.4, false); return { ...o, vmax: o.maxV }; });
  check('a hero who has not reached the lip is not supercharged yet', walk.superAt < 0, '');
}

// ---- the supercharge: time, and what it does to a Slag Brute ------------------------------------------------------------------------------------
{
  const t = await page.evaluate(() => { const p = __game.player; p.superT = 7; for (let i = 0; i < 60 * 6.5; i++) __game.update(1 / 60); const a = p.superT; for (let i = 0; i < 60; i++) __game.update(1 / 60); return [a, p.superT]; });
  check('it lasts seven seconds', t[0] > 0 && t[1] === 0, `(${t[0].toFixed(2)} s left after 6.5 s, ${t[1]} after 7.5)`);
  const hit = async (superT, state, idx) => page.evaluate(({ superT, state, idx }) => {
    __bot.god();
    const G = __game, en = G.enemies, e = en.list.filter((q) => q.K.brain === 'brute')[idx];
    const dx = 0, dz = 1;
    e.vx = e.vz = 0; e.speedNow = 0; e.x0 = e.x;
    __bot.place(e.x - dx * 4, e.z - dz * 4, 0);
    const p = G.player; p.superT = superT; e.state = state; e.shutT = 0; e.wounds = 0; e.st = 0;
    G.cam.yaw = Math.PI;
    const ctl = __bot.ctl;
    __bot.edge('charge');
    let dead = false, t = 0;
    for (let i = 0; i < 90; i++) {
      const Y = G.cam.yaw;
      ctl.my = dx * Math.sin(Y) + dz * Math.cos(Y); ctl.mx = -dx * Math.cos(Y) + dz * Math.sin(Y); ctl.charge = true;
      e.state === 'advance' && (e.speedNow = 0);
      G.update(1 / 60);
      if (e.state === 'dead') { dead = true; t = i / 60; break; }
    }
    ctl.mx = ctl.my = 0; ctl.charge = false;
    return { dead, t, wounds: e.wounds, superT: p.superT, state: e.state, hp: e.hp };
  }, { superT, state, idx });
  const s = await hit(5, 'idle', 0);
  check('a supercharged ram kills a Slag Brute in one blow, though it stands shut and unaware', s.dead && s.superT === 0, JSON.stringify(s));
  const s2 = await hit(5, 'advance', 1);
  check('... and on the advance', s2.dead && s2.superT === 0, JSON.stringify(s2));
  const n = await hit(0, 'advance', 2);
  check('an ordinary ram rings off the shut coat: the brute lives, unwounded', !n.dead && n.wounds === 0, JSON.stringify(n));
}

// ---- the Colossus -------------------------------------------------------------------------------------------------------------------------------
{
  const r = await page.evaluate(() => {
    const G = __game, o = G.objective;
    if (!o || o.constructor.name !== 'Duel') return { none: true };
    __bot.god();
    o.state = 'vent'; o.st = 0; o.shutT = 0; o.wounds = 0; o.ventSnd = true;
    const c = o.chest;
    G.player.place(c.x, G.grid.heightAt(c.x, c.z) + 0.05, c.z + 0.5, Math.PI);
    G.player.superT = 5; G.player.chargeT = 0.3;
    o._struck(G.player);
    const a = o.wounds, s = G.player.superT;
    o.shutT = 0; G.player.chargeT = 0.3; G.player.superT = 0;
    o._struck(G.player);
    return { a, s, b: o.wounds, need: o.need };
  });
  check('a supercharged ram into the Colossus\'s open hatch is three wounds and spends the charge; an ordinary one is one', !r.none && r.a === 3 && r.s === 0 && r.b === 4, JSON.stringify(r));
}
await ctx.close();

// ---- the other worlds have none ---------------------------------------------------------------------------------------------------------------
for (const id of ['gloaming', 'home', 'frostbloom']) {
  const o = await open(id === 'gloaming' ? '?preserve=1&skip=1' : `?world=${id}&preserve=1&skip=1`);
  const n = await o.page.evaluate(() => ({ ramps: (window.__game.gameplay.ramps || []).length, placed: window.__game.gameplay.placed ? window.__game.gameplay.placed.filter((q) => q.name === 'supercharge_ramp').length : 0 }));
  check(`${id} has no supercharge ramps`, n.ramps === 0 && n.placed === 0, JSON.stringify(n));
  await o.ctx.close();
}
check('no page errors, no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall ramp checks passed');
process.exit(failed ? 1 : 0);
