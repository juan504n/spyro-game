// PUCK (a sport): a crystal puck on a smooth court with a goal at the far end and a goalie that slides across the mouth of it. The hero rams the puck (it goes the way he is facing, at 16 m/s, and
// slows as it slides) and has to put it past the goalie three times. The court's walls turn it back (a goal is only the goal mouth), a puck that stops for 5 s is served again from the middle, and
// there is no clock and no way to lose: it is a game, and the goalie is slow enough to beat.
//
// The court has its own frame (`lx` across it, `lz` along it, the goal at +lz), turned by the trial's yaw, so that a court can lie any way in a country.
import { hyp, clamp } from './core.js';

export const PUCK = { wake: 20, r: 0.55, kick: 16, friction: 0.8, bounce: 0.88, stop: 0.35, still: 5, cd: 0.28, goalHold: 1.1, want: 3, goalie: { w: 1.9, depth: 0.5, speed: 1.9, inset: 1.5 } };

/** the court's own coordinates of a world point, and a world point of the court's */
export const toLocal = (t, x, z) => { const dx = x - t.x, dz = z - t.z, c = Math.cos(t.yaw), s = Math.sin(t.yaw); return [dx * c - dz * s, dx * s + dz * c]; };
export const toWorld = (t, lx, lz) => { const c = Math.cos(t.yaw), s = Math.sin(t.yaw); return [t.x + lx * c + lz * s, t.z - lx * s + lz * c]; };

/** where the goalie is across the court at time `time` */
export const goalieX = (t, time) => Math.sin(time * PUCK.goalie.speed + (t.phase || 0)) * Math.max(0, t.goalHW - PUCK.goalie.w / 2 - 0.15);

export const puck = {
  init(t) {
    t.hw = t.hw ?? 6.5; t.hl = t.hl ?? 11; t.goalHW = t.goalHW ?? 2.4; t.want = t.want ?? PUCK.want;
    t.score = 0; t.hold = 0; t.stillT = 0; t.cd = 0; t.state = 'idle'; t.phase = t.phase ?? 0;
    t.px = 0; t.pz = -t.hl * 0.2; t.vx = 0; t.vz = 0; t.gx = 0;
  },

  step(t, dt, ctx) {
    const P = PUCK, p = ctx.p;
    t.t += dt;
    if (t.state === 'solved') return;
    if (t.state === 'idle') { if (hyp(p.x - t.x, p.z - t.z) < P.wake) { t.state = 'active'; ctx.emit('start', { by: t }); } else return; }
    t.gx = goalieX(t, t.t);
    t.cd = Math.max(0, t.cd - dt);
    if (t.hold > 0) { t.hold -= dt; if (t.hold <= 0) { t.px = 0; t.pz = -t.hl * 0.2; t.vx = t.vz = 0; ctx.emit('serve', { by: t }); } return; }
    // the hero's ram
    if (p.chargeT > 0 && t.cd <= 0) {
      const [wx, wz] = toWorld(t, t.px, t.pz);
      if (p.chargeHits(wx, (t.y || 0) + 0.6, wz, P.r)) {
        const c = Math.cos(t.yaw), s = Math.sin(t.yaw);
        const ldx = p.dirx * c - p.dirz * s, ldz = p.dirx * s + p.dirz * c;
        t.vx = ldx * P.kick; t.vz = ldz * P.kick; t.cd = P.cd; t.stillT = 0;
        ctx.emit('kick', { by: t, x: wx, z: wz });
      }
    }
    // the puck slides
    const sp = hyp(t.vx, t.vz);
    if (sp > 0) {
      const k = Math.exp(-P.friction * dt);
      t.vx *= k; t.vz *= k;
      if (sp * k < P.stop) { t.vx = t.vz = 0; }
      // in small steps, so that a fast puck does not go through the goalie
      const n = Math.max(1, Math.ceil((sp * dt) / 0.25));
      for (let i = 0; i < n; i++) {
        t.px += (t.vx * dt) / n; t.pz += (t.vz * dt) / n;
        if (Math.abs(t.px) > t.hw - P.r) { t.px = clamp(t.px, -(t.hw - P.r), t.hw - P.r); t.vx = -t.vx * P.bounce; ctx.emit('bounce', { by: t }); }
        if (t.pz < -t.hl + P.r) { t.pz = -t.hl + P.r; t.vz = Math.abs(t.vz) * P.bounce; ctx.emit('bounce', { by: t }); }
        // the goalie
        const G = P.goalie, gz = t.hl - G.inset;
        if (Math.abs(t.px - t.gx) < G.w / 2 + P.r * 0.8 && Math.abs(t.pz - gz) < G.depth + P.r * 0.8) {
          if (t.pz < gz) { t.pz = gz - G.depth - P.r * 0.8; t.vz = -Math.abs(t.vz) * P.bounce; } else { t.pz = gz + G.depth + P.r * 0.8; t.vz = Math.abs(t.vz) * P.bounce; }
          ctx.emit('save', { by: t });
        }
        if (t.pz > t.hl - P.r) {
          if (Math.abs(t.px) < t.goalHW - P.r * 0.3) {
            t.score++; t.hold = P.goalHold; t.vx = t.vz = 0; t.pz = t.hl - P.r;
            ctx.emit('goal', { by: t, score: t.score });
            if (t.score >= t.want) { t.state = 'solved'; ctx.emit('solved', { by: t }); }
            break;
          }
          t.pz = t.hl - P.r; t.vz = -Math.abs(t.vz) * P.bounce; ctx.emit('bounce', { by: t });
        }
      }
    } else if (t.state === 'active') {
      t.stillT += dt;
      if (t.stillT > P.still) {                                                  // (a puck left in a corner for 5 s is served again from the middle)
        const nearCentre = hyp(t.px, t.pz + t.hl * 0.2) < 1.0;
        t.stillT = 0;
        if (!nearCentre) { t.px = 0; t.pz = -t.hl * 0.2; ctx.emit('serve', { by: t }); }
      }
    }
  },

  hud(t) {
    if (t.state !== 'active') return null;
    return { text: `GOALS ${t.score} OF ${t.want}`, n: t.score, of: t.want };
  },
  targets() { return []; },
};
