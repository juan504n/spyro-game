// Assembles the static realm: terrain, water, roads, props, sky and baked lighting.
import * as THREE from 'three';
import { U } from '../engine/materials.js';
import { Lighting, atmosphere, dynamicLight, DEFAULT_ENVIRONMENT } from '../engine/lighting.js';
import { generateTerrain } from './terrain.js';
import { buildTerrainMeshes } from './terrain-mesh.js';
import { buildWater } from './water.js';
import { buildRoads, ROAD_DECAL } from './roads.js';
import { Sky } from './sky.js';
import { Kit } from './kit.js';

const _dl = {};

/**
 * @param {import('./assets.js').Assets} assets
 * @param {(kit: Kit, world: object) => void} [populate] level population. It runs TWICE (a dry pass that registers
 *   shadow casters / colliders / lights, then a wet pass that emits geometry) so it must be deterministic.
 * A generator: it yields [progress 0..1, label] between phases so an async caller can repaint a loading bar; the world is
 * its return value. Use buildWorld() (synchronous) or buildWorldAsync().
 */
export function* buildWorldSteps(assets, populate, level) {
  const t0 = performance.now();
  const grid = generateTerrain(level);
  const label = level?.labels || [];
  const env = level?.environment || DEFAULT_ENVIRONMENT;          // (how this world is lit and what its sky is: Gloaming Vale's twilight and daybreak unless the level brings its own)
  const lighting = new Lighting(env);
  lighting.attach(grid);
  const world = { grid, lighting, env, scene: new THREE.Scene(), timings: {} };
  world.timings.terrain = performance.now() - t0;
  // rock masses that are not part of the heightfield (a level's mountains with caves in them, see massif.js): sampled now, so that the light bake and the props already know them
  world.massifs = [];
  if (level?.massifs) {
    const tm = performance.now();
    for (const m of level.massifs(grid, level)) world.massifs.push(m.prepare());
    lighting.massifs = world.massifs;
    for (const m of world.massifs) m.envs = lighting.envs;           // (the rock's own light is made of the same two states)
    world.timings.massifField = performance.now() - tm;
  }
  yield [0.12, label[0] || 'SCULPTING VALE'];

  // dry pass: props register shadow casters, colliders, glow lights and emitters
  const kit = new Kit({ assets, lighting, grid });
  world.kit = kit;
  world.colliders = kit.colliders;
  world.lights = kit.lights;
  world.emitters = kit.emitters;
  kit.setPass('dry');
  if (populate) populate(kit, world);
  yield [0.2, label[1] || 'PLANTING TREES'];

  let t = performance.now();
  lighting.bake();
  world.timings.bake = performance.now() - t;
  yield [0.27, label[2] || 'PAINTING THE GLOAMING'];

  t = performance.now();
  const terr = buildTerrainMeshes(grid, lighting, assets);
  world.terrain = terr.group;
  world.terrainStats = terr.stats;
  world.scene.add(terr.group);
  world.timings.terrainMesh = performance.now() - t;
  if (world.massifs.length) {
    t = performance.now();
    world.massifMeshes = new THREE.Group();
    world.massifMeshes.name = 'massifs';
    world.massifStats = {};
    for (const m of world.massifs) {
      const b = m.build(assets, grid, kit.lights);              // (after the dry pass: the glow lights the props registered light the rock round them)
      world.massifMeshes.add(b.group);
      world.massifStats[m.id] = b.stats;
    }
    world.scene.add(world.massifMeshes);
    world.timings.massifMesh = performance.now() - t;
  }
  yield [0.33, label[3] || 'RAISING HILLS'];

  t = performance.now();
  world.water = buildWater(grid, lighting, assets);
  world.scene.add(world.water);
  world.timings.water = performance.now() - t;

  // roads: cobble / dirt ribbons DRAPED on the terrain mesh (see roads.js) with worn, darker edges
  t = performance.now();
  world.roads = new THREE.Group();
  world.roads.name = 'roads';
  const roads = buildRoads(grid, lighting);
  world.roadStats = roads.stats;
  for (const surface of ['cobble', 'dirt']) {
    if (!roads[surface]) continue;
    const m = new THREE.Mesh(roads[surface].build(), assets.mat((level?.roadTextures && level.roadTextures[surface]) || surface, { decal: ROAD_DECAL[surface] }));      // (a level can name the textures its roads wear: level.roadTextures)
    roads[surface].release();                                          // (the geometry owns typed copies now)
    m.renderOrder = surface === 'cobble' ? 2 : 1;                      // (cobble over dirt where two roads meet)
    world.roads.add(m);
  }
  world.scene.add(world.roads);
  world.timings.roads = performance.now() - t;
  yield [0.36, label[4] || 'FILLING MIRRORMERE'];

  // wet pass: props emit lit geometry using the baked shadow maps
  t = performance.now();
  kit.setPass('wet');
  if (populate) populate(kit, world);
  world.props = kit.build();
  world.scene.add(world.props);
  world.colliders = kit.colliders;
  world.lights = kit.lights;
  world.emitters = kit.emitters;
  world.timings.props = performance.now() - t;
  world.timings.propTris = kit.triangleCount();

  world.sky = new Sky(assets);
  world.scene.add(world.sky.group);
  world.day = 0;

  /** Per-frame environment: sky, fog and dynamic-light uniforms from `day`. */
  world.updateEnvironment = (camera, day, time, dt, indoor = 0) => {
    world.day = day;
    const atm = atmosphere(day, env);
    world.atm = atm;
    U.uDay.value = day;
    U.uBlend.value = atm.ease;
    U.uFogColor.value.setRGB(atm.fog[0], atm.fog[1], atm.fog[2]);
    U.uFogRange.value.set(130 + 30 * day, 400 + 30 * day);
    dynamicLight(day, _dl, env);
    if (indoor > 0.001) {
      // inside a cave the hero and everything else lit on the fly is lit like the rock round him: the sun is shut out, the sky's ambient dimmed
      const k = indoor;
      for (let i = 0; i < 3; i++) { _dl.sunCol[i] *= 1 - 0.8 * k; _dl.amb[i] *= 1 - 0.42 * k; }
    }
    U.uSunDir.value.set(_dl.sunDir[0], _dl.sunDir[1], _dl.sunDir[2]);
    U.uSunCol.value.setRGB(_dl.sunCol[0], _dl.sunCol[1], _dl.sunCol[2]);
    U.uAmb.value.setRGB(_dl.amb[0], _dl.amb[1], _dl.amb[2]);
    world.sky.update(camera, atm, time, dt);
  };
  return world;
}

/** Synchronous build (dev scenes). `level` = a level definition (default: Gloaming Vale's, see level.js). */
export function buildWorld(assets, populate, level) {
  const it = buildWorldSteps(assets, populate, level);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}

/** Build with a chance to repaint between phases: `progress(frac, label)` may return a promise. */
export async function buildWorldAsync(assets, populate, progress = () => {}, level) {
  const it = buildWorldSteps(assets, populate, level);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    await progress(r.value[0], r.value[1]);
    await new Promise((res) => setTimeout(res, 0));
  }
}
