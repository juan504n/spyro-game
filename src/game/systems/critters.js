// Meadow bunnies ("fodder"): they hop about, bolt when Spyro gets close, and release a healing butterfly when
// burnt or rammed. Butterflies flutter up, then seek Spyro to refill Sparx.
import { makeModel } from '../models/fallback.js';
import { WATER_LEVEL } from '../level.js';

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const FLAP = ['butterfly_0', 'butterfly_1', 'butterfly_2', 'butterfly_1'];

export class CritterSystem {
  /** spawns: [{ x, z }] one bunny each */
  constructor(game, spawns, ambient = 26) {
    this.game = game;
    this.bunnies = [];
    this.flutter = [];       // healing butterflies
    this.ambient = [];
    for (const s of spawns) this.bunnies.push(this._bunny(s));
    for (let i = 0; i < ambient; i++) this.ambient.push(this._ambient(i));
  }

  _bunny(s) {
    const g = this.game;
    const model = makeModel(g.assets, 'bunny');
    const y = g.collision.heightAt(s.x, s.z);
    model.root.position.set(s.x, y, s.z);
    g.dyn.add(model.root);
    const shadow = g.fx.decal({ pool: 'half', sprite: 'shadow_blob', r: 0.6, color: [0.3, 0.3, 0.4], alpha: 0.6 });
    return { model, shadow, x: s.x, y, z: s.z, hx: s.x, hz: s.z, yaw: Math.random() * 6.28, r: 0.35, h: 0.8, state: 'idle', st: 1 + Math.random() * 3, hop: 0, hopping: false, dir: 0, vy: 0, jy: 0, t: Math.random() * 9, burn: 0, alarm: 0, dead: false, speed: 0 };
  }

  _ambient(i) {
    const h = this.game.fx.billboard({ pool: 'cut', sprite: 'butterfly_0', size: 0.5, color: [1, 1, 1] });
    return { h, x: 0, y: 0, z: 0, a: Math.random() * 6.28, r: 4 + Math.random() * 8, s: 0.4 + Math.random() * 0.5, phase: Math.random() * 6, home: null, tint: [[1, 1, 1], [1, 0.8, 0.6], [0.8, 0.9, 1], [1, 0.9, 0.5]][i % 4] };
  }

  releaseButterfly(x, y, z) {
    const h = this.game.fx.billboard({ pool: 'cut', sprite: 'butterfly_0', size: 1.0, color: [0.75, 0.9, 1.0] });
    const glow = this.game.fx.billboard({ pool: 'add', sprite: 'glow_small', size: 1.6, color: [0.5, 0.8, 1.0], alpha: 0.6 });
    this.flutter.push({ h, glow, x, y, z, vx: 0, vy: 2.2, vz: 0, t: 0, phase: Math.random() * 6, wait: 0 });
  }

  update(dt, game) {
    const p = game.player;
    const col = game.collision;
    for (let i = this.bunnies.length - 1; i >= 0; i--) {
      const b = this.bunnies[i];
      const dxp = p.x - b.x, dzp = p.z - b.z;
      const dp = Math.hypot(dxp, dzp);
      const far = dp > 120;
      b.model.root.visible = dp < 140;
      if (far) continue;
      b.t += dt;
      // ---- hits ---------------------------------------------------------------------------------------------------
      if (b.state !== 'burn') {
        if ((p.flameT > 0 && p.flameHits(b.x, b.y + 0.4, b.z, b.r)) || (p.chargeT > 0 && p.chargeHits(b.x, b.y + 0.4, b.z, b.r))) {
          b.state = 'burn'; b.st = 0.75; b.burn = 1; b.dir = Math.random() * 6.28;
          game.audio?.sfx('bunny_squeak', { vol: 0.9 });
          if (p.chargeT > 0) { this._pop(b, i); continue; }
        }
      }
      let sp = 0;
      switch (b.state) {
        case 'idle': {
          if (dp < 8.5 && (p.speed > 3 || dp < 4)) { b.state = 'alarm'; b.st = 0.4; b.alarm = 1; game.audio?.sfx('bunny_squeak', { vol: 0.4, pitch: 1.3 }); break; }
          b.st -= dt;
          if (!b.hopping && b.st <= 0) {
            b.hopping = true; b.hop = 0;
            const a = Math.random() * 6.28, home = Math.hypot(b.hx - b.x, b.hz - b.z);
            b.dir = home > 7 ? Math.atan2(b.hx - b.x, b.hz - b.z) : a;
            b.st = 1 + Math.random() * 3.2;
          }
          if (b.hopping) { sp = 2.4; }
          break;
        }
        case 'alarm': {
          b.st -= dt;
          b.yaw += wrap(Math.atan2(-dxp, -dzp) - b.yaw) * Math.min(1, dt * 12);
          if (b.st <= 0) { b.state = 'flee'; b.st = 1.6 + Math.random(); b.dir = Math.atan2(-dxp, -dzp) + (Math.random() - 0.5) * 0.8; b.hopping = true; b.hop = 0; b.alarm = 0; }
          break;
        }
        case 'flee': {
          b.st -= dt;
          b.hopping = true;
          sp = 6.2;
          if (b.st <= 0) { b.state = 'idle'; b.st = 0.6; b.hopping = false; }
          break;
        }
        case 'burn': {
          b.st -= dt;
          b.hopping = true;
          b.dir += (Math.random() - 0.5) * 0.9;
          sp = 7.5;
          b.burn = Math.max(0, b.st / 0.75);
          if (Math.random() < dt * 20) game.fx.torchFlame(b.x, b.y + 0.55, b.z, false, 0.5);
          if (b.st <= 0) { this._pop(b, i); continue; }
          break;
        }
        default: break;
      }
      // ---- hopping ----------------------------------------------------------------------------------------------------
      if (b.hopping) {
        const rate = b.state === 'idle' ? 2.2 : 3.6;
        b.hop += dt * rate;
        b.yaw += wrap(b.dir - b.yaw) * Math.min(1, dt * 14);
        const k = Math.sin(Math.min(1, b.hop) * Math.PI);
        b.jy = k * (b.state === 'idle' ? 0.45 : 0.7);
        if (b.hop < 1) {
          const ox = b.x, oz = b.z;
          b.x += Math.sin(b.yaw) * sp * dt; b.z += Math.cos(b.yaw) * sp * dt;
          col.pushOut(b, b.y, b.h, 0.5);
          if (col.heightAt(b.x, b.z) < WATER_LEVEL + 0.2 || col.normalAt(b.x, b.z)[1] < 0.7) { b.x = ox; b.z = oz; b.dir += 2; }
        } else { b.hopping = b.state !== 'idle' ? true : false; b.hop = 0; if (b.state === 'idle') b.jy = 0; }
      } else b.jy = 0;
      b.y = col.support(b.x, b.z, b.y, 0.5).y;
      b.model.root.position.set(b.x, b.y + b.jy, b.z);
      b.model.root.rotation.y = b.yaw;
      b.model.update(dt, { hop: Math.min(1, b.hop), speed: sp, alarm: b.alarm, burn: b.burn, t: b.t });
      b.shadow.x = b.x; b.shadow.z = b.z; b.shadow.alpha = 0.55 - b.jy * 0.4;
    }
    // ---- butterflies -------------------------------------------------------------------------------------------------
    for (let i = this.flutter.length - 1; i >= 0; i--) {
      const f = this.flutter[i];
      f.t += dt;
      if (f.t < 0.9) { f.vy = 2.4; f.vx = Math.cos(f.t * 5) * 1.6; f.vz = Math.sin(f.t * 5) * 1.6; }
      else if (game.sparx.hp < game.sparx.max && !p.dead) {
        const dx = p.x - f.x, dy = p.y + 0.9 - f.y, dz = p.z - f.z;
        const d = Math.hypot(dx, dy, dz) || 1;
        const s = Math.min(11, 3 + (f.t - 0.9) * 6);
        f.vx = dx / d * s + Math.sin(f.t * 7 + f.phase) * 0.8; f.vy = dy / d * s + Math.sin(f.t * 9) * 0.6; f.vz = dz / d * s;
        if (d < 1.3) { game.sparx.heal(); game.audio?.sfx('butterfly'); game.hud?.pulse('sparx'); this._kill(f, i); continue; }
      } else {
        // Sparx is full: just flutter about until needed
        f.wait += dt;
        f.vx = Math.cos(f.t * 2 + f.phase) * 1.3; f.vz = Math.sin(f.t * 2.3 + f.phase) * 1.3; f.vy = Math.sin(f.t * 3) * 0.5;
        if (f.wait > 25) { this._kill(f, i); continue; }
      }
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      f.h.x = f.glow.x = f.x; f.h.y = f.glow.y = f.y; f.h.z = f.glow.z = f.z;
      f.glow.alpha = 0.4 + Math.sin(f.t * 8) * 0.15;
    }
    // ---- ambient butterflies around the player -------------------------------------------------------------------------
    const night = 1 - game.day;
    for (const a of this.ambient) {
      if (!a.home || Math.hypot(a.home.x - p.x, a.home.z - p.z) > 34) {
        const ang = Math.random() * 6.28, r = 8 + Math.random() * 22;
        a.home = { x: p.x + Math.cos(ang) * r, z: p.z + Math.sin(ang) * r };
      }
      a.a += dt * a.s;
      a.x = a.home.x + Math.cos(a.a) * a.r * 0.4; a.z = a.home.z + Math.sin(a.a * 1.3) * a.r * 0.4;
      const gy = game.collision.heightAt(a.x, a.z);
      a.y = gy + 1.4 + Math.sin(a.a * 2 + a.phase) * 0.6;
      a.h.x = a.x; a.h.y = a.y; a.h.z = a.z;
      a.h.color = a.tint;
      a.h.visible = gy > WATER_LEVEL + 0.3;
      a.h.alpha = 1;
    }
  }

  frame(dt, alpha, game) {
    const t = game.time;
    for (const f of this.flutter) game.fx.setSprite(f.h, FLAP[((t * 10 + f.phase) | 0) % 4]);
    for (const a of this.ambient) game.fx.setSprite(a.h, FLAP[((t * 7 + a.phase * 3) | 0) % 4]);
  }

  _pop(b, i) {
    const g = this.game;
    g.fx.puff(b.x, b.y + 0.5, b.z, 0.6);
    g.audio?.sfx('bunny_poof', { vol: 0.9 });
    this.releaseButterfly(b.x, b.y + 0.6, b.z);
    if (Math.random() < 0.25) g.gems.burst(b.x, b.y + 0.6, b.z, [1], 0.7);
    b.model.root.parent?.remove(b.model.root);
    b.model.dispose?.();
    b.shadow.dead = true;
    this.bunnies.splice(i, 1);
    g.stats.bunnies++;
  }

  _kill(f, i) {
    f.h.dead = true; f.glow.dead = true;
    this.flutter.splice(i, 1);
  }
}
