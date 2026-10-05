// THE PILFERLING: a thief with a sack of stolen light. It does not fight. It runs from the hero at 9.6 m/s: quicker than any Snuffer, slower than a ram (24 m/s) and slower than a run
// (11.5 m/s), so a hero who runs gains on it slowly and a hero who rams catches it. Every few seconds it stops to jeer at him for 0.7 s (the moment a chase is won), it runs round a loop of
// the country rather than away off the edge of it, it SIDESTEPS a ram that comes at it (a ram cannot turn: 1.5 rad/s) when the ram is 6.5 m off, and a thief that is driven into a wall or a corner (it has to turn 65 degrees off its way for half a second with the hero close behind) puts its hands up for 2 s. It drops its sack when it falls.
//
//   idle (loiters, counting its loot) -> taunt (0.6 s) -> run -> jeer (0.7 s) -> run ... | cower (2 s) when cornered | return when he is far
import { hyp, bearing, turnTo, wrap, clamp, loiter, steer, goHome } from './core.js';

export const FLEE = { notice: 14, taunt: 0.6, speed: 9.6, every: 3.2, jeer: 0.7, cower: 2.0, leash: 28, boost: 1.25, stuckT: 0.5, away: 22, pinned: 7, jukeR: 6.5, jukeT: 0.28, jukeCd: 1.5, jukeSpeed: 1.6 };


/** A ram comes at it: at the last moment it is not there (the hero's ram cannot turn: he runs past, and must begin again). True while it is sidestepping. */
function juke(e, dt, ctx, dp) {
  const F = FLEE, hero = ctx.hero;
  if (e.jukeT > 0) {
    e.jukeT -= dt;
    ctx.move(e, Math.sin(e.jukeDir) * F.speed * F.jukeSpeed, Math.cos(e.jukeDir) * F.speed * F.jukeSpeed, dt);
    e.speedNow = F.speed * F.jukeSpeed; e.yaw = turnTo(e.yaw, e.jukeDir, 20, dt);
    return true;
  }
  if (hero.ram && dp < F.jukeR && dp > 1.5 && e.jukeCd <= 0) {
    const hv = Math.atan2(hero.vx, hero.vz);                                                    // (his heading: it steps off to one side or the other)
    e.jukeDir = hv + (ctx.rng() < 0.5 ? 1 : -1) * Math.PI / 2; e.jukeT = F.jukeT; e.jukeCd = F.jukeCd;
    ctx.emit('tell', { what: 'juke', x: e.x, z: e.z, by: e });
    return true;
  }
  return false;
}

export const flee = {
  init(e) { e.runT = 0; e.stuck = 0; e.boostT = 0; e.carry = true; e.jukeT = 0; e.jukeCd = 0; e.jukeDir = 0; },

  step(e, dt, ctx) {
    const F = FLEE, hero = ctx.hero;
    e.t += dt; e.speedNow = 0; e.attack = 0; e.stun = 0;
    const dp = hyp(hero.x - e.x, hero.z - e.z), to = bearing(e.x, e.z, hero.x, hero.z);
    switch (e.state) {
      case 'idle':
        if (loiter(e, dt, ctx, 1.4)) { e.state = 'taunt'; e.st = 0; e.alert = 1; ctx.emit('alert', { x: e.x, z: e.z, by: e }); ctx.emit('tell', { what: 'jeer', x: e.x, z: e.z, by: e }); }
        break;
      case 'taunt':
        e.jukeCd = Math.max(0, e.jukeCd - dt);
        if (juke(e, dt, ctx, dp)) break;
        e.st += dt; e.alert = Math.max(0, 1 - e.st / F.taunt);
        e.yaw = turnTo(e.yaw, to, 10, dt);
        if (e.st >= F.taunt) { e.state = 'run'; e.runT = 0; e.stuck = 0; }
        break;
      case 'run': {
        if (hero.dead || dp > e.K.notice + F.away) { if (!e.wild) e.state = 'return'; break; }
        e.runT += dt; e.boostT = Math.max(0, e.boostT - dt); e.jukeCd = Math.max(0, e.jukeCd - dt);
        if (juke(e, dt, ctx, dp)) break;
        // away from him, bent towards home when it has strayed (a loop, not a line out of the world)
        const dh = hyp(e.hx - e.x, e.hz - e.z);
        let heading = to + Math.PI;
        if (!e.wild && dh > F.leash * 0.6) { const k = clamp((dh - F.leash * 0.6) / (F.leash * 0.4), 0, 0.85), home = bearing(e.x, e.z, e.hx, e.hz); heading += wrap(home - heading) * k; }
        const speed = F.speed * (e.boostT > 0 ? F.boost : 1);
        const h = steer(e, ctx, heading, speed, dt);
        if (h !== null) {
          e.yaw = turnTo(e.yaw, h, 14, dt); e.speedNow = speed;
          // cornered: the way it wants is shut and it is being driven along a wall (bent 65 degrees or more off its way) with the hero close behind
          if (Math.abs(wrap(h - heading)) >= 1.1 && dp < F.pinned) e.stuck += dt; else e.stuck = Math.max(0, e.stuck - dt);
        } else { e.stuck += dt; e.yaw = turnTo(e.yaw, to + Math.PI, 14, dt); }
        if (e.stuck >= F.stuckT) { e.state = 'cower'; e.st = 0; e.stuck = 0; ctx.emit('tell', { what: 'cower', x: e.x, z: e.z, by: e }); }
        else if (e.runT >= F.every) { e.state = 'jeer'; e.st = 0; ctx.emit('tell', { what: 'jeer', x: e.x, z: e.z, by: e }); }
        break;
      }
      case 'jeer':
        e.jukeCd = Math.max(0, e.jukeCd - dt);
        if (juke(e, dt, ctx, dp)) break;
        e.st += dt; e.yaw = turnTo(e.yaw, to, 12, dt); e.stun = 0.3;
        if (e.st >= F.jeer) { e.state = 'run'; e.runT = 0; }
        break;
      case 'cower':
        e.st += dt; e.stun = 1;
        if (e.st >= F.cower) { e.state = 'run'; e.runT = 0; e.boostT = 1.0; }
        break;
      case 'return':
        if (!hero.dead && dp < e.K.notice) { e.state = 'run'; e.runT = 0; break; }
        if (goHome(e, dt, ctx, F.speed * 0.5)) { e.state = 'idle'; e.st = 1; e.speedNow = 0; }
        break;
      default: break;
    }
  },

  struck() { return 'kill'; },

  pose(e) { return { speed: e.speedNow || 0, attack: 0, alert: e.alert || 0, stun: e.stun || 0, jeer: e.state === 'jeer' || e.state === 'taunt' ? 1 : 0, cower: e.state === 'cower' ? 1 : 0 }; },
};

