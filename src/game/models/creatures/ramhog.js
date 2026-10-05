// RAMHOG: a boar with a brow like a wall (foes/charge.js). A low heavy barrel of a body on four short legs, a row of rust-red bristles down its back, a head with a plate of bone over the eyes
// (the armour: head on, flame and ram ring off it), two tusks and two glowing slits under the brow like the Snuffers'. It paws the ground (head down, a front hoof scraping), runs stretched out,
// and sits dazed with its head swinging when it has hit a wall.
// Faces +z, origin at the feet; 2.0 m long, 1.4 m to the top of its bristles.
// Pose contract (all optional): { speed 0..16 (the gait), paw 0..1 (head down, a hoof scraping), rush 0..1 (stretched out at full gallop), alert 0..1, hurt 0..1, stun 0..1 (dazed), dead 0..1, t }
import { U } from '../../../engine/materials.js';
import { Rig, ellipsoid, spike, bar, triF, setBias, clamp, heal, lerp, sstep, damp, mix3, TAU, nextSeed, seeded } from './rig.js';

const FUR = [0.3, 0.21, 0.18], FUR_HI = [0.46, 0.34, 0.27], FUR_LO = [0.18, 0.12, 0.11], BELLY = [0.55, 0.42, 0.32];
const BONE = [0.86, 0.8, 0.68], BONE_HI = [0.98, 0.95, 0.85], BONE_LO = [0.6, 0.54, 0.44], RUST = [0.82, 0.34, 0.14], RUST_HI = [1.0, 0.6, 0.3];
const HOOF = [0.14, 0.1, 0.1], NOSE = [0.2, 0.12, 0.14], EYE = [1.0, 0.86, 0.14], BLACK = [0.03, 0.02, 0.06];

function bodyGeo(b) {                                   // (body frame: the middle of the barrel at the origin)
  setBias(0.35);
  const fur = (th) => mix3(FUR_LO, FUR_HI, 0.5 + 0.5 * Math.sin(th));
  ellipsoid(b, 0, 0, 0, 0.62, 0.5, 0.98, { segs: 8, rings: 5, col: (th) => (Math.sin(th) < -0.35 ? BELLY : fur(th)) });
  ellipsoid(b, 0, 0.26, 0.42, 0.5, 0.34, 0.42, { segs: 8, rings: 3, col: fur });                 // the hump of its shoulders
  ellipsoid(b, 0, 0.06, -0.62, 0.54, 0.42, 0.42, { segs: 8, rings: 3, col: fur });                // its rump
  for (let i = 0; i < 7; i++) {                                                                    // the bristles
    const z = 0.8 - i * 0.26, y = 0.52 + 0.1 * Math.sin((i / 6) * Math.PI);
    spike(b, [0, y - 0.06, z], [0, 1, -0.55], 0.3 + (i % 2) * 0.1, 0.095, { segs: 4, col: RUST, tip: RUST_HI });
  }
  spike(b, [0, 0.18, -0.96], [0, 0.55, -1], 0.4, 0.07, { segs: 4, col: FUR_HI, tip: RUST });      // the tail
}
function headGeo(b) {                                   // (head frame: the neck at the origin, the snout towards +z)
  setBias(0.35);
  const fur = (th) => mix3(FUR_LO, FUR_HI, 0.5 + 0.5 * Math.sin(th));
  ellipsoid(b, 0, -0.04, 0.2, 0.34, 0.3, 0.46, { segs: 8, rings: 4, col: fur });
  ellipsoid(b, 0, -0.06, 0.62, 0.17, 0.13, 0.12, { segs: 6, rings: 3, col: NOSE });              // the nose
  setBias(0.55);
  ellipsoid(b, 0, 0.22, 0.28, 0.5, 0.17, 0.36, { segs: 8, rings: 3, col: (th) => mix3(BONE_LO, BONE_HI, 0.5 + 0.5 * Math.sin(th)) });   // the brow: a slab of bone over the eyes
  for (const x of [-0.26, 0, 0.26]) spike(b, [x, 0.34, 0.28], [0, 1, 0.15], 0.2, 0.07, { segs: 4, col: BONE, tip: BONE_HI });
  for (const s of [1, -1]) {
    spike(b, [s * 0.2, -0.1, 0.5], [s * 0.35, 0.7, 0.8], 0.42, 0.075, { segs: 4, col: BONE, tip: BONE_HI });                              // tusks
    spike(b, [s * 0.3, 0.12, 0.0], [s * 0.9, 0.5, -0.3], 0.22, 0.08, { segs: 4, col: FUR_HI, tip: RUST });                                   // ears
  }
}
function eyesGeo(b) {                                   // (unlit: two slits under the brow)
  for (const s of [1, -1]) {
    const cx = s * 0.2, cy = 0, z = 0.0, w = 0.1, h = 0.04;
    triF(b, [cx - w, cy - h, z], [cx + w, cy - h, z], [cx + w * s * 0.2, cy + h, z], BLACK);
    const w2 = 0.07, h2 = 0.024;
    triF(b, [cx - w2, cy - h2, z + 0.01], [cx + w2, cy - h2, z + 0.01], [cx + w2, cy + h2, z + 0.01], EYE);
    triF(b, [cx - w2, cy - h2, z + 0.01], [cx + w2, cy + h2, z + 0.01], [cx - w2, cy + h2, z + 0.01], EYE);
  }
}
function legGeo(b) {                                    // (leg frame: the hip at the origin, the hoof 0.72 below)
  setBias(0.3);
  bar(b, [0, 0, 0], [0, -0.42, 0.02], 0.15, 0.1, FUR, { segs: 5 });
  bar(b, [0, -0.42, 0.02], [0, -0.66, 0.05], 0.1, 0.09, FUR_LO, { segs: 5 });
  b.push().translate(0, -0.72, 0.08).cyl(0.11, 0.12, 0.12, 6, { color: HOOF }).pop();
}

export function createRamhog(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets, 'ramhog');
  const M = R.litMat(null), G = R.glowMat(null);
  const rnd = seeded(nextSeed(opts));

  const body = R.pivot(R.rig, 0, 0.84, 0, 'body');
  R.part(body, M, bodyGeo, 'body');
  const head = R.pivot(body, 0, 0.12, 0.84, 'head');
  R.part(head, M, headGeo, 'head');
  const eyes = R.pivot(head, 0, 0.1, 0.4, 'eyes');
  R.part(eyes, G, eyesGeo, 'eyes', true);
  const hip = (sx, sz, name) => { const p = R.pivot(body, sx * 0.38, -0.2, sz * 0.58, name); R.part(p, M, legGeo, 'leg'); return p; };
  const legs = { fl: hip(-1, 1, 'legFL'), fr: hip(1, 1, 'legFR'), rl: hip(-1, -1, 'legRL'), rr: hip(1, -1, 'legRR') };
  const top = R.pivot(R.rig, 0, 1.7, 0, 'top');

  const S = { time: rnd() * 10, phase: rnd() * TAU, move: 0, run: 0, paw: 0, rush: 0, alert: 0, stun: 0, hurt: 0, flick: 0 };

  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt, 0, 0.1);
    heal(S);
    const speed = clamp(pose.speed, 0, 18), dead = clamp(pose.dead || 0), hurt = clamp(pose.hurt || 0);
    S.time += dt; S.flick += dt;
    S.move = damp(S.move, sstep(0.3, 3, speed), 10, dt);
    S.run = damp(S.run, sstep(4, 13, speed), 8, dt);
    S.paw = damp(S.paw, clamp(pose.paw || 0), 14, dt);
    S.rush = damp(S.rush, clamp(pose.rush || 0), 12, dt);
    S.alert = damp(S.alert, clamp(pose.alert || 0), 14, dt);
    S.stun = damp(S.stun, clamp(pose.stun || 0), 10, dt);
    S.hurt = damp(S.hurt, hurt, 30, dt);
    const { move, run, paw, rush, stun, alert } = S;
    S.phase += TAU * (1.1 + speed * 0.32) * dt * (0.15 + 0.85 * Math.max(move, rush));
    const ph = S.phase, amp = 0.42 * move + 0.5 * run;

    // legs: diagonal pairs; the front left scrapes while it paws
    const gait = (a) => Math.sin(ph + a) * amp;
    legs.fl.rotation.x = gait(0) * (1 - paw) + paw * (-0.8 + Math.sin(S.time * 15) * 0.65);
    legs.rr.rotation.x = gait(0);
    legs.fr.rotation.x = gait(Math.PI) * (1 - 0.6 * paw) - paw * 0.2;
    legs.rl.rotation.x = gait(Math.PI);
    // body: bobs with the gait, drops its head to paw, stretches out and leans into the run
    body.position.y = 0.84 + Math.abs(Math.sin(ph)) * 0.06 * (move + run) - 0.1 * paw - 0.04 * S.hurt;
    body.rotation.x = 0.1 * run + 0.18 * paw + Math.sin(ph) * 0.03 * move - 0.12 * S.hurt;
    body.rotation.z = Math.sin(S.time * 6) * 0.08 * stun + Math.sin(S.time * 40) * 0.05 * S.hurt;
    body.scale.set(1, 1, 1 + 0.07 * rush);
    head.rotation.x = 0.08 + 0.7 * paw + 0.25 * rush - 0.25 * alert + Math.sin(S.time * 5.5) * 0.28 * stun;
    head.rotation.y = Math.cos(S.time * 5.5) * 0.35 * stun + Math.sin(S.time * 1.3) * 0.04 * (1 - move);
    head.position.y = 0.12 - 0.18 * paw;
    // eyes: wide when it paws, dim when it is dazed
    const dim = clamp(1 - 0.65 * stun * (0.5 + 0.5 * Math.sin(S.time * 14)) - dead, 0, 1);
    const fl = 1 + Math.sin(S.flick * 23) * 0.04;
    G.uniforms.uColorMul.value.setRGB(fl * dim, fl * dim, fl * dim);
    eyes.scale.set(1 + 0.3 * paw, (1 + 0.3 * paw) * (1 - 0.6 * S.hurt), 1);
    if (dead > 0) { const k = sstep(0, 1, dead), s = Math.max(0.0001, 1 - k * k); R.rig.scale.setScalar(s); R.rig.rotation.y = k * 10; } else { R.rig.scale.setScalar(1); R.rig.rotation.y = 0; }
    R.rig.visible = dead < 1;
    if (pose.flash !== undefined) R.flash(clamp(pose.flash, 0, 1));
    const boost = lerp(1.18, 1.05, clamp(U.uDay.value));
    if (Math.abs(boost - (S.boost ?? -1)) > 0.004) { S.boost = boost; R.boost(boost); }
  }

  return {
    root: R.root, radius: 0.95, height: 1.5,
    anchors: { eyes, top },
    testPoses: {
      idle: {}, walk: { speed: 2.4 }, run: { speed: 15, rush: 1 }, paw: (t) => ({ paw: Math.min(1, (t % 2) / 0.4), alert: 1 }),
      stun: { stun: 1 }, hurt: (t) => { const k = (t % 1.6) / 0.6; const h = k < 1 ? 1 - k : 0; return { hurt: h, flash: h > 0.4 ? 1 : 0, t }; }, dead: (t) => ({ dead: Math.min(1, (t % 2.4) / 0.9), t }),
    },
    update, flash: (k) => R.flash(k), dispose: () => R.dispose(), variant: 'hog',
    get triangleCount() { return R.triangleCount; },
  };
}
