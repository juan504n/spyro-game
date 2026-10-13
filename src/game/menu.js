// Tiny menu system drawn into the HUD overlay: pages of items (action / toggle / choice / slider).
import { measureText } from '../engine/textures/font.js';
import { T, rr, panel, gauge, txt, measure, gemIcon, sparxIcon, flameIcon } from '../engine/uikit.js';
import { MENU_BTN_H, menuButtonPlace } from './input.js';

/** the pause page's strip of what the hero has, in HUD lines */
const STATS_H = 25;
/** A finger-sized menu row, in CSS pixels (Apple asks for 44, Material 48; 40 still fits a seven-row page in a phone's 390 px of height). */
export const TOUCH_ROW_PX = 40;

/**
 * HUD lines at the top of the game frame that the touch MENU button covers (plus a little air): menus and the title logo start below
 * them. `f` = gfx.frameCss(). None when the button sits under the picture (the usual 8); otherwise from the frame's top edge down to the
 * button's bottom edge, wherever the button is (menuButtonPlace: 4 lines below the frame's top, at least 8 px from the top of the page
 * and below the platform's safe area).
 */
export function touchClear(f) {
  const p = menuButtonPlace(f);
  return p.below ? 8 : Math.ceil((p.top - f.top + MENU_BTN_H) / f.unit + 3);
}

export class Menu {
  /** @param {object} app { game, icons } — pages are pushed with open() */
  constructor(game) {
    this.game = game;
    this.stack = [];
    this.prev = { up: false, down: false, left: false, right: false };
    this.t = 0;
  }

  get active() { return this.stack.length > 0; }
  open(page) {
    if (!this.stack.length) {
      // a tap made while playing leaves its flags set (nothing else consumes them): without this, the first frame of a menu that was just opened
      // would take that old tap as a click, and close it (or press a row) at once
      const P = this.game.input.ptr;
      P.tap = false; P.moved = false;
    }
    this.stack.push({ ...page, sel: page.sel || 0 });          // (a page can start with another row chosen: ARE YOU SURE? starts on NO)
    this.game.audio?.sfx('ui_select', { vol: 0.5 });
  }
  close() { this.stack.pop(); this.game.audio?.sfx('ui_back', { vol: 0.5 }); }
  closeAll() { this.stack.length = 0; }

  /** returns true if the menu consumed input this frame */
  update(dt, input, snap = null) {
    if (!this.active) return false;
    const pressed = (a) => (snap ? snap[a] : input.pressed(a));
    const confirm = snap ? snap.confirmKey : input.pressed('confirm');      // (mouse/touch choose rows by position instead)
    this.t += dt;
    const page = this.stack[this.stack.length - 1];
    const m = input.move;
    const now = { up: m.y > 0.6, down: m.y < -0.6, left: m.x < -0.6, right: m.x > 0.6 };
    const edge = (k) => now[k] && !this.prev[k];
    const items = page.items.filter((it) => !it.hidden || !it.hidden());
    const g = this.game;
    if (edge('up')) { page.sel = (page.sel + items.length - 1) % items.length; g.audio?.sfx('ui_move', { vol: 0.4 }); }
    if (edge('down')) { page.sel = (page.sel + 1) % items.length; g.audio?.sfx('ui_move', { vol: 0.4 }); }
    this._pointer(input, page, items);
    const it = items[page.sel];
    if (it) {
      const dir = edge('right') ? 1 : edge('left') ? -1 : 0;
      if (it.type === 'choice' && dir) { it.set(((it.options.indexOf(it.get()) + dir + it.options.length) % it.options.length), it.options); g.audio?.sfx('ui_move', { vol: 0.4 }); }
      if (it.type === 'slider' && dir) { it.set(Math.max(0, Math.min(1, it.get() + dir * 0.1))); g.audio?.sfx('ui_move', { vol: 0.4 }); }
      if (confirm || pressed('jump')) {
        if (it.type === 'action') { g.audio?.sfx('ui_select', { vol: 0.6 }); it.action(this); }
        else if (it.type === 'choice') { it.set((it.options.indexOf(it.get()) + 1) % it.options.length, it.options); g.audio?.sfx('ui_move', { vol: 0.4 }); }
        else if (it.type === 'toggle') { it.set(!it.get()); g.audio?.sfx('ui_move', { vol: 0.4 }); }
      }
    }
    if (pressed('back') || (pressed('pause') && page.closable !== false)) { if (page.onBack) page.onBack(this); else this.close(); }
    this.prev = now;
    return true;
  }

  /** Is a finger driving the menu? Then its rows are made big enough to tap (see layout). */
  get finger() { return this.game.input.lastDevice === 'touch'; }

  /** Panel geometry in internal pixels (also used for pointer hit-testing and by pages that draw extra lines). */
  layout(W, H, page, items) {
    const f = this.game.gfx.frameCss();
    const top = this.finger ? touchClear(f) : 8;                        // (below the touch MENU button)
    const want = this.finger ? Math.ceil(TOUCH_ROW_PX / Math.max(0.5, f.unit)) : 13;
    // a finger needs ~40 CSS px per row: the HUD is a fixed 240 lines high however big the screen is, so that is a different number of lines on
    // a phone (1.6 px per line: 25 lines) than on a desktop window (4.5 px: 9, i.e. the ordinary 13-line rows). The pause page's strip of gems and Sparx is left out where it would take that from the rows.
    const mk = (stats) => {
      const extraH = (page.extra ? page.extra.length * 10 + 6 : 0) + (stats ? STATS_H : 0);         // room for a page's own text block (and the pause page's strip) above the rows
      const foot = page.footer ? 12 : 0;
      const chrome = page.dense ? 28 : 34;                                // (a page that is nothing but rows, the worlds of TRAVEL, gives up some of the room round its title so that seven rows stay finger-sized on a phone held upright)
      const room = Math.floor((H - top - 8 - chrome - extraH - foot) / Math.max(1, items.length));      // (long pages tighten up to fit)
      const rowH = Math.max(10, Math.min(Math.max(13, Math.min(want, 30)), room));
      return { stats, extraH, foot, chrome, rowH, room };
    };
    let m = mk(!!page.stats);
    if (page.stats && m.room < Math.min(want, 30)) m = mk(false);
    const { extraH, foot, chrome, rowH, stats } = m;
    const w = Math.min(W - 24, page.width || 230);
    const h = chrome + extraH + items.length * rowH + foot;
    const x = (W - w) >> 1, y = Math.max(top, (H - h) >> 1);
    return { x, y, w, h, rowH, extraH, stats, rows0: y + (page.dense ? 22 : 26) + extraH };
  }

  /** client (CSS px) -> internal pixels, the inverse of what Gfx.resize() sets up */
  _toInternal(cx, cy) {
    const gfx = this.game.gfx, dpr = Math.min(window.devicePixelRatio || 1, 3);
    const [x0, y0, rw, rh] = gfx.rect;
    const top = gfx.devH - (y0 + rh);
    return [(cx * dpr - x0) * gfx.hud.w / rw, (cy * dpr - top) * gfx.hud.h / rh];      // (HUD layout space, not scene pixels)
  }

  /** Mouse hover / click and touch taps pick rows directly. */
  _pointer(input, page, items) {
    const P = input.ptr;
    if (!P || P.x < 0 || (!P.moved && !P.tap)) return;
    const g = this.game, gfx = g.gfx;
    const [ix, iy] = this._toInternal(P.x, P.y);
    const L = this.layout(gfx.hud.w, gfx.hud.h, page, items);
    const inside = ix >= L.x && ix <= L.x + L.w && iy >= L.y && iy <= L.y + L.h;
    const row = inside ? Math.floor((iy - (L.rows0 - 2)) / L.rowH) : -1;
    const hit = row >= 0 && row < items.length ? row : -1;
    if (P.moved && hit >= 0 && hit !== page.sel) { page.sel = hit; g.audio?.sfx('ui_move', { vol: 0.4 }); }
    if (P.tap) {
      if (hit >= 0) {
        page.sel = hit;
        const it = items[hit], frac = (ix - L.x) / L.w;
        if (it.type === 'action') { g.audio?.sfx('ui_select', { vol: 0.6 }); it.action(this); }
        else if (it.type === 'toggle') { it.set(!it.get()); g.audio?.sfx('ui_move', { vol: 0.4 }); }
        else if (it.type === 'choice') {
          const dir = frac < 0.55 ? -1 : 1;                          // left of the middle steps back, right steps forward
          it.set((it.options.indexOf(it.get()) + dir + it.options.length) % it.options.length, it.options);
          g.audio?.sfx('ui_move', { vol: 0.4 });
        } else if (it.type === 'slider') {
          const bx = L.x + L.w - 84;
          it.set(Math.max(0, Math.min(1, ix >= bx - 4 ? Math.round(((ix - bx) / 68) * 10) / 10 : it.get() - 0.1)));
          g.audio?.sfx('ui_move', { vol: 0.4 });
        }
      } else if (!inside && page.closable !== false) { if (page.onBack) page.onBack(this); else this.close(); }
    }
    P.moved = false; P.tap = false;
  }

  /**
   * The menu on the UI layer (engine/uilayer.js): the geometry is layout()'s, in HUD lines (what the pointer is tested against), and every line is 3 dp. A glass panel, the title in small tracked capitals, a pill
   * of light behind the chosen row, values on the right, slim gauges for the sliders. A page may carry `stats` (the pause page: the gems, Sparx, the lanterns), `extra` lines of its own (the controls: `KEY ..... what`
   * is set in two columns; `extraHead`: the first line is a heading) and a `footer`.
   */
  draw(pix) {
    if (!this.active) return;
    const ui = this.game.gfx.ui, c = ui.get();
    if (!c) return;
    ui.used = true;
    const K = 3, W = pix.w, H = pix.h;
    const page = this.stack[this.stack.length - 1];
    const items = page.items.filter((it) => !it.hidden || !it.hidden());
    const { x, y, w, h, rowH, rows0, stats } = this.layout(W, H, page, items);
    const X = x * K, Y = y * K, PW = w * K, PH = h * K, RH = rowH * K;
    // a veil over the game, so that the panel is what the eye goes to
    if (this.game.paused) { c.save(); c.fillStyle = 'rgba(6,8,20,0.34)'; c.fillRect(0, 0, ui.W, 720); c.restore(); }
    panel(c, X, Y, PW, PH, { r: 22 });
    txt(c, page.title, X + PW / 2, Y + 36, { size: 21, weight: 800, align: 'center', track: 4, color: '#f3f0ff', shadow: false });
    const lg = c.createLinearGradient(X + PW / 2 - 90, 0, X + PW / 2 + 90, 0); lg.addColorStop(0, 'rgba(255,184,58,0)'); lg.addColorStop(0.5, T.gold0); lg.addColorStop(1, 'rgba(255,184,58,0)');
    c.fillStyle = lg; c.fillRect(X + PW / 2 - 90, Y + 46, 180, 2);
    // the page's own lines
    const top0 = Y + (page.dense ? 62 : 70);
    let ey = top0;
    if (stats) { this._stats(c, X, ey - 6, PW); ey += STATS_H * K - 6; }
    const lines = page.extra || [];
    if (lines.length) {
      const sz = 15, lh = 10 * K * 0.92;
      lines.forEach((ln, i) => {
        const yy = ey + 14 + i * lh;
        if (page.extraHead) { txt(c, ln, X + PW / 2, yy, i === 0 ? { size: 18, weight: 800, align: 'center', color: T.gold0, shadow: false, track: 1.5, max: PW - 40 } : { size: sz + 1, weight: 500, align: 'center', color: i === 1 ? T.text : '#ffb0a0', shadow: false, max: PW - 40 }); return; }
        const m = ln.match(/^(.*?)\s*\.{2,}\s*(.*)$/);
        if (m) { txt(c, m[1], X + 26, yy, { size: sz, weight: 800, color: T.gold0, shadow: false, track: 1 }); txt(c, m[2], X + 26 + Math.min(PW * 0.3, 150), yy, { size: sz, weight: 500, shadow: false, max: PW - 52 - Math.min(PW * 0.3, 150) }); }
        else txt(c, ln, X + 26, yy, { size: sz, weight: 500, shadow: false, max: PW - 52 });
      });
    }
    // the rows
    const size = Math.max(14, Math.min(24, Math.round(RH * 0.5)));
    items.forEach((it, i) => {
      const ry = rows0 * K + i * RH - 2 * K + (Y - y * K), ty = ry + RH / 2 + size * 0.36;
      const sel = i === page.sel;
      if (sel) {
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
        c.save();
        rr(c, X + 12, ry + 2, PW - 24, RH - 4, Math.min(14, (RH - 4) / 2));
        const g = c.createLinearGradient(X, 0, X + PW, 0); g.addColorStop(0, 'rgba(255,196,80,0.30)'); g.addColorStop(1, 'rgba(255,196,80,0.10)');
        c.fillStyle = g; c.fill();
        c.strokeStyle = `rgba(255,214,120,${0.45 + pulse * 0.2})`; c.lineWidth = 1.2; c.stroke();
        rr(c, X + 12, ry + 6, 4, RH - 12, 2); c.fillStyle = T.gold1; c.fill();
        c.restore();
      }
      txt(c, it.label, X + 32, ty, { size, weight: sel ? 700 : 500, color: sel ? '#ffffff' : 'rgba(228,232,255,0.82)', shadow: false, max: PW * 0.62 });
      let val = '';
      if (it.type === 'toggle') val = it.get() ? 'ON' : 'OFF';
      else if (it.type === 'choice') val = it.labels ? it.labels[it.options.indexOf(it.get())] : String(it.get());
      else if (it.type === 'slider') gauge(c, X + PW - 32 - 130, ty - size * 0.36 - 4, 130, 8, it.get(), sel ? {} : { c0: '#c9a15a', c1: '#a87f33', glow: 'rgba(0,0,0,0)' });
      else if (it.type === 'action' && it.more) { c.save(); c.strokeStyle = sel ? T.gold0 : 'rgba(214,222,255,0.55)'; c.lineWidth = 2.4; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); const ax = X + PW - 34, ay = ty - size * 0.3; c.moveTo(ax - 4, ay - 7); c.lineTo(ax + 4, ay); c.lineTo(ax - 4, ay + 7); c.stroke(); c.restore(); }
      if (val) txt(c, val, X + PW - 32, ty, { size, weight: 700, align: 'right', color: sel ? T.gold0 : 'rgba(214,222,255,0.7)', shadow: false });
    });
    if (page.footer) txt(c, page.footer, X + PW / 2, Y + PH - 16, { size: 13, weight: 500, align: 'center', color: T.dim, shadow: false, max: PW - 30 });
  }

  /** the pause page's strip: the gems, Sparx's health, and the lanterns where there are lanterns */
  _stats(c, X, y, PW) {
    const g = this.game, st = g.stats, hp = g.sparx ? g.sparx.hp : 0, cols = g.objective ? 2 : 3, cw = (PW - 48) / cols, x0 = X + 24;
    const cell = (i) => x0 + i * cw;
    rr(c, X + 18, y, PW - 36, STATS_H * 3 - 14, 14); c.fillStyle = 'rgba(255,255,255,0.06)'; c.fill();
    // gems
    gemIcon(c, cell(0) + 18, y + 38, 30);
    txt(c, 'GEMS', cell(0) + 42, y + 28, { size: 11, weight: 800, color: T.dim, track: 2, shadow: false });
    const n = String(st.gems), wn = measure(c, n, 24, 800);
    txt(c, n, cell(0) + 42, y + 54, { size: 24, weight: 800, shadow: false });
    txt(c, `/ ${st.gemsTotal}`, cell(0) + 42 + wn + 6, y + 54, { size: 14, weight: 600, color: T.dim, shadow: false });
    // Sparx
    const sc = hp >= 3 ? '#ffe060' : hp === 2 ? '#6aa8ff' : '#70ff90';
    if (hp > 0) sparxIcon(c, cell(1) + 18, y + 40, 13, sc); else { c.save(); c.beginPath(); c.arc(cell(1) + 18, y + 40, 8, 0, Math.PI * 2); c.strokeStyle = 'rgba(214,222,255,0.35)'; c.lineWidth = 2; c.stroke(); c.restore(); }
    txt(c, 'SPARX', cell(1) + 42, y + 28, { size: 11, weight: 800, color: T.dim, track: 2, shadow: false });
    for (let i = 0; i < 3; i++) {
      rr(c, cell(1) + 42 + i * 26, y + 40, 21, 8, 4);
      if (i < hp) { c.save(); c.shadowColor = sc; c.shadowBlur = 7; c.fillStyle = sc; c.fill(); c.restore(); } else { c.fillStyle = T.track; c.fill(); }
    }
    // lanterns
    if (!g.objective) {
      flameIcon(c, cell(2) + 18, y + 40, 16, st.beacons > 0);
      txt(c, (g.words && g.words.goals) || 'LANTERNS', cell(2) + 42, y + 28, { size: 11, weight: 800, color: T.dim, track: 2, shadow: false, max: cw - 46 });
      const l = String(st.beacons), wl = measure(c, l, 24, 800);
      txt(c, l, cell(2) + 42, y + 54, { size: 24, weight: 800, shadow: false });
      txt(c, `/ ${st.beaconsTotal || 5}`, cell(2) + 42 + wl + 6, y + 54, { size: 14, weight: 600, color: T.dim, shadow: false });
    }
  }
}

export { measureText };
