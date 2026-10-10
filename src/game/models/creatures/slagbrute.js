// SLAG BRUTE: the elite of Emberfall Crags (foes/brute.js). A hulking walker, 3.2 m, hunched, in a coat of dark slag plates cracked with orange; arms that hang to the knees ending in fists the size of
// the hero; a head sunk between the shoulders with two furnace eyes; and in its chest a round iron hatch with a fire behind it. It raises both fists (pose.raise) and slams (pose.attack), and after the
// slam the hatch stands open (pose.vent 1: the fire behind it shows, the plate swings out), and with each wound (pose.wounds 0..3) another plate of its coat is gone and the cracks are wider.
// Faces +z, origin at the ground under the middle.
// Pose contract (all optional): { speed, attack 0..1, raise 0..1, vent 0|1, wounds 0..3, stun, alert, hurt 0..1, dead 0..1, t }
import { U } from '../../../engine/materials.js';
import { Rig, ellipsoid, spike, bar, triF, setBias, clamp, heal, lerp, sstep, damp, mix3, TAU, nextSeed, seeded } from './rig.js';

const SLAG = [0.24, 0.2, 0.22], SLAG_HI = [0.46, 0.38, 0.38], SLAG_LO = [0.12, 0.1, 0.13], IRON = [0.5, 0.46, 0.5], IRON_HI = [0.76, 0.7, 0.68], FIRE = [1.0, 0.55, 0.12], FIRE_HI = [1.0, 0.86, 0.4], FIRE_LO = [0.9, 0.25, 0.05];

function torsoGeo(b) {                                   // (torso frame: the waist at the origin, +y up)
  setBias(0.4);
  ellipsoid(b, 0, 0.55, 0, 0.78, 0.72, 0.62, { segs: 9, rings: 4, col: (th) => mix3(SLAG_LO, SLAG_HI, 0.45 + 0.4 * Math.sin(th)) });
  ellipsoid(b, 0, 0.0, 0, 0.55, 0.35, 0.45, { segs: 8, rings: 3, col: SLAG_LO });
  for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; spike(b, [Math.sin(a) * 0.6, 1.0, Math.cos(a) * 0.5 - 0.1], [Math.sin(a) * 0.4, 1, Math.cos(a) * 0.4 - 0.3], 0.34 + (i % 3) * 0.1, 0.12, { segs: 4, col: SLAG, tip: SLAG_HI }); }
}
function headGeo(b) {                                    // (head frame)
  setBias(0.4);
  ellipsoid(b, 0, 0.1, 0.06, 0.34, 0.3, 0.34, { segs: 8, rings: 4, col: (th) => mix3(SLAG_LO, SLAG_HI, 0.5 + 0.5 * Math.sin(th)) });
  b.box(0, 0.1, 0.34, 0.56, 0.1, 0.06, { color: SLAG_LO });
  spike(b, [0, 0.36, -0.05], [0, 1, -0.3], 0.34, 0.1, { segs: 4, col: SLAG, tip: IRON_HI });
}
function eyesGeo(b) {                                    // (unlit, head frame: two slits of fire)
  for (const s of [-1, 1]) { triF(b, [s * 0.15 - 0.09, 0.1, 0.375], [s * 0.15 + 0.09, 0.12, 0.375], [s * 0.15, 0.17, 0.375], FIRE_HI); triF(b, [s * 0.15 - 0.09, 0.1, 0.375], [s * 0.15, 0.06, 0.375], [s * 0.15 + 0.09, 0.12, 0.375], FIRE); }
}
function plateGeo(b) {                                   // (a slab of the coat, centred: 0.5 x 0.44 x 0.14)
  setBias(0.5);
  b.box(0, 0, 0, 0.5, 0.44, 0.14, { color: SLAG });
  b.box(0, 0.19, 0.02, 0.46, 0.05, 0.12, { color: SLAG_HI });
}
function hatchFireGeo(b) {                               // (unlit, torso frame: the furnace in the chest, a disc and a glow of spikes)
  const z = 0.605;
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TAU, a1 = ((i + 1) / 8) * TAU, c = i % 2 ? FIRE : FIRE_HI;
    triF(b, [0, 0.62, z], [Math.cos(a0) * 0.27, 0.62 + Math.sin(a0) * 0.27, z], [Math.cos(a1) * 0.27, 0.62 + Math.sin(a1) * 0.27, z], FIRE_HI, c, c);
  }
}
function hatchDoorGeo(b) {                               // (hatch frame: hinged at the left edge, a disc 0.56 across reaching along +x)
  setBias(0.5);
  b.box(0.28, 0, 0, 0.56, 0.56, 0.06, { color: IRON });
  b.box(0.28, 0, 0.04, 0.4, 0.4, 0.04, { color: IRON_HI });
  for (const [x, y] of [[0.06, 0.22], [0.5, 0.22], [0.06, -0.22], [0.5, -0.22]]) ellipsoid(b, x, y, 0.07, 0.04, 0.04, 0.03, { segs: 4, rings: 2, col: SLAG_LO });
}
function cracksGeo(b) {                                  // (unlit: seams of fire along the torso, torso frame; drawn on top of the slag)
  const z = 0.45;
  for (const [x, y, ang, len] of [[-0.42, 0.9, 0.5, 0.5], [0.46, 0.8, -0.4, 0.55], [-0.3, 0.3, -0.2, 0.4], [0.28, 0.2, 0.3, 0.38]]) {
    const dx = Math.sin(ang) * len, dy = Math.cos(ang) * len;
    triF(b, [x, y, z + 0.1], [x + 0.045, y, z + 0.1], [x + dx, y + dy, z + 0.1], FIRE_HI, FIRE, FIRE_LO);
    triF(b, [x, y, z + 0.1], [x + dx, y + dy, z + 0.1], [x - 0.045 + dx * 0.5, y + dy * 0.5, z + 0.1], FIRE_HI, FIRE_LO, FIRE);
  }
}
function upperGeo(b) {                                   // (arm frame: the shoulder at the origin; hangs down -y, 0.9 long)
  setBias(0.4);
  ellipsoid(b, 0, 0.0, 0, 0.3, 0.28, 0.3, { segs: 7, rings: 3, col: SLAG_HI });
  bar(b, [0, 0, 0], [0, -0.9, 0.05], 0.26, 0.2, SLAG, { segs: 6 });
}
function foreGeo(b) {                                    // (forearm frame: the elbow at the origin; fist at the end)
  setBias(0.4);
  bar(b, [0, 0, 0], [0, -0.7, 0.1], 0.22, 0.26, SLAG_LO, { segs: 6 });
  ellipsoid(b, 0, -0.95, 0.14, 0.38, 0.36, 0.38, { segs: 8, rings: 4, col: (th) => mix3(SLAG_LO, SLAG_HI, 0.5 + 0.5 * Math.sin(th)) });
  for (let i = 0; i < 4; i++) spike(b, [(i - 1.5) * 0.18, -0.78, 0.35], [0, 0.3, 1], 0.24, 0.08, { segs: 4, col: SLAG, tip: IRON_HI });
}
function legGeo(b) {                                     // (leg frame: the hip at the origin; hangs down, ends in a foot)
  setBias(0.4);
  bar(b, [0, 0, 0], [0, -0.85, 0.05], 0.3, 0.26, SLAG, { segs: 6 });
  ellipsoid(b, 0, -0.95, 0.18, 0.34, 0.16, 0.5, { segs: 7, rings: 3, col: SLAG_LO });
}

export function createSlagbrute(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets, 'slagbrute');
  const M = R.litMat(null), G = R.glowMat(null);
  const rnd = seeded(nextSeed(opts));
  const hips = R.pivot(R.rig, 0, 1.15, 0, 'hips');
  const torso = R.pivot(hips, 0, 0.1, 0, 'torso');
  R.part(torso, M, torsoGeo, 'torso');
  const furnace = R.pivot(torso, 0, 0, 0, 'furnace');
  R.part(furnace, G, hatchFireGeo, 'fire', true);
  const cracks = R.pivot(torso, 0, 0, 0, 'cracks');
  R.part(cracks, G, cracksGeo, 'cracks', true);
  const hatch = R.pivot(torso, -0.28, 0.62, 0.62, 'hatch');
  R.part(hatch, M, hatchDoorGeo, 'hatch');
  const head = R.pivot(torso, 0, 1.1, 0.35, 'head');
  R.part(head, M, headGeo, 'head');
  R.part(head, G, eyesGeo, 'eyes', true);
  // plates of the coat: three on the shoulders and back, each leaves with a wound
  const plates = [];
  [[-0.5, 1.0, -0.45, 0.4], [0.5, 1.0, -0.45, -0.4], [0, 0.55, -0.62, 0.0]].forEach(([x, y, z, ry], i) => {
    const p = R.pivot(torso, x, y, z, 'plate' + i);
    p.rotation.y = ry; p.rotation.x = -0.25;
    R.part(p, M, plateGeo, 'plate');
    plates.push(p);
  });
  const arms = [], fores = [], legs = [];
  for (const s of [-1, 1]) {
    const arm = R.pivot(torso, s * 0.95, 1.05, 0, 'arm' + s);
    R.part(arm, M, upperGeo, 'upper');
    const fore = R.pivot(arm, 0, -0.9, 0.05, 'fore' + s);
    R.part(fore, M, foreGeo, 'fore');
    arms.push(arm); fores.push(fore);
    const leg = R.pivot(hips, s * 0.42, -0.05, 0, 'leg' + s);
    R.part(leg, M, legGeo, 'leg');
    legs.push(leg);
  }
  const S = { time: rnd() * 10, move: 0, raise: 0, vent: 0, stun: 0, hurt: 0, attack: 0, alert: 0, wounds: 0 };
  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt, 0, 0.1);
    heal(S);
    const dead = clamp(pose.dead || 0);
    S.time += dt;
    S.move = damp(S.move, sstep(0.3, 3.4, clamp(pose.speed, 0, 12)), 8, dt);
    S.raise = damp(S.raise, clamp(pose.raise || 0), 10, dt);
    S.attack = damp(S.attack, clamp(pose.attack || 0), 16, dt);
    S.vent = damp(S.vent, clamp(pose.vent || 0), 12, dt);
    S.stun = damp(S.stun, clamp(pose.stun || 0), 10, dt);
    S.hurt = damp(S.hurt, clamp(pose.hurt || 0), 30, dt);
    S.alert = damp(S.alert, clamp(pose.alert || 0), 12, dt);
    S.wounds = damp(S.wounds, clamp(pose.wounds || 0, 0, 3), 8, dt);
    const t = S.time, ph = t * 3.2 * (0.3 + S.move), w = S.wounds;
    // the walk: heavy, slow, the whole torso rolls; the raise: both fists over the head; the slam (attack 0.6+): fists to the ground and the torso bowed
    const up = sstep(0, 1, S.raise), slam = sstep(0.55, 0.8, S.attack);
    hips.position.y = 1.15 + Math.abs(Math.sin(ph)) * 0.09 * S.move - 0.28 * slam - 0.08 * S.stun;
    torso.rotation.x = 0.2 + 0.1 * S.move - 0.35 * up + 0.7 * slam + 0.08 * Math.sin(t * 1.3);
    torso.rotation.y = Math.sin(ph) * 0.14 * S.move;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1, sw = Math.sin(ph + (s > 0 ? 0 : Math.PI));
      legs[i].rotation.x = sw * 0.5 * S.move;
      arms[i].rotation.x = -sw * 0.3 * S.move + lerp(0, -2.8, up) + lerp(0, 3.0, slam);
      arms[i].rotation.z = s * (0.12 + 0.2 * up);
      fores[i].rotation.x = lerp(-0.25, -0.5, up) + 0.3 * slam;
    }
    head.rotation.x = -0.15 - 0.25 * up + 0.3 * slam;
    head.rotation.y = Math.sin(t * 0.9) * 0.2 * (1 - up);
    // the hatch: shut until it vents, then swung open on its hinge with the fire behind it
    hatch.rotation.y = -sstep(0, 1, S.vent) * 1.9;
    const fire = 0.35 + 0.65 * S.vent + 0.1 * Math.sin(t * 7);
    furnace.visible = true;
    for (let i = 0; i < plates.length; i++) { const gone = w > i + 0.2; plates[i].visible = !gone; }
    cracks.scale.setScalar(0.8 + 0.3 * w);
    const l = clamp(fire + 0.2 * w - dead);
    G.uniforms.uColorMul.value.setRGB(l, l * 0.92, l * 0.85);
    if (dead > 0) { const k = sstep(0, 1, dead), sc = Math.max(0.0001, 1 - k * k); R.rig.scale.setScalar(sc); R.rig.rotation.y = k * 8; } else { R.rig.scale.setScalar(1); R.rig.rotation.y = 0; }
    R.rig.visible = dead < 1;
    if (pose.flash !== undefined) R.flash(clamp(pose.flash, 0, 1));
    const boost = lerp(1.25, 1.05, clamp(U.uDay.value));
    if (Math.abs(boost - (S.boost ?? -1)) > 0.004) { S.boost = boost; R.boost(boost); }
  }
  const top = R.pivot(R.rig, 0, 3.4, 0, 'top');
  return {
    root: R.root, radius: 1.5, height: 3.2,
    anchors: { eyes: head, top, hatch },
    testPoses: { idle: {}, walk: { speed: 3.2 }, raised: { raise: 1, attack: 0.3 }, slam: { attack: 0.8 }, vent: { vent: 1, attack: 0.7, stun: 0.4 }, wounded: { vent: 1, wounds: 2 } },
    update, flash: (k) => R.flash(k), dispose: () => R.dispose(), variant: 'brute',
    get triangleCount() { return R.triangleCount; },
  };
}
