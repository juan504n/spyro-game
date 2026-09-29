// Gameplay placement helpers (enemies, vases, chests, gems…) and the final gem-budget pass.
import { WATER_LEVEL } from '../level.js';

const DROPS = { basic: [1, 2], bell: [5], thorn: [5] };
const sum = (a) => a.reduce((s, v) => s + v, 0);

export function attachGameplay(ctx) {
  const { gp, h, rng } = ctx;

  ctx.addEnemy = (x, z, variant = 'basic', patrol = 5, y) => { gp.enemies.push({ x, z, variant, patrol, y }); };
  ctx.addVase = (x, z, gems, y) => {
    if (y === undefined) { [x, z] = ctx.spot(x, z, { r: 0.9, clear: 1.2 }); ctx.occ.add(x, z, 0.9); }
    gp.vases.push({ x, y: y ?? h(x, z), z, variant: rng.int(0, 3), gems });
  };
  ctx.addChest = (x, z, yaw, gems, y) => {
    if (y === undefined) { [x, z] = ctx.spot(x, z, { r: 1.6, clear: 1.6 }); ctx.occ.add(x, z, 1.6); }
    gp.chests.push({ x, y: y ?? h(x, z), z, yaw, gems });
  };
  ctx.addWall = (x, z, yaw, w, hgt, gems) => { gp.walls.push({ x, y: h(x, z), z, yaw, w, h: hgt, gems }); };
  ctx.addBunnies = (cx, cz, n, r) => {
    let placed = 0;
    for (let t = 0; t < n * 30 && placed < n; t++) {
      const a = rng.float(0, Math.PI * 2), d = rng.float(0, r);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (h(x, z) > WATER_LEVEL + 0.8 && ctx.slope(x, z) < 0.45) { gp.bunnies.push({ x, z }); placed++; }
    }
  };

  /** A single hovering gem at world position (or above ground when y omitted). */
  ctx.addGem = (x, z, value, y) => { gp.gems.push({ x, y: y ?? h(x, z) + 0.95, z, value }); };

  /** Gems along a smooth curve through 2-3 world points [x,y,z]. value = number or array (cycled). */
  ctx.gemArc = (pts, count, value = 1) => {
    const vals = Array.isArray(value) ? value : [value];
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      let x, y, z;
      if (pts.length === 3) {
        const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
        x = a * pts[0][0] + b * pts[1][0] + c * pts[2][0]; y = a * pts[0][1] + b * pts[1][1] + c * pts[2][1]; z = a * pts[0][2] + b * pts[1][2] + c * pts[2][2];
      } else {
        x = pts[0][0] + (pts[1][0] - pts[0][0]) * t; y = pts[0][1] + (pts[1][1] - pts[0][1]) * t; z = pts[0][2] + (pts[1][2] - pts[0][2]) * t;
      }
      gp.gems.push({ x, y, z, value: vals[i % vals.length] });
    }
  };

  /** Gems along a road segment t0..t1 with a repeating value pattern, offset laterally. */
  ctx.roadGems = (id, t0, t1, every = 4.2, pattern = [1, 1, 1, 2], lateral = 0) => {
    const path = ctx.grid.paths.find((p) => p.id === id);
    if (!path) return;
    let acc = 0, k = 0;
    const i0 = Math.floor(t0 * (path.pts.length - 1)), i1 = Math.floor(t1 * (path.pts.length - 1));
    for (let i = Math.max(i0, 1); i <= i1; i++) {
      acc += Math.hypot(path.pts[i][0] - path.pts[i - 1][0], path.pts[i][2] - path.pts[i - 1][2]);
      if (acc < every) continue;
      acc = 0;
      const p = path.pts[i], q = path.pts[Math.min(i + 1, path.pts.length - 1)];
      const dx = q[0] - p[0], dz = q[2] - p[2], l = Math.hypot(dx, dz) || 1;
      const x = p[0] + (-dz / l) * lateral, z = p[2] + (dx / l) * lateral;
      ctx.addGem(x, z, pattern[k++ % pattern.length], p[1] + 0.95);
    }
  };
}

/** Sprinkle the story-critical treasure, then top up with road gems so the total is a tidy round number. */
export function finalizeGems(ctx) {
  const { gp, L, h, rng } = ctx;
  // hand-placed specials: purple (25) and gold (10) rewards for exploring
  for (const [x, y, z] of gp.purple || []) gp.gems.push({ x, y, z, value: 25 });
  const golds = [[-4, 2.5 + 1.2, 27 + 3], [L.mesa.x + 3, L.mesa.h + 1.2, L.mesa.z - 6], [L.windHill.x + 10, h(L.windHill.x + 10, L.windHill.z + 4) + 1.2, L.windHill.z + 4],
    [L.cascade.x - 8, h(L.cascade.x - 8, L.cascade.z + 20) + 1.2, L.cascade.z + 20], [0, h(0, L.summit.z + 22) + 1.2, L.summit.z + 22], [-92, h(-92, 10) + 1.2, 10]];
  for (const [x, y, z] of golds) gp.gems.push({ x, y, z, value: 10 });

  // roads: the classic trail of gems that leads you along
  ctx.roadGems('main', 0.0, 1.0, 8.0, [1, 1, 2], 2.2);
  ctx.roadGems('west', 0.05, 0.9, 7.0, [1, 1, 1, 2], 0);
  ctx.roadGems('east', 0.05, 1.0, 7.0, [1, 1, 1, 2], 0);
  ctx.roadGems('mill', 0.05, 0.95, 9.0, [1, 2], -1.4);
  ctx.roadGems('ringW', 0.05, 0.95, 9.0, [1, 1, 2], 1.2);
  ctx.roadGems('ringE', 0.05, 0.95, 9.0, [1, 1, 2], -1.2);
  ctx.roadGems('summit', 0.03, 0.97, 10.0, [1, 2, 1, 5], 0);

  let dyn = 0;
  for (const e of gp.enemies) dyn += sum(DROPS[e.variant] || DROPS.basic);
  for (const v of gp.vases) dyn += sum(v.gems);
  for (const c of gp.chests) dyn += sum(c.gems);
  for (const w of gp.walls) dyn += sum(w.gems);
  let stat = sum(gp.gems.map((g) => g.value));
  const fixed = dyn + stat;
  // top up to the next multiple of 50 (min 400) with scattered reds/greens near roads
  const target = Math.max(400, Math.ceil(fixed / 50) * 50);
  let need = target - fixed;
  const roads = ctx.grid.paths;
  let guard = 0;
  while (need > 0 && guard++ < 2000) {
    const p = roads[rng.int(0, roads.length)];
    const q = p.pts[rng.int(0, p.pts.length)];
    const x = q[0] + rng.float(-4, 4), z = q[2] + rng.float(-4, 4);
    if (h(x, z) < WATER_LEVEL + 0.6) continue;
    const v = need >= 2 && rng.chance(0.3) ? 2 : 1;
    gp.gems.push({ x, y: h(x, z) + 0.95, z, value: v });
    need -= v;
  }
  gp.gemsTotal = sum(gp.gems.map((g) => g.value)) + dyn;
  gp.gemBreakdown = { dynamic: dyn, static: sum(gp.gems.map((g) => g.value)), fixed, topUp: target - fixed };
}
