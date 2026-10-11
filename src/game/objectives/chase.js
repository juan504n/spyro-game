// CHASE (Frostbloom Hollow): a frost sprite has bolted with the spring of the Hollow, and the whole realm is the race track. It waits at the Thaw Gate until the hero comes up to it, and then it runs: along
// the trunk road, round Glasswater, up Aurora Ridge and into the gorge, as fast as the hero's walk and not much faster, and it looks back. It does not run for ever: at three places on the way (spec.catches,
// indexes into the route) it is cornered, and waits, shaking, for him. A ram that touches it (or a run into it) is a catch: it bursts into blossom, drops a few gems, and runs on to the next corner. The second catch
// is in the gorge, and the ice gate melts to let the chase into the Hollow; the third is at the Heartbloom, which opens when the sprite gives the spring back. Nothing is lit, freed or carried, and there is no row of
// things to visit: one runaway, one road.
//
//   spec { kind: 'chase', final: the Heartbloom, route: [[x, z] ...], catches: [indexes into route: where it is cornered; the last is the last point], gate: the catch (1-based) after which the ice gate melts }
import { Objective } from './base.js';
import { makeModel } from '../models/fallback.js';

export const CHASE = { height: 1.7, runSpeed: 10.2, fleeR: 26, slowSpeed: 3.6, lagR: 38, catchR: 3.3, touchR: 1.8, waitR: 20, stunT: 1.3, cornerT: 40, gems: [2, 2, 1, 1, 5] };

const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export class Chase extends Objective {
  constructor(game, spec) {
    super(game, spec);
    this.route = spec.route;
    this.cum = [0];                                                              // (the distance along the route of each of its points)
    for (let i = 1; i < this.route.length; i++) this.cum.push(this.cum[i - 1] + dist2(this.route[i - 1], this.route[i]));
    this.len = this.cum[this.cum.length - 1];
    this.catches = spec.catches;
    this.k = 0;                                                                  // how many it has been caught
    this.s = 0;                                                                  // the sprite's distance along the route
    this.state = 'wait';                                                         // wait (for the hero) | run | corner (waits for him at the end of a leg) | stun (just caught: a breath, then it runs)
    this.stunT = 0;
    this.t = 0;
    this.cornerWait = 0;
    const g = game;
    this.model = makeModel(g.assets, 'bloomsprite', {});
    this.group.add(this.model.root);
    this.beam = makeModel(g.assets, 'light_beam', { height: 46, radius: 0.8 });
    this.beam.setColor?.([0.7, 0.95, 1.0]);
    this.beam.setIntensity?.(0.55);
    this.group.add(this.beam.root);
    this.pos = { x: this.route[0][0], y: 0, z: this.route[0][1], yaw: 0 };
    this._place(0);
    this.told = {};
  }

  /** the route's point at distance s along it */
  _at(s) {
    const c = this.cum;
    let i = 1;
    while (i < c.length - 1 && c[i] < s) i++;
    const a = this.route[i - 1], b = this.route[i], u = Math.max(0, Math.min(1, (s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1])));
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, Math.atan2(b[0] - a[0], b[1] - a[1])];
  }

  _place(dt) {
    const g = this.game, [x, z, yaw] = this._at(this.s), p = this.pos;
    const gy = g.collision.heightAt(x, z), ty = Math.max(gy, g.waterY ?? 0) + CHASE.height + Math.sin(this.t * 3.1) * 0.25;
    p.y = dt > 0 ? p.y + (ty - p.y) * Math.min(1, dt * 6) : ty;
    p.x = x; p.z = z; p.yaw = yaw;
    this.model.root.position.set(x, p.y, z);
    this.model.root.rotation.y = yaw;
    this.beam.root.position.set(x, gy + 22, z);
  }

  /** the end of the leg the sprite is on: the route point of the next catch */
  get target() { return this.catches[Math.min(this.k, this.catches.length - 1)]; }
  get targetS() { return this.cum[this.target]; }

  _caught() {
    const g = this.game, p = this.pos;
    this.k++;
    g.audio?.sfx('trial_pop', { vol: 1 });
    g.cam.shake(0.3, 0.35);
    g.fx.shards(p.x, p.y, p.z, [[0.7, 0.94, 1.0], [1.0, 0.7, 0.88]], 18);
    g.gems.burst(p.x, p.y, p.z, CHASE.gems.slice(0, 2 + this.k), 1.4);
    this.progress(this.k / this.catches.length);
    if (this.k === this.spec.gate) { g.openRealmGate(); }
    if (this.k >= this.catches.length) {
      g.hud.hint('THE SPRITE GIVES THE SPRING BACK', 4);
      this.state = 'done';
      this.model.setPose?.({});
      this.complete();
      return;
    }
    g.hud.hint(this.k === 1 ? 'CAUGHT! IT BOLTS AGAIN: AFTER IT, UP AURORA RIDGE' : 'CAUGHT AGAIN! ONE MORE: IT RUNS FOR THE HEARTBLOOM', 4.5);
    this.state = 'stun';
    this.stunT = CHASE.stunT;
  }

  update(dt, game) {
    super.update(dt, game);
    const p = game.player;
    this.t += dt;
    if (this.restored || this.done) { if (this.state !== 'done') this._hide(); return; }
    const hx = p.x, hz = p.z, d = Math.hypot(hx - this.pos.x, hz - this.pos.z);
    if (!this.told.start && d < 60 && game.mode === 'play') { this.told.start = true; game.hud.hint('A SPRITE HAS BOLTED WITH THE SPRING: RUN IT DOWN, AND RAM IT WHEN YOU REACH IT!', 6); }
    if (this.state === 'wait') {
      if (d < CHASE.waitR) this.state = 'run';
    } else if (this.state === 'stun') {
      this.stunT -= dt;
      if (this.stunT <= 0) this.state = 'run';
    } else if (this.state === 'run' || this.state === 'corner') {
      const end = this.targetS;
      if (this.state === 'run') {
        // it runs as fast as the hero's walk when he is near, and dawdles when he is far behind (it must not run away from the whole realm)
        const v = d < CHASE.fleeR ? CHASE.runSpeed : d < CHASE.lagR ? CHASE.slowSpeed + (CHASE.runSpeed - CHASE.slowSpeed) * (CHASE.lagR - d) / (CHASE.lagR - CHASE.fleeR) : CHASE.slowSpeed * 0.7;
        this.s = Math.min(end, this.s + v * dt);
        if (this.s >= end - 1e-3) { this.state = 'corner'; this.cornerWait = 0; if (!this.told[`c${this.k}`]) { this.told[`c${this.k}`] = true; game.hud.hint('CORNERED! RAM IT BEFORE IT SLIPS AWAY', 3.5); } }
      } else {
        this.cornerWait += dt;
      }
      // a ram that reaches it, or a run into it - but only where it is cornered: a sprite on the run slips out of a ram (it is a runner, not a target)
      if (!p.dead && this.state === 'corner') {
        const ram = p.chargeT > 0 && p.chargeHits(this.pos.x, this.pos.y, this.pos.z, CHASE.catchR);
        if (ram || d < CHASE.touchR) this._caught();
      } else if (!p.dead && this.state === 'run' && p.chargeT > 0 && p.chargeHits(this.pos.x, this.pos.y, this.pos.z, CHASE.catchR) && !this.told.slip) {
        this.told.slip = true;
        game.hud.hint('IT SLIPS OUT OF THE RAM! WAIT FOR IT TO BE CORNERED', 3.5);
      }
    }
    this._place(dt);
    const speed = this.state === 'run' ? CHASE.runSpeed : this.state === 'corner' ? 0.5 : 0;
    this.model.update(dt, { speed, bloom: this.state === 'stun' ? 1 : 0, t: this.t });
    this.beam.update?.(dt, { t: this.t });
    if ((this.state === 'run' || this.state === 'corner') && Math.random() < dt * 14) game.fx.sparkle(this.pos.x + (Math.random() - 0.5) * 0.8, this.pos.y - 0.2, this.pos.z + (Math.random() - 0.5) * 0.8, [0.75, 0.95, 1.0], 0.5);
  }

  _hide() { this.model.root.visible = false; this.beam.root.visible = false; }

  hudState() {
    if (this.done) return null;
    const d = Math.round(Math.hypot(this.game.player.x - this.pos.x, this.game.player.z - this.pos.z));
    const text = this.state === 'wait' ? 'THE RUNAWAY SPRITE WAITS AT THE GATE' : this.state === 'corner' ? 'IT IS CORNERED: RAM IT!' : `RUN DOWN THE SPRITE  ${d} M`;
    return { text, n: this.k, of: this.catches.length };
  }

  restore() {
    super.restore();
    this._hide();
    this.k = this.catches.length;
    this.state = 'done';
  }

  dispose() {
    this.model.dispose?.();
    this.beam.dispose?.();
    super.dispose();
  }
}
