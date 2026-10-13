// The HD painting of the cracked wall (models/objects/wall.js): the masonry of the `brick` tile laid across the whole panel at the density of the HD tiles (64 px a metre at 256), and over it cracks
// that are drawn as distance fields, not as pixels: a dark, tapering fissure with a soft shadow round it and a lit lip on its lower edge, branching from an impact point, a long fissure from the top, and a few
// stones knocked out (a dark socket with a shadowed upper edge and a lit lower lip), with dust round the break. Written in metres, so the wall's size does not change how it looks.
import { Canvas, RNG, clamp, mix, smoothstep, fbmWH } from './kit.js';
import * as T from './terrain.js';
import { RAMPS } from '../palette.js';

const FISSURE = [18, 14, 28], SOCKET = [22, 18, 32], DUST = [190, 184, 200];

/** a crack as a list of segments { x0, y0, x1, y1, w0, w1 } (pixels): a walk of small steps that wanders, tapering to a hairline, with branches */
function walk(rng, segs, x, y, ang, len, w0, ppm, depth) {
  const step = 0.09 * ppm, n = Math.max(2, Math.round(len / 0.09));
  let px = x, py = y;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    ang += (rng.next() - 0.5) * 0.3;                                                    // (mostly straight, with now and then a sharp turn: stone breaks in angles)
    if (rng.next() < 0.16) ang += (rng.next() - 0.5) * 1.7;
    const nx = px + Math.cos(ang) * step, ny = py + Math.sin(ang) * step;
    const taper = (t) => Math.max(0.007 * ppm, w0 * ppm * Math.pow(1 - t, 0.6));
    segs.push({ x0: px, y0: py, x1: nx, y1: ny, w0: taper(t0), w1: taper(t1) });
    px = nx; py = ny;
    if (depth > 0 && i > 3 && i < n - 3 && rng.next() < 0.07) walk(rng, segs, px, py, ang + (0.5 + rng.next() * 0.6) * (rng.next() < 0.5 ? 1 : -1), len * (0.3 + 0.2 * rng.next()), w0 * 0.5, ppm, depth - 1);
  }
}

/** the signed distance (pixels, negative inside) to the nearest of the segments, per pixel; `sd` is filled with the smallest */
function field(sd, W, H, segs, reach) {
  for (const s of segs) {
    const x0 = Math.max(0, Math.floor(Math.min(s.x0, s.x1) - reach)), x1 = Math.min(W - 1, Math.ceil(Math.max(s.x0, s.x1) + reach));
    const y0 = Math.max(0, Math.floor(Math.min(s.y0, s.y1) - reach)), y1 = Math.min(H - 1, Math.ceil(Math.max(s.y0, s.y1) + reach));
    const dx = s.x1 - s.x0, dy = s.y1 - s.y0, l2 = dx * dx + dy * dy || 1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = clamp(((x + 0.5 - s.x0) * dx + (y + 0.5 - s.y0) * dy) / l2);
        const d = Math.hypot(x + 0.5 - (s.x0 + dx * t), y + 0.5 - (s.y0 + dy * t)) - mix(s.w0, s.w1, t);
        const k = y * W + x;
        if (d < sd[k]) sd[k] = d;
      }
    }
  }
}

/**
 * A w x h metre panel. `size` is the side of the HD tile (256 or 128): the density is size / 4 pixels a metre. `mean` is the mean colour of the pixel brick (the panel keeps the colours of the world's masonry).
 * Returns a Canvas (use toPix()).
 */
export function crackedWall(w, h, { size = 256, mean = null, seed = 1000 } = {}) {
  const ppm = size / 4;
  const W = Math.min(1024, Math.round(w * ppm)), H = Math.min(1024, Math.round(h * ppm));
  const K = ppm / 64;                                            // (the numbers below are for 64 px a metre)
  const rng = new RNG(seed + Math.round(w * 31 + h * 17));
  // the masonry: the brick tile, laid from the bottom edge up so that the courses sit on the ground
  const tile = T.masonry(size, { seed: 21, R: RAMPS.pathStone, mortar: '#3a3648', cols: 4, rows: 8, mean });
  const cv = new Canvas(W, [0, 0, 0], { h: H, wrap: false });
  for (let y = 0; y < H; y++) {
    const ty = size - 1 - ((H - 1 - y) % size);
    for (let x = 0; x < W; x++) {
      const a = (ty * size + (x % size)) * 3, b = (y * W + x) * 3;
      cv.px[b] = tile.px[a]; cv.px[b + 1] = tile.px[a + 1]; cv.px[b + 2] = tile.px[a + 2];
    }
  }
  // the break: an impact point about half way up, five cracks from it, a long fissure from the top and one from the side
  const segs = [];
  const cx = W * (0.5 + (rng.next() - 0.5) * 0.12), cy = H * 0.5;
  for (let k = 0; k < 5; k++) walk(rng, segs, cx, cy, (k / 5) * Math.PI * 2 + (rng.next() - 0.5) * 0.8, 0.9 + rng.next() * 1.1 + (k % 2 ? 0 : 0.5), k % 2 === 0 ? 0.058 : 0.04, ppm, 2);
  walk(rng, segs, W * 0.28, 0, Math.PI / 2 + 0.15, h * 0.55, 0.042, ppm, 2);
  walk(rng, segs, W * 0.82, H * 0.3, Math.PI / 2 - 0.4, h * 0.4, 0.034, ppm, 1);
  const reach = 9 * K;
  const sd = new Float32Array(W * H).fill(1e4);
  field(sd, W, H, segs, reach);
  // stones knocked out of the wall, on the cracks: a socket whose shape is a warped ellipse
  const chip = new Float32Array(W * H);
  const noise = fbmWH(W, H, seed + 5, 14, 2, 0.5, Math.max(2, Math.round(14 * H / W)));
  for (let c = 0; c < 3; c++) {
    const sg = segs[Math.floor(rng.next() * Math.min(segs.length, 45))], x = sg.x0, y = sg.y0;       // (on a crack near the impact)
    const rx = (0.12 + rng.next() * 0.1) * ppm, ry = rx * (0.55 + rng.next() * 0.3), rot = (rng.next() - 0.5) * 0.7, cs = Math.cos(rot), sn = Math.sin(rot);
    for (let yy = Math.max(0, Math.floor(y - rx * 1.4)); yy < Math.min(H, Math.ceil(y + rx * 1.4)); yy++) {
      for (let xx = Math.max(0, Math.floor(x - rx * 1.4)); xx < Math.min(W, Math.ceil(x + rx * 1.4)); xx++) {
        const u = ((xx - x) * cs + (yy - y) * sn) / rx, v = (-(xx - x) * sn + (yy - y) * cs) / ry;
        const r = Math.hypot(u, v) * (1 + (noise[yy * W + xx] - 0.5) * 0.9);
        const m = 1 - smoothstep(0.9, 1.0, r);
        if (m > chip[yy * W + xx]) chip[yy * W + xx] = m;
      }
    }
  }
  const dust = fbmWH(W, H, seed + 9, 6, 3, 0.5, Math.max(2, Math.round(6 * H / W)));
  const at = (a, x, y) => a[clamp(y | 0, 0, H - 1) * W + clamp(x | 0, 0, W - 1)];
  const L = 2.2 * K;                                              // (the light is from the upper left: the lower-right lip of a break is lit, its upper-left wall in shadow)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x, i = k * 3, d = sd[k], m = chip[k];
      // dust and a soft shadow round the crack and the sockets
      const near = 1 - smoothstep(0, 6 * K, Math.min(d, (1 - m) * 8 * K));
      const dim = 1 - 0.42 * near - 0.2 * (1 - smoothstep(0, 16 * K, Math.min(d, 40 * K))) * dust[k];
      cv.px[i] *= dim; cv.px[i + 1] *= dim; cv.px[i + 2] *= dim;
      // a socket: dark, deepest in the shadow of its upper-left wall; and a lit lip just outside it, where its lower-right edge meets the face
      const ml = at(chip, x - L, y - L);
      if (m > 0) {
        const depth = clamp(0.25 + 0.75 * ml, 0, 1);
        for (let c = 0; c < 3; c++) cv.px[i + c] = mix(cv.px[i + c], SOCKET[c] * (0.45 + 0.6 * depth), m);
      } else if (ml > 0.3) for (let c = 0; c < 3; c++) cv.px[i + c] = mix(cv.px[i + c], 232 - c * 6, 0.4 * ml);
      // the fissure: black in its heart, a lit lip on the edge that faces the light
      if (d < 3 * K) {
        const inside = 1 - smoothstep(-0.5 * K, 0.9 * K, d);
        const g = at(sd, x + 1, y + 1) - at(sd, x - 1, y - 1);                      // (> 0 on the lower-right side of the crack)
        const lip = (1 - smoothstep(0, 2.2 * K, d)) * (1 - inside) * clamp(g * 1.2, 0, 1) * 0.55;
        for (let c = 0; c < 3; c++) {
          const v = mix(cv.px[i + c], FISSURE[c] * (0.7 + 0.5 * smoothstep(-3 * K, 0.8 * K, d)), inside);
          cv.px[i + c] = mix(v, 226 - c * 8, lip);
        }
      }
      // a little pale dust that has fallen on the stones below the break
      const fall = smoothstep(0, 0.2 * H, y - cy) * (1 - m) * (1 - smoothstep(0, 10 * K, d)) * 0.12 * dust[k];
      for (let c = 0; c < 3; c++) cv.px[i + c] = mix(cv.px[i + c], DUST[c], fall);
    }
  }
  if (mean) cv.matchMean(mean, 0.85);
  return cv;
}
