// Kit: the toolbox every scenery prop is written against.
//
//   kit.at(x, z, { rot, scale, y }, () => {           // transform for the whole prop (ground height by default)
//     kit.b('bark').cyl(0.4, 0.25, 3, 6, { tile: 3 }); // one Builder per texture (+ blend mode); shared transform
//     kit.b('leaves_green').blob(2.2, { detail: 1 });
//     kit.caster(0, 0, 1.6, 5);                        // shadow footprint (registered in the dry pass)
//     kit.cyl(0, 0, 0.5, 0, 3);                        // collider (cylinder, world = local when kit.at rotates!)
//   });
//
// Props run TWICE: a dry pass (builders disabled) registers shadow casters / colliders / lights so the lighting can be
// baked, then a wet pass emits the actual lit geometry. Prop functions must therefore be deterministic: use kit.rng().
import * as THREE from 'three';
import { Builder, Xf } from '../engine/builder.js';
import { RNG } from '../engine/textures/pix.js';

const hash = (a, b, c = 0) => {
  let h = (Math.floor(a * 100) * 374761393 + Math.floor(b * 100) * 668265263 + c * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return (h ^ (h >>> 16)) >>> 0;
};

export class Kit {
  /**
   * @param {object} o
   * @param {import('./assets.js').Assets} o.assets
   * @param {import('../engine/lighting.js').Lighting} o.lighting
   * @param {{heightAt:(x:number,z:number)=>number}} o.grid
   */
  constructor({ assets, lighting, grid }) {
    this.assets = assets;
    this.lighting = lighting;
    this.grid = grid;
    this.xf = new Xf();
    this.builders = new Map();
    this.colliders = [];
    this.lights = [];
    this.emitters = [];
    this.pass = 'wet';
    this.origin = { x: 0, y: 0, z: 0, rot: 0, scale: 1 }; // current prop placement (for caster/collider/light registration)
    this._stack = [];
  }

  setPass(p) {
    this.pass = p;
    for (const b of this.builders.values()) b.builder.enabled = p === 'wet';
  }

  /**
   * Builder for a texture. o: material options (mode: 'solid'|'cutout'|'half'|'add', double, sway, decal, scroll, fog)
   * `tex` may be null for untextured (vertex-colour only) geometry.
   */
  b(tex, o = {}) {
    const key = (tex || '_') + '|' + JSON.stringify(o);
    let e = this.builders.get(key);
    if (!e) {
      const builder = new Builder({ lighting: this.lighting, xf: this.xf, seed: hash(this.builders.size, 7) });
      builder.enabled = this.pass === 'wet';
      e = { builder, tex, o };
      this.builders.set(key, e);
    }
    return e.builder;
  }

  groundY(x, z) { return this.grid.heightAt(x, z); }

  /** Deterministic RNG for a placement. */
  rng(x, z, salt = 0) { return new RNG(hash(x, z, salt) || 1); }

  /**
   * Place a prop: translate to (x, y, z) (y defaults to ground height), rotate about Y, uniform scale, run fn.
   * Inside fn, positions are local to the prop.
   */
  at(x, z, opts, fn) {
    if (typeof opts === 'function') { fn = opts; opts = {}; }
    const { rot = 0, scale = 1, y = this.groundY(x, z) } = opts;
    this._stack.push(this.origin);
    this.origin = { x, y, z, rot, scale };
    this.xf.push().translate(x, y, z);
    if (rot) this.xf.rotateY(rot);
    if (scale !== 1) this.xf.scale(scale);
    fn(this);
    this.xf.pop();
    this.origin = this._stack.pop();
    return this;
  }

  /** local (lx,lz) -> world (x,z) under the current prop placement */
  toWorld(lx, lz) {
    const o = this.origin, c = Math.cos(o.rot), s = Math.sin(o.rot);
    return [o.x + (lx * c + lz * s) * o.scale, o.z + (-lx * s + lz * c) * o.scale];
  }

  /** Shadow footprint (local coords). r = radius, h = height. Dry pass only. */
  caster(lx, lz, r, h, k = 0.55) {
    if (this.pass !== 'dry') return;
    const [wx, wz] = this.toWorld(lx, lz);
    const s = this.origin.scale;
    this.lighting.addCaster(wx, wz, r * s, h * s, k);
  }

  /** Vertical cylinder collider (local coords, y relative to the prop's ground y). top = can be stood on. */
  cyl(lx, lz, r, y0, y1, { top = false, tag = '' } = {}) {
    if (this.pass !== 'dry') return;
    const [wx, wz] = this.toWorld(lx, lz);
    const o = this.origin;
    this.colliders.push({ type: 'cyl', x: wx, z: wz, r: r * o.scale, y0: o.y + y0 * o.scale, y1: o.y + y1 * o.scale, top, tag });
  }

  /** Oriented box collider (local coords; hx, hz half extents). */
  box(lx, lz, hx, hz, y0, y1, { top = false, tag = '', rot = 0 } = {}) {
    if (this.pass !== 'dry') return;
    const [wx, wz] = this.toWorld(lx, lz);
    const o = this.origin;
    this.colliders.push({ type: 'box', x: wx, z: wz, hx: hx * o.scale, hz: hz * o.scale, rot: o.rot + rot, y0: o.y + y0 * o.scale, y1: o.y + y1 * o.scale, top, tag });
  }

  /**
   * Glow point (lamp / crystal / window): the game adds an additive halo sprite and a light pool on the ground.
   * color = [r,g,b] 0..1, size = halo diameter, pool = ground-pool radius (0 = none).
   */
  glow(lx, ly, lz, { color = [1, 0.8, 0.4], size = 4, pool = 0, flicker = 0 } = {}) {
    if (this.pass !== 'dry') return;
    const [wx, wz] = this.toWorld(lx, lz);
    const o = this.origin;
    this.lights.push({ x: wx, y: o.y + ly * o.scale, z: wz, color, size: size * o.scale, pool: pool * o.scale, flicker, groundY: o.y });
  }

  /**
   * Ambient particle emitter anchored to a prop (the game spawns the particles): kind = 'smoke' (chimneys),
   * 'sparkle' (crystals/gems), 'firefly', 'leaf', 'mist' (waterfalls). rate = particles/second, radius = spawn spread.
   */
  emitter(lx, ly, lz, { kind = 'smoke', rate = 2, radius = 0.3 } = {}) {
    if (this.pass !== 'dry') return;
    const [wx, wz] = this.toWorld(lx, lz);
    const o = this.origin;
    this.emitters.push({ kind, x: wx, y: o.y + ly * o.scale, z: wz, rate, radius: radius * o.scale });
  }

  /** Materialise all builders as meshes. */
  build() {
    const group = new THREE.Group();
    group.name = 'props';
    for (const { builder, tex, o } of this.builders.values()) {
      if (builder.triangleCount === 0) continue;
      const mat = this.assets.mat(tex, o);
      const mesh = new THREE.Mesh(builder.build(), mat);
      mesh.name = 'prop:' + (tex || 'vertex') + (o.mode ? ':' + o.mode : '');
      if (o.mode === 'half' || o.mode === 'add') mesh.renderOrder = 8;
      group.add(mesh);
    }
    return group;
  }

  triangleCount() {
    let n = 0;
    for (const { builder } of this.builders.values()) n += builder.triangleCount;
    return n;
  }
}

/** A flat test "terrain" for prop galleries. */
export function flatGrid(h = 3.2, n = 80, cell = 2.4) {
  const s = n + 1;
  const heights = new Float32Array(s * s).fill(h);
  return { n, cell, half: (n * cell) / 2, size: n * cell, heights, heightAt: () => h, vertexNormal: () => [0, 1, 0], normalAt: (x, z, o = [0, 1, 0]) => { o[0] = 0; o[1] = 1; o[2] = 0; return o; } };
}
