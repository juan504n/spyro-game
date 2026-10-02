// Trees and bushes for Gloaming Vale.
import { lump, lumps, tube, shade, TAU, lerp, clamp, mulc, card, cross, num, int, oneOf, swayOK } from './util.js';

// ---- palettes: albedo tints per canopy texture: [dark underside, bright crown] (baked lighting multiplies these) -------
const CANOPY = {
  leaves_green: { dark: [0.64, 0.74, 0.68], light: [1.16, 1.14, 0.86] },
  leaves_teal: { dark: [0.62, 0.74, 0.8], light: [1.02, 1.14, 1.06] },
  leaves_autumn: { dark: [0.7, 0.6, 0.62], light: [1.14, 1.02, 0.9] },
  leaves_blossom: { dark: [0.8, 0.74, 0.84], light: [1.08, 1.06, 1.08] },       // Frostbloom Hollow: trees in blossom, and frosted ones
  leaves_frost: { dark: [0.74, 0.8, 0.92], light: [1.04, 1.08, 1.14] },
};
export const canopyOf = (name) => CANOPY[name] || CANOPY.leaves_green;
const SWAY_TREE = 10;                                  // world-height limit for canopy sway (see swayOK)
const SWAY_GROUND = 8;
const canopyName = (v, def = 'leaves_green') => (CANOPY[v] ? v : def);
const sizeName = (v) => oneOf(v, ['s', 'm', 'l'], 'm');

const SIZES = {
  s: { trunk: 3.8, tr: 0.62, R: 2.7 },
  m: { trunk: 4.4, tr: 0.78, R: 3.4 },
  l: { trunk: 5.2, tr: 0.92, R: 4.0 },
};

/** per-lobe colour: every lobe is dark underneath and bright on its crown (reads as separate fluffy lumps). */
function lobeColor(pal, baseY, topY) {
  return (s) => {
    const rr = s.r * (s.sy ?? 1);
    const g = clamp((s.c[1] - baseY) / (topY - baseY));
    const tone = s.tone ?? 1;
    return shade(s.c[1] - rr, mulc(pal.dark, lerp(0.9, 1.06, g) * tone), s.c[1] + rr * 0.95, mulc(pal.light, lerp(0.88, 1.06, g) * tone), 0.05);
  };
}

/**
 * Canopy of foliage lumps around C = [x, y, z] (y = the canopy's equator).  Returns lump specs (prop frame).
 * style: number of satellites n, top lump, bumps.
 */
function canopySpecs(r, C, R, { n = 4, bumps = 2, style = 'dense' } = {}) {
  const [cx, cy, cz] = C;
  const lobed = style !== 'dense';
  const specs = [lobed
    ? { c: [cx, cy + R * 0.3, cz], r: R * 0.8, sx: 1.05, sy: 0.85, detail: 'o1', noise: 0.14, rot: r.float(0, 3), rotX: r.float(-0.3, 0.3), tone: 1 }
    : { c: [cx, cy + R * 0.28, cz], r: R * 0.95, sx: 1.05, sy: 0.82, detail: 1, noise: 0.14, rot: r.float(0, 3), tone: 1 }];
  const a0 = r.float(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + r.float(-0.25, 0.25);
    const d = lobed ? R * r.float(0.78, 0.9) : R * r.float(0.6, 0.76);
    const rr = lobed ? R * r.float(0.5, 0.6) * (n > 4 ? 0.9 : 1) : R * r.float(0.5, 0.62);
    specs.push({
      c: [cx + Math.cos(a) * d, cy + R * r.float(-0.02, lobed ? 0.34 : 0.26), cz + Math.sin(a) * d],
      r: rr, sy: 0.86, detail: 'o1', noise: 0.2, rot: r.float(0, 3), rotX: r.float(-0.5, 0.5), rotZ: r.float(-0.5, 0.5), tone: r.float(0.94, 1.08),
    });
  }
  specs.push({ c: [cx + r.float(-0.5, 0.5), cy + R * (lobed ? 0.95 : 0.98), cz + r.float(-0.5, 0.5)], r: R * (lobed ? 0.56 : 0.52), sy: 0.82, detail: 'o1', noise: 0.18, rot: r.float(0, 3), rotX: r.float(-0.5, 0.5), tone: 1.06 });
  for (let i = 0; i < bumps; i++) {
    const a = r.float(0, TAU), d = R * r.float(0.85, 1.05);
    specs.push({ c: [cx + Math.cos(a) * d, cy + R * r.float(0.1, 0.5), cz + Math.sin(a) * d], r: R * r.float(0.28, 0.36), sy: 0.9, detail: 0, noise: 0.22, tone: r.float(0.94, 1.06) });
  }
  return specs;
}

/** Lowest canopy surface y above (x,z) (analytic, ignores noise) or null when no lump covers the point. */
function undersideY(specs, x, z) {
  let best = null;
  for (const s of specs) {
    const rx = s.r * (s.sx ?? 1) * 0.86, rz = s.r * (s.sz ?? 1) * 0.86, ry = s.r * (s.sy ?? 1) * 0.86;
    const dx = (x - s.c[0]) / rx, dz = (z - s.c[2]) / rz;
    const q = dx * dx + dz * dz;
    if (q < 0.8) {
      const yb = s.c[1] - ry * Math.sqrt(1 - q);
      if (best === null || yb < best) best = yb;
    }
  }
  return best;
}

/** trunk = tube from below ground up into the canopy, with a flare and three root wedges. Returns nothing. */
function trunk(bark, r, Ht, tr, lx, lz, topY, { segs = 6, tile = 3, roots = 3, dark = [0.5, 0.46, 0.52], light = [1.0, 0.94, 0.9] } = {}) {
  const col = shade(0, dark, Ht * 0.7, light, 0.04);
  tube(bark, [[0, -0.4, 0], [0, 0.45, 0], [lx * 0.4, Ht * 0.5, lz * 0.4], [lx, topY, lz]],
    [tr * 1.7, tr * 1.22, tr * 0.96, tr * 0.62], { segs, tile, color: col });
  const ra = r.float(0, TAU);
  for (let i = 0; i < roots; i++) {
    const a = ra + (i / roots) * TAU + r.float(-0.4, 0.4);
    const c = Math.cos(a), s = Math.sin(a);
    tube(bark, [[c * tr * 0.7, 0.75, s * tr * 0.7], [c * (tr + 1.5), -0.2, s * (tr + 1.5)]], [tr * 0.55, 0], { segs: 4, tile, color: col });
  }
}

/** Round-canopied broadleaf tree: flared trunk, three root wedges, cluster of foliage lumps. */
export function treeRound(kit, { x, z, rot = 0, scale = 1, y, canopy, size, style, sats }) {
  canopy = canopyName(canopy); size = sizeName(size); style = oneOf(style, ['lobed', 'dense'], 'lobed'); sats = sats ? int(sats, 4, 2, 6) : 0;
  const r = kit.rng(x, z, 11);
  const S = SIZES[size] || SIZES.m;
  const R = S.R * r.float(0.94, 1.08), Ht = S.trunk * r.float(0.94, 1.08), tr = S.tr * r.float(0.94, 1.06);
  const lean = r.float(0, TAU), lm = r.float(0.03, 0.08) * Ht;
  const lx = Math.cos(lean) * lm, lz = Math.sin(lean) * lm;
  const pal = canopyOf(canopy);
  const sw = swayOK(kit, x, z, y, SWAY_TREE) ? { sway: true } : {};
  kit.at(x, z, { rot, scale, y }, () => {
    const cy = Ht + R * 0.45;
    trunk(kit.b('bark'), r, Ht, tr, lx, lz, cy + R * 0.2, { segs: size === 's' ? 5 : 6 });
    lumps(kit.b(canopy, sw), r, canopySpecs(r, [lx, cy, lz], R, { n: sats || (size === 's' ? 3 : size === 'l' ? 5 : 4), bumps: size === 'l' ? 2 : size === 's' ? 0 : 1, style }),
      { tile: 4, smooth: 0.55, colorFor: lobeColor(pal, Ht, Ht + R * 1.9) });
    kit.caster(lx * 0.5, lz * 0.5, R * 0.55, Ht + R * 1.6, 0.42);
    kit.cyl(0, 0, tr * 1.1, 0, Ht + 1);
  });
}

// ------------------------------------------------------------------------------------------------------------------
// Pine: stacked star-shaped bough tiers.
// ------------------------------------------------------------------------------------------------------------------
function tier(b, r, cy, R, h, n, o) {
  const rot = r.float(0, TAU);
  const ring = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const rr = R * (i % 2 ? 0.74 : 1.0) * r.float(0.9, 1.08);
    ring.push([Math.sin(a) * rr, cy - (i % 2 ? 0 : h * 0.14), Math.cos(a) * rr]);
  }
  const apex = [r.float(-0.15, 0.15), cy + h, r.float(-0.15, 0.15)];
  const hub = [0, cy + h * 0.18, 0];
  const tile = o.tile;
  const uv = (p) => [p[0] / tile, p[2] / tile];
  for (let i = 0; i < n; i++) {
    const A = ring[i], B = ring[(i + 1) % n];
    b.tri(A, B, apex, uv(A), uv(B), uv(apex), o);
    b.tri(B, A, hub, uv(B), uv(A), uv(hub), { ...o, color: o.under || o.color });
  }
}

const PINE_TINT = { dark: [0.72, 0.9, 0.82], light: [1.12, 1.16, 0.98], under: [0.78, 0.98, 0.92] };
const PINE = {
  s: { H: 11, R: 2.5, tiers: 5 },
  m: { H: 14, R: 3.1, tiers: 6 },
  l: { H: 16.5, R: 3.6, tiers: 7 },
};

export function treePine(kit, { x, z, rot = 0, scale = 1, y, size }) {
  size = sizeName(size);
  const r = kit.rng(x, z, 23);
  const P = PINE[size] || PINE.m;
  const H = P.H * r.float(0.94, 1.08), R = P.R * r.float(0.94, 1.08), nT = Math.max(4, P.tiers + r.int(-1, 2));
  const nSides = r.int(7, 10), taper = r.float(0.75, 1.0);
  kit.at(x, z, { rot, scale, y }, () => {
    const bark = kit.b('bark');
    const bc = shade(0, [0.46, 0.42, 0.48], 3, [0.9, 0.84, 0.82], 0.04);
    tube(bark, [[0, -0.4, 0], [0.05, 0.4, 0], [0, H * 0.35, 0], [0, H * 0.8, 0]], [0.78, 0.52, 0.36, 0.14], { segs: 5, tile: 3, color: bc });
    const y0 = H * 0.2;                       // lowest tier's base
    const span = H * 0.92 - y0;
    const dy = span / nT;
    const pine = kit.b('pine');
    const pp = (kit.skin && kit.skin.palettes && kit.skin.palettes.pine) || PINE_TINT;      // (a realm's skin may swap the tints with the texture: pine_snow)
    for (let i = 0; i < nT; i++) {
      const t = i / (nT - 1);
      const rr = lerp(R, R * 0.28, Math.pow(t, taper)) * r.float(0.93, 1.07);
      const h = dy * 1.55 * lerp(1, 0.78, t);
      const cy = y0 + i * dy;
      const dark = lerp(0.6, 1.02, t);
      tier(pine, r, cy, rr, h, nSides, {
        tile: 4, smooth: 0,
        color: shade(y0, pp.dark, H, pp.light, 0.06),
        under: mulc(pp.under, dark + 0.2),
      });
    }
    // top spike
    tube(pine, [[0, H * 0.9, 0], [0, H * 0.99, 0]], [0.16, 0], { segs: 4, tile: 3, color: [1.05, 1.15, 0.95] });
    kit.caster(0, 0, R * 0.5, H * 0.95, 0.4);
    kit.cyl(0, 0, 0.62, 0, H * 0.5);
  });
}

// ------------------------------------------------------------------------------------------------------------------
// Birch: slender pale trunk, airy vertical foliage clusters.
// ------------------------------------------------------------------------------------------------------------------
export function treeBirch(kit, { x, z, rot = 0, scale = 1, y, canopy }) {
  canopy = canopyName(canopy, 'leaves_autumn');
  const r = kit.rng(x, z, 37);
  const H = r.float(8.4, 10.4);
  const pal = canopyOf(canopy);
  const lean = r.float(0, TAU), lm = r.float(0.4, 1.0);
  const lx = Math.cos(lean) * lm, lz = Math.sin(lean) * lm;
  const sw = swayOK(kit, x, z, y, SWAY_TREE) ? { sway: true } : {};
  kit.at(x, z, { rot, scale, y }, () => {
    const bark = kit.b('bark_pale');
    const bc = shade(0, [0.7, 0.68, 0.74], 3, [1.1, 1.08, 1.06], 0.03);
    // slightly S-curved slender trunk
    const sway = r.float(-0.35, 0.35);
    const pts = [[0, -0.3, 0], [lx * 0.1, 0.5, lz * 0.1], [lx * 0.4 + sway, H * 0.4, lz * 0.4], [lx * 0.75 - sway * 0.6, H * 0.72, lz * 0.75], [lx, H * 0.96, lz]];
    tube(bark, pts, [0.6, 0.42, 0.33, 0.25, 0.14], { segs: 5, tile: 3, color: bc });
    // crown: an airy ovoid of separate clumps (top, upper ring, lower ring) centred on the trunk top
    const cy = H * 0.84, cx = lx, cz = lz;
    const specs = [];
    const c1 = r.float(0, TAU);
    specs.push({ c: [cx + r.float(-0.2, 0.2), cy + 2.0, cz + r.float(-0.2, 0.2)], r: 1.45 * r.float(0.95, 1.1), sy: 1.05, detail: 'o1', noise: 0.2, rot: r.float(0, 3), rotX: r.float(-0.8, 0.8), rotZ: r.float(-0.8, 0.8), tone: 1.06 });
    const nU = 3;
    for (let i = 0; i < nU; i++) {
      const a = c1 + (i / nU) * TAU + r.float(-0.25, 0.25), d = r.float(1.25, 1.6);
      specs.push({ c: [cx + Math.cos(a) * d, cy + r.float(0.5, 1.2), cz + Math.sin(a) * d], r: r.float(1.2, 1.5), sy: r.float(1.0, 1.2), detail: 'o1', noise: 0.22, rot: r.float(0, 3), rotX: r.float(-0.8, 0.8), rotZ: r.float(-0.8, 0.8), tone: r.float(0.94, 1.06) });
    }
    const nL = 2;
    for (let i = 0; i < nL; i++) {
      const a = c1 + 0.9 + (i / nL) * TAU + r.float(-0.3, 0.3), d = r.float(0.9, 1.3);
      specs.push({ c: [cx + Math.cos(a) * d, cy - r.float(0.7, 1.3), cz + Math.sin(a) * d], r: r.float(0.95, 1.2), sy: r.float(1.05, 1.25), detail: 'o1', noise: 0.22, rot: r.float(0, 3), rotX: r.float(-0.8, 0.8), rotZ: r.float(-0.8, 0.8), tone: r.float(0.9, 1.0) });
      const t = specs[specs.length - 1].c;
      tube(bark, [[lx * 0.7, H * (0.62 + i * 0.05), lz * 0.7], [t[0] * 0.92, t[1] - 0.2, t[2] * 0.92]], [0.12, 0.06], { segs: 4, tile: 3, color: bc });
    }
    lumps(kit.b(canopy, sw), r, specs, { tile: 4, smooth: 0.5, colorFor: lobeColor(pal, cy - 2, cy + 3.4) });
    kit.caster(lx * 0.6, lz * 0.6, 1.6, H * 1.05, 0.34);
    kit.cyl(0, 0, 0.5, 0, H * 0.6);
  });
}

// ------------------------------------------------------------------------------------------------------------------
// Lantern tree: round tree with amber lanterns hanging on cords (the signature Gloaming tree).
// ------------------------------------------------------------------------------------------------------------------
function lantern(kit, x, y, z, s, glowOpts) {
  // y = top attachment point of the cord's lower end; lantern hangs below
  const w = 0.42 * s, bh = 0.95 * s;
  const glass = kit.b('lantern_glass_on');
  const brass = kit.b('metal_brass');
  const top = y - 0.16 * s, bot = top - bh;
  // body: 4 quads with the glass texture (emissive)
  const P = (sx, sz, yy) => [x + sx * w, yy, z + sz * w];
  const faces = [[[-1, 1], [1, 1]], [[1, 1], [1, -1]], [[1, -1], [-1, -1]], [[-1, -1], [-1, 1]]];
  for (const [a, b] of faces) {
    glass.quad(P(a[0], a[1], bot), P(b[0], b[1], bot), P(b[0], b[1], top), P(a[0], a[1], top), { uv: [0, 0, 1, 1], emissive: 1, color: [0.95, 0.92, 0.85] });
  }
  // cap (pyramid) and base plate in brass
  const cw = w * 1.25;
  const Q = (sx, sz, yy, k = cw) => [x + sx * k, yy, z + sz * k];
  const apex = [x, top + 0.42 * s, z];
  for (const [a, b] of faces) brass.tri(Q(a[0], a[1], top), Q(b[0], b[1], top), apex, [0, 0], [1, 0], [0.5, 1], { emissive: 0.5, color: [0.95, 0.85, 0.7] });
  brass.quad(Q(-1, -1, bot, w * 1.05), Q(1, -1, bot, w * 1.05), Q(1, 1, bot, w * 1.05), Q(-1, 1, bot, w * 1.05), { uv: [0, 0, 1, 1], emissive: 0.5, color: [0.85, 0.75, 0.6] });
  kit.glow(x, (top + bot) / 2, z, glowOpts);
}

export function treeLantern(kit, { x, z, rot = 0, scale = 1, y, canopy, size, lanterns }) {
  canopy = canopyName(canopy, 'leaves_teal'); size = sizeName(size); lanterns = int(lanterns, 4, 1, 8);
  const r = kit.rng(x, z, 41);
  const S = SIZES[size] || SIZES.m;
  const R = S.R * r.float(0.96, 1.06), Ht = S.trunk * r.float(0.96, 1.05), tr = S.tr;
  const lean = r.float(0, TAU), lm = r.float(0.03, 0.06) * Ht;
  const lx = Math.cos(lean) * lm, lz = Math.sin(lean) * lm;
  const pal = canopyOf(canopy);
  const sw = swayOK(kit, x, z, y, SWAY_TREE) ? { sway: true } : {};
  kit.at(x, z, { rot, scale, y }, () => {
    const cy = Ht + R * 0.45;
    trunk(kit.b('bark'), r, Ht, tr, lx, lz, cy + R * 0.2, { segs: 6 });
    const specs = canopySpecs(r, [lx, cy, lz], R, { n: size === 's' ? 3 : 4, bumps: 0, style: 'lobed' });
    lumps(kit.b(canopy, sw), r, specs, { tile: 4, smooth: 0.55, colorFor: lobeColor(pal, Ht, Ht + R * 1.9) });
    // lanterns hang on cords from the underside of the foliage, spread around the trunk
    const cord = kit.b(null, { double: true });
    const a0 = r.float(0, TAU);
    for (let i = 0; i < lanterns; i++) {
      const a = a0 + (i / lanterns) * TAU + r.float(-0.3, 0.3);
      let d = R * r.float(0.55, 0.85), ub = null, px = 0, pz = 0;
      for (let tries = 0; tries < 4 && ub === null; tries++, d *= 0.8) {
        px = lx + Math.cos(a) * d; pz = lz + Math.sin(a) * d;
        ub = undersideY(specs, px, pz);
      }
      if (ub === null) continue;
      const len = r.float(0.7, 1.5);
      const ly = Math.max(ub - len, 2.9);          // top of the lantern
      cross(cord, px, ly, pz, 0.13, ub + 0.4 - ly, i * 1.3 + r.float(0, 1), { uv: [0, 0, 1, 1], color: [0.36, 0.26, 0.2], normal: [0, 1, 0] });
      lantern(kit, px, ly + 0.16, pz, r.float(0.95, 1.15), { color: [1, 0.76, 0.4], size: 3.6, pool: 3.4, flicker: 0.12 });
    }
    kit.emitter(0, Ht + R * 0.5, 0, { kind: 'firefly', rate: 1.2, radius: R });
    kit.caster(lx * 0.5, lz * 0.5, R * 0.55, Ht + R * 1.6, 0.42);
    kit.cyl(0, 0, tr * 1.1, 0, Ht + 1);
  });
}

// ------------------------------------------------------------------------------------------------------------------
// Ancient giant tree: buttress roots, huge trunk, spreading limbs, canopy about 14 in radius, hanging vines.
// ------------------------------------------------------------------------------------------------------------------
export function treeGiant(kit, { x, z, rot = 0, scale = 1, y, canopy }) {
  canopy = canopyName(canopy, 'leaves_teal');
  const r = kit.rng(x, z, 157);
  const pal = canopyOf(canopy);
  const tr = 2.2 * r.float(0.95, 1.05);
  const Ht = 9.6, R = 14 * r.float(0.96, 1.04);
  const sw = swayOK(kit, x, z, y, SWAY_TREE) ? { sway: true } : {};
  const swG = swayOK(kit, x, z, y, SWAY_GROUND);
  kit.at(x, z, { rot, scale, y }, () => {
    const bark = kit.b('bark');
    const barkCol = shade(0, [0.46, 0.42, 0.5], 12, [1.0, 0.94, 0.9], 0.04);
    // trunk
    tube(bark, [[0, -0.7, 0], [0, 0.9, 0], [0.3, 3.8, 0.1], [0.6, 7.0, 0.3], [0.3, 10.2, 0.1], [0, 14.2, 0]],
      [tr * 1.95, tr * 1.42, tr * 1.08, tr * 0.96, tr * 0.86, tr * 0.6], { segs: 8, tile: 3.4, color: barkCol });
    // buttress roots
    const nR = 6, ra = r.float(0, TAU);
    for (let i = 0; i < nR; i++) {
      const a = ra + (i / nR) * TAU + r.float(-0.3, 0.3), c = Math.cos(a), s = Math.sin(a);
      const L = r.float(4.6, 6.4);
      tube(bark, [[c * tr * 0.9, 3.4, s * tr * 0.9], [c * (tr + 2.0), 1.2, s * (tr + 2.0)], [c * (tr + L), -0.35, s * (tr + L)]],
        [tr * 0.6, tr * 0.38, 0.1], { segs: 5, tile: 3.4, color: barkCol });
    }
    // limbs into the canopy
    const nL = 4, la = r.float(0, TAU);
    const specs = [{ c: [0.5, Ht + 5.4, 0.2], r: R * 0.52, sy: 0.8, detail: 1, noise: 0.14, rot: r.float(0, 3), tone: 1 }];
    for (let i = 0; i < nL; i++) {
      const a = la + (i / nL) * TAU + r.float(-0.3, 0.3), c = Math.cos(a), s = Math.sin(a);
      const d = R * r.float(0.5, 0.62), yy = Ht + r.float(2.6, 4.2);
      tube(bark, [[c * tr * 0.5, Ht - 1.6 + i * 0.5, s * tr * 0.5], [c * d * 0.5, Ht + 0.6 + i * 0.4, s * d * 0.5], [c * d * 0.95, yy - 1.2, s * d * 0.95]],
        [tr * 0.55, tr * 0.42, tr * 0.28], { segs: 6, tile: 3.4, color: barkCol });
    }
    // canopy: outer ring of broad lobes, upper ring, crown
    const nO = 7;
    const oa = r.float(0, TAU);
    for (let i = 0; i < nO; i++) {
      const a = oa + (i / nO) * TAU + r.float(-0.2, 0.2);
      const d = R * r.float(0.62, 0.72);
      specs.push({
        c: [Math.cos(a) * d, Ht + r.float(2.8, 5.0), Math.sin(a) * d], r: R * r.float(0.36, 0.42), sy: 0.78, detail: 'o1', noise: 0.2,
        rot: r.float(0, 3), rotX: r.float(-0.4, 0.4), rotZ: r.float(-0.4, 0.4), tone: r.float(0.94, 1.08),
      });
    }
    const nU = 4;
    for (let i = 0; i < nU; i++) {
      const a = oa + 0.4 + (i / nU) * TAU + r.float(-0.3, 0.3);
      const d = R * r.float(0.28, 0.4);
      specs.push({ c: [Math.cos(a) * d, Ht + R * r.float(0.5, 0.58), Math.sin(a) * d], r: R * r.float(0.28, 0.33), sy: 0.82, detail: 'o1', noise: 0.2, rot: r.float(0, 3), rotX: r.float(-0.4, 0.4), tone: r.float(1.0, 1.1) });
    }
    specs.push({ c: [r.float(-1, 1), Ht + R * 0.74, r.float(-1, 1)], r: R * 0.27, sy: 0.8, detail: 'o1', noise: 0.18, rot: r.float(0, 3), tone: 1.1 });
    for (let i = 0; i < 4; i++) {
      const a = r.float(0, TAU), d = R * r.float(0.85, 1.0);
      specs.push({ c: [Math.cos(a) * d, Ht + r.float(3, 5.5), Math.sin(a) * d], r: R * r.float(0.15, 0.2), sy: 0.9, detail: 0, noise: 0.22, tone: r.float(0.94, 1.06) });
    }
    lumps(kit.b(canopy, sw), r, specs, { tile: 5, smooth: 0.55, colorFor: lobeColor(pal, Ht + 0.5, Ht + R * 0.95) });
    // hanging vines under the canopy
    const vine = kit.b('vine', swG ? { mode: 'cutout', double: true, sway: true } : { mode: 'cutout', double: true });
    for (let i = 0; i < 16; i++) {
      const a = r.float(0, TAU), d = R * r.float(0.45, 0.95);
      const px = Math.cos(a) * d, pz = Math.sin(a) * d;
      const top = Ht + 2.4 + r.float(0, 1.2);
      const len = r.float(4.0, 7.0);
      cross(vine, px, top - len, pz, 0.9, len, r.float(0, 3), { normal: [0, 1, 0], color: [0.95, 1.05, 0.9] });
    }
    kit.emitter(0, Ht + 2, 0, { kind: 'firefly', rate: 3, radius: R * 0.8 });
    kit.emitter(0, Ht + R * 0.5, 0, { kind: 'leaf', rate: 0.8, radius: R * 0.8 });
    kit.caster(0, 0, R * 0.42, Ht + R * 0.9, 0.5);
    kit.cyl(0, 0, tr * 1.25, 0, Ht + 4);
  });
}

// ------------------------------------------------------------------------------------------------------------------
// Bush
// ------------------------------------------------------------------------------------------------------------------
export function bush(kit, { x, z, rot = 0, scale = 1, y, canopy, flowers }) {
  canopy = canopyName(canopy);
  const r = kit.rng(x, z, 53);
  const pal = canopyOf(canopy);
  const R = r.float(0.85, 1.05);
  const sw = swayOK(kit, x, z, y, SWAY_GROUND) ? { sway: true } : {};
  kit.at(x, z, { rot, scale, y }, () => {
    const specs = [{ c: [0, R * 0.55, 0], r: R, sy: 0.9, detail: 1, noise: 0.16, rot: r.float(0, 3), tone: 1.04 }];
    const nS = 3 + r.int(0, 2);
    const a0 = r.float(0, TAU);
    for (let i = 0; i < nS; i++) {
      const a = a0 + (i / nS) * TAU + r.float(-0.4, 0.4);
      const d = R * r.float(0.7, 0.9);
      const rr = R * r.float(0.55, 0.72);
      specs.push({ c: [Math.cos(a) * d, rr * 0.55, Math.sin(a) * d], r: rr, sy: 0.9, detail: 'o1', noise: 0.2, rot: r.float(0, 3), rotX: r.float(-0.4, 0.4), tone: r.float(0.94, 1.06) });
    }
    lumps(kit.b(canopy, sw), r, specs, {
      tile: 3.5, smooth: 0.7, minY: -0.05, floorY: -0.05, skipDown: 0.3,
      colorFor: (s) => shade(0, mulc(pal.dark, 1.05 * s.tone), R * 1.7, mulc(pal.light, 1.02 * s.tone), 0.05),
    });
    if (flowers) {
      const ALL = ['flower_pink', 'flower_yellow', 'flower_blue'];
      const kinds = Array.isArray(flowers) ? flowers.filter((k) => ALL.includes(k)) : ALL.includes(flowers) ? [flowers] : ALL;
      if (!kinds.length) kinds.push(...ALL);
      const n = 6 + r.int(0, 3);
      for (let i = 0; i < n; i++) {
        // a point on the surface of one of the lumps, on its upper half
        const sp = specs[i % specs.length];
        const a = r.float(0, TAU), el = r.float(0.15, 1.15);
        const dx = Math.cos(a) * Math.cos(el), dy = Math.sin(el), dz = Math.sin(a) * Math.cos(el);
        const px = sp.c[0] + dx * sp.r * 0.95, py = sp.c[1] + dy * sp.r * (sp.sy ?? 1) * 0.92, pz = sp.c[2] + dz * sp.r * 0.95;
        card(kit.b(r.pick(kinds), { mode: 'cutout', double: true, ...sw }), px, py - 0.12, pz, 0.62, 0.62, Math.atan2(dx, dz), { lean: 0.45, color: [1.08, 1.08, 1.08] });
      }
    }
    kit.caster(0, 0, R * 0.9, 1.4, 0.3);
  });
}

export const TREES = {
  tree_round: { fn: treeRound, size: 9, note: 'round-canopy broadleaf tree; canopy leaves_green|leaves_teal|leaves_autumn, size s|m|l', defaults: { canopy: 'leaves_green', size: 'm' }, anchors: { crown: [0, 8.5, 0] } },
  tree_pine: { fn: treePine, size: 6.5, note: 'stacked-bough pine; size s|m|l', defaults: { size: 'm' } },
  tree_birch: { fn: treeBirch, size: 5, note: 'slender pale birch with airy foliage', defaults: { canopy: 'leaves_autumn' } },
  tree_lantern: { fn: treeLantern, size: 9, note: 'signature round tree hung with glowing amber lanterns', defaults: { canopy: 'leaves_teal', size: 'm', lanterns: 4 }, anchors: { crown: [0, 8.5, 0] } },
  tree_giant: { fn: treeGiant, size: 30, note: 'ancient giant tree: trunk r~2.2, canopy radius ~14, 26 tall; buttress roots, vines', defaults: { canopy: 'leaves_teal' }, anchors: { crown: [0, 20, 0] } },
  bush: { fn: bush, size: 2.4, note: 'low leafy bush; flowers:true adds blossoms', defaults: { canopy: 'leaves_green' } },
};
