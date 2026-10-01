// Magic & light textures: crystals, lantern glass, barrier, portal, beam, sun glow.
import { RAMPS } from '../palette.js';
import { Canvas, RNG, field, dpick, poisson, lattice, cells, rec, clamp, wrapN } from './kit.js';

const V = RAMPS.crystalViolet, CY = RAMPS.crystalCyan, AM = RAMPS.amber, BZ = RAMPS.brass;

// ---------------------------------------------------------------------------------------------
// Crystals: five vertical facets, each with a top-lit gradient, bright left edge, dark right edge
// ---------------------------------------------------------------------------------------------
function paintCrystal(R, o = {}) {
  const c = new Canvas(16, 16, true);
  const n = R.length - 1;
  const xs = [0, 4, 7, 10, 13, 16]; // five facets: 4, 3, 3, 3, 3 px
  const base = o.base ?? [3, 4, 2, 3, 1]; // ramp index per facet: alternating light/dark so every face reads
  for (let f = 0; f < 5; f++) {
    for (let y = 0; y < 16; y++) {
      for (let x = xs[f]; x < xs[f + 1]; x++) {
        let t = base[f];
        // glowing tip at the top, deeper towards the base (dithered only in these two zones)
        if (y < 4) t += ((4 - y) / 4) * 1.0; else if (y > 11) t -= ((y - 11) / 4) * 1.0;
        if (x === xs[f]) t += 1; else if (x === xs[f + 1] - 1) t -= 1;
        c.dot(x, y, dpick(R, clamp(t / n, 0, 1), x, y, 1));
      }
    }
  }
  // inner fracture lines
  for (const [x, y, l] of [[5, 7, 4], [11, 5, 3]]) for (let j = 0; j < l; j++) c.dot(x, y + j, R[Math.max(0, base[x < 7 ? 1 : 3] - 1)]);
  // glints
  const W = '#ffffff';
  c.dot(5, 1, W); c.dot(6, 1, W); c.dot(5, 2, W);
  c.dot(9, 8, W); c.dot(8, 9, R[n]);
  c.dot(13, 5, R[n]); c.dot(14, 4, W);
  c.dot(2, 11, R[n]);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Lantern glass: brass cage with three panes; off = frosted violet, on = radiant amber
// ---------------------------------------------------------------------------------------------
function paintLantern(on) {
  const c = new Canvas(16, 16, false, BZ[0]);
  const rng = new RNG(on ? 5601 : 5602);
  const panes = [[2, 3], [6, 4], [11, 3]]; // x0, width
  // glass: radial glow from the middle of the lantern (amber with a near-white core) or frosted violet
  for (const [x0, w] of panes) {
    for (let y = 3; y < 13; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const d = Math.hypot(x + 0.5 - 8, (y + 0.5 - 8) * 0.9);
        if (on) c.dot(x, y, dpick(['#ffffff', '#fffbe0', AM[5], AM[4], AM[3], AM[2]], clamp((d - 1.2) / 7.2, 0, 1), x, y, 1));
        else c.dot(x, y, dpick([V[2], V[1], V[0]], clamp(d / 6.5, 0, 1) * 0.9 + 0.05, x, y, 1));
      }
    }
  }
  if (on) {
    for (const [x0] of panes) c.dot(x0, 3, '#fffbe0');
  } else {
    // frost speckle + a soft glint at the top-left of each pane
    for (const [x0] of panes) { c.dot(x0, 3, V[4]); c.dot(x0 + 1, 3, V[3]); c.dot(x0, 4, V[3]); }
    for (const [x, y] of poisson(rng, 14, 10, 8, 3)) c.dot(2 + x, 3 + y, V[3]);
    c.dot(8, 8, V[3]);
  }
  // brass cage: caps top and bottom, side posts, two dark bars between the panes
  const lit = on ? AM[4] : BZ[3], body = on ? BZ[3] : BZ[2], dark = on ? BZ[1] : BZ[0];
  c.rect(0, 0, 16, 3, body); c.rect(0, 13, 16, 3, body);
  c.hl(0, 0, 16, lit); c.hl(1, 2, 14, dark);
  c.hl(0, 13, 16, lit); c.hl(0, 15, 16, dark);
  c.rect(0, 3, 2, 10, body); c.rect(14, 3, 2, 10, body);
  c.vl(0, 3, 10, lit); c.vl(15, 3, 10, dark);
  c.vl(5, 3, 10, dark); c.vl(10, 3, 10, dark);
  c.vl(4, 3, 10, on ? AM[3] : V[1]);
  // rivets on the caps
  for (const x of [3, 8, 12]) { c.dot(x, 1, dark); c.dot(x, 14, dark); }
  c.dot(2, 1, lit); c.dot(7, 1, lit);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Barrier: violet energy shimmer on a hex lattice, bright cell borders and nodes
// ---------------------------------------------------------------------------------------------
function paintBarrier() {
  const c = new Canvas(32, 32, true, V[0]);
  const rng = new RNG(5701);
  const pts = lattice(rng, 32, 32, 3, 4, 0, 0.5);
  const cel = cells(32, 32, pts, 1.155); // regular hexagons ~10.7px wide
  const sh = field(32, 32, 5702, 3, 3, 2);
  const N = (x, y) => cel.id[wrapN(y, 32) * 32 + wrapN(x, 32)];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const k = y * 32 + x;
      const e = cel.d2[k] - cel.d1[k];
      if (e < 1.0) { c.dot(x, y, V[4]); continue; }
      if (e < 2.0) { c.dot(x, y, V[3]); continue; }
      // interiors glow softly towards the border and are dark in the middle; a slow shimmer field modulates it
      const t = clamp(cel.d1[k] / 6.6 + (sh[k] - 0.5) * 0.55, 0, 1);
      c.dot(x, y, dpick([V[0], V[1], V[1], V[2]], t, x, y, 1));
    }
  }
  // faint inner hexagon
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const k = y * 32 + x;
      const e = cel.d2[k] - cel.d1[k];
      if (e > 5.0 && e < 6.0 && ((x + y) & 1) === 0) c.dot(x, y, V[2]);
    }
  }
  // nodes where three cells meet
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const k = y * 32 + x;
      if (cel.d2[k] - cel.d1[k] > 1.3) continue;
      const ids = new Set();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) ids.add(N(x + dx, y + dy));
      if (ids.size >= 3) c.dot(x, y, V[5]);
    }
  }
  for (const [x, y] of poisson(rng, 32, 32, 5, 7)) c.dot(x, y, V[4]);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Portal: swirling arcs in violet / cyan / white
// ---------------------------------------------------------------------------------------------
function paintPortal() {
  const c = new Canvas(32, 32, true, V[0]);
  const rng = new RNG(5801);
  // four little vortices on a jittered lattice, each with two spiral arms that all turn the same way
  const pts = lattice(rng, 32, 32, 2, 2, 2.2, 0.35);
  const cel = cells(32, 32, pts);
  const TAU = Math.PI * 2;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const k = y * 32 + x;
      const r = cel.d1[k], th = Math.atan2(cel.vy[k], cel.vx[k]);
      const ph = (th / TAU) * 2 + r * 0.115 + cel.id[k] * 0.31;
      const a = ph - Math.floor(ph); // 0..1 along the arm cycle
      const fade = clamp(r / 3.5, 0, 1); // dark eye
      let col;
      if (a < 0.12) col = '#ffffff';
      else if (a < 0.22) col = CY[4];
      else if (a < 0.34) col = CY[3];
      else if (a < 0.5) col = V[3];
      else if (a < 0.72) col = V[2];
      else col = V[1];
      if (fade < 1 && ((x + y) & 1) === 0) col = V[1];
      if (r < 1.6) col = V[0];
      // dark rims where vortices meet
      if (cel.d2[k] - cel.d1[k] < 1.2) col = V[0];
      c.dot(x, y, col);
    }
  }
  for (const [x, y] of poisson(rng, 32, 32, 7, 6)) { c.dot(x, y, '#ffffff'); }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Portal swirl: ONE big vortex of three arms, wound tight towards a bright core and fading to black at the rim. Not tiled: it is the disc of a portal (black adds nothing, so it is
// used additively, over a dark veil), turned by rotating its UVs.
// ---------------------------------------------------------------------------------------------
function paintPortalSwirl() {
  const N = 64, TAU = Math.PI * 2;
  const c = new Canvas(N, N, false, '#000000');
  const ramp = ['#000000', V[0], V[1], V[2], V[3], CY[3], CY[4], '#ffffff'];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5 - N / 2) / (N / 2), dy = (y + 0.5 - N / 2) / (N / 2), r = Math.hypot(dx, dy);
      if (r >= 1) continue;
      const ph = (Math.atan2(dy, dx) / TAU) * 3 + Math.log(r + 0.1) * 1.5;      // three arms, wound tighter towards the middle
      const a = ph - Math.floor(ph);
      const arm = Math.pow(Math.max(0, 1 - Math.abs(a - 0.5) * 2), 1.2);
      const v = clamp(arm * Math.pow(1 - r, 0.4) * 0.95 + Math.pow(clamp(1 - r / 0.2), 1.5), 0, 1);
      c.dot(x, y, dpick(ramp, v, x, y, 1));
    }
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Beam: greyscale light shaft. Edges fade to black with dithering; used additively, tinted by vertex colours.
// ---------------------------------------------------------------------------------------------
const GREY = ['#000000', '#1c1c24', '#3c3c4c', '#66667a', '#9494ac', '#c8c8dc', '#f0f0ff', '#ffffff'];
function paintBeam() {
  const c = new Canvas(16, 64, true, GREY[0]);
  const nz = field(16, 64, 5902, 4, 8, 2, false);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.abs(x + 0.5 - 8) / 8; // 0 centre .. 1 edge
      let I = Math.pow(1 - d, 1.15);
      I *= 0.78 + 0.4 * nz[y * 16 + x];
      // a few bright vertical streaks
      if (x === 6 || x === 9) I += 0.1 * Math.sin((y / 64) * Math.PI * 2 * 3 + x);
      c.dot(x, y, dpick(GREY, clamp(I, 0, 1), x, y, 0));
    }
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Sun glow: radial white intensity with a dithered falloff (additive)
// ---------------------------------------------------------------------------------------------
function paintSunGlow() {
  const c = new Canvas(32, 32, false, GREY[0]);
  const G8 = ['#000000', '#141418', '#2c2c34', '#4c4c58', '#767686', '#a4a4b8', '#d4d4e8', '#ffffff'];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const r = Math.hypot(x + 0.5 - 16, y + 0.5 - 16) / 16;
      let I = clamp(1 - r, 0, 1);
      I = Math.pow(I, 1.7) * 1.15;
      c.dot(x, y, dpick(G8, clamp(I, 0, 1), x, y, 0));
    }
  }
  return c;
}

export function magicTextures() {
  return {
    crystal_violet: rec(paintCrystal(V), false, false),
    crystal_cyan: rec(paintCrystal([CY[0], CY[1], CY[2], CY[3], CY[4], '#eaffff']), false, false),
    lantern_glass_off: rec(paintLantern(false), false, false),
    lantern_glass_on: rec(paintLantern(true), false, false),
    barrier: rec(paintBarrier(), true, false, { roll: 'xy' }),
    portal: rec(paintPortal(), true, false, { roll: 'xy' }),
    portal_swirl: rec(paintPortalSwirl(), false, false),
    beam: rec(paintBeam(), true, false),
    sun_glow: rec(paintSunGlow(), false, false),
  };
}
