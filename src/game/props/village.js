// Village / architecture scenery (owned by the architecture-props artist).
// Export VILLAGE = { name: { fn, size, note, defaults?, anchors? } }.  Every fn(kit, { x, z, rot = 0, scale = 1, y?, ...params }).
//
// Conventions: local origin = ground centre, +Y up, +Z = FRONT (door / approach side).  Anchors are LOCAL-space points
// the game rotates/translates with the placement.  See village/*.js for the individual props.
import { HOUSES } from './village/houses.js';
import { LANDMARKS } from './village/landmarks.js';
import { TOWERS } from './village/towers.js';
import { STRUCTURES } from './village/structures.js';
import { SMALL } from './village/small.js';
import { EXTRAS } from './village/extras.js';
import { REALM } from './village/realm.js';
import { makeDev } from './village/dev.js';

const CORE = {
  ...HOUSES,
  ...LANDMARKS,
  ...TOWERS,
  ...STRUCTURES,
  ...SMALL,
  ...EXTRAS,
  ...REALM,
};

const wantDev = typeof location !== 'undefined' && /[?&]vdev\b/.test(location.search);
export const VILLAGE = wantDev ? { ...CORE, ...makeDev(CORE) } : CORE;
