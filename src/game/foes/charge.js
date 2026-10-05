// THE RAMHOG: a boar with a brow like a wall. It stalks the hero, stops, and PAWS the ground for 0.9 s (head down, dust, a snort: it turns to the hero until the last quarter second, then its line
// is fixed), and then runs that straight line at 15 m/s for up to 1.1 s. A hero who steps off the line is not touched. Its brow is armour: head on, flame and ram both ring off (the ram
// throws the hero back). Its side and back are not: a hero who sidesteps strikes it as it skids past. A hog that runs into a wall or a prop is stunned for 1.8 s, and a stunned hog falls to
// anything from anywhere: the way to beat it is to be where the wall is not.
//
//   idle -> alert -> stalk (turn slowly to the hero, come on to 14 m) -> paw (0.9 s: aims, then locks) -> rush (<= 1.1 s) -> skid (0.9 s) -> turn (slowly) -> stalk ...
//                                                                                                      \-> stunned (1.8 s, when it hits something) -> turn
import { hyp, bearing, turnTo, wrap, clamp, loiter, startAlert, stepAlert, goHome } from './core.js';

export const CHARGE = {
  alert: 0.5, near: 14, walk: 2.6, paw: 0.9, lock: 0.25, speed: 15, accel: 60, maxT: 1.1, skid: 0.9, stun: 1.8, turn: 3.0, turnBack: 2.2, hitR: 0.25, cool: 0.6, front: 0.96,
};

export const charge = {
  front: CHARGE.front,                                                                   // (the half angle of its brow: what sideOf calls 'front')

  init(e) { e.rushT = 0; e.v = 0; e.dx = 0; e.dz = 1; e.hit = false; e.locked = false; e.cool = 0; },

  step(e, dt, ctx) {
    const C = CHARGE, hero = ctx.hero;
    e.t += dt; e.speedNow = 0; e.attack = 0; e.stun = 0; e.cool = Math.max(0, e.cool - dt);
    const dp = hyp(hero.x - e.x, hero.z - e.z), to = bearing(e.x, e.z, hero.x, hero.z);
    switch (e.state) {
      case 'idle':
        if (loiter(e, dt, ctx)) startAlert(e, ctx, C.alert);
        break;
      case 'alert':
        if (stepAlert(e, dt, ctx, 6)) e.state = 'stalk';
        break;
      case 'stalk':
        if (hero.dead || dp > e.K.notice + 8) { if (!e.wild) e.state = 'return'; break; }
        e.yaw = turnTo(e.yaw, to, C.turn, dt);
        if (dp > C.near) { ctx.move(e, Math.sin(e.yaw) * C.walk, Math.cos(e.yaw) * C.walk, dt); e.speedNow = C.walk; }
        else if (e.cool <= 0 && Math.abs(wrap(to - e.yaw)) < 0.5) { e.state = 'paw'; e.st = 0; e.locked = false; ctx.emit('tell', { what: 'paw', x: e.x, z: e.z, by: e }); }
        break;
      case 'paw':
        e.st += dt; e.attack = 0.3 * clamp(e.st / C.paw, 0, 1);
        if (e.st < C.paw - C.lock) e.yaw = turnTo(e.yaw, to, C.turn, dt);
        else if (!e.locked) { e.locked = true; ctx.emit('lock', { x: e.x, z: e.z, yaw: e.yaw, by: e }); }
        if (e.st >= C.paw) { e.state = 'rush'; e.st = 0; e.rushT = 0; e.v = 0; e.dx = Math.sin(e.yaw); e.dz = Math.cos(e.yaw); e.hit = false; ctx.emit('rush', { x: e.x, z: e.z, by: e }); }
        break;
      case 'rush': {
        e.rushT += dt; e.v = Math.min(C.speed, e.v + C.accel * dt); e.speedNow = e.v; e.attack = 0.5;
        const f = ctx.move(e, e.dx * e.v, e.dz * e.v, dt);
        if (!e.hit && !hero.dead && hyp(hero.x - e.x, hero.z - e.z) < e.r + hero.r + C.hitR && Math.abs(hero.y - e.y) < 1.8) { e.hit = true; ctx.emit('hurt', { x: e.x, z: e.z, by: e }); }
        if (f < 0.5 && e.rushT > 0.12) { e.state = 'stunned'; e.st = 0; e.v = 0; ctx.emit('bonk', { x: e.x + e.dx * e.r, y: e.y, z: e.z + e.dz * e.r, by: e }); }
        else if (e.rushT >= C.maxT) { e.state = 'skid'; e.st = 0; }
        break;
      }
      case 'skid':
        e.st += dt; e.v = Math.max(0, e.v * Math.exp(-5 * dt)); e.speedNow = e.v; e.attack = 0.7;
        if (e.v > 0.3) ctx.move(e, e.dx * e.v, e.dz * e.v, dt);
        if (e.st >= C.skid) { e.state = 'turn'; e.st = 0; e.v = 0; }
        break;
      case 'stunned':
        e.st += dt; e.stun = 1;
        if (e.st >= C.stun) { e.state = 'turn'; e.st = 0; }
        break;
      case 'turn':
        e.cool = Math.max(e.cool, C.cool);
        e.yaw = turnTo(e.yaw, to, C.turnBack, dt);
        if (Math.abs(wrap(to - e.yaw)) < 0.35) e.state = hero.dead || dp > e.K.notice + 8 ? 'return' : 'stalk';
        break;
      case 'return':
        if (!hero.dead && dp < e.K.notice) { e.state = 'stalk'; break; }
        if (goHome(e, dt, ctx, e.K.speed * 1.5)) { e.state = 'idle'; e.st = 1; e.speedNow = 0; }
        break;
      default: break;
    }
  },

  /** A stunned hog falls to anything; its brow rings off both attacks. */
  struck(e, attack, side) { return e.state === 'stunned' || side !== 'front' ? 'kill' : 'ring'; },

  pose(e) { return { speed: e.speedNow || 0, attack: e.attack || 0, alert: e.alert || 0, stun: e.stun || 0, paw: e.state === 'paw' ? clamp(e.st / CHARGE.paw, 0, 1) : 0, rush: e.state === 'rush' ? 1 : 0 }; },
};
