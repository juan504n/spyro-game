// Runtime texture variants derived from the artist's textures (so the variants stay in family with the originals).
// Textures are cached per Assets instance and are shared by every model that asks for the same variant, so models
// must NOT dispose them.
import { Pix } from '../../../engine/textures/pix.js';
import { texFromPix, makeMaterial } from '../../../engine/materials.js';

const caches = new WeakMap();

/** Get (or build) a derived texture. `paint(pix)` mutates a private copy of the source texture. */
export function derivedTexture(assets, name, key, paint, size = null, tile = null) {
  let m = caches.get(assets);
  if (!m) { m = new Map(); caches.set(assets, m); }
  const k = name + '|' + key;
  let t = m.get(k);
  if (!t) {
    const src = assets.pix(name);
    let p;
    if (size) p = new Pix(size[0], size[1]);            // blank canvas of a custom size; paint() fills it from `src`
    else { p = new Pix(src.w, src.h); p.data.set(src.data); }   // private copy of the source, recoloured in place
    paint(p, src);
    t = texFromPix(p, { tile: tile ?? (assets.tile ? assets.tile(name) : true) });
    m.set(k, t);
  }
  return t;
}

/** Build a unique PS1 material around an already-built THREE texture. */
export function materialFor(map, o = {}) {
  return makeMaterial({ map, ...o });
}

export function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx === 0 ? 0 : d / mx, mx];
}

export function hsv2rgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * Recolour every pixel whose colour passes `pick(h, s, v)` to the given hue (keeping its brightness ramp, scaling
 * saturation by `sat`, brightness by `val`).
 */
export function recolor(p, pick, { hue, sat = 1, val = 1 }) {
  const d = p.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
    if (!pick(h, s, v)) continue;
    const [r, g, b] = hsv2rgb(hue, Math.min(1, s * sat), Math.min(1, v * val));
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  return p;
}
