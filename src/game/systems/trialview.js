// What the trials of trials/ look and sound like in the world: their props (models/objects/trial.js), the lights they show, the sounds they make. The machines say WHAT happens as events; this says how it shows.
// Nothing here changes what happens. One view for each kind of trial (makeView), and the seal that stands over the lantern of a trial that is not solved (SealView).
import { makeModel } from '../models/fallback.js';
import { toWorld, cellWorld, trace, MIRRORS, solidsOf } from '../trials/index.js';

const VIOLET = [0.72, 0.5, 1.0], GOLD = [1.0, 0.82, 0.42];
const NOTES = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];                       // the bells: a major pentatonic over the bell's own pitch, a note each (a tune never has two of the same in a row)
const RING_K = 0.875;                                                   // the 'ring' sprite's ring lies at 14 of 16 pixels from its centre: a decal's half-size is the radius over this
const BEAM_N = 6;                                                       // glows to a square of the mirrors' floor
const rnd = (a, b) => a + (b - a) * Math.random();

/** the textures and the glow of a realm's trials: what the layout wrote in `look`, else the stone and the violet of the Vale */
const lookOf = (spec) => ({ stone: 'cobble', crystal: 'crystal_violet', metal: 'metal_brass', glow: VIOLET, ...(spec.look || {}) });

class View {
  constructor(sys, r) {
    this.sys = sys; this.g = sys.game; this.r = r; this.t = r.t; this.items = []; this.look = lookOf(r.spec);
    this.mark = null;
  }

  ground(x, z) { return this.g.collision.heightAt(x, z); }
  sfx(name, o) { this.g.audio?.sfx(name, o); }

  /** a prop of the trial (a model of models/objects/trial.js) standing on the floor at (x, z), or at height y */
  prop(name, x, z, y, opts = {}) {
    const m = makeModel(this.g.assets, name, { look: this.look, ...opts });
    m.root.position.set(x, y ?? this.ground(x, z), z);
    this.g.dyn.add(m.root);
    this.items.push(m);
    return m;
  }

  /** something solid that stands in the way of the hero and the foes (a bell on its post, a mirror) */
  solid(x, z, y, r, h) {
    const c = this.g.collision.add({ type: 'cyl', x, z, r, y0: y - 0.3, y1: y + h, top: false, tag: 'trial', src: `trial ${this.t.id}` });
    (this.solids || (this.solids = [])).push(c);
    return c;
  }

  /** a ring on the floor that says where the trial is (a rune ring of the realm's glow, lit while he is in it) */
  floorMark(r, alpha = 0.35) {
    const fx = this.g.fx;
    this.mark = { d: fx.decal({ pool: 'add', sprite: 'ring', x: this.t.x, z: this.t.z, r: r / RING_K, color: this.look.glow, alpha, lift: 0.1 }), a: alpha, k: 0 };
  }

  burst(x, y, z, color = this.look.glow, n = 8) {
    const fx = this.g.fx;
    fx.hitSpark(x, y, z, 0.9);
    for (let i = 0; i < n; i++) fx.sparkle(x + rnd(-0.5, 0.5), y + rnd(-0.2, 0.6), z + rnd(-0.5, 0.5), color, rnd(0.4, 0.8));
  }

  frame(dt) {
    for (const m of this.items) m.update?.(dt, { t: this.g.time });
    if (this.mark) {
      const solved = this.t.state === 'solved', active = this.t.state === 'active';
      this.mark.k += ((solved ? 0 : active ? 1 : 0.55) - this.mark.k) * Math.min(1, dt * 4);
      this.mark.d.alpha = this.mark.a * this.mark.k * (0.75 + 0.25 * Math.sin(this.g.time * 2.4));
    }
  }
  on() {}
  solved() {}
  restore() { this.solved(true); }
  dispose() {
    for (const m of this.items) m.dispose?.();
    this.items.length = 0;
    if (this.mark) this.mark.d.dead = true;
    for (const c of this.solids || []) this.g.collision.remove(c);
  }
}

// ---- the bells -----------------------------------------------------------------------------------------------------------------------------------------
class BellsView extends View {
  constructor(sys, r) {
    super(sys, r);
    const t = this.t;
    this.bells = t.bells.map((b, i) => {
      const y = b.y ?? this.ground(b.x, b.z), m = this.prop('trial_bell', b.x, b.z, y, { seed: i });
      m.root.rotation.y = Math.atan2(t.x - b.x, t.z - b.z);
      return m;
    });
    solidsOf(t).forEach((q, i) => this.solid(q.x, q.z, t.bells[i].y ?? this.ground(q.x, q.z), q.r, q.h));
    this.glow = t.bells.map(() => 0);
    this.floorMark(3.2);
  }

  frame(dt) {
    const t = this.t;
    this.bells.forEach((m, i) => {
      const want = (t.lit === i ? 1 : 0) + (t.phase === 'play' && t.state !== 'solved' ? 0.14 + 0.06 * Math.sin(this.g.time * 4 + i) : 0);
      m.setLit(want);
    });
    super.frame(dt);
  }

  on(type, d) {
    const b = d.i !== undefined ? this.t.bells[d.i] : null;
    switch (type) {
      case 'note':
        this.bells[d.i].kick();
        this.sfx('trial_bell', { vol: d.ok ? 1 : 0.85, pitch: NOTES[d.i % NOTES.length] });
        if (d.ok) this.burst(b.x, (b.y ?? this.ground(b.x, b.z)) + 1.5, b.z, GOLD, 5);
        break;
      case 'miss':
        this.bells[d.i].kick();
        this.sfx('trial_clunk', { vol: 0.9 });
        this.g.fx.puff(b.x, (b.y ?? this.ground(b.x, b.z)) + 1.2, b.z, 0.7);
        break;
      case 'turn': if (d.listen) this.sfx('trial_tune', { vol: 0.7 }); else this.sfx('trial_turn', { vol: 0.6 }); break;
      case 'fail': this.sfx('trial_fail', { vol: 0.7 }); break;
      default: break;
    }
  }

  solved() { this.bells.forEach((m) => m.setLit(1)); }
}

// ---- the plates ----------------------------------------------------------------------------------------------------------------------------------------
class PlatesView extends View {
  constructor(sys, r) {
    super(sys, r);
    this.plates = this.t.plates.map((b, i) => this.prop('trial_plate', b.x, b.z, b.y ?? this.ground(b.x, b.z), { seed: i }));
    this.floorMark(2.6);
  }

  frame(dt) {
    const t = this.t;
    this.plates.forEach((m, i) => m.setLit(t.on[i] ? 1 : 0));
    super.frame(dt);
  }

  on(type, d) {
    if (type !== 'press') return;
    const b = this.t.plates[d.i];
    this.plates[d.i].press();
    this.sfx('trial_plate', { vol: 0.9, pitch: d.on[d.i] ? 1.25 : 0.85 });
    this.g.fx.spawn({ pool: 'add', sprite: 'ring', x: b.x, y: (b.y ?? this.ground(b.x, b.z)) + 0.2, z: b.z, life: 0.5, size: [1.2, 4], c0: [...(d.on[d.i] ? GOLD : this.look.glow), 0.9], c1: [...this.look.glow, 0] });
  }

  solved() { this.plates.forEach((m) => m.setLit(1)); }
}

// ---- the circuit ---------------------------------------------------------------------------------------------------------------------------------------
class CircuitView extends View {
  constructor(sys, r) {
    super(sys, r);
    this.pylons = this.t.pylons.map((b, i) => this.prop('trial_pylon', b.x, b.z, b.y ?? this.ground(b.x, b.z), { seed: i }));
    this.beams = this.t.pylons.map((b) => {
      const y = b.y ?? this.ground(b.x, b.z), m = makeModel(this.g.assets, 'light_beam', { height: 16, radius: 0.9 });
      m.root.position.set(b.x, y + 8, b.z);
      m.setColor?.(this.look.glow); m.setIntensity?.(0);
      this.g.dyn.add(m.root); this.items.push(m);
      return m;
    });
    this.k = this.t.pylons.map(() => 0);
    this.lastTick = -1;
  }

  frame(dt) {
    const t = this.t, done = t.state === 'solved';
    this.pylons.forEach((m, i) => {
      const next = !done && i === t.next, after = !done && i === t.next + 1 && t.running, was = done || i < t.next;
      m.setState(was ? 'done' : next ? 'next' : 'off');
      const want = next ? 0.85 : after ? 0.18 : was && !done ? 0.12 : 0;
      this.k[i] += (want - this.k[i]) * Math.min(1, dt * 8);
      this.beams[i].setIntensity?.(this.k[i]);
      this.beams[i].setColor?.(was ? GOLD : this.look.glow);
    });
    // the last five seconds tick
    if (t.running && t.state !== 'solved') {
      const left = t.time - t.clock;
      if (left < 5.01 && Math.floor(left) !== this.lastTick) { this.lastTick = Math.floor(left); this.sfx('trial_tick', { vol: 0.5, pitch: 1.0 + (5 - left) * 0.05 }); }
    } else this.lastTick = -1;
    super.frame(dt);
  }

  on(type, d) {
    switch (type) {
      case 'start': this.sfx('trial_start', { vol: 0.8 }); break;
      case 'pylon': {
        const b = this.t.pylons[d.i], y = (b.y ?? this.ground(b.x, b.z)) + 4.3;
        this.pylons[d.i].touch();
        this.sfx('trial_pylon', { vol: 0.9, pitch: 1 + d.i * 0.09 });
        this.burst(b.x, y, b.z, GOLD, 8);
        break;
      }
      case 'fail': this.sfx('trial_fail', { vol: 0.9 }); this.g.hud.hint('OUT OF TIME  -  BEGIN AGAIN AT THE FIRST PYLON', 3.2); break;
      default: break;
    }
  }

  solved() { this.pylons.forEach((m) => m.setState('done')); }
}

// ---- the wisps -----------------------------------------------------------------------------------------------------------------------------------------
class WispsView extends View {
  constructor(sys, r) {
    super(sys, r);
    this.vents = this.t.vents.map((b, i) => this.prop('trial_vent', b.x, b.z, b.y ?? this.ground(b.x, b.z), { seed: i }));
    const fx = this.g.fx;
    this.pool = Array.from({ length: 10 }, () => ({ halo: fx.billboard({ pool: 'add', sprite: 'glow', size: 1.6, color: this.look.glow, alpha: 0 }), core: fx.billboard({ pool: 'add', sprite: 'spark', size: 0.8, color: [1, 1, 1], alpha: 0 }) }));
    this.floorMark(4.2);
  }

  frame(dt) {
    const t = this.t, live = t.state === 'active' ? t.live : [];
    this.vents.forEach((m) => m.setActive(t.state === 'active' ? 1 : 0));
    this.pool.forEach((q, i) => {
      const w = live[i];
      if (!w) { q.halo.alpha = 0; q.core.alpha = 0; return; }
      const k = w.dead ? Math.min(1, w.age / 0.6) : 0;
      const hit = w.dead === 'hit';
      q.halo.x = q.core.x = w.x; q.halo.y = q.core.y = w.y; q.halo.z = q.core.z = w.z;
      q.halo.size = hit ? 1.6 + 2.4 * k : 1.6; q.halo.alpha = (hit ? 0.9 * (1 - k) : w.dead ? 0.5 * (1 - k) : 0.75 + 0.2 * Math.sin(this.g.time * 9 + i));
      q.halo.color = hit ? GOLD : this.look.glow;
      q.core.size = hit ? 0.8 + 1.2 * k : 0.8; q.core.alpha = hit ? 1 - k : w.dead ? 0.4 * (1 - k) : 0.9; q.core.rot = this.g.time * 3 + i;
      if (!w.dead && Math.random() < dt * 14) this.g.fx.gemTrail(w.x, w.y - 0.1, w.z, this.look.glow);
    });
    super.frame(dt);
  }

  on(type, d) {
    switch (type) {
      case 'start': this.sfx('trial_start', { vol: 0.7 }); break;
      case 'spawn': { const b = this.t.vents[d.vent]; this.sfx('trial_wisp', { vol: 0.45, pitch: rnd(0.9, 1.15) }); this.g.fx.puff(b.x, (b.y ?? this.ground(b.x, b.z)) + 0.5, b.z, 0.5); break; }
      case 'hit': this.sfx('trial_pop', { vol: 0.9, pitch: rnd(0.95, 1.2) }); this.burst(d.x, d.y, d.z, GOLD, 6); break;
      case 'miss': this.sfx('trial_sigh', { vol: 0.5 }); break;
      case 'fail': this.sfx('trial_fail', { vol: 0.8 }); this.g.hud.hint('TOO MANY GOT AWAY  -  THE VENTS BEGIN AGAIN', 3.2); break;
      default: break;
    }
  }

  solved() { this.vents.forEach((m) => m.setActive(0)); for (const q of this.pool) { q.halo.alpha = 0; q.core.alpha = 0; } }
  dispose() { for (const q of this.pool) { q.halo.dead = true; q.core.dead = true; } super.dispose(); }
}

// ---- the puck ------------------------------------------------------------------------------------------------------------------------------------------
class PuckView extends View {
  constructor(sys, r) {
    super(sys, r);
    const t = this.t, y = t.y;
    this.court = this.prop('trial_court', t.x, t.z, y, { hw: t.hw, hl: t.hl, goalHW: t.goalHW });
    this.court.root.rotation.y = t.yaw;
    const [gx, gz] = toWorld(t, 0, t.hl);
    this.goal = this.prop('trial_goal', gx, gz, y, { hw: t.goalHW });
    this.goal.root.rotation.y = t.yaw;
    this.goalie = this.prop('trial_goalie', gx, gz, y);
    this.puck = this.prop('trial_puck', t.x, t.z, y + 0.05);
    this.sync();
  }

  sync() {
    const t = this.t, y = t.y;
    const [px, pz] = toWorld(t, t.px, t.pz);
    this.puck.root.position.set(px, y + 0.05, pz);
    this.puck.spinBy(Math.hypot(t.vx, t.vz) * 0.02);
    const [gx, gz] = toWorld(t, t.gx, t.hl - 1.5);
    this.goalie.root.position.set(gx, y, gz);
    this.goalie.root.rotation.y = t.yaw + Math.PI;                                                                 // (its eye is on its +z face: turned to look down the court)
  }

  frame(dt) {
    this.court.setLit(this.t.state === 'active' ? 1 : this.t.state === 'solved' ? 0 : 0.4);
    this.puck.setLit(Math.min(1, 0.5 + Math.hypot(this.t.vx, this.t.vz) * 0.05));
    this.sync();
    super.frame(dt);
  }

  on(type, d) {
    switch (type) {
      case 'kick': this.sfx('trial_kick', { vol: 1, pitch: rnd(0.95, 1.1) }); this.g.fx.hitSpark(d.x, this.t.y + 0.7, d.z, 1.0); break;
      case 'bounce': this.sfx('trial_tick', { vol: 0.45, pitch: rnd(0.8, 1.0) }); break;
      case 'save': this.sfx('trial_save', { vol: 0.9 }); break;
      case 'goal': {
        this.sfx('trial_goal', { vol: 1 });
        this.goal.flash(1);
        const [gx, gz] = toWorld(this.t, 0, this.t.hl);
        this.burst(gx, this.t.y + 1.8, gz, GOLD, 14);
        this.g.hud.hint(d.score >= this.t.want ? 'THE LAST GOAL!' : `GOAL!  ${d.score} OF ${this.t.want}`, 2);
        break;
      }
      case 'serve': { const [sx, sz] = toWorld(this.t, 0, -this.t.hl * 0.2); this.sfx('trial_tick', { vol: 0.4, pitch: 0.6 }); this.g.fx.puff(sx, this.t.y + 0.4, sz, 0.5); break; }
      default: break;
    }
  }

  solved() { this.court.setLit(0); }
}

// ---- the mirrors ---------------------------------------------------------------------------------------------------------------------------------------
class MirrorsView extends View {
  constructor(sys, r) {
    super(sys, r);
    const t = this.t, y = t.y;
    this.lamp = this.mk('lamp', t.source.i, t.source.j, [[1, 0], [0, 1], [-1, 0], [0, -1]][t.source.d]);
    this.recv = this.mk('receiver', t.receiver.i, t.receiver.j, null);
    this.mirrors = t.mirrors.map((q, k) => {
      const [wx, wz] = cellWorld(t, q.i, q.j);
      const m = this.prop('trial_mirror', wx, wz, y, { slope: q.s, seed: k });
      m.root.rotation.y = t.yaw;
      return m;
    });
    for (const q of solidsOf(t)) this.solid(q.x, q.z, y, q.r, q.h);
    this.rebuild();
    this.floorMark(Math.max(t.w, t.h) * MIRRORS.cell * 0.5 + 1.5, 0.25);
  }

  mk(role, i, j, dir) {
    const t = this.t, [wx, wz] = cellWorld(t, i, j);
    const m = this.prop('trial_lens', wx, wz, t.y, { role });
    // the lamp faces the way the beam goes (in the floor's own frame: +lx east, +lz north); the receiver is turned to face the lamp
    const h = dir ? Math.atan2(dir[0], dir[1]) : Math.PI;
    m.root.rotation.y = t.yaw + h;
    return m;
  }

  /** the beam: the squares it goes through, one bright quad of light from the middle of one to the middle of the next, up to where it ends */
  rebuild() {
    const t = this.t, tr = (t.beam = trace(t)), pts = tr.cells.map(([i, j]) => cellWorld(t, i, j));
    if (!tr.hit) { const [ei, ej] = tr.end; pts.push(cellWorld(t, ei, ej)); }                                   // (it runs out of the floor: one square further, into the air)
    this.path = pts;
    this.hit = tr.hit;
    if (!this.beamHandles) {
      const fx = this.g.fx;
      this.beamHandles = Array.from({ length: (MIRRORS.maxSteps + 2) * BEAM_N }, () => fx.billboard({ pool: 'add', sprite: 'glow', size: 1.4, color: this.look.glow, alpha: 0 }));
    }
    // a string of glows along the path, six to a square (a billboard each: cheap and reads from every side)
    const out = [];
    for (let s = 0; s + 1 < pts.length; s++) for (let k = 0; k < BEAM_N; k++) { const u = k / BEAM_N; out.push([pts[s][0] + (pts[s + 1][0] - pts[s][0]) * u, pts[s][1] + (pts[s + 1][1] - pts[s][1]) * u]); }
    out.push(pts[pts.length - 1]);
    this.beamPts = out.slice(0, this.beamHandles.length);
  }

  frame(dt) {
    const t = this.t, fx = this.g.fx, hit = t.beam && t.beam.hit;
    this.beamHandles.forEach((h, n) => {
      const p = this.beamPts[n];
      if (!p) { h.alpha = 0; return; }
      h.x = p[0]; h.z = p[1]; h.y = t.y + 1.15;
      h.color = hit ? GOLD : this.look.glow;
      h.size = 1.5 + 0.25 * Math.sin(this.g.time * 6 + n * 0.7);
      h.alpha = 0.55;
    });
    this.lamp.setLit(1);
    this.recv.setLit(hit ? 1 : 0);
    // a mirror the beam passes through shines
    const cells = new Set(((t.beam && t.beam.cells) || []).map(([i, j]) => i * 100 + j));
    this.mirrors.forEach((m, k) => { m.setLit(cells.has(t.mirrors[k].i * 100 + t.mirrors[k].j) ? 1 : 0); m.setSlope(t.mirrors[k].s); });
    if (Math.random() < dt * 8 && this.beamPts.length) { const p = this.beamPts[(Math.random() * this.beamPts.length) | 0]; fx.sparkle(p[0], t.y + 1.2, p[1], hit ? GOLD : this.look.glow, 0.5); }
    super.frame(dt);
  }

  on(type, d) {
    if (type !== 'turn_mirror') return;
    const q = this.t.mirrors[d.i], [wx, wz] = cellWorld(this.t, q.i, q.j);
    this.sfx('trial_turn', { vol: 1 });
    this.g.fx.puff(wx, this.t.y + 1.0, wz, 0.7);
    this.rebuild();
    if (d.hit) this.sfx('trial_beam', { vol: 0.9 });
  }

  solved() { this.recv.setLit(1); }
  dispose() { for (const h of this.beamHandles || []) h.dead = true; super.dispose(); }
}

// ---- the thief -----------------------------------------------------------------------------------------------------------------------------------------
class ThiefView extends View {
  constructor(sys, r) {
    super(sys, r);
    const fx = this.g.fx;
    this.halo = fx.billboard({ pool: 'add', sprite: 'glow', size: 2.4, color: GOLD, alpha: 0 });
    this.core = fx.billboard({ pool: 'add', sprite: 'lens_star', size: 1.2, color: GOLD, alpha: 0 });
  }

  frame(dt) {
    const e = this.t.foe, live = this.t.state === 'active' && e && e.state !== 'dead';
    if (live) {
      this.halo.x = this.core.x = e.x; this.halo.z = this.core.z = e.z; this.halo.y = this.core.y = e.y + 1.5;
      this.halo.alpha = 0.55 + 0.25 * Math.sin(this.g.time * 8); this.core.alpha = 0.7; this.core.rot = this.g.time * 2;
      if (Math.random() < dt * 20) this.g.fx.gemTrail(e.x + rnd(-0.4, 0.4), e.y + rnd(0.4, 1.4), e.z + rnd(-0.4, 0.4), GOLD);
    } else { this.halo.alpha = 0; this.core.alpha = 0; }
    super.frame(dt);
  }

  on(type) {
    if (type === 'fail') this.g.hud.hint('IT SLIPPED AWAY  -  IT WILL BE BACK AT ITS PLACE', 3.5);
  }

  solved() { this.halo.alpha = 0; this.core.alpha = 0; }
  dispose() { this.halo.dead = true; this.core.dead = true; super.dispose(); }
}

// ---- the siege -----------------------------------------------------------------------------------------------------------------------------------------
class SiegeView extends View {
  constructor(sys, r) {
    super(sys, r);
    const t = this.t, R = t.r ?? 12, n = 10;
    this.R = R;
    this.stones = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + 0.3, x = t.x + Math.sin(a) * R, z = t.z + Math.cos(a) * R;
      return this.prop('trial_stone', x, z, undefined, { seed: i });
    });
    this.floorMark(R, 0.3);
  }

  frame(dt) {
    const t = this.t, want = t.state === 'active' ? 1 : t.state === 'solved' ? 0 : 0.25;
    this.stones.forEach((m) => m.setLit(want));
    super.frame(dt);
  }

  on(type, d) {
    switch (type) {
      case 'start': this.sfx('trial_horn', { vol: 0.9, pitch: 0.9 }); break;
      case 'wave': this.sfx('trial_horn', { vol: 0.8, pitch: 1 + d.k * 0.12 }); break;
      case 'fail': this.sfx('trial_fail', { vol: 0.8 }); this.g.hud.hint(d.why === 'down' ? 'THE WARD IS QUIET AGAIN  -  TRY ONCE MORE' : 'YOU LEFT THE RING  -  THE WAVES BEGIN AGAIN', 3.5); break;
      default: break;
    }
  }

  solved() { this.stones.forEach((m) => m.setLit(0)); }
}

// ---- the rings -----------------------------------------------------------------------------------------------------------------------------------------
class RingsView extends View {
  constructor(sys, r) {
    super(sys, r);
    const t = this.t, E = t.edgePt, fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
    this.rings = t.rings.map((c, i) => { const m = this.prop('trial_ring', c.x, c.z, c.y, { seed: i, r: t.r }); m.root.rotation.y = Math.atan2(c.nx, c.nz); return m; });
    // two stones at the lip, either side of the way, so that the place to leap from is seen from the ledge
    this.lip = [-1, 1].map((sd, i) => this.prop('trial_stone', E.x + fz * 3.6 * sd - fx * 0.4, E.z - fx * 3.6 * sd - fz * 0.4, undefined, { seed: i }));
    this.floorMark(t.padR ?? 3.6, 0.35);
    this.shown = this.rings.map(() => '');
    this.finished = false;
  }

  frame(dt) {
    const t = this.t, next = t.last + 1;
    this.rings.forEach((m, i) => {
      const s = this.finished ? 'done' : t.got[i] === 1 ? 'done' : t.got[i] === -1 ? 'missed' : i === next ? 'next' : 'off';
      if (this.shown[i] !== s) { this.shown[i] = s; m.setState(s); }
    });
    const lit = this.finished ? 0 : t.state === 'active' ? 1 : 0.35;
    this.lip.forEach((m) => m.setLit(lit));
    super.frame(dt);
  }

  on(type, d) {
    switch (type) {
      case 'ring': { const c = this.t.rings[d.i]; this.rings[d.i].pass(); this.sfx('trial_ring', { vol: 0.9, pitch: 1 + (d.n - 1) * 0.1 }); this.burst(c.x, c.y, c.z, GOLD, 10); break; }
      case 'fail': this.sfx('trial_fail', { vol: 0.8 }); this.g.hud.hint(d.n > 0 ? `THE RINGS GO DARK  -  ${d.n} OF ${this.t.want}: LEAP FROM THE LEDGE AGAIN` : 'THE RINGS GO DARK  -  LEAP FROM THE LEDGE AGAIN', 3.4); break;
      default: break;
    }
  }

  solved() { this.finished = true; this.rings.forEach((m, i) => { this.shown[i] = 'done'; m.setState('done'); }); this.lip.forEach((m) => m.setLit(0)); }
}

const VIEWS = { bells: BellsView, plates: PlatesView, circuit: CircuitView, wisps: WispsView, puck: PuckView, mirrors: MirrorsView, thief: ThiefView, siege: SiegeView, rings: RingsView };

/** The view of a trial record (`r.t` is its machine's record). */
export function makeView(sys, r) {
  const V = VIEWS[r.t.kind];
  if (!V) throw new Error(`no view for trial kind '${r.t.kind}'`);
  return new V(sys, r);
}

// ---- the seal ------------------------------------------------------------------------------------------------------------------------------------------
/** What stands over the lantern of a trial that is not solved: a ring of rune light on the floor and six sparks that circle it. When the trial is solved the seal breaks: a flash, a shower of shards. */
export class SealView {
  constructor(sys, r) {
    this.sys = sys; this.g = sys.game; this.r = r;
    const b = r.beacon, fx = this.g.fx, look = lookOf(r.spec);
    this.look = look; this.b = b; this.k = 1; this.broken = false;
    this.ring = fx.decal({ pool: 'add', sprite: 'ring', x: b.x, z: b.z, r: 3.7 / RING_K * b.scale, color: look.glow, alpha: 0, lift: 0.11 });
    this.ring.y = b.y + 0.1;
    this.ring2 = fx.decal({ pool: 'add', sprite: 'ring', x: b.x, z: b.z, r: 2.5 / RING_K * b.scale, color: look.glow, alpha: 0, lift: 0.12 });
    this.ring2.y = b.y + 0.12;
    this.sparks = Array.from({ length: 6 }, (_, i) => ({ h: fx.billboard({ pool: 'add', sprite: 'spark', size: 0.9, color: look.glow, alpha: 0 }), a: (i / 6) * Math.PI * 2, y: 1.2 + (i % 3) * 0.9 }));
    this.halo = fx.billboard({ pool: 'add', sprite: 'glow', size: 5 * b.scale, color: look.glow, alpha: 0 });
    this.halo.x = b.x; this.halo.z = b.z; this.halo.y = b.y + 3.2 * b.scale;
  }

  frame(dt) {
    const b = this.b, t = this.g.time;
    if (this.broken) { this.k = Math.max(0, this.k - dt * 1.6); }
    const k = this.k;
    this.ring.alpha = 0.7 * k * (0.7 + 0.3 * Math.sin(t * 2.2)); this.ring.rot = t * 0.15;
    this.ring2.alpha = 0.55 * k * (0.7 + 0.3 * Math.sin(t * 2.2 + 2)); this.ring2.rot = -t * 0.3;
    this.halo.alpha = 0.3 * k;
    this.sparks.forEach((s, i) => {
      const a = s.a + t * (0.9 + 0.15 * i), r = (2.4 + (i % 2) * 0.4) * b.scale;
      s.h.x = b.x + Math.cos(a) * r; s.h.z = b.z + Math.sin(a) * r; s.h.y = b.y + (s.y + Math.sin(t * 2 + i) * 0.3) * b.scale; s.h.rot = t * 2 + i;
      s.h.alpha = 0.85 * k;
    });
  }

  /** the seal breaks (the shards fly), or is gone at once (the lantern was lit another way / the realm is a saved one) */
  shatter(quiet) {
    this.broken = true;
    if (quiet) { this.k = 0; return; }
    const b = this.b, fx = this.g.fx, c = this.look.glow;
    fx.shards(b.x, b.y + 2.4 * b.scale, b.z, [c, [1, 1, 1], GOLD], 16);
    fx.spawn({ pool: 'add', sprite: 'ring', x: b.x, y: b.y + 0.5, z: b.z, life: 0.7, size: [2, 16 * b.scale], c0: [...c, 0.9], c1: [...c, 0] });
    fx.spawn({ pool: 'add', sprite: 'lens_star', x: b.x, y: b.y + 3 * b.scale, z: b.z, life: 0.6, size: [2, 8], c0: [1, 1, 1, 1], c1: [...c, 0] });
  }

  restore() { this.broken = true; this.k = 0; this.frame(0); }

  dispose() { this.ring.dead = true; this.ring2.dead = true; this.halo.dead = true; for (const s of this.sparks) s.h.dead = true; }
}
