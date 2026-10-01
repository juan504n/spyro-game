// Debug readout test (no browser, no dev server): builds the level headlessly and checks debuginfo.js against independent computations.
//   node tools/debuginfo-test.mjs
//   - compass / clock positions / named areas
//   - the ground texture the readout reports is the texture of the terrain mesh triangle that is actually under the point
//   - the aim ray (ground, colliders, water, sky), the nearest prop / collider / gameplay object (against brute force)
//   - provenance: every placed prop, collider and gameplay record says which layout function made it
//   - the rows: the POS line is the player's position, the source tags are there, compact and full differ as they should
import { buildHeadless } from './headless-world.mjs';
import { LEVEL, WATER_LEVEL } from '../src/game/level.js';
import { buildTerrainMeshes } from '../src/game/terrain-mesh.js';
import { buildRoads } from '../src/game/roads.js';
import * as D from '../src/game/debuginfo.js';

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---- the world, headlessly (both passes: the floating isles' colliders are in it, as in the game) ---------------------------------------
const { grid, lighting, kit, dryCtx, collision, gp } = buildHeadless();
const player = { x: 0, y: grid.heightAt(0, 140) + 0.05, z: 140, yaw: 0, vx: 0, vy: 0, vz: 0, grounded: true, groundKind: 'terrain', gliding: false, hurtT: 0, chargeT: 0, flameT: 0, dead: false, inWater: false };
const game = { grid, collision, gameplay: gp, level: LEVEL, player };

// ---- compass, clock, areas ------------------------------------------------------------------------------------------------------------
{
  const c = (y) => D.compass(y);
  check('compass: yaw 0 faces +z = south, pi = north, +-pi/2 = east / west', c(0) === 'S' && c(Math.PI) === 'N' && c(Math.PI / 2) === 'E' && c(-Math.PI / 2) === 'W' && c(Math.PI / 4) === 'SE', `(${[0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4].map(c).join(' ')})`);
  check('heading: north is 0, east 90, south 180, west 270', near(D.heading(Math.PI), 0, 1e-9) && near(D.heading(Math.PI / 2), 90, 1e-9) && near(D.heading(0), 180, 1e-9) && near(D.heading(-Math.PI / 2), 270, 1e-9));
  // facing south (+z): straight ahead is +z, his right hand is west (-x), so east (+x) is on his left
  const k = (yaw, dx, dz) => D.clock(yaw, 0, 0, dx, dz);
  check('clock: ahead 12, right (west when facing south) 3, behind 6, left (east) 9', k(0, 0, 5) === 12 && k(0, -5, 0) === 3 && k(0, 0, -5) === 6 && k(0, 5, 0) === 9, `(${[k(0, 0, 5), k(0, -5, 0), k(0, 0, -5), k(0, 5, 0)].join(' ')})`);
  check('clock: turning him turns it (facing east, north is on his left)', k(Math.PI / 2, 0, -5) === 9 && k(Math.PI / 2, 0, 5) === 3 && k(Math.PI / 2, 5, 0) === 12);
  const A = (x, z, y) => D.areaAt(LEVEL, x, z, y);
  check('area: village, portal, summit, gate', A(0, 138).name === 'HEARTH VILLAGE' && A(0, 172).name === 'REALM PORTAL' && A(0, -132).name === 'NORTH MOUNTAIN' && A(0, -90).name === 'DAWN GATE', `(${[A(0, 138), A(0, 172), A(0, -132), A(0, -90)].map((a) => a.name).join(', ')})`);
  check('area: the shrine isle is inside Mirrormere, the lake around it is Mirrormere', A(-4, 27).name === 'SHRINE ISLE' && A(-4, 62).name === 'MIRRORMERE' && A(-4, 62).inside, `(${A(-4, 27).name}, ${A(-4, 62).name})`);
  check('area: a sky isle only counts up on the isle, not on the ground below it', A(-126, 8, 30).name === 'SKY ISLE 1' && A(-126, 8, 3).name !== 'SKY ISLE 1', `(${A(-126, 8, 30).name} / ${A(-126, 8, 3).name})`);
  const far = A(150, 150);
  check('area: outside every place it names the nearest, with the distance', !far.inside && far.d > 0 && typeof far.name === 'string', `(${far.name}, ${Math.round(far.d)} m)`);
}

// ---- the ground texture is the mesh's texture ---------------------------------------------------------------------------------------
{
  const meshes = buildTerrainMeshes(grid, lighting, { mat: (n) => ({ name: n }) }).group.children;
  const tris = [];      // every triangle of every terrain mesh, projected to the ground plane
  for (const m of meshes) {
    const P = m.geometry.getAttribute('position').array;
    for (let i = 0; i < P.length; i += 9) tris.push({ tex: m.name.slice('terrain:'.length), ax: P[i], az: P[i + 2], bx: P[i + 3], bz: P[i + 5], cx: P[i + 6], cz: P[i + 8], y: (P[i + 1] + P[i + 4] + P[i + 7]) / 3 });
  }
  // deterministic scattered sample (not on grid lines, where two triangles meet)
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  let tested = 0, wrong = 0, ambiguous = 0, none = 0;
  const seen = {}, why = {};
  const bucket = new Map();
  for (const t of tris) {                               // (a spatial hash so 400 samples do not scan 130k triangles each)
    const x0 = Math.floor(Math.min(t.ax, t.bx, t.cx) / 8), x1 = Math.floor(Math.max(t.ax, t.bx, t.cx) / 8), z0 = Math.floor(Math.min(t.az, t.bz, t.cz) / 8), z1 = Math.floor(Math.max(t.az, t.bz, t.cz) / 8);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const k = i * 4096 + j; let a = bucket.get(k); if (!a) bucket.set(k, (a = [])); a.push(t); }
  }
  const inTri = (t, x, z) => {
    const d = (t.bz - t.cz) * (t.ax - t.cx) + (t.cx - t.bx) * (t.az - t.cz);
    const u = ((t.bz - t.cz) * (x - t.cx) + (t.cx - t.bx) * (z - t.cz)) / d, v = ((t.cz - t.az) * (x - t.cx) + (t.ax - t.cx) * (z - t.cz)) / d;
    return u > 1e-4 && v > 1e-4 && 1 - u - v > 1e-4;
  };
  for (let n = 0; n < 1500; n++) {
    const x = (rnd() - 0.5) * 380, z = (rnd() - 0.5) * 380;
    const hits = (bucket.get(Math.floor(x / 8) * 4096 + Math.floor(z / 8)) || []).filter((t) => inTri(t, x, z));
    if (hits.length === 0) { none++; continue; }
    if (hits.length > 1) { ambiguous++; continue; }
    tested++;
    const g = D.groundAt(grid, x, z);
    seen[g.tex] = (seen[g.tex] || 0) + 1;
    why[g.why] = (why[g.why] || 0) + 1;
    if (g.tex !== hits[0].tex) { wrong++; if (wrong < 4) console.log('  mismatch at', x.toFixed(2), z.toFixed(2), 'readout', g.tex, 'mesh', hits[0].tex); }
  }
  check('the readout names the texture of the terrain triangle under the point', tested > 1200 && wrong === 0, `(${tested} points, ${wrong} wrong, ${ambiguous} on an edge, ${none} outside the mesh)`);
  check('... and it did so across the realm (many textures and many rules were exercised)', Object.keys(seen).length >= 8 && Object.keys(why).length >= 10, `(${Object.keys(seen).length} textures: ${Object.keys(seen).join(' ')}; ${Object.keys(why).length} rules)`);
}

// ---- the road drawn over the ground ---------------------------------------------------------------------------------------------------------
// A road is a ribbon laid over the terrain (roads.js), so standing on one the ground the readout names is the road, over whatever texture the terrain has there. The road the readout reports is
// checked against the ribbon mesh itself: a point is on a road exactly when a triangle of it covers the point (only the pieces left out for being on a steep bank or under water can differ, at their edges).
{
  const roads = buildRoads(grid, lighting);
  const T = [], CS = 6, hash = new Map();
  for (const surface of ['cobble', 'dirt']) {
    const b = roads[surface];
    if (!b) continue;
    for (let i = 0; i < b.pos.length; i += 9) T.push({ surface, A: [b.pos[i], b.pos[i + 2]], B: [b.pos[i + 3], b.pos[i + 5]], C: [b.pos[i + 6], b.pos[i + 8]] });
  }
  T.forEach((t, ti) => { const xs = [t.A[0], t.B[0], t.C[0]], zs = [t.A[1], t.B[1], t.C[1]]; for (let cx = Math.floor(Math.min(...xs) / CS); cx <= Math.floor(Math.max(...xs) / CS); cx++) for (let cz = Math.floor(Math.min(...zs) / CS); cz <= Math.floor(Math.max(...zs) / CS); cz++) { const k = cx + ',' + cz; if (!hash.has(k)) hash.set(k, []); hash.get(k).push(ti); } });
  const cover = (x, z) => {
    let hit = null;
    for (const ti of hash.get(Math.floor(x / CS) + ',' + Math.floor(z / CS)) || []) {
      const { A, B, C, surface } = T[ti], d = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
      const w0 = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (z - C[1])) / d, w1 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (z - C[1])) / d;
      if (w0 > 0 && w1 > 0 && 1 - w0 - w1 > 0) hit = hit === 'cobble' ? hit : surface;
    }
    return hit;
  };
  let seed = 4242; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  let n = 0, agree = 0, onRoad = 0, wrongKind = 0;
  for (const p of grid.paths) {
    if (p.surface === 'flagstone') continue;
    for (let k = 0; k < 250; k++) {
      const q = p.pts[Math.floor(rnd() * p.pts.length)], a = rnd() * 6.283, hw = p.width / 2, r = rnd() < 0.5 ? rnd() * hw * 0.8 : hw * 1.25 + rnd() * hw;        // (well inside the road or well outside it: the edge itself is not the point)
      const x = q[0] + Math.cos(a) * r, z = q[2] + Math.sin(a) * r;
      const g = D.groundAt(grid, x, z), c = cover(x, z);
      n++;
      if ((g.drawn !== null) === (c !== null)) agree++;
      if (g.drawn) { onRoad++; if (c && g.drawn.surface !== c) wrongKind++; }
    }
  }
  check('the readout reports the road drawn over the ground exactly where a triangle of the road mesh covers the point', n > 2000 && agree >= n * 0.99 && onRoad > 1000 && wrongKind === 0, `(${n} points near roads, ${agree} agree, ${onRoad} on a road, ${wrongKind} of the wrong kind)`);
  const onMain = D.groundAt(grid, 0, 112), beside = D.groundAt(grid, 9, 112);
  const fmt = (g) => D.format({ build: 'test', pos: { x: 0, y: 0, z: 0 }, compass: 'N', heading: 0, speed: 0, state: 'idle', grounded: true, area: { name: 'X', inside: true, d: 0 }, ground: g, stand: { kind: 'terrain' }, props: [], things: [], colliders: [], hints: [], aim: null, extra: {}, yaw: 0 }, 1).find((r) => r.tag === 'FLOOR').text;
  check('FLOOR says so: "cobble road main, over <the ground>" on the main road, the plain ground beside it', /^cobble road main, over /.test(fmt(onMain)) && !/road/.test(fmt(beside).replace(/under a road/, '')), `(${fmt(onMain)} | ${fmt(beside)})`);

  // "road east" in the AREA row is the nearest ribbon, and a ribbon ends in a flat edge: the readout used to take the carve's distance field, which has a round cap past every end, and said
  // "(on it)" 2.5 m beyond the end of the east road, where nothing is drawn (a screenshot at the foot of Windmill Hill: "road east" over a steep cliff).
  const P = grid.paths.find((q) => q.id === 'east'), e = P.pts[P.pts.length - 1], b = P.pts[P.pts.length - 2];
  const dl = Math.hypot(e[0] - b[0], e[2] - b[2]), ux = (e[0] - b[0]) / dl, uz = (e[2] - b[2]) / dl;
  const at = (a, sd) => D.groundAt(grid, e[0] + ux * a - uz * sd, e[2] + uz * a + ux * sd);
  const onEnd = at(-0.8, 0), past = at(2.0, 0), pastSide = at(2.0, 4), farther = at(3.0, 0);
  check('on a road the readout says "on it" (the nearest ribbon is under the point); past the road\'s flat end it measures the distance to that edge (not 0 under the old round cap)', onEnd.road && onEnd.road.id === 'east' && onEnd.road.d < 0.01 && past.road && past.road.id === 'east' && near(past.road.d, 2.0, 0.05) && farther.road && farther.road.id === 'east' && near(farther.road.d, 3.0, 0.05), `(0.8 m before the end: ${onEnd.road && onEnd.road.d.toFixed(2)} m; 2.0 m past: ${past.road && past.road.d.toFixed(2)} m; 3.0 m past: ${farther.road && farther.road.d.toFixed(2)} m)`);
  check('... and beside it, past the end and off to the side, the distance is the straight line to the ribbon\'s corner', pastSide.road && pastSide.road.d > 2.0 && pastSide.road.d < 4.1, `(${pastSide.road && pastSide.road.d.toFixed(2)} m)`);
  const pl = grid.paths.find((q) => q.surface === 'flagstone'), pc = pl.pts[0];
  const forecourt = D.groundAt(grid, pc[0], pc[2]);
  check('a paved forecourt (the terrain\'s own paving, no ribbon) is still reported as the nearest road, from the carve\'s distance field', forecourt.road && forecourt.road.surface === 'flagstone' && forecourt.road.d < 0.5, `(${forecourt.road && forecourt.road.id} ${forecourt.road && forecourt.road.d.toFixed(2)})`);
}

// ---- the aim ray ---------------------------------------------------------------------------------------------------------------------------
{
  const ray = (o, d) => { const l = Math.hypot(d.x, d.y, d.z); return D.castRay(game, o, { x: d.x / l, y: d.y / l, z: d.z / l }); };
  // straight down onto the village green
  let r = ray({ x: 14, y: 30, z: 165 }, { x: 0, y: -1, z: 0 });
  check('ray down hits the ground at the ground height', r.kind === 'terrain' && near(r.y, grid.heightAt(14, 165), 0.02) && near(r.t, 30 - grid.heightAt(14, 165), 0.05), `(${r.kind} y ${r.y.toFixed(2)} vs ${grid.heightAt(14, 165).toFixed(2)}, ${r.tex})`);
  // a house: shoot at its wall from the plaza side
  const house = gp.placed.find((p) => p.name === 'house_cottage');
  r = ray({ x: house.x, y: house.y + 2.5, z: house.z + 30 }, { x: 0, y: 0, z: -1 });
  check('ray at a house hits its collider, and the collider knows the prop and the layout', r.kind === 'collider' && r.c.prop && r.c.prop.name === 'house_cottage' && r.c.prop.src === 'layoutVillage', `(${r.kind}, ${r.c && r.c.prop && r.c.prop.name} [${r.c && r.c.prop && r.c.prop.src}] at ${r.t.toFixed(1)} m)`);
  // into the lake
  r = ray({ x: -30, y: 12, z: 26 }, { x: 0.2, y: -1, z: 0.3 });
  check('ray into the lake stops at the water surface', r.kind === 'water' && near(r.y, WATER_LEVEL, 1e-9), `(${r.kind} at y ${r.y})`);
  const pier = gp.placed.find((p) => p.name === 'pier');
  r = ray({ x: pier.x, y: 12, z: pier.z - 6 }, { x: 0, y: -1, z: 0 });
  check('... but a pier over the water is a collider, not water', r.kind === 'collider' && r.c.prop && r.c.prop.name === 'pier', `(${r.kind} ${r.c && r.c.prop && r.c.prop.name})`);
  r = ray({ x: 0, y: 10, z: 100 }, { x: 0, y: 1, z: 0 });
  check('ray at the sky hits nothing', r.kind === 'none');
  // a flat prop (no collider) is found along the ray
  const flower = gp.placed.find((p) => p.name === 'flower_patch');
  const o = { x: flower.x, y: flower.y + 6, z: flower.z + 12 }, dv = { x: 0, y: -0.5, z: -1 }, l = Math.hypot(dv.x, dv.y, dv.z);
  const q = D.propOnRay(gp.placed, o, { x: dv.x / l, y: dv.y / l, z: dv.z / l }, 40);
  check('a ray through a collider-less prop names it (propOnRay)', q && q.rec && Math.hypot(q.rec.x - flower.x, q.rec.z - flower.z) < 30, `(${q && q.rec.name} at ${q && q.rec.x.toFixed(0)}, ${q && q.rec.z.toFixed(0)})`);
}

// ---- nearest things, against brute force -----------------------------------------------------------------------------------------------------
{
  let seed = 777; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  let bad = 0, badC = 0, N = 120;
  for (let n = 0; n < N; n++) {
    const x = (rnd() - 0.5) * 340, z = (rnd() - 0.5) * 340;
    let best = Infinity;
    for (const r of gp.placed) best = Math.min(best, Math.max(0, Math.hypot(r.x - x, r.z - z) - (r.size || 2) / 2));
    const got = D.nearestProps(gp.placed, x, z, 1, 1e9)[0];
    if (!got || !near(got.d, best, 1e-9)) bad++;
    let cb = Infinity;
    for (const c of collision.colliders) cb = Math.min(cb, D.colliderDist(c, x, z));
    const gc = D.nearestColliders(collision, x, z, 1, 1e9)[0];
    // (the hash only looks one cell around: when nothing is within ~8 m it may report a farther one or none; only check when something is close)
    if (cb < 6 && (!gc || !near(gc.d, cb, 1e-9))) badC++;
  }
  check('nearestProps matches a brute-force search', bad === 0, `(${N} points, ${bad} wrong)`);
  check('nearestColliders matches a brute-force search (when something is within 6 m)', badC === 0, `(${badC} wrong)`);
  // height counts: on Sky Isle 2 (from a real bug report's screenshot) the nearest props are the isle's own, not the meadow trees on the ground 30 m below it
  const isle = { x: -129.83, y: 34.06, z: -38.73 };
  const up = D.nearestProps(gp.placed, isle.x, isle.z, 4, 60, isle.y);
  check('on a floating isle the nearest props are the isle\'s own (not the ground props 30 m below)', up.length > 0 && up.every((q) => q.rec.src === 'buildIslands'), `(${up.map((q) => `${q.rec.name} [${q.rec.src}] ${q.d.toFixed(1)} m`).join(', ')})`);
  const flat = D.nearestProps(gp.placed, isle.x, isle.z, 1, 60)[0];
  check('... whereas ignoring height finds a ground prop underneath (what the readout used to say)', flat && flat.rec.src !== 'buildIslands', `(${flat && flat.rec.name} [${flat && flat.rec.src}])`);
  const below = D.nearestColliders(collision, isle.x, isle.z, 3, 14, grid.heightAt(isle.x, isle.z));
  check('on the ground below an isle its underside is not "next to" you', below.every((q) => q.c.prop === undefined || q.c.prop.name !== 'floating_island'), `(${below.map((q) => `${q.c.prop ? q.c.prop.name : q.c.tag} ${q.d.toFixed(1)} m`).join(', ')})`);
  const onIsle = D.nearestColliders(collision, isle.x, isle.z, 1, 14, isle.y)[0];
  check('... and on the isle the isle itself is what you stand on (0 m)', onIsle && onIsle.c.prop && onIsle.c.prop.name === 'floating_island' && onIsle.d < 0.1, `(${onIsle && onIsle.c.prop && onIsle.c.prop.name} ${onIsle && onIsle.d.toFixed(2)} m)`);
  const chest = gp.chests.find((c) => Math.hypot(c.x - LEVEL.island.x, c.z - LEVEL.island.z) < 12);
  const t = D.nearestThings(game, chest.x + 1, chest.y, chest.z, 1)[0];
  check('nearestThings finds a chest and says which layout placed it', t && t.kind === 'chest' && t.src === 'layoutLake', `(${t && t.kind} [${t && t.src}] ${t && t.d.toFixed(1)} m)`);
}

// ---- provenance --------------------------------------------------------------------------------------------------------------------------------
{
  const STAGES = new Set(['layoutVillage', 'layoutLake', 'layoutRiver', 'layoutRuins', 'layoutWindmill', 'layoutSkyIsles', 'layoutHollow', 'layoutNorth', 'layoutFauna', 'scatterWorld', 'finalizeGems', 'populate', 'buildIslands']);
  const unlabelled = gp.placed.filter((p) => !STAGES.has(p.src));
  check('every placed prop says which layout function placed it', gp.placed.length > 800 && unlabelled.length === 0, `(${gp.placed.length} props, ${unlabelled.length} unlabelled)`);
  const bare = kit.colliders.filter((c) => !c.prop || !STAGES.has(c.prop.src));
  check('every prop collider knows its prop and layout', kit.colliders.length > 800 && bare.length === 0, `(${kit.colliders.length} colliders, ${bare.length} without)`);
  const lists = ['gems', 'vases', 'chests', 'walls', 'braziers', 'mushrooms', 'enemies', 'bunnies', 'npcs', 'hints', 'beacons', 'islands'];
  const missing = [];
  for (const k of lists) for (const r of gp[k]) if (!STAGES.has(r.src)) missing.push(`${k}:${JSON.stringify(r).slice(0, 60)}`);
  check('every gameplay record (chests, vases, enemies, hints, gems, beacons ...) says where it came from', missing.length === 0, `(${missing.length} without: ${missing.slice(0, 3).join(' | ')})`);
  const byStage = {}; for (const p of gp.placed) byStage[p.src] = (byStage[p.src] || 0) + 1;
  check('the level script is split into the expected stages', ['layoutVillage', 'layoutLake', 'layoutWindmill', 'layoutNorth', 'scatterWorld'].every((s) => byStage[s] > 0), `(${JSON.stringify(byStage)})`);
  // one record per placement: the wet pass (which runs the same code again) must not add its own
  const placements = Object.values(dryCtx.counts).reduce((a, b) => a + b, 0);
  check('placements are recorded once each (the wet pass is not recorded)', gp.placed.length === placements, `(${gp.placed.length} records, ${placements} placements)`);
}

// ---- the rows ------------------------------------------------------------------------------------------------------------------------------------
{
  const pos = (x, z, yaw = 0.3) => { player.x = x; player.z = z; player.y = grid.heightAt(x, z) + 0.05; player.yaw = yaw; };
  pos(-17, 131);
  const pose = { ox: -17, oy: player.y + 3, oz: 125, dx: 0, dy: -0.2, dz: 0.98 };
  const l = Math.hypot(pose.dx, pose.dy, pose.dz); pose.dx /= l; pose.dy /= l; pose.dz /= l;
  const data = D.collect(game, { pose, errorCount: 0 });
  const compact = D.format(data, 1), full = D.format(data, 2);
  const text = D.toText(compact);
  const row = (rows, tag) => (rows.find((r) => r.tag === tag) || {}).text || '';
  check('POS row is the player position to two decimals', row(compact, 'POS') === `X ${player.x.toFixed(2)}  Y ${player.y.toFixed(2)}  Z ${player.z.toFixed(2)}`, `(${row(compact, 'POS')})`);
  check('rows: the build, the facing, the area, the floor, the aim', ['DEBUG', 'FACE', 'AREA', 'FLOOR', 'AIM'].every((t) => row(compact, t)), `(${compact.map((r) => r.tag).join(' ')})`);
  check('rows name the layout function that placed what is nearby', /\[layout[A-Za-z]+\]/.test(text), `(${text.split('\n').find((s) => /\[layout/.test(s))})`);
  check('FLOOR names the rule behind the texture', /\(default grass\)|\(under a road\)|\(village plaza\)/.test(row(compact, 'FLOOR')), `(${row(compact, 'FLOOR')})`);
  check('full mode adds rows only when the extras are given, compact never lists them', full.length >= compact.length && !compact.some((r) => ['CAM', 'INPUT', 'PERF', 'GAME'].includes(r.tag)));
  const fx = D.format(D.collect(game, { pose, errorCount: 2, game: 'g', cam: 'c', input: 'i', perf: 'p', gpu: 'u', view: 'v', errors: ['error: boom'] }), 2);
  check('full mode shows game, camera, input, performance, view and the errors', ['GAME', 'CAM', 'INPUT', 'PERF', 'GPU', 'VIEW', 'ERR'].every((t) => row(fx, t)), `(${fx.map((r) => r.tag).join(' ')})`);
  const ce = D.format(D.collect(game, { pose, errorCount: 3 }), 1);
  check('compact mode flags that errors were logged', /3 errors/.test(row(ce, 'ERR')), `(${row(ce, 'ERR')})`);
  pos(0, 96);
  const d2 = D.collect(game, { pose: { ox: 0, oy: 60, oz: 96, dx: 0, dy: -1, dz: 0 } });
  check('collect reads the state and the road from the level (main road at the village edge)', d2.state === 'idle' && d2.ground.road && d2.ground.road.id === 'main', `(state ${d2.state}, road ${d2.ground.road && d2.ground.road.id})`);
  player.grounded = false; player.vy = 5;
  check('playerState: rising / falling / gliding / charging', D.playerState(player) === 'rise' && (player.vy = -3, D.playerState(player)) === 'fall' && (player.gliding = true, D.playerState(player)) === 'glide' && (player.gliding = false, player.chargeT = 1, D.playerState(player)) === 'charge');
}

console.log(failed ? `\n${failed} FAILED` : '\nall debug readout checks passed');
process.exit(failed ? 1 : 0);
