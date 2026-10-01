// The Crag's dressing: the mouth and the tunnel to the Echo Hall, the hall under its skylight, the winding way down to the Frost Grotto (and the Frostbloom door at its far end), the north and
// east passages, the ledge road up the mountain's flank and the summit with the Skyweaver door. Everything stands where crag.js says the caves, the road and the pad are: the floors
// inside are the terrain (so ctx.h() is the floor), the road and the summit are the massif's own surface (so they are given their heights).
//
// Torches and crystals are the light (a cave is dark: the glow lights of the props shine on the rock round them, see massif.js): a warm torch every so often, cold crystals where the rock is
// wet and old. The gems lead the way, in a long line down every passage and up the ledge.
import { tunnelAt, tunnelLength, TUNNELS, CHAMBERS, RAMP, SUMMIT, CRAG_Y } from './crag.js';
import { DOORS, inFront } from './level.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

/** points along the ledge road: every `every` metres from `s0`: { x, z, y, yaw, dx, dz, hw, s }; `side` is the way off to the left (the drop), the mountain being on the right */
function alongRamp(every, s0 = 0, s1 = Infinity) {
  const out = [];
  let acc = 0, next = s0;
  for (let i = 0; i < RAMP.length - 1; i++) {
    const a = RAMP[i], b = RAMP[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = (b[0] - a[0]) / (L || 1), dz = (b[1] - a[1]) / (L || 1);
    while (next <= acc + L && next <= s1) {
      const u = (next - acc) / (L || 1);
      out.push({ x: lerp(a[0], b[0], u), z: lerp(a[1], b[1], u), y: lerp(a[2], b[2], u), hw: lerp(a[3], b[3], u), yaw: Math.atan2(dx, dz), dx, dz, s: next });
      next += every;
    }
    acc += L;
  }
  return out;
}
/** a place at `lat` metres to the left (+) of a point of the ledge road's line */
const leftOf = (q, lat) => [q.x + q.dz * lat, q.z - q.dx * lat];

/** a hint zone that only counts at the right height: the ledge road runs over the tunnels */
function hint(ctx, x, z, y, r, text, dur = 6) {
  ctx.gp.hints.push({ x, z, r, y0: y - 3.5, y1: y + 10, text, dur });
}

/** torches along a tunnel, alternating sides, from `s0` every `every` metres */
function torchesAlong(ctx, name, every, s0 = 4, s1 = Infinity, margin = 1.3) {
  const len = tunnelLength(name);
  let k = 0;
  for (let s = s0; s <= Math.min(len - 2, s1); s += every, k++) {
    const q = tunnelAt(name, s, 0), side = (k % 2 ? 1 : -1) * (q.hw - margin);
    const p = tunnelAt(name, s, side);
    ctx.put('torch_stand', p.x, p.z, { rot: p.yaw }, 1.2);
  }
}

/** crystals at a tunnel's walls: [s, side (+ right, - left), colour, count, size] */
function crystalsIn(ctx, name, list) {
  for (const [s, side, color, count, size] of list) {
    const p = tunnelAt(name, s, side);
    ctx.put('crystal_cluster', p.x, p.z, { rot: (s * 7.3 + side) % TAU, color, count: count ?? 5, size: size ?? 'm' }, 2.2);
  }
}

/** a line of gems along a tunnel's middle: every `every` metres, the values cycling */
function gemsAlong(ctx, name, every, pattern, s0 = 3, s1 = Infinity, lateral = 0) {
  const len = tunnelLength(name);
  let k = 0;
  for (let s = s0; s <= Math.min(len - 1.5, s1); s += every) {
    const p = tunnelAt(name, s, lateral);
    ctx.addGem(p.x, p.z, pattern[k++ % pattern.length]);
  }
}

export function layoutCrag(ctx) {
  mouth(ctx); gate(ctx); hall(ctx); vault(ctx); stair(ctx); grotto(ctx); north(ctx); east(ctx); ledge(ctx); summit(ctx);
}

// ---- the south mouth and the tunnel from it to the Echo Hall -------------------------------------------------------------------------------
// (the tunnel's first 20 m are a lane open to the sky, cut into the apron in front of the bastion's cliff; the roof begins where the cliff does)
function mouth(ctx) {
  const { put } = ctx;
  const lane = tunnelAt('gate', 0), m = tunnelAt('gate', 19);
  // at the cliff's foot: braziers on either side of the way in, banners, crystals; further back a signpost of the ways round the mountain
  for (const side of [-1, 1]) {
    const p = tunnelAt('gate', 18, side * (m.hw + 1.4)), b = tunnelAt('gate', 14, side * (m.hw + 4.2)), c = tunnelAt('gate', 21, side * (m.hw + 4.6));
    put('torch_stand', p.x, p.z, {}, 1.4);
    put('banner_pole', b.x, b.z, { rot: side * Math.PI / 2 }, 1);
    put('crystal_cluster', c.x, c.z, { color: side < 0 ? 'cyan' : 'violet', count: 5, size: 1.1 }, 2.4);
  }
  put('signpost', lane.x - 13, lane.z + 10, { rot: 0.3, boards: [
    { yaw: -Math.PI / 2, y: 3.4, len: 2.3, tint: [0.7, 0.95, 0.92] },            // north: the tunnel to the Echo Hall
    { yaw: Math.PI, y: 2.6, len: 2.2, tint: [1.0, 0.9, 0.62] },                  // west: the summit road
  ] }, 1.5);
  hint(ctx, lane.x, lane.z + 8, CRAG_Y, 12, 'THE CRAG: THE TUNNEL LEADS TO THE ECHO HALL. THE STONE ROAD ON ITS WEST SIDE CLIMBS TO THE SUMMIT', 8);
}

function gate(ctx) {
  torchesAlong(ctx, 'gate', 11, 25);
  for (const side of [-1, 1]) { const p = tunnelAt('gate', 9, side * (tunnelAt('gate', 9).hw + 0.8)); ctx.put('torch_stand', p.x, p.z, {}, 1.2); }          // (two on the lane, outside the road's edge)
  crystalsIn(ctx, 'gate', [[24, -3.4, 'cyan', 5], [30, 3.4, 'cyan', 4], [35, -3.4, 'violet', 5], [41, 3.4, 'cyan', 5]]);
  gemsAlong(ctx, 'gate', 5.5, [1, 1, 2], 22);
  for (const s of [26, 38]) { const p = tunnelAt('gate', s, s > 30 ? 2.2 : -2.2); ctx.addVase(p.x, p.z, s > 30 ? [1, 2] : [1, 1, 1], ctx.h(p.x, p.z)); }
}

// ---- the Echo Hall: a round room with a skylight and a ring of stones under it ----------------------------------------------------------------
function hall(ctx) {
  const { gp, put } = ctx;
  const H = CHAMBERS.hall;
  const at = (deg, r) => [H.x + Math.cos(deg * TAU / 360) * r, H.z + Math.sin(deg * TAU / 360) * r];
  // the beam: daylight pouring down the shaft in the roof onto the stones
  put('light_shaft', H.x, H.z, { h: 13.5, r0: 2.2, r1: 3.3 }, 0);
  put('standing_stones', H.x, H.z, { r: 5.2, count: 7, glowColor: [1.0, 0.92, 0.7] }, 7);
  for (const deg of [45, 135, 225, 315, 270, 200]) { const [x, z] = at(deg, 11.6); put('torch_stand', x, z, {}, 1.2); }
  for (const [deg, color, r] of [[245, 'violet', 10.8], [292, 'cyan', 10.8], [335, 'violet', 11.2], [160, 'cyan', 11.2]]) { const [x, z] = at(deg, r); put('crystal_cluster', x, z, { rot: deg, color, count: 6 }, 2.6); }
  for (const [deg, color] of [[262, 'cyan'], [308, 'violet']]) { const [x, z] = at(deg, 12.2); put('crystal_spire', x, z, { color, h: 7 }, 2.4); }
  // a ring of gems round the stones, a purple one on the middle stone's far side
  for (let i = 0; i < 10; i++) { const [x, z] = at(i * 36 + 18, 8.2); ctx.addGem(x, z, i % 5 === 0 ? 2 : 1); }
  for (const [deg, g] of [[105, [1, 2]], [200, [5]], [340, [1, 1, 2]]]) { const [x, z] = at(deg, 9.6); ctx.addVase(x, z, g, ctx.h(x, z)); }
  hint(ctx, H.x, H.z, CRAG_Y, 14, 'THE ECHO HALL. WEST, THE WINDING WAY DOWN TO THE FROST GROTTO. EAST, THE PASSAGE TO THE CANYON ROAD', 8);
  gp.soundSources.push({ name: 'portal_hum', x: H.x, y: CRAG_Y + 2, z: H.z, range: 22, vol: 0.35 });
}

// ---- the crystal vault: a short passage north out of the hall, shut with a cracked wall; behind it a little round room full of crystals and a chest ---------------------------
function vault(ctx) {
  const { gp, put } = ctx;
  const V = CHAMBERS.vault, at = (a, r) => [V.x + Math.cos(a * TAU / 360) * r, V.z + Math.sin(a * TAU / 360) * r];
  const m = tunnelAt('vault', 5.5);
  ctx.addWall(m.x, m.z, m.yaw, 7.0, 5.7, [25]);
  hint(ctx, tunnelAt('vault', 0).x, tunnelAt('vault', 0).z + 3, CRAG_Y, 8, 'A CRACKED WALL SHUTS THIS PASSAGE... TRY CHARGING IT', 6);
  // behind the wall: crystals all round, a tall spire in the middle, the chest at the far side
  for (const [deg, color, size] of [[10, 'violet', 1.0], [60, 'cyan', 1.1], [110, 'violet', 0.9], [160, 'cyan', 1.0], [200, 'violet', 1.1], [250, 'cyan', 1.0], [290, 'violet', 1.0], [335, 'cyan', 1.1]]) {
    const [x, z] = at(deg, 5.4);
    if (Math.hypot(x - m.x, z - m.z) > 3.5 || deg > 100) put('crystal_cluster', x, z, { rot: deg, color, count: 5, size }, 2.2);
  }
  put('crystal_spire', V.x + 0.4, V.z + 0.4, { color: 'cyan', h: 7.5 }, 2.6);
  const cx = V.x - 0.6, cz = V.z - 4.2;
  gp.chests.push({ x: cx, y: ctx.h(cx, cz), z: cz, yaw: face(cx, cz, V.x, V.z + 6), gems: [10, 10, 5], secret: 'vault' });
  gp.purple.push([V.x + 3.2, ctx.h(V.x + 3.2, V.z + 1) + 1.3, V.z + 1]);
  for (let i = 0; i < 8; i++) { const [x, z] = at(i * 45 + 20, 3.1); ctx.addGem(x, z, 1); }
}

// ---- the winding way down ------------------------------------------------------------------------------------------------------------------
function stair(ctx) {
  torchesAlong(ctx, 'stair', 12, 3);
  crystalsIn(ctx, 'stair', [[8, 3.2, 'violet', 5], [22, -3.2, 'cyan', 4], [36, 3.4, 'violet', 6], [50, -3.4, 'cyan', 5], [62, 3.2, 'violet', 4]]);
  gemsAlong(ctx, 'stair', 5, [1, 1, 2, 1]);
  for (const s of [20, 44, 60]) { const p = tunnelAt('stair', s, s === 44 ? 2.0 : -2.0); ctx.addVase(p.x, p.z, s === 44 ? [2, 5] : [1, 1, 1], ctx.h(p.x, p.z)); }
}

// ---- the Frost Grotto and the Frostbloom door ------------------------------------------------------------------------------------------------
function grotto(ctx) {
  const { gp, put } = ctx;
  const G = CHAMBERS.grotto, fd = DOORS.find((d) => d.id === 'frostbloom');
  const cs = Math.cos(G.rot), sn = Math.sin(G.rot);
  /** a place in the grotto by its own axes: u (-1..1 along its length), v (-1..1 across), as a share of the radii */
  const at = (u, v) => [G.x + (u * G.rx) * cs - (v * G.rz) * sn, G.z + (u * G.rx) * sn + (v * G.rz) * cs];
  // the door's court: pale crystals either side, a ring of braziers further out
  for (const side of [-1, 1]) {
    put('crystal_spire', ...inFront(fd, 4.2, side * 6.4), { color: 'cyan', h: 7 }, 3);
    put('torch_stand', ...inFront(fd, 8.5, side * 4.6), { rot: fd.yaw }, 1.2);
  }
  put('crystal_cluster', ...inFront(fd, 2.6, -9.4), { color: 'cyan', count: 6, size: 1.2 }, 3);
  put('crystal_cluster', ...inFront(fd, 2.6, 9.4), { color: 'cyan', count: 6, size: 1.2 }, 3);
  // the hall's rim: crystals round the walls, cold and many, the way in (west) and the way out (north-east) left clear
  const rim = [[0.0, -0.8, 'cyan', 6, 1.3], [0.38, -0.74, 'violet', 5, 1], [0.7, -0.52, 'cyan', 5, 1.2], [0.8, 0.5, 'cyan', 6, 1.2], [0.5, 0.78, 'violet', 5, 1], [0.05, 0.82, 'cyan', 6, 1.3],
    [-0.4, 0.78, 'cyan', 5, 1.2], [-0.78, 0.45, 'violet', 5, 1], [-0.74, -0.5, 'cyan', 5, 1.1], [-0.4, -0.78, 'violet', 4, 1]];
  for (const [u, v, color, count, size] of rim) { const [x, z] = at(u, v); put('crystal_cluster', x, z, { rot: u * 9 + v * 5, color, count, size }, 3); }
  for (const [u, v, color, h] of [[0.05, 0.6, 'cyan', 8], [-0.5, 0.58, 'cyan', 7], [0.62, 0.55, 'violet', 6.5], [-0.5, -0.62, 'violet', 6.5]]) { const [x, z] = at(u, v); put('crystal_spire', x, z, { color, h }, 3); }
  // toadstools in the damp corners
  for (const [u, v] of [[-0.62, -0.62], [0.3, 0.7], [-0.2, -0.76]]) { const [x, z] = at(u, v); put('mushroom_cluster', x, z, { count: 7 }, 2); }
  // gems: round the middle spires, and an arc over the way to the door
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, [x, z] = at(Math.cos(a) * 0.3 + 0.02, Math.sin(a) * 0.32 + 0.05); ctx.addGem(x, z, i % 5 === 0 ? 2 : 1); }
  const [ax, az] = at(-0.55, 0), [bx, bz] = at(0.1, 0.1), [cx, cz] = inFront(fd, 6.5);
  ctx.gemArc([[ax, ctx.h(ax, az) + 1.2, az], [bx, ctx.h(bx, bz) + 3.6, bz], [cx, ctx.h(cx, cz) + 1.2, cz]], 9, [1, 1, 2]);
  for (const [u, v, g] of [[-0.3, -0.5, [1, 1, 2]], [0.4, 0.35, [2, 5]], [-0.5, 0.2, [1, 1, 1]]]) { const [x, z] = at(u, v); ctx.addVase(x, z, g, ctx.h(x, z)); }
  hint(ctx, G.x, G.z, G.floorY, 16, 'THE FROST GROTTO. THE FROSTBLOOM DOOR SHINES AT THE FAR END. THE PASSAGE NORTH LEADS OUT TO THE ASCENT', 8);
  gp.soundSources.push({ name: 'portal_hum', x: G.x, y: G.floorY + 3, z: G.z, range: 26, vol: 0.3 });
}

// ---- the north passage: out of the grotto, up to the Ascent ----------------------------------------------------------------------------------
function north(ctx) {
  torchesAlong(ctx, 'north', 11, 3);
  crystalsIn(ctx, 'north', [[8, -3.0, 'cyan', 5], [17, 3.2, 'violet', 4], [27, -3.2, 'cyan', 5]]);
  gemsAlong(ctx, 'north', 5, [1, 2, 1, 1]);
}

// ---- the east passage: out of the hall to the canyon road ------------------------------------------------------------------------------------------
function east(ctx) {
  const { put } = ctx;
  torchesAlong(ctx, 'east', 11, 3);
  crystalsIn(ctx, 'east', [[9, 3.1, 'violet', 5], [19, -3.1, 'cyan', 4], [30, 3.2, 'cyan', 5]]);
  gemsAlong(ctx, 'east', 5.5, [1, 1, 2]);
  // the way out: two braziers where the cliff ends
  for (const side of [-1, 1]) { const p = tunnelAt('east', 24, side * (tunnelAt('east', 24).hw + 1.4)); put('torch_stand', p.x, p.z, {}, 1.2); }
}

// ---- the ledge road ----------------------------------------------------------------------------------------------------------------------------
function ledge(ctx) {
  const { gp, put } = ctx;
  const pts = alongRamp(1);
  const q0 = pts[0];
  // its start: a rock arch over the road where the mountain begins, a signpost, and the first lamps
  const a = alongRamp(1, 22, 23)[0];
  if (a) put('rock_arch', a.x, a.z, { rot: a.yaw, w: 10.5, h: 8, y: a.y }, 6);
  put('torch_stand', ...leftOf(q0, 5.4), { y: q0.y }, 1.2);
  hint(ctx, q0.x, q0.z, q0.y, 12, 'THE STONE ROAD WINDS ROUND THE CRAG ALL THE WAY TO THE SUMMIT. GOOD LUCK!', 7);
  // lamps along the outer edge, a bench and a banner at each bend where the view opens
  let k = 0;
  for (const q of alongRamp(19, 34, 205)) {
    const [x, z] = leftOf(q, q.hw - 0.9);
    put(k % 4 === 3 ? 'torch_stand' : 'lamp_post', x, z, { rot: face(x, z, q.x, q.z), y: q.y }, 1);
    k++;
  }
  for (const s of [78, 128, 178]) {
    const q = alongRamp(1, s, s + 1)[0];
    if (!q) continue;
    const [x, z] = leftOf(q, q.hw - 1.6);
    put('bench', x, z, { rot: face(x, z, q.x, q.z) + Math.PI, y: q.y }, 1.6);
    const [bx, bz] = leftOf(q, q.hw - 0.9);
    put('banner_pole', bx + q.dx * 3.4, bz + q.dz * 3.4, { rot: q.yaw + Math.PI / 2, y: q.y }, 1);
  }
  // crystals growing from the cliff side, here and there
  for (const s of [52, 96, 142, 190]) {
    const q = alongRamp(1, s, s + 1)[0];
    if (!q) continue;
    const [x, z] = leftOf(q, -(q.hw - 1.6));
    put('crystal_cluster', x, z, { rot: s, color: s % 2 ? 'cyan' : 'violet', count: 4, y: q.y, size: 0.9 }, 2);
  }
  // the gems climb the road: a long line along its middle, a gold one at every quarter turn
  let g = 0;
  for (const q of alongRamp(8.5, 8, 232)) ctx.addGem(q.x, q.z, g++ % 5 === 4 ? 5 : g % 3 === 0 ? 2 : 1, q.y + 0.95);
  for (const s of [60, 110, 160, 206]) { const q = alongRamp(1, s, s + 1)[0]; if (q) { const [x, z] = leftOf(q, 1.4); ctx.addVase(x, z, [2, 5], q.y); } }
}

// ---- the summit: the Skyweaver door and the Crag's last secret ------------------------------------------------------------------------------------
function summit(ctx) {
  const { gp, put } = ctx;
  const sd = DOORS.find((d) => d.id === 'skyweaver');
  for (const side of [-1, 1]) {
    put('torch_stand', ...inFront(sd, 5.4, side * 5.4), { rot: sd.yaw, y: SUMMIT.y }, 1.2);
    put('crystal_spire', ...inFront(sd, 1.6, side * 8.6), { color: side < 0 ? 'cyan' : 'violet', h: 8, y: SUMMIT.y }, 3);
    put('banner_pole', ...inFront(sd, 9.5, side * 9.6), { rot: sd.yaw + side * Math.PI / 2, y: SUMMIT.y }, 1);
  }
  // the chest on the rim, facing the view; a purple gem beside it
  const cx = SUMMIT.x - 7.6, cz = SUMMIT.z - 5.2;
  gp.chests.push({ x: cx, y: SUMMIT.y, z: cz, yaw: face(cx, cz, SUMMIT.x + 4, SUMMIT.z + 8), gems: [10, 10, 5], secret: 'summit' });
  gp.purple.push([cx + 2.4, SUMMIT.y + 1.3, cz + 1.4]);
  put('crystal_cluster', cx - 2.8, cz - 1.4, { color: 'violet', count: 6, y: SUMMIT.y }, 2.4);
  hint(ctx, SUMMIT.x, SUMMIT.z, SUMMIT.y, 14, 'THE SUMMIT! ALL OF DAWNHAVEN LIES BELOW. THE SKYWEAVER DOOR IS SEALED, FOR NOW', 8);
  void TUNNELS;
}
