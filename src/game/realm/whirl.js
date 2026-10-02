// WHIRLWINDS: updrafts that carry the hero up (the new mechanic of Skyweaver Spires, and one the PlayStation hubs used: "up a tower by a whirlwind"). Pure functions of a whirlwind's data - no three, no DOM -
// shared by the game (player.js asks `whirlStep` once a step; systems/objects.js draws the funnel) and the Node tools (the checker works out where a ride ends, tools/lib/air.mjs; a test runs the real
// Player in one, tools/whirl-test.mjs).
//
//   a whirlwind: { id, x, z, y0 (the ground at its foot), h (the height of the column), r (its radius at the foot) }
//
// The column widens as it rises (to WIDEN x r at the top). A hero inside it - within the radius it has at his height, from a little under its foot to a little over its top - is carried up at
// `lift` m/s, the speed eased to nothing over the last `ease` metres below the top, so that he HOVERS at the top, y0 + h, where he can press jump and glide out. It lifts a hero standing in
// its foot off the ground (walking into one is enough), takes his running speed away (the air is thick) and draws him gently towards its axis, so that a hero who walks in at the edge is
// carried, not thrown out. Gravity is the column's own while he is in it: the player does not apply it (player.js). A hero gliding through a whirlwind is lifted too (a glide over one gains height).
export const WHIRL = {
  lift: 11,          // m/s, the speed of the ride
  ease: 6,           // m below the top over which it eases to a hover
  k: 6,              // 1/s, how quickly his vertical speed follows the column's
  widen: 1.7,        // the radius at the top, in radii of the foot
  damp: 4,           // 1/s, the horizontal speed a hero who is not gliding loses inside it
  hold: 0.35,        // the share of his running speed he has inside it (a hero who runs into one and keeps the stick pushed is slowed, lifted and let go at the far side, not thrown through)
  pull: 24,          // m/s^2 towards the axis at the edge (less nearer the middle)
  under: 0.6,        // m under the foot at which it already takes hold
  over: 1.5,         // m over the top where it still holds
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** the radius of the column at height y */
export const radiusAt = (w, y) => w.r * (1 + (WHIRL.widen - 1) * clamp01((y - w.y0) / w.h));
/** where the hero hovers at the top */
export const apexOf = (w) => w.y0 + w.h;
/** inside the column at (x, y, z)? { d: the distance from its axis, r: the radius it has there } or null */
export function whirlAt(w, x, y, z) {
  if (y < w.y0 - WHIRL.under || y > w.y0 + w.h + WHIRL.over) return null;
  const d = Math.hypot(x - w.x, z - w.z), r = radiusAt(w, y);
  return d < r ? { d, r } : null;
}
/** the vertical speed the column drives a hero at height y towards: the lift, eased to a hover over the last metres below the top */
export const liftSpeed = (w, y) => WHIRL.lift * clamp01((apexOf(w) - y) / WHIRL.ease);

/** does a whirlwind of `list` hold the body at its position? (the player's running speed is cut while it does: WHIRL.hold) */
export function whirlHolds(list, p) {
  for (let i = 0; i < list.length; i++) if (whirlAt(list[i], p.x, p.y, p.z)) return true;
  return false;
}

/**
 * One step of the updraft on a body `p` ({ x, y, z, vx, vy, vz, grounded, gliding, jumpsUsed }): true if a whirlwind of `list` holds it (the caller then skips gravity), false if none does.
 * Called by Player.update after the horizontal velocity is worked out and before gravity.
 */
export function whirlStep(list, p, dt) {
  for (let i = 0; i < list.length; i++) {
    const w = list[i], q = whirlAt(w, p.x, p.y, p.z);
    if (!q) continue;
    p.vy += (liftSpeed(w, p.y) - p.vy) * (1 - Math.exp(-WHIRL.k * dt));
    if (p.grounded && p.vy > 0.5) { p.grounded = false; p.y += 0.02; }                  // (lifted off the ground he stands on)
    if (p.jumpsUsed < 1) p.jumpsUsed = 1;                                                // (so that he may press jump at the top and glide out: a glide needs a jump used)
    if (!p.gliding) {
      const k = Math.exp(-WHIRL.damp * dt);
      p.vx *= k; p.vz *= k;
    }
    if (q.d > 0.05) {
      const a = WHIRL.pull * clamp01(q.d / q.r) * dt;
      p.vx -= ((p.x - w.x) / q.d) * a; p.vz -= ((p.z - w.z) / q.d) * a;
    }
    return true;
  }
  return false;
}
