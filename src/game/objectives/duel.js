// DUEL (Emberfall Crags): the Slag Colossus holds the Heartforge. It is a Slag Brute grown to the size of a house (a brute is the elite of the crags; this is the one the forges were cast to make), and the whole of
// the crags is the way to it. The fight is one fight: it sleeps in the caldera until the hero comes within 34 m, wakes with a roar, and walks at him; it raises both fists (a ring of heat grows on the ground at its
// feet: the tell), SLAMS (anything on the ground within the ring is hurt: a jump goes over it), and for a spell after the slam the hatch in its chest stands open, and a ram or a breath into the hatch is a wound.
// A wound shuts the hatch for a moment, so a vent is worth two wounds at the most. As it is worn down it walks faster, its slam throws a QUAKE out over the floor (a ring that races out to the wall: jump it) and,
// at the end, it slams twice. Nine wounds take it down. A hero who leaves the caldera is not followed: it goes home, and keeps its wounds.
//
//   spec { kind: 'duel', final: the Heartforge, arena: [x, z] (the middle of the caldera), arenaR, home: [x, z]? (where it stands, 13 m from the middle by default), wounds: 9 }
import { Objective } from './base.js';
import { makeModel } from '../models/fallback.js';

export const DUEL = { superWounds: 3, scale: 2.2, wake: 34, roar: 1.5, walk: [3.2, 4.0, 4.8], turn: 1.1, near: 6.4, raise: [1.15, 1.0, 0.85], slamR: 8.6, jumpOver: 1.1, vent: [2.7, 2.4, 2.1], shut: 1.0, quakeSpeed: 15, quakeR: 21, quakeBand: 1.8, chestY: 3.3, hitR: 3.4, dieT: 2.4, leave: 8 };

const RING_K = 0.875;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const gems = (...a) => a;

export class Duel extends Objective {
  constructor(game, spec) {
    super(game, spec);
    const g = game, [ax, az] = spec.arena;
    this.home = spec.home || [ax, az + 13];                                     // (beside the Heartforge, not on it: among the stones of the ring)
    this.wounds = 0;
    this.need = spec.wounds;
    this.state = 'sleep';                          // sleep | roar | advance | raise | vent | home | dead
    this.st = 0;
    this.shutT = 0;
    this.slams = 0;                                // the slams of this advance (the last phase slams twice)
    this.quake = null;                             // { r }: the ring racing out
    this.t = 0;
    this.e = { x: this.home[0], z: this.home[1], y: g.collision.heightAt(this.home[0], this.home[1]), yaw: Math.PI };
    this.model = makeModel(g.assets, 'slagbrute', {});
    this.model.root.scale.setScalar(DUEL.scale);
    this.model.root.position.set(this.e.x, this.e.y, this.e.z);
    this.group.add(this.model.root);
    this.mark = g.fx.decal({ pool: 'add', sprite: 'ring', x: 0, z: 0, r: 1, color: [1, 0.45, 0.16], alpha: 0, lift: 0.14 });
    this.quakeMark = g.fx.decal({ pool: 'add', sprite: 'ring', x: 0, z: 0, r: 1, color: [1, 0.7, 0.3], alpha: 0, lift: 0.15 });
    this.hatch = g.fx.billboard({ pool: 'add', sprite: 'glow', size: 4.4, color: [1.0, 0.58, 0.2], alpha: 0 });          // (the hatch in its chest, glowing while it stands open)
    this.told = {};
  }

  /** 0 (fresh) .. 2 (nearly done) */
  get phase() { return this.wounds >= this.need * 0.66 ? 2 : this.wounds >= this.need * 0.33 ? 1 : 0; }
  get chest() { const e = this.e; return { x: e.x + Math.sin(e.yaw) * 1.6, y: e.y + DUEL.chestY, z: e.z + Math.cos(e.yaw) * 1.6 }; }

  update(dt, game) {
    super.update(dt, game);
    if (this.restored || this.done) return;
    const g = game, p = g.player, e = this.e, D = DUEL;
    this.t += dt; this.shutT = Math.max(0, this.shutT - dt);
    const dp = Math.hypot(p.x - e.x, p.z - e.z), to = Math.atan2(p.x - e.x, p.z - e.z);
    const inArena = Math.hypot(p.x - this.spec.arena[0], p.z - this.spec.arena[1]) < this.spec.arenaR + 4;
    const ph = this.phase;
    switch (this.state) {
      case 'sleep':
        if (!p.dead && dp < D.wake && inArena) { this.state = 'roar'; this.st = 0; g.audio?.sfx('foe_vent', { vol: 1 }); g.cam.shake(0.5, D.roar); g.hud.hint('THE SLAG COLOSSUS WAKES! JUMP ITS SLAM, THEN RAM THE HATCH IN ITS CHEST', 6); }
        break;
      case 'roar':
        this.st += dt; e.yaw += wrapA(to - e.yaw) * Math.min(1, dt * 2);
        if (this.st >= D.roar) { this.state = 'advance'; this.slams = 0; }
        break;
      case 'advance': {
        if (p.dead || !inArena) { this.state = 'home'; break; }
        e.yaw += clamp(wrapA(to - e.yaw), -D.turn * dt, D.turn * dt);
        if (dp > D.near && (this._walk(dt, D.walk[ph]) || dp > D.slamR + 1)) { /* (walking; at the wall of the caldera it stops and slams what is in reach) */ }
        else { this.state = 'raise'; this.st = 0; g.audio?.sfx('foe_raise', { vol: 0.8 }); }
        break;
      }
      case 'raise':
        this.st += dt;
        e.yaw += clamp(wrapA(to - e.yaw), -0.7 * dt, 0.7 * dt);
        if (this.st >= D.raise[ph]) this._slam(p);
        break;
      case 'vent':
        this.st += dt;
        if (this.st >= D.vent[ph]) { this.state = 'advance'; this.slams = 0; }
        else if (!p.dead) this._struck(p);
        break;
      case 'home': {
        const d = Math.hypot(this.home[0] - e.x, this.home[1] - e.z);
        if (d > 1.5) { e.yaw += clamp(wrapA(Math.atan2(this.home[0] - e.x, this.home[1] - e.z) - e.yaw), -D.turn * dt, D.turn * dt); this._walk(dt, 4.4, true); }
        else this.state = 'sleep';
        if (!p.dead && inArena && dp < D.wake) this.state = 'advance';
        break;
      }
      case 'dead':
        this.st += dt;
        if (this.st >= D.dieT) { this._hide(); this.complete(); this.state = 'gone'; }
        break;
      default: break;
    }
    // the quake: a ring that races out from the slam; a hero on the ground when its band passes him is hurt
    if (this.quake) {
      const q = this.quake;
      q.r += D.quakeSpeed * dt;
      if (!q.hit && !p.dead && Math.abs(Math.hypot(p.x - q.x, p.z - q.z) - q.r) < D.quakeBand && p.y - g.collision.heightAt(p.x, p.z) < D.jumpOver) { q.hit = true; g.playerHurt(q.x, q.z); }
      if (q.r > D.quakeR) this.quake = null;
    }
    this._frame(dt);
  }

  _walk(dt, v, free) {
    const g = this.game, e = this.e;
    const nx = e.x + Math.sin(e.yaw) * v * dt, nz = e.z + Math.cos(e.yaw) * v * dt;
    const [ax, az] = this.spec.arena;
    let moved = true;
    if (free || Math.hypot(nx - ax, nz - az) < this.spec.arenaR + 2) { e.x = nx; e.z = nz; } else moved = false;
    e.y = g.collision.heightAt(e.x, e.z);
    this.speedNow = v;
    return moved;
  }

  _slam(p) {
    const g = this.game, e = this.e, D = DUEL;
    g.audio?.sfx('foe_bash', { vol: 1 });
    g.cam.shake(0.55, 0.45);
    g.fx.hitSpark(e.x, e.y + 0.6, e.z, 1.6);
    g.fx.puff(e.x, e.y + 0.4, e.z, 2.2);
    const dp = Math.hypot(p.x - e.x, p.z - e.z);
    if (!p.dead && dp < D.slamR + 0.6 && p.y - e.y < D.jumpOver) g.playerHurt(e.x, e.z);
    if (this.phase >= 1) this.quake = { x: e.x, z: e.z, r: D.slamR, hit: false };
    this.slams++;
    if (this.phase >= 2 && this.slams < 2) { this.st = 0; this.state = 'raise'; return; }          // (at the end it slams twice)
    this.state = 'vent'; this.st = 0; this.shutT = 0; this.ventSnd = false;
  }

  /** a ram or a breath at the hatch while it is open: a wound; shut, they ring off */
  _struck(p) {
    const g = this.game, c = this.chest, D = DUEL;
    if (!this.ventSnd) { this.ventSnd = true; g.audio?.sfx('foe_vent', { vol: 0.9 }); }
    const ram = p.chargeT > 0 && Math.hypot(p.x - c.x, p.z - c.z) < D.hitR + 1 && p.y - this.e.y < 2.6;          // (the hatch is above a hero's horns: a ram that reaches the belly strikes it)
    const flame = p.flameT > 0 && p.flameHits(c.x, c.y, c.z, D.hitR, 3.2);
    if (!ram && !flame) return;
    if (this.shutT > 0) {
      if (ram) { g.audio?.sfx('armor_clang', { vol: 0.9 }); p.shove?.(p.x - this.e.x, p.z - this.e.z, 9); p.chargeT = 0; p.chargeCd = 0.4; }
      return;
    }
    // (a SUPERCHARGED ram - off a ramp of the crags, systems/ramps.js - is a brute's three wounds at once, and the charge is spent)
    const big = ram && p.superT > 0;
    this.wounds = Math.min(this.need, this.wounds + (big ? D.superWounds : 1)); this.shutT = D.shut;
    if (big) p.superT = 0;
    g.audio?.sfx('trial_break', { vol: 1 });
    g.cam.shake(0.4, 0.35);
    g.fx.hitSpark(c.x, c.y, c.z, 1.4);
    g.fx.shards(c.x, c.y, c.z, [[1, 0.6, 0.2], [0.3, 0.2, 0.2]], 12);
    if (ram) { p.chargeT = 0; p.chargeCd = 0.4; p.shove?.(p.x - this.e.x, p.z - this.e.z, 7); }
    this.progress(this.wounds / this.need);
    if (this.wounds >= this.need) { this.state = 'dead'; this.st = 0; this.quake = null; g.audio?.sfx('foe_bash', { vol: 1 }); g.hud.hint('THE COLOSSUS FALLS! THE HEARTFORGE BURNS AGAIN', 5); g.gems.burst(this.e.x, this.e.y + 2, this.e.z, gems(10, 10, 5, 5, 5, 2, 2, 2), 3); }
    else if (this.wounds === Math.ceil(this.need * 0.33) || this.wounds === Math.ceil(this.need * 0.66)) g.hud.hint(this.phase === 0 ? 'IT IS ANGRY NOW: ITS SLAM SHAKES THE FLOOR! JUMP THE QUAKE TOO' : 'NEARLY DONE: IT SLAMS TWICE! KEEP HITTING THE HATCH', 5);
  }

  _hide() { this.model.root.visible = false; this.mark.alpha = 0; this.quakeMark.alpha = 0; this.hatch.alpha = 0; }

  _frame(dt) {
    const e = this.e, D = DUEL, m = this.model;
    m.root.position.set(e.x, e.y, e.z);
    m.root.rotation.y = e.yaw;
    const raise = this.state === 'raise' ? clamp(this.st / D.raise[this.phase]) : 0;
    const dying = this.state === 'dead' ? clamp(this.st / D.dieT) : 0;
    m.update(dt, { speed: this.state === 'advance' || this.state === 'home' ? (this.speedNow || 0) : 0, attack: this.state === 'raise' ? 0.4 * raise : this.state === 'vent' ? 0.6 + 0.4 * clamp(this.st / D.vent[this.phase]) : 0, alert: this.state === 'roar' ? 1 : 0, stun: this.state === 'vent' ? 0.4 : 0, vent: this.state === 'vent' && this.shutT <= 0 ? 1 : 0, wounds: 3 * this.wounds / this.need, raise, dead: dying, t: this.t });
    if (this.state === 'dead') { m.root.position.y = e.y - dying * 2.2; if (Math.random() < dt * 30) this.game.fx.sparkle(e.x + (Math.random() - 0.5) * 4, e.y + Math.random() * 6, e.z + (Math.random() - 0.5) * 4, [1, 0.6, 0.2], 0.8); }
    this.speedNow = 0;
    const c = this.chest, open = this.state === 'vent' && this.shutT <= 0;
    this.hatch.x = c.x; this.hatch.y = c.y; this.hatch.z = c.z; this.hatch.alpha = open ? 0.8 + 0.2 * Math.sin(this.t * 14) : 0;
    // the tell (a ring that grows at its feet) and the quake (a ring racing out)
    if (this.state === 'raise') { this.mark.x = e.x; this.mark.z = e.z; this.mark.r = D.slamR * (0.35 + 0.65 * raise) / RING_K; this.mark.alpha = 0.3 + 0.7 * raise; } else this.mark.alpha = 0;
    if (this.quake) { this.quakeMark.x = this.quake.x; this.quakeMark.z = this.quake.z; this.quakeMark.r = this.quake.r / RING_K; this.quakeMark.alpha = 0.8 * clamp(1 - (this.quake.r - D.slamR) / (D.quakeR - D.slamR) * 0.7); } else this.quakeMark.alpha = 0;
    if (this.state === 'vent' && this.shutT <= 0 && Math.random() < dt * 24) this.game.fx.spawn({ pool: 'half', frames: ['smoke_0', 'smoke_1'], overLife: true, x: e.x + Math.sin(e.yaw) * 1.6 + (Math.random() - 0.5) * 0.8, y: e.y + D.chestY, z: e.z + Math.cos(e.yaw) * 1.6 + (Math.random() - 0.5) * 0.8, vx: 0, vy: 1.2, vz: 0, life: 0.9, size: [1.2, 3] });
  }

  hudState() {
    if (this.done) return null;
    if (this.state === 'sleep' && !this.wounds) return { text: 'THE SLAG COLOSSUS HOLDS THE HEARTFORGE' };
    return { text: 'SLAG COLOSSUS', bar: 1 - this.wounds / this.need };
  }

  restore() {
    super.restore();
    this._hide();
    this.state = 'gone';
  }

  dispose() {
    this.model.dispose?.();
    this.mark.dead = true; this.quakeMark.dead = true; this.hatch.dead = true;
    super.dispose();
  }
}
