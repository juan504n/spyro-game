// Shared plumbing for the creature models: material/geometry bookkeeping (flash, tint, dispose), small math helpers
// and a few local geometry helpers that the engine Builder does not have (lofted tubes, spikes, bipyramids, fans).
//
// Everything here builds *lit* geometry: colours are raw albedo tints, per-vertex normals are emitted, and the shader
// does the Gouraud lighting. Unlit (fullbright / "emissive") parts use a non-lit Builder + lit:false material.
import * as THREE from 'three';
import { Builder } from '../../../engine/builder.js';

export const TAU = Math.PI * 2;
// NaN / non-numbers fall back to 0 (or the range start) so one bad input can never poison the smoothed animation state
export const clamp = (v, a = 0, b = 1) => {
  v = +v;
  if (v !== v) return a <= 0 && b >= 0 ? 0 : a;
  return v < a ? a : v > b ? b : v;
};
export const num = (x, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
/** reset any non-finite number in a state bag to 0 (self-healing animation state) */
export function heal(S) {
  for (const k in S) if (typeof S[k] === 'number' && !Number.isFinite(S[k])) S[k] = 0;
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** underdamped spring on S[key] (velocity in S[key + 'V']); sub-stepped so any dt is stable. Overshoots for a bouncy settle. */
export function spring(S, key, target, k, c, dt) {
  const vk = key + 'V';
  let p = S[key] || 0, v = S[vk] || 0;
  const n = Math.max(1, Math.ceil(dt / (1 / 90)));
  const h = dt / n;
  for (let i = 0; i < n; i++) { v += (k * (target - p) - c * v) * h; p += v * h; }
  S[key] = p; S[vk] = v;
  return p;
}
/** frame-rate independent exponential approach */
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/** deterministic tiny PRNG so several instances desync their idle timers without Math.random in the geometry path */
let _instance = 0;
export function nextSeed(opts) {
  if (opts && typeof opts.seed === 'number') return opts.seed;
  _instance++;
  return (_instance * 7919 + 13) % 1000;
}
export function seeded(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export const lit = () => new Builder({ lit: true });
export const unlit = () => new Builder();   // non-lit builder: colours bake as fullbright tints (tint * 0.5 * 2)

/**
 * A model under construction: owns the root/rig groups and every material/geometry/texture so that flash(), tint()
 * and dispose() are trivial and nothing leaks between instances.
 */
// Geometry is identical between instances of a model (all animation is pivot-driven), so parts built through
// Rig.part() with a cache key are built once and shared; only materials are per instance. Shared geometry is never
// disposed with an instance (it is a few KB and lives as long as the page).
const GEO_CACHE = new Map();

export class Rig {
  /** @param {string|null} cacheKey  e.g. 'snuffer:bell' — enables geometry sharing between instances */
  constructor(assets, cacheKey = null) {
    this.cacheKey = cacheKey;
    this.assets = assets;
    this.root = new THREE.Group();
    this.rig = new THREE.Group();          // all visuals live here so the game keeps free use of root.visible/position
    this.root.add(this.rig);
    this.mats = [];
    this.geos = [];
    this.texs = [];
    this.meshes = [];
    this._flash = 0;
    this._boost = [1, 1, 1];
    this._tint = [1, 1, 1];
  }

  /** unique lit material (per-vertex lighting from normals). */
  litMat(tex = null, o = {}) {
    const m = this.assets.mat(tex, { lit: true, unique: true, ...o });
    this.mats.push(m);
    return m;
  }

  /** unique fullbright material (pair with an `unlit()` builder). */
  glowMat(tex = null, o = {}) {
    const m = this.assets.mat(tex, { lit: false, unique: true, ...o });
    m.userData.noMul = true;      // the model drives this material's brightness itself (flicker, dimming)
    this.mats.push(m);
    return m;
  }

  /** register a texture created locally so it is disposed with the model */
  ownTex(t) { this.texs.push(t); return t; }

  pivot(parent, x = 0, y = 0, z = 0, name = '') {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    if (name) o.name = name;
    parent.add(o);
    return o;
  }

  /** Run fn(builder) on a fresh builder (lit unless `glow`) and mesh it under `parent`. */
  part(parent, material, fn, name = '', glow = false, bias = 0) {
    const key = this.cacheKey ? `${this.cacheKey}/${name}` : null;
    let geo = key ? GEO_CACHE.get(key) : null;
    if (!geo) {
      const b = glow ? unlit() : lit();
      setBias(bias);
      fn(b);
      setBias(0);
      geo = b.build();
      if (key) GEO_CACHE.set(key, geo); else this.geos.push(geo);
    }
    const mesh = new THREE.Mesh(geo, material);
    if (name) mesh.name = name;
    parent.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  /** Build `builder` into a mesh under `parent`. */
  mesh(parent, builder, material, name = '') {
    const geo = builder.build();
    this.geos.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    if (name) mesh.name = name;
    parent.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  get triangleCount() {
    let n = 0;
    for (const m of this.meshes) n += m.geometry.attributes.position.count / 3;
    return n | 0;
  }

  flash(k) {
    this._flash = k;
    for (const m of this.mats) m.uniforms.uFlash.value = k;
  }

  /** multiply every material by a colour (0..1 rgb) — used for burn/soot/dim. Combines with boost(). */
  tint(r, g, b) {
    this._tint = [r, g, b];
    this._applyMul();
  }

  /** constant per-model brightness multiplier (>1 allowed: the shader clamps at 1) — the "character light" lift. */
  boost(r, g = r, b = r) {
    this._boost = [r, g, b];
    this._applyMul();
  }

  _applyMul() {
    const k = this._boost, t = this._tint;
    for (const m of this.mats) if (m.userData.noMul !== true) m.uniforms.uColorMul.value.setRGB(k[0] * t[0], k[1] * t[1], k[2] * t[2]);
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    this.root.removeFromParent();
  }
}

// -----------------------------------------------------------------------------------------------------------------
// Geometry helpers
// -----------------------------------------------------------------------------------------------------------------
// Optional "sky light" bias: tilts every emitted normal toward +Y so surfaces that face away from the key light still
// pick up some of it (characters looked flat and bright on the PS1; a purely flat ambient makes them murky at night).
let BIAS = 0;
export function setBias(k) { BIAS = k; }
const biased = (n) => {
  if (!BIAS) return n;
  const x = n[0], y = n[1] + BIAS, z = n[2];
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const ZERO2 = [0, 0];

/**
 * Emit one triangle with per-vertex colours + normals. Winding is fixed up so that the geometric normal agrees with
 * the supplied vertex normals (also when the builder's transform mirrors).
 */
export function triC(b, p0, p1, p2, c0, c1, c2, n0, n1, n2, uv = null) {
  const g = cross(sub(p1, p0), sub(p2, p0));
  const avg = [n0[0] + n1[0] + n2[0], n0[1] + n1[1] + n2[1], n0[2] + n1[2] + n2[2]];
  let flip = dot(g, avg) < 0;
  if (b.xf.m.determinant() < 0) flip = !flip;
  if (BIAS) { n0 = biased(n0); n1 = biased(n1); n2 = biased(n2); }
  const u = uv || [ZERO2, ZERO2, ZERO2];
  if (!flip) b.tri(p0, p1, p2, u[0], u[1], u[2], { tints: [c0, c1, c2] }, [n0, n1, n2]);
  else b.tri(p0, p2, p1, u[0], u[2], u[1], { tints: [c0, c2, c1] }, [n0, n2, n1]);
}

/** flat-shaded triangle helper (normal from the winding, both colours equal or per-vertex) */
export function triF(b, p0, p1, p2, c0, c1 = c0, c2 = c0, uv = null) {
  const n = biased(norm(cross(sub(p1, p0), sub(p2, p0))));
  const u = uv || [ZERO2, ZERO2, ZERO2];
  b.tri(p0, p1, p2, u[0], u[1], u[2], { tints: [c0, c1, c2] }, [n, n, n]);
}

/** two-sided flat triangle (thin membranes): back copy has flipped winding AND normal so it lights properly. */
export function triDouble(b, p0, p1, p2, c0, c1 = c0, c2 = c0, uv = null) {
  const n0 = norm(cross(sub(p1, p0), sub(p2, p0)));
  const n = biased(n0);
  const nb = biased([-n0[0], -n0[1], -n0[2]]);
  const u = uv || [ZERO2, ZERO2, ZERO2];
  b.tri(p0, p1, p2, u[0], u[1], u[2], { tints: [c0, c1, c2] }, [n, n, n]);
  b.tri(p0, p2, p1, u[0], u[2], u[1], { tints: [c0, c2, c1] }, [nb, nb, nb]);
}

/**
 * Lofted tube: elliptical rings stacked along local Z (z may increase or decrease), smooth normals from finite
 * differences, per-ring colour functions. A ring with rx = 0 is a pole.
 *   rings: [{ z, x = 0, y = 0, rx, ry = rx, col }]   col: [r,g,b] | (theta, ringIndex) => [r,g,b]
 *   theta = 0 -> +x, PI/2 -> +y.
 *   o: { segs = 8, rot = 0, cap0 = false, cap1 = false, capCol, smoothCaps = true }
 */
export function loft(b, rings, o = {}) {
  const N = o.segs || 8;
  const R = rings.length;
  const rot = o.rot || 0;
  const P = [], C = [], NR = [];
  const degenerate = rings.map((r) => Math.abs(r.rx) < 1e-6 && Math.abs(r.ry ?? r.rx) < 1e-6);
  for (let i = 0; i < R; i++) {
    const r = rings[i];
    const ry = r.ry ?? r.rx;
    const pts = [], cols = [];
    for (let j = 0; j < N; j++) {
      const th = rot + (j / N) * TAU;
      pts.push([(r.x || 0) + r.rx * Math.cos(th), (r.y || 0) + ry * Math.sin(th), r.z]);
      cols.push(typeof r.col === 'function' ? r.col(th, i) : r.col);
    }
    P.push(pts); C.push(cols);
  }
  for (let i = 0; i < R; i++) {
    const nrm = [];
    for (let j = 0; j < N; j++) {
      const th = rot + (j / N) * TAU;
      let n;
      if (degenerate[i]) {
        // pole: axial normal pointing away from the neighbouring ring
        const nb = i === 0 ? 1 : i - 1;
        const dz = rings[i].z - rings[nb].z;
        n = [0, 0, dz >= 0 ? 1 : -1];
        if (R === 1) n = [0, 0, 1];
      } else {
        const a = P[i][(j + N - 1) % N], c = P[i][(j + 1) % N];
        const t1 = sub(c, a);
        const p0 = P[Math.max(i - 1, 0)][j], p1 = P[Math.min(i + 1, R - 1)][j];
        let t2 = sub(p1, p0);
        if (Math.hypot(...t2) < 1e-9) t2 = [0, 0, 1];
        n = norm(cross(t1, t2));
        const rad = [Math.cos(th), Math.sin(th), 0];
        if (dot(n, rad) < 0) n = [-n[0], -n[1], -n[2]];
      }
      nrm.push(n);
    }
    NR.push(nrm);
  }
  for (let i = 0; i < R - 1; i++) {
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      const A = P[i][j], B = P[i][j1], Cc = P[i + 1][j1], D = P[i + 1][j];
      const cA = C[i][j], cB = C[i][j1], cC = C[i + 1][j1], cD = C[i + 1][j];
      const nA = NR[i][j], nB = NR[i][j1], nC = NR[i + 1][j1], nD = NR[i + 1][j];
      if (degenerate[i] && degenerate[i + 1]) continue;
      if (degenerate[i]) triC(b, A, Cc, D, cA, cC, cD, nA, nC, nD);
      else if (degenerate[i + 1]) triC(b, A, B, Cc, cA, cB, cC, nA, nB, nC);
      else {
        triC(b, A, B, Cc, cA, cB, cC, nA, nB, nC);
        triC(b, A, Cc, D, cA, cC, cD, nA, nC, nD);
      }
    }
  }
  const cap = (i, dir) => {
    const r = rings[i];
    if (degenerate[i]) return;
    const cc = o.capCol || (typeof r.col === 'function' ? r.col(Math.PI * 1.5, i) : r.col);
    const centre = [r.x || 0, r.y || 0, r.z];
    const n = [0, 0, dir];
    for (let j = 0; j < N; j++) triC(b, centre, P[i][j], P[i][(j + 1) % N], cc, cc, cc, n, n, n);
  };
  if (o.cap0) cap(0, rings[0].z <= rings[Math.min(1, R - 1)].z ? -1 : 1);
  if (o.cap1) cap(R - 1, rings[R - 1].z >= rings[Math.max(R - 2, 0)].z ? 1 : -1);
  return b;
}

/** Multiply the builder transform by a basis whose +Z is `dir` (and +Y as close to `up` as possible). */
export function orient(b, dir, up = [0, 1, 0]) {
  const z = norm(dir);
  let x = cross(up, z);
  if (Math.hypot(x[0], x[1], x[2]) < 1e-4) x = cross([1, 0, 0], z);
  x = norm(x);
  const y = cross(z, x);
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z));
  b.xf.m.multiply(m);
  b.xf.dirty = true;
  return b;
}

/** Thin tapered bar (bone / pole / claw) from point a to point b: r0 at a, r1 at b. Open ends unless caps. */
export function bar(bld, a, c, r0, r1, col, { segs = 4, cap1 = false, col1 = null, rot = 0 } = {}) {
  const d = sub(c, a);
  const len = Math.hypot(d[0], d[1], d[2]) || 1e-6;
  bld.push().translate(a[0], a[1], a[2]);
  orient(bld, d);
  const c1 = col1 || col;
  loft(bld, [{ z: 0, rx: r0, col }, { z: len, rx: r1, col: c1 }], { segs, cap1, rot });
  bld.pop();
  return bld;
}

/** Point on a loft's surface at axial position z and ring angle th (rings must be ordered along z). */
export function ringPoint(rings, z, th, grow = 0) {
  let i = 0;
  const inc = rings[rings.length - 1].z >= rings[0].z;
  for (let k = 0; k < rings.length - 1; k++) {
    const a = rings[k].z, c = rings[k + 1].z;
    if (inc ? (z >= a && z <= c) : (z <= a && z >= c)) { i = k; break; }
    i = k;
  }
  const A = rings[i], B = rings[i + 1];
  const t = clamp((z - A.z) / ((B.z - A.z) || 1), 0, 1);
  const L = (a, c) => a + (c - a) * t;
  const rx = L(A.rx, B.rx) + grow, ry = L(A.ry ?? A.rx, B.ry ?? B.rx) + grow;
  return [L(A.x || 0, B.x || 0) + rx * Math.cos(th), L(A.y || 0, B.y || 0) + ry * Math.sin(th), z];
}

/** Ellipsoid centred at (cx,cy,cz) as a pole-to-pole loft along Z (rings are cross-sections). */
export function ellipsoid(b, cx, cy, cz, rx, ry, rz, { segs = 8, rings = 4, col = [1, 1, 1], rot = 0 } = {}) {
  const rr = [];
  for (let i = 0; i <= rings; i++) {
    const t = (i / rings) * Math.PI;
    const s = Math.sin(t);
    rr.push({ z: cz - Math.cos(t) * rz, x: cx, y: cy, rx: rx * s, ry: ry * s, col });
  }
  return loft(b, rr, { segs, rot });
}

/** Small pyramid/cone spike from base centre `p` along direction `d` (unit) with the given height and base radius. */
export function spike(b, p, d, h, r, { segs = 4, col = [1, 1, 1], tip = null, up = [0, 1, 0], base = false } = {}) {
  const dz = norm(d);
  let ax = cross(up, dz);
  if (Math.hypot(...ax) < 1e-4) ax = cross([1, 0, 0], dz);
  ax = norm(ax);
  const ay = norm(cross(dz, ax));
  const apex = [p[0] + dz[0] * h, p[1] + dz[1] * h, p[2] + dz[2] * h];
  const ring = [];
  for (let j = 0; j < segs; j++) {
    const th = (j / segs) * TAU;
    const c = Math.cos(th) * r, s = Math.sin(th) * r;
    ring.push([p[0] + ax[0] * c + ay[0] * s, p[1] + ax[1] * c + ay[1] * s, p[2] + ax[2] * c + ay[2] * s]);
  }
  const tc = tip || col;
  for (let j = 0; j < segs; j++) {
    const a = ring[j], c2 = ring[(j + 1) % segs];
    const nrm = norm(cross(sub(c2, a), sub(apex, a)));
    // outward check against the direction from the axis to the edge midpoint
    const mid = [(a[0] + c2[0]) / 2 - p[0], (a[1] + c2[1]) / 2 - p[1], (a[2] + c2[2]) / 2 - p[2]];
    const n = dot(nrm, mid) < 0 ? [-nrm[0], -nrm[1], -nrm[2]] : nrm;
    triC(b, a, c2, apex, col, col, tc, n, n, n);
  }
  if (base) {
    const nb = [-dz[0], -dz[1], -dz[2]];
    for (let j = 0; j < segs; j++) triC(b, p, ring[(j + 1) % segs], ring[j], col, col, col, nb, nb, nb);
  }
  return b;
}

/** Flattened bipyramid ("spade" / leaf / gem): outline points in the local XZ plane, apexes above and below. */
export function bipyramid(b, outline, yTop, yBot, colEdge, colTop = colEdge, colBot = colTop) {
  const n = outline.length;
  let cx = 0, cz = 0;
  for (const p of outline) { cx += p[0]; cz += p[1]; }
  cx /= n; cz /= n;
  const top = [cx, yTop, cz], bot = [cx, yBot, cz];
  for (let i = 0; i < n; i++) {
    const a = [outline[i][0], 0, outline[i][1]], c = [outline[(i + 1) % n][0], 0, outline[(i + 1) % n][1]];
    triF(b, a, c, top, colEdge, colEdge, colTop);
    triF(b, c, a, bot, colEdge, colEdge, colBot);
  }
  return b;
}
