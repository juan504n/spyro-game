// Third-person chase camera (orbit + optional auto-follow), obstruction avoidance, FOV kicks, screen shake, and a
// cinematic mode driven by a path function (intro fly-through, sunrise finale, title orbit).
//
// Camera modes (Options > CAMERA, key C), after the original games' Active / Passive camera setting:
//   passive  the view never turns by itself: it follows Spyro's position and only orbits when you steer it (mouse, right stick,
//            Q/E, dragging the right side of the screen) or press R / the CAM button to swing it back behind him.
//   active   the original's Active camera: it swings after Spyro quickly whenever he is steered off to the side.
//   smart    (default) active, but calm: small stick wobbles never move it; pushing forward-and-to-the-side (about 35-75 degrees off
//            straight) turns it after Spyro, the harder the faster; pure sideways (a strafe) and backwards leave it alone. The old
//            camera turned at a fixed rate for ANY forward-ish input, so a thumb resting a few degrees off straight made the
//            view (and, since steering is camera-relative, Spyro's path) creep round in a circle, and every quick turn of Spyro
//            panned the look-at point by up to 15 degrees.
import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export const CAM_MODES = ['smart', 'active', 'passive'];

/**
 * How a mode turns the view after Spyro. The stick angle `a` is measured from straight ahead (0) to sideways (pi/2) to
 * straight back (pi): nothing happens inside `dead`, the turn rate then ramps up to `rate` (rad/s) at `full`, and it only starts
 * after the push has lasted `hold` seconds (so a flick or a hop does not swing the view). From `strafeFrom` to `strafeTo` the
 * turn fades out again: pushing sideways is a strafe and the view stays put (smart); `active` turns for sideways pushes too, as the
 * original's tank-style steering did (Spyro then runs a wide circle with the camera swinging round with him).
 * `glide` / `charge` are the follow rates while those abilities steer Spyro slowly; `look` is how far ahead of Spyro the camera
 * looks (metres), smoothed over ~0.4 s.
 */
export const AUTO = {
  smart: { dead: 0.62, full: 0.95, rate: 1.0, hold: 0.3, strafeFrom: 1.1, strafeTo: 1.4, glide: 1.6, charge: 1.3, look: 0.7, air: false },
  active: { dead: 0.1, full: 1.1, rate: 2.3, hold: 0, strafeFrom: 9, strafeTo: 10, glide: 2.2, charge: 1.9, look: 0.9, air: true },
  passive: { dead: 9, full: 10, rate: 0, hold: 0, strafeFrom: 9, strafeTo: 10, glide: 0, charge: 0, look: 0.35, air: false },
};

export class GameCamera {
  constructor(camera, game) {
    this.cam = camera;
    this.game = game;
    this.yaw = Math.PI;
    this.pitch = 0.34;
    this.dist = 6.9;
    this.fov = 58;
    this.tx = 0; this.ty = 0; this.tz = 0;
    this.px = 0; this.py = 0; this.pz = 0;
    this.lastManual = -10;
    this.time = 0;
    this.shakeT = 0; this.shakeA = 0;
    this.cine = null;
    this.pos = new THREE.Vector3();
    this.off = new THREE.Vector3(0, 2, -6);   // camera minus pivot (smoothed)
    this.look = new THREE.Vector3();
    this.snapNext = true;
    this.pushT = 0;                  // how long the stick has been pushed clearly sideways, on one side (smart mode's hold time)
    this.pushSide = 0;
    this.pull = 1;                   // usable fraction of the camera distance (obstruction pull-in, with a hold before it eases back out)
    this.clearT = 0;
    this.lx = 0; this.lz = 0;        // smoothed look-ahead offset (metres)
    this._tmp = new THREE.Vector3();
  }

  /** the camera mode in force (from the options) */
  get mode() { const m = this.game.gfx?.settings?.camMode; return AUTO[m] ? m : 'smart'; }

  /** Jump the camera behind the player instantly. */
  snapBehind(player) {
    this.yaw = player.yaw;
    this.pitch = 0.3;
    this.snapNext = true;
    this.pushT = 0;
  }

  shake(amount = 0.3, time = 0.3) { this.shakeA = Math.max(this.shakeA, amount); this.shakeT = Math.max(this.shakeT, time); }

  /**
   * Take over with fn(t) -> { pos:[x,y,z], look:[x,y,z], fov } for `duration` seconds (then onDone).
   */
  playCinematic(fn, duration, onDone) { this.cine = { fn, dur: duration, t: 0, onDone }; }
  stopCinematic() { this.cine = null; this.snapNext = true; }
  get inCinematic() { return !!this.cine; }

  update(dt, input, player, alpha) {
    this.time += dt;
    const cam = this.cam;

    if (this.cine) {
      const c = this.cine;
      c.t += dt;
      const k = clamp(c.t / c.dur, 0, 1);
      const r = c.fn(c.t, k);
      this.pos.set(r.pos[0], r.pos[1], r.pos[2]);
      this.look.set(r.look[0], r.look[1], r.look[2]);
      this.fov = lerp(this.fov, r.fov || 58, Math.min(1, dt * 6));
      this._apply(dt, true);
      if (c.t >= c.dur) { const cb = c.onDone; this.cine = null; this.snapNext = true; if (cb) cb(); }
      return;
    }

    const pp = player.renderPos(alpha, this._pp || (this._pp = {}));
    const settings = this.game.gfx.settings;
    const inv = settings.invertY ? -1 : 1;
    const mode = this.mode, A = AUTO[mode];
    const speedK = 0.4 + 1.2 * (Number.isFinite(settings.lookSpeed) ? settings.lookSpeed : 0.5);   // options: CAMERA SPEED

    // ---- manual control -------------------------------------------------------------------------------------
    const look = input.takeLook();
    const sl = input.stickLook;
    let manual = false;
    if (look.x || look.y) { this.yaw -= look.x * speedK; this.pitch += look.y * inv * speedK; manual = true; }
    if (sl.x || sl.y) { this.yaw -= sl.x * 2.3 * dt * speedK; this.pitch += sl.y * 1.6 * dt * inv * speedK; manual = true; }
    if (input.pressed('camReset')) { this.yaw = player.yaw; this.pitch = 0.32; manual = false; this.lastManual = -10; this.pushT = 0; }
    if (manual) { this.lastManual = this.time; this.pushT = 0; }
    this.pitch = clamp(this.pitch, -0.12, 1.28);

    // ---- auto follow ---------------------------------------------------------------------------------------------
    if (mode !== 'passive' && this.time - this.lastManual > 0.9 && !player.locked) this._autoTurn(dt, input, player, A);

    // ---- follow target (smooth; vertical is calmer while grounded so jumps don't bob the view) ---------------------
    const gx = pp.x, gy = pp.y + 1.15, gz = pp.z;
    if (this.snapNext) { this.tx = gx; this.ty = gy; this.tz = gz; }
    const kh = 1 - Math.exp(-14 * dt);
    const kv = 1 - Math.exp(-(player.grounded ? 5 : 9) * dt);
    this.tx = lerp(this.tx, gx, kh); this.tz = lerp(this.tz, gz, kh); this.ty = lerp(this.ty, gy, kv);

    // ---- distance / fov by state (a short hop does not pump the distance) -----------------------------------------------
    let dTarget = 6.9, fTarget = 57;
    if (player.gliding) { dTarget = 9.2; fTarget = 63; }
    else if (player.chargeT > 0) { dTarget = 8.0; fTarget = 67; }
    else if (!player.grounded && (player.airTime || 0) > 0.3) { dTarget = 7.6; }
    else dTarget += 0.9 * smooth(2, 11, player.speed);       // running: sit a little further back (this used to come from the camera lagging behind him)
    this.dist = lerp(this.dist, dTarget, Math.min(1, dt * (dTarget > this.dist ? 2.0 : 1.5)));
    this.fov = lerp(this.fov, fTarget, Math.min(1, dt * 4));

    // ---- desired position with obstruction pull-in ------------------------------------------------------------------
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const ax = this.tx, ay = this.ty + 0.25, az = this.tz;     // pivot
    let d = this.dist;
    let ox = -fx * d * cp, oy = sp * d, oz = -fz * d * cp;      // offset of the camera from the pivot
    const col = this.game.collision;
    const f = col.rayFraction(ax, ay, az, ax + ox, ay + oy, az + oz, 0.45);
    // How much of the full distance is usable. It drops at once when something gets in the way, but climbs back only after the
    // way has been clear for a moment and then gently: passing a row of trees or a fence used to pop the camera in and out
    // once per obstacle, which read as a twitchy camera.
    if (this.snapNext) { this.pull = f; this.clearT = 0; }
    if (f < this.pull) { this.pull = f; this.clearT = 0; }
    else if (f < 1 && f < this.pull + 0.02) this.clearT = 0;                 // (still up against the same obstruction: keep the distance)
    else {
      this.clearT += dt;
      if (this.clearT > 0.4) this.pull = lerp(this.pull, f, 1 - Math.exp(-3.5 * dt));
    }
    if (this.pull < 1) { d = Math.max(1.4, d * this.pull); ox = -fx * d * cp; oy = sp * d; oz = -fz * d * cp; }
    // The camera is smoothed as an OFFSET from the (already smoothed) pivot, not as an absolute position: an absolute lerp trails a
    // running hero by speed / rate metres, and since the rate was switched with the obstruction (42 when blocked, 11 when clear) the
    // trailing distance pumped by ~0.7 m every time something came or went.
    if (this.snapNext) this.off.set(ox, oy, oz);
    else {
      const inward = ox * ox + oy * oy + oz * oz < this.off.lengthSq();
      const k = 1 - Math.exp(-(inward && f < 1 ? 26 : 13) * dt);            // pull in fast (but not in one pop), ease back out gently
      this.off.x = lerp(this.off.x, ox, k); this.off.y = lerp(this.off.y, oy, k); this.off.z = lerp(this.off.z, oz, k);
    }
    this.pos.set(ax + this.off.x, ay + this.off.y, az + this.off.z);
    const gh = col.heightAt(this.pos.x, this.pos.z) + 0.85;
    if (this.pos.y < gh) this.pos.y = gh;
    // look a little ahead of the player so the framing feels intentional. The lead is smoothed: it used to follow Spyro's
    // facing directly, and he turns almost instantly, so every quick turn panned the view by up to ~15 degrees.
    if (this.snapNext) { this.lx = 0; this.lz = 0; }
    const kl = 1 - Math.exp(-2.5 * dt);
    this.lx = lerp(this.lx, Math.sin(player.yaw) * A.look, kl);
    this.lz = lerp(this.lz, Math.cos(player.yaw) * A.look, kl);
    this.look.set(this.tx + this.lx, this.ty + 0.05, this.tz + this.lz);
    this.snapNext = false;
    this._apply(dt, false);
  }

  /**
   * Swing the view after Spyro. Steering is camera-relative, so the stick's angle from straight ahead IS the angle between
   * where he runs and where the camera looks: a rate based on that angle (not on his heading) with a dead zone is what stops a
   * slightly off-centre thumb from spinning the world. While gliding / charging Spyro turns slowly on his own, so there the
   * view follows his real heading instead.
   */
  _autoTurn(dt, input, player, A) {
    const mv = input.move, mag = Math.hypot(mv.x, mv.y);
    const travelling = player.speed > 2 && mag > 0.3 && !(player.hurtT > 0);
    let turn = 0;                                                      // radians this frame (positive = yaw increases = the view turns left)
    if (player.gliding || player.chargeT > 0) {
      const e = angDiff(player.yaw, this.yaw);
      const rate = (player.gliding ? A.glide : A.charge) * smooth(0.1, 0.5, Math.abs(e));
      turn = clamp(e, -rate * dt, rate * dt);
      this.pushT = 0;
    } else if (travelling && (player.grounded || A.air)) {
      const a = Math.atan2(Math.abs(mv.x), mv.y);                      // 0 straight ahead .. pi straight back
      if (a < Math.PI - 0.6 && a > A.dead) {                           // (pushing back towards the camera never spins it)
        const side = Math.sign(mv.x);
        if (side !== this.pushSide) { this.pushSide = side; this.pushT = 0; }     // (a zig-zag has to earn its hold time afresh on each side)
        this.pushT += dt;
        const rate = A.rate * smooth(A.dead, A.full, a) * (1 - smooth(A.strafeFrom, A.strafeTo, a)) * smooth(A.hold, A.hold + 0.3, this.pushT);
        turn = -Math.sign(mv.x) * rate * dt;                           // stick right -> Spyro heads right of the view -> the view turns right
      } else this.pushT = 0;
    } else this.pushT = 0;
    this.yaw += turn;
    // drift the pitch back to a comfortable value while the view is following him
    if (turn !== 0 || (this.mode !== 'passive' && player.gliding)) {
      const targetPitch = player.gliding ? 0.2 : 0.34 + (player.grounded ? 0 : 0.04);
      this.pitch = lerp(this.pitch, targetPitch, Math.min(1, dt * 0.7));
    }
  }

  _apply(dt, cine) {
    const cam = this.cam;
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeA * Math.min(1, this.shakeT * 4);
      sx = (Math.random() - 0.5) * a; sy = (Math.random() - 0.5) * a;
      if (this.shakeT <= 0) this.shakeA = 0;
    }
    cam.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    cam.lookAt(this.look);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    void cine;
  }
}
