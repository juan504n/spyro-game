// THE GUARDIAN'S COURT: the ground of the last world and where everything in it stands. A world of its own (kind 'arena' in realms.js): there are no lanterns on a map to find, no journey of parts, no secrets, so the
// realm foundry's rules for a realm do not apply to it and tools/guardian-check.mjs holds it to its own. It is a gorge, a court and a dais:
//   * the GORGE ROAD: 96 m of cobble between cliffs, from the door of Dawnhaven in the south up to a crest (where the Guardian first comes into view) and down into the bowl;
//   * the COURT: a round floor of flagstone, 38 m in radius at 4 m, in a wall of rock; eight pillars stand round it at 24 m (cover from the bolts); one way in, the road from the south;
//   * the DAIS: the Guardian's seat, a raised disc of 10 m (1.4 m over the floor) in the middle: the hero climbs it to reach the crown when the Guardian stoops.
// Everything is flat where the fight is (the court's floor rolls by nothing: `roll` is off), because a hero who runs circles and jumps rings must be able to trust the ground under him.
import { makeCountry, flatten } from '../realm/country.js';
import { NO_LAKE } from '../realm/level.js';
import { GUARDIAN_ENVIRONMENT } from './environment.js';

const PI = Math.PI, TAU = PI * 2;

/** The Court. `x, z`: the middle of the dais and of the court. */
export const COURT = {
  x: 0, z: -30, floor: 4.0, r: 38,
  dais: { r: 10, h: 1.4, edge: 2.4 },                             // the dais: its radius, its height over the floor, the metres over which its edge falls (a 2.4 m grid draws nothing steeper than a climb)
  pillars: { n: 8, ring: 24, r: 0.9, h: 9, a0: PI / 8 },           // eight, 22.5 degrees off the road's axis
  wake: 44, leave: 50,                                            // the Guardian wakes when the hero comes within 44 m of the dais, sleeps again when he is 50 m out
};
export const DAIS_TOP = COURT.floor + COURT.dais.h;

/** The pillars: their centres and radius (the brain's bolts burst on them; the layout stands them; the check keeps the ram's run-up clear of them) */
export const PILLARS = Array.from({ length: COURT.pillars.n }, (_, i) => {
  const a = COURT.pillars.a0 + (i * TAU) / COURT.pillars.n;
  return { x: COURT.x + Math.cos(a) * COURT.pillars.ring, z: COURT.z + Math.sin(a) * COURT.pillars.ring, r: COURT.pillars.r };
});

/** The door back to Dawnhaven: at the south end of the gorge, looking north; the hero comes out of its light 11 m in front of it. */
export const DOOR = { id: 'courtgate', name: 'DAWNHAVEN', tag: 'HOMEWORLD OF THE LANTERN KEEPERS', x: 0, z: 104, yaw: PI, color: [1.0, 0.86, 0.5], target: 'home' };

/** The parts of the ground (realm/country.js): ribbons [x, z, height, half width] between the cliffs that fill the rest. */
export const REGIONS = [
  { id: 'road', fall: 12, label: 'THE GORGE ROAD', pts: [[0, 104, 6.0, 8], [0, 80, 7.2, 7], [0, 54, 8.6, 7], [0, 30, 6.6, 8], [0, 10, 4.0, 9]] },
  { id: 'court', fall: 9, label: 'THE COURT OF LANTERNS', pts: [[COURT.x, COURT.z, COURT.floor, COURT.r], [COURT.x, COURT.z + 1, COURT.floor, COURT.r]] },
];

const COUNTRY = makeCountry({ seed: 6611, regions: REGIONS, mountain: { base: 40, ridge: 12, rough: 8, margin: 20 }, roll: { amp: 0, fine: 0 } });

/** The shape of the ground (before the road is carved): the ribbons' blend, and the dais. */
function courtHeight(x, z) {
  const h = COUNTRY.ground(x, z);
  return flatten(h, x, z, COURT.x, COURT.z, COURT.dais.r, COURT.dais.edge, DAIS_TOP);
}

export const LEVEL = {
  name: "THE GUARDIAN'S COURT",
  world: { size: 240, cell: 2.4 },
  labels: ['SWEEPING THE COURT', 'RAISING THE PILLARS', 'LIGHTING THE RUNES', 'WAKING THE STONE', 'POLISHING THE FLOOR'],
  spawn: { x: DOOR.x, z: DOOR.z - 11, yaw: PI },                  // (where the hero comes out of the door's light: facing north, up the road)
  valley: { x: 0, z: 0, rx: 116, rz: 116, rimStart: 0.9 },
  lake: NO_LAKE,                                                  // (the engine wants a lake; this world has none)
  ponds: [],
  steepSlope: 0.85,
  noGrassPatches: true,
  noRockPatches: true,
  regions: REGIONS,
  paths: [{ id: 'gorge', surface: 'cobble', width: 6.4, pts: [[0, 104], [0, 80], [0, 54], [0, 30], [0, 10]] }],
  rivers: [],
  goal: {},
  /** the ground of the places: the court and the dais are flagstone (the dais carries the runes), the rest follows the usual rules (cliffs of bare rock) */
  groundRule(x, z, h, slope) {
    const d = Math.hypot(x - COURT.x, z - COURT.z);
    if (d < COURT.dais.r + 0.3) return ['tower_stone', "the dais's runed stone"];                      // (its top: the rim stones sit on the edge. The flank below is the court's flagstone to the foot of it, so that no seam of two textures runs down a steep face)
    if (d < COURT.dais.r + COURT.dais.edge + 1) return ['flagstone', "the dais's flank"];
    if (slope < 0.5) {
      if (d < COURT.r + 2) return ['flagstone', "the court's floor"];
      if (Math.abs(x) < 12 && z > COURT.z + COURT.r - 4) return ['flagstone', 'the gorge road\'s paving'];
    }
    return null;
  },
  cliffs: { cool: 'cliff_bare', warm: 'cliff_bare' },
  height: courtHeight,
  environment: GUARDIAN_ENVIRONMENT,
  areas: [
    ["THE COURT OF LANTERNS", COURT.x, COURT.z, COURT.r],
    ["THE GUARDIAN'S DAIS", COURT.x, COURT.z, COURT.dais.r + 2],
    ['THE GORGE ROAD', 0, 56, 50],
    ['THE DOOR OF DAWNHAVEN', DOOR.x, DOOR.z - 4, 14],
  ],
};
