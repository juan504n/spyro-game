// The level script of FROSTBLOOM HOLLOW: the stages the kit provides (the goals, the ring of light over the last one, the treasure) and the places of the realm, each a function that dresses one part of
// the country - the Thaw Gate, Glasswater and its islet, Rimewood and its frozen glade, Aurora Ridge, the ice gate and the Hollow, the Snuffers, the trees. Positions come from brief.js; everything here
// is expressed in world coordinates and validated against the terrain by ctx.h() / ctx.ok(). Called twice by buildWorld (a dry pass, then a wet one): it must be deterministic - ctx.rng, never Math.random.
import { makePopulate, goalsStage, exitStage, gemsStage, faceTo, inFront, flatSpot, band, lampsAlong, TAU } from '../realm/index.js';
import { WATER_LEVEL } from '../level.js';
import { BRIEF, REGIONS, LAKE, RIME_GLADE, HOLLOW, GATE, DOOR } from './brief.js';
import { GLACIER, HEART, VAULT, PLINTH } from './glacier.js';

const regionBand = (ctx, id, f0, f1, lo, hi) => band(ctx, REGIONS, id, f0, f1, lo, hi);
const pts = (id) => REGIONS.find((r) => r.id === id).pts;
const pine = (rng) => ({ size: rng.pick(['s', 'm', 'l']) });
/** a drift of blossom: pink flowers only and no green tufts (the realm's palette is ice, snow and blossom) */
const bloom = (r = 3.4, count = 10) => ({ r, count, kinds: ['flower_pink'], tufts: false });
const blossom = (rng) => ({ canopy: 'leaves_blossom', size: rng.pick(['s', 'm', 'm', 'l']) });

export const populate = makePopulate(BRIEF, [
  goalsStage,
  layoutThawGate, layoutGlasswater, layoutRimewood, layoutGlacier, layoutRidge, layoutHollow, layoutDanger, layoutScatter,
  exitStage,
  gemsStage,
], { seed: 6203 });

// ---- the Thaw Gate: where the door of Dawnhaven stands, and the first lawn ----------------------------------------------------------------------
function layoutThawGate(ctx) {
  const { gp, put } = ctx, sp = ctx.L.spawn;
  const y = ctx.h(DOOR.x, DOOR.z);
  put('realm_door', DOOR.x, DOOR.z, { rot: DOOR.yaw, color: DOOR.color, sealed: false, y }, 12);
  gp.portals.push({ id: DOOR.id, name: DOOR.name, tag: DOOR.tag, kind: 'door', shape: 'arch', x: DOOR.x, y, z: DOOR.z, yaw: DOOR.yaw, r: 2.6, hs: 3.1, cy: 3.4, color: DOOR.color, target: DOOR.target, state: 'open' });
  gp.soundSources.push({ name: 'portal_hum', x: DOOR.x, y: y + 3.4, z: DOOR.z, range: 44, vol: 1.3, when: `portal:${DOOR.id}` });
  for (const side of [-1, 1]) {
    put('torch_stand', ...inFront(DOOR, 6.4, side * 5.4), { rot: DOOR.yaw }, 1.5);
    put('crystal_cluster', ...inFront(DOOR, 3, side * 9), { color: 'cyan', count: 5 }, 2.4);
    put('banner_pole', ...inFront(DOOR, 9, side * 9), { rot: DOOR.yaw + side * Math.PI / 2 }, 1);
    put('flower_patch', ...inFront(DOOR, 14, side * 8), bloom(2.8, 9), 2);
  }
  // the first lawn: a signpost where the road leaves it, lamps along the road, the first hints
  put('signpost', 8, 128, { rot: 0.3, boards: [
    { yaw: -Math.PI * 0.82, y: 3.4, len: 2.3, tint: [0.7, 0.95, 0.92] },        // west: Rimewood
    { yaw: -Math.PI * 0.18, y: 2.6, len: 2.2, tint: [0.8, 0.9, 1.0] },          // east: the Icefall
    { yaw: -Math.PI / 2, y: 1.8, len: 2.1, tint: [1.0, 0.8, 0.9] },             // north: the lake and the ridge
  ] }, 1.5);
  lampsAlong(ctx, 'trunk', 26, 14, 150);
  gp.hints.push({ x: sp.x, z: sp.z - 6, r: 9, text: 'WELCOME TO FROSTBLOOM HOLLOW! THE BLOSSOMS ARE ASLEEP IN THE ICE. THAW THEM WITH FIRE', dur: 7 });
  gp.hints.push({ x: 8, z: 120, r: 11, text: 'WEST LIES RIMEWOOD, EAST THE ICEFALL, AND NORTH THE FROZEN LAKE AND THE RIDGE', dur: 7 });
  ctx.addBunnies(-14, 150, 3, 7); ctx.addBunnies(18, 118, 2, 6);
  for (const [x, z, g] of [[-10, 160, [1, 1, 2]], [16, 150, [2, 5]], [-6, 112, [1, 1, 1]]]) ctx.addVase(x, z, g);
}

// ---- Glasswater: the frozen lake, its ring road and the islet with the second Frostbloom -------------------------------------------------------------
function layoutGlasswater(ctx) {
  const { L, gp, put, rng, h } = ctx;
  const I = LAKE.islets[0];
  // ice floes from the south shore out to the islet: hops a plain jump makes (under 5 m centre to centre), each floe's top just over the water
  const stones = [];
  for (let z = I.z + I.r * 1.25 + 1.8; z < LAKE.z + LAKE.rz; z += 3.9) if (h(I.x, z) < WATER_LEVEL - 0.35) stones.push(z);
  stones.forEach((z, k) => { const x = I.x + Math.sin(k * 1.7) * 0.9; put('stepping_stone', x, z, { top: 1.9, h: WATER_LEVEL + 0.45 - h(x, z), span: 5 }, 2.6); });
  put('crystal_cluster', I.x - 3.2, I.z - 2.4, { color: 'cyan', count: 5 }, 2.4);
  put('crystal_cluster', I.x + 3.4, I.z + 2.2, { color: 'cyan', count: 4 }, 2.2);
  ctx.gemArc([[I.x, 2.0, I.z + 20], [I.x, 3.6, I.z + 12], [I.x, I.top + 1.8, I.z + 4]], 5, 1);
  gp.hints.push({ x: 0, z: 62, r: 9, text: 'THE ICE IS THIN OUT THERE. HOP FROM FLOE TO FLOE', dur: 6 });
  // the ring road: torches every 38 m, standing stones and crystals along the shore, flower patches where the spring is trying to return
  lampsAlong(ctx, 'ring', 38, 10, Infinity, 1.8, 'torch_stand');
  ctx.scatter('crystal_cluster', 14, regionBand(ctx, 'ring', 0.15, 0.7), { r: 2.4, path: 3, lake: 1.12 }, () => ({ color: 'cyan', count: 4 + rng.int(0, 3) }));
  ctx.scatter('rock_cluster', 10, regionBand(ctx, 'ring', 0.4, 1.0), { r: 3.5, path: 3, lake: 1.12 });
  ctx.scatter('flower_patch', 14, regionBand(ctx, 'ring', 0.3, 1.0), { r: 3, path: 3, lake: 1.15 }, () => bloom());
  put('standing_stones', -70, 78, { r: 6, count: 6, glowColor: [0.6, 0.9, 1.0] }, 8);
  put('standing_stones', 70, 78, { r: 6, count: 6, glowColor: [1.0, 0.7, 0.9] }, 8);
  gp.hints.push({ x: 0, z: 90, r: 14, text: 'THE ROAD RUNS ROUND THE FROZEN LAKE. THE RIDGE RISES IN THE NORTH', dur: 6 });
  for (const [x, z, g] of [[-60, 70, [1, 1, 2]], [64, 72, [2, 5]], [-82, 10, [1, 1, 1]], [82, 8, [1, 2]], [-40, -22, [1, 1, 2]], [44, -22, [2, 2]]]) ctx.addVase(x, z, g);
  ctx.addBunnies(-70, 60, 3, 8); ctx.addBunnies(70, 60, 3, 8); ctx.addBunnies(0, -26, 2, 8);
  void L;
}

// ---- Rimewood: a forest, a clearing with the first sleeping bloom of the west, and a glade shut with a cracked wall ----------------------------------
function layoutRimewood(ctx) {
  const { gp, put, rng, h } = ctx;
  // the clearing round the third goal: a ring of standing stones (a rune circle that glows)
  const g = BRIEF.goals.find((q) => q.id === 'rime');
  put('standing_stones', g.x, g.z, { r: 9, count: 7, glowColor: [0.7, 0.9, 1.0] }, 11);
  ctx.addVase(g.x - 9, g.z + 10, [2, 5]); ctx.addVase(g.x + 8, g.z + 11, [1, 1, 2]);
  // the forest: pines under snow and bare blossom trees; the clearing is kept open by the goal's reserved footprint and the stones'
  ctx.scatter('tree_pine', 70, regionBand(ctx, 'rimewood', 0.45, 1.25), { r: 3.4, path: 4, maxSlope: 0.45 }, () => pine(rng));
  ctx.scatter('tree_round', 26, regionBand(ctx, 'rimewood', 0.5, 1.15), { r: 4.2, path: 4, maxSlope: 0.4 }, () => blossom(rng));
  ctx.scatter('boulder_big', 6, regionBand(ctx, 'rimewood', 0.6, 1.2), { r: 4.5, path: 3, maxSlope: 0.5 });
  ctx.scatter('rock_cluster', 10, regionBand(ctx, 'rimewood', 0.5, 1.2), { r: 3.5, path: 3 });
  ctx.scatter('fallen_log', 4, regionBand(ctx, 'rimewood', 0.5, 1.0), { r: 2.4, path: 3 });
  ctx.scatter('flower_patch', 12, regionBand(ctx, 'rimewood', 0.3, 1.0), { r: 3, path: 3 }, () => bloom());
  ctx.addBunnies(-100, 46, 3, 8); ctx.addBunnies(-120, 30, 2, 7);
  gp.hints.push({ x: -80, z: 34, r: 12, text: 'RIMEWOOD: A TRAIL LEADS WEST, A CLEARING LIES BEYOND THE TREES', dur: 6 });
  // the frozen glade: a wall across the strip, a chest inside, flowers frozen in bloom
  const G = pts('rimeglade'), a = G[0], b = G[1], c = G[2];
  const dx = c[0] - a[0], dz = c[1] - a[1], dl = Math.hypot(dx, dz), ux = dx / dl, uz = dz / dl, yaw = Math.atan2(ux, uz);
  ctx.addWall(b[0], b[1], yaw, 8.4, 5.6, [25]);
  gp.hints.push({ x: a[0] - ux * 8, z: a[1] - uz * 8, r: 9, text: 'THAT WALL OF ICE LOOKS CRACKED... TRY CHARGING IT', dur: 6 });
  const at = (along, side = 0) => [c[0] + ux * along - uz * side, c[1] + uz * along + ux * side];
  const [cx, cz] = at(5);
  gp.chests.push({ x: cx, y: h(cx, cz), z: cz, yaw: yaw + Math.PI, gems: [10, 10], secret: 'rimeglade' });
  for (const [al, s, r] of [[-2, -5, 3], [-4, 5, 3], [2, 5.5, 2.4], [2, -5.5, 2.4]]) put('flower_patch', ...at(al, s), bloom(r, 12), r);
  put('crystal_cluster', ...at(7, 3.5), { color: 'cyan', count: 5 }, 2.4);
  put('tree_round', ...at(1, 7), { canopy: 'leaves_blossom', size: 'm' }, 3.5);
  gp.purple.push([at(0, 0)[0], h(...at(0, 0)) + 1.3, at(0, 0)[1]]);
  void RIME_GLADE;
}

// ---- the glacier: the Icefall over the mouth, the way in, the heart chamber under its skylight, the vault behind a cracked wall -------------------------------------
/** where the glacier's south wall stands at the mouth (glacier.js: the bastion's face) */
const FACE_Z = -7.2;

/** torches along a tunnel, alternating sides, from `s0` every `every` metres */
function torchesAlong(ctx, name, every, s0, s1 = Infinity, margin = 1.3) {
  const len = GLACIER.length(name);
  let k = 0;
  for (let s = s0; s <= Math.min(len - 2, s1); s += every, k++) {
    const q = GLACIER.at(name, s), p = GLACIER.at(name, s, (k % 2 ? 1 : -1) * (q.hw - margin));
    ctx.put('torch_stand', p.x, p.z, { rot: p.yaw }, 1.2);
  }
}
/** crystals at a tunnel's walls: [s, side (+ right, - left), count] */
function crystalsIn(ctx, name, list) {
  for (const [s, side, count] of list) { const p = GLACIER.at(name, s, side); ctx.put('crystal_cluster', p.x, p.z, { rot: (s * 7.3 + side) % TAU, color: 'cyan', count: count ?? 5 }, 2.2); }
}
/** a line of gems along a tunnel's middle, the values cycling */
function gemsAlong(ctx, name, every, pattern, s0, s1 = Infinity) {
  const len = GLACIER.length(name);
  let k = 0;
  for (let s = s0; s <= Math.min(len - 1.5, s1); s += every) { const p = GLACIER.at(name, s); ctx.addGem(p.x, p.z, pattern[k++ % pattern.length]); }
}

function layoutGlacier(ctx) {
  const { gp, put, h } = ctx;
  const lane = GLACIER.at('mouth', 0), mouth = GLACIER.at('mouth', 6);
  // the frozen waterfall hangs over the mouth: its flows against the wall, an opening under it for the way in
  put('ice_fall', lane.x, FACE_Z + 0.8, { rot: 0, h: 15, w: 22, gap: 10, gapH: 8.4 }, 13);
  for (const side of [-1, 1]) {
    const p = GLACIER.at('mouth', 1, side * (mouth.hw + 2.2)), c = GLACIER.at('mouth', 4, side * (mouth.hw + 5.2));
    put('torch_stand', p.x, p.z, {}, 1.4);
    put('crystal_cluster', c.x, c.z, { color: 'cyan', count: 5 }, 2.4);
  }
  gp.hints.push({ x: lane.x, z: lane.z + 8, r: 12, text: 'THE ICEFALL: A CAVE LIES BEHIND THE FROZEN WATER', dur: 7 });
  // the way in: torches and crystals, a trail of gems up to the chamber
  torchesAlong(ctx, 'mouth', 11, 16);
  crystalsIn(ctx, 'mouth', [[14, -3.4, 5], [21, 3.4, 4], [27, -3.6, 5]]);
  gemsAlong(ctx, 'mouth', 5.5, [1, 1, 2], 14);
  for (const s of [20, 30]) { const p = GLACIER.at('mouth', s, s > 24 ? 2.4 : -2.4); ctx.addVase(p.x, p.z, s > 24 ? [1, 2] : [1, 1, 1], h(p.x, p.z)); }
  const guard = GLACIER.at('mouth', 23, 2.2);
  ctx.addEnemy(guard.x, guard.z, 'basic', 4);

  // the heart chamber: the daylight of the skylight pours down on the Frostbloom, spires and crystals round its rim, guardians
  const at = (deg, r) => [HEART.x + Math.cos(deg * TAU / 360) * r, HEART.z + Math.sin(deg * TAU / 360) * r];
  put('light_shaft', HEART.x, HEART.z, { h: 13.5, r0: 2.2, r1: 3.3, color: [0.62, 0.86, 1.0], glow: [0.6, 0.85, 1.0] }, 0);
  put('standing_stones', HEART.x, HEART.z, { r: 6.4, count: 7, glowColor: [0.7, 0.9, 1.0] }, 8);
  for (const deg of [35, 140, 215, 310]) { const [x, z] = at(deg, 11.4); put('torch_stand', x, z, {}, 1.2); }
  for (const [deg, r] of [[60, 10.8], [112, 11], [250, 10.6], [290, 10.8], [345, 10.6]]) { const [x, z] = at(deg, r); put('crystal_cluster', x, z, { rot: deg, color: 'cyan', count: 6 }, 2.6); }
  for (const deg of [75, 275]) { const [x, z] = at(deg, 11.8); put('crystal_spire', x, z, { color: 'cyan', h: 7 }, 2.4); }
  for (let i = 0; i < 10; i++) { const [x, z] = at(i * 36 + 18, 9.0); ctx.addGem(x, z, i % 5 === 0 ? 2 : 1); }
  for (const [deg, g] of [[100, [1, 2]], [205, [5]], [330, [1, 1, 2]]]) { const [x, z] = at(deg, 9.6); ctx.addVase(x, z, g, h(x, z)); }
  ctx.addEnemy(...at(205, 8.6), 'bell', 3);
  ctx.addEnemy(...at(330, 8.6), 'thorn', 3);
  gp.hints.push({ x: HEART.x, z: HEART.z + 8, r: 13, text: 'THE HEART OF THE GLACIER. THE FROSTBLOOM SLEEPS UNDER THE SKYLIGHT. A CRACKED WALL SHUTS THE WEST PASSAGE', dur: 8 });
  gp.soundSources.push({ name: 'portal_hum', x: HEART.x, y: PLINTH + 2, z: HEART.z, range: 22, vol: 0.35 });

  // the ice vault: a passage west out of the chamber, shut with a cracked wall; behind it a little round room of crystals and a chest
  const m = GLACIER.at('vault', 5.5);
  ctx.addWall(m.x, m.z, m.yaw, 7.0, 5.7, [25]);
  const v0 = GLACIER.at('vault', 0);
  gp.hints.push({ x: v0.x, z: v0.z + 3, r: 8, text: 'A CRACKED WALL OF ICE SHUTS THIS PASSAGE... TRY CHARGING IT', dur: 6 });
  const va = (deg, r) => [VAULT.x + Math.cos(deg * TAU / 360) * r, VAULT.z + Math.sin(deg * TAU / 360) * r];
  for (const [deg, count] of [[20, 5], [75, 6], [135, 5], [200, 6], [255, 5], [320, 5]]) { const [x, z] = va(deg, 5.4); if (Math.hypot(x - m.x, z - m.z) > 3.5) put('crystal_cluster', x, z, { rot: deg, color: 'cyan', count }, 2.2); }
  const [cx, cz] = va(180, 3.6);
  gp.chests.push({ x: cx, y: h(cx, cz), z: cz, yaw: -Math.PI / 2, gems: [10, 10, 5], secret: 'vault' });
  const [px, pz] = va(0, 2.2);
  gp.purple.push([px, h(px, pz) + 1.3, pz]);
}

// ---- Aurora Ridge: a climb in switchbacks to the Hollow, a lookout off its road ------------------------------------------------------------------------
function layoutRidge(ctx) {
  const { gp, put, rng, h } = ctx;
  lampsAlong(ctx, 'ridge', 34, 14, 330, 1.8, 'torch_stand');
  put('signpost', 12, -14, { rot: 0.2, boards: [{ yaw: -Math.PI / 2, y: 3.4, len: 2.3, tint: [0.8, 0.9, 1.0] }] }, 1.5);
  gp.hints.push({ x: 0, z: -26, r: 12, text: 'AURORA RIDGE CLIMBS IN SWITCHBACKS TO THE HOLLOW. KEEP YOUR FIRE READY', dur: 7 });
  // the lookout: a spur east off the road, a bench, crystals, a chest at its end
  const P = pts('lookout'), end = P[P.length - 1];
  gp.chests.push({ x: end[0] - 3, y: h(end[0] - 3, end[1]), z: end[1], yaw: -Math.PI / 2, gems: [10, 5, 5], secret: 'lookout' });
  put('bench', end[0] - 6, end[1] + 3, { rot: faceTo(end[0] - 6, end[1] + 3, end[0] + 20, end[1] - 20) }, 1.6);
  put('crystal_cluster', end[0] - 1, end[1] - 3.5, { color: 'cyan', count: 5 }, 2.4);
  gp.hints.push({ x: P[1][0], z: P[1][1], r: 10, text: 'A SIDE TRAIL RUNS OUT TO A LOOKOUT OVER THE LAKE. THE AURORA IS BEAUTIFUL FROM HERE', dur: 6 });
  ctx.scatter('tree_pine', 30, regionBand(ctx, 'ridge', 0.7, 1.25), { r: 3.4, path: 4, maxSlope: 0.5, minH: 1 }, () => pine(rng));
  ctx.scatter('crystal_spire', 8, regionBand(ctx, 'ridge', 0.7, 1.3), { r: 2.6, path: 3.5, maxSlope: 0.5 }, () => ({ color: 'cyan', h: 5 + rng.int(0, 4) }));
  ctx.scatter('rock_cluster', 16, regionBand(ctx, 'ridge', 0.7, 1.3), { r: 3.5, path: 3, maxSlope: 0.5 });
  ctx.scatter('boulder_big', 6, regionBand(ctx, 'ridge', 0.9, 1.4), { r: 4.5, path: 3, maxSlope: 0.55 });
  for (const t of [0.22, 0.46, 0.7, 0.88]) { const p = ctx.pathPoint('ridge', t); ctx.addVase(p.x + p.dz * 4.4, p.z - p.dx * 4.4, [2, 5]); }
}

// ---- the ice gate and the Hollow: a crater, its floor frozen, the Heartbloom in the middle -------------------------------------------------------------
function layoutHollow(ctx) {
  const { gp, put, h } = ctx;
  // the gate: two pillars in the gorge and a field of ice between them that melts when four Frostbloom have bloomed (the barrier: gp.barrier)
  put('gate_pillars', GATE.x, GATE.z, { rot: GATE.yaw }, 8);
  const gate = ctx.anchor('gate_pillars', 'barrier', GATE.x, GATE.z, { rot: GATE.yaw });
  gp.barrier = { x: gate ? gate[0] : GATE.x, y: gate ? gate[1] - 5.75 : h(GATE.x, GATE.z), z: gate ? gate[2] : GATE.z, yaw: GATE.yaw, opts: { tint: [0.5, 2.1, 1.1] } };       // (the field is ice teal, not the Dawn Gate's violet)
  gp.soundSources.push({ name: 'portal_hum', x: gp.barrier.x, y: gp.barrier.y + 4, z: gp.barrier.z, range: 38, vol: 1.2, when: 'barrier' });
  gp.hints.push({ x: GATE.x, z: GATE.z + 12, r: 10, text: 'THE ICE GATE MELTS WHEN FOUR FROSTBLOOMS HAVE BLOOMED', dur: 7 });
  for (const side of [-1, 1]) {
    put('torch_stand', GATE.x + side * 7.5, GATE.z + 10, {}, 1.5);
    put('crystal_cluster', GATE.x + side * 9.5, GATE.z + 12.5, { color: 'cyan', count: 5 }, 2.4);
  }
  // inside: a ring of crystal spires on the floor's rim, a rune circle round the Heartbloom, vases, the guards' places are in layoutDanger
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU + 0.35, x = HOLLOW.x + Math.cos(a) * (HOLLOW.r - 4), z = HOLLOW.z + Math.sin(a) * (HOLLOW.r - 4);
    if (Math.hypot(x - GATE.x, z - (GATE.z - 4)) < 9) continue;
    put('crystal_spire', x, z, { color: k % 2 ? 'cyan' : 'violet', h: 6 + (k % 3) * 2 }, 3);
  }
  put('standing_stones', HOLLOW.x, HOLLOW.z, { r: 11, count: 9, glowColor: [1.0, 0.72, 0.9] }, 13);
  for (const [dx, dz, g] of [[-14, 8, [2, 5]], [14, 9, [2, 5]], [-6, 16, [1, 2, 5]], [8, -15, [5, 5]]]) ctx.addVase(HOLLOW.x + dx, HOLLOW.z + dz, g);
  gp.purple.push([HOLLOW.x - 8, h(HOLLOW.x - 8, HOLLOW.z + 6) + 1.3, HOLLOW.z + 6], [HOLLOW.x + 8, h(HOLLOW.x + 8, HOLLOW.z + 6) + 1.3, HOLLOW.z + 6]);
  gp.hints.push({ x: HOLLOW.x, z: HOLLOW.z + 22, r: 12, text: 'THE HEARTBLOOM! THE GUARDIANS OF THE HOLLOW WILL NOT LET IT BE THAWED EASILY', dur: 7 });
}

// ---- the Snuffers: quiet at the start, more of them and harder ones as the way climbs -----------------------------------------------------------------------
function layoutDanger(ctx) {
  const side = (p, k) => [p.x + p.dz * k, p.z - p.dx * k];
  // [road, how far along it (0..1), kind]
  const marks = [
    ['trunk', 0.78, 'basic'], ['ring', 0.08, 'basic'],
    ['ring', 0.22, 'basic'], ['rimeroad', 0.55, 'basic'], ['ring', 0.4, 'bell'], ['iceroad', 0.35, 'basic'], ['iceroad', 0.72, 'bell'],
    ['ring', 0.62, 'basic'], ['ring', 0.8, 'bell'],
    ['ridge', 0.1, 'basic'], ['ridge', 0.22, 'thorn'], ['ridge', 0.34, 'bell'], ['ridge', 0.48, 'thorn'], ['ridge', 0.6, 'bell'], ['ridge', 0.72, 'thorn'], ['ridge', 0.86, 'bell'],
  ];
  marks.forEach(([road, t, kind], i) => { const p = ctx.pathPoint(road, t), [x, z] = side(p, i % 2 ? 3.6 : -3.6); ctx.addEnemy(x, z, kind, 4); });
  // the Hollow's guardians: a ring round the Heartbloom (the crater situation wants at least two within 30 m)
  for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + 0.6; ctx.addEnemy(HOLLOW.x + Math.cos(a) * 15, HOLLOW.z + Math.sin(a) * 15, k % 2 ? 'bell' : 'thorn', 3); }
  ctx.gp.hints.push({ x: 16, z: 110, r: 10, text: 'ARMOURED SNUFFERS: FIRE BOUNCES OFF BELLS, SPIKES HURT WHEN RAMMED', dur: 7 });
}

// ---- trees, flowers, rocks: pines under snow, bare trees in blossom ------------------------------------------------------------------------------------------
function layoutScatter(ctx) {
  const { rng } = ctx;
  for (const id of ['gate', 'trunk']) {
    ctx.scatter('tree_pine', 18, regionBand(ctx, id, 0.7, 1.2), { r: 3.4, path: 4, maxSlope: 0.45 }, () => pine(rng));
    ctx.scatter('tree_round', 6, regionBand(ctx, id, 0.6, 1.1), { r: 4.2, path: 4, maxSlope: 0.4 }, () => blossom(rng));
    ctx.scatter('flower_patch', 10, regionBand(ctx, id, 0.2, 1.0), { r: 3, path: 3 }, () => bloom());
    ctx.scatter('rock_cluster', 6, regionBand(ctx, id, 0.8, 1.3), { r: 3.5, path: 3 });
  }
  ctx.scatter('tree_pine', 22, regionBand(ctx, 'ring', 0.7, 1.3), { r: 3.4, path: 4, maxSlope: 0.45, lake: 1.3 }, () => pine(rng));
  ctx.scatter('tree_round', 10, regionBand(ctx, 'ring', 0.7, 1.2), { r: 4.2, path: 4, maxSlope: 0.4, lake: 1.3 }, () => blossom(rng));
  ctx.scatter('tree_pine', 24, regionBand(ctx, 'icefall', 0.6, 1.3), { r: 3.4, path: 4, maxSlope: 0.5 }, () => pine(rng));
  ctx.scatter('rock_cluster', 12, regionBand(ctx, 'icefall', 0.6, 1.3), { r: 3.5, path: 3, maxSlope: 0.5 });
  ctx.scatter('crystal_cluster', 8, regionBand(ctx, 'icefall', 0.5, 1.2), { r: 2.4, path: 3 }, () => ({ color: 'cyan', count: 5 }));
  void flatSpot;
}
