// The level script of THE GUARDIAN'S COURT: the door of Dawnhaven at the foot of the gorge, the road up to the crest and down into the bowl (lamps, banners, the statues of the wardens that stood before it),
// the court (its eight pillars, its rings of runes, the torches at its four gates of stone, the dais with the Guardian's seat) and the data the fight reads (`gp.boss`: where the Guardian sits, where the
// pillars are, where the helpers of the later phases come out of the floor). Like every level script it runs twice (a dry pass, then a wet one) and must be deterministic: ctx.rng, never Math.random.
import { makePopulate, gemsStage } from '../realm/populate.js';
import { inFront, faceTo, lampsAlong, TAU } from '../realm/helpers.js';
import { COURT, DAIS_TOP, PILLARS, DOOR } from './level.js';

/** What the stage that tops up the treasure (realm/populate.js gemsStage) wants of a brief: a trail of gems down the road, and a total of at least 150. */
const BRIEF = { roads: [{ id: 'gorge', gems: { t0: 0.04, t1: 0.97, every: 9, pattern: [1, 1, 2], lateral: 1.8 } }], gems: { min: 150 } };

export const populate = makePopulate(BRIEF, [layoutDoor, layoutRoad, layoutCourt, layoutBoss, gemsStage], { seed: 6611 });

// ---- the door of Dawnhaven ---------------------------------------------------------------------------------------------------------------
function layoutDoor(ctx) {
  const { gp, put, h } = ctx;
  const y = h(DOOR.x, DOOR.z);
  put('realm_door', DOOR.x, DOOR.z, { rot: DOOR.yaw, color: DOOR.color, sealed: false, y }, 12);
  gp.portals.push({ id: DOOR.id, name: DOOR.name, tag: DOOR.tag, kind: 'door', shape: 'arch', x: DOOR.x, y, z: DOOR.z, yaw: DOOR.yaw, r: 2.6, hs: 3.1, cy: 3.4, color: DOOR.color, target: DOOR.target, state: 'open' });
  gp.soundSources.push({ name: 'portal_hum', x: DOOR.x, y: y + 3.4, z: DOOR.z, range: 44, vol: 1.3, when: `portal:${DOOR.id}` });
  for (const side of [-1, 1]) {
    put('torch_stand', ...inFront(DOOR, 6.4, side * 5.4), { rot: DOOR.yaw }, 1.5);
    put('crystal_cluster', ...inFront(DOOR, 3, side * 9.5), { color: 'violet', count: 5 }, 2.4);
  }
  gp.hints.push({ x: DOOR.x, z: DOOR.z - 14, r: 10, text: "THE GUARDIAN'S COURT. THE ROAD NORTH LEADS TO IT", dur: 6 });
}

// ---- the gorge road ----------------------------------------------------------------------------------------------------------------------
function layoutRoad(ctx) {
  const { gp, put } = ctx;
  lampsAlong(ctx, 'gorge', 16, 12, 94, 1.0, 'torch_stand');
  // the wardens that stood before the Guardian: a pair of statues every 24 m, facing the road
  for (let z = 90; z > 16; z -= 24) {
    for (const side of [-1, 1]) put('warden_statue', side * 6.2, z, { rot: side > 0 ? -Math.PI / 2 : Math.PI / 2 }, 3.4);
  }
  for (const [z, color] of [[76, 'violet'], [40, 'cyan']]) for (const side of [-1, 1]) put('crystal_spire', side * 7.8, z, { color, h: 6 + (z > 60 ? 0 : 1.5) }, 3);
  gp.hints.push({ x: 0, z: 62, r: 12, text: 'THE GUARDIAN SLEEPS IN THE COURT BELOW. DO NOT STAND STILL WHEN IT WAKES', dur: 7 });
}

// ---- the court ------------------------------------------------------------------------------------------------------------------------------
function layoutCourt(ctx) {
  const { put } = ctx;
  const cx = COURT.x, cz = COURT.z;
  put('court_runes', cx, cz, { r: COURT.r }, 0);
  put('guardian_dais', cx, cz, { r: COURT.dais.r, y: DAIS_TOP }, 0);
  for (const P of PILLARS) put('court_pillar', P.x, P.z, { h: COURT.pillars.h, r: P.r, rot: faceTo(P.x, P.z, cx, cz) }, P.r + 1.5);
  // the torches at the court's four gates of stone, between the pillars, and a banner or two on the rim
  for (let k = 0; k < 4; k++) {
    const a = (k * TAU) / 4 + Math.PI / 4, x = cx + Math.cos(a) * 33, z = cz + Math.sin(a) * 33;
    put('torch_stand', x, z, { rot: faceTo(x, z, cx, cz) }, 1.5);
    put('crystal_cluster', cx + Math.cos(a) * 35.5, cz + Math.sin(a) * 35.5, { color: k % 2 ? 'cyan' : 'violet', count: 6 }, 2.4);
  }
  for (const a of [Math.PI * 0.62, Math.PI * 1.38]) put('banner_pole', cx + Math.cos(a) * 34.5, cz + Math.sin(a) * 34.5, { rot: a + Math.PI / 2 }, 1);
}

// ---- what the fight reads ----------------------------------------------------------------------------------------------------------------------
function layoutBoss(ctx) {
  const { gp, h } = ctx;
  const cx = COURT.x, cz = COURT.z;
  // where the helpers of the later phases come out of the floor: between the pillars, 31 m from the dais (never on the road's side: that is where a hero who was set back stands), the first two plain, then a plain, a bell and a thorn
  const spot = (k) => { const a = COURT.pillars.a0 + ((k + 0.5) * TAU) / COURT.pillars.n; return [cx + Math.cos(a) * 31, cz + Math.sin(a) * 31]; };
  const helper = (k, variant) => { const [x, z] = spot(k); return { x, z, y: h(x, z), variant }; };
  gp.boss = {
    x: cx, z: cz, daisY: DAIS_TOP, floor: COURT.floor, arenaR: COURT.r, daisR: COURT.dais.r, wake: COURT.wake, leave: COURT.leave, bodyR: 4.6, lanterns: 3,
    pillars: PILLARS.map((P) => ({ ...P })),
    helpers: [[], [helper(2, 'basic'), helper(6, 'basic')], [helper(5, 'basic'), helper(4, 'bell'), helper(7, 'thorn')]],
  };
  gp.hints.push({ x: cx, z: cz + COURT.r - 6, r: 12, text: 'RUN! THE FISTS FOLLOW YOU. RAM THE ONE THAT LANDS, THEN FLAME THE LANTERNS ON THE CROWN', dur: 8 });
}
