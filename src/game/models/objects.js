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
import { createWhirlwind } from './objects/whirlwind.js';
import { createWindbell } from './objects/windbell.js';
import { createTidelens } from './objects/tidelens.js';
import { createGuardian, createGuardianFist } from './objects/guardian.js';
import { createTrialBell, createTrialPlate, createTrialPylon, createTrialVent, createTrialMirror, createTrialLens, createTrialPuck, createTrialGoalie, createTrialGoal, createTrialCourt, createTrialStone } from './objects/trial.js';

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
  windbell: {
    create: createWindbell,
    size: 4.4,
    note: 'Windbell (the goal of Skyweaver Spires): a bronze bell hung in a frame of two marble pillars and a lintel on a plinth with a ring of runes; dull blue-grey and still until it is rung, then it warms to gold, swings, and a heart of light, a turning hoop of runes and a halo come on; setLit(k) 0 silent .. 1 ringing; opts.big = x2.2 Loom Bell; anchors flame/base/top',
  },
  tidelens: {
    create: createTidelens,
    size: 4.6,
    note: 'Tide Lens (the goal of Tideglass Reach): a lens of sea-glass in a brass ring on a spindle above a plinth of sea-stone with a ring of runes; dull grey-green and slow until it is lit, then the glass clears to aquamarine, the lens spins on its spindle, and a heart of light, a turning hoop of runes and a halo come on; setLit(k) 0 dark .. 1 shining; opts.big = x2.2 Tideglass; anchors flame/base/top',
  },
  guardian: {
    create: createGuardian,
    size: 20,
    note: 'The Guardian (the boss of the Guardian\'s Court): a colossus of dark runed stone on a pedestal, 14.6 m with the crown over his head, a visor that blazes when he charges a bolt and a crown of three lantern cages that comes off his head and opens round his body when he stoops; origin = the top of the pedestal, he looks along +Z; update(dt, pose { crown, ring, lit [3], active, visor, awake, freed, roar })',
  },
  guardian_fist: {
    create: createGuardianFist,
    size: 4,
    note: 'One of the Guardian\'s two floating fists (3.4 m across, origin at the bottom): a rune on its back that glows cyan when it has landed (the target of a ram); update(dt, pose { glow, crack }) - the halves fall apart when it cracks',
  },
  whirlwind: {
    create: createWhirlwind,
    size: 12,
    note: 'Whirlwind (the updraft of Skyweaver Spires): a funnel of streaked wind that widens as it rises, two veils of additive air scrolling round it in opposite directions, a ring of wind at its foot; origin = the middle of the foot; opts.h (column height), r (radius at the foot)',
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
  // ---- the trials (systems/trialview.js): opts.look = { stone, crystal, metal } textures and { glow } a colour: the realm's own
  trial_bell: { create: createTrialBell, size: 2.6, note: 'a bronze bell hung in two posts on a drum of stone; setLit(k) the heart of light, kick() it swings' },
  trial_plate: { create: createTrialPlate, size: 2.8, note: 'a round inlay with a rune in the floor; setLit(k), press() it sinks and comes back' },
  trial_pylon: { create: createTrialPylon, size: 5, note: 'a slim obelisk with a crystal floating over it; setState(off | next | done), touch() a flash' },
  trial_vent: { create: createTrialVent, size: 2.2, note: 'seven little stones round a hole that glows; setActive(k)' },
  trial_mirror: { create: createTrialMirror, size: 2.9, note: 'a crystal slab on a drum that turns a quarter; setSlope(0 "/" | 1 "\\"), setLit(k) the beam is in it; opts.slope' },
  trial_lens: { create: createTrialLens, size: 3, note: 'the lamp a beam leaves (opts.role "lamp", a funnel along +z) or the receiver it must reach ("receiver", a ring of blocks); setLit(k)' },
  trial_puck: { create: createTrialPuck, size: 0.6, note: 'a disc of crystal; setLit(k), spinBy(a)' },
  trial_goalie: { create: createTrialGoalie, size: 2, note: 'a slab of stone with an eye on its +z face that slides across the goal' },
  trial_goal: { create: createTrialGoal, size: 6, note: 'two posts and a crossbar with a net of light, opts.hw the half-width of the mouth; flash(k)' },
  trial_court: { create: createTrialCourt, size: 24, note: 'the lines of a court on the floor: opts.hw, opts.hl, opts.goalHW; setLit(k)' },
  trial_stone: { create: createTrialStone, size: 3.3, note: 'a standing stone with a rune that wakes; opts.big x1.5; setLit(k)' },
  realm_portal: {
    create: createPortal,
    size: 6,
    note: 'swirl of light filling a doorway between worlds (XY plane, double sided, +Z front): opts shape "ring" (radius r) | "arch" (half-width r, straight part hs, origin at the arch\'s springing), color [r,g,b], rim; setOpen(k) pops it open / closed, setSealed(b) a dormant dim veil, setColor(c), update(dt, { t, boost })',
  },
};
