// DUSTMOLE: a mole that lives in soft ground (foes/burrow.js). Underground it is only a mound of loose earth that wobbles along; when the ground cracks the mound shudders, and when it
// bursts the mole is out of it for a moment: velvet grey-brown, a long pink snout, two huge pale spade-hands, eyes that glow. It sits there dazed with its head swinging before it digs in.
// Faces +z, origin at the ground; the mound is 1 m across and 0.45 m high, the mole 1.1 m when it is out.
// Pose contract (all optional): { under 0..1 (1: underground, only the mound shows; 0: out), speed (the mound moves), crack 0..1 (the ground shudders), stun 0..1 (dazed), alert 0..1, hurt 0..1, dead 0..1, t }
import { U } from '../../../engine/materials.js';
import { Rig, ellipsoid, spike, setBias, triF, clamp, heal, lerp, sstep, damp, mix3, TAU, nextSeed, seeded } from './rig.js';

const DIRT = [0.45, 0.32, 0.2], DIRT_HI = [0.6, 0.45, 0.3], DIRT_LO = [0.3, 0.2, 0.13];
const VELVET = [0.34, 0.3, 0.36], VELVET_HI = [0.5, 0.45, 0.52], VELVET_LO = [0.2, 0.17, 0.22], PINK = [0.95, 0.68, 0.72], PINK_HI = [1.0, 0.85, 0.85], PINK_LO = [0.75, 0.5, 0.56], CREAM = [0.95, 0.9, 0.78];
const EYE = [1.0, 0.86, 0.14], BLACK = [0.03, 0.02, 0.06];

function moundGeo(b) {                                  // (ground level at y = 0)
  setBias(0.4);
  b.lathe([[1.0, 0.0], [0.92, 0.1], [0.72, 0.28], [0.42, 0.4], [0.14, 0.45], [0.0, 0.43]], 8, { color: (x, y) => mix3(DIRT_LO, DIRT_HI, y / 0.45) });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2, r = 0.88 + 0.14 * Math.sin(i * 2.3);
    spike(b, [Math.cos(a) * r, 0.06, Math.sin(a) * r], [Math.cos(a) * 0.5, 0.9, Math.sin(a) * 0.5], 0.26 + 0.1 * (i % 3), 0.11, { segs: 4, col: DIRT, tip: DIRT_HI });
  }
}
function moleGeo(b) {                                   // (mole frame: standing on the ground, facing +z)
  setBias(0.4);
  const fur = (th) => mix3(VELVET_LO, VELVET_HI, 0.5 + 0.5 * Math.sin(th));
  ellipsoid(b, 0, 0.5, -0.05, 0.46, 0.44, 0.58, { segs: 8, rings: 4, col: fur });                  // the body
  ellipsoid(b, 0, 0.62, 0.5, 0.3, 0.28, 0.3, { segs: 8, rings: 3, col: fur });                      // the head
  spike(b, [0, 0.58, 0.72], [0, -0.1, 1], 0.55, 0.16, { segs: 6, col: PINK_LO, tip: PINK_HI });    // the snout
  ellipsoid(b, 0, 0.55, 1.26, 0.07, 0.07, 0.07, { segs: 4, rings: 2, col: [0.9, 0.35, 0.45] });    // the nose
  for (const s of [1, -1]) {
    ellipsoid(b, s * 0.28, 0.82, 0.38, 0.07, 0.09, 0.05, { segs: 4, rings: 2, col: PINK_LO });      // ears
    // the hands: a palm and three long claws each
    ellipsoid(b, s * 0.5, 0.4, 0.34, 0.2, 0.15, 0.22, { segs: 6, rings: 2, col: PINK });
    for (const k of [-1, 0, 1]) spike(b, [s * 0.5 + k * 0.11, 0.38, 0.5], [s * 0.1 + k * 0.1, -0.1, 1], 0.4, 0.06, { segs: 3, col: CREAM, tip: [1, 1, 0.92] });
  }
  spike(b, [0, 0.45, -0.6], [0, 0.2, -1], 0.3, 0.1, { segs: 4, col: PINK_LO, tip: PINK });         // the tail
}
function eyesGeo(b) {                                   // (unlit)
  for (const s of [1, -1]) {
    const cx = s * 0.14, cy = 0.7, z = 0.74, w = 0.05, h = 0.035;
    triF(b, [cx - w, cy - h, z], [cx + w, cy - h, z], [cx + w, cy + h, z], BLACK);
    triF(b, [cx - w, cy - h, z], [cx + w, cy + h, z], [cx - w, cy + h, z], BLACK);
    const w2 = 0.034, h2 = 0.022;
    triF(b, [cx - w2, cy - h2, z + 0.01], [cx + w2, cy - h2, z + 0.01], [cx + w2, cy + h2, z + 0.01], EYE);
    triF(b, [cx - w2, cy - h2, z + 0.01], [cx + w2, cy + h2, z + 0.01], [cx - w2, cy + h2, z + 0.01], EYE);
  }
}

export function createDustmole(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets, 'dustmole');
  const M = R.litMat(null), G = R.glowMat(null);
  const rnd = seeded(nextSeed(opts));
  const mound = R.pivot(R.rig, 0, 0, 0, 'mound');
  R.part(mound, M, moundGeo, 'mound');
  const mole = R.pivot(R.rig, 0, 0, 0, 'mole');
  R.part(mole, M, moleGeo, 'mole');
  const eyes = R.pivot(mole, 0, 0, 0, 'eyes');
  R.part(eyes, G, eyesGeo, 'eyes', true);
  const top = R.pivot(R.rig, 0, 1.3, 0, 'top');

  const S = { time: rnd() * 10, under: 1, stun: 0, hurt: 0, crack: 0, move: 0 };
  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt, 0, 0.1);
    heal(S);
    const dead = clamp(pose.dead || 0);
    S.time += dt;
    S.under = damp(S.under, clamp(pose.under ?? 1), 16, dt);
    S.stun = damp(S.stun, clamp(pose.stun || 0), 10, dt);
    S.hurt = damp(S.hurt, clamp(pose.hurt || 0), 30, dt);
    S.crack = damp(S.crack, clamp(pose.crack || 0), 18, dt);
    S.move = damp(S.move, sstep(0.3, 3, clamp(pose.speed, 0, 12)), 10, dt);
    const u = S.under, t = S.time;
    // the mole comes up out of the mound (and sinks into it again): hidden while the ground hides it
    mole.position.y = lerp(0, -1.25, u);
    mole.rotation.x = -0.2 * u;
    // the mound: a wobble as it travels, a shudder as the ground cracks (the cracks themselves are drawn on the floor)
    const sh = S.crack;
    mound.position.set(Math.sin(t * 61) * 0.045 * sh, Math.abs(Math.sin(t * 11)) * 0.05 * S.move * u + Math.sin(t * 47) * 0.03 * sh, Math.cos(t * 53) * 0.045 * sh);
    mound.scale.set(1 + 0.05 * sh, 1 + 0.12 * sh + 0.18 * (1 - u), 1 + 0.05 * sh);
    mound.rotation.y = Math.sin(t * 8) * 0.1 * S.move;
    // dazed: its head swings, its body sways
    mole.rotation.z = Math.sin(t * 6) * 0.12 * S.stun * (1 - u);
    mole.rotation.y = Math.cos(t * 5.5) * 0.25 * S.stun * (1 - u);
    const dim = clamp(1 - 0.65 * S.stun * (0.5 + 0.5 * Math.sin(t * 14)) - dead, 0, 1);
    G.uniforms.uColorMul.value.setRGB(dim, dim, dim);
    if (dead > 0) { const k = sstep(0, 1, dead), s = Math.max(0.0001, 1 - k * k); R.rig.scale.setScalar(s); R.rig.rotation.y = k * 10; } else { R.rig.scale.setScalar(1); R.rig.rotation.y = 0; }
    R.rig.visible = dead < 1;
    if (pose.flash !== undefined) R.flash(clamp(pose.flash, 0, 1));
    const boost = lerp(1.18, 1.05, clamp(U.uDay.value));
    if (Math.abs(boost - (S.boost ?? -1)) > 0.004) { S.boost = boost; R.boost(boost); }
  }

  return {
    root: R.root, radius: 0.75, height: 1.3,
    anchors: { eyes, top },
    testPoses: { idle: { under: 1 }, travel: { under: 1, speed: 6 }, crack: { under: 1, crack: 1 }, out: { under: 0 }, dazed: { under: 0, stun: 1 }, dead: (t) => ({ under: 0, dead: Math.min(1, (t % 2.4) / 0.9), t }) },
    update, flash: (k) => R.flash(k), dispose: () => R.dispose(), variant: 'mole',
    get triangleCount() { return R.triangleCount; },
  };
}
