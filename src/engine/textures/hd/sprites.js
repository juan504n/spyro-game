// HD painters for the sprites of the meadows and the water: a tuft of grass, flowers, ferns, reeds, a lily pad and a vine. Each is painted straight at the size it will have (a canvas with a plane of coverage), anti-aliased,
// with the colours of its pixel twin; the edge between painted and not is where the game cuts the card out.
import { Canvas, RNG, clamp, mix, smoothstep, ramp, col } from './kit.js';
import { leaf } from './plants.js';

/** a quadratic curve a -> c bent towards b, as a list of points */
const bez = (a, b, c, steps = 9) => {
  const pts = [];
  for (let i = 0; i <= steps; i++) { const t = i / steps, u = 1 - t; pts.push([u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]); }
  return pts;
};
const shift = (pts, dx, dy) => pts.map((p) => [p[0] + dx, p[1] + dy]);

/** a blade or a stalk: a tapered stroke dark at the root and light at the tip, with a lit stripe along its upper left side */
function blade(cv, pts, w0, w1, c0, c1, lit) {
  cv.stroke(pts, w0, w1, c0, c1, 1);
  if (lit) cv.stroke(shift(pts, -w0 * 0.2, -w0 * 0.05), w0 * 0.42, w1 * 0.3, lit[0], lit[1], 0.7);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A tuft of grass: blades from a root, tall in the middle and shorter at the sides, the back ones darker.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function tuft(w, h, { seed = 7001, R } = {}) {
  const K = w / 128;
  const rng = new RNG(seed);
  const RR = ramp(R), cv = new Canvas(w, [0, 0, 0], { h, alpha: true });
  cv.soft(64 * K, 124 * K, 36 * K, RR(0.05, [0, 0, 0]), 0.7, 7 * K);                       // the root, dark
  const blades = [];
  for (let i = 0; i < 17; i++) {
    const a = (rng.next() - 0.5) * 1.3, mid = 1 - Math.abs(a) / 0.8;
    blades.push({ a, z: rng.next(), len: (46 + 46 * mid + rng.next() * 14) * K, x: (64 + a * 28 + (rng.next() - 0.5) * 10) * K, bend: (rng.next() - 0.5) * 0.9 });
  }
  blades.sort((p, q) => p.z - q.z);
  for (const b of blades) {
    const sx = Math.sin(b.a), cy = Math.cos(b.a), base = [b.x, 126 * K];
    const pts = bez(base, [b.x + sx * b.len * 0.5 + b.bend * 14 * K, 126 * K - cy * b.len * 0.6], [b.x + sx * b.len + b.bend * 26 * K, 126 * K - cy * b.len]);
    blade(cv, pts, (6.5 + 3 * b.z) * K, 0.7 * K, RR(0.08 + 0.25 * b.z, [0, 0, 0]), RR(0.5 + 0.45 * b.z, [0, 0, 0]), [RR(0.62 + 0.3 * b.z, [0, 0, 0]), RR(0.95, [0, 0, 0])]);
  }
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Flowers: a stalk with two leaves and a head. The heads differ, the rest does not.
// ---------------------------------------------------------------------------------------------------------------------------------------------
function stalk(cv, RR, a, b, c, K, wide = 7, colors = null, leaves = true) {
  const pts = bez(a, b, c, 10);
  const dark = colors ? colors.dark : RR(0.22, [0, 0, 0]), light = colors ? colors.light : RR(0.62, [0, 0, 0]);
  blade(cv, pts, wide * K, wide * 0.6 * K, dark, light, [light, light]);
  if (leaves) {
    const ld = colors ? colors.leafDark : RR(0.22, [0, 0, 0]), ll = colors ? colors.leafLight : RR(0.85, [0, 0, 0]);
    const p1 = pts[Math.round(pts.length * 0.3)], p2 = pts[Math.round(pts.length * 0.5)];
    leaf(cv, p1[0], p1[1], -2.45, 40 * K, 18 * K, ld, ll, 1);
    leaf(cv, p2[0], p2[1], -0.7, 38 * K, 17 * K, ld, ll, 1);
  }
  return pts;
}

export function flowerPink(w, h, { seed = 7101, R } = {}) {
  const K = w / 128, RR = ramp(R), cv = new Canvas(w, [0, 0, 0], { h, alpha: true });
  stalk(cv, RR, [64 * K, 126 * K], [66 * K, 90 * K], [64 * K, 50 * K], K);
  const cx = 64 * K, cy = 40 * K, lo = col('#c43a76'), hi = col('#ffc4da');
  for (let i = 0; i < 5; i++) leaf(cv, cx, cy, -Math.PI / 2 + (i * 2 * Math.PI) / 5, 34 * K, 28 * K, lo, hi, 1, 0.15);
  cv.soft(cx, cy, 11 * K, [150, 60, 20], 0.9);
  cv.soft(cx, cy, 9 * K, col('#ffc03c'), 1);
  cv.soft(cx - 2 * K, cy - 2.4 * K, 4.4 * K, col('#fff6c0'), 0.9);
  for (let i = 0; i < 7; i++) { const a = i * 0.9, r = 5.5 * K; cv.soft(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.5 * K, col('#c05a14'), 0.8); }
  return cv;
}

export function flowerYellow(w, h, { seed = 7102, R } = {}) {
  const K = w / 128, RR = ramp(R), cv = new Canvas(w, [0, 0, 0], { h, alpha: true });
  stalk(cv, RR, [64 * K, 126 * K], [58 * K, 100 * K], [64 * K, 66 * K], K);
  const lo = col('#c8681a'), hi = col('#ffe488'), cx = 64 * K, cy = 70 * K;
  leaf(cv, cx, cy, -Math.PI / 2 - 0.5, 56 * K, 34 * K, lo, hi, 1, 0.1);                   // the back petals
  leaf(cv, cx, cy, -Math.PI / 2 + 0.5, 56 * K, 34 * K, lo, hi, 1, 0.1);
  cv.soft(cx, cy - 6 * K, 26 * K, col('#e08a1c'), 0.5, 22 * K);                           // the hollow of the cup
  leaf(cv, cx, cy, -Math.PI / 2, 62 * K, 38 * K, lo, hi, 1, 0.1);                         // the front petal
  cv.soft(cx - 7 * K, cy - 34 * K, 8 * K, col('#fff6c0'), 0.7, 14 * K);
  for (const [a, l] of [[-2.3, 18], [-0.85, 18], [-1.57, 14]]) leaf(cv, cx, cy + 4 * K, a + 1.57 + 1.57, l * K, 9 * K, RR(0.2, [0, 0, 0]), RR(0.85, [0, 0, 0]), 1);
  return cv;
}

export function flowerBlue(w, h, { seed = 7103, R } = {}) {
  const K = w / 128, RR = ramp(R), cv = new Canvas(w, [0, 0, 0], { h, alpha: true });
  const pts = stalk(cv, RR, [48 * K, 126 * K], [34 * K, 60 * K], [90 * K, 38 * K], K, 6);
  const bell = (x, y, s = 1) => {                                       // a bell hangs from its top: narrow, flaring to a scalloped rim
    const bh = 34 * K * s, bw = 15 * K * s, x0 = Math.floor(x - bw - 3), x1 = Math.ceil(x + bw + 3), y0 = Math.floor(y - bh * 0.5 - 3), y1 = Math.ceil(y + bh * 0.5 + 3);
    const dark = col('#2a40aa'), mid = col('#5a8cf0'), light = col('#c4d8ff'), tmp = [0, 0, 0];
    cv.stroke(bez([x, y - bh * 0.5 - 14 * K * s], [x + 4 * K, y - bh * 0.5 - 8 * K * s], [x, y - bh * 0.5 + 2]), 3 * K, 2.6 * K, RR(0.3, [0, 0, 0]), RR(0.55, [0, 0, 0]), 1);
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const t = (py + 0.5 - (y - bh * 0.5)) / bh;                       // 0 at the top, 1 at the rim
        if (t < -0.02 || t > 1.02) continue;
        const half = bw * (0.28 + 0.72 * Math.pow(clamp(t), 1.5)) * (t > 0.85 ? 1 + (t - 0.85) * 1.1 : 1);
        const dx = px + 0.5 - x, rimCut = 1 - 0.07 * Math.abs(Math.sin((dx / bw) * 3.1)) * smoothstep(0.9, 1, t);       // the rim is scalloped
        const edge = half - Math.abs(dx), cov = Math.min(clamp((edge + 0.6) / 1.2), clamp((rimCut + 0.02 - t) * bh / 1.2 + 0.5));
        if (cov <= 0) continue;
        const side = clamp(dx / Math.max(half, 1) * -1), shade = 0.5 + 0.42 * side - 0.18 * smoothstep(0.78, 1, t) + 0.16 * (1 - t);
        const sh = clamp(shade);
        tmp[0] = dark[0] + (light[0] - dark[0]) * sh; tmp[1] = dark[1] + (light[1] - dark[1]) * sh; tmp[2] = dark[2] + (light[2] - dark[2]) * sh;
        if (sh < 0.62) { const m = sh / 0.62; tmp[0] = dark[0] + (mid[0] - dark[0]) * m; tmp[1] = dark[1] + (mid[1] - dark[1]) * m; tmp[2] = dark[2] + (mid[2] - dark[2]) * m; }
        cv.blend(px, py, tmp, cov);
      }
    }
    cv.soft(x - bw * 0.35, y - bh * 0.1, 2.6 * K * s, [255, 255, 255], 0.55, 9 * K * s);   // a glint down the lit side
    cv.soft(x, y + bh * 0.52, 2.8 * K * s, col('#f4f0c0'), 0.9);                           // the clapper
  };
  const at = (t) => pts[Math.round((pts.length - 1) * t)];
  const b1 = at(1), b2 = at(0.62), b3 = at(0.3);
  bell(b1[0] + 2 * K, b1[1] + 24 * K); bell(b2[0] + 20 * K, b2[1] + 14 * K, 0.9); bell(b3[0] - 16 * K, b3[1] + 12 * K, 0.85);
  return cv;
}

export function flowerEmber(w, h, { seed = 7104, R } = {}) {
  const K = w / 128, cv = new Canvas(w, [0, 0, 0], { h, alpha: true });
  const ST = { dark: col('#2e1c12'), light: col('#7a5230'), leafDark: col('#3a2418'), leafLight: col('#c4501a') };
  stalk(cv, null, [64 * K, 126 * K], [66 * K, 92 * K], [64 * K, 56 * K], K, 7, ST, false);
  leaf(cv, 64 * K, 100 * K, -2.5, 38 * K, 14 * K, ST.leafDark, ST.leafLight, 1);
  leaf(cv, 64 * K, 92 * K, -0.65, 38 * K, 14 * K, ST.leafDark, ST.leafLight, 1);
  const cx = 64 * K, cy = 56 * K, lo = col('#a82e10'), hi = col('#ffc060');
  cv.soft(cx, cy - 14 * K, 34 * K, col('#ff7a22'), 0.25, 34 * K);                          // a glow
  for (const a of [-2.35, -1.95, -1.17, -0.8, -1.57]) leaf(cv, cx, cy, a, (44 + (a === -1.57 ? 8 : 0)) * K, 17 * K, lo, hi, 1, 0.1);
  cv.soft(cx, cy - 6 * K, 9 * K, col('#fff0b0'), 0.9, 12 * K);
  for (let i = 0; i < 4; i++) cv.soft(cx + (i - 1.5) * 12 * K, cy - 48 * K - (i % 2) * 8 * K, 2.2 * K, col('#ffd070'), 0.9);        // sparks
  return cv;
}

export function flowerSky(w, h, { seed = 7105, R } = {}) {
  const K = w / 128, cv = new Canvas(w, [0, 0, 0], { h, alpha: true });
  const ST = { dark: col('#24484e'), light: col('#62a8a0'), leafDark: col('#2a5058'), leafLight: col('#a8d8c8') };
  const pts = stalk(cv, null, [64 * K, 126 * K], [62 * K, 96 * K], [72 * K, 52 * K], K, 6, ST, true);
  const cx = 72 * K, cy = 46 * K, lo = col('#7a92d0'), hi = col('#ffffff');
  for (let i = 0; i < 5; i++) leaf(cv, cx, cy, -Math.PI / 2 + (i * 2 * Math.PI) / 5, 36 * K, 26 * K, lo, hi, 1, 0.1);
  cv.soft(cx, cy, 9 * K, col('#f0a020'), 1);
  cv.soft(cx - 2 * K, cy - 2 * K, 5 * K, col('#ffd860'), 1);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Reeds: long blades and three cattails. (128 x 256)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function reeds(w, h, { seed = 7201, R } = {}) {
  const K = w / 128;
  const rng = new RNG(seed);
  const RR = ramp(R), cv = new Canvas(w, [0, 0, 0], { h, alpha: true });
  const base = h - 4 * K;
  const heads = [[0.34, 108 * K], [0.7, 150 * K], [0.52, 66 * K]];
  const blades = [];
  for (let i = 0; i < 15; i++) blades.push({ x: (12 + rng.next() * 104) * K, top: (28 + rng.next() * 150) * K, z: rng.next(), bend: (rng.next() - 0.5) * 30 * K });
  blades.sort((a, b) => a.z - b.z);
  const drawBlade = (b) => {
    const pts = bez([b.x, base], [b.x + b.bend * 0.3, (base + b.top) / 2], [b.x + b.bend, b.top]);
    blade(cv, pts, (8 + 3 * b.z) * K, 0.6 * K, RR(0.1 + 0.25 * b.z, [0, 0, 0]), RR(0.5 + 0.4 * b.z, [0, 0, 0]), [RR(0.7 + 0.25 * b.z, [0, 0, 0]), RR(0.95, [0, 0, 0])]);
  };
  blades.filter((b) => b.z < 0.5).forEach(drawBlade);
  for (const [fx, top] of heads) {                                                       // cattails on stems, among the blades
    const x = fx * w, sway = (fx - 0.5) * 8 * K;
    cv.stroke(bez([x, base], [x + sway, (base + top) / 2], [x + sway * 1.4, top + 16 * K]), 5 * K, 3 * K, RR(0.25, [0, 0, 0]), RR(0.55, [0, 0, 0]), 1);
    const hy = top - 8 * K, hx = x + sway * 1.4;
    cv.soft(hx + 2 * K, hy + 2 * K, 15 * K, [20, 12, 8], 0.4, 40 * K);
    cv.soft(hx, hy, 14 * K, col('#3a2418'), 1, 39 * K);
    cv.soft(hx - 2 * K, hy - 2 * K, 11.6 * K, col('#7a4a2c'), 1, 36 * K);
    cv.soft(hx - 5 * K, hy - 10 * K, 5 * K, col('#c89462'), 0.8, 24 * K);
    for (let i = 0; i < 40; i++) cv.soft(hx + (rng.next() - 0.5) * 20 * K, hy + (rng.next() - 0.5) * 66 * K, (1 + rng.next() * 0.7) * K, rng.next() < 0.5 ? col('#2a1810') : col('#a67048'), 0.7);
    cv.stroke([[hx, hy - 36 * K], [hx + 1 * K, hy - 54 * K]], 3.6 * K, 0.8 * K, col('#a8844a'), col('#e8d8a0'), 1);
  }
  blades.filter((b) => b.z >= 0.5).forEach(drawBlade);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A fern: fronds that arch out of the root, each a rib with leaflets down both sides, the lower ones long.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function fern(w, h, { seed = 7301, R } = {}) {
  const K = w / 128;
  const rng = new RNG(seed);
  const RR = ramp(R), cv = new Canvas(w, [0, 0, 0], { h, alpha: true });
  cv.soft(64 * K, 124 * K, 30 * K, RR(0.05, [0, 0, 0]), 0.6, 6 * K);
  const fronds = [-1.3, -0.95, -0.58, -0.2, 0.2, 0.58, 0.95, 1.3].map((a, i) => ({ a, z: rng.next(), len: (72 - Math.abs(a) * 14 + rng.next() * 12) * K }));
  fronds.sort((p, q) => p.z - q.z);
  const lo = [0, 0, 0], hi = [0, 0, 0];
  for (const f of fronds) {
    const sx = Math.sin(f.a), cy = Math.cos(f.a), base = [64 * K, 124 * K];
    const tip = [base[0] + sx * f.len, base[1] - cy * f.len * 0.9];
    const mid = [base[0] + sx * f.len * 0.35, base[1] - cy * f.len * 0.85];
    const pts = bez(base, mid, tip, 12);
    cv.stroke(pts, 4.4 * K, 1.2 * K, RR(0.12 + 0.2 * f.z, [0, 0, 0]), RR(0.5, [0, 0, 0]), 1);
    for (let i = 3; i < pts.length - 1; i++) {
      const t = i / (pts.length - 1), p = pts[i], q = pts[i + 1];
      const tang = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const len = (22 - 14 * t) * K, wid = (10 - 4.5 * t) * K, tone = 0.3 + 0.35 * f.z + 0.25 * t;
      RR(clamp(tone - 0.2), lo); RR(clamp(tone + 0.2), hi);
      for (const side of [-1, 1]) leaf(cv, p[0], p[1], tang + side * 1.0, len, wid, lo.slice(), hi.slice(), 1, 0.3);
    }
  }
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A lily pad: a round leaf with a notch, veins that run out from the stalk, a darker rim, lit from the upper left, a few drops of water.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function lilypad(w, h, { seed = 7401, R } = {}) {
  const K = w / 128;
  const rng = new RNG(seed);
  const RR = ramp(R), cv = new Canvas(w, [0, 0, 0], { h, alpha: true });
  const cx = 62 * K, cy = 66 * K, rad = 54 * K, notch = 0.13 * Math.PI, notchHalf = 0.2, tmp = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
      const edge = rad * (1 + 0.025 * Math.sin(th * 5 + 1) + 0.015 * Math.sin(th * 11));
      let dn = Math.abs(th - notch); if (dn > Math.PI) dn = 2 * Math.PI - dn;                    // angle from the notch
      const notchEdge = dn < notchHalf * 1.6 ? (notchHalf - dn) * Math.max(r, 1) : 1e9;           // (inside the notch: negative distance to its edge, in px)
      const d = Math.min(edge - r, dn < notchHalf * 1.6 ? -notchEdge : 1e9);
      const cov = clamp((d + 0.6) / 1.2);
      if (cov <= 0) continue;
      const rr = r / rad, lit = clamp(0.5 - (dx + dy) / (2 * rad) * 0.5);
      const vein = Math.pow(Math.abs(Math.sin((th - notch) * 7.5)), 24) * smoothstep(0.08, 0.3, rr);       // veins from the stalk to the rim
      let t = 0.36 + 0.24 * lit + 0.1 * (1 - rr) - 0.18 * smoothstep(0.82, 1, rr) - 0.12 * vein + 0.08 * Math.sin(th * 3 + rr * 4);
      if (rr > 0.9) t += 0.1 * (1 - smoothstep(0.9, 1, rr)) * 0 + (dx + dy < 0 ? 0.1 : -0.05);
      RR(clamp(t), tmp);
      cv.blend(x, y, tmp, cov);
    }
  }
  for (let i = 0; i < 4; i++) {                                                                      // drops of water
    const a = rng.next() * 6.28, r = (8 + rng.next() * 36) * K;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (Math.abs(a - notch) < 0.5) continue;
    cv.soft(x + K, y + 1.4 * K, 4.4 * K, [10, 40, 24], 0.4, 3.6 * K); cv.soft(x, y, 3.6 * K, [200, 236, 224], 0.7, 3 * K); cv.soft(x - 1 * K, y - 1.2 * K, 1.4 * K, [255, 255, 255], 0.95);
  }
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A vine: a stalk that winds, leaves in pairs and a tendril or two. (64 x 256)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function vine(w, h, { seed = 7501, R } = {}) {
  const K = w / 64;
  const rng = new RNG(seed);
  const RR = ramp(R), cv = new Canvas(w, [0, 0, 0], { h, alpha: true });
  const X = (y) => (32 + 11 * Math.sin((y / h) * Math.PI * 5 + 0.6)) * K;
  const pts = [];
  for (let y = -4; y <= h + 4; y += 8) pts.push([X(y), y]);
  const lo = [0, 0, 0], hi = [0, 0, 0];
  blade(cv, pts, 5.2 * K, 4.4 * K, RR(0.18, [0, 0, 0]), RR(0.5, [0, 0, 0]), [RR(0.7, [0, 0, 0]), RR(0.7, [0, 0, 0])]);
  let side = 1;
  for (let y = 18; y < h - 8; y += 42) {
    const x = X(y), tone = 0.35 + rng.next() * 0.2;
    RR(clamp(tone - 0.2), lo); RR(clamp(tone + 0.25), hi);
    for (const s of [-1, 1]) leaf(cv, x, y, s < 0 ? Math.PI - 0.5 : 0.5, 24 * K, 20 * K, lo.slice(), hi.slice(), 1, 0.3);
    if (side > 0) cv.stroke(bez([x, y + 4 * K], [x + 14 * K, y + 18 * K], [x + 6 * K, y + 30 * K], 6), 1.6 * K, 0.8 * K, RR(0.3, [0, 0, 0]), RR(0.6, [0, 0, 0]), 0.9);
    side = -side;
  }
  return cv;
}
