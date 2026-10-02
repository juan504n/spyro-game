// How Frostbloom Hollow is lit and what its sky is: A, a frozen night (a cold moon in the north-west, the aurora's green glow in the north, a sky that runs from ink blue through the aurora's teal
// and violet to a pale icy horizon) and B, a blossom dawn (a low rose-gold sun in the east, pink-lit snow, a sky of cornflower, blossom pink and gold). Each lantern that blooms moves the realm along
// from A to B (the day: realms.js, systems/beacons.js). Two or three base hues in each: ice teal, snow white and blossom pink, the glow colour the accent. (Shape: engine/lighting.js DEFAULT_ENVIRONMENT.)
import { dirAzEl } from '../../engine/lighting.js';

export const FROST_ENVIRONMENT = {
  name: 'frostbloom',
  envs: [
    { // A: frozen night
      name: 'frozen night',
      lights: [
        { dir: dirAzEl(300, 46), color: [0.52, 0.78, 1.0], shadow: true },       // the moon, cold, over the north-west mountains
        { dir: dirAzEl(270, 22), color: [0.2, 0.58, 0.5], shadow: false },       // the aurora: green light from the north, on every face that looks that way
      ],
      sky: [0.3, 0.42, 0.68],
      ground: [0.22, 0.3, 0.44],
    },
    { // B: blossom dawn
      name: 'blossom dawn',
      lights: [
        { dir: dirAzEl(12, 30), color: [1.1, 0.9, 0.82], shadow: true },         // a low rose-gold sun in the east
      ],
      sky: [0.56, 0.58, 0.82],
      ground: [0.5, 0.4, 0.46],
    },
  ],
  sky: [
    { zenith: [0.02, 0.04, 0.16], high: [0.04, 0.14, 0.34], mid: [0.06, 0.38, 0.46], low: [0.28, 0.3, 0.6], horizon: [0.56, 0.74, 0.84], fog: [0.2, 0.36, 0.52], glow: [0.35, 0.95, 0.7] },
    { zenith: [0.3, 0.5, 0.86], high: [0.52, 0.68, 0.95], mid: [0.9, 0.78, 0.9], low: [1.0, 0.8, 0.74], horizon: [1.0, 0.88, 0.76], fog: [0.93, 0.84, 0.88], glow: [1.0, 0.72, 0.62] },
  ],
  sun: { az: 12, el: [-9, 30] },
  moon: { az: 300, el: 46 },
};
