// A tour of a world's ground for the eye: the hero is put at the TRAVEL places, along every road and at scattered walkable points, facing along the road or away from the nearest wall, and the game's own
// 320x240 frame is saved (upscaled) with a manifest of where it was taken and what the ground is made of there. Made to look for what looks unprofessional (hard-edged patches, squares, seams, stretched or
// mismatched textures) and to compare before and after.
//   node tools/look-tour.mjs <world id> <out dir> [--n 24] [--seed 1] [--scale 3] [--only places|roads|scatter] [--look smooth|ps1]
//   (needs the dev server on :5173; GV_URL=... for another)   -> <out dir>/<world>-NN-<tag>.png and <out dir>/manifest.json: [{ file, tag, x, y, z, yaw, ground: {under, why, near: {texture: share}} }]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { writePNG, upscale } from './png.mjs';

const args = process.argv.slice(2);
const world = args[0], outDir = args[1];
if (!world || !outDir) { console.log('usage: node tools/look-tour.mjs <world id> <out dir> [--n 24] [--seed 1] [--scale 3] [--only places|roads|scatter] [--look smooth|ps1]'); process.exit(1); }
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const N = +opt('n', 24), SEED = +opt('seed', 1), SCALE = +opt('scale', 3), ONLY = opt('only', null), LOOK = opt('look', null);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
await page.goto((process.env.GV_URL || 'http://127.0.0.1:5173/') + `?world=${world}&preserve=1${LOOK ? '&look=' + LOOK : ''}`);
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });
const err = await page.evaluate(() => window.__error);
if (err) { console.log('BOOT ERROR', String(err).slice(0, 300)); process.exit(1); }
await page.evaluate(() => { const a = window.__app; if (a && (a.state === 'title' || a.state === 'intro')) a.beginPlay(false); });       // (Gloaming Vale starts on its title screen)
await page.waitForTimeout(1500);

const views = await page.evaluate(async ({ N, SEED, ONLY }) => {
  const g = window.__game, grid = g.grid;
  const { travelPlaces } = await import('/src/game/travel.js');
  let s = SEED * 2654435761 >>> 0 || 1; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const out = [];
  const walkable = (x, z) => { const n = grid.normalAt(x, z); return n[1] > 0.8 && grid.heightAt(x, z) > g.waterY + 0.4; };
  if (!ONLY || ONLY === 'places') for (const p of travelPlaces(g.realm.id)) out.push({ tag: 'place-' + p.id, x: p.x, z: p.z, yaw: p.yaw });
  if (!ONLY || ONLY === 'roads') {
    const paths = (grid.paths || []).filter((q) => q.pts && q.pts.length > 3);
    for (const q of paths) for (const f of [0.15, 0.5, 0.85]) {
      const i = Math.floor(f * (q.pts.length - 2)), a = q.pts[i], b = q.pts[i + 1];
      out.push({ tag: `road-${q.id}-${Math.round(f * 100)}`, x: a[0], z: a[2], yaw: Math.atan2(b[0] - a[0], b[2] - a[2]) });
    }
  }
  if (!ONLY || ONLY === 'scatter') {
    const size = g.level.world ? g.level.world.size : 400, half = size / 2 - 30;
    let tries = 0;
    while (out.filter((o) => o.tag.startsWith('scatter')).length < N && tries++ < 4000) {
      const x = (rnd() * 2 - 1) * half, z = (rnd() * 2 - 1) * half;
      if (!walkable(x, z)) continue;
      out.push({ tag: 'scatter-' + out.length, x, z, yaw: rnd() * 6.28 });
    }
  }
  return out;
}, { N, SEED, ONLY });

const manifest = [];
let k = 0;
for (const v of views) {
  const rec = await page.evaluate(async (v) => {
    const g = window.__game, p = g.player, grid = g.grid;
    const { terrainPicker } = await import('/src/game/terrain-mesh.js');
    g.player.place(v.x, grid.heightAt(v.x, v.z) + 0.05, v.z, v.yaw);
    p.invulnT = 0;          // (no blinking: the hero is drawn; the foes are sent away below)
    for (const e of (g.enemies ? g.enemies.list : []).slice()) g.enemies.dismiss(e);
    g.cam.snapBehind(p);
    g.hud.visible = false; g.hud.bannerState = null; g.hud.hintState = null;          // (nothing over the ground: the tour is about how the world looks)
    for (let i = 0; i < 40; i++) window.__app.update(1 / 60);
    const pick = terrainPicker(grid), under = pick.at(p.x, p.z), near = {};
    let n = 0;
    for (let dx = -14; dx <= 14; dx += 2) for (let dz = -14; dz <= 14; dz += 2) { const t = pick.at(p.x + dx, p.z + dz); near[t.tex] = (near[t.tex] || 0) + 1; n++; }
    for (const t of Object.keys(near)) near[t] = +(near[t] / n).toFixed(2);
    return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1), yaw: +p.yaw.toFixed(2), ground: { under: under.tex, why: under.why, near } };
  }, v);
  const snap = await page.evaluate(() => window.__gv.snapshot());
  const up = upscale(new Uint8ClampedArray(Buffer.from(snap.b64, 'base64')), snap.w, snap.h, SCALE);
  const file = `${world}-${String(k++).padStart(2, '0')}-${v.tag}.png`;
  writePNG(path.join(outDir, file), up.w, up.h, up.data);
  manifest.push({ file, tag: v.tag, ...rec });
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
await browser.close();
console.log(`${world}: ${manifest.length} views in ${outDir}`);
