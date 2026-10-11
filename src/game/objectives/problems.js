// What is wrong with the objective of a brief: pure data (no three), so that defineBrief and the tools can call it. See base.js for what an objective is.

export const OBJECTIVE_KINDS = ['chase', 'duel', 'storm', 'herd'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isXZ = (p) => Array.isArray(p) && p.length === 2 && p.every(isNum);
const isXYZ = (p) => Array.isArray(p) && p.length === 3 && p.every(isNum);

/** What is wrong with a brief's objective (strings; none when it is a design). Pure: tools and defineBrief call it. */
export function objectiveProblems(o, goals) {
  const out = [], ids = (goals || []).map((g) => g.id), say = (s) => out.push(`objective: ${s}`);
  if (!o || typeof o !== 'object') return ['objective: { kind, final: id of the goal that opens when it is done, ... }'];
  if (!OBJECTIVE_KINDS.includes(o.kind)) say(`kind one of ${OBJECTIVE_KINDS.join(' | ')}`);
  if (!ids.includes(o.final)) say(`final: the id of the goal the objective opens (${ids.join(' ')})`);
  if (o.kind === 'chase') {
    if (!Array.isArray(o.route) || o.route.length < 3 || !o.route.every(isXZ)) say('chase: route [[x, z] ...] (at least three points: where the runaway runs, in order, the last at the final goal)');
    if (!Array.isArray(o.catches) || o.catches.length < 2 || !o.catches.every((i) => Number.isInteger(i) && i >= 1 && i < (o.route || []).length)) say('chase: catches [i ...] (at least two indexes into route, rising: where it stops to hide after each catch; the last is the end of the route)');
    else if (o.catches[o.catches.length - 1] !== o.route.length - 1) say('chase: the last catch is the last point of the route');
  }
  if (o.kind === 'duel') {
    if (!isXZ(o.arena) || !isNum(o.arenaR) || o.arenaR < 8) say('duel: arena [x, z] and arenaR (metres, 8 or more): where the Colossus stands and the ground that is its own');
    if (!(Number.isInteger(o.wounds) && o.wounds >= 4 && o.wounds <= 16)) say('duel: wounds, how many hits in the hatch of its chest it takes (4 to 16)');
  }
  if (o.kind === 'storm') {
    if (!Array.isArray(o.route) || o.route.length < 5 || !o.route.every(isXZ)) say('storm: route [[x, z] ...] (at least five points: the journey, in order, from the start to the last at the final goal)');
    if (!(isNum(o.speed) && o.speed >= 2 && o.speed <= 12)) say('storm: speed, metres a second the squall comes on at its ordinary pace (2 to 12)');
    if (o.refuges !== undefined && !(Array.isArray(o.refuges) && o.refuges.every((i) => Number.isInteger(i) && i >= 0 && i < (o.route || []).length))) say('storm: refuges [i ...] (indexes into route: where the hero is safe, and set back to if the squall takes him)');
  }
  if (o.kind === 'herd') {
    if (!Array.isArray(o.crabs) || o.crabs.length < 3 || !o.crabs.every(isXZ)) say('herd: crabs [[x, z] ...] (at least three: where they start)');
    if (!isXZ(o.pen) || !isNum(o.penR) || o.penR < 2) say('herd: pen [x, z] and penR (metres): where they are to be driven');
  }
  return out;
}
