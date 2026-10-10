// BLOOM SPRITE: a little spirit of a Frostbloom, that sleeps in a cocoon of ice and, freed, follows the hero (missions/rescue.js). A bud of pale light the size of a fist, a ring of four
// pink-and-white petals that turn about it like a propeller, and two small glassy wings that beat. It bobs as it floats; carried to the Heartbloom it opens all its petals and sinks into it.
// Faces +z, origin at the middle of the bud.
// Pose contract (all optional): { speed (how fast it flies), bloom 0..1 (petals open wide: it is being planted), hurt 0..1, t }
import { U } from '../../../engine/materials.js';
import { Rig, ellipsoid, spike, triDouble, setBias, clamp, heal, lerp, sstep, damp, mix3, TAU, nextSeed, seeded } from './rig.js';

const PINK = [1.0, 0.62, 0.8], PINK_HI = [1.0, 0.86, 0.94], PINK_LO = [0.82, 0.4, 0.64], CORE = [1.0, 0.96, 0.9], WING = [0.8, 0.94, 1.0], WING_RIM = [0.5, 0.78, 0.95];

function budGeo(b) {
  setBias(0.4);
  ellipsoid(b, 0, 0, 0, 0.22, 0.24, 0.22, { segs: 8, rings: 4, col: (th) => mix3(PINK_LO, PINK_HI, 0.5 + 0.5 * Math.sin(th)) });
  spike(b, [0, 0.2, 0], [0, 1, 0], 0.22, 0.08, { segs: 4, col: PINK, tip: PINK_HI });
}
function coreGeo(b) {                                   // (unlit: the light inside, a hair bigger than the bud's middle)
  ellipsoid(b, 0, 0, 0, 0.14, 0.14, 0.14, { segs: 6, rings: 3, col: (th) => mix3(PINK_HI, CORE, 0.5 + 0.5 * Math.sin(th)) });
}
function petalGeo(b) {                                  // (petal frame: the root at the origin, the petal leans out along +x)
  setBias(0.4);
  spike(b, [0.05, 0, 0], [1, 0.25, 0], 0.5, 0.15, { segs: 4, col: PINK, tip: PINK_HI });
}
function wingGeo(sign) {
  return (b) => {
    const P = (x, y, z = 0) => [sign * x, y, z];
    const pts = [[0.12, 0.0], [0.45, 0.2], [0.62, 0.02], [0.4, -0.16]];
    const c = P(0.32, 0.02);
    for (let i = 0; i < pts.length; i++) { const a = pts[i], d = pts[(i + 1) % pts.length]; triDouble(b, P(a[0], a[1]), P(d[0], d[1]), c, WING_RIM, WING_RIM, WING); }
  };
}

export function createBloomsprite(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets, 'bloomsprite');
  const M = R.litMat(null), G = R.glowMat(null);
  const rnd = seeded(nextSeed(opts));
  const body = R.pivot(R.rig, 0, 0, 0, 'body');
  R.part(body, M, budGeo, 'bud');
  R.part(body, G, coreGeo, 'core', true);
  const petals = [];
  for (let i = 0; i < 4; i++) { const p = R.pivot(body, 0, 0.02, 0, 'petal' + i); p.rotation.y = (i / 4) * TAU; R.part(p, M, petalGeo, 'petal'); petals.push(p); }
  const wings = [];
  for (const s of [-1, 1]) { const w = R.pivot(body, s * 0.1, 0.1, -0.05, 'wing' + s); R.part(w, M, wingGeo(s), 'wing' + s); wings.push({ w, s }); }
  const S = { time: rnd() * 10, move: 0, bloom: 0, hurt: 0 };
  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt, 0, 0.1);
    heal(S);
    S.time += dt;
    S.move = damp(S.move, sstep(0.3, 8, clamp(pose.speed, 0, 14)), 8, dt);
    S.bloom = damp(S.bloom, clamp(pose.bloom || 0), 6, dt);
    S.hurt = damp(S.hurt, clamp(pose.hurt || 0), 30, dt);
    const t = S.time;
    body.position.y = Math.sin(t * 3.3) * 0.08;
    body.rotation.x = -0.25 * S.move;                                         // (leans into its flight)
    petals.forEach((p, i) => { p.rotation.y = (i / 4) * TAU + t * (2.2 + 4 * S.move + 3 * S.bloom); p.rotation.z = lerp(0.3, -0.45, S.bloom) + Math.sin(t * 5 + i) * 0.06; p.scale.setScalar(1 + 0.6 * S.bloom); });
    wings.forEach(({ w, s }) => { w.rotation.z = s * (0.5 + Math.sin(t * 30) * 0.55); });
    const l = 0.8 + 0.2 * Math.sin(t * 4) + 0.5 * S.bloom;
    G.uniforms.uColorMul.value.setRGB(l, l, l);
    if (pose.flash !== undefined) R.flash(clamp(pose.flash, 0, 1));
    const boost = lerp(1.25, 1.1, clamp(U.uDay.value));
    if (Math.abs(boost - (S.boost ?? -1)) > 0.004) { S.boost = boost; R.boost(boost); }
  }
  const top = R.pivot(R.rig, 0, 0.5, 0, 'top');
  return {
    root: R.root, radius: 0.35, height: 0.7,
    anchors: { eyes: body, top },
    testPoses: { idle: {}, fly: { speed: 8 }, bloom: { bloom: 1 } },
    update, flash: (k) => R.flash(k), dispose: () => R.dispose(), variant: 'sprite',
    get triangleCount() { return R.triangleCount; },
  };
}
