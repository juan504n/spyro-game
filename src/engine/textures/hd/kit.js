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
 * A periodic fractal noise field over an n x n grid, 0..1 (stretched to the full range): cx x cy lattice cells across for the first octave (cy defaults to cx), each octave twice as fine.
 * The lattice is cx x cy (not square), so the field wraps on both axes however stretched it is: a texture made of it tiles without a seam.
 */
export function fbm(n, seed, cx, oct = 4, gain = 0.5, cy = cx) {
  const out = new Float32Array(n * n);
  const xa = new Int32Array(n), xb = new Int32Array(n), xs = new Float32Array(n), ya = new Int32Array(n), yb = new Int32Array(n), ys = new Float32Array(n);
  let amp = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    const fx = cx * (1 << o), fy = cy * (1 << o);
    const r = new RNG(seed + o * 977), lat = new Float32Array(fx * fy);
    for (let i = 0; i < lat.length; i++) lat[i] = r.next();
    // where each column and each row falls in the lattice (the same for every pixel of it): the cell, the next cell (wrapping) and the smoothed fraction
    for (let x = 0; x < n; x++) { const t = (x * fx) / n, i = Math.floor(t), f = t - i; xa[x] = i % fx; xb[x] = (i + 1) % fx; xs[x] = f * f * f * (f * (f * 6 - 15) + 10); }
    for (let y = 0; y < n; y++) { const t = (y * fy) / n, i = Math.floor(t), f = t - i; ya[y] = (i % fy) * fx; yb[y] = ((i + 1) % fy) * fx; ys[y] = f * f * f * (f * (f * 6 - 15) + 10); }
    for (let y = 0; y < n; y++) {
      const r0 = ya[y], r1 = yb[y], sy = ys[y], row = y * n;
      for (let x = 0; x < n; x++) {
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
  for (let y = 0; y < n; y++) {
    const cj = Math.floor(y / ch);
    for (let x = 0; x < n; x++) {
      const ci = Math.floor(x / cw);
      let b1 = 1e9, b2 = 1e9, bi = 0, bx = 0, by = 0;
      for (let dj = -2; dj <= 2; dj++) {
        const jj = wrapN(cj + dj, rows), oy = Math.floor((cj + dj) / rows) * n;
        for (let di = -2; di <= 2; di++) {
          const ii = wrapN(ci + di, cols), ox = Math.floor((ci + di) / cols) * n;
          const k = jj * cols + ii;
          const ex = x + 0.5 - (px[k] + ox), ey = y + 0.5 - (py[k] + oy);
          const d = ex * ex + ey * ey;
          if (d < b1) { b2 = b1; b1 = d; bi = k; bx = ex; by = ey; } else if (d < b2) b2 = d;
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

export class Canvas {
  constructor(n, fill = [128, 128, 128]) {
    this.n = n;
    this.px = new Float32Array(n * n * 3);
    for (let i = 0; i < n * n; i++) { this.px[i * 3] = fill[0]; this.px[i * 3 + 1] = fill[1]; this.px[i * 3 + 2] = fill[2]; }
  }

  /** set every pixel from f(x, y, out): out is an [r, g, b] to fill */
  fillWith(f) {
    const n = this.n, out = [0, 0, 0];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        f(x, y, out);
        const i = (y * n + x) * 3;
        this.px[i] = out[0]; this.px[i + 1] = out[1]; this.px[i + 2] = out[2];
      }
    }
    return this;
  }

  /** alpha-blend a colour into a pixel (x, y wrap) */
  blend(x, y, c, a) {
    const n = this.n;
    if (x < 0 || x >= n) x = wrapN(x, n);
    if (y < 0 || y >= n) y = wrapN(y, n);
    const i = (y * n + x) * 3, q = 1 - a;
    this.px[i] = this.px[i] * q + c[0] * a; this.px[i + 1] = this.px[i + 1] * q + c[1] * a; this.px[i + 2] = this.px[i + 2] * q + c[2] * a;
  }

  /** multiply every pixel by 1 + k[i] (k = a field, e.g. shade() or a noise field centred on 0), per channel gain g = [1, 1, 1] by default */
  modulate(k, amount = 1, g = [1, 1, 1]) {
    const n = this.n * this.n;
    for (let i = 0; i < n; i++) {
      const m = 1 + k[i] * amount;
      this.px[i * 3] *= 1 + (m - 1) * g[0]; this.px[i * 3 + 1] *= 1 + (m - 1) * g[1]; this.px[i * 3 + 2] *= 1 + (m - 1) * g[2];
    }
    return this;
  }

  /** mix toward colour c by the field m (0..1) times amount */
  tint(m, c, amount = 1) {
    const n = this.n * this.n;
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
    const n = this.n, S = pts.length - 1;
    if (S < 1) return this;
    // cumulative length for t along the stroke
    const cum = [0];
    for (let i = 1; i <= S; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[S] || 1;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const pad = Math.max(w0, w1) / 2 + 1.5;
    const ix0 = Math.floor(x0 - pad), ix1 = Math.ceil(x1 + pad), iy0 = Math.floor(y0 - pad), iy1 = Math.ceil(y1 + pad);
    const col = [0, 0, 0];
    for (let y = iy0; y <= iy1; y++) {
      const py = y + 0.5;
      for (let x = ix0; x <= ix1; x++) {
        const px = x + 0.5;
        let best = 1e9, bt = 0;
        for (let s = 0; s < S; s++) {
          const ax = pts[s][0], ay = pts[s][1], bx = pts[s + 1][0], by = pts[s + 1][1];
          const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
          const q = clamp(((px - ax) * vx + (py - ay) * vy) / L2);
          const ex = px - (ax + vx * q), ey = py - (ay + vy * q), d = ex * ex + ey * ey;
          if (d < best) { best = d; bt = (cum[s] + (cum[s + 1] - cum[s]) * q) / total; }
        }
        const d = Math.sqrt(best), half = mix(w0, w1, bt) / 2;
        const cov = clamp((half + 0.6 - d) / 1.2);
        if (cov <= 0) continue;
        col[0] = mix(c0[0], c1[0], bt); col[1] = mix(c0[1], c1[1], bt); col[2] = mix(c0[2], c1[2], bt);
        this.blend(x, y, col, cov * a);
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
   * Light a height field (n x n, any scale) from the upper left, like the pixel textures: the surface facing the light is brightened and the one facing away darkened.
   * Returns the shade field (-1..1, 0 flat); `strength` scales how much of it is multiplied into the colours when `apply` is true.
   */
  shade(height, strength = 0.5, apply = true) {
    const n = this.n, s = new Float32Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const gx = height[y * n + wrapN(x + 1, n)] - height[y * n + wrapN(x - 1, n)];
        const gy = height[wrapN(y + 1, n) * n + x] - height[wrapN(y - 1, n) * n + x];
        s[y * n + x] = clamp(-(gx * 0.7071 + gy * 0.7071) * 0.5, -1, 1);     // light from the upper left: a slope that rises to the left or up is lit
      }
    }
    if (apply) this.modulate(s, strength);
    return s;
  }

  /** scale the canvas so that its mean colour is `target` ([r, g, b]) by `amount` (0..1): the colours of the pixel twin are kept, the detail is the painter's */
  matchMean(target, amount = 1) {
    const m = this.mean(), n = this.n * this.n;
    const g = [0, 1, 2].map((c) => mix(1, target[c] / Math.max(1, m[c]), amount));
    for (let i = 0; i < n; i++) { this.px[i * 3] *= g[0]; this.px[i * 3 + 1] *= g[1]; this.px[i * 3 + 2] *= g[2]; }
    return this;
  }

  /** the mean colour */
  mean() {
    const n = this.n * this.n, m = [0, 0, 0];
    for (let i = 0; i < n; i++) { m[0] += this.px[i * 3]; m[1] += this.px[i * 3 + 1]; m[2] += this.px[i * 3 + 2]; }
    return m.map((v) => v / n);
  }

  /** the canvas as an opaque Pix; `w` x `h` (dividing n) averages blocks of pixels: a texture that is not square is painted square, stretched, and squeezed here */
  toPix(w = this.n, h = this.n) {
    const n = this.n, p = new Pix(w, h), bx = Math.max(1, Math.round(n / w)), by = Math.max(1, Math.round(n / h)), inv = 1 / (bx * by);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0;
        for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) { const k = ((y * by + j) * n + x * bx + i) * 3; r += this.px[k]; g += this.px[k + 1]; b += this.px[k + 2]; }
        const o = (y * w + x) * 4;
        p.data[o] = clamp(r * inv, 0, 255); p.data[o + 1] = clamp(g * inv, 0, 255); p.data[o + 2] = clamp(b * inv, 0, 255); p.data[o + 3] = 255;
      }
    }
    return p;
  }
}

/** fine grain: a field of small, centred, periodic noise (for modulate()): amplitude amp, cells across */
export function grain(n, seed, cells = n / 2, amp = 0.05) {
  const f = fbm(n, seed, Math.max(2, Math.round(cells)), 2, 0.6);
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - 0.5) * 2 * amp;
  return f;
}
