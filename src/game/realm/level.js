// A realm's LEVEL DESCRIPTOR, made from its brief (see brief.js): the ground from the ribbons (country.js), the roads, the lake, the names of its places and the sky it lives under. What a
// realm has that a brief cannot say - landforms of its own (a ravine, a crater's wall, a plateau), the rock masses of its caves, the ground rule that makes snow of the grass - comes in as
// `extras`:
//   landforms(h, x, z, country, L)   the ground so far at (x, z) -> the ground with the realm's own landforms cut into it (runs before the lake's bowl)
//   massifs(grid, L)                 [Massif]: the rock masses that are not heightfields (massif.js)
//   groundRule(x, z, h, slope, o)    [texture, why] for the grounds of the realm's places (the usual rules of terrain-mesh.js are the fallback)
//   cliffs { cool, warm }            the textures of its tall faces        warmRock(x, z, h)   where the cliffs are the warm kind
//   descriptor                       anything else the level should carry (merged last)
import { makeCountry, basin, mound, dryLand, flatten } from './country.js';

/** The engine wants a lake (the water, the debug readout and the drowning hint read it): a realm without one has a speck of one far outside its world, which touches nothing. */
export const NO_LAKE = { x: 6000, z: 6000, rx: 1, rz: 1, bed: -1, name: 'NO LAKE' };

export function makeLevel(brief, extras = {}) {
  const { regions, seed, mountain, roll } = brief.country;
  const C = makeCountry({ seed, regions, mountain, roll });
  const lake = brief.lake || NO_LAKE;
  const half = brief.world.size / 2;
  // every goal stands on a level pad (7 m across, easing back into the land over 6 more): the ring of light over the last one needs a floor to come down on, and the hero a place to stand.
  // A goal with `pad: false` (one on an islet, a tower, a shelf of its own) keeps the ground the realm gives it.
  const pads = brief.goals.filter((g) => g.pad !== false && g.y === undefined).map((g) => ({ x: g.x, z: g.z, r: (g.pad && g.pad.r) || (g.big ? 9 : 7), fall: (g.pad && g.pad.fall) || 6, y: C.ground(g.x, g.z) }));

  const height = (x, z, L) => {
    let h = C.ground(x, z);
    if (extras.landforms) h = extras.landforms(h, x, z, C, L);
    for (const q of pads) h = flatten(h, x, z, q.x, q.z, q.r, q.fall, q.y);
    if (brief.lake) {
      h = basin(h, x, z, lake, () => (C.n2(C.nB, x + 50, z, 0.06, 2) - 0.5) * 0.9);
      for (const m of lake.islets || []) h = mound(h, x, z, m, lake.bed);
    }
    return dryLand(h, x, z, lake);                       // (no accidental puddles: outside the lake the ground stays above the waterline)
  };

  // the named places of the debug readout: what the brief names, the goals and the parts of the country
  const areas = [
    ...(brief.areas || []),
    ...brief.goals.map((g) => [`${g.name} (${g.situation})`, g.x, g.z, 14, g.y !== undefined ? g.y : undefined]),
    ...regions.filter((r) => r.label).map((r) => {
      let cx = 0, cz = 0, rad = 0;
      for (const p of r.pts) { cx += p[0] / r.pts.length; cz += p[1] / r.pts.length; }
      for (const p of r.pts) rad = Math.max(rad, Math.hypot(p[0] - cx, p[1] - cz) + p[3]);
      return [r.label, cx, cz, rad];
    }),
  ].map((a) => (a[4] === undefined ? a.slice(0, 4) : a));

  const level = {
    name: brief.name,
    world: brief.world,
    labels: brief.labels,
    spawn: brief.spawn,
    valley: brief.valley || { x: 0, z: 0, rx: half - 2, rz: half - 2, rimStart: 0.9 },
    lake,
    ponds: [],
    steepSlope: 0.85,
    noGrassPatches: true,
    noRockPatches: true,
    regions,
    paths: brief.roads.map((r) => ({ id: r.id, surface: r.surface, width: r.width, ...(r.shoulder !== undefined ? { shoulder: r.shoulder } : {}), pts: r.pts })),
    rivers: [],
    massifs: extras.massifs,
    groundRule: extras.groundRule,
    cliffs: extras.cliffs,
    warmRock: extras.warmRock,
    height,
    areas,
    environment: brief.environment,
    goal: { gateAt: brief.gate ? brief.gate.at : undefined, ...(brief.goal || {}) },
    brief,
    ...(extras.descriptor || {}),
  };
  for (const k of ['massifs', 'groundRule', 'cliffs', 'warmRock']) if (level[k] === undefined) delete level[k];
  return level;
}
