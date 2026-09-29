// Assembles the static realm: terrain, water, roads, props, sky and baked lighting.
import * as THREE from 'three';
import { U } from '../engine/materials.js';
import { Lighting, atmosphere, dynamicLight } from '../engine/lighting.js';
import { Builder } from '../engine/builder.js';
import { generateTerrain } from './terrain.js';
import { buildTerrainMeshes } from './terrain-mesh.js';
import { buildWater } from './water.js';
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
export function* buildWorldSteps(assets, populate) {
  const t0 = performance.now();
  const grid = generateTerrain();
  const lighting = new Lighting();
  lighting.attach(grid);
  const world = { grid, lighting, scene: new THREE.Scene(), timings: {} };
  world.timings.terrain = performance.now() - t0;
  yield [0.12, 'SCULPTING VALE'];

  // dry pass: props register shadow casters, colliders, glow lights and emitters
  const kit = new Kit({ assets, lighting, grid });
  world.kit = kit;
  world.colliders = kit.colliders;
  world.lights = kit.lights;
  world.emitters = kit.emitters;
  kit.setPass('dry');
  if (populate) populate(kit, world);
  yield [0.2, 'PLANTING TREES'];

  let t = performance.now();
  lighting.bake();
  world.timings.bake = performance.now() - t;
  yield [0.27, 'PAINTING THE GLOAMING'];

  t = performance.now();
  const terr = buildTerrainMeshes(grid, lighting, assets);
  world.terrain = terr.group;
  world.terrainStats = terr.stats;
  world.scene.add(terr.group);
  world.timings.terrainMesh = performance.now() - t;
  yield [0.33, 'RAISING HILLS'];

  t = performance.now();
  world.water = buildWater(grid, lighting, assets);
  world.scene.add(world.water);
  world.timings.water = performance.now() - t;

  // roads: cobble / dirt ribbons hugging the ground with worn, darker edges
  t = performance.now();
  world.roads = new THREE.Group();
  world.roads.name = 'roads';
  for (const surface of ['cobble', 'dirt']) {
    const b = new Builder({ lighting });
    for (const p of grid.paths) {
      if (p.surface !== surface) continue;
      const pts = p.pts.map((q) => [q[0], grid.heightAt(q[0], q[2]) + 0.07, q[2]]);
      b.ribbon(pts, p.width, { tile: 5, uSpan: p.width / 5, edgeTint: surface === 'cobble' ? [0.78, 0.78, 0.86] : [0.7, 0.66, 0.6], centerTint: [1.05, 1.05, 1.05] });
    }
    if (b.triangleCount) {
      const m = new THREE.Mesh(b.build(), assets.mat(surface, { decal: true }));
      m.renderOrder = 1;
      world.roads.add(m);
    }
  }
  world.scene.add(world.roads);
  world.timings.roads = performance.now() - t;
  yield [0.36, 'FILLING MIRRORMERE'];

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
  world.updateEnvironment = (camera, day, time, dt) => {
    world.day = day;
    const atm = atmosphere(day);
    world.atm = atm;
    U.uDay.value = day;
    U.uBlend.value = atm.ease;
    U.uFogColor.value.setRGB(atm.fog[0], atm.fog[1], atm.fog[2]);
    U.uFogRange.value.set(130 + 30 * day, 400 + 30 * day);
    dynamicLight(day, _dl);
    U.uSunDir.value.set(_dl.sunDir[0], _dl.sunDir[1], _dl.sunDir[2]);
    U.uSunCol.value.setRGB(_dl.sunCol[0], _dl.sunCol[1], _dl.sunCol[2]);
    U.uAmb.value.setRGB(_dl.amb[0], _dl.amb[1], _dl.amb[2]);
    world.sky.update(camera, atm, time, dt);
  };
  return world;
}

/** Synchronous build (dev scenes). */
export function buildWorld(assets, populate) {
  const it = buildWorldSteps(assets, populate);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}

/** Build with a chance to repaint between phases: `progress(frac, label)` may return a promise. */
export async function buildWorldAsync(assets, populate, progress = () => {}) {
  const it = buildWorldSteps(assets, populate);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    await progress(r.value[0], r.value[1]);
    await new Promise((res) => setTimeout(res, 0));
  }
}
