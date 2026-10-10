// SHIVERLING: the little cold Snuffer of Frostbloom Hollow (foes/orbit.js). A thin pale-blue imp, 1.3 m, all knees and elbows: a long narrow head with two big black eyes, a crest of icicles, a scarf of frost
// that streams behind it, long thin legs. It runs low and quick; the shiver (the tell before the dash) shakes it all over and turns it white; the dash stretches it out flat along its way, arms back.
// Faces +z, origin at the ground under the feet.
// Pose contract (all optional): { speed, attack 0..1, shiver 0..1, dash 0|1, stun, alert, hurt 0..1, dead 0..1, t }
import { U } from '../../../engine/materials.js';
import { Rig, ellipsoid, spike, bar, triF, setBias, clamp, heal, lerp, sstep, damp, mix3, TAU, nextSeed, seeded } from './rig.js';

const BLUE = [0.56, 0.78, 0.96], BLUE_HI = [0.86, 0.96, 1.0], BLUE_LO = [0.3, 0.5, 0.8], ICE = [0.7, 0.94, 1.0], FROST = [0.92, 0.98, 1.0], BLACK = [0.04, 0.05, 0.12], GLINT = [0.9, 1.0, 1.0];

function bodyGeo(b) {                                    // (body frame: the hips at the origin, the chest up along +y)
  setBias(0.4);
  ellipsoid(b, 0, 0.25, 0, 0.2, 0.3, 0.17, { segs: 7, rings: 3, col: (th) => mix3(BLUE_LO, BLUE_HI, 0.5 + 0.5 * Math.sin(th)) });
  for (let i = 0; i < 4; i++) spike(b, [0, 0.12 + i * 0.13, -0.15], [0, 0.4, -1], 0.2 - i * 0.02, 0.06, { segs: 3, col: BLUE_LO, tip: ICE });      // spines down the back
}
function headGeo(b) {                                    // (head frame)
  setBias(0.4);
  ellipsoid(b, 0, 0.18, 0.02, 0.2, 0.26, 0.22, { segs: 8, rings: 4, col: (th) => mix3(BLUE, BLUE_HI, 0.5 + 0.5 * Math.sin(th)) });
  for (const s of [-1, 1]) ellipsoid(b, s * 0.1, 0.2, 0.17, 0.085, 0.11, 0.05, { segs: 6, rings: 3, col: BLACK });
  for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.3; spike(b, [Math.sin(a) * 0.12, 0.4, -0.02], [Math.sin(a) * 0.5, 1, -0.25], 0.3 + (i % 2) * 0.16, 0.05, { segs: 4, col: ICE, tip: FROST }); }
}
function glintGeo(b) {                                   // (unlit, head frame: a point of light in each eye)
  for (const s of [-1, 1]) triF(b, [s * 0.1 - 0.025, 0.22, 0.2], [s * 0.1 + 0.025, 0.22, 0.2], [s * 0.1, 0.27, 0.2], GLINT);
}
function limbGeo(b) {                                    // (limb frame: the joint at the origin, hangs down -y; 0.34 upper, 0.34 lower is made with the elbow pivot)
  setBias(0.3);
  bar(b, [0, 0, 0], [0, -0.34, 0], 0.05, 0.04, BLUE, { segs: 4 });
}
function lowerGeo(b) {
  setBias(0.3);
  bar(b, [0, 0, 0], [0, -0.34, 0.02], 0.04, 0.03, BLUE_LO, { segs: 4 });
  ellipsoid(b, 0, -0.36, 0.06, 0.05, 0.03, 0.1, { segs: 5, rings: 2, col: ICE });
}
function scarfGeo(b) {                                   // (neck frame: streams back along -z)
  setBias(0.5);
  triF(b, [0, 0.04, 0], [0.08, -0.04, 0], [0, 0.0, -0.7], FROST, BLUE_HI, ICE);
  triF(b, [0, 0.04, 0], [0, 0.0, -0.7], [-0.08, -0.04, 0], FROST, ICE, BLUE_HI);
  triF(b, [0, 0.0, -0.1], [0.14, -0.1, -0.5], [0, -0.04, -0.82], BLUE_HI, ICE, FROST);
}

export function createShiverling(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets, 'shiverling');
  const M = R.litMat(null), G = R.glowMat(null);
  const rnd = seeded(nextSeed(opts));
  const lean = R.pivot(R.rig, 0, 0.7, 0, 'lean');                       // (the whole body tips forward into a run, flat for the dash)
  const body = R.pivot(lean, 0, 0, 0, 'body');
  R.part(body, M, bodyGeo, 'body');
  const head = R.pivot(body, 0, 0.5, 0.04, 'head');
  R.part(head, M, headGeo, 'head');
  R.part(head, G, glintGeo, 'glint', true);
  const scarf = R.pivot(body, 0, 0.5, -0.04, 'scarf');
  R.part(scarf, M, scarfGeo, 'scarf');
  const arms = [], elbows = [], legs = [], knees = [];
  for (const s of [-1, 1]) {
    const arm = R.pivot(body, s * 0.22, 0.46, 0, 'arm' + s);
    R.part(arm, M, limbGeo, 'upper');
    const el = R.pivot(arm, 0, -0.34, 0, 'el' + s);
    R.part(el, M, lowerGeo, 'lower');
    arms.push(arm); elbows.push(el);
    const leg = R.pivot(body, s * 0.1, 0.05, 0, 'leg' + s);
    R.part(leg, M, limbGeo, 'thigh');
    const kn = R.pivot(leg, 0, -0.34, 0, 'kn' + s);
    R.part(kn, M, lowerGeo, 'shin');
    legs.push(leg); knees.push(kn);
  }
  const S = { time: rnd() * 10, move: 0, shiver: 0, dash: 0, stun: 0, hurt: 0, attack: 0, alert: 0 };
  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt, 0, 0.1);
    heal(S);
    const dead = clamp(pose.dead || 0);
    S.time += dt;
    S.move = damp(S.move, sstep(0.3, 8, clamp(pose.speed, 0, 16)), 10, dt);
    S.shiver = damp(S.shiver, clamp(pose.shiver || 0), 16, dt);
    S.dash = damp(S.dash, clamp(pose.dash || 0), 20, dt);
    S.stun = damp(S.stun, clamp(pose.stun || 0), 10, dt);
    S.hurt = damp(S.hurt, clamp(pose.hurt || 0), 30, dt);
    S.alert = damp(S.alert, clamp(pose.alert || 0), 14, dt);
    const t = S.time, ph = t * 20 * (0.25 + S.move);
    // run: the legs scissor, the arms swing; the body leans in. The shiver: the whole imp shakes. The dash: out flat, arms back, legs trailing.
    const run = S.move * (1 - S.dash);
    lean.rotation.x = 0.35 * S.move + 1.0 * S.dash + 0.25 * S.stun * Math.sin(t * 9);
    lean.position.y = 0.7 - 0.25 * S.dash - 0.12 * S.shiver + Math.abs(Math.sin(ph)) * 0.05 * run;
    lean.position.x = Math.sin(t * 60) * 0.035 * S.shiver;
    lean.rotation.z = Math.sin(t * 47) * 0.07 * S.shiver;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1, sw = Math.sin(ph + (s > 0 ? 0 : Math.PI));
      legs[i].rotation.x = sw * 0.9 * run - 0.2 * S.shiver + 0.9 * S.dash;
      knees[i].rotation.x = Math.max(0, -sw) * 1.1 * run + 0.5 * S.shiver + 0.3 * S.dash;
      arms[i].rotation.x = -sw * 0.8 * run + 0.9 * S.dash - 0.3 * S.shiver;
      elbows[i].rotation.x = -0.4 - 0.4 * run - 0.5 * S.shiver;
      arms[i].rotation.z = s * (0.15 + 0.5 * S.alert);
    }
    head.rotation.x = -0.2 * S.move - 0.5 * S.dash + 0.2 * S.stun;
    head.rotation.y = Math.sin(t * 3.1) * 0.15 * (1 - S.move);
    scarf.rotation.x = -0.3 * S.move - 0.5 * S.dash + Math.sin(t * 7) * 0.1;
    scarf.rotation.y = Math.sin(t * 5) * 0.2;
    const l = clamp(0.8 + 0.2 * S.shiver - 0.5 * S.stun * (0.5 + 0.5 * Math.sin(t * 14)) - dead);
    G.uniforms.uColorMul.value.setRGB(l, l, l);
    if (dead > 0) { const k = sstep(0, 1, dead), sc = Math.max(0.0001, 1 - k * k); R.rig.scale.setScalar(sc); R.rig.rotation.y = k * 10; } else { R.rig.scale.setScalar(1); R.rig.rotation.y = 0; }
    R.rig.visible = dead < 1;
    // it goes white while it shivers
    R.flash(Math.max(clamp(pose.flash || 0), 0.55 * S.shiver));
    const boost = lerp(1.25, 1.1, clamp(U.uDay.value));
    if (Math.abs(boost - (S.boost ?? -1)) > 0.004) { S.boost = boost; R.boost(boost); }
  }
  const top = R.pivot(R.rig, 0, 1.45, 0, 'top');
  return {
    root: R.root, radius: 0.45, height: 1.3,
    anchors: { eyes: head, top },
    testPoses: { idle: {}, run: { speed: 8 }, shiver: { shiver: 1, attack: 0.3 }, dash: { dash: 1, speed: 15, attack: 0.6 }, dazed: { stun: 1 } },
    update, flash: (k) => R.flash(k), dispose: () => R.dispose(), variant: 'shiver',
    get triangleCount() { return R.triangleCount; },
  };
}
