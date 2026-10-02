// Dawnhaven (the homeworld) checked headlessly: both level passes run without a GPU and the data they produce is held to what the design promises. The country is made of parts joined by
// long roads - the Landing Cove, the Heartlands, the Hearth Terraces, Mirror Lake, the Ember Canyon, the Ascent, and the Crag, a mountain with tunnels, halls and a ledge road in it - and
// the five doors stand in five different places (a cove, a cave, a pier, a summit, a forge) at very different walking distances; nothing is an open field with spokes. Exit code 1 when a
// check fails. No dev server needed:  node tools/home-check.mjs
import { buildHeadless, addRuntimeColliders } from './headless-world.mjs';
import { makeWalkmap, CELL } from './walkmap.mjs';
import { DOORS, SECRETS, REGIONS, GARDEN, inFront } from '../src/game/home/level.js';
import { homeLines } from '../src/game/home/dialogue.js';
import { TUNNELS, CHAMBERS, RAMP, SUMMIT, tunnelAt, tunnelLength } from '../src/game/home/crag.js';
import { terrainPicker, uvProjection, triangleNormal, projectUV, GROUND_TILE, buildTerrainMeshes, cutByContour } from '../src/game/terrain-mesh.js';
import { WATER_LEVEL } from '../src/game/level.js';

const { grid, lighting, kit, dryCtx: ctx, gp, collision, level: L, world, ms } = buildHeadless('home');
const crag = world.massifs[0];
console.log('populate ms', Math.round(ms), '(terrain + rock mass + both passes, headless)');
console.log('placements', JSON.stringify(ctx.counts));
console.log('kit tris', kit.triangleCount(), 'colliders', kit.colliders.length, 'lights', kit.lights.length, 'emitters', kit.emitters.length);
console.log('gems', gp.gems.length, JSON.stringify(gp.gemBreakdown), 'TOTAL', gp.gemsTotal);

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };
const h = (x, z) => grid.heightAt(x, z);
const f1 = (v) => v.toFixed(1);

// ---- the Elder says which realms burn (it was always the vale, before a second door woke) --------------------------------------------------------------
{
  const say = (realms) => homeLines({ progress: { realms, home: { secrets: [] } } }, {})[0];
  const a = say({}), b = say({ gloaming: { done: true } }), c = say({ frostbloom: { done: true } }), d = say({ gloaming: { done: true }, frostbloom: { done: true } });
  check('the Elder welcomes the hero, and names the realms that burn (the one, the other, both)', !/BURN/.test(a) && /^WELCOME TO DAWNHAVEN, SPYRO! GLOAMING VALE BURNS BRIGHT AGAIN, AND ITS DOOR SHINES GOLD/.test(b) && /FROSTBLOOM HOLLOW BURNS BRIGHT/.test(c) && !/GLOAMING/.test(c) && /GLOAMING VALE AND FROSTBLOOM HOLLOW BURN BRIGHT AGAIN, AND THEIR DOORS SHINE GOLD/.test(d), `(${c})`);
}

// ---- the doors ---------------------------------------------------------------------------------------------------------------------
{
  const sealed = gp.portals.filter((p) => p.state === 'sealed'), open = gp.portals.filter((p) => p.state === 'open');
  check('five doors: two awake (Gloaming Vale, Frostbloom Hollow), three that still sleep', gp.portals.length === 5 && open.length === 2 && open.map((p) => p.target).sort().join() === 'frostbloom,gloaming' && sealed.length === 3 && sealed.every((p) => !p.target), `(${gp.portals.map((p) => `${p.id}:${p.state}`).join(' ')})`);
  for (const d of DOORS) {
    const p = gp.portals.find((q) => q.id === d.id);
    const ys = [[-3, 0], [3, 0], [0, 0], [0, 3], [-3, 3], [3, 3], [0, 5.5]].map(([s, f]) => { const [x, z] = inFront(d, f, s); return collision.support(x, z, p.y + 1.0, 0.9).y; });
    const spread = Math.max(...ys) - Math.min(...ys);
    check(`door ${d.id}: its dais is level`, spread < 0.35 && Math.abs(Math.min(...ys) - p.y) < 0.8, `(floor ${f1(Math.min(...ys))}..${f1(Math.max(...ys))} at the door's y ${f1(p.y)})`);
    const opening = collision.blocking(d.x, p.y + 1.0, d.z, 0.4);
    check(`door ${d.id}: ${d.target ? 'the opening is free to walk into' : 'the opening is shut with stone'}`, d.target ? !opening : !!opening);
  }
  const g = gp.arrivals.gloaming, d0 = DOORS[0], s = Math.sin(d0.yaw), c = Math.cos(d0.yaw);
  const along = (g.x - d0.x) * s + (g.z - d0.z) * c;
  check('the hero arrives in front of the Gloaming door, well clear of its trigger', along > 8 && Math.abs(g.yaw - d0.yaw) < 1e-6, `(${f1(along)} m in front, facing out of the niche)`);
  check('the first spawn is the same place', Math.hypot(gp.spawn.x - g.x, gp.spawn.z - g.z) < 0.5);
  // five different places, not five alike on a ring: a cove, inside a mountain, out on a lake, on a summit, in a canyon's head
  const where = (d) => {
    const p = gp.portals.find((q) => q.id === d.id);
    if (crag.roofed(p.x, p.y, p.z, 4)) return 'inside the mountain';
    if (p.y > 30) return 'on a summit';
    if (Math.hypot((p.x - L.lake.x) / L.lake.rx, (p.z - L.lake.z) / L.lake.rz) < 1.0) return 'out on the lake';
    if (p.z < -140) return 'in a canyon\'s head';
    return 'in a cove';
  };
  const places = DOORS.map(where);
  check('the five doors stand in five different kinds of place', new Set(places).size === 5, `(${DOORS.map((d, i) => `${d.id}: ${places[i]}`).join('; ')})`);
  let nearest = Infinity;
  for (let i = 0; i < DOORS.length; i++) for (let j = i + 1; j < DOORS.length; j++) {
    const a = gp.portals[i], b = gp.portals[j];
    nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
  }
  check('no two doors are within 25 m of each other (the summit door stands right over the grotto\'s, 12 m aside and 31 m up)', nearest > 25, `(the nearest pair ${f1(nearest)} m apart)`);
}

// ---- the secrets (chests and their walls) -------------------------------------------------------------------------------------------------------------------
{
  const ids = gp.chests.map((c) => c.secret).filter(Boolean).sort();
  check('five secrets, a chest each', ids.join() === SECRETS.map((s) => s.id).sort().join() && ids.length === 5, `(${ids.join(', ')})`);
  for (const c of gp.chests) {
    const under = collision.support(c.x, c.z, c.y + 0.3, 0.3).y;
    check(`chest ${c.secret}: it stands on firm ground (${c.src})`, Math.abs(under - c.y) < 0.9, `(chest y ${f1(c.y)}, surface under it ${f1(under)})`);
  }
  const pond = gp.chests.find((c) => c.secret === 'pond'), I = L.islet;
  check('the pond\'s chest is on the islet, out in the water', Math.hypot(pond.x - I.x, pond.z - I.z) < 3 && h(pond.x, pond.z) > WATER_LEVEL + 0.2, `(ground ${f1(h(pond.x, pond.z))})`);
  const stones = gp.placed.filter((p) => p.name === 'stepping_stone').sort((a, b) => b.x - a.x);
  const td = DOORS.find((d) => d.id === 'tideglass');
  const chain = [[td.x - 1.8, I.z + 6], ...stones.map((p) => [p.x, p.z]), [pond.x, pond.z + 3.2]];
  let widest = 0; for (let i = 1; i < chain.length; i++) widest = Math.max(widest, Math.hypot(chain[i][0] - chain[i - 1][0], chain[i][1] - chain[i - 1][1]));
  check('the stepping stones lead from the pier to the islet with hops a plain jump makes', stones.length === 3 && widest < 6.2, `(${stones.length} stones, the longest hop ${f1(widest)} m centre to centre; a jump carries 8 m)`);
  check('two cracked walls (the hidden garden\'s and the crystal vault\'s)', gp.walls.length === 2, `(${gp.walls.map((w) => `${f1(w.x)},${f1(w.z)}`).join(' and ')})`);
  const summit = gp.chests.find((c) => c.secret === 'summit');
  check('the summit\'s chest stands on the summit', summit && Math.hypot(summit.x - SUMMIT.x, summit.z - SUMMIT.z) < SUMMIT.r && Math.abs(summit.y - SUMMIT.y) < 0.6);
  const vault = gp.chests.find((c) => c.secret === 'vault'), V = CHAMBERS.vault;
  check('the vault\'s chest is in the vault', vault && Math.hypot(vault.x - V.x, vault.z - V.z) < V.rx);
}

// ---- props and gameplay in the right places ------------------------------------------------------------------------------------------------------
{
  // nothing stands on a road (except what is meant to: lamp posts at its sides, the doors and the signposts)
  const OK_ON_ROAD = new Set(['lamp_post', 'realm_door', 'bunting', 'torch_stand', 'banner_pole', 'fence', 'wall_stone', 'flower_patch', 'tuft_patch', 'fern_patch', 'reeds', 'lilypads', 'stepping_stone', 'pier', 'crystal_cluster', 'crystal_spire', 'light_shaft', 'standing_stones', 'rock_arch', 'bench', 'gate_pillars']);
  const onRoad = gp.placed.filter((p) => !OK_ON_ROAD.has(p.name) && p.name !== 'signpost' && ctx.pathDist(p.x, p.z) < 0.6 && !(crag.inBoxXZ(p.x, p.z) && crag.roofed(p.x, p.y, p.z)));
  check('no prop stands in the middle of a road', onRoad.length === 0, onRoad.slice(0, 6).map((p) => `${p.name}@${f1(p.x)},${f1(p.z)}`).join(' '));
  // nothing is planted in a cave by the scatter: only the hand-dressed props stand under a roof (src layoutCrag)
  const roofed = gp.placed.filter((p) => crag.roofed(p.x, p.y, p.z, 2.5) && p.src !== 'layoutCrag' && p.name !== 'realm_door' && p.name !== 'bunting');
  check('nothing but the Crag\'s own dressing stands under its roof', roofed.length === 0, roofed.slice(0, 6).map((p) => `${p.name}@${f1(p.x)},${f1(p.z)} [${p.src}]`).join(' '));
  // no gem or vase inside a solid thing, or inside the mountain
  const stuck = gp.gems.filter((g) => collision.blocking(g.x, g.y, g.z, 0.1));
  check('no gem hangs inside a solid prop or in the rock', stuck.length === 0, `(${stuck.length} of ${gp.gems.length}) ${stuck.slice(0, 6).map((g) => { const c = collision.blocking(g.x, g.y, g.z, 0.1); return `${f1(g.x)},${f1(g.y)},${f1(g.z)} in ${c.prop ? c.prop.name : c.tag || c.id}`; }).join(' | ')}`);
  const vstuck = gp.vases.filter((v) => collision.blocking(v.x, v.y + 0.5, v.z, 0));
  check('no vase stands inside a solid prop or the rock', vstuck.length === 0, `(${vstuck.length} of ${gp.vases.length})`);
  const wet = gp.gems.filter((g) => h(g.x, g.z) < WATER_LEVEL - 0.9 && g.y < WATER_LEVEL + 1);
  check('no gem lies on the pond\'s bed', wet.length === 0);
  check('the gems add up to a tidy round number', gp.gemsTotal % 50 === 0 && gp.gemsTotal >= 300, `(${gp.gemsTotal})`);
  const lim = grid.half - 6;
  const outside = [...gp.gems, ...gp.vases, ...gp.chests].filter((o) => Math.abs(o.x) > lim || Math.abs(o.z) > lim);
  check('everything to collect is inside the world', outside.length === 0);
  check('hint zones: a good many, each over ground the hero can stand on', gp.hints.length >= 14 && gp.hints.every((hh) => Math.abs(hh.x) < lim && Math.abs(hh.z) < lim), `(${gp.hints.length} zones)`);
  const caveHints = gp.hints.filter((hh) => hh.y0 !== undefined);
  check('the hint zones in and over the Crag only count at their own height', caveHints.length >= 6 && caveHints.every((hh) => hh.y1 > hh.y0), `(${caveHints.length} zones with a height band)`);
}

// ---- what the game adds when it starts (ObjectSystem / NpcSystem put these colliders in the world; the headless build has only the props') --------------------------------
addRuntimeColliders(collision, gp, grid);

// ---- who can walk where (tools/walkmap.mjs: the real slope limit, colliders and rock) --------------------------------------------------------------------------------------
const { flood } = makeWalkmap({ grid, collision });
const cx = (i) => -grid.half + (i + 0.5) * CELL, cz = (j) => -grid.half + (j + 0.5) * CELL, N = Math.floor((2 * grid.half) / CELL);
const arrive = [gp.arrivals.gloaming.x, gp.arrivals.gloaming.z];
const w = flood(arrive), wBroken = flood(arrive, { breakWalls: true });
const near = (f, x, z, r = 2.4, y) => f.distNear(x, z, r, y) < Infinity;
{
  const doorY = (d) => gp.portals.find((q) => q.id === d.id).y;
  for (const d of DOORS) { const [x, z] = inFront(d, 5); check(`walk: from the arrival to the ${d.id} door's dais`, near(w, x, z, 2.4, doorY(d)), `(${f1(w.distNear(x, z, 2.4, doorY(d)))} m of walking)`); }
  // not five doors on five equal spokes: the walks to them are very different, the nearest in the next cove, the farthest a long journey
  const walks = DOORS.map((d) => ({ id: d.id, m: w.distNear(...inFront(d, 5), 2.4, doorY(d)) })).sort((a, b) => a.m - b.m);
  check('the walks to the doors differ a great deal: the nearest under 120 m, the farthest over 350 m', walks[0].m < 120 && walks[walks.length - 1].m > 350, `(${walks.map((q) => `${q.id} ${Math.round(q.m)} m`).join(', ')})`);
  let gap = Infinity; for (let i = 1; i < walks.length; i++) gap = Math.min(gap, walks[i].m - walks[i - 1].m);
  check('... and no two of them are about the same walk (at least 15 m between neighbours)', gap > 15, `(the closest pair ${Math.round(gap)} m apart)`);
  const elder = gp.npcs[0];
  check('walk: to the Elder', near(w, elder.x, elder.z, 3.6));
  const G = L.guard;
  check('walk: to the court before the Guardian\'s gate', near(w, G.x, G.z + 10));
  check('walk: not through the sealed gate (the barrier and the gorge hold)', !w.has(G.x, G.z - 8, G.h) && !w.has(G.x, G.z - 20, G.h) && !wBroken.has(G.x, G.z - 20, G.h), '(the ground behind the gate is out of reach)');
  const gate = flood(arrive, { openGate: true });
  check('(the gate is what stops him: with its field gone he could walk through)', gate.has(G.x, G.z - 8, G.h), '');
}

// ---- the parts of the country -------------------------------------------------------------------------------------------------------------------------------
{
  // every part can be walked to, along its own line (the lake's ring and the shore are one ring: only the stretch that is not water counts)
  const parts = REGIONS.filter((r) => r.id !== 'garden');
  for (const r of parts) {
    let miss = 0, total = 0, far = 0;
    for (let i = 0; i < r.pts.length; i += 1) {
      const [x, z, py, hw] = r.pts[i];
      if (h(x, z) < WATER_LEVEL + 0.5) continue;
      if (crag.inBoxXZ(x, z) && (crag.dist(x, py + 1, z) < 1 || crag.roofed(x, py, z, 2))) continue;          // (a point of the plinth under the mountain's rock: the caves are checked below)
      if (r.id === 'ascent' && z < L.guard.z + 9) continue;                                                   // (behind the sealed gate)
      total++;
      const d = w.distNear(x, z, Math.min(6, hw * 0.4), py);
      if (d === Infinity) miss++; else far = Math.max(far, d);
    }
    check(`walk: the ${r.id} is all open to him along its line`, miss === 0 && (total > 0 || r.id === 'plinth'), `(${total - miss}/${total} points, the farthest ${Math.round(far)} m of walking from the arrival)`);
  }
  // long paths: the Ascent is a journey
  const asc = REGIONS.find((r) => r.id === 'ascent').pts.at(-2);
  const dAsc = w.distNear(asc[0], asc[1], 6, asc[2]);
  check('the way to the Guardian\'s court is long: more than 350 m of walking', dAsc > 350, `(${Math.round(dAsc)} m)`);
  // a country with levels: the walkable ground spans a good range of heights
  let lo = 1e9, hi = -1e9;
  w.each((x, y) => { if (y > WATER_LEVEL - 0.5) { lo = Math.min(lo, y); hi = Math.max(hi, y); } });
  check('the walkable country has heights: from the cove to the summit it climbs at least 30 m', hi - lo > 30, `(y ${f1(lo)}..${f1(hi)})`);
}

// ---- the Crag: tunnels, halls, a ledge road -------------------------------------------------------------------------------------------------------------------
{
  for (const name of ['gate', 'stair', 'east', 'north']) {
    const L2 = tunnelLength(name);
    let miss = 0, n = 0;
    for (let s = 0; s <= L2; s += 4) { const q = tunnelAt(name, s); n++; if (!near(w, q.x, q.z, 1.8, q.y)) miss++; }
    check(`caves: the ${name} tunnel can be walked end to end`, miss === 0, `(${n - miss}/${n} points, ${f1(L2)} m long)`);
    // (and along its own line: a flood that may only use the ground within a tunnel's width of its centre line, from its first metre to its last, so that a way that is open at one end only, or shut by a prop
    // part of the way, fails whatever other roads lead into the mountain)
    const st = []; for (let s = 0; s <= L2; s += 1) st.push(tunnelAt(name, s));
    const a0 = st[0], b0 = st[st.length - 1];
    const line = flood([a0.x, a0.z], { startY: a0.y, mask: (x, y, z) => st.some((q) => Math.hypot(q.x - x, q.z - z) < q.hw + 1.5 && Math.abs(q.y - y) < 3) });
    check(`caves: the ${name} tunnel can be walked along its own line from end to end`, near(line, b0.x, b0.z, 1.8, b0.y), `(${f1(line.distNear(b0.x, b0.z, 1.8, b0.y))} m of walking for ${f1(L2)} m of tunnel)`);
    // (and with room to run in: the roof over the floor, measured on the rock's own field, at least 3.4 m all along, where the hero's body is 1.05 m and the camera follows him)
    let low = 99, lowAt = 0;
    for (let s = 0; s <= L2; s += 2) {
      const q = tunnelAt(name, s), fl = h(q.x, q.z);
      let room = 14; for (let y = fl + 0.3; y < fl + 14; y += 0.25) if (crag.f(q.x, y, q.z) < 0) { room = y - fl; break; }
      if (room < low) { low = room; lowAt = s; }
    }
    check(`caves: the ${name} tunnel has room to run in (at least 3.4 m between floor and roof)`, low >= 3.4, `(lowest ${f1(low)} m, ${f1(lowAt)} m in)`);
  }
  for (const name of ['hall', 'grotto']) { const c = CHAMBERS[name]; check(`caves: the ${name} can be walked to`, near(w, c.x, c.z, 4, c.floorY), `(${f1(w.distNear(c.x, c.z, 4, c.floorY))} m of walking)`); }
  let roofedCells = 0, caveReach = 0;
  w.each((x, y, z) => { if (!crag.inBoxXZ(x, z)) return; caveReach++; if (crag.roofed(x, y, z, 3)) roofedCells++; });
  // (the scatter's placement rule keeps out of the caves: not one walkable spot under the rock is accepted, although most of them are clear of the walls and the roads)
  let under = 0, accepted = 0;
  w.each((x, y, z) => { if (crag.inBoxXZ(x, z) && crag.roofed(x, y, z, 3) && Math.abs(y - h(x, z)) < 0.6) { under++; if (ctx.ok(x, z, { r: 0.6, path: -99, river: -99, lake: -99, maxSlope: 9, minH: -99 })) accepted++; } });
  check('the placement rule refuses every spot under the Crag\'s roof (nothing is planted in a cave)', under > 500 && accepted === 0, `(${accepted} of ${under} walkable floor cells accepted)`);
  check('a good deal of the mountain is walkable under a roof', roofedCells * CELL * CELL > 1800, `(${Math.round(roofedCells * CELL * CELL)} m2 under rock, of ${Math.round(caveReach * CELL * CELL)} m2 walkable within the Crag's bounds)`);
  // the textures of the rock (Massif.build): the ledge road is cobbled and only the ledge road, gentle ground that sees the sky is grass, the rest is cliff; the borders are cut along
  // the zero lines of the scores at the vertices, which makes new corners on the mesh's edges
  {
    const built = crag.build({ mat: (nm) => ({ name: nm }) }, grid, kit.lights), by = built.stats.byTexture;
    const road = (x, z) => {
      let best = null;
      for (let i = 0; i + 1 < RAMP.length; i++) {
        const [ax, az, ay, ah] = RAMP[i], [bx, bz, by2, bh] = RAMP[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(x - (ax + dx * u), z - (az + dz * u));
        if (!best || d < best.d) best = { d, y: ay + (by2 - ay) * u, hw: ah + (bh - ah) * u };
      }
      return best;
    };
    let stray = 0;
    const cob = built.group.children.find((m) => m.name === 'massif:crag:cobble');
    if (cob) { const P = cob.geometry.getAttribute('position').array; for (let i = 0; i < P.length; i += 3) { const r = road(P[i], P[i + 2]); if (r.d > r.hw + 1.5 || Math.abs(P[i + 1] - r.y) > 1.7) { stray++; break; } } }
    check('the rock\'s textures: cobble on the ledge road and nowhere else, grass on the gentle ground, cliff for the rest', by.cobble > 1500 && by.grass_a > 3000 && by.cliff_bare > 10000 && stray === 0, `(${JSON.stringify(by)}; ${stray ? 'cobble off the road' : 'cobble all on the road'})`);
    check('the borders between them are cut along smooth lines: new corners were made on the mesh\'s edges', built.stats.cutVertices > 800, `(${built.stats.cutVertices} corners)`);
  }
  // the ledge road: from the forecourt, round the mountain, up to the summit
  let missR = 0, nR = 0, gain = 0, prevY = RAMP[0][2];
  for (let i = 0; i < RAMP.length; i += 3) { nR++; if (!near(w, RAMP[i][0], RAMP[i][1], 1.8, RAMP[i][2])) missR++; }
  gain = RAMP[RAMP.length - 1][2] - RAMP[0][2];
  let rl = 0; for (let i = 1; i < RAMP.length; i++) rl += Math.hypot(RAMP[i][0] - RAMP[i - 1][0], RAMP[i][1] - RAMP[i - 1][1]);
  check('the ledge road can be walked from the forecourt to the summit', missR === 0, `(${nR - missR}/${nR} points; it climbs ${f1(gain)} m over ${Math.round(rl)} m)`);
  void prevY;
  const sd = DOORS.find((d) => d.id === 'skyweaver');
  const ledgeWalk = w.distNear(...inFront(sd, 5), 2.4, SUMMIT.y) - w.distNear(RAMP[0][0], RAMP[0][1], 3, RAMP[0][2]);
  check('... and the road is a long way up: the summit is 200 m of walking past its foot', ledgeWalk > 200, `(${Math.round(ledgeWalk)} m from the road's start to the summit door)`);
  // the rock itself
  const { pos, nrm: nrmM, idx: tri } = crag.mesh();
  let bad = 0, big = 0, high = 0;
  const T = tri.length / 3;
  for (let t = 0; t < T; t++) {
    const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2], vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const n0 = uy * vz - uz * vy, n1 = uz * vx - ux * vz, n2 = ux * vy - uy * vx, l = Math.hypot(n0, n1, n2);
    const mx = nrmM[a * 3] + nrmM[b * 3] + nrmM[c * 3], my = nrmM[a * 3 + 1] + nrmM[b * 3 + 1] + nrmM[c * 3 + 1], mz = nrmM[a * 3 + 2] + nrmM[b * 3 + 2] + nrmM[c * 3 + 2];
    const ag = l < 1e-9 ? -1 : (n0 * mx + n1 * my + n2 * mz) / (l * (Math.hypot(mx, my, mz) || 1));
    const edge = Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz));
    if (edge > 3.6) big++;
    if (ag < 0.25 && (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3 > 8.6) { bad++; high++; }
  }
  check('the Crag\'s rock is a clean skin: under 0.6% of its triangles are folded, none is oversize', bad / T < 0.006 && big === 0, `(${T} triangles, ${bad} folded, ${big} with an edge over 3.6 m)`);
  void high;
}

// ---- the sealed places: the garden, the vault ----------------------------------------------------------------------------------------------------------------------
{
  const inside = [GARDEN.x, GARDEN.z, GARDEN.h];
  const garden = gp.walls[0], vault = gp.walls[1];
  check('the hidden garden is sealed while its wall stands', !near(w, inside[0], inside[1], 3, inside[2]), `(its floor at ${f1(inside[0])}, ${f1(inside[1])})`);
  check('... and open to walk into once the wall is broken', near(wBroken, inside[0], inside[1], 3, inside[2]));
  const gc = gp.chests.find((c) => c.secret === 'garden');
  check('... with its chest inside', near(wBroken, gc.x, gc.z, 2.4) && !near(w, gc.x, gc.z, 2.4));
  const vc = gp.chests.find((c) => c.secret === 'vault');
  check('the crystal vault is sealed while its wall stands, with the chest inside', !near(w, vc.x, vc.z, 2.4) && !!vault);
  check('... and open to walk into once the wall is broken', near(wBroken, vc.x, vc.z, 2.4));
  void garden;
  // the mill: the road gets him up onto the ridge, to the windmill's door (its stair is the bot's: tools/home-bot.mjs)
  const mill = gp.placed.find((p) => p.name === 'windmill_body');
  const my = h(mill.x, mill.z + 8);
  check('walk: up the terraces to the windmill on the ridge', near(w, mill.x, mill.z + 8, 6, my), `(${f1(w.distNear(mill.x, mill.z + 8, 6, my))} m of walking; the ridge is ${f1(my)} m high)`);
  // everything that lies about to be collected can be reached (hovering arcs over the water and the like are allowed a few)
  const lost = [...gp.gems, ...gp.vases].filter((o) => !near(wBroken, o.x, o.z, 3.6, o.y - (o.value ? 0.95 : 0)));
  check('everything to collect lies where he can reach it (a few arcs over the water excepted)', lost.length <= (gp.gems.length + gp.vases.length) * 0.03, `(${lost.length} of ${gp.gems.length + gp.vases.length} out of reach: ${lost.slice(0, 5).map((o) => `${f1(o.x)},${f1(o.z)}`).join(' ')})`);
}

// ---- the ground ----------------------------------------------------------------------------------------------------------------------
{
  const picker = terrainPicker(grid), n = grid.n, tex = {};
  let sandAway = 0, flaps = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) for (const t of picker.tris(i, j)) {
    tex[t.tex] = (tex[t.tex] || 0) + 1;
    const cxp = (t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3, czp = (t.p[0][2] + t.p[1][2] + t.p[2][2]) / 3;
    const dl = Math.hypot((cxp - L.lake.x) / L.lake.rx, (czp - L.lake.z) / L.lake.rz);
    if (t.tex === 'sand' && dl > 1.7 && !/river|canyon/.test(t.why)) sandAway++;
    if (Math.hypot(cxp - L.garden.x, czp - L.garden.z) < L.garden.r + 21 && t.slope > 0.3 && !/cliff|far_rock/.test(t.tex)) flaps++;
  }
  console.log('ground textures', JSON.stringify(tex));
  check('sand only where there is water or a canyon floor', sandAway === 0, `(${sandAway} triangles)`);
  check('the hidden garden\'s wall is rock down to its foot: no flap of grass hangs on it', flaps === 0, `(${flaps} grass triangles steeper than 0.3 within ${f1(L.garden.r + 21)} m of its middle)`);
  const G = L.guard;
  // (the Frostbloom door's court is the Frost Grotto's own floor, ice; the Skyweaver door's is the summit, rock the massif draws: the terrain under it is hidden; the Tideglass door stands on its pier)
  const courts = [...DOORS.filter((d) => d.id !== 'tideglass' && d.id !== 'skyweaver').map((d) => [d.id, ...inFront(d, 5)]), ['gate', G.x + 6, G.z + 16]];
  const unpaved = courts.filter(([id, x, z]) => picker.at(x, z).tex !== (id === 'frostbloom' ? 'ice' : 'flagstone'));
  check('the courts before the doors and the Guardian\'s gate are paved', unpaved.length === 0, unpaved.map(([id, x, z]) => `${id}: ${picker.at(x, z).tex}`).join(', '));
  let patches = 0, nonRock = 0, worst = 0;
  const isRock = (t) => t === 'cliff' || t === 'cliff_warm' || t === 'far_rock' || t === 'cliff_bare' || t === 'cliff_warm_bare';
  const stretchOf = (t, mode) => {
    const uv = t.p.map((q) => projectUV(q, mode)), g = triangleNormal(t.p[0], t.p[1], t.p[2]);
    const surface = Math.hypot(g[0], g[1], g[2]) / 2, texA = Math.abs((uv[1][0] - uv[0][0]) * (uv[2][1] - uv[0][1]) - (uv[2][0] - uv[0][0]) * (uv[1][1] - uv[0][1])) / 2 * GROUND_TILE * GROUND_TILE;
    return surface / Math.max(texA, 1e-9);
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) for (const t of picker.tris(i, j)) {
    if (/rock and grass patches/.test(t.why)) patches++;
    if (!isRock(t.tex)) {
      const fn = t.idx.map(([a, b]) => grid.vertexNormal(a, b)), faceN = [0, 1, 2].map((k) => fn[0][k] + fn[1][k] + fn[2][k]);
      worst = Math.max(worst, stretchOf(t, uvProjection(t.tex, t.slope, faceN, triangleNormal(t.p[0], t.p[1], t.p[2])))); nonRock++;
    }
  }
  check('no hillside is patched with rock and grass: a slope is grass up to the steep limit, the rock is the cliffs and the mountains', patches === 0, `(${patches} triangles)`);
  check('the ground that is not rock is laid on from the side its plane faces: no triangle is stretched more than 1.75 times', nonRock > 5000 && worst < 1.75, `(${nonRock} triangles, worst ${worst.toFixed(2)} times)`);
}

// ---- the border of the rock ----------------------------------------------------------------------------------------------------------------------
{
  // (1) the cut itself, on random triangles: the pieces lie on their own side of the contour, make up the whole triangle, and two triangles that share an edge make the same corner on it
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const area = (poly) => { let a = 0; for (let k = 1; k + 1 < poly.length; k++) { const [p0, p1, p2] = [poly[0].p, poly[k].p, poly[k + 1].p]; a += Math.hypot(...triangleNormal(p0, p1, p2)) / 2; } return a; };
  let badSide = 0, badArea = 0, badShare = 0, cutN = 0;
  for (let n = 0; n < 400; n++) {
    const mk = (key) => ({ p: [rnd() * 10, rnd() * 10, rnd() * 10], nv: [0, 1, 0], sc: rnd() * 2 - 1, key });
    const A = mk(1), B = mk(2), C = mk(3), D = mk(4);
    const { rock, soft } = cutByContour([A, B, C]);
    if (rock.some((c) => c.sc < 0) || soft.some((c) => c.sc > 0)) badSide++;
    if (Math.abs(area(rock) + area(soft) - Math.hypot(...triangleNormal(A.p, B.p, C.p)) / 2) > 1e-6) badArea++;
    if (rock.length && soft.length) cutN++;
    // the triangle on the other side of the edge B-C, listed the other way round
    const t1 = cutByContour([A, B, C]), t2 = cutByContour([D, C, B]);
    const onEdge = (r) => r.rock.concat(r.soft).filter((c) => c.key === -1 && c.p.every((v, k) => Math.abs(v - (B.p[k] + (C.p[k] - B.p[k]) * (B.sc / (B.sc - C.sc)))) < 1e-9));
    const a = onEdge(t1), b = onEdge(t2);
    if ((B.sc > 0) !== (C.sc > 0) ? (a.length === 0 || b.length === 0 || a[0].p.some((v, k) => v !== b[0].p[k])) : (a.length > 0 || b.length > 0)) badShare++;
  }
  check('the cut of a triangle along a contour: pieces on their own side, the whole triangle in all, the same corner from both sides of an edge', badSide === 0 && badArea === 0 && badShare === 0 && cutN > 100, `(400 random triangles, ${cutN} cut; ${badSide} on the wrong side, ${badArea} not adding up, ${badShare} not shared)`);
  // (2) the ground of the homeworld: no piece of rock or grass lies across the contour of the steep limit. (Where the rules decided otherwise, a lake, a road, the valley's rim at the edge of the world,
  // the garden's wall and the Crag's plinth that are rock whatever the slope, the piece keeps what the rules gave.)
  const group = buildTerrainMeshes(grid, lighting, { mat: (nm) => ({ name: nm }) }).group, steep = L.steepSlope, picker = terrainPicker(grid);
  const slopeAt = (x, z) => { const i = Math.round((x + grid.half) / grid.cell), j = Math.round((z + grid.half) / grid.cell); return Math.abs(-grid.half + i * grid.cell - x) < 1e-3 && Math.abs(-grid.half + j * grid.cell - z) < 1e-3 ? Math.acos(Math.min(1, grid.vertexNormal(i, j)[1])) : null; };
  let pieces = 0, across = 0, judged = 0;
  for (const m of group.children) {
    const nm = m.name.slice('terrain:'.length);
    if (!/^(cliff_bare|cliff_warm_bare|grass)/.test(nm)) continue;
    const P = m.geometry.getAttribute('position').array;
    for (let i = 0; i < P.length; i += 9) {
      pieces++;
      const cxp = (P[i] + P[i + 3] + P[i + 6]) / 3, czp = (P[i + 2] + P[i + 5] + P[i + 8]) / 3;
      const q = picker.at(cxp, czp), t = picker.tris(q.i, q.j)[q.tri];
      if (!(t.why.startsWith('steep') || t.tex.startsWith('grass')) || !t.re(steep + 0.05)[1].startsWith('steep') || !t.re(Math.min(t.slope, steep - 0.05))[0].startsWith('grass')) continue;       // (a real border of rock and grass)
      judged++;
      const sc = [0, 3, 6].map((o) => slopeAt(P[i + o], P[i + o + 2])).filter((v) => v !== null).map((v) => v - steep);
      if (nm.startsWith('cliff') ? sc.some((v) => v < -0.02) : sc.some((v) => v > 0.02)) { across++; if (process.env.DBG) console.log('across', nm, cxp.toFixed(1), czp.toFixed(1), t.why, sc.map((v) => v.toFixed(2)).join(' ')); }
    }
  }
  check('the border of the rock runs along the contour of the steep slope: no piece of rock or grass lies across it', across === 0 && judged > 20000, `(${across} of ${judged} pieces; the mesh has ${group.children.reduce((a, m) => a + m.geometry.getAttribute('position').count / 3, 0)} triangles for the ${grid.n * grid.n * 2} the rules chose)`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall homeworld checks passed');
process.exitCode = failed ? 1 : 0;
