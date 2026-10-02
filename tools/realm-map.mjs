// A top-down map of a world as built (terrain hillshade, water, roads, the ribbons of its regions, and everything the level script placed: goals, chests, walls, Snuffers, hint zones, gems, props),
// written to a PNG for layout review. Works for any world of src/game/realms.js; the numbers on the edge are metres from the centre.
//   node tools/realm-map.mjs <realm id> [out.png] [pixels per metre]
import { buildHeadless } from './headless-world.mjs';
import { WATER_LEVEL } from '../src/game/level.js';
import { Pix } from '../src/engine/textures/pix.js';
import { drawText } from '../src/engine/textures/font.js';
import { writePNG } from './png.mjs';

const id = process.argv[2] || 'gloaming';
const out = process.argv[3] || `${id}-map.png`;
const S = +process.argv[4] || 2;
const { grid: g, gp, level: L } = buildHeadless(id);
const N = Math.ceil(g.size * S), p = new Pix(N, N), nrm = [0, 1, 0];
let hi = -1e9;
for (const v of g.heights) hi = Math.max(hi, v);
for (let py = 0; py < N; py++) {
  for (let px = 0; px < N; px++) {
    const x = -g.half + px / S, z = -g.half + py / S, h = g.heightAt(x, z);
    g.normalAt(x, z, nrm);
    const shade = 0.55 + 0.6 * Math.max(0, nrm[0] * -0.5 + nrm[1] * 0.7 + nrm[2] * -0.5), slope = (Math.acos(nrm[1]) * 180) / Math.PI;
    let r, gg, b;
    if (h < WATER_LEVEL) { const d = Math.min(1, -h / 4.5); r = 40 - 20 * d; gg = 120 - 50 * d; b = 190 - 60 * d; }
    else { const k = Math.min(1, h / Math.max(20, hi)); r = 70 + 150 * k; gg = 150 + 60 * k - 80 * k * k; b = 60 + 150 * k; }
    r *= shade; gg *= shade; b *= shade;
    if (slope > 40 && h >= WATER_LEVEL) { r = r * 0.6 + 90; gg *= 0.55; b *= 0.55; }
    p.set(px, py, [Math.min(255, r), Math.min(255, gg), Math.min(255, b), 255]);
  }
}
const W2 = (x, z) => [(x + g.half) * S, (z + g.half) * S];
const dot = (x, z, r, col, fill = true) => { const [px, py] = W2(x, z); p.circle(px, py, r, col, fill); };
for (const pa of g.paths) for (const [x, , z] of pa.pts) dot(x, z, Math.max(1, pa.width * S * 0.28), pa.surface === 'cobble' ? [240, 230, 190, 255] : [200, 160, 100, 255]);
for (const R of L.regions || []) for (const q of R.pts) dot(q[0], q[1], q[3] * S, [255, 255, 255, 120], false);
for (const q of gp.placed) {
  const tree = /tree|pine|bush/.test(q.name), rock = /rock|boulder|spire|crystal|ice|stone/.test(q.name);
  dot(q.x, q.z, 1, tree ? [20, 90, 30, 255] : rock ? [110, 110, 130, 255] : [240, 240, 240, 255]);
}
for (const q of gp.gems) dot(q.x, q.z, 1, [255, 230, 40, 255]);
for (const q of gp.hints) dot(q.x, q.z, q.r * S, [60, 255, 255, 140], false);
for (const q of gp.enemies) dot(q.x, q.z, 3, q.variant === 'bell' ? [255, 180, 40, 255] : q.variant === 'thorn' ? [255, 60, 200, 255] : [255, 40, 40, 255]);
for (const q of gp.chests) dot(q.x, q.z, 4, q.secret ? [255, 120, 0, 255] : [200, 120, 60, 255]);
for (const q of gp.walls) dot(q.x, q.z, 5, [255, 0, 0, 255], false);
for (const q of gp.portals) dot(q.x, q.z, 6, q.kind === 'lift' ? [200, 120, 255, 255] : [150, 150, 255, 255], false);
(gp.beacons || []).forEach((b, i) => { dot(b.x, b.z, 8, [255, 230, 60, 255]); dot(b.x, b.z, 4, [255, 120, 20, 255]); const [px, py] = W2(b.x, b.z); drawText(p, String(i + 1), px + 10, py - 4, { style: 'outline', color: '#ffffff', outlineColor: '#000000' }); });
{ const s = gp.spawn; dot(s.x, s.z, 7, [255, 255, 255, 255]); dot(s.x, s.z, 3, [0, 0, 0, 255]); }
for (let k = -150; k <= 150; k += 50) { const [a, b] = W2(k, 0); p.vline(a, 0, 6, [255, 255, 255, 255]); p.hline(0, b, 6, [255, 255, 255, 255]); drawText(p, String(k), a + 2, 8, { style: 'outline', color: '#ffffff', outlineColor: '#000000' }); drawText(p, String(k), 8, W2(0, k)[1] - 3, { style: 'outline', color: '#ffffff', outlineColor: '#000000' }); }
writePNG(out, N, N, p.data);
console.log(`saved ${out} (${N}x${N}, ${S} px/m; ${gp.beacons.length} goals, ${gp.enemies.length} enemies, ${gp.chests.length} chests, ${gp.gems.length} gems, ${gp.placed.length} props)`);
