// How Tideglass Reach is lit and what its sky is: A, a teal dusk (a cool moon high in the south-west over a sea the colour of the sky, a faint glow thrown back from the north-east, where the dark
// lighthouse stands; a sky that runs from deep teal-navy through sea-green to a pale mint horizon) and B, a green dawn (the sun risen low behind the lighthouse in the north-east, gold on the glass, a
// sky of aqua and pale gold, the sea green). Each lens that shines moves the realm along from A to B (the day: realms.js, systems/beacons.js): the light has come back to the glass.
// Two or three base hues in each: sea-glass teal, pale sand and brass, the gold of the dawn the accent. (Shape: engine/lighting.js DEFAULT_ENVIRONMENT; az 0 is east, 90 south, 270 north.)
import { dirAzEl } from '../../engine/lighting.js';

export const TIDE_ENVIRONMENT = {
  name: 'tideglass',
  envs: [
    { // A: teal dusk
      name: 'teal dusk',
      lights: [
        { dir: dirAzEl(215, 44), color: [0.68, 0.8, 0.9], shadow: true },        // the moon, cool and high in the south-west behind the hero as he walks east: long shadows to the north-east
        { dir: dirAzEl(335, 8), color: [0.32, 0.36, 0.3], shadow: false },         // the dark lighthouse's side of the sky, a faint aqua-gold glow from the north-east
      ],
      sky: [0.34, 0.4, 0.46],
      ground: [0.26, 0.3, 0.3],
    },
    { // B: green dawn
      name: 'green dawn',
      lights: [
        { dir: dirAzEl(335, 26), color: [1.1, 0.98, 0.76], shadow: true },        // the sun risen over the headland, gold on the glass
      ],
      sky: [0.54, 0.7, 0.74],
      ground: [0.46, 0.54, 0.46],
    },
  ],
  sky: [
    { zenith: [0.03, 0.1, 0.22], high: [0.06, 0.24, 0.38], mid: [0.12, 0.44, 0.52], low: [0.3, 0.64, 0.64], horizon: [0.7, 0.86, 0.72], fog: [0.2, 0.46, 0.5], glow: [0.5, 0.95, 0.8], cloudTop: [0.42, 0.66, 0.74], cloudBot: [0.2, 0.42, 0.52], ridge: [0.12, 0.3, 0.38] },
    { zenith: [0.2, 0.52, 0.74], high: [0.4, 0.74, 0.84], mid: [0.7, 0.92, 0.88], low: [0.98, 0.92, 0.72], horizon: [1.0, 0.84, 0.6], fog: [0.68, 0.88, 0.84], glow: [1.0, 0.86, 0.56], cloudTop: [1.0, 0.97, 0.92], cloudBot: [0.99, 0.8, 0.72], ridge: [0.42, 0.68, 0.72] },
  ],
  sun: { az: 335, el: [-6, 26] },
  moon: { az: 215, el: 44 },
};
