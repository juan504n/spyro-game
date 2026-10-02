// LEVEL DESIGN: "Dawnhaven" - the homeworld. The hub the Lantern Keepers' portals open onto. It is a country of parts, not a plaza with spokes: you come in at the Landing Cove (where the
// first door, Gloaming Vale's, stands in a niche of rock), follow the cobbled trunk road north across the Heartlands to the Crag - a mountain with a way through it: the Echo Hall, the winding
// stair, the Frost Grotto with the Frostbloom door - or west up the Hearth Terraces to the windmill, or east to Mirror Lake and its long pier (Tideglass), and on up the winding Ember Canyon
// to the Emberfall forge. The Crag's ledge road climbs to its summit (Skyweaver), and the Ascent beyond its north passage leads to the Guardian's gate, sealed until every realm burns.
// Same conventions as level.js: x = east, z = south, y = up, metres.
//
// The realm's own landscape (baseHeight in terrain.js) is Gloaming Vale's; this level brings a heightfield of its own (`height`) and its own world size (`world`), names its ground, its places
// and the words of its loading screen itself (`groundRule`, `areas`, `labels`), and has rock masses that are not heightfields (`massifs`, see massif.js and crag.js).
import { WATER_LEVEL } from '../level.js';
import { nearOnLine } from '../massif.js';
import { makeCountry, lerp, smooth, basin, mound, dryLand, glade } from '../realm/country.js';
import { CRAG_Y, cragTerrain, makeCrag, bodyHeight, SUMMIT, TUNNELS, CHAMBERS } from './crag.js';

const DEG = Math.PI / 180;
/** [x, z] at `deg` degrees from east towards south, `r` metres from (cx, cz) */
export const polar = (deg, r, cx = 0, cz = 0) => [cx + Math.cos(deg * DEG) * r, cz + Math.sin(deg * DEG) * r];

export const DOOR_H = 4.6;

/** where something stands `d` metres in front of a door (its local +z) and `side` metres to its right */
export const inFront = (door, d, side = 0) => {
  const s = Math.sin(door.yaw), c = Math.cos(door.yaw);
  return [door.x + s * d + c * side, door.z + c * d - s * side];
};

/**
 * The hidden garden: a round glade (floor radius r) ringed by rock, open only along a strip towards the open ground of the terraces (its mouth looks at angle `open`), where a cracked wall
 * stands. The ring is a flat crest 16 m over the glade's floor (a grid of 2.4 m draws a crest of 4 m cleanly), and where there are mountains already they simply stay.
 */
export const GARDEN = { x: -80, z: 38, r: 10, h: 10.6, wall: 16, gap: 3.2, open: Math.atan2(18, -20) };
const gardenAt = (d) => [GARDEN.x + Math.cos(GARDEN.open) * d, GARDEN.z + Math.sin(GARDEN.open) * d];

// ---- the parts of the country --------------------------------------------------------------------------------------------------------------------
/**
 * A REGION is a ribbon of open ground: a line of [x, z, ground height, half width] points; the ground keeps the height of the line's nearest point (interpolated) out to the half width, and
 * `fall` metres further it has risen to the mountains that fill all the rest. Where regions meet, their heights blend: a ramp, a pass. The line is also where a road runs.
 */
export const REGIONS = [
  // the Landing Cove, in the south: a broad lawn between rock walls; the first door stands at its west end
  { id: 'cove', fall: 15, pts: [[-34, 150, 3.4, 20], [4, 154, 3.4, 30], [40, 148, 3.4, 26]] },
  // the trunk: through a pass, across the Heartlands (a meadow with two levels), up to the forecourt of the Crag
  { id: 'trunk', fall: 17, pts: [[8, 146, 3.5, 24], [12, 126, 3.7, 11], [16, 110, 4.0, 12], [20, 94, 4.4, 32], [28, 72, 4.8, 34], [20, 56, 7.6, 24], [10, 38, 8.8, 22], [7, 16, CRAG_Y, 26]] },
  // the Hearth Terraces: a hillside road that climbs west and north in long switchbacks, a yard at every turn, to the windmill on the ridge
  { id: 'terraces', fall: 13, pts: [[2, 100, 4.4, 14], [-22, 104, 5.4, 15], [-48, 106, 6.8, 22], [-66, 98, 6.8, 22], [-82, 88, 7.4, 13], [-98, 76, 10.2, 21], [-112, 64, 10.2, 22],
    [-116, 46, 11.4, 13], [-124, 32, 14.6, 21], [-132, 18, 14.6, 22], [-140, 0, 16.2, 13], [-134, -18, 19.4, 20], [-122, -30, 19.4, 21], [-120, -46, 22.0, 12], [-126, -60, 25.0, 19], [-122, -74, 25.0, 15]] },
  // the hidden garden: a glade off the terraces, its strip shut with a cracked wall (see GARDEN)
  { id: 'garden', fall: 5, pts: [[...gardenAt(GARDEN.r + 17), GARDEN.h, 3.6], [...gardenAt(GARDEN.r + 5.5), GARDEN.h, 3.4], [GARDEN.x, GARDEN.z, GARDEN.h, GARDEN.r]] },
  // the road east: along the lake's south shore
  { id: 'lakeroad', fall: 14, pts: [[24, 90, 4.6, 12], [52, 96, 4.3, 13], [82, 102, 3.7, 14], [106, 100, 3.0, 16]] },
  // the shore of Mirror Lake all round (the basin itself is cut below), up to the canyon's mouth
  { id: 'shore', fall: 14, pts: [[104, 94, 3.0, 22], [130, 98, 2.6, 28], [158, 88, 2.9, 22], [174, 62, 3.4, 18], [166, 36, 4.6, 14], [140, 14, 6.2, 10], [112, 20, 8.0, 12], [98, 38, 3.0, 14], [104, 94, 3.0, 22]] },
  // the canyon: long, winding, climbing, red-walled; it ends in the forge's court
  { id: 'canyon', fall: 14, pts: [[166, 36, 4.6, 8], [184, 18, 5.2, 8], [178, -4, 5.9, 8], [156, -12, 6.6, 8], [150, -34, 7.7, 8.5], [136, -54, 9.0, 9], [126, -76, 10.8, 8], [132, -104, 12.6, 9], [146, -126, 14.4, 10], [152, -148, 15.4, 22]] },
  // the way from the Crag's east mouth out to the canyon
  { id: 'crageast', fall: 13, pts: [[56, -40, 7.4, 9], [82, -42, 7.4, 10], [106, -50, 8.0, 10], [128, -62, 9.2, 10]] },
  // the forecourt of the Crag: a broad apron in front of the cliff the south mouth is cut in, wide enough for the ledge road to start on its west side
  { id: 'forecourt', fall: 12, pts: [[-12, 2, CRAG_Y, 24], [20, 4, CRAG_Y, 20]] },
  // the plinth the Crag stands on (level ground under all its rock) and the way round its feet
  { id: 'plinth', fall: 12, pts: [[-26, -70, CRAG_Y, 34], [0, -50, CRAG_Y, 50], [36, -92, CRAG_Y, 40], [-2, -100, CRAG_Y, 42]] },
  // the Ascent: from the Crag's north passage up to the Guardian's court
  { id: 'ascent', fall: 14, pts: [[34, -128, 11.2, 11], [26, -142, 13.4, 12], [12, -152, 16.4, 13], [-4, -162, 19.8, 12], [0, -176, 23.6, 12], [0, -190, 26.0, 26]] },
];

const CANYON_LINE = REGIONS.find((r) => r.id === 'canyon').pts.map((p) => [p[0], p[1]]);

/** the ground of the open country and the mountains round it (realm/country.js): the regions' blend, the mountains that fill the rest, and the noise the landforms below share */
const COUNTRY = makeCountry({ seed: 1000, regions: REGIONS });
const { n2, nB, nC } = COUNTRY;

/** the roads (x, z); they run over the regions' lines and follow the ground */
const road = (id, surface, width, pts, extra = {}) => ({ id, surface, width, pts, ...extra });
const ptsOf = (id, from = 0, to = Infinity) => REGIONS.find((r) => r.id === id).pts.slice(from, to).map((p) => [p[0], p[1]]);

/** the doors, each in a place of its own. `deg`-free: positions are placed by hand. `yaw`: the way the door's front (its local +z) looks. */
const DOOR_DEFS = [
  // in a niche of the Cove's west wall, the first thing the hero sees
  { id: 'gloaming', name: 'GLOAMING VALE', tag: 'LANTERN KEEPERS REALM', x: -40, z: 144, look: [14, 150], color: [0.66, 0.46, 1.0], target: 'gloaming' },
  // deep in the Crag, at the far end of the Frost Grotto
  { id: 'frostbloom', name: 'FROSTBLOOM HOLLOW', tag: 'A REALM OF ICE AND BLOSSOM', x: 42.5, z: -87.5, look: [28, -82], color: [0.55, 0.85, 1.0], target: 'frostbloom' },
  // at the end of the long pier out on Mirror Lake
  { id: 'tideglass', name: 'TIDEGLASS REACH', tag: 'A REALM OF TIDES AND GLASS', x: 128, z: 38.4, y: WATER_LEVEL, look: [128, 100], color: [0.38, 0.92, 0.82], target: null },
  // in the forge at the head of the canyon
  { id: 'emberfall', name: 'EMBERFALL CRAGS', tag: 'A REALM OF EMBERS AND STONE', x: 152, z: -164, look: [150, -138], color: [1.0, 0.58, 0.28], target: 'emberfall' },
  // on the summit of the Crag
  { id: 'skyweaver', name: 'SKYWEAVER SPIRES', tag: 'A REALM ABOVE THE CLOUDS', x: SUMMIT.x + 3, z: SUMMIT.z - 5, y: SUMMIT.y, look: [SUMMIT.x - 6, SUMMIT.z + 9], color: [1.0, 0.78, 0.92], target: 'skyweaver' },
];
export const DOORS = DOOR_DEFS.map((d) => ({ ...d, yaw: Math.atan2(d.look[0] - d.x, d.look[1] - d.z), h: DOOR_H }));
/** where the hero comes out of the first door's light: 11 m in front of it */
export const ARRIVE = inFront(DOORS[0], 11);

/** The secrets of Dawnhaven, each found by opening a chest (progress.js remembers which ones the hero has found). */
export const SECRETS = [
  { id: 'pond', name: 'THE LAKE ISLET' },
  { id: 'garden', name: 'THE HIDDEN GARDEN' },
  { id: 'mill', name: 'THE MILL LOOKOUT' },
  { id: 'vault', name: 'THE CRYSTAL VAULT' },
  { id: 'summit', name: 'THE CRAG\'S SUMMIT' },
];

// ---- the ground ---------------------------------------------------------------------------------------------------------------------------------
const LAKE = { x: 128, z: 58, rx: 40, rz: 27, bed: -3.4 };

/** The shape of the ground (before the roads are carved). */
function homeHeight(x, z, L) {
  // the open ground: a blend of the regions' floors, risen to the mountains that fill the rest
  let h = COUNTRY.ground(x, z);

  // the Crag's plinth and its caves: the ground follows the tunnels' floors under the mountain
  {
    const c = cragTerrain(x, z);
    if (c && c.w > 0) {
      const body = bodyHeight(x, z);
      const under = smooth(CRAG_Y - 3, CRAG_Y + 4, body);                    // (is there mountain over this spot?)
      if (under > 0) h = lerp(h, lerp(CRAG_Y, c.y, c.w), under);
    }
  }

  // the hidden garden's ring (flat crest), and its floor
  h = glade(h, x, z, GARDEN);
  // the Guardian's gate stands in a gorge: two buttresses of rock rise on either side of it and join the mountains, so that the way north leads through the gate and nowhere else
  {
    const G = HOME.guard, ax = Math.abs(x - G.x), b = smooth(5.0, 7.2, ax) * (1 - smooth(22, 34, ax)) * smooth(G.z + 13, G.z + 9, z);
    if (b > 0) h = lerp(h, Math.max(h, G.h + 28), b);
  }
  // Mirror Lake: a bowl with a flat-ish bed and steepening walls, the shore exactly where d = 1; the islet in it
  h = basin(h, x, z, LAKE, () => (n2(nB, x + 50, z, 0.06, 2) - 0.5) * 0.9);
  h = mound(h, x, z, L.islet, LAKE.bed);
  // no accidental puddles: outside the lake the ground stays above the waterline (eased in: a hard switch would leave a ledge along the shore)
  return dryLand(h, x, z, LAKE);
}

export const HOME = {
  name: 'Dawnhaven',
  world: { size: 432, cell: 2.4 },
  labels: ['SWEEPING THE COVE', 'PLANTING TERRACES', 'POLISHING THE MORNING', 'RAISING THE CRAG', 'FILLING THE LAKE'],
  spawn: { x: ARRIVE[0], z: ARRIVE[1], yaw: DOORS[0].yaw },         // (where the hero stands when he first comes out of the Gloaming door's light: also what a fresh start of this world uses)

  // the country is walled in by mountains all round; the boundary ellipse only keeps the hero inside the world
  valley: { x: 0, z: 0, rx: 214, rz: 214, rimStart: 0.9 },

  lake: { x: LAKE.x, z: LAKE.z, rx: LAKE.rx, rz: LAKE.rz, bed: LAKE.bed, name: 'MIRROR LAKE', deepHint: 'THE LAKE IS TOO DEEP! FOLLOW THE PIER OR THE STEPPING STONES' },
  islet: { x: LAKE.x - 14, z: LAKE.z + 4, r: 5.2, top: 0.95 },
  ponds: [],
  steepSlope: 0.85,       // (radians, 54 degrees: grass up to this, rock beyond it, whatever the height and whether a road is near: the border is one smooth line)
  noGrassPatches: true,
  noRockPatches: true,            // (the picker's rock-and-grass patches are the realm's: here a slope is grass up to the steep limit, and the rock is the cliffs, the mountains and the gorge walls)
  regions: REGIONS,
  garden: GARDEN,
  guard: { x: 0, z: -190, h: 26.0 },

  paths: [
    // the trunk road: from the Cove's door, across the Heartlands, to the mouth of the Crag
    road('main', 'cobble', 6.4, [[28, 150], [16, 138], [11, 122], [14, 108], [22, 92], [30, 76], [22, 60], [12, 42], [8, 24], [6, 8], [6, -2], [6, -15]]),
    // the terraces' road: up the hillside to the windmill
    road('west', 'cobble', 5.2, [[8, 98], ...ptsOf('terraces', 1)]),
    // the lake road, to the foot of the pier
    road('lake', 'dirt', 5.0, [[26, 92], ...ptsOf('lakeroad', 1), [124, 96]]),
    // the canyon road
    road('canyon', 'dirt', 4.6, [[168, 52], ...ptsOf('canyon', 0)]),
    // from the Crag's east mouth to the canyon
    road('crageast', 'dirt', 4.6, ptsOf('crageast')),
    // the Ascent
    road('ascent', 'cobble', 6.0, ptsOf('ascent')),
    // from the trunk's end across the forecourt to where the Crag's ledge road begins (its stone takes over there, see crag.js)
    road('ledgeway', 'cobble', 6.4, [[6, 5], [-8, 6], [-22, 2], [-25, -2]]),
    // to the hidden garden
    road('garden', 'dirt', 3.6, ptsOf('garden')),
  ],
  rivers: [],

  /** the rock masses (massif.js): the Crag */
  massifs: () => [makeCrag()],

  // the ground of the places (a paved court, a cave's floor, the forge's...), the rest follows the usual rules
  groundRule(x, z, h, slope, { surface, pd }) {
    void surface; void pd;
    // the ring round the hidden garden is rock right down to its foot: the generic rules would leave flaps of grass on the lower part of its outer wall, against the rock above
    if (slope > 0.3 && Math.hypot(x - GARDEN.x, z - GARDEN.z) < GARDEN.r + 21) return ['cliff_bare', 'the hidden garden\'s wall, slope > 0.3'];
    // inside the Crag: stone underfoot
    {
      const c = cragTerrain(x, z);
      if (c && c.w > 0.5 && bodyHeight(x, z) > CRAG_Y + 2) return slope < 0.45 ? (c.kind === 'grotto' ? ['ice', 'the Frost Grotto\'s ice'] : ['flagstone', 'inside the Crag']) : ['cliff_bare', 'inside the Crag, slope > 0.45'];
    }
    // the courts before the Guardian's gate and the doors: paved (before the canyon's floor below, the forge's door has its court too)
    if (slope < 0.5) {
      const G = HOME.guard;
      if (Math.hypot(x - G.x, z - (G.z + 8)) < 14) return ['flagstone', 'the court before the Guardian\'s gate'];
      for (const d of DOORS) { const [tx, tz] = inFront(d, 5); if (h > 0.4 && Math.hypot(x - tx, z - tz) < 7.5) return ['flagstone', `${d.name} door's court`]; }
    }
    // the canyon's floor and the forge's court: sand and bare earth
    if (slope < 0.5 && h > 0.8 && this.warmRock(x, z, h)) {
      const n = nearOnLine(CANYON_LINE, x, z);
      if (n.d < 30) return [(n2(nB, x + 5, z - 9, 0.12, 2) > 0.52 ? 'dirt' : 'sand'), 'the canyon\'s floor'];
    }
    return null;
  },

  /** the red country: the canyon and the forge at its head (its steep ground is warm sandstone, see terrain-mesh.js) */
  warmRock(x, z, h = 0) {
    const n = nearOnLine(CANYON_LINE, x, z);
    return n.d < 22 + 18 * n2(nC, x + 210, z - 40 + h * 2.3, 0.055, 2);             // (a ragged edge: the sandstone grades into the grey rock in patches, and the patches change with the height, so the border is not a ruled vertical line up a cliff)
  },
  /** the tall faces of the homeworld: strata with no moss lip on every band (see the picker in terrain-mesh.js) */
  cliffs: { cool: 'cliff_bare', warm: 'cliff_warm_bare' },

  height: homeHeight,
};

/** The named places (the debug readout): [name, x, z, radius]. */
HOME.areas = [
  ['THE LANDING COVE', 4, 150, 40],
  ['THE HEARTLANDS', 20, 80, 44],
  ['THE CRAG', 6, -56, 50],
  ['THE ECHO HALL', CHAMBERS.hall.x, CHAMBERS.hall.z, 17],
  ['THE WINDING WAY', -10, -76, 14],
  ['THE FROST GROTTO', CHAMBERS.grotto.x, CHAMBERS.grotto.z, 19, CHAMBERS.grotto.floorY - 4],
  ['THE CRYSTAL VAULT', CHAMBERS.vault.x, CHAMBERS.vault.z, 8],
  ['THE LEDGE ROAD', -30, -66, 12, 14],
  ['THE SUMMIT', SUMMIT.x, SUMMIT.z, 14, SUMMIT.y],
  ['THE FORECOURT', 7, 16, 24],
  ['THE HEARTH TERRACES', -90, 76, 40],
  ['THE HIDDEN GARDEN', GARDEN.x, GARDEN.z, 14],
  ['THE WINDMILL RIDGE', -126, -52, 36],
  ['MIRROR LAKE', LAKE.x, LAKE.z, 50],
  ['THE EMBER CANYON', 140, -60, 80],
  ['THE FORGE', 152, -148, 26],
  ['THE ASCENT', 8, -160, 40],
  ['THE GUARDIAN\'S GATE', HOME.guard.x, HOME.guard.z + 2, 20],
  ...DOORS.map((d) => [`${d.name} DOOR`, ...inFront(d, 3), 12]),
];

void TUNNELS; void CHAMBERS; void DEG;
