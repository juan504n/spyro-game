// Dumps a top-down map of a world (hillshade, water, roads, walkability, landmarks) to a PNG for layout review.
//   node tools/terrain-map.mjs [out.png] [home]     (the realm by default; `home` maps Dawnhaven, the homeworld)
import { generateTerrain } from '../src/game/terrain.js';
import { LEVEL, WATER_LEVEL } from '../src/game/level.js';
import { HOME, DOORS } from '../src/game/home/level.js';
import { Pix } from '../src/engine/textures/pix.js';
import { writePNG } from './png.mjs';

const out = process.argv[2] || 'terrain-map.png';
const isHome = process.argv[3] === 'home';
const WL = isHome ? HOME : LEVEL;
const t0 = performance.now();
const g = generateTerrain(WL);
console.log('terrain generated in', Math.round(performance.now() - t0), 'ms; grid', g.n + 1, 'x', g.n + 1);
const S = 2;               // px per world unit
const N = Math.ceil(g.size * S);
const p = new Pix(N, N);
let minH = 1e9, maxH = -1e9;
for (const h of g.heights) { minH = Math.min(minH, h); maxH = Math.max(maxH, h); }
console.log('height range', minH.toFixed(1), maxH.toFixed(1));
const nrm = [0, 1, 0];
for (let py = 0; py < N; py++) {
  for (let px = 0; px < N; px++) {
    const x = -g.half + px / S, z = -g.half + py / S;
    const h = g.heightAt(x, z);
    g.normalAt(x, z, nrm);
    // light from north-west
    const shade = Math.max(0, nrm[0] * -0.5 + nrm[1] * 0.7 + nrm[2] * -0.5) ;
    const slope = Math.acos(nrm[1]) * 180 / Math.PI;
    let r, gg, b;
    if (h < WATER_LEVEL) { const d = Math.min(1, -h / 4.5); r = 40 - 20 * d; gg = 120 - 50 * d; b = 190 - 60 * d; }
    else if (h < 8) { r = 70 + h * 6; gg = 140 + h * 3; b = 60; }
    else if (h < 30) { r = 120 + h * 2; gg = 150 - h; b = 70 + h; }
    else { const k = Math.min(1, (h - 30) / 40); r = 150 + 100 * k; gg = 130 + 120 * k; b = 130 + 120 * k; }
    const sh = 0.55 + 0.6 * shade;
    r *= sh; gg *= sh; b *= sh;
    if (slope > 48 && h >= WATER_LEVEL) { r = r * 0.6 + 90; gg *= 0.55; b *= 0.55; }
    p.set(px, py, [Math.min(255, r), Math.min(255, gg), Math.min(255, b), 255]);
  }
}
const W2 = (x, z) => [(x + g.half) * S, (z + g.half) * S];
for (const pa of g.paths) {
  const col = pa.surface === 'cobble' ? [240, 230, 190, 255] : [200, 160, 100, 255];
  for (let k = 0; k < pa.pts.length; k++) { const [x, y, z] = pa.pts[k]; const [px, py] = W2(x, z); p.circle(px, py, Math.max(1, pa.width * S * 0.28), col); }
}
for (const r of g.rivers) for (const [x, y, z] of r.pts) { const [px, py] = W2(x, z); p.circle(px, py, r.width * S * 0.3, [90, 200, 255, 255]); }
if (isHome) {
  for (const d of DOORS) { const [px, py] = W2(d.x, d.z); p.circle(px, py, 7, d.target ? [255, 230, 60, 255] : [150, 150, 255, 255]); p.circle(px, py, 4, [255, 120, 20, 255]); }
  { const [px, py] = W2(0, 0); p.circle(px, py, HOME.plaza.r * S, [255, 255, 255, 255], false); }
  { const [px, py] = W2(HOME.guard.x, HOME.guard.z); p.circle(px, py, 6, [255, 60, 60, 255]); }
} else {
  for (const l of LEVEL.lanterns) { const [px, py] = W2(l.x, l.z); p.circle(px, py, 7, [255, 230, 60, 255]); p.circle(px, py, 4, [255, 120, 20, 255]); }
  for (const i of LEVEL.isles) { const [px, py] = W2(i.x, i.z); p.circle(px, py, i.r * S, [255, 90, 255, 255], false); }
}
{ const [px, py] = W2(WL.spawn.x, WL.spawn.z); p.circle(px, py, 6, [255, 255, 255, 255]); p.circle(px, py, 3, [0, 0, 0, 255]); }
// 50-unit grid ticks
for (let k = -150; k <= 150; k += 50) { const [a] = W2(k, 0); p.vline(a, 0, 6, [255, 255, 255, 255]); p.hline(0, a, 6, [255, 255, 255, 255]); }
writePNG(out, N, N, p.data);
// walkability stats along paths
for (const pa of g.paths) {
  let maxSlope = 0, worst = null;
  for (let k = 0; k < pa.pts.length - 1; k++) {
    const a = pa.pts[k], b = pa.pts[k + 1];
    const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const sl = Math.atan2(Math.abs(b[1] - a[1]), d) * 180 / Math.PI;
    if (sl > maxSlope) { maxSlope = sl; worst = a; }
  }
  let len = 0; for (let k = 0; k < pa.pts.length - 1; k++) len += Math.hypot(pa.pts[k + 1][0] - pa.pts[k][0], pa.pts[k + 1][2] - pa.pts[k][2]);
  console.log(pa.id.padEnd(8), 'len', String(Math.round(len)).padStart(4), 'maxSlope', maxSlope.toFixed(1) + '°', 'start y', pa.pts[0][1].toFixed(1), 'end y', pa.pts[pa.pts.length - 1][1].toFixed(1));
}
if (isHome) for (const d of DOORS) console.log('door', d.id.padEnd(10), 'ground y', g.heightAt(d.x, d.z).toFixed(2));
else for (const l of LEVEL.lanterns) console.log('lantern', l.id.padEnd(7), 'ground y', g.heightAt(l.x, l.z).toFixed(2));
console.log('spawn ground y', g.heightAt(WL.spawn.x, WL.spawn.z).toFixed(2));
console.log('saved', out);
