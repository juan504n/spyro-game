// Heightfield generator for Gloaming Vale. Pure JS (no three, no DOM) so it can run in Node for map dumps/tests.
// heightAt() walks the SAME triangulation the render mesh uses (alternating diagonals) so the player's feet touch
// exactly what is drawn.
import { valueNoise, fbm } from '../engine/textures/pix.js';
import { LEVEL, WORLD, WATER_LEVEL } from './level.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

const noiseA = valueNoise(101), noiseB = valueNoise(202), noiseR = valueNoise(303), noiseC = valueNoise(404);
const n2 = (noise, x, z, s, oct = 3) => fbm(noise, x * s, z * s, oct);

function flatten(h, x, z, cx, cz, r, fall, target, wobble = 0) {
  const d = Math.hypot(x - cx, z - cz) + wobble;
  return lerp(h, target, 1 - smooth(r, r + fall, d));
}

/** Analytic terrain (before roads/rivers are carved). */
export function baseHeight(x, z, L = LEVEL) {
  const V = L.valley;
  let h = 2.4 + (n2(noiseA, x + 300, z + 300, 0.011, 3) - 0.5) * 7.5;
  h += (n2(noiseB, x, z, 0.045, 2) - 0.5) * 1.6;
  h += (n2(noiseC, x - 77, z + 41, 0.026, 3) - 0.5) * 5.0;
  for (const m of L.hills) {
    const d = Math.hypot(x - m.x, z - m.z) / m.r;
    if (d < 1) h += m.h * Math.pow(1 - smooth(0, 1, d), 1.25);
  }
  // mountain rim that walls in the valley
  const r = Math.hypot((x - V.x) / V.rx, (z - V.z) / V.rz);
  const ridge = 1 - Math.abs(2 * n2(noiseR, x, z, 0.02, 3) - 1);
  h += smooth(V.rimStart, 1.03, r) * (34 + 30 * ridge);
  h += smooth(1.03, 1.3, r) * 30;

  // Hearth Village plateau
  h = flatten(h, x, z, L.village.x, L.village.z, L.village.r, L.village.fall, L.village.h);

  // Mirrormere basin (elliptical): flat-ish bed, steepening walls, shoreline exactly at d = 1
  {
    const k = L.lake;
    const d = Math.hypot((x - k.x) / k.rx, (z - k.z) / k.rz);
    if (d < 1.32) {
      const wob = (n2(noiseB, x + 50, z, 0.06, 2) - 0.5) * 0.9 * (1 - d);
      const inner = k.bed * (1 - Math.pow(d, 3.2)) + wob * (d < 1 ? 1 : 0);
      const outer = lerp(0.0, h, smooth(1.0, 1.32, d));
      h = d < 1 ? Math.min(h, inner) : outer;
    }
  }
  // ponds
  for (const p of L.ponds) {
    const d = Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz);
    if (d < 1.3) h = d < 1 ? Math.min(h, p.bed * (1 - Math.pow(d, 3))) : lerp(0, h, smooth(1.0, 1.3, d));
  }
  // island mound in the lake
  {
    const I = L.island;
    const dist = Math.hypot(x - I.x, z - I.z);
    const hi = L.lake.bed + (I.top - L.lake.bed) * (1 - smooth(I.r * 0.4, I.r * 1.15, dist));
    h = Math.max(h, hi);
  }
  // launch mesa (wobbly outline so it reads as natural rock)
  h = flatten(h, x, z, L.mesa.x, L.mesa.z, L.mesa.r, L.mesa.fall, L.mesa.h, (n2(noiseC, x, z, 0.09, 2) - 0.5) * 9);
  // wind hill
  {
    const W = L.windHill;
    const d = Math.hypot(x - W.x, z - W.z) / W.r;
    const dm = W.h * Math.pow(1 - smooth(0, 1, d), 1.15);
    if (dm > 0.01) h = Math.max(h, dm);
    h = flatten(h, x, z, W.x, W.z, W.topR, 7, W.topH);
  }
  // realm portal pad: a flat shelf cut into the southern rim so the arch's dais sits on level ground
  if (L.portal) h = flatten(h, x, z, L.portal.x, L.portal.z, L.portal.r, L.portal.fall, L.portal.h);
  // north summit
  {
    const S = L.summit;
    const d = Math.hypot(x - S.x, z - S.z) / S.r;
    const dm = S.h * Math.pow(1 - smooth(0, 1, d), 1.35);
    if (dm > 0.01) h = Math.max(h, dm);
    h = flatten(h, x, z, S.x, S.z, S.topR, 6, S.topH);
  }
  // crystal hollow: a bowl with a rocky wall that is open to the south
  {
    const K = L.hollow;
    const dx = x - K.x, dz = z - K.z;
    const d = Math.hypot(dx, dz);
    const ang = Math.atan2(dz, dx);
    const open = 1 - smooth(0.25, 0.75, Math.abs(angDiff(ang, Math.PI / 2)));
    const floor = lerp(h, 1.2, 1 - smooth(K.r * 0.55, K.r * 0.95, d));
    const wall = smooth(K.r * 0.78, K.r * 1.02, d) * (1 - smooth(K.r * 1.02, K.r * 1.5, d)) * (1 - open);
    h = floor + wall * (9 + 4 * n2(noiseC, x + 9, z, 0.12, 2));
  }
  // heron point headland + cascade plateau + ruins mound
  h = flatten(h, x, z, L.heron.x, L.heron.z, L.heron.r, L.heron.fall, L.heron.h, (n2(noiseC, x + 31, z, 0.1, 2) - 0.5) * 5);
  h = flatten(h, x, z, L.cascade.x, L.cascade.z, L.cascade.r, L.cascade.fall, L.cascade.h, (n2(noiseC, x, z + 17, 0.08, 2) - 0.5) * 8);
  {
    const R = L.ruinsMound;
    const d = Math.hypot(x - R.x, z - R.z) / R.r;
    const dm = R.h * (1 - smooth(0, 1, d));
    if (dm > 0.01) h = Math.max(h, dm);
  }
  // no accidental puddles: outside the lake/ponds keep the ground above the waterline
  const dLake = Math.hypot((x - L.lake.x) / L.lake.rx, (z - L.lake.z) / L.lake.rz);
  let dWet = dLake;
  for (const p of L.ponds) dWet = Math.min(dWet, Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz));
  {
    // eased in (a hard switch made a ledge along the shores): 0 inside the basins, 1 well outside them
    const k = smooth(1.12, 1.42, dWet);            // (the lake's water disc ends at d = 1.12)
    if (k > 0) h = lerp(h, Math.max(h, 0.75), k);
  }
  return h;
}

/** Catmull-Rom densify control points [[x,z,(y)], ...] to ~`spacing` apart. Returns {pts:[[x,z]...], pins:Map(idx->y)}. */
function densify(ctrl, spacing = 1.6) {
  const out = [];
  const pins = new Map();
  const cr = (p0, p1, p2, p3, t, k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t);
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(i - 1, 0)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(i + 2, ctrl.length - 1)];
    const steps = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      if (s === 0 && p1.length > 2) pins.set(out.length, p1[2]);
      out.push([cr(p0, p1, p2, p3, t, 0), cr(p0, p1, p2, p3, t, 1)]);
    }
  }
  const last = ctrl[ctrl.length - 1];
  if (last.length > 2) pins.set(out.length, last[2]);
  out.push([last[0], last[1]]);
  return { pts: out, pins };
}

/** Dense path with heights: pinned control heights are honoured exactly, the rest follows terrain, then smoothed. */
function pathProfile(ctrl, sample, spacing = 1.6) {
  const { pts, pins } = densify(ctrl, spacing);
  const n = pts.length;
  const ty = pts.map((p) => sample(p[0], p[1]));
  const y = ty.slice();
  const pinIdx = [...pins.keys()].sort((a, b) => a - b);
  if (pinIdx.length) {
    for (let k = 0; k < pinIdx.length - 1; k++) {
      const a = pinIdx[k], b = pinIdx[k + 1];
      for (let i = a; i <= b; i++) y[i] = lerp(pins.get(a), pins.get(b), (i - a) / (b - a));
    }
    for (const [i, v] of pins) y[i] = v;              // a lone pin still has to be honoured exactly
    const f = pinIdx[0], l = pinIdx[pinIdx.length - 1];
    const of = pins.get(f) - ty[f], ol = pins.get(l) - ty[l];
    for (let i = 0; i < f; i++) y[i] = ty[i] + of * (1 - Math.min(1, (f - i) / 24)) * 1;
    for (let i = l + 1; i < n; i++) y[i] = ty[i] + ol * (1 - Math.min(1, (i - l) / 24));
  }
  // smooth (keep pins fixed)
  for (let pass = 0; pass < 3; pass++) {
    const src = y.slice();
    for (let i = 0; i < n; i++) {
      if (pins.has(i) || i < 4 || i >= n - 4) continue;   // (a truncated window at the ends would bias the smoothing)
      let s = 0, c = 0;
      for (let k = -4; k <= 4; k++) { const j = i + k; if (j >= 0 && j < n) { s += src[j]; c++; } }
      y[i] = s / c;
    }
  }
  return pts.map((p, i) => [p[0], y[i], p[1]]); // -> [x, y, z]
}

export function generateTerrain(L = LEVEL, W = WORLD) {
  const cell = W.cell;
  const n = Math.round(W.size / cell);
  const s = n + 1;
  const half = (n * cell) / 2;
  const H = new Float32Array(s * s);
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) H[j * s + i] = baseHeight(-half + i * cell, -half + j * cell, L);

  const baseSample = (x, z) => baseHeight(x, z, L);
  const pathDist = new Float32Array(s * s).fill(999);   // distance to nearest path EDGE (negative = on the path)
  const pathIdx = new Int8Array(s * s).fill(-1);
  const riverDist = new Float32Array(s * s).fill(999);

  const carve = (dense, width, shoulder, depth, distArr, idArr, id) => {
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (const p of dense) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[2]); maxz = Math.max(maxz, p[2]); }
    const pad = width / 2 + shoulder + 1;
    const i0 = Math.max(0, Math.floor((minx - pad + half) / cell)), i1 = Math.min(n, Math.ceil((maxx + pad + half) / cell));
    const j0 = Math.max(0, Math.floor((minz - pad + half) / cell)), j1 = Math.min(n, Math.ceil((maxz + pad + half) / cell));
    const hw = width / 2;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = -half + i * cell, z = -half + j * cell;
        let best = Infinity, by = 0;
        for (let k = 0; k < dense.length - 1; k++) {
          const a = dense[k], b = dense[k + 1];
          const vx = b[0] - a[0], vz = b[2] - a[2];
          const l2 = vx * vx + vz * vz || 1;
          const t = clamp(((x - a[0]) * vx + (z - a[2]) * vz) / l2);
          const d = Math.hypot(x - (a[0] + vx * t), z - (a[2] + vz * t));
          if (d < best) { best = d; by = lerp(a[1], b[1], t); }
        }
        const w = 1 - smooth(hw, hw + shoulder, best);
        if (w > 0) {
          const idx = j * s + i;
          H[idx] = lerp(H[idx], by - depth, w);
        }
        if (best - hw < distArr[j * s + i]) { distArr[j * s + i] = best - hw; if (idArr) idArr[j * s + i] = id; }
      }
    }
  };

  const paths = [];
  L.paths.forEach((p, id) => {
    const dense = pathProfile(p.pts, baseSample, 1.6);
    carve(dense, p.width + 1.0, p.width * 1.1 + 3.4, 0.06, pathDist, pathIdx, id);
    paths.push({ id: p.id, surface: p.surface, width: p.width, pts: dense });
  });
  const rivers = [];
  for (const r of L.rivers) {
    const dense = pathProfile(r.pts, baseSample, 1.6);
    // river surface height is pinned; bed is 1.4 below
    carve(dense, r.width, 3.0, 1.5, riverDist, null, 0);
    rivers.push({ id: r.id, width: r.width, pts: dense });
  }

  const grid = { n, cell, half, size: n * cell, heights: H, paths, rivers, pathDist, pathIdx, riverDist, level: L };

  /** Ground height matching the render mesh triangulation. */
  grid.heightAt = (x, z) => {
    let fx = (x + half) / cell, fz = (z + half) / cell;
    fx = clamp(fx, 0, n - 1e-4); fz = clamp(fz, 0, n - 1e-4);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const h00 = H[j * s + i], h10 = H[j * s + i + 1], h01 = H[(j + 1) * s + i], h11 = H[(j + 1) * s + i + 1];
    if (((i + j) & 1) === 0) {
      return tx > tz ? h00 + (h10 - h00) * tx + (h11 - h10) * tz : h00 + (h11 - h01) * tx + (h01 - h00) * tz;
    }
    return tx + tz < 1 ? h00 + (h10 - h00) * tx + (h01 - h00) * tz : h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  };

  /** Unit surface normal of the triangle under (x,z). Writes into out [x,y,z]. */
  grid.normalAt = (x, z, out = [0, 1, 0]) => {
    let fx = (x + half) / cell, fz = (z + half) / cell;
    fx = clamp(fx, 0, n - 1e-4); fz = clamp(fz, 0, n - 1e-4);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const h00 = H[j * s + i], h10 = H[j * s + i + 1], h01 = H[(j + 1) * s + i], h11 = H[(j + 1) * s + i + 1];
    let gx, gz;
    if (((i + j) & 1) === 0) {
      if (tx > tz) { gx = (h10 - h00) / cell; gz = (h11 - h10) / cell; } else { gx = (h11 - h01) / cell; gz = (h01 - h00) / cell; }
    } else if (tx + tz < 1) { gx = (h10 - h00) / cell; gz = (h01 - h00) / cell; } else { gx = (h11 - h01) / cell; gz = (h11 - h10) / cell; }
    const l = Math.hypot(gx, 1, gz);
    out[0] = -gx / l; out[1] = 1 / l; out[2] = -gz / l;
    return out;
  };

  /** Smooth per-grid-vertex normal (central differences) for Gouraud shading. */
  grid.vertexNormal = (i, j, out = [0, 1, 0]) => {
    const il = Math.max(i - 1, 0), ir = Math.min(i + 1, n), jl = Math.max(j - 1, 0), jr = Math.min(j + 1, n);
    const gx = (H[j * s + ir] - H[j * s + il]) / ((ir - il) * cell);
    const gz = (H[jr * s + i] - H[jl * s + i]) / ((jr - jl) * cell);
    const l = Math.hypot(gx, 1, gz);
    out[0] = -gx / l; out[1] = 1 / l; out[2] = -gz / l;
    return out;
  };

  grid.slopeAt = (x, z) => { const nn = grid.normalAt(x, z); return Math.acos(clamp(nn[1])); };
  grid.WATER = WATER_LEVEL;
  return grid;
}
