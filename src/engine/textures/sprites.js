// Particle / billboard sprites for Gloaming Vale. All procedural pixel art, 1-bit alpha, DOM-free.
//
// Additive sprites (glow, spark, lens_star, gem_glint, flame*, ring, firefly) encode intensity in RGB brightness
// (level 0 = transparent) so they look right with additive blending AND can be tinted by vertex colours
// (glows/sparks are white / warm-white; flames use the amber ramp). Everything else is ordinary alpha-tested art.
import { Pix, rgb, bayer, TRANSPARENT, RNG } from './pix.js';
import { RAMPS } from './palette.js';
import { fromMap } from './ui/pixmap.js';

export { packAtlas } from './ui/atlas.js';   // pack the sprites (or icons) into one power-of-two atlas

/** Usage hint for every sprite (blend mode, tinting, animation). */
export const SPRITE_NOTES = {
  glow: 'ADDITIVE 32x32 soft round glow, white-warm. Tint with vertex colour; lantern / gem / pickup halos.',
  glow_small: 'ADDITIVE 16x16 small glow, white-warm. Tinted particle dots, ember halos, distant lights.',
  spark: 'ADDITIVE 16x16 four-point twinkle star (white, pale-yellow core). Random-rotate/scale-pulse for pickups.',
  spark_small: 'ADDITIVE 8x8 tiny twinkle. Particle confetti, trails.',
  lens_star: 'ADDITIVE 32x32 eight-ray star flare. One-shot pop when a lantern ignites; scale 0.5 -> 1.5 while fading.',
  gem_glint: 'ADDITIVE 16x16 cross flash. Randomly flash over gems / treasure.',
  flame_0: 'ADDITIVE (or alpha-test) 16x16 fire loop frame 0 of 4 (flame_0..flame_3), ~9 fps. Amber ramp. Anchor: bottom-centre.',
  flame_1: 'Fire loop frame 1 of 4.',
  flame_2: 'Fire loop frame 2 of 4.',
  flame_3: 'Fire loop frame 3 of 4.',
  flame_big_0: 'ADDITIVE 32x32 brazier fire loop frame 0 of 4 (flame_big_0..3), ~9 fps. Anchor: bottom-centre (sits in the bowl).',
  flame_big_1: 'Brazier fire frame 1 of 4.',
  flame_big_2: 'Brazier fire frame 2 of 4.',
  flame_big_3: 'Brazier fire frame 3 of 4.',
  smoke_0: 'ALPHA 16x16 grey-lilac puff; draw at 50% opacity, rise + grow + fade. Alternate with smoke_1.',
  smoke_1: 'ALPHA 16x16 second puff variant (thinner, more dissolved) for older smoke.',
  puff_0: 'ALPHA 16x16 enemy-death poof frame 0/4 (tight cloud). Play puff_0..puff_3 once, ~10 fps.',
  puff_1: 'Poof frame 1/4 (expanding).',
  puff_2: 'Poof frame 2/4 (hollow ring).',
  puff_3: 'Poof frame 3/4 (dissolving crumbs).',
  dust: 'ALPHA 8x8 pale dust puff (neutral, tint warm). Footsteps, landings.',
  ring: 'ADDITIVE 32x32 thin shockwave ring, white. Scale up while fading (charge impacts, pickups).',
  leaf: 'ALPHA 8x8 drifting leaf; spin/sway. Vertex-tint for autumn colours.',
  firefly: 'ADDITIVE 8x8 glow dot with cross. Ambient dusk particle; tint yellow-green, pulse alpha.',
  butterfly_0: 'ALPHA 16x16 pale-blue butterfly, wings open. Flap 0 -> 1 -> 2 -> 1 -> 0.',
  butterfly_1: 'Butterfly, wings mid.',
  butterfly_2: 'Butterfly, wings closed.',
  sparx_0: 'ALPHA 16x16 Sparx (white/pale body, dithered wings UP). Vertex-tint yellow / green / blue by health.',
  sparx_1: 'Sparx wings DOWN. Alternate sparx_0 / sparx_1 ~10 fps.',
  shadow_blob: 'ALPHA 32x32 round dithered blob shadow (opaque dark). Lay flat under characters at ~50% blend; scale with height.',
  ripple_0: 'ALPHA/ADD 16x16 water ring frame 0/3 (small). Lay flat on water; ripple_0..2 then fade.',
  ripple_1: 'Ring frame 1/3.',
  ripple_2: 'Ring frame 2/3 (large, broken).',
  splash_0: 'ALPHA 16x16 water splash frame 0/3 (rising jet). Billboard at the splash point, bottom row = waterline.',
  splash_1: 'Splash frame 1/3 (full crown).',
  splash_2: 'Splash frame 2/3 (drops flung wide, falling).',
  arrow_down: 'ALPHA 16x16 golden objective arrow (tip at bottom-centre). Bob up/down 2-3px, always faces camera.',
  exclaim: 'ALPHA 8x16 red "!" alert icon above an enemy that has spotted Spyro.',
  snuffer_wisp: 'ALPHA 16x16 dark-violet wisp with two glowing eyes: hovering shadow spirit / dusk ambience.',
};

/** Blend mode per sprite: 'add' = additive (intensity in RGB, black/transparent = nothing), 'alpha' = alpha-tested art. */
export const SPRITE_BLEND = {
  glow: 'add', glow_small: 'add', spark: 'add', spark_small: 'add', lens_star: 'add', gem_glint: 'add',
  flame_0: 'add', flame_1: 'add', flame_2: 'add', flame_3: 'add',
  flame_big_0: 'add', flame_big_1: 'add', flame_big_2: 'add', flame_big_3: 'add',
  ring: 'add', firefly: 'add',
  smoke_0: 'alpha', smoke_1: 'alpha', puff_0: 'alpha', puff_1: 'alpha', puff_2: 'alpha', puff_3: 'alpha',
  dust: 'alpha', leaf: 'alpha', butterfly_0: 'alpha', butterfly_1: 'alpha', butterfly_2: 'alpha',
  sparx_0: 'alpha', sparx_1: 'alpha', shadow_blob: 'alpha', ripple_0: 'alpha', ripple_1: 'alpha', ripple_2: 'alpha',
  splash_0: 'alpha', splash_1: 'alpha', splash_2: 'alpha', arrow_down: 'alpha', exclaim: 'alpha', snuffer_wisp: 'alpha',
};

/** Animation groups: frame names in play order, suggested fps and whether they loop. */
export const SPRITE_ANIMS = {
  flame: { frames: ['flame_0', 'flame_1', 'flame_2', 'flame_3'], fps: 9, loop: true },
  flame_big: { frames: ['flame_big_0', 'flame_big_1', 'flame_big_2', 'flame_big_3'], fps: 9, loop: true },
  puff: { frames: ['puff_0', 'puff_1', 'puff_2', 'puff_3'], fps: 10, loop: false },
  smoke: { frames: ['smoke_0', 'smoke_1'], fps: 3, loop: false },
  butterfly: { frames: ['butterfly_0', 'butterfly_1', 'butterfly_2', 'butterfly_1'], fps: 9, loop: true },
  sparx: { frames: ['sparx_0', 'sparx_1'], fps: 10, loop: true },
  ripple: { frames: ['ripple_0', 'ripple_1', 'ripple_2'], fps: 6, loop: false },
  splash: { frames: ['splash_0', 'splash_1', 'splash_2'], fps: 9, loop: false },
};

/* ------------------------------------------------------------------------------------------------ */
/* helpers                                                                                             */
/* ------------------------------------------------------------------------------------------------ */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const bayerT = (x, y) => (bayer(x, y) + 0.5) / 16;
const WARM = [1, 0.965, 0.9];
const NEUTRAL = [1, 1, 1];

function hash2(x, y, s = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ordered-dither quantise intensity 0..1 to an integer level 0..levels. */
function dq(i, levels, x, y) {
  const v = clamp01(i) * levels;
  const lo = Math.floor(v);
  return lo + ((v - lo) > bayerT(x, y) ? 1 : 0);
}

function lum(v, tint = WARM) {
  return [Math.round(v * tint[0]), Math.round(v * tint[1]), Math.round(v * tint[2]), 255];
}

/** Pick from an ordered colour list by t (0..1) in equal bands, dithering only in a narrow zone at each band edge. */
function bandPick(cols, t, x, y, soft = 0.1) {
  const n = cols.length;
  if (n === 1) return cols[0];
  const p = clamp01(t) * n * 0.9999;
  const i = Math.floor(p);
  const f = p - i;
  if (i > 0 && f < soft) return bayerT(x, y) < 0.5 + f / (2 * soft) ? cols[i] : cols[i - 1];
  if (i < n - 1 && f > 1 - soft) return bayerT(x, y) < 0.5 - (1 - f) / (2 * soft) ? cols[i + 1] : cols[i];
  return cols[i];
}

/**
 * Build an additive light sprite: fn(x, y) -> intensity 0..1 at pixel centres. Level 0 stays transparent.
 * `dither` = ordered-dither between levels (soft, chunky falloff); otherwise plain rounding (crisp bands).
 */
function light(w, h, fn, { levels = 8, dither = true, tint = WARM, gamma = 1 } = {}) {
  const p = new Pix(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = fn(x + 0.5, y + 0.5);
      const l = dither ? dq(i, levels, x, y) : Math.round(clamp01(i) * levels);
      if (l <= 0) continue;
      p.set(x, y, lum(Math.pow(l / levels, gamma) * 255, tint));
    }
  }
  return p;
}

const A = RAMPS.amber;            // dark red-brown .. near-white yellow
const WATER = RAMPS.water;
const SNUF = RAMPS.snuffer;
const INK = '#120c1c';

/* ------------------------------------------------------------------------------------------------ */
/* glows, sparks, flares                                                                               */
/* ------------------------------------------------------------------------------------------------ */
function makeGlow(size, levels, power, core) {
  const c = size / 2, R = size / 2;
  return light(size, size, (x, y) => {
    const d = Math.hypot(x - c, y - c) / R;
    if (d >= 1) return 0;
    return Math.pow(1 - smoothstep(core, 1, d), power);
  }, { levels });
}

/** Mirror a top-left quadrant of digit rows into a full symmetric grid of rows (even sizes only). */
function quad4(q) {
  const top = q.map((r) => r + r.split('').reverse().join(''));
  return top.concat(top.slice().reverse());
}

/**
 * Twinkle star from a hand-tuned quadrant of brightness digits (0-9). 2x2 core = 9 (pale yellow),
 * 8 = near white, everything else white scaled by brightness. Additive.
 */
function makeStarFromQuad(q) {
  const rows = quad4(q);
  const size = rows.length;
  const p = new Pix(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = rows[y].charCodeAt(x) - 48;
      if (d <= 0) continue;
      if (d >= 9) p.set(x, y, [255, 243, 168, 255]);
      else if (d === 8) p.set(x, y, [255, 250, 222, 255]);
      else p.set(x, y, lum(Math.pow(d / 9, 0.85) * 255, NEUTRAL));
    }
  }
  return p;
}

const SPARK_Q = ['00000001', '00000002', '00000003', '00000004', '00000015', '00000136', '00001368', '12345689'];
const SPARK_SMALL_Q = ['0002', '0004', '0037', '2479'];
const FIREFLY_Q = ['0002', '0025', '0268', '2589'];

function makeLensStar() {
  const S = 32, c = 16;
  const rays = [
    { a: 0, len: 15.6, w: 1.6, i: 1.0 },
    { a: 90, len: 15.6, w: 1.6, i: 1.0 },
    { a: 45, len: 10.8, w: 1.25, i: 0.9 },
    { a: 135, len: 10.8, w: 1.25, i: 0.9 },
  ].map((r) => ({ ...r, ux: Math.cos((r.a * Math.PI) / 180), uy: Math.sin((r.a * Math.PI) / 180) }));
  const p = new Pix(S, S);
  const levels = 6;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      let best = 0;
      for (const r of rays) {
        const along = Math.abs(dx * r.ux + dy * r.uy);
        const perp = Math.abs(-dx * r.uy + dy * r.ux);
        if (along > r.len) continue;
        const t = along / r.len;
        const hw = Math.max(0.42, r.w * (1 - t));
        if (perp > hw) continue;
        best = Math.max(best, Math.pow(1 - t, 0.62) * r.i * (1 - 0.3 * (perp / hw)));
      }
      const d = Math.hypot(dx, dy);
      const halo = Math.pow(clamp01(1 - d / 8.5), 1.7) * 0.75;
      const armL = best > 0 ? Math.max(1, Math.ceil(best * levels)) / levels : 0;
      const haloL = dq(halo, levels, x, y) / levels;
      const l = Math.max(armL, haloL, d < 2.2 ? 1 : 0);
      if (l <= 0) continue;
      if (d < 2.4) p.set(x, y, [255, 246, 190, 255]);
      else p.set(x, y, lum(l * 255, NEUTRAL));
    }
  }
  return p;
}

function makeGemGlint() {
  const S = 16, c = 8;
  const levels = 5;
  const p = new Pix(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      let v = 0;
      // straight cross, 2px thick in the middle, fading out along the arms
      if (ay < 0.9 && ax < 7.6) v = Math.max(v, 1 - ax / 8);
      if (ax < 0.9 && ay < 7.6) v = Math.max(v, 1 - ay / 8);
      // small diamond in the centre
      if (ax + ay < 2.6) v = Math.max(v, 1);
      else if (ax + ay < 3.6) v = Math.max(v, 0.55);
      // tiny diagonal ticks
      if (ax === ay && ax > 1.4 && ax < 3.6) v = Math.max(v, 0.5);
      const l = v > 0 ? Math.max(1, Math.ceil(v * levels)) / levels : 0;
      if (l <= 0) continue;
      if (ax + ay < 2.0) p.set(x, y, [255, 250, 220, 255]);
      else p.set(x, y, lum(l * 255, NEUTRAL));
    }
  }
  return p;
}

function makeRing() {
  const S = 32, c = 16, R0 = 14, wid = 1.7;
  return light(S, S, (x, y) => {
    const d = Math.hypot(x - c, y - c);
    const e = Math.abs(d - R0);
    let v = e < wid ? 1 - smoothstep(0.35, wid, e) * 0.85 : 0;
    // faint fringes either side of the ring give the shockwave a soft, dithered skirt
    if (d < R0) v = Math.max(v, Math.pow(clamp01(1 - (R0 - d) / 3.4), 2) * 0.3);
    else if (d > R0 + wid) v = Math.max(v, (1 - (d - R0 - wid) / 2.2) * 0.22);
    return v;
  }, { levels: 6, tint: [1, 1, 1] });
}

/* ------------------------------------------------------------------------------------------------ */
/* flames                                                                                              */
/* ------------------------------------------------------------------------------------------------ */
const FLAME_STEPS = [[0.05, A[0]], [0.16, A[1]], [0.3, A[2]], [0.47, A[3]], [0.64, A[4]], [0.8, A[5]]]
  .map(([t, c]) => [t, rgb(c)]);

/** Heat 0..1 -> amber ramp colour (or null = transparent), with a narrow ordered-dither zone at each step. */
function flameColor(h, x, y) {
  const soft = 0.035;
  let idx = -1;
  for (let k = 0; k < FLAME_STEPS.length; k++) {
    const th = FLAME_STEPS[k][0];
    if (h >= th + soft) { idx = k; continue; }
    if (h > th - soft && (h - (th - soft)) / (2 * soft) > bayerT(x, y)) idx = k;
    break;
  }
  return idx < 0 ? null : FLAME_STEPS[idx][1];
}

/**
 * Flame frame: a bundle of teardrop tongues whose height / lean oscillate with phase, so 4 frames loop cleanly.
 * Heat is 1 on a tongue's spine near the base and falls to the rim, then mapped onto the amber ramp.
 */
function makeFlame(size, frame, tongues, { seed = 1, ember = null } = {}) {
  const p = new Pix(size, size);
  const baseY = size - 0.4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let heat = 0;
      for (const tg of tongues) {
        const ph = Math.PI * 2 * (frame / 4 + tg.phase);
        const H = tg.h * (1 + tg.amp * Math.sin(ph));
        const lean = tg.lean + tg.sway * Math.cos(ph);
        const ty = (baseY - (y + 0.5)) / H;
        if (ty < 0 || ty > 1) continue;
        const cx = tg.x + lean * ty * ty + (tg.wig || 0) * Math.sin(ty * 3.4 + ph);
        let hw = tg.w * Math.pow(1 - ty, tg.taper);
        if (ty < 0.12) hw *= 0.7 + 2.5 * ty;
        if (hw < 0.25) continue;
        const dxn = Math.abs(x + 0.5 - cx) / hw;
        if (dxn >= 1) continue;
        const h = (1 - Math.pow(dxn, 1.25)) * (1 - 0.6 * ty) * tg.heat;
        if (h > heat) heat = h;
      }
      if (heat <= 0) continue;
      heat += (hash2(x, y, seed + frame * 7) - 0.5) * 0.08;
      const c = flameColor(heat, x, y);
      if (c) p.set(x, y, c);
    }
  }
  if (ember) {
    for (const e of ember) {
      const k = (frame + e.off) % 4;
      const y = Math.round(e.y0 - k * e.dy);
      const x = Math.round(e.x + Math.sin((frame + e.off) * 1.7) * e.sw);
      p.set(x, y, k < 2 ? rgb(A[5]) : rgb(A[4]));
    }
  }
  return p;
}

const FLAME_SMALL = [
  { x: 7.9, w: 4.9, h: 14.6, lean: 1.3, sway: 1.3, wig: 0.5, taper: 0.85, heat: 1.06, amp: 0.11, phase: 0.0 },
  { x: 4.3, w: 2.9, h: 9.2, lean: -2.6, sway: 1.5, wig: 0.3, taper: 0.9, heat: 0.82, amp: 0.3, phase: 0.3 },
  { x: 11.5, w: 3.0, h: 10.8, lean: 2.5, sway: 1.5, wig: 0.3, taper: 0.9, heat: 0.86, amp: 0.3, phase: 0.62 },
];
const FLAME_BIG = [
  { x: 15.8, w: 9.6, h: 29.5, lean: 2.4, sway: 2.4, wig: 1.0, taper: 0.85, heat: 1.08, amp: 0.09, phase: 0.0 },
  { x: 8.3, w: 5.6, h: 19, lean: -5.2, sway: 2.4, wig: 0.6, taper: 0.9, heat: 0.84, amp: 0.26, phase: 0.28 },
  { x: 23.4, w: 5.8, h: 21.5, lean: 5.2, sway: 2.6, wig: 0.6, taper: 0.9, heat: 0.86, amp: 0.26, phase: 0.6 },
  { x: 3.6, w: 3.0, h: 9.5, lean: -2.4, sway: 1.6, wig: 0.3, taper: 0.9, heat: 0.7, amp: 0.34, phase: 0.75 },
  { x: 28.2, w: 3.0, h: 10.5, lean: 2.6, sway: 1.6, wig: 0.3, taper: 0.9, heat: 0.7, amp: 0.34, phase: 0.1 },
];
const BIG_EMBERS = [
  { x: 11, y0: 12, dy: 2.4, sw: 1.4, off: 0 },
  { x: 21, y0: 8, dy: 2.4, sw: 1.4, off: 2 },
];

/* ------------------------------------------------------------------------------------------------ */
/* smoke / poof / dust / wisp : stacked round lobes, each shaded from the top-left                     */
/* ------------------------------------------------------------------------------------------------ */
/**
 * Cartoon puff: lobes = [{x,y,r}] drawn back-to-front; every lobe gets a light top-left face, a mid band and a
 * dark lower-right crescent (ramp dark -> light) with dithered band edges. `dissolve` punches ordered holes
 * (denser towards each lobe's rim) so a cloud can fall apart over several frames.
 */
function makeBubbles(size, lobes, ramp, { soft = 0.2, dissolve = 0, seed = 1, shift = [-0.22, -0.3], k = 0.62, base = 1.1 } = {}) {
  const cols = ramp.map(rgb);
  const p = new Pix(size, size);
  for (const l of lobes) {
    const x0 = Math.max(0, Math.floor(l.x - l.r - 1)), x1 = Math.min(size - 1, Math.ceil(l.x + l.r + 1));
    const y0 = Math.max(0, Math.floor(l.y - l.r - 1)), y1 = Math.min(size - 1, Math.ceil(l.y + l.r + 1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const d = Math.hypot(px - l.x, py - l.y) / l.r;
        if (d > 1) continue;
        if (dissolve > 0 && hash2(x, y, seed) < dissolve * (0.3 + 0.9 * d * d)) continue;
        const ds = Math.hypot(px - (l.x + shift[0] * l.r), py - (l.y + shift[1] * l.r)) / l.r;
        p.set(x, y, bandPick(cols, base - ds * k, x, y, soft));
      }
    }
  }
  return p;
}

const SMOKE_RAMP = ['#5a5470', '#8a7cb0', '#b4a8d4', '#dcd4f0'];
const POOF_RAMP = ['#8a7cb0', '#b4a8d4', '#dcd4f0', '#fff4ff'];
const DUST_RAMP = ['#8a7a6a', '#b8a890', '#dccfb2', '#f0e6cc'];

function makeSmoke(variant) {
  if (variant === 0) {
    return makeBubbles(16, [
      { x: 8, y: 6.4, r: 4.7 }, { x: 4.5, y: 9.9, r: 3.7 }, { x: 11.5, y: 9.7, r: 3.9 }, { x: 8, y: 10.6, r: 4.3 },
    ], SMOKE_RAMP, { soft: 0.22 });
  }
  return makeBubbles(16, [
    { x: 8.2, y: 7.2, r: 3.6 }, { x: 4.6, y: 9.7, r: 2.8 }, { x: 11.7, y: 9.3, r: 3.0 }, { x: 7.8, y: 11.2, r: 3.0 },
    { x: 11.4, y: 4.6, r: 1.9 },
  ], SMOKE_RAMP, { soft: 0.25, dissolve: 0.34, seed: 6 });
}

function makePoof(frame) {
  const c = 8;
  const cfg = [
    { n: 5, ring: 2.4, r: 2.6, center: 3.2, dissolve: 0 },
    { n: 6, ring: 4.1, r: 3.0, center: 3.4, dissolve: 0 },
    { n: 7, ring: 5.2, r: 2.6, center: 1.8, dissolve: 0.16 },
    { n: 8, ring: 6.2, r: 1.8, center: 0, dissolve: 0.32 },
  ][frame];
  const rng = new RNG(40 + frame);
  const lobes = [];
  const a0 = rng.float(0, 6.28);
  for (let i = 0; i < cfg.n; i++) {
    const a = a0 + (i / cfg.n) * Math.PI * 2;
    lobes.push({ x: c + Math.cos(a) * cfg.ring, y: c + Math.sin(a) * cfg.ring, r: cfg.r * rng.float(0.88, 1.12) });
  }
  if (cfg.center > 0) lobes.push({ x: c, y: c, r: cfg.center });
  const p = makeBubbles(16, lobes, POOF_RAMP, { soft: 0.2, dissolve: cfg.dissolve, seed: 60 + frame });
  // pale-yellow sparkle pixels flung outwards (cartoon "poof" stars)
  const sp = [
    [{ x: 8, y: 1 }],
    [{ x: 2, y: 4 }, { x: 13, y: 3 }, { x: 8, y: 0 }],
    [{ x: 1, y: 2 }, { x: 14, y: 1 }, { x: 14, y: 13 }, { x: 1, y: 14 }],
    [{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 15 }, { x: 0, y: 15 }, { x: 8, y: 0 }],
  ][frame];
  for (const s of sp) p.set(s.x, s.y, rgb('#fff6c0'));
  return p;
}

const DUST = fromMap([
  '........',
  '........',
  '..BBB...',
  '.BAAAB..',
  'BAAAABBC',
  'BAAABBCC',
  '.CBBBCC.',
  '..C.C.C.',
], { A: DUST_RAMP[3], B: DUST_RAMP[2], C: DUST_RAMP[1], D: DUST_RAMP[0] }, 'dust');

function makeWisp() {
  const p = makeBubbles(16, [
    { x: 3.9, y: 14.8, r: 1.4 }, { x: 5.4, y: 13.9, r: 2.0 }, { x: 7.2, y: 12.3, r: 2.8 },
    { x: 12.9, y: 12.6, r: 1.5 }, { x: 13.6, y: 9.6, r: 1.1 },
    { x: 8.3, y: 9.5, r: 4.1 }, { x: 8, y: 6.2, r: 4.9 },
  ], SNUF, { soft: 0.2, k: 0.7, base: 1.05, shift: [-0.3, -0.35], seed: 12 });
  // two tiny glowing eyes
  const e1 = rgb('#fff6c0'), e2 = rgb('#ffc03c');
  for (const ex of [5.5, 9.5]) {
    const x = Math.round(ex);
    p.set(x, 6, e1); p.set(x + 1, 6, e1); p.set(x, 7, e2); p.set(x + 1, 7, e2);
  }
  return p;
}

/* ------------------------------------------------------------------------------------------------ */
/* shadow blob, leaf, water                                                                            */
/* ------------------------------------------------------------------------------------------------ */
function makeShadowBlob() {
  const S = 32, c = 16;
  const p = new Pix(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (d >= 15.6) continue;
      const keep = 1 - smoothstep(9.5, 15.6, d);
      if (keep < bayerT(x, y) && d > 9.5) continue;
      p.set(x, y, d < 12 ? rgb('#0c0818') : rgb('#1a1030'));
    }
  }
  return p;
}

const LEAF = fromMap([
  '.....dd.',
  '...ddggd',
  '..dgglgd',
  '.dgglggd',
  'dgglggd.',
  'dglggd..',
  'sdggd...',
  's.dd....',
], { d: RAMPS.leaf[0], g: RAMPS.leaf[2], l: RAMPS.leaf[4], s: RAMPS.bark[2] }, 'leaf');

function makeRipple(frame) {
  const R = [3.0, 5.3, 7.2][frame];
  const wid = [1.5, 1.3, 1.1][frame];
  const cols = [TRANSPARENT, rgb(WATER[2]), rgb(WATER[3]), rgb(WATER[4]), rgb(WATER[5])];
  const p = new Pix(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
      const e = Math.abs(d - R);
      let v = e < wid ? 1 - e / wid : 0;
      if (frame === 2 && hash2(x, y, 77) < 0.28 + 0.2 * bayerT(x, y)) v *= 0.15;   // broken up
      if (frame >= 1 && d < R - wid) v = Math.max(v, Math.pow(clamp01(1 - (R - wid - d) / 3), 3) * 0.25);
      const f = clamp01(v) * (cols.length - 1);
      const i = Math.min(Math.floor(f), cols.length - 2);
      const c = (f - i) > bayerT(x, y) ? cols[i + 1] : cols[i];
      if (c[3]) p.set(x, y, c);
    }
  }
  return p;
}

/**
 * Water splash: a fan of dotted spokes ending in chunky droplets over a low mound / ring at the waterline
 * (bottom rows). Frame 0 = short jet, 1 = full crown, 2 = drops flung wide and falling.
 */
function makeSplash(frame) {
  const p = new Pix(16, 16);
  const hi = rgb(WATER[5]), md = rgb(WATER[4]), lo = rgb(WATER[3]), dk = rgb(WATER[2]), nv = rgb(WATER[1]);
  const ox = 7.5, oy = 13.2;
  const cfg = [
    { spokes: [[-11, 8], [11, 8], [-30, 5], [30, 5]], gap: 3, big: 2 },
    { spokes: [[0, 9.5], [-22, 8.5], [22, 8.5], [-44, 7], [44, 7], [-66, 5], [66, 5]], gap: 3, big: 2 },
    { spokes: [[-6, 11], [8, 9.5], [-28, 10], [30, 9], [-50, 8.5], [52, 8], [-72, 7], [72, 6.5]], gap: 100, big: 1 },
  ][frame];
  // waterline: crown mound / spreading ring
  if (frame === 0) {
    p.ellipse(7.5, 14.6, 4.8, 1.9, lo);
    p.ellipse(7.5, 14.3, 3.4, 1.2, md);
    p.hline(6, 13, 4, hi);
    p.hline(2, 15, 12, dk);
  } else if (frame === 1) {
    p.ellipse(7.5, 14.7, 6.8, 1.6, lo);
    p.hline(3, 14, 3, md); p.hline(10, 14, 3, md);
    p.hline(1, 15, 14, dk);
  } else {
    p.hline(2, 14, 5, lo); p.hline(9, 14, 5, lo);
    p.hline(0, 15, 16, dk);
    p.set(0, 15, nv); p.set(15, 15, nv);
  }
  for (const [ang, len] of cfg.spokes) {
    const a = (ang * Math.PI) / 180;
    const dx = Math.sin(a), dy = -Math.cos(a);
    // dotted trail (every other step) so the spokes read as spray rather than lines
    for (let r = cfg.gap; r < len - 1; r += 1.4) {
      p.set(Math.round(ox + dx * r - 0.5), Math.round(oy + dy * r - 0.5), r < len * 0.55 ? lo : md);
    }
    const tx = ox + dx * len, ty = oy + dy * len;
    if (cfg.big === 2) {
      const xi = Math.round(tx - 1), yi = Math.round(ty - 1);
      p.rect(xi, yi, 2, 2, md); p.set(xi, yi, hi); p.set(xi + 1, yi + 1, lo);
    } else {
      const xi = Math.round(tx - 0.5), yi = Math.round(ty - 0.5);
      p.set(xi, yi, hi); p.set(xi, yi + 1, md);
    }
  }
  // frame 0: thicker central jet
  if (frame === 0) { p.rect(7, 9, 2, 5, md); p.rect(7, 9, 1, 5, hi); }
  return p;
}

/* ------------------------------------------------------------------------------------------------ */
/* butterflies, Sparx, markers                                                                         */
/* ------------------------------------------------------------------------------------------------ */
/** Polygon approximating a rotated ellipse (rot in degrees, clockwise on screen). */
function ellipsePoly(cx, cy, rx, ry, rot = 0, n = 16) {
  const a = (rot * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const ex = Math.cos(t) * rx, ey = Math.sin(t) * ry;
    pts.push([cx + ex * ca - ey * sa, cy + ex * sa + ey * ca]);
  }
  return pts;
}

/**
 * Pale-blue butterfly with a dark-blue outline. Frame 0 wings open, 1 raised (narrower), 2 folded up (thin).
 * The right wing pair is authored once (upper + lower wing); other frames squeeze it towards the body and lift the tips.
 */
function makeButterfly(frame) {
  const OUT = rgb(RAMPS.gemBlue[0]);
  const cA = rgb(RAMPS.crystalCyan[4]);   // pale
  const cB = rgb(RAMPS.crystalCyan[3]);
  const cC = rgb(RAMPS.crystalCyan[2]);
  const cD = rgb(RAMPS.crystalCyan[1]);
  const white = rgb('#ffffff');
  const body = rgb(RAMPS.shadow[1]);
  const p = new Pix(16, 16);
  const k = [1.0, 0.62, 0.4][frame];
  const lift = [0, 1.8, 3.4][frame];
  const dy0 = [0, 0.6, 1.2][frame];
  const upper = [[0.7, 6.2], [1.8, 3.0], [4.3, 1.2], [7.0, 1.6], [7.6, 3.6], [6.6, 6.2], [3.6, 8.0]];
  const lower = [[0.7, 7.6], [3.6, 7.6], [5.9, 9.4], [5.6, 12.0], [3.4, 13.4], [1.6, 12.2], [0.7, 10.0]];
  const place = (pts, side) => pts.map(([dx, y]) => [8 + side * (0.6 + (dx - 0.6) * k), y + dy0 - lift * ((dx - 0.6) / 7)]);
  for (const side of [-1, 1]) {
    p.poly(place(lower, side), cB);
    p.poly(place(upper, side), cB);
  }
  // tone by distance from the body (lighter inside, deeper at the rim)
  const tmp = p.clone();
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (tmp.data[(y * 16 + x) * 4 + 3] < 128) continue;
      const dxs = Math.abs(x + 0.5 - 8) / Math.max(1, 7.4 * k);
      const t = clamp01(1.05 - dxs * 1.0 + (y < 7.5 ? 0.06 : -0.1));
      p.set(x, y, bandPick([cD, cC, cB, cA], t, x, y, 0.1));
    }
  }
  if (frame === 0) {
    // seam between the upper and lower wing + white wing spots
    for (const side of [-1, 1]) {
      const x0 = side > 0 ? 9 : 6;
      for (let i = 0; i < 4; i++) p.set(x0 + side * i, 8, cC);
    }
    for (const s of [-1, 1]) {
      p.set(8 + s * 4 - (s > 0 ? 0 : 1), 4, white); p.set(8 + s * 5 - (s > 0 ? 0 : 1), 3, white);
      p.set(8 + s * 3 - (s > 0 ? 0 : 1), 11, white);
    }
  } else {
    for (const s of [-1, 1]) p.set(8 + s * (frame === 1 ? 3 : 2) - (s > 0 ? 0 : 1), 4, white);
  }
  p.outline(OUT);
  p.rect(7, 4, 2, 9, body);
  p.rect(7, 3, 2, 2, body);
  p.set(7, 3, rgb(RAMPS.shadow[3]));
  p.set(6, 2, OUT); p.set(5, 1, OUT); p.set(9, 2, OUT); p.set(10, 1, OUT);
  return p;
}

/** A dithered, translucent-looking wing: bright 1px rim, checkerboard interior, one vein along the long axis. */
function ditherWing(p, pts, rim, fill, vein) {
  const tmp = new Pix(p.w, p.h);
  tmp.poly(pts, fill);
  const solid = (x, y) => x >= 0 && y >= 0 && x < p.w && y < p.h && tmp.data[(y * p.w + x) * 4 + 3] >= 128;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (!solid(x, y)) continue;
      const edge = !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
      if (edge) p.set(x, y, rim);
      else if (((x + y) & 1) === 0) p.set(x, y, fill);
    }
  }
  if (vein) p.line(vein[0], vein[1], vein[2], vein[3], rim);
}

/**
 * Sparx the dragonfly companion: a plump glowing pale orb body with two dark eyes and two big dithered
 * (translucent-looking) wings, seen head-on so it reads from any camera angle. Wings up / wings down.
 */
function makeSparx(frame) {
  const p = new Pix(16, 16);
  const W = rgb('#ffffff'), Wh = rgb('#f5f7ff'), P = rgb('#dcdcf0'), Q = rgb('#b4a8d4'), R = rgb('#8a7cb0'), K = rgb(INK);
  const by = frame === 0 ? 10.6 : 7.6;
  // wings: big ovals angled up-and-out (frame 0) or down-and-out (frame 1)
  const wy = frame === 0 ? 4.6 : by + 4.4;
  const rot = frame === 0 ? 38 : -38;
  const wingR = ellipsePoly(12.0, wy, 2.6, 4.4, rot);
  const wingL = wingR.map(([x, y]) => [16 - x, y]);
  ditherWing(p, wingL, Wh, P, null);
  ditherWing(p, wingR, Wh, P, null);
  // body orb: pale rim, white core, glossy highlight, shaded underside
  p.circle(8, by, 3.3, P);
  p.circle(7.8, by - 0.3, 2.6, Wh);
  p.circle(7.2, by - 0.9, 1.5, W);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const c = p.get(x, y);
      if (c[3] < 128) continue;
      const dx = x + 0.5 - 8, dy = y + 0.5 - by;
      if (Math.hypot(dx, dy) > 3.4) continue;
      if (c[0] === P[0] && c[1] === P[1] && c[2] === P[2]) {
        if (dx + dy > 3.2) p.set(x, y, R);
        else if (dx + dy > 1.9) p.set(x, y, Q);
      }
    }
  }
  // tiny tail
  p.rect(7, Math.round(by + 3), 2, 2, P);
  p.set(7, Math.round(by + 5), Q);
  // two dark eyes with a glint
  const ey = Math.round(by - 0.5);
  p.rect(5, ey, 2, 2, K); p.rect(9, ey, 2, 2, K);
  p.set(5, ey, W); p.set(9, ey, W);
  return p;
}

const ARROW_DOWN = fromMap([
  '....oooooooo....',
  '....oLyyyyGo....',
  '....oLyyyyGo....',
  '....oLyyyyGo....',
  '....oLyyyyGo....',
  '....oLyyyyGo....',
  'oooooLyyyyGooooo',
  'oLLyyyyyyyyyyGGo',
  '.oLyyyyyyyyyyGo.',
  '..oLyyyyyyyyGo..',
  '...oLyyyyyyGo...',
  '....oLyyyyGo....',
  '.....oLyyGo.....',
  '......oyGo......',
  '.......oo.......',
  '................',
], { o: INK, L: '#fff090', y: '#ffd050', G: '#d87a10' }, 'arrow_down');

const EXCLAIM = fromMap([
  '.oooooo.',
  'oRRRRRRo',
  'oRwRRRdo',
  'oRwRRRdo',
  'oRwRRRdo',
  'oRRRRRdo',
  '.oRRRdo.',
  '.oRRRdo.',
  '..oRdo..',
  '...oo...',
  '........',
  '..oooo..',
  '.oRRRdo.',
  '.oRRRdo.',
  '..oddo..',
  '...oo...',
], { o: INK, R: RAMPS.gemRed[2], w: RAMPS.gemRed[4], d: RAMPS.gemRed[1] }, 'exclaim');

/* ------------------------------------------------------------------------------------------------ */
/* public                                                                                              */
/* ------------------------------------------------------------------------------------------------ */
export function generateSprites() {
  const S = {};
  S.glow = makeGlow(32, 9, 2.0, 0.07);
  S.glow_small = makeGlow(16, 6, 2.0, 0.1);
  S.spark = makeStarFromQuad(SPARK_Q);
  S.spark_small = makeStarFromQuad(SPARK_SMALL_Q);
  S.lens_star = makeLensStar();
  S.gem_glint = makeGemGlint();
  for (let f = 0; f < 4; f++) S[`flame_${f}`] = makeFlame(16, f, FLAME_SMALL, { seed: 3 });
  for (let f = 0; f < 4; f++) S[`flame_big_${f}`] = makeFlame(32, f, FLAME_BIG, { seed: 8, ember: BIG_EMBERS });
  S.smoke_0 = makeSmoke(0);
  S.smoke_1 = makeSmoke(1);
  for (let f = 0; f < 4; f++) S[`puff_${f}`] = makePoof(f);
  S.dust = DUST.clone();
  S.ring = makeRing();
  S.leaf = LEAF.clone();
  S.firefly = makeStarFromQuad(FIREFLY_Q);
  for (let f = 0; f < 3; f++) S[`butterfly_${f}`] = makeButterfly(f);
  S.sparx_0 = makeSparx(0);
  S.sparx_1 = makeSparx(1);
  S.shadow_blob = makeShadowBlob();
  for (let f = 0; f < 3; f++) S[`ripple_${f}`] = makeRipple(f);
  for (let f = 0; f < 3; f++) S[`splash_${f}`] = makeSplash(f);
  S.arrow_down = ARROW_DOWN.clone();
  S.exclaim = EXCLAIM.clone();
  S.snuffer_wisp = makeWisp();
  return S;
}
