// Headless screenshot helper.  Usage:
//   node tools/shot.mjs "?test=pipeline" out.png [--wait 1500] [--internal] [--scale 3] [--w 1280 --h 720] [--eval "js"]
// --internal saves the exact 320x240 (post-dither) frame upscaled by --scale; otherwise a full-page screenshot.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { writePNG, upscale } from './png.mjs';

const args = process.argv.slice(2);
const url = args[0] || '';
const out = args[1] || 'shot.png';
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const flag = (k) => args.includes(`--${k}`);
const base = process.env.GV_URL || 'http://127.0.0.1:5173/';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: +opt('w', 1280), height: +opt('h', 720) } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(base + url + (url.includes('?') ? '&' : '?') + 'preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 60000 });
const err = await page.evaluate(() => window.__error);
if (err) { console.error('BOOT ERROR', err); }
if (opt('eval')) await page.evaluate(opt('eval'));
await page.waitForTimeout(+opt('wait', 1500));
if (flag('internal')) {
  const snap = await page.evaluate(() => window.__gv.snapshot());
  const raw = Buffer.from(snap.b64, 'base64');
  const k = +opt('scale', 3);
  const up = upscale(new Uint8ClampedArray(raw), snap.w, snap.h, k);
  writePNG(out, up.w, up.h, up.data);
} else {
  await page.screenshot({ path: out });
}
for (const l of logs.slice(0, 20)) console.log(l);
await browser.close();
console.log('saved', out);
