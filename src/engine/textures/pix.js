// Pixel-art toolkit. DOM-free: runs in Node (for dumping PNG contact sheets) and in the browser.
// Every texture in the game is painted with these primitives so nothing is anti-aliased.

/** Parse a colour: '#rgb' | '#rrggbb' | '#rrggbbaa' | 0xRRGGBB | [r,g,b,(a)] -> [r,g,b,a] (0-255). */
export function rgb(v) {
  if (Array.isArray(v)) return [v[0], v[1], v[2], v.length > 3 ? v[3] : 255];
  if (typeof v === 'number') return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 255];
  let s = v.replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  const a = s.length >= 8 ? parseInt(s.slice(6, 8), 16) : 255;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

export const TRANSPARENT = [0, 0, 0, 0];

/** Deterministic PRNG (mulberry32). */
export class RNG {
  constructor(seed = 1) { this.s = seed >>> 0; }
  next() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  float(a = 0, b = 1) { return a + (b - a) * this.next(); }
  /** integer in [a, b) */
  int(a, b) { return a + Math.floor(this.next() * (b - a)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  gauss() { return (this.next() + this.next() + this.next() + this.next() - 2) / 2; }
}

/** 4x4 ordered-dither matrix (0..15) — the same lattice the PS1 GPU dither uses. */
export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
export const bayer = (x, y) => BAYER4[y & 3][x & 3];

/** Tileable 2D value noise in 0..1. `period` = lattice cells before wrapping (0 = no wrap). */
export function valueNoise(seed, period = 0) {
  const lat = new Float32Array(256 * 256);
  const r = new RNG(seed);
  for (let i = 0; i < lat.length; i++) lat[i] = r.next();
  const wrap = (v) => (period > 0 ? ((v % period) + period) % period : v & 255) & 255;
  const at = (x, y) => lat[(wrap(y) << 8) | wrap(x)];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = sm(x - xi), yf = sm(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

/** Fractal sum of a noise fn. If the base noise wraps with `period`, pass the same period so octaves tile. */
export function fbm(noise, x, y, octaves = 3, lacunarity = 2, gain = 0.5) {
  let amp = 1, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * f, y * f);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

/** Pick from an ordered colour list by t (0..1) using ordered dithering between neighbours. */
export function ditherPick(colors, t, x, y) {
  const n = colors.length - 1;
  const f = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(Math.floor(f), n - 1 < 0 ? 0 : n - 1);
  const frac = f - i;
  if (n === 0) return colors[0];
  return frac * 16 > bayer(x, y) + 0.5 ? colors[i + 1] : colors[i];
}

export class Pix {
  constructor(w, h, fill = null) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    if (fill !== null) this.fill(fill);
  }

  clone() {
    const p = new Pix(this.w, this.h);
    p.data.set(this.data);
    return p;
  }

  _idx(x, y, wrap) {
    if (wrap) {
      x = ((x % this.w) + this.w) % this.w;
      y = ((y % this.h) + this.h) % this.h;
    } else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return (y * this.w + x) * 4;
  }

  set(x, y, c, wrap = false) {
    x = Math.floor(x); y = Math.floor(y);
    const i = this._idx(x, y, wrap);
    if (i < 0) return this;
    const [r, g, b, a] = c.length === 4 && typeof c[0] === 'number' ? c : rgb(c);
    this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = a;
    return this;
  }

  get(x, y, wrap = false) {
    const i = this._idx(Math.floor(x), Math.floor(y), wrap);
    if (i < 0) return [0, 0, 0, 0];
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  fill(c) {
    const [r, g, b, a] = rgb(c);
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = a;
    }
    return this;
  }

  rect(x, y, w, h, c, wrap = false) {
    const col = rgb(c);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col, wrap);
    return this;
  }

  hline(x, y, len, c, wrap = false) { return this.rect(x, y, len, 1, c, wrap); }
  vline(x, y, len, c, wrap = false) { return this.rect(x, y, 1, len, c, wrap); }

  /** Bresenham line (aliased, 1px). */
  line(x0, y0, x1, y1, c, wrap = false) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const col = rgb(c);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, col, wrap);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  /** Ellipse by pixel-centre distance test; (cx,cy) is the centre in pixel coordinates (may be x.5). */
  ellipse(cx, cy, rx, ry, c, filled = true, wrap = false) {
    const col = rgb(c);
    const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy;
        if (filled ? d <= 1 : d <= 1 && d > ((rx - 1) / rx) ** 2) this.set(x, y, col, wrap);
      }
    }
    return this;
  }

  circle(cx, cy, r, c, filled = true, wrap = false) { return this.ellipse(cx, cy, r, r, c, filled, wrap); }

  /** Filled polygon (even-odd scanline); points = [[x,y],...] in pixel coordinates. */
  poly(points, c, wrap = false) {
    const col = rgb(c);
    let minY = Infinity, maxY = -Infinity;
    for (const p of points) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5;
      const xs = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) {
          xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, col, wrap);
      }
    }
    return this;
  }

  /** Copy opaque (a>=128) pixels of `src` onto this at (dx,dy). */
  blit(src, dx, dy, wrap = false) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + x) * 4;
        if (src.data[i + 3] >= 128) this.set(dx + x, dy + y, [src.data[i], src.data[i + 1], src.data[i + 2], 255], wrap);
      }
    }
    return this;
  }

  /** Paint a 1px outline (colour c) on transparent pixels touching opaque ones. */
  outline(c, diagonals = false) {
    const col = rgb(c);
    const src = this.clone();
    for (let y = -1; y <= this.h; y++) {
      for (let x = -1; x <= this.w; x++) {
        if (src.get(x, y)[3] >= 128) continue;
        let hit = src.get(x - 1, y)[3] >= 128 || src.get(x + 1, y)[3] >= 128 || src.get(x, y - 1)[3] >= 128 || src.get(x, y + 1)[3] >= 128;
        if (!hit && diagonals) {
          hit = src.get(x - 1, y - 1)[3] >= 128 || src.get(x + 1, y - 1)[3] >= 128 || src.get(x - 1, y + 1)[3] >= 128 || src.get(x + 1, y + 1)[3] >= 128;
        }
        if (hit) this.set(x, y, col);
      }
    }
    return this;
  }

  /** Call fn(x, y, [r,g,b,a]) for every pixel; if it returns a colour, write it. */
  each(fn) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const r = fn(x, y, this.get(x, y));
        if (r) this.set(x, y, r);
      }
    }
    return this;
  }

  /** Snap every opaque pixel to the nearest palette colour (RGB distance). Alpha is forced to 0/255. */
  quantize(palette) {
    const pal = palette.map(rgb);
    for (let i = 0; i < this.data.length; i += 4) {
      if (this.data[i + 3] < 128) { this.data[i + 3] = 0; continue; }
      let best = 0, bd = Infinity;
      for (let k = 0; k < pal.length; k++) {
        const dr = this.data[i] - pal[k][0], dg = this.data[i + 1] - pal[k][1], db = this.data[i + 2] - pal[k][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = k; }
      }
      this.data[i] = pal[best][0]; this.data[i + 1] = pal[best][1]; this.data[i + 2] = pal[best][2]; this.data[i + 3] = 255;
    }
    return this;
  }

  /** Number of distinct opaque colours (CLUT size). */
  colorCount() {
    const s = new Set();
    for (let i = 0; i < this.data.length; i += 4) {
      if (this.data[i + 3] >= 128) s.add((this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2]);
    }
    return s.size;
  }

  /** Force alpha to exactly 0 or 255 (PS1 textures only have 1-bit transparency). */
  binarizeAlpha(threshold = 128) {
    for (let i = 3; i < this.data.length; i += 4) this.data[i] = this.data[i] >= threshold ? 255 : 0;
    return this;
  }

  /** True if the image tiles seamlessly in the sense that edge pixels are a plausible continuation (cheap check). */
  edgeMismatch() {
    let diff = 0, n = 0;
    for (let y = 0; y < this.h; y++) {
      const a = this.get(0, y), b = this.get(this.w - 1, y);
      diff += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]); n++;
    }
    for (let x = 0; x < this.w; x++) {
      const a = this.get(x, 0), b = this.get(x, this.h - 1);
      diff += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]); n++;
    }
    return diff / n / 3;
  }
}
