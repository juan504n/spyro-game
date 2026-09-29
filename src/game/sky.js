// The sky: gradient dome + horizon glow, sun & moon discs, twinkling stars, chunky clouds, distant mountain rings.
// Everything is unlit/un-fogged geometry whose vertex colours are recomputed from atmosphere(day), so a single
// number (day 0 -> 1) turns moonlit twilight into sunrise.
import * as THREE from 'three';
import { makeMaterial, whiteTexture } from '../engine/materials.js';
import { RNG, valueNoise, fbm } from '../engine/textures/pix.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

const DOME_R = 1000;
const SEG = 48;
const ELEVS = [-14, -6, 0, 3, 6, 10, 15, 21, 28, 36, 46, 58, 72, 90];   // ring elevations in degrees

function skyBase(el, s) {
  if (el <= 0) return s.fog;
  if (el < 6) return mix3(s.fog, s.low, smooth(0, 6, el));
  if (el < 20) return mix3(s.low, s.mid, smooth(6, 20, el));
  if (el < 45) return mix3(s.mid, s.high, smooth(20, 45, el));
  return mix3(s.high, s.zenith, smooth(45, 90, el));
}

function setColor(arr, i, c, k = 0.5, a = 1) {
  arr[i * 4] = clamp(c[0] * k) * 255; arr[i * 4 + 1] = clamp(c[1] * k) * 255; arr[i * 4 + 2] = clamp(c[2] * k) * 255; arr[i * 4 + 3] = a * 255;
}

export class Sky {
  constructor(assets) {
    this.group = new THREE.Group();
    this.group.name = 'sky';
    this.assets = assets;
    this.rng = new RNG(4242);
    this._lastDay = -1;
    this._starT = 0;
    this._buildDome();
    this._buildCelestials();
    this._buildStars();
    this._buildClouds();
    this._buildMountains();
  }

  _skyMat(o = {}) {
    const m = makeMaterial({ fog: false, day: false, double: true, depthWrite: false, depthTest: o.depthTest ?? false, ...o });
    // additive celestials sort with the opaque sky layers (by renderOrder) so the ridge lines and clouds occlude them
    if (o.mode === 'add') m.transparent = false;
    return m;
  }

  _dynGeo(pos, uv, idx) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const n = pos.length / 3;
    const col = new Uint8Array(n * 4).fill(255);
    const attr = new THREE.BufferAttribute(col, 4, true);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aCol', attr);
    if (idx) g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5000);
    return g;
  }

  _buildDome() {
    const pos = [], uv = [], idx = [];
    this.domeDirs = [];
    for (let r = 0; r < ELEVS.length; r++) {
      const el = (ELEVS[r] * Math.PI) / 180;
      for (let s = 0; s <= SEG; s++) {
        const az = (s / SEG) * Math.PI * 2;
        const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
        this.domeDirs.push(d);
        pos.push(d[0] * DOME_R, d[1] * DOME_R, d[2] * DOME_R);
        uv.push(s / SEG, r / (ELEVS.length - 1));
      }
    }
    for (let r = 0; r < ELEVS.length - 1; r++) {
      for (let s = 0; s < SEG; s++) {
        const a = r * (SEG + 1) + s, b = a + 1, c = a + SEG + 1, d = c + 1;
        idx.push(a, b, d, a, d, c);
      }
    }
    this.domeGeo = this._dynGeo(pos, uv, idx);
    const m = new THREE.Mesh(this.domeGeo, this._skyMat());
    m.renderOrder = -100;
    m.frustumCulled = false;
    this.group.add(m);
  }

  _quadAt(dir, size, mat, order, rot = 0) {
    const pos = [], uv = [];
    const h = size / 2;
    pos.push(-h, -h, 0, h, -h, 0, h, h, 0, -h, h, 0);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    const g = this._dynGeo(pos, uv, [0, 1, 2, 0, 2, 3]);
    const m = new THREE.Mesh(g, mat);
    m.position.set(dir[0] * 900, dir[1] * 900, dir[2] * 900);
    m.lookAt(0, 0, 0);
    if (rot) m.rotateZ(rot);
    m.renderOrder = order;
    m.frustumCulled = false;
    this.group.add(m);
    return { mesh: m, geo: g };
  }

  _buildCelestials() {
    const A = this.assets;
    this.sunGlow = this._quadAt([1, 0.1, 0], 520, this._skyMat({ map: A.tex('sun_glow'), mode: 'add', depthTest: true }), -90);
    this.sunDisc = this._quadAt([1, 0.1, 0], 110, this._skyMat({ map: A.tex('sun_disc'), mode: 'add', depthTest: true }), -89);
    this.moon = this._quadAt([-1, 0.5, 0], 120, this._skyMat({ map: A.tex('moon'), mode: 'add', depthTest: true }), -89);
    this.moonHalo = this._quadAt([-1, 0.5, 0], 420, this._skyMat({ map: A.tex('sun_glow'), mode: 'add', depthTest: true }), -90);
  }

  _buildStars() {
    const N = 320;
    const pos = [], uv = [], idx = [];
    this.stars = [];
    for (let i = 0; i < N; i++) {
      // uniform on the upper hemisphere, slightly biased away from the horizon
      const el = Math.asin(lerp(0.12, 1, this.rng.next()));
      const az = this.rng.next() * Math.PI * 2;
      const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
      const size = this.rng.chance(0.15) ? 11 : 7;
      // camera-facing basis on the dome
      const up = Math.abs(d[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
      let rx = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]];
      const rl = Math.hypot(...rx); rx = rx.map((v) => v / rl);
      const uy = [d[1] * rx[2] - d[2] * rx[1], d[2] * rx[0] - d[0] * rx[2], d[0] * rx[1] - d[1] * rx[0]];
      const c = d.map((v) => v * 940);
      const h = size / 2;
      const base = pos.length / 3;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(c[0] + (rx[0] * sx + uy[0] * sy) * h, c[1] + (rx[1] * sx + uy[1] * sy) * h, c[2] + (rx[2] * sx + uy[2] * sy) * h);
        uv.push(0.5, 0.5);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.stars.push({ base, b: 0.5 + this.rng.next() * 0.5, tw: this.rng.next() * 6.28, tint: this.rng.pick([[1, 1, 1], [0.8, 0.9, 1], [1, 0.9, 0.8]]) });
    }
    this.starGeo = this._dynGeo(pos, uv, idx);
    const m = new THREE.Mesh(this.starGeo, this._skyMat({ mode: 'add', depthTest: true }));
    m.renderOrder = -95;
    m.frustumCulled = false;
    this.group.add(m);
  }

  _buildClouds() {
    this.clouds = [];
    const mat = this._skyMat({ map: this.assets.tex('cloud'), mode: 'cutout' });
    const N = 18;
    for (let i = 0; i < N; i++) {
      const az = (i / N) * Math.PI * 2 + this.rng.float(-0.12, 0.12);
      const el = this.rng.float(7, 30) * Math.PI / 180;
      const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
      const size = this.rng.float(210, 330);
      const q = this._quadAt(d, size, mat, -85 + i * 0.01);
      q.mesh.scale.set(1, 0.5, 1);
      q.el = el * 180 / Math.PI;
      this.clouds.push(q);
    }
  }

  _buildMountains() {
    const noise = valueNoise(909);
    this.mtn = [];
    const rings = [{ r: 660, hMin: 50, hMax: 150, seed: 1.7, mixK: 0.62 }, { r: 560, hMin: 28, hMax: 90, seed: 5.3, mixK: 0.38 }];
    for (const R of rings) {
      const segs = 96;
      const pos = [], uv = [], idx = [];
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const x = Math.cos(a), z = Math.sin(a);
        // jagged silhouette: ridged noise wrapped seamlessly around the circle
        const nn = fbm(noise, Math.cos(a) * 4 + R.seed, Math.sin(a) * 4 + R.seed, 3);
        const peak = R.hMin + (R.hMax - R.hMin) * Math.pow(nn, 1.4) * (0.6 + 0.4 * Math.abs(Math.sin(a * 3 + R.seed)));
        pos.push(x * R.r, -60, z * R.r, x * R.r, peak, z * R.r);
        uv.push(s / segs * 8, 0.5, s / segs * 8, 0.5);
      }
      for (let s = 0; s < segs; s++) { const a = s * 2; idx.push(a, a + 2, a + 3, a, a + 3, a + 1); }
      const geo = this._dynGeo(pos, uv, idx);
      const m = new THREE.Mesh(geo, this._skyMat({ depthTest: false }));
      m.renderOrder = -80 - this.mtn.length;
      m.frustumCulled = false;
      this.group.add(m);
      this.mtn.push({ geo, mixK: R.mixK, n: (segs + 1) * 2 });
    }
  }

  /** Recompute all vertex colours from the atmosphere. */
  refresh(atm) {
    const s = atm.sky;
    const sunH = Math.hypot(atm.sunDir[0], atm.sunDir[2]) || 1;
    const shx = atm.sunDir[0] / sunH, shz = atm.sunDir[2] / sunH;
    // dome
    const col = this.domeGeo.attributes.aCol.array;
    for (let i = 0; i < this.domeDirs.length; i++) {
      const d = this.domeDirs[i];
      const el = (Math.asin(clamp(d[1], -1, 1)) * 180) / Math.PI;
      let c = skyBase(el, s);
      const dh = Math.hypot(d[0], d[2]) || 1;
      const dot = (d[0] / dh) * shx + (d[2] / dh) * shz;
      const g = Math.pow(Math.max(0, dot), 5) * (1 - smooth(3, 38, el)) * (0.35 + 0.65 * smooth(-14, 2, el));
      c = mix3(c, s.horizon, clamp(g * atm.glowAmt * 1.15));
      c = [c[0] + s.glow[0] * g * 0.18 * atm.glowAmt, c[1] + s.glow[1] * g * 0.18 * atm.glowAmt, c[2] + s.glow[2] * g * 0.18 * atm.glowAmt];
      setColor(col, i, c);
    }
    this.domeGeo.attributes.aCol.needsUpdate = true;

    // sun / moon positions + brightness
    const place = (q, dir, size) => { q.mesh.position.set(dir[0] * 900, dir[1] * 900, dir[2] * 900); q.mesh.lookAt(0, 0, 0); };
    place(this.sunGlow, atm.sunDir); place(this.sunDisc, atm.sunDir);
    place(this.moon, atm.moonDir); place(this.moonHalo, atm.moonDir);
    const sunUp = smooth(-12, 6, atm.sunEl);
    const paint = (q, c, k) => { const a = q.geo.attributes.aCol.array; for (let i = 0; i < 4; i++) setColor(a, i, c, k * 0.5); q.geo.attributes.aCol.needsUpdate = true; };
    paint(this.sunGlow, mix3(s.glow, [1, 0.95, 0.75], smooth(0, 30, atm.sunEl)), 0.5 * sunUp * (0.6 + 0.4 * atm.glowAmt));
    paint(this.sunDisc, [1, 0.94, 0.7], smooth(-2, 8, atm.sunEl));
    paint(this.moon, [0.85, 0.9, 1.0], atm.moonAlpha);
    paint(this.moonHalo, [0.3, 0.42, 0.75], atm.moonAlpha * 0.55);

    // clouds: lit from below by the glow at dusk, white in the day
    const top = mix3([0.55, 0.5, 0.85], [1, 1, 1], smooth(0, 1, atm.sunEl / 32 + 0.25));
    const bot = mix3([0.95, 0.5, 0.55], [1, 0.9, 0.78], smooth(0, 1, atm.sunEl / 32 + 0.25));
    for (const c of this.clouds) {
      const a = c.geo.attributes.aCol.array;
      const lowFrac = 1 - smooth(6, 30, c.el);
      const k = 0.5 * 1.15;
      setColor(a, 0, mix3(bot, s.horizon, 0.2 * lowFrac), k); setColor(a, 1, mix3(bot, s.horizon, 0.2 * lowFrac), k);
      setColor(a, 2, top, k); setColor(a, 3, top, k);
      c.geo.attributes.aCol.needsUpdate = true;
    }

    // mountains fade into the fog colour at the base
    const mc = mix3([0.20, 0.15, 0.40], [0.52, 0.62, 0.88], smooth(0, 1, atm.sunEl / 32 + 0.25));
    for (const m of this.mtn) {
      const a = m.geo.attributes.aCol.array;
      const peak = mix3(s.fog, mc, m.mixK * 1.15);
      for (let i = 0; i < m.n; i += 2) { setColor(a, i, s.fog, 0.5); setColor(a, i + 1, peak, 0.5); }
      m.geo.attributes.aCol.needsUpdate = true;
    }
  }

  twinkle(t, starAlpha) {
    const a = this.starGeo.attributes.aCol.array;
    for (const st of this.stars) {
      const b = (st.b * (0.6 + 0.4 * Math.sin(t * 2.2 + st.tw))) * starAlpha;
      for (let k = 0; k < 4; k++) setColor(a, st.base + k, st.tint, b * 0.5);
    }
    this.starGeo.attributes.aCol.needsUpdate = true;
  }

  update(camera, atm, t, dt) {
    this.group.position.copy(camera.position);
    if (Math.abs(atm.dayKey - this._lastDay) > 0.0015) { this.refresh(atm); this._lastDay = atm.dayKey; }
    this._starT -= dt;
    if (this._starT <= 0) { this.twinkle(t, atm.starAlpha); this._starT = 0.12; }
  }
}
