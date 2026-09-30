// Runs the level population headlessly (both passes), reports counts, triangle budget and gameplay data, then checks a few placements
// (exit code 1 when one fails). No dev server needed:  node tools/level-check.mjs
import { generateTerrain } from '../src/game/terrain.js';
import { Lighting } from '../src/engine/lighting.js';
import { Kit } from '../src/game/kit.js';
import { populate } from '../src/game/levelgen/index.js';
import { WATER_LEVEL } from '../src/game/level.js';

const t0 = performance.now();
const grid = generateTerrain();
const lighting = new Lighting();
lighting.attach(grid);
const world = { grid, lighting, timings: {}, lights: [], emitters: [], colliders: [], scene: { add() {} } };
const kit = new Kit({ assets: null, lighting, grid });
world.kit = kit;
kit.setPass('dry');
let ctx = populate(kit, world);
lighting.bake();
kit.setPass('wet');
const before = kit.triangleCount();
let ctx2;
try { ctx2 = populate(kit, world); } catch (e) { console.log('WET PASS ERROR', e.stack); }
world.colliders = kit.colliders;
console.log('populate ms', Math.round(performance.now() - t0));
console.log('placements', JSON.stringify(ctx.counts));
console.log('kit tris', kit.triangleCount(), 'builders', kit.builders.size, 'colliders', kit.colliders.length, 'lights', kit.lights.length, 'emitters', kit.emitters.length, before === 0 ? '' : '');
const gp = world.gameplay;
console.log('gems', gp.gems.length, 'static value', gp.gemBreakdown.static, 'dynamic', gp.gemBreakdown.dynamic, 'TOTAL', gp.gemsTotal);
console.log('enemies', gp.enemies.length, JSON.stringify(gp.enemies.reduce((a, e) => ((a[e.variant] = (a[e.variant] || 0) + 1), a), {})), 'vases', gp.vases.length, 'chests', gp.chests.length, 'walls', gp.walls.length, 'bunnies', gp.bunnies.length, 'braziers', gp.braziers.length, 'mushrooms', gp.mushrooms.length);
console.log('beacons', gp.beacons.map((b) => `${b.id}@(${b.x.toFixed(0)},${b.y.toFixed(1)},${b.z.toFixed(0)})`).join(' '));
console.log('islands', gp.islands.map((i) => `${i.id}@y${i.y}`).join(' '), 'barrier', JSON.stringify(gp.barrier), 'portcullis', JSON.stringify(gp.portcullis), 'sails', JSON.stringify(gp.sails));

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
process.exitCode = checks.every(Boolean) ? 0 : 1;
