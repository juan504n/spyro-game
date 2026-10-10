// DRIFTER: the glass jellyfish of Tideglass Reach (foes/drift.js). A bell of pale teal glass, 1.1 m across, with a core of light in it that beats like a heart and four long ribbon-tentacles that hang
// and sway; a fringe of short ones round the rim. When it gathers to pulse the core flares white and the rim lights; when it pulses the bell snaps shut and opens again.
// Faces +z, origin at the middle of the bell (the foe floats: the tentacles hang 1.5 m under it).
// Pose contract (all optional): { speed (it drifts), glow 0..1 (gathering), pulse 0/1 (just pulsed), stun, alert, hurt 0..1, dead 0..1, t }
import { U } from '../../../engine/materials.js';
import { Rig, ellipsoid, spike, bar, triF, setBias, clamp, heal, lerp, sstep, damp, mix3, TAU, nextSeed, seeded } from './rig.js';

const GLASS = [0.62, 0.86, 0.86], GLASS_HI = [0.86, 1.0, 0.98], GLASS_LO = [0.34, 0.6, 0.66], RIB = [0.5, 0.78, 0.82], CORE = [0.5, 0.95, 1.0], CORE_HI = [1.0, 1.0, 1.0], RIM = [0.3, 0.9, 0.9];

function bellGeo(b) {                                   // (a dome: the rim at y = -0.15, the top at y = 0.55)
  setBias(0.45);
  b.lathe([[0.62, -0.15], [0.6, 0.02], [0.52, 0.22], [0.36, 0.42], [0.16, 0.53], [0.0, 0.56]], 10, { color: (x, y) => mix3(GLASS_LO, GLASS_HI, clamp((y + 0.15) / 0.7)) });
  for (let i = 0; i < 8; i++) {                         // ribs up the bell
    const a = (i / 8) * TAU;
    bar(b, [Math.cos(a) * 0.61, -0.12, Math.sin(a) * 0.61], [Math.cos(a) * 0.1, 0.55, Math.sin(a) * 0.1], 0.03, 0.02, RIB, { segs: 3 });
  }
}
function coreGeo(b) {                                   // (unlit: the heart of light in the bell)
  ellipsoid(b, 0, 0.18, 0, 0.26, 0.22, 0.26, { segs: 8, rings: 4, col: (th) => mix3(CORE, CORE_HI, 0.5 + 0.5 * Math.sin(th)) });
}
function rimGeo(b) {                                    // (unlit: a thin ring of light round the rim)
  const n = 14, r = 0.62;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
    const p = (a, rr, y) => [Math.cos(a) * rr, y, Math.sin(a) * rr];
    b.tri(p(a0, r, -0.15), p(a1, r, -0.15), p(a0, r - 0.07, -0.19), [0, 0], [0, 0], [0, 0], { tints: [RIM, RIM, RIM] });
    b.tri(p(a1, r, -0.15), p(a1, r - 0.07, -0.19), p(a0, r - 0.07, -0.19), [0, 0], [0, 0], [0, 0], { tints: [RIM, RIM, RIM] });
  }
}
const SEGS = 4, SEG_LEN = 0.38;
function ribbonGeo(b) {                                 // (one tentacle segment: a thin flat ribbon hanging from the origin down)
  setBias(0.3);
  bar(b, [0, 0, 0], [0, -SEG_LEN, 0], 0.045, 0.035, GLASS, { segs: 4 });
}

export function createDrifter(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets, 'drifter');
  const M = R.litMat(null), G = R.glowMat(null);
  const rnd = seeded(nextSeed(opts));
  const bell = R.pivot(R.rig, 0, 0, 0, 'bell');
  R.part(bell, M, bellGeo, 'bell');
  const core = R.pivot(bell, 0, 0, 0, 'core');
  R.part(core, G, coreGeo, 'core', true);
  const GR = R.glowMat(null);
  R.part(bell, GR, rimGeo, 'rim', true);
  const tentacles = [];
  const mk = (ang, rad, n, len) => {
    const root = R.pivot(bell, Math.cos(ang) * rad, -0.15, Math.sin(ang) * rad, 'tent');
    const chain = []; let parent = root;
    for (let i = 0; i < n; i++) {
      const seg = R.pivot(parent, 0, i === 0 ? 0 : -SEG_LEN * len, 0, 'seg');
      if (len !== 1) seg.scale.setScalar(1);
      R.part(seg, M, ribbonGeo, 'ribbon');
      chain.push(seg); parent = seg;
    }
    tentacles.push({ root, chain, ph: rnd() * TAU, ang });
  };
  for (let i = 0; i < 4; i++) mk((i / 4) * TAU + 0.4, 0.34, SEGS, 1);
  for (let i = 0; i < 8; i++) mk((i / 8) * TAU, 0.58, 2, 1);
  const S = { time: rnd() * 10, move: 0, glow: 0, pulse: 0, stun: 0, hurt: 0 };
  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt, 0, 0.1);
    heal(S);
    const dead = clamp(pose.dead || 0);
    S.time += dt;
    S.move = damp(S.move, sstep(0.3, 3, clamp(pose.speed, 0, 12)), 8, dt);
    S.glow = damp(S.glow, clamp(pose.glow || 0), 12, dt);
    S.pulse = damp(S.pulse, clamp(pose.pulse || 0), 16, dt);
    S.stun = damp(S.stun, clamp(pose.stun || 0), 10, dt);
    S.hurt = damp(S.hurt, clamp(pose.hurt || 0), 30, dt);
    const t = S.time;
    // the bell beats: it squeezes and opens (faster when it drifts, once hard when it pulses, trembling when it gathers)
    const beat = Math.sin(t * (2.2 + 2 * S.move)) * 0.5 + 0.5;
    const sq = 0.06 * beat + 0.2 * S.pulse + 0.02 * Math.sin(t * 40) * S.glow;
    bell.scale.set(1 + sq * 0.8, 1 - sq, 1 + sq * 0.8);
    bell.rotation.z = Math.sin(t * 1.3) * 0.06 + 0.1 * S.stun * Math.sin(t * 12);
    // the tentacles trail behind the beat: each segment swings a little more than the one above it
    for (const T of tentacles) {
      T.chain.forEach((seg, i) => { seg.rotation.z = Math.sin(t * 2.4 - i * 0.9 + T.ph) * (0.18 + 0.08 * i) + 0.2 * sq * (i + 1); seg.rotation.x = Math.cos(t * 2.1 - i * 0.8 + T.ph) * 0.16; });
    }
    // light: the core beats, flares as it gathers and flashes on the pulse; the rim lights with it
    const l = 0.62 + 0.25 * Math.sin(t * 4.4) + 0.65 * S.glow + 0.5 * S.pulse;
    G.uniforms.uColorMul.value.setRGB(l * (1 - 0.3 * S.glow), l, l);
    const r = 0.3 + 0.9 * S.glow + 0.8 * S.pulse;
    GR.uniforms.uColorMul.value.setRGB(r, r, r);
    core.scale.setScalar(1 + 0.35 * S.glow + 0.15 * Math.sin(t * 4.4));
    if (dead > 0) { const k = sstep(0, 1, dead), sc = Math.max(0.0001, 1 - k * k); R.rig.scale.setScalar(sc); R.rig.rotation.y = k * 10; } else { R.rig.scale.setScalar(1); R.rig.rotation.y = 0; }
    R.rig.visible = dead < 1;
    if (pose.flash !== undefined) R.flash(clamp(pose.flash, 0, 1));
    const boost = lerp(1.25, 1.1, clamp(U.uDay.value));
    if (Math.abs(boost - (S.boost ?? -1)) > 0.004) { S.boost = boost; R.boost(boost); }
  }
  const top = R.pivot(R.rig, 0, 0.9, 0, 'top');
  return {
    root: R.root, radius: 0.7, height: 2.2,
    anchors: { eyes: core, top },
    testPoses: { idle: {}, drift: { speed: 3 }, glow: { glow: 1 }, pulse: { pulse: 1, glow: 0.2 }, stun: { stun: 1 } },
    update, flash: (k) => R.flash(k), dispose: () => R.dispose(), variant: 'drifter',
    get triangleCount() { return R.triangleCount; },
  };
}
