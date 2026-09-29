// PS1 material factory + the single shared uniform block every material points at.
import * as THREE from 'three';
import { PS1_VERT, PS1_FRAG } from './shaders.js';

// All colours in this game are raw 8-bit-ish sRGB values, exactly like PS1 VRAM. No colour management.
THREE.ColorManagement.enabled = false;

/** Shared uniforms: update these once per frame and every material sees it. */
export const U = {
  uRes: { value: new THREE.Vector2(320, 240) },
  uSnap: { value: 1 },
  uAffine: { value: 1 },
  uDay: { value: 0 },
  uTime: { value: 0 },
  uWind: { value: 1 },
  uFogColor: { value: new THREE.Color(0.55, 0.36, 0.55) },
  uFogRange: { value: new THREE.Vector2(90, 320) },
  uSunDir: { value: new THREE.Vector3(0.6, 0.6, 0.2).normalize() },
  uSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
  uAmb: { value: new THREE.Color(0.4, 0.4, 0.5) },
};


let _white = null;
/** 1x1 white texture for untextured (pure vertex-colour) materials. */
export function whiteTexture() {
  if (!_white) {
    _white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    _white.magFilter = _white.minFilter = THREE.NearestFilter;
    _white.needsUpdate = true;
  }
  return _white;
}

/** Convert a Pix (RGBA, row 0 = top) into a nearest-filtered, un-mipmapped THREE texture. */
export function texFromPix(pix, { tile = true } = {}) {
  const tex = new THREE.DataTexture(new Uint8Array(pix.data.buffer.slice(pix.data.byteOffset, pix.data.byteOffset + pix.data.byteLength)), pix.w, pix.h, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = true;
  tex.wrapS = tex.wrapT = tile ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Build a PS1 material.
 * @param {object} o
 * @param {THREE.Texture} [o.map]      texture (defaults to white)
 * @param {'solid'|'cutout'|'half'|'add'} [o.mode]  PS1 blend modes: opaque / 1-bit alpha / 50% blend / additive
 * @param {boolean} [o.lit]            dynamic per-vertex lighting from normals (models); otherwise colours are baked
 * @param {boolean} [o.day]            geometry carries a second baked colour set (aColB) blended by uDay
 * @param {boolean} [o.fog]            apply depth-cue fog
 * @param {boolean} [o.sprite]         camera-facing quad shader (particles)
 * @param {boolean} [o.sway]           foliage wind sway
 * @param {number[]} [o.scroll]        uv scroll speed (units/sec)
 * @param {boolean} [o.double]         double-sided
 * @param {boolean} [o.decal]          polygon-offset toward the camera (paths, shadows)
 */
export function makeMaterial(o = {}) {
  const mode = o.mode || 'solid';
  const defines = {};
  if (o.day !== false && !o.lit && !o.sprite) defines.DAY = 1;
  if (o.lit) defines.LIT = 1;
  if (o.sprite) defines.SPRITE = 1;
  if (o.sway) defines.SWAY = 1;
  if (mode === 'cutout') defines.CUTOUT = 1;
  if (mode === 'half') defines.HALF = 1;
  if (mode === 'add') defines.ADD = 1;
  const fog = o.fog !== false;
  if (fog) defines.FOG = 1;
  if (mode === 'add' && fog) defines.FOG_ADD = 1;

  const m = new THREE.ShaderMaterial({
    vertexShader: PS1_VERT,
    fragmentShader: PS1_FRAG,
    defines,
    uniforms: {
      map: { value: o.map || whiteTexture() },
      uRes: U.uRes, uSnap: U.uSnap, uAffine: U.uAffine, uDay: U.uDay, uTime: U.uTime, uWind: U.uWind,
      uFogColor: U.uFogColor, uFogRange: U.uFogRange, uSunDir: U.uSunDir, uSunCol: U.uSunCol, uAmb: U.uAmb,
      uScroll: { value: new THREE.Vector2(...(o.scroll || [0, 0])) },
      uAlpha: { value: o.alpha ?? 1 },
      uColorMul: { value: new THREE.Color(1, 1, 1) },
      uFlash: { value: 0 },
      uFogAmt: { value: o.fogAmt ?? 1 },
    },
    side: o.double ? THREE.DoubleSide : THREE.FrontSide,
    transparent: mode === 'half' || mode === 'add',
    depthWrite: o.depthWrite ?? (mode !== 'half' && mode !== 'add'),
    depthTest: o.depthTest ?? true,
    blending: mode === 'add' ? THREE.CustomBlending : THREE.NormalBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquation: THREE.AddEquation,
    polygonOffset: !!o.decal,
    polygonOffsetFactor: o.decal ? -2 : 0,
    polygonOffsetUnits: o.decal ? -2 : 0,
  });
  if (mode === 'half') {
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.SrcAlphaFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
  }
  m.name = o.name || 'ps1';
  return m;
}
