// THE SMOKECALLER: a tall Snuffer with a staff of violet fire that does not fight: it keeps 8 to 12 m from the hero (backing off, always slower than a run) and every 7 s CALLS: it raises the
// staff for 1.2 s (a puff of smoke boils up beside it: 0.8 s of warning) and a Snuffer steps out of the smoke and comes for the hero. Never more than three of them at once. It falls to a
// flame or a ram, and when it falls the Snuffers it called go up in smoke with it: the way to fight it is to go through what it calls, to it.
//
//   idle -> alert -> kite (keep 8 to 12 m) -> cast (1.2 s) -> [a Snuffer comes out of the smoke] -> kite ...
import { hyp, clamp, bearing, turnTo, loiter, startAlert, stepAlert, kite, goHome } from './core.js';

export const CALL = { alert: 0.42, min: 8, max: 12, walk: 3.0, back: 4.5, panicR: 3.5, panic: 5.5, panicT: 0.8, every: 7.0, first: 1.6, cast: 1.2, warn: 0.8, cap: 3, spot: 2.8, range: 20 };

export const call = {
  init(e) { e.minions = []; e.callCd = CALL.first; e.panicT = 0; e.sx = e.x; e.sz = e.z; e.attack = 0; },

  step(e, dt, ctx) {
    const C = CALL, hero = ctx.hero;
    e.t += dt;
    e.minions = e.minions.filter((m) => ctx.alive(m));
    e.attack = e.state === 'cast' ? e.attack : 0;
    switch (e.state) {
      case 'idle':
        if (loiter(e, dt, ctx)) { startAlert(e, ctx, C.alert); e.callCd = C.first; }
        break;
      case 'alert':
        if (stepAlert(e, dt, ctx)) e.state = 'kite';
        break;
      case 'kite': {
        if (hero.dead || hyp(hero.x - e.x, hero.z - e.z) > e.K.notice + 8) { if (!e.wild) e.state = 'return'; e.speedNow = 0; break; }
        const dp = kite(e, dt, ctx, C);
        e.callCd -= dt;
        if (e.callCd <= 0 && e.minions.length < C.cap && dp <= C.range && !(e.panicT > 0)) {
          // the smoke boils up between the foe and the hero, a little to one side
          const to = bearing(e.x, e.z, hero.x, hero.z), side = (ctx.rng() - 0.5) * 3;
          e.sx = e.x + Math.sin(to) * C.spot + Math.cos(to) * side; e.sz = e.z + Math.cos(to) * C.spot - Math.sin(to) * side;
          e.state = 'cast'; e.st = 0; e.speedNow = 0; e.warned = false;
          ctx.emit('tell', { what: 'call', x: e.sx, z: e.sz, by: e });
        }
        break;
      }
      case 'cast':
        e.st += dt; e.speedNow = 0;
        e.attack = 0.4 * clamp(e.st / C.cast, 0, 1);
        e.yaw = turnTo(e.yaw, bearing(e.x, e.z, hero.x, hero.z), 5, dt);
        if (e.st >= C.cast) { ctx.emit('summon', { x: e.sx, z: e.sz, kind: 'basic', by: e }); e.callCd = C.every; e.state = 'kite'; e.attack = 0; }
        break;
      case 'return':
        if (!hero.dead && hyp(hero.x - e.x, hero.z - e.z) < e.K.notice) { e.state = 'kite'; break; }
        if (goHome(e, dt, ctx, e.K.speed * 1.2)) { e.state = 'idle'; e.st = 1; e.speedNow = 0; }
        break;
      default: break;
    }
  },

  struck() { return 'kill'; },

  /** When it falls, what it called goes (the system dismisses the foes in `e.minions`). */
  pose(e) { return { speed: e.speedNow || 0, attack: e.attack || 0, alert: e.alert || 0, cast: e.state === 'cast' ? clamp(e.st / CALL.cast, 0, 1) : 0 }; },
};
