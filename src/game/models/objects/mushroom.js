// BOUNCE MUSHROOM — giant teal/violet spring pad. Cap radius 2.4*size, the top of the dome sits at y = 1.3*size.
// pose.squash (0..1): a rising edge kicks a damped spring (cap flattens and bulges, stem compresses, then it wobbles
// back and settles). `bounce(k)` does the same from code.
import { Rig, exposure, setExposure } from './common.js';
import { litBuilder, latheUV, clamp } from './geo.js';

const STEM_TOP = 0.95;   // where the cap group sits (unscaled): top of the stem

export function createBounceMushroom(assets, opts = {}) {
  const size = opts.size ?? 1;
  const S = size;
  const rig = new Rig(assets);
  const anchors = {};
  const mCap = rig.lit('mushroom_cap');
  const mGill = rig.lit('mushroom_stem');
  const mStem = rig.lit('mushroom_stem');

  const stemG = rig.pivot('stem');
  const capG = rig.pivot('cap', 0, STEM_TOP * S, 0);
  const SEG = 10;
  // ---- stem -----------------------------------------------------------------------------------------------------
  {
    const b = litBuilder(S, 71);
    latheUV(b, [[1.1, 0, 0.02], [0.8, 0.2, 0.24], [0.66, 0.55, 0.5], [0.82, STEM_TOP + 0.04, 0.78]], SEG, { uWrap: 2, color: [1, 0.97, 0.94] });
    rig.mesh(b, mStem, stemG, { name: 'stem' });
  }
  // ---- cap: gills underneath ---------------------------------------------------------------------------------------
  {
    const b = litBuilder(S, 72);
    // centre -> rim, normals face down; 20 alternating light / dark ribs (the gills)
    const G = 20;
    for (let i = 0; i < G; i++) {
      const a0 = (i / G) * Math.PI * 2, a1 = ((i + 1) / G) * Math.PI * 2;
      const P = (r, y, a) => [r * Math.sin(a), y, r * Math.cos(a)];
      const c = i % 2 ? [1.0, 0.92, 1.0] : [0.62, 0.5, 0.78];
      b.tri(P(0, 0.02, a0), P(2.22, -0.34, a1), P(2.22, -0.34, a0), [0.5, 0.97], [1, 0.84], [0, 0.84], { color: c });
    }
    rig.mesh(b, mGill, capG, { name: 'gills' });
  }
  // ---- cap: dome ---------------------------------------------------------------------------------------------------
  {
    const b = litBuilder(S, 73);
    latheUV(b, [[2.22, -0.34, 0.02], [2.42, -0.22, 0.1], [2.3, -0.02, 0.24], [1.7, 0.2, 0.5], [0.9, 0.32, 0.78], [0, 0.35, 1.0]], SEG, { uWrap: 2, color: [1, 1, 1], smooth: true });
    rig.mesh(b, mCap, capG, { name: 'dome' });
  }
  rig.anchor(anchors, 'top', 0, 1.3 * S, 0);
  rig.anchor(anchors, 'base', 0, 0, 0);

  // ---- spring --------------------------------------------------------------------------------------------------------
  const st = { q: 0, v: 0, prev: 0, t: 0 };
  const W = 21, Z = 0.17;
  const apply = () => {
    const q = st.q;
    const sy = 1 - 0.3 * q, sxz = 1 + 0.16 * q;
    stemG.scale.set(sxz, sy, sxz);
    capG.position.y = STEM_TOP * S * sy;
    const cy = 1 - 0.34 * q, cxz = 1 + 0.2 * q;
    capG.scale.set(cxz, cy, cxz);
  };
  const model = {
    root: rig.root,
    anchors,
    radius: 2.4 * S,
    height: 1.3 * S,
    tris: rig.tris,
    size,
    bounce(k = 1) { st.q = Math.max(st.q, clamp(k)); st.v = 0; },
    update(dt, pose) {
      pose = pose || {};
      if (pose.t !== undefined) st.t = pose.t; else st.t += dt;
      if (pose.squash !== undefined) {
        if (pose.squash > st.prev + 0.01) model.bounce(pose.squash);
        st.prev = pose.squash;
      }
      const steps = Math.max(1, Math.ceil(dt / 0.006));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        const acc = -W * W * st.q - 2 * Z * W * st.v;
        st.v += acc * h;
        st.q += st.v * h;
      }
      if (Math.abs(st.q) < 0.002 && Math.abs(st.v) < 0.02) { st.q = 0; st.v = 0; }
      const e = exposure(1.35);
      setExposure(mCap, e); setExposure(mGill, e); setExposure(mStem, e);
      apply();
    },
    testPoses: { idle: {}, squash: (t) => ({ t, squash: (t % 2.2) < 0.05 ? 1 : 0 }) },
    flash: (k) => rig.flash(k),
    dispose: () => rig.dispose(),
  };
  apply();
  return model;
}
