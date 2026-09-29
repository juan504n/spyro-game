// Nature scenery for Gloaming Vale (owned by the nature-props artist).
// Export NATURE = { name: { fn, size, note, defaults?, anchors? } }.  Implementation lives in ./nature/*.js.
//   fn(kit, { x, z, rot = 0, scale = 1, y?, ...params })   pure + deterministic (runs twice: dry pass, wet pass)
//   anchors: { key: [lx, ly, lz, yaw?] } local-space points used by levelgen's ctx.anchor(name, key, ...)
import { TREES } from './nature/trees.js';
import { ROCKS } from './nature/rocks.js';
import { GROUND } from './nature/ground.js';
import { MAGIC } from './nature/magic.js';
import { STRUCTURES } from './nature/structures.js';
import { FUNGI } from './nature/fungi.js';
import { unshadowed } from './nature/util.js';

/**
 * A prop placed well above the terrain under it (sky-island decor, the islands) is "floating": the terrain shadow map is
 * meaningless up there, so it is baked without terrain shadows.  Everything else is baked normally.
 */
function guard(fn) {
  return (kit, p) => {
    const y = p && typeof p.y === 'number' && Number.isFinite(p.y) ? p.y : null;
    const floating = y !== null && Number.isFinite(p.x) && Number.isFinite(p.z) && y - kit.groundY(p.x, p.z) > 3;
    return floating ? unshadowed(kit, () => fn(kit, p)) : fn(kit, p);
  };
}

const ALL = { ...TREES, ...ROCKS, ...GROUND, ...MAGIC, ...STRUCTURES, ...FUNGI };
export const NATURE = Object.fromEntries(Object.entries(ALL).map(([name, e]) => [name, { ...e, fn: guard(e.fn) }]));
