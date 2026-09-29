// Sparx: the dragonfly companion. He is the health meter — his colour shows how many hits Spyro can take
// (blue 3 / green 2 / yellow 1 / gone 0), and he vacuums up nearby gems.
const HP_COLORS = { 3: [0.42, 0.62, 1.0], 2: [0.45, 1.0, 0.5], 1: [1.0, 0.92, 0.35] };

export class Sparx {
  constructor(game) {
    this.game = game;
    this.hp = 2;
    this.max = 3;
    this.x = game.player.x; this.y = game.player.y + 2; this.z = game.player.z;
    this.body = game.fx.billboard({ pool: 'cut', sprite: 'sparx_0', size: 0.62, color: HP_COLORS[2] });
    this.halo = game.fx.billboard({ pool: 'add', sprite: 'glow', size: 1.5, color: HP_COLORS[2], alpha: 0.5 });
    this.t = Math.random() * 10;
    this.gone = 0;
    this.trail = 0;
  }

  get color() { return HP_COLORS[Math.max(1, this.hp)]; }

  heal() {
    if (this.hp >= this.max) { this.game.stats.gems += 0; return false; }
    this.hp++;
    this.gone = 0;
    this.body.visible = this.halo.visible = true;
    const c = this.color;
    this.game.fx.gemPickup(this.x, this.y, this.z, c);
    return true;
  }

  /** Called when Spyro is hurt: returns true if Sparx absorbed it (false = Spyro dies). */
  absorbHit() {
    if (this.hp <= 0) return false;
    this.hp--;
    const c = HP_COLORS[this.hp + 1] || HP_COLORS[1];
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * 6.28;
      this.game.fx.spawn({ pool: 'add', sprite: 'spark', x: this.x, y: this.y, z: this.z, vx: Math.cos(a) * 4, vy: Math.random() * 4, vz: Math.sin(a) * 4, gravity: -6, life: 0.7, size: [0.6, 0.1], c0: [...c, 1], c1: [...c, 0] });
    }
    this.game.audio?.sfx('sparx_lost');
    return true;
  }

  reset(hp = 2) { this.hp = hp; this.body.visible = this.halo.visible = hp > 0; }

  update(dt, game) {
    const p = game.player;
    this.t += dt;
    const c = this.hp > 0 ? this.color : [0.6, 0.6, 0.6];
    this.body.color = c; this.halo.color = c;
    this.body.visible = this.halo.visible = this.hp > 0 && !p.dead;
    // orbit around the shoulder, drifting with speed
    const sp = p.speed;
    const r = 1.5 + Math.min(sp * 0.03, 0.5);
    const a = this.t * 2.1;
    const tx = p.x - p.dirx * (0.5 + sp * 0.03) + Math.cos(a) * r * 0.9;
    const tz = p.z - p.dirz * (0.5 + sp * 0.03) + Math.sin(a * 1.2) * r * 0.9;
    const ty = p.y + 1.9 + Math.sin(this.t * 3.1) * 0.35 + Math.sin(a * 0.7) * 0.25;
    const k = 1 - Math.exp(-6.5 * dt);
    this.x += (tx - this.x) * k; this.y += (ty - this.y) * k; this.z += (tz - this.z) * k;
    this.body.x = this.halo.x = this.x; this.body.y = this.halo.y = this.y; this.body.z = this.halo.z = this.z;
    this.trail -= dt;
    if (this.trail <= 0 && this.hp > 0) {
      this.trail = 0.09;
      game.fx.spawn({ pool: 'add', sprite: 'glow_small', x: this.x, y: this.y - 0.05, z: this.z, vy: -0.2, life: 0.55, size: [0.5, 0.05], c0: [...c, 0.55], c1: [...c, 0] });
    }
  }

  frame() {
    const flap = ((this.t * 11) | 0) % 2;
    this.game.fx.setSprite(this.body, flap ? 'sparx_1' : 'sparx_0');
    this.halo.alpha = 0.42 + Math.sin(this.t * 6) * 0.1;
  }
}
