// The worlds of the game. A REALM is a standalone level you play through (Gloaming Vale); a HOMEWORLD is the hub you come back to between
// realms, with a portal to each of them (Dawnhaven). Each entry describes how to build one: `level` (the level definition: its own heightfield,
// roads, landmarks), `populate` (the level script that places props and the gameplay data), `day` (a fixed hour, or null when the level's own
// lanterns decide it) and the words the game says when you arrive.
import { LEVEL } from './level.js';
import { populate as populateRealm } from './levelgen/index.js';
import { HOME } from './home/level.js';
import { populateHome } from './home/layout.js';
import { REALM as FROSTBLOOM } from './frostbloom/index.js';
// <realm-imports>  (tools/new-realm.mjs adds the import of a new realm above this line)

/**
 * What a realm says over its finale, its results panel and its free roam, and what its goal objects are called. An entry of REALMS brings its own `words` (any of these keys); the rest are
 * Gloaming Vale's. `icons`: the HUD's two icons for a goal that is lit / still to light (the keys of the icon atlas, see engine/textures/ui/icons.js).
 */
export const DEFAULT_WORDS = {
  goals: 'BEACONS',                                        // what the results panel and the HUD count: "BEACONS 5 / 5"
  lit: 'LIT!',                                             // "HEARTH BEACON LIT!" over a goal that has just been lit
  finale: 'THE SUN RISES!',                                // the first banner of the finale
  portalOpened: ['A PORTAL HAS OPENED', 'ABOVE THE GREAT BEACON'],
  saved: ['GLOAMING VALE IS SAVED', 'THANK YOU, SPYRO'],
  results: 'REALM RESTORED!',
  portalResults: 'THE PORTAL TO DAWNHAVEN IS OPEN',
  freeRoam: 'THE PORTAL ABOVE THE BEACON LEADS TO DAWNHAVEN',
  restored: 'RESTORED  -  THE SUN IS UP',                  // the sub line of the banner when a restored realm is entered again
  restoredHint: 'THE PORTAL ABOVE THE GREAT BEACON LEADS BACK TO DAWNHAVEN',
  icons: ['lantern_on', 'lantern_off'],
  gate: ['THE DAWN GATE OPENS!', 'CLIMB TO THE OBSERVATORY'],     // the banner when the goals have opened the realm's gate (level.goal.gateAt goals: see Game.onBeacon)
};

export const REALMS = {
  gloaming: {
    id: 'gloaming', kind: 'realm', name: 'GLOAMING VALE', tagline: 'LANTERN KEEPERS REALM',
    level: LEVEL, populate: populateRealm, day: null,
  },
  home: {
    id: 'home', kind: 'homeworld', name: 'DAWNHAVEN', tagline: 'HOMEWORLD OF THE LANTERN KEEPERS',
    level: HOME, populate: populateHome, day: 1,
  },
  frostbloom: FROSTBLOOM,
  // <realm-entries>  (tools/new-realm.mjs adds the entry of a new realm above this line)
};

/** The realm a world id names (unknown ids fall back to the first realm, which is where the game begins). */
export const realmById = (id) => REALMS[id] || REALMS.gloaming;
