// THE MISSIONS (docs/DESIGN.md, round thirty-nine). The first Spyro games gave every level its own errand: Gloaming Vale's is the lanterns (breathe fire on them), and no other world asks for that. Each of the others has one
// of its own, and the goals of the world (its lanterns, stones, blooms, bells and lenses: BeaconSystem) stay where they are and are lit when the mission says so:
//
//   rescue   Frostbloom Hollow   a sprite sleeps in each frozen bloom: RAM the bloom to free it, lead the freed sprites to the Heartbloom (they follow him, and fly home if he falls)
//   hunt     Emberfall Crags     a Slag Brute holds each of three stones (the wisps and the rings light the other two): beat it (three wounds, in the hatch of its chest) and the stone burns
//   chime    Skyweaver Spires    the windbells hang too high for a hero on the ground: fly into one (a jump is enough at the first, the whirlwinds and the glides carry him to the rest) and it rings
//   deliver  Tideglass Reach     the lenses are dark: carry a tide pearl to each (the pearls lie in the shallows, bare only at low tide; he drops it in deep water or when he is hurt)
//
// A brief says its mission as data: `mission: { kind, goals: [ids it lights], ...the kind's own }` (base.js missionProblems holds it). See base.js for the rest.
import { Mission } from './base.js';
import { missionProblems, MISSION_KINDS } from './problems.js';
import { Rescue } from './rescue.js';
import { Hunt } from './hunt.js';
import { Chime } from './chime.js';
import { Deliver } from './deliver.js';

export { Mission, missionProblems, MISSION_KINDS };
const KINDS = { rescue: Rescue, hunt: Hunt, chime: Chime, deliver: Deliver };

/** The mission of a brief, made for a running game (the goals, the foes and the trials are already there). */
export function makeMission(game, spec) {
  const cls = KINDS[spec.kind];
  if (!cls) throw new Error(`mission: no kind '${spec.kind}'`);
  return new cls(game, spec);
}
