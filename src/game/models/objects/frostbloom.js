// FROSTBLOOM - the goal object of Frostbloom Hollow: a flower of ice on a snowy plinth, asleep in a bud. Breathe fire on it and it thaws: the bud opens petal by petal, the ice-blue crystal turns
// blossom pink, a heart of light kindles in its middle and a ring of runes turns round it. (The Beacon Lantern of Gloaming Vale, models/objects/beacon.js, is the pattern: the same Rig, the same
// setLit(k) contract, the same anchors; BeaconSystem lights either.) `opts.big` builds the x2.2 Heartbloom, with a second ring of petals.
//
// Lighting model: the plinth, stem and leaves are lit parts (with a twilight exposure lift); the petals are self-lit crystal (their texture swaps from cyan to pink half way through the thaw, flaring
// white as it does); everything that glows is an additive layer whose alpha is driven from setLit(k).
import { vgrad } from '../../../engine/builder.js';
import { U } from '../../../engine/materials.js';
import { Rig, setMul, setAlpha } from './common.js';
import { TAU, flatRot, litBuilder, latheUV, lerp, damp, clamp, smooth } from './geo.js';
import { derivedTexture, recolor } from './recolor.js';

// vertical layout (unscaled metres)
const Y = { plinth: 0.7, bloom: 2.9 };
const FLAME_Y = Y.bloom + 0.2;

/** the stations of a petal, [outward, up, half width] from the bloom's centre: it leans out and ends in a point */
const PETAL = [[0.1, -0.1, 0.12], [0.7, 0.62, 0.44], [1.32, 1.0, 0.0]];

export function createFrostbloom(assets, opts = {}) {
  const big = !!opts.big;
  const S = big ? 2.2 : 1;
  const rig = new Rig(assets);
  const anchors = {};

  // ---- materials ---------------------------------------------------------------------------------------------------
  const mIce = rig.lit('ice');
  const mSnow = rig.lit('snow');
  const mLeaf = rig.lit('leaves_frost', { double: true });
  const mPetal = rig.full('crystal_cyan', { double: true });             // self-lit; texture swaps to pink when thawed
  const texCyan = assets.tex('crystal_cyan');
  const texPink = derivedTexture(assets, 'crystal_cyan', 'pink', (p) => recolor(p, (h, s) => s > 0.08, { hue: 335, sat: 1.1, val: 1.15 }));
  const mHeart = rig.glow('sun_glow', { decal: true });                  // the heart of light in the bloom
  const mHoop = rig.glow('rune_ring', { double: true });                 // turning ring of runes round the bloom
  const mRuneGlow = rig.glow('rune_ring', { decal: true });              // the rune ring on the plinth lights up
  const mAura = rig.glow('sun_glow', { double: true });                  // soft halo cards
  const mSpill = rig.glow(null, { decal: true });                        // light spilling down the stem

  // ---- plinth: three steps of ice under a cap of snow, with the rune ring inlaid --------------------------------------
  {
    const b = litBuilder(S, 11);
    const shade = vgrad(0, [0.62, 0.7, 0.86], Y.plinth, [1.0, 1.0, 1.04]);
    const o = { smooth: false, tile: 3, color: shade };
    b.lathe([[1.5, 0], [1.5, 0.05], [1.42, 0.3], [1.28, 0.34]], 9, { ...o, rot: flatRot(9) });
    b.lathe([[1.26, 0.34], [1.26, 0.38], [1.16, Y.plinth - 0.06], [1.1, Y.plinth]], 9, { ...o, rot: 0 });
    rig.mesh(b, mIce, null, { name: 'plinth' });
    const c = litBuilder(S, 12);
    c.lathe([[1.14, Y.plinth - 0.03], [0.95, Y.plinth + 0.1], [0.5, Y.plinth + 0.17], [0, Y.plinth + 0.2]], 10, { smooth: true, tile: 3, color: [1.04, 1.06, 1.12] });
    rig.mesh(c, mSnow, null, { name: 'snowcap' });
  }
  const runeSpin = rig.pivot('runeSpin', 0, 0, 0);
  {
    const g = litBuilder(S, 13);
    g.disc(1.0, 12, { y: Y.plinth + 0.2, uvDisc: true, color: [0.5, 0.5, 0.5] });
    rig.mesh(g, mRuneGlow, runeSpin, { name: 'runeGlow' });
  }

  // ---- stem: an icy stalk, thick at the foot, with two frosted leaves ------------------------------------------------------
  {
    const b = litBuilder(S, 14);
    latheUV(b, [[0.34, Y.plinth + 0.1, 0.0], [0.26, 1.2, 0.3], [0.2, 2.0, 0.6], [0.24, Y.bloom - 0.3, 0.88], [0.14, Y.bloom - 0.1, 1.0]], 7, { smooth: true, tile: 3, color: [0.92, 1.0, 1.08] });
    rig.mesh(b, mIce, null, { name: 'stem' });
    const l = litBuilder(S, 15);
    const leaf = (a, y0, len, w) => {
      const dir = [Math.sin(a), Math.cos(a)], side = [Math.cos(a), -Math.sin(a)];
      const st = [[0.16, y0, 0.05], [0.16 + len * 0.45, y0 + 0.32, w], [0.16 + len, y0 + 0.2, 0]];
      const P = (k, s) => [dir[0] * st[k][0] + side[0] * st[k][2] * s, st[k][1], dir[1] * st[k][0] + side[1] * st[k][2] * s];
      l.quad(P(0, -1), P(0, 1), P(1, 1), P(1, -1), { uv: [0, 0, 1, 0.5], color: [0.95, 1.0, 1.1] });
      l.tri(P(1, -1), P(1, 1), P(2, 0), [0, 0.5], [1, 0.5], [0.5, 1], { color: [1.1, 1.14, 1.2] });
    };
    leaf(0.6, 1.0, 1.3, 0.42); leaf(0.6 + Math.PI * 1.1, 1.6, 1.1, 0.36);
    rig.mesh(l, mLeaf, null, { name: 'leaves' });
  }

  // ---- the bloom: two rings of petals that open as it thaws (their rings are scaled from a bud to an open flower) ------------------------
  const outer = rig.pivot('outer', 0, Y.bloom * S, 0), inner = rig.pivot('inner', 0, (Y.bloom + 0.12) * S, 0);
  const petalRing = (b, n, rot, k, base, tip) => {
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU, dir = [Math.sin(a), Math.cos(a)], side = [Math.cos(a), -Math.sin(a)];
      const P = (st, s) => [dir[0] * PETAL[st][0] * k + side[0] * PETAL[st][2] * k * s, PETAL[st][1] * k, dir[1] * PETAL[st][0] * k + side[1] * PETAL[st][2] * k * s];
      b.quad(P(0, -1), P(0, 1), P(1, 1), P(1, -1), { uv: [0.1, 0.92, 0.9, 0.5], tints: [base, base, tip, tip] });
      b.tri(P(1, -1), P(1, 1), P(2, 0), [0.1, 0.5], [0.9, 0.5], [0.5, 0.06], { tints: [tip, tip, [0.62, 0.62, 0.62]] });
    }
  };
  {
    const b = litBuilder(S, 20);
    petalRing(b, 8, 0.2, 1.0, [0.34, 0.34, 0.34], [0.56, 0.56, 0.56]);
    rig.mesh(b, mPetal, outer, { name: 'petalsOuter' });
    const c = litBuilder(S, 21);
    petalRing(c, 6, 0.2 + Math.PI / 6, 0.62, [0.4, 0.4, 0.4], [0.62, 0.62, 0.62]);
    rig.mesh(c, mPetal, inner, { name: 'petalsInner' });
    if (big) {
      const d = litBuilder(S, 22);
      petalRing(d, 8, 0.2 + Math.PI / 8, 1.35, [0.3, 0.3, 0.3], [0.5, 0.5, 0.5]);
      rig.mesh(d, mPetal, outer, { name: 'petalsGreat' });
    }
  }
  // four charge crystals on the plinth's lowest step
  {
    const b = litBuilder(S, 17);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      b.push();
      b.translate(1.34 * Math.sin(a), 0.3, 1.34 * Math.cos(a));
      b.rotateY(a);
      b.rotateX(0.22);
      latheUV(b, [[0, 0, 0.02], [0.14, 0.14, 0.25], [0.14, 0.44, 0.72], [0, 0.74, 0.98]], 4, { uWrap: 1, color: [0.5, 0.5, 0.5], smooth: false, rot: Math.PI / 4 });
      b.pop();
    }
    rig.mesh(b, mPetal, null, { name: 'crystals' });
  }

  // ---- the heart of light, the rune hoop, the aura, the spill ------------------------------------------------------------------------
  {
    const b = litBuilder(S, 24);
    const h = 0.7, cy = FLAME_Y - 0.15;
    for (let i = 0; i < 2; i++) {
      const a = (i / 2) * Math.PI, dx = Math.cos(a) * h, dz = Math.sin(a) * h;
      b.quad([-dx, cy - h, -dz], [dx, cy - h, dz], [dx, cy + h, dz], [-dx, cy + h, -dz], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] });
    }
    rig.mesh(b, mHeart, null, { name: 'heart', order: 9 });
  }
  const hoop = rig.pivot('hoop', 0, (FLAME_Y - 0.5) * S, 0);
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
    const h = 2.1, cy = FLAME_Y;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI, dx = Math.cos(a) * h, dz = Math.sin(a) * h;
      b.quad([-dx, cy - h, -dz], [dx, cy - h, dz], [dx, cy + h, dz], [-dx, cy + h, -dz], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] });
    }
    rig.mesh(b, mAura, null, { name: 'aura', order: 9 });
  }
  {
    const b = litBuilder(S, 32);
    const n = 8, y0 = Y.plinth + 0.2, y1 = Y.bloom - 0.3, tint = [0.5, 0.3, 0.4];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, P = (r, y, a) => [r * Math.sin(a), y, r * Math.cos(a)];
      b.quad(P(0.32, y0, a0), P(0.32, y0, a1), P(0.2, y1, a1), P(0.2, y1, a0), { uv: [0, 0, 1, 1], tints: [tint, tint, tint, tint], alphas: [0, 0, 0.55, 0.55] });
    }
    rig.mesh(b, mSpill, null, { name: 'spill' });
  }

  // ---- anchors ---------------------------------------------------------------------------------------------------
  rig.anchor(anchors, 'flame', 0, FLAME_Y * S, 0);
  rig.anchor(anchors, 'base', 0, Y.plinth * S, 0);
  rig.anchor(anchors, 'top', 0, (Y.bloom + 1.2) * S, 0);

  // ---- state ----------------------------------------------------------------------------------------------------
  const st = { target: opts.lit ? clamp(opts.lit) : 0, k: 0, init: false, t: 0, phase: (opts.seed ?? 0) * 1.7, swapped: false };

  const apply = () => {
    const k = st.k, t = st.t, day = U.uDay.value;
    const dim = 1 - 0.35 * day;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + st.phase);
    const flick = 0.5 + 0.5 * Math.sin(t * 5.3 + st.phase) * Math.sin(t * 2.1);

    // the bud opens: the outer ring first, the inner ring a little after (radial scale: a bud is narrow and tall, an open flower wide and low)
    const o = smooth(0.0, 0.8, k), i2 = smooth(0.25, 1.0, k);
    outer.scale.set(lerp(0.42, 1.04, o), lerp(1.45, 0.82, o), lerp(0.42, 1.04, o));
    inner.scale.set(lerp(0.4, 1.0, i2), lerp(1.4, 0.84, i2), lerp(0.4, 1.0, i2));
    // the petals: ice blue and dim while dormant; they flare through white and come back pink
    const pink = k > 0.5;
    if (pink !== st.swapped) { mPetal.uniforms.map.value = pink ? texPink : texCyan; st.swapped = pink; }
    const cb = pink ? lerp(0.85, 1.2, (k - 0.5) * 2) : lerp(0.52 + 0.2 * pulse, 0.5, k * 2);
    setMul(mPetal, [cb, cb, cb]);
    // the stone and ice: twilight exposure lift, a rose warmth when thawed
    const ex = lerp(1.7, 1.0, clamp(day / 0.8)), warm = 1 - 0.45 * clamp(day / 0.9);
    setMul(mIce, [ex * (1 + 0.3 * k * warm), ex * (1 + 0.04 * k * warm), ex * (1 - 0.1 * k * warm)]);
    setMul(mSnow, [ex * (1 + 0.2 * k * warm), ex, ex * (1 - 0.04 * k * warm)]);
    setMul(mLeaf, [ex, ex * (1 + 0.1 * k), ex * (1 - 0.1 * k)]);
    // the heart of light: a faint cyan pulse while dormant, a blazing rose-gold core when thawed
    setAlpha(mHeart, lerp((0.1 + 0.2 * pulse) * (1 - k), (0.75 + 0.15 * flick) * dim, k));
    mHeart.uniforms.uColorMul.value.setRGB(lerp(0.4, 1.0, k), lerp(0.8, 0.62, k), lerp(1.0, 0.7, k));
    // the glows
    setAlpha(mRuneGlow, k * (0.75 + 0.25 * pulse) * dim);
    mRuneGlow.uniforms.uColorMul.value.setRGB(1.0, 0.7, 0.86);
    mRuneGlow.visible = k > 0.001;
    runeSpin.rotation.y = -t * 0.3 * k;
    setAlpha(mHoop, k * (0.5 + 0.2 * pulse) * dim);
    mHoop.uniforms.uColorMul.value.setRGB(1.0, 0.66, 0.84);
    hoop.rotation.y = t * 0.45;
    mHoop.visible = k > 0.001;
    setAlpha(mAura, k * (0.42 + 0.08 * flick) * dim);
    mAura.uniforms.uColorMul.value.setRGB(1.0, 0.56, 0.74);
    mAura.visible = k > 0.001;
    setAlpha(mSpill, k * dim);
    mSpill.visible = k > 0.001;
  };

  const model = {
    root: rig.root,
    anchors,
    radius: 1.5 * S,
    height: (Y.bloom + 1.3) * S,
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
