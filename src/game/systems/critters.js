// Meadow bunnies ("fodder"): they hop about, bolt when Spyro gets close, and release a healing butterfly when
// burnt or rammed. Butterflies flutter up, then seek Sparx (or Spyro, when Sparx is gone) to refill him. The butterflies are 3D models (models/creatures/butterfly.js):
// the healing ones are the bright 'shiny' blue with a glow and a trail of sparkles, and a flock of ambient ones in every shade of blue drifts about the meadows near Spyro.
import { makeModel } from '../models/fallback.js';
import { WATER_LEVEL } from '../level.js';

const TAU = Math.PI * 2;
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp1 = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);
const AMBIENT_LOOKS = ['azure', 'sky', 'cyan', 'azure', 'sky', 'violet', 'cyan', 'azure'];      // the ambient butterflies: every shade of blue
const HEAL_SCALE = 0.75;                                                                      // (a healing butterfly is a little bigger than an ambient one, 0.45 to 0.65)

export class CritterSystem {
  /** spawns: [{ x, z }] one bunny each */
  constructor(game, spawns, ambient = 18) {
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
    const g = this.game;
    const model = makeModel(g.assets, 'butterfly', { look: AMBIENT_LOOKS[i % AMBIENT_LOOKS.length], scale: lerp(0.45, 0.65, Math.random()) });
    model.root.visible = false;
    g.dyn.add(model.root);
    return { model, x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, yaw: Math.random() * TAU, turn: 0, a: Math.random() * TAU, r: 4 + Math.random() * 8, s: 0.4 + Math.random() * 0.5, phase: Math.random() * 6, home: null, vis: 0 };
  }

  releaseButterfly(x, y, z) {
    const g = this.game;
    const model = makeModel(g.assets, 'butterfly', { look: 'shiny', scale: HEAL_SCALE });
    model.root.position.set(x, y, z);
    model.root.visible = false;
    g.dyn.add(model.root);
    const glow = g.fx.billboard({ pool: 'add', sprite: 'glow_small', size: 1.0, color: [0.3, 0.6, 1.0], alpha: 0.3 });
    this.flutter.push({ model, glow, x, y, z, px: x, py: y, pz: z, vx: 0, vy: 2.2, vz: 0, yaw: Math.random() * TAU, turn: 0, vis: 0, t: 0, phase: Math.random() * 6, wait: 0, trail: 0 });
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
    const sx = game.sparx;
    const sparxHere = !!sx && sx.hp > 0 && sx.vis > 0.5;                 // he is shown: the butterfly goes to HIM (and he eats it); with him gone it goes to Spyro
    for (let i = this.flutter.length - 1; i >= 0; i--) {
      const f = this.flutter[i];
      f.t += dt;
      f.px = f.x; f.py = f.y; f.pz = f.z;
      const toPlayer = Math.hypot(p.x - f.x, p.y + 0.9 - f.y, p.z - f.z);
      if (f.t < 0.9) { f.vy = 2.4; f.vx = Math.cos(f.t * 5) * 1.6; f.vz = Math.sin(f.t * 5) * 1.6; }
      else if (sx.hp < sx.max && !p.dead) {
        const tx = sparxHere ? sx.x : p.x, ty = sparxHere ? sx.y : p.y + 0.9, tz = sparxHere ? sx.z : p.z;
        const dx = tx - f.x, dy = ty - f.y, dz = tz - f.z;
        const d = Math.hypot(dx, dy, dz) || 1;
        const s = Math.min(11, 3 + (f.t - 0.9) * 6);
        f.vx = dx / d * s + Math.sin(f.t * 7 + f.phase) * 0.8; f.vy = dy / d * s + Math.sin(f.t * 9) * 0.6; f.vz = dz / d * s;
        if (d < (sparxHere ? 0.6 : 1.3) || (f.t > 6 && toPlayer < 2.5)) { sx.heal(); game.audio?.sfx('butterfly'); game.hud?.pulse('sparx'); this._kill(f, i); continue; }
      } else {
        // Sparx is full: just flutter about until needed
        f.wait += dt;
        f.vx = Math.cos(f.t * 2 + f.phase) * 1.3; f.vz = Math.sin(f.t * 2.3 + f.phase) * 1.3; f.vy = Math.sin(f.t * 3) * 0.5;
        if (f.wait > 25) { this._kill(f, i); continue; }
      }
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      // it faces the way it flies, and banks into its turns
      const hs = Math.hypot(f.vx, f.vz), want = hs > 0.4 ? Math.atan2(f.vx, f.vz) : f.yaw, d = wrap(want - f.yaw);
      f.yaw += d * (1 - Math.exp(-7 * dt));
      f.turn = lerp(f.turn, clamp1(d * 1.6), 0.2);
      f.vis = Math.min(1, f.vis + dt * 4);
      // a trail of sparkles in the same blue
      f.trail -= dt;
      if (f.trail <= 0) {
        f.trail = 0.07;
        game.fx.spawn({ pool: 'add', sprite: 'glow_small', x: f.x, y: f.y, z: f.z, vy: -0.3, life: 0.5, size: [0.3, 0.03], c0: [0.5, 0.85, 1, 0.5], c1: [0.4, 0.7, 1, 0] });
      }
    }
    // ---- ambient butterflies around the player -------------------------------------------------------------------------
    for (const a of this.ambient) {
      const rehome = !a.home || Math.hypot(a.home.x - p.x, a.home.z - p.z) > 22;
      if (rehome) {
        const ang = Math.random() * TAU, r = 4 + Math.random() * 11;
        a.home = { x: p.x + Math.cos(ang) * r, z: p.z + Math.sin(ang) * r };
        a.vis = 0;                                                      // (it fades in at its new home instead of popping up)
      }
      a.px = a.x; a.py = a.y; a.pz = a.z;
      a.a += dt * a.s;
      const fl = a.a * 4 + a.phase;                                     // (a little flutter on top of the lazy loop)
      a.x = a.home.x + Math.cos(a.a) * a.r * 0.4 + Math.sin(fl * 1.3) * 0.35;
      a.z = a.home.z + Math.sin(a.a * 1.3) * a.r * 0.4 + Math.cos(fl) * 0.35;
      const gy = game.collision.heightAt(a.x, a.z);
      a.y = gy + 1.4 + Math.sin(a.a * 2 + a.phase) * 0.6 + Math.sin(fl * 1.7) * 0.15;
      if (rehome) { a.px = a.x; a.py = a.y; a.pz = a.z; }
      a.vx = (a.x - a.px) / dt; a.vy = (a.y - a.py) / dt; a.vz = (a.z - a.pz) / dt;
      const hs = Math.hypot(a.vx, a.vz), want = hs > 0.3 ? Math.atan2(a.vx, a.vz) : a.yaw, d = wrap(want - a.yaw);
      a.yaw += d * (1 - Math.exp(-5 * dt));
      a.turn = lerp(a.turn, clamp1(d * 1.5), 0.15);
      a.vis += ((gy > WATER_LEVEL + 0.3 ? 1 : 0) - a.vis) * (1 - Math.exp(-3 * dt));      // (only over dry land: none out over the lake)
    }
  }

  frame(dt, alpha, game) {
    const place = (o) => {
      const m = o.model;
      if (o.vis < 0.02) { m.root.visible = false; return; }
      m.root.position.set(lerp(o.px, o.x, alpha), lerp(o.py, o.y, alpha), lerp(o.pz, o.z, alpha));
      m.root.rotation.y = o.yaw;
      m.update(dt, { speed: Math.hypot(o.vx, o.vy, o.vz), vy: o.vy, turn: o.turn, vis: o.vis, flap: o.glow ? 1 : undefined });
    };
    for (const f of this.flutter) {
      place(f);
      const g = f.glow, r = f.model.root.position;
      g.x = r.x; g.y = r.y; g.z = r.z;
      g.alpha = (0.26 + Math.sin(game.time * 8 + f.phase) * 0.08) * f.vis;
      g.visible = f.vis > 0.02;
    }
    for (const a of this.ambient) place(a);
  }

  _pop(b, i) {
    const g = this.game;
    g.fx.puff(b.x, b.y + 0.5, b.z, 0.6);
    g.audio?.sfx('bunny_poof', { vol: 0.9 });
    this.releaseButterfly(b.x, b.y + 0.6, b.z);
    b.model.root.parent?.remove(b.model.root);
    b.model.dispose?.();
    b.shadow.dead = true;
    this.bunnies.splice(i, 1);
    g.stats.bunnies++;
  }

  _kill(f, i) {
    f.glow.dead = true;
    f.model.root.parent?.remove(f.model.root);
    f.model.dispose?.();
    this.flutter.splice(i, 1);
  }
}
