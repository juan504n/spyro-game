#!/usr/bin/env node
// The HD textures (src/engine/textures/hd/), tested without a browser or a dev server.
//   node tools/hd-test.mjs [--quick]       (--quick: the kit and the engine's side only; the whole set painted at both sizes takes about 15 s)
//
//   the kit        noise that wraps (however it is stretched), Voronoi equal to a brute-force search, a canvas that wraps (or does not), strokes, the plane of coverage a sprite has, squeezing, bleeding the colour of an edge
//   every painter  there is one for every pixel texture; its size and shape; opaque, or cut out with real holes; not blank; deterministic; seamless where it tiles; its mean colour is its twin's; fast enough
//   the settings   ?hd=0 / 128 / 256, a slow device is given 128, off leaves the pixel textures as they were
//   the engine     what the smooth look takes (the HD image, mipmapped like a tile, a sprite too), what the PS1 look takes (the pixels, as ever), going back and forth, one painting per texture
import { performance } from 'node:perf_hooks';
import crypto from 'node:crypto';
import { ramp, noise, fbm, fbmWH, voronoi, blur, Canvas, grain, smoothstep, wrapN, clamp } from '../src/engine/textures/hd/kit.js';
import { generateWorldTextures } from '../src/engine/textures/world.js';
import { PAINT, HD, HD_STATS, SIZE, configureHD, rampFrom, withoutHD } from '../src/engine/textures/hd/index.js';
import { Pix, RNG } from '../src/engine/textures/pix.js';
import { setTextureSmoothing, setTextureHD, texFromPix } from '../src/engine/materials.js';
import { loadSettings, DEFAULT_SETTINGS } from '../src/engine/gfx.js';
import * as THREE from 'three';

const QUICK = process.argv.includes('--quick');
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : detail); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const sha = (data) => crypto.createHash('sha1').update(data).digest('hex').slice(0, 12);

// ---- the kit -------------------------------------------------------------------------------------------------------------------------------
{
  const R = ramp(['#000000', '#ff0000', '#ffffff']);
  const o = [0, 0, 0];
  check('ramp: the ends are the first and the last colour, the middle is the middle one, past the ends it stays', R(0, o) && o[0] === 0 && R(1, o)[0] === 255 && o[1] === 255 && R(0.5, o)[0] === 255 && o[1] === 0 && R(-3, o)[0] === 0 && R(7, o)[2] === 255);
  check('smoothstep: 0 below, 1 above, and a step (a = b) is finite instead of NaN', smoothstep(0, 1, -1) === 0 && smoothstep(0, 1, 2) === 1 && near(smoothstep(0, 1, 0.5), 0.5) && smoothstep(1, 1, 0.5) === 0 && smoothstep(1, 1, 1.5) === 1 && smoothstep(0.3, 0.3, 0.3) === 1);
  check('wrapN: wraps both ways', wrapN(-1, 8) === 7 && wrapN(9, 8) === 1 && wrapN(0, 8) === 0 && wrapN(-9, 8) === 7);

  // a field that wraps: the step across the seam is no bigger than any other step (the old kit's stretched fields did not wrap)
  const seam = (f, w, h) => {
    let across = 0, inside = 0, ci = 0, ay = 0, iy = 0, cy = 0;
    for (let y = 0; y < h; y++) across += Math.abs(f[y * w] - f[y * w + w - 1]);
    for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) { inside += Math.abs(f[y * w + x] - f[y * w + x - 1]); ci++; }
    for (let x = 0; x < w; x++) ay += Math.abs(f[x] - f[(h - 1) * w + x]);
    for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) { iy += Math.abs(f[y * w + x] - f[(y - 1) * w + x]); cy++; }
    return { x: across / h / (inside / ci), y: ay / w / (iy / cy) };
  };
  let worst = 0;
  for (const [cx, cy] of [[5, 5], [2, 46], [46, 2], [9, 2], [3, 14], [40, 3], [1, 1], [24, 6]]) { const s = seam(fbm(96, 77, cx, 3, 0.55, cy), 96, 96); worst = Math.max(worst, s.x, s.y); }
  check('fbm: wraps on both axes however it is stretched (the step across the seam is like the others)', worst < 1.4, `(worst ${worst.toFixed(2)})`);
  const rect = fbmWH(80, 48, 5, 4, 3, 0.5, 6), rs = seam(rect, 80, 48);
  check('fbmWH: a rectangle wraps too', rs.x < 1.4 && rs.y < 1.4 && rect.length === 80 * 48, `(x ${rs.x.toFixed(2)}, y ${rs.y.toFixed(2)})`);
  const f = fbm(64, 9, 4, 3);
  check('fbm: stretched to 0..1, deterministic, a different seed is a different field', Math.min(...f) === 0 && Math.max(...f) === 1 && sha(Buffer.from(f.buffer)) === sha(Buffer.from(fbm(64, 9, 4, 3).buffer)) && sha(Buffer.from(f.buffer)) !== sha(Buffer.from(fbm(64, 10, 4, 3).buffer)));
  check('fbm: the same as the rectangle of the same size', sha(Buffer.from(fbm(48, 3, 5, 2, 0.5, 7).buffer)) === sha(Buffer.from(fbmWH(48, 48, 3, 5, 2, 0.5, 7).buffer)));
  const nz = noise(3, 6);
  check('noise: periodic in u and v, in 0..1', near(nz(0.3, 0.2), nz(1.3, 1.2), 1e-9) && near(nz(0.9999, 0.5), nz(0, 0.5), 5e-3) && [0.1, 0.5, 0.77].every((u) => nz(u, u) >= 0 && nz(u, u) <= 1));

  // Voronoi against a brute-force search over 7 x 7 cells
  const brute = (n, cols, rows, seed, jitter, stagger) => {
    const r = new RNG(seed), px = new Float32Array(cols * rows), py = new Float32Array(cols * rows), cw = n / cols, ch = n / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const k = j * cols + i; px[k] = (i + 0.5 + (j % 2) * stagger + (r.next() - 0.5) * jitter) * cw; py[k] = (j + 0.5 + (r.next() - 0.5) * jitter) * ch; }
    const f1 = new Float32Array(n * n), f2 = new Float32Array(n * n);
    for (let y = 0; y < n; y++) {
      const cj = Math.floor(y / ch);
      for (let x = 0; x < n; x++) {
        const ci = Math.floor(x / cw);
        let b1 = 1e9, b2 = 1e9;
        for (let dj = -3; dj <= 3; dj++) { const jj = wrapN(cj + dj, rows), oy = Math.floor((cj + dj) / rows) * n; for (let di = -3; di <= 3; di++) { const ii = wrapN(ci + di, cols), ox = Math.floor((ci + di) / cols) * n, k = jj * cols + ii; const ex = x + 0.5 - (px[k] + ox), ey = y + 0.5 - (py[k] + oy), d = ex * ex + ey * ey; if (d < b1) { b2 = b1; b1 = d; } else if (d < b2) b2 = d; } }
        f1[y * n + x] = Math.sqrt(b1); f2[y * n + x] = Math.sqrt(b2);
      }
    }
    return { f1, f2 };
  };
  let bad = 0;
  for (const [c, r, j, st] of [[5, 5, 0.9, 0], [5, 5, 0.95, 0], [15, 15, 0.95, 0], [7, 2, 0.9, 0.5], [5, 5, 0.6, 0.5], [4, 4, 0.8, 0.5], [3, 3, 0.6, 0]]) {
    const a = voronoi(96, c, r, 1234, j, st), b = brute(96, c, r, 1234, j, st);
    for (let i = 0; i < a.f1.length; i++) if (Math.abs(a.f1[i] - b.f1[i]) > 1e-3 || Math.abs(a.f2[i] - b.f2[i]) > 1e-3) bad++;
  }
  check('voronoi: the nearest and the second nearest point are those of a brute-force search (wrapping, staggered, jittered)', bad === 0, `(${bad} differ)`);
  const vv = voronoi(64, 4, 4, 7, 0.8, 0);
  check('voronoi: f1 <= f2, ids in range, (dx, dy) is the vector to the nearest point', vv.f1.every((v, i) => v <= vv.f2[i] + 1e-6) && vv.id.every((v) => v >= 0 && v < 16) && near(Math.hypot(vv.dx[100], vv.dy[100]), vv.f1[100], 1e-3));
  const flat = new Float32Array(32 * 32).fill(0.4), blurred = blur(flat, 32, 3);
  const bump = new Float32Array(32 * 32); bump[5 * 32 + 5] = 1;
  const bb = blur(bump, 32, 2);
  check('blur: a flat field stays flat, a point spreads without losing its weight (it wraps)', blurred.every((v) => near(v, 0.4, 1e-5)) && near(bb.reduce((a, b) => a + b, 0), 1, 1e-4) && bb[5 * 32 + 5] < 1);

  // the canvas
  const cv = new Canvas(16, [10, 20, 30]);
  cv.blend(-1, 0, [255, 0, 0], 1); cv.blend(16, 3, [0, 255, 0], 1);
  check('Canvas: a tile wraps (what is drawn at x = -1 lands on x = n - 1)', cv.px[(0 * 16 + 15) * 3] === 255 && cv.px[(3 * 16 + 0) * 3 + 1] === 255);
  const wide = new Canvas(8, [0, 0, 0], { h: 24 });
  check('Canvas: w x h, row-major, the width is n', wide.w === 8 && wide.h === 24 && wide.n === 8 && wide.px.length === 8 * 24 * 3);
  const fw = new Canvas(8, [0, 0, 0], { h: 4 }); fw.fillWith((x, y, out) => { out[0] = x; out[1] = y; out[2] = 5; });
  check('Canvas.fillWith: every pixel of a rectangle is visited once', fw.px[(3 * 8 + 7) * 3] === 7 && fw.px[(3 * 8 + 7) * 3 + 1] === 3);
  const sc = new Canvas(16, [0, 0, 0], { alpha: true });
  sc.blend(-1, 5, [255, 255, 255], 1); sc.blend(16, 5, [255, 255, 255], 1); sc.blend(3, -1, [255, 255, 255], 1);
  check('Canvas with a plane of coverage (a sprite) does not wrap: what is past the edge is lost, not put on the other side', sc.a.every((v) => v === 0));
  const tilewith = new Canvas(16, [0, 0, 0], { alpha: true, wrap: true }); tilewith.blend(-1, 5, [255, 255, 255], 1);
  check('Canvas { alpha, wrap }: a tile with holes in it wraps', tilewith.a[5 * 16 + 15] === 1);
  const al = new Canvas(8, [0, 0, 0], { alpha: true });
  al.blend(2, 2, [255, 255, 255], 0.5);
  const a1 = al.a[2 * 8 + 2], c1 = al.px[(2 * 8 + 2) * 3];
  al.blend(2, 2, [255, 0, 0], 0.5);
  const a2 = al.a[2 * 8 + 2];
  check('Canvas coverage: paint composes over paint (0.5 then 0.5 is 0.75), and over nothing the colour is the paint\'s own', a1 === 0.5 && c1 === 255 && near(a2, 0.75) && near(al.px[(2 * 8 + 2) * 3 + 1], 255 * 0.5 * 0.5 / 0.75, 1e-3));
  const pix = al.toPix();
  check('Canvas.toPix: RGBA from a canvas with coverage (alpha = coverage), opaque without', pix.data[(2 * 8 + 2) * 4 + 3] === 191 && pix.data[(5 * 8 + 5) * 4 + 3] === 0 && new Canvas(4, [1, 2, 3]).toPix().data[3] === 255);
  // bleeding: where nothing is painted, the colour of the nearest paint (so a filter does not blend in grey)
  const bl = new Canvas(16, [128, 128, 128], { alpha: true }); bl.blend(8, 8, [255, 0, 0], 1);
  const bp = bl.toPix();
  const at = (x, y) => bp.data.slice((y * 16 + x) * 4, (y * 16 + x) * 4 + 4);
  check('Canvas.toPix: a transparent pixel next to paint takes its colour (up to six pixels out; farther it is black), and stays transparent', at(8, 8)[0] === 255 && at(10, 8)[0] === 255 && at(10, 8)[3] === 0 && at(13, 8)[0] === 255 && at(15, 8)[0] === 0 && at(13, 8)[3] === 0);
  // squeezing
  const sq = new Canvas(8, [0, 0, 0]); sq.fillWith((x, y, out) => { out[0] = x % 2 ? 200 : 100; out[1] = y; out[2] = 0; });
  const sp = sq.toPix(4, 8);
  check('Canvas.toPix(w, h): blocks are averaged (a texture painted square is squeezed to its shape)', sp.w === 4 && sp.h === 8 && sp.data[0] === 150 && sp.data[1] === 0 && sp.data[(7 * 4) * 4 + 1] === 7);
  // strokes
  const st = new Canvas(64, [0, 0, 0]);
  st.stroke([[10, 32], [54, 32]], 8, 2, [255, 255, 255], [255, 255, 255], 1);
  const row = (y) => st.px[(y * 64 + 12) * 3], rowEnd = (y) => st.px[(y * 64 + 52) * 3];
  check('Canvas.stroke: full on the line, nothing far from it, narrower at the end that is narrower', row(32) > 250 && row(31) > 250 && row(40) < 1 && row(24) < 1 && rowEnd(32) > 250 && rowEnd(34) < 128 && row(35) > 128);
  const sw = new Canvas(64, [0, 0, 0]); sw.stroke([[60, 10], [70, 10]], 4, 4, [255, 255, 255], [255, 255, 255], 1);
  check('Canvas.stroke: a stroke past the edge of a tile comes back on the other side', sw.px[(10 * 64 + 2) * 3] > 250 && sw.px[(10 * 64 + 61) * 3] > 250);
  const ss = new Canvas(32, [0, 0, 0], { alpha: true }); ss.stroke([[4, 16], [28, 16]], 6, 6, [255, 255, 255], [255, 255, 255], 1);
  let area = 0; for (const v of ss.a) area += v;
  check('Canvas.stroke: the area covered is the length times the width, to within the soft edge', Math.abs(area - 24 * 6) < 24 * 6 * 0.3, `(${area.toFixed(0)} of ${24 * 6})`);
  const gr = new Canvas(32, [0, 0, 0]); gr.stroke([[2, 16], [30, 16]], 4, 4, [0, 0, 0], [200, 100, 0], 1);
  check('Canvas.stroke: the colour goes from the one end to the other', gr.px[(16 * 32 + 4) * 3] < 30 && gr.px[(16 * 32 + 28) * 3] > 150);
  // shade, modulate, tint, matchMean
  const shd = new Canvas(16, [100, 100, 100]);
  const hgt = new Float32Array(256); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) hgt[y * 16 + x] = Math.sin((x / 16) * 2 * Math.PI);
  const sh = shd.shade(hgt, 1, false);
  check('Canvas.shade: lit where the surface rises to the left, dark where it falls, nothing on a flat one', sh[8 * 16 + 8] > 0 && sh[8 * 16 + 0] < 0 && new Canvas(8).shade(new Float32Array(64), 1, false).every((v) => v === 0));
  const mm = new Canvas(8, [50, 100, 150]); mm.matchMean([100, 100, 100], 1);
  check('Canvas.matchMean: the mean colour becomes the target', mm.mean().every((v) => near(v, 100, 1e-3)));
  const tn = new Canvas(8, [0, 0, 0]); tn.tint(new Float32Array(64).fill(0.5), [200, 100, 50], 1);
  check('Canvas.tint / modulate: a half tint is half way, modulate multiplies', near(tn.px[0], 100) && near(tn.px[1], 50) && (() => { const m = new Canvas(4, [100, 100, 100]); m.modulate(new Float32Array(16).fill(-0.5)); return near(m.px[0], 50); })());
  const g = grain(32, 3, 16, 0.05, 48);
  check('grain: w x h, centred on zero, no bigger than its amplitude', g.length === 32 * 48 && g.every((v) => Math.abs(v) <= 0.05 + 1e-6) && Math.abs(g.reduce((a, b) => a + b, 0) / g.length) < 0.01);
  check('grain: a whole number of cells even if asked for a fraction (a fractional lattice made NaN once)', grain(64, 1, 64 / 3, 0.05).every((v) => Number.isFinite(v)));
  // rampFrom: a ramp of the colours a texture uses
  const tp = new Pix(4, 4); for (let i = 0; i < 16; i++) { tp.data[i * 4] = i < 8 ? 10 : 200; tp.data[i * 4 + 1] = i < 8 ? 10 : 200; tp.data[i * 4 + 2] = i < 8 ? 10 : 200; tp.data[i * 4 + 3] = 255; }
  const rf = rampFrom(tp, 3);
  check('rampFrom: dark to light, from the colours the pixel texture has', rf.length === 3 && rf[0][0] === 10 && rf[2][0] === 200 && rf.every((c, i) => i === 0 || c[0] >= rf[i - 1][0]));
}

// ---- the settings --------------------------------------------------------------------------------------------------------------------------
{
  const was = { ...HD };
  const qs = (s) => new URLSearchParams(s);
  check('configureHD: by default HD at 256', (() => { const h = configureHD(qs(''), null); return h.on && h.size === 256; })());
  check('configureHD: ?hd=0 and ?hd=off turn it off', !configureHD(qs('hd=0'), null).on && !configureHD(qs('hd=off'), null).on);
  check('configureHD: ?hd=128 and ?hd=256 choose the size', configureHD(qs('hd=128'), null).size === 128 && configureHD(qs('hd=256'), { hardwareConcurrency: 2 }).size === 256);
  check('configureHD: a device with four cores or fewer, or 2 GB or less, is given 128 unasked; a strong one 256', configureHD(qs(''), { hardwareConcurrency: 4 }).size === 128 && configureHD(qs(''), { hardwareConcurrency: 8, deviceMemory: 2 }).size === 128 && configureHD(qs(''), { hardwareConcurrency: 8, deviceMemory: 8 }).size === 256 && configureHD(qs(''), { hardwareConcurrency: 12 }).size === 256);
  check('configureHD: nonsense is ignored (the default)', (() => { const h = configureHD(qs('hd=banana'), null); return h.on && h.size === 256; })() && configureHD(null, null).size === 256);
  check('configureHD: a player who has turned HD off gets it off (unless the page asks for it), a slow device is still given 128', !configureHD(qs(''), null, false).on && configureHD(qs('hd=256'), null, false).on && configureHD(qs(''), { hardwareConcurrency: 2 }, true).size === 128);
  // the player's setting, as the settings file keeps it
  const keep = globalThis.localStorage;
  const store = (v) => { globalThis.localStorage = { getItem: () => v, setItem: () => {} }; return loadSettings(); };
  check('settings: HD textures are on by default, off when the player saved them off, and a bad value is on', DEFAULT_SETTINGS.hd === true && store(null).hd === true && store('{"hd":false}').hd === false && store('{"hd":"banana"}').hd === true && store('{"hd":0}').hd === true && store('{"hd":true}').hd === true);
  if (keep === undefined) delete globalThis.localStorage; else globalThis.localStorage = keep;
  check('withoutHD: the textures that exist but have no HD painting (the foundry\'s textures.hd rule): a name the game does not have, the placeholder and nothing are not among them', (() => {
    const fake = { a: { pix: { hd() {} } }, b: { pix: {} }, c: { pix: { hd: 3 } } };
    return withoutHD(new Set(['a', 'b', 'c', '_', 'zzz', '', null]), fake).join() === 'b,c';
  })() && withoutHD(new Set(Object.keys(generateWorldTextures())), generateWorldTextures()).length === 0);
  HD.on = was.on; HD.size = was.size;
}

// ---- every painter ---------------------------------------------------------------------------------------------------------------------------
// the textures whose mean colour is not their twin's, and why
const OWN_PALETTE = new Set(['lava', 'barrier', 'portal', 'whirl', 'beam', 'foam']);
/** the seam test of tools/texture-sheet.mjs: the step across the wrap against the steps inside, by column and by row; a seam is suspect only if it is worse than the worst one inside by half again */
function seams(p) {
  const px = (x, y) => { const k = (y * p.w + x) * 4, a = p.data[k + 3] / 255; return [p.data[k] * a, p.data[k + 1] * a, p.data[k + 2] * a + (1 - a) * 0]; };       // (premultiplied: what is not there has no colour to differ in)
  const dist = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
  const pairs = (axis) => {
    const n = axis === 'x' ? p.w : p.h, m = axis === 'x' ? p.h : p.w, d = [];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; let s = 0; for (let k = 0; k < m; k++) s += axis === 'x' ? dist(px(i, k), px(j, k)) : dist(px(k, i), px(k, j)); d.push(s / m); }
    const seam = d[n - 1], inner = d.slice(0, n - 1);
    return { seam, max: Math.max(...inner), mean: inner.reduce((a, b) => a + b, 0) / inner.length };
  };
  return { x: pairs('x'), y: pairs('y') };
}
const mean3 = (p, weighted) => { const m = [0, 0, 0]; let t = 0; for (let i = 0; i < p.w * p.h; i++) { const w = weighted ? p.data[i * 4 + 3] / 255 : 1; m[0] += p.data[i * 4] * w; m[1] += p.data[i * 4 + 1] * w; m[2] += p.data[i * 4 + 2] * w; t += w; } return m.map((v) => v / Math.max(t, 1e-6)); };

function paintersAt(size) {
  HD.on = true; HD.size = size;
  const t0 = performance.now();
  const all = generateWorldTextures();
  const gen = performance.now() - t0;
  const missing = Object.keys(all).filter((n) => !PAINT[n]);
  check(`painters (${size}): there is one for every pixel texture (a realm's own textures may go without: they are enlarged as before)`, missing.length === 0, missing.length ? `(without: ${missing.join(' ')})` : `(${Object.keys(all).length})`);
  check(`painters (${size}): none for a texture that does not exist`, Object.keys(PAINT).every((n) => all[n]));
  check(`painters (${size}): the pixel textures are untouched (no HD key is enumerable, the data is the same as ever)`, Object.values(all).every((e) => !Object.keys(e.pix).includes('hd')) && sha(Buffer.from(all.cobble.pix.data)) === sha(Buffer.from(generateWorldTextures().cobble.pix.data)));
  const bad = [], slow = [], blank = [], dims = [], alpha = [], seam = [], mean = [], twice = [];
  let total = 0, worstMs = 0, worstName = '';
  const before = HD_STATS.made;
  for (const name of Object.keys(PAINT)) {
    const e = all[name];
    const t1 = performance.now(); const p = e.pix.hd(); const ms = performance.now() - t1;
    total += ms; if (ms > worstMs) { worstMs = ms; worstName = name; }
    if (ms > 800) slow.push(`${name} ${ms.toFixed(0)}ms`);
    const side = SIZE[name] || size, k = side / Math.max(e.pix.w, e.pix.h);
    if (p.w !== Math.round(e.pix.w * k) || p.h !== Math.round(e.pix.h * k) || p.data.length !== p.w * p.h * 4) dims.push(`${name} ${p.w}x${p.h} (twin ${e.pix.w}x${e.pix.h})`);
    if (e.pix.hd() !== p) twice.push(name);
    // opaque, or cut out
    let clear = 0, solid = 0;
    let opaque = 0;
    for (let i = 0; i < p.w * p.h; i++) { const a = p.data[i * 4 + 3]; if (a < 8) clear++; else if (a >= 128) solid++; if (a === 255) opaque++; }
    const n = p.w * p.h;
    if (!e.cutout && opaque !== n) alpha.push(`${name}: ${n - opaque} px are not opaque`);
    if (e.cutout && !(clear > n * 0.04 && solid > n * 0.02)) alpha.push(`${name}: a cut-out with ${(100 * clear / n).toFixed(0)}% holes and ${(100 * solid / n).toFixed(0)}% paint`);
    // not blank, no NaN (a NaN is stored as 0: a black card)
    const m = mean3(p, e.cutout);
    let sd = 0, cnt = 0; for (let i = 0; i < n; i++) { if (e.cutout && p.data[i * 4 + 3] < 128) continue; sd += (p.data[i * 4] - m[0]) ** 2 + (p.data[i * 4 + 1] - m[1]) ** 2 + (p.data[i * 4 + 2] - m[2]) ** 2; cnt++; }
    sd = Math.sqrt(sd / Math.max(1, cnt * 3));
    if (sd < 1.5) blank.push(`${name} (sd ${sd.toFixed(1)})`);
    // it tiles
    if (e.tile) {
      const s = seams(p);
      for (const ax of ['x', 'y']) { const q = s[ax]; if (q.seam > q.max * 1.5 + 1.5) seam.push(`${name} ${ax} (seam ${q.seam.toFixed(1)} against ${q.max.toFixed(1)})`); }
    }
    // its twin's colour
    if (e.tile && !e.cutout && !OWN_PALETTE.has(name)) {
      const tw = mean3(e.pix, false), d = Math.hypot(m[0] - tw[0], m[1] - tw[1], m[2] - tw[2]);
      if (d > 14) mean.push(`${name} ${d.toFixed(1)}`);
    }
  }
  check(`painters (${size}): each is the size and the shape of its twin (the longer side as asked, the sprites at their own)`, dims.length === 0, dims.join('; '));
  check(`painters (${size}): the painting is kept (asked twice, the same image)`, twice.length === 0 && HD_STATS.made - before === Object.keys(PAINT).length, twice.join(' '));
  check(`painters (${size}): opaque where the twin is opaque; cut out, with real holes and real paint, where it is cut out`, alpha.length === 0, alpha.join('; '));
  check(`painters (${size}): none is blank or black (a NaN in a painter makes a black card)`, blank.length === 0, blank.join(' '));
  check(`painters (${size}): every one that tiles wraps without a seam`, seam.length === 0, seam.join('; '));
  check(`painters (${size}): the colour of each tile is its twin's (a realm keeps its colours): within 14 of mean colour`, mean.length === 0, mean.join('; '));
  check(`painters (${size}): fast enough: all of them in ${(total / 1000).toFixed(1)} s (generating the pixel textures ${gen.toFixed(0)} ms); the slowest ${worstName} ${worstMs.toFixed(0)} ms`, slow.length === 0 && total < (size === 256 ? 9000 : 6000), slow.join(' '));
  return all;
}

if (!QUICK) {
  const a = paintersAt(256);
  // deterministic: a second generation gives the same bytes
  const b = (HD.size = 256, generateWorldTextures());
  const diff = Object.keys(PAINT).filter((n) => sha(Buffer.from(a[n].pix.hd().data)) !== sha(Buffer.from(b[n].pix.hd().data)));
  check('painters: deterministic (two generations paint the same bytes)', diff.length === 0, diff.join(' '));
  paintersAt(128);
  // at 128 the same pictures: a painting at 128 is the 256 one in miniature (its mean colour is the same to within a few units)
  HD.size = 128; const c = generateWorldTextures(); HD.size = 256;
  const far = [];
  for (const n of Object.keys(PAINT)) { if (!a[n].tile || a[n].cutout) continue; const m1 = mean3(a[n].pix.hd(), false), m2 = mean3(c[n].pix.hd(), false), d = Math.hypot(m1[0] - m2[0], m1[1] - m2[1], m1[2] - m2[2]); if (d > 10) far.push(`${n} ${d.toFixed(1)}`); }
  check('painters: the 128 painting of a tile has the colour of the 256 one (they are one design at two sizes)', far.length === 0, far.join('; '));
}

// ---- the engine ------------------------------------------------------------------------------------------------------------------------------
{
  HD.on = true; HD.size = 256;
  const all = generateWorldTextures();
  const stats0 = HD_STATS.made;
  setTextureSmoothing(true);
  const cob = texFromPix(all.cobble.pix, { tile: true });
  const hdCob = all.cobble.pix.hd();
  check('engine: the smooth look takes the HD image (256 x 256, the very bytes of the painting)', cob.image.width === 256 && cob.image.height === 256 && sha(Buffer.from(cob.image.data)) === sha(Buffer.from(hdCob.data)));
  check('engine: a tile is mipmapped, trilinear, anisotropic and repeats', cob.generateMipmaps === true && cob.minFilter === THREE.LinearMipmapLinearFilter && cob.magFilter === THREE.LinearFilter && cob.anisotropy === 4 && cob.wrapS === THREE.RepeatWrapping);
  const tuft = texFromPix(all.tuft.pix, { tile: false });
  check('engine: a sprite with an HD painting is mipmapped like a tile (it would shimmer at a distance), clamped, and not anisotropic', tuft.image.width === 128 && tuft.generateMipmaps === true && tuft.minFilter === THREE.LinearMipmapLinearFilter && tuft.wrapS === THREE.ClampToEdgeWrapping && tuft.anisotropy === 1);
  const bark = texFromPix(all.bark.pix, { tile: true });
  check('engine: a texture that is not square keeps its shape (the bark is 128 x 256)', bark.image.width === 128 && bark.image.height === 256);
  // a texture with no painter (a realm's own): enlarged and filtered as before
  const own = new Pix(16, 16, '#58ad45');
  const mine = texFromPix(own, { tile: false });
  check('engine: a texture without a painter is enlarged by the old filter (16 x 16 up to 128, no mipmaps for a card)', mine.image.width === 128 && mine.generateMipmaps === false && mine.minFilter === THREE.LinearFilter);
  const mineTile = texFromPix(new Pix(32, 32, '#58ad45'), { tile: true });
  check('engine: ... and a tile of one is mipmapped and 256 wide, as it was', mineTile.image.width === 256 && mineTile.generateMipmaps === true);
  // the PS1 look: the pixels, whatever has a painter
  setTextureSmoothing(false);
  check('engine: the PS1 look takes the pixels (32 x 32, nearest, no mipmaps), HD or not', cob.image.width === 32 && cob.minFilter === THREE.NearestFilter && cob.magFilter === THREE.NearestFilter && cob.generateMipmaps === false && cob.anisotropy === 1 && tuft.image.width === 16 && tuft.generateMipmaps === false && bark.image.width === 16 && bark.image.height === 32);
  check('engine: the pixels are the twin\'s own', sha(Buffer.from(cob.image.data)) === sha(Buffer.from(all.cobble.pix.data)));
  setTextureSmoothing(true);
  check('engine: back to the smooth look the same HD image is used again (painted once)', cob.image.width === 256 && sha(Buffer.from(cob.image.data)) === sha(Buffer.from(hdCob.data)) && all.cobble.pix.hd() === hdCob);
  const made = HD_STATS.made - stats0;
  check('engine: each texture was painted once however often the look was changed', made === 3, `(${made} paintings for the cobbles, the tuft and the bark)`);
  const e = cob.userData.texEntry;
  check('engine: the entry keeps its HD painter and the twin\'s pixels, and the texture holds them as long as it lives', typeof e.hd === 'function' && e.pix.w === 32 && e.tile === true);
  setTextureSmoothing(false);
  const lazy = texFromPix(all.moss.pix, { tile: true });
  check('engine: in the PS1 look nothing is painted (the cost is only paid by the smooth look)', HD_STATS.made - stats0 === 3 && lazy.image.width === 32);
  setTextureSmoothing(true);
  // switching HD off and on while the game is played
  const made1 = HD_STATS.made;
  setTextureHD(false);
  check('engine: HD off (the smooth look still on): the pixels enlarged by the old filter, a card not mipmapped, nothing painted', cob.image.width === 256 && sha(Buffer.from(cob.image.data)) !== sha(Buffer.from(hdCob.data)) && tuft.image.width === 128 && tuft.generateMipmaps === false && tuft.minFilter === THREE.LinearFilter && bark.image.width === 128 && HD_STATS.made === made1 + 0);
  const classic = sha(Buffer.from(cob.image.data));
  setTextureHD(true);
  check('engine: HD on again: the very same painting (no repainting), a card mipmapped again', sha(Buffer.from(cob.image.data)) === sha(Buffer.from(hdCob.data)) && all.cobble.pix.hd() === hdCob && tuft.generateMipmaps === true && HD_STATS.made === made1);
  setTextureHD(false); setTextureHD(false);
  check('engine: HD off twice is off (and the enlarged pixels are the same ones each time)', sha(Buffer.from(cob.image.data)) === classic);
  setTextureSmoothing(false); setTextureHD(true); setTextureSmoothing(true);
  check('engine: whatever order the look and HD are switched in, the PS1 look had the pixels and the smooth look has the HD', cob.image.width === 256 && sha(Buffer.from(cob.image.data)) === sha(Buffer.from(hdCob.data)));
  // a texture made while HD is off, then HD turned on
  setTextureHD(false);
  const late = texFromPix(all.dirt.pix, { tile: true });
  const before = HD_STATS.made;
  check('engine: a texture made while HD is off is not painted', before === HD_STATS.made && late.image.width === 256);
  setTextureHD(true);
  check('engine: ... and is painted when HD comes on', HD_STATS.made === before + 1 && sha(Buffer.from(late.image.data)) === sha(Buffer.from(all.dirt.pix.hd().data)));
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
