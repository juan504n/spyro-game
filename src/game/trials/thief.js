// THIEF (a chase): the lantern's flame has been stolen by a Pilferling (foes/flee.js), which runs from the hero as it always does. When the hero comes near the place it steps out and the chase begins;
// the flame is its sack: catch it (flame it from 6 m, corner it, ram it from the side) and the seal is broken. A hero who is set back, or leaves for good, finds it at home again.
//
//   idle (until the hero is near) -> chase (the foe is out) -> solved (it has fallen) | back to idle (it is gone: the hero was set back and the foes put away)
import { hyp } from './core.js';

export const THIEF = { wake: 20, leave: 70 };

export const thief = {
  init(t) { t.foe = null; t.state = 'idle'; t.tries = 0; },

  step(t, dt, ctx) {
    const p = ctx.p;
    t.t += dt;
    if (t.state === 'solved') return;
    if (t.state === 'idle') {
      if (hyp(p.x - t.x, p.z - t.z) < THIEF.wake && !p.dead) {                       // (not while he is down: it would be made and put away again every step)
        t.foe = ctx.spawn('thief', t.spawnX ?? t.x, t.spawnZ ?? t.z, { trial: t.id });
        t.state = 'active'; t.tries++;
        ctx.emit('start', { by: t });
      }
      return;
    }
    const fate = ctx.fate(t.foe);
    if (fate === 'killed') { t.state = 'solved'; ctx.emit('solved', { by: t }); }
    else if (fate === 'gone') { t.foe = null; t.state = 'idle'; ctx.emit('fail', { by: t, why: 'gone' }); }
    else if (p.dead || hyp(p.x - t.x, p.z - t.z) > THIEF.leave) {                    // (set back, or gone for good: the thief is put away and is at home again when he comes back)
      ctx.dismiss(t.foe); t.foe = null; t.state = 'idle';
      ctx.emit('fail', { by: t, why: p.dead ? 'down' : 'left' });
    }
  },

  /** the hero has gone far off: the Pilferling is put away, and is at home when he comes back (no sound) */
  sleep(t, ctx) { if (t.state === 'active') { ctx.dismiss(t.foe); t.foe = null; t.state = 'idle'; } },

  hud(t) { return t.state === 'active' ? { text: 'CATCH THE PILFERLING', n: 0, of: 1 } : null; },
  targets() { return []; },
};
