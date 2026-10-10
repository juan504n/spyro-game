// SHELLBACK: the crab of Tideglass Reach (foes/shell.js). A shell like a rounded shield, coral on top and pearl underneath, ridged with short spikes; two eye-stalks with black eyes; two great claws held
// out in front (a hog's size in all, 1.9 m across the claws); six legs that scuttle it sideways. Raised for the lunge the claws go up and open; flipped it lies on its back, pale belly up, legs waving.
// Faces +z (the claws), origin at the ground under the middle of the shell; the shell is 0.5 m high on the legs.
// Pose contract (all optional): { speed (the scuttle), attack 0..1 (0.3 raised ... 0.6+ the lunge), raise 0..1, flipped 0..1, dir (+1 / -1: which way it scuttles), stun, alert, hurt 0..1, dead 0..1, t }
import { U } from '../../../engine/materials.js';
import { Rig, ellipsoid, spike, bar, triF, setBias, clamp, heal, lerp, sstep, damp, mix3, TAU, nextSeed, seeded } from './rig.js';

const CORAL = [0.92, 0.46, 0.4], CORAL_HI = [1.0, 0.66, 0.54], CORAL_LO = [0.6, 0.26, 0.28], PEARL = [0.94, 0.88, 0.84], PEARL_LO = [0.7, 0.62, 0.62];
const TEAL = [0.18, 0.5, 0.52], TEAL_LO = [0.1, 0.32, 0.38], BLACK = [0.04, 0.03, 0.06], GLINT = [1.0, 1.0, 0.95];

function shellGeo(b) {                                  // (shell frame: the middle of the shell at the origin, 0.5 above the ground)
  setBias(0.4);
  ellipsoid(b, 0, 0.12, 0, 0.9, 0.42, 0.74, { segs: 10, rings: 4, col: (th) => mix3(CORAL_LO, CORAL_HI, 0.55 + 0.45 * Math.sin(th)) });       // the top
  ellipsoid(b, 0, -0.05, 0, 0.82, 0.22, 0.68, { segs: 10, rings: 2, col: (th) => mix3(PEARL_LO, PEARL, 0.5 + 0.5 * Math.sin(th)) });            // the belly
  for (let i = 0; i < 9; i++) {                         // ridges: short spikes along the rim of the shell, in front less than behind
    const a = (i / 9) * TAU + 0.2, rx = 0.82, rz = 0.66;
    spike(b, [Math.cos(a) * rx, 0.2, Math.sin(a) * rz], [Math.cos(a) * 0.5, 0.8, Math.sin(a) * 0.5], 0.2 + 0.08 * (i % 2), 0.08, { segs: 3, col: CORAL_LO, tip: PEARL });
  }
  for (const s of [-1, 1]) spike(b, [s * 0.32, 0.5, -0.1], [0, 1, -0.3], 0.26, 0.1, { segs: 4, col: CORAL_HI, tip: PEARL });                       // two plates on the back
}
function eyesGeo(b) {                                   // (eye frame: the end of a stalk)
  setBias(0.3);
  ellipsoid(b, 0, 0, 0, 0.1, 0.1, 0.1, { segs: 6, rings: 3, col: PEARL });
  ellipsoid(b, 0, 0, 0.07, 0.06, 0.07, 0.04, { segs: 5, rings: 2, col: BLACK });
}
function glintGeo(b) {                                  // (unlit: a spark in each eye)
  for (const s of [-1, 1]) triF(b, [s * 0.0 - 0.02, 0.02, 0.115], [0.02, 0.02, 0.115], [0, 0.05, 0.115], GLINT);
}
function clawGeo(b) {                                   // (claw frame: the wrist at the origin, the claw reaches along +z; the fixed finger is at x = 0)
  setBias(0.4);
  bar(b, [0, 0, 0], [0, 0.0, 0.5], 0.1, 0.13, CORAL, { segs: 5 });
  ellipsoid(b, 0, 0, 0.62, 0.22, 0.17, 0.3, { segs: 6, rings: 3, col: (th) => mix3(CORAL_LO, CORAL_HI, 0.5 + 0.5 * Math.sin(th)) });
  spike(b, [0, 0.0, 0.8], [0, 0, 1], 0.42, 0.11, { segs: 4, col: CORAL, tip: PEARL });
}
function fingerGeo(b) {                                 // (the moving finger of a claw: pivots at the wrist's far end)
  setBias(0.4);
  spike(b, [0, 0, 0], [0, 0, 1], 0.5, 0.09, { segs: 4, col: CORAL_HI, tip: PEARL });
}
function legGeo(b) {                                    // (leg frame: the hip at the origin, the leg goes out along +x and down)
  setBias(0.3);
  bar(b, [0, 0, 0], [0.4, 0.22, 0], 0.07, 0.06, TEAL, { segs: 4 });
  bar(b, [0.4, 0.22, 0], [0.7, -0.38, 0], 0.06, 0.04, TEAL_LO, { segs: 4 });
}

export function createShellback(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets, 'shellback');
  const M = R.litMat(null), G = R.glowMat(null);
  const rnd = seeded(nextSeed(opts));
  const flip = R.pivot(R.rig, 0, 0.5, 0, 'flip');                       // (turns over about the shell's middle)
  const shell = R.pivot(flip, 0, 0, 0, 'shell');
  R.part(shell, M, shellGeo, 'shell');
  const eyes = [], claws = [], fingers = [], legs = [];
  for (const s of [-1, 1]) {
    const stalk = R.pivot(shell, s * 0.22, 0.42, 0.62, 'stalk' + s);
    R.part(stalk, M, (b) => bar(b, [0, 0, 0], [0, 0.3, 0.1], 0.04, 0.03, CORAL_LO, { segs: 4 }), 'stalkbar');
    const eye = R.pivot(stalk, 0, 0.34, 0.12, 'eye' + s);
    R.part(eye, M, eyesGeo, 'eye');
    eyes.push(eye);
    const claw = R.pivot(shell, s * 0.72, 0.1, 0.5, 'claw' + s);
    R.part(claw, M, clawGeo, 'claw');
    const finger = R.pivot(claw, 0, 0.1, 0.62, 'finger' + s);
    R.part(finger, M, fingerGeo, 'finger');
    claws.push(claw); fingers.push(finger);
    for (let k = 0; k < 3; k++) {
      const leg = R.pivot(shell, s * 0.62, -0.02, 0.4 - k * 0.38, 'leg' + s + k);
      if (s < 0) leg.rotation.y = Math.PI;
      R.part(leg, M, legGeo, 'leg');
      legs.push({ leg, s, k });
    }
  }
  const glint = R.pivot(shell, 0, 0.42, 0.62, 'glint');
  R.part(glint, G, glintGeo, 'glint', true);

  const S = { time: rnd() * 10, move: 0, raise: 0, flipped: 0, stun: 0, hurt: 0, dir: 1, attack: 0 };
  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt, 0, 0.1);
    heal(S);
    const dead = clamp(pose.dead || 0);
    S.time += dt;
    S.move = damp(S.move, sstep(0.3, 4, clamp(pose.speed, 0, 12)), 10, dt);
    S.raise = damp(S.raise, clamp(Math.max(pose.raise || 0, (pose.attack || 0) > 0.25 ? 1 : 0)), 12, dt);
    S.attack = damp(S.attack, clamp(pose.attack || 0), 18, dt);
    S.flipped = damp(S.flipped, clamp(pose.flipped || 0), 8, dt);
    S.stun = damp(S.stun, clamp(pose.stun || 0), 10, dt);
    S.hurt = damp(S.hurt, clamp(pose.hurt || 0), 30, dt);
    S.dir = damp(S.dir, pose.dir < 0 ? -1 : 1, 6, dt);
    const t = S.time, f = S.flipped;
    // the scuttle: the whole shell sways, the legs step in pairs, the claws stay up in front
    const ph = t * 14 * (0.3 + S.move);
    shell.position.y = Math.abs(Math.sin(ph)) * 0.04 * S.move;
    shell.rotation.z = Math.sin(ph) * 0.05 * S.move * S.dir;
    for (const { leg, s, k } of legs) {
      const wave = Math.sin(ph + k * 2.1 + (s > 0 ? 0 : Math.PI)) * 0.35 * S.move + Math.sin(t * 9 + k) * 0.5 * f;
      leg.rotation.z = (s < 0 ? -1 : 1) * wave * 0.6;
      leg.rotation.x = Math.cos(ph + k * 2.1) * 0.2 * S.move + 0.35 * f * Math.sin(t * 7 + k * 1.3);
    }
    // claws: raised and open for the lunge, closed and low otherwise; waving in the air when flipped
    const up = S.raise;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1;
      claws[i].rotation.x = lerp(0.05, -0.7, up) + 0.5 * f * Math.sin(t * 6 + i * 2);
      claws[i].rotation.y = s * lerp(0.12, 0.35, up);
      fingers[i].rotation.x = lerp(0.0, 0.5 + 0.4 * Math.sin(t * 22) * S.attack, up);
    }
    for (const e of eyes) e.rotation.y = Math.sin(t * 2.1) * 0.25 * (1 - up);
    // flipped: over on its back, lifted a little (the belly up), rocking
    flip.rotation.z = Math.PI * sstep(0, 1, f);
    flip.position.y = 0.5 + 0.1 * f + Math.sin(t * 5) * 0.03 * f;
    shell.rotation.x = Math.sin(t * 4) * 0.08 * f + 0.1 * S.stun * Math.sin(t * 12);
    const dim = clamp(1 - 0.5 * S.stun * (0.5 + 0.5 * Math.sin(t * 14)) - dead, 0, 1);
    G.uniforms.uColorMul.value.setRGB(dim, dim, dim);
    if (dead > 0) { const k = sstep(0, 1, dead), sc = Math.max(0.0001, 1 - k * k); R.rig.scale.setScalar(sc); R.rig.rotation.y = k * 10; } else { R.rig.scale.setScalar(1); R.rig.rotation.y = 0; }
    R.rig.visible = dead < 1;
    if (pose.flash !== undefined) R.flash(clamp(pose.flash, 0, 1));
    const boost = lerp(1.2, 1.05, clamp(U.uDay.value));
    if (Math.abs(boost - (S.boost ?? -1)) > 0.004) { S.boost = boost; R.boost(boost); }
  }
  const top = R.pivot(R.rig, 0, 1.3, 0, 'top');
  return {
    root: R.root, radius: 0.95, height: 1.1,
    anchors: { eyes: eyes[0], top },
    testPoses: { idle: {}, scuttle: { speed: 4 }, raised: { raise: 1, attack: 0.3 }, lunge: { attack: 0.6, speed: 9 }, flipped: { flipped: 1, stun: 1 } },
    update, flash: (k) => R.flash(k), dispose: () => R.dispose(), variant: 'crab',
    get triangleCount() { return R.triangleCount; },
  };
}
