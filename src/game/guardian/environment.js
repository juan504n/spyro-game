// How the Guardian's Court is lit and what its sky is: A, the gloom the Guardian has stood in since its lanterns went out (a cold violet moon high in the north-west, a magenta glow low in the south that lights
// the stone's face as the hero comes up the road, a sky from black violet through plum to a dull rose horizon) and B, the dawn its lanterns bring (a gold sun risen low in the south-east, rose-gold cloud,
// an amber horizon). Each lantern that is lit moves the Court a third of the way from A to B (the world's `day` is lanterns lit over three, as in every realm); the third is the sunrise. Violet, stone
// grey and the gold of the lanterns: the accent. (Shape: engine/lighting.js DEFAULT_ENVIRONMENT.)
import { dirAzEl } from '../../engine/lighting.js';

export const GUARDIAN_ENVIRONMENT = {
  name: 'guardian',
  envs: [
    { // A: the gloom
      name: 'gloom',
      lights: [
        { dir: dirAzEl(225, 40), color: [0.56, 0.5, 1.0], shadow: true },        // a cold moon in the north-west: the pillars throw their shadows south-east, towards the hero's road
        { dir: dirAzEl(95, 11), color: [0.62, 0.26, 0.5], shadow: false },        // the glow of a dawn that has not come, low in the south: it lights the Guardian's face from the road
      ],
      sky: [0.3, 0.25, 0.5],
      ground: [0.22, 0.17, 0.3],
    },
    { // B: the dawn
      name: 'dawn',
      lights: [
        { dir: dirAzEl(62, 25), color: [1.12, 0.92, 0.68], shadow: true },       // a gold sun risen in the south-east
      ],
      sky: [0.58, 0.56, 0.78],
      ground: [0.5, 0.4, 0.34],
    },
  ],
  sky: [
    { zenith: [0.04, 0.02, 0.15], high: [0.14, 0.07, 0.3], mid: [0.34, 0.14, 0.44], low: [0.6, 0.2, 0.46], horizon: [0.9, 0.4, 0.5], fog: [0.3, 0.14, 0.36], glow: [0.9, 0.36, 0.6], cloudTop: [0.3, 0.2, 0.4], cloudBot: [0.8, 0.35, 0.5], ridge: [0.14, 0.08, 0.24] },
    { zenith: [0.26, 0.42, 0.8], high: [0.5, 0.62, 0.9], mid: [0.9, 0.76, 0.74], low: [1.0, 0.74, 0.46], horizon: [1.0, 0.86, 0.5], fog: [0.9, 0.74, 0.6], glow: [1.0, 0.8, 0.4], cloudTop: [1.0, 0.95, 0.9], cloudBot: [1.0, 0.78, 0.5], ridge: [0.5, 0.42, 0.52] },
  ],
  sun: { az: 62, el: [-8, 26] },
  moon: { az: 225, el: 40 },
};
