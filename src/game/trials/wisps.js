// WISPS (aim and count): vents in a ring, and out of them, one after another, the lost wisps of the realm rise and try to get away (3.4 s from vent to the sky). Breathe fire on a wisp and it is
// burnt; the hero needs 8 of the 12. If too many escape for him to reach it, the vents go quiet for a moment and begin again. A breath burns every wisp it reaches (the aim assist swings him
// towards the nearest).
//
//   idle (until the hero is near) -> run (a wisp every 1.5 s or so) -> solved (8 burnt) | fail (5 escaped: begin again after a pause)
import { hyp, lerp, pick } from './core.js';

export const WISPS = { wake: 15, life: 3.4, gap: 1.5, jitter: 0.4, rise: 3.2, r: 0.85, dy: 2.8, want: 8, total: 12, pause: 3.0, first: 1.2 };

export const wisps = {
  init(t) {
    t.want = t.want ?? WISPS.want; t.total = t.total ?? WISPS.total;
    t.live = []; t.spawned = 0; t.hits = 0; t.escaped = 0; t.nextIn = WISPS.first; t.pause = 0; t.lastVent = -1; t.rounds = 0; t.state = 'idle';
  },

  step(t, dt, ctx) {
    const W = WISPS, p = ctx.p;
    t.t += dt;
    if (t.state === 'solved') { for (const w of t.live) w.age += dt; t.live = t.live.filter((w) => w.age < 1); return; }
    const near = hyp(p.x - t.x, p.z - t.z) < W.wake;
    if (t.state === 'idle') { if (near) { t.state = 'active'; ctx.emit('start', { by: t }); } else return; }
    if (t.pause > 0) { t.pause -= dt; if (t.pause <= 0) { t.nextIn = W.first; } return; }
    // the vents let one go
    if (t.spawned < t.total) {
      t.nextIn -= dt;
      if (t.nextIn <= 0) {
        let v;
        do { v = pick(ctx.rng, t.vents.length); } while (t.vents.length > 1 && v === t.lastVent);
        t.lastVent = v; t.spawned++;
        t.live.push({ vent: v, age: 0, x: t.vents[v].x, y: (t.vents[v].y || 0) + 0.6, z: t.vents[v].z, dead: null });
        ctx.emit('spawn', { by: t, vent: v });
        t.nextIn = W.gap * (1 - W.jitter / 2 + W.jitter * ctx.rng());
      }
    }
    for (const w of t.live) {
      if (w.dead) { w.age += dt; continue; }
      w.age += dt;
      const k = w.age / W.life, v = t.vents[w.vent];
      w.y = (v.y || 0) + lerp(0.6, W.rise, k) + Math.sin(w.age * 5 + w.vent) * 0.15;
      w.x = v.x + Math.sin(w.age * 2.3 + w.vent * 1.7) * 0.5; w.z = v.z + Math.cos(w.age * 2.1 + w.vent) * 0.5;
      if (p.flameT > 0 && p.flameHits(w.x, w.y, w.z, W.r, W.dy)) { w.dead = 'hit'; w.age = 0; t.hits++; ctx.emit('hit', { by: t, vent: w.vent, x: w.x, y: w.y, z: w.z }); }
      else if (w.age >= W.life) { w.dead = 'escape'; w.age = 0; t.escaped++; ctx.emit('miss', { by: t, vent: w.vent }); }
    }
    t.live = t.live.filter((w) => !w.dead || w.age < 0.6);
    if (t.hits >= t.want) { t.state = 'solved'; ctx.emit('solved', { by: t }); return; }
    // too many have got away to reach the number
    if (t.escaped > t.total - t.want || (t.spawned >= t.total && !t.live.some((w) => !w.dead) && t.hits < t.want)) {
      ctx.emit('fail', { by: t, why: 'escaped' });
      t.live = []; t.spawned = 0; t.hits = 0; t.escaped = 0; t.pause = W.pause; t.rounds++; t.lastVent = -1;
    }
  },

  /** the hero has gone far off: the vents go quiet and begin again when he comes back (no sound) */
  sleep(t) { if (t.state !== 'solved') { t.live = []; t.spawned = 0; t.hits = 0; t.escaped = 0; t.pause = 0; t.nextIn = WISPS.first; t.lastVent = -1; t.state = 'idle'; } },

  hud(t) {
    if (t.state !== 'active') return null;
    return { text: `WISPS ${t.hits} OF ${t.want}`, n: t.hits, of: t.want };
  },

  /** the wisps the aim assist may swing him to */
  targets(t) { return t.state === 'active' ? t.live.filter((w) => !w.dead).map((w) => ({ x: w.x, y: w.y, z: w.z, r: 0.8 })) : []; },
};
