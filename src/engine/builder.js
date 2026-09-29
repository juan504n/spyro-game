// Procedural low-poly mesh builder. Produces non-indexed triangle soup with:
//   position, uv, aCol (RGBA8: baked vertex colour, 0.5 = neutral), aColB (second baked set for the daybreak
//   lighting environment) and, for dynamic models, normals. Vertex colours are baked through a `lighting`
//   object (see lighting.js) so static props look like they were lit by a 1998 level editor.
//
// Winding is counter-clockwise from outside. UVs are in world units divided by `tile` so texel density stays
// constant across differently sized props (like a careful PS1 artist would keep it).
import * as THREE from 'three';
import { RNG } from './textures/pix.js';

const _m = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _out = new Float32Array(6);
const NEUTRAL = { sample(out) { out.fill(1); }, };

export function col(c) {
  if (Array.isArray(c)) return c;
  if (typeof c === 'number') return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
  let s = c.replace('#', '');
  if (s.length === 3) s = s.split('').map((x) => x + x).join('');
  const n = parseInt(s, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Vertical colour gradient in local space: returns a colour function usable as `color`. */
export function vgrad(y0, c0, y1, c1) {
  const a = col(c0), b = col(c1);
  return (x, y) => {
    const t = Math.min(Math.max((y - y0) / (y1 - y0), 0), 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Transform stack. Several builders may share one Xf so a multi-material prop is transformed as a unit. */
export class Xf {
  constructor() { this.m = new THREE.Matrix4(); this.stack = []; this.n3 = new THREE.Matrix3(); this.dirty = true; }
  push() { this.stack.push(this.m.clone()); return this; }
  pop() { this.m = this.stack.pop(); this.dirty = true; return this; }
  identity() { this.m.identity(); this.dirty = true; return this; }
  translate(x, y, z) { this.m.multiply(_t.makeTranslation(x, y, z)); this.dirty = true; return this; }
  rotateX(a) { this.m.multiply(_t.makeRotationX(a)); this.dirty = true; return this; }
  rotateY(a) { this.m.multiply(_t.makeRotationY(a)); this.dirty = true; return this; }
  rotateZ(a) { this.m.multiply(_t.makeRotationZ(a)); this.dirty = true; return this; }
  scale(x, y = x, z = x) { this.m.multiply(_t.makeScale(x, y, z)); this.dirty = true; return this; }
  /** temporary transform around fn */
  at(x, y, z, ry, fn) { this.push().translate(x, y, z); if (ry) this.rotateY(ry); fn(this); return this.pop(); }
  normalMatrix() { if (this.dirty) { this.n3.getNormalMatrix(this.m); this.dirty = false; } return this.n3; }
}

export class Builder {
  /**
   * @param {object} [o]
   * @param {object} [o.lighting] bake lighting: { sample(out6, x, y, z, nx, ny, nz) } writes A(rgb) then B(rgb) irradiance
   * @param {boolean} [o.lit] dynamic model: store raw tint colours + normals, no baking
   * @param {number} [o.seed]
   */
  constructor({ lighting = null, lit = false, seed = 1, xf = null } = {}) {
    this.xf = xf || new Xf();
    this.enabled = true;
    this.lighting = lighting || NEUTRAL;
    this.lit = lit;
    this.rng = new RNG(seed);
    this.pos = [];
    this.uvs = [];
    this.colA = [];
    this.colB = [];
    this.nrm = [];
    this.defaults = { color: [1, 1, 1], tile: 4, emissive: 0, jitter: 0, alpha: 1 };
  }

  get vertexCount() { return this.pos.length / 3; }
  get triangleCount() { return this._tris !== undefined ? this._tris : this.pos.length / 9; }

  /** Drop the JS build-time arrays once the geometry owns typed copies (static world meshes: tens of MB for the props). */
  release() {
    this._tris = this.pos.length / 9;
    this.pos = []; this.uvs = []; this.colA = []; this.colB = []; this.nrm = [];
    return this;
  }

  // ---- transform stack (delegates to the shared Xf) ----------------------------------------------------------
  push() { this.xf.push(); return this; }
  pop() { this.xf.pop(); return this; }
  identity() { this.xf.identity(); return this; }
  translate(x, y, z) { this.xf.translate(x, y, z); return this; }
  rotateX(a) { this.xf.rotateX(a); return this; }
  rotateY(a) { this.xf.rotateY(a); return this; }
  rotateZ(a) { this.xf.rotateZ(a); return this; }
  scale(x, y = x, z = x) { this.xf.scale(x, y, z); return this; }
  /** Run fn(builder) with a temporary translate (+ optional Y rotation). */
  at(x, y, z, fn, ry = 0) {
    this.xf.at(x, y, z, ry, () => fn(this));
    return this;
  }

  // ---- low level -------------------------------------------------------------------------------------------
  _vert(x, y, z, nx, ny, nz, u, v, tint, o, alphaOverride) {
    const e = this.xf.m.elements;
    const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
    const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
    const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
    const ne = this.xf.normalMatrix().elements;
    let wnx = ne[0] * nx + ne[3] * ny + ne[6] * nz;
    let wny = ne[1] * nx + ne[4] * ny + ne[7] * nz;
    let wnz = ne[2] * nx + ne[5] * ny + ne[8] * nz;
    const nl = Math.hypot(wnx, wny, wnz) || 1;
    wnx /= nl; wny /= nl; wnz /= nl;

    this.pos.push(wx, wy, wz);
    this.uvs.push(u, v);
    let j = 1;
    if (o.jitter) j = 1 + (this.rng.next() - 0.5) * 2 * o.jitter;
    const a = alphaOverride !== undefined ? alphaOverride : (o.alpha === undefined ? 1 : o.alpha);
    if (this.lit) {
      this.nrm.push(wnx, wny, wnz);
      const r = clamp01(tint[0] * j), g = clamp01(tint[1] * j), b = clamp01(tint[2] * j);
      this.colA.push((r * 255) | 0, (g * 255) | 0, (b * 255) | 0, (a * 255) | 0);
      return;
    }
    this.lighting.sample(_out, wx, wy, wz, wnx, wny, wnz, o.aoFn ? o.aoFn(wx, wy, wz) : undefined);
    const em = o.emissive || 0;
    const L = 1.15;
    const k = 0.5 * j;
    const A = this.colA, B = this.colB;
    A.push(
      (clamp01(tint[0] * k * (_out[0] + (L - _out[0]) * em)) * 255) | 0,
      (clamp01(tint[1] * k * (_out[1] + (L - _out[1]) * em)) * 255) | 0,
      (clamp01(tint[2] * k * (_out[2] + (L - _out[2]) * em)) * 255) | 0,
      (a * 255) | 0);
    B.push(
      (clamp01(tint[0] * k * (_out[3] + (L - _out[3]) * em)) * 255) | 0,
      (clamp01(tint[1] * k * (_out[4] + (L - _out[4]) * em)) * 255) | 0,
      (clamp01(tint[2] * k * (_out[5] + (L - _out[5]) * em)) * 255) | 0,
      (a * 255) | 0);
  }

  _tint(o, x, y, z) {
    const c = o.color === undefined ? this.defaults.color : o.color;
    if (typeof c === 'function') return c(x, y, z);
    if (typeof c === 'number' || typeof c === 'string') return col(c);       // 0xff8800 / '#ff8800'
    return c.length && typeof c[0] !== 'number' ? col(c) : c;
  }

  /** Emit one triangle. p* = [x,y,z]; n = face normal (or per-vertex normals array of 3); uv* = [u,v]. */
  tri(p0, p1, p2, uv0, uv1, uv2, o = {}, n = null) {
    if (!this.enabled) return this;
    let n0, n1, n2;
    if (n && n.length === 3 && Array.isArray(n[0])) { [n0, n1, n2] = n; } else {
      let nn = n;
      if (!nn) {
        const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
        const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
        nn = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
        const l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
        nn = [nn[0] / l, nn[1] / l, nn[2] / l];
      }
      n0 = n1 = n2 = nn;
    }
    const tt = o.tints;
    const t0 = tt ? tt[0] : this._tint(o, ...p0), t1 = tt ? tt[1] : this._tint(o, ...p1), t2 = tt ? tt[2] : this._tint(o, ...p2);
    const al = o.alphas;
    this._vert(p0[0], p0[1], p0[2], n0[0], n0[1], n0[2], uv0[0], uv0[1], t0, o, al ? al[0] : undefined);
    this._vert(p1[0], p1[1], p1[2], n1[0], n1[1], n1[2], uv1[0], uv1[1], t1, o, al ? al[1] : undefined);
    this._vert(p2[0], p2[1], p2[2], n2[0], n2[1], n2[2], uv2[0], uv2[1], t2, o, al ? al[2] : undefined);
    return this;
  }

  /** Quad with corners BL, BR, TR, TL (CCW seen from the front). Default uv is world-scaled by o.tile. */
  quad(a, b, c, d, o = {}, ns = null) {
    let uv;
    if (o.uv) {
      const [u0, v0, u1, v1] = o.uv;
      uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    } else {
      const tile = o.tile || this.defaults.tile;
      const w = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / tile;
      const h = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]) / tile;
      const ou = o.uOff || 0, ov = o.vOff || 0;
      uv = [[ou, ov], [ou + w, ov], [ou + w, ov + h], [ou, ov + h]];
    }
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    const nn = ns || [n, n, n, n];
    const sub = (i0, i1, i2) => (o.tints || o.alphas ? { ...o, tints: o.tints && [o.tints[i0], o.tints[i1], o.tints[i2]], alphas: o.alphas && [o.alphas[i0], o.alphas[i1], o.alphas[i2]] } : o);
    if (o.flip) {
      this.tri(a, c, b, uv[0], uv[2], uv[1], sub(0, 2, 1), [nn[0], nn[2], nn[1]]);
      this.tri(a, d, c, uv[0], uv[3], uv[2], sub(0, 3, 2), [nn[0], nn[3], nn[2]]);
    } else {
      this.tri(a, b, c, uv[0], uv[1], uv[2], sub(0, 1, 2), [nn[0], nn[1], nn[2]]);
      this.tri(a, c, d, uv[0], uv[2], uv[3], sub(0, 2, 3), [nn[0], nn[2], nn[3]]);
    }
    if (o.double) this.quad(a, b, c, d, { ...o, double: false, flip: !o.flip });
    return this;
  }

  // ---- primitives ------------------------------------------------------------------------------------------
  /** Axis-aligned box centred at (cx,cy,cz). o.faces: subset of ['+x','-x','+y','-y','+z','-z']; o.colors overrides per face. */
  box(cx, cy, cz, sx, sy, sz, o = {}) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const faces = o.faces || ['+z', '-z', '+x', '-x', '+y', '-y'];
    const P = (x, y, z) => [cx + x, cy + y, cz + z];
    const defs = {
      '+z': [P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz)],
      '-z': [P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz)],
      '+x': [P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz)],
      '-x': [P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz)],
      '+y': [P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz)],
      '-y': [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz)],
    };
    for (const f of faces) {
      const c = defs[f];
      const fo = o.colors && o.colors[f] ? { ...o, color: o.colors[f] } : o;
      this.quad(c[0], c[1], c[2], c[3], fo);
    }
    return this;
  }

  /** Surface of revolution about local Y. profile = [[radius, y], ...] bottom -> top. */
  lathe(profile, segs = 8, o = {}) {
    const tile = o.tile || this.defaults.tile;
    const smooth = o.smooth !== false;
    const n = profile.length;
    // per-profile-point normals in (r,y) plane
    const segN = [];
    for (let k = 0; k < n - 1; k++) {
      const dr = profile[k + 1][0] - profile[k][0], dy = profile[k + 1][1] - profile[k][1];
      const l = Math.hypot(dr, dy) || 1;
      segN.push([dy / l, -dr / l]);
    }
    const ptN = profile.map((_, k) => {
      const a = segN[Math.max(k - 1, 0)], b = segN[Math.min(k, n - 2)];
      const x = a[0] + b[0], y = a[1] + b[1];
      const l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    });
    let vAcc = [0];
    for (let k = 1; k < n; k++) vAcc.push(vAcc[k - 1] + Math.hypot(profile[k][0] - profile[k - 1][0], profile[k][1] - profile[k - 1][1]) / tile);
    const circ = (r) => (2 * Math.PI * r) / tile;
    const ang = (i) => (i / segs) * Math.PI * 2;
    const rot = o.rot || 0;
    for (let k = 0; k < n - 1; k++) {
      const [r0, y0] = profile[k], [r1, y1] = profile[k + 1];
      if (r0 === 0 && r1 === 0) continue;
      const uSpan = o.uWrap ? o.uWrap : Math.max(circ(Math.max(r0, r1)), 0.25);
      for (let i = 0; i < segs; i++) {
        const a0 = ang(i) + rot, a1 = ang(i + 1) + rot;
        const s0 = Math.sin(a0), c0 = Math.cos(a0), s1 = Math.sin(a1), c1 = Math.cos(a1);
        const BL = [r0 * s0, y0, r0 * c0], BR = [r0 * s1, y0, r0 * c1];
        const TR = [r1 * s1, y1, r1 * c1], TL = [r1 * s0, y1, r1 * c0];
        const u0 = (i / segs) * uSpan, u1 = ((i + 1) / segs) * uSpan;
        const fn = smooth
          ? [[ptN[k][0] * s0, ptN[k][1], ptN[k][0] * c0], [ptN[k][0] * s1, ptN[k][1], ptN[k][0] * c1],
            [ptN[k + 1][0] * s1, ptN[k + 1][1], ptN[k + 1][0] * c1], [ptN[k + 1][0] * s0, ptN[k + 1][1], ptN[k + 1][0] * c0]]
          : null;
        const uvA = [u0, vAcc[k]], uvB = [u1, vAcc[k]], uvC = [u1, vAcc[k + 1]], uvD = [u0, vAcc[k + 1]];
        if (r1 === 0) this.tri(BL, BR, TR, uvA, uvB, uvC, o, smooth ? [fn[0], fn[1], fn[2]] : null);
        else if (r0 === 0) this.tri(BL, TR, TL, uvA, uvC, uvD, o, smooth ? [fn[0], fn[2], fn[3]] : null);
        else {
          this.tri(BL, BR, TR, uvA, uvB, uvC, o, smooth ? [fn[0], fn[1], fn[2]] : null);
          this.tri(BL, TR, TL, uvA, uvC, uvD, o, smooth ? [fn[0], fn[2], fn[3]] : null);
        }
      }
    }
    return this;
  }

  /** Cylinder / truncated cone standing on y=0 (base centre at origin). */
  cyl(rBottom, rTop, h, segs = 8, o = {}) {
    const prof = [[rBottom, 0], [rTop, h]];
    if (o.caps === 'bottom' || o.caps === 'both') prof.unshift([0, 0]);
    if (o.caps === 'top' || o.caps === 'both') prof.push([0, h]);
    if (o.caps && o.caps !== 'none') {
      // caps need flat normals: build separately
      this.lathe([[rBottom, 0], [rTop, h]], segs, o);
      const tile = o.tile || this.defaults.tile;
      const rot = o.rot || 0;
      const disc = (r, y, up) => {
        for (let i = 0; i < segs; i++) {
          const a0 = (i / segs) * Math.PI * 2 + rot, a1 = ((i + 1) / segs) * Math.PI * 2 + rot;
          const c = [0, y, 0];
          const p0 = [r * Math.sin(a0), y, r * Math.cos(a0)], p1 = [r * Math.sin(a1), y, r * Math.cos(a1)];
          const uvc = [0, 0], uv0 = [p0[0] / tile, p0[2] / tile], uv1 = [p1[0] / tile, p1[2] / tile];
          if (up) this.tri(c, p0, p1, uvc, uv0, uv1, o, [0, 1, 0]);
          else this.tri(c, p1, p0, uvc, uv1, uv0, o, [0, -1, 0]);
        }
      };
      if (o.caps === 'top' || o.caps === 'both') if (rTop > 0) disc(rTop, h, true);
      if (o.caps === 'bottom' || o.caps === 'both') if (rBottom > 0) disc(rBottom, 0, false);
      return this;
    }
    return this.lathe(prof, segs, o);
  }

  cone(r, h, segs = 8, o = {}) { return this.cyl(r, 0, h, segs, o); }

  /** Flat disc facing up (or down) at height y. */
  disc(r, segs = 12, o = {}) {
    const tile = o.tile || this.defaults.tile;
    const y = o.y || 0;
    const up = o.down ? false : true;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const p0 = [r * Math.sin(a0), y, r * Math.cos(a0)], p1 = [r * Math.sin(a1), y, r * Math.cos(a1)];
      const uv0 = o.uvDisc ? [0.5 + 0.5 * Math.sin(a0), 0.5 + 0.5 * Math.cos(a0)] : [p0[0] / tile, p0[2] / tile];
      const uv1 = o.uvDisc ? [0.5 + 0.5 * Math.sin(a1), 0.5 + 0.5 * Math.cos(a1)] : [p1[0] / tile, p1[2] / tile];
      const uvc = o.uvDisc ? [0.5, 0.5] : [0, 0];
      if (up) this.tri([0, y, 0], p0, p1, uvc, uv0, uv1, o, [0, 1, 0]);
      else this.tri([0, y, 0], p1, p0, uvc, uv1, uv0, o, [0, -1, 0]);
    }
    return this;
  }

  /** UV sphere centred at origin; o.sy/o.sx/o.sz squash. */
  sphere(r, wSeg = 8, hSeg = 6, o = {}) {
    const tile = o.tile || this.defaults.tile;
    const P = (t, p) => [r * Math.sin(t) * Math.sin(p), r * Math.cos(t), r * Math.sin(t) * Math.cos(p)];
    const smooth = o.smooth !== false;
    const uS = o.uWrap || Math.max((2 * Math.PI * r) / tile, 0.5), vS = o.vWrap || Math.max((Math.PI * r) / tile, 0.5);
    for (let j = 0; j < hSeg; j++) {
      const t0 = (j / hSeg) * Math.PI, t1 = ((j + 1) / hSeg) * Math.PI;
      for (let i = 0; i < wSeg; i++) {
        const f0 = (i / wSeg) * Math.PI * 2, f1 = ((i + 1) / wSeg) * Math.PI * 2;
        const TL = P(t0, f0), TR = P(t0, f1), BL = P(t1, f0), BR = P(t1, f1);
        const nrm = (p) => { const l = Math.hypot(p[0], p[1], p[2]) || 1; return [p[0] / l, p[1] / l, p[2] / l]; };
        const uA = (i / wSeg) * uS, uB = ((i + 1) / wSeg) * uS;
        const vA = (1 - j / hSeg) * vS, vB = (1 - (j + 1) / hSeg) * vS;
        if (j === 0) {
          this.tri(TL, BL, BR, [uA, vA], [uA, vB], [uB, vB], o, smooth ? [nrm(TL), nrm(BL), nrm(BR)] : null);
        } else if (j === hSeg - 1) {
          this.tri(TL, BL, TR, [uA, vA], [uA, vB], [uB, vA], o, smooth ? [nrm(TL), nrm(BL), nrm(TR)] : null);
        } else {
          this.tri(TL, BL, BR, [uA, vA], [uA, vB], [uB, vB], o, smooth ? [nrm(TL), nrm(BL), nrm(BR)] : null);
          this.tri(TL, BR, TR, [uA, vA], [uB, vB], [uB, vA], o, smooth ? [nrm(TL), nrm(BR), nrm(TR)] : null);
        }
      }
    }
    return this;
  }

  /**
   * Faceted blob (rock / foliage clump / boulder): subdivided icosahedron with seeded radial noise, flat shaded.
   * o.detail 0..2, o.noise 0..1, o.sx/sy/sz axis scale.
   */
  blob(r, o = {}) {
    const detail = o.detail ?? 1;
    const noise = o.noise ?? 0.25;
    const sx = o.sx ?? 1, sy = o.sy ?? 1, sz = o.sz ?? 1;
    const tile = o.tile || this.defaults.tile;
    const rng = o.rng || this.rng;
    const t = (1 + Math.sqrt(5)) / 2;
    let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
      .map((v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; });
    let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let d = 0; d < detail; d++) {
      const cache = new Map();
      const mid = (a, b) => {
        const k = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (cache.has(k)) return cache.get(k);
        const p = [(V[a][0] + V[b][0]) / 2, (V[a][1] + V[b][1]) / 2, (V[a][2] + V[b][2]) / 2];
        const l = Math.hypot(...p);
        V.push([p[0] / l, p[1] / l, p[2] / l]);
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
    // radial noise per unique vertex so the surface stays closed
    const rad = V.map(() => 1 + (rng.next() - 0.5) * 2 * noise);
    const P = V.map((v, i) => [v[0] * r * rad[i] * sx, v[1] * r * rad[i] * sy, v[2] * r * rad[i] * sz]);
    for (const [a, b, c] of F) {
      const p0 = P[a], p1 = P[b], p2 = P[c];
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
      const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const l = Math.hypot(...n) || 1;
      n[0] /= l; n[1] /= l; n[2] /= l;
      // planar projection along the dominant axis keeps texel density even
      const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
      const uvf = (p) => (ay >= ax && ay >= az ? [p[0] / tile, p[2] / tile] : ax >= az ? [p[2] / tile, p[1] / tile] : [p[0] / tile, p[1] / tile]);
      this.tri(p0, p1, p2, uvf(p0), uvf(p1), uvf(p2), o, n);
    }
    return this;
  }

  /**
   * Ground-hugging ribbon along a polyline of [x,y,z] points (roads, streams). Three lanes (left edge, centre, right
   * edge) so edges can be darker / more transparent: o.edgeTint, o.centerTint (colours), o.edgeAlpha, o.uSpan.
   */
  ribbon(points, width, o = {}) {
    const tile = o.tile || this.defaults.tile;
    const w2 = typeof width === 'function' ? width : () => width;
    const n = points.length;
    const R = [];
    for (let i = 0; i < n; i++) {
      const a = points[Math.max(i - 1, 0)], b = points[Math.min(i + 1, n - 1)];
      let fx = b[0] - a[0], fz = b[2] - a[2];
      const l = Math.hypot(fx, fz) || 1;
      fx /= l; fz /= l;
      R.push([-fz, fx]);
    }
    const eT = col(o.edgeTint || o.color || [1, 1, 1]), cT = col(o.centerTint || o.color || [1, 1, 1]);
    const eA = o.edgeAlpha === undefined ? 1 : o.edgeAlpha;
    const uw = o.uSpan || 1;
    const lane = (i, k) => {   // k: -1 left, 0 centre, +1 right
      const p = points[i], w = w2(i / (n - 1)) / 2;
      return [p[0] + R[i][0] * w * k, p[1], p[2] + R[i][1] * w * k];
    };
    const dists = [0];
    for (let i = 1; i < n; i++) dists.push(dists[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][2] - points[i - 1][2]));
    for (let i = 0; i < n - 1; i++) {
      const v0 = dists[i] / tile, v1 = dists[i + 1] / tile;
      for (const [k0, k1] of [[-1, 0], [0, 1]]) {
        const BL = lane(i, k0), BR = lane(i, k1), TR = lane(i + 1, k1), TL = lane(i + 1, k0);
        const tin = (k) => (k === 0 ? cT : eT), aln = (k) => (k === 0 ? 1 : eA);
        const u0 = (k0 + 1) / 2 * uw, u1 = (k1 + 1) / 2 * uw;
        // where the path folds back on itself a quad can come out inside-out (culled): wind those the other way
        const ny = (BR[2] - BL[2]) * (TL[0] - BL[0]) - (BR[0] - BL[0]) * (TL[2] - BL[2]);
        if (ny >= 0) this.quad(BL, BR, TR, TL, { ...o, uv: [u0, v0, u1, v1], tints: [tin(k0), tin(k1), tin(k1), tin(k0)], alphas: [aln(k0), aln(k1), aln(k1), aln(k0)] });
        else this.quad(BR, BL, TL, TR, { ...o, uv: [u1, v0, u0, v1], tints: [tin(k1), tin(k0), tin(k0), tin(k1)], alphas: [aln(k1), aln(k0), aln(k0), aln(k1)] });
      }
    }
    return this;
  }

  /** Append another builder's geometry (already in world space). */
  append(other) {
    for (const k of ['pos', 'uvs', 'colA', 'colB', 'nrm']) {
      const s = other[k], d = this[k];
      for (let i = 0; i < s.length; i++) d.push(s[i]);
    }
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('aCol', new THREE.BufferAttribute(new Uint8Array(this.colA), 4, true));
    if (this.lit) g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    else g.setAttribute('aColB', new THREE.BufferAttribute(new Uint8Array(this.colB), 4, true));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    g.userData.tris = this.triangleCount;
    return g;
  }
}
