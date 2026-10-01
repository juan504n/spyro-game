// Collision world: the heightfield + static/dynamic prop colliders (cylinders and oriented boxes) in a spatial hash.
// Entities are vertical capsules approximated as a circle (radius r) with a height h standing at feet y.
//
// Colliders: { type:'cyl', x, z, r, y0, y1, top, tag } | { type:'box', x, z, hx, hz, rot, y0, y1, top, tag }
//   top = its upper face y1 is a walkable/landable surface. Dynamic colliders (bobbing islands...) simply mutate y0/y1.
//   c.solid === false disables a collider (e.g. a dissolved barrier).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const SLOPE_WALK = 0.56;      // min normal.y considered walkable (~56 degrees; the valley rim is far steeper)
/**
 * Only colliders at least this big (radius / half-extent, metres) can hold the chase camera back, and never walk-on surfaces
 * (decks, stair treads, dais). That is houses, towers, the windmill, gate pillars, big boulders and spires. Trees (r 0.5-1.1), lamp posts,
 * standing stones, small rocks, fences and stalls do not: the camera slides through them, so passing a tree never zooms it in.
 */
export const CAM_BLOCK_SIZE = 2.4;

export class Collision {
  /** `solids`: the level's massifs (massif.js): rock that is not a heightfield, asked about wherever a collider is */
  constructor(grid, colliders = [], solids = []) {
    this.grid = grid;
    this.solids = solids;
    this.colliders = [];
    this.cell = 8;
    this.buckets = new Map();
    for (const c of colliders) this.add(c);
    this._n = [0, 1, 0];
  }

  _key(i, j) { return i * 4096 + j; }

  add(c) {
    if (c.solid === undefined) c.solid = true;
    if (c.cam === undefined) c.cam = !c.top && (c.type === 'cyl' ? c.r : Math.max(c.hx, c.hz)) >= CAM_BLOCK_SIZE;     // (may it hold the camera back?)
    this.colliders.push(c);
    // (+ the largest entity radius: near() only looks at the entity's own cell, so a collider must also be listed in the
    // neighbouring cells an entity touching it can stand in)
    const ext = (c.type === 'cyl' ? c.r : Math.hypot(c.hx, c.hz)) + 0.75;
    const i0 = Math.floor((c.x - ext) / this.cell), i1 = Math.floor((c.x + ext) / this.cell);
    const j0 = Math.floor((c.z - ext) / this.cell), j1 = Math.floor((c.z + ext) / this.cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this._key(i, j);
      let b = this.buckets.get(k);
      if (!b) { b = []; this.buckets.set(k, b); }
      b.push(c);
    }
    return c;
  }

  /** colliders whose bucket contains (x,z) (may include far-away members of big colliders; callers test exactly) */
  near(x, z) { return this.buckets.get(this._key(Math.floor(x / this.cell), Math.floor(z / this.cell))) || EMPTY; }

  heightAt(x, z) { return this.grid.heightAt(x, z); }

  // ---- exact point tests ---------------------------------------------------------------------------------------
  /** true if (x,z) lies inside collider c's footprint grown by `pad` */
  inside(c, x, z, pad = 0) {
    if (c.type === 'cyl') { const dx = x - c.x, dz = z - c.z, rr = c.r + pad; return dx * dx + dz * dz <= rr * rr; }
    const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    const dx = x - c.x, dz = z - c.z;
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;    // inverse of rotateY (local -> world uses x' = x cos + z sin)
    return Math.abs(lx) <= c.hx + pad && Math.abs(lz) <= c.hz + pad;
  }

  /**
   * Best supporting surface under (x,z) for something whose feet are at feetY: the highest standable surface with
   * y <= feetY + stepUp. Returns { y, kind, c } (kind = 'terrain' | 'collider' | 'solid'; a solid's surface also brings its normal as `n`: { nx, ny, nz }).
   */
  support(x, z, feetY, stepUp) {
    let y = this.grid.heightAt(x, z);
    let kind = 'terrain', hit = null, n;
    const list = this.near(x, z);
    for (let k = 0; k < list.length; k++) {
      const c = list[k];
      if (!c.solid || !c.top) continue;
      if (c.y1 > feetY + stepUp) continue;             // too tall to step onto
      if (c.y1 <= y) continue;
      if (this.inside(c, x, z, -0.02)) { y = c.y1; kind = 'collider'; hit = c; }
    }
    for (let k = 0; k < this.solids.length; k++) {
      const m = this.solids[k];
      if (!m.inBoxXZ(x, z)) continue;
      const g = m.ground(x, z, feetY, stepUp);
      if (g && g.y > y) { y = g.y; kind = 'solid'; hit = m; n = g; }
    }
    return n ? { y, kind, c: hit, n } : { y, kind, c: hit };
  }

  /** Terrain normal (walkability) at x,z. */
  normalAt(x, z, out) { return this.grid.normalAt(x, z, out || this._n); }

  /**
   * Push a circle (x,z,r) out of every solid collider it overlaps vertically with the body span
   * [feetY + stepUp, feetY + h]. Mutates ent.x/ent.z; returns the strongest contact {c, nx, nz} or null.
   */
  pushOut(ent, feetY, h, stepUp) {
    let contact = null;
    const list = this.near(ent.x, ent.z);
    const yLo = feetY + stepUp, yHi = feetY + h;
    for (let k = 0; k < list.length; k++) {
      const c = list[k];
      if (!c.solid || c.y1 <= yLo || c.y0 >= yHi) continue;
      if (c.type === 'cyl') {
        const dx = ent.x - c.x, dz = ent.z - c.z;
        const rr = c.r + ent.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1e-4;
          const nx = dx / d, nz = dz / d;
          ent.x = c.x + nx * rr; ent.z = c.z + nz * rr;
          contact = { c, nx, nz };
        }
      } else {
        const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
        let dx = ent.x - c.x, dz = ent.z - c.z;
        const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        const px = clamp(lx, -c.hx, c.hx), pz = clamp(lz, -c.hz, c.hz);
        let ox = lx - px, oz = lz - pz;
        let nlx, nlz, pen;
        if (ox === 0 && oz === 0) {
          // centre inside the box: exit through the nearest face
          const ex = c.hx - Math.abs(lx), ez = c.hz - Math.abs(lz);
          if (ex < ez) { nlx = Math.sign(lx) || 1; nlz = 0; pen = ex + ent.r; } else { nlx = 0; nlz = Math.sign(lz) || 1; pen = ez + ent.r; }
        } else {
          const d = Math.hypot(ox, oz);
          if (d >= ent.r) continue;
          nlx = ox / d; nlz = oz / d; pen = ent.r - d;
        }
        // local normal -> world normal (rotateY by rot)
        const nx = nlx * cs + nlz * sn, nz = -nlx * sn + nlz * cs;
        ent.x += nx * pen; ent.z += nz * pen;
        contact = { c, nx, nz };
      }
    }
    for (let k = 0; k < this.solids.length; k++) {
      const m = this.solids[k].push(ent, feetY, h, stepUp);
      if (m) contact = m;
    }
    return contact;
  }

  /** First solid collider whose volume contains the 3D point (used for camera/rays). camOnly: only those that may hold the camera back. */
  blocking(x, y, z, pad = 0, camOnly = false) {
    const list = this.near(x, z);
    for (let k = 0; k < list.length; k++) {
      const c = list[k];
      if (!c.solid || (camOnly && !c.cam) || y < c.y0 - pad || y > c.y1 + pad) continue;
      if (this.inside(c, x, z, pad)) return c;
    }
    for (let k = 0; k < this.solids.length; k++) if (this.solids[k].hitsPoint(x, y, z, pad)) return this.solids[k];
    return null;
  }

  /** how enclosed a point is by rock (0 in the open .. 1 deep in a cave): the camera comes in closer, and the hero is lit more dimly, the higher it is */
  enclosure(x, y, z) {
    let e = 0;
    for (let k = 0; k < this.solids.length; k++) e = Math.max(e, this.solids[k].enclosure(x, y, z));
    return e;
  }

  /**
   * March a segment (a -> b, each [x,y,z]) and return the fraction 0..1 of the first obstruction
   * (terrain or solid collider), or 1 if clear. `pad` grows obstacles (camera radius).
   * The march samples every 0.6 m, then bisects the last gap so the fraction is continuous: the coarse steps alone made the
   * result jump in ~8 % increments as the ray slid along an obstacle, and the camera followed each jump.
   * camOnly: the chase camera's question: the ground, and only the colliders big enough to hold a camera back (see CAM_BLOCK_SIZE).
   */
  rayFraction(ax, ay, az, bx, by, bz, pad = 0.3, camOnly = false) {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const steps = Math.max(2, Math.ceil(len / 0.6));
    const hit = (t) => {
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      return this.grid.heightAt(x, z) + pad > y || !!this.blocking(x, y, z, pad * 0.5, camOnly);
    };
    for (let i = 1; i <= steps; i++) {
      if (!hit(i / steps)) continue;
      let lo = (i - 1) / steps, hi = i / steps;
      for (let k = 0; k < 5; k++) { const mid = (lo + hi) / 2; if (hit(mid)) hi = mid; else lo = mid; }
      return lo;
    }
    return 1;
  }

  /**
   * The same march for the level's rock masses only (massif.js): the fraction 0..1 of the first one met, or 1. The camera uses it to be held back by a mountain's wall even
   * where it would otherwise keep its minimum distance (a ledge road winding round a mountain has the rock right beside it).
   */
  solidFraction(ax, ay, az, bx, by, bz, pad = 0.3) {
    const ms = this.solids;
    if (!ms.length) return 1;
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const steps = Math.max(2, Math.ceil(len / 0.5));
    const hit = (t) => {
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      for (let k = 0; k < ms.length; k++) if (ms[k].hitsPoint(x, y, z, pad)) return true;
      return false;
    };
    for (let i = 1; i <= steps; i++) {
      if (!hit(i / steps)) continue;
      let lo = (i - 1) / steps, hi = i / steps;
      for (let k = 0; k < 5; k++) { const mid = (lo + hi) / 2; if (hit(mid)) hi = mid; else lo = mid; }
      return lo;
    }
    return 1;
  }

  /** Candidates within radius for trigger tests (gems, pickups are handled by their own lists). */
  raycastDown(x, z, fromY, maxDrop = 200) {
    const s = this.support(x, z, fromY, 0);
    return fromY - s.y <= maxDrop ? s : null;
  }
}

const EMPTY = [];
