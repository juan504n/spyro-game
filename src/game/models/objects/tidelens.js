// TIDE LENS - the goal object of Tideglass Reach: a lens of sea-glass, thick in the middle and sharp at the rim, set in a ring of brass on a spindle above a plinth of sea-stone with a ring of runes inlaid.
// Dull grey-green while the tide has no light to keep its hours; breathe fire on it and it SHINES: the glass clears to a bright aquamarine, it turns on its spindle faster (a coin spinning on its edge),
// a heart of light glows in it, a ring of runes turns above the plinth and rings of light spread. (The Windbell of Skyweaver Spires, the Beacon Lantern and the others are the pattern: the same Rig, the
// same setLit(k) contract, the same anchors; BeaconSystem lights any of them.) `opts.big` builds the x2.2 Tideglass of the lighthouse.
//
// Lighting model: the plinth and the post are lit parts (with a twilight exposure lift); the lens and its ring are lit glass and brass whose colour multipliers are driven from setLit(k); everything that
// glows is an additive layer whose alpha is driven from setLit(k).
import { U } from '../../../engine/materials.js';
import { Rig, setMul, setAlpha } from './common.js';
import { TAU, flatRot, litBuilder, lerp, damp, clamp, smooth } from './geo.js';

const Y = { plinth: 0.7, post: 2.5, centre: 3.85 };           // the plinth's top, the spindle's foot, the middle of the lens
const R = 1.25;                                               // the lens's radius

export function createTidelens(assets, opts = {}) {
  const big = !!opts.big;
  const S = big ? 2.2 : 1;
  const rig = new Rig(assets);
  const anchors = {};

  // ---- materials ---------------------------------------------------------------------------------------------------
  const mStone = rig.lit('cobble_tide');
  const mPost = rig.lit('cliff_tide', { double: true });
  const mBrass = rig.lit('metal_brass', { double: true });
  const mGlass = rig.lit('glass', { double: true });
  const mRune = rig.glow('rune_ring', { decal: true });                   // the rune ring on the plinth lights up
  const mHoop = rig.glow('rune_ring', { double: true });                  // turning ring of runes above it
  const mHeart = rig.glow('sun_glow', { double: true });                  // the heart of light in the lens
  const mAura = rig.glow('sun_glow', { double: true });                   // soft halo cards

  // ---- the plinth: two steps of sea-stone, the rune ring inlaid ------------------------------------------------------------------
  {
    const b = litBuilder(S, 51);
    const o = { smooth: false, tile: 3, color: [1.0, 1.0, 1.0] };
    b.lathe([[1.9, 0], [1.9, 0.06], [1.82, 0.36], [1.6, 0.4]], 10, { ...o, rot: flatRot(10) });
    b.lathe([[1.55, 0.4], [1.55, 0.44], [1.4, Y.plinth - 0.04], [1.32, Y.plinth]], 10, { ...o, rot: 0 });
    rig.mesh(b, mStone, null, { name: 'plinth' });
  }
  const runeSpin = rig.pivot('runeSpin', 0, 0, 0);
  {
    const g = litBuilder(S, 52);
    g.disc(1.3, 12, { y: Y.plinth + 0.02, uvDisc: true, color: [0.5, 0.5, 0.5] });
    rig.mesh(g, mRune, runeSpin, { name: 'runeGlow' });
  }

  // ---- the post: a slim column of slate with a brass collar, and the spindle through the lens -------------------------------------------
  {
    const b = litBuilder(S, 53);
    b.lathe([[0.5, Y.plinth], [0.36, Y.plinth + 0.5], [0.3, Y.post - 0.3], [0.38, Y.post]], 8, { tile: 2.4, smooth: true, color: [1.0, 1.0, 1.0] });
    rig.mesh(b, mPost, null, { name: 'post' });
    const c = litBuilder(S, 54);
    c.lathe([[0.4, Y.post - 0.04], [0.46, Y.post + 0.08], [0.4, Y.post + 0.22], [0.14, Y.post + 0.26]], 8, { tile: 2, smooth: true, color: [1.1, 1.0, 0.8] });
    c.at(0, Y.post + 0.2, 0, (q) => q.cyl(0.07, 0.07, 2 * R + 1.5, 6, { tile: 2, color: [1.15, 1.05, 0.82] }));      // the spindle
    c.at(0, Y.post + 2 * R + 1.65, 0, (q) => q.sphere(0.17, 6, 5, { tile: 2, color: [1.3, 1.18, 0.86] }));
    rig.mesh(c, mBrass, null, { name: 'spindle' });
  }

  // ---- the lens and its ring: a flat lens (built lying down), stood on its edge, turning about the spindle ------------------------------------
  const turn = rig.pivot('turn', 0, Y.centre * S, 0);
  const stand = rig.pivot('stand', 0, 0, 0, turn);
  stand.rotation.x = Math.PI / 2;
  {
    const t = 0.34, b = litBuilder(S, 55);
    b.lathe([[0, -t], [R * 0.5, -t * 0.86], [R * 0.82, -t * 0.5], [R, 0], [R * 0.82, t * 0.5], [R * 0.5, t * 0.86], [0, t]], 14, { tile: 2.2, smooth: true, color: [1.0, 1.0, 1.0], uWrap: 2 });
    rig.mesh(b, mGlass, stand, { name: 'lens' });
    // the ring of brass: a band round the rim with three lugs, and the hub where the spindle goes through
    const r = litBuilder(S, 56);
    r.lathe([[R - 0.06, -0.2], [R + 0.16, -0.2], [R + 0.2, 0], [R + 0.16, 0.2], [R - 0.06, 0.2]], 14, { tile: 2, smooth: true, color: [1.1, 1.0, 0.8] });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; r.at(Math.sin(a) * (R + 0.3), 0, Math.cos(a) * (R + 0.3), (q) => q.sphere(0.13, 5, 4, { tile: 2, color: [1.25, 1.12, 0.84] })); }
    r.lathe([[0.0, -0.4], [0.2, -0.4], [0.2, 0.4], [0.0, 0.4]], 8, { tile: 2, smooth: true, color: [1.15, 1.05, 0.82] });
    rig.mesh(r, mBrass, stand, { name: 'ring' });
    // the heart of light: two crossed cards in the lens (they turn with it)
    const h = litBuilder(S, 57), hh = R * 0.62;
    for (let i = 0; i < 2; i++) {
      const a = (i / 2) * Math.PI, dx = Math.cos(a) * hh, dz = Math.sin(a) * hh;
      h.quad([-dx, -hh * 0.2, -dz], [dx, -hh * 0.2, dz], [dx, hh * 0.2, dz], [-dx, hh * 0.2, -dz], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] });
    }
    rig.mesh(h, mHeart, turn, { name: 'heart', order: 9 });
  }
  const hoop = rig.pivot('hoop', 0, 1.7 * S, 0);
  {
    const b = litBuilder(S, 58);
    const n = 12, r0 = 1.2, r1 = 2.0;
    const P = (r, a) => [r * Math.sin(a), 0, r * Math.cos(a)];
    const UV = (r, a) => [0.5 + 0.5 * (r / r1) * Math.sin(a), 0.5 + 0.5 * (r / r1) * Math.cos(a)];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, A = P(r0, a0), B = P(r0, a1), C = P(r1, a1), D = P(r1, a0), o = { color: [0.5, 0.5, 0.5] };
      b.tri(A, C, B, UV(r0, a0), UV(r1, a1), UV(r0, a1), o, [0, 1, 0]);
      b.tri(A, D, C, UV(r0, a0), UV(r1, a0), UV(r1, a1), o, [0, 1, 0]);
    }
    rig.mesh(b, mHoop, hoop, { name: 'hoop', order: 9 });
  }
  {
    const b = litBuilder(S, 59);
    const h = 2.6, cy = Y.centre;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI, dx = Math.cos(a) * h, dz = Math.sin(a) * h;
      b.quad([-dx, cy - h, -dz], [dx, cy - h, dz], [dx, cy + h, dz], [-dx, cy + h, -dz], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] });
    }
    rig.mesh(b, mAura, null, { name: 'aura', order: 9 });
  }

  // ---- anchors ---------------------------------------------------------------------------------------------------
  rig.anchor(anchors, 'flame', 0, Y.centre * S, 0);
  rig.anchor(anchors, 'base', 0, Y.plinth * S, 0);
  rig.anchor(anchors, 'top', 0, (Y.centre + R + 0.6) * S, 0);

  // ---- state ----------------------------------------------------------------------------------------------------
  const st = { target: opts.lit ? clamp(opts.lit) : 0, k: 0, init: false, t: 0, kick: 0, phase: (opts.seed ?? 0) * 1.7, spin: 0 };

  const apply = (dt) => {
    const k = st.k, t = st.t, day = U.uDay.value;
    const dim = 1 - 0.3 * day;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + st.phase);
    // the glass: dull grey-green while it is dark, clearing to a bright aquamarine as it shines
    const ex = lerp(1.18, 1.0, clamp(day / 0.8));               // (the teal dusk is dark: a lift for the lit parts, relaxing as the dawn comes in)
    setMul(mGlass, [ex * lerp(0.52, 0.8, k), ex * lerp(0.66, 1.55, k), ex * lerp(0.64, 1.4, k)]);
    setMul(mBrass, [ex * lerp(0.7, 1.15, k), ex * lerp(0.7, 1.1, k), ex * lerp(0.7, 0.8, k)]);
    setMul(mStone, [ex, ex, ex]);
    setMul(mPost, [ex, ex, ex * 1.03]);
    // the lens turns on its spindle: slowly while dark, fast when it shines (and a kick when it is lit), and bobs a little
    st.spin += dt * (0.35 + 1.7 * k + 2.2 * st.kick);
    turn.rotation.y = st.spin;
    turn.position.y = (Y.centre + 0.08 * Math.sin(t * 1.6 + st.phase) * (0.3 + 0.7 * k)) * S;
    // the glows
    setAlpha(mHeart, k * (0.55 + 0.25 * pulse) * dim);
    mHeart.uniforms.uColorMul.value.setRGB(0.5, 1.0, 0.86);
    mHeart.visible = k > 0.001;
    setAlpha(mRune, k * (0.7 + 0.25 * pulse) * dim);
    mRune.uniforms.uColorMul.value.setRGB(0.5, 1.0, 0.86);
    mRune.visible = k > 0.001;
    runeSpin.rotation.y = -t * 0.25 * k;
    setAlpha(mHoop, k * (0.4 + 0.2 * pulse) * dim);
    mHoop.uniforms.uColorMul.value.setRGB(0.55, 1.0, 0.9);
    hoop.rotation.y = t * 0.4;
    hoop.position.y = (1.4 + 0.6 * pulse) * S;
    mHoop.visible = k > 0.001;
    setAlpha(mAura, k * (0.3 + 0.08 * pulse) * dim);
    mAura.uniforms.uColorMul.value.setRGB(0.6, 1.0, 0.9);
    mAura.visible = k > 0.001;
  };

  const model = {
    root: rig.root,
    anchors,
    radius: 1.9 * S,
    height: (Y.centre + R + 0.6) * S,
    tris: rig.tris,
    big,
    get lit() { return st.target; },
    setLit(k) { const was = st.target; st.target = clamp(k); if (was < 0.5 && st.target >= 0.5) st.kick = 1; },
    update(dt, pose) {
      pose = pose || {};
      if (pose.t !== undefined) st.t = pose.t; else st.t += dt;
      if (pose.lit !== undefined) st.target = clamp(pose.lit);
      if (!st.init) { st.k = st.target; st.init = true; } else st.k = damp(st.k, st.target, 4.5, dt);
      if (Math.abs(st.k - st.target) < 0.002) st.k = st.target;
      st.kick = Math.max(0, st.kick - dt * 0.3);
      apply(dt);
    },
    testPoses: { dark: { lit: 0 }, half: { lit: 0.5 }, shining: { lit: 1 } },
    flash: (k) => rig.flash(k),
    dispose: () => rig.dispose(),
  };
  apply(0);
  return model;
}
void smooth;
