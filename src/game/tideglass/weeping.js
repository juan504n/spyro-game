// THE WEEPING CLIFF: the mass of rock at the east end of the Salt Flats, and the cave of the fourth lens in it. A rock mass (realm/rockmass.js) standing on the level of the flats: a cliff in its west face
// with the cave's mouth cut in it (the Weeping Fall hangs over the mouth), a tunnel running up into the rock, its floor rising from the tidal sand at the mouth to a dry chamber under a skylight, where the
// lens hangs. The mouth is under the sea at the high tide (the floor there is under 1.4 m of water: it drowns him), the chamber never: a hero inside when the tide comes in waits on the dry floor.
//
// Everything here is plain data: the level (level.js) shapes the ground after these floors, the brief (brief.js) puts the goal in the chamber, the layout (layout.js) dresses the way.
import { rockMass } from '../realm/index.js';

/** the level the mass stands on: the flats' */
export const PLINTH = -0.5;

export const WEEPING = rockMass({
  id: 'weeping', name: 'THE WEEPING CLIFF', plinth: PLINTH,
  // the body: heights above the plinth of overlapping mounds (`flat`: the share of the radius where the top is level). The face looking west over the flats is a wall: the mouth is cut in it
  mounds: [
    { x: 128, z: 6, rx: 22, rz: 17, h: 24, flat: 0.9 },           // the bastion: a sheer wall facing the beach, the mouth cut in it
    { x: 146, z: -6, rx: 26, rz: 24, h: 28, flat: 0.5 },          // the main mass
    { x: 128, z: -34, rx: 16, rz: 14, h: 31, flat: 0.5 },         // the north buttress, the highest
    { x: 132, z: 32, rx: 16, rz: 10, h: 16, flat: 0.6 },          // the south shoulder
  ],
  tunnels: {
    // from the sand in front of the wall (a hair under the mean level: the sea fills it at high tide) up into the rock; the first metres are the way a sea cave is, wide and low, the roof begins where the wall does
    mouth: [[100, 15, -0.3, 4.8, 6.8], [112, 9, 0.5, 4.6, 6.6], [124, 3, 1.7, 4.6, 6.8], [136, -2, 2.7, 4.8, 7.2]],
  },
  chambers: {
    grotto: { x: 144, z: -5, rx: 12.5, rz: 10.5, rot: 0.3, H: 13, floorY: 2.8 },          // the lens's chamber, dry at every tide
  },
  shafts: [{ x: 147, z: -8, r: 2.6, y0: 2.8 + 8, y1: 90 }],                               // the skylight over the lens
  box: [92, -8, -52, 182, 44, 46],
  style: {
    rock: 'cliff_tide', interior: 'cliff_tide', top: 'tideturf', ambient: [0.12, 0.3, 0.34],
    // turf where the rock is gentle and sees the sky, the cliff's own strata everywhere else (inside and out: the same stone, so no seam shows at the mouth)
    layers: [{ name: 'tideturf', score: ({ ny, sky }) => Math.min((ny - 0.8) * 3, (sky - 0.7) * 3) }],
  },
});

/** the chamber (the lens stands in its middle) */
export const GROTTO = WEEPING.chambers.grotto;
