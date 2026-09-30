// The realm built headlessly (both level passes, no GPU): what the checks and tools that only need the level's data share.
//   const { grid, world, kit, dryCtx, collision, gp, level } = buildHeadless();
// The wet pass registers the floating isles' colliders too (no meshes without GPU assets), exactly as the game does, so `collision` is the game's.
import { generateTerrain } from '../src/game/terrain.js';
import { Lighting } from '../src/engine/lighting.js';
import { Kit } from '../src/game/kit.js';
import { populate } from '../src/game/levelgen/index.js';
import { Collision } from '../src/game/collision.js';
import { LEVEL } from '../src/game/level.js';

export function buildHeadless() {
  const t0 = performance.now();
  const grid = generateTerrain();
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
  return { grid, lighting, world, kit, dryCtx, wetCtx, collision, gp: world.gameplay, level: LEVEL, ms: performance.now() - t0 };
}
