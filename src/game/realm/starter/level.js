// The level descriptor of STARTER VALE: the ground from the brief's ribbons (realm/level.js), plus the landform the brief cannot say - the hidden glade walled in by rock.
import { makeLevel, glade } from '../index.js';
import { BRIEF, GLADE } from './brief.js';

export const LEVEL = makeLevel(BRIEF, {
  landforms: (h, x, z) => glade(h, x, z, GLADE),
});
