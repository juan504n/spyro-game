// The level script of SKYWEAVER SPIRES: the stages the kit provides (the goals, the ring of light over the last one, the treasure) and the places of the realm, each a function that dresses one
// island - the Skygate with the door of Dawnhaven, the row of slabs across the cloud and the lonely slab off it, the Cloud Islet, the Lowfield and the first whirlwind, the Kite Isle, the Orchard
// Terrace with its walled vault and the second whirlwind, the four Spindle Spires and their slabs, the third whirlwind, the Loom Isle with the tower - then the Snuffers, the puffs of cloud on the
// sea and the trees. Positions come from brief.js; everything here is expressed in world coordinates and validated against the terrain by ctx.h() / ctx.ok(). Called twice by buildWorld (a dry
// pass, then a wet one): it must be deterministic - ctx.rng, never Math.random.
import { makePopulate, goalsStage, exitStage, gemsStage, faceTo, inFront, band, lampsAlong, TAU } from '../realm/index.js';
import { vaultDoor } from '../props/nature/sky.js';
import { BRIEF, REGIONS, DOOR, WHIRLS, ROWS, LONELY, VAULT, LOOM } from './brief.js';

const regionBand = (ctx, id, f0, f1, lo, hi) => band(ctx, REGIONS, id, f0, f1, lo, hi);
const pts = (id) => REGIONS.find((r) => r.id === id).pts;
const goal = (id) => BRIEF.goals.find((q) => q.id === id);
const whirl = (id) => WHIRLS.find((q) => q.id === id);
const yawTo = (dx, dz) => Math.atan2(dz, dx);                      // (a signpost's board points along its rotated +X: yaw 0 east, -PI/2 north)
/** a drift of windflowers (the meadow flowers of this country: the skin gives all three kinds the same texture) */
const flowers = (r = 3.0, count = 8) => ({ r, count, kinds: ['flower_pink', 'flower_blue', 'flower_yellow'], tufts: true });
const pine = (rng) => ({ size: rng.pick(['s', 'm', 'm', 'l']) });
const leaf = (rng) => ({ canopy: rng.pick(['leaves_teal', 'leaves_teal', 'leaves_green']), size: rng.pick(['s', 'm', 'm', 'l']) });

/**
 * The slabs of a row (brief.js ROWS): [{ x, z, y, r }] from the edge of one island to the edge of the next, `n` of them, an equal gap between each and the next (and the islands' edges), on a
 * curve that leans `bend` metres to one side at its middle; their ground eases from one island's height to the other's.
 */
export function rowSlabs(row) {
  const [x0, z0, y0] = row.from, [x1, z1, y1] = row.to, L = Math.hypot(x1 - x0, z1 - z0), nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
  const gap = (L - 2 * row.r * row.n) / (row.n + 1), out = [];
  for (let i = 1; i <= row.n; i++) {
    const t = (gap * i + row.r * (2 * i - 1)) / L, lean = Math.sin(Math.PI * t) * row.bend;
    out.push({ x: x0 + (x1 - x0) * t + nx * lean, z: z0 + (z1 - z0) * t + nz * lean, y: y0 + (y1 - y0) * t, r: row.r + ((i * 7) % 3) * 0.12 });
  }
  return out;
}
/** the slabs of the branch to the lonely slab (the last): off the row's slab `LONELY.from`, away from the row's lean */
export function lonelySlabs() {
  const row = ROWS[0], s = rowSlabs(row)[LONELY.from - 1], dx = row.to[0] - row.from[0], dz = row.to[1] - row.from[1], L = Math.hypot(dx, dz), nx = dz / L, nz = -dx / L;
  const out = [];
  for (let k = 1; k <= LONELY.n; k++) out.push({ x: s.x + nx * LONELY.step * k, z: s.z + nz * LONELY.step * k, y: s.y - 0.3 * k, r: k === LONELY.n ? LONELY.r : row.r });
  return out;
}

/** a ring of `n` gems round (x, z), `r` metres out, on the ground (the values cycling): the reward for walking up to a thing */
function gemRing(ctx, x, z, r, n, values = [1, 1, 2], a0 = 0) {
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (Math.abs(ctx.h(px, pz) - ctx.h(x, z)) < 1.2) ctx.addGem(px, pz, values[i % values.length]);       // (on the island's own ground: not over its edge)
  }
}

export const populate = makePopulate(BRIEF, [
  goalsStage,
  layoutGate, layoutSlabs, layoutIslet, layoutField, layoutKite, layoutOrchard, layoutVault, layoutSpires, layoutLoom,
  layoutDanger, layoutClouds, layoutScatter,
  exitStage,
  gemsStage,
], { seed: 8691 });

// ---- the Skygate: where the door of Dawnhaven stands, and the first Windbell -----------------------------------------------------------------------------------
function layoutGate(ctx) {
  const { gp, put, rng } = ctx, sp = ctx.L.spawn, g = goal('gate');
  const y = ctx.h(DOOR.x, DOOR.z);
  put('realm_door', DOOR.x, DOOR.z, { rot: DOOR.yaw, color: DOOR.color, sealed: false, y }, 12);
  gp.portals.push({ id: DOOR.id, name: DOOR.name, tag: DOOR.tag, kind: 'door', shape: 'arch', x: DOOR.x, y, z: DOOR.z, yaw: DOOR.yaw, r: 2.6, hs: 3.1, cy: 3.4, color: DOOR.color, target: DOOR.target, state: 'open' });
  gp.soundSources.push({ name: 'portal_hum', x: DOOR.x, y: y + 3.4, z: DOOR.z, range: 44, vol: 1.3, when: `portal:${DOOR.id}` });
  for (const side of [-1, 1]) {
    put('torch_stand', ...inFront(DOOR, 6.4, side * 5.4), { rot: DOOR.yaw }, 1.5);
    put('crystal_cluster', ...inFront(DOOR, 3, side * 9.5), { color: 'cyan', count: 5 }, 2.4);
    put('bush', ...inFront(DOOR, 4, side * 13), { flowers: true }, 2);
  }
  // the first bell: a ring of standing stones round it, flowers, a bench to look at the view from
  put('standing_stones', g.x, g.z, { r: 6.8, count: 5, glowColor: [1.0, 0.82, 0.4] }, 9);
  gemRing(ctx, g.x, g.z, 3.4, 6, [1, 2], 0.3);
  put('flower_patch', g.x - 9, g.z + 5, flowers(3.4, 12), 3.6);
  put('flower_patch', g.x + 8, g.z - 7, flowers(3.0, 10), 3.2);
  // the road: torches along it, the signpost where it runs out at the east edge, the first hints
  lampsAlong(ctx, 'gate', 26, 16, 130, 1.8, 'torch_stand');
  put('signpost', -150.5, 143.5, { rot: 0.1, boards: [
    { yaw: yawTo(1, -0.35), y: 3.4, len: 2.3, tint: [1.0, 0.82, 0.55] },            // east: the slabs across the cloud, and the islet
    { yaw: yawTo(-1, 0.1), y: 2.4, len: 2.1, tint: [0.9, 0.9, 0.95] },               // west: back to the door
  ] }, 1.5);
  put('bench', -146, 133.5, { rot: faceTo(-146, 133.5, -110, 118) }, 1.6);
  put('wind_vane', -176, 131, { rot: 0.5 }, 2);                                       // a vane that has stopped: the wind has not blown since
  gp.hints.push({ x: sp.x + 6, z: sp.z, r: 9, text: 'WELCOME TO SKYWEAVER SPIRES! THE WINDS HAVE FALLEN SLACK. RING THE WINDBELLS WITH FIRE', dur: 7 });
  gp.hints.push({ x: -148, z: 140, r: 9, text: 'THE ROAD ENDS AT THE EDGE. THE CLOUDS CANNOT HOLD YOU: HOP THE SLABS', dur: 7 });
  for (const [x, z, gv] of [[-198, 138, [1, 1, 2]], [-186, 164, [1, 1, 2]], [-168, 135, [2, 5]], [-158, 160, [1, 1, 1]]]) ctx.addVase(x, z, gv);
  // the island's own trees and stones: pines on its rim, a few pale birches, rocks
  ctx.scatter('tree_pine', 14, regionBand(ctx, 'skygate', 0.55, 0.88), { r: 3.2, path: 4, maxSlope: 0.36 }, () => pine(rng));
  ctx.scatter('tree_birch', 6, regionBand(ctx, 'skygate', 0.45, 0.85), { r: 2.6, path: 4, maxSlope: 0.36 });
  ctx.scatter('rock_cluster', 7, regionBand(ctx, 'skygate', 0.5, 0.9), { r: 3.5, path: 3, maxSlope: 0.36 });
  ctx.scatter('flower_patch', 12, regionBand(ctx, 'skygate', 0.2, 0.85), { r: 3, path: 3, maxSlope: 0.3 }, () => flowers(3.0, 9));
  ctx.scatter('bush', 8, regionBand(ctx, 'skygate', 0.5, 0.88), { r: 1.6, path: 3, maxSlope: 0.36 }, () => ({ flowers: rng.chance(0.5) }));
}

// ---- the rows of slabs: hops across the cloud, and the lonely slab off the first row ---------------------------------------------------------------------------------
function layoutSlabs(ctx) {
  const { gp, put, rng } = ctx;
  for (const row of ROWS) {
    const slabs = rowSlabs(row);
    slabs.forEach((s, i) => {
      put('sky_slab', s.x, s.z, { y: s.y, r: s.r, rot: rng.float(0, TAU) }, 0);
      ctx.addGem(s.x, s.z, [1, 1, 2][i % 3], s.y + 1.1);                                // (a gem over each: the way across is shown)
    });
  }
  // the lonely slab: a short branch off the first row, a bigger slab at its end with a chest on it
  const lone = lonelySlabs();
  lone.forEach((s) => put('sky_slab', s.x, s.z, { y: s.y, r: s.r, rot: rng.float(0, TAU) }, 0));
  lone.slice(0, -1).forEach((s) => ctx.addGem(s.x, s.z, 1, s.y + 1.1));
  const end = lone[lone.length - 1], from = rowSlabs(ROWS[0])[LONELY.from - 1];
  gp.chests.push({ x: end.x, y: end.y, z: end.z, yaw: faceTo(end.x, end.z, from.x, from.z), gems: [10, 10, 5], secret: 'slab' });
  put('crystal_cluster', end.x + 1.6, end.z - 1.4, { color: 'cyan', count: 4, rot: 1, y: end.y }, 0);
  gp.hints.push({ x: from.x, z: from.z, r: 8, text: 'A SLAB ALL ALONE, OFF TO THE SIDE... THERE IS SOMETHING ON IT', dur: 6 });
  // the ground the hero stands on in the hint zone is a slab: the zone is the whole row's first stretch
  const first = rowSlabs(ROWS[0])[0];
  gp.hints.push({ x: first.x, z: first.z, r: 8, text: 'FALL AND THE CLOUDS SET YOU BACK ON THE LAST SLAB. DO NOT BE AFRAID', dur: 6 });
  // the spires' slabs: a hint where each row begins
  gp.hints.push({ x: 106, z: -33, r: 8, text: 'THE SPINDLE SPIRES: HOP THE SLABS FROM ONE NEEDLE TO THE NEXT', dur: 7 });
}

// ---- the Cloud Islet: the second bell on a little island out in the cloud, and the launch for a glide --------------------------------------------------------------------------
function layoutIslet(ctx) {
  const { gp, put } = ctx, g = goal('isle');
  put('standing_stones', g.x, g.z, { r: 5.2, count: 4, glowColor: [1.0, 0.82, 0.4] }, 7);
  gemRing(ctx, g.x, g.z, 3.2, 6, [1, 2], 0.3);
  put('tree_pine', -80, 108.5, { size: 'l' }, 3.4);
  put('tree_pine', -66.5, 116.5, { size: 'm' }, 3);
  put('tree_birch', -78, 117.5, {}, 2.6);
  put('flower_patch', -71, 105, flowers(3.0, 12), 3.2);
  put('flower_patch', -75.5, 118.5, flowers(2.6, 9), 2.8);
  // the launch at the east edge: torches either side of it, a bench to look at the lowfield from, the signpost
  put('torch_stand', -66, 110.4, {}, 1.2);
  put('torch_stand', -67.4, 105, {}, 1.2);
  put('bench', -68.6, 114.4, { rot: faceTo(-68.6, 114.4, -40, 80) }, 1.6);
  put('signpost', -70, 103.4, { rot: 0.5, boards: [{ yaw: yawTo(1, 0.9), y: 3.4, len: 2.3, tint: [1.0, 0.82, 0.55] }] }, 1.5);
  gp.hints.push({ x: -66, z: 108, r: 8, text: 'THE LOWFIELD LIES BELOW. RUN OFF THE EDGE AND GLIDE: HOLD JUMP IN THE AIR', dur: 8 });
  ctx.addVase(-82, 112, [1, 1, 2], ctx.h(-82, 112)); ctx.addVase(-72, 119, [2, 5], ctx.h(-72, 119));
  // gems along the glide: from the launch down to the lowfield
  ctx.gemArc([[-64, 25.8, 107.5], [-50, 22, 92], [-38, 14.6, 77]], 8, [1, 1, 2]);
}

// ---- the Lowfield: a meadow in the cloud, the third bell near the landing, the first whirlwind at the far end ---------------------------------------------------------------------
function layoutField(ctx) {
  const { gp, put, rng } = ctx, g = goal('field'), w = whirl('w1');
  put('standing_stones', g.x, g.z, { r: 6.4, count: 5, glowColor: [1.0, 0.82, 0.4] }, 8);
  gemRing(ctx, g.x, g.z, 3.4, 6, [1, 2], 0.3);
  lampsAlong(ctx, 'field', 30, 14, 120, 1.8, 'torch_stand');
  put('signpost', -30, 66, { rot: -0.2, boards: [
    { yaw: yawTo(1, -0.5), y: 3.4, len: 2.3, tint: [0.7, 0.85, 1.0] },              // east: the whirlwind
  ] }, 1.5);
  gp.hints.push({ x: -34, z: 66, r: 10, text: 'THE LOWFIELD. A WHIRLWIND AT THE FAR END WILL LIFT YOU TO THE ISLANDS ABOVE', dur: 7 });
  whirlwind(ctx, w, [{ x: 46, z: 34, label: 'THE ORCHARD' }, { x: 6, z: 12, label: 'THE KITE ISLE' }]);
  for (const [x, z, gv] of [[-20, 62, [1, 1, 2]], [-8, 70, [2, 5]], [6, 62, [1, 1, 1]], [-1, 50, [1, 2]]]) ctx.addVase(x, z, gv);
  ctx.scatter('flower_patch', 22, regionBand(ctx, 'lowfield', 0.15, 0.9), { r: 3, path: 3, maxSlope: 0.3 }, () => flowers(3.0, 10));
  ctx.scatter('tree_pine', 14, regionBand(ctx, 'lowfield', 0.55, 0.9), { r: 3.2, path: 4, maxSlope: 0.36 }, () => pine(rng));
  ctx.scatter('tree_round', 6, regionBand(ctx, 'lowfield', 0.55, 0.9), { r: 3.8, path: 4, maxSlope: 0.36 }, () => leaf(rng));
  ctx.scatter('rock_cluster', 8, regionBand(ctx, 'lowfield', 0.5, 0.92), { r: 3.5, path: 3, maxSlope: 0.36 });
  ctx.scatter('tuft_patch', 10, regionBand(ctx, 'lowfield', 0.2, 0.85), { r: 3, path: 3, teal: true });
  ctx.scatter('bush', 8, regionBand(ctx, 'lowfield', 0.5, 0.9), { r: 1.6, path: 3, maxSlope: 0.36 }, () => ({ flowers: rng.chance(0.5) }));
}

/** a whirlwind: the column (the object system draws it and lifts the hero: realm/whirl.js), a ring of standing stones round its foot, the hum of the wind, the hint, and the gems along the glides out */
function whirlwind(ctx, w, outs) {
  const { gp } = ctx, y0 = ctx.h(w.x, w.z), top = y0 + w.h;
  (gp.whirlwinds ||= []).push({ id: w.id, x: w.x, y0, z: w.z, h: w.h, r: w.r });
  ctx.occ.add(w.x, w.z, 7);
  ctx.put('standing_stones', w.x, w.z, { r: 8.4, count: 6, glowColor: [0.7, 0.9, 1.0] }, 9);
  gp.soundSources.push({ name: 'whirl', x: w.x, y: y0 + w.h * 0.3, z: w.z, range: 62, vol: 0.9 });
  gp.hints.push({ x: w.x, z: w.z, r: 9, text: 'A WHIRLWIND! STEP INTO IT: IT CARRIES YOU UP. AT THE TOP, JUMP AND GLIDE', dur: 8 });
  gemRing(ctx, w.x, w.z, 5.2, 8, [1, 1, 2], 0.4);
  for (const o of outs) {
    const oy = ctx.h(o.x, o.z), dx = o.x - w.x, dz = o.z - w.z, L = Math.hypot(dx, dz);
    // an arc of gems from the top of the column to where the glide comes down
    const a = [w.x + dx / L * 6, top - 1.2, w.z + dz / L * 6], c = [w.x + dx * 0.55, (top + oy) / 2 + 1.6, w.z + dz * 0.55], b = [o.x - dx / L * 3, oy + 2.4, o.z - dz / L * 3];
    ctx.gemArc([a, c, b], 6, [1, 1, 2]);
  }
}

// ---- the Kite Isle: a little isle high over the Lowfield, a chest and a string of pennants -------------------------------------------------------------------------------------
function layoutKite(ctx) {
  const { gp, put } = ctx;
  gp.chests.push({ x: 9, y: ctx.h(9, 4), z: 4, yaw: faceTo(9, 4, 6, 10), gems: [10, 10, 5], secret: 'kite' });
  put('wind_vane', 1.5, 3.5, { rot: -0.4 }, 2);
  put('bunting', -2, 9, { ax: -2, az: 9, bx: 13, bz: 9, h: 5.0, hb: 4.4, sag: 1.0 }, 0);
  put('flower_patch', 5, 2, flowers(3.0, 10), 3.0);
  put('crystal_cluster', 12, 10, { color: 'cyan', count: 4 }, 2.4);
  put('tree_pine', 12, 2, { size: 'm' }, 2.6);
  gp.hints.push({ x: 6, z: 8, r: 9, text: 'THE KITE ISLE, HIGH OVER THE CLOUDS. THERE IS A CHEST UP HERE', dur: 7 });
  // the glide down to the lowfield: an arc of gems from the south edge
  ctx.gemArc([[8, 31.5, 14], [11, 24, 30], [14, 15, 46]], 7, [1, 1, 2]);
}

// ---- the Orchard Terrace: a terrace of lantern trees on two roads that make a loop round the vault, the second whirlwind at its far end -------------------------------------------------------------
function layoutOrchard(ctx) {
  const { gp, put, rng } = ctx, w = whirl('w2');
  lampsAlong(ctx, 'orchard', 28, 12, 140, 1.8, 'torch_stand');
  lampsAlong(ctx, 'terrace', 34, 14, 140, 1.8, 'torch_stand');
  put('signpost', 49, 38.5, { rot: 0.3, boards: [
    { yaw: yawTo(1, -0.45), y: 3.4, len: 2.3, tint: [1.0, 0.82, 0.55] },          // the high road, along the top of the terrace
    { yaw: yawTo(1, 0.3), y: 2.4, len: 2.2, tint: [0.9, 0.9, 0.95] },              // the low road, round the walled court
  ] }, 1.5);
  gp.hints.push({ x: 48, z: 34, r: 11, text: 'THE ORCHARD TERRACE. TWO ROADS RUN EAST ROUND A WALLED COURT. A WHIRLWIND WAITS AT THE FAR END', dur: 8 });
  whirlwind(ctx, w, [{ x: 104, z: -26, label: 'THE SPIRES' }]);
  put('well', 62, 31, {}, 3);
  put('bench', 92, 21, { rot: faceTo(92, 21, 92, 8) }, 1.6);
  put('scarecrow', 92, 27, { rot: -0.6 }, 2);
  put('garden_plot', 56, 14, { rot: 0.4 }, 3);
  put('garden_plot', 66, 10, { rot: 0.4 }, 3);
  put('garden_plot', 106, 24, { rot: 1.2 }, 3);
  for (const [x, z, gv] of [[58, 24, [1, 1, 2]], [70, 17, [2, 5]], [96, 14, [1, 1, 1]], [74, 44, [1, 2]], [90, 36, [2, 5]]]) ctx.addVase(x, z, gv);
  // the orchard: lantern trees in the open ground between the roads and the edge, a few round trees and pines on the rim
  ctx.scatter('tree_lantern', 16, regionBand(ctx, 'orchard', 0.25, 0.85), { r: 4.2, path: 4.2, maxSlope: 0.3 }, () => ({ canopy: rng.pick(['leaves_teal', 'leaves_green']), size: rng.pick(['s', 'm', 'm']) }));
  ctx.scatter('tree_round', 8, regionBand(ctx, 'orchard', 0.5, 0.9), { r: 3.8, path: 4, maxSlope: 0.34 }, () => leaf(rng));
  ctx.scatter('tree_pine', 10, regionBand(ctx, 'orchard', 0.62, 0.92), { r: 3.2, path: 4, maxSlope: 0.34 }, () => pine(rng));
  ctx.scatter('flower_patch', 22, regionBand(ctx, 'orchard', 0.15, 0.9), { r: 3, path: 3, maxSlope: 0.3 }, () => flowers(3.0, 10));
  ctx.scatter('bush', 10, regionBand(ctx, 'orchard', 0.4, 0.9), { r: 1.6, path: 3, maxSlope: 0.34 }, () => ({ flowers: rng.chance(0.6) }));
  ctx.scatter('rock_cluster', 6, regionBand(ctx, 'orchard', 0.6, 0.92), { r: 3.5, path: 3, maxSlope: 0.34 });
}

// ---- the Weavers' vault: a walled court with one doorway, shut with a cracked wall, and the first secret in it ---------------------------------------------------------------------------
function layoutVault(ctx) {
  const { gp, put, h } = ctx;
  put('vault_walls', VAULT.x, VAULT.z, { w: VAULT.w, d: VAULT.d, door: VAULT.door, y: h(VAULT.x, VAULT.z) }, 10);
  const [dx, dz, yaw] = vaultDoor(VAULT);
  ctx.addWall(dx, dz, yaw, 4.6, 4.6, [25]);
  gp.hints.push({ x: dx, z: dz + 5, r: 8, text: 'THAT WALL OF MARBLE LOOKS CRACKED... TRY CHARGING IT', dur: 6 });
  const cx = VAULT.x, cz = VAULT.z - 1.0;
  gp.chests.push({ x: cx, y: h(cx, cz), z: cz, yaw: Math.PI, gems: [10, 10, 5], secret: 'vault' });
  put('crystal_cluster', VAULT.x - 4.4, VAULT.z + 2.8, { color: 'cyan', count: 5 }, 0);
  put('crystal_cluster', VAULT.x + 4.4, VAULT.z + 2.8, { color: 'violet', count: 5 }, 0);
  put('flower_patch', VAULT.x - 3, VAULT.z - 1.5, flowers(2.0, 8), 0);
  put('flower_patch', VAULT.x + 3.4, VAULT.z - 1.0, flowers(2.0, 8), 0);
  ctx.addVase(VAULT.x - 5, VAULT.z - 1.5, [2, 5], h(VAULT.x - 5, VAULT.z - 1.5));
  ctx.addVase(VAULT.x + 5, VAULT.z - 2.0, [1, 1, 2], h(VAULT.x + 5, VAULT.z - 2.0));
  gp.purple.push([VAULT.x, h(VAULT.x, VAULT.z - 2) + 1.3, VAULT.z - 2]);
}

// ---- the Spindle Spires: four needles of marble joined by slabs, the fourth bell on the highest, the third whirlwind beside it --------------------------------------------------------------------
function layoutSpires(ctx) {
  const { gp, put } = ctx, g = goal('spire'), w = whirl('w3');
  const top = (id) => pts(id)[0];
  // the first spire (where the second whirlwind sets the hero down): torches and a signpost
  const s1 = top('spire1');
  put('torch_stand', s1[0] - 3.4, s1[1] + 3.6, {}, 1.2);
  put('torch_stand', s1[0] + 4.8, s1[1] + 3.2, {}, 1.2);
  put('crystal_cluster', s1[0] + 0.6, s1[1] - 4.6, { color: 'cyan', count: 5 }, 2.4);
  ctx.addVase(s1[0] + 3.4, s1[1] - 3.2, [1, 1, 2], ctx.h(s1[0] + 3.4, s1[1] - 3.2));
  // the second: a bench to look at the sea from, a chest-less nook with gems
  const s2 = top('spire2');
  put('bench', s2[0] + 2.2, s2[1] + 1.6, { rot: faceTo(s2[0] + 2.2, s2[1] + 1.6, s2[0] + 12, s2[1] + 30) }, 1.6);
  put('crystal_cluster', s2[0] - 2.8, s2[1] - 2.4, { color: 'violet', count: 4 }, 2.2);
  ctx.addVase(s2[0] + 1.4, s2[1] - 3.4, [2, 5], ctx.h(s2[0] + 1.4, s2[1] - 3.4));
  // the fourth: a wind vane, a vase, a crystal
  const s4 = top('spire4');
  put('wind_vane', s4[0] - 0.4, s4[1] - 2.8, { rot: 2.4 }, 1.6);
  put('crystal_cluster', s4[0] + 3.2, s4[1] + 2.6, { color: 'cyan', count: 4 }, 2.2);
  ctx.addVase(s4[0] + 2.8, s4[1] - 2.8, [1, 2], ctx.h(s4[0] + 2.8, s4[1] - 2.8));
  for (const id of ['spire1', 'spire2', 'spire4']) gemRing(ctx, top(id)[0] + 0.5, top(id)[1] + 0.2, 3.6, 5, [1, 1, 2], 1.1);
  gemRing(ctx, g.x, g.z, 3.4, 6, [1, 2], 0.3);
  // the highest, with the Spire Bell and the whirlwind to the Loom
  put('torch_stand', g.x - 1.6, g.z - 5.4, {}, 1.2);
  put('torch_stand', g.x - 1.6, g.z + 5.4, {}, 1.2);
  put('crystal_cluster', g.x - 4.4, g.z + 0.4, { color: 'violet', count: 5 }, 2.4);
  whirlwind(ctx, w, [{ x: 92, z: -120, label: 'THE LOOM ISLE' }]);
  gp.hints.push({ x: 116, z: -76, r: 10, text: 'THE HIGH SPIRE. THE WHIRLWIND AT ITS EDGE LEADS TO THE LOOM, THE TOWER AT THE HEART OF THE WORLD', dur: 8 });
  // an arc of gems from the second spire to the third, over the slabs' gap: the slabs have their own
  void gp;
}

// ---- the Loom Isle: the tower the Skyweavers wove the winds at, and the last bell before it ---------------------------------------------------------------------------------------------------------
function layoutLoom(ctx) {
  const { gp, put, rng } = ctx, g = goal('loom');
  put('loom_tower', LOOM.x, LOOM.z, { rot: 0 }, 11);
  // (the bell hangs in the courtyard before it: torches, pennants, the way the road goes round)
  lampsAlong(ctx, 'loomway', 26, 10, 120, 1.8, 'torch_stand');
  for (const side of [-1, 1]) put('torch_stand', g.x - 4.2 * side + 0.0, g.z + 5.6, {}, 1.4);
  gemRing(ctx, g.x, g.z, 6.4, 10, [1, 1, 2], 0.2);
  put('flower_patch', g.x + 7, g.z + 4, flowers(3.2, 12), 3.2);
  put('flower_patch', g.x - 8, g.z - 5, flowers(3.2, 12), 3.2);
  put('bunting', g.x - 9, g.z - 9, { ax: g.x - 9, az: g.z - 9, bx: g.x + 9, bz: g.z - 9, h: 5.2, hb: 5.2, sag: 1.2 }, 0);
  gp.hints.push({ x: LOOM.x + 12, z: LOOM.z + 8, r: 12, text: 'THE LOOM: THE SKYWEAVERS WOVE THE WINDS HERE. THE LAST BELL HANGS BEFORE IT', dur: 8 });
  for (const [x, z, gv] of [[100, -140, [2, 5]], [84, -118, [1, 1, 2]], [62, -128, [2, 5]], [76, -150, [5, 5]]]) ctx.addVase(x, z, gv);
  ctx.scatter('tree_pine', 10, regionBand(ctx, 'loom', 0.6, 0.92), { r: 3.2, path: 4, maxSlope: 0.36 }, () => pine(rng));
  ctx.scatter('crystal_cluster', 6, regionBand(ctx, 'loom', 0.55, 0.9), { r: 2.4, path: 3, maxSlope: 0.36 }, () => ({ color: rng.pick(['cyan', 'violet']), count: 4 + rng.int(0, 3) }));
  ctx.scatter('flower_patch', 12, regionBand(ctx, 'loom', 0.2, 0.9), { r: 3, path: 3, maxSlope: 0.3 }, () => flowers(3.0, 9));
  ctx.scatter('rock_cluster', 6, regionBand(ctx, 'loom', 0.6, 0.92), { r: 3.5, path: 3, maxSlope: 0.36 });
  ctx.scatter('bush', 8, regionBand(ctx, 'loom', 0.4, 0.9), { r: 1.6, path: 3, maxSlope: 0.36 }, () => ({ flowers: rng.chance(0.5) }));
}

// ---- the Snuffers: none near the start, the first on the Lowfield, more of them and harder ones as the way climbs ---------------------------------------------------------------------------
function layoutDanger(ctx) {
  const side = (p, k) => [p.x + p.dz * k, p.z - p.dx * k];
  // [road, how far along it (0..1), kind]
  const marks = [
    ['field', 0.45, 'basic'], ['field', 0.8, 'basic'],
    ['orchard', 0.25, 'basic'], ['terrace', 0.35, 'bell'], ['orchard', 0.55, 'bell'], ['terrace', 0.7, 'thorn'], ['orchard', 0.82, 'thorn'],
    ['loomway', 0.2, 'bell'], ['loomway', 0.5, 'thorn'], ['loomway', 0.75, 'bell'], ['loomway', 0.9, 'thorn'],
  ];
  // (a Snuffer stands where nothing else does: the first of the offsets from the road that is clear)
  marks.forEach(([road, t, kind], i) => {
    const p = ctx.pathPoint(road, t);
    for (const k of [3.8, 5.2, 3.0, 6.6]) for (const sd of [i % 2 ? 1 : -1, i % 2 ? -1 : 1]) {
      const [x, z] = side(p, sd * k);
      if (ctx.ok(x, z, { r: 1.6, path: 0, maxSlope: 0.5 })) { ctx.addEnemy(x, z, kind, 4); return; }
    }
  });
  // the spires: one on each needle, standing guard (the tops are small: they patrol little)
  const at = (id, dx, dz) => [pts(id)[0][0] + dx, pts(id)[0][1] + dz];
  ctx.addEnemy(...at('spire1', 0.4, 2.4), 'basic', 2);
  ctx.addEnemy(...at('spire2', 0.8, 1.0), 'bell', 2);
  ctx.addEnemy(...at('spire4', 0.6, 1.4), 'thorn', 2);
  ctx.addEnemy(121, -92, 'bell', 3);
  ctx.gp.hints.push({ x: 28, z: 52, r: 9, text: 'ARMOURED SNUFFERS: FIRE BOUNCES OFF BELLS, SPIKES HURT WHEN RAMMED', dur: 7 });
}

// ---- the puffs of cloud on the sea: for scale and for parallax, round the feet of every island and out in the open sea ---------------------------------------------------------------------------
function layoutClouds(ctx) {
  const { put, rng, h } = ctx;
  const puff = (x, z) => put('cloud_puff', x, z, { y: 0, r: rng.float(3.2, 7.5), count: rng.int(3, 5), rot: rng.float(0, TAU) }, 0);
  for (const R of REGIONS) {
    for (const [px, pz, , hw] of R.pts) {
      for (let k = 0; k < 4; k++) {
        const a = rng.float(0, TAU), d = hw + R.fall + rng.float(5, 24), x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
        if (h(x, z) < -14 && Math.abs(x) < 220 && Math.abs(z) < 220) puff(x, z);
      }
    }
  }
  for (let k = 0, n = 0; k < 400 && n < 34; k++) {
    const x = rng.float(-226, 200), z = rng.float(-190, 190);
    if (h(x, z) < -20) { puff(x, z); n++; }
  }
}

// ---- trees, flowers, rocks on the islands that have no place of their own -----------------------------------------------------------------------------------------------------------
function layoutScatter(ctx) {
  const { rng } = ctx;
  ctx.scatter('flower_patch', 4, regionBand(ctx, 'kite', 0.2, 0.8), { r: 3, path: 3, maxSlope: 0.3 }, () => flowers(3.0, 8));
  for (const id of ['spire1', 'spire2', 'spire3', 'spire4']) {
    ctx.scatter('flower_patch', 3, regionBand(ctx, id, 0.2, 0.7), { r: 2.2, path: 2, maxSlope: 0.3 }, () => flowers(2.0, 6));
    ctx.scatter('tuft_patch', 3, regionBand(ctx, id, 0.2, 0.7), { r: 2.2, path: 2, maxSlope: 0.3, teal: true });
  }
  void rng;
}
