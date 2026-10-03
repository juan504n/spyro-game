// The entry of TIDEGLASS REACH in REALMS (realms.js).
import { realmEntry } from '../realm/index.js';
import { BRIEF } from './brief.js';
import { LEVEL } from './level.js';
import { populate } from './layout.js';

export const REALM = realmEntry(BRIEF, LEVEL, populate);
