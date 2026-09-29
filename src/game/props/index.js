// PROP REGISTRY.  Each entry: { fn(kit, params), size, note }.
//   fn(kit, { x, z, rot = 0, scale = 1, ...custom })   — see src/game/kit.js for the modelling API.
//   size = rough footprint diameter in world units (the gallery uses it to space props out).
// Props are pure functions of their params (use kit.rng(x, z) for randomness) because they run twice (dry + wet pass).
import { vgrad } from '../../engine/builder.js';

/** Reference prop: a round-canopied tree. */
export function treeRound(kit, { x, z, rot = 0, scale = 1, canopy = 'leaves_green' }) {
  const r = kit.rng(x, z);
  const h = 3.4 + r.float(0, 1.4);
  kit.at(x, z, { rot, scale }, () => {
    kit.b('bark').cyl(0.6, 0.32, h, 6, { tile: 3, color: vgrad(0, [0.55, 0.55, 0.6], h, [1, 1, 1]) });
    const blobs = [[0, h + 0.9, 0, 2.3], [1.1, h + 0.2, 0.6, 1.6], [-0.9, h + 0.5, -0.8, 1.7]];
    for (const [bx, by, bz, br] of blobs) {
      kit.b(canopy, { sway: true }).push().translate(bx, by, bz).blob(br, { detail: 1, noise: 0.2, tile: 4, color: vgrad(-br, [0.62, 0.66, 0.7], br, [1.05, 1.05, 1.0]) }).pop();
    }
    kit.caster(0, 0, 1.9, h + 3);
    kit.cyl(0, 0, 0.55, 0, h + 1);
  });
}

/** Reference prop: a mossy boulder cluster. */
export function rockCluster(kit, { x, z, rot = 0, scale = 1 }) {
  const r = kit.rng(x, z);
  kit.at(x, z, { rot, scale }, () => {
    const n = 2 + r.int(0, 3);
    for (let i = 0; i < n; i++) {
      const a = r.float(0, 6.28), d = i === 0 ? 0 : r.float(1.2, 2.4), s = i === 0 ? r.float(1.5, 2.1) : r.float(0.7, 1.3);
      kit.b('cliff').push().translate(Math.cos(a) * d, s * 0.35, Math.sin(a) * d).rotateY(r.float(0, 6))
        .blob(s, { detail: 1, noise: 0.28, sy: 0.75, tile: 3, color: vgrad(-s, [0.6, 0.6, 0.66], s, [1.05, 1.05, 1.1]) }).pop();
      kit.cyl(Math.cos(a) * d, Math.sin(a) * d, s * 0.85, 0, s * 1.0);
    }
    kit.caster(0, 0, 2.0, 2.2, 0.4);
  });
}

import { NATURE } from './nature.js';
import { VILLAGE } from './village.js';

const REFERENCE = {
  tree_round: { fn: treeRound, size: 7, note: 'reference round-canopy tree (superseded by nature.js when present)' },
  rock_cluster: { fn: rockCluster, size: 6, note: 'reference boulder cluster' },
};

// later spreads win: nature.js / village.js override the reference props above
export const PROPS = { ...REFERENCE, ...NATURE, ...VILLAGE };
