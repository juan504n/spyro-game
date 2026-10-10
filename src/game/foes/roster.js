// WHICH FOES LIVE WHERE (docs/DESIGN.md, round thirty-eight). The first Spyro games gave every homeworld's levels creatures of their own; this game does the same: a kind of foe is ONE world's, and no other
// world has it. A realm's roster is the list below; the foundry's rule `enemies.roster` holds every placed foe, every foe a trial or a Smokecaller calls and every siege wave to it, and
// tools/roster-check.mjs holds all the worlds against each other (no kind in two rosters). The only shared roster is the Guardian's Court, which is the Snuffers' own stronghold: the three
// Snuffers the game began with come to the Guardian's call.
//
//   gloaming    the Snuffers the game began with: plain, bell, thorn, and the two that came with the Vale's first trials, the Slinger and the Pilferling
//   frostbloom  the cold: the Shiverling (circles, then dashes), the Rimeling (a Snuffer in ice), the Lidwarden (the shield that turns)
//   emberfall   the forge: the Dustmole (the ash under the ground), the Fusepup (the keg), the Ramhog, and the Slag Brute (the elite the realm's hunt is after)
//   skyweaver   the wind: the Dusk Moth, the Smokecaller (the only one of the robed Snuffers: no other world has a caller), the Gale Spirit (blows the hero off a spire)
//   tideglass   the tide: the Urchin (spines), the Shellback (a crab in a shield), the Drifter (a glass jelly over the shore)
import { KINDS, KIND_IDS } from './kinds.js';

export const ROSTERS = {
  gloaming: ['basic', 'bell', 'thorn', 'thief', 'slinger'],
  frostbloom: ['shiver', 'rime', 'warden'],
  emberfall: ['mole', 'pup', 'hog', 'brute'],
  skyweaver: ['moth', 'caller', 'gale'],
  tideglass: ['urchin', 'crab', 'drifter'],
  // <roster-entries>  (tools/new-realm.mjs adds the empty roster of a new realm above this line: its own kinds are for its maker to design, and until it has them the realm's foes are not held to a roster)
};
/** the rosters that are not one world's: a stronghold where the Snuffers come together */
export const SHARED_ROSTERS = { guardian: ['basic', 'bell', 'thorn'] };

/** The kinds a world may have (null: a world with no roster, which has no foes: Dawnhaven). */
export const rosterOf = (realmId) => ROSTERS[realmId] || SHARED_ROSTERS[realmId] || null;

/** The world that owns a kind (the one whose roster names it), or null. */
export const homeOf = (kind) => { for (const id of Object.keys(ROSTERS)) if (ROSTERS[id].includes(kind)) return id; return null; };

/** The kind of the world's roster that is nearest `kind` in danger (the foe a tool or a brief that names another world's kind gets here). A world with no roster keeps the kind. */
export function foeOf(realmId, kind) {
  const R = rosterOf(realmId);
  if (!R || R.includes(kind)) return kind;
  const d = (KINDS[kind] || KINDS.basic).danger;
  return R.slice().sort((a, b) => Math.abs(KINDS[a].danger - d) - Math.abs(KINDS[b].danger - d) || KIND_IDS.indexOf(a) - KIND_IDS.indexOf(b))[0];
}

/** The foe a Smokecaller calls out of its smoke, and the hands a trial calls when it has no kind of its own in mind: the weakest of the world's roster that is a walker (never the Pilferling). */
export function summonOf(realmId) {
  const R = rosterOf(realmId);
  if (!R) return 'basic';
  return R.filter((k) => k !== 'thief' && KINDS[k].brain !== 'flee').sort((a, b) => KINDS[a].danger - KINDS[b].danger)[0] || 'basic';
}
