// REALM PORTAL - the swirl of light that fills a doorway between worlds (the homeworld's doors, and the ring that opens above the Great Beacon).
// The disc lies in the XY plane around the model's origin and is visible from both sides; +Z is its front. Two additive layers of the vortex
// texture turn against each other (their UVs are rotated every frame: the outline stays put, only the light inside it swirls), a hot core
// pulses in the middle, a bright rim runs round the edge and a dark veil under it makes the light read against a bright sky.
//
// opts: shape 'ring' (a circle of radius r) | 'arch' (a doorway: half-width r, a semicircle on top of a straight part hs tall: the origin is the
//   springing of the arch, the opening reaches hs below it), color [r,g,b] 0..1 (the light's tint), rim (default true for a ring), open (start open).
// API: setOpen(k) 0 closed (hidden) .. 1 open: it pops open with a little overshoot and closes the same way; setSealed(b) makes the swirl a dim,
//   slow, nearly dead veil (a portal that still sleeps); setColor([r,g,b]); update(dt, { t, boost }) (boost 0..1: someone is near - it spins and
//   shines harder); `open` / `sealed` read the state back.
import { Rig, setAlpha, setMul } from './common.js';
import { litBuilder, smooth, clamp, lerp, TAU } from './geo.js';

const SEGS = 28, ARCH_SEGS = 14;

/** The outline of the opening, counter-clockwise seen from +z, around (0, 0). */
function outline(shape, R, hs) {
  const pts = [];
  if (shape === 'arch') {
    pts.push([-R, -hs], [R, -hs]);
    for (let i = 0; i <= ARCH_SEGS; i++) { const a = (i / ARCH_SEGS) * Math.PI; pts.push([R * Math.cos(a), R * Math.sin(a)]); }
  } else {
    for (let i = 0; i < SEGS; i++) { const a = (i / SEGS) * TAU; pts.push([R * Math.cos(a), R * Math.sin(a)]); }
  }
  return pts;
}

export function createPortal(assets, opts = {}) {
  const shape = opts.shape === 'arch' ? 'arch' : 'ring';
  const R = opts.r ?? 2.4, HS = shape === 'arch' ? (opts.hs ?? R) : 0;
  const RT = Math.max(R, HS);                                  // (the vortex's circle covers the whole opening: for an arch, its straight part too)
  const rim = opts.rim ?? shape === 'ring';
  const color = (opts.color || [0.66, 0.46, 1.0]).slice();
  const rig = new Rig(assets);
  const anchors = {};
  const P = outline(shape, R, HS), n = P.length;
  const N = [0, 0, 1];

  const mVeil = rig.half('barrier', { double: true, scroll: [0, 0.05], depthWrite: false });
  const mA = rig.glow('portal_swirl', { double: true });
  const mB = rig.glow('portal_swirl', { double: true });
  const mCore = rig.glow('sun_glow', { double: true });
  const mRim = rig.glow(null, { double: true });

  // a fan from the centre over the whole outline: alpha `aC` at the middle and `aE` at the edge
  const fan = (b, tint, aC, aE) => {
    for (let i = 0; i < n; i++) {
      const p = [P[i][0], P[i][1], 0], q = [P[(i + 1) % n][0], P[(i + 1) % n][1], 0];
      b.tri([0, 0, 0], p, q, [0.5, 0.5], [0.5, 0.5], [0.5, 0.5], { tints: [tint, tint, tint], alphas: [aC, aE, aE], tile: 1 }, N);
    }
  };
  const veilB = litBuilder(1, 201); veilB.translate(0, 0, -0.04); fan(veilB, [0.16, 0.1, 0.34], 0.9, 1);
  const veil = rig.mesh(veilB, mVeil, null, { name: 'veil', order: 7 });
  const aB = litBuilder(1, 202); fan(aB, [1, 1, 1], 1, 0.85);
  const layerA = rig.mesh(aB, mA, null, { name: 'swirl', order: 8 });
  const bB = litBuilder(1, 203); bB.translate(0, 0, 0.03); fan(bB, [1, 1, 1], 0.9, 0.5);
  const layerB = rig.mesh(bB, mB, null, { name: 'swirl2', order: 9 });
  // the hot core
  const cB = litBuilder(1, 204);
  {
    const s = R * 0.5, z = 0.06;
    cB.quad([-s, -s, z], [s, -s, z], [s, s, z], [-s, s, z], { uv: [0, 0, 1, 1], tints: [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]] }, [N, N, N, N]);
  }
  rig.mesh(cB, mCore, null, { name: 'core', order: 10 });
  // the rim: a band just inside the outline, bright at the edge and fading inwards
  let rimMesh = null;
  if (rim) {
    const rB = litBuilder(1, 205);
    const w = Math.min(0.2 * R, 0.5);
    const inner = (p) => { const l = Math.hypot(p[0], p[1]) || 1; const k = Math.max(0, 1 - w / l); return [p[0] * k, p[1] * k]; };
    for (let i = 0; i < n; i++) {
      const a = P[i], b2 = P[(i + 1) % n], ia = inner(a), ib = inner(b2), z = 0.07;
      rB.quad([a[0], a[1], z], [b2[0], b2[1], z], [ib[0], ib[1], z], [ia[0], ia[1], z], { uv: [0, 0, 1, 1], tints: [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]], alphas: [1, 1, 0, 0] }, [N, N, N, N]);
    }
    rimMesh = rig.mesh(rB, mRim, null, { name: 'rim', order: 11 });
  }
  rig.anchor(anchors, 'center', 0, 0, 0);
  rig.anchor(anchors, 'front', 0, 0, 1.2);

  /** rewrite a layer's UVs: the texture, one tile `span` metres wide, turned by `ang` about the centre */
  const setUV = (mesh, span, ang) => {
    const g = mesh.geometry, pos = g.attributes.position.array, uv = g.attributes.uv, a = uv.array;
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let i = 0, m = uv.count; i < m; i++) {
      const x = pos[i * 3] / span, y = pos[i * 3 + 1] / span;
      a[i * 2] = 0.5 + c * x - s * y; a[i * 2 + 1] = 0.5 + s * x + c * y;
    }
    uv.needsUpdate = true;
  };

  const st = { k: opts.open ? 1 : 0, v: 0, target: opts.open ? 1 : 0, seal: opts.sealed ? 1 : 0, sealTarget: opts.sealed ? 1 : 0, t: Math.random() * 10, spin: 0, boost: 0 };
  const apply = () => {
    const k = st.k, t = st.t, live = 1 - st.seal;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.1);
    const shine = 0.78 + 0.22 * pulse + 0.5 * st.boost;
    // a dormant portal: the swirl is a faint, slow, cold ghost of itself
    const dim = lerp(0.2, 1, live);
    setMul(mA, [color[0] * dim * shine, color[1] * dim * shine, color[2] * dim * shine]);
    const pale = [lerp(color[0], 1, 0.3), lerp(color[1], 1, 0.3), lerp(color[2], 1, 0.3)];
    setMul(mB, [pale[0] * dim * shine, pale[1] * dim * shine, pale[2] * dim * shine]);
    setMul(mCore, [pale[0] * (0.4 + 0.3 * pulse) * live, pale[1] * (0.4 + 0.3 * pulse) * live, pale[2] * (0.4 + 0.3 * pulse) * live]);
    setMul(mRim, [color[0] * (0.7 + 0.3 * pulse) * lerp(0.35, 1.15, live), color[1] * (0.7 + 0.3 * pulse) * lerp(0.35, 1.15, live), color[2] * (0.7 + 0.3 * pulse) * lerp(0.35, 1.15, live)]);
    const fade = smooth(0, 0.35, k);
    setAlpha(mA, 1.0 * fade); setAlpha(mB, 0.6 * fade * live + 0.06 * fade); setAlpha(mCore, 0.35 * fade * live); setAlpha(mRim, 0.9 * fade);
    setAlpha(mVeil, lerp(1.6, 1.3, st.seal) * fade);
    setUV(layerA, 2 * RT, st.spin);
    setUV(layerB, 1.25 * RT, -1.45 * st.spin + 1.1);
    rig.root.scale.setScalar(Math.max(0.001, clamp(k, 0, 1.25)));
    rig.root.visible = k > 0.004;
  };
  const model = {
    root: rig.root, anchors, radius: R, height: shape === 'arch' ? HS + R : 2 * R, size: { w: 2 * R, h: shape === 'arch' ? HS + R : 2 * R },
    tris: rig.tris,
    get open() { return st.target; },
    get sealed() { return st.sealTarget > 0.5; },
    get k() { return st.k; },
    setOpen(k) { st.target = clamp(k); },
    setSealed(b) { st.sealTarget = b ? 1 : 0; },
    setColor(c) { color[0] = c[0]; color[1] = c[1]; color[2] = c[2]; },
    update(dt, pose) {
      pose = pose || {};
      if (pose.t !== undefined) st.t = pose.t; else st.t += dt;
      if (pose.open !== undefined) st.target = clamp(pose.open);
      if (pose.sealed !== undefined) st.sealTarget = pose.sealed ? 1 : 0;
      st.boost += ((pose.boost || 0) - st.boost) * (1 - Math.exp(-dt * 4));
      // a spring: the portal pops open past full size and settles (closing is the same motion the other way)
      st.v += (st.target - st.k) * 110 * dt;
      st.v *= Math.exp(-8.5 * dt);
      st.k += st.v * dt;
      if (st.target === 0 && st.k < 0.004 && Math.abs(st.v) < 0.05) { st.k = 0; st.v = 0; }
      st.seal += (st.sealTarget - st.seal) * (1 - Math.exp(-dt * 3));
      st.spin += dt * lerp(0.12, 0.8 + 0.9 * st.boost, 1 - st.seal);
      apply();
    },
    testPoses: { closed: { open: 0 }, open: { open: 1 }, sealed: { open: 1, sealed: 1 } },
    flash: () => {},
    dispose: () => rig.dispose(),
  };
  void veil; void rimMesh;
  apply();
  return model;
}
