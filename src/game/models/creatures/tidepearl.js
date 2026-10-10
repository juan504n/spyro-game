// TIDE PEARL: the pearl of Tideglass Reach that the hero carries to a lens (systems/missions/deliver.js): a sphere of sea-pearl the size of a head, pale teal-white with a slow shimmer that runs
// round it and a core of light, in a thin ring of brass that turns about it. Lying in its shell-bed it rests on the ground; carried, it floats over the hero's head.
// Faces +z, origin at the middle of the pearl.
// Pose contract (all optional): { carried 0/1 (floats, the ring spins faster), t }
import { U } from '../../../engine/materials.js';
import { Rig, ellipsoid, bar, setBias, clamp, heal, lerp, damp, mix3, TAU, nextSeed, seeded } from './rig.js';

const PEARL = [0.86, 0.96, 0.94], PEARL_HI = [1.0, 1.0, 1.0], PEARL_LO = [0.5, 0.78, 0.8], CORE = [0.6, 1.0, 0.94], BRASS = [0.95, 0.7, 0.28], BRASS_LO = [0.6, 0.4, 0.14];

function pearlGeo(b) {
  setBias(0.45);
  ellipsoid(b, 0, 0, 0, 0.42, 0.42, 0.42, { segs: 10, rings: 5, col: (th) => mix3(PEARL_LO, PEARL_HI, 0.5 + 0.5 * Math.sin(th)) });
}
function coreGeo(b) { ellipsoid(b, 0, 0, 0, 0.26, 0.26, 0.26, { segs: 8, rings: 4, col: (th) => mix3([0.35, 0.8, 0.78], CORE, 0.5 + 0.5 * Math.sin(th)) }); }
function ringGeo(b) {                                   // (a thin brass ring in the x-y plane)
  setBias(0.3);
  const n = 14, r = 0.62;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
    bar(b, [Math.cos(a0) * r, Math.sin(a0) * r, 0], [Math.cos(a1) * r, Math.sin(a1) * r, 0], 0.04, 0.04, i % 2 ? BRASS : BRASS_LO, { segs: 3 });
  }
}

export function createTidepearl(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets, 'tidepearl');
  const M = R.litMat(null), G = R.glowMat(null);
  const rnd = seeded(nextSeed(opts));
  const body = R.pivot(R.rig, 0, 0, 0, 'body');
  R.part(body, M, pearlGeo, 'pearl');
  R.part(body, G, coreGeo, 'core', true);
  const ring = R.pivot(body, 0, 0, 0, 'ring');
  R.part(ring, M, ringGeo, 'ring');
  const S = { time: rnd() * 10, carried: 0 };
  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt, 0, 0.1);
    heal(S);
    S.time += dt;
    S.carried = damp(S.carried, clamp(pose.carried || 0), 8, dt);
    const t = S.time;
    ring.rotation.y = t * (1.2 + 2.5 * S.carried); ring.rotation.x = 0.6 + Math.sin(t * 0.8) * 0.2;
    body.position.y = Math.sin(t * 2) * 0.06 * (0.4 + S.carried);
    const l = 0.7 + 0.3 * Math.sin(t * 3) + 0.4 * S.carried;
    G.uniforms.uColorMul.value.setRGB(l, l, l);
    if (pose.flash !== undefined) R.flash(clamp(pose.flash, 0, 1));
    const boost = lerp(1.25, 1.1, clamp(U.uDay.value));
    if (Math.abs(boost - (S.boost ?? -1)) > 0.004) { S.boost = boost; R.boost(boost); }
  }
  const top = R.pivot(R.rig, 0, 0.7, 0, 'top');
  return {
    root: R.root, radius: 0.5, height: 1.0,
    anchors: { eyes: body, top },
    testPoses: { idle: {}, carried: { carried: 1 } },
    update, flash: (k) => R.flash(k), dispose: () => R.dispose(), variant: 'pearl',
    get triangleCount() { return R.triangleCount; },
  };
}
