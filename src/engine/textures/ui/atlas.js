// Tiny shelf packer: put many small named Pix images into one power-of-two atlas (fewer texture binds).
// DOM-free, deterministic (items are placed tallest-first, ties by name).
import { Pix } from '../pix.js';

const pow2 = (n) => { let p = 1; while (p < n) p <<= 1; return p; };

/**
 * Pack { name: Pix } into one atlas.
 * opts: pad (transparent gutter around every image, default 1), maxW (atlas width limit, power of two, default 256)
 * Returns { pix, w, h, rects } where rects[name] = { x, y, w, h, u0, v0, u1, v1 } with u/v measured from the
 * TOP-LEFT of the image (row 0 = top); flip v yourself if your texture has flipY = true.
 */
export function packAtlas(items, opts = {}) {
  const pad = opts.pad !== undefined ? opts.pad : 1;
  const maxW = opts.maxW || 256;
  const names = Object.keys(items).sort((a, b) => (items[b].h - items[a].h) || (a < b ? -1 : 1));
  const rects = {};
  let x = 0, y = 0, shelfH = 0, usedW = 0;
  for (const n of names) {
    const im = items[n];
    const cw = im.w + pad * 2, ch = im.h + pad * 2;
    if (x + cw > maxW) { x = 0; y += shelfH; shelfH = 0; }
    rects[n] = { x: x + pad, y: y + pad, w: im.w, h: im.h };
    x += cw;
    shelfH = Math.max(shelfH, ch);
    usedW = Math.max(usedW, x);
  }
  const W = pow2(usedW), H = pow2(y + shelfH);
  const pix = new Pix(W, H);
  for (const n of names) {
    const r = rects[n], im = items[n];
    for (let j = 0; j < im.h; j++) {
      for (let i = 0; i < im.w; i++) pix.set(r.x + i, r.y + j, im.get(i, j));
    }
    r.u0 = r.x / W; r.v0 = r.y / H; r.u1 = (r.x + r.w) / W; r.v1 = (r.y + r.h) / H;
  }
  return { pix, w: W, h: H, rects };
}
