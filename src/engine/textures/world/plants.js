// Plant textures: bark, foliage canopies, pine, mushrooms and the cut-out sprites (tuft, flowers, reeds, fern, lilypad, vine).
import { RAMPS } from '../palette.js';
import {
  Canvas, RNG, field, bandPick, dpick, poisson, rec, clamp,
} from './kit.js';

const G = RAMPS.grass, B = RAMPS.bark, BP = RAMPS.barkPale, L = RAMPS.leaf, LT = RAMPS.leafTeal, LA = RAMPS.leafAutumn;

// ---------------------------------------------------------------------------------------------
// Bark (16x32 tiles, vertical furrows)
// ---------------------------------------------------------------------------------------------
function paintBark() {
  const c = new Canvas(16, 32, true, B[3]);
  const rng = new RNG(4001);
  // ridge tone wash
  const f = field(16, 32, 4002, 2, 4, 2);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) c.dot(x, y, bandPick([B[3], B[3], B[4], B[4], B[4]], f[y * 16 + x], x, y, 0.35, 1));
  // furrows: two-pixel dark grooves that wander and occasionally break
  for (let k = 0; k < 4; k++) {
    const x0 = k * 4 + rng.int(0, 2);
    const amp = rng.float(0.6, 1.4), cyc = rng.pick([1, 1, 2]), ph = rng.float(0, 6.28);
    for (let y = 0; y < 32; y++) {
      if (((y + k * 9) % 16) > 12 && k % 2 === 0) continue; // breaks
      const x = x0 + Math.round(Math.sin((y / 32) * Math.PI * 2 * cyc + ph) * amp);
      c.dot(x - 1, y, B[3]);
      c.dot(x, y, B[1]);
      c.dot(x + 1, y, B[2]);
      c.dot(x + 2, y, '#b89470'); // lit lip of the ridge that follows
      if (y % 4 === 0) c.dot(x + 3, y, '#b89470');
    }
  }
  // cross cracks between furrows
  for (const [x, y] of poisson(rng, 16, 32, 5, 6)) { c.hl(x, y, 2, B[1]); c.dot(x, y + 1, '#b89470'); }
  // lichen flecks
  for (const [x, y] of poisson(rng, 16, 32, 3, 9)) { c.dot(x, y, '#7f9e4c'); c.dot(x + 1, y, '#587a3d'); }
  return c;
}

function paintBarkPale() {
  const c = new Canvas(16, 32, true, BP[2]);
  const rng = new RNG(4101);
  const f = field(16, 32, 4102, 2, 3, 2);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) c.dot(x, y, bandPick([BP[1], BP[2], BP[2], BP[3], BP[3]], f[y * 16 + x], x, y, 0.35, 1));
  // faint vertical streaks
  for (let i = 0; i < 9; i++) {
    const x = rng.int(0, 16), y = rng.int(0, 32), len = rng.int(5, 12);
    for (let j = 0; j < len; j++) c.dot(x, y + j, rng.chance(0.5) ? BP[1] : BP[4]);
  }
  // dark birch marks: short horizontal lenticels, some with a lighter lip
  for (const [x, y] of poisson(rng, 16, 32, 9, 5)) {
    const len = rng.int(3, 7);
    c.hl(x, y, len, BP[0]);
    if (rng.chance(0.5)) c.hl(x + 1, y + 1, len - 2, BP[1]);
    c.hl(x, y - 1, len - 1, BP[4]);
  }
  // a couple of peeling curls
  for (const [x, y] of [[3, 11], [11, 26]]) { c.hl(x, y, 4, BP[0]); c.dot(x, y + 1, BP[0]); c.hl(x + 1, y + 1, 3, BP[4]); c.hl(x, y - 1, 5, BP[4]); }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Foliage canopies: overlapping cartoon leaf clumps with dark gaps and pale tips
// R = { gap, back, mid, light, tip, hi }
// ---------------------------------------------------------------------------------------------
function paintLeaves(seed, R, o = {}) {
  const c = new Canvas(32, 32, true, R.gap);
  const rng = new RNG(seed);
  const layer = (n, minD, rmin, rmax, dark, mid, light, tip) => {
    const pts = poisson(rng, 32, 32, n, minD).sort((a, b) => a[1] - b[1]);
    for (const [x, y] of pts) {
      const rx = rng.float(rmin, rmax), ry = rx * rng.float(0.78, 0.95);
      c.blob(x, y, rx, ry, dark, mid, light);
      if (tip) {
        // pale tips on the lit side
        c.dot(Math.floor(x - rx * 0.5), Math.floor(y - ry * 0.55), tip);
        if (rx > 3) c.dot(Math.floor(x - rx * 0.5) + 1, Math.floor(y - ry * 0.55) - 1, tip);
      }
    }
  };
  layer(o.nBack ?? 9, 8, 6, 7.4, R.gap, R.back, R.mid, null);
  layer(o.nMid ?? 13, 6, 4.4, 5.6, R.back, R.mid, R.light, R.tip);
  layer(o.nFront ?? 18, 4.6, 2.8, 3.8, R.mid, R.light, R.tip, R.hi ?? R.tip);
  // leaf-edge notches: tiny dark v marks so blobs read as leaves rather than balls
  for (const [x, y] of poisson(rng, 32, 32, 16, 4)) { c.dot(x, y, R.gap); c.dot(x + 1, y + 1, R.back); }
  return c;
}

function leavesGreen() {
  return paintLeaves(4201, { gap: L[1], back: L[2], mid: L[3], light: L[4], tip: L[5], hi: '#c8f090' });
}
function leavesTeal() {
  return paintLeaves(4301, { gap: LT[1], back: LT[2], mid: LT[3], light: LT[4], tip: '#b4ecd0', hi: '#e0fff0' });
}
function leavesAutumn() {
  return paintLeaves(4401, { gap: LA[1], back: LA[2], mid: LA[3], light: LA[4], tip: '#ffe890', hi: '#fff8c8' });
}

// ---------------------------------------------------------------------------------------------
// Pine: drooping layered boughs with needle hatching
// ---------------------------------------------------------------------------------------------
function paintPine() {
  const P = { shade: '#16482e', back: '#1c7048', mid: '#2c9058', light: '#48b070', tip: '#80d090' };
  const c = new Canvas(32, 32, true, P.shade);
  const rng = new RNG(4501);
  // Overlapping fir sprays in two layers. A spray is a centre rib with needles angled down and out, so
  // it tapers like a small fir; the back layer is darker and sits half a cell away, which fills the gaps
  // and breaks up the grid. Everything wraps, no 1px checkerboard: needles are 2px apart vertically.
  const spray = (cx, y0, pal, big) => {
    const len = big ? [3, 3, 2] : [2, 2, 2];
    // soft body: narrow at the top, widest at the base
    for (let k = 0; k < 8; k++) {
      const h = Math.min(big ? 3.4 : 2.6, 0.7 + k * 0.42);
      c.hl(Math.round(cx + 0.5 - h), y0 + k, Math.round(2 * h), k < 6 ? pal.back : pal.shade);
    }
    for (let k = 0; k < 8; k++) { c.dot(cx, y0 + k, k < 6 ? pal.light : pal.mid); c.dot(cx + 1, y0 + k, k < 6 ? pal.mid : pal.back); }
    [0, 2, 4].forEach((n, i) => {
      for (let j = 0; j < len[i]; j++) {
        c.dot(cx - 1 - j, y0 + n + 1 + j, j === len[i] - 1 ? pal.tip : pal.light);
        c.dot(cx + 2 + j, y0 + n + 1 + j, j === len[i] - 1 ? pal.mid : pal.back);
      }
    });
  };
  const dark = { shade: P.shade, back: P.shade, mid: P.back, light: P.mid, tip: P.light };
  for (let t = 0; t < 4; t++) for (let q = 0; q < 4; q++) spray(q * 8 + (t % 2) * 4 + 3 + 4 + rng.int(-1, 2), t * 8 + 4 + rng.int(-1, 2), dark, false);
  for (let t = 0; t < 4; t++) for (let q = 0; q < 4; q++) spray(q * 8 + (t % 2) * 4 + 3 + rng.int(-1, 2), t * 8 + rng.int(-1, 2), P, true);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Mushrooms
// ---------------------------------------------------------------------------------------------
function paintMushroomCap() {
  const c = new Canvas(32, 32, true);
  const VI = RAMPS.crystalViolet;
  // teal dome shading from a pale crown to a deep teal skirt, then a scalloped violet frill
  const cols = [LT[1], LT[2], LT[2], LT[3], LT[3], LT[4]];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const t = 1 - y / 26; // 1 at the crown, 0 at the frill
      c.dot(x, y, bandPick(cols, clamp(t, 0, 1), x, y, 0.5, 1));
    }
  }
  for (let x = 0; x < 32; x++) {
    const u = x % 8; // rounded scallops, not a zig-zag
    const edge = 27 - Math.round(Math.sqrt(Math.max(0, 16 - (u - 3.5) * (u - 3.5))) * 0.62);
    for (let y = edge; y < 32; y++) {
      const d = y - edge;
      c.dot(x, y, d === 0 ? VI[4] : d === 1 ? VI[3] : d < 4 ? VI[2] : d < 6 ? VI[1] : VI[0]);
    }
    c.dot(x, edge - 1, LT[1]);
  }
  // cream spots in staggered rows (wrapping horizontally)
  const spot = (x, y, r) => {
    c.ellipse(x + 0.6, y + 0.8, r, r * 0.9, '#186a6a'); // soft shadow on the cap
    c.ellipse(x, y, r, r * 0.92, '#dccfb2');
    c.ellipse(x - 0.4, y - 0.5, r * 0.8, r * 0.72, '#f0e6cc');
    c.dot(Math.floor(x - r * 0.4), Math.floor(y - r * 0.45), '#fff8e6');
  };
  for (const [x, y, r] of [[4, 6, 3], [15, 4, 2.3], [26, 7, 3.2], [9, 14, 2.6], [21, 15, 3], [31, 13, 2.2], [3, 20, 2], [14, 21, 2.4], [27, 21, 2]]) spot(x, y, r);
  return c;
}

function paintMushroomStem() {
  const c = new Canvas(16, 16, true, '#dccfb2');
  const rng = new RNG(4701);
  // vertical fibre streaks
  for (let x = 0; x < 16; x++) {
    const tone = ((x * 5) % 7) < 2 ? '#c8bc9e' : ((x * 3) % 8) === 1 ? '#f0e6cc' : '#dccfb2';
    for (let y = 0; y < 16; y++) c.dot(x, y, tone);
  }
  for (let i = 0; i < 10; i++) { const x = rng.int(0, 16), y = rng.int(3, 13), l = rng.int(3, 6); for (let j = 0; j < l; j++) c.dot(x, y + j, '#c8bc9e'); }
  // gills under the cap: fine radial lines with violet tint
  for (let x = 0; x < 16; x++) {
    c.dot(x, 0, x % 2 ? '#b8a8c8' : '#d8ccd8');
    c.dot(x, 1, x % 2 ? '#c8bccc' : '#e6dce2');
    c.dot(x, 2, x % 2 ? '#d0c4c8' : '#dccfb2');
  }
  // collar ring
  for (let x = 0; x < 16; x++) { c.dot(x, 4, '#b8a890'); c.dot(x, 5, '#dccfb2'); }
  // dirt at the foot, dithered
  for (let y = 11; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const t = (y - 10) / 6;
      c.dot(x, y, dpick(['#dccfb2', '#b8a890', '#8a7a6a'], t * 0.8, x, y, 1));
    }
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Sprite helpers: curved blades / stalks
// ---------------------------------------------------------------------------------------------
function curve(bx, by, tx, ty, bend, n) {
  const pts = [];
  const cx = (bx + tx) / 2 + bend, cy = (by + ty) / 2;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([(1 - t) * (1 - t) * bx + 2 * (1 - t) * t * cx + t * t * tx, (1 - t) * (1 - t) * by + 2 * (1 - t) * t * cy + t * t * ty, t]);
  }
  return pts;
}

/** A tapered blade: 2px wide at the root, 1px at the tip. lit = left px, mid = body, dark = right px. */
function blade(c, bx, by, tx, ty, bend, cols, wide = 2) {
  const n = Math.max(6, Math.ceil(Math.hypot(tx - bx, ty - by) * 2));
  for (const [x, y, t] of curve(bx, by, tx, ty, bend, n)) {
    const px = Math.round(x), py = Math.round(y);
    const w = wide - t * (wide - 1);
    const tip = t > 0.86;
    if (w >= 1.6) {
      c.dot(px, py, tip ? cols.tip : t < 0.25 ? cols.mid : cols.lit);
      c.dot(px + 1, py, t < 0.2 ? cols.root : cols.dark);
    } else c.dot(px, py, tip ? cols.tip : t < 0.5 ? cols.mid : cols.lit);
  }
}

const GRASS_COLS = { lit: G[4], mid: G[3], dark: G[2], tip: G[5], root: G[1] };
const GRASS_COLS_D = { lit: G[3], mid: G[2], dark: G[1], tip: G[4], root: G[0] };

function tuft() {
  const c = new Canvas(16, 16, false);
  // back blades darker, front lighter
  blade(c, 5, 15, 1, 8, -1.5, GRASS_COLS_D);
  blade(c, 10, 15, 14, 7, 1.5, GRASS_COLS_D);
  blade(c, 6, 15, 4, 3, -1.2, GRASS_COLS);
  blade(c, 9, 15, 11, 4, 1.2, GRASS_COLS);
  blade(c, 7, 15, 8, 0, 0.6, GRASS_COLS);
  // tuft root shadow
  for (let x = 5; x < 11; x++) c.dot(x, 15, G[0]);
  c.dot(4, 15, G[1]); c.dot(11, 15, G[1]);
  return c;
}

const STEM = { lit: G[3], mid: G[2], dark: G[1], tip: G[3], root: G[1] };

function leafPair(c, x, y, dir, cols = STEM) {
  // small leaf blade leaving the stalk at (x,y) up and outward
  blade(c, x, y, x + dir * 4, y - 3, dir * 0.6, { lit: G[4], mid: G[3], dark: G[2], tip: G[5], root: G[2] }, 2);
}

function flowerPink() {
  const c = new Canvas(16, 16, false);
  blade(c, 8, 15, 8, 8, 0.8, { lit: G[3], mid: G[2], dark: G[1], tip: G[3], root: G[1] }, 1);
  for (const [x, y, t] of curve(8, 15, 8, 8, 0.8, 10)) c.dot(Math.round(x), Math.round(y), t > 0.5 ? G[3] : G[2]);
  leafPair(c, 8, 13, -1); leafPair(c, 8, 12, 1);
  // 5-petal head centred at (8,5)
  const P = ['#ff8ab8', '#ffb8d4', '#d04a84', '#ffe0ec'];
  const hx = 8, hy = 5;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const px = hx + Math.cos(a) * 2.7, py = hy + Math.sin(a) * 2.7;
    c.blob(px, py, 1.9, 1.9, P[2], P[0], P[1]);
  }
  c.circle(hx, hy, 1.6, '#ffc03c');
  c.dot(hx - 1, hy - 1, '#fff6c0');
  c.dot(hx, hy, '#c05a14');
  return c;
}

function flowerYellow() {
  const c = new Canvas(16, 16, false);
  for (const [x, y, t] of curve(8, 15, 8, 9, -0.8, 10)) c.dot(Math.round(x), Math.round(y), t > 0.5 ? G[3] : G[2]);
  leafPair(c, 8, 14, -1); leafPair(c, 8, 12, 1);
  // tulip cup: three overlapping petals, each shaded with a lit left and a deeper right side
  const Y = { dk: '#e08a1c', mid: '#ffc03c', lt: '#fff0a0', deep: '#c05a14' };
  c.blob(10.2, 5.2, 2, 3.4, Y.deep, Y.dk, Y.mid);   // right petal, in the back
  c.blob(5.8, 5.2, 2, 3.4, Y.dk, Y.mid, Y.lt);      // left petal
  c.blob(8, 4.6, 2.2, 3.9, Y.dk, Y.mid, Y.lt);      // centre petal in front
  c.ellipse(8, 7.6, 3.2, 1.8, Y.mid);                 // rounded base of the cup
  c.hl(6, 8, 4, Y.dk); c.dot(9, 7, Y.deep);
  c.dot(7, 2, Y.lt); c.dot(6, 3, Y.lt);
  // calyx
  c.dot(7, 9, G[2]); c.dot(8, 9, G[3]); c.dot(9, 9, G[1]);
  return c;
}

function flowerBlue() {
  const c = new Canvas(16, 16, false);
  // arching stalk with three hanging bells
  for (const [x, y, t] of curve(6, 15, 11, 4, 3.2, 14)) c.dot(Math.round(x), Math.round(y), t > 0.6 ? G[3] : G[2]);
  leafPair(c, 6, 14, -1); leafPair(c, 6, 12, 1);
  const Bl = ['#5a8cf0', '#a8c4ff', '#3050c0', '#e0ecff'];
  const bell = (x, y) => {
    c.stamp(x, y, ['.bb.', 'blbb', 'blbd', 'bbdd', 'b..d'], { b: Bl[0], l: Bl[1], d: Bl[2] });
    c.dot(x + 1, y + 1, Bl[3]);
  };
  bell(8, 3); bell(11, 6); bell(3, 5);
  c.dot(8, 2, G[3]); c.dot(9, 3, G[2]);
  return c;
}

function reeds() {
  const c = new Canvas(16, 32, false);
  // long blade leaves
  blade(c, 4, 31, 0, 12, -1.5, GRASS_COLS_D);
  blade(c, 11, 31, 15, 10, 2.0, GRASS_COLS_D);
  blade(c, 6, 31, 3, 6, -1.0, GRASS_COLS);
  // cattail stalks
  const stems = [[8, 31, 8, 7, 0.4], [11, 31, 12, 12, 0.7], [5, 31, 5, 14, -0.6]];
  for (const [bx, by, tx, ty, bend] of stems) {
    for (const [x, y, t] of curve(bx, by, tx, ty, bend, 26)) c.dot(Math.round(x), Math.round(y), t > 0.7 ? G[4] : t > 0.3 ? G[3] : G[2]);
  }
  // brown heads
  const head = (x, y, h) => {
    for (let j = 0; j < h; j++) {
      c.dot(x, y + j, B[3]); c.dot(x + 1, y + j, j % 3 === 2 ? B[1] : B[2]);
    }
    c.dot(x, y - 1, B[3]); c.dot(x + 1, y - 1, B[2]);
    c.dot(x, y + 1, B[4]); c.dot(x, y + 4, B[4]);
    c.dot(x + 1, y + h, B[1]);
    c.vl(x, y - 3, 2, G[4]); // tip spike
  };
  head(7, 1, 7);
  head(11, 6, 6);
  head(4, 8, 6);
  // root shadow
  for (let x = 3; x < 13; x++) c.dot(x, 31, G[0]);
  return c;
}

function fern() {
  const c = new Canvas(16, 16, false);
  // pinnate fronds: a curved rib with leaflets alternating left / right so the edge reads as a
  // serrated blade (no 1px checkerboard), shrinking towards the tip
  const frond = (bx, by, tx, ty, bend, cols) => {
    const pts = curve(bx, by, tx, ty, bend, 13);
    let side = 1;
    pts.forEach(([x, y, t], i) => {
      const px = Math.round(x), py = Math.round(y);
      c.dot(px, py, cols.rib);
      if (i < 1) return;
      const len = Math.max(1, Math.round(3.6 - t * 2.6));
      for (let k = 1; k <= len; k++) {
        c.dot(px + side * k, py - (k > 1 ? 1 : 0), k === len ? cols.tip : side < 0 ? cols.lit : cols.dark);
      }
      side = -side;
    });
    c.dot(Math.round(tx), Math.round(ty), cols.tip);
  };
  frond(7, 15, 2, 6, -2.5, { rib: L[1], lit: L[3], dark: L[2], tip: L[4] });
  frond(9, 15, 14, 6, 2.5, { rib: L[1], lit: L[3], dark: L[2], tip: L[4] });
  frond(8, 15, 8, 1, 0.3, { rib: L[2], lit: L[4], dark: L[3], tip: L[5] });
  c.dot(8, 15, L[1]); c.dot(7, 15, L[1]); c.dot(9, 15, L[1]);
  return c;
}

function lilypad() {
  const c = new Canvas(16, 16, false);
  const cx = 8, cy = 8.5;
  c.ellipse(cx + 0.5, cy + 0.5, 7, 6.2, L[0]); // dark rim / shadow
  c.ellipse(cx, cy, 7, 6.2, L[2]);
  c.ellipse(cx - 0.6, cy - 0.6, 5.8, 5.0, L[3]);
  c.ellipse(cx - 1.4, cy - 1.5, 3.4, 2.8, L[4]);
  // veins radiating from the notch centre
  for (let a = 0; a < 6; a++) {
    const ang = 0.5 + a * 1.0;
    for (let r = 1; r < 6; r++) {
      const x = Math.round(cx + Math.cos(ang) * r), y = Math.round(cy + Math.sin(ang) * r * 0.9);
      if (c.solid(x, y)) c.dot(x, y, L[2]);
    }
  }
  c.dot(6, 5, L[5]); c.dot(7, 5, L[5]); c.dot(5, 6, L[5]);
  // notch: wedge cut towards the right
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx > 0.5 && Math.abs(dy) < dx * 0.32 + 0.3) c.set(x, y, [0, 0, 0, 0]);
    }
  }
  // rim highlight on the notch edges
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (!c.solid(x, y)) continue;
    if (!c.solid(x + 1, y) && x > 8 && Math.abs(y - cy) < 3) c.dot(x, y, L[1]);
    if (x > 9 && !c.solid(x, y - 1) && y > cy) c.dot(x, y, L[4]);
  }
  return c;
}

function vine() {
  const c = new Canvas(8, 32, false);
  // wavy stem, then leaves alternating sides (bigger and one ramp step lighter than the stem so they read on dark walls)
  const sx = (y) => 3 + Math.round(Math.sin((y / 32) * Math.PI * 4 + 0.6) * 1.4);
  for (let y = 0; y < 32; y++) { c.dot(sx(y), y, L[2]); if (y % 3 === 0) c.dot(sx(y) + 1, y, L[1]); }
  let side = 1;
  for (let y = 4; y < 30; y += 5) {
    const x = sx(y);
    const lx = side > 0 ? x + 2 : x - 2;
    c.blob(lx, y + 1, 2.3, 1.8, L[1], L[3], L[4]);
    c.dot(x + side, y, L[2]);
    c.dot(lx - side, y, L[5]);
    if (y % 10 === 4) c.dot(lx - side, y + 1, L[5]);
    side = -side;
  }
  // tendril curl at the tip
  c.dot(sx(30) + 1, 30, L[3]); c.dot(sx(30) + 2, 31, L[3]);
  return c;
}

export function plantTextures() {
  return {
    bark: rec(paintBark(), true, false),
    bark_pale: rec(paintBarkPale(), true, false),
    leaves_green: rec(leavesGreen(), true, false),
    leaves_teal: rec(leavesTeal(), true, false),
    leaves_autumn: rec(leavesAutumn(), true, false),
    pine: rec(paintPine(), true, false),
    mushroom_cap: rec(paintMushroomCap(), false, false),
    mushroom_stem: rec(paintMushroomStem(), false, false),
    tuft: rec(tuft(), false, true),
    flower_pink: rec(flowerPink(), false, true),
    flower_yellow: rec(flowerYellow(), false, true),
    flower_blue: rec(flowerBlue(), false, true),
    reeds: rec(reeds(), false, true),
    fern: rec(fern(), false, true),
    lilypad: rec(lilypad(), false, true),
    vine: rec(vine(), false, true),
  };
}
