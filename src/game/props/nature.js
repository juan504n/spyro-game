// Nature scenery (owned by the nature-props artist). Export NATURE = { name: { fn, size, note, defaults?, anchors? } }.
import { TREES, treeRound, treePine, treeBirch, treeLantern, bush } from './nature/trees.js';
import { ROCKS, rockCluster, boulderBig } from './nature/rocks.js';
import { GROUND, flowerPatch, tuftPatch, fernPatch, fallenLog, stump } from './nature/ground.js';
import { MAGIC, crystalCluster, standingStones } from './nature/magic.js';
import { STRUCTURES } from './nature/structures.js';
import { FUNGI, mushroomCluster } from './nature/fungi.js';

// DEV ONLY: a scatter to judge how the set reads together
function forest(kit, { x, z }) {
  let s = 7;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const P = () => [x + (rnd() - 0.5) * 70, z + (rnd() - 0.5) * 50];
  for (let i = 0; i < 26; i++) {
    const [px, pz] = P();
    const t = rnd();
    if (t < 0.32) treeRound(kit, { x: px, z: pz, size: rnd() < 0.3 ? 's' : rnd() < 0.6 ? 'm' : 'l', canopy: rnd() < 0.6 ? 'leaves_green' : rnd() < 0.5 ? 'leaves_teal' : 'leaves_autumn' });
    else if (t < 0.6) treePine(kit, { x: px, z: pz, size: rnd() < 0.5 ? 'm' : rnd() < 0.5 ? 's' : 'l' });
    else if (t < 0.8) treeBirch(kit, { x: px, z: pz });
    else if (t < 0.9) treeLantern(kit, { x: px, z: pz });
    else bush(kit, { x: px, z: pz, flowers: rnd() < 0.5 });
  }
  for (let i = 0; i < 10; i++) { const [px, pz] = P(); bush(kit, { x: px, z: pz, flowers: rnd() < 0.4, canopy: rnd() < 0.5 ? 'leaves_green' : 'leaves_teal' }); }
  for (let i = 0; i < 6; i++) { const [px, pz] = P(); rockCluster(kit, { x: px, z: pz, count: 2 + Math.floor(rnd() * 3) }); }
  { const [px, pz] = P(); boulderBig(kit, { x: px, z: pz }); }
  for (let i = 0; i < 10; i++) { const [px, pz] = P(); flowerPatch(kit, { x: px, z: pz }); }
  for (let i = 0; i < 10; i++) { const [px, pz] = P(); tuftPatch(kit, { x: px, z: pz }); }
  for (let i = 0; i < 5; i++) { const [px, pz] = P(); fernPatch(kit, { x: px, z: pz }); }
  { const [px, pz] = P(); fallenLog(kit, { x: px, z: pz, rot: rnd() * 6 }); stump(kit, { x: px + 6, z: pz + 3 }); }
  { const [px, pz] = P(); crystalCluster(kit, { x: px, z: pz, color: 'violet' }); mushroomCluster(kit, { x: px + 5, z: pz }); }
}

export const NATURE = { ...TREES, ...ROCKS, ...GROUND, ...MAGIC, ...STRUCTURES, ...FUNGI, _forest: { fn: forest, size: 80, note: 'dev scatter' } };
