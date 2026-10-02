// Baked lighting for two environments: A = "Gloaming" (moonlit twilight, the realm's curse) and B = "Daybreak"
// (sunrise once the lanterns are relit). Every static vertex stores an irradiance for BOTH; the shader blends them by
// uDay. Also owns the atmosphere (sky / fog / sun / moon) as a function of day so sky, fog and dynamic lights agree.

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Compass-style direction TOWARD a light: az 0 = +x (east), 90 = +z (south), 180 = west, 270 = north. */
export function dirAzEl(azDeg, elDeg) {
  const az = (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
}

export const ENVS = [
  { // A — Gloaming: cool moonlight from the west, a faint coral glow from the not-yet-risen sun in the east
    name: 'gloaming',
    lights: [
      { dir: dirAzEl(205, 42), color: [0.62, 0.74, 1.0], shadow: true },
      { dir: dirAzEl(8, 6), color: [0.85, 0.42, 0.32], shadow: false },
    ],
    sky: [0.36, 0.38, 0.62],
    ground: [0.28, 0.20, 0.32],
  },
  { // B — Daybreak: warm low sun from the east
    name: 'daybreak',
    lights: [
      { dir: dirAzEl(12, 30), color: [1.08, 0.94, 0.72], shadow: true },
    ],
    sky: [0.52, 0.60, 0.80],
    ground: [0.44, 0.36, 0.32],
  },
];

/** Sky/fog palette + celestial positions for a given day (0 = gloaming, 1 = daybreak). */
export const SKY_A = {
  zenith: [0.03, 0.04, 0.20], high: [0.10, 0.11, 0.38], mid: [0.30, 0.19, 0.54], low: [0.62, 0.29, 0.54], horizon: [0.88, 0.44, 0.44],
  fog: [0.48, 0.29, 0.54], glow: [1.0, 0.55, 0.32],
};
export const SKY_B = {
  zenith: [0.20, 0.44, 0.84], high: [0.38, 0.64, 0.95], mid: [0.66, 0.82, 0.98], low: [0.98, 0.86, 0.72], horizon: [1.0, 0.90, 0.68],
  fog: [0.95, 0.85, 0.75], glow: [1.0, 0.85, 0.55],
};

/**
 * A world's ENVIRONMENT: how it is lit and what its sky looks like at day 0 and day 1. A level brings its own as `level.environment` (see the realm brief in `.claude/skills/new-realm`);
 * the default is Gloaming Vale's: moonlit twilight (A), then daybreak (B).
 *   envs  [A, B]   { lights: [{ dir, color, shadow }], sky, ground }: the baked light of each state (the first light with `shadow` is the one that casts shadows)
 *   sky   [A, B]   the sky's palette (zenith, high, mid, low, horizon, fog, glow; and, for a realm that paints its own clouds and distant mountains: cloudTop, cloudBot, ridge)
 *   sun   { az, el: [at day 0, at day 1] }   moon { az, el }   where the sun and the moon are
 */
export const DEFAULT_ENVIRONMENT = { name: 'gloaming', envs: ENVS, sky: [SKY_A, SKY_B], sun: { az: 12, el: [-9, 32] }, moon: { az: 205, el: 40 } };

export function atmosphere(day, env = DEFAULT_ENVIRONMENT) {
  const t = clamp(day);
  const e = t * t * (3 - 2 * t);
  const sky = {};
  const [skyA, skyB] = env.sky;
  for (const k of ['zenith', 'high', 'mid', 'low', 'horizon', 'fog', 'glow']) sky[k] = lerp3(skyA[k], skyB[k], e);
  for (const k of ['cloudTop', 'cloudBot', 'ridge']) if (skyA[k] && skyB[k]) sky[k] = lerp3(skyA[k], skyB[k], e);       // (optional: a realm that paints its own clouds and distant mountains)
  const sunEl = lerp(env.sun.el[0], env.sun.el[1], t);
  return {
    dayKey: t,
    ease: e,
    sky,
    fog: sky.fog,
    sunDir: dirAzEl(env.sun.az, sunEl),
    sunEl,
    moonDir: dirAzEl(env.moon.az, env.moon.el),
    moonAlpha: clamp(1 - t * 1.25),
    starAlpha: clamp(1 - t * 1.7),
    glowAmt: 0.55 + 0.45 * Math.sin(Math.PI * clamp(t * 1.1)), // horizon glow peaks mid-transition
  };
}

/** Dynamic light for lit models (single key light + ambient, approximating the baked pair). */
export function dynamicLight(day, out, env = DEFAULT_ENVIRONMENT) {
  const t = clamp(day);
  const e = t * t * (3 - 2 * t);
  const a = env.envs[0], b = env.envs[1];
  // key light: moon -> sun (blend direction); dawn glow folded into ambient
  const dirA = a.lights[0].dir, dirB = b.lights[0].dir;
  const d = [lerp(dirA[0], dirB[0], e), lerp(dirA[1], dirB[1], e), lerp(dirA[2], dirB[2], e)];
  const l = Math.hypot(...d) || 1;
  out.sunDir = [d[0] / l, d[1] / l, d[2] / l];
  out.sunCol = lerp3(a.lights[0].color, b.lights[0].color, e);
  const glow = a.lights[1].color;
  const ambA = [(a.sky[0] + a.ground[0]) * 0.5 + glow[0] * 0.25, (a.sky[1] + a.ground[1]) * 0.5 + glow[1] * 0.25, (a.sky[2] + a.ground[2]) * 0.5 + glow[2] * 0.25];
  const ambB = [(b.sky[0] + b.ground[0]) * 0.5, (b.sky[1] + b.ground[1]) * 0.5, (b.sky[2] + b.ground[2]) * 0.5];
  out.amb = lerp3(ambA, ambB, e);
  return out;
}

export class Lighting {
  /** @param {object} [env] the world's environment (see DEFAULT_ENVIRONMENT): what the baked light is made of */
  constructor(env = DEFAULT_ENVIRONMENT) {
    this.env = env;
    this.envs = env.envs;     // [A, B]: the two lit states every static vertex stores
    this.grid = null;         // terrain grid: { n, cell, half, heights }
    this.shadow = [null, null];
    this.casters = [];        // { x, z, r, h, k }  blob/stamp shadow casters (trees, houses...)
    this._vis = [1, 1];
    this.massifs = [];        // rock masses that are not part of the heightfield (massif.js): they cast shadows and shut the light out of their caves
    this._std = new Float32Array(6);
  }

  /** Attach the terrain height grid used for shadow marching and ground-contact AO. */
  attach(grid) {
    this.grid = grid;
    const size = (grid.n + 1) * (grid.n + 1);
    this.shadow = [new Float32Array(size).fill(1), new Float32Array(size).fill(1)];
  }

  heightAt(x, z) { return this.grid ? this.grid.heightAt(x, z) : 0; }

  /** Register a shadow caster (stamped into the shadow maps on bake()). */
  addCaster(x, z, r, h, k = 0.55) { this.casters.push({ x, z, r, h, k }); }

  /** March the terrain toward each shadow-casting light, then stamp prop casters. */
  bake() {
    const g = this.grid;
    const { n, cell, half, heights } = g;
    const stride = n + 1;
    for (let e = 0; e < 2; e++) {
      const L = this.envs[e].lights.find((l) => l.shadow);
      const map = this.shadow[e];
      map.fill(1);
      const dx = L.dir[0], dy = L.dir[1], dz = L.dir[2];
      const hl = Math.hypot(dx, dz) || 1;
      const sx = (dx / hl) * cell, sz = (dz / hl) * cell;
      const rise = (dy / hl) * cell;      // vertical rise per horizontal step (one cell)
      const steps = Math.min(90, Math.ceil(220 / cell));
      const ms = this.massifs, nm = ms.length;
      for (let j = 0; j <= n; j++) {
        for (let i = 0; i <= n; i++) {
          const x = -half + i * cell, z = -half + j * cell;
          let y = heights[j * stride + i] + 0.4;
          let px = x, pz = z, occ = 0;
          for (let k = 1; k <= steps; k++) {
            px += sx; pz += sz; y += rise;
            if (px < -half || px > half || pz < -half || pz > half) break;
            let th = g.heightAt(px, pz);
            for (let q = 0; q < nm; q++) { const mt = ms[q].topAt(px, pz); if (mt > th) th = mt; }
            if (th > y) {
              const soft = 0.6 + k * cell * 0.10;
              occ = Math.max(occ, clamp((th - y) / soft));
              if (occ >= 1) break;
            }
          }
          map[j * stride + i] = 1 - occ;
        }
      }
      // prop stamps: a capsule pointing away from the light
      const away = [-dx / hl, -dz / hl];
      const len = (h) => Math.min(h / Math.max(Math.tan(Math.asin(clamp(dy))), 0.25), 60);
      for (const c of this.casters) {
        const L2 = len(c.h);
        const ex = c.x + away[0] * L2, ez = c.z + away[1] * L2;
        const minx = Math.min(c.x, ex) - c.r * 2, maxx = Math.max(c.x, ex) + c.r * 2;
        const minz = Math.min(c.z, ez) - c.r * 2, maxz = Math.max(c.z, ez) + c.r * 2;
        const i0 = Math.max(0, Math.floor((minx + half) / cell)), i1 = Math.min(n, Math.ceil((maxx + half) / cell));
        const j0 = Math.max(0, Math.floor((minz + half) / cell)), j1 = Math.min(n, Math.ceil((maxz + half) / cell));
        const vx = ex - c.x, vz = ez - c.z, vv = vx * vx + vz * vz || 1;
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const x = -half + i * cell, z = -half + j * cell;
            let t = ((x - c.x) * vx + (z - c.z) * vz) / vv;
            t = clamp(t);
            const qx = c.x + vx * t, qz = c.z + vz * t;
            const d = Math.hypot(x - qx, z - qz);
            const rr = c.r * (1 - 0.45 * t) * 1.15;
            const a = 1 - smooth(rr * 0.35, rr * 1.35, d);
            if (a > 0) map[j * stride + i] *= 1 - c.k * a * (1 - 0.5 * t);
          }
        }
      }
    }
  }

  /** Bilinear shadow visibility of environment e at (x,z). */
  vis(e, x, z) {
    const g = this.grid;
    if (!g) return 1;
    const stride = g.n + 1;
    let fx = (x + g.half) / g.cell, fz = (z + g.half) / g.cell;
    fx = clamp(fx, 0, g.n - 0.001); fz = clamp(fz, 0, g.n - 0.001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const m = this.shadow[e];
    const a = m[j * stride + i], b = m[j * stride + i + 1], c = m[(j + 1) * stride + i], d = m[(j + 1) * stride + i + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  /**
   * Irradiance for both environments at a world point with normal n. `ao` (0..1) darkens ambient; if omitted it is
   * derived from height above the ground so props feel planted.  out[0..2] = env A, out[3..5] = env B.
   */
  sample(out, x, y, z, nx, ny, nz, ao) {
    if (ao === undefined) {
      const h = this.heightAt(x, z);
      ao = 0.68 + 0.32 * clamp((y - h) / 1.6);
    }
    for (let e = 0; e < 2; e++) {
      const env = this.envs[e];
      const up = ny * 0.5 + 0.5;
      let r = (env.ground[0] + (env.sky[0] - env.ground[0]) * up) * ao;
      let g = (env.ground[1] + (env.sky[1] - env.ground[1]) * up) * ao;
      let b = (env.ground[2] + (env.sky[2] - env.ground[2]) * up) * ao;
      const v = this.vis(e, x, z);
      for (const l of env.lights) {
        const ndl = nx * l.dir[0] + ny * l.dir[1] + nz * l.dir[2];
        if (ndl <= 0) continue;
        const k = ndl * (l.shadow ? v : 1);
        r += l.color[0] * k; g += l.color[1] * k; b += l.color[2] * k;
      }
      out[e * 3] = r; out[e * 3 + 1] = g; out[e * 3 + 2] = b;
    }
    // inside a massif's box the rock's own model takes over (it hands the ordinary light back where the sky is in sight)
    if (this.massifs.length) {
      for (let q = 0; q < this.massifs.length; q++) {
        const m = this.massifs[q];
        if (!m.F || !m.inBox(x, y, z, 1)) continue;
        const std = this._std;
        for (let i = 0; i < 6; i++) std[i] = out[i];
        m.light(out, x, y, z, nx, ny, nz, std);
        break;
      }
    }
  }
}
