// What every trial's machine is made of. Pure: no three, no DOM, no Math.random (a machine asks `ctx.rng`), so that a trial can be played in Node by a model of the hero (tools/trial-test.mjs)
// and plays the same in the game (systems/trials.js).
//
// The shape of a trial `t` (a record the TrialSystem makes from the level's `gp.trials` and the machines add to in `init`):
//   id kind goal (the id of the lantern it seals) x y z (its middle: where the hero is told to come) yaw, the kind's own parts (bells, plates, pylons...), and
//   state ('idle' | 'active' | 'solved'), t (seconds since it was made)
// The `ctx` a machine is stepped with:
//   p        the hero: the Player (or a model of it): x y z yaw dirx dirz grounded flameT chargeT, flameHits(x, y, z, r, dy), chargeHits(x, y, z, r)
//   rng()    a number in [0, 1)
//   emit(type, data)   what a machine says goes through this; the system plays the sounds, draws the lights and (on 'solved') breaks the seal and lights the lantern
//   spawn(kind, x, z) -> handle, alive(handle), dismiss(handle)   foes for a trial that brings its own (siege), foe state for one that waits for a foe's fall (thief)
// The events a machine says (`by` is the trial):
//   note {i, ok?}       a bell rings (the tune, or the hero's)            turn {}              it is his turn now          miss {i?}       a wrong step
//   press {i, on}       a plate is pressed                                 start {}              a clock starts               pylon {i}       a pylon is touched
//   hit {i}             a wisp is burnt                                    goal {score}          the puck is in             fail {why}      it begins again
//   turn_mirror {i}     a mirror turned                                    wave {k}              a wave comes                solved {}        the seal is broken

export const hyp = Math.hypot;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const bearing = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

/** a seeded random (so that a puzzle built from a seed is the same puzzle: the tests and the tools replay it) */
export function lcg(seed) {
  let s = (Math.imul(seed | 0, 2654435761) >>> 0) || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
/** a random whole number in [0, n) */
export const pick = (rng, n) => Math.min(n - 1, Math.floor(rng() * n));

/** the point `d` metres from (x, z) at heading `a` (forward is (sin a, cos a)) */
export const polar = (x, z, a, d) => [x + Math.sin(a) * d, z + Math.cos(a) * d];

/** `n` points on an arc of radius `r` round (cx, cz), from heading `a0` to `a1` (a full circle of n points when a1 - a0 is 2 PI: the last is not repeated) */
export function arcPoints(cx, cz, r, a0, a1, n) {
  const full = Math.abs(Math.abs(a1 - a0) - Math.PI * 2) < 1e-6, out = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (full ? n : n - 1));
    out.push(polar(cx, cz, a, r));
  }
  return out;
}

/**
 * Has the hero just begun a breath of fire? (A hit by the flame counts once a breath, not once a frame: the Player's `flameT` jumps up when a breath begins and runs down while it lasts.)
 * `t.prevFlame` is the machine's memory of it; call once a step, before anything else reads it.
 */
export function newBreath(t, p) {
  const fresh = p.flameT > (t.prevFlame || 0) + 1e-6;
  t.prevFlame = p.flameT || 0;
  if (fresh) t.breathHit = false;
  return fresh;
}

/**
 * Has the hero just begun a ram? (A charge lasts as long as the button is held, so a thing that a ram turns is turned once a RAM and not once a frame: `t.ramId` counts the rams he has made.
 * Call once a step, before anything else reads it.)
 */
export function newRam(t, p) {
  const fresh = p.chargeT > 0 && !(t.prevCharge > 0);
  t.prevCharge = p.chargeT || 0;
  if (fresh) t.ramId = (t.ramId || 0) + 1;
  return fresh;
}

/** which of `things` ({ x, y, z, r }) is the one the hero's flame is on: the nearest to where he faces among those it reaches (one thing a breath), or -1 */
export function flamedOne(p, things, { dy = 2.6, y = 1.0, skip = null } = {}) {
  let best = -1, bestA = Infinity;
  for (let i = 0; i < things.length; i++) {
    const b = things[i];
    if (skip && skip(i)) continue;
    if (!p.flameHits(b.x, (b.y || 0) + y, b.z, b.r ?? 0.9, dy)) continue;
    const a = Math.abs(wrap(bearing(p.x, p.z, b.x, b.z) - p.yaw));
    if (a < bestA) { bestA = a; best = i; }
  }
  return best;
}
