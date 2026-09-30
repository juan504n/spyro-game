// SPARX — the dragonfly companion, in 3D: a plump round head with two big goofy eyes and a grin, two curling antennae, a short thorax, a long tapering tail
// that swishes, and two pairs of translucent pink-violet wings with yellow tips that beat. The body takes his health colour (gold = full, then blue, then green:
// setHealth / pose.hp); the wings and eyes keep their own colours. Faces +z, origin at the middle of the thorax; about 0.9 m long and 1.2 m across the wings as modelled, drawn at SIZE 0.6 of that (a little over half a metre long).
//
// Pose contract (all optional): { t, speed 0..24 (how fast he is flying), vy, turn -1..1, hp 3 | 2 | 1 (his colour), hurt 0..1 (flash + wobble),
//   eat 0..1 (a butterfly: chomp), grab 0..1 (a gem flick), vis 0..1 (scale: 0 = gone) }
import { U } from '../../../engine/materials.js';
import {
  Rig, loft, ellipsoid, bar, triDouble, setBias,
  clamp, num, heal, lerp, damp, mix3, TAU, nextSeed, seeded,
} from './rig.js';

/** His body colour by health: gold (full), blue, green. */
export const SPARX_BODY = { 3: [1.0, 0.86, 0.16], 2: [0.30, 0.40, 0.96], 1: [0.28, 0.86, 0.10] };
const SIZE = 0.6;                                        // (half of the 1.2 he was first drawn at: that was too big next to Spyro)
const NIGHT_BOOST = 1.4;                                  // (the twilight is dark: lift him so he glows against it, easing back to 1 by daybreak)

const EYE_W = [1, 1, 1];
const EYE_P = [0.05, 0.04, 0.10];
const MOUTH = [0.28, 0.08, 0.12];
const WING = [[0.56, 0.76, 0.82], [0.66, 0.54, 0.90], [0.92, 0.44, 0.93], [0.80, 0.46, 0.97], [1.0, 0.92, 0.36]];   // root -> tip: teal-grey, lavender, magenta, violet, yellow
const shade = (th) => { const k = 0.80 + 0.20 * clamp(0.5 - 0.5 * Math.sin(th)); return [k, k, k]; };           // lighter underneath, darker on the back

// ---- geometry -----------------------------------------------------------------------------------------------------------------------------
const thoraxGeo = (b) => { setBias(0.35); ellipsoid(b, 0, 0, 0, 0.135, 0.135, 0.20, { segs: 7, rings: 4, col: shade }); };
const headGeo = (b) => { setBias(0.35); ellipsoid(b, 0, 0, 0.03, 0.15, 0.14, 0.14, { segs: 8, rings: 4, col: shade }); };
const eyeGeo = (b) => {
  setBias(0.2);
  for (const s of [1, -1]) ellipsoid(b, s * 0.078, 0.085, 0.085, 0.084, 0.092, 0.084, { segs: 7, rings: 3, col: EYE_W });
};
const pupilGeo = (b) => { setBias(0); ellipsoid(b, 0, 0, 0, 0.044, 0.05, 0.036, { segs: 6, rings: 3, col: EYE_P }); };
const mouthGeo = (b) => {
  setBias(0);
  bar(b, [-0.085, -0.048, 0.118], [0, -0.092, 0.172], 0.016, 0.016, MOUTH);
  bar(b, [0, -0.092, 0.172], [0.085, -0.048, 0.118], 0.016, 0.016, MOUTH);
};
const antennaGeo = (s) => (b) => {
  setBias(0.3);
  const c = [0.78, 0.78, 0.78];
  bar(b, [0, 0, 0], [s * 0.05, 0.14, 0.07], 0.016, 0.013, c);
  bar(b, [s * 0.05, 0.14, 0.07], [s * 0.04, 0.26, 0.19], 0.013, 0.011, c);
  ellipsoid(b, s * 0.04, 0.27, 0.205, 0.03, 0.03, 0.03, { segs: 5, rings: 3, col: [1, 1, 1] });
};
/** one tail segment hanging from its pivot along -z: r0 -> r1 -> r2 radii at the start, middle and end */
const tailGeo = (len, r0, r1, r2) => (b) => {
  setBias(0.35);
  loft(b, [{ z: 0, rx: r0, col: shade }, { z: -len * 0.5, rx: r1, col: shade }, { z: -len, rx: r2, col: shade }], { segs: 6 });
};
/** a wing for the right-hand (+x) side, flat in the XZ plane from its root; sign -1 mirrors it for the left. scale sizes it, tip = the yellow end */
const wingGeo = (sign, scale) => (b) => {
  setBias(0);
  const S = [[0.00, 0.04, -0.04], [0.15, 0.14, -0.10], [0.32, 0.19, -0.20], [0.48, 0.13, -0.19], [0.60, 0.00, -0.06]];    // [x along the span, z leading edge, z trailing edge]
  const P = (x, z) => [sign * x * scale, 0, z * scale];
  for (let i = 0; i < S.length - 1; i++) {
    const L0 = P(S[i][0], S[i][1]), T0 = P(S[i][0], S[i][2]), L1 = P(S[i + 1][0], S[i + 1][1]), T1 = P(S[i + 1][0], S[i + 1][2]);
    const c0 = WING[i], c1 = WING[i + 1];
    triDouble(b, L0, T0, L1, c0, c0, c1);
    triDouble(b, T0, T1, L1, c0, c1, c1);
  }
  const L = S[S.length - 1];
  triDouble(b, P(L[0], L[1]), P(L[0], L[2]), P(0.69, -0.03), WING[4], WING[4], WING[4]);
};

// ---- the model ----------------------------------------------------------------------------------------------------------------------------
export function createSparx(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets, 'sparx');
  const MB = R.litMat(null);                                   // body: takes the health colour
  const MW = R.litMat(null, { mode: 'half' });                 // wings: see-through
  const ME = R.litMat(null);                                   // eyes, pupils, grin, antennae tips: their own colours
  MW.uniforms.uAlpha.value = 1.5;
  const rnd = seeded(nextSeed(opts));

  const body = R.pivot(R.rig, 0, 0, 0, 'body');
  R.part(body, MB, thoraxGeo, 'thorax');
  const head = R.pivot(body, 0, 0.035, 0.27, 'head');
  R.part(head, MB, headGeo, 'head');
  R.part(head, ME, eyeGeo, 'eyes');
  const pupils = [1, -1].map((s) => { const p = R.pivot(head, s * 0.072, 0.092, 0.158, s > 0 ? 'pupilL' : 'pupilR'); R.part(p, ME, pupilGeo, 'pupil'); return p; });
  R.part(head, ME, mouthGeo, 'grin');
  const antennae = [1, -1].map((s) => { const p = R.pivot(head, s * 0.05, 0.11, 0.06, s > 0 ? 'antL' : 'antR'); p.rotation.order = 'ZXY'; R.part(p, MB, antennaGeo(s), 'antenna' + s); return p; });
  // the tail: three segments in a chain, so it can swish and curl
  const t1 = R.pivot(body, 0, -0.01, -0.15, 'tail1');
  R.part(t1, MB, tailGeo(0.25, 0.105, 0.088, 0.072), 'tail1');
  const t2 = R.pivot(t1, 0, 0, -0.25, 'tail2');
  R.part(t2, MB, tailGeo(0.25, 0.072, 0.054, 0.04), 'tail2');
  const t3 = R.pivot(t2, 0, 0, -0.25, 'tail3');
  R.part(t3, MB, tailGeo(0.23, 0.04, 0.024, 0.0), 'tail3');
  // the wings: a big pair in front, a smaller pair behind, each pivoting at its root on the thorax's back
  const wing = (s, z, scale, name) => {
    const p = R.pivot(body, s * 0.045, 0.115, z, name);
    p.rotation.order = 'ZYX';
    R.part(p, MW, wingGeo(s, scale), name).renderOrder = 9;           // (see-through: drawn after the water, or the lake would paint over them)
    return p;
  };
  const wings = { fr: wing(1, 0.075, 1.0, 'wingFR'), fl: wing(-1, 0.075, 1.0, 'wingFL'), br: wing(1, -0.09, 0.74, 'wingBR'), bl: wing(-1, -0.09, 0.74, 'wingBL') };
  const anchors = { top: R.pivot(body, 0, 0.25, 0, 'top'), mouth: R.pivot(head, 0, -0.06, 0.17, 'mouth') };

  const S = {
    t: rnd() * 10, flap: rnd() * TAU, tail: rnd() * TAU, hp: 3, col: SPARX_BODY[3].slice(), boost: -1, squash: 0, vis: 1, look: 0, lookT: 1, lookTarget: 0,
  };
  const model = {
    root: R.root,
    radius: 0.45,
    height: 0.5,
    anchors,
    tris: R.triangleCount,
    get hp() { return S.hp; },
    /** his colour: 3 gold (full), 2 blue, 1 green (anything else counts as green) */
    setHealth(hp) { S.hp = hp >= 3 ? 3 : hp === 2 ? 2 : 1; },
    flash: (k) => R.flash(k),
    update(dt, pose) {
      pose = pose || {};
      dt = clamp(num(dt, 0.016), 0, 0.1);
      S.t = pose.t !== undefined ? num(pose.t, S.t) : S.t + dt;
      if (pose.hp !== undefined) model.setHealth(pose.hp);
      const speed = clamp(num(pose.speed), 0, 30), sp = clamp(speed / 14);
      const vy = clamp(num(pose.vy), -12, 12), turn = clamp(num(pose.turn), -1, 1);
      const hurt = clamp(num(pose.hurt)), eat = clamp(num(pose.eat)), grab = clamp(num(pose.grab));
      const vis = pose.vis === undefined ? 1 : clamp(num(pose.vis, 1));
      const t = S.t;

      // colour: ease towards his health colour, lifted at night
      S.col = mix3(S.col, SPARX_BODY[S.hp], 1 - Math.exp(-dt * 9));
      const boost = lerp(NIGHT_BOOST, 1.05, clamp(U.uDay.value));
      MB.uniforms.uColorMul.value.setRGB(S.col[0] * boost, S.col[1] * boost, S.col[2] * boost);
      MW.uniforms.uColorMul.value.setRGB(boost * 0.88, boost * 0.85, boost * 0.92);     // (the wings stay a saturated pink-violet)
      ME.uniforms.uColorMul.value.setRGB(boost, boost, boost);
      R.flash(hurt * 0.8);

      // wings: a fast beat (quicker when he is darting about); the pairs are out of step, and each sweeps forward and back as it beats
      S.flap = (S.flap + dt * (9 + 3 * sp + 4 * grab) * TAU) % (TAU * 1000);
      const beat = Math.sin(S.flap), beat2 = Math.sin(S.flap + 1.5), sweep = Math.cos(S.flap);
      wings.fr.rotation.z = 0.30 + 0.78 * beat;       wings.fl.rotation.z = -(0.30 + 0.78 * beat);
      wings.br.rotation.z = 0.22 + 0.70 * beat2;      wings.bl.rotation.z = -(0.22 + 0.70 * beat2);
      wings.fr.rotation.y = -0.22 * sweep;            wings.fl.rotation.y = 0.22 * sweep;
      wings.br.rotation.y = -0.18 * Math.cos(S.flap + 1.5); wings.bl.rotation.y = 0.18 * Math.cos(S.flap + 1.5);

      // body: bob and hover, nose down when he is speeding along, rolling into turns, a wobble when hurt
      const bob = 0.03 * Math.sin(t * 5.2) + 0.012 * Math.sin(t * 11);
      const pitch = -0.30 * sp - 0.03 * vy + 0.05 * Math.sin(t * 2.6) + 0.35 * grab;
      const roll = -0.5 * turn + 0.05 * Math.sin(t * 3.3) + hurt * 0.6 * Math.sin(t * 38);
      body.position.y = bob;
      body.rotation.x = damp(body.rotation.x, pitch, 10, dt);
      body.rotation.z = damp(body.rotation.z, roll, 10, dt);

      // the tail swishes, a little behind the body, with the tip curling up
      S.tail = (S.tail + dt * (3.2 + 4.5 * sp) * TAU) % (TAU * 1000);
      const amp = 0.16 + 0.22 * sp;
      t1.rotation.y = amp * 0.8 * Math.sin(S.tail);
      t2.rotation.y = amp * 1.1 * Math.sin(S.tail - 0.9);
      t3.rotation.y = amp * 1.4 * Math.sin(S.tail - 1.8);
      t1.rotation.x = -0.10 + 0.05 * Math.sin(t * 2.1);
      t2.rotation.x = -0.04;
      t3.rotation.x = 0.36 + 0.10 * Math.sin(t * 2.7);

      // the head: a nod, a chomp when he eats; the pupils wander about; the antennae sway
      head.rotation.x = 0.06 * Math.sin(t * 2.3) + 0.35 * Math.sin(Math.PI * eat);
      head.rotation.y = 0.12 * Math.sin(t * 1.3);
      S.lookT -= dt;
      if (S.lookT <= 0) { S.lookT = 0.8 + rnd() * 2.2; S.lookTarget = (rnd() - 0.5) * 2; }
      S.look = damp(S.look, S.lookTarget, 8, dt);
      for (const p of pupils) p.position.x = Math.sign(p.position.x || 1) * 0.072 + 0.024 * S.look;
      for (let i = 0; i < 2; i++) { const a = antennae[i]; a.rotation.z = (i ? -1 : 1) * 0.10 * Math.sin(t * 3.1 + i) ; a.rotation.x = 0.12 * Math.sin(t * 2.4 + i * 2) + 0.2 * hurt; }

      // squash when eating or grabbing, and the size: 0 = gone (he flies off and shrinks away)
      const sq = 0.16 * Math.sin(Math.PI * eat) + 0.10 * Math.sin(Math.PI * grab);
      R.rig.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
      R.root.scale.setScalar(Math.max(0.0001, vis) * SIZE);
      R.root.visible = vis > 0.02;
      heal(S);
    },
    testPoses: {
      gold: { hp: 3 }, blue: { hp: 2 }, green: { hp: 1 },
      zoom: { hp: 3, speed: 16, turn: 0.4 }, hurt: { hp: 2, hurt: 0.9 }, eat: { hp: 2, eat: 0.5 },
    },
    dispose: () => R.dispose(),
  };
  model.setHealth(opts.hp ?? 3);
  S.col = SPARX_BODY[S.hp].slice();
  model.update(0, { t: 0 });
  return model;
}
