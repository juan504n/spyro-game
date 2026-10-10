// TIDEGLASS REACH: the design of the realm, written down as data before it is built (src/game/realm/brief.js has the schema and the rules a brief is held to).
//
// The Tideglass is the great lens of the lighthouse on the headland: sea-glass the Reachfolk blew and set in the lantern, and it kept the tide to its hours. When its light went out the tide lost its way:
// it comes in and goes out in a minute and a half, drowns the roads on the flats, floods the sea cave under the Weeping Fall. Five Tide Lenses - discs of sea-glass in rings of brass - stand about the Reach;
// dragon fire lights them, each one that shines brings the realm a step from its teal dusk towards a green dawn, and when the Tideglass itself is lit, the tide is true again and a ring of light carries the hero home.
//
// The country is ridges and rocks standing in a SEA (`sea` with a `tide`: realm/tide.js - the water rises and falls 1.4 m either way round the mean level, in 90 s). The hero comes out of Dawnhaven's door at the end
// of the Harbour's quay. Two ways lead east to the headland, and they meet twice:
//   the LOW ROAD runs out over the Salt Flats - a causeway across sand that is bare at the low tide, ankle-deep at the mean and drowns him at the high - to Pearl Rock (a tidal island: the second lens) and on to
//   the beach under the Weeping Cliff, where the fourth lens hangs in a sea cave behind a waterfall; the cave floods at the high tide up to a dry chamber. Cairns on the flats are the refuges: ground the sea
//   only wades. The flats are only ever as far from one as the water takes to rise over his head.
//   the HIGH ROAD climbs from the quay up the west shore and runs along the Cliffwalk, always dry, to the Glass Stacks - four sea stacks standing in the Reach, joined by BRIDGES OF GLASS over the water - where
//   the third lens hangs on the Glass Court; and to the foot of the headland, where the Weeping Stair comes up from the beach, and the Sea Gate shuts the ridge until four lenses shine.
//   the HEADLAND: the ridge climbs to the lighthouse, the Tideglass at its foot.
// Five goals in five kinds of place: a landing, an island, a bridge, a cave and a summit.
import { defineBrief, ptsOf } from '../realm/brief.js';
import { TIDE_ENVIRONMENT } from './environment.js';
import { GROTTO } from './weeping.js';

const PI = Math.PI;

/**
 * The land: ridges and rocks standing in the sea, ribbons of open ground [x, z, ground height, half width] (realm/country.js: what is not a ribbon is the fill of the country, `mountain.base`, far under
 * the surface). `fall`: the metres beyond a ribbon's edge over which the ground drops to the fill, the steeper the smaller. A ribbon of two points close together is a round rock. The sand of the flats is
 * not a ribbon: it is a shoal (FLATS below, level.js) the sea fill is raised to, so that a rock can stand in it. `label` names a part (debug readout, TRAVEL menu).
 */
/** the height of the ridge's neck, the level stretch the Sea Gate stands on (the ribbon's two points there, the road's pins there, the pad the gate's ground is flattened to) */
export const NECK_Y = 20.2;
export const REGIONS = [
  { id: 'harbour', fall: 5, label: 'THE HARBOUR', pts: [[-208, 22, 4, 12], [-186, 18, 4, 17], [-162, 12, 4, 14]] },
  { id: 'strand', fall: 6, label: 'THE STRAND', pts: [[-164, 16, 3.8, 9], [-146, 28, 1.4, 10], [-128, 40, -0.2, 12]] },
  { id: 'hill', fall: 6, label: 'THE HIGH ROAD', pts: [[-166, 6, 4, 9], [-170, -20, 7, 9], [-174, -48, 10, 9], [-166, -76, 13, 9], [-150, -98, 14, 10]] },
  { id: 'walk', fall: 6, label: 'THE CLIFFWALK', pts: [[-150, -98, 14, 10], [-112, -112, 14.5, 10], [-70, -118, 15, 10], [-26, -116, 15, 10], [18, -108, 14.5, 10], [58, -96, 14, 10], [96, -80, 14, 10]] },
  // the ridge to the headland: a neck 12.8 m wide at the Sea Gate - no wider than the gate's two pillars stand (their plinths cover the ground from 2.3 to 7.7 m either side of the middle of the road), so that nothing is left to walk round them by: the sea is the wall on both sides. The neck is LEVEL between its two points (the road is carved to its own line through them, and the gate's threshold is a flat slab: on a slope its front edge would stand over the step a hero can climb) - then the climb to the lighthouse
  { id: 'ridge', fall: 8, label: 'THE HEADLAND', pts: [[96, -80, 14, 10], [118, -72, 17.5, 11], [124, -76, NECK_Y, 6.4], [134, -82, NECK_Y, 6.4], [144, -92, 25, 11], [154, -106, 30.5, 13], [156, -124, 35, 14], [146, -140, 38, 17]] },
  { id: 'stair', fall: 6, label: 'THE WEEPING STAIR', pts: [[92, 14, -0.3, 7], [86, -12, 3, 7], [82, -34, 7, 7], [86, -56, 11, 7], [96, -80, 14, 8]] },
  { id: 'pearl', fall: 5, label: 'PEARL ROCK', pts: [[-44, 52, -0.3, 8], [-38, 38, 3, 7.5], [-28, 30, 6, 7.5], [-18, 32, 8.5, 8]] },
  { id: 'stackA', fall: 5, label: 'THE FIRST STACK', pts: [[12, -82, 13, 5], [13, -82, 13, 5]] },
  { id: 'stackB', fall: 5, label: 'THE SECOND STACK', pts: [[24, -52, 12, 5], [25, -52, 12, 5]] },
  { id: 'court', fall: 5, label: 'THE GLASS COURT', pts: [[20, -18, 11, 8.5], [22, -18, 11, 8.5]] },
  { id: 'stackC', fall: 5, label: 'THE LONE STACK', pts: [[50, -44, 12, 4.5], [51, -44, 12, 4.5]] },
];

/** the door: the way back to Dawnhaven at the west end of the quay (the hero comes out of its light 11 m in front of it, facing east) */
export const DOOR = { id: 'tidegate', name: 'DAWNHAVEN', tag: 'HOMEWORLD OF THE LANTERN KEEPERS', x: -204, z: 22, yaw: PI / 2, color: [0.5, 1.0, 0.88], target: 'home' };

/**
 * The Salt Flats: a shoal along a line (`pts`), `hw` metres each side of it, `level` metres over the mean (it is under it: the sand is bare at the low tide, wading at the mean, drowning at the high), the
 * sea fill rising to it over `fall` metres beyond. The sand ripples: `bars` metres of sandbars and channels. The causeway runs along the line. `arms` are shoals of their own (the tide pool's).
 */
export const FLATS = {
  pts: [[-128, 40], [-100, 54], [-66, 64], [-30, 68], [8, 62], [44, 50], [74, 34], [96, 16]],
  hw: 20, level: -0.5, fall: 14, bars: 0.55,
  // the beach in front of the Weeping Cliff and under it (the mass stands on this ground), and the tide pool's arm off the strand
  arms: [
    { pts: [[96, 16], [116, 10], [136, 4]], hw: 22, level: -0.5, fall: 9, bars: 0.2 },
    { pts: [[-120, 40], [-108, 24], [-98, 10]], hw: 11, level: -0.55, fall: 10, bars: 0.3 },
  ],
};

/**
 * The cairns: refuges on the flats - low round banks of sand and stone with a lantern of glass on each, standing 2.7 m over the mean (the high tide never covers them, and ground the sea cannot reach is
 * where a hero who is drowned is set back) - in pairs either side of the causeway, `side` metres off it, every `every` metres from `from`: the channel markers of the road, and a refuge in reach of every hero
 * who is caught (the rule `tide.refuge`: the time the water takes to rise over his head, wading, halved). The tide pool has one of its own at the end of its arm, with the chest on it.
 */
export const CAIRNS = { every: 40, from: 20, side: 11, top: 2.7, r: 6.5 };
export const POOL = { x: -98, z: 9, r: 6, top: 2.7 };
/** more banks where the flats are wide: at the beach under the Weeping Cliff */
export const BANKS = [{ x: 112, z: 32, r: 6.5, top: 2.7 }, { x: 94, z: 36, r: 6.5, top: 2.7 }];

/**
 * The Glass Stacks: sea stacks standing in the Reach (the ribbons `stackA`, `stackB`, `court`, `stackC`), joined by bridges of glass. A bridge runs from a point on the flat top of one (or the Cliffwalk's
 * edge) to a point on the flat top of the next, `in` metres in from its edge: `span` works the ends out from the centres (`r` = a stack's radius at the top).
 */
const stackAt = (id) => { const R = REGIONS.find((q) => q.id === id), p = R.pts[0], q = R.pts[1]; return { x: (p[0] + q[0]) / 2, z: (p[1] + q[1]) / 2, r: p[3] }; };
function span(id, from, to, o = {}) {
  const A = from.id ? stackAt(from.id) : { x: from.x, z: from.z, r: 0 }, B = to.id ? stackAt(to.id) : { x: to.x, z: to.z, r: 0 };
  const L = Math.hypot(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / L, uz = (B.z - A.z) / L;
  const a = A.r ? A.r - (o.startIn ?? 2.0) : 0, b = B.r ? B.r - (o.endIn ?? 2.0) : 0;       // (a deck lands 2 m inside the rim: the top of a stack is flat only to a metre or so short of its radius, and a hero cannot climb the rim)
  return { id, from: [A.x + ux * a, A.z + uz * a], to: [B.x - ux * b, B.z - uz * b], width: o.width ?? 3.8 };
}
export const BRIDGES = [
  span('b1', { x: 12, z: -100.4 }, { id: 'stackA' }),                       // the Cliffwalk to the first stack
  span('b2', { id: 'stackA' }, { id: 'stackB' }),                            // the first stack to the second
  span('b3', { id: 'stackB' }, { id: 'court' }, { endIn: 1.2 }),             // the second to the Glass Court
  span('b4', { id: 'stackB' }, { id: 'stackC' }, { width: 3.4 }),            // the second to the Lone Stack (the secret)
];

/** the Sea Gate: a field of glass between two pillars across the neck of the ridge, shut until four lenses shine (the road runs east-north-east there) */
export const GATE = { x: 129, z: -79, at: 4, yaw: Math.atan2(10, -6) };

/** The lighthouse on the headland: a landmark in sight from the first step; the Tideglass hangs before it */
export const LIGHTHOUSE = { x: 154, z: -149 };

/** What every Tide Lens looks like (models/objects/tidelens.js): a disc of sea-glass in a ring of brass on a post, grey-green and dark until it is lit, then a shining aquamarine, ringing out in rings of light. */
const LENS = { model: 'tidelens', sfx: 'lens_ring', beam: { off: [0.3, 0.52, 0.56], on: [0.55, 1.0, 0.88] }, glow: [0.5, 1.0, 0.86], wisp: [0.7, 1.0, 0.95], flame: false, spark: { c0: [0.8, 1.0, 0.94, 1], c1: [0.35, 0.9, 0.8, 0] }, sparkle: [0.7, 1.0, 0.9] };

/**
 * The headland road: the ridge's points, with the road PINNED at the neck's height at five points along the neck (the ground along a road is carved to the road's own profile, which is the ground
 * smoothed over 13 m: one pin would be a spike in a slope, and the gate's flat threshold would stand over a step the hero cannot climb)
 */
function neckRoad() {
  const P = ptsOf(REGIONS, 'ridge'), a = P[2], b = P[3];
  const pin = [0, 0.25, 0.5, 0.75, 1].map((t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NECK_Y]);
  return [...P.slice(0, 2), ...pin, ...P.slice(4)];
}

export const BRIEF = defineBrief({
  id: 'tideglass',
  name: 'TIDEGLASS REACH',
  tagline: 'A REALM OF TIDES AND GLASS',
  door: 'tideglass',                                       // the id of the door in Dawnhaven that opens onto this realm (at the end of the pier on Mirror Lake)
  world: { size: 480, cell: 2.4 },

  // ---- a themed place ----------------------------------------------------------------------------------------------------------------------------
  theme: {
    palette: ['sea-glass teal', 'pale sand', 'brass'],               // two base colours and the accent: the sky of each mood is made of them
    ground: ['sand_tide', 'tideturf', 'cliff_tide'],
    mood: 'a teal dusk over a sea that cannot keep its hours, waiting for the light to come back to the glass',
    trials: { stone: 'cobble_tide', crystal: 'crystal_cyan', glow: [0.55, 1.0, 0.9] },            // (what its trials are made of: sea-stone and aquamarine glass)
    // what the props wear (kit.skin): rocks wear dune turf where they would wear moss and slate-teal strata where they would wear stone, the meadow flowers are all one kind
    skin: {
      textures: { moss: 'tideturf', cliff: 'cliff_tide', cliff_warm: 'cliff_tide', tower_stone: 'cliff_tide', brick: 'cliff_tide', flower_yellow: 'flower_sky', flower_blue: 'flower_sky', flower_pink: 'flower_sky' },
      palettes: {
        moss: { dark: [0.7, 0.9, 0.86], light: [1.0, 1.08, 1.0] },
        mossTop: [0.96, 1.04, 0.98],
        pine: { dark: [0.7, 0.9, 0.86], light: [1.04, 1.14, 1.06], under: [0.76, 0.9, 0.9] },
        rune: [0.7, 1.15, 1.0],                                       // (the runes of the standing stones glow sea-green)
      },
    },
  },
  environment: TIDE_ENVIRONMENT,
  words: {
    goals: 'LENSES', lit: 'SHINES!', finale: 'THE TIDE IS TRUE!',
    gate: ['THE SEA GATE OPENS!', 'THE LIGHTHOUSE IS OPEN'],
    portalOpened: ['A PORTAL HAS OPENED', 'ABOVE THE TIDEGLASS'],
    saved: ['THE REACH IS SAVED', 'THANK YOU, SPYRO'],
    results: 'REALM RESTORED!', portalResults: 'THE PORTAL TO DAWNHAVEN IS OPEN',
    freeRoam: 'THE TIDEGLASS\'S PORTAL LEADS TO DAWNHAVEN',
    restored: 'RESTORED  -  THE TIDE IS TRUE', restoredHint: 'THE PORTAL ABOVE THE TIDEGLASS LEADS BACK TO DAWNHAVEN',
    icons: ['lens_on', 'lens_off'],                   // (the HUD's lenses: shining, still dark)
  },
  labels: ['READING THE TIDE TABLES', 'RAISING THE HARBOUR', 'PAINTING THE DUSK', 'BLOWING THE GLASS', 'FILLING THE REACH'],

  // ---- the country --------------------------------------------------------------------------------------------------------------------------------
  country: { seed: 5527, mountain: { base: -7, ridge: 1.5, rough: 1.5 }, roll: { amp: 0.9, fine: 0.4 }, regions: REGIONS },
  // the sea: the surface lies at the mean level out to `radius` and rises and falls (the tide); everything that is not land or shoal is far under it. Cut finely: the shallows are tinted by its vertices
  sea: { name: 'THE REACH', deepHint: 'THE REACH IS TOO DEEP! KEEP TO THE ROAD, THE CAIRNS AND THE GLASS', radius: 360, segs: 120, rings: 60 },
  tide: {
    period: 90, amp: 1.4, start: 0.75,                       // (it begins at the mean level, going out: the first thing the hero sees is the flats appearing)
    hint: 'THE TIDE IS IN! WAIT FOR IT TO GO OUT, OR TAKE THE HIGH ROAD',
    tint: { shallow: [0.46, 0.76, 0.72], deep: [0.08, 0.28, 0.4], scale: 3.4, shimmer: [0.1, 0.17, 0.19], texture: 'water_tide' },
  },
  roadTextures: { cobble: 'cobble_tide', dirt: 'path_tide' },               // (the roads: flags of sea-stone with salt in the joints, a pale shell-sand path)
  farRock: 'far_tide',

  // (every road ends well inside the edge of its ridge: a road of a ribbon's width would be cut off by its cliff)
  roads: [
    { id: 'quay', surface: 'cobble', width: 5, pts: [[-200, 22], [-186, 18], [-164, 14]], gems: { every: 9, pattern: [1, 1, 2], lateral: 2.0 } },
    { id: 'causeway', surface: 'cobble', width: 4.6, pts: [[-164, 14], [-146, 28], [-128, 40], ...FLATS.pts.slice(1, -1), [92, 14]], gems: { every: 9, pattern: [1, 1, 2] } },
    { id: 'pearl', surface: 'dirt', width: 3.6, pts: [[-44, 64], [-44, 52], [-38, 38], [-28, 30], [-18, 32]], gems: { every: 9, pattern: [1, 1, 2] } },
    { id: 'hill', surface: 'dirt', width: 4.6, pts: [[-164, 14], [-168, -8], [-172, -34], [-170, -60], [-158, -86], [-150, -98]], gems: { every: 10, pattern: [1, 1, 2] } },
    { id: 'walk', surface: 'cobble', width: 5, pts: ptsOf(REGIONS, 'walk'), gems: { every: 10, pattern: [1, 1, 1, 2] } },
    { id: 'ridge', surface: 'cobble', width: 4.6, pts: neckRoad(), gems: { every: 10, pattern: [1, 1, 2] } },
    { id: 'stair', surface: 'dirt', width: 4.4, pts: ptsOf(REGIONS, 'stair'), gems: { every: 10, pattern: [1, 1, 2] } },
  ],

  spawn: { x: -193, z: 22, yaw: PI / 2 },                  // (11 m in front of the door, facing east)

  // ---- the goals: five Tide Lenses, each in a different kind of place -----------------------------------------------------------------------------------
  goals: [
    { id: 'quay', name: 'QUAY LENS', situation: 'landing', x: -178, z: 10, hint: 'THE LENS IS DARK: CARRY A TIDE PEARL TO IT. WATCH THE TIDE GAUGE: THE SEA COMES AND GOES', hintAt: [-186, 14], hintR: 9, ...LENS },
    { id: 'pearl', name: 'PEARL LENS', situation: 'island', x: -18, z: 32, hint: 'THE CAUSEWAY IS BARE AT LOW TIDE. TAKE A PEARL TO PEARL ROCK AND CLIMB', hintAt: [-52, 60], hintR: 12, ...LENS },
    { id: 'court', name: 'COURT LENS', situation: 'bridge', x: 21, z: -18, hint: 'THE GLASS BRIDGES CARRY YOU OUT OVER THE REACH TO THE GLASS COURT', hintAt: [12, -99], hintR: 12, trial: { kind: 'circuit', pylons: [[-87, -117], [-65, -118], [-43, -118], [-21, -115], [1, -112], [23, -107]] }, ...LENS },
    { id: 'weeping', name: 'WEEPING LENS', situation: 'cave', x: GROTTO.x, z: GROTTO.z, y: GROTTO.floorY, pad: false, hint: 'THE LENS HANGS IN THE CAVE BEHIND THE FALL. THE SEA FLOODS ITS MOUTH AT HIGH TIDE: CARRY A PEARL IN AT LOW TIDE', hintAt: [98, 14], hintR: 12, ...LENS },
    { id: 'light', name: 'TIDEGLASS', situation: 'summit', x: 140, z: -134, big: true, hint: 'THE TIDEGLASS HANGS BEFORE THE LIGHTHOUSE. CARRY THE LAST PEARL UP TO IT AND THE TIDE IS TRUE AGAIN', hintAt: [150, -118], hintR: 14, ...LENS },
  ],
  // the realm's own errand (missions/deliver.js): a tide pearl lights a lens; the glass bridges (the circuit) light the court lens
  mission: { kind: 'deliver', goals: ['quay', 'pearl', 'weeping', 'light'], pearls: [{ goal: 'quay', at: [-123, 23] }, { goal: 'pearl', at: [-60, 60] }, { goal: 'weeping', at: [86, 29] }, { goal: 'light', at: [72, 45] }] },
  exit: { name: 'DAWNHAVEN', tag: 'HOMEWORLD OF THE LANTERN KEEPERS', color: [0.6, 1.0, 0.9], target: 'home' },
  gate: GATE,
  secrets: [
    { id: 'vault', name: 'THE SALVAGE STORE' },
    { id: 'pool', name: 'THE TIDE POOL' },
    { id: 'lone', name: 'THE LONE STACK' },
  ],
  gems: { min: 400 },
  danger: { safeRadius: 30 },
});

