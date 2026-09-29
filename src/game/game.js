// Game: owns the world, the player, the camera and every gameplay system; runs a fixed 60 Hz simulation and
// interpolates for rendering. app.js drives the high-level flow (title / intro / play / finale).
import * as THREE from 'three';
import { Assets } from './assets.js';
import { Input } from './input.js';
import { Collision } from './collision.js';
import { GameCamera } from './camera.js';
import { Player } from './player.js';
import { LEVEL } from './level.js';
import { buildWorld } from './world.js';
import { makeModel } from './models/fallback.js';
import { SpriteAtlas } from './sprites.js';
import { Fx } from './fx.js';
import { Hud } from './hud.js';
import { GemField } from './systems/gems.js';
import { Sparx } from './systems/sparx.js';
import { BeaconSystem } from './systems/beacons.js';
import { EnemySystem } from './systems/enemies.js';
import { CritterSystem } from './systems/critters.js';
import { ObjectSystem } from './systems/objects.js';
import { Ambient } from './systems/ambient.js';
import { NpcSystem } from './systems/npc.js';

export const STEP = 1 / 60;
const tick = () => new Promise((r) => setTimeout(r, 0));

export class Game {
  /**
   * @param {import('../engine/gfx.js').Gfx} gfx
   * @param {object} [opts] { populate(kit, world), assets, audio, systems: bool }
   */
  constructor(gfx, opts = {}) {
    this.gfx = gfx;
    this.level = LEVEL;
    this.assets = opts.assets || new Assets();
    this.audio = opts.audio || null;
    this.input = new Input(gfx.canvas);
    this.populate = opts.populate || null;
    this.withSystems = opts.systems !== false;
    this.time = 0;
    this.acc = 0;
    this.frames = 0;
    this.day = 0;
    this.dayTarget = 0;
    this.locked = false;         // player control lock (dialogue, cutscene)
    this.paused = false;
    this.mode = 'play';          // 'title' | 'intro' | 'play' | 'finale' | 'complete'
    this.systems = [];
    this.camera = new THREE.PerspectiveCamera(57, gfx.W / gfx.H, 0.4, 1600);
    this.dyn = new THREE.Group();
    this.dyn.name = 'dynamic';
    this.events = {};
    this.stats = { gems: 0, gemsTotal: 400, beacons: 0, enemies: 0, bunnies: 0, vases: 0, chests: 0, walls: 0, deaths: 0, time: 0 };
    this.checkpoint = null;
    this.loops = {};
    this.fade = { a: 0, target: 0, speed: 2 };
    this.deathT = 0;
    this.finale = null;
    this.externalPoll = false;
  }

  /** Build world + systems. Async so a loading screen can paint between phases. */
  async build(progress = () => {}) {
    const t0 = performance.now();
    await progress(0.05, 'SCULPTING VALE');
    await tick();
    this.world = buildWorld(this.assets, this.populate);
    this.grid = this.world.grid;
    this.gameplay = this.world.gameplay || {};
    await progress(0.45, 'PLANTING TREES');
    await tick();
    this.collision = new Collision(this.grid, this.world.colliders);
    this.scene = this.world.scene;
    this.scene.add(this.dyn);
    this.cam = new GameCamera(this.camera, this);
    this.atlas = new SpriteAtlas();
    this.fx = new Fx(this.atlas, this.grid, this.scene);
    this.hud = new Hud(this);
    if (this.gameplay.gemsTotal) this.stats.gemsTotal = this.gameplay.gemsTotal;

    // hero
    const spy = makeModel(this.assets, 'spyro');
    this.model = spy;
    this.dyn.add(spy.root);
    this.player = new Player(this, spy);
    const sp = this.gameplay.spawn || this.level.spawn;
    const gy = this.grid.heightAt(sp.x, sp.z);
    this.player.place(sp.x, (sp.y ?? gy) + 0.05, sp.z, sp.yaw);
    this.checkpoint = { x: sp.x, y: (sp.y ?? gy) + 0.05, z: sp.z, yaw: sp.yaw };
    this.shadow = this.fx.decal({ pool: 'half', sprite: 'shadow_blob', r: 0.85, color: [0.25, 0.25, 0.35], alpha: 0.8 });
    this.bindPlayerEvents();
    await progress(0.7, 'AWAKENING SNUFFERS');
    await tick();

    if (this.withSystems) {
      const gp = this.gameplay;
      this.sparx = new Sparx(this);
      this.gems = new GemField(this, gp.gems || []);
      this.beacons = new BeaconSystem(this, gp.beacons || []);
      this.enemies = new EnemySystem(this, gp.enemies || []);
      this.critters = new CritterSystem(this, gp.bunnies || []);
      this.objects = new ObjectSystem(this, { vases: gp.vases, chests: gp.chests, walls: gp.walls, braziers: gp.braziers, portcullis: gp.portcullis, barrier: gp.barrier, mushrooms: gp.mushrooms, sails: gp.sails, islands: gp.islands });
      this.ambient = new Ambient(this, this.world.lights || [], this.world.emitters || []);
      this.npcs = new NpcSystem(this, gp.npcs || [], gp.hints || []);
      // step order: abilities/AI first, then pickups
      this.systems = [this.sparx, this.beacons, this.enemies, this.critters, this.objects, this.gems, this.ambient, this.npcs];
      this.on('beacon', (b, n) => this.onBeacon(b, n));
    }
    this.buildTime = performance.now() - t0;
    await progress(1, 'READY');
    return this;
  }

  on(name, fn) { (this.events[name] ||= []).push(fn); }
  emit(name, a, b, c) { const l = this.events[name]; if (l) for (const f of l) f(a, b, c); }

  resize(W, H) { this.camera.aspect = W / H; this.camera.updateProjectionMatrix(); }

  // ---- player events -> fx / audio ------------------------------------------------------------------------------------
  bindPlayerEvents() {
    const p = this.player, fx = this.fx;
    const sfx = (n, o) => this.audio?.sfx(n, o);
    p.on.jump = () => { sfx('jump', { vol: 0.8, jitter: 0.04 }); fx.dust(p.x, p.y, p.z, 2, 0.3); };
    p.on.land = (impact) => {
      sfx('land', { vol: Math.min(1, 0.3 + impact / 28) });
      if (impact > 6) fx.landDust(p.x, p.y, p.z, Math.min(1.2, impact / 22));
    };
    p.on.glide = () => { sfx('glide_start', { vol: 0.8 }); sfx('flap', { vol: 0.6 }); };
    p.on.flame = () => sfx('flame', { vol: 0.9, jitter: 0.03 });
    p.on.charge = () => { sfx('charge_start', { vol: 0.9 }); fx.dust(p.x, p.y, p.z, 4, 0.5); };
    p.on.hurt = () => { sfx('hurt', { vol: 1 }); this.cam.shake(0.35, 0.3); fx.hitSpark(p.x, p.y + 0.6, p.z, 1); };
    p.on.die = () => { sfx('die', { vol: 1 }); this.stats.deaths++; this.deathT = 0; this.audio?.duck?.(0.6, 2.2); };
    p.on.splash = (depth) => { fx.splash(p.x, 0, p.z, depth > 0.9 ? 1.5 : 0.8); sfx('splash', { vol: depth > 0.9 ? 1 : 0.5 }); };
    p.on.drown = () => { fx.splash(p.x, 0, p.z, 1.8); sfx('splash', { vol: 1 }); this.hud.hint('MIRRORMERE IS TOO DEEP! FIND THE STONES OR GLIDE', 4); };
    p.on.respawn = () => { sfx('respawn', { vol: 0.8 }); fx.puff(p.x, p.y + 0.5, p.z, 0.8); };
    p.on.wall = (c) => { sfx('charge_hit', { vol: 1 }); this.cam.shake(0.35, 0.25); fx.hitSpark(p.x + p.dirx, p.y + 0.6, p.z + p.dirz, 1.3); fx.puff(p.x + p.dirx * 1.2, p.y + 0.6, p.z + p.dirz * 1.2, 0.6); void c; };
    p.on.bounce = () => {};
  }

  /** A hostile touched the player. Sparx absorbs one hit; without him it's lights out. */
  playerHurt(fromX, fromZ) {
    const p = this.player;
    if (!p.hurt(fromX, fromZ)) return false;
    if (!this.sparx || !this.sparx.absorbHit()) p.kill();
    this.hud.pulse('sparx');
    return true;
  }

  setCheckpoint(cp) { this.checkpoint = { ...cp }; this.hud.hint('CHECKPOINT SAVED', 2.2); this.audio?.sfx('checkpoint', { vol: 0.7 }); }

  respawn() {
    const c = this.checkpoint;
    const p = this.player;
    p.place(c.x, c.y + 0.1, c.z, c.yaw);
    p.safe = { x: c.x, y: c.y, z: c.z, yaw: c.yaw };
    p.invulnT = 2;
    this.sparx?.reset(2);
    this.cam.snapBehind(p);
    this.audio?.sfx('respawn');
    this.fx.puff(c.x, c.y + 0.5, c.z, 1);
  }

  onBeacon(b, n) {
    const isLast = n >= 5;
    this.hud.pulse('beacons');
    this.hud.banner(`${b.def.name} LIT!`, `${n} OF 5 BEACONS`, 3.4);
    if (n === 4 && this.objects?.barrier) { setTimeout(() => this.objects.openBarrier(), 1400); setTimeout(() => this.hud.banner('THE DAWN GATE OPENS!', 'CLIMB TO THE OBSERVATORY', 4), 3600); }
    if (isLast) this.emit('finale');
    else this.audio?.stinger?.('lantern');
  }

  // ---- dialogue & locks --------------------------------------------------------------------------------------------------
  startDialogue(name, pages, onDone) {
    this.locked = true;
    this.player.locked = true;
    this.audio?.duck?.(0.45, 1.5);
    this.audio?.sfx('dialog_open', { vol: 0.6 });
    this.hud.dialogue(name, pages, () => { this.locked = false; this.player.locked = false; onDone?.(); });
  }

  fadeTo(a, speed = 2) { this.fade.target = a; this.fade.speed = speed; }

  // ---- loop ------------------------------------------------------------------------------------------------------------------
  /** Advance by `dt` real seconds (fixed-step internally), then update camera/environment/HUD. */
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.frames++;
    if (!this.externalPoll) this.input.poll();
    if (this.paused) { this.frame(dt, this._alpha || 0, true); return; }
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 6) {
      this.step(STEP);
      this.input.endStep();
      this.acc -= STEP;
      steps++;
    }
    if (steps === 6) this.acc = 0;
    this._alpha = this.acc / STEP;
    this.frame(dt, this._alpha, false);
  }

  step(dt) {
    this.time += dt;
    const p = this.player;
    if (this.mode === 'play' || this.mode === 'complete') this.stats.time += dt;
    p.update(dt, this.input, this.cam.yaw);
    // flame breath particles
    if (p.flameT > 0 && !p.dead) this.fx.flameBreath(p.mouth.x, p.mouth.y, p.mouth.z, p.dirx, p.dirz, 1);
    for (const s of this.systems) if (s.update) s.update(dt, this);
    this.hud.update(dt, this.input);
    // day follows its target smoothly (sunrise progression)
    const k = 1 - Math.exp(-dt * (this.mode === 'finale' ? 0.35 : 0.75));
    this.day += (this.dayTarget - this.day) * k;
    // death -> fade -> respawn
    if (p.dead) {
      this.deathT += dt;
      if (this.deathT > 1.3 && this.fade.target === 0) this.fadeTo(1, 2.6);
      if (this.deathT > 2.2) { this.respawn(); this.fadeTo(0, 2.2); this.deathT = 0; }
    }
    // looping sounds tied to abilities
    this._loops(p);
  }

  _loops(p) {
    const a = this.audio;
    if (!a) return;
    const want = { glide: p.gliding && !p.dead, charge: p.chargeT > 0, flame: p.flameT > 0 };
    const names = { glide: 'glide_loop', charge: 'charge_loop', flame: 'flame_loop' };
    for (const k of Object.keys(want)) {
      if (want[k] && !this.loops[k]) this.loops[k] = a.loop(names[k], { vol: k === 'glide' ? 0.5 : 0.6 });
      else if (!want[k] && this.loops[k]) { this.loops[k].stop(0.12); this.loops[k] = null; }
    }
  }

  frame(dt, alpha, paused) {
    const p = this.player;
    p.syncModel(alpha);
    this.cam.update(paused ? 0 : dt, this.input, p, alpha);
    // blob shadow under the hero
    const sh = this.shadow;
    const rp = p.renderPos(alpha, this._rp || (this._rp = {}));
    const gy = p.groundKind === 'collider' ? p.y : this.collision.support(rp.x, rp.z, rp.y + 0.5, 0.5).y;
    sh.x = rp.x; sh.z = rp.z; sh.y = gy + 0.08;
    const h = Math.max(0, rp.y - gy);
    sh.r = 0.85 + h * 0.06; sh.alpha = Math.max(0.15, 0.85 - h * 0.09);
    sh.visible = !p.dead || p.deadT < 1.4;
    if (!paused) for (const s of this.systems) if (s.frame) s.frame(dt, alpha, this);
    this.world.updateEnvironment(this.camera, this.day, this.time, dt);
    this.fx.update(paused ? 0 : dt, this.camera);
    this.audio?.setDay?.(this.day);
    // fade overlay
    const f = this.fade;
    f.a += Math.sign(f.target - f.a) * Math.min(Math.abs(f.target - f.a), f.speed * dt);
    this.gfx.fade.set(0, 0, 0, f.a);
    this.hud.draw(this.gfx.hud);
  }
}
