// Contact sheet of an actor from several angles (dev models scene) — for reviewing character models.
//   node tools/model-sheet.mjs out.png [--only spyro] [--pose idle] [--views front,front34,side,back34] [--res 480] [--day 0]
//        [--cols 2] [--scale 1] [--opts '{"still":1}']     needs the dev server on :5173 (GV_HMR=0 recommended)
// Views (Spyro faces +z; centre c = model height * 0.5):
//   front front34 side back34 back top head head34 headside game (the chase camera's distance/FOV at 240p, x3)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writePNG, upscale } from './png.mjs';

const args = process.argv.slice(2);
const out = args[0] && !args[0].startsWith('--') ? args[0] : 'sheet.png';
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const only = opt('only', 'spyro');
const pose = opt('pose', 'idle');
const res = +opt('res', 480);
const day = opt('day', '0');
const cols = +opt('cols', 2);
const scale = +opt('scale', 1);
const views = opt('views', 'front,front34,side,back34').split(',');
const poses = opt('poses', '') ? opt('poses', '').split(',') : null;   // one shot per pose (first view), instead of one per view
const hy = +opt('hy', 0.55);          // vertical centre of the model
const opts = opt('opts', '{"still":1}');   // creation options (still = no idle blink / look-around, so renders are repeatable)

const deg = (a) => (a * Math.PI) / 180;
const around = (az, el, d, ty = hy, tx = 0, tz = 0) => [tx + Math.sin(deg(az)) * d * Math.cos(deg(el)), ty + Math.sin(deg(el)) * d, tz + Math.cos(deg(az)) * d * Math.cos(deg(el)), tx, ty, tz];
const VIEW = {
  front: () => around(0, 8, 2.7),
  front34: () => around(38, 12, 2.7),
  side: () => around(90, 6, 2.9),
  back34: () => around(148, 20, 3.1),
  back: () => around(180, 14, 2.9),
  top: () => around(0, 78, 3.0, 0.4),
  head: () => around(0, 8, 1.35, 0.72, 0, 0.42),
  head34: () => around(36, 10, 1.4, 0.72, 0, 0.42),
  headside: () => around(90, 6, 1.5, 0.72, 0, 0.42),
  game: () => around(180, 22, 6.9, 0.6),
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text().slice(0, 200)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 300)}`));
const base = process.env.GV_URL || 'http://127.0.0.1:5173/';
await page.goto(`${base}?test=models&only=${only}&pose=${pose}&res=${res}&day=${day}&opts=${encodeURIComponent(opts)}&preserve=1`);
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 90000 });
const err = await page.evaluate(() => window.__error);
if (err) { console.error('BOOT ERROR', err); await browser.close(); process.exit(1); }

const shots = [];
const jobs = poses ? poses.map((p) => ({ v: views[0], pose: p })) : views.map((v) => ({ v, pose: null }));
for (const { v, pose: pz } of jobs) {
  if (pz) { await page.evaluate((n) => { window.__dev.state.pose = n; window.__dev.state.t = 0; window.__dev.models.forEach(({ m }) => m.flash && m.flash(0)); }, pz); await page.waitForTimeout(900); }
  const spec = VIEW[v] ? VIEW[v]() : v.split('/').map(Number);      // custom "x/y/z/tx/ty/tz"
  const isGame = v === 'game';
  await page.evaluate(({ spec, isGame, res }) => {
    window.__dev.state.cam = spec;
    window.__dev.camera.fov = isGame ? 58 : 50;
    window.__dev.camera.updateProjectionMatrix();
    window.__gv.gfx.set('height', isGame ? 240 : res);
  }, { spec, isGame, res });
  await page.waitForTimeout(isGame ? 700 : 900);
  const snap = await page.evaluate(() => window.__gv.snapshot());
  let data = new Uint8ClampedArray(Buffer.from(snap.b64, 'base64'));
  let w = snap.w, h = snap.h;
  const k = isGame ? Math.max(1, Math.round((res / h) * scale)) : scale;
  if (k !== 1) { const up = upscale(data, w, h, k); data = up.data; w = up.w; h = up.h; }
  shots.push({ v: pz || v, w, h, data });
}
const cw = Math.max(...shots.map((s) => s.w)), ch = Math.max(...shots.map((s) => s.h));
const rows = Math.ceil(shots.length / cols);
const W = cw * Math.min(cols, shots.length), H = ch * rows;
const sheet = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) sheet[i * 4 + 3] = 255;
shots.forEach((s, i) => {
  const ox = (i % cols) * cw, oy = Math.floor(i / cols) * ch;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const a = (y * s.w + x) * 4, b = ((oy + y) * W + ox + x) * 4;
    sheet[b] = s.data[a]; sheet[b + 1] = s.data[a + 1]; sheet[b + 2] = s.data[a + 2]; sheet[b + 3] = 255;
  }
});
writePNG(out, W, H, sheet);
for (const l of logs.slice(0, 10)) console.log(l);
console.log('saved', out, `${W}x${H}`, (poses || views).join(','));
await browser.close();
