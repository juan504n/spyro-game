// The entry of STARTER VALE in REALMS (realms.js).
import { realmEntry } from '../index.js';
import { BRIEF } from './brief.js';
import { LEVEL } from './level.js';
import { populate } from './layout.js';

export const REALM = realmEntry(BRIEF, LEVEL, populate);
