// Priority-2 props: banner_pole, torch_stand, haystack, cart, bench, scarecrow, boat, fountain, garden_plot.
import {
  PI, TAU, clamp, lerp, mulc, TINT, vgrad, grid, planar, strut, polar, frustum, quadUV, fan, annulus, cylBand,
} from './common.js';
import { lanternBody } from './details.js';
import { WATER_LEVEL } from '../../level.js';

const WARM = [1, 0.72, 0.36];

// ---------------------------------------------------------------------------------------------------------------
// banner_pole
// ---------------------------------------------------------------------------------------------------------------
export function bannerPole(kit, p) {
  const { x, z, rot = 0, scale = 1, y, h = 6.4 } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    const wb = kit.b('wood_beam'), wp = kit.b('wood_plank');
    kit.b('brick').box(0, 0.25, 0, 0.9, 0.5, 0.9, { tile: 3.2, color: [1.0, 0.95, 1.05], emissive: 0.22, faces: ['+z', '-z', '+x', '-x', '+y'] });
    wb.box(0, h / 2, 0, 0.26, h, 0.26, { tile: 2.4, color: [0.92, 0.82, 0.76], faces: ['+z', '-z', '+x', '-x'] });
    kit.xf.push().translate(0, h, 0);
    kit.b('metal_brass').sphere(0.24, 6, 3, { tile: 1.6, smooth: false, emissive: 0.4 });
    kit.xf.pop();
    const yb = h - 0.9;
    wp.box(0, yb, 0, 0.16, 0.16, 2.2, { tile: 2.4, color: [0.92, 0.82, 0.76], faces: ['+x', '-x', '+y', '-y', '+z', '-z'] });
    for (const s of [-1, 1]) kit.b('metal_brass').box(0, yb, s * 1.1, 0.24, 0.24, 0.24, { tile: 1.6, emissive: 0.3, faces: ['+x', '-x', '+y', '+z', '-z'] });
    // banner hangs from the crossbar, facing +X and -X (double sided)
    const bw = 1.7, bh = 3.4;
    kit.b('banner', { double: true }).quad([0.16, yb - 0.08 - bh, -bw / 2], [0.16, yb - 0.08 - bh, bw / 2], [0.16, yb - 0.08, bw / 2], [0.16, yb - 0.08, -bw / 2], { uv: [0, 0, 1, 1], emissive: 0.3, color: [1, 1, 1], flip: false });
    kit.cyl(0, 0, 0.32, -0.3, h + 0.3, { tag: 'pole' });
    kit.caster(0, 0, 0.35, h, 0.2);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// torch_stand : iron brazier stand with a flame (emissive) + glow
// ---------------------------------------------------------------------------------------------------------------
export function torchStand(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    const iron = kit.b('metal_iron'), brass = kit.b('metal_brass');
    kit.b('brick').box(0, 0.2, 0, 0.7, 0.4, 0.7, { tile: 3.2, color: [1.0, 0.95, 1.05], emissive: 0.22, faces: ['+z', '-z', '+x', '-x', '+y'] });
    kit.xf.push().translate(0, 0.4, 0);
    iron.cyl(0.16, 0.1, 1.7, 6, { tile: 1.6, smooth: false, emissive: 0.15 });
    kit.xf.translate(0, 1.7, 0);
    brass.lathe([[0.12, 0], [0.42, 0.28], [0.46, 0.5], [0.34, 0.5], [0.1, 0.28]], 6, { tile: 1.6, uWrap: 1, smooth: false, rot: PI / 6, emissive: 0.3 });
    kit.xf.pop();
    // flame: two crossed kites, emissive, yellow at the root -> orange tip
    const fl = kit.b(null, { double: true });
    const yb = 2.15;
    for (const ang of [0, PI / 2]) {
      const c = Math.cos(ang), s = Math.sin(ang);
      const P = (u, v) => [u * c, yb + v, u * s];
      const t = [[1, 0.95, 0.55], [1, 0.75, 0.25], [1, 0.45, 0.15]];
      fl.tri(P(-0.3, 0), P(0.3, 0), P(0.34, 0.45), [0, 0], [1, 0], [1, 0.5], { tints: [t[0], t[0], t[1]], emissive: 1 });
      fl.tri(P(-0.3, 0), P(0.34, 0.45), P(-0.34, 0.45), [0, 0], [1, 0.5], [0, 0.5], { tints: [t[0], t[1], t[1]], emissive: 1 });
      fl.tri(P(-0.34, 0.45), P(0.34, 0.45), P(0.0, 1.05), [0, 0.5], [1, 0.5], [0.5, 1], { tints: [t[1], t[1], t[2]], emissive: 1 });
    }
    kit.glow(0, 2.6, 0, { color: WARM, size: 5, pool: 5, flicker: 1 });
    kit.cyl(0, 0, 0.4, -0.3, 2.3, { tag: 'torch' });
    kit.caster(0, 0, 0.35, 2.3, 0.15);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// haystack
// ---------------------------------------------------------------------------------------------------------------
export function haystack(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  const rng = kit.rng(x, z, 55);
  kit.at(x, z, { rot: rot + rng.float(0, 3), scale, y }, () => {
    const N = 8;
    kit.xf.push().translate(0, -0.1, 0);
    kit.b('thatch').lathe([[1.7, 0], [1.75, 0.5], [1.4, 1.3], [0.85, 2.0], [0.3, 2.5], [0, 2.7]], N, { tile: 3.0, uWrap: 3, smooth: false, emissive: 0.22, color: vgrad(0, [0.85, 0.8, 0.7], 2.7, [1.15, 1.1, 0.95]) });
    kit.xf.pop();
    kit.b('wood_beam').box(0, 1.9, 0, 0.14, 1.8, 0.14, { tile: 2.4, faces: ['+z', '-z', '+x', '-x'] });
    kit.cyl(0, 0, 1.6, -0.2, 2.0, { tag: 'hay' });
    kit.caster(0, 0, 1.6, 2.6, 0.35);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// cart : two-wheeled hand cart, handles toward +Z
// ---------------------------------------------------------------------------------------------------------------
export function cart(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    const wp = kit.b('wood_plank'), wb = kit.b('wood_beam'), iron = kit.b('metal_iron');
    const c = [0.98, 0.88, 0.8];
    const bedY = 0.95;
    wp.box(0, bedY, -0.2, 1.7, 0.16, 2.3, { tile: 2.4, color: c, faces: ['+y', '-y', '+x', '-x', '+z', '-z'] });
    // side + back boards
    for (const s of [-1, 1]) wp.box(s * 0.85, bedY + 0.35, -0.2, 0.1, 0.55, 2.3, { tile: 2.4, color: mulc(c, 0.95), faces: ['+x', '-x', '+y'] });
    wp.box(0, bedY + 0.35, -1.3, 1.7, 0.55, 0.1, { tile: 2.4, color: mulc(c, 0.95), faces: ['+z', '-z', '+y'] });
    // handles
    for (const s of [-1, 1]) wb.box(s * 0.55, bedY - 0.05, 1.7, 0.12, 0.12, 2.0, { tile: 2.4, color: c, faces: ['+x', '-x', '+y', '-y', '+z'] });
    // wheels (axle along X): 8-sided discs with iron rim + a cross of spokes
    for (const s of [-1, 1]) {
      kit.xf.push().translate(s * 1.0, 0.8, -0.1).rotateZ(s * PI / 2);
      wp.cyl(0.8, 0.8, 0.16, 8, { tile: 2.4, smooth: false, caps: 'both', color: c });
      kit.xf.translate(0, 0.16, 0);
      iron.lathe([[0.87, -0.16], [0.87, 0.0]], 8, { tile: 1.6, uWrap: 2, smooth: false });
      kit.xf.pop();
      wb.box(s * 1.09, 0.8, -0.1, 0.06, 1.5, 0.14, { tile: 2.4, faces: [s > 0 ? '+x' : '-x'] });
      wb.box(s * 1.09, 0.8, -0.1, 0.06, 0.14, 1.5, { tile: 2.4, faces: [s > 0 ? '+x' : '-x'] });
    }
    wb.box(0, 0.8, -0.1, 2.2, 0.14, 0.14, { tile: 2.4, faces: ['+y', '-y', '+z', '-z'] });
    // load: a sack
    kit.b('thatch').box(0.25, bedY + 0.5, -0.3, 0.9, 0.55, 0.8, { tile: 2.0, color: [1.0, 0.95, 0.8], emissive: 0.2, faces: ['+z', '-z', '+x', '-x', '+y'] });
    kit.box(0, -0.2, 1.0, 1.45, 0, 1.6, { tag: 'cart' });
    kit.caster(0, 0, 1.5, 1.6, 0.25);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// bench : seat faces +Z
// ---------------------------------------------------------------------------------------------------------------
export function bench(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    const wp = kit.b('wood_plank'), wb = kit.b('wood_beam');
    const c = [0.98, 0.88, 0.8];
    wp.box(0, 0.62, 0, 2.3, 0.14, 0.7, { tile: 2.4, color: c, faces: ['+z', '-z', '+x', '-x', '+y', '-y'] });
    wp.box(0, 1.15, -0.32, 2.3, 0.5, 0.1, { tile: 2.4, color: c, faces: ['+z', '-z', '+x', '-x', '+y'] });
    for (const s of [-1, 1]) {
      wb.box(s * 0.95, 0.28, 0, 0.14, 0.56, 0.6, { tile: 2.4, color: mulc(c, 0.9), faces: ['+x', '-x', '+z'] });
      wb.box(s * 0.95, 0.9, -0.32, 0.14, 0.9, 0.16, { tile: 2.4, color: mulc(c, 0.9), faces: ['+x', '-x', '+z'] });
    }
    kit.box(0, 0, 1.15, 0.36, 0, 0.7, { top: true, tag: 'bench' });
    kit.caster(0, 0, 1.0, 0.9, 0.2);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// scarecrow
// ---------------------------------------------------------------------------------------------------------------
export function scarecrow(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    const wb = kit.b('wood_beam'), wp = kit.b('wood_plank'), th = kit.b('thatch'), cloth = kit.b(null, { double: true });
    wb.box(0, 1.6, 0, 0.2, 3.2, 0.2, { tile: 2.4, color: [0.9, 0.8, 0.72], faces: ['+z', '-z', '+x', '-x'] });
    wp.box(0, 2.35, 0, 2.5, 0.16, 0.16, { tile: 2.4, color: [0.9, 0.8, 0.72], faces: ['+z', '-z', '+y', '-y', '+x', '-x'] });
    // straw body (bundle) with a teal coat
    frustum(cloth, 0, 0, 0.5, 0.36, 0.42, 0.3, 1.3, 2.55, { color: [0.3, 0.72, 0.7], emissive: 0.15, faces: ['+z', '-z', '+x', '-x', '+y'] });
    // sleeves
    for (const s of [-1, 1]) cloth.box(s * 0.85, 2.36, 0, 0.9, 0.3, 0.26, { color: [0.3, 0.72, 0.7], emissive: 0.15, faces: ['+z', '-z', '+y', '-y', '+x', '-x'] });
    // straw tufts at cuffs and hem
    for (const [tx, ty] of [[-1.42, 2.35], [1.42, 2.35], [0, 1.25]]) th.box(tx, ty - 0.1, 0, 0.35, 0.28, 0.3, { tile: 1.6, color: [1.05, 1.0, 0.8], emissive: 0.2, faces: ['+z', '-z', '+x', '-x', '-y'] });
    // head: a sack with a pointed hat
    kit.xf.push().translate(0, 3.05, 0);
    th.sphere(0.38, 6, 4, { tile: 2.0, smooth: false, color: [1.05, 0.98, 0.8], emissive: 0.2 });
    kit.xf.translate(0, 0.25, 0);
    cloth.cyl(0.62, 0.0, 0.85, 8, { smooth: false, color: [0.66, 0.5, 0.95], emissive: 0.15 });
    cloth.lathe([[0.3, -0.02], [0.66, -0.02]], 8, { color: [0.5, 0.36, 0.8] });
    kit.xf.pop();
    // face: two dark eyes
    const dark = kit.b(null);
    for (const s of [-1, 1]) dark.quad([s * 0.16 - 0.05, 3.06, 0.37], [s * 0.16 + 0.05, 3.06, 0.37], [s * 0.16 + 0.05, 3.18, 0.37], [s * 0.16 - 0.05, 3.18, 0.37], { color: [0.08, 0.06, 0.1] });
    kit.cyl(0, 0, 0.3, -0.2, 3.6, { tag: 'scarecrow' });
    kit.caster(0, 0, 0.5, 3.6, 0.2);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// boat : little rowboat floating at y=0 (keel -0.34, gunwale +0.55), bow toward +Z
// ---------------------------------------------------------------------------------------------------------------
export function boat(kit, p) {
  const { x, z, rot = 0, scale = 1, variant = 0 } = p;
  // floats at WATER_LEVEL when placed over/near the lake; on the gallery lawn it just sits on the ground
  const gy = kit.groundY(x, z);
  const y = p.y ?? (gy < WATER_LEVEL + 2.5 ? WATER_LEVEL : gy);
  kit.at(x, z, { rot, scale, y }, () => {
    const hullTint = [[0.45, 0.9, 0.88], [1.0, 0.55, 0.45], [0.75, 0.6, 1.0]][((variant % 3) + 3) % 3];
    const wp = kit.b('wood_plank');
    // stations: z, gunwale half width, keel y, gunwale y
    const S = [[-1.9, 0.55, -0.16, 0.62], [-1.0, 0.74, -0.32, 0.55], [0.3, 0.76, -0.34, 0.52], [1.4, 0.52, -0.28, 0.58], [2.15, 0.05, -0.05, 0.78]];
    const sec = (st, inner = false) => {
      const [z0, w, ky, gy] = st;
      const zz = inner && z0 < -1.5 ? z0 + 0.1 : z0;      // the inner face of the transom sits a plank's thickness in
      const wi = inner ? Math.max(w - 0.1, 0.02) : w, ki = inner ? ky + 0.09 : ky;
      const my = ki + (gy - ki) * 0.32;
      return [[-wi, gy, zz], [-0.8 * wi, my, zz], [0, ki, zz], [0.8 * wi, my, zz], [wi, gy, zz]];
    };
    const outer = S.map((s) => sec(s)), inner = S.map((s) => sec(s, true));
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    // emit a quad so that its normal points along `want` (away from / toward the boat axis)
    const skin = (A, B, C, D, want, o) => {
      const n = cross(sub(B, A), sub(D, A));
      const w = o.tile || 2.4;
      const uv = (Q) => [Q[2] / w, Q[1] / w + Math.abs(Q[0]) / w];
      const flip = dot(n, want) < 0;
      const q = flip ? [A, D, C, B] : [A, B, C, D];
      wp.tri(q[0], q[1], q[2], uv(q[0]), uv(q[1]), uv(q[2]), o);
      wp.tri(q[0], q[2], q[3], uv(q[0]), uv(q[2]), uv(q[3]), o);
    };
    for (let i = 0; i < S.length - 1; i++) {
      for (let j = 0; j < 4; j++) {
        const A = outer[i][j], B = outer[i][j + 1], C = outer[i + 1][j + 1], D = outer[i + 1][j];
        const cm = [(A[0] + B[0] + C[0] + D[0]) / 4, (A[1] + B[1] + C[1] + D[1]) / 4, (A[2] + B[2] + C[2] + D[2]) / 4];
        skin(A, B, C, D, sub(cm, [0, 0.15, cm[2]]), { tile: 2.4, color: hullTint, emissive: 0.2 });
        const a = inner[i][j], b = inner[i][j + 1], c = inner[i + 1][j + 1], d = inner[i + 1][j];
        const cn = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
        skin(a, b, c, d, sub([0, 0.15, cn[2]], cn), { tile: 2.4, color: [0.95, 0.85, 0.75], emissive: 0.2 });
      }
      // gunwale rim (top strips, both sides)
      for (const s of [0, 4]) {
        const A = outer[i][s], B = inner[i][s], C = inner[i + 1][s], D = outer[i + 1][s];
        skin(A, B, C, D, [0, 1, 0], { tile: 2.4, color: [0.55, 0.42, 0.36], emissive: 0.15 });
      }
    }
    // transom (stern): outer face, inner face and the rim strip across the top
    {
      const o0 = outer[0], i0 = inner[0];
      const tri = (A, B, C, want, o) => {
        const n = cross(sub(B, A), sub(C, A));
        const q = dot(n, want) < 0 ? [A, C, B] : [A, B, C];
        wp.tri(q[0], q[1], q[2], [q[0][0] / 2.4, q[0][1] / 2.4], [q[1][0] / 2.4, q[1][1] / 2.4], [q[2][0] / 2.4, q[2][1] / 2.4], o);
      };
      for (let k = 1; k < 4; k++) {
        tri(o0[0], o0[k], o0[k + 1], [0, 0, -1], { tile: 2.4, color: hullTint, emissive: 0.2 });
        tri(i0[0], i0[k], i0[k + 1], [0, 0, 1], { tile: 2.4, color: [0.95, 0.85, 0.75], emissive: 0.2 });
      }
      skin(o0[0], o0[4], i0[4], i0[0], [0, 1, 0], { tile: 2.4, color: [0.55, 0.42, 0.36], emissive: 0.15 });
    }
    // thwarts (seats)
    for (const zz of [-0.75, 0.55]) wp.box(0, 0.3, zz, 1.3, 0.09, 0.32, { tile: 2.4, color: [1.0, 0.9, 0.8], faces: ['+y', '+z', '-z', '-y'] });
    // oars resting across
    const wb = kit.b('wood_beam');
    for (const [zz, s] of [[-0.75, 1], [0.55, -1]]) {
      strut(wb, [-1.4 * s, 0.5, zz - 0.2], [1.5 * s, 0.6, zz + 0.1], 0.07, { color: [0.92, 0.8, 0.7], faces: ['+x', '-x', '+y', '-y'] });
      strut(wp, [1.35 * s, 0.6, zz + 0.09], [1.95 * s, 0.63, zz + 0.12], 0.3, { h: 0.04, color: [1.0, 0.9, 0.8], faces: ['+y', '-y'] });
    }
    kit.box(0, 0.1, 0.72, 1.9, -0.3, 0.55, { top: true, tag: 'boat' });
    kit.caster(0, 0, 0.9, 0.7, 0.15);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// fountain : plaza fountain, octagonal basin r 3.9 (rim y=1.15), tiered centre with a spout and falling water
// ---------------------------------------------------------------------------------------------------------------
export function fountain(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    const N = 8, rr = PI / N;
    const st = kit.b('brick'), fl = kit.b('flagstone');
    const tint = [1.0, 0.96, 1.08];
    // paved apron ring + basin walls + rim + inner wall
    kit.xf.push().translate(0, -0.5, 0);
    fl.lathe([[4.7, 0], [4.7, 0.78], [3.8, 0.78]], N, { tile: 3.2, uWrap: 6, smooth: false, rot: rr, emissive: 0.22, color: [1.0, 0.98, 1.1] });
    kit.xf.pop();
    st.lathe([[3.9, -0.5], [3.9, 1.0]], N, { tile: 3.0, uWrap: 6, smooth: false, rot: rr, emissive: 0.22, color: vgrad(-0.5, [0.65, 0.62, 0.72], 1.0, tint) });
    fl.lathe([[3.98, 0.96], [3.98, 1.15], [3.0, 1.15], [3.0, 0.25]], N, { tile: 3.2, uWrap: 6, smooth: false, rot: rr, emissive: 0.22, color: [1.1, 1.08, 1.16] });
    fl.disc(3.0, N, { y: 0.25, tile: 3.2, color: [0.8, 0.85, 0.95], emissive: 0.2 });
    // water surface
    kit.b('water', { mode: 'half', scroll: [0.018, 0.007], alpha: 1.32 }).disc(2.95, 12, { y: 0.85, tile: 5, emissive: 0.35, color: [0.62, 1.1, 1.22] });
    // central column: pedestal, saucer, spout
    st.lathe([[1.0, 0.25], [1.0, 1.2], [0.62, 1.55], [0.38, 2.3]], N, { tile: 3.0, uWrap: 3, smooth: false, rot: rr, emissive: 0.22, color: tint });
    fl.lathe([[0.42, 2.15], [1.3, 2.55], [1.45, 2.85], [1.15, 2.85], [0.32, 2.6]], N, { tile: 3.0, uWrap: 3, smooth: false, rot: rr, emissive: 0.22, color: [1.1, 1.08, 1.16] });
    st.lathe([[0.3, 2.6], [0.24, 3.4], [0.12, 3.75]], 6, { tile: 3.0, uWrap: 1, smooth: false, emissive: 0.22, color: tint });
    kit.xf.push().translate(0, 3.78, 0);
    kit.b('metal_brass').sphere(0.2, 6, 3, { tile: 1.6, smooth: false, emissive: 0.4 });
    kit.xf.pop();
    // falling water: skirt of thin double-sided strips from the saucer rim into the basin, plus the jet
    const wf = kit.b('waterfall', { mode: 'half', double: true, scroll: [0, 0.7], alpha: 1.3 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + PI / 8, c = Math.sin(a), s = Math.cos(a);
      const P = (r, yy, off) => [c * r - s * off, yy, s * r + c * off];
      wf.quad(P(1.65, 0.86, -0.3), P(1.65, 0.86, 0.3), P(1.3, 2.78, 0.3), P(1.3, 2.78, -0.3), { uv: [0, 0, 1, 2.2], emissive: 0.4, color: [1.05, 1.1, 1.1] });
    }
    for (const a of [0, PI / 2]) {
      const c = Math.cos(a), s = Math.sin(a);
      wf.quad([-0.28 * c, 2.62, -0.28 * s], [0.28 * c, 2.62, 0.28 * s], [0.14 * c, 3.72, 0.14 * s], [-0.14 * c, 3.72, -0.14 * s], { uv: [0, 0, 1, 1.4], emissive: 0.4, color: [1.05, 1.1, 1.1] });
    }
    // foam ring round the pedestal
    kit.b('foam', { double: true }).lathe([[0.9, 0.86], [1.5, 0.87]], 10, { tile: 1.6, uWrap: 3, emissive: 0.4, color: [1, 1, 1] });
    kit.emitter(0, 3.5, 0, { kind: 'mist', rate: 4, radius: 0.5 });
    kit.glow(0, 3.0, 0, { color: [0.6, 0.8, 1.0], size: 3, pool: 0 });
    kit.cyl(0, 0, 4.0, -1, 1.15, { tag: 'basin' });
    kit.cyl(0, 0, 1.0, 1.15, 3.9, { tag: 'centre' });
    kit.caster(0, 0, 3.4, 3.8, 0.4);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// garden_plot : raised bed with flowers / greens
// ---------------------------------------------------------------------------------------------------------------
export function gardenPlot(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  const rng = kit.rng(x, z, 63);
  kit.at(x, z, { rot, scale, y }, () => {
    const W = 2.2, D = 1.5;
    const wp = kit.b('wood_plank');
    const c = [0.95, 0.85, 0.78];
    for (const [cx, cz, sx, sz] of [[0, D, W * 2 + 0.3, 0.22], [0, -D, W * 2 + 0.3, 0.22], [W, 0, 0.22, D * 2 - 0.22], [-W, 0, 0.22, D * 2 - 0.22]]) {
      wp.box(cx, 0.28, cz, sx, 0.56, sz, { tile: 2.4, color: c, emissive: 0.2, faces: ['+z', '-z', '+x', '-x', '+y'] });
    }
    kit.b('dirt').quad([-W + 0.1, 0.36, D - 0.1], [W - 0.1, 0.36, D - 0.1], [W - 0.1, 0.36, -D + 0.1], [-W + 0.1, 0.36, -D + 0.1], { tile: 3.2, color: [0.75, 0.62, 0.55], emissive: 0.2 });
    // rows of plants (crossed cutout quads)
    const mats = ['flower_pink', 'flower_yellow', 'flower_blue', 'tuft', 'fern'];
    const rows = 3, per = 5;
    for (let r = 0; r < rows; r++) {
      const tex = mats[(r * 2 + Math.floor(rng.next() * 2)) % mats.length];
      const b = kit.b(tex, { double: true });
      for (let i = 0; i < per; i++) {
        const px = -W + 0.55 + (i * (2 * W - 1.1)) / (per - 1) + rng.float(-0.08, 0.08), pz = -D + 0.55 + r * ((2 * D - 1.1) / (rows - 1));
        const s = tex === 'fern' || tex === 'tuft' ? 0.55 : 0.5;
        for (const a of [0.3, 0.3 + PI / 2]) {
          const cs = Math.cos(a), sn = Math.sin(a);
          b.quad([px - cs * s, 0.36, pz - sn * s], [px + cs * s, 0.36, pz + sn * s], [px + cs * s, 0.36 + s * 1.5, pz + sn * s], [px - cs * s, 0.36 + s * 1.5, pz - sn * s], { uv: [0, 0, 1, 1], emissive: 0.3, color: [1, 1, 1] });
        }
      }
    }
    kit.box(0, 0, W + 0.1, D + 0.1, 0, 0.58, { top: true, tag: 'plot' });
    kit.caster(0, 0, 1.4, 0.7, 0.15);
  });
}

export const EXTRAS = {
  banner_pole: { fn: bannerPole, size: 4, note: 'Wooden pole (6.4 tall) with brass finial, crossbar and a hanging violet/gold lantern banner (banner texture, double-sided, 1.7 x 3.4, faces +-X). Thin cylinder collider.' },
  torch_stand: { fn: torchStand, size: 3, note: 'Iron torch/brazier stand 2.3 tall with an emissive two-kite flame and a flickering glow (size 5, pool 5).' },
  haystack: { fn: haystack, size: 5, note: 'Conical thatch haystack r 1.7, 2.6 tall (random yaw from placement). Cylinder collider.' },
  cart: { fn: cart, size: 6, note: 'Two-wheeled hand cart with a sack, handles toward +Z, 1.9 tall. Box collider.' },
  bench: { fn: bench, size: 3, note: 'Wooden bench 2.3 long, seat faces +Z, seat height 0.7 (top:true collider so Spyro can hop on).' },
  scarecrow: { fn: scarecrow, size: 3, note: 'Scarecrow on a post: teal coat, violet pointed hat, straw tufts, 3.6 tall. Thin cylinder collider.' },
  boat: { fn: boat, size: 6, note: 'Little rowboat, bow toward +Z, 1.5 wide x 4.1 long; local y=0 is the waterline (keel -0.34, gunwale +0.55); it floats at WATER_LEVEL automatically when the ground under it is near/below the water (or pass y). variant 0..2 hull tint teal/coral/violet. One walkable box collider (top y=0.55).', defaults: { variant: 0 } },
  fountain: { fn: fountain, size: 11, note: 'Plaza fountain: octagonal basin r 3.9 (rim y=1.15, apron r 4.7), scrolling water surface at y=0.85, tiered centre column with saucer and jetting spout (top ~3.9), falling-water skirt, mist emitter. Solid cylinder colliders (not walk-on).' },
  garden_plot: { fn: gardenPlot, size: 5, note: 'Raised garden bed 4.4 x 3.0 with rows of flowers/greens (cutout crossed quads). Box collider top:true on the bed.' },
};
