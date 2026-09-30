// SPYRO-STYLE HERO: the small purple dragon of the classic look, built in code (no model, texture or animation data from the
// original game is used) from a measured model sheet: proportions, landmarks and colours read off orthographic views of the
// character, then authored here as lofted rings, sweeps and flat plates.
//
// What defines the look: a boxy head on a short thick neck, a broad flat muzzle with a raised nose plate, large glossy eyes on
// the forehead wall, two thick ringed horns swept back and a fan of orange shards behind the crown; a tall upright chest with
// banded orange plates from the throat down to the belly; four short columnar legs with flat three-toed feet; wings held up
// like triangular sails (dark red membrane, broad orange leading edge); a long tail that tapers to an orange ringed tip.
//
// Rig (all pivots procedural, no skinning):
//   root > rig (squash / tumble / hop)
//     > body (torso + chest column; pitch / roll / bob)
//         > head (neck joint)  > jaw, eyes, horns (a mesh of its own: the charge bends it), [anchors.mouth, hornL, hornR]
//         > wingL / wingR (root pivots at the spine, mirrored group for the right side)
//         > tail1 > tail2 > tail3 > tip
//         > legFL / legFR / legHL / legHR
//         > [anchors.back]
//
// Pose contract (all optional): { speed 0..24, grounded = true, vy, glide, charge, flame, turn -1..1, hurt 0..1,
//   land 0..1, dead, cheer, look -1..1, t, flash 0..1 (extra: drives the hit flash directly, for the dev viewer) }
// Creation options: { seed, still } — `still` switches the idle blink / look-around / breathing / tail sway off (for review renders).
//
// The charge (ram): the head tucks steeply down (65 to 70 degrees below level, chin toward the chest) and the horns bend forward along their length until they
// point ahead, lowered like a bull's, with the tips curling level; the crest fin and the wings stay up behind. See CHARGE_HEAD and hornBender.
import * as THREE from 'three';
import { U } from '../../../engine/materials.js';
import {
  Rig, lit, loft, ellipsoid, spike, bar, triF, triDouble, setBias,
  clamp, num, heal, lerp, sstep, damp, spring, mix3, TAU, nextSeed, seeded,
} from './rig.js';
import { superRing, meshRings, sweep, spline } from './parts.js';

// ---- palette (raw albedo tints) -------------------------------------------------------------------------------------
const PUR = [0.39, 0.27, 0.71];
const PUR_HI = [0.52, 0.40, 0.86];
const PUR_LO = [0.28, 0.20, 0.54];
const LAV = [0.60, 0.64, 0.94];            // scale edges, muzzle, chin
const BELLY = [1.0, 0.88, 0.46];
const BAND = [0.97, 0.64, 0.22];
const HORN_A = [0.76, 0.52, 0.26];
const HORN_B = [0.38, 0.25, 0.13];
const HORN_TIP = [0.98, 0.82, 0.50];
const CREST = [0.96, 0.62, 0.14];
const CREST_HI = [1.0, 0.82, 0.30];
const MEMB = [0.44, 0.08, 0.12];
const MEMB_HI = [0.60, 0.14, 0.15];
const MEMB_LO = [0.30, 0.06, 0.09];
const BONE = [0.94, 0.52, 0.12];
const BONE_HI = [1.0, 0.76, 0.30];
const MOUTH = [0.55, 0.13, 0.20];
const TONGUE = [0.92, 0.36, 0.44];
const TOE = [0.20, 0.15, 0.38];
const TIP_DARK = [0.85, 0.48, 0.10];
const TEETH = [0.96, 0.94, 1.0];
const WHITE = [1, 1, 1];
const BLACK = [0.05, 0.03, 0.09];

// ---- the model sheet --------------------------------------------------------------------------------------------------
// Everything is authored in sheet units and converted with P(): +y up (ground at -368), +z forward (body centre at -20), left = +x.
// One sheet unit is K metres, so the hero stands about 1.6 m tall at the crown (2 m with the horns) and is 2.5 m long with the tail.
const K = 0.0028;
const P = (x, y, z) => [x * K, (y + 368) * K, (z + 20) * K];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const neg3 = (a) => [-a[0], -a[1], -a[2]];
const sgn = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), 2 / e);     // signed power: superellipse point from a cosine / sine

// pivot positions in model space (rest pose)
const W = {
  body: P(0, -185, -20),
  head: P(0, -15, 70),                       // neck joint
  jaw: P(0, 22, 105),                        // jaw hinge
  eyes: P(0, 106, 152),
  mouth: P(0, 46, 248),
  back: P(0, -100, -60),
  wing: P(1, -94, 25),                       // both wings start at the spine, just behind the shoulders
  tail: P(0, -199, -190),                    // tail1 (the chain hangs off it)
  legFL: P(72, -190, 80), legFR: P(-72, -190, 80), legHL: P(76, -200, -110), legHR: P(-76, -200, -110),
};
const BODY_Y = W.body[1];
const HEAD_AT = sub3(W.head, W.body);
const JAW_AT = sub3(W.jaw, W.head);
const EYES_AT = sub3(W.eyes, W.head);
const MOUTH_AT = sub3(W.mouth, W.head);
const BACK_AT = sub3(W.back, W.body);
const WING_AT = sub3(W.wing, W.body);
const TAIL_AT = sub3(W.tail, W.body);
const TAIL_LEN = [140 * K, 130 * K, 85 * K];          // tail1..tail3 (the orange tip hangs off the end of tail3)
const CHARGE_HEAD = 1.15;                              // the head pitches this far down on top of the body's own pitch at full charge (65 to 70 degrees below level in all)
const HEAD_TILT = 0;                                  // the head is built level: no resting nose-down angle
const OCT = Math.PI / 8;                              // 8-sided rings turned so the faces (not the corners) point up / down / sideways
const N8 = 8;

// ---- ring helpers ------------------------------------------------------------------------------------------------------
/** Superellipse rings stacked along sheet Z: rows [z, cy, rx, ry, e] (x centred). A row with rx = ry = 0 is a pole. */
function ringsZ(rows, col, cx = 0, N = N8, rot = OCT) {
  return rows.map((r, i) => {
    const [z, cy, rx, ry, e] = r;
    const pts = superRing(cx, cy, z, rx, ry, e, N, rot).map((q) => P(q[0], q[1], q[2]));
    return { pts, cols: pts.map((_, j) => col(rot + (j / N) * TAU, i, r)) };
  });
}
/** Superellipse rings stacked along sheet Y (columns): rows [y, cz, rx, rz, e, dx]; angle 0 = +x, 90 degrees = +z (straight ahead); dx nudges a ring sideways (away from the midline). */
function ringsY(rows, col, cx = 0, N = N8, rot = OCT) {
  return rows.map((r, i) => {
    const [y, cz, rx, rz, e, dx = 0] = r;
    const pts = [];
    for (let j = 0; j < N; j++) {
      const th = rot + (j / N) * TAU;
      pts.push(P(cx + dx * Math.sign(cx || 1) + rx * sgn(Math.cos(th), e), y, cz + rz * sgn(Math.sin(th), e)));
    }
    return { pts, cols: pts.map((_, j) => col(rot + (j / N) * TAU, i, r)) };
  });
}

// ---- torso, chest column, neck -------------------------------------------------------------------------------------------
// the body: a horizontal loft from the hips to the chest; back and belly are flat-ish, the flanks straight
const TORSO = [
  [-198, -199, 57, 63, 2.3],
  [-170, -190, 76, 90, 2.5],
  [-135, -190, 82, 94, 2.6],
  [-100, -190, 80, 94, 2.6],
  [-60, -190, 74, 94, 2.6],
  [-20, -188, 66, 94, 2.6],
  [20, -182, 74, 100, 2.6],
  [55, -178, 80, 103, 2.6],
  [88, -176, 78, 104, 2.6],
  [112, -178, 60, 96, 2.5],
];
// purple back, paler flanks and belly (the banded plate is a separate strip laid on the belly facet, see bandedStrip)
const bodyCol = (th) => {
  const s = Math.sin(th);                                  // +1 back .. -1 belly
  const c = mix3(PUR, PUR_HI, sstep(0.2, 1, s) * 0.8);
  return mix3(c, LAV, sstep(-0.1, -0.8, s) * 0.5);
};

const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** a flat quad wound to face along `hint` (two flat-shaded triangles) */
function faceTo(b, p0, p1, p2, p3, hint, col) {
  const g = cross3(sub3(p1, p0), sub3(p3, p0));
  const flip = g[0] * hint[0] + g[1] * hint[1] + g[2] * hint[2] < 0;
  if (flip) { triF(b, p0, p3, p2, col); triF(b, p0, p2, p1, col); } else { triF(b, p0, p1, p2, col); triF(b, p0, p2, p3, col); }
}
/**
 * The banded plates: flat quads laid on a facet of the body (offset a hair outwards along `hint`), following a path of stations
 * { p: centre point (model space), w: half width } and alternating between two colours every ~bandLen metres.
 */
function bandedStrip(b, stations, hint, bandLen, cA, cB, lift = 1.4 * K) {
  let band = 0;
  const off = [hint[0] * lift, hint[1] * lift, hint[2] * lift];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i], c = stations[i + 1];
    const len = Math.hypot(c.p[0] - a.p[0], c.p[1] - a.p[1], c.p[2] - a.p[2]);
    const n = Math.max(1, Math.round(len / bandLen));
    const at = (t, side) => [lerp(a.p[0], c.p[0], t) + side * lerp(a.w, c.w, t) + off[0], lerp(a.p[1], c.p[1], t) + off[1], lerp(a.p[2], c.p[2], t) + off[2]];
    for (let k = 0; k < n; k++) {
      faceTo(b, at(k / n, -1), at(k / n, 1), at((k + 1) / n, 1), at((k + 1) / n, -1), hint, band++ % 2 ? cB : cA);
    }
  }
}
/** belly stations: the flat bottom facet of each torso ring (between the 247.5 and 292.5 degree corners) */
const bellyStations = (rows) => rows.map(([z, cy, rx, ry, e]) => ({ p: P(0, cy + ry * sgn(Math.sin(1.5 * Math.PI + OCT), e), z), w: rx * sgn(Math.cos(1.5 * Math.PI + OCT), e) * K - 2.5 * K }));

function torsoGeo(b) {
  b.translate(...neg3(W.body));
  setBias(0.45);
  meshRings(b, ringsZ(TORSO, bodyCol), { cap0: true, cap1: true, capCol: PUR });
  setBias(0);
  const belly = bellyStations(TORSO.filter((r) => r[0] >= -170)).reverse();
  bandedStrip(b, belly.slice(0, -1), [0, -1, 0], 22 * K, BELLY, BAND);
}

// the chest column: from the belly up the vertical chest front and the short neck to the head; its front carries the banded plates
const CHEST = [
  [-272, 58, 70, 40, 2.4],
  [-256, 62, 80, 46, 2.4],
  [-232, 74, 80, 52, 2.4],
  [-200, 84, 74, 64, 2.4],
  [-165, 86, 68, 62, 2.4],
  [-130, 86, 60, 62, 2.4],
  [-100, 86, 50, 62, 2.4],
  [-72, 86, 40, 50, 2.3],
  [-48, 76, 42, 47, 2.3],
  [-28, 66, 45, 43, 2.3],
  [-8, 74, 47, 50, 2.3],
];
const chestCol = (th) => {
  const f = Math.sin(th);                                  // +1 straight ahead
  const c = mix3(PUR, PUR_HI, sstep(0.0, -1, f) * 0.45);
  return mix3(c, LAV, sstep(0.2, 0.9, f) * 0.5);
};
/** stations down the flat front facet of the chest column (between the 67.5 and 112.5 degree corners), throat first */
const chestStations = (rows) => rows.map(([y, cz, rx, rz, e]) => ({ p: P(0, y, cz + rz * sgn(Math.sin(Math.PI / 2 - OCT), e)), w: rx * sgn(Math.cos(Math.PI / 2 - OCT), e) * K - 2.5 * K })).reverse();
function chestGeo(b) {
  b.translate(...neg3(W.body));
  setBias(0.6);
  meshRings(b, ringsY(CHEST, chestCol), { cap0: true, cap1: true, capCol: PUR });
  setBias(0);
  bandedStrip(b, chestStations(CHEST.filter((r) => r[0] >= -256 && r[0] <= -20)), [0, 0.35, 1], 20 * K, BELLY, BAND);
}

// ---- head ------------------------------------------------------------------------------------------------------------------
const SKULL = [
  [-28, 118, 62, 86, 2.6],
  [0, 120, 80, 82, 2.6],
  [40, 126, 85, 77, 2.7],
  [90, 132, 80, 70, 2.7],
  [120, 136, 73, 66, 2.7],
  [140, 138, 60, 62, 2.7],
  [153, 140, 40, 57, 2.6],
  [163, 141, 16, 50, 2.4],
];
// cheeks: the wide lower half of the head (the flared corners are the widest point), and the upper lip plate that runs out to the nose
const CHEEK = [
  [-25, 20, 80, 48, 2.5],
  [20, 24, 100, 52, 2.6],
  [55, 26, 116, 52, 2.8],
  [90, 26, 106, 50, 2.8],
  [108, 26, 98, 48, 2.7],
];
const MUZZLE = [
  [92, 58, 100, 17, 2.8],
  [140, 58, 84, 17, 2.8],
  [170, 58, 66, 16, 2.7],
  [200, 58, 50, 15, 2.6],
  [225, 59, 34, 15, 2.5],
  [243, 60, 20, 14, 2.4],
  [254, 64, 9, 10, 2.2],
  [259, 68, 0, 0, 2],
];
// (the jaw's top meets the underside of the upper lip all the way to the nose: the mouth is shut)
const JAW = [
  [100, 22, 88, 21, 2.6],
  [140, 22, 82, 21, 2.6],
  [175, 24, 66, 20, 2.5],
  [205, 27, 48, 17.5, 2.4],
  [228, 32, 32, 13, 2.3],
  [240, 36, 17, 10, 2.2],
  [250, 40, 6, 6, 2.1],
  [254, 42, 0, 0, 2],
];
const skullCol = (th) => {
  const s = Math.sin(th);
  const c = mix3(PUR, PUR_HI, sstep(0.1, 0.95, s) * 0.85);
  return mix3(c, LAV, sstep(-0.2, -0.75, s) * 0.5);
};
const muzzleCol = (th) => {
  const s = Math.sin(th);
  const c = mix3(PUR, PUR_HI, sstep(0.1, 0.95, s) * 0.6);
  return mix3(c, LAV, 0.4 + 0.25 * sstep(-0.2, -0.9, s));
};
const jawCol = (th) => {
  const s = Math.sin(th);
  return mix3(mix3(PUR, LAV, 0.55), BELLY, sstep(-0.6, -1, s) * 0.25);
};

/** point on a ring row list at sheet depth z and angle th (rows [z, cy, rx, ry, e]) */
function rowPoint(rows, z, th, grow = 1) {
  let i = 0;
  while (i < rows.length - 2 && z > rows[i + 1][0]) i++;
  const A = rows[i], B = rows[i + 1], t = clamp((z - A[0]) / ((B[0] - A[0]) || 1));
  const L = (k) => A[k] + (B[k] - A[k]) * t;
  const e = L(4), sp = (v) => Math.sign(v) * Math.pow(Math.abs(v), 2 / e);
  return [L(2) * sp(Math.cos(th)) * grow, L(1) + L(3) * sp(Math.sin(th)) * grow, z];
}

function hornPath(s) {
  const pts = spline([[34, 150, 2, 29], [70, 213, -82, 23], [115, 281, -91, 14], [119, 312, -118, 8], [118, 342, -147, 0]], 2);
  return pts.map((c, i) => {
    const band = i % 2;
    let col = band ? HORN_A : HORN_B;
    col = mix3(col, HORN_TIP, sstep(0.6, 1, i / (pts.length - 1)));
    if (i < 2) col = mix3(PUR_LO, col, i / 2);
    return { p: P(s * c[0], c[1], c[2]), r: c[3] * K * (band ? 0.9 : 1), col };
  });
}

// the crest: one flat orange fin standing on the midline; [z, y] outline read off the side view (six spikes, the base runs down the
// back of the head into the neck)
const FIN = [[193, 218], [165, 268], [151, 228], [107, 216], [51, 286], [41, 230], [-51, 242], [-35, 188], [-119, 114], [-65, 90],
  [-85, -2], [-41, 40], [-29, 100], [-25, 152], [61, 196], [129, 178]];

/** triangulate a simple polygon (array of [u, v]) by ear clipping -> [[i, j, k], ...] */
function earClip(poly) {
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = poly[i], c = poly[(i + 1) % n]; area += a[0] * c[1] - c[0] * a[1]; }
  const ccw = area > 0;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (q, a, b, c) => {
    const d1 = cross(a, b, q), d2 = cross(b, c, q), d3 = cross(c, a, q);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  const idx = poly.map((_, i) => i), out = [];
  while (idx.length > 3) {
    let clipped = false;
    for (let k = 0; k < idx.length && !clipped; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      const cr = cross(poly[i0], poly[i1], poly[i2]);
      if (ccw ? cr <= 0 : cr >= 0) continue;                     // reflex corner
      if (idx.some((j) => j !== i0 && j !== i1 && j !== i2 && inside(poly[j], poly[i0], poly[i1], poly[i2]))) continue;
      out.push([i0, i1, i2]); idx.splice(k, 1); clipped = true;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}
function finGeo(b) {
  const col = (q) => mix3(CREST, CREST_HI, sstep(150, 285, q[1] / K - 368));
  const V = FIN.map(([z, y]) => P(0, y, z));
  for (const [i, j, k] of earClip(FIN)) triDouble(b, V[i], V[j], V[k], col(V[i]), col(V[j]), col(V[k]));
}

function skullGeo(b) {
  b.translate(...neg3(W.head));
  setBias(0.45);
  meshRings(b, ringsZ(SKULL, skullCol), { cap0: true, cap1: true, capCol: mix3(PUR, PUR_HI, 0.3) });
  meshRings(b, ringsZ(CHEEK, skullCol), { cap0: true, cap1: true, capCol: PUR });
  meshRings(b, ringsZ(MUZZLE, muzzleCol), { cap0: true });

  // crest fin
  setBias(0.9);
  finGeo(b);

  // mouth line: a thin pale sliver along each side of the muzzle, where the lip meets the jaw
  setBias(0);
  for (const s of [1, -1]) {
    const pts = [];
    for (let z = 200; z <= 250; z += 10) {
      const q = rowPoint(MUZZLE, z, -1.08, 1.012);
      pts.push(P(s * q[0], q[1], q[2]));
    }
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], c = pts[k + 1], w = 1.6 * K;
      triDouble(b, [a[0], a[1] - w, a[2]], [a[0], a[1] + w, a[2]], [c[0], c[1] + w, c[2]], TEETH);
      triDouble(b, [a[0], a[1] - w, a[2]], [c[0], c[1] + w, c[2]], [c[0], c[1] - w, c[2]], TEETH);
    }
  }
  mouthPlate(b, 39, 0.45, MOUTH, MOUTH);                     // the roof of the mouth: just inside the jaw while the mouth is shut
  // nostrils: two small dark notches on the nose plate
  for (const s of [1, -1]) {
    const c = P(s * 9, 74, 236);
    ellipsoid(b, c[0], c[1], c[2], 4 * K, 2.5 * K, 6 * K, { segs: 6, rings: 2, col: BLACK });
  }
}

/** the horns: thick, ringed, swept back and up. A part of their own (not the skull's) because the charge bends them, see hornBender. */
function hornsGeo(b) {
  b.translate(...neg3(W.head));
  setBias(0.7);
  for (const s of [1, -1]) sweep(b, hornPath(s), { segs: 6 });
}

/**
 * The charge lowers the horns, as a bull lowers its horns to ram: they bend forward along their length. Every vertex of the horns' mesh belongs to the ring
 * of the swept tube it was made on; a ring turns about the head's X axis by an angle that grows from nothing at the root to HORN_BEND at the tip
 * (HORN_PROFILE), and its centre follows the bent spine. So the tube curves smoothly, with no joint that could open up, and keeps its length and its splay
 * (x never changes). bend(0) puts the rest shape back exactly. `tips` are two anchors that ride the horns' tips (left, right).
 * Returns bend(k), k 0..1, which rewrites the position and normal arrays of the geometry it was given (about 600 vertices: nothing).
 */
const HORN_BEND = 1.7;                                    // radians the tip is turned by at full charge (the root stays where it was)
const HORN_PROFILE = (t) => Math.pow(t, 1.2);             // share of the bend reached at t along the horn (0 root .. 1 tip): the root barely turns, the tip curls the most
function hornBender(geo, tips) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  const p0 = Float32Array.from(pos.array), n0 = Float32Array.from(nrm.array), count = pos.count;
  const rings = [1, -1].map((s) => hornPath(s).map((q) => sub3(q.p, W.head)));          // ring centres in head space: the left horn, then the right one
  const nr = rings[0].length;
  const ring = new Uint8Array(count), side = new Uint8Array(count);
  for (let v = 0; v < count; v++) {                      // the ring whose centre is nearest (a ring's own points are its radius away, the next ring's centre is further)
    const sd = p0[v * 3] >= 0 ? 0 : 1, C = rings[sd];
    let best = 0, bd = Infinity;
    for (let i = 0; i < nr; i++) {
      const d = (p0[v * 3] - C[i][0]) ** 2 + (p0[v * 3 + 1] - C[i][1]) ** 2 + (p0[v * 3 + 2] - C[i][2]) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    ring[v] = best; side[v] = sd;
  }
  const ang = new Float64Array(nr), cy = [new Float64Array(nr), new Float64Array(nr)], cz = [new Float64Array(nr), new Float64Array(nr)];
  const bend = (k) => {
    k = clamp(k);
    const P = pos.array, N = nrm.array;
    for (let i = 0; i < nr; i++) ang[i] = k * HORN_BEND * HORN_PROFILE(i / (nr - 1));
    for (let sd = 0; sd < 2; sd++) {                     // the bent spine: each step of the path turned by the mean angle of its two rings
      const C = rings[sd];
      cy[sd][0] = C[0][1]; cz[sd][0] = C[0][2];
      for (let i = 0; i < nr - 1; i++) {
        const a = (ang[i] + ang[i + 1]) / 2, co = Math.cos(a), si = Math.sin(a);
        const dy = C[i + 1][1] - C[i][1], dz = C[i + 1][2] - C[i][2];
        cy[sd][i + 1] = cy[sd][i] + dy * co - dz * si;
        cz[sd][i + 1] = cz[sd][i] + dy * si + dz * co;
      }
      tips[sd].position.set(C[nr - 1][0], cy[sd][nr - 1], cz[sd][nr - 1]);
    }
    if (k < 1e-4) { P.set(p0); N.set(n0); }              // (exactly the rest shape, not a bend of 0.0000x)
    else {
      for (let v = 0; v < count; v++) {
        const i = ring[v], sd = side[v], C = rings[sd][i], co = Math.cos(ang[i]), si = Math.sin(ang[i]), o = v * 3;
        const dy = p0[o + 1] - C[1], dz = p0[o + 2] - C[2];
        P[o] = p0[o];
        P[o + 1] = cy[sd][i] + dy * co - dz * si;
        P[o + 2] = cz[sd][i] + dy * si + dz * co;
        N[o] = n0[o];
        N[o + 1] = n0[o + 1] * co - n0[o + 2] * si;
        N[o + 2] = n0[o + 1] * si + n0[o + 2] * co;
      }
    }
    pos.needsUpdate = nrm.needsUpdate = true;
  };
  return bend;
}

/** a flat two-sided strip across the mouth at height y (sheet units): x = +-k * the jaw's half-width at each station */
function mouthPlate(b, y, k, cA, cB) {
  const rows = JAW.filter((r) => r[2] > 0).slice(0, 6);       // (up to z = 240)
  for (let i = 0; i < rows.length - 1; i++) {
    const [z0, , rx0] = rows[i], [z1, , rx1] = rows[i + 1];
    const a = P(k * rx0, y, z0), c = P(-k * rx0, y, z0), d = P(-k * rx1, y, z1), e = P(k * rx1, y, z1);
    triDouble(b, a, c, d, cA, cA, cB);
    triDouble(b, a, d, e, cA, cB, cB);
  }
}
function jawGeo(b) {
  b.translate(...neg3(W.jaw));
  setBias(0.35);
  meshRings(b, ringsZ(JAW, jawCol), { cap0: true });
  mouthPlate(b, 46.5, 0.45, TONGUE, MOUTH);                  // the tongue: just inside the upper lip while the mouth is shut
}

// eyes: big glossy ovals on the forehead wall, angled outward; huge pupils low and toward the nose, one bright glint each
const EYE_C = sub3(P(42, 106, 152), W.head);                         // right-hand eye centre in head space (the left one mirrors it)
const EYE = { rx: 31 * K, ry: 42 * K, rz: 11 * K };
function eyesGeo(b) {
  const { rx, ry, rz } = EYE;
  const surf = (x, y, lift) => [x, y, rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2 - (y / ry) ** 2)) + lift];
  for (const s of [1, -1]) {
    b.push().translate(s * EYE_C[0], EYE_C[1], EYE_C[2]).rotateY(s * 0.55).rotateZ(s * 0.28).rotateX(-0.06);
    ellipsoid(b, 0, 0, 0, rx, ry, rz, { segs: 8, rings: 4, col: WHITE });
    const cx = -s * 0.2 * rx, cy = -0.2 * ry, pr = [0.56 * rx, 0.62 * ry];
    const c0 = surf(cx, cy, 0.004);
    for (let j = 0; j < 8; j++) {
      const a0 = (j / 8) * TAU, a1 = ((j + 1) / 8) * TAU;
      triF(b, c0, surf(cx + Math.cos(a0) * pr[0], cy + Math.sin(a0) * pr[1], 0.004), surf(cx + Math.cos(a1) * pr[0], cy + Math.sin(a1) * pr[1], 0.004), BLACK);
    }
    const hx = cx + s * 0.18 * rx, hy = cy + 0.38 * ry, hw = 0.15 * rx;
    const h00 = surf(hx - hw, hy - hw, 0.009), h10 = surf(hx + hw, hy - hw, 0.009), h11 = surf(hx + hw, hy + hw, 0.009), h01 = surf(hx - hw, hy + hw, 0.009);
    triF(b, h00, h10, h11, WHITE);
    triF(b, h00, h11, h01, WHITE);
    b.pop();
  }
}

// ---- legs ------------------------------------------------------------------------------------------------------------------
// front legs: straight columns under the chest; hind legs: a heavy thigh and a lower leg that leans back. Feet are flat wedges
// with three dark toes. (Leg space: pivot at the hip, feet at -legLength.)
const LEG_COL = {
  front: { x: 72, rows: [[-195, 60, 40, 56, 2.4], [-250, 62, 30, 44, 2.4, -5], [-280, 60, 21, 25, 2.4, -5], [-300, 64, 18, 20, 2.4, -2], [-320, 72, 16, 20, 2.3, 1], [-342, 74, 17, 22, 2.3, 1]],
    foot: [[46, -357, 26, 11, 2.3], [75, -358, 34, 10, 2.4], [110, -357, 36, 11, 2.4], [140, -361, 33, 7, 2.4], [151, -364, 24, 4, 2.3], [157, -366, 0, 0, 2]],
    toes: [-24, 0, 24].map((dx) => [dx, 140]) },
  hind: { x: 76, rows: [[-200, -100, 30, 68, 2.4, -6], [-250, -106, 26, 60, 2.4, -7], [-292, -118, 28, 32, 2.4, -10], [-320, -128, 21, 24, 2.3, -6], [-342, -127, 17, 33, 2.3, -6]],
    foot: [[-170, -357, 22, 11, 2.3], [-140, -358, 30, 12, 2.4], [-100, -357, 35, 11, 2.4], [-60, -360, 34, 8, 2.4], [-40, -363, 26, 5, 2.3], [-32, -365, 0, 0, 2]],
    toes: [-24, 0, 24].map((dx) => [dx, -44]) },
};
const legCol = (th) => mix3(PUR, PUR_LO, sstep(0.4, -0.6, Math.sin(th)) * 0.5);
const footCol = (th) => mix3(PUR, PUR_LO, 0.35 + 0.35 * sstep(0.2, -0.8, Math.sin(th)));
const legPivot = (hind, side) => (hind ? (side > 0 ? W.legHL : W.legHR) : (side > 0 ? W.legFL : W.legFR));
function legGeo(b, hind, side) {
  const D = hind ? LEG_COL.hind : LEG_COL.front;
  b.translate(...neg3(legPivot(hind, side)));
  setBias(0.4);
  meshRings(b, ringsY(D.rows, legCol, side * D.x, 6, Math.PI / 6), { cap0: true });
  meshRings(b, ringsZ(D.foot, footCol, side * D.x, 6, Math.PI / 6));
  setBias(0.9);
  for (const [dx, z] of D.toes) {
    const base = P(side * D.x + dx, -363, z);
    spike(b, base, [0, -0.1, 1], 15 * K, 9 * K, { segs: 4, col: mix3(PUR_LO, TOE, 0.5), tip: TOE });
  }
}
// points on the sole (+ toe tips) in leg space, used to keep the feet out of the ground
function footPoints(hind, side) {
  const D = hind ? LEG_COL.hind : LEG_COL.front;
  const pivot = legPivot(hind, side);
  const pts = [];
  for (const [z, , rx] of D.foot) for (const sx of [-1, 1]) pts.push(sub3(P(side * D.x + sx * rx, -367, z), pivot));
  return pts;
}

// ---- tail ------------------------------------------------------------------------------------------------------------------
// per segment: rings [fraction of the length, axis height relative to the segment's start, rx, ry] in sheet units; the axis follows the
// measured S-curve (it sinks fast after the hips, rises again mid-tail and sinks towards the tip)
const TAIL = [
  [[0, 0, 59, 66], [0.6, -17, 41, 42], [1, -17, 34, 31]],
  [[0, 0, 34, 31], [0.5, 12, 26, 22], [1, 10.5, 15, 14.5]],
  [[0, 0, 15, 14.5], [0.47, -6, 10, 10.5], [1, -14, 7, 6.5]],
];
const TAIL_DY = TAIL.map((seg) => seg[seg.length - 1][1] * K);              // where each segment's axis ends (the next pivot sits there)
const tailCol = (th) => {
  const s = Math.sin(th);
  return mix3(mix3(PUR, PUR_HI, sstep(0.3, 0.95, s) * 0.8), LAV, sstep(-0.2, -0.8, s) * 0.75);
};
function tailGeo(b, i) {
  const LEN = TAIL_LEN[i];
  setBias(0.45);
  loft(b, TAIL[i].map(([t, dy, rx, ry], k) => ({ z: k === 0 ? 0.03 : -LEN * t, y: dy * K, rx: rx * K, ry: ry * K, col: tailCol })), { segs: 8, rot: OCT });
}
function tipGeo(b) {
  // the orange tail tip: a ringed cone, darker bands
  setBias(0.9);
  const rings = [[0.02, 0, BAND], [-0.02, 9, BAND], [-0.07, 13, TIP_DARK], [-0.12, 12, BAND], [-0.17, 8, TIP_DARK], [-0.223, 0, BONE_HI]];
  loft(b, rings.map(([z, r, col]) => ({ z, y: (z / 0.223) * 19 * K, rx: r * K, ry: r * K, col })), { segs: 6 });
}

// ---- wings -----------------------------------------------------------------------------------------------------------------
// held up like sails: a dark membrane between a broad orange leading edge (root - shoulder - wrist - tip) and a lower edge
const WR = P(1, -94, 25), WM = P(-1, -102, -7), WS = P(77, -24, -94), WWR = P(98, 75, -142), WT = P(142, 166, -227), WC = P(112, -48, -195), WB = P(87, -90, -147);
function wingGeo(b) {
  b.translate(...neg3(W.wing));
  setBias(1.0);
  const tri = (a, c, d, ca, cb, cc) => triDouble(b, a, c, d, ca, cb, cc);
  tri(WM, WS, WB, MEMB_LO, MEMB, MEMB);
  tri(WS, WB, WC, MEMB, MEMB, MEMB_HI);
  tri(WS, WC, WWR, MEMB, MEMB_HI, MEMB);
  tri(WWR, WC, WT, MEMB, MEMB_HI, MEMB_HI);
  // the leading edge is a broad orange band lying in the wing (a ribbon toward the membrane), with a rounded bone along its outer edge
  setBias(0.9);
  const mid = [(WM[0] + WT[0] + WC[0]) / 3, (WM[1] + WT[1] + WC[1]) / 3, (WM[2] + WT[2] + WC[2]) / 3];
  const band = (a, c, wa, wc, ca, cc) => {
    const along = sub3(c, a), l = Math.hypot(...along) || 1;
    const dir = along.map((v) => v / l);
    const toMid = sub3(mid, a), k = toMid[0] * dir[0] + toMid[1] * dir[1] + toMid[2] * dir[2];
    let n = [toMid[0] - dir[0] * k, toMid[1] - dir[1] * k, toMid[2] - dir[2] * k];
    const nl = Math.hypot(...n) || 1;
    n = n.map((v) => v / nl);
    const a2 = [a[0] + n[0] * wa * K, a[1] + n[1] * wa * K, a[2] + n[2] * wa * K], c2 = [c[0] + n[0] * wc * K, c[1] + n[1] * wc * K, c[2] + n[2] * wc * K];
    triDouble(b, a, c, c2, ca, cc, cc);
    triDouble(b, a, c2, a2, ca, cc, ca);
  };
  band(WR, WS, 26, 24, BONE, BONE);
  band(WS, WWR, 24, 18, BONE, BONE);
  band(WWR, WT, 18, 6, BONE, BONE_HI);
  setBias(0.5);
  bar(b, WR, WS, 13 * K, 11 * K, PUR, { segs: 4, col1: BONE });
  bar(b, WS, WWR, 11 * K, 9 * K, BONE, { segs: 4, col1: BONE });
  bar(b, WWR, WT, 9 * K, 3 * K, BONE, { segs: 4, col1: BONE_HI, cap1: true });
  bar(b, WM, WB, 8 * K, 5 * K, BONE, { segs: 4, col1: BONE });
  bar(b, WWR, WB, 5 * K, 4 * K, BONE, { segs: 4, col1: BONE, cap1: true });
  bar(b, WC, WT, 5 * K, 3 * K, BONE, { segs: 4, col1: BONE, cap1: true });
  // the brown knob where the wing joins the shoulder
  ellipsoid(b, WR[0], WR[1] + 4 * K, WR[2] + 4 * K, 14 * K, 13 * K, 14 * K, { segs: 6, rings: 3, col: HORN_A });
}

// ---- model ------------------------------------------------------------------------------------------------------------
export function createSpyro(assets, opts) {
  opts = opts || {};
  const R = new Rig(assets, 'spyro');
  const M = R.litMat(null);
  const G = R.glowMat(null);
  const seed = nextSeed(opts);
  const rnd = seeded(seed);

  const body = R.pivot(R.rig, 0, BODY_Y, 0, 'body');
  R.part(body, M, torsoGeo, 'torso');
  R.part(body, M, chestGeo, 'chest');

  const head = R.pivot(body, ...HEAD_AT, 'head');
  R.part(head, M, skullGeo, 'skull');
  // the horns bend with the charge, so each model has its own copy of their geometry (a few hundred vertices)
  const hornBuilder = lit(); hornsGeo(hornBuilder); setBias(0);
  const hornMesh = R.mesh(head, hornBuilder, M, 'horns');
  hornMesh.frustumCulled = false;                       // (it bends out of the box the geometry was measured in)
  const hornTips = [R.pivot(head, 0, 0, 0, 'hornL'), R.pivot(head, 0, 0, 0, 'hornR')];
  const bendHorns = hornBender(hornMesh.geometry, hornTips);
  bendHorns(0);
  const jaw = R.pivot(head, ...JAW_AT, 'jaw');
  R.part(jaw, M, jawGeo, 'jaw');
  const eyes = R.pivot(head, 0, EYES_AT[1], EYES_AT[2], 'eyes');
  // the eye mesh is built around the eyes pivot so blinking scales it about its own centre
  R.part(eyes, G, (b) => { b.translate(0, -EYES_AT[1], -EYES_AT[2]); eyesGeo(b); }, 'eyes', true);
  const mouth = R.pivot(head, ...MOUTH_AT, 'mouth');
  const back = R.pivot(body, ...BACK_AT, 'back');

  // wings (raised sails at rest; the right one is a mirrored copy)
  const wings = [];
  for (const s of [1, -1]) {
    const mirror = R.pivot(body, 0, 0, 0, s > 0 ? 'wingL' : 'wingR');
    mirror.scale.x = s;
    const shoulder = R.pivot(mirror, ...WING_AT, 'wing');
    shoulder.rotation.order = 'YXZ';
    R.part(shoulder, M, wingGeo, 'wing');
    wings.push(shoulder);
  }

  // tail chain
  const tails = [];
  let par = R.pivot(body, ...TAIL_AT, 'tail1');
  tails.push(par);
  R.part(par, M, (b) => tailGeo(b, 0), 'tail1');
  for (let i = 1; i < 3; i++) {
    const p = R.pivot(par, 0, TAIL_DY[i - 1], -TAIL_LEN[i - 1], 'tail' + (i + 1));
    R.part(p, M, (b) => tailGeo(b, i), 'tail' + (i + 1));
    tails.push(p); par = p;
  }
  const t4 = R.pivot(par, 0, TAIL_DY[2], -TAIL_LEN[2], 'tip');
  R.part(t4, M, tipGeo, 'tip');
  tails.push(t4);

  // legs
  const legDefs = [
    { n: 'FL', side: 1, hind: false, off: 0 },
    { n: 'FR', side: -1, hind: false, off: Math.PI },
    { n: 'HL', side: 1, hind: true, off: Math.PI },
    { n: 'HR', side: -1, hind: true, off: 0 },
  ];
  const legs = legDefs.map((d) => {
    const at = sub3(legPivot(d.hind, d.side), W.body);
    const p = R.pivot(body, at[0], at[1], at[2], 'leg' + d.n);
    R.part(p, M, (b) => legGeo(b, d.hind, d.side), 'leg' + d.n);
    return { ...d, x: at[0], y: at[1], z: at[2], p, pts: footPoints(d.hind, d.side) };
  });
  const _m0 = new THREE.Matrix4(), _m1 = new THREE.Matrix4(), _v = new THREE.Vector3();

  // ---- animation state -----------------------------------------------------------------------------------------
  const S = {
    time: rnd() * 10, phase: rnd() * TAU, move: 0, run: 0, air: 0, rise: 0, glide: 0, charge: 0, flame: 0, cheer: 0, dead: 0, hurt: 0,
    land: 0, turn: 0, lookYaw: 0, lookPitch: 0, lookTarget: 0, lookPTarget: 0, lookT: 2 + rnd() * 3, blinkT: 1 + rnd() * 2.5, blink: 0,
    flameT: 0, wasFlame: false, tailW: rnd() * 6, spread: 0, breathe: rnd() * 6, boost: -1, hornBend: 0,
  };
  const idleK = opts.still ? 0 : 1;                        // review renders: no idle blink / look-around / breathing / tail sway
  if (opts.still) { S.lookT = 1e9; S.blinkT = 1e9; }

  function update(dt, pose) {
    pose = pose || {};
    dt = clamp(dt || 0, 0, 0.1);
    heal(S);
    const speed = clamp(num(pose.speed), 0, 60);
    const grounded = pose.grounded !== false;
    const vy = clamp(num(pose.vy), -80, 80);
    const dead = !!pose.dead;
    const glideT = !!pose.glide && !grounded && !dead ? 1 : 0;
    const chargeT = !!pose.charge && !dead ? 1 : 0;
    const flameT = !!pose.flame && !dead ? 1 : 0;
    const cheerT = !!pose.cheer && !dead ? 1 : 0;
    const hurt = clamp(pose.hurt || 0, 0, 1);
    const land = clamp(pose.land || 0, 0, 1);
    const turnT = clamp(pose.turn || 0, -1, 1);
    const lookIn = pose.look;

    S.time += dt;
    // "character light": lift the albedo at night so the hero pops. Towards daybreak the boost fades and the red channel is
    // pulled back, otherwise the warm sun turns the purple into hot pink.
    const day = clamp(U.uDay.value);
    const br = lerp(1.30, 0.80, sstep(0, 0.7, day)), bg = lerp(1.30, 1.0, day), bb = lerp(1.30, 1.02, day);
    if (Math.abs(br + bg + bb - S.boost) > 0.006) { S.boost = br + bg + bb; R.boost(br, bg, bb); }
    S.move = damp(S.move, sstep(0.25, 2.5, speed) * (grounded ? 1 : 0), 12, dt);
    S.run = damp(S.run, sstep(5, 12, speed), 8, dt);
    S.air = damp(S.air, grounded ? 0 : 1, 16, dt);
    S.rise = damp(S.rise, clamp(vy / 9, -1, 1), 10, dt);
    S.glide = damp(S.glide, glideT, 8, dt);
    S.charge = damp(S.charge, chargeT, 8, dt);
    S.flame = damp(S.flame, flameT, 11, dt);
    S.cheer = damp(S.cheer, cheerT, 9, dt);
    spring(S, 'dead', dead ? 1 : 0, 110, 12, dt);      // bouncy tumble: overshoots then settles
    S.hurt = damp(S.hurt, hurt, 40, dt);
    S.land = damp(S.land, land, 40, dt);
    S.turn = damp(S.turn, turnT, 9, dt);
    if (flameT && !S.wasFlame) S.flameT = 0;
    S.wasFlame = !!flameT;
    if (flameT) S.flameT += dt;

    const runK = S.run, chargeK = S.charge, airK = S.air, glideK = S.glide, flameK = S.flame, cheerK = S.cheer;
    const deadK = clamp(S.dead, 0, 1), hurtK = S.hurt, landK = S.land, rise = S.rise, turn = S.turn;
    const up = sstep(-0.3, 0.3, rise);      // 0 falling .. 1 rising (smooth, no sign switches)

    // gait phase: stride frequency proportional to speed (capped), faster when charging
    const freq = Math.min(1.5 + speed * 0.24, 3.6) * (1 + 0.25 * chargeK);
    S.phase += TAU * freq * dt * (S.move > 0.02 ? 1 : 0.25);
    const ph = S.phase;
    const gait = S.move * (1 - airK);
    const calm = (1 - gait) * (1 - airK) * (1 - deadK) * idleK;
    S.breathe += dt * (1.6 + 1.6 * runK);
    const breath = Math.sin(S.breathe) * idleK;
    S.tailW += dt * (1.7 + 2.2 * gait);

    // ---- eyes: blink + expression ---------------------------------------------------------------------------------
    S.blinkT -= dt;
    if (S.blinkT <= 0) { S.blink = 0.16; S.blinkT = 2.4 + rnd() * 2.6; if (rnd() < 0.18) S.blinkT = 0.35; }
    let blinkOpen = 1;
    if (S.blink > 0) {
      S.blink -= dt;
      const k = 1 - S.blink / 0.16;
      blinkOpen = clamp(k < 0.4 ? 1 - (k / 0.4) * 0.92 : 0.08 + 0.92 * ((k - 0.4) / 0.6), 0.08, 1);
    }
    const squint = clamp(0.32 * chargeK + 0.5 * hurtK + 0.25 * flameK + 0.12 * cheerK + 0.85 * deadK, 0, 0.9);
    eyes.scale.set(1 + 0.06 * hurtK, blinkOpen * (1 - squint) * (1 + 0.05 * airK), 1);

    // ---- head look ------------------------------------------------------------------------------------------------
    S.lookT -= dt;
    if (S.lookT <= 0) {
      S.lookT = 2.5 + rnd() * 3.5;
      S.lookTarget = (rnd() - 0.5) * 1.1;
      S.lookPTarget = (rnd() - 0.5) * 0.25;
    }
    const asked = lookIn !== undefined && Math.abs(lookIn) > 0.02;      // look = 0 (the game's default) means "no request"
    const lookTarget = asked ? clamp(lookIn, -1, 1) * 0.75 : S.lookTarget * calm;
    S.lookYaw = damp(S.lookYaw, lookTarget, 5, dt);
    S.lookPitch = damp(S.lookPitch, asked ? 0 : S.lookPTarget * calm, 4, dt);

    // ---- body ---------------------------------------------------------------------------------------------------
    const recoil = flameK * Math.exp(-S.flameT * 7);
    const bobA = (lerp(0.010, 0.034, runK) + 0.04 * chargeK) * gait;
    const bob = Math.sin(2 * ph + 0.6) * bobA;
    const noseDown = 0.05 * runK + 0.22 * chargeK + 0.27 * glideK - 0.14 * flameK - 0.26 * recoil - 0.16 * airK * (1 - glideK) * rise
      - 0.34 * hurtK - 0.05 * cheerK + 0.16 * landK + 0.02 * Math.sin(2 * ph) * gait;
    const roll = 0.22 * turn * (1 - 0.4 * glideK) + glideK * turn * 0.35 + 0.03 * Math.sin(ph) * gait;
    body.rotation.set(noseDown, 0, roll);
    const shake = hurtK * Math.sin(S.time * 55) * 0.045;
    body.position.set(shake, BODY_Y + bob - 0.03 * chargeK - 0.035 * flameK + 0.006 * breath * calm - 0.03 * landK - 0.03 * airK * glideK,
      -0.15 * recoil - 0.02 * hurtK);
    const chest = 0.018 * breath * calm + 0.07 * flameK * (S.flameT < 0.4 ? 1 - Math.exp(-S.flameT * 6) : 0.6);
    body.scale.set(1 + chest * 0.6, 1 + chest, 1 + chest * 0.6);

    // rig squash (about the ground): landing + hurt + run bounce
    const sq = 0.30 * landK + 0.16 * hurtK;
    R.rig.scale.set(1 + sq * 0.45, 1 - sq, 1 + sq * 0.45);
    const hop = cheerK * Math.abs(Math.sin(S.time * TAU * 1.5)) * 0.32;
    const roll90 = (Math.PI / 2) * S.dead;       // spring position: overshoots a little
    R.rig.rotation.set(0, 0, -roll90);
    R.rig.position.set(0.36 * Math.sin(roll90), hop + 0.48 * Math.sin(roll90), 0);

    // ---- head + jaw ---------------------------------------------------------------------------------------------
    const headPitch = -noseDown * 0.85 + CHARGE_HEAD * chargeK - 0.55 * flameK - 0.25 * glideK - 0.22 * cheerK + 0.05 * Math.sin(2 * ph + 1.0) * gait
      - 0.28 * hurtK + 0.1 * landK + S.lookPitch - 0.10 * airK * Math.max(0, rise) + 0.15 * airK * Math.max(0, -rise) - 0.15 * recoil
      - 0.02 * breath * calm;
    head.rotation.set(headPitch + HEAD_TILT, S.lookYaw + 0.30 * turn + shake * 2, -0.06 * S.lookYaw + 0.12 * Math.sin(S.time * 3) * cheerK);
    head.position.set(HEAD_AT[0], HEAD_AT[1] + 0.01 * breath * calm, HEAD_AT[2]);
    const hornK = chargeK < 5e-4 ? 0 : chargeK;         // the horns bend with the charge (and are only rewritten while it changes)
    if (hornK !== S.hornBend && (hornK === 0 || Math.abs(hornK - S.hornBend) > 2e-4)) { S.hornBend = hornK; bendHorns(hornK); }
    const pant = (0.03 + 0.05 * runK) * (0.5 + 0.5 * Math.sin(2 * ph)) * gait;
    jaw.rotation.set(0.015 + pant + 0.62 * flameK + 0.26 * cheerK + 0.20 * hurtK + 0.05 * airK + 0.18 * deadK + 0.12 * glideK, 0, 0);

    // ---- wings ------------------------------------------------------------------------------------------------
    // rest = the raised sails; spreading rolls each wing about its root out to the side (a swept, nearly level glider wing)
    const spreadT = clamp(0.5 * airK * (1 - glideK) * lerp(1.1, 0.85, up) + glideK + 0.35 * flameK + 0.85 * cheerK + 0.55 * deadK + 0.45 * hurtK, 0, 1);
    S.spread = damp(S.spread, spreadT, 14, dt);
    const sp = S.spread;
    const flutter = Math.sin(S.time * TAU * 5.5) * 0.09 * glideK + Math.sin(S.time * TAU * 3.2) * 0.75 * cheerK * (1 - deadK)
      + Math.sin(S.time * TAU * 2.4) * 0.35 * airK * (1 - glideK) * lerp(1, 0.6, up);
    const jiggle = -bob * 5 * (1 - sp) + 0.03 * Math.sin(S.time * 1.3 + 1) * calm;
    for (let i = 0; i < 2; i++) {
      wings[i].rotation.set(lerp(0, 0.10, sp), lerp(0, 0.10, sp), lerp(0, -1.05, sp) + flutter + jiggle + 0.4 * deadK);
      wings[i].scale.setScalar(1);
    }

    // ---- tail ---------------------------------------------------------------------------------------------------
    // pitch is cumulative down the chain: the idle shape droops gently to the orange tip; states add a total lift.
    const shapeK = 1 - 0.75 * clamp(gait + chargeK + glideK + flameK);
    const tailTotal = 0.30 * runK * gait + 0.28 * chargeK + 0.55 * flameK + 0.06 * glideK + 0.45 * cheerK + 0.18 * hurtK
      + airK * (1 - glideK) * lerp(0.45, -0.30, up);
    const idleShape = [0, 0, 0, 0];
    const wgt = [0.30, 0.30, 0.25, 0.15];
    const ampY = [0.10, 0.16, 0.22, 0.28];
    for (let i = 0; i < 4; i++) {
      const lag = i * 0.85;
      const idleW = Math.sin(S.tailW - lag) * ampY[i] * (0.9 - 0.5 * gait) * (1 - 0.6 * glideK) * idleK;
      const runW = Math.sin(ph + Math.PI - lag * 0.5) * ampY[i] * 0.55 * gait;
      const cheerW = Math.sin(S.time * TAU * 2.6 - lag) * ampY[i] * 1.6 * cheerK;
      const glideW = Math.sin(S.time * TAU * 3 - lag * 1.2) * ampY[i] * 0.5 * glideK;
      const turnW = -turn * [0.14, 0.2, 0.26, 0.3][i] * (1 + glideK);
      const deadW = 0.5 * deadK * (i + 1) / 4;
      const pitch = idleShape[i] * shapeK + tailTotal * wgt[i]
        + 0.05 * Math.sin(S.tailW * 1.3 - lag) * calm - 0.25 * deadK * wgt[i] * 2 + 0.05 * Math.sin(2 * ph - lag) * gait;
      tails[i].rotation.set(pitch, idleW + runW + cheerW + glideW + turnW + deadW, 0);
    }

    // ---- legs ---------------------------------------------------------------------------------------------------
    const swingA = lerp(0.40, 0.62, runK) * (1 + 0.15 * chargeK);
    for (const L of legs) {
      const th = ph + L.off;
      const swing = (Math.sin(th) * swingA + (L.hind ? 0.0 : lerp(-0.10, -0.16, runK))) * gait;
      const lift = Math.max(0, Math.cos(th)) * gait * lerp(0.035, 0.085, runK);
      const front = !L.hind;
      const airNormal = front ? lerp(-0.75, -0.55, up) : lerp(0.45 + 0.1 * Math.sin(S.time * 9), 0.75, up);
      const airRot = lerp(airNormal, front ? -0.25 : 0.95, glideK);
      let rx = lerp(swing, airRot, airK);
      if (flameK > 0.01) rx += front ? -0.22 * flameK : 0.12 * flameK;
      if (front) rx += -0.9 * cheerK * (0.5 + 0.5 * Math.sin(S.time * TAU * 1.5 + (L.n === 'FL' ? 0 : 1)));
      const side = L.x > 0 ? 1 : -1;
      const splay = side * (0.22 * landK + 0.45 * deadK + 0.10 * flameK + 0.06 * chargeK);
      L.p.rotation.set(rx - 0.25 * deadK * (front ? 1 : -1), 0, splay);
      L.p.position.set(L.x, L.y + lift * (1 - airK) + 0.03 * airK * glideK - 0.02 * landK, L.z);
    }
    // ground contact: whatever the body does (bob, pitch, squash) the soles never sink below the root's ground plane —
    // the leg telescopes into the body instead (its top is buried in the torso anyway)
    R.rig.updateMatrix(); body.updateMatrix();
    _m0.multiplyMatrices(R.rig.matrix, body.matrix);
    const vs = Math.max(0.3, R.rig.scale.y * body.scale.y);
    for (const L of legs) {
      L.p.updateMatrix();
      _m1.multiplyMatrices(_m0, L.p.matrix);
      let mn = 1e9;
      for (const q of L.pts) { _v.set(q[0], q[1], q[2]).applyMatrix4(_m1); if (_v.y < mn) mn = _v.y; }
      if (mn < 0) L.p.position.y += Math.min(0.30, -mn / vs) * (1 - deadK);
    }

    if (pose.flash !== undefined) R.flash(clamp(pose.flash, 0, 1));
  }

  const testPoses = {
    idle: {},
    walk: { speed: 4 },
    run: { speed: 16 },
    jump: { grounded: false, vy: 7, speed: 6 },
    fall: { grounded: false, vy: -9, speed: 6 },
    glide: { grounded: false, glide: true, vy: -2, speed: 14 },
    charge: { speed: 22, charge: true },
    ramjump: { speed: 22, charge: true, grounded: false, vy: 3 },
    flame: { flame: true },
    hurt: (t) => { const k = (t % 1.6) / 0.7; const h = k < 1 ? 1 - k : 0; return { hurt: h, flash: h > 0.5 ? 1 : 0, t }; },
    dead: { dead: true },
    cheer: { cheer: true },
    land: (t) => { const k = (t % 1.5) / 0.4; return { land: k < 1 ? 1 - k : 0, t }; },
  };

  /** World position of the mouth for a root placed at (x, y, z) facing yaw — where the fire breath starts. */
  const _mw = new THREE.Vector3();
  function mouthWorld(x, y, z, yaw, out) {
    R.root.position.set(x, y, z);
    R.root.rotation.y = yaw;
    R.root.updateMatrixWorld(true);          // (the game's render sync re-places the root every frame, so this is only a probe)
    mouth.getWorldPosition(_mw);
    if (Number.isFinite(_mw.x + _mw.y + _mw.z)) { out.x = _mw.x; out.y = _mw.y; out.z = _mw.z; }
    return out;
  }

  return {
    root: R.root,
    mouthWorld,
    radius: 0.55,
    height: 1.05,
    anchors: { mouth, back, hornL: hornTips[0], hornR: hornTips[1] },
    testPoses,
    update,
    flash: (k) => R.flash(k),
    dispose: () => R.dispose(),
    get triangleCount() { return R.triangleCount; },
  };
}
