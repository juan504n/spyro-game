// HUD & on-screen text, drawn into the internal-resolution overlay every frame (so it is pixelated and dithered-free
// like PS1 sprites). Layout adapts to the internal width (4:3 = 320, wide modes = more columns).
import { drawText, measureText, wrapText } from '../engine/textures/font.js';
import { generateUI, drawPanel, drawBar } from '../engine/textures/ui.js';

const GOLD = ['#fff4b0', '#ffc03c', '#e07818'];
const LILAC = ['#f4eeff', '#b8a8e8'];
const INK = '#120c1c';

export class Hud {
  constructor(game) {
    this.game = game;
    this.icons = generateUI();
    this.pulses = { gems: 0, sparx: 0, beacons: 0 };
    this.bannerState = null;
    this.hintState = null;
    this.dlg = null;
    this.visible = true;
    this.t = 0;
    this.shownGems = 0;
  }

  pulse(kind) { this.pulses[kind] = 1; }

  /** Big centre banner: title (+ optional sub line). */
  banner(title, sub = '', dur = 3.2) { this.bannerState = { title, sub, t: 0, dur }; }
  /** Same as banner but framed as a speech-less announcement. */
  say(title, sub, dur = 3) { this.banner(title, sub, dur); }

  hint(text, dur = 5.5) { this.hintState = { text, t: 0, dur }; }

  /**
   * Start a dialogue. pages = array of strings; speaker = name plate text; onDone called when finished.
   * The game should lock the player while a dialogue is open (see Game.startDialogue).
   */
  dialogue(speaker, pages, onDone) {
    this.dlg = { speaker, pages, page: 0, chars: 0, t: 0, onDone, wait: 0.25 };
  }
  get talking() { return !!this.dlg; }

  update(dt, input) {
    this.t += dt;
    for (const k of Object.keys(this.pulses)) this.pulses[k] = Math.max(0, this.pulses[k] - dt * 3.2);
    if (this.bannerState) { this.bannerState.t += dt; if (this.bannerState.t > this.bannerState.dur) this.bannerState = null; }
    if (this.hintState) { this.hintState.t += dt; if (this.hintState.t > this.hintState.dur) this.hintState = null; }
    const d = this.dlg;
    if (d) {
      d.t += dt; d.wait -= dt;
      const text = d.pages[d.page];
      const full = text.length;
      if (d.chars < full) {
        const prev = Math.floor(d.chars);
        d.chars = Math.min(full, d.chars + dt * 46);
        if (Math.floor(d.chars) !== prev && Math.floor(d.chars) % 2 === 0) this.game.audio?.sfx('dialog_blip', { vol: 0.35, pitch: 0.9 + ((Math.floor(d.chars) * 7) % 5) * 0.06 });
      }
      if (d.wait <= 0 && (input.pressed('confirm') || input.pressed('jump') || input.pressed('flame'))) {
        if (d.chars < full) d.chars = full;
        else if (d.page < d.pages.length - 1) { d.page++; d.chars = 0; this.game.audio?.sfx('ui_select', { vol: 0.5 }); }
        else { const cb = d.onDone; this.dlg = null; this.game.audio?.sfx('ui_back', { vol: 0.5 }); if (cb) cb(); }
      }
    }
  }

  /** Draw everything into the overlay `pix` (gfx.hud). */
  draw(pix) {
    if (!this.visible) return;
    const g = this.game;
    const W = pix.w, H = pix.h;
    const st = g.stats;
    const I = this.icons;

    // ---- gems -------------------------------------------------------------------------------------------------
    {
      const bump = this.pulses.gems > 0 ? 1 : 0;
      drawPanel(pix, 4, 4, 78, 17, { style: 'hud' });
      pix.blit(I.gem_gold, 8, 6 - bump);
      const n = String(st.gems);
      const w = drawText(pix, n, 23, 7 - bump, { style: 'grad', colors: this.pulses.gems > 0.4 ? ['#ffffff', '#fff4b0', '#ffc03c'] : GOLD, outlineColor: INK }).w;
      drawText(pix, '/' + st.gemsTotal, 23 + w + 2, 9, { style: 'outline', color: '#c8bce8', outlineColor: INK });
    }
    // ---- Sparx health ---------------------------------------------------------------------------------------------
    {
      const hp = g.sparx ? g.sparx.hp : 0;
      drawPanel(pix, 4, 23, 40, 15, { style: 'hud' });
      const icon = hp >= 3 ? I.sparx_blue : hp === 2 ? I.sparx_green : I.sparx_yellow;
      if (hp > 0) pix.blit(icon, 7, 24 - (this.pulses.sparx > 0 ? 1 : 0));
      for (let i = 0; i < 3; i++) {
        const on = i < hp;
        const x = 24 + i * 6;
        pix.rect(x, 28, 4, 4, INK);
        pix.rect(x + 1, 29, 2, 2, on ? (hp >= 3 ? '#6aa0ff' : hp === 2 ? '#70ff80' : '#ffe860') : '#3a2a60');
      }
    }
    // ---- beacons ---------------------------------------------------------------------------------------------------
    {
      const w = 5 * 14 + 8;
      const x0 = W - w - 4;
      drawPanel(pix, x0, 4, w, 24, { style: 'hud' });
      for (let i = 0; i < 5; i++) {
        const lit = i < st.beacons;
        const ic = lit ? I.lantern_on : I.lantern_off;
        const bob = lit && this.pulses.beacons > 0 && i === st.beacons - 1 ? -2 : 0;
        pix.blit(ic, x0 + 6 + i * 14, 8 + bob);
      }
    }
    // ---- banner ------------------------------------------------------------------------------------------------------
    if (this.bannerState) {
      const b = this.bannerState;
      const k = Math.min(1, b.t / 0.18);
      const out = b.t > b.dur - 0.4 ? Math.max(0, (b.dur - b.t) / 0.4) : 1;
      if (out > 0.05) {
        const sc = k < 1 ? 1 : 2;
        const y = Math.round(H * 0.24) - (k < 1 ? 6 : 0);
        drawText(pix, b.title, W >> 1, y, { style: 'grad', scale: sc, align: 'center', colors: GOLD, outlineColor: INK, clip: out < 1 ? { x: 0, y: 0, w: W, h: Math.round(H * 0.24 + 40 * out) } : undefined });
        if (b.sub && out > 0.4) drawText(pix, b.sub, W >> 1, y + (sc === 2 ? 22 : 14), { style: 'grad', align: 'center', colors: LILAC, outlineColor: INK });
      }
    }
    // ---- hint ----------------------------------------------------------------------------------------------------------
    if (this.hintState && !this.dlg) {
      const h = this.hintState;
      const m = measureText(h.text, { style: 'outline' });
      const w = m.w + 12;
      const x = ((W - w) >> 1);
      const y = H - 26 - (h.t < 0.2 ? Math.round((0.2 - h.t) * 60) : 0);
      drawPanel(pix, x, y, w, 15, { style: 'hud' });
      drawText(pix, h.text, W >> 1, y + 4, { style: 'outline', color: '#fff4ff', outlineColor: INK, align: 'center' });
    }
    // ---- dialogue ------------------------------------------------------------------------------------------------------
    if (this.dlg) this._drawDialogue(pix);
  }

  _drawDialogue(pix) {
    const d = this.dlg;
    const W = pix.w, H = pix.h;
    const bw = Math.min(W - 16, 300), bh = 54;
    const x = (W - bw) >> 1, y = H - bh - 8;
    // name plate
    const nm = measureText(d.speaker, { style: 'grad' });
    drawPanel(pix, x + 6, y - 11, nm.w + 12, 14, { style: 'menu' });
    drawText(pix, d.speaker, x + 12, y - 8, { style: 'grad', colors: GOLD, outlineColor: INK });
    const inner = drawPanel(pix, x, y, bw, bh, { style: 'dialog' });
    const text = d.pages[d.page].slice(0, Math.floor(d.chars));
    const full = d.pages[d.page];
    // wrap on the full text so words don't jump lines while typing
    const lines = wrapText(full, inner.w - 8, { style: 'shadow' });
    let shown = 0;
    let ty = inner.y + 5;
    for (const ln of lines) {
      const part = text.slice(shown, shown + ln.length);
      shown += ln.length + (full[shown + ln.length] === ' ' ? 1 : 0);
      if (part) drawText(pix, part, inner.x + 5, ty, { style: 'shadow', color: '#fff8ff', shadowColor: INK });
      ty += 10;
    }
    if (d.chars >= full.length && Math.floor(this.t * 3) % 2 === 0) {
      const tx = x + bw - 14, tyy = y + bh - 12;
      pix.rect(tx, tyy, 5, 1, '#ffc03c'); pix.rect(tx + 1, tyy + 1, 3, 1, '#ffc03c'); pix.rect(tx + 2, tyy + 2, 1, 1, '#ffc03c');
    }
  }

  /** Boot / loading bar. */
  static drawLoading(pix, frac, label = 'LOADING') {
    const W = pix.w, H = pix.h;
    pix.rect(0, 0, W, H, '#000000');
    drawText(pix, label, W >> 1, (H >> 1) - 22, { style: 'grad', scale: 2, align: 'center', colors: GOLD, outlineColor: INK });
    drawBar(pix, (W >> 1) - 60, (H >> 1) + 2, 120, 10, frac);
  }
}
