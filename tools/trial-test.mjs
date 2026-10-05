// The trials' machines (src/game/trials/) held to what their design says, headlessly: no server, no browser. Each is played at 60 Hz against a model of the hero (tools/lib/trialsim.mjs: the Player's
// numbers) by a hero who plays it right, one who plays it wrong and one who stands still.
//   node tools/trial-test.mjs
//
//   the table     every kind has its row (a name, a hint, what it asks) and its machine (init, step, hud, targets)
//   the play      the right play solves every kind, from any seed; standing still solves none; the wrong play is told so
//   the numbers   what a person can do: a tune is rung in under 6 s and is 3 to 6 long, a clock is made for 60% of a run, a scramble can be undone in the presses it was made with...
import { playTrial } from './lib/trialsim.mjs';
import { PLAYS, SPECS, judge, plays, shift } from './lib/trial-plays.mjs';
import { MACHINES, TRIALS, TRIAL_IDS, BELLS, PLATES, CIRCUIT, WISPS, PUCK, MIRRORS, timeFor, pressed, solveBoard, trace, solveMirrors, reflect, lcg } from '../src/game/trials/index.js';
import { makeTrial } from '../src/game/trials/index.js';

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail === undefined ? '' : detail); };
const hyp = Math.hypot;
const f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2);
const SEEDS = [1, 2, 3, 4, 5, 6];

// ---- the table -------------------------------------------------------------------------------------------------------------------------------------
{
  check('there are eight kinds, each with a machine (init, step, hud, targets) and a row in the table', TRIAL_IDS.length === 8 && TRIAL_IDS.every((k) => MACHINES[k] && ['init', 'step', 'hud', 'targets'].every((f) => typeof MACHINES[k][f] === 'function') && TRIALS[k]), TRIAL_IDS.join(' '));
  check('every kind says what it asks in UPPER CASE words the HUD can show (a hint of at least 25 letters), and what its failing costs', TRIAL_IDS.every((k) => /^[A-Z0-9 ,.:;'!?-]{25,}$/.test(TRIALS[k].hint) && TRIALS[k].name === TRIALS[k].name.toUpperCase() && TRIALS[k].fails && TRIALS[k].reads && TRIALS[k].verbs.length));
  check('no kind takes a life: failing a trial costs a try (a wrong bell, a clock that ran out, wisps that got away)', TRIAL_IDS.every((k) => !/life|die|death|hurt/i.test(TRIALS[k].fails)));
}

// ---- the play --------------------------------------------------------------------------------------------------------------------------------------
const outcome = (r) => ({ solved: r.solvedAt !== null, fails: r.events.filter((e) => e.type === 'fail').length, misses: r.events.filter((e) => e.type === 'miss').length, t: r.solvedAt });
{
  for (const pl of PLAYS) {
    const seeds = pl.seeds || SEEDS;
    const outs = seeds.map((seed) => outcome(playTrial({ spec: pl.spec, hero: pl.hero, policy: pl.policy(), T: pl.T, seed })));
    const fails = outs.map((o) => judge(pl.want, o)).filter(Boolean);
    const times = outs.filter((o) => o.solved).map((o) => o.t);
    check(pl.say, fails.length === 0, `(${outs.length - fails.length}/${outs.length} runs as wanted${times.length ? `, solved in ${f1(Math.min(...times))} to ${f1(Math.max(...times))} s` : ''}${fails.length ? ': ' + fails[0] : ''})`);
  }
}

// ---- the parts, one step at a time ----------------------------------------------------------------------------------------------------------------
// (a hero of stubs: where the test puts him, what his flame and his ram reach)
const hero = (o = {}) => ({ x: 0, y: 0, z: 0, yaw: 0, dirx: 0, dirz: 1, grounded: true, flameT: 0, chargeT: 0, dead: false, flameHits: () => false, chargeHits: () => false, ...o });
const ctxOf = (p, seed = 1) => { const events = []; return { p, rng: lcg(seed), emit: (type, d) => events.push({ type, ...d, by: undefined }), events, spawn: () => ({}), fate: () => 'alive', dismiss() {} }; };
const make = (spec, seed = 1) => { const c = ctxOf(hero(), seed); const t = makeTrial(spec, c); return [t, c]; };
const steps = (t, c, secs, each) => { const M = MACHINES[t.kind]; for (let i = 0; i < Math.round(secs * 60); i++) { if (each) each(i / 60); M.step(t, 1 / 60, c); } };
const bellsAt = (cx, cz, r, n) => Array.from({ length: n }, (_, i) => { const a = -1 + (2 * i) / (n - 1); return { x: cx + Math.sin(a) * r, z: cz + Math.cos(a) * r }; });

{
  // bells: the tune
  const lens = [], repeats = [];
  for (let seed = 1; seed <= 200; seed++) for (const n of [4, 5, 6]) {
    const [t] = make({ kind: 'bells', id: 'b', goal: 'g', x: 0, z: 0, bells: bellsAt(0, 0, 5.8, n), len: 3 + (seed % 4) }, seed);
    lens.push(t.tune.length);
    repeats.push(t.tune.some((v, i) => i > 0 && v === t.tune[i - 1]) || t.tune.some((v) => v < 0 || v >= n));
  }
  check('Bells: a tune is 3 to 6 notes (4 where the layout says nothing) and never the same bell twice running', Math.min(...lens) === 3 && Math.max(...lens) === 6 && !repeats.some(Boolean), `(${lens.length} tunes)`);
  const [t0] = make({ kind: 'bells', id: 'b', goal: 'g', x: 0, z: 0, bells: bellsAt(0, 0, 5.8, 5) }, 1);
  check('Bells: the tune is rung in under 6 s however long it is (6 notes: 5.4 s) and a bell is lit for 0.55 s of the 0.85 s it has', 6 * BELLS.gap + BELLS.tail < 6 && BELLS.glow < BELLS.gap && t0.len === 4);
  // listening: a hero who breathes while the tune is rung is not told he is wrong; one breath is one bell; a held flame is a bell a breath
  {
    const b = bellsAt(0, 0, 5.8, 5);
    const [t, c] = make({ kind: 'bells', id: 'b', goal: 'g', x: 0, z: 0, bells: b }, 3);
    const p = c.p; p.flameHits = (x, y, z) => b.some((q) => Math.abs(q.x - x) < 1e-6 && Math.abs(q.z - z) < 1e-6);                 // (his breath reaches every bell)
    p.yaw = Math.atan2(b[0].x, b[0].z);
    steps(t, c, 1.0, (tt) => { p.flameT = tt < 0.42 ? 0.42 - tt : 0; });                                                           // (a breath while the tune plays)
    check('Bells: a breath while the tune is rung counts for nothing (he is not told he is wrong for it)', t.phase === 'listen' && !c.events.some((e) => e.type === 'miss'));
    steps(t, c, 6, null);
    check('Bells: after the tune it is his turn', t.phase === 'play' && c.events.some((e) => e.type === 'turn' && e.listen === false));
    // one breath reaches all five: the one he faces (the third) is the bell it counts for
    p.yaw = Math.atan2(b[2].x, b[2].z); const want = t.tune[0];
    steps(t, c, 0.5, (tt) => { p.flameT = Math.max(0, 0.42 - tt); });
    const notes = c.events.filter((e) => e.type === 'note' && e.ok !== undefined).length + c.events.filter((e) => e.type === 'miss').length;
    check('Bells: a breath that reaches several bells counts for the one he faces, once', notes === 1 && (want === 2 ? c.events.some((e) => e.type === 'note' && e.ok) : c.events.some((e) => e.type === 'miss' && e.i === 2)), `(${notes} bell for the breath; the tune began with ${want}, he faced 2)`);
  }
  // a wrong bell: the tune again (after the rest), from the beginning; waiting too long does the same
  {
    const b = bellsAt(0, 0, 5.8, 5);
    const [t, c] = make({ kind: 'bells', id: 'b', goal: 'g', x: 0, z: 0, bells: b }, 5);
    const p = c.p; let aim = 0;
    p.flameHits = (x, y, z) => Math.abs(b[aim].x - x) < 1e-6 && Math.abs(b[aim].z - z) < 1e-6;
    steps(t, c, 6.0, null);
    const wrongBell = (t.tune[0] + 1) % 5; aim = wrongBell; p.yaw = Math.atan2(b[aim].x, b[aim].z);
    steps(t, c, 0.5, (tt) => { p.flameT = Math.max(0, 0.42 - tt); });
    const missed = c.events.some((e) => e.type === 'miss' && e.i === wrongBell) && t.phase === 'rest';
    steps(t, c, BELLS.rest + 0.2, null);
    check('Bells: a wrong bell is a miss, and after a rest of 1.1 s the tune is rung again from the first note', missed && t.phase === 'listen' && t.pos === 0);
    steps(t, c, 6.0, null);
    const before = c.events.filter((e) => e.type === 'turn').length;
    steps(t, c, BELLS.replay + 1, null);
    check('Bells: a hero who waits 18 s hears the tune again', c.events.filter((e) => e.type === 'turn').length > before && c.events.some((e) => e.type === 'fail' && e.why === 'idle'));
    // walking away: it is waiting for him again
    const [t2, c2] = make({ kind: 'bells', id: 'b', goal: 'g', x: 0, z: 0, bells: b }, 5);
    steps(t2, c2, 6.5, null); c2.p.x = 60;
    steps(t2, c2, 0.1, null);
    check('Bells: a hero who walks away in the middle of it finds the shrine waiting again', t2.phase === 'wait' && t2.pos === 0);
  }
}

{
  // plates
  let bad = 0, solvedAtStart = 0, par = 0, never = 0;
  for (let seed = 1; seed <= 300; seed++) for (const n of [5, 6]) {
    const [t] = make({ kind: 'plates', id: 'p', goal: 'g', x: 0, z: 0, plates: bellsAt(0, 0, 5.5, n), scramble: 2 + (seed % 3) }, seed);
    if (t.on.every(Boolean)) solvedAtStart++;
    const sol = solveBoard(t.on);
    if (!sol) { never++; continue; }
    let b = t.on.slice(); for (const i of sol.presses) b = pressed(b, i);
    if (!b.every(Boolean) || sol.n !== t.par || t.par < 1 || t.par > Math.min(t.scramble ?? 3, n - 2)) bad++;
    par += t.par;
  }
  check('Plates: a scrambled ring is never already solved, can always be solved, and in no more presses than it was scrambled with (and at least one)', solvedAtStart === 0 && never === 0 && bad === 0, `(600 boards, ${f2(par / 600)} presses to solve on average)`);
  const on = [true, true, true, true, true], q = pressed(on, 0);
  check('Plates: a press turns the plate and the two beside it, and the ring is closed (plate 0 and plate 4 are neighbours)', q.filter((v) => !v).length === 3 && !q[4] && !q[0] && !q[1] && q[2] && q[3]);
  // landing on a plate presses it; standing on it does not; leaving and landing again does; a hero in the air above it does not
  const pl = bellsAt(0, 0, 5.5, 5);
  const [t, c] = make({ kind: 'plates', id: 'p', goal: 'g', x: 0, z: 0, plates: pl, scramble: 2 }, 7);
  const p = c.p; p.x = pl[1].x; p.z = pl[1].z; p.grounded = false; p.y = 2.5;
  steps(t, c, 0.2, null);
  const inAir = c.events.filter((e) => e.type === 'press').length;
  p.grounded = true; p.y = 0; steps(t, c, 0.2, null);
  const landed = c.events.filter((e) => e.type === 'press').length;
  steps(t, c, 1.0, null);
  const stood = c.events.filter((e) => e.type === 'press').length;
  p.x = 0; p.z = 0; steps(t, c, 0.2, null); p.x = pl[1].x; p.z = pl[1].z; steps(t, c, 0.2, null);
  const again = c.events.filter((e) => e.type === 'press').length;
  check('Plates: a hero over a plate in the air presses nothing; landing on it presses it once; standing on it is not another; leaving it and landing again is', inAir === 0 && landed === 1 && stood === 1 && again === 2, `(${inAir}, ${landed}, ${stood}, ${again} presses)`);
}

{
  // circuit
  const len = (ps) => ps.slice(1).reduce((a, q, i) => a + hyp(q.x - ps[i].x, q.z - ps[i].z), 0);
  const ps = SPECS.circuit.pylons;
  const [t] = make(SPECS.circuit, 1);
  check('Circuit: the clock is the way at 60% of a run, and three seconds (at least 14)', t.time === timeFor(len(ps)) && timeFor(10) === 14 && timeFor(200) === Math.ceil(200 / (11.5 * 0.6) + 3), `(a way of ${f1(len(ps))} m gets ${t.time} s)`);
  const slow = playTrial({ spec: SPECS.circuit, hero: { x: 16, z: -6, yaw: 0 }, policy: plays.circuitRun(0.35), T: 60, seed: 1 });
  check('Circuit: at a third of a run it cannot be done (the clock is made for 60%, and three seconds)', slow.solvedAt === null && slow.events.some((e) => e.type === 'fail'));
  // a pylon out of order does not count; the clock starts at the first
  const [t2, c2] = make(SPECS.circuit, 1);
  c2.p.x = ps[3].x; c2.p.z = ps[3].z; steps(t2, c2, 0.5, null);
  const skipped = t2.next === 0 && !t2.running;
  c2.p.x = ps[0].x; c2.p.z = ps[0].z; steps(t2, c2, 0.1, null);
  check('Circuit: a pylon touched out of its turn counts for nothing, and the clock starts at the first', skipped && t2.next === 1 && t2.running && c2.events.some((e) => e.type === 'start'));
  c2.p.y = 5; c2.p.x = ps[1].x; c2.p.z = ps[1].z; steps(t2, c2, 0.1, null);
  const tooHigh = t2.next;
  c2.p.y = 2.5; steps(t2, c2, 0.1, null);
  check('Circuit: a pylon is touched by a hero within 3.2 m above it or below it (a jump or a glide counts, a flight 5 m over it does not)', tooHigh === 1 && t2.next === 2);
  steps(t2, c2, t2.time + 1, null);
  check('Circuit: when the clock runs out the pylons go dark and he begins again at the first', !t2.running && t2.next === 0 && c2.events.some((e) => e.type === 'fail' && e.why === 'time'));
}

{
  // wisps: twelve, eight needed; a hero who burns seven and lets the rest go sees it begin again
  const [t0] = make(SPECS.wisps, 1);
  check('Wisps: twelve come and eight of them must be burnt (four may get away)', t0.want === 8 && t0.total === 12 && WISPS.total - WISPS.want === 4);
  const burn = (n) => { let hits = 0; return (s) => { const t = s.trial; if (t.state !== 'active') return plays.wispsRight(s); if (hits >= n) return { dx: 0, dz: 0, mag: 0 }; const before = t.hits; void before; return plays.wispsRight(s); }; };
  void burn;
  const r = playTrial({ spec: SPECS.wisps, hero: { x: 0, z: 0, yaw: 0 }, policy: (s) => (s.trial.hits >= 7 ? { dx: 0, dz: 0, mag: 0 } : plays.wispsRight(s)), T: 50, seed: 2, stopWhenSolved: false });
  check('Wisps: a hero who burns seven and no more sees the rest get away and the vents begin again', r.solvedAt === null && r.events.some((e) => e.type === 'fail' && e.why === 'escaped') && r.trial.rounds >= 1, `(${r.trial.rounds} rounds)`);
  // the same seed, the same order of vents
  const order = (seed) => playTrial({ spec: SPECS.wisps, hero: { x: 0, z: 0, yaw: 0 }, policy: plays.wispsRight, T: 9, seed, stopWhenSolved: false }).events.filter((e) => e.type === 'spawn').map((e) => e.vent).join('');
  check('Wisps: the vents let go in an order of the seed\'s (the same seed, the same order; no vent twice running)', order(4) === order(4) && order(4) !== order(5) && !/(\d)\1/.test(order(4)), `(${order(4)} / ${order(5)})`);
}

{
  // puck
  check('Puck: the goalie never covers the whole of the goal mouth: what is left of it is 2 m or more', 2 * 2.4 - PUCK.goalie.w >= 2.0, `(a goal mouth of ${2 * 2.4} m, a goalie of ${PUCK.goalie.w} m)`);
  // a ram sends the puck the way he faces at 16 m/s; it slides to a stop; the walls turn it; a goal is counted once
  const [t, c] = make({ kind: 'puck', id: 'pk', goal: 'g', x: 0, z: 0, yaw: 0 }, 1);
  const p = c.p; p.x = 0; p.z = t.pz - 1.5; p.yaw = 0; p.dirx = 0; p.dirz = 1;
  steps(t, c, 0.1, null);                                                                          // (it wakes)
  p.chargeT = 0.2; p.chargeHits = (x, y, z) => hyp(x - p.x, z - p.z) < 2.0;
  steps(t, c, 1 / 60, null);
  p.chargeT = 0;
  const v0 = hyp(t.vx, t.vz);
  steps(t, c, 1.0, null);
  check('Puck: a ram sends it the way he faces at 16 m/s and it slows as it slides', Math.abs(v0 - PUCK.kick) < 0.5 && hyp(t.vx, t.vz) < PUCK.kick * 0.5 && t.pz > -t.hl * 0.2 + 8, `(${f1(v0)} m/s at the start, ${f1(hyp(t.vx, t.vz))} a second later, ${f1(t.pz)} m up the court)`);
  const [t2, c2] = make({ kind: 'puck', id: 'pk', goal: 'g', x: 0, z: 0, yaw: 0 }, 1);
  c2.p.z = -15; steps(t2, c2, 0.1, null);
  t2.px = 5.5; t2.pz = 0; t2.vx = 14; t2.vz = 0; steps(t2, c2, 0.3, null);
  const bounced = t2.vx < 0 && t2.px <= t2.hw - PUCK.r + 1e-6;
  t2.px = 0; t2.pz = 9; t2.vx = 0; t2.vz = 14; t2.phase = Math.PI / 2 / PUCK.goalie.speed;           // (the goalie is at the far side of the mouth when he is sent straight up the middle: phase makes sin = 1... checked below)
  steps(t2, c2, 1.0, null);
  check('Puck: the side walls turn it back, and it is never outside the court', bounced && Math.abs(t2.px) <= t2.hw && Math.abs(t2.pz) <= t2.hl);
  // a goal, once; and the goalie saves what is shot straight at him
  const [t3, c3] = make({ kind: 'puck', id: 'pk', goal: 'g', x: 0, z: 0, yaw: 0 }, 1);
  c3.p.z = -15; steps(t3, c3, 0.1, null);
  t3.phase = 0; t3.t = 0; t3.px = 0; t3.pz = 6; t3.vx = 0; t3.vz = 15;
  steps(t3, c3, 1.0, null);
  const saved = c3.events.some((e) => e.type === 'save') && t3.score === 0;
  t3.hold = 0; t3.px = 2.1; t3.pz = 6; t3.vx = 0; t3.vz = 15; t3.phase = -Math.PI / 2 - t3.t * PUCK.goalie.speed; steps(t3, c3, 1.0, null);          // (the goalie is at the other side of the mouth)
  check('Puck: the goalie saves what is shot straight at him, and a shot past him is a goal, counted once', saved && t3.score === 1 && c3.events.filter((e) => e.type === 'goal').length === 1, `(score ${t3.score})`);
  // a puck that stops for 5 s is served again from the middle
  const [t4, c4] = make({ kind: 'puck', id: 'pk', goal: 'g', x: 0, z: 0, yaw: 0 }, 1);
  c4.p.z = -15; steps(t4, c4, 0.1, null);
  t4.px = 5.5; t4.pz = 9; t4.vx = 0; t4.vz = 0; t4.stillT = 0;
  steps(t4, c4, PUCK.still + 0.5, null);
  check('Puck: a puck left in a corner for 5 s is served again from the middle', Math.abs(t4.px) < 0.01 && Math.abs(t4.pz + t4.hl * 0.2) < 0.01 && c4.events.some((e) => e.type === 'serve'));
}

{
  // mirrors: a puzzle is made from a way that works and then spoilt, so it can always be solved
  let bad = 0, hitAtStart = 0, parSum = 0, n = 0, dup = 0;
  for (const k of [2, 3]) for (let seed = 1; seed <= 150; seed++) {
    const [t] = make({ kind: 'mirrors', id: 'm', goal: 'g', x: 0, z: 0, yaw: 0, k }, seed);
    n++;
    if (t.beam.hit) hitAtStart++;
    const sol = solveMirrors(t);
    if (!sol || sol.n < 1 || sol.n > k) bad++; else parSum += sol.n;
    const cells = new Set([...t.mirrors.map((q) => q.i * 100 + q.j), t.source.i * 100 + t.source.j, t.receiver.i * 100 + t.receiver.j]);
    if (cells.size !== t.mirrors.length + 2) dup++;
    if (t.mirrors.length !== k) bad++;
  }
  check('Mirrors: a puzzle of 2 or 3 mirrors is never solved at the start, can always be solved in at most as many turns as it has mirrors (and at least one), and no two things share a square', hitAtStart === 0 && bad === 0 && dup === 0, `(${n} puzzles, ${f2(parSum / n)} turns to solve on average)`);
  // the beam: a handmade floor: the lamp west, '/' at (2,2) sends it north, '/' at (2,4) sends it east, the receiver at (4,4)
  const T = { w: 5, h: 5, source: { i: 0, j: 2, d: 0 }, receiver: { i: 4, j: 4 }, mirrors: [{ i: 2, j: 2, s: 0 }, { i: 2, j: 4, s: 0 }] };
  const tr = trace(T);
  check('Mirrors: a "/" turns a beam going east to the north and one going north to the east; the receiver is where it ends', tr.hit && tr.cells.map((q) => q.join(',')).join(' ') === '0,2 1,2 2,2 2,3 2,4 3,4 4,4', tr.cells.map((q) => q.join(',')).join(' '));
  T.mirrors[0].s = 1;
  check('Mirrors: turned the other way ("\\") the first mirror sends it south, off the floor, and a "\\" turns one going north to the west', !trace(T).hit && trace(T).end[1] < 0 && reflect(1, [0, 1]).join() === '-1,0');
  // a ram turns a mirror (once in 0.8 s) and the beam is traced again
  const [t, c] = make({ kind: 'mirrors', id: 'm', goal: 'g', x: 0, z: 0, yaw: 0, k: 2 }, 3);
  const p = c.p; p.chargeT = 0.2; let at = 0;
  const q0 = t.mirrors[0], s0 = q0.s;
  p.chargeHits = (x, y, z) => { const [cx, cz] = [(q0.i - 2) * MIRRORS.cell, (q0.j - 2) * MIRRORS.cell]; return hyp(x - cx, z - cz) < 0.5 && at >= 0; };
  steps(t, c, 0.3, null);
  check('Mirrors: a ram turns a mirror once however long the ram lasts (0.8 s between turns), and the beam is traced again', q0.s === 1 - s0 && c.events.filter((e) => e.type === 'turn_mirror').length === 1 && t.turns === 1);
}

{
  // thief and siege (their foes are the sim's)
  const [t, c] = make(SPECS.thief, 1);
  const spawned = [];
  c.spawn = (kind, x, z, o) => { spawned.push([kind, x, z, o]); return { id: spawned.length }; };
  c.p.z = -40; steps(t, c, 0.5, null);
  const quiet = spawned.length === 0;
  c.p.z = -8; steps(t, c, 0.5, null);
  check('Thief: the Pilferling steps out when the hero comes near and not before', quiet && spawned.length === 1 && spawned[0][0] === 'thief' && t.state === 'active', `(${JSON.stringify(spawned[0] && spawned[0].slice(0, 3))})`);
  c.p.z = -40; c.fate = (h) => (h.id === 1 ? 'gone' : 'alive'); steps(t, c, 0.1, null);
  const back = t.state === 'idle' && c.events.some((e) => e.type === 'fail' && e.why === 'gone');
  c.p.z = -8; steps(t, c, 0.5, null);
  c.fate = (h) => (h.id === 2 ? 'killed' : 'alive'); steps(t, c, 0.1, null);
  check('Thief: if it is put away (the hero was set back) the trial is waiting for him again; when it is killed it is solved', back && t.state === 'solved' && spawned.length === 2);
  const [s, d] = make(SPECS.siege, 1);
  const made = [], alive = new Set();
  d.spawn = (kind, x, z, o) => { const h = { id: made.length, kind }; made.push(h); alive.add(h); return h; };
  d.fate = (h) => (alive.has(h) ? 'alive' : 'killed'); d.dismiss = (h) => alive.delete(h);
  d.p.x = 0; d.p.z = -20; steps(s, d, 1, null);
  const waiting = s.state === 'idle' && made.length === 0;
  d.p.z = -8; steps(s, d, 1.5, null);
  const first = made.length;
  for (const h of [...alive]) alive.delete(h);
  steps(s, d, 2.0, null);
  const second = made.length - first;
  d.p.dead = true; steps(s, d, 0.1, null);
  check('Siege: the waves come when he is inside the ring, one after another as each is cleared (2, then 3), and a hero who is set back finds the ring quiet and what was left put away', waiting && first === 2 && second === 3 && s.state === 'idle' && alive.size === 0 && d.events.filter((e) => e.type === 'wave').length === 2, `(${first}, ${second}; ${s.state})`);
}

{
  // the same seed plays the same trial
  const key = (r) => r.events.map((e) => `${e.t.toFixed(3)}:${e.type}:${e.i ?? ''}:${e.vent ?? ''}`).join(',');
  const bad = [];
  for (const pl of PLAYS.filter((q) => ['bells-right', 'wisps-right', 'plates-right', 'mirrors-right', 'puck-right'].includes(q.id))) {
    const a = playTrial({ spec: pl.spec, hero: pl.hero, policy: pl.policy(), T: pl.T, seed: 9 }), b = playTrial({ spec: pl.spec, hero: pl.hero, policy: pl.policy(), T: pl.T, seed: 9 });
    if (key(a) !== key(b)) bad.push(pl.id);
  }
  check('the same seed plays the same trial (a tune, a scramble, a puzzle, a run of wisps)', bad.length === 0, bad.join(', '));
  const R = Math.random; let calls = 0; Math.random = () => { calls++; return 0.5; };
  for (const k of TRIAL_IDS) { const spec = Object.values(SPECS).find((q) => q.kind === k); playTrial({ spec, hero: { x: 0, z: -4, yaw: 0 }, policy: () => ({ dx: 0, dz: 0, mag: 0 }), T: 5, seed: 2 }); }
  Math.random = R;
  check('a trial never asks for Math.random (it asks ctx.rng: a puzzle can be replayed)', calls === 0, `(${calls} calls)`);
  const hudOk = TRIAL_IDS.every((k) => { const spec = Object.values(SPECS).find((q) => q.kind === k); const [tt, cc] = make(spec, 1); cc.p.z = -3; steps(tt, cc, 0.4, null); const h = MACHINES[k].hud(tt); return h === null || (typeof h.text === 'string' && h.text === h.text.toUpperCase()); });
  check('what a trial says on the HUD is in UPPER CASE (or nothing)', hudOk);
}

console.log(failed ? `\n${failed} FAILED` : '\nall trial checks passed');
process.exit(failed ? 1 : 0);
