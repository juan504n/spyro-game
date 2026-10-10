// HUNT (Emberfall Crags): the stones went cold when the Slag Brutes came out of the forges, and a Slag Brute holds each of three of them: it stands over its stone and the stone burns only when it falls. A brute is
// not a Snuffer to be breathed on: it slams the ground round it (jump the slam, or stand off it), and for 2.8 s after a slam the hatch in its chest stands open: a ram or a breath into the hatch wounds it, the
// hatch shuts for a moment, and the third wound brings it down (foes/brute.js). The other stones are lit by the asks that seal them (rings, mirrors). A breath on a stone the brutes hold is turned away.
//
//   spec { kind: 'hunt', goals: [the stones a brute holds], brutes: [{ goal, at: [x, z] }] }       (the brutes are placed with the realm: realm/populate.js; the mission finds the one nearest `at`)
import { Mission } from './base.js';
import { BRUTE } from '../foes/brute.js';

export class Hunt extends Mission {
  constructor(game, spec) {
    super(game, spec);
    this.holds = spec.brutes.map((q) => {
      const b = game.beacons.get(q.goal);
      let foe = null, best = 4;
      for (const e of game.enemies.list) { const d = Math.hypot(e.x - q.at[0], e.z - q.at[1]); if (e.kind === 'brute' && d < best) { best = d; foe = e; } }
      if (!foe) foe = game.enemies.add({ x: q.at[0], z: q.at[1], variant: 'brute', patrol: 3 });             // (a world that did not place it: one stands there)
      return { goal: b, foe, at: q.at };
    });
  }

  update(dt, game) {
    super.update(dt);
    if (this.restored) return;
    const p = game.player;
    for (const h of this.holds) if (!h.goal.litFlag && h.foe.state === 'dead' && h.foe.slain) this.complete(h.goal);
    this._flameRebuff(p, 'THE STONE IS COLD: THE SLAG BRUTE THAT HOLDS IT MUST FALL FIRST');
  }

  hudState() {
    const n = this.done, of = this.owned.length;
    if (n >= of) return null;
    const p = this.game.player;
    let near = null, nd = 36;
    for (const h of this.holds) { if (h.goal.litFlag || h.foe.state === 'dead') continue; const e = h.foe, d = Math.hypot(e.x - p.x, e.z - p.z); if (d < nd && e.state !== 'idle') { nd = d; near = e; } }
    if (near) return { text: `SLAG BRUTE  WOUNDS ${near.wounds || 0} OF ${BRUTE.wounds}`, n: near.wounds || 0, of: BRUTE.wounds };
    return { text: `SLAG BRUTES  ${n} OF ${of}`, n, of };
  }
}
