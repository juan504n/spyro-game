// The level script of STARTER VALE: the stages the generic kit provides (the goals, the ring of light over the last one, the treasure) and the places of the realm, each a function that dresses
// one part of the country - the landing, the mere with its islet, the hidden glade, the lookout, the ridge and its Snuffers, the trees and flowers. Positions come from brief.js (the one
// place the design is written); everything here is expressed in world coordinates and validated against the terrain by ctx.h() / ctx.ok(), like levelgen/layout.js.
//
// Called twice by buildWorld (a dry pass, then a wet one): it must be deterministic - use ctx.rng, never Math.random.
import { makePopulate, goalsStage, exitStage, gemsStage, faceTo, flatSpot, band, lampsAlong, TAU } from '../index.js';
import { WATER_LEVEL } from '../../level.js';
import { BRIEF, REGIONS, GLADE } from './brief.js';

const regionBand = (ctx, id, f0, f1, lo, hi) => band(ctx, REGIONS, id, f0, f1, lo, hi);

export const populate = makePopulate(BRIEF, [
  goalsStage,
  layoutLanding, layoutMere, layoutGlade, layoutLookout, layoutDanger, layoutScatter,
  exitStage,
  gemsStage,
]);

// ---- the landing ------------------------------------------------------------------------------------------------------------------------------
function layoutLanding(ctx) {
  const { gp, put } = ctx, sp = ctx.L.spawn;
  for (const side of [-1, 1]) put('torch_stand', sp.x + side * 7, sp.z - 7, {}, 1.5);
  put('signpost', sp.x + 9, sp.z - 12, { rot: 0.2, boards: [{ yaw: -Math.PI / 2, y: 3.4, len: 2.3, tint: [0.7, 0.95, 0.92] }] }, 1.5);
  lampsAlong(ctx, 'main', 24, 16, 150);
  gp.hints.push({ x: sp.x, z: sp.z - 8, r: 9, text: 'WELCOME TO STARTER VALE! FOLLOW THE ROAD NORTH AND LIGHT THE LANTERNS', dur: 7 });
  ctx.addBunnies(sp.x - 14, sp.z - 20, 2, 6);
  for (const [x, z, g] of [[-8, 140, [1, 1, 2]], [14, 120, [2, 5]]]) ctx.addVase(x, z, g);
}

// ---- the mere and its islet ---------------------------------------------------------------------------------------------------------------------------
function layoutMere(ctx) {
  const { L, gp, put, rng, h } = ctx;
  const K = L.lake, I = K.islets[0];
  // stepping stones from the west shore out to the islet: hops a plain jump makes (under 6 m), each stone's top just over the water
  const xs = [I.x - I.r * 1.25 - 1.6, I.x - I.r * 1.25 - 5.2, I.x - I.r * 1.25 - 8.8].filter((x) => h(x, I.z) < WATER_LEVEL - 0.35);
  for (const x of xs) put('stepping_stone', x, I.z, { top: 1.9, h: WATER_LEVEL + 0.45 - h(x, I.z), span: 5 }, 2.6);
  // the islet's chest, beside the lantern (a secret: off the road, found by hopping out)
  gp.chests.push({ x: I.x + 2.6, y: h(I.x + 2.6, I.z + 1.2), z: I.z + 1.2, yaw: Math.PI / 2, gems: [10, 5], secret: 'isle' });
  put('crystal_cluster', I.x - 2.4, I.z - 2.2, { color: 'cyan', count: 4 }, 2);
  ctx.gemArc([[I.x - 14, 2.0, I.z], [I.x - 8, 3.6, I.z + 1], [I.x - 2, I.top + 1.8, I.z]], 5, 1);
  // reeds round the shore
  let placed = 0;
  for (let t = 0; t < 300 && placed < 16; t++) {
    const a = rng.float(0, TAU), d = rng.float(0.94, 1.03);
    const x = K.x + Math.cos(a) * K.rx * d, z = K.z + Math.sin(a) * K.rz * d;
    if (ctx.pathDist(x, z) < 3 || !ctx.occ.free(x, z, 1.6) || Math.hypot(x - (I.x - 14), z - I.z) < 6) continue;
    if (put('reeds', x, z, { rot: rng.float(0, TAU), r: 2.6, count: 9 }, 1.6)) placed++;
  }
  ctx.scatter('rock_cluster', 5, regionBand(ctx, 'shore', 0.5, 1.0), { r: 3.5, path: 3, lake: 1.3 });
  ctx.addBunnies(-30, 70, 3, 7);
  for (const [x, z, g] of [[-30, 72, [1, 1, 2]], [-38, 40, [2, 5]]]) ctx.addVase(x, z, g);
}

// ---- the hidden glade: a floor walled in by rock, its way in shut with a cracked wall -----------------------------------------------------------
function layoutGlade(ctx) {
  const { gp, put, h } = ctx;
  const G = REGIONS.find((r) => r.id === 'glade').pts, a = G[0], b = G[1], c = G[2];
  const dx = c[0] - a[0], dz = c[1] - a[1], dl = Math.hypot(dx, dz), ux = dx / dl, uz = dz / dl, yaw = Math.atan2(ux, uz);
  ctx.addWall(b[0], b[1], yaw, 8.4, 5.6, [25]);
  gp.hints.push({ x: a[0] - ux * 8, z: a[1] - uz * 8, r: 9, text: 'THAT WALL LOOKS CRACKED... TRY CHARGING IT', dur: 6 });
  const at = (along, side = 0) => [c[0] + ux * along - uz * side, c[1] + uz * along + ux * side];
  const [cx, cz] = at(5);
  gp.chests.push({ x: cx, y: h(cx, cz), z: cz, yaw: yaw + Math.PI, gems: [10, 10], secret: 'glade' });
  for (const [al, s, r] of [[-2, -5, 3], [-4, 5, 3], [2, 5.5, 2.4]]) put('flower_patch', ...at(al, s), { r, count: 12 }, r);
  put('bench', ...at(-3, -6), { rot: yaw + Math.PI / 2 }, 1.6);
  put('crystal_cluster', ...at(7, 3.5), { color: 'violet', count: 5 }, 2.4);
  gp.purple.push([at(0, 0)[0], h(...at(0, 0)) + 1.3, at(0, 0)[1]]);
  void GLADE;
}

// ---- the lookout: a spur off the ridge road, a view and a chest at its end -------------------------------------------------------------------------
function layoutLookout(ctx) {
  const { gp, put, h } = ctx;
  const P = REGIONS.find((r) => r.id === 'lookout').pts, end = P[P.length - 1];
  gp.chests.push({ x: end[0] - 3, y: h(end[0] - 3, end[1]), z: end[1], yaw: -Math.PI / 2, gems: [10, 5, 5], secret: 'ledge' });
  put('bench', end[0] - 6, end[1] + 3, { rot: faceTo(end[0] - 6, end[1] + 3, end[0] + 20, end[1]) }, 1.6);
  put('crystal_cluster', end[0] - 1, end[1] - 3.5, { color: 'cyan', count: 5 }, 2.4);
  gp.hints.push({ x: P[1][0], z: P[1][1], r: 10, text: 'A SIDE TRAIL RUNS OUT TO A LOOKOUT. THE VIEW IS WORTH IT!', dur: 6 });
}

// ---- the Snuffers: quiet at the start, more of them and harder ones as the way climbs -----------------------------------------------------------------
function layoutDanger(ctx) {
  const { gp } = ctx;
  const side = (p, k) => [p.x + p.dz * k, p.z - p.dx * k];
  // [road, how far along it (0..1), kind]
  // (a realm has a cast: five kinds of Snuffer at least, three of them of the foes of foes/kinds.js, in the order of their danger: a realm that is its own begins by choosing which)
  const marks = [['main', 0.7, 'thief'], ['shore', 0.25, 'basic'], ['shore', 0.7, 'slinger'],
    ['ridge', 0.12, 'basic'], ['ridge', 0.22, 'bell'], ['ridge', 0.34, 'basic'], ['ridge', 0.46, 'thorn'], ['ridge', 0.58, 'pup'], ['ridge', 0.7, 'thorn'], ['ridge', 0.8, 'bell'], ['ridge', 0.9, 'thorn']];
  marks.forEach(([road, t, kind], i) => { const p = ctx.pathPoint(road, t), [x, z] = side(p, i % 2 ? 3.6 : -3.6); ctx.addEnemy(x, z, kind, 4); });
  for (const t of [0.2, 0.45, 0.7]) { const p = ctx.pathPoint('ridge', t), [x, z] = side(p, 4.4); ctx.addVase(x, z, [2, 5]); }
  gp.hints.push({ x: 0, z: 90, r: 12, text: 'ARMOURED SNUFFERS: FIRE BOUNCES OFF BELLS, SPIKES HURT WHEN RAMMED', dur: 7 });
}

// ---- trees, flowers, rocks -----------------------------------------------------------------------------------------------------------------------------
function layoutScatter(ctx) {
  const { rng } = ctx;
  const trees = (id, n, f0, f1) => ctx.scatter('tree_round', n, regionBand(ctx, id, f0, f1), { r: 4.5, path: 4, maxSlope: 0.4 }, () => ({ canopy: rng.pick(['leaves_green', 'leaves_teal']), size: rng.pick(['m', 'l']) }));
  trees('landing', 8, 0.6, 1.1); trees('meadow', 18, 0.5, 1.1); trees('shore', 10, 0.6, 1.2);
  for (const id of ['landing', 'meadow', 'shore']) {
    ctx.scatter('bush', 8, regionBand(ctx, id, 0.2, 1.0), { r: 1.6, path: 2.6 }, () => ({ flowers: rng.chance(0.6) }));
    ctx.scatter('flower_patch', 12, regionBand(ctx, id, 0.15, 1.0), { r: 3, path: 3 }, () => ({ r: 4, count: 12 }));
  }
  ctx.scatter('tree_pine', 24, regionBand(ctx, 'ridge', 0.7, 1.2), { r: 3.5, path: 4, maxSlope: 0.45, minH: 1 }, () => ({ size: rng.pick(['s', 'm', 'l']) }));
  ctx.scatter('rock_cluster', 14, regionBand(ctx, 'ridge', 0.7, 1.3), { r: 3.5, path: 3, maxSlope: 0.5 });
  ctx.scatter('boulder_big', 5, regionBand(ctx, 'ridge', 0.9, 1.4), { r: 4.5, path: 3, maxSlope: 0.55 });
  void flatSpot;
}
