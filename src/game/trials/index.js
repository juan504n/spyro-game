// The trials (docs/DESIGN.md, round twenty-nine): `TRIALS` says what each kind is (kinds.js), a machine says what it does (one file each: a pure state machine, played in Node by tools/trial-test.mjs
// and in the game by systems/trials.js).
import { bells } from './bells.js';
import { plates } from './plates.js';
import { circuit } from './circuit.js';
import { wisps } from './wisps.js';
import { puck } from './puck.js';
import { mirrors, solidsOf as mirrorSolids } from './mirrors.js';
import { thief } from './thief.js';
import { siege } from './siege.js';

export { TRIALS, TRIAL_IDS } from './kinds.js';
export { lcg, hyp } from './core.js';
export { BELLS } from './bells.js';
export { PLATES, pressed, solveBoard } from './plates.js';
export { CIRCUIT, timeFor } from './circuit.js';
export { WISPS } from './wisps.js';
export { PUCK, toLocal, toWorld, goalieX } from './puck.js';
export { MIRRORS, cellWorld, trace, solveMirrors, reflect } from './mirrors.js';
export { THIEF } from './thief.js';
export { SIEGE } from './siege.js';

/** The machines by kind. Each: init(t, ctx), step(t, dt, ctx), hud(t) -> { text, n, of, clock? } | null, targets(t) -> [{ x, y, z, r }] (what the hero's aim assist may swing to). */
export const MACHINES = { bells, plates, circuit, wisps, puck, mirrors, thief, siege };

/** A trial record for a spec the layout wrote ({ kind, id, goal, x, z, y?, yaw?, ...the kind's own parts }), made ready: `ctx.rng` is used for what is random in it (a tune, a scramble, a puzzle). */
export function makeTrial(spec, ctx) {
  const M = MACHINES[spec.kind];
  if (!M) throw new Error(`no trial kind '${spec.kind}'`);
  const t = { y: 0, yaw: 0, state: 'idle', t: 0, ...spec };
  M.init(t, ctx);
  return t;
}

/** The kinds of foe a trial brings (a thief; the waves of a siege): the checker holds the place to what they need, and the gems a solved trial pays are counted from what they would have dropped. */
export const foesOf = (spec) => (spec.kind === 'thief' ? ['thief'] : spec.kind === 'siege' ? (spec.waves || []).flat() : []);

/** What a trial puts on the floor that the hero and the foes cannot walk through: [{ x, z, r, h }] (the view makes them solid in the game; the simulator in the tools does the same). */
export function solidsOf(t) {
  if (t.kind === 'mirrors') return mirrorSolids(t);
  if (t.kind === 'bells') return t.bells.map((b) => ({ x: b.x, z: b.z, r: 0.7, h: 2.7 }));
  return [];
}

/** One step of a trial. */
export const stepTrial = (t, dt, ctx) => MACHINES[t.kind].step(t, dt, ctx);
export const hudOf = (t) => MACHINES[t.kind].hud(t);
export const targetsOf = (t) => MACHINES[t.kind].targets(t);
