// STARTER VALE: the brief every new realm starts from (tools/new-realm.mjs copies this folder, renamed). It is a small, complete realm - a green valley under a dusk sky, a lantern at the landing,
// one on an islet in the mere, the great one at the top of a ridge - written the way every realm's brief is: identity, the sky it lives under, a country of parts joined by roads, goals each in
// a different kind of place, the secrets worth leaving the road for. A new realm replaces all of it with its own design; `waive` lists what this one does not do yet (each line is a to-do:
// the checker, tools/realm-check.mjs, prints it on every run until it is deleted).
import { defineBrief, ptsOf } from '../brief.js';
import { DEFAULT_ENVIRONMENT } from '../../../engine/lighting.js';

/** The secret glade: a round floor walled in by rock, open along a strip that looks east towards the meadow, the strip shut by a cracked wall (layout.js). The landform is cut in level.js. */
export const GLADE = { x: -56, z: 112, r: 9, h: 4.4, wall: 14, gap: 3.2, open: 0 };
const gladeAt = (d) => [GLADE.x + Math.cos(GLADE.open) * d, GLADE.z + Math.sin(GLADE.open) * d];

/**
 * The parts of the country, south to north: ribbons of open ground [x, z, ground height, half width] between the mountains that fill all the rest (realm/country.js). `fall`: how many
 * metres beyond a ribbon's edge the ground has risen to the mountains. `label` names the part in the debug readout; `sealed` marks a part that is shut (the walk check skips it).
 */
export const REGIONS = [
  { id: 'landing', fall: 12, label: 'THE LANDING', pts: [[0, 166, 3.4, 22], [2, 146, 3.4, 22]] },
  { id: 'meadow', fall: 14, label: 'THE MEADOW', pts: [[2, 146, 3.4, 14], [-8, 124, 3.8, 16], [8, 104, 4.2, 16], [2, 88, 4.0, 16]] },
  { id: 'glade', fall: 5, sealed: true, pts: [[...gladeAt(GLADE.r + 24), GLADE.h, 3.6], [...gladeAt(GLADE.r + 5.5), GLADE.h, 3.4], [GLADE.x, GLADE.z, GLADE.h, GLADE.r]] },
  { id: 'shore', fall: 14, label: 'THE MERE', pts: [[2, 88, 4.0, 16], [-14, 66, 3.2, 30], [-8, 44, 3.0, 34], [-26, 18, 4.6, 16]] },
  { id: 'ridge', fall: 14, label: 'THE RIDGE', pts: [[-26, 18, 4.6, 12], [26, -4, 10, 11], [-12, -28, 16, 11], [30, -50, 23, 11], [-10, -72, 31, 11], [28, -94, 40, 11], [-6, -108, 50, 11], [2, -132, 58, 16]] },
  { id: 'lookout', fall: 8, label: 'THE LOOKOUT', pts: [[30, -50, 23, 8], [46, -52, 23, 6], [62, -54, 23, 6]] },
];

export const BRIEF = defineBrief({
  id: 'starter',
  name: 'STARTER VALE',
  tagline: 'A REALM TO BEGIN FROM',
  door: 'starter',                                       // the id of the door in Dawnhaven that opens onto this realm
  world: { size: 384, cell: 2.4 },

  // ---- a themed place ----------------------------------------------------------------------------------------------------------------------------
  theme: {
    palette: ['moss green', 'cobble grey', 'dusk violet'],       // what the place is made of: two or three base colours, accents on top
    ground: ['grass_a', 'dirt', 'sand'],                          // the ground textures it uses
    mood: 'a green valley at dusk, waiting for its sunrise',
  },
  // how the realm is lit and what its sky is, at day 0 (before its goals are lit) and day 1 (after): this one borrows Gloaming Vale's moonlit twilight and daybreak. A realm of its own writes
  // its own (engine/lighting.js DEFAULT_ENVIRONMENT shows the shape: two baked light states, two sky palettes, where the sun and the moon stand).
  environment: DEFAULT_ENVIRONMENT,
  words: {
    saved: ['STARTER VALE IS SAVED', 'THANK YOU, SPYRO'],
    portalOpened: ['A PORTAL HAS OPENED', 'ABOVE THE GREAT LANTERN'],
    portalResults: 'THE PORTAL TO DAWNHAVEN IS OPEN',
    freeRoam: 'THE PORTAL ABOVE THE LANTERN LEADS TO DAWNHAVEN',
    restoredHint: 'THE PORTAL ABOVE THE GREAT LANTERN LEADS BACK TO DAWNHAVEN',
  },
  labels: ['SWEEPING THE LANDING', 'PLANTING THE MEADOW', 'PAINTING THE DUSK', 'RAISING THE RIDGE', 'FILLING THE MERE'],

  // ---- the country ------------------------------------------------------------------------------------------------------------------------------
  country: { seed: 9001, mountain: { base: 34, ridge: 16, rough: 10 }, regions: REGIONS },
  lake: { x: 8, z: 46, rx: 26, rz: 20, bed: -3.4, name: 'THE MERE', deepHint: 'THE MERE IS TOO DEEP! HOP THE STONES', islets: [{ x: -2, z: 46, r: 4.5, top: 1.0 }] },

  // the roads run along the ribbons' lines (a road is where the way is plain; `gems` lays the trail of gems that leads along it)
  roads: [
    { id: 'main', surface: 'cobble', width: 6, pts: [[0, 162], [2, 146], [-6, 126], [6, 106], [2, 90]], gems: { every: 10, pattern: [1, 1, 2], lateral: 2.2 } },
    { id: 'shore', surface: 'dirt', width: 4.6, pts: [[2, 90], [-20, 76], [-34, 56], [-36, 34], [-26, 18]], gems: { every: 9, pattern: [1, 1, 1, 2] } },
    { id: 'ridge', surface: 'dirt', width: 4.6, pts: ptsOf(REGIONS, 'ridge'), gems: { every: 12, pattern: [1, 2, 1, 5] } },
  ],

  spawn: { x: 0, z: 156, yaw: Math.PI },                 // (yaw PI looks north, -z)

  // ---- the goals: the lanterns of the realm, each in a different kind of place (realm/situations.js says how each is checked) -----------------------------
  goals: [
    { id: 'first', name: 'FIRST LANTERN', situation: 'landing', x: 12, z: 132, hint: 'BREATHE FIRE AT THE LANTERN TO LIGHT IT', hintAt: [8, 140], hintR: 9 },
    { id: 'isle', name: 'ISLE LANTERN', situation: 'island', x: -2, z: 46, pad: false, hint: 'HOP THE STONES OUT TO THE ISLE', hintAt: [-24, 46], hintR: 12 },
    { id: 'peak', name: 'GREAT LANTERN', situation: 'summit', x: 2, z: -132, big: true, hint: 'THE LAST LANTERN WAITS AT THE TOP OF THE RIDGE', hintAt: [-4, -112], hintR: 14 },
  ],
  // the ring of light over the last goal: lit, it opens a way out of the realm
  exit: { name: 'DAWNHAVEN', tag: 'HOMEWORLD OF THE LANTERN KEEPERS', color: [0.78, 0.62, 1.0], target: 'home' },
  secrets: [
    { id: 'isle', name: 'THE ISLET' },
    { id: 'glade', name: 'THE HIDDEN GLADE' },
    { id: 'ledge', name: 'THE LOOKOUT' },
  ],
  gems: { min: 400 },
  danger: { safeRadius: 30 },

  // what this realm does not do yet: each line is a to-do, printed by the checker until it is deleted
  waive: [
    ['design.loops', 'one road, start to finish: add a second way (a ring round the mere, a shortcut over the ridge) and delete this line'],
  ],
});
