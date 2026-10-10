// THE SHELLBACK: a crab the size of a hog, in a shell like a shield. It keeps its claws to the hero and goes SIDEWAYS round him at 3.6 m/s on a ring 4.2 m out (it turns to him at 2.2 rad/s: a hero
// who runs round it as fast as it scuttles is always in front of its claws), and every two seconds or so it raises them for 0.7 s and LUNGES at him, 9 m/s for 0.35 s, snapping. The shell covers its
// whole front half: the flame rings off it, and the ram does not kill it but FLIPS it, on its back with its legs in the air for 3 s, and a crab on its back falls to anything. Its back half is soft: from
// behind (or from the side the claws are not on) both attacks kill. Flip it, or get round it.
//
//   idle -> alert -> scuttle (round the hero, claws to him) -> raise (0.7 s) -> lunge (0.35 s) -> rest (0.9 s) -> scuttle ...  | flipped (3 s) -> right (0.6 s) -> scuttle
import { hyp, bearing, turnTo, clamp, loiter, startAlert, stepAlert, goHome, steer } from './core.js';

export const SHELL = { alert: 0.5, ring: 4.2, speed: 3.6, turn: 2.2, every: 2.2, tell: 0.7, lunge: 9, lungeMax: 0.35, hitR: 0.45, rest: 0.9, flipped: 3.0, right: 0.6, front: 1.5708, leave: 9 };

export const shell = {
  front: SHELL.front,                                                                    // (the half angle of its shell: the whole front half)

  init(e) { e.dir = 1; e.snapCd = SHELL.every; e.hit = false; e.dx = 0; e.dz = 1; },

  step(e, dt, ctx) {
    const S = SHELL, hero = ctx.hero;
    e.t += dt; e.speedNow = 0; e.attack = 0; e.stun = 0;
    const dp = hyp(hero.x - e.x, hero.z - e.z), to = bearing(e.x, e.z, hero.x, hero.z);
    switch (e.state) {
      case 'idle':
        if (loiter(e, dt, ctx, 1.4)) { startAlert(e, ctx, S.alert); e.dir = ctx.rng() < 0.5 ? 1 : -1; }
        break;
      case 'alert':
        if (stepAlert(e, dt, ctx, 4)) { e.state = 'scuttle'; e.snapCd = S.every * 0.7; }
        break;
      case 'scuttle': {
        if (hero.dead || dp > e.K.notice + S.leave) { if (!e.wild) e.state = 'return'; break; }
        e.yaw = turnTo(e.yaw, to, S.turn, dt);
        // sideways: along the tangent of the ring, bent in or out to hold the ring
        const tang = to + e.dir * Math.PI / 2, radial = (dp - S.ring) * 0.5;
        const vx = Math.sin(tang) * S.speed + Math.sin(to) * clamp(radial, -S.speed, S.speed), vz = Math.cos(tang) * S.speed + Math.cos(to) * clamp(radial, -S.speed, S.speed);
        if (ctx.move(e, vx, vz, dt) >= 0.5) e.speedNow = S.speed; else e.dir = -e.dir;
        e.snapCd -= dt;
        if (e.snapCd <= 0 && dp < S.ring + 2.5) { e.state = 'raise'; e.st = 0; ctx.emit('tell', { what: 'raise', x: e.x, z: e.z, by: e }); }
        break;
      }
      case 'raise':
        e.st += dt; e.attack = 0.3 * clamp(e.st / S.tell, 0, 1);
        e.yaw = turnTo(e.yaw, to, 5, dt);
        if (e.st >= S.tell) { e.state = 'lunge'; e.st = 0; e.hit = false; e.dx = Math.sin(e.yaw); e.dz = Math.cos(e.yaw); ctx.emit('rush', { x: e.x, z: e.z, by: e }); }
        break;
      case 'lunge': {
        e.st += dt; e.attack = 0.6; e.speedNow = S.lunge;
        const f = ctx.move(e, e.dx * S.lunge, e.dz * S.lunge, dt);
        if (!e.hit && !hero.dead && hyp(hero.x - e.x, hero.z - e.z) < e.r + hero.r + S.hitR && Math.abs(hero.y - e.y) < 1.4) { e.hit = true; ctx.emit('hurt', { x: e.x, z: e.z, by: e }); }
        if (f < 0.5 || e.st >= S.lungeMax) { e.state = 'rest'; e.st = 0; }
        break;
      }
      case 'rest':
        e.st += dt; e.attack = 0.8;
        e.yaw = turnTo(e.yaw, to, S.turn, dt);
        if (e.st >= S.rest) { e.state = 'scuttle'; e.snapCd = S.every; e.dir = ctx.rng() < 0.5 ? 1 : -1; }
        break;
      case 'flipped':
        e.st += dt; e.stun = 1;
        if (e.st >= S.flipped) { e.state = 'right'; e.st = 0; }
        break;
      case 'right':
        e.st += dt; e.stun = 0.5;
        if (e.st >= S.right) { e.state = 'scuttle'; e.snapCd = S.every; }
        break;
      case 'return':
        if (!hero.dead && dp < e.K.notice) { e.state = 'scuttle'; break; }
        if (goHome(e, dt, ctx, e.K.speed)) { e.state = 'idle'; e.st = 1; }
        break;
      default: break;
    }
  },

  /** On its back it falls to anything, and so it does from behind. Head on, the flame rings off and the ram turns it over. */
  struck(e, attack, side) {
    if (e.state === 'flipped' || e.state === 'right' || side !== 'front') return 'kill';
    if (attack === 'ram') { e.state = 'flipped'; e.st = 0; e.hit = true; return 'flip'; }
    return 'ring';
  },

  pose(e) { return { speed: e.speedNow || 0, attack: e.attack || 0, alert: e.alert || 0, stun: e.stun || 0, flipped: e.state === 'flipped' ? 1 : e.state === 'right' ? 1 - clamp(e.st / SHELL.right, 0, 1) : 0, raise: e.state === 'raise' ? clamp(e.st / SHELL.tell, 0, 1) : 0, dir: e.dir || 1 }; },
};
