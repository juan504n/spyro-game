// STORM (Skyweaver Spires): the Weavers' wind has gone wrong, and a squall is coming up behind the hero across the sky. It starts at the Skygate when he first walks away from the door, a long way behind him, and
// follows the way the islands go (spec.route: the hops, the glides and the whirlwinds, in order) at a steady pace that eases off when he is far ahead and presses when he is near. A wall of dark cloud marks its
// front, and what is behind the front is in the storm: it buffets and hurts, once a second. The hero outruns it to the Loom Isle at the top of the world, where the wind turns and the Loom rings. At the islands
// where the way pauses (spec.refuges) he is safe and they are his checkpoints: if the storm takes him he comes back to the last of them, and the storm is a good way behind him again.
//
//   spec { kind: 'storm', final: the Loom, route: [[x, z] ...], speed: m/s at its ordinary pace, refuges: [indexes into route], lead: how far behind it starts (70 m), finishR: how near the final goal is the end (14 m) }
import { Objective } from './base.js';

export const STORM = { lead: 70, far: 130, near: 36, farMul: 1.7, nearMul: 0.55, hurtEvery: 1.1, window: [60, 170], reach: 46, finishR: 14, sight: 95, refugeR: 11 };

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + (b - a) * Math.random();

export class Storm extends Objective {
  constructor(game, spec) {
    super(game, spec);
    this.route = spec.route;
    this.cum = [0];
    for (let i = 1; i < this.route.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(this.route[i][0] - this.route[i - 1][0], this.route[i][1] - this.route[i - 1][1]));
    this.len = this.cum[this.cum.length - 1];
    this.base = spec.speed;
    this.lead0 = spec.lead ?? STORM.lead;
    this.finishR = spec.finishR ?? STORM.finishR;
    this.refuges = spec.refuges || [];
    this.started = false;
    this.P = 0;                                    // how far along the route the hero has got (the most; it follows him back when he is set back)
    this.S = -this.lead0;                          // where the storm's front is
    this.hurtT = 0;
    this.t = 0;
    this.told = {};
    this.last = -1;                                // the refuge he last stood at
    game.on('respawned', () => this._setBack());
  }

  /** the route's point and heading at distance s */
  _at(s) {
    const c = this.cum, n = c.length;
    s = clamp(s, 0, this.len);
    let i = 1;
    while (i < n - 1 && c[i] < s) i++;
    const a = this.route[i - 1], b = this.route[i], u = clamp((s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]));
    return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, dx: b[0] - a[0], dz: b[1] - a[1] };
  }

  /** the distance along the route of the point of it nearest to (x, z), looked for in a window round `near` (the route may come back near itself: it must not jump); Infinity when the hero is off the route */
  _project(x, z, near) {
    let best = Infinity, bs = near;
    for (let i = 1; i < this.route.length; i++) {
      const lo = this.cum[i - 1], hi = this.cum[i];
      if (hi < near - STORM.window[0] || lo > near + STORM.window[1]) continue;
      const a = this.route[i - 1], b = this.route[i], vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz || 1;
      const u = clamp(((x - a[0]) * vx + (z - a[1]) * vz) / l2), d = Math.hypot(x - (a[0] + vx * u), z - (a[1] + vz * u));
      if (d < best) { best = d; bs = lo + u * (hi - lo); }
    }
    return best < STORM.reach ? bs : Infinity;
  }

  _setBack() {
    if (this.done || this.restored) return;
    const p = this.game.player;
    const s = this._project(p.x, p.z, this.P);
    if (Number.isFinite(s)) this.P = s;
    this.S = this.P - this.lead0;
    this.hurtT = 0;
    this.game.hud.hint('THE STORM IS BEHIND YOU AGAIN: RUN!', 3.5);
  }

  update(dt, game) {
    super.update(dt, game);
    if (this.restored || this.done) return;
    const g = game, p = g.player;
    this.t += dt;
    if (!this.started) {
      const d0 = Math.hypot(p.x - this.route[0][0], p.z - this.route[0][1]);
      if (g.mode === 'play' && d0 > 6) { this.started = true; g.hud.hint('A STORM IS COMING UP BEHIND YOU! RUN FOR THE LOOM AT THE TOP OF THE WORLD', 6); g.audio?.sfx('foe_vent', { vol: 0.8 }); }
      return;
    }
    // how far he has got
    if (!p.dead) {
      const s = this._project(p.x, p.z, this.P);
      if (Number.isFinite(s) && s > this.P) this.P = s;
    }
    const lead = this.P - this.S;
    // the storm's pace: a steady one, pressing when he is near and easing when he is far ahead (so the race is a race for a hero who is quick and for one who is not)
    const mul = lead > STORM.far ? STORM.farMul : lead < STORM.near ? STORM.nearMul : 1;
    this.S += this.base * mul * dt;
    // refuges: the hero is safe there, and it is his checkpoint
    this.refuges.forEach((ri) => {
      if (ri <= this.last) return;
      const q = this.route[ri];
      if (!p.dead && Math.hypot(p.x - q[0], p.z - q[1]) < STORM.refugeR) {
        this.last = ri;
        g.setCheckpoint({ x: p.x, y: p.y, z: p.z, yaw: p.yaw });
        g.audio?.sfx('trial_pop', { vol: 0.6 });
      }
    });
    // in the storm
    if (this.S > this.P - 0.01 && !p.dead && this.S > 0) {
      this.hurtT -= dt;
      if (this.hurtT <= 0) {
        this.hurtT = STORM.hurtEvery;
        const f = this._at(this.S);
        g.playerHurt(f.x, f.z);
        g.cam.shake(0.3, 0.3);
        if (!this.told.swept) { this.told.swept = true; g.hud.hint('THE STORM HAS YOU! GET OUT AHEAD OF IT', 4); }
      }
    } else this.hurtT = 0.4;
    this.progress(this.P / this.len);
    // the end: the Loom
    const fin = this.final;
    if (!p.dead && this.P > this.len * 0.85 && Math.hypot(p.x - fin.x, p.z - fin.z) < this.finishR && Math.abs(p.y - fin.y) < 10) this.complete();          // (he has come by the way: a warp to the Loom does not outrun anything)
    this._clouds(dt, p);
  }

  /** the front of the storm: a wall of dark cloud across the way, near the hero when it is near */
  _clouds(dt, p) {
    const g = this.game;
    if (this.S < 0) return;
    const f = this._at(this.S), d = Math.hypot(p.x - f.x, p.z - f.z);
    if (d > STORM.sight + 40) return;
    const l = Math.hypot(f.dx, f.dz) || 1, fx = f.dx / l, fz = f.dz / l, px = -fz, pz = fx;
    const n = Math.min(10, Math.round(dt * 160));
    for (let i = 0; i < n; i++) {
      const w = rnd(-38, 38), back = rnd(0, 9);
      g.fx.spawn({ pool: 'half', frames: ['smoke_0', 'smoke_1'], overLife: true, x: f.x + px * w - fx * back, y: p.y + rnd(-9, 14), z: f.z + pz * w - fz * back, vx: fx * this.base * 0.6, vy: rnd(-0.4, 0.8), vz: fz * this.base * 0.6, life: rnd(1.8, 3), size: [9, 20], c0: [0.26, 0.18, 0.42, 0.7], c1: [0.18, 0.12, 0.3, 0] });
    }
    if (Math.random() < dt * 0.35 && d < STORM.sight) { g.cam.shake(0.12, 0.15); g.audio?.sfx('trial_seal', { vol: 0.25 }); }
  }

  hudState() {
    if (this.done) return null;
    if (!this.started) return { text: 'THE WIND IS TURNING: THE WEAVERS\' LOOM LIES AT THE TOP OF THE WORLD' };
    const lead = this.P - this.S;
    return { text: lead <= 0 ? 'THE STORM HAS YOU!' : 'OUTRUN THE STORM', bar: clamp(lead / (STORM.far * 0.9)) };
  }

  restore() { super.restore(); }
}
