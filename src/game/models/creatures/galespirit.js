// GALE SPIRIT: the wind of Skyweaver Spires with a face in it (foes/gust.js). A whirl of pale air: a spinning cone of five nested rings (broad at the top, narrowing down to a point) in sky-white and cloud-blue, with
// a round face on the front of the top ring, two glowing eyes and a small round mouth that opens to blow, and three curved streaks that run round it. It hangs, turning. Gathering, it leans towards the hero and
// spins faster, the mouth drawing round; blowing it snaps forward and the rings fan out.
// Faces +z, origin at the middle of the whirl (the foe floats: the point of the cone hangs 1.1 m under it).
// Pose contract (all optional): { speed (it drifts), gather 0..1, blow 0/1, stun, alert, hurt 0..1, dead 0..1, t }
import { U } from '../../../engine/materials.js';
import { Rig, ellipsoid, spike, bar, triF, setBias, clamp, heal, lerp, sstep, damp, mix3, TAU, nextSeed, seeded } from './rig.js';

const AIR = [0.86, 0.94, 1.0], AIR_HI = [1.0, 1.0, 1.0], AIR_LO = [0.5, 0.68, 0.9], DEEP = [0.34, 0.5, 0.82], EYE = [0.2, 0.28, 0.6], GLOW = [1.0, 0.98, 0.8], MOUTH = [0.16, 0.2, 0.44];

function ringGeo(rIn, rOut, y, col) {                   // (a flat-ish ring of two-sided quads: a band of wind)
  return (b) => {
    setBias(0.5);
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      const P = (a, r, yy) => [Math.cos(a) * r, yy, Math.sin(a) * r];
      const c = (k) => mix3(AIR_LO, col, 0.5 + 0.5 * Math.sin(i * 1.7 + k));
      b.tri(P(a0, rIn, y), P(a1, rIn, y), P(a0, rOut, y + 0.1), [0, 0], [0, 0], [0, 0], { tints: [c(0), c(1), c(2)] });
      b.tri(P(a1, rIn, y), P(a1, rOut, y + 0.1), P(a0, rOut, y + 0.1), [0, 0], [0, 0], [0, 0], { tints: [c(1), c(3), c(2)] });
      b.tri(P(a0, rIn, y), P(a0, rOut, y + 0.1), P(a1, rIn, y), [0, 0], [0, 0], [0, 0], { tints: [c(0), c(2), c(1)] });
      b.tri(P(a1, rIn, y), P(a0, rOut, y + 0.1), P(a1, rOut, y + 0.1), [0, 0], [0, 0], [0, 0], { tints: [c(1), c(2), c(3)] });
    }
  };
}
function faceGeo(b) {                                   // (head frame: the face at the front of the top of the whirl)
  setBias(0.4);
  ellipsoid(b, 0, 0, 0, 0.5, 0.46, 0.46, { segs: 8, rings: 4, col: (th) => mix3(AIR, AIR_HI, 0.5 + 0.5 * Math.sin(th)) });
  spike(b, [0, 0.42, 0.1], [0, 1, 0.3], 0.34, 0.12, { segs: 4, col: AIR, tip: AIR_HI });                 // a curl of wind on top
}
function eyesGeo(b) {                                   // (unlit)
  for (const s of [-1, 1]) {
    const cx = s * 0.17, cy = 0.06, z = 0.44, w = 0.08, h = 0.1;
    triF(b, [cx - w, cy - h, z], [cx + w, cy - h, z], [cx + w, cy + h, z], EYE);
    triF(b, [cx - w, cy - h, z], [cx + w, cy + h, z], [cx - w, cy + h, z], EYE);
    const w2 = 0.04, h2 = 0.05;
    triF(b, [cx - w2, cy - h2, z + 0.01], [cx + w2, cy - h2, z + 0.01], [cx + w2, cy + h2, z + 0.01], GLOW);
    triF(b, [cx - w2, cy - h2, z + 0.01], [cx + w2, cy + h2, z + 0.01], [cx - w2, cy + h2, z + 0.01], GLOW);
  }
}
function mouthGeo(b) {                                  // (unlit: a round mouth, drawn as a fan)
  const n = 8, r = 0.1;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
    triF(b, [0, -0.17, 0.455], [Math.cos(a0) * r, -0.17 + Math.sin(a0) * r, 0.455], [Math.cos(a1) * r, -0.17 + Math.sin(a1) * r, 0.455], MOUTH);
  }
}
function streakGeo(a0) {                                // (a curved streak that runs round the whirl and down it)
  return (b) => {
    setBias(0.4);
    let prev = null;
    for (let i = 0; i <= 8; i++) {
      const u = i / 8, a = a0 + u * 2.4, r = lerp(0.95, 0.12, u * u), y = lerp(0.1, -0.95, u);
      const p = [Math.cos(a) * r, y, Math.sin(a) * r];
      if (prev) bar(b, prev, p, lerp(0.06, 0.03, u), lerp(0.06, 0.03, u + 0.125), AIR_HI, { segs: 3 });
      prev = p;
    }
  };
}

export function createGalespirit(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets, 'galespirit');
  const M = R.litMat(null), G = R.glowMat(null);
  const rnd = seeded(nextSeed(opts));
  const whirl = R.pivot(R.rig, 0, 0, 0, 'whirl');
  const rings = [];
  const RINGS = [[0.7, 1.0, 0.05, AIR], [0.55, 0.85, -0.15, AIR_LO], [0.42, 0.68, -0.38, AIR], [0.28, 0.5, -0.6, DEEP], [0.12, 0.3, -0.84, AIR_LO]];
  RINGS.forEach(([a, b, y, col], i) => {
    const p = R.pivot(whirl, 0, 0, 0, 'ring' + i);
    R.part(p, M, ringGeo(a, b, y, col), 'ring' + i);
    rings.push(p);
  });
  const streaks = [];
  for (let k = 0; k < 3; k++) { const p = R.pivot(whirl, 0, 0, 0, 'streak' + k); R.part(p, M, streakGeo((k / 3) * TAU), 'streak' + k); streaks.push(p); }
  const head = R.pivot(R.rig, 0, 0.32, 0.15, 'head');
  R.part(head, M, faceGeo, 'face');
  const GE = R.glowMat(null);
  R.part(head, GE, eyesGeo, 'eyes', true);
  const mouth = R.pivot(head, 0, 0, 0, 'mouth');
  R.part(mouth, G, mouthGeo, 'mouth', true);
  const S = { time: rnd() * 10, move: 0, gather: 0, blow: 0, stun: 0, hurt: 0 };
  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt, 0, 0.1);
    heal(S);
    const dead = clamp(pose.dead || 0);
    S.time += dt;
    S.move = damp(S.move, sstep(0.3, 4, clamp(pose.speed, 0, 12)), 8, dt);
    S.gather = damp(S.gather, clamp(pose.gather || 0), 10, dt);
    S.blow = damp(S.blow, clamp(pose.blow || 0), 18, dt);
    S.stun = damp(S.stun, clamp(pose.stun || 0), 10, dt);
    S.hurt = damp(S.hurt, clamp(pose.hurt || 0), 30, dt);
    const t = S.time, spin = 2.2 + 5 * S.gather + 3 * S.move;
    // the rings turn at their own speeds (the lower, the quicker), fanning out when it blows
    rings.forEach((r, i) => { r.rotation.y = t * spin * (1 + i * 0.35); r.scale.setScalar(1 + 0.25 * S.blow * (1 - i * 0.12)); r.rotation.z = Math.sin(t * 1.9 + i) * 0.06; });
    streaks.forEach((s, k) => { s.rotation.y = -t * spin * 0.8 + k * 2.1; });
    whirl.rotation.x = 0.35 * S.gather - 0.3 * S.blow;                                 // (leans in as it gathers, snaps back on the blow)
    whirl.position.y = Math.sin(t * 2.4) * 0.1;
    head.position.y = 0.32 + Math.sin(t * 2.4) * 0.1;
    head.rotation.y = Math.sin(t * 1.2) * 0.25 * (1 - S.gather);
    head.rotation.z = 0.15 * S.stun * Math.sin(t * 12);
    // the mouth draws round as it gathers (it grows), is wide open on the blow
    mouth.scale.setScalar(0.8 + 0.8 * S.gather + 1.3 * S.blow);
    const l = clamp(1 - 0.5 * S.stun * (0.5 + 0.5 * Math.sin(t * 14)) - dead, 0, 1);
    G.uniforms.uColorMul.value.setRGB(l, l, l);
    GE.uniforms.uColorMul.value.setRGB(l * (0.85 + 0.15 * Math.sin(t * 3)), l * (0.85 + 0.15 * Math.sin(t * 3)), l);
    if (dead > 0) { const k = sstep(0, 1, dead), sc = Math.max(0.0001, 1 - k * k); R.rig.scale.setScalar(sc); R.rig.rotation.y = k * 10; } else { R.rig.scale.setScalar(1); R.rig.rotation.y = 0; }
    R.rig.visible = dead < 1;
    if (pose.flash !== undefined) R.flash(clamp(pose.flash, 0, 1));
    const boost = lerp(1.15, 1.05, clamp(U.uDay.value));
    if (Math.abs(boost - (S.boost ?? -1)) > 0.004) { S.boost = boost; R.boost(boost); }
  }
  const top = R.pivot(R.rig, 0, 1.1, 0, 'top');
  return {
    root: R.root, radius: 0.75, height: 2.2,
    anchors: { eyes: head, top },
    testPoses: { idle: {}, drift: { speed: 4 }, gather: { gather: 1 }, blow: { blow: 1 }, stun: { stun: 1 } },
    update, flash: (k) => R.flash(k), dispose: () => R.dispose(), variant: 'gale',
    get triangleCount() { return R.triangleCount; },
  };
}
