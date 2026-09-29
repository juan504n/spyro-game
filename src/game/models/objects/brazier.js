// BRAZIER — iron bowl on a tripod over a round stone slab, with a bed of coals. Dormant: cold grey ash and one faint
// violet ember. Lit: coals glow orange (additive) — the game adds the animated flame sprites at anchors.flame.
import { Rig, exposure, setExposure, setAlpha, setMul } from './common.js';
import { litBuilder, strut, flatRot, TAU, clamp, damp, lerp } from './geo.js';

const BOWL_FLOOR = 1.1, RIM = 1.36;

export function createBrazier(assets, opts = {}) {
  const rig = new Rig(assets);
  const anchors = {};
  const mIron = rig.lit('metal_iron');
  const mStone = rig.lit('brick');
  const mCoal = rig.lit(null);
  const mFire = rig.glow(null, { decal: true });
  const mEmber = rig.glow('sun_glow', { decal: true });

  // ---- stone slab + tripod ---------------------------------------------------------------------------------------
  {
    const b = litBuilder(1, 81);
    b.lathe([[0.86, 0], [0.78, 0.16], [0, 0.16]], 8, { smooth: false, rot: flatRot(8), tile: 2, color: [0.95, 0.95, 1.0] });
    rig.mesh(b, mStone, null, { name: 'slab' });
  }
  {
    const b = litBuilder(1, 82);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + Math.PI / 6;
      const s = Math.sin(a), c = Math.cos(a);
      strut(b, [0.62 * s, 0.15, 0.62 * c], [0.34 * s, 1.0, 0.34 * c], 0.2, 0.15, { tile: 0.8, color: [0.95, 0.95, 1.0] });
    }
    // bowl: underside cone -> outside wall -> rim -> inside wall (normals face the fire) -> floor
    b.lathe([[0, 0.84], [0.5, 0.96], [0.72, 1.24], [0.76, RIM], [0.64, RIM], [0.52, BOWL_FLOOR + 0.02], [0, BOWL_FLOOR]], 8, { smooth: false, rot: flatRot(8), tile: 1.2, color: [1, 1, 1] });
    // two carrying lugs on the rim
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI + Math.PI / 2;
      b.at(0.78 * Math.sin(a), RIM - 0.1, 0.78 * Math.cos(a), (bb) => bb.box(0, 0, 0, 0.16, 0.18, 0.16, { tile: 0.5, color: [0.85, 0.85, 0.95] }), a);
    }
    rig.mesh(b, mIron, null, { name: 'iron' });
  }
  // ---- coal bed --------------------------------------------------------------------------------------------------------
  {
    const blobAt = (b, o, sc = 1) => b.at(0, BOWL_FLOOR + 0.08, 0, (bb) => { if (sc !== 1) bb.scale(sc); bb.blob(0.41, { detail: 0, noise: 0.1, sx: 1, sy: 0.42, sz: 1, tile: 0.8, ...o }); });
    // cold ash: grey, lighter on the ridges (a colour function of position keeps neighbouring faces continuous)
    const ash = (x, y, z) => { const n = 0.5 + 0.5 * Math.sin(x * 9.1 + z * 7.3 + y * 3.7); return [0.32 + 0.4 * n, 0.3 + 0.36 * n, 0.34 + 0.34 * n]; };
    const b = litBuilder(1, 83);
    blobAt(b, { color: ash });
    rig.mesh(b, mCoal, null, { name: 'coals' });
    // hot layer: the same lump, a hair bigger, additive, with a per-vertex "glowing crack" pattern
    const hash = (x, y, z) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return v - Math.floor(v); };
    const hot = (x, y, z) => { const n = hash(Math.round(x * 6), Math.round(y * 6), Math.round(z * 6)); const k = 0.12 + 0.88 * Math.pow(n, 1.5); return [0.8 * k, 0.32 * k, 0.05 * k]; };
    const h = litBuilder(1, 83);
    blobAt(h, { color: hot }, 1.035);
    rig.mesh(h, mFire, null, { name: 'fire' });
    // radial glow card over the middle of the bed: violet ember when dormant, orange when lit
    const e = litBuilder(1, 85);
    e.disc(0.42, 8, { y: BOWL_FLOOR + 0.24, uvDisc: true, color: [0.5, 0.5, 0.5] });
    rig.mesh(e, mEmber, null, { name: 'ember' });
  }
  rig.anchor(anchors, 'flame', 0, BOWL_FLOOR + 0.22, 0);
  rig.anchor(anchors, 'base', 0, 0, 0);
  rig.anchor(anchors, 'rim', 0, RIM, 0);

  const st = { target: clamp(opts.lit ?? 0), k: clamp(opts.lit ?? 0), t: 0, init: false, ph: (opts.seed ?? 0) * 2.1 };
  const apply = () => {
    const k = st.k, t = st.t;
    const step = Math.floor(t * 9 + st.ph) % 3;                 // 3-step flicker, PS1 style
    const fl = step === 0 ? 0.82 : step === 1 ? 1.0 : 0.9;
    const e = exposure(1.4);
    setExposure(mIron, e); setExposure(mStone, e);
    // coals: pale ash goes dark as the fire takes hold, the additive layer supplies the glowing cracks
    const dk = 1 - 0.6 * k;
    mCoal.uniforms.uColorMul.value.setRGB(e * dk, e * dk * 0.9, e * dk * 0.85);
    setAlpha(mFire, k * fl);
    mFire.uniforms.uColorMul.value.setRGB(1.2, 1.0 + 0.1 * fl, 0.8);
    mFire.visible = k > 0.002;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.7 + st.ph);
    setAlpha(mEmber, (1 - k) * (0.14 + 0.3 * pulse) + k * 0.55 * fl);
    mEmber.uniforms.uColorMul.value.setRGB(lerp(0.75, 1.0, k), lerp(0.4, 0.5, k), lerp(1.0, 0.1, k));
  };
  const model = {
    root: rig.root,
    anchors,
    radius: 0.86,
    height: 1.4,
    tris: rig.tris,
    get lit() { return st.target; },
    setLit(k) { st.target = clamp(k); },
    update(dt, pose) {
      pose = pose || {};
      if (pose.t !== undefined) st.t = pose.t; else st.t += dt;
      if (pose.lit !== undefined) st.target = clamp(pose.lit);
      if (!st.init) { st.k = st.target; st.init = true; } else st.k = damp(st.k, st.target, 7, dt);
      if (Math.abs(st.k - st.target) < 0.003) st.k = st.target;
      apply();
    },
    testPoses: { dark: { lit: 0 }, lit: { lit: 1 } },
    flash: (k) => rig.flash(k),
    dispose: () => rig.dispose(),
  };
  apply();
  return model;
}
