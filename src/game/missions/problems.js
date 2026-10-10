// What is wrong with the mission of a brief: pure data (no three), so that defineBrief and the tools can call it. See base.js for what a mission is.

export const MISSION_KINDS = ['rescue', 'hunt', 'chime', 'deliver'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isXZ = (p) => Array.isArray(p) && p.length === 2 && p.every(isNum);

/** What is wrong with a brief's mission (strings; none when it is a design). Pure: tools and defineBrief call it. */
export function missionProblems(m, goals) {
  const out = [], ids = (goals || []).map((g) => g.id), say = (s) => out.push(`mission: ${s}`);
  if (!m || typeof m !== 'object') return ['mission: { kind, goals: [ids], ... }'];
  if (!MISSION_KINDS.includes(m.kind)) say(`kind one of ${MISSION_KINDS.join(' | ')}`);
  if (!Array.isArray(m.goals) || !m.goals.length || !m.goals.every((id) => ids.includes(id))) say(`goals: the ids of the goals it lights (${ids.join(' ')})`);
  const own = Array.isArray(m.goals) ? m.goals : [];
  const rest = (goals || []).filter((g) => !own.includes(g.id) && !(m.kind === 'rescue' && g.id === m.final));          // (the Heartbloom of a rescue is the mission's too)
  for (const g of rest) if (!g.trial) say(`goal '${g.id}' is neither the mission's nor sealed by a trial: nothing would ever light it (every goal of a world with a mission is out of the flame's reach)`);
  if (m.kind === 'rescue') {
    if (!ids.includes(m.final)) say(`rescue: final, the id of the goal the sprites are led to (${ids.join(' ')})`);
    else if (own.includes(m.final)) say('rescue: the final goal is not one a sprite is freed from (it is not in goals)');
    if (!Number.isInteger(m.need) || m.need < 1 || m.need > own.length) say(`rescue: need, how many sprites must be with him at the final goal (1 to ${own.length})`);
  }
  if (m.kind === 'hunt') {
    if (!Array.isArray(m.brutes) || m.brutes.length < 1 || !m.brutes.every((q) => own.includes(q.goal) && isXZ(q.at))) say('hunt: brutes [{ goal (one of goals), at: [x, z] }]: where the brute that holds each stone stands');
    else if (new Set(m.brutes.map((q) => q.goal)).size !== m.brutes.length || m.brutes.length !== own.length) say('hunt: one brute for each goal of the mission');
  }
  if (m.kind === 'deliver') {
    if (!Array.isArray(m.pearls) || m.pearls.length < 1 || !m.pearls.every((q) => own.includes(q.goal) && isXZ(q.at))) say('deliver: pearls [{ goal (one of goals), at: [x, z] }]: where the pearl for each lens lies');
    else if (new Set(m.pearls.map((q) => q.goal)).size !== m.pearls.length || m.pearls.length !== own.length) say('deliver: one pearl for each goal of the mission');
  }
  if (m.kind === 'chime' && m.reach !== undefined && !(isNum(m.reach) && m.reach >= 0.8 && m.reach <= 3)) say('chime: reach, metres round the bell where a hero in the air rings it (0.8 to 3; 1.7 by default)');
  return out;
}

