// Laying a flat shape on the terrain mesh. The terrain is piecewise flat (two triangles a cell, split exactly as `grid.heightAt` and the render mesh split them), so a polygon drawn over
// it can be CUT along the triangle edges and every piece put on the plane of the triangle under it: it then follows every bump and is the terrain's own surface in another texture,
// whatever the shape's own height. Roads (roads.js) and the river's water (water.js) are laid this way. Pure JS, no three.
//
//   const D = makeDraper(grid);
//   D.cut(poly, (piece, F) => ...)   poly: a convex polygon, vertices [x, z, ...attributes]; each piece is a convex polygon over one terrain triangle F = [A, B, C] ([x, y, z, i, j]);
//                                    the attributes are carried through the cuts by linear blending (exact for anything affine over the polygon)
//   D.heightOn(F, x, z) / D.bary(F, x, z) / D.slope(F)
const lerpV = (a, b, t) => { const o = new Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] + (b[i] - a[i]) * t; return o; };

/** Keep the part of a polygon (vertices [x, z, ...]) where f(vertex) >= 0, f being linear over the polygon (the crossings are found by linear blending, so they are exact). */
export function clipScalar(poly, f) {
  const out = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) out.push(lerpV(a, b, fa / (fa - fb)));
  }
  return out;
}

/** The pieces of a polygon that lie over one terrain triangle F = [A, B, C]. */
export function clipToTriangle(poly, F) {
  const [A, B, C] = F;
  const o = (B[0] - A[0]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[0] - A[0]);
  const sgn = o >= 0 ? 1 : -1;
  const side = (P, Q) => (v) => sgn * ((Q[0] - P[0]) * (v[1] - P[2]) - (Q[2] - P[2]) * (v[0] - P[0]));
  let p = clipScalar(poly, side(A, B));
  if (p.length >= 3) p = clipScalar(p, side(B, C));
  if (p.length >= 3) p = clipScalar(p, side(C, A));
  return p;
}

/** plan area of a polygon ([x, z, ...] vertices) */
export function area(poly) {
  let a = 0;
  for (let k = 0; k < poly.length; k++) { const p = poly[k], q = poly[(k + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
}

/** is the polygon convex (so it can be cut as it is, without splitting it into triangles first) */
export function isConvex(poly) {
  let sign = 0;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length], c = poly[(k + 2) % poly.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cr); else if (Math.sign(cr) !== sign) return false;
  }
  return sign !== 0;
}

/** Drop the points of a polyline ([x, y, z] points) that lie within `tol` of the chord between their neighbours, keeping segments no longer than `maxSeg`: a straight stretch becomes one long segment. */
export function simplify(pts, maxSeg, tol) {
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

export function makeDraper(grid) {
  const { n, cell, half, heights: H } = grid, s = n + 1;
  const corner = (i, j) => [-half + i * cell, H[j * s + i], -half + j * cell, i, j];
  /** the two triangles of a grid cell, split as grid.heightAt and the render mesh split it */
  const trisOf = (i, j) => {
    const A = corner(i, j), B = corner(i + 1, j), C = corner(i, j + 1), D = corner(i + 1, j + 1);
    return ((i + j) & 1) === 0 ? [[A, D, B], [A, C, D]] : [[A, C, B], [B, C, D]];
  };
  const bary = (F, x, z) => {
    const [A, B, C] = F;
    const d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
    const w0 = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / d, w1 = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / d;
    return [w0, w1, 1 - w0 - w1];
  };
  const heightOn = (F, x, z) => { const w = bary(F, x, z); return w[0] * F[0][1] + w[1] * F[1][1] + w[2] * F[2][1]; };
  const slope = (F) => {
    const [A, B, C] = F;
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    return Math.acos(Math.min(1, Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1)));
  };
  const cut = (poly, fn) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    const i0 = Math.max(0, Math.floor((x0 + half) / cell)), i1 = Math.min(n - 1, Math.floor((x1 + half) / cell));
    const j0 = Math.max(0, Math.floor((z0 + half) / cell)), j1 = Math.min(n - 1, Math.floor((z1 + half) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      for (const F of trisOf(i, j)) {
        const piece = clipToTriangle(poly, F);
        if (piece.length >= 3 && area(piece) > 1e-7) fn(piece, F);
      }
    }
  };
  return { cut, bary, heightOn, slope, trisOf };
}
