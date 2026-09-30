// Roads: the cobble and dirt ribbons, DRAPED on the terrain mesh and MERGED where they meet.
//
// Laid on the ground (drape.js): every ribbon quad is cut against the terrain triangles under it and each piece is lifted a hair off the plane it lies on, so a road follows every bump and
// can never hover or sink. (A ribbon used to be three lanes standing at the height of its centre line: on a slope the edges floated up to 1.2 m above the ground, and on a bank they were
// buried, so roads looked like planks sticking out of the hillside.)
//
// Merged: where two roads of one kind overlap (a trail meeting the main road, a fork, a bend that folds over itself) they are the SAME surface: the texture is mapped from the world
// (u = x / tile, v = z / tile, as the terrain's own), and the worn, darker edge is worked out from the distance to the nearest edge of ANY road of the kind, not the edge of the ribbon
// being drawn. Two layers lying on top of each other then look identical at every point, so neither the seam of one road's edge across the other's middle nor the sawtooth where
// two coplanar layers fight (and where a fold mirrors the texture) can show. Cobble lies over dirt (a little higher, and a stronger polygon offset).
//
// Not everything a road covers is drawn: a piece on ground steeper than ROAD_MAX_SLOPE is left to the terrain (the river's carve bites into the road's side where they meet, and the
// ribbon used to slide down the bank in a wedge of dirt), and so is a piece under the river's water.
//
//   buildRoads(grid, lighting) -> { cobble, dirt: Builder | null, stats }      roadAt(grid, x, z) -> { id, surface, inside } | null
import { Builder, col } from '../engine/builder.js';
import { WATER_LEVEL } from './level.js';
import { makeDraper, isConvex, area, simplify } from './drape.js';

/** how far each kind of road stands off the ground (cobble over dirt where two meet), and how much polygon offset the material gets (see makeMaterial: `decal`) */
export const ROAD_LIFT = { cobble: 0.06, dirt: 0.04 };
export const ROAD_DECAL = { cobble: 1.5, dirt: true };
/** ground steeper than this (radians, about 37 degrees) carries no road */
export const ROAD_MAX_SLOPE = 0.64;
export const ROAD_STYLE = {
  cobble: { tile: 5, edgeTint: [0.78, 0.78, 0.86], centerTint: [1.05, 1.05, 1.05] },
  dirt: { tile: 5, edgeTint: [0.7, 0.66, 0.6], centerTint: [1.05, 1.05, 1.05] },
};

/**
 * How far inside the roads a point is: 1 on the middle of a road, 0 at its edge (and outside), the largest value over all the given paths. A spatial hash of the paths' segments keeps it cheap.
 * paths: [{ pts: [[x, y, z]...], width }]
 */
export function makeRoadField(paths) {
  const CS = 8, cells = new Map();
  const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  paths.forEach((p, pi) => {
    const hw = p.width / 2;
    for (let k = 0; k < p.pts.length - 1; k++) {
      const a = p.pts[k], b = p.pts[k + 1];
      const c0 = Math.floor((Math.min(a[0], b[0]) - hw) / CS), c1 = Math.floor((Math.max(a[0], b[0]) + hw) / CS);
      const d0 = Math.floor((Math.min(a[2], b[2]) - hw) / CS), d1 = Math.floor((Math.max(a[2], b[2]) + hw) / CS);
      for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) {
        const kk = key(cx, cz);
        let l = cells.get(kk);
        if (!l) { l = []; cells.set(kk, l); }
        l.push(pi, k);
      }
    }
  });
  /** the value at (x, z), and with `who` the index of the path it comes from */
  const at = (x, z, who) => {
    const l = cells.get(key(Math.floor(x / CS), Math.floor(z / CS)));
    let best = 0, bi = -1;
    if (l) {
      // per path: the nearest of its segments (a joint is rounded), and whether that nearest point is its first or last point with the road ending before it (a road ends flat, in a straight edge: nothing past its last point)
      const dist = new Map();
      for (let m = 0; m < l.length; m += 2) {
        const pi = l[m], k = l[m + 1], p = paths[pi], a = p.pts[k], b = p.pts[k + 1];
        const vx = b[0] - a[0], vz = b[2] - a[2], l2 = vx * vx + vz * vz || 1;
        const tr = ((x - a[0]) * vx + (z - a[2]) * vz) / l2, t = tr < 0 ? 0 : tr > 1 ? 1 : tr;
        const d = Math.hypot(x - (a[0] + vx * t), z - (a[2] + vz * t));
        const cur = dist.get(pi);
        if (!cur || d < cur.d) dist.set(pi, { d, off: (tr < 0 && k === 0) || (tr > 1 && k === p.pts.length - 2) });
      }
      for (const [pi, c] of dist) {
        if (c.off) continue;
        const f = 1 - c.d / (paths[pi].width / 2);
        if (f > best) { best = f; bi = pi; }
      }
    }
    if (who) who.i = bi;
    return best;
  };
  return at;
}

const fields = new WeakMap();
const fieldsOf = (grid) => {
  let f = fields.get(grid);
  if (!f) {
    f = {};
    for (const surface of ['cobble', 'dirt']) {
      const paths = grid.paths.filter((p) => p.surface === surface);
      f[surface] = { paths, at: makeRoadField(paths) };
    }
    fields.set(grid, f);
  }
  return f;
};

/** the road (if any) a point is on: the path it belongs to, its surface, and how far inside it is (0 at the edge, 1 in the middle). Cobble wins over dirt, as it is drawn over it. */
export function roadAt(grid, x, z) {
  const F = fieldsOf(grid), w = { i: -1 };
  for (const surface of ['cobble', 'dirt']) {
    const v = F[surface].at(x, z, w);
    if (v > 0 && w.i >= 0) return { id: F[surface].paths[w.i].id, surface, inside: v };
  }
  return null;
}

const wets = new WeakMap();
/** the road that is DRAWN at a point (roadAt, unless the ground there is too steep or under water: see drapeRibbon), or null */
export function drawnRoadAt(grid, x, z) {
  const r = roadAt(grid, x, z);
  if (!r) return null;
  let wet = wets.get(grid);
  if (!wet) { wet = riverSurfaceAt(grid); wets.set(grid, wet); }
  const h = grid.heightAt(x, z);
  if (grid.slopeAt(x, z) > ROAD_MAX_SLOPE || h < WATER_LEVEL - 0.05 || h < wet(x, z) - 0.03) return null;
  return r;
}

/**
 * Drape a ribbon along a polyline (points [x, y, z]; only x and z are used) of the given width onto the terrain, emitting triangles into `b`.
 * o: tile (metres per texture repeat), edgeTint / centerTint (colours: the worn, darker edge and the middle), lift, field (the roads' inside-ness: see makeRoadField),
 * wet(x, z) -> the river's surface height there or NaN (a piece lying under it is dropped).
 * Returns { footprint, draped, submerged, steep } in square metres (the ribbon's own area in plan, the area emitted, and the areas left out).
 */
export function drapeRibbon(b, grid, draper, points, width, o = {}) {
  const lift = o.lift ?? 0.05, tile = o.tile || 5;
  const eT = col(o.edgeTint || [1, 1, 1]), cT = col(o.centerTint || [1, 1, 1]);
  const field = o.field || (() => 1);
  points = simplify(points, o.maxSeg ?? 4.8, o.tol ?? 0.08);
  const np = points.length;
  const Rn = [];
  for (let i = 0; i < np; i++) {
    const a = points[Math.max(i - 1, 0)], c = points[Math.min(i + 1, np - 1)];
    const fx = c[0] - a[0], fz = c[2] - a[2];
    const l = Math.hypot(fx, fz) || 1;
    Rn.push([-fz / l, fx / l]);
  }
  const lane = (i, k) => [points[i][0] + Rn[i][0] * (width / 2) * k, points[i][2] + Rn[i][1] * (width / 2) * k];
  const stat = { footprint: 0, draped: 0, submerged: 0, steep: 0 };
  const tintAt = (x, z) => {
    const f = Math.min(1, Math.max(0, field(x, z)));
    return [eT[0] + (cT[0] - eT[0]) * f, eT[1] + (cT[1] - eT[1]) * f, eT[2] + (cT[2] - eT[2]) * f];
  };

  // one ribbon polygon (a convex quad or a triangle): cut it on every terrain triangle it touches, and emit the pieces lifted onto the surface
  const polygon = (poly) => {
    stat.footprint += area(poly);
    draper.cut(poly, (piece, F) => {
      const a = area(piece);
      if (draper.slope(F) > ROAD_MAX_SLOPE) { stat.steep += a; return; }
      const nrm = [0, 0, 0];
      const vs = piece.map((v) => {
        const w = draper.bary(F, v[0], v[1]);
        const n = [0, 0, 0];
        for (let q = 0; q < 3; q++) { const nk = grid.vertexNormal(F[q][3], F[q][4]); n[0] += w[q] * nk[0]; n[1] += w[q] * nk[1]; n[2] += w[q] * nk[2]; }
        const nl = Math.hypot(n[0], n[1], n[2]) || 1;
        return { x: v[0], z: v[1], y: w[0] * F[0][1] + w[1] * F[1][1] + w[2] * F[2][1] + lift, uv: [v[0] / tile, v[1] / tile], tint: tintAt(v[0], v[1]), n: [n[0] / nl, n[1] / nl, n[2] / nl] };
      });
      void nrm;
      const top = Math.max(...vs.map((v) => v.y)) - lift;
      const rs = o.wet ? o.wet((piece[0][0] + piece[1][0] + piece[2][0]) / 3, (piece[0][1] + piece[1][1] + piece[2][1]) / 3) : NaN;
      if (top < WATER_LEVEL - 0.05 || top < rs - 0.03) { stat.submerged += a; return; }        // (wholly under the lake or the river's water: nobody sees it)
      stat.draped += a;
      for (let k = 1; k < vs.length - 1; k++) {
        let [p, q, r] = [vs[0], vs[k], vs[k + 1]];
        const ux = q.x - p.x, uz = q.z - p.z, vx = r.x - p.x, vz = r.z - p.z;
        if (uz * vx - ux * vz < 0) [q, r] = [r, q];                                      // (counter-clockwise from above, as the terrain's own triangles)
        b.tri([p.x, p.y, p.z], [q.x, q.y, q.z], [r.x, r.y, r.z], p.uv, q.uv, r.uv, { tints: [p.tint, q.tint, r.tint], alphas: [1, 1, 1] }, [p.n, q.n, r.n]);
      }
    });
  };

  for (let i = 0; i < np - 1; i++) {
    for (const [k0, k1] of [[-1, 0], [0, 1]]) {
      const BL = lane(i, k0), BR = lane(i, k1), TR = lane(i + 1, k1), TL = lane(i + 1, k0);
      if (isConvex([BL, BR, TR, TL])) polygon([BL, BR, TR, TL]);
      else { polygon([BL, BR, TR]); polygon([BL, TR, TL]); }                          // (on a tight bend the inside lanes cross: two triangles, as a ribbon always was)
    }
  }
  return stat;
}

/** the river's surface height at a point from the lattice round the river (NaN where there is none), for the pieces of road that lie under its water */
export function riverSurfaceAt(grid) {
  const { n, cell, half, riverSurf: RS } = grid, s = n + 1;
  if (!RS) return () => NaN;
  return (x, z) => {
    const fx = (x + half) / cell, fz = (z + half) / cell;
    const i = Math.max(0, Math.min(n - 1, Math.floor(fx))), j = Math.max(0, Math.min(n - 1, Math.floor(fz)));
    const tx = fx - i, tz = fz - j;
    const a = RS[j * s + i], b = RS[j * s + i + 1], c = RS[(j + 1) * s + i], d = RS[(j + 1) * s + i + 1];
    if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d))) return NaN;
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  };
}

/** All the roads of the level: { cobble, dirt } builders (null when a surface has no road), and the areas drawn. */
export function buildRoads(grid, lighting) {
  const out = { cobble: null, dirt: null, stats: { footprint: 0, draped: 0, submerged: 0, steep: 0 } };
  const draper = makeDraper(grid), F = fieldsOf(grid), wet = riverSurfaceAt(grid);
  for (const surface of ['cobble', 'dirt']) {
    const b = new Builder({ lighting });
    for (const p of F[surface].paths) {
      const st = drapeRibbon(b, grid, draper, p.pts, p.width, { ...ROAD_STYLE[surface], lift: ROAD_LIFT[surface], field: F[surface].at, wet });
      for (const k of Object.keys(out.stats)) out.stats[k] += st[k];
    }
    if (b.triangleCount) out[surface] = b;
  }
  return out;
}
