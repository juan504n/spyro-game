// FROSTBLOOM HOLLOW: the design of the realm, written down as data before it is built (src/game/realm/brief.js has the schema and the rules a brief is held to).
//
// An endless winter has frozen the blossoms of the Hollow asleep. Five Frostblooms - flowers of ice with a flame inside - must be thawed by fire; each one that blooms brings the realm a step from
// its frozen, aurora-lit night towards a blossom dawn, and when the Heartbloom in the Hollow opens, spring returns and a ring of light carries the hero home.
//
// The country, south to north: the Thaw Gate where the hero comes out of Dawnhaven's door, a road to Glasswater (a frozen lake with a ring road round it: the loop), Rimewood to the west (a forest
// with a clearing, and a glade shut with a cracked wall), the Icefall to the east (a frozen waterfall, and the glacier behind it with the cave), and Aurora Ridge to the north, a climb in
// switchbacks to the gorge of the Hollow, which an ice gate shuts until four Frostbloom have bloomed. Five goals in five kinds of place: a landing, a clearing, an island, a cave and a crater.
import { defineBrief, ptsOf } from '../realm/brief.js';
import { FROST_ENVIRONMENT } from './environment.js';
import { PLINTH, HEART } from './glacier.js';

const DEG = Math.PI / 180;

/** Glasswater: a frozen lake with a thin place in the middle where the water shows, and an islet in it (the second goal, reached by hopping the ice floes from the south shore). */
export const LAKE = {
  x: 0, z: 34, rx: 52, rz: 36, bed: -3.6, name: 'GLASSWATER', deepHint: 'THE ICE IS THIN AND THE WATER DEEP! HOP THE FLOES',
  islets: [{ x: 2, z: 50, r: 5.5, top: 1.2 }],
};
/** A ring round the lake, `n` points at `f` times its radii, from the south point and round by the west, the north and the east (z grows south). */
const ring = (f, h, hw, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const a = (90 + (i / n) * 360) * DEG; return [LAKE.x + Math.cos(a) * LAKE.rx * f, LAKE.z + Math.sin(a) * LAKE.rz * f, h, hw]; });

/** A glade is a round floor walled in by rock, open along a strip that looks at `open` (radians from east towards south). The landforms are cut in level.js, the strips are ribbons here. */
export const at = (G, d) => [G.x + Math.cos(G.open) * d, G.z + Math.sin(G.open) * d];
/** The frozen glade: a secret off Rimewood, its way in shut with a cracked wall. */
export const RIME_GLADE = { x: -150, z: 70, r: 9, h: 5.0, wall: 14, gap: 3.2, open: -1.1 };
/** The Hollow: the crater with the Heartbloom in it, 48 m across, walled in by 24 m of rock, entered by a gorge from the south that the ice gate shuts. */
export const HOLLOW = { x: 0, z: -158, r: 24, h: 36, wall: 24, gap: 3.4, open: Math.PI / 2 };
/** where the ice gate stands: in the gorge, 4 m inside the mouth of the crater's strip */
export const GATE = { x: 0, z: -127, at: 4, yaw: 0 };
/** The Thaw Gate: a door back to Dawnhaven at the south end of the first lawn; the hero comes out of its light 11 m in front of it, facing north. */
export const DOOR = { id: 'thawgate', name: 'DAWNHAVEN', tag: 'HOMEWORLD OF THE LANTERN KEEPERS', x: 0, z: 183, yaw: Math.PI, color: [0.55, 0.85, 1.0], target: 'home' };

/**
 * The parts of the country: ribbons of open ground [x, z, ground height, half width] between the mountains that fill all the rest (realm/country.js).
 * `fall`: metres beyond a ribbon's edge until the ground has risen to the mountains. `label` names a part (debug readout, TRAVEL menu); `sealed`: shut until something is done.
 */
export const REGIONS = [
  { id: 'gate', fall: 12, label: 'THE THAW GATE', pts: [[0, 182, 3.2, 26], [0, 154, 3.2, 28]] },
  { id: 'trunk', fall: 14, pts: [[0, 154, 3.2, 14], [-4, 130, 3.4, 15], [0, 104, 3.4, 18]] },
  { id: 'ring', fall: 14, label: 'GLASSWATER', pts: ring(1.5, 3.0, 17) },
  { id: 'rimewood', fall: 14, label: 'RIMEWOOD', pts: [[-78, 34, 3.0, 16], [-104, 40, 4.2, 24], [-128, 26, 5.0, 22]] },
  { id: 'rimeglade', fall: 5, sealed: true, pts: [[...at(RIME_GLADE, RIME_GLADE.r + 24), RIME_GLADE.h, 3.6], [...at(RIME_GLADE, RIME_GLADE.r + 5.5), RIME_GLADE.h, 3.4], [RIME_GLADE.x, RIME_GLADE.z, RIME_GLADE.h, RIME_GLADE.r]] },
  { id: 'icefall', fall: 14, label: 'THE ICEFALL', pts: [[78, 34, 3.0, 16], [106, 28, 5.0, 18], [130, 14, 8.0, 14], [148, 0, 11, 14]] },
  // the plinth the glacier stands on: level ground under all its rock (glacier.js), the way into it from the Icefall's end
  { id: 'glacier', fall: 12, label: 'THE GLACIER', pts: [[150, -26, PLINTH, 30], [148, -52, PLINTH, 36]] },
  { id: 'ridge', fall: 14, label: 'AURORA RIDGE', pts: [[0, -20, 3.4, 16], [-30, -40, 7.0, 12], [12, -60, 12, 11], [-28, -80, 18, 11], [14, -98, 25, 11], [0, -112, 33, 12]] },
  { id: 'lookout', fall: 8, label: 'AURORA LOOKOUT', pts: [[12, -60, 12, 8], [30, -60, 12, 6], [52, -64, 12, 6]] },
  { id: 'hollow', fall: 6, label: 'THE HOLLOW', pts: [[...at(HOLLOW, HOLLOW.r + 24), 34, 3.6], [...at(HOLLOW, HOLLOW.r + 5.5), HOLLOW.h, 3.4], [HOLLOW.x, HOLLOW.z, HOLLOW.h, HOLLOW.r]] },
];

/** What every Frostbloom looks like (the model is models/objects/frostbloom.js): icy before it is thawed, blossom pink after; no flame over it, it glows itself. */
const BLOOM = { model: 'frostbloom', beam: { off: [0.5, 0.82, 1.0], on: [1.0, 0.74, 0.88] }, glow: [1.0, 0.72, 0.86], wisp: [0.62, 0.92, 1.0], flame: false, spark: { c0: [1.0, 0.84, 0.92, 1], c1: [1.0, 0.5, 0.76, 0] }, sparkle: [1.0, 0.82, 0.92] };

export const BRIEF = defineBrief({
  id: 'frostbloom',
  name: 'FROSTBLOOM HOLLOW',
  tagline: 'A REALM OF ICE AND BLOSSOM',
  door: 'frostbloom',                                    // the door of Dawnhaven, at the far end of the Frost Grotto
  world: { size: 408, cell: 2.4 },

  // ---- a themed place ----------------------------------------------------------------------------------------------------------------------------
  theme: {
    palette: ['ice teal', 'snow white', 'blossom pink'],             // two base colours and the accent: the sky of each mood is made of them
    ground: ['snow', 'ice', 'cliff_frost'],
    mood: 'a frozen night under the aurora, waiting for a blossom dawn',
    trials: { stone: 'cobble_frost', crystal: 'crystal_cyan', glow: [0.62, 0.92, 1.0] },     // (what its trials are made of: a ring of frosted stone and ice-blue glass)
    // what the props wear (kit.skin): rocks wear snow where they would wear moss and frost-blue stone, pines are under snow, the meadow flowers are all blossom (the palette has no yellow or blue)
    skin: {
      textures: { moss: 'snow', cliff: 'cliff_frost', cliff_warm: 'cliff_frost', pine: 'pine_snow', flower_yellow: 'flower_pink', flower_blue: 'flower_pink' },
      palettes: {
        moss: { dark: [0.84, 0.9, 1.0], light: [1.06, 1.1, 1.14] },            // (the tints that were green: snow takes a blue shadow and a white light)
        mossTop: [0.98, 1.04, 1.12],
        pine: { dark: [0.8, 0.9, 0.98], light: [1.08, 1.14, 1.14], under: [0.82, 0.94, 1.02] },
      },
    },
  },
  environment: FROST_ENVIRONMENT,
  words: {
    goals: 'FROSTBLOOMS', lit: 'THAWED!', finale: 'SPRING RETURNS!',
    portalOpened: ['A PORTAL HAS OPENED', 'ABOVE THE HEARTBLOOM'],
    saved: ['THE HOLLOW IS SAVED', 'THANK YOU, SPYRO'],
    results: 'REALM RESTORED!', portalResults: 'THE PORTAL TO DAWNHAVEN IS OPEN',
    freeRoam: 'THE HEARTBLOOM\'S PORTAL LEADS TO DAWNHAVEN',
    restored: 'RESTORED  -  SPRING IS HERE', restoredHint: 'THE PORTAL ABOVE THE HEARTBLOOM LEADS BACK TO DAWNHAVEN',
    gate: ['THE ICE GATE MELTS!', 'THE HOLLOW IS OPEN'],
    icons: ['bloom_on', 'bloom_off'],                    // (the HUD's flowers: thawed, still frozen)
  },
  labels: ['SWEEPING THE SNOW', 'PLANTING THE RIMEWOOD', 'PAINTING THE AURORA', 'RAISING THE ICEFALL', 'FREEZING GLASSWATER'],

  // ---- the country --------------------------------------------------------------------------------------------------------------------------------
  country: { seed: 6203, mountain: { base: 40, ridge: 20, rough: 10 }, regions: REGIONS },
  lake: LAKE,
  // the textures of its ground that are not the usual ones (realm/level.js hands them to the ground picker and the road meshes)
  lakeTextures: { floor: 'ice', shore: 'ice', pebbles: 'snow' },      // (what the lake's bed and edge are made of)
  roadTextures: { cobble: 'cobble_frost', dirt: 'path_snow' },        // (the roads are frosted: stone with snow in the gaps, trodden snow)
  farRock: 'far_frost',                                               // (the far mountains)

  roads: [
    { id: 'trunk', surface: 'cobble', width: 6, pts: [[0, 174], [0, 154], [-4, 130], [0, 104], [0, 88]], gems: { every: 10, pattern: [1, 1, 2], lateral: 2.2 } },
    { id: 'ring', surface: 'dirt', width: 4.6, pts: ring(1.5, 0, 0).map((p) => [p[0], p[1]]), gems: { every: 11, pattern: [1, 1, 1, 2] } },
    { id: 'rimeroad', surface: 'dirt', width: 4, pts: [[-78, 34], [-104, 40], [-114, 34]], gems: { every: 9, pattern: [1, 1, 2] } },
    { id: 'iceroad', surface: 'dirt', width: 4.6, pts: [...ptsOf(REGIONS, 'icefall'), [150, -14]], gems: { every: 10, pattern: [1, 1, 2] } },
    { id: 'ridge', surface: 'cobble', width: 4.6, pts: [...ptsOf(REGIONS, 'ridge'), [0, -128]], gems: { every: 12, pattern: [1, 2, 1, 5] } },
  ],

  spawn: { x: 0, z: 172, yaw: Math.PI },                    // (11 m in front of the Thaw Gate)

  // ---- the goals: five Frostblooms, each in a different kind of place -------------------------------------------------------------------------------
  goals: [
    { id: 'gate', name: 'GATE BLOOM', situation: 'landing', x: 14, z: 140, hint: 'BREATHE FIRE AT THE FROSTBLOOM TO THAW IT', hintAt: [8, 148], hintR: 10, ...BLOOM },
    { id: 'rime', name: 'RIMEWOOD BLOOM', situation: 'clearing', x: -122, z: 20, hint: 'A FROSTBLOOM SLEEPS IN A CLEARING OF RIMEWOOD', hintAt: [-100, 38], hintR: 14, trial: { kind: 'bells', at: [-134.5, 17], yaw: -Math.PI / 2 }, ...BLOOM },
    { id: 'glass', name: 'GLASSWATER BLOOM', situation: 'island', x: 2, z: 50, pad: false, hint: 'HOP THE ICE FLOES OUT TO THE ISLET', hintAt: [0, 76], hintR: 12, trial: { kind: 'puck', at: [4, 90], yaw: Math.PI / 2 }, ...BLOOM },
    { id: 'ice', name: 'ICEFALL BLOOM', situation: 'cave', x: HEART.x, z: HEART.z, pad: false, hint: 'A FROSTBLOOM SLEEPS IN THE ICE BEHIND THE ICEFALL', hintAt: [150, 6], hintR: 14, ...BLOOM },
    { id: 'heart', name: 'HEARTBLOOM', situation: 'crater', x: HOLLOW.x, z: HOLLOW.z, big: true, hint: 'THE HEARTBLOOM WAITS IN THE HOLLOW. LIGHT IT TO BRING BACK THE SPRING', hintAt: [0, -138], hintR: 14, trial: { kind: 'siege', at: [HOLLOW.x, HOLLOW.z], r: 11, waves: [['rime', 'rime'], ['warden', 'rime'], ['warden', 'rime', 'rime']] }, ...BLOOM },
  ],
  exit: { name: 'DAWNHAVEN', tag: 'HOMEWORLD OF THE LANTERN KEEPERS', color: [0.7, 0.88, 1.0], target: 'home' },
  gate: GATE,
  secrets: [
    { id: 'rimeglade', name: 'THE FROZEN GLADE' },
    { id: 'vault', name: 'THE ICE VAULT' },
    { id: 'lookout', name: 'AURORA LOOKOUT' },
  ],
  gems: { min: 400 },
  danger: { safeRadius: 30 },
});
