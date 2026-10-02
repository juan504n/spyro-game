// How Skyweaver Spires is lit and what its sky is: A, a windless dusk (a low rose-gold sun in the south-west behind the hero as he climbs, a cool violet fill from the north-east, a sky that runs from
// indigo through violet and rose to a peach horizon, and a sea of cloud the colour of the fog, pink-lavender, under it) and B, a bright morning (the same sun risen to a golden-white forenoon in a blue
// sky, white cloud, the sea white and pale blue). Each Windbell that rings moves the realm along from A to B (the day: realms.js, systems/beacons.js): the winds that fell slack have come back.
// Two or three base hues in each: cream marble, sky blue and rose-gold, the gold the accent. (Shape: engine/lighting.js DEFAULT_ENVIRONMENT.)
import { dirAzEl } from '../../engine/lighting.js';

export const SKY_ENVIRONMENT = {
  name: 'skyweaver',
  envs: [
    { // A: windless dusk
      name: 'windless dusk',
      lights: [
        { dir: dirAzEl(135, 7), color: [1.0, 0.74, 0.62], shadow: true },         // the sun, rose-gold and low in the south-west: long shadows to the north-east
        { dir: dirAzEl(315, 24), color: [0.2, 0.24, 0.46], shadow: false },        // a cool violet fill from the north-east, from the sky the hero climbs towards
      ],
      sky: [0.42, 0.4, 0.58],
      ground: [0.4, 0.36, 0.46],
    },
    { // B: bright morning
      name: 'bright morning',
      lights: [
        { dir: dirAzEl(150, 36), color: [1.1, 1.02, 0.88], shadow: true },        // a golden-white sun high in the south
      ],
      sky: [0.62, 0.7, 0.86],
      ground: [0.56, 0.54, 0.58],
    },
  ],
  sky: [
    { zenith: [0.1, 0.1, 0.3], high: [0.26, 0.2, 0.5], mid: [0.56, 0.36, 0.64], low: [0.88, 0.54, 0.66], horizon: [1.0, 0.76, 0.66], fog: [0.62, 0.5, 0.72], glow: [1.0, 0.64, 0.5], cloudTop: [0.62, 0.52, 0.8], cloudBot: [1.0, 0.66, 0.62], ridge: [0.56, 0.46, 0.72] },
    { zenith: [0.26, 0.5, 0.92], high: [0.46, 0.7, 0.97], mid: [0.76, 0.88, 1.0], low: [0.98, 0.94, 0.88], horizon: [1.0, 0.92, 0.74], fog: [0.88, 0.92, 1.0], glow: [1.0, 0.88, 0.6], cloudTop: [1.0, 1.0, 1.0], cloudBot: [0.96, 0.92, 0.98], ridge: [0.74, 0.82, 0.96] },
  ],
  sun: { az: 135, el: [-4, 34] },
  moon: { az: 300, el: 22 },
};
