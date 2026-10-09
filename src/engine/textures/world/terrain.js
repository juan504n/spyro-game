// Terrain textures: meadows, moss, dirt, sand, pebbles, paths, cliffs, rune ring.
import { RAMPS } from '../palette.js';
import {
  Canvas, RNG, field, bandPick, dpick, poisson, lattice, cells, walk, polyline, shuffled, rampIndexer, rec, clamp, LX, LY,
} from './kit.js';

const G = RAMPS.grass, GT = RAMPS.grassTeal, M = RAMPS.moss, D = RAMPS.dirt, S = RAMPS.sand;
const PS = RAMPS.pathStone, CL = RAMPS.cliff, CW = RAMPS.cliffWarm;

// ---------------------------------------------------------------------------------------------
// Grass. One painter for the sunlit meadow, the lush teal grass and the flower meadow so that they
// blend when terrain tiles of different kinds sit next to each other.  R = 6-step ramp, dark -> light.
// ---------------------------------------------------------------------------------------------
// tuft stamps: a = main stroke colour, b = tip colour; anchored at the bottom centre
const TUFTS = [
  ['b', 'a', 'a'],
  ['.b', 'ba', 'a.'],
  ['b.', 'ab', '.a'],
  ['b.b', 'a.a', '.a.'],
  ['b', 'a'],
  ['b.b', 'a.a', 'a.a'],
  ['b...b', '.a.a.', '..a..'],
  ['..b', '.ab', 'aa.'],
];

function stampRoles(c, x, y, rows, roles, flip) {
  const w = rows[0].length;
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i < w; i++) {
      const ch = rows[j][flip ? w - 1 - i : i];
      const col = roles[ch];
      if (col) c.set(x + i - (w >> 1), y + j - rows.length + 1, col);
    }
  }
}

function paintGrass(seed, R, opts = {}) {
  const c = new Canvas(32, 32, true, R[3]);
  const rng = new RNG(seed);
  const f = field(32, 32, seed + 1, opts.cells ?? 3, opts.cells ?? 3, 2);
  const tones = [R[2], R[3], R[3], R[3], R[3], R[3], R[3], R[3], R[4]]; // ~11% dark patch, ~11% light patch
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) c.set(x, y, bandPick(tones, f[y * 32 + x], x, y, opts.w ?? 0.35, 1));
  }
  const dark = { a: R[1], b: R[2] };
  const light = { a: R[4], b: R[5] };
  // blue-noise placement (no visible lattice when the tile repeats); mostly dark strokes, some light ones
  const pts = poisson(rng, 32, 32, opts.tufts ?? 36, opts.minD ?? 3.4).map(([x, y]) => [x, y + 2]);
  pts.forEach(([x, y], i) => {
    const rows = rng.chance(0.62) ? TUFTS[rng.int(0, 3)] : TUFTS[rng.int(3, TUFTS.length)];
    stampRoles(c, x, y, rows, i % 4 === 3 ? light : dark, rng.chance(0.5));
  });
  return { c, rng, pts };
}

const GA = RAMPS.meadow; // the meadow's ramp: the one grass of the Vale, averaging #3d8732
const GB = [GT[0], GT[1], GT[2], '#4faf70', '#7cd08c', '#b0eeb4']; // lush teal ramp

function grassA() { return paintGrass(1101, GA).c; }

function grassB() {
  const { c, rng } = paintGrass(1202, GB, { cells: 4 });
  // tiny clover clusters: three 2px leaves round a light dot
  for (const [x, y] of poisson(rng, 32, 32, 5, 9)) {
    const leaf = (lx, ly) => {
      c.rect(lx, ly, 2, 2, GB[4]);
      c.dot(lx, ly, GB[5]);
      c.dot(lx + 1, ly + 1, GB[2]);
    };
    leaf(x, y); leaf(x + 3, y); leaf(x + 1, y + 3);
    c.dot(x + 2, y + 2, GB[1]);
    c.dot(x + 2, y + 1, GB[3]);
  }
  return c;
}

function grassFlowers() {
  const { c } = paintGrass(1101, GA, {});
  const rng = new RNG(1150);
  // [petal, centre]
  const kinds = [
    ['#f4f0e8', '#ffc03c'], ['#e86a68', '#fff6c0'], ['#ffc03c', '#c05a14'], ['#5a8cf0', '#fff6c0'],
    ['#f4f0e8', '#ffc03c'], ['#e86a68', '#fff6c0'],
  ];
  const spots = poisson(rng, 32, 32, 5, 10);
  spots.forEach(([x, y], i) => {
    const [a, b] = kinds[i % kinds.length];
    c.dot(x + 1, y, a); c.dot(x, y + 1, a); c.dot(x + 2, y + 1, a); c.dot(x + 1, y + 2, a);
    c.dot(x + 1, y + 1, b);
    c.dot(x + 1, y + 3, GA[1]); // stem
    c.dot(x, y + 3, GA[2]);
  });
  return c;
}

// ---------------------------------------------------------------------------------------------
// Cushion moss / damp forest floor
// ---------------------------------------------------------------------------------------------
function paintMoss() {
  const c = new Canvas(32, 32, true, M[3]);
  const rng = new RNG(1301);
  const f = field(32, 32, 1302, 4, 4, 2);
  const tones = [M[2], M[2], M[3], M[3], M[3]];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.set(x, y, bandPick(tones, f[y * 32 + x], x, y, 0.4, 1));
  // cushions, back to front
  const pads = poisson(rng, 32, 32, 20, 5).sort((a, b) => a[1] - b[1]);
  for (const [x, y] of pads) {
    const rx = rng.pick([2.7, 3, 3.4, 3.6]), ry = rx - rng.pick([0.3, 0.7]);
    c.blob(x, y, rx, ry, M[2], M[4], '#c0d86c');
    if (rng.chance(0.5)) { c.dot(x - 1, y - 1, '#d8e888'); c.dot(x - 2, y, '#c0d86c'); }
  }
  // twigs and pale wet glints
  for (const [x, y] of poisson(rng, 32, 32, 2, 12)) { c.dot(x, y, D[2]); c.dot(x + 1, y + 1, D[2]); c.dot(x + 2, y + 1, D[1]); }
  for (const [x, y] of poisson(rng, 32, 32, 4, 7)) c.dot(x, y, '#d4e8c4');
  return c;
}

// ---------------------------------------------------------------------------------------------
// Packed earth
// ---------------------------------------------------------------------------------------------
function paintDirt(DD = D, seed = 1401, peb = { h: '#e0dbe4', b: '#a09aa8' }) {
  const D = DD;
  const c = new Canvas(32, 32, true, D[3]);
  const rng = new RNG(seed);
  const f = field(32, 32, seed + 1, 4, 4, 2);
  const tones = [D[2], D[3], D[3], D[4], D[4]];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.set(x, y, bandPick(tones, f[y * 32 + x], x, y, 0.4, 1));
  // hairline cracks
  for (let i = 0; i < 3; i++) {
    const p = walk(rng, rng.int(0, 32), rng.int(0, 32), rng.int(7, 12), [rng.float(-0.9, 0.9), rng.float(-0.4, 0.4)], 0.8);
    polyline(c, p, D[1]);
    for (const [x, y] of p) if (rng.chance(0.4)) c.dot(x + 1, y + 1, D[4]);
  }
  // pebbles: hand-drawn 3-4px stones (lit top-left, shaded bottom, drop shadow); ellipses this small turn into plus signs
  const PEBBLES = [['.hb.', 'bbbd', '.dd.'], ['hbb', 'bbd', '.dd'], ['hb', 'bd']];
  for (const [x, y] of poisson(rng, 32, 32, 8, 5)) {
    const key = { h: peb.h, b: rng.chance(0.5) ? peb.b : D[5], d: D[1] };
    c.stamp(x, y, rng.pick(PEBBLES), key);
    c.dot(x + 1, y + 3, D[1]);
  }
  // grit
  for (const [x, y] of poisson(rng, 32, 32, 16, 3)) c.dot(x, y, rng.chance(0.5) ? D[1] : D[5]);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Beach sand with ripples and glints
// ---------------------------------------------------------------------------------------------
function paintSand() {
  const c = new Canvas(32, 32, true, S[1]);
  const rng = new RNG(1501);
  const f = field(32, 32, 1502, 3, 3, 2);
  const tones = [S[0], S[1], S[1], S[1], S[2], S[2]];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.set(x, y, bandPick(tones, f[y * 32 + x], x, y, 0.4, 1));
  // ripple ridges: dark trough line with a light crest line under it
  [4, 14, 24].forEach((y0, r) => {
    const amp = 1 + (r % 2), cyc = 1 + (r % 2), ph = r * 1.9;
    for (let x = 0; x < 32; x++) {
      const off = Math.round(Math.sin((x / 32) * Math.PI * 2 * cyc + ph) * amp);
      if (((x * 7 + r * 11) % 17) < 3) continue; // broken now and then
      c.dot(x, y0 + off, S[0]);
      c.dot(x, y0 + off + 1, S[3]);
      if ((x + r) % 3 === 0) c.dot(x, y0 + off + 2, S[2]);
    }
  });
  for (const [x, y] of poisson(rng, 32, 32, 7, 6)) {
    c.dot(x, y, '#fffbe8');
    if (rng.chance(0.4)) { c.dot(x + 1, y, S[4]); c.dot(x - 1, y, S[4]); c.dot(x, y + 1, S[4]); c.dot(x, y - 1, S[4]); }
  }
  for (const [x, y] of poisson(rng, 32, 32, 10, 4)) c.dot(x, y, S[0]);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Wet shore pebbles: overlapping ovals with drop shadows on dark wet mud
// ---------------------------------------------------------------------------------------------
const PEB_BLUE = { d: '#64789a', m: '#88a0be', l: '#b4c8dc' };
const PEB_LAV = { d: PS[2], m: PS[3], l: PS[4] };
const PEB_BROWN = { d: '#7a5834', m: '#9a7444', l: '#b8925a' };
function paintPebbles() {
  const MUD = '#44506c';
  const c = new Canvas(32, 32, true, MUD);
  const rng = new RNG(1601);
  const fams = [PEB_BLUE, PEB_LAV, PEB_BROWN];
  // back layer: smaller, darker stones filling the gaps
  const back = lattice(rng, 32, 32, 5, 5, 1.6, 0.5).sort((a, b) => a[1] - b[1]);
  for (const [x, y] of back) {
    const p = rng.pick(fams);
    c.blob(x, y, rng.float(2.6, 3.2), rng.float(2.2, 2.7), MUD, p.d, p.m);
  }
  // front layer: a shuffled deck so no colour runs along a row (7 blue, 5 lavender, 4 brown)
  const pts = lattice(rng, 32, 32, 4, 4, 1.4, 0.5);
  const order = shuffled(rng, pts.map((_, i) => i));
  const deck = [];
  for (let i = 0; i < pts.length; i++) deck[order[i]] = i < 7 ? PEB_BLUE : i < 12 ? PEB_LAV : PEB_BROWN;
  const list = pts.map((pt, i) => ({ x: pt[0], y: pt[1], p: deck[i] })).sort((a, b) => a.y - b.y);
  for (const { x, y, p } of list) {
    const rx = rng.float(4.0, 5.0), ry = rng.float(3.2, 4.1);
    c.ellipse(x + 1, y + 1, rx + 0.4, ry + 0.4, MUD);
    c.blob(x, y, rx, ry, p.d, p.m, p.l);
    // wet gloss
    c.dot(Math.floor(x - rx * 0.45), Math.floor(y - ry * 0.5), '#e4f0f8');
    if (rng.chance(0.5)) c.dot(Math.floor(x - rx * 0.45) + 1, Math.floor(y - ry * 0.5), '#8fb4d0');
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Cobblestone path
// ---------------------------------------------------------------------------------------------
function paintCobble(o = {}) {
  const PS = o.ramp || RAMPS.pathStone, M = o.moss || RAMPS.moss, seed = o.seed || 1701;       // (a realm's own stone and its own growth in the gaps: moss, or snow)
  const c = new Canvas(32, 32, true);
  const rng = new RNG(seed);
  const pts = lattice(rng, 32, 32, 4, 4, 1.6, 0.5);
  const V = cells(32, 32, pts);
  const moss = field(32, 32, seed + 1, 7, 7, 1);
  const fams = o.fams || [
    { d: PS[3], m: PS[4], l: PS[5] },
    { d: '#b0a4ae', m: '#cfc4ca', l: '#f0e4de' },
    { d: PS[3], m: PS[4], l: PS[5] },
    { d: PS[2], m: PS[3], l: PS[4] },
  ];
  const fam = pts.map(() => rng.pick(fams));
  const MORTAR = PS[1], MORTAR2 = PS[0];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const k = y * 32 + x;
      const e = V.d2[k] - V.d1[k];
      const round = 0.05 * V.d1[k] * V.d1[k];
      if (e < 1.5 + round) {
        // mortar; moss creeps into some gaps
        c.set(x, y, moss[k] > 0.87 ? M[2] : ((x * 7 + y * 3) % 11) === 0 ? MORTAR2 : MORTAR);
        continue;
      }
      const p = fam[V.id[k]];
      const nx = V.vx[k], ny = V.vy[k], nl = Math.hypot(nx, ny) || 1;
      const lit = (nx * LX + ny * LY) / nl;
      const near = e < 3.1 + round;
      let col = p.m;
      if (near && lit > 0.3) col = p.l; else if (near && lit < -0.3) col = p.d;
      if (near && lit < -0.3 && moss[k] > 0.91) col = M[3];
      c.set(x, y, col);
    }
  }
  // stone speckle
  for (const [x, y] of poisson(rng, 32, 32, 14, 3)) {
    const k = y * 32 + x;
    if (V.d2[k] - V.d1[k] > 3.5) c.dot(x, y, rng.chance(0.5) ? PS[5] : PS[3]);
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Flagstone plaza, 2x2 big slabs per tile
// ---------------------------------------------------------------------------------------------
function paintFlagstone() {
  const c = new Canvas(32, 32, true, PS[0]);
  const rng = new RNG(1801);
  const f = field(32, 32, 1802, 4, 4, 2);
  const slab = [
    { base: PS[3], alt: PS[2], spot: PS[4] },
    { base: PS[4], alt: PS[3], spot: PS[5] },
    { base: PS[3], alt: PS[4], spot: PS[2] },
    { base: PS[2], alt: PS[3], spot: PS[4] },
  ];
  const chip = [[0, 1, 0, 1], [1, 0, 1, 1], [1, 1, 0, 0], [0, 0, 1, 1]]; // which corners are worn
  for (let sy = 0; sy < 2; sy++) {
    for (let sx = 0; sx < 2; sx++) {
      const i = sy * 2 + sx;
      const x0 = sx * 16, y0 = sy * 16;
      const s = slab[i];
      for (let y = 0; y < 15; y++) {
        for (let x = 0; x < 15; x++) {
          const t = f[((y0 + y + i * 5) % 32) * 32 + ((x0 + x + i * 3) % 32)];
          // two flat tones with hard, stair-stepped edges: a worn patch, not a dithered stipple
          c.set(x0 + x, y0 + y, t > 0.72 ? s.alt : s.base);
        }
      }
      // bevel: lit top/left, shaded bottom/right
      c.hl(x0, y0, 15, PS[5]);
      c.vl(x0, y0, 15, PS[5]);
      c.hl(x0 + 1, y0 + 14, 14, PS[2]);
      c.vl(x0 + 14, y0 + 1, 14, PS[2]);
      c.hl(x0 + 2, y0 + 13, 12, s.alt);
      c.vl(x0 + 13, y0 + 2, 12, s.alt);
      // worn corners: a dark chip of 3-4 pixels
      const [tl, tr, bl, br] = chip[i];
      const chipAt = (cx, cy, dx, dy) => {
        c.dot(cx, cy, PS[1]); c.dot(cx + dx, cy, PS[1]); c.dot(cx, cy + dy, PS[1]);
        c.dot(cx + dx, cy + dy, s.alt);
      };
      if (tl) chipAt(x0, y0, 1, 1);
      if (tr) chipAt(x0 + 14, y0, -1, 1);
      if (bl) chipAt(x0, y0 + 14, 1, -1);
      if (br) chipAt(x0 + 14, y0 + 14, -1, -1);
      // pits: a dark pixel with a lit lip
      for (const [gx, gy] of poisson(rng, 11, 11, 3, 4)) { c.dot(x0 + 2 + gx, y0 + 2 + gy, s.alt); c.dot(x0 + 3 + gx, y0 + 3 + gy, s.spot); }
    }
  }
  // edge cracks, one per slab except the fresh one
  const cracks = [[6, 0, 0.2], null, [2, 16, 0.6], [30, 16, -0.6]];
  cracks.forEach((cr, i) => {
    if (!cr) return;
    const p = walk(rng, cr[0], cr[1], 6 + i, [cr[2], 0.9], 0.6);
    polyline(c, p, PS[1]);
    for (const [px, py] of p) if (rng.chance(0.4)) c.dot(px + 1, py, PS[5]);
  });
  // grime and a little moss in the joints
  for (const [x, y] of [[15, 5], [15, 6], [5, 15], [6, 15], [23, 31], [24, 31], [31, 22], [31, 23]]) c.dot(x, y, M[2]);
  for (const [x, y] of [[15, 12], [9, 31], [31, 9], [15, 22]]) c.dot(x, y, D[1]);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Ice: big pale plates under a skin of frost, dark blue cracks between them, a bright lip on each plate's lit edge and a few glints (the floor of the homeworld's Frost Grotto)
// ---------------------------------------------------------------------------------------------
function paintIce() {
  const c = new Canvas(32, 32, true);
  const rng = new RNG(2101);
  const pts = lattice(rng, 32, 32, 3, 3, 1.9, 0.5);
  const V = cells(32, 32, pts);
  const frost = field(32, 32, 2102, 6, 6, 1);
  const I = RAMPS.crystalCyan;
  const fams = [
    { d: '#5aa8d0', m: '#8cd0ec', l: '#d8f4ff' },
    { d: '#6ab4da', m: '#a0dcf2', l: '#eafcff' },
    { d: '#4a98c4', m: '#7cc4e4', l: '#c8eefc' },
  ];
  const fam = pts.map(() => rng.pick(fams));
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const k = y * 32 + x;
      const e = V.d2[k] - V.d1[k];
      if (e < 1.5) { c.set(x, y, ((x * 5 + y * 3) % 7) === 0 ? I[0] : I[1]); continue; }          // the crack
      const p = fam[V.id[k]];
      const nx = V.vx[k], ny = V.vy[k], nl = Math.hypot(nx, ny) || 1;
      const lit = (nx * LX + ny * LY) / nl;
      let col = p.m;
      if (e < 3.2 && lit > 0.25) col = p.l; else if (e < 3.2 && lit < -0.25) col = p.d;
      else if (frost[k] > 0.72) col = p.l; else if (frost[k] < 0.22) col = p.d;               // frosted patches, and clearer ice below
      c.set(x, y, col);
    }
  }
  // glints and long hairline cracks across the plates
  for (const [x, y] of poisson(rng, 32, 32, 10, 3)) if (V.d2[y * 32 + x] - V.d1[y * 32 + x] > 3.5) { c.dot(x, y, '#ffffff'); c.dot(x + 1, y, I[4]); }
  for (let i = 0; i < 3; i++) {
    const p = walk(rng, rng.int(0, 32), rng.int(0, 32), 8 + i * 2, [rng.float(-1, 1), rng.float(-1, 1)], 0.7);
    polyline(c, p, I[2]);
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Snow (Frostbloom Hollow): soft drifts in blue-white with hollows in shadow-blue, short wind ripples under a bright lip, a scatter of glints. The petals variant has blossom petals blown over
// it: the first of the spring the realm is waiting for.
// ---------------------------------------------------------------------------------------------
const SN = ['#8aa2cc', '#a6bcdc', '#c4d6ec', '#dde9f6', '#f0f6fd', '#ffffff'];
function paintSnow(seed, petals) {
  const c = new Canvas(32, 32, true, SN[3]);
  const rng = new RNG(seed);
  const f = field(32, 32, seed + 1, 3, 3, 2);
  const tones = [SN[2], SN[3], SN[3], SN[3], SN[3], SN[4], SN[4], SN[2], SN[5]];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.set(x, y, bandPick(tones, f[y * 32 + x], x, y, 0.4, 1));
  for (let i = 0; i < 7; i++) {
    const p = walk(rng, rng.int(0, 32), rng.int(0, 32), rng.int(6, 11), [1, rng.float(-0.3, 0.3)], 0.35);
    polyline(c, p, SN[1]);
    for (const [x, y] of p) if (rng.chance(0.55)) c.dot(x, y - 1, SN[5]);
  }
  for (const [x, y] of poisson(rng, 32, 32, 12, 3)) { c.dot(x, y, SN[5]); if (rng.chance(0.5)) c.dot(x + 1, y, SN[4]); }
  if (petals) {
    for (const [x, y] of poisson(rng, 32, 32, 7, 6)) { c.dot(x, y, '#f4a0c4'); c.dot(x + 1, y, '#ffd0e4'); c.dot(x, y + 1, '#e070a0'); if (rng.chance(0.5)) c.dot(x + 2, y + 1, '#f4a0c4'); }
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Cliff faces: tall faceted rock, strata bands, cracks, moss along the top edge
// (the tile wraps, so a few moss specks also sit on the bottom rows)
// ---------------------------------------------------------------------------------------------
function paintCliff(seed, P, mossy) {
  const W = 32;
  const R = P.ramp;
  const c = new Canvas(W, W, true, R[3]);
  const rng = new RNG(seed);
  // strata: broad tonal bands whose boundaries wobble (the wobble wraps in x)
  const bandH = [8, 6, 7, 5, 6];
  const bandTone = [4, 3, 4, 2, 3];
  const wob = field(W, 1, seed + 5, 4, 1, 1, false);
  const edge = [];
  let acc = 0;
  for (const h of bandH) { edge.push(acc); acc += h; }
  const wv = (x) => Math.round((wob[x] - 0.5) * 4);
  for (let x = 0; x < W; x++) {
    for (let b = 0; b < bandH.length; b++) {
      const y0 = edge[b] + wv(x), y1 = (b + 1 < bandH.length ? edge[b + 1] : W) + wv(x);
      for (let y = y0; y < y1; y++) c.dot(x, y, R[bandTone[b]]);
    }
  }
  // chunky outcrops bulging out of the face: cast shadow, shaded boulder, lit top
  for (const [x, y] of poisson(rng, W, W, 5, 9).sort((a, b) => a[1] - b[1])) {
    const rx = rng.float(4.2, 6), ry = rng.float(2.4, 3.3);
    c.ellipse(x + 0.5, y + 2, rx + 0.5, ry, R[2]);
    c.blob(x, y, rx, ry, R[2], R[4], R[5]);
    c.dot(Math.floor(x - rx * 0.4), Math.floor(y - ry * 0.5), R[5]);
  }
  // vertical weathering streaks: a few 2px-wide runs, one ramp step darker or lighter (chunky, not speckle)
  const idxOf = rampIndexer(R);
  for (let i = 0; i < 6; i++) {
    const x = rng.int(0, W), y = rng.int(0, W), len = rng.int(8, 15);
    const dark = rng.chance(0.6);
    for (let j = 0; j < len; j++) {
      for (let k = 0; k < 2; k++) {
        const idx = idxOf(c.get(x + k, y + j, true));
        if (idx >= 0) c.dot(x + k, y + j, R[clamp(idx + (dark ? -1 : 1), 0, 5)]);
      }
    }
  }
  // ledges: a continuous dark undercut with a lit lip just below it - bold terraces that survive minification
  edge.forEach((y0) => {
    for (let x = 0; x < W; x++) {
      c.dot(x, y0 + wv(x) - 1, R[1]);
      c.dot(x, y0 + wv(x), R[5]);
    }
  });
  // vertical fissures with a lit right-hand lip
  for (let i = 0; i < 2; i++) {
    const p = walk(rng, rng.int(0, W), rng.int(0, W), rng.int(10, 15), [rng.float(-0.2, 0.2), 1], 0.5);
    polyline(c, p, R[0]);
    for (const [x, y] of p) if (rng.chance(0.6)) c.dot(x + 1, y, R[5]);
  }
  if (mossy) {
    // A moss ledge that straddles the wrap seam: a lit cap on the last two rows, drips hanging from row 0.
    // Tiled vertically it reads as a continuous mossy shelf, not a cut.
    const MC = P.lip || [M[1], M[2], M[3], M[4]];                 // (a level of ice and snow has a lip of snow: P.lip)
    const n = field(W, 1, seed + 9, 8, 1, 1, false);
    for (let x = 0; x < W; x++) {
      const hgt = Math.round(1 + n[x] * 3.4);
      c.dot(x, 30, MC[3]);
      c.dot(x, 31, MC[2]);
      if (n[x] < 0.4) c.dot(x, 29, MC[1]);
      for (let y = 0; y < hgt; y++) c.dot(x, y, MC[y === 0 ? 2 : y === hgt - 1 ? 1 : 2]);
      if (n[x] > 0.6) c.dot(x, hgt, MC[0]);
    }
  }
  return c;
}

function cliffLav() { return paintCliff(1901, { ramp: [CL[0], CL[1], CL[2], CL[3], CL[4], CL[5]] }, true); }
function cliffWarm() { return paintCliff(1951, { ramp: [CW[0], CW[1], CW[2], CW[3], CW[4], '#dcc4a0'] }, true); }
// the tall mountains of the homeworld: the same strata, ledges and fissures with no moss lip along every band (a lip repeating every 4 m up a 60 m wall reads as stripes)
// the rock of Frostbloom Hollow: blue-grey strata under a lip of snow
const FR = ['#222c46', '#34425f', '#4c5f82', '#6c82a6', '#94aac8', '#c8d8ee'];
function cliffFrost() { return paintCliff(2301, { ramp: FR, lip: ['#8aa6d0', '#b4cae8', '#dceafa', '#ffffff'] }, true); }

function cliffBare() { return paintCliff(2011, { ramp: [CL[0], CL[1], CL[2], CL[3], CL[4], CL[5]] }, false); }
function cliffWarmBare() { return paintCliff(2051, { ramp: [CW[0], CW[1], CW[2], CW[3], CW[4], '#dcc4a0'] }, false); }

// ---------------------------------------------------------------------------------------------
// Far rock: 3 close colours, big soft patches, no fine detail so distant mountains read smooth
// ---------------------------------------------------------------------------------------------
function paintFarRock(seed = 2001, cols = ['#7a7490', '#8a849e', '#9a94ae']) {
  const c = new Canvas(32, 32, true);
  const f = field(32, 32, seed, 2, 4, 2);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.set(x, y, bandPick([cols[0], cols[1], cols[1], cols[2]], f[y * 32 + x], x, y, 0.5, 1));
  return c;
}

// ---------------------------------------------------------------------------------------------
// Rune ring: dark slab with a pale glowing arcane circle
// ---------------------------------------------------------------------------------------------
function paintRuneRing() {
  // A dark slab (the game also draws this texture additively for the glow, so keep the slab well below the ring).
  const SLAB = '#34314a';
  const c = new Canvas(32, 32, false, SLAB);
  const V = RAMPS.crystalViolet;
  const f = field(32, 32, 2102, 4, 4, 2, true);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.set(x, y, f[y * 32 + x] > 0.72 ? CL[1] : SLAB);
  c.hl(0, 0, 32, CL[2]); c.vl(0, 0, 32, CL[2]);
  c.hl(0, 31, 32, CL[0]); c.vl(31, 0, 32, CL[0]);
  c.hl(1, 1, 30, CL[1]); c.vl(1, 1, 30, CL[1]);
  const cx = 16, cy = 16;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const r = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      if (r > 5 && r < 14.6) {
        const halo = clamp(1 - Math.abs(r - 11.5) / 3.6, 0, 1);
        if (halo > 0.05) {
          const q = dpick([SLAB, V[0], V[1]], halo * 0.9, x, y, 1);
          if (q !== SLAB) c.set(x, y, q);
        }
      }
      if (r > 12.3 && r < 14.1) c.set(x, y, r < 13.2 ? V[5] : V[4]);
      if (r > 8.4 && r < 9.4) c.set(x, y, V[4]);
      if (r > 14.1 && r < 14.9) c.set(x, y, V[2]);
      const seg = ((ang + Math.PI) / (Math.PI / 4));
      const near = Math.abs(seg - Math.round(seg));
      if (r > 9.6 && r < 12.1 && near < 0.11 && Math.round(seg) % 2 === 0) c.set(x, y, V[3]);
      if (r > 9.6 && r < 11.2 && near < 0.11 && Math.round(seg) % 2 === 1) c.set(x, y, V[4]);
    }
  }
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    const x = Math.round(cx + Math.cos(a) * 11.2 - 0.5), y = Math.round(cy + Math.sin(a) * 11.2 - 0.5);
    c.dot(x, y, V[5]);
    c.dot(x + 1, y, V[3]); c.dot(x, y + 1, V[3]);
  }
  c.circle(cx, cy, 5.2, CL[0]);
  c.circle(cx, cy, 5.2, V[3], false);
  c.circle(cx, cy, 3.2, V[1]);
  c.circle(cx - 0.5, cy - 0.5, 1.6, V[4]);
  c.dot(15, 15, V[5]);
  return c;
}

/**
 * The Guardian's Court (guardian/layout.js `court_runes`): the rings of runes in its floor, drawn ADDITIVELY (black is nothing, the rings are light), one disc of it the size of the court. Three rings
 * (a thin one at 0.38 of the radius, a broad one at 0.63 - where the pillars stand - and a bright one at 0.8), eight ticks between the outer two, a dot on the bright one every 22.5 degrees and a star
 * in the middle. Not tiled; 64 x 64, like the other glow textures.
 */
function paintCourtRunes() {
  const N = 64, c = new Canvas(N, N, false, '#000000'), V = RAMPS.crystalViolet, G = ['#5a3a10', '#a87818', '#e8b83c', '#fff0a0'];
  const cx = N / 2, cy = N / 2, R = N / 2 - 1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy) / R, ang = Math.atan2(dy, dx);
      let k = null;
      const ring = (r0, w, col, halo = 0) => {
        const d = Math.abs(r - r0);
        if (d < w) k = col; else if (halo && d < w + halo && !k) k = V[1];
      };
      ring(0.38, 0.012, V[3], 0.02);
      ring(0.63, 0.03, V[4], 0.025);
      ring(0.8, 0.018, V[5], 0.03);
      ring(0.955, 0.012, V[2]);
      const seg = (ang + Math.PI) / (Math.PI / 4), near = Math.abs(seg - Math.round(seg));
      if (r > 0.66 && r < 0.77 && near < 0.07) k = V[3];                                      // (the eight ticks, between the broad ring and the bright one)
      const dot = (ang + Math.PI) / (Math.PI / 8), nd = Math.abs(dot - Math.round(dot));
      if (Math.abs(r - 0.8) < 0.05 && nd * r * (Math.PI / 8) * R < 0.9) k = G[3];              // (the gold dots on the bright ring)
      if (r < 0.14) k = Math.abs(((ang + Math.PI) / (Math.PI / 4)) % 1 - 0.5) < 0.18 ? G[2] : r < 0.07 ? G[1] : V[2];   // (the star in the middle)
      if (k) c.set(x, y, k);
    }
  }
  return c;
}


// ---------------------------------------------------------------------------------------------
// Ash and cinder (Emberfall Crags): the ground of the burnt country. Ash is warm grey drifts with wind ripples, clinker (dark cinders) and pale flecks; cinder is scorched earth, nearly black,
// its cracks glowing where the fire has not gone out. Basalt is the rock: dark strata under a lip of ash, with a hairline of ember in its fissures.
// ---------------------------------------------------------------------------------------------
const AS = ['#2e2824', '#443c36', '#5e5349', '#7a6d60', '#9a8c7c', '#bcae9c'];
function paintAsh(seed) {
  const c = new Canvas(32, 32, true, AS[2]);
  const rng = new RNG(seed);
  const f = field(32, 32, seed + 1, 3, 3, 2);
  const tones = [AS[1], AS[2], AS[2], AS[2], AS[3], AS[3], AS[2], AS[4]];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.set(x, y, bandPick(tones, f[y * 32 + x], x, y, 0.4, 1));
  // wind ripples in the ash: short runs along U with a pale lip
  for (let i = 0; i < 7; i++) {
    const p = walk(rng, rng.int(0, 32), rng.int(0, 32), rng.int(6, 11), [1, rng.float(-0.3, 0.3)], 0.35);
    polyline(c, p, AS[1]);
    for (const [x, y] of p) if (rng.chance(0.55)) c.dot(x, y - 1, AS[4]);
  }
  // clinker: dark cinders a few pixels across, lit on top
  const CLINKER = [['.hb.', 'bbbd', '.dd.'], ['hb', 'bd'], ['hbb', 'bbd', '.dd']];
  for (const [x, y] of poisson(rng, 32, 32, 7, 5)) c.stamp(x, y, rng.pick(CLINKER), { h: AS[4], b: AS[1], d: AS[0] });
  for (const [x, y] of poisson(rng, 32, 32, 12, 3)) { c.dot(x, y, AS[5]); if (rng.chance(0.4)) c.dot(x + 1, y, AS[4]); }
  // an ember or two that has not gone out
  for (const [x, y] of poisson(rng, 32, 32, 2, 12)) { c.dot(x, y, '#c4501a'); c.dot(x + 1, y, '#7a2410'); }
  return c;
}

const CB = ['#120e0c', '#1e1613', '#2e221c', '#44322a', '#5c4538'];
function paintCinder(seed) {
  const c = new Canvas(32, 32, true, CB[1]);
  const rng = new RNG(seed);
  const f = field(32, 32, seed + 1, 4, 4, 2);
  const tones = [CB[0], CB[1], CB[1], CB[2], CB[2], CB[3]];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.set(x, y, bandPick(tones, f[y * 32 + x], x, y, 0.4, 1));
  // slag crust: pale ridges where the ground has buckled
  for (let i = 0; i < 5; i++) {
    const p = walk(rng, rng.int(0, 32), rng.int(0, 32), rng.int(6, 10), [1, rng.float(-0.5, 0.5)], 0.5);
    polyline(c, p, CB[3]);
    for (const [x, y] of p) if (rng.chance(0.4)) c.dot(x, y - 1, CB[4]);
  }
  // cracks with a fire in them: dark edge, orange core, a white-hot spot here and there
  for (let i = 0; i < 4; i++) {
    const p = walk(rng, rng.int(0, 32), rng.int(0, 32), rng.int(8, 13), [rng.float(-0.9, 0.9), rng.float(-0.9, 0.9)], 0.8);
    polyline(c, p, '#5a1a0c');
    for (const [x, y] of p) { c.dot(x, y, rng.chance(0.3) ? '#ffb040' : '#e8661c'); if (rng.chance(0.15)) c.dot(x, y, '#ffe49a'); }
  }
  for (const [x, y] of poisson(rng, 32, 32, 12, 3)) c.dot(x, y, rng.chance(0.5) ? CB[4] : CB[0]);
  return c;
}

const BA = ['#0e0b0a', '#1a1411', '#2a211c', '#40322a', '#5a4638', '#86705c'];
function cliffBasalt(mossy = true) {
  const c = paintCliff(mossy ? 2701 : 2711, { ramp: BA, lip: ['#6a6258', '#8c8276', '#b0a698', '#d6cdbd'] }, mossy);
  const rng = new RNG(mossy ? 2702 : 2712);
  for (let i = 0; i < 2; i++) {
    const p = walk(rng, rng.int(0, 32), rng.int(0, 32), rng.int(9, 14), [rng.float(-0.2, 0.2), 1], 0.5);
    polyline(c, p, '#6a1e0c');
    for (const [x, y] of p) if (rng.chance(0.5)) c.dot(x, y, rng.chance(0.35) ? '#ffb040' : '#e8661c');
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Skyweaver Spires: the ground of the islands above the cloud. Skyturf is windswept turf in cool sage and pale teal; the marble of the spires is cream strata with fine blue-grey veins; the roads are
// cloudstone flags with sky-blue moss in the joints, and a pale trodden path; the far rock is a lavender haze.
// ---------------------------------------------------------------------------------------------
const SKT = ['#2e4a30', '#486a3c', '#6c8c50', '#94b068', '#bed48a', '#e8efb4'];
function skyturf() { return paintGrass(3101, SKT, { cells: 4, tufts: 40 }).c; }

const MB = ['#4a4c68', '#6c6e8c', '#9498b0', '#bcbcc8', '#dcd6d0', '#f6f0e4'];
function cliffMarble() {
  const c = paintCliff(3201, { ramp: MB }, false);
  const rng = new RNG(3202);
  // fine veins of blue-grey running across the strata
  for (let i = 0; i < 4; i++) {
    const p = walk(rng, rng.int(0, 32), rng.int(0, 32), rng.int(10, 16), [1, rng.float(-0.35, 0.35)], 0.35);
    polyline(c, p, '#7c8cb4');
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Tideglass Reach: the ground of a coast. The sand of the flats - dry and pale, rippled by the water that has left it, and wet, dark and shining under the tide's reach - the sea floor, dune turf in
// blue-green, slate-teal strata flecked with salt, the roads of sea-stone with weed in the joints and of pale shell-sand, the far rock of a teal haze.
// ---------------------------------------------------------------------------------------------
/** rippled sand: the ripple lines of paintSand with a ramp of their own; `wet` makes it dark and shiny (more glints, a sheen along the crests), with a few shells on it */
function paintTideSand(R, seed, wet) {
  const c = new Canvas(32, 32, true, R[1]);
  const rng = new RNG(seed);
  const f = field(32, 32, seed + 1, 3, 3, 2);
  const tones = [R[0], R[1], R[1], R[1], R[2], R[2]];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.set(x, y, bandPick(tones, f[y * 32 + x], x, y, 0.4, 1));
  [3, 10, 17, 25].forEach((y0, r) => {
    const amp = 1 + (r % 2), cyc = 1 + (r % 2), ph = r * 1.7;
    for (let x = 0; x < 32; x++) {
      const off = Math.round(Math.sin((x / 32) * Math.PI * 2 * cyc + ph) * amp);
      if (((x * 5 + r * 13) % 19) < 3) continue;
      if (wet || (x + r) % 3 === 0) c.dot(x, y0 + off, wet ? R[0] : R[1]);                  // (dry sand: a trough only now and then, and not as dark: a regular pattern of scales tires the eye over a whole beach)
      c.dot(x, y0 + off + 1, wet ? R[4] : R[3]);
      if ((x + r) % 3 === 0) c.dot(x, y0 + off + 2, R[2]);
    }
  });
  for (const [x, y] of poisson(rng, 32, 32, wet ? 6 : 8, 5)) {
    c.dot(x, y, wet ? '#e8fff8' : '#fffbe8');
    if (rng.chance(0.4)) { c.dot(x + 1, y, R[4]); c.dot(x - 1, y, R[4]); c.dot(x, y + 1, R[4]); c.dot(x, y - 1, R[4]); }
  }
  for (const [x, y] of poisson(rng, 32, 32, 10, 4)) c.dot(x, y, R[0]);
  // a few shells: a pale fleck with a darker one under it
  for (const [x, y] of poisson(rng, 32, 32, 3, 11)) { c.dot(x, y, wet ? '#f4ece0' : '#fff6ea'); c.dot(x + 1, y + 1, R[0]); }
  return c;
}
const TSD = ['#aa9c6c', '#cbbe8c', '#e0d4a4', '#eee4bc', '#f9f2d6'];          // dry sand: pale, a little green in its shadows
const TSW = ['#3a4c48', '#566a60', '#74887a', '#98ac98', '#c2d6c8'];          // wet sand: dark grey-green, a sheen on the crests
const SFL = ['#0c2226', '#143236', '#1e4448', '#2a585a', '#3a6e6c', '#528888'];            // the sea floor: dark sediment, seen through the water
const TT = ['#1a463c', '#2a6650', '#42866a', '#68a888', '#98caa2', '#cdeabe'];        // dune turf: blue-green, silvered by the wind
function tideTurf() { return paintGrass(4101, TT, { cells: 4, tufts: 40 }).c; }
const CTS = ['#182a32', '#28424c', '#3e5e66', '#5c8084', '#84a4a0', '#bccfc4'];       // slate-teal strata
function cliffTide() {
  const c = paintCliff(4201, { ramp: CTS }, false);
  const rng = new RNG(4202);
  // salt: pale flecks and a bloom where the wet has dried
  for (const [x, y] of poisson(rng, 32, 32, 9, 4)) { c.dot(x, y, '#dceee0'); if (rng.chance(0.4)) c.dot(x + 1, y, '#b4d0c4'); }
  for (let i = 0; i < 3; i++) {
    const p = walk(rng, rng.int(0, 32), rng.int(0, 32), rng.int(9, 14), [1, rng.float(-0.3, 0.3)], 0.35);
    polyline(c, p, '#7ca4a0');
  }
  return c;
}

export function terrainTextures() {
  return {
    grass_a: rec(grassA(), true, false),
    grass_b: rec(grassB(), true, false),
    grass_flowers: rec(grassFlowers(), true, false),
    moss: rec(paintMoss(), true, false),
    dirt: rec(paintDirt(), true, false),
    sand: rec(paintSand(), true, false),
    shore_pebbles: rec(paintPebbles(), true, false, { roll: 'xy' }),
    cobble: rec(paintCobble(), true, false, { roll: 'xy' }),
    flagstone: rec(paintFlagstone(), true, false, { roll: 'xy' }),
    ice: rec(paintIce(), true, false, { roll: 'xy' }),
    // the roads of Frostbloom Hollow: blue-grey cobbles with snow in the gaps, and packed snow
    cobble_frost: rec(paintCobble({
      ramp: ['#3a4660', '#52627e', '#7288a6', '#98aecc', '#bccee4', '#e8f1fa'], moss: ['#a6bcdc', '#c4d6ec', '#d4e2f4', '#f8fcff'], seed: 2501,
      fams: [{ d: '#98aecc', m: '#bccee4', l: '#e8f1fa' }, { d: '#8196b8', m: '#a6bad8', l: '#c6d6ea' }, { d: '#98aecc', m: '#bccee4', l: '#e8f1fa' }, { d: '#7288a6', m: '#98aecc', l: '#bccee4' }],
    }), true, false, { roll: 'xy' }),
    path_snow: rec(paintDirt(['#46526c', '#62728c', '#8498b4', '#a8bcd4', '#c8d8ea', '#e6f0fa'], 2601), true, false),
    snow: rec(paintSnow(2401, false), true, false),
    snow_petals: rec(paintSnow(2401, true), true, false),
    cliff_frost: rec(cliffFrost(), true, false, { roll: 'x' }),
    far_frost: rec(paintFarRock(2002, ['#8e9cc0', '#a0aecc', '#b2c0d8']), true, false),
    // the ground of Emberfall Crags: ash and cinder, basalt, the scorched roads, the far mountains
    ash: rec(paintAsh(2901), true, false),
    cinder: rec(paintCinder(2951), true, false),
    cobble_ember: rec(paintCobble({
      ramp: ['#241c1a', '#382c28', '#4e3e36', '#6e5848', '#8e7660', '#b49c80'], moss: ['#7a2410', '#b83a14', '#f0801f', '#ffc050'], seed: 2801,
      fams: [{ d: '#4e3e36', m: '#6e5848', l: '#8e7660' }, { d: '#42342e', m: '#5e4a3e', l: '#7c6552' }, { d: '#4e3e36', m: '#6e5848', l: '#8e7660' }, { d: '#382c28', m: '#4e3e36', l: '#6e5848' }],
    }), true, false, { roll: 'xy' }),
    path_ash: rec(paintDirt(['#3a322c', '#544a42', '#756a5e', '#978a7a', '#b8ab98', '#d8cdbb'], 2811), true, false),
    cliff_basalt: rec(cliffBasalt(), true, false, { roll: 'x' }),
    cliff_basalt_bare: rec(cliffBasalt(false), true, false, { roll: 'x' }),
    far_ember: rec(paintFarRock(2003, ['#5c3c38', '#6c4842', '#7e564e']), true, false),
    // the ground of Skyweaver Spires: turf and marble, the cloudstone roads, the far rock
    skyturf: rec(skyturf(), true, false),
    cliff_marble: rec(cliffMarble(), true, false, { roll: 'x' }),
    cobble_sky: rec(paintCobble({
      ramp: ['#58587a', '#7a7a9a', '#a0a0b8', '#c4c2d0', '#e2dede', '#f8f4ec'], moss: ['#78aec0', '#9acad8', '#bce0ea', '#e2f6fa'], seed: 3301,
      fams: [{ d: '#a0a0b8', m: '#c4c2d0', l: '#f0ece4' }, { d: '#9090aa', m: '#b4b2c6', l: '#dcd8da' }, { d: '#a0a0b8', m: '#c4c2d0', l: '#f0ece4' }, { d: '#7a7a9a', m: '#a0a0b8', l: '#c4c2d0' }],
    }), true, false, { roll: 'xy' }),
    path_sky: rec(paintDirt(['#6e6a64', '#8c867c', '#aca493', '#c8bfaa', '#e0d6c0', '#f4ecd8'], 3311), true, false),
    far_sky: rec(paintFarRock(3003, ['#a4aed2', '#b6bedc', '#c8d0e8']), true, false),
    // the ground of Tideglass Reach: sand dry and wet, the sea floor, dune turf, slate strata, the sea-stone roads, the far rock
    sand_tide: rec(paintTideSand(TSD, 4001, false), true, false),
    sand_wet: rec(paintTideSand(TSW, 4011, true), true, false),
    sea_floor: rec(paintDirt(SFL, 4021, { h: '#7ab4aa', b: '#3c7470' }), true, false),
    tideturf: rec(tideTurf(), true, false),
    cliff_tide: rec(cliffTide(), true, false, { roll: 'x' }),
    cobble_tide: rec(paintCobble({
      ramp: ['#243840', '#3c5660', '#5e7e86', '#88a8a8', '#b4ccc4', '#e6f0e6'], moss: ['#2e8478', '#4ea898', '#80ccb8', '#cff0e6'], seed: 4401,
      fams: [{ d: '#88a8a8', m: '#b4ccc4', l: '#e6f0e6' }, { d: '#7898a0', m: '#a2bcb8', l: '#d4e4dc' }, { d: '#88a8a8', m: '#b4ccc4', l: '#e6f0e6' }, { d: '#5e7e86', m: '#88a8a8', l: '#b4ccc4' }],
    }), true, false, { roll: 'xy' }),
    path_tide: rec(paintDirt(['#7a7256', '#9a916e', '#bbae86', '#d3c79f', '#e8deb8', '#f7f0d2'], 4411, { h: '#f4ecd2', b: '#b4a884' }), true, false),
    far_tide: rec(paintFarRock(4003, ['#5f979c', '#76acae', '#92c2c0']), true, false),
    cliff: rec(cliffLav(), true, false, { roll: 'x' }),
    cliff_warm: rec(cliffWarm(), true, false, { roll: 'x' }),
    cliff_bare: rec(cliffBare(), true, false, { roll: 'x' }),
    cliff_warm_bare: rec(cliffWarmBare(), true, false, { roll: 'x' }),
    far_rock: rec(paintFarRock(), true, false),
    rune_ring: rec(paintRuneRing(), false, false),
    rune_court: rec(paintCourtRunes(), false, false),
  };
}
