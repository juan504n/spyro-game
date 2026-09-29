// Building textures: brick, plaster, timber, planks, beams, roofs, thatch, tower stone, metals, window, door, banner.
import { RAMPS } from '../palette.js';
import {
  Canvas, RNG, field, noiseFn, bandPick, dpick, poisson, walk, polyline, rec, clamp, wrapN,
} from './kit.js';

const PS = RAMPS.pathStone, BR = RAMPS.brick, PL = RAMPS.plaster, W = RAMPS.wood, RR = RAMPS.roofRed, RT = RAMPS.roofTeal;
const TH = RAMPS.thatch, MT = RAMPS.metal, BZ = RAMPS.brass, M = RAMPS.moss, AM = RAMPS.amber, V = RAMPS.crystalViolet;

// ---------------------------------------------------------------------------------------------
// Running-bond bricks
// ---------------------------------------------------------------------------------------------
function paintBricks(seed, o) {
  const c = new Canvas(32, 32, true, o.mortar);
  const rng = new RNG(seed);
  const rows = 32 / o.bh, per = 32 / o.bw;
  const list = [];
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (o.bw >> 1);
    for (let q = 0; q < per; q++) {
      const x0 = q * o.bw + off, y0 = r * o.bh;
      const t = rng.pick(o.tones);
      const w = o.bw - 1, h = o.bh - 1;
      c.rect(x0, y0, w, h, t.m);
      if (t.m2 && h > 4) {
        // shaded lower part with a chunky dither seam
        c.dither(x0, y0 + Math.floor(h * 0.6), w, 1, t.m, t.m2, 0.5, 2);
        c.rect(x0, y0 + Math.floor(h * 0.6) + 1, w, h - Math.floor(h * 0.6) - 1, t.m2);
      }
      c.hl(x0, y0, w - 1, t.l);
      if (h > 3) c.vl(x0, y0, h - 1, t.l);
      c.hl(x0 + 1, y0 + h - 1, w - 1, t.d);
      if (h > 3) c.vl(x0 + w - 1, y0 + 1, h - 1, t.d);
      // worn corners
      if (rng.chance(o.chip ?? 0.5)) c.dot(x0 + w - 1, y0, o.mortar);
      if (rng.chance((o.chip ?? 0.5) * 0.6)) c.dot(x0, y0 + h - 1, o.mortar);
      // speckle
      const sp = o.speckle ?? 3;
      for (let k = 0; k < sp; k++) {
        c.dot(x0 + rng.int(2, w - 2), y0 + rng.int(1, h - 1), rng.chance(0.5) ? t.l : t.d);
      }
      list.push({ x0, y0, w, h, t });
    }
  }
  return { c, rng, list };
}

const STONE_TONES = [
  { m: PS[3], m2: '#928da6', l: PS[4], d: PS[2] },
  { m: '#b4a8b8', m2: '#9c90a6', l: '#d4c8d4', d: '#8c8098' },
  { m: PS[2], m2: '#726e88', l: PS[3], d: PS[1] },
];

function brick() {
  return paintBricks(2201, { bw: 16, bh: 8, mortar: PS[0], tones: STONE_TONES, speckle: 3 }).c;
}

function brickWarm() {
  const MORT = '#d2c4a4', MORT_SH = '#a8987c';
  const tones = [
    { m: BR[3], l: BR[4], d: BR[2] },
    { m: '#c4946e', l: '#dcae88', d: BR[2] },
    { m: '#a8785e', l: BR[3], d: BR[1] },
    { m: BR[3], l: BR[4], d: BR[2] },
  ];
  const { c } = paintBricks(2301, { bw: 16, bh: 8, mortar: MORT, tones, speckle: 3, chip: 0.3 });
  // mortar shadow under every course
  for (let x = 0; x < 32; x++) {
    for (let r = 0; r < 4; r++) {
      const y = r * 8 + 7;
      if (c.get(x, y)[0] === parseInt(MORT.slice(1, 3), 16)) c.dot(x, y, MORT_SH);
    }
  }
  return c;
}

function brickMossy() {
  const { c, rng } = paintBricks(2401, { bw: 16, bh: 8, mortar: PS[0], tones: STONE_TONES, speckle: 3, chip: 0.9 });
  const f = field(32, 32, 2402, 5, 5, 2);
  const MC = [M[1], M[2], M[3], M[4]];
  const mortarRGB = [0x4a, 0x46, 0x58];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const p = c.get(x, y);
      const isMortar = p[0] === mortarRGB[0] && p[1] === mortarRGB[1] && p[2] === mortarRGB[2];
      // moss favours the mortar joints and the lower part of each course
      const ly = y % 8;
      const m = f[y * 32 + x] + (isMortar ? 0.2 : 0) + (ly >= 5 ? 0.09 : 0) - (ly <= 1 ? 0.08 : 0);
      if (m > 0.84) c.dot(x, y, m > 0.97 ? MC[3] : m > 0.91 ? MC[2] : MC[1]);
    }
  }
  // moss overhang: a dark pixel under some patches, a light one on top
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const a = c.get(x, y), b = c.get(x, y + 1);
      const isG = (q) => q[1] > q[0] + 20 && q[1] > q[2] + 20;
      if (isG(a) && !isG(b) && ((x + y) & 1) === 0 && b[0] !== 0x4a) c.dot(x, y + 1, PS[1]);
    }
  }
  // crumbled corners: a few missing chunks showing the dark core
  for (const [x, y] of poisson(rng, 32, 32, 3, 9)) { c.rect(x, y, 2, 1, PS[0]); c.dot(x, y + 1, PS[0]); }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Plaster + half-timbered wall
// ---------------------------------------------------------------------------------------------
const PLASTER = { base: '#c8b998', light: '#dccfb2', dark: '#b3a288', deep: '#98866e', crack: '#6e5e4e' };
function paintPlaster(seed, o = {}) {
  const c = new Canvas(32, 32, true, PLASTER.base);
  const rng = new RNG(seed);
  const f = field(32, 32, seed + 1, 3, 3, 2);
  const tones = [PLASTER.dark, PLASTER.base, PLASTER.base, PLASTER.base, PLASTER.light];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.set(x, y, bandPick(tones, f[y * 32 + x], x, y, 0.4, 1));
  // trowel marks: short curved light strokes
  for (const [x, y] of poisson(rng, 32, 32, o.strokes ?? 8, 6)) {
    const len = rng.int(3, 6);
    for (let i = 0; i < len; i++) c.dot(x + i, y + (i > len / 2 ? 1 : 0), PLASTER.light);
  }
  for (const [x, y] of poisson(rng, 32, 32, 12, 3)) c.dot(x, y, rng.chance(0.6) ? PLASTER.dark : PLASTER.deep);
  return { c, rng };
}

function plaster() {
  const { c, rng } = paintPlaster(2501);
  // hairline cracks
  for (let i = 0; i < 3; i++) {
    const p = walk(rng, rng.int(0, 32), rng.int(0, 32), rng.int(6, 11), [rng.float(-0.6, 0.6), 0.9], 0.7);
    polyline(c, p, PLASTER.crack);
    for (const [x, y] of p) if (rng.chance(0.35)) c.dot(x + 1, y, PL[3]);
  }
  // a chip where the plaster fell off, showing brick
  const [cx, cy] = [22, 10];
  c.rect(cx, cy, 3, 2, BR[2]); c.dot(cx + 2, cy + 1, BR[1]); c.dot(cx, cy, BR[3]);
  c.hl(cx - 1, cy + 2, 4, PLASTER.deep);
  return c;
}

function timber() {
  const { c, rng } = paintPlaster(2601, { strokes: 5 });
  const beam = { hi: W[3], m: W[2], lo: W[1], dk: W[0] };
  // shadows the frame casts on the plaster (light from the upper left)
  for (let i = 2; i < 30; i++) { c.dot(2, i, PLASTER.deep); c.dot(i, 2, PLASTER.deep); }
  // diagonal brace, bottom-left -> top-right, with a cast shadow
  for (let t = 0; t <= 27; t++) {
    const x = 3 + t, y = 28 - t;
    c.dot(x + 1, y + 1, PLASTER.deep); c.dot(x + 2, y + 1, PLASTER.deep);
    c.dot(x - 1, y, beam.hi); c.dot(x, y, beam.m); c.dot(x + 1, y, beam.m); c.dot(x + 2, y, beam.lo);
    if (t % 3 === 1) c.dot(x, y - 1, beam.hi);
  }
  // vertical posts straddle the left/right seam, horizontal rails the top/bottom seam
  const post = [beam.hi, beam.m, beam.m, beam.lo]; // x = 30, 31, 0, 1
  for (let y = 0; y < 32; y++) {
    c.dot(30, y, post[0]); c.dot(31, y, post[1]); c.dot(0, y, post[2]); c.dot(1, y, post[3]);
  }
  for (let x = 0; x < 32; x++) {
    c.dot(x, 30, beam.hi); c.dot(x, 31, beam.m); c.dot(x, 0, beam.m); c.dot(x, 1, beam.lo);
  }
  // wood grain and nails
  for (const [x, y] of poisson(rng, 4, 32, 7, 3)) c.dot(x === 3 ? 31 : x === 2 ? 0 : x === 1 ? 30 : 1, y, beam.dk);
  for (const [x, y] of poisson(rng, 32, 4, 7, 3)) c.dot(x, y === 3 ? 0 : y === 2 ? 31 : y === 1 ? 30 : 1, beam.dk);
  for (const [x, y] of [[31, 8], [0, 22], [10, 31], [22, 0]]) c.dot(x, y, W[5]);
  // corner blocks where post meets rail
  c.rect(30, 30, 4, 1, beam.hi); c.rect(30, 30, 1, 4, beam.hi);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Wood: planks and posts
// ---------------------------------------------------------------------------------------------
function woodPlank() {
  const c = new Canvas(32, 32, true, '#c89c5a');
  const rng = new RNG(2701);
  const seams = [9, 24, 4, 19];
  for (let r = 0; r < 4; r++) {
    const y0 = r * 8;
    // plank tone variation: each plank segment between seams gets its own tone
    const s0 = seams[r], s1 = (seams[r] + 16) % 32;
    const tone = ['#d0a866', '#c49a58', '#d0a866', '#b88c50'];
    for (let x = 0; x < 32; x++) {
      const seg = wrapN(x - s0, 32) < 16 ? 0 : 1;
      c.rect(x, y0, 1, 7, tone[(r + seg * 2) % 4]);
    }
    // plank edges: lit top row, dark gap below
    c.hl(0, y0, 32, W[5]);
    c.hl(0, y0 + 6, 32, W[3]);
    c.hl(0, y0 + 7, 32, W[1]);
    // butt joints with nails either side
    for (const s of [s0, s1]) {
      c.vl(s, y0, 8, W[1]); c.vl(s + 1, y0, 7, W[5]);
      c.dot(s - 2, y0 + 3, W[0]); c.dot(s - 2, y0 + 2, W[5]);
      c.dot(s + 3, y0 + 3, W[0]); c.dot(s + 3, y0 + 2, W[5]);
    }
  }
  // grain: a wavering line on each plank segment, kept clear of the seams and nails
  for (let r = 0; r < 4; r++) {
    const s0 = seams[r], y = r * 8 + 3 + (r % 2);
    const ph = rng.float(0, 6.28);
    for (let seg = 0; seg < 2; seg++) {
      const start = s0 + 5 + seg * 16;
      for (let i = 0; i < 8; i++) {
        const off = Math.round(Math.sin((i / 8) * Math.PI + ph) * 0.9);
        c.dot(start + i, y + off, W[3]);
      }
    }
  }
  // knots
  for (const [x, y] of [[13, 3], [27, 19], [6, 27]]) {
    c.ellipse(x, y, 2, 1.4, W[2]);
    c.ellipse(x, y, 1.2, 0.8, W[0]);
    c.dot(x - 1, y - 1, W[5]);
  }
  return c;
}

function woodBeam() {
  const c = new Canvas(16, 32, true, W[3]);
  // flowing grain: 1D tileable noise across x, warped along y; broad tone bands + dark contour lines
  const nz = noiseFn(2802, 2, 1);
  const g = (x, y) => nz(((x + 0.8 * Math.sin((y / 32) * Math.PI * 2 * 1 + 0.7) + 0.5 * Math.sin((y / 32) * Math.PI * 2 * 2 + 2.1)) / 16) * 2 + 2000, 0);
  const tones = [W[3], W[3], W[4], W[4], W[5], W[5]];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 16; x++) {
      const v = g(x, y);
      c.dot(x, y, tones[Math.min(5, Math.max(0, Math.floor((v - 0.1) / 0.8 * 6)))]);
    }
  }
  // dark grain lines where the tone steps, with gaps
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 16; x++) {
      const a = Math.floor((g(x, y) - 0.1) / 0.8 * 6), b = Math.floor((g(x + 1, y) - 0.1) / 0.8 * 6);
      if (a !== b && ((y + x * 5) % 7) < 5) c.dot(x, y, W[2]);
    }
  }
  // knot and a long split
  c.ellipse(9, 12, 2.2, 2.8, W[2]); c.ellipse(9, 12, 1.3, 1.9, W[1]); c.dot(9, 12, W[0]); c.dot(8, 10, W[5]); c.dot(7, 11, W[4]);
  for (let i = 0; i < 8; i++) { c.dot(4 + ((i / 3) | 0) % 2, 21 + i, W[0]); c.dot(5 + ((i / 3) | 0) % 2, 21 + i, W[4]); }
  for (const [x, y] of [[13, 5], [2, 28]]) { c.dot(x, y, W[0]); c.dot(x + 1, y, W[4]); }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Roofs
// ---------------------------------------------------------------------------------------------
// Scalloped shingles (fish scale): rows of 8x8, each row shifted by half a shingle.
function paintScallops(R, seed, opts = {}) {
  const c = new Canvas(32, 32, true);
  const rng = new RNG(seed);
  const S = 8, RH = 8;
  const owner = (x, y) => {
    x = wrapN(x, 32); y = wrapN(y, 32);
    const r0 = Math.floor(y / RH), ly = y - r0 * RH;
    const off = (r0 % 2) * (S / 2);
    const j = Math.floor(wrapN(x - off, 32) / S);
    const lx = wrapN(x - off, 32) - j * S;
    const dx = lx - 3.5, dy = ly - 3.5;
    if (ly <= 3 || dx * dx + dy * dy <= 16.2) return { id: r0 * 8 + j, r: r0, j, lx, ly };
    // corner gap: belongs to the shingle of the row below, in its hidden top part
    const r1 = (r0 + 1) % 4;
    const off1 = (r1 % 2) * (S / 2);
    const j1 = Math.floor(wrapN(x - off1, 32) / S);
    return { id: r1 * 8 + j1, r: r1, j: j1, lx: wrapN(x - off1, 32) - j1 * S, ly: ly - RH };
  };
  const tone = [];
  for (let i = 0; i < 40; i++) tone.push(rng.pick(opts.tones ?? [0, 1, 1, 2]));
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const o = owner(x, y);
      const base = R.body[tone[o.id % 40]];
      let col = base;
      if (o.ly < 0) col = o.ly >= -2 ? R.deep : R.shade;
      else {
        const below = owner(x, y + 1), left = owner(x - 1, y), right = owner(x + 1, y);
        if (below.id !== o.id && below.ly >= 0) col = R.deep; // never happens for hidden parts
        else if (below.id !== o.id) col = R.deep;
        else if (left.id !== o.id && left.ly >= 0) col = R.hi;
        else if (right.id !== o.id && right.ly >= 0) col = R.shade;
        else if (o.ly <= 1) col = R.shade2 ?? base;
        else if (o.lx === 2 && o.ly >= 2 && o.ly <= 5) col = R.hi2 ?? base;
      }
      c.dot(x, y, col);
    }
  }
  // grit and weathering
  for (const [x, y] of poisson(rng, 32, 32, opts.grit ?? 10, 4)) {
    const o = owner(x, y);
    if (o.ly >= 2) c.dot(x, y, rng.chance(0.5) ? R.hi : R.shade);
  }
  return c;
}

function roofRed() {
  return paintScallops({
    body: ['#e07850', '#d86a48', '#e88a5c'], hi: '#f8b08a', hi2: '#f09a6a', shade: '#c45a40', shade2: '#d0603f', deep: RR[1],
  }, 2901);
}

function roofTeal() {
  // slates: 8x8 rectangles with clipped lower corners, rows shifted by half a slate
  const c = new Canvas(32, 32, true, RT[1]);
  const rng = new RNG(3001);
  const tones = [{ m: '#58b4ac', l: RT[4], d: '#3a9494' }, { m: '#66c0b6', l: '#b0e8dc', d: '#48a8a0' }, { m: '#48a8a0', l: RT[4], d: RT[2] }];
  for (let r = 0; r < 4; r++) {
    const off = (r % 2) * 4;
    for (let q = 0; q < 4; q++) {
      const x0 = q * 8 + off, y0 = r * 8;
      const t = rng.pick([tones[0], tones[0], tones[1], tones[2]]);
      c.rect(x0, y0, 7, 7, t.m);
      c.hl(x0, y0, 6, t.l);
      c.vl(x0, y0, 6, t.l);
      c.hl(x0 + 1, y0 + 6, 6, t.d);
      c.vl(x0 + 6, y0 + 1, 6, t.d);
      // clipped lower corners
      c.dot(x0, y0 + 6, RT[1]); c.dot(x0 + 6, y0 + 6, RT[1]);
      c.dot(x0 + 6, y0, RT[1]);
      // a scratch and a chip
      const sx = x0 + rng.int(2, 5), sy = y0 + rng.int(2, 4);
      c.dot(sx, sy, t.d); c.dot(sx + 1, sy + 1, t.d);
      if (rng.chance(0.5)) c.dot(x0 + rng.int(2, 5), y0 + 2, t.l);
    }
    // deep shadow under each course: the rows overlap
    c.hl(0, r * 8 + 7, 32, RT[1]);
  }
  return c;
}

function thatch() {
  const c = new Canvas(32, 32, true, TH[2]);
  const rng = new RNG(3101);
  // long vertical straw strokes, slightly slanted, in four tones
  const cols = [TH[1], TH[2], TH[2], TH[3], TH[3], TH[4]];
  for (let i = 0; i < 90; i++) {
    const x = rng.int(0, 32), y = rng.int(0, 32), len = rng.int(6, 13);
    const col = rng.pick(cols);
    const slant = rng.pick([0, 0, 0.1, -0.1, 0.15]);
    for (let j = 0; j < len; j++) c.dot(x + Math.round(j * slant), y + j, col);
  }
  // darker straw between, for depth
  for (let i = 0; i < 30; i++) {
    const x = rng.int(0, 32), y = rng.int(0, 32), len = rng.int(3, 7);
    for (let j = 0; j < len; j++) c.dot(x, y + j, TH[1]);
  }
  // binding courses: shadow line then a ragged lip of light straw hanging below it
  for (const y0 of [4, 15, 26]) {
    for (let x = 0; x < 32; x++) {
      const drop = ((x * 5 + y0) % 7) < 2 ? 1 : 0;
      c.dot(x, y0, TH[0]);
      if ((x + y0) % 3 !== 0) c.dot(x, y0 + 1, TH[1]);
      c.dot(x, y0 + 2, TH[4]);
      if (drop && (x % 2 === 0)) c.dot(x, y0 + 3, TH[3]);
    }
  }
  // sparse dark flecks
  for (const [x, y] of poisson(rng, 32, 32, 14, 4)) c.dot(x, y, TH[0]);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Observatory tower: dark bluish-slate ashlar with faint pale runes
// ---------------------------------------------------------------------------------------------
const SL = ['#1e2038', '#2c3050', '#3c4268', '#525a84', '#6c76a0', '#8a94bc'];
const RUNES = [
  ['.#.', '###', '.#.', '.#.', '.#.'],
  ['#.#', '.#.', '###', '.#.', '#.#'],
  ['###', '#.#', '#.#', '#.#', '###'],
  ['.##', '#..', '.#.', '..#', '##.'],
  ['#..', '##.', '###', '.##', '..#'],
  ['.#.', '#.#', '#.#', '.#.', '.#.'],
];
function towerStone() {
  const c = new Canvas(32, 32, true, SL[0]);
  const rng = new RNG(3201);
  const splits = [[5, 21], [13, 27], [2, 18], [9, 25]];
  const tones = [{ m: '#5a648e', l: '#7c88b4', d: SL[3] }, { m: '#48507c', l: '#6a76a0', d: SL[2] }, { m: '#6a76a0', l: '#8c98c4', d: '#48507c' }];
  const blocks = [];
  for (let r = 0; r < 4; r++) {
    for (let b = 0; b < 2; b++) {
      const x0 = splits[r][b];
      const w = (b === 0 ? splits[r][1] - splits[r][0] : splits[r][0] + 32 - splits[r][1]) - 1;
      const y0 = r * 8, t = rng.pick(tones);
      c.rect(x0, y0, w, 7, t.m);
      c.hl(x0, y0, w - 1, t.l); c.vl(x0, y0, 6, t.l);
      c.hl(x0 + 1, y0 + 6, w - 1, t.d); c.vl(x0 + w - 1, y0 + 1, 6, t.d);
      // subtle chisel marks
      for (let k = 0; k < 2; k++) c.dot(x0 + rng.int(2, w - 2), y0 + rng.int(2, 5), rng.chance(0.5) ? SL[2] : '#6a76a0');
      blocks.push({ x0, y0, w, t });
    }
  }
  // faint rune glyphs on some blocks: one step lighter than the stone
  const pick = shuffleIdx(rng, blocks.length).slice(0, 5);
  pick.forEach((bi, k) => {
    const b = blocks[bi], g = RUNES[k % RUNES.length];
    const gx = b.x0 + ((b.w - 3) >> 1), gy = b.y0 + 1;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '#') c.dot(gx + i, gy + j, '#8c98c4');
  });
  return c;
}
function shuffleIdx(rng, n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = rng.int(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------------------------------------------------------------------------------------------
// Metals (16x16 tiles)
// ---------------------------------------------------------------------------------------------
function rivet(c, x, y, o) {
  // 3x3 dome: bright top-left pixel, shaded bottom row / right column, plus an L-shaped cast shadow
  c.rect(x, y, 3, 3, o.body);
  c.hl(x, y + 2, 3, o.rim); c.vl(x + 2, y, 3, o.rim);
  c.dot(x, y, o.hi); c.dot(x + 1, y, o.hi); c.dot(x, y + 1, o.hi);
  c.dot(x + 3, y + 1, o.shadow); c.dot(x + 3, y + 2, o.shadow);
  c.dot(x + 1, y + 3, o.shadow); c.dot(x + 2, y + 3, o.shadow);
}

function metalBrass() {
  const c = new Canvas(16, 16, true, BZ[2]);
  // soft diagonal light: bright top-left, deeper bottom-right
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const t = (x + y) / 30;
      c.dot(x, y, bandPick([BZ[3], BZ[3], BZ[2], BZ[2], BZ[1]], t, x, y, 0.22, 1));
    }
  }
  // plate seams: dark line + lit line at the top/left edge, shaded lip bottom/right
  c.hl(0, 0, 16, BZ[0]); c.vl(0, 0, 16, BZ[0]);
  c.hl(1, 1, 15, BZ[4]); c.vl(1, 1, 15, BZ[4]);
  c.hl(2, 15, 14, BZ[0]); c.vl(15, 2, 14, BZ[0]);
  c.hl(2, 14, 13, BZ[1]); c.vl(14, 2, 13, BZ[1]);
  // rivets in the corners
  for (const [x, y] of [[3, 3], [10, 3], [3, 10], [10, 10]]) rivet(c, x, y, { shadow: BZ[1], rim: BZ[3], body: BZ[4], hi: '#fff6c8' });
  // a few diagonal scratches
  for (let i = 0; i < 4; i++) { c.dot(6 + i, 9 - i, BZ[4]); c.dot(7 + i, 9 - i, BZ[1]); }
  c.dot(9, 12, BZ[4]); c.dot(10, 13, BZ[4]); c.dot(6, 6, BZ[1]);
  return c;
}

function metalIron() {
  const c = new Canvas(16, 16, true, MT[1]);
  const f = field(16, 16, 3402, 2, 2, 2);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) c.dot(x, y, bandPick([MT[1], MT[1], MT[2], MT[2]], (f[y * 16 + x] * 0.8 + (x + y) / 30 * -0.2 + 0.2), x, y, 0.3, 1));
  // one plate per tile: lit top/left edge, dark bottom/right edge
  c.hl(0, 0, 16, MT[0]); c.vl(0, 0, 16, MT[0]);
  c.hl(1, 1, 15, MT[3]); c.vl(1, 1, 15, MT[3]);
  c.hl(2, 15, 14, MT[0]); c.vl(15, 2, 14, MT[0]);
  c.hl(2, 14, 13, MT[1]); c.vl(14, 2, 13, MT[1]);
  for (const [x, y] of [[3, 3], [10, 3], [3, 10], [10, 10]]) rivet(c, x, y, { shadow: MT[0], rim: MT[2], body: MT[4], hi: '#f4f2fc' });
  // rust weeps under two rivets, a scratch and a dent
  for (const [x, y] of [[4, 7], [4, 8], [11, 14]]) c.dot(x, y, '#6a4a38');
  c.dot(4, 9, '#6a4a38');
  c.dot(7, 6, MT[3]); c.dot(8, 7, MT[3]); c.dot(9, 8, MT[3]);
  c.hl(6, 12, 3, MT[0]); c.hl(7, 13, 2, MT[3]);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Window, door, banner
// ---------------------------------------------------------------------------------------------
function windowTex() {
  const c = new Canvas(16, 16, false, W[1]);
  // frame
  c.rect(0, 0, 16, 16, W[0]);
  c.rect(1, 1, 14, 14, W[2]);
  c.hl(1, 1, 13, W[4]); c.vl(1, 1, 13, W[4]);
  c.hl(2, 14, 13, W[1]); c.vl(14, 2, 13, W[1]);
  // glazing
  const panes = [[2, 2], [9, 2], [2, 9], [9, 9]];
  for (const [px, py] of panes) {
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const dx = px + x + 0.5 - 8, dy = py + y + 0.5 - 8;
        const d = Math.hypot(dx, dy);
        c.dot(px + x, py + y, dpick([AM[5], AM[4], AM[3], AM[2]], clamp(d / 9.5, 0, 1), px + x, py + y, 0));
      }
    }
    c.dot(px, py, AM[5]); c.dot(px + 1, py, AM[5]);
    // dark bottom/right lip of each pane
    c.hl(px, py + 5, 5, W[1]); c.vl(px + 5, py, 6, W[1]);
  }
  // muntins
  c.rect(7, 2, 2, 12, W[2]); c.rect(2, 7, 12, 2, W[2]);
  c.vl(7, 2, 12, W[4]); c.hl(2, 7, 12, W[4]);
  c.vl(8, 2, 12, W[1]); c.hl(2, 8, 12, W[1]);
  // sill
  c.hl(0, 15, 16, W[0]); c.hl(1, 14, 14, W[3]);
  return c;
}

function doorTex() {
  const c = new Canvas(16, 32, false, W[0]);
  // timber surround with grain
  for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) c.dot(x, y, ((x * 3 + y) % 5 === 0) ? W[1] : W[0]);
  // door opening: arch of radius 7 centred at (8, 9)
  const inside = (x, y) => {
    if (x < 1 || x > 14 || y > 31) return false;
    if (y >= 9) return true;
    const dx = x + 0.5 - 8, dy = y + 0.5 - 9;
    return dx * dx + dy * dy <= 7.3 * 7.3;
  };
  const planks = ['#c89c5a', '#b88c50', '#c89c5a', '#d0a866'];
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 16; x++) {
      if (!inside(x, y)) continue;
      const pi = Math.min(3, Math.floor((x - 1) / 3.5));
      let col = planks[pi];
      if (x === 1 + Math.round(pi * 3.5)) col = W[5]; // lit left edge of each plank
      c.dot(x, y, col);
    }
  }
  // plank seams and grain
  for (const sx of [4, 8, 11]) for (let y = 0; y < 30; y++) if (inside(sx, y)) c.dot(sx, y, W[1]);
  for (let y = 0; y < 30; y++) for (const gx of [2, 6, 9, 13]) if (inside(gx, y) && ((y * 3 + gx) % 7 < 2)) c.dot(gx, y, W[3]);
  // lit arch rim (frame edge)
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 16; x++) {
      if (inside(x, y)) continue;
      if (inside(x + 1, y) || inside(x, y + 1) || inside(x + 1, y + 1)) c.dot(x, y, W[3]);
    }
  }
  // dark inner edge just inside the arch
  for (let y = 0; y < 30; y++) for (let x = 0; x < 16; x++) if (inside(x, y) && (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1))) c.dot(x, y, W[1]);
  // iron bands with rivets
  const band = (y0) => {
    for (let x = 1; x < 15; x++) {
      c.dot(x, y0, MT[3]); c.dot(x, y0 + 1, MT[2]); c.dot(x, y0 + 2, MT[0]);
    }
    for (const x of [2, 7, 12]) { c.dot(x, y0 + 1, MT[4]); }
  };
  band(11); band(23);
  // strap hinge points (pointed at the free end)
  c.dot(9, 12, MT[2]); c.dot(10, 12, MT[1]);
  c.dot(9, 24, MT[2]); c.dot(10, 24, MT[1]);
  // ring handle on a back plate
  c.rect(10, 16, 3, 3, MT[0]); c.dot(10, 16, MT[2]);
  c.ellipse(11.5, 19.2, 1.8, 1.8, MT[4], false);
  c.dot(11, 20, MT[4]); c.dot(12, 20, MT[3]);
  // threshold
  c.rect(1, 30, 14, 2, PS[1]); c.hl(1, 30, 14, MT[3]);
  return c;
}

function bannerTex() {
  const c = new Canvas(16, 32, false, V[0]);
  const Gd = [AM[1], AM[2], AM[3], AM[4], AM[5]];
  // cloth
  c.rect(0, 2, 16, 26, V[2]);
  // vertical folds
  c.vl(4, 3, 24, V[1]); c.vl(11, 3, 24, V[1]);
  c.vl(5, 3, 24, V[3]); c.vl(12, 3, 24, V[3]);
  for (let y = 3; y < 27; y += 2) { c.dot(8, y, V[3]); c.dot(2, y + 1, V[1]); }
  // top hem + pole
  c.rect(0, 0, 16, 2, W[2]);
  c.hl(0, 0, 16, W[4]); c.hl(0, 1, 16, W[1]);
  c.dot(0, 0, W[5]); c.dot(15, 0, W[1]);
  c.hl(0, 2, 16, V[1]);
  // gold border
  c.hl(1, 4, 14, Gd[2]); c.hl(1, 26, 14, Gd[1]);
  c.vl(1, 4, 23, Gd[2]); c.vl(14, 4, 23, Gd[1]);
  c.dot(1, 4, Gd[3]); c.dot(14, 26, Gd[0]);
  // lantern emblem, 8 wide
  const key = { g: Gd[3], G: Gd[1], A: AM[4], a: AM[5], o: Gd[2] };
  const emblem = [
    '..oooo..',
    '.gGGGGo.',
    '..gGGo..',
    '.gGAaGo.',
    '.gAaaAo.',
    '.gAaaAo.',
    '.gGAAGo.',
    '.gGGGGo.',
    '..gGGo..',
    '...GG...',
  ];
  c.stamp(4, 9, emblem, key);
  // hanging loop of light above the lantern
  c.dot(7, 7, Gd[3]); c.dot(8, 7, Gd[1]); c.dot(7, 8, Gd[3]); c.dot(8, 8, Gd[1]);
  // little diamonds under the emblem
  c.dot(7, 21, Gd[3]); c.dot(8, 21, Gd[2]);
  c.dot(6, 22, Gd[3]); c.dot(9, 22, Gd[2]); c.dot(7, 22, Gd[2]); c.dot(8, 22, Gd[1]);
  c.dot(7, 23, Gd[2]); c.dot(8, 23, Gd[1]);
  // fringe
  c.rect(0, 28, 16, 4, V[0]);
  for (let x = 0; x < 16; x += 2) {
    c.vl(x, 28, 4, Gd[3]);
    c.dot(x, 31, Gd[1]);
    c.vl(x + 1, 28, 3, Gd[2]);
  }
  return c;
}

export function buildingTextures() {
  return {
    brick: rec(brick(), true, false, { roll: 'xy' }),
    brick_warm: rec(brickWarm(), true, false, { roll: 'xy' }),
    brick_mossy: rec(brickMossy(), true, false, { roll: 'xy' }),
    plaster: rec(plaster(), true, false),
    timber: rec(timber(), true, false),
    wood_plank: rec(woodPlank(), true, false, { roll: 'xy' }),
    wood_beam: rec(woodBeam(), true, false),
    roof_red: rec(roofRed(), true, false, { roll: 'xy' }),
    roof_teal: rec(roofTeal(), true, false, { roll: 'xy' }),
    thatch: rec(thatch(), true, false),
    tower_stone: rec(towerStone(), true, false, { roll: 'xy' }),
    metal_brass: rec(metalBrass(), true, false),
    metal_iron: rec(metalIron(), true, false),
    window: rec(windowTex(), false, false),
    door: rec(doorTex(), false, false),
    banner: rec(bannerTex(), false, false),
  };
}
