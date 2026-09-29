// Ambient life: halos + light pools for every lamp/window/crystal, prop emitters (chimney smoke, sparkles, mist),
// dusk fireflies and daytime pollen motes around the player.
import { WATER_LEVEL, WARD_RADIUS } from '../level.js';

const rnd = (a, b) => a + (b - a) * Math.random();

export class Ambient {
  constructor(game, lights, emitters) {
    this.game = game;
    this.lights = lights.map((l, i) => {
      const halo = game.fx.billboard({ pool: 'add', sprite: 'glow', size: l.size, color: l.color, alpha: 0 });
      halo.x = l.x; halo.y = l.y; halo.z = l.z;
      let pool = null;
      if (l.pool > 0) {
        pool = game.fx.decal({ pool: 'add', sprite: 'glow', x: l.x, z: l.z, r: l.pool, color: l.color, alpha: 0 });
        pool.y = l.groundY + 0.06;
        pool.visible = false;
      }
      return { l, halo, pool, phase: Math.random() * 20, i };
    });
    this.emitters = emitters.map((e) => ({ e, acc: Math.random() }));
    this.fireflyAcc = 0;
    this.moteAcc = 0;
    this.stepAcc = 0;
    // positional loops (waterfall roar, windmill creak, portal hum): started lazily once the audio context is running
    this.sources = (game.gameplay?.soundSources || []).map((s) => ({ ...s, loop: null }));
    this.wardAcc = 0;
  }

  /** Distance-attenuated, camera-panned looping beds. */
  _soundscape(game) {
    const a = game.audio;
    if (!a || !a.ready) return;
    const cam = game.camera, e = cam.matrixWorld.elements, cp = cam.position;
    for (const S of this.sources) {
      const live = S.when === 'barrier' ? game.objects?.barrier?.target === 0 : true;
      const dx = S.x - cp.x, dy = S.y - cp.y, dz = S.z - cp.z;
      const d = Math.hypot(dx, dy, dz);
      const k = live && d < S.range ? (1 - d / S.range) ** 1.7 : 0;
      if (k < 0.015) { if (S.loop) { S.loop.stop(0.5); S.loop = null; } continue; }
      if (!S.loop) S.loop = a.loop(S.name, { vol: 0 });
      const dh = Math.hypot(dx, dz) || 1;
      const pan = Math.max(-0.8, Math.min(0.8, ((dx * e[0] + dz * e[2]) / dh) * Math.min(1, dh / 12)));
      S.loop.set({ vol: S.vol * k, pan });
    }
  }

  /** The ward around the summit while the Dawn Gate is sealed: a curtain of drifting violet motes near the hero. */
  _ward(dt, game) {
    const bar = game.objects?.barrier, p = game.player;
    if (!bar || !bar.c.solid || p.dead) return;
    const S = game.level.summit, wx = p.x - S.x, wz = p.z - S.z;
    const near = Math.hypot(wx, wz) - WARD_RADIUS;                   // > 0 outside the ward
    if (near < -1 || near > 18) return;
    this.wardAcc += dt * 26 * (1 - Math.max(0, near) / 18);
    while (this.wardAcc >= 1) {
      this.wardAcc -= 1;
      const th = Math.atan2(wx, wz) + rnd(-0.24, 0.24);
      const x = S.x + Math.sin(th) * WARD_RADIUS, z = S.z + Math.cos(th) * WARD_RADIUS;
      game.fx.spawn({ pool: 'add', sprite: 'spark_small', x, y: game.collision.heightAt(x, z) + rnd(0.3, 7), z, vy: rnd(0.4, 1.4), life: rnd(1.2, 2.2), size: [0.3, 0.3], c0: [0.75, 0.55, 1, 0.8], c1: [0.75, 0.55, 1, 0.8], pulse: true });
    }
  }

  update(dt, game) {
    this._soundscape(game);
    this._ward(dt, game);
    const p = game.player;
    const cam = game.camera.position;
    const day = game.day;
    const dim = 1 - 0.58 * day;
    // ---- lights ---------------------------------------------------------------------------------------------------
    let poolsShown = 0;
    for (const L of this.lights) {
      const l = L.l;
      const dx = l.x - cam.x, dz = l.z - cam.z;
      const d2 = dx * dx + dz * dz;
      const near = d2 < 165 * 165;
      L.halo.visible = near;
      if (near) {
        const f = l.flicker ? 1 - l.flicker * (0.5 + 0.5 * Math.sin(game.time * 13 + L.phase) * Math.sin(game.time * 5.3 + L.phase * 2)) : 1;
        L.halo.alpha = 0.62 * dim * f;
      }
      if (L.pool) {
        const showPool = d2 < 80 * 80 && poolsShown < 80;
        L.pool.visible = showPool;
        if (showPool) { poolsShown++; L.pool.alpha = 0.5 * dim * (l.flicker ? 0.92 + 0.08 * Math.sin(game.time * 9 + L.phase) : 1); }
      }
    }
    // ---- prop emitters -----------------------------------------------------------------------------------------------
    for (const E of this.emitters) {
      const e = E.e;
      const dx = e.x - p.x, dz = e.z - p.z;
      if (dx * dx + dz * dz > 100 * 100) continue;
      E.acc += dt * e.rate;
      while (E.acc >= 1) {
        E.acc -= 1;
        const x = e.x + rnd(-e.radius, e.radius), z = e.z + rnd(-e.radius, e.radius);
        switch (e.kind) {
          case 'smoke': game.fx.smoke(x, e.y, z, 0.9); break;
          case 'sparkle': game.fx.sparkle(x, e.y + rnd(0, 1.2), z, [0.8, 0.7, 1.0], 0.5); break;
          case 'firefly': game.fx.firefly(x, e.y + rnd(0, 1.5), z); break;
          case 'leaf': game.fx.leaf(x, e.y + rnd(0, 2), z); break;
          case 'mist': game.fx.spawn({ pool: 'half', frames: ['smoke_1'], x, y: e.y + rnd(0, 1), z, vx: rnd(-0.3, 0.3), vy: rnd(0.4, 1.2), vz: rnd(-0.3, 0.3), life: rnd(1.4, 2.4), size: [1.8, 4.2], c0: [0.85, 0.95, 1, 0.55], c1: [0.85, 0.95, 1, 0] }); break;
          default: break;
        }
      }
    }
    // ---- fireflies (dusk) and pollen motes (day) around the player -----------------------------------------------------
    this.fireflyAcc += dt * 5 * (1 - day);
    while (this.fireflyAcc >= 1) {
      this.fireflyAcc -= 1;
      const a = Math.random() * 6.28, r = rnd(4, 22);
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const gy = game.collision.heightAt(x, z);
      if (gy > WATER_LEVEL + 0.3) game.fx.firefly(x, gy + rnd(0.6, 2.8), z);
    }
    this.moteAcc += dt * 4 * day;
    while (this.moteAcc >= 1) {
      this.moteAcc -= 1;
      const a = Math.random() * 6.28, r = rnd(3, 20);
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const gy = game.collision.heightAt(x, z);
      game.fx.spawn({ pool: 'add', sprite: 'spark_small', x, y: gy + rnd(0.8, 3), z, vx: rnd(0.2, 0.7), vy: rnd(0.05, 0.3), vz: rnd(-0.3, 0.3), life: rnd(2.5, 4.5), size: [0.22, 0.22], c0: [1, 0.95, 0.7, 0.7], c1: [1, 0.95, 0.7, 0.7], pulse: true });
    }
    // ---- player footsteps / wading ---------------------------------------------------------------------------------------
    if (p.grounded && !p.dead) {
      const sp = p.speed;
      this.stepAcc += dt * sp;
      const stride = p.chargeT > 0 ? 1.7 : 2.7;
      if (sp > 2 && this.stepAcc > stride) {
        this.stepAcc = 0;
        if (p.inWater) { game.fx.splash(p.x, WATER_LEVEL, p.z, 0.45); game.audio?.sfx('splash', { vol: 0.35, pitch: 1.3 }); }
        else {
          game.fx.dust(p.x - p.dirx * 0.5, p.y, p.z - p.dirz * 0.5, p.chargeT > 0 ? 3 : 1, 0.3);
          game.audio?.sfx(p.groundKind === 'collider' ? 'footstep_stone' : ['footstep_a', 'footstep_b', 'footstep_c'][(game.frames >> 3) % 3], { vol: 0.22, jitter: 0.06 });
        }
      }
    } else this.stepAcc = 0;
  }
}
