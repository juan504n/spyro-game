// The level script of TIDEGLASS REACH: the stages the kit provides (the goals, the ring of light over the last one, the treasure) and the places of the realm, each a function that dresses one part of the
// country - the Harbour with the door of Dawnhaven, the Strand and the Salt Flats with the cairns that are the refuges, Pearl Rock, the tide pool, the High Road and the Cliffwalk, the Glass Stacks and their
// bridges of glass, the Weeping Cliff with the sea cave behind its fall, the Weeping Stair, the Sea Gate and the headland with the lighthouse - then the Snuffers and the trees. Positions come from brief.js;
// everything here is expressed in world coordinates and validated against the terrain by ctx.h() / ctx.ok(). Called twice by buildWorld (a dry pass, then a wet one): it must be deterministic - ctx.rng,
// never Math.random.
import { makePopulate, goalsStage, exitStage, gemsStage, faceTo, inFront, band, lampsAlong, TAU } from '../realm/index.js';
import { vaultDoor } from '../props/nature/sky.js';
import { BRIEF, REGIONS, DOOR, POOL, BRIDGES, GATE, LIGHTHOUSE } from './brief.js';
import { WEEPING } from './weeping.js';
import { cairnSpots } from './level.js';

const regionBand = (ctx, id, f0, f1, lo, hi) => band(ctx, REGIONS, id, f0, f1, lo, hi);
const pts = (id) => REGIONS.find((r) => r.id === id).pts;
const goal = (id) => BRIEF.goals.find((q) => q.id === id);
const yawTo = (dx, dz) => Math.atan2(dz, dx);                      // (a signpost's board points along its rotated +X: yaw 0 east, -PI/2 north)
const LO = -BRIEF.tide.amp, HI = BRIEF.tide.amp;
/** a drift of sea-pinks (the meadow flowers of this country: the skin gives the three kinds one look) */
const flowers = (r = 3.0, count = 8) => ({ r, count, kinds: ['flower_pink', 'flower_blue', 'flower_yellow'], tufts: true });
const pine = (rng) => ({ size: rng.pick(['s', 'm', 'm', 'l']) });
const stack = (id) => { const R = pts(id); return { x: (R[0][0] + R[1][0]) / 2, z: (R[0][1] + R[1][1]) / 2, r: R[0][3] }; };

/** a ring of `n` gems round (x, z), `r` metres out, on the ground (the values cycling): the reward for walking up to a thing */
function gemRing(ctx, x, z, r, n, values = [1, 1, 2], a0 = 0) {
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (Math.abs(ctx.h(px, pz) - ctx.h(x, z)) < 1.2) ctx.addGem(px, pz, values[i % values.length]);       // (on the rock's own ground: not over its edge)
  }
}

/** put a prop only where it fits (the ground is firm, level enough and clear); returns whether it stood */
function fit(ctx, name, x, z, params, r, o = {}) {
  if (!ctx.ok(x, z, { r, maxSlope: 0.3, path: 2.4, minH: 3, ...o })) return false;
  return ctx.put(name, x, z, params, r);
}

export const populate = makePopulate(BRIEF, [
  goalsStage,
  layoutHarbour, layoutFlats, layoutPool, layoutPearl, layoutHigh, layoutStacks, layoutWeeping, layoutStair, layoutHeadland,
  layoutDanger, layoutScatter,
  exitStage,
  gemsStage,
], { seed: 5527 });

// ---- the Harbour: where the door of Dawnhaven stands, the first lens, the village on the quay ------------------------------------------------------------------------------
function layoutHarbour(ctx) {
  const { gp, put, rng, h } = ctx, sp = ctx.L.spawn, g = goal('quay');
  const y = h(DOOR.x, DOOR.z);
  put('realm_door', DOOR.x, DOOR.z, { rot: DOOR.yaw, color: DOOR.color, sealed: false, y }, 12);
  gp.portals.push({ id: DOOR.id, name: DOOR.name, tag: DOOR.tag, kind: 'door', shape: 'arch', x: DOOR.x, y, z: DOOR.z, yaw: DOOR.yaw, r: 2.6, hs: 3.1, cy: 3.4, color: DOOR.color, target: DOOR.target, state: 'open' });
  gp.soundSources.push({ name: 'portal_hum', x: DOOR.x, y: y + 3.4, z: DOOR.z, range: 44, vol: 1.3, when: `portal:${DOOR.id}` });
  for (const side of [-1, 1]) {
    put('torch_stand', ...inFront(DOOR, 6.4, side * 5.4), { rot: DOOR.yaw }, 1.5);
    put('crystal_cluster', ...inFront(DOOR, 3, side * 9.5), { color: 'cyan', count: 5 }, 2.4);
  }
  // the first lens: a ring of standing stones round it, a ring of gems, flowers
  put('standing_stones', g.x, g.z, { r: 6.4, count: 5, glowColor: [0.5, 1.0, 0.86] }, 8);
  gemRing(ctx, g.x, g.z, 3.6, 6, [1, 2], 0.3);
  fit(ctx, 'flower_patch', g.x - 8, g.z - 3, flowers(3.0, 10), 3.4);
  fit(ctx, 'flower_patch', g.x + 7, g.z - 5, flowers(2.8, 9), 3.2);
  lampsAlong(ctx, 'quay', 22, 12, 80, 1.8, 'torch_stand');
  // the village: a hall and a cottage on the north side, stalls, barrels and boats hauled up on the south, a bench and a well
  fit(ctx, 'house_long', -190, 7.5, { rot: 0 }, 10, { path: 4 });
  fit(ctx, 'house_cottage', -171, 3.5, { variant: 1, rot: 0 }, 7, { path: 4 });
  fit(ctx, 'house_round', -205, 9, { rot: 0 }, 6, { path: 3 });
  fit(ctx, 'market_stall', -194, 29, { rot: Math.PI, variant: 0 }, 4, { path: 2.4 });
  fit(ctx, 'market_stall', -187, 30, { rot: Math.PI, variant: 1 }, 4, { path: 2.4 });
  fit(ctx, 'barrel_cluster', -181, 12, { rot: 0.4 }, 2.4, { path: 1.8 });
  fit(ctx, 'crate_stack', -196, 14, { rot: 0.2 }, 2.4, { path: 1.8 });
  fit(ctx, 'crate_stack', -168, 22, { rot: 1.1 }, 2.4, { path: 1.8 });
  put('well', -176, 4, {}, 3);
  put('bench', -164.5, 21, { rot: faceTo(-164.5, 21, -150, 40) }, 1.6);
  for (const [x, z, v] of [[-199, 33.5, 0], [-181, 33.5, 1], [-166, 29.5, 2]]) put('boat', x, z, { rot: rng.float(0.6, 2.4), variant: v, y: h(x, z) }, 3);
  put('bunting', -200, 12, { ax: -200, az: 12, bx: -188, bz: 12.5, h: 4.8, hb: 4.4, sag: 0.9 }, 0);
  put('bunting', -176, 16, { ax: -176, az: 16, bx: -164, bz: 12, h: 4.8, hb: 4.6, sag: 0.9 }, 0);
  // the tide post at the quay's edge: read the sea against it
  put('tide_post', -184, 40, { lo: LO, hi: HI }, 2);
  // the signpost where the two roads part: the low road over the flats, the high road along the cliffs
  put('signpost', -161, 19, { rot: 0.3, boards: [
    { yaw: yawTo(1, 0.9), y: 3.4, len: 2.4, tint: [0.6, 0.95, 0.85] },             // south-east: the low road, the flats
    { yaw: yawTo(-0.1, -1), y: 2.4, len: 2.4, tint: [1.0, 0.86, 0.5] },            // north: the high road
  ] }, 1.5);
  gp.hints.push({ x: sp.x + 6, z: sp.z, r: 9, text: 'WELCOME TO TIDEGLASS REACH! THE TIDE HAS LOST ITS WAY. LIGHT THE FIVE LENSES WITH FIRE', dur: 7 });
  gp.hints.push({ x: -184, z: 34, r: 8, text: 'THE TIDE POST: GREEN BAND LOW TIDE, WHITE THE MEAN, RED HIGH TIDE. THE GAUGE ON YOUR SCREEN SAYS THE SAME', dur: 8 });
  gp.hints.push({ x: -160, z: 17, r: 11, text: 'TWO ROADS EAST: THE LOW ROAD ACROSS THE FLATS, BARE AT LOW TIDE, OR THE HIGH ROAD ALONG THE CLIFFS, ALWAYS DRY', dur: 8 });
  // the Salvage Store: a walled court with one doorway, shut with a cracked wall (the first secret)
  const V = { x: -178, z: 30, w: 14, d: 7, door: 'north' };
  put('vault_walls', V.x, V.z, { w: V.w, d: V.d, door: V.door, y: h(V.x, V.z) }, 10);
  const [dx, dz, dyaw] = vaultDoor(V);
  ctx.addWall(dx, dz, dyaw, 4.6, 4.6, [25]);
  gp.hints.push({ x: dx, z: dz - 5, r: 8, text: 'THAT STOREROOM WALL LOOKS CRACKED... TRY CHARGING IT', dur: 6 });
  gp.chests.push({ x: V.x, y: h(V.x, V.z + 0.5), z: V.z + 0.5, yaw: Math.PI, gems: [10, 10, 5], secret: 'vault' });
  put('crystal_cluster', V.x - 4.4, V.z + 2.2, { color: 'cyan', count: 5 }, 0);
  put('crystal_cluster', V.x + 4.4, V.z + 2.2, { color: 'cyan', count: 5 }, 0);
  ctx.addVase(V.x - 4.8, V.z - 1.4, [2, 5], h(V.x - 4.8, V.z - 1.4));
  ctx.addVase(V.x + 4.8, V.z - 1.8, [1, 1, 2], h(V.x + 4.8, V.z - 1.8));
  gp.purple.push([V.x, h(V.x, V.z - 1.2) + 1.3, V.z - 1.2]);
  for (const [x, z, gv] of [[-212, 26, [1, 1, 2]], [-200, 15, [2, 5]], [-170, 14, [1, 1, 1]]]) ctx.addVase(x, z, gv);
  // sea-pinks on the quay's rim, a few rocks
  ctx.scatter('flower_patch', 8, regionBand(ctx, 'harbour', 0.3, 0.9), { r: 3, path: 3, maxSlope: 0.3 }, () => flowers(3.0, 9));
  ctx.scatter('tuft_patch', 8, regionBand(ctx, 'harbour', 0.3, 0.9), { r: 3, path: 3, teal: true });
  ctx.scatter('tree_round', 3, regionBand(ctx, 'harbour', 0.6, 0.9), { r: 3.8, path: 4, maxSlope: 0.3 }, () => ({ canopy: 'leaves_teal', size: rng.pick(['s', 'm']) }));
  ctx.scatter('rock_cluster', 4, regionBand(ctx, 'harbour', 0.6, 0.95), { r: 3.5, path: 3, maxSlope: 0.36 });
}

// ---- the Strand and the Salt Flats: the causeway, the cairns that are the refuges, the tide posts, the driftwood ---------------------------------------------------------------------
function layoutFlats(ctx) {
  const { gp, put, rng, h } = ctx;
  // the cairns: a lantern on each bank, in pairs either side of the road (the channel markers of the causeway)
  for (const c of cairnSpots()) { if (!c.pool) put('tide_cairn', c.x, c.z, { rot: rng.float(0, TAU), y: h(c.x, c.z) }, 3); }       // (the pool's bank is dressed with the pool)
  // a tide post in the shallows, where the strand meets the flats, and one on the far side
  put('tide_post', -112, 63, { lo: LO, hi: HI }, 2);
  put('tide_post', 40, 58, { lo: LO, hi: HI }, 2);
  // the sea, heard from the first step to the last: surf on the shore of the harbour and the strand, over the flats, and about the stacks (the cave's beach has its own, below)
  for (const [x, z, range, vol] of [[-172, 8, 80, 0.7], [-140, 34, 80, 0.7], [-40, 62, 100, 0.6], [24, -64, 90, 0.5]]) gp.soundSources.push({ name: 'surf', x, y: 0, z, range, vol });
  // the signpost at the strand's foot
  put('signpost', -134, 36, { rot: 0.6, boards: [
    { yaw: yawTo(1, 0.45), y: 3.4, len: 2.4, tint: [0.6, 0.95, 0.85] },            // east: the causeway, Pearl Rock and the Weeping Cliff
    { yaw: yawTo(0.4, -1), y: 2.4, len: 2.4, tint: [0.8, 0.8, 0.95] },             // north: the tide pool
  ] }, 1.5);
  gp.hints.push({ x: -126, z: 41, r: 10, text: 'THE SALT FLATS: ANKLE-DEEP AT MID TIDE, OVER YOUR HEAD AT HIGH TIDE. THE CAIRNS ARE SAFE GROUND', dur: 8 });
  gp.hints.push({ x: -36, z: 67, r: 12, text: 'CAUGHT BY THE TIDE? CLIMB A CAIRN AND WAIT: THE SEA GOES OUT AGAIN', dur: 8 });
  gp.hints.push({ x: 40, z: 52, r: 12, text: 'THE ROAD ENDS AT THE WEEPING CLIFF. THE WATER IS RISING WHEN THE GAUGE ARROW POINTS UP', dur: 7 });
  // driftwood and rocks left on the sand, a wreck out on the flats with its crates
  for (const [x, z, rot] of [[-92, 72, 0.5], [-52, 80, 2.1], [-6, 56, 0.9], [22, 76, 1.4], [68, 56, 2.6]]) put('fallen_log', x, z, { rot, len: 5.2, y: h(x, z) }, 3);
  for (const [x, z] of [[-96, 76], [-60, 52], [-14, 82], [30, 44], [70, 66]]) put('rock_cluster', x, z, { rot: rng.float(0, TAU), y: h(x, z) }, 4);
  put('boat', 58, 62, { rot: 0.7, variant: 1, y: h(58, 62) }, 3);
  put('crate_stack', 63, 60, { rot: 0.3, y: h(63, 60) }, 2.4);
  put('barrel_cluster', 54, 59, { rot: 1.4, y: h(54, 59) }, 2.4);
  // gems on the sand at the cairns: the reward for the bank
  for (const c of cairnSpots()) if (!c.pool && c.s % 80 < 5) gemRing(ctx, c.x, c.z, 2.2, 4, [1, 2], 0.2);
}

// ---- the tide pool: an arm of the flats that leads to a bank the sea leaves, and a chest on it ------------------------------------------------------------------------------------
function layoutPool(ctx) {
  const { gp, put, h } = ctx;
  put('tide_cairn', POOL.x, POOL.z, { y: h(POOL.x, POOL.z) }, 3);
  const cx = POOL.x + 2.4, cz = POOL.z - 1.4;
  gp.chests.push({ x: cx, y: h(cx, cz), z: cz, yaw: faceTo(cx, cz, -108, 30), gems: [10, 10, 5], secret: 'pool' });
  put('crystal_cluster', POOL.x - 2.6, POOL.z + 0.4, { color: 'cyan', count: 4 }, 0);
  gp.hints.push({ x: -102, z: 18, r: 11, text: 'A TIDE POOL! THE SEA LEFT SOMETHING BEHIND. MIND THE TIDE ON THE WAY BACK', dur: 7 });
  ctx.gemArc([[-112, -0.4, 30], [-106, -0.5, 22], [-100, 1.5, 14]], 6, 1);
}

// ---- Pearl Rock: a tidal island, the road up its spine, the second lens on its top ------------------------------------------------------------------------------------------------
function layoutPearl(ctx) {
  const { gp, put } = ctx, g = goal('pearl');
  put('standing_stones', g.x, g.z, { r: 5.4, count: 5, glowColor: [0.5, 1.0, 0.86] }, 7);
  gemRing(ctx, g.x, g.z, 3.4, 6, [1, 2], 0.3);
  const spine = pts('pearl');
  // a rock arch the road goes through, lower on the spine; torches either side of the way up
  const a = spine[1];
  put('rock_arch', a[0] + 1, a[1] - 1, { rot: faceTo(a[0], a[1], spine[2][0], spine[2][1]) + Math.PI, w: 7.5, h: 5.4 }, 6);
  lampsAlong(ctx, 'pearl', 16, 8, 60, 1.6, 'torch_stand');
  fit(ctx, 'bench', g.x + 5, g.z + 3, { rot: faceTo(g.x + 5, g.z + 3, -40, 40) }, 1.6, { path: 1.6 });
  fit(ctx, 'flower_patch', g.x + 6, g.z - 4, flowers(2.6, 9), 3, { path: 2 });
  fit(ctx, 'flower_patch', g.x - 5, g.z + 6, flowers(2.4, 8), 3, { path: 2 });
  ctx.scatter('crystal_cluster', 3, regionBand(ctx, 'pearl', 0.5, 0.9), { r: 2.4, path: 2.5, maxSlope: 0.4 }, () => ({ color: 'cyan', count: 4 }));
  ctx.scatter('rock_cluster', 3, regionBand(ctx, 'pearl', 0.7, 1.0), { r: 3.4, path: 3, maxSlope: 0.4 });
  gp.hints.push({ x: -40, z: 42, r: 9, text: 'PEARL ROCK IS AN ISLAND WHEN THE TIDE IS IN. THE LENS WAITS ON ITS TOP', dur: 7 });
  for (const [x, z, gv] of [[-24, 36, [1, 1, 2]], [-30, 34, [2, 5]]]) ctx.addVase(x, z, gv);
}

// ---- the High Road and the Cliffwalk: up the west shore and along the north, always dry ------------------------------------------------------------------------------------------------
function layoutHigh(ctx) {
  const { gp, put, rng } = ctx;
  lampsAlong(ctx, 'hill', 30, 14, 130, 1.8, 'torch_stand');
  lampsAlong(ctx, 'walk', 32, 10, 300, 1.8, 'torch_stand');
  put('signpost', -152, -98, { rot: 0.4, boards: [
    { yaw: yawTo(1, -0.3), y: 3.4, len: 2.4, tint: [1.0, 0.86, 0.5] },             // east: the Cliffwalk and the headland
    { yaw: yawTo(-0.3, 1), y: 2.4, len: 2.2, tint: [0.9, 0.9, 0.95] },             // back: the harbour
  ] }, 1.5);
  gp.hints.push({ x: -172, z: -4, r: 11, text: 'THE HIGH ROAD CLIMBS ABOVE THE SEA: DRY AT EVERY TIDE. IT RUNS ON ALONG THE CLIFFWALK', dur: 8 });
  gp.hints.push({ x: 12, z: -97, r: 10, text: 'GLASS BRIDGES! THEY CARRY YOU OUT OVER THE REACH. MIND THE EDGE: THE SEA IS DEEP', dur: 8 });
  // benches that look out over the Reach, viewpoints
  for (const [x, z, tx, tz] of [[-172, -52, -100, -52], [-120, -106, -110, -60], [-44, -108, -30, -50], [34, -100, 30, -50]]) fit(ctx, 'bench', x, z, { rot: faceTo(x, z, tx, tz) }, 1.6, { path: 1.6 });
  put('wind_vane', -150, -90, { rot: 0.8 }, 2);
  for (const [x, z, gv] of [[-170, -30, [1, 1, 2]], [-162, -70, [2, 5]], [-120, -104, [1, 1, 1]], [-60, -112, [2, 5]], [10, -102, [1, 2]], [52, -90, [1, 1, 2]]]) ctx.addVase(x, z, gv);
  for (const id of ['hill', 'walk']) {
    ctx.scatter('tree_pine', id === 'walk' ? 16 : 10, regionBand(ctx, id, 0.5, 0.9), { r: 3.2, path: 4, maxSlope: 0.36 }, () => pine(rng));
    ctx.scatter('rock_cluster', 7, regionBand(ctx, id, 0.5, 0.95), { r: 3.5, path: 3, maxSlope: 0.36 });
    ctx.scatter('flower_patch', 12, regionBand(ctx, id, 0.2, 0.85), { r: 3, path: 3, maxSlope: 0.3 }, () => flowers(3.0, 9));
    ctx.scatter('tuft_patch', 8, regionBand(ctx, id, 0.2, 0.85), { r: 3, path: 3, teal: true });
    ctx.scatter('bush', 6, regionBand(ctx, id, 0.4, 0.9), { r: 1.6, path: 3, maxSlope: 0.36 }, () => ({ flowers: rng.chance(0.5) }));
  }
}

// ---- the Glass Stacks: four sea stacks in the Reach, the bridges of glass that join them, the Glass Court and the third lens, the Lone Stack and its chest ---------------------------------------
function layoutStacks(ctx) {
  const { gp, put, h } = ctx, g = goal('court');
  BRIDGES.forEach((B, i) => {
    const y1 = h(B.from[0], B.from[1]) + 0.08, y2 = h(B.to[0], B.to[1]) + 0.08;       // (a hair over the ground each end lands on: the deck, not the ground's rim, holds him)
    put('glass_bridge', B.from[0], B.from[1], { x2: B.to[0], z2: B.to[1], y1, y2, width: B.width }, 0);
    // a gem over every 4.5 m of the deck: the way across is shown
    const L = Math.hypot(B.to[0] - B.from[0], B.to[1] - B.from[1]), n = Math.max(2, Math.floor(L / 4.5));
    for (let k = 1; k <= n; k++) { const t = k / (n + 1); ctx.addGem(B.from[0] + (B.to[0] - B.from[0]) * t, B.from[1] + (B.to[1] - B.from[1]) * t, [1, 1, 2][(k + i) % 3], y1 + (y2 - y1) * t + 1.05); }
  });
  const A = stack('stackA'), Bk = stack('stackB'), C = stack('stackC'), K = stack('court');
  // the first stack: a torch either side of the way across, a crystal; the second: a bench to look at the Reach from, a crystal
  put('torch_stand', A.x - 2.8, A.z + 1.4, {}, 1.2); put('torch_stand', A.x + 2.6, A.z - 1.6, {}, 1.2);
  put('crystal_cluster', A.x - 2.9, A.z - 0.2, { color: 'cyan', count: 5 }, 2.2);
  put('bench', Bk.x - 2.8, Bk.z - 0.6, { rot: faceTo(Bk.x - 2.8, Bk.z - 0.6, Bk.x - 30, Bk.z - 4) }, 1.6);
  put('crystal_cluster', Bk.x + 1.8, Bk.z - 2.6, { color: 'cyan', count: 4 }, 2.2);
  put('torch_stand', Bk.x - 2.0, Bk.z + 2.4, {}, 1.2);
  // the court: a ring of standing stones round the lens, torches, flowers
  put('standing_stones', g.x, g.z, { r: 7.4, count: 6, glowColor: [0.5, 1.0, 0.86] }, 9);
  gemRing(ctx, g.x, g.z, 4.2, 8, [1, 1, 2], 0.3);
  put('torch_stand', K.x - 7.6, K.z - 6.2, {}, 1.2); put('torch_stand', K.x + 7.4, K.z - 6.4, {}, 1.2);
  put('flower_patch', K.x + 5.4, K.z + 5.6, flowers(2.4, 9), 2.8);
  put('flower_patch', K.x - 6.2, K.z + 5.0, flowers(2.4, 9), 2.8);
  put('crystal_cluster', K.x - 6.6, K.z + 2.2, { color: 'cyan', count: 5 }, 2.4);
  put('crystal_cluster', K.x + 6.8, K.z + 1.6, { color: 'cyan', count: 5 }, 2.4);
  ctx.addVase(K.x + 3, K.z + 8, [2, 5], h(K.x + 3, K.z + 8)); ctx.addVase(K.x - 4, K.z + 7.6, [1, 1, 2], h(K.x - 4, K.z + 7.6));
  // the Lone Stack: a chest, a crystal, a torch
  const cy = h(C.x + 0.8, C.z + 0.6);
  gp.chests.push({ x: C.x + 0.8, y: cy, z: C.z + 0.6, yaw: faceTo(C.x + 0.8, C.z + 0.6, Bk.x, Bk.z), gems: [10, 10, 5], secret: 'lone' });
  put('crystal_cluster', C.x + 2.4, C.z - 1.6, { color: 'cyan', count: 4 }, 2);
  put('torch_stand', C.x - 2.0, C.z - 2.4, {}, 1.2);
  gp.hints.push({ x: C.x - 12, z: C.z - 4, r: 9, text: 'A LONE STACK, FAR FROM THE ROAD... SOMETHING GLINTS ON IT', dur: 6 });
  gp.hints.push({ x: Bk.x - 2, z: Bk.z - 6, r: 9, text: 'FALL AND THE SEA DROWNS YOU: YOU ARE SET BACK ON THE LAST FIRM GLASS OR STONE', dur: 7 });
}

// ---- the Weeping Cliff: the beach, the fall over the cave's mouth, the way in, the chamber and the fourth lens -----------------------------------------------------------------------
function layoutWeeping(ctx) {
  const { gp, put, h } = ctx, g = goal('weeping');
  // the fall hangs over the mouth: where the way in meets the wall (the sand in front of it faces west-south-west)
  const m = WEEPING.at('mouth', 7, 0), fy = h(m.x - 1.6, m.z + 0.8);
  put('cave_fall', m.x - 1.6, m.z + 0.8, { rot: m.yaw + Math.PI, w: 13, h: 14.5, y: fy }, 0);
  gp.soundSources.push({ name: 'waterfall', x: m.x - 2, y: fy + 4, z: m.z + 1, range: 60, vol: 1.0 });
  // torches either side of the mouth, the beach's rocks
  for (const k of [-1, 1]) { const p = WEEPING.at('mouth', 0, k * 8.4); put('torch_stand', p.x, p.z, {}, 1.4); }
  ctx.scatter('rock_cluster', 5, ctx.inCircle(98, 20, 18), { r: 3.4, path: 3, maxSlope: 0.4, minH: -0.9 });
  gp.hints.push({ x: 98, z: 14, r: 12, text: 'THE WEEPING CLIFF. THE LENS HANGS IN THE CAVE BEHIND THE FALL. THE SEA FLOODS ITS MOUTH AT HIGH TIDE', dur: 8 });
  // inside: crystals along the way, a glow, the skylight over the lens
  for (const [s, k] of [[12, -3.2], [12, 3.2], [20, -3.2], [20, 3.2], [27, 3.0]]) { const p = WEEPING.at('mouth', s, k); put('crystal_cluster', p.x, p.z, { color: 'cyan', count: 4 }, 0); }
  for (const s of [9, 17, 25]) { const p = WEEPING.at('mouth', s, 0); ctx.addGem(p.x, p.z, 1, p.y + 1.0); }
  put('light_shaft', g.x + 3, g.z - 3, { h: 20, r0: 2.4, r1: 3.6, color: [0.55, 1.0, 0.9] }, 0);
  for (const [dx, dz] of [[-6.5, -3.5], [7, 1.5], [-5, 6.5]]) put('crystal_cluster', g.x + dx, g.z + dz, { color: 'cyan', count: 5 }, 0);
  for (const sd of [-1, 1]) put('torch_stand', g.x - 4.2, g.z + sd * 3.4, {}, 0);
  gemRing(ctx, g.x, g.z, 4.2, 8, [1, 1, 2], 0.2);
  ctx.addVase(g.x - 7, g.z + 4, [2, 5], h(g.x - 7, g.z + 4)); ctx.addVase(g.x + 6, g.z - 5, [1, 1, 2], h(g.x + 6, g.z - 5));
  const q = WEEPING.at('mouth', 20, 0);
  gp.hints.push({ x: q.x, z: q.z, r: 7, text: 'THE CAVE FLOODS AT HIGH TIDE UP TO HERE. THE CHAMBER STAYS DRY', dur: 7, y0: 0, y1: 8 });
  gp.soundSources.push({ name: 'surf', x: 96, y: 0, z: 22, range: 70, vol: 0.8 });
}

// ---- the Weeping Stair: up the cliff's flank from the beach to the headland road -------------------------------------------------------------------------------------------------
function layoutStair(ctx) {
  const { gp, put } = ctx;
  lampsAlong(ctx, 'stair', 26, 12, 130, 1.8, 'torch_stand');
  put('signpost', 100, -66, { rot: -0.4, boards: [
    { yaw: yawTo(1, -0.3), y: 3.4, len: 2.4, tint: [1.0, 0.86, 0.5] },             // on: the headland and the lighthouse
    { yaw: yawTo(-0.3, 1), y: 2.4, len: 2.2, tint: [0.6, 0.95, 0.85] },            // down: the beach and the cave
  ] }, 1.5);
  gp.hints.push({ x: 92, z: 6, r: 10, text: 'THE WEEPING STAIR CLIMBS TO THE HEADLAND ROAD, ABOVE THE REACH OF THE TIDE', dur: 7 });
  for (const [x, z, gv] of [[88, -20, [1, 1, 2]], [80, -40, [2, 5]]]) ctx.addVase(x, z, gv);
  ctx.scatter('rock_cluster', 6, regionBand(ctx, 'stair', 0.5, 0.95), { r: 3.4, path: 3, maxSlope: 0.4 });
  ctx.scatter('flower_patch', 6, regionBand(ctx, 'stair', 0.3, 0.85), { r: 2.6, path: 3, maxSlope: 0.3 }, () => flowers(2.6, 8));
  ctx.scatter('tree_pine', 6, regionBand(ctx, 'stair', 0.5, 0.9), { r: 3.2, path: 4, maxSlope: 0.36 }, () => pine(ctx.rng));
}

// ---- the Sea Gate and the headland: the ridge, the lighthouse, the Tideglass before it ---------------------------------------------------------------------------------------------
function layoutHeadland(ctx) {
  const { gp, put, h } = ctx, g = goal('light');
  // the gate: two pillars across the neck of the ridge and a field of glass between them that melts when four lenses shine (the barrier: gp.barrier)
  put('gate_pillars', GATE.x, GATE.z, { rot: GATE.yaw }, 8);
  const gate = ctx.anchor('gate_pillars', 'barrier', GATE.x, GATE.z, { rot: GATE.yaw });
  gp.barrier = { x: gate ? gate[0] : GATE.x, y: gate ? gate[1] - 5.75 : h(GATE.x, GATE.z), z: gate ? gate[2] : GATE.z, yaw: GATE.yaw, opts: { tint: [0.4, 1.7, 1.3] } };       // (the field is sea-glass green, not the Dawn Gate's violet)
  gp.soundSources.push({ name: 'portal_hum', x: gp.barrier.x, y: gp.barrier.y + 4, z: gp.barrier.z, range: 38, vol: 1.2, when: 'barrier' });
  gp.hints.push({ x: 116, z: -70, r: 12, text: 'THE SEA GATE IS SHUT. IT OPENS WHEN FOUR LENSES SHINE', dur: 8 });
  lampsAlong(ctx, 'ridge', 26, 16, 220, 1.8, 'torch_stand');
  // the lighthouse, and the Tideglass in front of it: torches, a ring of gems, flowers, a vane
  put('lighthouse', LIGHTHOUSE.x, LIGHTHOUSE.z, { rot: faceTo(LIGHTHOUSE.x, LIGHTHOUSE.z, g.x, g.z) }, 12);
  for (const sd of [-1, 1]) put('torch_stand', g.x + 4.4 * sd, g.z + 6, {}, 1.4);
  gemRing(ctx, g.x, g.z, 6.6, 10, [1, 1, 2], 0.2);
  put('flower_patch', g.x + 7.4, g.z + 3.4, flowers(3.2, 12), 3.2);
  put('flower_patch', g.x - 8, g.z - 4, flowers(3.2, 12), 3.2);
  put('bunting', g.x - 9, g.z - 9, { ax: g.x - 9, az: g.z - 9, bx: g.x + 9, bz: g.z - 9, h: 5.2, hb: 5.2, sag: 1.2 }, 0);
  put('wind_vane', g.x + 10, g.z + 8, { rot: 2.2 }, 2);
  gp.hints.push({ x: 150, z: -112, r: 14, text: 'THE LIGHTHOUSE: THE REACHFOLK BLEW THE TIDEGLASS HERE. THE LAST LENS HANGS BEFORE IT', dur: 8 });
  for (const [x, z, gv] of [[134, -146, [2, 5]], [156, -132, [1, 1, 2]], [128, -122, [2, 5]], [150, -158, [5, 5]]]) ctx.addVase(x, z, gv);
  ctx.scatter('tree_pine', 8, regionBand(ctx, 'ridge', 0.6, 0.92), { r: 3.2, path: 4, maxSlope: 0.36 }, () => pine(ctx.rng));
  ctx.scatter('crystal_cluster', 5, regionBand(ctx, 'ridge', 0.55, 0.9), { r: 2.4, path: 3, maxSlope: 0.36 }, () => ({ color: 'cyan', count: 4 + ctx.rng.int(0, 3) }));
  ctx.scatter('flower_patch', 10, regionBand(ctx, 'ridge', 0.2, 0.9), { r: 3, path: 3, maxSlope: 0.3 }, () => flowers(3.0, 9));
  ctx.scatter('rock_cluster', 6, regionBand(ctx, 'ridge', 0.6, 0.95), { r: 3.5, path: 3, maxSlope: 0.36 });
  ctx.scatter('bush', 6, regionBand(ctx, 'ridge', 0.4, 0.9), { r: 1.6, path: 3, maxSlope: 0.36 }, () => ({ flowers: ctx.rng.chance(0.5) }));
}

// ---- the Snuffers: none near the start, the first on the High Road, more of them and harder ones as the way climbs; none on the sand ------------------------------------------------------------------
function layoutDanger(ctx) {
  const side = (p, k) => [p.x + p.dz * k, p.z - p.dx * k];
  // [road, how far along it (0..1), kind]
  const marks = [
    ['hill', 0.82, 'urchin'], ['pearl', 0.55, 'urchin'],
    ['walk', 0.1, 'urchin'], ['walk', 0.28, 'urchin'], ['walk', 0.46, 'drifter'], ['walk', 0.66, 'crab'], ['walk', 0.86, 'crab'],
    ['stair', 0.35, 'urchin'], ['stair', 0.72, 'crab'],
    ['ridge', 0.14, 'crab'], ['ridge', 0.55, 'urchin'], ['ridge', 0.72, 'drifter'], ['ridge', 0.9, 'drifter'],
  ];
  marks.forEach(([road, t, kind], i) => {
    const p = ctx.pathPoint(road, t);
    for (const k of [3.8, 5.2, 3.0, 6.6]) for (const sd of [i % 2 ? 1 : -1, i % 2 ? -1 : 1]) {
      const [x, z] = side(p, sd * k);
      if (ctx.ok(x, z, { r: 1.6, path: 0, maxSlope: 0.5, minH: 3 })) { ctx.addEnemy(x, z, kind, 4); return; }
    }
  });
  // the stacks: nothing on the first two (a stack is 8 m across and a hero put there by the TRAVEL menu must not be beside a Snuffer), two thorns guarding the court where the glass ends
  const K = stack('court');
  ctx.addEnemy(K.x - 4.0, K.z + 2.6, 'drifter', 3);
  ctx.addEnemy(K.x + 4.4, K.z - 2.0, 'crab', 3);
  ctx.gp.hints.push({ x: -60, z: -112, r: 9, text: 'THE TIDE FOES: URCHIN SPINES HURT WHEN RAMMED, A SHELLBACK TURNS OVER, A DRIFTER SHOCKS THE GROUND', dur: 7 });
}

// ---- trees, flowers, rocks on the parts that have no place of their own -----------------------------------------------------------------------------------------------------------------
function layoutScatter(ctx) {
  ctx.scatter('flower_patch', 6, regionBand(ctx, 'strand', 0.2, 0.8), { r: 2.6, path: 2.4, maxSlope: 0.3, minH: 1.2 }, () => flowers(2.6, 8));
  for (const id of ['stackA', 'stackB', 'stackC']) ctx.scatter('tuft_patch', 3, regionBand(ctx, id, 0.0, 0.8), { r: 2.0, path: 2, maxSlope: 0.3, teal: true });
}
