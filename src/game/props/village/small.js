// Small repeated props: lamp_post, signpost, well, barrel_cluster, crate_stack, market_stall.
import {
  PI, TAU, clamp, lerp, mulc, TINT, vgrad, grid, planar, strut, polar, frustum, quadUV, fan,
} from './common.js';
import { lanternBody } from './details.js';

const WARM = [1, 0.72, 0.36];

/**
 * A lamp post with its base at (x, y0, z) in the CURRENT frame (prop-local coordinates): stone plinth, iron post with a
 * brass collar, glowing lantern with a pyramid cap.  o.h = total height (default 4.5).  Registers glow (o.glow !== false).
 */
export function lampHead(kit, x, z, y0, o = {}) {
  const { h = 4.5, glow = true } = o;
  const st = kit.b('brick'), iron = kit.b('metal_iron'), brass = kit.b('metal_brass');
  st.box(x, y0 + 0.25, z, 0.9, 0.5, 0.9, { tile: 3.2, color: [1.0, 0.95, 1.05], emissive: 0.22, faces: ['+z', '-z', '+x', '-x', '+y'] });
  const postTop = y0 + h - 1.25;
  kit.xf.push().translate(x, y0 + 0.5, z);
  iron.cyl(0.2, 0.13, postTop - y0 - 0.5, 6, { tile: 1.6, smooth: false, emissive: 0.15, color: vgrad(0, [0.9, 0.85, 0.95], 3, [1.1, 1.08, 1.15]) });
  kit.xf.pop();
  brass.box(x, y0 + 1.5, z, 0.42, 0.16, 0.42, { tile: 1.6, emissive: 0.3, faces: ['+z', '-z', '+x', '-x', '+y'] });
  // cross-piece under the lantern
  brass.box(x, postTop, z, 0.6, 0.14, 0.6, { tile: 1.6, emissive: 0.3, faces: ['+z', '-z', '+x', '-x', '+y', '-y'] });
  lanternBody(kit, x, postTop + 0.62, z, { s: 1.15 });
  if (glow) kit.glow(x, postTop + 0.7, z, { color: WARM, size: 5.2, pool: 5.5 });
}

export function lampPost(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    lampHead(kit, 0, 0, 0, { h: 4.5 });
    kit.emitter(0, 4.2, 0, { kind: 'firefly', rate: 0.7, radius: 0.9 });
    kit.cyl(0, 0, 0.32, -0.5, 4.6, { tag: 'lamp' });
    kit.caster(0, 0, 0.35, 4.5, 0.2);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// signpost : post with arrow boards (param boards = [{ yaw (rad), y, len }])
// ---------------------------------------------------------------------------------------------------------------
export function signpost(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  const boards = p.boards || [{ yaw: 0.25, y: 3.25, len: 2.3, tint: [1.0, 0.72, 0.6] }, { yaw: -0.5, y: 2.5, len: 2.0, tint: [0.7, 0.95, 0.92] }, { yaw: 0.9, y: 1.75, len: 1.8, tint: [1.0, 0.9, 0.62] }];
  kit.at(x, z, { rot, scale, y }, () => {
    const wb = kit.b('wood_beam'), wp = kit.b('wood_plank');
    wb.box(0, 1.9, 0, 0.34, 3.8, 0.34, { tile: 2.4, color: [0.95, 0.85, 0.78], faces: ['+z', '-z', '+x', '-x'] });
    frustum(wb, 0, 0, 0.24, 0.24, 0.03, 0.03, 3.8, 4.15, { tile: 2.4, color: [0.95, 0.85, 0.78], faces: ['+z', '-z', '+x', '-x'] });
    kit.b('brick').box(0, 0.12, 0, 0.9, 0.5, 0.9, { tile: 3.2, color: [1.0, 0.95, 1.05], emissive: 0.22, faces: ['+z', '-z', '+x', '-x', '+y'] });
    for (const b of boards) {
      const L = b.len, hgt = 0.62, t = 0.1;
      kit.xf.push().translate(0, b.y, 0).rotateY(b.yaw);
      const c = { tile: 2.4, color: b.tint || [1, 0.9, 0.8], emissive: 0.18 };
      // arrow board in the local XY plane pointing +X: rectangle from x=-0.2..L-0.5 and a tip to x=L
      const tipX = L, bodyX = L - 0.55;
      const face = (zz, flip) => {
        const P = [[-0.25, -hgt / 2, zz], [bodyX, -hgt / 2, zz], [tipX, 0, zz], [bodyX, hgt / 2, zz], [-0.25, hgt / 2, zz]];
        const poly = flip ? P.slice().reverse() : P;
        planar(wp, poly, [flip ? -1 : 1, 0, 0], [0, 1, 0], { ...c, tile: 2.4 });
      };
      face(t / 2, false); face(-t / 2, true);
      // top/bottom edges + tip edges
      wp.quad([-0.25, hgt / 2, t / 2], [bodyX, hgt / 2, t / 2], [bodyX, hgt / 2, -t / 2], [-0.25, hgt / 2, -t / 2], { ...c, tile: 2.4 });
      wp.quad([-0.25, -hgt / 2, -t / 2], [bodyX, -hgt / 2, -t / 2], [bodyX, -hgt / 2, t / 2], [-0.25, -hgt / 2, t / 2], { ...c, tile: 2.4 });
      wp.quad([bodyX, hgt / 2, t / 2], [tipX, 0, t / 2], [tipX, 0, -t / 2], [bodyX, hgt / 2, -t / 2], { ...c, tile: 2.4 });
      wp.quad([tipX, 0, t / 2], [bodyX, -hgt / 2, t / 2], [bodyX, -hgt / 2, -t / 2], [tipX, 0, -t / 2], { ...c, tile: 2.4 });
      kit.xf.pop();
    }
    kit.cyl(0, 0, 0.35, -0.5, 4.2, { tag: 'signpost' });
    kit.caster(0, 0, 0.35, 4, 0.2);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// well : stone ring, two posts, crank, little roof, bucket
// ---------------------------------------------------------------------------------------------------------------
export function well(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    const N = 8, R = 1.45;
    kit.xf.push().translate(0, -0.6, 0);
    kit.b('brick').cyl(R, R, 1.7, N, { tile: 2.9, uWrap: 5, smooth: false, rot: PI / N, emissive: 0.22, color: vgrad(0, [0.6, 0.58, 0.68], 1.7, [1.02, 1.0, 1.1]) });
    kit.xf.pop();
    kit.xf.push().translate(0, 1.08, 0);
    kit.b('flagstone').lathe([[R + 0.22, 0], [R + 0.22, 0.16], [R - 0.5, 0.16]], N, { tile: 3.2, uWrap: 5, smooth: false, rot: PI / N, emissive: 0.22, color: [1.1, 1.08, 1.16] });
    kit.xf.pop();
    // water
    kit.b('water', { mode: 'half', scroll: [0.02, 0.01] }).disc(R - 0.5, N, { y: 0.55, tile: 3.2, color: [0.6, 0.75, 1.0] });
    const wb = kit.b('wood_beam'), wp = kit.b('wood_plank');
    for (const s of [-1, 1]) wb.box(s * (R + 0.05), 1.75, 0, 0.3, 3.4, 0.3, { tile: 2.4, color: [0.92, 0.82, 0.74], faces: ['+z', '-z', '+x', '-x'] });
    wp.box(0, 3.3, 0, 2 * R + 0.5, 0.3, 0.38, { tile: 2.4, color: [0.92, 0.82, 0.74], faces: ['+z', '-z', '+y', '-y', '+x', '-x'] });
    // roof: two slopes + gable triangles
    const rf = kit.b('roof_red');
    const hw = R + 0.75, d = 1.25, y0 = 3.45, y1 = 4.35;
    quadUV(rf, [-hw, y0, d], [hw, y0, d], [hw, y1, 0], [-hw, y1, 0], { tile: 3.2, emissive: 0.16 });
    quadUV(rf, [hw, y0, -d], [-hw, y0, -d], [-hw, y1, 0], [hw, y1, 0], { tile: 3.2, emissive: 0.16 });
    for (const sx of [-1, 1]) {
      const q = sx > 0 ? [[hw, y0, d], [hw, y0, -d], [hw, y1, 0]] : [[-hw, y0, -d], [-hw, y0, d], [-hw, y1, 0]];
      wp.tri(q[0], q[1], q[2], [0, 0], [1, 0], [0.5, 0.5], { tile: 3.2, color: [0.6, 0.55, 0.58] });
    }
    // underside boards
    wp.quad([-hw, y0, -d], [hw, y0, -d], [hw, y0, d], [-hw, y0, d], { tile: 3.2, color: [0.5, 0.45, 0.48] });
    // crank handle on the beam + rope + bucket
    wp.box(R + 0.55, 3.3, 0, 0.5, 0.12, 0.12, { tile: 2.4, color: [0.9, 0.8, 0.7], faces: ['+x', '+y', '-y', '+z', '-z'] });
    kit.b(null).box(0, 2.2, 0, 0.05, 2.0, 0.05, { color: [0.62, 0.5, 0.36], faces: ['+z', '-z', '+x', '-x'] });
    kit.xf.push().translate(0, 1.0, 0);
    wb.cyl(0.3, 0.24, 0.42, 6, { tile: 1.6, smooth: false, color: [0.85, 0.72, 0.6] });
    kit.xf.pop();
    kit.cyl(0, 0, R + 0.25, -0.6, 1.24, { top: true, tag: 'well' });
    for (const s of [-1, 1]) kit.cyl(s * (R + 0.05), 0, 0.22, 1.2, 3.5, { tag: 'post' });
    kit.caster(0, 0, 1.5, 4.2, 0.35);
    kit.glow(0, 0.7, 0, { color: [0.5, 0.7, 1.0], size: 2.4, pool: 0 });
  });
}

// ---------------------------------------------------------------------------------------------------------------
// barrel_cluster / crate_stack
// ---------------------------------------------------------------------------------------------------------------
function barrel(kit, x, z, o = {}) {
  const { s = 1, ry = 0, lie = false } = o;
  const N = 6;
  kit.xf.push().translate(x, lie ? 0.6 * s : 0, z).rotateY(ry);
  if (lie) kit.xf.rotateZ(PI / 2).translate(0, -0.55 * s, 0);
  kit.xf.scale(s);
  const prof = [[0.46, 0], [0.6, 0.4], [0.6, 0.7], [0.46, 1.1]];
  kit.b('wood_beam').lathe(prof, N, { tile: 2.2, uWrap: 2, smooth: false, rot: PI / N, emissive: 0.2, color: vgrad(0, [0.8, 0.72, 0.68], 1.1, [1.05, 0.98, 0.92]) });
  kit.b('wood_plank').disc(0.46, N, { y: 1.1, tile: 1.6, color: [0.9, 0.8, 0.7], emissive: 0.2 });
  if (lie) kit.b('wood_plank').disc(0.46, N, { y: 0, down: true, tile: 1.6, color: [0.8, 0.7, 0.62], emissive: 0.2 });
  // iron hoops (one near each end, riding just outside the belly)
  const iron = kit.b('metal_iron');
  iron.lathe([[0.55, 0.16], [0.55, 0.28]], N, { tile: 1.6, uWrap: 2, smooth: false, rot: PI / N, color: [1, 0.95, 1.05] });
  iron.lathe([[0.55, 0.84], [0.55, 0.96]], N, { tile: 1.6, uWrap: 2, smooth: false, rot: PI / N, color: [1, 0.95, 1.05] });
  kit.xf.pop();
}

export function barrelCluster(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  const rng = kit.rng(x, z, 77);
  kit.at(x, z, { rot, scale, y }, () => {
    barrel(kit, 0, 0, { ry: rng.float(0, 3) });
    barrel(kit, 1.15, 0.45, { ry: rng.float(0, 3), s: 0.92 });
    barrel(kit, -0.4, 1.3, { ry: 0.6, lie: true, s: 0.95 });
    kit.cyl(0, 0, 0.62, 0, 1.15, { top: true, tag: 'barrel' });
    kit.cyl(1.15, 0.45, 0.58, 0, 1.05, { top: true, tag: 'barrel' });
    kit.box(-0.4, 1.3, 0.6, 0.55, 0, 1.15, { tag: 'barrel', rot: 0.6 });
    kit.caster(0.2, 0.6, 1.5, 1.2, 0.3);
  });
}

export function crateStack(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  const rng = kit.rng(x, z, 91);
  kit.at(x, z, { rot, scale, y }, () => {
    const cr = kit.b('crate');
    const one = (cx, cz, cy, sz, ry) => {
      kit.xf.push().translate(cx, cy, cz).rotateY(ry);
      cr.box(0, sz / 2, 0, sz, sz, sz, { uv: [0, 0, 1, 1], faces: ['+z', '-z', '+x', '-x', '+y'], color: [1.0, 0.95, 0.9], emissive: 0.2 });
      kit.xf.pop();
      kit.box(cx, cz, sz / 2, sz / 2, cy, cy + sz, { top: true, rot: ry, tag: 'crate' });
    };
    one(0, 0, 0, 1.35, rng.float(-0.15, 0.15));
    one(1.5, 0.3, 0, 1.2, rng.float(-0.25, 0.25) + 0.3);
    one(-0.1, 1.45, 0, 1.15, rng.float(-0.2, 0.2) - 0.2);
    one(0.15, 0.1, 1.35, 1.05, rng.float(-0.4, 0.4));
    kit.caster(0.5, 0.6, 1.5, 2.4, 0.3);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// market_stall ({variant 0..2}): striped awning, table, goods, hanging lantern.  Front (customer side) = +Z.
// ---------------------------------------------------------------------------------------------------------------
const CLOTH = [
  [[0.32, 0.78, 0.75], [1.0, 0.96, 0.82]],     // teal / cream
  [[1.0, 0.5, 0.42], [1.0, 0.96, 0.82]],       // coral / cream
  [[0.66, 0.48, 1.0], [1.0, 0.82, 0.36]],      // violet / gold
];
export function marketStall(kit, p) {
  const { x, z, rot = 0, scale = 1, y, variant = 0 } = p;
  const v = ((Math.round(variant) % 3) + 3) % 3;
  kit.at(x, z, { rot, scale, y }, () => {
    const W = 2.1, D = 1.5, hF = 3.0, hB = 3.5;
    const wb = kit.b('wood_beam'), wp = kit.b('wood_plank'), cloth = kit.b(null, { double: true });
    // posts: front two shorter than back two (awning slopes forward)
    for (const [sx, sz, hh] of [[-1, 1, hF], [1, 1, hF], [-1, -1, hB], [1, -1, hB]]) {
      wb.box(sx * (W - 0.12), (hh + 0.4) / 2 - 0.4, sz * (D - 0.12), 0.24, hh + 0.4, 0.24, { tile: 2.4, color: [0.95, 0.85, 0.78], faces: ['+z', '-z', '+x', '-x'] });
    }
    // awning: 6 stripes sloping down to the front, with a scalloped valance
    const [c0, c1] = CLOTH[v];
    const ns = 6;
    for (let i = 0; i < ns; i++) {
      const xa = -W - 0.2 + ((2 * W + 0.4) * i) / ns, xb = -W - 0.2 + ((2 * W + 0.4) * (i + 1)) / ns;
      const c = i % 2 ? c1 : c0;
      cloth.quad([xa, hF + 0.1, D + 0.45], [xb, hF + 0.1, D + 0.45], [xb, hB + 0.15, -D - 0.1], [xa, hB + 0.15, -D - 0.1], { color: c, emissive: 0.18 });
      cloth.tri([xa, hF + 0.1, D + 0.45], [(xa + xb) / 2, hF - 0.42, D + 0.45], [xb, hF + 0.1, D + 0.45], [0, 0], [0.5, 1], [1, 0], { color: c, emissive: 0.18 });
    }
    // back cloth
    cloth.quad([W, 0.4, -D + 0.05], [-W, 0.4, -D + 0.05], [-W, hB - 0.1, -D + 0.05], [W, hB - 0.1, -D + 0.05], { color: mulc(c0, 0.55) });
    // table with a cloth runner
    wp.box(0, 0.72, 0.35, 2 * W - 0.5, 0.12, 1.1, { tile: 2.4, color: [1.0, 0.92, 0.84], faces: ['+z', '-z', '+x', '-x', '+y'] });
    for (const sx of [-1, 1]) wb.box(sx * (W - 0.6), 0.33, 0.35, 0.16, 0.66, 0.9, { tile: 2.4, color: [0.88, 0.78, 0.7], faces: ['+z', '+x', '-x'] });
    cloth.quad([-W + 0.35, 0.82, 0.95], [W - 0.35, 0.82, 0.95], [W - 0.35, 0.82, -0.25], [-W + 0.35, 0.82, -0.25], { color: c1 });
    // goods
    const vase = kit.b('vase');
    if (v === 1) {
      for (const [gx, gs] of [[-1.05, 1], [-0.1, 0.8], [0.85, 1.05]]) {
        kit.xf.push().translate(gx, 0.79, 0.4);
        vase.lathe([[0.14 * gs, 0], [0.26 * gs, 0.16 * gs], [0.24 * gs, 0.34 * gs], [0.12 * gs, 0.46 * gs]], 6, { tile: 1.6, uWrap: 1, smooth: false, rot: PI / 6, emissive: 0.2 });
        kit.xf.pop();
      }
    } else {
      // produce crates with coloured tops
      const cr = kit.b(null);
      const cols = v === 0 ? [[1.0, 0.45, 0.35], [0.5, 0.85, 0.4], [1.0, 0.8, 0.3]] : [[0.75, 0.5, 1.0], [1.0, 0.75, 0.3], [0.9, 0.4, 0.5]];
      cols.forEach((c, i) => {
        const gx = -1.05 + i * 1.0;
        wp.box(gx, 0.98, 0.4, 0.7, 0.26, 0.55, { tile: 2.4, color: [0.9, 0.8, 0.7], faces: ['+z', '-z', '+x', '-x'] });
        frustum(cr, gx, 0.4, 0.3, 0.24, 0.2, 0.14, 1.1, 1.3, { color: c, emissive: 0.25, faces: ['+z', '-z', '+x', '-x', '+y'] });
      });
    }
    // hanging lantern under the awning front + glow
    kit.b('metal_iron').box(0.9, hF - 0.25, D + 0.12, 0.04, 0.5, 0.04, { tile: 1.6, faces: ['+z', '-z', '+x', '-x'] });
    lanternBody(kit, 0.9, hF - 0.85, D + 0.12, { s: 0.85 });
    kit.glow(0.9, hF - 0.85, D + 0.4, { color: WARM, size: 3.2, pool: 3.4 });
    // colliders: table + posts
    kit.box(0, 0.35, W - 0.15, 0.6, 0, 1.0, { top: false, tag: 'table' });
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) kit.cyl(sx * (W - 0.12), sz * (D - 0.12), 0.2, 0, 3.4, { tag: 'post' });
    kit.caster(0, 0, 1.8, 3.5, 0.3);
  });
}

export const SMALL = {
  lamp_post: {
    fn: lampPost, size: 4,
    note: 'Iron lamp post 4.5 tall on a stone plinth; warm emissive lantern + kit.glow (size 5.2, pool 5.5) + a slow firefly/moth emitter at the lantern + cylinder collider. anchors.light = lantern centre.',
    anchors: { light: [0, 3.9, 0] },
  },
  signpost: {
    fn: signpost, size: 4,
    note: 'Wooden post with three arrow boards (param boards=[{yaw,y,len,tint}], yaw about Y, arrow points along the rotated +X axis: yaw 0 -> +X). 4.2 tall.',
  },
  well: {
    fn: well, size: 7,
    note: 'Stone well (r 1.45, rim top y=1.24 walkable), posts + crank + little red roof (4.35 tall), animated water disc, bucket. Cylinder collider.',
  },
  barrel_cluster: {
    fn: barrelCluster, size: 5,
    note: 'Two upright barrels and one lying, iron hoops. ~1.1 tall. Cylinder/box colliders (top:true on the upright barrels).',
  },
  crate_stack: {
    fn: crateStack, size: 5,
    note: 'Four stacked/scattered crates (crate texture), stack height 2.4; box colliders top:true so Spyro can climb (1.35 / 1.2 / 1.15 rises).',
  },
  market_stall: {
    fn: marketStall, size: 7,
    note: 'Market stall, customer side = +Z. variant 0 teal/cream awning + produce, 1 coral/cream + pots, 2 violet/gold + produce. Hanging lantern with glow; table collider.',
    defaults: { variant: 0 },
  },
};
