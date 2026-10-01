// Renderer: scene -> low-res target -> 15-bit dither + HUD composite -> crisp upscale to the canvas.
import * as THREE from 'three';
import { U, setTextureSmoothing } from './materials.js';
import { QUANT_FRAG, OUT_FRAG, FULLSCREEN_VERT } from './shaders.js';
import { Pix } from './textures/pix.js';
import { isTouchDevice } from './device.js';

const STORE_KEY = 'gloaming-vale/settings/v2';

export const DEFAULT_SETTINGS = {
  display: '4:3',     // '4:3' (authentic 320x240) | 'wide' (240 lines, as many columns as fit)
  scaling: 'auto',    // 'auto' | 'integer' | 'fill'
  height: 480,        // internal vertical resolution (240 = PS1)
  filter: 'smooth',   // 'smooth' (filtered textures, MSAA, smooth upscale) | 'pixel' (PS1 point sampling)
  crt: 0,             // 0..1 scanlines/mask/vignette
  dither: 0,          // 15-bit colour + ordered dither
  snap: 0,            // vertex snapping
  affine: 0,          // affine texture warping (0..1)
  color: 0.6,         // colour grade: 0 classic (moody dusk) | 0.6 vivid | 1 extra vivid — brighter, richer colours
  fps30: false,       // lock rendering to 30 fps like the original
  music: 0.8,
  sfx: 1,
  invertY: false,
  camMode: 'active',  // 'active' (swings behind you, like the original's Active camera) | 'smart' (a calmer Active) | 'passive' (never moves by itself)
  camVersion: 2,      // 1: the default was 'smart' (saved along with any other option that was changed); 2: it is 'active'
  lookSpeed: 0.5,     // 0..1 -> mouse / stick / touch camera speed x0.4 .. x1.6 (0.5 = x1)
  aimAssist: true,    // breathing fire nudges Spyro round towards a brazier / beacon / Snuffer in front of him
  debug: 0,           // debug mode (F3, or the menu): 0 off | 1 compact readout (where am I, what is around me) | 2 full (adds camera, input, performance, errors)
  debugColliders: false, // debug mode: draw the collision volumes near Spyro as wireframes
  debugSize: 1,       // debug readout text size: 0 small | 1 normal | 2 large
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Stored settings are untrusted JSON: coerce every field into its valid range (a bad value must never blank the screen). */
function sanitize(s) {
  const num = (v, d) => (Number.isFinite(+v) && v !== null && v !== '' ? clamp01(+v) : d);
  s.height = [240, 360, 480, 720].includes(s.height) ? s.height : 480;
  if (s.filter !== 'pixel') s.filter = 'smooth';
  if (s.display !== 'wide') s.display = '4:3';
  if (!['auto', 'integer', 'fill'].includes(s.scaling)) s.scaling = 'auto';
  s.crt = num(s.crt, 0);
  s.affine = num(s.affine, 0);
  s.color = [0, 0.6, 1].reduce((b, v) => (Math.abs(v - num(s.color, 0.6)) < Math.abs(b - num(s.color, 0.6)) ? v : b), 0.6);   // (snapped to a menu step)
  s.music = num(s.music, DEFAULT_SETTINGS.music);
  s.sfx = num(s.sfx, DEFAULT_SETTINGS.sfx);
  s.dither = s.dither ? 1 : 0;
  s.snap = s.snap ? 1 : 0;
  s.fps30 = !!s.fps30;
  s.invertY = !!s.invertY;
  if (!['active', 'smart', 'passive'].includes(s.camMode)) s.camMode = DEFAULT_SETTINGS.camMode;
  s.camVersion = 2;
  s.lookSpeed = num(s.lookSpeed, DEFAULT_SETTINGS.lookSpeed);
  s.aimAssist = s.aimAssist !== false;
  s.debug = [0, 1, 2].includes(s.debug) ? s.debug : 0;
  s.debugColliders = !!s.debugColliders;
  s.debugSize = [0, 1, 2].includes(s.debugSize) ? s.debugSize : 1;
  return s;
}

export function loadSettings() {
  const base = { ...DEFAULT_SETTINGS };
  // phones are wider than 4:3 and have no room to waste: start in widescreen (players can still pick 4:3 in the options)
  if (isTouchDevice()) { base.display = 'wide'; base.height = 360; }
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && typeof saved === 'object') {
        // 'smart' was the default until Active took over: one saved from that time is the old default, not a choice, so it moves over once
        // (a 'smart' picked afterwards is saved with camVersion 2 and stays)
        if ((saved.camVersion | 0) < 2 && saved.camMode === 'smart') saved.camMode = 'active';
        return sanitize({ ...base, ...saved });
      }
    }
  } catch (e) { /* storage unavailable (private mode / sandboxed frame) or corrupt JSON */ }
  return sanitize(base);
}

export function saveSettings(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}

export class Gfx {
  constructor(canvas, { preserve = false } = {}) {
    this.canvas = canvas;
    this.settings = loadSettings();
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: preserve,
    }));
    r.setPixelRatio(1);
    r.autoClear = false;
    r.info.autoReset = false;      // three passes per frame: reset once per frame (in render) so the counters cover all of them

    this.W = 320;
    this.H = 240;
    this.devW = 0;                 // (0 = "canvas not sized yet": resize() must always set the drawing buffer on first call)
    this.devH = 0;
    this.rect = [0, 0, 640, 480];
    this.onInternalResize = null;

    // full-screen triangle-pair used by both post passes
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeo = new THREE.PlaneGeometry(2, 2);

    this.quantMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: QUANT_FRAG,
      uniforms: {
        uScene: { value: null },
        uHud: { value: null },
        uDither: { value: 1 },
        uVivid: { value: 0 },
        uFade: { value: new THREE.Vector4(0, 0, 0, 0) },
      },
      depthTest: false, depthWrite: false,
    });
    this.outMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: OUT_FRAG,
      uniforms: {
        uTex: { value: null },
        uInRes: { value: new THREE.Vector2(320, 240) },
        uSmooth: { value: 1 },
        uRect: { value: new THREE.Vector4(0, 0, 640, 480) },
        uCRT: { value: 0 },
      },
      depthTest: false, depthWrite: false,
    });
    this.quantScene = new THREE.Scene();
    this.quantQuad = new THREE.Mesh(quadGeo, this.quantMat);
    this.quantQuad.frustumCulled = false;
    this.quantScene.add(this.quantQuad);
    this.outScene = new THREE.Scene();
    this.outQuad = new THREE.Mesh(quadGeo, this.outMat);
    this.outQuad.frustumCulled = false;
    this.outScene.add(this.outQuad);

    this.fade = this.quantMat.uniforms.uFade.value;
    this.hud = null;
    this._allocTargets(this.W, this.H);
    this.applySettings();
    this.resize();
  }

  _allocTargets(W, H) {
    if (this.rtScene) { this.rtScene.dispose(); this.rtFinal.dispose(); this.hudTex?.dispose(); }
    this._samples = this.settings.filter === 'smooth' ? 4 : 0;
    this.rtScene = new THREE.WebGLRenderTarget(W, H, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
      depthBuffer: true, stencilBuffer: false, generateMipmaps: false, samples: this._samples,
    });
    this.rtScene.texture.colorSpace = THREE.NoColorSpace;
    this.rtFinal = new THREE.WebGLRenderTarget(W, H, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    });
    this.rtFinal.texture.colorSpace = THREE.NoColorSpace;
    // the HUD lives in a fixed 240-line layout space whatever the scene resolution is (it is just scaled up to the frame)
    const uiH = 240, uiW = Math.round((W * uiH) / H / 2) * 2;
    this.hud = new Pix(uiW, uiH);
    this.hudTex = new THREE.DataTexture(new Uint8Array(this.hud.data.buffer), uiW, uiH, THREE.RGBAFormat);
    this.hudTex.magFilter = this.hudTex.minFilter = this.settings.filter === 'smooth' ? THREE.LinearFilter : THREE.NearestFilter;
    this.hudTex.flipY = true;
    this.hudTex.generateMipmaps = false;
    this.hudTex.needsUpdate = true;
    this.quantMat.uniforms.uScene.value = this.rtScene.texture;
    this.quantMat.uniforms.uHud.value = this.hudTex;
    this.outMat.uniforms.uTex.value = this.rtFinal.texture;
    this.outMat.uniforms.uInRes.value.set(W, H);
    U.uRes.value.set(W, H);
  }

  set(key, value) {
    this.settings[key] = value;
    saveSettings(this.settings);
    this.applySettings();
    if (key === 'display' || key === 'scaling' || key === 'height' || key === 'filter') this.resize(true);
  }

  /** One-click looks: 'smooth' (filtered, 480p, no dither / wobble) or 'ps1' (authentic 240p artefacts). */
  setLook(look) {
    const touch = this.settings.display === 'wide' && this.settings.height === 360;
    Object.assign(this.settings, look === 'ps1'
      ? { filter: 'pixel', height: 240, dither: 1, snap: 1, affine: 1 }
      : { filter: 'smooth', height: touch ? 360 : 480, dither: 0, snap: 0, affine: 0 });
    saveSettings(this.settings);
    this.applySettings();
    this.resize(true);
  }

  get look() { const s = this.settings; return s.filter === 'pixel' && s.height === 240 && s.dither && s.snap ? 'ps1' : s.filter === 'smooth' && !s.dither && !s.snap ? 'smooth' : 'custom'; }

  applySettings() {
    const s = this.settings;
    U.uSnap.value = s.snap ? 1 : 0;
    U.uAffine.value = s.affine;
    this.quantMat.uniforms.uDither.value = s.dither ? 1 : 0;
    this.quantMat.uniforms.uVivid.value = s.color;
    this.outMat.uniforms.uCRT.value = s.crt;
    this.outMat.uniforms.uSmooth.value = s.filter === 'smooth' ? 1 : 0;
    setTextureSmoothing(s.filter === 'smooth');
    if (this.hudTex) this.hudTex.magFilter = this.hudTex.minFilter = s.filter === 'smooth' ? THREE.LinearFilter : THREE.NearestFilter;
    if (this.hudTex) this.hudTex.needsUpdate = true;
  }

  /** Recompute internal + output sizes from the window. */
  resize(force = false) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const devW = Math.max(2, Math.round(window.innerWidth * dpr));
    const devH = Math.max(2, Math.round(window.innerHeight * dpr));
    const s = this.settings;
    const H = s.height;
    let W, scale, rect;
    const wide = s.display === 'wide' && devW / devH > 4 / 3;      // (a portrait window falls back to the letterboxed 4:3 frame)
    if (wide) {
      const sInt = Math.floor(devH / H);          // 0 when the window is shorter than one internal frame: then just fit
      const useInt = sInt >= 1 && (s.scaling === 'integer' || (s.scaling === 'auto' && (sInt * H) / devH >= 0.82));
      if (useInt) {
        scale = sInt;
        W = THREE.MathUtils.clamp(Math.floor(devW / scale), (H * 4) / 3, H * 2.4);
        W = Math.floor(W / 2) * 2;
        const rw = W * scale, rh = H * scale;
        rect = [Math.floor((devW - rw) / 2), Math.floor((devH - rh) / 2), rw, rh];
      } else {
        scale = devH / H;
        W = THREE.MathUtils.clamp(Math.round(devW / scale), (H * 4) / 3, H * 2.4);
        W = Math.floor(W / 2) * 2;
        rect = [0, 0, devW, devH];
      }
    } else {
      W = Math.round((H * 4) / 3);
      const sMax = Math.min(devW / W, devH / H);
      const sInt = Math.floor(sMax);              // 0 in a window smaller than one internal frame: then just fit
      const useInt = sInt >= 1 && (s.scaling === 'integer' || (s.scaling === 'auto' && sInt / sMax >= 0.85));
      scale = useInt ? sInt : sMax;
      const rw = Math.round(W * scale), rh = Math.round(H * scale);
      rect = [Math.floor((devW - rw) / 2), Math.floor((devH - rh) / 2), rw, rh];
    }
    this.scale = scale;
    if (devW !== this.devW || devH !== this.devH || force) {
      this.devW = devW; this.devH = devH;
      this.renderer.setSize(devW, devH, false);      // (the canvas' CSS box is sized by the page: fixed, inset 0, 100% x 100%)
    }
    this.rect = rect;
    this.outMat.uniforms.uRect.value.set(rect[0], rect[1], rect[2], rect[3]);
    if (W !== this.W || H !== this.H || this._samples !== (s.filter === 'smooth' ? 4 : 0)) {
      this.W = W; this.H = H;
      this._allocTargets(W, H);
      if (this.onInternalResize) this.onInternalResize(W, H);
    }
  }

  /**
   * Where the game frame is on the page, in CSS pixels, and how big one HUD layout unit is (the HUD is a fixed 240 lines high, so
   * `unit` = frame height / 240). DOM overlays (the touch MENU button, the debug readout) anchor to this so they sit in the same place
   * relative to the HUD on a phone, a tablet and a desktop window.
   */
  frameCss() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const [x0, y0, rw, rh] = this.rect;
    return { left: x0 / dpr, top: (this.devH - (y0 + rh)) / dpr, width: rw / dpr, height: rh / dpr, unit: rh / dpr / this.hud.h, dpr, safeTop: this._safeTop(rh / dpr) };
  }

  /**
   * How much of the top edge of the page the platform covers, in CSS pixels (`env(safe-area-inset-top)`: a notch, or the header of an app that shows the page underneath it; 0 in an
   * ordinary browser window). CSS is the only place that value can be asked for, so a hidden box carries it as padding and it is read back. Read every time, since nothing announces a
   * change of inset. At most a quarter of the frame's height counts: a real notch or header is far smaller, and a bogus value must not push the touch button and the HUD out of the frame.
   */
  _safeTop(frameH) {
    let p = this._safeProbe;
    if (!p) {
      p = this._safeProbe = document.createElement('div');
      p.setAttribute('aria-hidden', 'true');
      p.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;margin:0;border:0;padding:0;visibility:hidden;pointer-events:none';
      p.style.paddingTop = 'env(safe-area-inset-top, 0px)';       // (a browser without env() drops this: the padding stays 0)
      document.body.appendChild(p);
    }
    const v = parseFloat(getComputedStyle(p).paddingTop);
    this.safeTopRaw = v > 0 ? v : 0;                              // (what the platform said, for the debug readout)
    return v > 0 ? Math.min(v, frameH / 4) : 0;
  }

  clearHud() { this.hud.data.fill(0); }

  /**
   * Render `scene` from `camera` through the whole PS1 pipeline to the canvas. `overlay` ({ scene, camera }) is an optional
   * second scene drawn on top of the finished world (depth cleared) through the same shaders and post passes: the floating
   * gem counter uses it, so its 3D numerals wobble, band and dither like everything else. `overlay.visible = false` skips the
   * pass altogether (no depth clear, no draw), which is the normal state almost all of the time.
   */
  render(scene, camera, overlay = null) {
    const r = this.renderer;
    r.info.reset();
    // pass 1: the 3D scene at internal resolution
    r.setRenderTarget(this.rtScene);
    r.setViewport(0, 0, this.W, this.H);
    r.setScissorTest(false);
    r.setClearColor(U.uFogColor.value, 1);
    r.clear(true, true, false);
    r.render(scene, camera);
    if (overlay && overlay.visible !== false && overlay.scene.children.length) { r.clearDepth(); r.render(overlay.scene, overlay.camera); }
    // pass 2: dither/quantise + HUD
    this.hudTex.needsUpdate = true;
    r.setRenderTarget(this.rtFinal);
    r.setViewport(0, 0, this.W, this.H);
    r.render(this.quantScene, this.quadCam);
    // pass 3: upscale to the canvas
    r.setRenderTarget(null);
    r.setViewport(0, 0, this.devW, this.devH);
    r.setClearColor(0x000000, 1);
    r.clear(true, false, false);
    r.render(this.outScene, this.quadCam);
  }

  /** Exact internal-resolution frame (post-dither, HUD included) as RGBA rows top-to-bottom. */
  readInternal() {
    const { W, H } = this;
    const buf = new Uint8Array(W * H * 4);
    this.renderer.readRenderTargetPixels(this.rtFinal, 0, 0, W, H, buf);
    const out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      out.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    }
    return { w: W, h: H, data: out };
  }
}
