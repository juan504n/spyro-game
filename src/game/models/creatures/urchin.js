// URCHIN: the spiny walker of Tideglass Reach (a spiked Snuffer: ramming it hurts, a breath of fire is the answer). A ball of dark sea-green with sea-glass spines in every direction, 1.2 m across, on two
// stubby webbed feet, with one great pale eye in front that blinks. It waddles; to attack it lashes (pose.attack) -- the spines flare out and it lurches at the hero.
// Faces +z (the eye), origin at the ground under the middle.
// Pose contract (all optional): { speed, attack 0..1, alert, stun, hurt 0..1, dead 0..1, t }
import { U } from '../../../engine/materials.js';
import { Rig, ellipsoid, spike, bar, triF, setBias, clamp, heal, lerp, sstep, damp, mix3, TAU, nextSeed, seeded } from './rig.js';

const SEA = [0.14, 0.4, 0.42], SEA_HI = [0.3, 0.66, 0.62], SEA_LO = [0.07, 0.22, 0.3], GLASS = [0.7, 0.98, 0.92], GLASS_LO = [0.3, 0.7, 0.72], PEARL = [0.96, 0.94, 0.88], BLACK = [0.03, 0.04, 0.08], FOOT = [0.2, 0.46, 0.44];

function ballGeo(b) {                                    // (ball frame: the middle at the origin)
  setBias(0.4);
  ellipsoid(b, 0, 0, 0, 0.52, 0.5, 0.5, { segs: 10, rings: 5, col: (th) => mix3(SEA_LO, SEA_HI, 0.5 + 0.5 * Math.sin(th)) });
}
function spinesGeo(b) {                                  // (ball frame: spines in rings, none through the front where the eye is)
  setBias(0.45);
  const rings = [[0.95, 8, 0.0], [0.55, 9, 0.3], [0.0, 10, 0.1], [-0.5, 8, 0.5]];
  for (const [yy, n, off] of rings) for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + off, ry = Math.sqrt(Math.max(0, 1 - yy * yy));
    const dx = Math.sin(a) * ry, dz = Math.cos(a) * ry;
    if (dz > 0.55 && yy < 0.6 && yy > -0.45) continue;          // (the eye looks out here)
    const len = 0.5 + 0.12 * ((i + Math.round(yy * 4)) % 3);
    spike(b, [dx * 0.46, yy * 0.46, dz * 0.46], [dx, yy, dz], len, 0.075, { segs: 4, col: GLASS_LO, tip: GLASS });
  }
}
function eyeGeo(b) {                                     // (ball frame: the eye in front)
  setBias(0.3);
  ellipsoid(b, 0, 0.04, 0.42, 0.21, 0.2, 0.12, { segs: 8, rings: 4, col: PEARL });
  ellipsoid(b, 0, 0.04, 0.52, 0.11, 0.11, 0.06, { segs: 6, rings: 3, col: BLACK });
}
function footGeo(b) {                                    // (foot frame: the ankle at the origin)
  setBias(0.3);
  ellipsoid(b, 0, -0.05, 0.1, 0.17, 0.08, 0.26, { segs: 6, rings: 3, col: FOOT });
  for (const s of [-1, 0, 1]) spike(b, [s * 0.1, -0.06, 0.28], [s * 0.2, 0, 1], 0.12, 0.05, { segs: 3, col: FOOT, tip: PEARL });
}

export function createUrchin(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets, 'urchin');
  const M = R.litMat(null);
  const rnd = seeded(nextSeed(opts));
  const hop = R.pivot(R.rig, 0, 0.72, 0, 'hop');
  const ball = R.pivot(hop, 0, 0, 0, 'ball');
  R.part(ball, M, ballGeo, 'ball');
  const spines = R.pivot(ball, 0, 0, 0, 'spines');
  R.part(spines, M, spinesGeo, 'spines');
  const eye = R.pivot(ball, 0, 0, 0, 'eye');
  R.part(eye, M, eyeGeo, 'eye');
  const feet = [];
  for (const s of [-1, 1]) {
    const f = R.pivot(R.rig, s * 0.26, 0.2, 0, 'foot' + s);
    R.part(f, M, footGeo, 'foot');
    feet.push(f);
  }
  const S = { time: rnd() * 10, move: 0, attack: 0, stun: 0, hurt: 0, alert: 0 };
  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt, 0, 0.1);
    heal(S);
    const dead = clamp(pose.dead || 0);
    S.time += dt;
    S.move = damp(S.move, sstep(0.3, 5.5, clamp(pose.speed, 0, 12)), 10, dt);
    S.attack = damp(S.attack, clamp(pose.attack || 0), 16, dt);
    S.stun = damp(S.stun, clamp(pose.stun || 0), 10, dt);
    S.hurt = damp(S.hurt, clamp(pose.hurt || 0), 30, dt);
    S.alert = damp(S.alert, clamp(pose.alert || 0), 14, dt);
    const t = S.time, ph = t * 9 * (0.3 + S.move);
    hop.position.y = 0.72 + Math.abs(Math.sin(ph)) * 0.1 * S.move - 0.12 * S.stun;
    ball.rotation.z = Math.sin(ph) * 0.12 * S.move;
    ball.rotation.x = 0.2 * S.attack + 0.15 * S.move;
    const flare = 1 + 0.45 * sstep(0.2, 0.55, S.attack) + 0.2 * S.alert;
    spines.scale.setScalar(flare);
    const quiver = Math.sin(t * 40) * 0.025 * S.attack;
    spines.rotation.y = quiver;
    const blink = Math.max(0, Math.sin(t * 1.7) - 0.97) * 33;
    eye.scale.y = 1 - 0.85 * clamp(blink) - 0.5 * S.stun;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1, sw = Math.sin(ph + (s > 0 ? 0 : Math.PI));
      feet[i].position.y = 0.2 + Math.max(0, sw) * 0.14 * S.move;
      feet[i].position.z = sw * 0.16 * S.move;
    }
    if (dead > 0) { const k = sstep(0, 1, dead), sc = Math.max(0.0001, 1 - k * k); R.rig.scale.setScalar(sc); R.rig.rotation.y = k * 9; } else { R.rig.scale.setScalar(1); R.rig.rotation.y = 0; }
    R.rig.visible = dead < 1;
    if (pose.flash !== undefined) R.flash(clamp(pose.flash, 0, 1));
    const boost = lerp(1.3, 1.1, clamp(U.uDay.value));
    if (Math.abs(boost - (S.boost ?? -1)) > 0.004) { S.boost = boost; R.boost(boost); }
  }
  const top = R.pivot(R.rig, 0, 1.9, 0, 'top');
  return {
    root: R.root, radius: 0.8, height: 1.4,
    anchors: { eyes: eye, top },
    testPoses: { idle: {}, waddle: { speed: 4.5 }, lash: { attack: 0.7, speed: 5 }, stunned: { stun: 1 } },
    update, flash: (k) => R.flash(k), dispose: () => R.dispose(), variant: 'urchin',
    get triangleCount() { return R.triangleCount; },
  };
}
