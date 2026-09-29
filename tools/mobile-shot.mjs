// Screenshot the game as a touch phone would see it (touch overlay included).
//   node tools/mobile-shot.mjs out.png [--w 844 --h 390] [--q "?skip=1"] [--file path/to/built.html]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const out = args[0] && !args[0].startsWith('--') ? args[0] : 'mobile.png';
const w = +opt('w', 844), h = +opt('h', 390), q = opt('q', '?skip=1');
const file = opt('file', '');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const probs = [];
page.on('pageerror', (e) => probs.push(e.message.slice(0, 200)));
const url = file ? 'file://' + path.resolve(file) : 'http://127.0.0.1:5173/';
await page.goto(url + q + (q.includes('?') ? '&' : '?') + 'preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: out });
console.log('saved', out, probs.length ? probs : 'no page errors');
await browser.close();
