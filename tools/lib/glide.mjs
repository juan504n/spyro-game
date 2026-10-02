// Gliding, planned: where a hero launches from to reach a goal on a shelf he cannot walk to (a glide goal: src/game/realm/situations.js), and where he glides off it afterwards. Shared by
// tools/realm-bot.mjs (which does it with the real controller) and tools/realm-travel.mjs. The numbers are the situation check's: the reach of a glide from a standing start, with the same margin.
import { glideReach, GLIDE_MARGIN } from '../../src/game/realm/situations.js';
import { WATER_LEVEL } from '../../src/game/level.js';

/** the cells of a flood (tools/walkmap.mjs) from which the goal can be reached by a glide: [{ x, y, z, gap, drop, reach }], the longest glides first, none under 12 m and none that uses more than `use` of the reach */
export function launchCells(walk, g, { use = 0.9, min = 12 } = {}) {
  const out = [];
  walk.each((x, y, z) => {
    const gap = Math.hypot(x - g.x, z - g.z), drop = y - g.y, reach = glideReach(drop) * GLIDE_MARGIN;
    if (gap < min || gap > reach * use) return;
    out.push({ x, y, z, gap, drop, reach });
  });
  return out.sort((a, b) => b.gap - a.gap);
}

/** the cells of the walkable country a hero standing on the goal's shelf can glide down to: [{ x, y, z, gap, drop, reach }], by the walk from each to `next` (a flood from the next goal) when given, else the shortest glide first */
export function exitCells(walk, g, { next = null, use = 0.9, min = 12 } = {}) {
  const out = [];
  walk.each((x, y, z) => {
    const gap = Math.hypot(x - g.x, z - g.z), drop = g.y - y, reach = glideReach(drop) * GLIDE_MARGIN;
    if (gap < min || drop < 1 || y < WATER_LEVEL + 0.6 || gap > reach * use) return;                // (dry ground: not the shallows of the lava)
    out.push({ x, y, z, gap, drop, reach, d: next ? next.dist(x, z, y) : gap });
  });
  return out.filter((c) => Number.isFinite(c.d)).sort((a, b) => a.d - b.d);
}
