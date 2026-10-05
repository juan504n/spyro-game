// BELLS (an order to remember): a shrine and an arc of 4 to 6 bells. The hero comes near and the shrine rings a tune on them (each bell lights with its note, 0.85 s apart), and it is his turn: he
// breathes fire on the bells in the same order, one bell a breath. A wrong bell clunks and the tune is rung again; so it is when he waits too long. The last right bell breaks the seal.
//
//   wait (until the hero is near) -> listen (the tune) -> play (his turn) -> [a wrong bell: rest 1.1 s -> listen] ... -> solved
//
// The tune is `len` notes (3 to 6; it is never the same bell twice running, so a note is never hard to tell from the one before). The bells stand 3.2 m apart or more and the hero's breath is
// one bell: the one nearest to where he faces among those the flame reaches.
import { hyp, clamp, newBreath, flamedOne, pick } from './core.js';

export const BELLS = { wake: 16, gap: 0.85, glow: 0.55, tail: 0.3, rest: 1.1, replay: 18, r: 0.95, litT: 0.45, lenMin: 3, lenMax: 6 };

export const bells = {
  init(t, ctx) {
    const B = BELLS, n = t.bells.length;
    t.len = clamp(t.len ?? Math.min(4, n + 1), B.lenMin, B.lenMax);
    t.tune = [];
    for (let i = 0; i < t.len; i++) {
      let j;
      do { j = pick(ctx.rng, n); } while (n > 1 && j === t.tune[i - 1]);
      t.tune.push(j);
    }
    t.phase = 'wait'; t.ct = 0; t.k = -1; t.pos = 0; t.lit = -1; t.litT = 0; t.rest = 0; t.idle = 0; t.misses = 0; t.state = 'idle';
  },

  step(t, dt, ctx) {
    const B = BELLS, p = ctx.p;
    t.t += dt;
    if (t.state === 'solved') { t.litT = Math.max(0, t.litT - dt); return; }
    const fresh = newBreath(t, p);
    const near = hyp(p.x - t.x, p.z - t.z) < B.wake;
    if (t.litT > 0) { t.litT -= dt; if (t.litT <= 0 && t.phase === 'play') t.lit = -1; }
    switch (t.phase) {
      case 'wait':
        if (near) { t.phase = 'listen'; t.ct = 0; t.k = -1; t.state = 'active'; ctx.emit('turn', { by: t, listen: true }); }
        break;
      case 'listen': {
        t.ct += dt;
        const k = Math.floor(t.ct / B.gap), within = t.ct - k * B.gap < B.glow;
        if (k < t.len) {
          t.lit = within ? t.tune[k] : -1;
          if (within && t.k !== k) { t.k = k; ctx.emit('note', { by: t, i: t.tune[k], step: k }); }
        } else {
          t.lit = -1;
          if (t.ct >= t.len * B.gap + B.tail) { t.phase = 'play'; t.pos = 0; t.idle = 0; ctx.emit('turn', { by: t, listen: false }); }
        }
        break;
      }
      case 'play': {
        t.idle += dt;
        if (t.idle > B.replay || !near) { t.phase = near ? 'listen' : 'wait'; t.ct = 0; t.k = -1; t.lit = -1; t.pos = 0; ctx.emit('fail', { by: t, why: near ? 'idle' : 'left' }); break; }
        if (fresh || (p.flameT > 0 && !t.breathHit)) {
          const i = flamedOne(p, t.bells, { skip: () => t.breathHit });
          if (i >= 0) {
            t.breathHit = true; t.idle = 0;
            if (i === t.tune[t.pos]) {
              t.pos++; t.lit = i; t.litT = B.litT;
              ctx.emit('note', { by: t, i, ok: true, step: t.pos - 1 });
              if (t.pos >= t.len) { t.state = 'solved'; ctx.emit('solved', { by: t }); }
            } else {
              t.misses++; t.lit = i; t.litT = B.litT; t.phase = 'rest'; t.rest = B.rest; t.pos = 0;
              ctx.emit('miss', { by: t, i });
            }
          }
        }
        break;
      }
      case 'rest':
        t.rest -= dt;
        if (t.rest <= 0) { t.phase = near ? 'listen' : 'wait'; t.ct = 0; t.k = -1; t.lit = -1; if (near) ctx.emit('turn', { by: t, listen: true }); }
        break;
      default: break;
    }
  },

  hud(t) {
    if (t.state === 'solved' || t.phase === 'wait') return null;
    return { text: t.phase === 'listen' ? 'LISTEN' : t.phase === 'rest' ? 'AGAIN' : `BELLS ${t.pos} OF ${t.len}`, n: t.pos, of: t.len };
  },

  /** what the aim assist may aim at: the bells (while it is his turn) */
  targets(t) { return t.state !== 'solved' && t.phase === 'play' ? t.bells.map((b) => ({ x: b.x, y: b.y || 0, z: b.z, r: 0.9 })) : []; },
};
