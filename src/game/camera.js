// Third-person chase camera (orbit + gentle auto-follow), obstruction avoidance, FOV kicks, screen shake, and a
// cinematic mode driven by a path function (intro fly-through, sunrise finale, title orbit).
import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

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
    this.look = new THREE.Vector3();
    this.snapNext = true;
    this._tmp = new THREE.Vector3();
  }

  /** Jump the camera behind the player instantly. */
  snapBehind(player) {
    this.yaw = player.yaw;
    this.pitch = 0.3;
    this.snapNext = true;
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
    const inv = this.game.gfx.settings.invertY ? -1 : 1;

    // ---- manual control -------------------------------------------------------------------------------------
    const look = input.takeLook();
    const sl = input.stickLook;
    let manual = false;
    if (look.x || look.y) { this.yaw -= look.x; this.pitch += look.y * inv; manual = true; }
    if (sl.x || sl.y) { this.yaw -= sl.x * 2.3 * dt; this.pitch += sl.y * 1.6 * dt * inv; manual = true; }
    if (input.pressed('camReset')) { this.yaw = player.yaw; this.pitch = 0.32; manual = false; this.lastManual = -10; }
    if (manual) this.lastManual = this.time;
    this.pitch = clamp(this.pitch, -0.12, 1.28);

    // ---- auto follow (only while pushing forward-ish, so strafing never makes the camera chase its tail) ---------
    const moving = player.speed > 1.5 && input.move.y > 0.35 && Math.abs(input.move.x) < 0.7;
    const idleManual = this.time - this.lastManual > 0.9;
    if (idleManual && !player.locked) {
      let rate = 0;
      if (player.gliding) rate = 1.9;
      else if (player.chargeT > 0) rate = 1.6;
      else if (moving && player.grounded) rate = 1.15;
      else if (moving) rate = 0.7;
      if (rate > 0) this.yaw += clamp(angDiff(player.yaw, this.yaw), -rate * dt, rate * dt);
      // drift pitch toward a comfortable value
      const targetPitch = player.gliding ? 0.2 : 0.34 + (player.grounded ? 0 : 0.04);
      this.pitch = lerp(this.pitch, targetPitch, Math.min(1, dt * 0.7));
    }

    // ---- follow target (smooth; vertical is calmer while grounded so jumps don't bob the view) ---------------------
    const gx = pp.x, gy = pp.y + 1.15, gz = pp.z;
    if (this.snapNext) { this.tx = gx; this.ty = gy; this.tz = gz; }
    const kh = 1 - Math.exp(-14 * dt);
    const kv = 1 - Math.exp(-(player.grounded ? 5 : 9) * dt);
    this.tx = lerp(this.tx, gx, kh); this.tz = lerp(this.tz, gz, kh); this.ty = lerp(this.ty, gy, kv);

    // ---- distance / fov by state --------------------------------------------------------------------------------------
    let dTarget = 6.9, fTarget = 57;
    if (player.gliding) { dTarget = 9.2; fTarget = 63; }
    else if (player.chargeT > 0) { dTarget = 8.0; fTarget = 67; }
    else if (!player.grounded) { dTarget = 7.6; }
    this.dist = lerp(this.dist, dTarget, Math.min(1, dt * 2.5));
    this.fov = lerp(this.fov, fTarget, Math.min(1, dt * 4));

    // ---- desired position with obstruction pull-in ------------------------------------------------------------------
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const ax = this.tx, ay = this.ty + 0.25, az = this.tz;     // pivot
    let d = this.dist;
    let cx = ax - fx * d * cp, cy = ay + sp * d, cz = az - fz * d * cp;
    const col = this.game.collision;
    const f = col.rayFraction(ax, ay, az, cx, cy, cz, 0.45);
    if (f < 1) { d = Math.max(1.8, d * f); cx = ax - fx * d * cp; cy = ay + sp * d; cz = az - fz * d * cp; }
    const gh = col.heightAt(cx, cz) + 0.85;
    if (cy < gh) cy = gh;
    if (this.snapNext) this.pos.set(cx, cy, cz);
    else {
      const k = f < 1 ? 1 : 1 - Math.exp(-13 * dt);
      this.pos.x = lerp(this.pos.x, cx, k); this.pos.y = lerp(this.pos.y, cy, k); this.pos.z = lerp(this.pos.z, cz, k);
      if (this.pos.y < gh) this.pos.y = gh;
    }
    // look slightly ahead of the player so the framing feels intentional
    this.look.set(this.tx + Math.sin(player.yaw) * 0.9, this.ty + 0.05, this.tz + Math.cos(player.yaw) * 0.9);
    this.snapNext = false;
    this._apply(dt, false);
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
