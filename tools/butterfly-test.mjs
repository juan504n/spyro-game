// The blue butterfly model, headlessly (no browser, no server):  node tools/butterfly-test.mjs
// Geometry: every look builds finite, sensibly sized, two-sided wings (a top and an underside face for every triangle, in different colours); the flock shares geometry and ONE
// material. Animation: the wings beat while it flutters and hold still in a glide, the beat is about 4.4 Hz and quickens with speed, a forced wing angle is honoured, bad inputs
// (NaN, Infinity, nothing at all) never poison the pose, and vis 0 hides it.
import { createButterfly, BUTTERFLY_LOOKS } from '../src/game/models/creatures/butterfly.js';
import { makeMaterial, U } from '../src/engine/materials.js';

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };
const assets = { mat: (name, o = {}) => { const k = 'm' + JSON.stringify(o); assets._c = assets._c || new Map(); if (o.unique) return makeMaterial({ ...o }); if (!assets._c.has(k)) assets._c.set(k, makeMaterial({ ...o })); return assets._c.get(k); } };

const meshesOf = (m) => { const out = []; m.root.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
const pivot = (m, name) => { let r = null; m.root.traverse((o) => { if (o.name === name && !o.isMesh) r = o; }); return r; };
const finite = (a) => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false; return true; };

for (const look of Object.keys(BUTTERFLY_LOOKS)) {
  const m = createButterfly(assets, { look, scale: 1, still: 1, seed: 7 });
  const ms = meshesOf(m);
  const names = ms.map((x) => x.name).sort().join();
  check(`${look}: a body and two wings`, names === 'body,wingL,wingR', names);
  let tris = 0, ok = true;
  for (const x of ms) { tris += x.geometry.attributes.position.count / 3; for (const k of ['position', 'normal', 'aCol']) if (!finite(x.geometry.attributes[k].array)) ok = false; }
  check(`${look}: every vertex, normal and colour is finite, and it is a real model (${tris} triangles, not a sprite)`, ok && tris >= 300 && tris <= 1400, `(${tris})`);

  // size: flat wings spread, the span across both and the length nose to tail
  pivot(m, 'wingR').rotation.set(0, 0, 0); pivot(m, 'wingL').rotation.set(0, 0, 0);
  m.update(0, { wing: 0, flap: 0, vis: 1 });
  const wr = ms.find((x) => x.name === 'wingR').geometry.boundingBox, wl = ms.find((x) => x.name === 'wingL').geometry.boundingBox, bd = ms.find((x) => x.name === 'body').geometry.boundingBox;
  const span = wr.max.x - wl.min.x + 0.056, len = Math.max(wr.max.z, bd.max.z) - Math.min(wr.min.z, bd.min.z), thick = wr.max.y - wr.min.y;
  check(`${look}: about 0.95 m across the wings and 0.7 m long as modelled, the wings thin`, span > 0.85 && span < 1.05 && len > 0.6 && len < 0.85 && thick < 0.08, `(span ${span.toFixed(2)}, length ${len.toFixed(2)}, wing thickness ${thick.toFixed(3)})`);

  // two-sided: every wing triangle has its reversed twin (same corners, opposite winding), and the twins differ in colour (blue on top, pale underneath)
  const g = ms.find((x) => x.name === 'wingR').geometry, P = g.attributes.position.array, C = g.attributes.aCol.array, N = g.attributes.normal.array;
  const n = P.length / 9, key = (i, k) => [P[i * 9 + k * 3], P[i * 9 + k * 3 + 1], P[i * 9 + k * 3 + 2]].map((v) => v.toFixed(4)).join(',');
  const byKey = new Map();
  for (let i = 0; i < n; i++) { const ks = [key(i, 0), key(i, 1), key(i, 2)]; byKey.set([...ks].sort().join('|'), [...(byKey.get([...ks].sort().join('|')) || []), i]); }
  let pairs = 0, unpaired = 0, sameColour = 0, upFacing = 0, downFacing = 0;
  for (const idx of byKey.values()) {
    if (idx.length !== 2) { unpaired++; continue; }
    pairs++;
    const [a, b] = idx;
    const col = (i) => [0, 1, 2].map((k) => C[(i * 3 + k) * 4] + C[(i * 3 + k) * 4 + 1] + C[(i * 3 + k) * 4 + 2]).reduce((x, y) => x + y, 0);
    if (Math.abs(col(a) - col(b)) < 12) sameColour++;
    const ny = (i) => N[i * 9 + 1];
    if (ny(a) > 0 !== ny(b) > 0) { upFacing++; downFacing++; }
  }
  // (the only triangles without an identical twin are the six white spots: a fan floating 3 mm above the wing and another 3 mm below it)
  check(`${look}: every wing triangle has an underside twin facing the other way`, pairs >= 78 && unpaired === 60 && upFacing === pairs, `(${pairs} pairs, ${unpaired} spot triangles)`);
  check(`${look}: ... and the underside is a different colour from the top`, sameColour < pairs * 0.1, `(${sameColour} of ${pairs} twins the same colour)`);
}

// the flock shares its geometry and one material
const a = createButterfly(assets, { look: 'azure', seed: 1 }), b = createButterfly(assets, { look: 'azure', seed: 2 }), c = createButterfly(assets, { look: 'shiny', seed: 3 });
const mats = new Set([...meshesOf(a), ...meshesOf(b), ...meshesOf(c)].map((x) => x.material));
check('all butterflies share ONE material (the colour is in the vertices)', mats.size === 1, `(${mats.size})`);
check('two butterflies of a look share their geometry', meshesOf(a).every((x, i) => x.geometry === meshesOf(b).find((y) => y.name === x.name).geometry));

// animation
const beat = (model, pose, sec) => {
  const w = pivot(model, 'wingR'); const dt = 1 / 120, xs = [];
  for (let i = 0; i < sec / dt; i++) { model.update(dt, pose); xs.push(w.rotation.z); }
  const mean = xs.reduce((p, q) => p + q, 0) / xs.length;
  let crossings = 0; for (let i = 1; i < xs.length; i++) if ((xs[i - 1] - mean) * (xs[i] - mean) < 0) crossings++;
  return { range: Math.max(...xs) - Math.min(...xs), hz: crossings / 2 / sec };
};
{
  const m = createButterfly(assets, { look: 'azure', seed: 11, still: 1 });
  beat(m, { flap: 1 }, 1);
  const f0 = beat(m, { flap: 1, speed: 0 }, 4), f1 = beat(m, { flap: 1, speed: 14 }, 4);
  beat(m, { flap: 0 }, 1);                                                   // (it settles into the glide)
  const gl = beat(m, { flap: 0 }, 2);
  check('it beats its wings while it flutters (a wide sweep)', f0.range > 1.6, `(range ${f0.range.toFixed(2)} rad)`);
  check('the beat is about 4.4 a second, and quicker when it flies fast', Math.abs(f0.hz - 4.4) < 0.9 && f1.hz > f0.hz * 1.4, `(${f0.hz.toFixed(1)} Hz, ${f1.hz.toFixed(1)} Hz at speed 14)`);
  check('it holds its wings still in a shallow V when it glides', gl.range < 0.16, `(range ${gl.range.toFixed(2)} rad)`);
  m.update(0.016, { wing: 1.3 });
  check('a forced wing angle is honoured (the viewer and the tests)', Math.abs(pivot(m, 'wingR').rotation.z - 1.3) < 1e-6 && Math.abs(pivot(m, 'wingL').rotation.z + 1.3) < 1e-6);
  // a butterfly that is left to itself alternates: bursts of beats and glides
  const free = createButterfly(assets, { look: 'azure', seed: 5 });
  let flaps = 0, glides = 0, prev = null;
  for (let win = 0; win < 120; win++) {                                      // quarter-second windows over 30 s: a clear beat or a clear hold
    const w = pivot(free, 'wingR'); let lo = 9, hi = -9;
    for (let i = 0; i < 15; i++) { free.update(1 / 60, {}); lo = Math.min(lo, w.rotation.z); hi = Math.max(hi, w.rotation.z); }
    const mode = hi - lo > 0.9 ? 'beat' : hi - lo < 0.3 ? 'hold' : null;
    if (mode && prev && mode !== prev) { if (mode === 'beat') flaps++; else glides++; }
    if (mode) prev = mode;
  }
  check('left to itself it beats in bursts and glides in between', flaps >= 5 && glides >= 5, `(${flaps} bursts, ${glides} glides in 30 s)`);
  // bad inputs
  const bad = createButterfly(assets, { look: 'cyan', seed: 9 });
  bad.update(NaN, { speed: NaN, vy: Infinity, turn: -Infinity, vis: NaN, wing: undefined, flap: NaN });
  bad.update(undefined, null);
  bad.update(0.5, { speed: 1e9, vy: -1e9, turn: 1e9 });
  const r = bad.root, w = pivot(bad, 'wingR'), body = pivot(bad, 'body');
  const vals = [r.scale.x, r.scale.y, r.scale.z, w.rotation.x, w.rotation.y, w.rotation.z, body.position.y, body.rotation.x, body.rotation.z];
  check('NaN, Infinity and missing inputs never poison the pose', vals.every(Number.isFinite), JSON.stringify(vals.map((v) => +v.toFixed(3))));
  bad.update(0.016, { vis: 0 });
  check('vis 0 hides it (and vis 1 shows it again at its size)', bad.root.visible === false && bad.root.scale.x < 0.001);
  bad.update(0.016, { vis: 1 });
  check('... vis 1 shows it at its size again', bad.root.visible === true && Math.abs(bad.root.scale.x - 0.6) < 1e-6, `(scale ${bad.root.scale.x})`);
  // the shared material's lift: brighter at dusk, settling at daybreak
  const M = meshesOf(bad)[0].material;
  U.uDay.value = 0; bad.update(0.016, { vis: 1 }); const dusk = M.uniforms.uColorMul.value.r;
  U.uDay.value = 1; bad.update(0.016, { vis: 1 }); const day = M.uniforms.uColorMul.value.r;
  check('it is lifted at dusk (to glow against the dark) and settles by daybreak', dusk > 1.15 && day < 1.1 && dusk > day, `(${dusk.toFixed(2)} at dusk, ${day.toFixed(2)} at daybreak)`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall butterfly checks passed');
process.exitCode = failed ? 1 : 0;
