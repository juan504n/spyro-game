// The rules a realm is held to, run on a world built headlessly (both level passes, no GPU). Two kinds:
//   HARD    what any realm must be for the game to work: it builds the same twice, the hero starts on firm ground, every goal can be reached, the ring of light over the last one stands on
//           walkable ground, the treasure adds up and lies where it can be collected, nothing stands on a road...
//   DESIGN  the principles of the original games' worlds (see .claude/skills/new-realm/reference/principles.md): every goal in a place of its own kind, a country of parts with levels and
//           loops and no dead ends, the walks to the goals very different, secrets off the road, danger that grows with the journey, a trail of gems that leads the way...
// A rule has an id; a brief may waive one it breaks on purpose: waive: [['design.loops', 'one long road, by design']] (the reason is printed). A rule that needs the brief (the goals' situations,
// the secrets) is skipped for a world that has none (Gloaming Vale, Dawnhaven): there the rules that need no brief are what is measured, which is how the thresholds were calibrated.
import { buildHeadless, addRuntimeColliders, resolveRealm } from '../headless-world.mjs';
import { makeWalkmap } from '../walkmap.mjs';
import { SLOPE_WALK } from '../../src/game/collision.js';
import { WATER_LEVEL } from '../../src/game/level.js';
import { REALMS } from '../../src/game/realms.js';
import { terrainPicker } from '../../src/game/terrain-mesh.js';
import { ROAD_MAX_SLOPE } from '../../src/game/roads.js';
import { SITUATIONS } from '../../src/game/realm/situations.js';
import { RULES } from '../../src/game/realm/brief.js';

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : String(v));
const f0 = (v) => (Number.isFinite(v) ? String(Math.round(v)) : String(v));
/** how much a Snuffer of each kind weighs when the danger of a stretch of the journey is added up */
export const DANGER = { basic: 1, bell: 2, thorn: 2 };
/** props that may stand on a road (at its sides, the doors, the signposts: what is meant to be there) */
const OK_ON_ROAD = new Set(['arch_gate', 'bridge_stone', 'bridge', 'lamp_post', 'realm_door', 'bunting', 'torch_stand', 'banner_pole', 'fence', 'wall_stone', 'flower_patch', 'tuft_patch', 'fern_patch', 'reeds', 'lilypads', 'stepping_stone', 'pier', 'crystal_cluster', 'crystal_spire', 'light_shaft', 'standing_stones', 'rock_arch', 'bench', 'gate_pillars', 'signpost', 'snow_drift', 'ice_floe', 'ice_fall']);

/**
 * Where the two worlds that came before the rules depart from them, said once (they have no brief to waive in): Gloaming Vale was designed before the principles were written down, and
 * Dawnhaven is a hub. The rules were calibrated on them; a realm made with the foundry has a brief and waives nothing unless it says why.
 */
const LEGACY = {
  gloaming: [
    ['goals.reach', 'the sky isles are reached by a bounce mushroom and a glide, the windmill\'s beacon by its inner stair: neither is a walk the flood can make'],
    ['props.roads', 'one pine stands at the edge of the mill road'],
    ['hints.goals', 'the sky isles\' hint stands at the launch mesa, 150 m from them'],
    ['design.deadends', 'the mill road ends at the windmill, the Heron Point road on its headland, the pier\'s road at the dock: lookouts and landings, with nothing in them to find'],
  ],
  home: [
    ['design.deadends', 'the trunk road ends at the mouth of the Crag, the ledge road where the mountain\'s own stone road begins, the west road at the trunk\'s side: caves and junctions the road list cannot see'],
  ],
};

export function checkRealm(which, { log = () => {} } = {}) {
  const results = [];
  const W = buildHeadless(which);
  const id = resolveRealm(which).id;
  const { grid, collision, gp, level: L, dryCtx: ctx, wetCtx, world } = W;
  const realm = resolveRealm(which), brief = L.brief || null, isRealm = realm.kind === 'realm';
  const waived = new Map(brief ? brief.waive : LEGACY[id] || []);
  const rule = (rid, name, ok, detail = '', { hard = false } = {}) => {
    const w = !ok && waived.has(rid);
    results.push({ id: rid, name, ok, waived: w, hard, detail });
    log(`${ok ? 'PASS' : w ? 'WAIVE' : 'FAIL'} ${rid}: ${name}${detail ? ` ${detail}` : ''}${w ? ` [waived: ${waived.get(rid)}]` : ''}`);
  };
  const skip = (rid, why) => log(`SKIP ${rid}: ${why}`);
  log(`built '${id}' (${realm.kind}) in ${Math.round(W.ms)} ms: ${gp.placed.length} props, ${gp.gems.length} gems, ${gp.enemies.length} enemies, ${gp.beacons.length} goals`);

  const h = (x, z) => grid.heightAt(x, z);
  const lim = grid.half - 6;
  const massifs = world.massifs || [];
  const sp0 = isRealm ? gp.spawn : gp.arrivals[Object.keys(gp.arrivals)[0]] || gp.spawn;
  const sp = { ...sp0, y: sp0.y ?? h(sp0.x, sp0.z) };       // (a hub's arrival is a place in front of a door: x, z and yaw)
  // (what the game adds when it starts is added after the placement checks: a vase's own collider would hold the vase inside a solid thing)
  const stuckGems = gp.gems.filter((g) => collision.blocking(g.x, g.y, g.z, 0.1));
  const stuckVases = gp.vases.filter((v) => collision.blocking(v.x, v.y + 0.5, v.z, 0));
  const badEnemies = gp.enemies.filter((e) => collision.blocking(e.x, h(e.x, e.z) + 0.5, e.z, 0.4) || h(e.x, e.z) < WATER_LEVEL + 0.2);
  addRuntimeColliders(collision, gp, grid);
  const { flood } = makeWalkmap({ grid, collision });
  const walkShut = flood([sp.x, sp.z], { hop: 6.2 });
  const walk = flood([sp.x, sp.z], { hop: 6.2, breakWalls: true, openGate: true });
  const near = (f, x, z, r = 3, y) => f.distNear(x, z, r, y);
  const env = { grid, collision, gp, level: L, ctx, massifs, h, walk, walkShut };

  // ---- HARD: the world works ---------------------------------------------------------------------------------------------------------------
  {
    const a = JSON.stringify(ctx.counts), b = JSON.stringify(wetCtx.counts);
    rule('build.deterministic', 'the dry and the wet pass place the same things', a === b && ctx.gp.placed.length === wetCtx.gp.placed.length, `(${ctx.gp.placed.length} props)`, { hard: true });
  }
  {
    const sup = collision.support(sp.x, sp.z, sp.y + 1, 0.9), nrm = grid.normalAt(sp.x, sp.z);
    rule('spawn.firm', 'the hero starts on firm, dry, level ground in the open', Math.abs(sup.y - sp.y) < 0.6 && nrm[1] >= SLOPE_WALK && sp.y > WATER_LEVEL + 0.5 && walkShut.count > 5000, `(y ${f1(sp.y)}, ${walkShut.count} cells reachable)`, { hard: true });
    if (isRealm) rule('spawn.road', 'the start is on or beside a road, so the way is plain from the first step', ctx.pathDist(sp.x, sp.z) < 12, `(${f1(ctx.pathDist(sp.x, sp.z))} m from the nearest)`);
  }

  const goals = gp.beacons;
  const gref = (g) => (brief ? brief.goals.find((q) => q.id === g.id) : null);
  if (isRealm) {
    rule('goals.count', brief ? 'the realm has the goals its brief lists, in that order' : 'the realm has at least three goals', brief ? goals.map((g) => g.id).join() === brief.goals.map((g) => g.id).join() : goals.length >= 3, `(${goals.map((g) => g.id).join(', ')})`, { hard: true });
    const off = goals.filter((g) => { const s = collision.support(g.x, g.z, g.y + 0.5, 0.5); return Math.abs(s.y - g.y) > 1.3; });
    rule('goals.ground', 'every goal stands on a floor (not in the air, not in rock)', off.length === 0, off.map((g) => `${g.id}@${f1(g.x)},${f1(g.z)}`).join(' '), { hard: true });
    const unreachable = goals.filter((g) => !(near(walk, g.x, g.z, 4, g.y - 0.5) < Infinity) && !(gref(g) && gref(g).situation === 'glide'));
    rule('goals.reach', 'every goal can be reached (on foot, by a jump, through a broken wall or an open gate; a glide goal by gliding: see its situation)', unreachable.length === 0, unreachable.map((g) => g.id).join(' '), { hard: true });
  }

  // the way out: the ring of light over the last goal
  if (isRealm) {
    const lifts = gp.portals.filter((p) => p.kind === 'lift'), last = goals[goals.length - 1];
    const q = lifts[0];
    rule('exit.ring', 'one ring of light over the last goal, closed until the finale, leading to another world', lifts.length === 1 && Math.hypot(q.x - last.x, q.z - last.z) < 1 && q.state === 'closed' && !!REALMS[q.target], q ? `(to ${q.target}, ${f1(q.cy)} m up, catch radius ${f1(q.catchR)})` : '(none)', { hard: true });
    if (q) {
      let spread = 0;
      for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; spread = Math.max(spread, Math.abs(collision.support(q.x + Math.cos(a) * q.catchR, q.z + Math.sin(a) * q.catchR, q.y + 0.6, 0.62).y - q.y)); }
      rule('exit.floor', 'the floor under the ring of light is walkable and level (the beam comes down there)', near(walk, q.x, q.z, q.catchR * 0.6, q.y) < Infinity && spread < 1.6, `(ground varies ${f1(spread)} m within ${f1(q.catchR)} m)`, { hard: true });
    }
  }

  // the treasure
  {
    rule('gems.total', 'the gems add up to a tidy round number', gp.gemsTotal % 50 === 0 && gp.gemsTotal >= (brief ? brief.gems.min : 300), `(${gp.gemsTotal})`, { hard: true });
    const stuck = stuckGems;
    const wet = gp.gems.filter((g) => h(g.x, g.z) < WATER_LEVEL - 0.9 && g.y < WATER_LEVEL + 1);
    const out = [...gp.gems, ...gp.vases, ...gp.chests].filter((o) => Math.abs(o.x) > lim || Math.abs(o.z) > lim);
    const vstuck = stuckVases;
    rule('gems.place', 'no gem or vase inside a solid thing, on a lake bed or outside the world', stuck.length + wet.length + out.length + vstuck.length === 0, `(${stuck.length} stuck, ${wet.length} wet, ${out.length} outside, ${vstuck.length} vases stuck)`, { hard: true });
    // gems on the ground (or a floor) must be reachable; the airborne ones (an arc over water or a chasm to glide along, 3 m or more over the ground) are picked up in the air, which the flood cannot
    // tell, and are held to a quarter of the treasure instead
    const air = (o) => o.value && (o.y - h(o.x, o.z) > 3 || h(o.x, o.z) < WATER_LEVEL - 0.9);
    const lost = [...gp.gems, ...gp.vases].filter((o) => !air(o) && ![0.95, 2.4].some((dy) => near(walk, o.x, o.z, o.value ? 4.5 : 3.6, o.y - (o.value ? dy : 0)) < Infinity));
    rule('gems.reach', 'everything that lies about to be collected can be reached (97% of it)', lost.length <= (gp.gems.length + gp.vases.length) * 0.03, `(${lost.length} of ${gp.gems.length + gp.vases.length} out of reach${lost.length ? `: ${lost.slice(0, 4).map((o) => `${f1(o.x)},${f1(o.z)}`).join(' ')}` : ''})`, { hard: true });
    const aerial = gp.gems.filter(air);
    rule('gems.air', 'gems that hang over water or air are a minority of the treasure (at most 35%)', aerial.length <= gp.gems.length * 0.35, `(${aerial.length} of ${gp.gems.length})`);
  }

  // props and the roads
  {
    const onRoad = gp.placed.filter((p) => !OK_ON_ROAD.has(p.name) && ctx.pathDist(p.x, p.z) < 0.6 && !massifs.some((m) => m.inBoxXZ(p.x, p.z) && m.roofed(p.x, p.y, p.z)));
    rule('props.roads', 'no prop stands in the middle of a road', onRoad.length === 0, onRoad.slice(0, 5).map((p) => `${p.name}@${f1(p.x)},${f1(p.z)}`).join(' '), { hard: true });
    // the steepest stretch of each road over 10 m (a point to point grade is noise)
    let worst = 0, at = '';
    for (const p of grid.paths) for (let i = 6; i < p.pts.length; i++) {
      const dxz = Math.hypot(p.pts[i][0] - p.pts[i - 6][0], p.pts[i][2] - p.pts[i - 6][2]) || 1, g = Math.abs(p.pts[i][1] - p.pts[i - 6][1]) / dxz;
      if (g > worst) { worst = g; at = `${p.id}@${f1(p.pts[i][0])},${f1(p.pts[i][2])}`; }
    }
    rule('roads.grade', 'no road is steeper than the game draws one (a grade of 0.74: the ground under a steeper stretch gets no road)', worst < Math.tan(ROAD_MAX_SLOPE), `(steepest ${worst.toFixed(2)} over 10 m at ${at})`, { hard: true });
    rule('design.grade', 'the roads climb at a pleasant grade (under 0.5 over 10 m)', worst < 0.5, `(steepest ${worst.toFixed(2)} at ${at})`);
  }

  // enemies and hints
  if (isRealm) {
    const R = brief ? brief.danger.safeRadius : 30;
    const near0 = gp.enemies.filter((e) => Math.hypot(e.x - sp.x, e.z - sp.z) < R);
    rule('enemies.safe', `no Snuffer within ${R} m of the start`, near0.length === 0, `(${near0.length})`, { hard: true });
    const bad = badEnemies;
    rule('enemies.place', 'every Snuffer stands on dry ground clear of solid things', bad.length === 0, bad.slice(0, 4).map((e) => `${e.variant}@${f1(e.x)},${f1(e.z)}`).join(' '), { hard: true });
    const loud = gp.hints.filter((q) => Math.abs(q.x) > lim || Math.abs(q.z) > lim || (q.text && q.text !== q.text.toUpperCase()));
    rule('hints.zones', 'hint zones lie inside the world and speak in capitals', loud.length === 0, `(${gp.hints.length} zones)`, { hard: true });
    const dumb = goals.filter((g) => !gp.hints.some((q) => Math.hypot(q.x - g.x, q.z - g.z) < 60));
    rule('hints.goals', 'every goal has a hint zone within 60 m that says what to do', dumb.length === 0, dumb.map((g) => g.id).join(' '));
  }

  // ---- DESIGN: the principles --------------------------------------------------------------------------------------------------------------
  const walks = goals.map((g) => near(walk, g.x, g.z, 4, g.y - 0.5));
  if (isRealm && brief) {
    // every goal in a place of its own kind
    for (const g of goals) {
      const d = gref(g), S = SITUATIONS[d.situation], r = S.check({ ...g, ...d, y: g.y }, env);
      rule(`goal.${g.id}`, `${g.name} stands in its situation (${d.situation}: ${S.doc.split(':')[0]})`, r.ok, `(${r.detail})`);
    }
    const kinds = new Set(brief.goals.map((g) => g.situation));
    rule('design.varied', 'the goals stand in different kinds of place, never five alike', kinds.size >= RULES.situationsMin(goals.length), `(${[...kinds].join(', ')})`);
  } else if (isRealm) skip('goal.*', 'the world has no brief: its goals have no declared situations');

  if (isRealm) {
    const fin = walks.filter(Number.isFinite), sorted = [...fin].sort((a, b) => a - b);
    let gap = Infinity; for (let i = 1; i < sorted.length; i++) gap = Math.min(gap, sorted[i] - sorted[i - 1]);
    const lastWalk = walks[walks.length - 1];
    rule('design.journey', 'the walks to the goals differ a great deal: the first is close (under 140 m), the farthest long (over 300 m), no two alike (15 m apart), the finale among the two farthest', sorted.length >= 3 && sorted[0] < 140 && sorted[sorted.length - 1] > 300 && gap > 15 && lastWalk >= sorted[Math.max(0, sorted.length - 2)], `(${goals.map((g, i) => `${g.id} ${f0(walks[i])} m`).join(', ')})`);
  }

  // the country: its parts, its levels
  {
    let lo = Infinity, hi = -Infinity, hiAt = null;
    walk.each((x, y, z) => { if (y > WATER_LEVEL - 0.5) { lo = Math.min(lo, y); if (y > hi) { hi = y; hiAt = [x, y, z]; } } });
    rule('design.levels', 'the walkable country has levels: it climbs at least 25 m from its lowest to its highest ground', hi - lo >= RULES.heightSpanMin, `(y ${f1(lo)}..${f1(hi)})`);
    const rewards = [...goals, ...gp.chests, ...gp.npcs, ...gp.portals.filter((p) => p.kind === 'door'), ...gp.walls].map((o) => ({ x: o.x, y: o.y ?? 0, z: o.z }));
    const top = rewards.filter((o) => Math.hypot(o.x - hiAt[0], o.z - hiAt[2]) < 45 && Math.abs(o.y - hiAt[1]) < 12);
    rule('design.height', 'height is the reward: something worth the climb (a goal, a chest, a door) stands within 45 m of the highest ground', top.length > 0, `(the highest ground is ${f1(hiAt[1])} m at ${f1(hiAt[0])}, ${f1(hiAt[2])})`);
  }
  if (L.regions && L.regions.length) {
    const bad = [];
    for (const R of L.regions) {
      if (R.sealed) continue;
      let miss = 0, total = 0;
      for (const [x, z, py, hw] of R.pts) {
        if (h(x, z) < WATER_LEVEL + 0.5) continue;
        if (massifs.some((m) => m.inBoxXZ(x, z) && (m.dist(x, py + 1, z) < 1 || m.roofed(x, py, z, 2)))) continue;
        total++;
        if (!(near(walk, x, z, Math.min(6, hw * 0.4), py) < Infinity)) miss++;
      }
      if (miss > Math.max(0, total * 0.05)) bad.push(`${R.id} (${miss}/${total})`);
    }
    rule('design.parts', 'every part of the country can be walked along its own line', bad.length === 0, bad.join(' '));
  } else skip('design.parts', 'the world has no regions');

  // the roads: loops, no dead ends
  {
    const paths = grid.paths, nodes = [];
    const nodeAt = (p) => { for (let i = 0; i < nodes.length; i++) if (Math.hypot(nodes[i][0] - p[0], nodes[i][2] - p[2]) < 7) return i; nodes.push(p); return nodes.length - 1; };
    const edges = [], ends = [];
    for (const p of paths) {
      const pts = p.pts, cuts = [0, pts.length - 1];
      for (const q of paths) {
        if (q === p) continue;
        for (let i = 0; i < pts.length; i += 2) {
          let d = Infinity;
          for (const r of q.pts) d = Math.min(d, Math.hypot(pts[i][0] - r[0], pts[i][2] - r[2]));
          if (d < 4 + q.width / 2 && !cuts.some((c) => Math.abs(c - i) < 8)) cuts.push(i);
        }
      }
      cuts.sort((a, b) => a - b);
      for (let k = 0; k + 1 < cuts.length; k++) { const a = nodeAt(pts[cuts[k]]), b = nodeAt(pts[cuts[k + 1]]); if (a !== b) edges.push([a, b]); }
      for (const e of [pts[0], pts[pts.length - 1]]) {
        let joined = false;
        for (const q of paths) { if (q === p) continue; for (const r of q.pts) if (Math.hypot(e[0] - r[0], e[2] - r[2]) < 3 + Math.max(p.width, q.width) / 2) { joined = true; break; } if (joined) break; }
        ends.push({ road: p.id, x: e[0], y: e[1], z: e[2], joined });
      }
    }
    const par = nodes.map((_, i) => i), find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
    let cycles = 0;
    for (const [a, b] of edges) { const ra = find(a), rb = find(b); if (ra === rb) cycles++; else par[ra] = rb; }
    if (isRealm) rule('design.loops', 'the roads make at least one loop (a way back that is not the way there)', cycles >= 1, `(${paths.length} roads, ${nodes.length} junctions and ends, ${cycles} independent loops)`);
    else skip('design.loops', 'a hub is not held to loops');
    const rewards = [...goals, ...gp.chests, ...gp.npcs, ...gp.portals, ...gp.walls, ...(gp.mushrooms || []), ...gp.placed.filter((p) => /pier|arch_gate|gate_pillars|windmill|tower|forge|realm_door|ice_fall/.test(p.name))];
    const dead = ends.filter((e) => !e.joined && Math.hypot(e.x - sp.x, e.z - sp.z) > 25 && !rewards.some((o) => Math.hypot(o.x - e.x, o.z - e.z) < 30));
    rule('design.deadends', 'no road runs out into nothing: each ends at a junction, the start, or something worth the walk (a goal, a chest, a door, a person)', dead.length === 0, dead.map((e) => `${e.road}@${f0(e.x)},${f0(e.z)}`).join(' '));
  }

  // secrets
  if (isRealm && brief) {
    const found = gp.chests.filter((c) => c.secret).map((c) => c.secret).sort();
    const want = brief.secrets.map((s) => s.id).sort();
    rule('design.secrets', 'each secret of the brief is a chest off the road, and the world has at least three', found.join() === want.join() && want.length >= RULES.secretsMin, `(${found.join(', ')})`);
    const road = gp.chests.filter((c) => c.secret && ctx.pathDist(c.x, c.z) < 8);
    rule('design.secrets.off', 'the secrets lie off the beaten track (8 m from any road)', road.length === 0, road.map((c) => c.secret).join(' '));
    const sealed = gp.chests.filter((c) => c.secret && !(near(walkShut, c.x, c.z, 2.4, c.y) < Infinity));
    rule('design.secrets.sealed', 'at least one secret is behind a cracked wall (reached only by charging it)', gp.walls.length >= 1 && sealed.length >= 1, `(${gp.walls.length} walls; sealed: ${sealed.map((c) => c.secret).join(', ') || 'none'})`);
    const unreach = gp.chests.filter((c) => !(near(walk, c.x, c.z, 2.4, c.y) < Infinity));
    rule('design.secrets.reach', 'every chest can be reached once the walls are broken', unreach.length === 0, unreach.map((c) => c.secret || 'chest').join(' '));
  } else if (isRealm) skip('design.secrets', 'the world has no brief');

  // danger grows with the journey (the first third of the walk is quiet, the last is not)
  if (isRealm) {
    const en = gp.enemies.map((e) => ({ d: near(walk, e.x, e.z, 3, e.y ?? h(e.x, e.z)), w: DANGER[e.variant] || 1, v: e.variant })).filter((e) => Number.isFinite(e.d));
    const max = Math.max(1, ...walks.filter(Number.isFinite), ...en.map((e) => e.d)), thirds = [0, 0, 0];
    for (const e of en) thirds[Math.min(2, Math.floor((e.d / max) * 3))] += e.w;
    const kinds = new Set(en.map((e) => e.v));
    rule('design.danger', 'danger grows with the journey: the first third of the walk is the quietest, the busiest holds at least twice its danger, and more than one kind of Snuffer appears', en.length >= 8 && thirds[0] <= Math.min(thirds[1], thirds[2]) && Math.max(...thirds) >= thirds[0] * 2 && kinds.size >= 2, `(danger by thirds of the way: ${thirds.join(' / ')}; ${en.length} Snuffers, kinds ${[...kinds].join(', ')})`);
  }

  // gems that lead the way
  {
    const flagged = brief ? grid.paths.filter((p) => (brief.roads.find((r) => r.id === p.id) || {}).gems) : grid.paths;
    let cov = 0, tot = 0;
    for (const p of flagged) {
      let acc = 0;
      for (let i = 1; i < p.pts.length; i++) {
        acc += Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][2] - p.pts[i - 1][2]);
        if (acc < 12) continue;
        acc = 0; tot++;
        const q = p.pts[i];
        if (gp.gems.some((g) => Math.hypot(g.x - q[0], g.z - q[2]) < 7)) cov++;
      }
    }
    rule('design.leads', 'a trail of gems leads the way along the roads (80% of every 12 m of them has one within 7 m)', tot === 0 || cov / tot >= 0.8, `(${cov} of ${tot} stretches)`);
  }

  // a themed place: few base colours
  {
    const picker = terrainPicker(grid), tex = {};
    let n = 0;
    for (let j = 0; j < grid.n; j++) for (let i = 0; i < grid.n; i++) for (const t of picker.tris(i, j)) { if (/cliff|far_/.test(t.tex)) continue; tex[t.tex] = (tex[t.tex] || 0) + 1; n++; }
    const main = Object.entries(tex).filter(([, v]) => v / n > 0.02).sort((a, b) => b[1] - a[1]);
    rule('design.palette', 'the ground is made of few textures (at most 7 beyond rock, each over 2%)', main.length <= 7, `(${main.map(([k, v]) => `${k} ${(100 * v / n).toFixed(0)}%`).join(', ')})`);
  }

  const failed = results.filter((r) => !r.ok && !r.waived);
  return { results, failed, hardFailed: failed.filter((r) => r.hard), env, W };
}
