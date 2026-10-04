// THE GUARDIAN and his fists: the warden of the lanterns, a colossus of dark runed stone standing on the dais of his court (origin: the top of his pedestal, +Y up, he looks along +Z: south, the way the hero
// comes up the road), and the two stone fists that float round him. Drawn by systems/boss.js from what guardian/brain.js says; every part is generated here, from the textures of the Dawn Gate (tower_stone, brick,
// rune_ring, brass, glass) and light.
//
//   guardian   a skirt of stone, a torso with a plate of brass and a rune on the chest, shoulders, two arms that hang and end in a ring of light (the hands were taken from him), a neck, a helm with a
//              visor that glows when he charges a bolt, and, floating over the helm, the CROWN: a ring of brass with three lantern cages that comes off his head and down round his body when he stoops.
//              pose { crown (the lantern's height over the dais: 15.9 on his head .. 3.2 come down), ring (its radius: 2.4 .. 6.2), lit [0..1 x3], active (0..2, the lantern that pulses: -1 none),
//                     visor 0..1, awake 0..1 (the runes' glow: 0.15 asleep), freed 0..1 (the runes turn gold), roar 0..1 (a shudder), look (radians off the road: the upper body turns, the crown does not), bow 0..1 (a bow to the hero), t }
//   guardian_fist  a fist of stone 3.4 m across, origin at the bottom of it (it stands on the floor when it is stuck), the rune on its back that is the target when it has landed.
//              pose { glow 0..1 (the rune: 1 = hit me), crack 0..1 (the two halves fall apart), t }
import { U } from '../../../engine/materials.js';
import { Rig, setMul, setAlpha } from './common.js';
import { TAU, litBuilder, lerp, damp, clamp, smooth } from './geo.js';

const PEDESTAL = 1.1;                                  // the pedestal under him (props/village/court.js guardian_dais): the model's origin is its top, the brain's heights are over the dais
const VIOLET = [0.62, 0.45, 1.0], GOLD = [1.0, 0.82, 0.42];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const RING0 = 2.4;                                     // the crown ring's radius on his head (guardian/brain.js lantern.ring)
const CROWN_REST = 15.9;                               // the height of the crown's lanterns over the dais on his head (guardian/brain.js crownRest)

export function createGuardian(assets, opts = {}) {
  const rig = new Rig(assets);
  const anchors = {};

  // ---- materials ---------------------------------------------------------------------------------------------------
  const mStone = rig.lit('tower_stone', { double: true });
  const mBrick = rig.lit('brick');
  const mDark = rig.lit('cliff_bare', { double: true });
  const mBrass = rig.lit('metal_brass', { double: true });
  const mRune = rig.glow('rune_ring', { double: true });                // the plaques
  const mVisor = rig.glow('sun_glow', { double: true });                // the visor slit and the eyes behind it
  const mWrist = rig.glow('sun_glow', { double: true });                // the rings where his hands were
  const mGlass = [0, 1, 2].map(() => rig.lit('glass', { double: true }));
  const mHeart = [0, 1, 2].map(() => rig.glow('sun_glow', { double: true }));
  const mHalo = [0, 1, 2].map(() => rig.glow('sun_glow', { double: true }));

  // ---- the skirt: a robe of stone from the pedestal to the waist, four rune plaques on it ----------------------------------------
  {
    const b = litBuilder(1, 71);
    b.lathe([[4.55, 0], [4.42, 0.5], [4.0, 2.4], [3.55, 4.0], [3.4, 4.45]], 12, { tile: 4, smooth: true, color: [0.86, 0.86, 1.0] });
    b.lathe([[4.62, 1.1], [4.62, 1.4], [4.5, 1.5], [4.5, 1.0]], 12, { tile: 3, smooth: true, color: [1.1, 1.0, 0.7] });         // (a band of brass at the hem)
    rig.mesh(b, mStone, null, { name: 'skirt' });
    const g = litBuilder(1, 72);
    for (let k = 0; k < 4; k++) g.at(0, 2.3, 0, (q) => q.quad([-0.85, -0.85, 4.07], [0.85, -0.85, 4.07], [0.85, 0.85, 4.07], [-0.85, 0.85, 4.07], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] }), (k * TAU) / 4);
    rig.mesh(g, mRune, null, { name: 'skirt runes', order: 9 });
  }

  // ---- the upper body bows from the waist (a pivot at the top of the skirt) -------------------------------------------------------
  const bow = rig.pivot('bow', 0, 4.4, 0);
  bow.rotation.order = 'YXZ';                          // (he turns first, then leans: the lean is towards whom he faces)
  {
    const b = litBuilder(1, 73), STONE_A = [0.92, 0.92, 1.06], STONE_B = [0.86, 0.86, 1.0], BR = [1.1, 1.0, 0.72];
    b.lathe([[3.45, 0], [3.2, 0.7], [3.5, 2.4], [3.95, 3.8], [3.6, 4.5], [2.6, 5.0]], 10, { tile: 4, smooth: true, color: STONE_A });
    b.lathe([[3.5, 0.05], [3.72, 0.2], [3.72, 0.62], [3.5, 0.78]], 10, { tile: 2.4, smooth: true, color: BR });                           // a belt of brass
    b.box(0, 2.9, 3.3, 3.4, 2.5, 0.55, { tile: 3, color: [1.0, 0.92, 0.7], faces: ['+z', '-z', '+x', '-x', '+y', '-y'] });                    // the plate of brass on his chest
    b.at(0, 5.1, 0, (q) => q.cyl(2.6, 2.1, 0.8, 10, { tile: 3, color: [1.0, 1.0, 1.14], caps: 'top' }));                                       // the gorget
    for (const sx of [-1, 1]) {
      // the pauldron: three plates, each a little smaller than the one below it, and a spike
      [[3.1, 0.65, 2.9, 4.0], [2.6, 0.6, 2.5, 4.55], [2.1, 0.55, 2.1, 5.05]].forEach(([w, h, d, y], i) => b.box(sx * (4.2 - i * 0.12), y, 0, w, h, d, { tile: 3, color: i === 2 ? [1.0, 1.0, 1.16] : STONE_A }));
      b.box(sx * 3.9, 5.35, 0, 2.4, 0.16, 2.3, { tile: 2.4, color: BR });
      b.push().translate(sx * 4.95, 5.35, 0).rotateZ(-sx * 0.5).cone(0.34, 1.3, 4, { tile: 2.4, color: BR }).pop();
      // the arm that hangs: upper arm, elbow, forearm bent a little forward, and where the hand was a ring of light
      b.box(sx * 4.75, 2.55, 0.1, 1.9, 2.7, 2.0, { tile: 3, color: STONE_B });
      b.at(sx * 4.8, 1.1, 0.15, (q) => q.sphere(1.05, 8, 6, { tile: 3, color: [1.0, 1.0, 1.14] }));
      b.push().translate(sx * 4.85, 1.0, 0.2).rotateZ(sx * 0.07).box(0, -1.35, 0.1, 1.7, 2.7, 1.8, { tile: 3, color: STONE_A }).box(0, -2.75, 0.1, 2.0, 0.45, 2.1, { tile: 2.4, color: BR }).pop();
    }
    rig.mesh(b, mStone, bow, { name: 'torso' });
    const g = litBuilder(1, 74);
    g.quad([-0.95, 2.0, 3.6], [0.95, 2.0, 3.6], [0.95, 3.9, 3.6], [-0.95, 3.9, 3.6], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] });   // the rune on the chest
    rig.mesh(g, mRune, bow, { name: 'chest rune', order: 9 });
    // the rings of light where his hands were (at the end of each forearm)
    const w = litBuilder(1, 75), n = 12;
    for (const sx of [-1, 1]) for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, P = (r, a) => [sx * 5.1 + r * Math.sin(a), -1.95, 0.3 + r * Math.cos(a)], o = { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] };
      w.quad(P(0.7, a0), P(1.5, a0), P(1.5, a1), P(0.7, a1), o, [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]]);
    }
    rig.mesh(w, mWrist, bow, { name: 'wrist rings', order: 9 });
  }

  // ---- the head: a helm with a heavy brow, a visor, cheek plates and a fin (he wears it a fifth bigger than the body asks: it is what the hero looks up at) --------------------------
  const head = rig.pivot('head', 0, 5.7, 0, bow);
  head.scale.setScalar(1.24);
  {
    const b = litBuilder(1, 76);
    b.box(0, 1.45, 0, 3.0, 2.9, 2.8, { tile: 3, color: [0.95, 0.95, 1.08] });                                                      // the helm
    b.box(0, 2.45, 1.35, 3.5, 0.55, 0.9, { tile: 3, color: [1.0, 1.0, 1.15] });                                                    // the brow, a heavy ledge
    b.box(0, 0.3, 1.25, 2.4, 0.6, 0.7, { tile: 3, color: [0.85, 0.85, 1.0] });                                                     // the jaw guard
    for (const sx of [-1, 1]) {
      b.box(sx * 1.7, 1.25, 0.2, 0.5, 2.3, 2.1, { tile: 3, color: [1.05, 1.0, 1.1] });                                             // the cheek plates
      b.push().translate(sx * 1.95, 2.3, -0.5).rotateZ(-sx * 0.9).rotateX(0.5).cone(0.3, 1.5, 4, { tile: 2, color: [1.1, 1.0, 0.72] }).pop();   // a short horn on each side, swept back
    }
    b.box(0, 2.9, -0.4, 0.45, 0.55, 2.2, { tile: 3, color: [0.85, 0.85, 1.0] });                                                   // the fin (low: the crown rides over it)
    rig.mesh(b, mDark, head, { name: 'helm' });
    const v = litBuilder(1, 77);
    v.quad([-1.35, 1.5, 1.41], [1.35, 1.5, 1.41], [1.35, 2.0, 1.41], [-1.35, 2.0, 1.41], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] });               // the visor's slit
    for (const sx of [-1, 1]) v.quad([sx * 0.8 - 0.5, 1.3, 1.43], [sx * 0.8 + 0.5, 1.3, 1.43], [sx * 0.8 + 0.5, 2.2, 1.43], [sx * 0.8 - 0.5, 2.2, 1.43], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] });   // the eyes
    rig.mesh(v, mVisor, head, { name: 'visor', order: 9 });
  }

  // ---- the crown: a ring of brass with three lantern cages. On his head it is 2.4 m across; it comes off and opens as it comes down round him ----------------------------------------
  const crown = rig.pivot('crown', 0, 0, 0);
  // (the ring is built again at the radius the brain says whenever it changes: a band that is scaled would be wider the wider it is)
  const ringGeo = (R) => {
    const b = litBuilder(1, 78);
    b.lathe([[R - 0.2, -0.13], [R + 0.2, -0.13], [R + 0.25, 0], [R + 0.2, 0.13], [R - 0.2, 0.13], [R - 0.25, 0]], 32, { tile: 2, smooth: true, color: [1.1, 1.0, 0.72] });
    // the teeth of the crown between the lanterns: three small spikes
    for (let j = 0; j < 3; j++) { const a = Math.PI / 2 + ((j + 0.5) * TAU) / 3; b.push().translate(Math.cos(a) * R, 0.05, Math.sin(a) * R).cone(0.2, 0.85, 4, { tile: 2, color: [1.15, 1.05, 0.78] }).pop(); }
    return b.build();
  };
  const ringMesh = rig.mesh(litBuilder(1, 78), mBrass, crown, { name: 'crown ring' });
  ringMesh.geometry.dispose();
  let ringR = -1;
  const setRing = (R) => { if (Math.abs(R - ringR) < 0.015) return; ringR = R; ringMesh.geometry.dispose(); ringMesh.geometry = ringGeo(R); };
  setRing(RING0);
  const cage = [0, 1, 2].map((j) => {
    const p = rig.pivot(`cage${j}`, 0, 0.55, 0, crown);
    const b = litBuilder(1, 80 + j);
    b.lathe([[0.18, -0.5], [0.42, -0.42], [0.46, -0.3], [0.2, -0.28]], 8, { tile: 2, smooth: true, color: [1.1, 1.0, 0.72] });               // the foot
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; b.at(Math.sin(a) * 0.4, -0.05, Math.cos(a) * 0.4, (q) => q.cyl(0.05, 0.05, 1.05, 4, { tile: 2, color: [1.15, 1.05, 0.78] })); }   // the bars
    b.at(0, 1.0, 0, (q) => q.cyl(0.42, 0.14, 0.32, 8, { tile: 2, color: [1.1, 1.0, 0.72], caps: 'top' }));                                        // the cap
    rig.mesh(b, mBrass, p, { name: `cage${j} frame` });
    const o = litBuilder(1, 90 + j);
    o.at(0, 0.45, 0, (q) => q.sphere(0.4, 8, 6, { tile: 2, color: [1.0, 1.0, 1.0] }));
    rig.mesh(o, mGlass[j], p, { name: `lantern${j}` });
    const h = litBuilder(1, 100 + j), hh = 0.62;
    for (let i = 0; i < 2; i++) { const a = (i / 2) * Math.PI, dx = Math.cos(a) * hh, dz = Math.sin(a) * hh; h.quad([-dx, 0.45 - hh, -dz], [dx, 0.45 - hh, dz], [dx, 0.45 + hh, dz], [-dx, 0.45 + hh, -dz], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] }); }
    rig.mesh(h, mHeart[j], p, { name: `heart${j}`, order: 9 });
    const ha = litBuilder(1, 110 + j), R = 1.7;
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI, dx = Math.cos(a) * R, dz = Math.sin(a) * R; ha.quad([-dx, 0.45 - R, -dz], [dx, 0.45 - R, dz], [dx, 0.45 + R, dz], [-dx, 0.45 + R, -dz], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] }); }
    rig.mesh(ha, mHalo[j], p, { name: `halo${j}`, order: 9 });
    return p;
  });

  rig.anchor(anchors, 'head', 0, 12.6, 0, bow);
  rig.anchor(anchors, 'visor', 0, 12.45, 1.75);

  // ---- state ---------------------------------------------------------------------------------------------------------
  const st = { t: 0, crown: CROWN_REST, ring: RING0, lit: [0, 0, 0], litK: [0, 0, 0], active: -1, visor: 0, awake: 0.15, awakeK: 0.15, freed: 0, freedK: 0, roar: 0, look: 0, bow: 0, init: false };

  const apply = () => {
    const t = st.t, day = U.uDay.value, ex = lerp(1.2, 1.0, clamp(day / 0.8));
    const stoop = clamp((CROWN_REST - st.crown) / (CROWN_REST - 3.2));
    // the bow: he leans towards the hero and sinks a little as the crown comes down
    const bowK = smooth(0, 1, stoop);
    bow.rotation.x = 0.4 * bowK + 0.42 * st.bow + Math.sin(t * 0.7) * 0.012 * (1 - bowK);
    bow.rotation.y = st.look * 0.7;                    // (the upper body turns to the hero; the head turns the rest of the way)
    head.rotation.y = st.look * 0.3;
    bow.position.y = 4.4 - 0.7 * bowK;
    // the crown: its lanterns hang at the brain's height (over the dais) and on the ring it says
    const yL = st.crown - PEDESTAL;
    crown.position.y = yL - 0.55;
    setRing(st.ring);
    for (let j = 0; j < 3; j++) {
      const a = Math.PI / 2 + (j * TAU) / 3;
      cage[j].position.set(Math.cos(a) * st.ring, 0.55, Math.sin(a) * st.ring);
    }
    // the stone and the brass: lifted a little in the dusk, as every lit model is
    setMul(mStone, [ex * 0.95, ex * 0.95, ex * 1.05]); setMul(mBrick, [ex, ex, ex]); setMul(mDark, [ex * 0.9, ex * 0.9, ex]); setMul(mBrass, [ex * lerp(0.8, 1.1, st.freedK), ex * lerp(0.78, 1.0, st.freedK), ex * lerp(0.8, 0.72, st.freedK)]);
    // the runes: violet and dim while he is asleep, bright awake, gold once he is free
    const rc = mix3(VIOLET, GOLD, st.freedK), pulse = 0.5 + 0.5 * Math.sin(t * 1.9);
    for (const m of [mRune, mWrist]) { m.uniforms.uColorMul.value.setRGB(rc[0], rc[1], rc[2]); setAlpha(m, (0.18 + 0.7 * st.awakeK + 0.12 * pulse * st.awakeK) * (1 - 0.25 * day)); }
    mRune.uniforms.uColorMul.value.setRGB(rc[0] * 0.9, rc[1] * 0.9, rc[2] * 0.9);
    // the visor: a thin line of light, a blaze when he charges a bolt
    const vc = mix3([0.9, 0.55, 1.0], [1, 1, 1], st.visor);
    mVisor.uniforms.uColorMul.value.setRGB(vc[0], vc[1], vc[2]);
    setAlpha(mVisor, clamp(0.25 + 0.5 * st.awakeK + 0.9 * st.visor) * (1 - 0.2 * day));
    // the lanterns: dark glass until they are lit, then gold with a heart of light; the one that counts breathes
    for (let j = 0; j < 3; j++) {
      const l = st.litK[j], act = st.active === j ? 0.5 + 0.5 * Math.sin(t * 5.2) : 0;
      setMul(mGlass[j], [ex * lerp(0.42, 1.7, l), ex * lerp(0.34, 1.35, l), ex * lerp(0.62, 0.72, l)]);
      mHeart[j].uniforms.uColorMul.value.setRGB(...mix3([0.75, 0.55, 1.0], GOLD, l));
      setAlpha(mHeart[j], (0.12 + 0.85 * l + 0.5 * act) * (1 - 0.3 * day * l));
      mHalo[j].uniforms.uColorMul.value.setRGB(...mix3([0.7, 0.5, 1.0], GOLD, l));
      setAlpha(mHalo[j], (0.04 + 0.4 * l + 0.55 * act) * (1 - 0.35 * day * l));
    }
    // a shudder when he roars (the upper body: the root is where the system put him)
    bow.position.x = Math.sin(t * 47) * 0.09 * st.roar;
    bow.position.z = Math.cos(t * 53) * 0.09 * st.roar;
  };

  const model = {
    root: rig.root,
    anchors,
    radius: 4.6,
    height: 16,
    tris: rig.tris,
    update(dt, pose) {
      pose = pose || {};
      if (pose.t !== undefined) st.t = pose.t; else st.t += dt;
      if (pose.crown !== undefined) st.crown = pose.crown;
      if (pose.ring !== undefined) st.ring = pose.ring;
      if (pose.lit) for (let j = 0; j < 3; j++) st.lit[j] = clamp(pose.lit[j]);
      if (pose.active !== undefined) st.active = pose.active;
      if (pose.visor !== undefined) st.visor = clamp(pose.visor);
      if (pose.awake !== undefined) st.awake = clamp(pose.awake);
      if (pose.freed !== undefined) st.freed = clamp(pose.freed);
      if (pose.roar !== undefined) st.roar = clamp(pose.roar);
      if (pose.look !== undefined) st.look = pose.look;
      if (pose.bow !== undefined) st.bow = clamp(pose.bow);
      if (!st.init) { st.litK = st.lit.slice(); st.awakeK = st.awake; st.freedK = st.freed; st.init = true; }
      else { for (let j = 0; j < 3; j++) st.litK[j] = damp(st.litK[j], st.lit[j], 5, dt); st.awakeK = damp(st.awakeK, st.awake, 3, dt); st.freedK = damp(st.freedK, st.freed, 1.4, dt); }
      apply();
    },
    testPoses: { asleep: { awake: 0.15 }, awake: { awake: 1 }, charging: { awake: 1, visor: 1 }, stooped: { awake: 1, crown: 3.2, ring: 6.2, active: 0 }, free: { awake: 1, lit: [1, 1, 1], freed: 1 } },
    flash: (k) => rig.flash(k),
    dispose: () => rig.dispose(),
  };
  apply();
  void opts;
  return model;
}

// ---------------------------------------------------------------------------------------------------------------------
// the fist: two halves (they fall apart when it cracks): the back of the hand, four knuckles and the fingers curled under them, a thumb, a wrist with a band of brass. On the back of the hand a plate with a rune
// and, standing up out of it, a crystal: the weak point. It is violet and dim while the fist floats, and cold bright cyan, and breathing, once it has landed (that is the thing to ram).
// ---------------------------------------------------------------------------------------------------------------------
export function createGuardianFist(assets, opts = {}) {
  const rig = new Rig(assets);
  const mStone = rig.lit('tower_stone', { double: true });
  const mBrick = rig.lit('brick');
  const mRune = rig.glow('rune_ring', { double: true });
  const mGlow = rig.glow('sun_glow', { double: true });
  const mCrystal = rig.glow('sun_glow', { double: true });
  const STONE_A = [0.92, 0.92, 1.06], STONE_B = [1.0, 1.0, 1.14], BR = [1.1, 1.0, 0.72];
  const halves = [-1, 1].map((sx) => {
    const p = rig.pivot(sx < 0 ? 'left' : 'right', 0, 0, 0);
    const b = litBuilder(1, sx < 0 ? 121 : 122);
    b.box(sx * 0.7, 0.85, -0.15, 1.4, 1.7, 2.5, { tile: 3, color: STONE_A });                                                       // the back of the hand
    for (const fx of sx < 0 ? [-1.0, -0.34] : [0.34, 1.0]) {
      b.at(fx, 1.0, 1.2, (q) => q.sphere(0.66, 8, 6, { tile: 2.6, color: STONE_B }));                                                // a knuckle
      b.box(fx, 0.55, 1.62, 0.62, 1.1, 0.78, { tile: 3, color: STONE_A });                                                           // the finger, curled under it
    }
    if (sx < 0) b.push().translate(-1.55, 0.75, 0.45).rotateY(0.5).box(0, 0, 0, 0.75, 0.8, 1.5, { tile: 3, color: STONE_B }).pop();     // the thumb
    b.box(sx * 0.55, 0.85, -1.85, 1.1, 1.3, 1.5, { tile: 3, color: [0.86, 0.86, 1.0] });                                             // the wrist
    b.box(sx * 0.55, 0.85, -2.5, 1.2, 1.45, 0.3, { tile: 2.4, color: BR });                                                           // ... and its band of brass
    rig.mesh(b, mStone, p, { name: `${sx < 0 ? 'left' : 'right'} half` });
    const t = litBuilder(1, sx < 0 ? 123 : 124);
    t.box(sx * 0.45, 1.72, -0.15, 0.9, 0.14, 1.5, { tile: 2, color: [1.05, 0.98, 0.8] });                                            // the plate on its back
    rig.mesh(t, mBrick, p, { name: 'plate' });
    return p;
  });
  const g = litBuilder(1, 125);
  g.quad([-0.8, 1.8, 0.55], [0.8, 1.8, 0.55], [0.8, 1.8, -0.85], [-0.8, 1.8, -0.85], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] }, [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]]);       // the rune on the plate, flat
  rig.mesh(g, mRune, null, { name: 'rune', order: 9 });
  // the crystal: a diamond standing on the plate (a cone up, a cone down), and cross cards of light round it
  const cr = rig.pivot('crystal', 0, 2.55, -0.15);
  const cb = litBuilder(1, 127);
  cb.push().translate(0, 0, 0).cone(0.62, 1.15, 6, { color: [0.6, 0.6, 0.6] }).pop();
  cb.push().translate(0, 0, 0).rotateX(Math.PI).cone(0.62, 0.8, 6, { color: [0.6, 0.6, 0.6] }).pop();
  rig.mesh(cb, mCrystal, cr, { name: 'crystal', order: 9 });
  const h = litBuilder(1, 126), R = 1.5;
  for (let i = 0; i < 2; i++) { const a = (i / 2) * Math.PI, dx = Math.cos(a) * R, dz = Math.sin(a) * R; h.quad([-dx, -R * 0.2, -dz], [dx, -R * 0.2, dz], [dx, R * 1.1, dz], [-dx, R * 1.1, -dz], { uv: [0, 0, 1, 1], color: [0.5, 0.5, 0.5] }); }
  rig.mesh(h, mGlow, cr, { name: 'halo', order: 9 });

  const st = { t: 0, glow: 0, glowK: 0, crack: 0 };
  const apply = () => {
    const day = U.uDay.value, ex = lerp(1.2, 1.0, clamp(day / 0.8)), pulse = 0.5 + 0.5 * Math.sin(st.t * 7);
    setMul(mStone, [ex * 0.95, ex * 0.95, ex * 1.05]); setMul(mBrick, [ex, ex, ex]);
    const c = mix3([0.7, 0.5, 1.0], [0.55, 1.0, 0.95], st.glowK);                    // violet while it floats, a cold bright cyan while it is the target
    mRune.uniforms.uColorMul.value.setRGB(c[0], c[1], c[2]);
    setAlpha(mRune, (0.3 + 0.6 * st.glowK * (0.75 + 0.25 * pulse)) * (1 - 0.15 * day));
    mCrystal.uniforms.uColorMul.value.setRGB(c[0], c[1], c[2]);
    setAlpha(mCrystal, (0.35 + 0.6 * st.glowK * (0.8 + 0.2 * pulse)) * (1 - 0.15 * day));
    mGlow.uniforms.uColorMul.value.setRGB(c[0], c[1], c[2]);
    setAlpha(mGlow, st.glowK * (0.2 + 0.14 * pulse) * (1 - 0.25 * day));
    cr.position.y = 2.55 + 0.12 * Math.sin(st.t * 3.1) * st.glowK;
    cr.rotation.y = st.t * (0.6 + 1.6 * st.glowK);
    cr.scale.setScalar(Math.max(0.01, 1 - st.crack * 1.6) * (0.9 + 0.12 * st.glowK));
    halves[0].rotation.z = 0.7 * st.crack; halves[1].rotation.z = -0.7 * st.crack;
    halves[0].position.x = -0.9 * st.crack; halves[1].position.x = 0.9 * st.crack;
    halves[0].position.y = -0.5 * st.crack; halves[1].position.y = -0.5 * st.crack;
  };
  const model = {
    root: rig.root,
    anchors: {},
    radius: 1.8,
    height: 3.2,
    tris: rig.tris,
    update(dt, pose) {
      pose = pose || {};
      if (pose.t !== undefined) st.t = pose.t; else st.t += dt;
      if (pose.glow !== undefined) st.glow = clamp(pose.glow);
      if (pose.crack !== undefined) st.crack = clamp(pose.crack);
      st.glowK = damp(st.glowK, st.glow, 9, dt);
      apply();
    },
    testPoses: { floating: { glow: 0 }, stuck: { glow: 1 }, cracked: { glow: 0, crack: 0.8 } },
    flash: (k) => rig.flash(k),
    dispose: () => rig.dispose(),
  };
  apply();
  void opts;
  return model;
}
