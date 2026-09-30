// Gem pickup sound regression test (game side): the audio is stubbed, so this checks WHAT the game asks for —
// the chime, its volume and the pitch ladder of a quick run of pickups — not how it sounds.
//   node tools/gem-sound-test.mjs      (needs the dev server on :5173, GV_HMR=0 recommended)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
await page.goto('http://127.0.0.1:5173/?skip=1&preserve=1');
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
await page.addScriptTag({ path: path.join(here, 'bot-inject.js') });
await page.waitForTimeout(1200);

const r = await page.evaluate(() => {
  const g = __game, F = g.gems;
  const calls = [];
  g.audio = { sfx: (name, o) => calls.push({ name, vol: o.vol, pitch: +(o.pitch ?? 1).toFixed(4) }) };
  const pick = (t, value) => { g.time = t; const it = F._add(g.player.x, g.player.y + 30, g.player.z, value, true); F._collect(it, g); };
  const semi = (p) => Math.round(12 * Math.log2(p) * 100) / 100;
  // a run of six red pickups 0.3 s apart, then a pause, then gold, green (still a run), purple
  [100, 100.3, 100.6, 100.9, 101.2, 101.5].forEach((t) => pick(t, 1));
  pick(103, 1);                   // > 0.85 s after the previous one: the run starts over
  pick(103.2, 10);
  pick(103.4, 2);
  pick(103.6, 25);
  return { calls: calls.map((c) => ({ name: c.name, vol: c.vol, semis: semi(c.pitch) })) };
});
const seq = r.calls.map((c) => `${c.name.replace('gem_', '')}:${c.semis}`).join(' ');
console.log(seq);
const want = ['red:0', 'red:5', 'red:7', 'red:12', 'red:7', 'red:12', 'red:0', 'gold:0', 'green:7', 'purple:0'];
const volOk = r.calls.every((c) => ({ gem_red: 0.8, gem_green: 0.85, gem_blue: 0.9, gem_gold: 1, gem_purple: 1 })[c.name] === c.vol);
const ok = seq === want.join(' ') && volOk;
console.log(ok ? 'PASS  gem chime: run ladder, reset after a pause, gold/purple unshifted, per-type volume' : 'FAIL  expected ' + want.join(' ') + (volOk ? '' : ' (volumes wrong)'));
await browser.close();
process.exit(ok ? 0 : 1);
