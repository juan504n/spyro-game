// Interactive objects (owned by the object artist). Export OBJECTS = { name: { create(assets, opts) -> Model, size, note } }.
// Each object lives in ./objects/<name>.js; shared helpers in ./objects/common.js (Rig: materials/meshes/flash/dispose)
// and ./objects/geo.js (struts, flutes, double-sided quads, ...).
import { createBeacon } from './objects/beacon.js';
import { createVase } from './objects/vase.js';
import { createChest } from './objects/chest.js';
import { createBounceMushroom } from './objects/mushroom.js';
import { createBrazier } from './objects/brazier.js';
import { createWindmillSails } from './objects/windmill.js';
import { createBarrier } from './objects/barrier.js';
import { createWard } from './objects/ward.js';
import { createPortcullis } from './objects/portcullis.js';
import { createLightBeam } from './objects/beam.js';
import { createCrackedWall } from './objects/wall.js';
import { createPortal } from './objects/portal.js';
import { createFrostbloom } from './objects/frostbloom.js';
import { createEmberstone } from './objects/emberstone.js';

export const OBJECTS = {
  beacon: {
    create: createBeacon,
    size: 4.6,
    note: 'Beacon Lantern: setLit(k) 0 dark/dormant .. 1 blazing; opts.big = x2.2 Great Beacon; anchors flame/base/top',
  },
  frostbloom: {
    create: createFrostbloom,
    size: 4.2,
    note: 'Frostbloom (the goal of Frostbloom Hollow): a flower of ice that opens and turns blossom pink as it thaws; setLit(k) 0 asleep .. 1 in bloom; opts.big = x2.2 Heartbloom; anchors flame/base/top',
  },
  emberstone: {
    create: createEmberstone,
    size: 4.2,
    note: 'Emberstone (the goal of Emberfall Crags): a coal caged in shards of basalt that opens and blazes as it kindles; setLit(k) 0 cold .. 1 burning; opts.big = x2.2 Heartforge; anchors flame/base/top',
  },
  vase: {
    create: createVase,
    size: 1.1,
    note: 'breakable urn, opts.variant 0..2, wobble(k), shardColors',
  },
  chest: {
    create: createChest,
    size: 1.6,
    note: 'treasure chest, setOpen(k) 0..1 (lid to 100 deg), anchors.mouth',
  },
  bounce_mushroom: {
    create: createBounceMushroom,
    size: 4,
    note: 'bouncy mushroom pad, opts.size, pose.squash (edge-triggered spring), anchors.top',
  },
  brazier: {
    create: createBrazier,
    size: 1.4,
    note: 'iron brazier, setLit(k): cold ash + violet ember -> glowing orange coals; anchors.flame',
  },
  windmill_sails: {
    create: createWindmillSails,
    size: 16,
    note: 'four latticed sails + hub, origin = hub centre, XY plane facing +Z, update(dt,{angle}) rotates about Z',
  },
  barrier: {
    create: createBarrier,
    size: 12,
    note: 'Dawn Gate energy wall (XY plane, double sided, base at y=0), default fills the gate_pillars opening 6.2x11.6; opts w/wTop/h/arch; setOpen(k) 0..1 dissolves it',
  },
  ward_wall: {
    create: createWard,
    size: 90,
    note: 'the ward round the Dawn Gate\'s mountain: a semi-translucent violet wall (hex lattice like the gate\'s field) on the circle of opts.radius (42) round (cx, cz), following opts.heightAt(x, z); world-space vertices, root at the origin; update(dt, { t, open, px, pz }) brightens it round the hero, setOpen(k) 0..1 dissolves it',
  },
  portcullis: {
    create: createPortcullis,
    size: 10,
    note: 'iron grate gate: opts w/h (4x5), frame "stone" (5.8x10.4 gatehouse, grate lifts 4.5 into it) or "none" (grate only, for an existing frame); setOpen(k)',
  },
  light_beam: {
    create: createLightBeam,
    size: 12,
    note: 'additive light column, opts.height (60) / opts.radius (1.6), setColor([r,g,b]), setIntensity(k)',
  },
  cracked_wall: {
    create: createCrackedWall,
    size: 6,
    note: 'breakable stone wall panel opts.w x opts.h (6x5) x 1, jagged top, painted cracks, wobble(k), shardColors',
  },
  realm_portal: {
    create: createPortal,
    size: 6,
    note: 'swirl of light filling a doorway between worlds (XY plane, double sided, +Z front): opts shape "ring" (radius r) | "arch" (half-width r, straight part hs, origin at the arch\'s springing), color [r,g,b], rim; setOpen(k) pops it open / closed, setSealed(b) a dormant dim veil, setColor(c), update(dt, { t, boost })',
  },
};
