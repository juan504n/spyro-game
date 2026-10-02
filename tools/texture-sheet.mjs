#!/usr/bin/env node
// Contact sheets + QA report for the world textures (src/engine/textures/world.js).
//
//   node tools/texture-sheet.mjs [outDir] [--only=a,b,c] [--scale=4] [--tile-scale=3] [--no-png]
//                                [--dusk] [--zoom=name[,name]] [--quiet]
//
// Writes into outDir (default: <os tmpdir>/gloaming-world-textures):
//   sheet-<group>.png   every texture of a group at xSCALE, labelled (cutouts on a dark + a light backdrop)
//   tiles-<group>.png   tile textures repeated 3x3 (seam check)
//   family.png          the whole set at x2 on one page (style-consistency check)
//   zoom-<name>.png     with --zoom: one texture large (x10) + its 3x3 tiling (x4)
// and prints a numeric report. Exit code 1 if any HARD check fails (missing/extra texture, wrong size
// or flags, non-binary alpha, too many colours, generation too slow).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { writePNG } from './png.mjs';
import { generateWorldTextures, WORLD_TEXTURE_NOTES } from '../src/engine/textures/world.js';

// ---------------------------------------------------------------------------------------------
// The contract (names, sizes, tile / cutout flags) straight from the brief.
// [w, h, tile, cutout, group]
// ---------------------------------------------------------------------------------------------
const SPEC = {
  // terrain
  grass_a: [32, 32, 1, 0, 'terrain'], grass_b: [32, 32, 1, 0, 'terrain'], grass_flowers: [32, 32, 1, 0, 'terrain'],
  moss: [32, 32, 1, 0, 'terrain'], dirt: [32, 32, 1, 0, 'terrain'], sand: [32, 32, 1, 0, 'terrain'],
  shore_pebbles: [32, 32, 1, 0, 'terrain'], cobble: [32, 32, 1, 0, 'terrain'], flagstone: [32, 32, 1, 0, 'terrain'],
  cliff: [32, 32, 1, 0, 'terrain'], cliff_warm: [32, 32, 1, 0, 'terrain'], far_rock: [32, 32, 1, 0, 'terrain'],
  cliff_bare: [32, 32, 1, 0, 'terrain'], cliff_warm_bare: [32, 32, 1, 0, 'terrain'], ice: [32, 32, 1, 0, 'terrain'],
  rune_ring: [32, 32, 0, 0, 'terrain'],
  snow: [32, 32, 1, 0, 'terrain'], snow_petals: [32, 32, 1, 0, 'terrain'], cliff_frost: [32, 32, 1, 0, 'terrain'], far_frost: [32, 32, 1, 0, 'terrain'],     // (Frostbloom Hollow)
  cobble_frost: [32, 32, 1, 0, 'terrain'], path_snow: [32, 32, 1, 0, 'terrain'],
  ash: [32, 32, 1, 0, 'terrain'], cinder: [32, 32, 1, 0, 'terrain'], cliff_basalt: [32, 32, 1, 0, 'terrain'], cliff_basalt_bare: [32, 32, 1, 0, 'terrain'], far_ember: [32, 32, 1, 0, 'terrain'],     // (Emberfall Crags)
  cobble_ember: [32, 32, 1, 0, 'terrain'], path_ash: [32, 32, 1, 0, 'terrain'],
  // buildings
  brick: [32, 32, 1, 0, 'buildings'], brick_warm: [32, 32, 1, 0, 'buildings'], brick_mossy: [32, 32, 1, 0, 'buildings'],
  plaster: [32, 32, 1, 0, 'buildings'], timber: [32, 32, 1, 0, 'buildings'], wood_plank: [32, 32, 1, 0, 'buildings'],
  wood_beam: [16, 32, 1, 0, 'buildings'], roof_red: [32, 32, 1, 0, 'buildings'], roof_teal: [32, 32, 1, 0, 'buildings'],
  thatch: [32, 32, 1, 0, 'buildings'], tower_stone: [32, 32, 1, 0, 'buildings'],
  metal_brass: [16, 16, 1, 0, 'buildings'], metal_iron: [16, 16, 1, 0, 'buildings'],
  window: [16, 16, 0, 0, 'buildings'], door: [16, 32, 0, 0, 'buildings'], banner: [16, 32, 0, 0, 'buildings'],
  // plants
  bark: [16, 32, 1, 0, 'plants'], bark_pale: [16, 32, 1, 0, 'plants'],
  leaves_green: [32, 32, 1, 0, 'plants'], leaves_teal: [32, 32, 1, 0, 'plants'], leaves_autumn: [32, 32, 1, 0, 'plants'],
  leaves_blossom: [32, 32, 1, 0, 'plants'], leaves_frost: [32, 32, 1, 0, 'plants'], pine_snow: [32, 32, 1, 0, 'plants'],
  pine_char: [32, 32, 1, 0, 'plants'],
  pine: [32, 32, 1, 0, 'plants'], mushroom_cap: [32, 32, 0, 0, 'plants'], mushroom_stem: [16, 16, 0, 0, 'plants'],
  tuft: [16, 16, 0, 1, 'sprites'], flower_pink: [16, 16, 0, 1, 'sprites'], flower_yellow: [16, 16, 0, 1, 'sprites'],
  flower_ember: [16, 16, 0, 1, 'sprites'], flower_blue: [16, 16, 0, 1, 'sprites'], reeds: [16, 32, 0, 1, 'sprites'], fern: [16, 16, 0, 1, 'sprites'],
  lilypad: [16, 16, 0, 1, 'sprites'], vine: [8, 32, 0, 1, 'sprites'],
  // water
  water: [32, 32, 1, 0, 'water'], waterfall: [16, 32, 1, 0, 'water'], foam: [32, 32, 1, 1, 'water'],
  lava: [32, 32, 1, 0, 'water'],
  // magic & light
  crystal_violet: [16, 16, 0, 0, 'magic'], crystal_cyan: [16, 16, 0, 0, 'magic'], crystal_ember: [16, 16, 0, 0, 'magic'],
  lantern_glass_off: [16, 16, 0, 0, 'magic'], lantern_glass_on: [16, 16, 0, 0, 'magic'],
  barrier: [32, 32, 1, 0, 'magic'], portal: [32, 32, 1, 0, 'magic'], portal_swirl: [64, 64, 0, 0, 'magic'], beam: [16, 64, 1, 0, 'magic'],
  sun_glow: [32, 32, 0, 0, 'magic'],
  // sky
  cloud: [64, 32, 0, 1, 'sky'], moon: [32, 32, 0, 1, 'sky'], sun_disc: [32, 32, 0, 1, 'sky'],
  // gameplay props
  vase: [32, 32, 0, 0, 'props'], chest_wood: [32, 32, 0, 0, 'props'], crate: [32, 32, 0, 0, 'props'],
};

// Luminance windows (0..1). Default is the brief's "around 55-70%" with some slack. Surfaces that are
// dark / light / additive by design have their own window so they are not reported as violations.
const LUMA_DEFAULT = [0.5, 0.75];
const LUMA = {
  snow: [0.7, 0.98], snow_petals: [0.7, 0.98], cliff_frost: [0.3, 0.78], far_frost: [0.5, 0.85], cobble_frost: [0.4, 0.9], path_snow: [0.45, 0.92], leaves_blossom: [0.4, 0.85], leaves_frost: [0.4, 0.85], pine_snow: [0.35, 0.8],
  ash: [0.25, 0.6], cinder: [0.08, 0.4], cliff_basalt: [0.1, 0.6], cliff_basalt_bare: [0.1, 0.6], far_ember: [0.28, 0.5], cobble_ember: [0.2, 0.6], path_ash: [0.35, 0.8], pine_char: [0.1, 0.5], lava: [0.3, 0.95], crystal_ember: [0.25, 0.9], flower_ember: [0.25, 0.9],
  cliff: [0.4, 0.75], cliff_warm: [0.4, 0.75], cliff_bare: [0.4, 0.75], cliff_warm_bare: [0.4, 0.75], ice: [0.6, 0.95], portal_swirl: [0.2, 0.85], far_rock: [0.4, 0.72], tower_stone: [0.25, 0.6], rune_ring: [0.2, 0.6],
  metal_iron: [0.25, 0.6], door: [0.3, 0.7], banner: [0.3, 0.7], window: [0.4, 0.95],
  water: [0.4, 0.75], waterfall: [0.5, 0.9], foam: [0.7, 1], moon: [0.6, 1], sun_disc: [0.7, 1],
  cloud: [0.6, 0.95], beam: [0, 1], sun_glow: [0, 1], portal: [0.25, 0.85], barrier: [0.2, 0.75],
  lantern_glass_off: [0.15, 0.6], lantern_glass_on: [0.55, 1], crystal_violet: [0.4, 0.85], crystal_cyan: [0.4, 0.85],
  plaster: [0.55, 0.85], timber: [0.4, 0.8], sand: [0.6, 0.9], thatch: [0.5, 0.8], mushroom_stem: [0.55, 0.85],
  bark: [0.25, 0.6], leaves_green: [0.4, 0.72], leaves_teal: [0.4, 0.72], leaves_autumn: [0.4, 0.72], pine: [0.3, 0.65],
  reeds: [0.3, 0.75], vine: [0.3, 0.75], fern: [0.3, 0.75], tuft: [0.3, 0.8], lilypad: [0.3, 0.75],
  flagstone: [0.5, 0.78], cobble: [0.4, 0.75], brick: [0.4, 0.75], brick_mossy: [0.4, 0.75],
};
const CHECKER_MAX = { pine_snow: 0.065 };      // (snow on the needle tips alternates white and green by design: a little more than the pine's own 4.6%)
const MAX_COLORS = 16;
const HERO_COLORS = 24;
const HERO = new Set(['portal_swirl', 'rune_ring', 'door', 'banner', 'window', 'grass_flowers', 'vase', 'chest_wood', 'crate', 'cloud', 'portal', 'mushroom_cap', 'lantern_glass_on', 'moon', 'sun_disc']);
const NO_COLOR_LIMIT = new Set(['beam', 'sun_glow']); // additive greyscale intensity ramps: 8-bit, not CLUT-limited

// ---------------------------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (n) => argv.some((a) => a === `--${n}`);
const opt = (n, d) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const outDir = argv.find((a) => !a.startsWith('--')) || path.join(os.tmpdir(), 'gloaming-world-textures');
const SCALE = Number(opt('scale', 4));
const TSCALE = Number(opt('tile-scale', 3));
const ONLY = opt('only', '') ? opt('only', '').split(',') : null;
const ZOOM = opt('zoom', '') ? opt('zoom', '').split(',') : [];
const QUIET = flag('quiet');
const DUSK = flag('dusk');

// ---------------------------------------------------------------------------------------------
// tiny 3x5 pixel font for labels
// ---------------------------------------------------------------------------------------------
const FONT_ROWS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  _: ['...', '...', '...', '...', '###'], '-': ['...', '...', '###', '...', '...'], '.': ['...', '...', '...', '...', '.#.'],
  ':': ['...', '.#.', '...', '.#.', '...'], '/': ['..#', '..#', '.#.', '#..', '#..'], '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  ' ': ['...', '...', '...', '...', '...'], '+': ['...', '.#.', '###', '.#.', '...'],
  '(': ['.#.', '#..', '#..', '#..', '.#.'], ')': ['.#.', '..#', '..#', '..#', '.#.'],
};
const FONT = {};
for (const [k, rows] of Object.entries(FONT_ROWS)) FONT[k] = rows.join('');
// each glyph is 15 chars = 5 rows x 3 cols, row-major; lower case is drawn as upper case
const glyph = (ch) => FONT[ch.toUpperCase()] || FONT[' '];

class FB {
  constructor(w, h, bg = [24, 22, 34, 255]) {
    this.w = w; this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
    this.rect(0, 0, w, h, bg);
  }
  rect(x, y, w, h, c) {
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) {
        const k = (j * this.w + i) * 4;
        this.d[k] = c[0]; this.d[k + 1] = c[1]; this.d[k + 2] = c[2]; this.d[k + 3] = c[3] === undefined ? 255 : c[3];
      }
    }
  }
  /** Draw pix scaled by k at (x,y), compositing opaque pixels only (alpha < 128 = leave backdrop). */
  blit(pix, x, y, k, mul = null) {
    for (let j = 0; j < pix.h * k; j++) {
      const sy = (j / k) | 0;
      const dy = y + j;
      if (dy < 0 || dy >= this.h) continue;
      for (let i = 0; i < pix.w * k; i++) {
        const dx = x + i;
        if (dx < 0 || dx >= this.w) continue;
        const s = (sy * pix.w + ((i / k) | 0)) * 4;
        if (pix.data[s + 3] < 128) continue;
        const d = (dy * this.w + dx) * 4;
        let r = pix.data[s], g = pix.data[s + 1], b = pix.data[s + 2];
        if (mul) { r = Math.min(255, r * mul[0]); g = Math.min(255, g * mul[1]); b = Math.min(255, b * mul[2]); }
        this.d[d] = r; this.d[d + 1] = g; this.d[d + 2] = b; this.d[d + 3] = 255;
      }
    }
  }
  /** Draw pix tiled nx*ny times. */
  tiled(pix, x, y, k, nx, ny, mul = null) {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) this.blit(pix, x + i * pix.w * k, y + j * pix.h * k, k, mul);
  }
  text(str, x, y, c = [230, 226, 240, 255], k = 2) {
    let cx = x;
    for (const ch of String(str)) {
      const g = glyph(ch);
      for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r * 3 + q] === '#') this.rect(cx + q * k, y + r * k, k, k, c);
      cx += 4 * k;
    }
    return cx - x;
  }
  save(file) { writePNG(file, this.w, this.h, this.d); }
}
const textW = (s, k = 2) => String(s).length * 4 * k;

// ---------------------------------------------------------------------------------------------
// analysis
// ---------------------------------------------------------------------------------------------
function analyse(name, t) {
  const p = t.pix;
  let opaque = 0, clear = 0, bad = 0, lsum = 0, dirtyClear = 0;
  for (let i = 0; i < p.data.length; i += 4) {
    const a = p.data[i + 3];
    if (a === 255) { opaque++; lsum += 0.299 * p.data[i] + 0.587 * p.data[i + 1] + 0.114 * p.data[i + 2]; } else if (a === 0) { clear++; if (p.data[i] || p.data[i + 1] || p.data[i + 2]) dirtyClear++; } else bad++;
  }
  const px = (x, y) => { const k = (y * p.w + x) * 4; return [p.data[k], p.data[k + 1], p.data[k + 2], p.data[k + 3]]; };
  const dist = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3 + (a[3] !== b[3] ? 255 : 0);
  // Seam check: for every adjacent column pair (and row pair) take the mean colour difference along the
  // line. A wrap seam is only suspicious if it is far more discontinuous than a typical internal
  // transition AND at least as discontinuous as the worst one (designed borders such as mortar lines
  // or plank gaps produce big differences at internal pairs too).
  const linePairs = (axis) => {
    const n = axis === 'x' ? p.w : p.h, m = axis === 'x' ? p.h : p.w;
    const d = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      let sum = 0;
      for (let k = 0; k < m; k++) sum += axis === 'x' ? dist(px(i, k), px(j, k)) : dist(px(k, i), px(k, j));
      d.push(sum / m);
    }
    const seam = d[n - 1];
    const inner = d.slice(0, n - 1);
    const mean = inner.reduce((a, b) => a + b, 0) / inner.length;
    const max = Math.max(...inner);
    return { seam, mean, max };
  };
  // 1px checkerboard measure: share of 2x2 windows that are a b / b a (a != b). High values shimmer under nearest sampling.
  let chk = 0, win = 0;
  const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const a = px(x, y), b = px((x + 1) % p.w, y), c2 = px(x, (y + 1) % p.h), d = px((x + 1) % p.w, (y + 1) % p.h);
      if (a[3] < 128 || b[3] < 128 || c2[3] < 128 || d[3] < 128) continue;
      win++;
      if (same(a, d) && same(b, c2) && !same(a, b)) chk++;
    }
  }
  // near-duplicate colours: closer than one 5-bit step (8/255) in every channel would merge or flicker in the
  // 15-bit dithered output, and waste a CLUT entry
  const seen = new Map();
  for (let i = 0; i < p.data.length; i += 4) {
    if (p.data[i + 3] === 255) seen.set((p.data[i] << 16) | (p.data[i + 1] << 8) | p.data[i + 2], [p.data[i], p.data[i + 1], p.data[i + 2]]);
  }
  const uniq = [...seen.values()];
  let nearPairs = 0;
  for (let a = 0; a < uniq.length; a++) {
    for (let b = a + 1; b < uniq.length; b++) {
      if (Math.max(Math.abs(uniq[a][0] - uniq[b][0]), Math.abs(uniq[a][1] - uniq[b][1]), Math.abs(uniq[a][2] - uniq[b][2])) < 8) nearPairs++;
    }
  }
  const hx = linePairs('x'), vy = linePairs('y');
  const ratio = (q) => (q.mean > 0.5 ? (q.seam > q.max * 1.5 ? q.seam / q.mean : Math.min(q.seam / q.mean, 1.9)) : (q.seam > 0.5 ? 9 : 1));
  return {
    name, w: p.w, h: p.h, colors: p.colorCount(), opaque, clear, bad, dirtyClear,
    luma: opaque ? lsum / opaque / 255 : 0,
    checker: win ? chk / win : 0,
    windows: win,
    nearPairs,
    edge: p.edgeMismatch(),
    ratioH: ratio(hx),
    ratioV: ratio(vy),
  };
}

// ---------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------
const t0 = performance.now();
const tex = generateWorldTextures();
const genMs = performance.now() - t0;
// second run = warm timing, and a determinism check
const t1 = performance.now();
const tex2 = generateWorldTextures();
const warmMs = performance.now() - t1;
let nondeterministic = [];
for (const k of Object.keys(tex)) {
  const a = tex[k].pix.data, b = tex2[k] && tex2[k].pix.data;
  if (!b || a.length !== b.length || a.some((v, i) => v !== b[i])) nondeterministic.push(k);
}

const hard = [];
const soft = [];
const rows = [];
const names = Object.keys(SPEC);
for (const n of names) if (!tex[n]) hard.push(`missing texture: ${n}`);
for (const n of Object.keys(tex)) if (!SPEC[n]) hard.push(`unexpected texture: ${n}`);
for (const n of nondeterministic) hard.push(`${n}: not deterministic between two generateWorldTextures() calls`);
const notes = WORLD_TEXTURE_NOTES || {};
for (const n of names) if (tex[n] && !notes[n]) soft.push(`${n}: no WORLD_TEXTURE_NOTES entry`);

for (const n of names) {
  const t = tex[n];
  if (!t) continue;
  const s = SPEC[n];
  const r = analyse(n, t);
  const f = [];
  const H = (m) => { hard.push(`${n}: ${m}`); f.push('!' + m.split(' ')[0]); };
  const S = (m, tag) => { soft.push(`${n}: ${m}`); f.push(tag); };
  if (!(t.pix.w > 0 && (t.pix.w & (t.pix.w - 1)) === 0 && (t.pix.h & (t.pix.h - 1)) === 0)) H('size not power of two');
  if (r.w !== s[0] || r.h !== s[1]) H(`size ${r.w}x${r.h} != spec ${s[0]}x${s[1]}`);
  if (!!t.tile !== !!s[2]) H(`tile flag ${t.tile} != spec ${!!s[2]}`);
  if (!!t.cutout !== !!s[3]) H(`cutout flag ${t.cutout} != spec ${!!s[3]}`);
  if (r.bad) H(`${r.bad} px with non-binary alpha`);
  if (t.cutout && r.clear === 0) H('cutout but no transparent pixels');
  if (r.dirtyClear) H(`${r.dirtyClear} transparent texels are not black (additive materials ignore alpha)`);
  if (!t.cutout && r.clear > 0) H(`opaque texture has ${r.clear} transparent px`);
  const limit = HERO.has(n) ? HERO_COLORS : MAX_COLORS;
  if (!NO_COLOR_LIMIT.has(n)) {
    if (r.colors > HERO_COLORS) H(`${r.colors} colours (> ${HERO_COLORS})`);
    else if (r.colors > limit) S(`${r.colors} colours (> ${MAX_COLORS} CLUT)`, `c${r.colors}`);
  }
  const win = LUMA[n] || LUMA_DEFAULT;
  if (r.luma < win[0] || r.luma > win[1]) S(`luma ${(r.luma * 100).toFixed(0)}% outside ${win.map((v) => (v * 100) | 0).join('-')}%`, r.luma < win[0] ? 'dark' : 'light');
  if (r.nearPairs && !NO_COLOR_LIMIT.has(n)) S(`${r.nearPairs} near-duplicate colour pair(s) (< 8/255 apart)`, 'near');
  if (r.checker > (CHECKER_MAX[n] ?? 0.05) && r.windows >= 150 && !NO_COLOR_LIMIT.has(n)) S(`1px checkerboard ${(r.checker * 100).toFixed(1)}% of 2x2 windows`, 'chk');
  if (t.tile && (r.ratioH > 2.2 || r.ratioV > 2.2)) S(`seam ratio ${r.ratioH.toFixed(1)}/${r.ratioV.toFixed(1)} (>2.2)`, 'seam');
  rows.push({ ...r, tile: t.tile, cutout: t.cutout, flags: f });
}

if (genMs > 300) hard.push(`generation ${genMs.toFixed(0)} ms > 300 ms`);

if (!QUIET) {
  const pad = (v, n) => String(v).padEnd(n);
  const padl = (v, n) => String(v).padStart(n);
  console.log(`generateWorldTextures(): ${genMs.toFixed(0)} ms cold, ${warmMs.toFixed(0)} ms warm  (${Object.keys(tex).length} textures)`);
  console.log([pad('name', 18), pad('size', 8), pad('tile', 5), pad('cut', 4), padl('cols', 5), padl('luma', 6), padl('edge', 7),
    padl('seamH', 7), padl('seamV', 7), padl('chk%', 6), '  flags'].join(''));
  for (const r of rows) {
    console.log([
      pad(r.name, 18), pad(`${r.w}x${r.h}`, 8), pad(r.tile ? 'T' : '-', 5), pad(r.cutout ? 'C' : '-', 4), padl(r.colors, 5),
      padl(`${(r.luma * 100).toFixed(0)}%`, 6), padl(r.edge.toFixed(1), 7), padl(r.ratioH.toFixed(1), 7), padl(r.ratioV.toFixed(1), 7),
      padl((r.checker * 100).toFixed(1), 6), '  ', r.flags.join(' '),
    ].join(''));
  }
  const clut = rows.filter((r) => !NO_COLOR_LIMIT.has(r.name));
  const over = clut.filter((r) => r.colors > MAX_COLORS);
  console.log(`\ncolour count: max ${Math.max(...clut.map((r) => r.colors))}; > ${MAX_COLORS}: ${over.length ? over.map((r) => `${r.name}(${r.colors})`).join(', ') : 'none'}`);
  const albedo = clut.filter((r) => !SPEC[r.name][3]);
  console.log(`mean luma of the opaque set: ${((albedo.reduce((a, r) => a + r.luma, 0) / albedo.length) * 100).toFixed(0)}%`);
  console.log(`\nHARD violations: ${hard.length}`);
  for (const m of hard) console.log(`  ! ${m}`);
  console.log(`soft warnings: ${soft.length}`);
  for (const m of soft) console.log(`  - ${m}`);
}

if (flag('no-png')) process.exit(hard.length ? 1 : 0);

// ---------------------------------------------------------------------------------------------
// sheets
// ---------------------------------------------------------------------------------------------
fs.mkdirSync(outDir, { recursive: true });
const DUSKMUL = [0.62, 0.7, 1.0];
const mulFor = () => (DUSK ? DUSKMUL : null);
const groups = {};
for (const n of names) {
  if (!tex[n]) continue;
  if (ONLY && !ONLY.includes(n)) continue;
  (groups[SPEC[n][4]] ||= []).push(n);
}
const BG_DARK = [40, 44, 64, 255], BG_LIGHT = [150, 190, 220, 255];
const MAXW = 1400;

for (const [g, list] of Object.entries(groups)) {
  // --- albedo sheet
  const cards = list.map((n) => {
    const p = tex[n].pix;
    const k = p.w * SCALE > 300 ? Math.max(1, Math.floor(300 / p.w)) : SCALE;
    const panels = tex[n].cutout ? 2 : 1;
    const w = Math.max(p.w * k * panels + (panels - 1) * 4, textW(n) + 2);
    return { n, p, k, panels, w, h: p.h * k + 22 };
  });
  let x = 8, y = 8, rowH = 0, placements = [];
  for (const c of cards) {
    if (x + c.w > MAXW) { x = 8; y += rowH + 12; rowH = 0; }
    placements.push([c, x, y]);
    x += c.w + 12;
    rowH = Math.max(rowH, c.h);
  }
  const fb = new FB(MAXW, y + rowH + 8);
  for (const [c, px, py] of placements) {
    const t = tex[c.n];
    if (t.cutout) {
      fb.rect(px, py, c.p.w * c.k, c.p.h * c.k, BG_DARK);
      fb.blit(c.p, px, py, c.k, mulFor());
      fb.rect(px + c.p.w * c.k + 4, py, c.p.w * c.k, c.p.h * c.k, BG_LIGHT);
      fb.blit(c.p, px + c.p.w * c.k + 4, py, c.k, mulFor());
    } else fb.blit(c.p, px, py, c.k, mulFor());
    fb.text(c.n, px, py + c.p.h * c.k + 4, [235, 230, 245, 255], 2);
    const info = rows.find((r) => r.name === c.n);
    if (info) fb.text(`${info.colors}c ${(info.luma * 100) | 0}%`, px, py + c.p.h * c.k + 13, info.flags.length ? [255, 150, 130, 255] : [150, 150, 170, 255], 1);
  }
  fb.save(path.join(outDir, `sheet-${g}.png`));

  // --- tiling sheet
  const tl = list.filter((n) => tex[n].tile);
  if (tl.length) {
    const tcards = tl.map((n) => { const p = tex[n].pix; return { n, p, w: Math.max(p.w * TSCALE * 3, textW(n) + 2), h: p.h * TSCALE * 3 + 14 }; });
    let tx = 8, ty = 8, rh = 0; const tp = [];
    for (const c of tcards) {
      if (tx + c.w > MAXW) { tx = 8; ty += rh + 10; rh = 0; }
      tp.push([c, tx, ty]); tx += c.w + 10; rh = Math.max(rh, c.h);
    }
    const tfb = new FB(MAXW, ty + rh + 8);
    for (const [c, px, py] of tp) {
      tfb.tiled(c.p, px, py, TSCALE, 3, 3, mulFor());
      tfb.text(c.n, px, py + c.p.h * TSCALE * 3 + 3, [235, 230, 245, 255], 2);
    }
    tfb.save(path.join(outDir, `tiles-${g}.png`));
  }
}

// --- family sheet (everything at x2)
if (!ONLY) {
  const K = 2;
  let x = 8, y = 8, rowH = 0; const pl = [];
  for (const g of Object.keys(groups)) {
    for (const n of groups[g]) {
      const p = tex[n].pix;
      const w = Math.max(p.w * K, textW(n, 1) + 2);
      if (x + w > MAXW) { x = 8; y += rowH + 8; rowH = 0; }
      pl.push([n, p, x, y]); x += w + 6; rowH = Math.max(rowH, p.h * K + 8);
    }
    x = MAXW; // start a new row per group
  }
  const fb = new FB(MAXW, y + rowH + 8);
  for (const [n, p, px, py] of pl) {
    if (tex[n].cutout) fb.rect(px, py, p.w * K, p.h * K, BG_DARK);
    fb.blit(p, px, py, K, mulFor());
    fb.text(n, px, py + p.h * K + 2, [200, 196, 214, 255], 1);
  }
  fb.save(path.join(outDir, `family${DUSK ? '-dusk' : ''}.png`));
}

// --- zooms
for (const n of ZOOM) {
  const t = tex[n];
  if (!t) { console.log(`zoom: no texture ${n}`); continue; }
  const p = t.pix;
  const big = 10;
  const small = 4;
  const w = Math.max(p.w * big, p.w * small * 3) + 24;
  const fb = new FB(w + p.w * small * 3 * (t.tile ? 0 : 0), p.h * big + (t.tile ? p.h * small * 3 + 24 : 16) + 8);
  if (t.cutout) fb.rect(8, 8, p.w * big, p.h * big, BG_DARK);
  fb.blit(p, 8, 8, big, mulFor());
  if (t.tile) fb.tiled(p, 8, p.h * big + 16, small, 3, 3, mulFor());
  fb.save(path.join(outDir, `zoom-${n}.png`));
}
if (!QUIET) console.log(`\nwrote sheets to ${outDir}`);
process.exit(hard.length ? 1 : 0);
