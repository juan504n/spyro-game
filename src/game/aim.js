// Aim assist for the fire breath (pure maths, so it can be tested without a game).
//
// Spyro breathes where he faces and, with camera-relative steering, turning him to face one particular brazier or Snuffer takes a
// steady thumb (harder still on a touch screen). While he breathes fire he now also turns towards whatever burnable thing is in front of
// him, if there is one inside a wide cone and in range: he never turns away from where you point him, and the stick still has the last
// word (see Player._aimAssist).
export const AIM = {
  cone: 1.15,      // rad: how far off his facing a target may be and still be helped (66 degrees; the flame itself only reaches ~40)
  rate: 5.5,       // rad/s: how fast he swings round to it
  range: 7.5,      // m: a little more than the flame's reach
  minDist: 0.6,
};

const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

/**
 * Bearing (radians, the same atan2(dx, dz) convention as Player.yaw) of the target closest to straight ahead of (x, z) facing `yaw`,
 * or null when nothing is inside the cone. targets: [{ x, z, r }] (r = its radius, which extends the range).
 */
export function aimBearing(x, z, yaw, targets, o = AIM) {
  let best = null, bestErr = o.cone;
  for (const t of targets) {
    const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz);
    if (d < o.minDist || d > o.range + (t.r || 0)) continue;
    const b = Math.atan2(dx, dz);
    const err = Math.abs(angDiff(b, yaw));
    if (err < bestErr) { bestErr = err; best = b; }
  }
  return best;
}

/** One step of the assist: the new yaw, turned towards `bearing` by at most rate * dt (and never past it). */
export function aimStep(yaw, bearing, dt, o = AIM) {
  const d = angDiff(bearing, yaw);
  return yaw + Math.max(-o.rate * dt, Math.min(o.rate * dt, d));
}
