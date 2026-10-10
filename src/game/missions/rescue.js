// RESCUE (Frostbloom Hollow): a sprite sleeps in the ice of each frozen bloom and breathing on it does nothing for it. RAM the bloom and the ice cracks: the bloom opens (it is lit: the realm gets a step nearer its dawn) and
// the sprite flies out and FOLLOWS the hero, a little behind him and over his shoulder, in a loose fan. The sprites are not hurt by anything, but they are not safe either: a hero who falls sends them flying home to
// their blooms, where they wait (a sprite that waited is his again when he comes within 6 m of its bloom). With `need` sprites at his side he comes to the Heartbloom, and it opens to their song: the realm is saved, and the
// sprites circle it. A bloom that a trial still seals (the puck on the islet) must have its trial done first.
//
//   spec { kind: 'rescue', goals: [the blooms with a sprite in them], final: the Heartbloom, need: how many sprites it wants with him }
import { Mission } from './base.js';
import { makeModel } from '../models/fallback.js';

export const RESCUE = { slotR: 2.3, slotStep: 0.62, height: 1.9, follow: 6.5, maxSpeed: 24, snapDist: 42, wakeR: 6.5, finalR: 12, orbitR: 3.6, orbitH: 4.6 };

const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Rescue extends Mission {
  constructor(game, spec) {
    super(game, spec);
    this.final = game.beacons.get(spec.final);
    if (!this.final) throw new Error(`mission: there is no goal '${spec.final}'`);
    this.final.mission = this;
    this.need = spec.need;
    this.sprites = [];                         // the sprites that are free: { b (its bloom), state: 'follow' | 'wait' | 'sing', model, x, y, z, vx, vy, vz, yaw, phase }
    this.fell = false;
    this.t = 0;
    game.on('beacon', (b) => { if (b === this.final) this._sing(); });
  }

  /** a sprite comes out of bloom `b` */
  _spawn(b, state) {
    const g = this.game, model = makeModel(g.assets, 'bloomsprite', {});
    const fp = g.beacons.flamePos(b);
    const s = { b, state, model, x: fp.x, y: fp.y + 0.4, z: fp.z, vx: 0, vy: 0, vz: 0, yaw: 0, phase: this.sprites.length * 1.7, orbit: this.sprites.length * 1.9 };
    model.root.position.set(s.x, s.y, s.z);
    this.group.add(model.root);
    this.sprites.push(s);
    return s;
  }

  _free(b, p) {
    if (b.sealed) { this.rebuff(b); p.chargeT = 0; p.chargeCd = 0.5; return; }
    const g = this.game;
    p.chargeT = 0; p.chargeCd = 0.5; p.vx *= 0.15; p.vz *= 0.15;                     // (the ram ends on the ice: he does not run on over an islet's edge)
    g.audio?.sfx('trial_break', { vol: 0.9 });
    g.cam.shake(0.25, 0.3);
    const fp = g.beacons.flamePos(b);
    g.fx.shards(fp.x, fp.y, fp.z, [[0.7, 0.94, 1.0], [0.9, 0.98, 1.0]], 14);
    this._spawn(b, 'follow');
    this.complete(b);
    g.hud.hint(this.sprites.length < this.need ? 'THE SPRITE IS FREE AND FOLLOWS YOU' : 'LEAD THE SPRITES TO THE HEARTBLOOM', 4);
  }

  _sing() {
    for (const s of this.sprites) s.state = 'sing';
  }

  update(dt, game) {
    super.update(dt);
    const p = game.player;
    this.t += dt;
    const finalLit = this.final.litFlag;
    if (!this.restored && !finalLit) {
      // the ram on a frozen bloom (and the flame, which it turns away)
      if (p.chargeT > 0) for (const b of this.pending) if (b !== this.final && p.chargeHits(b.x, b.y + 1.6 * b.scale, b.z, b.radius + 0.6)) { this._free(b, p); break; }
      this._flameRebuff(p, 'FIRE WILL NOT WAKE IT: RAM THE FROSTBLOOM TO FREE THE SPRITE IN THE ICE');
      if (!p.dead) this.fell = false;
      else if (!this.fell) {                                                 // (he has fallen: the sprites fly home and wait there)
        this.fell = true;
        let any = false;
        for (const s of this.sprites) if (s.state === 'follow') { s.state = 'wait'; any = true; }
        if (any) game.hud.hint('THE SPRITES FLEW HOME TO THEIR BLOOMS: FETCH THEM', 4.5);
      }
      // the Heartbloom wakes when he comes with the sprites
      const followers = this.sprites.filter((s) => s.state === 'follow');
      if (followers.length >= this.need && !p.dead && Math.hypot(p.x - this.final.x, p.z - this.final.z) < RESCUE.finalR) this.complete(this.final);
    }
    this._sprites(dt, p);
  }

  /** the sprites' flight: a spring to where each should be, a bob, a turn to where it goes */
  _sprites(dt, p) {
    const fol = this.sprites.filter((s) => s.state === 'follow'), n = fol.length;
    const R = RESCUE;
    this.sprites.forEach((s) => {
      let tx, ty, tz, rate = 5, k = 0;
      if (s.state === 'follow') {
        const i = fol.indexOf(s), a = p.yaw + Math.PI + (i - (n - 1) / 2) * R.slotStep, r = R.slotR + 0.25 * i;
        tx = p.x + Math.sin(a) * r; tz = p.z + Math.cos(a) * r;
        ty = p.y + R.height + Math.sin(this.t * 2.1 + s.phase) * 0.3;
        if (Math.hypot(tx - s.x, tz - s.z) > R.snapDist) { s.x = tx; s.y = ty; s.z = tz; s.vx = s.vy = s.vz = 0; }       // (left a long way behind: it is there)
        rate = 6.5;
      } else if (s.state === 'wait') {
        tx = s.b.x + Math.sin(this.t * 0.9 + s.phase) * 0.8; tz = s.b.z + Math.cos(this.t * 0.9 + s.phase) * 0.8;
        ty = s.b.y + 3.6 + Math.sin(this.t * 1.7 + s.phase) * 0.35;
        rate = 3;
        if (!p.dead && Math.hypot(p.x - s.b.x, p.z - s.b.z) < R.wakeR) { s.state = 'follow'; this.game.audio?.sfx('trial_pop', { vol: 0.7 }); }
      } else {                                                                // 'sing': round the Heartbloom, over it, slowly
        s.orbit += dt * (1.0 + 0.15 * (s.phase % 3));
        const f = this.final;
        tx = f.x + Math.cos(s.orbit) * R.orbitR; tz = f.z + Math.sin(s.orbit) * R.orbitR; ty = f.y + R.orbitH + Math.sin(this.t * 1.3 + s.phase) * 0.5;
        rate = 4; k = 1;
      }
      const ex = tx - s.x, ey = ty - s.y, ez = tz - s.z;
      const f = 1 - Math.exp(-rate * dt);
      let dx = ex * f, dy = ey * f, dz = ez * f;
      const sp = Math.hypot(dx, dy, dz) / Math.max(dt, 1e-4);
      if (sp > R.maxSpeed) { const c = R.maxSpeed / sp; dx *= c; dy *= c; dz *= c; }
      s.x += dx; s.y += dy; s.z += dz;
      const speed = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
      if (speed > 0.6) s.yaw += wrapA(Math.atan2(dx, dz) - s.yaw) * Math.min(1, dt * 8);
      s.model.root.position.set(s.x, s.y, s.z);
      s.model.root.rotation.y = s.yaw;
      s.model.update(dt, { speed, bloom: k, t: this.t });
      if (k && Math.random() < dt * 5) this.game.fx.sparkle(s.x + (Math.random() - 0.5) * 0.6, s.y - 0.3, s.z + (Math.random() - 0.5) * 0.6, [1, 0.85, 0.95], 0.4);
    });
  }

  hudState() {
    if (this.final.litFlag) return null;
    const free = this.sprites.length;
    if (free < this.need) return { text: `SPRITES FREED  ${free} OF ${this.need}`, n: free, of: this.need };
    if (this.sprites.some((s) => s.state === 'wait')) return { text: 'FETCH THE SPRITES THAT WAIT AT THEIR BLOOMS', n: this.sprites.filter((s) => s.state === 'follow').length, of: this.need };
    return { text: 'LEAD THE SPRITES TO THE HEARTBLOOM', n: this.need, of: this.need };
  }

  /** a saved realm entered again: the sprites circle the Heartbloom, as they were left */
  restore() {
    super.restore();
    this.final.missionDone = true;
    for (let i = 0; i < this.need; i++) this._spawn(this.owned[i % this.owned.length], 'sing');
    this._sing();
  }

  dispose() {
    for (const s of this.sprites) s.model.dispose?.();
    super.dispose();
  }
}
