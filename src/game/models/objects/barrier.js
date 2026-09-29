// BARRIER — the "Dawn Gate" energy wall: a translucent shimmering violet field filling a tall arched opening
// (12 wide x 11 tall, base at y = 0, in the XY plane, visible from both sides). Three additive/half layers with
// different uv scrolls (dark veil, glowing lattice, bright rim). setOpen(k): 0 = solid field .. 1 = dissolved (hidden).
import { Rig, setAlpha } from './common.js';
import { litBuilder, smooth, clamp, lerp } from './geo.js';

const HALF_W = 6, WALL_H = 7.2, ARCH_H = 3.8, ARCH_N = 8;
const CY = 4.4;   // fan centre height

function outline() {
  const pts = [[-HALF_W, 0], [HALF_W, 0]];
  for (let i = 0; i <= ARCH_N; i++) {
    const a = (i / ARCH_N) * Math.PI;
    pts.push([HALF_W * Math.cos(a), WALL_H + ARCH_H * Math.sin(a)]);
  }
  return pts;   // CCW seen from +z
}

export function createBarrier(assets, opts = {}) {
  const rig = new Rig(assets);
  const anchors = {};
  const mVeil = rig.half('barrier', { double: true, scroll: [0.0, 0.05], depthWrite: false });
  const mGlow = rig.glow('barrier', { double: true, scroll: [0.05, -0.14] });
  const mRim = rig.glow(null, { double: true });
  const P = outline();
  const n = P.length;
  const N = [0, 0, 1];
  const C = [0, CY, 0];
  const rc = (p) => Math.hypot(p[0], (p[1] - CY) * 0.6);
  const rMax = Math.max(...P.map(rc));
  const T = 3.2;                                  // world units per texture repeat
  const uvOf = (p, o = 0) => [p[0] / T + o, p[1] / T];

  // veil + glow: fans from the centre, brighter towards the edge (Gouraud tint / alpha ramp)
  const fan = (b, tint0, tint1, a0, a1, tile, off) => {
    for (let i = 0; i < n; i++) {
      const p = [P[i][0], P[i][1], 0], q = [P[(i + 1) % n][0], P[(i + 1) % n][1], 0];
      const tp = tint1, ca = a0, ea = a1;
      b.tri([0, CY, 0], p, q, uvOf(C, off), uvOf(p, off), uvOf(q, off), { tints: [tint0, tp, tp], alphas: [ca, ea, ea], tile }, N);
    }
  };
  {
    const b = litBuilder(1, 101);
    fan(b, [0.3, 0.2, 0.62], [0.55, 0.38, 0.95], 0.8, 1.0, T, 0);
    rig.mesh(b, mVeil, null, { name: 'veil', order: 8 });
    const g = litBuilder(1, 102);
    g.translate(0, 0, 0.06);
    fan(g, [0.3, 0.2, 0.55], [0.5, 0.34, 0.85], 0.5, 1.0, T, 0.37);
    rig.mesh(g, mGlow, null, { name: 'glow', order: 9 });
    // rim band (inset 0.9): bright at the frame, fading into the field
    const r = litBuilder(1, 103);
    const inset = (p) => { const dx = p[0] - C[0], dy = p[1] - C[1]; const l = Math.hypot(dx, dy) || 1; const k = 1 - 0.95 / l; return [C[0] + dx * k, C[1] + dy * k]; };
    for (let i = 0; i < n; i++) {
      const a = P[i], b2 = P[(i + 1) % n];
      const ia = inset(a), ib = inset(b2);
      const A = [a[0], a[1], 0.03], B = [b2[0], b2[1], 0.03], IB = [ib[0], ib[1], 0.03], IA = [ia[0], ia[1], 0.03];
      const hot = [0.42, 0.28, 0.72];
      r.quad(A, B, IB, IA, { uv: [0, 0, 1, 1], tints: [hot, hot, hot, hot], alphas: [1, 1, 0, 0] }, [N, N, N, N]);
    }
    rig.mesh(r, mRim, null, { name: 'rim', order: 10 });
  }
  rig.anchor(anchors, 'center', 0, 5.5, 0);

  const st = { k: clamp(opts.open ?? 0), target: clamp(opts.open ?? 0), t: 0 };
  const apply = () => {
    const k = st.k, t = st.t;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.9);
    const shim = 0.5 + 0.5 * Math.sin(t * 5.3 + 1.7) * Math.sin(t * 1.3);
    const fade = 1 - smooth(0.1, 0.95, k);
    const surge = 1 + 0.9 * Math.sin(Math.PI * clamp(k * 1.7));
    const flick = k > 0 && k < 1 ? 1 - 0.45 * (0.5 + 0.5 * Math.sin(t * 47)) * Math.sin(Math.PI * k) : 1;
    setAlpha(mVeil, 1.5 * (0.9 + 0.1 * pulse) * fade * flick);
    setAlpha(mGlow, (0.42 + 0.14 * shim) * surge * (1 - smooth(0.45, 1, k)) * flick);
    setAlpha(mRim, (0.7 + 0.2 * pulse) * (1 - smooth(0.3, 0.9, k)) * flick);
    mVeil.uniforms.uScroll.value.set(0, 0.05 + 0.5 * k);
    mGlow.uniforms.uScroll.value.set(0.05, -0.14 - 0.9 * k);
    rig.root.visible = k < 0.995;
  };
  const model = {
    root: rig.root,
    anchors,
    radius: 6,
    height: WALL_H + ARCH_H,
    tris: rig.tris,
    get open() { return st.target; },
    setOpen(k) { st.target = clamp(k); },
    update(dt, pose) {
      pose = pose || {};
      if (pose.t !== undefined) st.t = pose.t; else st.t += dt;
      if (pose.open !== undefined) st.target = clamp(pose.open);
      // ease so a single setOpen(1) dissolves over ~1.2 s while a game-driven tween passes through almost unchanged
      st.k += (st.target - st.k) * (1 - Math.exp(-dt * 8));
      if (Math.abs(st.k - st.target) < 0.002) st.k = st.target;
      apply();
    },
    testPoses: { closed: { open: 0 }, half: { open: 0.5 }, open: { open: 1 } },
    flash: () => {},
    dispose: () => rig.dispose(),
  };
  apply();
  return model;
}
