// The level script of a realm, assembled from stages. `makePopulate(brief, steps)` gives the `populate(kit, world)` a REALMS entry wants: it runs the steps in order on one ctx (the placement
// helpers of levelgen/helpers.js, with the gameplay lists of levelgen/gameplay.js), labels everything each step placed with the step's name (the debug readout says which function made what),
// and keeps the gameplay data of the dry pass. Like every level script it runs TWICE (a dry pass that registers colliders, lights and shadow casters, then a wet pass that emits geometry):
// everything in a step must be deterministic (use ctx.rng, never Math.random).
//
// The stages here are the ones every realm has: its goals, the ring of light over the last of them, and the treasure. The places of the realm are the realm's own (its layout.js).
import { makeCtx } from '../levelgen/helpers.js';
import { attachGameplay } from '../levelgen/gameplay.js';
import { Collision } from '../collision.js';
import { WATER_LEVEL } from '../level.js';
import { ENEMY_DROPS } from '../economy.js';
import { sum } from './helpers.js';

/** Gameplay lists whose records get a `src` (the step that made them) for the debug readout. */
const STAGED = ['gems', 'vases', 'chests', 'walls', 'braziers', 'mushrooms', 'enemies', 'bunnies', 'npcs', 'hints', 'beacons', 'portals'];

/**
 * @param brief  the realm's brief (brief.js)
 * @param steps  [function | [name, function]]: the stages in order; each is called with the ctx
 * @param seed   the placement RNG's seed (a realm's own: changing it reshuffles every scatter)
 */
export function makePopulate(brief, steps, { seed = 4417 } = {}) {
  const list = steps.map((s) => (Array.isArray(s) ? s : [s.name, s]));
  return function populate(kit, world) {
    kit.skin = (brief.theme && brief.theme.skin) || null;          // (the realm's skin: its props wear its textures, see kit.js)
    const ctx = makeCtx(kit, world, seed);
    attachGameplay(ctx);
    ctx.brief = brief;
    ctx.gp.portals = [];
    ctx.gp.arrivals = {};
    ctx.gp.purple = [];
    const L = ctx.L;
    for (const [name, fn] of list) {
      const marks = STAGED.map((k) => ctx.gp[k].length);
      ctx.stage = name;
      fn(ctx);
      STAGED.forEach((k, i) => { for (let j = marks[i]; j < ctx.gp[k].length; j++) { const r = ctx.gp[k][j]; if (r && typeof r === 'object' && !r.src) r.src = name; } });
      ctx.stage = 'populate';
    }
    const sp = L.spawn;
    ctx.gp.spawn = { x: sp.x, y: ctx.h(sp.x, sp.z), z: sp.z, yaw: sp.yaw };
    ctx.gp.counts = ctx.counts;
    if (kit.pass === 'dry') world.gameplay = ctx.gp;
    return ctx;
  };
}

// ---- the stages every realm has -------------------------------------------------------------------------------------------------------------------------

/** The goals of the brief become the realm's goal objects (the lanterns: gp.beacons), each with its hint zone if the brief gives one. Their order is the order the brief lists them in. */
export function goalsStage(ctx) {
  const { gp, brief, h } = ctx;
  for (const g of brief.goals) {
    const rec = { id: g.id, name: g.name, x: g.x, y: g.y !== undefined ? g.y : h(g.x, g.z), z: g.z, yaw: g.yaw || 0 };
    for (const k of ['big', 'model', 'beam', 'glow', 'wisp', 'flame', 'spark', 'sparkle', 'sfx']) if (g[k] !== undefined) rec[k] = g[k];
    gp.beacons.push(rec);
    ctx.occ.add(g.x, g.z, g.big ? 7 : 4.5);                    // (nothing grows where a goal stands)
    if (g.hint) gp.hints.push({ x: g.hintAt ? g.hintAt[0] : g.x, z: g.hintAt ? g.hintAt[1] : g.z, r: g.hintR || 10, text: g.hint, dur: 6 });
  }
}

/**
 * The ring of light that opens above the last goal when it is lit (systems/portals.js, kind 'lift'): it hangs out of a jump's reach, a ring of light on the floor marks where its beam comes down,
 * and a jump made inside it lets the light carry the hero up into the portal and out of the realm (to `brief.exit.target`).
 */
export function exitStage(ctx) {
  const { gp, brief } = ctx, E = brief.exit, last = gp.beacons[gp.beacons.length - 1];
  const id = E.id || 'exit', cy = E.cy ?? 16.5, y = last.y + (E.dy ?? 0);
  gp.portals.push({ id, name: E.name, tag: E.tag, kind: 'lift', shape: 'ring', flat: true, x: last.x, y, z: last.z, yaw: 0, r: E.r ?? 2.6, cy, catchR: E.catchR ?? 5.4, color: E.color, target: E.target, state: 'closed' });
  gp.soundSources.push({ name: 'portal_hum', x: last.x, y: y + cy - 1.0, z: last.z, range: 70, vol: 1.5, when: `portal:${id}` });
}

/**
 * The treasure: the purple gems the hand placed (25 each), the trail of gems that leads the way down every road that has `gems` in the brief, and a top-up with scattered ones so that the
 * total is a tidy number (a multiple of 50, at least brief.gems.min). Nothing to collect hangs inside a prop (a crystal's collider is wide) or in the rock.
 */
export function gemsStage(ctx) {
  const { gp, h, rng, brief } = ctx;
  for (const [x, y, z] of gp.purple || []) gp.gems.push({ x, y, z, value: 25 });
  for (const r of brief.roads) {
    if (!r.gems) continue;
    const g = r.gems;
    ctx.roadGems(r.id, g.t0 ?? 0.04, g.t1 ?? 1, g.every ?? 10, g.pattern ?? [1, 1, 2], g.lateral ?? 0);
  }
  const col = new Collision(ctx.grid, ctx.kit.colliders, ctx.world.massifs || []);
  const clear = (g) => !col.blocking(g.x, g.y, g.z, 0.1);
  gp.gems.splice(0, gp.gems.length, ...gp.gems.filter(clear));
  gp.vases.splice(0, gp.vases.length, ...gp.vases.filter((v) => !col.blocking(v.x, v.y + 0.5, v.z, 0)));
  let dyn = 0;
  for (const e of gp.enemies) dyn += sum(ENEMY_DROPS[e.variant] || ENEMY_DROPS.basic);
  for (const v of gp.vases) dyn += sum(v.gems);
  for (const c of gp.chests) dyn += sum(c.gems);
  for (const w of gp.walls) dyn += sum(w.gems);
  const fixed = dyn + sum(gp.gems.map((g) => g.value));
  const target = Math.max(brief.gems.min, Math.ceil(fixed / 50) * 50);
  let need = target - fixed, guard = 0;
  const roads = ctx.grid.paths;
  while (need > 0 && guard++ < 4000) {
    const p = roads[rng.int(0, roads.length)], q = p.pts[rng.int(0, p.pts.length)];
    const x = q[0] + rng.float(-4, 4), z = q[2] + rng.float(-4, 4);
    if (h(x, z) < WATER_LEVEL + 0.6 || ctx.slope(x, z) > 0.4) continue;
    const v = need >= 2 && rng.chance(0.3) ? 2 : 1;
    const g = { x, y: h(x, z) + 0.95, z, value: v };
    if (!clear(g)) continue;
    gp.gems.push(g);
    need -= v;
  }
  gp.gemsTotal = sum(gp.gems.map((g) => g.value)) + dyn;
  gp.gemBreakdown = { dynamic: dyn, static: sum(gp.gems.map((g) => g.value)), fixed, topUp: target - fixed };
}
