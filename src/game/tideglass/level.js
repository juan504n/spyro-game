// The level descriptor of TIDEGLASS REACH: the ground from the brief's ribbons (realm/level.js: ridges and rocks in a sea, `brief.sea`, and the tide that rises and falls over it, `brief.tide`), plus the
// landforms the ribbons cannot make - the Salt Flats (a shoal: the sea fill raised to a tidal height along a line, with sandbars, so that rocks can stand in it), the cairns (low round banks on the flats
// that the tide only wades), and the floors of the Weeping Cliff's cave - the cliff itself (a rock mass, weeping.js), and the realm's own ground: wet sand where the tide goes, dry sand above it, turf on
// the ridges, paving on the quay, the sea floor under the deep.
import { makeLevel, smooth, flatten } from '../realm/index.js';
import { nearOnLine } from '../massif.js';
import { valueNoise, fbm } from '../../engine/textures/pix.js';
import { BRIEF, REGIONS, FLATS, CAIRNS, POOL, BANKS, GATE, NECK_Y } from './brief.js';
import { WEEPING } from './weeping.js';

const nBar = valueNoise(4301), nRipple = valueNoise(4302);

/** a shoal: ground raised along a line to `level` (and never lowered: a rock that stands in it stays), the fill rising to it over `fall` metres beyond `hw`; the sand lies in bars and channels */
function shoal(h, x, z, S) {
  const n = nearOnLine(S.pts, x, z);
  const w = 1 - smooth(S.hw, S.hw + S.fall, n.d);
  if (w <= 0) return h;
  const target = S.level + (fbm(nBar, x * 0.05 + 3, z * 0.05, 3) - 0.5) * 2 * S.bars + (fbm(nRipple, x * 0.18, z * 0.18, 2) - 0.5) * 0.16;
  return Math.max(h, h + (target - h) * w);
}

/** a bank: ground raised to `top` in a round hump (flat over 0.45 r, down to what it was at 1.25 r), never lowered: the cairns' */
function bank(h, x, z, c) {
  const w = 1 - smooth(c.r * 0.45, c.r * 1.25, Math.hypot(x - c.x, z - c.z));
  return w > 0 ? Math.max(h, h + (c.top - h) * w) : h;
}

/** where the cairns stand: along the flats' line every CAIRNS.every metres from CAIRNS.from, a pair either side of the road, and the tide pool's at the end of its arm */
export function cairnSpots() {
  const pts = FLATS.pts, out = [];
  let acc = 0, next = CAIRNS.from;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
    while (next <= acc + L) {
      const u = next - acc;
      for (const side of [-1, 1]) out.push({ x: a[0] + dx * u - dz * side * CAIRNS.side, z: a[1] + dz * u + dx * side * CAIRNS.side, r: CAIRNS.r, top: CAIRNS.top, s: next, side });
      next += CAIRNS.every;
    }
    acc += L;
  }
  out.push({ x: POOL.x, z: POOL.z, r: POOL.r, top: POOL.top, s: -1, side: 0, pool: true });
  for (const b of BANKS) out.push({ ...b, s: -2, side: 0, extra: true });
  return out;
}
const CAIRN_SPOTS = cairnSpots();

const hwOf = (id) => REGIONS.find((r) => r.id === id).pts;
const harbourPts = hwOf('harbour');

export const LEVEL = makeLevel(BRIEF, {
  landforms(h, x, z, C) {
    if (Math.hypot(x - GATE.x, z - GATE.z) < 14) h = flatten(h, x, z, GATE.x, GATE.z, 6.0, 2.5, NECK_Y);       // (the gate's threshold is a flat slab: the ground there is level, and so is the road, which is pinned at the same height: brief.js)
    h = shoal(h, x, z, FLATS);
    for (const A of FLATS.arms) h = shoal(h, x, z, A);
    for (const c of CAIRN_SPOTS) h = bank(h, x, z, c);
    return WEEPING.landform(h, x, z);
  },
  massifs: () => [WEEPING.massif()],
  groundRule(x, z, h, slope) {
    const c = WEEPING.inside(x, z);
    if (c) return slope < 0.45 ? [c.y < 1.0 ? 'sand_wet' : 'sand_tide', 'the cave\'s floor: sand where the tide comes, dry sand above it'] : ['cliff_tide', 'inside the cave, slope > 0.45'];
    if (h < -2.2) return ['sea_floor', 'the sea floor, far under the surface: seen through the water'];
    if (h < -0.9) return ['sand_wet', 'wet sand: under the water at all but the low tide'];
    if (h < 1.3) return ['sand_tide', 'sand: the beach and the flats'];
    const q = nearOnLine(harbourPts, x, z);
    if (q.d < harbourPts[0][3] * 0.8 && h > 3.2 && h < 4.6) return ['cobble_tide', 'the paved quay'];
    return ['tideturf', 'dune turf'];
  },
  cliffs: { cool: 'cliff_tide', warm: 'cliff_tide' },
});
