// The entry of THE GUARDIAN'S COURT in REALMS (realms.js). A world of its own, kind 'arena': a court with a fight in it, not a country with goals to find (so the foundry's rules for a realm are not
// asked of it; tools/guardian-check.mjs holds it to its own).
import { LEVEL } from './level.js';
import { populate } from './layout.js';

export const REALM = {
  id: 'guardian', kind: 'arena', name: "THE GUARDIAN'S COURT", tagline: 'WHERE THE WARDEN KEEPS THE DAWN',
  level: LEVEL, populate, day: null,
  words: {
    goals: 'LANTERNS', lit: 'LIT!', finale: 'THE GUARDIAN IS FREE!',
    portalOpened: ['THE WAY HOME IS OPEN', 'THE DOOR OF DAWNHAVEN'],
    saved: ['THE LANTERNS BURN', 'THANK YOU, SPYRO'],
    results: 'THE GUARDIAN IS FREE!', portalResults: 'THE DOOR TO DAWNHAVEN IS OPEN',
    freeRoam: 'THE DOOR AT THE FOOT OF THE GORGE LEADS HOME', restored: 'FREE  -  ITS LANTERNS BURN', restoredHint: 'THE DOOR AT THE FOOT OF THE GORGE LEADS BACK TO DAWNHAVEN',
    icons: ['lantern_on', 'lantern_off'],
  },
};
