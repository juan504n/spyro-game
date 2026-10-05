// The realm's villains. The Snuffers the game began with fight as they always have, on one melee state machine, and every one of them falls to a single hit of the attack that works on it:
//   basic — burns and rams equally well
//   bell  — armoured with a brass bell: fire bounces off, one ram does it
//   thorn — spiked: ramming hurts YOU, one breath of fire is the answer
//   rime  — in a shell of ice: flame melts it (it grows back), a ram only slides it; then it is a plain Snuffer
// The others (foes/: the Slinger, the Ramhog, the Dustmole, the Lidwarden, the Fusepup, the Dusk Moth, the Smokecaller, the Pilferling) have a brain of their own, a pure state machine that is
// stepped with the hero and says what happens as events (foes/index.js); what the hero's attacks do to each is the table of foes/ (hitsOn), and how it shows is systems/foefx.js.
import { makeModel } from '../models/fallback.js';
import { KINDS, kindOf, BRAINS, hitsOn, poseOf, stepFoe, explode } from '../foes/index.js';
import { FoeFx } from './foefx.js';

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class EnemySystem {
  /** spawns: [{ x, z, variant, patrol }] */
  constructor(game, spawns) {
    this.game = game;
    this.list = [];
    this.foefx = new FoeFx(game);
    this._cur = null;
    this.ctx = {                                              // (what a foe's brain is stepped with: foes/core.js)
      hero: { x: 0, y: 0, z: 0, r: 0.55, dead: false },
      rng: Math.random,
      floorAt: (x, z) => this.game.collision.heightAt(x, z),
      move: (e, vx, vz, dt) => this._step(e, vx, vz, dt),
      emit: (type, d) => this._on(type, d),
      dismiss: (m) => this.dismiss(m),
      alive: (m) => m.state !== 'dead',
    };
    for (const s of spawns) this.list.push(this._make(s));
  }

  /** A Snuffer comes into the world while it plays (the helpers the Guardian calls out of his floor, systems/boss.js; the Snuffers a Smokecaller calls): `s` as in the constructor; `s.wild` makes him chase from the first step and never go home. Returns it. */
  add(s) {
    const e = this._make(s);
    if (s.wild) { e.wild = true; if (!e.B) { e.state = 'alert'; e.st = 0.42; e.exclaimT = 0.9; } }
    this.list.push(e);
    return e;
  }

  _make(s) {
    const g = this.game;
    const id = KINDS[s.variant] ? s.variant : 'basic';
    const V = kindOf(id);
    const model = makeModel(g.assets, V.model, { variant: V.look });
    const y = s.y ?? g.collision.heightAt(s.x, s.z);
    model.root.position.set(s.x, y, s.z);
    g.dyn.add(model.root);
    const shadow = g.fx.decal({ pool: 'half', sprite: 'shadow_blob', r: 1.25, color: [0.3, 0.3, 0.4], alpha: 0.75 });
    const alertIcon = g.fx.billboard({ pool: 'cut', sprite: 'exclaim', size: 1.3 });
    alertIcon.visible = false;
    const e = {
      variant: id, kind: id, V, K: V, B: BRAINS[V.brain] || null, model, shadow, alertIcon, x: s.x, y, z: s.z, hx: s.x, hz: s.z, vx: 0, vz: 0, yaw: Math.random() * 6.28, r: V.r, h: V.h, cy: V.cy,
      hp: V.hp, state: 'idle', st: 0, patrolR: s.patrol ?? 5, tx: s.x, tz: s.z, flameCd: 0, chargeCd: 0, struck: false, attack: 0, hurt: 0, stun: 0, dead: 0, alert: 0, exclaimT: 0, t: Math.random() * 10, active: true, clangCd: 0, src: s.src,
    };
    if (V.shell) { e.shell = 1; e.melt = 0; e.regrow = 0; }
    if (e.B) { e.B.init(e); this.foefx.make(e); }
    return e;
  }

  /** The old Snuffers' step: out of props, never off a ledge, never into water. */
  _move(e, vx, vz, dt) {
    const col = this.game.collision;
    const ox = e.x, oz = e.z;
    e.x += vx * dt; e.z += vz * dt;
    // keep out of props
    col.pushOut(e, e.y, e.h, 0.55);
    const n = col.normalAt(e.x, e.z);
    const gh = col.heightAt(e.x, e.z);
    if (n[1] < 0.66 || gh < this.game.waterY - 0.5 || gh - e.y > 0.9) { e.x = ox; e.z = oz; return false; }
    const sup = col.support(e.x, e.z, e.y, 0.6);
    if (e.y - sup.y > 1.3) { e.x = ox; e.z = oz; return false; }   // never walk off a ledge
    e.y = sup.y;
    return true;
  }

  /**
   * A brain's step (foes/core.js): the same rules, and the answer is how much of the step it got along its way (0 to 1; the step is made only if it got at least half of it) with
   * `e.bump` saying whether it ran into something (a prop, a slope, water, a ledge): a Ramhog that bumps while it runs is stunned.
   */
  _step(e, vx, vz, dt) {
    const sp = Math.hypot(vx, vz);
    if (sp < 1e-9) return 1;
    const col = this.game.collision, ox = e.x, oz = e.z, oy = e.y;
    e.bump = false;
    e.x += vx * dt; e.z += vz * dt;
    if (col.pushOut(e, e.y, e.h, 0.55)) e.bump = true;
    const n = col.normalAt(e.x, e.z), gh = col.heightAt(e.x, e.z);
    let ok = !(n[1] < 0.66 || gh < this.game.waterY - 0.5 || gh - e.y > 0.9);
    if (ok) { const sup = col.support(e.x, e.z, e.y, 0.6); if (e.y - sup.y > 1.3) ok = false; else e.y = sup.y; }
    if (!ok) { e.x = ox; e.z = oz; e.y = oy; e.bump = true; return 0; }
    const f = ((e.x - ox) * vx + (e.z - oz) * vz) / (sp * sp * dt);
    if (f < 0.5) { e.x = ox; e.z = oz; e.y = oy; e.bump = true; return Math.max(0, f); }
    return Math.min(1.2, f);
  }

  damage(e, amount, fromX, fromZ, kind) {
    if (e.state === 'dead') return;
    const g = this.game;
    e.hp -= amount;
    e.hurt = 1; e.stun = kind === 'charge' ? 0.55 : 0.28;
    e.struck = false;
    let dx = e.x - fromX, dz = e.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    const kb = kind === 'charge' ? 11 : 3.5;
    e.vx = (dx / l) * kb; e.vz = (dz / l) * kb;
    g.fx.hitSpark(e.x, e.y + 1.1, e.z, kind === 'charge' ? 1.3 : 0.8);
    g.audio?.sfx('snuffer_hurt', { vol: 0.9 });
    if (kind === 'charge') g.cam.shake(0.25, 0.2);
    if (e.hp <= 0) { this.kill(e); return; }
    e.state = 'hurt'; e.st = e.stun;
  }

  /** A Snuffer that is simply gone (the Guardian's helpers when the lantern is lit, or the hero is set back; what a Smokecaller called, when it falls): a puff, no gems, no butterfly, not counted as beaten. */
  dismiss(e) {
    if (e.state === 'dead') return;
    e.state = 'dead'; e.dead = 0.45; e.st = 0; e.poofed = true;
    e.alertIcon.visible = false;
    this._gone(e);
    this.game.fx.puff(e.x, e.y + 1.0, e.z, 1.1);
  }

  kill(e) {
    const g = this.game;
    e.state = 'dead'; e.dead = 0; e.st = 0;
    e.alertIcon.visible = false;
    this._gone(e);
    g.audio?.sfx('snuffer_die', { vol: 1 });
    g.stats.enemies++;
    g.emit('enemy', e);
  }

  /** A foe that is down leaves nothing in the air: what it threw falls with it, what it called goes up in smoke, what it drew on the floor is wiped. */
  _gone(e) {
    if (e.balls) e.balls.length = 0;
    if (e.minions) { for (const m of e.minions) this.dismiss(m); e.minions.length = 0; }
    if (e.vis) this.foefx.dispose(e);
  }

  update(dt, game) {
    const p = game.player;
    const hero = this.ctx.hero;
    hero.x = p.x; hero.y = p.y; hero.z = p.z; hero.dead = p.dead;
    this.foefx.frameFlashes();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      const dxp = p.x - e.x, dzp = p.z - e.z;
      const dp = Math.hypot(dxp, dzp);
      // sleep far-away enemies
      e.active = dp < 110 || e.state === 'dead';
      e.model.root.visible = dp < 150;
      if (!e.active) continue;
      e.t += dt;
      e.flameCd = Math.max(0, e.flameCd - dt); e.chargeCd = Math.max(0, e.chargeCd - dt); e.clangCd = Math.max(0, e.clangCd - dt);
      e.hurt = Math.max(0, e.hurt - dt * 3); e.exclaimT = Math.max(0, e.exclaimT - dt);
      e.alertIcon.visible = e.exclaimT > 0;
      e.alertIcon.x = e.x; e.alertIcon.y = e.y + (e.K.h + 1) + Math.sin(e.t * 12) * 0.08; e.alertIcon.z = e.z;
      if (e.shell === 0) { e.regrow -= dt; if (e.regrow <= 0) { e.shell = 1; e.melt = 0; this.foefx.on(e, 'regrow', {}); } }      // (the ice grows back)

      if (e.state === 'dead') {
        e.dead += dt / 0.7;
        e.vx *= Math.exp(-4 * dt); e.vz *= Math.exp(-4 * dt);
        if (e.K.flies) e.y = Math.max(game.collision.heightAt(e.x, e.z), e.y - 8 * dt);                // (a Dusk Moth that is hit falls)
        if (e.dead >= 1) { this._remove(e, i); continue; }
        if (e.dead > 0.45 && !e.poofed) { e.poofed = true; game.fx.puff(e.x, e.y + 1.0, e.z, 1.2); this._drops(e); }
        e.model.root.position.y = e.y;
        e.model.update(dt, { dead: e.dead, t: e.t });
        continue;
      }

      if (e.B) { this._updateFoe(e, dt, game, p); continue; }

      // ---- hits from the player ------------------------------------------------------------------------------
      if (p.canAct || p.chargeT > 0 || p.flameT > 0) {
        if (p.flameT > 0 && e.flameCd <= 0 && p.flameHits(e.x, e.y + 1, e.z, e.r)) {
          e.flameCd = 0.3;
          if (e.shell > 0) this._melt(e);
          else if (e.V.flameDmg > 0) this.damage(e, e.V.flameDmg, p.x, p.z, 'flame');
          else if (e.clangCd <= 0) { e.clangCd = 0.4; game.audio?.sfx('armor_clang', { vol: 0.9 }); game.fx.hitSpark(e.x + Math.sin(p.yaw) * -0.6, e.y + 1.2, e.z + Math.cos(p.yaw) * -0.6, 0.7); }
        }
        if (p.chargeT > 0 && e.chargeCd <= 0 && p.chargeHits(e.x, e.y + 1, e.z, e.r)) {
          e.chargeCd = 0.5;
          if (e.shell > 0) {
            // the ice turns the ram away, and the Rimeling slides
            this._ring(e, p, 'ram');
            e.vx = Math.sin(p.yaw) * 9; e.vz = Math.cos(p.yaw) * 9; e.state = 'hurt'; e.st = 0.35; e.struck = false;
          } else if (e.V.spiked) {
            // ouch: ramming a thorn-back
            game.playerHurt(e.x, e.z);
            p.chargeT = 0; p.chargeCd = 0.5;
            game.fx.hitSpark(e.x, e.y + 1.2, e.z, 1.1);
            game.audio?.sfx('armor_clang', { vol: 0.8 });
          } else {
            this.damage(e, e.V.chargeDmg, p.x, p.z, 'charge');
            p.vx *= 0.35; p.vz *= 0.35;
            game.audio?.sfx('charge_hit', { vol: 1 });
            if (e.V.armored) game.audio?.sfx('armor_clang', { vol: 0.6 });         // (the bell rings as it goes)
          }
          if (e.state === 'dead') continue;
        }
      }

      // ---- behaviour -----------------------------------------------------------------------------------------
      let speedNow = 0;
      const canSee = dp < e.V.notice && !p.dead;
      switch (e.state) {
        case 'idle': {
          if (canSee) { e.state = 'alert'; e.st = 0.42; e.exclaimT = 0.9; game.audio?.sfx('snuffer_alert', { vol: 0.8 }); this.foefx.hint(e); break; }
          e.st -= dt;
          const d = Math.hypot(e.tx - e.x, e.tz - e.z);
          if (d < 0.6 || e.st <= -6) {
            const a = Math.random() * 6.28, r = Math.random() * e.patrolR;
            e.tx = e.hx + Math.cos(a) * r; e.tz = e.hz + Math.sin(a) * r; e.st = 2 + Math.random() * 3;
          }
          if (e.st > 0 && d > 0.6) {
            const sp = e.V.speed * 0.35;
            const dir = Math.atan2(e.tx - e.x, e.tz - e.z);
            e.yaw += wrap(dir - e.yaw) * Math.min(1, dt * 5);
            this._move(e, Math.sin(e.yaw) * sp, Math.cos(e.yaw) * sp, dt);
            speedNow = sp;
          }
          break;
        }
        case 'alert': {
          e.st -= dt; e.alert = Math.max(0, e.st / 0.42);
          e.yaw += wrap(Math.atan2(dxp, dzp) - e.yaw) * Math.min(1, dt * 10);
          if (e.st <= 0) { e.state = 'chase'; e.alert = 0; }
          break;
        }
        case 'chase': {
          const homeD = Math.hypot(e.x - e.hx, e.z - e.hz);
          if ((!e.wild && (dp > 32 || homeD > 40)) || p.dead) { e.state = 'return'; break; }
          e.yaw += wrap(Math.atan2(dxp, dzp) - e.yaw) * Math.min(1, dt * 7);
          const sp = e.V.speed;
          if (dp > e.V.reach * 0.85) { this._move(e, Math.sin(e.yaw) * sp, Math.cos(e.yaw) * sp, dt); speedNow = sp; }
          else { e.state = 'attack'; e.st = 0; e.struck = false; }
          break;
        }
        case 'attack': {
          e.st += dt;
          e.attack = e.st < 0.62 ? (e.st / 0.62) * 0.4 : e.st < 0.85 ? 0.4 + ((e.st - 0.62) / 0.23) * 0.2 : 0.6 + Math.min(1, (e.st - 0.85) / 0.5) * 0.4;
          if (e.st < 0.6) e.yaw += wrap(Math.atan2(dxp, dzp) - e.yaw) * Math.min(1, dt * 6);
          if (!e.struck && e.st >= 0.66) {
            e.struck = true;
            const fwd = dxp * Math.sin(e.yaw) + dzp * Math.cos(e.yaw);
            if (dp < e.V.reach + 0.5 && fwd > -0.2) game.playerHurt(e.x, e.z);
            game.audio?.sfx('snuffer_swing', { vol: 0.8 });
          }
          if (e.st >= 1.35) { e.state = 'chase'; e.attack = 0; }
          break;
        }
        case 'hurt': {
          e.st -= dt;
          e.vx *= Math.exp(-5 * dt); e.vz *= Math.exp(-5 * dt);
          this._move(e, e.vx, e.vz, dt);
          if (e.st <= 0) { e.state = canSee ? 'chase' : 'return'; }
          break;
        }
        case 'return': {
          const d = Math.hypot(e.hx - e.x, e.hz - e.z);
          if (canSee) { e.state = 'chase'; break; }
          if (d < 1.2) { e.state = 'idle'; e.st = 1; e.hp = e.V.hp; break; }
          const dir = Math.atan2(e.hx - e.x, e.hz - e.z);
          e.yaw += wrap(dir - e.yaw) * Math.min(1, dt * 6);
          this._move(e, Math.sin(e.yaw) * e.V.speed * 0.8, Math.cos(e.yaw) * e.V.speed * 0.8, dt);
          speedNow = e.V.speed * 0.8;
          break;
        }
        default: break;
      }
      // ---- render sync -----------------------------------------------------------------------------------------
      e.model.root.position.set(e.x, e.y, e.z);
      e.model.root.rotation.y = e.yaw;
      e.model.update(dt, { speed: speedNow, attack: e.state === 'attack' ? e.attack : 0, alert: e.alert, hurt: e.hurt, stun: e.state === 'hurt' ? Math.min(1, e.st * 2) : 0, dead: 0, t: e.t, shell: e.shell });
      e.model.flash?.(e.hurt * 0.8);
      e.shadow.x = e.x; e.shadow.z = e.z;
      e.shadow.visible = true;
    }
  }

  // ---- the foes with a brain ----------------------------------------------------------------------------------------
  _updateFoe(e, dt, game, p) {
    // what the hero's attacks do to it (foes/index.js hitsOn: the table is the design's)
    if (p.canAct || p.chargeT > 0 || p.flameT > 0) {
      for (const h of hitsOn(e, p)) { this._outcome(e, h.attack, h.out, p); if (e.state === 'dead') return; }
    }
    this._cur = e;
    stepFoe(e, dt, this.ctx);
    this._cur = null;
    if (e.state === 'dead') return;                                     // (a keg that went off by itself is gone)
    this.foefx.frame(e, dt);
    e.model.root.position.set(e.x, e.y, e.z);
    e.model.root.rotation.y = e.yaw;
    e.model.update(dt, { ...poseOf(e), hurt: e.hurt, dead: 0, t: e.t });
    e.model.flash?.(e.hurt * 0.8);
    e.shadow.x = e.x; e.shadow.z = e.z;
    e.shadow.visible = true;
  }

  /** What the table says the hero's attack did. */
  _outcome(e, attack, out, p) {
    const game = this.game;
    switch (out) {
      case 'kill':
        this.damage(e, 1, p.x, p.z, attack === 'ram' ? 'charge' : 'flame');
        if (attack === 'ram') { p.vx *= 0.35; p.vz *= 0.35; game.audio?.sfx('charge_hit', { vol: 1 }); }
        break;
      case 'ring': this._ring(e, p, attack); break;
      case 'boom':
        this._cur = e;
        explode(e, this.ctx, true);                                     // (the hero is in the blast if he is near: it hurts him as it hurts the Snuffers round it)
        this._cur = null;
        this.kill(e);
        break;
      default: break;                                                   // 'ignore': a mole underground: the flame and the ram go over it
    }
  }

  /** An attack that rings off (a brow, a shield, a shell of ice): a clang and a spark; a ram throws the hero back. */
  _ring(e, p, attack) {
    const game = this.game;
    if (attack === 'ram') {
      p.chargeT = 0; p.chargeCd = 0.5;
      p.vx = -Math.sin(p.yaw) * 6; p.vz = -Math.cos(p.yaw) * 6;
      game.cam.shake(0.18, 0.15);
      game.audio?.sfx('armor_clang', { vol: 0.9 });
      game.fx.hitSpark(e.x - Math.sin(p.yaw) * 0.7, e.y + e.K.cy + 0.2, e.z - Math.cos(p.yaw) * 0.7, 1.0);
    } else if (e.clangCd <= 0) {
      e.clangCd = 0.4;
      game.audio?.sfx('armor_clang', { vol: 0.9 });
      game.fx.hitSpark(e.x + Math.sin(p.yaw) * -0.6, e.y + e.K.cy + 0.2, e.z + Math.cos(p.yaw) * -0.6, 0.7);
    }
  }

  /** Flame on a Rimeling's shell: each tick of the flame melts it a little; at the last the shell falls, and for the next 5 s it is a plain Snuffer. */
  _melt(e) {
    e.melt++; e.regrow = e.V.regrow;
    this.foefx.on(e, 'melt', {});
    if (e.melt >= e.V.melt) { e.shell = 0; this.foefx.on(e, 'shatter', {}); }
  }

  /** Something a brain said (foes/index.js lists them). */
  _on(type, d) {
    const e = (d && d.by) || this._cur;
    const g = this.game;
    switch (type) {
      case 'alert': if (e) e.exclaimT = 0.9; break;
      case 'hurt': g.playerHurt(d.x, d.z); return;
      case 'summon': {
        const m = this.add({ x: d.x, z: d.z, variant: d.kind || 'basic', wild: true });
        if (e && e.minions) e.minions.push(m);
        break;
      }
      case 'boom': {
        // the keg takes every Snuffer within its blast (another keg goes off with it)
        for (const o of this.list.slice()) {
          if (o === e || o.state === 'dead' || Math.hypot(o.x - d.x, o.z - d.z) >= d.r + o.r) continue;
          if (o.B && o.K.brain === 'fuse') { if (!o.exploded) { const keep = this._cur; this._cur = o; explode(o, this.ctx, false); this._cur = keep; } } else this.damage(o, 1, d.x, d.z, 'blast');
        }
        if (!d.byHero && e) this.dismiss(e);                              // (a keg that goes off by itself is gone: no gems, not beaten)
        break;
      }
      default: break;
    }
    if (e) this.foefx.on(e, type, d);
  }

  _drops(e) {
    const g = this.game;
    g.gems.burst(e.x, e.y + 1.0, e.z, e.V.drops, 1);
    if (Math.random() < 0.6 || g.sparx.hp < 2) g.critters?.releaseButterfly(e.x, e.y + 1.5, e.z);
  }

  _remove(e, i) {
    e.model.root.parent?.remove(e.model.root);
    e.model.dispose?.();
    e.shadow.dead = true;
    e.alertIcon.dead = true;
    if (e.vis) this.foefx.dispose(e);
    this.list.splice(i, 1);
  }
}
