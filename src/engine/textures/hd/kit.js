// High-resolution painting kit for the HD textures (src/engine/textures/hd/). DOM-free and deterministic, like the pixel kit it sits beside.
//
// The pixel textures (../world/*.js) are painted on a 32 x 32 grid from <= 16 colours; this kit paints the same materials on a 128-256 px grid in floating point, so there is no palette and no dither: smooth
// shading, fine strokes, soft edges. Everything wraps (every drawing call and every field is periodic), so a tile is seamless by construction, as in the pixel kit.
//
//   const cv = new Canvas(256);                       a float RGB canvas, n x n, wrapping
//   const f = fbm(256, seed, 4, 4);                   a periodic noise field (0..1), 4 cells across, 4 octaves
//   const R = ramp(['#2f6e35', '#58ad45', '#c4f088']); colour at t (0..1) along a list of colours
//   cv.fillWith((x, y, out) => R.at(f[y * 256 + x], out));
//   cv.stroke(pts, 3, 0.6, c0, c1, 0.9);              a tapered stroke through points, colour c0 -> c1 along it, alpha 0.9
//   cv.shade(height, strength);                       light a height field from the upper left (the pixel textures' light)
//   cv.toPix()                                        -> Pix (RGBA8, opaque)
import { Pix, RNG, rgb } from '../pix.js';

export { RNG };

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const mix = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { if (a === b) return x < a ? 0 : 1; const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const wrapN = (v, n) => ((v % n) + n) % n;

/** a count of things (flecks, leaves, pebbles) written for a 256 px canvas, for one of n px: the number scales with the area, so a painting at 128 is the same picture in miniature */
export const cnt = (c, n) => Math.max(1, Math.round(c * (n / 256) * (n / 256)));

/** colour at t (0..1) along a list of colours (hex strings or [r,g,b]); `.at(t, out)` fills out[0..2] without allocating */
export function ramp(list) {
  const cols = list.map((c) => { const v = rgb(c); return [v[0], v[1], v[2]]; });
  const n = cols.length - 1;
  const at = (t, out = [0, 0, 0]) => {
    const f = clamp(t) * n;
    let i = Math.floor(f);
    if (i >= n) i = n - 1;
    const q = f - i, a = cols[i], b = cols[i + 1];
    out[0] = a[0] + (b[0] - a[0]) * q; out[1] = a[1] + (b[1] - a[1]) * q; out[2] = a[2] + (b[2] - a[2]) * q;
    return out;
  };
  at.cols = cols;
  return at;
}

/** the colour as [r, g, b] (0..255) */
export const col = (c) => { const v = rgb(c); return [v[0], v[1], v[2]]; };

/** periodic value noise: f(u, v) for u, v in 0..1 (they wrap), `cells` lattice cells across; smooth (quintic) */
export function noise(seed, cells) {
  const r = new RNG(seed);
  const lat = new Float32Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = r.next();
  return (u, v) => {
    const x = u * cells, y = v * cells;
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10), sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const x0 = wrapN(xi, cells), x1 = (x0 + 1) % cells, y0 = wrapN(yi, cells), y1 = (y0 + 1) % cells;
    const a = lat[y0 * cells + x0], b = lat[y0 * cells + x1], c = lat[y1 * cells + x0], d = lat[y1 * cells + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/**
 * A periodic fractal noise field over a w x h grid, 0..1 (stretched to the full range): cx x cy lattice cells across for the first octave (cy defaults to cx), each octave twice as fine.
 * The lattice is cx x cy (not square), so the field wraps on both axes however stretched it is: a texture made of it tiles without a seam.
 */
export function fbmWH(w, h, seed, cx, oct = 4, gain = 0.5, cy = cx) {
  const out = new Float32Array(w * h);
  const xa = new Int32Array(w), xb = new Int32Array(w), xs = new Float32Array(w), ya = new Int32Array(h), yb = new Int32Array(h), ys = new Float32Array(h);
  let amp = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    const fx = cx * (1 << o), fy = cy * (1 << o);
    const r = new RNG(seed + o * 977), lat = new Float32Array(fx * fy);
    for (let i = 0; i < lat.length; i++) lat[i] = r.next();
    // where each column and each row falls in the lattice (the same for every pixel of it): the cell, the next cell (wrapping) and the smoothed fraction
    for (let x = 0; x < w; x++) { const t = (x * fx) / w, i = Math.floor(t), f = t - i; xa[x] = i % fx; xb[x] = (i + 1) % fx; xs[x] = f * f * f * (f * (f * 6 - 15) + 10); }
    for (let y = 0; y < h; y++) { const t = (y * fy) / h, i = Math.floor(t), f = t - i; ya[y] = (i % fy) * fx; yb[y] = ((i + 1) % fy) * fx; ys[y] = f * f * f * (f * (f * 6 - 15) + 10); }
    for (let y = 0; y < h; y++) {
      const r0 = ya[y], r1 = yb[y], sy = ys[y], row = y * w;
      for (let x = 0; x < w; x++) {
        const x0 = xa[x], x1 = xb[x], sx = xs[x];
        const a = lat[r0 + x0], b = lat[r0 + x1], c = lat[r1 + x0], d = lat[r1 + x1];
        out[row + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    norm += amp;
    amp *= gain;
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < out.length; i++) { out[i] /= norm; if (out[i] < lo) lo = out[i]; if (out[i] > hi) hi = out[i]; }
  const k = 1 / Math.max(1e-6, hi - lo);
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) * k;
  return out;
}

/** a periodic fractal noise field over an n x n grid (see fbmWH) */
export const fbm = (n, seed, cx, oct = 4, gain = 0.5, cy = cx) => fbmWH(n, n, seed, cx, oct, gain, cy);

/**
 * Voronoi cells on a torus of n x n pixels from a jittered grid of cols x rows points (every other row shifted by `stagger` of a cell).
 * For each pixel: id of the nearest point, f1 / f2 = distance (px) to the nearest / the second nearest, and (dx, dy) = the vector from the nearest point to the pixel.
 * (f2 - f1) / 2 is about the distance to the border between two cells.
 */
export function voronoi(n, cols, rows, seed, jitter = 0.8, stagger = 0) {
  const r = new RNG(seed);
  const px = new Float32Array(cols * rows), py = new Float32Array(cols * rows);
  const cw = n / cols, ch = n / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      px[k] = (i + 0.5 + (j % 2) * stagger + (r.next() - 0.5) * jitter) * cw;
      py[k] = (j + 0.5 + (r.next() - 0.5) * jitter) * ch;
    }
  }
  const id = new Int16Array(n * n), f1 = new Float32Array(n * n), f2 = new Float32Array(n * n), dx = new Float32Array(n * n), dy = new Float32Array(n * n);
  // the nearest two points are almost always in the 3 x 3 cells round the pixel's own; the 16 cells of the ring beyond are looked at only when the second nearest found is farther than any of them could be
  const lim = Math.max(0, Math.min(cw * (1.5 - jitter / 2 - stagger), ch * (1.5 - jitter / 2))), lim2 = lim * lim;
  for (let y = 0; y < n; y++) {
    const cj = Math.floor(y / ch);
    for (let x = 0; x < n; x++) {
      const ci = Math.floor(x / cw);
      let b1 = 1e9, b2 = 1e9, bi = 0, bx = 0, by = 0;
      for (let ring = 0; ring < 2; ring++) {
        if (ring === 1 && b2 < lim2) break;
        const R = ring === 0 ? 1 : 2;
        for (let dj = -R; dj <= R; dj++) {
          const jj = wrapN(cj + dj, rows), oy = Math.floor((cj + dj) / rows) * n;
          const edgeRow = dj === -2 || dj === 2;
          for (let di = -R; di <= R; di++) {
            if (ring === 1 && !edgeRow && di !== -2 && di !== 2) continue;       // (the ring only: the inner 3 x 3 is done)
            const ii = wrapN(ci + di, cols), ox = Math.floor((ci + di) / cols) * n;
            const k = jj * cols + ii;
            const ex = x + 0.5 - (px[k] + ox), ey = y + 0.5 - (py[k] + oy);
            const d = ex * ex + ey * ey;
            if (d < b1) { b2 = b1; b1 = d; bi = k; bx = ex; by = ey; } else if (d < b2) b2 = d;
          }
        }
      }
      const q = y * n + x;
      id[q] = bi; f1[q] = Math.sqrt(b1); f2[q] = Math.sqrt(b2); dx[q] = bx; dy[q] = by;
    }
  }
  return { n, id, f1, f2, dx, dy, count: cols * rows };
}

/** blur a periodic n x n field with a box of radius r (twice: close to a gaussian) */
export function blur(src, n, r) {
  if (r < 1) return src.slice();
  let a = src.slice(), b = new Float32Array(src.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < n; y++) {                       // horizontal
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += a[y * n + wrapN(k, n)];
      for (let x = 0; x < n; x++) {
        b[y * n + x] = sum / (2 * r + 1);
        sum += a[y * n + wrapN(x + r + 1, n)] - a[y * n + wrapN(x - r, n)];
      }
    }
    for (let x = 0; x < n; x++) {                       // vertical
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += b[wrapN(k, n) * n + x];
      for (let y = 0; y < n; y++) {
        a[y * n + x] = sum / (2 * r + 1);
        sum += b[wrapN(y + r + 1, n) * n + x] - b[wrapN(y - r, n) * n + x];
      }
    }
  }
  return a;
}

/** two periodic fields of offsets (px) in -amp..amp, for warping coordinates: edges that were straight become the edges of rock */
export function warp(n, seed, cells = 4, amp = 6) {
  const a = fbm(n, seed, cells, 3, 0.5), b = fbm(n, seed + 31, cells, 3, 0.5);
  for (let i = 0; i < a.length; i++) { a[i] = (a[i] - 0.5) * 2 * amp; b[i] = (b[i] - 0.5) * 2 * amp; }
  return { dx: a, dy: b };
}

let scratchCov = new Float32Array(1 << 14), scratchT = new Float32Array(1 << 14);       // (the coverage of the stroke being drawn: see Canvas.stroke)

export class Canvas {
  /**
   * A canvas of w x h pixels (h defaults to w) of floating point RGB, filled with `fill`. `n` is the width (the painters of square textures use it for both).
   * `ref` is the size (of the longer side) the painter's numbers were written for: 256 for a tile that is painted at HD.size, the size of the card for a sprite.
   * { alpha: true } adds a plane of coverage (0 = nothing painted yet), for a sprite: blend() then composes over what is there, and toPix() makes an RGBA image. { wrap: true } on such a canvas is a tile with holes in it (foam).
   */
  constructor(w, fill = [128, 128, 128], { h = w, alpha = false, wrap = !alpha, ref = 256 } = {}) {
    this.n = w; this.w = w; this.h = h;
    this.k = Math.max(w, h) / ref;                                   // (how big the canvas is against the size its painter was written for: shade() is by the slope from one pixel to the next, which grows as the pixels get bigger)
    this.wrap = wrap;                                                // (a tile wraps: what is drawn past an edge comes back on the other side. A sprite does not)
    this.px = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) { this.px[i * 3] = fill[0]; this.px[i * 3 + 1] = fill[1]; this.px[i * 3 + 2] = fill[2]; }
    this.a = alpha ? new Float32Array(w * h) : null;
  }

  /** set every pixel from f(x, y, out): out is an [r, g, b] to fill */
  fillWith(f) {
    const w = this.w, h = this.h, out = [0, 0, 0];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        f(x, y, out);
        const i = (y * w + x) * 3;
        this.px[i] = out[0]; this.px[i + 1] = out[1]; this.px[i + 2] = out[2];
      }
    }
    return this;
  }

  /** alpha-blend a colour into a pixel (x, y wrap); on a canvas with a plane of coverage, the colour is composed over what is there */
  blend(x, y, c, a) {
    const w = this.w, h = this.h;
    if (x < 0 || x >= w) { if (!this.wrap) return; x = wrapN(x, w); }
    if (y < 0 || y >= h) { if (!this.wrap) return; y = wrapN(y, h); }
    const p = y * w + x, i = p * 3;
    if (this.a) {
      const a0 = this.a[p], keep = a0 * (1 - a), a1 = a + keep;
      if (a1 > 1e-6) { const inv = 1 / a1; this.px[i] = (c[0] * a + this.px[i] * keep) * inv; this.px[i + 1] = (c[1] * a + this.px[i + 1] * keep) * inv; this.px[i + 2] = (c[2] * a + this.px[i + 2] * keep) * inv; }
      this.a[p] = a1;
      return;
    }
    const q = 1 - a;
    this.px[i] = this.px[i] * q + c[0] * a; this.px[i + 1] = this.px[i + 1] * q + c[1] * a; this.px[i + 2] = this.px[i + 2] * q + c[2] * a;
  }

  /** multiply every pixel by 1 + k[i] (k = a field, e.g. shade() or a noise field centred on 0), per channel gain g = [1, 1, 1] by default */
  modulate(k, amount = 1, g = [1, 1, 1]) {
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      const m = 1 + k[i] * amount;
      this.px[i * 3] *= 1 + (m - 1) * g[0]; this.px[i * 3 + 1] *= 1 + (m - 1) * g[1]; this.px[i * 3 + 2] *= 1 + (m - 1) * g[2];
    }
    return this;
  }

  /** mix toward colour c by the field m (0..1) times amount */
  tint(m, c, amount = 1) {
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      const a = clamp(m[i] * amount), q = 1 - a;
      this.px[i * 3] = this.px[i * 3] * q + c[0] * a; this.px[i * 3 + 1] = this.px[i * 3 + 1] * q + c[1] * a; this.px[i * 3 + 2] = this.px[i * 3 + 2] * q + c[2] * a;
    }
    return this;
  }

  /**
   * A tapered stroke through the points of a polyline [[x, y], ...]: width w0 at the first point to w1 at the last, colour c0 to c1 along it, alpha a (soft 1.2 px edge). Wraps.
   * `sx`, `sy` stretch the distance (an ellipse of a stroke): by default 1.
   */
  stroke(pts, w0, w1, c0, c1, a = 1) {
    const S = pts.length - 1;
    if (S < 1) return this;
    // cumulative length for t along the stroke
    const cum = [0];
    for (let i = 1; i <= S; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[S] || 1;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const reach = Math.max(w0, w1) / 2 + 0.6, reach2 = reach * reach, pad = reach + 1;
    const ix0 = Math.floor(x0 - pad), ix1 = Math.ceil(x1 + pad), iy0 = Math.floor(y0 - pad), iy1 = Math.ceil(y1 + pad);
    const W = ix1 - ix0 + 1, H = iy1 - iy0 + 1;
    if (W * H > scratchCov.length) { scratchCov = new Float32Array(W * H); scratchT = new Float32Array(W * H); }
    const cov = scratchCov, tt = scratchT;
    cov.fill(0, 0, W * H);
    // each segment covers its own box only; a pixel keeps the best coverage among the segments (and where along the stroke that was)
    for (let s = 0; s < S; s++) {
      const ax = pts[s][0], ay = pts[s][1], bx = pts[s + 1][0], by = pts[s + 1][1];
      const vx = bx - ax, vy = by - ay, il = 1 / (vx * vx + vy * vy || 1);
      const sx0 = Math.max(ix0, Math.floor(Math.min(ax, bx) - reach)), sx1 = Math.min(ix1, Math.ceil(Math.max(ax, bx) + reach));
      const sy0 = Math.max(iy0, Math.floor(Math.min(ay, by) - reach)), sy1 = Math.min(iy1, Math.ceil(Math.max(ay, by) + reach));
      const seg0 = cum[s], segLen = cum[s + 1] - cum[s];
      for (let y = sy0; y <= sy1; y++) {
        const py = y + 0.5, row = (y - iy0) * W - ix0;
        for (let x = sx0; x <= sx1; x++) {
          const px = x + 0.5;
          let q = ((px - ax) * vx + (py - ay) * vy) * il;
          q = q < 0 ? 0 : q > 1 ? 1 : q;
          const ex = px - (ax + vx * q), ey = py - (ay + vy * q), d2 = ex * ex + ey * ey;
          if (d2 > reach2) continue;
          const t = (seg0 + segLen * q) / total, half = (w0 + (w1 - w0) * t) / 2;
          const c = (half + 0.6 - Math.sqrt(d2)) / 1.2;
          if (c <= 0) continue;
          const k = row + x;
          if (c > cov[k]) { cov[k] = c > 1 ? 1 : c; tt[k] = t; }
        }
      }
    }
    const col = [0, 0, 0];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = y * W + x, c = cov[k];
        if (c <= 0) continue;
        const t = tt[k];
        col[0] = c0[0] + (c1[0] - c0[0]) * t; col[1] = c0[1] + (c1[1] - c0[1]) * t; col[2] = c0[2] + (c1[2] - c0[2]) * t;
        this.blend(ix0 + x, iy0 + y, col, c * a);
      }
    }
    return this;
  }

  /** a soft disc: colour c at alpha a in the middle, fading to nothing at the radius r (squashed by ry/rx when ry is given) */
  soft(cx, cy, r, c, a, ry = r) {
    const ix0 = Math.floor(cx - r - 1), ix1 = Math.ceil(cx + r + 1), iy0 = Math.floor(cy - ry - 1), iy1 = Math.ceil(cy + ry + 1);
    for (let y = iy0; y <= iy1; y++) {
      for (let x = ix0; x <= ix1; x++) {
        const d = Math.hypot((x + 0.5 - cx) / r, (y + 0.5 - cy) / ry);
        if (d < 1) { const k = 1 - d; this.blend(x, y, c, a * k * k * (3 - 2 * k)); }
      }
    }
    return this;
  }

  /**
   * Light a height field (w x h, any scale) from the upper left, like the pixel textures: the surface facing the light is brightened and the one facing away darkened.
   * Returns the shade field (-1..1, 0 flat); `strength` scales how much of it is multiplied into the colours when `apply` is true.
   */
  shade(height, strength = 0.5, apply = true) {
    const w = this.w, h = this.h, s = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const yu = wrapN(y - 1, h) * w, yd = wrapN(y + 1, h) * w, row = y * w;
      for (let x = 0; x < w; x++) {
        const gx = height[row + wrapN(x + 1, w)] - height[row + wrapN(x - 1, w)];
        const gy = height[yd + x] - height[yu + x];
        s[row + x] = clamp(-(gx * 0.7071 + gy * 0.7071) * 0.5 * this.k, -1, 1);     // light from the upper left: a slope that rises to the left or up is lit (by the slope per pixel of the size the painter was written for)
      }
    }
    if (apply) this.modulate(s, strength);
    return s;
  }

  /**
   * scale the canvas so that its mean colour is `target` ([r, g, b]) by `amount` (0..1): the colours of the pixel twin are kept, the detail is the painter's.
   * What cannot be shown (a channel over 255) is taken into account: the gain is found for the mean of what is clamped, so a bright texture comes out as bright as it can.
   */
  matchMean(target, amount = 1) {
    const n = this.w * this.h, m0 = this.mean(), want = [0, 1, 2].map((c) => mix(m0[c], target[c], amount));
    for (let iter = 0; iter < 5; iter++) {
      const m = [0, 0, 0];
      for (let i = 0; i < n; i++) { m[0] += Math.min(255, this.px[i * 3]); m[1] += Math.min(255, this.px[i * 3 + 1]); m[2] += Math.min(255, this.px[i * 3 + 2]); }
      const g = [0, 1, 2].map((c) => (want[c] * n) / Math.max(1, m[c]));
      if (g.every((v) => Math.abs(v - 1) < 0.003)) break;
      for (let i = 0; i < n; i++) { this.px[i * 3] *= g[0]; this.px[i * 3 + 1] *= g[1]; this.px[i * 3 + 2] *= g[2]; }
    }
    return this;
  }

  /** the mean colour (of what is painted, on a canvas with a plane of coverage) */
  mean() {
    const n = this.w * this.h, m = [0, 0, 0];
    let tot = 0;
    for (let i = 0; i < n; i++) { const wt = this.a ? this.a[i] : 1; m[0] += this.px[i * 3] * wt; m[1] += this.px[i * 3 + 1] * wt; m[2] += this.px[i * 3 + 2] * wt; tot += wt; }
    return m.map((v) => v / Math.max(1e-6, tot));
  }

  /**
   * The canvas as a Pix: opaque, or RGBA when it has a plane of coverage. `w` x `h` (dividing the canvas) averages blocks of pixels: a texture that is painted larger is squeezed here
   * (a texture that is not square can be painted square, stretched, and squeezed). Where nothing is painted the colour is taken from the nearest paint, so a filter that blends texels does not fringe an edge.
   */
  toPix(w = this.w, h = this.h) {
    const W = this.w, H = this.h, p = new Pix(w, h), bx = Math.max(1, Math.round(W / w)), by = Math.max(1, Math.round(H / h)), inv = 1 / (bx * by), A = this.a;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, at = 0;
        for (let j = 0; j < by; j++) {
          for (let i = 0; i < bx; i++) {
            const q = (y * by + j) * W + x * bx + i, k = q * 3, wt = A ? A[q] : 1;
            r += this.px[k] * wt; g += this.px[k + 1] * wt; b += this.px[k + 2] * wt; at += wt;
          }
        }
        const o = (y * w + x) * 4, d = at > 1e-6 ? 1 / at : 0;
        p.data[o] = clamp(r * d, 0, 255); p.data[o + 1] = clamp(g * d, 0, 255); p.data[o + 2] = clamp(b * d, 0, 255);
        p.data[o + 3] = A ? Math.round(clamp(at * inv) * 255) : 255;
      }
    }
    if (A) bleed(p);
    return p;
  }
}

/** give the pixels with no coverage the colour of the nearest ones with some (a few passes outward), so that a bilinear filter never blends in the grey they were painted on */
function bleed(p, passes = 6) {
  const { w, h, data } = p;
  let has = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) has[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  for (let pass = 0; pass < passes; pass++) {
    const next = has.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (has[i]) continue;
        let r = 0, g = 0, b = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const j = yy * w + xx;
            if (has[j]) { r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; c++; }
          }
        }
        if (c) { data[i * 4] = r / c; data[i * 4 + 1] = g / c; data[i * 4 + 2] = b / c; next[i] = 1; }
      }
    }
    has = next;
  }
}

/** fine grain: a field of small, centred, periodic noise (for modulate()): amplitude amp, `cells` across (w wide, h high: square by default, with square cells) */
export function grain(w, seed, cells = w / 2, amp = 0.05, h = w) {
  const cx = Math.max(2, Math.round(cells)), cy = Math.max(2, Math.round((cells * h) / w));
  const f = fbmWH(w, h, seed, cx, 2, 0.6, cy);
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - 0.5) * 2 * amp;
  return f;
}
