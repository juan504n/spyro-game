// Dawnhaven (the homeworld) checked headlessly: both level passes run without a GPU and the data they produce is held to what the design promises: five doors on level ground that
// the roads reach, an arrival that is not itself a trigger, three secrets (a chest each), a hidden garden that is sealed until its wall is broken, a gate that holds, a world that is
// walkable from end to end. Exit code 1 when a check fails. No dev server needed:  node tools/home-check.mjs
import { buildHeadless } from './headless-world.mjs';
import { DOORS, SECRETS, inFront, polar, DOOR_R } from '../src/game/home/level.js';
import { SLOPE_WALK } from '../src/game/collision.js';
import { terrainPicker } from '../src/game/terrain-mesh.js';
import { WATER_LEVEL } from '../src/game/level.js';

const { grid, kit, dryCtx: ctx, gp, collision, level: L, ms } = buildHeadless('home');
console.log('populate ms', Math.round(ms), '(terrain + both passes, headless)');
console.log('placements', JSON.stringify(ctx.counts));
console.log('kit tris', kit.triangleCount(), 'colliders', kit.colliders.length, 'lights', kit.lights.length, 'emitters', kit.emitters.length);
console.log('gems', gp.gems.length, JSON.stringify(gp.gemBreakdown), 'TOTAL', gp.gemsTotal);

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };
const h = (x, z) => grid.heightAt(x, z);
const f1 = (v) => v.toFixed(1);

// ---- the doors ---------------------------------------------------------------------------------------------------------------------
{
  const sealed = gp.portals.filter((p) => p.state === 'sealed'), open = gp.portals.filter((p) => p.state === 'open');
  check('five doors: one awake (Gloaming Vale), four that still sleep', gp.portals.length === 5 && open.length === 1 && open[0].target === 'gloaming' && sealed.length === 4 && sealed.every((p) => !p.target), `(${gp.portals.map((p) => `${p.id}:${p.state}`).join(' ')})`);
  for (const d of DOORS) {
    const gys = [[-3, 0], [3, 0], [0, 0], [0, 3], [-3, 3], [3, 3], [0, 6]].map(([s, f]) => { const [x, z] = inFront(d, f, s); return h(x, z); });
    const spread = Math.max(...gys) - Math.min(...gys);
    check(`door ${d.id}: on a level terrace`, spread < 0.35, `(ground ${f1(Math.min(...gys))}..${f1(Math.max(...gys))})`);
    const road = grid.paths.find((p) => p.id === `spoke_${d.id}`), end = road.pts[road.pts.length - 1];
    check(`door ${d.id}: its road runs up to the dais`, Math.hypot(end[0] - d.x, end[2] - d.z) < 12, `(${f1(Math.hypot(end[0] - d.x, end[2] - d.z))} m from the door)`);
    let worst = 0; for (let i = 1; i < road.pts.length; i++) worst = Math.max(worst, Math.atan2(Math.abs(road.pts[i][1] - road.pts[i - 1][1]), Math.hypot(road.pts[i][0] - road.pts[i - 1][0], road.pts[i][2] - road.pts[i - 1][2])));
    check(`door ${d.id}: its road is an easy walk`, worst < 0.3, `(steepest ${worst.toFixed(2)} rad)`);
    const colliders = collision.colliders.filter((c) => c.tag === 'door' || c.tag === 'seal');
    const opening = collision.blocking(d.x, h(d.x, d.z) + 1.0, d.z, 0.4);
    check(`door ${d.id}: ${d.target ? 'the opening is free to walk into' : 'the opening is shut with stone'}`, d.target ? !opening : !!opening, `(${colliders.length} door colliders in all)`);
  }
  const g = gp.arrivals.gloaming, d0 = DOORS[0], s = Math.sin(d0.yaw), c = Math.cos(d0.yaw);
  const along = (g.x - d0.x) * s + (g.z - d0.z) * c;
  check('the hero arrives in front of the Gloaming door, well clear of its trigger', along > 8 && Math.abs(g.yaw - d0.yaw) < 1e-6, `(${f1(along)} m in front, facing the plaza)`);
  check('the first spawn is the same place', Math.hypot(gp.spawn.x - g.x, gp.spawn.z - g.z) < 2);
}

// ---- the secrets -----------------------------------------------------------------------------------------------------------------------
{
  const ids = gp.chests.map((c) => c.secret).filter(Boolean).sort();
  check('three secrets, a chest each', ids.join() === SECRETS.map((s) => s.id).sort().join(), `(${ids.join(', ')})`);
  for (const c of gp.chests) {
    const under = collision.support(c.x, c.z, c.y + 0.3, 0.3).y;
    check(`chest ${c.secret}: it stands on firm ground (${c.src})`, Math.abs(under - c.y) < 0.9, `(chest y ${f1(c.y)}, surface under it ${f1(under)})`);
  }
  const pond = gp.chests.find((c) => c.secret === 'pond'), K = L.lake;
  check('the pond\'s chest is on the islet, out in the water', Math.hypot(pond.x - K.x, pond.z - K.z) < 3 && h(pond.x, pond.z) > WATER_LEVEL + 0.2, `(ground ${f1(h(pond.x, pond.z))})`);
  const stones = gp.placed.filter((p) => p.name === 'stepping_stone').sort((a, b) => b.z - a.z);
  const chain = [[K.x, K.z + K.rz + 1.5], ...stones.map((p) => [p.x, p.z]), [pond.x, pond.z + 3.2]];
  let widest = 0; for (let i = 1; i < chain.length; i++) widest = Math.max(widest, Math.hypot(chain[i][0] - chain[i - 1][0], chain[i][1] - chain[i - 1][1]));
  check('the stepping stones lead from the south shore to the islet with hops a plain jump makes', stones.length === 3 && widest < 6.2, `(${stones.length} stones, the longest hop ${f1(widest)} m centre to centre; a jump carries 8 m)`);
  const wall = gp.walls[0], garden = L.garden;
  check('the hidden garden: one cracked wall closes it', gp.walls.length === 1 && Math.hypot(wall.x - garden.x, wall.z - garden.z) > garden.r, `(at ${f1(wall.x)}, ${f1(wall.z)})`);
}

// ---- props and gameplay in the right places ------------------------------------------------------------------------------------------------------
{
  // nothing stands on a road (except what is meant to: lamp posts at its sides, the doors and the signpost at its end)
  const OK_ON_ROAD = new Set(['lamp_post', 'realm_door', 'bunting', 'torch_stand', 'banner_pole', 'fence', 'wall_stone', 'flower_patch', 'tuft_patch', 'fern_patch', 'reeds', 'lilypads', 'stepping_stone']);
  const onRoad = gp.placed.filter((p) => !OK_ON_ROAD.has(p.name) && ctx.pathDist(p.x, p.z) < 0.6 && p.name !== 'signpost');
  check('no prop stands in the middle of a road', onRoad.length === 0, onRoad.slice(0, 6).map((p) => `${p.name}@${f1(p.x)},${f1(p.z)}`).join(' '));
  // no gem or vase inside a solid thing
  const stuck = gp.gems.filter((g) => collision.blocking(g.x, g.y, g.z, 0.1));
  check('no gem hangs inside a solid prop', stuck.length === 0, `(${stuck.length} of ${gp.gems.length}) ${stuck.map((g) => { const c = collision.blocking(g.x, g.y, g.z, 0.1); return `${f1(g.x)},${f1(g.y)},${f1(g.z)} in ${c.prop ? c.prop.name : c.tag}`; }).join(' | ')}`);
  const vstuck = gp.vases.filter((v) => collision.blocking(v.x, v.y + 0.5, v.z, 0));
  check('no vase stands inside a solid prop', vstuck.length === 0, `(${vstuck.length} of ${gp.vases.length})`);
  const wet = gp.gems.filter((g) => h(g.x, g.z) < WATER_LEVEL - 0.9 && g.y < WATER_LEVEL + 1);
  check('no gem lies on the pond\'s bed', wet.length === 0);
  check('the gems add up to a tidy round number', gp.gemsTotal % 50 === 0 && gp.gemsTotal >= 200, `(${gp.gemsTotal})`);
  const outside = [...gp.gems, ...gp.vases, ...gp.chests].filter((o) => Math.hypot(o.x, o.z) > 100);
  check('everything to collect is on the valley floor', outside.length === 0);
  const trig = gp.hints.filter((hh) => Math.hypot(hh.x, hh.z) > 100 || h(hh.x, hh.z) < WATER_LEVEL);
  check('every hint zone is somewhere the hero can stand', trig.length === 0 && gp.hints.length >= 5, `(${gp.hints.length} zones)`);
}

// ---- what the game adds when it starts (ObjectSystem / NpcSystem put these colliders in the world; the headless build has only the props') --------------------------------
for (const c of gp.chests) collision.add({ type: 'box', x: c.x, z: c.z, hx: 1.0, hz: 0.65, rot: c.yaw || 0, y0: c.y, y1: c.y + 0.9, top: false, tag: 'chest' });
for (const v of gp.vases) collision.add({ type: 'cyl', x: v.x, z: v.z, r: 0.55, y0: v.y, y1: v.y + 1.1, top: false, tag: 'vase' });
for (const w of gp.walls) collision.add({ type: 'box', x: w.x, z: w.z, hx: w.w / 2, hz: 0.6, rot: w.yaw || 0, y0: w.y, y1: w.y + w.h, top: false, tag: 'wall' });
for (const n of gp.npcs) collision.add({ type: 'cyl', x: n.x, z: n.z, r: 0.6, y0: h(n.x, n.z), y1: h(n.x, n.z) + 1.7, top: false, tag: 'npc' });
if (gp.barrier) collision.add({ type: 'box', x: gp.barrier.x, z: gp.barrier.z, hx: 3.4, hz: 0.9, rot: gp.barrier.yaw || 0, y0: gp.barrier.y - 2, y1: gp.barrier.y + 14, top: false, tag: 'barrier' });

// ---- who can walk where (a flood fill over the ground: 1.2 m cells, the real slope limit, the real colliders) --------------------------------------------------
{
  const CELL = 1.2, half = grid.half, N = Math.floor((2 * half) / CELL);
  const idx = (i, j) => j * N + i;
  const cx = (i) => -half + (i + 0.5) * CELL, cz = (j) => -half + (j + 0.5) * CELL;
  const nrm = [0, 1, 0];
  const flood = (start, { breakWalls = false, openGate = false } = {}) => {
    const seen = new Uint8Array(N * N), yAt = new Float32Array(N * N);
    // (as Player.update asks it: a solid collider stops a 0.55 m wide, 1.05 m tall body standing with its feet at `feet` when it reaches above the step he can take (0.62) and starts below his head)
    const solid = (x, feet, z) => {
      for (const c of collision.near(x, z)) {
        if (!c.solid || c.y1 <= feet + 0.62 || c.y0 >= feet + 1.05 || !collision.inside(c, x, z, 0.55)) continue;
        if ((breakWalls && c.tag === 'wall') || (openGate && c.tag === 'barrier')) continue;
        return true;
      }
      return false;
    };
    const si = Math.floor((start[0] + half) / CELL), sj = Math.floor((start[1] + half) / CELL);
    const q = [[si, sj]];
    seen[idx(si, sj)] = 1; yAt[idx(si, sj)] = h(start[0], start[1]);
    for (let n = 0; n < q.length; n++) {
      const [i, j] = q[n], y0 = yAt[idx(i, j)];
      // (up to two cells at a stride: the treads of a stair are shallower than a cell, so the cell centres that fall on consecutive treads are not neighbours)
      for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) {
        if ((!di && !dj) || di * di + dj * dj > 5) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= N || b >= N || seen[idx(a, b)]) continue;
        const x = cx(a), z = cz(b);
        const sup = collision.support(x, z, y0, 0.62);
        if (sup.y - y0 > 0.62) continue;
        if (sup.kind === 'terrain') { grid.normalAt(x, z, nrm); if (nrm[1] < SLOPE_WALK) continue; if (sup.y < WATER_LEVEL - 0.9) continue; }
        if (solid(x, sup.y, z)) continue;
        if (Math.abs(di) + Math.abs(dj) > 1 && solid((x + cx(i)) / 2, Math.max(sup.y, y0), (z + cz(j)) / 2)) continue;       // (nothing in between)
        if (Math.abs(sup.y - y0) > 1.6) continue;
        seen[idx(a, b)] = 1; yAt[idx(a, b)] = sup.y; q.push([a, b]);
      }
    }
    return { has: (x, z) => { const i = Math.floor((x + half) / CELL), j = Math.floor((z + half) / CELL); return i >= 0 && j >= 0 && i < N && j < N && !!seen[idx(i, j)]; }, count: q.length, yAt: (x, z) => yAt[idx(Math.floor((x + half) / CELL), Math.floor((z + half) / CELL))] };
  };
  const arrive = [gp.arrivals.gloaming.x, gp.arrivals.gloaming.z];
  const w = flood(arrive), wBroken = flood(arrive, { breakWalls: true });
  const near = (f, x, z, r = 2.4) => { for (let dx = -r; dx <= r; dx += 1.2) for (let dz = -r; dz <= r; dz += 1.2) if (f.has(x + dx, z + dz)) return true; return false; };
  for (const d of DOORS) { const [x, z] = inFront(d, 5); check(`walk: from the arrival to the ${d.id} door's dais`, near(w, x, z)); }
  const elder = gp.npcs[0];
  check('walk: to the Elder', near(w, elder.x, elder.z, 3.6));
  const G = L.guard;
  check('walk: to the court before the Guardian\'s gate', near(w, G.x, G.z + 10));
  check('walk: not through the sealed gate (the barrier and the gorge hold)', !w.has(G.x, G.z - 8) && !w.has(G.x, G.z - 20) && !wBroken.has(G.x, G.z - 20), `(the ground behind the gate is out of reach)`);
  const gate = flood(arrive, { openGate: true });
  check('(the gate is what stops him: with its field gone he could walk through)', gate.has(G.x, G.z - 8), '');
  const K = L.garden, ux = Math.cos(K.open), uz = Math.sin(K.open), inside = [K.x - ux * 2, K.z - uz * 2];
  check('the hidden garden is sealed while its wall stands', !w.has(inside[0], inside[1]) && !w.has(K.x, K.z), `(floor at ${f1(K.x)}, ${f1(K.z)})`);
  check('... and open to walk into once the wall is broken', wBroken.has(inside[0], inside[1]) && wBroken.has(K.x, K.z));
  const chest = gp.chests.find((c) => c.secret === 'garden');
  check('... with its chest inside', near(wBroken, chest.x, chest.z, 2.4) && !near(w, chest.x, chest.z, 2.4));
  const mill = gp.chests.find((c) => c.secret === 'mill');
  // (the stair's treads are shallower than a cell: that climb is the bot's, tools/home-bot.mjs. Here: the road gets him onto the hilltop, to the mill's door)
  const W = L.windHill;
  let top = 0;
  for (let dx = -9; dx <= 9; dx += 1.2) for (let dz = -9; dz <= 9; dz += 1.2) if (w.has(W.x + dx, W.z + dz)) top = Math.max(top, w.yAt(W.x + dx, W.z + dz));
  check('walk: up the windmill road onto the hilltop', top > W.topH - 0.6, `(up to y ${f1(top)} of the hilltop at ${f1(W.topH)})`);
  // the ground is one walkable world: the dry, gentle ground of the valley floor is (all but) all reachable
  let dry = 0, reach = 0;
  for (let j = 0; j < N; j += 2) for (let i = 0; i < N; i += 2) {
    const x = cx(i), z = cz(j);
    if (Math.hypot(x, z) > 88 || h(x, z) < WATER_LEVEL + 0.8) continue;
    grid.normalAt(x, z, nrm); if (nrm[1] < SLOPE_WALK + 0.1) continue;
    if (collision.blocking(x, h(x, z) + 0.7, z, 0.5)) continue;
    if (Math.hypot(x - K.x, z - K.z) < K.r + 14) continue;                     // (the garden has its own check above)
    dry++; if (w.has(x, z)) reach++;
  }
  check('walk: the valley floor is all one world (no pockets of ground that cannot be reached)', reach / dry > 0.97, `(${reach} of ${dry} dry, level cells within 88 m)`);
}

// ---- the ground ----------------------------------------------------------------------------------------------------------------------
{
  const picker = terrainPicker(grid), n = grid.n, tex = {};
  let sandAway = 0, rimRock = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) for (const t of picker.tris(i, j)) {
    tex[t.tex] = (tex[t.tex] || 0) + 1;
    const cxp = (t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3, czp = (t.p[0][2] + t.p[1][2] + t.p[2][2]) / 3;
    const dl = Math.hypot((cxp - L.lake.x) / L.lake.rx, (czp - L.lake.z) / L.lake.rz);
    if (t.tex === 'sand' && dl > 1.7 && !t.why.startsWith('river')) sandAway++;
    if ((t.tex === 'far_rock' || t.tex === 'cliff') && Math.hypot(cxp, czp) < 60 && t.slope < 0.6 && !/steep|rim|high/.test(t.why)) rimRock++;
  }
  console.log('ground textures', JSON.stringify(tex));
  check('sand only where there is water', sandAway === 0, `(${sandAway} triangles far from the pond)`);
  check('no stray rock out on the meadow', rimRock === 0, `(${rimRock})`);
  const paved = picker.at(0, 5), court = picker.at(L.guard.x, L.guard.z + 8);
  check('the plaza and the court before the gate are paved', paved.tex === 'flagstone' && court.tex === 'flagstone', `(${paved.tex}, ${court.tex})`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall homeworld checks passed');
process.exitCode = failed ? 1 : 0;
void polar; void DOOR_R;
