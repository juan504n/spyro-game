// EMBERSTONE - the goal object of Emberfall Crags: a core of cold coal caged in six shards of black basalt, on a hearthstone of scorched cobbles. Breathe fire on it and it kindles: the shards open
// like a hand, the coal blazes from dull red through yellow to white-hot, a ring of runes turns on the hearth and the realm's own flame stands over it (BeaconSystem draws the torch flame at the
// `flame` anchor of a goal that does not say `flame: false`). (The Beacon Lantern of Gloaming Vale, models/objects/beacon.js, and the Frostbloom, models/objects/frostbloom.js, are the pattern: the
// same Rig, the same setLit(k) contract, the same anchors; BeaconSystem lights any of them.) `opts.big` builds the x2.2 Heartforge, with a second ring of shards.
//
// Lighting model: the hearth, the cinder cap and the shards are lit parts (with a twilight exposure lift); the coal is self-lit crystal; everything that glows is an additive layer whose alpha is
// driven from setLit(k).
import { vgrad } from '../../../engine/builder.js';
import { U } from '../../../engine/materials.js';
import { Rig, setMul, setAlpha } from './common.js';
import { TAU, flatRot, litBuilder, latheUV, strut, lerp, damp, clamp, smooth } from './geo.js';

// vertical layout (unscaled metres)
const Y = { plinth: 0.7, top: 2.5 };
const FLAME_Y = Y.top + 0.4;

export function createEmberstone(assets, opts = {}) {
  const big = !!opts.big;
  const S = big ? 2.2 : 1;
  const rig = new Rig(assets);
  const anchors = {};

  // ---- materials ---------------------------------------------------------------------------------------------------
  const mHearth = rig.lit('cobble_ember');
  const mCap = rig.lit('cinder');
  const mShard = rig.lit('cliff_basalt', { double: true });
  const mCoal = rig.full('crystal_ember', { double: true });              // self-lit: dim red while it is cold, white-hot when it burns
  const mHeart = rig.glow('sun_glow', { decal: true });                   // the heart of light in the cage
  const mHoop = rig.glow('rune_ring', { double: true });                  // turning ring of runes round the stone
  const mRuneGlow = rig.glow('rune_ring', { decal: true });               // the rune ring on the hearth lights up
  const mAura = rig.glow('sun_glow', { double: true });                   // soft halo cards
  const mSpill = rig.glow(null, { decal: true });                         // light spilling down the coal

  // ---- the hearth: three steps of scorched cobble under a cap of cinder, the rune ring inlaid ------------------------------
  {
    const b = litBuilder(S, 11);
    const shade = vgrad(0, [0.62, 0.58, 0.58], Y.plinth, [1.0, 0.96, 0.94]);
    const o = { smooth: false, tile: 3, color: shade };
    b.lathe([[1.5, 0], [1.5, 0.05], [1.42, 0.3], [1.28, 0.34]], 9, { ...o, rot: flatRot(9) });
    b.lathe([[1.26, 0.34], [1.26, 0.38], [1.16, Y.plinth - 0.06], [1.1, Y.plinth]], 9, { ...o, rot: 0 });
    rig.mesh(b, mHearth, null, { name: 'hearth' });
    const c = litBuilder(S, 12);
    c.lathe([[1.14, Y.plinth - 0.03], [0.95, Y.plinth + 0.1], [0.5, Y.plinth + 0.17], [0, Y.plinth + 0.2]], 10, { smooth: true, tile: 3, color: [1.0, 0.96, 0.94] });
    rig.mesh(c, mCap, null, { name: 'cinder' });
  }
  const runeSpin = rig.pivot('runeSpin', 0, 0, 0);
  {
    const g = litBuilder(S, 13);
    g.disc(1.0, 12, { y: Y.plinth + 0.2, uvDisc: true, color: [0.5, 0.5, 0.5] });
    rig.mesh(g, mRuneGlow, runeSpin, { name: 'runeGlow' });
  }

  // ---- the cage: shards of basalt leaning round the coal; they open as it kindles (their ring is scaled from a fist to an open hand) ----------
  const outer = rig.pivot('outer', 0, (Y.plinth + 0.1) * S, 0), inner = rig.pivot('inner', 0, (Y.plinth + 0.2) * S, 0);
  const shardRing = (b, n, rot, r0, r1, h, w) => {
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU, ca = Math.sin(a), sa = Math.cos(a);
      strut(b, [ca * r0, -0.1, sa * r0], [ca * r1, h, sa * r1], w, 0.04, { tile: 3, caps: 'top', color: [0.78 + 0.06 * (i % 3), 0.74, 0.72] });
    }
  };
  {
    const b = litBuilder(S, 20);
    shardRing(b, 6, 0.3, 0.55, 0.78, 2.05, 0.46);
    rig.mesh(b, mShard, outer, { name: 'shards' });
    const c = litBuilder(S, 21);
    shardRing(c, 5, 0.3 + Math.PI / 5, 0.38, 0.5, 1.45, 0.34);
    rig.mesh(c, mShard, inner, { name: 'shardsInner' });
    if (big) {
      const d = litBuilder(S, 22);
      shardRing(d, 8, 0.3 + Math.PI / 8, 0.95, 1.5, 2.3, 0.52);
      rig.mesh(d, mShard, outer, { name: 'shardsGreat' });
    }
  }
  // the coal: a six-sided crystal pillar in the middle of the cage, and four small ones on the hearth's lowest step
  {
    const b = litBuilder(S, 16);
    latheUV(b, [[0, Y.plinth + 0.1, 0.02], [0.3, Y.plinth + 0.45, 0.25], [0.3, Y.top - 0.35, 0.72], [0, Y.top + 0.12, 0.98]], 6, { uWrap: 1, color: [0.5, 0.5, 0.5], smooth: false, rot: Math.PI / 6 });
    rig.mesh(b, mCoal, null, { name: 'coal' });
    const c = litBuilder(S, 17);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      c.push();
      c.translate(1.34 * Math.sin(a), 0.3, 1.34 * Math.cos(a));
      c.rotateY(a);
      c.rotateX(0.22);
      latheUV(c, [[0, 0, 0.02], [0.14, 0.14, 0.25], [0.14, 0.44, 0.72], [0, 0.74, 0.98]], 4, { uWrap: 1, color: [0.5, 0.5, 0.5], smooth: false, rot: Math.PI / 4 });
      c.pop();
    }
    rig.mesh(c, mCoal, null, { name: 'crystals' });
  }

  // ---- the heart of light, the rune hoop, the aura, the spill ------------------------------------------------------------------------
  {
    const b = litBuilder(S, 24);
    const h = 0.8, cy = FLAME_Y - 0.9;
    for (let i = 0; i < 2; i++) {
      const a = (i / 2) * Math.PI, dx = Math.cos(a) * h, dz = Math.sin(a) * h;
      b.quad([-dx, cy - h, -dz], [dx, cy - h, dz], [dx, cy + h, dz], [-dx, cy + h, -dz], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] });
    }
    rig.mesh(b, mHeart, null, { name: 'heart', order: 9 });
  }
  const hoop = rig.pivot('hoop', 0, (FLAME_Y - 1.4) * S, 0);
  {
    const b = litBuilder(S, 30);
    const n = 12, r0 = 1.25, r1 = 1.85;
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
    const b = litBuilder(S, 31);
    const h = 2.2, cy = FLAME_Y - 0.4;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI, dx = Math.cos(a) * h, dz = Math.sin(a) * h;
      b.quad([-dx, cy - h, -dz], [dx, cy - h, dz], [dx, cy + h, dz], [-dx, cy + h, -dz], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] });
    }
    rig.mesh(b, mAura, null, { name: 'aura', order: 9 });
  }
  {
    const b = litBuilder(S, 32);
    const n = 8, y0 = Y.plinth + 0.2, y1 = Y.top - 0.3, tint = [0.5, 0.3, 0.12];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, P = (r, y, a) => [r * Math.sin(a), y, r * Math.cos(a)];
      b.quad(P(0.4, y0, a0), P(0.4, y0, a1), P(0.28, y1, a1), P(0.28, y1, a0), { uv: [0, 0, 1, 1], tints: [tint, tint, tint, tint], alphas: [0, 0, 0.55, 0.55] });
    }
    rig.mesh(b, mSpill, null, { name: 'spill' });
  }

  // ---- anchors ---------------------------------------------------------------------------------------------------
  rig.anchor(anchors, 'flame', 0, FLAME_Y * S, 0);
  rig.anchor(anchors, 'base', 0, Y.plinth * S, 0);
  rig.anchor(anchors, 'top', 0, (Y.top + 1.2) * S, 0);

  // ---- state ----------------------------------------------------------------------------------------------------
  const st = { target: opts.lit ? clamp(opts.lit) : 0, k: 0, init: false, t: 0, phase: (opts.seed ?? 0) * 1.7 };

  const apply = () => {
    const k = st.k, t = st.t, day = U.uDay.value;
    const dim = 1 - 0.35 * day;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + st.phase);
    const flick = 0.5 + 0.5 * Math.sin(t * 5.3 + st.phase) * Math.sin(t * 2.1);

    // the cage opens: the outer shards first, the inner ring a little after (radial scale: a fist is narrow and tall, an open hand wide and low)
    const o = smooth(0.0, 0.8, k), i2 = smooth(0.25, 1.0, k);
    outer.scale.set(lerp(0.62, 1.12, o), lerp(1.12, 0.9, o), lerp(0.62, 1.12, o));
    inner.scale.set(lerp(0.6, 1.1, i2), lerp(1.1, 0.9, i2), lerp(0.6, 1.1, i2));
    // the coal: a dull red pulse while cold, flaring through yellow to white-hot as it kindles
    const cb = lerp(0.42 + 0.14 * pulse, 1.0 + 0.1 * flick, k);
    setMul(mCoal, [cb * lerp(1.0, 1.25, k), cb * lerp(0.55, 1.05, k), cb * lerp(0.4, 0.78, k)]);
    // the basalt and the hearth: twilight exposure lift, an ember warmth when it burns
    const ex = lerp(1.7, 1.0, clamp(day / 0.8)), warm = 1 - 0.45 * clamp(day / 0.9);
    setMul(mShard, [ex * (1 + 0.3 * k * warm), ex * (1 + 0.1 * k * warm), ex * (1 - 0.05 * k * warm)]);
    setMul(mHearth, [ex * (1 + 0.25 * k * warm), ex * (1 + 0.08 * k * warm), ex * (1 - 0.06 * k * warm)]);
    setMul(mCap, [ex * (1 + 0.3 * k * warm), ex * (1 + 0.1 * k * warm), ex]);
    // the heart of light: a faint red pulse while it is cold, a blazing orange-gold core when it burns
    setAlpha(mHeart, lerp((0.08 + 0.16 * pulse) * (1 - k), (0.8 + 0.15 * flick) * dim, k));
    mHeart.uniforms.uColorMul.value.setRGB(lerp(0.9, 1.0, k), lerp(0.28, 0.66, k), lerp(0.18, 0.28, k));
    // the glows
    setAlpha(mRuneGlow, k * (0.75 + 0.25 * pulse) * dim);
    mRuneGlow.uniforms.uColorMul.value.setRGB(1.0, 0.55, 0.2);
    mRuneGlow.visible = k > 0.001;
    runeSpin.rotation.y = -t * 0.3 * k;
    setAlpha(mHoop, k * (0.5 + 0.2 * pulse) * dim);
    mHoop.uniforms.uColorMul.value.setRGB(1.0, 0.5, 0.16);
    hoop.rotation.y = t * 0.45;
    mHoop.visible = k > 0.001;
    setAlpha(mAura, k * (0.42 + 0.08 * flick) * dim);
    mAura.uniforms.uColorMul.value.setRGB(1.0, 0.42, 0.12);
    mAura.visible = k > 0.001;
    setAlpha(mSpill, k * dim);
    mSpill.visible = k > 0.001;
  };

  const model = {
    root: rig.root,
    anchors,
    radius: 1.5 * S,
    height: (Y.top + 1.3) * S,
    tris: rig.tris,
    big,
    get lit() { return st.target; },
    setLit(k) { st.target = clamp(k); },
    update(dt, pose) {
      pose = pose || {};
      if (pose.t !== undefined) st.t = pose.t; else st.t += dt;
      if (pose.lit !== undefined) st.target = clamp(pose.lit);
      if (!st.init) { st.k = st.target; st.init = true; } else st.k = damp(st.k, st.target, 4.5, dt);
      if (Math.abs(st.k - st.target) < 0.002) st.k = st.target;
      apply();
    },
    testPoses: { dark: { lit: 0 }, half: { lit: 0.5 }, lit: { lit: 1 } },
    flash: (k) => rig.flash(k),
    dispose: () => rig.dispose(),
  };
  apply();
  return model;
}
