// EVERY WORLD ITS OWN TASK, held across all the worlds (src/game/objectives/, docs/DESIGN.md round forty-one):
//   - Gloaming Vale is the one world whose task is the lanterns (breathe fire on five of them); every other realm has an objective of a kind of its own and no row of things to go to
//   - no two realms have the same kind of objective, and no kind of trial stands in two worlds
//   - every objective is well formed (objectiveProblems), the task stands on ground it can be played on (the route ends at the exit, the Colossus' caldera holds the Heartforge, the crabs start on dry
//     ground and the pen is on the headland), and the goals that are not the exit are stations, never drawn as lanterns
//   node tools/objective-check.mjs
import { REALMS } from '../src/game/realms.js';
import { OBJECTIVE_KINDS, objectiveProblems } from '../src/game/objectives/problems.js';
import { buildHeadless } from './headless-world.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail); };
const realms = Object.keys(REALMS).filter((id) => REALMS[id].kind === 'realm');

const info = realms.map((id) => {
  const W = buildHeadless(id), b = W.level.brief || null, gp = W.gp;
  return { id, W, brief: b, gp, objective: b && b.objective ? b.objective : null, trials: [...new Set((gp.trials || []).map((t) => t.kind))] };
});
const lamps = info.filter((r) => !r.objective).map((r) => r.id);
check('Gloaming Vale is the only realm whose task is the lanterns (every other has an objective)', lamps.length === 1 && lamps[0] === 'gloaming', `lamps: ${lamps.join(', ')}`);
const kinds = info.filter((r) => r.objective).map((r) => r.objective.kind);
check('no two realms have the same kind of objective', new Set(kinds).size === kinds.length && kinds.every((k) => OBJECTIVE_KINDS.includes(k)), info.filter((r) => r.objective).map((r) => `${r.id}: ${r.objective.kind}`).join(', '));
const seen = {};
for (const r of info) for (const k of r.trials) (seen[k] ||= []).push(r.id);
check('no kind of trial stands in two worlds', Object.values(seen).every((l) => l.length === 1), Object.entries(seen).map(([k, l]) => `${k}: ${l.join('+')}`).join(', '));

for (const r of info.filter((q) => q.objective)) {
  const o = r.objective, goals = r.brief.goals, gp = r.gp, W = r.W, h = (x, z) => W.grid.heightAt(x, z);
  const probs = objectiveProblems(o, goals), fin = gp.beacons.find((b) => b.id === o.final);
  check(`${r.id}: the ${o.kind} objective is well formed`, probs.length === 0, probs.join(' | '));
  check(`${r.id}: its data reached the game's gameplay (gp.objective), and every goal but the exit is a station`, gp.objective && gp.objective.kind === o.kind && gp.beacons.filter((b) => b.station).length === goals.length - 1 && !fin.station);
  check(`${r.id}: no goal of the realm is asked for by a flame: the exit is opened by the task`, goals.length >= 4 && !goals.some((g) => g.id !== o.final && !gp.beacons.find((b) => b.id === g.id).station));
  if (o.kind === 'chase') {
    const end = o.route[o.route.length - 1];
    check(`${r.id}: the sprite's road ends within 25 m of the exit, on dry ground, and every point of it has ground`, Math.hypot(end[0] - fin.x, end[1] - fin.z) < 25 && o.route.every(([x, z]) => h(x, z) > (W.level.waterLevel ?? 0) - 0.5), `(${Math.round(Math.hypot(end[0] - fin.x, end[1] - fin.z))} m)`);
    let worst = 0, at = null;                                                                  // (the sprite runs straight between the points: no step of it climbs a cliff or runs into the sea)
    for (let i = 1; i < o.route.length; i++) {
      const [x0, z0] = o.route[i - 1], [x1, z1] = o.route[i], d = Math.hypot(x1 - x0, z1 - z0);
      let prev = h(x0, z0);
      for (let u = 2; u <= d; u += 2) { const x = x0 + (x1 - x0) * u / d, z = z0 + (z1 - z0) * u / d, y = h(x, z); if (Math.abs(y - prev) > worst) { worst = Math.abs(y - prev); at = [x, z]; } prev = y; }
    }
    check(`${r.id}: the sprite's road never climbs more than 2.2 m in 2 m (it runs where a hero can)`, worst <= 2.2, `(steepest ${worst.toFixed(1)} m in 2 m${at ? ` at ${at.map(Math.round).join(',')}` : ''})`);
  }
  if (o.kind === 'duel') {
    check(`${r.id}: the Heartforge stands in the Colossus' caldera`, Math.hypot(o.arena[0] - fin.x, o.arena[1] - fin.z) <= o.arenaR, `(${Math.round(Math.hypot(o.arena[0] - fin.x, o.arena[1] - fin.z))} m from the middle of ${o.arenaR})`);
    const rim = []; for (let a = 0; a < 16; a++) rim.push(h(o.arena[0] + Math.cos(a * Math.PI / 8) * (o.arenaR + 3), o.arena[1] + Math.sin(a * Math.PI / 8) * (o.arenaR + 3)));
    const floor = h(o.arena[0], o.arena[1]);
    check(`${r.id}: the floor of the caldera is level enough to fight on (within 2.5 m over the ground the Colossus walks)`, [0, 5, 10, 15].every((d) => [0, 1, 2, 3, 4, 5, 6, 7].every((a) => Math.abs(h(o.arena[0] + Math.cos(a * Math.PI / 4) * d, o.arena[1] + Math.sin(a * Math.PI / 4) * d) - floor) < 2.5)), `(floor ${floor.toFixed(1)} m)`);
    const guards = gp.enemies.filter((e) => e.variant === 'brute');
    check(`${r.id}: a Slag Brute stands where each guard of the brief says`, (o.guards || []).every((q) => guards.some((e) => Math.hypot(e.x - q[0], e.z - q[1]) < 0.5)));
  }
  if (o.kind === 'storm') {
    const end = o.route[o.route.length - 1];
    check(`${r.id}: the storm's route ends within the finish radius of the exit`, Math.hypot(end[0] - fin.x, end[1] - fin.z) < (o.finishR ?? 14) - 3, `(${Math.round(Math.hypot(end[0] - fin.x, end[1] - fin.z))} m)`);
    let len = 0; for (let i = 1; i < o.route.length; i++) len += Math.hypot(o.route[i][0] - o.route[i - 1][0], o.route[i][1] - o.route[i - 1][1]);
    const lastRefuge = Math.max(...(o.refuges || [0]));
    check(`${r.id}: the route is long enough to be a race (300 m or more) and a refuge stands in its last quarter`, len >= 300 && lastRefuge >= o.route.length * 0.6, `(${Math.round(len)} m, ${(o.refuges || []).length} refuges)`);
  }
  if (o.kind === 'herd') {
    const dry = (x, z) => h(x, z) > (W.level.waterHi ?? 1.4) + 1;
    check(`${r.id}: the crabs start on high dry ground, 4 m apart at least, and the pen is on the headland beside the exit`, o.crabs.every(([x, z], i) => dry(x, z) && o.crabs.every(([x2, z2], j) => j <= i || Math.hypot(x - x2, z - z2) > 4)) && dry(o.pen[0], o.pen[1]) && Math.hypot(o.pen[0] - fin.x, o.pen[1] - fin.z) < 40, `(pen ${Math.round(Math.hypot(o.pen[0] - fin.x, o.pen[1] - fin.z))} m from the exit)`);
    check(`${r.id}: the Sea Gate opens on a trial that is there (gateAfter)`, !o.gateAfter || (gp.trials || []).some((t) => t.id === o.gateAfter), `(${o.gateAfter || 'none'})`);
  }
}
console.log(failed ? `${failed} FAILED` : 'all objective checks passed');
process.exitCode = failed ? 1 : 0;
