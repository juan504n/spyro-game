// Roads: the cobble and dirt ribbons, DRAPED on the terrain mesh.
//
// A ribbon used to be three lanes (left edge, centre, right edge) that all stood at the height of the CENTRE line: fine on flat ground, but on a slope the edge lanes
// hovered above the ground on the downhill side (up to 1.2 m at the pier's landing, where three roads meet on a bank) and were buried on the uphill side, and where two roads
// overlapped each had its own height. They looked like planks sticking out of the hillside.
//
// Now every ribbon triangle is cut against the terrain triangles under it (the terrain is piecewise flat: two triangles a cell, split like `grid.heightAt` and the render mesh split
// them), and each piece is lifted a hair off the surface it lies on, so the road is the terrain's own surface in another texture: it follows every bump and cut, stands off by a
// constant `lift` everywhere and can never float or sink. Attributes (uv, tint) are carried through the cuts (they are affine over a ribbon triangle, so a linear blend is exact),
// and the normals are the terrain's smooth vertex normals, so the lighting matches the ground beside it. Pieces wholly under the lake are dropped.
//
//   buildRoads(grid, lighting) -> { cobble, dirt: Builder | null, stats }     (world.js meshes them; tools/level-check.mjs checks them against the terrain)
import { Builder, col } from '../engine/builder.js';
import { WATER_LEVEL } from './level.js';

/** how far each kind of road stands off the ground (cobble over dirt where two meet), and how much polygon offset the material gets (see makeMaterial: `decal`) */
export const ROAD_LIFT = { cobble: 0.06, dirt: 0.04 };
export const ROAD_DECAL = { cobble: 1.5, dirt: true };
const STYLE = {
  cobble: { tile: 5, edgeTint: [0.78, 0.78, 0.86], centerTint: [1.05, 1.05, 1.05] },
  dirt: { tile: 5, edgeTint: [0.7, 0.66, 0.6], centerTint: [1.05, 1.05, 1.05] },
};

const lerpV = (a, b, t) => { const o = new Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] + (b[i] - a[i]) * t; return o; };

/** Clip a polygon (vertices [x, z, ...attributes]) to the half plane on the inside of the edge P -> Q (sgn flips which side that is). */
function clipHalf(poly, px, pz, qx, qz, sgn) {
  const out = [];
  const ex = qx - px, ez = qz - pz;
  const f = (v) => sgn * (ex * (v[1] - pz) - ez * (v[0] - px));
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) out.push(lerpV(a, b, fa / (fa - fb)));
  }
  return out;
}

/** The pieces of a polygon that lie over one terrain triangle F = [A, B, C] (each [x, y, z, i, j]). */
function clipToTriangle(poly, F) {
  const [A, B, C] = F;
  const o = (B[0] - A[0]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[0] - A[0]);
  const sgn = o >= 0 ? 1 : -1;
  let p = clipHalf(poly, A[0], A[2], B[0], B[2], sgn);
  if (p.length >= 3) p = clipHalf(p, B[0], B[2], C[0], C[2], sgn);
  if (p.length >= 3) p = clipHalf(p, C[0], C[2], A[0], A[2], sgn);
  return p;
}

/** Drop the points of a polyline that lie within `tol` of the chord between their neighbours, keeping segments no longer than `maxSeg` (straight stretches become one long segment). */
function simplify(pts, maxSeg, tol) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let a = 0;
  while (a < pts.length - 1) {
    let j = a + 1;
    for (let k = a + 2; k < pts.length; k++) {
      const p = pts[a], q = pts[k], dx = q[0] - p[0], dz = q[2] - p[2], len = Math.hypot(dx, dz);
      if (len > maxSeg) break;
      let ok = true;
      for (let m = a + 1; m < k; m++) { const d = Math.abs((pts[m][0] - p[0]) * dz - (pts[m][2] - p[2]) * dx) / (len || 1); if (d > tol) { ok = false; break; } }
      if (!ok) break;
      j = k;
    }
    out.push(pts[j]);
    a = j;
  }
  return out;
}

/**
 * Drape a ribbon along a polyline (points [x, y, z]; only x and z are used) of the given width onto the terrain, emitting triangles into `b`.
 * o: tile (metres per texture repeat along the road), edgeTint / centerTint (colours: the worn, darker edge and the centre), lift.
 * Returns { footprint, draped, submerged } in square metres (the ribbon's own area in plan, the area emitted, the area dropped for lying under the lake).
 */
export function drapeRibbon(b, grid, points, width, o = {}) {
  const { n, cell, half, heights: H } = grid, s = n + 1;
  const lift = o.lift ?? 0.05, tile = o.tile || 5, uw = width / tile;
  const eT = col(o.edgeTint || [1, 1, 1]), cT = col(o.centerTint || [1, 1, 1]);
  points = simplify(points, o.maxSeg ?? 4.8, o.tol ?? 0.08);
  const np = points.length;
  const Rn = [];
  for (let i = 0; i < np; i++) {
    const a = points[Math.max(i - 1, 0)], c = points[Math.min(i + 1, np - 1)];
    let fx = c[0] - a[0], fz = c[2] - a[2];
    const l = Math.hypot(fx, fz) || 1;
    Rn.push([-fz / l, fx / l]);
  }
  const dists = [0];
  for (let i = 1; i < np; i++) dists.push(dists[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][2] - points[i - 1][2]));
  const lane = (i, k) => [points[i][0] + Rn[i][0] * (width / 2) * k, points[i][2] + Rn[i][1] * (width / 2) * k];
  const stat = { footprint: 0, draped: 0, submerged: 0 };

  const corner = (i, j) => [-half + i * cell, H[j * s + i], -half + j * cell, i, j];
  const terrainTris = (i, j) => {
    const A = corner(i, j), B = corner(i + 1, j), C = corner(i, j + 1), D = corner(i + 1, j + 1);
    return ((i + j) & 1) === 0 ? [[A, D, B], [A, C, D]] : [[A, C, B], [B, C, D]];           // (the very split grid.heightAt and the render mesh use)
  };
  const convex = (poly) => {
    let sign = 0;
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length], c = poly[(k + 2) % poly.length];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cr) < 1e-9) continue;
      if (sign === 0) sign = Math.sign(cr); else if (Math.sign(cr) !== sign) return false;
    }
    return sign !== 0;
  };
  const area = (poly) => { let a = 0; for (let k = 0; k < poly.length; k++) { const p = poly[k], q = poly[(k + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };

  // one ribbon polygon (a convex quad or a triangle): cut it on every terrain triangle it touches, and emit the pieces lifted onto the surface
  const triangle = (tri) => {
    stat.footprint += area(tri);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of tri) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    const i0 = Math.max(0, Math.floor((x0 + half) / cell)), i1 = Math.min(n - 1, Math.floor((x1 + half) / cell));
    const j0 = Math.max(0, Math.floor((z0 + half) / cell)), j1 = Math.min(n - 1, Math.floor((z1 + half) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      for (const F of terrainTris(i, j)) {
        let poly = clipToTriangle(tri, F);
        if (poly.length < 3) continue;
        const a = area(poly);
        if (a < 1e-7) continue;
        const [A, B, C] = F;
        const d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
        const vs = poly.map((v) => {
          const w0 = ((B[2] - C[2]) * (v[0] - C[0]) + (C[0] - B[0]) * (v[1] - C[2])) / d, w1 = ((C[2] - A[2]) * (v[0] - C[0]) + (A[0] - C[0]) * (v[1] - C[2])) / d, w2 = 1 - w0 - w1;
          const nrm = [0, 0, 0];
          for (const [w, K] of [[w0, A], [w1, B], [w2, C]]) { const nk = grid.vertexNormal(K[3], K[4]); nrm[0] += w * nk[0]; nrm[1] += w * nk[1]; nrm[2] += w * nk[2]; }
          const nl = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
          return { x: v[0], z: v[1], y: w0 * A[1] + w1 * B[1] + w2 * C[1] + lift, uv: [v[2], v[3]], tint: [v[4], v[5], v[6]], alpha: v[7], n: [nrm[0] / nl, nrm[1] / nl, nrm[2] / nl] };
        });
        if (Math.max(...vs.map((v) => v.y)) < WATER_LEVEL - 0.05) { stat.submerged += a; continue; }        // (wholly under the lake: nobody sees it)
        stat.draped += a;
        for (let k = 1; k < vs.length - 1; k++) {
          let [p, q, r] = [vs[0], vs[k], vs[k + 1]];
          const ux = q.x - p.x, uz = q.z - p.z, vx = r.x - p.x, vz = r.z - p.z;
          if (uz * vx - ux * vz < 0) [q, r] = [r, q];                                      // (counter-clockwise from above, as the terrain's own triangles)
          b.tri([p.x, p.y, p.z], [q.x, q.y, q.z], [r.x, r.y, r.z], p.uv, q.uv, r.uv, { tints: [p.tint, q.tint, r.tint], alphas: [p.alpha, q.alpha, r.alpha] }, [p.n, q.n, r.n]);
        }
      }
    }
  };

  for (let i = 0; i < np - 1; i++) {
    const v0 = dists[i] / tile, v1 = dists[i + 1] / tile;
    for (const [k0, k1] of [[-1, 0], [0, 1]]) {
      const tin = (k) => (k === 0 ? cT : eT);
      const u0 = (k0 + 1) / 2 * uw, u1 = (k1 + 1) / 2 * uw;
      const at = (idx, k, u, v) => { const p = lane(idx, k), t = tin(k); return [p[0], p[1], u, v, t[0], t[1], t[2], 1]; };
      const BL = at(i, k0, u0, v0), BR = at(i, k1, u1, v0), TR = at(i + 1, k1, u1, v1), TL = at(i + 1, k0, u0, v1);
      if (convex([BL, BR, TR, TL])) triangle([BL, BR, TR, TL]);
      else { triangle([BL, BR, TR]); triangle([BL, TR, TL]); }                     // (on a tight bend the inside lanes cross: two triangles, as a ribbon always was)
    }
  }
  return stat;
}

/** All the roads of the level: { cobble, dirt } builders (null when a surface has no road), and the areas drawn. */
export function buildRoads(grid, lighting) {
  const out = { cobble: null, dirt: null, stats: { footprint: 0, draped: 0, submerged: 0 } };
  for (const surface of ['cobble', 'dirt']) {
    const b = new Builder({ lighting });
    for (const p of grid.paths) {
      if (p.surface !== surface) continue;
      const st = drapeRibbon(b, grid, p.pts, p.width, { ...STYLE[surface], lift: ROAD_LIFT[surface] });
      out.stats.footprint += st.footprint; out.stats.draped += st.draped; out.stats.submerged += st.submerged;
    }
    if (b.triangleCount) out[surface] = b;
  }
  return out;
}
