// The hand-authored part of Dawnhaven: the plaza, the five doors, the town round it, the Guardian's gate, the pond, the windmill, the hidden garden. Positions come from home/level.js;
// everything here is expressed in world coordinates and validated against the terrain by ctx.h() / ctx.slope() (like levelgen/layout.js, which does the same for Gloaming Vale).
//
// Called twice by buildWorld (a dry pass, then a wet one) like the realm's populate: it must be deterministic. The gameplay data it fills in (`world.gameplay`, kept from the dry pass):
//   portals   the doors (and, in the realm, the ring above the Great Beacon): see systems/portals.js        arrivals   where the hero stands when he comes through a realm's door: by realm id
//   npcs / hints / chests / walls / vases / gems / bunnies / soundSources   as in the realm
import { makeCtx } from '../levelgen/helpers.js';
import { attachGameplay } from '../levelgen/gameplay.js';
import { lilyLayout } from '../props/nature/ground.js';
import { WATER_LEVEL } from '../level.js';
import { DOORS, DOOR_R, polar, inFront } from './level.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const STAGED = ['gems', 'vases', 'chests', 'walls', 'enemies', 'bunnies', 'npcs', 'hints', 'portals'];
const sum = (a) => a.reduce((s, v) => s + v, 0);

export function populateHome(kit, world) {
  const ctx = makeCtx(kit, world, 4417);
  attachGameplay(ctx);
  ctx.gp.portals = [];
  ctx.gp.arrivals = {};
  const L = ctx.L;
  const stage = (name, fn) => {
    const marks = STAGED.map((k) => ctx.gp[k].length);
    ctx.stage = name;
    fn(ctx);
    STAGED.forEach((k, i) => { for (let j = marks[i]; j < ctx.gp[k].length; j++) { const r = ctx.gp[k][j]; if (r && typeof r === 'object' && !r.src) r.src = name; } });
    ctx.stage = 'populate';
  };

  stage('layoutDoors', layoutDoors);
  stage('layoutPlaza', layoutPlaza);
  stage('layoutTown', layoutTown);
  stage('layoutGate', layoutGate);
  stage('layoutPond', layoutPond);
  stage('layoutMill', layoutMill);
  stage('layoutGarden', layoutGarden);
  stage('scatterHome', scatterHome);
  stage('finalizeHomeGems', finalizeHomeGems);

  const sp = L.spawn;
  ctx.gp.spawn = { x: sp.x, y: ctx.h(sp.x, sp.z), z: sp.z, yaw: sp.yaw };
  ctx.gp.counts = ctx.counts;
  if (kit.pass === 'dry') world.gameplay = ctx.gp;
  return ctx;
}

/** the face of something at (x, z) towards (tx, tz) as a prop's rot (its local +z looks at the target) */
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

/** A level, dry spot for something `foot` metres across, near (x, z): spirals outwards until it fits clear of roads, water, steep ground and other props. */
function flatSpot(ctx, x, z, foot, { maxR = 10, slope = 0.22, path = 3 } = {}) {
  for (let d = 0; d <= maxR; d += 1.5) {
    const n = d === 0 ? 1 : Math.ceil(d * 1.6);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + d;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (ctx.ok(px, pz, { r: foot * 0.55, maxSlope: slope, path })) return [px, pz];
    }
  }
  return null;
}

// ---- the doors ---------------------------------------------------------------------------------------------------------------
function layoutDoors(ctx) {
  const { gp, put, h } = ctx;
  for (const d of DOORS) {
    const sealed = !d.target;
    const gy = h(d.x, d.z);
    put('realm_door', d.x, d.z, { rot: d.yaw, color: d.color, sealed }, 12);
    gp.portals.push({
      id: d.id, name: d.name, tag: d.tag, kind: 'door', shape: 'arch', x: d.x, y: gy, z: d.z, yaw: d.yaw, r: 2.6, hs: 3.1, cy: 3.4,
      color: d.color, target: d.target, state: sealed ? 'sealed' : 'open',
      blurb: `${d.name}: ${d.tag}. THE PORTAL SLEEPS - A REALM FOR ANOTHER DAY.`,
    });
    if (d.target) {
      gp.arrivals[d.target] = { x: inFront(d, 11)[0], z: inFront(d, 11)[1], yaw: d.yaw };
      gp.soundSources.push({ name: 'portal_hum', x: d.x, y: gy + 3.4, z: d.z, range: 44, vol: 1.3, when: `portal:${d.id}` });
    }
    // torches at the corners of the dais, a bush or two beside the steps
    for (const side of [-1, 1]) put('torch_stand', ...inFront(d, 6.6, side * 5.0), { rot: d.yaw }, 1.5);
    for (const side of [-1, 1]) put('flower_patch', ...inFront(d, 9, side * 6.5), { r: 2.4, count: 8 }, 2);
  }
}

// ---- the plaza -------------------------------------------------------------------------------------------------------------------
function layoutPlaza(ctx) {
  const { gp, put, h, rng } = ctx;
  put('fountain', 0, 0, {}, 6);
  // the angles of the roads that leave the plaza: five doors and the road north
  const roads = [...DOORS.map((d) => d.deg), 270];
  // lamp posts either side of every road, banner poles and bunting across it
  for (const deg of roads) {
    for (const side of [-1, 1]) {
      const [lx, lz] = polar(deg + side * 15, 21.5);
      put('lamp_post', lx, lz, { rot: faceTo(lx, lz, 0, 0) }, 1.2);
      const [bx, bz] = polar(deg + side * 7, 24.5);
      put('banner_pole', bx, bz, { rot: faceTo(bx, bz, 0, 0) }, 1);
    }
    const [ax, az] = polar(deg - 7, 24.5), [bx, bz] = polar(deg + 7, 24.5);
    put('bunting', 0, 0, { ax, az, bx, bz, h: 5.0 });
  }
  // benches round the fountain, facing it
  for (const deg of [54, 126, 198, 252, 288, 342]) {
    const [x, z] = polar(deg, 10.5);
    put('bench', x, z, { rot: faceTo(x, z, 0, 0) }, 1.6);
  }
  // a signpost at the plaza's south entrance, its boards pointing at the doors
  put('signpost', 3.6, 14.5, { rot: 0.2, boards: DOORS.map((d, i) => ({ yaw: -d.deg * DEG, y: 1.9 + i * 0.42, len: 1.7 })) }, 1.5);
  // the market, in the south-western quarter
  [[110, 0], [126, 1], [142, 2]].forEach(([deg, v]) => { const [x, z] = polar(deg, 21.5); put('market_stall', x, z, { rot: faceTo(x, z, 0, 0), variant: v }, 4); });
  for (const [deg, r, rot] of [[117, 25.5, 0.3], [134, 26, 2.1], [150, 24, 1.1]]) { const [x, z] = polar(deg, r); put(rot > 2 ? 'crate_stack' : 'barrel_cluster', x, z, { rot }, 2.2); }
  { const [x, z] = polar(148, 28); put('cart', x, z, { rot: faceTo(x, z, 0, 0) + 1.2 }, 3); }
  // the Elder, who looks after Dawnhaven, stands by the fountain, facing the way the hero comes in
  gp.npcs.push({ id: 'elder', name: 'ELDER WICK', model: 'elder', script: 'home_elder', x: 4.6, z: 7.4, yaw: faceTo(4.6, 7.4, 0, 60) });
  gp.hints.push({ x: 0, z: DOOR_R - 14, r: 11, text: 'WELCOME TO DAWNHAVEN! EVERY DOOR ON THE PLAZA OPENS ONTO A REALM', dur: 6 });
  gp.soundSources.push({ name: 'waterfall', x: 0, y: 1.6, z: 0, range: 20, vol: 0.5 });
  for (const [x, z, g] of [[-11, 8, [1, 1, 2]], [12, -9, [1, 2]], [-8, -12, [1, 1]], [14, 12, [2, 2]], [0, 17, [1, 1, 1]], [-17, -2, [1, 2]]]) ctx.addVase(x, z, g);
  ctx.addBunnies(-14, 2, 2, 5);
  void h; void rng;
}

// ---- the town: cottages round the plaza ----------------------------------------------------------------------------------------------
function layoutTown(ctx) {
  const { put, rng } = ctx;
  // [angle, radius, prop, variant]: in the gaps between the roads, doors turned to the plaza
  const homes = [
    [40, 40, 'house_cottage', 0], [66, 45, 'house_cottage', 2],           // south-east, either side of the garden's road
    [112, 41, 'house_cottage', 1], [138, 44, 'house_round'],
    [184, 40, 'house_long'], [210, 38, 'house_cottage', 3],
    [253, 38, 'house_round'], [288, 38, 'house_round'],
    [330, 40, 'house_cottage', 1], [354, 44, 'house_cottage', 0],
  ];
  for (const [deg, r, name, variant] of homes) {
    const [x0, z0] = polar(deg, r), foot = name === 'house_long' ? 16 : name === 'house_round' ? 9 : 10;
    const spot = flatSpot(ctx, x0, z0, foot, { maxR: 7, path: foot * 0.62 });
    if (!spot) continue;
    const params = { rot: faceTo(spot[0], spot[1], 0, 0) };
    if (variant !== undefined) params.variant = variant;
    put(name, spot[0], spot[1], params, foot * 0.55);
  }
  // wells, haystacks, a scarecrow and gardens at the edge of the town
  for (const [deg, r, name, o] of [[100, 34, 'well', {}], [222, 33, 'haystack', {}], [301, 33, 'scarecrow', {}], [346, 30, 'garden_plot', {}], [78, 33, 'garden_plot', {}], [176, 32, 'haystack', {}]]) {
    const [x, z] = polar(deg, r);
    const s = flatSpot(ctx, x, z, 4, { maxR: 6 });
    if (s) put(name, s[0], s[1], { rot: faceTo(s[0], s[1], 0, 0), ...o }, 2.4);
  }
  for (let i = 0; i < 8; i++) {
    const a = rng.float(0, 360), [x, z] = polar(a, rng.float(29, 36));
    if (ctx.ok(x, z, { r: 1.6, path: 3.5 })) put(i % 2 ? 'flower_patch' : 'bush', x, z, { rot: a, r: 3, count: 10, flowers: true }, 1.6);
  }
}

// ---- the Guardian's gate ------------------------------------------------------------------------------------------------------------
function layoutGate(ctx) {
  const { L, gp, put, h } = ctx;
  const gx = L.guard.x, gz = L.guard.z + 4;
  put('gate_pillars', gx, gz, { rot: 0 }, 8);
  const gate = ctx.anchor('gate_pillars', 'barrier', gx, gz, { rot: 0 });
  gp.barrier = { x: gate ? gate[0] : gx, y: gate ? gate[1] - 5.75 : h(gx, gz), z: gate ? gate[2] : gz, yaw: 0 };       // sealed for good: nothing opens it (yet)
  gp.soundSources.push({ name: 'portal_hum', x: gp.barrier.x, y: gp.barrier.y + 4, z: gp.barrier.z, range: 40, vol: 1.2, when: 'barrier' });
  gp.hints.push({ x: gx, z: gz + 12, r: 11, text: 'THE GUARDIAN\'S GATE IS SEALED. IT WILL OPEN WHEN THE LANTERNS OF EVERY REALM BURN', dur: 7 });
  // rune posts and torches along the court in front, rocks at the foot of the buttresses
  for (const side of [-1, 1]) {
    put('torch_stand', gx + side * 7.5, gz + 11, {}, 1.5);
    put('lamp_post', gx + side * 5.5, gz + 20, { rot: 0 }, 1.2);
    put('lamp_post', gx + side * 5.5, gz + 36, { rot: 0 }, 1.2);
    put('rock_cluster', gx + side * 13, gz + 6, { rot: side, count: 3 }, 6);
    put('crystal_cluster', gx + side * 9.5, gz + 13, { color: 'violet', count: 5 }, 2.4);
  }
  // the road north keeps the lamps of the realm's roads
  const road = ctx.grid.paths.find((p) => p.id === 'north');
  for (let i = 8; i < road.pts.length; i += 12) {
    const p = road.pts[i];
    for (const side of [-1, 1]) put('lamp_post', p[0] + side * (road.width / 2 + 1.2), p[2], { rot: 0 }, 1.2);
  }
  ctx.addVase(gx - 8, gz + 16, [2, 5]); ctx.addVase(gx + 8, gz + 16, [2, 5]);
}

// ---- the pond and its waterfall ---------------------------------------------------------------------------------------------
function layoutPond(ctx) {
  const { L, gp, put, rng, h } = ctx;
  const K = L.lake, I = L.islet;
  // the waterfall pours into the pond from the cliff on its north side
  const wz = K.z - K.rz * 1.1;
  put('waterfall', K.x, wz, { rot: 0, h: 15, w: 8, y: WATER_LEVEL }, 8);
  gp.soundSources.push({ name: 'waterfall', x: K.x, y: 6, z: wz + 2, range: 60, vol: 1.7 });
  put('crystal_cluster', K.x + 16, wz + 3, { color: 'cyan', count: 4 }, 2);
  // reeds round the shore, lily pads on the water
  let placed = 0;
  for (let t = 0; t < 300 && placed < 22; t++) {
    const a = rng.float(0, TAU), d = rng.float(0.94, 1.03);
    const x = K.x + Math.cos(a) * K.rx * d, z = K.z + Math.sin(a) * K.rz * d;
    if (ctx.pathDist(x, z) < 3 || !ctx.occ.free(x, z, 1.6) || Math.hypot(x - K.x, z - (K.z + K.rz)) < 7) continue;
    if (put('reeds', x, z, { rot: rng.float(0, TAU), r: 2.6, count: 9 }, 1.6)) placed++;
  }
  const floats = (x, z, R) => [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]].every(([ox, oz]) => h(x + ox, z + oz) < WATER_LEVEL - 0.35);
  const taken = [[I.x, I.z, I.r + 2]];
  placed = 0;
  for (let t = 0; t < 200 && placed < 5; t++) {
    const a = rng.float(0, TAU), d = rng.float(0.5, 0.86);
    const x = K.x + Math.cos(a) * K.rx * d, z = K.z + Math.sin(a) * K.rz * d;
    if (Math.abs(x - K.x) < 5.5 && z > K.z) continue;                // (the stepping stones' lane is kept clear)
    if (!ctx.occ.free(x, z, 2)) continue;
    const pads = lilyLayout(ctx.kit.rng(x, z, 104), 4, 5.5, { ok: (px, pz, R) => floats(x + px, z + pz, R) && taken.every(([tx, tz, tr]) => Math.hypot(x + px - tx, z + pz - tz) > R + tr + 1.2) });
    for (const [px, pz, sz] of pads) taken.push([x + px, z + pz, sz * 2]);
    if (put('lilypads', x, z, { pads, y: WATER_LEVEL + 0.16, span: 12 }, 2)) placed++;
  }
  // the secret: stepping stones from the south shore lead to the islet, where a chest waits under a little tree
  const shoreZ = K.z + K.rz * 0.98;
  const stones = [[K.x, shoreZ - 3.4], [K.x + 0.6, shoreZ - 7.8], [K.x - 0.4, shoreZ - 11.6]];
  for (const [x, z] of stones) put('stepping_stone', x, z, { top: 1.9, h: WATER_LEVEL + 0.45 - h(x, z), span: 5 }, 2.6);
  gp.hints.push({ x: K.x, z: shoreZ + 4, r: 8, text: 'STEPPING STONES LEAD OUT TO AN ISLET IN THE POND', dur: 5 });
  gp.chests.push({ x: I.x, y: h(I.x, I.z), z: I.z, yaw: Math.PI, gems: [10, 5], secret: 'pond' });
  put('bush', I.x - 2.6, I.z - 0.6, { flowers: true }, 1.5);
  put('crystal_cluster', I.x + 2.2, I.z - 1.6, { color: 'cyan', count: 4 }, 2);
  // some of the shore is dressed as a landing: a bench and a boat
  put('boat', K.x + 9, K.z + K.rz * 0.96, { rot: 0.5 }, 3);
  const [bx, bz] = flatSpot(ctx, K.x - 12, K.z + K.rz + 5, 3, { maxR: 5 }) || [K.x - 12, K.z + K.rz + 5];
  put('bench', bx, bz, { rot: faceTo(bx, bz, K.x, K.z) }, 1.6);
  ctx.gemArc([[K.x, 2.2, shoreZ - 1], [K.x, 3.6, (shoreZ + I.z) / 2], [I.x, I.top + 1.8, I.z + 2.6]], 7, 1);
}

// ---- the windmill ------------------------------------------------------------------------------------------------------------------
function layoutMill(ctx) {
  const { L, gp, put, h, rng } = ctx;
  const W = L.windHill;
  const yaw = ctx.face(W.x, W.z, 0, 0);
  put('windmill_body', W.x, W.z, { rot: yaw }, 8);
  const sails = ctx.anchor('windmill_body', 'sails', W.x, W.z, { rot: yaw });
  const lookout = ctx.anchor('windmill_body', 'beacon', W.x, W.z, { rot: yaw });
  if (sails) { gp.sails = { x: sails[0], y: sails[1], z: sails[2], yaw }; gp.soundSources.push({ name: 'windmill', x: sails[0], y: sails[1], z: sails[2], range: 40, vol: 1.6 }); }
  // the lookout: the stone pad on the balcony where the realm's beacon stands has a chest here
  if (lookout) gp.chests.push({ x: lookout[0], y: lookout[1], z: lookout[2], yaw: yaw + Math.PI, gems: [10, 5, 5], secret: 'mill' });
  gp.purple = gp.purple || [];
  if (lookout) gp.purple.push([lookout[0] + Math.cos(yaw) * 2.4, lookout[1] + 1.3, lookout[2] - Math.sin(yaw) * 2.4]);       // (along the balcony's ring, beside the chest)
  gp.hints.push({ x: W.x - 30, z: W.z + 10, r: 14, text: 'THE WINDMILL\'S STAIR CLIMBS TO A LOOKOUT', dur: 5 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU, d = W.r * 0.8, x = W.x + Math.cos(a) * d + rng.float(-4, 4), z = W.z + Math.sin(a) * d + rng.float(-4, 4), size = rng.pick(['m', 'l']);
    if (ctx.ok(x, z, { r: 3, path: 3.8 })) put('tree_pine', x, z, { size }, 3.5);
  }
  ctx.scatter('boulder_big', 3, ctx.inRing(W.x, W.z, 24, 38), { r: 4, path: 3 });
  ctx.scatter('flower_patch', 8, ctx.inRing(W.x, W.z, 12, 36), { r: 3, path: 3 }, () => ({ r: 4, count: 12 }));
  ctx.roadGems('mill', 0.08, 0.98, 9, [1, 1, 2], 0);
  ctx.addVase(W.x - 8, W.z + 6, [2, 2]); ctx.addVase(W.x + 8, W.z - 7, [5]);
  ctx.addBunnies(W.x - 22, W.z + 8, 2, 5);
  void h;
}

// ---- the hidden garden -------------------------------------------------------------------------------------------------------------
function layoutGarden(ctx) {
  const { L, gp, put, h } = ctx;
  const K = L.garden, ux = Math.cos(K.open), uz = Math.sin(K.open);      // the way out, towards the plaza
  const at = (along, side = 0) => [K.x + ux * along - uz * side, K.z + uz * along + ux * side];
  // the cracked wall closes the strip through the ring of rock; the gap is 6 m wide
  const [wx, wz] = at(K.r + 7.5);
  const yaw = Math.atan2(ux, uz);
  ctx.addWall(wx, wz, yaw, 6.1, 5.4, [25]);
  gp.hints.push({ x: at(K.r + 17)[0], z: at(K.r + 17)[1], r: 9, text: 'THAT WALL LOOKS CRACKED... TRY CHARGING IT', dur: 6 });
  // inside: a chest at the back, flowers, a bench, two birches and a crystal
  const [cx, cz] = at(-4.6);
  gp.chests.push({ x: cx, y: h(cx, cz), z: cz, yaw: yaw, gems: [10, 10], secret: 'garden' });
  for (const [a, s, r] of [[1.5, -5, 3], [-2, 5.2, 3], [5, 4, 2.4], [4.5, -5.5, 2.4]]) put('flower_patch', ...at(a, s), { r, count: 12 }, r);
  put('bench', ...at(2.2, -6), { rot: yaw + Math.PI / 2 }, 1.6);
  put('tree_birch', ...at(-3, 6.2), {}, 3); put('tree_birch', ...at(-6.3, -3.4), {}, 3);
  put('crystal_cluster', ...at(-5.8, 3), { color: 'violet', count: 5 }, 2.4);
  gp.purple = gp.purple || [];
  gp.purple.push([...at(0, 0).slice(0, 1), h(...at(0, 0)) + 1.3, at(0, 0)[1]]);
}

// ---- trees, flowers, rocks ----------------------------------------------------------------------------------------------------------
function scatterHome(ctx) {
  const { L, put } = ctx;
  // the elder tree, ancient and enormous, south-west of the plaza
  const [tx, tz] = polar(138, 58);
  const s = flatSpot(ctx, tx, tz, 16, { maxR: 8, slope: 0.3 });
  if (s) put('tree_giant', s[0], s[1], {}, 12);
  // lantern trees ring the plaza's lawn
  for (const deg of [30, 60, 120, 152, 205, 258, 300, 330]) {
    const [x, z] = polar(deg + 6, 31);
    if (ctx.ok(x, z, { r: 4, path: 4 })) put('tree_lantern', x, z, { canopy: 'leaves_teal', size: 'm' }, 4.5);
  }
  const band = (a, b) => ctx.inBand(a, b);
  ctx.scatter('tree_round', 30, band(0.42, 0.86), { r: 4.5, path: 4, maxSlope: 0.4 }, () => ({ canopy: ctx.rng.pick(['leaves_green', 'leaves_green', 'leaves_teal']), size: ctx.rng.pick(['m', 'l']) }));
  ctx.scatter('tree_birch', 14, band(0.3, 0.8), { r: 3, path: 3.5 });
  ctx.scatter('tree_pine', 22, band(0.8, 0.98), { r: 3.5, path: 4, maxSlope: 0.5, minH: 1 }, () => ({ size: ctx.rng.pick(['s', 'm', 'l']) }));
  ctx.scatter('bush', 26, band(0.2, 0.9), { r: 1.6, path: 2.6 }, () => ({ flowers: ctx.rng.chance(0.6) }));
  ctx.scatter('flower_patch', 46, band(0.15, 0.9), { r: 3, path: 3 }, () => ({ r: 4, count: 12 }));
  ctx.scatter('tuft_patch', 22, band(0.2, 0.92), { r: 2.5, path: 2.5 }, () => ({ r: 3, count: 10 }));
  ctx.scatter('fern_patch', 12, band(0.5, 0.92), { r: 2.5, path: 3 }, () => ({ r: 3, count: 8 }));
  ctx.scatter('rock_cluster', 12, band(0.6, 0.96), { r: 3.5, path: 3, maxSlope: 0.5 });
  ctx.scatter('boulder_big', 5, band(0.82, 0.98), { r: 4.5, path: 3, maxSlope: 0.55, minH: 1 });
  for (const [x, z, n] of [[-40, 60, 3], [30, 20, 2], [-34, -34, 3], [48, -44, 2], [70, 50, 2], [-70, 40, 2]]) ctx.addBunnies(x, z, n, 7);
  void L;
}

/** The hub's treasure: small, and a tidy number (a multiple of 50). Everything hand-placed counts; the rest is topped up with gems along the roads. */
function finalizeHomeGems(ctx) {
  const { gp, h, rng } = ctx;
  for (const [x, y, z] of gp.purple || []) gp.gems.push({ x, y, z, value: 25 });
  for (const d of DOORS) ctx.roadGems(`spoke_${d.id}`, 0.1, 0.9, 10, [1, 1, 2], d.id === 'gloaming' ? 2.2 : 0);
  ctx.roadGems('north', 0.05, 1.0, 10, [1, 2, 1], 0);
  let dyn = 0;
  for (const v of gp.vases) dyn += sum(v.gems);
  for (const c of gp.chests) dyn += sum(c.gems);
  for (const w of gp.walls) dyn += sum(w.gems);
  const fixed = dyn + sum(gp.gems.map((g) => g.value));
  const target = Math.max(200, Math.ceil(fixed / 50) * 50);
  let need = target - fixed, guard = 0;
  const roads = ctx.grid.paths;
  while (need > 0 && guard++ < 2000) {
    const p = roads[rng.int(0, roads.length)], q = p.pts[rng.int(0, p.pts.length)];
    const x = q[0] + rng.float(-4, 4), z = q[2] + rng.float(-4, 4);
    if (h(x, z) < WATER_LEVEL + 0.6 || ctx.slope(x, z) > 0.4) continue;
    const v = need >= 2 && rng.chance(0.3) ? 2 : 1;
    gp.gems.push({ x, y: h(x, z) + 0.95, z, value: v });
    need -= v;
  }
  gp.gemsTotal = sum(gp.gems.map((g) => g.value)) + dyn;
  gp.gemBreakdown = { dynamic: dyn, static: sum(gp.gems.map((g) => g.value)), fixed, topUp: target - fixed };
}
