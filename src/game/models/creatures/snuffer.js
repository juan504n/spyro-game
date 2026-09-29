// SNUFFER: a small hooded shadow-imp that snuffs out lanterns. Tattered indigo robe, pale expressionless mask with two
// glowing yellow eyes (unlit material), stubby arms, and a long brass-belled candle-snuffer pole.
//
// variants (opts.variant): 'basic' | 'bell' (metal dome helmet + big brass bell shield, fire-proof) | 'thorn' (crystal thorns, charge-proof)
//
// Pose contract (all optional): { speed 0..8, attack 0..1 (windup 0..0.4, strike 0.4..0.6, recover), alert 0..1,
//   hurt 0..1, stun 0..1, dead 0..1 (poof: shrink + spin, hidden at 1), t }
import * as THREE from 'three';
import { U } from '../../../engine/materials.js';
import {
  Rig, loft, ellipsoid, spike, bar, triC, triF, setBias,
  clamp, heal, lerp, sstep, damp, mix3, TAU, nextSeed, seeded,
} from './rig.js';

// ---- palette -----------------------------------------------------------------------------------------------------------
const ROBE_LO = [0.12, 0.10, 0.27];
const ROBE = [0.20, 0.16, 0.40];
const ROBE_HI = [0.33, 0.27, 0.58];
const HOOD_IN = [0.06, 0.04, 0.14];
const MASK = [0.93, 0.90, 0.97];
const MASK_LO = [0.68, 0.64, 0.78];
const BRASS = [1.0, 0.74, 0.26];
const BRASS_HI = [1.0, 0.92, 0.55];
const BRASS_LO = [0.70, 0.44, 0.14];
const WOOD = [0.42, 0.28, 0.16];
const CRYSTAL = [0.55, 0.42, 1.0];
const CRYSTAL_HI = [0.85, 0.78, 1.0];
const CRYSTAL_LO = [0.30, 0.20, 0.72];
const IRON = [0.62, 0.62, 0.74];
const IRON_HI = [0.86, 0.86, 0.96];
const EYE = [1.0, 0.86, 0.14];
const BLACK = [0.03, 0.02, 0.06];

const lathe = (b, profile, segs, color, o = {}) => b.lathe(profile, segs, { color, ...o });

// ---- geometry ---------------------------------------------------------------------------------------------------------
function torsoGeo(b) {
  setBias(0.35);
  // waist (y 0) -> shoulders; body-local (pivot at the waist)
  lathe(b, [[0.40, -0.02], [0.35, 0.22], [0.29, 0.42], [0.16, 0.52]], 8,
    (x, y) => mix3(ROBE, ROBE_HI, sstep(0.0, 0.5, y)));
}

function skirtGeo(b) {
  setBias(0.3);
  // hem ring at y = -0.42; waist at 0. Extra tattered tabs hang below the hem.
  lathe(b, [[0.62, -0.42], [0.50, -0.22], [0.38, 0.0]], 8,
    (x, y) => mix3(ROBE_LO, ROBE, sstep(-0.42, 0.0, y)));
  const N = 8, r = 0.62, y0 = -0.42;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU, am = (a0 + a1) / 2;
    const len = i % 2 ? 0.20 : 0.34;
    const p0 = [r * Math.sin(a0), y0, r * Math.cos(a0)], p1 = [r * Math.sin(a1), y0, r * Math.cos(a1)];
    const tip = [(r * 0.97) * Math.sin(am), y0 - len, (r * 0.97) * Math.cos(am)];
    const n = [Math.sin(am), -0.25, Math.cos(am)];
    triC(b, p0, p1, tip, ROBE_LO, ROBE_LO, mix3(ROBE, ROBE_HI, 0.45), n, n, n);
  }
}

function hoodGeo(b, variant) {
  setBias(0.4);
  // hood: dark cowl (inside darkens toward the face), pale mask plate on the front
  const hc = (th, i) => {
    const s = Math.sin(th), c = Math.cos(th);
    const top = sstep(0.1, 0.9, s);
    return mix3(ROBE, ROBE_HI, top * 0.8);
  };
  b.push().translate(0, 0.23, -0.03);
  ellipsoid(b, 0, 0, 0, 0.38, 0.40, 0.38, { segs: 8, rings: 3, col: (th, i) => hc(th, i) });
  b.pop();
  // drooping hood tip
  setBias(0.4);
  spike(b, [0, 0.50, -0.20], [0, 0.35, -0.94], 0.30, 0.13, { segs: 5, col: ROBE, tip: ROBE_LO });
  // pale mask plate on the front of the hood
  setBias(0.15);
  b.push().translate(0, 0.21, 0.27);
  ellipsoid(b, 0, 0, 0, 0.20, 0.245, 0.07, { segs: 8, rings: 2, col: (th) => mix3(MASK_LO, MASK, sstep(-0.3, 0.8, Math.sin(th))) });
  b.pop();
  if (variant === 'bell') {
    setBias(0.5);
    // metal dome helmet with a brim, sitting over the hood
    lathe(b, [[0.40, 0.14], [0.31, 0.36], [0.15, 0.52], [0, 0.58]], 8,
      (x, y) => mix3(IRON, IRON_HI, sstep(0.15, 0.6, y)));
    // helmet nub
    spike(b, [0, 0.57, 0], [0, 1, 0], 0.10, 0.06, { segs: 3, col: BRASS, tip: BRASS_HI });
  }
}

function eyesGeo(b) {
  // unlit: dark sockets + glowing yellow slits, slanted menacingly (inner ends low)
  for (const s of [1, -1]) {
    const cx = s * 0.085, cy = 0.245, z = 0.352;
    const rot = s * -0.5;
    const c = Math.cos(rot), sn = Math.sin(rot);
    const P = (x, y, dz = 0) => [cx + x * c - y * sn, cy + x * sn + y * c, z + dz];
    const w = 0.082, h = 0.046;
    triF(b, P(-w, -h), P(w, -h), P(w, h), BLACK);
    triF(b, P(-w, -h), P(w, h), P(-w, h), BLACK);
    const w2 = 0.066, h2 = 0.026;
    triF(b, P(-w2, -h2, 0.012), P(w2, -h2, 0.012), P(w2, h2, 0.012), EYE);
    triF(b, P(-w2, -h2, 0.012), P(w2, h2, 0.012), P(-w2, h2, 0.012), EYE);
  }
}

function armGeo(b, side) {
  setBias(0.35);
  // sleeve hangs along -y from the shoulder pivot: a tapered cone with a rounded cuff, the hand pokes out below it
  b.push().rotateX(Math.PI / 2);
  loft(b, [
    { z: 0.0, rx: 0.13, ry: 0.13, col: ROBE },
    { z: 0.24, rx: 0.105, ry: 0.105, col: ROBE_LO },
    { z: 0.34, rx: 0, ry: 0, col: ROBE_LO },
  ], { segs: 5 });
  b.pop();
  // hand
  b.push().translate(0, -0.37, 0.03);
  ellipsoid(b, 0, 0, 0, 0.095, 0.095, 0.11, { segs: 5, rings: 2, col: MASK_LO });
  b.pop();
}

const POLE_TOP = 1.02;
function poleGeo(b) {
  // grip at origin; shaft along +y; bell (opening downward) on top
  setBias(0.5);
  bar(b, [0, -0.45, 0], [0, POLE_TOP, 0], 0.048, 0.042, WOOD, { segs: 4 });
  // brass ring under the bell
  b.push().translate(0, POLE_TOP - 0.02, 0);
  lathe(b, [[0.27, 0.0], [0.19, 0.10], [0.11, 0.24], [0.0, 0.33]], 6,
    (x, y) => mix3(BRASS_LO, BRASS_HI, sstep(0.0, 0.34, y)));
  spike(b, [0, 0.32, 0], [0, 1, 0], 0.09, 0.05, { segs: 4, col: BRASS, tip: BRASS_HI });
  // dark hollow inside the mouth
  const n = [0, -1, 0];
  const r = 0.255, y = 0.02;
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * TAU, a1 = ((i + 1) / 6) * TAU;
    triC(b, [0, y + 0.03, 0], [r * Math.sin(a1), y, r * Math.cos(a1)], [r * Math.sin(a0), y, r * Math.cos(a0)], BRASS_LO, BRASS_LO, BRASS_LO, n, n, n);
  }
  b.pop();
}

function shieldGeo(b) {
  // big brass bell held mouth-forward-ish in front of the imp: built upright (y up), mouth at y=0, body pivot at its centre
  setBias(0.55);
  lathe(b, [[0.50, 0.0], [0.37, 0.10], [0.29, 0.28], [0.15, 0.48], [0, 0.60]], 8,
    (x, y) => mix3(BRASS_LO, BRASS_HI, sstep(0.0, 0.6, y) * 0.9 + 0.1));
  // knob
  spike(b, [0, 0.58, 0], [0, 1, 0], 0.12, 0.07, { segs: 3, col: BRASS, tip: BRASS_HI });
}

function thornsGeo(b) {
  setBias(0.7);
  const P = (p, d, h, r) => {
    // 4-sided crystal: a bipyramid along d
    spike(b, p, d, h, r, { segs: 4, col: CRYSTAL_LO, tip: CRYSTAL_HI, base: false });
    spike(b, p, [-d[0], -d[1], -d[2]], h * 0.22, r, { segs: 4, col: CRYSTAL_LO, tip: CRYSTAL_LO });
  };
  // back thorns (body-local, pivot at waist)
  P([0, 0.40, -0.22], [0, 0.85, -0.5], 0.72, 0.14);
  P([0.19, 0.34, -0.22], [0.55, 0.7, -0.45], 0.54, 0.12);
  P([-0.19, 0.34, -0.22], [-0.55, 0.7, -0.45], 0.54, 0.12);
  // shoulder thorns
  P([0.32, 0.50, 0.0], [0.8, 0.6, 0.0], 0.40, 0.10);
  P([-0.32, 0.50, 0.0], [-0.8, 0.6, 0.0], 0.40, 0.10);
}

// ---- model ------------------------------------------------------------------------------------------------------------
export function createSnuffer(assets, opts) {
  opts = opts || {};
  const variant = opts.variant === 'bell' || opts.variant === 'thorn' ? opts.variant : 'basic';
  const R = new Rig(assets, 'snuffer:' + variant);
  const M = R.litMat(null);
  const G = R.glowMat(null);
  const seed = nextSeed(opts);
  const rnd = seeded(seed);

  const body = R.pivot(R.rig, 0, 0.56, 0, 'body');
  R.part(body, M, torsoGeo, 'torso');
  const skirt = R.pivot(body, 0, 0, 0, 'skirt');
  R.part(skirt, M, skirtGeo, 'skirt');

  const head = R.pivot(body, 0, 0.50, 0.02, 'head');
  R.part(head, M, (b) => hoodGeo(b, variant), 'hood');
  const eyes = R.pivot(head, 0, 0.245, 0.352, 'eyes');
  R.part(eyes, G, (b) => { b.translate(0, -0.245, -0.352); eyesGeo(b); }, 'eyes', true);

  const shoulder = (side) => R.pivot(body, side * 0.31, 0.40, 0.02, side > 0 ? 'armL' : 'armR');
  const armL = shoulder(1), armR = shoulder(-1);
  R.part(armL, M, (b) => armGeo(b, 1), 'armL');
  R.part(armR, M, (b) => armGeo(b, -1), 'armR');
  const grip = R.pivot(armR, 0, -0.37, 0.02, 'grip');
  R.part(grip, M, poleGeo, 'pole');
  const tipAnchor = R.pivot(grip, 0, POLE_TOP + 0.02, 0, 'poleTip');
  const bellAnchor = R.pivot(grip, 0, POLE_TOP + 0.02, 0, 'bell');

  let shield = null;
  if (variant === 'bell') {
    shield = R.pivot(body, 0, 0.12, 0.62, 'shield');
    R.part(shield, M, shieldGeo, 'shield');
  }
  if (variant === 'thorn') R.part(body, M, thornsGeo, 'thorns');

  const eyeAnchor = R.pivot(head, 0, 0.245, 0.4, 'eyesAnchor');
  const top = R.pivot(R.rig, 0, 2.0, 0, 'top');

  // ---- animation ---------------------------------------------------------------------------------------------
  const S = {
    time: rnd() * 10, phase: rnd() * TAU, move: 0, chase: 0, alert: 0, hurt: 0, stun: 0, dead: 0, attack: 0, flick: rnd() * 10,
    look: 0, lookT: 1 + rnd() * 3, lookTarget: 0, boost: -1, hop: 0, prevAlert: 0, hopT: 9,
  };
  const CARRY = 0.55;      // right-arm forward raise (rad from hanging) while carrying the pole
  const NIGHT_BOOST = 1.18;

  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt, 0, 0.1);
    heal(S);
    const speed = clamp(pose.speed, 0, 12);
    const attack = clamp(pose.attack || 0, 0, 1);
    const alertT = clamp(pose.alert || 0, 0, 1);
    const hurt = clamp(pose.hurt || 0, 0, 1);
    const stun = clamp(pose.stun || 0, 0, 1);
    const dead = clamp(pose.dead || 0, 0, 1);

    S.time += dt; S.flick += dt;
    const boost = lerp(NIGHT_BOOST, 1.05, clamp(U.uDay.value));
    if (Math.abs(boost - S.boost) > 0.004) { S.boost = boost; R.boost(boost); }
    S.move = damp(S.move, sstep(0.2, 1.8, speed), 10, dt);
    S.chase = damp(S.chase, sstep(2.6, 5.0, speed), 8, dt);
    S.alert = damp(S.alert, alertT, 18, dt);
    S.hurt = damp(S.hurt, hurt, 40, dt);
    S.stun = damp(S.stun, stun, 10, dt);
    if (alertT > 0.5 && S.prevAlert <= 0.5) S.hopT = 0;
    S.prevAlert = alertT;
    S.hopT += dt;
    const freq = 1.1 + speed * 0.42;
    S.phase += TAU * freq * dt * (0.2 + 0.8 * S.move);
    const ph = S.phase;
    const move = S.move, chase = S.chase, alert = S.alert, hurtK = S.hurt, stunK = S.stun;
    const calm = (1 - move) * (1 - stunK);

    // attack curve
    const wind = sstep(0.0, 0.4, attack), strike = sstep(0.4, 0.48, attack), rec = sstep(0.6, 1.0, attack);
    const atk = attack > 0 && attack < 1 ? 1 : 0;
    // value that ramps 0 -> a during the windup, jumps to b on the strike, and relaxes back to 0 in the recovery
    const pulse = (a, b) => lerp(lerp(a * wind, b, strike), 0, rec);

    // ---- hover + lean ---------------------------------------------------------------------------------------------
    const bob = Math.sin(TAU * 0.55 * S.time) * 0.035 * (1 - move) + Math.abs(Math.sin(ph)) * 0.06 * move - 0.02 * chase;
    const hopY = alert * 0.05 + Math.max(0, Math.sin(Math.min(S.hopT, 0.5) / 0.5 * Math.PI)) * 0.34 * (S.hopT < 0.5 ? 1 : 0);
    const dieHop = dead > 0 ? Math.sin(Math.min(dead * 2.5, 1) * Math.PI) * 0.25 : 0;
    R.rig.position.set(0, 0.22 + bob + hopY + dieHop, 0);
    const lean = 0.10 * move + 0.20 * chase + pulse(-0.30, 0.38) - 0.34 * hurtK - 0.06 * alert;
    const wobble = Math.sin(S.time * 7.5) * 0.16 * stunK;
    const roll = Math.sin(ph) * 0.10 * move + Math.sin(TAU * 0.4 * S.time) * 0.03 * calm + wobble + Math.sin(S.time * 40) * 0.06 * hurtK;
    body.rotation.set(lean + Math.cos(S.time * 7.5) * 0.10 * stunK, 0, roll);
    body.position.set(0, 0.56 - 0.05 * hurtK, 0.16 * pulse(-0.3, 1.0) * 0.6);
    const stretch = 1 + 0.09 * alert - 0.05 * hurtK;
    R.rig.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));

    // dead: poof — shrink + spin, hidden at 1
    if (dead > 0) {
      const k = sstep(0, 1, dead);
      const s = Math.max(0.0001, 1 - k * k);
      R.rig.scale.multiplyScalar(s);
      R.rig.rotation.y = k * 10;
    } else R.rig.rotation.y = 0;
    R.rig.visible = dead < 1;

    // skirt: trails the motion, waddles
    skirt.rotation.set(0.04 + 0.16 * move + 0.14 * chase - 0.55 * lean + 0.1 * Math.sin(S.time * 1.4) * calm, 0, -Math.sin(ph) * 0.14 * move - roll * 0.6 - 0.1 * Math.sin(S.time * 7.5) * stunK);
    skirt.position.y = 0;

    // ---- head + eyes ----------------------------------------------------------------------------------------------
    S.lookT -= dt;
    if (S.lookT <= 0) { S.lookT = 1.5 + rnd() * 3; S.lookTarget = (rnd() - 0.5) * 0.9; }
    S.look = damp(S.look, S.lookTarget * calm, 3, dt);
    const dizzy = stunK;
    head.rotation.set(-lean * 0.7 + 0.12 * alert + 0.25 * hurtK * -1 + Math.sin(S.time * 6) * 0.22 * dizzy + 0.02 * Math.sin(TAU * 0.5 * S.time) * calm,
      S.look + Math.cos(S.time * 6) * 0.3 * dizzy + 0.15 * Math.sin(ph) * move * 0,
      Math.cos(S.time * 6.3) * 0.2 * dizzy);
    // eyes: flicker, widen when startled/striking, dim when stunned / dying
    const fl = 1 + Math.sin(S.flick * 23) * 0.04 + Math.sin(S.flick * 9.7) * 0.05;
    const widen = 1 + 0.35 * alert + 0.25 * pulse(0.1, 1.0) - 0.35 * hurtK;
    const dim = clamp(1 - 0.65 * stunK * (0.5 + 0.5 * Math.sin(S.time * 14)) - dead, 0, 1);
    eyes.scale.set(widen, widen * (1 - 0.6 * hurtK) * (1 + 0.15 * chase), 1);
    eyes.rotation.z = Math.sin(S.time * 9) * 0.7 * stunK;
    G.uniforms.uColorMul.value.setRGB(fl * dim, fl * dim, fl * dim);

    // ---- arms + pole ----------------------------------------------------------------------------------------------
    // right arm carries the pole: attack drives it; alert throws it up
    const armPhiBase = lerp(CARRY, 2.55, alert * 0.7) + 0.35 * chase - 0.2 * Math.sin(ph) * move;
    let armPhi;
    if (atk) armPhi = lerp(lerp(armPhiBase, 2.45, wind), 0.95, strike);
    else armPhi = armPhiBase;
    armPhi = lerp(armPhi, armPhiBase, rec * atk);
    armPhi = lerp(armPhi, 0.25, stunK);
    armR.rotation.set(-armPhi + 0.06 * Math.sin(S.time * 2.2) * calm, 0, -0.10 - 0.25 * alert + 0.4 * wind * atk * 0.3);
    // pole tilt in world terms (0 = vertical, + = top forward)
    const tiltBase = 0.22 + 0.9 * chase - 0.15 * alert + 2.0 * stunK - 0.04 * Math.sin(ph) * move + 0.04 * Math.sin(S.time * 1.7) * calm;
    let tilt = tiltBase;
    if (atk) tilt = lerp(lerp(tiltBase, -0.55, wind), 1.95, strike);
    tilt = lerp(tilt, tiltBase, rec * atk);
    grip.rotation.set(tilt - armR.rotation.x - body.rotation.x, 0, 0.12);
    // left arm: sways / raises when startled; braces the shield in the bell variant
    let phiL = 0.25 + 0.4 * Math.sin(ph + 1.5) * move * 0.5 + 1.9 * alert + 0.35 * chase + 0.3 * pulse(0.6, 1.0) + 0.8 * stunK + 0.45 * hurtK;
    let zL = 0.12 + 0.25 * Math.sin(S.time * 1.9) * calm * 0.4 + 0.3 * alert;
    if (variant === 'bell') { phiL = 1.05 + 0.1 * Math.sin(S.time * 3) * move; zL = 0.05; }
    armL.rotation.set(-phiL + 0.06 * Math.sin(S.time * 1.9 + 1) * calm, 0, zL);
    if (shield) {
      shield.rotation.set(-0.25 + 0.15 * Math.sin(ph) * move - 0.2 * hurtK + 0.3 * pulse(0.2, 0.8) + 0.5 * stunK, 0.1 * Math.sin(ph * 0.5) * move, Math.sin(ph) * 0.05 * move);
      shield.position.set(0, 0.1 + 0.02 * Math.sin(S.time * 2) * calm, 0.6 + 0.08 * pulse(0.0, 1.0));
    }

    if (pose.flash !== undefined) R.flash(clamp(pose.flash, 0, 1));
  }

  const testPoses = {
    idle: {},
    walk: { speed: 3 },
    chase: { speed: 7 },
    attack: (t) => ({ attack: (t % 1.8) / 1.2 > 1 ? 0 : (t % 1.8) / 1.2, t }),
    alert: (t) => ({ alert: (t % 2.4) < 1.2 ? 1 : 0, t }),
    hurt: (t) => { const k = (t % 1.6) / 0.6; const h = k < 1 ? 1 - k : 0; return { hurt: h, flash: h > 0.4 ? 1 : 0, t }; },
    stun: { stun: 1 },
    dead: (t) => ({ dead: Math.min(1, (t % 2.4) / 0.9), t }),
  };

  return {
    root: R.root,
    radius: 0.75,
    height: 2.0,
    anchors: { eyes: eyeAnchor, poleTip: tipAnchor, bell: bellAnchor, top },
    testPoses,
    update,
    flash: (k) => R.flash(k),
    dispose: () => R.dispose(),
    variant,
    get triangleCount() { return R.triangleCount; },
  };
}
