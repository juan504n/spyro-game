// Crystals, runed standing stones, ruins.
import { lump, lumps, tube, shade, prism, TAU, lerp, clamp, mulc, norm3, num, int, sizeK, oneOf } from './util.js';
import { rock, stoneTex } from './rocks.js';

// ---- crystals ------------------------------------------------------------------------------------------------------
const CRYSTAL = {
  violet: { tex: 'crystal_violet', tint: [1.05, 0.95, 1.12], glow: [0.66, 0.46, 1.0] },
  cyan: { tex: 'crystal_cyan', tint: [0.92, 1.08, 1.12], glow: [0.4, 0.86, 1.0] },
};

/** One crystal pillar: base B, unit direction d. Brighter toward the tip (glowing core). */
function crystal(kit, r, spec, B, d, radius, L, tipL, { emissive = 0.5, sides = 6, baseFlat = false } = {}) {
  const b = kit.b(spec.tex);
  const tip = [B[0] + d[0] * (L + tipL), B[1] + d[1] * (L + tipL), B[2] + d[2] * (L + tipL)];
  const y0 = Math.min(B[1], tip[1]), y1 = Math.max(B[1], tip[1]);
  const t = spec.tint;
  const col = shade(y0, mulc(t, 0.72), y1, mulc(t, 1.22), 0.06);
  prism(b, B, d, radius, L, tipL, sides, { color: col, emissive, taper: 0.9, rot0: r.float(0, 1), baseFlat, jitter: 0.06 }, r);
}

/** Cluster of glowing crystals growing from a little rock bed. */
export function crystalCluster(kit, { x, z, rot = 0, scale = 1, y, color, count, size }) {
  count = int(count, 6, 1, 12); size = sizeK(size);
  const r = kit.rng(x, z, 113);
  const spec = CRYSTAL[color] || CRYSTAL.violet;
  kit.at(x, z, { rot, scale, y }, () => {
    let hMax = 0;
    for (let i = 0; i < count; i++) {
      const main = i === 0;
      const a = r.float(0, TAU);
      const dist = main ? 0 : r.float(0.7, 1.55) * size;
      const B = [Math.cos(a) * dist, -0.25, Math.sin(a) * dist];
      const lean = main ? r.float(0, 0.15) : r.float(0.2, 0.62);
      const d = norm3([Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean)]);
      const H = (main ? r.float(3.4, 4.6) : r.float(1.5, 3.3)) * size;
      const rad = (main ? r.float(0.5, 0.62) : r.float(0.3, 0.48)) * Math.sqrt(size);
      const tipL = rad * r.float(1.4, 1.9);
      crystal(kit, r, spec, B, d, rad, H - tipL, tipL, { emissive: 0.5 });
      hMax = Math.max(hMax, H * d[1]);
    }
    // rock bed
    const n = 3;
    const a0 = r.float(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU + r.float(-0.4, 0.4);
      const R = r.float(0.55, 0.9) * size;
      rock(kit, r, [Math.cos(a) * (1.1 * size), R * 0.2, Math.sin(a) * (1.1 * size)], R, { detail: 'o1', moss: false, sy: 0.7 });
    }
    kit.glow(0, hMax * 0.45, 0, { color: spec.glow, size: 5.5 * size, pool: 4.2 * size, flicker: 0.05 });
    kit.emitter(0, hMax * 0.8, 0, { kind: 'sparkle', rate: 2.5, radius: 1.3 * size });
    kit.cyl(0, 0, 1.3 * size, 0, hMax * 0.8);
    kit.caster(0, 0, 1.6 * size, hMax * 0.8, 0.3);
  });
}

/** Tall crystal spire (up to 9): a huge central shard ringed by leaning satellites and a stone collar. */
export function crystalSpire(kit, { x, z, rot = 0, scale = 1, y, color, h }) {
  h = num(h, 8, 2.5, 14);
  const r = kit.rng(x, z, 127);
  const spec = CRYSTAL[color] || CRYSTAL.violet;
  kit.at(x, z, { rot, scale, y }, () => {
    const H = h;
    const rad = H * 0.16;
    crystal(kit, r, spec, [0, -0.5, 0], norm3([r.float(-0.08, 0.08), 1, r.float(-0.08, 0.08)]), rad, H * 0.68, H * 0.32, { emissive: 0.55, sides: 6 });
    const n = 5;
    const a0 = r.float(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU + r.float(-0.3, 0.3);
      const dist = rad * r.float(1.5, 2.1);
      const lean = r.float(0.35, 0.7);
      const d = norm3([Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean)]);
      const HH = H * r.float(0.3, 0.6);
      const rr = rad * r.float(0.42, 0.62);
      const tipL = rr * r.float(1.5, 2.0);
      crystal(kit, r, spec, [Math.cos(a) * dist, -0.4, Math.sin(a) * dist], d, rr, HH - tipL, tipL, { emissive: 0.5, sides: 6 });
    }
    // stone collar
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + r.float(-0.3, 0.3);
      const R = r.float(0.9, 1.5) * (H / 8);
      rock(kit, r, [Math.cos(a) * rad * 2.0, R * 0.2, Math.sin(a) * rad * 2.0], R, { detail: 'o1', moss: false, sy: 0.72 });
    }
    kit.glow(0, H * 0.5, 0, { color: spec.glow, size: 9 * (H / 8), pool: 7 * (H / 8), flicker: 0.04 });
    kit.emitter(0, H * 0.9, 0, { kind: 'sparkle', rate: 4, radius: 1.8 });
    kit.cyl(0, 0, rad * 2.2, 0, H * 0.8);
    kit.caster(0, 0, rad * 2.0, H * 0.85, 0.35);
  });
}

// ---- standing stones -----------------------------------------------------------------------------------------------
/** Ring of runed monoliths around a glowing rune circle. */
export function standingStones(kit, { x, z, rot = 0, scale = 1, y, r: ringR, count, glowColor }) {
  ringR = num(ringR, 6, 2.5, 14); count = int(count, 7, 3, 14);
  if (!Array.isArray(glowColor) || glowColor.length < 3 || glowColor.some((v) => !Number.isFinite(v))) glowColor = [0.6, 0.4, 1.0];
  const rng = kit.rng(x, z, 131);
  kit.at(x, z, { rot, scale, y }, () => {
    const stone = kit.b('cliff');
    const runes = kit.b('rune_ring');
    const a0 = rng.float(0, TAU);
    for (let i = 0; i < count; i++) {
      const a = a0 + (i / count) * TAU + rng.float(-0.06, 0.06);
      const px = Math.sin(a) * ringR, pz = Math.cos(a) * ringR;
      const H = rng.float(4.0, 6.0), W = rng.float(1.15, 1.5), D = rng.float(0.8, 1.05);
      const lean = rng.float(-0.05, 0.05);
      // local frame of the stone: +z faces the ring centre
      const yaw = a + Math.PI;
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const P = (lx, ly, lz) => [px + lx * cs + lz * sn + lean * ly * 0.5, ly, pz - lx * sn + lz * cs];
      const w0 = W / 2, d0 = D / 2, w1 = w0 * 0.78, d1 = d0 * 0.78;
      const hL = H, hR = H * rng.float(0.86, 0.97);       // sloped, broken top
      const col = shade(0, [0.58, 0.55, 0.72], H, [1.1, 1.06, 1.16], 0.05);
      const o = { color: col };
      const bl = P(-w0, -0.6, d0), br = P(w0, -0.6, d0), fl = P(-w1, hL, d1 * 0.9), fr = P(w1, hR, d1 * 0.9);
      const blB = P(-w0, -0.6, -d0), brB = P(w0, -0.6, -d0), flB = P(-w1, hL, -d1 * 0.9), frB = P(w1, hR, -d1 * 0.9);
      const q = (a1, b1, c1, d1_, u, v) => stone.quad(a1, b1, c1, d1_, { ...o, uv: [0, 0, u, v] });
      // one texture repeat over the full height: the cliff texture's mossy strip lands on the top of the stone
      q(bl, br, fr, fl, W / 3, 1);                     // front (inner)
      q(brB, blB, flB, frB, W / 3, 1);                 // back
      q(br, brB, frB, fr, D / 3, 1);                   // right
      q(blB, bl, fl, flB, D / 3, 1);                   // left
      // top: two tris
      stone.tri(fl, fr, frB, [0, 0], [1, 0], [1, 1], o);
      stone.tri(fl, frB, flB, [0, 0], [1, 1], [0, 1], o);
      // glowing rune plate lying on the (battered) inner face
      const ry = H * 0.56, rs = W * 0.42;
      const zf = (yy) => d0 + (d1 * 0.9 - d0) * clamp((yy + 0.6) / (lerp(hL, hR, 0.5) + 0.6)) + 0.035;
      runes.quad(P(-rs, ry - rs, zf(ry - rs)), P(rs, ry - rs, zf(ry - rs)), P(rs, ry + rs, zf(ry + rs)), P(-rs, ry + rs, zf(ry + rs)),
        { uv: [0, 0, 1, 1], emissive: 0.85, color: [1.1, 1.0, 1.25] });
      kit.cyl(px, pz, W * 0.48, 0, H * 0.9);
    }
    // ground rune circle (decal disc) and its glow
    kit.b('rune_ring', { decal: true }).disc(ringR * 0.5, 16, { y: 0.06, uvDisc: true, emissive: 0.45, color: [1.05, 1.0, 1.2] });
    kit.glow(0, 0.6, 0, { color: glowColor, size: 6, pool: ringR * 0.75, flicker: 0.06 });
    kit.emitter(0, 0.5, 0, { kind: 'sparkle', rate: 3, radius: ringR * 0.45 });
    kit.caster(0, 0, 0.8, 5, 0.0);
  });
}

export const MAGIC = {
  crystal_cluster: { fn: crystalCluster, size: 5, note: 'glowing crystal cluster (color violet|cyan, count, size) with glow point + sparkles', defaults: { color: 'violet', count: 6 }, anchors: { core: [0, 1.8, 0] } },
  crystal_spire: { fn: crystalSpire, size: 7, note: 'tall crystal spire h up to 9 (color violet|cyan) with glow + sparkles', defaults: { color: 'violet', h: 8 }, anchors: { core: [0, 4, 0], tip: [0, 8, 0] } },
  standing_stones: { fn: standingStones, size: 16, note: 'ring of runed monoliths around a glowing rune circle; r (ring radius), count', defaults: { r: 6, count: 7 }, anchors: { center: [0, 0.1, 0] } },
};
