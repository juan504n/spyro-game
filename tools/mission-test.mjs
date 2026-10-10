// The missions as pure logic (src/game/missions/): what a brief may say (missionProblems refuses what cannot be played), when a goal is lit (complete: at once, or when its trial's seal falls), what a hero in the air
// touches (the windbell's reach), what the sea takes from a hero who carries a pearl, and how many sprites the Heartbloom wants. The missions in the running game are played by tools/realm-test.mjs and tools/realm-bot.mjs.
//   node tools/mission-test.mjs
import { missionProblems, MISSION_KINDS } from '../src/game/missions/problems.js';
import { Mission } from '../src/game/missions/base.js';
import { Chime, CHIME } from '../src/game/missions/chime.js';
import { Deliver, DELIVER } from '../src/game/missions/deliver.js';
import { RESCUE } from '../src/game/missions/rescue.js';
import { BRIEF as FROST } from '../src/game/frostbloom/brief.js';
import { BRIEF as EMBER } from '../src/game/emberfall/brief.js';
import { BRIEF as SKY } from '../src/game/skyweaver/brief.js';
import { BRIEF as TIDE } from '../src/game/tideglass/brief.js';

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail); };

check('there are four kinds of mission, and the briefs of the four realms say a well-formed one each', MISSION_KINDS.length === 4 && [FROST, EMBER, SKY, TIDE].every((b) => missionProblems(b.mission, b.goals).length === 0), [FROST, EMBER, SKY, TIDE].map((b) => b.mission.kind).join(' '));

const goals = [{ id: 'a' }, { id: 'b', trial: { kind: 'bells' } }, { id: 'c' }, { id: 'd' }];
const bad = (m) => missionProblems(m, goals).length > 0;
check('a mission of an unknown kind is refused', bad({ kind: 'fetch', goals: ['a'] }));
check('a mission that lights a goal that is not there is refused', bad({ kind: 'chime', goals: ['a', 'zz'] }));
check('a goal that is neither the mission\'s nor sealed by a trial is refused (nothing would light it: no flame can)', bad({ kind: 'chime', goals: ['a'] }) && !bad({ kind: 'chime', goals: ['a', 'c', 'd'] }));
check('a rescue needs its final goal, outside its own goals, and a number of sprites it can have', bad({ kind: 'rescue', goals: ['a', 'c'], need: 2 }) && bad({ kind: 'rescue', goals: ['a', 'c'], final: 'a', need: 2 }) && bad({ kind: 'rescue', goals: ['a', 'c'], final: 'd', need: 5 }) && !bad({ kind: 'rescue', goals: ['a', 'c'], final: 'd', need: 2 }));
check('a hunt has one brute for each goal, each with a place', bad({ kind: 'hunt', goals: ['a', 'c', 'd'], brutes: [{ goal: 'a', at: [0, 0] }] }) && bad({ kind: 'hunt', goals: ['a', 'c', 'd'], brutes: [{ goal: 'a', at: [0, 0] }, { goal: 'a', at: [1, 1] }, { goal: 'c', at: [2, 2] }] }) && !bad({ kind: 'hunt', goals: ['a', 'c', 'd'], brutes: [{ goal: 'a', at: [0, 0] }, { goal: 'c', at: [1, 1] }, { goal: 'd', at: [2, 2] }] }));
check('a delivery has one pearl for each lens, each with a place', bad({ kind: 'deliver', goals: ['a', 'c', 'd'], pearls: [{ goal: 'a', at: [0, 0] }] }) && !bad({ kind: 'deliver', goals: ['a', 'c', 'd'], pearls: [{ goal: 'a', at: [0, 0] }, { goal: 'c', at: [1, 1] }, { goal: 'd', at: [2, 2] }] }));
check('a chime\'s reach is held to what a hero can mean (0.8 to 3 m)', bad({ kind: 'chime', goals: ['a', 'c', 'd'], reach: 5 }) && !bad({ kind: 'chime', goals: ['a', 'c', 'd'], reach: 1.7 }));

// ---- when a goal is lit ----------------------------------------------------------------------------------------------------------------------------------------------------
const stub = (ids) => {
  const lit = [];
  const list = ids.map((id) => ({ def: { id, name: id.toUpperCase() }, id, x: 0, y: 0, z: 0, scale: 1, litFlag: false, sealed: false }));
  const g = { dyn: { add() {} }, beacons: { list, get: (id) => list.find((b) => b.id === id), ignite: (b) => { b.litFlag = true; lit.push(b.id); } }, hud: { hint() {} }, fx: { hitSpark() {} }, audio: null, on() {} };
  return { g, list, lit };
};
{
  const { g, list, lit } = stub(['a', 'b']);
  const m = new Mission(g, { kind: 'chime', goals: ['a', 'b'] });
  check('a mission takes the flame from every goal of the world, and claims its own', list.every((b) => b.noFire === true && b.mission === m));
  m.complete(list[0]);
  check('a goal whose condition is met is lit at once', lit.join() === 'a' && list[0].missionDone === true && m.done === 1);
  list[1].sealed = true;
  m.complete(list[1]);
  check('a goal that a trial still seals is not lit: the mission waits for the trial (missionDone says the mission is done)', lit.join() === 'a' && list[1].missionDone === true && !list[1].litFlag);
  list[1].sealed = false; m.complete(list[1]);
  check('... and is lit when the seal is down and the mission says so again', lit.join() === 'a,b');
  m.complete(list[1]);
  check('a goal that is lit is lit once', lit.length === 2);
}

// ---- the windbell: what a hero in the air touches -----------------------------------------------------------------------------------------------------------------------
{
  const c = Object.create(Chime.prototype); c.reach = CHIME.reach;
  const b = { x: 10, y: 5, z: 10, scale: 1 }, mid = b.y + CHIME.centre;
  check('a hero on the ground rings nothing, however near', !c.touches(b, 10, 5, 10, true) && !c.touches(b, 10, mid - 0.5, 10, true));
  check('a hero in the air at the height of the bell and within a stride of it rings it', c.touches(b, 10 + 1.0, mid - 0.5, 10, false) && c.touches(b, 10, mid - 0.5 + 1.0, 10, false));
  check('... and not one who is in the air under it, over it or beside it', !c.touches(b, 10, 5 + 0.2, 10, false) && !c.touches(b, 10, mid + 3, 10, false) && !c.touches(b, 14, mid, 10, false));
  check('the first bell is within the reach of a plain jump (a jump is 2.9 m: the foot of a hero at the top of one is 2.9 m up, his middle 3.4)', 5 + 2.9 + 0.5 - mid > -CHIME.reach, `(the middle of the bell is ${CHIME.centre} m up, the reach ${CHIME.reach})`);
  const big = { x: 0, y: 0, z: 0, scale: 2.2 };
  check('a big bell (the Loom\'s, 2.2 times as large) is rung from a wider ring and a higher place', c.touches(big, 3, 6.3 - 0.5, 0, false) && !c.touches(big, 5, 6.3 - 0.5, 0, false));
}

// ---- the pearls ----------------------------------------------------------------------------------------------------------------------------------------------------------------
check('a pearl is lost to the sea at the depth of a hero\'s knees, which is less than the depth that drowns him (0.95 m)', DELIVER.drownDepth < 0.95 && DELIVER.drownDepth > 0.4, `(${DELIVER.drownDepth} m)`);
check('a lens takes a pearl from a hero within 4 m and a pearl is picked up from 1.7 m', DELIVER.giveR === 4.2 && DELIVER.pickR === 1.7);
{
  const brief = TIDE.mission, tide = TIDE.tide, lo = -tide.amp, ground = -0.46;
  check('the pearls\' beds are bare at low tide and under the sea a good part of the cycle (a hero must wait for the ebb)', brief.pearls.length === 4 && ground + 0.2 > lo && ground + 0.2 < tide.amp, `(${brief.pearls.length} pearls; the sea over the beds goes between ${lo} and ${tide.amp} m)`);
}
check('the Heartbloom wants as many sprites as there are blooms with one in them', FROST.mission.need === FROST.mission.goals.length && RESCUE.finalR >= 8);
check('a hunt holds three stones with brutes and leaves the other two to trials; a delivery leaves the court to its circuit', EMBER.mission.brutes.length === 3 && EMBER.goals.filter((g) => !EMBER.mission.goals.includes(g.id)).every((g) => g.trial) && TIDE.goals.filter((g) => !TIDE.mission.goals.includes(g.id)).every((g) => g.trial));
check('every goal of Skyweaver is a bell the mission rings, and no trial is left in it', SKY.mission.goals.length === SKY.goals.length && SKY.goals.every((g) => !g.trial));

console.log(failed ? `${failed} FAILED` : 'all mission checks passed');
process.exitCode = failed ? 1 : 0;
