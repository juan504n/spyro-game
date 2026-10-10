// THE SLAG BRUTE: the elite of Emberfall Crags, three Snuffers tall in a coat of slag, with a furnace in its chest. It does not die to one hit and it does not fight fair: it walks at the hero at
// 3.2 m/s (turning slowly, 1.6 rad/s), stops, RAISES both fists for 1.0 s (a ring of heat grows on the ground at its feet: the tell), and SLAMS: everything on the ground within 4.6 m of it is
// hurt, a hero who is more than 1.1 m off the ground (a jump) goes over it. The slam cracks its coat, and for 2.8 s after it the furnace VENTS: the hatch in its chest stands open and anything that
// reaches it wounds it. A wound shuts the hatch for 1.2 s (a second blow in that time rings off), so one vent is two wounds at the most; three wounds take it down. A brute that is struck while it is
// shut rings off the flame and the ram alike (the ram throws the hero back, as off a bell).
//
//   idle -> alert -> advance -> raise (1.0 s: the ring grows) -> slam -> vent (2.8 s: wounds) -> advance ...                       (wounds: 3)
import { hyp, bearing, turnTo, clamp, loiter, startAlert, stepAlert, goHome, steer } from './core.js';

export const BRUTE = { alert: 0.6, walk: 3.2, turn: 1.6, near: 3.6, raise: 1.0, slamR: 4.6, jumpOver: 1.1, vent: 2.8, shut: 1.2, wounds: 3, leave: 10 };

export const brute = {
  init(e) { e.wounds = 0; e.shutT = 0; e.hit = false; e.vent = 0; },

  step(e, dt, ctx) {
    const B = BRUTE, hero = ctx.hero;
    e.t += dt; e.speedNow = 0; e.attack = 0; e.stun = 0; e.shutT = Math.max(0, e.shutT - dt);
    e.vent = e.state === 'vent' && e.shutT <= 0 ? 1 : 0;                                  // (the hatch is open while it vents and no wound has shut it)
    const dp = hyp(hero.x - e.x, hero.z - e.z), to = bearing(e.x, e.z, hero.x, hero.z);
    switch (e.state) {
      case 'idle':
        if (loiter(e, dt, ctx, 1.2)) startAlert(e, ctx, B.alert);
        break;
      case 'alert':
        if (stepAlert(e, dt, ctx, 3)) e.state = 'advance';
        break;
      case 'advance': {
        if (hero.dead || dp > e.K.notice + B.leave) { if (!e.wild) e.state = 'return'; break; }
        const err = Math.abs(((to - e.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        e.yaw = turnTo(e.yaw, to, B.turn, dt);
        if (dp > B.near) { const k = Math.max(0.15, Math.cos(Math.min(err, 1.5))); if (steer(e, ctx, e.yaw, B.walk * k, dt) !== null) e.speedNow = B.walk * k; }          // (round a post or a stone's pad: steer tries the headings beside)
        else { e.state = 'raise'; e.st = 0; e.hit = false; ctx.emit('tell', { what: 'raise', x: e.x, z: e.z, r: B.slamR, by: e }); }
        break;
      }
      case 'raise':
        e.st += dt; e.attack = 0.4 * clamp(e.st / B.raise, 0, 1);
        e.yaw = turnTo(e.yaw, to, 0.8, dt);
        if (e.st >= B.raise) {
          ctx.emit('bash', { x: e.x, y: e.y, z: e.z, r: B.slamR, by: e });
          if (!hero.dead && dp < B.slamR + hero.r && hero.y - e.y < B.jumpOver) ctx.emit('hurt', { x: e.x, z: e.z, by: e });
          e.state = 'vent'; e.st = 0; e.shutT = 0;
        }
        break;
      case 'vent':
        e.st += dt; e.attack = 0.6 + 0.4 * clamp(e.st / B.vent, 0, 1); e.stun = 0.4;
        if (e.st >= B.vent) { e.state = 'advance'; e.attack = 0; e.vent = 0; }
        break;
      case 'return':
        if (!hero.dead && dp < e.K.notice) { e.state = 'advance'; break; }
        if (goHome(e, dt, ctx, e.K.speed)) { e.state = 'idle'; e.st = 1; }
        break;
      default: break;
    }
  },

  /** Shut, it rings off both attacks. With the hatch open a blow wounds it (and shuts the hatch for a moment); the third wound kills it. */
  struck(e) {
    if (e.state !== 'vent' || e.shutT > 0) return 'ring';
    e.wounds++; e.shutT = BRUTE.shut;
    return e.wounds >= BRUTE.wounds ? 'kill' : 'wound';
  },

  pose(e) { return { speed: e.speedNow || 0, attack: e.attack || 0, alert: e.alert || 0, stun: e.stun || 0, vent: e.vent || 0, wounds: e.wounds || 0, raise: e.state === 'raise' ? clamp(e.st / BRUTE.raise, 0, 1) : 0 }; },
};
