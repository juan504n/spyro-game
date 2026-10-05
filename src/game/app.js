// Application flow: loading -> title -> intro fly-through -> play <-> pause -> finale (sunrise) -> results -> free roam.
import * as THREE from 'three';
import { Game } from './game.js';
import { REALMS, songOf } from './realms.js';
import { Assets } from './assets.js';
import { Input } from './input.js';
import { loadProgress, noteRealmDone, noteRealmGems, noteSecret, realmsDone, noteGateOpen, allRestored, noteGuardianFreed } from './progress.js';
import { DOORS, SECRETS } from './home/level.js';
import { TRAVEL, heroSpot } from './travel.js';
import { WARD_RADIUS } from './level.js';
import { Menu, touchClear } from './menu.js';
import { CAM_MODES } from './camera.js';
import { Hud } from './hud.js';
import { DebugHud } from './debug.js';
import { titleShot, introShot, finaleShot, gateShot } from './cinematics.js';
import { SPEECH, creditsLines, lineHeight, endingShot } from './ending.js';
import { makeLogo, drawPanel } from '../engine/textures/ui.js';
import { drawText } from '../engine/textures/font.js';
import { U, setTextureHD } from '../engine/materials.js';
import { HD } from '../engine/textures/hd/index.js';

const GOLD = ['#fff4b0', '#ffc03c', '#e07818'];
const LILAC = ['#f4eeff', '#b8a8e8'];
const INK = '#120c1c';
/** seconds the hero blinks untouchable after the TRAVEL menu has brought him somewhere (as after a respawn): a Snuffer that notices him as he arrives does not get a free hit */
const WARP_GRACE = 3;
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
    this.progress = loadProgress();          // the realms restored and the secrets found, kept between visits (progress.js)
    this.travel = null;                      // a trip through a portal in progress: { id (where to), from, phase: 'out' | 'load', color }
  }

  /** the frame size changed (called by main.js after Gfx re-created its targets): keep the 3D counter matched to it */
  onResize(W, H) { this.game?.counter?.resize(this.gfx.hud.w, W / H); }

  async start() {
    const gfx = this.gfx;
    this.audio = await loadAudio();
    this.assets = new Assets();
    this.input = new Input(gfx.canvas);          // (the page's: the controls and the listeners outlive any one world)
    const q = this.params;
    const first = REALMS[q.get('world')] ? q.get('world') : 'gloaming';          // (?world=home, ?world=frostbloom ...: any world of the game by its id)
    const game = await this._build(first, null);
    this._adopt(game);
    try { this.logo = makeLogo(['GLOAMING', 'VALE'], { scale: [4, 4], top: '#fff4b0', bottom: '#f0901c', wobble: 1 }); } catch (e) { console.warn('logo failed', e); }
    window.__app = this;

    if (q.has('day') && game.realm.day === null) { game.day = game.dayTarget = parseFloat(q.get('day')); }
    if (q.has('at')) {
      const [x, z, yaw] = q.get('at').split(',').map(Number);
      game.player.place(x, game.grid.heightAt(x, z) + 0.05, z, yaw ?? 0);
      game.checkpoint = { x, y: game.player.y, z, yaw: yaw ?? 0 };
    }
    if (q.has('skip')) this.beginPlay(true);
    else if (first !== 'gloaming') this.beginPlay(false);        // (the title screen belongs to Gloaming Vale: every other world is entered straight away)
    else this.enterTitle();
    window.__ready = true;
  }

  /** Build the world of a realm (REALMS id) on the page's shared input, assets and audio, painting the loading bar as it goes. */
  async _build(id, from, rematch = false) {
    const gfx = this.gfx;
    // a realm the hero has saved is found restored when he comes back to it through the homeworld (Game._restore); started from the title it is played afresh
    const restored = REALMS[id].kind === 'realm' && from === 'home' && !!(this.progress.realms[id] && this.progress.realms[id].done);
    const gate = REALMS[id].kind === 'homeworld' ? this._gateMode(from) : null;
    const freed = REALMS[id].kind === 'arena' && !!this.progress.guardian.freed && !rematch;      // (the Guardian's Court after the ending: he sits quiet on his dais; THE FIGHT AGAIN of the TRAVEL menu builds it as it was, and what is saved stays saved)
    // (what the world needs that is not made at start-up is made first, behind its loading bar: the Guardian's sounds in the Court, and the song of every world the hero has not been in lately)
    const audio = this.audio;
    const song = songOf(REALMS[id]);
    const steps = [];
    if (REALMS[id].kind === 'arena' && audio && audio.load) steps.push({ label: 'TUNING THE COURT', w: 0.25, run: (cb) => audio.load('guardian', cb) });
    if (REALMS[id].kind === 'realm' && audio && audio.load) steps.push({ label: 'WAKING THE FOES', w: 0.1, run: (cb) => audio.load('foes', cb) });
    if (REALMS[id].kind === 'realm' && audio && audio.load) steps.push({ label: 'LAYING THE TRIALS', w: 0.1, run: (cb) => audio.load('trials', cb) });
    if (audio && audio.loadSong) {
      if (audio.ready && audio.songIds && audio.songIds.includes(song) && !audio.hasSong(song)) steps.push({ label: 'TUNING THE BAND', w: 0.2, run: (cb) => audio.loadSong(song, cb) });
      else if (!audio.ready) audio.setSong?.(song);                       // (the audio is not up yet: init() makes the song of the world the hero is in, behind its own bar)
    }
    let pre = 0;
    for (const s of steps) {
      this.load = { frac: pre, label: s.label };
      await s.run((f) => { this.load = { frac: pre + f * s.w, label: s.label }; });
      pre += s.w;
    }
    const game = new Game(gfx, { realm: REALMS[id], assets: this.assets, audio: this.audio, input: this.input, progress: this.progress, from, restored, gate, freed });
    await game.build((frac, label) => { this.load = { frac: pre + frac * (1 - pre), label }; return new Promise((r) => setTimeout(r, 16)); });
    game.externalPoll = true;
    game.resize(gfx.W, gfx.H);
    game.counter.resize(gfx.hud.w, gfx.W / gfx.H);
    return game;
  }

  /**
   * What the Guardian's Gate of Dawnhaven is when the hero comes in: shut (a realm still sleeps or burns no more than before), open (he has seen it open, or he comes by the title's visit or the TRAVEL
   * menu: no ceremony, it stands open), or about to open before his eyes ('ceremony': every realm burns now and he comes home from a realm).
   */
  _gateMode(from) {
    const doors = DOORS.filter((d) => d.target).map((d) => d.target);
    if (!allRestored(this.progress, doors)) return null;
    if (this.progress.home.gate) return 'open';
    if (from && REALMS[from] && REALMS[from].kind === 'realm') return 'ceremony';
    noteGateOpen(this.progress);
    return 'open';
  }

  /** Make a built world the one on screen: what the renderer draws, the menus, the debug readout and the events the app answers. */
  _adopt(game) {
    this.game = game;
    this.scene = game.scene;
    this.camera = game.camera;
    this.overlay = game.overlay;
    this.menu = new Menu(game);
    if (this.debug) this.debug.rebind(game);
    else this.debug = new DebugHud(this);              // debug mode's readout / crosshair / wireframes (drawn only when the setting is on)
    game.on('finale', () => this.startFinale());
    game.on('guardian-freed', () => this.startEnding());
    game.on('portal', (d) => this._onPortal(d));
    game.on('chest', (c) => { if (c.secret) this._secretFound(c.secret); });
    window.__game = game;
    game.input.onGesture = () => this.unlockAudio();         // the first user gesture unlocks audio
    this.audio?.setSong?.(songOf(game.realm));                // (the song of the world: it crossfades in; made behind the loading bar by _build)
    this.audio?.setDay?.(game.day);
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
    if (!instant) g.hud.banner(g.realm.name, g.realm.tagline, 4.2);
    this._controlsHint(g);
  }

  /** the line of controls that comes up when play begins, for whatever the player is using */
  _controlsHint(g) {
    const dev = g.input.lastDevice;
    g.hud.hint(dev === 'touch' ? 'STICK MOVES   JUMP / GLIDE   FIRE   RAM   TAP MENU FOR OPTIONS' : dev === 'pad' ? 'STICK MOVE   A JUMP / GLIDE   X FIRE   B CHARGE' : 'WASD MOVE   SPACE JUMP / GLIDE   J FIRE   K CHARGE', 7);
  }

  startFinale() {
    const g = this.game;
    if (this.state === 'finale') return;
    this.state = 'finale';
    g.mode = 'finale';
    g.player.locked = true;
    g.player.cheer = false;
    const b = this._finalBeacon(g), W = g.words;
    g.dayTarget = 1;
    g.hud.hintState = null;
    this.audio?.stinger?.('sunrise');
    const portal = this._exitPortal(g), pid = portal ? portal.def.id : null;
    g.hud.banner(W.finale, '', portal ? 3.2 : 4.5);
    // the light of the last lantern opens a portal above it, to Dawnhaven: it pops into being while the camera is in the lantern room, looking up
    if (portal) {
      g.after(3.4, () => g.portals.pop(pid));
      g.after(3.6, () => { g.hud.banner(W.portalOpened[0], W.portalOpened[1], 3.2); });
      g.after(7.6, () => { g.hud.banner(W.saved[0], W.saved[1], 4); });
    } else g.after(5.2, () => { g.hud.banner(W.saved[0], W.saved[1], 3.6); });
    g.cam.playCinematic(finaleShot(g, b, portal ? portal.def : null), 13, () => this.showResults());
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
    noteRealmDone(this.progress, g.realm.id, { gems: st.gems, gemsTotal: st.gemsTotal, time: st.time });     // (restored for good: Dawnhaven's door to it shines gold from now on)
    // hold the final wide shot of the sunrise sweep
    const shot = finaleShot(g, this._finalBeacon(g), this._exitPortal(g)?.def || null);
    g.cam.playCinematic(() => shot(13, 1), 1e9);
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
    const exit = this._exitPortal(g);
    g.hud.banner('FREE ROAM', exit && g.portals.isOpen(exit.def.id) ? g.words.freeRoam : 'COLLECT EVERY GEM!', 4);
  }

  /** the realm's way out: the ring of light over its last goal (a portal of kind 'lift'), or null */
  _exitPortal(g = this.game) { return (g.portals && g.portals.list.find((r) => r.def.kind === 'lift')) || null; }

  /** the goal object the finale is about: the one the exit portal hangs over, else the last of the list */
  _finalBeacon(g = this.game) {
    const list = g.beacons.list, portal = this._exitPortal(g);
    if (!portal) return list[list.length - 1];
    let best = list[list.length - 1], bd = Infinity;
    for (const b of list) { const d = Math.hypot(b.x - portal.def.x, b.z - portal.def.z); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  // ---- the ending: the Guardian is free (systems/boss.js emits 'guardian-freed' when the third lantern of his crown is lit) ----------------------------------------------
  /**
   * The last lantern burns: the dawn climbs, three columns of light go up from the crown, the Guardian bows and speaks (a dialogue), then the credits scroll, then the results of the whole game, then
   * free roam in the Court (state 'ending' -> 'credits' -> 'endresults' -> 'play'). It is remembered at once (progress.guardian): the gate's beam is gold from then on and the Elder says so.
   */
  startEnding() {
    const g = this.game, B = g.boss, p = g.player, W = g.hud;
    if (!B || this.state === 'ending' || this.state === 'credits' || this.state === 'endresults') return;
    this.state = 'ending';
    g.mode = 'ending';
    g.locked = p.locked = true;
    p.invulnT = 99; p.chargeT = 0; p.flameT = 0;
    W.hintState = null;
    g.dayTarget = 1;
    noteGuardianFreed(this.progress, { gems: g.stats.gems, gemsTotal: g.stats.gemsTotal, time: B.fightTime, deaths: g.stats.deaths, hits: B.hitsTaken });
    this.audio?.sfx('guardian_freed', { vol: 1 });
    this.audio?.stinger?.('sunrise');
    g.cam.playCinematic(endingShot(g.gameplay.boss), 1e9);
    g.after(0.9, () => B.bow());
    g.after(1.8, () => W.banner('THE GUARDIAN IS FREE', 'THE LAST LANTERN BURNS', 4.6));
    g.after(6.6, () => g.startDialogue('THE GUARDIAN', SPEECH, () => this._startCredits()));
  }

  _startCredits() {
    const g = this.game;
    this.state = 'credits';
    this.creditsT = 0;
    g.locked = g.player.locked = true;                       // (the dialogue gave him back to the game for a moment)
    g.hud.visible = false;
    this.credits = creditsLines([...DOORS.filter((d) => d.target).map((d) => d.name), 'THE GUARDIAN\'S COURT']);
    this.creditsH = this.credits.reduce((n, l) => n + lineHeight(l), 0);
  }

  _drawCredits(dt, snap) {
    const pix = this.gfx.hud, W = pix.w, H = pix.h, bar = 26, speed = 21;
    this.creditsT += dt;
    let y = H - bar - this.creditsT * speed;
    for (const l of this.credits) {
      const h = lineHeight(l);
      if (l.kind !== 'gap' && y > bar - 14 && y < H - bar + 2) {
        const o = l.kind === 'title' ? { style: 'grad', scale: 1, colors: GOLD } : l.kind === 'head' ? { style: 'grad', colors: GOLD } : { style: 'outline', color: '#f4eeff' };
        drawText(pix, l.text, W >> 1, Math.round(y), { align: 'center', outlineColor: INK, ...o });
      }
      y += h;
    }
    pix.rect(0, 0, W, bar, '#000000'); pix.rect(0, H - bar, W, bar, '#000000');                 // (letterbox bars, like the intro's: the lines scroll out of nothing)
    if (this.creditsT > 2 && Math.floor(this.t * 2) % 2 === 0) drawText(pix, `${confirmName(this.game.input)}: SKIP`, W - 6, H - 17, { style: 'outline', align: 'right', color: '#c8bce8', outlineColor: INK });
    if (y < bar + 6 || (this.creditsT > 2 && (snap.confirm || snap.jump))) this._startEndResults();
  }

  _startEndResults() {
    this.state = 'endresults';
    this.resultsT = 0;
    this.game.hud.visible = false;
    this.audio?.stinger?.('complete');
  }

  /** the results of the whole game: the places restored, every gem of the six, what the fight cost */
  _drawEndResults() {
    const pix = this.gfx.hud, W = pix.w, H = pix.h, g = this.game, st = g.stats, B = g.boss, pr = this.progress;
    const realms = Object.values(pr.realms).filter((r) => r.done);
    const gems = realms.reduce((n, r) => n + r.gems, 0) + st.gems, total = realms.reduce((n, r) => n + r.gemsTotal, 0) + st.gemsTotal;
    const w = 236, h = 150, x = (W - w) >> 1, y = (H - h) >> 1;
    drawPanel(pix, x, y, w, h, { style: 'menu' });
    drawText(pix, 'THE DAWN', W >> 1, y + 9, { style: 'grad', scale: 2, align: 'center', colors: GOLD, outlineColor: INK });
    const rows = [
      ['REALMS RESTORED', `${realmsDone(pr)} / ${DOORS.filter((d) => d.target).length}`],
      ['GEMS OF ALL SIX PLACES', `${gems} / ${total}`],
      ['THE GUARDIAN', 'FREE'],
      ['TIMES SET BACK', String(st.deaths)],
      ['HITS TAKEN', String(B ? B.hitsTaken : 0)],
      ['THE FIGHT', fmtTime(B ? B.fightTime : 0)],
    ];
    rows.forEach(([k, v], i) => {
      drawText(pix, k, x + 20, y + 34 + i * 12, { style: 'outline', color: '#c8bce8', outlineColor: INK });
      drawText(pix, v, x + w - 20, y + 34 + i * 12, { style: 'outline', color: '#fff4b0', outlineColor: INK, align: 'right' });
    });
    const stars = st.deaths === 0 && (B ? B.hitsTaken : 0) <= 3 ? 3 : st.deaths <= 2 ? 2 : 1, icons = g.hud.icons;
    for (let i = 0; i < 3; i++) {
      const on = i < stars && this.resultsT > 0.5 + i * 0.4, ic = icons.star;
      if (ic) { if (!this._dimStar) this._dimStar = dimIcon(ic); pix.blit(on ? ic : this._dimStar, W / 2 - 24 + i * 16, y + h - 28); }
    }
    if (this.resultsT > 1.2 && Math.floor(this.t * 2) % 2 === 0) drawText(pix, `${confirmName(g.input)}: KEEP EXPLORING`, W >> 1, y + h - 11, { style: 'outline', align: 'center', color: '#ffe27a', outlineColor: INK });
  }

  /** the Court is the hero's again: free roam, the Guardian quiet on his dais with his crown alight, the door at the foot of the gorge leads home */
  resumeFromEnding() {
    const g = this.game;
    this.state = 'play';
    g.mode = 'complete';
    g.cam.stopCinematic();
    g.cam.snapBehind(g.player);
    g.player.locked = false; g.locked = false;
    g.player.invulnT = 2;
    g.hud.visible = true;
    g.hud.banner('FREE ROAM', g.words.freeRoam, 4.6);
  }

  // ---- travelling between worlds ------------------------------------------------------------------------------------------------
  /** A portal was entered (see systems/portals.js): go where it leads. */
  _onPortal(d) {
    if (this.state === 'traveling' || !d.target) return;
    const g = this.game, st = g.stats;
    g.note(`ENTERED ${String(d.id).toUpperCase()}`);
    // the gems picked up since the finale (or in a restored visit) count if they beat the best so far
    if (g.realm.kind === 'realm' && this.progress.realms[g.realm.id]) noteRealmGems(this.progress, g.realm.id, st.gems, st.gemsTotal);
    this.travelTo(d.target);
  }

  /**
   * Leave this world for another (REALMS id): the screen fades out (to white: it is a portal), the old world is let go of, the new one is built behind the loading bar and swapped in,
   * and the screen fades back in on the hero where the way from the old world comes out. Driven from update(): phase 'out' while the old world still runs under the fade, 'load' while the
   * new one is built.
   */
  travelTo(id, { from = this.game.realm.id, color = [1, 1, 1], at = null } = {}) {
    if (this.state === 'traveling' || !REALMS[id]) return;
    const g = this.game;
    this.menu.closeAll();
    g.input.menuOpen = false;
    g.paused = false;
    // `at` is a place of the TRAVEL menu (travel.js) to arrive on instead of where the way from the old world comes out; in the world he is already in that is a hop: the screen blinks,
    // nothing is rebuilt and what he did there stays
    const hop = !!at && id === g.realm.id && !at.rematch;
    this.travel = { id, from, phase: 'out', color, t: 0, at, hop };
    this.state = 'traveling';
    g.player.locked = true;
    g.locked = true;
    if (at) g.player.invulnT = Math.max(g.player.invulnT, 2);              // (the old world runs on under the fade with him held: nothing may hurt him there)
    g.hud.hintState = null;
    g.fadeTo(1, hop ? 3.4 : 1.7, color);
    this.audio?.duck?.(hop ? 0.5 : 0.35, hop ? 1.2 : 2.4);
    this.audio?.setMuffled?.(false);
  }

  _updateTravel(dt) {
    const tr = this.travel, gfx = this.gfx;
    this._syncTouchUI();
    if (tr.phase === 'out') {
      const g = this.game, input = g.input;
      input.poll();
      input.snapshot();
      tr.t += dt;
      this.debug?.update(dt);
      g.update(dt);
      if (g.fade.a >= 0.995 && tr.t > (tr.hop ? 0.15 : 0.4)) {
        if (tr.hop) this._arrive(g, tr);                 // (the same world: the hero is put on his place under the white and the screen clears)
        else { tr.phase = 'load'; this._swap(tr); }
      }
    } else Hud.drawLoading(gfx.hud, this.load.frac, this.load.label);
  }

  /** Replace the world on screen with another: free the old one's GPU memory first (the heaviest thing there is), build the new one, and arrive in it. */
  async _swap(tr) {
    const old = this.game;
    this.scene = new THREE.Scene();                     // (nothing to draw but the loading bar while the new world is built)
    this.overlay = null;
    old.dispose();
    this.load = { frac: 0, label: REALMS[tr.id].kind === 'homeworld' ? 'ENTERING DAWNHAVEN' : 'ENTERING THE REALM' };
    let game;
    try { game = await this._build(tr.id, tr.from, !!(tr.at && tr.at.rematch)); } catch (e) { console.error(e); window.__error = String((e && e.stack) || e); return; }
    this._adopt(game);
    this._arrive(game, tr);
  }

  /** The hero steps out of the portal into the new world: the screen is still white and clears away, the name of the place comes up. (A hop within a world keeps the mode he is in.) */
  _arrive(game, tr) {
    const g = game, p = g.player;
    this.state = 'play';
    this.travel = null;
    const gateOpened = tr.at ? this._placeHero(g, tr.at) : false;
    const fromTitle = tr.hop && (g.mode === 'title' || g.mode === 'intro');
    if (!tr.hop || fromTitle) g.mode = g.restored ? 'complete' : 'play';             // (a restored realm is free roam: nothing in it is to be told again)
    g.hud.visible = true;
    g.player.locked = false;
    g.locked = false;
    g.cam.stopCinematic();
    g.cam.snapBehind(p);
    g.fade.a = 1;
    g.fade.color = tr.color;
    g.fadeTo(0, 1.1);
    if (tr.at) g.hud.banner(tr.at.name, g.realm.name, 3.6);
    else g.hud.banner(g.realm.name, g.restored ? g.words.restored : g.realm.tagline, 4.2);
    g.fx.puff(p.x, p.y + 0.6, p.z, 1.2);
    this.audio?.sfx('portal_arrive', { vol: 0.9 });
    // (what the world has to tell is told when he comes into it, not at every hop within it; from the title a hop starts play, with the controls)
    if (gateOpened) g.after(0.3, () => g.hud.hint(g.level.summit ? 'THE DAWN GATE WAS OPENED FOR YOU: ITS WARD WOULD HAVE THROWN YOU OUT' : `THE GATE WAS OPENED FOR YOU: ${g.words.gate[1]}`, 6.5));         // (a moment later: the hint zone he stands in takes the line at once)
    else if (fromTitle) this._controlsHint(g);
    else if (tr.hop) { /* nothing to add */ }
    else if (g.realm.kind === 'homeworld') g.hud.hint(`${realmsDone(this.progress)} OF ${DOORS.length} REALMS RESTORED  -  TALK TO THE ELDER AND FIND THE SECRETS`, 6.5);
    else if (g.restored) g.hud.hint(g.words.restoredHint, 6.5);
    if (g.gateMode === 'ceremony' && !tr.hop) this._gateCeremony(g);
  }

  /**
   * Dawnhaven, the last realm restored: the Guardian's Gate opens as a moment. The hero stands where the realm's door put him, held; the screen goes dark under a rumble and comes up on the gate, 150 m away,
   * low on its road: the field between the pillars dissolves, a door of light is lit in its place, a beam climbs out of it into the sky and the camera climbs it. Then he is given back his place (and a line of
   * words), and the beam is there to see from every corner of Dawnhaven. Progress remembers it (progress.home.gate): it is never played again.
   */
  _gateCeremony(g) {
    const b = g.gameplay.barrier, p = g.player, W = g.hud;
    noteGateOpen(this.progress);
    g.gateMode = 'open';
    g.note('THE GATE CEREMONY');
    this.state = 'ceremony';
    g.mode = 'ceremony';
    g.locked = p.locked = true;
    p.invulnT = Math.max(p.invulnT, 40);
    g.after(3.4, () => { g.fadeTo(1, 1.6, [0, 0, 0]); this.audio?.sfx('guardian_stoop', { vol: 0.7, pitch: 0.75 }); });
    g.after(5.4, () => {
      W.hintState = null; W.bannerState = null; W.visible = false;                          // (a film: nothing over it)
      g.cam.playCinematic(gateShot(b), 11.6, null);
      g.fadeTo(0, 1.3);
    });
    g.after(6.8, () => g.openGate());
    g.after(9.6, () => { W.visible = true; W.banner('THE GUARDIAN\'S GATE OPENS', 'THE LANTERNS OF EVERY REALM BURN', 4.4); this.audio?.stinger?.('lantern'); });
    g.after(17.2, () => g.fadeTo(1, 1.6));
    g.after(19.0, () => {
      g.cam.stopCinematic();
      g.cam.snapBehind(p);
      W.visible = true;
      this.state = 'play'; g.mode = 'play';
      g.locked = p.locked = false;
      p.invulnT = 2;
      g.fadeTo(0, 1.4);
      W.hint('A BEAM OF LIGHT STANDS OVER THE ASCENT: THE GUARDIAN\'S GATE IS OPEN. TALK TO ELDER WICK', 7);
    });
  }

  /**
   * Put the hero on a place of the TRAVEL menu (travel.js), facing the way it says; it is where he comes back to if he falls or is hurt. He blinks untouchable for a few seconds, as after
   * a respawn. The summit of the vale is sealed by a ward until the Dawn Gate opens, and it throws out whoever stands inside: a place within it opens the gate (true when it did). A place
   * of a realm that lies beyond its gate (`opens`, found by tools/realm-travel.mjs) opens it too, or the hero would stand shut in.
   */
  _placeHero(g, place) {
    const sp = heroSpot(g.grid, place), p = g.player, S = g.level.summit;
    p.place(sp.x, sp.y, sp.z, sp.yaw);
    g.boss?.hush();                                       // (a place in the Guardian's court does not wake him before its name has been read)
    g.note(`PLACED AT ${String(place.key || '?').toUpperCase()}`);
    p.invulnT = WARP_GRACE;
    g.checkpoint = { ...sp };
    g.hud.hintState = null;
    g.sparx?.snapTo(p);                                  // (Sparx is at his shoulder, not flying across the world after him)
    g.portals?.arrivedAt(sp.x, sp.z);                    // (the doors beside him do not put their own names over the place's)
    const sealed = !!place.opens || !!(S && Math.hypot(sp.x - S.x, sp.z - S.z) < WARD_RADIUS);
    return !!(sealed && g.objects && g.objects.openBarrierAtOnce());
  }

  /** YES on the TRAVEL menu's ARE YOU SURE?: take the hero to the place, from the title menu or the pause menu (a different world is a trip like a portal's, a fresh build of it). */
  warpTo(place) {
    if (this.state === 'traveling') return;
    const wasPaused = this.state === 'paused';
    this.unlockAudio();
    if (wasPaused) this.game.input.relock?.();             // (a click on a row is a gesture: the pointer can be taken again now, as RESUME does; the arrival comes seconds later)
    this.travelTo(place.world, { from: null, at: place });
  }

  /** A secret of Dawnhaven (a chest) was opened: remembered for good. */
  _secretFound(id) {
    if (!noteSecret(this.progress, id)) return;
    const found = this.progress.home.secrets.length;
    const def = SECRETS.find((s) => s.id === id);
    const g = this.game;
    this.audio?.stinger?.('lantern');
    g.hud.banner('SECRET FOUND!', `${def ? def.name : id}  -  ${found} OF ${SECRETS.length}`, 3.6);
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
    g.input.menuOpen = false;
    g.paused = false;
    this.state = 'play';
    this.audio?.setMuffled?.(false);
    this.audio?.sfx('unpause', { vol: 0.7 });
    g.input.relock?.();
  }

  /** On a touch screen the MENU button reads RESUME / BACK while a menu is open, and a tap outside the panel goes back too: those rows are left out
   *  so the rest can be bigger (a finger needs ~40 px per row and a phone is 390 px tall). */
  _touchOnly() { return () => this.game.input.lastDevice === 'touch'; }

  pausePage() {
    return {
      title: 'PAUSED', width: 210, closable: true, onBack: () => this.closePause(),
      items: [
        { type: 'action', label: 'RESUME', hidden: this._touchOnly(), action: () => this.closePause() },
        this._cameraRow(),
        this._debugRow(),
        { type: 'action', label: 'OPTIONS', more: true, action: (m) => m.open(this.optionsPage()) },
        { type: 'action', label: 'CONTROLS', more: true, hidden: this._touchOnly(), action: (m) => m.open(this.controlsPage()) },         // (on a touch screen it is a row of OPTIONS: a phone's pause menu fits six finger-sized rows, and TRAVEL is the seventh)
        { type: 'action', label: 'TRAVEL', more: true, action: (m) => m.open(this.travelPage()) },
        { type: 'action', label: this.game.realm.kind === 'homeworld' ? 'RESTART DAWNHAVEN' : 'RESTART REALM', action: () => { location.href = location.pathname + (this.game.realm.id === 'gloaming' ? '?skip=1' : `?world=${this.game.realm.id}`); } },
        { type: 'action', label: 'QUIT TO TITLE', action: () => { location.href = location.pathname; } },
      ],
    };
  }

  /** The menu on the title screen (Esc, or the MENU button on a touch screen). */
  titlePage() {
    return {
      title: 'MENU', width: 210, closable: true,
      items: [
        { type: 'action', label: 'PLAY', action: (m) => { m.closeAll(); this.startIntro(); } },
        { type: 'action', label: 'VISIT DAWNHAVEN', hidden: () => !realmsDone(this.progress), action: (m) => { m.closeAll(); this.state = 'play'; this.travelTo('home', { from: null }); } },
        { type: 'action', label: 'TRAVEL', more: true, action: (m) => m.open(this.travelPage()) },
        { type: 'action', label: 'OPTIONS', more: true, action: (m) => m.open(this.optionsPage()) },
        { type: 'action', label: 'CONTROLS', more: true, action: (m) => m.open(this.controlsPage()) },
        this._debugRow(),
        { type: 'action', label: 'BACK', hidden: this._touchOnly(), action: (m) => m.close() },
      ],
    };
  }

  /** the camera mode row (pause menu and options): SMART follows you round corners, ACTIVE always swings behind you, PASSIVE never moves by itself */
  _cameraRow() {
    const gfx = this.gfx;
    return { type: 'choice', label: 'CAMERA', options: CAM_MODES, labels: ['ACTIVE', 'SMART', 'PASSIVE'], get: () => gfx.settings.camMode, set: (i, opts) => gfx.set('camMode', opts[i]) };
  }

  /** the debug mode row (pause menu, title menu and options): OFF, COMPACT (where am I, what is around me) or FULL (adds camera, input, performance, errors) */
  _debugRow() {
    const gfx = this.gfx;
    return { type: 'choice', label: 'DEBUG MODE', options: [0, 1, 2], labels: ['OFF', 'COMPACT', 'FULL'], get: () => gfx.settings.debug, set: (i, opts) => gfx.set('debug', opts[i]) };
  }

  /** F3: off > compact > full > off */
  cycleDebug() {
    const gfx = this.gfx, next = ((gfx.settings.debug | 0) + 1) % 3;
    gfx.set('debug', next);
    this.audio?.sfx('ui_move', { vol: 0.4 });
    this.game.hud.hint(['DEBUG MODE: OFF', 'DEBUG MODE: COMPACT (F3 FOR FULL)', 'DEBUG MODE: FULL (F3 TO TURN OFF)'][next], 2.4);
  }

  // ---- TRAVEL (title and pause menus): a debugging tool, to get at once to any part of either world and look at it ---------------------------------------------------------------
  /** the worlds, then the groups of places of a world, then its places (a page of a phone's menu holds about six rows), then ARE YOU SURE? */
  travelPage() {
    return {
      title: 'TRAVEL TO', width: 230, closable: true, dense: true,
      items: [
        ...TRAVEL.map((w) => ({ type: 'action', label: w.name, more: true, action: (m) => m.open(this.travelWorldPage(w)) })),
        { type: 'action', label: 'BACK', hidden: this._touchOnly(), action: (m) => m.close() },
      ],
    };
  }

  travelWorldPage(w) {
    return {
      title: w.name, width: 230, closable: true,
      items: [
        ...w.groups.map((g) => ({ type: 'action', label: g.name, more: true, action: (m) => m.open(this.travelGroupPage(w, g)) })),
        { type: 'action', label: 'BACK', hidden: this._touchOnly(), action: (m) => m.close() },
      ],
    };
  }

  travelGroupPage(w, g) {
    return {
      title: g.name, width: 230, closable: true,
      items: [
        ...g.places.map((p) => ({ type: 'action', label: p.name, more: true, action: (m) => m.open(this.travelConfirmPage(w, { ...p, world: w.world })) })),
        { type: 'action', label: 'BACK', hidden: this._touchOnly(), action: (m) => m.close() },
      ],
    };
  }

  /** ARE YOU SURE? YES or NO: it starts on NO (a trip to another world leaves this one, and what was done in it is not kept). */
  travelConfirmPage(w, place) {
    const away = w.world !== this.game.realm.id;
    const lines = [`TRAVEL TO ${place.name}`, `IN ${w.name}?`, ...(away ? ['YOU LEAVE THIS WORLD.', 'WHAT YOU DID IN IT IS NOT KEPT.'] : [])];
    return {
      title: 'ARE YOU SURE?', width: 236, closable: true, sel: 1,
      items: [
        { type: 'action', label: 'YES', action: () => this.warpTo(place) },
        { type: 'action', label: 'NO', action: (m) => m.close() },
      ],
      extra: lines,
      draw: (pix, x, y) => lines.forEach((l, i) => drawText(pix, l, pix.w >> 1, y + i * 10, i === 0 ? { style: 'grad', colors: GOLD, outlineColor: INK, align: 'center' } : { style: 'outline', color: i === 1 ? '#e8e0ff' : '#ffb0a0', outlineColor: INK, align: 'center' })),
    };
  }

  controlsPage() {
    const dev = this.game.input.lastDevice;
    const lines = dev === 'touch'
      ? ['MOVE ........ LEFT THUMB (THE CIRCLE)', 'JUMP ........ JUMP  (HOLD IN AIR: GLIDE)', 'FIRE ........ FIRE BUTTON (AIMS FOR YOU)', 'CHARGE ...... HOLD THE RAM BUTTON', 'RAM JUMP .... HOLD RAM, TAP JUMP', 'CAMERA ...... DRAG THE RIGHT SIDE', 'CAM BUTTON .. TAP: BEHIND ME  HOLD: MODE', 'TALK ........ TALK BUTTON', 'MENU ........ MENU BUTTON', 'DEBUG ....... MENU > DEBUG MODE']
      : dev === 'pad'
        ? ['MOVE ........ LEFT STICK / D-PAD', 'JUMP ........ A  (HOLD IN AIR: GLIDE)', 'FIRE ........ X', 'CHARGE ...... HOLD B', 'RAM JUMP .... HOLD B, TAP A', 'CAMERA ...... RIGHT STICK / BUMPERS', 'BEHIND ME ... Y   MODE: PAUSE > CAMERA', 'TALK ........ RT   PAUSE ... START', 'DEBUG ....... PAUSE > DEBUG MODE']
        : ['MOVE ........ WASD / ARROWS', 'JUMP ........ SPACE  (HOLD IN AIR: GLIDE)', 'FIRE ........ J / F / LEFT CLICK', 'CHARGE ...... HOLD K / SHIFT / RIGHT CLICK', 'RAM JUMP .... HOLD K, TAP SPACE', 'CAMERA ...... MOUSE / Q E', 'BEHIND ME ... R   CAMERA MODE ... C', 'TALK ........ ENTER   PAUSE ... ESC', 'DEBUG MODE .. F3  (OFF / COMPACT / FULL)'];
    return {
      title: 'CONTROLS', width: 280, items: [{ type: 'action', label: 'BACK', action: (m) => m.close() }], footer: '',
      extra: lines,
      draw: (pix, x, y) => lines.forEach((l, i) => drawText(pix, l, x, y + i * 10, { style: 'outline', color: '#e8e0ff', outlineColor: INK })),
    };
  }

  /** Options is a short list of sub-pages: a phone can only tap a handful of rows on one screen (each needs to be a finger tall). */
  optionsPage() {
    const gfx = this.gfx;
    return {
      title: 'OPTIONS', width: 260,
      items: [
        { type: 'slider', label: 'MUSIC', get: () => gfx.settings.music, set: (v) => { gfx.set('music', v); this.audio?.setVolumes?.({ music: v }); } },
        { type: 'slider', label: 'SOUND FX', get: () => gfx.settings.sfx, set: (v) => { gfx.set('sfx', v); this.audio?.setVolumes?.({ sfx: v }); } },
        { type: 'action', label: 'CAMERA & AIM', more: true, action: (m) => m.open(this.cameraPage()) },
        { type: 'action', label: 'GRAPHICS', more: true, action: (m) => m.open(this.graphicsPage()) },
        { type: 'action', label: 'DEBUG', more: true, action: (m) => m.open(this.debugPage()) },
        { type: 'action', label: 'CONTROLS', more: true, hidden: () => !this._touchOnly()(), action: (m) => m.open(this.controlsPage()) },         // (touch screens only: see the pause menu)
        { type: 'action', label: 'BACK', hidden: this._touchOnly(), action: (m) => m.close() },
      ],
      footer: this._changeHint(),
    };
  }

  _changeHint() { return this.game.input.lastDevice === 'touch' ? 'TAP A ROW TO CHANGE IT' : 'LEFT / RIGHT TO CHANGE'; }

  cameraPage() {
    const gfx = this.gfx;
    return {
      title: 'CAMERA & AIM', width: 260,
      items: [
        this._cameraRow(),
        { type: 'slider', label: 'CAMERA SPEED', get: () => gfx.settings.lookSpeed, set: (v) => gfx.set('lookSpeed', v) },
        { type: 'toggle', label: 'INVERT CAMERA Y', get: () => !!gfx.settings.invertY, set: (v) => gfx.set('invertY', v) },
        { type: 'toggle', label: 'FIRE AIM ASSIST', get: () => gfx.settings.aimAssist !== false, set: (v) => gfx.set('aimAssist', v) },
        { type: 'action', label: 'BACK', hidden: this._touchOnly(), action: (m) => m.close() },
      ],
      footer: this._changeHint(),
    };
  }

  graphicsPage() {
    const gfx = this.gfx;
    const set = (k) => (i, opts) => { gfx.set(k, opts ? opts[i] : i); };
    return {
      title: 'GRAPHICS', width: 260,
      items: [
        { type: 'choice', label: 'DISPLAY', options: ['4:3', 'wide'], labels: ['4:3 CLASSIC', 'WIDESCREEN'], get: () => gfx.settings.display, set: set('display') },
        { type: 'choice', label: 'LOOK', options: ['smooth', 'ps1', 'custom'], labels: ['SMOOTH', 'PS1 AUTHENTIC', 'CUSTOM'], get: () => gfx.look, set: (i, opts) => { if (opts[i] !== 'custom') gfx.setLook(opts[i]); } },
        { type: 'choice', label: 'RESOLUTION', options: [240, 360, 480, 720], labels: ['240P PS1', '360P', '480P', '720P'], get: () => gfx.settings.height, set: set('height') },
        { type: 'choice', label: 'COLORS', options: [0, 0.6, 1], labels: ['CLASSIC', 'VIVID', 'EXTRA VIVID'], get: () => gfx.settings.color, set: set('color') },
        { type: 'toggle', label: '30 FPS LOCK', get: () => !!gfx.settings.fps30, set: (v) => gfx.set('fps30', v) },
        { type: 'action', label: 'MORE GRAPHICS', more: true, action: (m) => m.open(this.advancedGraphicsPage()) },
        { type: 'action', label: 'BACK', hidden: this._touchOnly(), action: (m) => m.close() },
      ],
      footer: this._changeHint(),
    };
  }

  advancedGraphicsPage() {
    const gfx = this.gfx;
    const set = (k) => (i, opts) => { gfx.set(k, opts ? opts[i] : i); };
    const pctOpts = [0, 0.5, 1];
    return {
      title: 'MORE GRAPHICS', width: 260,
      items: [
        { type: 'choice', label: 'SCALING', options: ['auto', 'integer', 'fill'], labels: ['AUTO', 'INTEGER', 'FILL'], get: () => gfx.settings.scaling, set: set('scaling') },
        { type: 'toggle', label: 'SMOOTH TEXTURES', get: () => gfx.settings.filter === 'smooth', set: (v) => gfx.set('filter', v ? 'smooth' : 'pixel') },
        { type: 'toggle', label: 'HD TEXTURES', get: () => HD.on, set: (v) => { gfx.set('hd', v); setTextureHD(v); } },        // (the smooth look only: the PS1 look takes the pixels)
        { type: 'choice', label: 'CRT FILTER', options: pctOpts, labels: ['OFF', 'LIGHT', 'FULL'], get: () => gfx.settings.crt, set: set('crt') },
        { type: 'toggle', label: '15-BIT DITHER', get: () => !!gfx.settings.dither, set: (v) => gfx.set('dither', v ? 1 : 0) },
        { type: 'toggle', label: 'VERTEX WOBBLE', get: () => !!gfx.settings.snap, set: (v) => gfx.set('snap', v ? 1 : 0) },
        { type: 'choice', label: 'TEXTURE WARP', options: pctOpts, labels: ['OFF', 'HALF', 'FULL'], get: () => gfx.settings.affine, set: set('affine') },
        { type: 'action', label: 'BACK', hidden: this._touchOnly(), action: (m) => m.close() },
      ],
      footer: this._changeHint(),
    };
  }

  /** Debug mode: a readout of where Spyro is and what is around him, to send along with a screenshot of anything that looks wrong. */
  debugPage() {
    const gfx = this.gfx;
    const lines = this.game.input.lastDevice === 'touch'
      ? ['X = EAST   Y = UP   Z = SOUTH', 'THE READOUT NAMES WHAT IS NEARBY.', 'TAP THE SCREEN TO PIN IT TO A SPOT', '(TAP THE SAME SPOT AGAIN TO UNPIN)']
      : ['X = EAST   Y = UP   Z = SOUTH', 'THE READOUT NAMES WHAT IS NEARBY AND', 'WHAT THE CROSSHAIR POINTS AT'];
    return {
      title: 'DEBUG', width: 260,
      items: [
        this._debugRow(),
        { type: 'toggle', label: 'SHOW COLLIDERS', get: () => !!gfx.settings.debugColliders, set: (v) => gfx.set('debugColliders', v) },
        { type: 'choice', label: 'TEXT SIZE', options: [0, 1, 2], labels: ['SMALL', 'NORMAL', 'LARGE'], get: () => gfx.settings.debugSize, set: (i, opts) => gfx.set('debugSize', opts[i]) },
        { type: 'action', label: 'COPY REPORT', action: () => this.copyReport() },
        { type: 'action', label: 'BACK', hidden: this._touchOnly(), action: (m) => m.close() },
      ],
      extra: lines,
      draw: (pix, x, y) => lines.forEach((l, i) => drawText(pix, l, x, y + i * 10, { style: 'outline', color: '#e8e0ff', outlineColor: INK })),
      footer: this._changeHint(),
    };
  }

  /** The readout as text (the build, where the hero is, the state of the game, what happened lately) onto the clipboard where the page may, else a hint to take a screenshot instead: what to send along with "it went wrong". */
  async copyReport() {
    const text = this.debug.report(), hud = this.game.hud;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { /* not allowed on this page */ }
    if (!ok) {
      try { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0'; document.body.appendChild(ta); ta.select(); ok = !!document.execCommand('copy'); ta.remove(); } catch (e) { ok = false; }
    }
    hud.hint(ok ? 'REPORT COPIED: PASTE IT TO WHOEVER IS FIXING THE GAME' : 'COULD NOT COPY: TURN DEBUG MODE ON AND TAKE A SCREENSHOT', 5);
    return ok;
  }

  // ---- per-frame ---------------------------------------------------------------------------------------------------------------
  /** The on-screen touch controls follow the app: a menu or a cutscene must not have JUMP / FIRE sitting on top of it (see Input.setTouchUI). */
  _syncTouchUI() {
    const g = this.game;
    if (!g || !g.input.touchRoot) return;
    let controls = false, menu = null;
    switch (this.state) {
      case 'title': menu = 'MENU'; break;
      case 'title-options': menu = 'BACK'; break;
      case 'paused': menu = this.menu.stack.length > 1 ? 'BACK' : 'RESUME'; break;
      case 'play': controls = true; menu = g.hud.talking ? null : 'MENU'; break;
      default: break;                       // loading, traveling, intro, finale, results: taps only, no buttons
    }
    this.gfx.setTouchLayout(true);                 // (the touch controls exist: a window held upright keeps the picture at the top, with the thumbs' room below it)
    g.input.layoutTouch(this.gfx.frameCss());
    g.input.setTouchUI(controls, menu);
  }

  update(dt) {
    this.t += dt;
    const gfx = this.gfx;
    if (this.state === 'loading') {
      this._syncTouchUI();
      Hud.drawLoading(gfx.hud, this.load.frac, this.load.label);
      return;
    }
    if (this.state === 'traveling') { this._updateTravel(dt); return; }
    const g = this.game;
    const input = g.input;
    input.poll();
    const snap = input.snapshot();       // UI-level presses, captured before the sim consumes them
    if (snap.debug) this.cycleDebug();
    input.menuOpen = this.menu.active;
    this._syncTouchUI();
    this.debug?.update(dt);
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
        const go = this.t >= (this.startOkAt || 0);
        if (go && (snap.confirm || snap.jump || snap.flame || (input.lastDevice === 'touch' && input.takeAnyKey()))) this.startIntro();
        else if (snap.pause) { this.menu.open(this.titlePage()); this.state = 'title-options'; }
        else if (!go) input.takeAnyKey();
        break;
      }
      case 'title-options': {
        this.menu.update(dt, input, snap);
        input.takeAnyKey();                                               // (taps on the menu's rows are not "tap to start": the title must not see them once the menu closes)
        if (this.state !== 'title-options') break;                        // (PLAY was picked: the intro has begun)
        this._drawTitle(true);
        this._drawMenus();
        if (!this.menu.active) { this.state = 'title'; this.startOkAt = this.t + 0.35; }      // (the tap that closed it does not start the game either)
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
      case 'ending': case 'ceremony': break;
      case 'credits': this._drawCredits(dt, snap); break;
      case 'endresults': {
        this.resultsT += dt;
        this._drawEndResults();
        if (this.resultsT > 1.2 && (snap.confirm || snap.jump)) this.resumeFromEnding();
        break;
      }
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
      const L = this.menu.layout(pix.w, pix.h, page, page.items.filter((it) => !it.hidden || !it.hidden()));      // (the rows actually showing: the same layout Menu.draw uses)
      page.draw(pix, L.x + 12, L.y + 24);
    }
  }

  _drawTitle(dim = false) {
    const pix = this.gfx.hud, W = pix.w, H = pix.h;
    const touch = !!this.game.input.touch || this.game.input.lastDevice === 'touch';
    const pad = this.game.input.lastDevice === 'pad';
    // (on a touch screen the MENU button sits at the top centre: the logo starts below it)
    const top = touch ? Math.max(Math.round(H * 0.08), touchClear(this.gfx.frameCss())) : Math.round(H * 0.08);
    if (this.logo) {
      const bob = Math.round(Math.sin(this.t * 1.6) * 1.5);
      pix.blit(this.logo, (W - this.logo.w) >> 1, top + bob);
    }
    drawText(pix, 'SPYRO', W >> 1, top - 2, { style: 'grad', scale: 1, align: 'center', colors: ['#f4eeff', '#b98cff', '#7c3ec8'], outlineColor: INK });
    drawText(pix, 'A LANTERN KEEPERS DLC REALM', W >> 1, top + (this.logo ? this.logo.h + 2 : 60), { style: 'grad', align: 'center', colors: LILAC, outlineColor: INK });
    if (!dim && Math.floor(this.t * 2) % 2 === 0) {
      drawText(pix, touch ? 'TAP TO START' : pad ? 'PRESS A' : 'PRESS ENTER', W >> 1, Math.round(H * 0.74), { style: 'grad', scale: 2, align: 'center', colors: GOLD, outlineColor: INK });
      if (!touch && !pad) drawText(pix, 'OR CLICK', W >> 1, Math.round(H * 0.74) + 24, { style: 'outline', align: 'center', color: '#c8bce8', outlineColor: INK });
    }
    if (dim) return;                                       // (a menu is open over the title: its own footer lives down here)
    drawText(pix, touch ? 'TAP MENU FOR OPTIONS' : pad ? 'START: MENU' : 'ESC: MENU', W >> 1, H - 12, { style: 'outline', align: 'center', color: '#c8bce8', outlineColor: INK });
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
    const exit = this._exitPortal(g), portal = !!(exit && g.portals.isOpen(exit.def.id));            // (the light above the last goal: a line more tells the way on)
    const w = 220, h = portal ? 152 : 138, x = (W - w) >> 1, y = (H - h) >> 1;
    drawPanel(pix, x, y, w, h, { style: 'menu' });
    drawText(pix, g.words.results, W >> 1, y + 9, { style: 'grad', scale: 2, align: 'center', colors: GOLD, outlineColor: INK });
    const rows = [
      ['GEMS', `${st.gems} / ${st.gemsTotal}`],
      [g.words.goals, `${st.beacons} / ${st.beaconsTotal}`],
      ['SNUFFERS', String(st.enemies)],
      ['BUNNIES', String(st.bunnies)],
      ['SECRETS', String(st.walls + st.chests)],
      ['TIME', fmtTime(st.time)],
    ];
    rows.forEach(([k, v], i) => {
      drawText(pix, k, x + 22, y + 34 + i * 12, { style: 'outline', color: '#c8bce8', outlineColor: INK });
      drawText(pix, v, x + w - 22, y + 34 + i * 12, { style: 'outline', color: '#fff4b0', outlineColor: INK, align: 'right' });
    });
    if (portal) drawText(pix, g.words.portalResults, W >> 1, y + 34 + rows.length * 12 + 2, { style: 'outline', align: 'center', color: '#d6b8ff', outlineColor: INK });
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
