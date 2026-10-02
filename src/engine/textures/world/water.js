// Water textures: surface, waterfall, shoreline foam.
import { RAMPS } from '../palette.js';
import { Canvas, RNG, field, bandPick, poisson, lattice, cells, rec } from './kit.js';

const WA = RAMPS.water;

function paintWater() {
  const c = new Canvas(32, 32, true, WA[3]);
  const rng = new RNG(5001);
  // lazy depth mottling: darker and lighter drifts, very low contrast structure
  const f = field(32, 32, 5002, 3, 2, 2);
  const tones = [WA[2], WA[3], WA[3], WA[3], WA[3], WA[3], WA[4]];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.dot(x, y, bandPick(tones, f[y * 32 + x], x, y, 0.4, 1));
  // wave crests: arched highlights with a lighter body and, on some, a dark trough under them.
  // Rows are jittered in y and each arc has its own length / height so the pattern does not read as a grid.
  const arcs = [];
  for (let r = 0; r < 5; r++) {
    const y0 = 2 + r * 6.4;
    let x = rng.int(0, 32);
    for (let k = 0; k < 2 + (r % 2); k++) {
      arcs.push({ x, y: Math.round(y0 + rng.float(-1.5, 1.5)), len: rng.int(7, 15), amp: rng.pick([1, 1, 1.5, 2, 2]), trough: rng.chance(0.55) });
      x += rng.int(11, 17);
    }
  }
  for (const a of arcs) {
    for (let i = 0; i < a.len; i++) {
      const t = i / (a.len - 1);
      const dy = -Math.round(Math.sin(Math.PI * t) * a.amp);
      const x = a.x + i, y = a.y + dy;
      c.dot(x, y, t > 0.3 && t < 0.62 && a.len > 9 ? WA[5] : WA[4]);
      c.dot(x, y + 1, '#68bcda');
      if (a.trough && i > 2 && i < a.len - 3) c.dot(x, y + 2, WA[2]);
    }
  }
  // choppy little ripples
  for (const [x, y] of poisson(rng, 32, 32, 9, 6)) { c.hl(x, y, 3, '#68bcda'); c.hl(x + 1, y + 1, 2, WA[2]); }
  // sparkles
  const sp = poisson(rng, 32, 32, 6, 8);
  sp.forEach(([x, y], i) => {
    c.dot(x, y, '#ffffff');
    if (i % 3 === 0) { c.dot(x - 1, y, WA[5]); c.dot(x + 1, y, WA[5]); c.dot(x, y - 1, WA[5]); c.dot(x, y + 1, WA[5]); }
  });
  return c;
}

function paintWaterfall() {
  const c = new Canvas(16, 32, true, WA[3]);
  const rng = new RNG(5101);
  // dark and mid streaks first, then bright ones on top
  const streak = (n, cols, wmax) => {
    for (let i = 0; i < n; i++) {
      const x = rng.int(0, 16), y = rng.int(0, 32), len = rng.int(7, 22), w = rng.chance(0.4) ? wmax : 1;
      const col = rng.pick(cols);
      for (let j = 0; j < len; j++) for (let k = 0; k < w; k++) c.dot(x + k, y + j, col);
      if (len > 10 && w === 1) c.dot(x, y + len, cols[0]);
    }
  };
  streak(16, [WA[2], WA[2], WA[1]], 2);
  streak(16, [WA[4], WA[4], WA[3]], 2);
  streak(11, [WA[5], WA[4], WA[5]], 1);
  // foam flecks
  for (const [x, y] of poisson(rng, 16, 32, 10, 4)) {
    c.dot(x, y, WA[5]); c.dot(x + 1, y, '#ffffff');
    if (rng.chance(0.4)) c.dot(x, y + 1, WA[4]);
  }
  return c;
}

// hand-drawn round bubble outlines (# = rim, . = clear inside)
const BUBBLES = [
  ['.##.', '#..#', '#..#', '.##.'],
  ['.###.', '#...#', '#...#', '#...#', '.###.'],
  ['..###..', '.#...#.', '#.....#', '#.....#', '#.....#', '.#...#.', '..###..'],
];
function paintFoam() {
  const c = new Canvas(32, 32, true);
  const rng = new RNG(5201);
  const W0 = '#ffffff', W1 = '#f0f4ff', W3 = '#b8d4ec';
  const ring = (x, y, shape) => {
    const rows = BUBBLES[shape];
    const h = rows.length, w = rows[0].length;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (rows[j][i] !== '#') continue;
        // lit upper-left rim, shaded lower-right rim
        const lit = i + j < (w + h) / 2 - 1.2, dark = i + j > (w + h) / 2 + 0.8;
        c.dot(x + i, y + j, lit ? W0 : dark ? W3 : W1);
      }
    }
  };
  const dot = (x, y) => { c.dot(x, y, W0); c.dot(x + 1, y, W1); c.dot(x, y + 1, W1); c.dot(x + 1, y + 1, W3); };
  const free = (x, y, w, h) => {
    for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) if (c.solid(x + i, y + j)) return false;
    return true;
  };
  // foam patches: clusters of touching bubble rings (like a real bubble mass), a few solid crumbs between
  const OFFS = [[0, 0], [4, -1], [-4, 1], [2, 4], [-2, -4], [6, 3], [-5, -3], [5, -5], [-6, 4]];
  const patches = poisson(rng, 32, 32, 5, 10);
  patches.forEach(([cx, cy], pi) => {
    const n = 5 + (pi % 3);
    for (let i = 0; i < n; i++) {
      const [ox, oy] = OFFS[i];
      const shape = (i + pi) % 3 === 0 ? 1 : rng.pick([0, 0, 1]);
      ring(cx + ox + rng.int(-1, 2), cy + oy + rng.int(-1, 2), shape);
    }
    dot(cx + 1, cy + 1);
    if (pi % 2) dot(cx - 6, cy - 1);
  });
  // a few loose bubbles and crumbs out in the water
  for (const [x, y] of poisson(rng, 32, 32, 10, 4)) if (free(x, y, 4, 4)) ring(x, y, 0);
  for (const [x, y] of poisson(rng, 32, 32, 18, 3)) if (free(x, y, 2, 2)) dot(x, y);
  // thin foam trails
  for (const [x0, y0, len] of [[1, 15, 11], [17, 28, 13]]) {
    for (let i = 0; i < len; i++) {
      const y = y0 + Math.round(Math.sin((i / len) * Math.PI * 2 + 0.4) * 1.2);
      if (!c.solid(x0 + i, y)) c.dot(x0 + i, y, W1);
      if (i % 3 === 0 && !c.solid(x0 + i, y + 1)) c.dot(x0 + i, y + 1, W3);
    }
  }
  return c;
}


// ---------------------------------------------------------------------------------------------
// Lava (Emberfall Crags: level.liquid): plates of dark crust floating on molten rock, the cracks between them white-hot, a few plates that are molten right through. It tiles and scrolls like
// water; the game draws it self-lit (it glows in the dusk).
// ---------------------------------------------------------------------------------------------
const LV = ['#2a0806', '#5a140c', '#8e2410', '#c4401a', '#f07a22', '#ffc060', '#fff0b0'];
function paintLava() {
  const c = new Canvas(32, 32, true, LV[3]);
  const rng = new RNG(5301);
  const pts = lattice(rng, 32, 32, 3, 3, 3.6, 0.5);
  const V = cells(32, 32, pts);
  const hot = field(32, 32, 5302, 5, 5, 2);
  const molten = pts.map(() => rng.chance(0.16));
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const k = y * 32 + x, e = V.d2[k] - V.d1[k];
      if (e < 1.3) { c.set(x, y, hot[k] > 0.6 ? LV[6] : LV[5]); continue; }                  // the crack: white-hot
      if (e < 2.5) { c.set(x, y, LV[4]); continue; }                                         // the glowing edge of a plate
      if (molten[V.id[k]]) { c.set(x, y, hot[k] > 0.55 ? LV[5] : LV[4]); continue; }         // a plate that is molten right through
      c.set(x, y, e < 4.4 ? LV[2] : V.d1[k] < 3.0 ? LV[0] : LV[1]);                          // crust: a red rim to the plate, darker in the middle of it
    }
  }
  for (const [x, y] of poisson(rng, 32, 32, 12, 4)) { const k = y * 32 + x; if (V.d2[k] - V.d1[k] > 4.4 && !molten[V.id[k]]) { c.dot(x, y, LV[3]); c.dot(x + 1, y, LV[2]); } }
  for (const [x, y] of poisson(rng, 32, 32, 5, 8)) c.dot(x, y, LV[6]);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Cloud sea (Skyweaver Spires): the surface of the sea of cloud the islands stand in - big soft billows, pearl on lavender-blue, the lit crowns of the puffs in white, a haze between them.
// Whirl: the whirlwind's funnel, drawn additively (black is nothing): long streaks of wind slanting up the tile, pale cyan to white, fading at both ends.
// ---------------------------------------------------------------------------------------------
const CS = ['#8e9cc8', '#a8b4d8', '#c4cee8', '#dce2f4', '#eef2fb', '#ffffff'];
function paintCloudSea() {
  const c = new Canvas(32, 32, true, CS[2]);
  const rng = new RNG(5401);
  const f = field(32, 32, 5402, 2, 2, 4);
  const tones = [CS[1], CS[2], CS[2], CS[3], CS[3], CS[3], CS[4], CS[4]];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.set(x, y, bandPick(tones, f[y * 32 + x], x, y, 0.5, 1));
  // a few big soft billows, back to front, low in contrast (the sea is a surface of cloud, not a heap of bubbles): a shaded underside, a pearl body, a lit crown only on the biggest
  const pts = poisson(rng, 32, 32, 5, 11).sort((a, b) => a[1] - b[1]);
  pts.forEach(([x, y], i) => {
    const rx = rng.pick([6.5, 7.5, 8.5]), ry = rx - rng.pick([1.5, 2.2, 3]);
    c.blob(x, y, rx, ry, CS[2], CS[3], i % 2 ? CS[4] : CS[5]);
  });
  // the haze between them and a few white glints on the crowns
  const g = field(32, 32, 5403, 4, 4, 2);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (g[y * 32 + x] > 0.8) c.set(x, y, CS[4]);
  for (const [x, y] of poisson(rng, 32, 32, 6, 8)) { c.dot(x, y, CS[5]); c.dot(x + 1, y, CS[5]); }
  return c;
}

const WH = ['#14283c', '#2a4c6c', '#5a8cb0', '#9cc8e0', '#d4eef8', '#ffffff'];
function paintWhirl() {
  const c = new Canvas(32, 32, true, '#000000');
  const rng = new RNG(5501);
  for (let i = 0; i < 9; i++) {
    const x0 = rng.int(0, 32), y0 = rng.int(0, 32), len = rng.int(12, 24), slope = rng.float(0.25, 0.6);
    for (let k = 0; k < len; k++) {
      const fade = Math.sin((k / len) * Math.PI);
      const col = WH[Math.min(5, Math.round(fade * (rng.chance(0.15) ? 5 : 3.4)))];
      c.dot(x0 + k, y0 + Math.round(k * slope), col);
      if (fade > 0.6 && rng.chance(0.5)) c.dot(x0 + k, y0 + Math.round(k * slope) + 1, WH[1]);
    }
  }
  return c;
}

export function waterTextures() {
  return {
    water: rec(paintWater(), true, false),
    waterfall: rec(paintWaterfall(), true, false, { roll: 'xy' }),
    foam: rec(paintFoam(), true, true, { roll: 'xy' }),
    lava: rec(paintLava(), true, false, { roll: 'xy' }),
    cloud_sea: rec(paintCloudSea(), true, false, { roll: 'xy' }),
    whirl: rec(paintWhirl(), true, false, { roll: 'xy' }),
  };
}
