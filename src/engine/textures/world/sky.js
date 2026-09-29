// Sky sprites: cloud, moon, sun disc. Cut-outs with crisp binary edges.
import { RAMPS } from '../palette.js';
import { Canvas, dpick, bandPick, rec, clamp } from './kit.js';

const CLD = RAMPS.cloud; // ['#8a7cb0', '#b4a8d4', '#dcd4f0', '#fff4ff']

function paintCloud() {
  const W = 64, H = 32;
  const c = new Canvas(W, H, false);
  const FLAT = 26; // flat bottom row
  const [SH, LI, BODY, HI] = [CLD[0], CLD[1], CLD[2], CLD[3]];
  // cumulus lobes, painted big-to-small so the small ones sit in front; every lobe gets its own
  // shaded lower-right crescent and lit upper-left rim -> visible bumps, not one smooth hill
  const lobes = [[30, 13, 11], [45, 16, 8.5], [17, 17, 8], [55, 20, 6], [8, 21, 6], [37, 19, 8], [23, 21, 6.5]];
  for (const [x, y, r] of lobes) {
    c.ellipse(x, y, r, r, LI);
    c.ellipse(x - 0.9, y - 1.1, r - 1.1, r - 1.2, BODY);
    c.ellipse(x - 2.0, y - 2.4, Math.max(1.5, r * 0.55), Math.max(1.5, r * 0.5), HI);
  }
  // fill the base: a solid slab so the underside is flat and the cloud has weight
  c.rect(6, 20, 52, FLAT - 20 + 1, BODY);
  c.ellipse(7, 23, 3.6, 3.6, BODY); c.ellipse(57, 23.5, 3.4, 3.4, BODY);
  // clip to a flat bottom
  for (let y = FLAT + 1; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, [0, 0, 0, 0]);
  // underside shading: a dithered band that deepens to shadow-lilac at the base
  for (let y = 19; y <= FLAT; y++) {
    for (let x = 0; x < W; x++) {
      if (!c.solid(x, y)) continue;
      const t = (y - 19) / (FLAT - 19);
      const cur = c.get(x, y);
      if (t > 0.98) c.dot(x, y, SH);
      else if (t > 0.62) c.dot(x, y, LI);
      else if (t > 0.3 && cur[0] > 0xe0 - 1 && ((x + y) & 1) === 0) c.dot(x, y, BODY);
      else if (t > 0.3 && cur[0] === 0xdc) c.dot(x, y, ((x >> 1) + y) & 1 ? BODY : LI);
    }
  }
  // scalloped lower edge: a few lit pixels along the flat base
  for (let x = 8; x < 56; x += 3) c.dot(x, FLAT - 1, SH);
  return c;
}

function paintMoon() {
  const c = new Canvas(32, 32, false);
  const M = ['#a89cc0', '#c8c0dc', '#e4dff2', '#f6f2fc', '#ffffff'];
  const cx = 16, cy = 16, R = 14.6;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const r = Math.hypot(dx, dy);
      if (r > R) continue;
      // light from the upper left: limb shading towards the lower right
      const lit = (-dx - dy) / (R * 1.41);
      const t = clamp(0.62 + lit * 0.55 - Math.max(0, r / R - 0.8) * 0.6, 0, 1);
      c.dot(x, y, dpick([M[0], M[1], M[2], M[3]], t, x, y, 1));
    }
  }
  // craters: dark bowl with a lit lower-right lip
  for (const [x, y, rx, ry] of [[10, 10, 3.4, 3], [21, 13, 2.4, 2.2], [15, 21, 3.6, 3], [22, 22, 2, 1.8], [8, 19, 1.6, 1.5], [17, 8, 1.5, 1.4]]) {
    c.ellipse(x + 0.6, y + 0.7, rx, ry, M[3]);
    c.ellipse(x, y, rx, ry, M[0]);
    c.ellipse(x + 0.5, y + 0.6, rx - 0.9, ry - 0.8, M[1]);
    c.dot(Math.floor(x - rx * 0.4), Math.floor(y - ry * 0.4), '#8a7cb0');
  }
  return c;
}

function paintSunDisc() {
  const c = new Canvas(32, 32, false);
  const S = ['#f0901c', '#ffb02c', '#ffc03c', '#ffe27a', '#fff6c0', '#ffffff'];
  const cx = 16, cy = 16, R = 14.6;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (r > R) continue;
      const t = clamp(1 - r / R, 0, 1);
      c.dot(x, y, bandPick(S, clamp(Math.pow(t, 0.62) * 0.98 + 0.05, 0, 1), x, y, 0.3, 1));
    }
  }
  return c;
}

export function skyTextures() {
  return {
    cloud: rec(paintCloud(), false, true),
    moon: rec(paintMoon(), false, true),
    sun_disc: rec(paintSunDisc(), false, true),
  };
}
