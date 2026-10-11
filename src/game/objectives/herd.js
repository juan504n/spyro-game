// HERD (Tideglass Reach): the lantern crabs of the harbour have scattered up the headland in the dark, and the lighthouse cannot be lit without them (they carry its lamps). They are shy: a crab runs from
// the hero when he comes within 10 m, away from him and a little towards the pen at the foot of the lighthouse (it likes the light), faster the nearer he is, and it will not run over a drop, into a wall or
// into the deep. He drives them: up the headland road, behind them, round the stragglers, until every crab is inside the ring of the pen. Nothing is lit, freed or carried: five frightened animals, one road,
// and a ridge with a cliff each side. The Sea Gate on the way up opens when the glass bridges below have been crossed (spec.gateAfter, a trial's id: the circuit of the cliffwalk).
//
//   spec { kind: 'herd', final: the lens at the lighthouse, crabs: [[x, z] ...], pen: [x, z], penR, gateAfter?: a trial's id }
import { Objective } from './base.js';
import { makeModel } from '../models/fallback.js';

export const HERD = { fleeR: 10.5, calm: 16, vMin: 2.4, vMax: 7.6, penPull: 0.8, scale: 0.62, lookahead: 1.7, step: 0.75, wade: 0.5, hintR: 46, wander: 0.9, downhill: 0.4 };

const RING_K = 0.875;
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const OFFS = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.1, -2.1];

export class Herd extends Objective {
  constructor(game, spec) {
    super(game, spec);
    const g = game;
    this.pen = spec.pen;
    this.penR = spec.penR;
    this.crabs = spec.crabs.map((q, i) => {
      const model = makeModel(g.assets, 'shellback', { seed: i + 3 });
      model.root.scale.setScalar(HERD.scale);
      this.group.add(model.root);
      const lamp = g.fx.billboard({ pool: 'add', sprite: 'glow', size: 1.8, color: [1.0, 0.82, 0.45], alpha: 0.8 });
      const y = g.collision.heightAt(q[0], q[1]);
      return { model, lamp, x: q[0], z: q[1], y, yaw: Math.random() * 6.28, vx: 0, vz: 0, hx: q[0], hz: q[1], penned: false, wa: Math.random() * 6.28, speed: 0, i };
    });
    this.ring = g.fx.decal({ pool: 'add', sprite: 'ring', x: this.pen[0], z: this.pen[1], r: this.penR / RING_K, color: [1.0, 0.82, 0.45], alpha: 0.5, lift: 0.14 });
    this.ring.y = g.collision.heightAt(this.pen[0], this.pen[1]) + 0.12;
    this.t = 0;
    this.told = {};
  }

  get penned() { return this.crabs.filter((c) => c.penned).length; }

  /** whether a crab may stand at (x, z): ground it can step to, shallow enough, with nothing solid in the way */
  _ok(c, x, z) {
    const g = this.game, gy = g.collision.heightAt(x, z);
    if (gy < (g.waterY ?? 0) - HERD.wade) return false;
    if (Math.abs(gy - c.y) > HERD.step) return false;
    return !g.collision.blocking(x, gy + 0.45, z, 0.5);
  }

  update(dt, game) {
    super.update(dt, game);
    if (this.restored || this.done) return;
    const g = game, p = g.player, H = HERD;
    this.t += dt;
    if (!this.told.start && g.mode === 'play' && !p.dead && this.crabs.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < H.hintR)) { this.told.start = true; g.hud.hint('THE LANTERN CRABS RUN FROM YOU! DRIVE THEM UP THE HEADLAND INTO THE RING BY THE LIGHTHOUSE', 6.5); }
    for (const c of this.crabs) {
      const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
      const dpen = Math.hypot(this.pen[0] - c.x, this.pen[1] - c.z);
      let want = null, speed = 0;
      if (c.penned) {
        c.wa += (Math.random() - 0.5) * dt * 3;
        if (dpen > this.penR * 0.7) { want = Math.atan2(this.pen[0] - c.x, this.pen[1] - c.z); speed = 1.2; }
        else { want = c.wa; speed = 0.7; }
      } else if (!p.dead && d < H.fleeR) {
        // it runs from him, and the light draws it: with him behind it (the pen the other way) it runs for the pen; with him between it and the pen it runs round him, away from him and a little towards the pen
        const away = Math.atan2(dx, dz), toPen = Math.atan2(this.pen[0] - c.x, this.pen[1] - c.z);
        const behind = Math.abs(wrapA(toPen - (away + Math.PI))) / Math.PI;                       // (0: he is straight between it and the pen .. 1: he is straight behind it)
        const w = Math.max(0, Math.min(1, (behind - 0.35) / 0.3));
        const ax = (1 - w) * (Math.sin(away) + H.penPull * Math.sin(toPen)) + w * Math.sin(toPen), az = (1 - w) * (Math.cos(away) + H.penPull * Math.cos(toPen)) + w * Math.cos(toPen);
        want = Math.atan2(ax, az);
        speed = H.vMin + (H.vMax - H.vMin) * (1 - d / H.fleeR);
        c.hx = c.x; c.hz = c.z;
      } else {
        c.wa += (Math.random() - 0.5) * dt * 2;
        const dh = Math.hypot(c.hx - c.x, c.hz - c.z);
        if (dh > 5) c.wa += wrapA(Math.atan2(c.hx - c.x, c.hz - c.z) - c.wa) * Math.min(1, dt * 1.5);          // (it noses about, but stays where it was left: it does not graze off over the headland)
        want = c.wa; speed = d < H.calm ? 0.5 : 0.9;
        if (Math.random() < dt * 0.15) speed = 0;
      }
      // the nearest heading to the wanted one that has ground to go to
      let moved = false;
      if (speed > 0) {
        for (const o of OFFS) {
          const h = want + o, nx = c.x + Math.sin(h) * H.lookahead, nz = c.z + Math.cos(h) * H.lookahead;
          if (!this._ok(c, nx, nz)) continue;
          if (!c.penned && c.y > (g.waterY ?? 0) + 5 && g.collision.heightAt(nx, nz) < c.y - H.downhill) continue;          // (a crab does not run down to the sea from the light: it turns along the slope, or is cornered)
          const sx = c.x + Math.sin(h) * speed * dt, sz = c.z + Math.cos(h) * speed * dt;
          c.x = sx; c.z = sz;
          c.yaw += wrapA(h - c.yaw) * Math.min(1, dt * 9);
          moved = true;
          break;
        }
        if (!moved && !c.penned) c.wa = want + Math.PI * (Math.random() < 0.5 ? 0.5 : -0.5);          // (cornered: it turns about)
      }
      c.speed = moved ? speed : 0;
      c.y += (g.collision.heightAt(c.x, c.z) - c.y) * Math.min(1, dt * 14);
      if (!c.penned && dpen < this.penR) {
        c.penned = true;
        g.audio?.sfx('trial_pop', { vol: 0.8 });
        g.fx.sparkle(c.x, c.y + 1, c.z, [1, 0.85, 0.5], 0.8);
        g.hud.hint(this.penned >= this.crabs.length ? 'THE LAST CRAB IS HOME! THE LIGHTHOUSE CAN BE LIT' : `A CRAB IS PENNED  ${this.penned} OF ${this.crabs.length}`, 3.5);
        this.progress(this.penned / this.crabs.length);
      }
      c.model.root.position.set(c.x, c.y, c.z);
      c.model.root.rotation.y = c.yaw;
      c.model.update(dt, { speed: c.speed, alert: !c.penned && d < H.fleeR ? 1 : 0, dir: 1, t: this.t });
      c.lamp.x = c.x; c.lamp.y = c.y + 1.45; c.lamp.z = c.z;
      c.lamp.alpha = (c.penned ? 0.95 : 0.65) * (0.85 + 0.15 * Math.sin(this.t * 4 + c.i));
    }
    this.ring.alpha = 0.35 + 0.2 * Math.sin(this.t * 2) + 0.12 * this.penned;
    if (this.penned >= this.crabs.length) this.complete();
  }

  hudState() {
    if (this.done) return null;
    return { text: `LANTERN CRABS PENNED  ${this.penned} OF ${this.crabs.length}`, n: this.penned, of: this.crabs.length };
  }

  restore() {
    super.restore();
    for (const c of this.crabs) { c.penned = true; const a = (c.i / this.crabs.length) * 6.28; c.x = this.pen[0] + Math.cos(a) * this.penR * 0.5; c.z = this.pen[1] + Math.sin(a) * this.penR * 0.5; c.y = this.game.collision.heightAt(c.x, c.z); c.model.root.position.set(c.x, c.y, c.z); c.lamp.x = c.x; c.lamp.y = c.y + 1.45; c.lamp.z = c.z; }
  }

  dispose() {
    for (const c of this.crabs) { c.model.dispose?.(); c.lamp.dead = true; }
    this.ring.dead = true;
    super.dispose();
  }
}
