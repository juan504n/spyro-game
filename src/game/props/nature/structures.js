// Ruins, waterfall, floating island: the one-off landmarks.
import { lump, lumps, tube, shade, prism, card, cross, TAU, lerp, clamp, mulc, norm3, cross3, dot3, bilerp, num, int, sizeK, oneOf } from './util.js';
import { rock, column, stoneTex } from './rocks.js';

/** Quad whose winding is fixed up so the face points along `hint` (robust for arches / irregular slabs). */
function quadFacing(b, a, bb, c, d, hint, o = {}) {
  const n = cross3([bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], [d[0] - a[0], d[1] - a[1], d[2] - a[2]]);
  const flip = dot3(n, hint) < 0;
  b.quad(...(flip ? [a, d, c, bb] : [a, bb, c, d]), { ...o, uv: o.uv });
}

// ------------------------------------------------------------------------------------------------------------------
// Ruins
// ------------------------------------------------------------------------------------------------------------------
const BRICK = { dark: [0.62, 0.62, 0.7], light: [1.12, 1.08, 1.06] };

/** Broken pillars in a loose colonnade with fallen drums. */
export function ruinPillars(kit, { x, z, rot = 0, scale = 1, y, count }) {
  count = int(count, 4, 1, 8);
  const r = kit.rng(x, z, 137);
  kit.at(x, z, { rot, scale, y }, () => {
    const brick = kit.b('brick_mossy');
    const col = (H) => shade(-0.3, BRICK.dark, H, BRICK.light, 0.05);
    const spacing = 3.5;
    for (let i = 0; i < count; i++) {
      const px = (i - (count - 1) / 2) * spacing + r.float(-0.3, 0.3), pz = r.float(-0.7, 0.7);
      const t = count === 1 ? 0 : i / (count - 1);
      const H = lerp(5.8, 1.5, Math.pow(t, 0.9)) * r.float(0.85, 1.12);
      const R0 = 0.92 * r.float(0.95, 1.05);
      const sides = 7;
      const rot0 = r.float(0, 1);
      const ang = [];
      for (let k = 0; k < sides; k++) ang.push(rot0 + (k / sides) * TAU);
      const rings = [[-0.4, R0 * 1.3, 0], [0.5, R0 * 1.25, 0], [0.5, R0 * 0.98, 0], [H * 0.5, R0 * 0.92, 0], [H, R0 * 0.88, 1]];
      const P = rings.map(([yy, rr, broken]) => ang.map((a) => {
        const jy = broken ? r.float(-0.55, 0.25) : 0;
        return [px + Math.sin(a) * rr, yy + jy, pz + Math.cos(a) * rr];
      }));
      const c = col(H);
      for (let j = 0; j < rings.length - 1; j++) {
        if (j === 1) {
          // plinth top ledge: flat annulus between the wide and the narrow ring (faces up)
          for (let k = 0; k < sides; k++) {
            const k2 = (k + 1) % sides;
            brick.tri(P[1][k], P[2][k2], P[2][k], [0, 0], [1, 1], [0, 1], { color: c }, [0, 1, 0]);
            brick.tri(P[1][k], P[1][k2], P[2][k2], [0, 0], [1, 0], [1, 1], { color: c }, [0, 1, 0]);
          }
          continue;
        }
        for (let k = 0; k < sides; k++) {
          const k2 = (k + 1) % sides;
          const BL = P[j][k], BR = P[j][k2], TR = P[j + 1][k2], TL = P[j + 1][k];
          const u0 = (k / sides) * 2.2, u1 = ((k + 1) / sides) * 2.2, v0 = BL[1] / 3, v1 = TL[1] / 3;
          brick.tri(BL, BR, TR, [u0, v0], [u1, v0], [u1, v1], { color: c });
          brick.tri(BL, TR, TL, [u0, v0], [u1, v1], [u0, v1], { color: c });
        }
      }
      // jagged top: fan to a point a bit below the highest vertex
      const top = P[rings.length - 1];
      const apex = [px + r.float(-0.2, 0.2), H - 0.35, pz + r.float(-0.2, 0.2)];
      for (let k = 0; k < sides; k++) {
        const A = top[k], B = top[(k + 1) % sides];
        brick.tri(A, B, apex, [A[0] / 3, A[2] / 3], [B[0] / 3, B[2] / 3], [apex[0] / 3, apex[2] / 3], { color: c });
      }
      kit.cyl(px, pz, R0 * 1.1, 0, H);
    }
    // fallen drums
    const nd = Math.max(1, Math.round(count / 2));
    for (let i = 0; i < nd; i++) {
      const dx = (r.float(-0.4, 0.4) + (i ? 0.5 : -0.5)) * count * spacing * 0.5, dz = r.float(2.0, 3.2) * (i ? 1 : -1);
      const yaw = r.float(0, TAU), len = r.float(1.4, 2.0), rr = 0.85;
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      tube(brick, [[dx - cs * len / 2, rr * 0.8, dz + sn * len / 2], [dx + cs * len / 2, rr * 0.8, dz - sn * len / 2]], [rr, rr * 0.96], {
        segs: 7, tile: 3, aspect: 1, uRep: 2, color: shade(0, BRICK.dark, 2, BRICK.light, 0.05), capStart: 'flat', capEnd: 'flat',
      });
      kit.cyl(dx, dz, rr * 1.2, 0, rr * 1.6);
    }
    // moss tufts and rubble
    for (let i = 0; i < 2; i++) {
      const a = r.float(0, TAU), d = r.float(0.5, 2.5);
      rock(kit, r, [Math.cos(a) * d + (i ? 2 : -2), 0.2, Math.sin(a) * d + 1.5], r.float(0.4, 0.7), { detail: 'o1', tex: 'brick_mossy', moss: false, sy: 0.7 });
    }
    kit.caster(0, 0, count * spacing * 0.32, 4.5, 0.3);
  });
}

/** Broken ruined arch, about 8 wide: one tall pier carries a partial arch; the other pier is snapped low. */
export function ruinArch(kit, { x, z, rot = 0, scale = 1, y, h }) {
  h = num(h, 4.8, 3, 8);
  const r = kit.rng(x, z, 139);
  kit.at(x, z, { rot, scale, y }, () => {
    const brick = kit.b('brick_mossy');
    const D = 1.9;                       // depth (z)
    const rin = 2.3, rout = 4.0;         // arch radii around (0, h)
    const c = (yy) => shade(-0.4, BRICK.dark, h + 4, BRICK.light, 0.05);
    const col = c();
    // ---- piers ---------------------------------------------------------------------------------------------
    const pier = (x0, x1, top, jag) => {
      const z0 = -D / 2, z1 = D / 2;
      const Tj = () => top - (jag ? r.float(0, 0.6) : 0);
      const tl = [x0, Tj(), z1], tr = [x1, Tj(), z1], trb = [x1, Tj(), z0], tlb = [x0, Tj(), z0];
      const bl = [x0, -0.5, z1], br = [x1, -0.5, z1], brb = [x1, -0.5, z0], blb = [x0, -0.5, z0];
      const o = { color: col };
      const uv = (w, hh) => [0, 0, w / 2.6, hh / 2.6];
      brick.quad(bl, br, tr, tl, { ...o, uv: uv(x1 - x0, top + 0.5) });                // front
      brick.quad(brb, blb, tlb, trb, { ...o, uv: uv(x1 - x0, top + 0.5) });            // back
      brick.quad(br, brb, trb, tr, { ...o, uv: uv(D, top + 0.5) });                    // right
      brick.quad(blb, bl, tl, tlb, { ...o, uv: uv(D, top + 0.5) });                    // left
      brick.tri(tl, tr, trb, [0, 0], [1, 0], [1, 1], o);
      brick.tri(tl, trb, tlb, [0, 0], [1, 1], [0, 1], o);
    };
    pier(-4.0, -2.3, h, false);
    pier(2.3, 4.0, h * 0.62, true);
    kit.box(-3.15, 0, 0.85, D / 2, 0, h);
    kit.box(3.15, 0, 0.85, D / 2, 0, h * 0.62);
    // ---- arch: sweep a rectangle along a circle ----------------------------------------------------------------
    const K = 8;
    const th0 = Math.PI, dth = (Math.PI * 0.94) / 10;
    const sec = [];
    for (let k = 0; k <= K; k++) {
      const th = th0 - k * dth;
      const jr = k === K ? r.float(-0.25, 0.25) : 0;
      const ro = rout + jr * 0.6, ri = rin + (k === K ? r.float(0, 0.3) : 0);
      const cs = Math.cos(th), sn = Math.sin(th);
      const zf = D / 2 - (k === K ? r.float(0, 0.5) : 0), zb = -D / 2;
      sec.push({
        inF: [ri * cs, h + ri * sn, zf], outF: [ro * cs, h + ro * sn, zf], outB: [ro * cs, h + ro * sn, zb], inB: [ri * cs, h + ri * sn, zb], th,
      });
    }
    for (let k = 0; k < K; k++) {
      const s0 = sec[k], s1 = sec[k + 1];
      const thm = (s0.th + s1.th) / 2;
      const rad = [Math.cos(thm), Math.sin(thm), 0];
      const tone = k % 2 ? 0.94 : 1.04;
      const o = { color: (x_, y_, z_) => mulc(col(x_, y_, z_), tone) };
      const seg = Math.hypot(s1.outF[0] - s0.outF[0], s1.outF[1] - s0.outF[1]) / 2.6;
      quadFacing(brick, s0.outF, s0.outB, s1.outB, s1.outF, rad, { ...o, uv: [0, 0, D / 2.6, seg] });
      quadFacing(brick, s0.inF, s0.inB, s1.inB, s1.inF, [-rad[0], -rad[1], 0], { ...o, uv: [0, 0, D / 2.6, seg] });
      quadFacing(brick, s0.inF, s0.outF, s1.outF, s1.inF, [0, 0, 1], { ...o, uv: [0, 0, (rout - rin) / 2.6, seg] });
      quadFacing(brick, s0.inB, s0.outB, s1.outB, s1.inB, [0, 0, -1], { ...o, uv: [0, 0, (rout - rin) / 2.6, seg] });
    }
    const e = sec[K];
    quadFacing(brick, e.inF, e.outF, e.outB, e.inB, [Math.sin(e.th), -Math.cos(e.th), 0], { color: col, uv: [0, 0, 1, 1] });
    // ---- rubble ----------------------------------------------------------------------------------------------
    for (let i = 0; i < 3; i++) {
      const a = r.float(0, TAU);
      const px = 3.6 + Math.cos(a) * 1.6, pz = Math.sin(a) * 2.2 + (i - 1) * 0.6;
      rock(kit, r, [px, 0.25, pz], r.float(0.5, 0.85), { detail: 'o1', tex: 'brick_mossy', moss: false, sy: 0.7 });
    }
    lump(kit.b('moss'), r, [-3.15, h + 0.02, 0], 1.0, { detail: 'o1', noise: 0.1, sy: 0.16, sx: 0.9, sz: 0.95, tile: 3, smooth: 0.3, skipDown: 0.05, color: [0.95, 1.1, 0.85] });
    kit.caster(0, 0, 3.0, h * 0.8, 0.3);
  });
}

// ------------------------------------------------------------------------------------------------------------------
// Waterfall: translucent scrolling sheet over a rock face, foam at the base, mist.
// ------------------------------------------------------------------------------------------------------------------
/**
 * Faces +z.  Origin = water level at the foot of the fall; the lip is at local y = h.  h 12-30, w 4-12.
 * The sheet is a 'half' (50% blend) material with a scrolling texture; foam is a cutout ring on the pool surface.
 */
export function waterfall(kit, { x, z, rot = 0, scale = 1, y, h, w, warm }) {
  h = num(h, 18, 6, 34); w = num(w, 6, 3, 14); warm = !!warm;
  const r = kit.rng(x, z, 149);
  kit.at(x, z, { rot, scale, y }, () => {
    const tex = stoneTex(warm);
    const pal = warm ? [[0.62, 0.5, 0.5], [1.15, 1.0, 0.92]] : [[0.56, 0.54, 0.68], [1.1, 1.04, 1.02]];
    const stone = kit.b(tex);
    const wetCol = shade(-0.5, [0.46, 0.5, 0.62], h * 0.5, pal[1], 0.05);
    const dryCol = shade(0, pal[0], h + 3, pal[1], 0.05);
    // ---- rock face behind and beside the water: an amphitheatre of faceted columns ------------------------------
    const span = w + 13;
    const nCol = Math.max(5, Math.round(span / 2.7));
    for (let i = 0; i < nCol; i++) {
      const t = (i + 0.5) / nCol;                                   // 0..1 across the wall
      const cx = (t - 0.5) * span + r.float(-0.3, 0.3);
      const mid = 1 - Math.pow(Math.abs(t - 0.5) * 2, 1.6) * 0.5;   // taller in the middle
      const hh = (h + 2.0) * mid * r.float(0.88, 1.08);
      const cz = -3.6 + Math.pow(Math.abs(t - 0.5) * 2, 2) * 3.0 + r.float(-0.4, 0.4);   // wall curls toward the viewer at the ends
      const rr = (span / nCol) * r.float(0.62, 0.78);
      const lean = (t - 0.5) * 1.4 * r.float(0.5, 1);
      column(stone, r, [
        { y: -0.9, r: rr * 1.3, dx: cx, dz: cz }, { y: hh * 0.5, r: rr * 1.05, dx: cx + lean * 0.4, dz: cz }, { y: hh, r: rr * 0.8, dx: cx + lean, dz: cz },
      ], { sides: 6, tile: 3, color: dryCol, peak: [r.float(-0.3, 0.3), r.float(0.8, 2.0), r.float(-0.3, 0.3)], rot0: r.float(0, 1), jitter: 0.12 });
    }
    // cheeks: shorter wet columns hugging the water on both sides
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const cx = sd * (w / 2 + 1.3 + i * 2.1), hh = h * [0.96, 0.7, 0.42][i] * r.float(0.92, 1.05);
        const rr = 1.5 * r.float(0.95, 1.25) * (1 - i * 0.1);
        const cz = -0.6 - i * 0.7 + r.float(-0.2, 0.2);
        column(stone, r, [
          { y: -0.9, r: rr * 1.35, dx: cx, dz: cz }, { y: hh * 0.5, r: rr * 1.08, dx: cx + sd * 0.15, dz: cz - 0.1 }, { y: hh, r: rr * 0.8, dx: cx + sd * 0.4, dz: cz - 0.3 },
        ], { sides: 6, tile: 3, color: i === 0 ? wetCol : dryCol, peak: [0, r.float(0.6, 1.4), 0], rot0: r.float(0, 1), jitter: 0.12 });
      }
    }
    // lip: a couple of flat rocks the water pours over
    for (let i = 0; i < 3; i++) {
      const lx = (i - 1) * (w * 0.36) + r.float(-0.3, 0.3);
      lump(stone, r, [lx, h - 0.35, -0.55], w * 0.24 + 0.6, { detail: 'o1', noise: 0.15, sy: 0.45, sz: 1.0, tile: 3, smooth: 0, color: dryCol, skipDown: 0.4 });
    }
    // ---- the sheet ---------------------------------------------------------------------------------------
    const cols = Math.max(2, Math.round(w / 2.4)), rows = Math.max(2, Math.ceil(h / 6));
    const sheet = kit.b('waterfall', { mode: 'half', double: true, scroll: [0, -1.2] });
    const P = (i, j) => {
      const t = i / rows;                                 // 0 top -> 1 bottom
      const ww = w * (1 + 0.14 * t);
      const zz = 0.95 + 0.22 * t + 0.7 * t * t * t * t;
      return [(j / cols - 0.5) * ww, h * (1 - t), zz];
    };
    const alphaOf = (i, j) => (j === 0 || j === cols ? 0.6 : 0.95) * (i === 0 ? 0.85 : 1);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = P(i + 1, j), b = P(i + 1, j + 1), c = P(i, j + 1), d = P(i, j);
        const u0 = a[0] / 2.4, u1 = b[0] / 2.4, v0 = (h - a[1]) / 5, v1 = (h - d[1]) / 5;
        // v grows downward (the scroll moves the pattern toward +v = down the fall)
        sheet.quad(a, b, c, d, {
          uv: [u0, v0, u1, v1], emissive: 0.55, color: [0.95, 1.02, 1.1],
          tints: undefined, alphas: [alphaOf(i + 1, j), alphaOf(i + 1, j + 1), alphaOf(i, j + 1), alphaOf(i, j)],
        }, [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]]);
      }
    }
    // ---- foam and mist at the foot ------------------------------------------------------------------------
    const foam = kit.b('foam', { mode: 'cutout', double: true });
    const fz = 0.95 + 0.22 + 0.7 + 0.9;
    for (let i = 0; i < 5; i++) {
      const px = (i - 2) * (w * 0.24), pz = fz + r.float(-0.3, 0.9);
      flatQuad(foam, px, 0.14, pz, w * 0.34 + 1.2, r.float(0, TAU), { color: [1.05, 1.08, 1.12], emissive: 0.4, tile: 3.4 });
    }
    // vertical foam curtain at the base of the sheet
    const bw = w * 1.14;
    foam.quad([-bw / 2, -0.1, 1.95], [bw / 2, -0.1, 1.95], [bw / 2, 1.4, 1.75], [-bw / 2, 1.4, 1.75], { uv: [0, 0, bw / 3.4, 0.5], emissive: 0.4, color: [1.05, 1.08, 1.12] }, [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]]);
    // boulders flanking the pool
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const Rk = r.float(0.9, 1.7);
        rock(kit, r, [sd * (w / 2 + 1.6 + i * 1.6 + r.float(0, 0.6)), Rk * 0.25, 1.4 + i * 1.8], Rk, { warm, detail: 'o1', sy: 0.85 });
      }
    }
    kit.emitter(0, 1.4, fz, { kind: 'mist', rate: 8, radius: w * 0.42 });
    kit.emitter(0, h - 0.5, 1.4, { kind: 'mist', rate: 2, radius: w * 0.3 });
    kit.box(0, -1.4, span / 2, 1.3, 0, h, {});
  });
}

/** A flat cutout square on a horizontal plane whose UVs tile (foam). */
function flatQuad(b, x, y, z, s, yaw, o) {
  const cs = Math.cos(yaw) * s / 2, sn = Math.sin(yaw) * s / 2;
  const BL = [x - cs + sn, y, z + sn + cs], BR = [x + cs + sn, y, z - sn + cs], TR = [x + cs - sn, y, z - sn - cs], TL = [x - cs - sn, y, z + sn - cs];
  b.quad(BL, BR, TR, TL, { ...o, uv: [0, 0, s / (o.tile || 3.4), s / (o.tile || 3.4)] }, [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]]);
}

// ------------------------------------------------------------------------------------------------------------------
// Floating island
// ------------------------------------------------------------------------------------------------------------------
/** Triangle whose winding is fixed so its face points along `hint`. */
function triFacing(b, p0, p1, p2, uv0, uv1, uv2, hint, o = {}) {
  const n = cross3([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]]);
  if (dot3(n, hint) < 0) b.tri(p0, p2, p1, uv0, uv2, uv1, o);
  else b.tri(p0, p1, p2, uv0, uv1, uv2, o);
}

/**
 * Floating island of radius r.  Walkable grass top at local y = 0 (collider: cylinder r*0.92, y -8..0, top:true),
 * turf lip, dirt band, faceted cliff underside tapering to a point, hanging rocks, roots, vines and (optionally)
 * glowing crystals under the belly.  The game puts trees / beacons on top.
 */
export function floatingIsland(kit, { x, z, rot = 0, scale = 1, y, r: R, crystals, crystal, vines, warm }) {
  R = num(R, 12, 5, 26); crystals = int(crystals, 2, 0, 4); vines = vines !== false; warm = !!warm;
  const cname = oneOf(crystal, ['violet', 'cyan'], 'cyan');
  const rng = kit.rng(x, z, 151);
  const k = R / 12;                                            // depth / feature scale
  kit.at(x, z, { rot, scale, y }, () => {
    const n = 16;
    const rho = [];
    for (let i = 0; i < n; i++) rho.push(R * rng.float(0.98, 1.07));
    const a0 = rng.float(0, 1);
    const ang = (i, phi = 0) => a0 + ((i + phi) / n) * TAU;
    // rings: [radius factor, y, angular half-step offset]
    const RINGS = [
      { f: 1.0, y: 0, ph: 0 }, { f: 1.035, y: -0.55, ph: 0 }, { f: 0.95, y: -2.1 * Math.sqrt(k), ph: 0.5 }, { f: 0.7, y: -5.2 * k, ph: 0 },
      { f: 0.44, y: -8.6 * k, ph: 0.5 }, { f: 0.19, y: -11.6 * k, ph: 0 },
    ];
    const tipY = -14.2 * k;
    const ringPts = RINGS.map((g, ri) => rho.map((rr, i) => {
      const a = ang(i, g.ph);
      const jr = ri >= 3 ? rng.float(0.9, 1.1) : 1;
      return [Math.sin(a) * rr * g.f * jr, g.y + (ri >= 3 ? rng.float(-0.4, 0.4) * k : 0), Math.cos(a) * rr * g.f * jr];
    }));
    const tip = [rng.float(-0.6, 0.6) * k, tipY, rng.float(-0.6, 0.6) * k];
    // ---- top --------------------------------------------------------------------------------------------------
    const grass = kit.b('grass_a');
    const gc = [1.0, 1.04, 0.96];
    const T = ringPts[0];
    for (let i = 0; i < n; i++) {
      const A = T[i], B = T[(i + 1) % n];
      grass.tri([0, 0, 0], A, B, [0, 0], [A[0] / 6, A[2] / 6], [B[0] / 6, B[2] / 6], { color: gc }, [0, 1, 0]);
    }
    // ---- turf lip (grass_b), dirt band, cliff -------------------------------------------------------------
    const lipB = kit.b('grass_b'), dirt = kit.b('dirt');
    const cliff = kit.b(stoneTex(warm));
    const band = (b, r0, r1, colFn, tile, ph0) => {
      // zig-zag triangle strip between two rings whose vertices are offset by half a step
      for (let i = 0; i < n; i++) {
        const i2 = (i + 1) % n;
        const A0 = r0[i], A1 = r0[i2];
        const B0 = ph0 ? r1[i] : r1[i], B1 = ph0 ? r1[i2] : r1[i2];
        const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
        const hint = (p, q, u) => { const m = mid(p, mid(q, u)); return [m[0], 0.15, m[2]]; };
        const uvf = (p, nrm) => (Math.abs(nrm[0]) > Math.abs(nrm[2]) ? [p[2] / tile, p[1] / tile] : [p[0] / tile, p[1] / tile]);
        const tri3 = (p0, p1, p2) => {
          const cen = mid(p0, mid(p1, p2));
          const nrm = norm3([cen[0], 0.1, cen[2]]);
          triFacing(b, p0, p1, p2, uvf(p0, nrm), uvf(p1, nrm), uvf(p2, nrm), [cen[0], Math.min(0.15, -cen[1] * 0.02), cen[2]], { color: colFn });
        };
        tri3(A0, A1, B0);
        tri3(A1, B1, B0);
      }
    };
    band(lipB, ringPts[0], ringPts[1], shade(-1, [0.5, 0.62, 0.5], 0, [0.95, 1.05, 0.9], 0.05), 5, false);
    band(dirt, ringPts[1], ringPts[2], shade(-4, [0.6, 0.54, 0.52], -0.5, [0.98, 0.9, 0.84], 0.05), 4, true);
    const stonePal = warm ? [[0.62, 0.52, 0.52], [1.12, 1.0, 0.92]] : [[0.56, 0.54, 0.7], [1.08, 1.02, 1.04]];
    const cliffCol = shade(-15 * k, stonePal[0], -2, stonePal[1], 0.05);
    for (let ri = 2; ri < RINGS.length - 1; ri++) band(cliff, ringPts[ri], ringPts[ri + 1], cliffCol, 3.5, true);
    // tip fan
    const last = ringPts[RINGS.length - 1];
    for (let i = 0; i < n; i++) {
      const A = last[i], B = last[(i + 1) % n];
      const cen = [(A[0] + B[0] + tip[0]) / 3, (A[1] + B[1] + tip[1]) / 3, (A[2] + B[2] + tip[2]) / 3];
      triFacing(cliff, A, B, tip, [A[0] / 3.5, A[1] / 3.5], [B[0] / 3.5, B[1] / 3.5], [tip[0] / 3.5, tip[1] / 3.5], [cen[0], -0.2, cen[2]], { color: cliffCol });
    }
    // ---- hanging rocks -------------------------------------------------------------------------------------------
    const nRocks = 6;
    for (let i = 0; i < nRocks; i++) {
      const ri = 2 + (i % 3);
      const p = ringPts[ri][Math.floor(rng.float(0, n))];
      const Rr = rng.float(1.0, 2.2) * Math.sqrt(k) * (ri === 4 ? 0.8 : 1);
      const out = norm3([p[0], 0, p[2]]);
      rock(kit, rng, [p[0] + out[0] * Rr * 0.25, p[1] - Rr * 0.3, p[2] + out[2] * Rr * 0.25], Rr, { warm, moss: false, detail: 'o1', sy: rng.float(0.85, 1.15), noise: 0.32, tile: 3.5, floorY: -1e9, skipDown: 2 });
    }
    // ---- roots and vines dangling from the lip ---------------------------------------------------------------------
    const bark = kit.b('bark');
    const nRoots = 5;
    for (let i = 0; i < nRoots; i++) {
      const idx = Math.floor((i / nRoots) * n + rng.float(0, 2)) % n;
      const p = ringPts[2][idx], out = norm3([p[0], 0, p[2]]);
      const Ln = rng.float(4.5, 8) * Math.sqrt(k);
      const pts = [
        [p[0] * 0.98, p[1] + 0.4, p[2] * 0.98], [p[0] + out[0] * 0.5, p[1] - Ln * 0.3, p[2] + out[2] * 0.5],
        [p[0] + out[0] * 0.3, p[1] - Ln * 0.65, p[2] + out[2] * 0.3], [p[0] + out[0] * 0.1, p[1] - Ln, p[2] + out[2] * 0.1],
      ];
      tube(bark, pts, [0.42, 0.3, 0.18, 0.02], { segs: 4, tile: 3, color: shade(-10, [0.5, 0.46, 0.52], 0, [0.95, 0.9, 0.86], 0.04) });
    }
    if (vines) {
      const vine = kit.b('vine', { mode: 'cutout', double: true, sway: true });
      const nV = Math.round(6 + R / 4);
      for (let i = 0; i < nV; i++) {
        const idx = Math.floor(rng.float(0, n));
        const p = ringPts[2][idx], out = norm3([p[0], 0, p[2]]);
        const hh = rng.float(3.5, 6.5) * Math.sqrt(k);
        const yaw = Math.atan2(out[0], out[2]);
        card(vine, p[0] + out[0] * 0.35, p[1] + 0.4 - hh, p[2] + out[2] * 0.35, 0.95, hh, yaw, { color: [0.95, 1.05, 0.9], normal: [out[0], 0.3, out[2]] });
      }
    }
    // ---- crystals under the belly ------------------------------------------------------------------------------------
    const spec = { tex: cname === 'violet' ? 'crystal_violet' : 'crystal_cyan', tint: cname === 'violet' ? [1.05, 0.95, 1.12] : [0.92, 1.08, 1.12], glow: cname === 'violet' ? [0.66, 0.46, 1.0] : [0.4, 0.86, 1.0] };
    for (let i = 0; i < crystals; i++) {
      const ri = 3, idx = Math.floor((i / Math.max(crystals, 1)) * n + rng.float(0, 3)) % n;
      const p = ringPts[ri][idx], out = norm3([p[0], 0, p[2]]);
      const d = norm3([out[0] * 0.35, -1, out[2] * 0.35]);
      const Lc = rng.float(3.0, 4.6) * Math.sqrt(k), rc = rng.float(0.5, 0.7) * Math.sqrt(k);
      const B = [p[0] * 0.96, p[1] + 0.4, p[2] * 0.96];
      const b = kit.b(spec.tex);
      prism(b, B, d, rc, Lc - rc * 1.7, rc * 1.7, 6, { color: shade(-15 * k, mulc(spec.tint, 1.25), -3, mulc(spec.tint, 0.75), 0.06), emissive: 0.55, taper: 0.9, rot0: rng.float(0, 1), jitter: 0.05 }, rng);
      if (i === 0) kit.glow(B[0] + d[0] * Lc * 0.5, B[1] + d[1] * Lc * 0.5, B[2] + d[2] * Lc * 0.5, { color: spec.glow, size: 8 * Math.sqrt(k), pool: 0, flicker: 0.05 });
    }
    if (crystals) kit.emitter(0, -6 * k, 0, { kind: 'sparkle', rate: 2, radius: R * 0.5 });
    // ---- rim stones (outside the walkable disc) -----------------------------------------------------------------------
    for (let i = 0; i < 4; i++) {
      const idx = Math.floor(rng.float(0, n)), rr = rho[idx] * 1.0;
      const a = ang(idx);
      rock(kit, rng, [Math.sin(a) * rr * 0.995, 0.1, Math.cos(a) * rr * 0.995], rng.float(0.5, 0.9), { warm, moss: true, detail: 'o1', sy: 0.8, floorY: -0.3, skipDown: 0.4 });
    }
    kit.cyl(0, 0, R * 0.92, -8, 0, { top: true });
  });
}

function lineup(kit, { x, z }) {
  ruinPillars(kit, { x: x - 12, z });
  ruinArch(kit, { x: x + 8, z });
}

export const STRUCTURES = {
  ruin_pillars: { fn: ruinPillars, size: 13, note: 'broken brick_mossy colonnade with fallen drums; count', defaults: { count: 4 } },
  ruin_arch: { fn: ruinArch, size: 9, note: 'broken ruined arch ~8 wide (pier + partial arch + stub); walk through along local z', defaults: { h: 4.8 } },
  waterfall: { fn: waterfall, size: 16, note: 'waterfall facing +z: origin at the pool surface, lip at y=h; h 12-30, w 4-12; foam + mist', defaults: { h: 18, w: 6 } },
  floating_island: { fn: floatingIsland, size: 28, note: 'floating island: flat grass top at y=0 (walkable disc r*0.92, collider y0=-8), cliff belly, roots, vines, crystals', defaults: { r: 12, crystals: 2 } },
  _structures: { fn: lineup, size: 60, note: 'dev lineup' },
};
