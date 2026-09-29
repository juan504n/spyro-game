// CHEST — treasure chest: wooden box with a barrel-vault lid on a rear hinge, iron bands (painted), a brass lock plate,
// dark interior with a heap of gold and a soft gold glow that fades in as the lid opens.
import { Rig, exposure, setExposure, setAlpha } from './common.js';
import { litBuilder, clamp } from './geo.js';

const W = 0.85, D = 0.5, BODY_H = 0.5;      // half width, half depth, body height (footprint 1.7 x 1.0, radius ~1)
const LID_A = D + 0.02, LID_B = 0.4;        // lid semi-axes (z, y)
const LID_X = W + 0.02;
const MAX_OPEN = (100 * Math.PI) / 180;

export function createChest(assets, opts = {}) {
  const rig = new Rig(assets);
  const anchors = {};
  const mWood = rig.lit('chest_wood');
  const mInner = rig.lit('chest_wood');
  const mGold = rig.lit('metal_brass');
  const mBrass = rig.lit('metal_brass');
  const mGlow = rig.glow('sun_glow', { double: true });

  // ---- body ---------------------------------------------------------------------------------------------------
  {
    const b = litBuilder(1, 61);
    const shade = (x, y) => { const k = 0.82 + 0.18 * (y / BODY_H); return [k, k, k]; };
    const face = (a, bb, c, d, uv) => b.quad(a, bb, c, d, { uv, color: shade });
    const y0 = 0, y1 = BODY_H;
    // front (+z) / back (-z): full width of the plank texture (bands at the ends, lock plate up by the lid seam)
    face([-W, y0, D], [W, y0, D], [W, y1, D], [-W, y1, D], [0, 0.25, 1, 0.75]);
    face([W, y0, -D], [-W, y0, -D], [-W, y1, -D], [W, y1, -D], [0, 0.25, 1, 0.75]);
    // ends
    face([W, y0, D], [W, y0, -D], [W, y1, -D], [W, y1, D], [0.2, 0.02, 0.8, 0.3]);
    face([-W, y0, -D], [-W, y0, D], [-W, y1, D], [-W, y1, -D], [0.2, 0.02, 0.8, 0.3]);
    // top rim (wall thickness 0.07)
    const t = 0.07;
    const rim = (a, bb, c, d) => b.quad(a, bb, c, d, { uv: [0.35, 0.05, 0.45, 0.12], color: [0.75, 0.75, 0.75] });
    rim([-W, y1, D], [W, y1, D], [W - t, y1, D - t], [-W + t, y1, D - t]);
    rim([W, y1, -D], [-W, y1, -D], [-W + t, y1, -D + t], [W - t, y1, -D + t]);
    rim([W, y1, D], [W, y1, -D], [W - t, y1, -D + t], [W - t, y1, D - t]);
    rim([-W, y1, -D], [-W, y1, D], [-W + t, y1, D - t], [-W + t, y1, -D + t]);
    rig.mesh(b, mWood, null, { name: 'body' });
    // interior (dark)
    const n = litBuilder(1, 62);
    const inn = (a, bb, c, d) => n.quad(a, bb, c, d, { uv: [0.25, 0.05, 0.75, 0.3], color: [0.3, 0.22, 0.18] });
    const xi = W - t, zi = D - t;
    inn([xi, 0.12, zi], [-xi, 0.12, zi], [-xi, y1, zi], [xi, y1, zi]);        // faces inward: viewed from inside -> +z wall faces -z
    inn([-xi, 0.12, -zi], [xi, 0.12, -zi], [xi, y1, -zi], [-xi, y1, -zi]);
    inn([xi, 0.12, -zi], [xi, 0.12, zi], [xi, y1, zi], [xi, y1, -zi]);
    inn([-xi, 0.12, zi], [-xi, 0.12, -zi], [-xi, y1, -zi], [-xi, y1, zi]);
    n.quad([-xi, 0.12, zi], [xi, 0.12, zi], [xi, 0.12, -zi], [-xi, 0.12, -zi], { uv: [0.25, 0.05, 0.75, 0.3], color: [0.2, 0.15, 0.12] });
    rig.mesh(n, mInner, null, { name: 'interior' });
  }
  // ---- gold heap ------------------------------------------------------------------------------------------------
  {
    const g = litBuilder(1, 63);
    g.at(0, 0.3, 0.0, (b) => b.blob(0.4, { detail: 0, noise: 0.18, sx: 1.7, sy: 0.7, sz: 1.0, tile: 0.8, color: [1.0, 0.86, 0.45] }));
    g.at(-0.42, 0.3, 0.1, (b) => b.blob(0.18, { detail: 0, noise: 0.15, sx: 1.2, sy: 0.7, sz: 1.0, tile: 0.8, color: [1.0, 0.92, 0.55] }));
    rig.mesh(g, mGold, null, { name: 'gold' });
    // glow card just under the rim
    const c = litBuilder(1, 64);
    c.quad([-0.75, 0.47, 0.36], [0.75, 0.47, 0.36], [0.75, 0.47, -0.36], [-0.75, 0.47, -0.36], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] });
    rig.mesh(c, mGlow, null, { name: 'glow' });
  }
  // ---- lid (barrel vault) on a hinge pivot at the back top edge ---------------------------------------------------
  const lid = rig.pivot('lid', 0, BODY_H, -D - 0.02);
  {
    const b = litBuilder(1, 65);
    const N = 5;
    const pt = (i) => { const t = (i / (N - 1)) * Math.PI; return { z: LID_A - LID_A * Math.cos(t), y: LID_B * Math.sin(t), nz: -Math.cos(t) / LID_A, ny: Math.sin(t) / LID_B, t }; };
    const nrm = (p) => { const l = Math.hypot(p.ny, p.nz) || 1; return [0, p.ny / l, p.nz / l]; };
    for (let i = 0; i < N - 1; i++) {
      const p0 = pt(i), p1 = pt(i + 1);
      // v: rows 20-31 of the texture (plain planks): 0 at both lower edges, .375 at the crest
      const v = (p) => (p.t <= Math.PI / 2 ? 0.375 * (p.t / (Math.PI / 2)) : 0.375 * (1 - (p.t - Math.PI / 2) / (Math.PI / 2)));
      // walk from the back hinge (t=0) over the top to the front edge (t=PI); winding: outside faces up/out
      const a = [-LID_X, p0.y, p0.z], bb = [LID_X, p0.y, p0.z], c = [LID_X, p1.y, p1.z], d = [-LID_X, p1.y, p1.z];
      // quad(BL,BR,TR,TL) has normal (BR-BL)x(TL-BL); we go back->front so use reversed corner order to face outward
      b.quad(bb, a, d, c, { uv: [1, 0.0 + v(p0), 0, 0.0 + v(p1)], color: [1, 1, 1] }, [nrm(p0), nrm(p0), nrm(p1), nrm(p1)]);
    }
    // end caps (semi-ellipse fans)
    for (const sx of [-1, 1]) {
      const c0 = [sx * LID_X, 0, LID_A];
      for (let i = 0; i < N - 1; i++) {
        const p0 = pt(i), p1 = pt(i + 1);
        const A = [sx * LID_X, p0.y, p0.z], B = [sx * LID_X, p1.y, p1.z];
        const uvOf = (p) => [0.25 + (p.z / (2 * LID_A)) * 0.5, p.y * 0.4];
        if (sx > 0) b.tri(c0, A, B, uvOf({ z: LID_A, y: 0 }), uvOf(p0), uvOf(p1), { color: [0.9, 0.9, 0.9] });
        else b.tri(c0, B, A, uvOf({ z: LID_A, y: 0 }), uvOf(p1), uvOf(p0), { color: [0.9, 0.9, 0.9] });
      }
    }
    rig.mesh(b, mWood, lid, { name: 'lid' });
    // underside of the lid (dark wood), seen once it is open: the same vault, slightly smaller, facing inward
    const u = litBuilder(1, 67);
    const k = 0.9;
    const q = (p) => ({ y: p.y * k, z: LID_A + (p.z - LID_A) * k });
    for (let i = 0; i < N - 1; i++) {
      const p0 = q(pt(i)), p1 = q(pt(i + 1));
      const a = [-LID_X + 0.01, p0.y, p0.z], bb = [LID_X - 0.01, p0.y, p0.z], c = [LID_X - 0.01, p1.y, p1.z], d = [-LID_X + 0.01, p1.y, p1.z];
      // back -> front with the natural corner order faces inward (down)
      u.quad(a, bb, c, d, { uv: [0.25, 0.02, 0.75, 0.2], color: [0.34, 0.25, 0.2] });
    }
    rig.mesh(u, mInner, lid, { name: 'lidInside' });
    // brass clasp on the lid front, bridging the seam
    const c = litBuilder(1, 66);
    c.box(0, 0.02, 2 * LID_A + 0.005, 0.2, 0.2, 0.05, { tile: 0.5, color: [1.0, 0.9, 0.7] });
    rig.mesh(c, mBrass, lid, { name: 'clasp' });
  }
  rig.anchor(anchors, 'mouth', 0, BODY_H + 0.04, 0);
  rig.anchor(anchors, 'gold', 0, 0.42, 0);

  // ---- state ---------------------------------------------------------------------------------------------------------
  const st = { target: clamp(opts.open ?? 0), k: clamp(opts.open ?? 0), v: 0, t: 0, init: false };
  const apply = () => {
    lid.rotation.x = -st.k * MAX_OPEN;
    const g = clamp(st.k * 1.4);
    mGlow.visible = g > 0.01;
    setAlpha(mGlow, g * (0.85 + 0.15 * Math.sin(st.t * 5)));
    mGlow.uniforms.uColorMul.value.setRGB(1.0, 0.78, 0.3);
  };
  const model = {
    root: rig.root,
    anchors,
    radius: 1.0,
    height: 0.9,
    tris: rig.tris,
    get open() { return st.target; },
    setOpen(k) { st.target = clamp(k); },
    update(dt, pose) {
      pose = pose || {};
      if (pose.t !== undefined) st.t = pose.t; else st.t += dt;
      if (pose.open !== undefined) st.target = clamp(pose.open);
      // damped spring (slight overshoot) so an instantaneous setOpen() still looks like a lid flying up
      const w = 16, z = 0.62;
      const steps = Math.max(1, Math.ceil(dt / 0.008));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        const acc = w * w * (st.target - st.k) - 2 * z * w * st.v;
        st.v += acc * h;
        st.k += st.v * h;
      }
      if (Math.abs(st.k - st.target) < 0.0005 && Math.abs(st.v) < 0.005) { st.k = st.target; st.v = 0; }
      const e = exposure(1.4);
      setExposure(mWood, e); setExposure(mGold, e); setExposure(mBrass, e);
      apply();
    },
    testPoses: { closed: { open: 0 }, half: { open: 0.5 }, open: { open: 1 } },
    flash: (k) => rig.flash(k),
    dispose: () => rig.dispose(),
  };
  apply();
  return model;
}
