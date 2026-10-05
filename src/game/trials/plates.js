// PLATES (a board): a hub and a ring of 5 or 6 plates of light round it. Landing on a plate turns it over and the two beside it (the ring is closed), and the hero must light them all. It is
// scrambled from the solved board by a few presses, so it can always be solved in that many (or fewer); a plate is pressed when he LANDS on it from off it, so that running over one
// is a press and standing on it is not, and the hub is bare floor to cross by (a ring of plates with the hub in the middle lets him get to any plate without crossing another).
import { hyp, pick } from './core.js';

export const PLATES = { r: 1.35, dy: 1.7, wake: 18, scramble: 3 };

/** the board after plate `i` is pressed (a ring: the two beside it turn over with it) */
export function pressed(on, i) {
  const n = on.length, out = on.slice();
  for (const k of [-1, 0, 1]) { const j = (i + k + n) % n; out[j] = !out[j]; }
  return out;
}

/** the fewest presses that light the whole ring, by looking at every set of presses (a press twice is none): { presses: [i...], n } */
export function solveBoard(on) {
  const n = on.length;
  let best = null;
  for (let m = 0; m < 1 << n; m++) {
    let b = on.slice(), c = 0;
    for (let i = 0; i < n; i++) if (m & (1 << i)) { b = pressed(b, i); c++; }
    if (b.every(Boolean) && (!best || c < best.n)) best = { m, n: c };
  }
  if (!best) return null;
  const presses = [];
  for (let i = 0; i < n; i++) if (best.m & (1 << i)) presses.push(i);
  return { presses, n: best.n };
}

export const plates = {
  init(t, ctx) {
    const n = t.plates.length;
    t.on = t.plates.map(() => true);
    const k = Math.min(t.scramble ?? PLATES.scramble, n - 2);
    let guard = 0;
    do {
      t.on = t.plates.map(() => true);
      const used = new Set();
      while (used.size < k) used.add(pick(ctx.rng, n));
      for (const i of used) t.on = pressed(t.on, i);
    } while (t.on.every(Boolean) && guard++ < 50);
    t.was = t.plates.map(() => false);
    t.moves = 0; t.par = solveBoard(t.on).n; t.state = 'idle';
  },

  step(t, dt, ctx) {
    const p = ctx.p;
    t.t += dt;
    if (t.state === 'solved') return;
    if (hyp(p.x - t.x, p.z - t.z) < PLATES.wake) t.state = 'active';
    for (let i = 0; i < t.plates.length; i++) {
      const b = t.plates[i];
      const inside = p.grounded && hyp(p.x - b.x, p.z - b.z) < PLATES.r && Math.abs(p.y - (b.y || 0)) < PLATES.dy;
      if (inside && !t.was[i]) {
        t.on = pressed(t.on, i); t.moves++;
        ctx.emit('press', { by: t, i, on: t.on.slice() });
        if (t.on.every(Boolean)) { t.state = 'solved'; ctx.emit('solved', { by: t }); }
      }
      t.was[i] = inside;
    }
  },

  hud(t) {
    if (t.state !== 'active') return null;
    const lit = t.on.filter(Boolean).length;
    return { text: `PLATES ${lit} OF ${t.on.length}`, n: lit, of: t.on.length };
  },
  targets() { return []; },
};
