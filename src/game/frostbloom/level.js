// The level descriptor of FROSTBLOOM HOLLOW: the ground from the brief's ribbons (realm/level.js), plus the landforms the brief cannot say - the frozen glade and the Hollow, two craters walled in by
// rock - and the realm's own ground: snow everywhere the usual rules leave alone, with petals blown over it in drifts, and the Hollow's floor frozen to ice.
import { makeLevel, glade } from '../realm/index.js';
import { valueNoise, fbm } from '../../engine/textures/pix.js';
import { BRIEF, RIME_GLADE, HOLLOW } from './brief.js';

const nPetal = valueNoise(8801);

export const LEVEL = makeLevel(BRIEF, {
  landforms: (h, x, z) => glade(glade(h, x, z, RIME_GLADE), x, z, HOLLOW),
  groundRule(x, z, h, slope) {
    if (Math.hypot(x - HOLLOW.x, z - HOLLOW.z) < HOLLOW.r + 2) return ['ice', 'the Hollow\'s frozen floor'];
    if (slope < 0.4 && fbm(nPetal, x * 0.045 + 5, z * 0.045, 2) > 0.6) return ['snow_petals', 'petals blown over the snow'];
    return ['snow', 'snow'];
  },
  cliffs: { cool: 'cliff_frost', warm: 'cliff_frost' },
});
