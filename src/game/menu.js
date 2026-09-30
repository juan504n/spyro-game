// Tiny menu system drawn into the HUD overlay: pages of items (action / toggle / choice / slider).
import { drawText, measureText } from '../engine/textures/font.js';
import { drawPanel } from '../engine/textures/ui.js';

const GOLD = ['#fff4b0', '#ffc03c', '#e07818'];
const INK = '#120c1c';

export class Menu {
  /** @param {object} app { game, icons } — pages are pushed with open() */
  constructor(game) {
    this.game = game;
    this.stack = [];
    this.prev = { up: false, down: false, left: false, right: false };
    this.t = 0;
  }

  get active() { return this.stack.length > 0; }
  open(page) { this.stack.push({ ...page, sel: 0 }); this.game.audio?.sfx('ui_select', { vol: 0.5 }); }
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

  /** Panel geometry in internal pixels (also used for pointer hit-testing and by pages that draw extra lines). */
  layout(W, H, page, items) {
    const rowH = 13;
    const extraH = page.extra ? page.extra.length * 10 + 6 : 0;         // room for a page's own text block above the rows
    const w = Math.min(W - 24, page.width || 230);
    const h = 34 + extraH + items.length * rowH + (page.footer ? 12 : 0);
    const x = (W - w) >> 1, y = Math.max(8, (H - h) >> 1);
    return { x, y, w, h, rowH, extraH, rows0: y + 26 + extraH };
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

  draw(pix) {
    if (!this.active) return;
    const W = pix.w, H = pix.h;
    const page = this.stack[this.stack.length - 1];
    const items = page.items.filter((it) => !it.hidden || !it.hidden());
    const { x, y, w, h, rowH, rows0 } = this.layout(W, H, page, items);
    drawPanel(pix, x, y, w, h, { style: 'menu' });
    drawText(pix, page.title, W >> 1, y + 9, { style: 'grad', colors: GOLD, outlineColor: INK, align: 'center', scale: 1 });
    items.forEach((it, i) => {
      const ry = rows0 + i * rowH;
      const sel = i === page.sel;
      if (sel) {
        pix.rect(x + 6, ry - 2, w - 12, rowH - 1, '#4a3a86');
        const bob = Math.floor(this.t * 4) % 2;
        drawText(pix, '>', x + 9 + bob, ry, { style: 'outline', color: '#ffc03c', outlineColor: INK });
      }
      drawText(pix, it.label, x + 20, ry, { style: 'outline', color: sel ? '#ffffff' : '#c8bce8', outlineColor: INK });
      let val = '';
      if (it.type === 'toggle') val = it.get() ? 'ON' : 'OFF';
      else if (it.type === 'choice') val = it.labels ? it.labels[it.options.indexOf(it.get())] : String(it.get());
      else if (it.type === 'slider') {
        const bx = x + w - 84, n = 10, on = Math.round(it.get() * n);
        for (let k = 0; k < n; k++) pix.rect(bx + k * 7, ry + 1, 5, 6, k < on ? (sel ? '#ffc03c' : '#c08a30') : '#2a1e50');
      }
      if (val) drawText(pix, val, x + w - 10, ry, { style: 'outline', color: sel ? '#ffe27a' : '#a898d8', outlineColor: INK, align: 'right' });
    });
    if (page.footer) drawText(pix, page.footer, W >> 1, y + h - 11, { style: 'outline', color: '#a898d8', outlineColor: INK, align: 'center' });
  }
}

export { measureText };
