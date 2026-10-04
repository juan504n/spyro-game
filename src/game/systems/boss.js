// THE GUARDIAN IN THE GAME: plays guardian/brain.js (the fight, as a pure state machine) in the Court. Every step it hands the brain the hero (where he stands, whether he is blinking untouchable) and the
// Player's own flame test, and then does what the brain says: the fists' models and the circle each one casts on the floor, the shockwaves, the bolts and the circles of gloom, the stone fist that is a real obstacle
// while it is stuck (a collider, taken out of the world when it pulls free or breaks) and that the hero's RAM (Player.chargeHits, as for a Snuffer) cracks, the lanterns on the crown and the light they cast, the
// Snuffers the later phases call out of the floor, the hero's hurt (Game.playerHurt: Sparx takes it), the banners and hints, the sounds and the dawn that climbs with every lantern lit. The brain never reads the
// hero's moves and never touches the scene; this file never decides anything about the fight.
//
//   game.boss.brain           the GuardianBrain (tests and bots read it: phase, lit, fists, crown, waves...)
//   game.boss.hudState()      what the HUD's boss bar shows
//   game.emit('guardian-lit', n) / ('guardian-freed')     for the app: the ending
import { GuardianBrain, GUARDIAN } from '../guardian/brain.js';
import { makeModel } from '../models/fallback.js';

const VIOLET = [0.72, 0.52, 1.0], RED = [1.0, 0.3, 0.24], GOLD = [1.0, 0.82, 0.42], CYAN = [0.55, 1.0, 0.95], AMBER = [1.0, 0.64, 0.14], MAGENTA = [0.98, 0.32, 0.86], STONE = [[0.42, 0.4, 0.55], [0.55, 0.52, 0.7], [0.3, 0.28, 0.42]];
const RING_K = 0.875;                                  // the 'ring' sprite's ring lies at 14 of 16 pixels from its centre: a decal's half-size is the radius over this
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rnd = (a, b) => a + (b - a) * Math.random();
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/** the pieces the HUD's boss bar asks the system for */
const NO_HUD = { show: false };

export class BossSystem {
  /** cfg: gp.boss (guardian/layout.js layoutBoss): where the Guardian sits, the pillars, where the helpers come from. opts.freed: he has been freed already (a visit after the ending). */
  constructor(game, cfg, opts = {}) {
    this.game = game;
    this.cfg = cfg;
    const g = game, col = g.collision;
    this.floorAt = (x, z) => col.heightAt(x, z);
    this.brain = new GuardianBrain({ cx: cfg.x, cz: cfg.z, floorAt: this.floorAt, daisY: cfg.daisY, arenaR: cfg.arenaR, wakeR: cfg.wake, leaveR: cfg.leave, pillars: cfg.pillars });
    this.time = 0;
    this.told = {};                                     // the hints that have been given once
    this.helpers = [];                                  // the Snuffers of this phase
    this.hitsTaken = 0;
    this.fightTime = 0;                                 // seconds from the first wake to the last lantern (the ending's results)
    this.roarT = 0;
    this.look = 0;
    this.clangCd = 0;
    this.freedT = 0;
    this.shownLit = 0;                                  // the lanterns lit when the last 'the fists return' was said (a phase begun again says nothing)

    // ---- the models --------------------------------------------------------------------------------------------------
    const PEDESTAL = 1.1;                               // (props/village/court.js guardian_dais: he stands on it)
    this.model = makeModel(g.assets, 'guardian');
    this.model.root.position.set(cfg.x, cfg.daisY + PEDESTAL, cfg.z);
    g.dyn.add(this.model.root);
    this.fists = [0, 1].map((id) => {
      const model = makeModel(g.assets, 'guardian_fist');
      model.root.rotation.order = 'YXZ';
      model.root.visible = false;
      g.dyn.add(model.root);
      return { id, model, px: 0, py: 0, pz: 0, tilt: 0, yaw: 0, hit: null, tele: this._mark(), target: g.fx.decal({ pool: 'add', sprite: 'ring', r: 3.4, color: CYAN, alpha: 0, lift: 0.14 }), arrow: g.fx.billboard({ pool: 'cut', sprite: 'arrow_down', size: 2.0 }), lamp: g.fx.billboard({ pool: 'add', sprite: 'glow', size: 5.5, color: CYAN, alpha: 0 }), scorch: g.fx.decal({ pool: 'half', sprite: 'shadow_blob', r: 3.2, color: [0.1, 0.05, 0.2], alpha: 0 }), shadow: g.fx.decal({ pool: 'half', sprite: 'shadow_blob', r: 2.2, color: [0.1, 0.06, 0.2], alpha: 0 }), scorchT: 0 };
    });
    this.waves = Array.from({ length: 6 }, () => g.fx.decal({ pool: 'add', sprite: 'ring', r: 6, color: [1, 0.9, 0.7], alpha: 0, lift: 0.15 }));
    this.circles = Array.from({ length: 8 }, () => this._mark());
    this.bolts = Array.from({ length: 4 }, () => g.fx.billboard({ pool: 'add', sprite: 'glow', size: 2.4, color: VIOLET, alpha: 0 }));
    this.halos = [0, 1, 2].map(() => g.fx.billboard({ pool: 'add', sprite: 'glow', size: 2.4, color: VIOLET, alpha: 0 }));
    this.visorHalo = g.fx.billboard({ pool: 'add', sprite: 'glow', size: 3, color: VIOLET, alpha: 0 });
    // the three columns of light the crown sends up when he is free (they burn for as long as the Court stands)
    this.beams = [0, 1, 2].map((j) => {
      const m = makeModel(g.assets, 'light_beam', { height: 150, radius: 1.5 });
      const L = this.brain.lanternPos(j);
      m.root.position.set(L.x, L.y + 0.5, L.z);
      m.setColor?.(GOLD);
      m.setIntensity?.(0);
      g.dyn.add(m.root);
      return m;
    });
    this.beamK = 0;
    this.bowAt = -99;
    this.q = { flameHits: (x, y, z, r, dy) => g.player.flameHits(x, y, z, r, dy) };

    g.on('respawned', () => this._onRespawn());
    if (opts.freed) this.setFreed();
  }

  /**
   * What the floor says of a danger (a telegraph, a circle of gloom): a dark stain (alpha-blended: dark reads on a floor that is lit violet), a bright ring and, when it is about to fall, a second ring
   * inside the first (a shape as well as a colour: the red alone would not be read by everyone).
   */
  _mark() {
    const fx = this.game.fx;
    return {
      pad: fx.decal({ pool: 'half', sprite: 'shadow_blob', r: 4, color: [0.55, 0.03, 0.07], alpha: 0, lift: 0.1 }),
      ring: fx.decal({ pool: 'add', sprite: 'ring', r: 4, color: AMBER, alpha: 0, lift: 0.12 }),
      ring2: fx.decal({ pool: 'add', sprite: 'ring', r: 4, color: RED, alpha: 0, lift: 0.13 }),
    };
  }

  /** He has been freed already (the ending has been played): he sits quiet on his dais with his crown alight. */
  setFreed() {
    const B = this.brain;
    B.setFreed();
    const g = this.game;
    g.stats.beacons = 3; g.day = g.dayTarget = 1;
    this.freedT = 99;
    this.beamK = 1;
  }

  // ---- what the hero is, to the brain ---------------------------------------------------------------------------------------------------
  /** He bows to the hero (the ending): a slow lean forward and back over three seconds. */
  bow() { this.bowAt = this.time; }

  _hero(game) {
    const p = game.player;
    if (p.dead || p.carry || (game.mode !== 'play' && game.mode !== 'complete')) return null;
    return { x: p.x, y: p.y, z: p.z, r: p.r, invuln: p.invulnerable };
  }

  update(dt, game) {
    const B = this.brain, p = game.player;
    this.time += dt;
    this.clangCd = Math.max(0, this.clangCd - dt);
    this.roarT = Math.max(0, this.roarT - dt);
    if (B.mode === 'fight' || B.mode === 'stoop' || B.mode === 'rising' || B.mode === 'waking') this.fightTime += dt;
    for (const F of this.fists) { const f = B.fists[F.id]; F.px = f.x; F.py = f.y; F.pz = f.z; }
    B.step(dt, this._hero(game), this.q);
    // the hero's ram: a stuck fist cracks (as a Snuffer falls to it: Player.chargeHits, the horns' reach), his flame only rings on its stone
    for (const f of B.fists) {
      if (f.state !== 'stuck') continue;
      if (p.chargeT > 0 && !p.dead && p.chargeHits(f.x, f.y + 1.0, f.z, GUARDIAN.fist.r)) {
        if (B.ramFist(f.id)) { p.vx *= 0.35; p.vz *= 0.35; }
      } else if (p.flameT > 0 && this.clangCd <= 0 && p.flameHits(f.x, f.y + 1.2, f.z, GUARDIAN.fist.r)) {
        this.clangCd = 0.4;
        game.audio?.sfx('armor_clang', { vol: 0.8 });
        game.fx.hitSpark(f.x + Math.sin(p.yaw) * -1.2, f.y + 1.6, f.z + Math.cos(p.yaw) * -1.2, 0.8);
      }
    }
    this._events(game);
    B.events.length = 0;
    // the dawn climbs with the lanterns (and not before: the Court is a violet storm until the first is lit)
    if (B.mode !== 'freed') game.dayTarget = B.lit / 3;
    if (B.mode === 'freed') this.freedT += dt;
  }

  // ---- what the brain says ------------------------------------------------------------------------------------------------------------------
  _events(game) {
    const B = this.brain, g = game, fx = g.fx, hud = g.hud, A = this.cfg;
    const sfx = (n, o) => g.audio?.sfx(n, o);
    const once = (k, text, dur = 6) => { if (this.told[k]) return; this.told[k] = true; hud.hint(text, dur); };
    for (const e of B.events) {
      switch (e.type) {
        case 'wake':
          g.note('THE GUARDIAN WAKES');
          this.roarT = GUARDIAN.wakeT;
          sfx('guardian_roar', { vol: 1 });
          g.cam.shake(0.5, 1.6);
          hud.banner('THE GUARDIAN', 'WARDEN OF THE LANTERNS', 3.6);
          fx.puff(A.x, A.daisY + 2.0, A.z, 2.4);
          this._checkpoint(g);
          break;
        case 'phase': {
          this._dismissHelpers();
          this._dropColliders();
          if (e.lit > this.shownLit) { this.shownLit = e.lit; hud.banner('THE FISTS RETURN', e.phase === 1 ? 'AND THE RUNE BOLTS' : e.phase === 2 ? 'AND CIRCLES OF GLOOM' : '', 3.2); }
          else if (e.lit === 0) once('dodge', 'KEEP MOVING! THE CIRCLE ON THE FLOOR IS WHERE THE FIST FALLS', 6.5);
          for (const h of (A.helpers && A.helpers[e.phase]) || []) {
            const en = g.enemies && g.enemies.add({ x: h.x, z: h.z, y: h.y, variant: h.variant, wild: true });
            if (en) { this.helpers.push(en); fx.puff(h.x, h.y + 0.8, h.z, 1.3); }
          }
          break;
        }
        case 'slam-telegraph': sfx('guardian_whoosh', { vol: 0.75, pitch: e.fist ? 1.12 : 0.92 }); break;
        case 'slam-lock': sfx('guardian_warn', { vol: 0.8, pitch: e.fist ? 1.1 : 1 }); break;
        case 'slam': this._slam(e); break;
        case 'hit': {
          this.hitsTaken++;
          g.note(`HIT BY THE GUARDIAN (${e.what.toUpperCase()})`);
          g.playerHurt(e.fx, e.fz);
          break;
        }
        case 'crack': {
          g.note('A FIST CRACKED');
          sfx('guardian_crack', { vol: 1 });
          g.cam.shake(0.4, 0.4);
          fx.shards(e.x, e.y ?? this.floorAt(e.x, e.z) + 1.4, e.z, STONE, 22);
          fx.hitSpark(e.x, this.floorAt(e.x, e.z) + 1.6, e.z, 1.8);
          fx.puff(e.x, this.floorAt(e.x, e.z) + 1.2, e.z, 1.8);
          this._dropCollider(e.fist);
          once('crack', B.fistsLeft ? 'ONE FIST BROKEN. BREAK THE OTHER!' : 'BOTH FISTS BROKEN!', 3.4);
          break;
        }
        case 'fist-free': {
          sfx('guardian_whoosh', { vol: 0.5, pitch: 0.8 });
          fx.landDust(e.x, this.floorAt(e.x, e.z), e.z, 1.0);
          this._dropCollider(e.fist);
          break;
        }
        case 'stoop':
          g.note('THE GUARDIAN STOOPS');
          this._dismissHelpers();
          sfx('guardian_stoop', { vol: 1 });
          g.cam.shake(0.45, 1.4);
          hud.banner('THE GUARDIAN STOOPS', 'FLAME THE LANTERN THAT PULSES!', 3.6);
          break;
        case 'window': once('window', 'CLIMB THE DAIS AND BREATHE FIRE ON THE PULSING LANTERN. KEEP IT BURNING!', 7); break;
        case 'contact': sfx('guardian_catch', { vol: 0.8 }); break;
        case 'window-lost':
          g.note('THE CROWN ROSE (WINDOW LOST)');
          sfx('guardian_stoop', { vol: 0.7, pitch: 1.3 });
          hud.hint('THE CROWN RISES! BREAK THE NEW FISTS AND TRY AGAIN', 4.5);
          break;
        case 'lit': this._lit(e); break;
        case 'bolt-charge':
          sfx('guardian_charge', { vol: 0.9 });
          once('bolt', 'THE VISOR GLOWS: A BOLT IS COMING. STEP ASIDE, OR HIDE BEHIND A PILLAR', 6);
          break;
        case 'bolt': sfx('guardian_bolt', { vol: 0.9 }); break;
        case 'bolt-burst':
          sfx('guardian_burst', { vol: 0.6 });
          for (let i = 0; i < 9; i++) { const a = Math.random() * 6.28, s = rnd(2, 6); fx.spawn({ pool: 'add', sprite: 'spark_small', x: e.x, y: this.floorAt(e.x, e.z) + 1.2, z: e.z, vx: Math.cos(a) * s, vy: rnd(1, 4), vz: Math.sin(a) * s, gravity: -9, life: rnd(0.3, 0.6), size: [0.45, 0.1], c0: [...VIOLET, 1], c1: [...VIOLET, 0] }); }
          break;
        case 'gloom':
          sfx('guardian_warn', { vol: 0.9, pitch: 0.7 });
          once('gloom', 'RED RUNES BURST: LEAVE THE CIRCLES', 5.5);
          break;
        case 'gloom-burst': {
          sfx('guardian_gloom', { vol: 0.7, jitter: 0.06 });
          const y = this.floorAt(e.x, e.z);
          for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28, s = rnd(0.5, 2.5); fx.spawn({ pool: 'add', sprite: 'spark_small', x: e.x + Math.cos(a) * 1.5, y: y + 0.3, z: e.z + Math.sin(a) * 1.5, vx: Math.cos(a) * s, vy: rnd(4, 9), vz: Math.sin(a) * s, gravity: -10, life: rnd(0.5, 0.9), size: [0.5, 0.1], c0: [...RED, 1], c1: [0.5, 0.1, 0.6, 0] }); }
          fx.spawn({ pool: 'half', frames: ['smoke_0', 'smoke_1'], overLife: true, x: e.x, y: y + 1.0, z: e.z, vy: 2.2, life: 0.9, size: [2.2, 4.6], c0: [0.18, 0.1, 0.3, 0.9], c1: [0.18, 0.1, 0.3, 0] });
          g.cam.shake(0.12, 0.15);
          break;
        }
        case 'sleep':
          g.note('THE GUARDIAN SLEEPS');
          this._dismissHelpers(); this._dropColliders();
          break;
        case 'freed':
          g.note('THE GUARDIAN IS FREED');
          this._dismissHelpers(); this._dropColliders();
          g.emit('guardian-freed');
          break;
        default: break;
      }
    }
  }

  /** A fist landed: the ground jumps, dust and sparks, the fist is a stone in the way (and the rune on its back is what to ram). */
  _slam(e) {
    const g = this.game, fx = g.fx, y = this.floorAt(e.x, e.z);
    g.audio?.sfx('guardian_slam', { vol: 1 });
    const d = Math.hypot(g.player.x - e.x, g.player.z - e.z);
    g.cam.shake(clamp(0.5 - d * 0.01, 0.15, 0.5), 0.35);
    fx.landDust(e.x, y, e.z, 2.0);
    fx.landDust(e.x, y + 0.2, e.z, 1.4);
    for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, s = rnd(3, 7); fx.spawn({ pool: 'add', sprite: 'spark_small', x: e.x, y: y + 0.4, z: e.z, vx: Math.cos(a) * s, vy: rnd(3, 8), vz: Math.sin(a) * s, gravity: -16, life: rnd(0.4, 0.8), size: [0.5, 0.1], c0: [...VIOLET, 1], c1: [...VIOLET, 0] }); }
    fx.shards(e.x, y + 0.8, e.z, STONE, 8);
    const F = this.fists[e.fist];
    F.scorchT = 4.6; F.scorch.x = e.x; F.scorch.z = e.z;
    this._dropCollider(e.fist);
    F.hit = g.collision.add({ type: 'cyl', x: e.x, z: e.z, r: GUARDIAN.fist.r, y0: y - 0.3, y1: y + 2.6, top: false, tag: 'fist' });
    this.told.rune || (this.told.rune = true, g.hud.hint('RAM THE GLOWING RUNE ON THE FIST THAT HAS LANDED! (HOLD RAM AND RUN AT IT)', 6.5));
  }

  _lit(e) {
    const g = this.game, B = this.brain, n = e.n;
    g.note(`GUARDIAN LANTERN ${n} OF 3`);
    g.stats.beacons = n;
    g.hud.pulse('beacons');
    g.hud.banner(`LANTERN ${n} OF 3`, n >= 3 ? 'THE CROWN BURNS AT LAST' : 'THE CROWN BURNS BRIGHTER', 3.4);
    g.audio?.sfx('guardian_lit', { vol: 1 });
    if (n < 3) g.audio?.stinger?.('lantern');
    g.cam.shake(0.3, 0.8);
    const L = B.lanternPos(n - 1);
    g.fx.ignite?.(L.x, L.y, L.z, true);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * 6.28; g.fx.spawn({ pool: 'add', sprite: 'spark', x: L.x, y: L.y + 0.4, z: L.z, vx: Math.cos(a) * rnd(3, 7), vy: rnd(1, 5), vz: Math.sin(a) * rnd(3, 7), gravity: -3, life: rnd(0.8, 1.4), size: [0.55, 0.08], c0: [1, 0.95, 0.7, 1], c1: [...GOLD, 0] }); }
    g.sparx?.healAll();
    this._dismissHelpers(); this._dropColliders();
    g.emit('guardian-lit', n);
  }

  /** where a hero who dies in the Court is set back to: the mouth of the court, facing the Guardian, from the moment the Guardian wakes */
  _checkpoint(g) {
    const A = this.cfg, z = A.z + A.arenaR - 3, x = A.x;
    g.checkpoint = { x, y: this.floorAt(x, z), z, yaw: Math.PI };
  }

  _onRespawn() {
    const B = this.brain;
    for (const F of this.fists) { F.scorch.alpha = 0; F.scorchT = 0; }
    B.resetPhase();
  }

  _dropCollider(i) {
    const F = this.fists[i];
    if (F && F.hit) { this.game.collision.remove(F.hit); F.hit = null; }
  }
  _dropColliders() { for (const F of this.fists) this._dropCollider(F.id); }

  _dismissHelpers() {
    const en = this.game.enemies;
    for (const h of this.helpers) if (en && h.state !== 'dead') en.dismiss(h);
    this.helpers.length = 0;
  }

  /** what the HUD's boss bar shows: nothing while he sleeps, his fists while he fights, the window and the flame while he stoops; and where the dangers are (see threats) */
  hudState() {
    const B = this.brain;
    if (B.mode === 'asleep' || B.mode === 'freed') return NO_HUD;
    const st = B.status();
    return { show: true, mode: B.mode, sub: st.sub, lit: B.lit, phase: B.phase, fists: B.fists.map((f) => f.state !== 'cracked' && f.state !== 'gone'), window: st.window ? st.windowLeft / st.window : 0, windowOn: st.mode === 'stoop' && st.sub === 'window', flame: clamp(st.contact / st.need), waking: B.mode === 'waking', threats: this.threats() };
  }

  /**
   * Where the things that will hurt are, as places on the floor: the circles that follow him and the ones that have locked, the circles of gloom, the nearest point of every ring that is coming for him, the
   * bolts. `hot`: about to fall / burst / hit. The HUD (hud.js _drawThreats) points at those that are off the screen: running away from a fist puts its circle behind him, under the chase camera, where
   * he cannot see it, and it must still be shown.
   */
  threats() {
    const B = this.brain, p = this.game.player, S = GUARDIAN.slam, C = GUARDIAN.gloom, out = [];
    for (const f of B.fists) if (f.state === 'rise' || f.state === 'aim' || f.state === 'lock' || f.state === 'drop') out.push({ x: f.tx, z: f.tz, hot: f.state === 'lock' || f.state === 'drop', r: S.r });
    for (const c of B.circles) if (!c.burst) out.push({ x: c.x, z: c.z, hot: c.t < 0.7, r: C.r });
    for (const w of B.waves) {
      const d = Math.hypot(p.x - w.x, p.z - w.z);
      if (d > w.r + 0.5 && w.r < w.max) { const k = (d - w.r) / d; out.push({ x: p.x + (w.x - p.x) * k, z: p.z + (w.z - p.z) * k, hot: d - w.r < 7, wave: true, r: 1 }); }
    }
    for (const b of B.bolts) out.push({ x: b.x, z: b.z, hot: true, r: 1 });
    return out;
  }

  // ---- drawing ---------------------------------------------------------------------------------------------------------------------------
  frame(dt, alpha, game) {
    const B = this.brain, fx = game.fx, A = this.cfg, p = game.player, S = GUARDIAN.slam, time = this.time;
    const asleep = B.mode === 'asleep';
    // ---- the Guardian: he turns to the hero (the upper body: the crown stays where the brain's lanterns are), leans in when he stoops, and speaks with his runes
    const want = Math.atan2(p.x - A.x, p.z - A.z);
    this.look += wrapA(clampLook(want) - this.look) * (1 - Math.exp(-dt * (asleep ? 0.6 : 2.2)));
    const free = B.mode === 'freed';
    const charge = B.charge ? clamp(B.charge.t / GUARDIAN.bolt.chargeT) : 0;
    const lit = [B.lit > 0 ? 1 : 0, B.lit > 1 ? 1 : 0, B.lit > 2 ? 1 : 0];
    const stoopWin = B.mode === 'stoop' && B.sub === 'window';
    const bowK = Math.pow(Math.sin(Math.PI * clamp((time - this.bowAt) / 3.2)), 0.7);
    this.model.update(dt, { t: time, crown: B.crown, ring: B.ring, lit, active: stoopWin || B.mode === 'stoop' ? B.lit : -1, visor: charge, awake: asleep ? 0.15 : 1, freed: free ? 1 : 0, roar: clamp(this.roarT / 1.5), look: this.look, bow: bowK });
    // the columns of light
    this.beamK += ((free ? 1 : 0) - this.beamK) * (1 - Math.exp(-dt * (free ? 0.7 : 4)));
    for (let j = 0; j < 3; j++) { const m = this.beams[j]; m.setIntensity?.(this.beamK * (0.85 + 0.1 * Math.sin(time * 1.9 + j * 2))); m.update?.(dt, { t: time }); }
    // the lanterns' light (the one that counts breathes)
    for (let j = 0; j < 3; j++) {
      const h = this.halos[j], L = B.lanternPos(j), isLit = j < B.lit, act = (B.mode === 'stoop') && j === B.lit;
      h.x = L.x; h.y = L.y + 0.45; h.z = L.z;
      h.color = isLit ? GOLD : VIOLET;
      h.size = isLit ? 3.6 : act ? 3.4 + 0.8 * Math.sin(time * 5.2) : 1.8;
      h.alpha = isLit ? 0.5 + 0.08 * Math.sin(time * 3 + j) : act ? 0.55 + 0.3 * Math.sin(time * 5.2) : 0.12;
      h.visible = true;
    }
    // while the flame is on a lantern: embers fly off it
    if (B.mode === 'stoop' && B.touching) { const L = B.lanternPos(B.lit); for (let i = 0; i < 2; i++) fx.spawn({ pool: 'add', sprite: 'spark_small', x: L.x + rnd(-0.4, 0.4), y: L.y + rnd(0, 0.8), z: L.z + rnd(-0.4, 0.4), vx: rnd(-1, 1), vy: rnd(1.5, 3.5), vz: rnd(-1, 1), life: rnd(0.4, 0.8), size: [0.4, 0.08], c0: [1, 0.9, 0.5, 1], c1: [1, 0.5, 0.1, 0] }); }
    // the visor charges: a point of light in front of his face grows
    const vh = this.visorHalo, v0 = { x: A.x + Math.sin(this.look) * 2.0, y: A.daisY + 1.1 + 12.45, z: A.z + Math.cos(this.look) * 2.0 };
    vh.x = v0.x; vh.y = v0.y; vh.z = v0.z; vh.size = 2 + 5 * charge; vh.alpha = charge * (0.5 + 0.3 * Math.sin(time * 30)); vh.visible = charge > 0.02;
    if (charge > 0.05) fx.spawn({ pool: 'add', sprite: 'spark_small', x: v0.x + rnd(-2.5, 2.5), y: v0.y + rnd(-2, 2), z: v0.z + rnd(1, 3), life: 0.3, size: [0.35, 0.05], c0: [...VIOLET, 1], c1: [...VIOLET, 0], vx: -Math.sin(this.look) * 4, vy: 0, vz: -Math.cos(this.look) * 4 });

    // ---- the fists ----------------------------------------------------------------------------------------------------------
    for (const F of this.fists) {
      const f = B.fists[F.id], m = F.model, T = F.tele;
      const vis = !asleep && f.state !== 'gone' && B.mode !== 'freed';
      m.root.visible = vis;
      F.scorchT = Math.max(0, F.scorchT - dt);
      F.scorch.alpha = clamp(F.scorchT / 1.6) * 0.8; F.scorch.visible = F.scorch.alpha > 0.01;
      const flying = f.state === 'hover' || f.state === 'form' || f.state === 'rise' || f.state === 'aim' || f.state === 'lock' || f.state === 'drop' || f.state === 'recover';
      F.shadow.visible = vis && flying;
      if (vis) {
        const x = lerp(F.px, f.x, alpha), y = lerp(F.py, f.y, alpha), z = lerp(F.pz, f.z, alpha);
        const striking = f.state === 'rise' || f.state === 'aim' || f.state === 'lock' || f.state === 'drop';
        const faceTo = striking ? Math.atan2(p.x - x, p.z - z) : Math.atan2(A.x - x, A.z - z);
        F.yaw += wrapA(faceTo - F.yaw) * (1 - Math.exp(-dt * 9));
        F.tilt += ((striking ? 1.2 : f.state === 'hover' ? 0.15 : 0) - F.tilt) * (1 - Math.exp(-dt * (striking ? 14 : 8)));
        const s = f.state === 'form' ? 0.35 + 0.65 * clamp(f.t / GUARDIAN.fist.formT) : 1;
        m.root.position.set(x, y, z);
        m.root.rotation.set(F.tilt, F.yaw, f.state === 'hover' ? Math.sin(time * 1.9 + F.id) * 0.1 : 0);
        m.root.scale.setScalar(s);
        m.update(dt, { t: time, glow: f.state === 'stuck' ? 1 : striking && f.state !== 'rise' ? 0.35 : 0, crack: f.state === 'cracked' ? clamp(f.t / GUARDIAN.fist.crackT) : 0 });
        const h = Math.max(0, y - this.floorAt(f.x, f.z));
        F.shadow.x = x; F.shadow.z = z; F.shadow.r = 2.2 + h * 0.04; F.shadow.alpha = clamp(0.7 - h * 0.035, 0.12, 0.7);
      }
      // the circle on the floor that says where it falls: amber while it follows him, red (and a second ring inside it) once it has locked and it is about to drop
      const tele = f.state === 'rise' || f.state === 'aim' || f.state === 'lock' || f.state === 'drop';
      if (tele) {
        const lock = f.state === 'lock' || f.state === 'drop', k = f.state === 'rise' ? clamp(f.t / GUARDIAN.fist.riseT) : 1;
        const pulse = lock ? 0.78 + 0.22 * Math.sin(time * 34) : 0.88 + 0.12 * Math.sin(time * 9);
        this._setMark(T, f.tx, f.tz, S.r, lock ? [1.0, 0.34, 0.26] : AMBER, k * pulse, k * (lock ? 0.9 : 0.55), lock ? k * pulse : 0);
      } else this._setMark(T, 0, 0, S.r, AMBER, 0, 0, 0);
      // a fist that has landed: the rune on its back is the target (a ring of cyan light round it that breathes, and the arrow that marks a goal over it)
      const stuck = f.state === 'stuck';
      F.target.visible = stuck;
      if (stuck) { F.target.x = f.x; F.target.z = f.z; F.target.alpha = 0.78 + 0.2 * Math.sin(time * 7); F.target.r = (2.7 + 0.25 * Math.sin(time * 7)) / RING_K; }
      F.arrow.visible = stuck;
      if (stuck) { F.arrow.x = f.x; F.arrow.z = f.z; F.arrow.y = f.y + 4.4 + Math.sin(time * 5) * 0.25; }
      // ... and a cyan lamp over the crystal that can be seen from across the court, with motes of light climbing out of it
      F.lamp.visible = stuck;
      if (stuck) {
        F.lamp.x = f.x; F.lamp.z = f.z; F.lamp.y = f.y + 3.0; F.lamp.alpha = 0.55 + 0.25 * Math.sin(time * 7); F.lamp.size = 5.0 + 0.8 * Math.sin(time * 7);
        if (Math.random() < dt * 22) fx.spawn({ pool: 'add', sprite: 'spark_small', x: f.x + rnd(-0.5, 0.5), y: f.y + 2.8, z: f.z + rnd(-0.5, 0.5), vy: rnd(3.5, 6), life: rnd(0.8, 1.3), size: [0.45, 0.08], c0: [...CYAN, 1], c1: [...CYAN, 0] });
      }
    }

    // ---- the shockwaves --------------------------------------------------------------------------------------------------------------
    for (let i = 0; i < this.waves.length; i++) {
      const d = this.waves[i], w = B.waves[i];
      if (!w) { d.alpha = 0; continue; }
      const k = clamp((w.r - S.r) / (w.max - S.r));
      d.x = w.x; d.z = w.z; d.r = w.r / RING_K; d.color = lerp3([1, 0.93, 0.75], [1, 0.6, 0.35], k); d.alpha = 1.0 * Math.pow(1 - k, 0.5); d.visible = true;
      // a low ring of dust and sparks at the wavefront
      const n = Math.min(26, 8 + Math.round(w.r * 1.2));
      if (((this.game.frames + i) & 1) === 0) for (let j = 0; j < n; j++) { const a = Math.random() * 6.283, x = w.x + Math.cos(a) * w.r, z = w.z + Math.sin(a) * w.r; fx.spawn({ pool: 'add', sprite: 'spark_small', x, y: this.floorAt(x, z) + 0.2, z, vy: rnd(0.6, 1.8), life: 0.28, size: [0.5, 0.1], c0: [...lerp3([1, 0.9, 1], VIOLET, k), 0.9], c1: [...VIOLET, 0] }); }
    }

    // ---- the bolts ----------------------------------------------------------------------------------------------------------------
    for (let i = 0; i < this.bolts.length; i++) {
      const h = this.bolts[i], b = B.bolts[i];
      if (!b) { h.alpha = 0; continue; }
      h.x = b.x; h.y = b.y; h.z = b.z; h.size = 2.2 + 0.4 * Math.sin(time * 40 + i); h.alpha = 0.95; h.color = [0.85, 0.7, 1]; h.visible = true;
      fx.spawn({ pool: 'add', sprite: 'glow_small', x: b.x - b.vx * 0.03, y: b.y + rnd(-0.15, 0.15), z: b.z - b.vz * 0.03, life: 0.4, size: [1.0, 0.1], c0: [...VIOLET, 0.9], c1: [0.4, 0.2, 1, 0] });
      if (Math.random() < 0.5) fx.spawn({ pool: 'add', sprite: 'spark_small', x: b.x, y: b.y, z: b.z, vx: rnd(-1, 1), vy: rnd(-1, 1.5), vz: rnd(-1, 1), life: 0.4, size: [0.35, 0.05], c0: [1, 1, 1, 1], c1: [...VIOLET, 0] });
    }

    // ---- the circles of gloom: a dark stain with a magenta ring that goes red, and gains a second ring, as it is about to burst ---------------------------------------------------------
    const C = GUARDIAN.gloom;
    for (let i = 0; i < this.circles.length; i++) {
      const M = this.circles[i], c = B.circles[i];
      if (!c) { this._setMark(M, 0, 0, C.r, MAGENTA, 0, 0, 0); continue; }
      if (c.burst) { const a = clamp(c.after / C.lingerT); this._setMark(M, c.x, c.z, C.r * 1.1, [1, 0.8, 0.9], a, a * 0.9, 0); continue; }
      const k = 1 - clamp(c.t / C.warnT), danger = c.t < 0.6, a = clamp(k * 3 + 0.25);
      this._setMark(M, c.x, c.z, C.r, danger ? [1.0, 0.3, 0.24] : MAGENTA, (danger ? 0.85 + 0.15 * Math.sin(time * 40) : 0.75) * a, a * (danger ? 0.9 : 0.5), danger ? a : 0);
    }
  }

  _setMark(m, x, z, r, color, ringA, padA, ring2A) {
    const R = m.ring, R2 = m.ring2, P = m.pad;
    R.x = R2.x = P.x = x; R.z = R2.z = P.z = z;
    R.r = r / RING_K; R2.r = (r * 0.7) / RING_K; P.r = r * 1.18;
    R.color = color; R2.color = color;
    R.alpha = ringA; R2.alpha = ring2A; P.alpha = padA;
    R.visible = ringA > 0.01; R2.visible = ring2A > 0.01; P.visible = padA > 0.01;
  }
}

/** how far the Guardian turns his upper body from the road: all the way to the hero's side, no more than a half turn either way (the lanterns, on the crown, do not turn with him) */
function clampLook(a) { return Math.max(-2.3, Math.min(2.3, a)); }
