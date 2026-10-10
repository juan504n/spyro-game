// The things a trial is made of (systems/trialview.js puts them in the world; trials/ says what they do). Each is a small prop in the stone and the crystal of the realm it stands in (`opts.look`:
// { stone, crystal, metal } texture names and { glow } a colour: a realm's own skin), lit like the other objects (a Rig, a twilight exposure lift) with an additive glow that says its state.
//
//   trial_bell     a bronze bell hung in a frame of two posts on a drum of stone: setLit(k) (the heart of light), kick() (it swings)                                    [bells]
//   trial_plate    a round inlay of stone in the floor with a rune in it: setLit(k) 0 dark .. 1 lit, press() (it sinks and comes back)                                     [plates]
//   trial_pylon    a slim obelisk with a crystal that floats over it: setState('off' | 'next' | 'done'), touch() (a flash)                                                  [circuit]
//   trial_vent     a ring of little stones round a hole that glows: setActive(k)                                                                                           [wisps]
//   trial_mirror   a crystal slab on a drum of stone that turns a quarter: setSlope(0 = '/', 1 = '\'), setLit(k) (the beam is in it), spin() (it turns)                      [mirrors]
//   trial_lens     the lamp the beam leaves (opts.role 'lamp') or the receiver it must reach ('receiver'): setLit(k)                                                         [mirrors]
//   trial_puck     a disc of crystal: setLit(k), spin(a)                                                                                                                  [puck]
//   trial_goalie   a slab of stone with an eye on its +z face that slides across the goal                                                                              [puck]
//   trial_goal     two posts and a crossbar with a net of light between them (opts.hw: the half-width of the mouth): flash(k)                                                  [puck]
//   trial_court    the lines of a court on the floor (opts.hw, opts.hl: its half-width and half-length, opts.goalHW): setLit(k)                                                 [puck]
//   trial_stone    a standing stone with a rune that wakes: setLit(k)                                                                                                     [siege]
//   trial_ring     a hoop of metal and crystal hung in the air, its middle at the origin, facing +z: setState('off' | 'next' | 'done' | 'missed'), pass() (a flash)            [rings]
// All: update(dt, { t }), flash(k), dispose(); the origin is on the floor under the middle of the thing.
import { U } from '../../../engine/materials.js';
import { Rig, setMul, setAlpha } from './common.js';
import { TAU, litBuilder, lerp, damp, clamp, smooth } from './geo.js';

const LOOK = { stone: 'cobble', crystal: 'crystal_violet', metal: 'metal_brass', glow: [0.72, 0.5, 1.0] };
const lookOf = (o) => ({ ...LOOK, ...(o && o.look) });
const GOLD = [1.0, 0.82, 0.42];
const tint = (mat, c, k = 1) => mat.uniforms.uColorMul.value.setRGB(c[0] * k, c[1] * k, c[2] * k);
/** the twilight lift of a lit part (the moonlit dusk of a realm is dark; it relaxes to 1 as the day comes) */
const lift = () => lerp(1.22, 1.0, clamp(U.uDay.value / 0.8));
/** crossed cards of light (a halo that reads from every side): n cards, h half-height, centred at (cx, cy, cz) */
function cards(b, cx, cy, cz, h, n = 2, hw = h) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI, dx = Math.cos(a) * hw, dz = Math.sin(a) * hw;
    b.quad([cx - dx, cy - h, cz - dz], [cx + dx, cy - h, cz + dz], [cx + dx, cy + h, cz + dz], [cx - dx, cy + h, cz - dz], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] });
  }
}
/** a flat disc of light lying at height y (uv 0..1 over it) */
const flatDisc = (b, r, y, segs = 14) => b.disc(r, segs, { y, uvDisc: true, color: [0.5, 0.5, 0.5] });

function done(rig, anchors, o) {
  return {
    root: rig.root, anchors, radius: o.radius, height: o.height, tris: rig.tris, testPoses: o.poses || {},
    flash: (k) => rig.flash(k), dispose: () => rig.dispose(),
  };
}

// ---- the bell ----------------------------------------------------------------------------------------------------------------------------------------------
export function createTrialBell(assets, opts = {}) {
  const look = lookOf(opts), rig = new Rig(assets), anchors = {};
  const mStone = rig.lit(look.stone), mBell = rig.lit(look.metal, { double: true }), mHeart = rig.glow('sun_glow', { double: true }), mRune = rig.glow('rune_ring', { decal: true });
  {
    const b = litBuilder(1, 61), o = { tile: 2.4, color: [1.0, 0.98, 0.98] };
    b.lathe([[0.95, 0], [0.95, 0.08], [0.82, 0.46], [0.62, 0.52]], 8, { ...o, rot: 0.2, smooth: false });          // the drum
    for (const sd of [-1, 1]) {
      b.box(sd * 0.66, 1.4, 0, 0.2, 1.8, 0.2, o);                                                                  // the posts
      b.box(sd * 0.66, 0.58, 0, 0.34, 0.18, 0.34, o);
      b.box(sd * 0.66, 2.34, 0, 0.3, 0.16, 0.3, o);
    }
    b.box(0, 2.46, 0, 1.64, 0.16, 0.26, o);                                                                       // the crossbar
    rig.mesh(b, mStone, null, { name: 'frame' });
  }
  const swing = rig.pivot('swing', 0, 2.38, 0);
  {
    const b = litBuilder(1, 62);
    const prof = [[0, -0.12], [0.16, -0.14], [0.28, -0.34], [0.4, -0.62], [0.5, -0.9], [0.6, -1.12], [0.62, -1.18]];
    b.lathe(prof, 10, { tile: 2, smooth: true, color: [1.0, 0.98, 0.96], rot: 0.15 });
    b.lathe([[0.62, -1.18], [0.54, -1.12], [0.42, -0.9]], 10, { tile: 2, smooth: true, color: [0.5, 0.46, 0.44], rot: 0.15 });
    b.at(0, -0.08, 0, (q) => q.cyl(0.05, 0.05, 0.18, 4, { tile: 2, color: [0.9, 0.86, 0.8] }));
    b.at(0, -1.02, 0, (q) => q.sphere(0.12, 6, 5, { tile: 2, color: [1.05, 0.98, 0.9] }));
    rig.mesh(b, mBell, swing, { name: 'bell' });
    const h = litBuilder(1, 63);
    cards(h, 0, -0.78, 0, 0.62);
    rig.mesh(h, mHeart, swing, { name: 'heart', order: 9 });
  }
  {
    const r = litBuilder(1, 64);
    flatDisc(r, 0.62, 0.54, 12);
    rig.mesh(r, mRune, null, { name: 'rune' });
  }
  rig.anchor(anchors, 'flame', 0, 1.4, 0);
  const st = { k: 0, want: 0, kick: 0, t: 0, phase: (opts.seed ?? 0) * 1.3 };
  const apply = () => {
    const e = lift();
    setMul(mStone, [e, e, e]); setMul(mBell, [e * lerp(0.7, 1.2, st.k), e * lerp(0.74, 1.05, st.k), e * lerp(0.9, 0.7, st.k)]);
    swing.rotation.x = st.kick * 0.55 * Math.sin(st.t * 9) ; swing.rotation.z = st.kick * 0.2 * Math.sin(st.t * 7 + 1);
    const day = 1 - 0.3 * U.uDay.value;
    setAlpha(mHeart, st.k * 0.85 * day); tint(mHeart, look.glow); mHeart.visible = st.k > 0.01;
    setAlpha(mRune, (0.25 + st.k * 0.7) * day); tint(mRune, look.glow); mRune.visible = true;
  };
  apply();
  return {
    ...done(rig, anchors, { radius: 0.95, height: 2.6, poses: { dark: { lit: 0 }, lit: { lit: 1 } } }),
    setLit(k) { st.want = clamp(k); },
    kick() { st.kick = 1; },
    update(dt, pose) { st.t = pose && pose.t !== undefined ? pose.t : st.t + dt; if (pose && pose.lit !== undefined) st.want = pose.lit; st.k = damp(st.k, st.want, 14, dt); st.kick = Math.max(0, st.kick - dt * 0.9); apply(); },
  };
}

// ---- the plate ---------------------------------------------------------------------------------------------------------------------------------------------
export function createTrialPlate(assets, opts = {}) {
  const look = lookOf(opts), rig = new Rig(assets), anchors = {};
  const mStone = rig.lit(look.stone, { double: true }), mRune = rig.glow('rune_ring', { decal: true }), mCore = rig.glow('sun_glow', { double: true });
  const slab = rig.pivot('slab', 0, 0, 0);
  {
    const b = litBuilder(1, 71), o = { tile: 2.2, color: [1.0, 0.98, 0.98] };
    b.lathe([[1.42, 0], [1.42, 0.07], [1.3, 0.11], [1.18, 0.07]], 12, { ...o, rot: 0.1, smooth: false });         // the rim
    b.lathe([[1.18, 0.07], [0.0, 0.06]], 12, { ...o, color: [0.55, 0.55, 0.6] });                                  // the dark inlay
    rig.mesh(b, mStone, slab, { name: 'plate' });
    const r = litBuilder(1, 72);
    flatDisc(r, 1.16, 0.085, 14);
    rig.mesh(r, mRune, slab, { name: 'rune' });
    const c = litBuilder(1, 73);
    flatDisc(c, 0.7, 0.09, 12);
    rig.mesh(c, mCore, slab, { name: 'core', order: 9 });
  }
  const st = { k: 0, want: 0, dip: 0, t: 0 };
  const apply = () => {
    const e = lift(), day = 1 - 0.3 * U.uDay.value, pulse = 0.5 + 0.5 * Math.sin(st.t * 2.2);
    setMul(mStone, [e, e, e]);
    setAlpha(mRune, (0.18 + st.k * 0.8) * day); tint(mRune, look.glow, 0.7 + 0.5 * st.k);
    setAlpha(mCore, st.k * (0.5 + 0.2 * pulse) * day); tint(mCore, GOLD); mCore.visible = st.k > 0.01;
    slab.position.y = -0.1 * st.dip;
  };
  apply();
  return {
    ...done(rig, anchors, { radius: 1.42, height: 0.12, poses: { dark: { lit: 0 }, lit: { lit: 1 } } }),
    setLit(k) { st.want = clamp(k); },
    press() { st.dip = 1; },
    update(dt, pose) { st.t = pose && pose.t !== undefined ? pose.t : st.t + dt; if (pose && pose.lit !== undefined) st.want = pose.lit; st.k = damp(st.k, st.want, 12, dt); st.dip = Math.max(0, st.dip - dt * 3.2); apply(); },
  };
}

// ---- the pylon ---------------------------------------------------------------------------------------------------------------------------------------------
export function createTrialPylon(assets, opts = {}) {
  const look = lookOf(opts), rig = new Rig(assets), anchors = {};
  const mStone = rig.lit(look.stone), mCrystal = rig.lit(look.crystal, { double: true }), mGlow = rig.glow('sun_glow', { double: true }), mRune = rig.glow('rune_ring', { decal: true });
  {
    const b = litBuilder(1, 81), o = { tile: 2.4, color: [1.0, 0.98, 0.98] };
    b.lathe([[0.95, 0], [0.95, 0.1], [0.8, 0.4], [0.55, 0.46]], 6, { ...o, rot: 0.3, smooth: false });
    b.at(0, 0.46, 0, (q) => q.cyl(0.42, 0.22, 3.0, 4, { ...o, rot: 0.4 }));                                      // the shaft: four-sided, taper
    b.at(0, 3.46, 0, (q) => q.cyl(0.3, 0.3, 0.16, 4, { ...o, rot: 0.4 }));
    rig.mesh(b, mStone, null, { name: 'pylon' });
  }
  const bob = rig.pivot('bob', 0, 4.35, 0);
  {
    const b = litBuilder(1, 82);
    b.at(0, 0, 0, (q) => { q.cone(0.55, 0.85, 4, { tile: 2, color: [1, 1, 1] }); q.rotateX(Math.PI); q.cone(0.55, 0.85, 4, { tile: 2, color: [1, 1, 1] }); });
    rig.mesh(b, mCrystal, bob, { name: 'crystal' });
    const g = litBuilder(1, 83);
    cards(g, 0, 0, 0, 1.5);
    rig.mesh(g, mGlow, bob, { name: 'halo', order: 9 });
  }
  {
    const r = litBuilder(1, 84);
    flatDisc(r, 1.7, 0.05, 14);
    rig.mesh(r, mRune, null, { name: 'rune' });
  }
  rig.anchor(anchors, 'top', 0, 4.4, 0);
  const st = { k: 0, want: 0.2, col: look.glow, flash: 0, t: 0, phase: (opts.seed ?? 0) * 1.1 };
  const apply = () => {
    const e = lift(), day = 1 - 0.3 * U.uDay.value, pulse = 0.5 + 0.5 * Math.sin(st.t * 3 + st.phase);
    setMul(mStone, [e, e, e]);
    const c = st.col, k = st.k + st.flash;
    setMul(mCrystal, [e * (0.6 + 0.9 * c[0] * k), e * (0.6 + 0.9 * c[1] * k), e * (0.6 + 0.9 * c[2] * k)]);
    setAlpha(mGlow, (0.1 + k * (0.55 + 0.25 * pulse)) * day); tint(mGlow, c); mGlow.visible = k > 0.02;
    setAlpha(mRune, (0.15 + k * 0.7) * day); tint(mRune, c); mRune.visible = true;
    bob.position.y = 4.3 + Math.sin(st.t * 1.8 + st.phase) * 0.15; bob.rotation.y = st.t * (0.6 + 1.4 * st.k);
  };
  apply();
  return {
    ...done(rig, anchors, { radius: 0.95, height: 5, poses: { off: { state: 'off' }, next: { state: 'next' }, done: { state: 'done' } } }),
    setState(s) { st.want = s === 'next' ? 1 : s === 'done' ? 0.55 : 0.2; st.col = s === 'done' ? GOLD : look.glow; },
    touch() { st.flash = 1; },
    update(dt, pose) {
      st.t = pose && pose.t !== undefined ? pose.t : st.t + dt;
      if (pose && pose.state) this.setState(pose.state);
      st.k = damp(st.k, st.want, 9, dt); st.flash = Math.max(0, st.flash - dt * 2.2); apply();
    },
  };
}

// ---- the vent ----------------------------------------------------------------------------------------------------------------------------------------------
export function createTrialVent(assets, opts = {}) {
  const look = lookOf(opts), rig = new Rig(assets), anchors = {};
  const mStone = rig.lit(look.stone), mGlow = rig.glow('sun_glow', { double: true }), mRune = rig.glow('rune_ring', { decal: true });
  {
    const b = litBuilder(1, 91), o = { tile: 2, color: [1.0, 0.98, 0.98] };
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      b.at(Math.sin(a) * 0.78, 0.2, Math.cos(a) * 0.78, (q) => q.box(0, 0, 0, 0.5, 0.42 + 0.12 * (i % 2), 0.4, o), a);
    }
    b.lathe([[0.62, 0], [0.62, 0.05], [0.0, 0.03]], 8, { ...o, color: [0.3, 0.3, 0.36] });
    rig.mesh(b, mStone, null, { name: 'ring' });
    const g = litBuilder(1, 92);
    flatDisc(g, 0.64, 0.07, 10);
    rig.mesh(g, mRune, null, { name: 'rune' });
    const h = litBuilder(1, 93);
    cards(h, 0, 0.9, 0, 0.9, 2, 0.6);
    rig.mesh(h, mGlow, null, { name: 'plume', order: 9 });
  }
  const st = { k: 0, want: 0, t: 0 };
  const apply = () => {
    const e = lift(), day = 1 - 0.3 * U.uDay.value, pulse = 0.5 + 0.5 * Math.sin(st.t * 4);
    setMul(mStone, [e, e, e]);
    setAlpha(mRune, (0.2 + st.k * 0.7) * day); tint(mRune, look.glow);
    setAlpha(mGlow, st.k * (0.3 + 0.25 * pulse) * day); tint(mGlow, look.glow, 1.1); mGlow.visible = st.k > 0.02;
  };
  apply();
  return {
    ...done(rig, anchors, { radius: 1.1, height: 0.7, poses: { quiet: { active: 0 }, awake: { active: 1 } } }),
    setActive(k) { st.want = clamp(k); },
    update(dt, pose) { st.t = pose && pose.t !== undefined ? pose.t : st.t + dt; if (pose && pose.active !== undefined) st.want = pose.active; st.k = damp(st.k, st.want, 5, dt); apply(); },
  };
}

// ---- the mirror --------------------------------------------------------------------------------------------------------------------------------------------
export function createTrialMirror(assets, opts = {}) {
  const look = lookOf(opts), rig = new Rig(assets), anchors = {};
  const mStone = rig.lit(look.stone), mCrystal = rig.lit(look.crystal, { double: true }), mGlow = rig.glow('sun_glow', { double: true });
  {
    const b = litBuilder(1, 101), o = { tile: 2.4, color: [1.0, 0.98, 0.98] };
    b.lathe([[0.95, 0], [0.95, 0.1], [0.82, 0.6], [0.7, 0.66], [0.3, 0.7]], 8, { ...o, rot: 0.2, smooth: false });
    rig.mesh(b, mStone, null, { name: 'drum' });
  }
  const turn = rig.pivot('turn', 0, 0.7, 0);
  {
    const b = litBuilder(1, 102);
    b.box(0, 1.15, 0, 0.16, 2.1, 1.9, { tile: 2, color: [1, 1, 1] });                                             // the slab: its long side along +z
    b.box(0, 0.12, 0, 0.3, 0.24, 2.1, { tile: 2, color: [0.8, 0.8, 0.85] });
    rig.mesh(b, mCrystal, turn, { name: 'slab' });
    const g = litBuilder(1, 103);
    g.quad([-0.14, 0.2, -0.95], [-0.14, 0.2, 0.95], [-0.14, 2.2, 0.95], [-0.14, 2.2, -0.95], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5], double: true });
    rig.mesh(g, mGlow, turn, { name: 'sheen', order: 9 });
  }
  rig.anchor(anchors, 'top', 0, 2.8, 0);
  const st = { k: 0, want: 0, ang: 0, target: 0, spin: 0, t: 0 };
  const slope = (s) => (s === 0 ? Math.PI / 4 : -Math.PI / 4);
  st.ang = st.target = slope(opts.slope ?? 0);
  const apply = () => {
    const e = lift(), day = 1 - 0.3 * U.uDay.value, k = st.k;
    setMul(mStone, [e, e, e]);
    setMul(mCrystal, [e * (0.8 + 0.5 * look.glow[0] * k), e * (0.8 + 0.5 * look.glow[1] * k), e * (0.9 + 0.5 * look.glow[2] * k)]);
    setAlpha(mGlow, (0.08 + k * 0.7) * day); tint(mGlow, look.glow, 1.0 + 0.3 * k);
    turn.rotation.y = st.ang;
  };
  apply();
  return {
    ...done(rig, anchors, { radius: 0.95, height: 2.9, poses: { slash: { slope: 0 }, back: { slope: 1 } } }),
    setSlope(s) { st.target = slope(s); },
    setLit(k) { st.want = clamp(k); },
    update(dt, pose) {
      st.t = pose && pose.t !== undefined ? pose.t : st.t + dt;
      if (pose && pose.slope !== undefined) st.target = slope(pose.slope);
      st.ang = damp(st.ang, st.target, 11, dt); if (Math.abs(st.ang - st.target) < 0.002) st.ang = st.target;
      st.k = damp(st.k, st.want, 12, dt); apply();
    },
  };
}

// ---- the lamp and the receiver -----------------------------------------------------------------------------------------------------------------------------
export function createTrialLens(assets, opts = {}) {
  const look = lookOf(opts), rig = new Rig(assets), anchors = {}, lamp = opts.role !== 'receiver';
  const mStone = rig.lit(look.stone), mMetal = rig.lit(look.metal, { double: true }), mGlow = rig.glow('sun_glow', { double: true }), mRune = rig.glow('rune_ring', { decal: true });
  {
    const b = litBuilder(1, 111), o = { tile: 2.4, color: [1.0, 0.98, 0.98] };
    b.lathe([[1.0, 0], [1.0, 0.1], [0.84, 0.7], [0.62, 0.76]], 8, { ...o, rot: 0.2, smooth: false });
    b.at(0, 0.76, 0, (q) => q.cyl(0.4, 0.3, 1.0, 6, o));
    rig.mesh(b, mStone, null, { name: 'pillar' });
    const m = litBuilder(1, 112);
    if (lamp) {                                                                                                   // a funnel that points along +z: the way the beam goes
      m.at(0, 2.0, 0.2, (q) => { q.rotateX(Math.PI / 2); q.cyl(0.55, 0.32, 0.9, 8, { tile: 2, color: [1, 1, 1] }); });
    } else {                                                                                                      // a ring of eight blocks round the orb, flat: the beam may come into it from any side
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; m.at(Math.sin(a) * 0.66, 2.0, Math.cos(a) * 0.66, (q) => q.box(0, 0, 0, 0.34, 0.3, 0.3, { tile: 2, color: [1, 1, 1] }), a); }
    }
    rig.mesh(m, mMetal, null, { name: 'lens' });
    const g = litBuilder(1, 113);
    cards(g, 0, 2.0, 0, 0.8);
    rig.mesh(g, mGlow, null, { name: 'light', order: 9 });
    const r = litBuilder(1, 114);
    flatDisc(r, 0.8, 0.78, 10);
    rig.mesh(r, mRune, null, { name: 'rune' });
  }
  rig.anchor(anchors, 'top', 0, 2.8, 0);
  const st = { k: lamp ? 1 : 0, want: lamp ? 1 : 0, t: 0 };
  const apply = () => {
    const e = lift(), day = 1 - 0.3 * U.uDay.value, pulse = 0.5 + 0.5 * Math.sin(st.t * 3);
    setMul(mStone, [e, e, e]); setMul(mMetal, [e, e, e]);
    setAlpha(mGlow, (0.1 + st.k * (0.65 + 0.2 * pulse)) * day); tint(mGlow, lamp ? look.glow : GOLD, 1.1);
    setAlpha(mRune, (0.25 + st.k * 0.6) * day); tint(mRune, lamp ? look.glow : GOLD);
  };
  apply();
  return {
    ...done(rig, anchors, { radius: 1.0, height: 3, poses: { dark: { lit: 0 }, lit: { lit: 1 } } }),
    setLit(k) { st.want = clamp(k); },
    update(dt, pose) { st.t = pose && pose.t !== undefined ? pose.t : st.t + dt; if (pose && pose.lit !== undefined) st.want = pose.lit; st.k = damp(st.k, st.want, 10, dt); apply(); },
  };
}

// ---- the puck, the goalie, the goal and the court --------------------------------------------------------------------------------------------------------------
export function createTrialPuck(assets, opts = {}) {
  const look = lookOf(opts), rig = new Rig(assets), anchors = {};
  const mCrystal = rig.lit(look.crystal, { double: true }), mGlow = rig.glow('sun_glow', { double: true });
  const spin = rig.pivot('spin', 0, 0, 0);
  {
    const b = litBuilder(1, 121);
    b.lathe([[0.0, 0.0], [0.5, 0.0], [0.58, 0.1], [0.58, 0.24], [0.5, 0.32], [0.0, 0.34]], 10, { tile: 1.6, smooth: false, color: [1, 1, 1], rot: 0.1 });
    rig.mesh(b, mCrystal, spin, { name: 'disc' });
    const g = litBuilder(1, 122);
    cards(g, 0, 0.3, 0, 0.7);
    rig.mesh(g, mGlow, null, { name: 'halo', order: 9 });
  }
  const st = { k: 0.6, want: 0.6, t: 0 };
  const apply = () => { const e = lift(), day = 1 - 0.3 * U.uDay.value; setMul(mCrystal, [e * (0.9 + 0.4 * st.k), e * (0.9 + 0.3 * st.k), e * (1.0 + 0.2 * st.k)]); setAlpha(mGlow, (0.15 + 0.5 * st.k) * day); tint(mGlow, look.glow); };
  apply();
  return {
    ...done(rig, anchors, { radius: 0.58, height: 0.34, poses: { still: {} } }),
    setLit(k) { st.want = clamp(k); },
    spinBy(a) { spin.rotation.y += a; },
    update(dt, pose) { st.t += dt; st.k = damp(st.k, st.want, 10, dt); apply(); },
  };
}

export function createTrialGoalie(assets, opts = {}) {
  const look = lookOf(opts), rig = new Rig(assets), anchors = {};
  const mStone = rig.lit(look.stone, { double: true }), mEye = rig.glow('sun_glow', { double: true });
  {
    const b = litBuilder(1, 131), o = { tile: 2.2, color: [1.0, 0.98, 0.98] };
    b.box(0, 0.75, 0, 1.9, 1.5, 0.7, o);                                                                           // the slab
    b.box(0, 1.62, 0, 1.5, 0.24, 0.6, o);
    b.box(0, 0.12, 0, 2.1, 0.24, 0.9, { ...o, color: [0.8, 0.8, 0.85] });
    for (const sd of [-1, 1]) b.box(sd * 1.12, 0.8, 0, 0.34, 1.1, 0.5, { ...o, color: [0.9, 0.9, 0.96] });          // two blocks for arms
    rig.mesh(b, mStone, null, { name: 'slab' });
    const e = litBuilder(1, 132);                                                                                   // (its eye is on its +z face, as every model's front is)
    e.quad([-0.62, 0.98, 0.37], [0.62, 0.98, 0.37], [0.62, 1.12, 0.37], [-0.62, 1.12, 0.37], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] });
    cards(e, 0, 1.05, 0.42, 0.42, 1, 0.7);
    rig.mesh(e, mEye, null, { name: 'eye', order: 9 });
  }
  const st = { t: 0 };
  const apply = () => { const e = lift(); setMul(mStone, [e * 0.95, e * 0.95, e]); setAlpha(mEye, 0.7 + 0.2 * Math.sin(st.t * 3)); tint(mEye, [1.0, 0.45, 0.3]); };
  apply();
  return { ...done(rig, anchors, { radius: 1.0, height: 1.8, poses: { still: {} } }), update(dt) { st.t += dt; apply(); } };
}

export function createTrialGoal(assets, opts = {}) {
  const look = lookOf(opts), rig = new Rig(assets), anchors = {}, hw = opts.hw ?? 2.4;
  const mStone = rig.lit(look.stone), mNet = rig.glow('barrier', { double: true, scroll: [0.0, 0.05] }), mGlow = rig.glow('sun_glow', { double: true });
  {
    const b = litBuilder(1, 141), o = { tile: 2.4, color: [1.0, 0.98, 0.98] };
    for (const sd of [-1, 1]) {
      b.box(sd * (hw + 0.25), 1.6, 0, 0.5, 3.2, 0.5, o);
      b.box(sd * (hw + 0.25), 0.18, 0, 0.9, 0.36, 0.9, o);
      b.at(sd * (hw + 0.25), 3.2, 0, (q) => q.cone(0.34, 0.8, 4, { tile: 2, color: [1.1, 1.06, 1.0] }));
    }
    b.box(0, 3.1, 0, 2 * hw + 0.5, 0.3, 0.4, o);
    rig.mesh(b, mStone, null, { name: 'posts' });
    const n = litBuilder(1, 142);
    n.quad([-hw, 0.1, 0.1], [hw, 0.1, 0.1], [hw, 3.0, 0.1], [-hw, 3.0, 0.1], { uv: [0, 0, hw / 1.6, 1.8], color: [0.5, 0.5, 0.5], double: true });
    rig.mesh(n, mNet, null, { name: 'net', order: 9 });
    const g = litBuilder(1, 143);
    g.quad([-hw, 0.1, -0.3], [hw, 0.1, -0.3], [hw, 0.35, -0.3], [-hw, 0.35, -0.3], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5], double: true });
    rig.mesh(g, mGlow, null, { name: 'line', order: 9 });
  }
  const st = { flash: 0, t: 0 };
  const apply = () => { const e = lift(), day = 1 - 0.3 * U.uDay.value; setMul(mStone, [e, e, e]); setAlpha(mNet, (0.28 + 0.6 * st.flash) * day); tint(mNet, look.glow, 1 + st.flash); setAlpha(mGlow, (0.35 + 0.6 * st.flash) * day); tint(mGlow, look.glow); };
  apply();
  return { ...done(rig, anchors, { radius: hw + 0.6, height: 3.5, poses: { still: {} } }), flash(k) { st.flash = clamp(k ?? 1); }, update(dt) { st.t += dt; st.flash = Math.max(0, st.flash - dt * 1.4); apply(); } };
}

export function createTrialCourt(assets, opts = {}) {
  const look = lookOf(opts), rig = new Rig(assets), anchors = {}, hw = opts.hw ?? 6.5, hl = opts.hl ?? 11, gw = opts.goalHW ?? 2.4;
  const mLine = rig.glow(null, { double: true }), mRing = rig.glow('rune_ring', { decal: true });
  {
    // The court is told by thin dashed lines and a rune ring, nothing more: it used to have a tinted floor quad and solid white borders and goal-crease slab, a flat rectangle with straight edges
    // laid on the snow (a block of glass with outlines), however the ground below was drawn. Dashes read as chalk, and there is no surface to have an edge.
    const y = 0.07, w = 0.09, dash = 1.1, gap = 1.1;
    const b = litBuilder(1, 151);
    const strip = (x0, z0, x1, z1) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / (dash + gap))), step = L / n, d = Math.min(dash, step * 0.55) / L;
      for (let k = 0; k < n; k++) {
        const t0 = (k + 0.5) / n - d / 2, t1 = (k + 0.5) / n + d / 2;
        const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0, bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
        const l = Math.hypot(bx - ax, bz - az) || 1, nx = (-(bz - az) / l) * w, nz = ((bx - ax) / l) * w;
        b.quad([ax - nx, y, az - nz], [bx - nx, y, bz - nz], [bx + nx, y, bz + nz], [ax + nx, y, az + nz], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5], double: true });
      }
    };
    // (no chalk on the ground at all, in the end: any line laid on snow or ice read as a white outline; the goal posts, the goalie and the ring say where the court is)
    void strip;
    const r = litBuilder(1, 153);
    flatDisc(r, 2.2, 0.08, 16);
    rig.mesh(r, mRing, null, { name: 'ring' });
  }
  const st = { k: 0.4, want: 0.4 };
  const apply = () => { const day = 1 - 0.3 * U.uDay.value; setAlpha(mLine, (0.1 + 0.2 * st.k) * day); tint(mLine, look.glow); setAlpha(mRing, (0.2 + 0.5 * st.k) * day); tint(mRing, look.glow); };
  apply();
  return { ...done(rig, anchors, { radius: Math.max(hw, hl), height: 0.1, poses: { quiet: {} } }), setLit(k) { st.want = clamp(k); }, update(dt) { st.k = damp(st.k, st.want, 4, dt); apply(); } };
}

// ---- the standing stone --------------------------------------------------------------------------------------------------------------------------------------
export function createTrialStone(assets, opts = {}) {
  const look = lookOf(opts), rig = new Rig(assets), anchors = {}, S = opts.big ? 1.5 : 1;
  const mStone = rig.lit(look.stone), mGlow = rig.glow('sun_glow', { double: true }), mRune = rig.glow('rune_ring', { double: true });
  {
    const b = litBuilder(S, 161), o = { tile: 2.4, color: [1.0, 0.98, 0.98] };
    b.lathe([[0.85, 0], [0.85, 0.12], [0.7, 0.5], [0.46, 0.56]], 6, { ...o, rot: 0.2, smooth: false });
    b.at(0, 0.56, 0, (q) => q.cyl(0.46, 0.24, 2.2, 5, { ...o, rot: 0.5 }));
    b.at(0, 2.76, 0, (q) => q.cone(0.28, 0.5, 5, { ...o, rot: 0.5 }));
    rig.mesh(b, mStone, null, { name: 'stone' });
    const r = litBuilder(S, 162);
    r.quad([-0.3, 1.2, 0.36], [0.3, 1.2, 0.36], [0.3, 2.0, 0.3], [-0.3, 2.0, 0.3], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] });
    rig.mesh(r, mRune, null, { name: 'rune', order: 9 });
    const g = litBuilder(S, 163);
    cards(g, 0, 1.7, 0, 1.2);
    rig.mesh(g, mGlow, null, { name: 'halo', order: 9 });
  }
  const st = { k: 0, want: 0, t: 0, phase: (opts.seed ?? 0) * 0.9 };
  const apply = () => { const e = lift(), day = 1 - 0.3 * U.uDay.value, pulse = 0.5 + 0.5 * Math.sin(st.t * 2.6 + st.phase); setMul(mStone, [e, e, e]); setAlpha(mRune, (0.2 + st.k * 0.75) * day); tint(mRune, look.glow); setAlpha(mGlow, st.k * (0.35 + 0.2 * pulse) * day); tint(mGlow, look.glow); mGlow.visible = st.k > 0.02; };
  apply();
  return {
    ...done(rig, anchors, { radius: 0.85 * S, height: 3.3 * S, poses: { dark: { lit: 0 }, lit: { lit: 1 } } }),
    setLit(k) { st.want = clamp(k); },
    update(dt, pose) { st.t = pose && pose.t !== undefined ? pose.t : st.t + dt; if (pose && pose.lit !== undefined) st.want = pose.lit; st.k = damp(st.k, st.want, 4, dt); apply(); },
  };
}

void smooth;

// ---- the ring ----------------------------------------------------------------------------------------------------------------------------------------------
/** A hoop of light that hangs in the air over a drop (rings): a flat ring of the realm's metal with eight crystals set in it and a soft membrane of light across it. Its middle is the origin and it faces +z (the view turns it to the way the course runs). opts.r: the hoop's radius (m). */
export function createTrialRing(assets, opts = {}) {
  const look = lookOf(opts), rig = new Rig(assets), anchors = {}, R = (opts.r ?? 3.2) - 0.4;
  const mMetal = rig.lit(look.metal, { double: true }), mCrystal = rig.lit(look.crystal, { double: true }), mGlow = rig.glow('sun_glow', { double: true });
  {
    const b = litBuilder(1, 121), o = { tile: 2.4, color: [1.0, 0.98, 0.98] }, t = 0.26;
    b.at(0, 0, 0, (q) => { q.rotateX(Math.PI / 2); q.lathe([[R + t, -0.2], [R + t, 0.2], [R - t, 0.2], [R - t, -0.2], [R + t, -0.2]], 20, { ...o, rot: 0.1, smooth: false }); });
    rig.mesh(b, mMetal, null, { name: 'hoop' });
    const c = litBuilder(1, 122), n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.2;
      c.at(Math.cos(a) * R, Math.sin(a) * R, 0, (q) => { q.cone(0.34, 0.62, 4, { tile: 2, color: [1, 1, 1] }); q.rotateX(Math.PI); q.cone(0.34, 0.62, 4, { tile: 2, color: [1, 1, 1] }); });
    }
    rig.mesh(c, mCrystal, null, { name: 'studs' });
    const g = litBuilder(1, 123);
    g.at(0, 0, 0, (q) => { q.rotateX(Math.PI / 2); flatDisc(q, R * 0.98, 0, 20); });                          // (the membrane: a disc across the hoop)
    cards(g, 0, 0, 0, R * 1.35, 2, R * 1.35);                                                                  // (and a halo that reads from afar, from every side)
    rig.mesh(g, mGlow, null, { name: 'light', order: 9 });
  }
  const st = { k: 0.3, want: 0.3, col: look.glow, flash: 0, t: 0, phase: (opts.seed ?? 0) * 0.9, state: 'off' };
  const apply = () => {
    const e = lift(), day = 1 - 0.3 * U.uDay.value, pulse = 0.5 + 0.5 * Math.sin(st.t * 5 + st.phase);
    const c = st.col, k = st.k + st.flash;
    setMul(mMetal, [e * (0.8 + 0.5 * c[0] * k), e * (0.8 + 0.5 * c[1] * k), e * (0.8 + 0.5 * c[2] * k)]);
    setMul(mCrystal, [e * (0.5 + 1.0 * c[0] * k), e * (0.5 + 1.0 * c[1] * k), e * (0.5 + 1.0 * c[2] * k)]);
    setAlpha(mGlow, (0.05 + k * (st.state === 'next' ? 0.5 + 0.3 * pulse : 0.3)) * day); tint(mGlow, c); mGlow.visible = st.k + st.flash > 0.04;
  };
  apply();
  return {
    ...done(rig, anchors, { radius: R + 0.4, height: 2 * R, poses: { off: { state: 'off' }, next: { state: 'next' }, done: { state: 'done' }, missed: { state: 'missed' } } }),
    setState(s) { st.state = s; st.want = s === 'next' ? 1 : s === 'done' ? 0.55 : s === 'missed' ? 0.05 : 0.28; st.col = s === 'done' ? GOLD : look.glow; },
    pass() { st.flash = 1; },
    update(dt, pose) {
      st.t = pose && pose.t !== undefined ? pose.t : st.t + dt;
      if (pose && pose.state) this.setState(pose.state);
      st.k = damp(st.k, st.want, 9, dt); st.flash = Math.max(0, st.flash - dt * 2.4); apply();
    },
  };
}
