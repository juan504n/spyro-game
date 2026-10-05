// HD painters for liquids and the things that look like them: water (ripples, caustics, glints), a waterfall, lava (plates of crust over glowing cracks), a sea of cloud and a pane of glass.
import { Canvas, RNG, clamp, mix, smoothstep, ramp, col, fbm, blur, grain, voronoi } from './kit.js';

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Water: swells, long wavelets that catch the light, a web of caustic lines, and glints.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function water(n, { seed = 201, R, caustic = 0.34, streaks = 0.6, glints = 14, glintColor = [255, 255, 255], mean = null, contrast = 1 } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R);
  const cv = new Canvas(n);
  const swell = fbm(n, seed + 1, 3, 4, 0.5), wave = fbm(n, seed + 2, 3, 3, 0.55, 14), c1 = fbm(n, seed + 3, 5, 3, 0.5), c2 = fbm(n, seed + 4, 8, 3, 0.5), fine = fbm(n, seed + 5, 18, 2, 0.5, 40);
  const height = new Float32Array(n * n), light = RR(1, [0, 0, 0]), tmp = [0, 0, 0];
  cv.fillWith((x, y, out) => {
    const k = y * n + x;
    const web = Math.max(Math.pow(1 - Math.abs(c1[k] * 2 - 1), 9), Math.pow(1 - Math.abs(c2[k] * 2 - 1), 9)) * (0.4 + 0.6 * swell[k]);
    const t = 0.44 + (swell[k] - 0.5) * 0.55 * contrast + (wave[k] - 0.5) * 0.3 + (fine[k] - 0.5) * 0.1;
    RR(clamp(t), out);
    const hi = clamp(web * caustic + smoothstep(0.64, 0.8, wave[k]) * streaks * 0.8 + smoothstep(0.7, 0.9, fine[k]) * 0.2);
    out[0] = mix(out[0], light[0], hi); out[1] = mix(out[1], light[1], hi); out[2] = mix(out[2], light[2], hi);
    height[k] = swell[k] * 1.1 + wave[k] * 0.45;
  });
  cv.shade(height, 1.1);
  for (let i = 0; i < glints; i++) {                                              // four-pointed glints
    const x = rng.next() * n, y = rng.next() * n, s = 0.7 + rng.next() * 0.6;
    cv.soft(x, y, 1.6 * K * s, glintColor, 1);
    cv.soft(x, y, 5.5 * K * s, glintColor, 0.5, 0.9 * K);
    cv.soft(x, y, 0.9 * K, glintColor, 0.5, 5.5 * K * s);
  }
  cv.modulate(grain(n, seed + 9, n / 2, 0.02));
  if (mean) cv.matchMean(mean, 0.92);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A waterfall: long streaks that fall, a few white threads and a haze. (Painted square and squeezed to its shape.)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function fall(n, { seed = 251, R, mean = null } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R);
  const cv = new Canvas(n);
  const S = fbm(n, seed + 1, 30, 3, 0.55, 2), T = fbm(n, seed + 2, 70, 2, 0.5, 5), bands = fbm(n, seed + 3, 3, 2, 0.5, 9), sway = fbm(n, seed + 4, 4, 2, 0.5);
  cv.fillWith((x, y, out) => {
    const k = y * n + x;
    const t = 0.5 + (S[k] - 0.5) * 0.7 + (T[k] - 0.5) * 0.25 + (bands[k] - 0.5) * 0.25;
    RR(clamp(t), out);
    const w = smoothstep(0.62, 0.85, T[k]) * (0.5 + 0.5 * bands[k]);
    out[0] = mix(out[0], 255, w * 0.8); out[1] = mix(out[1], 255, w * 0.85); out[2] = mix(out[2], 255, w * 0.9);
  });
  cv.modulate(grain(n, seed + 9, n / 2, 0.025));
  if (mean) cv.matchMean(mean, 0.92);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Lava: plates of dark crust, raised, over cracks that glow from white-hot in the middle to red at the rim, and a warm bloom on the crust round them.
// ---------------------------------------------------------------------------------------------------------------------------------------------
const CRUST = ['#140707', '#2a110c', '#46190f', '#6a2a18'];
const GLOW = ['#5a0e06', '#a82a0e', '#e85a14', '#ff9a2a', '#ffd25e', '#fff2b0'];
export function lava(n, { seed = 211, cells = 5, crust = CRUST, glow = GLOW, mean = null, meanAmount = 0.55 } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const CR = ramp(crust), GL = ramp(glow);
  const cv = new Canvas(n);
  const vor = voronoi(n, cells, cells, seed, 0.95, 0);
  const small = voronoi(n, cells * 3, cells * 3, seed + 7, 0.95, 0);
  const wob = fbm(n, seed + 1, 7, 3, 0.5), wob2 = fbm(n, seed + 6, 14, 2, 0.5), grit = fbm(n, seed + 2, 30, 2, 0.5), mott = fbm(n, seed + 3, 4, 3, 0.5), pulse = fbm(n, seed + 4, 3, 2, 0.5);
  const height = new Float32Array(n * n), cmid = [0, 0, 0], gmid = [0, 0, 0];
  cv.fillWith((x, y, out) => {
    const k = y * n + x;
    const d = (vor.f2[k] - vor.f1[k]) / 2 + (wob[k] - 0.5) * 9 * K + (wob2[k] - 0.5) * 4 * K;       // distance to the crack, wobbling
    const ds = (small.f2[k] - small.f1[k]) / 2 + (wob2[k] - 0.5) * 3 * K;                           // the crust's own fine cracks
    const heat = Math.exp(-Math.max(0, d) / (4 * K)) * (0.7 + 0.5 * pulse[k]);
    const core = 1 - smoothstep(0, 1.8 * K, d);
    CR(clamp(0.32 + (mott[k] - 0.5) * 0.5 + (grit[k] - 0.5) * 0.4 + 0.2 * smoothstep(0, 38 * K, vor.f1[k]) - 0.35 * (1 - smoothstep(0, 1.6 * K, ds))), cmid);
    const warmFine = (1 - smoothstep(0, 2.4 * K, ds)) * 0.16 * (0.5 + pulse[k]);                      // a thread of red in the fine cracks
    const h = clamp(heat * 1.0 + core * 0.4 + warmFine);
    GL(h, gmid);
    const a = smoothstep(0.1, 0.55, h);
    out[0] = mix(cmid[0], gmid[0], a); out[1] = mix(cmid[1], gmid[1], a); out[2] = mix(cmid[2], gmid[2], a);
    height[k] = smoothstep(0, 7 * K, d) * 0.8 + (grit[k] - 0.5) * 0.14 - (1 - smoothstep(0, 1.6 * K, ds)) * 0.15;
  });
  cv.shade(height, 1.2);
  for (let i = 0; i < 26; i++) {                                                  // flecks of crust in the cracks and sparks on the plates
    const x = rng.next() * n, y = rng.next() * n;
    if (rng.next() < 0.45) cv.soft(x, y, (1 + rng.next() * 1.4) * K, [255, 200, 100], 0.65);
    else cv.soft(x, y, (1.5 + rng.next() * 2) * K, [20, 8, 6], 0.5, (1 + rng.next()) * K);
  }
  cv.modulate(grain(n, seed + 9, n / 2, 0.03));
  if (mean) cv.matchMean(mean, meanAmount);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Billows: the tops of cloud, in soft lumps lit from the upper left, with shadows tinted by the low end of the ramp. (Painted square and squeezed if the twin is not square.)
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function billows(n, { seed = 221, R, mean = null, contrast = 1 } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R);
  const cv = new Canvas(n);
  const big = fbm(n, seed + 1, 4, 4, 0.5), mid = fbm(n, seed + 2, 9, 3, 0.5), wisp = fbm(n, seed + 3, 3, 3, 0.55, 12);
  const height = new Float32Array(n * n), hs = blur(big, n, 4);
  cv.fillWith((x, y, out) => {
    const k = y * n + x;
    const h = smoothstep(0.25, 0.75, big[k]) * 0.85 + mid[k] * 0.4;
    height[k] = h * 4;
    RR(clamp(0.08 + h * 0.85 * contrast + (wisp[k] - 0.5) * 0.12), out);
  });
  cv.shade(height, 1.9);
  for (let i = 0; i < 20; i++) cv.soft(rng.next() * n, rng.next() * n, (6 + rng.next() * 12) * K, [255, 255, 255], 0.16, (2 + rng.next() * 3) * K);       // a few streaks of light
  cv.modulate(grain(n, seed + 9, n / 2, 0.015));
  if (mean) cv.matchMean(mean, 0.95);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// A pane of glass: a frame (shared with the next pane across the tile's edge), a bevel lit at the top left, a face that grows deeper to the lower right and glints that run across it.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function pane(n, { seed = 241, R, frame = '#1c4a50', mean = null } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R), FR = col(frame);
  const cv = new Canvas(n);
  const sub = fbm(n, seed + 1, 3, 3, 0.5), fleck = fbm(n, seed + 2, 24, 2, 0.5);
  const fw = 16 * K, bev = 22 * K, tmp = [0, 0, 0], height = new Float32Array(n * n);
  cv.fillWith((x, y, out) => {
    const k = y * n + x;
    const dl = x, dt = y, dr = n - 1 - x, db = n - 1 - y, d = Math.min(dl, dt, dr, db);
    const grad = (x + y) / (2 * n);                                                // 0 at the upper left, 1 at the lower right
    RR(clamp(0.7 - grad * 0.38 + (sub[k] - 0.5) * 0.18 + (fleck[k] - 0.5) * 0.06), out);
    const toTL = Math.min(dl, dt) <= Math.min(dr, db);                              // the nearest edge faces the light
    const bv = 1 - smoothstep(fw, fw + bev, d);
    if (d < fw) { out[0] = FR[0]; out[1] = FR[1]; out[2] = FR[2]; }
    else if (bv > 0) {
      const l = toTL ? 0.55 : -0.4;
      out[0] = clamp(out[0] * (1 + l * bv), 0, 255); out[1] = clamp(out[1] * (1 + l * bv), 0, 255); out[2] = clamp(out[2] * (1 + l * bv), 0, 255);
    }
    height[k] = smoothstep(fw * 0.5, fw + 4 * K, d) * 0.5;
  });
  cv.shade(height, 1.0);
  const bands = [[0.32, 22 * K, 0.5], [0.4, 8 * K, 0.4], [0.78, 5 * K, 0.22]];     // glints across the face, from the lower left to the upper right
  for (const [c, w, a] of bands) {
    const mid = c * 2 * n;
    for (let y = Math.floor(fw); y < n - fw; y++) for (let x = Math.floor(fw); x < n - fw; x++) {
      const d = Math.abs((x + y) - mid) / 1.4142;
      const cov = 1 - smoothstep(0, w, d);
      if (cov > 0) cv.blend(x, y, [255, 255, 255], cov * a);
    }
  }
  for (let i = 0; i < 12; i++) cv.soft(fw + rng.next() * (n - 2 * fw), fw + rng.next() * (n - 2 * fw), (1 + rng.next() * 1.5) * K, [255, 255, 255], 0.55);
  cv.modulate(grain(n, seed + 9, n / 2, 0.015));
  if (mean) cv.matchMean(mean, 0.92);
  return cv;
}
