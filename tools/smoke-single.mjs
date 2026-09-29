// Smoke-tests a built single-file HTML: boots it from file://, reports console errors, saves one internal-res frame.
//   node tools/smoke-single.mjs docs/index.html [out.png] [--q "?skip=1"]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { writePNG, upscale } from './png.mjs';

const args = process.argv.slice(2);
const file = path.resolve(args[0] || 'docs/index.html');
const out = args[1] && !args[1].startsWith('--') ? args[1] : 'smoke.png';
const qi = args.indexOf('--q');
const query = qi >= 0 ? args[qi + 1] : '?skip=1';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push('[console.error] ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => problems.push('[pageerror] ' + e.message.slice(0, 300)));
const t0 = Date.now();
await page.goto('file://' + file + query + (query.includes('?') ? '&' : '?') + 'preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
const bootMs = Date.now() - t0;
const err = await page.evaluate(() => window.__error);
await page.waitForTimeout(2500);
const info = await page.evaluate(() => ({ ready: !!window.__ready, hasGame: !!window.__game, state: window.__app && window.__app.state, fps: window.__game && window.__game.frames }));
const snap = await page.evaluate(() => window.__gv.snapshot());
const up = upscale(new Uint8ClampedArray(Buffer.from(snap.b64, 'base64')), snap.w, snap.h, 3);
writePNG(out, up.w, up.h, up.data);
console.log(JSON.stringify({ file: path.basename(file), bootMs, error: err || null, ...info, problems }, null, 1));
console.log('saved', out);
await browser.close();
process.exit(err || problems.length ? 1 : 0);
