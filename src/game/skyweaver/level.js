// The level descriptor of SKYWEAVER SPIRES: the ground from the brief's ribbons (realm/level.js: islands in a sea, `brief.sea`) and the sea of cloud itself (level.liquid: water.js draws it opaque and lit,
// the clouds do not burn but they cannot hold the hero either, so any contact sets him back on the last firm ground). What the brief cannot say - the realm's own ground (turf on every island,
// marble in the tall faces) - comes in as `extras`.
import { makeLevel } from '../realm/index.js';
import { BRIEF } from './brief.js';

export const LEVEL = makeLevel(BRIEF, {
  groundRule(x, z, h) {
    if (h < -2) return ['cliff_marble', 'the fill of the country, far under the cloud: nobody sees it'];
    return ['skyturf', 'skyturf'];
  },
  cliffs: { cool: 'cliff_marble', warm: 'cliff_marble' },
  descriptor: {
    liquid: { texture: 'cloud_sea', splash: 'cloud', burnDepth: 0.1, shallow: [1.0, 1.0, 1.0], deep: [0.78, 0.84, 1.0], shimmer: [0.1, 0.1, 0.16], emissive: 0.55, tile: 34, scroll: [0.004, 0.0015] },
  },
});
