// The hand-authored part of Dawnhaven: the doors, each in a place of its own, and everything that makes the places - the Cove's hamlet and its Elder, the Heartlands, the Hearth Terraces with
// their village and windmill, Mirror Lake with its long pier, the Ember Canyon and its forge, the Ascent and the Guardian's gate, the Crag (layout-crag.js). Positions come from home/level.js and crag.js;
// everything here is expressed in world coordinates and validated against the terrain by ctx.h() / ctx.slope() (like levelgen/layout.js, which does the same for Gloaming Vale).
//
// Called twice by buildWorld (a dry pass, then a wet one) like the realm's populate: it must be deterministic. The gameplay data it fills in (`world.gameplay`, kept from the dry pass):
//   portals   the doors (and, in the realm, the ring above the Great Beacon): see systems/portals.js        arrivals   where the hero stands when he comes through a realm's door: by realm id
//   npcs / hints / chests / walls / vases / gems / bunnies / soundSources   as in the realm
import { makeCtx } from '../levelgen/helpers.js';
import { Collision } from '../collision.js';
import { attachGameplay } from '../levelgen/gameplay.js';
import { lilyLayout } from '../props/nature/ground.js';
import { WATER_LEVEL } from '../level.js';
import { DOORS, REGIONS, ARRIVE, inFront, polar } from './level.js';
import { layoutCrag } from './layout-crag.js';
import { TAU, sum, faceTo, flatSpot, regionPts as regionPtsOf, roadAlong, roadOf, band as bandOf, lampsAlong } from '../realm/helpers.js';

const STAGED = ['gems', 'vases', 'chests', 'walls', 'enemies', 'bunnies', 'npcs', 'hints', 'portals'];

export function populateHome(kit, world) {
  const ctx = makeCtx(kit, world, 4417);
  attachGameplay(ctx);
  ctx.gp.portals = [];
  ctx.gp.arrivals = {};
  ctx.gp.purple = [];
  const L = ctx.L;
  const stage = (name, fn) => {
    const marks = STAGED.map((k) => ctx.gp[k].length);
    ctx.stage = name;
    fn(ctx);
    STAGED.forEach((k, i) => { for (let j = marks[i]; j < ctx.gp[k].length; j++) { const r = ctx.gp[k][j]; if (r && typeof r === 'object' && !r.src) r.src = name; } });
    ctx.stage = 'populate';
  };

  stage('layoutDoors', layoutDoors);
  stage('layoutCove', layoutCove);
  stage('layoutHeartlands', layoutHeartlands);
  stage('layoutTerraces', layoutTerraces);
  stage('layoutMill', layoutMill);
  stage('layoutGarden', layoutGarden);
  stage('layoutLake', layoutLake);
  stage('layoutCanyon', layoutCanyon);
  stage('layoutAscent', layoutAscent);
  stage('layoutCrag', layoutCrag);
  stage('scatterHome', scatterHome);
  stage('finalizeHomeGems', finalizeHomeGems);

  const sp = L.spawn;
  ctx.gp.spawn = { x: sp.x, y: ctx.h(sp.x, sp.z), z: sp.z, yaw: sp.yaw };
  ctx.gp.counts = ctx.counts;
  if (kit.pass === 'dry') world.gameplay = ctx.gp;
  return ctx;
}

// ---- helpers (realm/helpers.js, here bound to Dawnhaven's regions) ---------------------------------------------------------------------------
const regionPts = (id) => regionPtsOf(REGIONS, id);
const band = (ctx, id, f0, f1, lo, hi) => bandOf(ctx, REGIONS, id, f0, f1, lo, hi);

// ---- the doors ---------------------------------------------------------------------------------------------------------------
function layoutDoors(ctx) {
  const { gp, put, h } = ctx;
  for (const d of DOORS) {
    const sealed = !d.target;
    const gy = d.y ?? h(d.x, d.z);
    put('realm_door', d.x, d.z, { rot: d.yaw, color: d.color, sealed, y: gy }, 12);
    gp.portals.push({
      id: d.id, name: d.name, tag: d.tag, kind: 'door', shape: 'arch', x: d.x, y: gy, z: d.z, yaw: d.yaw, r: 2.6, hs: 3.1, cy: 3.4,
      color: d.color, target: d.target, state: sealed ? 'sealed' : 'open',
      blurb: `${d.name}: ${d.tag}. THE PORTAL SLEEPS - A REALM FOR ANOTHER DAY.`,
    });
    if (d.target) {
      gp.arrivals[d.target] = { x: inFront(d, 11)[0], z: inFront(d, 11)[1], yaw: d.yaw };          // (see ARRIVE in level.js: the first door's is the world's spawn)
      gp.soundSources.push({ name: 'portal_hum', x: d.x, y: gy + 3.4, z: d.z, range: 44, vol: 1.3, when: `portal:${d.id}` });
    }
  }
}

// ---- the Landing Cove --------------------------------------------------------------------------------------------------------------
function layoutCove(ctx) {
  const { gp, put } = ctx;
  const gd = DOORS[0];
  // the first door: a court of flagstone (the ground rule), torches at the corners of its dais, flower beds, lamps along the way to it
  for (const side of [-1, 1]) {
    put('torch_stand', ...inFront(gd, 6.8, side * 5.6), { rot: gd.yaw }, 1.5);
    put('flower_patch', ...inFront(gd, 10.5, side * 7.5), { r: 2.6, count: 9 }, 2);
    put('lamp_post', ...inFront(gd, 17, side * 4.2), { rot: gd.yaw + Math.PI }, 1.2);
  }
  put('banner_pole', ...inFront(gd, 9, -8.5), { rot: gd.yaw + Math.PI / 2 }, 1);
  put('banner_pole', ...inFront(gd, 9, 8.5), { rot: gd.yaw - Math.PI / 2 }, 1);
  gp.hints.push({ x: inFront(gd, 6.5)[0], z: inFront(gd, 6.5)[1], r: 5.5, text: 'THE DOOR TO GLOAMING VALE SHINES VIOLET. WALK INTO ITS LIGHT TO BE CARRIED THERE', dur: 6 });

  // the landing's square: a fountain, benches round it, the market on its south side, a cart
  const px = 6, pz = 152;
  put('fountain', px, pz, {}, 6);
  for (const deg of [20, 120, 210, 300]) { const [x, z] = polar(deg, 8.4, px, pz); put('bench', x, z, { rot: faceTo(x, z, px, pz) }, 1.6); }
  for (const deg of [-40, 55, 150, 235]) { const [x, z] = polar(deg, 12.5, px, pz); put('lamp_post', x, z, { rot: faceTo(x, z, px, pz) }, 1.2); }
  [[78, 0], [102, 1], [126, 2]].forEach(([deg, v]) => { const [x, z] = polar(deg, 17.5, px, pz); put('market_stall', x, z, { rot: faceTo(x, z, px, pz), variant: v }, 4); });
  for (const [deg, r, rot] of [[88, 21, 0.3], [112, 22, 2.1]]) { const [x, z] = polar(deg, r, px, pz); put(rot > 2 ? 'crate_stack' : 'barrel_cluster', x, z, { rot }, 2.2); }
  { const [x, z] = polar(140, 22, px, pz); put('cart', x, z, { rot: faceTo(x, z, px, pz) + 1.2 }, 3); }
  // Elder Wick: where the hero will run to first, a few strides from where he comes out of the door, on the lawn
  const ex = ARRIVE[0] + 17, ez = ARRIVE[1] - 5;
  gp.npcs.push({ id: 'elder', name: 'ELDER WICK', model: 'elder', script: 'home_elder', x: ex, z: ez, yaw: faceTo(ex, ez, ctx.L.spawn.x, ctx.L.spawn.z) });
  gp.hints.push({ x: ARRIVE[0] + 4, z: ARRIVE[1], r: 8, text: 'WELCOME TO DAWNHAVEN! TALK TO ELDER WICK, THEN FOLLOW THE ROAD NORTH. EACH DOOR STANDS SOMEWHERE OF ITS OWN', dur: 7 });
  gp.soundSources.push({ name: 'waterfall', x: px, y: 1.6, z: pz, range: 20, vol: 0.5 });
  // a signpost where the Cove's road leaves it, its boards pointing at the places beyond
  put('signpost', 12, 124, { rot: 0.1, boards: [
    { yaw: -Math.PI / 2, y: 3.4, len: 2.3, tint: [0.7, 0.95, 0.92] },            // north: the Crag
    { yaw: -Math.PI * 0.86, y: 2.6, len: 2.2, tint: [1.0, 0.72, 0.6] },          // north-west: the terraces
    { yaw: -Math.PI * 0.12, y: 1.8, len: 2.1, tint: [1.0, 0.9, 0.62] },          // east: the lake
  ] }, 1.5);
  // the hamlet at the Cove's east end: cottages, a well, haystacks, a garden
  const homes = [[44, 144, 'house_cottage', 0], [54, 158, 'house_cottage', 2], [-14, 168, 'house_round'], [-30, 160, 'house_cottage', 1]];
  for (const [x0, z0, name, variant] of homes) {
    const foot = name === 'house_round' ? 9 : 10;
    const spot = flatSpot(ctx, x0, z0, foot, { maxR: 7, path: foot * 0.55 });
    if (!spot) continue;
    const params = { rot: faceTo(spot[0], spot[1], px, pz) };
    if (variant !== undefined) params.variant = variant;
    put(name, spot[0], spot[1], params, foot * 0.55);
  }
  for (const [x, z, name] of [[36, 164, 'well'], [58, 146, 'haystack'], [-6, 174, 'haystack'], [48, 170, 'garden_plot'], [-22, 150, 'scarecrow']]) {
    const s = flatSpot(ctx, x, z, 4, { maxR: 6 });
    if (s) put(name, s[0], s[1], { rot: faceTo(s[0], s[1], px, pz) }, 2.4);
  }
  ctx.addBunnies(30, 160, 3, 6); ctx.addBunnies(-12, 148, 2, 6);
  for (const [x, z, g] of [[-2, 142, [1, 1, 2]], [30, 140, [1, 2]], [-34, 150, [2, 2]], [52, 152, [1, 1, 1]]]) ctx.addVase(x, z, g);
}

// ---- the Heartlands ----------------------------------------------------------------------------------------------------------------
function layoutHeartlands(ctx) {
  const { gp, put, rng } = ctx;
  lampsAlong(ctx, 'main', 24, 18, 150);
  lampsAlong(ctx, 'lake', 30, 8);
  lampsAlong(ctx, 'ledgeway', 20, 6);
  // the junctions: the west road to the terraces leaves the trunk at (4, 98), the lake road at (26, 92)
  put('signpost', 12, 104, { rot: 0.5, boards: [
    { yaw: -Math.PI / 2, y: 3.4, len: 2.3, tint: [0.7, 0.95, 0.92] },
    { yaw: -Math.PI, y: 2.6, len: 2.2, tint: [1.0, 0.72, 0.6] },
    { yaw: 0, y: 1.8, len: 2.1, tint: [1.0, 0.9, 0.62] },
  ] }, 1.5);
  gp.hints.push({ x: 14, z: 100, r: 10, text: 'THE ROAD WEST CLIMBS THE HEARTH TERRACES. THE ROAD EAST RUNS ALONG THE LAKE. NORTH LIES THE CRAG', dur: 7 });
  // a ruin beside the trunk, a ring of standing stones in the north-west meadow, a scarecrow field on the east
  put('ruin_pillars', 52, 60, { rot: 0.4, count: 5 }, 6);
  put('ruin_arch', 44, 74, { rot: faceTo(44, 74, 28, 76) }, 5);
  put('standing_stones', -16, 56, { r: 7, count: 7, glowColor: [0.5, 0.8, 1.0] }, 9);
  for (const [x, z, name] of [[56, 100, 'garden_plot'], [62, 108, 'garden_plot'], [66, 98, 'scarecrow'], [48, 112, 'haystack'], [70, 112, 'haystack'], [58, 120, 'cart']]) {
    const s = flatSpot(ctx, x, z, 4, { maxR: 6 });
    if (s) put(name, s[0], s[1], { rot: rng.float(0, TAU) }, 2.6);
  }
  ctx.scatter('rock_cluster', 6, band(ctx, 'trunk', 0.8, 1.6, 0.25, 0.9), { r: 3.5, path: 3, maxSlope: 0.5 });
  ctx.scatter('boulder_big', 3, band(ctx, 'trunk', 1.0, 1.6, 0.3, 0.85), { r: 4.5, path: 3, maxSlope: 0.55 });
  for (const [x, z, n] of [[-6, 120, 3], [60, 84, 3], [8, 66, 2], [34, 46, 2]]) ctx.addBunnies(x, z, n, 7);
  for (const [x, z, g] of [[2, 112, [1, 1, 2]], [36, 100, [2, 5]], [40, 66, [1, 1, 1]], [-2, 78, [1, 2]], [22, 52, [1, 1, 2]]]) ctx.addVase(x, z, g);
}

// ---- the Hearth Terraces: a hillside village --------------------------------------------------------------------------------------
function layoutTerraces(ctx) {
  const { gp, put, rng } = ctx;
  const T = regionPts('terraces');
  lampsAlong(ctx, 'west', 20, 10);
  // yard A is the square: a fountain, the market, benches; the yards above have cottages and gardens; D is a pasture
  const A = [(T[2][0] + T[3][0]) / 2, (T[2][1] + T[3][1]) / 2];
  put('fountain', A[0], A[1] - 6, {}, 6);
  for (const deg of [30, 150, 270]) { const [x, z] = polar(deg, 10, A[0], A[1] - 6); put('bench', x, z, { rot: faceTo(x, z, A[0], A[1] - 6) }, 1.6); }
  [[120, 0], [140, 1], [160, 2]].forEach(([deg, v]) => { const [x, z] = polar(deg, 20, A[0], A[1] - 6); put('market_stall', x, z, { rot: faceTo(x, z, A[0], A[1] - 6), variant: v }, 4); });
  put('bunting', 0, 0, { ax: A[0] - 18, az: A[1] - 2, bx: A[0] + 12, bz: A[1] - 1, h: 5.2 });
  put('banner_pole', A[0] - 18, A[1] - 2, {}, 1); put('banner_pole', A[0] + 12, A[1] - 1, {}, 1);
  gp.soundSources.push({ name: 'waterfall', x: A[0], y: 8, z: A[1] - 6, range: 22, vol: 0.5 });
  gp.hints.push({ x: A[0] + 18, z: A[1] + 8, r: 12, text: 'THE HEARTH TERRACES: THE ROAD CLIMBS ALL THE WAY TO THE WINDMILL AT THE TOP', dur: 6 });
  // cottages on the yards, doors to the road
  const homes = [
    [T[2], -1, 'house_cottage', 0], [T[2], 1, 'house_long'], [T[3], -1, 'house_cottage', 3], [T[3], 1, 'house_round'],
    [T[5], -1, 'house_cottage', 1], [T[5], 1, 'house_cottage', 2], [T[6], -1, 'house_round'], [T[6], 1, 'house_cottage', 0],
    [T[8], -1, 'house_cottage', 3], [T[8], 1, 'house_cottage', 1], [T[9], 1, 'house_long'], [T[9], -1, 'house_round'],
    [T[11], 1, 'house_cottage', 2], [T[12], -1, 'house_cottage', 0],
  ];
  for (const [q, side, name, variant] of homes) {
    const foot = name === 'house_long' ? 16 : name === 'house_round' ? 9 : 10;
    const idx = T.indexOf(q);
    const nxt = T[Math.min(idx + 1, T.length - 1)], prv = T[Math.max(idx - 1, 0)];
    let dx = nxt[0] - prv[0], dz = nxt[1] - prv[1];
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const off = q[3] * 0.6 * side;
    const spot = flatSpot(ctx, q[0] - dz * off, q[1] + dx * off, foot, { maxR: 8, path: foot * 0.6 });
    if (!spot) continue;
    const params = { rot: faceTo(spot[0], spot[1], q[0], q[1]) };
    if (variant !== undefined) params.variant = variant;
    put(name, spot[0], spot[1], params, foot * 0.55);
  }
  // wells, gardens, haystacks, a scarecrow
  for (const [q, name, dx, dz] of [[T[3], 'well', 7, 7], [T[5], 'garden_plot', -8, 4], [T[6], 'garden_plot', 9, 6], [T[8], 'well', 8, -5], [T[9], 'haystack', -10, 4], [T[11], 'haystack', 8, 7], [T[11], 'scarecrow', -8, -3], [T[12], 'garden_plot', 9, 3], [T[12], 'garden_plot', 9, 9]]) {
    const s = flatSpot(ctx, q[0] + dx, q[1] + dz, 4, { maxR: 7 });
    if (s) put(name, s[0], s[1], { rot: rng.float(0, TAU) }, 2.6);
  }
  ctx.scatter('flower_patch', 22, band(ctx, 'terraces', 0.2, 1.0), { r: 3, path: 3 }, () => ({ r: 4, count: 12 }));
  ctx.scatter('bush', 16, band(ctx, 'terraces', 0.3, 1.0), { r: 1.6, path: 2.6 }, () => ({ flowers: rng.chance(0.6) }));
  ctx.scatter('tree_round', 14, band(ctx, 'terraces', 0.5, 1.1), { r: 4.5, path: 4, maxSlope: 0.4 }, () => ({ canopy: rng.pick(['leaves_green', 'leaves_teal']), size: rng.pick(['m', 'l']) }));
  ctx.scatter('tree_birch', 8, band(ctx, 'terraces', 0.5, 1.1), { r: 3, path: 3.5 });
  for (const [q, n] of [[T[3], 3], [T[6], 3], [T[9], 2], [T[12], 3]]) ctx.addBunnies(q[0], q[1], n, 8);
  for (const [i, g] of [[2, [1, 1, 2]], [5, [2, 5]], [8, [1, 1, 1]], [11, [2, 2]], [13, [5]]]) { const q = T[i]; ctx.addVase(q[0] + 6, q[1] + 5, g); }
}

// ---- the windmill ridge --------------------------------------------------------------------------------------------------------------
function layoutMill(ctx) {
  const { gp, put } = ctx;
  const T = regionPts('terraces');
  const top = T[T.length - 2], end = T[T.length - 1];
  // the windmill at the head of the road, its door to the way up; the chest on its balcony is the lookout's secret
  const wx = end[0] + 6, wz = end[1] - 4;
  const yaw = faceTo(wx, wz, top[0], top[1]);
  put('windmill_body', wx, wz, { rot: yaw }, 8);
  const sails = ctx.anchor('windmill_body', 'sails', wx, wz, { rot: yaw });
  const lookout = ctx.anchor('windmill_body', 'beacon', wx, wz, { rot: yaw });
  if (sails) { gp.sails = { x: sails[0], y: sails[1], z: sails[2], yaw }; gp.soundSources.push({ name: 'windmill', x: sails[0], y: sails[1], z: sails[2], range: 40, vol: 1.6 }); }
  if (lookout) {
    gp.chests.push({ x: lookout[0], y: lookout[1], z: lookout[2], yaw: yaw + Math.PI, gems: [10, 5, 5], secret: 'mill' });
    gp.purple.push([lookout[0] + Math.cos(yaw) * 2.4, lookout[1] + 1.3, lookout[2] - Math.sin(yaw) * 2.4]);
  }
  gp.hints.push({ x: top[0], z: top[1] + 12, r: 14, text: 'THE WINDMILL\'S STAIR CLIMBS TO A LOOKOUT. WHAT A VIEW!', dur: 6 });
  // the overlook: benches facing the valley
  const ov = [top[0] + 10, top[1] + 10];
  for (const s of [-4, 4]) { const x = ov[0] + s, z = ov[1]; if (ctx.ok(x, z, { r: 1.6, maxSlope: 0.3, path: 1 })) put('bench', x, z, { rot: faceTo(x, z, 60, -40) }, 1.6); }
  put('flower_patch', ov[0] + 3, ov[1] + 5, { r: 3, count: 12 }, 2);
  ctx.scatter('tree_pine', 6, ctx.inCircle(wx, wz, 24), { r: 3.5, path: 4, maxSlope: 0.45 }, () => ({ size: ctx.rng.pick(['s', 'm', 'l']) }));
  ctx.scatter('boulder_big', 2, ctx.inCircle(wx, wz, 26), { r: 4.5, path: 3, maxSlope: 0.5 });
  ctx.addVase(wx - 9, wz + 8, [2, 2]); ctx.addVase(wx + 9, wz + 6, [5]);
}

// ---- the hidden garden: a glade off the terraces behind a cracked wall ---------------------------------------------------------------------
function layoutGarden(ctx) {
  const { gp, put, h } = ctx;
  const G = regionPts('garden');
  const a = G[0], b = G[1], c = G[2];
  // the way in is a corridor 8 m wide; the cracked wall closes it halfway along
  const dx = c[0] - a[0], dz = c[1] - a[1], dl = Math.hypot(dx, dz);
  const ux = dx / dl, uz = dz / dl;
  const yaw = Math.atan2(ux, uz);
  ctx.addWall(b[0], b[1], yaw, 8.4, 5.6, [25]);
  gp.hints.push({ x: a[0] - ux * 8, z: a[1] - uz * 8, r: 9, text: 'THAT WALL LOOKS CRACKED... TRY CHARGING IT', dur: 6 });
  // inside: a chest at the back, flowers, a bench, two birches and a crystal
  const at = (along2, side = 0) => [c[0] + ux * along2 - uz * side, c[1] + uz * along2 + ux * side];
  const [cx, cz] = at(5);
  gp.chests.push({ x: cx, y: h(cx, cz), z: cz, yaw: yaw + Math.PI, gems: [10, 10], secret: 'garden' });
  for (const [al, s, r] of [[-2, -5, 3], [-4, 5, 3], [2, 5.5, 2.4], [2, -5.5, 2.4]]) put('flower_patch', ...at(al, s), { r, count: 12 }, r);
  put('bench', ...at(-3, -6), { rot: yaw + Math.PI / 2 }, 1.6);
  put('tree_birch', ...at(1, 7), {}, 3); put('tree_birch', ...at(4, -7), {}, 3);
  put('crystal_cluster', ...at(7, 3.5), { color: 'violet', count: 5 }, 2.4);
  gp.purple.push([at(0, 0)[0], h(...at(0, 0)) + 1.3, at(0, 0)[1]]);
}

// ---- Mirror Lake and its pier --------------------------------------------------------------------------------------------------------
function layoutLake(ctx) {
  const { L, gp, put, rng, h } = ctx;
  const K = L.lake, I = L.islet;
  const td = DOORS.find((d) => d.id === 'tideglass');
  // the pier: out from the south shore, due north, 41 m of plank 3.6 wide; the door's own dais is the landing at its far end
  const shoreZ = K.z + K.rz * 0.97;
  const pierEnd = td.z + 6.05;                                             // (the dais runs 6 m in front of the door)
  put('pier', td.x, shoreZ + 1.5, { rot: Math.PI, len: shoreZ + 1.5 - pierEnd, width: 3.6, lampSide: 1 }, 6);
  gp.hints.push({ x: td.x, z: shoreZ + 6, r: 9, text: 'A LONG PIER RUNS OUT ONTO THE LAKE. SOMETHING SHINES AT ITS END', dur: 6 });
  for (const side of [-1, 1]) {
    put('torch_stand', ...inFront(td, 5.2, side * 5.0), { rot: td.yaw, y: WATER_LEVEL + 0.3 }, 1.5);
    put('lamp_post', td.x + side * 1.9, shoreZ - 14, { rot: 0, y: WATER_LEVEL + 0.3 }, 1.2);
    put('lamp_post', td.x + side * 1.9, shoreZ - 28, { rot: 0, y: WATER_LEVEL + 0.3 }, 1.2);
  }
  gp.soundSources.push({ name: 'waterfall', x: td.x, y: 1.5, z: td.z + 3, range: 30, vol: 0.6 });
  // reeds round the shore, lily pads on the water, boats at the pier's foot
  let placed = 0;
  for (let t = 0; t < 400 && placed < 28; t++) {
    const a = rng.float(0, TAU), d = rng.float(0.94, 1.03);
    const x = K.x + Math.cos(a) * K.rx * d, z = K.z + Math.sin(a) * K.rz * d;
    if (ctx.pathDist(x, z) < 3 || !ctx.occ.free(x, z, 1.6) || Math.abs(x - td.x) < 7) continue;
    if (put('reeds', x, z, { rot: rng.float(0, TAU), r: 2.6, count: 9 }, 1.6)) placed++;
  }
  const floats = (x, z, R) => [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]].every(([ox, oz]) => h(x + ox, z + oz) < WATER_LEVEL - 0.35);
  const taken = [[I.x, I.z, I.r + 2]];
  placed = 0;
  for (let t = 0; t < 300 && placed < 7; t++) {
    const a = rng.float(0, TAU), d = rng.float(0.45, 0.88);
    const x = K.x + Math.cos(a) * K.rx * d, z = K.z + Math.sin(a) * K.rz * d;
    if (Math.abs(x - td.x) < 9) continue;
    if (!ctx.occ.free(x, z, 2)) continue;
    const pads = lilyLayout(ctx.kit.rng(x, z, 104), 4, 5.5, { ok: (px, pz, R) => floats(x + px, z + pz, R) && taken.every(([tx, tz, tr]) => Math.hypot(x + px - tx, z + pz - tz) > R + tr + 1.2) });
    for (const [px, pz, sz] of pads) taken.push([x + px, z + pz, sz * 2]);
    if (put('lilypads', x, z, { pads, y: WATER_LEVEL + 0.16, span: 12 }, 2)) placed++;
  }
  put('boat', td.x - 8, shoreZ - 3, { rot: 0.5 }, 3);
  put('boat', td.x + 9, shoreZ + 0.5, { rot: -0.4, variant: 1 }, 3);
  // the secret: stepping stones lead west from the pier to the lake islet, where a chest waits under a little tree
  const sx = [td.x - 3.6, td.x - 7.6, td.x - 11.2], sz = [I.z + 3.5, I.z + 4.1, I.z + 4.0];
  for (let i = 0; i < 3; i++) put('stepping_stone', sx[i], sz[i], { top: 1.9, h: WATER_LEVEL + 0.45 - h(sx[i], sz[i]), span: 5 }, 2.6);
  gp.hints.push({ x: td.x - 2, z: I.z + 14, r: 8, text: 'STEPPING STONES LEAD OUT FROM THE PIER TO AN ISLET', dur: 5 });
  gp.chests.push({ x: I.x, y: h(I.x, I.z), z: I.z, yaw: Math.PI / 2, gems: [10, 5], secret: 'pond' });
  put('bush', I.x - 2.6, I.z - 0.6, { flowers: true }, 1.5);
  put('crystal_cluster', I.x + 2.2, I.z - 1.6, { color: 'cyan', count: 4 }, 2);
  ctx.gemArc([[td.x - 3, 2.0, I.z + 4], [I.x + 4, 3.6, I.z + 4], [I.x, I.top + 1.8, I.z]], 6, 1);
  // a waterfall pours into the lake from the north bank
  const wfx = K.x - 24, wfz = K.z - K.rz * 0.98 - 0.5;
  put('waterfall', wfx, wfz, { rot: 0, h: 9, w: 7, y: WATER_LEVEL }, 8);
  gp.soundSources.push({ name: 'waterfall', x: wfx, y: 4, z: wfz + 2, range: 60, vol: 1.7 });
  ctx.scatter('rock_cluster', 5, band(ctx, 'shore', 0.4, 1.0), { r: 3.5, path: 3 });
  ctx.scatter('tree_round', 12, band(ctx, 'shore', 0.6, 1.2), { r: 4.5, path: 4, maxSlope: 0.4, lake: 1.4 }, () => ({ canopy: rng.pick(['leaves_green', 'leaves_teal']), size: rng.pick(['m', 'l']) }));
  ctx.scatter('flower_patch', 14, band(ctx, 'shore', 0.4, 1.0), { r: 3, path: 3, lake: 1.3 }, () => ({ r: 4, count: 12 }));
  for (const [x, z, n] of [[88, 100, 3], [150, 88, 2], [170, 60, 2]]) ctx.addBunnies(x, z, n, 7);
  for (const [x, z, g] of [[100, 94, [1, 1, 2]], [150, 90, [2, 5]], [172, 66, [1, 1, 1]]]) ctx.addVase(x, z, g);
}

// ---- the Ember Canyon and its forge ----------------------------------------------------------------------------------------------------
function layoutCanyon(ctx) {
  const { gp, put, rng } = ctx;
  const road = roadOf(ctx, 'canyon');
  // the smithy on the court's east side (placed first: the scatter below keeps clear of it): its back to the cliff, its furnace mouth looking west across the court
  const fs = flatSpot(ctx, 162.5, -141, 14, { maxR: 3, slope: 0.3, path: 3 });
  if (fs) {
    put('forge', fs[0], fs[1], { rot: -Math.PI / 2 }, 8);
    put('barrel_cluster', fs[0] - 0.8, fs[1] - 8.2, { rot: 0.4 }, 2.2);
    put('crate_stack', fs[0] - 2.4, fs[1] + 8.6, { rot: -0.3 }, 2.6);
  }
  // braziers every 24 m along the canyon road, alternating sides; a rock arch across the way every so often
  for (const q of roadAlong(road, 24, 14)) {
    const side = Math.floor(q.s / 24) % 2 ? 1 : -1;
    const x = q.x - q.dz * side * (road.width / 2 + 1.6), z = q.z + q.dx * side * (road.width / 2 + 1.6);
    if (ctx.ok(x, z, { r: 0.8, path: 0.6, maxSlope: 0.5 })) put('torch_stand', x, z, { rot: 0 }, 1.5);
  }
  for (const s of [60, 120, 190]) {
    const q = roadAlong(road, 1, s, s + 1)[0];
    if (q) put('rock_arch', q.x, q.z, { rot: q.yaw, w: 10, h: 7.5, warm: true }, 6);
  }
  const cb = (a, b, lo = 0, hi = 1) => band(ctx, 'canyon', a, b, lo, hi);
  ctx.scatter('rock_cluster', 16, cb(0.5, 1.0), { r: 3.5, path: 3, maxSlope: 0.5 }, () => ({ warm: true, count: 3 }));
  ctx.scatter('boulder_big', 8, cb(0.6, 1.0), { r: 4.5, path: 3, maxSlope: 0.5 });
  ctx.scatter('cliff_outcrop', 4, cb(0.8, 1.2), { r: 6, path: 3, maxSlope: 0.5 }, () => ({ warm: true, len: 12, h: 7 }));
  ctx.scatter('crate_stack', 4, cb(0.3, 0.9, 0.2, 0.9), { r: 2.6, path: 2.5 });
  ctx.scatter('barrel_cluster', 4, cb(0.3, 0.9, 0.2, 0.9), { r: 2.6, path: 2.5 });
  gp.hints.push({ x: 166, z: 30, r: 12, text: 'THE EMBER CANYON WINDS NORTH. FOLLOW THE BRAZIERS TO THE FORGE', dur: 6 });
  // the forge's court at the canyon's head: the door in its north wall, braziers, spires and banners round it
  const em = DOORS.find((d) => d.id === 'emberfall');
  for (const side of [-1, 1]) {
    put('torch_stand', ...inFront(em, 7.5, side * 6.4), { rot: em.yaw }, 1.5);
    put('torch_stand', ...inFront(em, 13, side * 9.5), { rot: em.yaw }, 1.5);
    put('banner_pole', ...inFront(em, 9, side * 10.5), { rot: em.yaw + side * Math.PI / 2 }, 1);
    put('rock_spire', ...inFront(em, 4, side * 17), { rot: rng.float(0, TAU), h: 12 }, 4);
  }
  put('crystal_spire', ...inFront(em, 22, -8), { color: 'violet', h: 6 }, 3);
  for (const [x, z, g] of [[162, 14, [1, 1, 2]], [148, -34, [2, 5]], [124, -84, [1, 1, 1]], [140, -120, [2, 2]]]) ctx.addVase(x, z, g);
  ctx.addBunnies(160, 22, 2, 5);
}

// ---- the Ascent and the Guardian's gate --------------------------------------------------------------------------------------------------
function layoutAscent(ctx) {
  const { L, gp, put, h } = ctx;
  const G = L.guard;
  lampsAlong(ctx, 'ascent', 22, 8);
  const gx = G.x, gz = G.z + 6;
  put('gate_pillars', gx, gz, { rot: 0 }, 8);
  const gate = ctx.anchor('gate_pillars', 'barrier', gx, gz, { rot: 0 });
  gp.barrier = { x: gate ? gate[0] : gx, y: gate ? gate[1] - 5.75 : h(gx, gz), z: gate ? gate[2] : gz, yaw: 0 };       // sealed for good: nothing opens it (yet)
  gp.soundSources.push({ name: 'portal_hum', x: gp.barrier.x, y: gp.barrier.y + 4, z: gp.barrier.z, range: 40, vol: 1.2, when: 'barrier' });
  gp.hints.push({ x: gx, z: gz + 12, r: 11, text: 'THE GUARDIAN\'S GATE IS SEALED. IT WILL OPEN WHEN THE LANTERNS OF EVERY REALM BURN', dur: 7 });
  for (const side of [-1, 1]) {
    put('torch_stand', gx + side * 7.5, gz + 11, {}, 1.5);
    put('rock_cluster', gx + side * 13, gz + 6, { rot: side, count: 3 }, 6);
    put('crystal_cluster', gx + side * 9.5, gz + 13, { color: 'violet', count: 5 }, 2.4);
    put('banner_pole', gx + side * 11, gz + 20, { rot: side > 0 ? Math.PI / 2 : -Math.PI / 2 }, 1);
  }
  ctx.addVase(gx - 8, gz + 16, [2, 5]); ctx.addVase(gx + 8, gz + 16, [2, 5]);
  ctx.scatter('rock_cluster', 8, band(ctx, 'ascent', 0.7, 1.2), { r: 3.5, path: 3, maxSlope: 0.5 });
  ctx.scatter('boulder_big', 4, band(ctx, 'ascent', 0.8, 1.3), { r: 4.5, path: 3, maxSlope: 0.55 });
  ctx.scatter('crystal_cluster', 5, band(ctx, 'ascent', 0.6, 1.1), { r: 2.4, path: 3 }, () => ({ color: ctx.rng.pick(['violet', 'cyan']), count: 5 }));
  ctx.scatter('tree_pine', 8, band(ctx, 'ascent', 0.6, 1.1), { r: 3.5, path: 4, maxSlope: 0.5 }, () => ({ size: ctx.rng.pick(['s', 'm', 'l']) }));
}

// ---- trees, flowers, rocks ----------------------------------------------------------------------------------------------------------
function scatterHome(ctx) {
  const { put, rng } = ctx;
  // the elder tree, ancient and enormous, at the Cove's east end
  const s = flatSpot(ctx, 52, 134, 16, { maxR: 10, slope: 0.3 });
  if (s) put('tree_giant', s[0], s[1], {}, 12);
  const treeAt = (id, n, f0, f1, lo = 0, hi = 1) => ctx.scatter('tree_round', n, band(ctx, id, f0, f1, lo, hi), { r: 4.5, path: 4, maxSlope: 0.4 }, () => ({ canopy: rng.pick(['leaves_green', 'leaves_green', 'leaves_teal']), size: rng.pick(['m', 'l']) }));
  treeAt('cove', 14, 0.5, 1.0); treeAt('trunk', 26, 0.55, 1.1); treeAt('lakeroad', 8, 0.5, 1.1); treeAt('forecourt', 8, 0.6, 1.1); treeAt('plinth', 14, 0.55, 1.0);
  for (const id of ['cove', 'trunk', 'lakeroad', 'forecourt']) {
    ctx.scatter('tree_birch', 6, band(ctx, id, 0.4, 1.0), { r: 3, path: 3.5 });
    ctx.scatter('tree_pine', 8, band(ctx, id, 0.8, 1.2), { r: 3.5, path: 4, maxSlope: 0.5, minH: 1 }, () => ({ size: rng.pick(['s', 'm', 'l']) }));
    ctx.scatter('bush', 12, band(ctx, id, 0.2, 1.0), { r: 1.6, path: 2.6 }, () => ({ flowers: rng.chance(0.6) }));
    ctx.scatter('flower_patch', 22, band(ctx, id, 0.15, 1.0), { r: 3, path: 3 }, () => ({ r: 4, count: 12 }));
    ctx.scatter('tuft_patch', 10, band(ctx, id, 0.2, 1.0), { r: 2.5, path: 2.5 }, () => ({ r: 3, count: 10 }));
  }
  ctx.scatter('fern_patch', 10, band(ctx, 'trunk', 0.5, 1.0), { r: 2.5, path: 3 }, () => ({ r: 3, count: 8 }));
}

/** The hub's treasure: a tidy number (a multiple of 50). Everything hand-placed counts; the rest is topped up with gems along the roads. */
function finalizeHomeGems(ctx) {
  const { gp, h, rng } = ctx;
  for (const [x, y, z] of gp.purple || []) gp.gems.push({ x, y, z, value: 25 });
  // nothing to collect hangs inside a prop (a crystal's collider is wide) or in the rock: what the hand put there is weeded out, what the top-up adds is checked
  const col = new Collision(ctx.grid, ctx.kit.colliders, ctx.world.massifs || []);
  const clear = (g) => !col.blocking(g.x, g.y, g.z, 0.1);
  gp.gems.splice(0, gp.gems.length, ...gp.gems.filter(clear));
  gp.vases.splice(0, gp.vases.length, ...gp.vases.filter((v) => !col.blocking(v.x, v.y + 0.5, v.z, 0)));
  // the roads: the classic trail of gems that leads the way
  ctx.roadGems('main', 0.02, 1.0, 10, [1, 1, 2], 2.2);
  ctx.roadGems('west', 0.04, 1.0, 10, [1, 1, 2], 0);
  ctx.roadGems('lake', 0.05, 1.0, 10, [1, 1, 1, 2], 0);
  ctx.roadGems('canyon', 0.04, 1.0, 10, [1, 1, 2], 0);
  ctx.roadGems('crageast', 0.04, 1.0, 10, [1, 1, 2], 0);
  ctx.roadGems('ascent', 0.04, 1.0, 10, [1, 2, 1], 0);
  ctx.roadGems('garden', 0.1, 0.9, 8, [1, 1], 0);
  ctx.roadGems('ledgeway', 0.1, 1.0, 9, [1, 1, 2], 0);
  let dyn = 0;
  for (const v of gp.vases) dyn += sum(v.gems);
  for (const c of gp.chests) dyn += sum(c.gems);
  for (const w of gp.walls) dyn += sum(w.gems);
  const fixed = dyn + sum(gp.gems.map((g) => g.value));
  const target = Math.max(300, Math.ceil(fixed / 50) * 50);
  let need = target - fixed, guard = 0;
  const roads = ctx.grid.paths;
  while (need > 0 && guard++ < 4000) {
    const p = roads[rng.int(0, roads.length)], q = p.pts[rng.int(0, p.pts.length)];
    const x = q[0] + rng.float(-4, 4), z = q[2] + rng.float(-4, 4);
    if (h(x, z) < WATER_LEVEL + 0.6 || ctx.slope(x, z) > 0.4) continue;
    const v = need >= 2 && rng.chance(0.3) ? 2 : 1;
    const g = { x, y: h(x, z) + 0.95, z, value: v };
    if (!clear(g)) continue;
    gp.gems.push(g);
    need -= v;
  }
  gp.gemsTotal = sum(gp.gems.map((g) => g.value)) + dyn;
  gp.gemBreakdown = { dynamic: dyn, static: sum(gp.gems.map((g) => g.value)), fixed, topUp: target - fixed };
}
