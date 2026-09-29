// SPYRO-STYLE HERO: a small purple dragon (original low-poly build, drawn from the classic look of the character).
// Big blocky head on a thick, upright neck; a short muzzle and large forward-facing eyes; long ringed horns; a gold crest;
// maroon wings with golden finger bones; a banded gold chest and belly; longer front legs; paws with pale claws; and a thin
// tail ending in a small orange tip.
//
// Rig (all pivots procedural, no skinning):
//   root > rig (squash / tumble / hop)
//     > body (torso + neck; pitch / roll / bob)
//         > head (neck joint)  > jaw, eyes, [anchors.mouth]
//         > wingL / wingR (shoulder pivots, mirrored group for the right side)
//         > tail1 > tail2 > tail3 > tip
//         > legFL / legFR / legHL / legHR
//         > [anchors.back]
//
// Pose contract (all optional): { speed 0..24, grounded = true, vy, glide, charge, flame, turn -1..1, hurt 0..1,
//   land 0..1, dead, cheer, look -1..1, t, flash 0..1 (extra: drives the hit flash directly, for the dev viewer) }
// Creation options: { seed, still } — `still` switches the idle blink / look-around off (for review renders).
import * as THREE from 'three';
import { U } from '../../../engine/materials.js';
import {
  Rig, loft, ellipsoid, spike, bar, triF, triDouble, setBias,
  clamp, num, heal, lerp, sstep, damp, spring, mix3, TAU, nextSeed, seeded,
} from './rig.js';
import { superRing, meshRings, sweep, blade, spline } from './parts.js';

// ---- palette (raw albedo tints) -------------------------------------------------------------------------------------
const PUR = [0.43, 0.26, 0.70];
const PUR_HI = [0.56, 0.39, 0.85];
const PUR_LO = [0.30, 0.19, 0.52];
const LAV = [0.64, 0.61, 0.90];            // chin, flanks, scale edges
const BELLY = [1.0, 0.90, 0.58];
const BAND = [0.95, 0.70, 0.30];
const GOLD = [1.0, 0.84, 0.20];
const GOLD_HI = [1.0, 0.92, 0.42];
const GOLD_LO = [0.96, 0.68, 0.12];
const HORN_A = [0.80, 0.60, 0.34];
const HORN_B = [0.44, 0.30, 0.16];
const HORN_TIP = [0.98, 0.82, 0.50];
const MEMB = [0.44, 0.08, 0.12];
const MEMB_HI = [0.58, 0.13, 0.15];
const MEMB_LO = [0.30, 0.06, 0.09];
const BONE = [0.92, 0.62, 0.16];
const BONE_HI = [1.0, 0.82, 0.36];
const MOUTH = [0.55, 0.13, 0.20];
const TONGUE = [0.92, 0.36, 0.44];
const CLAW = [0.84, 0.80, 1.0];
const WHITE = [1, 1, 1];
const BLACK = [0.05, 0.03, 0.09];
const MOUTH_LINE = [0.22, 0.10, 0.32];

const BODY_Y = 0.46;
const HEAD_AT = [0, 0.41, 0.46];          // neck joint in body space
const HEAD_TILT = 0.10;                   // resting nose-down angle of the head on the neck
const TAIL_AT = [0, -0.10, -0.42];
const TAIL_LEN = [0.19, 0.18, 0.16];
const SHOULDER = [0.12, 0.23, 0.04];
const LEG_F = 0.35, LEG_H = 0.28;         // front legs are longer: the chest rides high, the hips low
const LEG_F_Y = LEG_F - BODY_Y, LEG_H_Y = LEG_H - BODY_Y;   // hip heights (body space) that put the soles on the ground
const HS = 1.06;                          // head pivot scale (the whole head group is built at 1.0 and scaled once)
const OCT = Math.PI / 8;                  // 8-sided rings turned so the faces (not the corners) point up / down / sideways

// torso: purple, paler flanks, and a gold belly plate whose bands alternate down the underside
const skin = (th, i) => {
  const s = Math.sin(th);
  const hi = sstep(0.15, 0.95, s);
  let c = mix3(PUR, PUR_HI, hi * 0.8);
  c = mix3(c, LAV, sstep(-0.1, -0.6, s) * 0.32);
  return mix3(c, i % 2 ? BAND : BELLY, sstep(-0.50, -0.92, s));
};

// head rings: [z, centre y, rx, ry, squareness, muzzle paleness]
const HR = [
  [-0.22, 0.13, 0.0, 0.0, 2.2, 0],
  [-0.17, 0.14, 0.22, 0.215, 2.3, 0],
  [-0.06, 0.16, 0.33, 0.30, 2.5, 0],
  [0.08, 0.17, 0.37, 0.32, 2.6, 0],
  [0.24, 0.17, 0.365, 0.31, 2.6, 0],
  [0.34, 0.13, 0.31, 0.27, 2.7, 0.15],
  [0.42, 0.07, 0.235, 0.19, 2.6, 0.6],
  [0.53, 0.05, 0.19, 0.15, 2.5, 0.9],
  [0.63, 0.04, 0.16, 0.122, 2.4, 1],
  [0.69, 0.04, 0.14, 0.108, 2.3, 1],
  [0.715, 0.04, 0.10, 0.08, 2.2, 1],
];
const headCol = (muz) => (th) => {
  const s = Math.sin(th);
  let c = mix3(PUR, PUR_HI, sstep(0.1, 0.95, s) * 0.85);
  c = mix3(c, LAV, muz * 0.42);
  return mix3(c, LAV, sstep(-0.2, -0.75, s) * 0.6);
};
/** head ring parameters interpolated at depth z: [z, cy, rx, ry, e] */
function ringAt(z) {
  let i = 0;
  while (i < HR.length - 2 && z > HR[i + 1][0]) i++;
  const A = HR[i], B = HR[i + 1], t = Math.max(0, Math.min(1, (z - A[0]) / (B[0] - A[0])));
  const L = (k) => A[k] + (B[k] - A[k]) * t;
  return [z, L(1), L(2), L(3), L(4)];
}
const EYE_AT = [0.175, 0.225, 0.385];      // eye centre (head space, right eye): on the forehead wall above the muzzle
const EYE = { rx: 0.128, ry: 0.153, rz: 0.086 };

// ---- geometry ---------------------------------------------------------------------------------------------------------
function torsoGeo(b) {
  setBias(0.45);
  const R = (z, rx, ry, y) => ({ z, rx, ry, y, col: skin });
  // the back slopes from high shoulders down to low hips
  loft(b, [
    { z: -0.50, rx: 0, ry: 0, y: -0.13, col: PUR },
    R(-0.42, 0.14, 0.14, -0.115),
    R(-0.30, 0.215, 0.205, -0.085),
    R(-0.16, 0.265, 0.245, -0.045),
    R(-0.02, 0.285, 0.255, -0.005),
    R(0.10, 0.29, 0.26, 0.03),
    R(0.20, 0.285, 0.255, 0.05),
    { z: 0.27, rx: 0, ry: 0, y: 0.06, col: PUR },
  ], { segs: 8, rot: OCT });
}

// the neck: a thick tube rising steeply from the chest to the head, banded gold down its front
const neckCol = (th, i) => {
  const up = Math.cos(th);                          // +1 nape .. -1 throat
  let c = mix3(PUR, PUR_HI, sstep(0.1, 1, up) * 0.7);
  c = mix3(c, LAV, sstep(-0.1, -0.6, up) * 0.35);
  return mix3(c, i % 2 ? BAND : BELLY, sstep(-0.62, -0.9, up));
};
function neckGeo(b) {
  setBias(0.85);
  const P = spline([
    [0.02, 0.06, 0.26, 0.25], [0.09, 0.20, 0.26, 0.25], [0.22, 0.31, 0.25, 0.24],
    [0.36, 0.39, 0.235, 0.228], [0.48, 0.44, 0.22, 0.22],
  ], 3);
  sweep(b, P.map((q) => ({ p: [0, q[0], q[1]], rx: q[2], ry: q[3], col: neckCol })), { segs: 8, rot: OCT, up: [0, 1, 0] });
}

function hornPath(s) {
  const K = 0.98, o = [0.20, 0.40, -0.05];
  const P = [
    [0.20, 0.40, -0.05, 0.120], [0.27, 0.45, -0.20, 0.104], [0.33, 0.51, -0.36, 0.082],
    [0.38, 0.59, -0.52, 0.060], [0.415, 0.68, -0.65, 0.035], [0.43, 0.77, -0.72, 0.0],
  ].map((q) => [o[0] + (q[0] - o[0]) * K, o[1] + (q[1] - o[1]) * K, o[2] + (q[2] - o[2]) * K, q[3]]);
  const pts = spline(P, 2);
  return pts.map((c, i) => {
    const band = i % 2;
    const f = i / (pts.length - 1);
    let col = band ? HORN_A : HORN_B;
    col = mix3(col, HORN_TIP, sstep(0.55, 1, f));
    if (i < 2) col = mix3(PUR_LO, col, i / 2);
    return { p: [s * c[0], c[1], c[2]], r: Math.max(0, c[3] * (band ? 0.9 : 1)), col };
  });
}

function headGeo(b) {
  setBias(0.45);
  const rings = HR.map(([z, cy, rx, ry, e, muz]) => {
    const pts = superRing(0, cy, z, rx, ry, e, 8, OCT);
    const f = headCol(muz);
    return { pts, cols: pts.map((_, j) => f(OCT + (j / 8) * TAU)) };
  });
  meshRings(b, rings, { cap1: true, capCol: mix3(LAV, PUR_HI, 0.45) });

  // horns: long, ringed, swept back and up
  setBias(0.7);
  for (const s of [1, -1]) sweep(b, hornPath(s), { segs: 6 });

  // crest: three creased gold plates fanned on the crown
  setBias(0.9);
  const cr = [[0, 0.462, 0.07, 0, 0.88, -0.48, 0.33, 0.32], [1, 0.44, 0.05, 0.50, 0.80, -0.36, 0.27, 0.27], [-1, 0.44, 0.05, -0.50, 0.80, -0.36, 0.27, 0.27]];
  for (const [side, y, z, dx, dy, dz, h, w] of cr) {
    blade(b, [side * 0.13, y, z], [dx, dy, dz], [1, 0, 0], h, w, 0.035, [GOLD_LO, GOLD, GOLD_HI]);
  }
  // cheek fins
  for (const s of [1, -1]) blade(b, [s * 0.32, 0.17, -0.10], [s * 0.55, 0.10, -0.83], [0, 1, 0], 0.15, 0.11, 0.02, [PUR_LO, PUR, LAV]);

  // brow ridges: a small purple wedge over each eye
  setBias(0.5);
  for (const s of [1, -1]) {
    b.push().translate(s * 0.20, EYE_AT[1] + 0.165, EYE_AT[2] - 0.01).rotateZ(-s * 0.05).rotateY(s * 0.25);
    ellipsoid(b, 0, 0, 0, 0.12, 0.036, 0.09, { segs: 6, rings: 3, col: (th) => mix3(PUR, PUR_HI, Math.sin(th) > 0 ? 0.6 : 0.1) });
    b.pop();
  }
  // mouth: a thin dark line along the lip, curving up at the corner
  setBias(0);
  for (const s of [1, -1]) {
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const z = 0.70 - k * 0.05;
      const [, cy, rx, ry, e] = ringAt(z);
      const th = -0.50 + 0.30 * Math.max(0, k - 3) / 3;              // (angle below the equator; lifts toward the corner)
      const pw = (v) => Math.sign(v) * Math.pow(Math.abs(v), 2 / e);
      pts.push([s * rx * pw(Math.cos(th)) * 1.012, cy + ry * pw(Math.sin(th)) * 1.012, z]);
    }
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], c = pts[k + 1], w = 0.009;
      triF(b, [a[0], a[1] - w, a[2]], [a[0], a[1] + w, a[2]], [c[0], c[1] + w, c[2]], MOUTH_LINE);
      triF(b, [a[0], a[1] - w, a[2]], [c[0], c[1] + w, c[2]], [c[0], c[1] - w, c[2]], MOUTH_LINE);
      triF(b, [a[0], a[1] + w, a[2]], [a[0], a[1] - w, a[2]], [c[0], c[1] + w, c[2]], MOUTH_LINE);
      triF(b, [a[0], a[1] - w, a[2]], [c[0], c[1] - w, c[2]], [c[0], c[1] + w, c[2]], MOUTH_LINE);
    }
  }
  // nostrils: two dark dots on the nose face
  for (const s of [1, -1]) ellipsoid(b, s * 0.05, 0.088, 0.712, 0.024, 0.02, 0.022, { segs: 6, rings: 2, col: BLACK });
}

function jawGeo(b) {
  // jaw-local: pivot at the hinge; +z forward
  const js = (th, i) => {
    const s = Math.sin(th);
    if (s > 0.95) return i === 0 ? LAV : mix3(TONGUE, MOUTH, 0.25);
    return mix3(LAV, BELLY, sstep(-0.5, -1, s) * 0.5);
  };
  setBias(0.35);
  loft(b, [
    { z: 0.0, rx: 0.15, ry: 0.06, y: -0.005, col: js },
    { z: 0.20, rx: 0.155, ry: 0.056, y: -0.002, col: js },
    { z: 0.38, rx: 0.12, ry: 0.045, y: 0.006, col: js },
    { z: 0.48, rx: 0.085, ry: 0.036, y: 0.014, col: js },
    { z: 0.53, rx: 0, ry: 0, y: 0.018, col: LAV },
  ], { segs: 6, cap0: true, capCol: LAV, rot: Math.PI / 6 });
}

function eyesGeo(b) {
  const { rx, ry, rz } = EYE;
  // a point on the eyeball's front surface (plus a small lift so painted parts sit on top of it)
  const surf = (x, y, lift) => [x, y, rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2 - (y / ry) ** 2)) + lift];
  for (const s of [1, -1]) {
    b.push().translate(s * EYE_AT[0], EYE_AT[1], EYE_AT[2]).rotateY(s * 0.52).rotateX(-0.05);
    ellipsoid(b, 0, 0, 0, rx, ry, rz, { segs: 10, rings: 5, col: WHITE });
    // pupil: a big 10-gon low and toward the nose + a small highlight
    const cx = -s * 0.03, cy = -0.03, pr = [0.073, 0.096];
    const c0 = surf(cx, cy, 0.006);
    for (let j = 0; j < 10; j++) {
      const a0 = (j / 10) * TAU, a1 = ((j + 1) / 10) * TAU;
      triF(b, c0, surf(cx + Math.cos(a0) * pr[0], cy + Math.sin(a0) * pr[1], 0.006), surf(cx + Math.cos(a1) * pr[0], cy + Math.sin(a1) * pr[1], 0.006), BLACK);
    }
    const hx = cx + s * 0.012 + 0.02, hy = cy + 0.055, hw = 0.022;
    const h00 = surf(hx - hw, hy - hw, 0.012), h10 = surf(hx + hw, hy - hw, 0.012), h11 = surf(hx + hw, hy + hw, 0.012), h01 = surf(hx - hw, hy + hw, 0.012);
    triF(b, h00, h10, h11, WHITE);
    triF(b, h00, h11, h01, WHITE);
    b.pop();
  }
}

// paw: pad + three short toes with pale claws (leg space: pivot at the hip, feet at -legLength)
const FOOT = { rx: 0.15, ry: 0.19, y: 0.06 };
const toesFor = (L) => [-0.55, 0, 0.55].map((a) => ({
  base: [Math.sin(a) * 0.085, -L + 0.045, 0.165 + Math.cos(a) * 0.07],
  dir: [Math.sin(a) * 0.75, -0.30, Math.cos(a)],
  h: 0.10,
}));

function legGeo(b, hind) {
  const L = hind ? LEG_H : LEG_F;
  setBias(0.4);
  b.push().rotateX(Math.PI / 2);      // loft +z -> down, loft +y -> forward
  loft(b, [
    { z: 0.0, rx: hind ? 0.16 : 0.145, ry: hind ? 0.17 : 0.15, y: 0.0, col: PUR },
    { z: L * 0.3, rx: hind ? 0.145 : 0.13, ry: hind ? 0.155 : 0.135, y: 0.004, col: PUR },
    { z: L * 0.62, rx: hind ? 0.095 : 0.085, ry: hind ? 0.105 : 0.095, y: 0.008, col: PUR },
    { z: L - 0.05, rx: 0.098, ry: 0.115, y: 0.022, col: mix3(PUR, PUR_LO, 0.4) },
    { z: L - 0.008, rx: FOOT.rx, ry: FOOT.ry, y: FOOT.y, col: PUR_LO },
  ], { segs: 6, cap1: true, capCol: PUR_LO });
  b.pop();
  setBias(0.9);
  for (const t of toesFor(L)) spike(b, t.base, t.dir, t.h, 0.05, { segs: 5, col: mix3(PUR, PUR_LO, 0.3), tip: CLAW });
}

// points on the sole (+ claw tips) in leg space, used to keep the feet out of the ground
function footPoints(hind) {
  const L = hind ? LEG_H : LEG_F;
  const pts = [];
  for (let j = 0; j < 6; j++) {
    const th = (j / 6) * TAU;
    pts.push([FOOT.rx * Math.cos(th), -(L - 0.008), FOOT.y + FOOT.ry * Math.sin(th)]);
  }
  for (const t of toesFor(L)) {
    const l = Math.hypot(t.dir[0], t.dir[1], t.dir[2]);
    pts.push([t.base[0] + (t.dir[0] / l) * t.h, t.base[1] + (t.dir[1] / l) * t.h, t.base[2] + (t.dir[2] / l) * t.h]);
  }
  return pts;
}

function tailGeo(b, i) {
  const LEN = TAIL_LEN[i];
  const R0 = [0.14, 0.10, 0.068][i], R1 = [0.10, 0.068, 0.042][i];
  const tc = (th) => {
    const s = Math.sin(th);
    return mix3(mix3(PUR, PUR_HI, sstep(0.3, 0.95, s) * 0.8), LAV, sstep(-0.2, -0.8, s) * 0.7);
  };
  setBias(0.45);
  loft(b, [
    { z: 0.03, rx: R0, ry: R0 * 0.95, col: tc },
    { z: -LEN, rx: R1, ry: R1 * 0.95, col: tc },
  ], { segs: 6 });
}

function tipGeo(b) {
  // a small faceted bud in warm brown-orange (the classic tail tip)
  setBias(0.9);
  loft(b, [
    { z: 0.02, rx: 0, ry: 0, col: BAND },
    { z: -0.03, rx: 0.048, ry: 0.048, col: BAND },
    { z: -0.09, rx: 0.058, ry: 0.058, col: GOLD_LO },
    { z: -0.16, rx: 0, ry: 0, col: BONE_HI },
  ], { segs: 5 });
}

// wing (left side, +x outward, membrane trails toward -z)
const WS = [0, 0, 0], WE = [0.40, 0.08, 0.04], WT = [0.98, 0.07, -0.13], WF1 = [0.84, 0.0, -0.60], WF2 = [0.50, 0.0, -0.72], WB = [0.07, 0.0, -0.52];
function wingGeo(b) {
  setBias(1.0);
  const mid = (a, c, k = 0.15) => {
    const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
    return [m[0] + (WE[0] - m[0]) * k, m[1] + (WE[1] - m[1]) * k, m[2] + (WE[2] - m[2]) * k];
  };
  const C1 = mid(WT, WF1), C2 = mid(WF1, WF2), C3 = mid(WF2, WB);
  // membrane: dark maroon at the wrist, a little brighter toward the finger tips, darker in the scallops
  const hub = MEMB_LO, tipc = MEMB_HI, notch = MEMB;
  const tri = (a, c, d, ca, cb, cc) => triDouble(b, a, c, d, ca, cb, cc);
  tri(WE, WT, C1, hub, tipc, notch);
  tri(WE, C1, WF1, hub, notch, tipc);
  tri(WE, WF1, C2, hub, tipc, notch);
  tri(WE, C2, WF2, hub, notch, tipc);
  tri(WE, WF2, C3, hub, tipc, notch);
  tri(WE, C3, WB, hub, notch, tipc);
  tri(WS, WE, WB, MEMB_LO, hub, MEMB);
  // bones: a purple shoulder fading to gold, then the finger bones
  setBias(0.5);
  bar(b, WS, WE, 0.055, 0.04, PUR, { segs: 4, col1: BONE });
  bar(b, WE, WT, 0.038, 0.017, BONE, { segs: 4, col1: BONE_HI, cap1: true });
  bar(b, WE, WF1, 0.022, 0.012, BONE, { segs: 4, col1: BONE_HI, cap1: true });
  bar(b, WE, WF2, 0.022, 0.012, BONE, { segs: 4, col1: BONE_HI, cap1: true });
  bar(b, WE, WB, 0.02, 0.015, BONE, { segs: 4, col1: BONE, cap1: true });
}

// ---- model ------------------------------------------------------------------------------------------------------------
export function createSpyro(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets, 'spyro');
  const M = R.litMat(null);
  const G = R.glowMat(null);
  const seed = nextSeed(opts);
  const rnd = seeded(seed);

  const body = R.pivot(R.rig, 0, BODY_Y, 0, 'body');
  R.part(body, M, torsoGeo, 'torso');
  R.part(body, M, neckGeo, 'neck');

  const head = R.pivot(body, ...HEAD_AT, 'head');
  head.scale.setScalar(HS);
  R.part(head, M, headGeo, 'skull');
  const jaw = R.pivot(head, 0, -0.075, 0.17, 'jaw');
  R.part(jaw, M, jawGeo, 'jaw');
  const eyes = R.pivot(head, 0, EYE_AT[1], EYE_AT[2], 'eyes');
  // the eye mesh is built around the eyes pivot so blinking scales it about its own centre
  R.part(eyes, G, (b) => { b.translate(0, -EYE_AT[1], -EYE_AT[2]); eyesGeo(b); }, 'eyes', true);
  const mouth = R.pivot(head, 0, 0.03, 0.70, 'mouth');
  const back = R.pivot(body, 0, 0.36, -0.08, 'back');

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
  const t4 = R.pivot(par, 0, 0, -TAIL_LEN[2], 'tip');
  R.part(t4, M, tipGeo, 'tip');
  tails.push(t4);

  // legs
  const legDefs = [
    { n: 'FL', x: 0.20, y: LEG_F_Y, z: 0.24, hind: false, off: 0 },
    { n: 'FR', x: -0.20, y: LEG_F_Y, z: 0.24, hind: false, off: Math.PI },
    { n: 'HL', x: 0.21, y: LEG_H_Y, z: -0.26, hind: true, off: Math.PI },
    { n: 'HR', x: -0.21, y: LEG_H_Y, z: -0.26, hind: true, off: 0 },
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
  if (opts.still) { S.lookT = 1e9; S.blinkT = 1e9; }      // review renders: no idle blink / look-around

  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt || 0, 0, 0.1);
    heal(S);
    const speed = clamp(num(pose.speed), 0, 60);
    const grounded = pose.grounded !== false;
    const vy = clamp(num(pose.vy), -80, 80);
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
    // "character light": lift the albedo at night so the hero pops. Towards daybreak the boost fades and the red channel is
    // pulled back, otherwise the warm sun turns the purple into hot pink.
    const day = clamp(U.uDay.value);
    const br = lerp(1.30, 0.80, sstep(0, 0.7, day)), bg = lerp(1.30, 1.0, day), bb = lerp(1.30, 1.02, day);
    if (Math.abs(br + bg + bb - S.boost) > 0.006) { S.boost = br + bg + bb; R.boost(br, bg, bb); }
    S.move = damp(S.move, sstep(0.25, 2.5, speed) * (grounded ? 1 : 0), 12, dt);
    S.run = damp(S.run, sstep(5, 12, speed), 8, dt);
    S.air = damp(S.air, grounded ? 0 : 1, 16, dt);
    S.rise = damp(S.rise, clamp(vy / 9, -1, 1), 10, dt);
    S.glide = damp(S.glide, glideT, 8, dt);
    S.charge = damp(S.charge, chargeT, 8, dt);
    S.flame = damp(S.flame, flameT, 11, dt);
    S.cheer = damp(S.cheer, cheerT, 9, dt);
    spring(S, 'dead', dead ? 1 : 0, 110, 12, dt);      // bouncy tumble: overshoots then settles
    S.hurt = damp(S.hurt, hurt, 40, dt);
    S.land = damp(S.land, land, 40, dt);
    S.turn = damp(S.turn, turnT, 9, dt);
    if (flameT && !S.wasFlame) S.flameT = 0;
    S.wasFlame = !!flameT;
    if (flameT) S.flameT += dt;

    const runK = S.run, chargeK = S.charge, airK = S.air, glideK = S.glide, flameK = S.flame, cheerK = S.cheer;
    const deadK = clamp(S.dead, 0, 1), hurtK = S.hurt, landK = S.land, rise = S.rise, turn = S.turn;
    const up = sstep(-0.3, 0.3, rise);      // 0 falling .. 1 rising (smooth, no sign switches)

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
    const roll90 = (Math.PI / 2) * S.dead;       // spring position: overshoots a little
    R.rig.rotation.set(0, 0, -roll90);
    R.rig.position.set(0.36 * Math.sin(roll90), hop + 0.48 * Math.sin(roll90), 0);

    // ---- head + jaw ---------------------------------------------------------------------------------------------
    const headPitch = -noseDown * 0.85 + 0.55 * chargeK - 0.55 * flameK - 0.25 * glideK - 0.22 * cheerK + 0.05 * Math.sin(2 * ph + 1.0) * gait
      - 0.28 * hurtK + 0.1 * landK + S.lookPitch - 0.10 * airK * Math.max(0, rise) + 0.15 * airK * Math.max(0, -rise) - 0.15 * recoil
      - 0.02 * breath * calm;
    head.rotation.set(headPitch + HEAD_TILT, S.lookYaw + 0.30 * turn + shake * 2, -0.06 * S.lookYaw + 0.12 * Math.sin(S.time * 3) * cheerK);
    head.position.set(HEAD_AT[0], HEAD_AT[1] + 0.01 * breath * calm, HEAD_AT[2]);
    const pant = (0.03 + 0.05 * runK) * (0.5 + 0.5 * Math.sin(2 * ph)) * gait;
    jaw.rotation.set(0.015 + pant + 0.62 * flameK + 0.26 * cheerK + 0.20 * hurtK + 0.05 * airK + 0.18 * deadK + 0.12 * glideK, 0, 0);

    // ---- wings ------------------------------------------------------------------------------------------------
    const spreadT = clamp(0.5 * airK * (1 - glideK) * lerp(1.1, 0.85, up) + glideK + 0.35 * flameK + 0.85 * cheerK + 0.55 * deadK + 0.45 * hurtK, 0, 1);
    S.spread = damp(S.spread, spreadT, 14, dt);
    const sp = S.spread;
    const flutter = Math.sin(S.time * TAU * 5.5) * 0.09 * glideK + Math.sin(S.time * TAU * 3.2) * 0.75 * cheerK * (1 - deadK)
      + Math.sin(S.time * TAU * 2.4) * 0.35 * airK * (1 - glideK) * lerp(1, 0.6, up);
    const jiggle = -bob * 5 * (1 - sp) + 0.03 * Math.sin(S.time * 1.3 + 1) * calm;
    for (let i = 0; i < 2; i++) {
      wings[i].rotation.set(lerp(-0.56, -0.30, sp), lerp(0.04, 0.30, sp), lerp(1.24, 0.30, sp) + flutter + jiggle + 0.4 * deadK);
      wings[i].scale.setScalar(lerp(0.85, 1.0, sp));
    }

    // ---- tail ---------------------------------------------------------------------------------------------------
    // pitch is cumulative down the chain: idle shape droops then flicks up at the spade; states add a total lift.
    const shapeK = 1 - 0.75 * clamp(gait + chargeK + glideK + flameK);
    const tailTotal = 0.30 * runK * gait + 0.28 * chargeK + 0.55 * flameK + 0.06 * glideK + 0.45 * cheerK + 0.18 * hurtK
      + airK * (1 - glideK) * lerp(0.45, -0.30, up);
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
      const airNormal = front ? lerp(-0.75, -0.55, up) : lerp(0.45 + 0.1 * Math.sin(S.time * 9), 0.75, up);
      const airRot = lerp(airNormal, front ? -0.25 : 0.95, glideK);
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

  /** World position of the mouth for a root placed at (x, y, z) facing yaw — where the fire breath starts. */
  const _mw = new THREE.Vector3();
  function mouthWorld(x, y, z, yaw, out) {
    R.root.position.set(x, y, z);
    R.root.rotation.y = yaw;
    R.root.updateMatrixWorld(true);          // (the game's render sync re-places the root every frame, so this is only a probe)
    mouth.getWorldPosition(_mw);
    if (Number.isFinite(_mw.x + _mw.y + _mw.z)) { out.x = _mw.x; out.y = _mw.y; out.z = _mw.z; }
    return out;
  }

  return {
    root: R.root,
    mouthWorld,
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
