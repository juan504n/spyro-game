// The level script of EMBERFALL CRAGS: the stages the kit provides (the goals, the ring of light over the last one, the treasure) and the places of the realm, each a function that dresses one part of
// the country - the Forge Gate and the Cinder Flats, the Cinder Grove and its clearing, the ash glade behind its cracked wall, the Basalt Stair and the rim, the Ember Rift and the stack in it, the
// two long ways round it, the Anvil Plateau, the Maw and its ward, the Smelter (the Furnace, the balcony), the Cinder Gorge, the caldera, the Snuffers, the trees. Positions come from brief.js;
// everything here is expressed in world coordinates and validated against the terrain by ctx.h() / ctx.ok(). Called twice by buildWorld (a dry pass, then a wet one): it must be deterministic -
// ctx.rng, never Math.random.
import { makePopulate, goalsStage, exitStage, gemsStage, faceTo, inFront, band, lampsAlong, TAU } from '../realm/index.js';
import { BRIEF, REGIONS, LAKE, ANVIL, ASH_GLADE, CALDERA, GATE, DOOR } from './brief.js';
import { SMELTER, FURNACE, LEDGE, PLINTH } from './smelter.js';

const regionBand = (ctx, id, f0, f1, lo, hi) => band(ctx, REGIONS, id, f0, f1, lo, hi);
const pts = (id) => REGIONS.find((r) => r.id === id).pts;
const goal = (id) => BRIEF.goals.find((q) => q.id === id);
/** a drift of fire lilies: the meadow flowers of this country, and no green tufts (the palette has no green) */
const lilies = (r = 3.0, count = 8) => ({ r, count, kinds: ['flower_ember'], tufts: false });
const spire = (rng) => ({ h: rng.int(8, 15) });
const flameTree = (rng) => ({ canopy: 'leaves_autumn', size: rng.pick(['s', 'm', 'm', 'l']) });
/** the Maw: where the mouth of the cave is cut in the bastion of the mountain (its origin is the ground in the middle of the mouth, its front looks west) */
export const MAW = { x: 102, z: 20, rot: -Math.PI / 2 };

export const populate = makePopulate(BRIEF, [
  goalsStage,
  layoutForgeGate, layoutFlats, layoutGrove, layoutAshGlade, layoutStair, layoutRift, layoutNorthway, layoutAshway, layoutPlateau, layoutMaw, layoutSmelter, layoutGorge, layoutCaldera,
  layoutDanger, layoutScatter,
  exitStage,
  gemsStage,
], { seed: 7417 });

// ---- the Forge Gate: where the door of Dawnhaven stands, and the first plain -----------------------------------------------------------------------
function layoutForgeGate(ctx) {
  const { gp, put } = ctx, sp = ctx.L.spawn;
  const y = ctx.h(DOOR.x, DOOR.z);
  put('realm_door', DOOR.x, DOOR.z, { rot: DOOR.yaw, color: DOOR.color, sealed: false, y }, 12);
  gp.portals.push({ id: DOOR.id, name: DOOR.name, tag: DOOR.tag, kind: 'door', shape: 'arch', x: DOOR.x, y, z: DOOR.z, yaw: DOOR.yaw, r: 2.6, hs: 3.1, cy: 3.4, color: DOOR.color, target: DOOR.target, state: 'open' });
  gp.soundSources.push({ name: 'portal_hum', x: DOOR.x, y: y + 3.4, z: DOOR.z, range: 44, vol: 1.3, when: `portal:${DOOR.id}` });
  for (const side of [-1, 1]) {
    put('torch_stand', ...inFront(DOOR, 6.4, side * 5.4), { rot: DOOR.yaw }, 1.5);
    put('crystal_cluster', ...inFront(DOOR, 3, side * 9), { color: 'ember', count: 5 }, 2.4);
    put('banner_pole', ...inFront(DOOR, 9, side * 9), { rot: DOOR.yaw + side * Math.PI / 2 }, 1);
    put('ember_vent', ...inFront(DOOR, 15, side * 10), { rot: DOOR.yaw + 0.4 * side }, 2);
  }
  // the first plain: a signpost where the trunk forks to the grove, lamps along the road, the first hints
  put('signpost', -128, 42, { rot: 0.2, boards: [
    { yaw: -Math.PI / 2, y: 3.4, len: 2.3, tint: [1.0, 0.7, 0.4] },          // north: the Cinder Grove
    { yaw: 0, y: 2.6, len: 2.2, tint: [0.9, 0.9, 0.9] },                      // east: the Rift
  ] }, 1.5);
  lampsAlong(ctx, 'trunk', 26, 14, 150, 1.8, 'torch_stand');
  ctx.gp.hints.push({ x: sp.x + 6, z: sp.z, r: 9, text: 'WELCOME TO EMBERFALL CRAGS! THE FORGES ARE COLD. KINDLE THE EMBERSTONES WITH FIRE', dur: 7 });
  gp.hints.push({ x: -100, z: 30, r: 12, text: 'THE STAIR CLIMBS TO THE RIM OF THE RIFT. THE ASHWAY ROUNDS ITS SOUTH END', dur: 7 });
  for (const [x, z, g] of [[-168, 50, [1, 1, 2]], [-150, 20, [2, 5]], [-110, 48, [1, 1, 1]]]) ctx.addVase(x, z, g);
}

// ---- the Cinder Flats: a plain of ash, the first Emberstone in a ring of standing stones ----------------------------------------------------------------
function layoutFlats(ctx) {
  const { put, rng } = ctx;
  const g = goal('gate');
  put('standing_stones', g.x, g.z, { r: 7, count: 7, glowColor: [1.0, 0.55, 0.2] }, 9);
  ctx.scatter('rock_spire', 14, regionBand(ctx, 'flats', 0.55, 1.2), { r: 3.4, path: 4, maxSlope: 0.4 }, () => spire(rng));
  ctx.scatter('dead_tree', 30, regionBand(ctx, 'flats', 0.4, 1.25), { r: 2.4, path: 4, maxSlope: 0.45 }, () => ({ size: rng.pick(['s', 'm', 'l']) }));
  ctx.scatter('tree_round', 6, regionBand(ctx, 'flats', 0.6, 1.2), { r: 4.2, path: 4, maxSlope: 0.4 }, () => flameTree(rng));
  ctx.scatter('basalt_columns', 7, regionBand(ctx, 'flats', 0.7, 1.3), { r: 5, path: 4, maxSlope: 0.35 }, () => ({ rings: rng.int(1, 2), h: rng.float(3, 6.5) }));
  ctx.scatter('rock_cluster', 10, regionBand(ctx, 'flats', 0.5, 1.2), { r: 3.5, path: 3 });
  ctx.scatter('ember_vent', 9, regionBand(ctx, 'flats', 0.3, 1.0), { r: 2.4, path: 3.5, maxSlope: 0.3 }, () => ({ rot: rng.float(0, TAU) }));
  ctx.scatter('flower_patch', 12, regionBand(ctx, 'flats', 0.3, 1.0), { r: 3, path: 3 }, () => lilies());
  ctx.scatter('crystal_cluster', 6, regionBand(ctx, 'flats', 0.6, 1.2), { r: 2.4, path: 3 }, () => ({ color: 'ember', count: 4 + rng.int(0, 3) }));
  for (const [x, z, g2] of [[-138, 56, [1, 1, 2]], [-120, 64, [2, 5]]]) ctx.addVase(x, z, g2);
}

// ---- the Cinder Grove: a stand of dead trees and spires with a clearing in it, the second Emberstone ---------------------------------------------------
function layoutGrove(ctx) {
  const { gp, put, rng } = ctx;
  const g = goal('grove');
  put('standing_stones', g.x, g.z, { r: 9, count: 7, glowColor: [1.0, 0.5, 0.18] }, 11);
  for (let k = 0; k < 6; k++) {                                        // a ring of tall black spires round the clearing, the way in left open (the south)
    const a = (k / 6) * TAU + 0.5, x = g.x + Math.cos(a) * 15, z = g.z + Math.sin(a) * 15;
    if (Math.hypot(x - g.x, z - (g.z + 15)) < 6) continue;
    put('rock_spire', x, z, { h: 10 + (k % 3) * 2 }, 4);
  }
  ctx.addVase(g.x - 9, g.z + 10, [2, 5]); ctx.addVase(g.x + 8, g.z + 11, [1, 1, 2]);
  ctx.scatter('dead_tree', 60, regionBand(ctx, 'grove', 0.4, 1.2), { r: 2.4, path: 4, maxSlope: 0.45 }, () => ({ size: rng.pick(['s', 'm', 'l']) }));
  ctx.scatter('tree_round', 10, regionBand(ctx, 'grove', 0.5, 1.15), { r: 4.2, path: 4, maxSlope: 0.4 }, () => flameTree(rng));
  ctx.scatter('fallen_log', 5, regionBand(ctx, 'grove', 0.5, 1.0), { r: 2.4, path: 3 });
  ctx.scatter('stump', 6, regionBand(ctx, 'grove', 0.5, 1.1), { r: 2, path: 3 });
  ctx.scatter('rock_cluster', 8, regionBand(ctx, 'grove', 0.5, 1.2), { r: 3.5, path: 3 });
  ctx.scatter('ember_vent', 5, regionBand(ctx, 'grove', 0.4, 1.0), { r: 2.4, path: 3.5, maxSlope: 0.3 }, () => ({ rot: rng.float(0, TAU) }));
  ctx.scatter('flower_patch', 8, regionBand(ctx, 'grove', 0.3, 1.0), { r: 3, path: 3 }, () => lilies());
  gp.hints.push({ x: -124, z: -12, r: 12, text: 'THE CINDER GROVE: A CLEARING OF BLACK SPIRES LIES AT THE END OF THE TRAIL', dur: 6 });
}

// ---- the ash glade: a floor walled in by rock, its way in shut with a cracked wall -----------------------------------------------------------------------
function layoutAshGlade(ctx) {
  const { gp, put, h } = ctx;
  const G = pts('ashglade'), a = G[0], b = G[1], c = G[2];
  const dx = c[0] - a[0], dz = c[1] - a[1], dl = Math.hypot(dx, dz), ux = dx / dl, uz = dz / dl, yaw = Math.atan2(ux, uz);
  ctx.addWall(b[0], b[1], yaw, 8.4, 5.6, [25]);
  gp.hints.push({ x: a[0] - ux * 8, z: a[1] - uz * 8, r: 9, text: 'THAT WALL OF BASALT LOOKS CRACKED... TRY CHARGING IT', dur: 6 });
  const at = (along, side = 0) => [c[0] + ux * along - uz * side, c[1] + uz * along + ux * side];
  const [cx, cz] = at(5);
  gp.chests.push({ x: cx, y: h(cx, cz), z: cz, yaw: yaw + Math.PI, gems: [10, 10], secret: 'ashglade' });
  for (const [al, s, r] of [[-2, -5, 3], [-4, 5, 3], [2, 5.5, 2.4], [2, -5.5, 2.4]]) put('flower_patch', ...at(al, s), lilies(r, 12), r);
  put('crystal_cluster', ...at(7, 3.5), { color: 'ember', count: 5 }, 2.4);
  put('ember_vent', ...at(0, -3.2), {}, 2);
  put('dead_tree', ...at(1, 7), { size: 'm' }, 2.5);
  gp.purple.push([at(0, 0)[0], h(...at(0, 0)) + 1.3, at(0, 0)[1]]);
}

// ---- the Basalt Stair: a climb in switchbacks to the rim -----------------------------------------------------------------------------------------------
function layoutStair(ctx) {
  const { gp, put, rng, h } = ctx;
  lampsAlong(ctx, 'stair', 30, 10, 220, 1.8, 'torch_stand');
  put('signpost', -88, 12, { rot: 0.3, boards: [
    { yaw: -Math.PI * 0.35, y: 3.4, len: 2.3, tint: [1.0, 0.7, 0.4] },        // up: the rim, and the glide over the rift
  ] }, 1.5);
  gp.hints.push({ x: -80, z: 14, r: 12, text: 'THE BASALT STAIR CLIMBS TO THE RIM OF THE RIFT. FROM THE RIM THE HERO CAN GLIDE OVER THE LAVA', dur: 7 });
  ctx.scatter('basalt_columns', 8, regionBand(ctx, 'stair', 0.9, 1.5), { r: 5, path: 3.5, maxSlope: 0.5 }, () => ({ rings: rng.int(1, 2), h: rng.float(3, 7) }));
  ctx.scatter('rock_spire', 8, regionBand(ctx, 'stair', 1.0, 1.7), { r: 3.4, path: 4, maxSlope: 0.6 }, () => spire(rng));
  ctx.scatter('dead_tree', 14, regionBand(ctx, 'stair', 0.9, 1.6), { r: 2.4, path: 4, maxSlope: 0.55 }, () => ({ size: rng.pick(['s', 'm']) }));
  ctx.scatter('ember_vent', 5, regionBand(ctx, 'stair', 0.4, 1.0), { r: 2.4, path: 3.5, maxSlope: 0.35 }, () => ({ rot: rng.float(0, TAU) }));
  for (const t of [0.3, 0.62]) { const p = ctx.pathPoint('stair', t); ctx.addVase(p.x + p.dz * 4.4, p.z - p.dx * 4.4, [2, 5]); }
  void h;
}

// ---- the Ember Rift and its stack: the rim looks over the lava, and the third Emberstone burns on a stack of basalt in the middle of it ---------------------
function layoutRift(ctx) {
  const { gp, put, rng, h } = ctx;
  const g = goal('anvil');
  // the stack: a ring of standing stones round the stone, crystals and spires on its rim; one level crown of rock the hero can land on (the flat top is 13 m across)
  put('standing_stones', g.x, g.z, { r: 5.2, count: 7, glowColor: [1.0, 0.55, 0.2] }, 0);
  for (const [dx, dz] of [[-4.2, -3.6], [4.0, 3.8], [0.5, 5.8]]) put('crystal_cluster', g.x + dx, g.z + dz, { color: 'ember', count: 4 }, 0);
  gp.soundSources.push({ name: 'portal_hum', x: g.x, y: g.y + 2, z: g.z, range: 50, vol: 0.5 });
  // the lava's low hiss: a bed of fire noise over the length of the rift (three loops, each heard from the rim and the banks; they die away inside the Smelter and the far country)
  for (const z of [-44, 4, 52]) gp.soundSources.push({ name: 'flame_loop', x: LAKE.x, y: 1.5, z, range: 62, vol: 0.2 });
  // the rim: torches along the edge where the glide begins, a bench to look at the rift from, the hint
  const edge = (z) => { for (let x = -34; x > -52; x -= 0.6) { if (h(x, z) > 18 && h(x + 0.6, z) < h(x, z) - 0.8) return x; } return -42; };
  for (const z of [-18, -2, 14, 30]) { const x = edge(z) - 3.2; put('torch_stand', x, z, { rot: -Math.PI / 2 }, 1.2); }
  const bx = edge(4) - 4;
  put('bench', bx, 8, { rot: Math.PI / 2 }, 1.6);
  put('signpost', bx - 3, -6, { rot: 1.6, boards: [{ yaw: 0, y: 3.4, len: 2.3, tint: [1.0, 0.7, 0.4] }] }, 1.5);
  gp.hints.push({ x: bx, z: 4, r: 16, text: 'THE ANVIL STONE BURNS ON THE STACK IN THE LAVA. RUN OFF THE EDGE AND GLIDE: HOLD JUMP IN THE AIR', dur: 8 });
  gp.hints.push({ x: g.x, z: g.z + 7, r: 10, text: 'FROM THE STACK, GLIDE EAST TO THE ANVIL PLATEAU. THE LAVA BURNS!', dur: 7, y0: g.y - 3, y1: g.y + 6 });
  // gems lead the way across: an arc from the rim to the stack, another from the stack to the plateau (a glide is a way, and the way is shown)
  const e0 = edge(4), top = g.y + 1.8;
  ctx.gemArc([[e0 - 1, h(e0 - 1, 4) + 2.2, 4], [(e0 + g.x) / 2, (h(e0, 4) + top) / 2 + 1.4, 4], [g.x - 5, top, 4]], 6, [1, 1, 2]);
  ctx.gemArc([[g.x + 5, top, 4], [(g.x + 34) / 2 + 4, (top + 8) / 2 + 1.6, 4], [34, h(34, 4) + 3.0, 4]], 6, [1, 1, 2]);
  // the glow of the lava on the rock round it: vents along the rim's edge
  for (const z of [-40, -14, 12, 38]) { const x = edge(z) - 6; if (ctx.ok(x, z, { r: 2, path: 3, maxSlope: 0.4 })) put('ember_vent', x, z, { rot: rng.float(0, TAU) }, 2); }
  ctx.scatter('basalt_columns', 7, regionBand(ctx, 'rim', 0.9, 1.4, 0.0, 1.0), { r: 5, path: 3.5, maxSlope: 0.5 }, () => ({ rings: rng.int(1, 2), h: rng.float(3, 7) }));
  ctx.scatter('rock_spire', 6, regionBand(ctx, 'rim', 0.8, 1.4), { r: 3.4, path: 4, maxSlope: 0.6 }, () => spire(rng));
  ctx.scatter('crystal_cluster', 6, regionBand(ctx, 'rim', 0.6, 1.2), { r: 2.4, path: 3 }, () => ({ color: 'ember', count: 4 + rng.int(0, 3) }));
  void LAKE; void ANVIL;
}

// ---- the North Causeway: round the north end of the rift, down from the rim to the plateau -------------------------------------------------------------------
function layoutNorthway(ctx) {
  const { gp, rng } = ctx;
  lampsAlong(ctx, 'rim', 34, 12, 220, 1.8, 'torch_stand');
  lampsAlong(ctx, 'northway', 34, 10, 330, 1.8, 'torch_stand');
  gp.hints.push({ x: -50, z: -118, r: 12, text: 'THE NORTH CAUSEWAY RUNS ROUND THE END OF THE RIFT TO THE ANVIL PLATEAU', dur: 7 });
  ctx.scatter('basalt_columns', 8, regionBand(ctx, 'northway', 0.8, 1.3), { r: 5, path: 3.5, maxSlope: 0.45 }, () => ({ rings: rng.int(1, 2), h: rng.float(3, 7) }));
  ctx.scatter('rock_spire', 10, regionBand(ctx, 'northway', 0.9, 1.5), { r: 3.4, path: 4, maxSlope: 0.5 }, () => spire(rng));
  ctx.scatter('dead_tree', 14, regionBand(ctx, 'northway', 0.7, 1.3), { r: 2.4, path: 4, maxSlope: 0.45 }, () => ({ size: rng.pick(['s', 'm', 'l']) }));
  ctx.scatter('ember_vent', 6, regionBand(ctx, 'northway', 0.4, 1.0), { r: 2.4, path: 3.5, maxSlope: 0.3 }, () => ({ rot: rng.float(0, TAU) }));
  ctx.scatter('crystal_cluster', 6, regionBand(ctx, 'northway', 0.6, 1.2), { r: 2.4, path: 3 }, () => ({ color: 'ember', count: 4 + rng.int(0, 3) }));
  for (const t of [0.25, 0.5, 0.78]) { const p = ctx.pathPoint('northway', t); ctx.addVase(p.x + p.dz * 4.4, p.z - p.dx * 4.4, [2, 5]); }
}

// ---- the Ashway: round the south end of the rift, where the lava ends in a beach of cinder; a lookout off it, with a chest ------------------------------------
function layoutAshway(ctx) {
  const { gp, put, rng, h } = ctx;
  lampsAlong(ctx, 'ashway', 36, 14, 400, 1.8, 'torch_stand');
  gp.hints.push({ x: -60, z: 92, r: 12, text: 'THE ASHWAY RUNS ROUND THE SOUTH END OF THE RIFT. KEEP OFF THE BEACH: THE LAVA BURNS', dur: 7 });
  // the lookout: a spur south off the road to a crag with a chest at its end, a bench and a view of the whole rift
  const L = pts('lookout'), end = L[L.length - 1];
  gp.chests.push({ x: end[0] - 2, y: h(end[0] - 2, end[1] - 4), z: end[1] - 4, yaw: -Math.PI / 2, gems: [10, 5, 5], secret: 'lookout' });
  put('bench', end[0] - 6, end[1] - 8, { rot: faceTo(end[0] - 6, end[1] - 8, -4, 40) }, 1.6);
  put('crystal_cluster', end[0] + 2, end[1] - 6, { color: 'ember', count: 5 }, 2.4);
  gp.hints.push({ x: L[1][0], z: L[1][1], r: 10, text: 'A SIDE TRAIL CLIMBS TO A LOOKOUT OVER THE RIFT. THE LAVA IS BEAUTIFUL FROM HERE', dur: 6 });
  ctx.scatter('basalt_columns', 6, regionBand(ctx, 'ashway', 0.8, 1.3), { r: 5, path: 3.5, maxSlope: 0.4 }, () => ({ rings: rng.int(1, 2), h: rng.float(3, 6.5) }));
  ctx.scatter('rock_spire', 10, regionBand(ctx, 'ashway', 0.9, 1.5), { r: 3.4, path: 4, maxSlope: 0.5 }, () => spire(rng));
  ctx.scatter('dead_tree', 16, regionBand(ctx, 'ashway', 0.6, 1.3), { r: 2.4, path: 4, maxSlope: 0.45 }, () => ({ size: rng.pick(['s', 'm', 'l']) }));
  ctx.scatter('ember_vent', 8, regionBand(ctx, 'ashway', 0.3, 1.0), { r: 2.4, path: 3.5, maxSlope: 0.3 }, () => ({ rot: rng.float(0, TAU) }));
  ctx.scatter('flower_patch', 10, regionBand(ctx, 'ashway', 0.3, 1.0), { r: 3, path: 3 }, () => lilies());
  ctx.scatter('rock_cluster', 8, regionBand(ctx, 'ashway', 0.6, 1.3), { r: 3.5, path: 3 });
  for (const t of [0.2, 0.45, 0.7, 0.9]) { const p = ctx.pathPoint('ashway', t); ctx.addVase(p.x + p.dz * 4.4, p.z - p.dx * 4.4, [2, 5]); }
}

// ---- the Anvil Plateau: the far bank of the rift, a ruined forge and the great stone anvil that gives the place its name ---------------------------------------
function layoutPlateau(ctx) {
  const { gp, put, rng } = ctx;
  put('giant_anvil', 78, -22, { rot: -0.5 }, 11);
  put('ruin_pillars', 42, -34, { rot: 0.3 }, 6);
  put('ruin_pillars', 90, -8, { rot: -0.4 }, 6);
  put('wall_stone', 92, -34, { rot: 1.2, len: 7 }, 3);
  for (const [x, z] of [[58, 10], [64, 28]]) put('torch_stand', x, z, {}, 1.4);
  put('signpost', 54, 24, { rot: -0.3, boards: [
    { yaw: 0, y: 3.4, len: 2.3, tint: [1.0, 0.55, 0.2] },                      // east: the Maw
    { yaw: -Math.PI / 2, y: 2.6, len: 2.2, tint: [0.9, 0.9, 0.9] },            // north: the causeway
    { yaw: Math.PI / 2, y: 1.8, len: 2.1, tint: [0.9, 0.9, 0.9] },             // south: the Ashway
  ] }, 1.5);
  gp.hints.push({ x: 70, z: 22, r: 14, text: 'THE ANVIL PLATEAU. THE MAW LIES TO THE EAST: A WARD OF FIRE SHUTS IT UNTIL THREE EMBERSTONES BURN', dur: 8 });
  lampsAlong(ctx, 'shelf', 36, 12, 330, 1.8, 'torch_stand');
  ctx.scatter('basalt_columns', 8, regionBand(ctx, 'shelf', 0.7, 1.3), { r: 5, path: 3.5, maxSlope: 0.35 }, () => ({ rings: rng.int(1, 2), h: rng.float(3, 6.5) }));
  ctx.scatter('rock_spire', 8, regionBand(ctx, 'shelf', 0.8, 1.4), { r: 3.4, path: 4, maxSlope: 0.4 }, () => spire(rng));
  ctx.scatter('dead_tree', 12, regionBand(ctx, 'shelf', 0.6, 1.3), { r: 2.4, path: 4, maxSlope: 0.4 }, () => ({ size: rng.pick(['s', 'm', 'l']) }));
  ctx.scatter('ember_vent', 8, regionBand(ctx, 'shelf', 0.3, 1.0), { r: 2.4, path: 3.5, maxSlope: 0.3 }, () => ({ rot: rng.float(0, TAU) }));
  ctx.scatter('crystal_cluster', 6, regionBand(ctx, 'shelf', 0.6, 1.2), { r: 2.4, path: 3 }, () => ({ color: 'ember', count: 4 + rng.int(0, 3) }));
  ctx.scatter('flower_patch', 8, regionBand(ctx, 'shelf', 0.3, 1.0), { r: 3, path: 3 }, () => lilies());
  ctx.scatter('rock_cluster', 8, regionBand(ctx, 'shelf', 0.6, 1.3), { r: 3.5, path: 3 });
  for (const [x, z, g] of [[48, 40, [1, 1, 2]], [44, -4, [2, 5]], [86, 28, [1, 2]], [74, -56, [2, 2]]]) ctx.addVase(x, z, g);
}

// ---- the Maw: a stone dragon's mouth cut in the bastion of the mountain, shut by a ward of fire --------------------------------------------------------------
function layoutMaw(ctx) {
  const { gp, put, h } = ctx;
  put('dragon_maw', MAW.x, MAW.z, { rot: MAW.rot }, 15);
  const gate = ctx.anchor('dragon_maw', 'barrier', MAW.x, MAW.z, { rot: MAW.rot });
  gp.barrier = { x: gate ? gate[0] : GATE.x, y: gate ? gate[1] : h(GATE.x, GATE.z), z: gate ? gate[2] : GATE.z, yaw: GATE.yaw, opts: { tint: [1.8, 1.45, 0.16], w: 6.3, wTop: 6.3, h: 6.2, arch: 1.4 } };      // (the field is fire, not the Dawn Gate's violet)
  gp.soundSources.push({ name: 'portal_hum', x: gp.barrier.x, y: gp.barrier.y + 3, z: gp.barrier.z, range: 38, vol: 1.2, when: 'barrier' });
  gp.hints.push({ x: MAW.x - 12, z: MAW.z, r: 12, text: 'THE WARD OF FIRE OPENS WHEN THREE EMBERSTONES BURN', dur: 7 });
  for (const side of [-1, 1]) {
    put('torch_stand', MAW.x - 9, MAW.z + side * 9, {}, 1.5);
    put('crystal_cluster', MAW.x - 6, MAW.z + side * 12, { color: 'ember', count: 5 }, 2.4);
    put('ember_vent', MAW.x - 14, MAW.z + side * 6, { rot: side }, 2);
  }
  for (let k = 0; k < 5; k++) { const z = MAW.z - 24 + k * 12; if (Math.abs(z - MAW.z) > 8) put('basalt_columns', MAW.x - 4, z, { rings: 1, h: 4 + (k % 3) }, 5); }
  ctx.addVase(MAW.x - 14, MAW.z + 8, [1, 1, 2]); ctx.addVase(MAW.x - 14, MAW.z - 8, [2, 5]);
}

// ---- the Smelter: the cave through the mountain -------------------------------------------------------------------------------------------------------------
/** torches along a tunnel, alternating sides, from `s0` every `every` metres */
function torchesAlong(ctx, name, every, s0, s1 = Infinity, margin = 1.3) {
  const len = SMELTER.length(name);
  let k = 0;
  for (let s = s0; s <= Math.min(len - 2, s1); s += every, k++) {
    const q = SMELTER.at(name, s), p = SMELTER.at(name, s, (k % 2 ? 1 : -1) * (q.hw - margin));
    ctx.put('torch_stand', p.x, p.z, { rot: p.yaw }, 1.2);
  }
}
/** coal crystals at a tunnel's walls: [s, side (+ right, - left), count] */
function crystalsIn(ctx, name, list) {
  for (const [s, side, count] of list) { const p = SMELTER.at(name, s, side); ctx.put('crystal_cluster', p.x, p.z, { rot: (s * 7.3 + side) % TAU, color: 'ember', count: count ?? 5 }, 2.2); }
}
/** a line of gems along a tunnel's middle, the values cycling */
function gemsAlong(ctx, name, every, pattern, s0, s1 = Infinity) {
  const len = SMELTER.length(name);
  let k = 0;
  for (let s = s0; s <= Math.min(len - 1.5, s1); s += every) { const p = SMELTER.at(name, s); ctx.addGem(p.x, p.z, pattern[k++ % pattern.length]); }
}

function layoutSmelter(ctx) {
  const { gp, put, h } = ctx;
  // the way in: torches and coals, a trail of gems up to the Furnace, a vase or two
  torchesAlong(ctx, 'maw', 9, 12);
  crystalsIn(ctx, 'maw', [[14, -3.0, 5], [22, 3.2, 4], [32, -3.6, 5], [40, 3.8, 4]]);
  gemsAlong(ctx, 'maw', 5.5, [1, 1, 2], 14);
  for (const s of [20, 34]) { const p = SMELTER.at('maw', s, s > 27 ? 2.6 : -2.6); ctx.addVase(p.x, p.z, s > 27 ? [1, 2] : [1, 1, 1], h(p.x, p.z)); }
  gp.hints.push({ x: SMELTER.at('maw', 10).x, z: SMELTER.at('maw', 10).z, r: 8, text: 'THE SMELTER: A CAVE THROUGH THE MOUNTAIN. FOLLOW THE TORCHES TO THE FURNACE', dur: 6 });

  // the Furnace: the skylight pours its light on the Emberstone, black spires and coals round the rim, a forge's anvil and tools, guardians
  const at = (deg, r) => [FURNACE.x + Math.cos(deg * TAU / 360) * r, FURNACE.z + Math.sin(deg * TAU / 360) * r];
  put('light_shaft', FURNACE.x, FURNACE.z, { h: 14, r0: 2.2, r1: 3.3, color: [1.0, 0.7, 0.4], glow: [1.0, 0.55, 0.22] }, 0);
  put('standing_stones', FURNACE.x, FURNACE.z, { r: 6.4, count: 7, glowColor: [1.0, 0.55, 0.2] }, 8);
  for (const deg of [30, 120, 205, 300]) { const [x, z] = at(deg, 11.4); put('torch_stand', x, z, {}, 1.2); }
  for (const [deg, r] of [[60, 10.6], [92, 11], [170, 10.8], [250, 10.4], [335, 10.8]]) { const [x, z] = at(deg, r); put('crystal_cluster', x, z, { rot: deg, color: 'ember', count: 6 }, 2.6); }
  for (const deg of [75, 275]) { const [x, z] = at(deg, 11.6); put('crystal_spire', x, z, { color: 'ember', h: 7 }, 2.4); }
  const [ax, az] = at(230, 9.6); put('giant_anvil', ax, az, { rot: 0.8, scale: 0.5 }, 5);
  for (let i = 0; i < 10; i++) { const [x, z] = at(i * 36 + 18, 8.6); ctx.addGem(x, z, i % 5 === 0 ? 2 : 1); }
  for (const [deg, g] of [[100, [1, 2]], [200, [5]], [320, [1, 1, 2]]]) { const [x, z] = at(deg, 9.4); ctx.addVase(x, z, g, h(x, z)); }
  ctx.addEnemy(...at(160, 8.4), 'bell', 3);
  ctx.addEnemy(...at(345, 8.4), 'thorn', 3);
  ctx.addEnemy(...at(250, 8.0), 'basic', 3);
  gp.hints.push({ x: FURNACE.x - 8, z: FURNACE.z, r: 13, text: 'THE FURNACE. THE EMBERSTONE BURNS COLD UNDER THE SKYLIGHT. A PASSAGE EAST CLIMBS TO A BALCONY', dur: 8 });
  gp.soundSources.push({ name: 'portal_hum', x: FURNACE.x, y: PLINTH + 2, z: FURNACE.z, range: 22, vol: 0.35 });

  // the way out, north: torches, coals, gems, a Snuffer in the narrows
  torchesAlong(ctx, 'exit', 11, 6);
  crystalsIn(ctx, 'exit', [[10, -3.0, 5], [22, 3.2, 4], [34, -3.4, 5]]);
  gemsAlong(ctx, 'exit', 5.5, [1, 2, 1], 8);
  const guard = SMELTER.at('exit', 24, 1.6); ctx.addEnemy(guard.x, guard.z, 'basic', 4);

  // the balcony: a passage east of the Furnace that climbs 7 m to a little round room, and the third secret in it
  torchesAlong(ctx, 'balcony', 8, 3);
  gemsAlong(ctx, 'balcony', 4.2, [1, 1, 2], 3);
  const m = SMELTER.at('balcony', 0);
  gp.hints.push({ x: m.x, z: m.z, r: 8, text: 'A PASSAGE CLIMBS TO A BALCONY OVER THE FURNACE', dur: 6 });
  const la = (deg, r) => [LEDGE.x + Math.cos(deg * TAU / 360) * r, LEDGE.z + Math.sin(deg * TAU / 360) * r];
  for (const [deg, count] of [[20, 5], [90, 6], [160, 5], [230, 6], [300, 5]]) { const [x, z] = la(deg, 5.2); put('crystal_cluster', x, z, { rot: deg, color: 'ember', count }, 2.2); }
  const [cx, cz] = la(180, 2.0);
  gp.chests.push({ x: cx, y: h(cx, cz), z: cz, yaw: 0, gems: [10, 10, 5], secret: 'balcony' });
  const [px, pz] = la(0, 2.2);
  gp.purple.push([px, h(px, pz) + 1.3, pz]);
}

// ---- the Cinder Gorge: a climb in switchbacks to the caldera -------------------------------------------------------------------------------------------------
function layoutGorge(ctx) {
  const { gp, rng } = ctx;
  lampsAlong(ctx, 'gorge', 30, 8, 330, 1.8, 'torch_stand');
  gp.hints.push({ x: 152, z: -44, r: 12, text: 'THE CINDER GORGE CLIMBS IN SWITCHBACKS TO THE CALDERA. KEEP YOUR FIRE READY', dur: 7 });
  ctx.scatter('basalt_columns', 10, regionBand(ctx, 'gorge', 0.9, 1.5), { r: 5, path: 3.5, maxSlope: 0.55 }, () => ({ rings: rng.int(1, 2), h: rng.float(3, 7) }));
  ctx.scatter('rock_spire', 10, regionBand(ctx, 'gorge', 1.0, 1.7), { r: 3.4, path: 4, maxSlope: 0.6 }, () => spire(rng));
  ctx.scatter('crystal_spire', 6, regionBand(ctx, 'gorge', 0.9, 1.6), { r: 2.6, path: 3.5, maxSlope: 0.55 }, () => ({ color: 'ember', h: 5 + rng.int(0, 4) }));
  ctx.scatter('ember_vent', 8, regionBand(ctx, 'gorge', 0.4, 1.0), { r: 2.4, path: 3.5, maxSlope: 0.35 }, () => ({ rot: rng.float(0, TAU) }));
  ctx.scatter('dead_tree', 8, regionBand(ctx, 'gorge', 0.8, 1.4), { r: 2.4, path: 4, maxSlope: 0.5 }, () => ({ size: rng.pick(['s', 'm']) }));
  for (const t of [0.22, 0.46, 0.7, 0.88]) { const p = ctx.pathPoint('gorge', t); ctx.addVase(p.x + p.dz * 4.4, p.z - p.dx * 4.4, [2, 5]); }
}

// ---- the caldera: a crater, its floor scorched, the Heartforge in the middle -------------------------------------------------------------------------------
function layoutCaldera(ctx) {
  const { gp, put, h } = ctx;
  gp.hints.push({ x: GATE.x, z: -150, r: 10, text: 'THE CALDERA LIES AHEAD. THE GUARDIANS OF THE HEARTFORGE WILL NOT LET IT BE KINDLED EASILY', dur: 7 });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU + 0.35, x = CALDERA.x + Math.cos(a) * (CALDERA.r - 4), z = CALDERA.z + Math.sin(a) * (CALDERA.r - 4);
    if (Math.hypot(x - CALDERA.x, z - (CALDERA.z + CALDERA.r - 4)) < 7) continue;                // (the way in is the south)
    put('crystal_spire', x, z, { color: 'ember', h: 6 + (k % 3) * 2 }, 3);
  }
  put('standing_stones', CALDERA.x, CALDERA.z, { r: 11, count: 9, glowColor: [1.0, 0.5, 0.18] }, 13);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + 0.2; put('ember_vent', CALDERA.x + Math.cos(a) * 17, CALDERA.z + Math.sin(a) * 17, { rot: a }, 2); }
  for (const [dx, dz, g] of [[-14, 8, [2, 5]], [14, 9, [2, 5]], [-6, 16, [1, 2, 5]], [8, -15, [5, 5]]]) ctx.addVase(CALDERA.x + dx, CALDERA.z + dz, g);
  gp.purple.push([CALDERA.x - 8, h(CALDERA.x - 8, CALDERA.z + 6) + 1.3, CALDERA.z + 6], [CALDERA.x + 8, h(CALDERA.x + 8, CALDERA.z + 6) + 1.3, CALDERA.z + 6]);
  gp.hints.push({ x: CALDERA.x, z: CALDERA.z + 22, r: 12, text: 'THE HEARTFORGE! LIGHT IT TO BRING THE FORGES BACK', dur: 7 });
  ctx.scatter('rock_spire', 6, regionBand(ctx, 'caldera', 0.0, 0.9), { r: 3.4, path: 3, maxSlope: 0.5 }, () => spire(ctx.rng));
}

// ---- the Snuffers: quiet at the start, more of them and harder ones as the way climbs ------------------------------------------------------------------------
function layoutDanger(ctx) {
  const side = (p, k) => [p.x + p.dz * k, p.z - p.dx * k];
  // [road, how far along it (0..1), kind]
  const marks = [
    ['trunk', 0.8, 'basic'], ['groveroad', 0.5, 'basic'],
    ['ashway', 0.12, 'basic'], ['ashway', 0.3, 'basic'], ['stair', 0.5, 'basic'], ['stair', 0.85, 'bell'], ['rim', 0.4, 'bell'],
    ['ashway', 0.55, 'bell'], ['ashway', 0.8, 'basic'], ['shelf', 0.25, 'bell'], ['shelf', 0.5, 'thorn'], ['shelf', 0.75, 'basic'], ['forecourt', 0.6, 'bell'],
    ['northway', 0.3, 'bell'], ['northway', 0.6, 'thorn'], ['northway', 0.85, 'bell'],
    ['gorge', 0.1, 'basic'], ['gorge', 0.22, 'thorn'], ['gorge', 0.34, 'bell'], ['gorge', 0.48, 'thorn'], ['gorge', 0.6, 'bell'], ['gorge', 0.72, 'thorn'], ['gorge', 0.86, 'bell'],
  ];
  // (a Snuffer stands where nothing else does: the first of the offsets from the road that is clear)
  marks.forEach(([road, t, kind], i) => {
    const p = ctx.pathPoint(road, t);
    for (const k of [3.6, 5.0, 2.8, 6.4]) for (const sd of [i % 2 ? 1 : -1, i % 2 ? -1 : 1]) {
      const [x, z] = side(p, sd * k);
      if (ctx.ok(x, z, { r: 1.6, path: 0, maxSlope: 0.5 })) { ctx.addEnemy(x, z, kind, 4); return; }
    }
  });
  // the caldera's guardians: a ring round the Heartforge (the crater situation wants at least two within 30 m)
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + 0.6;
    for (const r of [15, 13, 17, 19]) { const x = CALDERA.x + Math.cos(a) * r, z = CALDERA.z + Math.sin(a) * r; if (ctx.ok(x, z, { r: 1.6, path: 0, maxSlope: 0.5 })) { ctx.addEnemy(x, z, k % 2 ? 'bell' : 'thorn', 3); break; } }
  }
  ctx.gp.hints.push({ x: -96, z: 34, r: 10, text: 'ARMOURED SNUFFERS: FIRE BOUNCES OFF BELLS, SPIKES HURT WHEN RAMMED', dur: 7 });
}

// ---- trees, flowers, rocks: dead trees and black spires, a few flame trees ------------------------------------------------------------------------------------
function layoutScatter(ctx) {
  const { rng } = ctx;
  for (const id of ['gate']) {
    ctx.scatter('dead_tree', 10, regionBand(ctx, id, 0.7, 1.2), { r: 2.4, path: 4, maxSlope: 0.45 }, () => ({ size: rng.pick(['s', 'm', 'l']) }));
    ctx.scatter('flower_patch', 6, regionBand(ctx, id, 0.2, 1.0), { r: 3, path: 3 }, () => lilies());
    ctx.scatter('rock_cluster', 5, regionBand(ctx, id, 0.8, 1.3), { r: 3.5, path: 3 });
  }
  ctx.scatter('rock_spire', 8, regionBand(ctx, 'forecourt', 0.9, 1.5), { r: 3.4, path: 4, maxSlope: 0.5 }, () => spire(rng));
  ctx.scatter('dead_tree', 8, regionBand(ctx, 'forecourt', 0.8, 1.4), { r: 2.4, path: 4, maxSlope: 0.45 }, () => ({ size: rng.pick(['s', 'm', 'l']) }));
}
