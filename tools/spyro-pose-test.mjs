// Spyro's ram pose, headlessly (no browser, no server):  node tools/spyro-pose-test.mjs
// The charge tucks the head steeply down and bends the horns forward along their length until they point ahead, lowered like a bull's (they used to stand straight up, the head
// only a third of the way down). Checked on the model itself, in world space: how far down the head points, where the horns' tips go, that the bend is a bend (every edge of the
// horns keeps about its length, the splay stays, nothing tears), that it comes and goes smoothly and leaves the rest shape exactly as it was, that every other pose is untouched, and
// that two heroes do not share one pair of horns.
import * as THREE from 'three';
import { createSpyro } from '../src/game/models/creatures/spyro.js';
import { makeMaterial } from '../src/engine/materials.js';

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };
const assets = { mat: (name, o = {}) => makeMaterial({ ...o }) };
const deg = (r) => (r * 180) / Math.PI;

const K = 0.0028;                                                     // sheet unit -> metres (spyro.js)
const HEAD_PIVOT = [0, (-15 + 368) * K, (70 + 20) * K];               // the neck joint in model space
const HORN_ROOT = new THREE.Vector3(34 * K, (150 + 368) * K - HEAD_PIVOT[1], (2 + 20) * K - HEAD_PIVOT[2]);   // where the left horn starts, in head space

const find = (m, name, mesh) => { let r = null; m.root.traverse((o) => { if (o.name === name && !!o.isMesh === !!mesh) r = o; }); return r; };
const run = (m, pose, sec) => { const tp = typeof pose === 'function' ? pose : () => pose; for (let i = 0; i < Math.round(sec * 60); i++) m.update(1 / 60, tp(i / 60)); m.root.updateMatrixWorld(true); };
const hornsOf = (m) => find(m, 'horns', true);
const snap = (m) => Float32Array.from(hornsOf(m).geometry.attributes.position.array);
const normals = (m) => Float32Array.from(hornsOf(m).geometry.attributes.normal.array);
const maxDiff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i])); return d; };

/** how the head and the left horn stand in the world */
function stance(m) {
  m.root.updateMatrixWorld(true);
  const head = find(m, 'head', false);
  const fw = new THREE.Vector3(0, 0, 1).transformDirection(head.matrixWorld);
  const root = HORN_ROOT.clone().applyMatrix4(head.matrixWorld);
  const tip = new THREE.Vector3(), tipR = new THREE.Vector3();
  m.anchors.hornL.getWorldPosition(tip); m.anchors.hornR.getWorldPosition(tipR);
  const ch = tip.clone().sub(root);
  return { down: deg(Math.asin(-fw.y)), fwd: ch.z, up: ch.y, chord: deg(Math.atan2(ch.y, ch.z)), len: ch.length(), tip, tipR, spread: tip.x - tipR.x };
}

const still = () => createSpyro(assets, { still: 1, seed: 7 });
const rest = still(); run(rest, {}, 1);
const R = stance(rest), restPos = snap(rest), restNrm = normals(rest);

// ---- structure -------------------------------------------------------------------------------------------------------------------------------------------------
check('the horns are a mesh of their own (the skull is not bent with them), with an anchor on each tip', !!hornsOf(rest) && !!rest.anchors.hornL && !!rest.anchors.hornR && find(rest, 'skull', true) !== hornsOf(rest));
check('still about 2 k triangles (the horns were only moved out of the skull, nothing was added)', rest.triangleCount >= 2000 && rest.triangleCount <= 2200, `(${rest.triangleCount})`);
check('at rest the horns sweep back and up as before: the tip 0.4 m behind and 0.5 m above its root', R.fwd < -0.3 && R.fwd > -0.55 && R.up > 0.4 && R.up < 0.65 && R.len > 0.6 && R.len < 0.8, `(${R.fwd.toFixed(2)} ahead, ${R.up.toFixed(2)} up, ${R.len.toFixed(2)} long)`);
check('the tip anchors ride the tips: each is on the horn mesh (within 1 cm of its nearest vertex)', (() => {
  const g = hornsOf(rest), P = g.geometry.attributes.position, v = new THREE.Vector3(); let best = 1e9;
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(g.matrixWorld); best = Math.min(best, v.distanceTo(R.tip)); }
  return best < 0.01;
})());

// ---- the ram ---------------------------------------------------------------------------------------------------------------------------------------------------
const ram = still(); run(ram, { speed: 22, charge: true }, 1.5);
const C = stance(ram);
check('the ram tucks the head steeply down: its front points more than 55 degrees below level (it was about 34, chin up; at rest level)', C.down >= 55 && C.down <= 85 && Math.abs(R.down) < 8, `(${C.down.toFixed(1)}, at rest ${R.down.toFixed(1)})`);
check('the horns point ahead, lowered: the tip is 0.35 m or more in front of its root (at rest 0.4 m behind) and the horn no longer points up (its chord is under 45 degrees above level)', C.fwd >= 0.35 && C.chord < 45 && C.chord > -30, `(${C.fwd.toFixed(2)} ahead, chord ${C.chord.toFixed(1)} deg)`);
check('... and the tip is lower than at rest (by 0.15 m or more)', C.up <= R.up - 0.15, `(${C.up.toFixed(2)} up against ${R.up.toFixed(2)})`);
check('the two horns stay a pair: the same height and distance ahead (give or take the running body\'s few degrees of roll) and their splay is kept', Math.abs(C.tip.y - C.tipR.y) < 0.05 && Math.abs(C.tip.z - C.tipR.z) < 0.02 && Math.abs(C.spread - R.spread) < 0.03, `(${C.spread.toFixed(2)} apart, at rest ${R.spread.toFixed(2)}; heights differ by ${(C.tip.y - C.tipR.y).toFixed(3)})`);
check('the ram jump (charge held in the air) has the same head and horns', (() => { const j = still(); run(j, { speed: 22, charge: true, grounded: false, vy: 3 }, 1.5); const s = stance(j); return s.down > 55 && s.fwd > 0.3 && s.chord < 50; })());

// the lowered head must not dig into the ground
check('the lowered head stays above the ground (its lowest point 0.3 m up or more)', (() => {
  let lo = 1e9; const v = new THREE.Vector3();
  for (const name of ['skull', 'jaw', 'horns']) { const g = find(ram, name, true), P = g.geometry.attributes.position; for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(g.matrixWorld); lo = Math.min(lo, v.y); } }
  return lo > 0.3;
})());

// ---- the bend is a bend ----------------------------------------------------------------------------------------------------------------------------------------
{
  const P = hornsOf(ram).geometry.attributes.position.array, N = hornsOf(ram).geometry.attributes.normal.array;
  let fin = true, unit = true, xkept = true, lo = 9, hi = 0;
  for (let i = 0; i < P.length; i++) if (!Number.isFinite(P[i]) || !Number.isFinite(N[i])) fin = false;
  for (let i = 0; i < P.length; i += 3) {
    if (Math.abs(Math.hypot(N[i], N[i + 1], N[i + 2]) - 1) > 1e-3) unit = false;
    if (P[i] !== restPos[i]) xkept = false;
  }
  for (let t = 0; t < P.length / 9; t++) for (let e = 0; e < 3; e++) {
    const a = t * 9 + e * 3, b = t * 9 + ((e + 1) % 3) * 3;
    const len = (A, o, q) => Math.hypot(A[o] - A[q], A[o + 1] - A[q + 1], A[o + 2] - A[q + 2]);
    const l0 = len(restPos, a, b), l1 = len(P, a, b);
    if (l0 < 1e-4) continue;                                        // (the tip's degenerate edges)
    const r = l1 / l0; lo = Math.min(lo, r); hi = Math.max(hi, r);
  }
  check('the bent horns are finite with unit normals', fin && unit);
  check('the bend only moves vertices in the head\'s side plane: none moves sideways (the splay is kept)', xkept);
  check('it is a bend, not a tear: every edge of the horns keeps between 0.75 and 1.3 of its length', lo > 0.75 && hi < 1.3, `(${lo.toFixed(2)} .. ${hi.toFixed(2)})`);
  check('... and the normals turn with it (the lit side stays the lit side): a bent vertex normal differs from its rest normal by the bend, not at random', (() => {
    const Nn = normals(ram); let maxTurn = 0;
    for (let i = 0; i < Nn.length; i += 3) { const d = restNrm[i] * Nn[i] + restNrm[i + 1] * Nn[i + 1] + restNrm[i + 2] * Nn[i + 2]; maxTurn = Math.max(maxTurn, Math.acos(Math.min(1, Math.max(-1, d)))); }
    return maxTurn > 0.5 && maxTurn < 1.75;                          // the tip is turned by 1.7 rad: no vertex turns further than that
  })());
}

// ---- it comes and goes smoothly, and leaves the rest shape exactly as it was -------------------------------------------------------------------------------------
{
  const m = still(); run(m, { speed: 22 }, 1);
  const tipFwd = () => stance(m).fwd, frames = [];
  for (let i = 0; i < 60; i++) { m.update(1 / 60, { speed: 22, charge: true }); frames.push(tipFwd()); }
  let mono = true, step = 0;
  for (let i = 1; i < frames.length; i++) { if (frames[i] < frames[i - 1] - 0.03) mono = false; step = Math.max(step, Math.abs(frames[i] - frames[i - 1])); }
  check('the horns come down smoothly when the charge starts (no frame moves the tip more than 0.2 m; it never goes back)', mono && step < 0.2, `(largest step ${step.toFixed(3)} m, ${frames[0].toFixed(2)} -> ${frames[frames.length - 1].toFixed(2)})`);
  const back = [];
  for (let i = 0; i < 90; i++) { m.update(1 / 60, { speed: 22 }); back.push(tipFwd()); }
  let mono2 = true, step2 = 0;
  for (let i = 1; i < back.length; i++) { if (back[i] > back[i - 1] + 0.03) mono2 = false; step2 = Math.max(step2, Math.abs(back[i] - back[i - 1])); }
  check('... and come back up smoothly when it ends', mono2 && step2 < 0.2 && back[back.length - 1] < 0, `(largest step ${step2.toFixed(3)} m, ${back[0].toFixed(2)} -> ${back[back.length - 1].toFixed(2)})`);
  m.root.updateMatrixWorld(true);
  check('after the charge the horns are exactly the rest shape again (positions and normals, to the last bit), not a hair off it', maxDiff(snap(m), restPos) === 0 && maxDiff(normals(m), restNrm) === 0);
}

// ---- nothing else moved ----------------------------------------------------------------------------------------------------------------------------------------
{
  const others = ['idle', 'walk', 'run', 'jump', 'fall', 'glide', 'flame', 'hurt', 'dead', 'cheer', 'land'];
  const bad = [];
  for (const name of others) {
    const m = still(), tp = rest.testPoses[name];
    run(m, tp, 2);
    if (maxDiff(snap(m), restPos) !== 0 || maxDiff(normals(m), restNrm) !== 0) bad.push(name);
  }
  check('every pose but the charge keeps the horns\' rest shape exactly (idle walk run jump fall glide flame hurt dead cheer land)', bad.length === 0, bad.join(' '));
  const g = still(); run(g, { grounded: false, glide: true, vy: -2, speed: 14 }, 1.5);
  const f = still(); run(f, { flame: true }, 1.5);
  check('the glide and the fire breath keep their own head angles (the glide dips about 10 degrees, the breath throws the head well up) and the horns stay back', stance(g).down < 20 && stance(f).down < -20 && stance(g).fwd < -0.3 && stance(f).fwd < -0.4, `(glide ${stance(g).down.toFixed(1)}, flame ${stance(f).down.toFixed(1)})`);
}

// ---- heroes do not share horns ---------------------------------------------------------------------------------------------------------------------------------
{
  const a = still(), b = still();
  run(a, {}, 0.2); run(b, {}, 0.2);
  const before = snap(b);
  run(a, { speed: 22, charge: true }, 1);
  check('two heroes each have their own horns: charging one does not bend the other', maxDiff(snap(b), before) === 0 && hornsOf(a).geometry !== hornsOf(b).geometry);
  let disposed = false;
  const geo = hornsOf(a).geometry; geo.addEventListener('dispose', () => { disposed = true; });
  a.dispose();
  check('disposing a hero frees its horns', disposed);
}

// ---- bad input never poisons the pose ---------------------------------------------------------------------------------------------------------------------------
{
  const m = still();
  run(m, { speed: NaN, charge: true, vy: Infinity }, 0.5); m.update(NaN, { charge: true }); m.update(1 / 60, undefined);
  m.root.updateMatrixWorld(true);
  const P = hornsOf(m).geometry.attributes.position.array; let fin = true;
  for (let i = 0; i < P.length; i++) if (!Number.isFinite(P[i])) fin = false;
  run(m, {}, 1.5);
  check('NaN / Infinity / a missing pose while charging leave the horns finite, and they settle back to rest', fin && maxDiff(snap(m), restPos) === 0);
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
