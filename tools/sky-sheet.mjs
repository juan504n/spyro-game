// A contact sheet of a painted sky (src/game/skybox/): the whole panorama as a strip and four views of it as the camera sees it (a 75 degree field, a little above the horizon),
// painted in node (no server, no browser), for looking at a sky while it is being made.
//   node tools/sky-sheet.mjs out.png <GLOAMING|FROSTBLOOM|EMBERFALL|SKYWEAVER|TIDEGLASS|GUARDIAN> [A|B|both] [--views az1,az2,...] [--pitch 9]
import { paintSky, EL_MIN, EL_MAX } from '../src/game/skybox/paint.js';
import * as SPECS from '../src/game/skybox/specs.js';
import { writePNG } from './png.mjs';

const args = process.argv.slice(2);
const out = args[0], name = (args[1] || 'GLOAMING').toUpperCase(), which = (args[2] && !args[2].startsWith('--') ? args[2] : 'both').toUpperCase();
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const azs = opt('views', '10,100,190,280').split(',').map(Number), pitch = +opt('pitch', 9);
const pair = SPECS[name];
if (!out || !pair) { console.log('usage: node tools/sky-sheet.mjs out.png <GLOAMING|FROSTBLOOM|EMBERFALL|SKYWEAVER|TIDEGLASS|GUARDIAN> [A|B|both]'); process.exit(1); }
const D2R = Math.PI / 180, SPAN = EL_MAX - EL_MIN;
const moods = which === 'A' ? [0] : which === 'B' ? [1] : [0, 1];
const VW = 400, VH = 225, STRIP_W = VW * 4, STRIP_H = 150;
const rows = [];
const t0 = Date.now();
for (const m of moods) {
  const sky = paintSky(pair[m], { w: 1024, h: 256, grade: 0 });
  const samp = (az, el) => {
    const u = ((az / 360) % 1 + 1) % 1 * sky.w - 0.5, v = Math.min(sky.h - 1.001, Math.max(0, ((el - EL_MIN) / SPAN) * sky.h - 0.5));
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, x1 = (x0 + 1 + sky.w) % sky.w, xa = (x0 + sky.w) % sky.w;
    const g = (x, y, c) => sky.data[(y * sky.w + x) * 4 + c];
    return [0, 1, 2].map((c) => (g(xa, y0, c) * (1 - fx) + g(x1, y0, c) * fx) * (1 - fy) + (g(xa, y0 + 1, c) * (1 - fx) + g(x1, y0 + 1, c) * fx) * fy);
  };
  const img = new Uint8ClampedArray((STRIP_W) * (STRIP_H + VH) * 4).fill(255);
  for (let y = 0; y < STRIP_H; y++) for (let x = 0; x < STRIP_W; x++) { const c = samp((x / STRIP_W) * 360, EL_MAX - (y / STRIP_H) * SPAN); const o = (y * STRIP_W + x) * 4; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; }
  const f = Math.tan(37.5 * D2R);
  azs.forEach((az, vi) => {
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
      const sx = ((x + 0.5) / VW - 0.5) * 2 * f, sy = -((y + 0.5) / VH - 0.5) * 2 * f * (VH / VW);
      // camera looks along (cos p cos a, sin p, cos p sin a); right = (-sin a, 0, cos a)... (azimuth runs +x -> +z)
      const a = az * D2R, p = pitch * D2R;
      const fw = [Math.cos(p) * Math.cos(a), Math.sin(p), Math.cos(p) * Math.sin(a)], rt = [Math.sin(a), 0, -Math.cos(a)], up = [-Math.sin(p) * Math.cos(a), Math.cos(p), -Math.sin(p) * Math.sin(a)];
      const d = [fw[0] + rt[0] * sx + up[0] * sy, fw[1] + rt[1] * sx + up[1] * sy, fw[2] + rt[2] * sx + up[2] * sy];
      const l = Math.hypot(...d), el = Math.asin(d[1] / l) / D2R, az2 = Math.atan2(d[2], d[0]) / D2R;
      const c = samp(az2, el), o = ((STRIP_H + y) * STRIP_W + vi * VW + x) * 4;
      img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
    }
  });
  rows.push(img);
}
const H = (STRIP_H + VH) * rows.length, sheet = new Uint8ClampedArray(STRIP_W * H * 4);
rows.forEach((r, i) => sheet.set(r, i * STRIP_W * (STRIP_H + VH) * 4));
writePNG(out, STRIP_W, H, sheet);
console.log(`saved ${out} (${name} ${moods.map((m) => 'AB'[m]).join('+')}, ${Date.now() - t0} ms)`);
