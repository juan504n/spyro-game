// Placement helpers shared by the level population scripts.
import { RNG } from '../../engine/textures/pix.js';
import { PROPS } from '../props/index.js';
import { WATER_LEVEL } from '../level.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const warned = new Set();

/** Spatial hash for spacing checks. */
export class Occupancy {
  constructor(cell = 8) { this.cell = cell; this.map = new Map(); }
  _k(i, j) { return i * 8192 + j; }
  add(x, z, r) {
    const c = this.cell;
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) {
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
        const k = this._k(i, j);
        let a = this.map.get(k);
        if (!a) { a = []; this.map.set(k, a); }
        a.push([x, z, r]);
      }
    }
  }
  free(x, z, r) {
    const c = this.cell;
    const a = this.map.get(this._k(Math.floor(x / c), Math.floor(z / c)));
    if (!a) return true;
    for (const [ox, oz, or] of a) if ((x - ox) ** 2 + (z - oz) ** 2 < (r + or) ** 2) return false;
    return true;
  }
}

/** Context object bundling everything a layout script needs. */
export function makeCtx(kit, world, seed = 9127) {
  const grid = world.grid;
  const rng = new RNG(seed);
  const occ = new Occupancy();
  const s = grid.n + 1;
  const ctx = {
    kit, world, grid, rng, occ, L: grid.level,
    gp: { gems: [], vases: [], chests: [], walls: [], braziers: [], mushrooms: [], enemies: [], bunnies: [], npcs: [], hints: [], beacons: [], islands: [], extraGems: [], soundSources: [], placed: [] },
    counts: {},
    stage: 'populate',       // which part of the level script is running (populate() sets it per layout function): recorded on everything placed, for the debug readout
    h: (x, z) => grid.heightAt(x, z),
    slope: (x, z) => grid.slopeAt(x, z),
    pathDist: (x, z) => {
      const i = clamp(Math.round((x + grid.half) / grid.cell), 0, grid.n), j = clamp(Math.round((z + grid.half) / grid.cell), 0, grid.n);
      return grid.pathDist[j * s + i];
    },
    riverDist: (x, z) => {
      const i = clamp(Math.round((x + grid.half) / grid.cell), 0, grid.n), j = clamp(Math.round((z + grid.half) / grid.cell), 0, grid.n);
      return grid.riverDist[j * s + i];
    },
    /** valley-normalised radius (1 = rim) */
    vr: (x, z) => Math.hypot((x - grid.level.valley.x) / grid.level.valley.rx, (z - grid.level.valley.z) / grid.level.valley.rz),
    lakeD: (x, z) => Math.hypot((x - grid.level.lake.x) / grid.level.lake.rx, (z - grid.level.lake.z) / grid.level.lake.rz),
  };
  ctx.has = (name) => {
    if (PROPS[name]) return true;
    if (!warned.has(name)) { warned.add(name); console.warn('[levelgen] prop missing:', name); }
    return false;
  };

  /**
   * Place a registered prop (no terrain checks). Returns true if placed. Every placement is recorded ({ name, x, y, z, size, src }) in
   * gp.placed, and stamped on the colliders the prop registers, so the debug readout can say which prop it is and which layout made it.
   */
  ctx.put = (name, x, z, params = {}, footprint = 0) => {
    if (!ctx.has(name)) return false;
    const e = PROPS[name];
    const rec = { name, x, z, y: params.y ?? grid.heightAt(x, z), rot: params.rot || 0, size: e.size || 4, src: ctx.stage };
    kit.cur = rec;
    e.fn(kit, { ...(e.defaults || {}), x, z, ...params });
    kit.cur = null;
    ctx.gp.placed.push(rec);
    if (footprint) occ.add(x, z, footprint);
    ctx.counts[name] = (ctx.counts[name] || 0) + 1;
    return true;
  };

  /** Would a prop of `radius` fit here on decent ground? */
  ctx.ok = (x, z, o = {}) => {
    const { r = 1.5, maxSlope = 0.42, minH = WATER_LEVEL + 0.9, maxH = 999, path = 2.2, river = 3, lake = 1.08 } = o;
    if (Math.abs(x) > 185 || Math.abs(z) > 185) return false;
    const h = grid.heightAt(x, z);
    if (h < minH || h > maxH) return false;
    if (ctx.slope(x, z) > maxSlope) return false;
    if (ctx.pathDist(x, z) < path) return false;
    if (ctx.riverDist(x, z) < river) return false;
    if (ctx.lakeD(x, z) < lake) return false;
    if (!occ.free(x, z, r)) return false;
    return true;
  };

  /** Scatter up to `n` props sampled from `sample()` -> [x,z] that satisfy `ok` options. */
  ctx.scatter = (nameOrFn, n, sample, okOpts = {}, paramsFn = null, foot = 0) => {
    let placed = 0;
    for (let tries = 0; tries < n * 25 && placed < n; tries++) {
      const [x, z] = sample();
      const name = typeof nameOrFn === 'function' ? nameOrFn(x, z) : nameOrFn;
      if (!name) continue;
      const r = foot || okOpts.r || 2;
      if (!ctx.ok(x, z, { ...okOpts, r })) continue;
      const params = paramsFn ? paramsFn(x, z) : {};
      if (ctx.put(name, x, z, { rot: rng.float(0, Math.PI * 2), ...params }, r)) placed++;
    }
    return placed;
  };

  /** Find a nearby spot that keeps clear of roads/water/steep ground/other props (spirals outward from x,z). */
  ctx.spot = (x, z, { r = 1.6, clear = 1.4, maxR = 14 } = {}) => {
    for (let d = 0; d <= maxR; d += 1.4) {
      const n = d === 0 ? 1 : Math.ceil(d * 2.2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + d;
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (ctx.ok(px, pz, { r, path: clear, maxSlope: 0.38, river: 2.5, lake: 1.04 })) return [px, pz];
      }
    }
    return [x, z];
  };

  // samplers -------------------------------------------------------------------------------------------------------
  ctx.inCircle = (cx, cz, r) => () => { const a = rng.float(0, Math.PI * 2), d = Math.sqrt(rng.next()) * r; return [cx + Math.cos(a) * d, cz + Math.sin(a) * d]; };
  ctx.inRing = (cx, cz, r0, r1) => () => { const a = rng.float(0, Math.PI * 2), d = r0 + (r1 - r0) * Math.sqrt(rng.next()); return [cx + Math.cos(a) * d, cz + Math.sin(a) * d]; };
  ctx.inBand = (n0, n1) => () => {
    const v = grid.level.valley;
    const a = rng.float(0, Math.PI * 2), d = n0 + (n1 - n0) * Math.sqrt(rng.next());
    return [v.x + Math.cos(a) * d * v.rx, v.z + Math.sin(a) * d * v.rz];
  };
  ctx.anywhere = (n0 = 0, n1 = 0.9) => ctx.inBand(n0, n1);

  /** local anchor of a prop placement -> world [x,y,z] */
  ctx.anchor = (name, key, x, z, { rot = 0, scale = 1, y } = {}) => {
    const a = PROPS[name]?.anchors?.[key];
    if (!a) return null;
    const c = Math.cos(rot), s2 = Math.sin(rot);
    const gy = y ?? grid.heightAt(x, z);
    return [x + (a[0] * c + a[2] * s2) * scale, gy + a[1] * scale, z + (-a[0] * s2 + a[2] * c) * scale, (a[3] || 0) + rot];
  };

  /** yaw so a prop's local +Z faces (tx,tz) from (x,z) */
  ctx.face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

  /** Nearest dense-path point to (x,z) plus its local direction. */
  ctx.pathPoint = (id, t) => {
    const p = grid.paths.find((q) => q.id === id);
    const i = clamp(Math.round(t * (p.pts.length - 1)), 0, p.pts.length - 1);
    const a = p.pts[Math.max(i - 1, 0)], b = p.pts[Math.min(i + 1, p.pts.length - 1)];
    let dx = b[0] - a[0], dz = b[2] - a[2];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    return { x: p.pts[i][0], y: p.pts[i][1], z: p.pts[i][2], dx, dz, width: p.width };
  };
  return ctx;
}
