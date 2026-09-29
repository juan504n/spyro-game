// BEACON LANTERN — the central object of the game.
//
// Stepped stone plinth with a rune-ring inlay and four charge crystals, a fluted column, a lotus brass collar, a
// hexagonal brass-caged lantern whose glass goes from frosted violet (dormant) to radiant amber (lit), a verdigris pagoda
// roof with upturned eaves and a brass finial.  `opts.big` builds the x2.2 Great Beacon (all geometry / anchors are baked
// at the final size, the root scale stays 1) with a sunburst crown on the finial.
//
// Lighting model: the stone / brass / roof are normal dynamic-lit parts (with a twilight exposure lift and a warm shift
// while lit); everything that glows is an additive (or full-bright) layer whose alpha is driven from setLit(k).
import { vgrad } from '../../../engine/builder.js';
import { U } from '../../../engine/materials.js';
import { Rig, setMul, setAlpha } from './common.js';
import { TAU, flatRot, litBuilder, fluted, strut, latheUV, lerp, damp, clamp } from './geo.js';
import { derivedTexture, recolor } from './recolor.js';

const SIDES = 6;
const ROT6 = flatRot(SIDES);

// vertical layout (unscaled metres)
const Y = {
  plinthTop: 0.86,
  shaft0: 1.0, shaft1: 2.12,
  collar0: 2.12, collar1: 2.42,
  glass0: 2.42, glassMid: 3.08, glass1: 3.74,
  ring1: 3.9,
  roof0: 3.88, roof1: 4.34,
  finial: 4.44,
};
const FLAME_Y = (Y.glass0 + Y.glass1) / 2;

export function createBeacon(assets, opts = {}) {
  const big = !!opts.big;
  const S = big ? 2.2 : 1;
  const rig = new Rig(assets);
  const anchors = {};

  // ---- materials ---------------------------------------------------------------------------------------------------
  const mStone = rig.lit('tower_stone');
  const mColumn = rig.lit('far_rock');
  const mRune = rig.lit('rune_ring');
  const mBrass = rig.lit('metal_brass');
  const mRoof = rig.lit('roof_teal');
  const mGlass = rig.lit('lantern_glass_off');
  const mCrystal = rig.full('crystal_violet');                           // self-lit; texture swaps to amber when lit
  const texViolet = assets.tex('crystal_violet');
  const texAmber = derivedTexture(assets, 'crystal_violet', 'amber', (p) => recolor(p, (h, s) => s > 0.08, { hue: 38, sat: 1.25, val: 1.12 }));
  const mPulse = rig.glow('lantern_glass_off', { decal: true });         // violet shimmer over the dormant glass
  const mOn = rig.glow('lantern_glass_on', { decal: true });             // the amber lit glass
  const mHot = rig.glow('sun_glow', { decal: true });                    // radial hot core in every pane (violet / amber)
  const mHoop = rig.glow('rune_ring', { double: true });                 // turning rune ring around the lantern
  const mRuneGlow = rig.glow('rune_ring', { decal: true });              // rune ring on the plinth lights up
  const mAura = rig.glow('sun_glow', { double: true });                  // soft halo cards
  const mSpill = rig.glow(null, { decal: true });                        // warm spill down the column

  // ---- plinth (tower_stone): three steps -------------------------------------------------------------------------
  {
    const b = litBuilder(S, 11);
    const shade = vgrad(0, [0.6, 0.6, 0.72], Y.plinthTop, [1.0, 1.0, 1.0]);
    const o = { smooth: false, tile: 3, color: shade };
    b.lathe([[1.42, 0], [1.42, 0.05], [1.36, 0.3], [1.22, 0.34]], 8, { ...o, rot: flatRot(8) });
    b.lathe([[1.2, 0.34], [1.2, 0.38], [1.14, 0.58], [1.08, 0.62]], 8, { ...o, rot: 0 });
    b.lathe([[1.06, 0.62], [1.06, 0.66], [1.0, Y.plinthTop]], 12, o);
    rig.mesh(b, mStone, null, { name: 'plinth' });
  }
  // ---- rune ring inlay (static lit disc + a glow disc that turns slowly) -----------------------------------------------
  const runeSpin = rig.pivot('runeSpin', 0, 0, 0);
  {
    const b = litBuilder(S, 12);
    b.disc(1.0, 12, { y: Y.plinthTop, uvDisc: true, color: [1, 1, 1] });
    rig.mesh(b, mRune, null, { name: 'rune' });
    const g = litBuilder(S, 13);
    g.disc(1.0, 12, { y: Y.plinthTop, uvDisc: true, color: [0.5, 0.5, 0.5] });
    rig.mesh(g, mRuneGlow, runeSpin, { name: 'runeGlow' });
  }
  // ---- four charge crystals on the lowest step -------------------------------------------------------------------------
  {
    const b = litBuilder(S, 17);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      b.push();
      b.translate(1.27 * Math.sin(a), 0.28, 1.27 * Math.cos(a));
      b.rotateY(a);
      b.rotateX(0.2);                                                    // lean outward
      latheUV(b, [[0, 0, 0.02], [0.15, 0.16, 0.25], [0.15, 0.48, 0.72], [0, 0.8, 0.98]], 4, { uWrap: 1, color: [0.5, 0.5, 0.5], smooth: false, rot: Math.PI / 4 });
      b.pop();
    }
    rig.mesh(b, mCrystal, null, { name: 'crystals' });
  }
  // ---- column ---------------------------------------------------------------------------------------------------
  {
    const b = litBuilder(S, 14);
    const c = vgrad(Y.plinthTop, [0.75, 0.73, 0.82], Y.collar0, [1.0, 0.98, 1.0]);
    b.lathe([[0.62, Y.plinthTop], [0.62, 0.92], [0.5, Y.shaft0]], 8, { smooth: false, rot: flatRot(8), tile: 3, color: c });
    fluted(b, { n: 8, r0: 0.46, r1: 0.38, groove: 0.72, y0: Y.shaft0, y1: Y.shaft1, rot: flatRot(16), tile: 3 }, { color: c });
    rig.mesh(b, mColumn, null, { name: 'column' });
  }
  // ---- brass work -----------------------------------------------------------------------------------------------
  {
    const b = litBuilder(S, 15);
    const o = { smooth: false, rot: ROT6, tile: 1.2 };
    // lotus collar under the lantern (8 petals)
    b.lathe([[0.4, Y.collar0], [0.52, Y.collar0 + 0.06], [0.84, Y.collar0 + 0.16], [0.9, Y.collar0 + 0.24], [0.78, Y.collar1]], 8, { smooth: false, tile: 1.2, rot: flatRot(8) });
    // bottom plate of the lantern
    b.lathe([[0.7, Y.glass0 - 0.02], [0.86, Y.glass0], [0.9, Y.glass0 + 0.06], [0.7, Y.glass0 + 0.1]], SIDES, o);
    // belt at the widest point
    b.lathe([[0.9, Y.glassMid - 0.08], [1.0, Y.glassMid - 0.02], [1.0, Y.glassMid + 0.04], [0.9, Y.glassMid + 0.1]], SIDES, o);
    // top ring
    b.lathe([[0.7, Y.glass1 - 0.04], [0.92, Y.glass1], [0.98, Y.glass1 + 0.08], [0.78, Y.ring1 + 0.04]], SIDES, o);
    // corner posts: two struts each following the bulge
    const rB = 0.74, rM = 0.94, rT = 0.72;
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * TAU + ROT6;
      const s = Math.sin(a), c = Math.cos(a);
      const P = (r, y) => [r * s, y, r * c];
      strut(b, P(rB, Y.glass0 + 0.04), P(rM, Y.glassMid + 0.02), 0.16, 0.16, { tile: 0.8 });
      strut(b, P(rM, Y.glassMid + 0.02), P(rT, Y.glass1), 0.16, 0.16, { tile: 0.8 });
    }
    // finial: jewel + spike
    b.at(0, Y.finial - 0.02, 0, (bb) => bb.sphere(0.15, 5, 3, { tile: 1 }));
    b.at(0, Y.finial + 0.08, 0, (bb) => bb.cone(0.06, 0.26, 4, { smooth: false, tile: 1 }));
    // eave horns: little cones at the six corners of the roof
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * TAU + ROT6;
      const r = 1.36;
      b.at(r * Math.sin(a), Y.roof0 + 0.02, r * Math.cos(a), (bb) => bb.cone(0.07, 0.2, 4, { smooth: false, tile: 1 }));
    }
    // the Great Beacon wears a sunburst crown: eight rays fanning out of the finial
    if (big) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        b.push();
        b.translate(0.1 * Math.sin(a), Y.finial + 0.02, 0.1 * Math.cos(a));
        b.rotateY(a);
        b.rotateX(0.75);
        b.cone(0.055, 0.5, 4, { smooth: false, tile: 1 });
        b.pop();
      }
    }
    rig.mesh(b, mBrass, null, { name: 'brass' });
  }
  // ---- roof -----------------------------------------------------------------------------------------------------
  {
    const b = litBuilder(S, 16);
    const y0 = Y.roof0;
    b.lathe([[1.42, y0 + 0.06], [1.36, y0 + 0.0], [1.0, y0 + 0.12], [0.6, y0 + 0.26], [0.3, y0 + 0.4], [0.1, Y.roof1 + 0.06]], SIDES, { smooth: false, rot: ROT6, tile: 2, color: [1, 1, 1] });
    b.lathe([[0.72, y0 - 0.02], [1.36, y0]], SIDES, { smooth: false, rot: ROT6, tile: 2, color: [0.55, 0.55, 0.6] }); // underside
    rig.mesh(b, mRoof, null, { name: 'roof' });
  }
  // ---- glass (four coincident layers: opaque dormant glass + violet shimmer + amber + hot core) ----------------------------
  // uv sub-rect of the 16x16 lantern texture: just the three panes (the 3D brass work supplies the frame)
  const UV0 = [2 / 16, 3 / 16, 14 / 16, 13 / 16];
  const glassGeo = (off, tint, seed, uvRect = UV0) => {
    const b = litBuilder(S, seed);
    const y0 = Y.glass0 + 0.08, y1 = Y.glassMid, y2 = Y.glass1 - 0.02;
    const r0 = 0.78 + off, r1 = 0.94 + off, r2 = 0.76 + off;
    const [u0, v0, u1, v1] = uvRect, vm = (v0 + v1) / 2;
    for (let i = 0; i < SIDES; i++) {
      const a0 = (i / SIDES) * TAU + ROT6, a1 = ((i + 1) / SIDES) * TAU + ROT6;
      const P = (r, y, a) => [r * Math.sin(a), y, r * Math.cos(a)];
      b.quad(P(r0, y0, a0), P(r0, y0, a1), P(r1, y1, a1), P(r1, y1, a0), { uv: [u0, v0, u1, vm], color: tint });
      b.quad(P(r1, y1, a0), P(r1, y1, a1), P(r2, y2, a1), P(r2, y2, a0), { uv: [u0, vm, u1, v1], color: tint });
    }
    return b;
  };
  rig.mesh(glassGeo(0, [1, 1, 1], 21), mGlass, null, { name: 'glass' });
  rig.mesh(glassGeo(0.02, [0.5, 0.5, 0.5], 22), mPulse, null, { name: 'glassPulse' });
  rig.mesh(glassGeo(0.03, [0.5, 0.5, 0.5], 23), mOn, null, { name: 'glassOn' });
  rig.mesh(glassGeo(0.04, [0.5, 0.5, 0.5], 24, [0, 0, 1, 1]), mHot, null, { name: 'glassHot' });

  // ---- rune hoop: a slowly turning ring of glowing runes around the lantern (lit only) -------------------------------------
  const hoop = rig.pivot('hoop', 0, (FLAME_Y - 0.12) * S, 0);
  {
    const b = litBuilder(S, 30);
    const n = 12, r0 = 1.22, r1 = 1.8;
    const P = (r, a) => [r * Math.sin(a), 0, r * Math.cos(a)];
    const UV = (r, a) => [0.5 + 0.5 * (r / r1) * Math.sin(a), 0.5 + 0.5 * (r / r1) * Math.cos(a)];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      const A = P(r0, a0), B = P(r0, a1), C = P(r1, a1), D = P(r1, a0);
      const o = { color: [0.5, 0.5, 0.5] };
      b.tri(A, C, B, UV(r0, a0), UV(r1, a1), UV(r0, a1), o, [0, 1, 0]);
      b.tri(A, D, C, UV(r0, a0), UV(r1, a0), UV(r1, a1), o, [0, 1, 0]);
    }
    rig.mesh(b, mHoop, hoop, { name: 'hoop', order: 9 });
  }
  // ---- aura (soft additive glow cards through the lantern) ---------------------------------------------------------------
  {
    const b = litBuilder(S, 31);
    const h = 1.9, cy = FLAME_Y;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      const dx = Math.cos(a) * h, dz = Math.sin(a) * h;
      b.quad([-dx, cy - h, -dz], [dx, cy - h, dz], [dx, cy + h, dz], [-dx, cy + h, -dz], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] });
    }
    rig.mesh(b, mAura, null, { name: 'aura', order: 9 });
  }
  // ---- light spill on the column / collar -----------------------------------------------------------------------------
  {
    const b = litBuilder(S, 32);
    // additive sleeve around the shaft: alpha ramps 0 -> 1 towards the lantern
    const n = 8;
    const y0 = Y.shaft0 + 0.02, y1 = Y.shaft1;
    const amber = [0.5, 0.26, 0.06];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU + flatRot(n), a1 = ((i + 1) / n) * TAU + flatRot(n);
      const P = (r, y, a) => [r * Math.sin(a), y, r * Math.cos(a)];
      const rb = 0.5, rt = 0.42;
      b.quad(P(rb, y0, a0), P(rb, y0, a1), P(rt, y1, a1), P(rt, y1, a0), { uv: [0, 0, 1, 1], tints: [amber, amber, amber, amber], alphas: [0, 0, 0.55, 0.55] });
    }
    rig.mesh(b, mSpill, null, { name: 'spill' });
  }

  // ---- anchors --------------------------------------------------------------------------------------------------
  rig.anchor(anchors, 'flame', 0, FLAME_Y * S, 0);
  rig.anchor(anchors, 'base', 0, Y.plinthTop * S, 0);
  rig.anchor(anchors, 'top', 0, (Y.finial + 0.38) * S, 0);

  // ---- state ----------------------------------------------------------------------------------------------------
  const st = { target: opts.lit ? clamp(opts.lit) : 0, k: 0, init: false, t: 0, phase: (opts.seed ?? 0) * 1.7, swapped: false };

  const apply = () => {
    const k = st.k, t = st.t;
    const day = U.uDay.value;
    const dim = 1 - 0.35 * day;   // additive glows are toned down against the bright daybreak
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + st.phase);
    const flick = 0.5 + 0.5 * Math.sin(t * 6.1 + st.phase) * Math.sin(t * 2.3);

    // ---- dormant <-> lit glass ----
    setAlpha(mPulse, (1 - k) * (0.14 + 0.26 * pulse));
    const dark = 1 - k * 0.95;
    setMul(mGlass, [dark, dark, dark]);
    setAlpha(mOn, k * (0.88 + 0.12 * flick) * (1 - 0.15 * day));
    mOn.uniforms.uColorMul.value.setRGB(1.0, 0.8, 0.44);
    // hot radial glow in every pane: a faint pulsing violet "soul" while dormant, a blazing amber core when lit
    setAlpha(mHot, lerp((0.1 + 0.22 * pulse) * (1 - k), (0.7 + 0.15 * flick) * dim, k));
    mHot.uniforms.uColorMul.value.setRGB(lerp(0.62, 1.0, k), lerp(0.36, 0.72, k), lerp(1.0, 0.3, k));
    mPulse.visible = k < 0.999;
    mOn.visible = k > 0.001;

    // ---- stone / brass / roof: twilight exposure lift, cold when dormant, warm when lit ----
    const ex = lerp(1.7, 1.0, clamp(day / 0.8));
    const warm = 1 - 0.45 * clamp(day / 0.9);
    const wr = 1 + 0.55 * k * warm, wg = 1 + 0.1 * k * warm, wb = 1 - 0.32 * k * warm;
    setMul(mStone, [ex * wr, ex * wg, ex * wb]);
    setMul(mColumn, [ex * wr, ex * wg, ex * wb]);
    setMul(mRoof, [ex * 0.78 * (1 + 0.1 * k), ex * 0.78, ex * 0.78 * (1 - 0.05 * k)]);
    setMul(mRune, [ex * 1.2, ex * 1.2, ex * 1.2]);
    setMul(mBrass, [ex * (0.82 + 0.68 * k), ex * (0.8 + 0.5 * k), ex * (0.85 - 0.05 * k)]);

    // ---- glows on the plinth / column / around the lantern ----
    setAlpha(mRuneGlow, k * (0.75 + 0.25 * pulse) * dim);
    mRuneGlow.uniforms.uColorMul.value.setRGB(1.0, 0.82, 0.5);
    mRuneGlow.visible = k > 0.001;
    runeSpin.rotation.y = -t * 0.3 * k;
    setAlpha(mHoop, k * (0.5 + 0.2 * pulse) * dim);
    mHoop.uniforms.uColorMul.value.setRGB(1.0, 0.72, 0.36);
    hoop.rotation.y = t * 0.45;
    mHoop.visible = k > 0.001;
    setAlpha(mAura, k * (0.42 + 0.08 * flick) * dim);
    mAura.uniforms.uColorMul.value.setRGB(1.0, 0.6, 0.2);
    mAura.visible = k > 0.001;
    setAlpha(mSpill, k * dim);
    mSpill.visible = k > 0.001;

    // ---- crystals: violet and dim while dormant; they flare through white and come back amber ----
    const amber = k > 0.5;
    if (amber !== st.swapped) { mCrystal.uniforms.map.value = amber ? texAmber : texViolet; st.swapped = amber; }
    const cb = amber ? lerp(0.85, 1.25, (k - 0.5) * 2) : lerp(0.55 + 0.25 * pulse, 0.5, k * 2);
    setMul(mCrystal, [cb, cb, cb]);
  };

  const model = {
    root: rig.root,
    anchors,
    radius: 1.42 * S,
    height: (Y.finial + 0.34) * S,
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
