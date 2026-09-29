// Gameplay prop textures: vase, chest, crate.
import { RAMPS } from '../palette.js';
import { Canvas, RNG, field, bandPick, poisson, rec, wrapN } from './kit.js';

const W = RAMPS.wood, MT = RAMPS.metal, BZ = RAMPS.brass, AM = RAMPS.amber;

// Terracotta vase wrap texture: horizontal bands with an amber / blue triangle frieze (wraps in x).
function paintVase() {
  const C = { dk: '#6a2a22', sh: '#a85236', body: '#d0704a', lit: '#e89464', hi: '#f8b48a' };
  const cream = '#f0e6cc', creamSh = '#dccfb2';
  const blue = '#3c78ff', blueDk = '#1848c8', blueLt = '#84acff';
  const c = new Canvas(32, 32, true, C.body);
  const rng = new RNG(6001);
  const f = field(32, 32, 6002, 4, 2, 2);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c.dot(x, y, bandPick([C.sh, C.body, C.body, C.body, C.lit], f[y * 32 + x], x, y, 0.4, 1));
  // rim + foot bands (symmetric so the wrap can be flipped)
  const band = (y, h, col, top, bot) => { c.rect(0, y, 32, h, col); if (top) c.hl(0, y, 32, top); if (bot) c.hl(0, y + h - 1, 32, bot); };
  band(0, 3, C.lit, C.hi, C.sh); band(29, 3, C.sh, C.body, C.dk);
  band(3, 1, C.dk); band(28, 1, C.dk);
  band(5, 2, cream, '#fff8e6', creamSh); band(25, 2, cream, '#fff8e6', creamSh);
  band(7, 1, C.dk); band(24, 1, C.dk);
  // frieze band: a dark border above and below, clay inside
  c.rect(0, 9, 32, 14, C.body);
  for (let x = 0; x < 32; x++) { c.dot(x, 9, C.dk); c.dot(x, 22, C.dk); c.dot(x, 10, C.hi); c.dot(x, 21, C.sh); }
  // interlocking triangle frieze on an 8px period: amber points up (rows 12..15), blue points down
  // (rows 16..19), half a period apart. 45-degree steps keep the slopes chunky and clean.
  const UP = [2, 4, 6, 8];
  const inTri = (x, y) => {
    const ux = wrapN(x, 32);
    const ay = y - 12, by = y - 16;
    for (let k = 0; k < 4; k++) {
      if (ay >= 0 && ay < 4 && Math.abs(ux + 0.5 - (k * 8 + 4)) <= UP[ay] / 2) return 'A';
      if (by >= 0 && by < 4 && Math.abs(wrapN(ux - 4, 32) + 0.5 - (k * 8 + 4)) <= UP[3 - by] / 2) return 'B';
    }
    return null;
  };
  for (let y = 10; y < 22; y++) {
    for (let x = 0; x < 32; x++) {
      const t = inTri(x, y);
      if (t) {
        const left = t === 'A' ? ((x % 8) < 4) : (wrapN(x - 4, 32) % 8 < 4);
        if (t === 'A') c.dot(x, y, y === 15 ? AM[1] : !inTri(x - 1, y) ? AM[4] : left ? AM[3] : AM[2]);
        else c.dot(x, y, y === 16 ? blueLt : !inTri(x + 1, y) ? blueDk : left ? '#5a94ff' : blue);
      } else if (inTri(x + 1, y) || inTri(x - 1, y) || inTri(x, y + 1) || inTri(x, y - 1)) {
        c.dot(x, y, C.dk); // dark outline hugging each triangle
      }
    }
  }
  for (let x = 0; x < 32; x++) { c.dot(x, 22, C.dk); c.dot(x, 9, C.dk); }
  // clay flecks
  for (const [x, y] of poisson(rng, 32, 32, 12, 4)) if (y < 8 || y > 24) c.dot(x, y, rng.chance(0.5) ? C.hi : C.dk);
  return c;
}

function paintChest() {
  const c = new Canvas(32, 32, true, '#c89c5a');
  // planks
  for (let r = 0; r < 4; r++) {
    const y0 = r * 8;
    const tone = ['#d0a866', '#c49a58', '#d0a866', '#b88c50'][r];
    c.rect(0, y0, 32, 7, tone);
    c.hl(0, y0, 32, W[5]); c.hl(0, y0 + 6, 32, W[3]); c.hl(0, y0 + 7, 32, W[1]);
    // one long grain stroke per plank, kept clear of the iron bands
    const gy = y0 + 2 + (r % 2) * 2;
    for (let x = 8 + r * 3; x < 24 + r * 3 && x < 30; x++) if (x % 9 !== 4) c.dot(x, gy, W[3]);
  }
  c.ellipse(20, 13, 2, 1.4, W[2]); c.ellipse(20, 13, 1.1, 0.8, W[0]); c.dot(19, 12, W[5]);
  c.ellipse(9, 27, 1.8, 1.2, W[2]); c.dot(9, 27, W[0]);
  // iron bands (vertical), with rivets; they wrap around the corners of the chest
  for (const x0 of [2, 26]) {
    c.rect(x0, 0, 4, 32, MT[2]);
    c.vl(x0, 0, 32, MT[4]); c.vl(x0 + 1, 0, 32, MT[3]);
    c.vl(x0 + 3, 0, 32, MT[0]); c.vl(x0 + 2, 0, 32, MT[1]);
    for (const y of [3, 12, 20, 29]) { c.dot(x0 + 1, y, MT[4]); c.dot(x0 + 2, y, MT[1]); }
  }
  // lock plate in the middle
  c.rect(12, 9, 8, 11, BZ[0]);
  c.rect(13, 10, 6, 9, BZ[3]);
  c.hl(13, 10, 6, BZ[4]); c.vl(13, 10, 9, BZ[4]);
  c.hl(14, 18, 5, BZ[2]); c.vl(18, 11, 8, BZ[2]);
  c.dot(15, 13, BZ[0]); c.dot(16, 13, BZ[0]); c.rect(15, 14, 2, 3, BZ[0]);
  for (const [x, y] of [[13, 11], [18, 11], [13, 17], [18, 17]]) c.dot(x, y, BZ[1]);
  return c;
}

function paintCrate() {
  const c = new Canvas(32, 32, true, W[3]);
  // dark slatted backing
  for (let x = 0; x < 32; x++) {
    const s = Math.floor(x / 8);
    c.vl(x, 0, 32, ['#8c6236', '#94693c', '#8c6236', '#94693c'][s]);
  }
  for (const x of [0, 8, 16, 24]) c.vl(x, 0, 32, W[1]);
  // outer frame: 4px planks
  const frame = '#d0a866', fl = '#e8c488', fs = '#a67a44', fd = W[2];
  c.rect(0, 0, 32, 4, frame); c.rect(0, 28, 32, 4, frame);
  c.rect(0, 0, 4, 32, frame); c.rect(28, 0, 4, 32, frame);
  c.hl(0, 0, 32, fl); c.vl(0, 0, 32, fl);
  c.hl(0, 3, 32, fs); c.hl(0, 31, 32, fd); c.hl(4, 27, 24, fd);
  c.vl(31, 0, 32, fd); c.vl(3, 4, 24, fs); c.vl(27, 4, 24, fd);
  c.hl(0, 28, 32, fl);
  // grain on the frame
  for (let x = 4; x < 28; x++) { if (x % 5) { c.dot(x, 1, fs); c.dot(x, 29, fs); } }
  for (let y = 4; y < 28; y++) { if (y % 5) { c.dot(1, y, fs); c.dot(29, y, fs); } }
  // cross braces: two diagonals, 4px wide
  const brace = (x0, y0, x1, y1) => {
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      for (let k = -1; k <= 2; k++) {
        const col = k === -1 ? fl : k === 2 ? fd : frame;
        c.dot(Math.round(x) + k, Math.round(y), col);
        c.dot(Math.round(x) + k, Math.round(y) + 1, col);
      }
    }
  };
  brace(4, 4, 27, 27);
  brace(27, 4, 4, 27);
  // nails
  for (const [x, y] of [[2, 2], [29, 2], [2, 29], [29, 29], [6, 6], [25, 6], [6, 25], [25, 25], [15, 15], [16, 16]]) { c.dot(x, y, W[0]); c.dot(x - 1, y - 1, W[5]); }
  // knot
  c.ellipse(15, 3, 2, 1.3, W[2]); c.dot(15, 3, W[0]);
  return c;
}

export function propTextures() {
  return {
    vase: rec(paintVase(), false, false),
    chest_wood: rec(paintChest(), false, false),
    crate: rec(paintCrate(), false, false),
  };
}
