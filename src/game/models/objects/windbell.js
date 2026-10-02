// WINDBELL - the goal object of Skyweaver Spires: a bell of bronze hung in a frame of two marble pillars and a lintel, on a plinth of cloudstone with a ring of runes inlaid. Silent and dull blue-grey while
// the winds are slack; breathe fire on it and it RINGS: the bronze warms to gold, the bell swings (a hard swing at first that settles into a gentle sway), a heart of light glows inside it, a ring of
// runes turns above the plinth and light rings spread from it. (The Beacon Lantern of Gloaming Vale, the Frostbloom and the Emberstone are the pattern: the same Rig, the same setLit(k) contract, the
// same anchors; BeaconSystem lights any of them.) `opts.big` builds the x2.2 Loom Bell.
//
// Lighting model: the plinth, the pillars and the lintel are lit parts (with a twilight exposure lift); the bell is a lit bronze whose colour multiplier is driven from setLit(k); everything that
// glows is an additive layer whose alpha is driven from setLit(k).
import { U } from '../../../engine/materials.js';
import { Rig, setMul, setAlpha } from './common.js';
import { TAU, flatRot, litBuilder, lerp, damp, clamp, smooth } from './geo.js';

const Y = { plinth: 0.7, lintel: 4.0, pivot: 3.8 };

export function createWindbell(assets, opts = {}) {
  const big = !!opts.big;
  const S = big ? 2.2 : 1;
  const rig = new Rig(assets);
  const anchors = {};

  // ---- materials ---------------------------------------------------------------------------------------------------
  const mStone = rig.lit('cobble_sky');
  const mMarble = rig.lit('cliff_marble', { double: true });
  const mBell = rig.lit('metal_brass', { double: true });
  const mClapper = rig.lit('metal_brass');
  const mRune = rig.glow('rune_ring', { decal: true });                   // the rune ring on the plinth lights up
  const mHoop = rig.glow('rune_ring', { double: true });                  // turning ring of runes above it
  const mHeart = rig.glow('sun_glow', { double: true });                  // the heart of light inside the bell
  const mAura = rig.glow('sun_glow', { double: true });                   // soft halo cards

  // ---- the plinth: two steps of cloudstone, the rune ring inlaid -------------------------------------------------------------
  {
    const b = litBuilder(S, 41);
    const o = { smooth: false, tile: 3, color: [1.0, 0.98, 0.98] };
    b.lathe([[1.9, 0], [1.9, 0.06], [1.82, 0.36], [1.6, 0.4]], 10, { ...o, rot: flatRot(10) });
    b.lathe([[1.55, 0.4], [1.55, 0.44], [1.4, Y.plinth - 0.04], [1.32, Y.plinth]], 10, { ...o, rot: 0 });
    rig.mesh(b, mStone, null, { name: 'plinth' });
  }
  const runeSpin = rig.pivot('runeSpin', 0, 0, 0);
  {
    const g = litBuilder(S, 42);
    g.disc(1.3, 12, { y: Y.plinth + 0.02, uvDisc: true, color: [0.5, 0.5, 0.5] });
    rig.mesh(g, mRune, runeSpin, { name: 'runeGlow' });
  }

  // ---- the frame: two pillars with capitals, a lintel with finials -------------------------------------------------------------
  {
    const b = litBuilder(S, 43);
    const o = { tile: 3, color: [1.02, 1.0, 1.0] };
    for (const sd of [-1, 1]) {
      b.box(sd * 1.15, (Y.plinth + Y.lintel) / 2, 0, 0.44, Y.lintel - Y.plinth, 0.44, o);
      b.box(sd * 1.15, Y.plinth + 0.18, 0, 0.62, 0.36, 0.62, o);                         // the foot
      b.box(sd * 1.15, Y.lintel - 0.16, 0, 0.62, 0.32, 0.62, o);                         // the capital
      b.at(sd * 1.15, Y.lintel + 0.28, 0, (q) => q.cone(0.34, 0.9, 4, { tile: 2, color: [1.1, 1.06, 1.0] }));       // the finial
    }
    b.box(0, Y.lintel + 0.14, 0, 3.1, 0.34, 0.5, o);                                       // the lintel
    b.box(0, Y.lintel - 0.12, 0, 2.0, 0.2, 0.34, { ...o, color: [0.92, 0.9, 0.95] });      // the beam the bell hangs from
    rig.mesh(b, mMarble, null, { name: 'frame' });
  }

  // ---- the bell, on a pivot at the beam: it swings about the lintel's axis (the X axis: the pillars stand either side of it) ---------------------------------
  const swing = rig.pivot('swing', 0, Y.pivot * S, 0);
  {
    const b = litBuilder(S, 44);
    const prof = [[0, -0.3], [0.26, -0.34], [0.46, -0.72], [0.58, -1.18], [0.7, -1.7], [0.86, -2.04], [0.9, -2.14]];
    b.lathe(prof.map(([r, y]) => [r, y + 0.0]), 10, { tile: 2.4, smooth: true, color: [1.0, 0.98, 0.96], rot: 0.15 });
    b.lathe([[0.9, -2.14], [0.8, -2.08], [0.62, -1.7]], 10, { tile: 2.4, smooth: true, color: [0.5, 0.46, 0.44], rot: 0.15 });        // the lip, inside
    b.at(0, -0.2, 0, (q) => q.cyl(0.07, 0.07, 0.34, 4, { tile: 2, color: [0.9, 0.86, 0.8] }));                                    // the yoke
    rig.mesh(b, mBell, swing, { name: 'bell' });
    const c = litBuilder(S, 45);
    c.at(0, -1.55, 0, (q) => q.cyl(0.04, 0.04, 0.5, 4, { tile: 2, color: [0.9, 0.86, 0.8] }));
    c.at(0, -1.98, 0, (q) => q.sphere(0.2, 6, 5, { tile: 2, color: [1.05, 0.98, 0.9] }));
    rig.mesh(c, mClapper, swing, { name: 'clapper' });
    // the heart of light: two crossed cards inside the bell
    const h = litBuilder(S, 46), hh = 0.7, cy = -1.55;
    for (let i = 0; i < 2; i++) {
      const a = (i / 2) * Math.PI, dx = Math.cos(a) * hh, dz = Math.sin(a) * hh;
      h.quad([-dx, cy - hh, -dz], [dx, cy - hh, dz], [dx, cy + hh, dz], [-dx, cy + hh, -dz], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] });
    }
    rig.mesh(h, mHeart, swing, { name: 'heart', order: 9 });
  }
  const hoop = rig.pivot('hoop', 0, 1.7 * S, 0);
  {
    const b = litBuilder(S, 47);
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
    const b = litBuilder(S, 48);
    const h = 2.4, cy = 2.4;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI, dx = Math.cos(a) * h, dz = Math.sin(a) * h;
      b.quad([-dx, cy - h, -dz], [dx, cy - h, dz], [dx, cy + h, dz], [-dx, cy + h, -dz], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] });
    }
    rig.mesh(b, mAura, null, { name: 'aura', order: 9 });
  }

  // ---- anchors ---------------------------------------------------------------------------------------------------
  rig.anchor(anchors, 'flame', 0, 2.3 * S, 0);
  rig.anchor(anchors, 'base', 0, Y.plinth * S, 0);
  rig.anchor(anchors, 'top', 0, (Y.lintel + 1.2) * S, 0);

  // ---- state ----------------------------------------------------------------------------------------------------
  const st = { target: opts.lit ? clamp(opts.lit) : 0, k: 0, init: false, t: 0, kick: 0, phase: (opts.seed ?? 0) * 1.7 };

  const apply = () => {
    const k = st.k, t = st.t, day = U.uDay.value;
    const dim = 1 - 0.3 * day;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + st.phase);
    // the bronze: dull blue-grey while it is silent, warming to gold as it rings
    const ex = lerp(1.12, 1.0, clamp(day / 0.8));               // (the rose dusk of this realm is bright: only a little of the twilight lift the Vale's moonlit night needs)
    setMul(mBell, [ex * lerp(0.46, 1.25, k), ex * lerp(0.74, 1.08, k), ex * lerp(1.25, 0.7, k)]);
    setMul(mClapper, [ex * lerp(0.5, 1.2, k), ex * lerp(0.76, 1.05, k), ex * lerp(1.2, 0.7, k)]);
    setMul(mStone, [ex, ex, ex]);
    setMul(mMarble, [ex, ex, ex * 1.03]);
    // the swing: a hard swing when it is struck that settles into a gentle sway (the bell hangs from the lintel: it swings about X)
    const amp = 0.1 * k + 0.5 * st.kick;
    swing.rotation.x = amp * Math.sin(t * 3.1 + st.phase) * (0.4 + 0.6 * smooth(0, 0.6, k));
    swing.rotation.z = 0.35 * amp * Math.sin(t * 2.3 + 1.1);
    // the glows
    setAlpha(mHeart, k * (0.55 + 0.25 * pulse) * dim);
    mHeart.uniforms.uColorMul.value.setRGB(1.0, 0.82, 0.42);
    mHeart.visible = k > 0.001;
    setAlpha(mRune, k * (0.7 + 0.25 * pulse) * dim);
    mRune.uniforms.uColorMul.value.setRGB(1.0, 0.82, 0.4);
    mRune.visible = k > 0.001;
    runeSpin.rotation.y = -t * 0.25 * k;
    setAlpha(mHoop, k * (0.4 + 0.2 * pulse) * dim);
    mHoop.uniforms.uColorMul.value.setRGB(1.0, 0.84, 0.46);
    hoop.rotation.y = t * 0.4;
    hoop.position.y = (1.4 + 0.6 * pulse) * S;
    mHoop.visible = k > 0.001;
    setAlpha(mAura, k * (0.3 + 0.08 * pulse) * dim);
    mAura.uniforms.uColorMul.value.setRGB(1.0, 0.86, 0.55);
    mAura.visible = k > 0.001;
  };

  const model = {
    root: rig.root,
    anchors,
    radius: 1.9 * S,
    height: (Y.lintel + 1.2) * S,
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
      st.kick = Math.max(0, st.kick - dt * 0.28);
      apply();
    },
    testPoses: { silent: { lit: 0 }, half: { lit: 0.5 }, ringing: { lit: 1 } },
    flash: (k) => rig.flash(k),
    dispose: () => rig.dispose(),
  };
  apply();
  return model;
}
