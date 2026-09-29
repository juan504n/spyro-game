// Scripted playtest driver. Usage:
//   node tools/play.mjs "<url query>" "<script>" [--out dir] [--w 800 --h 600]
// Script = ';'-separated steps:
//   hold:KeyW:1500      hold a key for N ms         tap:Space         press+release (60ms)
//   down:KeyW / up:KeyW press / release              wait:500          wait N ms
//   shot:name           internal-res screenshot (x3) full:name        full-page screenshot
//   state               print player state           eval:js           evaluate JS in the page and print the result
//   at:x,z,yaw          teleport player              day:0.5           set day
//   cam:x,y,z,tx,ty,tz  fixed free camera            camoff            back to chase camera
//   key:name            trigger a game event (e.g. key:finale)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { writePNG, upscale } from './png.mjs';

const args = process.argv.slice(2);
const query = args[0] || '?test=play';
const script = (args[1] || 'wait:1000;state').split(';').map((s) => s.trim()).filter(Boolean);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const outDir = opt('out', '.');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +opt('w', 800), height: +opt('h', 600) } });
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 500)));
await page.goto('http://127.0.0.1:5173/' + query + (query.includes('?') ? '&' : '?') + 'preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 90000 });
const err = await page.evaluate(() => window.__error);
if (err) { console.log('BOOT ERROR', err); await browser.close(); process.exit(1); }
await page.focus('canvas').catch(() => {});

const fmt = (v) => (typeof v === 'number' ? v.toFixed(2) : v);
for (const step of script) {
  const [cmd, a, b] = step.split(':');
  if (cmd === 'hold') { await page.keyboard.down(a); await page.waitForTimeout(+b); await page.keyboard.up(a); }
  else if (cmd === 'tap') { await page.keyboard.down(a); await page.waitForTimeout(60); await page.keyboard.up(a); }
  else if (cmd === 'down') await page.keyboard.down(a);
  else if (cmd === 'up') await page.keyboard.up(a);
  else if (cmd === 'wait') await page.waitForTimeout(+a);
  else if (cmd === 'shot') {
    const snap = await page.evaluate(() => window.__gv.snapshot());
    const up = upscale(new Uint8ClampedArray(Buffer.from(snap.b64, 'base64')), snap.w, snap.h, 3);
    writePNG(path.join(outDir, a + '.png'), up.w, up.h, up.data);
    console.log('shot', a);
  } else if (cmd === 'full') { await page.screenshot({ path: path.join(outDir, a + '.png') }); console.log('full', a); }
  else if (cmd === 'state') {
    const s = await page.evaluate(() => { const g = window.__game, p = g?.player; return p ? { x: p.x, y: p.y, z: p.z, yaw: p.yaw, vx: p.vx, vy: p.vy, vz: p.vz, grounded: p.grounded, glide: p.gliding, charge: p.chargeT, flame: p.flameT, hurt: p.hurtT, hp: g.sparx?.hp, gems: g.stats?.gems, beacons: g.stats?.beacons, day: g.day, dead: p.dead } : null; });
    console.log('state', s ? Object.entries(s).map(([k, v]) => `${k}=${fmt(v)}`).join(' ') : 'n/a');
  } else if (cmd === 'eval') { const r = await page.evaluate(step.slice(5)); console.log('eval', JSON.stringify(r)); }
  else if (cmd === 'at') {
    const [x, z, yaw] = a.split(',').map(Number);
    await page.evaluate(([x, z, yaw]) => { const g = window.__game; g.player.place(x, g.grid.heightAt(x, z) + 0.05, z, yaw); g.cam.snapBehind(g.player); }, [x, z, yaw || 0]);
  } else if (cmd === 'cam') {
    const v = a.split(',').map(Number);
    await page.evaluate((v) => { const g = window.__game; g.cam.playCinematic(() => ({ pos: [v[0], v[1], v[2]], look: [v[3], v[4], v[5]], fov: v[6] || 58 }), 1e9); }, v);
  } else if (cmd === 'camoff') await page.evaluate(() => { window.__game.cam.stopCinematic(); });
  else if (cmd === 'key') await page.evaluate((n) => { window.__game.emit(n); }, a);
  else if (cmd === 'day') await page.evaluate((d) => { const g = window.__game; g.day = g.dayTarget = d; }, +a);
  else console.log('unknown step', step);
}
await browser.close();
