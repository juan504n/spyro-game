// EMBERFALL CRAGS: the design of the realm, written down as data before it is built (src/game/realm/brief.js has the schema and the rules a brief is held to).
//
// The forges of the crags have gone cold. Five Emberstones - black stones with a fire in them, set where the old smiths kindled the realm - must be lit by dragon fire; each one that burns brings
// the crags a step from their ash-red dusk towards a golden forge glow, and when the Heartforge in the caldera of the mountain is lit again the forges burn, and a ring of light carries the hero home.
//
// The country, west to east: the Forge Gate where the hero comes out of Dawnhaven's door, the Cinder Flats (the first stone; the Cinder Grove, a clearing of obsidian spires, lies off them to the north, and an ash glade shut
// with a cracked wall to the south), and then the Ember Rift, a gorge of lava running north and south with a stack of basalt standing in it. The Basalt Stair climbs to the rim of the rift, and from the rim the hero
// glides across the lava to the stack, where the third stone burns; from the stack another glide takes him down to the Anvil Plateau on the far bank (the Ashway round the south end of the rift and the North Causeway
// round the north end are the long ways). On the plateau, in the bastion of Mount Emberfall, is the Maw: a stone dragon's mouth, shut by a ward of fire until three stones burn. Behind it the Smelter, a cave through the
// mountain: the Furnace, where the fourth stone burns under a skylight, a balcony with a secret, and a tunnel out of the north side to the Cinder Gorge, which climbs in switchbacks to the caldera, where the Heartforge is.
// Five goals in five kinds of place: a landing, a clearing, a glide, a cave and a crater.
import { defineBrief, ptsOf } from '../realm/brief.js';
import { EMBER_ENVIRONMENT } from './environment.js';
import { PLINTH, FURNACE } from './smelter.js';

const PI = Math.PI;

/** The Ember Rift: a lake of lava a long way from end to end, with a stack of basalt in it (the islet: the third goal, reached by gliding from the rim). Falling in is fatal (the lake is deep): the hero comes back to the last firm ground. */
export const ANVIL = { x: -4, z: -12, r: 15, top: 15 };
export const LAKE = { x: -4, z: 4, rx: 28, rz: 74, bed: -5, name: 'THE EMBER RIFT', deepHint: 'THE LAVA BURNS! GLIDE ACROSS THE RIFT AND DO NOT FALL', islets: [ANVIL] };

/** A glade is a round floor walled in by rock, open along a strip that looks at `open` (radians from east towards south). The landforms are cut in level.js, the strips are ribbons here. */
export const at = (G, d) => [G.x + Math.cos(G.open) * d, G.z + Math.sin(G.open) * d];
/** The ash glade: a secret off the Cinder Flats, its way in shut with a cracked wall. */
export const ASH_GLADE = { x: -150, z: 104, r: 9, h: 3.6, wall: 14, gap: 3.2, open: -PI / 2 };
/** The caldera: the crater of the mountain with the Heartforge in it, 48 m across, walled in by 22 m of rock, entered by a gorge from the south. */
export const CALDERA = { x: 150, z: -170, r: 24, h: 36, wall: 22, gap: 3.4, open: PI / 2 };
/** where the ward of fire stands: in the mouth of the Maw, the dragon's teeth either side (a gap 6.8 m wide, the width of the tunnel) */
export const GATE = { x: 106, z: 20, at: 3, yaw: PI / 2 };
/** The Forge Gate: a door back to Dawnhaven at the west end of the first plain; the hero comes out of its light 11 m in front of it, facing east. */
export const DOOR = { id: 'forgegate', name: 'DAWNHAVEN', tag: 'HOMEWORLD OF THE LANTERN KEEPERS', x: -186, z: 36, yaw: PI / 2, color: [1.0, 0.58, 0.28], target: 'home' };

/**
 * The parts of the country: ribbons of open ground [x, z, ground height, half width] between the mountains that fill all the rest (realm/country.js).
 * `fall`: metres beyond a ribbon's edge until the ground has risen to the mountains. `label` names a part (debug readout, TRAVEL menu); `sealed`: shut until something is done.
 */
export const REGIONS = [
  { id: 'gate', fall: 12, label: 'THE FORGE GATE', pts: [[-190, 36, 3.2, 24], [-158, 36, 3.2, 26]] },
  { id: 'flats', fall: 14, label: 'THE CINDER FLATS', pts: [[-158, 36, 3.2, 28], [-128, 32, 3.4, 32], [-106, 28, 3.6, 14], [-96, 26, 3.8, 10]] },
  { id: 'grove', fall: 12, label: 'THE CINDER GROVE', pts: [[-118, 10, 3.6, 16], [-126, -22, 4.4, 20], [-124, -54, 5.0, 24]] },
  { id: 'ashglade', fall: 5, sealed: true, pts: [[...at(ASH_GLADE, ASH_GLADE.r + 24), ASH_GLADE.h, 3.6], [...at(ASH_GLADE, ASH_GLADE.r + 5.5), ASH_GLADE.h, 3.4], [ASH_GLADE.x, ASH_GLADE.z, ASH_GLADE.h, ASH_GLADE.r]] },
  { id: 'stair', fall: 14, label: 'THE BASALT STAIR', pts: [[-90, 24, 3.8, 6], [-66, 16, 9, 6], [-90, 6, 14, 6], [-62, -2, 21, 6], [-50, -8, 23, 8]] },
  { id: 'rim', fall: 12, label: 'THE BASALT RIM', pts: [[-48, -6, 23, 16], [-48, -24, 24, 16], [-50, -60, 23, 14], [-62, -92, 18, 10], [-50, -114, 12, 12]] },
  { id: 'northway', fall: 14, label: 'THE NORTH CAUSEWAY', pts: [[-50, -114, 12, 12], [-20, -126, 10, 14], [20, -124, 8, 16], [56, -108, 6.5, 18], [84, -92, 6, 20]] },
  { id: 'ashway', fall: 14, label: 'THE ASHWAY', pts: [[-90, 34, 3.7, 12], [-86, 56, 3.6, 15], [-66, 86, 3.4, 16], [-34, 108, 3.2, 16], [-4, 118, 3.2, 16], [30, 112, 4, 16], [58, 90, 5, 16], [58, 56, 6, 18]] },
  { id: 'lookout', fall: 8, label: 'THE LOOKOUT TRAIL', pts: [[-40, 108, 3.4, 6], [-54, 128, 9, 6], [-46, 150, 14, 8], [-46, 162, 14, 9]] },
  { id: 'shelf', fall: 14, label: 'THE ANVIL PLATEAU', pts: [[58, 56, PLINTH, 24], [56, 20, PLINTH, 28], [58, -20, PLINTH, 28], [70, -52, PLINTH, 26], [82, -78, PLINTH, 22], [84, -92, PLINTH, 20]] },
  { id: 'forecourt', fall: 12, label: 'THE MAW', pts: [[56, 20, PLINTH, 22], [84, 20, PLINTH, 18], [100, 20, PLINTH, 14]] },
  // the plinth the mountain stands on: level ground under all its rock (smelter.js)
  { id: 'plinth', fall: 12, pts: [[104, 20, PLINTH, 12], [132, 24, PLINTH, 30], [156, 24, PLINTH, 42], [160, -8, PLINTH, 34], [190, 34, PLINTH, 26]] },
  { id: 'gorge', fall: 14, label: 'THE CINDER GORGE', pts: [[152, -38, PLINTH, 10], [124, -56, 11, 9], [178, -74, 17, 9], [124, -92, 23, 9], [176, -108, 29, 9], [150, -122, 34, 12]] },
  { id: 'caldera', fall: 6, label: 'THE CALDERA', pts: [[...at(CALDERA, CALDERA.r + 24), 34, 3.6], [...at(CALDERA, CALDERA.r + 5.5), CALDERA.h, 3.4], [CALDERA.x, CALDERA.z, CALDERA.h, CALDERA.r]] },
];

/** What every Emberstone looks like (the model is models/objects/emberstone.js): a black stone with a cold fire in it before it is lit, a living flame after; no flame over it, it burns itself. */
const STONE = { model: 'emberstone', beam: { off: [0.45, 0.2, 0.14], on: [1.0, 0.62, 0.22] }, glow: [1.0, 0.55, 0.2], wisp: [1.0, 0.45, 0.2], flame: false, spark: { c0: [1.0, 0.86, 0.5, 1], c1: [1.0, 0.36, 0.1, 0] }, sparkle: [1.0, 0.7, 0.35] };

export const BRIEF = defineBrief({
  id: 'emberfall',
  name: 'EMBERFALL CRAGS',
  tagline: 'A REALM OF EMBERS AND STONE',
  door: 'emberfall',                                    // the door of Dawnhaven, in the forge at the head of the Ember Canyon
  world: { size: 432, cell: 2.4 },

  // ---- a themed place ----------------------------------------------------------------------------------------------------------------------------
  theme: {
    palette: ['basalt black', 'ash grey', 'ember orange'],            // two base colours and the accent: the sky of each mood is made of them
    ground: ['ash', 'cinder', 'cliff_basalt'],
    mood: 'an ash-red dusk over cold forges, waiting for the fire to come back',
    trials: { stone: 'cobble_ember', crystal: 'crystal_ember', glow: [1.0, 0.62, 0.28] },        // (what its trials are made of: blackened stone and ember glass)
    // what the props wear (kit.skin): rocks wear ash where they would wear moss and bare basalt where they would wear stone, the pines are charred, the meadow flowers are all fire lilies
    skin: {
      textures: { moss: 'ash', cliff: 'cliff_basalt_bare', cliff_warm: 'cliff_basalt_bare', pine: 'pine_char', flower_yellow: 'flower_ember', flower_blue: 'flower_ember', flower_pink: 'flower_ember' },
      palettes: {
        moss: { dark: [0.52, 0.48, 0.46], light: [0.78, 0.72, 0.68] },         // (the tints that were green: ash is a dull grey that takes the sun's red: it must not read as snow)
        mossTop: [0.74, 0.7, 0.66],
        pine: { dark: [0.8, 0.74, 0.72], light: [1.12, 1.04, 0.96], under: [0.82, 0.74, 0.7] },
        rune: [1.25, 0.62, 0.2],                                                // (the runes of the standing stones burn orange, not the Lantern Keepers' violet)
      },
    },
  },
  environment: EMBER_ENVIRONMENT,
  words: {
    goals: 'EMBERSTONES', lit: 'LIT!', finale: 'THE FORGES BURN AGAIN!',
    portalOpened: ['A PORTAL HAS OPENED', 'ABOVE THE HEARTFORGE'],
    saved: ['THE CRAGS ARE SAVED', 'THANK YOU, SPYRO'],
    results: 'REALM RESTORED!', portalResults: 'THE PORTAL TO DAWNHAVEN IS OPEN',
    freeRoam: 'THE HEARTFORGE\'S PORTAL LEADS TO DAWNHAVEN',
    restored: 'RESTORED  -  THE FORGES BURN', restoredHint: 'THE PORTAL ABOVE THE HEARTFORGE LEADS BACK TO DAWNHAVEN',
    gate: ['THE MAW OPENS!', 'THE MOUNTAIN IS OPEN'],
    icons: ['ember_on', 'ember_off'],                   // (the HUD's stones: lit, still cold)
  },
  labels: ['SWEEPING THE ASH', 'KINDLING THE GROVE', 'PAINTING THE DUSK', 'CASTING THE ANVIL', 'POURING THE RIFT'],

  // ---- the country --------------------------------------------------------------------------------------------------------------------------------
  country: { seed: 7417, mountain: { base: 40, ridge: 10, rough: 8, margin: 24 }, regions: REGIONS },
  lake: LAKE,
  // the textures of its ground that are not the usual ones (realm/level.js hands them to the ground picker and the road meshes)
  lakeTextures: { floor: 'cinder', shore: 'cinder', pebbles: 'ash' },      // (what the lake's bed and edge are made of)
  roadTextures: { cobble: 'cobble_ember', dirt: 'path_ash' },             // (the roads are scorched: basalt cobbles with embers in the gaps, trodden ash)
  farRock: 'far_ember',                                                    // (the far mountains)

  roads: [
    { id: 'trunk', surface: 'cobble', width: 6, pts: [[-182, 36], [-158, 36], [-124, 32], [-90, 24]], gems: { every: 10, pattern: [1, 1, 2], lateral: 2.2 } },
    { id: 'groveroad', surface: 'dirt', width: 4, pts: [[-124, 32], [-118, 10], [-126, -22], [-124, -40]], gems: { every: 9, pattern: [1, 1, 2] } },
    { id: 'stair', surface: 'dirt', width: 4.6, pts: ptsOf(REGIONS, 'stair'), gems: { every: 10, pattern: [1, 1, 2] } },
    { id: 'rim', surface: 'dirt', width: 4.6, pts: [[-48, -6], [-48, -24], [-50, -60], [-62, -92], [-50, -114]], gems: { every: 11, pattern: [1, 1, 1, 2] } },
    { id: 'northway', surface: 'dirt', width: 4.6, pts: ptsOf(REGIONS, 'northway'), gems: { every: 12, pattern: [1, 2, 1, 5] } },
    { id: 'lookoutroad', surface: 'dirt', width: 4, pts: [[-36, 108], [-54, 128], [-48, 142]], gems: { every: 9, pattern: [1, 1, 2] } },
    { id: 'ashway', surface: 'dirt', width: 4.6, pts: [[-90, 24], ...ptsOf(REGIONS, 'ashway')], gems: { every: 11, pattern: [1, 1, 1, 2] } },
    { id: 'shelf', surface: 'dirt', width: 4.6, pts: ptsOf(REGIONS, 'shelf'), gems: { every: 11, pattern: [1, 1, 2] } },
    { id: 'forecourt', surface: 'cobble', width: 6, pts: [[56, 20], [84, 20], [96, 20]], gems: { every: 9, pattern: [1, 1, 2] } },
    { id: 'gorge', surface: 'dirt', width: 4.6, pts: [...ptsOf(REGIONS, 'gorge'), [150, -142]], gems: { every: 12, pattern: [1, 2, 1, 5] } },
  ],

  spawn: { x: -175, z: 36, yaw: PI / 2 },                   // (11 m in front of the Forge Gate, facing east)

  // ---- the goals: five Emberstones, each in a different kind of place -------------------------------------------------------------------------------
  goals: [
    { id: 'gate', name: 'FORGE STONE', situation: 'landing', x: -146, z: 28, hint: 'BREATHE FIRE AT THE EMBERSTONE TO LIGHT IT', hintAt: [-156, 34], hintR: 10, ...STONE },
    { id: 'grove', name: 'GROVE STONE', situation: 'clearing', x: -124, z: -56, hint: 'AN EMBERSTONE STANDS IN A CLEARING OF THE CINDER GROVE', hintAt: [-124, -34], hintR: 14, trial: { kind: 'wisps', at: [-124, -41], r: 4.4 }, ...STONE },
    { id: 'anvil', name: 'ANVIL STONE', situation: 'glide', x: ANVIL.x, z: ANVIL.z, pad: false, hint: 'GLIDE FROM THE RIM TO THE STACK IN THE LAVA', hintAt: [-58, 4], hintR: 14, trial: { kind: 'rings', at: [-46, -30], toward: [ANVIL.x, ANVIL.z], len: 28, pad: false }, ...STONE },
    { id: 'smelter', name: 'SMELTER STONE', situation: 'cave', x: FURNACE.x, z: FURNACE.z, pad: false, hint: 'THE FURNACE: AN EMBERSTONE BURNS COLD UNDER THE SKYLIGHT', hintAt: [140, 24], hintR: 14, trial: { kind: 'mirrors', at: [84, 24], w: 4, h: 4, k: 2 }, ...STONE },
    { id: 'heart', name: 'HEARTFORGE', situation: 'crater', x: CALDERA.x, z: CALDERA.z, big: true, hint: 'THE HEARTFORGE WAITS IN THE CALDERA. LIGHT IT TO BRING THE FORGES BACK', hintAt: [150, -146], hintR: 14, trial: { kind: 'plates', at: [142, -174], r: 5.2 }, ...STONE },
  ],
  exit: { name: 'DAWNHAVEN', tag: 'HOMEWORLD OF THE LANTERN KEEPERS', color: [1.0, 0.7, 0.4], target: 'home' },
  gate: GATE,
  secrets: [
    { id: 'ashglade', name: 'THE ASH GLADE' },
    { id: 'lookout', name: 'THE EMBER LOOKOUT' },
    { id: 'balcony', name: 'THE SMELTER BALCONY' },
  ],
  gems: { min: 400 },
  danger: { safeRadius: 30 },
});
