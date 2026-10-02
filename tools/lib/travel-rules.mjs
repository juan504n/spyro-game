// What a place of the TRAVEL menu (src/game/travel.js) must be: somewhere the hero put there can STAND (the floor is where the place says, not a roof or the air), clear of rock, props and the
// game's own colliders, not in water, not on a slope he would slide down, not beside a Snuffer or inside the light of an awake door (he would be hurt, or carried away, the moment he
// arrives), inside the world, named by the debug readout's areas, and not in a pocket (walking ground all round him). Shared by tools/travel-check.mjs (which holds every place of every world
// to it) and tools/realm-travel.mjs (which finds the places of a new realm).
import { SLOPE_WALK } from '../../src/game/collision.js';
import { WATER_LEVEL } from '../../src/game/level.js';
import { heroSpot } from '../../src/game/travel.js';
import { areaAt } from '../../src/game/debuginfo.js';

const f1 = (v) => v.toFixed(1);

/**
 * @param W      a world built headlessly with the game's runtime colliders added (tools/headless-world.mjs)
 * @param flood  makeWalkmap(W).flood
 * @param wBroken  a flood from the start with the cracked walls broken, or null (when the world's places need not be in the walkable country)
 * @returns checkPlace(place, { shelf }) -> { floor, clear, slope, water, enemy, door, bounds, pocket, walk, name }: each a string naming the problem, or '' when there is none
 */
export function makePlaceChecker(W, flood, wBroken = null) {
  const { grid, collision, gp, level } = W, nrm = [0, 1, 0], lim = grid.half - 6;
  // (as Player.update asks it: a solid collider stops a body standing with its feet at `feet` when it reaches above the step he can take (0.62) and starts below his head (1.05))
  const solidAt = (x, feet, z, r) => {
    for (const c of collision.near(x, z)) { if (!c.solid || c.y1 <= feet + 0.62 || c.y0 >= feet + 1.05 || !collision.inside(c, x, z, r)) continue; return c; }
    for (const m of collision.solids) { const e = { x, z, r }; if (m.inBoxXZ(x, z) && m.push(e, feet, 1.05, 0.62) && Math.hypot(e.x - x, e.z - z) > 0.25) return m; }
    return null;
  };
  // (`shelf`: a place on the shelf of a glide goal, which has no way on foot: it is no pocket and not in the walkable country by design, the hero glides on and off it; see situations.js `glide`)
  return (p, { shelf = !!p.shelf } = {}) => {
    const bad = { floor: '', clear: '', slope: '', water: '', enemy: '', door: '', bounds: '', pocket: '', walk: '', name: '' };
    const sp = heroSpot(grid, p), feet = sp.y - 0.05;
    const sup = collision.support(p.x, p.z, feet + 0.62, 0.62);
    if (Math.abs(sup.y - feet) > 0.1) bad.floor = `floor ${f1(sup.y)}, wanted ${f1(feet)}`;
    let tight = solidAt(p.x, sup.y, p.z, 0.55) ? 9 : 0;
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; if (solidAt(p.x + Math.cos(a) * 1.3, sup.y, p.z + Math.sin(a) * 1.3, 0.55)) tight++; }
    if (tight) bad.clear = String(tight);
    if (sup.kind === 'terrain') { grid.normalAt(p.x, p.z, nrm); if (nrm[1] < SLOPE_WALK) bad.slope = 'steep'; if (sup.y < WATER_LEVEL + 0.2) bad.water = 'wet'; }
    else if (sup.n && sup.n.ny < SLOPE_WALK) bad.slope = 'steep';
    for (const e of gp.enemies || []) if (Math.hypot(e.x - p.x, e.z - p.z) < 6) { bad.enemy = 'beside a Snuffer'; break; }
    for (const q of gp.portals || []) if (q.state === 'open' && Math.hypot(q.x - p.x, q.z - p.z) < 6) { bad.door = 'in an awake door\'s light'; break; }
    if (Math.abs(p.x) > lim || Math.abs(p.z) > lim) bad.bounds = 'outside';
    // not in a pocket: walking ground all round him (a flood within 40 m reaches 100 cells or more: the Shrine Isle, the smallest, has 140)
    // (in a country of islands joined in the air a small island - a spire, a slab - has its neighbours a hop away: the hop counts)
    const local = flood([p.x, p.z], { startY: sup.y, breakWalls: true, hop: level.brief && level.brief.air ? 6.2 : 0, mask: (x, y, z) => Math.hypot(x - p.x, z - p.z) < 40 });
    let cells = 0; local.each(() => { cells++; });
    if (cells < 100 && !shelf) bad.pocket = `${cells} cells`;
    if (wBroken && !shelf && !(wBroken.distNear(p.x, p.z, 2.4, sup.y) < Infinity)) bad.walk = 'not in the walkable country';
    const area = areaAt(level, p.x, p.z, sup.y);
    if (!area || !area.name) bad.name = 'unnamed';
    return bad;
  };
}
