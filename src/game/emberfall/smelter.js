// THE SMELTER: the foot of Mount Emberfall, a mass of basalt with the realm's cave in it. A rock mass (realm/rockmass.js) standing on a plinth of level ground at the height of the Anvil Plateau: a
// sheer bastion on its west face with the Maw cut in it (a stone dragon's mouth, shut by a ward of fire until three Emberstones burn), a tunnel running east into the Furnace, the great chamber
// where the fourth Emberstone stands under a skylight, a tunnel north out of the Furnace through the mountain to the gorge that climbs to the caldera, and a third way east from the Furnace that
// climbs to a balcony: a little round room with a chest.
//
// Everything here is plain data: the level (level.js) shapes the ground after these floors, the brief (brief.js) puts the goal in the Furnace, the layout (layout.js) dresses the ways.
import { rockMass } from '../realm/index.js';

/** the level ground the mass stands on: the height of the Anvil Plateau in front of the Maw */
export const PLINTH = 6;

export const SMELTER = rockMass({
  id: 'smelter', name: 'THE SMELTER', plinth: PLINTH,
  // the body: heights above the plinth of overlapping mounds (`flat`: the share of the radius where the top is level). The bastion is a sheer wall: the Maw is cut in it
  mounds: [
    { x: 156, z: 20, rx: 40, rz: 40, h: 38, flat: 0.3 },        // the main mass of the mountain
    { x: 154, z: -14, rx: 30, rz: 20, h: 30, flat: 0.5 },       // the north shoulder, over the way out
    { x: 190, z: 34, rx: 24, rz: 26, h: 46, flat: 0.5 },        // the east shoulder, over the balcony (high enough that the little room under it has a roof)
    { x: 116, z: 20, rx: 14, rz: 28, h: 24, flat: 0.9 },        // the bastion: a wall 24 m high, with the Maw in it
  ],
  tunnels: {
    // the Maw and the way in to the Furnace (the mouth is 6.8 m wide, as wide as the ward that shuts it: the dragon's teeth stand either side)
    maw: [[102, 20, PLINTH, 3.4, 6.4], [116, 20, PLINTH, 3.5, 6.4], [130, 22, PLINTH, 4.6, 7.0], [144, 24, PLINTH, 5.2, 7.6]],
    // north out of the Furnace, under the shoulder, to the open gorge
    exit: [[156, 14, PLINTH, 4.4, 6.8], [156, 0, PLINTH, 4.4, 6.8], [154, -16, PLINTH, 4.6, 7.0], [152, -36, PLINTH, 4.6, 7.0]],
    // east out of the Furnace, climbing 7 m to the balcony
    balcony: [[168, 32, PLINTH, 3.0, 5.4], [180, 34, PLINTH + 3, 3.0, 5.4], [190, 40, PLINTH + 7, 3.0, 5.4]],
  },
  chambers: {
    furnace: { x: 156, z: 26, rx: 15, rz: 13, rot: 0.2, H: 14, floorY: PLINTH },            // the Emberstone's chamber
    ledge: { x: 194, z: 44, rx: 6.5, rz: 6.5, H: 7.5, floorY: PLINTH + 7 },                 // the balcony: a little round room 7 m above the Furnace's floor
  },
  shafts: [{ x: 156, z: 26, r: 2.8, y0: PLINTH + 8, y1: 90 }],                              // the skylight over the Emberstone
  box: [98, 0, -42, 214, 62, 74],
  style: {
    rock: 'cliff_basalt_bare', interior: 'cliff_basalt_bare', top: 'ash', ambient: [0.34, 0.16, 0.1],
    // ash lies wherever the rock is gentle and sees the sky; the basalt's own bands everywhere else (inside and out: the same stone, so no seam shows at the mouth)
    layers: [{ name: 'ash', score: ({ ny, sky }) => Math.min((ny - 0.8) * 3, (sky - 0.7) * 3) }],
  },
});

/** the Furnace (the goal stands in its middle) and the balcony */
export const FURNACE = SMELTER.chambers.furnace;
export const LEDGE = SMELTER.chambers.ledge;
