// The rules a realm is held to, run on a world built headlessly (both level passes, no GPU). Two kinds:
//   HARD    what any realm must be for the game to work: it builds the same twice, the hero starts on firm ground, every goal can be reached, the ring of light over the last one stands on
//           walkable ground, the treasure adds up and lies where it can be collected, nothing stands on a road...
//   DESIGN  the principles of the original games' worlds (see .claude/skills/new-realm/reference/principles.md): every goal in a place of its own kind, a country of parts with levels and
//           loops and no dead ends, the walks to the goals very different, secrets off the road, danger that grows with the journey, a trail of gems that leads the way...
// A rule has an id; a brief may waive one it breaks on purpose: waive: [['design.loops', 'one long road, by design']] (the reason is printed). A rule that needs the brief (the goals' situations,
// the secrets) is skipped for a world that has none (Gloaming Vale, Dawnhaven): there the rules that need no brief are what is measured, which is how the thresholds were calibrated.
import { buildHeadless, addRuntimeColliders, resolveRealm } from '../headless-world.mjs';
import { makeWalkmap } from '../walkmap.mjs';
import { airTools } from './air.mjs';
import { SLOPE_WALK } from '../../src/game/collision.js';
import { tideLow, tideHigh, tideAbove, drownDepth, refugeReach } from '../../src/game/realm/tide.js';
import { REALMS, DEFAULT_WORDS } from '../../src/game/realms.js';
import { measureText } from '../../src/engine/textures/font.js';
import { generateWorldTextures } from '../../src/engine/textures/world.js';
import { generateUI } from '../../src/engine/textures/ui.js';
import { terrainPicker } from '../../src/game/terrain-mesh.js';
import { ROAD_MAX_SLOPE } from '../../src/game/roads.js';
import { SITUATIONS } from '../../src/game/realm/situations.js';
import { RULES } from '../../src/game/realm/brief.js';
import { DANGER as KIND_DANGER, KIND_IDS } from '../../src/game/foes/kinds.js';
import { footprint, lookOf } from '../../src/game/trials/place.js';
import { playTrial } from './trialsim.mjs';
import { plays as pilots } from './trial-plays.mjs';
import { ENEMY_DROPS } from '../../src/game/economy.js';
import { timeFor, CIRCUIT } from '../../src/game/trials/index.js';

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : String(v));
const f0 = (v) => (Number.isFinite(v) ? String(Math.round(v)) : String(v));
/** how much a Snuffer of each kind weighs when the danger of a stretch of the journey is added up (foes/kinds.js) */
export const DANGER = KIND_DANGER;
/** the kinds the game has added to the three Snuffers it began with (the foes of round twenty-eight) */
const NEW_KINDS = new Set(KIND_IDS.filter((k) => !['basic', 'bell', 'thorn'].includes(k)));
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

/** the asks of a realm in the order of its goals (a kind of trial, or null for a plain lantern): are they varied? The first lantern is plain, at least three kinds stand in front of the others (fewer in a realm of fewer goals), none twice running */
export function trialMix(order) {
  const kinds = new Set(order.filter(Boolean)), want = Math.min(3, order.length - 1);
  const twice = order.filter((k, i) => k && k === order[i - 1]);
  return { ok: order[0] === null && kinds.size >= want && twice.length === 0, kinds: kinds.size, want, twice };
}

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
  // the water: a realm with a tide (level.tide: realm/tide.js) has water that stands anywhere between its low tide and its high; everywhere else both are WATER_LEVEL, and what the rules measured against
  // the water's height, they measure against these (the dry ground a Snuffer stands on is dry at the high tide, a gem on the bed of the deep is on the bed at the low)
  const tide = L.tide || null, sea0 = tideLow(tide), sea1 = tideHigh(tide);
  const massifs = world.massifs || [];
  const sp0 = isRealm ? gp.spawn : gp.arrivals[Object.keys(gp.arrivals)[0]] || gp.spawn;
  const sp = { ...sp0, y: sp0.y ?? h(sp0.x, sp0.z) };       // (a hub's arrival is a place in front of a door: x, z and yaw)
  // (what the game adds when it starts is added after the placement checks: a vase's own collider would hold the vase inside a solid thing)
  const stuckGems = gp.gems.filter((g) => collision.blocking(g.x, g.y, g.z, 0.1));
  const stuckVases = gp.vases.filter((v) => collision.blocking(v.x, v.y + 0.5, v.z, 0));
  const badEnemies = gp.enemies.filter((e) => collision.blocking(e.x, h(e.x, e.z) + 0.5, e.z, 0.4) || h(e.x, e.z) < sea1 + 0.2);
  addRuntimeColliders(collision, gp, grid);
  const { flood } = makeWalkmap({ grid, collision });
  // (the hero's own two walks: as things stand, and with every cracked wall broken and the gate open. A realm whose islands are joined in the air (`brief.air`: glides and whirlwinds, tools/lib/air.mjs)
  // is held to the journey instead - the walk of the start's own ground and the ground of every landing he can get to - so that "can it be reached" means the same in a country of islands)
  const footShut = flood([sp.x, sp.z], { hop: 6.2 });
  const footWalk = flood([sp.x, sp.z], { hop: 6.2, breakWalls: true, openGate: true });
  const airT = brief && brief.air ? airTools({ grid, collision, gp, brief, flood }) : null;
  const airJ = airT ? airT.make({ start: [sp.x, sp.z], startY: sp.y, breakWalls: true, openGate: true }) : null;
  const airShut = airT ? airT.make({ start: [sp.x, sp.z], startY: sp.y, breakWalls: false, openGate: false }) : null;
  const walkShut = airShut ? airShut.map : footShut;
  const walk = airJ ? airJ.map : footWalk;
  const near = (f, x, z, r = 3, y) => f.distNear(x, z, r, y);
  const env = { grid, collision, gp, level: L, ctx, massifs, h, walk, walkShut, foot: footWalk, footShut, air: airJ, airShut, flood };

  // ---- HARD: the world works ---------------------------------------------------------------------------------------------------------------
  {
    const a = JSON.stringify(ctx.counts), b = JSON.stringify(wetCtx.counts);
    rule('build.deterministic', 'the dry and the wet pass place the same things', a === b && ctx.gp.placed.length === wetCtx.gp.placed.length, `(${ctx.gp.placed.length} props)`, { hard: true });
  }
  {
    const sup = collision.support(sp.x, sp.z, sp.y + 1, 0.9), nrm = grid.normalAt(sp.x, sp.z);
    const open = airJ ? brief.air.startCells : 5000;          // (an island's own ground is not a country's: a realm of islands says how much room the start has)
    rule('spawn.firm', 'the hero starts on firm, dry, level ground in the open', Math.abs(sup.y - sp.y) < 0.6 && nrm[1] >= SLOPE_WALK && sp.y > sea1 + 0.5 && footShut.count > open, `(y ${f1(sp.y)}, ${footShut.count} cells reachable on foot${airJ ? `, ${open} wanted` : ''})`, { hard: true });
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

  // the air: the links that join the islands where there is no way on foot (a realm with `brief.air`)
  if (airJ) {
    const bad = airJ.links.filter((E) => E.errors.length);
    rule('air.links', 'every air link can be flown: a launch or a whirlwind the hero can get to, the landing within the reach of a glide (with its margin), nothing in the way, an island to land on', bad.length === 0, bad.length ? bad.map((E) => `${E.id}: ${E.errors.join('; ')}`).join(' | ') : `(${airJ.links.map((E) => `${E.id} ${f0(E.gap)} m across, ${f0(E.drop)} m down, ${f0((E.gap / (E.reach * 0.9)) * 100)}% of the reach`).join('; ')})`, { hard: true });
    const idle = airJ.links.filter((E) => !E.active && !E.errors.length);
    rule('air.reach', 'every air link starts from ground the hero can get to', idle.length === 0, idle.map((E) => E.id).join(' '), { hard: true });
    // no island the hero can land on is a trap: each has a way off (a link that starts on it), but the one that holds the last goal
    const lastG = goals[goals.length - 1];
    const traps = airJ.floods.filter((F) => F.link && Number.isFinite(F.offset) && !airJ.links.some((E) => E.active && Number.isFinite(F.map.distNear(E.o.x, E.o.z, 2.4, E.o.y))) && !(F.map.distNear(lastG.x, lastG.z, 4, lastG.y) < Infinity));
    rule('air.trap', 'no island the hero can land on is a trap: each has a way off by another link, but the one with the last goal', traps.length === 0, traps.map((F) => F.id).join(' '));
    const stray = (gp.whirlwinds || []).filter((w) => !airJ.links.some((E) => E.kind === 'lift' && E.whirl === w.id) || !(airJ.map.distNear(w.x, w.z, 2.4, w.y0) < Infinity));
    rule('air.whirls', 'every whirlwind is used by a link and stands where the hero can walk in', stray.length === 0, stray.map((w) => w.id).join(' '), { hard: true });
  }

  // the treasure
  {
    // (and to everything there is to collect: the gems laid out, what each Snuffer, vase, chest, cracked wall and trial gives: the total the game shows is what a person can reach, no more, no less)
    const add = (a) => a.reduce((n, v) => n + v, 0);
    const collectible = add(gp.gems.map((g) => g.value)) + add(gp.enemies.map((e) => add(ENEMY_DROPS[e.variant] || ENEMY_DROPS.basic))) + add([...gp.vases, ...gp.chests, ...gp.walls].map((o) => add(o.gems))) + add((gp.trials || []).map((t) => add(t.gems || [])));
    rule('gems.total', 'the gems add up to a tidy round number, and to everything there is to collect (the gems laid out and what the Snuffers, vases, chests, cracked walls and trials give)', gp.gemsTotal % 50 === 0 && gp.gemsTotal >= (brief ? brief.gems.min : 300) && collectible === gp.gemsTotal, `(${gp.gemsTotal}${collectible === gp.gemsTotal ? '' : `, but ${collectible} to collect`})`, { hard: true });
    const stuck = stuckGems;
    const wet = gp.gems.filter((g) => h(g.x, g.z) < sea0 - 0.9 && g.y < sea0 + 1);
    const out = [...gp.gems, ...gp.vases, ...gp.chests].filter((o) => Math.abs(o.x) > lim || Math.abs(o.z) > lim);
    const vstuck = stuckVases;
    rule('gems.place', 'no gem or vase inside a solid thing, on a lake bed or outside the world', stuck.length + wet.length + out.length + vstuck.length === 0, `(${stuck.length} stuck, ${wet.length} wet, ${out.length} outside, ${vstuck.length} vases stuck)`, { hard: true });
    // gems on the ground (or a floor) must be reachable; the airborne ones (an arc over water or a chasm to glide along, 3 m or more over the ground) are picked up in the air, which the flood cannot
    // tell, and are held to a quarter of the treasure instead
    // (in a country of islands joined in the air the floor under a gem is whatever the hero would stand on there: a slab of rock hanging in the air holds its gems as the ground does; in every other
    // world the ground is the terrain's, as the rules were calibrated on Gloaming Vale: its sky isles' gems count as aerial)
    const air = (o) => {
      if (!o.value) return false;
      if (!airJ) return o.y - h(o.x, o.z) > 3 || h(o.x, o.z) < sea0 - 0.9;
      const f = collision.support(o.x, o.z, o.y, 0).y;
      return o.y - f > 3 || f < sea0 - 0.9;
    };
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
      // (metres of road, not the straight line between the two points: the two sides of a hairpin are a few metres apart and a switchback would read as a wall)
      let len = 0;
      for (let k = i - 5; k <= i; k++) len += Math.hypot(p.pts[k][0] - p.pts[k - 1][0], p.pts[k][2] - p.pts[k - 1][2]);
      const dxz = len || 1, g = Math.abs(p.pts[i][1] - p.pts[i - 6][1]) / dxz;
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
    // every banner the realm puts up is drawn at twice the font's size on a screen 320 px wide (a goal lit: `NAME + words.lit`, the finale, the gate, the portal, the saved realm, the results panel):
    // a longer one runs off both sides (the first screenshots of Frostbloom Hollow showed two of them), and the lines under a banner, at the font's own size, must fit as well
    if (brief) {
      const words = { ...DEFAULT_WORDS, ...(brief.words || {}) }, px = (t, k = 1) => measureText(t, { style: 'grad' }).w * k;
      const titles = [...brief.goals.map((g) => [`goal ${g.id}`, `${g.name} ${words.lit}`]), ['finale', words.finale], ['gate', words.gate[0]], ['portal', words.portalOpened[0]], ['saved', words.saved[0]], ['results', words.results], ['name', brief.name]];
      const subs = [['gate', words.gate[1]], ['portal', words.portalOpened[1]], ['saved', words.saved[1]], ['freeRoam', words.freeRoam], ['restored', words.restored]];
      const wide = [...titles.filter(([, t]) => px(t, 2) > 310).map(([k, t]) => `${k} ${px(t, 2)} px`), ...subs.filter(([, t]) => px(t) > 310).map(([k, t]) => `${k} (the line under) ${px(t)} px`)];
      rule('hud.banners', 'every banner of the realm (a goal lit, the finale, the gate, the portal, the saved realm, the results) fits the screen (at most 310 of 320 px at the size it is drawn)', wide.length === 0, wide.join(' '));
      const atlas = generateUI(), noIcon = (words.icons || []).filter((k) => !atlas[k]);
      rule('hud.icons', 'the two HUD icons of the goals (words.icons) are in the icon atlas', (words.icons || []).length === 2 && noIcon.length === 0, noIcon.length ? `(missing: ${noIcon.join(' ')})` : `(${(words.icons || []).join(', ')})`, { hard: true });
    }
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
    walk.each((x, y, z) => { if (y > sea0 - 0.5) { lo = Math.min(lo, y); if (y > hi) { hi = y; hiAt = [x, y, z]; } } });
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
        if (h(x, z) < sea0 + 0.5) continue;
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
    const rewards = [...goals, ...gp.chests, ...gp.npcs, ...gp.portals, ...gp.walls, ...(gp.mushrooms || []), ...(gp.whirlwinds || []), ...gp.placed.filter((p) => /pier|arch_gate|gate_pillars|windmill|tower|forge|realm_door|ice_fall|dragon_maw/.test(p.name))];
    // (a road that ends at the mouth of a cave leads into it: the cave's own way on is not a road the list can see)
    const atCave = (e) => massifs.some((m) => m.inBoxXZ(e.x, e.z) && [[8, 0], [-8, 0], [0, 8], [0, -8], [6, 6], [-6, 6], [6, -6], [-6, -6], [14, 0], [-14, 0], [0, 14], [0, -14]].some(([dx, dz]) => m.roofed(e.x + dx, e.y, e.z + dz, 3)));
    const dead = ends.filter((e) => !e.joined && Math.hypot(e.x - sp.x, e.z - sp.z) > 25 && !rewards.some((o) => Math.hypot(o.x - e.x, o.z - e.z) < 30) && !atCave(e));
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
    const en = gp.enemies.map((e) => ({ d: near(walk, e.x, e.z, 3, e.y ?? h(e.x, e.z)), w: DANGER[e.variant] ?? 1, v: e.variant })).filter((e) => Number.isFinite(e.d));
    const max = Math.max(1, ...walks.filter(Number.isFinite), ...en.map((e) => e.d)), thirds = [0, 0, 0];
    for (const e of en) thirds[Math.min(2, Math.floor((e.d / max) * 3))] += e.w;
    const kinds = new Set(en.map((e) => e.v));
    const cast = [...kinds].filter((k) => NEW_KINDS.has(k));
    rule('enemies.cast', 'a realm has a cast: at least five kinds of Snuffer, at least three of them the foes the game added to the three it began with (the Rimeling, the Slinger, the Ramhog, the Dustmole, the Lidwarden, the Fusepup, the Dusk Moth, the Smokecaller, the Pilferling)', kinds.size >= 5 && cast.length >= 3, `(${kinds.size} kinds: ${[...kinds].join(', ')}; ${cast.length} of the new foes: ${cast.join(', ') || 'none'})`);
    // a Ramhog is a line to step off: it stands where the hero has room on both sides of its line (most of a ring of 6 m round it is ground he can stand on)
    const hogs = gp.enemies.filter((e) => e.variant === 'hog');
    const cramped = hogs.filter((e) => {
      const y0 = e.y ?? h(e.x, e.z);
      let ok = 0;
      for (let a = 0; a < 16; a++) { const x = e.x + Math.cos((a / 16) * Math.PI * 2) * 6, z = e.z + Math.sin((a / 16) * Math.PI * 2) * 6; if (near(walk, x, z, 1.2, h(x, z)) < Infinity && Math.abs(h(x, z) - y0) < 1.5) ok++; }
      return ok < 11;
    });
    rule('enemies.room', 'a Ramhog stands where the hero has room to step off its line (11 of 16 points of a ring of 6 m round it are ground he can stand on, within 1.5 m of its height)', cramped.length === 0, cramped.length ? `(cramped: ${cramped.map((e) => `${f1(e.x)},${f1(e.z)}`).join(' ')})` : `(${hogs.length} Ramhogs)`);
    rule('design.danger', 'danger grows with the journey: the first third of the walk is the quietest, the busiest holds at least twice its danger, and more than one kind of Snuffer appears', en.length >= 8 && thirds[0] <= Math.min(thirds[1], thirds[2]) && Math.max(...thirds) >= thirds[0] * 2 && kinds.size >= 2, `(danger by thirds of the way: ${thirds.join(' / ')}; ${en.length} Snuffers, kinds ${[...kinds].join(', ')})`);
  }

  // the trials: the asks that stand in front of the lanterns (src/game/trials/, docs/DESIGN.md round twenty-nine): a realm is not the same ask five times, and each ask can be done where it stands
  if (isRealm) {
    const T = gp.trials || [];
    const order = goals.map((g) => { const t = T.find((q) => q.goal === g.id); return t ? t.kind : null; });
    const mix = trialMix(order);
    rule('trials.mix', 'the asks vary: the first lantern is the plain one (it teaches the lantern), at least three different kinds of trial stand in front of the others (fewer in a realm of fewer goals) and no kind stands twice running', mix.ok, `(${order.map((k) => k || 'plain').join(' > ')}: ${mix.kinds} kinds, ${mix.want} wanted)`);
    // each trial stands on level, dry, clear ground that the hero can walk to, near enough to its lantern to be found
    const problems = [];
    const ringPts = (cx, cz, r) => { const out = [[cx, cz]]; for (const k of [0.4, 0.75, 1]) for (let a = 0; a < 12; a++) out.push([cx + Math.cos((a / 12) * Math.PI * 2) * r * k, cz + Math.sin((a / 12) * Math.PI * 2) * r * k]); return out; };
    const standable = (x, z) => h(x, z) > sea1 + 0.35 && !collision.blocking(x, h(x, z) + 0.7, z, 0.35);
    for (const t of T) {
      const g = goals.find((q) => q.id === t.goal), tag = `${t.id}`;
      if (!g) { problems.push(`${tag}: its goal '${t.goal}' is not one of the goals`); continue; }
      const f = footprint(t);
      if (f) {
        let pts = ringPts(f.x, f.z, f.r);
        if (t.kind === 'puck') {                                                                       // (the court itself, a rectangle: turned by its yaw)
          pts = []; const c = Math.cos(t.yaw), sn = Math.sin(t.yaw);
          for (let lx = -t.hw; lx <= t.hw + 0.01; lx += t.hw / 2) for (let lz = -t.hl; lz <= t.hl + 0.01; lz += t.hl / 4) pts.push([t.x + lx * c + lz * sn, t.z - lx * sn + lz * c]);
        }
        const y0 = h(f.x, f.z), bad = pts.filter(([x, z]) => !standable(x, z)), steep = pts.filter(([x, z]) => Math.abs(h(x, z) - y0) > 0.9);
        if (bad.length) problems.push(`${tag}: ${bad.length} of ${pts.length} points of its ground are wet or under a prop (${bad.slice(0, 2).map((q) => q.map(f1).join(',')).join(' ')})`);
        if (steep.length) problems.push(`${tag}: ${steep.length} of ${pts.length} points of its ground are over 0.9 m off level`);
        if (!(near(walk, t.x, t.z, 3, y0) < Infinity)) problems.push(`${tag}: the hero cannot walk to it`);
      }
      if (t.kind === 'circuit') {
        const P = t.pylons;
        P.forEach((q, i) => { if (!standable(q.x, q.z) || !(near(walk, q.x, q.z, 3, h(q.x, q.z)) < Infinity)) problems.push(`${tag}: pylon ${i + 1} is not on ground he can walk to`); });
        let len = 0;
        for (let i = 1; i < P.length; i++) {
          const a = P[i - 1], b = P[i], d = Math.hypot(b.x - a.x, b.z - a.z); len += d;
          for (let u = 0; u <= d; u += 1.5) { const x = a.x + (b.x - a.x) * (u / d), z = a.z + (b.z - a.z) * (u / d); if (!standable(x, z) || grid.slopeAt(x, z) > 0.62) { problems.push(`${tag}: the way from pylon ${i} to ${i + 1} is wet, blocked or too steep at ${f1(x)},${f1(z)}`); break; } }
        }
        if (t.time !== undefined && t.time < timeFor(len)) problems.push(`${tag}: ${t.time} s is too little for ${f0(len)} m (a run at ${Math.round(CIRCUIT.pace * 100)}% of full speed takes ${timeFor(len)} s)`);
      }
      if (t.kind === 'thief') {                                                                          // (it needs country to run in: a ring of 14 m round where it stands is mostly ground)
        const y0 = h(t.spawnX, t.spawnZ);
        const ok = ringPts(t.spawnX, t.spawnZ, 14).filter(([x, z]) => near(walk, x, z, 2, h(x, z)) < Infinity && Math.abs(h(x, z) - y0) < 6).length;
        if (ok < 30) problems.push(`${tag}: only ${ok} of 37 points of a ring of 14 m round the Pilferling are ground to run on`);
      }
      if (t.kind === 'rings') {                                                                          // (a course in the air: a ledge to leap from, hoops that hang clear, and a glide that can fly it)
        const E = t.edgePt, fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), y0 = h(t.x, t.z);
        if (!(E.d <= 14 && h(E.x, E.z) - h(E.x + fx * 4, E.z + fz * 4) >= 3)) problems.push(`${tag}: there is no ledge to leap from (the ground must fall 3 m or more within 4 m of its lip, and the lip be within 14 m of where he stands: it is ${f1(E.d)} m)`);
        for (let u = 0; u <= E.d; u += 1) { const x = t.x + fx * u, z = t.z + fz * u; if (!standable(x, z) || Math.abs(h(x, z) - y0) > 0.9) { problems.push(`${tag}: the run to the lip is wet, blocked or not level at ${f1(x)},${f1(z)}`); break; } }
        t.rings.forEach((c, i) => {
          const lx = c.nz, lz = -c.nx;                                                                   // (across the hoop, in its plane)
          const low = c.y - t.r - h(c.x, c.z);
          if (low < 0.5) { problems.push(`${tag}: ring ${i + 1} hangs ${f1(low)} m over the ground at its lowest (0.5 m at the least)`); return; }
          for (let a = 0; a < 12; a++) {
            const px = c.x + lx * Math.cos((a / 12) * Math.PI * 2) * t.r, pz = c.z + lz * Math.cos((a / 12) * Math.PI * 2) * t.r, py = c.y + Math.sin((a / 12) * Math.PI * 2) * t.r;
            if (collision.blocking(px, py, pz, 0.3)) { problems.push(`${tag}: ring ${i + 1} has a prop or rock in its hoop at ${f1(px)},${f1(py)},${f1(pz)}`); break; }
          }
        });
        // the course flown over this ground by the model of the hero: leaping and gliding, walking off the edge and gliding from the fall, and a thumb a third of a second late
        const lx = fz, lz = -fx;
        const flights = [['leaping', pilots.ringsRight(), 0], ['walking off', pilots.ringsRight({ walk: true }), 0], ['a thumb late', pilots.ringsRight({ late: 0.3 }), 0], ['leaping from 3 m to one side', pilots.ringsRight(), 3], ['leaping from 3 m to the other', pilots.ringsRight(), -3]];
        for (const [what, policy, off] of flights) {
          const r = playTrial({ spec: t, hero: { x: t.x + lx * off, z: t.z + lz * off, yaw: t.yaw }, policy, T: 14, floorAt: h });
          if (r.solvedAt === null) problems.push(`${tag}: a hero ${what} does not fly it (he passes ${r.trial.passed} of the ${t.want} rings it asks for)`);
        }
      }
      const dd = t.kind === 'circuit' ? Math.min(...t.pylons.map((q) => Math.hypot(q.x - g.x, q.z - g.z))) : Math.hypot(t.x - g.x, t.z - g.z);          // (a circuit is found by the nearest of its pylons)
      if (dd > 110) problems.push(`${tag}: ${f0(dd)} m from its lantern (110 at the most: it must be found)`);
    }
    rule('trials.fair', 'every trial stands where it can be done: its ground is level (within 0.9 m), dry and clear of props, the hero can walk to it, a circuit\'s ways are walkable and its clock gives time for them, the Pilferling has country to run in, a course of rings has a ledge to leap from and hoops that hang clear and can be flown by the model of the hero (leaping, walking off, a thumb late), and it is within 110 m of its lantern', problems.length === 0, problems.length ? `(${problems.join('; ')})` : `(${T.length} trials)`);
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
    const picker = terrainPicker(grid), tex = {}, ground = new Set();
    let n = 0;
    for (let j = 0; j < grid.n; j++) for (let i = 0; i < grid.n; i++) for (const t of picker.tris(i, j)) { ground.add(t.tex); if (/cliff|far_/.test(t.tex)) continue; tex[t.tex] = (tex[t.tex] || 0) + 1; n++; }
    const main = Object.entries(tex).filter(([, v]) => v / n > 0.02).sort((a, b) => b[1] - a[1]);
    rule('design.palette', 'the ground is made of few textures (at most 7 beyond rock, each over 2%)', main.length <= 7, `(${main.map(([k, v]) => `${k} ${(100 * v / n).toFixed(0)}%`).join(', ')})`);

    // every texture the realm uses is one the game has: the ground, the roads, the props and the rock masses (a misspelt name draws a flat magenta, silently, and only where it is used)
    const have = new Set(Object.keys(generateWorldTextures())), used = new Set(ground);
    for (const k of W.kit.builders.keys()) used.add(k.split('|')[0]);
    for (const m of massifs) for (const t of [m.style.rock, m.style.interior, m.style.top, ...(m.style.layers || []).map((l) => l.name)]) used.add(t);
    for (const t of [L.farRock, ...Object.values(L.roadTextures || {}), ...Object.values(L.lakeTextures || {}), ...Object.values(L.cliffs || {})]) used.add(t);
    if (gp.trials && gp.trials.length) { const look = lookOf(brief); for (const t of [look.stone, look.crystal, look.metal]) used.add(t); }                  // (the stone and the crystal of its trials: built when the realm is played, not in this headless world)
    const missing = [...used].filter((t) => t && t !== '_' && !have.has(t));
    rule('textures.exist', 'every texture the realm uses is one the game has (a misspelt name draws flat magenta)', missing.length === 0, missing.length ? `(missing: ${missing.join(' ')})` : `(${used.size} textures)`, { hard: true });
  }

  // ---- THE TIDE: a realm whose water rises and falls (level.tide, realm/tide.js) --------------------------------------------------------------
  // The ground is made at the mean level and the walk map above is the hero's at the LOW tide (what he can reach, waiting for the water to go out); these hold the country to the high tide as well:
  // nothing he must stand on is under it, nowhere he can walk is too far from ground that is safe when it comes in, it takes something from him and does not take everything.
  if (tide) {
    const drown = drownDepth(L), deepAtHigh = sea1 - drown + 0.1;             // (ground lower than this is deeper than he can stand in when the sea is in)
    const high = (st, o = {}) => flood(st, { ...o, water: sea1 });
    const walkHigh = airT ? airTools({ grid, collision, gp, brief, flood: high }).make({ start: [sp.x, sp.z], startY: sp.y, breakWalls: true, openGate: true }).map : high([sp.x, sp.z], { hop: 6.2, breakWalls: true, openGate: true });
    const floor = (o) => collision.support(o.x, o.z, (o.y ?? h(o.x, o.z)) + 0.5, 0.6).y;
    const stands = [...goals.map((o) => ['goal ' + o.id, o]), ...gp.chests.map((o) => ['chest', o]), ...gp.npcs.map((o) => ['person', o]), ...gp.portals.map((o) => ['door', o]), ...gp.vases.map((o) => ['vase', o])];
    const wet = stands.filter(([, o]) => floor(o) < sea1 + 0.3);
    rule('tide.dry', 'everything the hero finds standing - a goal, a chest, a person, a door, a vase - is above the high tide', wet.length === 0, wet.length ? `(under it: ${wet.slice(0, 5).map(([k, o]) => `${k}@${f1(o.x)},${f1(o.z)} ${f1(floor(o))} m`).join(' ')})` : `(the high tide is ${f1(sea1)} m; the lowest of ${stands.length} stands at ${f1(Math.min(...stands.map(([, o]) => floor(o))))})`, { hard: true });

    // where he can be at the low tide and is drowned at the high (ground lower than `deepAtHigh`), and where he is not: ground that is safe to wait on (`refuge`) or to be set back on (`shore`, as player.js
    // remembers it: above the sea even at the high tide, or a deck)
    const lowest = [], refuge = [], shore = [];
    const onFoot = flood([sp.x, sp.z], { breakWalls: true, openGate: true });       // (what he can walk to: a jump across the deep to a bar of sand is a risk he takes, not a place the road leads)
    onFoot.each((x, y, z) => {
      const prop = y > h(x, z) + 0.3;
      if (!prop && y < deepAtHigh) lowest.push([x, y, z]);
      else refuge.push([x, z, y]);
      if (prop || y >= sea1 + 0.6) shore.push([x, z, y]);
    });
    if (lowest.length) {
      const fromRefuge = flood(null, { seeds: refuge, breakWalls: true, openGate: true }), fromShore = flood(null, { seeds: shore, breakWalls: true, openGate: true });
      let far = 0, farAt = null, farS = 0, farSAt = null;
      for (const [x, y, z] of lowest) {
        const d = fromRefuge.dist(x, z, y), e = fromShore.dist(x, z, y);
        if (d > far) { far = d; farAt = [x, z]; }
        if (e > farS) { farS = e; farSAt = [x, z]; }
      }
      const reach = refugeReach(tide, undefined, drown);
      rule('tide.refuge', 'nowhere the hero can walk at the low tide is too far from ground the high tide does not drown him on (the time the water takes to rise over his head, wading, halved)', far <= reach, `(${lowest.length} cells are deeper than ${f1(drown)} m at the high tide; the farthest is ${f0(far)} m from ground that is not, at ${farAt ? `${f0(farAt[0])},${f0(farAt[1])}` : '-'}; the most the rise allows is ${f0(reach)} m)`, { hard: true });
      rule('tide.shore', 'and ground that is above the sea even at the high tide - where a drowned hero is set back - is within 130 m of all of it', farS <= 130, `(the farthest is ${f0(farS)} m from it, at ${farSAt ? `${f0(farSAt[0])},${f0(farSAt[1])}` : '-'})`);
    } else rule('tide.refuge', 'the high tide drowns the hero somewhere he can walk at the low tide (or it is no tide to speak of)', false, '(the sea never gets deeper than he can stand in)');

    // what the tide does to the journey: it shuts some ways (a goal is out of reach at the high tide), never the first and never the finale, and not for long
    const reachH = goals.map((g) => near(walkHigh, g.x, g.z, 4, g.y - 0.5) < Infinity), cut = goals.filter((g, i) => !reachH[i]);
    rule('tide.gates', 'the tide is part of the journey: at least one goal cannot be reached at the high tide (it is the water going out that opens the way)', cut.length >= 1, `(cut off at the high tide: ${cut.map((g) => g.id).join(', ') || 'none'})`);
    rule('tide.open', 'the journey begins and ends without waiting: the first goal and the last can be reached at the high tide', reachH[0] && reachH[reachH.length - 1], `(${goals.map((g, i) => `${g.id} ${reachH[i] ? 'open' : 'cut'}`).join(', ')})`);
    // (the longest the sea can shut the way: while the lowest bare ground on the best walk to a goal is deeper under it than he can wade)
    let wait = 0, waitFor = '';
    goals.forEach((g, i) => {
      if (reachH[i]) return;
      let low = Infinity;
      for (const [x, y, z] of walk.route(g.x, g.z, 4, g.y - 0.5) || []) if (y <= h(x, z) + 0.3) low = Math.min(low, y);
      const shut = Number.isFinite(low) ? tideAbove(tide, low + drown) * tide.period : 0;
      if (shut > wait) { wait = shut; waitFor = g.id; }
    });
    rule('tide.wait', 'no way is shut by the sea for long: a hero who comes to it at the worst moment waits 45 s at most', wait <= 45, `(the longest is ${f0(wait)} s, the way to ${waitFor || '-'}; the tide's period is ${f0(tide.period)} s)`);
    const takes = 1 - high([sp.x, sp.z], { hop: 6.2, breakWalls: true, openGate: true }).count / footWalk.count;
    rule('tide.takes', 'the high tide takes a real part of the country from the hero: 4% or more of the ground he can walk at the low tide', takes >= 0.04, `(${(takes * 100).toFixed(1)}% of ${footWalk.count} cells)`);
  }

  const failed = results.filter((r) => !r.ok && !r.waived);
  return { results, failed, hardFailed: failed.filter((r) => r.hard), env, W };
}
