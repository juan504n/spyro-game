// What the foes of foes/ look and sound like when they act: the rings on the floor that say where a ball will fall, a mole's ground cracking, the lane a hog will run, a Smokecaller's smoke, a keg's fuse
// and blast, the sounds. The brains (foes/*.js) say WHAT happens as events; this says how it shows. The EnemySystem calls `on(e, type, data)` for every event a brain says and `frame(e, dt)` once a
// frame for what a state shows on the floor. Nothing here changes what happens.

const AMBER = [1.0, 0.62, 0.15], RED = [1.0, 0.16, 0.1], VIOLET = [0.72, 0.42, 1.0], SOOT = [0.2, 0.14, 0.3], DIRT = [0.45, 0.32, 0.2], ICE = [0.6, 0.85, 1.0];
const RING_K = 0.875;                                  // the 'ring' sprite's ring lies at 14 of 16 pixels from its centre: a decal's half-size is the radius over this
const seen = new Set();                                // the kinds whose lesson the HUD has said this time the game is open (a kind teaches once)

const rnd = (a, b) => a + (b - a) * Math.random();

export class FoeFx {
  constructor(game) { this.game = game; this.queue = []; }

  /** a mark on the floor: a dark stain, a bright ring, and a second ring that says "now" */
  _mark() {
    const fx = this.game.fx;
    return {
      pad: fx.decal({ pool: 'half', sprite: 'shadow_blob', r: 2, color: [0.5, 0.04, 0.08], alpha: 0, lift: 0.1 }),
      ring: fx.decal({ pool: 'add', sprite: 'ring', r: 2, color: AMBER, alpha: 0, lift: 0.12 }),
      ring2: fx.decal({ pool: 'add', sprite: 'ring', r: 2, color: RED, alpha: 0, lift: 0.13 }),
    };
  }

  _place(m, x, z, r, a, hot) {
    for (const d of [m.pad, m.ring, m.ring2]) { d.x = x; d.z = z; d.r = r / RING_K; }
    m.pad.r = r * 1.15; m.pad.alpha = 0.55 * a;
    m.ring.alpha = (0.45 + 0.4 * a) * (hot ? 0.5 : 1);
    m.ring2.alpha = hot ? 0.95 : 0;
  }

  _hide(m) { m.pad.alpha = 0; m.ring.alpha = 0; m.ring2.alpha = 0; }

  /** the foe's own handles (made with it) */
  make(e) {
    const fx = this.game.fx, v = (e.vis = {});
    switch (e.K.brain) {
      case 'sling':
        v.slots = [0, 1].map(() => ({ mark: this._mark(), core: fx.billboard({ pool: 'cut', sprite: 'shadow_blob', size: 0.9, color: SOOT, alpha: 0 }), halo: fx.billboard({ pool: 'add', sprite: 'glow', size: 1.7, color: VIOLET, alpha: 0 }), ball: null }));
        break;
      case 'charge':
        v.lane = Array.from({ length: 6 }, () => fx.decal({ pool: 'add', sprite: 'ring', r: 1, color: AMBER, alpha: 0, lift: 0.12 }));
        break;
      case 'burrow':
        v.mark = this._mark();
        break;
      case 'swoop':
        v.mark = this._mark();
        break;
      case 'call':
        v.mark = this._mark();
        v.mark.ring.color = VIOLET; v.mark.pad.color = [0.18, 0.05, 0.3];
        break;
      case 'fuse':
        v.glow = fx.billboard({ pool: 'add', sprite: 'glow', size: 1.4, color: [1, 0.55, 0.15], alpha: 0 });
        break;
      case 'orbit':                                                    // the lane a Shiverling will dash along (four rings, 2 m apart)
        v.lane = Array.from({ length: 4 }, () => fx.decal({ pool: 'add', sprite: 'ring', r: 1, color: ICE, alpha: 0, lift: 0.12 }));
        break;
      case 'brute':                                                    // the ring of heat its slam will fill
        v.mark = this._mark();
        v.mark.ring.color = AMBER;
        break;
      case 'gust':                                                     // the cone of streaks on the ground: six rings, growing with the distance
        v.cone = Array.from({ length: 6 }, () => fx.decal({ pool: 'add', sprite: 'ring', r: 1, color: ICE, alpha: 0, lift: 0.12 }));
        break;
      case 'drift':                                                    // the ring of static it will send out
        v.mark = this._mark();
        v.mark.ring.color = [0.55, 0.95, 1.0]; v.mark.pad.color = [0.05, 0.25, 0.35];
        break;
      default: break;
    }
  }

  dispose(e) {
    const v = e.vis;
    if (!v) return;
    const kill = (h) => { if (h) h.dead = true; };
    const killMark = (m) => { if (m) { kill(m.pad); kill(m.ring); kill(m.ring2); } };
    if (v.slots) for (const s of v.slots) { killMark(s.mark); kill(s.core); kill(s.halo); }
    if (v.lane) v.lane.forEach(kill);
    if (v.cone) v.cone.forEach(kill);
    killMark(v.mark); kill(v.glow);
    e.vis = null;
  }

  /** What a foe's state shows on the floor and in the air this frame. */
  frame(e, dt) {
    const v = e.vis, g = this.game;
    if (!v) return;
    switch (e.K.brain) {
      case 'sling': {
        for (const s of v.slots) { if (s.ball && !e.balls.includes(s.ball)) s.ball = null; }
        for (const b of e.balls) if (!v.slots.some((s) => s.ball === b)) { const s = v.slots.find((q) => !q.ball); if (s) s.ball = b; }
        for (const s of v.slots) {
          const b = s.ball;
          if (!b) { this._hide(s.mark); s.core.alpha = 0; s.halo.alpha = 0; continue; }
          const k = Math.min(1, b.t / b.T);
          s.core.x = b.x; s.core.y = b.y; s.core.z = b.z; s.core.alpha = 1;
          s.halo.x = b.x; s.halo.y = b.y; s.halo.z = b.z; s.halo.alpha = 0.7;
          this._place(s.mark, b.tx, b.tz, 1.7, Math.min(1, 0.3 + k * 1.2), b.locked);
          if (Math.random() < dt * 20) g.fx.spawn({ pool: 'add', sprite: 'spark_small', x: b.x, y: b.y, z: b.z, vy: 0.4, life: 0.3, size: [0.3, 0.05], c0: [0.8, 0.5, 1, 0.9], c1: [0.6, 0.3, 1, 0] });
        }
        break;
      }
      case 'charge': {
        const show = e.state === 'paw' ? Math.min(1, e.st / 0.4) : 0;
        const locked = e.state === 'paw' && e.locked;
        const dx = Math.sin(e.yaw), dz = Math.cos(e.yaw);
        v.lane.forEach((d, i) => {
          const dd = 2.5 + i * 2.6;
          d.x = e.x + dx * dd; d.z = e.z + dz * dd; d.r = (0.8 + i * 0.05) / RING_K;
          d.alpha = show * (locked ? 0.95 : 0.4) * (1 - i * 0.08);
          d.color = locked ? RED : AMBER;
        });
        if (e.state === 'paw' && Math.random() < dt * 14) g.fx.dust(e.x + dx * 0.9 + rnd(-0.4, 0.4), e.y + 0.1, e.z + dz * 0.9 + rnd(-0.4, 0.4), 1, 0.4);
        if (e.state === 'rush' && Math.random() < dt * 40) g.fx.dust(e.x - dx * 0.8 + rnd(-0.5, 0.5), e.y + 0.1, e.z - dz * 0.8 + rnd(-0.5, 0.5), 1, 0.5);
        break;
      }
      case 'burrow': {
        if (e.state === 'crack') {
          const k = Math.min(1, e.st / 0.8);
          this._place(v.mark, e.x, e.z, 1.8, 0.4 + 0.6 * k, k > 0.7);
          if (Math.random() < dt * 24) g.fx.dust(e.x + rnd(-1.4, 1.4), e.y + 0.1, e.z + rnd(-1.4, 1.4), 1, 0.4);
        } else this._hide(v.mark);
        if (e.under > 0.5 && e.speedNow > 0 && Math.random() < dt * 16) g.fx.dust(e.x + rnd(-0.3, 0.3), e.y + 0.15, e.z + rnd(-0.3, 0.3), 1, 0.3);
        break;
      }
      case 'swoop': {
        if (e.state === 'rear' || e.state === 'dive') {
          const k = e.state === 'dive' ? 1 : Math.min(1, e.st / 0.7);
          this._place(v.mark, e.aimX, e.aimZ, 1.5, 0.3 + 0.7 * k, e.locked || e.state === 'dive');
        } else this._hide(v.mark);
        break;
      }
      case 'call': {
        if (e.state === 'cast') {
          const k = Math.min(1, e.st / 1.2);
          this._place(v.mark, e.sx, e.sz, 1.3, 0.3 + 0.7 * k, false);
          v.mark.ring2.alpha = 0;
          if (Math.random() < dt * 30) g.fx.spawn({ pool: 'half', frames: ['smoke_0', 'smoke_1'], overLife: true, x: e.sx + rnd(-0.5, 0.5), y: e.y + 0.2, z: e.sz + rnd(-0.5, 0.5), vy: rnd(1.2, 2.2), life: rnd(0.8, 1.3), size: [0.8, 2.2], c0: [0.4, 0.2, 0.7, 0.9], c1: [0.3, 0.15, 0.5, 0] });
        } else this._hide(v.mark);
        break;
      }
      case 'fuse': {
        const lit = e.state === 'light' || e.state === 'run';
        v.glow.x = e.x; v.glow.y = e.y + 1.1; v.glow.z = e.z;
        v.glow.alpha = lit ? 0.6 + 0.4 * Math.sin(e.t * 30) * Math.sin(e.t * 17) : 0;
        v.glow.size = 1.0 + 0.8 * (lit ? 1 - Math.max(0, e.fuseT) / 3 : 0);
        if (lit && Math.random() < dt * 40) g.fx.spawn({ pool: 'add', sprite: 'spark_small', x: e.x + rnd(-0.1, 0.1), y: e.y + 1.25, z: e.z + rnd(-0.1, 0.1), vx: rnd(-1.5, 1.5), vy: rnd(1.5, 3.5), vz: rnd(-1.5, 1.5), gravity: -6, life: rnd(0.2, 0.45), size: [0.3, 0.05], c0: [1, 0.8, 0.3, 1], c1: [1, 0.4, 0.1, 0] });
        break;
      }
      case 'orbit': {
        const show = e.state === 'shiver' ? Math.min(1, e.st / 0.3) : e.state === 'dash' ? 1 : 0;
        const dx = Math.sin(e.yaw), dz = Math.cos(e.yaw);
        v.lane.forEach((d, i) => {
          const dd = 2.2 + i * 2.2;
          d.x = e.x + dx * dd; d.z = e.z + dz * dd; d.r = (0.7 + i * 0.04) / RING_K;
          d.alpha = show * 0.75 * (1 - i * 0.12);
        });
        if (e.state === 'dash' && Math.random() < dt * 50) g.fx.sparkle(e.x + rnd(-0.3, 0.3), e.y + 0.5, e.z + rnd(-0.3, 0.3), [0.7, 0.92, 1], 0.4);
        if (e.state === 'orbit' && Math.random() < dt * 14) g.fx.sparkle(e.x + rnd(-0.3, 0.3), e.y + 0.2, e.z + rnd(-0.3, 0.3), [0.8, 0.95, 1], 0.3);
        break;
      }
      case 'brute': {
        if (e.state === 'raise') {
          const k = Math.min(1, e.st / 1.0);
          this._place(v.mark, e.x, e.z, 4.6 * (0.35 + 0.65 * k), 0.3 + 0.7 * k, k > 0.8);
        } else this._hide(v.mark);
        if (e.state === 'vent') {
          if (!e.ventSnd) { e.ventSnd = true; g.audio?.sfx('foe_vent', { vol: 0.9 }); }
          if (!(e.shutT > 0) && Math.random() < dt * 22) g.fx.spawn({ pool: 'half', frames: ['smoke_0', 'smoke_1'], overLife: true, x: e.x + Math.sin(e.yaw) * 0.8 + rnd(-0.3, 0.3), y: e.y + 2.0, z: e.z + Math.cos(e.yaw) * 0.8 + rnd(-0.3, 0.3), vy: rnd(1.5, 2.8), life: rnd(0.7, 1.2), size: [0.6, 1.8], c0: [1, 0.6, 0.25, 0.85], c1: [0.4, 0.35, 0.35, 0] });
        } else e.ventSnd = false;
        break;
      }
      case 'gust': {
        const on = e.state === 'gather';
        const dx = Math.sin(e.aimYaw || 0), dz = Math.cos(e.aimYaw || 0), k = on ? Math.min(1, e.st / 1.0) : 0;
        v.cone.forEach((d, i) => {
          const along = 2.5 + i * 2.4;
          d.x = e.x + dx * along; d.z = e.z + dz * along; d.r = Math.max(1.2, along * Math.tan(0.38)) / RING_K * 0.8;
          d.alpha = on ? (0.3 + 0.5 * k) * (e.locked ? 1.2 : 1) * (1 - i * 0.1) : 0;
          d.color = e.locked ? RED : ICE;
        });
        if (on && Math.random() < dt * 40) g.fx.spawn({ pool: 'add', sprite: 'spark_small', x: e.x + rnd(-1, 1), y: e.y + rnd(-0.4, 0.8), z: e.z + rnd(-1, 1), vx: -dx * rnd(2, 6) + 0, vy: 0, vz: -dz * rnd(2, 6), life: 0.4, size: [0.3, 0.05], c0: [0.85, 0.97, 1, 0.9], c1: [0.85, 0.97, 1, 0] });
        if (e.state === 'kite' && Math.random() < dt * 12) g.fx.sparkle(e.x + rnd(-0.5, 0.5), e.y + rnd(-0.6, 0.6), e.z + rnd(-0.5, 0.5), [0.85, 0.97, 1], 0.35);
        break;
      }
      case 'drift': {
        if (e.state === 'glow') {
          const k = Math.min(1, e.st / 0.9);
          this._place(v.mark, e.x, e.z, 4.4, 0.25 + 0.75 * k, k > 0.7);
        } else this._hide(v.mark);
        break;
      }
      case 'flee':
        if (e.state !== 'idle' && Math.random() < dt * 8) g.fx.sparkle(e.x + rnd(-0.3, 0.3), e.y + 1.0, e.z + rnd(-0.3, 0.3), [1, 0.85, 0.4], 0.45);
        break;
      default: break;
    }
  }

  /** What a kind teaches, the first time one has seen the hero (once a kind per time the game is open): it waits for the hint line to be free, a lesson never cuts another message off (`frameHints`). */
  hint(e) {
    const id = e.kind;
    if (!e.K.hint || seen.has(id) || this.queue.some((q) => q.id === id)) return;
    this.queue.push({ id, text: e.K.hint });
  }

  /** Once a frame: the next lesson is said when nothing else is on the hint line (a place's name and the gate opening, a zone's words). */
  frameHints() {
    if (!this.queue.length) return;
    const hud = this.game.hud;
    if (!hud || hud.hintState) return;
    const q = this.queue.shift();
    seen.add(q.id);
    hud.hint(q.text, 5.5);
  }

  /** Something a brain said. */
  on(e, type, d) {
    const g = this.game, fx = g.fx, sfx = (n, o) => g.audio?.sfx(n, o), id = e.kind;
    const K = e.K;
    switch (type) {
      case 'alert':
        sfx(K.brain === 'burrow' ? 'foe_rumble' : 'snuffer_alert', { vol: 0.8 });
        this.hint(e);
        break;
      case 'tell':
        switch (d.what) {
          case 'wind': sfx('foe_wind', { vol: 0.8 }); break;
          case 'paw': sfx('foe_paw', { vol: 0.9 }); fx.dust(e.x, e.y + 0.1, e.z, 4, 0.8); break;
          case 'crack': sfx('foe_crack', { vol: 0.9 }); break;
          case 'raise': sfx(K.brain === 'shell' ? 'foe_snap' : 'foe_raise', { vol: 0.8 }); break;
          case 'fuse': sfx('foe_fuse', { vol: 0.8 }); break;
          case 'rear': sfx('foe_screech', { vol: 0.8 }); break;
          case 'call': sfx('foe_call', { vol: 0.9 }); break;
          case 'jeer': sfx('foe_jeer', { vol: 0.8 }); break;
          case 'shiver': sfx('foe_shiver', { vol: 0.9 }); break;
          case 'gather': sfx('foe_gather', { vol: 0.9 }); break;
          case 'glow': sfx('foe_glow', { vol: 0.8 }); break;
          default: break;
        }
        break;
      case 'lob': sfx('foe_lob', { vol: 0.8 }); fx.puff(d.ball.x0, d.ball.y0, d.ball.z0, 0.5); break;
      case 'splat': {
        sfx('foe_splat', { vol: 0.9 });
        fx.landDust(d.x, d.y, d.z, 0.9);
        for (let i = 0; i < 9; i++) { const a = Math.random() * 6.28, s = rnd(2, 5); fx.spawn({ pool: 'add', sprite: 'spark_small', x: d.x, y: d.y + 0.3, z: d.z, vx: Math.cos(a) * s, vy: rnd(2, 5), vz: Math.sin(a) * s, gravity: -14, life: rnd(0.3, 0.6), size: [0.35, 0.08], c0: [0.7, 0.4, 1, 1], c1: [0.4, 0.2, 0.8, 0] }); }
        fx.smoke(d.x, d.y + 0.4, d.z, 0.9);
        break;
      }
      case 'lock': if (K.brain === 'charge') fx.glint(e.x + Math.sin(e.yaw) * 0.7, e.y + 0.9, e.z + Math.cos(e.yaw) * 0.7, 0.8); break;
      case 'rush': sfx(K.brain === 'shell' ? 'foe_snap' : 'foe_rush', { vol: 0.9 }); break;
      case 'bonk':
        sfx('foe_bonk', { vol: 1 });
        g.cam.shake(0.3, 0.25);
        fx.hitSpark(d.x, d.y + 1.0, d.z, 1.2);
        fx.shards(d.x, d.y + 0.8, d.z, [[0.6, 0.5, 0.4], [0.4, 0.35, 0.3]], 8);
        break;
      case 'burst':
        sfx('foe_burst', { vol: 1 });
        g.cam.shake(0.35, 0.3);
        fx.landDust(d.x, d.y, d.z, 1.6);
        fx.shards(d.x, d.y + 0.4, d.z, [DIRT, [0.35, 0.25, 0.16]], 12);
        break;
      case 'bash':
        if (K.brain === 'brute') {                                      // the slam: a ring runs out over the ground to the radius it hurts
          sfx('foe_slam', { vol: 1 });
          g.cam.shake(0.55, 0.4);
          fx.landDust(d.x, d.y, d.z, 2.4);
          fx.shards(d.x, d.y + 0.4, d.z, [[0.3, 0.26, 0.28], [0.9, 0.4, 0.1]], 12);
          this._flash(fx.decal({ pool: 'add', sprite: 'ring', x: d.x, z: d.z, r: 0.5, color: AMBER, alpha: 1, lift: 0.14 }), d.r / RING_K);
        } else { sfx('foe_bash', { vol: 0.9 }); fx.hitSpark(d.x, d.y + 1.2, d.z, 1.0); g.cam.shake(0.2, 0.2); }
        break;
      case 'gust': {                                                    // the blast: streaks of air along the cone, a roar
        sfx('foe_gust', { vol: 1 });
        const dx = Math.sin(d.yaw), dz = Math.cos(d.yaw);
        for (let i = 0; i < 14; i++) { const a = rnd(2, d.range), sp = rnd(-d.half, d.half) * a; fx.spawn({ pool: 'add', sprite: 'spark_small', x: d.x + dx * a + dz * sp, y: d.y + rnd(-1, 0.5), z: d.z + dz * a - dx * sp, vx: dx * rnd(10, 18), vy: 0, vz: dz * rnd(10, 18), life: rnd(0.25, 0.5), size: [0.5, 0.1], c0: [0.9, 0.98, 1, 0.9], c1: [0.9, 0.98, 1, 0] }); }
        break;
      }
      case 'pulse': {                                                   // the ring of static
        sfx('foe_pulse', { vol: 0.9 });
        fx.hitSpark(d.x, d.y + 0.5, d.z, 1.2);
        this._flash(fx.decal({ pool: 'add', sprite: 'ring', x: d.x, z: d.z, r: 0.5, color: [0.55, 0.95, 1.0], alpha: 1, lift: 0.14 }), d.r / RING_K);
        break;
      }
      case 'wound':
        for (let i = 0; i < 10; i++) fx.spawn({ pool: 'add', sprite: 'spark_small', x: e.x + Math.sin(e.yaw) * 0.9, y: e.y + e.K.cy + 0.5, z: e.z + Math.cos(e.yaw) * 0.9, vx: rnd(-4, 4), vy: rnd(1, 5), vz: rnd(-4, 4), gravity: -12, life: rnd(0.3, 0.6), size: [0.4, 0.08], c0: [1, 0.8, 0.3, 1], c1: [1, 0.3, 0.1, 0] });
        break;
      case 'boom': {
        sfx('foe_boom', { vol: 1 });
        g.cam.shake(0.55, 0.45);
        fx.puff(d.x, d.y + 0.8, d.z, 2.6);
        fx.landDust(d.x, d.y, d.z, 2.2);
        fx.hitSpark(d.x, d.y + 1, d.z, 2.2);
        for (let i = 0; i < 24; i++) { const a = Math.random() * 6.28, s = rnd(4, 11); fx.spawn({ pool: 'add', sprite: 'spark_small', x: d.x, y: d.y + 0.6, z: d.z, vx: Math.cos(a) * s, vy: rnd(2, 9), vz: Math.sin(a) * s, gravity: -16, life: rnd(0.4, 0.8), size: [0.5, 0.1], c0: [1, 0.8, 0.3, 1], c1: [1, 0.3, 0.1, 0] }); }
        const ring = fx.decal({ pool: 'add', sprite: 'ring', x: d.x, z: d.z, r: 0.5, color: AMBER, alpha: 1, lift: 0.14 });
        this._flash(ring, d.r / RING_K);
        break;
      }
      case 'dive': sfx('foe_dive', { vol: 0.8 }); break;
      case 'land': fx.landDust(d.x, d.y, d.z, 0.8); sfx('foe_flap', { vol: 0.7 }); break;
      case 'summon': sfx('foe_puff', { vol: 0.8 }); fx.puff(d.x, e.y + 0.8, d.z, 1.6); fx.smoke(d.x, e.y + 0.6, d.z, 1.4); break;
      case 'melt': sfx('foe_ice', { vol: 0.8 }); fx.hitSpark(e.x, e.y + 1.2, e.z, 0.8); for (let i = 0; i < 6; i++) fx.spawn({ pool: 'add', sprite: 'spark_small', x: e.x, y: e.y + 1.2, z: e.z, vx: rnd(-3, 3), vy: rnd(1, 4), vz: rnd(-3, 3), gravity: -9, life: rnd(0.3, 0.6), size: [0.35, 0.08], c0: [...ICE, 1], c1: [...ICE, 0] }); break;
      case 'shatter': sfx('foe_ice', { vol: 1, pitch: 0.8 }); fx.shards(e.x, e.y + 1.2, e.z, [ICE, [0.8, 0.95, 1]], 12); break;
      case 'regrow': sfx('foe_ice', { vol: 0.5, pitch: 1.3 }); break;
      default: break;
    }
  }

  /** a decal that grows to `r` and fades (a blast ring) */
  _flash(d, r) { (this._flashes ||= []).push({ d, r, start: this.game.time || 0 }); }

  /** the blast rings that are growing (called once a frame by the system) */
  frameFlashes() {
    if (!this._flashes || !this._flashes.length) return;
    const now = this.game.time || 0;
    for (let i = this._flashes.length - 1; i >= 0; i--) {
      const f = this._flashes[i], t = (now - f.start) / 0.35;
      if (t >= 1 || f.d.dead) { f.d.dead = true; this._flashes.splice(i, 1); continue; }
      f.d.r = f.r * (0.2 + 0.8 * t); f.d.alpha = 1 - t;
    }
  }
}

