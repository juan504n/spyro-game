// THE DUSTMOLE: a mole that lives in soft ground. Underground it cannot be hurt: a mound of loose earth that follows the hero at 6 m/s (he outruns it), leaving a ripple. A hero who stops
// (to fight something else, to aim, to think) is caught: it stops under him, the ground CRACKS for 0.8 s in a ring (that is the tell: leave the ring), and it bursts up, hurting what is in
// the ring, and sits stunned for 1.6 s, when a flame or a ram kills it. Then it digs in and begins again.
//
//   idle (asleep under its mound) -> track (the mound follows him, 6 m/s) -> crack (0.8 s) -> burst -> dazed (1.6 s, the only time it can be hurt) -> dig (0.5 s) -> track ...
import { hyp, bearing, turnTo, sstep, clamp } from './core.js';

export const BURROW = { under: 6.0, pop: 1.2, crack: 0.8, burstR: 1.8, dazed: 1.6, dig: 0.5, rest: 1.0, giveUp: 12, leave: 8 };

export const burrow = {
  init(e) { e.under = 1; e.trackT = 0; e.cool = 0; e.untargetable = true; },

  step(e, dt, ctx) {
    const B = BURROW, hero = ctx.hero;
    e.t += dt; e.speedNow = 0; e.stun = 0; e.attack = 0;
    const dp = hyp(hero.x - e.x, hero.z - e.z), to = bearing(e.x, e.z, hero.x, hero.z);
    switch (e.state) {
      case 'idle':
        e.under = 1;
        if (!hero.dead && dp < e.K.notice) { e.state = 'track'; e.trackT = 0; ctx.emit('alert', { x: e.x, z: e.z, by: e }); }
        break;
      case 'track':
        e.under = 1; e.trackT += dt; e.cool = Math.max(0, e.cool - dt);
        if (hero.dead || dp > e.K.notice + B.leave || e.trackT > B.giveUp) { e.state = 'idle'; e.hx = e.x; e.hz = e.z; break; }       // (it sleeps where it is)
        e.yaw = turnTo(e.yaw, to, 8, dt);
        if (ctx.move(e, Math.sin(e.yaw) * B.under, Math.cos(e.yaw) * B.under, dt) >= 0.5) { e.speedNow = B.under; ctx.emit('ripple', { x: e.x, y: e.y, z: e.z, by: e }); }
        if (dp < B.pop && e.cool <= 0) { e.state = 'crack'; e.st = 0; ctx.emit('tell', { what: 'crack', x: e.x, y: e.y, z: e.z, r: B.burstR, by: e }); }
        break;
      case 'crack':
        e.under = 1; e.st += dt;
        if (e.st >= B.crack) {
          ctx.emit('burst', { x: e.x, y: e.y, z: e.z, r: B.burstR, by: e });
          if (!hero.dead && hyp(hero.x - e.x, hero.z - e.z) < B.burstR + hero.r && hero.y < e.y + 1.8) ctx.emit('hurt', { x: e.x, z: e.z, by: e });
          e.state = 'dazed'; e.st = 0; e.under = 0;
        }
        break;
      case 'dazed':
        e.under = 0; e.st += dt; e.stun = 1;
        if (e.st >= B.dazed) { e.state = 'dig'; e.st = 0; }
        break;
      case 'dig':
        e.st += dt; e.under = sstep(0, 1, e.st / B.dig); e.stun = 0.5;
        if (e.st >= B.dig) { e.state = 'track'; e.under = 1; e.cool = B.rest; e.trackT = 0; }
        break;
      default: break;
    }
    e.untargetable = e.state !== 'dazed';
  },

  /** Only a dazed mole can be hurt: underground, the flame and the ram go over it. */
  struck(e) { return e.state === 'dazed' ? 'kill' : 'ignore'; },

  pose(e) { return { speed: e.speedNow || 0, under: clamp(e.under, 0, 1), crack: e.state === 'crack' ? clamp(e.st / BURROW.crack, 0, 1) : 0, stun: e.stun || 0, alert: e.alert || 0 }; },
};
