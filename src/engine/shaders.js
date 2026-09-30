// GLSL for the PlayStation-1 look. Everything here is deliberately "wrong" in the way the PS1 GPU/GTE was:
//   * vertices snap to whole pixels of the internal 320x240 grid (no sub-pixel precision -> wobble)
//   * textures are interpolated affinely in screen space (no perspective correction -> warping)
//   * lighting is per-vertex (baked colours, Gouraud); fog is per-vertex depth-cueing
//   * texture * vertexColour * 2 (0.5 == neutral) with hard clamp, nearest-neighbour texels, 1-bit cutouts
//   * the final image is ordered-dithered and squeezed to 15-bit colour (see QUANT_FRAG)

/** Snap clip-space xy to integer pixel coordinates of the internal resolution. */
const SNAP = /* glsl */ `
vec4 ps1Snap(vec4 clip) {
  if (uSnap > 0.5 && clip.w > 0.05) {
    vec2 ndc = clip.xy / clip.w;
    vec2 scr = floor(ndc * 0.5 * uRes + 0.5);
    clip.xy = (scr / (0.5 * uRes)) * clip.w;
  }
  return clip;
}
`;

export const PS1_VERT = /* glsl */ `
uniform vec2 uRes;
uniform float uSnap;
uniform float uDay;
uniform float uBlend;
uniform vec2 uFogRange;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uAmb;
uniform float uWind;
uniform float uTime;

attribute vec4 aCol;
#ifdef DAY
attribute vec4 aColB;
#endif
#ifdef SPRITE
attribute float aSize;
attribute vec4 aRect;
attribute float aRot;
#endif

varying vec2 vUvP;
varying vec2 vUvA;
varying vec4 vCol;
varying float vFog;

${SNAP}

void main() {
  #ifdef SPRITE
    vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
    vec2 corner = uv * 2.0 - 1.0;
    float cr = cos(aRot), sr = sin(aRot);
    corner = vec2(corner.x * cr - corner.y * sr, corner.x * sr + corner.y * cr);
    mv.xy += corner * aSize * 0.5;
    vec4 clip = projectionMatrix * mv;
    vUvP = aRect.xy + (aRect.zw - aRect.xy) * uv;
    vUvA = vUvP * clip.w;
    vec4 col = aCol;
  #else
    mat4 mm = modelMatrix;
    #ifdef USE_INSTANCING
      mm = modelMatrix * instanceMatrix;
    #endif
    vec4 wp = mm * vec4(position, 1.0);
    #ifdef SWAY
      // foliage sway: PS1 games did this by nudging vertex positions in the model, so it stays chunky
      float sw = sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.27) * uWind * max(position.y, 0.0) * 0.03;
      wp.x += sw; wp.z += sw * 0.6;
    #endif
    vec4 mv = viewMatrix * wp;
    vec4 clip = projectionMatrix * mv;
    vUvP = uv;
    vUvA = uv * clip.w;
    #ifdef DAY
      vec4 col = mix(aCol, aColB, uBlend);
    #else
      vec4 col = aCol;
    #endif
    #ifdef LIT
      // inverse-transpose of the model matrix (the rigs squash and stretch, i.e. scale non-uniformly)
      mat3 m3 = mat3(mm);
      vec3 s2 = max(vec3(dot(m3[0], m3[0]), dot(m3[1], m3[1]), dot(m3[2], m3[2])), vec3(1e-6));
      vec3 n = normalize(m3 * (normal / s2));
      float ndl = max(dot(n, uSunDir), 0.0);
      col.rgb *= (uAmb + uSunCol * ndl) * 0.5;
    #endif
    #ifdef USE_INSTANCING_COLOR
      col.rgb *= instanceColor;
    #endif
  #endif
  vCol = col;
  vFog = clamp((-mv.z - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
  gl_Position = ps1Snap(clip);
}
`;

export const PS1_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 uFogColor;
uniform float uAffine;
uniform vec2 uScroll;
uniform float uTime;
uniform float uAlpha;
uniform vec3 uColorMul;
uniform float uFlash;
uniform float uFogAmt;

varying vec2 vUvP;
varying vec2 vUvA;
varying vec4 vCol;
varying float vFog;

void main() {
  // affine mapping: vUvA holds uv*w; the rasteriser divides by interpolated 1/w, we multiply it back
  vec2 uv = mix(vUvP, vUvA * gl_FragCoord.w, uAffine);
  uv += uScroll * uTime;
  vec4 t = texture2D(map, uv);
  #ifdef CUTOUT
    if (t.a < 0.5) discard;
  #endif
  vec3 c = t.rgb * vCol.rgb * 2.0 * uColorMul + uFlash;
  c = min(c, vec3(1.0));
  float f = vFog * uFogAmt;
  #ifdef FOG_ADD
    c *= (1.0 - f);
  #else
    #ifdef FOG
      c = mix(c, uFogColor, f);
    #endif
  #endif
  #ifdef HALF
    gl_FragColor = vec4(c, 0.5 * t.a * vCol.a * uAlpha);
  #elif defined(ADD)
    gl_FragColor = vec4(c * vCol.a * uAlpha, 1.0);
  #else
    gl_FragColor = vec4(c, 1.0);
  #endif
}
`;

/** Pass 2 (internal resolution): 15-bit colour + PS1 4x4 ordered dither, then composite the HUD sprites. */
export const QUANT_FRAG = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uHud;
uniform float uDither;
uniform float uVivid;   // 0..1 colour grade: brighter mid-tones and richer colours (the "enhanced" look of emulator footage)
uniform vec4 uFade;     // rgb = colour, a = amount
varying vec2 vUv;

// Lift the mid-tones without clipping the highlights, add saturation (dull colours gain more than already-vivid ones, so skies
// and foliage bloom but skin-like and neutral tones do not go neon), then a light S-curve so the result is not washed out.
vec3 vividGrade(vec3 c, float k) {
  c = pow(c, vec3(1.0 / (1.0 + 0.62 * k)));
  c *= vec3(1.0 + 0.14 * k, 1.0 + 0.10 * k, 1.0 + 0.02 * k);          // a touch warmer: the violet ambient turns grass minty
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float sat = (mx - mn) / max(mx, 0.001);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.0 + k * (0.55 + 0.85 * (1.0 - sat)));
  c = clamp(c, 0.0, 1.0);
  return mix(c, c * c * (3.0 - 2.0 * c), 0.25 * k);
}

const float M[16] = float[16](-4.,0.,-3.,1.,  2.,-2.,3.,-1.,  -3.,1.,-4.,0.,  3.,-1.,2.,-2.);

void main() {
  vec3 c = texture2D(uScene, vUv).rgb;
  if (uVivid > 0.0) c = vividGrade(c, uVivid);
  c = mix(c, uFade.rgb, uFade.a);
  if (uDither > 0.5) {
    ivec2 p = ivec2(gl_FragCoord.xy);
    // the PS1 matrix is indexed from the top-left of the screen; gl_FragCoord counts from the bottom (H is a multiple of 4)
    float d = M[(3 - (p.y & 3)) * 4 + (p.x & 3)];
    vec3 c8 = clamp(floor(c * 255.0 + 0.5) + d, 0.0, 255.0);
    vec3 c5 = floor(c8 / 8.0);
    c = (c5 * 8.0 + floor(c5 / 4.0)) / 255.0;
  }
  vec4 h = texture2D(uHud, vUv);
  c = mix(c, h.rgb, h.a);
  gl_FragColor = vec4(c, 1.0);
}
`;

/** Pass 3 (device resolution): crisp upscale (integer or "sharp bilinear") with an optional light CRT treatment. */
export const OUT_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uInRes;
uniform vec4 uRect;     // x, y, w, h of the picture inside the canvas (device px, origin bottom-left)
uniform float uCRT;
uniform float uSmooth;   // 1 = plain bilinear upscale, 0 = crisp "sharp bilinear" (pixels stay square)
varying vec2 vUv;

void main() {
  vec2 fc = gl_FragCoord.xy - uRect.xy;
  vec2 uv = fc / uRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec2 px = uv * uInRes;
  vec2 seam = floor(px + 0.5);
  vec2 dudv = uInRes / uRect.zw;      // internal pixels per device pixel (constant: no derivatives needed)
  vec2 spx = uSmooth > 0.5 ? px : seam + clamp((px - seam) / dudv, -0.5, 0.5);
  vec3 c = texture2D(uTex, spx / uInRes).rgb;
  if (uCRT > 0.0) {
    float scan = 0.5 + 0.5 * cos(6.2831853 * (px.y - 0.5));
    c *= mix(1.0, 0.72 + 0.28 * scan, uCRT);
    vec2 q = uv * 2.0 - 1.0;
    c *= 1.0 - uCRT * 0.35 * dot(q, q) * 0.5;
    // faint phosphor triads
    float tri = mod(gl_FragCoord.x, 3.0);
    vec3 mask = vec3(tri < 1.0 ? 1.0 : 0.86, (tri >= 1.0 && tri < 2.0) ? 1.0 : 0.86, tri >= 2.0 ? 1.0 : 0.86);
    c *= mix(vec3(1.0), mask, uCRT * 0.6);
    c = min(c * (1.0 + 0.10 * uCRT), vec3(1.0));
  }
  gl_FragColor = vec4(c, 1.0);
}
`;

export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
