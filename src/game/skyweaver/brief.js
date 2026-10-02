// SKYWEAVER SPIRES: the design of the realm, written down as data before it is built (src/game/realm/brief.js has the schema and the rules a brief is held to).
//
// The Skyweavers wove the winds into the spires of the sky, and kept them there with five great Windbells; when the bells fell silent the winds fell slack, and the clouds have lain still ever since.
// Five Windbells - bronze and glass, hung in frames of marble - are rung by dragon fire; each one that rings brings the realm a step from its windless rose dusk towards a bright morning, and when the
// Loom Bell at the top of the world rings, the winds return, and a ring of light carries the hero home.
//
// The country is islands of cream marble standing in a sea of cloud (`sea`: the ground that is not an island is far below the waterline, and the clouds cannot hold the hero: he is set back on the last
// firm ground). The islands are far apart: the way from one to the next is a row of floating slabs to hop, a glide down, or a WHIRLWIND, an updraft that carries the hero up to glide on from its top
// (realm/whirl.js). The way climbs in a spiral round the Loom, the tower at the heart of the world, which is in sight from the first step:
//   the Skygate (where the door of Dawnhaven stands; the first bell), a row of slabs across the cloud to the Cloud Islet (the second bell), a glide down to the Lowfield (the third), the first
//   whirlwind up to the Orchard Terrace (a walled courtyard shut with a cracked wall, a secret) and the second up to the Spindle Spires, four needles of marble joined by slabs, where the fourth bell
//   hangs, the third whirlwind from the highest of them to the Loom Isle and the Loom Bell. The Kite Isle, off the first whirlwind, and a lonely slab off the first row, hold the other secrets.
// Five goals in five kinds of place: a landing, an island, a glide, a lift and a summit.
import { defineBrief } from '../realm/brief.js';
import { SKY_ENVIRONMENT } from './environment.js';

const PI = Math.PI;

/**
 * The islands: ribbons of open ground [x, z, ground height, half width] standing in the sea (realm/country.js: what is not a ribbon is the fill of the country, `mountain.base`, below the waterline).
 * `fall`: the metres beyond a ribbon's edge over which the ground drops to the fill, the steeper the smaller. A ribbon of two points close together is a round island. `label` names a part (debug
 * readout, TRAVEL menu).
 */
export const REGIONS = [
  { id: 'skygate', fall: 7, label: 'THE SKYGATE', pts: [[-208, 152, 22, 17], [-180, 148, 22, 22], [-152, 141, 22, 15]] },
  { id: 'cloudisle', fall: 6, label: 'THE CLOUD ISLET', pts: [[-74, 112, 24, 9.5], [-72, 111, 24, 9.5]] },
  { id: 'lowfield', fall: 7, label: 'THE LOWFIELD', pts: [[-30, 70, 12, 15], [-4, 58, 12, 18], [20, 46, 12, 12]] },
  { id: 'kite', fall: 5, label: 'THE KITE ISLE', pts: [[4, 8, 30, 8], [8, 8, 30, 8]] },
  { id: 'orchard', fall: 7, label: 'THE ORCHARD TERRACE', pts: [[54, 30, 34, 16], [84, 20, 34, 24], [112, 6, 34, 16]] },
  { id: 'spire1', fall: 4, label: 'THE FIRST SPIRE', pts: [[104, -30, 56, 7], [105, -30, 56, 7]] },
  { id: 'spire2', fall: 4, label: 'THE SECOND SPIRE', pts: [[138, -52, 59, 6], [139, -52, 59, 6]] },
  { id: 'spire3', fall: 4, label: 'THE HIGH SPIRE', pts: [[119, -88, 62, 10], [123, -88, 62, 10]] },
  { id: 'spire4', fall: 4, label: 'THE FOURTH SPIRE', pts: [[84, -66, 59, 6], [85, -66, 59, 6]] },
  { id: 'loom', fall: 6, label: 'THE LOOM ISLE', pts: [[70, -124, 76, 20], [96, -140, 76, 20]] },
];

/** the doors: the way back to Dawnhaven at the west end of the Skygate (the hero comes out of its light 11 m in front of it, facing east) */
export const DOOR = { id: 'skygate', name: 'DAWNHAVEN', tag: 'HOMEWORLD OF THE LANTERN KEEPERS', x: -202, z: 151, yaw: PI / 2, color: [1.0, 0.78, 0.92], target: 'home' };

/**
 * the whirlwinds: where the column stands (the ground at its foot is the island's), its height and its radius at the foot (realm/whirl.js). The foot is where the hero walks in; the top, `h` metres
 * up, is where he jumps out to glide to the next island (the air links below say where to).
 */
export const WHIRLS = [
  { id: 'w1', region: 'lowfield', x: 18, z: 44, h: 36, r: 2.8 },
  { id: 'w2', region: 'orchard', x: 108, z: 2, h: 38, r: 2.8 },
  { id: 'w3', region: 'spire3', x: 128, z: -88, h: 40, r: 2.8 },
];

/**
 * the rows of slabs that join the islands where the gap is a hop's: from one island's edge to the next, `n` slabs of marble hanging in the air (a hop of 3.5 to 5 m between the edges) on a curve that
 * leans `bend` metres to one side, `r` the radius of the top of each. `y` of the first and last is the island's own ground; between them it is eased from one to the other. (layout.js makes them.)
 */
export const ROWS = [
  { id: 'gate', from: [-138.2, 136.3, 22], to: [-82.5, 116.3, 24], n: 6, bend: 3.5, r: 3.0 },
  { id: 'spire12', from: [109.5, -33, 56], to: [133.5, -48, 59], n: 3, bend: -2.2, r: 2.6 },
  { id: 'spire23', from: [135, -57.5, 59], to: [125, -80.5, 62], n: 3, bend: 2.2, r: 2.4 },
  { id: 'spire14', from: [101, -36, 56], to: [88, -60.5, 59], n: 3, bend: 2.2, r: 2.6 },
  { id: 'spire43', from: [89.5, -69, 59], to: [112, -82, 62], n: 3, bend: -2.2, r: 2.4 },
];

/** the lonely slab: a branch of `n` slabs off the `from`th slab of the first row (counting from 1), on the side away from the row's lean, `step` metres apart; the last is larger and has the secret on it */
export const LONELY = { from: 3, n: 2, step: 9.4, r: 3.4 };

/** the walled vault on the Orchard Terrace: a courtyard of marble walls with one doorway, shut with a cracked wall (the first secret) */
export const VAULT = { x: 80, z: 28, w: 14, d: 8, door: 'north' };

/** The Weavers' tower on the Loom Isle: a landmark in sight from the first step; the last bell hangs before it */
export const LOOM = { x: 74, z: -136 };

/** What every Windbell looks like (models/objects/windbell.js): a bronze and glass bell in a frame of marble, dull and silent until it is rung, then golden, swinging, ringing out in rings of light. */
const BELL = { model: 'windbell', beam: { off: [0.45, 0.5, 0.7], on: [1.0, 0.9, 0.62] }, glow: [1.0, 0.86, 0.5], wisp: [0.8, 0.9, 1.0], flame: false, spark: { c0: [1.0, 0.95, 0.7, 1], c1: [0.7, 0.85, 1.0, 0] }, sparkle: [1.0, 0.9, 0.6] };

export const BRIEF = defineBrief({
  id: 'skyweaver',
  name: 'SKYWEAVER SPIRES',
  tagline: 'A REALM ABOVE THE CLOUDS',
  door: 'skyweaver',                                       // the id of the door in Dawnhaven that opens onto this realm (on the summit of the Crag)
  world: { size: 480, cell: 2.4 },

  // ---- a themed place ----------------------------------------------------------------------------------------------------------------------------
  theme: {
    palette: ['cream marble', 'sky blue', 'rose gold'],               // two base colours and the accent: the sky of each mood is made of them
    ground: ['skyturf', 'cliff_marble', 'cobble_sky'],
    mood: 'a windless rose dusk over a sea of cloud, waiting for the wind to come back',
    // what the props wear (kit.skin): rocks wear sage turf where they would wear moss and cream marble where they would wear stone, the pines are windswept, the meadow flowers are all windflowers
    skin: {
      textures: { moss: 'skyturf', cliff: 'cliff_marble', cliff_warm: 'cliff_marble', pine: 'pine_sky', flower_yellow: 'flower_sky', flower_blue: 'flower_sky', flower_pink: 'flower_sky' },
      palettes: {
        moss: { dark: [0.78, 0.86, 0.86], light: [1.0, 1.06, 1.04] },
        mossTop: [0.96, 1.04, 1.0],
        pine: { dark: [0.8, 0.9, 0.9], light: [1.1, 1.14, 1.1], under: [0.84, 0.9, 0.92] },
        rune: [1.15, 0.98, 0.62],                                     // (the runes of the standing stones glow gold, not the Lantern Keepers' violet)
      },
    },
  },
  environment: SKY_ENVIRONMENT,
  words: {
    goals: 'WINDBELLS', lit: 'RINGS!', finale: 'THE WINDS RETURN!',
    portalOpened: ['A PORTAL HAS OPENED', 'ABOVE THE LOOM BELL'],
    saved: ['THE SPIRES ARE SAVED', 'THANK YOU, SPYRO'],
    results: 'REALM RESTORED!', portalResults: 'THE PORTAL TO DAWNHAVEN IS OPEN',
    freeRoam: 'THE LOOM BELL\'S PORTAL LEADS TO DAWNHAVEN',
    restored: 'RESTORED  -  THE WINDS BLOW', restoredHint: 'THE PORTAL ABOVE THE LOOM BELL LEADS BACK TO DAWNHAVEN',
    icons: ['bell_on', 'bell_off'],                   // (the HUD's bells: rung, still silent)
  },
  labels: ['WEAVING THE WIND', 'RAISING THE SPIRES', 'PAINTING THE DUSK', 'SPINNING THE WHIRLWINDS', 'FILLING THE SEA'],

  // ---- the country --------------------------------------------------------------------------------------------------------------------------------
  country: { seed: 8691, mountain: { base: -28, ridge: 0, rough: 0 }, roll: { amp: 1.4, fine: 0.5 }, regions: REGIONS },
  // the sea of cloud: the surface (level.liquid, level.js) lies at the waterline out to `radius`; everything that is not an island is far below it
  sea: { name: 'THE CLOUD SEA', deepHint: 'THE CLOUDS CANNOT HOLD YOU! GLIDE, OR RIDE A WHIRLWIND', radius: 700 },
  rockLine: 90,                                                           // (high islands wear their own ground: the picker turns ground over 42 m into far rock unless a level says where)
  roadTextures: { cobble: 'cobble_sky', dirt: 'path_sky' },                // (the roads: cloudstone flags with sky-blue moss in the joints, a pale trodden path)
  farRock: 'far_sky',

  // (every road ends 8 m or more inside the edge of its island: a road of a ribbon's width would be cut off by its cliff)
  roads: [
    { id: 'gate', surface: 'cobble', width: 5, pts: [[-196, 151, 22], [-176, 148], [-146, 139, 22]], gems: { every: 9, pattern: [1, 1, 2], lateral: 2.0 } },
    { id: 'field', surface: 'dirt', width: 4.6, pts: [[-26, 66, 12], [-12, 62], [6, 54], [16, 47, 12]], gems: { every: 10, pattern: [1, 1, 2] } },
    { id: 'orchard', surface: 'cobble', width: 5, pts: [[44, 34, 34], [62, 21], [86, 9], [106, 4, 34]], gems: { every: 10, pattern: [1, 1, 1, 2] } },
    { id: 'terrace', surface: 'dirt', width: 4.2, pts: [[44, 34, 34], [62, 41], [84, 40], [100, 29], [106, 4, 34]], gems: { every: 10, pattern: [1, 1, 2] } },
    { id: 'loomway', surface: 'cobble', width: 5.5, pts: [[88, -117, 76], [92, -123], [95, -131], [90, -139], [82, -143, 76]], gems: { every: 9, pattern: [1, 1, 2] } },
  ],

  spawn: { x: -191, z: 151, yaw: PI / 2 },                  // (11 m in front of the Skygate door, facing east)

  // ---- the goals: five Windbells, each in a different kind of place -----------------------------------------------------------------------------------
  goals: [
    { id: 'gate', name: 'GATE BELL', situation: 'landing', x: -164, z: 154, hint: 'BREATHE FIRE AT THE WINDBELL TO RING IT', hintAt: [-170, 150], hintR: 9, ...BELL },
    { id: 'isle', name: 'ISLE BELL', situation: 'island', x: -73, z: 111.5, hint: 'HOP THE SLABS ACROSS THE CLOUD TO THE ISLET', hintAt: [-132, 133], hintR: 12, ...BELL },
    { id: 'field', name: 'FIELD BELL', situation: 'glide', x: -33, z: 79, hint: 'GLIDE FROM THE ISLET DOWN TO THE LOWFIELD', hintAt: [-66, 106], hintR: 9, ...BELL },
    { id: 'spire', name: 'SPIRE BELL', situation: 'lift', x: 114, z: -88, hint: 'A WHIRLWIND CARRIES YOU UP TO THE SPIRES: GLIDE OUT AT THE TOP', hintAt: [104, -4], hintR: 12, ...BELL },
    { id: 'loom', name: 'LOOM BELL', situation: 'summit', x: 93, z: -129, big: true, hint: 'THE LOOM BELL HANGS AT THE TOP OF THE WORLD. RING IT TO BRING THE WINDS BACK', hintAt: [90, -114], hintR: 14, ...BELL },
  ],
  exit: { name: 'DAWNHAVEN', tag: 'HOMEWORLD OF THE LANTERN KEEPERS', color: [1.0, 0.82, 0.94], target: 'home' },
  secrets: [
    { id: 'vault', name: 'THE WEAVERS\' VAULT' },
    { id: 'kite', name: 'THE KITE ISLE' },
    { id: 'slab', name: 'THE LONELY SLAB' },
  ],
  gems: { min: 400 },
  danger: { safeRadius: 30 },

  // ---- the air: how the islands are joined where there is no way on foot -----------------------------------------------------------------------------------
  // `kind`: glide (from `launch`, a ledge, to `land`) or lift (a whirlwind: ride it up, then glide from the top to `land`). The checker holds each link to the numbers (the reach of a glide, the
  // line of sight, a floor to land on) and works out the journey from them; the walker (tools/realm-bot.mjs) plays them. The rows of slabs are not links: they are hops, the walk map's.
  air: {
    startCells: 1200,
    links: [
      { id: 'islet-to-field', kind: 'glide', from: 'cloudisle', to: 'lowfield', launch: [-65, 107.5], land: [-38, 76] },
      { id: 'w1-to-orchard', kind: 'lift', whirl: 'w1', from: 'lowfield', to: 'orchard', land: [46, 34] },
      { id: 'w1-to-kite', kind: 'lift', whirl: 'w1', from: 'lowfield', to: 'kite', land: [6, 12] },
      { id: 'kite-to-field', kind: 'glide', from: 'kite', to: 'lowfield', launch: [8, 14], land: [14, 48] },
      { id: 'w2-to-spires', kind: 'lift', whirl: 'w2', from: 'orchard', to: 'spire1', land: [104, -26] },
      { id: 'w3-to-loom', kind: 'lift', whirl: 'w3', from: 'spire3', to: 'loom', land: [92, -120] },
    ],
  },
});
