// Shared modelling helpers for the nature props.
//
// Everything here is PURE and DETERMINISTIC (a seeded RNG is always passed in) because props execute twice
// (dry pass + wet pass).  All helpers emit vertices in the PROP FRAME (the frame inside kit.at) so that colour
// functions see prop-frame coordinates: a vertical gradient is a gradient in tree/rock height.
import { col } from '../../../engine/builder.js';
import { WATER_LEVEL } from '../../level.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const mulc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const addc = (c, k) => [c[0] + k, c[1] + k, c[2] + k];
export const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ---- parameter sanitising: props are called by level code with arbitrary params; never let junk produce NaN -----------
/** finite number clamped to [lo, hi], else def */
export const num = (v, def, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
/** integer version of num */
export const int = (v, def, lo, hi) => Math.round(num(v, def, lo, hi));
/** scale factor from 's' | 'm' | 'l' or a number */
export const sizeK = (v, def = 1) => (v === 's' ? 0.75 : v === 'm' ? 1 : v === 'l' ? 1.3 : num(v, def, 0.4, 2.5));
/** v if it is one of list else def */
export const oneOf = (v, list, def) => (list.includes(v) ? v : def);

/**
 * The engine's foliage sway displaces vertices by (world y * 0.03), so foliage high above sea level (hills, sky isles)
 * would slide against its own trunk / the ground.  Props only ask for sway below `limit` metres of world height.
 */
export const swayOK = (kit, x, z, y, limit) => (typeof y === 'number' && Number.isFinite(y) ? y : kit.groundY(x, z)) < limit;

/**
 * Ground cover stands on the ground under it, not at the height of the middle of its patch: a patch of flowers is 3 to 5.6 m across, so on any slope or ledge a flower at the same height as
 * the patch's centre hung in the air (or was buried): about a quarter of the Vale's flowers, tufts and ferns floated more than 15 cm up, some by metres, over a cliff's edge or the shore.
 * The height of the terrain under the point (lx, lz) of the patch the kit is working on (`kit.at`), in the patch's own units (so it is the `y` to draw at), or `null` where nothing should
 * grow: the ground there is steeper than `slope` (a cliff face: an upright flower on it hangs over the drop) or under the water, deeper than `wade` metres (a reed stands in the shallows, at
 * the water's surface; nothing else grows under it). A prop that was given a `y` of its own (a sky island's top, a pond's edge) is on a floor the terrain knows nothing of: 0, flat, as it was.
 */
export function groundAt(kit, lx, lz, { y, slope = 0.55, wade = 0 } = {}) {
  if (typeof y === 'number' && Number.isFinite(y)) return 0;
  const o = kit.origin, c = Math.cos(o.rot), s = Math.sin(o.rot);
  const wx = o.x + (lx * c + lz * s) * o.scale, wz = o.z + (lz * c - lx * s) * o.scale;
  let g = kit.groundY(wx, wz);
  if (g < WATER_LEVEL) { if (g < WATER_LEVEL - wade) return null; g = WATER_LEVEL; }
  if (kit.grid.slopeAt && kit.grid.slopeAt(wx, wz) > slope) return null;
  return (g - o.y) / o.scale;
}

/**
 * Props that float (sky-island decor, the islands themselves) must not sample the TERRAIN shadow map: the map only knows
 * about the ground far below them, which smears dark streaks over their tops.  For the duration of `fn` the lighting
 * object reports full visibility (vis = 1) so those vertices get plain sky + sun/moon light.
 */
export function unshadowed(kit, fn) {
  const L = kit.lighting;
  if (!L || typeof L.vis !== 'function') return fn();
  const own = Object.prototype.hasOwnProperty.call(L, 'vis');
  const old = L.vis;
  L.vis = () => 1;
  try { return fn(); } finally { if (own) L.vis = old; else delete L.vis; }
}

/** Stable 0..1 hash of a 3D point: per-vertex colour noise without any RNG state (shared vertices share noise). */
export function h3(x, y, z) {
  let h = (Math.floor(x * 5.13 + 1000) * 374761393 + Math.floor(y * 5.13 + 1000) * 668265263 + Math.floor(z * 5.13 + 1000) * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Colour function: vertical gradient c0 (at y0) -> c1 (at y1) in the prop frame, with optional per-vertex noise.
 * Darker near the ground reads as baked AO; darker underneath a canopy reads as self shadow.
 */
export function shade(y0, c0, y1, c1, noise = 0) {
  const a = col(c0), b = col(c1);
  return (x, y, z) => {
    const t = clamp((y - y0) / (y1 - y0));
    const n = noise ? 1 + (h3(x, y, z) - 0.5) * 2 * noise : 1;
    return [(a[0] + (b[0] - a[0]) * t) * n, (a[1] + (b[1] - a[1]) * t) * n, (a[2] + (b[2] - a[2]) * t) * n];
  };
}

/** Radial-ish colour: darker toward the bottom of a lump centred at cy with radius r, plus noise. */
export function lumpShade(cy, r, dark, light, noise = 0.05) {
  return shade(cy - r, dark, cy + r * 0.9, light, noise);
}

// ------------------------------------------------------------------------------------------------------------------
// lump: a faceted icosphere blob (the PS1 "foliage clump / boulder"), emitted in the prop frame.
// ------------------------------------------------------------------------------------------------------------------
const _ico = new Map();
/** Unit-sphere meshes: detail 0/1/2 = icosphere (20/80/320 faces); 'o1'/'o2' = octasphere (32/128 faces). */
function ico(detail) {
  let g = _ico.get(detail);
  if (g) return g;
  let V, F, steps;
  if (typeof detail === 'string') {
    V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    F = [[0, 2, 4], [1, 4, 2], [0, 5, 2], [1, 2, 5], [0, 4, 3], [1, 3, 4], [0, 3, 5], [1, 5, 3]];
    steps = +detail.slice(1);
  } else {
    const t = (1 + Math.sqrt(5)) / 2;
    V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
      .map(norm3);
    F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    steps = detail;
  }
  for (let d = 0; d < steps; d++) {
    const cache = new Map();
    const mid = (a, b) => {
      const k = a < b ? a + '_' + b : b + '_' + a;
      if (cache.has(k)) return cache.get(k);
      V.push(norm3([(V[a][0] + V[b][0]) / 2, (V[a][1] + V[b][1]) / 2, (V[a][2] + V[b][2]) / 2]));
      cache.set(k, V.length - 1);
      return V.length - 1;
    };
    const nf = [];
    for (const [a, b, c] of F) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    F = nf;
  }
  g = { V, F };
  _ico.set(detail, g);
  return g;
}

const inside = (x, y, z, hide) => {
  for (let i = 0; i < hide.length; i++) {
    const h = hide[i];
    const dx = (x - h[0]) / h[3], dy = (y - h[1]) / h[4], dz = (z - h[2]) / h[5];
    if (dx * dx + dy * dy + dz * dz < 1) return true;
  }
  return false;
};

/**
 * Emit one lump into builder `b`.
 *  c = [x,y,z] centre in the prop frame, r = radius.
 *  o: detail 0..2 (icosphere 20/80/320 faces) or 'o1'/'o2' (octasphere 32/128), noise (radial), sx/sy/sz squash, rot (Y), tile, smooth 0..1 (0 = flat facets,
 *     1 = Gouraud radial normals), color (array | fn), emissive, aoFn,
 *     hide: [[cx,cy,cz,rx,ry,rz], ...] ellipsoids: faces whose centroid lies inside one are skipped (interior faces),
 *     minY: skip faces whose centroid is below this prop-frame y, flatY: clamp vertices up to this local y offset (flat bottoms),
 *     floorY: clamp vertices up to this PROP-FRAME y after rotation (level flat bottoms even when the lump is tilted),
 *     skipDown: skip faces with normal.y below -skipDown (buried undersides),
 *     topB/topAt/topTile/topColor: faces with normal.y > topAt go to another builder (e.g. moss caps on rocks).
 * The RNG is consumed identically whatever gets culled, so a prop's shape never depends on culling.
 */
export function lump(b, rng, c, r, o = {}) {
  const {
    detail = 1, noise = 0.2, sx = 1, sy = 1, sz = 1, rot = 0, rotX = 0, rotZ = 0, tile = 4, smooth = 0.5, hide = null, minY = -Infinity,
    flatY = null, floorY = -Infinity, skipDown = 2, topB = null, topAt = 0.6, topTile = tile, topColor = null,
  } = o;
  const g = ico(detail);
  const rad = g.V.map(() => 1 + (rng.next() - 0.5) * 2 * noise);
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const cx_ = Math.cos(rotX), sx_ = Math.sin(rotX), cz_ = Math.cos(rotZ), sz_ = Math.sin(rotZ);
  const tilt = rotX !== 0 || rotZ !== 0;
  // local tilt (Z then X) followed by the yaw about Y
  const rotv = (x, y, z) => {
    if (tilt) {
      const x1 = x * cz_ - y * sz_, y1 = x * sz_ + y * cz_;
      const y2 = y1 * cx_ - z * sx_, z2 = y1 * sx_ + z * cx_;
      x = x1; y = y2; z = z2;
    }
    return [x * cr + z * sr, y, -x * sr + z * cr];
  };
  const P = g.V.map((v, i) => {
    const x = v[0] * r * rad[i] * sx;
    let y = v[1] * r * rad[i] * sy;
    const z = v[2] * r * rad[i] * sz;
    if (flatY !== null && y < flatY) y = flatY;
    const q = rotv(x, y, z);
    return [c[0] + q[0], Math.max(c[1] + q[1], floorY), c[2] + q[2]];
  });
  const N = smooth > 0 ? g.V.map((v) => norm3(rotv(v[0] / (sx * sx), v[1] / (sy * sy), v[2] / (sz * sz)))) : null;
  const base = { color: o.color, emissive: o.emissive, aoFn: o.aoFn, alpha: o.alpha };
  const topO = topB ? { ...base, color: topColor || o.color } : null;
  for (const [ia, ib, ic] of g.F) {
    const p0 = P[ia], p1 = P[ib], p2 = P[ic];
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    const n = norm3([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
    const cx = (p0[0] + p1[0] + p2[0]) / 3, cy = (p0[1] + p1[1] + p2[1]) / 3, cz = (p0[2] + p1[2] + p2[2]) / 3;
    if (cy < minY || n[1] < -skipDown) continue;
    if (p0[1] <= floorY + 1e-6 && p1[1] <= floorY + 1e-6 && p2[1] <= floorY + 1e-6) continue;
    // cull interior faces only when the centroid AND all three vertices lie inside another lump (no cracks at the seams)
    if (hide && inside(cx, cy, cz, hide) && inside(p0[0], p0[1], p0[2], hide) && inside(p1[0], p1[1], p1[2], hide) && inside(p2[0], p2[1], p2[2], hide)) continue;
    const top = topB && n[1] > topAt;
    const tl = top ? topTile : tile;
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const uvf = (p) => (ay >= ax && ay >= az ? [p[0] / tl, p[2] / tl] : ax >= az ? [p[2] / tl, p[1] / tl] : [p[0] / tl, p[1] / tl]);
    let nn = n;
    if (N) {
      const mixn = (m) => norm3([n[0] * (1 - smooth) + m[0] * smooth, n[1] * (1 - smooth) + m[1] * smooth, n[2] * (1 - smooth) + m[2] * smooth]);
      nn = [mixn(N[ia]), mixn(N[ib]), mixn(N[ic])];
    }
    (top ? topB : b).tri(p0, p1, p2, uvf(p0), uvf(p1), uvf(p2), top ? topO : base, nn);
  }
}

/** Ellipsoid used to cull faces of OTHER lumps (0.8 of the nominal radius keeps the seam closed). */
export const hideOf = (c, r, sx = 1, sy = 1, sz = 1, k = 0.8) => [c[0], c[1], c[2], r * sx * k, r * sy * k, r * sz * k];

/**
 * Emit a cluster of lumps that cull each other's interior faces. specs: [{ c, r, sx, sy, sz, detail, noise, rot, smooth }]
 * common: options shared by all lumps; common.colorFor(spec, index) -> colour (array | fn) overrides common.color per lump.
 */
export function lumps(b, rng, specs, common = {}) {
  const hs = specs.map((s) => hideOf(s.c, s.r, s.sx ?? 1, s.sy ?? 1, s.sz ?? 1, s.hideK ?? 0.78));
  specs.forEach((s, i) => {
    const hide = hs.filter((_, j) => j !== i);
    const color = common.colorFor ? common.colorFor(s, i) : common.color;
    lump(b, rng, s.c, s.r, { ...common, ...s, color, hide: [...(common.hide || []), ...hide] });
  });
}

// ------------------------------------------------------------------------------------------------------------------
// tube: a tube swept along a polyline (trunks, branches, roots, cords, logs), smooth-shaded, parallel-transport frames.
// ------------------------------------------------------------------------------------------------------------------
/**
 * pts: [[x,y,z], ...] ring centres; radii: number[] (or one number). o:
 *   segs = 6, tile = 3 (world units per V repeat), aspect = 0.5 (texture w/h -> keeps texel squares), uRep (override),
 *   color (array | fn), capStart / capEnd: 'flat' | 'point' | null, capLen (height of point caps), rot0 (start angle),
 *   smooth = 1 (radial normals), emissive, aoFn, vOff.
 */
export function tube(b, pts, radii, o = {}) {
  const { segs = 6, tile = 3, aspect = 0.5, color, capStart = null, capEnd = null, capLen = 0.5, rot0 = 0, smooth = 1, vOff = 0 } = o;
  const n = pts.length;
  const R = Array.isArray(radii) ? radii : pts.map(() => radii);
  const T = pts.map((p, i) => {
    const a = pts[Math.max(i - 1, 0)], c = pts[Math.min(i + 1, n - 1)];
    return norm3([c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
  });
  // parallel transport frames
  const Nn = [];
  let N0 = Math.abs(T[0][1]) > 0.95 ? [1, 0, 0] : norm3(cross3([0, 1, 0], T[0]));
  N0 = norm3(cross3(T[0], cross3(N0, T[0])));
  Nn.push(N0);
  for (let i = 1; i < n; i++) {
    const p = Nn[i - 1], t = T[i];
    const d = dot3(p, t);
    Nn.push(norm3([p[0] - t[0] * d, p[1] - t[1] * d, p[2] - t[2] * d]));
  }
  const rmax = Math.max(...R);
  const uRep = o.uRep || Math.max(1, Math.round((TAU * rmax) / (tile * aspect)));
  const ring = pts.map((p, i) => {
    const Bv = cross3(T[i], Nn[i]);
    const out = [];
    for (let k = 0; k <= segs; k++) {
      const a = rot0 + (k / segs) * TAU;
      const cs = Math.cos(a), sn = Math.sin(a);
      const nrm = [Nn[i][0] * cs + Bv[0] * sn, Nn[i][1] * cs + Bv[1] * sn, Nn[i][2] * cs + Bv[2] * sn];
      out.push({ p: [p[0] + nrm[0] * R[i], p[1] + nrm[1] * R[i], p[2] + nrm[2] * R[i]], n: nrm });
    }
    return out;
  });
  const dist = [0];
  for (let i = 1; i < n; i++) dist.push(dist[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const base = { color, emissive: o.emissive, aoFn: o.aoFn, alpha: o.alpha };
  for (let i = 0; i < n - 1; i++) {
    const v0 = vOff + dist[i] / tile, v1 = vOff + dist[i + 1] / tile;
    for (let k = 0; k < segs; k++) {
      const u0 = (k / segs) * uRep, u1 = ((k + 1) / segs) * uRep;
      const BL = ring[i][k], BR = ring[i][k + 1], TR = ring[i + 1][k + 1], TL = ring[i + 1][k];
      if (R[i] < 1e-4) {
        b.tri(BL.p, TR.p, TL.p, [u0, v0], [u1, v1], [u0, v1], base, smooth ? [BL.n, TR.n, TL.n] : null);
      } else if (R[i + 1] < 1e-4) {
        b.tri(BL.p, BR.p, TR.p, [u0, v0], [u1, v0], [u1, v1], base, smooth ? [BL.n, BR.n, TR.n] : null);
      } else {
        b.tri(BL.p, BR.p, TR.p, [u0, v0], [u1, v0], [u1, v1], base, smooth ? [BL.n, BR.n, TR.n] : null);
        b.tri(BL.p, TR.p, TL.p, [u0, v0], [u1, v1], [u0, v1], base, smooth ? [BL.n, TR.n, TL.n] : null);
      }
    }
  }
  const cap = (i, kind, sign) => {
    const c = pts[i], t = T[i];
    const tip = [c[0] + t[0] * capLen * sign, c[1] + t[1] * capLen * sign, c[2] + t[2] * capLen * sign];
    const apex = kind === 'point' ? tip : c;
    const nrm = [t[0] * sign, t[1] * sign, t[2] * sign];
    for (let k = 0; k < segs; k++) {
      const A = ring[i][k].p, B = ring[i][k + 1].p;
      const uvA = [0.5 + 0.5 * Math.cos(rot0 + (k / segs) * TAU), 0.5 + 0.5 * Math.sin(rot0 + (k / segs) * TAU)];
      const uvB = [0.5 + 0.5 * Math.cos(rot0 + ((k + 1) / segs) * TAU), 0.5 + 0.5 * Math.sin(rot0 + ((k + 1) / segs) * TAU)];
      const uvC = [0.5, 0.5];
      // sign > 0 (end cap): outward = +T; winding must be CCW seen from +T -> (A, B, apex) is CCW about +T for our frame
      if (sign > 0) b.tri(A, B, apex, uvA, uvB, uvC, base, kind === 'point' ? null : nrm);
      else b.tri(B, A, apex, uvB, uvA, uvC, base, kind === 'point' ? null : nrm);
    }
  };
  if (capStart) cap(0, capStart, -1);
  if (capEnd) cap(n - 1, capEnd, 1);
}

/** Smooth polyline of `n` points along a gentle bezier: from p0, first heading `h0`, arriving at p1. */
export function curve(p0, p1, bend = [0, 0, 0], n = 4) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const k = 4 * t * (1 - t); // 0 at the ends, 1 in the middle
    out.push([lerp(p0[0], p1[0], t) + bend[0] * k, lerp(p0[1], p1[1], t) + bend[1] * k, lerp(p0[2], p1[2], t) + bend[2] * k]);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------
// Cards: cutout billboards standing on the ground (flowers, tufts, reeds, ferns, vines, lilypads).
// ------------------------------------------------------------------------------------------------------------------
const UP = [0, 1, 0];
/**
 * Vertical card anchored at its bottom centre (x,y,z), facing `yaw`, tilted by `lean` radians toward its facing direction
 * (negative = away).  Lit with an UP normal by default so foliage blends with the ground.  Material must be double-sided.
 */
export function card(b, x, y, z, w, h, yaw, o = {}) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const hw = w / 2;
  const lean = o.lean || 0;
  const dx = Math.sin(yaw) * Math.sin(lean) * h, dz = Math.cos(yaw) * Math.sin(lean) * h, dy = Math.cos(lean) * h;
  const BL = [x - cs * hw, y, z + sn * hw], BR = [x + cs * hw, y, z - sn * hw];
  const TR = [BR[0] + dx, y + dy, BR[2] + dz], TL = [BL[0] + dx, y + dy, BL[2] + dz];
  const nrm = o.normal || UP;
  const { normal, lean: _l, ...rest } = o;
  b.quad(BL, BR, TR, TL, { uv: [0, 0, 1, 1], ...rest }, [nrm, nrm, nrm, nrm]);
}

/** Two crossed cards (visible from every side). */
export function cross(b, x, y, z, w, h, yaw, o = {}) {
  card(b, x, y, z, w, h, yaw, o);
  card(b, x, y, z, w, h, yaw + Math.PI / 2, o);
}

/** Flat card lying on a horizontal plane (lilypads, decals): centre (x,y,z), size s, rotation yaw. */
export function flat(b, x, y, z, s, yaw, o = {}) {
  const cs = Math.cos(yaw) * s / 2, sn = Math.sin(yaw) * s / 2;
  // BL,BR,TR,TL = (-h,+h),(+h,+h),(+h,-h),(-h,-h) in (x,z), rotated by yaw about Y: normal = +y
  const BL = [x - cs + sn, y, z + sn + cs], BR = [x + cs + sn, y, z - sn + cs], TR = [x + cs - sn, y, z - sn - cs], TL = [x - cs - sn, y, z + sn - cs];
  b.quad(BL, BR, TR, TL, { uv: [0, 0, 1, 1], ...o }, [UP, UP, UP, UP]);
}

// ------------------------------------------------------------------------------------------------------------------
// prism: faceted crystal / obelisk.  Every side face maps the WHOLE texture (for non-tiling 16x16 textures such as the
// crystals and lantern glass, which use clamp-to-edge).
// ------------------------------------------------------------------------------------------------------------------
/**
 * B = base point, d = direction (unit-ish), r = radius, L = straight length, tipL = length of the pointed tip.
 * o: color (array | fn), emissive, taper (radius factor at the shoulder, default 1), rot0, tipV (v where the tip starts),
 *    baseFlat (true = also close the base with a fan, for floating crystals), jitter (per-vertex radius noise via rng r).
 */
export function prism(b, B, d, r, L, tipL, sides, o = {}, rng = null) {
  const { color, emissive, taper = 1, rot0 = 0, baseFlat = false, jitter = 0, uvTile = 0 } = o;
  // uvTile > 0: world units per texture repeat (for TILING textures such as cliff); otherwise every face maps the whole texture
  const uMax = uvTile ? (TAU * r / sides) / uvTile : 1;
  const vMax = uvTile ? (L + tipL) / uvTile : 1;
  const tipV = uvTile ? L / (L + tipL) * vMax : (o.tipV ?? 0.72);
  const T = norm3(d);
  let N = Math.abs(T[1]) > 0.95 ? [1, 0, 0] : norm3(cross3([0, 1, 0], T));
  N = norm3(cross3(T, cross3(N, T)));
  const Bv = cross3(T, N);
  const at = (k, dist, rad) => {
    const a = rot0 + (k / sides) * TAU;
    const cs = Math.cos(a) * rad, sn = Math.sin(a) * rad;
    return [B[0] + T[0] * dist + N[0] * cs + Bv[0] * sn, B[1] + T[1] * dist + N[1] * cs + Bv[1] * sn, B[2] + T[2] * dist + N[2] * cs + Bv[2] * sn];
  };
  const jit = [];
  for (let k = 0; k < sides; k++) jit.push(jitter && rng ? 1 + rng.float(-jitter, jitter) : 1);
  const r0 = [], r1 = [];
  for (let k = 0; k < sides; k++) { r0.push(at(k, 0, r * jit[k])); r1.push(at(k, L, r * taper * jit[k])); }
  const apex = [B[0] + T[0] * (L + tipL), B[1] + T[1] * (L + tipL), B[2] + T[2] * (L + tipL)];
  const oo = { color, emissive, alpha: o.alpha };
  for (let k = 0; k < sides; k++) {
    const k2 = (k + 1) % sides;
    b.tri(r0[k], r0[k2], r1[k2], [0, 0], [uMax, 0], [uMax, tipV], oo);
    b.tri(r0[k], r1[k2], r1[k], [0, 0], [uMax, tipV], [0, tipV], oo);
    b.tri(r1[k], r1[k2], apex, [0, tipV], [uMax, tipV], [uMax * 0.5, vMax], oo);
    if (baseFlat) b.tri(r0[k2], r0[k], B, [uMax, 0], [0, 0], [uMax * 0.5, 0.5 * uMax], oo);
  }
}

/** Quad-strip helper: bilinear point on a quad (a,b,c,d) with corners BL,BR,TR,TL at (u,v). */
export const bilerp = (a, b, c, d, u, v) => [
  lerp(lerp(a[0], b[0], u), lerp(d[0], c[0], u), v), lerp(lerp(a[1], b[1], u), lerp(d[1], c[1], u), v), lerp(lerp(a[2], b[2], u), lerp(d[2], c[2], u), v),
];
