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
  uBlend: { value: 0 },       // eased day: weight of the baked daybreak lighting (sky/fog/dynamic lights use the same curve)
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

// ---- texture filtering: PS1 point sampling, or a smooth "enhanced" look (what an emulator's texture filter gives) -----------------
// Smooth mode upscales each tiny texture once with a Mitchell-Netravali kernel (colour weighted by alpha, so cut-outs do not get
// dark fringes), then samples it bilinearly (+ mipmaps on tiling textures). The switch is live: every texture ever created is
// tracked and re-uploaded when the mode changes.
let _smooth = false;
const _texs = new Set();      // WeakRef<{ tex, pix, tile, smooth: {data,w,h}|null }>

const mitchell = (x) => {
  x = Math.abs(x);
  const B = 0, C = 0.5;                  // Catmull-Rom: smooth but keeps the painted detail crisp
  if (x < 1) return ((12 - 9 * B - 6 * C) * x * x * x + (-18 + 12 * B + 6 * C) * x * x + (6 - 2 * B)) / 6;
  if (x < 2) return ((-B - 6 * C) * x * x * x + (6 * B + 30 * C) * x * x + (-12 * B - 48 * C) * x + (8 * B + 24 * C)) / 6;
  return 0;
};

function smoothUpscale(pix, k, wrap) {
  const w = pix.w, h = pix.h, W = w * k, H = h * k;
  const src = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {                                   // premultiply
    const a = pix.data[i * 4 + 3] / 255;
    src[i * 4] = pix.data[i * 4] * a; src[i * 4 + 1] = pix.data[i * 4 + 1] * a; src[i * 4 + 2] = pix.data[i * 4 + 2] * a; src[i * 4 + 3] = a * 255;
  }
  const taps = (n, size) => {                                          // per output index: 4 (src index, weight) pairs
    const out = new Array(n * k);
    for (let o = 0; o < n * k; o++) {
      const u = (o + 0.5) / k - 0.5, i0 = Math.floor(u), t = u - i0;
      const t4 = [];
      let sum = 0;
      for (let d = -1; d <= 2; d++) {
        let idx = i0 + d;
        idx = wrap ? ((idx % size) + size) % size : Math.max(0, Math.min(size - 1, idx));
        const wt = mitchell(t - d);
        sum += wt; t4.push([idx, wt]);
      }
      for (const q of t4) q[1] /= sum;
      out[o] = t4;
    }
    return out;
  };
  const tx = taps(w, w), ty = taps(h, h);
  const mid = new Float32Array(W * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
    for (let c = 0; c < 4; c++) {
      let v = 0;
      for (const [ix, wt] of tx[x]) v += src[(y * w + ix) * 4 + c] * wt;
      mid[(y * W + x) * 4 + c] = v;
    }
  }
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = [0, 0, 0, 0];
    for (const [iy, wt] of ty[y]) for (let c = 0; c < 4; c++) v[c] += mid[(iy * W + x) * 4 + c] * wt;
    const a = Math.max(0, Math.min(255, v[3])), o = (y * W + x) * 4;
    const inv = a > 0.5 ? 255 / a : 0;                                 // un-premultiply
    out[o] = Math.max(0, Math.min(255, v[0] * inv)); out[o + 1] = Math.max(0, Math.min(255, v[1] * inv)); out[o + 2] = Math.max(0, Math.min(255, v[2] * inv)); out[o + 3] = a;
  }
  return { data: out, w: W, h: H };
}

function applyTexMode(e) {
  const tex = e.tex, { pix, tile } = e;
  let img;
  if (_smooth) {
    const k = Math.max(1, Math.min(8, Math.floor((pix.w * pix.h > 65536 ? 512 : 256) / Math.max(pix.w, pix.h))));
    if (k > 1) {
      if (!e.smooth) e.smooth = smoothUpscale(pix, k, tile);
      img = e.smooth;
    }
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = tile;                                        // (atlases are sampled by sub-rect: no mip bleeding)
    tex.minFilter = tile ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    tex.anisotropy = tile ? 4 : 1;
  } else {
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.anisotropy = 1;
  }
  const fresh = img || { data: e.raw, w: pix.w, h: pix.h };
  tex.image = { data: fresh.data, width: fresh.w, height: fresh.h };
  tex.dispose();                                                       // (the size may change: let three re-create the GPU texture)
  tex.needsUpdate = true;
}

/** Switch every texture (existing and future) between PS1 point sampling and the smooth filtered look. */
export function setTextureSmoothing(on) {
  on = !!on;
  if (on === _smooth) return;
  _smooth = on;
  for (const ref of _texs) {
    const e = ref.deref();
    if (!e) { _texs.delete(ref); continue; }
    applyTexMode(e);
  }
}

/** Convert a Pix (RGBA, row 0 = top) into a THREE texture: nearest-filtered and un-mipmapped, or smooth (see above). */
export function texFromPix(pix, { tile = true } = {}) {
  const raw = new Uint8Array(pix.data.buffer.slice(pix.data.byteOffset, pix.data.byteOffset + pix.data.byteLength));
  const tex = new THREE.DataTexture(raw, pix.w, pix.h, THREE.RGBAFormat);
  tex.flipY = true;
  tex.wrapS = tex.wrapT = tile ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  const e = { tex, pix: { data: raw, w: pix.w, h: pix.h }, raw, tile, smooth: null };
  applyTexMode(e);
  _texs.add(new WeakRef(e));
  tex.userData.texEntry = e;                                           // (keeps the entry alive exactly as long as the texture)
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
      uRes: U.uRes, uSnap: U.uSnap, uAffine: U.uAffine, uDay: U.uDay, uBlend: U.uBlend, uTime: U.uTime, uWind: U.uWind,
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
