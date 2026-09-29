// SPYRO-STYLE HERO: a small purple dragon (original design) — big friendly head, short horns, stubby legs, small wings.
//
// Rig (all pivots procedural, no skinning):
//   root > rig (squash / tumble / hop)
//     > body (torso; pitch / roll / bob)
//         > head (neck joint)  > jaw, eyes, [anchors.mouth]
//         > wingL / wingR (shoulder pivots, mirrored group for the right side)
//         > tail1 > tail2 > tail3 > tail4 (spade)
//         > legFL / legFR / legHL / legHR
//         > [anchors.back]
//
// Pose contract (all optional): { speed 0..24, grounded = true, vy, glide, charge, flame, turn -1..1, hurt 0..1,
//   land 0..1, dead, cheer, look -1..1, t, flash 0..1 (extra: drives the hit flash directly, for the dev viewer) }
import * as THREE from 'three';
import { U } from '../../../engine/materials.js';
import {
  Rig, loft, ellipsoid, spike, bar, orient, triF, triDouble, triC, setBias, ringPoint,
  clamp, lerp, sstep, damp, mix3, TAU, nextSeed, seeded,
} from './rig.js';

// ---- palette (raw albedo tints) -------------------------------------------------------------------------------------
const PUR = [0.55, 0.25, 0.80];
const PUR_HI = [0.68, 0.40, 0.95];
const PUR_LO = [0.40, 0.18, 0.66];
const CREAM = [1.0, 0.88, 0.58];
const CREAM_LO = [0.95, 0.72, 0.40];
const GOLD = [1.0, 0.72, 0.18];
const GOLD_HI = [1.0, 0.88, 0.40];
const GOLD_LO = [0.88, 0.50, 0.10];
const MOUTH = [0.62, 0.16, 0.26];
const TONGUE = [0.94, 0.38, 0.46];
const WHITE = [1, 1, 1];
const BLACK = [0.05, 0.03, 0.09];

const BODY_Y = 0.45;
const HEAD_AT = [0, 0.15, 0.40];          // neck joint in body space
const TAIL_AT = [0, -0.02, -0.42];
const TAIL_LEN = [0.20, 0.19, 0.17];
const SHOULDER = [0.12, 0.19, 0.10];
const LEG_L = 0.27;

const skin = (th, i) => {
  const s = Math.sin(th);
  const w = sstep(-0.3, -0.8, s);                      // belly weight
  const hi = sstep(0.2, 0.95, s);                      // back highlight
  const base = mix3(PUR, PUR_HI, hi);
  return mix3(base, i % 2 ? CREAM : CREAM_LO, w);
};

// head loft (head space: pivot at the neck joint, +z forward)
const headCol = (th, i) => {
  const s = Math.sin(th);
  const hi = sstep(0.15, 0.95, s);
  let c = mix3(PUR, PUR_HI, hi);
  if (i >= 4) {                                      // muzzle: cream lips underneath, red roof of the mouth at the very bottom
    c = mix3(c, CREAM, sstep(-0.3, -0.75, s));
    c = mix3(c, MOUTH, sstep(-0.9, -1.0, s));
  } else c = mix3(c, CREAM, sstep(-0.45, -0.9, s));
  return c;
};
const HS = 1.06;   // head pivot scale (the whole head group is built at 1.0 and scaled once)
const HEAD = [
  { z: -0.16, rx: 0, ry: 0, y: 0.13, col: PUR },
  { z: -0.05, rx: 0.24, ry: 0.22, y: 0.13, col: headCol },
  { z: 0.10, rx: 0.39, ry: 0.30, y: 0.13, col: headCol },
  { z: 0.26, rx: 0.34, ry: 0.27, y: 0.11, col: headCol },
  { z: 0.40, rx: 0.25, ry: 0.165, y: 0.085, col: headCol },
  { z: 0.53, rx: 0.205, ry: 0.13, y: 0.058, col: headCol },
  { z: 0.61, rx: 0.165, ry: 0.108, y: 0.046, col: headCol },
  { z: 0.665, rx: 0.10, ry: 0.068, y: 0.042, col: headCol },
];
const EYE_AT = ringPoint(HEAD, 0.325, 0.62, -0.05);   // eye centre, sunk into the cranium shoulder

// ---- geometry ---------------------------------------------------------------------------------------------------------
function torsoGeo(b) {
  setBias(0.45);
  loft(b, [
    { z: -0.50, rx: 0, ry: 0, y: -0.02, col: PUR },
    { z: -0.34, rx: 0.18, ry: 0.18, y: -0.01, col: skin },
    { z: -0.12, rx: 0.28, ry: 0.265, y: 0.0, col: skin },
    { z: 0.14, rx: 0.31, ry: 0.275, y: 0.0, col: skin },
    { z: 0.34, rx: 0.26, ry: 0.245, y: 0.01, col: skin },
    { z: 0.48, rx: 0, ry: 0, y: 0.02, col: PUR },
  ], { segs: 8 });
  setBias(0.9);
  // dorsal ridge (small gold spines on the rump)
  spike(b, [0, 0.245, -0.18], [0, 0.6, -0.8], 0.12, 0.05, { segs: 3, col: GOLD, tip: GOLD_HI });
  spike(b, [0, 0.20, -0.38], [0, 0.5, -0.86], 0.10, 0.045, { segs: 3, col: GOLD, tip: GOLD_HI });
}

function headGeo(b) {
  setBias(0.45);
  loft(b, HEAD, { segs: 8, cap1: true, capCol: mix3(PUR, PUR_HI, 0.5) });
  // horns: short, swept back with a forward-curving tip (they point ahead when the head is lowered)
  setBias(0.9);
  for (const s of [1, -1]) {
    b.push().translate(s * 0.175, 0.37, 0.0);
    orient(b, [s * 0.16, 0.72, -0.68], [0, 1, 0]);
    loft(b, [
      { z: 0.00, rx: 0.115, ry: 0.115, col: GOLD_LO },
      { z: 0.14, rx: 0.075, ry: 0.075, y: 0.028, col: GOLD },
      { z: 0.27, rx: 0, ry: 0, y: 0.095, col: GOLD_HI },
    ], { segs: 5 });
    b.pop();
  }
  // crest / frill at the back of the head
  spike(b, [0, 0.385, -0.06], [0, 0.55, -0.83], 0.16, 0.065, { segs: 4, col: GOLD, tip: GOLD_HI });
  spike(b, [0, 0.30, -0.15], [0, 0.32, -0.95], 0.14, 0.06, { segs: 4, col: GOLD, tip: GOLD_HI });
  spike(b, [0, 0.19, -0.19], [0, 0.05, -1.0], 0.12, 0.055, { segs: 4, col: GOLD, tip: GOLD_HI });
  // cheek frills (behind the jaw corner)
  for (const s of [1, -1]) {
    spike(b, [s * 0.34, 0.03, 0.06], [s * 0.72, 0.12, -0.68], 0.16, 0.065, { segs: 3, col: GOLD, tip: GOLD_HI });
    spike(b, [s * 0.32, -0.07, 0.10], [s * 0.66, -0.10, -0.74], 0.12, 0.055, { segs: 3, col: GOLD, tip: GOLD_HI });
  }
  // nostrils on the flat nose face
  setBias(0);
  const nz = HEAD[HEAD.length - 1].z + 0.004, ny = HEAD[HEAD.length - 1].y + 0.02;
  for (const s of [1, -1]) {
    const cx = s * 0.042, w = 0.024, h = 0.017;
    const n = [0, 0, 1];
    triC(b, [cx - w, ny, nz], [cx, ny - h, nz], [cx + w, ny, nz], BLACK, BLACK, BLACK, n, n, n);
    triC(b, [cx - w, ny, nz], [cx + w, ny, nz], [cx, ny + h * 0.8, nz], BLACK, BLACK, BLACK, n, n, n);
  }
}

function jawGeo(b) {
  // jaw-local: pivot at the hinge; +z forward
  const js = (th, i) => {
    const s = Math.sin(th);
    if (s > 0.95) return i === 0 ? CREAM : mix3(TONGUE, MOUTH, 0.25);
    return mix3(CREAM, CREAM_LO, sstep(-0.2, -1, s) * 0.4);
  };
  setBias(0.35);
  loft(b, [
    { z: 0.0, rx: 0.145, ry: 0.06, y: 0.0, col: js },
    { z: 0.20, rx: 0.15, ry: 0.055, y: 0.004, col: js },
    { z: 0.40, rx: 0.09, ry: 0.04, y: 0.016, col: js },
    { z: 0.50, rx: 0, ry: 0, y: 0.022, col: CREAM },
  ], { segs: 6, cap0: true, capCol: CREAM, rot: Math.PI / 6 });
}

function eyesGeo(b) {
  for (const s of [1, -1]) {
    b.push().translate(s * EYE_AT[0], EYE_AT[1], EYE_AT[2]).rotateY(s * 0.5);
    ellipsoid(b, 0, 0, 0, 0.125, 0.15, 0.075, { segs: 6, rings: 3, col: WHITE });
    // pupil (hexagon, faces +z) + highlight
    const zp = 0.079;
    const cx = -s * 0.004, cy = 0.004;
    for (let j = 0; j < 6; j++) {
      const a0 = (j / 6) * TAU + 0.5, a1 = ((j + 1) / 6) * TAU + 0.5;
      triF(b, [cx, cy, zp], [cx + Math.cos(a0) * 0.058, cy + Math.sin(a0) * 0.084, zp], [cx + Math.cos(a1) * 0.058, cy + Math.sin(a1) * 0.084, zp], BLACK);
    }
    const hz = zp + 0.006, hx = cx + 0.024, hy = cy + 0.045, hw = 0.024;
    triF(b, [hx - hw, hy - hw, hz], [hx + hw, hy - hw, hz], [hx + hw, hy + hw, hz], WHITE);
    triF(b, [hx - hw, hy - hw, hz], [hx + hw, hy + hw, hz], [hx - hw, hy + hw, hz], WHITE);
    b.pop();
  }
}

function legGeo(b, hind) {
  setBias(0.4);
  b.push().rotateX(Math.PI / 2);      // loft +z -> down, loft +y -> forward
  loft(b, [
    { z: 0.0, rx: hind ? 0.15 : 0.135, ry: hind ? 0.16 : 0.14, y: 0.0, col: PUR },
    { z: LEG_L * 0.55, rx: hind ? 0.115 : 0.105, ry: hind ? 0.125 : 0.115, y: 0.005, col: PUR },
    { z: LEG_L - 0.008, rx: 0.15, ry: 0.20, y: 0.065, col: mix3(PUR, PUR_LO, 0.35) },
  ], { segs: 5, cap1: true, capCol: PUR_LO });
  b.pop();
  setBias(0.9);
  for (const a of [-0.6, 0, 0.6]) {
    spike(b, [Math.sin(a) * 0.09, -LEG_L + 0.06, 0.19 + Math.cos(a) * 0.05], [Math.sin(a) * 0.8, -0.45, Math.cos(a)], 0.095, 0.055, { segs: 3, col: GOLD, tip: GOLD_HI });
  }
}

// points on the sole (+ claw tips) in leg space, used to keep the feet out of the ground
function footPoints(hind) {
  const pts = [];
  for (let j = 0; j < 5; j++) {
    const th = (j / 5) * TAU;
    pts.push([0.15 * Math.cos(th), -(LEG_L - 0.008), 0.065 + 0.20 * Math.sin(th)]);
  }
  for (const a of [-0.6, 0, 0.6]) pts.push([Math.sin(a) * 0.09 + Math.sin(a) * 0.8 * 0.095, -LEG_L + 0.06 - 0.45 * 0.095, 0.19 + Math.cos(a) * 0.05 + Math.cos(a) * 0.095]);
  return pts;
}

function tailGeo(b, i) {
  const LEN = TAIL_LEN[i];
  const R0 = [0.15, 0.12, 0.092][i], R1 = [0.12, 0.092, 0.07][i];
  const tc = (th) => {
    const s = Math.sin(th);
    return mix3(mix3(PUR, PUR_HI, sstep(0.3, 0.95, s)), i % 2 ? CREAM : CREAM_LO, sstep(-0.4, -0.85, s));
  };
  setBias(0.45);
  const rings = [
    { z: 0.03, rx: R0, ry: R0 * 0.95, col: tc },
    { z: -LEN, rx: R1, ry: R1 * 0.95, col: tc },
  ];
  if (i === 2) rings.push({ z: -LEN - 0.07, rx: R1 * 0.85, ry: R1 * 0.8, col: PUR_LO });
  loft(b, rings, { segs: 6 });
  setBias(0.9);
  spike(b, [0, R0 * 0.85, -LEN * 0.35], [0, 0.55, -0.83], 0.11 - i * 0.015, 0.05, { segs: 3, col: GOLD, tip: GOLD_HI });
}

function spadeGeo(b) {
  // flat spade (leaf-shaped bipyramid), slightly cupped up so it reads from the side as well
  setBias(0.9);
  const out = [[0, -0.0], [0.14, -0.13], [0, -0.33], [-0.14, -0.13]];
  const top = [0, 0.045, -0.14], bot = [0, -0.045, -0.14];
  for (let i = 0; i < 4; i++) {
    const p = [out[i][0], 0, out[i][1]], q = [out[(i + 1) % 4][0], 0, out[(i + 1) % 4][1]];
    triF(b, p, q, top, i === 0 || i === 3 ? GOLD_LO : GOLD, i === 1 || i === 2 ? GOLD_HI : GOLD_LO, GOLD_HI);
    triF(b, q, p, bot, i === 0 || i === 3 ? GOLD_LO : GOLD, i === 1 || i === 2 ? GOLD_HI : GOLD_LO, GOLD);
  }
}

// wing (left side, +x outward, membrane trails toward -z)
const WS = [0, 0, 0], WE = [0.34, 0.06, 0.04], WT = [0.74, 0.04, -0.14], WF1 = [0.64, 0.0, -0.46], WF2 = [0.40, 0.0, -0.54], WB = [0.06, 0.0, -0.42];
function wingGeo(b) {
  setBias(1.3);
  const mid = (a, c, k = 0.26) => {
    const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
    return [m[0] + (WE[0] - m[0]) * k, m[1] + (WE[1] - m[1]) * k, m[2] + (WE[2] - m[2]) * k];
  };
  const C1 = mid(WT, WF1), C2 = mid(WF1, WF2), C3 = mid(WF2, WB);
  const hub = [0.92, 0.55, 0.12], tipc = [1.0, 0.72, 0.20], notch = [1.0, 0.88, 0.40];
  triDouble(b, WE, WT, C1, hub, tipc, notch);
  triDouble(b, WE, C1, WF1, hub, notch, tipc);
  triDouble(b, WE, WF1, C2, hub, tipc, notch);
  triDouble(b, WE, C2, WF2, hub, notch, tipc);
  triDouble(b, WE, WF2, C3, hub, tipc, notch);
  triDouble(b, WE, C3, WB, hub, notch, tipc);
  triDouble(b, WS, WE, WB, GOLD_LO, hub, tipc);
  // arm bones (purple)
  setBias(0.5);
  bar(b, WS, WE, 0.055, 0.045, PUR, { segs: 4 });
  bar(b, WE, WT, 0.045, 0.03, PUR_HI, { segs: 4, cap1: true });
}

// ---- model ------------------------------------------------------------------------------------------------------------
export function createSpyro(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets);
  const M = R.litMat(null);
  const G = R.glowMat(null);
  const seed = nextSeed(opts);
  const rnd = seeded(seed);

  const body = R.pivot(R.rig, 0, BODY_Y, 0, 'body');
  R.part(body, M, torsoGeo, 'torso');

  const head = R.pivot(body, ...HEAD_AT, 'head');
  head.scale.setScalar(HS);
  R.part(head, M, headGeo, 'skull');
  const jaw = R.pivot(head, 0, -0.075, 0.17, 'jaw');
  R.part(jaw, M, jawGeo, 'jaw');
  const eyes = R.pivot(head, 0, EYE_AT[1], EYE_AT[2], 'eyes');
  // the eye mesh is built around the eyes pivot so blinking scales it about its own centre
  R.part(eyes, G, (b) => { b.translate(0, -EYE_AT[1], -EYE_AT[2]); eyesGeo(b); }, 'eyes', true);
  const mouth = R.pivot(head, 0, 0.0, 0.66, 'mouth');
  const back = R.pivot(body, 0, 0.44, -0.08, 'back');

  // wings
  const wings = [];
  for (const s of [1, -1]) {
    const mirror = R.pivot(body, 0, 0, 0, s > 0 ? 'wingL' : 'wingR');
    mirror.scale.x = s;
    const shoulder = R.pivot(mirror, ...SHOULDER, 'wing');
    shoulder.rotation.order = 'YXZ';
    R.part(shoulder, M, wingGeo, 'wing');
    wings.push(shoulder);
  }

  // tail chain
  const tails = [];
  let par = R.pivot(body, ...TAIL_AT, 'tail1');
  tails.push(par);
  R.part(par, M, (b) => tailGeo(b, 0), 'tail1');
  for (let i = 1; i < 3; i++) {
    const p = R.pivot(par, 0, 0, -TAIL_LEN[i - 1], 'tail' + (i + 1));
    R.part(p, M, (b) => tailGeo(b, i), 'tail' + (i + 1));
    tails.push(p); par = p;
  }
  const t4 = R.pivot(par, 0, 0, -TAIL_LEN[2], 'spade');
  R.part(t4, M, spadeGeo, 'spade');
  tails.push(t4);

  // legs
  const legDefs = [
    { n: 'FL', x: 0.20, y: -0.18, z: 0.23, hind: false, off: 0 },
    { n: 'FR', x: -0.20, y: -0.18, z: 0.23, hind: false, off: Math.PI },
    { n: 'HL', x: 0.21, y: -0.18, z: -0.24, hind: true, off: Math.PI },
    { n: 'HR', x: -0.21, y: -0.18, z: -0.24, hind: true, off: 0 },
  ];
  const legs = legDefs.map((d) => {
    const p = R.pivot(body, d.x, d.y, d.z, 'leg' + d.n);
    R.part(p, M, (b) => legGeo(b, d.hind), 'leg' + d.n);
    return { ...d, p, pts: footPoints(d.hind) };
  });
  const _m0 = new THREE.Matrix4(), _m1 = new THREE.Matrix4(), _v = new THREE.Vector3();

  // ---- animation state -----------------------------------------------------------------------------------------
  const S = {
    time: rnd() * 10, phase: rnd() * TAU, move: 0, run: 0, air: 0, rise: 0, glide: 0, charge: 0, flame: 0, cheer: 0, dead: 0, hurt: 0,
    land: 0, turn: 0, lookYaw: 0, lookPitch: 0, lookTarget: 0, lookPTarget: 0, lookT: 2 + rnd() * 3, blinkT: 1 + rnd() * 2.5, blink: 0,
    flameT: 0, wasFlame: false, tailW: rnd() * 6, spread: 0, breathe: rnd() * 6, boost: -1,
  };

  const easeOutBack = (x) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt || 0, 0, 0.1);
    const speed = Math.max(0, pose.speed || 0);
    const grounded = pose.grounded !== false;
    const vy = pose.vy || 0;
    const dead = !!pose.dead;
    const glideT = !!pose.glide && !grounded && !dead ? 1 : 0;
    const chargeT = !!pose.charge && !dead ? 1 : 0;
    const flameT = !!pose.flame && !dead ? 1 : 0;
    const cheerT = !!pose.cheer && !dead ? 1 : 0;
    const hurt = clamp(pose.hurt || 0, 0, 1);
    const land = clamp(pose.land || 0, 0, 1);
    const turnT = clamp(pose.turn || 0, -1, 1);
    const lookIn = pose.look;

    S.time += dt;
    // "character light": lift the albedo at night so the hero pops (fades out towards daybreak so purple does not go pink)
    const boost = lerp(1.30, 1.0, clamp(U.uDay.value));
    if (Math.abs(boost - S.boost) > 0.004) { S.boost = boost; R.boost(boost); }
    S.move = damp(S.move, sstep(0.25, 2.5, speed) * (grounded ? 1 : 0), 12, dt);
    S.run = damp(S.run, sstep(5, 12, speed), 8, dt);
    S.air = damp(S.air, grounded ? 0 : 1, 16, dt);
    S.rise = damp(S.rise, clamp(vy / 9, -1, 1), 10, dt);
    S.glide = damp(S.glide, glideT, 8, dt);
    S.charge = damp(S.charge, chargeT, 10, dt);
    S.flame = damp(S.flame, flameT, 11, dt);
    S.cheer = damp(S.cheer, cheerT, 9, dt);
    S.dead = damp(S.dead, dead ? 1 : 0, 7, dt);
    S.hurt = damp(S.hurt, hurt, 40, dt);
    S.land = damp(S.land, land, 40, dt);
    S.turn = damp(S.turn, turnT, 9, dt);
    if (flameT && !S.wasFlame) S.flameT = 0;
    S.wasFlame = !!flameT;
    if (flameT) S.flameT += dt;

    const runK = S.run, chargeK = S.charge, airK = S.air, glideK = S.glide, flameK = S.flame, cheerK = S.cheer;
    const deadK = S.dead, hurtK = S.hurt, landK = S.land, rise = S.rise, turn = S.turn;

    // gait phase: stride frequency proportional to speed (capped), faster when charging
    const freq = Math.min(1.5 + speed * 0.24, 3.6) * (1 + 0.25 * chargeK);
    S.phase += TAU * freq * dt * (S.move > 0.02 ? 1 : 0.25);
    const ph = S.phase;
    const gait = S.move * (1 - airK);
    const calm = (1 - gait) * (1 - airK) * (1 - deadK);
    S.breathe += dt * (1.6 + 1.6 * runK);
    const breath = Math.sin(S.breathe);
    S.tailW += dt * (1.7 + 2.2 * gait);

    // ---- eyes: blink + expression ---------------------------------------------------------------------------------
    S.blinkT -= dt;
    if (S.blinkT <= 0) { S.blink = 0.16; S.blinkT = 2.4 + rnd() * 2.6; if (rnd() < 0.18) S.blinkT = 0.35; }
    let blinkOpen = 1;
    if (S.blink > 0) {
      S.blink -= dt;
      const k = 1 - S.blink / 0.16;
      blinkOpen = clamp(k < 0.4 ? 1 - (k / 0.4) * 0.92 : 0.08 + 0.92 * ((k - 0.4) / 0.6), 0.08, 1);
    }
    const squint = clamp(0.32 * chargeK + 0.5 * hurtK + 0.25 * flameK + 0.12 * cheerK + 0.85 * deadK, 0, 0.9);
    eyes.scale.set(1 + 0.06 * hurtK, blinkOpen * (1 - squint) * (1 + 0.05 * airK), 1);

    // ---- head look ------------------------------------------------------------------------------------------------
    S.lookT -= dt;
    if (S.lookT <= 0) {
      S.lookT = 2.5 + rnd() * 3.5;
      S.lookTarget = (rnd() - 0.5) * 1.1;
      S.lookPTarget = (rnd() - 0.5) * 0.25;
    }
    const asked = lookIn !== undefined && Math.abs(lookIn) > 0.02;      // look = 0 (the game's default) means "no request"
    const lookTarget = asked ? clamp(lookIn, -1, 1) * 0.75 : S.lookTarget * calm;
    S.lookYaw = damp(S.lookYaw, lookTarget, 5, dt);
    S.lookPitch = damp(S.lookPitch, asked ? 0 : S.lookPTarget * calm, 4, dt);

    // ---- body ---------------------------------------------------------------------------------------------------
    const recoil = flameK * Math.exp(-S.flameT * 7);
    const bobA = (lerp(0.010, 0.034, runK) + 0.04 * chargeK) * gait;
    const bob = Math.sin(2 * ph + 0.6) * bobA;
    const noseDown = 0.05 * runK + 0.22 * chargeK + 0.27 * glideK - 0.14 * flameK - 0.26 * recoil - 0.16 * airK * (1 - glideK) * rise
      - 0.34 * hurtK - 0.05 * cheerK + 0.16 * landK + 0.02 * Math.sin(2 * ph) * gait;
    const roll = 0.22 * turn * (1 - 0.4 * glideK) + glideK * turn * 0.35 + 0.03 * Math.sin(ph) * gait;
    body.rotation.set(noseDown, 0, roll);
    const shake = hurtK * Math.sin(S.time * 55) * 0.045;
    body.position.set(shake, BODY_Y + bob - 0.03 * chargeK - 0.035 * flameK + 0.006 * breath * calm - 0.03 * landK - 0.03 * airK * glideK,
      -0.15 * recoil - 0.02 * hurtK);
    const chest = 0.018 * breath * calm + 0.07 * flameK * (S.flameT < 0.4 ? 1 - Math.exp(-S.flameT * 6) : 0.6);
    body.scale.set(1 + chest * 0.6, 1 + chest, 1 + chest * 0.6);

    // rig squash (about the ground): landing + hurt + run bounce
    const sq = 0.30 * landK + 0.16 * hurtK;
    R.rig.scale.set(1 + sq * 0.45, 1 - sq, 1 + sq * 0.45);
    const hop = cheerK * Math.abs(Math.sin(S.time * TAU * 1.5)) * 0.32;
    const roll90 = (Math.PI / 2) * easeOutBack(clamp(deadK, 0, 1));
    R.rig.rotation.set(0, 0, -roll90);
    R.rig.position.set(0.36 * Math.sin(roll90), hop + 0.48 * Math.sin(roll90), 0);

    // ---- head + jaw ---------------------------------------------------------------------------------------------
    const headPitch = -noseDown * 0.85 + 0.50 * chargeK - 0.55 * flameK - 0.25 * glideK - 0.22 * cheerK + 0.05 * Math.sin(2 * ph + 1.0) * gait
      - 0.28 * hurtK + 0.1 * landK + S.lookPitch - 0.10 * airK * Math.max(0, rise) + 0.15 * airK * Math.max(0, -rise) - 0.15 * recoil
      - 0.02 * breath * calm;
    head.rotation.set(headPitch, S.lookYaw + 0.30 * turn + shake * 2, -0.06 * S.lookYaw + 0.12 * Math.sin(S.time * 3) * cheerK);
    head.position.set(HEAD_AT[0], HEAD_AT[1] + 0.01 * breath * calm, HEAD_AT[2]);
    const pant = (0.03 + 0.05 * runK) * (0.5 + 0.5 * Math.sin(2 * ph)) * gait;
    jaw.rotation.set(0.015 + pant + 0.62 * flameK + 0.26 * cheerK + 0.20 * hurtK + 0.05 * airK + 0.18 * deadK + 0.12 * glideK, 0, 0);

    // ---- wings ------------------------------------------------------------------------------------------------
    const spreadT = clamp(0.5 * airK * (1 - glideK) * (rise < -0.3 ? 1.1 : 0.85) + glideK + 0.35 * flameK + 0.85 * cheerK + 0.55 * deadK + 0.45 * hurtK, 0, 1);
    S.spread = damp(S.spread, spreadT, 14, dt);
    const sp = S.spread;
    const flutter = Math.sin(S.time * TAU * 5.5) * 0.09 * glideK + Math.sin(S.time * TAU * 3.2) * 0.75 * cheerK * (1 - deadK)
      + Math.sin(S.time * TAU * 2.4) * 0.35 * airK * (1 - glideK) * (rise > 0 ? 0.6 : 1);
    const jiggle = -bob * 5 * (1 - sp) + 0.03 * Math.sin(S.time * 1.3 + 1) * calm;
    for (let i = 0; i < 2; i++) {
      wings[i].rotation.set(lerp(0.95, -0.30, sp), lerp(1.32, 0.30, sp), lerp(0.62, 0.30, sp) + flutter + jiggle + 0.4 * deadK);
      wings[i].scale.setScalar(lerp(0.85, 1.05, sp));
    }

    // ---- tail ---------------------------------------------------------------------------------------------------
    // pitch is cumulative down the chain: idle shape droops then flicks up at the spade; states add a total lift.
    const shapeK = 1 - 0.75 * clamp(gait + chargeK + glideK + flameK);
    const tailTotal = 0.30 * runK * gait + 0.28 * chargeK + 0.55 * flameK + 0.06 * glideK + 0.45 * cheerK + 0.18 * hurtK
      + airK * (1 - glideK) * (rise > 0 ? -0.30 : 0.45);
    const idleShape = [-0.06, -0.10, -0.04, 0.24];
    const wgt = [0.30, 0.30, 0.25, 0.15];
    const ampY = [0.10, 0.16, 0.22, 0.28];
    for (let i = 0; i < 4; i++) {
      const lag = i * 0.85;
      const idleW = Math.sin(S.tailW - lag) * ampY[i] * (0.9 - 0.5 * gait) * (1 - 0.6 * glideK);
      const runW = Math.sin(ph + Math.PI - lag * 0.5) * ampY[i] * 0.55 * gait;
      const cheerW = Math.sin(S.time * TAU * 2.6 - lag) * ampY[i] * 1.6 * cheerK;
      const glideW = Math.sin(S.time * TAU * 3 - lag * 1.2) * ampY[i] * 0.5 * glideK;
      const turnW = -turn * [0.14, 0.2, 0.26, 0.3][i] * (1 + glideK);
      const deadW = 0.5 * deadK * (i + 1) / 4;
      const pitch = idleShape[i] * shapeK + tailTotal * wgt[i]
        + 0.05 * Math.sin(S.tailW * 1.3 - lag) * calm - 0.25 * deadK * wgt[i] * 2 + 0.05 * Math.sin(2 * ph - lag) * gait;
      tails[i].rotation.set(pitch, idleW + runW + cheerW + glideW + turnW + deadW, 0);
    }

    // ---- legs ---------------------------------------------------------------------------------------------------
    const swingA = lerp(0.40, 0.62, runK) * (1 + 0.15 * chargeK);
    for (const L of legs) {
      const th = ph + L.off;
      const swing = (Math.sin(th) * swingA + (L.hind ? 0.0 : lerp(-0.10, -0.16, runK))) * gait;
      const lift = Math.max(0, Math.cos(th)) * gait * lerp(0.035, 0.085, runK);
      const front = !L.hind;
      const airRot = glideK > 0.5 ? (front ? -0.25 : 0.95) : (rise > 0 ? (front ? -0.55 : 0.75) : (front ? -0.75 : 0.45 + 0.1 * Math.sin(S.time * 9)));
      let rx = lerp(swing, airRot, airK);
      if (flameK > 0.01) rx += front ? -0.22 * flameK : 0.12 * flameK;
      if (front) rx += -0.9 * cheerK * (0.5 + 0.5 * Math.sin(S.time * TAU * 1.5 + (L.n === 'FL' ? 0 : 1)));
      const side = L.x > 0 ? 1 : -1;
      const splay = side * (0.22 * landK + 0.45 * deadK + 0.10 * flameK + 0.06 * chargeK);
      L.p.rotation.set(rx - 0.25 * deadK * (front ? 1 : -1), 0, splay);
      L.p.position.set(L.x, L.y + lift * (1 - airK) + 0.03 * airK * glideK - 0.02 * landK, L.z);
    }
    // ground contact: whatever the body does (bob, pitch, squash) the soles never sink below the root's ground plane —
    // the leg telescopes into the body instead (its top is buried in the torso anyway)
    R.rig.updateMatrix(); body.updateMatrix();
    _m0.multiplyMatrices(R.rig.matrix, body.matrix);
    const vs = Math.max(0.3, R.rig.scale.y * body.scale.y);
    for (const L of legs) {
      L.p.updateMatrix();
      _m1.multiplyMatrices(_m0, L.p.matrix);
      let mn = 1e9;
      for (const q of L.pts) { _v.set(q[0], q[1], q[2]).applyMatrix4(_m1); if (_v.y < mn) mn = _v.y; }
      if (mn < 0) L.p.position.y += Math.min(0.30, -mn / vs) * (1 - deadK);
    }

    if (pose.flash !== undefined) R.flash(clamp(pose.flash, 0, 1));
  }

  const testPoses = {
    idle: {},
    walk: { speed: 4 },
    run: { speed: 16 },
    jump: { grounded: false, vy: 7, speed: 6 },
    fall: { grounded: false, vy: -9, speed: 6 },
    glide: { grounded: false, glide: true, vy: -2, speed: 14 },
    charge: { speed: 22, charge: true },
    flame: { flame: true },
    hurt: (t) => { const k = (t % 1.6) / 0.7; const h = k < 1 ? 1 - k : 0; return { hurt: h, flash: h > 0.5 ? 1 : 0, t }; },
    dead: { dead: true },
    cheer: { cheer: true },
    land: (t) => { const k = (t % 1.5) / 0.4; return { land: k < 1 ? 1 - k : 0, t }; },
  };

  return {
    root: R.root,
    radius: 0.55,
    height: 1.05,
    anchors: { mouth, back },
    testPoses,
    update,
    flash: (k) => R.flash(k),
    dispose: () => R.dispose(),
    get triangleCount() { return R.triangleCount; },
  };
}
