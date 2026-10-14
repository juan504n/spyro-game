// SUPERCHARGE RAMPS (Emberfall Crags): a wedge of basalt with chevrons of ember across it (props/nature/ember.js `supercharge_ramp`). A hero who runs or rams up one and reaches its lip is SUPERCHARGED
// (player.js supercharge): thrown up and on along the ramp at P.superSpeed times a charge's speed, glowing, for P.superTime seconds, in which his ram goes through a Slag Brute's coat in ONE blow (the other
// way to beat one is its open hatch, three times: foes/brute.js) and takes three wounds off the Colossus's hatch (objectives/duel.js). Smaller foes die to a ram as ever, and the charge goes on through them.
//   gp.ramps: [{ x, z, rot, w, len, rise }]   (rot: the way up is (sin rot, cos rot); w the half width, len the length, rise the height of the lip)
export const RAMP = { w: 2.2, len: 8, rise: 1.7, lip: 1.5, minSpeed: 6, cooldown: 0.8 };

export class RampSystem {
  constructor(game, ramps) {
    this.game = game;
    this.ramps = (ramps || []).map((r) => ({ ...RAMP, ...r, dx: Math.sin(r.rot || 0), dz: Math.cos(r.rot || 0), cd: 0 }));
    this.trail = 0;
    this.told = false;
  }

  /** Where hero (x, z) is on ramp `r`: along it (0 = the middle, positive = up) and across it, in metres. */
  local(r, x, z) {
    const rx = x - r.x, rz = z - r.z;
    return { along: rx * r.dx + rz * r.dz, across: rx * r.dz - rz * r.dx };
  }

  update(dt, game) {
    const p = game.player, fx = game.fx;
    if (!p || p.dead) return;
    for (const r of this.ramps) {
      r.cd = Math.max(0, r.cd - dt);
      if (r.cd > 0) continue;
      const q = this.local(r, p.x, p.z);
      if (Math.abs(q.across) > r.w + 0.4 || q.along < r.len / 2 - r.lip || q.along > r.len / 2 + 0.6) continue;       // (on the last tread or the lip)
      if (p.y > r.y + r.rise + 1.2) continue;                                                                                // (a hero who is jumping over it is not on it)
      const up = p.vx * r.dx + p.vz * r.dz;
      if (up < r.minSpeed) continue;                                                                                           // (running up it, not down it or across)
      r.cd = r.cooldown;
      const fresh = p.supercharge(r.dx, r.dz);
      game.cam.shake(0.3, 0.3);
      game.audio?.sfx('charge_start', { vol: 1 });
      game.audio?.sfx('portal_arrive', { vol: 0.35 });
      fx.puff(p.x, p.y + 0.4, p.z, 1.4);
      for (let i = 0; i < 12; i++) fx.ember(p.x + (Math.random() - 0.5) * 1.6, p.y + 0.3, p.z + (Math.random() - 0.5) * 1.6);
      if (fresh && !this.told) { this.told = true; game.hud.hint('SUPERCHARGED! RAM A SLAG BRUTE NOW: ONE BLOW BREAKS ITS COAT', 5); }
    }
    // the supercharged hero leaves a trail of fire, thicker the faster he goes
    if (p.superT > 0) {
      this.trail -= dt;
      if (this.trail <= 0) {
        this.trail = 0.035;
        const a = Math.random() * 6.283, sp = Math.hypot(p.vx, p.vz);
        fx.spawn({ pool: 'add', sprite: 'spark_small', x: p.x + Math.cos(a) * 0.3, y: p.y + 0.3 + Math.random() * 0.5, z: p.z + Math.sin(a) * 0.3, vx: -p.vx * 0.06, vy: 0.5 + Math.random(), vz: -p.vz * 0.06,
          life: 0.45, size: [0.5 + sp * 0.02, 0.1], c0: [1, 0.85, 0.4, 1], c1: [1, 0.3, 0.08, 0] });
      }
    }
  }
}
