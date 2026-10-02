// THE GLACIER: the mass of ice-rock at the end of the Icefall, and the cave of the fourth Frostbloom in it. A rock mass (realm/rockmass.js) standing on a plinth of level ground: a cliff in its south
// face with the cave's mouth cut in it (the frozen waterfall hangs over the mouth), a tunnel running north into the heart chamber under a skylight, where the Frostbloom sleeps, and a second
// tunnel west out of the chamber, shut with a cracked wall, to the little vault behind it.
//
// Everything here is plain data: the level (level.js) shapes the ground after these floors, the brief (brief.js) puts the goal in the heart chamber, the layout (layout.js) dresses the ways.
import { rockMass } from '../realm/index.js';

/** the level ground the mass stands on (the Icefall's last height) */
export const PLINTH = 11;

export const GLACIER = rockMass({
  id: 'glacier', name: 'THE GLACIER', plinth: PLINTH,
  // the body: heights above the plinth of overlapping mounds (`flat`: the share of the radius where the top is level). The bastion is a sheer wall: the mouth is cut in it
  mounds: [
    { x: 156, z: -50, rx: 30, rz: 28, h: 26, flat: 0.35 },        // the main mass
    { x: 138, z: -66, rx: 20, rz: 20, h: 34, flat: 0.28 },        // the tooth, the highest
    { x: 152, z: -20, rx: 26, rz: 14, h: 22, flat: 0.9 },         // the bastion: a wall of ice 22 m high, with the mouth in it
    { x: 122, z: -52, rx: 17, rz: 17, h: 20, flat: 0.4 },         // the western shoulder, over the vault
  ],
  tunnels: {
    // the mouth, and the way in to the heart chamber: the first metres are a lane open to the sky, the roof begins where the wall does
    mouth: [[150, -2, PLINTH, 4.6, 6.8], [150, -16, PLINTH, 4.4, 6.6], [152, -28, PLINTH, 4.6, 7.0], [154, -37, PLINTH, 5.0, 7.4]],
    // west out of the chamber, to the vault
    vault: [[142, -47, PLINTH, 3.2, 5.4], [128, -50, PLINTH, 3.2, 5.4]],
  },
  chambers: {
    heart: { x: 154, z: -48, rx: 14, rz: 12, rot: 0.2, H: 13, floorY: PLINTH },          // the Frostbloom's chamber
    vault: { x: 121, z: -51, rx: 7.5, rz: 7, rot: 0.2, H: 7.5, floorY: PLINTH },          // the little room behind the wall
  },
  shafts: [{ x: 154, z: -48, r: 2.6, y0: PLINTH + 7, y1: 90 }],                           // the skylight over the Frostbloom
  box: [106, 2, -100, 198, 56, 8],
  style: {
    rock: 'cliff_frost', interior: 'cliff_frost', top: 'snow', ambient: [0.16, 0.28, 0.42],
    // snow lies wherever the rock is gentle and sees the sky; the cliff's own bands everywhere else (inside and out: the same stone, so no seam shows at the mouth)
    layers: [{ name: 'snow', score: ({ ny, sky }) => Math.min((ny - 0.8) * 3, (sky - 0.7) * 3) }],
  },
});

/** the heart chamber (the goal stands in its middle) and the vault */
export const HEART = GLACIER.chambers.heart;
export const VAULT = GLACIER.chambers.vault;
