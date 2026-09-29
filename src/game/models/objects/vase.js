// VASE — breakable clay urn, 3 variants (terracotta amphora / teal squat pot / violet tall jar). The variants share the
// artist's `vase` texture (the clay hues are re-tinted at load time, the frieze / stripes stay as painted).
// The game hides it on break and spawns shards coloured from `shardColors`.
import { Rig, exposure, setExposure } from './common.js';
import { litBuilder, latheUV, strut, clamp } from './geo.js';
import { derivedTexture, recolor } from './recolor.js';

const clayPick = (h, s, v) => (h <= 26 || h >= 350) && s <= 0.78 && v >= 0.2;

// profile rows: [r, y, v]  (v = row of the 32px texture: frieze band .31-.72, cream stripes ~.2 and ~.83, rim band .9+)
const VARIANTS = [
  { // 0: classic amphora, terracotta, ear handles
    profile: [[0.28, 0.0, 0.02], [0.55, 0.42, 0.47], [0.48, 0.7, 0.7], [0.31, 0.9, 0.85], [0.4, 1.04, 0.95], [0.37, 1.1, 1.0]],
    hue: null, body: [0.78, 0.38, 0.24], mouth: 0.3,
    arms: [[[0.3, 0.93, 0], [0.58, 0.86, 0]], [[0.58, 0.86, 0], [0.5, 0.66, 0]]],
    shards: [[0.78, 0.38, 0.24], [0.61, 0.29, 0.2], [0.94, 0.66, 0.42], [0.24, 0.47, 1.0]],
  },
  { // 1: squat teal-glazed pot, wide mouth, no handles
    profile: [[0.3, 0.0, 0.02], [0.4, 0.07, 0.1], [0.58, 0.36, 0.42], [0.56, 0.58, 0.64], [0.34, 0.8, 0.82], [0.42, 0.95, 0.94], [0.4, 1.0, 1.0]],
    hue: [150, 0.62, 0.95], body: [0.28, 0.62, 0.4], mouth: 0.33,
    arms: [],
    shards: [[0.28, 0.62, 0.4], [0.18, 0.42, 0.28], [0.55, 0.82, 0.6], [0.94, 0.66, 0.24]],
  },
  { // 2: tall slender violet jar with two lugs
    profile: [[0.25, 0.0, 0.02], [0.45, 0.36, 0.44], [0.44, 0.62, 0.66], [0.26, 0.92, 0.83], [0.34, 1.06, 0.95], [0.31, 1.12, 1.0]],
    hue: [276, 0.55, 0.98], body: [0.5, 0.3, 0.72], mouth: 0.25,
    arms: [[[0.4, 0.66, 0], [0.55, 0.6, 0]]],
    shards: [[0.5, 0.3, 0.72], [0.34, 0.2, 0.52], [0.72, 0.58, 0.9], [0.94, 0.66, 0.24]],
  },
];

export function createVase(assets, opts = {}) {
  const variant = (((opts.variant ?? 0) | 0) % 3 + 3) % 3;
  const V = VARIANTS[variant];
  const rig = new Rig(assets);
  const anchors = {};
  const mClay = V.hue
    ? rig.litMap(derivedTexture(assets, 'vase', 'v' + variant, (p) => recolor(p, clayPick, { hue: V.hue[0], sat: V.hue[1], val: V.hue[2] })))
    : rig.lit('vase');
  const mPlain = rig.lit(null);

  const body = rig.pivot('body');          // wobbles about the foot
  {
    const b = litBuilder(1, 41 + variant);
    latheUV(b, V.profile, 8, { uWrap: 1, color: [1, 1, 1], smooth: true });
    rig.mesh(b, mClay, body, { name: 'vase' });
    // handles / lugs + the dark mouth share one plain-coloured mesh
    const d = litBuilder(1, 51);
    for (const sx of [-1, 1]) {
      for (const [p0, p1] of V.arms) strut(d, [sx * p0[0], p0[1], 0], [sx * p1[0], p1[1], 0], 0.13, 0.13, { sides: 3, color: V.body.map((c) => c * 0.9), tile: 0.6 });
    }
    const top = V.profile[V.profile.length - 1];
    d.disc(V.mouth, 8, { y: top[1] - 0.07, color: [0.14, 0.08, 0.08], tile: 1 });
    rig.mesh(d, mPlain, body, { name: 'handles+mouth' });
  }
  rig.anchor(anchors, 'top', 0, 1.1, 0);
  rig.anchor(anchors, 'center', 0, 0.5, 0);

  const st = { wob: 0, t: 0 };
  const model = {
    root: rig.root,
    anchors,
    radius: 0.55,
    height: 1.1,
    tris: rig.tris,
    variant,
    shardColors: V.shards.map((c) => c.slice()),
    wobble(k = 1) { st.wob = Math.max(st.wob, clamp(k)); },
    update(dt, pose) {
      pose = pose || {};
      if (pose.t !== undefined) st.t = pose.t; else st.t += dt;
      const e = exposure(1.4);
      setExposure(mClay, e);
      setExposure(mPlain, e);
      if (pose.wobble) model.wobble(pose.wobble);
      if (st.wob > 0) {
        st.wob = Math.max(0, st.wob - dt * 1.6);
        const w = st.wob * st.wob;
        body.rotation.z = Math.sin(st.t * 38) * 0.2 * w;
        body.rotation.x = Math.cos(st.t * 31 + 1) * 0.13 * w;
        const sq = 1 - Math.abs(Math.sin(st.t * 38)) * 0.05 * w;
        body.scale.set(1 + (1 - sq) * 0.6, sq, 1 + (1 - sq) * 0.6);
      } else if (body.rotation.z !== 0 || body.rotation.x !== 0) {
        body.rotation.set(0, 0, 0);
        body.scale.set(1, 1, 1);
      }
    },
    testPoses: { idle: {}, hit: (t) => ({ t, wobble: (t % 1.8) < 0.05 ? 1 : 0 }) },
    flash: (k) => rig.flash(k),
    dispose: () => rig.dispose(),
  };
  setExposure(mClay, exposure(1.4));
  setExposure(mPlain, exposure(1.4));
  return model;
}
