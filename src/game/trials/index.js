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
import { hyp } from './core.js';
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

/** how far from a trial the hero may be before it is put to sleep: it is not stepped (no clock runs, nothing spawns, nothing is heard from a hundred metres off), and what it was doing is let go */
export const AWAKE = { bells: 45, plates: 45, circuit: 80, wisps: 40, puck: 50, mirrors: 50, thief: 80, siege: 60 };
/** how far the hero is from a trial: from its middle, or, for a circuit that runs over the country, from the nearest of its pylons */
export const distTo = (t, p) => (t.kind === 'circuit' ? Math.min(...t.pylons.map((q) => hyp(p.x - q.x, p.z - q.z))) : hyp(p.x - t.x, p.z - t.z));

/** One step of a trial, if the hero is near enough for it to be awake; if he has gone far off it is put to sleep (once: `t.asleep`). */
export function stepTrial(t, dt, ctx) {
  const M = MACHINES[t.kind];
  if (t.state !== 'solved' && distTo(t, ctx.p) > AWAKE[t.kind]) {
    if (!t.asleep) { t.asleep = true; if (M.sleep) M.sleep(t, ctx); }
    return;
  }
  t.asleep = false;
  M.step(t, dt, ctx);
}
export const hudOf = (t) => (t.asleep ? null : MACHINES[t.kind].hud(t));
export const targetsOf = (t) => (t.asleep ? [] : MACHINES[t.kind].targets(t));
