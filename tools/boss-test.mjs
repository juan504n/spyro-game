// The Guardian's brain (src/game/guardian/brain.js) proved with no browser and no server: the pure state machine of the fight, stepped at the game's 60 Hz against a hero that is only a position.
//   * asleep until the hero comes to the court, a roar, then the fight; asleep again when he leaves; set back to the start of the phase when he dies
//   * the slam: shown at least a second before it can hurt, a circle that a hero who keeps moving is never under, a shockwave a jump clears; the fist that has landed is stuck, and only a ram (and only a
//     stuck fist) cracks it; both gone and the Guardian stoops
//   * the stoop: the crown comes down, the window, the flame that adds up touch by touch, the lantern that lights (and the window that closes first: the phase begins again), three lanterns and he is free
//   * the other attacks: bolts from the second phase on (a pillar stops them), gloom circles in the third; none before
//   * the same inputs make the same fight, and a hero who cannot be hurt is not hurt
//   node tools/boss-test.mjs
import { GuardianBrain, GUARDIAN as G } from '../src/game/guardian/brain.js';

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };
const f2 = (v) => v.toFixed(2);
const DT = 1 / 60;

const ARENA = { cx: 0, cz: 0, floorAt: () => 0, daisY: 1.4, arenaR: 38, wakeR: 44, leaveR: 50, pillars: Array.from({ length: 8 }, (_, i) => ({ x: Math.cos((i / 8) * Math.PI * 2 + 0.3) * 24, z: Math.sin((i / 8) * Math.PI * 2 + 0.3) * 24, r: 0.9 })) };
const hero = (x, z, y = 0) => ({ x, y, z, r: 0.55, invuln: false });
/** step `secs` seconds; `h` is the hero (or a function of the brain's time), `q` the flame test; returns every event, each with the time it happened */
function run(b, secs, h, q = {}, stopAt = null) {
  const out = [];
  for (let i = 0; i < Math.round(secs / DT); i++) {
    b.step(DT, typeof h === 'function' ? h(b.t) : h, q);
    for (const e of b.events) out.push({ ...e, t: b.t });
    b.events.length = 0;
    if (stopAt && out.some((e) => e.type === stopAt)) break;
  }
  return out;
}
const first = (ev, type) => ev.find((e) => e.type === type);
const count = (ev, type) => ev.filter((e) => e.type === type).length;
const hitsOf = (ev, what) => ev.filter((e) => e.type === 'hit' && e.what === what).length;
/** a brain in the fight, in phase `lit`, at the start of its breather (the hero stands at (x, z)) */
function fighting(lit = 0, x = 10, z = 0) {
  const b = new GuardianBrain(ARENA);
  b.lit = lit;
  b.wake();
  run(b, G.wakeT + 0.05, hero(x, z));
  b.events.length = 0;
  return b;
}
/** crack each fist the moment it lands (a ram on the spot) until the Guardian stoops */
function breakFists(b, h) {
  const out = [];
  for (let i = 0; i < 60 * 40 && b.mode === 'fight'; i++) {
    b.step(DT, h, {});
    for (const e of b.events) { out.push({ ...e, t: b.t }); if (e.type === 'slam') b.ramFist(e.fist); }
    b.events.length = 0;
  }
  return out;
}

// ---- asleep, waking, the fight --------------------------------------------------------------------------------------------------------------
{
  const b = new GuardianBrain(ARENA);
  let ev = run(b, 3, null);
  check('asleep with nobody there: nothing happens, his fists drift', b.mode === 'asleep' && ev.length === 0 && b.fists.every((f) => f.state === 'hover'), `(${b.mode}, ${ev.length} events)`);
  ev = run(b, 2, hero(60, 0));
  check('... and with the hero beyond the court (60 m)', b.mode === 'asleep' && ev.length === 0);
  ev = run(b, 0.2, hero(40, 0));
  check('the hero comes to the court (within 44 m of the dais): he wakes, with a roar (wake)', b.mode === 'waking' && count(ev, 'wake') === 1, `(${b.mode})`);
  ev = run(b, G.wakeT + 0.1, hero(40, 0));
  const began = first(ev, 'phase');
  check('the waking takes 4 s and then the fight begins: phase 0, the fists forming, a breather of 3 s before anything', b.mode === 'fight' && began && began.phase === 0 && !first(ev, 'slam-telegraph'), `(${b.mode})`);
  ev = run(b, G.breather + G.firstSlam + 0.1, hero(40, 0));
  const tel = first(ev, 'slam-telegraph');
  check('the first slam is shown 4.2 s into the phase (3 s of quiet, then 1.2 s), at the place the hero is (the arena\'s edge, 35 m out: he stands at 40)', !!tel && Math.abs(tel.t - began.t - (G.breather + G.firstSlam)) < 0.1 && Math.hypot(tel.x - 35, tel.z) < 1.5, `(${tel && f2(tel.t - began.t)} s into the phase, x ${tel && f2(tel.x)})`);
  const far = new GuardianBrain(ARENA);
  far.wake(); run(far, 6, hero(40, 0));
  run(far, 1, hero(55, 0));
  const asleep = far.mode === 'asleep';
  run(far, 0.1, hero(30, 0));
  check('he sleeps again when the hero leaves the court (beyond 50 m), and wakes when he comes back', asleep && far.mode === 'waking', `(${asleep ? 'asleep' : 'not asleep'}, then ${far.mode})`);
}

// ---- the slam ---------------------------------------------------------------------------------------------------------------------------------
{
  const b = fighting(0, 10, 0);
  const ev = run(b, 8, hero(10, 0));
  const tel = first(ev, 'slam-telegraph'), lock = first(ev, 'slam-lock'), hit = first(ev, 'hit'), slam = first(ev, 'slam');
  check('a hero who stands still is hit by the slam (what: slam), at the moment the fist lands', !!hit && hit.what === 'slam' && !!slam && Math.abs(hit.t - slam.t) < 1e-9, `(hit ${hit && hit.what} at ${hit && f2(hit.t)})`);
  check('the slam is shown at least a second before it can hurt (2.1 s from the first sign, 0.77 s from the lock)', hit.t - tel.t >= 2.0 && hit.t - lock.t >= 0.75, `(${f2(hit.t - tel.t)} s from the first sign, ${f2(hit.t - lock.t)} s from the lock)`);
  // a hero who keeps moving is never under it: round the dais at 18 m at a run (11.5 m/s) through five slams
  const c = fighting(0, 18, 0);
  const lap = (t) => { const a = (t * 11.5) / 18; return hero(Math.cos(a) * 18, Math.sin(a) * 18); };
  const ev2 = run(c, 24, lap);
  check('a hero who keeps running is never under a fist (the circle follows at 8 m/s, he runs at 11.5): five slams, none of them hits', count(ev2, 'slam') >= 5 && hitsOf(ev2, 'slam') === 0, `(${count(ev2, 'slam')} slams, ${hitsOf(ev2, 'slam')} hit by a slam)`);
}

// ---- the shockwave ----------------------------------------------------------------------------------------------------------------------------
{
  const a = fighting(0, 10, 0);
  a.slamT = 99;                                                    // (no slam of its own: only the ring that is put there)
  a.waves.push({ x: 0, z: 0, r: 5, max: 12, hit: false });
  let ev = run(a, 1.5, hero(10, 0, 0));
  check('a shockwave reaches a hero standing on the floor and hurts him (what: wave), once', hitsOf(ev, 'wave') === 1, `(${hitsOf(ev, 'wave')} hits)`);
  const c = fighting(0, 10, 0);
  c.slamT = 99;
  c.waves.push({ x: 0, z: 0, r: 5, max: 12, hit: false });
  ev = run(c, 1.5, hero(10, 0, 1.2));
  check('... and a hero in the air (feet 1.2 m up: over its 0.8 m) goes over it', hitsOf(ev, 'wave') === 0, `(${hitsOf(ev, 'wave')} hits)`);
  const d = fighting(0, 10, 0);
  d.slamT = 99;
  d.waves.push({ x: 0, z: 0, r: 5, max: 12, hit: false });
  run(d, 3, hero(10, 0, 1.2));
  check('a ring that has reached its radius is gone (nothing lingers)', d.waves.length === 0, `(${d.waves.length} rings)`);
  // a ring dies out: a hero 20 m from where a slam landed is not reached by it in any phase (it reaches 9, 14 and 16 m)
  for (const lit of [0, 1, 2]) {
    const r = fighting(lit, 30, 0);
    run(r, 12, hero(30, 0), {}, 'slam');                           // (the first slam lands on him)
    const far = run(r, 3, hero(30, 20));                           // (and he is 20 m away before the ring has gone a few metres: the next slam is a couple of seconds off; only that first ring is counted)
    const fromFirst = far.filter((e) => e.type === 'hit' && e.what === 'wave' && Math.hypot(e.fx - 30, e.fz) < 1.5).length;
    check(`a ring dies out: 20 m from where the slam landed the hero is not reached by it (phase ${lit}, it reaches ${G.slam.waveMax[lit]} m)`, fromFirst === 0, `(${fromFirst} hits from the first ring)`);
  }
  const e = fighting(0, 10, 0);
  e.slamT = 99;
  e.waves.push({ x: 0, z: 0, r: 5, max: 12, hit: false });
  ev = run(e, 1.5, { x: 10, y: 0, z: 0, r: 0.55, invuln: true });
  check('a hero who is blinking untouchable (after a hit) is not hurt by the ring that runs over him', hitsOf(ev, 'wave') === 0 && count(ev, 'hit') === 0, `(${hitsOf(ev, 'wave')} hits)`);
}

// ---- the stuck fist and the ram ---------------------------------------------------------------------------------------------------------------
{
  const b = fighting(0, 10, 0);
  check('a fist that is hovering (not stuck) is not cracked by a ram', b.ramFist(0) === false && b.ramFist(1) === false && b.fistsLeft === 2);
  let ev = run(b, 8, hero(30, 0), {}, 'slam');
  const s = first(ev, 'slam');
  const f = b.fists[s.fist];
  check('a fist that has landed is stuck (for 4.2 s), where it came down', f.state === 'stuck' && Math.hypot(f.x - s.x, f.z - s.z) < 1e-9, `(${f.state})`);
  const other = b.fists[1 - s.fist];
  check('... and the other is not: a ram at it does nothing, a ram at the stuck one cracks it (crack)', b.ramFist(other.id) === false && b.ramFist(f.id) === true && f.state === 'cracked', `(${f.state})`);
  run(b, 1.0, hero(30, 0));
  check('a cracked fist is gone after 0.9 s, one is left, and the fight goes on', f.state === 'gone' && b.fistsLeft === 1 && b.mode === 'fight', `(${f.state}, ${b.fistsLeft} left)`);
  const c = fighting(0, 10, 0);
  ev = run(c, 12, hero(30, 0), {}, 'fist-free');
  check('a stuck fist that is not broken pulls free after 4.2 s (fist-free) and goes back to its orbit', !!first(ev, 'fist-free') && Math.abs(first(ev, 'fist-free').t - first(ev, 'slam').t - G.fist.stuckT[0]) < 0.05, `(${f2(first(ev, 'fist-free').t - first(ev, 'slam').t)} s)`);
}

// ---- the stoop, the window, the lanterns ---------------------------------------------------------------------------------------------------------
{
  const b = fighting(0, 30, 0);
  const ev = breakFists(b, hero(30, 0, 0));
  check('both fists cracked: the Guardian stoops (stoop), the crown to come down from 15 m to 3.2 m', b.mode === 'stoop' && !!first(ev, 'stoop') && count(ev, 'crack') === 2, `(${b.mode}, ${count(ev, 'crack')} cracks)`);
  const e2 = run(b, G.stoop.downT + 0.05, hero(30, 0));
  check('then the window opens: the crown is down, and the first lantern, the one on the south side (the stair), is the one that counts', b.sub === 'window' && Math.abs(b.crown - G.crownDown) < 1e-6 && !!first(e2, 'window') && b.lanternPos(0).z > 2, `(sub ${b.sub}, crown ${f2(b.crown)}, lantern z ${f2(b.lanternPos(0).z)})`);
  let on = false, tt = 0;
  const e3 = [];
  for (let i = 0; i < 60 * 6 && b.mode === 'stoop'; i++) { tt += DT; on = (Math.floor(tt / 0.4) % 2) === 0; b.step(DT, hero(30, 0), { flameHits: () => on }); for (const x of b.events) e3.push({ ...x, t: b.t }); b.events.length = 0; }
  const lit = first(e3, 'lit');
  check('a flame on it 0.4 s at a time lights it when the touching adds up to 1.4 s (a contact for each touch): lit 1', !!lit && lit.n === 1 && b.lit === 1 && count(e3, 'contact') >= 3, `(lit ${lit && lit.n}, ${count(e3, 'contact')} touches, after ${lit && f2(lit.t - first(e2, 'window').t)} s of window)`);
  const e4 = run(b, G.stoop.upT + 0.05, hero(30, 0));
  check('the Guardian rises and the next phase begins (phase 1, the fists forming again), the lantern still lit', b.mode === 'fight' && b.lit === 1 && b.phase === 1 && first(e4, 'phase') && first(e4, 'phase').phase === 1 && Math.abs(b.crown - G.crownRest) < 1e-6, `(${b.mode}, phase ${b.phase})`);
}
{
  const b = fighting(0, 30, 0);
  breakFists(b, hero(30, 0));
  const ev = run(b, G.stoop.downT + G.stoop.window + 0.1, hero(30, 0));
  check('a window of nine seconds that runs out with no flame on the lantern: window-lost, and the Guardian rises', !!first(ev, 'window-lost') && Math.abs(first(ev, 'window-lost').t - first(ev, 'window').t - G.stoop.window) < 0.05 && b.mode === 'rising', `(${b.mode})`);
  run(b, G.stoop.upT + 0.05, hero(30, 0));
  check('... and the same phase begins again (no lantern lit, new fists formed)', b.mode === 'fight' && b.lit === 0 && b.fistsLeft === 2 && b.phase === 0, `(${b.mode}, lit ${b.lit}, ${b.fistsLeft} fists)`);
}
{
  const b = fighting(0, 30, 0);
  const all = [];
  for (let k = 0; k < 3; k++) {
    all.push(...breakFists(b, hero(30, 0)));
    all.push(...run(b, G.stoop.downT + 0.05, hero(30, 0)));
    all.push(...run(b, 3, hero(30, 0), { flameHits: () => true }));
    all.push(...run(b, G.stoop.upT + 0.05, hero(30, 0)));
  }
  const lits = all.filter((e) => e.type === 'lit').map((e) => e.n).join();
  check('three lanterns lit in turn (1, 2, 3) and the Guardian is free (freed): the crown up', lits === '1,2,3' && b.mode === 'freed' && !!first(all, 'freed') && b.lit === 3, `(lit ${lits}, ${b.mode})`);
  const quiet = run(b, 10, hero(10, 0));
  check('a freed Guardian does nothing more (not a slam, not a bolt), with the hero beside him', quiet.length === 0 && b.waves.length + b.bolts.length + b.circles.length === 0, `(${quiet.length} events)`);
  b.sleep(); b.resetPhase();
  check('... and nothing makes him fight again (leaving the court, a reset)', b.mode === 'freed');
}

// ---- the other attacks, by phase -----------------------------------------------------------------------------------------------------------------
{
  const survey = (lit) => run(fighting(lit, 30, 0), 40, hero(30, 0, 0));
  const p0 = survey(0), p1 = survey(1), p2 = survey(2);
  check('phase 0: slams only (no bolt, no gloom in 40 s)', count(p0, 'slam') > 0 && count(p0, 'bolt') === 0 && count(p0, 'gloom') === 0, `(${count(p0, 'slam')} slams)`);
  check('phase 1 adds the rune bolts (the visor charging before each), still no gloom', count(p1, 'bolt') >= 5 && count(p1, 'bolt-charge') >= 5 && count(p1, 'gloom') === 0, `(${count(p1, 'bolt')} bolts)`);
  check('phase 2 adds the gloom circles (five at a time, a round every 6 s) to the slams and the bolts', count(p2, 'gloom') >= 3 && count(p2, 'gloom-burst') >= 15 && count(p2, 'bolt') >= 4 && count(p2, 'slam') > 0, `(${count(p2, 'gloom')} rounds, ${count(p2, 'gloom-burst')} bursts)`);
  const bc = first(p1, 'bolt-charge'), bf = first(p1, 'bolt');
  check('the bolt flies 1.2 s after the visor begins to glow', Math.abs(bf.t - bc.t - G.bolt.chargeT) < 0.03, `(${f2(bf.t - bc.t)} s)`);
  const open = run(fighting(1, 30, 0), 10, hero(30, 0));
  check('a bolt with nothing in its way hits a hero who stands in it (what: bolt)', hitsOf(open, 'bolt') >= 1, `(${open.filter((e) => e.type === 'hit').map((e) => e.what).join()})`);
  const pillar = ARENA.pillars[0];
  const behind = run(fighting(1, 30, 0), 10, hero(pillar.x * 1.45, pillar.z * 1.45));
  check('... and a pillar between the dais and him stops it: it bursts on the stone and he is not hurt by it', count(behind, 'bolt-burst') >= 1 && hitsOf(behind, 'bolt') === 0, `(${count(behind, 'bolt-burst')} bursts, ${hitsOf(behind, 'bolt')} bolt hits)`);
  const stay = run(fighting(2, 30, 0), 12, hero(30, 0));
  check('a gloom circle opens under the hero and bursts 1.4 s after: a hero who stays is hurt (what: gloom)', hitsOf(stay, 'gloom') >= 1 && G.gloom.warnT >= 1.4, `(${hitsOf(stay, 'gloom')} hits)`);
  const gw = first(stay, 'gloom'), gb = first(stay, 'gloom-burst');
  check('... 1.4 s after the first rune is shown', Math.abs(gb.t - gw.t - G.gloom.warnT) < 0.03, `(${f2(gb.t - gw.t)} s)`);
}

// ---- death, a hero who cannot be hurt, determinism ----------------------------------------------------------------------------------------------
{
  const b = fighting(1, 30, 0);
  run(b, 9, hero(30, 0));
  b.resetPhase();
  const ev = run(b, 0.1, hero(30, 0));
  check('the hero dies: the phase begins again (reset), the same lanterns lit, the fists formed anew, nothing left flying', !!first(ev, 'reset') && first(ev, 'phase') && first(ev, 'phase').phase === 1 && b.lit === 1 && b.fistsLeft === 2 && b.bolts.length === 0 && b.circles.length === 0 && b.waves.length === 0, `(lit ${b.lit}, ${b.fistsLeft} fists)`);
  const inv = fighting(2, 30, 0);
  const ev2 = run(inv, 30, { x: 30, y: 0, z: 0, r: 0.55, invuln: true });
  check('a hero who cannot be hurt (the blink after a hit) is not hurt, whatever lands on him', count(ev2, 'hit') === 0 && count(ev2, 'slam') > 0, `(${count(ev2, 'slam')} slams, ${count(ev2, 'hit')} hits)`);
  const invB = run(fighting(1, 30, 0), 12, { x: 30, y: 0, z: 0, r: 0.55, invuln: true });
  check('... nor by a bolt that flies into him (it still bursts)', hitsOf(invB, 'bolt') === 0 && count(invB, 'bolt-burst') >= 1, `(${count(invB, 'bolt')} bolts, ${count(invB, 'bolt-burst')} bursts, ${hitsOf(invB, 'bolt')} hits)`);
  const invG = run(fighting(2, 30, 0), 14, { x: 30, y: 0, z: 0, r: 0.55, invuln: true });
  check('... nor by a circle of gloom that bursts under him', hitsOf(invG, 'gloom') === 0 && count(invG, 'gloom-burst') >= 5, `(${count(invG, 'gloom-burst')} bursts, ${hitsOf(invG, 'gloom')} hits)`);
  // (and the same three, to a hero who can be hurt, do hurt: the checks above are not empty)
  const hurt = run(fighting(2, 30, 0), 30, hero(30, 0));
  check('(the same hero without the blink is hit by all of them: a slam, a bolt and a circle of gloom)', hitsOf(hurt, 'slam') >= 1 && hitsOf(hurt, 'bolt') >= 1 && hitsOf(hurt, 'gloom') >= 1, `(${hitsOf(hurt, 'slam')} slam, ${hitsOf(hurt, 'bolt')} bolt, ${hitsOf(hurt, 'gloom')} gloom)`);
  const script = (t) => hero(Math.cos(t * 0.6) * 20, Math.sin(t * 0.6) * 20);
  const A = JSON.stringify(run(fighting(2, 20, 0), 25, script)), B = JSON.stringify(run(fighting(2, 20, 0), 25, script));
  check('the same hero does the same fight twice: the same events at the same moments (no random numbers but the brain\'s own)', A === B && A.length > 200, `(${A.length} bytes)`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall boss checks passed');
process.exit(failed ? 1 : 0);
