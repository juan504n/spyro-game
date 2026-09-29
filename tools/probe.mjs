// Evaluate a JS expression / file in the booted game page and print the JSON result.
// Usage: node tools/probe.mjs "<js expression | path/to/file.js>" [--q "?skip=1"] [--wait 1200]
// The expression may use window.__game / window.__app; a file's contents are wrapped as an async function body ("return" allowed).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const args = process.argv.slice(2);
const src = args[0] || 'document.title';
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const query = opt('q', '?skip=1');
const code = fs.existsSync(src) ? fs.readFileSync(src, 'utf8') : `return (${src})`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 400)));
await page.goto('http://127.0.0.1:5173/' + query + (query.includes('?') ? '&' : '?') + 'preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
const err = await page.evaluate(() => window.__error);
if (err) { console.log('BOOT ERROR', err); await browser.close(); process.exit(1); }
await page.waitForTimeout(+opt('wait', 1200));
try {
  const r = await page.evaluate(`(async () => { ${code} })()`);
  console.log(JSON.stringify(r, null, 1));
} catch (e) { console.log('EVAL ERROR', e.message.slice(0, 600)); }
await browser.close();
