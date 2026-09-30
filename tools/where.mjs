// What is at a spot in the realm? The debug readout's answer for a pair of coordinates, without the game: the named area, the ground texture and the
// rule behind it, every prop / gameplay thing / collision shape nearby with the layout function (and file:line) that placed it.
//   node tools/where.mjs X Z [--r 12]       e.g.  node tools/where.mjs -17.0 131.0      (X = east, Z = south, as the debug readout shows them)
//   node tools/where.mjs X Y Z [--r 12]     (with Y it tells the ground under a floating isle from the isle)
// Send a screenshot of debug mode, read X / Y / Z off it, and this lists what to look at in the level scripts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTerrain } from '../src/game/terrain.js';
import { Lighting } from '../src/engine/lighting.js';
import { Kit } from '../src/game/kit.js';
import { populate } from '../src/game/levelgen/index.js';
import { Collision } from '../src/game/collision.js';
import { LEVEL } from '../src/game/level.js';
import * as D from '../src/game/debuginfo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const ri = args.indexOf('--r');
const radius = ri >= 0 ? Number(args[ri + 1]) || 12 : 12;
if (ri >= 0) args.splice(ri, 2);
const nums = args.map(Number);
if (nums.length < 2 || nums.length > 3 || nums.some((n) => !Number.isFinite(n))) { console.log('usage: node tools/where.mjs X Z [--r 12]   |   node tools/where.mjs X Y Z [--r 12]'); process.exit(2); }
const [x, y, z] = nums.length === 3 ? nums : [nums[0], undefined, nums[1]];

const grid = generateTerrain();
const lighting = new Lighting(); lighting.attach(grid);
const world = { grid, lighting, timings: {}, lights: [], emitters: [], colliders: [], scene: { add() {} } };
const kit = new Kit({ assets: null, lighting, grid });
world.kit = kit;
kit.setPass('dry'); populate(kit, world); lighting.bake(); kit.setPass('wet'); populate(kit, world);
const collision = new Collision(grid, kit.colliders);
const game = { grid, collision, gameplay: world.gameplay, level: LEVEL, player: { x, y: y ?? grid.heightAt(x, z), z, yaw: 0, vx: 0, vy: 0, vz: 0, grounded: true, groundKind: 'terrain' } };

/** where a stage's function is defined: file:line (a search of the level scripts) */
const files = ['src/game/levelgen/layout.js', 'src/game/levelgen/scatter.js', 'src/game/levelgen/gameplay.js', 'src/game/levelgen/index.js'];
const sources = files.map((f) => ({ f, lines: fs.readFileSync(path.join(root, f), 'utf8').split('\n') }));
const where = (fn) => {
  if (!fn) return '';
  const re = new RegExp(`function\\*? ${fn}\\b`);
  for (const { f, lines } of sources) { const i = lines.findIndex((l) => re.test(l)); if (i >= 0) return `${f}:${i + 1}`; }
  return fn === 'populate' ? 'src/game/levelgen/index.js (populate)' : fn;
};
const f1 = (v) => v.toFixed(1);
const fx = (o) => `${o.x.toFixed(1)}, ${o.z.toFixed(1)}`;

const d = D.collect(game, {});
console.log(`spot  X ${f1(x)}  ${y === undefined ? '(ground)' : `Y ${f1(y)}`}  Z ${f1(z)}`);
console.log(`area  ${d.area.name}${d.area.inside ? '' : ` (${Math.round(d.area.d)} m away)`}${d.ground.road ? `   road ${d.ground.road.id} ${d.ground.road.d < 0.5 ? '(on it)' : f1(d.ground.road.d) + ' m'}` : ''}${d.ground.river !== null ? `   river ${f1(d.ground.river)} m` : ''}`);
console.log(`floor ${d.ground.tex}  (${d.ground.why})  slope ${Math.round(d.ground.slope)} deg  ground y ${d.ground.h.toFixed(2)}  grid cell ${d.ground.cell[0]},${d.ground.cell[1]}${d.ground.water > 0 ? `  water ${f1(d.ground.water)} m deep` : ''}`);
console.log('        (the texture rules are in src/game/terrain-mesh.js terrainPicker; the level design is src/game/level.js)');

const props = D.nearestProps(world.gameplay.placed, x, z, 40, radius);
console.log(`\nprops within ${radius} m: ${props.length}`);
for (const { rec, d: dist } of props) console.log(`  ${f1(dist).padStart(5)} m  ${rec.name.padEnd(18)} at ${fx(rec).padEnd(14)} ground y ${f1(rec.y)}  size ${rec.size}  rot ${rec.rot.toFixed(2)}   ${where(rec.src)}`);

const things = D.nearestThings(game, x, d.pos.y, z, 40, radius);
console.log(`\ngameplay things within ${radius} m: ${things.length}`);
for (const t of things) console.log(`  ${f1(t.d).padStart(5)} m  ${t.kind.padEnd(16)} at ${fx(t)}  y ${Number.isFinite(t.y) ? f1(t.y) : '-'}  ${t.note || ''}   ${where(t.src)}`);

const colls = D.nearestColliders(collision, x, z, 40, radius);
console.log(`\ncollision shapes within ${radius} m: ${colls.length}`);
for (const { c, d: dist } of colls) console.log(`  ${f1(dist).padStart(5)} m  ${D.colliderText(c).padEnd(30)} ${c.prop ? `${c.prop.name} at ${fx(c.prop)}   ${where(c.prop.src)}` : `${c.tag || 'collider'}   ${where(c.src)}`}`);
