// THE OBJECTIVES (docs/DESIGN.md, round forty-one). Gloaming Vale's task is the lanterns (breathe fire on five of them) and no other world asks for that, or anything shaped like it: none of the other
// four has a row of things to go to and set alight, ring, free or deliver. Each has ONE task of a kind of its own, played over the whole realm, and one object at its end that the task opens (the exit):
//
//   chase    Frostbloom Hollow   a sprite has bolted with the Heartbloom's spring: run it down along the hollow, three times, and it gives it back
//   duel     Emberfall Crags     the Slag Colossus holds the furnace: the way there, and a fight with a thing the size of a house
//   storm    Skyweaver Spires    a squall comes up behind the hero across the sky islands: outrun it to the Loom
//   herd     Tideglass Reach     the lantern crabs have scattered over the flats: drive them, all of them, into the harbour pen
//
// A brief says its objective as data: `objective: { kind, final: the id of the goal that opens when it is done, ...the kind's own }` (objectiveProblems holds it). The goals of such a brief that are not the
// final are STATIONS: places of the realm (the layout puts its props and its trials there, the TRAVEL menu goes to them, the map and the checks know them) that are never lit and are not drawn as lanterns.
import { Objective } from './base.js';
import { objectiveProblems, OBJECTIVE_KINDS } from './problems.js';
import { Chase } from './chase.js';
import { Duel } from './duel.js';
import { Storm } from './storm.js';
import { Herd } from './herd.js';

export { Objective, objectiveProblems, OBJECTIVE_KINDS };
const KINDS = { chase: Chase, duel: Duel, storm: Storm, herd: Herd };

/** The objective of a brief, made for a running game (the goals, the foes and the trials are already there). */
export function makeObjective(game, spec) {
  const cls = KINDS[spec.kind];
  if (!cls) throw new Error(`objective: no kind '${spec.kind}'`);
  return new cls(game, spec);
}
