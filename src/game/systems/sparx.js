// Sparx: the dragonfly companion and Spyro's health meter, as in the original. His colour shows how many hits Spyro can take: GOLD (full: three) -> BLUE (two) ->
// GREEN (one) -> gone (none: the next hit is lights out). Butterflies from defeated Snuffers and scorched bunnies bring him back one colour at a time; the rare blue one (every tenth bunny) brings him all the way back to gold. While he is with
// Spyro he grabs the gems that are close (see systems/gems.js: no Sparx, no gem pull: gems have to be touched). He is a 3D model (models/creatures/sparx.js), not a sprite.
import { makeModel } from '../models/fallback.js';
import { SPARX_BODY } from '../models/creatures/sparx.js';

/** how bright his glow is by health: the gold one shines, the others only a little */
const GLOW = { 3: 0.5, 2: 0.2, 1: 0.16 };
const DUST = [[1, 0.35, 0.3], [0.4, 1, 0.45], [1, 0.9, 0.35], [0.45, 0.6, 1]];       // the sparkle dust he leaves when he is not gold: red, green, yellow, blue
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const lerp = (a, b, t) => a + (b - a) * t;

export class Sparx {
  constructor(game) {
    this.game = game;
    this.max = 3;
    this.hp = 3;                                           // the game begins with him at full health: gold
    const p = game.player;
    this.x = this.px = p.x; this.y = this.py = p.y + 2; this.z = this.pz = p.z;
    this.vx = this.vy = this.vz = 0;
    this.yaw = p.yaw; this.turn = 0;
    this.model = makeModel(game.assets, 'sparx', { hp: this.hp });
    game.dyn.add(this.model.root);
    this.halo = game.fx.billboard({ pool: 'add', sprite: 'glow', size: 0.85, color: SPARX_BODY[3], alpha: GLOW[3] });      // (sized to the model: half of what it was when he was twice as big)
    this.t = Math.random() * 10;
    this.trail = 0;
    this.vis = 1;                                          // 1 = with Spyro, 0 = gone (he shrinks away and pops back when he is healed)
    this.hurtT = 0; this.eatT = 0; this.grabT = 0;
    this.dart = null;                                      // { x, y, z, t }: a gem he is reaching for
  }

  get color() { return SPARX_BODY[Math.max(1, this.hp)]; }

  /** A butterfly: one hit back (gone -> green -> blue -> gold). Returns true if he took it. */
  heal() {
    if (this.hp >= this.max) return false;
    this.hp++;
    this.eatT = 1;
    const c = this.color;
    this.game.fx.gemPickup(this.x, this.y, this.z, c);
    return true;
  }

  /** The rare blue butterfly: ALL the way back to full health (gold) at once, from any colour and from gone. Returns true if he took it (false when he was full already). */
  healAll() {
    if (this.hp >= this.max) return false;
    this.hp = this.max;
    this.eatT = 1;
    this.grabT = 1;                                        // (a happy flick as well)
    const fx = this.game.fx;
    fx.gemPickup(this.x, this.y, this.z, SPARX_BODY[3]);
    for (let i = 0; i < 18; i++) {                         // a ring of gold and blue sparkles
      const a = (i / 18) * Math.PI * 2, c = i % 2 ? SPARX_BODY[3] : [0.4, 0.75, 1];
      fx.spawn({ pool: 'add', sprite: 'spark', x: this.x, y: this.y, z: this.z, vx: Math.cos(a) * 3.2, vy: 0.6 + Math.random() * 1.2, vz: Math.sin(a) * 3.2, gravity: -2, life: 0.8, size: [0.5, 0.06], c0: [...c, 1], c1: [...c, 0] });
    }
    return true;
  }

  /** Called when Spyro is hurt: returns true if Sparx absorbed it (false = Spyro dies). */
  absorbHit() {
    if (this.hp <= 0) return false;
    this.hp--;
    this.hurtT = 1;
    const c = SPARX_BODY[this.hp + 1];                     // (the colour he just lost)
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * 6.28;
      this.game.fx.spawn({ pool: 'add', sprite: 'spark', x: this.x, y: this.y, z: this.z, vx: Math.cos(a) * 4, vy: Math.random() * 4, vz: Math.sin(a) * 4, gravity: -6, life: 0.7, size: [0.6, 0.1], c0: [...c, 1], c1: [...c, 0] });
    }
    this.game.audio?.sfx('sparx_lost');
    return true;
  }

  /** The hero was put somewhere else at once (the TRAVEL menu): Sparx is at his shoulder already, not flying across the world after him with his trail of sparks. */
  snapTo(p) {
    this.x = this.px = p.x; this.y = this.py = p.y + 2; this.z = this.pz = p.z;
    this.vx = this.vy = this.vz = 0;
    this.yaw = p.yaw; this.turn = 0;
    this.dart = null;
  }

  /** Back to full health (a new life starts with gold Sparx). */
  reset(hp = 3) {
    this.hp = hp;
    this.vis = hp > 0 ? 1 : 0;
    this.hurtT = this.eatT = this.grabT = 0;
    this.dart = null;
  }

  /** He has just grabbed a gem (the gem field calls this when it starts pulling one in): a flick towards it, and a twinkle. */
  grab(it) {
    this.grabT = 1;
    if (it) this.dart = { x: it.x, y: it.y, z: it.z, t: 0.3 };
    this.game.fx.spawn({ pool: 'add', sprite: 'spark_small', x: this.x, y: this.y, z: this.z, vy: 0.6, life: 0.35, size: [0.3, 0.03], c0: [...this.color, 0.9], c1: [...this.color, 0] });
  }

  update(dt, game) {
    const p = game.player;
    this.t += dt;
    this.hurtT = Math.max(0, this.hurtT - dt * 2.2);
    this.eatT = Math.max(0, this.eatT - dt * 2.4);
    this.grabT = Math.max(0, this.grabT - dt * 3.2);
    if (this.dart) { this.dart.t -= dt; if (this.dart.t <= 0) this.dart = null; }
    this.px = this.x; this.py = this.y; this.pz = this.z;
    // orbit around the shoulder, drifting with speed
    const sp = p.speed;
    const r = 1.5 + Math.min(sp * 0.03, 0.5);
    const a = this.t * 2.1;
    let tx = p.x - p.dirx * (0.5 + sp * 0.03) + Math.cos(a) * r * 0.9;
    let tz = p.z - p.dirz * (0.5 + sp * 0.03) + Math.sin(a * 1.2) * r * 0.9;
    let ty = p.y + 1.9 + Math.sin(this.t * 3.1) * 0.35 + Math.sin(a * 0.7) * 0.25;
    if (this.dart) { const k = 0.8 * (this.dart.t / 0.3); tx = lerp(tx, this.dart.x, k); ty = lerp(ty, this.dart.y + 0.3, k); tz = lerp(tz, this.dart.z, k); }
    const k = 1 - Math.exp(-6.5 * dt);
    this.x += (tx - this.x) * k; this.y += (ty - this.y) * k; this.z += (tz - this.z) * k;
    this.vx = (this.x - this.px) / dt; this.vy = (this.y - this.py) / dt; this.vz = (this.z - this.pz) / dt;
    // he faces the way he is flying, and the way Spyro faces when he hovers
    const hs = Math.hypot(this.vx, this.vz);
    const want = hs > 1.2 ? Math.atan2(this.vx, this.vz) : p.yaw;
    const d = wrap(want - this.yaw), step = d * (1 - Math.exp(-7 * dt));
    this.yaw += step;
    this.turn = lerp(this.turn, Math.max(-1, Math.min(1, step / dt / 5)), 0.2);
    // with Sparx gone there is nothing to see (and nothing to pull the gems in)
    const show = this.hp > 0 && !p.dead ? 1 : 0;
    this.vis += (show - this.vis) * (1 - Math.exp(-(show ? 12 : 9) * dt));
    // a sparkle trail: in his colour, and a little multi-coloured dust once he is not gold
    this.trail -= dt;
    if (this.trail <= 0 && this.hp > 0 && !p.dead) {
      this.trail = 0.09;
      const c = this.hp < 3 && Math.random() < 0.35 ? DUST[(Math.random() * DUST.length) | 0] : this.color;
      game.fx.spawn({ pool: 'add', sprite: 'glow_small', x: this.x, y: this.y - 0.05, z: this.z, vy: -0.2, life: 0.55, size: [0.3, 0.03], c0: [...c, 0.55], c1: [...c, 0] });
    }
  }

  frame(dt, alpha) {
    const m = this.model;
    m.root.position.set(lerp(this.px, this.x, alpha), lerp(this.py, this.y, alpha), lerp(this.pz, this.z, alpha));
    m.root.rotation.y = this.yaw;
    m.update(dt, { t: this.t, speed: Math.hypot(this.vx, this.vy, this.vz), vy: this.vy, turn: this.turn, hp: this.hp || 1, hurt: this.hurtT, eat: 1 - this.eatT, grab: this.grabT, vis: this.vis });
    const h = this.halo;
    h.x = m.root.position.x; h.y = m.root.position.y; h.z = m.root.position.z;
    h.color = this.color;
    h.alpha = (GLOW[Math.max(1, this.hp)] + Math.sin(this.t * 6) * 0.08 * (this.hp === 3 ? 1 : 0.4)) * this.vis;
    h.visible = this.vis > 0.02;
  }
}
