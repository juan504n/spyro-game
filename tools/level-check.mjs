// Runs the level population headlessly (both passes), reports counts, triangle budget and gameplay data, then checks a few placements
// (exit code 1 when one fails). No dev server needed:  node tools/level-check.mjs
import { buildHeadless } from './headless-world.mjs';
import { WATER_LEVEL } from '../src/game/level.js';
import { isleObjects, shortfall } from '../src/game/levelgen/islands.js';
import { colliderDist } from '../src/game/debuginfo.js';

const { grid, kit, dryCtx: ctx, gp, ms } = buildHeadless();
console.log('populate ms', Math.round(ms), '(terrain + both passes, headless)');
console.log('placements', JSON.stringify(ctx.counts));
console.log('kit tris', kit.triangleCount(), 'builders', kit.builders.size, 'colliders', kit.colliders.length, 'lights', kit.lights.length, 'emitters', kit.emitters.length);
console.log('gems', gp.gems.length, 'static value', gp.gemBreakdown.static, 'dynamic', gp.gemBreakdown.dynamic, 'TOTAL', gp.gemsTotal);
console.log('enemies', gp.enemies.length, JSON.stringify(gp.enemies.reduce((a, e) => ((a[e.variant] = (a[e.variant] || 0) + 1), a), {})), 'vases', gp.vases.length, 'chests', gp.chests.length, 'walls', gp.walls.length, 'bunnies', gp.bunnies.length, 'braziers', gp.braziers.length, 'mushrooms', gp.mushrooms.length);
console.log('beacons', gp.beacons.map((b) => `${b.id}@(${b.x.toFixed(0)},${b.y.toFixed(1)},${b.z.toFixed(0)})`).join(' '));
console.log('islands', grid.level.isles.map((i) => `${i.id}@y${i.y}`).join(' '), 'barrier', JSON.stringify(gp.barrier), 'portcullis', JSON.stringify(gp.portcullis), 'sails', JSON.stringify(gp.sails));

// ---- placement checks (each one is a bug that shipped once: a chest on the shore slope, a trench of roads below the waterline) ----
const L = grid.level;
const checks = [];
const check = (name, ok, detail) => { checks.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };
{
  // the shrine island's chest stands on the island's level top, seated on the ground (no gap under any corner of its 1.7 x 1.0 base)
  const I = L.island;
  const c = gp.chests.find((k) => Math.hypot(k.x - I.x, k.z - I.z) < 12);
  const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
  const under = [[-0.85, -0.5], [0.85, -0.5], [-0.85, 0.5], [0.85, 0.5]].map(([lx, lz]) => grid.heightAt(c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs) - c.y);
  const r = Math.hypot(c.x - I.x, c.z - I.z);
  check('island chest on the level top', grid.heightAt(c.x, c.z) > I.top - 0.5 && r < 5.5, `(r ${r.toFixed(1)} m from the beacon, ground ${grid.heightAt(c.x, c.z).toFixed(2)} of ${I.top})`);
  check('island chest seated', Math.min(...under) > -0.05 && Math.max(...under) < 0.5, `(ground under its corners ${under.map((v) => v.toFixed(2)).join(' ')})`);
}
{
  // the Dawn Gate's approach is one clean paved forecourt: dry ground everywhere, a gentle climb, ring roads ending at its sides
  let lo = Infinity, steep = 0;
  for (let z = -92; z <= -70; z += 1) for (let x = -12; x <= 12; x += 1) {
    lo = Math.min(lo, grid.heightAt(x, z));
    if (Math.abs(x) < 7 && z >= -86) steep = Math.max(steep, grid.slopeAt(x, z));       // (the paved apron up to the pillars' plinths)
  }
  check('gate forecourt above water', lo > WATER_LEVEL + 0.5, `(lowest ground ${lo.toFixed(2)})`);
  check('gate forecourt climbs gently', steep < 0.36, `(steepest paved slope ${steep.toFixed(2)} rad)`);
  const g = L.gate, plaza = grid.paths.find((p) => p.id === 'plaza');
  const ends = ['ringW', 'ringE'].map((id) => { const p = grid.paths.find((q) => q.id === id).pts.at(-1); return Math.hypot(p[0] - g.x, p[2] - (plaza.pts[0][2] - 1)); });
  check('ring roads end at the forecourt', ends.every((d) => d < 10), `(distance of their last points from its south end: ${ends.map((d) => d.toFixed(1)).join(', ')})`);
}
{
  // the sky isles' decor (a crystal cluster, a lantern tree, flowers) keeps clear of everything gameplay on its isle. Each of these shipped once:
  // on Sky Isle 2 the tree grew through the bounce mushroom's cap (1.8 m away), and on Sky Isle 3 a crystal cluster sat on the chest (0.2 m away)
  const bad = [];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  for (const isle of L.isles) {
    const objs = isleObjects(gp, isle), placed = [];
    for (const d of gp.islandDecor[isle.id].decor) {
      const s = shortfall(d.x, d.z, d.kind, objs, placed);
      if (s > 0) bad.push(`${isle.id} ${d.name} is ${s.toFixed(1)} m too close`);
      placed.push(d);
    }
  }
  check('sky isle decor keeps clear of the bounce mushrooms, chests, enemy spawns, beacon and gem', bad.length === 0, bad.join('; '));
  const i2 = L.isles.find((i) => i.id === 'i2'), i3 = L.isles.find((i) => i.id === 'i3');
  const mush2 = gp.mushrooms.find((m) => dist(m, i2) < i2.r), tree2 = gp.islandDecor.i2.decor.find((d) => d.name === 'tree_lantern');
  check('Sky Isle 2: the lantern tree stands clear of the bounce mushroom (it was 1.8 m away, growing through the cap)', dist(mush2, tree2) >= 5.3, `(${dist(mush2, tree2).toFixed(1)} m)`);
  const chest3 = gp.chests.find((c) => dist(c, i3) < i3.r), crystal3 = gp.islandDecor.i3.decor.find((d) => d.name === 'crystal_cluster');
  check('Sky Isle 3: the crystal cluster is off the chest (it was 0.2 m away)', dist(chest3, crystal3) >= 3.1, `(${dist(chest3, crystal3).toFixed(1)} m)`);
  // the decor exists as props: recorded, with colliders that know them
  const decorCols = kit.colliders.filter((c) => c.prop && c.prop.src === 'buildIslands');
  check('the isles and their decor are in the world (recorded props, their colliders in the collision world)', gp.placed.filter((p) => p.src === 'buildIslands').length === 16 && decorCols.length >= 8, `(${gp.placed.filter((p) => p.src === 'buildIslands').length} records, ${decorCols.length} colliders)`);
}
{
  // nothing solid stands on a chest, vase, brazier, bounce mushroom or NPC, and no enemy spawns inside a solid prop (beacons sit on top of the windmill and
  // the observatory by design and are not checked; a prop's walk-on surface under something is fine)
  const things = [];
  for (const c of gp.chests) things.push(['chest', c, 1.3]);
  for (const v of gp.vases) things.push(['vase', v, 0.8]);
  for (const b of gp.braziers) things.push(['brazier', b, 1.0]);
  for (const m of gp.mushrooms) things.push(['bounce mushroom', m, 2.3 * (m.size || 1)]);
  for (const n of gp.npcs) things.push(['npc', n, 0.8]);
  for (const e of gp.enemies) things.push(['enemy spawn', e, 1.0]);
  const clashes = [];
  for (const [kind, o, r] of things) {
    const oy = Number.isFinite(o.y) ? o.y : grid.heightAt(o.x, o.z);
    for (const c of kit.colliders) {
      if (!c.prop || (c.type === 'cyl' && c.r < 0.2)) continue;
      if (c.top && c.y1 <= oy + 0.6) continue;                              // (standing on it)
      if (!(oy < c.y1 - 0.4 && oy + 1.0 > c.y0)) continue;                  // (not at the same height: another isle, a bridge overhead)
      const d = colliderDist(c, o.x, o.z);
      if (d < r) clashes.push(`${kind} at ${o.x.toFixed(1)}, ${o.z.toFixed(1)} [${o.src}] is inside ${c.prop.name} at ${c.prop.x.toFixed(1)}, ${c.prop.z.toFixed(1)} [${c.prop.src}] (${d.toFixed(1)} m < ${r})`);
    }
  }
  check('no prop stands on a chest, vase, brazier, bounce mushroom or NPC, and no enemy spawns inside one', clashes.length === 0, `(${things.length} things checked${clashes.length ? ': ' + clashes.join('; ') : ''})`);
}
process.exitCode = checks.every(Boolean) ? 0 : 1;
