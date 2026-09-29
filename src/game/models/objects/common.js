// Shared scaffolding for the interactive-object models.
//
// A `Rig` owns the THREE root group, every per-entity material and every mesh of one model, so that flash() and
// dispose() are one-liners and the triangle budget can be read back (rig.tris).
//
// Material flavours (all unique per model, so uniforms such as uFlash / uColorMul / uAlpha are private):
//   rig.lit(tex, o)    normal-lit solid (dynamic per-vertex lighting from the normals; vertex colours are albedo tints)
//   rig.full(tex, o)   unlit "fullbright" solid: vertex colour 0.5 = neutral, texture shows exactly as painted
//   rig.glow(tex, o)   additive glow (PS1 additive blend); vertex colour 0.5 = neutral, vertex alpha + uAlpha fade it
//   rig.half(tex, o)   50% blended (uAlpha > 1 pushes it toward opaque)
import * as THREE from 'three';
import { makeMaterial, U } from '../../../engine/materials.js';

export class Rig {
  constructor(assets) {
    this.assets = assets;
    this.root = new THREE.Group();
    this.mats = [];
    this.flashMats = [];
    this.meshes = [];
    this.tris = 0;
    this.extraDispose = [];
  }

  _m(tex, o, flashable) {
    const m = this.assets.mat(tex, { unique: true, ...o });
    this.mats.push(m);
    if (flashable) this.flashMats.push(m);
    return m;
  }

  /** Unique lit material around an already-built THREE texture (derived textures are shared: never disposed here). */
  litMap(map, o = {}) {
    const m = makeMaterial({ map, lit: true, ...o });
    this.mats.push(m);
    this.flashMats.push(m);
    return m;
  }
  lit(tex, o = {}) { return this._m(tex, { lit: true, ...o }, true); }
  full(tex, o = {}) { return this._m(tex, { lit: false, day: false, ...o }, true); }
  glow(tex, o = {}) { return this._m(tex, { lit: false, day: false, mode: 'add', ...o }, false); }
  half(tex, o = {}) { return this._m(tex, { lit: false, day: false, mode: 'half', ...o }, false); }

  /** Builder -> Mesh (parented to `parent`, default root). Translucent materials draw late (renderOrder 8, like kit.build). */
  mesh(builder, material, parent = null, o = {}) {
    const g = builder.build();
    this.tris += g.userData.tris;
    const m = new THREE.Mesh(g, material);
    m.name = o.name || material.name || 'part';
    if (material.transparent) m.renderOrder = o.order ?? 8;
    (parent || this.root).add(m);
    this.meshes.push(m);
    return m;
  }

  /** Empty pivot group at (x, y, z). */
  pivot(name, x = 0, y = 0, z = 0, parent = null) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    (parent || this.root).add(g);
    return g;
  }

  /** Named anchor (Object3D) at a local position. */
  anchor(anchors, name, x, y, z, parent = null) {
    const a = new THREE.Object3D();
    a.name = name;
    a.position.set(x, y, z);
    (parent || this.root).add(a);
    anchors[name] = a;
    return a;
  }

  flash(k) { for (const m of this.flashMats) m.uniforms.uFlash.value = k; }

  dispose() {
    for (const m of this.meshes) m.geometry.dispose();
    for (const m of this.mats) m.dispose();
    for (const f of this.extraDispose) f();
    this.root.removeFromParent();
  }
}

/** Set a material's colour multiplier from an [r,g,b] array. */
export function setMul(mat, c) { mat.uniforms.uColorMul.value.setRGB(c[0], c[1], c[2]); }
export function setAlpha(mat, a) { mat.uniforms.uAlpha.value = a; }

/**
 * Exposure compensation for lit models: the moonlit twilight environment is very dark (ambient ~0.35), so the
 * interactive objects lift their albedo a little at day=0 and relax to 1.0 as the daybreak comes in.
 * `k` = twilight gain (1 = none).
 */
export function exposure(k = 1.45, day = U.uDay.value) {
  const t = day <= 0 ? 0 : day >= 0.8 ? 1 : day / 0.8;
  return k + (1 - k) * t;
}

export function setExposure(mat, e, tint = null) {
  mat.uniforms.uColorMul.value.setRGB(e * (tint ? tint[0] : 1), e * (tint ? tint[1] : 1), e * (tint ? tint[2] : 1));
}
