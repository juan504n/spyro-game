// THE GALE SPIRIT: a whirl of wind with a face in it, the size of a Snuffer, that hangs 1.9 m over the hero's height and does not come near. It keeps 9 m off, circling him at 3.5 m/s, and every 3.2 s it
// GATHERS: for 1.0 s the air round it bends towards him (a cone of streaks on the ground, aimed for the first 0.45 s and fixed for the last 0.55) and it BLOWS: a blast 15 m long and 0.38 rad either side of the
// line (a lane 6 m wide 8 m out), that throws a hero in the cone back along it at 13 m/s and hurts nothing by itself. On a road that is a nuisance, on a spire it is the way off: the danger of the Gale Spirit is where he stands
// when it blows. The blast is dodged by stepping out of the cone in the 0.55 s after it is fixed, or by being behind a wall. It falls to anything that reaches it: the flame reaches 3 m up.
//
//   idle (hangs over its post) -> alert -> kite (9 m round the hero) -> gather (1.0 s: aims, then locks) -> blow -> rest (1.4 s) -> kite ...
import { hyp, bearing, turnTo, lerp, clamp, loiter, startAlert, stepAlert } from './core.js';

export const GUST = { rise: 1.9, idleH: 1.9, orbitR: 9, orbitV: 3.5, chase: 7, every: 3.2, first: 1.4, tell: 1.0, lock: 0.55, range: 15, half: 0.38, power: 13, rest: 1.4, leave: 10 };

export const gust = {
  init(e) { e.gy = e.y; e.y = e.gy + GUST.idleH; e.ang = 0; e.dir = 1; e.blowCd = GUST.first; e.aimYaw = 0; e.locked = false; e.flying = true; },

  step(e, dt, ctx) {
    const G = GUST, hero = ctx.hero;
    e.t += dt; e.speedNow = 0; e.attack = 0; e.stun = 0;
    const dp = hyp(hero.x - e.x, hero.z - e.z), to = bearing(e.x, e.z, hero.x, hero.z);
    const bob = Math.sin(e.t * 2.6) * 0.18;
    switch (e.state) {
      case 'idle': {
        e.ang += 0.6 * dt;
        const tx = e.hx + Math.cos(e.ang) * 2, tz = e.hz + Math.sin(e.ang) * 2, d = hyp(tx - e.x, tz - e.z) || 1, s = Math.min(d, 2 * dt);
        e.x += (tx - e.x) / d * s; e.z += (tz - e.z) / d * s;
        e.y = lerp(e.y, e.gy + G.idleH + bob, Math.min(1, dt * 4));
        if (!hero.dead && dp < e.K.notice) { startAlert(e, ctx); e.ang = Math.atan2(e.z - hero.z, e.x - hero.x); e.dir = ctx.rng() < 0.5 ? 1 : -1; e.blowCd = G.first; }
        break;
      }
      case 'alert':
        e.y = lerp(e.y, hero.y + G.rise + bob, Math.min(1, dt * 4));
        if (stepAlert(e, dt, ctx, 8)) e.state = 'kite';
        break;
      case 'kite': {
        if (hero.dead || dp > e.K.notice + G.leave) { if (!e.wild) { e.state = 'idle'; e.hx = e.x; e.hz = e.z; e.gy = ctx.floorAt(e.x, e.z); } break; }
        e.ang += (G.orbitV / G.orbitR) * dt * e.dir;
        const tx = hero.x + Math.cos(e.ang) * G.orbitR, tz = hero.z + Math.sin(e.ang) * G.orbitR, d = hyp(tx - e.x, tz - e.z) || 1, s = Math.min(d, G.chase * dt);
        e.x += (tx - e.x) / d * s; e.z += (tz - e.z) / d * s; e.speedNow = s / dt;
        e.y = lerp(e.y, hero.y + G.rise + bob, Math.min(1, dt * 4));
        e.yaw = turnTo(e.yaw, to, 6, dt);
        e.blowCd -= dt;
        if (e.blowCd <= 0 && dp < G.range - 1) { e.state = 'gather'; e.st = 0; e.locked = false; e.aimYaw = to; ctx.emit('tell', { what: 'gather', x: e.x, z: e.z, yaw: to, by: e }); }
        break;
      }
      case 'gather':
        e.st += dt; e.attack = 0.4 * clamp(e.st / G.tell, 0, 1);
        e.y = lerp(e.y, hero.y + G.rise + bob, Math.min(1, dt * 3));
        if (e.st < G.tell - G.lock) { e.aimYaw = to; e.yaw = turnTo(e.yaw, to, 9, dt); }
        else if (!e.locked) { e.locked = true; ctx.emit('lock', { x: e.x, z: e.z, yaw: e.aimYaw, by: e }); }
        if (e.st >= G.tell) {
          const dx = Math.sin(e.aimYaw), dz = Math.cos(e.aimYaw);
          ctx.emit('gust', { x: e.x, y: e.y, z: e.z, yaw: e.aimYaw, range: G.range, half: G.half, by: e });
          // the hero in the cone is thrown along the line
          const rx = hero.x - e.x, rz = hero.z - e.z, along = rx * dx + rz * dz, off = Math.abs(Math.atan2(rx * dz - rz * dx, along));
          if (!hero.dead && along > 0 && along < G.range && off < G.half) ctx.emit('shove', { dx, dz, power: G.power, by: e });
          e.state = 'rest'; e.st = 0;
        }
        break;
      case 'rest':
        e.st += dt; e.attack = 0.8; e.stun = 0.3;
        e.y = lerp(e.y, hero.y + G.rise + bob, Math.min(1, dt * 3));
        if (e.st >= G.rest) { e.state = 'kite'; e.blowCd = G.every; e.attack = 0; }
        break;
      default: break;
    }
  },

  /** What reaches it (the geometry of the flame and the ram decides that) kills it. */
  struck() { return 'kill'; },

  pose(e) { return { speed: e.speedNow || 0, attack: e.attack || 0, alert: e.alert || 0, stun: e.stun || 0, gather: e.state === 'gather' ? clamp(e.st / GUST.tell, 0, 1) : 0, blow: e.state === 'rest' ? 1 : 0 }; },
};
