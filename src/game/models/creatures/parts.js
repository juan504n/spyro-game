// Geometry helpers for the hero model that the shared rig helpers do not have:
//   superRing  cross-sections with a "squareness" exponent (boxy skulls and muzzles instead of round tubes)
//   meshRings  skins any stack of ring point-lists (smooth normals, per-vertex colours, optional flat caps)
//   sweep      a tube along a curved path (horns, necks) built from parallel-transported rings
//   blade      a small creased two-sided plate (crest, cheek fins)
// Everything emits lit triangles through the rig's triC/triDouble, so the bias, winding fix-ups and mirrored
// transforms all behave exactly like the other creature parts.
import { triC, triDouble, TAU } from './rig.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const sgnpow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);

/** Points of a superellipse ring in the XY plane at depth z. e = 2: ellipse, ~3: rounded box. rot = 0 puts a vertex on +x. */
export function superRing(cx, cy, z, rx, ry, e = 2, N = 8, rot = 0) {
  const pts = [];
  for (let j = 0; j < N; j++) {
    const th = rot + (j / N) * TAU;
    pts.push([cx + rx * sgnpow(Math.cos(th), 2 / e), cy + ry * sgnpow(Math.sin(th), 2 / e), z]);
  }
  return pts;
}

const centre = (pts) => {
  let x = 0, y = 0, z = 0;
  for (const p of pts) { x += p[0]; y += p[1]; z += p[2]; }
  return [x / pts.length, y / pts.length, z / pts.length];
};

/**
 * Skin a stack of rings. ring = { pts: [[x,y,z] x N], cols: [[r,g,b] x N] | col: [r,g,b] }.
 * Rings whose points all coincide are poles. o: { cap0, cap1, capCol }
 */
export function meshRings(b, rings, o = {}) {
  const R = rings.length, N = rings[0].pts.length;
  const C = rings.map((r) => centre(r.pts));
  const cols = rings.map((r) => (r.cols ? r.cols : r.pts.map(() => r.col)));
  const degenerate = rings.map((r, i) => r.pts.every((p) => len(sub(p, C[i])) < 1e-6));
  const NR = [];
  for (let i = 0; i < R; i++) {
    const nrm = [];
    for (let j = 0; j < N; j++) {
      let n;
      if (degenerate[i]) {
        const nb = i === 0 ? 1 : i - 1;
        n = norm(sub(C[i], C[Math.min(nb, R - 1)]));
        if (R === 1) n = [0, 0, 1];
      } else {
        const P = rings[i].pts;
        const t1 = sub(P[(j + 1) % N], P[(j + N - 1) % N]);
        let t2 = sub(rings[Math.min(i + 1, R - 1)].pts[j], rings[Math.max(i - 1, 0)].pts[j]);
        if (len(t2) < 1e-9) t2 = sub(C[Math.min(i + 1, R - 1)], C[Math.max(i - 1, 0)]);
        if (len(t2) < 1e-9) t2 = [0, 0, 1];
        n = norm(cross(t1, t2));
        if (dot(n, sub(P[j], C[i])) < 0) n = mul(n, -1);
      }
      nrm.push(n);
    }
    NR.push(nrm);
  }
  for (let i = 0; i < R - 1; i++) {
    if (degenerate[i] && degenerate[i + 1]) continue;
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      const A = rings[i].pts[j], B = rings[i].pts[j1], Cc = rings[i + 1].pts[j1], D = rings[i + 1].pts[j];
      const cA = cols[i][j], cB = cols[i][j1], cC = cols[i + 1][j1], cD = cols[i + 1][j];
      const nA = NR[i][j], nB = NR[i][j1], nC = NR[i + 1][j1], nD = NR[i + 1][j];
      if (degenerate[i]) triC(b, A, Cc, D, cA, cC, cD, nA, nC, nD);
      else if (degenerate[i + 1]) triC(b, A, B, Cc, cA, cB, cC, nA, nB, nC);
      else {
        triC(b, A, B, Cc, cA, cB, cC, nA, nB, nC);
        triC(b, A, Cc, D, cA, cC, cD, nA, nC, nD);
      }
    }
  }
  const cap = (i, dir) => {
    if (degenerate[i]) return;
    const nb = i === 0 ? 1 : R - 2;
    let n = norm(sub(C[i], C[nb]));
    if (dir) n = mul(n, dir);
    const cc = o.capCol || cols[i][0];
    for (let j = 0; j < N; j++) triC(b, C[i], rings[i].pts[j], rings[i].pts[(j + 1) % N], cc, cc, cc, n, n, n);
  };
  if (o.cap0) cap(0);
  if (o.cap1) cap(R - 1);
  return b;
}

/**
 * A tube along a curved path. path = [{ p:[x,y,z], r (round) | rx,ry, e, col }] — the first ring is at path[0], the last at path[n-1]
 * (r = 0 there makes a pointed tip). Rings are kept perpendicular to the path and twist-free (parallel transport).
 * o: { segs = 6, up = [0,1,0], rot = 0, cap0 = false, cap1 = false }
 */
export function sweep(b, path, o = {}) {
  const N = o.segs || 6, n = path.length;
  const up = o.up || [0, 1, 0];
  const T = path.map((s, i) => norm(sub(path[Math.min(i + 1, n - 1)].p, path[Math.max(i - 1, 0)].p)));
  let U = cross(cross(T[0], up), T[0]);
  if (len(U) < 1e-4) U = cross(cross(T[0], [1, 0, 0]), T[0]);
  U = norm(U);
  const rings = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) { U = sub(U, mul(T[i], dot(U, T[i]))); U = norm(U); }
    const V = cross(T[i], U);
    const s = path[i];
    const rx = s.rx ?? s.r ?? 0, ry = s.ry ?? s.r ?? rx, e = s.e || 2;
    const pts = [], cols = [];
    for (let j = 0; j < N; j++) {
      const th = (o.rot || 0) + (j / N) * TAU;
      const cx = rx * sgnpow(Math.cos(th), 2 / e), cy = ry * sgnpow(Math.sin(th), 2 / e);
      pts.push(add(s.p, add(mul(U, cx), mul(V, cy))));
      cols.push(typeof s.col === 'function' ? s.col(th, i) : s.col);
    }
    rings.push({ pts, cols });
  }
  return meshRings(b, rings, { cap0: o.cap0, cap1: o.cap1, capCol: o.capCol });
}

/**
 * A creased blade: base centre p, tip direction d, width axis w (hint; made perpendicular to d), height h, width wd, crease depth t.
 * Two-sided so it reads from any side. cols: [base, crease, tip] colours.
 */
export function blade(b, p, d, w, h, wd, t, cols) {
  const dz = norm(d);
  let wx = sub(w, mul(dz, dot(w, dz)));
  if (len(wx) < 1e-4) wx = cross(dz, [0, 1, 0]);
  wx = norm(wx);
  const nz = norm(cross(dz, wx));
  const L = sub(p, mul(wx, wd / 2)), R = add(p, mul(wx, wd / 2));
  const M = add(add(p, mul(dz, h * 0.18)), mul(nz, t));
  const T = add(p, mul(dz, h));
  const [cb, cm, ct] = cols;
  triDouble(b, L, M, T, cb, cm, ct);
  triDouble(b, M, R, T, cm, cb, ct);
  return b;
}

/** Catmull-Rom through control points (arrays of equal length), `sub` samples per span, end points kept exactly. */
export function spline(P, sub = 3) {
  const n = P.length, out = [];
  const at = (i) => P[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      out.push(at(i).map((_, a) => 0.5 * ((2 * at(i)[a]) + (-at(i - 1)[a] + at(i + 1)[a]) * t
        + (2 * at(i - 1)[a] - 5 * at(i)[a] + 4 * at(i + 1)[a] - at(i + 2)[a]) * t2
        + (-at(i - 1)[a] + 3 * at(i)[a] - 3 * at(i + 1)[a] + at(i + 2)[a]) * t3)));
    }
  }
  out.push(P[n - 1].slice());
  return out;
}

