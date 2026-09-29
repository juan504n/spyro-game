// Snuffers: the realm's villains. Three flavours that demand different tactics:
//   basic — burns and rams equally well
//   bell  — armoured with a brass bell: fire bounces off, needs two rams
//   thorn — spiked: ramming hurts YOU, fire is the answer
import { makeModel } from '../models/fallback.js';
import { WATER_LEVEL } from '../level.js';

const VARIANTS = {
  basic: { hp: 2, speed: 5.4, notice: 15, reach: 2.7, drops: [1, 1, 2], flameDmg: 1, chargeDmg: 2 },
  bell: { hp: 2, speed: 4.3, notice: 13, reach: 2.9, drops: [5, 2], flameDmg: 0, chargeDmg: 1 },
  thorn: { hp: 2, speed: 5.8, notice: 14, reach: 2.5, drops: [2, 2, 5], flameDmg: 1, chargeDmg: 0, spiked: true },
};

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class EnemySystem {
  /** spawns: [{ x, z, variant, patrol }] */
  constructor(game, spawns) {
    this.game = game;
    this.list = [];
    for (const s of spawns) this.list.push(this._make(s));
  }

  _make(s) {
    const g = this.game;
    const V = VARIANTS[s.variant] || VARIANTS.basic;
    const model = makeModel(g.assets, 'snuffer', { variant: s.variant || 'basic' });
    const y = s.y ?? g.collision.heightAt(s.x, s.z);
    model.root.position.set(s.x, y, s.z);
    g.dyn.add(model.root);
    const shadow = g.fx.decal({ pool: 'half', sprite: 'shadow_blob', r: 1.25, color: [0.3, 0.3, 0.4], alpha: 0.75 });
    const alertIcon = g.fx.billboard({ pool: 'cut', sprite: 'exclaim', size: 1.3 });
    alertIcon.visible = false;
    return {
      variant: s.variant || 'basic', V, model, shadow, alertIcon, x: s.x, y, z: s.z, hx: s.x, hz: s.z, vx: 0, vz: 0, yaw: Math.random() * 6.28, r: 0.75, h: 2,
      hp: V.hp, state: 'idle', st: 0, patrolR: s.patrol ?? 5, tx: s.x, tz: s.z, flameCd: 0, chargeCd: 0, struck: false, attack: 0, hurt: 0, stun: 0, dead: 0, alert: 0, exclaimT: 0, t: Math.random() * 10, active: true, clangCd: 0,
    };
  }

  _move(e, vx, vz, dt) {
    const col = this.game.collision;
    const ox = e.x, oz = e.z;
    e.x += vx * dt; e.z += vz * dt;
    // keep out of props
    col.pushOut(e, e.y, e.h, 0.55);
    const n = col.normalAt(e.x, e.z);
    const gh = col.heightAt(e.x, e.z);
    if (n[1] < 0.66 || gh < WATER_LEVEL - 0.5 || gh - e.y > 0.9) { e.x = ox; e.z = oz; return false; }
    const sup = col.support(e.x, e.z, e.y, 0.6);
    if (e.y - sup.y > 1.3) { e.x = ox; e.z = oz; return false; }   // never walk off a ledge
    e.y = sup.y;
    return true;
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

  kill(e) {
    const g = this.game;
    e.state = 'dead'; e.dead = 0; e.st = 0;
    e.alertIcon.visible = false;
    g.audio?.sfx('snuffer_die', { vol: 1 });
    g.stats.enemies++;
    g.emit('enemy', e);
  }

  update(dt, game) {
    const p = game.player;
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
      e.alertIcon.x = e.x; e.alertIcon.y = e.y + 3.0 + Math.sin(e.t * 12) * 0.08; e.alertIcon.z = e.z;

      if (e.state === 'dead') {
        e.dead += dt / 0.7;
        e.vx *= Math.exp(-4 * dt); e.vz *= Math.exp(-4 * dt);
        if (e.dead >= 1) { this._remove(e, i); continue; }
        if (e.dead > 0.45 && !e.poofed) { e.poofed = true; game.fx.puff(e.x, e.y + 1.0, e.z, 1.2); this._drops(e); }
        e.model.update(dt, { dead: e.dead, t: e.t });
        continue;
      }

      // ---- hits from the player ------------------------------------------------------------------------------
      if (p.canAct || p.chargeT > 0 || p.flameT > 0) {
        if (p.flameT > 0 && e.flameCd <= 0 && p.flameHits(e.x, e.y + 1, e.z, e.r)) {
          e.flameCd = 0.3;
          if (e.V.flameDmg > 0) this.damage(e, e.V.flameDmg, p.x, p.z, 'flame');
          else if (e.clangCd <= 0) { e.clangCd = 0.4; game.audio?.sfx('armor_clang', { vol: 0.9 }); game.fx.hitSpark(e.x + Math.sin(p.yaw) * -0.6, e.y + 1.2, e.z + Math.cos(p.yaw) * -0.6, 0.7); }
        }
        if (p.chargeT > 0 && e.chargeCd <= 0 && p.chargeHits(e.x, e.y + 1, e.z, e.r)) {
          e.chargeCd = 0.5;
          if (e.V.spiked) {
            // ouch: ramming a thorn-back
            game.playerHurt(e.x, e.z);
            p.chargeT = 0; p.chargeCd = 0.5;
            game.fx.hitSpark(e.x, e.y + 1.2, e.z, 1.1);
            game.audio?.sfx('armor_clang', { vol: 0.8 });
          } else {
            this.damage(e, e.V.chargeDmg, p.x, p.z, 'charge');
            p.vx *= 0.35; p.vz *= 0.35;
            game.audio?.sfx('charge_hit', { vol: 1 });
            if (e.V.chargeDmg < e.hp + e.V.chargeDmg && e.hp > 0) game.audio?.sfx('armor_clang', { vol: 0.6 });
          }
          if (e.state === 'dead') continue;
        }
      }

      // ---- behaviour -----------------------------------------------------------------------------------------
      let speedNow = 0;
      const canSee = dp < e.V.notice && !p.dead;
      switch (e.state) {
        case 'idle': {
          if (canSee) { e.state = 'alert'; e.st = 0.42; e.exclaimT = 0.9; game.audio?.sfx('snuffer_alert', { vol: 0.8 }); break; }
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
          if (dp > 32 || homeD > 40 || p.dead) { e.state = 'return'; break; }
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
      e.model.update(dt, { speed: speedNow, attack: e.state === 'attack' ? e.attack : 0, alert: e.alert, hurt: e.hurt, stun: e.state === 'hurt' ? Math.min(1, e.st * 2) : 0, dead: 0, t: e.t });
      e.model.flash?.(e.hurt * 0.8);
      e.shadow.x = e.x; e.shadow.z = e.z;
      e.shadow.visible = true;
    }
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
    this.list.splice(i, 1);
  }
}
