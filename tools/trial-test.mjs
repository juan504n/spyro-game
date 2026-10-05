// The trials' machines (src/game/trials/) held to what their design says, headlessly: no server, no browser. Each is played at 60 Hz against a model of the hero (tools/lib/trialsim.mjs: the Player's
// numbers) by a hero who plays it right, one who plays it wrong and one who stands still.
//   node tools/trial-test.mjs
//
//   the table     every kind has its row (a name, a hint, what it asks) and its machine (init, step, hud, targets)
//   the play      the right play solves every kind, from any seed; standing still solves none; the wrong play is told so
//   the numbers   what a person can do: a tune is rung in under 6 s and is 3 to 6 long, a clock is made for 60% of a run, a scramble can be undone in the presses it was made with...
import { playTrial } from './lib/trialsim.mjs';
import { PLAYS, SPECS, judge, plays, shift } from './lib/trial-plays.mjs';
import { MACHINES, TRIALS, TRIAL_IDS, BELLS, PLATES, CIRCUIT, WISPS, PUCK, MIRRORS, timeFor, pressed, solveBoard, trace, solveMirrors, reflect, cellWorld, lcg } from '../src/game/trials/index.js';
import { makeTrial, stepTrial, hudOf, targetsOf, AWAKE, distTo, solidsOf, whereIs } from '../src/game/trials/index.js';
import { buildTrial, footprint, rewardOf, trialProblems, lookOf, DEFAULTS, SIEGE_KINDS } from '../src/game/trials/place.js';
import { KINDS } from '../src/game/foes/kinds.js';
import { trialMix } from './lib/realm-rules.mjs';
import { newBreath, newRam } from '../src/game/trials/core.js';

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
    steps(t, c, 1.3, null);
    check('Bells: a wrong bell is a miss, and after a rest the tune is rung again from the first note', missed && t.phase === 'listen' && t.pos === 0);
    let guard = 0; while (t.phase !== 'play' && guard++ < 3000) steps(t, c, 1 / 60, null);
    steps(t, c, 17.0, null);
    const early = t.phase === 'play' && !c.events.some((e) => e.type === 'fail' && e.why === 'idle');
    steps(t, c, 2.0, null);
    check('Bells: a hero who waits 18 s (not 17) hears the tune again', early && t.phase === 'listen' && c.events.some((e) => e.type === 'fail' && e.why === 'idle'), `(still waiting at 17 s: ${early}; at 19 s: ${t.phase})`);
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
  steps(t4, c4, 4.5, null);
  const notYet = Math.abs(t4.px - 5.5) < 0.01 && !c4.events.some((e) => e.type === 'serve');
  steps(t4, c4, 1.0, null);
  check('Puck: a puck left in a corner for 5 s (not 4) is served again from the middle', notYet && Math.abs(t4.px) < 0.01 && Math.abs(t4.pz + t4.hl * 0.2) < 0.01 && c4.events.some((e) => e.type === 'serve'));
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
  steps(t, c, 2.5, null);
  const held = c.events.filter((e) => e.type === 'turn_mirror').length;
  check('Mirrors: a ram turns a mirror once however long the ram lasts (the button held for 2.5 s does not spin it), and the beam is traced again', q0.s === 1 - s0 && held === 1 && t.turns === 1, `(${held} turn)`);
  p.chargeT = 0; steps(t, c, 1.0, null); p.chargeT = 0.2; steps(t, c, 0.2, null);
  check('Mirrors: ... and the next ram turns it back (once a ram, however soon after)', q0.s === s0 && c.events.filter((e) => e.type === 'turn_mirror').length === 2, `(${c.events.filter((e) => e.type === 'turn_mirror').length} turns)`);
  // a ram is spent by the mirror it turns: with two in reach it turns the nearest and not the other, however long it goes on
  const [u, d] = make({ kind: 'mirrors', id: 'm', goal: 'g', x: 0, z: 0, yaw: 0, k: 3 }, 5);
  const wp = (k) => { const [x, z] = cellWorld(u, u.mirrors[k].i, u.mirrors[k].j); return { x, z }; };
  const a = wp(0), b = wp(1);
  d.p.x = (a.x * 0.3 + b.x * 0.7); d.p.z = (a.z * 0.3 + b.z * 0.7); d.p.chargeT = 0.2;
  d.p.chargeHits = (x, y, z) => hyp(x - d.p.x, z - d.p.z) < 3.6;
  const s0s = u.mirrors.map((q) => q.s);
  steps(u, d, 2.0, null);
  const turned = d.events.filter((e) => e.type === 'turn_mirror').map((e) => e.i);
  check('Mirrors: a ram turns the nearest of the mirrors in its reach and is spent: it does not go on to turn the next', turned.length === 1 && turned[0] === (hyp(a.x - d.p.x, a.z - d.p.z) < hyp(b.x - d.p.x, b.z - d.p.z) ? 0 : 1) && u.mirrors.filter((q, k) => q.s !== s0s[k]).length === 1, `(turned ${turned.join(',')})`);
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
  // (the hero is set back, or goes for good: the Pilferling is put away by the trial and the trial waits for him again)
  const put = []; c.dismiss = (h) => put.push(h.id);
  c.p.dead = true; steps(t, c, 0.1, null);
  const down = t.state === 'idle' && put.join() === '2' && c.events.some((e) => e.type === 'fail' && e.why === 'down');
  c.p.dead = false; c.p.z = -8; steps(t, c, 0.5, null);
  c.p.z = -120; steps(t, c, 0.1, null);
  const left = t.state === 'idle' && put.join() === '2,3' && c.events.some((e) => e.type === 'fail' && e.why === 'left');
  c.p.z = -8; steps(t, c, 0.5, null);
  c.fate = (h) => (h.id === 4 ? 'killed' : 'alive'); steps(t, c, 0.1, null);
  check('Thief: if it is put away (the hero was set back, or went more than 70 m away) the trial is waiting for him again; when it is killed it is solved', back && down && left && t.state === 'solved' && spawned.length === 4, `(${spawned.length} Pilferlings made; ${t.state})`);
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
  // a trial is put to sleep when the hero goes far off: nothing runs, nothing is heard from a hundred metres, and what it was doing is let go; it begins afresh when he comes back
  const run = (t, c, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) stepTrial(t, 1 / 60, c); };
  const [w, cw] = make(SPECS.wisps, 2);
  cw.p.z = -3; run(w, cw, 6);
  const made = cw.events.filter((e) => e.type === 'spawn').length, mid = hudOf(w);
  cw.events.length = 0; cw.p.z = -200; run(w, cw, 30);
  const heard = cw.events.length, h2 = hudOf(w), tg = targetsOf(w).length;
  cw.p.z = -3; run(w, cw, 2);
  check('Wisps: when the hero goes far off the vents go quiet (nothing spawns, nothing is heard, no line on the HUD, no target for his aim, the count is forgotten) and begin again when he comes back', made >= 2 && !!mid && heard === 0 && h2 === null && tg === 0 && w.hits === 0 && cw.events.some((e) => e.type === 'start') && w.state === 'active', `(${made} spawned, ${heard} events from afar)`);
  const [ci, cc] = make(SPECS.circuit, 1);
  const p0 = ci.pylons[0];
  cc.p.x = p0.x; cc.p.z = p0.z; run(ci, cc, 0.2);
  const started = ci.running;
  cc.p.x = 600; cc.p.z = 600; cc.events.length = 0; run(ci, cc, 60);
  check('Circuit: a clock that is running is stopped when the hero goes far off (it does not run out with nobody there: no fail, no sound) and the pylons are as they were', started && !ci.running && ci.next === 0 && cc.events.length === 0 && hudOf(ci) === null);
  const [th, ct] = make(SPECS.thief, 1);
  const spawned = [], put = [];
  ct.spawn = (kind, x, z) => { const h = { id: spawned.length + 1 }; spawned.push(h); return h; }; ct.dismiss = (h) => put.push(h.id);
  ct.p.z = -8; run(th, ct, 0.5);
  ct.p.z = -300; ct.events.length = 0; run(th, ct, 3);
  check('Thief: the Pilferling is put away, in silence, when the hero goes far off', spawned.length === 1 && put.join() === '1' && th.state === 'idle' && ct.events.length === 0);
  const [sg, cs] = make(SPECS.siege, 1);
  const made2 = [], put2 = [];
  cs.spawn = (kind) => { const h = { id: made2.length + 1 }; made2.push(h); return h; }; cs.dismiss = (h) => put2.push(h.id);
  cs.p.x = 0; cs.p.z = -8; run(sg, cs, 2);
  cs.p.z = -300; cs.events.length = 0; run(sg, cs, 3);
  check('Siege: what is left of the waves is put away, in silence, when the hero goes far off, and the ring is quiet', made2.length >= 2 && put2.length === made2.length && sg.state === 'idle' && sg.wave === -1 && cs.events.length === 0);
  check('every kind has a distance at which it sleeps, and a circuit is measured from the nearest of its pylons', Object.keys(TRIALS).every((k) => AWAKE[k] >= 40) && distTo({ kind: 'circuit', pylons: [{ x: 0, z: 0 }, { x: 100, z: 0 }] }, { x: 90, z: 3 }) < 11 && distTo({ kind: 'bells', x: 10, z: 0 }, { x: 0, z: 0 }) === 10);
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


// ---- what the layout makes of a brief's trial (trials/place.js) -----------------------------------------------------------------------------------------
{
  const goal = { id: 'g', x: 3, z: 4 }, h = (x, z) => 0.01 * x + 0.02 * z;
  const bt = (t, o = {}) => buildTrial(goal, t, { h, ...o });
  const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
  // the bells: an arc of n in front of where he stands, 3.2 m or more apart, each on the ground it stands on
  {
    const sp = bt({ kind: 'bells', at: [10, 20], yaw: 0.5, n: 5, r: 6, arc: 2.4 });
    const dists = sp.bells.map((b) => hyp(b.x - 10, b.z - 20)), gap = hyp(sp.bells[1].x - sp.bells[0].x, sp.bells[1].z - sp.bells[0].z);
    const bearings = sp.bells.map((b) => Math.atan2(b.x - 10, b.z - 20));
    check('place: a trial is the record the system is given: an id of its lantern and its kind, where it stands and its ground', sp.id === 'g-bells' && sp.goal === 'g' && sp.kind === 'bells' && sp.x === 10 && sp.z === 20 && near(sp.y, h(10, 20)));
    check('place: bells stand on an arc of the radius in front of the hero (the yaw a mid-line), 3.2 m or more apart, each on the ground', sp.bells.length === 5 && dists.every((d) => near(d, 6, 1e-6)) && near(bearings[0], 0.5 - 1.2, 1e-6) && near(bearings[4], 0.5 + 1.2, 1e-6) && gap >= 3.2 && sp.bells.every((b) => near(b.y, h(b.x, b.z))), `(${f2(gap)} m apart)`);
    check('place: a trial that says nothing of its numbers has the kind\'s own (bells: 5 of them, 5.8 m off, an arc of 2.3 rad, 4 notes)', (() => { const d = bt({ kind: 'bells', at: [0, 0] }); return d.bells.length === 5 && near(d.r, 5.8) && near(d.arc, 2.3) && d.len === 4; })());
  }
  // the plates and the vents: a ring round `at`
  {
    const pl = bt({ kind: 'plates', at: [10, 20], r: 4.4, scramble: 2 }), vn = bt({ kind: 'wisps', at: [10, 20], r: 5, n: 6, want: 7 });
    const sides = pl.plates.map((b, i) => hyp(b.x - pl.plates[(i + 1) % 5].x, b.z - pl.plates[(i + 1) % 5].z));
    check('place: plates stand in a ring of the radius round the hub, evenly (the last is not the first again), and a scramble is kept', pl.plates.length === 5 && pl.plates.every((b) => near(hyp(b.x - 10, b.z - 20), 4.4)) && sides.every((d) => near(d, sides[0], 1e-6)) && near(sides[0], 2 * 4.4 * Math.sin(Math.PI / 5), 1e-6) && pl.scramble === 2 && bt({ kind: 'plates', at: [0, 0] }).scramble === undefined);
    check('place: wisps rise from vents in a ring (the count and the number wanted are the brief\'s)', vn.vents.length === 6 && vn.vents.every((b) => near(hyp(b.x - 10, b.z - 20), 5)) && vn.want === 7 && bt({ kind: 'wisps', at: [0, 0] }).want === undefined);
  }
  // the circuit: its pylons are the way, its first the place, its time the brief's or the machine's
  {
    const P = [[0, 0], [10, 0], [20, 5], [30, 5], [40, 0]];
    const c = bt({ kind: 'circuit', pylons: P }), c2 = bt({ kind: 'circuit', pylons: P, time: 30 });
    check('place: a circuit is its pylons on the ground, the first is where it is found, and the time is the brief\'s when it says (else the machine\'s)', c.pylons.length === 5 && c.pylons.every((q, i) => q.x === P[i][0] && q.z === P[i][1] && near(q.y, h(q.x, q.z))) && c.x === 0 && c.z === 0 && c.time === undefined && c2.time === 30);
  }
  // a court, a floor, a thief, a siege
  {
    const pk = bt({ kind: 'puck', at: [0, 0], yaw: 1 }), mr = bt({ kind: 'mirrors', at: [0, 0], seed: 4 }), th = bt({ kind: 'thief', at: [50, 60], yaw: Math.PI / 2 }), th2 = bt({ kind: 'thief', at: [50, 60], spawn: [70, 80] });
    const sg = bt({ kind: 'siege', at: [0, 0], waves: [['basic'], ['bell', 'thorn']] });
    check('place: a court has the numbers of a court (6.5 m across half-way, 11 m long, a goal 2.4 m across half-way), a floor of 5 by 5 squares with 3 mirrors and the seed it is given', pk.hw === 6.5 && pk.hl === 11 && pk.goalHW === 2.4 && pk.yaw === 1 && mr.w === 5 && mr.h === 5 && mr.k === 3 && mr.seed === 4 && bt({ kind: 'mirrors', at: [0, 0] }).seed === undefined);
    check('place: the Pilferling is made 12 m from the place the way the trial faces (or where the brief says), and a siege keeps its waves and a ring of 12 m', near(th.spawnX, 62, 1e-6) && near(th.spawnZ, 60, 1e-6) && th2.spawnX === 70 && th2.spawnZ === 80 && sg.r === 12 && sg.waves.length === 2 && sg.waves[1].join() === 'bell,thorn');
    check('place: what a solved trial pays is what the foes it brings would have dropped (a thief its sack, a siege its waves), and a brief that says its own gems is believed (even none: Vale\'s)', rewardOf(th).join() === KINDS.thief.drops.join() && rewardOf(sg).join() === [...KINDS.basic.drops, ...KINDS.bell.drops, ...KINDS.thorn.drops].join() && th.gems.join() === rewardOf(th).join() && sg.gems.length > 0 && bt({ kind: 'siege', at: [0, 0], waves: [['basic'], ['bell']], gems: [] }).gems.length === 0 && bt({ kind: 'siege', at: [0, 0], waves: [['basic'], ['bell']], gems: [5] }).gems.join() === '5' && bt({ kind: 'bells', at: [0, 0] }).gems.length === 0);
    let threw = false; try { bt({ kind: 'riddle', at: [0, 0] }); } catch (e) { threw = /no trial kind/.test(e.message); }
    check('place: a kind there is not is refused when it is built (and the brief says so before)', threw);
  }
  // the ground a trial needs: a circle round everything that stands on it (the level makes it a pad, the layout keeps props off it, the checker holds it level and dry)
  {
    const inside = (f, x, z, m = 0) => hyp(x - f.x, z - f.z) + m <= f.r + 1e-6;
    const bs = bt({ kind: 'bells', at: [10, 20], yaw: 2.2, n: 6, r: 7, arc: 2.6 }), fb = footprint(bs);
    check('footprint: bells (and the hero who stands before them) are all within the circle, with a margin of 1.5 m round the farthest', fb && bs.bells.every((b) => inside(fb, b.x, b.z, 1.4)) && inside(fb, bs.x, bs.z, 1.4));
    const pl = bt({ kind: 'plates', at: [10, 20], r: 4.4 }), fp = footprint(pl), vn = bt({ kind: 'wisps', at: [10, 20], r: 5 }), fv = footprint(vn);
    check('footprint: plates and vents are within the circle with their light to spare (2 m)', pl.plates.every((b) => inside(fp, b.x, b.z, 2)) && vn.vents.every((b) => inside(fv, b.x, b.z, 2)) && near(fp.r, 4.4 + 2.2) && near(fv.r, 5 + 2.2));
    const pk = bt({ kind: 'puck', at: [10, 20], yaw: 0.9 }), fk = footprint(pk), c = Math.cos(0.9), sn = Math.sin(0.9);
    const corners = [[-6.5, -11], [6.5, -11], [-6.5, 11], [6.5, 11]].map(([lx, lz]) => [10 + lx * c + lz * sn, 20 - lx * sn + lz * c]);
    check('footprint: the four corners of a court are within the circle', corners.every(([x, z]) => inside(fk, x, z, 0.5)));
    const mr = bt({ kind: 'mirrors', at: [10, 20], yaw: 0.4 }), fm = footprint(mr);
    const cc = [[0, 0], [4, 0], [0, 4], [4, 4]].map(([i, j]) => cellWorld(mr, i, j));
    check('footprint: the four corners of a floor of squares are within the circle, with a square\'s own width to spare', cc.every(([x, z]) => inside(fm, x, z, 1.8)));
    const sg = bt({ kind: 'siege', at: [10, 20], waves: [['basic'], ['bell']], r: 14 }), fs = footprint(sg);
    check('footprint: a siege has its ring and a margin, and a circuit (which runs over the country as it is) and a thief have none', near(fs.r, 15.5) && fs.x === 10 && footprint(bt({ kind: 'circuit', pylons: [[0, 0], [1, 1]] })) === null && footprint(bt({ kind: 'thief', at: [0, 0] })) === null);
  }
  // the realm's look: its own stone and crystal and the colour of its glow, else the Vale's
  {
    const plain = lookOf({ goals: [{ glow: [0.1, 0.2, 0.3] }] }), own = lookOf({ theme: { trials: { stone: 'cobble_tide', glow: [1, 0, 0] } }, goals: [{ glow: [0.1, 0.2, 0.3] }] });
    check('look: a realm that says nothing gets the Vale\'s stone and the glow of its first lantern; one that says wears its own', plain.stone === 'cobble' && plain.glow.join() === '0.1,0.2,0.3' && own.stone === 'cobble_tide' && own.glow.join() === '1,0,0' && own.crystal === 'crystal_violet' && lookOf(null).glow.length === 3);
  }
  // the brief that cannot be made is refused (defineBrief says so, naming the lantern)
  {
    const g = { id: 'g' }, ok = { kind: 'bells', at: [0, 0] };
    const cases = [
      ['a trial that is not a record', 3, 'must be'], ['a kind that is not one', { kind: 'riddle', at: [0, 0] }, 'kind one of'], ['no place for it', { kind: 'bells' }, 'at:'],
      ['bells: three', { ...ok, n: 3 }, 'bells n'], ['bells: seven', { ...ok, n: 7 }, 'bells n'], ['bells: too close together', { ...ok, n: 6, r: 4.5, arc: 1.5 }, '3.2 m'], ['bells: too near the hero', { ...ok, r: 4.0, arc: 4 }, '3.2 m'], ['bells: a tune of two', { ...ok, len: 2 }, 'bells len'], ['bells: a tune of seven', { ...ok, len: 7 }, 'bells len'],
      ['plates: four', { kind: 'plates', at: [0, 0], n: 4 }, 'plates n'], ['plates: seven', { kind: 'plates', at: [0, 0], n: 7 }, 'plates n'], ['plates: too tight a ring', { kind: 'plates', at: [0, 0], r: 3.4 }, 'plates n'], ['wisps: four vents', { kind: 'wisps', at: [0, 0], n: 4 }, 'wisps n'],
      ['circuit: four pylons', { kind: 'circuit', pylons: [[0, 0], [1, 0], [2, 0], [3, 0]] }, 'pylons'], ['circuit: ten pylons', { kind: 'circuit', pylons: Array.from({ length: 10 }, (_, i) => [i * 9, 0]) }, 'pylons'], ['circuit: a pylon that is not a place', { kind: 'circuit', pylons: [[0, 0], [1, 0], [2, 0], [3, 0], [4]] }, 'pylons'], ['circuit: a clock of ten seconds', { kind: 'circuit', pylons: Array.from({ length: 6 }, (_, i) => [i * 9, 0]), time: 10 }, 'time'],
      ['puck: too narrow a court', { kind: 'puck', at: [0, 0], hw: 4 }, 'puck:'], ['puck: too short a court', { kind: 'puck', at: [0, 0], hl: 7 }, 'puck:'], ['puck: a goal that is as wide as the court', { kind: 'puck', at: [0, 0], goalHW: 6.5 }, 'puck:'], ['puck: a goal that is too narrow', { kind: 'puck', at: [0, 0], goalHW: 1.5 }, 'puck:'],
      ['mirrors: a floor of three', { kind: 'mirrors', at: [0, 0], w: 3 }, 'mirrors:'], ['mirrors: a floor of six', { kind: 'mirrors', at: [0, 0], h: 6 }, 'mirrors:'], ['mirrors: one mirror', { kind: 'mirrors', at: [0, 0], k: 1 }, 'mirrors:'], ['mirrors: four mirrors', { kind: 'mirrors', at: [0, 0], k: 4 }, 'mirrors:'],
      ['thief: a spawn that is not a place', { kind: 'thief', at: [0, 0], spawn: [1] }, 'thief spawn'],
      ['siege: a small ring', { kind: 'siege', at: [0, 0], r: 6, waves: [['basic'], ['bell']] }, 'siege r'], ['siege: one wave', { kind: 'siege', at: [0, 0], waves: [['basic']] }, 'siege waves'], ['siege: five waves', { kind: 'siege', at: [0, 0], waves: [['basic'], ['basic'], ['basic'], ['basic'], ['basic']] }, 'siege waves'], ['siege: an empty wave', { kind: 'siege', at: [0, 0], waves: [['basic'], []] }, 'siege waves'], ['siege: five in a wave', { kind: 'siege', at: [0, 0], waves: [['basic'], ['basic', 'basic', 'basic', 'basic', 'basic']] }, 'siege waves'], ['siege: a moth, which flies', { kind: 'siege', at: [0, 0], waves: [['basic'], ['moth']] }, 'siege waves'], ['siege: a Smokecaller, which calls more', { kind: 'siege', at: [0, 0], waves: [['basic'], ['caller']] }, 'siege waves'],
      ['gems that are not gems', { ...ok, gems: [3] }, 'gems'], ['gems that are not a list', { ...ok, gems: 5 }, 'gems'],
    ];
    const let_through = cases.filter(([, t, frag]) => { const e = trialProblems(g, t); return !(e.length >= 1 && e.every((m) => m.startsWith("goal 'g': trial ")) && e.join(' ').includes(frag)); });
    check('place: a brief that cannot be made is refused, with what is wrong (a trial that is no record, a kind there is not, bells too close or too many, a ring too tight, a clock too short, a court too narrow, a goal as wide as the court, a floor or a number of mirrors the puzzle cannot be made on, a siege of a foe that flies or calls)', let_through.length === 0, `(${cases.length} cases${let_through.length ? '; let through: ' + let_through.map(([n]) => n).join('; ') : ''})`);
    const fine = [{ kind: 'bells', at: [0, 0] }, { kind: 'bells', at: [0, 0], n: 6, r: 5.5, arc: 3.2, len: 6 }, { kind: 'plates', at: [0, 0], n: 6, r: 3.6 }, { kind: 'wisps', at: [0, 0], n: 5, r: 5 }, { kind: 'circuit', pylons: Array.from({ length: 5 }, (_, i) => [i * 20, 0]) }, { kind: 'circuit', pylons: Array.from({ length: 9 }, (_, i) => [i * 20, 0]), time: 14 }, { kind: 'puck', at: [0, 0] }, { kind: 'puck', at: [0, 0], hw: 5, hl: 8, goalHW: 1.8 }, { kind: 'mirrors', at: [0, 0] }, { kind: 'mirrors', at: [0, 0], w: 4, h: 4, k: 2 }, { kind: 'thief', at: [0, 0] }, { kind: 'thief', at: [0, 0], spawn: [9, 9] }, { kind: 'siege', at: [0, 0], waves: [['basic', 'bell', 'thorn', 'rime'], ['slinger', 'hog', 'warden', 'pup']], r: 8 }, { kind: 'siege', at: [0, 0], waves: [['basic'], ['bell'], ['thorn'], ['pup']] }, { kind: 'bells', at: [0, 0], gems: [1, 2, 5, 10, 25] }];
    const refused = fine.filter((t) => trialProblems(g, t).length > 0);
    check('place: ... and what can be made is not refused (the least and the most of every number)', refused.length === 0, `(${fine.length} cases${refused.length ? '; refused: ' + refused.map((t) => t.kind + ' ' + trialProblems(g, t)[0]).join('; ') : ''})`);
    check('place: a siege may call only the foes that fight without a place of their own (eight kinds; not the moth, the Smokecaller, the Pilferling, the Dustmole)', SIEGE_KINDS.length === 8 && !['moth', 'caller', 'thief', 'mole'].some((k) => SIEGE_KINDS.includes(k)) && SIEGE_KINDS.every((k) => KINDS[k]));
  }
  // the mix of a realm's asks
  {
    const cases = [
      ['five goals, four kinds of trial after the plain one', [null, 'bells', 'puck', 'siege', 'plates'], true], ['three kinds are enough', [null, 'bells', 'puck', 'bells', 'siege'], true], ['a plain lantern in the middle is fine', [null, 'bells', null, 'puck', 'siege'], true], ['the same kind with a plain lantern between is not twice running', [null, 'bells', null, 'bells', 'siege', 'puck'], true],
      ['the first lantern has a trial', ['bells', 'puck', 'siege', 'plates', 'wisps'], false], ['the same kind twice running', [null, 'bells', 'bells', 'siege', 'puck'], false], ['two kinds where three are wanted', [null, 'bells', 'puck', 'bells', 'puck'], false],
      ['a realm of three goals wants two kinds', [null, 'bells', 'puck'], true], ['... and one kind is not two', [null, 'bells', null], false], ['no trial at all', [null, null, null, null, null], false],
    ];
    const bad = cases.filter(([, o, want]) => trialMix(o).ok !== want).map(([n]) => n);
    check('trials.mix: the first lantern is plain, three kinds stand in front of the others (two in a realm of three goals) and none twice running', bad.length === 0, `(${cases.length} cases${bad.length ? '; wrong: ' + bad.join('; ') : ''})`);
  }
}


{
  // how far off a trial sleeps: each kind has its own distance (a circuit from its nearest pylon): beyond it nothing is stepped, said or aimed at; within it the trial is awake
  const wrong = [];
  for (const k of TRIAL_IDS) {
    const spec = Object.values(SPECS).find((q) => q.kind === k);
    const [t, c] = make(spec, 1);
    const far = AWAKE[k] + 5, near = AWAKE[k] - 5;
    const origin = k === 'circuit' ? t.pylons.reduce((a, q) => (q.x > a.x ? q : a)) : t;          // (a circuit: from the pylon furthest east, he stands east of it, so that it is the nearest)
    c.p.x = origin.x + far; c.p.z = origin.z;
    const t0 = t.t;
    stepTrial(t, 1 / 60, c);
    const asleep = t.asleep === true && t.t === t0 && hudOf(t) === null && targetsOf(t).length === 0;
    c.p.x = origin.x + near;
    stepTrial(t, 1 / 60, c);
    const awake = t.asleep === false && t.t > t0;
    if (!asleep) wrong.push(`${k} does not sleep ${far} m off`);
    if (!awake) wrong.push(`${k} does not wake ${near} m off`);
  }
  check('every kind sleeps beyond its distance (not stepped: its clock stands still; no line on the HUD, nothing to aim at) and is awake within it', wrong.length === 0, wrong.join('; '));
  // what a trial puts on the floor that cannot be walked through
  const [bt] = make({ kind: 'bells', id: 'b', goal: 'g', x: 0, z: 0, bells: bellsAt(0, 0, 5.8, 5) }, 1), [mt] = make(SPECS.mirrors, 1);
  const bs = solidsOf(bt), ms = solidsOf(mt);
  check('solids: each bell stands solid where it is (the hero and the foes walk round it), the lamp and the receiver and each mirror of a floor of squares too, and the others have none', bs.length === 5 && bs.every((q, i) => q.x === bt.bells[i].x && q.z === bt.bells[i].z && q.r > 0.4 && q.h > 2) && ms.length === 2 + mt.mirrors.length && ms.every((q) => q.r > 0.5 && q.h > 2) && TRIAL_IDS.filter((k) => !['bells', 'mirrors'].includes(k)).every((k) => solidsOf({ kind: k }).length === 0));
}


// ---- the numbers pinned, and the lines played: each of these is a number or a line that a mutation of round twenty-nine replaced and nothing failed on ----------------------------------------
{
  // (a clock for what a machine says: when it said it)
  const timed = (spec, seed = 1, o = {}) => {
    const c = ctxOf(hero(o), seed); let T = null;
    c.emit = (type, d) => c.events.push({ type, ...d, by: undefined, at: T ? +T.t.toFixed(3) : 0 });
    T = makeTrial(spec, c);
    return [T, c];
  };
  const first = (c, type, after = -1) => c.events.find((e) => e.type === type && e.at > after);
  const B5 = bellsAt(0, 0, 5.8, 5);
  const bs = (o = {}) => ({ kind: 'bells', id: 'b', goal: 'g', x: 0, z: 0, bells: B5, ...o });

  // ---- bells
  check('Bells: a tune is never shorter than 3 nor longer than 6 whatever the layout says', make(bs({ len: 9 }))[0].len === 6 && make(bs({ len: 1 }))[0].len === 3 && make(bs({ len: 5 }))[0].len === 5);
  {
    const [a, ac] = make(bs(), 1); ac.p.z = -17; steps(a, ac, 0.2, null);
    const [b, bc] = make(bs(), 1); bc.p.z = -15; steps(b, bc, 0.2, null);
    check('Bells: the shrine rings when he is within 16 m and not at 17', a.phase === 'wait' && b.phase === 'listen');
  }
  {
    const [t, c] = make(bs(), 3); const p = c.p;
    steps(t, c, 6.5, null);
    const want = t.tune[0];
    p.flameHits = (x, y, z) => Math.abs(B5[want].x - x) < 1e-6 && Math.abs(B5[want].z - z) < 1e-6;
    p.yaw = Math.atan2(B5[want].x, B5[want].z);
    steps(t, c, 0.2, (tt) => { p.flameT = Math.max(0, 0.42 - tt); });
    const lit = t.lit === want;
    p.flameT = 0; steps(t, c, 0.5, null);
    check('Bells: the bell a right breath lights goes dark again after 0.45 s', lit && t.lit === -1 && t.pos === 1, `(lit ${lit}, then ${t.lit})`);
  }
  {
    const [t, c] = timed(bs(), 5); const p = c.p;
    steps(t, c, 6.5, null);
    const wrong = (t.tune[0] + 1) % 5;
    p.flameHits = (x, y, z) => Math.abs(B5[wrong].x - x) < 1e-6 && Math.abs(B5[wrong].z - z) < 1e-6; p.yaw = Math.atan2(B5[wrong].x, B5[wrong].z);
    steps(t, c, 0.3, (tt) => { p.flameT = Math.max(0, 0.42 - tt); }); p.flameT = 0;
    steps(t, c, 3, null);
    const miss = first(c, 'miss'), again = miss && first(c, 'turn', miss.at);
    check('Bells: the tune is rung again 1.1 s after a wrong bell (not 1.0)', !!miss && !!again && again.listen === true && Math.abs(again.at - miss.at - 1.1) < 0.03, `(${miss && again ? (again.at - miss.at).toFixed(2) : '?'} s)`);
  }
  {
    const [t, c] = make(bs(), 4); steps(t, c, 6.5, null);
    const before = c.events.length; c.p.z = -200; stepTrial(t, 1 / 60, c);
    check('Bells: far off in the middle of a tune it is forgotten in silence and the shrine waits', t.phase === 'wait' && t.state === 'idle' && t.pos === 0 && t.lit === -1 && c.events.length === before);
  }

  // ---- plates
  {
    const pl = bellsAt(0, 0, 5.5, 5);
    const press = (y, grounded) => { const [t, c] = make({ kind: 'plates', id: 'p', goal: 'g', x: 0, z: 0, plates: pl, scramble: 2 }, 7); c.p.x = pl[1].x; c.p.z = pl[1].z; c.p.y = y; c.p.grounded = grounded; steps(t, c, 0.2, null); return c.events.filter((e) => e.type === 'press').length; };
    const r = [press(3.0, true), press(1.0, true), press(0.4, false)];
    check('Plates: a hero on a ledge 3 m over a plate presses nothing, one 1 m over it does, and one in the air a hand over it does not', r.join() === '0,1,0', `(${r.join(', ')})`);
    const pars = [];
    for (let seed = 1; seed <= 300; seed++) pars.push(make({ kind: 'plates', id: 'p', goal: 'g', x: 0, z: 0, plates: pl }, seed)[0].par);
    const threes = pars.filter((v) => v === 3).length;
    check('Plates: a ring that says nothing of its scramble is spoilt by three presses (a puzzle: a good part of the boards need three, none more)', Math.max(...pars) === 3 && Math.min(...pars) >= 1 && threes > 60, `(${threes} of 300 need three)`);
  }

  // ---- wisps
  {
    const [t, c] = timed(SPECS.wisps, 1); c.p.x = 0; c.p.z = 0;
    steps(t, c, 6.0, null);
    const sp = first(c, 'spawn'), es = first(c, 'miss');
    check('Wisps: a wisp that is not burnt gets away 3.4 s after it rises (not 30)', !!sp && !!es && Math.abs(es.at - sp.at - 3.4) < 0.08, `(${sp && es ? (es.at - sp.at).toFixed(2) : '?'} s)`);
    const [u, d] = timed(SPECS.wisps, 2); steps(u, d, 0.1, null);
    u.escaped = 4; u.spawned = 5; steps(u, d, 1 / 60, null);
    const four = d.events.filter((e) => e.type === 'fail').length;
    u.escaped = 5; steps(u, d, 1 / 60, null);
    check('Wisps: four may get away and the fifth is too many (the round fails)', four === 0 && d.events.filter((e) => e.type === 'fail').length === 1);
    const [v, e] = timed(SPECS.wisps, 3); e.p.x = 0; e.p.z = 0;
    steps(v, e, 0.1, null); v.escaped = 5; steps(v, e, 1 / 60, null);
    const fail = first(e, 'fail'); steps(v, e, 7, null);
    const sp2 = fail && first(e, 'spawn', fail.at);
    check('Wisps: after a failed round the vents rest 3 s, and the first wisp rises 1.2 s after that', !!sp2 && Math.abs(sp2.at - fail.at - 4.2) < 0.12, `(${sp2 ? (sp2.at - fail.at).toFixed(2) : '?'} s)`);
    let repeats = 0, n = 0;
    for (let seed = 1; seed <= 100; seed++) { const [w, wc] = timed(SPECS.wisps, seed); wc.p.x = 0; wc.p.z = 0; steps(w, wc, 20, null); let last = -1; for (const q of wc.events) { if (q.type === 'fail') last = -1; if (q.type !== 'spawn') continue; n++; if (q.vent === last) repeats++; last = q.vent; } }
    check('Wisps: no vent lets go twice running in a round (100 seeds)', n > 600 && repeats === 0, `(${n} wisps, ${repeats} repeats)`);
    const [x, xc] = make(SPECS.wisps, 1); xc.p.x = 0; xc.p.z = 0; xc.p.flameHits = () => true; xc.p.flameT = 0;
    steps(x, xc, 4, null);
    check('Wisps: a flame that is not lit burns nothing', x.hits === 0);
    const [y, yc] = make(SPECS.wisps, 1); yc.p.x = 0; yc.p.z = 0;
    steps(y, yc, 3, null);
    const air = y.live.filter((q) => !q.dead).length;
    y.live[0].dead = 'hit';
    const tg = targetsOf(y);
    check('Wisps: the aim assist is shown the wisps in the air and not the ones that are burnt', air >= 2 && tg.length === air - 1 && !tg.some((q) => Math.hypot(q.x - y.live[0].x, q.z - y.live[0].z) < 1e-6));
  }

  // ---- puck
  {
    const PK = { kind: 'puck', id: 'pk', goal: 'g', x: 0, z: 0, yaw: 0 };
    const mk = (seed = 1) => { const [t, c] = timed(PK, seed); c.p.z = -15; steps(t, c, 0.1, null); return [t, c]; };
    const [a, ac] = mk(); a.px = 4.5; a.pz = 9; a.vx = 0; a.vz = 15; steps(a, ac, 1.0, null);
    check('Puck: a shot at the end wall beside the goal mouth is turned back: it is not a goal', a.score === 0 && !ac.events.some((e) => e.type === 'goal') && ac.events.some((e) => e.type === 'bounce'));
    const [b, bc] = mk();
    const shoot = (t, c) => { t.px = 2.1; t.pz = 6; t.vx = 0; t.vz = 15; t.hold = 0; t.phase = -Math.PI / 2 - t.t * 1.9; steps(t, c, 0.9, null); };
    shoot(b, bc); const one = b.score, held = b.hold;
    steps(b, bc, 3.0, null);
    const g = first(bc, 'goal'), sv = g && first(bc, 'serve', g.at);
    check('Puck: a goal is held for 1.1 s and then the puck is served again from the middle', one === 1 && held > 0 && !!g && !!sv && Math.abs(sv.at - g.at - 1.1) < 0.06, `(${g && sv ? (sv.at - g.at).toFixed(2) : '?'} s)`);
    shoot(b, bc); const two = [b.score, b.state];
    shoot(b, bc);
    check('Puck: three goals solve it and two do not', two.join() === '2,active' && b.score === 3 && b.state === 'solved', `(${two.join(' ')}, then ${b.score} ${b.state})`);
    const [w, wc] = mk(); w.px = 0; w.pz = -9; w.vx = 0; w.vz = -14; let low = 0;
    steps(w, wc, 1.0, () => { low = Math.min(low, w.pz); });
    check('Puck: the wall behind turns it back too (it is never outside the court)', low >= -w.hl && w.pz > -w.hl, `(it went as far as ${low.toFixed(1)} m of the ${-w.hl} m of the court)`);
    const [s, sc] = mk(); s.score = 2; s.px = 3; s.vx = 2; const ev0 = sc.events.length; sc.p.z = -200; stepTrial(s, 1 / 60, sc);
    check('Puck: far off the game waits (the puck is still, the trial idle: no sound) and the score is kept', s.state === 'idle' && s.vx === 0 && s.vz === 0 && s.score === 2 && sc.events.length === ev0);
  }

  // ---- mirrors: a handmade floor (the lamp west, a mirror at (2,2) that sends the beam north, a mirror at (2,4) that does not send it east, one at (3,2) that is no part of the way)
  {
    const H = { kind: 'mirrors', id: 'm', goal: 'g', x: 0, z: 0, yaw: 0, w: 5, h: 5, source: { i: 0, j: 2, d: 0 }, receiver: { i: 4, j: 4 }, mirrors: [{ i: 2, j: 2, s: 0 }, { i: 2, j: 4, s: 1 }, { i: 3, j: 2, s: 0 }] };
    const [t, c] = make(H, 1);
    const A = cellWorld(t, 2, 2), Bm = cellWorld(t, 3, 2);
    c.p.x = Bm[0] - 1.0; c.p.z = Bm[1]; c.p.chargeT = 0.2; c.p.chargeHits = (x, y, z) => hyp(x - c.p.x, z - c.p.z) < 3.6;
    steps(t, c, 0.3, null);
    const turned = c.events.filter((e) => e.type === 'turn_mirror').map((e) => e.i);
    check('Mirrors: of two mirrors in reach a ram turns the nearer, though it comes last in the list', turned.join() === '2' && hyp(A[0] - c.p.x, A[1] - c.p.z) < 3.6, `(turned ${turned.join(',')})`);
    const [u, d] = make(H, 1);
    d.p.x = Bm[0] + 1.0; d.p.z = Bm[1]; d.p.chargeT = 0.2; d.p.chargeHits = (x, y, z) => hyp(x - d.p.x, z - d.p.z) < 3.6;
    steps(u, d, 0.2, null); d.p.chargeT = 0; steps(u, d, 0.1, null); d.p.chargeT = 0.2; steps(u, d, 0.2, null);
    const quick = d.events.filter((e) => e.type === 'turn_mirror').length;
    d.p.chargeT = 0; steps(u, d, 1.0, null); d.p.chargeT = 0.2; steps(u, d, 0.2, null);
    check('Mirrors: a mirror that has just been turned is not turned back by a ram begun within 0.8 s, and is by one after it', quick === 1 && d.events.filter((e) => e.type === 'turn_mirror').length === 2, `(${quick}, then ${d.events.filter((e) => e.type === 'turn_mirror').length})`);
    let hit0 = 0;
    for (const k of [2, 3]) for (let seed = 1; seed <= 1500; seed++) if (make({ kind: 'mirrors', id: 'm', goal: 'g', x: 0, z: 0, yaw: 0, k }, seed)[0].beam.hit) hit0++;
    check('Mirrors: a puzzle is never solved at the start (3000 puzzles)', hit0 === 0, `(${hit0} of 3000)`);
  }

  // ---- siege
  {
    const mkS = () => {
      const [s, d] = timed(SPECS.siege, 1);
      const made = [], alive = new Set();
      d.spawn = (kind, x, z, o) => { const h = { id: made.length, kind, x, z, o }; made.push(h); alive.add(h); return h; };
      d.fate = (h) => (alive.has(h) ? 'alive' : 'killed'); d.dismiss = (h) => alive.delete(h);
      d.p.x = 0; d.p.z = -8;
      return [s, d, made, alive];
    };
    const [s, d, made, alive] = mkS();
    steps(s, d, 6, () => { for (const h of [...alive]) alive.delete(h); });
    const st = first(d, 'start'), waves = d.events.filter((e) => e.type === 'wave').map((e) => e.at);
    check('Siege: the first wave comes 0.6 s after he steps inside and each next 1.2 s after the one before (not at once), and the last that falls solves it', !!st && waves.length === 3 && Math.abs(waves[0] - st.at - 0.6) < 0.05 && Math.abs(waves[1] - waves[0] - 1.2) < 0.05 && Math.abs(waves[2] - waves[1] - 1.2) < 0.05 && s.state === 'solved', `(${waves.map((q) => (q - (st ? st.at : 0)).toFixed(2)).join(', ')})`);
    check('Siege: the Snuffers of a wave come at once to him (wild), from inside the ring, and are the trial\'s', made.length > 0 && made.every((h) => h.o.wild === true && h.o.trial === 'siege' && hyp(h.x, h.z) <= 12 * 0.8 && hyp(h.x, h.z) >= 12 * 0.7), `(${made.map((h) => hyp(h.x, h.z).toFixed(1)).join(' ')} m)`);
    const [s2, d2] = mkS();
    steps(s2, d2, 0.3, null);
    const hud = hudOf(s2);                                                           // (in the 0.6 s before the first wave: no wave 0)
    steps(s2, d2, 0.7, null);
    d2.p.x = 36.5; d2.p.z = 0; steps(s2, d2, 0.1, null);
    const stays = s2.state === 'active';
    d2.p.x = 40; steps(s2, d2, 0.1, null);
    check('Siege: he may go 36 m from the middle of a ring of 12 and the waves wait, and at 40 m he has left: they are put away', stays && s2.state === 'idle' && d2.events.some((e) => e.type === 'fail' && e.why === 'left'));
    check('Siege: the HUD counts the wave from 1 (WAVE 1 OF 3  0 LEFT before it comes), not from 0', !!hud && /^WAVE 1 OF 3 /.test(hud.text), `(${hud && hud.text})`);
    const [s3, d3] = mkS();
    d3.p.x = 8; d3.p.z = 0; steps(s3, d3, 0.3, null);
    check('Siege: it begins when he is within 70% of the ring and not at 80%', s3.state === 'active' && (() => { const [q, e] = mkS(); e.p.x = 9.6; e.p.z = 0; steps(q, e, 0.3, null); return q.state === 'idle'; })());
  }

  // ---- the index and the core
  check('every kind sleeps at 100 m off at the most (nothing is heard from further) and not nearer than 40', TRIAL_IDS.every((k) => AWAKE[k] >= 40 && AWAKE[k] <= 100), `(${TRIAL_IDS.map((k) => `${k} ${AWAKE[k]}`).join(', ')})`);
  {
    const said = TRIAL_IDS.filter((k) => ['plates', 'mirrors', 'puck'].includes(k)).map((k) => {
      const spec = Object.values(SPECS).find((q) => q.kind === k);
      const [t, c] = make(spec, 1); c.p.x = t.x; c.p.z = t.z - 3; steps(t, c, 0.4, null);
      const near = hudOf(t) !== null;
      c.p.x = t.x; c.p.z = t.z - 400; stepTrial(t, 1 / 60, c);
      return [k, near, hudOf(t)];
    });
    check('a trial that was in play and is left far behind says nothing on the HUD, even those with no sleep of their own (the plates, the mirrors, the puck)', said.every(([, near, far]) => near && far === null), `(${said.map(([k, n, f]) => `${k} ${n} ${f === null ? 'quiet' : 'SPEAKS'}`).join(', ')})`);
  }
  {
    const t = {}, p = { flameT: 0, chargeT: 0 };
    const seq = [0.42, 0.3, 0.2, 0.1, 0, 0.42, 0.3].map((v) => { p.flameT = v; return newBreath(t, p); });
    check('a breath is counted once, from the moment the flame rises to the end of it, and the next when it rises again', seq.join() === 'true,false,false,false,false,true,false', `(${seq.join()})`);
    const r = {}, q = { chargeT: 0 };
    const seq2 = [0, 0.1, 0.2, 0.3, 0, 0.1].map((v) => { q.chargeT = v; return newRam(r, q); });
    check('a ram is counted once however long the button is held, and the next when it is pressed again', seq2.join() === 'false,true,false,false,false,true' && r.ramId === 2, `(${seq2.join()})`);
  }
}


{
  // where a trial is, in words, for the hero who has found its lantern sealed
  const T = { kind: 'bells', x: 100, z: 200 };
  const at = (x, z) => whereIs(T, { x, z });
  // (the hero stands 100 m from the trial, so that it is in each direction from him in turn: north is -z, so a hero south of it, at z 300, has it to the north)
  const dirs = [[100, 300, 'NORTH'], [29.29, 270.71, 'NORTH-EAST'], [0, 200, 'EAST'], [29.29, 129.29, 'SOUTH-EAST'], [100, 100, 'SOUTH'], [170.71, 129.29, 'SOUTH-WEST'], [200, 200, 'WEST'], [170.71, 270.71, 'NORTH-WEST']];
  const said = dirs.map(([x, z]) => at(x, z));
  check('whereIs: north is -z and east +x (a hero south of it has it to the north), in eight directions, at 100 m', said.every((w, i) => w === `100 M TO THE ${dirs[i][2]}`), `(${said.join(' | ')})`);
  check('whereIs: nothing when the trial is in sight (within 22 m), and beyond it a distance to the nearest 5 m', at(100, 215) === '' && at(100, 221) === '' && at(100, 223) === '25 M TO THE NORTH' && at(100, 241) === '40 M TO THE NORTH' && at(100, 300) === '100 M TO THE NORTH', `(${at(100, 221)} | ${at(100, 223)} | ${at(100, 241)})`);
  const C = { kind: 'circuit', x: 0, z: 0, pylons: [0, 50, 100, 150, 200].map((x) => ({ x, z: 0 })) };
  check('whereIs: a circuit is found by its nearest pylon (not its first)', whereIs(C, { x: 160, z: 60 }) === '60 M TO THE NORTH', `(${whereIs(C, { x: 160, z: 60 })})`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall trial checks passed');
process.exit(failed ? 1 : 0);
