// The on-screen move stick (pure maths, so it can be tested without a DOM).
//
// A floating stick: it appears where the left thumb lands (that is the circle you see when you tap) and reads the thumb's offset from
// there. Two things make it easy to point Spyro where you want:
//   * a dead zone: the first ~14 % of the radius does nothing, so a resting thumb (they always wander a few pixels) cannot make him
//     shuffle about or change his facing;
//   * a base that follows the thumb: once the thumb is pulled past the rim it drags the circle along, so the thumb is never more than
//     one radius from the centre and turning to any direction (even the opposite one) is at most one radius of movement.
//     (Before, the circle stayed where it landed: after a long slide the direction could only be changed by dragging the thumb all
//     the way round a big circle, which made turning imprecise and sluggish.)
export class FloatingStick {
  constructor({ radius = 52, dead = 0.14 } = {}) {
    this.radius = radius;
    this.dead = dead;
    this.active = false;
    this.bx = 0; this.by = 0;        // centre of the circle (client px)
    this.x = 0; this.y = 0;          // output, x right / y up, length 0..1 (dead zone removed)
    this.dx = 0; this.dy = 0;        // thumb offset from the centre (px, clamped to the radius), for drawing the nub
  }

  start(x, y) {
    this.active = true;
    this.bx = x; this.by = y;
    this.x = this.y = this.dx = this.dy = 0;
    return this;
  }

  /** the thumb is now at (x, y): update the output (and drag the circle along if the thumb left it) */
  move(x, y) {
    if (!this.active) return this;
    let dx = x - this.bx, dy = y - this.by, l = Math.hypot(dx, dy);
    if (l > this.radius) {
      const over = l - this.radius;
      this.bx += (dx / l) * over; this.by += (dy / l) * over;
      dx = x - this.bx; dy = y - this.by; l = this.radius;
    }
    const m = l / this.radius;
    const k = m < this.dead ? 0 : (m - this.dead) / (1 - this.dead);
    this.x = l > 0 ? (dx / l) * k : 0;
    this.y = l > 0 ? (-dy / l) * k : 0;
    this.dx = dx; this.dy = dy;
    return this;
  }

  end() {
    this.active = false;
    this.x = this.y = this.dx = this.dy = 0;
    return this;
  }
}
