// Rocks, cliffs, spires, arches and stepping stones.
import { lump, lumps, tube, shade, TAU, lerp, clamp, mulc, norm3, num, int, sizeK, oneOf } from './util.js';

// tints (albedo multipliers): cool violet-grey stone, moss caps, warm sandstone variant
const STONE = { dark: [0.68, 0.62, 0.66], light: [1.16, 1.06, 0.98] };
const STONE_WARM = { dark: [0.72, 0.62, 0.6], light: [1.2, 1.08, 0.96] };
const MOSS = { dark: [0.66, 0.78, 0.62], light: [0.92, 1.04, 0.8] };

export const stoneTex = (warm) => (warm ? 'cliff_warm' : 'cliff');
const stonePal = (warm) => (warm ? STONE_WARM : STONE);

/** One chunky half-buried rock at c (prop frame) with radius R.  Faces pointing up become moss when moss = true. */
export function rock(kit, r, c, R, { warm = false, moss = true, detail = 1, noise = 0.3, sy = 0.78, sx = 1, sz = 1, tex, tile = 3 } = {}) {
  const pal = stonePal(warm);
  const rr = R * sy;
  lump(kit.b(tex || stoneTex(warm)), r, c, R, {
    detail, noise, sx, sy, sz, rot: r.float(0, 3), rotX: r.float(-0.12, 0.12), rotZ: r.float(-0.12, 0.12), tile, smooth: 0,
    floorY: -R * 0.5, skipDown: 0.55,
    color: shade(c[1] - rr * 0.9, pal.dark, c[1] + rr, pal.light, 0.05),
    topB: moss ? kit.b('moss') : null, topAt: 0.5, topTile: 3, topColor: shade(c[1] - rr * 0.9, MOSS.dark, c[1] + rr, MOSS.light, 0.05),
  });
}

/** Cluster of 2-5 half buried boulders: one big, the rest smaller, all colliding. */
export function rockCluster(kit, { x, z, rot = 0, scale = 1, y, count, warm, moss, size, tex }) {
  count = int(count, 3, 1, 6); size = sizeK(size); warm = !!warm; moss = moss !== false; tex = oneOf(tex, ['cliff', 'cliff_warm', 'far_rock'], undefined);
  const r = kit.rng(x, z, 61);
  kit.at(x, z, { rot, scale, y }, () => {
    const R0 = r.float(1.5, 1.95) * size;
    const rocks = [{ c: [0, R0 * 0.3, 0], R: R0 }];
    const a0 = r.float(0, TAU);
    for (let i = 1; i < count; i++) {
      const R = R0 * r.float(0.36, 0.66);
      const a = a0 + (i / count) * TAU + r.float(-0.5, 0.5);
      const d = R0 * 0.72 + R * r.float(0.6, 0.95);
      rocks.push({ c: [Math.cos(a) * d, R * 0.28, Math.sin(a) * d], R });
    }
    rocks.forEach((k, i) => {
      rock(kit, r, k.c, k.R, { warm, moss, tex, detail: i === 0 ? 1 : 'o1', sy: i === 0 ? r.float(0.95, 1.1) : r.float(0.8, 1.0), sx: r.float(0.9, 1.15), sz: r.float(0.9, 1.15) });
      kit.cyl(k.c[0], k.c[2], k.R * 0.85, 0, k.R * 1.1);
    });
    kit.caster(0, 0, R0 * 1.15, R0 * 1.4, 0.4);
  });
}

/** Big boulder (5-7 wide) with a couple of hangers-on. */
export function boulderBig(kit, { x, z, rot = 0, scale = 1, y, warm, moss, size }) {
  size = sizeK(size); warm = !!warm; moss = moss !== false;
  const r = kit.rng(x, z, 67);
  kit.at(x, z, { rot, scale, y }, () => {
    const R = r.float(3.0, 3.5) * size;
    rock(kit, r, [0, R * 0.36, 0], R, { warm, moss, detail: 1, noise: 0.28, sy: r.float(0.92, 1.05), sx: 1.1, sz: 1.0 });
    const a0 = r.float(0, TAU);
    for (let i = 0; i < 2; i++) {
      const a = a0 + i * 2.4 + r.float(-0.4, 0.4);
      const Rs = R * r.float(0.3, 0.44);
      const d = R * 0.92 + Rs * 0.4;
      rock(kit, r, [Math.cos(a) * d, Rs * 0.3, Math.sin(a) * d], Rs, { warm, moss, detail: 'o1', sy: 0.95 });
      kit.cyl(Math.cos(a) * d, Math.sin(a) * d, Rs * 0.85, 0, Rs * 1.1);
    }
    kit.cyl(0, 0, R * 0.9, 0, R * 1.5);
    kit.caster(0, 0, R * 1.1, R * 1.6, 0.45);
  });
}

// ------------------------------------------------------------------------------------------------------------------
// Faceted columns (spires, outcrops): irregular n-gon rings with jitter, capped by a broken peak.
// ------------------------------------------------------------------------------------------------------------------
/**
 * rings: [{ y, r, dx, dz }] bottom -> top.  Emits side quads (flat shaded) and a peaked top.
 * o: sides, tile, color, warm, peak = [dx, dy, dz] offset of the apex above the last ring.
 */
export function column(b, r, rings, { sides = 6, tile = 3, color, peak = [0, 1, 0], jitter = 0.14, rot0 = 0, capFlat = false, vOff } = {}) {
  const vo = vOff === undefined ? r.float(0, 1) : vOff;      // stagger the texture's moss strip between neighbouring columns
  const ang = [];
  for (let i = 0; i < sides; i++) ang.push(rot0 + ((i + r.float(-0.18, 0.18)) / sides) * TAU);
  const ringPts = rings.map((g) => ang.map((a) => {
    const k = 1 + r.float(-jitter, jitter);
    return [g.dx + Math.sin(a) * g.r * k, g.y, g.dz + Math.cos(a) * g.r * k];
  }));
  const o = { color };
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < sides; i++) {
      const i2 = (i + 1) % sides;
      const BL = ringPts[j][i], BR = ringPts[j][i2], TR = ringPts[j + 1][i2], TL = ringPts[j + 1][i];
      const u0 = (i / sides) * (TAU * rings[j].r) / tile, u1 = ((i + 1) / sides) * (TAU * rings[j].r) / tile;
      const v0 = BL[1] / tile + vo, v1 = TL[1] / tile + vo;
      b.tri(BL, BR, TR, [u0, v0], [u1, v0], [u1, v1], o);
      b.tri(BL, TR, TL, [u0, v0], [u1, v1], [u0, v1], o);
    }
  }
  const last = rings[rings.length - 1];
  const top = ringPts[rings.length - 1];
  const apex = [last.dx + peak[0], last.y + peak[1], last.dz + peak[2]];
  for (let i = 0; i < sides; i++) {
    const A = top[i], B = top[(i + 1) % sides];
    b.tri(A, B, apex, [A[0] / tile, A[2] / tile], [B[0] / tile, B[2] / tile], [apex[0] / tile, apex[2] / tile], o);
  }
}

/** Tall rock spire (10-16): a jagged main column plus a couple of shorter shards. */
export function rockSpire(kit, { x, z, rot = 0, scale = 1, y, h, warm, shards }) {
  warm = !!warm; shards = int(shards, 2, 0, 4);
  const r = kit.rng(x, z, 71);
  const H = num(h, 0, 4, 26) || r.float(11, 15);
  const pal = stonePal(warm);
  kit.at(x, z, { rot, scale, y }, () => {
    const b = kit.b(stoneTex(warm));
    const color = shade(0, pal.dark, H, pal.light, 0.05);
    const R0 = r.float(2.3, 2.9);
    const lx = r.float(-0.6, 0.6), lz = r.float(-0.6, 0.6);
    column(b, r, [
      { y: -0.8, r: R0 * 1.25, dx: 0, dz: 0 }, { y: H * 0.3, r: R0 * 0.95, dx: lx * 0.4, dz: lz * 0.4 },
      { y: H * 0.62, r: R0 * 0.68, dx: lx * 0.8, dz: lz * 0.8 }, { y: H * 0.9, r: R0 * 0.42, dx: lx, dz: lz },
    ], { sides: 6, tile: 4, color, peak: [lx * 0.3, H * 0.13, lz * 0.3], rot0: r.float(0, 1) });
    for (let i = 0; i < shards; i++) {
      const a = r.float(0, TAU), d = R0 * r.float(1.0, 1.3);
      const hh = H * r.float(0.35, 0.6), rr = R0 * r.float(0.42, 0.6);
      const sx = Math.cos(a) * d, sz = Math.sin(a) * d;
      column(b, r, [
        { y: -0.8, r: rr * 1.2, dx: sx, dz: sz }, { y: hh * 0.55, r: rr * 0.8, dx: sx * 1.03, dz: sz * 1.03 }, { y: hh * 0.92, r: rr * 0.5, dx: sx * 1.06, dz: sz * 1.06 },
      ], { sides: 5, tile: 3, color: shade(0, pal.dark, H, pal.light, 0.05), peak: [0, hh * 0.16, 0], rot0: r.float(0, 1) });
      kit.cyl(sx, sz, rr * 0.95, 0, hh);
    }
    kit.cyl(lx * 0.3, lz * 0.3, R0 * 1.0, 0, H * 0.9);
    kit.caster(0, 0, R0 * 0.85, H * 0.9, 0.45);
  });
}

/** Little rock pillar to hop across the lake: flat top at local y = h, walkable collider (top radius 1.7). */
export function steppingStone(kit, { x, z, rot = 0, scale = 1, y, h, warm }) {
  h = num(h, 4.6, 0.8, 14); warm = !!warm;
  const r = kit.rng(x, z, 73);
  const pal = stonePal(warm);
  kit.at(x, z, { rot, scale, y }, () => {
    const b = kit.b(stoneTex(warm));
    const sides = 9;
    const rings = [[-0.8, 2.7], [h * 0.35, 2.15], [h * 0.75, 1.95], [h, 1.78]];
    const ang = [];
    for (let i = 0; i < sides; i++) ang.push(((i + r.float(-0.12, 0.12)) / sides) * TAU);
    const jit = ang.map(() => 1 + r.float(-0.07, 0.07));
    const P = rings.map(([yy, rr], j) => ang.map((a, i) => [Math.sin(a) * rr * (j === rings.length - 1 ? 1 : jit[i]), yy, Math.cos(a) * rr * (j === rings.length - 1 ? 1 : jit[i])]));
    const color = shade(-0.8, [pal.dark[0] * 0.85, pal.dark[1] * 0.85, pal.dark[2] * 0.95], h, pal.light, 0.05);
    const totalH = h + 0.8;                     // one texture repeat over the whole height: the mossy strip lands under the cap
    for (let j = 0; j < rings.length - 1; j++) {
      for (let i = 0; i < sides; i++) {
        const i2 = (i + 1) % sides;
        const BL = P[j][i], BR = P[j][i2], TR = P[j + 1][i2], TL = P[j + 1][i];
        const u0 = (i / sides) * 5, u1 = ((i + 1) / sides) * 5, v0 = (BL[1] + 0.8) / totalH, v1 = (TL[1] + 0.8) / totalH;
        b.tri(BL, BR, TR, [u0, v0], [u1, v0], [u1, v1], { color });
        b.tri(BL, TR, TL, [u0, v0], [u1, v1], [u0, v1], { color });
      }
    }
    // mossy flat top
    const top = P[rings.length - 1];
    const m = kit.b('moss');
    const c = [0, h, 0];
    for (let i = 0; i < sides; i++) {
      const A = top[i], B = top[(i + 1) % sides];
      m.tri(c, A, B, [c[0] / 3.5, c[2] / 3.5], [A[0] / 3.5, A[2] / 3.5], [B[0] / 3.5, B[2] / 3.5], { color: [0.92, 1.0, 0.82] }, [0, 1, 0]);
    }
    kit.cyl(0, 0, 1.7, -0.8, h, { top: true });
    kit.caster(0, 0, 1.9, h, 0.2);
  });
}

/** Natural rock arch ~9 wide: a bent hexagonal rock tube standing on two chunky feet, moss on top. */
export function rockArch(kit, { x, z, rot = 0, scale = 1, y, warm, w, h }) {
  warm = !!warm; w = num(w, 9, 6, 14); h = num(h, 6.2, 4, 10);
  const r = kit.rng(x, z, 83);
  const pal = stonePal(warm);
  kit.at(x, z, { rot, scale, y }, () => {
    const b = kit.b(stoneTex(warm));
    const a = w / 2 - 1.3, n = 9;
    const pts = [], rad = [];
    for (let i = 0; i < n; i++) {
      const th = Math.PI - (i / (n - 1)) * Math.PI;
      const t = Math.sin(th);                                            // 0 at the feet, 1 at the crown
      pts.push([Math.cos(th) * a + r.float(-0.12, 0.12), Math.sin(th) * h * 0.9 + (i === 0 || i === n - 1 ? -0.4 : 0), r.float(-0.25, 0.25) * t]);
      rad.push(lerp(1.75, 1.15, Math.pow(t, 0.8)) * r.float(0.9, 1.1));
    }
    tube(b, pts, rad, { segs: 6, tile: 3, aspect: 1, smooth: 0, color: shade(-0.4, pal.dark, h * 0.95, pal.light, 0.05), rot0: r.float(0, 1) });
    // chunky feet
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const Rk = i === 0 ? r.float(2.0, 2.4) : r.float(0.9, 1.5);
        const ang = r.float(0, TAU), d = i === 0 ? 0 : 1.7 + r.float(0, 0.6);
        rock(kit, r, [sd * a + Math.cos(ang) * d, Rk * 0.3, Math.sin(ang) * d], Rk, { warm, moss: true, detail: i === 0 ? 1 : 'o1', sy: 0.8 });
      }
      kit.cyl(sd * a, 0, 1.9, 0, h * 0.5);
    }
    // moss on the crown (sits on the tube's top surface)
    const moss = kit.b('moss');
    for (let i = 0; i < 3; i++) {
      const j = 3 + i, p = pts[j];
      lump(moss, r, [p[0], p[1] + rad[j] * 0.72, p[2]], r.float(0.9, 1.25), { detail: 'o1', noise: 0.15, sy: 0.34, sx: 1.2, tile: 3, smooth: 0.3, skipDown: 0.05, color: [0.9, 1.02, 0.8] });
    }
    kit.caster(0, 0, a * 0.7, h * 0.8, 0.3);
  });
}

/** Wall-like cliff outcrop: a row of leaning faceted columns, len long, h high. */
export function cliffOutcrop(kit, { x, z, rot = 0, scale = 1, y, len, h, warm }) {
  len = num(len, 14, 4, 40); h = num(h, 6, 2, 16); warm = !!warm;
  const r = kit.rng(x, z, 79);
  const pal = stonePal(warm);
  kit.at(x, z, { rot, scale, y }, () => {
    const b = kit.b(stoneTex(warm));
    const n = Math.max(3, Math.round(len / 2.7));
    const step = len / n;
    for (let i = 0; i < n; i++) {
      const cx = -len / 2 + step * (i + 0.5) + r.float(-0.3, 0.3);
      const cz = r.float(-0.6, 0.6);
      const mid = 1 - Math.abs((i + 0.5) / n - 0.5) * 1.2;     // taller in the middle
      const hh = h * clamp(mid, 0.45, 1) * r.float(0.8, 1.15);
      const rr = step * r.float(0.62, 0.78);
      const lean = r.float(-0.35, 0.35);
      column(b, r, [
        { y: -0.9, r: rr * 1.25, dx: cx, dz: cz }, { y: hh * 0.5, r: rr * 1.0, dx: cx + lean * 0.4, dz: cz }, { y: hh * 0.92, r: rr * 0.72, dx: cx + lean, dz: cz },
      ], { sides: 5, tile: 3, color: shade(0, pal.dark, h, pal.light, 0.05), peak: [lean * 0.4, hh * 0.1, 0], rot0: r.float(0, 1), jitter: 0.12 });
    }
    kit.box(0, 0, len / 2, 1.4, 0, h * 0.7);
    kit.caster(0, 0, Math.min(len * 0.32, 4.5), h * 0.7, 0.35);
  });
}

function lineup(kit, { x, z }) {
  rockCluster(kit, { x: x - 16, z });
  rockCluster(kit, { x: x - 8, z, tex: 'far_rock' });
  rockCluster(kit, { x: x, z, warm: true, count: 4 });
  rockCluster(kit, { x: x + 8, z, warm: true, tex: 'far_rock', count: 4 });
  boulderBig(kit, { x: x + 20, z });
}

export const ROCKS = {
  rock_cluster: { fn: rockCluster, size: 7, note: 'half-buried boulder cluster with mossy caps; count 2-5, warm:true for sandstone, size scale', defaults: { count: 3 } },
  boulder_big: { fn: boulderBig, size: 9, note: 'big 5-7 wide boulder with satellites', defaults: {} },
  rock_spire: { fn: rockSpire, size: 8, note: 'tall jagged rock spire 10-16 (h param) with shards', defaults: {} },
  stepping_stone: { fn: steppingStone, size: 5, note: 'rock pillar with flat mossy top at y=h (walkable, r 1.7); origin at the bed', defaults: { h: 4.6 } },
  rock_arch: { fn: rockArch, size: 12, note: 'natural rock arch ~9 wide (w, h, warm); walk through along local z', defaults: { w: 9, h: 6.2 } },
  cliff_outcrop: { fn: cliffOutcrop, size: 14, note: 'wall of faceted rock columns; len, h, warm', defaults: { len: 14, h: 6 } },
  _rocks: { fn: lineup, size: 80, note: 'dev lineup' },
};
