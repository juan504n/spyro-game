// Application flow: loading -> title -> intro fly-through -> play <-> pause -> finale (sunrise) -> results -> free roam.
import * as THREE from 'three';
import { Game } from './game.js';
import { populate } from './levelgen/index.js';
import { Menu } from './menu.js';
import { Hud } from './hud.js';
import { titleShot, introShot, finaleShot } from './cinematics.js';
import { makeLogo, drawPanel } from '../engine/textures/ui.js';
import { drawText } from '../engine/textures/font.js';
import { U } from '../engine/materials.js';

const GOLD = ['#fff4b0', '#ffc03c', '#e07818'];
const LILAC = ['#f4eeff', '#b8a8e8'];
const INK = '#120c1c';
/** the confirm control's name for whatever the player is using right now */
const confirmName = (input) => (input.lastDevice === 'touch' ? 'TAP' : input.lastDevice === 'pad' ? 'A' : 'ENTER');
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Unlit copy of an icon (empty star slots on the results screen). */
function dimIcon(src) {
  const c = src.clone(), d = c.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
    d[i] = 30 + l * 34; d[i + 1] = 22 + l * 26; d[i + 2] = 64 + l * 44;
  }
  return c;
}

// import.meta.glob tolerates a missing file (dev) and is replaced by a static import for the single-file build
const audioModules = import.meta.glob('../engine/audio/audio.js');

async function loadAudio() {
  try {
    const loader = Object.values(audioModules)[0];
    if (!loader) return null;
    const mod = await loader();
    return mod.audio || null;
  } catch (e) {
    console.warn('audio module unavailable:', e && e.message);
    return null;
  }
}

class App {
  constructor(gfx, params) {
    this.gfx = gfx;
    this.params = params;
    this.state = 'loading';
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, gfx.W / gfx.H, 0.4, 1600);
    this.load = { frac: 0, label: 'LOADING' };
    this.t = 0;
    this.game = null;
    this.audio = null;
    this.logo = null;
    this.audioReady = false;
    this.results = null;
    this.deferReady = true;
  }

  async start() {
    const gfx = this.gfx;
    this.audio = await loadAudio();
    const game = new Game(gfx, { populate, audio: this.audio });
    this.game = game;
    await game.build((frac, label) => { this.load = { frac, label }; return new Promise((r) => setTimeout(r, 16)); });
    game.externalPoll = true;
    game.resize(gfx.W, gfx.H);
    this.scene = game.scene;
    this.camera = game.camera;
    this.menu = new Menu(game);
    try { this.logo = makeLogo(['GLOAMING', 'VALE'], { scale: [4, 4], top: '#fff4b0', bottom: '#f0901c', wobble: 1 }); } catch (e) { console.warn('logo failed', e); }
    game.on('finale', () => this.startFinale());
    window.__game = game;
    window.__app = this;
    // first user gesture unlocks audio
    game.input.onGesture = () => this.unlockAudio();

    const q = this.params;
    if (q.has('day')) { game.day = game.dayTarget = parseFloat(q.get('day')); }
    if (q.has('at')) {
      const [x, z, yaw] = q.get('at').split(',').map(Number);
      game.player.place(x, game.grid.heightAt(x, z) + 0.05, z, yaw ?? 0);
      game.checkpoint = { x, y: game.player.y, z, yaw: yaw ?? 0 };
    }
    if (q.has('skip')) this.beginPlay(true);
    else this.enterTitle();
    window.__ready = true;
  }

  unlockAudio() {
    if (this.audioReady || !this.audio) return;
    this.audioReady = true;
    const s = this.gfx.settings;
    this.audio.init?.((f) => { this.audioProgress = f; }).then(() => {
      if (!this.audio.ready) { this.audioReady = false; return; }         // failed quietly: the next gesture tries again
      this.audio.setVolumes?.({ master: 1, music: s.music, sfx: s.sfx });
      this.audio.startMusic?.();
      this.audio.setDay?.(this.game.day);
    }).catch((e) => { this.audioReady = false; console.warn('audio init failed', e); });
  }

  // ---- states ------------------------------------------------------------------------------------------------------------
  enterTitle() {
    const g = this.game;
    this.state = 'title';
    g.mode = 'title';                 // (the results timer and hint zones only run in 'play')
    g.hud.visible = false;
    g.player.locked = true;
    g.cam.playCinematic(titleShot(g), 1e9);
    g.dayTarget = 0;
  }

  startIntro() {
    const g = this.game;
    this.unlockAudio();
    this.audio?.sfx('ui_start', { vol: 0.9 });
    this.state = 'intro';
    g.mode = 'intro';
    this.introT = 0;
    g.cam.playCinematic(introShot(g), 16, () => this.beginPlay());
  }

  beginPlay(instant = false) {
    const g = this.game;
    this.state = 'play';
    g.cam.stopCinematic();
    g.cam.snapBehind(g.player);
    g.hud.visible = true;
    g.player.locked = false;
    g.locked = false;
    g.mode = 'play';
    g.fade.a = instant ? 0 : 1;
    g.fadeTo(0, 1.6);
    if (!instant) g.hud.banner('GLOAMING VALE', 'LANTERN KEEPERS REALM', 4.2);
    const dev = g.input.lastDevice;
    g.hud.hint(dev === 'touch' ? 'STICK MOVES   JUMP / GLIDE   FIRE   RAM' : dev === 'pad' ? 'STICK MOVE   A JUMP / GLIDE   X FIRE   B CHARGE' : 'WASD MOVE   SPACE JUMP / GLIDE   J FIRE   K CHARGE', 7);
  }

  startFinale() {
    const g = this.game;
    if (this.state === 'finale') return;
    this.state = 'finale';
    g.mode = 'finale';
    g.player.locked = true;
    g.player.cheer = false;
    const b = g.beacons.list.find((x) => x.def.id === 'dawn') || g.beacons.list[g.beacons.list.length - 1];
    g.dayTarget = 1;
    g.hud.hintState = null;
    this.audio?.stinger?.('sunrise');
    g.hud.banner('THE SUN RISES!', '', 4.5);
    g.after(5.2, () => { g.hud.banner('GLOAMING VALE IS SAVED', 'THANK YOU, SPYRO', 5); });
    g.cam.playCinematic(finaleShot(g, b), 13, () => this.showResults());
    g.player.cheer = true;
  }

  showResults() {
    const g = this.game;
    this.state = 'results';
    this.resultsT = 0;
    g.player.cheer = true;
    g.hud.visible = false;
    this.audio?.stinger?.('complete');
    const st = g.stats;
    const pct = st.gems / st.gemsTotal;
    this.results = { pct, stars: pct >= 0.95 ? 3 : pct >= 0.6 ? 2 : 1 };
    // hold the final wide shot of the sunrise sweep
    const shot = finaleShot(g, g.beacons.list[g.beacons.list.length - 1]);
    g.cam.playCinematic((t) => shot(t, 1), 1e9);
  }

  resumeFromResults() {
    const g = this.game;
    this.state = 'play';
    g.mode = 'complete';
    g.cam.stopCinematic();
    g.cam.snapBehind(g.player);
    g.player.locked = false;
    g.player.cheer = false;
    g.hud.visible = true;
    g.hud.banner('FREE ROAM', 'COLLECT EVERY GEM!', 3.5);
  }

  openPause() {
    const g = this.game;
    this.state = 'paused';
    g.paused = true;
    this.audio?.setMuffled?.(true);
    this.audio?.sfx('pause', { vol: 0.7 });
    g.input.releasePointer?.();
    for (const k of Object.keys(g.loops)) { g.loops[k]?.stop?.(0.08); g.loops[k] = null; }     // glide / flame / charge hums
    this.menu.open(this.pausePage());
  }

  closePause() {
    const g = this.game;
    this.menu.closeAll();
    g.paused = false;
    this.state = 'play';
    this.audio?.setMuffled?.(false);
    this.audio?.sfx('unpause', { vol: 0.7 });
    g.input.relock?.();
  }

  pausePage() {
    return {
      title: 'PAUSED', width: 210, closable: true, onBack: () => this.closePause(),
      items: [
        { type: 'action', label: 'RESUME', action: () => this.closePause() },
        { type: 'action', label: 'OPTIONS', action: (m) => m.open(this.optionsPage()) },
        { type: 'action', label: 'CONTROLS', action: (m) => m.open(this.controlsPage()) },
        { type: 'action', label: 'RESTART REALM', action: () => { location.href = location.pathname + '?skip=1'; } },
        { type: 'action', label: 'QUIT TO TITLE', action: () => { location.href = location.pathname; } },
      ],
    };
  }

  controlsPage() {
    const dev = this.game.input.lastDevice;
    const lines = dev === 'touch'
      ? ['MOVE ........ LEFT THUMB', 'JUMP ........ JUMP  (HOLD IN AIR: GLIDE)', 'FIRE ........ FIRE BUTTON', 'CHARGE ...... RAM BUTTON', 'CAMERA ...... DRAG THE RIGHT SIDE', 'TALK ........ TALK BUTTON   PAUSE ... II']
      : dev === 'pad'
        ? ['MOVE ........ LEFT STICK / D-PAD', 'JUMP ........ A  (HOLD IN AIR: GLIDE)', 'FIRE ........ X', 'CHARGE ...... B', 'CAMERA ...... RIGHT STICK / BUMPERS', 'TALK ........ RT   PAUSE ... START']
        : ['MOVE ........ WASD / ARROWS', 'JUMP ........ SPACE  (HOLD IN AIR: GLIDE)', 'FIRE ........ J / F / LEFT CLICK', 'CHARGE ...... K / SHIFT / RIGHT CLICK', 'CAMERA ...... MOUSE / Q E   R: RESET', 'TALK ........ ENTER   PAUSE ... ESC'];
    return {
      title: 'CONTROLS', width: 280, items: [{ type: 'action', label: 'BACK', action: (m) => m.close() }], footer: '',
      extra: lines,
      draw: (pix, x, y) => lines.forEach((l, i) => drawText(pix, l, x, y + i * 10, { style: 'outline', color: '#e8e0ff', outlineColor: INK })),
    };
  }

  optionsPage() {
    const gfx = this.gfx;
    const g = this.game;
    const set = (k) => (i, opts) => { gfx.set(k, opts ? opts[i] : i); };
    const pctOpts = [0, 0.5, 1];
    return {
      title: 'OPTIONS', width: 260,
      items: [
        { type: 'slider', label: 'MUSIC', get: () => gfx.settings.music, set: (v) => { gfx.set('music', v); this.audio?.setVolumes?.({ music: v }); } },
        { type: 'slider', label: 'SOUND FX', get: () => gfx.settings.sfx, set: (v) => { gfx.set('sfx', v); this.audio?.setVolumes?.({ sfx: v }); } },
        { type: 'choice', label: 'DISPLAY', options: ['4:3', 'wide'], labels: ['4:3 CLASSIC', 'WIDESCREEN'], get: () => gfx.settings.display, set: set('display') },
        { type: 'choice', label: 'SCALING', options: ['auto', 'integer', 'fill'], labels: ['AUTO', 'INTEGER', 'FILL'], get: () => gfx.settings.scaling, set: set('scaling') },
        { type: 'choice', label: 'LOOK', options: ['smooth', 'ps1', 'custom'], labels: ['SMOOTH', 'PS1 AUTHENTIC', 'CUSTOM'], get: () => gfx.look, set: (i, opts) => { if (opts[i] !== 'custom') gfx.setLook(opts[i]); } },
        { type: 'choice', label: 'RESOLUTION', options: [240, 360, 480, 720], labels: ['240P PS1', '360P', '480P', '720P'], get: () => gfx.settings.height, set: set('height') },
        { type: 'toggle', label: 'SMOOTH TEXTURES', get: () => gfx.settings.filter === 'smooth', set: (v) => gfx.set('filter', v ? 'smooth' : 'pixel') },
        { type: 'choice', label: 'CRT FILTER', options: pctOpts, labels: ['OFF', 'LIGHT', 'FULL'], get: () => gfx.settings.crt, set: set('crt') },
        { type: 'toggle', label: '15-BIT DITHER', get: () => !!gfx.settings.dither, set: (v) => gfx.set('dither', v ? 1 : 0) },
        { type: 'toggle', label: 'VERTEX WOBBLE', get: () => !!gfx.settings.snap, set: (v) => gfx.set('snap', v ? 1 : 0) },
        { type: 'choice', label: 'TEXTURE WARP', options: pctOpts.concat([]).map((v) => v), labels: ['OFF', 'HALF', 'FULL'], get: () => gfx.settings.affine, set: set('affine') },
        { type: 'toggle', label: '30 FPS LOCK', get: () => !!gfx.settings.fps30, set: (v) => gfx.set('fps30', v) },
        { type: 'toggle', label: 'INVERT CAMERA Y', get: () => !!gfx.settings.invertY, set: (v) => gfx.set('invertY', v) },
        { type: 'action', label: 'BACK', action: (m) => m.close() },
      ],
      footer: 'LEFT / RIGHT TO CHANGE',
    };
  }

  // ---- per-frame ---------------------------------------------------------------------------------------------------------------
  update(dt) {
    this.t += dt;
    const gfx = this.gfx;
    if (this.state === 'loading') {
      Hud.drawLoading(gfx.hud, this.load.frac, this.load.label);
      return;
    }
    const g = this.game;
    const input = g.input;
    input.poll();
    const snap = input.snapshot();       // UI-level presses, captured before the sim consumes them
    // menus swallow input and freeze the sim
    if (this.state === 'paused') {
      g.update(dt);
      this.menu.update(dt, input, snap);
      this._drawMenus();
      if (!this.menu.active && this.state === 'paused') this.closePause();
      input.endStep();
      return;
    }
    g.update(dt);

    switch (this.state) {
      case 'title': {
        this._drawTitle();
        if (snap.confirm || snap.jump || snap.flame || (input.lastDevice === 'touch' && input.takeAnyKey())) this.startIntro();
        else if (snap.pause) { this.menu.open(this.optionsPage()); this.state = 'title-options'; }
        break;
      }
      case 'title-options': {
        this.menu.update(dt, input, snap);
        this._drawTitle(true);
        this._drawMenus();
        if (!this.menu.active) this.state = 'title';
        break;
      }
      case 'intro': {
        this.introT += dt;
        this._drawIntro();
        if (this.introT > 1 && (snap.confirm || snap.jump)) { g.cam.stopCinematic(); this.beginPlay(); }
        break;
      }
      case 'play': {
        if (snap.pause && !g.hud.talking) this.openPause();
        break;
      }
      case 'finale': break;
      case 'results': {
        this.resultsT += dt;
        this._drawResults();
        if (this.resultsT > 1.2 && (snap.confirm || snap.jump)) this.resumeFromResults();
        break;
      }
      default: break;
    }
    U.uWind.value = 1;
  }

  _drawMenus() {
    const pix = this.gfx.hud;
    this.menu.draw(pix);
    const page = this.menu.stack[this.menu.stack.length - 1];
    if (page && page.draw) {
      const L = this.menu.layout(pix.w, pix.h, page, page.items);
      page.draw(pix, L.x + 12, L.y + 24);
    }
  }

  _drawTitle(dim = false) {
    const pix = this.gfx.hud, W = pix.w, H = pix.h;
    if (this.logo) {
      const bob = Math.round(Math.sin(this.t * 1.6) * 1.5);
      pix.blit(this.logo, (W - this.logo.w) >> 1, Math.round(H * 0.08) + bob);
    }
    drawText(pix, 'SPYRO', W >> 1, Math.round(H * 0.08) - 2, { style: 'grad', scale: 1, align: 'center', colors: ['#f4eeff', '#b98cff', '#7c3ec8'], outlineColor: INK });
    drawText(pix, 'A LANTERN KEEPERS DLC REALM', W >> 1, Math.round(H * 0.08) + (this.logo ? this.logo.h + 2 : 60), { style: 'grad', align: 'center', colors: LILAC, outlineColor: INK });
    if (!dim && Math.floor(this.t * 2) % 2 === 0) {
      const touch = !!this.game.input.touch || this.game.input.lastDevice === 'touch';
      const pad = this.game.input.lastDevice === 'pad';
      drawText(pix, touch ? 'TAP TO START' : pad ? 'PRESS A' : 'PRESS ENTER', W >> 1, Math.round(H * 0.74), { style: 'grad', scale: 2, align: 'center', colors: GOLD, outlineColor: INK });
      if (!touch && !pad) drawText(pix, 'OR CLICK', W >> 1, Math.round(H * 0.74) + 24, { style: 'outline', align: 'center', color: '#c8bce8', outlineColor: INK });
    }
    drawText(pix, this.game.input.touch ? 'II: OPTIONS' : 'ESC: OPTIONS', W >> 1, H - 24, { style: 'outline', align: 'center', color: '#c8bce8', outlineColor: INK });
    drawText(pix, 'FAN-MADE TRIBUTE  -  NOT AFFILIATED WITH ACTIVISION', W >> 1, H - 12, { style: 'outline', align: 'center', color: '#8a7cb8', outlineColor: INK });
  }

  _drawIntro() {
    const pix = this.gfx.hud, W = pix.w, H = pix.h;
    // letterbox bars like a PS1 cutscene, with the captions living inside the bottom bar
    const bar = Math.min(30, Math.round(this.introT * 40));
    pix.rect(0, 0, W, bar, '#000000'); pix.rect(0, H - bar, W, bar, '#000000');
    const t = this.introT;
    const y0 = H - 28;
    if (t > 0.8 && t < 4.6) drawText(pix, 'GLOAMING VALE', W >> 1, y0 + 5, { style: 'grad', scale: 2, align: 'center', colors: GOLD, outlineColor: INK });
    else if (t >= 4.6 && t < 8.6) drawText(pix, 'THE SNUFFERS HAVE STOLEN THE SUNRISE', W >> 1, y0 + 10, { style: 'outline', align: 'center', color: '#f4eeff', outlineColor: INK });
    else if (t >= 8.6 && t < 12.6) drawText(pix, 'RELIGHT THE FIVE BEACON LANTERNS', W >> 1, y0 + 10, { style: 'outline', align: 'center', color: '#ffe27a', outlineColor: INK });
    else if (t >= 12.6) drawText(pix, 'FOLLOW THE BEAMS OF LIGHT', W >> 1, y0 + 10, { style: 'outline', align: 'center', color: '#f4eeff', outlineColor: INK });
    if (t > 1.5) drawText(pix, `${this.game.input.lastDevice === 'touch' ? 'TAP' : this.game.input.lastDevice === 'pad' ? 'PRESS A' : 'PRESS ENTER'} TO SKIP`, W - 6, 5, { style: 'outline', align: 'right', color: '#c8bce8', outlineColor: INK });
  }

  _drawResults() {
    const pix = this.gfx.hud, W = pix.w, H = pix.h;
    const g = this.game, st = g.stats;
    const w = 220, h = 138, x = (W - w) >> 1, y = (H - h) >> 1;
    drawPanel(pix, x, y, w, h, { style: 'menu' });
    drawText(pix, 'REALM RESTORED!', W >> 1, y + 9, { style: 'grad', scale: 2, align: 'center', colors: GOLD, outlineColor: INK });
    const rows = [
      ['GEMS', `${st.gems} / ${st.gemsTotal}`],
      ['BEACONS', `${st.beacons} / 5`],
      ['SNUFFERS', String(st.enemies)],
      ['BUNNIES', String(st.bunnies)],
      ['SECRETS', String(st.walls + st.chests)],
      ['TIME', fmtTime(st.time)],
    ];
    rows.forEach(([k, v], i) => {
      drawText(pix, k, x + 22, y + 34 + i * 12, { style: 'outline', color: '#c8bce8', outlineColor: INK });
      drawText(pix, v, x + w - 22, y + 34 + i * 12, { style: 'outline', color: '#fff4b0', outlineColor: INK, align: 'right' });
    });
    const icons = g.hud.icons;
    for (let i = 0; i < 3; i++) {
      const on = i < this.results.stars && this.resultsT > 0.5 + i * 0.4;
      const ic = icons.star;
      if (ic) {
        if (!this._dimStar) this._dimStar = dimIcon(ic);
        pix.blit(on ? ic : this._dimStar, W / 2 - 24 + i * 16, y + h - 26);
      }
    }
    if (this.resultsT > 1.2 && Math.floor(this.t * 2) % 2 === 0) drawText(pix, `${confirmName(this.game.input)}: KEEP EXPLORING`, W >> 1, y + h - 10, { style: 'outline', align: 'center', color: '#ffe27a', outlineColor: INK });
  }
}

export async function create(gfx, params) {
  const app = new App(gfx, params);
  app.start().catch((e) => { console.error(e); window.__error = String((e && e.stack) || e); });
  window.__app = app;
  return app;
}
