// HD painters for the loose ground: earth and ash paths, sand, snow, haze for far rock. Colours come from a ramp (`R`, dark to light), which the registry takes from the pixel twin, so each realm keeps its own.
import { Canvas, RNG, clamp, mix, smoothstep, wrapN, ramp, col, fbm, blur, grain, cnt } from './kit.js';

/** a stone on the ground: a shadow, a body shaded from the upper left, a bright spot and a dark underside */
function pebble(cv, x, y, r, base, light, dark, squash = 0.8) {
  cv.soft(x + r * 0.35, y + r * 0.5, r * 1.2, [10, 8, 14], 0.32, r * 0.9 * squash);
  cv.soft(x, y, r, dark, 1, r * squash);
  cv.soft(x - r * 0.1, y - r * 0.12, r * 0.88, base, 0.98, r * 0.8 * squash);
  cv.soft(x - r * 0.3, y - r * 0.35, r * 0.5, light, 0.85, r * 0.4 * squash);
}

function flecks(cv, rng, count, c, a, rmin = 0.7, rmax = 1.5) {
  const K = cv.n / 256, total = cnt(count, cv.n);                              // (a count for 256 px; the size of a fleck is in pixels and scales too)
  rmin *= K; rmax *= K;
  for (let i = 0; i < total; i++) { const r = rmin + rng.next() * (rmax - rmin); cv.soft(rng.next() * cv.n, rng.next() * cv.n, r, c, a, r * (0.6 + rng.next() * 0.6)); }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Soil: earth, ash, trodden snow: mottled, with pebbles, flecks and cracks, and (for a path) ruts that run along the tile.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function soil(n, { seed = 31, R, mottle = 4, pebbles = 12, pebbleSize = [3, 8], pebbleRamp = null, light = [236, 230, 244], dark = [24, 20, 30], flecksN = 160, cracks = 3, ruts = 0, mean = null, crackColor = [30, 22, 18], contrast = 0.8, grit = 0.04 } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R);
  const cv = new Canvas(n);
  const f = fbm(n, seed + 1, mottle, 3, 0.55), f2 = fbm(n, seed + 2, mottle * 4, 3, 0.5), f3 = fbm(n, seed + 3, 40, 2);
  const rut = ruts ? fbm(n, seed + 4, 3, 2, 0.5, 6) : null;
  cv.fillWith((x, y, out) => {
    const k = y * n + x;
    let t = 0.5 + ((f[k] - 0.5) * 0.44 + (f2[k] - 0.5) * 0.5 + (f3[k] - 0.5) * 0.16) * contrast;
    if (ruts) {                                                              // two shallow ruts along the tile, wobbling
      const v = y / n + (rut[k] - 0.5) * 0.06;
      const r1 = Math.exp(-Math.pow((v - 0.3) / 0.07, 2)), r2 = Math.exp(-Math.pow((v - 0.72) / 0.07, 2));
      t -= 0.2 * (r1 + r2) * ruts;
    }
    RR(clamp(t), out);
  });
  const pr = pebbleRamp ? ramp(pebbleRamp) : RR, tmp = [0, 0, 0], tmp2 = [0, 0, 0], tmp3 = [0, 0, 0];
  for (let i = 0; i < cnt(pebbles, n); i++) {
    const r = (pebbleSize[0] + rng.next() * (pebbleSize[1] - pebbleSize[0])) * K, t = 0.45 + rng.next() * 0.4;
    pebble(cv, rng.next() * n, rng.next() * n, r, pr(t, [0, 0, 0]), pr(Math.min(1, t + 0.28), [0, 0, 0]), pr(Math.max(0, t - 0.35), [0, 0, 0]), 0.65 + rng.next() * 0.3);
  }
  flecks(cv, rng, Math.round(flecksN), light, 0.55);
  flecks(cv, rng, Math.round(flecksN * 0.6), dark, 0.4);
  for (let i = 0; i < cnt(cracks, n); i++) {
    const pts = [[rng.next() * n, rng.next() * n]];
    let a = rng.next() * 6.28;
    for (let s = 1; s <= 6; s++) { a += (rng.next() - 0.5) * 1.2; pts.push([pts[s - 1][0] + Math.cos(a) * 6 * K, pts[s - 1][1] + Math.sin(a) * 6 * K]); }
    cv.stroke(pts, 1.8 * K, 0.4 * K, crackColor, crackColor, 0.55);
  }
  cv.modulate(grain(n, seed + 9, n / 2, 0.04));
  if (grit) cv.modulate(grain(n, seed + 10, n, grit));
  if (mean) cv.matchMean(mean, 0.9);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Dunes: sand with ripples that run along the tile, big soft shadows and glints; shells and pebbles if asked.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function dunes(n, { seed = 41, R, ripples = 7, sheen = 0, sheenPow = 6, glints = 14, shells = 0, pebbles = 0, mean = null, contrast = 1 } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R);
  const cv = new Canvas(n);
  const f = fbm(n, seed + 1, 3, 3, 0.55), warpF = fbm(n, seed + 2, 4, 2), f3 = fbm(n, seed + 3, 28, 2);
  const crest = new Float32Array(n * n), height = new Float32Array(n * n);
  const fine = fbm(n, seed + 4, 6, 2);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const k = y * n + x;
      const ph = (y / n) * ripples * 2 + (warpF[k] - 0.5) * 0.9 + x / n;                     // ripples: nearly straight lines, tilted by one wave across the tile (a whole number: it must wrap) and a little wavy
      const s = Math.sin(ph * 2 * Math.PI);
      const body = smoothstep(0.38, 0.62, fine[k]);                                          // the ripples are not everywhere: they lie in patches on the dune
      crest[k] = Math.max(0, s) * body;
      height[k] = s * 0.075 * body + f[k] * 1.5;
    }
  }
  cv.fillWith((x, y, out) => { const k = y * n + x; RR(clamp(0.5 + ((f[k] - 0.5) * 0.58 + (f3[k] - 0.5) * 0.2) * contrast), out); });
  cv.shade(height, 2.4);
  if (sheen) cv.tint(crest.map((v) => Math.pow(v, sheenPow)), [255, 252, 236], sheen);
  const light = [255, 250, 232], dark = [60, 48, 30];
  flecks(cv, rng, 120, light, 0.4);
  flecks(cv, rng, 60, dark, 0.3);
  for (let i = 0; i < cnt(glints, n); i++) {
    const x = rng.next() * n, y = rng.next() * n;
    cv.soft(x, y, 1.6 * K, [255, 255, 250], 1);
    cv.soft(x, y, 4.5 * K, [255, 255, 240], 0.5, 0.9 * K);
    cv.soft(x, y, 0.9 * K, [255, 255, 240], 0.5, 4.5 * K);
  }
  const tmp = [0, 0, 0];
  for (let i = 0; i < cnt(shells, n); i++) {
    const x = rng.next() * n, y = rng.next() * n, r = (3 + rng.next() * 2.4) * K;
    cv.soft(x + 1.5 * K, y + 2 * K, r * 1.1, [30, 24, 16], 0.3, r * 0.8);
    cv.soft(x, y, r, RR(0.85, tmp), 1, r * 0.85);
    cv.soft(x - r * 0.25, y - r * 0.3, r * 0.5, [255, 250, 240], 0.9, r * 0.4);
    cv.stroke([[x - r * 0.6, y], [x, y - r * 0.2], [x + r * 0.6, y]], 1 * K, 0.6 * K, RR(0.3, [0, 0, 0]), RR(0.3, [0, 0, 0]), 0.5);
  }
  for (let i = 0; i < cnt(pebbles, n); i++) {
    const r = (2.5 + rng.next() * 4) * K;
    pebble(cv, rng.next() * n, rng.next() * n, r, RR(0.4, [0, 0, 0]), RR(0.8, [0, 0, 0]), RR(0.05, [0, 0, 0]));
  }
  cv.modulate(grain(n, seed + 9, n / 2, 0.035));
  if (mean) cv.matchMean(mean, 0.9);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Drifts: snow and ash laid in soft drifts, lit from the upper left, with fine wind ripples, hollows tinted by the shadow colour, glints and (for ash) clinker.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function drifts(n, { seed = 51, R, hollow = null, hollowAmount = 0.5, ripples = 22, rippleAmount = 0.15, glints = 10, clinker = 0, clinkerColor = [40, 34, 34], embers = 0, petals = null, mean = null, contrast = 1, grit = 0.03, clump = 0 } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R);
  const cv = new Canvas(n);
  const big = fbm(n, seed + 1, 3, 3, 0.5), mid = fbm(n, seed + 2, 8, 3, 0.5), warpF = fbm(n, seed + 3, 4, 2);
  const height = new Float32Array(n * n), hollowM = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const k = y * n + x;
      const ph = (x / n * 0.4 + y / n) * ripples + (warpF[k] - 0.5) * 3;
      height[k] = big[k] * 1.5 + mid[k] * 0.55 + Math.sin(ph * 2 * Math.PI) * 0.012 * rippleAmount * 4;
      hollowM[k] = smoothstep(0.5, 0.22, big[k]) * 0.8;
    }
  }
  cv.fillWith((x, y, out) => { const k = y * n + x; RR(clamp(0.58 + ((big[k] - 0.5) * 0.6 + (mid[k] - 0.5) * 0.3) * contrast), out); });
  cv.shade(height, 3.0);
  if (hollow) cv.tint(hollowM, col(hollow), hollowAmount);
  for (let i = 0; i < cnt(clinker, n); i++) {
    const x = rng.next() * n, y = rng.next() * n, r = (1.5 + rng.next() * 3.5) * K;
    pebble(cv, x, y, r, clinkerColor, [140, 124, 120], [14, 10, 12], 0.7);
  }
  for (let i = 0; i < cnt(embers, n); i++) {
    const x = rng.next() * n, y = rng.next() * n;
    cv.soft(x, y, 5 * K, [255, 120, 30], 0.35); cv.soft(x, y, 1.8 * K, [255, 220, 120], 0.95);
  }
  if (petals) {
    const pc = col(petals);
    for (let i = 0; i < cnt(16, n); i++) { const x = rng.next() * n, y = rng.next() * n; cv.soft(x, y, 3.2 * K, pc, 0.95, 1.8 * K); cv.soft(x - K, y - 0.6 * K, 1.4 * K, [255, 238, 244], 0.7, 0.8 * K); }
  }
  for (let i = 0; i < cnt(glints, n); i++) {
    const x = rng.next() * n, y = rng.next() * n;
    cv.soft(x, y, 1.4 * K, [255, 255, 255], 1);
    cv.soft(x, y, 4 * K, [255, 255, 255], 0.45, 0.8 * K);
    cv.soft(x, y, 0.8 * K, [255, 255, 255], 0.45, 4 * K);
  }
  flecks(cv, rng, 100, [255, 255, 255], 0.3);
  if (clump) { const cl = fbm(n, seed + 7, 14, 3, 0.55); cv.modulate(cl.map((v) => (v - 0.5) * 2), clump); }       // crumbly: the ash lies in clods
  cv.modulate(grain(n, seed + 9, n / 2, 0.03));
  if (grit) cv.modulate(grain(n, seed + 10, n, grit));
  if (mean) cv.matchMean(mean, 0.9);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Haze: far rock, soft: a few close colours with wide mottling and no detail.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function haze(n, { seed = 61, R, mean = null } = {}) {
  const RR = ramp(R);
  const cv = new Canvas(n);
  const f = fbm(n, seed + 1, 3, 3, 0.55), g = fbm(n, seed + 2, 9, 2, 0.5);
  cv.fillWith((x, y, out) => { const k = y * n + x; RR(clamp(0.5 + (f[k] - 0.5) * 0.7 + (g[k] - 0.5) * 0.18), out); });
  cv.modulate(grain(n, seed + 9, n / 2, 0.015));
  if (mean) cv.matchMean(mean, 0.95);
  return cv;
}
