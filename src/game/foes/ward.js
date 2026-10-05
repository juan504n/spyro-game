// THE LIDWARDEN: a Snuffer behind a shield as tall as a door. Flame and ram both ring off it from the front (a quarter of the circle, 65 degrees either side of where it faces). It walks at the hero
// at 3.6 m/s and turns slowly (1.3 rad/s: the hero circles it three times as fast as it can turn), so what it presents is its front and what the hero can reach is its side and its back. It
// raises the shield for a bash (1.1 s: a glow along the rim; it turns slower still), bashes, and for 0.9 s after the bash the shield is down and it falls to anything.
//
//   idle -> alert -> advance (turn to the hero, walk) -> raise (1.1 s) -> bash -> open (0.9 s: the shield is down) -> advance ...
import { hyp, bearing, turnTo, wrap, clamp, loiter, startAlert, stepAlert, goHome } from './core.js';

export const WARD = { alert: 0.5, walk: 3.6, turn: 1.3, turnRaise: 0.6, near: 2.6, raise: 1.1, reach: 2.7, arc: 1.05, open: 0.9, front: 1.13 };

export const ward = {
  front: WARD.front,                                                                     // (the half angle of its shield: what sideOf calls 'front')

  init(e) { e.shield = 1; },

  step(e, dt, ctx) {
    const W = WARD, hero = ctx.hero;
    e.t += dt; e.speedNow = 0; e.attack = 0; e.shield = e.state === 'open' ? 0 : 1;
    const dp = hyp(hero.x - e.x, hero.z - e.z), to = bearing(e.x, e.z, hero.x, hero.z);
    switch (e.state) {
      case 'idle':
        if (loiter(e, dt, ctx)) startAlert(e, ctx, W.alert);
        break;
      case 'alert':
        if (stepAlert(e, dt, ctx, 3)) e.state = 'advance';
        break;
      case 'advance': {
        if (hero.dead || dp > e.K.notice + 8) { if (!e.wild) e.state = 'return'; break; }
        const err = wrap(to - e.yaw);
        e.yaw = turnTo(e.yaw, to, W.turn, dt);
        if (dp > W.near) { const k = Math.max(0, Math.cos(err)); ctx.move(e, Math.sin(e.yaw) * W.walk * k, Math.cos(e.yaw) * W.walk * k, dt); e.speedNow = W.walk * k; }
        else if (Math.abs(err) < 0.6) { e.state = 'raise'; e.st = 0; ctx.emit('tell', { what: 'raise', x: e.x, z: e.z, by: e }); }
        break;
      }
      case 'raise':
        e.st += dt; e.attack = 0.4 * clamp(e.st / W.raise, 0, 1);
        e.yaw = turnTo(e.yaw, to, W.turnRaise, dt);
        if (e.st >= W.raise) {
          ctx.emit('bash', { x: e.x + Math.sin(e.yaw) * 1.5, y: e.y, z: e.z + Math.cos(e.yaw) * 1.5, by: e });
          if (!hero.dead && dp < W.reach + hero.r && Math.abs(wrap(to - e.yaw)) < W.arc) ctx.emit('hurt', { x: e.x, z: e.z, by: e });
          e.state = 'open'; e.st = 0;
        }
        break;
      case 'open':
        e.st += dt; e.attack = 0.6 + 0.4 * clamp(e.st / W.open, 0, 1);
        if (e.st >= W.open) { e.state = 'advance'; e.attack = 0; }
        break;
      case 'return':
        if (!hero.dead && dp < e.K.notice) { e.state = 'advance'; break; }
        if (goHome(e, dt, ctx, e.K.speed)) { e.state = 'idle'; e.st = 1; }
        break;
      default: break;
    }
  },

  /** The shield rings off both attacks from the front, unless it is down. */
  struck(e, attack, side) { return e.state === 'open' || side !== 'front' ? 'kill' : 'ring'; },

  pose(e) { return { speed: e.speedNow || 0, attack: e.attack || 0, alert: e.alert || 0, shield: e.shield }; },
};
