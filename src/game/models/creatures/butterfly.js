// BUTTERFLY — the blue butterfly, in 3D: a slim banded body with a furry thorax and a small head with two clubbed antennae, and on each side a pointed forewing and a rounder hindwing
// with a little tail. The wings are two-sided thin sheets: the top is a deep blue that brightens to a vivid sheen in the middle and ends in a dark rim with white spots, the underside
// a dusty pale blue, so a butterfly flashes blue and dull as it beats. They beat in bursts and glide between them, the body bobbing with each stroke (the healing ones never stop).
// Faces +z, origin at the middle of the thorax; about 0.7 m long and 0.95 m across the wings as modelled, drawn at `opts.scale` of that (0.6 by default: ambient ones 0.45 to 0.65, healing ones 0.75).
//
// Looks (opts.look): azure (the classic), cyan, violet, sky (pale) and shiny (the healing butterfly: brighter and more saturated; the game adds its own glow).
// Pose contract (all optional): { t, flap 0..1 (1 = beating, 0 = gliding; left out: the butterfly alternates by itself), speed 0..20 (how fast it flies: quicker beats),
//   vy (climbing / sinking), turn -1..1 (banks into it), wing (radians: hold the wings at this angle, 0 flat, 1.4 folded up; for the viewer and the tests), vis 0..1 (scale: 0 = gone) }
// opts: look, scale, hover (metres above the origin, for the viewer), still (no random glides: repeatable renders), seed.
// Every butterfly of a look shares its geometry, and all of them share ONE material (the colour comes from the vertices), so a flock costs three small draw calls each.
import { U } from '../../../engine/materials.js';
import {
  Rig, loft, ellipsoid, bar, triC, setBias,
  clamp, num, heal, lerp, damp, sstep, mix3, TAU, nextSeed, seeded,
} from './rig.js';

const WHITE = [0.97, 0.98, 1.0];
/** The colours of each look. Top of the wing: root (by the body), mid, hi (the sheen), rim (the dark edge); under / underRim: the underside; body. */
export const BUTTERFLY_LOOKS = {
  azure:  { root: [0.09, 0.12, 0.52], mid: [0.16, 0.42, 1.00], hi: [0.42, 0.74, 1.00], rim: [0.03, 0.05, 0.28], under: [0.55, 0.62, 0.92], underRim: [0.28, 0.27, 0.52], body: [0.09, 0.11, 0.30], band: [0.20, 0.26, 0.62] },
  cyan:   { root: [0.04, 0.22, 0.42], mid: [0.10, 0.74, 0.92], hi: [0.45, 0.98, 1.00], rim: [0.02, 0.12, 0.30], under: [0.56, 0.80, 0.90], underRim: [0.22, 0.34, 0.50], body: [0.05, 0.14, 0.28], band: [0.14, 0.42, 0.62] },
  violet: { root: [0.20, 0.10, 0.50], mid: [0.48, 0.42, 1.00], hi: [0.78, 0.68, 1.00], rim: [0.09, 0.05, 0.30], under: [0.68, 0.62, 0.92], underRim: [0.34, 0.26, 0.52], body: [0.14, 0.09, 0.32], band: [0.32, 0.26, 0.66] },
  sky:    { root: [0.30, 0.46, 0.84], mid: [0.68, 0.88, 1.00], hi: [0.92, 1.00, 1.00], rim: [0.18, 0.32, 0.66], under: [0.80, 0.88, 0.98], underRim: [0.42, 0.50, 0.70], body: [0.16, 0.20, 0.42], band: [0.36, 0.46, 0.76] },
  shiny:  { root: [0.05, 0.14, 0.70], mid: [0.10, 0.46, 1.00], hi: [0.28, 0.80, 1.00], rim: [0.03, 0.07, 0.42], under: [0.52, 0.72, 1.00], underRim: [0.22, 0.34, 0.70], body: [0.06, 0.12, 0.44], band: [0.22, 0.48, 0.90] },
};
const NIGHT_BOOST = 1.25;                 // (the twilight is dark: lift them so they glow against it, easing back to 1 by daybreak)

// ---- the wings ---------------------------------------------------------------------------------------------------------------------------
// One side's outline in the wing's own plane: [x out from the body, z forward]. The forewing points out and forward, the hindwing back, with a short tail.
const FORE = [[0.000, 0.045], [0.080, 0.100], [0.180, 0.155], [0.290, 0.200], [0.385, 0.225], [0.455, 0.212], [0.425, 0.135], [0.400, 0.060], [0.355, -0.005], [0.280, -0.050], [0.175, -0.062], [0.070, -0.048], [0.000, -0.022]];
const HIND = [[0.000, -0.015], [0.090, -0.040], [0.190, -0.070], [0.280, -0.108], [0.335, -0.170], [0.342, -0.250], [0.305, -0.315], [0.250, -0.350], [0.218, -0.420], [0.180, -0.350], [0.125, -0.312], [0.062, -0.245], [0.000, -0.120]];
const FORE_SPOTS = [[0.395, 0.125, 0.016], [0.372, 0.058, 0.019], [0.332, -0.002, 0.015]];                 // white dots just inside the rim: [x, z, radius]
const HIND_SPOTS = [[0.308, -0.172, 0.018], [0.308, -0.250, 0.020], [0.272, -0.308, 0.016]];
const CAMBER = 0.05;                     // the wing rises this much towards its tip (a shallow cup, so the light rolls across it)
const camber = (ax) => CAMBER * (ax / 0.4) * (ax / 0.4);
const camberSlope = (ax) => 2 * CAMBER * ax / 0.16;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** One wing of the +x side (sign 1) or the -x side (sign -1), flat apart from its camber: a dark rim band, a bright middle, the white spots; the top and the underside are separate faces. */
function wingPoly(b, pts, spots, sign, y0, look, tailTipIndex) {
  const C = [0, 0];
  for (const p of pts) { C[0] += p[0] / pts.length; C[1] += p[1] / pts.length; }
  const K = 0.68;                                                          // where the bright middle starts (as a fraction of the way out from the centre)
  const P3 = (x, z) => [sign * x, y0 + camber(x), z];
  const top = (ax) => { const s = camberSlope(ax); return nrm([-sign * s, 1, 0]); };
  const rootness = (x) => 1 - sstep(0.02, 0.13, x);                        // 1 by the body, 0 from 13 cm out
  const rimCol = (p, i) => mix3(look.rim, look.root, rootness(p[0]));
  const midCol = (p) => {
    const sheen = sstep(0.04, 0.26, p[0]) * (1 - clamp(Math.abs(p[1] - C[1]) * 3.2));
    return mix3(mix3(look.root, look.mid, sstep(0.0, 0.16, p[0])), look.hi, sheen * 0.85);
  };
  const underMid = (p) => mix3(mix3(look.underRim, look.under, sstep(0.0, 0.1, p[0])), WHITE, 0.12 * sstep(0.1, 0.3, p[0]));
  const ring = pts.map((p) => P3(p[0], p[1]));
  const inner = pts.map((p) => [C[0] + (p[0] - C[0]) * K, C[1] + (p[1] - C[1]) * K]);
  const innerP = inner.map((p) => P3(p[0], p[1]));
  const centre = P3(C[0], C[1]);
  const n = pts.length;
  // the triangles: [p0, p1, p2, top colours, underside colours, x of each vertex (for its normal)]
  const face = (p0, p1, p2, ct, cu, ax) => {
    const nt = ax.map(top);
    triC(b, p0, p1, p2, ct[0], ct[1], ct[2], nt[0], nt[1], nt[2]);
    const nu = nt.map((v) => [-v[0], -v[1], -v[2]]);
    triC(b, p0, p1, p2, cu[0], cu[1], cu[2], nu[0], nu[1], nu[2]);
  };
  const rimC = pts.map((p, i) => (i === tailTipIndex ? mix3(rimCol(p, i), look.hi, 0.25) : rimCol(p, i)));
  const rimU = pts.map((p) => mix3(look.underRim, look.under, rootness(p[0]) * 0.8));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // the rim band between the outline and the bright middle
    face(ring[i], ring[j], innerP[j], [rimC[i], rimC[j], midCol(inner[j])], [rimU[i], rimU[j], underMid(inner[j])], [pts[i][0], pts[j][0], inner[j][0]]);
    face(ring[i], innerP[j], innerP[i], [rimC[i], midCol(inner[j]), midCol(inner[i])], [rimU[i], underMid(inner[j]), underMid(inner[i])], [pts[i][0], inner[j][0], inner[i][0]]);
    // the bright middle
    face(innerP[i], innerP[j], centre, [midCol(inner[i]), midCol(inner[j]), look.hi], [underMid(inner[i]), underMid(inner[j]), look.under], [inner[i][0], inner[j][0], C[0]]);
  }
  // the white spots: little fans floating a hair above the top of the wing (the underside has a few, fainter, below)
  for (const [sx, sz, r] of spots) {
    const c0 = P3(sx, sz);
    const rp = [];
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + 0.3; rp.push(P3(sx + Math.cos(a) * r, sz + Math.sin(a) * r * 1.15)); }
    const nt = top(sx);
    for (let k = 0; k < 5; k++) {
      const a = [c0[0], c0[1] + 0.003, c0[2]], c = [rp[k][0], rp[k][1] + 0.003, rp[k][2]], d = [rp[(k + 1) % 5][0], rp[(k + 1) % 5][1] + 0.003, rp[(k + 1) % 5][2]];
      triC(b, a, c, d, WHITE, mix3(WHITE, look.hi, 0.35), mix3(WHITE, look.hi, 0.35), nt, nt, nt);
      const nu = [-nt[0], -nt[1], -nt[2]];
      const ua = [c0[0], c0[1] - 0.003, c0[2]], uc = [rp[k][0], rp[k][1] - 0.003, rp[k][2]], ud = [rp[(k + 1) % 5][0], rp[(k + 1) % 5][1] - 0.003, rp[(k + 1) % 5][2]];
      triC(b, ua, uc, ud, WHITE, mix3(WHITE, look.under, 0.5), mix3(WHITE, look.under, 0.5), nu, nu, nu);
    }
  }
}

const wingGeo = (look, sign) => (b) => {
  setBias(0);
  wingPoly(b, FORE, FORE_SPOTS, sign, 0.006, look, -1);
  wingPoly(b, HIND, HIND_SPOTS, sign, -0.006, look, 8);                   // (the hindwing sits a hair below the forewing where they meet)
};

// ---- the body ----------------------------------------------------------------------------------------------------------------------------
const bodyGeo = (look) => (b) => {
  setBias(0.3);
  const bandCol = (th, i) => (i % 2 ? look.band : look.body);
  const belly = (th, i) => mix3(i % 2 ? look.band : look.body, WHITE, 0.12 * sstep(0.2, 1.0, -Math.sin(th)));
  // the abdomen: a slim tube behind the thorax, banded, tapering to a point
  loft(b, [
    { z: 0.00, rx: 0.030, ry: 0.030, col: look.body },
    { z: -0.06, rx: 0.029, ry: 0.028, col: belly },
    { z: -0.12, rx: 0.026, ry: 0.025, col: bandCol },
    { z: -0.18, rx: 0.020, ry: 0.019, col: belly },
    { z: -0.24, rx: 0.011, ry: 0.011, col: bandCol },
    { z: -0.29, rx: 0.0, ry: 0.0, col: look.body },
  ], { segs: 6 });
  // the thorax: furry, a little broader than the abdomen
  ellipsoid(b, 0, 0.004, 0.04, 0.044, 0.044, 0.062, { segs: 6, rings: 3, col: mix3(look.body, look.band, 0.35) });
  // the head, two dark eyes either side, and a pale nose
  ellipsoid(b, 0, 0.006, 0.118, 0.032, 0.033, 0.032, { segs: 6, rings: 3, col: look.body });
  for (const s of [1, -1]) ellipsoid(b, s * 0.022, 0.014, 0.128, 0.013, 0.015, 0.013, { segs: 4, rings: 2, col: [0.02, 0.02, 0.06] });
  // the antennae: two thin stalks sweeping up and out, each with a little club
  const stalk = [0.70, 0.74, 0.92];
  for (const s of [1, -1]) {
    bar(b, [s * 0.012, 0.030, 0.128], [s * 0.052, 0.105, 0.205], 0.0055, 0.0040, stalk, { segs: 3 });
    bar(b, [s * 0.052, 0.105, 0.205], [s * 0.078, 0.128, 0.262], 0.0040, 0.0032, stalk, { segs: 3 });
    ellipsoid(b, s * 0.078, 0.128, 0.266, 0.011, 0.011, 0.016, { segs: 4, rings: 2, col: mix3(look.band, WHITE, 0.4) });
  }
};

// ---- the model ---------------------------------------------------------------------------------------------------------------------------
export function createButterfly(assets, opts) {
  opts = opts || {};
  const lookName = BUTTERFLY_LOOKS[opts.look] ? opts.look : 'azure';
  const look = BUTTERFLY_LOOKS[lookName];
  const scale = num(opts.scale, 0.6);
  const R = new Rig(assets, 'butterfly:' + lookName);
  const M = assets.mat(null, { lit: true, tag: 'butterfly' });     // one lit material for every part of every butterfly (the colours are in the vertices)
  const rnd = seeded(nextSeed(opts));

  const body = R.pivot(R.rig, 0, num(opts.hover, 0), 0, 'body');
  R.part(body, M, bodyGeo(look), 'body');
  const wingR = R.pivot(body, 0.028, 0.030, 0.030, 'wingR');
  const wingL = R.pivot(body, -0.028, 0.030, 0.030, 'wingL');
  wingR.rotation.order = 'ZYX'; wingL.rotation.order = 'ZYX';
  R.part(wingR, M, wingGeo(look, 1), 'wingR');
  R.part(wingL, M, wingGeo(look, -1), 'wingL');
  const anchors = { top: R.pivot(body, 0, 0.12, 0, 'top') };

  const S = { t: rnd() * 10, flap: rnd() * TAU, amp: 1, flutter: true, cycle: 0.6 + rnd() * 2, pitch: 0, roll: 0, ang: 0.4, hover: num(opts.hover, 0) };
  const still = !!opts.still;
  const boostOf = () => lerp(NIGHT_BOOST, 1.05, clamp(U.uDay.value));

  const model = {
    root: R.root,
    radius: 0.3,
    height: 0.2,
    anchors,
    tris: R.triangleCount,
    look: lookName,
    flash: () => {},
    update(dt, pose) {
      pose = pose || {};
      dt = clamp(num(dt, 0.016), 0, 0.1);
      S.t = pose.t !== undefined ? num(pose.t, S.t) : S.t + dt;
      const speed = clamp(num(pose.speed), 0, 20), sp = clamp(speed / 9);
      const vy = clamp(num(pose.vy), -8, 8), turn = clamp(num(pose.turn), -1, 1);
      const vis = pose.vis === undefined ? 1 : clamp(num(pose.vis, 1));
      const t = S.t;

      // beating or gliding: told by the game (pose.flap), or alternating by itself, a few beats and then a short glide with the wings held in a shallow V
      let want;
      if (pose.flap !== undefined) want = clamp(num(pose.flap));
      else if (still) want = 1;
      else {
        S.cycle -= dt;
        if (S.cycle <= 0) { S.flutter = !S.flutter; S.cycle = S.flutter ? 1.1 + rnd() * 2.4 : 0.4 + rnd() * 0.7; }
        want = S.flutter ? 1 : 0;
      }
      S.amp = damp(S.amp, want, 12, dt);
      const rate = 4.4 + 3.4 * sp + 1.4 * clamp(vy / 4, 0, 1);                 // beats per second: quicker when it is flying hard or climbing
      S.flap = (S.flap + dt * rate * TAU * (0.35 + 0.65 * S.amp)) % (TAU * 1000);
      const beat = Math.sin(S.flap) + 0.22 * Math.sin(2 * S.flap - 0.5);       // (a quick downstroke, a slower upstroke)
      const glide = 0.42 + 0.05 * Math.sin(t * 2.3);
      S.ang = pose.wing !== undefined ? num(pose.wing) : lerp(glide, 0.36 + 1.0 * beat, S.amp);
      wingR.rotation.z = S.ang;           wingL.rotation.z = -S.ang;
      const sweep = 0.22 * S.amp * Math.cos(S.flap);                            // (the wings sweep forward on the downstroke)
      wingR.rotation.y = -sweep;          wingL.rotation.y = sweep;

      // the body: rises on each downstroke, noses up when climbing and down when sinking, banks into turns
      body.position.y = S.hover + 0.045 * S.amp * Math.cos(S.flap);
      const pitch = -0.30 * clamp(vy / 4, -1, 1) + 0.16 * S.amp * Math.sin(S.flap + 0.6) + 0.10 * (1 - S.amp);
      S.pitch = damp(S.pitch, pitch, 12, dt);
      S.roll = damp(S.roll, -0.55 * turn + 0.05 * Math.sin(t * 2.9), 10, dt);
      body.rotation.x = S.pitch;
      body.rotation.z = S.roll;

      // the colour multiplier is the shared material's: every butterfly says the same thing, so this is cheap and consistent
      const k = boostOf();
      M.uniforms.uColorMul.value.setRGB(k, k, k);
      R.root.scale.setScalar(Math.max(0.0001, vis) * scale);
      R.root.visible = vis > 0.02;
      heal(S);
    },
    testPoses: {
      flutter: { flap: 1 },
      glide: { flap: 0 },
      spread: { wing: 0 },
      vee: { wing: 0.55 },
      folded: { wing: 1.35 },
      down: { wing: -0.5 },
      dart: { flap: 1, speed: 14, vy: 3, turn: 0.4 },
    },
    dispose: () => R.dispose(),
  };
  model.update(0, { t: 0 });
  return model;
}
