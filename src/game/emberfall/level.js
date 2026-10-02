// The level descriptor of EMBERFALL CRAGS: the ground from the brief's ribbons (realm/level.js), plus the landforms the brief cannot say - the ash glade and the caldera, two craters walled in by
// rock, and the floors of the Smelter's caves - the mountain itself (a rock mass, smelter.js), the realm's own ground (ash everywhere the usual rules leave alone, with drifts of cinder in it, the
// caldera's floor and the caves' scorched to cinder) and the lava of the Ember Rift (the lake of the brief).
import { makeLevel, glade } from '../realm/index.js';
import { valueNoise, fbm } from '../../engine/textures/pix.js';
import { BRIEF, ASH_GLADE, CALDERA } from './brief.js';
import { SMELTER } from './smelter.js';

const nCinder = valueNoise(9101);

export const LEVEL = makeLevel(BRIEF, {
  landforms: (h, x, z) => SMELTER.landform(glade(glade(h, x, z, ASH_GLADE), x, z, CALDERA), x, z),
  massifs: () => [SMELTER.massif()],
  groundRule(x, z, h, slope) {
    if (Math.hypot(x - CALDERA.x, z - CALDERA.z) < CALDERA.r + 2) return ['cinder', 'the caldera\'s scorched floor'];
    if (SMELTER.inside(x, z)) return slope < 0.45 ? ['cinder', 'inside the Smelter: scorched stone underfoot'] : ['cliff_basalt_bare', 'inside the Smelter, slope > 0.45'];
    if (slope < 0.4 && fbm(nCinder, x * 0.045 + 5, z * 0.045, 2) > 0.6) return ['cinder', 'drifts of cinder over the ash'];
    return ['ash', 'ash'];
  },
  cliffs: { cool: 'cliff_basalt_bare', warm: 'cliff_basalt_bare' },
  descriptor: {
    // the lake of the brief is lava: water.js draws it self-lit with the lava texture, the splash is sparks (game.js), and the dusk's fireflies are embers (systems/ambient.js)
    liquid: { texture: 'lava', splash: 'lava', burnDepth: 0.2, shallow: [1.0, 0.95, 0.85], deep: [0.82, 0.62, 0.55], shimmer: [0.18, 0.09, 0.03], emissive: 1, tile: 9, scroll: [0.012, 0.005] },
    ambient: { dusk: 'ember' },
  },
});
