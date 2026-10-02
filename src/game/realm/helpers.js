// Placement helpers for a realm's layout script (the hand-authored part of a world): where things go along its ribbons and roads, facing, spots clear of everything else. They work on the `ctx`
// that levelgen/helpers.js makes (ctx.put / ctx.ok / ctx.scatter / ctx.h ...) and take the level's REGIONS where they need to know where a ribbon runs. The same functions Dawnhaven's layout
// uses; a new realm's generated layout.js imports them from here (see .claude/skills/new-realm).
export const TAU = Math.PI * 2;
export const lerp = (a, b, t) => a + (b - a) * t;
export const sum = (a) => a.reduce((s, v) => s + v, 0);

/** the face of something at (x, z) towards (tx, tz) as a prop's rot (its local +z looks at the target) */
export const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

/** A level, dry spot for something `foot` metres across, near (x, z): spirals outwards until it fits clear of roads, water, steep ground and other props. Null when there is none. */
export function flatSpot(ctx, x, z, foot, { maxR = 10, slope = 0.22, path = 3 } = {}) {
  for (let d = 0; d <= maxR; d += 1.5) {
    const n = d === 0 ? 1 : Math.ceil(d * 1.6);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + d;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (ctx.ok(px, pz, { r: foot * 0.55, maxSlope: slope, path })) return [px, pz];
    }
  }
  return null;
}

/** the points [x, z, height, halfWidth] of the region `id` */
export const regionPts = (regions, id) => {
  const R = regions.find((r) => r.id === id);
  if (!R) throw new Error(`no region '${id}'`);
  return R.pts;
};

/** points along a polyline of [x, z, ...]: every `every` metres from `s0` to `s1` (or its end): [{ x, z, yaw, dx, dz, s }] */
export function along(pts, every, s0 = 0, s1 = Infinity) {
  const out = [];
  let acc = 0, next = s0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = (b[0] - a[0]) / (L || 1), dz = (b[1] - a[1]) / (L || 1);
    while (next <= acc + L && next <= s1) {
      const u = next - acc;
      out.push({ x: a[0] + dx * u, z: a[1] + dz * u, yaw: Math.atan2(dx, dz), dx, dz, s: next });
      next += every;
    }
    acc += L;
  }
  return out;
}

/** points along a dense road ({ pts: [[x, y, z], ...] }) with their direction */
export const roadAlong = (road, every, s0 = 0, s1 = Infinity) => along(road.pts.map((p) => [p[0], p[2]]), every, s0, s1);

/** the dense road `id` of the built terrain, or undefined */
export const roadOf = (ctx, id) => ctx.grid.paths.find((p) => p.id === id);

/**
 * A sampler of random points in a band of a region (for ctx.scatter): between f0 and f1 times its half width from its line, on either side, over the stretch lo..hi of its length (0..1).
 *   const sample = band(ctx, REGIONS, 'rimewood', 0.5, 1.1);   ctx.scatter('tree_pine', 20, sample, { r: 3.5, path: 4 });
 */
export function band(ctx, regions, id, f0 = 0, f1 = 1, lo = 0, hi = 1) {
  const pts = regionPts(regions, id), rng = ctx.rng;
  const lens = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); lens.push(l); total += l; }
  return () => {
    let s = rng.float(lo, hi) * total, i = 0;
    while (i < lens.length - 1 && s > lens[i]) { s -= lens[i]; i++; }
    const a = pts[i], b = pts[i + 1], u = s / (lens[i] || 1);
    const px = lerp(a[0], b[0], u), pz = lerp(a[1], b[1], u), hw = lerp(a[3], b[3], u);
    const nx = -(b[1] - a[1]) / (lens[i] || 1), nz = (b[0] - a[0]) / (lens[i] || 1);
    const side = rng.chance(0.5) ? 1 : -1, d = hw * rng.float(f0, f1) * side;
    return [px + nx * d, pz + nz * d];
  };
}

/** lamp posts (or any prop: `name`) either side of a road, every `every` metres from `s0` to `s1`, `offset` metres beyond its edge */
export function lampsAlong(ctx, id, every, s0 = 10, s1 = Infinity, offset = 1.6, name = 'lamp_post') {
  const road = roadOf(ctx, id);
  if (!road) return;
  for (const q of roadAlong(road, every, s0, s1)) {
    for (const side of [-1, 1]) {
      const x = q.x - q.dz * side * (road.width / 2 + offset), z = q.z + q.dx * side * (road.width / 2 + offset);
      if (ctx.ok(x, z, { r: 0.8, path: 0.6, maxSlope: 0.5 })) ctx.put(name, x, z, { rot: faceTo(x, z, q.x, q.z) }, 1.2);
    }
  }
}
