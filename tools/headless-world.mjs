// A world built headlessly (both level passes, no GPU): what the checks and tools that only need the level's data share.
//   const { grid, world, kit, dryCtx, collision, gp, level } = buildHeadless();         // Gloaming Vale, the realm
//   const home = buildHeadless('home');                                                   // Dawnhaven, the homeworld
// The wet pass registers the floating isles' colliders too (no meshes without GPU assets), exactly as the game does, so `collision` is the game's.
import { generateTerrain } from '../src/game/terrain.js';
import { Lighting } from '../src/engine/lighting.js';
import { Kit } from '../src/game/kit.js';
import { populate as populateRealm } from '../src/game/levelgen/index.js';
import { populateHome } from '../src/game/home/layout.js';
import { Collision } from '../src/game/collision.js';
import { LEVEL } from '../src/game/level.js';
import { HOME } from '../src/game/home/level.js';

export function buildHeadless(which = 'gloaming') {
  const t0 = performance.now();
  const level = which === 'home' ? HOME : LEVEL, populate = which === 'home' ? populateHome : populateRealm;
  const grid = generateTerrain(level);
  const lighting = new Lighting();
  lighting.attach(grid);
  const world = { grid, lighting, timings: {}, scene: { add() {} } };
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
  const collision = new Collision(grid, kit.colliders);
  return { grid, lighting, world, kit, dryCtx, wetCtx, collision, gp: world.gameplay, level, ms: performance.now() - t0 };
}
