// SNUFFLEWISP: the shadow that circles a lantern while it is out, in 3D (it was a flat sprite). A hooded teardrop of dark indigo cloth that ends in a tail of three
// linked segments (they trail behind it and sway), a drooping hood tip, a pale rim round the hood, a void for a face with two glowing yellow slits, and two small
// clawed hands held out in front as if to snuff what is lit. Faces +z, origin at the middle of the body; about 1.4 m from the hood to the end of the tail.
// opts: { tint [r, g, b] (the realm's colour for its wisps; it lifts the cloth toward it), lift (metres: raises the whole model, for a viewer that stands it on a floor) }
// Pose contract (all optional): { speed (how fast it drifts), t }
import { U } from '../../../engine/materials.js';
import { Rig, ellipsoid, spike, bar, triC, triF, setBias, clamp, heal, lerp, sstep, damp, mix3, TAU, nextSeed, seeded } from './rig.js';

const CLOTH_LO = [0.03, 0.025, 0.09];
const CLOTH = [0.07, 0.055, 0.17];
const CLOTH_HI = [0.17, 0.14, 0.34];
const VOID = [0.02, 0.015, 0.05];
const CLAW = [0.80, 0.76, 0.92];
const EYE = [1.0, 0.86, 0.14];
const EYE_HI = [1.0, 0.97, 0.7];

const lathe = (b, profile, segs, color, o = {}) => b.lathe(profile, segs, { color, ...o });

// ---- geometry ----------------------------------------------------------------------------------------------------------
function bodyGeo(b) {                                     // (pivot at the middle of the body: the hood is above it, the first tail segment hangs from its foot)
  setBias(0.35);
  lathe(b, [[0.0, -0.34], [0.12, -0.28], [0.25, -0.12], [0.34, 0.08], [0.33, 0.22], [0.25, 0.36], [0.12, 0.44], [0, 0.47]], 8,
    (x, y) => mix3(CLOTH_LO, CLOTH_HI, sstep(-0.3, 0.45, y) * 0.8));
  // the ragged edge of the cloth: tabs hung from the waist
  const N = 8, r = 0.30, y0 = -0.14;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU, am = (a0 + a1) / 2;
    const len = i % 2 ? 0.08 : 0.15;
    const p0 = [r * Math.sin(a0), y0, r * Math.cos(a0)], p1 = [r * Math.sin(a1), y0, r * Math.cos(a1)];
    const tip = [r * 0.9 * Math.sin(am), y0 - len, r * 0.9 * Math.cos(am)];
    const n = [Math.sin(am), -0.2, Math.cos(am)];
    triC(b, p0, p1, tip, CLOTH_LO, CLOTH_LO, mix3(CLOTH, CLOTH_HI, 0.35), n, n, n);
  }
}

function hoodGeo(b) {                                     // (pivot at the base of the hood)
  setBias(0.4);
  b.push().translate(0, 0.0, 0);
  ellipsoid(b, 0, 0, 0, 0.30, 0.32, 0.31, { segs: 8, rings: 3, col: (th) => mix3(CLOTH, CLOTH_HI, 0.2 + 0.7 * Math.max(0, Math.sin(th))) });
  b.pop();
  // the hood tip droops back like a nightcap
  spike(b, [0, 0.26, -0.12], [0, 0.35, -0.95], 0.5, 0.14, { segs: 5, col: CLOTH, tip: CLOTH_LO });
  // a rim round the face: a darker mouth of the hood with a pale lip
  b.push().translate(0, -0.01, 0.2);
  ellipsoid(b, 0, 0, 0, 0.22, 0.25, 0.14, { segs: 8, rings: 2, col: (th) => mix3(VOID, [0.09, 0.07, 0.2], sstep(-0.5, 0.9, Math.sin(th))) });
  b.pop();
  // two small ears of cloth
  for (const s of [1, -1]) spike(b, [s * 0.2, 0.22, 0.02], [s * 0.7, 0.9, -0.15], 0.28, 0.09, { segs: 4, col: CLOTH, tip: CLOTH_HI });
}

function eyesGeo(b) {                                     // (unlit; pivot at the middle of the face)
  for (const s of [1, -1]) {
    const cx = s * 0.085, cy = 0.02, z = 0.335;
    const rot = s * -0.45;
    const c = Math.cos(rot), sn = Math.sin(rot);
    const P = (x, y, dz = 0) => [cx + x * c - y * sn, cy + x * sn + y * c, z + dz];
    const w = 0.07, h = 0.036;
    triF(b, P(-w, -h), P(w, -h), P(w, h), EYE);
    triF(b, P(-w, -h), P(w, h), P(-w, h), EYE);
    const w2 = 0.045, h2 = 0.016;
    triF(b, P(-w2, -h2, 0.01), P(w2, -h2, 0.01), P(w2, h2, 0.01), EYE_HI);
    triF(b, P(-w2, -h2, 0.01), P(w2, h2, 0.01), P(-w2, h2, 0.01), EYE_HI);
  }
}

function armGeo(b) {                                      // (hangs along -y from the shoulder; three claws at the end)
  setBias(0.35);
  bar(b, [0, 0, 0], [0, -0.20, 0.0], 0.065, 0.045, CLOTH, { segs: 5 });
  b.push().translate(0, -0.24, 0.01);
  ellipsoid(b, 0, 0, 0, 0.055, 0.06, 0.06, { segs: 5, rings: 2, col: CLAW });
  b.pop();
  for (const x of [-0.04, 0, 0.04]) spike(b, [x, -0.27, 0.02], [x * 1.2, -1, 0.35], 0.13, 0.022, { segs: 3, col: CLAW, tip: [1, 1, 1] });
}

function tailGeo(k) {                                     // (segment k of 0..2, hung from its pivot; each is thinner and shorter than the one before)
  return (b) => {
    setBias(0.3);
    const r0 = [0.17, 0.11, 0.065][k], r1 = [0.11, 0.065, 0.0][k], L = [0.34, 0.30, 0.34][k];
    lathe(b, [[r1, -L], [(r0 + r1) / 2 * 0.95, -L * 0.5], [r0, 0.0]], 6, (x, y) => mix3(CLOTH_LO, CLOTH, sstep(-L, 0, y)));
  };
}
const TAIL_L = [0.34, 0.30, 0.34];

// ---- model ------------------------------------------------------------------------------------------------------------
export function createSnufflewisp(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets, 'snufflewisp');
  const M = R.litMat(null), G = R.glowMat(null);
  const rnd = seeded(nextSeed(opts));

  const body = R.pivot(R.rig, 0, opts.lift || 0, 0, 'body');
  R.part(body, M, bodyGeo, 'body');
  const head = R.pivot(body, 0, 0.42, 0.0, 'head');
  R.part(head, M, hoodGeo, 'hood');
  const eyes = R.pivot(head, 0, 0.0, 0.0, 'eyes');
  R.part(eyes, G, eyesGeo, 'eyes', true);
  const armL = R.pivot(body, 0.27, 0.12, 0.12, 'armL'), armR = R.pivot(body, -0.27, 0.12, 0.12, 'armR');
  R.part(armL, M, armGeo, 'arm');
  R.part(armR, M, armGeo, 'arm');
  // the tail: three segments, each hung from the end of the one before
  const tail = [];
  let parent = R.pivot(body, 0, -0.3, 0, 'tail0');
  for (let k = 0; k < 3; k++) {
    const seg = k === 0 ? parent : R.pivot(parent, 0, -TAIL_L[k - 1], 0, 'tail' + k);
    R.part(seg, M, tailGeo(k), 'tail' + k);
    tail.push(seg);
    parent = seg;
  }
  // (a realm's colour lifts the cloth toward it: the black ghosts of the cold are bluer, those of the sea greener)
  const tint = opts.tint || [0.7, 0.6, 1.0];
  const tm = [0.72 + 0.4 * tint[0], 0.72 + 0.4 * tint[1], 0.72 + 0.4 * tint[2]];

  const S = { time: rnd() * 10, move: 0, ph: rnd() * TAU };
  const NIGHT_BOOST = 1.25;
  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt, 0, 0.1);
    heal(S);
    S.time += dt;
    S.move = damp(S.move, sstep(0.2, 3, clamp(pose.speed, 0, 12)), 6, dt);
    const t = S.time, mv = S.move;
    body.position.y = (opts.lift || 0) + Math.sin(t * 2.1 + S.ph) * 0.05;
    body.rotation.set(0.12 + 0.22 * mv + Math.sin(t * 1.7) * 0.03, 0, Math.sin(t * 1.3 + S.ph) * 0.06);
    head.rotation.set(-0.1 * mv + Math.sin(t * 1.1) * 0.05, Math.sin(t * 0.8 + S.ph) * 0.22, Math.sin(t * 1.9) * 0.05);
    // the tail trails the drift and sways in a wave
    tail.forEach((seg, k) => {
      seg.rotation.set(0.28 + 0.16 * k + 0.3 * mv + Math.sin(t * 3.2 - k * 1.1) * 0.22, 0, Math.sin(t * 2.6 - k * 1.3 + S.ph) * (0.28 + 0.08 * k));
    });
    // hands held out, reaching: they open and close as if to pinch a flame
    const pinch = Math.sin(t * 2.4 + S.ph);
    armL.rotation.set(-1.15 + pinch * 0.18, 0, 0.18 + pinch * 0.08);
    armR.rotation.set(-1.15 - pinch * 0.18, 0, -0.18 - pinch * 0.08);
    const fl = 1 + Math.sin(t * 17) * 0.05 + Math.sin(t * 7.3) * 0.06;
    G.uniforms.uColorMul.value.setRGB(fl, fl, fl);
    const boost = lerp(NIGHT_BOOST, 1.08, clamp(U.uDay.value));
    if (Math.abs(boost - (S.boost ?? -1)) > 0.004) { S.boost = boost; R.boost(boost * tm[0], boost * tm[1], boost * tm[2]); }
    if (pose.flash !== undefined) R.flash(clamp(pose.flash, 0, 1));
  }
  const top = R.pivot(R.rig, 0, 0.8, 0, 'top');
  return {
    root: R.root, radius: 0.4, height: 1.2,
    anchors: { eyes, top },
    testPoses: { idle: {}, drift: { speed: 3 } },
    update, flash: (k) => R.flash(k), dispose: () => R.dispose(), variant: 'wisp',
    get triangleCount() { return R.triangleCount; },
  };
}
