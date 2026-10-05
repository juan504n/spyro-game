// THE DUSK MOTH: a moth the size of a cat that hangs in the air over the hero's head and does not come down to be hit. It circles him at 7 m, and every 4 s it dives: it rears for 0.7 s (its
// shadow grows on the ground where he stands, and fixes there for the last quarter second), and drops along a straight line at 14 m/s; it lands, and flaps on the ground for 1.4 s before it
// rises again. The flame reaches 3 m up and the ram does not: a hero who JUMPS and breathes fire takes it out of the air, and one who waits takes it as it lands. (The moth hangs 3.4 m over
// his feet: out of reach of a flame from the ground, within reach of one from the top of a jump.)
//
//   idle (hangs over its post) -> alert -> circle (7 m round the hero) -> rear (0.7 s: aims, then locks) -> dive (14 m/s) -> land (1.4 s) -> rise (0.6 s) -> circle ...
import { hyp, bearing, turnTo, lerp, clamp, sstep, loiter, startAlert, stepAlert } from './core.js';

export const SWOOP = { rise: 2.8, idleH: 2.8, orbitR: 7, orbitV: 4.0, chase: 10, every: 4.0, first: 1.5, tell: 0.7, lock: 0.25, dive: 14, hitR: 1.3, land: 1.4, up: 0.6, diveMax: 1.2, riseT: 0.6, leave: 10 };

export const swoop = {
  init(e) { e.gy = e.y; e.y = e.gy + SWOOP.idleH; e.ang = 0; e.dir = 1; e.diveCd = SWOOP.first; e.aimX = e.x; e.aimZ = e.z; e.hit = false; e.locked = false; e.landY = e.y; e.flying = true; },

  step(e, dt, ctx) {
    const S = SWOOP, hero = ctx.hero;
    e.t += dt; e.speedNow = 0; e.attack = 0; e.stun = 0;
    const dp = hyp(hero.x - e.x, hero.z - e.z), to = bearing(e.x, e.z, hero.x, hero.z);
    const bob = Math.sin(e.t * 3.1) * 0.22;
    switch (e.state) {
      case 'idle':
        // it hangs over its post, turning a slow circle of 3 m
        e.ang += 0.5 * dt;
        { const tx = e.hx + Math.cos(e.ang) * 3, tz = e.hz + Math.sin(e.ang) * 3, d = hyp(tx - e.x, tz - e.z) || 1, s = Math.min(d, 2.5 * dt); e.x += (tx - e.x) / d * s; e.z += (tz - e.z) / d * s; e.yaw = bearing(e.x, e.z, tx, tz); e.speedNow = 2.5; }
        e.y = lerp(e.y, e.gy + S.idleH + bob, Math.min(1, dt * 4));
        if (!hero.dead && dp < e.K.notice) { startAlert(e, ctx); e.ang = Math.atan2(e.z - hero.z, e.x - hero.x); e.diveCd = S.first; }
        break;
      case 'alert':
        e.y = lerp(e.y, hero.y + S.rise + bob, Math.min(1, dt * 4));
        if (stepAlert(e, dt, ctx, 8)) e.state = 'circle';
        break;
      case 'circle': {
        if (hero.dead || dp > e.K.notice + S.leave) { if (!e.wild) { e.state = 'idle'; e.hx = e.x; e.hz = e.z; e.gy = ctx.floorAt(e.x, e.z); } break; }
        e.ang += (S.orbitV / S.orbitR) * dt * e.dir;
        const tx = hero.x + Math.cos(e.ang) * S.orbitR, tz = hero.z + Math.sin(e.ang) * S.orbitR, d = hyp(tx - e.x, tz - e.z) || 1, s = Math.min(d, S.chase * dt);
        e.x += (tx - e.x) / d * s; e.z += (tz - e.z) / d * s; e.speedNow = s / dt;
        e.y = lerp(e.y, hero.y + S.rise + bob, Math.min(1, dt * 4));
        e.yaw = turnTo(e.yaw, to, 6, dt);
        e.diveCd -= dt;
        if (e.diveCd <= 0 && dp < S.orbitR + 3) { e.state = 'rear'; e.st = 0; e.locked = false; e.aimX = hero.x; e.aimZ = hero.z; ctx.emit('tell', { what: 'rear', x: e.x, z: e.z, by: e }); }
        break;
      }
      case 'rear':
        e.st += dt; e.attack = 0.3 * clamp(e.st / S.tell, 0, 1);
        e.y += S.up / S.tell * dt;
        e.yaw = turnTo(e.yaw, to, 8, dt);
        if (e.st < S.tell - S.lock) { e.aimX = hero.x; e.aimZ = hero.z; }
        else if (!e.locked) { e.locked = true; ctx.emit('lock', { x: e.aimX, z: e.aimZ, by: e }); }
        if (e.st >= S.tell) { e.state = 'dive'; e.st = 0; e.hit = false; e.locked = false; ctx.emit('dive', { x: e.x, z: e.z, by: e }); }
        break;
      case 'dive': {
        e.st += dt; e.attack = 0.5;
        const ty = ctx.floorAt(e.aimX, e.aimZ) + 0.1, dx = e.aimX - e.x, dy = ty - e.y, dz = e.aimZ - e.z, l = Math.hypot(dx, dy, dz) || 1, s = Math.min(l, S.dive * dt);
        e.x += dx / l * s; e.y += dy / l * s; e.z += dz / l * s; e.speedNow = S.dive;
        e.yaw = bearing(e.x, e.z, e.aimX, e.aimZ);
        if (!e.hit && !hero.dead && Math.hypot(hero.x - e.x, hero.y + 0.6 - (e.y + e.K.cy), hero.z - e.z) < S.hitR) { e.hit = true; ctx.emit('hurt', { x: e.x, z: e.z, by: e }); }
        if (l - s < 0.05 || e.st > S.diveMax) { e.state = 'land'; e.st = 0; e.y = ctx.floorAt(e.x, e.z) + 0.1; e.landY = e.y; ctx.emit('land', { x: e.x, y: e.y, z: e.z, by: e }); }
        break;
      }
      case 'land':
        e.st += dt; e.stun = 0.5;
        e.yaw = turnTo(e.yaw, to, 3, dt);
        if (e.st >= S.land) { e.state = 'rise'; e.st = 0; }
        break;
      case 'rise':
        e.st += dt;
        e.y = lerp(e.landY, hero.y + S.rise, sstep(0, 1, e.st / S.riseT));
        if (e.st >= S.riseT) { e.state = 'circle'; e.diveCd = S.every; }
        break;
      default: break;
    }
  },

  /** What reaches it (the geometry of the flame and the ram decides that) kills it. */
  struck() { return 'kill'; },

  pose(e) { return { speed: e.speedNow || 0, attack: e.attack || 0, alert: e.alert || 0, stun: e.stun || 0, perch: e.state === 'land' ? 1 : 0, dive: e.state === 'dive' ? 1 : 0, rear: e.state === 'rear' ? clamp(e.st / SWOOP.tell, 0, 1) : 0 }; },
};
