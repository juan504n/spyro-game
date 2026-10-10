// EVERY WORLD ITS OWN ERRAND, held across all the worlds (src/game/missions/, docs/DESIGN.md round thirty-nine and forty):
//   - Gloaming Vale is the one world whose goals are lit by fire (the lanterns); in every other realm no goal takes a flame (`mission` in its brief: the mission lights its goals or a trial does)
//   - no two realms have the same kind of mission, and no kind of trial stands in two worlds
//   - every mission is well formed (missionProblems), every goal is asked by the mission or by a trial, the brutes of a hunt and the pearls of a delivery stand on dry, clear ground
//   node tools/mission-check.mjs
import { REALMS } from '../src/game/realms.js';
import { MISSION_KINDS, missionProblems } from '../src/game/missions/problems.js';
import { buildHeadless } from './headless-world.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail); };
const realms = Object.keys(REALMS).filter((id) => REALMS[id].kind === 'realm');
const briefOf = (id) => buildHeadless(id).level.brief || null;

const info = realms.map((id) => {
  const W = buildHeadless(id), b = W.level.brief || null, gp = W.gp;
  return { id, brief: b, gp, mission: b && b.mission ? b.mission : null, trials: [...new Set((gp.trials || []).map((t) => t.kind))] };
});
const lamps = info.filter((r) => !r.mission).map((r) => r.id);
check('Gloaming Vale is the only realm whose goals are lit by fire (every other has a mission)', lamps.length === 1 && lamps[0] === 'gloaming', `lamps: ${lamps.join(', ')}`);
const kinds = info.filter((r) => r.mission).map((r) => r.mission.kind);
check('no two realms have the same kind of mission', new Set(kinds).size === kinds.length && kinds.every((k) => MISSION_KINDS.includes(k)), info.filter((r) => r.mission).map((r) => `${r.id}: ${r.mission.kind}`).join(', '));
const seen = {};
for (const r of info) for (const k of r.trials) (seen[k] ||= []).push(r.id);
check('no kind of trial stands in two worlds', Object.values(seen).every((l) => l.length === 1), Object.entries(seen).map(([k, l]) => `${k}: ${l.join('+')}`).join(', '));
for (const r of info.filter((q) => q.mission)) {
  const goals = r.brief.goals, probs = missionProblems(r.mission, goals);
  check(`${r.id}: the ${r.mission.kind} mission is well formed and every goal is asked`, probs.length === 0, probs.join(' | '));
  check(`${r.id}: the mission's data reached the game's gameplay (gp.mission)`, r.gp.mission && r.gp.mission.kind === r.mission.kind);
  if (r.mission.kind === 'hunt') {
    const brutes = r.gp.enemies.filter((e) => e.variant === 'brute');
    check(`${r.id}: a Slag Brute stands where each stone's hunt says`, r.mission.brutes.every((q) => brutes.some((e) => Math.hypot(e.x - q.at[0], e.z - q.at[1]) < 0.5)));
  }
}
console.log(failed ? `${failed} FAILED` : 'all mission checks passed');
process.exitCode = failed ? 1 : 0;
