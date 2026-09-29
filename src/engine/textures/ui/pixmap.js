// Small helpers shared by sprites.js / ui.js / font.js: ASCII pixel maps, colour maths, trimming.
// DOM-free, deterministic.
import { Pix, rgb } from '../pix.js';

/**
 * Paint an ASCII map into a new Pix. '.' and ' ' are transparent; every other char must exist in `pal`
 * ({ char: colour | null }, null = transparent). All rows must have the same length (throws otherwise, so
 * typos surface immediately in Node instead of producing a skewed picture).
 */
export function fromMap(rows, pal, name = 'map') {
  const h = rows.length;
  let w = 0;
  for (const r of rows) w = Math.max(w, r.length);
  const rp = {};
  for (const k of Object.keys(pal)) rp[k] = pal[k] === null ? null : rgb(pal[k]);
  const p = new Pix(w, h);
  for (let y = 0; y < h; y++) {
    const r = rows[y];
    if (r.length !== w) throw new Error(`${name}: row ${y} has ${r.length} cols, expected ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = r[x];
      if (ch === '.' || ch === ' ') continue;
      const c = rp[ch];
      if (c === undefined) throw new Error(`${name}: no palette colour for '${ch}' at ${x},${y}`);
      if (c === null) continue;
      p.set(x, y, c);
    }
  }
  return p;
}

/** Bounding box {x,y,w,h} of the opaque pixels, or null when empty. */
export function contentBounds(p) {
  let x0 = p.w, y0 = p.h, x1 = -1, y1 = -1;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.data[(y * p.w + x) * 4 + 3] >= 128) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Crop to the opaque content (plus `pad` transparent pixels on every side). */
export function trim(p, pad = 0) {
  const b = contentBounds(p);
  if (!b) return new Pix(Math.max(1, pad * 2), Math.max(1, pad * 2));
  const o = new Pix(b.w + pad * 2, b.h + pad * 2);
  for (let j = 0; j < b.h; j++) {
    for (let i = 0; i < b.w; i++) o.set(i + pad, j + pad, p.get(b.x + i, b.y + j));
  }
  return o;
}

/* ---------------- colour maths (all return [r,g,b,255]) ---------------- */

/** Linear mix of two colours (anything pix.js `rgb()` accepts). */
export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return [
    Math.round(A[0] + (B[0] - A[0]) * t),
    Math.round(A[1] + (B[1] - A[1]) * t),
    Math.round(A[2] + (B[2] - A[2]) * t),
    255,
  ];
}

export const lighten = (c, t) => mix(c, [255, 255, 255], t);
export const darken = (c, t) => mix(c, [0, 0, 0], t);
