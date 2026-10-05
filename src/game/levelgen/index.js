// Level population entry point: called twice by buildWorld (dry pass, then wet pass) — everything here must be
// deterministic. Gameplay data (enemies, gems, vases…) is produced in every pass but only kept from the dry one.
import { makeCtx } from './helpers.js';
import { attachGameplay, finalizeGems } from './gameplay.js';
import { layoutVillage, layoutLake, layoutRiver, layoutRuins, layoutWindmill, layoutSkyIsles, layoutHollow, layoutNorth, layoutFauna } from './layout.js';
import { scatterWorld } from './scatter.js';
import { planIslandDecor } from './islands.js';
import { Kit } from '../kit.js';
import { PROPS } from '../props/index.js';
import { buildTrial } from '../trials/place.js';

/** The Vale's trials: [the lantern they seal, the trial (trials/place.js)]. The pier's bell by the lake, a Pilferling in the east meadow, the siege at the foot of the Dawn mountain. */
const VALE_TRIALS = [
  ['isle', { kind: 'bells', at: [-26, 83], yaw: 0 }],
  ['mill', { kind: 'thief', at: [112, 75] }],
  ['dawn', { kind: 'siege', at: [-16, -66], r: 10, waves: [['basic', 'basic'], ['bell', 'slinger', 'basic'], ['thorn', 'bell', 'pup']] }],
];

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

  // the sky isles' own decor (a crystal cluster, a lantern tree, flowers): planned last, when everything that stands on an isle is known, so that
  // none of it lands on the bounce mushroom, a chest, an enemy's spawn or the beacon (see islands.js). Recorded like every other prop.
  ctx.stage = 'buildIslands';
  ctx.gp.islandDecor = {};
  for (const is of ctx.gp.islands) {
    const put = (name, x, z, rot, size) => {
      const rec = { name, x, z, y: is.y, rot, size, src: 'buildIslands' };
      ctx.gp.placed.push(rec);
      ctx.counts[name] = (ctx.counts[name] || 0) + 1;
      return rec;
    };
    const rec = put('floating_island', is.x, is.z, 0, is.r * 2);
    ctx.gp.islandDecor[is.id] = { rec, decor: planIslandDecor(ctx.gp, is, kit.rng(is.x, is.z, 3)).map((d) => ({ ...d, rec: put(d.name, d.x, d.z, d.rot, PROPS[d.name] ? PROPS[d.name].size : 4) })) };
  }
  ctx.stage = 'populate';

  // beacon order: hearth, isle, mill, sky, dawn (HUD counts lit beacons, order is cosmetic)
  const byId = Object.fromEntries(ctx.gp.beacons.map((b) => [b.id, b]));
  ctx.gp.beacons = [hearth, isle, byId.mill, byId.sky, byId.dawn].filter(Boolean);
  // the asks that seal three of the five lanterns (trials/place.js; the hearth teaches the lantern and the sky isles are a glide: those two stay plain). They stand on the meadow where it is level and clear,
  // and pay no gems of their own: the Vale's treasure was counted (700) before they were asked for.
  for (const [goal, t] of VALE_TRIALS) { const g = ctx.gp.beacons.find((b) => b.id === goal); if (g) ctx.gp.trials.push({ ...buildTrial(g, t, { h: ctx.h }), gems: [], src: 'populate' }); }
  ctx.gp.spawn = { x: L.spawn.x, y: ctx.h(L.spawn.x, L.spawn.z), z: L.spawn.z, yaw: L.spawn.yaw };
  ctx.gp.counts = ctx.counts;

  if (kit.pass === 'dry') world.gameplay = ctx.gp;
  else world.gameplay.islands = buildIslands(ctx, world);           // (headless, with no GPU assets, this only registers the colliders)
  return ctx;
}

/** Each floating island is its own little kit so it can be moved as a unit (and its colliders follow). */
function buildIslands(ctx, world) {
  const out = [];
  for (const isle of ctx.gp.islands) {
    const ik = new Kit({ assets: ctx.kit.assets, lighting: world.lighting, grid: world.grid });
    const { rec, decor } = ctx.gp.islandDecor[isle.id];
    const run = () => {
      const y = isle.y;
      const p = PROPS.floating_island;
      ik.cur = rec;
      if (p) p.fn(ik, { ...(p.defaults || {}), x: isle.x, z: isle.z, y, r: isle.r });
      // little decor on every isle, where islands.js planned it
      for (const d of decor) {
        const q = PROPS[d.name];
        ik.cur = d.rec;
        if (q) q.fn(ik, { ...(q.defaults || {}), x: d.x, z: d.z, y, rot: d.rot, ...d.params });
      }
    };
    ik.setPass('dry'); run();
    let group = null;
    if (ctx.kit.assets) {                                          // (no GPU assets in the headless level check: colliders only)
      ik.setPass('wet'); run();
      group = ik.build();
      world.scene.add(group);
    }
    out.push({ id: isle.id, src: 'buildIslands', group, colliders: ik.colliders, baseY: isle.baseY, y: isle.baseY, amp: isle.amp, speed: isle.speed, phase: isle.phase, lights: ik.lights, emitters: ik.emitters });
    world.lights.push(...ik.lights);
    world.emitters.push(...ik.emitters);
    world.colliders.push(...ik.colliders);
  }
  return out;
}
