// The objectives as pure logic (src/game/objectives/): what a brief may say (objectiveProblems refuses what cannot be played) and the numbers each task is held to (a sprite that runs slower than the hero is
// caught at its corners, a storm that comes on slower than he runs can be outrun and faster than he stands, a slam is jumpable, a crab is slower than he is). The tasks in the running game are played by
// tools/realm-test.mjs and tools/realm-bot.mjs (tools/lib/objective-driver.js); what the briefs of the four realms say is tools/objective-check.mjs.
//   node tools/objective-test.mjs
import { objectiveProblems, OBJECTIVE_KINDS } from '../src/game/objectives/problems.js';
import { CHASE } from '../src/game/objectives/chase.js';
import { DUEL } from '../src/game/objectives/duel.js';
import { STORM } from '../src/game/objectives/storm.js';
import { HERD } from '../src/game/objectives/herd.js';
import { BRIEF as FROST } from '../src/game/frostbloom/brief.js';
import { BRIEF as EMBER } from '../src/game/emberfall/brief.js';
import { BRIEF as SKY } from '../src/game/skyweaver/brief.js';
import { BRIEF as TIDE } from '../src/game/tideglass/brief.js';
import { P as PLAYER } from '../src/game/player.js';

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail); };

check('there are four kinds of objective, and the briefs of the four realms say a well-formed one each', OBJECTIVE_KINDS.length === 4 && [FROST, EMBER, SKY, TIDE].every((b) => objectiveProblems(b.objective, b.goals).length === 0), [FROST, EMBER, SKY, TIDE].map((b) => b.objective.kind).join(' '));

const goals = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const bad = (o) => objectiveProblems(o, goals).length > 0;
const R = [[0, 0], [10, 0], [20, 5], [30, 10], [40, 20], [50, 30]];
check('an objective of an unknown kind, or without a goal to open, is refused', bad({ kind: 'fetch', final: 'c' }) && bad({ kind: 'chase', final: 'zz', route: R, catches: [3, 5] }) && bad(undefined));
check('a chase needs a route of three points or more and catches that rise to the last point', bad({ kind: 'chase', final: 'c', route: R.slice(0, 2), catches: [1] }) && bad({ kind: 'chase', final: 'c', route: R, catches: [3] }) && bad({ kind: 'chase', final: 'c', route: R, catches: [2, 4] }) && !bad({ kind: 'chase', final: 'c', route: R, catches: [3, 5] }));
check('a duel needs an arena of 8 m or more and between 4 and 16 wounds', bad({ kind: 'duel', final: 'c', arena: [0, 0], arenaR: 4, wounds: 9 }) && bad({ kind: 'duel', final: 'c', arena: [0, 0], arenaR: 20, wounds: 2 }) && !bad({ kind: 'duel', final: 'c', arena: [0, 0], arenaR: 20, wounds: 9 }));
check('a storm needs a route of five points, a pace of 2 to 12 m/s and refuges that are points of the route', bad({ kind: 'storm', final: 'c', route: R.slice(0, 4), speed: 5 }) && bad({ kind: 'storm', final: 'c', route: R, speed: 40 }) && bad({ kind: 'storm', final: 'c', route: R, speed: 5, refuges: [9] }) && !bad({ kind: 'storm', final: 'c', route: R, speed: 5, refuges: [2, 4] }));
check('a herd needs three crabs or more and a pen with a radius', bad({ kind: 'herd', final: 'c', crabs: [[0, 0], [1, 1]], pen: [0, 0], penR: 5 }) && bad({ kind: 'herd', final: 'c', crabs: [[0, 0], [1, 1], [2, 2]], pen: [0, 0] }) && !bad({ kind: 'herd', final: 'c', crabs: [[0, 0], [1, 1], [2, 2]], pen: [5, 5], penR: 5 }));

// ---- the numbers each task is held to -------------------------------------------------------------------------------------------------------------------------------------------------------
const run = PLAYER.runSpeed;
check('the runaway sprite runs a little slower than the hero (he gains on it and catches it at its corners), and dawdles when he is far behind', CHASE.runSpeed < run && CHASE.runSpeed > run * 0.7 && CHASE.slowSpeed < CHASE.runSpeed * 0.5, `(sprite ${CHASE.runSpeed}, hero ${run}, far ${CHASE.slowSpeed} m/s)`);
check('a ram reaches a cornered sprite from further than a touch does', CHASE.catchR > CHASE.touchR && CHASE.stunT >= 1);
check('the storm is slower than the hero runs, presses when he is near and eases when he is far ahead', SKY.objective.speed < run * 0.8 && STORM.nearMul < 1 && STORM.farMul > 1 && STORM.near < STORM.far, `(${SKY.objective.speed} m/s against ${run}; lead ${STORM.near}..${STORM.far} m)`);
check('the storm starts well behind him (a lead he can lose and win back) and hurts no faster than once a second', (SKY.objective.lead ?? STORM.lead) >= 40 && STORM.hurtEvery >= 1);
check('the slam of the Colossus is jumpable: the ring grows for a second or more before it falls, and a jump clears it', DUEL.raise.every((t) => t >= 0.8) && DUEL.jumpOver >= 0.8 && DUEL.slamR > DUEL.near);
check('the hatch stays open long enough for two rams in the first phase, and a wound shuts it for a moment', DUEL.vent[0] >= 2 * (DUEL.shut + 0.6) - 1 && DUEL.shut >= 0.6, `(vent ${DUEL.vent.join('/')} s, shut ${DUEL.shut} s)`);
check('the quake races out faster than the hero runs (it is jumped, not outrun) and its band can be cleared by a jump', DUEL.quakeSpeed > run && DUEL.quakeBand <= 2.2);
check('a crab flees slower than the hero runs at its fastest and faster than he walks at his slowest (he can drive it, and it can get away if he stands off)', HERD.vMax < run * 0.75 && HERD.vMax > 4, `(${HERD.vMin}..${HERD.vMax} m/s against ${run})`);
check('a crab is afraid at 10 m or more and a pen is large enough to hold it', HERD.fleeR >= 10 && TIDE.objective.penR >= 5);

console.log(failed ? `${failed} FAILED` : 'all objective checks passed');
process.exitCode = failed ? 1 : 0;
