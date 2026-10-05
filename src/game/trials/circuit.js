// CIRCUIT (a clock): pylons of light round a loop of the country. The first one touched starts the clock; the rest must be touched in order before it runs out (the hint says how long). A pylon is
// touched by coming within 2.4 m of it (and within 3.2 m over or under it: a jump counts), so the way is the hero's own. When the time is up the pylons go dark and he begins again at the first.
// The time is set by the layout from the length of the way (tools/lib/realm-rules.mjs holds it to a pace of 60% of a run at the most).
import { hyp } from './core.js';

export const CIRCUIT = { touch: 2.4, dy: 3.2, wake: 22, pace: 0.6, minTime: 14 };

/** the seconds the clock gives for a way of `len` metres: the length at 60% of a run (11.5 m/s), plus a breath, and never under 14 */
export const timeFor = (len) => Math.max(CIRCUIT.minTime, Math.ceil(len / (11.5 * CIRCUIT.pace) + 3));

export const circuit = {
  init(t) {
    t.next = 0; t.clock = 0; t.running = false; t.laps = 0; t.state = 'idle';
    if (t.time === undefined) {
      let len = 0;
      for (let i = 1; i < t.pylons.length; i++) len += hyp(t.pylons[i].x - t.pylons[i - 1].x, t.pylons[i].z - t.pylons[i - 1].z);
      t.time = timeFor(len);
    }
  },

  step(t, dt, ctx) {
    const p = ctx.p;
    t.t += dt;
    if (t.state === 'solved') return;
    if (hyp(p.x - t.x, p.z - t.z) < CIRCUIT.wake || t.running) t.state = 'active';
    if (t.running) {
      t.clock += dt;
      if (t.clock > t.time) { t.running = false; t.next = 0; t.clock = 0; t.laps++; ctx.emit('fail', { by: t, why: 'time' }); return; }
    }
    const b = t.pylons[t.next];
    if (b && hyp(p.x - b.x, p.z - b.z) < CIRCUIT.touch && Math.abs(p.y - (b.y || 0)) < CIRCUIT.dy) {
      if (t.next === 0) { t.running = true; t.clock = 0; ctx.emit('start', { by: t }); }
      ctx.emit('pylon', { by: t, i: t.next });
      t.next++;
      if (t.next >= t.pylons.length) { t.running = false; t.state = 'solved'; ctx.emit('solved', { by: t }); }
    }
  },

  hud(t) {
    if (t.state !== 'active' && !t.running) return null;
    const left = Math.max(0, t.time - t.clock);
    return { text: t.running ? `PYLONS ${t.next} OF ${t.pylons.length}  ${left.toFixed(1)}` : `RUN THE PYLONS IN ${t.time} SECONDS`, n: t.next, of: t.pylons.length, clock: t.running ? left : null, total: t.time };
  },
  targets() { return []; },
};
