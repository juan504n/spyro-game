// Unified input: keyboard, mouse (drag or pointer-lock look), gamepad and on-screen touch controls.
// The sim runs on a fixed step, so "pressed" edges live until the sim consumes them (endStep()).
import { FloatingStick } from './touchstick.js';
import { isTouchDevice } from '../engine/device.js';

const ACTIONS = ['jump', 'flame', 'charge', 'confirm', 'talk', 'pause', 'camReset', 'camMode', 'back', 'debug'];

const KEYMAP = {
  Space: 'jump', KeyJ: 'flame', KeyF: 'flame', KeyK: 'charge', ShiftLeft: 'charge', ShiftRight: 'charge',
  Enter: 'confirm', Escape: 'pause', KeyP: 'pause', KeyR: 'camReset', KeyC: 'camMode', Backspace: 'back',
  F3: 'debug', Backquote: 'debug',
};

const TOUCH_LOOK = 0.0042;      // camera radians per pixel of a right-thumb drag (mouse: 0.0032). It was 0.006, which swung the view too far for a small flick.

/** The thumb controls: [right, bottom, size] in CSS px from the window's right and bottom edges (the platform's safe areas come on top of those). */
export const PADS = { JUMP: [26, 34, 74], FIRE: [112, 24, 62], RAM: [26, 124, 62], CAM: [30, 196, 46], TALK: [112, 96, 58] };

/** The touch MENU button is a pill this tall (CSS px: Apple's 44 for a finger target) and about this wide. */
export const MENU_BTN_H = 44;
export const MENU_BTN_W = 112;
/** CSS px between the bottom edge of the picture and the MENU button when the button sits under the picture */
export const MENU_BELOW_GAP = 24;
const PAD_CLEAR = 6;            // (air kept between the button and a thumb control)

/** the rectangle a thumb control covers in the window, in CSS px; `f` = gfx.frameCss() */
export function padRect(name, f) {
  const [r, b, size] = PADS[name];
  const right = f.winW - (r + f.safeRight), bottom = f.winH - (b + f.safeBottom);
  return { left: right - size, right, top: bottom - size, bottom };
}

/**
 * Where the touch MENU button goes: { x (its centre), top, below } in CSS px on the page. `f` = gfx.frameCss().
 * Held upright, a phone's picture sits at the top of the window and the black under it is empty: the button goes there, centred under the picture (`below`: it covers none of the view, and the
 * title and the menus need no room kept for it). Where the window leaves no such room, or the thumb controls are in the way (a landscape window: the picture fills it), it sits on the picture's top
 * edge instead: 4 lines of the HUD below it, but never closer than 8 px to the top of the page, and below whatever the platform covers there (`f.safeTop`: a notch, the header of an app that shows the
 * page under it). The frame's own top is already a position on the page: the inset must not be added on top of it (it once was: the button sat in the middle of a portrait picture).
 */
export function menuButtonPlace(f) {
  const x = Math.round(f.left + f.width / 2), under = Math.round(f.top + f.height + MENU_BELOW_GAP);
  const box = { left: x - MENU_BTN_W / 2, right: x + MENU_BTN_W / 2, top: under, bottom: under + MENU_BTN_H };
  const hits = (a, b) => a.left < b.right + PAD_CLEAR && a.right > b.left - PAD_CLEAR && a.top < b.bottom + PAD_CLEAR && a.bottom > b.top - PAD_CLEAR;
  const room = box.left >= 0 && box.right <= f.winW && box.bottom <= f.winH - f.safeBottom && !Object.keys(PADS).some((n) => hits(box, padRect(n, f)));
  if (room) return { x, top: under, below: true };
  return { x, top: Math.max(8 + f.safeTop, Math.round(f.top + 4 * f.unit)), below: false };
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.held = Object.fromEntries(ACTIONS.map((a) => [a, false]));
    this.edge = Object.fromEntries(ACTIONS.map((a) => [a, false]));
    this.rel = Object.fromEntries(ACTIONS.map((a) => [a, false]));
    // UI-level edges: unlike `edge` they are consumed by snapshot() (once per rendered frame), so a press is never seen
    // twice on frames where the fixed-step sim did not run (120/144 Hz displays), nor lost on frames where it ran twice.
    // confirmKey = confirm from keyboard/pad only (menus use it: mouse and touch select rows by position instead).
    this.uiEdge = Object.fromEntries([...ACTIONS, 'confirmKey'].map((a) => [a, false]));
    this.ptr = { x: -1, y: -1, moved: false, tap: false };   // last pointer position (client px), hover + tap flags for menus
    this.lastTap = null;                 // the latest touch tap { x, y, n } (client px, n counts them): debug mode pins its aim point there
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };          // accumulated mouse/stick delta (radians) since last take
    this.stickLook = { x: 0, y: 0 };     // continuous rate from gamepad / keys (rad/s)
    this.mouseDown = false;
    this.locked = false;
    this.touch = null;
    this.menuOpen = false;               // set by the app while a menu is showing: the mouse is not captured then
    this.anyKey = false;
    this.lastDevice = 'keyboard';
    this.onGesture = null;
    this._pad = null;
    this._bind();
  }

  _press(a, viaPointer = false) {
    if (!this.held[a]) {
      this.edge[a] = true;
      this.uiEdge[a] = true;
      if (a === 'confirm' && !viaPointer) this.uiEdge.confirmKey = true;
    }
    this.held[a] = true;
  }
  _release(a) { if (this.held[a]) this.rel[a] = true; this.held[a] = false; }

  _bind() {
    const onKey = (e, down) => {
      if (e.repeat && down) { if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); return; }
      if (down) this.keys.add(e.code); else this.keys.delete(e.code);
      const a = KEYMAP[e.code];
      if (a === 'debug') { if (down) { this._press(a); this._release(a); } }          // (a one-shot toggle: never left "held" if the browser swallows the key-up, as it can for F3)
      else if (a) { if (down) this._press(a); else this._release(a); }
      if (e.code === 'Enter') { if (down) this._press('talk'); else this._release('talk'); }      // (a click must not start a conversation)
      if (down) { this.anyKey = true; this.lastDevice = 'keyboard'; if (this.onGesture) this.onGesture(); }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F3'].includes(e.code)) e.preventDefault();      // (F3 is the browser's "find" otherwise)
    };
    window.addEventListener('keydown', (e) => onKey(e, true));
    window.addEventListener('keyup', (e) => onKey(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); for (const a of ACTIONS) this._release(a); this.mouseDown = false; });

    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => {
      this.lastDevice = 'keyboard';
      this.anyKey = true;
      if (this.onGesture) this.onGesture();
      this.ptr.x = e.clientX; this.ptr.y = e.clientY;
      if (e.button === 0) { this.mouseDown = true; this._press('flame'); this._press('confirm', true); }
      if (e.button === 2) this._press('charge');
      if (!this.locked && e.button === 0) this._tryLock();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.mouseDown = false; this._release('flame'); this._release('confirm'); this.ptr.x = e.clientX; this.ptr.y = e.clientY; this.ptr.tap = true; }
      if (e.button === 2) this._release('charge');
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) { this.ptr.x = e.clientX; this.ptr.y = e.clientY; this.ptr.moved = true; }
      if (this.locked) { this.look.x += e.movementX * 0.0032; this.look.y += e.movementY * 0.0032; }
      else if (e.buttons & 4) { this.look.x += e.movementX * 0.0045; this.look.y += e.movementY * 0.0045; }
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === c;
      if (was && !this.locked) {
        // Chrome swallows Esc while the pointer is captured: treat an unrequested unlock as the pause key
        if (this._releasing) this._releasing = false;
        else { this._press('pause'); this._release('pause'); }
      }
    });

    // touch controls (only created on touch devices). A browser that hides its touch support still gets them with the first touch it
    // delivers, so a phone can never be left without the MENU button.
    if (isTouchDevice()) this._bindTouch();
    else {
      const late = () => { window.removeEventListener('touchstart', late, true); if (!this.touch) this._bindTouch(); };
      window.addEventListener('touchstart', late, { capture: true, passive: true });
    }
  }

  _tryLock() {
    if (this.menuOpen) return;                // (a menu is open: the mouse must stay a pointer, or the first click on a row would capture and hide it)
    try { const p = this.canvas.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed (sandboxed frame) */ }
  }

  releasePointer() {
    this._releasing = this.locked;
    try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* ignore */ }
  }

  /** Re-capture the mouse after a menu (only when playing with keyboard + mouse). */
  relock() { if (this.lastDevice === 'keyboard' && !this.locked) this._tryLock(); }

  _bindTouch() {
    if (this.touch) return;
    const stick = new FloatingStick();
    const t = (this.touch = { stick: null, look: null, active: false, pad: stick });
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;touch-action:none;font-family:monospace';
    // every thumb control lives in one group, so a menu or a cutscene can hide them all at once (see setTouchUI)
    const pads = document.createElement('div');
    pads.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    root.appendChild(pads);
    // (a plain px fallback first: a browser without env() would otherwise drop the whole declaration and lose the button)
    const inset = (prop, px, side) => `${prop}:${px}px;${prop}:calc(${px}px + env(safe-area-inset-${side},0px));`;
    const mk = (label, right, bottom, size, action, color) => {
      const b = document.createElement('div');
      b.textContent = label;
      b.style.cssText = `position:absolute;${inset('right', right, 'right')}${inset('bottom', bottom, 'bottom')}width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid rgba(255,255,255,.55);color:#fff;font:bold ${size * 0.3}px monospace;display:flex;align-items:center;justify-content:center;pointer-events:auto;touch-action:none;opacity:.72;user-select:none;-webkit-user-select:none;text-shadow:0 2px 0 #000`;
      if (action) {
        const down = (e) => { e.preventDefault(); this.lastDevice = 'touch'; this.anyKey = true; this._press(action); b.style.opacity = '1'; };
        const up = (e) => { e.preventDefault(); this._release(action); b.style.opacity = '.72'; };
        b.addEventListener('touchstart', down, { passive: false });
        b.addEventListener('touchend', up, { passive: false });
        b.addEventListener('touchcancel', up, { passive: false });
      }
      pads.appendChild(b);
      return b;
    };
    mk('JUMP', ...PADS.JUMP, 'jump', 'rgba(60,150,90,.55)');
    mk('FIRE', ...PADS.FIRE, 'flame', 'rgba(220,110,30,.55)');
    mk('RAM', ...PADS.RAM, 'charge', 'rgba(140,70,200,.55)');
    // CAM: a tap swings the camera back behind Spyro (the R key); holding it for a moment switches the camera mode (the C key)
    {
      const cam = mk('CAM', ...PADS.CAM, null, 'rgba(50,130,190,.55)');
      let timer = 0, long = false;
      const down = (e) => { e.preventDefault(); this.lastDevice = 'touch'; this.anyKey = true; long = false; cam.style.opacity = '1'; clearTimeout(timer); timer = setTimeout(() => { long = true; this._press('camMode'); this._release('camMode'); }, 600); };
      const up = (e) => { e.preventDefault(); cam.style.opacity = '.72'; clearTimeout(timer); if (!long && e.type === 'touchend') { this._press('camReset'); this._release('camReset'); } };
      cam.addEventListener('touchstart', down, { passive: false });
      cam.addEventListener('touchend', up, { passive: false });
      cam.addEventListener('touchcancel', up, { passive: false });
      this.camBtn = cam;
    }
    this.talkBtn = mk('TALK', ...PADS.TALK, 'talk', 'rgba(50,110,200,.65)');    // only shown next to someone who wants to talk
    this.talkBtn.style.display = 'none';

    // MENU: a plain, labelled button at the top centre (the game's pause menu: options, controls, debug mode, quit). It is the way to
    // the menu on a touch screen (there is no Esc key), so it says what it is; while a menu is open it reads RESUME / BACK instead.
    const menu = document.createElement('div');
    menu.setAttribute('role', 'button');
    menu.setAttribute('aria-label', 'Menu');
    menu.style.cssText = `position:absolute;left:50%;transform:translateX(-50%);top:8px;min-width:104px;height:${MENU_BTN_H}px;box-sizing:border-box;padding:0 18px;border-radius:22px;background:rgba(36,20,72,.86);border:2px solid #ffc03c;color:#fff4b0;font:bold 16px monospace;letter-spacing:.08em;display:flex;align-items:center;justify-content:center;gap:9px;pointer-events:auto;touch-action:none;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;text-shadow:0 2px 0 #000;box-shadow:0 2px 0 rgba(0,0,0,.55)`;
    const bars = document.createElement('span');
    const bar = 'linear-gradient(#fff4b0,#fff4b0)';
    bars.style.cssText = `width:18px;height:14px;flex:none;background:${bar} 0 0/100% 3px no-repeat,${bar} 0 50%/100% 3px no-repeat,${bar} 0 100%/100% 3px no-repeat`;
    const label = document.createElement('span');
    label.textContent = 'MENU';
    menu.append(bars, label);
    const openMenu = () => { this.lastDevice = 'touch'; if (this.onGesture) this.onGesture(); this._press('pause'); this._release('pause'); };   // (not a "tap anywhere": on the title it opens the menu, it does not start the game)
    const scale = (k) => { menu.style.transform = `translateX(-50%) scale(${k})`; };
    let touchedAt = -1e9;
    menu.addEventListener('touchstart', (e) => { e.preventDefault(); touchedAt = performance.now(); scale(0.95); openMenu(); }, { passive: false });
    menu.addEventListener('touchend', (e) => { e.preventDefault(); scale(1); }, { passive: false });
    menu.addEventListener('touchcancel', () => scale(1));
    // (a mouse or pen on a hybrid device. A touch does not click as well: its touchstart is cancelled above, and a click just after one is ignored in case a browser sends it anyway)
    menu.addEventListener('click', () => { if (performance.now() - touchedAt > 1000) openMenu(); });
    root.appendChild(menu);
    this.menuBtn = menu; this._menuBars = bars; this._menuLabel = label;

    const ring = document.createElement('div');
    // (clearly visible on grass, cobbles and water alike: a light ring with a dark hairline, and a solid nub)
    ring.style.cssText = 'position:absolute;width:110px;height:110px;border-radius:50%;border:3px solid rgba(255,255,255,.62);background:rgba(255,255,255,.14);box-shadow:0 0 0 2px rgba(20,10,40,.35),inset 0 0 14px rgba(20,10,40,.25);display:none;pointer-events:none';
    const nub = document.createElement('div');
    nub.style.cssText = 'position:absolute;width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.82);border:2px solid rgba(20,10,40,.4);box-sizing:border-box;left:32px;top:32px';
    ring.appendChild(nub);
    root.appendChild(ring);
    this._ring = ring; this._nub = nub;
    document.body.appendChild(root);
    this.touchRoot = root;
    this._pads = pads;
    this._uiControls = undefined; this._uiMenu = undefined;      // (until the app says otherwise: everything shows, as it always did)

    const c = this.canvas;
    const own = new Map();
    const taps = new Map();          // touch id -> { t, x, y, moved }: a short, still touch is a tap (= confirm, menu click)
    c.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.lastDevice = 'touch'; this.anyKey = true;
      if (this.onGesture) this.onGesture();
      const play = this._uiControls !== false;       // (menus and cutscenes take taps only: no stick, no camera drag)
      for (const tc of e.changedTouches) {
        taps.set(tc.identifier, { t: e.timeStamp, x: tc.clientX, y: tc.clientY, moved: false });       // (the event's own time, not "now": a busy page runs the handlers late, and a tap must not turn into a long press for it)
        this.ptr.x = tc.clientX; this.ptr.y = tc.clientY; this.ptr.moved = true;
        if (!play) continue;
        const left = tc.clientX < window.innerWidth * 0.45;
        if (left && !t.stick) { t.stick = tc.identifier; stick.start(tc.clientX, tc.clientY); ring.style.display = 'block'; ring.style.left = tc.clientX - 55 + 'px'; ring.style.top = tc.clientY - 55 + 'px'; own.set(tc.identifier, 'stick'); }
        else if (!left && t.look === null) { t.look = tc.identifier; t.lx = tc.clientX; t.ly = tc.clientY; own.set(tc.identifier, 'look'); }
      }
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const tc of e.changedTouches) {
        const tp = taps.get(tc.identifier);
        if (tp && !tp.moved && Math.hypot(tc.clientX - tp.x, tc.clientY - tp.y) > 12) tp.moved = true;
        this.ptr.x = tc.clientX; this.ptr.y = tc.clientY; this.ptr.moved = true;
        if (tc.identifier === t.stick) {
          stick.move(tc.clientX, tc.clientY);
          this.move.x = stick.x; this.move.y = stick.y;
          ring.style.left = stick.bx - 55 + 'px'; ring.style.top = stick.by - 55 + 'px';         // (the circle follows a thumb that slides past its rim)
          nub.style.left = 32 + stick.dx * 0.9 + 'px'; nub.style.top = 32 + stick.dy * 0.9 + 'px';
          t.active = true;
        } else if (tc.identifier === t.look) {
          this.look.x += (tc.clientX - t.lx) * TOUCH_LOOK; this.look.y += (tc.clientY - t.ly) * TOUCH_LOOK;
          t.lx = tc.clientX; t.ly = tc.clientY;
        }
      }
    }, { passive: false });
    const end = (e) => {
      for (const tc of e.changedTouches) {
        const tp = taps.get(tc.identifier);
        taps.delete(tc.identifier);
        if (e.type === 'touchend' && tp && !tp.moved && e.timeStamp - tp.t < 350) {
          this._press('confirm', true); this._release('confirm');
          this.ptr.x = tp.x; this.ptr.y = tp.y; this.ptr.tap = true;
          this.lastTap = { x: tp.x, y: tp.y, n: (this.lastTap ? this.lastTap.n : 0) + 1 };
        }
        if (tc.identifier === t.stick) { t.stick = null; t.active = false; stick.end(); this.move.x = 0; this.move.y = 0; ring.style.display = 'none'; nub.style.left = '32px'; nub.style.top = '32px'; }
        if (tc.identifier === t.look) t.look = null;
      }
    };
    c.addEventListener('touchend', end, { passive: false });
    c.addEventListener('touchcancel', end, { passive: false });
  }

  /**
   * Choose which on-screen controls show. `controls`: the thumb controls (move circle, JUMP, FIRE, RAM, CAM, TALK) and touch steering.
   * `menu`: the label on the menu button ('MENU', 'RESUME', 'BACK'), or null to hide it (cutscenes). Called every frame by the app: a
   * menu that opened over a thumb-controlled game must not leave JUMP / FIRE sitting on top of it (they would swallow the taps meant for
   * the menu rows), nor leave the stick or a button held.
   */
  setTouchUI(controls, menu) {
    if (!this.touchRoot) return;
    const c = !!controls, m = menu || null;
    if (c === this._uiControls && m === this._uiMenu) return;
    const hadControls = this._uiControls !== false;
    this._uiControls = c; this._uiMenu = m;
    this._pads.style.display = c ? 'block' : 'none';
    this.menuBtn.style.display = m ? 'flex' : 'none';
    if (m) { this._menuLabel.textContent = m; this._menuBars.style.display = m === 'MENU' ? 'block' : 'none'; }
    if (hadControls && !c) this._dropTouches();
  }

  /** Let go of every thumb control (their finger may lift while they are hidden, and a hidden button never sees its touchend). */
  _dropTouches() {
    const t = this.touch;
    if (!t) return;
    for (const a of ['jump', 'flame', 'charge', 'talk']) this._release(a);
    t.stick = null; t.look = null; t.active = false; t.pad.end();
    this.move.x = 0; this.move.y = 0;
    if (this._ring) { this._ring.style.display = 'none'; this._nub.style.left = '32px'; this._nub.style.top = '32px'; }
    if (this.camBtn) this.camBtn.style.opacity = '.72';
  }

  /** Place the MENU button (called every frame, `f` = gfx.frameCss(); it only touches the page when the button moves): under the picture, or on its top edge (see menuButtonPlace). */
  layoutTouch(f) {
    if (!this.menuBtn) return;
    const p = menuButtonPlace(f);
    if (p.x === this._menuX && p.top === this._menuY) return;
    this._menuX = p.x; this._menuY = p.top;
    this.menuBtn.style.left = `${p.x}px`;
    this.menuBtn.style.top = `${p.top}px`;
  }

  setTouchVisible(v) { if (this.touchRoot) this.touchRoot.style.display = v ? 'block' : 'none'; }
  setTalkVisible(v) { if (this.talkBtn && this._talkShown !== v) { this._talkShown = v; this.talkBtn.style.display = v ? 'flex' : 'none'; } }

  /** Poll gamepad + compute axes. Call once per rendered frame before the sim steps. */
  poll() {
    const k = this.keys;
    let mx = 0, my = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    let lx = 0, ly = 0;
    if (k.has('KeyQ') || k.has('BracketLeft')) lx -= 1;
    if (k.has('KeyE') || k.has('BracketRight')) lx += 1;
    if (this.touch?.active) { mx = this.move.x; my = this.move.y; }

    // gamepad
    let pad = null;
    try { const pads = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of pads) if (p && p.connected) { pad = p; break; } } catch (e) { /* blocked */ }
    const map = [[0, 'jump'], [2, 'flame'], [1, 'charge'], [3, 'camReset'], [9, 'pause'], [8, 'back'], [6, 'talk'], [7, 'talk']];
    if (!pad && this._pad) {
      // unplugged mid-press: don't leave jump/flame/charge held forever
      for (const [i, a] of map) if (this._pad[i]) { this._release(a); if (a === 'jump') this._release('confirm'); }
      this._pad = null;
    }
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      const gx = dz(pad.axes[0] || 0), gy = dz(-(pad.axes[1] || 0));
      if (gx || gy) { mx = gx; my = gy; this.lastDevice = 'pad'; }
      const rx = dz(pad.axes[2] || 0), ry = dz(pad.axes[3] || 0);
      lx += rx * 1.6; ly += ry * 1.0;
      const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
      const cur = this._pad || {};
      for (const [i, a] of map) {
        const now = b(i);
        if (now && !cur[i]) { this._press(a); this.lastDevice = 'pad'; this.anyKey = true; if (a === 'jump') this._press('confirm'); }
        if (!now && cur[i]) { this._release(a); if (a === 'jump') this._release('confirm'); }
        cur[i] = now;
      }
      if (b(4)) lx -= 1.2;
      if (b(5)) lx += 1.2;
      if (b(12)) my = 1; if (b(13)) my = -1; if (b(14)) mx = -1; if (b(15)) mx = 1;
      this._pad = cur;
    }
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    this.move.x = mx; this.move.y = my;
    this.stickLook.x = lx; this.stickLook.y = ly;
  }

  /** presses since the last call (for UI-level logic: title, menus, results). Consumed: each press is returned exactly once. */
  snapshot() {
    const s = { ...this.uiEdge };
    for (const k in this.uiEdge) this.uiEdge[k] = false;
    return s;
  }

  down(a) { return this.held[a]; }
  pressed(a) { return this.edge[a]; }
  released(a) { return this.rel[a]; }

  /** consume accumulated look deltas */
  takeLook() { const r = { x: this.look.x, y: this.look.y }; this.look.x = 0; this.look.y = 0; return r; }

  /** Clear edge flags — call after each sim step (so edges are seen exactly once). */
  endStep() {
    for (const a of ACTIONS) { this.edge[a] = false; this.rel[a] = false; }
  }

  /** true once if any key/button/touch was pressed since last call (for "press any key") */
  takeAnyKey() { const v = this.anyKey; this.anyKey = false; return v; }
}
