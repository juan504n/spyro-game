// The floating gem counter: Spyro's HUD numerals are chunky extruded polygons that hop when the count changes and float in
// the corner for a few seconds after every pickup. Here they are real 3D geometry (a stroke font of extruded, faceted
// strokes) plus a spinning gem icon, drawn as a second little scene on top of the finished world through the same PS1
// shader (vertex wobble and all): Gfx.render(scene, camera, overlay).
//
// Coordinates: the overlay camera is set up so that one world unit is one HUD pixel on the 240-line HUD layout, origin at the
// top-left (y is flipped: world y = 240 - hud y), so the counter is positioned with the same numbers as the 2D panels.
import * as THREE from 'three';
import { Builder } from '../engine/builder.js';
import { gemGeometry } from './systems/gems.js';

const S = 24;                          // digit height in HUD pixels
const STROKE = 0.2, DEPTH = 0.34;      // stroke thickness and extrusion depth (fractions of S)
const ADV = 0.6 * S + 3.5;             // advance between digits
const ANCHOR = { x: 98, y: 30 };       // icon centre (HUD pixels): just right of the gem panel, hanging a little below it
const FOV = 24;
const CAM_D = 120 / Math.tan((FOV / 2) * (Math.PI / 180));
const HOLD = 2.6;                      // seconds the counter stays up after the last pickup
const G_HOP = 1100, V_HOP = 150;       // hop gravity / launch speed (px/s^2, px/s)
const MAX_HOP = 12;                    // a digit never climbs higher than this (pickups in quick succession re-launch it from where it is)
const TAU = Math.PI * 2;

/** Glyph strokes (x 0..0.6, y 0..1, up): polylines drawn with thick flat-ended strokes; bends get an octagonal joint. */
export const DIGIT_STROKES = {
  0: [[[0.10, 0.30], [0.10, 0.70], [0.22, 0.90], [0.38, 0.90], [0.50, 0.70], [0.50, 0.30], [0.38, 0.10], [0.22, 0.10], [0.10, 0.30]]],
  1: [[[0.30, 0.10], [0.30, 0.90], [0.12, 0.70]]],
  2: [[[0.10, 0.70], [0.22, 0.90], [0.40, 0.90], [0.50, 0.72], [0.50, 0.58], [0.10, 0.10], [0.50, 0.10]]],
  3: [[[0.10, 0.90], [0.50, 0.90], [0.30, 0.56], [0.40, 0.52], [0.50, 0.40], [0.50, 0.24], [0.38, 0.10], [0.20, 0.10], [0.10, 0.22]]],
  4: [[[0.40, 0.10], [0.40, 0.90], [0.08, 0.38], [0.54, 0.38]]],
  5: [[[0.50, 0.90], [0.16, 0.90], [0.12, 0.56], [0.36, 0.60], [0.50, 0.46], [0.50, 0.26], [0.38, 0.10], [0.20, 0.10], [0.10, 0.22]]],
  6: [[[0.44, 0.90], [0.24, 0.84], [0.10, 0.62], [0.10, 0.30], [0.22, 0.10], [0.38, 0.10], [0.50, 0.28], [0.50, 0.40], [0.38, 0.55], [0.22, 0.55], [0.10, 0.40]]],
  7: [[[0.10, 0.90], [0.50, 0.90], [0.24, 0.10]]],
  8: [[[0.22, 0.90], [0.38, 0.90], [0.48, 0.74], [0.38, 0.56], [0.22, 0.56], [0.12, 0.74], [0.22, 0.90]], [[0.22, 0.56], [0.38, 0.56], [0.50, 0.36], [0.38, 0.10], [0.22, 0.10], [0.10, 0.36], [0.22, 0.56]]],
  9: [[[0.16, 0.10], [0.36, 0.16], [0.50, 0.40], [0.50, 0.68], [0.38, 0.90], [0.22, 0.90], [0.10, 0.72], [0.22, 0.50], [0.38, 0.50], [0.50, 0.62]]],
};

const WHITE = [1, 1, 1];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A flat triangle wound so it faces along n (whichever way the corners were given). */
function tri(b, p0, p1, p2, n) {
  if (dot(cross(sub(p1, p0), sub(p2, p0)), n) < 0) { const t = p1; p1 = p2; p2 = t; }
  b.tri(p0, p1, p2, [0, 0], [0, 0], [0, 0], { tints: [WHITE, WHITE, WHITE] }, [n, n, n]);
}
/** A flat quad (corners in order) facing along n. */
function face(b, p0, p1, p2, p3, n) {
  tri(b, p0, p1, p2, n);
  tri(b, p0, p2, p3, n);
}

/** One extruded rectangle along p -> q with flat ends (glyph units in, pixels out). */
function prism(b, p, q) {
  const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, h = STROKE / 2, z = DEPTH / 2;
  const P = (pt, s, zz) => [(pt[0] + nx * h * s) * S, (pt[1] + ny * h * s) * S, zz * S];
  const f0 = P(p, -1, z), f1 = P(q, -1, z), f2 = P(q, 1, z), f3 = P(p, 1, z);
  const b0 = P(p, -1, -z), b1 = P(q, -1, -z), b2 = P(q, 1, -z), b3 = P(p, 1, -z);
  face(b, f0, f1, f2, f3, [0, 0, 1]);
  face(b, b0, b1, b2, b3, [0, 0, -1]);
  face(b, f0, f1, b1, b0, [-nx, -ny, 0]);
  face(b, f3, f2, b2, b3, [nx, ny, 0]);
  face(b, f1, f2, b2, b1, [ux, uy, 0]);
  face(b, f0, f3, b3, b0, [-ux, -uy, 0]);
}

/** An octagonal prism (radius = half a stroke) that fills the outside of a bend. */
function joint(b, c) {
  const h = STROKE / 2, R = h / Math.cos(Math.PI / 8), z = DEPTH / 2;
  const ring = (zz) => Array.from({ length: 8 }, (_, k) => {
    const a = ((k + 0.5) * TAU) / 8;
    return [(c[0] + Math.cos(a) * R) * S, (c[1] + Math.sin(a) * R) * S, zz * S];
  });
  const F = ring(z), B = ring(-z), mid = (zz) => [c[0] * S, c[1] * S, zz * S];
  for (let k = 0; k < 8; k++) {
    const k2 = (k + 1) % 8, a = ((k + 1) * TAU) / 8;                  // (the middle of the facet between vertices k and k+1)
    tri(b, mid(z), F[k], F[k2], [0, 0, 1]);
    tri(b, mid(-z), B[k], B[k2], [0, 0, -1]);
    face(b, F[k], F[k2], B[k2], B[k], [Math.cos(a), Math.sin(a), 0]);
  }
}

/** The extruded 3D geometry of one digit, centred on its own middle (so it can tilt and flip about it). */
export function digitGeometry(d) {
  const b = new Builder({ lit: true });
  b.translate(-0.3 * S, -0.5 * S, 0);
  for (const line of DIGIT_STROKES[d]) {
    for (let i = 0; i < line.length - 1; i++) prism(b, line[i], line[i + 1]);
    const closed = line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1];
    for (let i = closed ? 0 : 1; i < line.length - 1; i++) joint(b, line[i]);
  }
  const g = b.build();
  g.computeBoundingSphere();
  return g;
}

const easeOutBack = (t) => { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const smooth = (t) => t * t * (3 - 2 * t);

export class GemCounter {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 4 / 3, 20, 2000);
    this.overlay = { scene: this.scene, camera: this.camera, visible: false };          // (Gfx draws it only while `visible`)
    // gems and numerals share the "faceted" shader path (two fixed lights + a glint): they flash as they tilt
    const mat = () => game.assets.mat(null, { gem: true, day: false, unique: true, fog: false });
    this.digitMat = mat();
    this.digitMat.uniforms.uColorMul.value.setRGB(1.06, 1.07, 0.58);
    this.iconMat = mat();
    // a hard dark copy just behind and below each numeral keeps it readable over bright skies
    this.shadowMat = game.assets.mat(null, { day: false, fog: false, unique: true });
    this.shadowMat.uniforms.uColorMul.value.setRGB(0.07, 0.03, 0.13);
    this.geos = Array.from({ length: 10 }, (_, d) => digitGeometry(d));
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.icon = new THREE.Mesh(gemGeometry(), this.iconMat);
    this.icon.frustumCulled = false;
    this.iconG = new THREE.Group();
    this.iconG.add(this.icon);
    this.root.add(this.iconG);
    this.slots = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(this.geos[0], this.digitMat);
      const shadow = new THREE.Mesh(this.geos[0], this.shadowMat);
      mesh.frustumCulled = shadow.frustumCulled = false;
      const sg = new THREE.Group();          // the shadow lives in its own group: it follows the hop and squash but never flips
      sg.add(shadow);
      g.add(mesh);
      g.visible = sg.visible = false;
      this.root.add(sg, g);
      this.slots.push({ g, sg, mesh, shadow, ch: '', y: 0, vy: 0, wait: -1, flip: 0, flipTo: 0, sq: 0, flipNext: false });
    }
    this.t = 0;
    this.show = 0;                // 0 hidden .. 1 fully shown
    this.dir = 1;
    this.hold = 0;
    this.pop = 0;                 // whole-counter scale kick on every pickup
    this.iconKick = 0;
    this.digits = '';
    this.root.visible = false;
    this.resize(320, 4 / 3);
  }

  /** Match the overlay camera to the frame: `uiW` is the HUD layout width (240 lines tall), `aspect` = internal width / height. */
  resize(uiW, aspect) {
    this.uiW = uiW;
    this.camera.aspect = aspect;
    this.camera.position.set(uiW / 2, 120, CAM_D);
    this.camera.lookAt(uiW / 2, 120, 0);
    this.camera.updateProjectionMatrix();
  }

  /** A gem was collected (the game's total is already updated): show the counter and make the changed digits hop. */
  bump(value, color) {
    const wasHidden = this.show < 0.05;
    this.hold = HOLD;
    this.dir = 1;
    this.pop = 1;
    this.iconKick = 1;
    if (color) this.iconMat.uniforms.uColorMul.value.setRGB(color[0], color[1], color[2]);
    this._setDigits(String(this.game.stats.gems), true, wasHidden);
    void value;
  }

  _setDigits(str, animate, all = false) {
    this.digits = str;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i], ch = i < str.length ? str[str.length - 1 - i] : '';
      const changed = ch !== s.ch;
      s.ch = ch;
      s.g.visible = s.sg.visible = ch !== '';
      if (ch !== '') s.mesh.geometry = s.shadow.geometry = this.geos[+ch];
      if (animate && ch !== '' && (changed || all)) {
        s.wait = 0.045 * i;                                    // the units digit hops first, the tens a moment later, ...
        s.flipNext = i > 0;                                    // (a digit that rolls over flips right round; the units just hop)
      }
    }
  }

  /** Per rendered frame. `active` = the HUD is being shown (not the title / cinematics). */
  update(dt, active) {
    this.t += dt;
    const G = this.game;
    if (this.show > 0 || this.hold > 0) {
      const target = String(G.stats.gems);
      if (target !== this.digits && this.show > 0) this._setDigits(target, false);         // (changed without a pickup, e.g. a reset)
    }
    if (!active) { this.show = Math.max(0, this.show - dt * 8); this.dir = -1; this.hold = 0; }
    else if (this.hold > 0) { this.hold -= dt; this.show = Math.min(1, this.show + dt * 4.5); }
    else { this.dir = -1; this.show = Math.max(0, this.show - dt * 3.2); }
    this.pop = Math.max(0, this.pop - dt * 4);
    this.iconKick = Math.max(0, this.iconKick - dt * 2.4);
    this.root.visible = this.overlay.visible = this.show > 0.001;
    if (!this.root.visible) return;

    const k = this.show;
    const sc = (this.dir > 0 ? easeOutBack(k) : smooth(k)) * (1 + 0.1 * this.pop);
    this.root.position.set(ANCHOR.x, 240 - ANCHOR.y + (1 - smooth(k)) * 18, 0);          // slides in from above
    this.root.scale.setScalar(Math.max(0.001, sc));

    // the gem icon: slow spin (faster right after a pickup), gentle bob
    this.iconG.position.set(0, Math.sin(this.t * 2.2) * 1.2 + 3 * this.iconKick * Math.sin(this.iconKick * Math.PI), 0);
    this.icon.rotation.set(0.28, this.t * 2.0 + this.iconKick * 5, 0);
    this.iconG.scale.setScalar(15 * (1 + 0.25 * this.iconKick));

    // the digits: left to right, aligned to the icon
    const n = Math.min(this.digits.length, this.slots.length);
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s.g.visible) continue;
      // hop physics (bounces twice, squashing on every landing)
      if (s.wait >= 0) {
        s.wait -= dt;
        if (s.wait < 0) {
          s.vy = Math.min(V_HOP, Math.sqrt(2 * G_HOP * Math.max(0, MAX_HOP - s.y)));                // (capped: the apex stays under MAX_HOP whatever the cadence)
          if (s.flipNext) s.flipTo += TAU;
          s.flipNext = false; s.wait = -1;
        }
      }
      s.vy -= G_HOP * dt;
      s.y += s.vy * dt;
      if (s.y < 0) {
        s.y = 0;
        if (s.vy < -30) { s.vy = -s.vy * 0.42; s.sq = 1; } else s.vy = 0;
      }
      s.sq = Math.max(0, s.sq - dt * 7);
      s.flip += (s.flipTo - s.flip) * (1 - Math.exp(-11 * dt));
      if (s.flipTo > 4 * TAU && Math.abs(s.flipTo - s.flip) < 0.05) { s.flip -= 2 * TAU; s.flipTo -= 2 * TAU; }
      const col = n - 1 - i;                                                               // 0 = leftmost digit
      const x = 17 + 0.3 * S + col * ADV;
      const stretch = 1 + 0.1 * Math.max(0, Math.min(1, s.vy / V_HOP));
      const squash = s.sq;
      const py = -1 + s.y + Math.sin(this.t * 2.1 + i * 0.9) * 1.1;
      const sway = Math.sin(this.t * 1.2 + i * 0.7) * 0.22, tilt = Math.sin(this.t * 1.7 + i) * 0.04;
      s.g.position.set(x, py, 0);
      s.g.rotation.set(-0.16, sway + s.flip, tilt);
      s.g.scale.set((1 + 0.18 * squash) / Math.sqrt(stretch), (1 - 0.24 * squash) * stretch, 1);
      s.sg.position.set(x + 1.7, py - 1.7, -3);
      s.sg.rotation.set(-0.16, sway * 0.8, tilt);
      s.sg.scale.copy(s.g.scale);
    }
  }
}
