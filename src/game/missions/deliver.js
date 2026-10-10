// DELIVER (Tideglass Reach): the lenses of the Reach are dark and a tide pearl lights each of them. The pearls lie in the shallows (their beds are bare at low tide and under the sea at high, and a pearl under the sea
// cannot be taken: WAIT FOR THE EBB). The hero takes one by walking into it, and it floats over his shoulder as he goes; he carries one at a time, to any dark lens: within 4 m of it the pearl flies in and the lens shines.
// The sea takes a pearl back (he is in water over his knees), and so does a blow that hurts him or a fall that sets him back: it goes home to its bed. The lenses that the glass bridges and the lighthouse hold
// back are lit by the asks that seal them; a lens that a trial still seals does not take a pearl.
//
//   spec { kind: 'deliver', goals: [the lenses a pearl lights], pearls: [{ goal (the lens it lies nearest to the road of), at: [x, z] }] }
import { Mission } from './base.js';
import { makeModel } from '../models/fallback.js';

export const DELIVER = { pickR: 1.7, giveR: 4.2, drownDepth: 0.7, fly: 0.7, snap: 7 };

export class Deliver extends Mission {
  constructor(game, spec) {
    super(game, spec);
    const g = game;
    this.pearls = spec.pearls.map((q, i) => {
      const model = makeModel(g.assets, 'tidepearl', {}), y = g.collision.heightAt(q.at[0], q.at[1]) + 0.55;
      model.root.position.set(q.at[0], y, q.at[1]);
      this.group.add(model.root);
      const beam = makeModel(g.assets, 'light_beam', { height: 26, radius: 0.55 });
      beam.root.position.set(q.at[0], y + 12, q.at[1]);
      beam.setColor?.([0.45, 1.0, 0.88]); beam.setIntensity?.(0.35);
      this.group.add(beam.root);
      return { i, home: { x: q.at[0], y, z: q.at[1] }, state: 'rest', x: q.at[0], y, z: q.at[1], model, beam, flight: null, lens: null };
    });
    this.carry = null;
    this.t = 0;
    this.lastHurt = false;
    this.lastPos = null;
    this.warnCd = 0;
  }

  /** is the pearl's bed under the sea now? */
  _under(pr) { return this.game.waterY > pr.home.y - 0.35; }

  _drop(pr, why) {
    const g = this.game;
    this.carry = null;
    pr.state = 'rest'; pr.x = pr.home.x; pr.y = pr.home.y; pr.z = pr.home.z;
    g.fx.puff(pr.x, pr.y, pr.z, 0.7);
    g.audio?.sfx('trial_fail', { vol: 0.6 });
    g.hud.hint(why, 4);
  }

  update(dt, game) {
    super.update(dt);
    this.t += dt;
    this.warnCd = Math.max(0, this.warnCd - dt);
    const p = game.player;
    const R = DELIVER;
    if (!this.restored) {
      // the hero's fall, a set-back, a blow, the sea: what takes the pearl from him
      const hurt = p.hurtT > 0 && !this.lastHurt;
      this.lastHurt = p.hurtT > 0;
      const jumped = this.lastPos && Math.hypot(p.x - this.lastPos[0], p.z - this.lastPos[1]) > R.snap && !p.carry;
      this.lastPos = [p.x, p.z];
      if (this.carry) {
        const depth = game.waterY - game.collision.heightAt(p.x, p.z);
        if (p.dead || jumped) this._drop(this.carry, 'THE PEARL WENT HOME TO ITS BED');
        else if (hurt) this._drop(this.carry, 'YOU DROPPED THE PEARL: IT ROLLED HOME TO ITS BED');
        else if (p.inWater && depth > R.drownDepth) this._drop(this.carry, 'THE SEA TOOK THE PEARL BACK TO ITS BED');
      }
      for (const pr of this.pearls) {
        if (pr.state === 'rest') {
          const under = this._under(pr);
          pr.model.root.visible = !under; pr.beam.root.visible = !under;
          const d = Math.hypot(p.x - pr.x, p.z - pr.z);
          if (under && d < 7 && this.warnCd <= 0 && this.pending.length) { this.warnCd = 9; game.hud.hint('A PEARL LIES UNDER THE SEA: WAIT FOR THE EBB', 4); }
          if (!under && !this.carry && !p.dead && d < R.pickR && Math.abs(p.y - pr.y) < 2.4) {
            this.carry = pr; pr.state = 'carried';
            game.audio?.sfx('trial_pop', { vol: 0.9 });
            game.fx.sparkle(pr.x, pr.y + 0.4, pr.z, [0.7, 1, 0.92], 0.8);
            game.hud.hint(this.pending.length ? 'CARRY THE PEARL TO A DARK LENS' : 'THE LENSES ARE LIT', 4);
          }
        }
      }
      // the delivery: within 4 m of a dark lens the pearl flies in
      if (this.carry && !p.dead) {
        for (const b of this.pending) {
          if (Math.hypot(p.x - b.x, p.z - b.z) > R.giveR + 1.5 * (b.scale - 1)) continue;
          if (b.sealed) { this.rebuff(b); break; }
          const pr = this.carry;
          this.carry = null; pr.state = 'fly'; pr.lens = b; pr.flight = { t: 0, from: [pr.x, pr.y, pr.z] };
          game.audio?.sfx('trial_pop', { vol: 0.8 });
          break;
        }
      }
      this._flameRebuff(p, 'THE LENS TAKES NO FIRE: CARRY A TIDE PEARL TO IT');
    }
    // where each pearl is
    for (const pr of this.pearls) {
      if (pr.state === 'carried') {
        const a = p.yaw + Math.PI * 0.75, tx = p.x + Math.sin(a) * 0.9, tz = p.z + Math.cos(a) * 0.9, ty = p.y + 2.35 + Math.sin(this.t * 3) * 0.12;
        const k = 1 - Math.exp(-9 * dt);
        pr.x += (tx - pr.x) * k; pr.y += (ty - pr.y) * k; pr.z += (tz - pr.z) * k;
        pr.beam.root.visible = false;
      } else if (pr.state === 'fly') {
        const f = pr.flight, b = pr.lens, fp = game.beacons.flamePos(b);
        f.t += dt / R.fly;
        const u = Math.min(1, f.t), e = u * u * (3 - 2 * u);
        pr.x = f.from[0] + (fp.x - f.from[0]) * e; pr.z = f.from[2] + (fp.z - f.from[2]) * e;
        pr.y = f.from[1] + (fp.y - f.from[1]) * e + Math.sin(Math.PI * u) * 1.6;
        if (u >= 1) { pr.state = 'placed'; pr.model.root.visible = false; pr.beam.root.visible = false; game.fx.sparkle(fp.x, fp.y, fp.z, [0.7, 1, 0.92], 1.2); this.complete(b); }
      } else if (pr.state === 'placed') { continue; }
      pr.model.root.position.set(pr.x, pr.y, pr.z);
      pr.model.update(dt, { carried: pr.state === 'carried' || pr.state === 'fly' ? 1 : 0, t: this.t });
      if (pr.state === 'rest' && pr.beam.root.visible) pr.beam.update?.(dt, { t: this.t });
      if (pr.state === 'rest' && pr.model.root.visible && Math.random() < dt * 4) game.fx.sparkle(pr.x + (Math.random() - 0.5) * 0.7, pr.y + 0.2 + Math.random() * 0.8, pr.z + (Math.random() - 0.5) * 0.7, [0.7, 1, 0.92], 0.4);
    }
  }

  hudState() {
    const n = this.done, of = this.owned.length;
    if (n >= of) return null;
    if (this.carry) return { text: 'CARRY THE PEARL TO A DARK LENS', n, of };
    return { text: `PEARLS DELIVERED  ${n} OF ${of}`, n, of };
  }

  restore() {
    super.restore();
    for (const pr of this.pearls) { pr.state = 'placed'; pr.model.root.visible = false; pr.beam.root.visible = false; }
  }

  dispose() {
    for (const pr of this.pearls) { pr.model.dispose?.(); pr.beam.dispose?.(); }
    super.dispose();
  }
}
