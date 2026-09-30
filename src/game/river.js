// The river's water surface, as it is DRAWN (the heightfield is carved from the river's own profile and never touches this). Pure JS, shared by the terrain generator (it records the surface
// height round the river: `grid.riverSurf`, what the ground textures near the water are chosen by), the water mesh (src/game/water.js) and the level checks.
//
//   profile y  = the pinned height the channel was carved from (the bed is 1.5 m under it)
//   surface    = profile y - 0.12, and over the last stretch before the lake it eases down to the lake's own level, so river and lake meet without a step (the river used to end 0.1 to 0.5 m
//                above the lake in a floating sheet: the profile is pinned to 0.15 at the mouth)
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** how far out the lake's water disc reaches, in lake-ellipse units (water.js draws it at 1.12), and where the river's surface starts easing down and where the river water ends */
export const LAKE_DISC = 1.12;
export const EASE_FROM = 1.36, EASE_TO = 1.12, RIVER_END = 1.11;

/** position in the lake's ellipse units: 1 = on the nominal shore */
export const lakeD = (L, x, z) => Math.hypot((x - L.lake.x) / L.lake.rx, (z - L.lake.z) / L.lake.rz);

/** the drawn height of the river water at a point of its profile */
export function riverSurface(L, x, z, profileY, waterLevel = 0) {
  const w = smooth(EASE_FROM, EASE_TO, lakeD(L, x, z));
  return (profileY - 0.12) * (1 - w) + waterLevel * w;
}

/** the ribbon the river water is drawn on: how many of the river's profile points it uses (it stops at the lake's disc) */
export function riverWaterLength(L, pts) {
  let n = pts.length;
  for (let i = 0; i < pts.length; i++) if (lakeD(L, pts[i][0], pts[i][2]) < RIVER_END) { n = i + 1; break; }
  return n;
}

/** how far either side of the centre line the carve reaches (half the river's width plus its shoulder), which is as wide as water can ever be */
export const RIVER_SHOULDER = 3.0;
export const riverReach = (width) => width / 2 + RIVER_SHOULDER;
