// Decor for the floating sky isles: a crystal cluster, a lantern tree and a patch of flowers on each, planned so that none of it stands
// on the bounce mushroom, a chest, an enemy's spawn, the beacon or a gem. (They used to be dropped at random places: on Sky Isle 2 the
// tree grew through the mushroom's cap, and on Sky Isle 3 a crystal cluster sat on the chest.)
//
// planIslandDecor(gp, isle, rng) is pure (positions only, no geometry), so the headless level check can verify it and the debug readout can
// list it; levelgen/index.js builds the props at the planned spots. `rng` is the isle's own generator (kit.rng), so planning never touches
// the level's shared random sequence and nothing else in the realm moves.

/** What goes on every isle, in order. `kind` picks the clearances below; `params` are handed to the prop. */
export const ISLE_DECOR = [
  { name: 'crystal_cluster', kind: 'crystal', params: (i) => ({ count: 10, color: i % 2 ? 'violet' : 'cyan', size: 's' }) },
  { name: 'tree_lantern', kind: 'tree', params: () => ({ size: 's', canopy: 'leaves_teal' }) },
  { name: 'flower_patch', kind: 'flowers', params: () => ({ r: 3, count: 10 }) },
];

/**
 * Least distance (metres, centre to centre) from each kind of gameplay object to each kind of decor. A tree's leaves are ~2.7 m across
 * from its trunk and hang over whatever is beside it, so it needs the most room; flowers are flat and only keep off the spot itself.
 */
const CLEAR = {
  mushroom: { tree: 5.3, crystal: 3.9, flowers: 1.5 },     // (+ 2.3 m per size step: the cap is 2.3 m * size in radius, and the bounce goes straight up)
  chest: { tree: 3.4, crystal: 3.1, flowers: 1.5 },
  enemy: { tree: 3.0, crystal: 2.8, flowers: 0 },
  beacon: { tree: 4.7, crystal: 3.5, flowers: 2.5 },
  gem: { tree: 1.8, crystal: 2.0, flowers: 0 },
};
/** decor against decor (a solid prop against another; flowers may lie under anything) */
const APART = { tree: { crystal: 2.8, tree: 5.4 }, crystal: { tree: 2.8, crystal: 4 } };

/** the gameplay things standing on an isle (within its radius): [{ what, x, z, size }] */
export function isleObjects(gp, isle) {
  const on = (o) => Math.hypot(o.x - isle.x, o.z - isle.z) <= isle.r + 1;
  const out = [];
  for (const m of gp.mushrooms || []) if (on(m) && Math.abs((m.y ?? isle.y) - isle.y) < 6) out.push({ what: 'mushroom', x: m.x, z: m.z, size: m.size || 1 });
  for (const c of gp.chests || []) if (on(c) && Math.abs((c.y ?? isle.y) - isle.y) < 6) out.push({ what: 'chest', x: c.x, z: c.z, size: 1 });
  for (const e of gp.enemies || []) if (on(e) && Math.abs((e.y ?? isle.y) - isle.y) < 6) out.push({ what: 'enemy', x: e.x, z: e.z, size: 1 });
  for (const b of gp.beacons || []) if (on(b) && Math.abs((b.y ?? isle.y) - isle.y) < 6) out.push({ what: 'beacon', x: b.x, z: b.z, size: 1 });
  for (const p of gp.purple || []) if (on({ x: p[0], z: p[2] }) && Math.abs(p[1] - isle.y) < 6) out.push({ what: 'gem', x: p[0], z: p[2], size: 1 });
  return out;
}

/** how far a spot at (x, z) is short of the clearances for a decor of `kind` (<= 0: fine; the larger, the worse) */
export function shortfall(x, z, kind, objects, placed) {
  let worst = -Infinity;
  for (const o of objects) {
    const need = (CLEAR[o.what] || {})[kind];
    if (!need) continue;
    const extra = o.what === 'mushroom' ? (o.size - 1) * 2.3 : 0;
    worst = Math.max(worst, need + extra - Math.hypot(x - o.x, z - o.z));
  }
  for (const p of placed) {
    const need = (APART[kind] || {})[p.kind];
    if (need) worst = Math.max(worst, need - Math.hypot(x - p.x, z - p.z));
  }
  return worst;
}

/**
 * Where the isle's decor goes: [{ name, kind, x, z, rot, params }]. Candidates are drawn exactly as before (an angle, then a distance
 * between 35 % and 75 % of the radius), so an isle whose first picks were fine is unchanged; a pick that is too close to something is
 * redrawn (at most 80 times, then the least bad one is kept).
 */
export function planIslandDecor(gp, isle, rng) {
  const objects = isleObjects(gp, isle);
  const placed = [];
  ISLE_DECOR.forEach((spec, i) => {
    let best = null;
    for (let tries = 0; tries < 80; tries++) {
      const a = rng.float(0, Math.PI * 2), d = rng.float(isle.r * 0.35, isle.r * 0.75);
      const x = isle.x + Math.cos(a) * d, z = isle.z + Math.sin(a) * d;
      const s = shortfall(x, z, spec.kind, objects, placed);
      if (!best || s < best.s) best = { a, x, z, s };
      if (s <= 0) break;
    }
    placed.push({ name: spec.name, kind: spec.kind, x: best.x, z: best.z, rot: best.a, params: spec.params(i), size: 5 });
  });
  return placed;
}
