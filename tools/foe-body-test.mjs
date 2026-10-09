#!/usr/bin/env node
// A living Snuffer is a body (round thirty-seven): the hero cannot stand inside one, whatever its kind (the Smokecaller in its hood and robe, the Fusepup, the Slinger ... used to be walked through like air),
// and nothing else about the fight changed: a ram and a breath still reach it from where the body stops him, he can jump over it, and he is not stopped by one that is dead, asleep underground or high up.
//   node tools/foe-body-test.mjs        (needs the dev server on :5173, GV_URL=http://127.0.0.1:PORT/ tests another)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const BASE = process.env.GV_URL || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200), (e.stack || '').split('\n').slice(1, 4).join(' | ')));
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : detail); };
await page.goto(BASE + '?world=guardian&skip=1&preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });

const R = await page.evaluate(async () => {
  const kinds = await import('/src/game/foes/kinds.js');
  const G = window.__game, E = G.enemies, p = G.player;
  G.systems = G.systems.filter((s) => s !== G.boss);                       // (the Guardian sleeps: a flat floor)
  const fx = 0, fz = 14, fy = G.grid.heightAt(fx, fz);
  const out = { kinds: [] };
  const stand = (x, z, yaw = Math.PI) => { p.place(x, G.grid.heightAt(x, z) + 0.05, z, yaw); p.locked = false; G.locked = false; G.mode = 'play'; G.hud.talking = false; p.invulnT = 99; };
  for (const id of kinds.KIND_IDS) {
    const e = E.add({ x: fx, z: fz, variant: id }); e.state = e.B ? e.state : 'idle'; e.untargetable = false; e.under = 0; e.y = fy + (e.K.flies ? 0 : 0);
    const rr = e.r + p.r;
    stand(fx + 0.2, fz + 0.1);                                             // inside it
    E._body(e, p);
    const d1 = Math.hypot(p.x - e.x, p.z - e.z);
    stand(fx, fz);                                                         // dead centre
    E._body(e, p);
    const d2 = Math.hypot(p.x - e.x, p.z - e.z);
    stand(fx + rr, fz); p.chargeT = 1; p.dirx = -1; p.dirz = 0; p.flameT = 1; p.mouth.x = p.x; p.mouth.z = p.z; p.mouth.y = p.y + 0.6;
    const ram = p.chargeHits(e.x, e.y + 1, e.z, e.r), fire = p.flameHits(e.x, e.y + 1, e.z, e.r);
    p.chargeT = 0; p.flameT = 0;
    stand(fx + 0.1, fz); p.y = e.y + e.h * 0.95 + 0.1;                     // over its head
    const x0 = p.x; E._body(e, p); const over = p.x === x0;
    e.state = 'dead';
    stand(fx + 0.1, fz); const x1 = p.x; E._body(e, p); const dead = p.x === x1;
    E._remove(e, E.list.indexOf(e));
    out.kinds.push({ id, rr, d1, d2, ram, fire, over, dead });
  }
  // walked into with the real controller: the Smokecaller, hero walking straight at it
  const e = E.add({ x: fx, z: fz, variant: 'caller' });
  e.state = 'idle'; e.alert = 0;
  stand(fx, fz + 4); G.cam.snapNext = true; G.cam.yaw = Math.PI;
  const was = Object.getOwnPropertyDescriptor(G.input, 'move');            // (the stick is read through a getter for the walk, and put back as it was)
  Object.defineProperty(G.input, 'move', { get: () => ({ x: 0, y: 1 }), configurable: true });
  let min = 99;
  for (let i = 0; i < 120; i++) { e.x = fx; e.z = fz; G.step(1 / 60); min = Math.min(min, Math.hypot(p.x - e.x, p.z - e.z)); }
  Object.defineProperty(G.input, 'move', was);
  out.walk = { min, rr: e.r + p.r };
  return out;
});
for (const k of R.kinds) {
  check(`${k.id}: the hero cannot stand inside it (pushed out to the sum of the radii, from inside and from dead centre)`, k.d1 >= k.rr - 1e-6 && k.d2 >= k.rr - 1e-6, `(${k.d1.toFixed(2)} / ${k.d2.toFixed(2)} of ${k.rr.toFixed(2)})`);
  check(`${k.id}: from where the body stops him a ram and a breath still reach it`, k.ram && k.fire);
  check(`${k.id}: he can go over its head, and a dead one is no body`, k.over && k.dead);
}
check('walking the real controller straight into a Smokecaller he stops at its body (not inside it)', R.walk.min >= R.walk.rr - 0.05, `(${R.walk.min.toFixed(2)} m of ${R.walk.rr.toFixed(2)})`);
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
