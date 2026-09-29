// Shared modelling helpers for the village / architecture props.
//
// Conventions used by every village prop:
//   * local origin = ground centre of the prop, +Y up, +Z = FRONT (door / approach side), +X = right when facing the front
//   * lengths are world units (~metres), Spyro is ~1 tall; doors 3.2, windows 1.3
//   * winding is CCW-outward, so every helper takes quad corners as BL, BR, TR, TL seen from OUTSIDE
//   * big flat faces are subdivided into ~3-unit cells (like a PS1 artist would) so the affine texture warp stays tame,
//     and cells always share whole edges (no T-junctions)
import { vgrad } from '../../../engine/builder.js';

export { vgrad };
export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const mulc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const subv = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scv = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const lenv = (a) => Math.hypot(a[0], a[1], a[2]);

/** Standard albedo tints (texture * tint * baked light * 2). 1 = leave the texture alone. */
export const TINT = {
  white: [1, 1, 1],
  warm: [1.04, 0.98, 0.92],
  cool: [0.92, 0.94, 1.04],
  dark: [0.7, 0.7, 0.78],
  trim: [0.86, 0.78, 0.74],
  trimDark: [0.66, 0.58, 0.58],
  teal: [0.55, 1.0, 0.98],
  coral: [1.08, 0.62, 0.55],
  violet: [0.82, 0.62, 1.05],
  gold: [1.1, 0.95, 0.6],
  cream: [1.05, 1.0, 0.9],
  rune: [0.72, 0.5, 1.0],
  glass: [1.0, 0.94, 0.82],
};

/** Deterministic pick helpers that never touch Math.random. */
export const pick = (rng, arr) => arr[Math.floor(rng.next() * arr.length) % arr.length];

// ---------------------------------------------------------------------------------------------------------------
// Flat surfaces
// ---------------------------------------------------------------------------------------------------------------

/**
 * Subdivided parallelogram: origin O (bottom-left seen from outside), U = right vector (full width), V = up vector
 * (full height); nx x ny cells; normal = U x V must point outward.  o.tile = world units per texture repeat, or
 * o.nu / o.nv = number of texture repeats over the whole face (integer repeats keep timber posts on the corners);
 * o.u0 / o.v0 = uv origin.  Every other option (color, emissive, ...) is forwarded to Builder.quad.
 */
export function grid(b, O, U, V, nx, ny, o = {}) {
  const w = Math.hypot(U[0], U[1], U[2]), h = Math.hypot(V[0], V[1], V[2]);
  const tile = o.tile || 3.2;
  const nu = o.nu ?? w / tile, nv = o.nv ?? h / tile;
  const u0 = o.u0 ?? 0, v0 = o.v0 ?? 0;
  const P = (s, t) => [O[0] + U[0] * s + V[0] * t, O[1] + U[1] * s + V[1] * t, O[2] + U[2] * s + V[2] * t];
  for (let j = 0; j < ny; j++) {
    const t0 = j / ny, t1 = (j + 1) / ny;
    for (let i = 0; i < nx; i++) {
      const s0 = i / nx, s1 = (i + 1) / nx;
      b.quad(P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1), { ...o, uv: [u0 + nu * s0, v0 + nv * t0, u0 + nu * s1, v0 + nv * t1] });
    }
  }
}

/** Convex polygon (CCW from outside) as a triangle fan around pts[0]; uvOf(p) -> [u, v]. */
export function fan(b, pts, uvOf, o = {}) {
  for (let i = 1; i < pts.length - 1; i++) b.tri(pts[0], pts[i], pts[i + 1], uvOf(pts[0]), uvOf(pts[i]), uvOf(pts[i + 1]), o);
}

/** Quad from four points with texture repeats nu x nv (defaults to world size / tile). */
export function quadUV(b, a, bb, c, d, o = {}) {
  const tile = o.tile || 3.2;
  const w = Math.hypot(bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]) / tile;
  const h = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]) / tile;
  b.quad(a, bb, c, d, { ...o, uv: [o.u0 ?? 0, o.v0 ?? 0, (o.u0 ?? 0) + (o.nu ?? w), (o.v0 ?? 0) + (o.nv ?? h)] });
}

export const cells = (len, target = 3) => Math.max(1, Math.round(len / target));

/**
 * Box with independent top/bottom half extents (a frustum): centre (cx,cz), base y0 half sizes (hx0,hz0), top y1 half
 * sizes (hx1,hz1).  Side faces are planar quads.  o.faces subset of ['+z','-z','+x','-x','+y','-y'];
 * o.colors per face; o.uvSide = [nu, nv] fixes the repeats on side faces.
 */
export function frustum(b, cx, cz, hx0, hz0, hx1, hz1, y0, y1, o = {}) {
  const faces = o.faces || ['+z', '-z', '+x', '-x', '+y'];
  const P = (sx, sz, y) => [cx + sx * (y === y0 ? hx0 : hx1), y, cz + sz * (y === y0 ? hz0 : hz1)];
  const d = {
    '+z': [P(-1, 1, y0), P(1, 1, y0), P(1, 1, y1), P(-1, 1, y1)],
    '-z': [P(1, -1, y0), P(-1, -1, y0), P(-1, -1, y1), P(1, -1, y1)],
    '+x': [P(1, 1, y0), P(1, -1, y0), P(1, -1, y1), P(1, 1, y1)],
    '-x': [P(-1, -1, y0), P(-1, 1, y0), P(-1, 1, y1), P(-1, -1, y1)],
    '+y': [P(-1, 1, y1), P(1, 1, y1), P(1, -1, y1), P(-1, -1, y1)],
    '-y': [P(-1, -1, y0), P(1, -1, y0), P(1, 1, y0), P(-1, 1, y0)],
  };
  for (const f of faces) {
    const c = d[f];
    const fo = o.colors && o.colors[f] ? { ...o, color: o.colors[f] } : o;
    quadUV(b, c[0], c[1], c[2], c[3], fo);
  }
}

/** Faces of a wall-mounted frame: local +z = outward normal, +x = right seen from outside (see FACE). */
export const FACE = {
  '+z': { rot: 0, U: [1, 0, 0], N: [0, 0, 1] },
  '-z': { rot: PI, U: [-1, 0, 0], N: [0, 0, -1] },
  '+x': { rot: PI / 2, U: [0, 0, -1], N: [1, 0, 0] },
  '-x': { rot: -PI / 2, U: [0, 0, 1], N: [-1, 0, 0] },
};

/**
 * Run fn(b) with the builder transform moved onto a wall: origin at wall point (u along the wall, y) on the plane
 * `dist` from the centre of face `f`; inside, +z points out of the wall, +x is right, +y up.
 */
export function onFace(b, f, dist, u, y, fn) {
  const F = FACE[f];
  b.push().translate(F.N[0] * dist + F.U[0] * u, y, F.N[2] * dist + F.U[2] * u).rotateY(F.rot);
  fn(b);
  b.pop();
}

// ---------------------------------------------------------------------------------------------------------------
// Roofs
// ---------------------------------------------------------------------------------------------------------------

/**
 * Chunky gabled roof slab, ridge along local X, span along local Z, built as a closed slab with fascia, rake boards
 * and soffits.  Geometry is emitted in the CURRENT transform, so wrap with rotateY for the other orientation.
 *   L,S  = wall length along the ridge / wall span across it;  Hw = height where the wall meets the roof underside
 *   slope = rise/run of the underside;  oe/og = eave/gable overhang;  T = slab thickness
 * Returns { ybE, ytE, yb0, ytR, E, X1 } (heights of eave edge / ridge, underside + top).
 */
export function roofGable(kit, o) {
  const { L, S, Hw, slope = 1.05, oe = 0.75, og = 0.6, T = 0.32, lift = 0.16, tex = 'roof_red', tint = [1, 1, 1], eaveTint = [0.78, 0.74, 0.8], trimTint = TINT.trimDark, tile = 3.2, ridge = true, ridgeTint = [0.62, 0.5, 0.48], ridgeTex = 'wood_plank', ridgeH = 0.34, ridgeW = 0.62 } = o;
  const X1 = L / 2 + og, E = S / 2 + oe;
  const ybE = Hw - slope * oe, ytE = ybE + T;
  const yb0 = Hw + slope * (S / 2), ytR = yb0 + T;
  const rb = kit.b(tex), wood = kit.b('wood_plank');
  const col = vgrad(ytE, mulc(tint, 1), ytR, mulc(tint, 1.08));
  const slopeLen = Math.hypot(E, ytR - ytE);
  const nx = cells(2 * X1, 3), ny = cells(slopeLen, 3);
  // top slopes
  grid(rb, [-X1, ytE, E], [2 * X1, 0, 0], [0, ytR - ytE, -E], nx, ny, { tile, color: vgrad(ytE, mulc(tint, 0.9), ytR, mulc(tint, 1.05)), emissive: lift });
  grid(rb, [X1, ytE, -E], [-2 * X1, 0, 0], [0, ytR - ytE, E], nx, ny, { tile, color: vgrad(ytE, mulc(tint, 0.9), ytR, mulc(tint, 1.05)), emissive: lift });
  // eave fascia boards
  const tc = { tile: 3.2, color: trimTint };
  wood.quad([-X1, ybE, E], [X1, ybE, E], [X1, ytE, E], [-X1, ytE, E], { ...tc, uv: [0, 0, 2 * X1 / 3.2, T / 3.2] });
  wood.quad([X1, ybE, -E], [-X1, ybE, -E], [-X1, ytE, -E], [X1, ytE, -E], { ...tc, uv: [0, 0, 2 * X1 / 3.2, T / 3.2] });
  // rake (gable-end) boards: the slab's end faces
  const sl = Math.hypot(E, yb0 - ybE) / 3.2;
  wood.quad([X1, ybE, E], [X1, yb0, 0], [X1, ytR, 0], [X1, ytE, E], { ...tc, uv: [0, 0, sl, T / 3.2] });
  wood.quad([X1, yb0, 0], [X1, ybE, -E], [X1, ytE, -E], [X1, ytR, 0], { ...tc, uv: [0, 0, sl, T / 3.2] });
  wood.quad([-X1, yb0, 0], [-X1, ybE, E], [-X1, ytE, E], [-X1, ytR, 0], { ...tc, uv: [0, 0, sl, T / 3.2] });
  wood.quad([-X1, ybE, -E], [-X1, yb0, 0], [-X1, ytR, 0], [-X1, ytE, -E], { ...tc, uv: [0, 0, sl, T / 3.2] });
  // soffits (underside of the overhangs)
  const sc = { tile: 3.2, color: eaveTint };
  wood.quad([-X1, Hw, S / 2], [X1, Hw, S / 2], [X1, ybE, E], [-X1, ybE, E], sc);
  wood.quad([X1, Hw, -S / 2], [-X1, Hw, -S / 2], [-X1, ybE, -E], [X1, ybE, -E], sc);
  const L2 = L / 2;
  wood.quad([L2, yb0, 0], [X1, yb0, 0], [X1, Hw, S / 2], [L2, Hw, S / 2], sc);
  wood.quad([X1, yb0, 0], [L2, yb0, 0], [L2, Hw, -S / 2], [X1, Hw, -S / 2], sc);
  wood.quad([-X1, yb0, 0], [-L2, yb0, 0], [-L2, Hw, S / 2], [-X1, Hw, S / 2], sc);
  wood.quad([-L2, yb0, 0], [-X1, yb0, 0], [-X1, Hw, -S / 2], [-L2, Hw, -S / 2], sc);
  // ridge cap
  if (ridge) {
    const rt = kit.b(ridgeTex);
    rt.box(0, ytR + ridgeH / 2 - 0.12, 0, 2 * X1 + 0.1, ridgeH, ridgeW, { tile: 1.6, color: ridgeTint, faces: ['+z', '-z', '+x', '-x', '+y'] });
  }
  return { ybE, ytE, yb0, ytR, E, X1 };
}

/**
 * Convex planar polygon (CCW from outside) with world-projected UVs: u = dot(p, uAxis)/tile, v = dot(p, vAxis)/tile.
 * Use for faces that are not axis-aligned rectangles (arch spandrels, tapered faces) so texel density stays constant.
 */
export function planar(b, pts, uAxis, vAxis, o = {}) {
  const tile = o.tile || 3.2;
  const ou = o.u0 || 0, ov = o.v0 || 0;
  const uv = pts.map((p) => [(p[0] * uAxis[0] + p[1] * uAxis[1] + p[2] * uAxis[2]) / tile + ou, (p[0] * vAxis[0] + p[1] * vAxis[1] + p[2] * vAxis[2]) / tile + ov]);
  for (let i = 1; i < pts.length - 1; i++) b.tri(pts[0], pts[i], pts[i + 1], uv[0], uv[i], uv[i + 1], o);
}

/** Point on a circle in the XY plane centred (cx,cy). */
export const arcPt = (cx, cy, r, th, z = 0) => [cx + r * Math.cos(th), cy + r * Math.sin(th), z];

/** Colliders in prop space for a Y-rotated frame: box centre (cx,cz) given in the rotated frame. */
export function frameBox(kit, theta, cx, cz, hx, hz, y0, y1, o = {}) {
  const c = Math.cos(theta), s = Math.sin(theta);
  kit.box(cx * c + cz * s, -cx * s + cz * c, hx, hz, y0, y1, { ...o, rot: (o.rot || 0) + theta });
}

/**
 * Tapered square column built from `rows` stacked frustums so tall faces keep small cells (tame affine warp) and the
 * texture runs continuously (v accumulates).  Shares whole edges between rows (no T-junctions).
 */
export function column(b, cx, cz, hx0, hz0, hx1, hz1, y0, y1, rows, o = {}) {
  const tile = o.tile || 3.2;
  for (let r = 0; r < rows; r++) {
    const t0 = r / rows, t1 = (r + 1) / rows;
    const ya = lerp(y0, y1, t0), yb = lerp(y0, y1, t1);
    const ha = [lerp(hx0, hx1, t0), lerp(hz0, hz1, t0)], hb = [lerp(hx0, hx1, t1), lerp(hz0, hz1, t1)];
    const faces = (o.faces || ['+z', '-z', '+x', '-x']).filter((f) => f[1] !== 'y');
    const colr = typeof o.color === 'function' ? o.color : o.color;
    frustum(b, cx, cz, ha[0], ha[1], hb[0], hb[1], ya, yb, { ...o, faces, v0: ((ya - y0) / tile) + (o.v0 || 0) });
  }
  if ((o.faces || []).includes('+y')) frustum(b, cx, cz, hx1, hz1, hx1, hz1, y1, y1, { ...o, faces: ['+y'] });
}

/** Polar helper: angle phi measured from +Z toward +X (same convention as rotateY(phi) applied to a local +Z vector). */
export const polar = (r, phi, y = 0) => [r * Math.sin(phi), y, r * Math.cos(phi)];

/**
 * Box strut between two points (thickness w), drawn with the builder transform stack (local axes: z = along the strut).
 * `b` is any Builder (they share one transform stack).
 */
export function strut(b, A, B, w, o = {}) {
  const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
  const len = Math.hypot(dx, dy, dz);
  const yaw = Math.atan2(dx, dz);
  const pitch = -Math.asin(clamp(dy / len, -1, 1));
  b.push().translate((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2).rotateY(yaw).rotateX(pitch);
  b.box(0, 0, 0, w, o.h ?? w, len, { tile: o.tile || 2.4, color: o.color, emissive: o.emissive, faces: o.faces || ['+z', '-z', '+x', '-x', '+y', '-y'] });
  b.pop();
}

/** Horizontal sector of an annulus (walkway / deck): r0..r1, phi a0..a1 (radians, phi from +Z toward +X), n segments. */
export function annulus(b, r0, r1, y, a0, a1, n, o = {}) {
  const up = o.up !== false;
  const tile = o.tile || 3.0;
  for (let i = 0; i < n; i++) {
    const p0 = a0 + ((a1 - a0) * i) / n, p1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const I0 = polar(r0, p0, y), I1 = polar(r0, p1, y), O0 = polar(r1, p0, y), O1 = polar(r1, p1, y);
    const uvw = ((r0 + r1) / 2) * Math.abs(p1 - p0) / tile, uvh = (r1 - r0) / tile;
    const uv = [o.u0 ?? 0, o.v0 ?? 0, (o.u0 ?? 0) + uvw, (o.v0 ?? 0) + uvh];
    if (up) b.quad(O0, O1, I1, I0, { ...o, uv });
    else b.quad(I0, I1, O1, O0, { ...o, uv });
  }
}

/** Vertical band on a circle of radius r between y0..y1 over phi a0..a1, facing out (or in when inward). */
export function cylBand(b, r, y0, y1, a0, a1, n, o = {}) {
  const tile = o.tile || 3.0;
  for (let i = 0; i < n; i++) {
    const p0 = a0 + ((a1 - a0) * i) / n, p1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const A = polar(r, p0, y0), B = polar(r, p1, y0), C = polar(r, p1, y1), D = polar(r, p0, y1);
    const uvw = r * Math.abs(p1 - p0) / tile, uvh = (y1 - y0) / tile;
    const uv = [o.u0 ?? 0, o.v0 ?? 0, (o.u0 ?? 0) + uvw, (o.v0 ?? 0) + uvh];
    if (o.inward) b.quad(B, A, D, C, { ...o, uv });
    else b.quad(A, B, C, D, { ...o, uv });
  }
}

/**
 * Arch unit in the local XY plane (centre plane z=0): spandrel strips from the arch curve up to Yt on both faces
 * (z = +-D), a proud archivolt ring (alternating voussoirs, optional emissive inner band, keystone diamond) and the
 * intrados across the full depth.  Opening half-width a, springing height ys.
 */
export function archUnit(kit, o) {
  const { a, ys, Yt, D, n = 10, prud = 0.16, ringW = 0.85, tex = 'brick', tint = [1, 1, 1], emissive = 0.22, glow = true, glowColor = [0.66, 0.46, 1.0], tunnel = true, keystone = true, tile = 3.2, strips = true, edges = true } = o;
  const st = kit.b(tex), gb = kit.b(null);
  const Ro = a + ringW, Dr = D + prud;
  const th = (i) => PI - (i * PI) / n;
  const so = { tile, emissive };
  for (const sg of [1, -1]) {
    const zf = sg * D, zr = sg * Dr;
    const P = (px, py, zz = zf) => [sg * px, py, zz];
    const uA = [sg, 0, 0], Y = [0, 1, 0];
    if (strips) {
      for (let i = 0; i < n; i++) {
        const q0 = arcPt(0, ys, a, th(i)), q1 = arcPt(0, ys, a, th(i + 1));
        planar(st, [P(q0[0], q0[1]), P(q1[0], q1[1]), P(q1[0], Yt), P(q0[0], Yt)], uA, Y, { ...so, color: tint });
      }
    }
    const rg = glow ? a + 0.26 : a;
    for (let i = 0; i < n; i++) {
      const t0 = th(i), t1 = th(i + 1);
      const pt = (r, t) => { const q = arcPt(0, ys, r, t); return P(q[0], q[1], zr); };
      if (glow) gb.quad(pt(a, t0), pt(a, t1), pt(rg, t1), pt(rg, t0), { color: glowColor, emissive: 1 });
      const shade = i % 2 ? 1.08 : 0.9;
      planar(st, [pt(rg, t0), pt(rg, t1), pt(Ro, t1), pt(Ro, t0)], uA, Y, { ...so, color: mulc(tint, shade) });
      if (edges) {
        const e0 = arcPt(0, ys, Ro, t0), e1 = arcPt(0, ys, Ro, t1);
        planar(st, [P(e0[0], e0[1], zr), P(e1[0], e1[1], zr), P(e1[0], e1[1], zf), P(e0[0], e0[1], zf)], sg > 0 ? [1, 0, 0] : [-1, 0, 0], Y, { ...so, color: mulc(tint, shade * 0.85) });
      }
    }
    if (keystone) {
      const kc = arcPt(0, ys, a + ringW * 0.62, PI / 2), kk = 0.42;
      const zk = zr + sg * 0.06;
      gb.quad(P(kc[0], kc[1] - kk, zk), P(kc[0] + kk * 0.7, kc[1], zk), P(kc[0], kc[1] + kk, zk), P(kc[0] - kk * 0.7, kc[1], zk), { color: [0.9, 0.7, 1.0], emissive: 1 });
    }
  }
  if (tunnel) {
    for (let i = 0; i < n; i++) {
      const q0 = arcPt(0, ys, a, th(i)), q1 = arcPt(0, ys, a, th(i + 1));
      planar(st, [[q1[0], q1[1], Dr], [q0[0], q0[1], Dr], [q0[0], q0[1], -Dr], [q1[0], q1[1], -Dr]], [0, 0, 1], [1, 0, 0], { ...so, color: mulc(tint, 0.66) });
    }
  }
  return { Ro, Dr };
}
