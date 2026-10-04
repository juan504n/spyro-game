// A player for the Guardian's fight, and the fight played against the brain with no browser (tools/guardian-check.mjs, tools/boss-bot.mjs).
//
//   policy(s, mem) -> { dx, dz, mag, jump, flame, charge }       what a competent player does, from what he can SEE: the circles on the floor, the rings that run, the bolts that fly, the stuck fists, the
//                                                                crown. A short look ahead (0.05 s steps over 1.6 s): for every heading (and a jump or none) where would he be, and what would hit him
//                                                                there? He takes the way that nothing hits, towards what he wants (a stuck fist to ram, the lantern to flame, else a lap of the court).
//   DuelHero                                                     a hero as a model of the Player (run 11.5 m/s with 62 m/s^2, a jump of 15.2 m/s under 40 m/s^2, a ram at 24 m/s, the flame's cone, 1.9 s
//                                                                of blinking after a hit, Sparx's three hits), stepped at 60 Hz.
//   duel({ policy, seed, ... }) -> { won, time, hits, deaths, ... }   one whole fight: the pure GuardianBrain against a DuelHero, from the mouth of the court to the Guardian's freedom.
//
// The same policy plays the real game in the browser (tools/boss-bot.mjs gives it the real Game's state, in the same snapshot shape, and turns what it says into the real controller's input).
import { GuardianBrain, GUARDIAN as G } from '../../src/game/guardian/brain.js';

const hyp = Math.hypot;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/** The Player's numbers (src/game/player.js P) that a duel needs */
export const HERO = { r: 0.55, h: 1.05, run: 11.5, accel: 62, brake: 75, airAccel: 34, jumpV: 15.2, gravity: 40, charge: 24, chargeCd: 0.12, flameTime: 0.42, flameCd: 0.10, flameRange: 6.6, flameHalf: 0.68, turn: 17, turnCharge: 1.5, turnFlame: 6, invuln: 1.9, stun: 0.38, hp: 3 };

// ---------------------------------------------------------------------------------------------------------------------------------------
// the player
// ---------------------------------------------------------------------------------------------------------------------------------------
const SLAM_R = G.slam.r, WAVE_W = G.slam.waveW, WAVE_H = G.slam.waveH, WAVE_V = G.slam.waveSpeed;
const FIST_R = G.fist.r;
const DT_P = 0.05;                                      // the look ahead's step (s)
const NH = 32;                                          // ... and how many steps of it (1.6 s)

/** how long until fist `f` lands (s), by its state */
function landIn(f) {
  const F = G.fist;
  switch (f.state) {
    case 'rise': return F.riseT - f.t + F.aimT + F.lockT + F.dropT;
    case 'aim': return F.aimT - f.t + F.lockT + F.dropT;
    case 'lock': return F.lockT - f.t + F.dropT;
    case 'drop': return Math.max(0, F.dropT - f.t);
    default: return Infinity;
  }
}

/** where fist `f` will land if the hero stays where he is: its target moves towards him at `follow` m/s until it locks */
function landAt(f, hx, hz) {
  const F = G.fist, aimLeft = f.state === 'rise' ? F.aimT : f.state === 'aim' ? F.aimT - f.t : 0;
  if (aimLeft <= 0) return [f.tx, f.tz];
  const dx = hx - f.tx, dz = hz - f.tz, d = hyp(dx, dz) || 1, s = Math.min(d, F.follow * aimLeft);
  return [f.tx + (dx / d) * s, f.tz + (dz / d) * s];
}

/**
 * What would hit a hero who is at (x, z), `up` metres over the floor, `tau` seconds from now? Returns the number of hits (0 = nothing), against the hazards as the brain has them now. `m` is the margin
 * he keeps (metres) round each one. `hx, hz` is where the hero is now (the fists aim at it).
 */
function hits(s, tau, x, z, up, hx, hz, m) {
  const B = s.boss, r = HERO.r;
  let n = 0;
  for (const f of B.fists) {
    const tl = landIn(f);
    if (tl === Infinity) continue;
    const [lx, lz] = landAt(f, hx, hz);
    if (tau >= tl - 0.03 && tau <= tl + 0.12 && hyp(x - lx, z - lz) < SLAM_R + r + m) n++;                         // under the fist as it lands
    if (tau > tl) {                                                                                                 // the ring that runs from where it landed
      const w = G.slam.waveMax[B.phase] ?? 14, rr = SLAM_R + WAVE_V * (tau - tl);
      if (rr < w && Math.abs(hyp(x - lx, z - lz) - rr) < WAVE_W / 2 + r + m * 0.5 && up < WAVE_H + 0.12) n++;
    }
  }
  for (const w of B.waves) {
    const rr = w.r + WAVE_V * tau;
    if (rr < w.max && !w.hit && Math.abs(hyp(x - w.x, z - w.z) - rr) < WAVE_W / 2 + r + m * 0.5 && up < WAVE_H + 0.12) n++;
  }
  for (const b of B.bolts) {
    const bx = b.x + b.vx * tau, bz = b.z + b.vz * tau;
    if (b.age + tau < G.bolt.life && hyp(x - bx, z - bz) < G.bolt.r + r + m * 0.6 && up < G.bolt.y + G.bolt.r + 0.1 && up + HERO.h > G.bolt.y - G.bolt.r) n++;
  }
  for (const c of B.circles) {
    if (c.burst) continue;
    if (tau >= c.t - 0.02 && tau <= c.t + 0.1 && hyp(x - c.x, z - c.z) < G.gloom.r + r + m) n++;
  }
  return n;
}

/**
 * The player. `s` is a snapshot of the game: { t, hero: { x, y, z, yaw, vx, vz, grounded, canAct, chargeT, flameT, flameCd, chargeCd, up (metres over the floor) }, arena: { cx, cz, r, pillars: [{ x, z, r }], bodyR },
 * boss: { mode, sub, lit, phase, fists, waves, bolts, circles, lanternPos(j), contact, ... }, enemies: [{ x, z, variant }] }. `mem` is his memory between calls (keep one per fight). `opts` makes him worse:
 * `ram: false` (never rams), `flame: false` (never breathes fire), `idle: true` (never moves), `dodge: false` (walks to what he wants and takes no notice of what is on the floor: no sidestep, no jump), `margin` (metres kept round every hazard: 0.9), `lap` (the radius of his laps: 29).
 */
export function policy(s, mem, opts = {}) {
  const o = { margin: 0.9, lap: 29, ram: true, flame: true, idle: false, dodge: true, ...opts };
  const h = s.hero, A = s.arena, B = s.boss;
  const out = { dx: 0, dz: 0, mag: 0, jump: false, flame: false, charge: false };
  if (h.dead || !h.canAct) { mem.charging = false; return out; }
  mem.t = s.t;

  // ---- what he wants -----------------------------------------------------------------------------------------------------
  const stuck = B.fists.filter((f) => f.state === 'stuck');
  let goal = null, want = 'lap', ramAt = null;
  if (B.mode === 'stoop') {
    const L = B.lanternPos(B.lit), ang = Math.atan2(L.z - A.cz, L.x - A.cx);
    goal = { x: A.cx + Math.cos(ang) * 6.9, z: A.cz + Math.sin(ang) * 6.9, L };
    want = 'lantern';
  } else if (o.ram && stuck.length) {
    stuck.sort((a, b) => hyp(a.x - h.x, a.z - h.z) - hyp(b.x - h.x, b.z - h.z));
    ramAt = stuck[0];
    goal = { x: ramAt.x, z: ramAt.z };
    want = 'ram';
  } else if (s.enemies && s.enemies.length) {
    const e = s.enemies.reduce((best, q) => (hyp(q.x - h.x, q.z - h.z) < hyp(best.x - h.x, best.z - h.z) ? q : best));
    if (hyp(e.x - h.x, e.z - h.z) < 9) { goal = { x: e.x, z: e.z, e }; want = 'snuffer'; }
  }
  if (!goal) {
    // a lap of the court at `lap` metres from the dais, towards where he is already going (the fists follow him slower than he runs)
    const a = Math.atan2(h.z - A.cz, h.x - A.cx), dir = mem.dir || (mem.dir = 1);
    const lead = a + dir * 0.7;
    goal = { x: A.cx + Math.cos(lead) * o.lap, z: A.cz + Math.sin(lead) * o.lap };
  }
  if (o.idle) return out;

  // ---- what is solid ---------------------------------------------------------------------------------------------------------
  const solids = [{ x: A.cx, z: A.cz, r: (A.bodyR ?? 4.6) + HERO.r }, ...A.pillars.map((p) => ({ x: p.x, z: p.z, r: p.r + 0.25 + HERO.r })), ...stuck.map((f) => ({ x: f.x, z: f.z, r: FIST_R + HERO.r }))];
  const edge = A.r - 1.5;

  // ---- the look ahead: every heading, with a jump and without ----------------------------------------------------------------------
  const dirs = [];
  for (let k = 0; k < 24; k++) dirs.push((k / 24) * Math.PI * 2);
  const cur = hyp(h.vx, h.vz) > 1 ? Math.atan2(h.vz, h.vx) : null;
  let best = null;
  const plans = [];
  for (const jump of h.grounded && o.dodge ? [false, true] : [false]) {
    for (let k = -1; k < dirs.length; k++) {
      const ang = k < 0 ? null : dirs[k];                                    // null: stand still
      let x = h.x, z = h.z, vx = h.vx, vz = h.vz, up = h.up || 0, vy = jump ? HERO.jumpV : (h.grounded ? 0 : (h.vy || 0)), danger = 0, blocked = 0, firstHit = Infinity;
      let ground = h.grounded && !jump, gdMin = hyp(goal.x - x, goal.z - z);
      for (let i = 1; i <= NH; i++) {
        const tau = i * DT_P;
        const tx = ang === null ? 0 : Math.cos(ang) * HERO.run, tz = ang === null ? 0 : Math.sin(ang) * HERO.run;
        const acc = (ground ? (ang === null ? HERO.brake : HERO.accel) : HERO.airAccel) * DT_P;
        const dvx = tx - vx, dvz = tz - vz, dl = hyp(dvx, dvz);
        if (dl > acc) { vx += (dvx / dl) * acc; vz += (dvz / dl) * acc; } else { vx = tx; vz = tz; }
        x += vx * DT_P; z += vz * DT_P;
        if (!ground) { vy -= HERO.gravity * DT_P; up += vy * DT_P; if (up <= 0) { up = 0; vy = 0; ground = true; } }
        const d0 = hyp(x - A.cx, z - A.cz);
        if (d0 > edge) { const k2 = edge / d0; x = A.cx + (x - A.cx) * k2; z = A.cz + (z - A.cz) * k2; blocked += 0.2; }
        for (const so of solids) { const dd = hyp(x - so.x, z - so.z); if (dd < so.r) { const k2 = so.r / (dd || 1e-3); x = so.x + (x - so.x) * k2; z = so.z + (z - so.z) * k2; blocked += 0.5; } }
        const n = hits(s, tau, x, z, up, h.x, h.z, o.margin);
        if (n) { danger += n * (2 - tau / (NH * DT_P)); if (firstHit === Infinity) firstHit = tau; }
        const g1 = hyp(goal.x - x, goal.z - z); if (g1 < gdMin) gdMin = g1;
      }
      const gd = hyp(goal.x - x, goal.z - z);
      // (what he wants is to come to the goal and stop there: the closest the way comes to it counts most, where it ends a little)
      let score = (o.dodge ? danger * 1000 : 0) + blocked * 20 + (want === 'lap' ? 0.6 * gd : 2.4 * gdMin + 0.25 * gd) + (jump ? 4 : 0);
      if (cur !== null && ang !== null) score += Math.abs(wrap(ang - cur)) * 0.8;                       // (he does not change his mind for nothing)
      if (ang === null) score += want === 'lantern' ? 0 : 6;
      plans.push({ ang, jump, score, danger, x, z });
      if (!best || score < best.score) best = plans[plans.length - 1];
    }
  }
  const stay = plans.find((p) => p.ang === null && !p.jump);
  const dmgNow = hits(s, 0.2, h.x, h.z, h.up || 0, h.x, h.z, o.margin);

  // ---- the ram: straight at the fist that has landed, if nothing hits him on the way, and held until it breaks -------------------------------------------
  let charge = false, dx = 0, dz = 0;
  if (want === 'ram' && ramAt) {
    const fx = ramAt.x - h.x, fz = ramAt.z - h.z, d = hyp(fx, fz);
    const toward = Math.atan2(fz, fx), face = Math.atan2(h.dirz ?? Math.sin(h.yaw), h.dirx ?? Math.cos(h.yaw));
    // the charge's way: 24 m/s along the line, the look ahead says whether anything hits him on it
    let clear = true;
    for (let i = 1; i * DT_P * HERO.charge < d - 1.0 && clear; i++) {
      const tau = i * DT_P, px = h.x + (fx / d) * HERO.charge * tau, pz = h.z + (fz / d) * HERO.charge * tau;
      if (hits(s, tau, px, pz, 0, h.x, h.z, 0.4)) clear = false;
    }
    const aligned = Math.abs(wrap(toward - face)) < (mem.charging ? 0.9 : 0.35);
    if (clear && d < 15 && (aligned || d < 4.5) && (best.danger === 0 || mem.charging)) { charge = true; dx = fx / d; dz = fz / d; }
    else if (clear && d >= 15) { dx = fx / d; dz = fz / d; }
  }
  mem.charging = charge;
  if (charge) { out.dx = dx; out.dz = dz; out.mag = 1; out.charge = true; return out; }

  // ---- else the best plan (or standing, if that is as good) ---------------------------------------------------------------------------
  const pick = stay && stay.score <= best.score + 1 ? stay : best;
  if (pick.ang !== null) { out.dx = Math.cos(pick.ang); out.dz = Math.sin(pick.ang); out.mag = 1; }
  out.jump = !!pick.jump && h.grounded;
  // he turns his laps the other way when the way ahead is shut (a pillar, the wall of the court)
  if (want === 'lap' && pick.ang !== null) {
    const a = Math.atan2(h.z - A.cz, h.x - A.cx), tang = Math.atan2(Math.cos(a), -Math.sin(a));              // counter-clockwise tangent
    if (Math.abs(wrap(pick.ang - tang)) > 2.2) mem.dir = -(mem.dir || 1); else if (Math.abs(wrap(pick.ang - tang)) < 0.9) mem.dir = 1;
  }
  // the flame: at the lantern when it is near, at a Snuffer that burns (a bell shrugs it off: he rams that one)
  if (want === 'lantern' && o.flame && goal.L) {
    const L = goal.L, d = hyp(L.x - h.x, L.z - h.z);
    if (d < 6.2) { out.flame = true; out.dx = (L.x - h.x) / (d || 1); out.dz = (L.z - h.z) / (d || 1); out.mag = d > 2.4 ? 0.6 : 0.15; out.jump = false; }
  }
  if (want === 'snuffer' && goal.e) {
    const e = goal.e, d = hyp(e.x - h.x, e.z - h.z);
    if (e.variant === 'bell') { if (d < 8 && d > 1.5 && dmgNow === 0 && best.danger === 0) { out.charge = o.ram; out.dx = (e.x - h.x) / d; out.dz = (e.z - h.z) / d; out.mag = 1; } }
    else if (d < 5.2 && o.flame && best.danger === 0) { out.flame = true; out.dx = (e.x - h.x) / d; out.dz = (e.z - h.z) / d; out.mag = 0.3; }
    else if (d >= 5.2 && best.danger === 0) { out.dx = (e.x - h.x) / d; out.dz = (e.z - h.z) / d; out.mag = 0.8; }
  }
  mem.last = { want, danger: best.danger, dmgNow };
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// the hero, as a model of the Player
// ---------------------------------------------------------------------------------------------------------------------------------------
export class DuelHero {
  constructor(spot, floorAt) {
    this.floorAt = floorAt;
    this.set(spot);
  }

  set(spot) {
    this.x = spot.x; this.z = spot.z; this.yaw = spot.yaw ?? Math.PI;
    this.y = this.floorAt(this.x, this.z);
    this.vx = this.vz = this.vy = 0;
    this.grounded = true;
    this.hp = HERO.hp;
    this.dead = false; this.deadT = 0;
    this.hurtT = 0; this.invulnT = 2;
    this.flameT = 0; this.flameCd = 0; this.chargeT = 0; this.chargeCd = 0;
    this.prevCharge = false; this.prevJump = false;
    this.mouth = { x: this.x, z: this.z };
  }

  get dirx() { return Math.sin(this.yaw); }
  get dirz() { return Math.cos(this.yaw); }
  get invulnerable() { return this.invulnT > 0 || this.dead; }
  get canAct() { return !this.dead && this.hurtT <= 0; }

  /** Player.hurt + Sparx: true if it landed; at no hits left he dies */
  hurt(fx, fz) {
    if (this.invulnerable) return false;
    this.invulnT = HERO.invuln; this.hurtT = HERO.stun; this.chargeT = 0; this.flameT = 0;
    let dx = this.x - fx, dz = this.z - fz; const l = hyp(dx, dz) || 1; dx /= l; dz /= l;
    this.vx = dx * 9; this.vz = dz * 9; this.vy = 7.5; this.grounded = false;
    if (this.hp <= 0) { this.dead = true; this.deadT = 0; this.vx *= 0.3; this.vz *= 0.3; } else this.hp--;
    return true;
  }

  flameHits(x, y, z, r = 0.5, dy = 2.4) {
    if (this.flameT <= 0) return false;
    const dx = x - this.mouth.x, dz = z - this.mouth.z, d = hyp(dx, dz);
    if (d > HERO.flameRange + r || Math.abs(y - (this.y + 0.6)) > dy) return false;
    if (d < r + 0.7) return true;
    const dot = (dx * this.dirx + dz * this.dirz) / d;
    return Math.acos(Math.min(1, dot)) < HERO.flameHalf + Math.atan2(r, d);
  }

  chargeHits(x, y, z, r = 0.5) {
    if (this.chargeT <= 0) return false;
    const dx = x - this.x, dz = z - this.z, d = hyp(dx, dz);
    if (d > 2.4 + r || Math.abs(y - this.y) > 2.2) return false;
    if (d < r + 0.8) return true;
    return (dx * this.dirx + dz * this.dirz) / d > 0.3;
  }

  /** one 60 Hz step with what the policy said (a = { dx, dz, mag, jump, flame, charge }); `solids` are circles { x, z, r } he cannot enter */
  step(dt, a, solids, arenaR) {
    if (this.dead) { this.deadT += dt; this.vx *= Math.exp(-4 * dt); this.vz *= Math.exp(-4 * dt); return; }
    this.invulnT = Math.max(0, this.invulnT - dt); this.hurtT = Math.max(0, this.hurtT - dt);
    this.chargeCd = Math.max(0, this.chargeCd - dt); this.flameCd = Math.max(0, this.flameCd - dt);
    const ctl = this.canAct, mag = ctl ? clamp(a.mag, 0, 1) : 0;
    const wantCharge = ctl && a.charge;
    if (this.chargeT > 0 && !wantCharge) { this.chargeT = 0; this.chargeCd = HERO.chargeCd; const s = hyp(this.vx, this.vz); if (s > HERO.run) { this.vx *= HERO.run / s; this.vz *= HERO.run / s; } }
    if (ctl && wantCharge && !this.prevCharge && this.chargeCd <= 0 && this.chargeT <= 0 && this.flameT <= 0) { this.chargeT = 1e-4; if (mag > 0.3) this.yaw = Math.atan2(a.dx, a.dz); }
    this.prevCharge = wantCharge;
    if (ctl && a.flame && this.flameT <= 0 && this.flameCd <= 0 && this.chargeT <= 0) this.flameT = HERO.flameTime;
    // facing
    const turn = this.chargeT > 0 ? HERO.turnCharge : this.flameT > 0 ? HERO.turnFlame : HERO.turn;
    if (mag > 0.2 && ctl) { const d = wrap(Math.atan2(a.dx, a.dz) - this.yaw), st = clamp(d, -turn * dt, turn * dt); this.yaw += st; }
    // horizontal velocity
    if (this.hurtT > 0) { const k = Math.exp(-3.2 * dt); this.vx *= k; this.vz *= k; }
    else if (this.chargeT > 0) {
      this.chargeT += dt;
      const k = Math.min(1, dt * 14);
      this.vx += (this.dirx * HERO.charge - this.vx) * k; this.vz += (this.dirz * HERO.charge - this.vz) * k;
    } else {
      const cap = (this.flameT > 0 ? 0.5 : 1) * HERO.run;
      const tx = a.dx * cap * mag, tz = a.dz * cap * mag;
      const acc = (this.grounded ? (mag > 0.05 ? HERO.accel : HERO.brake) : HERO.airAccel) * dt;
      const dvx = tx - this.vx, dvz = tz - this.vz, dl = hyp(dvx, dvz);
      if (dl > acc) { this.vx += (dvx / dl) * acc; this.vz += (dvz / dl) * acc; } else { this.vx = tx; this.vz = tz; }
    }
    if (ctl && a.jump && !this.prevJump && this.grounded) { this.vy = HERO.jumpV; this.grounded = false; }
    this.prevJump = !!a.jump;
    // move: substeps, out of the solids, inside the court
    const n = Math.max(1, Math.ceil((hyp(this.vx, this.vz) * dt) / (HERO.r * 0.8)));
    let wall = false;
    for (let i = 0; i < n; i++) {
      this.x += (this.vx * dt) / n; this.z += (this.vz * dt) / n;
      for (const so of solids) {
        const dx = this.x - so.x, dz = this.z - so.z, d = hyp(dx, dz), rr = so.r + HERO.r;
        if (d < rr) { const nx = dx / (d || 1e-3), nz = dz / (d || 1e-3); this.x = so.x + nx * rr; this.z = so.z + nz * rr; const vn = this.vx * nx + this.vz * nz; if (vn < 0) { if (this.chargeT > 0 && -vn > HERO.charge * 0.55) wall = true; this.vx -= nx * vn; this.vz -= nz * vn; } }
      }
    }
    if (wall) { this.chargeT = 0; this.chargeCd = HERO.chargeCd + 0.25; this.hurtT = 0.28; }
    // vertical
    const fl = this.floorAt(this.x, this.z);
    if (!this.grounded) { this.vy -= HERO.gravity * dt; this.y += this.vy * dt; if (this.y <= fl && this.vy <= 0) { this.y = fl; this.vy = 0; this.grounded = true; } }
    else { this.y = fl; }
    this.up = Math.max(0, this.y - fl);
    // flame timing and the mouth
    if (this.flameT > 0) { this.flameT -= dt; if (this.flameT <= 0) { this.flameT = 0; this.flameCd = HERO.flameCd; } }
    this.mouth.x = this.x + this.dirx * 0.95; this.mouth.z = this.z + this.dirz * 0.95;
    void arenaR;
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// the fight
// ---------------------------------------------------------------------------------------------------------------------------------------
/** the shape of the ground of the Court (guardian/level.js): a floor at 4 m and the dais, 1.4 m over it, which falls to the floor over 2.4 m (realm/country.js flatten) */
export function courtGround(C) {
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  return (x, z) => {
    const d = hyp(x - C.x, z - C.z), top = C.floor + C.dais.h;
    if (d <= C.dais.r) return top;
    if (d >= C.dais.r + C.dais.edge) return C.floor;
    return C.floor + (top - C.floor) * (1 - smooth((d - C.dais.r) / C.dais.edge));
  };
}

/**
 * One whole fight. `court`: the Court's numbers (guardian/level.js COURT, PILLARS), `pol`: a function (snapshot, memory) -> controls (policy, with its options bound), `seed`: the brain's, `maxTime`: give up
 * after this long (s), `latency`: how many 60 Hz steps old the snapshot the policy sees is (a person's reaction: 6 = 0.1 s), `every`: steps between his decisions. Returns the outcome and what it cost.
 */
export function duel({ court, pillars, pol, seed = 7, maxTime = 600, latency = 0, every = 3, spot = null, trace = null, onStep = null, lapse = null, wobble = 0 }) {
  const DT = 1 / 60;
  const ground = courtGround(court);
  const arena = { cx: court.x, cz: court.z, floorAt: ground, daisY: court.floor + court.dais.h, arenaR: court.r, wakeR: court.wake, leaveR: court.leave, pillars };
  const brain = new GuardianBrain(arena, seed);
  const checkpoint = { x: court.x, z: court.z + court.r - 3, yaw: Math.PI };
  const hero = new DuelHero(spot || { x: court.x, z: court.z + court.dais.r + 34, yaw: Math.PI }, ground);
  const mem = {};
  const q = { flameHits: (x, y, z, r, dy) => hero.flameHits(x, y, z, r, dy) };
  const stat = { hits: 0, deaths: 0, byWhat: {}, slams: 0, cracks: 0, lit: 0, windowsLost: 0, phases: 0, maxLit: 0 };
  const hist = [];
  let act = { dx: 0, dz: 0, mag: 0, jump: false, flame: false, charge: false }, step = 0, fightT = 0;
  // a person is not a planner: he looks away (a lapse: for `dur` seconds, every `every` seconds or so, what he was doing goes on) and his stick wobbles (`wobble` radians, a slow drift)
  const lrng = (() => { let x = (seed * 2654435761) >>> 0; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296); })();
  let lapseAt = lapse ? lapse.every * (0.5 + lrng()) : Infinity, lapseUntil = -1, drift = 0, driftT = 0;
  const snapshot = () => ({
    t: brain.t,
    hero: { x: hero.x, y: hero.y, z: hero.z, yaw: hero.yaw, dirx: hero.dirx, dirz: hero.dirz, vx: hero.vx, vz: hero.vz, vy: hero.vy, grounded: hero.grounded, up: hero.up || 0, canAct: hero.canAct, dead: hero.dead, chargeT: hero.chargeT, flameT: hero.flameT, flameCd: hero.flameCd, chargeCd: hero.chargeCd },
    arena: { cx: court.x, cz: court.z, r: court.r, bodyR: 4.6, pillars },
    boss: {
      mode: brain.mode, sub: brain.sub, lit: brain.lit, phase: brain.phase, crown: brain.crown, contact: brain.contact, charge: brain.charge,
      fists: brain.fists.map((f) => ({ ...f })), waves: brain.waves.map((w) => ({ ...w })), bolts: brain.bolts.map((b) => ({ ...b })), circles: brain.circles.map((c) => ({ ...c })),
      lanternPos: (j) => brain.lanternPos(j),
    },
    enemies: [],
  });
  while (brain.t < maxTime && brain.mode !== 'freed') {
    // what the policy sees (a little stale, as a person's eyes are), decided every few steps
    hist.push(snapshot()); if (hist.length > latency + 1) hist.shift();
    if (lapse && brain.t >= lapseAt) { lapseUntil = brain.t + lapse.dur * (0.6 + 0.8 * lrng()); lapseAt = brain.t + lapse.every * (0.6 + 0.8 * lrng()) + (lapseUntil - brain.t); }
    if (step % every === 0 && brain.t >= lapseUntil) { const s = hist[0]; act = pol(s, mem); if (wobble) { driftT -= every * DT; if (driftT <= 0) { drift = (lrng() * 2 - 1) * wobble; driftT = 0.4 + lrng() * 0.6; } const c = Math.cos(drift), sn = Math.sin(drift); act = { ...act, dx: act.dx * c - act.dz * sn, dz: act.dx * sn + act.dz * c }; } }
    step++;
    // the hero
    const stuck = brain.fists.filter((f) => f.state === 'stuck').map((f) => ({ x: f.x, z: f.z, r: FIST_R }));
    const solids = [{ x: court.x, z: court.z, r: 4.6 }, ...pillars.map((p) => ({ x: p.x, z: p.z, r: p.r + 0.25 })), ...stuck];
    hero.step(DT, act, solids, court.r);
    // the brain
    const live = !hero.dead;
    brain.step(DT, live ? { x: hero.x, y: hero.y, z: hero.z, r: HERO.r, invuln: hero.invulnerable } : null, q);
    if (brain.mode !== 'asleep' && brain.mode !== 'freed' && brain.mode !== 'waking') fightT += DT;
    // the ram
    for (const f of brain.fists) if (f.state === 'stuck' && hero.chargeT > 0 && hero.chargeHits(f.x, f.y + 1.0, f.z, FIST_R)) { if (brain.ramFist(f.id)) { hero.vx *= 0.35; hero.vz *= 0.35; stat.cracks++; } }
    for (const e of brain.events) {
      if (e.type === 'hit') { if (hero.hurt(e.fx, e.fz)) { stat.hits++; stat.byWhat[e.what] = (stat.byWhat[e.what] || 0) + 1; if (hero.dead) stat.deaths++; } }
      else if (e.type === 'slam') stat.slams++;
      else if (e.type === 'lit') { stat.lit++; hero.hp = HERO.hp; }
      else if (e.type === 'window-lost') stat.windowsLost++;
      else if (e.type === 'phase') stat.phases++;
      if (trace) trace(e, brain, hero);
    }
    if (onStep) onStep(brain, hero, act, mem);
    brain.events.length = 0;
    // a hero who has died is set back at the mouth of the court after the fall of the screen (2.2 s), the phase begins again
    if (hero.dead && hero.deadT > 2.2) { hero.set({ ...checkpoint }); brain.resetPhase(); }
  }
  stat.maxLit = brain.lit;
  return { won: brain.mode === 'freed', time: brain.t, fightTime: fightT, ...stat };
}
