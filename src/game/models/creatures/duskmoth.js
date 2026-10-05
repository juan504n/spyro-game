// DUSK MOTH: a moth the size of a cat that hangs over the hero's head (foes/swoop.js). A furred body in grey-lilac with a banded abdomen, a small head with two big amber eyes and feathered
// antennae, and two pairs of wide wings of violet dusk-grey with a dark rim and one glowing eye-spot on each forewing. It beats them as it hangs, throws them up as it rears, sweeps them back as it
// dives and flaps slowly on the ground after it has landed.
// Faces +z, origin at the middle of its underside (0.5 m under the middle of its body: where the foe's feet would be); a body 0.8 m long, 1.9 m across the wings.
// Pose contract (all optional): { speed 0..16 (how quick it flies), rear 0..1 (wings up, head back), dive 0/1 (wings swept back, nose down), perch 0/1 (landed: slow beats), stun 0..1, alert 0..1, hurt 0..1, dead 0..1, t }
import { U } from '../../../engine/materials.js';
import { Rig, loft, ellipsoid, spike, bar, triC, triDouble, setBias, clamp, heal, lerp, sstep, damp, mix3, TAU, nextSeed, seeded } from './rig.js';

const FUR = [0.58, 0.52, 0.66], FUR_HI = [0.78, 0.72, 0.86], FUR_LO = [0.34, 0.3, 0.44], BAND = [0.4, 0.3, 0.6], BAND_LO = [0.26, 0.2, 0.42];
const WING_RIM = [0.2, 0.15, 0.36], WING_MID = [0.46, 0.4, 0.7], WING_HI = [0.7, 0.64, 0.92], WING_UNDER = [0.62, 0.58, 0.78], SPOT = [1.0, 0.8, 0.3], EYE = [1.0, 0.7, 0.18], BLACK = [0.04, 0.03, 0.08];
const FORE = [[0.0, 0.12], [0.3, 0.34], [0.75, 0.4], [1.08, 0.2], [1.0, -0.08], [0.72, -0.26], [0.22, -0.2], [0.0, -0.06]];
const HIND = [[0.0, -0.06], [0.45, -0.2], [0.82, -0.42], [0.72, -0.72], [0.4, -0.66], [0.12, -0.38]];

/** one wing of the +x side (sign 1) or the -x side (sign -1): fans of two-sided triangles from the middle of the outline, dark at the rim and pale towards the body */
function wingGeo(pts, sign) {
  return (b) => {
    setBias(0.3);
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p[0] / pts.length; cz += p[1] / pts.length; }
    const P = (x, z, y = 0) => [sign * x, y + 0.04 * x * x / 1.1, z];
    const centre = P(cx, cz, 0.012);
    const k = (p) => 1 - sstep(0.3, 1.0, Math.hypot(p[0] - cx, p[1] - cz) * 1.6);
    const col = (p) => mix3(WING_RIM, mix3(WING_MID, WING_HI, 0.3 + 0.5 * (1 - Math.abs(p[1] - cz))), clamp(0.15 + 0.85 * k(p)));
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      triDouble(b, P(a[0], a[1]), P(c[0], c[1]), centre, col(a), col(c), WING_HI);
    }
  };
}
function spotGeo(b) {                                   // (unlit: the eye-spot of a forewing, a hair over its top)
  const cx = 0.78, cz = 0.06, r = 0.15;
  for (let k = 0; k < 7; k++) {
    const a0 = (k / 7) * TAU, a1 = ((k + 1) / 7) * TAU;
    const P = (x, z) => [x, 0.04 * x * x / 1.1 + 0.02, z];
    const t = [P(cx, cz), P(cx + Math.cos(a0) * r, cz + Math.sin(a0) * r * 1.2), P(cx + Math.cos(a1) * r, cz + Math.sin(a1) * r * 1.2)];
    b.tri(t[0], t[1], t[2], [0, 0], [0, 0], [0, 0], { tints: [SPOT, EYE, EYE] });
    b.tri(t[0], t[2], t[1], [0, 0], [0, 0], [0, 0], { tints: [SPOT, EYE, EYE] });
  }
}
function bodyGeo(b) {                                   // (body frame: the middle of the thorax at the origin)
  setBias(0.35);
  ellipsoid(b, 0, 0, 0.05, 0.2, 0.2, 0.28, { segs: 6, rings: 3, col: (th) => mix3(FUR_LO, FUR_HI, 0.5 + 0.5 * Math.sin(th)) });
  loft(b, [
    { z: -0.1, rx: 0.15, ry: 0.15, col: FUR },
    { z: -0.28, rx: 0.15, ry: 0.145, col: (th, i) => (i % 2 ? BAND : FUR) },
    { z: -0.46, rx: 0.12, ry: 0.115, col: BAND_LO },
    { z: -0.62, rx: 0.08, ry: 0.075, col: BAND },
    { z: -0.76, rx: 0.0, ry: 0.0, col: BAND_LO },
  ], { segs: 6 });
  ellipsoid(b, 0, 0.04, 0.38, 0.14, 0.14, 0.13, { segs: 6, rings: 3, col: FUR });                    // the head
  for (const s of [1, -1]) {
    ellipsoid(b, s * 0.1, 0.06, 0.43, 0.065, 0.07, 0.06, { segs: 5, rings: 2, col: BLACK });        // the sockets of its eyes
    bar(b, [s * 0.04, 0.16, 0.43], [s * 0.2, 0.46, 0.66], 0.014, 0.01, FUR_LO, { segs: 3 });        // the antennae
    for (const j of [0.3, 0.55, 0.8]) spike(b, [s * (0.04 + 0.16 * j), 0.16 + 0.3 * j, 0.43 + 0.23 * j], [s * 0.9, 0.2, 0.2], 0.1, 0.012, { segs: 3, col: FUR_LO, tip: FUR_HI });
    for (const z of [0.12, 0.0, -0.1]) bar(b, [s * 0.08, -0.14, z], [s * 0.2, -0.46, z + 0.04], 0.02, 0.012, FUR_LO, { segs: 3 });   // its legs
  }
}
function eyesGeo(b) {                                   // (unlit: the two big amber eyes)
  for (const s of [1, -1]) ellipsoid(b, s * 0.11, 0.06, 0.44, 0.052, 0.058, 0.05, { segs: 5, rings: 2, col: EYE });
}

export function createDuskmoth(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets, 'duskmoth');
  const M = R.litMat(null), G = R.glowMat(null), GS = R.glowMat(null);
  const rnd = seeded(nextSeed(opts));
  const body = R.pivot(R.rig, 0, 0.5, 0, 'body');
  R.part(body, M, bodyGeo, 'body');
  const eyes = R.pivot(body, 0, 0, 0, 'eyes');
  R.part(eyes, G, eyesGeo, 'eyes', true);
  const wing = (sign) => {
    const p = R.pivot(body, sign * 0.14, 0.14, 0.02, sign > 0 ? 'wingR' : 'wingL');
    R.part(p, M, (b) => { wingGeo(FORE, sign)(b); wingGeo(HIND, sign)(b); }, 'wing' + sign);
    R.part(p, GS, (b) => { b.push(); if (sign < 0) b.scale(-1, 1, 1); spotGeo(b); b.pop(); }, 'spot' + sign, true);
    return p;
  };
  const wingR = wing(1), wingL = wing(-1);
  const top = R.pivot(R.rig, 0, 1.2, 0, 'top');

  const S = { time: rnd() * 10, phase: rnd() * TAU, move: 0, rear: 0, dive: 0, perch: 0, stun: 0, hurt: 0, alert: 0 };
  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt, 0, 0.1);
    heal(S);
    const speed = clamp(pose.speed, 0, 16), dead = clamp(pose.dead || 0);
    S.time += dt;
    S.move = damp(S.move, sstep(0.5, 8, speed), 8, dt);
    S.rear = damp(S.rear, clamp(pose.rear || 0), 14, dt);
    S.dive = damp(S.dive, clamp(pose.dive || 0), 20, dt);
    S.perch = damp(S.perch, clamp(pose.perch || 0), 12, dt);
    S.stun = damp(S.stun, clamp(pose.stun || 0), 10, dt);
    S.hurt = damp(S.hurt, clamp(pose.hurt || 0), 30, dt);
    S.alert = damp(S.alert, clamp(pose.alert || 0), 14, dt);
    const { move, rear, dive, perch, stun } = S;
    // the beat: quick while it hangs, slower on the ground, held up as it rears, swept back as it dives
    S.phase += TAU * lerp(8.5 + 3 * move, 2.0, perch) * dt * (1 - 0.85 * dive) * (1 - 0.6 * rear);
    const beat = Math.sin(S.phase), amp = lerp(0.85, 0.32, perch);
    const up = lerp(lerp(0.15 + beat * amp, 1.15, rear), 0.5, dive);
    wingR.rotation.z = up; wingL.rotation.z = -up;
    wingR.rotation.y = -0.9 * dive - 0.1 * move; wingL.rotation.y = 0.9 * dive + 0.1 * move;
    // the body: a bob with the beat, nose down in the dive, head back as it rears, tilted forward when it flies fast
    body.position.y = 0.5 + 0.05 * beat * (1 - perch) - 0.04 * stun * Math.sin(S.time * 12) - 0.3 * perch * 0.0;
    body.rotation.x = 0.18 * move + 0.75 * dive - 0.5 * rear - 0.1 * perch + Math.sin(S.time * 6) * 0.1 * stun;
    body.rotation.z = Math.sin(S.time * 4) * 0.06 + Math.sin(S.time * 7) * 0.18 * stun;
    const dim = clamp(1 - 0.5 * stun * (0.5 + 0.5 * Math.sin(S.time * 14)) - dead, 0, 1);
    G.uniforms.uColorMul.value.setRGB(dim, dim, dim);
    const g = (0.8 + 0.25 * Math.sin(S.time * 3.2)) * dim;
    GS.uniforms.uColorMul.value.setRGB(g, g, g);
    if (dead > 0) { const k = sstep(0, 1, dead), s = Math.max(0.0001, 1 - k * k); R.rig.scale.setScalar(s); R.rig.rotation.y = k * 10; } else { R.rig.scale.setScalar(1); R.rig.rotation.y = 0; }
    R.rig.visible = dead < 1;
    if (pose.flash !== undefined) R.flash(clamp(pose.flash, 0, 1));
    const boost = lerp(1.25, 1.05, clamp(U.uDay.value));
    if (Math.abs(boost - (S.boost ?? -1)) > 0.004) { S.boost = boost; R.boost(boost); }
  }

  return {
    root: R.root, radius: 0.75, height: 1.2,
    anchors: { eyes, top },
    testPoses: { idle: {}, fly: { speed: 8 }, rear: { rear: 1 }, dive: { dive: 1, speed: 14 }, perch: { perch: 1, stun: 0.5 }, dead: (t) => ({ dead: Math.min(1, (t % 2.4) / 0.9), t }) },
    update, flash: (k) => R.flash(k), dispose: () => R.dispose(), variant: 'moth',
    get triangleCount() { return R.triangleCount; },
  };
}
