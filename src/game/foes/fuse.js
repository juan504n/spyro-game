// THE FUSEPUP: a round little Snuffer sitting on a keg of powder. It sees the hero, lights its fuse (sparks, a hiss that climbs) and runs at him at 7.2 m/s, quicker than any Snuffer but slower
// than a run. The fuse burns 3 s; at 1.4 m from the hero or at the end of the fuse the keg goes off: 3.4 m, and it hurts every Snuffer in it as well as the hero. Killed by a flame or a
// ram it goes off where it stands, so the answers are: flame it from 4 m or more (it pops, the hero is out of the blast, and the Snuffers round it are not), outrun it and let it
// burn out behind him, or lead it into a crowd. A ram is the wrong answer: the hero is in the blast. (A fuse burns for 1.2 s at least before the keg may go off at the hero's feet: a hero who
// walks into one has time to run, and runs faster than it does.)
//
//   idle -> light (0.45 s: the fuse is lit, the 3 s begin) -> run (at the hero) -> boom
import { hyp, bearing, turnTo, loiter, steer } from './core.js';

export const FUSE = { light: 0.45, speed: 7.2, fuse: 3.0, blast: 3.4, trigger: 1.4, armed: 1.2 };

/** The keg goes off where the foe stands: the hero is hurt if he is in it; the system hurts the Snuffers in it and puts the foe away (a foe that goes off by itself is gone, with no gems). */
export function explode(e, ctx, byHero) {
  if (e.exploded) return;
  e.exploded = true; e.byHero = !!byHero;
  const hero = ctx.hero;
  ctx.emit('boom', { x: e.x, y: e.y, z: e.z, r: FUSE.blast, by: e, byHero: !!byHero });
  if (!hero.dead && hyp(hero.x - e.x, hero.z - e.z) < FUSE.blast + hero.r && Math.abs(hero.y - e.y) < 3) ctx.emit('hurt', { x: e.x, z: e.z, by: e });
}

export const fuse = {
  init(e) { e.fuseT = 0; e.exploded = false; },

  step(e, dt, ctx) {
    const F = FUSE, hero = ctx.hero;
    e.t += dt; e.speedNow = 0; e.attack = 0;
    const dp = hyp(hero.x - e.x, hero.z - e.z), to = bearing(e.x, e.z, hero.x, hero.z);
    switch (e.state) {
      case 'idle':
        if (loiter(e, dt, ctx, F.speed * 0.3)) {
          e.state = 'light'; e.st = 0; e.fuseT = F.fuse; e.alert = 1;
          ctx.emit('alert', { x: e.x, z: e.z, by: e });
          ctx.emit('tell', { what: 'fuse', x: e.x, z: e.z, by: e });
        }
        break;
      case 'light':
        e.st += dt; e.fuseT -= dt; e.alert = Math.max(0, 1 - e.st / F.light);
        e.yaw = turnTo(e.yaw, to, 10, dt);
        if (e.st >= F.light) e.state = 'run';
        break;
      case 'run': {
        e.fuseT -= dt;
        const h = steer(e, ctx, to, F.speed, dt);
        if (h !== null) { e.yaw = turnTo(e.yaw, h, 12, dt); e.speedNow = F.speed; } else e.yaw = turnTo(e.yaw, to, 12, dt);
        if ((dp <= F.trigger && e.fuseT <= F.fuse - F.armed) || e.fuseT <= 0) explode(e, ctx, false);        // (a keg has burned for 1.2 s at least before it goes off at his feet: he can run)
        break;
      }
      default: break;
    }
  },

  /** Any attack sets it off, where it is. */
  struck() { return 'boom'; },

  pose(e) { return { speed: e.speedNow || 0, attack: 0, alert: e.alert || 0, fuse: e.state === 'idle' ? 0 : Math.max(0, e.fuseT) / FUSE.fuse, lit: e.state === 'idle' ? 0 : 1 }; },
};
