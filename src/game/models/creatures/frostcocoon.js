// FROST COCOON: the ice a Frostbloom Sprite sleeps in (systems/missions/rescue.js): a dome of tall blue-white ice shards, leaning in over the bloom like the fingers of a fist, 3.4 m high and 3.4 m
// across, on a skirt of frozen snow, with a soft pink light that shows through between the shards (the sprite). Rammed, it trembles and cracks; the mission breaks it (the model is then hidden and
// shards fly).
// Faces +z, origin at the ground under the middle.
// Pose contract (all optional): { shake 0..1 (a blow that did not break it: rattles), t }
import { U } from '../../../engine/materials.js';
import { Rig, ellipsoid, spike, setBias, clamp, heal, lerp, sstep, damp, mix3, TAU, nextSeed, seeded } from './rig.js';

const ICE = [0.74, 0.88, 1.0], ICE_HI = [0.94, 0.98, 1.0], ICE_LO = [0.44, 0.64, 0.9], SNOW = [0.94, 0.96, 1.0], SNOW_LO = [0.72, 0.8, 0.94], GLOW = [1.0, 0.7, 0.86];

function shardsGeo(b) {
  setBias(0.5);
  for (let i = 0; i < 11; i++) {                                              // the tall ring
    const a = (i / 11) * TAU + 0.15, r = 1.45 + 0.1 * Math.sin(i * 2.7);
    const h = 3.0 + 0.5 * Math.sin(i * 1.9);
    spike(b, [Math.cos(a) * r, 0.0, Math.sin(a) * r], [-Math.cos(a) * 0.55, 1, -Math.sin(a) * 0.55], h, 0.34, { segs: 5, col: ICE_LO, tip: ICE_HI });
  }
  for (let i = 0; i < 8; i++) {                                               // the shorter ring in front of it, leaning out
    const a = (i / 8) * TAU + 0.5, r = 1.85;
    spike(b, [Math.cos(a) * r, 0.0, Math.sin(a) * r], [Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3], 1.5 + 0.3 * Math.sin(i * 3.1), 0.3, { segs: 4, col: ICE, tip: ICE_HI });
  }
}
function skirtGeo(b) {
  setBias(0.4);
  b.lathe([[2.5, 0.0], [2.4, 0.15], [2.0, 0.35], [1.4, 0.45], [0.0, 0.5]], 10, { color: (x, y) => mix3(SNOW_LO, SNOW, clamp(y / 0.5)) });
}
function glowGeo(b) {                                                         // (unlit: the light of the sleeper, between the shards)
  ellipsoid(b, 0, 1.55, 0, 0.7, 0.9, 0.7, { segs: 8, rings: 4, col: (th) => mix3([0.8, 0.45, 0.62], GLOW, 0.5 + 0.5 * Math.sin(th)) });
}

export function createFrostcocoon(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets, 'frostcocoon');
  const M = R.litMat(null), G = R.glowMat(null);
  const rnd = seeded(nextSeed(opts));
  const body = R.pivot(R.rig, 0, 0, 0, 'body');
  R.part(body, M, skirtGeo, 'skirt');
  R.part(body, M, shardsGeo, 'shards');
  const core = R.pivot(body, 0, 0, 0, 'core');
  R.part(core, G, glowGeo, 'glow', true);
  const S = { time: rnd() * 10, shake: 0 };
  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt, 0, 0.1);
    heal(S);
    S.time += dt;
    S.shake = damp(S.shake, clamp(pose.shake || 0), 12, dt);
    const t = S.time;
    body.rotation.z = Math.sin(t * 50) * 0.03 * S.shake; body.rotation.x = Math.cos(t * 43) * 0.03 * S.shake;
    const l = 0.55 + 0.2 * Math.sin(t * 2.2);
    G.uniforms.uColorMul.value.setRGB(l, l, l);
    core.scale.setScalar(1 + 0.05 * Math.sin(t * 2.2));
    const boost = lerp(1.2, 1.08, clamp(U.uDay.value));
    if (Math.abs(boost - (S.boost ?? -1)) > 0.004) { S.boost = boost; R.boost(boost); }
  }
  const top = R.pivot(R.rig, 0, 3.4, 0, 'top');
  return {
    root: R.root, radius: 1.9, height: 3.4,
    anchors: { eyes: core, top },
    testPoses: { idle: {}, hit: { shake: 1 } },
    update, flash: (k) => R.flash(k), dispose: () => R.dispose(), variant: 'cocoon',
    get triangleCount() { return R.triangleCount; },
  };
}
