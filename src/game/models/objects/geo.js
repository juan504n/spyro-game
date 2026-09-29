// Small geometry helpers shared by the interactive-object models. Everything here writes into a Builder
// (usually `Builder({ lit: true })`) so it works with the builder's transform stack and normals.
//
// Conventions (same as the Builder): counter-clockwise winding seen from outside, +Y up, a lathe/prism vertex i sits
// at angle a = i/n * TAU (+ rot) with position (r*sin a, y, r*cos a).  A prism whose FLAT FACE points at +Z needs
// rot = -PI/n  (see `flatRot`).
import { Builder } from '../../../engine/builder.js';

export const TAU = Math.PI * 2;
export const flatRot = (n) => -Math.PI / n;

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** frame-rate independent exponential approach */
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Lit builder with a uniform scale baked into its transform (so UVs stay in "local" units, geometry is scaled). */
export function litBuilder(S = 1, seed = 1) {
  const b = new Builder({ lit: true, seed });
  if (S !== 1) b.scale(S);
  return b;
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/** Orthonormal pair (u, v) with u x v = d. */
export function basis(d) {
  const h = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(h, d));
  const v = cross(d, u);
  return [u, v];
}

/**
 * Prismatic strut from p0 to p1 (width w0 at p0, w1 at p1). o.sides = 3 or 4 (default 4). Flat normals; o.caps adds end
 * caps ('top' = p1 end, 'both'). The side faces all get the same texture strip (u across, v along).
 */
export function strut(b, p0, p1, w0, w1 = w0, o = {}) {
  const d = norm(sub(p1, p0));
  const [u, v] = basis(d);
  const n = o.sides || 4;
  const ring = (p, w) => {
    const h = n === 4 ? w * 0.7071 : w * 0.58;   // circumradius so that a 4-strut is w wide and a 3-strut is about w
    const out = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + (n === 4 ? Math.PI / 4 : Math.PI / 2);
      out.push(add(p, add(mul(u, Math.cos(a) * h), mul(v, Math.sin(a) * h))));
    }
    return out;
  };
  const A = ring(p0, w0), B = ring(p1, w1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    b.quad(A[i], A[j], B[j], B[i], o);
  }
  if (o.caps) {
    if (n === 4) b.quad(B[0], B[1], B[2], B[3], o);
    else b.tri(B[0], B[1], B[2], [0, 0], [1, 0], [0.5, 1], o);
    if (o.caps === 'both') {
      if (n === 4) b.quad(A[3], A[2], A[1], A[0], o);
      else b.tri(A[2], A[1], A[0], [0, 0], [1, 0], [0.5, 1], o);
    }
  }
  return b;
}

/**
 * Front + back copy of a quad (BL, BR, TR, TL as seen from the front). The back copy has flipped winding AND flipped
 * normals so it is lit correctly from behind (the Builder's own `double` keeps the front normal).
 */
export function dquad(b, a, bb, c, d, o = {}) {
  let uv = o.uv;
  if (!uv) {
    const tile = o.tile || b.defaults.tile;
    const u0 = o.uOff || 0, v0 = o.vOff || 0;
    uv = [u0, v0, u0 + Math.hypot(bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]) / tile, v0 + Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]) / tile];
  }
  b.quad(a, bb, c, d, { ...o, uv, double: false });
  const n = normalOf(a, bb, d);
  const nb = [-n[0], -n[1], -n[2]];
  // back face: order BR, BL, TL, TR -> CCW seen from behind; same texel on the same corner
  const back = { ...o, uv: [uv[2], uv[1], uv[0], uv[3]], double: false };
  if (o.tints) back.tints = [o.tints[1], o.tints[0], o.tints[3], o.tints[2]];
  if (o.alphas) back.alphas = [o.alphas[1], o.alphas[0], o.alphas[3], o.alphas[2]];
  b.quad(bb, a, d, c, back, [nb, nb, nb, nb]);
  return b;
}

export function normalOf(a, b, d) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  return norm([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
}

/**
 * Fluted shaft: `n` flutes, cross-section alternates ridge (radius r) / groove (radius r*groove). Radius tapers from r0
 * (y0) to r1 (y1). Flat shaded so every flute catches its own light.
 */
export function fluted(b, { n = 8, r0 = 0.42, r1 = 0.34, groove = 0.8, y0 = 0, y1 = 1, rot = 0, tile = 3 } = {}, o = {}) {
  const m = n * 2;
  const P = (k, r, y) => {
    const a = (k / m) * TAU + rot;
    const rr = r * (k % 2 === 0 ? 1 : groove);
    return [rr * Math.sin(a), y, rr * Math.cos(a)];
  };
  for (let k = 0; k < m; k++) {
    const BL = P(k, r0, y0), BR = P(k + 1, r0, y0), TR = P(k + 1, r1, y1), TL = P(k, r1, y1);
    const w = Math.hypot(BR[0] - BL[0], BR[2] - BL[2]) / tile;
    const h = (y1 - y0) / tile;
    b.quad(BL, BR, TR, TL, { ...o, uv: [k * w * 0.5, 0, k * w * 0.5 + w, h] });
  }
  return b;
}

/** Filled fan (convex polygon) in a plane: pts = [[x,y,z]...] CCW from the +normal side. */
export function fan(b, centre, pts, o = {}, n = null) {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    b.tri(centre, p, q, o.uvC || [0.5, 0.5], o.uvs ? o.uvs[i] : [0, 0], o.uvs ? o.uvs[(i + 1) % pts.length] : [1, 0], o, n);
  }
  return b;
}

/** Cone/pyramid with `n` sides, base at y (radius r), apex at y+h. flat shaded. */
export function pyramid(b, n, r, h, o = {}) {
  return b.lathe([[r, 0], [0, h]], n, { smooth: false, ...o });
}

/** Colour helpers: multiply / mix tints ([r,g,b] 0..1). */
export const tintMul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const tintMix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/**
 * Surface of revolution with explicit texture rows. profile = [[r, y, v], ...] bottom -> top; u runs 0..o.uWrap (default
 * 1) once around. o.smooth (default true) shares normals between bands (round look), false = faceted. o.rot rotates the
 * seam. Other options (color, tints...) go to the builder.
 */
export function latheUV(b, profile, segs, o = {}) {
  const n = profile.length;
  const smoothN = o.smooth !== false;
  const uWrap = o.uWrap ?? 1, uOff = o.uOff || 0, rot = o.rot || 0;
  const segN = [];
  for (let k = 0; k < n - 1; k++) {
    const dr = profile[k + 1][0] - profile[k][0], dy = profile[k + 1][1] - profile[k][1];
    const l = Math.hypot(dr, dy) || 1;
    segN.push([dy / l, -dr / l]);
  }
  const ptN = profile.map((_, k) => {
    const a = segN[Math.max(k - 1, 0)], c = segN[Math.min(k, n - 2)];
    const x = a[0] + c[0], y = a[1] + c[1];
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  });
  for (let k = 0; k < n - 1; k++) {
    const [r0, y0, v0] = profile[k], [r1, y1, v1] = profile[k + 1];
    if (r0 === 0 && r1 === 0) continue;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * TAU + rot, a1 = ((i + 1) / segs) * TAU + rot;
      const s0 = Math.sin(a0), c0 = Math.cos(a0), s1 = Math.sin(a1), c1 = Math.cos(a1);
      const BL = [r0 * s0, y0, r0 * c0], BR = [r0 * s1, y0, r0 * c1], TR = [r1 * s1, y1, r1 * c1], TL = [r1 * s0, y1, r1 * c0];
      const u0 = uOff + (i / segs) * uWrap, u1 = uOff + ((i + 1) / segs) * uWrap;
      const N = (kk, s, c) => [ptN[kk][0] * s, ptN[kk][1], ptN[kk][0] * c];
      const ns = smoothN ? [N(k, s0, c0), N(k, s1, c1), N(k + 1, s1, c1), N(k + 1, s0, c0)] : null;
      if (r1 === 0) b.tri(BL, BR, TR, [u0, v0], [u1, v0], [u1, v1], o, ns && [ns[0], ns[1], ns[2]]);
      else if (r0 === 0) b.tri(BL, TR, TL, [u0, v0], [u1, v1], [u0, v1], o, ns && [ns[0], ns[2], ns[3]]);
      else b.quad(BL, BR, TR, TL, { ...o, uv: [u0, v0, u1, v1] }, ns);
    }
  }
  return b;
}
