// The worlds of the game. A REALM is a standalone level you play through (Gloaming Vale); a HOMEWORLD is the hub you come back to between
// realms, with a portal to each of them (Dawnhaven). Each entry describes how to build one: `level` (the level definition: its own heightfield,
// roads, landmarks), `populate` (the level script that places props and the gameplay data), `day` (a fixed hour, or null when the level's own
// lanterns decide it) and the words the game says when you arrive.
import { LEVEL } from './level.js';
import { populate as populateRealm } from './levelgen/index.js';
import { HOME } from './home/level.js';
import { populateHome } from './home/layout.js';

export const REALMS = {
  gloaming: {
    id: 'gloaming', kind: 'realm', name: 'GLOAMING VALE', tagline: 'LANTERN KEEPERS REALM',
    level: LEVEL, populate: populateRealm, day: null,
  },
  home: {
    id: 'home', kind: 'homeworld', name: 'DAWNHAVEN', tagline: 'HOMEWORLD OF THE LANTERN KEEPERS',
    level: HOME, populate: populateHome, day: 1,
  },
};

/** The realm a world id names (unknown ids fall back to the first realm, which is where the game begins). */
export const realmById = (id) => REALMS[id] || REALMS.gloaming;
