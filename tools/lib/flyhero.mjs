// A model of the hero in the air, for the trials that are flown (tools/trial-test.mjs plays the rings against it; tools/lib/realm-rules.mjs holds a course to it): the Player's own numbers (src/game/player.js P) -
// a run, a jump that goes 2.9 m up, a glide that begins with a press of JUMP in the air (not just above the ground) and lasts as long as JUMP is held, 13.5 m/s forward and 3.1 m/s down, steered at 2.7 rad/s;
// and the ground as a function (`floorAt`), which he stands on, walks off (a drop of more than 0.32 m under him and he is in the air, with 0.11 s in which a jump still counts) and lands on.
// The same constants the Player has, so what it says is what the game does within the model: the plays prove that a course can be flown, not that it is fun.
import { DuelHero } from './duel.mjs';

const hyp = Math.hypot;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export const FLY = {
  run: 11.5, accel: 62, brake: 75, airAccel: 34, airDrag: 1.6, gravity: 40, jumpV: 15.2, maxFall: 42, coyote: 0.11, jumpBuffer: 0.13, stepDown: 0.32,
  glideSpeed: 13.5, glideFall: 3.1, glideAccel: 7, turnGround: 17, turnAir: 9, turnGlide: 2.7,
};

export class FlyHero extends DuelHero {
  set(spot) {
    super.set(spot);
    this.gliding = false; this.jumpsUsed = 0; this.coyoteT = 0; this.bufferT = 0; this.vy = 0; this.invulnT = 0;
  }

  /** one 60 Hz step with what the policy said (a = { dx, dz, mag, jump }): `jump` is a key that is held, a press is its going from not held to held */
  step(dt, a) {
    if (this.dead) return super.step(dt, a, [], 1e9);
    const F = FLY, held = !!a.jump, press = held && !this.prevJump, mag = clamp(a.mag || 0, 0, 1);
    this.prevJump = held;
    this.coyoteT = Math.max(0, this.coyoteT - dt); this.bufferT = Math.max(0, this.bufferT - dt);
    if (press) this.bufferT = F.jumpBuffer;
    // a press in the air, not just above the ground, is a glide (a press just above it is a jump that is waited for)
    const fl0 = this.floorAt(this.x, this.z);
    const nearGround = this.vy < 0 && (this.y - fl0) < -this.vy * F.jumpBuffer;
    if (press && !this.grounded && this.coyoteT <= 0 && this.jumpsUsed >= 1 && !this.gliding && !nearGround) { this.gliding = true; this.bufferT = 0; }
    if (this.gliding && !held) this.gliding = false;
    // facing and the run
    const turn = this.gliding ? F.turnGlide : this.grounded ? F.turnGround : F.turnAir;
    if (mag > 0.2) this.yaw += clamp(wrap(Math.atan2(a.dx, a.dz) - this.yaw), -turn * dt, turn * dt);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    if (this.gliding) {
      const k = 1 - Math.exp(-F.glideAccel * dt);
      this.vx += (fx * F.glideSpeed - this.vx) * k; this.vz += (fz * F.glideSpeed - this.vz) * k;
    } else {
      const tx = a.dx * F.run * mag, tz = a.dz * F.run * mag, acc = (this.grounded ? (mag > 0.05 ? F.accel : F.brake) : (mag > 0.05 ? F.airAccel : F.airDrag)) * dt;
      const dvx = tx - this.vx, dvz = tz - this.vz, dl = hyp(dvx, dvz);
      if (dl > acc) { this.vx += (dvx / dl) * acc; this.vz += (dvz / dl) * acc; } else { this.vx = tx; this.vz = tz; }
    }
    // the jump
    if (this.bufferT > 0 && (this.grounded || this.coyoteT > 0)) { this.vy = F.jumpV; this.grounded = false; this.coyoteT = 0; this.bufferT = 0; this.jumpsUsed = 1; this.gliding = false; }
    // gravity, and the glide's fall
    if (!this.grounded) { this.vy -= F.gravity * dt; this.vy = this.gliding ? Math.max(this.vy, -F.glideFall) : Math.max(this.vy, -F.maxFall); }
    // move
    this.x += this.vx * dt; this.z += this.vz * dt;
    const prev = this.grounded, fl = this.floorAt(this.x, this.z);
    this.y += this.vy * dt;
    if (this.vy <= 0 && this.y - fl <= 0.02 + (prev ? F.stepDown : 0)) { this.y = fl; this.vy = 0; this.grounded = true; this.gliding = false; this.jumpsUsed = 0; }
    else this.grounded = false;
    if (prev && !this.grounded && this.vy <= 0) this.coyoteT = F.coyote;
    if (!this.grounded && this.jumpsUsed === 0 && this.coyoteT <= 0 && this.vy < 0) this.jumpsUsed = 1;          // (walked off a ledge: the glide is his)
    this.up = Math.max(0, this.y - fl);
    this.mouth.x = this.x + this.dirx * 0.95; this.mouth.z = this.z + this.dirz * 0.95;
  }
}

/** the ground of a course made of data, for the tests: a ledge at height `y` out to `edge` metres from its middle along the course (yaw), a stack (a disc of ground, `top` high) `from` metres out and `r` wide, and a bed far below (the lava) */
export function ledgeWorld({ x = 0, z = 0, y = 24, yaw = 0, edge = 4.5, from = 38, r = 9, top = 15, bed = -5, half = 12 } = {}) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  return (px, pz) => {
    const along = (px - x) * fx + (pz - z) * fz, across = (px - x) * fz - (pz - z) * fx;
    if (along <= edge && Math.abs(across) <= half && along >= -half) return y;
    if (hyp(along - from, across) <= r) return top;
    return bed;
  };
}
