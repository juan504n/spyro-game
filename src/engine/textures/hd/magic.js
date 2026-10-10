// HD painters for the things that glow and the things in the sky: crystals, lantern glass, the barrier, the portal's swirl, a beam of light, a glow, the rings of runes round a goal, a moon, a sun and a cloud.
// Most of them are drawn on black or over the sky (they are added to what is behind them, or cut out of a card), so a painter here owns its own edge.
import { Canvas, RNG, clamp, mix, smoothstep, ramp, col, fbmWH, voronoi, grain, cnt } from './kit.js';

/** a circle (or an arc, from a0 to a1 in radians) as a polyline stroke */
function ring(cv, cx, cy, r, width, c0, c1, a = 1, a0 = 0, a1 = Math.PI * 2, steps = 0) {
  const n = steps || Math.max(16, Math.round(((a1 - a0) * r) / 3));
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = a0 + ((a1 - a0) * i) / n; pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); }
  cv.stroke(pts, width, width, c0, c1, a);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A crystal: five upright facets, each lit from above and from the left, a glowing tip, fractures inside, glints.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function crystal(w, h, { seed = 9001, R, base = [3, 4, 2, 3, 1] } = {}) {
  const K = w / 128;
  const RR = ramp(R), cv = new Canvas(w, [0, 0, 0], { h, ref: 128 });          // (written for 128 px: the size a crystal has)
  const xs = [0, 0.25, 0.44, 0.63, 0.81, 1].map((v) => v * w);
  const f = fbmWH(w, h, seed + 1, 5, 3, 0.5, 5), g = fbmWH(w, h, seed + 2, 24, 2, 0.5, 6), height = new Float32Array(w * h);
  const n = R.length - 1;
  cv.fillWith((x, y, out) => {
    const k = y * w + x, v = y / h;
    let fi = 0; while (fi < 4 && x >= xs[fi + 1]) fi++;
    const fu = (x - xs[fi]) / (xs[fi + 1] - xs[fi]);
    let t = base[fi] / n + (f[k] - 0.5) * 0.12 + (g[k] - 0.5) * 0.06;
    t += (1 - smoothstep(0, 0.28, v)) * 0.28 - smoothstep(0.7, 1, v) * 0.3;                 // a glowing tip, deeper towards the foot
    t += (1 - smoothstep(0, 0.1, fu)) * 0.2 - smoothstep(0.82, 1, fu) * 0.22;                 // the edge of a facet: lit on its left, dark on its right
    t += (0.5 - fu) * 0.16;                                                                      // a facet is a little rounded
    RR(clamp(t), out);
    height[k] = (fi % 2 ? 0.3 : 0.1) + fu * 0.2;
  });
  cv.shade(height, 0.5);
  // fractures, and light that has got in
  const lite = RR(1, [0, 0, 0]), darkc = RR(base[1] / n - 0.2, [0, 0, 0]);
  for (const [fx, fy, l, a] of [[0.34, 0.45, 0.28, 0.12], [0.72, 0.3, 0.22, -0.1]]) {
    cv.stroke([[fx * w, fy * h], [(fx + a * 0.3) * w, (fy + l * 0.5) * h], [(fx + a) * w, (fy + l) * h]], 2.4 * K, 0.8 * K, darkc, darkc, 0.7);
    cv.stroke([[fx * w + 2 * K, fy * h], [(fx + a * 0.3) * w + 2 * K, (fy + l * 0.5) * h], [(fx + a) * w + 2 * K, (fy + l) * h]], 1.2 * K, 0.5 * K, lite, lite, 0.5);
  }
  for (const [gx, gy, s] of [[0.36, 0.1, 1], [0.7, 0.4, 0.7], [0.88, 0.28, 0.6], [0.16, 0.7, 0.5]]) {
    cv.soft(gx * w, gy * h, 7 * K * s, [255, 255, 255], 0.55);
    cv.soft(gx * w, gy * h, 2.4 * K * s, [255, 255, 255], 1);
    cv.soft(gx * w, gy * h, 11 * K * s, [255, 255, 255], 0.5, 1.4 * K);
    cv.soft(gx * w, gy * h, 1.4 * K, [255, 255, 255], 0.5, 11 * K * s);
  }
  cv.modulate(grain(w, seed + 9, w / 2, 0.02, h));
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Lantern glass: a brass cage with three panes. Off: frosted violet. On: amber round a white heart.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function lanternGlass(w, h, { seed = 9101, on = false, B, V, A } = {}) {
  const K = w / 128;
  const rng = new RNG(seed);
  const BR = ramp(B), VR = ramp(V), AR = ramp(A), cv = new Canvas(w, [0, 0, 0], { h, ref: 128 });
  const panes = [[16, 40], [48, 80], [88, 112]].map(([a, b]) => [a * K, b * K]), y0 = 24 * K, y1 = 104 * K;
  const fr = fbmWH(w, h, seed + 1, 8, 3, 0.5, 8), brush = fbmWH(w, h, seed + 2, 3, 2, 0.5, 30), height = new Float32Array(w * h);
  cv.fillWith((x, y, out) => {
    const k = y * w + x;
    const pane = panes.find(([a, b]) => x >= a && x < b) && y >= y0 && y < y1;
    if (pane) {
      const d = Math.hypot((x + 0.5 - w / 2) / (w * 0.5), (y + 0.5 - h / 2) / (h * 0.42));
      if (on) AR(clamp(1.05 - d * 0.8 + (fr[k] - 0.5) * 0.12), out);
      else VR(clamp(0.2 + d * 0.5 + (fr[k] - 0.5) * 0.2), out);
      const pa = panes.find(([a, b]) => x >= a && x < b), edge = Math.min(x - pa[0], pa[1] - x, y - y0, y1 - y);
      height[k] = -0.5 * (1 - smoothstep(0, 5 * K, edge));
      if (on) { out[0] = mix(out[0], 255, smoothstep(0.35, 0, d) * 0.9); out[1] = mix(out[1], 252, smoothstep(0.35, 0, d) * 0.9); out[2] = mix(out[2], 235, smoothstep(0.35, 0, d) * 0.9); }
    } else {
      BR(clamp(0.5 + (brush[k] - 0.5) * 0.3), out);
      height[k] = 0.6;
    }
  });
  cv.shade(height, 2.0);
  for (const [a, b] of panes) {
    if (on) { cv.stroke([[a + 4 * K, y0 + 4 * K], [a + 12 * K, y0 + 4 * K]], 2.4 * K, 2.4 * K, [255, 255, 245], [255, 255, 245], 0.8); }
    else { cv.stroke([[a + 4 * K, y0 + 5 * K], [a + 4 * K, y0 + 22 * K]], 2.4 * K, 1 * K, [220, 200, 255], [220, 200, 255], 0.55); for (let i = 0; i < 7; i++) cv.soft(a + rng.next() * (b - a), y0 + rng.next() * (y1 - y0), 1.3 * K, [190, 160, 250], 0.7); }
  }
  for (const [a, b] of panes) for (const ry of [y0 - 12 * K, y1 + 12 * K]) { const x = (a + b) / 2; cv.soft(x + K, ry + 2 * K, 5 * K, [12, 8, 4], 0.4); cv.soft(x, ry, 4 * K, BR(0.25, [0, 0, 0]), 1); cv.soft(x - K, ry - 1.2 * K, 1.8 * K, BR(1, [0, 0, 0]), 0.95); }
  cv.modulate(grain(w, seed + 9, w / 2, 0.02, h));
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// The barrier: a field of cells that shimmer, dark inside and bright on the lines, with a spark at each corner. (Tiles: a staggered lattice.)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function barrier(n, { seed = 9201, R } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R), cv = new Canvas(n);
  const vor = voronoi(n, 4, 4, seed, 0, 0.5), f = fbmWH(n, n, seed + 1, 4, 3, 0.5), g = fbmWH(n, n, seed + 2, 16, 2, 0.5);
  cv.fillWith((x, y, out) => {
    const k = y * n + x, d = (vor.f2[k] - vor.f1[k]) / 2;
    const edge = Math.exp(-d / (2.6 * K)), halo = Math.exp(-d / (11 * K));
    RR(clamp(0.16 + (f[k] - 0.5) * 0.22 + (g[k] - 0.5) * 0.08 + 0.2 * (1 - smoothstep(0, 56 * K, vor.f1[k])) + halo * 0.26 + edge * 0.5), out);
  });
  for (let i = 0; i < cnt(16, n); i++) { const x = rng.next() * n, y = rng.next() * n; cv.soft(x, y, 7 * K, [240, 230, 255], 0.3); cv.soft(x, y, 2 * K, [255, 255, 255], 0.9); }
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// The swirl of a portal: arms that wind in from the rim, violet, with cyan where they are brightest, round a white heart, on black.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function swirl(n, { seed = 9301, R, hot = [90, 220, 255] } = {}) {
  const K = n / 256;
  const RR = ramp(R), cv = new Canvas(n), f = fbmWH(n, n, seed + 1, 5, 3, 0.55);
  cv.fillWith((x, y, out) => {
    const k = y * n + x, dx = (x + 0.5 - n / 2) / (n / 2), dy = (y + 0.5 - n / 2) / (n / 2), r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    const phase = 3 * th + 11 * Math.pow(r, 0.62) + (f[k] - 0.5) * 1.6;
    const arm = Math.pow(0.5 + 0.5 * Math.sin(phase), 1.6);
    const fade = (1 - smoothstep(0.78, 1.0, r)) * (0.35 + 0.65 * (1 - smoothstep(0, 0.9, r)) + 0.3);
    let t = arm * fade * 0.85 + 0.25 * (1 - smoothstep(0, 0.35, r));
    RR(clamp(t), out);
    const hotA = smoothstep(0.78, 0.98, arm) * fade * 0.7;
    out[0] = mix(out[0], hot[0], hotA); out[1] = mix(out[1], hot[1], hotA); out[2] = mix(out[2], hot[2], hotA);
    const core = Math.exp(-r * r * 40);
    out[0] = mix(out[0], 255, core); out[1] = mix(out[1], 255, core); out[2] = mix(out[2], 255, core);
    const dark = 1 - smoothstep(0.9, 1.0, r);
    out[0] *= dark; out[1] *= dark; out[2] *= dark;
  });
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A beam of light: bright in the middle, falling away to the sides, with streaks along it. (Tiles along its length; 64 x 256.)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function beam(w, h, { seed = 9401 } = {}) {
  const cv = new Canvas(w, [0, 0, 0], { h }), s = fbmWH(w, h, seed + 1, 8, 3, 0.5, 3), t = fbmWH(w, h, seed + 2, 3, 2, 0.5, 6);
  cv.fillWith((x, y, out) => {
    const k = y * w + x, u = Math.abs((x + 0.5) / w - 0.5) * 2;                                // 0 in the middle, 1 at the edge
    const core = Math.exp(-u * u * 9), body = 1 - smoothstep(0.1, 1, u), v = clamp(0.1 * body + 0.9 * core * (0.75 + 0.25 * s[k]) + 0.25 * body * (t[k] - 0.5));
    const c = 255 * clamp(v * 1.05);
    out[0] = c * (0.94 + 0.06 * v); out[1] = c * (0.95 + 0.05 * v); out[2] = Math.min(255, c * 1.02 + 6 * v);
  });
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A glow: white in the middle, falling away smoothly, on black.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function glow(n) {
  const cv = new Canvas(n);
  cv.fillWith((x, y, out) => {
    const dx = (x + 0.5 - n / 2) / (n / 2), dy = (y + 0.5 - n / 2) / (n / 2), r = Math.hypot(dx, dy);
    const v = (Math.exp(-r * r * 7) * 0.7 + Math.exp(-r * 3.4) * 0.3) * (1 - smoothstep(0.82, 1, r));
    out[0] = out[1] = out[2] = 255 * clamp(v);
  });
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// The ring of runes round a goal: a plate with a circle of light on it, a band of notched glyphs, a thin ring and a gem at the heart.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function runeRing(n, { seed = 9501, R } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R), cv = new Canvas(n, [58, 58, 76]);
  const f = fbmWH(n, n, seed + 1, 5, 3, 0.5), cx = n / 2, cy = n / 2;
  cv.fillWith((x, y, out) => { const v = 0.5 + (f[y * n + x] - 0.5) * 0.18; const edge = Math.min(x, y, n - 1 - x, n - 1 - y); out[0] = 62 * v * 2 * (0.7 + 0.3 * smoothstep(0, 6 * K, edge)); out[1] = 62 * v * 2 * (0.7 + 0.3 * smoothstep(0, 6 * K, edge)); out[2] = 80 * v * 2 * (0.7 + 0.3 * smoothstep(0, 6 * K, edge)); });
  const lo = RR(0.35, [0, 0, 0]), mid = RR(0.6, [0, 0, 0]), hi = RR(0.9, [0, 0, 0]);
  cv.soft(cx, cy, 118 * K, RR(0.3, [0, 0, 0]), 0.35);                                                       // the light it throws on the plate
  ring(cv, cx, cy, 104 * K, 14 * K, lo, lo, 1);
  ring(cv, cx, cy, 104 * K, 7 * K, mid, hi, 1);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; ring(cv, cx, cy, 104 * K, 14 * K, [34, 20, 80], [34, 20, 80], 0.9, a - 0.035, a + 0.035, 4); }          // the notches between the glyphs
  ring(cv, cx, cy, 82 * K, 5 * K, [34, 20, 80], [34, 20, 80], 1);
  ring(cv, cx, cy, 70 * K, 12 * K, lo, mid, 0.95);
  ring(cv, cx, cy, 70 * K, 3.4 * K, hi, hi, 0.9);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; cv.soft(cx + Math.cos(a) * 70 * K, cy + Math.sin(a) * 70 * K, 6 * K, [255, 244, 255], 0.9); }
  ring(cv, cx, cy, 38 * K, 5 * K, mid, mid, 1);
  cv.soft(cx, cy, 30 * K, RR(0.3, [0, 0, 0]), 1);
  cv.soft(cx - 4 * K, cy - 4 * K, 22 * K, RR(0.7, [0, 0, 0]), 1);
  cv.soft(cx - 8 * K, cy - 8 * K, 9 * K, [255, 250, 255], 0.95);
  cv.modulate(grain(n, seed + 9, n / 2, 0.025));
  // (the plate is a DISC: it is laid with additive light, and the dark square it used to be showed as a slab with straight edges on the ground; black adds nothing)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const m = 1 - smoothstep(112 * K, 126 * K, Math.hypot(x + 0.5 - cx, y + 0.5 - cy)), i = (y * n + x) * 3;
    cv.px[i] *= m; cv.px[i + 1] *= m; cv.px[i + 2] *= m;
  }
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// The runes of the Guardian's Court: rings on black, thin and bright, twelve gold nodes between two of them, a small gold gem at the middle.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function runeCourt(n, { seed = 9601, R, gold = [255, 226, 110] } = {}) {
  const K = n / 256;
  const RR = ramp(R), cv = new Canvas(n, [0, 0, 0]), cx = n / 2, cy = n / 2;
  const violet = RR(0.55, [0, 0, 0]), bright = RR(0.9, [0, 0, 0]), dim = RR(0.4, [0, 0, 0]);
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; ring(cv, cx, cy, 122 * K, 2.4 * K, dim, dim, 0.9, a + 0.02, a + 0.2, 6); }        // the dashes of the outer ring
  ring(cv, cx, cy, 108 * K, 3 * K, violet, violet, 1);
  ring(cv, cx, cy, 98 * K, 7 * K, violet, bright, 1);
  ring(cv, cx, cy, 98 * K, 2.4 * K, [250, 240, 255], [250, 240, 255], 0.9);
  ring(cv, cx, cy, 88 * K, 3 * K, violet, violet, 1);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2, x = cx + Math.cos(a) * 98 * K, y = cy + Math.sin(a) * 98 * K;
    cv.soft(x, y, 11 * K, gold, 0.45); cv.soft(x, y, 5.2 * K, gold, 1); cv.soft(x - K, y - K, 2.4 * K, [255, 255, 235], 0.9);
    cv.stroke([[cx + Math.cos(a) * 88 * K, cy + Math.sin(a) * 88 * K], [cx + Math.cos(a) * 108 * K, cy + Math.sin(a) * 108 * K]], 2.4 * K, 2.4 * K, violet, violet, 0.9);
  }
  ring(cv, cx, cy, 58 * K, 3 * K, dim, violet, 1);
  ring(cv, cx, cy, 36 * K, 2.4 * K, dim, dim, 0.9);
  cv.soft(cx, cy, 24 * K, RR(0.3, [0, 0, 0]), 0.5);
  cv.soft(cx, cy, 11 * K, gold, 0.5); cv.soft(cx, cy, 7 * K, [220, 150, 40], 1); cv.soft(cx - 1.5 * K, cy - 1.5 * K, 3 * K, [255, 250, 220], 0.95);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// The sky: a moon with craters, a sun, a cloud. Each is cut out of a card: a painted disc, its edge a little soft.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function moon(w, h, { seed = 9701, R } = {}) {
  const K = w / 128;
  const rng = new RNG(seed);
  const RR = ramp(R), cv = new Canvas(w, [0, 0, 0], { h, alpha: true }), cx = w / 2, cy = h / 2, rad = 58 * K;
  const f = fbmWH(w, h, seed + 1, 4, 4, 0.55), g = fbmWH(w, h, seed + 2, 18, 2, 0.5), tmp = [0, 0, 0];
  const craters = [];
  for (let i = 0; i < 11; i++) { const a = rng.next() * 6.283, d = Math.sqrt(rng.next()) * rad * 0.8; craters.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r: (4 + rng.next() * 11) * K }); }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy), cov = clamp((rad - r + 0.6) / 1.2);
      if (cov <= 0) continue;
      const rn = r / rad, sph = Math.sqrt(Math.max(0, 1 - rn * rn)), lx = -0.55, ly = -0.55, lz = 0.63;
      const nx = dx / rad, ny = dy / rad, lit = clamp(nx * lx + ny * ly + sph * lz);                  // a sphere lit from the upper left
      let t = 0.32 + 0.5 * lit + (f[y * w + x] - 0.5) * 0.3 + (g[y * w + x] - 0.5) * 0.08;
      for (const c of craters) {
        const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) / c.r;
        if (d < 1.5) { const inside = 1 - smoothstep(0.7, 1, d), rim = smoothstep(0.7, 0.95, d) * (1 - smoothstep(0.95, 1.3, d)); const toLight = ((x + 0.5 - c.x) * lx + (y + 0.5 - c.y) * ly) / (c.r * 0.8); t += -0.2 * inside * (0.5 + 0.5 * clamp(-toLight)) + 0.18 * rim * clamp(-toLight * 0.8 + 0.4); }
      }
      t *= 1 - 0.35 * smoothstep(0.7, 1, rn);                                                          // the limb is darker
      RR(clamp(t), tmp);
      cv.blend(x, y, tmp, cov);
    }
  }
  return cv;
}

export function sunDisc(w, h, { seed = 9801, R } = {}) {
  const K = w / 128;
  const RR = ramp(R), cv = new Canvas(w, [0, 0, 0], { h, alpha: true }), cx = w / 2, cy = h / 2, rad = 58 * K, f = fbmWH(w, h, seed + 1, 6, 3, 0.5), tmp = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy), cov = clamp((rad - r + 0.8) / 1.6);
      if (cov <= 0) continue;
      const rn = r / rad;
      RR(clamp(1.02 - rn * 0.78 + (f[y * w + x] - 0.5) * 0.12 * rn), tmp);
      cv.blend(x, y, tmp, cov);
    }
  }
  return cv;
}

export function cloud(w, h, { seed = 9901 } = {}) {
  const K = w / 256;
  const rng = new RNG(seed);
  const cv = new Canvas(w, [0, 0, 0], { h, alpha: true });
  const base = h * 0.84;
  const lumps = [];
  const xs = [34, 70, 108, 146, 184, 222];
  for (let i = 0; i < xs.length; i++) { const edge = 1 - Math.abs(i - 2.5) / 3.2; lumps.push({ x: xs[i] * K, y: base - (22 + 36 * edge + rng.next() * 10) * K, r: (30 + 26 * edge + rng.next() * 8) * K }); }
  for (let i = 0; i < 8; i++) lumps.push({ x: (22 + i * 30 + rng.next() * 10) * K, y: base - (10 + rng.next() * 12) * K, r: (20 + rng.next() * 10) * K });
  lumps.sort((a, b) => a.y - b.y);
  const sh = [150, 138, 196], mid = [226, 218, 244], hi = [255, 252, 255];
  for (const l of lumps) {
    cv.soft(l.x + l.r * 0.15, l.y + l.r * 0.35, l.r * 1.12, sh, 0.55, l.r);
    cv.soft(l.x, l.y, l.r * 1.02, mid, 1, l.r * 0.98);
    cv.soft(l.x - l.r * 0.18, l.y - l.r * 0.22, l.r * 0.74, hi, 0.95, l.r * 0.68);
  }
  // a flat foot: what is below the base is gone, and the base is shaded
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!cv.a[i]) continue;
      const below = (y - base + 3 * K) / (5 * K);
      if (below > 0) cv.a[i] *= 1 - smoothstep(0, 1, below);
      else { const k = 1 - 0.16 * smoothstep(-16 * K, 0, y - base); cv.px[i * 3] *= k; cv.px[i * 3 + 1] *= k; cv.px[i * 3 + 2] *= Math.min(1.02, k + 0.03); }
    }
  }
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Foam: bubbles of every size, rings with a lit side, on nothing. (A tile with holes in it.)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function foam(n, { seed = 9951 } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const cv = new Canvas(n, [255, 255, 255], { alpha: true, wrap: true });
  const ringc = [240, 248, 255], lit = [255, 255, 255];
  for (let i = 0; i < cnt(46, n); i++) {
    const x = rng.next() * n, y = rng.next() * n, r = (4 + Math.pow(rng.next(), 1.6) * 22) * K;
    cv.soft(x, y, r * 0.98, [220, 236, 252], 0.18);                                                           // the film
    ring(cv, x, y, r, Math.max(2 * K, r * 0.14), ringc, ringc, 0.95);
    ring(cv, x, y, r, Math.max(1.4 * K, r * 0.09), lit, lit, 1, Math.PI * 0.95, Math.PI * 1.65);              // the lit rim, upper left
    cv.soft(x - r * 0.42, y - r * 0.46, Math.max(1.6 * K, r * 0.14), [255, 255, 255], 1);
  }
  for (let i = 0; i < cnt(40, n); i++) cv.soft(rng.next() * n, rng.next() * n, (1.4 + rng.next() * 2) * K, [255, 255, 255], 1);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A whirl: streaks of pale blue light on black, slanting down and to the right, thin at both ends. (Tiles.)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function whirl(n, { seed = 9961 } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const cv = new Canvas(n, [0, 0, 0]);
  for (let i = 0; i < cnt(22, n); i++) {
    const x = rng.next() * n, y = rng.next() * n, len = (50 + rng.next() * 90) * K, a = 0.5 + (rng.next() - 0.5) * 0.18, wd = (1.6 + rng.next() * 2.6) * K, br = 0.45 + rng.next() * 0.55;
    const pts = [[x, y], [x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 + 2 * K], [x + Math.cos(a) * len, y + Math.sin(a) * len]];
    cv.stroke(pts, wd * 3.2, wd * 0.4, [40, 90, 140], [40, 90, 140], 0.35 * br);
    cv.stroke(pts, wd, wd * 0.2, [150, 210, 240], [235, 250, 255], 0.9 * br);
  }
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// The portal's tile: curls of violet with a cyan edge on dark. (Tiles: six curls on a jittered lattice.)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function portalTile(n, { seed = 9971, R } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R), cv = new Canvas(n), f = fbmWH(n, n, seed + 1, 4, 3, 0.5);
  cv.fillWith((x, y, out) => RR(clamp(0.1 + (f[y * n + x] - 0.5) * 0.2), out));
  const cols = 2, rows = 2;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const cx = (i + 0.5 + (rng.next() - 0.5) * 0.25 + (j % 2) * 0.17) * (n / cols), cy = (j + 0.5 + (rng.next() - 0.5) * 0.25) * (n / rows), dir = (i + j) % 2 ? 1 : -1, r0 = 56 * K;
      const pts = [];
      for (let s = 0; s <= 34; s++) { const t = s / 34, ang = dir * (t * 5.2) + rng.next() * 0, r = r0 * (1 - t * 0.9); pts.push([cx + Math.cos(ang + i) * r, cy + Math.sin(ang + i) * r]); }
      cv.stroke(pts, 22 * K, 5 * K, RR(0.45, [0, 0, 0]), RR(0.9, [0, 0, 0]), 0.95);
      cv.stroke(pts, 8 * K, 2 * K, [110, 220, 255], [230, 250, 255], 0.9);
    }
  }
  return cv;
}
