// CHIME (Skyweaver Spires): the windbells of the Spires hang over their plinths, out of the reach of a hero on the ground, and a breath of fire does not make them ring: a bell rings when the hero FLIES into it. He has to be
// off the ground (a jump, a glide off a ledge, the lift of a whirlwind: whatever puts him in the air at the height of the bell) and within a stride of it, and the plain jump is enough for the first one only because it stands
// on a plinth of its own; the others hang where the glides and the whirlwinds of the country take him. A bell that a trial still seals does not ring.
//
//   spec { kind: 'chime', goals: [the bells], reach?: metres round the bell's middle where he rings it (1.7) }
import { Mission } from './base.js';

export const CHIME = { centre: 2.85, reach: 1.7 };

export class Chime extends Mission {
  constructor(game, spec) {
    super(game, spec);
    this.reach = spec.reach ?? CHIME.reach;
  }

  /** where the bell's middle is (the clapper hangs there): over its plinth, at 2.85 m times the size of the goal */
  centre(b) { return b.y + CHIME.centre * b.scale; }

  /** is a hero at (x, y, z) in the air and within the reach of bell `b`? (y: his feet; the middle of his body is 0.5 m over them) */
  touches(b, x, y, z, grounded) {
    if (grounded) return false;
    return Math.hypot(x - b.x, y + 0.5 - this.centre(b), z - b.z) < this.reach * b.scale;
  }

  update(dt, game) {
    super.update(dt);
    if (this.restored) return;
    const p = game.player;
    if (!p.dead) for (const b of this.pending) {
      if (!this.touches(b, p.x, p.y, p.z, p.grounded)) continue;
      if (b.sealed) { this.rebuff(b); continue; }
      this.complete(b);
    }
    this._flameRebuff(p, 'THE BELL TAKES NO FIRE: IT RINGS WHEN YOU FLY INTO IT. JUMP, GLIDE, OR RIDE THE WIND UP TO IT');
  }

  hudState() {
    const n = this.done, of = this.owned.length;
    return n >= of ? null : { text: `BELLS RUNG  ${n} OF ${of}`, n, of };
  }
}
