// Runs the level population headlessly (both passes), reports counts, triangle budget and gameplay data, then checks a few placements
// (exit code 1 when one fails). No dev server needed:  node tools/level-check.mjs
import { buildHeadless } from './headless-world.mjs';
import { WATER_LEVEL } from '../src/game/level.js';
import { isleObjects, shortfall } from '../src/game/levelgen/islands.js';
import { colliderDist } from '../src/game/debuginfo.js';
import { terrainPicker, uvProjection, projectUV, triangleNormal, rockLimit, GROUND_TILE, UNDER_ROAD, buildTerrainMeshes } from '../src/game/terrain-mesh.js';
import { buildRoads, ROAD_LIFT, ROAD_DECAL, ROAD_MAX_SLOPE } from '../src/game/roads.js';
import { buildRiverWater } from '../src/game/water.js';
import { riverWaterLength } from '../src/game/river.js';
import { RIVER_ZONE } from '../src/game/terrain-mesh.js';

const { grid, kit, dryCtx: ctx, gp, ms, lighting } = buildHeadless();
console.log('populate ms', Math.round(ms), '(terrain + both passes, headless)');
console.log('placements', JSON.stringify(ctx.counts));
console.log('kit tris', kit.triangleCount(), 'builders', kit.builders.size, 'colliders', kit.colliders.length, 'lights', kit.lights.length, 'emitters', kit.emitters.length);
console.log('gems', gp.gems.length, 'static value', gp.gemBreakdown.static, 'dynamic', gp.gemBreakdown.dynamic, 'TOTAL', gp.gemsTotal);
console.log('enemies', gp.enemies.length, JSON.stringify(gp.enemies.reduce((a, e) => ((a[e.variant] = (a[e.variant] || 0) + 1), a), {})), 'vases', gp.vases.length, 'chests', gp.chests.length, 'walls', gp.walls.length, 'bunnies', gp.bunnies.length, 'braziers', gp.braziers.length, 'mushrooms', gp.mushrooms.length);
console.log('beacons', gp.beacons.map((b) => `${b.id}@(${b.x.toFixed(0)},${b.y.toFixed(1)},${b.z.toFixed(0)})`).join(' '));
console.log('islands', grid.level.isles.map((i) => `${i.id}@y${i.y}`).join(' '), 'barrier', JSON.stringify(gp.barrier), 'portcullis', JSON.stringify(gp.portcullis), 'sails', JSON.stringify(gp.sails));

// ---- placement checks (each one is a bug that shipped once: a chest on the shore slope, a trench of roads below the waterline) ----
const L = grid.level;
const checks = [];
const check = (name, ok, detail) => { checks.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };
{
  // the shrine island's chest stands on the island's level top, seated on the ground (no gap under any corner of its 1.7 x 1.0 base)
  const I = L.island;
  const c = gp.chests.find((k) => Math.hypot(k.x - I.x, k.z - I.z) < 12);
  const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
  const under = [[-0.85, -0.5], [0.85, -0.5], [-0.85, 0.5], [0.85, 0.5]].map(([lx, lz]) => grid.heightAt(c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs) - c.y);
  const r = Math.hypot(c.x - I.x, c.z - I.z);
  check('island chest on the level top', grid.heightAt(c.x, c.z) > I.top - 0.5 && r < 5.5, `(r ${r.toFixed(1)} m from the beacon, ground ${grid.heightAt(c.x, c.z).toFixed(2)} of ${I.top})`);
  check('island chest seated', Math.min(...under) > -0.05 && Math.max(...under) < 0.5, `(ground under its corners ${under.map((v) => v.toFixed(2)).join(' ')})`);
}
{
  // the Dawn Gate's approach is one clean paved forecourt: dry ground everywhere, a gentle climb, ring roads ending at its sides
  let lo = Infinity, steep = 0;
  for (let z = -92; z <= -70; z += 1) for (let x = -12; x <= 12; x += 1) {
    lo = Math.min(lo, grid.heightAt(x, z));
    if (Math.abs(x) < 7 && z >= -86) steep = Math.max(steep, grid.slopeAt(x, z));       // (the paved apron up to the pillars' plinths)
  }
  check('gate forecourt above water', lo > WATER_LEVEL + 0.5, `(lowest ground ${lo.toFixed(2)})`);
  check('gate forecourt climbs gently', steep < 0.36, `(steepest paved slope ${steep.toFixed(2)} rad)`);
  const g = L.gate, plaza = grid.paths.find((p) => p.id === 'plaza');
  const ends = ['ringW', 'ringE'].map((id) => { const p = grid.paths.find((q) => q.id === id).pts.at(-1); return Math.hypot(p[0] - g.x, p[2] - (plaza.pts[0][2] - 1)); });
  check('ring roads end at the forecourt', ends.every((d) => d < 10), `(distance of their last points from its south end: ${ends.map((d) => d.toFixed(1)).join(', ')})`);
}
{
  // the sky isles' decor (a crystal cluster, a lantern tree, flowers) keeps clear of everything gameplay on its isle. Each of these shipped once:
  // on Sky Isle 2 the tree grew through the bounce mushroom's cap (1.8 m away), and on Sky Isle 3 a crystal cluster sat on the chest (0.2 m away)
  const bad = [];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  for (const isle of L.isles) {
    const objs = isleObjects(gp, isle), placed = [];
    for (const d of gp.islandDecor[isle.id].decor) {
      const s = shortfall(d.x, d.z, d.kind, objs, placed);
      if (s > 0) bad.push(`${isle.id} ${d.name} is ${s.toFixed(1)} m too close`);
      placed.push(d);
    }
  }
  check('sky isle decor keeps clear of the bounce mushrooms, chests, enemy spawns, beacon and gem', bad.length === 0, bad.join('; '));
  const i2 = L.isles.find((i) => i.id === 'i2'), i3 = L.isles.find((i) => i.id === 'i3');
  const mush2 = gp.mushrooms.find((m) => dist(m, i2) < i2.r), tree2 = gp.islandDecor.i2.decor.find((d) => d.name === 'tree_lantern');
  check('Sky Isle 2: the lantern tree stands clear of the bounce mushroom (it was 1.8 m away, growing through the cap)', dist(mush2, tree2) >= 5.3, `(${dist(mush2, tree2).toFixed(1)} m)`);
  const chest3 = gp.chests.find((c) => dist(c, i3) < i3.r), crystal3 = gp.islandDecor.i3.decor.find((d) => d.name === 'crystal_cluster');
  check('Sky Isle 3: the crystal cluster is off the chest (it was 0.2 m away)', dist(chest3, crystal3) >= 3.1, `(${dist(chest3, crystal3).toFixed(1)} m)`);
  // the decor exists as props: recorded, with colliders that know them
  const decorCols = kit.colliders.filter((c) => c.prop && c.prop.src === 'buildIslands');
  check('the isles and their decor are in the world (recorded props, their colliders in the collision world)', gp.placed.filter((p) => p.src === 'buildIslands').length === 16 && decorCols.length >= 8, `(${gp.placed.filter((p) => p.src === 'buildIslands').length} records, ${decorCols.length} colliders)`);
}
{
  // nothing solid stands on a chest, vase, brazier, bounce mushroom or NPC, and no enemy spawns inside a solid prop (beacons sit on top of the windmill and
  // the observatory by design and are not checked; a prop's walk-on surface under something is fine)
  const things = [];
  for (const c of gp.chests) things.push(['chest', c, 1.3]);
  for (const v of gp.vases) things.push(['vase', v, 0.8]);
  for (const b of gp.braziers) things.push(['brazier', b, 1.0]);
  for (const m of gp.mushrooms) things.push(['bounce mushroom', m, 2.3 * (m.size || 1)]);
  for (const n of gp.npcs) things.push(['npc', n, 0.8]);
  for (const e of gp.enemies) things.push(['enemy spawn', e, 1.0]);
  const clashes = [];
  for (const [kind, o, r] of things) {
    const oy = Number.isFinite(o.y) ? o.y : grid.heightAt(o.x, o.z);
    for (const c of kit.colliders) {
      if (!c.prop || (c.type === 'cyl' && c.r < 0.2)) continue;
      if (c.top && c.y1 <= oy + 0.6) continue;                              // (standing on it)
      if (!(oy < c.y1 - 0.4 && oy + 1.0 > c.y0)) continue;                  // (not at the same height: another isle, a bridge overhead)
      const d = colliderDist(c, o.x, o.z);
      if (d < r) clashes.push(`${kind} at ${o.x.toFixed(1)}, ${o.z.toFixed(1)} [${o.src}] is inside ${c.prop.name} at ${c.prop.x.toFixed(1)}, ${c.prop.z.toFixed(1)} [${c.prop.src}] (${d.toFixed(1)} m < ${r})`);
    }
  }
  check('no prop stands on a chest, vase, brazier, bounce mushroom or NPC, and no enemy spawns inside one', clashes.length === 0, `(${things.length} things checked${clashes.length ? ': ' + clashes.join('; ') : ''})`);
}
{
  // Mirrormere's dock and lily-pad crossing. Each of these was asked for after playing it: the dock was long and narrow with its lamp post dead centre on
  // the far end (right where you run off and jump), and the pads were small and close. Now: a short wide dock, a clear run-off, and pads twice as big
  // with open water between them that is still an easy hop.
  const pierRec = gp.placed.find((p) => p.name === 'pier' && p.src === 'layoutLake');
  const pier = kit.colliders.find((c) => c.prop === pierRec && c.tag === 'pier');
  const lamp = kit.colliders.find((c) => c.prop === pierRec && c.tag === 'lamp');
  const boat = kit.colliders.filter((c) => c.prop && c.prop.name === 'boat');
  const pierLen = pier.hz * 2, pierWidth = pier.hx * 2;
  check('the dock is short and wide (it was 12 m x 3.2 m)', pierLen <= 9 && pierWidth >= 5, `(${pierLen.toFixed(1)} m long, ${pierWidth.toFixed(1)} m wide)`);
  // the far end, and the strip a player runs along to jump off it: nothing solid may stand in it (the lamp used to, dead centre)
  const ux = Math.sin(pier.rot), uz = Math.cos(pier.rot);                                     // (the deck runs along local +z; the far end is at +hz)
  const end = [pier.x + ux * pier.hz, pier.z + uz * pier.hz];
  const deckTop = pier.y1, blockers = [];
  for (let t = -3.5; t <= 1.5; t += 0.25) for (const off of [-1.4, -0.7, 0, 0.7, 1.4]) {
    const px = end[0] + ux * t - uz * off, pz = end[1] + uz * t + ux * off;
    for (const c of kit.colliders) {
      if (c.top || !(c.y0 < deckTop + 1.4 && c.y1 > deckTop + 0.1)) continue;                 // (only what a body standing on the deck would hit)
      if (colliderDist(c, px, pz) < 0.55) blockers.push(`${c.tag || c.prop?.name || c.type} at ${c.x.toFixed(1)}, ${c.z.toFixed(1)}`);
    }
  }
  check('nothing solid blocks the run-off at the end of the dock', blockers.length === 0, `(${[...new Set(blockers)].join('; ') || 'clear'})`);
  const off = Math.abs((lamp.x - pier.x) * -uz + (lamp.z - pier.z) * ux), back = (end[0] - lamp.x) * ux + (end[1] - lamp.z) * uz;
  check('the dock\'s lamp post stands on its edge, off the centre line', off >= 1.5 && back >= 0.8 && colliderDist(pier, lamp.x, lamp.z) === 0, `(${off.toFixed(1)} m off the centre line, ${back.toFixed(1)} m back from the end)`);

  // the crossing: stepping stones (the pads you hop across), from the dock out to the island
  const stones = kit.colliders.filter((c) => c.prop && c.prop.name === 'stepping_stone').sort((a, b) => b.z - a.z);
  check('the crossing has three round pads, each twice the old size (radius 3.4, was 1.7) and just above the water', stones.length === 3 && stones.every((c) => c.r >= 3.3 && c.top && Math.abs(c.y1 - (WATER_LEVEL + 0.45)) < 0.05), `(${stones.length} pads, radii ${stones.map((c) => c.r.toFixed(1)).join(', ')})`);
  // every hop is an easy one: open water between the edges (no crowding) but well under a jump's reach (8.7 m at a run; these are 3 m)
  const gaps = [];
  let from = (x, z) => colliderDist(pier, x, z);
  stones.forEach((c, i) => {
    gaps.push(from(c.x, c.z) - c.r);
    from = (x, z) => Math.hypot(x - c.x, z - c.z) - c.r;
  });
  {                                                                                            // the last pad to the island's beach: walk from it towards the beacon until the ground is dry
    const c = stones.at(-1), I = L.island, d = Math.hypot(I.x - c.x, I.z - c.z);
    let t = c.r;
    while (t < d && grid.heightAt(c.x + (I.x - c.x) * t / d, c.z + (I.z - c.z) * t / d) < WATER_LEVEL + 0.15) t += 0.1;
    gaps.push(t - c.r);
  }
  check('every hop across the crossing (dock -> pad -> pad -> pad -> beach) is 1.5 to 4.5 m of open water', gaps.every((g) => g >= 1.5 && g <= 4.5), `(gaps ${gaps.map((g) => g.toFixed(1)).join(', ')} m)`);
  // the pads and the decor lily pads are all walkable platforms floating in deep enough water, with room between them and clear of the dock and the boat
  const lily = kit.colliders.filter((c) => c.tag === 'lilypad');
  const platforms = [...lily, ...stones];
  const shallow = platforms.filter((c) => [[0, 0], [c.r, 0], [-c.r, 0], [0, c.r], [0, -c.r]].some(([ox, oz]) => grid.heightAt(c.x + ox, c.z + oz) > WATER_LEVEL - 0.3));
  check('all lily pads (and the crossing pads) float over water at least 0.3 m deep', platforms.length > 20 && shallow.length === 0, `(${platforms.length} pads; ${shallow.map((c) => `${c.x.toFixed(1)}, ${c.z.toFixed(1)}`).join('; ') || 'none in the shallows'})`);
  let closest = Infinity, closeAt = '';
  for (let i = 0; i < platforms.length; i++) for (let j = i + 1; j < platforms.length; j++) {
    const g = Math.hypot(platforms[i].x - platforms[j].x, platforms[i].z - platforms[j].z) - platforms[i].r - platforms[j].r;
    if (g < closest) { closest = g; closeAt = `${platforms[i].x.toFixed(1)}, ${platforms[i].z.toFixed(1)}`; }
  }
  const nearDock = platforms.map((c) => Math.min(colliderDist(pier, c.x, c.z), ...boat.map((b) => colliderDist(b, c.x, c.z))) - c.r);
  check('there is open water between every two pads, and between the pads and the dock and boat (at least 1.4 m)', closest >= 1.4 && Math.min(...nearDock) >= 1.4, `(closest pair ${closest.toFixed(1)} m at ${closeAt}; closest to the dock or boat ${Math.min(...nearDock).toFixed(1)} m)`);
  const R = lily.map((c) => c.r);
  check('the decor lily pads are twice the old size (2.6-4.2 m across, was 1.3-2.1)', lily.length >= 40 && Math.min(...R) >= 1.0 && R.reduce((a, b) => a + b, 0) / R.length >= 1.3, `(${lily.length} pads, radius ${Math.min(...R).toFixed(2)}-${Math.max(...R).toFixed(2)} m)`);
}
{
  // the ground where the main road, the west and east trails and the dock meet is one calm lawn (level.js `landing`, honoured by terrainPicker, so by the mesh and the debug readout alike). It used to be a
  // mosaic of moss, a darker grass, flower meadow, a pebble shoreline and scraps of cliff on the road embankments, cell by cell: now only grass_a, sand at the water and the roads' own dirt (and paving) may
  // appear inside it, nothing beyond its fade moved, and inside the fade a cell only ever changes to one of those.
  const land = L.landing;
  const pick = terrainPicker(grid);
  const before = terrainPicker(Object.create(grid, { level: { value: { ...L, landing: undefined } } }));          // the same ground without the zone: what it was
  const calm = new Set(['grass_a', 'sand', 'dirt', 'cobble', 'flagstone']);
  const NEED = 16;                                                                  // the lawn must hold at least this far round the pier's foot (the junction of the roads and the shore either side of the dock)
  const inZone = new Set(), wasInZone = new Set(), band = { changed: 0, calmer: 0 };
  let outside = 0, moved = 0;
  for (let x = land.x - 45; x <= land.x + 45; x += 0.8) for (let z = land.z - 45; z <= land.z + 45; z += 0.8) {
    const d = Math.hypot(x - land.x, z - land.z), a = pick.at(x, z).tex, b = before.at(x, z).tex;
    if (d < NEED) { inZone.add(a); wasInZone.add(b); }
    else if (d >= land.r + land.fade) { outside++; if (a !== b) moved++; }
    else if (a !== b) { band.changed++; if (calm.has(a)) band.calmer++; }
  }
  check(`the pier landing is one calm lawn: only grass, sand and the roads' own dirt and paving within ${NEED} m of its foot`, land.r >= NEED && [...inZone].every((t) => calm.has(t)), `(${inZone.size} textures: ${[...inZone].sort().join(', ')}; it was a mosaic of ${wasInZone.size}: ${[...wasInZone].sort().join(', ')})`);
  check('... it really was a mosaic before (the check sees the problem)', wasInZone.size >= 6, `(${wasInZone.size} textures)`);
  check('... nothing beyond the lawn and its fade changed', outside > 5000 && moved === 0, `(${outside} points checked beyond ${land.r + land.fade} m, ${moved} moved)`);
  check('... inside the fade cells only ever change to the calm textures, and some do', band.changed > 50 && band.calmer === band.changed, `(${band.changed} cells changed, ${band.calmer} to grass, sand, dirt or paving)`);
  const lawn = pick.at(land.x - 12, land.z + 12);
  check('... the debug readout names the rule behind it', lawn.tex === 'grass_a' && /landing lawn/.test(lawn.why || ''), `(${lawn.tex}: ${lawn.why})`);
}
{
  // the shore is ONE ground (round thirty-two). The rules used to scatter a second texture over it cell by cell: a fifth of the beach was pebbles, the lake margin a coin toss of moss and grass, the river's edge
  // 30% pebbles. In the smooth look the pebbles are sharp, blue and big against the sand's grains, and that read as hard-edged squares of cobbles lying on the beach. Now the lake's and the river's shore are sand,
  // the moss of the margin lies in patches (a slow noise), and a realm that names a second ground for its lake's edge (snow on ice) gets it in banks. "Disagree" below is the share of neighbouring cells (in a
  // row) that are different textures: a coin toss is about a half, a patch of ground is a few in ten, and a plain beach none.
  const pick = terrainPicker(grid), n = grid.n;
  const cells = (picker) => {
    const tex = new Array(n * n), why = new Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const t = picker.tris(i, j); tex[j * n + i] = t[0].tex === t[1].tex ? t[0].tex : null; why[j * n + i] = t[0].why; }
    return { tex, why };
  };
  const disagree = ({ tex, why }, rule, pick = (a) => tex[a]) => {
    let pairs = 0, diff = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1; if (why[a] === rule && why[b] === rule && pick(a) && pick(b)) { pairs++; if (pick(a) !== pick(b)) diff++; } }
    return { pairs, share: pairs ? diff / pairs : 0 };
  };
  const real = cells(pick);
  const count = (rule) => { const by = {}; real.why.forEach((w, k) => { if (w === rule && real.tex[k]) by[real.tex[k]] = (by[real.tex[k]] || 0) + 1; }); return by; };
  const shore = count('lake shore'), riverShore = count('river shore');
  check('the lake\'s shore is one ground: sand, with no scatter of pebbles', Object.keys(shore).join() === 'sand' && shore.sand > 150, `(${JSON.stringify(shore)})`);
  check('... and the river\'s edge too', Object.keys(riverShore).join() === 'sand' && riverShore.sand > 5, `(${JSON.stringify(riverShore)})`);
  const margin = disagree(real, 'lake margin');
  const toss = (a) => { let h = Math.imul((a % n) + 1, 374761393) ^ Math.imul(Math.floor(a / n) + 7, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 < 0.5 ? 'moss' : 'grass_b'; };       // (the old rule's coin: a hash of the cell)
  const coin = disagree(real, 'lake margin', toss);
  check('the lake margin\'s moss lies in patches: neighbouring cells agree (a coin toss would disagree about half the time)', margin.pairs > 25 && margin.share < 0.3 && coin.share > 0.4, `(${(100 * margin.share).toFixed(0)}% of ${margin.pairs} pairs disagree; a coin toss over the same cells ${(100 * coin.share).toFixed(0)}%)`);
  // a realm with a frozen lake names snow for its lake's edge: it lies in banks, not cell by cell
  const frozen = cells(terrainPicker(Object.create(grid, { level: { value: { ...L, lakeTextures: { floor: 'ice', shore: 'ice', pebbles: 'snow' } } } })));
  const fz = (() => { const by = {}; frozen.why.forEach((w, k) => { if (w === 'lake shore' && frozen.tex[k]) by[frozen.tex[k]] = (by[frozen.tex[k]] || 0) + 1; }); return by; })();
  const bank = disagree(frozen, 'lake shore');
  check('a second ground named for the lake\'s edge (snow on ice) lies in banks: some of the shore, neighbours agree', fz.snow > 10 && fz.snow < fz.ice && bank.share < 0.25, `(${JSON.stringify(fz)}; ${(100 * bank.share).toFixed(0)}% of ${bank.pairs} pairs disagree)`);
}
{
  // the roads are DRAPED on the terrain mesh (roads.js). Every lane of a ribbon used to stand at the height of the road's centre line, so on a slope the edges hovered above the ground on the
  // downhill side (1.2 m at the pier's landing, where three roads meet on a bank) and were buried on the uphill side: planks sticking out of the hillside. Now every vertex of every road
  // triangle lies on the terrain surface plus a small constant lift, nothing is lost, and cobble sits over dirt where two roads meet.
  const roads = buildRoads(grid, lighting);
  const tris = [];
  let worst = 0, nan = 0, down = 0, verts = 0;
  for (const surface of ['cobble', 'dirt']) {
    const b = roads[surface];
    if (!b) continue;
    for (let i = 0; i < b.pos.length; i += 9) {
      const P = [0, 1, 2].map((k) => [b.pos[i + k * 3], b.pos[i + k * 3 + 1], b.pos[i + k * 3 + 2]]);
      for (const p of P) { verts++; if (!p.every(Number.isFinite)) { nan++; continue; } worst = Math.max(worst, Math.abs(p[1] - (grid.heightAt(p[0], p[2]) + ROAD_LIFT[surface]))); }
      const cy = (P[1][0] - P[0][0]) * (P[2][2] - P[0][2]) - (P[1][2] - P[0][2]) * (P[2][0] - P[0][0]);             // (up-facing triangles, as the terrain's own)
      if (cy > 0) down++;
      tris.push({ surface, P });
    }
  }
  check('every road vertex lies on the terrain surface (plus its lift): no edge hovers, none is buried', nan === 0 && worst < 0.002, `(${tris.length} triangles, ${verts} vertices, worst ${(worst * 1000).toFixed(3)} mm off)`);
  check('... every road triangle faces up', down === 0, `(${down} face down)`);
  const st = roads.stats;
  check('... and the roads are all there: what is drawn, what lies under water and the few metres on ground too steep for a road are the whole ribbon', Math.abs(st.draped + st.submerged + st.steep - st.footprint) < 0.005 * st.footprint && st.submerged < 0.02 * st.footprint && st.steep < 0.02 * st.footprint, `(${st.footprint.toFixed(0)} m2 of road, ${st.draped.toFixed(0)} drawn, ${st.submerged.toFixed(0)} under water, ${st.steep.toFixed(0)} on ground steeper than ${(ROAD_MAX_SLOPE * 57.3).toFixed(0)} degrees)`);
  // what the old ribbons did, for the record: the lanes at the centre line's height
  let lanes = 0, off25 = 0, off50 = 0, far = 0;
  for (const p of grid.paths) for (let i = 0; i < p.pts.length; i++) {
    const a = p.pts[Math.max(i - 1, 0)], c = p.pts[Math.min(i + 1, p.pts.length - 1)];
    let fx = c[0] - a[0], fz = c[2] - a[2]; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
    for (const k of [-1, 1]) {
      const x = p.pts[i][0] - fz * (p.width / 2) * k, z = p.pts[i][2] + fx * (p.width / 2) * k, d = Math.abs(grid.heightAt(x, z) - grid.heightAt(p.pts[i][0], p.pts[i][2]));
      lanes++; if (d > 0.25) off25++; if (d > 0.5) off50++; far = Math.max(far, d);
    }
  }
  check('(the old ribbons would have stood off the ground by more than 25 cm at a tenth of their edges: the check sees the problem)', off25 > lanes * 0.05, `(${off25} of ${lanes} edge samples over 25 cm, ${off50} over 50 cm, up to ${far.toFixed(2)} m)`);
  // the pier's landing, where the main road, the west and east trails and the dock meet: a cobble triangle over the junction, above a dirt one
  const at = (surface, x, z) => { for (const t of tris) if (t.surface === surface) { const [A, B, C] = t.P; const d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]); const w0 = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / d, w1 = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / d, w2 = 1 - w0 - w1; if (w0 >= -1e-9 && w1 >= -1e-9 && w2 >= -1e-9) return w0 * A[1] + w1 * B[1] + w2 * C[1]; } return null; };
  let over = 0, both = 0, worstGap = Infinity;
  for (const [x, z] of [[-4, 79], [-4, 80.5], [-5, 81], [-3.5, 78.5], [-5, 79.2], [-4.5, 80]]) {
    const c = at('cobble', x, z), d = at('dirt', x, z);
    if (c !== null && d !== null) { both++; worstGap = Math.min(worstGap, c - d); if (c - d >= 0.015) over++; }
  }
  check('where the cobble main road crosses the dirt trails at the pier it lies over them (and z-fights with nothing)', both >= 3 && over === both && ROAD_LIFT.cobble > ROAD_LIFT.dirt && ROAD_DECAL.cobble > 1, `(${both} junction points, cobble at least ${(worstGap * 100).toFixed(1)} cm above dirt)`);
}
{
  // ---- roads that meet are one surface ---------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Two roads of a kind that overlap (a trail joining the main road, a fork, a bend folding over itself) used to be two layers with their own texture directions and their own darker edges: the
  // seam of one road's edge showed across the other's middle and, at the same height, the layers fought (a sawtooth). Now the texture is mapped from the world and the edge shading comes from
  // the distance to the nearest edge of ANY road of the kind, so wherever two triangles of one kind cover a point they must agree on both.
  const roads = buildRoads(grid, lighting);
  let badUv = 0, verts = 0;
  const tris = { cobble: [], dirt: [] };
  for (const surface of ['cobble', 'dirt']) {
    const b = roads[surface];
    if (!b) continue;
    for (let i = 0; i < b.pos.length; i += 9) {
      const T = [0, 1, 2].map((k) => ({ x: b.pos[i + k * 3], y: b.pos[i + k * 3 + 1], z: b.pos[i + k * 3 + 2], u: b.uvs[(i / 3 + k) * 2], v: b.uvs[(i / 3 + k) * 2 + 1], c: b.colA[(i / 3 + k) * 4] / 255 }));
      for (const p of T) { verts++; if (Math.abs(p.u - p.x / 5) > 1e-4 || Math.abs(p.v - p.z / 5) > 1e-4) badUv++; }
      tris[surface].push(T);
    }
  }
  check('every road vertex maps its texture from the world (u = x / 5, v = z / 5), so two layers of one road can never disagree about it', badUv === 0, `(${verts} vertices, ${badUv} off)`);
  let covered2 = 0, worstTint = 0, tested = 0;
  for (const surface of ['cobble', 'dirt']) {
    const T = tris[surface], CS = 6, hash = new Map();
    T.forEach((t, ti) => { const xs = t.map((p) => p.x), zs = t.map((p) => p.z); for (let cx = Math.floor(Math.min(...xs) / CS); cx <= Math.floor(Math.max(...xs) / CS); cx++) for (let cz = Math.floor(Math.min(...zs) / CS); cz <= Math.floor(Math.max(...zs) / CS); cz++) { const k = cx + ',' + cz; if (!hash.has(k)) hash.set(k, []); hash.get(k).push(ti); } });
    const cover = (x, z) => {
      const out = [];
      for (const ti of hash.get(Math.floor(x / CS) + ',' + Math.floor(z / CS)) || []) {
        const [A, B, C] = T[ti];
        const d = (B.z - C.z) * (A.x - C.x) + (C.x - B.x) * (A.z - C.z);
        const w0 = ((B.z - C.z) * (x - C.x) + (C.x - B.x) * (z - C.z)) / d, w1 = ((C.z - A.z) * (x - C.x) + (A.x - C.x) * (z - C.z)) / d, w2 = 1 - w0 - w1;
        if (w0 > 1e-6 && w1 > 1e-6 && w2 > 1e-6) out.push({ tint: w0 * A.c + w1 * B.c + w2 * C.c });
      }
      return out;
    };
    let seed = 777; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (const p of grid.paths) {
      if (p.surface !== surface) continue;
      for (let n = 0; n < 500; n++) {
        const q = p.pts[Math.floor(rnd() * p.pts.length)], a = rnd() * 6.283, r = rnd() * p.width * 0.75;
        const hit = cover(q[0] + Math.cos(a) * r, q[2] + Math.sin(a) * r);
        tested++;
        if (hit.length < 2) continue;
        covered2++;
        const ts = hit.map((h) => h.tint);
        worstTint = Math.max(worstTint, Math.max(...ts) - Math.min(...ts));
      }
    }
  }
  check('where two layers of one kind of road lie on top of each other they look the same (same texture point, same worn-edge shading)', covered2 > 150 && worstTint < 0.08, `(${covered2} of ${tested} sampled points are covered twice or more, the shading differs by at most ${worstTint.toFixed(3)})`);

  // ---- the ground beside a road is the ground ------------------------------------------------------------------------------------------------------------------------------------------------------
  // A terrain triangle carries the road's texture only when a ribbon covers ALL of it (and the ground is gentle enough for a road): the dirt used to spread over whole cells round a road, a ragged
  // stair-step beside the ribbon's smooth edge. (It is the one rule that can give the terrain 'dirt' or 'cobble', so the converse is checked as well.)
  const pick = terrainPicker(grid);
  const inside = (x, z) => grid.paths.some((pp) => pp.surface !== 'flagstone' && (() => { let best = Infinity; for (let k = 0; k < pp.pts.length - 1; k++) { const a = pp.pts[k], b = pp.pts[k + 1], vx = b[0] - a[0], vz = b[2] - a[2], l2 = vx * vx + vz * vz || 1; const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[2]) * vz) / l2)); best = Math.min(best, Math.hypot(x - (a[0] + vx * t), z - (a[2] + vz * t))); } return best <= pp.width / 2 + 0.6; })());
  // the ribbon's real footprint: a road ENDS in a flat edge (nothing past its last point), and a corner may lie 0.1 m past the ribbon's side (see UNDER_REACH in roads.js)
  const underRibbon = (x, z) => grid.paths.some((pp) => {
    if (pp.surface === 'flagstone') return false;
    let near = null;
    for (let k = 0; k < pp.pts.length - 1; k++) {
      const a = pp.pts[k], b = pp.pts[k + 1], vx = b[0] - a[0], vz = b[2] - a[2], l2 = vx * vx + vz * vz || 1, tr = ((x - a[0]) * vx + (z - a[2]) * vz) / l2, t = Math.max(0, Math.min(1, tr));
      const dc = Math.hypot(x - (a[0] + vx * t), z - (a[2] + vz * t));
      if (!near || dc < near.dc) near = { dc, off: (tr < 0 && k === 0) || (tr > 1 && k === pp.pts.length - 2) };
    }
    return !near.off && near.dc <= pp.width / 2 + 0.1 + 1e-9;
  });
  let roadTris = 0, strays = 0, strayAt = '';
  for (let j = 0; j < grid.n; j++) for (let i = 0; i < grid.n; i++) {
    const x = -grid.half + i * grid.cell;
    if (x < -60 || x > 120 || j * grid.cell - grid.half < -130 || j * grid.cell - grid.half > 150) continue;       // (the regions the roads run through: keeps the brute force short)
    for (const t of pick.tris(i, j)) {
      if (t.tex !== 'dirt' && t.tex !== 'cobble') continue;
      roadTris++;
      if (!t.p.every((c) => underRibbon(c[0], c[2]))) { strays++; if (!strayAt) strayAt = `${t.p[0][0].toFixed(0)}, ${t.p[0][2].toFixed(0)}`; }
    }
  }
  check('every terrain triangle that is textured as a road lies entirely under a road ribbon, flat ends and all (no ragged dirt beside one, none past a road\'s end)', roadTris > 100 && strays === 0, `(${roadTris} triangles, ${strays} stray${strays ? ', first at ' + strayAt : ''})`);
  // what the carve's distance field says on its own (a round cap past every end of a path): the terrain used to take its road texture from it
  let capTris = 0, capStrays = 0;
  for (let j = 0; j < grid.n; j++) for (let i = 0; i < grid.n; i++) {
    const x = -grid.half + i * grid.cell, z = -grid.half + j * grid.cell;
    if (x < -60 || x > 120 || z < -130 || z > 150) continue;
    for (const t of pick.tris(i, j)) {
      const pdMax = Math.max(...t.idx.map(([a, b]) => grid.pathDist[b * (grid.n + 1) + a]));
      const near = t.idx.map(([a, b]) => grid.pathIdx[b * (grid.n + 1) + a]).filter((k) => k >= 0).map((k) => grid.paths[k].surface);
      if (!(pdMax <= UNDER_ROAD && t.slope <= ROAD_MAX_SLOPE && near.some((sf) => sf === 'dirt' || sf === 'cobble'))) continue;
      capTris++;
      if (!t.p.every((c) => underRibbon(c[0], c[2]))) capStrays++;
    }
  }
  check('(by the carve\'s round caps alone, triangles past the ends of roads would still carry the road\'s texture: the check sees the problem)', capStrays >= 10, `(${capStrays} of ${capTris} triangles)`);
  const legacy = { ...pick };                                                  // (the old rule: the cell's average distance to a road decides)
  let oldStrays = 0, oldTris = 0;
  const pd = grid.pathDist, s1 = grid.n + 1;
  for (let j = 0; j < grid.n; j++) for (let i = 0; i < grid.n; i++) {
    const x = -grid.half + i * grid.cell, z = -grid.half + j * grid.cell;
    if (x < -60 || x > 120 || z < -130 || z > 150) continue;
    if ((pd[j * s1 + i] + pd[j * s1 + i + 1] + pd[(j + 1) * s1 + i] + pd[(j + 1) * s1 + i + 1]) / 4 < 0.3) { oldTris++; if (![[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].every(([a, b]) => inside(-grid.half + a * grid.cell, -grid.half + b * grid.cell))) oldStrays++; }
  }
  void legacy;
  check('(the old rule painted dirt on cells only partly under a road, often: the check sees the problem)', oldStrays > oldTris * 0.2, `(${oldStrays} of ${oldTris} cells)`);

  // ---- every ribbon is whole up to its flat end -----------------------------------------------------------------------------------------------------------------------------------------------------
  // A road ending on a hillside lays the corners of its last row on steep triangles, and the ribbon used to drop every piece on ground steeper than ROAD_MAX_SLOPE however small: scraps of 0.1 to 0.3 m2
  // at the end of the east road bit a V out of the straight end of the ribbon and bared a wedge of the ground's own texture. Scraps under STEEP_SCRAP are drawn now. Sampled across 90 % of the width,
  // over the last 1.2 m of both ends of every road (the water's edge excepted: a ribbon is dropped under water).
  const T = [], CS = 6, hash = new Map();
  for (const surface of ['cobble', 'dirt']) {
    const b = roads[surface];
    if (!b) continue;
    for (let i = 0; i < b.pos.length; i += 9) T.push([[b.pos[i], b.pos[i + 2]], [b.pos[i + 3], b.pos[i + 5]], [b.pos[i + 6], b.pos[i + 8]]]);
  }
  T.forEach((t, ti) => { const xs = t.map((q) => q[0]), zs = t.map((q) => q[1]); for (let cx = Math.floor(Math.min(...xs) / CS); cx <= Math.floor(Math.max(...xs) / CS); cx++) for (let cz = Math.floor(Math.min(...zs) / CS); cz <= Math.floor(Math.max(...zs) / CS); cz++) { const k = cx + ',' + cz; if (!hash.has(k)) hash.set(k, []); hash.get(k).push(ti); } });
  const ribbonAt = (x, z) => {
    for (const ti of hash.get(Math.floor(x / CS) + ',' + Math.floor(z / CS)) || []) {
      const [A, B, C] = T[ti], d = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
      const w0 = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (z - C[1])) / d, w1 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (z - C[1])) / d;
      if (w0 >= -1e-9 && w1 >= -1e-9 && 1 - w0 - w1 >= -1e-9) return true;
    }
    return false;
  };
  let endSamples = 0, endHoles = 0, holeAt = '';
  for (const pp of grid.paths) {
    if (pp.surface !== 'dirt' && pp.surface !== 'cobble') continue;
    const hw = pp.width / 2;
    for (const [e, nb] of [[pp.pts[0], pp.pts[1]], [pp.pts[pp.pts.length - 1], pp.pts[pp.pts.length - 2]]]) {
      const dx = nb[0] - e[0], dz = nb[2] - e[2], l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;          // (the unit vector from the end inwards)
      for (let a = 0.12; a <= 1.2; a += 0.1) for (let sd = -0.9 * hw; sd <= 0.9 * hw + 1e-9; sd += 0.1) {
        const x = e[0] + ux * a - uz * sd, z = e[2] + uz * a + ux * sd;
        if (grid.heightAt(x, z) < WATER_LEVEL + 0.1) continue;
        endSamples++;
        if (!ribbonAt(x, z)) { endHoles++; if (!holeAt) holeAt = `${pp.id} at ${x.toFixed(1)}, ${z.toFixed(1)}`; }
      }
    }
  }
  check('every road ribbon is whole up to its flat end: no hole in the last 1.2 m of any end (the east road\'s end had a V bitten out of it)', endSamples > 5000 && endHoles === 0, `(${endSamples} samples, ${endHoles} not covered${endHoles ? ', first ' + holeAt : ''})`);
}
{
  // ---- ground textures are laid on without smearing -------------------------------------------------------------------------------------------------------------------------------------------------
  // Rock is projected like a wall from a gentle slope on (its strata are horizontal), everything else from the side its plane faces: the dominant axis of the triangle's own normal, which can stretch
  // a texture by 1.73 times at most (the square root of 3). A grass bank steeper than 0.62 used to be projected as a wall like the rock too, which drops the sideways direction of the slope from the
  // texture's coordinates: 120 triangles of the realm were stretched more than 1.8 times, 23 more than 3 (a smeared green wedge at the end of the east road, banks of the lake and of the river).
  const pick = terrainPicker(grid), G = GROUND_TILE;
  const isRock = (tex) => tex === 'cliff' || tex === 'cliff_warm' || tex === 'far_rock';
  const stretchOf = (t, mode) => {
    const uv = t.p.map((q) => projectUV(q, mode)), g = triangleNormal(t.p[0], t.p[1], t.p[2]);
    const surface = Math.hypot(g[0], g[1], g[2]) / 2, tex = Math.abs((uv[1][0] - uv[0][0]) * (uv[2][1] - uv[0][1]) - (uv[2][0] - uv[0][0]) * (uv[1][1] - uv[0][1])) / 2 * G * G;
    return surface / Math.max(tex, 1e-9);
  };
  let nT = 0, worst = 0, over = 0, oldOver = 0, oldWorst = 0, rockT = 0, rockWallBad = 0;
  for (let j = 0; j < grid.n; j++) for (let i = 0; i < grid.n; i++) for (const t of pick.tris(i, j)) {
    const fn = t.idx.map(([a, b]) => grid.vertexNormal(a, b)), faceN = [0, 1, 2].map((k) => fn[0][k] + fn[1][k] + fn[2][k]);
    const mode = uvProjection(t.tex, t.slope, faceN, triangleNormal(t.p[0], t.p[1], t.p[2]));
    if (isRock(t.tex)) {                                                            // (rock: a wall from 0.35 (cliff) / 0.62 (far rock) on, along the smoothed normal's axis, as before)
      rockT++;
      const wall = t.tex === 'far_rock' ? t.slope > 0.62 : t.slope > 0.35, axis = Math.abs(faceN[0]) > Math.abs(faceN[2]) ? 'wallX' : 'wallZ';
      if (mode !== (wall ? axis : 'planar')) rockWallBad++;
      continue;
    }
    nT++;
    const st = stretchOf(t, mode); worst = Math.max(worst, st); if (st > 1.8) over++;
    const old = t.slope > 0.62 ? (Math.abs(faceN[0]) > Math.abs(faceN[2]) ? 'wallX' : 'wallZ') : 'planar', so = stretchOf(t, old);
    oldWorst = Math.max(oldWorst, so); if (so > 1.8) oldOver++;
  }
  check('the ground that is not rock is laid on from the side its plane faces: no triangle is stretched more than 1.75 times (the limit is 1.73)', nT > 10000 && worst < 1.75, `(${nT} triangles, worst ${worst.toFixed(2)} times, ${over} above 1.8)`);
  check('(the old rule projected every face steeper than 0.62 as a wall: the check sees the problem)', oldOver >= 60 && oldWorst > 3, `(${oldOver} triangles above 1.8 times, worst ${oldWorst.toFixed(0)} times)`);
  check('rock is laid out as it was: a wall from 0.35 (cliff) or 0.62 (far rock) on, along the axis of the smoothed normal, from above below that', rockT > 5000 && rockWallBad === 0, `(${rockT} rock triangles, ${rockWallBad} different)`);
  const up = [0, 1, 0], side = [1, 0.2, 0];
  check('uvProjection: a gentle bank of grass is planar, only a plane that looks more sideways than up is a wall', uvProjection('grass_a', 0.7, up, [0.4, 0.8, 0.3]) === 'planar' && uvProjection('grass_a', 1.0, side, [0.9, 0.5, 0.1]) === 'wallX' && uvProjection('grass_a', 1.0, side, [0.1, 0.5, 0.9]) === 'wallZ' && uvProjection('cliff', 0.4, side, up) === 'wallX' && uvProjection('cliff', 0.3, side, up) === 'planar' && uvProjection('far_rock', 0.6, side, up) === 'planar' && uvProjection('far_rock', 0.7, side, up) === 'wallX');
}
{
  // ---- rock and grass on a hillside come in patches ---------------------------------------------------------------------------------------------------------------------------------------------
  // On slopes of 0.5 to 0.74 (29 to 42 degrees) rock begins where the slope passes a limit. It used to be a hash of the cell, a coin toss that changed from one cell to the next, so a plain flank of
  // 33 degrees was a salt-and-pepper of cliff and grass triangles (623 cliff triangles of the realm came from it); now the limit wanders slowly with the position, so the rock lies in patches.
  const hash01 = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  let sNew = 0, sOld = 0, cnt = 0, lo = 9, hi = 0;
  for (let i = -60; i < 60; i++) for (let j = -60; j < 60; j++) {
    const x = i * grid.cell, z = j * grid.cell, a = rockLimit(x, z);
    lo = Math.min(lo, a); hi = Math.max(hi, a);
    sNew += Math.abs(a - rockLimit(x + grid.cell, z)) + Math.abs(a - rockLimit(x, z + grid.cell));
    sOld += Math.abs(hash01(i, j) / 3.5 - hash01(i + 1, j) / 3.5) + Math.abs(hash01(i, j) / 3.5 - hash01(i, j + 1) / 3.5);
    cnt += 2;
  }
  check('the slope at which rock begins stays between 0.5 and 0.74 and varies from place to place (there are patches)', lo >= 0.5 - 1e-9 && hi <= 0.74 + 1e-9 && hi - lo > 0.18, `(${lo.toFixed(2)} .. ${hi.toFixed(2)})`);
  check('... and it changes slowly: neighbouring cells differ by under 0.03 on average (no coin toss per cell)', sNew / cnt < 0.03, `(mean step ${(sNew / cnt).toFixed(3)} per 2.4 m)`);
  check('(the old limit was a hash of the cell: 0.09 on average from one cell to the next, the check sees the problem)', sOld / cnt > 0.07, `(mean step ${(sOld / cnt).toFixed(3)})`);
}
{
  // ---- the river ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Its water used to be a flat ribbon 7.9 m wide over a channel that is wider: on 107 of its 110 edge samples the edge hung 0.2 to 1.3 m above the bank, so translucent sheets floated in front of
  // the banks, and near the lake it floated over a dry hollow. Now the water is cut to the terrain: it exists exactly where the ground is below its surface.
  const { builder, stats } = buildRiverWater(grid, lighting);
  const P = builder.pos, r = grid.rivers[0], m = riverWaterLength(L, r.pts);
  let deepest = 0, above = 0, nanW = 0;
  for (let i = 0; i < P.length; i += 3) {
    if (![P[i], P[i + 1], P[i + 2]].every(Number.isFinite)) { nanW++; continue; }
    const depth = P[i + 1] - grid.heightAt(P[i], P[i + 2]);
    deepest = Math.max(deepest, depth); if (depth < -0.002) above++;
  }
  check('the river water never lies under the ground, and is never deeper than the carved channel (1.5 m under its profile, less the 0.12 the water sits below it)', nanW === 0 && above === 0 && deepest < 1.5, `(${P.length / 9} triangles; deepest ${deepest.toFixed(2)} m)`);
  // raster check: beside every edge of the water the ground is at or above the water; no water wall anywhere but the ribbon's two ends
  const tri = [];
  for (let i = 0; i < P.length; i += 9) tri.push([[P[i], P[i + 1], P[i + 2]], [P[i + 3], P[i + 4], P[i + 5]], [P[i + 6], P[i + 7], P[i + 8]]]);
  const CS = 4, hash = new Map();
  tri.forEach((t, ti) => { const xs = t.map((p) => p[0]), zs = t.map((p) => p[2]); for (let cx = Math.floor(Math.min(...xs) / CS); cx <= Math.floor(Math.max(...xs) / CS); cx++) for (let cz = Math.floor(Math.min(...zs) / CS); cz <= Math.floor(Math.max(...zs) / CS); cz++) { const k = cx + ',' + cz; if (!hash.has(k)) hash.set(k, []); hash.get(k).push(ti); } });
  const waterAt = (x, z) => {
    for (const ti of hash.get(Math.floor(x / CS) + ',' + Math.floor(z / CS)) || []) {
      const [A, B, C] = tri[ti], d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
      const w0 = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / d, w1 = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / d, w2 = 1 - w0 - w1;
      if (w0 >= -1e-9 && w1 >= -1e-9 && w2 >= -1e-9) return w0 * A[1] + w1 * B[1] + w2 * C[1];
    }
    return null;
  };
  const first = r.pts[0], last = r.pts[m - 1], STEP = 0.2;
  let edge = 0, walls = 0, worstWall = 0;
  for (let x = 30; x <= 82; x += STEP) for (let z = -74; z <= 6; z += STEP) {
    if (waterAt(x, z) !== null) continue;
    let nb = null;
    for (const [dx, dz] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) { const v = waterAt(x + dx, z + dz); if (v !== null) { nb = v; break; } }
    if (nb === null) continue;
    edge++;
    if (Math.hypot(x - first[0], z - first[2]) < 9 || Math.hypot(x - last[0], z - last[2]) < 9) continue;          // (the two ends of the ribbon: the waterfall's pool and the lake)
    const gap = nb - grid.heightAt(x, z);
    if (gap > 0.3) { walls++; worstWall = Math.max(worstWall, gap); }
  }
  check('the water stops only at the waterline: nowhere does it end with the ground still below it (no hanging edge, no sheet floating over a bank)', edge > 400 && walls === 0, `(${edge} samples along its edge, ${walls} with ground more than 30 cm below the water beside it${walls ? `, worst ${worstWall.toFixed(2)} m` : ''})`);
  // what the old ribbon did (its edge lanes at the profile height, 7.9 m wide)
  let hang = 0, lanesN = 0;
  r.pts.forEach((p, i) => {
    const a = r.pts[Math.max(i - 1, 0)], c = r.pts[Math.min(i + 1, r.pts.length - 1)];
    let fx = c[0] - a[0], fz = c[2] - a[2]; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
    for (const k of [-1, 1]) { const x = p[0] - fz * ((r.width + 1.4) / 2) * k, z = p[2] + fx * ((r.width + 1.4) / 2) * k; lanesN++; if (p[1] - 0.12 - grid.heightAt(x, z) > 0.15) hang++; }
  });
  check('(the old ribbon hung more than 15 cm above the ground along nearly all of both its edges: the check sees the problem)', hang > lanesN * 0.8, `(${hang} of ${lanesN} edge samples)`);
  // the mouth: the water's surface comes down to the lake's own level where the river ends, and never rises on the way
  const surf = r.surf.slice(0, m);
  let rises = 0; for (let i = 1; i < surf.length; i++) if (surf[i] > surf[i - 1] + 1e-6) rises++;
  check('the river flows downhill into the lake and meets it without a step (its surface ends at the lake level, and never rises along the way)', Math.abs(surf.at(-1) - WATER_LEVEL) < 0.02 && rises === 0, `(${surf[0].toFixed(2)} at the source, ${surf.at(-1).toFixed(3)} at the lake; ${rises} rises; the profile it is carved from ends ${(r.pts[m - 1][1] - 0.12).toFixed(2)} above it)`);
  // ---- its banks ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const pick = terrainPicker(grid);
  const old = terrainPicker(Object.create(grid, { riverSurf: { value: undefined } }));                      // the same ground without the river rules: what it was
  let rock = 0, oldRock = 0, near = 0, bedWrong = 0, bed = 0;
  for (let j = 0; j < grid.n; j++) for (let i = 0; i < grid.n; i++) {
    const x = -grid.half + i * grid.cell, z = -grid.half + j * grid.cell;
    if (x < 30 || x > 85 || z < -80 || z > 8) continue;
    const k = j * (grid.n + 1) + i, rd = (grid.riverDist[k] + grid.riverDist[k + 1] + grid.riverDist[k + grid.n + 1] + grid.riverDist[k + grid.n + 2]) / 4;
    if (rd >= RIVER_ZONE) continue;
    const a = pick.tris(i, j), b = old.tris(i, j);
    for (let q = 0; q < 2; q++) {
      near++;
      if (/cliff/.test(a[q].tex) && a[q].slope < 1.35) rock++;
      if (/cliff/.test(b[q].tex)) oldRock++;
      const rs = grid.riverSurf[k];
      if (a[q].why === 'river bed') { bed++; if (a[q].tex !== 'sand') bedWrong++; }
      void rs;
    }
  }
  check('the river banks are not rock: no cliff texture on the banks unless the ground there is all but vertical (over 77 degrees)', rock === 0 && near > 100 && bed > 20 && bedWrong === 0, `(${near} triangles by the river, ${rock} rocky; ${bed} river-bed triangles, all sand)`);
  check('(the old rules made walls of purple rock of the carved banks: the check sees the problem)', oldRock > 20, `(${oldRock} of ${near} triangles)`);
}

// ---- the realm's terrain mesh is what the rules chose --------------------------------------------------------------------------------
{
  // A level that names its steep slope (the homeworld) has the border of its rock cut along a contour, which makes more triangles than the rules chose; the realm names none, and its mesh must be
  // exactly what the picker says: two triangles for each cell, each with its own texture.
  const group = buildTerrainMeshes(grid, lighting, { mat: (nm) => ({ name: nm }) }).group, byTex = {};
  let tris = 0;
  for (const m of group.children) { const c = m.geometry.getAttribute('position').count / 3; byTex[m.name.slice('terrain:'.length)] = c; tris += c; }
  const picker = terrainPicker(grid), want = {};
  for (let j = 0; j < grid.n; j++) for (let i = 0; i < grid.n; i++) for (const t of picker.tris(i, j)) want[t.tex] = (want[t.tex] || 0) + 1;
  check('the realm\'s terrain mesh is exactly what the rules chose (no triangle is cut: only a level with a steep slope of its own cuts its borders)', grid.level.steepSlope === undefined && tris === grid.n * grid.n * 2 && Object.keys(want).every((k) => want[k] === byTex[k]), `(${tris} triangles for ${grid.n * grid.n} cells)`);
}
process.exitCode = checks.every(Boolean) ? 0 : 1;
