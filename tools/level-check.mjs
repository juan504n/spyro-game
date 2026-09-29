// Runs the level population headlessly (both passes) and reports counts, triangle budget and gameplay data.
import { generateTerrain } from '../src/game/terrain.js';
import { Lighting } from '../src/engine/lighting.js';
import { Kit } from '../src/game/kit.js';
import { populate } from '../src/game/levelgen/index.js';

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
