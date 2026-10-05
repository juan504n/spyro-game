// The Beacon Lanterns of a realm: its goal objects (Gloaming Vale's five lanterns; another realm brings its own, see the `model`, `beam`, `glow` and `flame` of a record below).
// Breathe fire on one to light it: the world gets a little closer to its sunrise, and the last one starts the finale.
import * as THREE from 'three';
import { makeModel } from '../models/fallback.js';

// day (0 = the realm's night, 1 = its dawn) after N beacons are lit; the last triggers the full finale
export const DAY_STEPS = [0, 0.14, 0.28, 0.42, 0.6, 1.0];
/** the day after each of `n` goals is lit: the level's own `goal.daySteps`, Gloaming Vale's for five, otherwise the same curve spread over n */
export const daySteps = (n, level) => {
  if (level && level.goal && level.goal.daySteps) return level.goal.daySteps;
  if (n === 5) return DAY_STEPS;
  return Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return i === n ? 1 : +(DAY_STEPS[Math.min(5, Math.round(t * 5))] * 0.999).toFixed(3); });
};
const WARM = [1, 0.72, 0.32], WARM_HALO = [1, 0.75, 0.35], OFF = [0.62, 0.5, 1.0], ON = [1.0, 0.82, 0.45], WISP = [0.7, 0.6, 1.0];

const v3 = new THREE.Vector3();

export class BeaconSystem {
  /**
   * defs: [{ id, name, x, y, z, big?, yaw?,
   *   model? (the model of the object: 'beacon'), beam? { off, on } (the colours of its beam before and after it is lit), glow? (the colour of its pool of light and its halo),
   *   wisp? (the colour of the wisps that circle it while it is out), flame? (false: no flame over it once lit, its model has its own glow),
   *   spark? { c0, c1 } ([r, g, b, a] from and to: the colours of the burst when it is lit), sparkle? [r, g, b] (the sparkles that drift up from it afterwards) }]
   */
  constructor(game, defs) {
    this.game = game;
    this.steps = daySteps(defs.length, game.level);
    this.list = defs.map((d, i) => this._make(d, i));
    this.lit = 0;
  }

  _make(d, index) {
    const g = this.game;
    const model = makeModel(g.assets, d.model || 'beacon', { big: !!d.big });
    model.root.position.set(d.x, d.y, d.z);
    model.root.rotation.y = d.yaw || 0;
    g.dyn.add(model.root);
    const beam = makeModel(g.assets, 'light_beam', { height: d.big ? 110 : 80, radius: d.big ? 2.6 : 1.5 });
    beam.root.position.set(d.x, d.y + (d.big ? 9 : 4.2), d.z);
    g.dyn.add(beam.root);
    const colors = { off: (d.beam && d.beam.off) || OFF, on: (d.beam && d.beam.on) || ON };
    beam.setColor?.(colors.off);
    beam.setIntensity?.(0.3);
    const scale = d.big ? 2.2 : 1;
    const flameY = d.y + 3.0 * scale;
    const pool = g.fx.decal({ pool: 'add', sprite: 'glow', x: d.x, z: d.z, r: d.big ? 15 : 9, color: d.glow || WARM, alpha: 0, lift: 0.1 });
    pool.y = d.y + 0.08;
    const halo = g.fx.billboard({ pool: 'add', sprite: 'glow', size: d.big ? 16 : 8, color: d.glow || WARM_HALO, alpha: 0 });
    halo.x = d.x; halo.y = flameY; halo.z = d.z;
    const wisps = [];
    for (let k = 0; k < 3; k++) {
      const w = g.fx.billboard({ pool: 'cut', sprite: 'snuffer_wisp', size: 1.5, color: d.wisp || WISP });
      wisps.push({ h: w, a: (k / 3) * 6.28 + index, r: 2.6 * scale + k * 0.3, s: 0.8 + k * 0.25, y: 1.4 + k * 1.1 });
    }
    return { def: d, index, model, beam, colors, x: d.x, y: d.y, z: d.z, scale, flameY, lit: 0, litFlag: false, pool, halo, wisps, t: Math.random() * 6, radius: 1.9 * scale };
  }

  get(id) { return this.list.find((b) => b.def.id === id); }

  /** Every lantern burns already, with none of the ceremony (a realm the hero has saved, entered again: Game._restore). */
  restore() {
    const g = this.game;
    for (const b of this.list) {
      b.litFlag = true;
      b.lit = 1;
      for (const w of b.wisps) w.h.visible = false;
    }
    this.lit = this.list.length;
    g.stats.beacons = this.lit;
    g.dayTarget = g.day = this.steps[Math.min(this.lit, this.steps.length - 1)];
  }

  /** Flame world position of a beacon. */
  flamePos(b, out = v3) {
    const a = b.model.anchors?.flame;
    if (a) { b.model.root.updateMatrixWorld(true); a.getWorldPosition(out); return out; }
    return out.set(b.x, b.flameY, b.z);
  }

  update(dt, game) {
    const p = game.player;
    for (const b of this.list) {
      b.t += dt;
      if (!b.litFlag) {
        // ignition by fire breath (or a friendly nudge of a charge hit); a lantern that a trial seals (systems/trials.js) takes none until the trial is solved
        if (p.flameT > 0 && !b.sealed && p.flameHits(b.x, b.y + 2.4 * b.scale, b.z, b.radius, 3.2 * b.scale)) this.ignite(b);
      } else {
        b.lit = Math.min(1, b.lit + dt * 0.85);
      }
    }
  }

  ignite(b) {
    if (b.litFlag) return;
    const g = this.game;
    b.litFlag = true;
    this.lit++;
    g.stats.beacons = this.lit;
    const fp = this.flamePos(b, new THREE.Vector3());
    g.fx.ignite(fp.x, fp.y, fp.z, b.def.big, b.def.spark);
    g.audio?.sfx(b.def.sfx || 'lantern_ignite', { vol: 1 });                // (a realm's goal may ring instead of whoomp: its brief's `sfx`)
    g.audio?.sfx('lantern_beam', { vol: 0.7 });
    g.cam.shake(b.def.big ? 0.6 : 0.35, 0.7);
    g.setCheckpoint({ x: b.x + Math.sin(b.def.yaw || 0) * 0 + 0, y: b.y, z: b.z + 2.4 * b.scale, yaw: Math.PI });
    g.dayTarget = this.steps[this.lit];
    g.audio?.setDay?.(this.steps[this.lit]);
    for (const w of b.wisps) {
      g.fx.puff(b.x + Math.cos(w.a) * w.r, b.y + w.y, b.z + Math.sin(w.a) * w.r, 0.6);
      w.h.visible = false;
    }
    g.emit('beacon', b, this.lit);
  }

  frame(dt, alpha, game) {
    const t = game.time;
    const day = game.day;
    for (const b of this.list) {
      const L = b.lit;
      b.model.setLit?.(L);
      b.model.update?.(dt, { t });
      // beam: pale violet call -> golden shaft
      const c0 = b.colors.off, c1 = b.colors.on;
      b.beam.setColor?.([c0[0] + (c1[0] - c0[0]) * L, c0[1] + (c1[1] - c0[1]) * L, c0[2] + (c1[2] - c0[2]) * L]);
      b.beam.setIntensity?.((0.3 + 0.62 * L) * (1 - 0.35 * day * L) * (b.sealed ? 0.55 : 1));          // (a sealed lantern's column is dimmer)
      b.beam.update?.(dt, { t });
      const flick = 0.9 + Math.sin(t * 9 + b.index) * 0.06 + Math.sin(t * 23) * 0.04;
      b.pool.alpha = 0.85 * L * flick * (1 - 0.55 * day);
      b.pool.y = b.y + 0.08;
      b.halo.alpha = 0.7 * L * flick * (1 - 0.5 * day);
      if (b.litFlag && Math.random() < 0.5 * dt * 30 * 0.12) {
        const fp = this.flamePos(b, v3);
        game.fx.sparkle(fp.x + (Math.random() - 0.5) * 1.2 * b.scale, fp.y + Math.random() * 1.5, fp.z + (Math.random() - 0.5) * 1.2 * b.scale, b.def.sparkle || [1, 0.85, 0.5], 0.5);
      }
      if (b.litFlag && b.def.flame !== false) game.fx.torchFlame(b.x, b.flameY - 0.3 * b.scale, b.z, true, 0.7 * b.scale);
      for (const w of b.wisps) {
        if (!w.h.visible) continue;
        w.a += dt * w.s;
        w.h.x = b.x + Math.cos(w.a) * w.r; w.h.z = b.z + Math.sin(w.a) * w.r;
        w.h.y = b.y + w.y + Math.sin(t * 2 + w.a) * 0.35;
      }
    }
  }
}
