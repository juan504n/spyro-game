// PORTCULLIS — iron grate gate. Two flavours:
//
//   frame 'stone' (default): a stone + timber gatehouse facade around the opening. The opening is opts.w x opts.h
//       (default 4 x 5); the facade stands opts.hood (default h + 0.4) higher than the opening so the raised grate (setOpen(1)
//       lifts it opts.lift = h - 0.5 = 4.5) hides inside the solid block above the timber lintel. Front = +Z, 1.3 thick.
//   frame 'none': just the grate (with its head beam) for dropping into a gate frame that some other prop already draws
//       (e.g. the mill tower's timber gate). Pass the clear opening as w / h. The grate slides up by opts.lift
//       (default h + 0.4) and switches itself off once fully raised.
import { Rig, exposure, setExposure } from './common.js';
import { litBuilder, strut, clamp, damp } from './geo.js';

const PIL_W = 0.95, DEPTH = 1.3;

export function createPortcullis(assets, opts = {}) {
  const OPEN_W = opts.w ?? 4, OPEN_H = opts.h ?? 5;
  const frame = opts.frame === 'none' ? 'none' : 'stone';
  const stone = frame === 'stone';
  const HOOD = stone ? (opts.hood ?? OPEN_H + 0.4) : 0;
  const TOP = OPEN_H + HOOD;
  const LIFT = opts.lift ?? (stone ? OPEN_H - 0.5 : OPEN_H + 0.4);
  const rig = new Rig(assets);
  const anchors = {};
  const mIron = rig.lit('metal_iron');
  const mBeam = rig.lit('wood_beam');
  const mStone = stone ? rig.lit('brick') : null;
  const mBanner = stone ? rig.lit('banner') : null;
  const hw = OPEN_W / 2;

  // ---- frame ---------------------------------------------------------------------------------------------------------
  if (stone) {
    const b = litBuilder(1, 111);
    const shade = (x, y) => { const k = 0.8 + 0.2 * Math.min(1, y / 4); return [k, k, k * 1.02]; };
    const o = { tile: 3, color: shade };
    const faces = ['+z', '-z', '+x', '-x', '+y'];
    // pillars
    for (const s of [-1, 1]) b.box(s * (hw + PIL_W / 2), TOP / 2, 0, PIL_W, TOP, DEPTH, { ...o, faces });
    // wall block over the opening (the grate hides in here); it overlaps into the pillars and sits a hair behind their
    // faces so no coplanar seams open up under the PS1 vertex snap
    b.box(0, OPEN_H + HOOD / 2, 0, OPEN_W + 0.8, HOOD, DEPTH - 0.08, { ...o, faces: ['+z', '-z', '+y', '-y'] });
    // cornice
    b.box(0, TOP + 0.25, 0, OPEN_W + 2 * PIL_W + 0.5, 0.5, DEPTH + 0.5, { ...o, color: [1, 1, 1.05], faces });
    // door sill
    b.box(0, 0.08, 0, OPEN_W + 0.6, 0.16, DEPTH - 0.06, { ...o, color: [0.85, 0.85, 0.9], faces: ['+z', '-z', '+y'] });
    rig.mesh(b, mStone, null, { name: 'frame' });
    // timber lintel beam + two brackets under it
    const t = litBuilder(1, 112);
    t.box(0, OPEN_H - 0.28, 0.12, OPEN_W + 0.1, 0.56, 0.9, { tile: 2, faces: ['+z', '-z', '-y'] });
    for (const s of [-1, 1]) strut(t, [s * hw, OPEN_H - 1.3, 0.3], [s * (hw - 0.05), OPEN_H - 0.5, 0.3], 0.3, 0.3, { tile: 2 });
    rig.mesh(t, mBeam, null, { name: 'timber' });
    // banners on both faces of the wall block
    const bn = litBuilder(1, 115);
    const w = Math.min(0.9, hw * 0.45), y0 = OPEN_H + 1.0, y1 = Math.max(y0 + 1.5, TOP - 0.7), z = DEPTH / 2 + 0.03;
    bn.quad([-w, y0, z], [w, y0, z], [w, y1, z], [-w, y1, z], { uv: [0, 0, 1, 1] });
    bn.quad([w, y0, -z], [-w, y0, -z], [-w, y1, -z], [w, y1, -z], { uv: [0, 0, 1, 1] });
    rig.mesh(bn, mBanner, null, { name: 'banners' });
  }
  // ---- grate (moves) --------------------------------------------------------------------------------------------------
  const grate = rig.pivot('grate', 0, 0, 0);
  {
    const g = litBuilder(1, 113);
    const span = OPEN_W - 0.5;
    const n = Math.max(3, Math.round(span / 0.58) + 1);
    const top = OPEN_H - 0.3;
    for (let i = 0; i < n; i++) {
      const x = -span / 2 + (span * i) / (n - 1);
      strut(g, [x, 0.55, 0], [x, top, 0], 0.17, 0.17, { tile: 0.9 });
      // spike
      g.at(x, 0.55, 0, (b) => { b.rotateX(Math.PI); b.cone(0.13, 0.5, 4, { smooth: false, tile: 0.6 }); });
    }
    for (const f of [0.26, 0.54, 0.82]) strut(g, [-hw + 0.1, OPEN_H * f, 0.02], [hw - 0.1, OPEN_H * f, 0.02], 0.18, 0.18, { tile: 0.9 });
    rig.mesh(g, mIron, grate, { name: 'grate' });
    const w = litBuilder(1, 114);
    w.box(0, top + 0.1, 0, OPEN_W - 0.1, 0.3, 0.4, { tile: 2, faces: ['+z', '-z', '+x', '-x', '+y', '-y'] });
    rig.mesh(w, mBeam, grate, { name: 'grateBeam' });
  }
  rig.anchor(anchors, 'gate', 0, OPEN_H / 2, 0);
  rig.anchor(anchors, 'top', 0, TOP, 0);

  const st = { target: clamp(opts.open ?? 0), k: clamp(opts.open ?? 0), t: 0 };
  const apply = () => {
    grate.position.y = st.k * LIFT;
    // a little rattle while the chains are hauling
    const mv = Math.min(1, Math.abs(st.target - st.k) * 6);
    grate.position.x = Math.sin(st.t * 61) * 0.025 * mv;
    grate.visible = stone || st.k < 0.985;
    const e = exposure(1.4);
    setExposure(mIron, e); setExposure(mBeam, e);
    if (stone) { setExposure(mStone, e); setExposure(mBanner, e); }
  };
  const model = {
    root: rig.root,
    anchors,
    radius: stone ? OPEN_W / 2 + PIL_W + 0.3 : OPEN_W / 2 + 0.3,
    height: stone ? TOP + 0.5 : OPEN_H,
    tris: rig.tris,
    opening: { w: OPEN_W, h: OPEN_H },
    frame,
    get open() { return st.target; },
    get raised() { return st.k; },             // how far the grate has actually been hauled up (0..1), as opposed to `open`, where it is heading
    setOpen(k) { st.target = clamp(k); },
    update(dt, pose) {
      pose = pose || {};
      if (pose.t !== undefined) st.t = pose.t; else st.t += dt;
      if (pose.open !== undefined) st.target = clamp(pose.open);
      st.k = damp(st.k, st.target, 5, dt);
      if (Math.abs(st.k - st.target) < 0.001) st.k = st.target;
      apply();
    },
    testPoses: { closed: { open: 0 }, half: { open: 0.5 }, open: { open: 1 } },
    flash: (k) => rig.flash(k),
    dispose: () => rig.dispose(),
  };
  apply();
  return model;
}
