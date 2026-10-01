// LEVEL DESIGN: "Dawnhaven" - the homeworld. The hub the Lantern Keepers' portals open onto: a sunlit plaza with a fountain, a door to every realm
// (Gloaming Vale's is awake, the others still sleep), a pond with a waterfall, a windmill on a hill, a few secrets, and the sealed gate of the
// Guardian at the head of the north road. Same conventions as level.js: x = east, z = south, y = up, metres; angles in the layout code are
// measured from east towards south (90 = south).
//
// The realm's own landscape (baseHeight in terrain.js) is Gloaming Vale's; this level brings a heightfield of its own (`height`) and its own
// world size (`world`), and names its ground, its places and the words of its loading screen itself (`groundRule`, `areas`, `labels`).
import { valueNoise, fbm } from '../../engine/textures/pix.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

const nA = valueNoise(1101), nB = valueNoise(1202), nR = valueNoise(1303), nC = valueNoise(1404);
const n2 = (noise, x, z, s, oct = 3) => fbm(noise, x * s, z * s, oct);

const DEG = Math.PI / 180;
/** [x, z] at `deg` degrees from east towards south, `r` metres from the plaza's centre */
export const polar = (deg, r) => [Math.cos(deg * DEG) * r, Math.sin(deg * DEG) * r];

/** How far from the plaza's centre the doors stand. */
export const DOOR_R = 72;
export const DOOR_H = 4.6;

/**
 * The five doors, round the plaza like the points of a star, the first at the south (where the hero comes in). Gloaming Vale's is the only one
 * with a realm behind it; the others carry the names of the places the Keepers still have to wake. `color` tints the door's light.
 */
export const DOORS = [
  { id: 'gloaming', name: 'GLOAMING VALE', tag: 'LANTERN KEEPERS REALM', deg: 90, color: [0.66, 0.46, 1.0], target: 'gloaming' },
  { id: 'frostbloom', name: 'FROSTBLOOM HOLLOW', tag: 'A REALM OF ICE AND BLOSSOM', deg: 162, color: [0.55, 0.85, 1.0], target: null },
  { id: 'tideglass', name: 'TIDEGLASS REACH', tag: 'A REALM OF TIDES AND GLASS', deg: 234, color: [0.38, 0.92, 0.82], target: null },
  { id: 'emberfall', name: 'EMBERFALL CRAGS', tag: 'A REALM OF EMBERS AND STONE', deg: 306, color: [1.0, 0.58, 0.28], target: null },
  { id: 'skyweaver', name: 'SKYWEAVER SPIRES', tag: 'A REALM ABOVE THE CLOUDS', deg: 18, color: [1.0, 0.78, 0.92], target: null },
].map((d) => {
  const [x, z] = polar(d.deg, DOOR_R);
  const yaw = Math.atan2(-x, -z);                          // the door's front (its local +z) looks at the plaza
  return { ...d, x, z, yaw, h: DOOR_H };
});

/** The secrets of Dawnhaven, each found by opening a chest (progress.js remembers which ones the hero has found). */
export const SECRETS = [
  { id: 'pond', name: 'THE POND ISLET' },
  { id: 'garden', name: 'THE HIDDEN GARDEN' },
  { id: 'mill', name: 'THE MILL LOOKOUT' },
];

/** where something stands `d` metres in front of a door (towards the plaza) and `side` metres to its right */
export const inFront = (door, d, side = 0) => {
  const s = Math.sin(door.yaw), c = Math.cos(door.yaw);
  return [door.x + s * d + c * side, door.z + c * d - s * side];
};

/** the windmill's hill (between the doors of Emberfall and Skyweaver, at the foot of the mountains) */
const MILL_HILL = { x: 67.5, z: -22, r: 27, topR: 9, topH: 9.7 };       // (the mill's level top: topR wide at topH; the flank runs on down to the meadow at r)

/** The windmill road's coil round its hill: from the foot (36 m from the mill, on the plaza's side) round once and a little more to the mill's door. */
function millSpiral() {
  const W = MILL_HILL;
  const a0 = Math.atan2(0 - W.z, 0 - W.x), pts = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30, a = a0 - t * Math.PI * 2 * 1.05, r = W.r + 3 - (W.r - 8) * t;
    pts.push([W.x + Math.cos(a) * r, W.z + Math.sin(a) * r]);
  }
  // ... and on to the foot of the mill's wooden stair: it starts on the level hilltop 55 degrees to the right of the door (the door looks at the plaza), 8.6 m from the middle
  const yaw = Math.atan2(0 - W.x, 0 - W.z), phi = (55 * Math.PI) / 180, lx = Math.sin(phi) * 8.6, lz = Math.cos(phi) * 8.6;
  pts.push([W.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), W.z - lx * Math.sin(yaw) + lz * Math.cos(yaw)]);
  return pts;
}

/** The shape of the ground (before the roads are carved). */
function homeHeight(x, z, L) {
  const V = L.valley;
  // the meadow: gently rolling, always above the waterline
  let h = 3.1 + (n2(nA, x + 140, z - 60, 0.012, 3) - 0.5) * 3.4 + (n2(nB, x, z, 0.05, 2) - 0.5) * 0.9;
  h += (n2(nC, x - 40, z + 90, 0.027, 3) - 0.5) * 2.2;
  for (const m of L.hills) {
    const d = Math.hypot(x - m.x, z - m.z) / m.r;
    if (d < 1) h += m.h * Math.pow(1 - smooth(0, 1, d), 1.25);
  }
  // the mountains that wall the valley in
  const r = Math.hypot((x - V.x) / V.rx, (z - V.z) / V.rz);
  const ridge = 1 - Math.abs(2 * n2(nR, x, z, 0.02, 3) - 1);
  h += smooth(V.rimStart, 1.03, r) * (30 + 26 * ridge);
  h += smooth(1.03, 1.3, r) * 28;

  const P = L.plaza;
  h = lerp(h, P.h, 1 - smooth(P.r, P.r + P.fall, Math.hypot(x - P.x, z - P.z)));
  for (const t of L.terraces) h = lerp(h, t.h, 1 - smooth(t.r, t.r + t.fall, Math.hypot(x - t.x, z - t.z)));
  {
    // the rise in the north, where the Guardian's gate stands: the ground climbs gently to a level court in front of it
    const G = L.guard;
    h = lerp(h, G.h, 1 - smooth(G.r, G.r + G.fall, Math.hypot(x - G.x, z - G.z)));
  }

  {
    // the gate stands in a gorge: two buttresses of rock rise on either side of it and join the mountains, so the way north leads through the gate and nowhere else
    const G = L.guard, ax = Math.abs(x - G.x);
    h += 26 * smooth(7.0, 9.0, ax) * smooth(G.z + 11, G.z + 7, z);
  }
  {
    // the hidden garden: a round glade ringed by rock, open only along a strip 6 m wide towards the plaza, where a cracked wall stands
    const K = L.garden, dx = x - K.x, dz = z - K.z, d = Math.hypot(dx, dz);
    h = lerp(h, K.h, 1 - smooth(K.r, K.r + 2.2, d));
    const along = dx * Math.cos(K.open) + dz * Math.sin(K.open), lateral = Math.abs(dx * Math.sin(K.open) - dz * Math.cos(K.open));
    const gap = along > 0 ? 1 - smooth(K.gap, K.gap + 0.7, lateral) : 0;
    const ring = smooth(K.r + 0.4, K.r + 3.2, d) * (1 - smooth(K.r + 7.4, K.r + 12.2, d));
    h += K.wall * ring * (1 - gap);
  }

  // the pond: a bowl with a flat-ish bed and steepening walls, the shore exactly where d = 1
  {
    const k = L.lake;
    const d = Math.hypot((x - k.x) / k.rx, (z - k.z) / k.rz);
    if (d < 1.32) {
      const wob = (n2(nB, x + 50, z, 0.06, 2) - 0.5) * 0.7 * (1 - d);
      const inner = k.bed * (1 - Math.pow(d, 3.2)) + wob * (d < 1 ? 1 : 0);
      const outer = lerp(0.0, h, smooth(1.0, 1.32, d));
      h = d < 1 ? Math.min(h, inner) : outer;
    }
    // the islet in the middle of it
    const I = L.islet, di = Math.hypot(x - I.x, z - I.z);
    h = Math.max(h, k.bed + (I.top - k.bed) * (1 - smooth(I.r * 0.45, I.r * 1.25, di)));
  }
  {
    // the cliff the waterfall pours from, a plateau with a wobbly lip behind the pond
    const C = L.cascade;
    const d = Math.hypot(x - C.x, z - C.z) + (n2(nC, x, z + 17, 0.08, 2) - 0.5) * 7;
    h = lerp(h, C.h, 1 - smooth(C.r, C.r + C.fall, d));
  }
  {
    // the windmill's hill: a dome of grass. The meadow climbs to the mill's level top in one smooth sweep between W.topR and W.r, so no slope on it is steeper than a plain hillside
    // (about 30 degrees) and none of it is rock: the mound it replaces had a steep crown on a low skirt, and its rock and grass lay across the flank in ragged teeth
    const W = L.windHill;
    h = lerp(h, W.topH, 1 - smooth(W.topR, W.r, Math.hypot(x - W.x, z - W.z)));
  }
  // no accidental puddles: outside the pond the ground stays above the waterline (eased in: a hard switch would leave a ledge along the shore)
  const dWet = Math.hypot((x - L.lake.x) / L.lake.rx, (z - L.lake.z) / L.lake.rz);
  const k = smooth(1.12, 1.42, dWet);
  if (k > 0) h = lerp(h, Math.max(h, 0.75), k);
  return h;
}

const PLAZA = { x: 0, z: 0, r: 25, fall: 9, h: 3.5 };

export const HOME = {
  name: 'Dawnhaven',
  world: { size: 316.8, cell: 2.4 },
  labels: ['SWEEPING THE PLAZA', 'PLANTING GARDENS', 'POLISHING THE MORNING', 'RAISING THE TERRACES', 'FILLING THE POND'],
  spawn: { x: 0, z: DOOR_R - 11, yaw: Math.PI },

  // the valley the hub sits in: ringed by mountains like the realm's, but about half the ground (47 000 m2 of valley against 97 000)
  valley: { x: 0, z: 0, rx: 122, rz: 122, rimStart: 0.78 },

  // the pond west of the plaza, with an islet in the middle (a secret) and the cliff of the waterfall behind it
  lake: { x: -83, z: -22, rx: 21, rz: 15, bed: -3.0, name: 'DAWN POND', deepHint: 'THE POND IS TOO DEEP! FOLLOW THE STEPPING STONES' },
  islet: { x: -83, z: -22, r: 5.2, top: 0.95 },
  ponds: [],
  cascade: { x: -83, z: -72, r: 22, fall: 5, h: 17 },
  windHill: MILL_HILL,
  roadBanks: { zone: 7, steep: 1.1 },       // (a road cut into a hillside has banks of grass, not slivers of rock along it, until they are really steep)
  noRockPatches: true,            // (the picker's rock-and-grass patches are the realm's: here a slope is grass up to the steep limit, and the rock is the cliffs, the mountains and the garden's wall)
  garden: { x: 0, z: 0, r: 8.6, h: 3.7, wall: 9, gap: 3.0, open: 0 },       // (placed below, from the polar position)

  plaza: PLAZA,
  terraces: DOORS.map((d) => { const [x, z] = inFront(d, 3); return { id: d.id, x, z, r: 11, fall: 8, h: d.h }; }),
  guard: { x: 0, z: -100, r: 13, fall: 20, h: 7.2 },

  // soft hills that keep the meadow from reading as a table
  hills: [
    { x: -44, z: 54, r: 18, h: 2.6 }, { x: -60, z: 28, r: 16, h: 2.2 }, { x: 62, z: 12, r: 16, h: 2.6 },
    { x: 14, z: -56, r: 17, h: 2.8 }, { x: -22, z: -60, r: 15, h: 2.4 }, { x: 70, z: -66, r: 20, h: 3.2 }, { x: -64, z: -62, r: 16, h: 2.4 },
  ],

  paths: [
    // the spokes: cobbled roads from the plaza's rim to every door's dais
    ...DOORS.map((d) => {
      const [x0, z0] = polar(d.deg, 22), [x1, z1] = polar(d.deg, DOOR_R - 9);
      const mid = (f) => [x0 + (x1 - x0) * f, z0 + (z1 - z0) * f];
      return { id: `spoke_${d.id}`, surface: 'cobble', width: d.id === 'gloaming' ? 6.4 : 5.2, pts: [[x0, z0], mid(0.35), mid(0.7), [x1, z1]] };
    }),
    // the north road to the Guardian's gate (the court in front of it is paved by the ground rule)
    { id: 'north', surface: 'cobble', width: 6.4, pts: [[0, -22], [0, -44], [0, -66], [0, -86]] },
    // the dirt road to the windmill: out of the plaza between two spokes, then once round the hill (it follows the ground: a terrace is cut into the slope) to the foot of the mill
    { id: 'mill', surface: 'dirt', width: 4.6, pts: [[22.8, -7.4], [34, -11], ...millSpiral()] },
  ],
  rivers: [],

  // the paving of the plaza (a wide circle of flagstone) and of the court before the Guardian's gate; the rest follows the usual rules
  groundRule(x, z, h, slope, { surface, pd }) {
    // the ring round the hidden garden is rock right down to its foot: the generic rules would leave flaps of grass on the lower part of its outer wall, against the rock above
    const K = this.garden;
    if (slope > 0.3 && Math.hypot(x - K.x, z - K.z) < K.r + 21) return ['cliff', 'the hidden garden\'s wall, slope > 0.3'];
    if (slope < 0.5) {
      if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < 19.5) return ['flagstone', 'the plaza\'s paving'];
      if (Math.hypot(x - this.guard.x, z - (this.guard.z + 8)) < 13) return ['flagstone', 'the court before the Guardian\'s gate'];
      for (const d of DOORS) { const [tx, tz] = inFront(d, 3.5); if (Math.hypot(x - tx, z - tz) < 7.5) return ['flagstone', `${d.name} door's court`]; }
    }
    void h; void surface; void pd;
    return null;
  },

  height: homeHeight,
};

{
  // the hidden garden lies south-east of the plaza (54 degrees), its opening looking back at the plaza
  const G = HOME.garden, [gx, gz] = polar(54, 64);
  G.x = gx; G.z = gz; G.open = Math.atan2(-gz, -gx);
}

/** The named places (the debug readout): [name, x, z, radius]. */
HOME.areas = [
  ['THE PLAZA', 0, 0, 24],
  ...DOORS.map((d) => [`${d.name} DOOR`, ...inFront(d, 3), 12]),
  ["THE GUARDIAN'S GATE", HOME.guard.x, HOME.guard.z + 2, 17],
  ['DAWN POND', HOME.lake.x, HOME.lake.z, 24],
  ['WINDMILL HILL', HOME.windHill.x, HOME.windHill.z, 30],
  ['THE HIDDEN GARDEN', HOME.garden.x, HOME.garden.z, 12],
  ['WATERFALL CLIFF', HOME.cascade.x, HOME.cascade.z + 6, 22],
];
