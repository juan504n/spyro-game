// PORTCULLIS — iron grate gate in a stone + timber gatehouse frame. The opening is 4 wide x 5 tall; the frame is a
// 5.8 x 10.4 facade so that the grate can be hauled up (setOpen(1) lifts it 4.5 units) into the solid block above the
// timber lintel and vanish there. Faces +Z (front), z-thickness 1.3.
import { Rig, exposure, setExposure } from './common.js';
import { litBuilder, strut, clamp, damp } from './geo.js';

const OPEN_W = 4, OPEN_H = 5;
const PIL_W = 0.95, TOP = 10.4, DEPTH = 1.3;
const LIFT = 4.5;

export function createPortcullis(assets, opts = {}) {
  const rig = new Rig(assets);
  const anchors = {};
  const mStone = rig.lit('brick');
  const mBeam = rig.lit('wood_beam');
  const mIron = rig.lit('metal_iron');
  const mBanner = rig.lit('banner');
  const hw = OPEN_W / 2;

  // ---- frame ---------------------------------------------------------------------------------------------------------
  {
    const b = litBuilder(1, 111);
    const shade = (x, y) => { const k = 0.8 + 0.2 * Math.min(1, y / 4); return [k, k, k * 1.02]; };
    const o = { tile: 3, color: shade };
    const faces = ['+z', '-z', '+x', '-x', '+y'];
    // pillars
    for (const s of [-1, 1]) b.box(s * (hw + PIL_W / 2), TOP / 2, 0, PIL_W, TOP, DEPTH, { ...o, faces });
    // wall block over the opening (the grate hides in here)
    // (overlaps into the pillars and sits a hair behind their faces so no coplanar seams open up under the vertex snap)
    b.box(0, OPEN_H + (TOP - OPEN_H) / 2, 0, OPEN_W + 0.8, TOP - OPEN_H, DEPTH - 0.08, { ...o, faces: ['+z', '-z', '+y', '-y'] });
    // cornice
    b.box(0, TOP + 0.25, 0, OPEN_W + 2 * PIL_W + 0.5, 0.5, DEPTH + 0.5, { ...o, color: [1, 1, 1.05], faces: ['+z', '-z', '+x', '-x', '+y'] });
    // door sill
    b.box(0, 0.08, 0, OPEN_W + 0.6, 0.16, DEPTH - 0.06, { ...o, color: [0.85, 0.85, 0.9], faces: ['+z', '-z', '+y'] });
    rig.mesh(b, mStone, null, { name: 'frame' });
    // timber lintel beam + two brackets under it
    const t = litBuilder(1, 112);
    t.box(0, OPEN_H - 0.28, 0.12, OPEN_W + 0.1, 0.56, 0.9, { tile: 2, faces: ['+z', '-z', '-y'] });
    for (const s of [-1, 1]) {
      strut(t, [s * hw, OPEN_H - 1.3, 0.3], [s * (hw - 0.05), OPEN_H - 0.5, 0.3], 0.3, 0.3, { tile: 2 });
    }
    rig.mesh(t, mBeam, null, { name: 'timber' });
  }
  // ---- banners on both faces of the wall block ---------------------------------------------------------------------------
  {
    const b = litBuilder(1, 115);
    const w = 0.9, y0 = 6.0, y1 = 9.7, z = DEPTH / 2 + 0.03;
    b.quad([-w, y0, z], [w, y0, z], [w, y1, z], [-w, y1, z], { uv: [0, 0, 1, 1] });
    b.quad([w, y0, -z], [-w, y0, -z], [-w, y1, -z], [w, y1, -z], { uv: [0, 0, 1, 1] });
    rig.mesh(b, mBanner, null, { name: 'banners' });
  }
  // ---- grate (moves) --------------------------------------------------------------------------------------------------
  const grate = rig.pivot('grate', 0, 0, 0);
  {
    const g = litBuilder(1, 113);
    const n = 7, span = OPEN_W - 0.5;
    const top = OPEN_H - 0.3;
    for (let i = 0; i < n; i++) {
      const x = -span / 2 + (span * i) / (n - 1);
      strut(g, [x, 0.55, 0], [x, top, 0], 0.17, 0.17, { tile: 0.9 });
      // spike
      g.at(x, 0.55, 0, (b) => { b.rotateX(Math.PI); b.cone(0.13, 0.5, 4, { smooth: false, tile: 0.6 }); });
    }
    for (const y of [1.3, 2.7, 4.1]) strut(g, [-hw + 0.1, y, 0.02], [hw - 0.1, y, 0.02], 0.18, 0.18, { tile: 0.9 });
    rig.mesh(g, mIron, grate, { name: 'grate' });
    const w = litBuilder(1, 114);
    w.box(0, top + 0.1, 0, OPEN_W - 0.1, 0.3, 0.4, { tile: 2, faces: ['+z', '-z', '+x', '-x', '+y', '-y'] });
    rig.mesh(w, mBeam, grate, { name: 'grateBeam' });
  }
  rig.anchor(anchors, 'gate', 0, OPEN_H / 2, 0);
  rig.anchor(anchors, 'top', 0, TOP, 0);

  const st = { target: clamp(opts.open ?? 0), k: clamp(opts.open ?? 0), v: 0, t: 0 };
  const apply = () => {
    grate.position.y = st.k * LIFT;
    // a little rattle while the chains are hauling
    const mv = Math.min(1, Math.abs(st.target - st.k) * 6);
    grate.position.x = Math.sin(st.t * 61) * 0.025 * mv;
    const e = exposure(1.4);
    setExposure(mStone, e); setExposure(mBeam, e); setExposure(mIron, e); setExposure(mBanner, e);
  };
  const model = {
    root: rig.root,
    anchors,
    radius: OPEN_W / 2 + PIL_W + 0.3,
    height: TOP + 0.5,
    tris: rig.tris,
    opening: { w: OPEN_W, h: OPEN_H },
    get open() { return st.target; },
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
