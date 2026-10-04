// The Guardian's Court and the fight in it checked headlessly (no server, no browser): the court is built and held to what a fight on it needs (a flat firm floor, one way in, a dais the hero can climb,
// pillars that leave a run at every fist), the numbers of the fight are held to what makes it fair (a warning of at least a second for every hazard, a circle slower than the hero, a ring a jump clears,
// a bolt slower than a run, a window that is long against the flame it asks), the fight is PLAYED - by a player that sees what is on the floor and takes the way nothing hits (tools/lib/duel.mjs), and by
// worse ones - and the things that must not win do not: a hero who stands still, one who never rams, one who never breathes fire. The gate (progress, the Elder's words are in home-check) and the ending's data.
//   node tools/guardian-check.mjs
import { buildHeadless, addRuntimeColliders } from './headless-world.mjs';
import { makeWalkmap } from './walkmap.mjs';
import { COURT, DAIS_TOP, PILLARS, DOOR } from '../src/game/guardian/level.js';
import { GUARDIAN as G } from '../src/game/guardian/brain.js';
import { duel, policy, HERO, courtGround } from './lib/duel.mjs';
import { SPEECH, creditsLines, lineHeight } from '../src/game/ending.js';
import { allRestored, loadProgress } from '../src/game/progress.js';
import { DOORS } from '../src/game/home/level.js';
import { SLOPE_WALK } from '../src/game/collision.js';
import { measureText } from '../src/engine/textures/font.js';

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };
const f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2);
const hyp = Math.hypot;

const W = buildHeadless('guardian'), { grid, collision, gp, level } = W;
addRuntimeColliders(collision, gp, grid);
console.log('populate ms', Math.round(W.ms), `gems ${gp.gems.length} (total ${gp.gemsTotal})`, 'colliders', W.kit.colliders.length);

// ---- the court -------------------------------------------------------------------------------------------------------------------------------
{
  const B = gp.boss;
  check('the Court is a world of its own that has the Guardian in it (gp.boss), the door home (courtgate) and nothing else to find: no goals, no Snuffers, no vases, no chests, no walls', !!B && gp.beacons.length === 0 && gp.enemies.length === 0 && gp.vases.length === 0 && gp.chests.length === 0 && gp.walls.length === 0 && gp.portals.length === 1 && gp.portals[0].id === 'courtgate' && gp.portals[0].target === 'home' && gp.portals[0].state === 'open', `(${gp.portals.map((p) => p.id).join()}, beacons ${gp.beacons.length}, enemies ${gp.enemies.length})`);
  check('the hero begins on the gorge road 11 m in front of the door, looking north (up the road) towards the court', Math.abs(gp.spawn.x - DOOR.x) < 0.5 && Math.abs(gp.spawn.z - (DOOR.z - 11)) < 0.5 && Math.abs(Math.abs(gp.spawn.yaw) - Math.PI) < 1e-6, `(${f1(gp.spawn.x)}, ${f1(gp.spawn.z)}, yaw ${f2(gp.spawn.yaw)})`);
  // the floor: flat to the eye of the controller everywhere the fight is
  let lo = Infinity, hi = -Infinity, steep = 0, n = 0;
  const nrm = [0, 1, 0];
  for (let r = 0; r <= COURT.r - 1; r += 1.5) for (let a = 0; a < Math.PI * 2; a += 0.12) {
    const x = COURT.x + Math.cos(a) * r, z = COURT.z + Math.sin(a) * r;
    if (r < COURT.dais.r + COURT.dais.edge + 3) continue;                                  // (the dais's skirt belongs to the dais: the grid's cells reach a cell beyond its foot)
    if (r > COURT.r - 3) continue;                                                           // (and the rim of the court is the foot of the cliff)
    const y = grid.heightAt(x, z); lo = Math.min(lo, y); hi = Math.max(hi, y); n++;
    grid.normalAt(x, z, nrm); if (nrm[1] < 0.995) steep++;
  }
  check('the floor of the court is flat and level (a hero who runs circles and jumps rings trusts the ground): within 8 cm over the whole of it (it sinks 6 cm over the last 8 m to the rim), no slope', hi - lo < 0.08 && steep === 0 && Math.abs(lo - COURT.floor) < 0.1, `(${f2(lo)}..${f2(hi)} over ${n} points, floor ${COURT.floor})`);
  let top = Infinity, walkable = 0, m = 0;
  for (let a = 0; a < Math.PI * 2; a += 0.15) for (let r = COURT.dais.r; r <= COURT.dais.r + COURT.dais.edge; r += 0.3) {
    grid.normalAt(COURT.x + Math.cos(a) * r, COURT.z + Math.sin(a) * r, nrm); m++; if (nrm[1] > SLOPE_WALK + 0.05) walkable++;
  }
  top = grid.heightAt(COURT.x + 3, COURT.z + 3);
  check('the dais is 1.4 m over the floor with a flank the hero can walk up everywhere (the crown is reached from it)', Math.abs(top - DAIS_TOP) < 0.02 && walkable === m, `(top ${f2(top)}, ${walkable}/${m} flank points walkable)`);
  // one way in
  const { flood } = makeWalkmap({ grid, collision });
  const w = flood([gp.spawn.x, gp.spawn.z]);
  let leaks = [];
  for (let a = 0; a < 360; a += 3) {
    const rad = (a * Math.PI) / 180;
    for (const r of [COURT.r + 4, COURT.r + 7, COURT.r + 11, COURT.r + 16, COURT.r + 24]) {
      const x = COURT.x + Math.cos(rad) * r, z = COURT.z + Math.sin(rad) * r;
      if (Math.abs(x - DOOR.x) < 14 && z > COURT.z + COURT.r - 10) continue;                  // (the mouth and the road: a ledge of ground at the foot of the cliff reaches 2 m beyond the rim)
      if (w.distNear(x, z, 1.4) < Infinity) leaks.push(`${f1(x)},${f1(z)}`);
    }
  }
  for (let x = -60; x <= 60; x += 3) for (let z = COURT.z - 60; z <= DOOR.z + 6; z += 3) if (Math.abs(x) > 14 && hyp(x - COURT.x, z - COURT.z) > COURT.r + 4 && w.distNear(x, z, 1.4) < Infinity) leaks.push(`${x},${z}`);       // (and nowhere beside the road)
  check('the court has one way in: the walkable ground does not reach beyond its rim of rock anywhere but at the road', leaks.length === 0, leaks.slice(0, 6).join(' '));
  check('the road is walkable from the door to the court, and the court from end to end, and the dais\'s top', w.distNear(0, 20, 1.6) < Infinity && w.distNear(COURT.x - 30, COURT.z, 1.6) < Infinity && w.distNear(COURT.x, COURT.z - 30, 1.6) < Infinity && w.distNear(COURT.x, COURT.z + 7.5, 2.4, DAIS_TOP) < Infinity, `(the dais ${f1(w.distNear(COURT.x, COURT.z + 7.5, 2.4, DAIS_TOP))} m of walking from the door)`);
  const dist = w.distNear(COURT.x, COURT.z + COURT.r - 3, 2.4);
  check('the way from the door to the court is a walk of eighty metres and more (the gorge: statues, torches, the first sight of him from the crest)', dist > 80 && dist < 130, `(${f1(dist)} m to the mouth)`);
  // the pillars: eight, in a ring, standing clear of each other and the way in
  check('eight pillars stand round the court at 24 m, 45 degrees apart, none on the way in (the road is 12 m from the nearest)', PILLARS.length === 8 && PILLARS.every((p) => Math.abs(hyp(p.x - COURT.x, p.z - COURT.z) - COURT.pillars.ring) < 0.01) && Math.min(...PILLARS.map((p) => hyp(p.x - 0, p.z - (COURT.z + COURT.r)))) > 10, `(nearest to the mouth ${f1(Math.min(...PILLARS.map((p) => hyp(p.x, p.z - (COURT.z + COURT.r)))))} m)`);
  check('each of them is a solid in the world (a bolt bursts on it, the hero cannot walk through it)', PILLARS.every((p) => !!collision.blocking(p.x, DAIS_TOP + 1, p.z, 0.1) || !!collision.blocking(p.x, COURT.floor + 2, p.z, 0.1)) && !!collision.blocking(COURT.x, DAIS_TOP + 3, COURT.z, 0.1), '');
  // the run at a fist: from wherever it may land there are free ways to charge at it
  const walls = [{ x: COURT.x, z: COURT.z, r: gp.boss.bodyR + HERO.r }, ...PILLARS.map((p) => ({ x: p.x, z: p.z, r: p.r + 0.25 + HERO.r }))];
  const clear = (x0, z0, x1, z1) => walls.every((c) => { const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((c.x - x0) * dx + (c.z - z0) * dz) / l2)); return hyp(x0 + dx * t - c.x, z0 + dz * t - c.z) > c.r; });
  let worst = 24, worstAt = '';
  for (let r = 6; r <= COURT.r - 3; r += 1.1) for (let a = 0; a < Math.PI * 2; a += 0.08) {
    const x = COURT.x + Math.cos(a) * r, z = COURT.z + Math.sin(a) * r;
    if (walls.some((c) => hyp(x - c.x, z - c.z) < c.r + 1.7)) continue;
    let free = 0;
    for (let k = 0; k < 24; k++) { const b = (k / 24) * Math.PI * 2, sx = x + Math.cos(b) * 9, sz = z + Math.sin(b) * 9; if (hyp(sx - COURT.x, sz - COURT.z) < COURT.r - 1 && clear(sx, sz, x, z)) free++; }
    if (free < worst) { worst = free; worstAt = `${f1(x)},${f1(z)}`; }
  }
  check('wherever a fist may land, the hero can charge at it from at least 8 of 24 directions over a 9 m run (no pillar, no body in the way)', worst >= 8, `(the worst place has ${worst} free runs: ${worstAt})`);
  // the helpers' places and the hero's checkpoint
  const mouth = [COURT.x, COURT.z + COURT.r - 3];
  const helperSpots = B.helpers.flat();
  check('the helpers come out of the floor between the pillars, 12 m or more from the mouth of the court (where a hero set back stands) and a Snuffer-height of firm floor; two in the second phase, three in the third (a plain, a bell, a thorn)',
    B.helpers[0].length === 0 && B.helpers[1].length === 2 && B.helpers[2].length === 3 && helperSpots.every((s) => hyp(s.x - mouth[0], s.z - mouth[1]) > 12 && Math.abs(s.y - COURT.floor) < 0.12 && PILLARS.every((p) => hyp(s.x - p.x, s.z - p.z) > 4)) && B.helpers[2].map((s) => s.variant).sort().join() === 'basic,bell,thorn', `(nearest ${f1(Math.min(...helperSpots.map((s) => hyp(s.x - mouth[0], s.z - mouth[1]))))} m from the mouth)`);
  check('the checkpoint (the mouth of the court) is a floor in front of the Guardian that nothing hurts', Math.abs(grid.heightAt(mouth[0], mouth[1]) - COURT.floor) < 0.12 && hyp(mouth[0] - COURT.x, mouth[1] - COURT.z) < B.arenaR && hyp(mouth[0] - COURT.x, mouth[1] - COURT.z) > G.slam.r + 20, '');
  check('the treasure: a trail of gems down the gorge road (150 in value, in all), nothing in the court (the fight is not for gems)', gp.gemsTotal >= 150 && gp.gems.length >= 90 && gp.gems.every((q) => hyp(q.x - COURT.x, q.z - COURT.z) > COURT.r) && gp.gemsTotal % 50 === 0, `(${gp.gems.length} gems, total ${gp.gemsTotal})`);
}

// ---- the numbers of the fight -------------------------------------------------------------------------------------------------------------------
{
  const F = G.fist, S = G.slam, Bt = G.bolt, Gl = G.gloom, St = G.stoop;
  const jumpH = (HERO.jumpV ** 2) / (2 * HERO.gravity), air = (2 * HERO.jumpV) / HERO.gravity;
  const highFrom = (h) => { const d = Math.sqrt(HERO.jumpV ** 2 - 2 * HERO.gravity * h); return [(HERO.jumpV - d) / HERO.gravity, (HERO.jumpV + d) / HERO.gravity]; };
  check('a slam is shown for at least two seconds before it can hurt (the fist rises, follows, locks, drops), and the circle is red for the last 0.75 s', F.riseT + F.aimT + F.lockT + F.dropT >= 2.0 && F.lockT + F.dropT >= 0.75, `(${f2(F.riseT + F.aimT + F.lockT + F.dropT)} s from the first sign, ${f2(F.lockT + F.dropT)} s locked)`);
  check('the circle follows the hero more slowly than he runs, in every phase (8, 9 and 10 against 11.5 m/s: a hero who keeps moving is never under it, one who stops for a breath is), and its radius is a stride and a half of the run (4.2 m)', F.follow.every((v, i) => v <= HERO.run - 1.4 && (i === 0 || v >= F.follow[i - 1])) && S.r <= 4.6, `(${F.follow.join('/')} against ${HERO.run})`);
  const [t0, t1] = highFrom(S.waveH), cross = (S.waveW + 2 * HERO.r) / S.waveSpeed;
  check('the ring that runs from a slam is low (0.8 m) and a jump clears it: his jump is 2.9 m and is above 0.8 m for 0.65 s, the ring crosses him in 0.2 s', S.waveH <= 0.9 && jumpH > 2.5 && t1 - t0 > 0.55 && cross < 0.3, `(jump ${f2(jumpH)} m, ${f2(t1 - t0)} s above ${S.waveH}; crosses in ${f2(cross)} s)`);
  check('...and he has time to see it and jump: it runs at 11 m/s and the hero\'s jump window to meet it is 4 m wide', S.waveSpeed <= 12 && (t1 - 0.1) * S.waveSpeed - (S.waveW / 2 + HERO.r) > 3.5 && t0 * S.waveSpeed + (S.waveW / 2 + HERO.r) < 2.5, `(a jump pressed while the ring is between ${f1(t0 * S.waveSpeed + S.waveW / 2 + HERO.r)} and ${f1((t1 - 0.1) * S.waveSpeed - S.waveW / 2 - HERO.r)} m away clears it)`);
  check('a fist that has landed stays for long enough to be rammed from a dozen metres off (3.3 s and more in every phase: it takes him a turn and half a second at 24 m/s)', F.stuckT.every((v) => v >= 3.3 && 14 / HERO.charge + 1.2 < v), `(${F.stuckT.join('/')} s)`);
  check('the rune bolt is slower than a run (11 against 11.5 m/s), shown for 1.2 s (the visor glows) before it flies, and rare (one every 4.5 s at most)', Bt.speed < HERO.run && Bt.chargeT >= 1.0 && Bt.every[1] >= 4.4 && Bt.every[2] >= 5, `(${Bt.speed} m/s, ${Bt.chargeT} s of charge, every ${Bt.every.join('/')} s)`);
  const reach = HERO.run * Gl.warnT * 0.85;
  check('a circle of gloom is red for 1.4 s before it bursts, and the whole pattern (five circles within 8 m + 3.2) can be left within that time at a run', Gl.warnT >= 1.3 && Gl.spread + Gl.r <= reach, `(the pattern reaches ${f1(Gl.spread + Gl.r)} m, he runs ${f1(reach)} m in the time)`);
  check('the window of the stoop is nine seconds against 1.4 s of flame that adds up (a window six times as long as the work), and the crown is within the flame\'s reach from the top of the dais', St.window >= St.need * 5 && DAIS_TOP + 0.6 + G.lantern.dy > DAIS_TOP + G.crownDown && G.lantern.ringDown - 4.6 < 2 * 1.9 + 2, `(window ${St.window} s, need ${St.need} s; the lanterns hang ${f1(G.lantern.ringDown - 4.6)} m off his body)`);
  check('the Guardian takes three lanterns, a phase each, and the fists come back only as often as the hero fails the window (the phase begins again)', G.hits === 3 && St.need < St.window, '');
}

// ---- the fight, played --------------------------------------------------------------------------------------------------------------------------
const play = (opts = {}, d = {}) => duel({ court: COURT, pillars: PILLARS, pol: (s, m) => policy(s, m, opts), maxTime: 420, ...d });
{
  const runs = [1, 2, 3, 4, 5, 6].map((seed) => play({}, { seed }));
  const all = runs.every((r) => r.won);
  check('a player who sees what is on the floor and takes the way nothing hits wins every fight, in under three minutes, without a hit that matters', all && runs.every((r) => r.time < 180 && r.hits <= 3 && r.deaths === 0), `(${runs.map((r) => `${r.time.toFixed(0)}s/${r.hits}h`).join(' ')})`);
  check('... and every fight is the same shape: six slams, six fists rammed, three lanterns, no window lost', runs.every((r) => r.slams === 6 && r.cracks === 6 && r.lit === 3 && r.windowsLost === 0), `(${runs[0].slams} slams, ${runs[0].cracks} cracks, ${runs[0].lit} lit)`);
  const slow = [1, 2, 3].map((seed) => play({ margin: 0.0 }, { seed, latency: 18, every: 9 }));
  check('a player who reacts a third of a second late and cuts every margin to nothing still wins, with a few hits and no more than one death', slow.every((r) => r.won && r.deaths <= 1 && r.hits <= 9), `(${slow.map((r) => `${r.time.toFixed(0)}s/${r.hits}h/${r.deaths}d`).join(' ')})`);
  const distracted = [1, 2, 3, 4].map((seed) => play({ margin: 0.3 }, { seed, latency: 12, every: 6, lapse: { every: 4, dur: 1.0 }, wobble: 0.6 }));
  check('a player who looks away for a second every four, whose stick wobbles and who sees the floor a fifth of a second late is hit now and then and is not shut out: he wins them all, with two deaths at the most', distracted.every((r) => r.won && r.deaths <= 2 && r.time < 300), `(${distracted.map((r) => `${r.time.toFixed(0)}s/${r.hits}h/${r.deaths}d`).join(' ')})`);
  const reckless = [1, 2, 3].map((seed) => play({ dodge: false }, { seed, maxTime: 300 }));
  check('the rings have teeth: a player who only keeps moving, taking no notice of the floor (no sidestep, no jump), is not caught by a fist (they follow slower than he runs) but every ring that reaches him on the ground hurts him', reckless.every((r) => (r.byWhat.wave || 0) >= 3), `(${reckless.map((r) => `${r.hits} hits ${JSON.stringify(r.byWhat)}${r.won ? ' won' : ''}`).join('; ')})`);
  const idle = play({ idle: true }, { seed: 1, maxTime: 90, spot: { x: COURT.x, z: COURT.z + COURT.r - 3, yaw: Math.PI } });
  check('a hero who stands still in the court is hit and set back, again and again, and the Guardian is not beaten', !idle.won && idle.deaths >= 2 && idle.cracks === 0 && idle.lit === 0, `(${idle.deaths} deaths in ${idle.time.toFixed(0)} s)`);
  const norom = play({ ram: false }, { seed: 1, maxTime: 240 });
  check('a hero who never rams cannot go on: the fists land and land (a hundred slams) and nothing breaks, the Guardian never stoops', !norom.won && norom.cracks === 0 && norom.lit === 0 && norom.slams > 60, `(${norom.slams} slams, ${norom.cracks} fists broken)`);
  const noflame = play({ flame: false }, { seed: 1, maxTime: 240 });
  check('a hero who never breathes fire cannot win: the fists break, the crown comes down, the window closes, and again; no lantern lights', !noflame.won && noflame.cracks > 10 && noflame.lit === 0 && noflame.windowsLost >= 8, `(${noflame.cracks} fists broken, ${noflame.windowsLost} windows lost, ${noflame.lit} lit)`);
  const again = play({}, { seed: 1 });
  check('the same fight played twice is the same fight (the brain is deterministic: its own random numbers, the hero\'s moves)', again.time === runs[0].time && again.hits === runs[0].hits && again.slams === runs[0].slams);
  // the ground the duel uses is the Court's
  const ground = courtGround(COURT);
  check('the duel\'s ground is the Court\'s: the floor at 4, the dais at 5.4, the same as the heightfield', Math.abs(ground(COURT.x + 30, COURT.z) - grid.heightAt(COURT.x + 30, COURT.z)) < 0.03 && Math.abs(ground(COURT.x, COURT.z + 5) - grid.heightAt(COURT.x, COURT.z + 5)) < 0.03 && Math.abs(ground(COURT.x + 11.2, COURT.z) - grid.heightAt(COURT.x + 11.2, COURT.z)) < 0.25, `(${f2(ground(COURT.x + 11.2, COURT.z))} against ${f2(grid.heightAt(COURT.x + 11.2, COURT.z))} on the flank)`);
}

// ---- the gate, the ending -----------------------------------------------------------------------------------------------------------------------
{
  const doors = DOORS.filter((d) => d.target).map((d) => d.target), done = (ids) => Object.fromEntries(ids.map((i) => [i, { done: true }]));
  check('the gate is for every realm that has a door and for all of them: open at five of five, shut at four, shut at none', allRestored({ realms: done(doors) }, doors) && !allRestored({ realms: done(doors.slice(1)) }, doors) && !allRestored({ realms: {} }, doors) && !allRestored({ realms: done(doors) }, []), `(${doors.join()})`);
  const fresh = loadProgress();
  check('a new hero\'s progress has the gate shut and the Guardian not free (and keeps the old fields)', fresh.home.gate === false && fresh.guardian.freed === false && Array.isArray(fresh.home.secrets) && typeof fresh.realms === 'object');
  check('the Guardian speaks in four pages that fit the dialogue box (under 190 letters), in capitals', SPEECH.length === 4 && SPEECH.every((p) => p.length < 190 && p === p.toUpperCase()), `(${SPEECH.map((p) => p.length).join('/')} letters)`);
  const lines = creditsLines(DOORS.filter((d) => d.target).map((d) => d.name).concat(['THE GUARDIAN\'S COURT'])), total = lines.reduce((n, l) => n + lineHeight(l), 0);
  const widest = Math.max(...lines.filter((l) => l.text).map((l) => measureText(l.text, l.kind === 'title' ? { style: 'grad', scale: 1 } : { style: 'outline' }).w));
  check('the credits are capitals and punctuation the font has, every line fits the 320 px of the narrowest screen, the scroll is a minute at most (21 px/s)', lines.every((l) => /^[A-Z0-9 .,'!:?-]*$/.test(l.text)) && widest <= 316 && (total + 240) / 21 < 60, `(${lines.length} lines, the widest ${widest} px, ${((total + 240) / 21).toFixed(0)} s)`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall Guardian checks passed');
process.exitCode = failed ? 1 : 0;
