// Effects: camera-facing sprite particles (three PS1 blend pools), persistent billboards, flat ground decals and a
// library of semantic effects (flame breath, poofs, sparkles…) the gameplay code calls.
import * as THREE from 'three';
import { makeMaterial } from '../engine/materials.js';

const STRIDE = 12;      // staging floats per billboard: x y z size rect r g b a rot dist pad
const lerp = (a, b, t) => a + (b - a) * t;

/** One draw call worth of camera-facing quads. */
class BillboardBuffer {
  constructor(atlas, { max, mode, sort = false, depthTest = true }) {
    this.atlas = atlas; this.max = max; this.sort = sort; this.n = 0;
    this.stage = new Float32Array(max * STRIDE);
    this.order = new Uint16Array(max);
    const g = this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 4 * 3);
    this.uv = new Float32Array(max * 4 * 2);
    this.size = new Float32Array(max * 4);
    this.rect = new Float32Array(max * 4 * 4);
    this.col = new Uint8Array(max * 4 * 4);
    this.rot = new Float32Array(max * 4);
    const idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) {
      this.uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    const dyn = (arr, n, norm = false) => { const a = new THREE.BufferAttribute(arr, n, norm); a.setUsage(THREE.DynamicDrawUsage); return a; };
    g.setAttribute('position', dyn(this.pos, 3));
    g.setAttribute('uv', dyn(this.uv, 2));
    g.setAttribute('aSize', dyn(this.size, 1));
    g.setAttribute('aRect', dyn(this.rect, 4));
    g.setAttribute('aCol', dyn(this.col, 4, true));
    g.setAttribute('aRot', dyn(this.rot, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = makeMaterial({ map: atlas.texture, sprite: true, mode, double: true, day: false, depthWrite: mode === 'cutout', depthTest });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = mode === 'cutout' ? 4 : mode === 'half' ? 9 : 10;
    this.mesh.name = 'fx:' + mode;
  }

  begin() { this.n = 0; }

  push(x, y, z, size, rectId, r, g, b, a, rot = 0) {
    if (this.n >= this.max) return;
    const s = this.stage, o = this.n * STRIDE;
    s[o] = x; s[o + 1] = y; s[o + 2] = z; s[o + 3] = size; s[o + 4] = rectId; s[o + 5] = r; s[o + 6] = g; s[o + 7] = b; s[o + 8] = a; s[o + 9] = rot;
    this.n++;
  }

  end(cx, cy, cz) {
    const n = this.n, s = this.stage;
    const order = this.order;
    for (let i = 0; i < n; i++) order[i] = i;
    if (this.sort && n > 1) {
      for (let i = 0; i < n; i++) { const o = i * STRIDE; const dx = s[o] - cx, dy = s[o + 1] - cy, dz = s[o + 2] - cz; s[o + 10] = dx * dx + dy * dy + dz * dz; }
      const view = Array.from(order.subarray(0, n)).sort((a, b) => s[b * STRIDE + 10] - s[a * STRIDE + 10]);
      for (let i = 0; i < n; i++) order[i] = view[i];
    }
    const rects = this.atlas.rects;
    for (let k = 0; k < n; k++) {
      const o = order[k] * STRIDE;
      const rc = rects[s[o + 4]];
      // sprites that get very close to the lens shrink away instead of filling the screen
      const ddx = s[o] - cx, ddy = s[o + 1] - cy, ddz = s[o + 2] - cz;
      const near = Math.min(1, Math.max(0, (Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) - 1.4) / 2.6));
      const size = s[o + 3] * near, rot = s[o + 9];
      const cr = Math.min(255, s[o + 5] * 0.5 * 255), cg = Math.min(255, s[o + 6] * 0.5 * 255), cb = Math.min(255, s[o + 7] * 0.5 * 255), ca = Math.min(255, s[o + 8] * 255 * near);
      for (let v = 0; v < 4; v++) {
        const vi = k * 4 + v;
        this.pos[vi * 3] = s[o]; this.pos[vi * 3 + 1] = s[o + 1]; this.pos[vi * 3 + 2] = s[o + 2];
        this.size[vi] = size; this.rot[vi] = rot;
        this.rect[vi * 4] = rc[0]; this.rect[vi * 4 + 1] = rc[1]; this.rect[vi * 4 + 2] = rc[2]; this.rect[vi * 4 + 3] = rc[3];
        this.col[vi * 4] = cr; this.col[vi * 4 + 1] = cg; this.col[vi * 4 + 2] = cb; this.col[vi * 4 + 3] = ca;
      }
    }
    const g = this.geo;
    for (const k of ['position', 'aSize', 'aRect', 'aCol', 'aRot']) g.attributes[k].needsUpdate = true;
    g.setDrawRange(0, n * 6);
    this.mesh.visible = n > 0;
  }
}

/** Flat quads draped on the terrain (blob shadows, light pools, ripples). */
class DecalBuffer {
  constructor(atlas, grid, { max, mode }) {
    this.atlas = atlas; this.grid = grid; this.max = max; this.list = [];
    const g = this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 4 * 3);
    this.uv = new Float32Array(max * 4 * 2);
    this.col = new Uint8Array(max * 4 * 4);
    const idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6);
    const dyn = (arr, n, norm = false) => { const a = new THREE.BufferAttribute(arr, n, norm); a.setUsage(THREE.DynamicDrawUsage); return a; };
    g.setAttribute('position', dyn(this.pos, 3));
    g.setAttribute('uv', dyn(this.uv, 2));
    g.setAttribute('aCol', dyn(this.col, 4, true));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = makeMaterial({ map: atlas.texture, mode, double: true, day: false, depthWrite: false, decal: true, fogAmt: 1 });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = mode === 'add' ? 7 : 6;
  }

  add(o) {
    const d = { sprite: o.sprite, id: this.atlas.id(o.sprite), x: o.x || 0, z: o.z || 0, y: null, r: o.r || 1, rot: o.rot || 0, color: o.color || [1, 1, 1], alpha: o.alpha ?? 1, visible: true, dead: false, lift: o.lift ?? 0.09 };
    this.list.push(d);
    return d;
  }

  update() {
    const g = this.grid, atlas = this.atlas;
    let n = 0;
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
    for (const d of list) {
      if (!d.visible || d.alpha <= 0.003 || n >= this.max) continue;
      const rc = atlas.rects[d.id];
      const c = Math.cos(d.rot) * d.r, s = Math.sin(d.rot) * d.r;
      const corners = [[-c + s, -s - c], [c + s, s - c], [c - s, s + c], [-c - s, -s + c]];
      const ca = Math.min(255, d.color[0] * 0.5 * 255), cb = Math.min(255, d.color[1] * 0.5 * 255), cc = Math.min(255, d.color[2] * 0.5 * 255), cd = Math.min(255, d.alpha * 255);
      for (let v = 0; v < 4; v++) {
        const vi = n * 4 + v;
        const x = d.x + corners[v][0], z = d.z + corners[v][1];
        this.pos[vi * 3] = x; this.pos[vi * 3 + 1] = (d.y !== null ? d.y : g.heightAt(x, z)) + d.lift; this.pos[vi * 3 + 2] = z;
        const u = v === 1 || v === 2 ? rc[2] : rc[0], w = v >= 2 ? rc[3] : rc[1];
        this.uv[vi * 2] = u; this.uv[vi * 2 + 1] = w;
        this.col[vi * 4] = ca; this.col[vi * 4 + 1] = cb; this.col[vi * 4 + 2] = cc; this.col[vi * 4 + 3] = cd;
      }
      n++;
    }
    const geo = this.geo;
    geo.attributes.position.needsUpdate = true; geo.attributes.uv.needsUpdate = true; geo.attributes.aCol.needsUpdate = true;
    geo.setDrawRange(0, n * 6);
    this.mesh.visible = n > 0;
  }
}

export class Fx {
  constructor(atlas, grid, scene) {
    this.atlas = atlas;
    this.grid = grid;
    this.bufs = {
      add: new BillboardBuffer(atlas, { max: 1800, mode: 'add' }),
      half: new BillboardBuffer(atlas, { max: 500, mode: 'half', sort: true }),
      cut: new BillboardBuffer(atlas, { max: 500, mode: 'cutout' }),
    };
    this.decalHalf = new DecalBuffer(atlas, grid, { max: 160, mode: 'half' });
    this.decalAdd = new DecalBuffer(atlas, grid, { max: 96, mode: 'add' });
    this.group = new THREE.Group();
    this.group.name = 'fx';
    for (const b of Object.values(this.bufs)) this.group.add(b.mesh);
    this.group.add(this.decalHalf.mesh, this.decalAdd.mesh);
    scene.add(this.group);
    this.p = [];            // live particles (objects; counts stay in the low thousands)
    this.pool = [];         // recycled particle objects
    this.handles = [];      // persistent billboards
    this.time = 0;
    this.rng = Math.random;
  }

  /** Let go of the effects' materials (their geometries go with the scene's). */
  dispose() {
    for (const b of [...Object.values(this.bufs), this.decalHalf, this.decalAdd]) b.mesh.material.dispose();
  }

  // ---- low level ---------------------------------------------------------------------------------------------------
  /**
   * Spawn a transient particle. o: { pool:'add'|'half'|'cut', sprite | frames:[names], fps, loop, x,y,z, vx,vy,vz,
   * gravity, drag, life, size:[a,b], c0:[r,g,b,a], c1:[r,g,b,a], rot, spin }
   */
  spawn(o) {
    if (this.p.length > 2600) return null;
    const p = this.pool.pop() || {};
    p.pool = o.pool || 'add';
    const frames = o.frames || [o.sprite];
    p.ids = frames.map((f) => this.atlas.id(f));
    p.fps = o.fps || 0; p.loop = o.loop !== false; p.overLife = !!o.overLife;
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.g = o.gravity || 0; p.drag = o.drag || 0;
    p.life = o.life || 1; p.age = 0;
    p.s0 = o.size ? o.size[0] : 1; p.s1 = o.size ? o.size[1] : p.s0;
    p.c0 = o.c0 || [1, 1, 1, 1]; p.c1 = o.c1 || p.c0;
    p.rot = o.rot || 0; p.spin = o.spin || 0;
    p.pulse = !!o.pulse;             // fade in and out over the life (sin envelope) instead of a one-way ramp
    p.delay = o.delay || 0;
    this.p.push(p);
    return p;
  }

  /** Persistent billboard handle (Sparx, halos, markers). Update its fields; set .dead = true to remove. */
  billboard(o) {
    const h = { pool: o.pool || 'cut', sprite: o.sprite, frames: null, x: 0, y: 0, z: 0, size: o.size || 1, color: o.color || [1, 1, 1], alpha: o.alpha ?? 1, rot: 0, visible: true, dead: false, id: this.atlas.id(o.sprite) };
    this.handles.push(h);
    return h;
  }

  setSprite(h, name) { h.id = this.atlas.id(name); }

  decal(o) { return (o.pool === 'add' ? this.decalAdd : this.decalHalf).add(o); }

  update(dt, camera) {
    this.time += dt;
    const cp = camera.position;
    for (const b of Object.values(this.bufs)) b.begin();
    const list = this.p;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.age += dt;
      if (p.age >= p.life) { list[i] = list[list.length - 1]; list.pop(); this.pool.push(p); continue; }
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.spin * dt;
      const t = p.age / p.life;
      const n = p.ids.length;
      let fi = 0;
      if (n > 1) fi = p.overLife ? Math.min(n - 1, Math.floor(t * n)) : p.loop ? Math.floor(p.age * p.fps) % n : Math.min(n - 1, Math.floor(p.age * p.fps));
      const c0 = p.c0, c1 = p.c1;
      this.bufs[p.pool].push(p.x, p.y, p.z, lerp(p.s0, p.s1, t), p.ids[fi], lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t), lerp(c0[3], c1[3], t) * (p.pulse ? Math.sin(Math.PI * t) : 1), p.rot);
    }
    const hs = this.handles;
    for (let i = hs.length - 1; i >= 0; i--) {
      const h = hs[i];
      if (h.dead) { hs.splice(i, 1); continue; }
      if (!h.visible || h.alpha <= 0.003) continue;
      this.bufs[h.pool].push(h.x, h.y, h.z, h.size, h.id, h.color[0], h.color[1], h.color[2], h.alpha, h.rot);
    }
    for (const b of Object.values(this.bufs)) b.end(cp.x, cp.y, cp.z);
    this.decalHalf.update();
    this.decalAdd.update();
  }

  // ---- semantic effects ----------------------------------------------------------------------------------------------
  rnd(a, b) { return a + (b - a) * Math.random(); }

  /** Fire breath: a few flame sprites streaming along dir from the mouth. */
  flameBreath(x, y, z, dx, dz, power = 1) {
    for (let i = 0; i < 3; i++) {
      const sp = this.rnd(8, 12.5) * power;
      const j = 0.26;
      this.spawn({
        pool: 'add', frames: ['flame_0', 'flame_1', 'flame_2', 'flame_3'], fps: 14, x: x + dx * this.rnd(0, 0.5), y: y + this.rnd(-0.06, 0.1), z: z + dz * this.rnd(0, 0.5),
        vx: dx * sp + this.rnd(-j, j) * sp * 0.4, vy: this.rnd(0.2, 1.2), vz: dz * sp + this.rnd(-j, j) * sp * 0.4, drag: 2.6,
        life: this.rnd(0.30, 0.46), size: [this.rnd(0.5, 0.8), this.rnd(1.5, 2.3)], c0: [1, 0.95, 0.7, 1], c1: [1, 0.35, 0.08, 0], rot: this.rnd(-0.4, 0.4), spin: this.rnd(-2, 2),
      });
    }
    if (Math.random() < 0.35) this.spawn({ pool: 'add', sprite: 'spark_small', x, y, z, vx: dx * 7 + this.rnd(-1.5, 1.5), vy: this.rnd(0.5, 2.5), vz: dz * 7 + this.rnd(-1.5, 1.5), gravity: -6, life: this.rnd(0.4, 0.8), size: [0.32, 0.12], c0: [1, 0.8, 0.3, 1], c1: [1, 0.3, 0.1, 0] });
  }

  /** Torch / brazier flames: call every frame while lit. */
  torchFlame(x, y, z, big = false, k = 1) {
    if (Math.random() > 0.6 * k) return;
    this.spawn({ pool: 'add', frames: big ? ['flame_big_0', 'flame_big_1', 'flame_big_2', 'flame_big_3'] : ['flame_0', 'flame_1', 'flame_2', 'flame_3'], fps: 10,
      x: x + this.rnd(-0.12, 0.12), y, z: z + this.rnd(-0.12, 0.12), vy: this.rnd(0.6, 1.4), vx: this.rnd(-0.2, 0.2), vz: this.rnd(-0.2, 0.2), life: this.rnd(0.35, 0.55),
      size: big ? [1.7, 0.8] : [0.9, 0.4], c0: [1, 0.9, 0.6, 1], c1: [1, 0.4, 0.1, 0] });
    if (Math.random() < 0.08) this.spawn({ pool: 'add', sprite: 'spark_small', x, y: y + 0.4, z, vx: this.rnd(-0.6, 0.6), vy: this.rnd(1.5, 3), vz: this.rnd(-0.6, 0.6), life: this.rnd(0.7, 1.4), size: [0.25, 0.08], c0: [1, 0.7, 0.2, 1], c1: [1, 0.3, 0.1, 0] });
  }

  puff(x, y, z, scale = 1) {
    this.spawn({ pool: 'half', frames: ['puff_0', 'puff_1', 'puff_2', 'puff_3'], overLife: true, x, y, z, life: 0.55, size: [1.4 * scale, 3.0 * scale], c0: [1, 1, 1, 1], c1: [1, 1, 1, 1] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random();
      this.spawn({ pool: 'add', sprite: 'spark_small', x, y: y + 0.5, z, vx: Math.cos(a) * this.rnd(2, 5), vy: this.rnd(2, 5), vz: Math.sin(a) * this.rnd(2, 5), gravity: -14, life: this.rnd(0.4, 0.7), size: [0.35, 0.1], c0: [0.8, 0.6, 1, 1], c1: [0.5, 0.3, 1, 0] });
    }
  }

  dust(x, y, z, n = 1, spread = 0.4) {
    for (let i = 0; i < n; i++) {
      this.spawn({ pool: 'half', sprite: 'dust', x: x + this.rnd(-spread, spread), y: y + 0.1, z: z + this.rnd(-spread, spread), vx: this.rnd(-0.6, 0.6), vy: this.rnd(0.4, 1.2), vz: this.rnd(-0.6, 0.6), drag: 2, life: this.rnd(0.35, 0.6), size: [0.35, 0.8], c0: [1, 0.95, 0.85, 1], c1: [1, 0.95, 0.85, 0] });
    }
  }

  landDust(x, y, z, power = 1) {
    const n = 5 + Math.round(power * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawn({ pool: 'half', sprite: 'dust', x: x + Math.cos(a) * 0.4, y: y + 0.12, z: z + Math.sin(a) * 0.4, vx: Math.cos(a) * 2.6 * power, vy: 0.6, vz: Math.sin(a) * 2.6 * power, drag: 3, life: 0.5, size: [0.5, 1.1], c0: [1, 0.95, 0.85, 1], c1: [1, 0.95, 0.85, 0] });
    }
  }

  splash(x, y, z, power = 1) {
    this.spawn({ pool: 'half', frames: ['splash_0', 'splash_1', 'splash_2'], overLife: true, x, y: y + 0.6, z, life: 0.55, size: [1.6 * power, 2.6 * power], c0: [1, 1, 1, 1] });
    this.spawn({ pool: 'add', frames: ['ripple_0', 'ripple_1', 'ripple_2'], overLife: true, x, y: y + 0.1, z, life: 0.8, size: [1.2, 3.4 * power], c0: [0.7, 0.9, 1, 1], c1: [0.7, 0.9, 1, 0] });
  }

  sparkle(x, y, z, color = [1, 0.9, 0.5], size = 0.6) {
    this.spawn({ pool: 'add', sprite: 'spark', x, y, z, vy: this.rnd(0.2, 0.8), life: this.rnd(0.35, 0.6), size: [size, size * 0.2], c0: [...color, 1], c1: [...color, 0], rot: this.rnd(0, 3), spin: this.rnd(-3, 3) });
  }

  glint(x, y, z, size = 0.9) {
    this.spawn({ pool: 'add', sprite: 'gem_glint', x, y, z, life: 0.28, size: [size, size * 0.3], c0: [1, 1, 1, 1], c1: [1, 1, 1, 0] });
  }

  /** A tiny coloured sparkle left behind by a gem in flight. */
  gemTrail(x, y, z, color) {
    this.spawn({ pool: 'add', sprite: 'spark_small', x, y, z, vx: this.rnd(-0.5, 0.5), vy: this.rnd(0.2, 1.0), vz: this.rnd(-0.5, 0.5), life: this.rnd(0.28, 0.42), size: [0.4, 0.08], c0: [...color.map((c) => Math.min(1, c + 0.35)), 1], c1: [...color, 0] });
  }

  /** A four-point star twinkle (the white sparkle that pops on gems). */
  twinkle(x, y, z, size = 1) {
    this.spawn({ pool: 'add', sprite: 'spark', x, y, z, life: 0.45, size: [size * 1.3, size * 0.2], c0: [1, 1, 0.96, 1], c1: [1, 0.95, 0.8, 0], rot: this.rnd(-0.35, 0.35) });
  }

  gemPickup(x, y, z, color) {
    this.spawn({ pool: 'add', sprite: 'lens_star', x, y, z, life: 0.32, size: [0.6, 1.9], c0: [...color, 1], c1: [...color, 0] });
    this.twinkle(x, y + 0.1, z, 1.5);
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn({ pool: 'add', sprite: 'spark_small', x, y, z, vx: Math.cos(a) * this.rnd(1, 3), vy: this.rnd(2, 5), vz: Math.sin(a) * this.rnd(1, 3), gravity: -12, life: this.rnd(0.35, 0.6), size: [0.3, 0.08], c0: [...color, 1], c1: [...color, 0] });
    }
  }

  /** Lantern ignition burst. */
  ignite(x, y, z, big = false) {
    const k = big ? 2.4 : 1;
    this.spawn({ pool: 'add', sprite: 'lens_star', x, y, z, life: 1.1, size: [2 * k, 9 * k], c0: [1, 0.9, 0.55, 1], c1: [1, 0.6, 0.2, 0], rot: 0, spin: 0.6 });
    this.spawn({ pool: 'add', sprite: 'ring', x, y, z, life: 0.9, size: [1 * k, 12 * k], c0: [1, 0.85, 0.5, 1], c1: [1, 0.6, 0.2, 0] });
    for (let i = 0; i < 36 * (big ? 2 : 1); i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 0.9 + 0.1, sp = this.rnd(3, 9) * k;
      this.spawn({ pool: 'add', sprite: Math.random() < 0.5 ? 'spark' : 'spark_small', x, y, z, vx: Math.cos(a) * sp * e, vy: this.rnd(2, 9) * k, vz: Math.sin(a) * sp * e, gravity: -5, drag: 0.4, life: this.rnd(0.9, 1.9), size: [this.rnd(0.4, 0.9), 0.1], c0: [1, this.rnd(0.7, 1), this.rnd(0.3, 0.7), 1], c1: [1, 0.5, 0.2, 0], spin: this.rnd(-4, 4) });
    }
  }

  hitSpark(x, y, z, scale = 1) {
    this.spawn({ pool: 'add', sprite: 'lens_star', x, y, z, life: 0.22, size: [0.8 * scale, 2.6 * scale], c0: [1, 1, 0.8, 1], c1: [1, 0.7, 0.3, 0] });
    this.spawn({ pool: 'add', sprite: 'ring', x, y, z, life: 0.3, size: [0.5 * scale, 3 * scale], c0: [1, 0.9, 0.7, 1], c1: [1, 0.7, 0.3, 0] });
  }

  smoke(x, y, z, scale = 1) {
    this.spawn({ pool: 'half', frames: ['smoke_0', 'smoke_1'], overLife: true, x, y, z, vx: this.rnd(-0.1, 0.4), vy: this.rnd(0.7, 1.1), vz: this.rnd(-0.2, 0.2), life: this.rnd(2.2, 3.4), size: [0.7 * scale, 2.6 * scale], c0: [0.9, 0.85, 1, 0.9], c1: [0.9, 0.85, 1, 0], rot: this.rnd(0, 6), spin: this.rnd(-0.3, 0.3) });
  }

  firefly(x, y, z) {
    this.spawn({ pool: 'add', sprite: 'firefly', x, y, z, vx: this.rnd(-0.5, 0.5), vy: this.rnd(-0.1, 0.4), vz: this.rnd(-0.5, 0.5), life: this.rnd(3, 6), size: [0.3, 0.3], c0: [0.9, 1, 0.4, 0.9], c1: [0.9, 1, 0.4, 0.9], overLife: false, pulse: true });
  }

  leaf(x, y, z, color = [1, 0.7, 0.3]) {
    this.spawn({ pool: 'cut', sprite: 'leaf', x, y, z, vx: this.rnd(0.3, 1.2), vy: this.rnd(-1.2, -0.5), vz: this.rnd(-0.6, 0.6), life: this.rnd(3, 6), size: [0.35, 0.35], c0: [...color, 1], spin: this.rnd(-3, 3) });
  }

  /** Vase/wall shards. */
  shards(x, y, z, colors, n = 10) {
    for (let i = 0; i < n; i++) {
      const c = colors[i % colors.length];
      const a = Math.random() * Math.PI * 2, sp = this.rnd(2, 6);
      this.spawn({ pool: 'cut', sprite: 'dust', x, y, z, vx: Math.cos(a) * sp, vy: this.rnd(3, 8), vz: Math.sin(a) * sp, gravity: -22, life: this.rnd(0.6, 1.1), size: [0.42, 0.34], c0: [c[0] * 1.6, c[1] * 1.6, c[2] * 1.6, 1], spin: this.rnd(-8, 8) });
    }
    this.dust(x, y, z, 4, 0.5);
  }
}
