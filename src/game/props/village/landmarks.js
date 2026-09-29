// One-off landmarks: arch_gate (spawn portal), gate_pillars (Dawn Gate), windmill_body, tower_observatory, bridge_stone.
import {
  PI, TAU, clamp, lerp, mixc, mulc, TINT, vgrad, grid, fan, quadUV, cells, frustum, planar, arcPt, frameBox, column, archUnit,
} from './common.js';
import { lanternBody, post } from './details.js';

const VIOLET = [0.66, 0.46, 1.0];

// ---------------------------------------------------------------------------------------------------------------
// arch_gate : the spawn portal.  Local +Z = front (the valley side, where the player appears).
// ---------------------------------------------------------------------------------------------------------------
export function archGate(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    const W = 5.0, D = 1.3, a = 2.4, ys = 4.2, Yt = 8.4, n = 10, prud = 0.16, ringW = 0.85;
    const Ro = a + ringW, Dr = D + prud, base = -0.7;
    const st = kit.b('brick');
    const so = { tile: 3.2, emissive: 0.22 };
    const tint = (yy) => vgrad(0, [0.86, 0.84, 0.94], 6, [1.06, 1.03, 1.12]);
    const X = [1, 0, 0], Y = [0, 1, 0];
    const th = (i) => PI - (i * PI) / n;
    const glowB = kit.b(null);

    for (const sg of [1, -1]) {
      const zf = sg * D;
      const uA = [sg, 0, 0];
      const P = (px, py, zz = zf) => [sg * px, py, zz];
      const rect = (x0, x1, y0, y1, nx, ny) => {
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const ax = lerp(x0, x1, i / nx), bx = lerp(x0, x1, (i + 1) / nx), ay = lerp(y0, y1, j / ny), by = lerp(y0, y1, (j + 1) / ny);
          planar(st, [P(ax, ay), P(bx, ay), P(bx, by), P(ax, by)], uA, Y, { ...so, color: tint() });
        }
      };
      // pillar faces: lower, upper
      for (const sx of [-1, 1]) {
        const x0 = sx > 0 ? a : -W, x1 = sx > 0 ? W : -a;
        rect(x0, x1, base, ys, 1, 2);
        rect(x0, x1, ys, Yt, 1, 2);
      }
    }
    archUnit(kit, { a, ys, Yt, D, n, prud, ringW, tex: 'brick', tint: [1, 0.98, 1.06], emissive: 0.22, glow: true, tunnel: false });
    // outer side faces
    grid(st, [W, base, D], [0, 0, -2 * D], [0, Yt - base, 0], 1, 3, { ...so, color: tint() });
    grid(st, [-W, base, -D], [0, 0, 2 * D], [0, Yt - base, 0], 1, 3, { ...so, color: tint() });
    // tunnel: side walls + intrados
    grid(st, [-a, 0, Dr], [0, 0, -2 * Dr], [0, ys, 0], 1, 2, { ...so, color: vgrad(0, [0.7, 0.68, 0.8], ys, [0.95, 0.93, 1.05]) });
    grid(st, [a, 0, -Dr], [0, 0, 2 * Dr], [0, ys, 0], 1, 2, { ...so, color: vgrad(0, [0.7, 0.68, 0.8], ys, [0.95, 0.93, 1.05]) });
    for (let i = 0; i < n; i++) {
      const q0 = arcPt(0, ys, a, th(i)), q1 = arcPt(0, ys, a, th(i + 1));
      planar(st, [[q1[0], q1[1], Dr], [q0[0], q0[1], Dr], [q0[0], q0[1], -Dr], [q1[0], q1[1], -Dr]], [0, 0, 1], [1, 0, 0], { ...so, color: [0.62, 0.6, 0.74] });
    }
    // cornice slab + flagstone cap
    kit.b('brick').box(0, Yt + 0.25, 0, 2 * (W + 0.4), 0.5, 2 * (D + 0.45), { tile: 3.2, color: [1.0, 0.98, 1.08], emissive: 0.22, faces: ['+z', '-z', '+x', '-x', '-y'] });
    kit.b('flagstone').box(0, Yt + 0.25, 0, 2 * (W + 0.4), 0.5, 2 * (D + 0.45), { tile: 3.2, color: [1.0, 0.98, 1.08], emissive: 0.22, faces: ['+y'] });
    // pinnacles over the pillars
    for (const sx of [-1, 1]) {
      const cx = sx * 3.7;
      kit.xf.push().translate(cx, Yt + 0.5, 0);
      kit.b('roof_teal').cyl(1.55, 0.0, 3.6, 8, { tile: 3.0, smooth: false, uWrap: 5, emissive: 0.16, color: vgrad(0, [0.85, 0.85, 0.95], 3.6, [1.1, 1.1, 1.15]) });
      kit.xf.translate(0, 3.6, 0);
      kit.b('metal_brass').sphere(0.34, 6, 3, { tile: 1.6, emissive: 0.4, smooth: false });
      kit.xf.pop();
    }
    // rune plaques on the pillars (emissive)
    const rb = kit.b('rune_ring');
    for (const sg of [1, -1]) for (const sx of [-1, 1]) for (const py of [2.3, 6.0]) {
      const s = 0.85, cx = sx * 3.8, zz = sg * (D + 0.05);
      const a0 = [cx - sg * s, py - s, zz], b0 = [cx + sg * s, py - s, zz];
      rb.quad(a0, b0, [b0[0], py + s, zz], [a0[0], py + s, zz], { uv: [0, 0, 1, 1], emissive: 0.85, color: [0.95, 0.9, 1.0] });
    }
    // glowing inner edges of the pillars (facing the opening)
    {
      const xr = a - 0.07;
      glowB.quad([xr, 0.3, -0.2], [xr, 0.3, 0.2], [xr, ys - 0.2, 0.2], [xr, ys - 0.2, -0.2], { color: VIOLET, emissive: 1 });
      glowB.quad([-xr, 0.3, 0.2], [-xr, 0.3, -0.2], [-xr, ys - 0.2, -0.2], [-xr, ys - 0.2, 0.2], { color: VIOLET, emissive: 1 });
    }
    // dais (spawn platform)
    const dz0 = -2.2, dz1 = 7.0, dh = 0.32, dw = 6.4;
    kit.b('flagstone').quad([-dw, dh, dz1], [dw, dh, dz1], [dw, dh, dz0], [-dw, dh, dz0], { tile: 3.2, color: [1.02, 1.0, 1.1], emissive: 0.22 });
    for (const [O, U, N] of [
      [[-dw, base, dz1], [2 * dw, 0, 0], 'front'], [[dw, base, dz0], [-2 * dw, 0, 0], 'back'],
      [[dw, base, dz1], [0, 0, -(dz1 - dz0)], 'right'], [[-dw, base, dz0], [0, 0, dz1 - dz0], 'left'],
    ]) grid(kit.b('brick'), O, U, [0, dh - base, 0], 3, 1, { tile: 3.2, color: vgrad(base, [0.6, 0.58, 0.68], dh, [0.98, 0.96, 1.06]), emissive: 0.2 });
    // spawn rune plate
    const rh = 2.1, rz = 4.3, ry = dh + 0.1;
    kit.b('rune_ring').box(0, dh + 0.05, rz, 2 * rh, 0.1, 2 * rh, { uv: [0, 0, 1, 1], emissive: 0.9, color: [0.95, 0.9, 1.0], faces: ['+y'] });
    kit.b('brick').box(0, dh + 0.05, rz, 2 * rh, 0.1, 2 * rh, { tile: 3.2, color: [0.9, 0.88, 1.0], emissive: 0.2, faces: ['+z', '-z', '+x', '-x'] });
    // two rune posts framing the spawn area
    for (const sx of [-1, 1]) {
      const px = sx * 5.5, pz = 6.0;
      kit.b('brick').box(px, dh + 1.0, pz, 0.9, 2.0, 0.9, { tile: 3.2, color: [0.95, 0.92, 1.05], emissive: 0.22, faces: ['+z', '-z', '+x', '-x'] });
      kit.b('brick').box(px, dh + 2.12, pz, 1.2, 0.24, 1.2, { tile: 3.2, color: [1.0, 0.98, 1.1], emissive: 0.22, faces: ['+z', '-z', '+x', '-x', '+y', '-y'] });
      frustum(kit.b('crystal_violet'), px, pz, 0.42, 0.42, 0.05, 0.05, dh + 2.24, dh + 3.5, { uv: [0, 0, 1, 1], emissive: 1, color: [0.95, 0.9, 1.05], faces: ['+z', '-z', '+x', '-x'] });
      kit.glow(px, dh + 2.9, pz, { color: [0.62, 0.45, 1.0], size: 3, pool: 2.5 });
      kit.box(px, pz, 0.5, 0.5, -1, dh + 2.3, { tag: 'post' });
    }
    // the portal itself: additive swirling disc, double sided, arch-shaped
    const pb = kit.b('portal', { mode: 'add', double: true, scroll: [0.025, 0.045] });
    const pts = [[-a + 0.05, dh + 0.02, 0], [a - 0.05, dh + 0.02, 0]];
    const m = 12;
    for (let i = 0; i <= m; i++) { const q = arcPt(0, ys, a - 0.05, (i * PI) / m); pts.push([q[0], q[1], 0]); }
    const H = ys + a - dh;
    fan(pb, pts, (q) => [(q[0] + a) / (2 * a) * 1.3, (q[1] - dh) / H * 1.9], { color: [0.62, 0.5, 0.98], emissive: 1 });
    kit.glow(0, 3.6, 1.6, { color: [0.62, 0.45, 1.0], size: 10, pool: 7 });
    // colliders: one solid block (the portal is not walkable-through) + the dais
    kit.box(0, 0, W, D, -1, Yt + 0.5, { tag: 'gate' });
    kit.box(0, (dz0 + dz1) / 2, dw, (dz1 - dz0) / 2, -1, dh, { top: true, tag: 'dais' });
    kit.caster(-3.7, 0, 1.7, 9.5, 0.45);
    kit.caster(3.7, 0, 1.7, 9.5, 0.45);
    kit.caster(0, 0, 2.2, 7.5, 0.35);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// gate_pillars : the Dawn Gate.  Opening 6.0 wide x 11.5 tall, barrier plane at z = 0.  Local +Z = approach side.
// ---------------------------------------------------------------------------------------------------------------
export function gatePillars(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  kit.at(x, z, { rot, scale, y }, () => {
    const cxP = 5.0, hOpen = 3.0;              // pillar centre |x|, half opening width
    const yCap = 10.8, yLin = 11.5, yTop = 14.0;
    const st = kit.b('tower_stone');
    const br = kit.b('brick');
    const glowB = kit.b(null);
    const so = { tile: 3.2, emissive: 0.26 };
    const stoneTint = vgrad(0, [0.95, 0.95, 1.05], 12, [1.2, 1.2, 1.35]);
    const brTint = [0.95, 0.92, 1.05];

    for (const sx of [-1, 1]) {
      const cx = sx * cxP;
      // stepped plinth
      br.box(cx, -0.1, 0, 5.4, 1.4, 5.4, { tile: 3.2, color: vgrad(-0.8, [0.6, 0.58, 0.68], 0.6, brTint), emissive: 0.2, faces: ['+z', '-z', '+x', '-x', '+y'] });
      br.box(cx, 0.9, 0, 4.6, 0.6, 4.6, { tile: 3.2, color: brTint, emissive: 0.2, faces: ['+z', '-z', '+x', '-x', '+y'] });
      // tapered shaft
      column(st, cx, 0, 2.0, 2.0, 1.7, 1.7, 1.2, yCap, 3, { ...so, color: stoneTint });
      // capital
      br.box(cx, yCap + 0.35, 0, 4.7, 0.7, 4.7, { tile: 3.2, color: [1.0, 0.98, 1.1], emissive: 0.22, faces: ['+z', '-z', '+x', '-x', '-y'] });
      // rune plaques (front and back) - emissive
      const rb = kit.b('rune_ring');
      for (const sg of [1, -1]) for (const py of [3.6, 6.4, 9.2]) {
        const yy = py, t = (yy - 1.2) / (yCap - 1.2), hh = lerp(2.0, 1.7, t);
        const s = 0.85, zz = sg * (hh + 0.05);
        const a0 = [cx - sg * s, yy - s, zz], b0 = [cx + sg * s, yy - s, zz];
        rb.quad(a0, b0, [b0[0], yy + s, zz], [a0[0], yy + s, zz], { uv: [0, 0, 1, 1], emissive: 0.9, color: [0.95, 0.9, 1.0] });
      }
    }
    // glowing channels: inner faces of the pillars
    for (const sx of [-1, 1]) {
      const xin0 = sx * (cxP - 2.0), xin1 = sx * (cxP - 1.7);
      // the face leans: bottom at y=1.2 (x = xin0) to top y=yCap (x = xin1); channel 0.36 wide centred on z=0
      const e = 0.07;
      const t0 = 0.05, t1 = 0.97;
      const xa = lerp(xin0, xin1, t0) - sx * e, xb = lerp(xin0, xin1, t1) - sx * e;
      const ya = lerp(1.2, yCap, t0), yb = lerp(1.2, yCap, t1);
      if (sx > 0) glowB.quad([xa, ya, -0.2], [xa, ya, 0.2], [xb, yb, 0.2], [xb, yb, -0.2], { color: VIOLET, emissive: 1 });
      else glowB.quad([xa, ya, 0.2], [xa, ya, -0.2], [xb, yb, -0.2], [xb, yb, 0.2], { color: VIOLET, emissive: 1 });
    }
    // lintel + cornice
    const LW = 7.7, LD = 1.9;
    for (const [O, U, V] of [
      [[-LW, yLin, LD], [2 * LW, 0, 0], [0, yTop - yLin, 0]],
      [[LW, yLin, -LD], [-2 * LW, 0, 0], [0, yTop - yLin, 0]],
      [[LW, yLin, LD], [0, 0, -2 * LD], [0, yTop - yLin, 0]],
      [[-LW, yLin, -LD], [0, 0, 2 * LD], [0, yTop - yLin, 0]],
    ]) grid(st, O, U, V, U[0] ? 5 : 1, 1, { ...so, color: vgrad(yLin, [1.1, 1.1, 1.25], yTop, [1.25, 1.25, 1.4]) });
    // underside of the lintel across the opening
    st.quad([-hOpen, yLin, LD], [-hOpen, yLin, -LD], [hOpen, yLin, -LD], [hOpen, yLin, LD], { tile: 3.2, color: [0.6, 0.6, 0.78], flip: false, emissive: 0.2 });
    br.box(0, yTop + 0.25, 0, 2 * (LW + 0.35), 0.5, 2 * (LD + 0.35), { tile: 3.2, color: [1.0, 0.98, 1.1], emissive: 0.22, faces: ['+z', '-z', '+x', '-x', '-y'] });
    kit.b('flagstone').box(0, yTop + 0.25, 0, 2 * (LW + 0.35), 0.5, 2 * (LD + 0.35), { tile: 3.2, color: [1.0, 0.98, 1.1], emissive: 0.22, faces: ['+y'] });
    // big rune glyphs on the lintel (front + back)
    const rb2 = kit.b('rune_ring');
    for (const sg of [1, -1]) for (const [cx2, s] of [[0, 1.05], [-4.6, 0.75], [4.6, 0.75]]) {
      const yy = (yLin + yTop) / 2, zz = sg * (LD + 0.05);
      const a0 = [cx2 - sg * s, yy - s, zz], b0 = [cx2 + sg * s, yy - s, zz];
      rb2.quad(a0, b0, [b0[0], yy + s, zz], [a0[0], yy + s, zz], { uv: [0, 0, 1, 1], emissive: 0.9, color: [0.95, 0.9, 1.0] });
    }
    // five beacon sockets along the top: dim frosted lanterns
    for (let i = 0; i < 5; i++) {
      const bx = (i - 2) * 3.4, by = yTop + 0.5;
      kit.b('lantern_glass_off').box(bx, by + 0.45, 0, 0.9, 0.9, 0.9, { uv: [0, 0, 1, 1], emissive: 0.45, faces: ['+z', '-z', '+x', '-x'], color: [1, 1, 1] });
      frustum(kit.b('metal_brass'), bx, 0, 0.6, 0.6, 0.08, 0.08, by + 0.9, by + 1.35, { tile: 1.6, color: [1, 1, 1], faces: ['+z', '-z', '+x', '-x'] });
    }
    // threshold slab in the opening (walkable), flagstone
    kit.b('flagstone').quad([-3.4, 0.14, 2.4], [3.4, 0.14, 2.4], [3.4, 0.14, -2.4], [-3.4, 0.14, -2.4], { tile: 3.2, color: [1.0, 0.98, 1.1], emissive: 0.22 });
    for (const [O, U] of [[[-3.4, -0.6, 2.4], [6.8, 0, 0]], [[3.4, -0.6, -2.4], [-6.8, 0, 0]], [[3.4, -0.6, 2.4], [0, 0, -4.8]], [[-3.4, -0.6, -2.4], [0, 0, 4.8]]]) grid(br, O, U, [0, 0.74, 0], 2, 1, { tile: 3.2, color: [0.85, 0.83, 0.95], emissive: 0.2 });
    // colliders: pillars (plinth + shaft), lintel above the opening, threshold
    for (const sx of [-1, 1]) {
      kit.box(sx * cxP, 0, 2.7, 2.7, -1, 1.5, { tag: 'pillar' });
      kit.box(sx * cxP, 0, 2.05, 2.05, 1.5, yLin + 0.2, { tag: 'pillar' });
    }
    kit.box(0, 0, LW, LD, yLin, yTop + 1.6, { tag: 'lintel' });
    kit.box(0, 0, 3.4, 2.4, -1, 0.14, { top: true, tag: 'threshold' });
    kit.glow(0, 5.5, 0.2, { color: [0.62, 0.45, 1.0], size: 12, pool: 8 });
    for (const sx of [-1, 1]) kit.caster(sx * cxP, 0, 2.3, 14, 0.45);
    kit.caster(0, 0, 2.0, 14, 0.3);
  });
}

export const LANDMARKS = {
  gate_pillars: {
    fn: gatePillars, size: 18,
    note: 'Dawn Gate: two colossal runed pillars (4 wide at the base, tapering to 3.4, shaft to y=10.8, capitals to 11.5) flanking an OPENING 6.0 wide x 11.5 tall (inner faces at x=+-3.0), heavy lintel 15.4 wide (y 11.5-14.0) with a cornice and five dim beacon sockets on top (total ~15.3 tall, 15.4 wide, 5 deep at the plinths). Front = +Z; the opening plane is z=0. anchors.barrier = centre of the opening [0,5.75,0]: fill x in [-3,3], y in [0,11.5] at z=0. Colliders on the pillars + lintel (above y=11.5) only; a low walkable threshold slab (top y=0.14) lies in the opening.',
    anchors: { barrier: [0, 5.75, 0] },
  },
  arch_gate: {
    fn: archGate, size: 14,
    note: 'Spawn portal: stone arch 10 wide x ~8.9 tall (pinnacles to ~12.5), 2.6 deep, emissive violet rune trim + additive portal disc in the opening (arch-shaped, z=0). Front = +Z. A flagstone dais (12.8 x 9.2, top y=0.32, walkable) extends to z=+7 with a glowing rune plate at z=4.3. anchors.spawn=[0,0.34,4.3,0] (x,y,z,yawRot: face local +Z, away from the arch); anchors.portal=[0,3.4,0] disc centre. The whole gate is one solid box collider (portal is not walk-through).',
    anchors: { spawn: [0, 0.34, 4.3, 0], portal: [0, 3.4, 0] },
  },
};
