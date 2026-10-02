// The foundry's runtime kit, in one place (see .claude/skills/new-realm): what a generated realm imports.
export { defineBrief, ptsOf, RULES, SITUATION_IDS } from './brief.js';
export { makeCountry, regionAt, pointOn, basin, mound, dryLand, flatten, glade, ravine, lerp, smooth } from './country.js';
export { makeLevel, NO_LAKE } from './level.js';
export { makePopulate, goalsStage, exitStage, gemsStage } from './populate.js';
export { TAU, sum, faceTo, flatSpot, regionPts, along, roadAlong, roadOf, band, lampsAlong } from './helpers.js';

/** The entry of a realm in REALMS (realms.js): its identity from the brief, its level and its level script. */
export function realmEntry(brief, level, populate) {
  return { id: brief.id, kind: 'realm', name: brief.name, tagline: brief.tagline, level, populate, day: null, words: brief.words };
}
