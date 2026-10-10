// THE DRIFTER: a glass jellyfish that floats 2.5 m up in the air of Tideglass Reach and drifts at the hero at 2.2 m/s, bobbing. It does not touch him. It stops 3.8 m off, glows for 0.9 s (the tell), and
// PULSES: a ring of static runs out over the ground to 4.4 m, and everything on the ground inside it is shocked. A hero who is off the ground when it passes (a jump: 0.9 m is enough) is not. Then it drifts
// again. Hanging 2.5 m up it is out of reach of a ram and of a flame from the ground at any distance but the near: the way to it is a jump and a breath, or the flame from a rise in the ground.
// (It falls to anything that reaches it.)
//
//   idle (hangs over its post) -> alert -> drift (to 3.8 m off the hero) -> glow (0.9 s) -> pulse -> rest (0.8 s) -> drift ...
import { hyp, bearing, turnTo, lerp, clamp, loiter, startAlert, stepAlert } from './core.js';

export const DRIFT = { hover: 2.5, speed: 2.2, near: 3.8, every: 3.4, first: 1.2, tell: 0.9, pulseR: 4.4, safeUp: 0.9, rest: 0.8, leave: 10 };

export const drift = {
  init(e) { e.gy = e.y; e.y = e.gy + DRIFT.hover; e.ang = 0; e.pulseCd = DRIFT.first; e.flying = true; },

  step(e, dt, ctx) {
    const D = DRIFT, hero = ctx.hero;
    e.t += dt; e.speedNow = 0; e.attack = 0; e.stun = 0;
    const dp = hyp(hero.x - e.x, hero.z - e.z), to = bearing(e.x, e.z, hero.x, hero.z);
    const bob = Math.sin(e.t * 1.8) * 0.3;
    const floor = ctx.floorAt(e.x, e.z);
    switch (e.state) {
      case 'idle': {
        e.ang += 0.35 * dt;
        const tx = e.hx + Math.cos(e.ang) * 2.5, tz = e.hz + Math.sin(e.ang) * 2.5, d = hyp(tx - e.x, tz - e.z) || 1, s = Math.min(d, 1.4 * dt);
        e.x += (tx - e.x) / d * s; e.z += (tz - e.z) / d * s;
        e.y = lerp(e.y, floor + D.hover + bob, Math.min(1, dt * 3));
        if (!hero.dead && dp < e.K.notice) { startAlert(e, ctx); e.pulseCd = D.first; }
        break;
      }
      case 'alert':
        e.y = lerp(e.y, floor + D.hover + bob, Math.min(1, dt * 3));
        if (stepAlert(e, dt, ctx, 4)) e.state = 'drift';
        break;
      case 'drift': {
        if (hero.dead || dp > e.K.notice + D.leave) { if (!e.wild) { e.state = 'idle'; e.hx = e.x; e.hz = e.z; e.gy = floor; } break; }
        e.yaw = turnTo(e.yaw, to, 3, dt);
        if (dp > D.near) { const s = Math.min(dp - D.near, D.speed * dt); e.x += Math.sin(to) * s; e.z += Math.cos(to) * s; e.speedNow = D.speed; }
        e.y = lerp(e.y, floor + D.hover + bob, Math.min(1, dt * 3));
        e.pulseCd -= dt;
        if (e.pulseCd <= 0 && dp < D.near + 3) { e.state = 'glow'; e.st = 0; ctx.emit('tell', { what: 'glow', x: e.x, z: e.z, r: D.pulseR, by: e }); }
        break;
      }
      case 'glow':
        e.st += dt; e.attack = 0.4 * clamp(e.st / D.tell, 0, 1);
        e.y = lerp(e.y, floor + D.hover + 0.4 + bob * 0.3, Math.min(1, dt * 4));
        if (e.st >= D.tell) {
          ctx.emit('pulse', { x: e.x, y: floor, z: e.z, r: D.pulseR, by: e });
          if (!hero.dead && dp < D.pulseR + hero.r && hero.y - floor < D.safeUp) ctx.emit('hurt', { x: e.x, z: e.z, by: e });
          e.state = 'rest'; e.st = 0;
        }
        break;
      case 'rest':
        e.st += dt; e.attack = 0.8; e.stun = 0.3;
        e.y = lerp(e.y, floor + D.hover + bob, Math.min(1, dt * 3));
        if (e.st >= D.rest) { e.state = 'drift'; e.pulseCd = D.every; e.attack = 0; }
        break;
      default: break;
    }
  },

  /** What reaches it kills it. */
  struck() { return 'kill'; },

  pose(e) { return { speed: e.speedNow || 0, attack: e.attack || 0, alert: e.alert || 0, stun: e.stun || 0, glow: e.state === 'glow' ? clamp(e.st / DRIFT.tell, 0, 1) : 0, pulse: e.state === 'rest' ? 1 : 0 }; },
};
