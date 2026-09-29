// BUNNY: cute round cream/grey fodder critter — long ears, cotton tail, pink nose. The game moves the root along the
// hop arc; this model animates squash, ears, legs and paws from the hop phase.
//
// Pose contract (all optional): { hop 0..1 (phase of one hop arc), speed, alarm 0..1 (sits up, ears straight, twitch),
//   burn 0..1 (singed: sooty tint, panicked wobble), t }
import { U } from '../../../engine/materials.js';
import {
  Rig, loft, ellipsoid, triC, triF, setBias,
  clamp, lerp, sstep, damp, mix3, TAU, nextSeed, seeded,
} from './rig.js';

const FUR = [0.86, 0.78, 0.68];
const FUR_HI = [0.95, 0.90, 0.82];
const FUR_LO = [0.68, 0.58, 0.50];
const BELLY = [0.98, 0.94, 0.88];
const EAR_OUT = [0.74, 0.64, 0.56];
const EAR_IN = [0.98, 0.66, 0.70];
const NOSE = [0.98, 0.45, 0.56];
const WHITE = [1, 1, 1];
const EYE = [0.06, 0.04, 0.07];

const fur = (th, i) => {
  const s = Math.sin(th);
  return mix3(mix3(FUR, FUR_HI, sstep(0.3, 0.95, s)), BELLY, sstep(-0.3, -0.9, s));
};

function bodyGeo(b) {
  setBias(0.4);
  ellipsoid(b, 0, 0, 0, 0.21, 0.19, 0.25, { segs: 7, rings: 3, col: fur });
}

function headGeo(b) {
  setBias(0.4);
  b.push().translate(0, 0.0, 0.0);
  ellipsoid(b, 0, 0.02, 0.03, 0.155, 0.14, 0.16, { segs: 7, rings: 3, col: fur });
  b.pop();
  // cheek puffs: not separate geometry — the head is squat and wide
  // nose (pink diamond at the front of the snout)
  setBias(0);
  const nz = 0.19, ny = 0.005;
  const n = [0, 0.1, 1];
  triC(b, [-0.035, ny, nz], [0, ny - 0.03, nz + 0.005], [0.035, ny, nz], NOSE, NOSE, NOSE, n, n, n);
  triC(b, [-0.035, ny, nz], [0.035, ny, nz], [0, ny + 0.028, nz], NOSE, NOSE, NOSE, n, n, n);
  // eyes (dark quads, slightly outward-facing)
  for (const s of [1, -1]) {
    const c = [s * 0.095, 0.05, 0.135];
    const w = 0.03, h = 0.045;
    const nn = [s * 0.5, 0, 0.85];
    triC(b, [c[0] - w, c[1] - h, c[2]], [c[0] + w, c[1] - h, c[2] + 0.005], [c[0] + w, c[1] + h, c[2] + 0.005], EYE, EYE, EYE, nn, nn, nn);
    triC(b, [c[0] - w, c[1] - h, c[2]], [c[0] + w, c[1] + h, c[2] + 0.005], [c[0] - w, c[1] + h, c[2]], EYE, EYE, EYE, nn, nn, nn);
  }
}

function earGeo(b) {
  // ear pivot at its base; the ear points along +y
  setBias(0.5);
  b.push().rotateX(-Math.PI / 2);      // loft +z -> up, loft -y -> forward (+z): the ear's front face is the ring's -y side
  const ec = (th) => (Math.sin(th) < -0.9 ? EAR_IN : EAR_OUT);
  loft(b, [
    { z: 0.0, rx: 0.058, ry: 0.03, col: ec },
    { z: 0.17, rx: 0.066, ry: 0.03, col: ec },
    { z: 0.33, rx: 0, ry: 0, y: 0.0, col: EAR_OUT },
  ], { segs: 4, rot: Math.PI / 2 });
  b.pop();
}

function footGeo(b) {
  setBias(0.4);
  ellipsoid(b, 0, 0.0, 0.07, 0.065, 0.05, 0.14, { segs: 5, rings: 2, col: (th) => mix3(FUR, FUR_HI, 0.5) });
}

function pawGeo(b) {
  setBias(0.4);
  ellipsoid(b, 0, -0.04, 0.03, 0.05, 0.06, 0.07, { segs: 4, rings: 2, col: FUR_HI });
}

function tailGeo(b) {
  setBias(0.4);
  ellipsoid(b, 0, 0, -0.03, 0.085, 0.085, 0.085, { segs: 5, rings: 2, col: WHITE });
}

export function createBunny(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets);
  const M = R.litMat(null);
  const seed = nextSeed(opts);
  const rnd = seeded(seed);

  const hip = R.pivot(R.rig, 0, 0.17, -0.10, 'hip');       // sits-up pivot
  const body = R.pivot(hip, 0, 0.03, 0.10, 'body');
  R.part(body, M, bodyGeo, 'body');
  const head = R.pivot(body, 0, 0.14, 0.20, 'head');
  R.part(head, M, headGeo, 'head');
  const ears = [1, -1].map((s) => {
    const p = R.pivot(head, s * 0.07, 0.11, -0.02, s > 0 ? 'earL' : 'earR');
    p.rotation.order = 'ZXY';
    R.part(p, M, earGeo, 'ear');
    return p;
  });
  const tail = R.pivot(body, 0, 0.0, -0.25, 'tail');
  R.part(tail, M, tailGeo, 'tail');
  const paws = [1, -1].map((s) => {
    const p = R.pivot(body, s * 0.10, -0.12, 0.17, s > 0 ? 'pawL' : 'pawR');
    R.part(p, M, pawGeo, 'paw');
    return p;
  });
  const feet = [1, -1].map((s) => {
    const p = R.pivot(R.rig, s * 0.13, 0.055, -0.12, s > 0 ? 'footL' : 'footR');
    R.part(p, M, footGeo, 'foot');
    return p;
  });
  const anchor = R.pivot(R.rig, 0, 0.5, 0, 'top');
  const mouth = R.pivot(head, 0, 0, 0.2, 'nose');
  R.boost(1.1, 1.1, 1.1);

  const S = {
    time: rnd() * 20, alarm: 0, burn: 0, hopSm: 0, blinkT: 1 + rnd() * 3, blink: 0, earFlick: 3 + rnd() * 4, flickL: 0, flickSide: 1,
    twitchT: 2 + rnd() * 2, twitch: 0, boost: -1, hopPrev: 0,
  };

  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt || 0, 0, 0.1);
    const hopIn = pose.hop || 0;
    const alarmT = clamp(pose.alarm || 0, 0, 1);
    const burnT = clamp(pose.burn || 0, 0, 1);
    S.time += dt;
    const boost = lerp(1.25, 1.0, clamp(U.uDay.value));
    if (Math.abs(boost - S.boost) > 0.004) { S.boost = boost; R.boost(boost); }
    S.alarm = damp(S.alarm, alarmT, 14, dt);
    S.burn = damp(S.burn, burnT, 12, dt);
    const alarm = S.alarm, burn = S.burn;
    const t = S.time;
    const hopping = hopIn > 0 && hopIn < 1;
    S.hopSm = damp(S.hopSm, hopping ? 1 : 0, 30, dt);
    const u = clamp(hopIn, 0, 1);
    const hopW = S.hopSm;

    // phase envelopes of the hop
    const crouch = sstep(0.0, 0.16, u) * (1 - sstep(0.16, 0.30, u));
    const air = sstep(0.14, 0.3, u) * (1 - sstep(0.76, 0.9, u));
    const land = sstep(0.76, 0.88, u) * (1 - sstep(0.88, 1.0, u));
    const stretch = air;

    // idle life
    const calm = (1 - hopW) * (1 - alarm) * (1 - burn);
    const breath = Math.sin(t * 2.6);
    S.twitchT -= dt;
    if (S.twitchT <= 0) { S.twitchT = 1.5 + rnd() * 3; S.twitch = 0.6; }
    S.twitch = Math.max(0, S.twitch - dt);
    const nose = Math.sin(t * 26) * (S.twitch > 0 ? 1 : 0) * 0.5 + Math.sin(t * 9) * 0.05;
    S.earFlick -= dt;
    if (S.earFlick <= 0) { S.earFlick = 3 + rnd() * 5; S.flickL = 0.35; S.flickSide = rnd() < 0.5 ? 1 : -1; }
    S.flickL = Math.max(0, S.flickL - dt);
    const flick = Math.sin((1 - S.flickL / 0.35) * Math.PI * 2) * (S.flickL > 0 ? 1 : 0);
    S.blinkT -= dt;
    if (S.blinkT <= 0) { S.blink = 0.14; S.blinkT = 3 + rnd() * 3; }
    let blinkOpen = 1;
    if (S.blink > 0) { S.blink -= dt; blinkOpen = 0.12 + 0.88 * Math.abs(1 - S.blink / 0.07); blinkOpen = clamp(blinkOpen, 0.12, 1); }

    // ---- body -------------------------------------------------------------------------------------------------------
    const panic = burn;
    const shakeZ = Math.sin(t * 34) * 0.22 * panic;
    const shakeY = Math.abs(Math.sin(t * 22)) * 0.05 * panic;
    const sy = 1 - 0.22 * crouch - 0.20 * land + 0.12 * stretch + 0.03 * breath * calm - 0.10 * alarm;
    const sz = 1 + 0.14 * stretch + 0.08 * crouch + 0.06 * land - 0.05 * alarm;
    const sx = 1 + 0.10 * (crouch + land) - 0.05 * stretch + 0.02 * breath * calm;
    body.scale.set(sx, sy, sz);
    // sitting up: pitch about the hips, nose up (negative x rotation lifts +z)
    const pitch = -1.05 * alarm + (-0.30 * air + 0.15 * land + 0.10 * crouch) * hopW + 0.06 * Math.sin(t * 40) * alarm * 0.3;
    hip.rotation.set(pitch, 0, shakeZ);
    hip.position.set(0, 0.17 + 0.12 * alarm + shakeY + 0.02 * air - 0.03 * (crouch + land) * hopW, -0.10 + 0.04 * alarm);
    R.rig.rotation.z = 0;
    // head: nose twitch / look up when sitting up
    head.rotation.set(0.55 * alarm + nose * 0.07 + 0.2 * land * hopW - 0.15 * air, Math.sin(t * 0.6) * 0.12 * calm + Math.sin(t * 25) * 0.12 * alarm * (S.twitch > 0 ? 1 : 0.4), Math.sin(t * 18) * 0.1 * panic);
    head.position.set(0, 0.14, 0.20);

    // ears: relaxed lean-back when idle, erect when alarmed, streaming back in the air, flopping on landing
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const relaxed = 0.30 * (1 - alarm);
      const flap = Math.sin(t * 30 + i * 1.7) * 0.5 * panic + Math.sin(t * 20 + i) * 0.06 * alarm;
      const fl = (S.flickSide === side ? flick : 0) * 0.35 * calm;
      ears[i].rotation.set(
        relaxed + 0.95 * air * hopW + 0.5 * crouch * hopW - 0.55 * land * hopW + 0.05 * breath * calm - 0.10 * alarm,
        0,
        side * (-0.22 - 0.10 * alarm + 0.25 * air * hopW) + fl + flap * side,
      );
    }
    // tail
    tail.rotation.set(-0.3 * alarm + 0.35 * air, Math.sin(t * 3.2) * 0.25 * calm + Math.sin(t * 30) * 0.5 * panic, 0);
    // front paws tuck up when sitting, reach forward in the air
    for (let i = 0; i < 2; i++) {
      paws[i].rotation.set(-1.3 * alarm - 0.9 * air * hopW + 0.4 * land * hopW + Math.sin(t * 35 + i) * 0.5 * panic, 0, 0);
    }
    // hind feet: stretch back in the air, plant on landing, drum when burning
    for (let i = 0; i < 2; i++) {
      feet[i].rotation.set(0.95 * air * hopW - 0.15 * crouch * hopW + Math.sin(t * 40 + i * Math.PI) * 0.7 * panic, 0, 0);
      feet[i].position.set(feet[i].position.x, 0.055 + 0.03 * air * hopW + 0.04 * Math.abs(Math.sin(t * 40 + i * Math.PI)) * panic, -0.12 + 0.02 * alarm);
    }
    // eyes are part of the head mesh: emulate a blink with a tiny head squash
    head.scale.set(1, 1 - (1 - blinkOpen) * 0.06, 1);

    // burn: sooty tint, singed
    const sooty = 1 - 0.68 * burn;
    R.tint(sooty, sooty * 0.92, sooty * 0.88);

    if (pose.flash !== undefined) R.flash(clamp(pose.flash, 0, 1));
  }

  const testPoses = {
    idle: {},
    hop: (t) => ({ hop: (t % 0.85) / 0.85, t }),
    alarm: { alarm: 1 },
    burn: { burn: 1 },
  };

  return {
    root: R.root,
    radius: 0.35,
    height: 0.8,
    anchors: { top: anchor, nose: mouth },
    testPoses,
    update,
    flash: (k) => R.flash(k),
    dispose: () => R.dispose(),
    get triangleCount() { return R.triangleCount; },
  };
}
