// The level descriptor of FROSTBLOOM HOLLOW: the ground from the brief's ribbons (realm/level.js), plus the landforms the brief cannot say - the frozen glade and the Hollow, two craters walled in by
// rock, and the floors of the glacier's caves - the glacier itself (a rock mass, glacier.js) and the realm's own ground: snow everywhere the usual rules leave alone, with petals blown over it in
// drifts, the Hollow's floor and the caves' frozen to ice.
import { makeLevel, glade } from '../realm/index.js';
import { valueNoise, fbm } from '../../engine/textures/pix.js';
import { BRIEF, RIME_GLADE, HOLLOW } from './brief.js';
import { GLACIER } from './glacier.js';

const nPetal = valueNoise(8801);

export const LEVEL = makeLevel(BRIEF, {
  landforms: (h, x, z) => GLACIER.landform(glade(glade(h, x, z, RIME_GLADE), x, z, HOLLOW), x, z),
  massifs: () => [GLACIER.massif()],
  groundRule(x, z, h, slope) {
    if (Math.hypot(x - HOLLOW.x, z - HOLLOW.z) < HOLLOW.r + 2) return ['ice', 'the Hollow\'s frozen floor'];
    if (GLACIER.inside(x, z)) return slope < 0.45 ? ['ice', 'inside the glacier: ice underfoot'] : ['cliff_frost', 'inside the glacier, slope > 0.45'];
    if (slope < 0.4 && fbm(nPetal, x * 0.045 + 5, z * 0.045, 2) > 0.6) return ['snow_petals', 'petals blown over the snow'];
    return ['snow', 'snow'];
  },
  cliffs: { cool: 'cliff_frost', warm: 'cliff_frost' },
});
