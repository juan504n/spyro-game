// Level population entry point: called twice by buildWorld (dry pass, then wet pass) — everything here must be
// deterministic. Gameplay data (enemies, gems, vases…) is produced in every pass but only kept from the dry one.
import { makeCtx } from './helpers.js';
import { attachGameplay, finalizeGems } from './gameplay.js';
import { layoutVillage, layoutLake, layoutRiver, layoutRuins, layoutWindmill, layoutSkyIsles, layoutHollow, layoutNorth, layoutFauna } from './layout.js';
import { scatterWorld } from './scatter.js';
import { Kit } from '../kit.js';
import { PROPS } from '../props/index.js';

/** Gameplay lists whose records get a `src` (the stage that made them) for the debug readout. */
const STAGED = ['gems', 'vases', 'chests', 'walls', 'braziers', 'mushrooms', 'enemies', 'bunnies', 'npcs', 'hints', 'beacons', 'islands'];

export function populate(kit, world) {
  const ctx = makeCtx(kit, world);
  attachGameplay(ctx);
  const L = ctx.L;
  /** run one part of the level script, labelling everything it places (props, colliders, enemies, chests, hints...) with its name */
  const stage = (name, fn) => {
    const marks = STAGED.map((k) => ctx.gp[k].length);
    ctx.stage = name;
    fn(ctx);
    STAGED.forEach((k, i) => { for (let j = marks[i]; j < ctx.gp[k].length; j++) { const r = ctx.gp[k][j]; if (r && typeof r === 'object' && !r.src) r.src = name; } });
    ctx.stage = 'populate';
  };

  // fixed story beacons (mill / sky / dawn are added by their layouts, in the right order below)
  const hearth = { id: 'hearth', name: 'HEARTH BEACON', x: L.lanterns[0].x, y: ctx.h(L.lanterns[0].x, L.lanterns[0].z), z: L.lanterns[0].z, yaw: 0, src: 'populate' };
  const isle = { id: 'isle', name: 'ISLE BEACON', x: L.island.x, y: ctx.h(L.island.x, L.island.z), z: L.island.z, yaw: 0, src: 'populate' };

  stage('layoutVillage', layoutVillage);
  stage('layoutLake', layoutLake);
  stage('layoutRiver', layoutRiver);
  stage('layoutRuins', layoutRuins);
  stage('layoutWindmill', layoutWindmill);
  stage('layoutSkyIsles', layoutSkyIsles);
  stage('layoutHollow', layoutHollow);
  stage('layoutNorth', layoutNorth);
  stage('layoutFauna', layoutFauna);
  stage('scatterWorld', scatterWorld);
  stage('finalizeGems', finalizeGems);

  // beacon order: hearth, isle, mill, sky, dawn (HUD counts lit beacons, order is cosmetic)
  const byId = Object.fromEntries(ctx.gp.beacons.map((b) => [b.id, b]));
  ctx.gp.beacons = [hearth, isle, byId.mill, byId.sky, byId.dawn].filter(Boolean);
  ctx.gp.spawn = { x: L.spawn.x, y: ctx.h(L.spawn.x, L.spawn.z), z: L.spawn.z, yaw: L.spawn.yaw };
  ctx.gp.counts = ctx.counts;

  if (kit.pass === 'dry') world.gameplay = ctx.gp;
  else world.gameplay.islands = kit.assets ? buildIslands(ctx, world) : [];      // (no GPU assets in the headless level check)
  return ctx;
}

/** Each floating island is its own little kit so it can be moved as a unit (and its colliders follow). */
function buildIslands(ctx, world) {
  const out = [];
  for (const isle of ctx.gp.islands) {
    const ik = new Kit({ assets: ctx.kit.assets, lighting: world.lighting, grid: world.grid });
    const run = () => {
      const y = isle.y;
      const p = PROPS.floating_island;
      ik.cur = { name: 'floating_island', x: isle.x, z: isle.z, y, size: isle.r * 2, src: 'buildIslands' };
      if (p) p.fn(ik, { ...(p.defaults || {}), x: isle.x, z: isle.z, y, r: isle.r });
      // little decor on every isle
      const rng = ik.rng(isle.x, isle.z, 3);
      for (let i = 0; i < 3; i++) {
        const a = rng.float(0, Math.PI * 2), d = rng.float(isle.r * 0.35, isle.r * 0.75);
        const x = isle.x + Math.cos(a) * d, z = isle.z + Math.sin(a) * d;
        const name = i === 0 ? 'crystal_cluster' : i === 1 ? 'tree_lantern' : 'flower_patch';
        const q = PROPS[name];
        ik.cur = { name, x, z, y, size: 4, src: 'buildIslands' };
        if (q) q.fn(ik, { ...(q.defaults || {}), x, z, y, rot: a, r: 3, count: 10, color: i % 2 ? 'violet' : 'cyan', size: 's', canopy: 'leaves_teal' });
      }
    };
    ik.setPass('dry'); run();
    ik.setPass('wet'); run();
    const group = ik.build();
    out.push({ group, colliders: ik.colliders, baseY: isle.baseY, y: isle.baseY, amp: isle.amp, speed: isle.speed, phase: isle.phase, lights: ik.lights, emitters: ik.emitters });
    world.lights.push(...ik.lights);
    world.emitters.push(...ik.emitters);
    world.colliders.push(...ik.colliders);
    world.scene.add(group);
  }
  return out;
}
