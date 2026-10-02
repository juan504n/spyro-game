// A world built headlessly (both level passes, no GPU): what the checks and tools that only need the level's data share.
//   const { grid, world, kit, dryCtx, collision, gp, level } = buildHeadless();         // Gloaming Vale, the realm
//   const home = buildHeadless('home');                                                   // Dawnhaven, the homeworld
//   const frost = buildHeadless('frostbloom');                                            // any world of REALMS (src/game/realms.js) by its id
// The wet pass registers the floating isles' colliders too (no meshes without GPU assets), exactly as the game does, so `collision` is the game's.
import { generateTerrain } from '../src/game/terrain.js';
import { Lighting } from '../src/engine/lighting.js';
import { Kit } from '../src/game/kit.js';
import { Collision } from '../src/game/collision.js';
import { REALMS } from '../src/game/realms.js';
import { REALM as STARTER } from '../src/game/realm/starter/index.js';

/** A world by its id (a key of REALMS, or 'starter': the realm the generator starts from, src/game/realm/starter), or a REALMS-style entry itself. */
export const resolveRealm = (which) => (typeof which === 'object' && which ? which : which === 'starter' ? STARTER : REALMS[which] || REALMS.gloaming);

export function buildHeadless(which = 'gloaming') {
  const t0 = performance.now();
  const realm = resolveRealm(which), level = realm.level, populate = realm.populate;
  const grid = generateTerrain(level);
  const lighting = new Lighting(level.environment);
  lighting.attach(grid);
  const world = { grid, lighting, timings: {}, scene: { add() {} } };
  world.massifs = level.massifs ? level.massifs(grid, level).map((m) => m.prepare()) : [];       // (the rock masses: their field and collision, no meshes without GPU assets)
  lighting.massifs = world.massifs;
  const kit = new Kit({ assets: null, lighting, grid });
  world.kit = kit;
  world.colliders = kit.colliders;          // (as world.js does: the wet pass adds the isles' colliders to it)
  world.lights = kit.lights;
  world.emitters = kit.emitters;
  kit.setPass('dry');
  const dryCtx = populate(kit, world);
  lighting.bake();
  kit.setPass('wet');
  const wetCtx = populate(kit, world);
  const collision = new Collision(grid, kit.colliders, world.massifs);
  return { grid, lighting, world, kit, dryCtx, wetCtx, collision, gp: world.gameplay, level, ms: performance.now() - t0 };
}

/**
 * What the game adds when it starts (ObjectSystem and NpcSystem put these colliders in the world; the headless build has only the props'): the chests, vases, cracked walls, the NPCs and
 * the gate's barrier. Tools that walk the world, or put the hero somewhere in it, call this first.
 */
export function addRuntimeColliders(collision, gp, grid) {
  for (const c of gp.chests || []) collision.add({ type: 'box', x: c.x, z: c.z, hx: 1.0, hz: 0.65, rot: c.yaw || 0, y0: c.y, y1: c.y + 0.9, top: false, tag: 'chest' });
  for (const v of gp.vases || []) collision.add({ type: 'cyl', x: v.x, z: v.z, r: 0.55, y0: v.y, y1: v.y + 1.1, top: false, tag: 'vase' });
  for (const w of gp.walls || []) collision.add({ type: 'box', x: w.x, z: w.z, hx: w.w / 2, hz: 0.6, rot: w.yaw || 0, y0: w.y, y1: w.y + w.h, top: false, tag: 'wall' });
  for (const n of gp.npcs || []) { const y = grid.heightAt(n.x, n.z); collision.add({ type: 'cyl', x: n.x, z: n.z, r: 0.6, y0: y, y1: y + 1.7, top: false, tag: 'npc' }); }
  if (gp.barrier) collision.add({ type: 'box', x: gp.barrier.x, z: gp.barrier.z, hx: 3.4, hz: 0.9, rot: gp.barrier.yaw || 0, y0: gp.barrier.y - 2, y1: gp.barrier.y + 14, top: false, tag: 'barrier' });
}
