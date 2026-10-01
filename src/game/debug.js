// Debug mode: the on-screen readout, the crosshair, the aim marker and the collision wireframes. It is the DOM / three.js side of
// debuginfo.js (which decides what the readout says).
//
// The point of it: a screenshot of the game with the readout on tells the developer where in the world (X / Y / Z, in metres: x = east,
// z = south, y = up), which named place, which ground texture and why, which prop or collider is nearest and which layout function
// placed it, what the centre of the screen is pointing at, and which build is running. Turn it on with F3 (off > compact > full), the
// pause / title menu's DEBUG MODE row or Options > DEBUG; it is remembered between visits.
import * as THREE from 'three';
import { collect, format, toText, BUILD } from './debuginfo.js';
import { errorLines, errorCount } from '../engine/errlog.js';
import { isTouchDevice } from '../engine/device.js';

const tapCount = (app) => (app.game.input.lastTap ? app.game.input.lastTap.n : 0);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '?');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '?');
const deg = (r) => Math.round(((r * 180) / Math.PI + 360) % 360);
const SIZES = [0.85, 1, 1.3];
const COLORS = { pos: '#fff4b0', aim: '#7de8ff', warn: '#ff9a9a', dim: '#a898d8', '': '#f4eeff' };

/** Wireframes of the collision volumes near Spyro (the shapes that stop him, hold the camera back or can be stood on) plus a cross where the crosshair points. */
class Wires {
  constructor(scene) {
    this.MAX = 26000;                                        // segments
    this.pos = new Float32Array(this.MAX * 6);
    this.col = new Float32Array(this.MAX * 6);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95, fog: false });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    this.lines.name = 'debug:wires';
    this.lines.visible = false;
    this.n = 0;
    scene.add(this.lines);
  }

  seg(ax, ay, az, bx, by, bz, c) {
    if (this.n >= this.MAX) return;
    const i = this.n * 6;
    const P = this.pos, C = this.col;
    P[i] = ax; P[i + 1] = ay; P[i + 2] = az; P[i + 3] = bx; P[i + 4] = by; P[i + 5] = bz;
    C[i] = C[i + 3] = c[0]; C[i + 1] = C[i + 4] = c[1]; C[i + 2] = C[i + 5] = c[2];
    this.n++;
  }

  ring(cx, cy, cz, r, c, k = 16) {
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2, b = ((i + 1) / k) * Math.PI * 2;
      this.seg(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r, cx + Math.cos(b) * r, cy, cz + Math.sin(b) * r, c);
    }
  }

  collider(c, color) {
    if (c.type === 'cyl') {
      this.ring(c.x, c.y0, c.z, c.r, color); this.ring(c.x, c.y1, c.z, c.r, color);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2, dx = Math.cos(a) * c.r, dz = Math.sin(a) * c.r; this.seg(c.x + dx, c.y0, c.z + dz, c.x + dx, c.y1, c.z + dz, color); }
      return;
    }
    const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    // (local -> world is the inverse of the rotation Collision.inside applies)
    const w = (lx, lz) => [c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs];
    const q = [w(-c.hx, -c.hz), w(c.hx, -c.hz), w(c.hx, c.hz), w(-c.hx, c.hz)];
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4];
      this.seg(a[0], c.y0, a[1], b[0], c.y0, b[1], color);
      this.seg(a[0], c.y1, a[1], b[0], c.y1, b[1], color);
      this.seg(a[0], c.y0, a[1], a[0], c.y1, a[1], color);
    }
  }

  cross(x, y, z, r, color) {
    this.seg(x - r, y, z, x + r, y, z, color); this.seg(x, y - r, z, x, y + r, z, color); this.seg(x, y, z - r, x, y, z + r, color);
  }

  begin() { this.n = 0; }
  end() {
    this.geo.setDrawRange(0, this.n * 2);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

export class DebugHud {
  constructor(app) {
    this.app = app;
    this.gfx = app.gfx;
    this.game = app.game;
    this.acc = 1;                       // seconds since the readout was rebuilt (it refreshes ~10 times a second)
    this.fps = 60; this.ms = 16.7;
    this.shown = -1;
    this.last = null;                   // the latest collected data (tests and bug reports read it through window.__debug)
    this.rows = [];
    this.pin = null;                    // client px of a spot the player tapped (touch): the readout's aim follows it instead of the middle of the screen
    this._tapSeen = tapCount(app);
    this._lastLevel = 0;
    this._build();
    this.wires = new Wires(this.game.scene);
    this._cd = new THREE.Vector3();
    window.__debug = { hud: this, data: () => this.last, text: () => toText(this.rows), refresh: () => { this.refresh(true); return this.last; } };
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'gv-debug';
    root.style.cssText = 'position:fixed;left:0;top:0;z-index:6;display:none;pointer-events:none;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.28;color:#f4eeff';
    const panel = document.createElement('div');
    panel.style.cssText = 'width:max-content;background:rgba(10,6,24,.62);border-left:3px solid #ffc03c;border-radius:4px;padding:4px 7px 4px 6px;overflow:hidden;text-shadow:0 1px 0 #000,1px 0 0 #000';
    root.appendChild(panel);
    const cross = document.createElement('div');
    const white = 'linear-gradient(#fff,#fff)', black = 'linear-gradient(#000,#000)';
    cross.style.cssText = `position:fixed;z-index:6;display:none;pointer-events:none;width:22px;height:22px;margin:-11px 0 0 -11px;background:${white} center/2px 100% no-repeat,${white} center/100% 2px no-repeat,${black} center/4px 100% no-repeat,${black} center/100% 4px no-repeat;opacity:.85`;
    const pin = document.createElement('div');
    pin.style.cssText = 'position:fixed;z-index:6;display:none;pointer-events:none;width:30px;height:30px;margin:-15px 0 0 -15px;box-sizing:border-box;border:2px solid #7de8ff;border-radius:50%;box-shadow:0 0 0 1px #000,inset 0 0 0 1px #000;background:radial-gradient(circle,#7de8ff 0 2px,transparent 3px)';
    document.body.append(root, cross, pin);
    this.root = root; this.panel = panel; this.cross = cross; this.pinMark = pin;
  }

  /** the pose of the ray the readout aims: through the middle of the screen, or through the tapped spot (the pin) */
  _pose() {
    const cam = this.game.camera;
    cam.updateMatrixWorld();
    const d = this._cd;
    if (this.pin) {
      const f = this.gfx.frameCss();
      const nx = ((this.pin.x - f.left) / f.width) * 2 - 1, ny = -(((this.pin.y - f.top) / f.height) * 2 - 1);
      if (Math.abs(nx) <= 1 && Math.abs(ny) <= 1) d.set(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize();
      else this.pin = null;                                   // (the window changed under it: back to the middle)
    }
    if (!this.pin) cam.getWorldDirection(d);
    return { ox: cam.position.x, oy: cam.position.y, oz: cam.position.z, dx: d.x, dy: d.y, dz: d.z };
  }

  /** a tap on the screen (touch): pin the aim there; a tap on the pin lets it go */
  _pinAt(x, y) {
    if (this.pin && Math.hypot(this.pin.x - x, this.pin.y - y) < 28) this.pin = null;
    else this.pin = { x, y };
    this.acc = 1;                                             // (refresh at once)
  }

  /** the extra lines of the full readout: game state, camera, input, performance, view, errors */
  _extra(level) {
    const app = this.app, g = this.game, gfx = this.gfx, ex = { pose: this._pose() };
    ex.pinned = !!this.pin;
    ex.errorCount = errorCount();
    if (level < 2) return ex;
    const st = g.stats, cp = g.checkpoint, cam = g.cam, inp = g.input, p = g.player;
    ex.game = `${app.state}/${g.mode} day ${f2(g.day)} t ${fmtTime(st.time)} gems ${st.gems}/${st.gemsTotal} beacons ${st.beacons}/5 hp ${g.sparx ? g.sparx.hp : '-'} deaths ${st.deaths}${cp ? `  checkpoint ${f1(cp.x)}, ${f1(cp.y)}, ${f1(cp.z)}` : ''}`;
    ex.cam = `${cam.mode} yaw ${deg(cam.yaw)} pitch ${deg(cam.pitch)} dist ${f1(cam.dist)} pull ${f2(cam.pull)} lift ${f2(cam.lift)}${cam.inCinematic ? ' (cutscene)' : ''}  at ${f1(cam.pos.x)}, ${f1(cam.pos.y)}, ${f1(cam.pos.z)}`;
    const held = Object.keys(inp.held).filter((k) => inp.held[k]).join(',');
    ex.input = `${inp.lastDevice} move ${f2(inp.move.x)},${f2(inp.move.y)} held ${held || '-'}  touch ui ${inp.touch ? (inp.menuBtn ? 'yes' : 'lazy') : 'no'}  vy ${f1(p.vy)}`;
    const info = gfx.renderer.info;
    ex.perf = `${Math.round(this.fps)} fps ${f1(this.ms)} ms  tris ${Math.round(info.render.triangles / 100) / 10}k  calls ${info.render.calls}${gfx.settings.fps30 ? '  (30 fps lock)' : ''}`;
    ex.gpu = `${gfx.W}x${gfx.H} x${f2(gfx.scale)}  ${gfx.settings.display} ${gfx.settings.height}p ${gfx.look}  geo ${info.memory.geometries} tex ${info.memory.textures}`;
    const plat = /iPhone|iPad|Android|Windows|Macintosh|Linux/.exec(navigator.userAgent);
    const safe = gfx.insets();
    ex.view = `${window.innerWidth}x${window.innerHeight} dpr ${f2(window.devicePixelRatio || 1)}  ${plat ? plat[0] : 'browser'}  ${isTouchDevice() ? 'touch' : 'no touch'} (${navigator.maxTouchPoints | 0} pts)${safe.top > 0 ? `  safe top ${f1(safe.top)}` : ''}`;
    ex.errors = errorLines();
    return ex;
  }

  /** Called every frame by the app. */
  update(dt) {
    if (dt > 0) { this.ms += (dt * 1000 - this.ms) * 0.08; this.fps = 1000 / Math.max(1, this.ms); }
    const level = this.gfx.settings.debug | 0;
    const tap = this.game.input.lastTap;
    if (tap && tap.n !== this._tapSeen) {
      this._tapSeen = tap.n;
      if (level && this.app.state === 'play' && !this.app.menu.active) this._pinAt(tap.x, tap.y);      // (a tap that picks a menu row is not a pin)
    }
    if (level && !this._lastLevel && this.game.input.lastDevice === 'touch' && this.app.state === 'play') this.game.hud.hint('DEBUG MODE: TAP THE SCREEN TO PIN THE READOUT TO A SPOT', 4.5);
    this._lastLevel = level;
    if (!level) {
      this.pin = null;
      if (this.shown !== 0) { this.shown = 0; this.root.style.display = 'none'; this.cross.style.display = 'none'; this.pinMark.style.display = 'none'; this.wires.lines.visible = false; this._layoutKey = this._textKey = this._markKey = null; }
      return;
    }
    this.acc += dt;
    if (this.acc >= 0.1 || this.shown !== level) this.refresh();
  }

  refresh(force = false) {
    const gfx = this.gfx, s = gfx.settings, level = s.debug | 0;
    if (!level && !force) return;
    this.acc = 0;
    const lv = level || 1;
    const data = collect(this.game, this._extra(lv));
    this.last = data;
    this.rows = format(data, lv);
    this.shown = level;
    if (!level) return;                                   // (a forced refresh with debug mode off only fills in the data)

    // ---- the readout (the DOM is only touched when something changed: standing still repaints nothing) ----
    const f = gfx.frameCss();
    const px = Math.max(10.5, Math.min(15, f.height / 34)) * SIZES[s.debugSize];
    // (the compact readout stays narrow, ~40 characters, with long rows wrapping under their tag: it must not cover the middle of the screen, where the crosshair is)
    const left = Math.round(f.left + 4 * f.unit), top = Math.round(f.top + 40 * f.unit);
    const room = Math.max(120, window.innerWidth - left - 8), high = Math.max(80, Math.round(window.innerHeight - top - 8));
    const layoutKey = `${left},${top},${px.toFixed(1)},${lv},${Math.round(room)},${high}`;
    if (layoutKey !== this._layoutKey) {
      this._layoutKey = layoutKey;
      const st = this.root.style;
      st.display = 'block';
      st.left = `${left}px`; st.top = `${top}px`; st.fontSize = `${px.toFixed(1)}px`;
      this.panel.style.maxWidth = `min(${lv > 1 ? 62 : 40}ch, ${Math.round(room)}px)`;
      this.panel.style.maxHeight = `${high}px`;
      this._textKey = null;
    }
    const textKey = this.rows.map((r) => `${r.tag}|${r.cls}|${r.text}`).join('\n');
    if (textKey !== this._textKey) {
      this._textKey = textKey;
      const frag = document.createDocumentFragment();
      for (const r of this.rows) {
        const line = document.createElement('div');
        line.style.cssText = `white-space:pre-wrap;overflow-wrap:anywhere;padding-left:6ch;text-indent:-6ch;color:${COLORS[r.cls] || COLORS['']}${r.cls === 'pos' ? ';font-weight:bold' : ''}`;
        const tag = document.createElement('span');
        tag.textContent = r.tag.padEnd(6);
        tag.style.cssText = 'color:#ffc03c;font-weight:bold';
        line.append(tag, document.createTextNode(r.text));
        frag.appendChild(line);
      }
      this.panel.replaceChildren(frag);
    }
    // the crosshair sits in the middle of the game frame (that is where the camera's centre ray goes); a pin replaces it
    const markKey = `${this.pin ? `${Math.round(this.pin.x)},${Math.round(this.pin.y)}` : '-'}|${Math.round(f.left + f.width / 2)},${Math.round(f.top + f.height / 2)}`;
    if (markKey !== this._markKey) {
      this._markKey = markKey;
      const cs = this.cross.style, ps = this.pinMark.style;
      cs.display = this.pin ? 'none' : 'block';
      cs.left = `${Math.round(f.left + f.width / 2)}px`;
      cs.top = `${Math.round(f.top + f.height / 2)}px`;
      ps.display = this.pin ? 'block' : 'none';
      if (this.pin) { ps.left = `${Math.round(this.pin.x)}px`; ps.top = `${Math.round(this.pin.y)}px`; }
    }

    // ---- wireframes ----
    const w = this.wires;
    w.lines.visible = true;
    w.begin();
    const a = data.aim;
    if (a && a.kind !== 'none') {
      const r = Math.max(0.35, Math.min(4, a.t * 0.05)), red = [1, 0.25, 0.25], e = r * 0.06;
      for (const [dx, dz] of [[0, 0], [e, 0], [0, e]]) w.cross(a.x + dx, a.y, a.z + dz, r, red);      // (a 1 px line is faint at the low internal resolution: three side by side)
    }
    if (s.debugColliders) {
      const p = data.pos, R = 42;
      const near = data.colliders.length ? data.colliders[0].c : null;
      const aimed = a && a.kind === 'collider' ? a.c : null;
      for (const c of this.game.collision.colliders) {
        const dx = c.x - p.x, dz = c.z - p.z;
        const ext = c.type === 'cyl' ? c.r : Math.hypot(c.hx, c.hz);
        if (dx * dx + dz * dz > (R + ext) * (R + ext)) continue;
        const color = c === aimed || c === near ? [1, 0.9, 0.2] : c.solid === false ? [0.5, 0.5, 0.55] : c.top ? [0.3, 0.9, 1] : c.cam ? [1, 0.35, 0.9] : [0.3, 1, 0.4];
        w.collider(c, color);
      }
    }
    w.end();
  }
}

export { BUILD };
