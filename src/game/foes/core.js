// What every foe's brain is made of. Pure: no three, no DOM, no Math.random (a brain asks `ctx.rng`), so that a brain can be played in Node against a model of the hero (tools/foe-test.mjs)
// and must play the same in the game (systems/enemies.js).
//
// The shape of a foe `e` (a record the EnemySystem makes; the brains add what they need in `init`):
//   x y z (feet) yaw (forward is (sin yaw, cos yaw)) hx hz (home) hp r h cy (the height of its middle over its feet) state st (seconds in the state) t wild patrolR tx tz K (its row of KINDS)
// The `ctx` a brain is stepped with:
//   hero { x, y, z, r, dead, ram (he is charging), vx, vz }   rng()   floorAt(x, z)   emit(type, data)   dismiss(e)   alive(e)
//   move(e, vx, vz, dt) -> 0..1: how much of the step it got along its direction; the step is made only if it got at least half of it (a Ramhog that gets less than that while it runs has hit something)
// What a brain says goes through `ctx.emit`; the system plays the sounds, spawns the dust and hurts the hero on 'hurt'. The kinds of event are listed in foes/index.js.

export const hyp = Math.hypot;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/** The yaw that looks from (x, z) at (tx, tz). */
export const bearing = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
/** `yaw` turned towards `to` by at most `rate` radians a second. */
export const turnTo = (yaw, to, rate, dt) => yaw + clamp(wrap(to - yaw), -rate * dt, rate * dt);

/**
 * Which side of foe `e` the point (x, z) is on: 'front' within `half` radians of where it faces, 'back' within `half` of where it does not face, else 'side'. (The default half is 55 degrees: a
 * quarter of the circle in front, a quarter behind, a quarter to each side.)
 */
export function sideOf(e, x, z, half = 0.96) {
  const d = Math.abs(wrap(bearing(e.x, e.z, x, z) - e.yaw));
  return d < half ? 'front' : d > Math.PI - half ? 'back' : 'side';
}

/**
 * Move `e` at `speed` along `heading`, or as near to it as the ground lets it (a foe that runs away must not run into a rock and stop): the heading first, then 35, 70 and 100 degrees to either
 * side, the side that worked last time first. Returns the heading it took (null if it could not move at all). (`ctx.move` only commits a step that got at least half of the way.)
 */
const OFFSETS = [0.6, 1.2, 1.75];
export function steer(e, ctx, heading, speed, dt) {
  if (ctx.move(e, Math.sin(heading) * speed, Math.cos(heading) * speed, dt) >= 0.5) return heading;
  const side = e.steerSide || 1;
  for (const o of OFFSETS) {
    for (const s of [side, -side]) {
      const h = heading + o * s;
      if (ctx.move(e, Math.sin(h) * speed, Math.cos(h) * speed, dt) >= 0.5) { e.steerSide = s; return h; }
    }
  }
  return null;
}

/** A foe that has not noticed the hero loiters round its home (the old Snuffers' idle). True on the step it notices him. */
export function loiter(e, dt, ctx, speed = e.K.speed * 0.35) {
  const hero = ctx.hero;
  e.speedNow = 0;
  if (!hero.dead && hyp(hero.x - e.x, hero.z - e.z) < e.K.notice) return true;
  e.st -= dt;
  const d = hyp(e.tx - e.x, e.tz - e.z);
  if (d < 0.6 || e.st <= -6) {
    const a = ctx.rng() * 6.28, r = ctx.rng() * e.patrolR;
    e.tx = e.hx + Math.cos(a) * r; e.tz = e.hz + Math.sin(a) * r; e.st = 2 + ctx.rng() * 3;
  }
  if (e.st > 0 && d > 0.6) {
    e.yaw = turnTo(e.yaw, bearing(e.x, e.z, e.tx, e.tz), 5, dt);
    ctx.move(e, Math.sin(e.yaw) * speed, Math.cos(e.yaw) * speed, dt);
    e.speedNow = speed;
  }
  return false;
}

/** The start of a foe's fight: it has seen the hero; for `secs` it turns to him with its alarm up. */
export function startAlert(e, ctx, secs = 0.42) {
  e.state = 'alert'; e.st = secs; e.alert = 1;
  ctx.emit('alert', { x: e.x, z: e.z });
}

/** The alarm over: true when it is time for the foe's own state. */
export function stepAlert(e, dt, ctx, turn = 10) {
  e.st -= dt;
  e.alert = Math.max(0, e.st / 0.42);
  e.yaw = turnTo(e.yaw, bearing(e.x, e.z, ctx.hero.x, ctx.hero.z), turn, dt);
  if (e.st <= 0) { e.alert = 0; return true; }
  return false;
}

/**
 * A foe that keeps its distance (the Slinger, the Smokecaller): it faces the hero, backs off when he is nearer than `min` (in a panic, quicker, when he is nearer than `panicR`), comes
 * on when he is further than `max`, and otherwise stands. Returns the distance to the hero. (It is always slower than a run: a hero can always catch what keeps away from him.)
 */
export function kite(e, dt, ctx, { min, max, walk, back, panicR, panic, panicT }) {
  const hero = ctx.hero;
  const dx = hero.x - e.x, dz = hero.z - e.z, dp = hyp(dx, dz);
  const to = bearing(e.x, e.z, hero.x, hero.z);
  e.speedNow = 0;
  if (dp < panicR && !(e.panicT > 0)) e.panicT = panicT;
  if (e.panicT > 0) {
    e.panicT -= dt;
    const h = steer(e, ctx, to + Math.PI, panic, dt);
    if (h !== null) { e.speedNow = panic; e.yaw = turnTo(e.yaw, h + Math.PI, 8, dt); } else e.yaw = turnTo(e.yaw, to, 8, dt);
    return dp;
  }
  e.yaw = turnTo(e.yaw, to, 7, dt);
  if (dp < min) { if (steer(e, ctx, to + Math.PI, back, dt) !== null) e.speedNow = back; }
  else if (dp > max) { if (steer(e, ctx, to, walk, dt) !== null) e.speedNow = walk; }
  return dp;
}

/** Back to its post: the foe walks home and sleeps again (true when it is there). */
export function goHome(e, dt, ctx, speed) {
  const d = hyp(e.hx - e.x, e.hz - e.z);
  if (d < 1.2) return true;
  const h = steer(e, ctx, bearing(e.x, e.z, e.hx, e.hz), speed, dt);
  if (h !== null) e.yaw = turnTo(e.yaw, h, 6, dt);
  e.speedNow = speed;
  return false;
}
