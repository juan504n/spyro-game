// ELDER WICK: the friendly lantern-keeper. A short, round, robed creature with a big hood, a long white beard and
// moustache, tiny hands, and a tall staff topped with a warm glowing lantern (unlit amber glass; anchors.lantern).
//
// Pose contract (all optional): { talk: bool (beard/jaw bob + nods), wave 0..1, t }
import * as THREE from 'three';
import { U } from '../../../engine/materials.js';
import {
  Rig, loft, ellipsoid, spike, bar, triC, triF, setBias, lit, unlit,
  clamp, lerp, sstep, damp, mix3, TAU, nextSeed, seeded,
} from './rig.js';

const TEAL = [0.14, 0.56, 0.58];
const TEAL_LO = [0.09, 0.38, 0.46];
const TEAL_HI = [0.28, 0.72, 0.70];
const VIOLET = [0.44, 0.30, 0.72];
const VIOLET_LO = [0.28, 0.18, 0.52];
const GOLD = [1.0, 0.76, 0.26];
const GOLD_LO = [0.80, 0.52, 0.14];
const SKIN = [0.96, 0.78, 0.64];
const NOSE = [0.98, 0.62, 0.56];
const WHITE = [0.98, 0.97, 1.0];
const WHITE_LO = [0.78, 0.76, 0.90];
const WOOD = [0.52, 0.34, 0.20];
const BRASS = [0.95, 0.68, 0.24];
const BRASS_LO = [0.58, 0.36, 0.10];
const AMBER = [1.0, 0.72, 0.20];
const AMBER_HI = [1.0, 0.92, 0.55];
const BLACK = [0.06, 0.04, 0.08];

const lathe = (b, profile, segs, color, o = {}) => b.lathe(profile, segs, { color, ...o });

// staff placement (the right hand grips it)
const STAFF_AT = [-0.50, 0, 0.23];
const STAFF_H = 2.02;
const LANTERN_Y = 2.30;

function robeGeo(b) {
  setBias(0.4);
  lathe(b, [[0.58, 0.02], [0.605, 0.12], [0.60, 0.15], [0.50, 0.62], [0.26, 1.06]], 8, (x, y) => {
    if (y < 0.13) return GOLD;
    return mix3(TEAL_LO, TEAL, sstep(0.15, 0.9, y));
  });
  // violet mantle over the shoulders
  lathe(b, [[0.44, 0.86], [0.24, 1.09]], 8, (x, y) => mix3(VIOLET_LO, VIOLET, sstep(0.86, 1.09, y)));
}

function hoodGeo(b) {
  setBias(0.4);
  // hood
  b.push().translate(0, 0.30, -0.04);
  ellipsoid(b, 0, 0, 0, 0.39, 0.37, 0.39, { segs: 8, rings: 3, col: (th) => mix3(VIOLET_LO, VIOLET, sstep(-0.2, 0.9, Math.sin(th))) });
  b.pop();
  // face
  setBias(0.3);
  b.push().translate(0, 0.25, 0.27);
  ellipsoid(b, 0, 0, 0, 0.21, 0.19, 0.16, { segs: 6, rings: 2, col: SKIN });
  b.pop();
  // nose
  b.push().translate(0, 0.21, 0.44);
  ellipsoid(b, 0, 0, 0, 0.09, 0.08, 0.085, { segs: 4, rings: 2, col: NOSE });
  b.pop();
  // bushy brows (white)
  for (const s of [1, -1]) {
    b.push().translate(s * 0.115, 0.36, 0.38).rotateZ(s * -0.25);
    ellipsoid(b, 0, 0, 0, 0.10, 0.045, 0.06, { segs: 4, rings: 2, col: WHITE });
    b.pop();
  }
}

function eyesGeo(b) {
  // two small dark eyes under the brows (lit black, tiny)
  setBias(0);
  for (const s of [1, -1]) {
    const c = [s * 0.095, 0.31, 0.415];
    const w = 0.032, h = 0.036;
    const n = [s * 0.15, 0.1, 1];
    triC(b, [c[0], c[1] - h, c[2]], [c[0] + w, c[1], c[2]], [c[0], c[1] + h, c[2]], BLACK, BLACK, BLACK, n, n, n);
    triC(b, [c[0], c[1] - h, c[2]], [c[0], c[1] + h, c[2]], [c[0] - w, c[1], c[2]], BLACK, BLACK, BLACK, n, n, n);
  }
}

function beardGeo(b) {
  // beard pivot at the chin (0, 0, 0); hangs down to y = -0.62
  setBias(0.5);
  lathe(b, [[0.0, -0.80], [0.13, -0.56], [0.27, -0.22], [0.20, 0.06]], 8,
    (x, y) => mix3(WHITE_LO, WHITE, sstep(-0.8, -0.1, y)));
  // handlebar moustache (pivot-local: just under the nose)
  for (const s of [1, -1]) {
    b.push().translate(s * 0.04, 0.03, 0.12);
    b.rotateY(s * 1.25);
    loft(b, [
      { z: 0.0, rx: 0.08, ry: 0.065, col: WHITE },
      { z: 0.30, rx: 0, ry: 0, y: 0.05, col: WHITE_LO },
    ], { segs: 4 });
    b.pop();
  }
}

function armGeo(b) {
  setBias(0.4);
  b.push().rotateX(Math.PI / 2);
  loft(b, [
    { z: 0.0, rx: 0.13, ry: 0.13, col: TEAL },
    { z: 0.30, rx: 0.095, ry: 0.095, col: TEAL_LO },
  ], { segs: 5, cap1: true, capCol: GOLD });
  b.pop();
  b.push().translate(0, -0.35, 0.02);
  ellipsoid(b, 0, 0, 0, 0.075, 0.075, 0.085, { segs: 5, rings: 2, col: SKIN });
  b.pop();
}

function staffGeo(b) {
  setBias(0.5);
  bar(b, [0, 0, 0], [0, STAFF_H, 0], 0.052, 0.042, WOOD, { segs: 4 });
  // lantern base
  lathe(b, [[0.10, STAFF_H - 0.03], [0.19, STAFF_H + 0.08]], 6, (x, y) => mix3(BRASS_LO, BRASS, sstep(STAFF_H, STAFF_H + 0.1, y)));
  // cage bars
  const y0 = STAFF_H + 0.08, y1 = LANTERN_Y + 0.26;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 6;
    bar(b, [0.17 * Math.sin(a), y0, 0.17 * Math.cos(a)], [0.15 * Math.sin(a), y1, 0.15 * Math.cos(a)], 0.024, 0.024, BRASS, { segs: 3 });
  }
  // roof + finial
  lathe(b, [[0.22, y1], [0.0, y1 + 0.17]], 6, (x, y) => mix3(BRASS_LO, BRASS, sstep(y1, y1 + 0.17, y)));
  spike(b, [0, y1 + 0.16, 0], [0, 1, 0], 0.09, 0.04, { segs: 3, col: BRASS, tip: GOLD });
}

function glassGeo(b) {
  // unlit amber glass + hot core
  ellipsoid(b, 0, LANTERN_Y, 0, 0.15, 0.20, 0.15, { segs: 6, rings: 2, col: (th, i) => mix3(AMBER, AMBER_HI, sstep(-0.5, 0.9, Math.sin(th) * 0.5 + 0.5) * 0.6) });
}

export function createElder(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets);
  const M = R.litMat(null);
  const G = R.glowMat(null);
  const seed = nextSeed(opts);
  const rnd = seeded(seed);

  const body = R.pivot(R.rig, 0, 0, 0, 'body');
  R.part(body, M, robeGeo, 'robe');
  const head = R.pivot(body, 0, 1.02, 0.0, 'head');
  R.part(head, M, hoodGeo, 'hood');
  const eyes = R.pivot(head, 0, 0.31, 0.415, 'eyes');
  R.part(eyes, M, (b) => { b.translate(0, -0.31, -0.415); eyesGeo(b); }, 'eyes');
  const beard = R.pivot(head, 0, 0.12, 0.30, 'beard');
  R.part(beard, M, beardGeo, 'beard');

  const armL = R.pivot(body, 0.40, 0.98, 0.04, 'armL');
  R.part(armL, M, armGeo, 'armL');
  const armR = R.pivot(body, -0.40, 0.98, 0.04, 'armR');
  R.part(armR, M, armGeo, 'armR');
  armR.rotation.set(-0.5, 0, -0.30);

  const staff = R.pivot(R.rig, ...STAFF_AT, 'staff');
  R.part(staff, M, staffGeo, 'staff');
  R.part(staff, G, glassGeo, 'glass', true);
  const lantern = R.pivot(staff, 0, LANTERN_Y, 0, 'lantern');

  const S = {
    time: rnd() * 20, talk: 0, wave: 0, blinkT: 2 + rnd() * 3, blink: 0, syl: 0, sylT: 0, flick: rnd() * 10, boost: -1, look: 0, lookT: 2, lookTarget: 0,
  };

  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt || 0, 0, 0.1);
    const talkT = pose.talk ? 1 : 0;
    const waveT = clamp(pose.wave || 0, 0, 1);
    S.time += dt; S.flick += dt;
    const t = S.time;
    const boost = lerp(1.22, 1.0, clamp(U.uDay.value));
    if (Math.abs(boost - S.boost) > 0.004) { S.boost = boost; R.boost(boost); }
    S.talk = damp(S.talk, talkT, 12, dt);
    S.wave = damp(S.wave, waveT, 10, dt);
    const talk = S.talk, wave = S.wave;

    // idle: gentle sway + breathing
    const sway = Math.sin(t * 1.15) * 0.028;
    const breath = Math.sin(t * 1.9);
    R.rig.position.set(0, Math.abs(Math.sin(t * 1.15)) * 0.012, 0);
    body.rotation.set(0.01 * breath + 0.05 * talk * Math.sin(t * 3.1) + 0.05 * wave, 0.05 * wave, sway);
    body.scale.set(1 + 0.012 * breath, 1 + 0.008 * breath, 1 + 0.012 * breath);

    // speech: irregular syllables drive the beard, nods drive the head
    S.sylT -= dt;
    if (S.sylT <= 0) { S.sylT = 0.09 + rnd() * 0.12; S.syl = 0.35 + rnd() * 0.65; }
    const jaw = talk * (0.5 + 0.5 * Math.sin(t * 17)) * S.syl;
    beard.rotation.set(0.22 * jaw + 0.02 * breath, 0, 0.04 * Math.sin(t * 2.2) + talk * 0.05 * Math.sin(t * 11));
    beard.scale.set(1 + 0.05 * jaw, 1 - 0.07 * jaw, 1 + 0.05 * jaw);
    // look about slowly
    S.lookT -= dt;
    if (S.lookT <= 0) { S.lookT = 2.5 + rnd() * 3; S.lookTarget = (rnd() - 0.5) * 0.7; }
    S.look = damp(S.look, S.lookTarget, 2.5, dt);
    head.rotation.set(0.07 * Math.sin(t * 3.1) * talk + 0.03 * breath - 0.06 * wave, S.look * (1 - 0.5 * talk) + 0.1 * wave, 0.05 * Math.sin(t * 0.9) - 0.1 * wave);
    head.position.set(0, 1.02 + 0.006 * breath, 0);

    // slow blinks
    S.blinkT -= dt;
    if (S.blinkT <= 0) { S.blink = 0.22; S.blinkT = 3 + rnd() * 3.5; }
    let open = 1;
    if (S.blink > 0) { S.blink -= dt; open = clamp(Math.abs(1 - S.blink / 0.11) , 0.1, 1); }
    eyes.scale.set(1, open, 1);

    // arms: left hand waves; right hand holds the staff (small counter-sway)
    const waveAng = Math.sin(t * 9) * 0.32;
    armL.rotation.set(-0.15 * (1 - wave) - 0.3 * wave + 0.08 * Math.sin(t * 1.3) * (1 - wave) + 0.1 * talk * Math.sin(t * 4.1), 0, 0.12 + wave * (2.45 + waveAng) - 0.0);
    armR.rotation.set(-0.5 + 0.03 * Math.sin(t * 1.15), 0, -0.30);
    staff.rotation.set(0.012 * Math.sin(t * 1.15 + 1), 0, 0.02 * Math.sin(t * 1.15));

    // lantern flame flicker (glass is unlit; brightness wobbles)
    const fl = 1 + Math.sin(S.flick * 13) * 0.05 + Math.sin(S.flick * 5.3 + 1) * 0.06 + Math.sin(S.flick * 31) * 0.02;
    G.uniforms.uColorMul.value.setRGB(fl, fl, fl);

    if (pose.flash !== undefined) R.flash(clamp(pose.flash, 0, 1));
  }

  const testPoses = {
    idle: {},
    talk: { talk: true },
    wave: { wave: 1 },
    'talk+wave': { talk: true, wave: 1 },
  };

  return {
    root: R.root,
    radius: 0.55,
    height: 1.7,
    anchors: { lantern, top: R.pivot(R.rig, 0, 1.75, 0, 'top') },
    testPoses,
    update,
    flash: (k) => R.flash(k),
    dispose: () => R.dispose(),
    get triangleCount() { return R.triangleCount; },
  };
}
