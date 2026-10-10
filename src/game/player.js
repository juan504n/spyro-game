// The dragon: kinematic character controller + ability state machine (run, jump, glide, charge, flame, hurt, death).
// Tuning constants live in P so game feel can be adjusted in one place.
import { SLOPE_WALK } from './collision.js';
import { WATER_LEVEL, WARD_RADIUS } from './level.js';
import { aimBearing, aimStep } from './aim.js';
import { whirlStep, whirlHolds, WHIRL } from './realm/whirl.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export const P = {
  radius: 0.55, height: 1.05, stepUp: 0.62,
  runSpeed: 11.5, accel: 62, brake: 75, airAccel: 34, airDrag: 1.6,
  gravity: 40, jumpV: 15.2, maxFall: 42, coyote: 0.11, jumpBuffer: 0.13,
  glideSpeed: 13.5, glideFall: 3.1, glideAccel: 7,
  chargeSpeed: 24, chargeCooldown: 0.12,       // (a charge lasts exactly as long as the button is held)
  flameTime: 0.42, flameCooldown: 0.10, flameRange: 6.6, flameHalfAngle: 0.68,
  turnGround: 17, turnAir: 9, turnGlide: 2.7, turnCharge: 1.5, turnFlame: 6,
  hurtStun: 0.38, invuln: 1.9,
  slideAccel: 34,
};

export class Player {
  constructor(game, model) {
    this.game = game;
    this.model = model;
    this.x = 0; this.y = 0; this.z = 0;
    this.px = 0; this.py = 0; this.pz = 0;          // previous step (render interpolation)
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = Math.PI; this.pyaw = Math.PI;
    this.r = P.radius; this.h = P.height;
    this.grounded = false; this.steep = false;
    this.groundKind = 'terrain'; this.groundC = null;
    this.gnx = 0; this.gny = 1; this.gnz = 0;
    this.coyoteT = 0; this.bufferT = 0;
    this.gliding = false;
    this.chargeT = 0; this.chargeCd = 0;
    this.flameT = 0; this.flameCd = 0; this.flameTick = 0;
    this.hurtT = 0; this.invulnT = 0;
    this.landPulse = 0;
    this.dead = false; this.deadT = 0;
    this.locked = false;            // cutscenes / dialogue: no control
    this.script = null;             // a function (player, dt) that plays the hero instead of the controller (the title screen's fly-in), or null
    this.cheer = false;
    this.inWater = false; this.waterT = 0;
    this.safe = { x: 0, y: 0, z: 0, yaw: Math.PI };
    this.safeT = 0;
    this.turnRate = 0;
    this.airTime = 0;
    this.jumpsUsed = 0;
    this.time = 0;
    this.lookT = 0; this.lookTarget = 0;
    this.on = {};                    // event hooks: jump, land, glide, flame, charge, chargeHit, hurt, die, respawn, splash, step, bounce, wall
    this.mouth = { x: 0, y: 0, z: 0 };
    this.dirx = 0; this.dirz = 1;    // facing vector
    this.carry = null;               // a path that owns the hero's position (a beam of light carrying him into a portal: see systems/portals.js)
    this.vanish = false;             // ... and the end of that ride: he has gone into the light
  }

  emit(name, a, b) { const f = this.on[name]; if (f) f(a, b); }

  place(x, y, z, yaw) {
    this.carry = null; this.vanish = false;
    this.x = this.px = x; this.y = this.py = y; this.z = this.pz = z;
    this.yaw = this.pyaw = yaw;
    this.vx = this.vy = this.vz = 0;
    this.grounded = false; this.gliding = false; this.chargeT = 0; this.flameT = 0; this.dead = false; this.deadT = 0;
    this.hurtT = 0; this.jumpsUsed = 0;
    this.safe = { x, y, z, yaw };
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get canAct() { return !this.dead && !this.locked && this.hurtT <= 0; }
  get invulnerable() { return this.invulnT > 0 || this.dead; }

  /** Damage: returns true if it landed (game handles Sparx/death). */
  hurt(fromX, fromZ, power = 1) {
    if (this.invulnerable) return false;
    this.invulnT = P.invuln;
    this.hurtT = P.hurtStun;
    this.chargeT = 0; this.flameT = 0; this.gliding = false;
    let dx = this.x - fromX, dz = this.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    this.vx = dx * 9 * power; this.vz = dz * 9 * power; this.vy = 7.5;
    this.grounded = false;
    this.emit('hurt');
    return true;
  }

  /** A blast of wind (a Gale Spirit, foes/gust.js): the hero is thrown along (dx, dz) at `power` m/s and cannot steer for half a second (the knockback's friction takes about a third of the speed in metres). Nothing is hurt. */
  shove(dx, dz, power) {
    if (this.dead || this.carry || this.invulnT > 0) return false;          // (not in the grace of an arrival or a blow: a hero just set down is not blown off)
    this.vx = dx * power; this.vz = dz * power; this.vy = Math.max(this.vy, 3.5);
    this.hurtT = Math.max(this.hurtT, 0.55);
    this.chargeT = 0; this.flameT = 0; this.gliding = false; this.grounded = false;
    this.emit('shoved');
    return true;
  }

  kill() {
    if (this.dead) return;
    this.dead = true; this.deadT = 0; this.chargeT = 0; this.flameT = 0; this.gliding = false;
    this.vx *= 0.3; this.vz *= 0.3;
    this.emit('die');
  }

  /** Launch (mushroom pads, springs). */
  bounce(v) {
    this.vy = v; this.grounded = false; this.gliding = false; this.jumpsUsed = 1; this.coyoteT = 0;
    this.emit('bounce');
  }

  // ---------------------------------------------------------------------------------------------------------------
  update(dt, input, camYaw) {
    this.time += dt;
    this.px = this.x; this.py = this.y; this.pz = this.z; this.pyaw = this.yaw;
    if (this.script) { this.script(this, dt); return; }        // (a cutscene plays the hero: it sets his place, his heading and his pose itself, see cinematics.js `makeOpening`)
    const col = this.game.collision;

    if (this.carry) { this._carried(dt); return; }
    if (this.dead) { this._updateDead(dt); this._pose(dt, 0); return; }

    this.invulnT = Math.max(0, this.invulnT - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.chargeCd = Math.max(0, this.chargeCd - dt);
    this.flameCd = Math.max(0, this.flameCd - dt);
    this.landPulse = Math.max(0, this.landPulse - dt * 4.5);
    this.coyoteT = Math.max(0, this.coyoteT - dt);
    this.bufferT = Math.max(0, this.bufferT - dt);

    const ctl = this.canAct;
    const mv = ctl ? input.move : { x: 0, y: 0 };
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    // camera-relative world direction
    const s = Math.sin(camYaw), c = Math.cos(camYaw);
    let wx = s * mv.y - c * mv.x, wz = c * mv.y + s * mv.x;
    const wl = Math.hypot(wx, wz) || 1;
    wx /= wl; wz /= wl;

    // ---- ability inputs -------------------------------------------------------------------------------------------
    if (ctl && input.pressed('jump')) this.bufferT = P.jumpBuffer;
    // charging lasts only while the charge button is held: let go (or lose control) and it stops at once
    if (this.chargeT > 0 && !(ctl && input.down('charge'))) this._endCharge();

    if (ctl) {
      // start glide: press jump while airborne — but a press just above the ground is a buffered jump, not a glide
      const nearGround = this.vy < 0 && (this.y - col.support(this.x, this.z, this.y, P.stepUp).y) < -this.vy * P.jumpBuffer;
      if (input.pressed('jump') && !this.grounded && this.coyoteT <= 0 && this.jumpsUsed >= 1 && !this.gliding && this.chargeT <= 0 && !nearGround) {
        this.gliding = true; this.bufferT = 0; this.emit('glide');
      }
      if (this.gliding && !input.down('jump')) this.gliding = false;
      if (input.pressed('charge') && input.down('charge') && this.chargeCd <= 0 && this.chargeT <= 0 && !this.gliding && this.flameT <= 0) {
        this.chargeT = 1e-4; this.emit('charge');           // (chargeT = seconds charged so far; > 0 means "charging")
        // charge in the input direction if steering, else forward
        if (mag > 0.3) this.yaw = Math.atan2(wx, wz);
      }
      if ((input.pressed('flame') || (input.down('flame') && this.flameCd <= 0)) && this.flameT <= 0 && this.flameCd <= 0 && this.chargeT <= 0 && !this.gliding) {
        this.flameT = P.flameTime; this.flameTick = 0; this.emit('flame');
      }
    }

    // ---- facing ---------------------------------------------------------------------------------------------------
    let turn = P.turnGround;
    if (!this.grounded) turn = P.turnAir;
    if (this.gliding) turn = P.turnGlide;
    if (this.chargeT > 0) turn = P.turnCharge;
    if (this.flameT > 0) turn = P.turnFlame;
    if (mag > 0.2 && ctl) {
      const target = Math.atan2(wx, wz);
      const d = angDiff(target, this.yaw);
      const step = clamp(d, -turn * dt, turn * dt);
      this.yaw += step;
      this.turnRate = lerp(this.turnRate, step / dt / P.turnGround, 0.25);
    } else this.turnRate = lerp(this.turnRate, 0, 0.2);
    if (ctl && this.flameT > 0 && this.game.gfx?.settings?.aimAssist !== false) this._aimAssist(dt, mag, wx, wz);
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2; else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.dirx = fx; this.dirz = fz;

    // ---- horizontal velocity ---------------------------------------------------------------------------------------
    const whirls = this.game.objects && this.game.objects.whirlwinds;
    const held = !!(whirls && whirls.length && whirlHolds(whirls, this));              // (inside the column of a whirlwind his running is weak: realm/whirl.js)
    const inWaterSlow = (this.inWater ? 0.62 : 1) * (held ? WHIRL.hold : 1);
    if (this.hurtT > 0) {
      // knockback: friction only
      const k = Math.exp(-3.2 * dt);
      this.vx *= k; this.vz *= k;
    } else if (this.chargeT > 0) {
      this.chargeT += dt;
      this.vx = lerp(this.vx, fx * P.chargeSpeed, Math.min(1, dt * 14));
      this.vz = lerp(this.vz, fz * P.chargeSpeed, Math.min(1, dt * 14));
    } else if (this.gliding) {
      const t = 1 - Math.exp(-P.glideAccel * dt);
      this.vx = lerp(this.vx, fx * P.glideSpeed, t);
      this.vz = lerp(this.vz, fz * P.glideSpeed, t);
    } else {
      const cap = (this.flameT > 0 ? 0.5 : 1) * P.runSpeed * inWaterSlow;
      const tx = wx * cap * mag, tz = wz * cap * mag;
      const accel = this.grounded ? (mag > 0.05 ? P.accel : P.brake) : (mag > 0.05 ? P.airAccel : P.airDrag);
      const dvx = tx - this.vx, dvz = tz - this.vz;
      const dl = Math.hypot(dvx, dvz);
      const maxd = accel * dt;
      if (dl > maxd) { this.vx += (dvx / dl) * maxd; this.vz += (dvz / dl) * maxd; } else { this.vx = tx; this.vz = tz; }
      if (this.steep) {
        // sliding down a too-steep slope
        const l = Math.hypot(this.gnx, this.gnz) || 1;
        this.vx += (this.gnx / l) * P.slideAccel * dt; this.vz += (this.gnz / l) * P.slideAccel * dt;
      }
    }

    // ---- jumping ----------------------------------------------------------------------------------------------------
    // (works while ramming too, as in the original: hold RAM and tap JUMP and the charge carries on through the air, and on landing, for as long as RAM stays held)
    if (this.bufferT > 0 && ctl && (this.grounded || this.coyoteT > 0)) {
      this.vy = P.jumpV; this.grounded = false; this.coyoteT = 0; this.bufferT = 0; this.jumpsUsed = 1; this.gliding = false;
      this.emit('jump');
    }

    // ---- the whirlwind: inside the column of an updraft (realm/whirl.js) he is carried up, and gravity is the column's, not his ------------------------------------
    const inWhirl = held && whirlStep(whirls, this, dt);

    // ---- vertical ------------------------------------------------------------------------------------------------------
    if (!inWhirl && (!this.grounded || this.steep)) {
      this.vy -= P.gravity * dt;
      if (this.gliding) this.vy = Math.max(this.vy, -P.glideFall);
      else this.vy = Math.max(this.vy, -P.maxFall);
    }

    // ---- integrate horizontally with collision -------------------------------------------------------------------
    const sp = Math.hypot(this.vx, this.vz);
    const sub = Math.max(1, Math.ceil((sp * dt) / (this.r * 0.8)));
    let hitWall = null;
    for (let i = 0; i < sub; i++) {
      const dt2 = dt / sub;
      const ox = this.x, oz = this.z;
      this.x += this.vx * dt2; this.z += this.vz * dt2;
      // terrain steepness: block moving uphill into a steep face
      const n = col.normalAt(this.x, this.z);
      if (n[1] < SLOPE_WALK) {            // (also while gliding: otherwise a glide into a cliff rides up its face)
        const hNew = col.heightAt(this.x, this.z), hOld = col.heightAt(ox, oz);
        // (not when what he walks on is a prop - a deck, a stair, a pier - that rises: the steep terrain under it is not the face he climbs, and a bridge laid over the crest of a steep rim stood him still on it)
        if (hNew > hOld + 0.001 && hNew > this.y - 0.2 && !(this.grounded && col.support(this.x, this.z, this.y, P.stepUp).kind === 'collider')) {
          const ul = Math.hypot(n[0], n[2]) || 1;
          const ux = -n[0] / ul, uz = -n[2] / ul;
          const vu = this.vx * ux + this.vz * uz;
          if (vu > 0) {
            this.vx -= ux * vu; this.vz -= uz * vu;
            this.x = ox + this.vx * dt2; this.z = oz + this.vz * dt2;
            if (this.chargeT > 0 && vu > P.chargeSpeed * 0.6) hitWall = { c: null, nx: n[0], nz: n[2], terrain: true };
          }
        }
      }
      const contact = col.pushOut(this, this.y, this.h, P.stepUp);
      if (contact) {
        // remove the into-wall velocity component
        const vn = this.vx * contact.nx + this.vz * contact.nz;
        if (vn < 0) {
          if (this.chargeT > 0 && -vn > P.chargeSpeed * 0.55) hitWall = contact;
          this.vx -= contact.nx * vn; this.vz -= contact.nz * vn;
        }
      }
      // world boundary (soft ellipse)
      this._boundary();
    }
    if (hitWall) this._chargeHitWall(hitWall);

    // ---- vertical integrate + support -----------------------------------------------------------------------------------
    const prevGrounded = this.grounded;
    const oldY = this.y;
    this.y += this.vy * dt;
    const sup = col.support(this.x, this.z, oldY, P.stepUp);
    const gap = this.y - sup.y;
    this.steep = false;
    if (this.vy <= 0 && gap <= 0.02 + (prevGrounded ? 0.32 : 0)) {
      // land / stick
      const nn = sup.kind === 'terrain' ? col.normalAt(this.x, this.z) : sup.kind === 'solid' ? [sup.n.nx, sup.n.ny, sup.n.nz] : [0, 1, 0];
      this.gnx = nn[0]; this.gny = nn[1]; this.gnz = nn[2];
      if (nn[1] < SLOPE_WALK) {
        this.steep = true;
        this.y = Math.max(this.y, sup.y);
        if (this.y < sup.y + 0.001) this.y = sup.y;
        this.grounded = false;
        this.vy = Math.max(this.vy, -4);
      } else {
        const impact = -this.vy;
        this.y = sup.y;
        if (!prevGrounded && impact > 5) { this.landPulse = clamp(impact / 22, 0.25, 1); this.emit('land', impact); }
        else if (!prevGrounded) this.emit('land', impact);
        this.vy = 0;
        this.grounded = true; this.gliding = false; this.jumpsUsed = 0; this.airTime = 0;
        this.groundKind = sup.kind; this.groundC = sup.c;
      }
    } else {
      this.grounded = false;
      this.groundKind = 'air'; this.groundC = null;
      this.airTime += dt;
    }
    if (prevGrounded && !this.grounded && this.vy <= 0) this.coyoteT = P.coyote;
    if (this.grounded && !prevGrounded) this.coyoteT = 0;
    if (!this.grounded && this.jumpsUsed === 0 && this.coyoteT <= 0 && this.vy < 0) this.jumpsUsed = 1; // walked off a ledge: glide available

    // ---- moving-platform carry (bobbing sky isles) -------------------------------------------------------------------
    if (this.grounded && this.groundC && this.groundC.vy !== undefined) this.y += this.groundC.vy * dt;

    // ---- safe spot memory + water + kill plane ---------------------------------------------------------------------------
    this._water(dt);
    if (this.grounded && !this.inWater && this.hurtT <= 0) {
      this.safeT -= dt;
      if (this.safeT <= 0 && (this.groundKind === 'collider' || this.groundKind === 'solid' || col.heightAt(this.x, this.z) > (this.game.waterHi ?? WATER_LEVEL) + 0.6)) {      // (in a realm with a tide: ground the sea does not reach even at high tide)
        this.safe.x = this.x; this.safe.y = this.y; this.safe.z = this.z; this.safe.yaw = this.yaw; this.safeT = 0.5;
      }
    }
    if (this.y < -14 && !this.dead) this.respawnSafe(true);

    // ---- flame timing --------------------------------------------------------------------------------------------------
    if (this.flameT > 0) { this.flameT -= dt; this.flameTick -= dt; if (this.flameT <= 0) { this.flameT = 0; this.flameCd = P.flameCooldown; } }
    // mouth position (for particles)
    this.mouth.x = this.x + this.dirx * 0.95; this.mouth.z = this.z + this.dirz * 0.95; this.mouth.y = this.y + 0.62;

    this._pose(dt, this.turnRate);
    // the flame starts at the model's actual mouth (it sits higher, and lifts further while breathing fire)
    if (this.flameT > 0 && this.model && this.model.mouthWorld) this.model.mouthWorld(this.x, this.y, this.z, this.yaw, this.mouth);
  }

  /**
   * Carried by a beam of light: `carry.at(k)` -> [x, y, z, yaw] gives the position `k` (0..1) of the way through the ride of `carry.dur` seconds. Nothing else moves the hero
   * meanwhile (no gravity, no collisions: he flies up through the dome); he rides with his wings out and is gone from `carry.vanish` on.
   */
  _carried(dt) {
    const c = this.carry;
    c.t += dt;
    const k = clamp(c.t / c.dur, 0, 1);
    const [x, y, z, yaw] = c.at(k);
    this.vy = (y - this.y) / Math.max(dt, 1e-4);
    this.x = x; this.y = y; this.z = z; this.yaw = yaw;
    this.vx = this.vz = 0;
    this.grounded = false; this.gliding = true; this.steep = false;
    this.chargeT = 0; this.flameT = 0; this.hurtT = 0; this.waterT = 0; this.inWater = false;
    this.dirx = Math.sin(yaw); this.dirz = Math.cos(yaw);
    this.vanish = c.vanish !== undefined && k >= c.vanish;
    this._pose(dt, 0);
    if (k >= 1 && c.onDone) { const done = c.onDone; c.onDone = null; done(); }
  }

  /** Things worth breathing fire at: unlit braziers and beacons, awake Snuffers, and vases / chests still to be broken open. */
  _aimTargets() {
    const g = this.game, out = this._aimList || (this._aimList = []);
    out.length = 0;
    for (const b of g.objects?.braziers || []) if (!b.lit) out.push({ x: b.x, z: b.z, r: 0.9 });
    for (const v of g.objects?.vases || []) if (!v.broken) out.push({ x: v.x, z: v.z, r: 0.6 });
    for (const c of g.objects?.chests || []) if (!c.opened) out.push({ x: c.x, z: c.z, r: 1.1 });
    for (const b of g.beacons?.list || []) if (!b.litFlag && !b.sealed) out.push({ x: b.x, z: b.z, r: b.radius || 1.5 });          // (a lantern a trial seals is not aimed at: the trial's own things are)
    if (g.trials) for (const q of g.trials.targets()) out.push(q);
    for (const e of g.enemies?.list || []) if (e.state !== 'dead' && !e.untargetable) out.push({ x: e.x, z: e.z, r: 0.8 });          // (a mole underground cannot be aimed at)
    return out;
  }

  /**
   * Aim assist: while breathing fire, swing towards the burnable thing nearest to straight ahead (inside a wide cone). The stick still
   * has the last word: with it pushed, the assist only helps if it already points roughly at that target.
   */
  _aimAssist(dt, mag, wx, wz) {
    const b = aimBearing(this.x, this.z, this.yaw, this._aimTargets());
    if (b === null) return;
    if (mag > 0.25 && Math.abs(angDiff(b, Math.atan2(wx, wz))) > 0.7) return;
    this.yaw = aimStep(this.yaw, b, dt);
  }

  /** Is a target at (x,y,z) with horizontal radius r inside the current fire breath? */
  flameHits(x, y, z, r = 0.5, dy = 2.4) {
    if (this.flameT <= 0) return false;
    const dx = x - this.mouth.x, dz = z - this.mouth.z;
    const d = Math.hypot(dx, dz);
    if (d > P.flameRange + r || Math.abs(y - (this.y + 0.6)) > dy) return false;
    if (d < r + 0.7) return true;
    const dot = (dx * this.dirx + dz * this.dirz) / d;
    return Math.acos(Math.min(1, dot)) < P.flameHalfAngle + Math.atan2(r, d);
  }

  /** Is a target in front of a charging Spyro's horns? */
  chargeHits(x, y, z, r = 0.5) {
    if (this.chargeT <= 0) return false;
    const dx = x - this.x, dz = z - this.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.4 + r || Math.abs(y - this.y) > 2.2) return false;
    if (d < r + 0.8) return true;
    return (dx * this.dirx + dz * this.dirz) / d > 0.3;
  }

  _boundary() {
    const L = this.game.level.valley;
    const dx = (this.x - L.x) / L.rx, dz = (this.z - L.z) / L.rz;
    const r = Math.hypot(dx, dz);
    const lim = 1.17;
    if (r > lim) {
      const k = lim / r;
      this.x = L.x + dx * k * L.rx; this.z = L.z + dz * k * L.rz;
      const nx = dx / r, nz = dz / r;
      const vn = this.vx * nx + this.vz * nz;
      if (vn > 0) { this.vx -= nx * vn; this.vz -= nz * vn; }
    }
    // The Dawn Gate stands in open ground: while its barrier holds, a ward seals the whole summit precinct for the hero.
    const barrier = this.game.objects?.barrier, S = this.game.level.summit;
    if (barrier && barrier.c.solid && S) {
      const R = WARD_RADIUS;
      const wx = this.x - S.x, wz = this.z - S.z, wd = Math.hypot(wx, wz) || 1e-4;
      if (wd < R) {
        const nx = wx / wd, nz = wz / wd;
        this.x = S.x + nx * R; this.z = S.z + nz * R;
        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) { this.vx -= nx * vn; this.vz -= nz * vn; }
        if (!this._wardShown) { this._wardShown = true; this.game.hud?.hint('AN ANCIENT WARD SEALS THE MOUNTAIN. RELIGHT FOUR BEACONS!', 5); }
      }
    }
  }

  _water(dt) {
    const col = this.game.collision;
    const onProp = this.groundKind === 'collider' || this.groundKind === 'solid';          // (a deck, a stair, a ledge of rock: the water below does not count)
    const ground = onProp ? this.y : col.heightAt(this.x, this.z);
    const sea = this.game.waterY ?? WATER_LEVEL;                // (the water's height now: the tide of a realm that has one moves it, see realm/tide.js; everywhere else it is WATER_LEVEL)
    const depth = sea - ground;
    const wasIn = this.inWater;
    this.inWater = !onProp && depth > 0.05 && (this.grounded || this.y < sea + 0.1);
    if (this.inWater && !wasIn) this.emit('splash', depth);
    const lethal = this.lethalDepth;
    if (this.inWater && depth > lethal && (this.y < sea - 0.3 || this.grounded)) {
      this.waterT += dt;
      if (this.waterT > 0.28) { this.emit('drown'); this.respawnSafe(true); }
    } else this.waterT = Math.max(0, this.waterT - dt * 2);
  }

  /** How deep the liquid must stand over what he is on to take him: water drowns from 0.95 m, a lake of lava burns at a touch (level.liquid.burnDepth). */
  get lethalDepth() { return (this.game.level && this.game.level.liquid && this.game.level.liquid.burnDepth) || 0.95; }

  /** Would the liquid take him at once if he stood at (x, y, z)? What stands over the bed - a deck, a ledge of rock - keeps him dry whatever lies under it. */
  _deadlyAt(x, y, z) {
    const sup = this.game.collision.support(x, z, y + 0.5, 0.9);
    return sup.kind === 'terrain' && (this.game.waterY ?? WATER_LEVEL) - sup.y > this.lethalDepth;
  }

  respawnSafe(fromHazard = false) {
    let s = this.safe;
    // A safe spot that would take him again is no safe spot (the data put him there: an arrival with no height once put him on the bed of the lake, and he drowned in the same place for ever): the start of
    // the world is dry by every check the worlds are held to, and from then on it is his safe spot
    if (fromHazard && this._deadlyAt(s.x, s.y, s.z)) { const b = this.game.startSpot && this.game.startSpot(); if (b) s = this.safe = { ...b }; }
    this.x = this.px = s.x; this.y = this.py = s.y + 0.05; this.z = this.pz = s.z;
    this.yaw = this.pyaw = s.yaw;
    this.vx = this.vy = this.vz = 0;
    this.gliding = false; this.chargeT = 0; this.flameT = 0; this.waterT = 0; this.inWater = false; this.grounded = false; this.hurtT = 0;
    this.invulnT = Math.max(this.invulnT, 1.2);
    this.emit('respawn', fromHazard);
  }

  /** Stop charging: no lingering dash — the speed drops back to a normal run right away. */
  _endCharge() {
    this.chargeT = 0; this.chargeCd = P.chargeCooldown;
    const s = Math.hypot(this.vx, this.vz);
    if (s > P.runSpeed) { const k = P.runSpeed / s; this.vx *= k; this.vz *= k; }
  }

  _chargeHitWall(contact) {
    // breakable things (cracked walls, ...) shatter and the charge carries on
    if (contact.c && contact.c.onCharge && contact.c.onCharge(this)) return;
    this.chargeT = 0; this.chargeCd = P.chargeCooldown + 0.25;
    const nx = contact.nx, nz = contact.nz;
    this.vx = nx * 6; this.vz = nz * 6; this.vy = 6;
    this.grounded = false;
    this.hurtT = 0.28; // brief stagger
    this.emit('wall', contact);
  }

  _updateDead(dt) {
    this.deadT += dt;
    const col = this.game.collision;
    this.vx *= Math.exp(-4 * dt); this.vz *= Math.exp(-4 * dt);
    this.vy -= P.gravity * dt;
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    const g = col.support(this.x, this.z, this.y, 0.3).y;
    if (this.y < g) { this.y = g; this.vy = 0; }
  }

  _pose(dt, turn) {
    const m = this.model;
    if (!m) return;
    const hv = this.speed;
    m.update(dt, {
      speed: hv, grounded: this.grounded, vy: this.vy,
      glide: this.gliding, charge: this.chargeT > 0, flame: this.flameT > 0,
      turn: clamp(turn, -1, 1), hurt: this.hurtT > 0 ? this.hurtT / P.hurtStun : 0, land: this.landPulse,
      dead: this.dead, cheer: this.cheer, look: this.lookT, t: this.time,
    });
    if (m.flash) m.flash(this.hurtT > 0 ? 0.75 * (this.hurtT / P.hurtStun) : 0);
  }

  /** Copy the (interpolated) transform onto the model root. */
  syncModel(alpha) {
    const m = this.model;
    if (!m) return;
    m.root.position.set(lerp(this.px, this.x, alpha), lerp(this.py, this.y, alpha), lerp(this.pz, this.z, alpha));
    m.root.rotation.y = this.pyaw + angDiff(this.yaw, this.pyaw) * alpha;
    // blink while invulnerable (i-frames); always visible during the hit stun itself
    const blinkOff = this.invulnT > 0 && !this.dead && this.hurtT <= 0 && !this.carry && ((this.time * 14) | 0) % 2 === 0;
    m.root.visible = !blinkOff && !this.vanish;
  }

  renderPos(alpha, out = {}) {
    out.x = lerp(this.px, this.x, alpha); out.y = lerp(this.py, this.y, alpha); out.z = lerp(this.pz, this.z, alpha);
    return out;
  }
}
