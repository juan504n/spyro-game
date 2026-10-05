// HD painters for plants: leaf canopies, fir boughs and bark. Colours come from a ramp (`R`, dark to light) or a palette, which the registry takes from the pixel twin, so each realm keeps its own trees.
import { Canvas, RNG, clamp, mix, smoothstep, wrapN, ramp, col, fbm, fbmWH, blur, grain, voronoi, cnt } from './kit.js';

/**
 * A leaf, drawn straight into the canvas: a lens shape with a mid-rib, lit on the side that faces the upper left.
 * (x, y) is the stalk end, `ang` the way it points (radians, y down), `lo`/`hi` the colours of its shaded and lit side.
 */
export function leaf(cv, x, y, ang, len, wid, lo, hi, a = 1, rib = 0.35, K = 1) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const ex = x + ca * len, ey = y + sa * len, pad = wid * 0.5 + 1.5;
  const x0 = Math.floor(Math.min(x, ex) - pad), x1 = Math.ceil(Math.max(x, ex) + pad), y0 = Math.floor(Math.min(y, ey) - pad), y1 = Math.ceil(Math.max(y, ey) + pad);
  const lit = (0.7 * sa - 0.7 * ca) >= 0 ? 1 : -1;                               // which side of the leaf (v > 0 or v < 0) faces the light
  const tmp = [0, 0, 0], inv = 1 / len, hw = wid / 2;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - x, dy = py + 0.5 - y;
      const u = dx * ca + dy * sa;
      if (u < -0.5 || u > len + 0.5) continue;
      const v = -dx * sa + dy * ca, s = u * inv;
      const half = s <= 0 || s >= 1 ? 0 : hw * 2 * Math.sqrt(s * (1 - s));         // an ellipse, a little pointed by the root
      const av = v < 0 ? -v : v, edge = half - av;
      if (edge < -0.6) continue;
      const cov = edge > 0.6 ? 1 : (edge + 0.6) / 1.2;
      const side = half > 0.2 ? clamp((v * lit) / half, -1, 1) : 0;               // -1 (shade) .. 1 (light)
      let t = 0.5 + side * 0.4 + (1 - s) * 0.08;
      if (av < 0.55 * K) t -= rib * 0.5 * (1 - s * 0.6);                          // the mid-rib
      if (edge < 2.4 * K) t += side > 0 ? 0.08 : -0.3 * (1 - edge / (2.4 * K));   // a lit rim, and a dark edge on the shaded side
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      tmp[0] = lo[0] + (hi[0] - lo[0]) * t; tmp[1] = lo[1] + (hi[1] - lo[1]) * t; tmp[2] = lo[2] + (hi[2] - lo[2]) * t;
      cv.blend(px, py, tmp, cov * a);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Canopy: a mass of leaves in three layers, lumped (a broad height field lights the lumps from the upper left), dark where the layers part.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function canopy(n, { seed = 4101, R, lumps = 5, leafLen = 20, leafWid = 11, density = 1, spark = 0.4, flecks = null, mean = null, contrast = 1 } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R);
  const cv = new Canvas(n);
  const H = fbm(n, seed + 1, lumps, 3, 0.5), G = fbm(n, seed + 2, lumps * 3, 2, 0.5);
  const Hs = blur(H, n, Math.max(1, Math.round(3 * K)));
  cv.fillWith((x, y, out) => RR(0.04 + 0.12 * Hs[y * n + x], out));
  const layers = [
    { count: 520, tone: 0.18, spread: 0.5, size: 1.3 },
    { count: 820, tone: 0.4, spread: 0.55, size: 1.05 },
    { count: 1250, tone: 0.64, spread: 0.5, size: 0.85 },
  ];
  const lo = [0, 0, 0], hi = [0, 0, 0];
  for (const L of layers) {
    const num = cnt(L.count * density, n);
    for (let i = 0; i < num; i++) {
      const x = rng.next() * n, y = rng.next() * n, k = Math.floor(y) * n + Math.floor(x);
      const t = clamp(L.tone + (Hs[k] - 0.5) * L.spread * contrast + (G[k] - 0.5) * 0.12 + (rng.next() - 0.5) * 0.16);
      RR(clamp(t - 0.2), lo); RR(clamp(t + 0.18), hi);
      leaf(cv, x, y, rng.next() * Math.PI * 2, leafLen * L.size * K * (0.8 + rng.next() * 0.45), leafWid * L.size * K * (0.8 + rng.next() * 0.4), lo.slice(), hi.slice(), 0.97, 0.35, K);
    }
  }
  cv.shade(Hs.map((v) => v * 5), 1.1 * contrast);                                // the lumps
  // the tops of the lumps catch the light
  if (spark) {
    const top = [0, 0, 0]; RR(1, top);
    for (let i = 0; i < cnt(90, n); i++) { const x = rng.next() * n, y = rng.next() * n, k = Math.floor(y) * n + Math.floor(x); if (Hs[k] > 0.5) cv.soft(x, y, (2 + rng.next() * 2.4) * K, top, spark * (0.5 + rng.next() * 0.5), (1.2 + rng.next()) * K); }
  }
  if (flecks) {                                                                  // blossom, fruit, berries: dots of another colour with a lit side
    const fc = col(flecks.color), fl = col(flecks.light || '#ffffff');
    for (let i = 0; i < flecks.count; i++) {
      const x = rng.next() * n, y = rng.next() * n, r = (flecks.size || 3) * K * (0.8 + rng.next() * 0.5);
      cv.soft(x + K, y + 1.4 * K, r * 1.3, [20, 10, 20], 0.35); cv.soft(x, y, r, fc, 1); cv.soft(x - r * 0.25, y - r * 0.3, r * 0.5, fl, 0.8);
    }
  }
  cv.modulate(grain(n, seed + 9, n / 2, 0.03));
  if (mean) cv.matchMean(mean, 0.92);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Fir: sprays of needles (a rib, needles down and out, shorter at the top), a dark layer behind and a lit one in front, tips lit.
// ---------------------------------------------------------------------------------------------------------------------------------------------
function spray(cv, rng, cx, y0, H, pal, K, big) {
  const steps = big ? 17 : 14;
  cv.soft(cx + K * 3, y0 + H * 0.58, H * 0.5, pal.shade, 0.75, H * 0.66);       // the body of the spray, dark beneath the needles
  const bend = (rng.next() - 0.5) * 6 * K;
  cv.stroke([[cx, y0], [cx + bend * 0.5, y0 + H * 0.5], [cx + bend, y0 + H]], 3.4 * K, 1.6 * K, pal.mid, pal.back, 1);
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.4) / steps, y = y0 + t * H, rx = cx + bend * t * 1.1;
    for (const side of [-1, 1]) {
      for (let q = 0; q < 3; q++) {
        const len = (6 + (big ? 26 : 22) * Math.pow(t, 0.85)) * K * (q === 1 ? 0.8 : q === 2 ? 0.6 : 1) * (0.9 + rng.next() * 0.2);
        const drop = 0.5 + 0.38 * (1 - t) + (rng.next() - 0.5) * 0.25 + q * 0.17;     // the angle below the horizontal
        const dir = side < 0 ? Math.PI - drop : drop, ca = Math.cos(dir), sa = Math.sin(dir);
        const sag = len * 0.2;
        const pts = [[rx, y], [rx + ca * len * 0.5, y + sa * len * 0.5 + sag * 0.3], [rx + ca * len, y + sa * len + sag]];
        const lit = side < 0;
        cv.stroke(pts, (q === 0 ? 3.6 : 3) * K, 0.7 * K, lit ? pal.mid : pal.back, lit ? (t > 0.2 && rng.next() < 0.65 ? pal.tip : pal.light) : (rng.next() < 0.5 ? pal.mid : pal.back), 0.97);
      }
    }
  }
}

export function fir(n, { seed = 4501, P, mean = null, cols = 4, rows = 4 } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const pal = { shade: col(P.shade), back: col(P.back), mid: col(P.mid), light: col(P.light), tip: col(P.tip) };
  const cv = new Canvas(n, pal.shade);
  const mott = fbm(n, seed + 1, 4, 3, 0.5);
  cv.tint(mott.map((v) => smoothstep(0.45, 0.8, v)), pal.back, 0.5);             // the ground the sprays lie on is not flat
  const dark = { shade: pal.shade, back: pal.shade, mid: pal.back, light: pal.mid, tip: pal.light };       // the layer behind: the same, one step darker
  const cw = n / cols, rh = n / rows;
  for (let t = 0; t < rows; t++) for (let q = 0; q < cols; q++) spray(cv, rng, (q + 1 + (t % 2) * 0.5) * cw + (rng.next() - 0.5) * 8 * K, (t + 0.5) * rh - rh * 0.5 + (rng.next() - 0.5) * 6 * K, rh * 1.15, dark, K, false);
  for (let t = 0; t < rows; t++) for (let q = 0; q < cols; q++) spray(cv, rng, (q + 0.5 + (t % 2) * 0.5) * cw + (rng.next() - 0.5) * 8 * K, t * rh + (rng.next() - 0.5) * 6 * K, rh * 1.15, pal, K, true);
  cv.modulate(grain(n, seed + 9, n / 2, 0.035));
  if (mean) cv.matchMean(mean, 0.92);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Bark: long upright ridges split by furrows that wander, branch and close, with grain along them; moss in patches (or, for pale bark, dark dashes across it).
// (Painted square, with features wide, and squeezed to the trunk's texture: see attachHD.)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function bark(n, { seed = 4601, R, moss = null, mossAmount = 0.5, furrows = 9, depth = 1, dashes = 0, dashColor = [40, 34, 30], mean = null, contrast = 1 } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R);
  const cv = new Canvas(n);
  const A = fbm(n, seed + 1, furrows, 3, 0.5, 2), B = fbm(n, seed + 5, furrows * 2, 2, 0.5, 4), sway = fbm(n, seed + 2, 3, 2, 0.5);
  const fibre = fbm(n, seed + 3, 44, 3, 0.55, 3), blot = fbm(n, seed + 4, 4, 3);
  const height = new Float32Array(n * n), mossM = new Float32Array(n * n);
  cv.fillWith((x, y, out) => {
    const k = y * n + x;
    const ridgeA = 1 - Math.abs(A[k] * 2 - 1), ridgeB = 1 - Math.abs(B[k] * 2 - 1);
    const furrow = Math.max(smoothstep(0.8, 0.97, ridgeA), 0.7 * smoothstep(0.88, 0.99, ridgeB)) * depth;          // thin dark grooves
    const round = smoothstep(0.35, 0.8, ridgeA);                                  // the ridge swells between the grooves
    const t = 0.52 + (fibre[k] - 0.5) * 0.4 * contrast + (blot[k] - 0.5) * 0.22 + (sway[k] - 0.5) * 0.12 - round * 0.06 - furrow * 0.42;
    RR(clamp(t), out);
    height[k] = (1 - round) * 0.7 - furrow * 0.9 + (fibre[k] - 0.5) * 0.1;
    mossM[k] = smoothstep(0.64, 0.82, blot[k]) * (1 - furrow * 0.7);
  });
  cv.shade(height, 1.6);
  if (moss) cv.tint(mossM, col(moss), mossAmount);
  if (dashes) {                                                                  // lenticels: short dark dashes across the bark
    for (let i = 0; i < cnt(dashes, n); i++) {
      const x = rng.next() * n, y = rng.next() * n, l = (7 + rng.next() * 20) * K;
      cv.stroke([[x, y], [x + l * 0.5, y + (rng.next() - 0.5) * 1.5 * K], [x + l, y]], (1.8 + rng.next() * 1.6) * K, 0.8 * K, dashColor, dashColor, 0.45 + rng.next() * 0.35);
    }
  }
  cv.modulate(grain(n, seed + 9, n / 2, 0.03));
  if (mean) cv.matchMean(mean, 0.92);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Moss: cushions heaped on one another, back to front, each lit from the upper left with a dark rim and a shadow under it, fuzz on top.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function moss(n, { seed = 1301, R, count = 190, size = [12, 26], fuzz = 22, mean = null, contrast = 1 } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R);
  const cv = new Canvas(n);
  const f = fbm(n, seed + 1, 4, 3, 0.5), g = fbm(n, seed + 2, 24, 2, 0.5);
  cv.fillWith((x, y, out) => { const k = y * n + x; RR(clamp(0.26 + ((f[k] - 0.5) * 0.3 + (g[k] - 0.5) * 0.14) * contrast), out); });
  const pads = [];
  for (let i = 0; i < cnt(count, n); i++) pads.push({ x: rng.next() * n, y: rng.next() * n, r: (size[0] + rng.next() * (size[1] - size[0])) * K, t: 0.36 + rng.next() * 0.26 });
  pads.sort((a, b) => a.y - b.y);
  const c0 = [0, 0, 0], c1 = [0, 0, 0], c2 = [0, 0, 0];
  for (const p of pads) {
    const r = p.r, t = clamp(p.t + (f[(Math.floor(p.y) % n) * n + (Math.floor(p.x) % n)] - 0.5) * 0.3 * contrast);
    cv.soft(p.x + r * 0.3, p.y + r * 0.5, r * 1.25, [6, 12, 8], 0.42, r * 0.95);
    cv.soft(p.x, p.y, r, RR(clamp(t - 0.22), c0), 1, r * 0.88);
    cv.soft(p.x - r * 0.08, p.y - r * 0.12, r * 0.88, RR(t, c1), 0.98, r * 0.76);
    cv.soft(p.x - r * 0.3, p.y - r * 0.36, r * 0.52, RR(clamp(t + 0.12), c2), 0.6, r * 0.38);
    for (let q = 0; q < Math.max(4, Math.round(fuzz * K * K)); q++) {                // fuzz: tips of moss on the cushion, lit on the upper left
      const a = rng.next() * 6.283, d = Math.sqrt(rng.next()) * r * 0.78, x = p.x + Math.cos(a) * d - r * 0.06, y = p.y + Math.sin(a) * d * 0.85 - r * 0.1;
      const lit = clamp(0.5 - (Math.cos(a) + Math.sin(a)) * 0.35 * (d / r) + (rng.next() - 0.5) * 0.3);
      cv.soft(x, y, (0.9 + rng.next() * 0.9) * K, RR(clamp(t + 0.03 + lit * 0.14), [0, 0, 0]), 0.7);
    }
  }
  for (let i = 0; i < cnt(3, n); i++) {                                                    // a twig or two and some pale wet glints
    const x = rng.next() * n, y = rng.next() * n;
    cv.stroke([[x, y], [x + 14 * K, y + 5 * K], [x + 26 * K, y + 7 * K]], 2.4 * K, 1.4 * K, [58, 40, 26], [88, 62, 40], 0.9);
  }
  for (let i = 0; i < cnt(24, n); i++) cv.soft(rng.next() * n, rng.next() * n, 1.2 * K, [214, 236, 200], 0.5);
  cv.modulate(grain(n, seed + 9, n / 2, 0.035));
  if (mean) cv.matchMean(mean, 0.92);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A mushroom's cap: a dome from a pale crown to a deep skirt, a scalloped frill of violet, cream spots in staggered rows. (It wraps round the cap: u is a full turn.)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function mushroomCap(w, h, { seed = 4801, T, V } = {}) {
  const K = w / 256;
  const rng = new RNG(seed);
  const TR = ramp(T), VR = ramp(V), cv = new Canvas(w, [0, 0, 0], { h });
  const f = fbmWH(w, h, seed + 1, 4, 3, 0.5, 3), g = fbmWH(w, h, seed + 2, 28, 2, 0.5, 6);
  const tmp = [0, 0, 0], height = new Float32Array(w * h);
  cv.fillWith((x, y, out) => {
    const k = y * w + x, u = x / w, v = y / h;
    const frac = (u * 4) % 1, edge = 0.84 - 0.07 * Math.sqrt(Math.max(0, 1 - Math.pow(2 * frac - 1, 2)));      // a frill of rounded scallops
    if (v < edge) {
      const t = 1 - v / 0.84;                                                                                     // 1 at the crown, 0 at the frill
      TR(clamp(0.18 + 0.7 * t + (f[k] - 0.5) * 0.12 + (g[k] - 0.5) * 0.06), out);
      height[k] = t * 0.3;
    } else {
      const d = (v - edge) / (1 - edge);                                                                          // 0 at the rim of the frill, 1 at the bottom
      VR(clamp(0.95 - d * 0.9 + (g[k] - 0.5) * 0.12), out);
      const gill = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 48);
      out[0] *= 0.88 + 0.12 * gill; out[1] *= 0.88 + 0.12 * gill; out[2] *= 0.88 + 0.12 * gill;
      height[k] = -0.2 + (1 - d) * 0.15;
    }
  });
  cv.shade(height, 1.4);
  const spots = [[4, 6, 3], [15, 4, 2.3], [26, 7, 3.2], [9, 14, 2.6], [21, 15, 3], [31, 13, 2.2], [3, 20, 2], [14, 21, 2.4], [27, 21, 2]];
  for (const [sx, sy, r] of spots) {
    const x = (sx / 32) * w, y = (sy / 32) * h * 0.97, R = r * 8.4 * K;
    cv.soft(x + 3 * K, y + 4 * K, R * 1.12, [10, 60, 62], 0.4, R * 1.0);
    cv.soft(x, y, R, col('#c8bc9c'), 1, R * 0.94);
    cv.soft(x - R * 0.12, y - R * 0.14, R * 0.86, col('#efe5ca'), 1, R * 0.8);
    cv.soft(x - R * 0.34, y - R * 0.4, R * 0.36, [255, 252, 240], 0.9);
  }
  cv.modulate(grain(w, seed + 9, w / 2, 0.025, h));
  return cv;
}

export function mushroomStem(w, h, { seed = 4901 } = {}) {
  const K = w / 128;
  const rng = new RNG(seed);
  const cv = new Canvas(w, [0, 0, 0], { h, ref: 128 });
  const fib = fbmWH(w, h, seed + 1, 22, 3, 0.55, 2), fib2 = fbmWH(w, h, seed + 2, 8, 2, 0.5, 2), dirt = fbmWH(w, h, seed + 3, 10, 3, 0.55, 5);
  const base = ramp(['#9a8c78', '#c8bc9e', '#dccfb2', '#f0e6cc', '#fff8e6']), soil = ramp(['#4a3a2e', '#6a5a4a', '#8a7a6a', '#b8a890']), height = new Float32Array(w * h);
  cv.fillWith((x, y, out) => {
    const k = y * w + x, v = y / h, u = x / w;
    base(clamp(0.55 + (fib[k] - 0.5) * 0.4 + (fib2[k] - 0.5) * 0.2 + 0.1 * Math.sin(u * Math.PI * 2 + 0.6)), out);       // fibres run up the stalk; it is a little rounder in the middle of the card
    if (v < 0.18) { const gill = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 24); out[0] = mix(out[0], 168 + 28 * gill, 0.55 * (1 - v / 0.18)); out[1] = mix(out[1], 150 + 30 * gill, 0.55 * (1 - v / 0.18)); out[2] = mix(out[2], 176 + 26 * gill, 0.55 * (1 - v / 0.18)); }
    const collar = Math.exp(-Math.pow((v - 0.3) / 0.025, 2));
    height[k] = collar * 0.8;
    const foot = smoothstep(0.62, 0.98, v) * (0.7 + 0.5 * dirt[k]);
    if (foot > 0) { const sc = soil(clamp(0.2 + 0.6 * dirt[k])); out[0] = mix(out[0], sc[0], clamp(foot)); out[1] = mix(out[1], sc[1], clamp(foot)); out[2] = mix(out[2], sc[2], clamp(foot)); }
  });
  cv.shade(height, 1.2);
  cv.modulate(grain(w, seed + 9, w / 2, 0.03, h));
  return cv;
}
