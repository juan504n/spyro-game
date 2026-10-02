// MASSIF: a mass of rock that a heightfield cannot be - a mountain with caves in it: tunnels through it, chambers inside it, arches and overhangs, mouths in its cliffs.
//
// The terrain stays a heightfield (it is the ground everywhere, floors of the caves included: a cave's floor is the terrain, shaped by the level). A massif is the rock standing on it,
// described by one function `field(x, y, z)`: negative inside the rock, positive in the air (a "signed distance" in spirit: only its zero set and its sign matter, so steep cliffs
// may stretch it). The same function drives everything, so what the hero feels is what is drawn:
//   * the mesh        surface nets over a regular grid of the field, each vertex then pulled onto the exact surface; PS1 look: per-texture triangle soup, baked vertex light
//   * the collision   push(): walls (a steep surface the body touches pushes it out sideways), ground(): a surface to stand on (a gentle slope, a ledge, the top of the mountain),
//                     rayHit(): the camera's rays; Collision (collision.js) asks every massif next to a point, exactly as it asks the colliders
//   * the light       openness (how much sky a point sees) and soft self-shadow by marching the grid: the inside of a cave is dark, the light comes through its mouths and skylights and from the
//                     glow lights placed in it (crystals, torches); terrain and props inside the rock are lit through Lighting.sample() with the same model (see lighting.js)
// A level with no massifs never touches any of this (the realm's world is built exactly as before).
import * as THREE from 'three';
import { Builder } from '../engine/builder.js';
import { ENVS } from '../engine/lighting.js';
import { SLOPE_WALK } from './collision.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---- field building blocks -----------------------------------------------------------------------------------------------------------
/** smooth minimum / maximum (polynomial): the union / intersection of two fields, rounded over k metres */
export const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
export const smax = (a, b, k) => -smin(-a, -b, k);

const hash3 = (x, y, z) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** 3D value noise, 0..1 */
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const a = lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), b = lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u);
  const c = lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), d = lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u);
  return lerp(lerp(a, b, v), lerp(c, d, v), w);
}
/** 3D fractal noise, roughly 0.2..0.8 */
export function fbm3(x, y, z, oct = 3) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

/** a point's nearest place on a polyline of [x, z, ...] points: { d (horizontal distance), t (0..1 along the whole line), i (segment), u (0..1 along it) } */
export function nearOnLine(pts, x, z) {
  let best = Infinity, bi = 0, bu = 0, total = 0, at = 0;
  const lens = [];
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); lens.push(l); total += l; }
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], vx = pts[i + 1][0] - ax, vz = pts[i + 1][1] - az;
    const l2 = vx * vx + vz * vz || 1;
    const u = clamp(((x - ax) * vx + (z - az) * vz) / l2);
    const d = Math.hypot(x - (ax + vx * u), z - (az + vz * u));
    if (d < best) { best = d; bi = i; bu = u; at = acc + lens[i] * u; }
    acc += lens[i];
  }
  return { d: best, i: bi, u: bu, t: total ? at / total : 0, at };
}

/**
 * An arched tunnel along a polyline: pts = [[x, z, floorY, halfWidth, height], ...] (the cross-section is the upper half of an ellipse over a flat floor; width, height and floor
 * are interpolated along the line, the ends are rounded). Returns air(x, y, z): negative inside the tunnel. The carve reaches half a metre below the floor, so that the
 * floor itself (the terrain) is never covered by a second, coincident surface.
 */
export function tunnelAir(pts) {
  return (x, y, z) => {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const vx = b[0] - a[0], vz = b[1] - a[1];
      const l2 = vx * vx + vz * vz || 1;
      const t = clamp(((x - a[0]) * vx + (z - a[1]) * vz) / l2);
      const d = Math.hypot(x - (a[0] + vx * t), z - (a[1] + vz * t));
      const fy = lerp(a[2], b[2], t), w = lerp(a[3], b[3], t), H = lerp(a[4], b[4], t);
      const u = d / w, v = (y - fy) / H;
      const e = Math.max((Math.sqrt(u * u + v * v) - 1) * Math.min(w, H), fy - 0.5 - y);
      if (e < best) best = e;
    }
    return best;
  };
}

/** A domed chamber: air inside the upper half of an ellipsoid (rx, rz across, height H) on a flat floor at floorY. */
export function chamberAir({ x, z, rx, rz = rx, rot = 0, H, floorY }) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return (px, py, pz) => {
    const dx = px - x, dz = pz - z;
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    const u = Math.hypot(lx / rx, lz / rz), v = (py - floorY) / H;
    return Math.max((Math.sqrt(u * u + v * v) - 1) * Math.min(rx, rz, H), floorY - 0.5 - py);
  };
}

/** A vertical shaft of air (a skylight, a chimney) from y0 up to y1, radius r. */
export function shaftAir({ x, z, r, y0, y1 }) {
  return (px, py, pz) => Math.max(Math.hypot(px - x, pz - z) - r, y0 - py, py - y1);
}

/** A round pillar of rock from y0 to y1 (to be united with the field). */
export function pillar({ x, z, r, y0, y1 }) {
  return (px, py, pz) => Math.max(Math.hypot(px - x, pz - z) - r, y0 - py, py - y1);
}

// ---- the massif ------------------------------------------------------------------------------------------------------------------------------
const OUT = 6;                                   // what the cached grid answers outside its box: air
const G = [0, 0, 0];
const SUN_STEPS = 26;

export class Massif {
  /**
   * @param {object} spec
   * @param {string} spec.id
   * @param {number[]} spec.box [x0, y0, z0, x1, y1, z1]: the volume that holds all of the rock (a surface must not touch its sides)
   * @param {(x:number,y:number,z:number)=>number} spec.field negative in the rock
   * @param {number} [spec.cell] mesh grid spacing (1.5)
   * @param {object} [spec.style] { rock: 'cliff'|..., interior: texture of the walls inside, top: texture of gentle ground on top, ambient: [r,g,b] inside, hush: ..., layers: [{ name, score }] (the textures laid over the rock, see build()), pick: a choice per triangle }
   */
  constructor(spec) {
    this.id = spec.id;
    this.name = spec.name || spec.id;
    const [x0, y0, z0, x1, y1, z1] = spec.box;
    this.box = { x0, y0, z0, x1, y1, z1 };
    this.cell = spec.cell || 1.5;
    this.field = spec.field;
    this.style = { rock: 'cliff', interior: 'far_rock', top: 'moss', ambient: [0.2, 0.24, 0.34], warm: false, ...(spec.style || {}) };
    this.nx = Math.ceil((x1 - x0) / this.cell); this.ny = Math.ceil((y1 - y0) / this.cell); this.nz = Math.ceil((z1 - z0) / this.cell);
    this.F = null;                               // the field sampled on the grid (see prepare)
    this.lights = [];                            // glow lights inside (filled by build from the kit's)
    this.tag = 'massif'; this.type = 'massif';
    this.prop = { name: `massif:${this.id}`, x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: y0, size: Math.max(x1 - x0, z1 - z0), src: 'massif' };
    this.solid = true; this.cam = true;           // (it is a collider as far as the camera and the debug readout can tell)
  }

  // ---- the field, exact and cached -----------------------------------------------------------------------------------------------------
  /** the exact field */
  f(x, y, z) {
    const B = this.box;
    if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1 || y > B.y1) return OUT;
    if (y < B.y0) return -OUT;
    return this.field(x, y, z);
  }

  /** the gradient of the field at a point (central differences) into out; returns its length */
  grad(x, y, z, out = G, e = 0.12) {
    const dx = this.f(x + e, y, z) - this.f(x - e, y, z), dy = this.f(x, y + e, z) - this.f(x, y - e, z), dz = this.f(x, y, z + e) - this.f(x, y, z - e);
    const l = Math.hypot(dx, dy, dz) || 1e-6;
    out[0] = dx / l; out[1] = dy / l; out[2] = dz / l;
    return l / (2 * e);
  }

  /** the gradient of the cached field (cheap: the trilinear grid, not the exact field), for wide differences e (a smoothed normal) */
  gradC(x, y, z, out = G, e = 3) {
    const dx = this.fc(x + e, y, z) - this.fc(x - e, y, z), dy = this.fc(x, y + e, z) - this.fc(x, y - e, z), dz = this.fc(x, y, z + e) - this.fc(x, y, z - e);
    const l = Math.hypot(dx, dy, dz) || 1e-6;
    out[0] = dx / l; out[1] = dy / l; out[2] = dz / l;
    return l / (2 * e);
  }

  /** a distance estimate to the surface (the field over its slope), and the outward unit normal in out */
  dist(x, y, z, out = G) {
    const f = this.f(x, y, z);
    if (f > 3) { out[0] = 0; out[1] = 1; out[2] = 0; return f; }                 // (far from any surface the field's slope means nothing: a jump in it far away must not read as a wall)
    const g = this.grad(x, y, z, out);
    return f / Math.max(g, 0.5);
  }

  inBoxXZ(x, z, pad = 0) { const B = this.box; return x > B.x0 - pad && x < B.x1 + pad && z > B.z0 - pad && z < B.z1 + pad; }
  inBox(x, y, z, pad = 0) { const B = this.box; return x > B.x0 - pad && x < B.x1 + pad && z > B.z0 - pad && z < B.z1 + pad && y > B.y0 - pad && y < B.y1 + pad; }

  /** Sample the field on the mesh grid, and the height of the highest rock in every column (what the baked shadows of the terrain see). */
  prepare() {
    if (this.F) return this;
    const { nx, ny, nz, cell } = this, B = this.box;
    const sx = nx + 1, sy = ny + 1, sz = nz + 1;
    const F = new Float32Array(sx * sy * sz);
    const top = new Float32Array(sx * sz).fill(-1e4);
    for (let k = 0; k < sz; k++) {
      for (let i = 0; i < sx; i++) {
        const x = B.x0 + i * cell, z = B.z0 + k * cell;
        for (let j = 0; j < sy; j++) {
          const y = B.y0 + j * cell;
          const v = this.field(x, y, z);
          F[(k * sy + j) * sx + i] = v;
          if (v < 0) top[k * sx + i] = y;
        }
      }
    }
    this.F = F; this.top = top; this.sx = sx; this.sy = sy; this.sz = sz;
    return this;
  }

  /** the cached field, trilinear; air outside the box */
  fc(x, y, z) {
    const B = this.box, cell = this.cell;
    const fx = (x - B.x0) / cell, fy = (y - B.y0) / cell, fz = (z - B.z0) / cell;
    if (fx < 0 || fy < 0 || fz < 0 || fx >= this.nx || fy >= this.ny || fz >= this.nz) return OUT;
    const i = fx | 0, j = fy | 0, k = fz | 0, tx = fx - i, ty = fy - j, tz = fz - k;
    const F = this.F, sx = this.sx, sy = this.sy;
    const o = (k * sy + j) * sx + i, dz = sx * sy;
    const a = F[o] + (F[o + 1] - F[o]) * tx, b = F[o + sx] + (F[o + sx + 1] - F[o + sx]) * tx;
    const c = F[o + dz] + (F[o + dz + 1] - F[o + dz]) * tx, d = F[o + dz + sx] + (F[o + dz + sx + 1] - F[o + dz + sx]) * tx;
    return (a + (b - a) * ty) * (1 - tz) + (c + (d - c) * ty) * tz;
  }

  /** the height of the highest rock over (x, z) (the cached grid, the nearest column): for the baked terrain shadows; -1e4 when there is none */
  topAt(x, z) {
    const B = this.box, cell = this.cell;
    const i = Math.round((x - B.x0) / cell), k = Math.round((z - B.z0) / cell);
    if (i < 0 || k < 0 || i >= this.sx || k >= this.sz) return -1e4;
    return this.top[k * this.sx + i];
  }

  /** is there rock over (x, y, z), more than `clear` metres above it (a cave's roof, an overhang, the mountain itself)? The nearest column of the cached grid; false outside the box. */
  roofed(x, y, z, clear = 2.5) { return this.topAt(x, z) > y + clear; }

  // ---- what a body in it feels ----------------------------------------------------------------------------------------------------------
  /**
   * Push a circle (ent.x, ent.z, ent.r) out of the rock it touches at the heights of the body span [feetY + stepUp, feetY + h]: the field is probed on a ring of eight points
   * round the body at three heights of that span, and wherever the ring is inside the rock the body is moved back by how far the ring reaches into it. (Anything lower than
   * feetY + stepUp, a kerb, the edge of a slab, a gentle slope, is not in the span: that is ground to step onto, see ground().) Returns { c: this, nx, nz } (the horizontal unit
   * normal of the strongest push, pointing from the rock to the body) or null.
   */
  push(ent, feetY, h, stepUp) {
    const r = ent.r;
    if (!this.inBoxXZ(ent.x, ent.z, r + 1) || feetY > this.box.y1 || feetY + h < this.box.y0) return null;
    let contact = null;
    const ys = [feetY + stepUp + 0.04, feetY + (stepUp + h) * 0.5, feetY + h - 0.04];
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let k = 0; k < ys.length; k++) {
        const y = ys[k];
        const f0 = this.f(ent.x, y, ent.z);
        if (f0 > 2.5 * r + 3) continue;                                         // (nowhere near any rock)
        let bx = 0, bz = 0, best = 0;
        if (f0 < 0) {
          // the body's axis is inside the rock (it was pushed or placed there): out by the gradient, as far as it takes
          this.grad(ent.x, y, ent.z, G);
          const hl = Math.hypot(G[0], G[2]);
          if (hl > 0.05) { bx = G[0] / hl; bz = G[2] / hl; best = Math.min(Math.abs(f0) / Math.max(hl, 0.3) + r, 1.2); }
        } else {
          for (let i = 0; i < 8; i++) {
            const a = i * 0.7853981633974483, dx = Math.cos(a), dz = Math.sin(a);
            if (this.f(ent.x + dx * r, y, ent.z + dz * r) >= 0) continue;
            let lo = 0, hi = r;
            for (let it = 0; it < 5; it++) { const mid = (lo + hi) / 2; if (this.f(ent.x + dx * mid, y, ent.z + dz * mid) < 0) hi = mid; else lo = mid; }
            const pen = r - lo;
            if (pen > best) { best = pen; bx = -dx; bz = -dz; }
          }
        }
        if (best > 0) {
          ent.x += bx * best; ent.z += bz * best;
          contact = { c: this, nx: bx, nz: bz };
          moved = true;
        }
      }
      if (!moved) break;
    }
    return contact;
  }

  /**
   * The highest surface to stand on under (x, z) that is at or below feetY + stepUp: { y, nx, ny, nz } or null (no rock, or rock at the height of the step: a wall).
   * It marches down from there, in 0.25 m steps, then in metres, and settles the surface by bisection.
   */
  ground(x, z, feetY, stepUp) {
    const B = this.box;
    if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1) return null;
    const top = Math.min(feetY + stepUp, B.y1);
    if (top < B.y0) return null;
    let f = this.field(x, top, z);
    if (f <= 0) return null;
    let yHi = top, y = top;
    while (y > B.y0) {
      const step = top - y > 6 ? 1 : 0.25;
      y = Math.max(y - step, B.y0);
      f = this.field(x, y, z);
      if (f <= 0) {
        let lo = y, hi = yHi;
        for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; if (this.field(x, mid, z) > 0) hi = mid; else lo = mid; }
        const gy = (lo + hi) / 2;
        this.grad(x, gy, z, G);
        return { y: gy, nx: G[0], ny: G[1], nz: G[2] };
      }
      yHi = y;
    }
    return null;
  }

  /** is this point (grown by pad) inside the rock? (for the camera's rays and the debug readout) */
  hitsPoint(x, y, z, pad = 0) {
    if (!this.inBox(x, y, z, pad)) return false;
    return this.field(x, y, z) < pad;
  }

  /** how enclosed a point is, 0 (open air) to 1 (inside a cave): the share of nine upward rays that meet rock within 12 m (uses the cached grid) */
  enclosure(x, y, z) {
    if (!this.F || !this.inBox(x, y, z, 14)) return 0;
    let hit = 0;
    for (let r = 0; r < RAYS.length; r++) {
      const d = RAYS[r];
      for (let s = 1; s <= 6; s++) {
        const t = s * 2;
        if (this.fc(x + d[0] * t, y + d[1] * t, z + d[2] * t) < 0) { hit++; break; }
      }
    }
    return hit / RAYS.length;
  }

  // ---- light -----------------------------------------------------------------------------------------------------------------------------
  /** the sky a point sees: the share of the upward rays (zenith, and a ring each at 62 and 35 degrees) that get out through 30 m of the cached field */
  sky(x, y, z) {
    let seen = 0;
    for (let r = 0; r < SKY_RAYS.length; r++) {
      const d = SKY_RAYS[r];
      let free = true;
      for (let s = 1; s <= 7; s++) {
        const t = s * s * 0.55 + 0.6;                  // 1.15, 2.7, 5.3, 8.8, 13.2, 18.4, 24.5 ... out to 30 m
        if (this.fc(x + d[0] * t, y + d[1] * t, z + d[2] * t) < 0) { free = false; break; }
      }
      if (free) seen += d[3];
    }
    return seen;
  }

  /** local occlusion: the rock near a surface point, 1 (open) to about 0.35 (a crease) */
  ao(x, y, z, nx, ny, nz) {
    let occ = 0, w = 0.5;
    for (let i = 0; i < 4; i++) {
      const d = 0.45 + i * 0.9;
      const f = this.fc(x + nx * d, y + ny * d, z + nz * d);
      occ += w * clamp((d - f) / d);
      w *= 0.62;
    }
    return clamp(1 - occ * 1.15, 0.3, 1);
  }

  /** the share of a light that reaches a point: 1, or less if the rock is in the way along dir (a soft march over 52 m of the cached grid) */
  lit(x, y, z, dx, dy, dz) {
    let v = 1;
    for (let s = 1; s <= SUN_STEPS; s++) {
      const t = s * 2;
      const f = this.fc(x + dx * t, y + dy * t, z + dz * t);
      if (f < 0) return 0;
      v = Math.min(v, f / (t * 0.28 + 0.6));
    }
    return clamp(v);
  }

  /**
   * The light at a point inside or on the rock for both environments (out[0..2] = A, out[3..5] = B): the sky's ambient shut out by the rock round it, the sun and moon where the
   * rock lets them in, and the glow lights near it. `std` (if given, a result of the ordinary outdoor model, 6 floats) is blended in by how much sky the point sees, so the
   * ground at a cave's mouth fades into the day outside.
   */
  light(out, x, y, z, nx, ny, nz, std = null, lightsOnly = false) {
    const sky = this.sky(x + nx * 0.5, y + ny * 0.5 + 0.3, z + nz * 0.5);
    if (std && sky > 0.6) { for (let i = 0; i < 6; i++) out[i] = std[i]; return out; }               // (out in the open, or at a cliff's foot: the ordinary light)
    const ao = this.ao(x, y, z, nx, ny, nz);
    const amb = this.style.ambient;
    const up = ny * 0.5 + 0.5;
    for (let e = 0; e < 2; e++) {
      const env = (this.envs || ENVS)[e];
      let r = 0, g = 0, b = 0;
      // the sky's ambient comes in with the sky seen; the cave's own colour fills the rest
      for (let c = 0; c < 3; c++) {
        const open = (env.ground[c] + (env.sky[c] - env.ground[c]) * up) * sky;
        const v = (open + amb[c] * (1 - sky) + amb[c] * 0.35) * ao;
        if (c === 0) r = v; else if (c === 1) g = v; else b = v;
      }
      // the key light (and the moon / sun) where they get in
      if (sky > 0.02) {
        const L = env.lights.find((l) => l.shadow) || env.lights[0];
        const ndl = nx * L.dir[0] + ny * L.dir[1] + nz * L.dir[2];
        if (ndl > 0) {
          const vis = this.lit(x + nx * 0.4, y + ny * 0.4, z + nz * 0.4, L.dir[0], L.dir[1], L.dir[2]);
          r += L.color[0] * ndl * vis; g += L.color[1] * ndl * vis; b += L.color[2] * ndl * vis;
        }
        for (const l of env.lights) {
          if (l.shadow) continue;
          const ndl2 = nx * l.dir[0] + ny * l.dir[1] + nz * l.dir[2];
          if (ndl2 > 0) { const k = ndl2 * sky; r += l.color[0] * k; g += l.color[1] * k; b += l.color[2] * k; }
        }
      }
      out[e * 3] = r; out[e * 3 + 1] = g; out[e * 3 + 2] = b;
    }
    // glow lights (crystals, torches, braziers): a soft pool of colour that does not care which way a surface faces too much
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const dx = l.x - x, dy = l.y - y, dz = l.z - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= l.R * l.R) continue;
      const d = Math.sqrt(d2);
      const facing = d < 0.3 ? 1 : 0.45 + 0.55 * Math.max(0, (nx * dx + ny * dy + nz * dz) / d);
      const k = (1 - d / l.R) * (1 - d / l.R) * l.K * facing * ao;
      for (let e = 0; e < 2; e++) { out[e * 3] += l.color[0] * k; out[e * 3 + 1] += l.color[1] * k; out[e * 3 + 2] += l.color[2] * k; }
    }
    // (many glows overlapping would burn the rock out to white: a soft shoulder keeps the sum below about 1.15, as bright as the sunlit ground outside)
    for (let i = 0; i < 6; i++) { const v = out[i]; out[i] = v < 0.62 ? v : 0.62 + 0.53 * (1 - Math.exp(-(v - 0.62) / 0.53)); }
    if (std) {
      // the more sky a point sees the more the ordinary outdoor light counts
      const w = smooth(0.22, 0.6, sky);
      if (w > 0) for (let i = 0; i < 6; i++) out[i] = lerp(out[i], std[i], w);
    }
    void lightsOnly;
    return out;
  }

  /** take the glow lights that shine inside this massif (the kit's list: { x, y, z, color, size, lightR?, lightK? }) */
  takeLights(list) {
    const B = this.box;
    this.lights = [];
    for (const l of list || []) {
      if (!this.inBox(l.x, l.y, l.z, 6)) continue;
      const peak = Math.max(l.color[0], l.color[1], l.color[2]);
      this.lights.push({ x: l.x, y: l.y, z: l.z, color: l.color, R: l.lightR ?? Math.min(13, Math.max(7, l.size * 2.4)), K: l.lightK ?? 0.62 * Math.min(1.2, peak + 0.2) });
    }
    void B;
    return this;
  }

  // ---- the mesh --------------------------------------------------------------------------------------------------------------------------
  /**
   * Surface nets over the cached grid. Returns { pos: Float32Array (xyz), nrm: Float32Array, idx: Uint32Array (triangles) } with the vertices drawn onto the exact surface.
   */
  mesh() {
    this.prepare();
    const { nx, ny, nz, cell, F, sx, sy } = this, B = this.box;
    const cv = new Int32Array(nx * ny * nz).fill(-1);
    const pos = [];
    const cellIdx = (i, j, k) => (k * ny + j) * nx + i;
    const fAt = (i, j, k) => F[(k * sy + j) * sx + i];
    const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cv8 = new Float32Array(8);
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          let mask = 0;
          for (let c = 0; c < 8; c++) { const v = fAt(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1)); cv8[c] = v; if (v < 0) mask |= 1 << c; }
          if (mask === 0 || mask === 255) continue;
          let px = 0, py = 0, pz = 0, n = 0;
          for (let e = 0; e < 12; e++) {
            const a = EDGES[e][0], b = EDGES[e][1];
            if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
            const t = cv8[a] / (cv8[a] - cv8[b]);
            px += (i + (a & 1)) + ((b & 1) - (a & 1)) * t;
            py += (j + ((a >> 1) & 1)) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
            pz += (k + ((a >> 2) & 1)) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
            n++;
          }
          let x = B.x0 + (px / n) * cell, y = B.y0 + (py / n) * cell, z = B.z0 + (pz / n) * cell;
          // pull the vertex onto the exact surface (the grid only knows the field at its corners)
          for (let it = 0; it < 1; it++) {
            const f = this.field(x, y, z);
            const gl = this.grad(x, y, z, G);
            const s = clamp(f / Math.max(gl, 0.4), -0.5 * cell, 0.5 * cell);
            x -= G[0] * s; y -= G[1] * s; z -= G[2] * s;
          }
          x = clamp(x, B.x0 + i * cell - 0.35 * cell, B.x0 + (i + 1) * cell + 0.35 * cell);
          y = clamp(y, B.y0 + j * cell - 0.35 * cell, B.y0 + (j + 1) * cell + 0.35 * cell);
          z = clamp(z, B.z0 + k * cell - 0.35 * cell, B.z0 + (k + 1) * cell + 0.35 * cell);
          cv[cellIdx(i, j, k)] = pos.length / 3;
          pos.push(x, y, z);
        }
      }
    }
    const nv = pos.length / 3;
    const N = new Float32Array(nv * 3);
    for (let v = 0; v < nv; v++) { this.grad(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], G); N[v * 3] = G[0]; N[v * 3 + 1] = G[1]; N[v * 3 + 2] = G[2]; }
    const idx = [];
    // how well a triangle's own normal agrees with the surface normals at its corners (-1 .. 1)
    const agree = (a, b, c) => {
      const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
      const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
      const nx_ = uy * vz - uz * vy, ny_ = uz * vx - ux * vz, nz_ = ux * vy - uy * vx;
      const l = Math.hypot(nx_, ny_, nz_);
      if (l < 1e-9) return -1;
      const mx = N[a * 3] + N[b * 3] + N[c * 3], my = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], mz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
      return (nx_ * mx + ny_ * my + nz_ * mz) / (l * (Math.hypot(mx, my, mz) || 1));
    };
    const quad = (a, b, c, d, flip) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      const q = flip ? [a, d, c, b] : [a, b, c, d];
      // split along the diagonal whose two triangles both lie best on the surface
      const s1 = Math.min(agree(q[0], q[1], q[2]), agree(q[0], q[2], q[3])), s2 = Math.min(agree(q[1], q[2], q[3]), agree(q[1], q[3], q[0]));
      if (s1 >= s2) idx.push(q[0], q[1], q[2], q[0], q[2], q[3]);
      else idx.push(q[1], q[2], q[3], q[1], q[3], q[0]);
    };
    for (let k = 0; k <= nz; k++) {
      for (let j = 0; j <= ny; j++) {
        for (let i = 0; i <= nx; i++) {
          const f0 = fAt(i, j, k) < 0;
          if (i < nx && j > 0 && k > 0 && j < ny && k < nz) {
            const f1 = fAt(i + 1, j, k) < 0;
            if (f0 !== f1) quad(cv[cellIdx(i, j - 1, k - 1)], cv[cellIdx(i, j, k - 1)], cv[cellIdx(i, j, k)], cv[cellIdx(i, j - 1, k)], !f0);
          }
          if (j < ny && i > 0 && k > 0 && i < nx && k < nz) {
            const f1 = fAt(i, j + 1, k) < 0;
            if (f0 !== f1) quad(cv[cellIdx(i - 1, j, k - 1)], cv[cellIdx(i, j, k - 1)], cv[cellIdx(i, j, k)], cv[cellIdx(i - 1, j, k)], f0);
          }
          if (k < nz && i > 0 && j > 0 && i < nx && j < ny) {
            const f1 = fAt(i, j, k + 1) < 0;
            if (f0 !== f1) quad(cv[cellIdx(i - 1, j - 1, k)], cv[cellIdx(i, j - 1, k)], cv[cellIdx(i, j, k)], cv[cellIdx(i - 1, j, k)], !f0);
          }
        }
      }
    }
    return { pos: new Float32Array(pos), nrm: N, idx: new Uint32Array(idx) };
  }

  /**
   * Build the render meshes: one per texture. `grid` hides what lies under the terrain, `lighting` is the world's (for the sample of its massif hook), `lights` the glow lights.
   * Returns { group, stats }.
   */
  build(assets, grid, lights) {
    this.takeLights(lights);
    const m = this.mesh();
    const { pos, nrm, idx } = m;
    const nv = pos.length / 3;
    // light every vertex once
    const irr = new Float32Array(nv * 6);
    const tmp = new Float32Array(6);
    const vSky = new Float32Array(nv);
    for (let v = 0; v < nv; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      this.light(tmp, x, y, z, nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
      for (let c = 0; c < 6; c++) irr[v * 6 + c] = tmp[c];
      vSky[v] = this.sky(x + nrm[v * 3] * 0.5, y + nrm[v * 3 + 1] * 0.5 + 0.3, z + nrm[v * 3 + 2] * 0.5);
    }
    // the texture is projected along the dominant axis of a SMOOTHED normal (the field's gradient over +-3 m, not the surface's own): on a dome or the haunch of an arch, where the surface
    // slopes at 45 degrees and its own normal flips between two axes from one triangle to the next, a checkerboard of projections would show; with a smooth normal neighbours agree, and
    // the change of projection runs along one clean line
    const smoothN = new Float32Array(nv * 3);
    for (let v = 0; v < nv; v++) { this.gradC(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], G, 3.2); smoothN[v * 3] = G[0]; smoothN[v * 3 + 1] = G[1]; smoothN[v * 3 + 2] = G[2]; }
    const queue = { i: 0, v: [0, 0, 0] };
    // (vertices made on the way, where the border between two textures crosses an edge of the mesh: v >= nv; they carry the same attributes as the mesh's own)
    const ext = { pos: [], nrm: [], irr: [], sky: [], sm: [] };
    const vp = (v) => (v < nv ? [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]] : ext.pos[v - nv]);
    const vn = (v) => (v < nv ? [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]] : ext.nrm[v - nv]);
    const vs = (v) => (v < nv ? vSky[v] : ext.sky[v - nv]);
    const vm = (v) => (v < nv ? [smoothN[v * 3], smoothN[v * 3 + 1], smoothN[v * 3 + 2]] : ext.sm[v - nv]);
    const vi = (v) => (v < nv ? irr.subarray(v * 6, v * 6 + 6) : ext.irr[v - nv]);
    const lighting = { sample(out) { const l = vi(queue.v[queue.i++]); for (let c = 0; c < 6; c++) out[c] = l[c]; } };
    const builders = new Map();
    const getB = (name) => { let b = builders.get(name); if (!b) { b = new Builder({ lighting }); builders.set(name, b); } return b; };
    const S = this.style, tile = S.tile || 5;
    // The textures of the rock: `style.layers` = [{ name, score({ x, y, z, ny, sky }) }] in order of priority, positive where that texture is wanted. A score is read at the VERTICES and the border
    // is cut where it crosses zero along an edge (the vertex made there is shared by the two triangles of the edge), so the border is a smooth line, not the staircase of whole triangles
    // that a choice made per triangle draws (green teeth along a road's edge, along a ridge's grass). `ny` is the height of the SMOOTHED normal (the one that projects the texture), since the rock's
    // own roughness turns the surface's normal by 45 degrees every two metres and a border drawn on that would still zigzag. Without layers the choice is per triangle: `style.pick`, or the interior / top / rock rule.
    const layers = S.layers || null, nl = layers ? layers.length : 0;
    const sc = Array.from({ length: nl }, () => new Map());
    const scoreOf = (li, v) => {
      let r = sc[li].get(v);
      if (r === undefined) { const [x, y, z] = vp(v), m = vm(v); r = layers[li].score({ x, y, z, ny: m[1] / (Math.hypot(m[0], m[1], m[2]) || 1), sky: vs(v) }); sc[li].set(v, r); }
      return r;
    };
    const cuts = new Map();
    const crossing = (p, q, sp, sq, li) => {
      const lo = Math.min(p, q), hi = Math.max(p, q), key = (li * 2097152 + lo) * 2097152 + hi;       // (the same edge, the same border, the same vertex, whichever triangle asks)
      let r = cuts.get(key);
      if (r !== undefined) return r;
      const t = lo === p ? sp / (sp - sq) : sq / (sq - sp);
      const mixV = (f) => { const A = f(lo), B = f(hi); return A.map((u, k) => u + (B[k] - u) * t); };
      const np = mixV(vp), nn = mixV(vn), nm = mixV(vm), ni = new Float32Array(6);
      const A = vi(lo), B = vi(hi); for (let c = 0; c < 6; c++) ni[c] = A[c] + (B[c] - A[c]) * t;
      const nl2 = Math.hypot(nn[0], nn[1], nn[2]) || 1;
      r = nv + ext.pos.length;
      ext.pos.push(np); ext.nrm.push([nn[0] / nl2, nn[1] / nl2, nn[2] / nl2]); ext.sm.push(nm); ext.irr.push(ni); ext.sky.push(vs(lo) + (vs(hi) - vs(lo)) * t);
      cuts.set(key, r);
      return r;
    };
    /** a polygon (vertex indices) cut by the sign of layer li's score: [the part where it is positive, the rest] */
    const clip = (poly, li) => {
      const ins = [], outs = [];
      for (let k = 0; k < poly.length; k++) {
        const p = poly[k], q = poly[(k + 1) % poly.length], sp = scoreOf(li, p), sq = scoreOf(li, q);
        (sp > 0 ? ins : outs).push(p);
        if ((sp > 0) !== (sq > 0)) { const x = crossing(p, q, sp, sq, li); ins.push(x); outs.push(x); }
      }
      return [ins, outs];
    };
    const tris = idx.length / 3;
    for (let t = 0; t < tris; t++) {
      const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
      const pa = vp(a), pb = vp(b), pc = vp(c);
      if (grid && Math.max(pa[1] - grid.heightAt(pa[0], pa[2]), pb[1] - grid.heightAt(pb[0], pb[2]), pc[1] - grid.heightAt(pc[0], pc[2])) < -0.3) continue;      // (under the ground: never seen)
      // planar projection along the dominant axis of the triangle's smoothed normal keeps the texel density even
      const ax = Math.abs(smoothN[a * 3] + smoothN[b * 3] + smoothN[c * 3]), ay = Math.abs(smoothN[a * 3 + 1] + smoothN[b * 3 + 1] + smoothN[c * 3 + 1]), az = Math.abs(smoothN[a * 3 + 2] + smoothN[b * 3 + 2] + smoothN[c * 3 + 2]);
      const uv = (p) => (ay >= ax && ay >= az ? [p[0] / tile, p[2] / tile] : ax >= az ? [p[2] / tile, p[1] / tile] : [p[0] / tile, p[1] / tile]);
      const jit = (p) => 0.92 + 0.16 * noise3(p[0] * 0.21, p[1] * 0.21, p[2] * 0.21);
      const emit = (poly, name) => {
        for (let k = 1; k + 1 < poly.length; k++) {
          const i0 = poly[0], i1 = poly[k], i2 = poly[k + 1], q0 = vp(i0), q1 = vp(i1), q2 = vp(i2);
          const ux = q1[0] - q0[0], uy = q1[1] - q0[1], uz = q1[2] - q0[2], wx = q2[0] - q0[0], wy = q2[1] - q0[1], wz = q2[2] - q0[2];
          if (Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) < 1e-6) continue;      // (a sliver where a border passed through a corner)
          queue.i = 0; queue.v = [i0, i1, i2];
          getB(name).tri(q0, q1, q2, uv(q0), uv(q1), uv(q2), { tints: [[jit(q0), jit(q0), jit(q0)], [jit(q1), jit(q1), jit(q1)], [jit(q2), jit(q2), jit(q2)]] }, [vn(i0), vn(i1), vn(i2)]);
        }
      };
      if (!layers) {
        const na = vn(a), nb = vn(b), nc = vn(c), sn = [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]];
        const ny = sn[1] / (Math.hypot(sn[0], sn[1], sn[2]) || 1), sky = (vSky[a] + vSky[b] + vSky[c]) / 3;
        emit([a, b, c], S.pick ? S.pick({ ny, sky, y: (pa[1] + pb[1] + pc[1]) / 3, x: (pa[0] + pb[0] + pc[0]) / 3, z: (pa[2] + pb[2] + pc[2]) / 3 }) : (sky < 0.5 ? S.interior : ny > 0.8 ? S.top : S.rock));
        continue;
      }
      let rest = [[a, b, c]];
      for (let li = 0; li < nl && rest.length; li++) {
        const next = [];
        for (const poly of rest) { const [inside, outside] = clip(poly, li); if (inside.length >= 3) emit(inside, layers[li].name); if (outside.length >= 3) next.push(outside); }
        rest = next;
      }
      for (const poly of rest) emit(poly, S.rock);
    }
    const group = new THREE.Group();
    group.name = `massif:${this.id}`;
    const stats = {};
    for (const [name, bd] of builders) {
      const geo = bd.build();
      const mesh = new THREE.Mesh(geo, assets.mat(name, { double: true }));      // (double-sided: surface nets leave a few folded triangles in tight creases, and a fold must not be a hole)
      mesh.name = `massif:${this.id}:${name}`;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      stats[name] = bd.triangleCount;
      bd.release();
    }
    this.stats = { vertices: nv, triangles: tris, cutVertices: ext.pos.length, byTexture: stats };
    return { group, stats: this.stats };
  }
}

// ---- ray sets -------------------------------------------------------------------------------------------------------------------------------
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const ring = (n, el, rot = 0) => Array.from({ length: n }, (_, i) => { const a = rot + (i / n) * Math.PI * 2; return norm3([Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)]); });
/** nine rays for enclosure(): the zenith, and rings of four at 62 and 35 degrees (rotated against each other) */
const RAYS = [[0, 1, 0], ...ring(4, 1.08), ...ring(4, 0.61, Math.PI / 4)];
/** the sky rays of sky(): the same nine, with weights that sum to 1 (the zenith counts for 3/10) */
const SKY_RAYS = RAYS.map((d, i) => [d[0], d[1], d[2], i === 0 ? 0.28 : 0.72 / 8]);
