// World objects the player interacts with: vases, chests, cracked walls, the brazier puzzle + portcullis, the Dawn Gate
// barrier, bounce mushrooms, windmill sails and bobbing sky islands.
import * as THREE from 'three';
import { makeModel } from '../models/fallback.js';

const rotY = (o, y) => { o.root.rotation.y = y; };

export class ObjectSystem {
  /**
   * @param {object} d level definitions:
   *   vases: [{x,y,z,variant,gems:[]}], chests: [{x,y,z,yaw,gems:[]}], walls: [{x,y,z,yaw,w,h,gems:[]}],
   *   braziers: [{x,y,z}], portcullis: {x,y,z,yaw}, barrier: {x,y,z,yaw}, mushrooms: [{x,y,z,size}],
   *   sails: {x,y,z,yaw}, islands: [{group, colliders, baseY, amp, speed, phase}]
   */
  constructor(game, d) {
    this.game = game;
    const g = game;
    const col = g.collision;
    this.vases = (d.vases || []).map((v) => this._vase(v));
    this.chests = (d.chests || []).map((c) => this._chest(c));
    this.walls = (d.walls || []).map((w) => this._wall(w));
    this.braziers = (d.braziers || []).map((b) => this._brazier(b));
    this.mushrooms = (d.mushrooms || []).map((m) => this._mushroom(m));
    this.islands = d.islands || [];
    this.time = 0;

    this.portcullis = null;
    if (d.portcullis) {
      const p = makeModel(g.assets, 'portcullis', { frame: 'none', w: 2.2, h: 3.6 });   // the mill tower draws its own timber gate frame
      p.root.position.set(d.portcullis.x, d.portcullis.y, d.portcullis.z);
      rotY(p, d.portcullis.yaw || 0);
      g.dyn.add(p.root);
      const c = col.add({ type: 'box', x: d.portcullis.x, z: d.portcullis.z, hx: 1.25, hz: 0.6, rot: d.portcullis.yaw || 0, y0: d.portcullis.y, y1: d.portcullis.y + 4, top: false, tag: 'gate' });
      this.portcullis = { model: p, open: 0, target: 0, c };
    }
    this.barrier = null;
    if (d.barrier) {
      const b = makeModel(g.assets, 'barrier');
      b.root.position.set(d.barrier.x, d.barrier.y, d.barrier.z);
      rotY(b, d.barrier.yaw || 0);
      g.dyn.add(b.root);
      const c = col.add({ type: 'box', x: d.barrier.x, z: d.barrier.z, hx: 3.4, hz: 0.9, rot: d.barrier.yaw || 0, y0: d.barrier.y - 2, y1: d.barrier.y + 14, top: false, tag: 'barrier' });
      this.barrier = { model: b, open: 0, target: 0, c, x: d.barrier.x, z: d.barrier.z };
    }
    this.sails = null;
    if (d.sails) {
      const s = makeModel(g.assets, 'windmill_sails');
      s.root.position.set(d.sails.x, d.sails.y, d.sails.z);
      rotY(s, d.sails.yaw || 0);
      g.dyn.add(s.root);
      this.sails = { model: s, angle: 0 };
    }
    this.brazierGroupLit = false;
  }

  // ---- constructors -----------------------------------------------------------------------------------------------
  _vase(v) {
    const g = this.game;
    const model = makeModel(g.assets, 'vase', { variant: v.variant || 0 });
    model.root.position.set(v.x, v.y, v.z);
    g.dyn.add(model.root);
    const c = g.collision.add({ type: 'cyl', x: v.x, z: v.z, r: 0.55, y0: v.y, y1: v.y + 1.1, top: false, tag: 'vase' });
    return { ...v, model, c, broken: false, wob: 0 };
  }

  _chest(ch) {
    const g = this.game;
    const model = makeModel(g.assets, 'chest');
    model.root.position.set(ch.x, ch.y, ch.z);
    rotY(model, ch.yaw || 0);
    g.dyn.add(model.root);
    const c = g.collision.add({ type: 'box', x: ch.x, z: ch.z, hx: 1.0, hz: 0.65, rot: ch.yaw || 0, y0: ch.y, y1: ch.y + 0.9, top: false, tag: 'chest' });
    return { ...ch, model, c, open: 0, opened: false };
  }

  _wall(w) {
    const g = this.game;
    const model = makeModel(g.assets, 'cracked_wall', { w: w.w, h: w.h });
    model.root.position.set(w.x, w.y, w.z);
    rotY(model, w.yaw || 0);
    g.dyn.add(model.root);
    const c = g.collision.add({ type: 'box', x: w.x, z: w.z, hx: w.w / 2, hz: 0.6, rot: w.yaw || 0, y0: w.y, y1: w.y + w.h, top: false, tag: 'wall' });
    const rec = { ...w, model, c, broken: false };
    c.onCharge = () => { this._breakWall(rec); return true; };
    return rec;
  }

  _brazier(b) {
    const g = this.game;
    const model = makeModel(g.assets, 'brazier');
    model.root.position.set(b.x, b.y, b.z);
    g.dyn.add(model.root);
    g.collision.add({ type: 'cyl', x: b.x, z: b.z, r: 0.75, y0: b.y, y1: b.y + 1.4, top: false, tag: 'brazier' });
    const pool = g.fx.decal({ pool: 'add', sprite: 'glow', x: b.x, z: b.z, r: 5, color: [1, 0.7, 0.3], alpha: 0 });
    pool.y = b.y + 0.08;
    return { ...b, model, lit: false, l: 0, pool };
  }

  _mushroom(m) {
    const g = this.game;
    const size = m.size || 1;
    const model = makeModel(g.assets, 'bounce_mushroom', { size });
    model.root.position.set(m.x, m.y, m.z);
    g.dyn.add(model.root);
    const top = m.y + 1.3 * size;
    g.collision.add({ type: 'cyl', x: m.x, z: m.z, r: 0.7 * size, y0: m.y, y1: top, top: false, tag: 'stem' });
    const cap = g.collision.add({ type: 'cyl', x: m.x, z: m.z, r: 2.3 * size, y0: top - 0.5, y1: top, top: true, tag: 'bounce' });
    return { ...m, size, model, cap, top, squash: 0, cool: 0 };
  }

  // ---- behaviours ---------------------------------------------------------------------------------------------------
  _hitBy(p, x, y, z, r) {
    if (p.flameT > 0 && p.flameHits(x, y, z, r)) return 'flame';
    if (p.chargeT > 0 && p.chargeHits(x, y, z, r)) return 'charge';
    return null;
  }

  _breakVase(v) {
    const g = this.game;
    v.broken = true; v.c.solid = false; v.model.root.visible = false;
    g.fx.shards(v.x, v.y + 0.6, v.z, v.model.shardColors || [[0.8, 0.4, 0.25]], 12);
    g.audio?.sfx('vase_break', { vol: 0.9 });
    g.gems.burst(v.x, v.y + 0.8, v.z, v.gems && v.gems.length ? v.gems : [1], 0.8);
    g.stats.vases++;
  }

  _openChest(c) {
    const g = this.game;
    c.opened = true;
    g.audio?.sfx('chest_open', { vol: 0.9 });
    g.gems.burst(c.x, c.y + 1.0, c.z, c.gems && c.gems.length ? c.gems : [10], 1.1);
    g.fx.gemPickup(c.x, c.y + 1.0, c.z, [1, 0.85, 0.3]);
    g.stats.chests++;
  }

  _breakWall(w) {
    const g = this.game;
    if (w.broken) return;
    w.broken = true; w.c.solid = false; w.model.root.visible = false;
    g.fx.shards(w.x, w.y + w.h * 0.4, w.z, w.model.shardColors || [[0.6, 0.55, 0.6]], 24);
    g.fx.puff(w.x, w.y + w.h * 0.4, w.z, 2.2);
    g.audio?.sfx('vase_break', { vol: 1, pitch: 0.6 });
    g.cam.shake(0.4, 0.35);
    if (w.gems && w.gems.length) g.gems.burst(w.x, w.y + 1.4, w.z, w.gems, 1);
    g.stats.walls++;
  }

  _lightBrazier(b) {
    const g = this.game;
    b.lit = true;
    g.audio?.sfx('brazier_light', { vol: 0.9 });
    g.fx.ignite(b.x, b.y + 1.5, b.z, false);
    g.hud?.banner?.('BRAZIER LIT', `${this.braziers.filter((x) => x.lit).length}/${this.braziers.length}`);
    if (this.braziers.every((x) => x.lit)) {
      this.portcullis && (this.portcullis.target = 1);
      g.audio?.sfx('gate_creak', { vol: 1 });
      g.cam.shake(0.3, 0.8);
      g.emit('braziers-done');
      g.hud?.say?.('MILLGATE', 'THE PORTCULLIS RISES!');
    }
  }

  openBarrier() {
    if (!this.barrier || this.barrier.target === 1) return;
    this.barrier.target = 1;
    this.game.audio?.sfx('barrier_open', { vol: 1 });
    this.game.cam.shake(0.5, 1.2);
  }

  update(dt, game) {
    const p = game.player;
    this.time += dt;
    for (const v of this.vases) {
      if (v.broken) continue;
      if (Math.hypot(p.x - v.x, p.z - v.z) > 8) continue;
      if (this._hitBy(p, v.x, v.y + 0.6, v.z, 0.6)) this._breakVase(v);
    }
    for (const c of this.chests) {
      if (!c.opened && Math.hypot(p.x - c.x, p.z - c.z) < 6 && this._hitBy(p, c.x, c.y + 0.5, c.z, 1.1)) this._openChest(c);
    }
    for (const w of this.walls) {
      // fire scorches but only rams break walls (handled in the collider's onCharge)
      void w;
    }
    for (const b of this.braziers) {
      if (!b.lit && p.flameT > 0 && Math.hypot(p.x - b.x, p.z - b.z) < 9 && p.flameHits(b.x, b.y + 0.9, b.z, 0.9)) this._lightBrazier(b);
    }
    for (const m of this.mushrooms) {
      m.cool = Math.max(0, m.cool - dt);
      if (m.cool <= 0 && p.grounded && p.groundC === m.cap) {
        p.bounce(game.input.down('jump') ? 32 : 27);
        m.squash = 1; m.cool = 0.25;
        game.audio?.sfx('bounce', { vol: 0.9 });
        game.fx.landDust(m.x, m.top, m.z, 0.8);
      }
    }
    if (this.portcullis) {
      const pc = this.portcullis;
      pc.open += (pc.target - pc.open) * Math.min(1, dt * 1.6);
      if (pc.open > 0.55) pc.c.solid = false;
    }
    if (this.barrier) {
      const b = this.barrier;
      b.open += (b.target - b.open) * Math.min(1, dt * 0.9);
      if (b.open > 0.55) b.c.solid = false;
    }
    if (this.sails) this.sails.angle += dt * 0.55;
    for (const isl of this.islands) {
      const y = isl.baseY + Math.sin(this.time * isl.speed + isl.phase) * isl.amp;
      const vy = Math.cos(this.time * isl.speed + isl.phase) * isl.amp * isl.speed;
      const dy = y - isl.y;
      isl.y = y;
      isl.group.position.y = y - isl.baseY;
      for (const c of isl.colliders) { c.y0 += dy; c.y1 += dy; c.vy = vy; }
    }
  }

  frame(dt, alpha, game) {
    const t = game.time;
    for (const v of this.vases) if (!v.broken) v.model.update?.(dt, { t });
    for (const c of this.chests) {
      if (c.opened) c.open = Math.min(1, c.open + dt * 2.2);
      c.model.setOpen?.(c.open);
      c.model.update?.(dt, { t });
    }
    for (const b of this.braziers) {
      if (b.lit) {
        b.l = Math.min(1, b.l + dt * 2);
        game.fx.torchFlame(b.x, b.y + 1.45, b.z, true, 0.85);
      }
      b.model.setLit?.(b.l);
      b.model.update?.(dt, { t });
      b.pool.alpha = 0.7 * b.l * (0.9 + Math.sin(t * 11 + b.x) * 0.07) * (1 - 0.5 * game.day);
    }
    for (const m of this.mushrooms) {
      m.squash = Math.max(0, m.squash - dt * 2.6);
      m.model.update?.(dt, { squash: m.squash, t });
    }
    if (this.portcullis) {
      // (the grate only moves inside the model's own update(): setOpen just sets its target, so without this call the bars
      // stayed on the door for good while the collider opened underneath them)
      this.portcullis.model.setOpen?.(this.portcullis.open);
      this.portcullis.model.update?.(dt, { t });
    }
    if (this.barrier) {
      this.barrier.model.setOpen?.(this.barrier.open);
      this.barrier.model.update?.(dt, { t });
    }
    if (this.sails) this.sails.model.update?.(dt, { angle: this.sails.angle });
  }
}

export { THREE };
