// HUD & on-screen text, drawn into the internal-resolution overlay every frame (so it is pixelated and dithered-free
// like PS1 sprites). Layout adapts to the internal width (4:3 = 320, wide modes = more columns).
import { drawText, measureText, wrapText } from '../engine/textures/font.js';
import { generateUI, drawPanel, drawBar } from '../engine/textures/ui.js';
import { tideDir } from './realm/tide.js';

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
      const icon = hp >= 3 ? I.sparx_yellow : hp === 2 ? I.sparx_blue : I.sparx_green;      // gold (full), then blue, then green, then gone
      if (hp > 0) pix.blit(icon, 7, 24 - (this.pulses.sparx > 0 ? 1 : 0));
      for (let i = 0; i < 3; i++) {
        const on = i < hp;
        const x = 24 + i * 6;
        pix.rect(x, 28, 4, 4, INK);
        pix.rect(x + 1, 29, 2, 2, on ? (hp >= 3 ? '#ffe060' : hp === 2 ? '#6aa0ff' : '#70ff80') : '#3a2a60');
      }
    }
    // ---- beacons ---------------------------------------------------------------------------------------------------
    {
      const total = st.beaconsTotal || 5, [onKey, offKey] = this.game.words.icons;
      const w = total * 14 + 8;
      const x0 = W - w - 4;
      drawPanel(pix, x0, 4, w, 24, { style: 'hud' });
      for (let i = 0; i < total; i++) {
        const lit = i < st.beacons;
        const ic = lit ? I[onKey] : I[offKey];
        const bob = lit && this.pulses.beacons > 0 && i === st.beacons - 1 ? -2 : 0;
        pix.blit(ic, x0 + 6 + i * 14, 8 + bob);
      }
    }
    // ---- the tide (a realm that has one) -----------------------------------------------------------------------------------
    if (g.tide) this._drawTide(pix, W);
    // ---- the trial he is in (systems/trials.js): what it asks of him now, and how far he has got ----------------------------------------
    let top = 4;
    if (g.trials && g.mode === 'play') top = this._drawTrial(pix, W) || 4;
    // ---- the realm's own errand (missions/): what it asks now, and how far he has got ------------------------------------------------------
    if (g.mission && g.mode === 'play') this._drawMission(pix, W, top);
    // ---- the Guardian (the Court's boss) ---------------------------------------------------------------------------------------
    if (g.boss) { this._drawBoss(pix, W); this._drawThreats(pix, W, H); }
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
      // long hints wrap onto extra lines instead of running off the screen
      const lines = wrapText(h.text, W - 30, { style: 'outline' });
      let lw = 0;
      for (const ln of lines) lw = Math.max(lw, measureText(ln, { style: 'outline' }).w);
      const w = lw + 12, ph = 5 + lines.length * 10;
      const x = ((W - w) >> 1);
      const y = H - 11 - ph - (h.t < 0.2 ? Math.round((0.2 - h.t) * 60) : 0);
      drawPanel(pix, x, y, w, ph, { style: 'hud' });
      lines.forEach((ln, i) => drawText(pix, ln, W >> 1, y + 4 + i * 10, { style: 'outline', color: '#fff4ff', outlineColor: INK, align: 'center' }));
    }
    // ---- dialogue ------------------------------------------------------------------------------------------------------
    if (this.dlg) this._drawDialogue(pix);
  }

  /**
   * The Guardian's bar, top centre, while he is awake: his two fists (a block of stone each: lit while it floats, dark once the ram has broken it), and when he stoops the two things that matter for nine
   * seconds: how long the crown stays down (gold, red when it is nearly gone) and how far the flame has taken the lantern (white-hot).
   */
  _drawBoss(pix, W) {
    const s = this.game.boss.hudState();
    if (!s.show) return;
    const w = 122, x = (W - w) >> 1, y = 4, windowOn = s.windowOn, fight = s.mode === 'fight' || s.mode === 'waking';
    drawPanel(pix, x, y, w, windowOn ? 40 : fight ? 28 : 17, { style: 'hud' });
    drawText(pix, 'THE GUARDIAN', x + (w >> 1), y + 4, { style: 'grad', align: 'center', colors: GOLD, outlineColor: INK });
    if (fight) {
      const pulse = (Math.floor(this.t * 4) & 1) === 0;
      s.fists.forEach((alive, i) => {
        const px = x + (w >> 1) - 15 + i * 18, py = y + 15;
        pix.rect(px - 1, py - 1, 14, 10, INK);
        if (alive) { pix.rect(px, py, 12, 8, '#5a4aa8'); pix.rect(px + 1, py + 1, 10, 3, '#8a78d8'); pix.rect(px + 5, py + 3, 2, 3, pulse ? '#e8e0ff' : '#9ae8e0'); } else { pix.rect(px, py, 12, 8, '#241a40'); pix.rect(px + 2, py + 3, 8, 1, '#4a3a78'); }
      });
    } else if (windowOn) {
      const bx = x + 8, bw = w - 16, bar = (by, k, fill, back) => {
        pix.rect(bx - 1, by - 1, bw + 2, 7, INK); pix.rect(bx, by, bw, 5, back);
        const f = Math.round(bw * Math.max(0, Math.min(1, k)));
        if (f > 0) pix.rect(bx, by, f, 5, fill);
        if (f > 1) pix.rect(bx + f - 1, by, 1, 5, '#ffffff');
      };
      bar(y + 15, s.window, s.window < 0.3 ? ((Math.floor(this.t * 6) & 1) ? '#ff5a40' : '#ffa060') : '#ffc03c', '#3a2a60');
      bar(y + 26, s.flame, s.flame > 0.7 ? '#fff4b0' : '#ff8a30', '#3a2a60');
    }
  }

  /**
   * Arrows at the edge of the screen for the Guardian's dangers that are not on it (hud state `threats`: the circles that will fall, the rings that run, the bolts): in the direction of each from the way the
   * camera looks, amber while it is coming and red, bigger and blinking, when it is about to land. A danger in front of the hero is on the floor for him to see, and has no arrow.
   */
  _drawThreats(pix, W, H) {
    const g = this.game, s = g.boss.hudState();
    if (!s.show || !s.threats || !s.threats.length || g.player.dead || g.mode !== 'play') return;
    const p = g.player, yaw = g.cam.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    const blink = (Math.floor(this.t * 8) & 1) === 0;
    let n = 0;
    for (const t of s.threats) {
      const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
      if (d < 1.5) continue;                                                              // (he is standing in it: the floor says so)
      const th = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);                      // 0 straight ahead, positive to the right
      if (Math.abs(th) < 0.8 && d < 26) continue;                                         // (in front of him, near: he sees it)
      if (++n > 6) break;
      const ex = W / 2 + Math.sin(th) * (W / 2 - 20), ey = H / 2 - Math.cos(th) * (H / 2 - 56) + 4;       // (an ellipse inside the screen: the hint panel lives at the bottom edge)
      const col = t.hot ? (blink ? '#ffffff' : '#ff3a2a') : '#ffb030', size = t.hot ? 9 : 7;
      const ux = Math.sin(th), uy = -Math.cos(th);                                        // (the way it points: out of the screen's middle)
      for (let j = -14; j <= 14; j++) for (let i = -14; i <= 14; i++) {
        const a = (i * ux + j * uy) / size, b = (-i * uy + j * ux) / size;                // (a: along the arrow, b: across it)
        if (a < -0.9 || a > 1.0 || Math.abs(b) > (1.0 - a) * 0.8 + 0.05) continue;
        const edge = a < -0.75 || a > 0.85 || Math.abs(b) > (1.0 - a) * 0.8 - 0.1;
        pix.rect(Math.round(ex + i), Math.round(ey + j), 1, 1, edge ? INK : col);
      }
    }
  }

  /** The tide's gauge, under the goals: the water's height between its low and its high (a notch at the mean), and an arrow for the way it is going: orange up while it comes in, green down while it goes out. */
  _drawTide(pix, W) {
    const g = this.game, st = g.stats;
    const w = (st.beaconsTotal || 5) * 14 + 8, x0 = W - w - 4, y0 = 30;
    drawPanel(pix, x0, y0, w, 14, { style: 'hud' });
    const k = Math.max(0, Math.min(1, (g.waterY - g.waterLo) / ((g.waterHi - g.waterLo) || 1)));
    const bx = x0 + 6, bw = w - 12 - 9, by = y0 + 5, fill = Math.round(bw * k);
    pix.rect(bx - 1, by - 1, bw + 2, 6, INK);
    pix.rect(bx, by, bw, 4, '#1c3050');
    if (fill > 0) pix.rect(bx, by, fill, 4, '#5ae0d0');
    if (fill > 1) pix.rect(bx + fill - 1, by, 1, 4, '#d8fff8');
    pix.rect(bx + (bw >> 1), by + 4, 1, 1, '#fff4b0');                                     // (the mean level)
    const up = tideDir(g.tide, g.time) > 0, ax = x0 + w - 9, ay = y0 + 4, col = up ? '#ffb060' : '#70f0c0';
    pix.rect(ax - 1, ay - 1, 7, 7, INK);
    for (let r = 0; r < 3; r++) pix.rect(ax + (up ? 2 - r : r), ay + r, up ? 1 + 2 * r : 5 - 2 * r, 1, col);
  }

  /** The trial he is in, top centre: one line of what it asks now (BELLS 2 OF 4, PYLONS 3 OF 6 and the seconds left...), a pip for each part done, or the clock as a bar that runs down (red in its last quarter). */
  _drawTrial(pix, W) {
    const s = this.game.trials.hudState();
    if (!s) return 0;
    const tw = measureText(s.text, { style: 'grad' }).w, w = Math.max(96, tw + 16), x = (W - w) >> 1, y = 4;
    const bar = s.clock !== null && s.clock !== undefined, pips = !bar && s.of >= 2 && s.of <= 12 && s.kind !== 'mirrors';
    drawPanel(pix, x, y, w, bar || pips ? 25 : 17, { style: 'hud' });
    drawText(pix, s.text, x + (w >> 1), y + 4, { style: 'grad', align: 'center', colors: GOLD, outlineColor: INK });
    if (bar) {
      const bx = x + 8, bw = w - 16, k = Math.max(0, Math.min(1, s.clock / (s.total || 1))), f = Math.round(bw * k), hot = k < 0.25 && (Math.floor(this.t * 6) & 1) === 0;
      pix.rect(bx - 1, y + 15, bw + 2, 7, INK); pix.rect(bx, y + 16, bw, 5, '#3a2a60');
      if (f > 0) pix.rect(bx, y + 16, f, 5, k < 0.25 ? (hot ? '#ffffff' : '#ff5a40') : '#ffc03c');
    } else if (pips) {
      const step = Math.min(10, Math.floor((w - 12) / s.of)), x0 = x + ((w - step * s.of + 2) >> 1);
      for (let i = 0; i < s.of; i++) { pix.rect(x0 + i * step, y + 16, step - 2, 5, INK); pix.rect(x0 + i * step + 1, y + 17, step - 4, 3, i < s.n ? '#ffc03c' : '#3a2a60'); }
    }
    return y + (bar || pips ? 25 : 17) + 3;                                                  // (where the next line may begin)
  }

  /** The mission's line (a sprite freed, a brute's wounds, a bell rung, a pearl carried): one line of text and a pip for each part done, under the trial's if one is on. */
  _drawMission(pix, W, y) {
    const s = this.game.mission.hudState();
    if (!s) return;
    const tw = measureText(s.text, { style: 'grad' }).w, w = Math.max(96, tw + 16), x = (W - w) >> 1;
    const pips = s.of >= 2 && s.of <= 12;
    drawPanel(pix, x, y, w, pips ? 25 : 17, { style: 'hud' });
    drawText(pix, s.text, x + (w >> 1), y + 4, { style: 'grad', align: 'center', colors: GOLD, outlineColor: INK });
    if (pips) {
      const step = Math.min(10, Math.floor((w - 12) / s.of)), x0 = x + ((w - step * s.of + 2) >> 1);
      for (let i = 0; i < s.of; i++) { pix.rect(x0 + i * step, y + 16, step - 2, 5, INK); pix.rect(x0 + i * step + 1, y + 17, step - 4, 3, i < s.n ? '#ffc03c' : '#3a2a60'); }
    }
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
