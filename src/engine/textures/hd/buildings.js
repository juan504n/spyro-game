// HD painters for what is built: planks, roof shingles, thatch, metal plates, a half-timbered panel and stucco. (Masonry is in terrain.js.)
import { Canvas, RNG, clamp, mix, smoothstep, wrapN, ramp, col, fbm, grain, cnt } from './kit.js';
import { soil } from './ground.js';

const h01 = (i, s) => { let h = Math.imul(i + 1, 374761393) ^ Math.imul(s + 7, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function dots(cv, rng, count, c, a, rmin, rmax, squash = 1) {
  for (let i = 0; i < cnt(count, cv.n); i++) { const r = rmin + rng.next() * (rmax - rmin); cv.soft(rng.next() * cv.n, rng.next() * cv.n, r, c, a, r * squash * (0.7 + rng.next() * 0.5)); }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Planks: rows of boards that run along the tile, butt joints, grain, knots and nails.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function planks(n, { seed = 71, R, rows = 4, knots = 4, nails = true, gapColor = [28, 16, 10], mean = null, grainAmount = 1 } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R);
  const cv = new Canvas(n);
  const rh = n / rows;
  const joints = [];
  for (let r = 0; r < rows; r++) { const c = 1 + (rng.next() < 0.6 ? 1 : 0), m = [], off = rng.next() * n; for (let j = 0; j < c; j++) m.push(wrapN(off + (j / c) * n + (rng.next() - 0.5) * 20 * K, n)); m.sort((a, b) => a - b); joints.push(m); }
  const streak = fbm(n, seed + 1, 2, 3, 0.55, 46), streak2 = fbm(n, seed + 2, 4, 2, 0.5, 90), blot = fbm(n, seed + 3, 5, 2);
  const height = new Float32Array(n * n), plankId = new Int32Array(n * n);
  const tmp = [0, 0, 0];
  cv.fillWith((x, y, out) => {
    const k = y * n + x, r = Math.min(rows - 1, Math.floor(y / rh)), ly = y - r * rh;
    const js = joints[r];
    let j = -1; for (let q = 0; q < js.length; q++) if (js[q] <= x) j = q;
    const id = r * 8 + (j < 0 ? js.length - 1 : j);
    plankId[k] = id;
    const t = clamp(0.32 + 0.3 * h01(id, seed) + (streak[k] - 0.5) * 0.34 * grainAmount + (streak2[k] - 0.5) * 0.16 * grainAmount + (blot[k] - 0.5) * 0.12);
    RR(t, out);
    // the gap between rows and the butt joints
    let d = Math.min(ly, rh - ly);
    for (const jx of js) { const dx = Math.min(Math.abs(x - jx), Math.abs(x - jx + n), Math.abs(x - jx - n)); d = Math.min(d, dx); }
    const gap = 1 - smoothstep(0.6 * K, 2.8 * K, d);
    out[0] = mix(out[0], gapColor[0], gap * 0.95); out[1] = mix(out[1], gapColor[1], gap * 0.95); out[2] = mix(out[2], gapColor[2], gap * 0.95);
    height[k] = smoothstep(0, 4 * K, d) * 0.5 + (streak[k] - 0.5) * 0.06;
  });
  cv.shade(height, 2.2);
  for (let i = 0; i < cnt(knots, n); i++) {
    const x = rng.next() * n, y = rng.next() * n, r = (4 + rng.next() * 4) * K;
    cv.soft(x, y, r * 1.5, RR(0.1, tmp), 0.35, r * 0.9);
    for (let q = 3; q >= 0; q--) cv.soft(x, y, r * (0.5 + 0.2 * q), RR(0.12 + 0.1 * q, [0, 0, 0]), 0.7, r * (0.3 + 0.14 * q));
    cv.soft(x - r * 0.2, y - r * 0.15, r * 0.3, RR(0.7, [0, 0, 0]), 0.5, r * 0.2);
  }
  if (nails) {
    for (let r = 0; r < rows; r++) for (const jx of joints[r]) for (const dx of [-7 * K, 7 * K]) for (const dy of [0.28, 0.72]) {
      const x = jx + dx, y = r * rh + rh * dy;
      cv.soft(x + K, y + K, 2.6 * K, [20, 12, 8], 0.5); cv.soft(x, y, 2.2 * K, [70, 58, 54], 1); cv.soft(x - 0.5 * K, y - 0.6 * K, 1 * K, [210, 200, 190], 0.9);
    }
  }
  cv.modulate(grain(n, seed + 9, n / 2, 0.035));
  if (mean) cv.matchMean(mean, 0.9);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Shingles: rows of scalloped tiles, each lit from above, with a shadow beneath its curve; row 0 is towards the ridge.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function shingles(n, { seed = 81, R, rows = 5, cols = 4, tint = 14, mean = null, wear = 0.5 } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R);
  const cv = new Canvas(n, RR(0.05, [0, 0, 0]));
  const tw = n / cols, th = n / rows, rad = tw / 2, tmp = [0, 0, 0];
  const surf = fbm(n, seed + 1, 8, 3), speck = fbm(n, seed + 2, 24, 2);
  for (let r = 0; r < rows; r++) {
    for (let c = -1; c <= cols; c++) {
      const cx = (c + 0.5 + (r % 2) * 0.5) * tw, top = r * th - th * 0.55, bottom = r * th + th * 0.95;      // (each tile reaches under the one above it)
      const t = clamp(0.3 + 0.4 * h01(r * 16 + wrapN(c, cols), seed));
      const hue = [(h01(r * 16 + wrapN(c, cols), seed + 1) - 0.5) * tint, (h01(r * 16 + wrapN(c, cols), seed + 2) - 0.5) * tint * 0.6, (h01(r * 16 + wrapN(c, cols), seed + 3) - 0.5) * tint];
      const x0 = Math.floor(cx - rad - 2), x1 = Math.ceil(cx + rad + 2), y0 = Math.floor(top), y1 = Math.ceil(bottom + 3 * K);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          // signed distance inside the tile: a rectangle on top and a half circle at the foot
          const dx = x + 0.5 - cx, cyc = bottom - rad;
          let d;
          if (y + 0.5 <= cyc) d = Math.min(rad - Math.abs(dx), y + 0.5 - top);
          else d = rad - Math.hypot(dx, y + 0.5 - cyc);
          if (d < -1) continue;
          const a = smoothstep(-0.8 * K, 0.8 * K, d);
          const k = wrapN(y, n) * n + wrapN(x, n);
          const along = clamp((y + 0.5 - (r * th)) / (th * 0.95), 0, 1);                           // down the visible part of the tile
          RR(clamp(t + (surf[k] - 0.5) * 0.18 + (speck[k] - 0.5) * 0.08 * wear + 0.16 * (1 - along) - 0.12 * along * along), tmp);
          let cr = tmp[0] + hue[0], cg = tmp[1] + hue[1], cb = tmp[2] + hue[2];
          // a rim: lit at the left, dark under the curve
          const rim = 1 - smoothstep(0, 7 * K, d), lit = clamp(-dx / rad * 0.6 + 0.2) * (1 - along * 0.5);
          const sh = 1 + rim * (dx < 0 ? 0.28 : -0.3) * 1 + lit * 0.12 - rim * (y + 0.5 > cyc ? 0.25 : 0);
          cv.blend(x, y, [cr * sh, cg * sh, cb * sh], a);
        }
      }
      // the shadow this tile throws on the one below it
      for (let y = Math.floor(bottom - 2 * K); y <= Math.ceil(bottom + 7 * K); y++) for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, cyc = bottom - rad, dd = Math.hypot(dx, y + 0.5 - cyc) - rad;
        if (y + 0.5 > cyc && dd > 0 && dd < 7 * K) cv.blend(x, y, [8, 4, 6], 0.38 * (1 - dd / (7 * K)));
      }
    }
  }
  cv.modulate(grain(n, seed + 9, n / 2, 0.035));
  if (mean) cv.matchMean(mean, 0.9);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Thatch: straw that hangs, in courses bound with a darker cord.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function thatch(n, { seed = 91, R, courses = 3, mean = null } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R);
  const cv = new Canvas(n, RR(0.12, [0, 0, 0]));
  const dap = fbm(n, seed + 1, 3, 2);
  const ch = n / courses;
  const tmp = [0, 0, 0];
  // each course: a bundle of straws hanging from its cord, ragged at the foot, drawn from the top course down
  for (let c = 0; c < courses; c++) {
    const top = c * ch;
    for (let i = 0; i < cnt(520, n); i++) {
      const x = rng.next() * n, len = (ch * (0.7 + rng.next() * 0.55)), lean = (rng.next() - 0.5) * 0.22;
      const y0 = top + rng.next() * 6 * K, t = clamp(0.35 + 0.5 * rng.next() + (dap[wrapN(Math.floor(y0), n) * n + Math.floor(x)] - 0.5) * 0.2);
      const pts = [[x, y0], [x + lean * len * 0.5, y0 + len * 0.5], [x + lean * len, y0 + len]];
      cv.stroke(pts, (1.8 + rng.next() * 1.4) * K, 0.7 * K, RR(clamp(t - 0.18), [0, 0, 0]), RR(clamp(t + 0.12), [0, 0, 0]), 0.9);
    }
    // the cord: a dark twisted band with a lit edge
    const cy = top + 4 * K;
    cv.stroke([[0, cy], [n * 0.5, cy + 1.5 * K], [n, cy]], 9 * K, 9 * K, RR(0.05, tmp), RR(0.05, [0, 0, 0]), 0.92);
    for (let x = 0; x < n; x += 7 * K) cv.stroke([[x, cy - 4 * K], [x + 3 * K, cy + 4 * K]], 1.4 * K, 1.4 * K, RR(0.55, [0, 0, 0]), RR(0.55, [0, 0, 0]), 0.5);
    cv.stroke([[0, cy - 4.5 * K], [n, cy - 4.5 * K]], 1.2 * K, 1.2 * K, RR(0.8, [0, 0, 0]), RR(0.8, [0, 0, 0]), 0.55);
  }
  cv.modulate(grain(n, seed + 9, n / 2, 0.04));
  if (mean) cv.matchMean(mean, 0.9);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A plate of metal: a raised frame round a brushed field, rivets, a worn diagonal and scuffs.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function plate(n, { seed = 101, R, rivets = true, brace = true, mean = null, patina = null } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R);
  const cv = new Canvas(n);
  const brush = fbm(n, seed + 1, 3, 3, 0.6, 60), blot = fbm(n, seed + 2, 4, 3), height = new Float32Array(n * n);
  const fr = 26 * K;
  cv.fillWith((x, y, out) => {
    const k = y * n + x;
    RR(clamp(0.45 + (brush[k] - 0.5) * 0.22 + (blot[k] - 0.5) * 0.18), out);
    const d = Math.min(x, y, n - 1 - x, n - 1 - y);
    height[k] = smoothstep(0, fr, d) * 0.5 + smoothstep(fr, fr + 3 * K, d) * 0.25 - 0.25 * (1 - smoothstep(fr - 3 * K, fr, d)) * smoothstep(fr * 0.5, fr, d);
    if (brace) { const dg = Math.abs(x - y) / 1.4142; if (dg < 10 * K && d > fr) height[k] += 0.3 * (1 - smoothstep(6 * K, 10 * K, dg)); }
  });
  cv.shade(height, 3.0);
  if (patina) { const pc = col(patina), pm = new Float32Array(n * n); for (let i = 0; i < n * n; i++) pm[i] = smoothstep(0.55, 0.8, blot[i]) * 0.55; cv.tint(pm, pc, 1); }
  if (rivets) for (const [rx, ry] of [[0.14, 0.14], [0.86, 0.14], [0.14, 0.86], [0.86, 0.86]]) {
    const x = rx * n, y = ry * n, r = 9 * K;
    cv.soft(x + 2 * K, y + 2.5 * K, r * 1.25, [10, 8, 12], 0.45); cv.soft(x, y, r, RR(0.3, [0, 0, 0]), 1); cv.soft(x - r * 0.15, y - r * 0.2, r * 0.8, RR(0.6, [0, 0, 0]), 1); cv.soft(x - r * 0.3, y - r * 0.38, r * 0.35, RR(1, [0, 0, 0]), 0.95);
  }
  for (let i = 0; i < cnt(14, n); i++) { const x = rng.next() * n, y = rng.next() * n, a = rng.next() * 6.28, l = (6 + rng.next() * 14) * K; cv.stroke([[x, y], [x + Math.cos(a) * l, y + Math.sin(a) * l]], 1.1 * K, 0.6 * K, RR(0.9, [0, 0, 0]), RR(0.9, [0, 0, 0]), 0.3); }
  cv.modulate(grain(n, seed + 9, n / 2, 0.03));
  if (mean) cv.matchMean(mean, 0.9);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A half-timbered panel: posts at the sides, rails at the top and bottom, a brace corner to corner, plaster in between.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function timber(n, { seed = 111, W, P, mean = null } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const WR = ramp(W), PR = ramp(P);
  const cv = new Canvas(n);
  const post = 34 * K, blot = fbm(n, seed + 1, 4, 3), grainV = fbm(n, seed + 2, 40, 3, 0.55, 3), grainH = fbm(n, seed + 3, 3, 3, 0.55, 40), grainD = fbm(n, seed + 4, 14, 3, 0.55, 14);
  const wood = new Float32Array(n * n), height = new Float32Array(n * n);
  const brace = 22 * K;
  cv.fillWith((x, y, out) => {
    const k = y * n + x;
    const inPost = Math.min(x, n - 1 - x) < post, inRail = Math.min(y, n - 1 - y) < post;
    const dg = Math.abs((x + y) - (n - 1)) / 1.4142, inBrace = dg < brace / 2;                      // bottom left to top right, like the pixel twin
    const isWood = inPost || inRail || inBrace;
    const dEdge = Math.min(inPost ? post - Math.min(x, n - 1 - x) : 1e9, inRail ? post - Math.min(y, n - 1 - y) : 1e9, inBrace ? brace / 2 - dg : 1e9);
    if (isWood) {
      const g = inBrace && !inPost && !inRail ? grainD[k] : inPost ? grainV[k] : grainH[k];
      WR(clamp(0.45 + (g - 0.5) * 0.5 + (blot[k] - 0.5) * 0.15), out);
      wood[k] = 1;
      height[k] = smoothstep(0, 5 * K, dEdge) * 0.6;
    } else {
      PR(clamp(0.5 + (blot[k] - 0.5) * 0.4), out);
    }
  });
  cv.shade(height, 2.4);
  // the plaster is dark where the wood shades it
  const ao = new Float32Array(n * n);
  const wd = blurWood(wood, n, 7 * K);
  for (let i = 0; i < n * n; i++) ao[i] = wood[i] ? 0 : -0.55 * wd[i];
  cv.modulate(ao);
  dots(cv, rng, 160, [255, 250, 232], 0.3, 0.7 * K, 1.4 * K); dots(cv, rng, 100, [60, 50, 40], 0.3, 0.7 * K, 1.4 * K);
  for (let i = 0; i < cnt(4, n); i++) {                                                                  // cracks in the plaster
    const pts = [[post + rng.next() * (n - 2 * post), post + rng.next() * (n - 2 * post)]];
    let a = rng.next() * 6.28;
    for (let s = 1; s <= 6; s++) { a += (rng.next() - 0.5) * 1.2; pts.push([pts[s - 1][0] + Math.cos(a) * 6 * K, pts[s - 1][1] + Math.sin(a) * 6 * K]); }
    cv.stroke(pts, 1.4 * K, 0.4 * K, [74, 62, 50], [74, 62, 50], 0.5);
  }
  cv.modulate(grain(n, seed + 9, n / 2, 0.035));
  if (mean) cv.matchMean(mean, 0.9);
  return cv;
}

function blurWood(w, n, r) {
  // a cheap distance falloff: how much wood is within r (box average on two passes)
  const a = new Float32Array(n * n), b = new Float32Array(n * n);
  const R = Math.max(1, Math.round(r));
  for (let y = 0; y < n; y++) { let s = 0; for (let k = -R; k <= R; k++) s += w[y * n + wrapN(k, n)]; for (let x = 0; x < n; x++) { a[y * n + x] = s / (2 * R + 1); s += w[y * n + wrapN(x + R + 1, n)] - w[y * n + wrapN(x - R, n)]; } }
  for (let x = 0; x < n; x++) { let s = 0; for (let k = -R; k <= R; k++) s += a[wrapN(k, n) * n + x]; for (let y = 0; y < n; y++) { b[y * n + x] = s / (2 * R + 1); s += a[wrapN(y + R + 1, n) * n + x] - a[wrapN(y - R, n) * n + x]; } }
  return b;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A beam: grain that flows along it, in contour lines, a knot, a split and two nail heads. (Painted square and squeezed to the beam's shape.)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function beam(n, { seed = 131, R, mean = null } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R);
  const cv = new Canvas(n);
  const G = fbm(n, seed + 1, 14, 3, 0.55, 2), W = fbm(n, seed + 2, 3, 2, 0.5), B = fbm(n, seed + 3, 6, 3, 0.5, 2), fine = fbm(n, seed + 4, 60, 2, 0.6, 3);
  const kx = n * 0.55, ky = n * 0.38, kr = 26 * K;
  const height = new Float32Array(n * n);
  cv.fillWith((x, y, out) => {
    const k = y * n + x;
    // grain bends round the knot
    const dx = (x - kx) / (kr * 1.6), dy = (y - ky) / (kr * 3.6), kd = Math.exp(-(dx * dx + dy * dy));
    const g = G[k] + kd * Math.sin((y - ky) * 0.05) * 0.08 * (x < kx ? -1 : 1) * 0;
    const line = Math.abs(Math.sin((g + (W[k] - 0.5) * 0.18) * Math.PI * 8));
    let t = 0.5 + (B[k] - 0.5) * 0.36 + (fine[k] - 0.5) * 0.18 - (1 - smoothstep(0, 0.16, line)) * 0.2;
    const kn = Math.hypot((x - kx) / kr, (y - ky) / (kr * 1.5));                   // the knot: rings that darken in
    if (kn < 1.6) t -= (0.25 + 0.2 * Math.sin(kn * 9)) * (1 - kn / 1.6);
    RR(clamp(t), out);
    height[k] = (B[k] - 0.5) * 0.3 + (1 - smoothstep(0, 0.16, line)) * -0.1 + (kn < 1 ? (1 - kn) * 0.2 : 0);
  });
  cv.shade(height, 2.0);
  const sx = n * 0.28, sy = n * 0.64;                                           // a long split, dark with a lit lip
  cv.stroke([[sx, sy], [sx + 2 * K, sy + 20 * K], [sx - 1 * K, sy + 44 * K], [sx + 2 * K, sy + 62 * K]], 3 * K, 0.6 * K, RR(0.02, [0, 0, 0]), RR(0.1, [0, 0, 0]), 0.95);
  cv.stroke([[sx + 4 * K, sy + 2 * K], [sx + 6 * K, sy + 22 * K], [sx + 3 * K, sy + 44 * K]], 1.2 * K, 0.5 * K, RR(0.95, [0, 0, 0]), RR(0.95, [0, 0, 0]), 0.5);
  for (const [nx, ny] of [[0.78, 0.14], [0.2, 0.88]]) {
    const x = nx * n, y = ny * n;
    cv.soft(x + 1.5 * K, y + 2 * K, 5 * K, [12, 8, 6], 0.45); cv.soft(x, y, 4 * K, [60, 50, 48], 1); cv.soft(x - K, y - 1.2 * K, 1.8 * K, [210, 200, 190], 0.9);
  }
  cv.modulate(grain(n, seed + 9, n / 2, 0.03));
  if (mean) cv.matchMean(mean, 0.9);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Stucco: cream plaster in soft blotches with hairline cracks.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function stucco(n, { seed = 121, R, mean = null } = {}) {
  return soil(n, { seed, R, mottle: 4, pebbles: 0, flecksN: 220, cracks: 5, crackColor: [96, 78, 60], contrast: 0.7, mean, light: [255, 250, 236], dark: [96, 80, 62] });
}
