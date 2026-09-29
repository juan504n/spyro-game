// Monkey test: random inputs (move, jump, glide, fire, charge) from many start points with the real game loop, looking for
// exceptions, NaNs, players escaping the world and camera glitches.   node tools/monkey.mjs [runs=8] [seconds=90]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runs = +(process.argv[2] || 8), seconds = +(process.argv[3] || 90);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
await page.goto('http://127.0.0.1:5173/?skip=1&preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
await page.addScriptTag({ path: path.join(here, 'bot-inject.js') });
await page.waitForTimeout(1200);

let bad = 0;
for (let run = 0; run < runs; run++) {
  const r = await page.evaluate(({ run, seconds }) => {
    const G = __game, p = G.player;
    __bot.install();
    let s = 1234567 + run * 7919;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    // random start on the valley floor
    const grid = G.grid, half = grid.half;
    let x = 0, z = 0;
    for (let i = 0; i < 200; i++) {
      x = (rnd() - 0.5) * 300; z = (rnd() - 0.5) * 300;
      if (grid.heightAt(x, z) > 0.8 && Math.hypot(x, z - 14) < 150) break;
    }
    G.player.place(x, grid.heightAt(x, z) + 0.05, z, rnd() * 6.28);
    G.cam.snapBehind(p);
    const ctl = __bot.ctl;
    const issues = [];
    let next = 0, deaths = 0, maxSpeed = 0, minY = 1e9, maxY = -1e9;
    let wasDead = false;
    for (let f = 0; f < seconds * 60; f++) {
      if (f >= next) {
        ctl.mx = rnd() < 0.2 ? 0 : rnd() * 2 - 1; ctl.my = rnd() < 0.2 ? 0 : rnd() * 2 - 1;
        ctl.jump = rnd() < 0.5; ctl.flame = rnd() < 0.3; ctl.charge = rnd() < 0.15;
        if (ctl.jump && rnd() < 0.5) __bot.edge('jump');
        if (ctl.flame) __bot.edge('flame');
        if (ctl.charge) __bot.edge('charge');
        if (rnd() < 0.1) G.cam.yaw += (rnd() - 0.5) * 2;
        next = f + 12 + Math.floor(rnd() * 60);
      }
      __bot.tick();
      const cam = G.camera.position;
      if (![p.x, p.y, p.z, cam.x, cam.y, cam.z].every(Number.isFinite)) { issues.push(`NaN at frame ${f}: player ${p.x},${p.y},${p.z} cam ${cam.x},${cam.y},${cam.z}`); break; }
      maxSpeed = Math.max(maxSpeed, p.speed || 0); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      if (Math.abs(p.x) > 230 || Math.abs(p.z) > 230) { issues.push(`escaped the world at frame ${f}: ${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}`); break; }
      if (p.dead && !wasDead) deaths++;
      wasDead = p.dead;
    }
    return { run, start: [+x.toFixed(0), +z.toFixed(0)], end: [+p.x.toFixed(0), +p.y.toFixed(1), +p.z.toFixed(0)], deaths, gems: G.stats.gems, beacons: G.stats.beacons, maxSpeed: +maxSpeed.toFixed(1), y: [+minY.toFixed(1), +maxY.toFixed(1)], issues };
  }, { run, seconds });
  if (r.issues.length) bad++;
  console.log(r.issues.length ? 'FAIL' : 'ok  ', JSON.stringify(r));
}
if (errors.length) { console.log('\npage errors:'); for (const e of [...new Set(errors)].slice(0, 10)) console.log(' ', e); }
await browser.close();
process.exit(bad || errors.length ? 1 : 0);
