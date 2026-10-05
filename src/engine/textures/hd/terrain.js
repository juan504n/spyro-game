// HD painters for the ground and the stone of the worlds: meadows, cobbles, rock strata, masonry. Each paints one periodic tile of n x n pixels with the palette ramps of its pixel twin (../palette.js),
// so a realm's colours do not change, only how finely they are painted.
import { RAMPS } from '../palette.js';
import { Canvas, RNG, clamp, mix, smoothstep, wrapN, ramp, col, fbm, voronoi, blur, grain, warp } from './kit.js';

export const HD_RAMPS = {
  grassSun: [RAMPS.grass[1], RAMPS.grass[2], RAMPS.grass[3], RAMPS.grass[4], RAMPS.grass[5], '#c4f088'],
  grassLush: [RAMPS.grassTeal[0], RAMPS.grassTeal[1], RAMPS.grassTeal[2], '#4faf70', '#7cd08c', '#b0eeb4'],
};

/** grit: small light and dark specks of 1-2 px on a canvas, where `where(x, y)` (0..1) allows them */
function specks(cv, rng, count, light, dark, where = null, size = 1) {
  const n = cv.n;
  for (let i = 0; i < count; i++) {
    const x = rng.next() * n, y = rng.next() * n;
    const w = where ? where(Math.floor(x), Math.floor(y)) : 1;
    if (w <= 0.02) continue;
    const c = rng.next() < 0.5 ? light : dark, r = (0.7 + rng.next() * 0.9) * size;
    cv.soft(x, y, r, c, 0.5 * w, r * (0.7 + rng.next() * 0.5));
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Turf: a meadow of fine blades in tufts over a base that is mottled in patches. `R` is the ramp of greens, dark to light.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function turf(n, { seed = 1, R, patchCells = 3, tufts = 26, blade = [14, 30], lean = 0.5, flowers = null, clover = false, mean = null, contrast = 1 } = {}) {
  const K = n / 256;                                                            // everything below is written for 256 px
  const rng = new RNG(seed);
  const RR = ramp(R);
  const cv = new Canvas(n);
  const f = fbm(n, seed + 1, patchCells, 3, 0.55), f2 = fbm(n, seed + 2, patchCells * 3, 2);
  cv.fillWith((x, y, out) => { const k = y * n + x; RR(0.2 + (0.22 * f[k] + 0.06 * f2[k]) * contrast, out); });
  // soft light and dark patches across it
  const dap = fbm(n, seed + 3, 2, 2);
  for (let i = 0; i < n * n; i++) { const m = 1 + (dap[i] - 0.5) * 0.14 * contrast; cv.px[i * 3] *= m; cv.px[i * 3 + 1] *= m; cv.px[i * 3 + 2] *= m; }
  // tufts on a jittered grid (no lattice shows when the tile repeats), drawn from the top of the tile down so that the lower ones lie over the upper
  const G = Math.round(tufts), cell = n / G, list = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) list.push([(i + 0.5 + (rng.next() - 0.5) * 0.9) * cell, (j + 0.5 + (rng.next() - 0.5) * 0.9) * cell, rng.next()]);
  list.sort((a, b) => a[1] - b[1]);
  const tmp = [0, 0, 0];
  for (const [bx, by] of list) cv.soft(bx, by + 2 * K, 7 * K, [18, 38, 26], 0.3, 3 * K);          // a shadow at the foot of each tuft (all of them before any blade, so that a shadow never lies over a blade that wraps round the edge)
  for (const [bx, by, r0] of list) {
    const count = 3 + Math.floor(r0 * 3);
    const base = 0.3 + 0.25 * f[wrapN(Math.floor(by), n) * n + wrapN(Math.floor(bx), n)];
    for (let k = 0; k < count; k++) {
      const a = -Math.PI / 2 + (rng.next() - 0.5) * 1.5 * lean * 2 + (k - (count - 1) / 2) * 0.28;       // up, fanned out
      const len = (blade[0] + rng.next() * (blade[1] - blade[0])) * K;
      const bend = (rng.next() - 0.5) * 0.9;
      const pts = [];
      for (let s = 0; s <= 5; s++) {
        const t = s / 5, ang = a + bend * t * t;
        pts.push([bx + Math.cos(ang) * len * t * (1 - 0.1 * t) + (k - (count - 1) / 2) * 1.4 * K * (1 - t), by + Math.sin(ang) * len * t]);
      }
      const dark = RR(clamp(base - (0.12 + rng.next() * -0.1) * contrast), [0, 0, 0]), tip = RR(clamp(base + (0.3 + rng.next() * 0.28) * contrast), [0, 0, 0]);
      cv.stroke(pts, (2.4 + rng.next() * 0.8) * K, 0.5 * K, dark, tip, 0.92);
    }
  }
  if (clover) {
    for (let i = 0; i < 5; i++) {
      const cx = rng.next() * n, cy = rng.next() * n;
      for (let l = 0; l < 3; l++) {
        const a = l * 2.094 + rng.next() * 0.5;
        cv.soft(cx + Math.cos(a) * 5 * K, cy + Math.sin(a) * 5 * K, 5 * K, RR(0.8, tmp), 0.9, 4 * K);
        cv.soft(cx + Math.cos(a) * 5 * K - K, cy + Math.sin(a) * 5 * K - K, 2.5 * K, RR(0.98, tmp), 0.6, 2 * K);
      }
    }
  }
  if (flowers) {
    const count = flowers.count ?? 6;
    for (let i = 0; i < count; i++) {
      const fx = rng.next() * n, fy = rng.next() * n, [petal, heart] = flowers.kinds[i % flowers.kinds.length].map(col);
      for (let p = 0; p < 5; p++) { const a = p * 1.2566 + 0.3; cv.soft(fx + Math.cos(a) * 3.4 * K, fy + Math.sin(a) * 3.4 * K, 3.2 * K, petal, 0.95, 2.6 * K); }
      cv.soft(fx, fy, 2.2 * K, heart, 1);
    }
  }
  cv.modulate(grain(n, seed + 9, n / 3, 0.035));
  if (mean) cv.matchMean(mean, 0.9);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Blocks: the layout of rows of blocks (bricks, ashlar, the blocks of a cliff), with edges that can be warped. `cuts` are the rows' tops (ascending, in 0..n, with n as the last), `joints[b]` the x of the
// joints of row b (ascending). For each pixel: id of the block, d = how far (px) it is inside the block from the nearest edge (< 0 is outside: the joint), and u = how far down the row it is (0..1).
// ---------------------------------------------------------------------------------------------------------------------------------------------
function blockField(n, cuts, joints, W = null) {
  const id = new Int32Array(n * n), d = new Float32Array(n * n), u = new Float32Array(n * n);
  const rows = cuts.length - 1;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const k = y * n + x;
      const xw = wrapN(x + (W ? W.dx[k] : 0), n), yw = wrapN(y + (W ? W.dy[k] : 0), n);
      let b = 0;
      while (b < rows - 1 && yw >= cuts[b + 1]) b++;
      const js = joints[b];
      let j = -1;
      for (let q = 0; q < js.length; q++) if (js[q] <= xw) j = q;
      let xl, xr;
      if (j < 0) { j = js.length - 1; xl = js[j] - n; xr = js[0]; } else { xl = js[j]; xr = j + 1 < js.length ? js[j + 1] : js[0] + n; }
      d[k] = Math.min(xw - xl, xr - xw, yw - cuts[b], cuts[b + 1] - yw);
      id[k] = b * 64 + j;
      u[k] = (yw - cuts[b]) / (cuts[b + 1] - cuts[b]);
    }
  }
  return { id, d, u };
}

/** hash of a block id to 0..1, stable and cheap */
const h01 = (i, s) => { let h = Math.imul(i + 1, 374761393) ^ Math.imul(s + 7, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Cobbles: rounded stones, each its own tone, lit from the upper left, with dark gaps (moss in them) and the odd crack and chip.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function cobbles(n, { seed = 5, R, gap = '#2e2c3a', moss = '#587a3d', cells = 6, rows = cells, stagger = 0.5, jitter = 0.8, toneLo = 0.34, toneHi = 0.8, mossAmount = 0.35, warm = [0, 0, 0], crackFrac = 0.25, relief = 0.55, gapPx = 2.4, mean = null, glow = null, gloss = 0, rim = 15, grit = 500 } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R);
  const V = voronoi(n, cells, rows, seed + 1, jitter, stagger);
  const tone = new Float32Array(V.count), hue = [];
  for (let i = 0; i < V.count; i++) { tone[i] = toneLo + (toneHi - toneLo) * rng.next(); hue.push([(rng.next() - 0.5) * 14 + warm[0], (rng.next() - 0.5) * 10 + warm[1], (rng.next() - 0.5) * 14 + warm[2]]); }
  const cv = new Canvas(n);
  const wob = fbm(n, seed + 2, 6, 2);                                           // the gap is not a clean line: it wobbles
  const e0 = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) e0[i] = (V.f2[i] - V.f1[i]) / 2 - gapPx * K * (0.6 + 1.0 * wob[i]);
  const edge = blur(e0, n, Math.max(1, Math.round(3 * K)));                     // blurred: the stones' corners are round
  const body = new Float32Array(n * n), height = new Float32Array(n * n);
  const R0 = (n / cells) * 0.5;
  for (let i = 0; i < n * n; i++) {
    body[i] = smoothstep(-0.9 * K, 0.9 * K, edge[i]);
    height[i] = body[i] * (smoothstep(0, rim * K, edge[i]) * 0.75 + 0.25 * (1 - clamp(V.f1[i] / (R0 * 1.3))));
  }
  const mortar = col(gap), mossC = col(moss), tmp = [0, 0, 0];
  const surf = fbm(n, seed + 3, 9, 3), spots = fbm(n, seed + 4, 22, 2), mossN = fbm(n, seed + 5, 7, 3);
  cv.fillWith((x, y, out) => {
    const k = y * n + x, id = V.id[k], s = 0.55 * surf[k] + 0.45 * spots[k];
    // each stone is a little lighter at its upper left and darker at its lower right, whichever way it is lit from the height below
    const side = -(V.dx[k] + V.dy[k]) * 0.7071 / (R0 * 1.4);
    RR(clamp(tone[id] + (s - 0.5) * 0.26 + side * 0.1), tmp);
    out[0] = tmp[0] + hue[id][0]; out[1] = tmp[1] + hue[id][1]; out[2] = tmp[2] + hue[id][2];
    const b = body[k];
    out[0] = mix(mortar[0], out[0], b); out[1] = mix(mortar[1], out[1], b); out[2] = mix(mortar[2], out[2], b);
  });
  // moss: in the gaps and creeping a little over the stones' edges
  const mossM = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const near = 1 - smoothstep(-1 * K, 6 * K, edge[i]);
    mossM[i] = near * smoothstep(1 - mossAmount * 1.3, 1 - mossAmount * 0.6, mossN[i]);
  }
  cv.tint(mossM, mossC, 0.8);
  cv.shade(height, relief * 4.2);
  const ao = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) ao[i] = -0.28 * (1 - smoothstep(0, 4 * K, edge[i]));
  cv.modulate(ao);
  if (glow) {                                                                       // a fire in the gaps (Emberfall): it lights the stones' edges too
    const gc = col(glow), gm = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) gm[i] = (1 - smoothstep(-0.5 * K, 3.4 * K, edge[i])) * (0.4 + 0.6 * wob[i]);
    cv.tint(gm, gc, 0.9);
    const gh = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) gh[i] = (1 - smoothstep(-1.2 * K, 0.8 * K, edge[i])) * wob[i];
    cv.tint(gh, [255, 226, 150], 0.75);
  }
  if (gloss) {                                                                      // a wet sheen on the upper left of each stone (the shore)
    const gl = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) gl[i] = Math.max(0, height[i] - 0.55) * 2 * smoothstep(0, 1, 1 - (V.dx[i] + V.dy[i]) / (R0 * 2));
    cv.tint(gl, [255, 255, 255], gloss);
  }
  specks(cv, rng, grit, [236, 232, 244], [40, 36, 54], (x, y) => body[y * n + x], K);
  // cracks
  for (let id = 0; id < V.count; id++) {
    if (rng.next() > crackFrac) continue;
    let cx = -1, cy = -1;
    for (let t = 0; t < 400; t++) { const x = Math.floor(rng.next() * n), y = Math.floor(rng.next() * n); if (V.id[y * n + x] === id && edge[y * n + x] > 7 * K) { cx = x; cy = y; break; } }
    if (cx < 0) continue;
    const a = rng.next() * 6.28, len = (10 + rng.next() * 14) * K, pts = [[cx, cy]];
    for (let s = 1; s <= 5; s++) { const aa = a + (rng.next() - 0.5) * 1.1; pts.push([pts[s - 1][0] + Math.cos(aa) * len / 5, pts[s - 1][1] + Math.sin(aa) * len / 5]); }
    cv.stroke(pts, 1.5 * K, 0.4 * K, [34, 30, 46], [34, 30, 46], 0.5);
  }
  cv.modulate(grain(n, seed + 7, n / 2, 0.035));
  if (mean) cv.matchMean(mean, 0.9);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Rock strata: horizontal rows of stone, each its own tone, broken into blocks by fissures, with warped edges, a lit lip on top of each row and a shadow beneath it.
// With `moss`, green hangs from the lip of each row; with `snow`, white lies on it.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function strata(n, { seed = 11, R, bands = 6, moss = null, blocks = 3, crackDepth = 0.6, hue = [0, 0, 0], toneLo = 0.3, toneHi = 0.74, ember = null, snow = null, mean = null, rough = 1, veins = null, salt = 0 } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R);
  const cv = new Canvas(n);
  const sizes = [];
  for (let i = 0; i < bands; i++) sizes.push(0.55 + rng.next() * 0.9);
  const total = sizes.reduce((a, b) => a + b, 0), cuts = [0];
  for (let i = 0; i < bands; i++) cuts.push(cuts[i] + (sizes[i] / total) * n);
  cuts[bands] = n;
  const joints = [];
  for (let i = 0; i < bands; i++) { const m = [], c = blocks + (rng.next() < 0.5 ? 0 : 1), off = rng.next() * n; for (let j = 0; j < c; j++) m.push(wrapN(off + ((j + 0.15 + rng.next() * 0.7) / c) * n, n)); m.sort((a, b) => a - b); joints.push(m); }
  const W = warp(n, seed + 1, 5, 7 * K);
  const B = blockField(n, cuts, joints, W);
  const btone = [], bhue = [];
  for (let i = 0; i < bands; i++) { btone.push(toneLo + (toneHi - toneLo) * rng.next()); bhue.push([(rng.next() - 0.5) * 10 + hue[0], (rng.next() - 0.5) * 8 + hue[1], (rng.next() - 0.5) * 12 + hue[2]]); }
  const grainH = fbm(n, seed + 2, 3, 3, 0.6, 28), mottle = fbm(n, seed + 3, 8, 3), roughF = fbm(n, seed + 4, 36, 3, 0.6), edgeN = fbm(n, seed + 10, 14, 3, 0.55), tmp = [0, 0, 0];
  const height = new Float32Array(n * n);
  const gapPx = 2.0 * K;
  cv.fillWith((x, y, out) => {
    const k = y * n + x, id = B.id[k], b = Math.floor(id / 64), u = B.u[k];
    const bt = btone[b] + (h01(id, seed) - 0.5) * 0.14;
    const t = clamp(bt + (grainH[k] - 0.5) * 0.3 + (mottle[k] - 0.5) * 0.16 + (roughF[k] - 0.5) * 0.12 * rough - 0.1 * u);
    RR(t, tmp);
    out[0] = tmp[0] + bhue[b][0]; out[1] = tmp[1] + bhue[b][1]; out[2] = tmp[2] + bhue[b][2];
    const d = B.d[k] + (edgeN[k] - 0.5) * 8 * K;                                    // (the edges wobble and chip)
    height[k] = smoothstep(0, 8 * K, d - gapPx) * 0.6 + (roughF[k] - 0.5) * 0.42 * rough + (1 - smoothstep(0, 0.09, u)) * 0.22;
  });
  cv.shade(height, 2.1);
  // the joints are dark; each row casts a shadow down its face
  const crack = [26, 22, 36], ao = new Float32Array(n * n), joint = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const d = B.d[i] + (edgeN[i] - 0.5) * 8 * K;
    joint[i] = (1 - smoothstep(gapPx * 0.3, gapPx * 1.3, d)) * (0.55 + 0.45 * mottle[i]);
    ao[i] = -0.42 * (1 - smoothstep(0, 6 * K, d)) - 0.3 * smoothstep(0.8, 1, B.u[i]);
  }
  cv.modulate(ao);
  cv.tint(joint, crack, crackDepth + 0.1);
  specks(cv, rng, 560, [226, 220, 238], [30, 26, 40], (x, y) => 1 - joint[y * n + x], K);
  for (let i = 0; i < 6; i++) {
    const x0 = rng.next() * n, y0 = rng.next() * n, pts = [[x0, y0]];
    let a = Math.PI / 2 + (rng.next() - 0.5) * 1.2;
    for (let s = 1; s <= 7; s++) { a += (rng.next() - 0.5) * 0.9; pts.push([pts[s - 1][0] + Math.cos(a) * 6 * K, pts[s - 1][1] + Math.sin(a) * 6 * K]); }
    cv.stroke(pts, 1.8 * K, 0.4 * K, crack, crack, crackDepth * 0.8);
  }
  if (ember) {                                                                      // a hairline of fire in some fissures (Emberfall)
    const e1 = col(ember);
    for (let i = 0; i < 4; i++) {
      const x0 = rng.next() * n, y0 = rng.next() * n, pts = [[x0, y0]];
      let a = Math.PI / 2 + (rng.next() - 0.5) * 0.8;
      for (let s = 1; s <= 8; s++) { a += (rng.next() - 0.5) * 0.7; pts.push([pts[s - 1][0] + Math.cos(a) * 5 * K, pts[s - 1][1] + Math.sin(a) * 5 * K]); }
      cv.stroke(pts, 9 * K, 3 * K, [210, 70, 24], [210, 70, 24], 0.26);            // the glow it throws on the rock
      cv.stroke(pts, 2.4 * K, 0.7 * K, e1, [255, 222, 140], 0.95);
    }
  }
  // (the lip - moss, snow or ash - hangs from the top of the tile only: one row of it in a tall wall; the tile is repeated whole, so the lip is at the head of every repeat)
  const lipOf = (k) => (Math.floor(B.id[k] / 64) === 0 ? B.u[k] * (cuts[1] - cuts[0]) : 1e9);      // px down the first row
  if (moss) {
    const mc = ramp(moss), mn = fbm(n, seed + 6, 14, 2);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const k = y * n + x, reach = (12 + 20 * mn[k]) * K, d = lipOf(k);
        const a = (1 - smoothstep(reach * 0.65, reach, d)) * 0.95;
        if (a > 0.01) { mc(0.35 + 0.5 * mn[k] + 0.2 * (1 - d / reach), tmp); cv.blend(x, y, tmp, a); }
      }
    }
  }
  if (snow) {                                                                       // snow (or ash) lies on the first row (Frostbloom, Emberfall)
    const sc = col(snow), sn = fbm(n, seed + 7, 12, 2);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const k = y * n + x, reach = (11 + 16 * sn[k]) * K, d = lipOf(k);
        const a = (1 - smoothstep(reach * 0.6, reach, d)) * 0.95;
        if (a > 0.01) cv.blend(x, y, [sc[0] * (0.94 + 0.06 * sn[k]), sc[1] * (0.95 + 0.05 * sn[k]), sc[2]], a);
      }
    }
  }
  if (veins) {                                                                      // veins in the stone (marble): long thin meanders across the rows
    const vc = col(veins.color);
    for (let i = 0; i < (veins.count ?? 7); i++) {
      const pts = [[rng.next() * n, rng.next() * n]];
      let a = rng.next() * 6.28;
      for (let s = 1; s <= 12; s++) { a += (rng.next() - 0.5) * 1.0; pts.push([pts[s - 1][0] + Math.cos(a) * 9 * K, pts[s - 1][1] + Math.sin(a) * 9 * K]); }
      cv.stroke(pts, (veins.width ?? 2.2) * K, 0.5 * K, vc, vc, veins.alpha ?? 0.35);
    }
  }
  if (salt) specks(cv, rng, salt, [248, 252, 250], [248, 252, 250], null, K);
  cv.modulate(grain(n, seed + 8, n / 2, 0.04));
  if (mean) cv.matchMean(mean, 0.9);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Masonry: bricks (or slabs) in rows, each a little different, flat faced with a worn edge, mortar between, and the wear of the years.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export function masonry(n, { seed = 21, R, mortar = '#3a3648', cols = 4, rows = 8, bond = 0.5, tint = 12, toneLo = 0.35, toneHi = 0.78, bevel = 1, gap = 3.4, moss = null, mossAmount = 0, wear = 0.5, mean = null, face = 0.2 } = {}) {
  const K = n / 256;
  const rng = new RNG(seed);
  const RR = ramp(R);
  const cv = new Canvas(n);
  const cuts = [], joints = [], bh = n / rows, bw = n / cols;
  for (let r = 0; r <= rows; r++) cuts.push(r * bh);
  for (let r = 0; r < rows; r++) { const m = []; for (let c = 0; c < cols; c++) m.push(wrapN((c + (r % 2) * bond) * bw, n)); m.sort((a, b) => a - b); joints.push(m); }
  const W = warp(n, seed + 1, 6, 1.4 * K);
  const B = blockField(n, cuts, joints, W);
  const gp = gap * K;
  const hue = [], tone = [];
  const total = rows * 64;
  for (let i = 0; i < total; i++) { tone.push(toneLo + (toneHi - toneLo) * h01(i, seed)); hue.push([(h01(i, seed + 1) - 0.5) * tint, (h01(i, seed + 2) - 0.5) * tint * 0.7, (h01(i, seed + 3) - 0.5) * tint]); }
  const mort = col(mortar), tmp = [0, 0, 0];
  const surf = fbm(n, seed + 2, 10, 3), speck = fbm(n, seed + 3, 26, 2), stain = fbm(n, seed + 4, 3, 2, 0.5, 9), roughF = fbm(n, seed + 5, 34, 2);
  const height = new Float32Array(n * n), body = new Float32Array(n * n);
  cv.fillWith((x, y, out) => {
    const k = y * n + x, id = B.id[k], d = B.d[k] - gp * 0.5;
    const b = smoothstep(-0.7 * K, 0.7 * K, d);
    body[k] = b;
    RR(clamp(tone[id] + (surf[k] - 0.5) * 0.2 * wear + (speck[k] - 0.5) * 0.12 * wear - Math.max(0, stain[k] - 0.62) * 0.5 * wear + (B.u[k] - 0.5) * 0.06), tmp);
    const hh = hue[id];
    out[0] = mix(mort[0], tmp[0] + hh[0], b); out[1] = mix(mort[1], tmp[1] + hh[1], b); out[2] = mix(mort[2], tmp[2] + hh[2], b);
    height[k] = b * (smoothstep(0, 4.5 * K * bevel, d) * 0.8 + 0.2) + (roughF[k] - 0.5) * face * 0.25;
  });
  cv.shade(height, 2.6 * bevel);
  const ao = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) ao[i] = -0.3 * (1 - smoothstep(0, 3.5 * K, B.d[i] - gp * 0.5));
  cv.modulate(ao);
  if (moss && mossAmount > 0) {
    const mc = col(moss), mm = fbm(n, seed + 6, 8, 3), m = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) m[i] = (1 - smoothstep(0, 5 * K, B.d[i] - gp * 0.5)) * smoothstep(1 - mossAmount * 1.2, 1 - mossAmount * 0.5, mm[i]);
    cv.tint(m, mc, 0.8);
  }
  specks(cv, rng, Math.round(900 * wear), [238, 234, 246], [36, 32, 48], (x, y) => body[y * n + x], K);
  for (let i = 0; i < Math.round(8 * wear); i++) {
    const x0 = rng.next() * n, y0 = rng.next() * n, pts = [[x0, y0]];
    let a = rng.next() * 6.28;
    for (let s = 1; s <= 4; s++) { a += (rng.next() - 0.5) * 1.3; pts.push([pts[s - 1][0] + Math.cos(a) * 4 * K, pts[s - 1][1] + Math.sin(a) * 4 * K]); }
    cv.stroke(pts, 1.4 * K, 0.4 * K, [34, 30, 44], [34, 30, 44], 0.5);
  }
  cv.modulate(grain(n, seed + 7, n / 2, 0.04));
  if (mean) cv.matchMean(mean, 0.9);
  return cv;
}
