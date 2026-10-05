// SIEGE (clear the set): a ring of runed stones round the lantern. The hero steps inside and the ward comes down on the Snuffers that guard it: a wave of them, then another, then the last (the kinds are the
// realm's own cast). He fights them as he fights anything; when the last is down the seal is broken. If he is set back, whatever is left is put away and the ring is quiet again.
//
//   idle (the ring) -> wave 1 -> (the last of it falls; 1.2 s) -> wave 2 -> ... -> solved
import { hyp, polar } from './core.js';

export const SIEGE = { r: 12, enter: 0.7, pause: 1.2, spawnR: 0.78, leave: 3.2, wake: 30 };

export const siege = {
  init(t) { t.wave = -1; t.live = []; t.pause = 0; t.state = 'idle'; t.left = 0; },

  step(t, dt, ctx) {
    const S = SIEGE, p = ctx.p;
    t.t += dt;
    if (t.state === 'solved') return;
    const r = t.r ?? S.r, d = hyp(p.x - t.x, p.z - t.z);
    if (t.state === 'idle') {
      if (d < r * S.enter && !p.dead) { t.state = 'active'; t.wave = -1; t.pause = 0.6; ctx.emit('start', { by: t }); }
      return;
    }
    if (p.dead || d > r * S.leave) {                                                  // (set back, or gone: what is left is put away)
      for (const h of t.live) ctx.dismiss(h);
      t.live = []; t.state = 'idle'; t.wave = -1; t.left = 0;
      ctx.emit('fail', { by: t, why: p.dead ? 'down' : 'left' });
      return;
    }
    t.live = t.live.filter((h) => ctx.fate(h) === 'alive');
    t.left = t.live.length;
    if (t.pause > 0) { t.pause -= dt; if (t.pause > 0) return; }
    if (t.live.length === 0) {
      if (t.wave >= t.waves.length - 1) { t.state = 'solved'; ctx.emit('solved', { by: t }); return; }
      t.wave++;
      const kinds = t.waves[t.wave];
      kinds.forEach((kind, i) => {
        const a = (i / kinds.length) * Math.PI * 2 + t.wave * 0.9 + 0.5, [x, z] = polar(t.x, t.z, a, r * S.spawnR);
        t.live.push(ctx.spawn(kind, x, z, { wild: true, trial: t.id }));
      });
      t.left = t.live.length; t.pause = S.pause;
      ctx.emit('wave', { by: t, k: t.wave, n: kinds.length });
    }
  },

  /** the hero has gone far off: what is left is put away and the ring is quiet (no sound) */
  sleep(t, ctx) { if (t.state === 'active') { for (const h of t.live) ctx.dismiss(h); t.live = []; t.state = 'idle'; t.wave = -1; t.left = 0; } },

  hud(t) { return t.state === 'active' ? { text: `WAVE ${Math.max(1, t.wave + 1)} OF ${t.waves.length}  ${t.left} LEFT`, n: t.wave, of: t.waves.length } : null; },
  targets() { return []; },
};
