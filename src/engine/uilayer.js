// THE UI LAYER: a Canvas2D drawn over the finished picture at the window's own resolution (not the game's 240-line HUD): vector panels, a clean type, smooth bars. The retro HUD
// (engine/textures/font.js, ui.js) lives on in the menus and the title; what plays over the game is drawn here (game/hud.js). It is composited in the last pass (shaders.js OUT_FRAG), after the dither
// and the upscale, so nothing in it is quantised, banded or blurred; a frame in which nothing is drawn costs nothing (no upload).
//
//   ui.start()   once a frame (Gfx.clearHud)     ui.get() -> ctx in dp (720 high, `ui.W` wide) or null      ui.used = true  when something was drawn      ui.finish()  in the renderer: the upload, only when needed
import * as THREE from 'three';

/** the layout space is 720 dp high whatever the window is; one dp is `k` canvas pixels */
export const UI_H = 720;
/** the canvas is never taller than this (a 4K window draws the UI at 720 and the last pass scales it up, filtered: the upload and the rasterising stay small) */
const MAX_PX_H = 720;

export class UiLayer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 2;
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.W = (UI_H * 4) / 3;           // the layout space's width in dp (the frame's aspect times 720)
    this.k = 1;                        // canvas pixels per dp
    this.drewLast = false;
    this.ready = false;
    this.throttle = false;             // (the page's loop turns it on: a test that steps the game by hand gets every frame drawn)
    this.redraw = true;
    this.lastDraw = 0;
  }

  /** `w` x `h` device pixels of the picture on the window */
  resize(w, h) {
    const ph = Math.max(2, Math.min(MAX_PX_H, Math.round(h))), pw = Math.max(2, Math.round((w * ph) / h));
    if (pw === this.canvas.width && ph === this.canvas.height) return;
    this.canvas.width = pw; this.canvas.height = ph;
    this.k = ph / UI_H;
    this.W = pw / this.k;
    this.tex.dispose();               // (a new size is a new texture: three cannot resize one in place)
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.ready = true;
    this.drewLast = true;
    this.onTexture?.(this.tex);
  }

  /**
   * called once at the start of every frame (Gfx.clearHud). The layer is redrawn at 30 Hz at most (`throttle`, set by the page's own loop): the cards, the gauges and the words change slowly, and drawing and
   * uploading a window-sized canvas is the dearest thing the HUD does. In a frame that does not redraw nothing is cleared and nothing is drawn (`get()` is null): the picture of the frame before stays.
   */
  start() {
    this.used = false;
    const now = performance.now();
    this.redraw = !this.throttle || now - this.lastDraw >= 31;
    if (!this.ready || !this.redraw) return;
    this.lastDraw = now;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (this.drewLast) c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.k, 0, 0, this.k, 0, 0);
    c.textBaseline = 'alphabetic';
  }

  /** the context, in dp (null while the layer is not sized yet, or in a frame that is not redrawn); whoever draws something sets `ui.used = true` */
  get() { return this.ready && this.redraw ? this.ctx : null; }

  /** called by the renderer before the last pass: uploads the canvas when something was drawn (or has to be wiped), tells the shader whether the layer is there */
  finish() {
    if (!this.redraw) { this.on = this.drewLast; return false; }
    const upload = this.used || this.drewLast;
    if (upload) this.tex.needsUpdate = true;
    this.drewLast = !!this.used;
    this.on = !!this.used;
    return upload;
  }
}
