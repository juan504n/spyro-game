// Shared painting helpers for the world textures. DOM-free, deterministic.
// Everything here is built on the read-only Pix toolkit (../pix.js).
import { Pix, RNG, rgb, BAYER4 } from '../pix.js';

export { Pix, RNG, rgb, BAYER4 };

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const wrapN = (v, n) => ((v % n) + n) % n;

// ---------------------------------------------------------------------------------------------
// Canvas: a Pix whose drawing calls can wrap around the edges (so tile textures are seamless
// by construction) and which has a few extra painter's helpers.
// ---------------------------------------------------------------------------------------------
export class Canvas extends Pix {
  constructor(w, h, wrap = false, fill = null) {
    super(w, h, fill);
    this.wrapAll = wrap;
  }

  _idx(x, y, wrap) {
    return super._idx(x, y, wrap || this.wrapAll);
  }

  /** Plain Pix copy — this is what the game receives. */
  finish() {
    const p = new Pix(this.w, this.h);
    p.data.set(this.data);
    return p;
  }

  dot(x, y, c) { return this.set(x, y, c); }
  hl(x, y, len, c) { return this.rect(x, y, len, 1, c); }
  vl(x, y, len, c) { return this.rect(x, y, 1, len, c); }

  /** Paint rows of chars; key maps char -> colour. Chars not in key are skipped. */
  stamp(x, y, rows, key) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const col = key[row[i]];
        if (col) this.set(x + i, y + j, col);
      }
    }
    return this;
  }

  /** Shaded blob: dark crescent bottom-right, light highlight top-left. */
  blob(cx, cy, rx, ry, dark, mid, light = null) {
    this.ellipse(cx, cy, rx, ry, dark);
    this.ellipse(cx - 0.5, cy - 0.5, rx - 0.6, ry - 0.6, mid);
    if (light) this.ellipse(cx - rx * 0.32, cy - ry * 0.32, Math.max(0.8, rx * 0.5), Math.max(0.8, ry * 0.5), light);
    return this;
  }

  /** Two-colour ordered dither of a rectangle; t = fraction of colour b. cell = dither cell size in px. */
  dither(x, y, w, h, a, b, t, cell = 1) {
    const s = cell === 2 ? 1 : cell === 4 ? 2 : 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const q = BAYER4[((y + j) >> s) & 3][((x + i) >> s) & 3];
        this.set(x + i, y + j, t * 16 > q + 0.5 ? b : a);
      }
    }
    return this;
  }

  /** Is (x,y) opaque? (out of range / transparent = false; wraps if wrapAll) */
  solid(x, y) { return this.get(x, y)[3] >= 128; }
}

// ---------------------------------------------------------------------------------------------
// Dithering
// ---------------------------------------------------------------------------------------------

/** Ordered-dither pick across a ramp. `s` = dither cell size exponent (0 = 1px, 1 = 2px cells). */
export function dpick(cols, t, x, y, s = 0) {
  const n = cols.length - 1;
  if (n <= 0) return cols[0];
  const f = clamp(t, 0, 1) * n;
  let i = Math.floor(f);
  if (i >= n) i = n - 1;
  const frac = f - i;
  return frac * 16 > BAYER4[(y >> s) & 3][(x >> s) & 3] + 0.5 ? cols[i + 1] : cols[i];
}

/**
 * Posterise t (0..1) across `cols` in equal bands and dither ONLY in a narrow zone around each
 * band boundary (w = half-width of the zone in band units). Interiors stay flat -> hand-painted look.
 */
export function bandPick(cols, t, x, y, w = 0.18, s = 0) {
  const n = cols.length;
  const f = clamp(t, 0, 0.9999) * n;
  const b = Math.round(f);
  const d = f - b;
  if (b > 0 && b < n && Math.abs(d) < w) {
    const up = 0.5 + d / (2 * w);
    return up * 16 > BAYER4[(y >> s) & 3][(x >> s) & 3] + 0.5 ? cols[b] : cols[b - 1];
  }
  return cols[Math.min(Math.floor(f), n - 1)];
}

// ---------------------------------------------------------------------------------------------
// Tileable noise / fields
// ---------------------------------------------------------------------------------------------

/** Value noise that wraps every `px` lattice cells in x and `py` in y. Returns f(x, y) in 0..1. */
export function noiseFn(seed, px, py = px) {
  const r = new RNG(seed);
  const lat = new Float32Array(px * py);
  for (let i = 0; i < lat.length; i++) lat[i] = r.next();
  const at = (x, y) => lat[wrapN(y, py) * px + wrapN(x, px)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/**
 * Tileable fractal noise field over a w*h grid, `cx` x `cy` lattice cells for the base octave.
 * With eq=true the values are rank-normalised (uniform 0..1) so thresholds == area fractions.
 */
export function field(w, h, seed, cx, cy = cx, oct = 1, eq = true) {
  const out = new Float32Array(w * h);
  let amp = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    const fx = cx * (1 << o), fy = cy * (1 << o);
    const nz = noiseFn(seed + o * 977, fx, fy);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) out[y * w + x] += amp * nz((x / w) * fx, (y / h) * fy);
    }
    norm += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  if (eq) {
    const idx = Array.from({ length: out.length }, (_, i) => i).sort((a, b) => out[a] - out[b]);
    const tmp = new Float32Array(out.length);
    for (let r = 0; r < idx.length; r++) tmp[idx[r]] = r / (idx.length - 1);
    out.set(tmp);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Point sets, cells, walks
// ---------------------------------------------------------------------------------------------

/** Wrap-aware dart throwing: n points at least minD apart on a w*h torus. */
export function poisson(rng, w, h, n, minD, tries = 40) {
  const pts = [];
  const m2 = minD * minD;
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < tries; t++) {
      const x = rng.int(0, w), y = rng.int(0, h);
      let ok = true;
      for (const p of pts) {
        let dx = Math.abs(x - p[0]), dy = Math.abs(y - p[1]);
        if (dx > w / 2) dx = w - dx;
        if (dy > h / 2) dy = h - dy;
        if (dx * dx + dy * dy < m2) { ok = false; break; }
      }
      if (ok) { pts.push([x, y]); break; }
    }
  }
  return pts;
}

/** Jittered (optionally row-staggered) lattice of points on a w*h torus. */
export function lattice(rng, w, h, cols, rows, jitter, stagger = 0) {
  const pts = [];
  const cw = w / cols, ch = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const x = (q + 0.5 + (r % 2) * stagger) * cw + rng.float(-jitter, jitter);
      const y = (r + 0.5) * ch + rng.float(-jitter, jitter);
      pts.push([wrapN(x, w), wrapN(y, h)]);
    }
  }
  return pts;
}

/**
 * Voronoi info on a torus. For each pixel: id of the nearest point, d1/d2 = distance to nearest /
 * second-nearest point, (vx, vy) = vector from the nearest point to the pixel centre.
 * (d2 - d1) is ~2x the distance to the cell border.
 */
export function cells(w, h, pts, ay = 1) {
  const n = w * h;
  const id = new Int16Array(n), d1 = new Float32Array(n), d2 = new Float32Array(n);
  const vx = new Float32Array(n), vy = new Float32Array(n);
  const hw = w / 2, hh = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5, py = y + 0.5;
      let b1 = 1e9, b2 = 1e9, bi = -1, bx = 0, by = 0;
      for (let i = 0; i < pts.length; i++) {
        let dx = px - pts[i][0], dy = py - pts[i][1];
        if (dx > hw) dx -= w; else if (dx < -hw) dx += w;
        if (dy > hh) dy -= h; else if (dy < -hh) dy += h;
        dy *= ay; // ay < 1 stretches the cells vertically
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < b1) { b2 = b1; b1 = d; bi = i; bx = dx; by = dy; } else if (d < b2) b2 = d;
      }
      const k = y * w + x;
      id[k] = bi; d1[k] = b1; d2[k] = b2; vx[k] = bx; vy[k] = by;
    }
  }
  return { id, d1, d2, vx, vy, w, h };
}

/** Returns f([r,g,b,a]) -> index of that colour in `ramp`, or -1. */
export function rampIndexer(ramp) {
  const m = new Map(ramp.map((h, i) => { const c = rgb(h); return [(c[0] << 16) | (c[1] << 8) | c[2], i]; }));
  return (p) => { const k = (p[0] << 16) | (p[1] << 8) | p[2]; return m.has(k) ? m.get(k) : -1; };
}

/** Light direction (towards the light): upper-left. */
export const LX = -0.7071, LY = -0.7071;

/** A wobbly random walk as a list of integer points. bias = [dx, dy] preferred direction. */
export function walk(rng, x, y, len, bias = [0, 1], wobble = 0.5) {
  const pts = [[Math.round(x), Math.round(y)]];
  let cx = x, cy = y;
  for (let i = 0; i < len; i++) {
    cx += bias[0] + rng.float(-wobble, wobble);
    cy += bias[1] + rng.float(-wobble, wobble);
    pts.push([Math.round(cx), Math.round(cy)]);
  }
  return pts;
}

/** Draw a polyline through pts (each segment with Bresenham). */
export function polyline(c, pts, col) {
  for (let i = 0; i + 1 < pts.length; i++) c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], col);
  return c;
}

/** Shuffle (Fisher-Yates) with the given rng; returns a new array. */
export function shuffled(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Roll a tile so that its wrap seam falls where neighbouring columns / rows are most alike. Tiles are
 * periodic, so this changes nothing visually - it just moves brick joints, plank gaps and slab edges away
 * from the image border, which also makes Pix.edgeMismatch() (column 0 vs column w-1, row 0 vs row h-1) small.
 * axes: 'xy' | 'x' | 'y'.
 */
export function seamRoll(p, axes = 'xy') {
  const { w, h, data } = p;
  const diff = (i, j) => {
    const a = data[i + 3], b = data[j + 3];
    return Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]) + Math.abs(a - b) * 3;
  };
  let dx = 0, dy = 0;
  if (axes.includes('x')) {
    let best = Infinity;
    for (let j = 0; j < w; j++) {
      const k = (j + w - 1) % w; // boundary between column k and column j
      let d = 0;
      for (let y = 0; y < h; y++) d += diff((y * w + k) * 4, (y * w + j) * 4);
      d += 0.01 * Math.min(j, w - j);
      if (d < best) { best = d; dx = j; }
    }
  }
  if (axes.includes('y')) {
    let best = Infinity;
    for (let j = 0; j < h; j++) {
      const k = (j + h - 1) % h;
      let d = 0;
      for (let x = 0; x < w; x++) d += diff((k * w + x) * 4, (j * w + x) * 4);
      d += 0.01 * Math.min(j, h - j);
      if (d < best) { best = d; dy = j; }
    }
  }
  if (dx === 0 && dy === 0) return p;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (((y + dy) % h) * w + ((x + dx) % w)) * 4, d = (y * w + x) * 4;
      out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3];
    }
  }
  data.set(out);
  return p;
}

/** Wrap a finished Canvas/Pix into the API record. opts.roll = 'xy' | 'x' | 'y' moves the tile seam (see seamRoll). */
export function rec(canvas, tile, cutout, opts = {}) {
  const pix = canvas instanceof Canvas ? canvas.finish() : canvas;
  if (tile && opts.roll) seamRoll(pix, opts.roll === true ? 'xy' : opts.roll);
  return { pix, tile, cutout };
}
