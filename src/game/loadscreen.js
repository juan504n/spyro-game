// THE LOADING SCREEN between worlds (the PS1 game's "Returning Home..."): the painted sky of the place he is going to, Spyro gliding over it, a stream of gems arcing from him into an open chest, and
// the treasure found counted up beside it. It is a little 3D scene of its own (the real Sky, the real hero and gem models) that the app draws while the next world is built; the words are the retro HUD's.
//   const ls = new LoadScreen(app.assets, app.gfx, { title: 'RETURNING HOME...', treasure: 125, total: 1920, env, restored })
//   each frame: ls.update(dt, { frac, label })      when the world is built: await ls.finish()  (it stays for a moment so that the gems are seen, then goes to white)
import * as THREE from 'three';
import { U } from '../engine/materials.js';
import { Builder } from '../engine/builder.js';
import { drawText } from '../engine/textures/font.js';
import { DEFAULT_ENVIRONMENT } from '../engine/lighting.js';
import { gemGeometry, GEM_TYPES } from './systems/gems.js';
import { makeModel } from './models/fallback.js';
import { Sky } from './sky.js';
import { GLOAMING } from './skybox/specs.js';

const GOLD = ['#fff4b0', '#ffc03c', '#e07818'];
const INK = '#120c1c';
const POOL = 48;
const FADE_IN = 0.55, FADE_OUT = 0.5;
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const dummy = new THREE.Object3D();
const color = new THREE.Color();

// where things stand in the camera's own space (x right, y up, -z ahead), 16 m in front of it
const Z = -16;
const SPYRO = new THREE.Vector3(-3.8, 1.5, Z);
const CHEST = new THREE.Vector3(2.6, -4.6, Z);
const MOUTH = new THREE.Vector3(2.6, -3.3, Z + 0.4);

/** an open chest of pale gold: four walls, a floor, and the lid thrown back on its hinge */
function chestGeometry() {
  const b = new Builder({ lit: false });
  const W = 3.6, H = 1.9, D = 2.2, t = 0.16;
  const front = [0.9, 0.84, 0.56], side = [0.64, 0.56, 0.34], top = [0.96, 0.93, 0.76], dark = [0.34, 0.24, 0.14], back = [0.62, 0.52, 0.3];
  b.box(0, H / 2, 0, W, H, D, { faces: ['+z', '+x', '-x', '-z', '-y'], colors: { '+z': front, '+x': side, '-x': side, '-z': back, '-y': dark } });
  // the inside: the walls' inner faces and a dark floor a little below the rim
  b.box(0, H / 2, 0, W - 2 * t, H - 0.04, D - 2 * t, { faces: ['+z', '-z', '+x', '-x'], colors: { '+z': back, '-z': front, '+x': side, '-x': side }, flip: true });
  b.quad([-W / 2 + t, H * 0.82, D / 2 - t], [W / 2 - t, H * 0.82, D / 2 - t], [W / 2 - t, H * 0.82, -D / 2 + t], [-W / 2 + t, H * 0.82, -D / 2 + t], { color: dark });
  // the rim
  b.quad([-W / 2, H, D / 2], [W / 2, H, D / 2], [W / 2 - t, H, D / 2 - t], [-W / 2 + t, H, D / 2 - t], { color: top });
  b.quad([W / 2, H, -D / 2], [-W / 2, H, -D / 2], [-W / 2 + t, H, -D / 2 + t], [W / 2 - t, H, -D / 2 + t], { color: top });
  b.quad([W / 2, H, D / 2], [W / 2, H, -D / 2], [W / 2 - t, H, -D / 2 + t], [W / 2 - t, H, D / 2 - t], { color: top });
  b.quad([-W / 2, H, -D / 2], [-W / 2, H, D / 2], [-W / 2 + t, H, D / 2 - t], [-W / 2 + t, H, -D / 2 + t], { color: top });
  // the lid, hinged along the back edge and thrown open past upright
  b.push().translate(0, H, -D / 2).rotateX(-1.95);
  b.box(0, 0.12, D / 2, W, 0.24, D, { colors: { '+y': top, '-y': dark, '+z': front, '-z': back, '+x': side, '-x': side } });
  b.pop();
  return b.build();
}

export class LoadScreen {
  /**
   * @param {object} o { title, treasure (what was found in the level he leaves), total (all he has saved: shown when nothing was found), env (the level environment of the place he goes to: its sky),
   *   restored (that place is a realm he has saved: its dawn sky), minT (seconds it stays at least) }
   */
  constructor(assets, gfx, o) {
    this.assets = assets;
    this.gfx = gfx;
    this.title = o.title;
    this.treasure = Math.max(0, o.treasure | 0);
    this.total = Math.max(0, o.total | 0);
    this.t = 0;
    this.fade = 1;
    this.closing = -1;
    this.shown = 0;
    this.landed = 0;
    this.minT = o.minT ?? (this.treasure > 0 || this.total > 0 ? 2.1 : 1.1);          // (long enough for the count to climb to what it shows)
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, gfx.W / gfx.H, 0.5, 1500);
    this.scene.add(this.camera);
    const env = o.env || DEFAULT_ENVIRONMENT;
    const specs = env.skybox || (env === DEFAULT_ENVIRONMENT ? GLOAMING : null);
    this.sky = specs ? new Sky(assets, { specs, fogs: env.sky.map((p) => p.fog), size: 128 }) : null;
    this.mood = o.restored ? 1 : 0;
    this.fog = env.sky && env.sky[this.mood] ? env.sky[this.mood].fog : null;
    if (this.sky) this.scene.add(this.sky.group);
    // looking at the glow of the sky (the first wash of the mood) a little above the horizon, so that the ground's colour fills the bottom third as in the game's own
    const wash = specs && specs[this.mood].washes && specs[this.mood].washes[0];
    const az = ((wash ? wash.az : 0) * Math.PI) / 180, pit = (11 * Math.PI) / 180;
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(Math.cos(az) * Math.cos(pit) * 100, Math.sin(pit) * 100, Math.sin(az) * Math.cos(pit) * 100);
    this.camera.updateMatrixWorld(true);
    this.rig = new THREE.Group();
    this.camera.add(this.rig);
    // the hero, gliding
    this.hero = makeModel(assets, 'spyro');
    this.hero.root.scale.setScalar(1.55);
    this.hero.root.position.copy(SPYRO);
    this.hero.root.rotation.y = -0.9;
    this.rig.add(this.hero.root);
    // the chest
    const chestMat = assets.mat(null, { day: false, fog: false, unique: true, double: true });
    this.chest = new THREE.Mesh(chestGeometry(), chestMat);
    this.chest.position.copy(CHEST);
    this.chest.rotation.set(0.28, -0.42, 0);
    this.chest.frustumCulled = false;
    this.rig.add(this.chest);
    this.chestMat = chestMat;
    // what has landed in it lies in the chest
    this.gemMat = assets.mat(null, { gem: true, day: false, unique: true, fog: false });
    this.pile = new THREE.InstancedMesh(gemGeometry(), this.gemMat, 16);
    this.pile.frustumCulled = false;
    this.pile.count = 0;
    this.chest.add(this.pile);
    this.pileSeed = Array.from({ length: 16 }, (_, i) => ({ x: ((i * 0.618) % 1 - 0.5) * 2.1, z: (((i * 0.37) % 1) - 0.5) * 0.9, y: 1.62 + (i % 3) * 0.16, r: i * 1.9, c: [GEM_TYPES[1], GEM_TYPES[2], GEM_TYPES[5], GEM_TYPES[1], GEM_TYPES[10]][i % 5].color }));
    // the gems
    this.gems = new THREE.InstancedMesh(gemGeometry(), this.gemMat, POOL);
    this.gems.frustumCulled = false;
    dummy.scale.setScalar(0); dummy.updateMatrix();
    for (let i = 0; i < POOL; i++) { this.gems.setMatrixAt(i, dummy.matrix); this.gems.setColorAt(i, color.setRGB(1, 1, 1)); }
    this.rig.add(this.gems);
    this.pool = Array.from({ length: POOL }, () => ({ alive: false }));
    this.spawnT = 0.15;
    this.bump = 0;
    this.sfxN = 0;
    this.audio = o.audio || null;
    this.seed = 7;
  }

  _rnd() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }

  _spawn() {
    const g = this.pool.find((p) => !p.alive);
    if (!g) return;
    const r = this._rnd, T = [GEM_TYPES[1], GEM_TYPES[1], GEM_TYPES[1], GEM_TYPES[2], GEM_TYPES[2], GEM_TYPES[5], GEM_TYPES[10]];
    const type = T[Math.floor(this._rnd() * T.length)];
    g.alive = true; g.t = 0; g.d = 1.5 + this._rnd() * 0.9;
    g.sx = SPYRO.x + (this._rnd() - 0.5) * 2.4; g.sy = SPYRO.y + (this._rnd() - 0.2) * 2.2; g.sz = Z + (this._rnd() - 0.5) * 2;
    g.ex = MOUTH.x + (this._rnd() - 0.5) * 1.6; g.ey = MOUTH.y; g.ez = MOUTH.z + (this._rnd() - 0.5) * 0.8;
    g.h = 1.5 + this._rnd() * 3.6; g.sw = (this._rnd() - 0.5) * 3.2; g.spin = this._rnd() * 6.28; g.ws = 2.5 + this._rnd() * 4;
    g.size = 0.78 + type.size * 0.4; g.type = type;
    void r;
  }

  /** (seconds the screen has been up, and the world he comes to may now be shown: it has been up for its minimum) */
  get ready() { return this.t >= this.minT; }

  update(dt, load) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const camera = this.camera, gfx = this.gfx;
    camera.aspect = gfx.W / gfx.H;
    camera.updateProjectionMatrix();
    if (this.sky) this.sky.update(camera, { ease: this.mood }, this.t, dt);
    // the hero is lit here, not by the world he has left: a warm sun from the upper left and a soft violet sky; what is not sky is the sky's fog
    U.uSunDir.value.set(-0.45, 0.7, 0.55).normalize();
    U.uSunCol.value.setRGB(1.0, 0.92, 0.8);
    U.uAmb.value.setRGB(0.78, 0.72, 0.86);
    if (this.fog) U.uFogColor.value.setRGB(this.fog[0], this.fog[1], this.fog[2]);
    // the hero glides: a slow float and a bank, wings spread
    const t = this.t;
    this.hero.root.position.set(SPYRO.x + Math.sin(t * 0.7) * 0.5, SPYRO.y + Math.sin(t * 1.3) * 0.35, SPYRO.z);
    this.hero.root.rotation.set(0.3 + 0.1 * Math.sin(t * 0.9), -0.9 + 0.2 * Math.sin(t * 0.6), 0.14 * Math.sin(t * 1.1));
    this.hero.update(dt, { grounded: false, glide: 1, speed: 4, vy: -1, turn: 0.4 * Math.sin(t * 0.8), t });
    // the count: up to what was found over the first seconds
    const target = this.treasure > 0 ? this.treasure : this.total;
    this.shown = Math.round(target * smooth((t - 0.35) / 1.5));
    // the stream: a gem leaves him every so often (faster while the count climbs)
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this._spawn(); this.spawnT = (this.shown < target ? 0.07 : 0.28) + this._rnd() * 0.08; }
    // the gems
    for (let i = 0; i < POOL; i++) {
      const g = this.pool[i];
      if (!g.alive) continue;
      g.t += dt;
      const u = Math.min(1, g.t / g.d), e = Math.pow(u, 1.25);
      if (u >= 1) {
        g.alive = false; this.bump = 1; this.landed++;
        if (this.pile.count < 16) { const k = this.pileSeed[this.pile.count]; dummy.position.set(k.x, k.y, k.z); dummy.rotation.set(0.3, k.r, 0.4); dummy.scale.setScalar(0.62); dummy.updateMatrix(); this.pile.setMatrixAt(this.pile.count, dummy.matrix); this.pile.setColorAt(this.pile.count, color.setRGB(k.c[0], k.c[1], k.c[2])); this.pile.count++; this.pile.instanceMatrix.needsUpdate = true; if (this.pile.instanceColor) this.pile.instanceColor.needsUpdate = true; }
        dummy.scale.setScalar(0); dummy.updateMatrix(); this.gems.setMatrixAt(i, dummy.matrix);
        if (this.audio && this.treasure > 0 && ++this.sfxN % 4 === 0) this.audio.sfx('gem_red', { vol: 0.28, pitch: 0.9 + this._rnd() * 0.5 });
        continue;
      }
      const x = g.sx + (g.ex - g.sx) * e + Math.sin(u * 6.28 + g.spin) * g.sw * (1 - u) * 0.6;
      const y = g.sy + (g.ey - g.sy) * e + g.h * 4 * u * (1 - u);
      const z = g.sz + (g.ez - g.sz) * e;
      dummy.position.set(x, y, z);
      dummy.rotation.set(g.spin * 0.3 + g.t * 1.3, g.spin + g.t * g.ws, g.t * 0.9);
      const grow = Math.min(1, g.t * 6), shrink = u > 0.9 ? (1 - u) * 10 : 1;
      dummy.scale.setScalar(g.size * grow * shrink);
      dummy.updateMatrix();
      this.gems.setMatrixAt(i, dummy.matrix);
      this.gems.setColorAt(i, color.setRGB(g.type.color[0], g.type.color[1], g.type.color[2]));
    }
    this.gems.instanceMatrix.needsUpdate = true;
    if (this.gems.instanceColor) this.gems.instanceColor.needsUpdate = true;
    this.bump = Math.max(0, this.bump - dt * 5);
    this.chest.scale.set(1 + this.bump * 0.04, 1 - this.bump * 0.05, 1);
    // white at the start (the trip came in through white) and at the end
    const fin = 1 - smooth(this.t / FADE_IN);
    const fout = this.closing >= 0 ? smooth((this.t - this.closing) / FADE_OUT) : 0;
    this.fade = Math.max(fin, fout);
    gfx.fade.set(1, 1, 1, this.fade);
    this._words(load);
  }

  /** the words, in the retro HUD: the title over the top, the treasure by the chest, what is being built under it */
  _words(load) {
    const pix = this.gfx.hud, W = pix.w, H = pix.h;
    const show = 1 - Math.min(1, this.fade * 1.4);
    if (show <= 0.02) return;
    drawText(pix, this.title, W >> 1, Math.round(H * 0.075), { style: 'grad', scale: 2, align: 'center', colors: GOLD, outlineColor: INK });
    const v = CHEST.clone(); this.rig.localToWorld(v); v.project(this.camera);
    const cx = Math.round((v.x * 0.5 + 0.5) * W), cy = Math.round((-v.y * 0.5 + 0.5) * H);
    const label = this.treasure > 0 ? 'TREASURE\nFOUND' : 'TOTAL\nTREASURE';
    drawText(pix, label, cx - Math.round(W * 0.13), cy - 14, { style: 'grad', scale: 2, align: 'right', colors: GOLD, outlineColor: INK });
    drawText(pix, String(this.shown), cx + Math.round(W * 0.12), cy - 8, { style: 'grad', scale: 3, align: 'left', colors: GOLD, outlineColor: INK });
    if (load) {
      // a thin line under it all: how far the world is built, and what is being made
      const bw = Math.round(W * 0.34), bx = Math.round(W * 0.05), by = H - 9;
      pix.rect(bx - 1, by - 1, bw + 2, 4, INK);
      pix.rect(bx, by, bw, 2, '#3e2a64');
      pix.rect(bx, by, Math.round(bw * Math.min(1, load.frac || 0)), 2, '#ffc03c');
      if (load.label) drawText(pix, load.label, bx, by - 10, { style: 'outline', align: 'left', color: '#f4eeff', outlineColor: INK });
    }
  }

  /** the world is built: stay until the gems have been seen, then go to white (resolves when the screen is white) */
  async finish() {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    while (this.t < this.minT) await sleep(30);
    this.closing = this.t;
    while (this.t < this.closing + FADE_OUT + 0.05) await sleep(30);
  }

  dispose() {
    this.gems.geometry.dispose();
    this.gems.dispose();
    this.chest.geometry.dispose();
    this.pile.geometry.dispose();
    this.pile.dispose();
    this.sky?.dispose();
    this.sky?.domeGeo?.dispose();
    this.hero?.dispose?.();
    this.gemMat.dispose();
    this.chestMat.dispose();
  }
}
