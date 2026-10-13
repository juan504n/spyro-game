// THE HUD: what plays over the game, drawn on the UI layer (engine/uilayer.js) at the window's own resolution, in a layout space 720 dp high: translucent glass panels, thin light borders, slim pill
// gauges, a clean sans type. (The menus, the title and the end screens are the retro pixel HUD still: engine/textures/ui.js.) The gems and Sparx's health are not here while playing: they are on the
// pause screen's card (and the gems pop up in 3D when picked up: gemcounter.js); what stays is what the hero is doing now - the realm's task, the trial, the tide, the Guardian - and the words the game says.
import { drawText } from '../engine/textures/font.js';
import { generateUI, drawBar } from '../engine/textures/ui.js';
import { tideDir } from './realm/tide.js';
import { T, font, clamp01, ease, rr, panel, gauge, txt, measure, wrap, gemIcon, sparxIcon, flameIcon } from '../engine/uikit.js';
import { touchClear } from './menu.js';

const GOLD = ['#fff4b0', '#ffc03c', '#e07818'];
const INK = '#120c1c';

export class Hud {
  constructor(game) {
    this.game = game;
    this.icons = generateUI();                    // (the retro icon atlas: the results screens still use it)
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

  /** Draw everything that plays over the game onto the UI layer `ui` (gfx.ui). The pixel overlay (menus, title) is not touched. */
  draw(ui) {
    const c = ui.get();
    if (!c || !this.visible) return;
    if (this._drawAll(c, ui.W, 720)) ui.used = true;
  }

  _drawAll(c, W, H) {
    const g = this.game;
    let drew = false;
    // on a touch screen the MENU button may sit on the frame's top edge: the middle column starts below it
    let midTop = 20;
    if (g.input && g.input.menuBtn && g.input.menuBtn.style.display !== 'none') {          // (the touch MENU button is there)
      try { midTop = Math.max(midTop, touchClear(g.gfx.frameCss()) * 3 + 8); } catch (e) { /* no frame yet */ }
    }
    // ---- the lanterns of a realm whose task is lighting them (a realm with a task of its own has no row of them) ---------------------------------------------------------------------
    let right = 20;
    if (!g.objective && g.stats && !g.paused) { right = this._drawBeacons(c, W, 20) + 12; drew = true; }
    // ---- the tide (a realm that has one) ------------------------------------------------------------------------------------------------------------------------------------------------
    if (g.tide) { this._drawTide(c, W, right); drew = true; }
    // ---- the trial he is in, and the realm's own task, in the middle column -----------------------------------------------------------------------------------------------------------
    let y = midTop;
    if (g.trials && g.mode === 'play') { const y2 = this._drawTrial(c, W, y); if (y2) { y = y2; drew = true; } }
    if (g.objective && g.mode === 'play') { const y2 = this._drawObjective(c, W, y); if (y2) { y = y2; drew = true; } }
    // ---- the Guardian (the Court's boss) -------------------------------------------------------------------------------------------------------------------------------------------------
    if (g.boss) { drew = this._drawBoss(c, W, midTop) || drew; this._drawThreats(c, W, H); drew = true; }
    // ---- the banner, the hint and the dialogue ------------------------------------------------------------------------------------------------------------------------------------
    if (this.bannerState) { this._drawBanner(c, W, H); drew = true; }
    if (this.hintState && !this.dlg) { this._drawHint(c, W, H); drew = true; }
    if (this.dlg) { this._drawDialogue(c, W, H); drew = true; }
    return drew;
  }

  // ---- the lanterns --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  /** top right: a ring for each lantern, a flame where it burns; returns the panel's left edge's distance from the right edge */
  _drawBeacons(c, W, top) {
    const st = this.game.stats, total = st.beaconsTotal || 5, step = 30, w = total * step + 22, h = 48, x0 = W - 20 - w;
    panel(c, x0, top, w, h, { r: 24 });
    for (let i = 0; i < total; i++) {
      const lit = i < st.beacons, pulse = lit && this.pulses.beacons > 0 && i === st.beacons - 1 ? this.pulses.beacons : 0;
      flameIcon(c, x0 + 11 + step / 2 + i * step, top + h / 2 + 1 - pulse * 3, 15, lit, pulse);
    }
    return w + 20;
  }

  // ---- the tide ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  /** the water's height between its low and its high (a notch at the mean) and an arrow for the way it is going: orange up while it comes in, green down while it goes out */
  _drawTide(c, W, right) {
    const g = this.game, w = 214, h = 48, x0 = W - 20 - w, y0 = g.objective ? 20 : (g.stats ? 20 + 48 + 12 : 20);
    panel(c, x0, y0, w, h, { r: 24 });
    // a wave
    c.save(); c.strokeStyle = T.teal0; c.lineWidth = 2.5; c.lineCap = 'round'; c.beginPath();
    for (let i = 0; i <= 18; i++) { const px = x0 + 20 + i, py = y0 + h / 2 + Math.sin(i * 0.5 + this.t * 2) * 4; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
    c.stroke(); c.restore();
    const k = clamp01((g.waterY - g.waterLo) / ((g.waterHi - g.waterLo) || 1));
    gauge(c, x0 + 52, y0 + h / 2 - 4, w - 52 - 46, 8, k, { c0: T.teal0, c1: T.teal1, glow: 'rgba(53,201,192,0.6)', notch: 0.5 });
    const up = tideDir(g.tide, g.time) > 0, ax = x0 + w - 26, ay = y0 + h / 2;
    c.save(); c.fillStyle = up ? T.amber : '#70f0c0'; c.beginPath();
    if (up) { c.moveTo(ax - 8, ay + 5); c.lineTo(ax + 8, ay + 5); c.lineTo(ax, ay - 7); } else { c.moveTo(ax - 8, ay - 5); c.lineTo(ax + 8, ay - 5); c.lineTo(ax, ay + 7); }
    c.closePath(); c.fill(); c.restore();
  }

  // ---- the trial and the task ------------------------------------------------------------------------------------------------------------------------------------------------------
  /** the card: one line of what is asked now, under it a gauge or a pip for each part done; returns where the next card may begin */
  _card(c, W, y, s, o) {
    const size = 20, tw = measure(c, s.text, size, 700, 1.2), bar = o.bar !== undefined, pips = o.pips;
    const w = Math.min(W - 40, Math.max(300, tw + 64)), h = bar || pips ? 70 : 46, x = (W - w) / 2;
    panel(c, x, y, w, h, { r: 18, accent: o.accent });
    txt(c, s.text, W / 2, y + 30, { size, weight: 700, align: 'center', track: 1.2, max: w - 48 });
    const bx = x + 28, bw = w - 56, by = y + 46;
    if (bar) {
      const k = clamp01(o.bar), low = k < 0.25, flash = low && (Math.floor(this.t * 6) & 1) === 0;
      gauge(c, bx, by, bw, 9, k, low ? { c0: flash ? '#ffffff' : '#ff9a80', c1: T.hot, glow: 'rgba(255,106,79,0.6)' } : {});
    } else if (pips) {
      const n = s.of, gap = 6, pw = Math.min(30, (bw - gap * (n - 1)) / n), x0 = x + (w - (pw * n + gap * (n - 1))) / 2;
      for (let i = 0; i < n; i++) {
        const on = i < s.n;
        rr(c, x0 + i * (pw + gap), by, pw, 9, 4.5);
        if (on) { const g = c.createLinearGradient(0, by, 0, by + 9); g.addColorStop(0, T.gold0); g.addColorStop(1, T.gold1); c.save(); c.shadowColor = 'rgba(255,184,58,0.5)'; c.shadowBlur = 8; c.fillStyle = g; c.fill(); c.restore(); } else { c.fillStyle = T.track; c.fill(); }
      }
    }
    return y + h + 10;
  }

  _drawTrial(c, W, y) {
    const s = this.game.trials.hudState();
    if (!s) return 0;
    const clock = s.clock !== null && s.clock !== undefined, pips = !clock && s.of >= 2 && s.of <= 12 && s.kind !== 'mirrors';
    return this._card(c, W, y, s, { bar: clock ? clamp01(s.clock / (s.total || 1)) : undefined, pips, accent: T.gold1 });
  }

  _drawObjective(c, W, y) {
    const s = this.game.objective.hudState();
    if (!s) return 0;
    const bar = s.bar !== undefined, pips = !bar && s.of >= 2 && s.of <= 12;
    return this._card(c, W, y, s, { bar: bar ? s.bar : undefined, pips, accent: T.gold1 });
  }

  // ---- the Guardian -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  /** his two fists (a block of stone each: lit while it floats, dark once the ram has broken it), and when he stoops the two things that matter: how long the crown stays down and how far the flame has taken the lantern */
  _drawBoss(c, W, top) {
    const s = this.game.boss.hudState();
    if (!s.show) return false;
    const w = 380, x = (W - w) / 2, y = top, windowOn = s.windowOn, fight = s.mode === 'fight' || s.mode === 'waking';
    const h = windowOn ? 104 : fight ? 84 : 46;
    panel(c, x, y, w, h, { r: 18, accent: '#b08cff' });
    txt(c, 'THE GUARDIAN', W / 2, y + 30, { size: 19, weight: 800, align: 'center', track: 3, color: '#efe6ff' });
    if (fight) {
      const pulse = (Math.floor(this.t * 4) & 1) === 0;
      s.fists.forEach((alive, i) => {
        const px = W / 2 - 46 + i * 56, py = y + 44;
        rr(c, px, py, 36, 26, 8);
        if (alive) { const g = c.createLinearGradient(0, py, 0, py + 26); g.addColorStop(0, '#9a86ee'); g.addColorStop(1, '#4f3fa8'); c.save(); c.shadowColor = pulse ? 'rgba(200,190,255,0.9)' : 'rgba(120,230,220,0.7)'; c.shadowBlur = 12; c.fillStyle = g; c.fill(); c.restore(); } else { c.fillStyle = 'rgba(255,255,255,0.1)'; c.fill(); }
      });
    } else if (windowOn) {
      const bx = x + 28, bw = w - 56;
      gauge(c, bx, y + 46, bw, 10, s.window, s.window < 0.3 ? { c0: '#ffa060', c1: T.hot, glow: 'rgba(255,106,79,0.6)' } : {});
      gauge(c, bx, y + 72, bw, 10, s.flame, s.flame > 0.7 ? { c0: '#ffffff', c1: '#fff0a0', glow: 'rgba(255,255,200,0.7)' } : { c0: '#ffb060', c1: '#ff7a2e', glow: 'rgba(255,122,46,0.6)' });
    }
    return true;
  }

  /**
   * Arrows at the edge of the screen for the Guardian's dangers that are not on it (hud state `threats`): in the direction of each from the way the camera looks, amber while it is coming and red, bigger and
   * blinking, when it is about to land. A danger in front of the hero is on the floor for him to see, and has no arrow.
   */
  _drawThreats(c, W, H) {
    const g = this.game, s = g.boss.hudState();
    if (!s.show || !s.threats || !s.threats.length || g.player.dead || g.mode !== 'play') return;
    const p = g.player, yaw = g.cam.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    const blink = (Math.floor(this.t * 8) & 1) === 0;
    let n = 0;
    for (const t of s.threats) {
      const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
      if (d < 1.5) continue;
      const th = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
      if (Math.abs(th) < 0.8 && d < 26) continue;
      if (++n > 6) break;
      const ex = W / 2 + Math.sin(th) * (W / 2 - 64), ey = H / 2 - Math.cos(th) * (H / 2 - 170) + 12;
      const col = t.hot ? (blink ? '#ffffff' : '#ff3a2a') : '#ffb030', size = t.hot ? 26 : 20;
      c.save(); c.translate(ex, ey); c.rotate(Math.atan2(Math.sin(th), -Math.cos(th)) + Math.PI / 2);
      c.shadowColor = col; c.shadowBlur = 14; c.fillStyle = col; c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -size); c.lineTo(size * 0.8, size * 0.7); c.lineTo(0, size * 0.28); c.lineTo(-size * 0.8, size * 0.7); c.closePath(); c.stroke(); c.fill();
      c.restore();
    }
  }

  // ---- words -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  _drawBanner(c, W, H) {
    const b = this.bannerState, k = ease(b.t / 0.28), out = b.t > b.dur - 0.45 ? clamp01((b.dur - b.t) / 0.45) : 1;
    if (out < 0.02) return;
    const a = k * out, cy = H * 0.27, size0 = 58, maxW = W - 80;
    c.save();
    c.globalAlpha = a;
    // a soft dark bloom behind the words, so that they read on any sky
    const g = c.createRadialGradient(W / 2, cy, 10, W / 2, cy, Math.min(W * 0.5, 520));
    g.addColorStop(0, 'rgba(8,10,24,0.5)'); g.addColorStop(1, 'rgba(8,10,24,0)');
    c.fillStyle = g; c.fillRect(0, cy - 190, W, 380);
    c.translate(W / 2, cy + (1 - k) * 14); const s = 0.94 + 0.06 * k; c.scale(s, s); c.translate(-W / 2, -cy);
    const px = txt(c, b.title, W / 2, cy, { size: size0, weight: 800, align: 'center', track: 1.5, max: maxW, blur: 22 });
    // the rule under the title
    const tw = Math.min(maxW, measure(c, b.title, px, 800, 1.5)), lw = Math.min(tw, 260);
    const lg = c.createLinearGradient(W / 2 - lw / 2, 0, W / 2 + lw / 2, 0); lg.addColorStop(0, 'rgba(255,184,58,0)'); lg.addColorStop(0.5, T.gold0); lg.addColorStop(1, 'rgba(255,184,58,0)');
    c.fillStyle = lg; c.fillRect(W / 2 - lw / 2, cy + 16, lw, 3);
    if (b.sub && out > 0.4) txt(c, b.sub, W / 2, cy + 52, { size: 24, weight: 500, align: 'center', color: 'rgba(236,240,255,0.88)', track: 1.2, max: maxW });
    c.restore();
  }

  _drawHint(c, W, H) {
    const h = this.hintState, k = ease(h.t / 0.25), out = h.t > h.dur - 0.4 ? clamp01((h.dur - h.t) / 0.4) : 1;
    if (out < 0.02) return;
    const size = 21, maxW = Math.min(W - 120, 820), lines = wrap(c, h.text, maxW - 56, size, 500), lh = 29;
    let lw = 0; for (const ln of lines) lw = Math.max(lw, measure(c, ln, size, 500));
    const w = lw + 56, ph = 26 + lines.length * lh, x = (W - w) / 2, y = H - 36 - ph + (1 - k) * 26;
    c.save(); c.globalAlpha = k * out;
    panel(c, x, y, w, ph, { r: 20, accent: T.gold1 });
    lines.forEach((ln, i) => txt(c, ln, x + 30, y + 13 + lh * (i + 0.72), { size, weight: 500, shadow: false }));
    c.restore();
  }

  _drawDialogue(c, W, H) {
    const d = this.dlg, full = d.pages[d.page], size = 23, lh = 33;
    const bw = Math.min(W - 80, 940), x = (W - bw) / 2;
    const lines = wrap(c, full, bw - 70, size, 500), bh = 40 + Math.max(2, lines.length) * lh, y = H - bh - 34;
    panel(c, x, y, bw, bh, { r: 24 });
    // the name plate
    c.font = font(17, 800); const nw = measure(c, d.speaker, 17, 800, 2) + 36;
    c.save();
    rr(c, x + 24, y - 18, nw, 36, 18);
    const g = c.createLinearGradient(0, y - 18, 0, y + 18); g.addColorStop(0, T.gold0); g.addColorStop(1, T.gold1);
    c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = 10; c.shadowOffsetY = 3; c.fillStyle = g; c.fill(); c.restore();
    txt(c, d.speaker, x + 24 + nw / 2, y + 6, { size: 17, weight: 800, align: 'center', color: '#2a1a08', track: 2, shadow: false });
    // the words, typed (wrapped on the full text so that a word does not jump line while it is typed)
    const text = full.slice(0, Math.floor(d.chars));
    let shown = 0;
    lines.forEach((ln, i) => {
      const part = text.slice(shown, shown + ln.length);
      shown += ln.length + (full[shown + ln.length] === ' ' ? 1 : 0);
      if (part) txt(c, part, x + 35, y + 44 + i * lh, { size, weight: 500, shadow: false });
    });
    if (d.chars >= full.length && Math.floor(this.t * 3) % 2 === 0) {
      const tx = x + bw - 40, ty = y + bh - 26;
      c.save(); c.fillStyle = T.gold1; c.beginPath(); c.moveTo(tx - 8, ty - 5); c.lineTo(tx + 8, ty - 5); c.lineTo(tx, ty + 6); c.closePath(); c.fill(); c.restore();
    }
  }

  /** Boot / loading bar (the retro overlay: nothing else is drawn yet). */
  static drawLoading(pix, frac, label = 'LOADING') {
    const W = pix.w, H = pix.h;
    pix.rect(0, 0, W, H, '#000000');
    drawText(pix, label, W >> 1, (H >> 1) - 22, { style: 'grad', scale: 2, align: 'center', colors: GOLD, outlineColor: INK });
    drawBar(pix, (W >> 1) - 60, (H >> 1) + 2, 120, 10, frac);
  }
}
