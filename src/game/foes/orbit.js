// THE SHIVERLING: a little cold Snuffer, quick and thin, that does not come at the hero but ROUNDS him. It sees him from 15 m, runs a circle of 5.5 m about him at 8 m/s, for two or three seconds
// (the way round, left or right, is its own choice), and then shivers for 0.6 s (the tell: it stops, turns in, goes pale blue) and DASHES straight at where he stood, 15 m/s for up to 0.55 s. A hero who
// has stepped aside is not touched; the Shiverling runs on past him, and is dazed for 1.1 s (cold, out of breath) and falls to anything. While it circles it is too quick for a ram (the ram goes
// over it: a hero who charges a circling Shiverling runs through the place where it was), and a breath of fire catches it in the cone: the flame is the answer, and the ram is for the dash.
//
//   idle -> alert -> orbit (2.2-3.4 s) -> shiver (0.6 s) -> dash (<= 0.55 s) -> dazed (1.1 s) -> orbit ...
import { hyp, bearing, turnTo, wrap, clamp, loiter, startAlert, stepAlert, goHome, steer } from './core.js';

export const ORBIT = { alert: 0.45, radius: 5.5, speed: 8, orbitMin: 2.2, orbitMax: 3.4, shiver: 0.6, dash: 15, dashMax: 0.55, hitR: 0.3, dazed: 1.1, leave: 9 };

export const orbit = {
  init(e) { e.ang = 0; e.dir = 1; e.orbitT = 0; e.hit = false; e.dx = 0; e.dz = 1; e.v = 0; },

  step(e, dt, ctx) {
    const O = ORBIT, hero = ctx.hero;
    e.t += dt; e.speedNow = 0; e.attack = 0; e.stun = 0;
    const dp = hyp(hero.x - e.x, hero.z - e.z), to = bearing(e.x, e.z, hero.x, hero.z);
    switch (e.state) {
      case 'idle':
        if (loiter(e, dt, ctx)) { startAlert(e, ctx, O.alert); e.ang = Math.atan2(e.z - hero.z, e.x - hero.x); e.dir = ctx.rng() < 0.5 ? 1 : -1; }
        break;
      case 'alert':
        if (stepAlert(e, dt, ctx, 9)) { e.state = 'orbit'; e.st = 0; e.orbitT = O.orbitMin + ctx.rng() * (O.orbitMax - O.orbitMin); }
        break;
      case 'orbit': {
        if (hero.dead || dp > e.K.notice + O.leave) { if (!e.wild) e.state = 'return'; break; }
        e.st += dt;
        e.ang += (O.speed / O.radius) * dt * e.dir;
        // it runs for the point on the circle a little ahead of where it is (so that it holds the circle, closing in or opening out to it as it runs)
        const tx = hero.x + Math.cos(e.ang) * O.radius, tz = hero.z + Math.sin(e.ang) * O.radius;
        const h = steer(e, ctx, bearing(e.x, e.z, tx, tz), O.speed * (dp > O.radius + 4 ? 1.35 : 1), dt);
        if (h !== null) e.speedNow = O.speed;
        else { e.dir = -e.dir; }                                                           // (a wall in the way: it goes round the other way)
        e.yaw = turnTo(e.yaw, to, 12, dt);
        if (e.st >= e.orbitT && dp < O.radius + 3) { e.state = 'shiver'; e.st = 0; ctx.emit('tell', { what: 'shiver', x: e.x, z: e.z, by: e }); }
        break;
      }
      case 'shiver':
        e.st += dt; e.attack = 0.3 * clamp(e.st / O.shiver, 0, 1);
        e.yaw = turnTo(e.yaw, to, 14, dt);
        if (e.st >= O.shiver) { e.state = 'dash'; e.st = 0; e.hit = false; e.dx = Math.sin(e.yaw); e.dz = Math.cos(e.yaw); ctx.emit('rush', { x: e.x, z: e.z, by: e }); }
        break;
      case 'dash': {
        e.st += dt; e.attack = 0.6; e.speedNow = O.dash;
        const f = ctx.move(e, e.dx * O.dash, e.dz * O.dash, dt);
        if (!e.hit && !hero.dead && hyp(hero.x - e.x, hero.z - e.z) < e.r + hero.r + O.hitR && Math.abs(hero.y - e.y) < 1.6) { e.hit = true; ctx.emit('hurt', { x: e.x, z: e.z, by: e }); }
        if (f < 0.5 || e.st >= O.dashMax) { e.state = 'dazed'; e.st = 0; if (f < 0.5) ctx.emit('bonk', { x: e.x + e.dx * e.r, y: e.y, z: e.z + e.dz * e.r, by: e }); }
        break;
      }
      case 'dazed':
        e.st += dt; e.stun = 1;
        if (e.st >= O.dazed) { e.state = 'orbit'; e.st = 0; e.orbitT = O.orbitMin + ctx.rng() * (O.orbitMax - O.orbitMin); e.ang = Math.atan2(e.z - hero.z, e.x - hero.x); e.dir = ctx.rng() < 0.5 ? 1 : -1; }
        break;
      case 'return':
        if (!hero.dead && dp < e.K.notice) { e.state = 'orbit'; e.st = 0; break; }
        if (goHome(e, dt, ctx, e.K.speed * 1.4)) { e.state = 'idle'; e.st = 1; }
        break;
      default: break;
    }
  },

  /** Circling, it is too quick for a ram (the ram goes over it); the flame, and anything in the dash or the daze, kills it. */
  struck(e, attack) { return attack === 'ram' && (e.state === 'orbit' || e.state === 'shiver') ? 'ignore' : 'kill'; },

  pose(e) { return { speed: e.speedNow || 0, attack: e.attack || 0, alert: e.alert || 0, stun: e.stun || 0, shiver: e.state === 'shiver' ? clamp(e.st / ORBIT.shiver, 0, 1) : 0, dash: e.state === 'dash' ? 1 : 0 }; },
};
