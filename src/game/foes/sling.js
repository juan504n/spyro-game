// THE SLINGER: a Snuffer that does not come to the hero: it stands off, 6 to 11 m away, and throws. The ball is a thing to read, not to be surprised by: it winds up for 0.9 s (an arm
// swinging a sling over its head), the ball flies for 1.1 s, and the ground shows where it will come down: a ring that follows the hero for the first 0.6 s of the flight and then stays
// where it is, so a hero who keeps moving is never where it lands, and one who stands still is. It backs off from a hero who comes near, always slower than he runs (so what is thrown
// at him can always be caught), and falls to one flame or one ram. A Slinger that falls takes its ball with it.
//
//   idle -> alert -> kite (face the hero, keep the distance) -> windup (0.9 s) -> [the ball flies] -> recover (0.55 s) -> kite ...
import { hyp, clamp, lerp, bearing, turnTo, loiter, startAlert, stepAlert, kite, goHome } from './core.js';

export const SLING = {
  windup: 0.9, flight: 1.1, lock: 0.5, burstR: 1.7, every: 2.8, first: 1.3, recover: 0.55, range: 14, arc: 3.2,
  min: 6, max: 11, walk: 3.0, back: 4.2, panicR: 3.2, panic: 5.4, panicT: 0.8,
};

/** The balls in the air: they fly whatever the Slinger is doing; the target follows the hero until `lock` seconds before it lands. */
function balls(e, dt, ctx) {
  const hero = ctx.hero;
  for (let i = e.balls.length - 1; i >= 0; i--) {
    const b = e.balls[i];
    b.t += dt;
    if (!b.locked) {
      if (b.t >= b.T - SLING.lock) { b.locked = true; ctx.emit('lock', { x: b.tx, z: b.tz, ball: b, by: e }); }
      else { b.tx = hero.x; b.tz = hero.z; }
    }
    const s = clamp(b.t / b.T, 0, 1), fy = ctx.floorAt(b.tx, b.tz);
    b.x = lerp(b.x0, b.tx, s); b.z = lerp(b.z0, b.tz, s); b.y = lerp(b.y0, fy + 0.3, s) + SLING.arc * 4 * s * (1 - s);
    if (b.t >= b.T) {
      e.balls.splice(i, 1);
      ctx.emit('splat', { x: b.tx, y: fy, z: b.tz, r: SLING.burstR, by: e });
      if (!hero.dead && hyp(hero.x - b.tx, hero.z - b.tz) < SLING.burstR + hero.r && hero.y < fy + 1.6) ctx.emit('hurt', { x: b.tx, z: b.tz, by: e });
    }
  }
}

export const sling = {
  init(e) { e.balls = []; e.throwCd = SLING.first; e.panicT = 0; e.attack = 0; },

  step(e, dt, ctx) {
    const S = SLING, hero = ctx.hero;
    e.t += dt;
    balls(e, dt, ctx);
    e.attack = e.state === 'windup' || e.state === 'recover' ? e.attack : 0;
    switch (e.state) {
      case 'idle':
        if (loiter(e, dt, ctx)) { startAlert(e, ctx); e.throwCd = S.first; }
        break;
      case 'alert':
        if (stepAlert(e, dt, ctx)) e.state = 'kite';
        break;
      case 'kite': {
        if (hero.dead || hyp(hero.x - e.x, hero.z - e.z) > e.K.notice + 8) { if (!e.wild) e.state = 'return'; e.speedNow = 0; break; }
        const dp = kite(e, dt, ctx, S);
        e.throwCd -= dt;
        if (e.throwCd <= 0 && dp <= S.range && !(e.panicT > 0)) { e.state = 'windup'; e.st = 0; e.speedNow = 0; ctx.emit('tell', { what: 'wind', x: e.x, z: e.z, by: e }); }
        break;
      }
      case 'windup': {
        e.st += dt; e.speedNow = 0;
        e.attack = 0.4 * clamp(e.st / S.windup, 0, 1);
        e.yaw = turnTo(e.yaw, bearing(e.x, e.z, hero.x, hero.z), 6, dt);
        if (e.st >= S.windup) {
          const b = { x0: e.x + Math.sin(e.yaw) * 0.5, y0: e.y + 1.7, z0: e.z + Math.cos(e.yaw) * 0.5, tx: hero.x, tz: hero.z, t: 0, T: S.flight, locked: false, x: 0, y: 0, z: 0 };
          b.x = b.x0; b.y = b.y0; b.z = b.z0;
          e.balls.push(b);
          ctx.emit('lob', { ball: b, by: e });
          e.state = 'recover'; e.st = 0;
        }
        break;
      }
      case 'recover':
        e.st += dt; e.speedNow = 0;
        e.attack = e.st < 0.12 ? 0.4 + (e.st / 0.12) * 0.2 : 0.6 + clamp((e.st - 0.12) / (S.recover - 0.12), 0, 1) * 0.4;
        if (e.st >= S.recover) { e.state = 'kite'; e.attack = 0; e.throwCd = S.every - S.recover; }
        break;
      case 'return':
        if (!hero.dead && hyp(hero.x - e.x, hero.z - e.z) < e.K.notice) { e.state = 'kite'; break; }
        if (goHome(e, dt, ctx, e.K.speed * 1.2)) { e.state = 'idle'; e.st = 1; e.speedNow = 0; }
        break;
      default: break;
    }
  },

  /** What the hero's flame or ram does to it (`side`: which side of it the hero is on). */
  struck() { return 'kill'; },

  /** What the model is told. */
  pose(e) { return { speed: e.speedNow || 0, attack: e.attack || 0, alert: e.alert || 0 }; },
};
