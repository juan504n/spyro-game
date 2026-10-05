// The Snuffers that are not the plain, the bell and the thorn (foes/kinds.js): what each wears and carries on top of the Snuffer's own body, and how it moves it. The Snuffer (snuffer.js) calls
// `foeParts(variant, kit)` once when it is built and `parts.update(dt, pose, k)` once a step, after its own animation.
//
//   rime     a shell of ice: a bowl round the body, pauldrons, crystals on the back and a crown; it melts (pose.shell 1 -> 0: it shrinks and sinks) and grows back
//   slinger  a forked stick with a leather band and a ball of soot in it (the ball is out of the band while the arm is through its throw), a satchel of soot on the hip
//   warden   a flat helm with a violet crest and a shield as tall as a door: up in front of it, raised and thrust forward for the bash (pose.attack), down at its side while it is open (pose.shield 0)
//   pup      a round little Snuffer with a keg on its head: brass hoops, a rope of fuse with an ember at its tip that burns shorter (pose.fuse 1 -> 0)
//   caller   a hood stretched to a long point, runes that glow down the robe, a staff taller than it with a ball of violet fire (it flares as it calls: pose.cast)
//   thief    pointed ears, a sack over the shoulder with light leaking out of it; it jeers (pose.jeer) and cowers (pose.cower)
import { ellipsoid, spike, bar, triF, setBias, clamp, lerp, sstep, damp, mix3, TAU } from './rig.js';

const ICE = [0.66, 0.95, 1.0], ICE_HI = [0.95, 1.0, 1.0], ICE_LO = [0.34, 0.7, 0.95];
const WOOD = [0.42, 0.28, 0.16], WOOD_HI = [0.56, 0.4, 0.24], LEATHER = [0.46, 0.3, 0.18], LEATHER_HI = [0.64, 0.46, 0.28], SOOT = [0.16, 0.13, 0.18], SOOT_HI = [0.3, 0.24, 0.34];
const IRON = [0.62, 0.62, 0.74], IRON_HI = [0.86, 0.86, 0.96], IRON_LO = [0.34, 0.34, 0.46], BRASS = [1.0, 0.74, 0.26], BRASS_HI = [1.0, 0.92, 0.55], BRASS_LO = [0.7, 0.44, 0.14];
const VIOLET = [0.62, 0.38, 1.0], VIOLET_HI = [0.88, 0.76, 1.0], VIOLET_LO = [0.3, 0.16, 0.62], ROBE = [0.2, 0.16, 0.4], ROBE_DK = [0.12, 0.1, 0.27], ROBE_HI = [0.33, 0.27, 0.58], PINK = [0.9, 0.62, 0.7];
const ROPE = [0.78, 0.66, 0.42], GOLD = [1.0, 0.84, 0.38], GOLD_HI = [1.0, 0.96, 0.7];

const lathe = (b, profile, segs, color, o = {}) => b.lathe(profile, segs, { color, ...o });

/** how big each is drawn (the model is 2.4 m by default): the radius and height of its row in foes/kinds.js are these */
export const FOE_SCALE = { rime: 1.05, slinger: 0.95, warden: 1.1, pup: 0.65, caller: 1.25, thief: 0.75 };
/** the variants that do not carry the Snuffer's snuffing pole (they carry what is theirs) */
export const NO_POLE = new Set(['slinger', 'pup', 'caller', 'thief']);

// ---- the geometry --------------------------------------------------------------------------------------------------------------------------
function shellGeo(b) {                                  // (body frame: the waist at 0)
  setBias(0.45);
  lathe(b, [[0.52, -0.06], [0.49, 0.2], [0.38, 0.42], [0.25, 0.56]], 6, (x, y) => mix3(ICE_LO, ICE, sstep(-0.06, 0.5, y)));
  for (const s of [1, -1]) {
    spike(b, [s * 0.36, 0.5, 0.0], [s * 0.8, 0.6, 0], 0.44, 0.15, { segs: 4, col: ICE, tip: ICE_HI });
    spike(b, [s * 0.22, 0.36, -0.24], [s * 0.55, 0.8, -0.5], 0.5, 0.12, { segs: 4, col: ICE_LO, tip: ICE_HI });
    spike(b, [s * 0.34, 0.1, 0.3], [s * 0.7, 0.2, 0.7], 0.3, 0.1, { segs: 4, col: ICE, tip: ICE_HI });
  }
  spike(b, [0, 0.42, -0.26], [0, 0.9, -0.45], 0.74, 0.17, { segs: 4, col: ICE_LO, tip: ICE_HI });
  spike(b, [0, 0.05, 0.5], [0, 0.1, 1], 0.28, 0.1, { segs: 4, col: ICE, tip: ICE_HI });
}
function crownGeo(b) {                                  // (head frame)
  setBias(0.45);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    spike(b, [Math.sin(a) * 0.26, 0.4, Math.cos(a) * 0.22 - 0.03], [Math.sin(a) * 0.35, 1, Math.cos(a) * 0.35], 0.28 + (i % 2) * 0.16, 0.08, { segs: 4, col: ICE, tip: ICE_HI });
  }
}

function forkGeo(b) {                                   // (the hand's frame: +y along the stick)
  setBias(0.5);
  bar(b, [0, -0.32, 0], [0, 0.5, 0], 0.05, 0.042, WOOD, { segs: 5 });
  for (const s of [1, -1]) bar(b, [0, 0.46, 0], [s * 0.22, 0.96, 0], 0.042, 0.03, WOOD_HI, { segs: 4 });
  for (const s of [1, -1]) bar(b, [s * 0.22, 0.96, 0], [0, 0.8, 0.14], 0.022, 0.022, LEATHER, { segs: 3 });
}
function ballGeo(b) {
  setBias(0.3);
  ellipsoid(b, 0, 0, 0, 0.17, 0.17, 0.17, { segs: 6, rings: 3, col: (th) => mix3(SOOT, SOOT_HI, 0.5 + 0.5 * Math.sin(th)) });
}
function satchelGeo(b) {                                // (body frame)
  setBias(0.4);
  ellipsoid(b, 0.33, -0.02, 0.1, 0.2, 0.24, 0.18, { segs: 6, rings: 3, col: LEATHER });
  for (const [x, y, z] of [[0.3, 0.2, 0.1], [0.4, 0.2, 0.06], [0.35, 0.22, 0.17]]) ellipsoid(b, x, y, z, 0.09, 0.09, 0.09, { segs: 5, rings: 2, col: SOOT_HI });
  bar(b, [-0.26, 0.5, 0.05], [0.34, 0.14, 0.1], 0.03, 0.03, LEATHER_HI, { segs: 3 });
}

function shieldGeo(b) {                                 // (its own frame: centred, 1.0 wide, 1.5 tall, 0.12 thick, the face towards +z)
  setBias(0.5);
  b.box(0, 0, 0, 1.0, 1.5, 0.12, { color: IRON_LO });
  for (const s of [1, -1]) {
    b.box(s * 0.5, 0, 0.02, 0.07, 1.54, 0.14, { color: BRASS });
    b.box(0, s * 0.76, 0.02, 1.06, 0.07, 0.14, { color: BRASS });
  }
  lathe(b, [[0.3, 0.06], [0.24, 0.14], [0.12, 0.2], [0.0, 0.22]], 8, (x, y) => mix3(BRASS_LO, BRASS_HI, sstep(0.06, 0.22, y)));
  for (const y of [-0.45, 0.45]) b.box(0, y, 0.07, 0.62, 0.05, 0.03, { color: IRON });
}
function shieldGlowGeo(b) {                             // (unlit: the rim that glows while it is raised, and the gem in the boss)
  const c = VIOLET_HI;
  const bx = (x, y, w, h) => { const z = 0.075; triF(b, [x - w / 2, y - h / 2, z], [x + w / 2, y - h / 2, z], [x + w / 2, y + h / 2, z], c); triF(b, [x - w / 2, y - h / 2, z], [x + w / 2, y + h / 2, z], [x - w / 2, y + h / 2, z], c); };
  bx(-0.4, 0, 0.04, 1.4); bx(0.4, 0, 0.04, 1.4); bx(0, 0.68, 0.84, 0.04); bx(0, -0.68, 0.84, 0.04);
  ellipsoid(b, 0, 0, 0.23, 0.07, 0.07, 0.07, { segs: 5, rings: 2, col: c });
}
function helmGeo(b) {                                   // (head frame)
  setBias(0.5);
  lathe(b, [[0.43, 0.13], [0.41, 0.4], [0.33, 0.5], [0.0, 0.52]], 8, (x, y) => mix3(IRON_LO, IRON_HI, sstep(0.13, 0.52, y)));
  b.box(0, 0.3, 0.38, 0.5, 0.06, 0.05, { color: BRASS });
  spike(b, [0, 0.5, 0], [0, 1, -0.5], 0.5, 0.07, { segs: 4, col: VIOLET_LO, tip: VIOLET });
}

function kegGeo(b) {                                    // (its own frame: a barrel standing, 0.6 tall)
  setBias(0.4);
  lathe(b, [[0.0, -0.3], [0.2, -0.28], [0.29, -0.14], [0.31, 0.0], [0.29, 0.14], [0.2, 0.28], [0.0, 0.3]], 8, (x, y) => mix3(WOOD, WOOD_HI, sstep(-0.3, 0.3, y)));
  for (const y of [-0.15, 0.15]) lathe(b, [[0.28 + (y === 0 ? 0 : 0.012), y - 0.035], [0.33, y - 0.02], [0.33, y + 0.02], [0.285, y + 0.035]], 8, BRASS);
  bar(b, [0, 0.3, 0], [0.05, 0.52, -0.06], 0.022, 0.016, ROPE, { segs: 3 });
}
function emberGeo(b) { ellipsoid(b, 0, 0, 0, 0.065, 0.065, 0.065, { segs: 5, rings: 2, col: GOLD_HI }); }

function hoodSpikeGeo(b) {                              // (head frame: the hood pulled up to a long stiff point)
  setBias(0.4);
  spike(b, [0, 0.5, -0.06], [0, 1, -0.28], 1.05, 0.2, { segs: 5, col: ROBE, tip: ROBE_DK });
  lathe(b, [[0.2, 0.0], [0.23, 0.04], [0.23, 0.1], [0.2, 0.14]], 6, BRASS, { });
}
function staffGeo(b) {                                  // (the hand's frame: a staff taller than the foe, a cradle of three claws at the top)
  setBias(0.5);
  bar(b, [0, -0.5, 0], [0, 1.45, 0], 0.05, 0.04, ROBE_DK, { segs: 5 });
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; spike(b, [Math.sin(a) * 0.04, 1.42, Math.cos(a) * 0.04], [Math.sin(a) * 0.55, 1, Math.cos(a) * 0.55], 0.3, 0.035, { segs: 3, col: BRASS_LO, tip: BRASS }); }
  lathe(b, [[0.07, 1.1], [0.09, 1.14], [0.09, 1.2], [0.07, 1.24]], 6, BRASS);
}
function orbGeo(b) {                                    // (unlit)
  ellipsoid(b, 0, 0, 0, 0.14, 0.14, 0.14, { segs: 6, rings: 3, col: VIOLET_HI });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; spike(b, [Math.sin(a) * 0.08, 0.06, Math.cos(a) * 0.08], [Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3], 0.3 + (i % 2) * 0.1, 0.06, { segs: 3, col: VIOLET, tip: VIOLET_HI }); }
}
function runesGeo(b) {                                  // (unlit, body frame: three diamonds down the front of the robe, on the torso and the skirt)
  const c = VIOLET_HI;
  for (const [y, z, s] of [[0.28, 0.375, 0.07], [0.04, 0.415, 0.085], [-0.22, 0.54, 0.1]]) {
    triF(b, [0, y + s, z], [-s * 0.6, y, z], [s * 0.6, y, z], c);
    triF(b, [0, y - s, z], [s * 0.6, y, z], [-s * 0.6, y, z], c);
  }
}

function earsGeo(b) {                                   // (head frame)
  setBias(0.4);
  for (const s of [1, -1]) {
    spike(b, [s * 0.3, 0.36, -0.02], [s * 0.9, 0.62, -0.1], 0.6, 0.15, { segs: 4, col: ROBE, tip: PINK });
    spike(b, [s * 0.32, 0.38, 0.03], [s * 0.9, 0.62, -0.1], 0.42, 0.08, { segs: 3, col: PINK, tip: [1, 0.85, 0.9] });
  }
}
function sackGeo(b) {                                   // (body frame: over the shoulder, hanging down the back)
  setBias(0.4);
  ellipsoid(b, -0.12, 0.34, -0.3, 0.3, 0.38, 0.27, { segs: 6, rings: 3, col: (th) => mix3(LEATHER, LEATHER_HI, 0.5 + 0.5 * Math.sin(th)) });
  spike(b, [-0.12, 0.66, -0.3], [0.2, 1, 0.1], 0.3, 0.1, { segs: 4, col: LEATHER, tip: LEATHER_HI });
  bar(b, [-0.3, 0.56, -0.1], [0.05, 0.5, 0.05], 0.03, 0.03, LEATHER_HI, { segs: 3 });
}
function sackGlowGeo(b) {                               // (unlit: the light that leaks out of the neck of the sack)
  spike(b, [-0.06, 0.66, -0.28], [0.1, 1, 0.1], 0.5, 0.16, { segs: 5, col: GOLD, tip: GOLD_HI });
  ellipsoid(b, -0.08, 0.7, -0.28, 0.1, 0.1, 0.1, { segs: 5, rings: 2, col: GOLD_HI });
}

// ---- what each wears -----------------------------------------------------------------------------------------------------------------------------
/**
 * kit: { R (the Rig), M (the lit material), G (the unlit material of the eyes), body, head, armL, armR, grip, mk (an unlit material factory) }. Returns { update(dt, pose, k) } or null.
 * k (what the Snuffer's own animation has worked out): { S, move, chase, alert, hurtK, stunK, atk, wind, strike, rec, pulse }.
 */
export function foeParts(variant, kit) {
  const { R, M, body, head, grip } = kit;
  const glow = () => { const g = R.glowMat(null); return g; };
  if (variant === 'rime') {
    const shell = R.pivot(body, 0, 0, 0, 'shell'), crown = R.pivot(head, 0, 0, 0, 'crown');
    R.part(shell, M, shellGeo, 'shell'); R.part(crown, M, crownGeo, 'crown');
    return {
      update(dt, pose, k) {
        const S = k.S;
        S.shell = damp(S.shell ?? 1, clamp(pose.shell ?? 1), 9, dt);
        const v = S.shell > 0.04;
        shell.visible = crown.visible = v;
        shell.scale.setScalar(0.45 + 0.55 * S.shell); crown.scale.setScalar(0.4 + 0.6 * S.shell);
        shell.position.y = -(1 - S.shell) * 0.3; crown.position.y = -(1 - S.shell) * 0.2;
      },
    };
  }
  if (variant === 'slinger') {
    R.part(grip, M, forkGeo, 'fork');
    const ball = R.pivot(grip, 0, 0.8, 0.13, 'ball');
    R.part(ball, M, ballGeo, 'ball');
    R.part(body, M, satchelGeo, 'satchel');
    return { update(dt, pose) { const a = pose.attack || 0; ball.visible = !(a >= 0.42 && a < 0.95); } };
  }
  if (variant === 'warden') {
    R.part(head, M, helmGeo, 'helm');
    const shield = R.pivot(body, 0, 0.55, 0.65, 'tower');
    R.part(shield, M, shieldGeo, 'tower');
    const G2 = glow();
    R.part(shield, G2, shieldGlowGeo, 'towerGlow', true);
    return {
      update(dt, pose, k) {
        const S = k.S, up = (S.up = damp(S.up ?? 1, pose.shield === undefined ? 1 : clamp(pose.shield), 12, dt));
        const a = clamp(pose.attack || 0, 0, 1), wind = sstep(0, 0.4, a), strike = sstep(0.4, 0.48, a) * (1 - sstep(0.6, 0.8, a));
        // raised: upright in front; winding up: leaning back; the bash: thrust forward; down: swung out to the side and lowered
        shield.position.set(lerp(0.62, 0, up), lerp(0.1, 0.55, up) + 0.18 * wind * up, lerp(0.3, 0.65, up) - 0.12 * wind + 0.45 * strike);
        shield.rotation.set(lerp(0.5, -0.1, up) - 0.4 * wind * up, 0, lerp(-1.25, 0, up));
        const lit = 0.12 + 0.88 * clamp(wind + strike) * up;
        G2.uniforms.uColorMul.value.setRGB(lit, lit, lit);
        k.armL.rotation.x = lerp(k.armL.rotation.x, -1.2 - 0.3 * wind, up);
      },
    };
  }
  if (variant === 'pup') {
    body.scale.set(1.28, 1.0, 1.28);
    const keg = R.pivot(head, 0, 0.78, -0.02, 'keg');
    keg.scale.setScalar(1.15);
    R.part(keg, M, kegGeo, 'keg');
    const G2 = glow();
    const ember = R.pivot(keg, 0.05, 0.54, -0.06, 'ember');
    R.part(ember, G2, emberGeo, 'ember', true);
    return {
      update(dt, pose, k) {
        const lit = pose.lit ? 1 : 0, f = clamp(pose.fuse ?? 1);
        ember.visible = !!lit;
        const flick = 0.75 + 0.25 * Math.sin(k.S.time * 44) * Math.sin(k.S.time * 27);
        G2.uniforms.uColorMul.value.setRGB(flick, flick * 0.9, flick * 0.8);
        ember.scale.setScalar(0.8 + 1.6 * (1 - f));
        keg.rotation.z = Math.sin(k.S.time * 9) * 0.05 * (0.3 + k.move); keg.position.y = 0.78 + Math.abs(Math.sin(k.S.phase)) * 0.05 * k.move;
        // a lit pup runs with its arms up
        k.armL.rotation.x = lerp(k.armL.rotation.x, -2.4, lit * 0.7);
        k.armR.rotation.x = lerp(k.armR.rotation.x, -2.4, lit * 0.7);
      },
    };
  }
  if (variant === 'caller') {
    R.part(head, M, hoodSpikeGeo, 'hoodSpike');
    R.part(grip, M, staffGeo, 'staff');
    const G2 = glow(), G3 = glow();
    const orb = R.pivot(grip, 0, 1.58, 0, 'orb');
    R.part(orb, G2, orbGeo, 'orb', true);
    R.part(body, G3, runesGeo, 'runes', true);
    return {
      update(dt, pose, k) {
        const cast = clamp(pose.cast ?? 0), t = k.S.time;
        orb.scale.setScalar(1 + 0.7 * cast + 0.08 * Math.sin(t * 6)); orb.rotation.y = t * 1.5;
        const l = 0.65 + 0.35 * Math.sin(t * 3) + 0.5 * cast;
        G2.uniforms.uColorMul.value.setRGB(l, l * 0.9, l);
        const r = 0.8 + 0.2 * Math.sin(t * 2 + 1) + 0.4 * cast;
        G3.uniforms.uColorMul.value.setRGB(r, r, r);
      },
    };
  }
  if (variant === 'thief') {
    R.part(head, M, earsGeo, 'ears');
    R.part(body, M, sackGeo, 'sack');
    const G2 = glow();
    const leak = R.pivot(body, 0, 0, 0, 'leak');
    R.part(leak, G2, sackGlowGeo, 'leak', true);
    return {
      update(dt, pose, k) {
        const t = k.S.time, jeer = clamp(pose.jeer ?? 0), cower = clamp(pose.cower ?? 0), S = k.S;
        S.jeer = damp(S.jeer ?? 0, jeer, 14, dt); S.cower = damp(S.cower ?? 0, cower, 12, dt);
        const l = 0.75 + 0.25 * Math.sin(t * 5);
        G2.uniforms.uColorMul.value.setRGB(l, l, l * 0.9);
        leak.scale.setScalar(1 + 0.15 * Math.sin(t * 7));
        // the jeer: head back, one arm waving; the cower: down on its heels with its hands over its head
        head.rotation.x -= 0.5 * S.jeer;
        k.armL.rotation.x = lerp(k.armL.rotation.x, -2.6 + Math.sin(t * 16) * 0.5, S.jeer);
        body.position.y -= 0.22 * S.cower; body.scale.y = 1 - 0.18 * S.cower;
        k.armL.rotation.x = lerp(k.armL.rotation.x, -2.9, S.cower); k.armR.rotation.x = lerp(k.armR.rotation.x, -2.9, S.cower);
      },
    };
  }
  return null;
}
