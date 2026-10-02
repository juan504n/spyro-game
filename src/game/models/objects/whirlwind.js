// WHIRLWIND - the updraft of Skyweaver Spires: a funnel of wind that widens as it rises, made of two translucent veils of streaked air (drawn additively, scrolling round the column in opposite
// directions at different speeds, so that it seems to twist), a ring of wind on the ground at its foot, and a bright core that thins out towards the top. It is a picture of what realm/whirl.js does
// (the column the hero is carried up); the particles that drift up it are the object system's (systems/objects.js). World-oriented: the origin is the middle of the foot on the ground, +Y up.
//   opts: h (the height of the column, 30), r (its radius at the foot, 2.6), widen (WHIRL.widen: the radius at the top, in radii of the foot)
//   update(dt, { t }) breathes the veils' brightness a little (the scrolling is the materials' own)
import { Rig, setAlpha } from './common.js';
import { litBuilder, smooth, clamp, TAU } from './geo.js';
import { WHIRL } from '../../realm/whirl.js';

const N = 16;                                              // sides of the funnel

export function createWhirlwind(assets, opts = {}) {
  const H = opts.h ?? 30, R = opts.r ?? 2.6, widen = opts.widen ?? WHIRL.widen;
  const rig = new Rig(assets);
  const mVeil = rig.glow('whirl', { double: true, scroll: [0.5, 0.05], depthWrite: false });
  const mInner = rig.glow('whirl', { double: true, scroll: [-0.8, 0.03], depthWrite: false });
  const mFoot = rig.glow('whirl', { double: true, decal: true, scroll: [0.3, 0.0], depthWrite: false });
  const rows = Math.max(6, Math.round(H / 3.5));

  // one veil of the funnel: `k` of the column's radius, the repeats of the texture round it, an alpha that fades in at the foot and out at the top (the cloud of a funnel has no edge)
  const veil = (k, repeats, seed, material, name, gain) => {
    const b = litBuilder(1, seed);
    const ring = (j, i) => {
      const t = j / rows, y = t * H, r = R * (1 + (widen - 1) * t) * k, a = (i / N) * TAU;
      return [Math.sin(a) * r, y, Math.cos(a) * r];
    };
    const alphaAt = (j) => { const t = j / rows; return gain * smooth(0, 0.14, t) * (1 - smooth(0.72, 1.0, t)); };
    const tint = (j) => { const t = j / rows; return [0.62 + 0.38 * t, 0.86 + 0.14 * t, 1.0]; };
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < N; i++) {
        const p0 = ring(j, i), p1 = ring(j, i + 1), p2 = ring(j + 1, i + 1), p3 = ring(j + 1, i);
        b.quad(p0, p1, p2, p3, {
          uv: [(i / N) * repeats, (j / rows) * (H / 9), ((i + 1) / N) * repeats, ((j + 1) / rows) * (H / 9)],
          tints: [tint(j), tint(j), tint(j + 1), tint(j + 1)], alphas: [alphaAt(j), alphaAt(j), alphaAt(j + 1), alphaAt(j + 1)],
        }, [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]]);
      }
    }
    const mesh = rig.mesh(b, material, null, { name, order: 9 });
    mesh.frustumCulled = false;
    return mesh;
  };
  veil(1.0, 3, 701, mVeil, 'veil', 0.9);
  veil(0.62, 2, 702, mInner, 'core', 0.7);

  // the ring of wind on the ground at the foot: a flat disc, bright in the middle of its rim, so that the place where it starts can be seen from a distance
  {
    const b = litBuilder(1, 703);
    const rr = R * 1.9;
    b.disc(rr, 20, { y: 0.1, uvDisc: true, color: [0.7, 0.9, 1.0] });
    const mesh = rig.mesh(b, mFoot, null, { name: 'foot', order: 9 });
    mesh.frustumCulled = false;
  }

  const model = {
    root: rig.root,
    anchors: {},
    height: H,
    size: { w: 2 * R * widen, h: H },
    tris: rig.tris,
    update(dt, pose) {
      const t = (pose && pose.t) || 0;
      setAlpha(mVeil, 0.8 + 0.2 * Math.sin(t * 2.1));
      setAlpha(mInner, 0.75 + 0.25 * Math.sin(t * 3.3 + 1.3));
      setAlpha(mFoot, 0.7 + 0.3 * Math.sin(t * 2.7 + 0.4));
    },
    testPoses: { rest: {} },
    flash: () => {},
    dispose: () => rig.dispose(),
  };
  return model;
}
