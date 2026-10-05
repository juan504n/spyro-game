// The hand-authored part of Gloaming Vale: every landmark, encounter and secret. Positions come from level.js;
// everything here is expressed in world coordinates and validated against the terrain by ctx.h()/ctx.slope().
import { WATER_LEVEL } from '../level.js';
import { lilyLayout, LILY_R } from '../props/nature/ground.js';

const TAU = Math.PI * 2;

export function layoutVillage(ctx) {
  const { L, gp, put, rng, h, face } = ctx;
  const cx = L.village.x, cz = L.village.z;
  const plaza = [cx, cz - 4];

  // cottages ringed around the plaza, doors facing the middle
  const houses = [[-17, 124, 0], [17, 122, 1], [-25, 139, 2], [25, 139, 3], [-14, 154, 1], [14, 155, 2], [-31, 122, 3], [32, 124, 0]];
  for (const [x, z, v] of houses) put('house_cottage', x, z, { rot: face(x, z, plaza[0], plaza[1]), variant: v }, 7);

  // plaza furniture
  put('well', -9, 140, { rot: 0.4 }, 2.5);
  put('market_stall', 11, 141, { rot: face(11, 141, plaza[0], plaza[1]), variant: 0 }, 3.5);
  put('market_stall', -12, 148, { rot: face(-12, 148, plaza[0], plaza[1]), variant: 1 }, 3.5);
  put('barrel_cluster', 14, 132, { rot: 0.3 }, 2);
  put('barrel_cluster', -14, 133, { rot: 2.1 }, 2);
  put('crate_stack', 8, 150, { rot: 0.7 }, 2);
  put('crate_stack', -21, 133, { rot: 1.4 }, 2);
  put('haystack', 22, 150, { rot: 0.2 }, 3);
  put('cart', -21, 148, { rot: 0.9 }, 3);
  put('scarecrow', 27, 150, { rot: 2.4 }, 1.5);
  put('bench', 6, 137, { rot: Math.PI / 2 }, 1.5);
  put('bench', -6, 133, { rot: -Math.PI / 2 }, 1.5);
  for (const [x, z] of [[-9, 128], [9, 128], [-9, 142], [9, 145]]) put('banner_pole', x, z, { rot: face(x, z, plaza[0], plaza[1]) }, 1);
  put('bunting', 0, 0, { ax: -9, az: 128, bx: 9, bz: 128, h: 5.2 });
  put('bunting', 0, 0, { ax: -9, az: 142, bx: 9, bz: 145, h: 5.2 });

  // welcome arch (the realm portal) behind the spawn point
  put('arch_gate', 0, L.spawn.z + 14, { rot: Math.PI }, 6);

  // lamp posts down the cobbled main road
  const main = ctx.grid.paths.find((p) => p.id === 'main');
  let dist = 0, side = 1, next = 6;
  for (let i = 1; i < main.pts.length; i++) {
    dist += Math.hypot(main.pts[i][0] - main.pts[i - 1][0], main.pts[i][2] - main.pts[i - 1][2]);
    if (dist >= next) {
      next += 13;
      const p = main.pts[i], q = main.pts[Math.min(i + 1, main.pts.length - 1)];
      const dx = q[0] - p[0], dz = q[2] - p[2], l = Math.hypot(dx, dz) || 1;
      const ox = (-dz / l) * (main.width / 2 + 1.1) * side, oz = (dx / l) * (main.width / 2 + 1.1) * side;
      const x = p[0] + ox, z = p[2] + oz;
      if (Math.abs(z - (cz - 4)) > 11) put('lamp_post', x, z, { rot: face(x, z, p[0], p[2]) }, 1);
      side = -side;
    }
  }

  // greenery around the plateau rim
  for (const [x, z] of [[-30, 142], [30, 146], [-22, 162], [22, 163], [-6, 166], [7, 168], [-30, 132], [33, 134]]) {
    put(rng.chance(0.5) ? 'tree_lantern' : 'tree_round', x, z, { rot: rng.float(0, TAU), canopy: rng.pick(['leaves_teal', 'leaves_green']), size: rng.pick(['m', 'l']) }, 4.5);
  }
  for (let i = 0; i < 14; i++) {
    const a = rng.float(0, TAU), d = rng.float(8, 27);
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (ctx.ok(x, z, { r: 1.6, path: 3.2 })) put(i % 3 ? 'flower_patch' : 'bush', x, z, { rot: a, r: 3, count: 10, flowers: true }, 1.6);
  }

  // gameplay: the elder, tutorial nooks, the hearth beacon
  gp.npcs.push({ id: 'elder', name: 'ELDER WICK', model: 'elder', x: -5, z: 136, yaw: Math.PI * 0.75 });
  gp.hints.push({ x: 0, z: 154, r: 7, text: 'PRESS SPACE TO JUMP  -  HOLD IT IN THE AIR TO GLIDE', touch: 'TAP JUMP  -  HOLD IT IN THE AIR TO GLIDE', pad: 'PRESS A TO JUMP  -  HOLD IT IN THE AIR TO GLIDE', dur: 7 });
  gp.hints.push({ x: 0, z: 136, r: 8, text: 'J OR CLICK: BREATHE FIRE   HOLD K OR SHIFT: CHARGE', touch: 'FIRE: BREATHE FIRE   HOLD RAM: CHARGE', pad: 'X: BREATHE FIRE   HOLD B: CHARGE', dur: 7 });
  ctx.addVase(-14, 116, [1, 1, 2]); ctx.addVase(16, 112, [1, 2]); ctx.addVase(26, 128, [2, 2]); ctx.addVase(-28, 146, [1, 1, 1]);
  ctx.addVase(-3, 160, [1, 1]); ctx.addVase(3, 161, [1, 1]);
  ctx.addBunnies(-22, 158, 3, 4); ctx.addBunnies(24, 154, 2, 4);
  ctx.addEnemy(-26, 112, 'basic', 4); ctx.addEnemy(24, 110, 'basic', 4);
  void h; void WATER_LEVEL;
}

export function layoutLake(ctx) {
  const { L, gp, put, rng, h } = ctx;
  const I = L.island;
  // pier + boat on the south shore, then the lily-pad crossing out to the island. The pier is short (8 m) and wide (5.6 m) with its lamp on one edge, so
  // there is a broad clear run-off at its end; the three big round pads (stepping stones with a 3.4 m radius top, twice the old ones) each sit about
  // 3 m of open water from the next (and from the pier's end), so every hop is short. The middle pad is a touch to the east, the last one lines up with
  // the gap in the shrine's ring of monoliths. (They are put down after the shoreline dressing below, for a reason given there.)
  const shoreZ = L.lake.z + L.lake.rz * 0.99;
  const PIER = { x: -4, z: shoreZ + 3, len: 8, width: 5.6 };
  const CROSSING = [[-4.6, 60.2], [-2.6, 50.2], [-4, 40.5]];
  put('pier', PIER.x, PIER.z, { rot: Math.PI, len: PIER.len, width: PIER.width, span: PIER.len }, 4);
  put('boat', -10.5, shoreZ - 2, { rot: 0.6 }, 3);
  // shrine on the island. Its level top is only ~4 m across and the shore falls away steeply under the ring, so everything is
  // placed in polar terms round the beacon (angle 0 = east, 90 = south). The monoliths are turned to leave a gap towards the
  // stepping stones (south) and towards Heron Point (north); the crystals, the tree and the bush sit in the other gaps.
  const isleAt = (deg, d) => [I.x + Math.cos((deg * Math.PI) / 180) * d, I.z + Math.sin((deg * Math.PI) / 180) * d];
  put('standing_stones', I.x, I.z, { r: 8.2, count: 8, rot: 0.38 }, 9);
  put('crystal_cluster', ...isleAt(315, 6.8), { color: 'cyan', count: 5 }, 2);
  put('crystal_cluster', ...isleAt(135, 6.8), { color: 'violet', count: 5 }, 2);
  put('tree_lantern', ...isleAt(225, 6.6), { canopy: 'leaves_teal', size: 's' }, 3);
  put('bush', ...isleAt(0, 6.4), { flowers: true }, 1.5);
  // the chest: on the level shoulder just outside the rune circle, long side along the slope, lock facing outwards. Its base sits
  // on the lowest ground under its 1.7 x 1.0 footprint, so the downhill edge touches the grass and the uphill one is bedded in
  const [chestX, chestZ] = isleAt(45, 4.7), chestYaw = Math.PI / 4;
  const chestGround = Math.min(...[[-0.85, -0.5], [0.85, -0.5], [-0.85, 0.5], [0.85, 0.5]]
    .map(([lx, lz]) => h(chestX + lx * Math.cos(chestYaw) + lz * Math.sin(chestYaw), chestZ - lx * Math.sin(chestYaw) + lz * Math.cos(chestYaw))));
  ctx.addChest(chestX, chestZ, chestYaw, [10, 5], chestGround);
  ctx.addEnemy(...isleAt(145, 4.2), 'basic', 2.2);
  gp.hints.push({ x: -4, z: 70, r: 7, text: 'HOP THE STONES OR GLIDE OFF HERON POINT TO REACH THE ISLE', dur: 6.5 });
  // shoreline dressing: reeds, lily pads, rocks
  let placed = 0;
  for (let t = 0; t < 500 && placed < 34; t++) {
    const a = rng.float(0, TAU);
    const d = rng.float(0.94, 1.03);
    const x = L.lake.x + Math.cos(a) * L.lake.rx * d, z = L.lake.z + Math.sin(a) * L.lake.rz * d;
    if (ctx.pathDist(x, z) < 3.4 || !ctx.occ.free(x, z, 1.6) || Math.hypot(x - PIER.x, z - PIER.z) < 9) continue;
    if (put('reeds', x, z, { rot: rng.float(0, TAU), r: 2.6, count: 9 }, 1.6)) placed++;
  }
  // Lily-pad patches, sixteen of them: where they go is rolled from the level's shared rng exactly as it always was (so nothing after this line moves), then each
  // patch lays out its own big pads with a private rng. Every pad is a walkable platform, so it stays in deep enough water, clear of the pier, the boat,
  // the crossing and every pad already laid, and at least 1.6 m from its neighbours.
  const taken = [[PIER.x, PIER.z - 1.2, 3.6], [PIER.x, PIER.z - 4, 3.6], [PIER.x, PIER.z - 6.8, 3.6], [-10.5, shoreZ - 2, 2.4], ...CROSSING.map(([x, z]) => [x, z, 3.4])];
  const floats = (x, z, R) => [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]].every(([ox, oz]) => h(x + ox, z + oz) < WATER_LEVEL - 0.35);
  placed = 0;
  for (let t = 0; t < 400 && placed < 16; t++) {
    const a = rng.float(0, TAU), d = rng.float(0.5, 0.92);
    const x = L.lake.x + Math.cos(a) * L.lake.rx * d, z = L.lake.z + Math.sin(a) * L.lake.rz * d;
    if (Math.hypot(x - I.x, z - I.z) < I.r + 3 || h(x, z) > WATER_LEVEL - 0.6 || !ctx.occ.free(x, z, 2)) continue;
    const pads = lilyLayout(ctx.kit.rng(x, z, 104), 5, 5.5, {
      ok: (px, pz, R) => floats(x + px, z + pz, R) && taken.every(([tx, tz, tr]) => Math.hypot(x + px - tx, z + pz - tz) > R + tr + 1.6),
    });
    for (const [px, pz, sz] of pads) taken.push([x + px, z + pz, sz * LILY_R]);
    if (put('lilypads', x, z, { pads, y: WATER_LEVEL + 0.16, span: 12 }, 2)) placed++;
  }
  // The crossing itself, last: putting the pads down earlier would stamp the shared occupancy map before the patches above are picked, which changes which candidates are
  // accepted, how many draws that takes, and so every random pick after them (the whole realm's scatter would come out differently).
  for (const [x, z] of CROSSING) put('stepping_stone', x, z, { top: 3.4, h: WATER_LEVEL + 0.45 - h(x, z), span: 7 }, 3.6);
  // heron point headland: rock spires + a lookout tree
  put('rock_spire', L.heron.x + 4, L.heron.z - 3, { rot: 0.4 }, 3);
  put('rock_spire', L.heron.x - 5, L.heron.z + 2, { rot: 1.2, scale: 0.8 }, 3);
  put('tree_pine', L.heron.x, L.heron.z, { size: 'm' }, 3);
  ctx.addVase(L.heron.x + 2, L.heron.z + 4, [5]);
  ctx.gemArc([[L.heron.x, h(L.heron.x, L.heron.z) + 1.4, L.heron.z + 4], [L.heron.x - 10, h(L.heron.x, L.heron.z) + 3.4, L.heron.z + 18], [I.x + 2, I.top + 3.2 + 6, I.z - 10]], 9, 1);
  // the ramp road climbs Heron Point from the north (ringE branches off it): hint at the foot, a chest-high reward on top
  gp.hints.push({ x: 44, z: -26, r: 8, text: 'A TRAIL CLIMBS HERON POINT. GLIDE FROM THE TOP!', dur: 5 });
  ctx.addBunnies(64, 76, 3, 5);
}

export function layoutRiver(ctx) {
  const { L, grid, gp, put, h } = ctx;
  // waterfall at the cascade plateau's south lip, bridge where the east ring road crosses the river
  const river = grid.rivers[0];
  const src = river.pts[0];
  put('waterfall', src[0], src[2] - 3, { rot: 0, h: 26, w: 8, y: src[1] }, 8);
  gp.soundSources.push({ name: 'waterfall', x: src[0], y: src[1] + 6, z: src[2] - 1, range: 64, vol: 1.9 });
  put('crystal_cluster', src[0] + 13, src[2] + 2, { color: 'cyan', count: 4 }, 2);
  // bridge: find first crossing of ringE with the river
  const ring = grid.paths.find((p) => p.id === 'ringE');
  let best = null;
  for (let i = 0; i < ring.pts.length && !best; i++) {
    const q = ring.pts[i];
    if (ctx.riverDist(q[0], q[2]) < 2) best = { i, q };
  }
  if (best) {
    const a = ring.pts[Math.max(best.i - 2, 0)], b = ring.pts[Math.min(best.i + 2, ring.pts.length - 1)];
    const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
    put('bridge_stone', best.q[0], best.q[2], { rot: yaw, len: 18 }, 9);
    gp.hints.push({ x: best.q[0], z: best.q[2], r: 9, text: 'THE OLD BRIDGE CROSSES THE STREAM', dur: 4 });
  }
  void L; void h;
}

export function layoutRuins(ctx) {
  const { L, gp, put, rng, h } = ctx;
  const R = L.ruinsMound;
  put('standing_stones', R.x, R.z, { r: 10, count: 9 }, 11);
  put('ruin_arch', R.x + 1, R.z - 12, { rot: 0 }, 5);
  put('ruin_pillars', R.x - 12, R.z + 6, { count: 4 }, 5);
  put('ruin_pillars', R.x + 13, R.z + 5, { count: 3, rot: 1 }, 5);
  put('crystal_cluster', R.x + 3, R.z + 2, { color: 'violet', count: 6 }, 2.5);
  for (let i = 0; i < 6; i++) put('tree_birch', R.x + rng.float(-22, 22), R.z + rng.float(-6, 22), { rot: rng.float(0, TAU) }, 3);
  ctx.addChest(R.x - 1, R.z + 9, 0.3, [10, 5]);
  ctx.addEnemy(R.x - 8, R.z + 12, 'basic', 5); ctx.addEnemy(R.x + 9, R.z + 10, 'thief', 7);          // (a Pilferling in the ruins: the first thing that runs from him)
  ctx.addVase(R.x - 5, R.z - 4, [1, 2]); ctx.addVase(R.x + 6, R.z - 5, [1, 2]);
  ctx.addBunnies(R.x - 14, R.z + 18, 4, 6);
  // the ram-me-open secret: a cracked wall sealing a garden nook behind the arch
  const wx = R.x + 1, wz = R.z - 19;
  put('boulder_big', wx - 6, wz, { rot: 0.5, scale: 0.9 }, 4);
  put('boulder_big', wx + 6, wz - 0.5, { rot: 2.1, scale: 0.9 }, 4);
  ctx.addWall(wx, wz, 0, 6, 5.2, [25]);
  ctx.addChest(wx, wz - 5, 0, [10, 5]);
  put('flower_patch', wx, wz - 3, { r: 4, count: 14 }, 3);
  gp.hints.push({ x: wx, z: wz + 10, r: 8, text: 'THAT WALL LOOKS CRACKED... TRY CHARGING IT', dur: 6 });
  void h;
}

export function layoutWindmill(ctx) {
  const { L, grid, gp, put, h } = ctx;
  const W = L.windHill;
  const top = h(W.x, W.z);
  const yaw = ctx.face(W.x, W.z, 88, 46);         // door faces the start of the spiral road
  put('windmill_body', W.x, W.z, { rot: yaw }, 8);
  const sails = ctx.anchor('windmill_body', 'sails', W.x, W.z, { rot: yaw });
  const beacon = ctx.anchor('windmill_body', 'beacon', W.x, W.z, { rot: yaw });
  const gate = ctx.anchor('windmill_body', 'gate', W.x, W.z, { rot: yaw });
  if (sails) gp.sails = { x: sails[0], y: sails[1], z: sails[2], yaw };
  if (sails) gp.soundSources.push({ name: 'windmill', x: sails[0], y: sails[1], z: sails[2], range: 40, vol: 1.7 });
  gp.beacons.push({ id: 'mill', name: 'MILL BEACON', x: beacon ? beacon[0] : W.x, y: beacon ? beacon[1] : top + 9, z: beacon ? beacon[2] : W.z, yaw });
  if (gate) gp.portcullis = { x: gate[0], y: gate[1], z: gate[2], yaw: gate[3] };
  // braziers along the spiral road
  const marks = [0.3, 0.58, 0.82];
  marks.forEach((t) => {
    const p = ctx.pathPoint('mill', t);
    const side = 1;
    const x = p.x + (-p.dz) * (p.width / 2 + 2.4) * side, z = p.z + p.dx * (p.width / 2 + 2.4) * side;
    gp.braziers.push({ x, y: h(x, z), z });
    ctx.gemArc([[p.x, p.y + 1.4, p.z], [p.x + p.dx * 6, p.y + 1.4, p.z + p.dz * 6]], 4, 1);
  });
  // guards
  const g1 = ctx.pathPoint('mill', 0.18), g2 = ctx.pathPoint('mill', 0.45), g3 = ctx.pathPoint('mill', 0.7), g4 = ctx.pathPoint('mill', 0.9);
  ctx.addEnemy(g1.x, g1.z, 'basic', 4); ctx.addEnemy(g2.x + 4, g2.z, 'slinger', 4); ctx.addEnemy(g3.x, g3.z, 'bell', 4); ctx.addEnemy(g4.x, g4.z, 'thorn', 3);
  ctx.addEnemy(W.x - 12, W.z + 16, 'bell', 5);
  // dressing
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, d = W.r * 0.85; put('tree_pine', W.x + Math.cos(a) * d + ctx.rng.float(-4, 4), W.z + Math.sin(a) * d + ctx.rng.float(-4, 4), { size: ctx.rng.pick(['m', 'l']) }, 3.5); }
  ctx.scatter('boulder_big', 5, ctx.inRing(W.x, W.z, 26, 44), { r: 4, path: 3 });
  ctx.scatter('flower_patch', 10, ctx.inRing(W.x, W.z, 12, 42), { r: 3, path: 3 }, () => ({ r: 4, count: 12 }));
  ctx.addVase(W.x - 6, W.z + 8, [5]); ctx.addVase(W.x + 8, W.z - 7, [2, 2]);
  ctx.addChest(W.x - 9, W.z - 9, 0.8, [10, 5]);
  gp.hints.push({ x: 84, z: 50, r: 9, text: 'LIGHT THE THREE BRAZIERS TO RAISE THE MILLGATE', dur: 7 });
  void grid;
}

export function layoutSkyIsles(ctx) {
  const { L, gp, put, h } = ctx;
  const M = L.mesa;
  const mtop = h(M.x, M.z);
  // launch pad on the mesa: a bounce mushroom at the rim closest to the first isle
  const i1 = L.isles[0];
  const dir = Math.atan2(i1.z - M.z, i1.x - M.x);
  let rr = 4;
  while (rr < M.r + 8 && h(M.x + Math.cos(dir) * (rr + 1), M.z + Math.sin(dir) * (rr + 1)) > M.h - 0.8) rr += 1;
  rr = Math.max(4, rr - 4);                        // stay well inside the flat top
  const mx = M.x + Math.cos(dir) * rr, mz = M.z + Math.sin(dir) * rr;
  gp.mushrooms.push({ x: mx, y: h(mx, mz), z: mz, size: 1.25 });
  put('tree_pine', M.x + 8, M.z + 8, { size: 'l' }, 3); put('tree_pine', M.x - 9, M.z + 10, { size: 'm' }, 3);
  put('crystal_cluster', M.x - 4, M.z + 4, { color: 'cyan', count: 5 }, 2.5);
  put('rock_spire', M.x + 10, M.z - 6, { rot: 0.6 }, 3);
  ctx.addChest(M.x + 4, M.z + 10, 3.4, [10, 5]);
  gp.hints.push({ x: mx, z: mz, r: 11, text: 'BOUNCE OFF THE MUSHROOM, THEN GLIDE TO THE FLOATING ISLES', dur: 7 });
  // arc of gems guiding the glide from the mesa to isle 1
  ctx.gemArc([[mx, mtop + 12, mz], [(mx + i1.x) / 2, mtop + 10, (mz + i1.z) / 2], [i1.x, i1.y + 3, i1.z]], 8, 1);
  L.isles.forEach((I, k) => {
    const nxt = L.isles[k + 1];
    const isle = { id: I.id, x: I.x, z: I.z, y: I.y, r: I.r, baseY: I.y, amp: k === 3 ? 0 : 0.28, speed: 0.9 + k * 0.13, phase: k * 1.9, pieces: [] };
    gp.islands.push(isle);
    if (nxt) {
      const a = Math.atan2(nxt.z - I.z, nxt.x - I.x);
      const px = I.x + Math.cos(a) * (I.r - 3.6), pz = I.z + Math.sin(a) * (I.r - 3.6);
      gp.mushrooms.push({ x: px, y: I.y, z: pz, size: 1.0 });
      ctx.gemArc([[px, I.y + 11, pz], [(px + nxt.x) / 2, I.y + 9 + (nxt.y - I.y) * 0.4, (pz + nxt.z) / 2], [nxt.x, nxt.y + 3, nxt.z]], 8, k === 1 ? 2 : 1);
    }
    if (k === 1 || k === 2) ctx.addEnemy(I.x, I.z, 'thorn', 4, I.y);
    if (k === 2) ctx.addEnemy(I.x + 5, I.z - 4, 'bell', 4, I.y);
    if (k === 0) { ctx.addChest(I.x - 4, I.z + 3, 0, [10, 5], I.y); }
    if (k === 2) { ctx.addChest(I.x - 4, I.z + 4, 0, [10, 5, 5], I.y); }
  });
  const I4 = L.isles[3];
  gp.beacons.push({ id: 'sky', name: 'SKY BEACON', x: I4.x, y: I4.y, z: I4.z, yaw: 0 });
  gp.purple = gp.purple || [];
  gp.purple.push([L.isles[1].x + 5, L.isles[1].y + 1.2, L.isles[1].z + 6]);
}

export function layoutHollow(ctx) {
  const { L, put, rng, h } = ctx;
  const K = L.hollow;
  for (let i = 0; i < 9; i++) {
    const a = rng.float(0, TAU), d = rng.float(2, K.r * 0.62);
    put('crystal_cluster', K.x + Math.cos(a) * d, K.z + Math.sin(a) * d, { color: i % 2 ? 'violet' : 'cyan', count: 3 + (i % 4), rot: a }, 2.2);
  }
  put('crystal_spire', K.x - 6, K.z - 10, { color: 'violet', h: 9 }, 2.5);
  put('crystal_spire', K.x + 7, K.z - 8, { color: 'cyan', h: 7 }, 2.5);
  put('crystal_spire', K.x, K.z - 12, { color: 'violet', h: 11 }, 3);
  put('giant_mushroom', K.x + 10, K.z + 4, { size: 1.2 }, 4);
  put('mushroom_cluster', K.x - 10, K.z + 3, { count: 6 }, 3);
  put('tree_lantern', K.x - 11, K.z + 15, { canopy: 'leaves_teal', size: 'm' }, 4);
  put('tree_lantern', K.x + 11, K.z + 15, { canopy: 'leaves_teal', size: 'm' }, 4);
  ctx.addChest(K.x, K.z - 7, 0, [10, 5]);
  ctx.addVase(K.x - 4, K.z - 3, [5]); ctx.addVase(K.x + 5, K.z - 2, [2, 5]);
  // (a free spot near where he was meant to stand: the random crystal clusters had one growing right through him)
  const [ex, ez] = ctx.spot(K.x - 4, K.z + 4, { r: 1.4, clear: 1.2, maxR: 8 });
  ctx.addEnemy(ex, ez, 'basic', 4); ctx.addEnemy(K.x + 5, K.z + 6, 'bell', 4);
  ctx.gp.purple = ctx.gp.purple || [];
  // (found by asking for a free spot: the crystal spires' colliders would put a gem out of the hero's reach)
  const [gx, gz] = ctx.spot(K.x + 1, K.z - 3, { r: 2.6, clear: 1, maxR: 10 });
  ctx.gp.purple.push([gx, h(gx, gz) + 1.3, gz]);
}

export function layoutNorth(ctx) {
  const { L, gp, put, h } = ctx;
  const gx = L.gate.x, gz = L.gate.z;
  const gy = h(gx, gz);
  put('gate_pillars', gx, gz, { rot: 0 }, 8);
  const gate = ctx.anchor('gate_pillars', 'barrier', gx, gz, { rot: 0 });
  gp.barrier = { x: gate ? gate[0] : gx, y: gate ? gate[1] - 5.75 : gy, z: gate ? gate[2] : gz, yaw: 0 };   // anchor is mid-opening; the field's origin is its base
  gp.soundSources.push({ name: 'portal_hum', x: gp.barrier.x, y: gp.barrier.y + 4, z: gp.barrier.z, range: 38, vol: 1.4, when: 'barrier' });
  gp.hints.push({ x: gx, z: gz + 12, r: 9, text: 'THE DAWN GATE WILL OPEN WHEN FOUR BEACONS BURN', dur: 7 });
  // the summit road: lamps + guards + tower
  const S = L.summit;
  put('tower_observatory', S.x, S.z, { rot: 0 }, 14);
  const beacon = ctx.anchor('tower_observatory', 'beacon', S.x, S.z, { rot: 0 });
  gp.beacons.push({ id: 'dawn', name: 'GREAT BEACON', x: beacon ? beacon[0] : S.x, y: beacon ? beacon[1] : h(S.x, S.z) + 24, z: beacon ? beacon[2] : S.z, yaw: 0, big: true });
  // the ring of light that opens above the Great Beacon when the last lantern burns (systems/portals.js): it hangs out of a jump's reach, so a ring of light on the lantern room's
  // floor marks where its beam comes down, and a jump made inside it lets the light carry the hero up into the portal, and out of the realm to Dawnhaven (the homeworld)
  {
    const b = gp.beacons[gp.beacons.length - 1];
    gp.portals.push({ id: 'dawn', name: 'DAWNHAVEN', tag: 'HOMEWORLD OF THE LANTERN KEEPERS', kind: 'lift', shape: 'ring', flat: true, x: b.x, y: b.y - 1.0, z: b.z, yaw: 0, r: 2.6, cy: 16.5, catchR: 5.4, color: [0.78, 0.62, 1.0], target: 'home', state: 'closed' });
    gp.soundSources.push({ name: 'portal_hum', x: b.x, y: b.y + 15.5, z: b.z, range: 70, vol: 1.5, when: 'portal:dawn' });
  }
  const road = ctx.grid.paths.find((p) => p.id === 'summit');
  let dist = 0, next = 10, side = 1;
  for (let i = 1; i < road.pts.length; i++) {
    dist += Math.hypot(road.pts[i][0] - road.pts[i - 1][0], road.pts[i][2] - road.pts[i - 1][2]);
    if (dist < next) continue;
    next += 17;
    const p = road.pts[i], q = road.pts[Math.min(i + 1, road.pts.length - 1)];
    const dx = q[0] - p[0], dz = q[2] - p[2], l = Math.hypot(dx, dz) || 1;
    const x = p[0] + (-dz / l) * (road.width / 2 + 1.0) * side, z = p[2] + (dx / l) * (road.width / 2 + 1.0) * side;
    put('lamp_post', x, z, { rot: 0 }, 1);
    side = -side;
  }
  const marks = [[0.12, 'basic'], [0.24, 'basic'], [0.36, 'bell'], [0.47, 'thorn'], [0.58, 'pup'], [0.68, 'bell'], [0.78, 'thorn'], [0.9, 'bell']];
  for (const [t, v] of marks) { const p = ctx.pathPoint('summit', t); ctx.addEnemy(p.x, p.z, v, 4); }
  for (const t of [0.2, 0.42, 0.65, 0.86]) { const p = ctx.pathPoint('summit', t); ctx.addVase(p.x + p.dz * 3.4, p.z - p.dx * 3.4, [2, 5]); }
  const cp = ctx.pathPoint('summit', 0.5);
  ctx.addChest(cp.x - cp.dz * 3.2, cp.z + cp.dx * 3.2, 0, [10, 5]);
  // pines & rocks on the mountain flanks
  ctx.scatter('tree_pine', 26, ctx.inRing(S.x, S.z, 20, 70), { r: 3, maxSlope: 0.5, path: 4, minH: 1 }, () => ({ size: ctx.rng.pick(['s', 'm', 'l']) }));
  ctx.scatter('rock_cluster', 14, ctx.inRing(S.x, S.z, 20, 70), { r: 3, maxSlope: 0.55, path: 3.5, minH: 1 });
  gp.hints.push({ x: 0, z: -120, r: 12, text: 'ARMOURED SNUFFERS: FIRE BOUNCES OFF BELLS, SPIKES HURT WHEN RAMMED', dur: 7 });
}

/** Bunny fodder (they turn into healing butterflies) scattered through the quieter meadows. */
export function layoutFauna(ctx) {
  const groups = [[-40, 140, 3, 8], [42, 138, 2, 8], [56, 100, 3, 8], [-64, 96, 3, 8], [-24, 80, 2, 6], [86, 34, 2, 8],
    [60, 0, 2, 8], [-66, -10, 2, 8], [-66, -66, 3, 8], [30, -52, 2, 8], [-100, 50, 2, 6]];
  for (const [x, z, n, r] of groups) ctx.addBunnies(x, z, n, r);
}
