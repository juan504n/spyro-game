// How Emberfall Crags is lit and what its sky is: A, an ember dusk (a low red sun going down in the west behind the hero as he walks east, a warm glow thrown back from the lava on every face
// that looks at the volcano, a sky that runs from near-black violet through ash-red to a burning horizon) and B, a forge glow (the same sun risen to a golden afternoon, ash-pink cloud and an
// amber horizon). Each Emberstone that is lit moves the realm along from A to B (the day: realms.js, systems/beacons.js). Two or three base hues in each: basalt black, ash grey and ember orange,
// the glow colour the accent. (Shape: engine/lighting.js DEFAULT_ENVIRONMENT.)
import { dirAzEl } from '../../engine/lighting.js';

export const EMBER_ENVIRONMENT = {
  name: 'emberfall',
  envs: [
    { // A: ember dusk
      name: 'ember dusk',
      lights: [
        { dir: dirAzEl(200, 9), color: [1.0, 0.64, 0.42], shadow: true },        // the sun, red and low in the west: long shadows to the east
        { dir: dirAzEl(20, 28), color: [0.36, 0.17, 0.12], shadow: false },       // the lava's glow thrown back from the east on every face that looks at the volcano
      ],
      sky: [0.37, 0.3, 0.36],
      ground: [0.3, 0.23, 0.22],
    },
    { // B: forge glow
      name: 'forge glow',
      lights: [
        { dir: dirAzEl(195, 32), color: [1.12, 0.94, 0.72], shadow: true },     // a golden sun in the west, high enough to light the crags
      ],
      sky: [0.6, 0.5, 0.48],
      ground: [0.5, 0.4, 0.32],
    },
  ],
  sky: [
    { zenith: [0.07, 0.03, 0.08], high: [0.22, 0.07, 0.1], mid: [0.52, 0.15, 0.1], low: [0.86, 0.34, 0.12], horizon: [1.0, 0.58, 0.22], fog: [0.36, 0.13, 0.1], glow: [1.0, 0.42, 0.12], cloudTop: [0.3, 0.2, 0.2], cloudBot: [0.95, 0.46, 0.2], ridge: [0.24, 0.1, 0.1] },
    { zenith: [0.3, 0.38, 0.7], high: [0.58, 0.58, 0.82], mid: [0.96, 0.7, 0.62], low: [1.0, 0.66, 0.36], horizon: [1.0, 0.8, 0.46], fog: [0.88, 0.66, 0.5], glow: [1.0, 0.78, 0.36], cloudTop: [1.0, 0.94, 0.88], cloudBot: [1.0, 0.76, 0.5], ridge: [0.62, 0.42, 0.38] },
  ],
  sun: { az: 195, el: [-6, 30] },
  moon: { az: 215, el: 11 },
};
