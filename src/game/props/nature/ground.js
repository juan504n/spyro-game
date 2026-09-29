// Ground cover: flower / tuft / fern patches, reeds, lilypads, logs, stumps, mushrooms.
import { lump, lumps, tube, shade, card, cross, flat, TAU, lerp, clamp, mulc, h3, num, int, oneOf } from './util.js';

const FLOWERS = ['flower_pink', 'flower_yellow', 'flower_blue'];
const CUT = { mode: 'cutout', double: true, sway: true };

/** Random point in a disc (uniform), deterministic from rng. */
function inDisc(r, rad) {
  const a = r.float(0, TAU), d = rad * Math.sqrt(r.next());
  return [Math.cos(a) * d, Math.sin(a) * d];
}

/** Poisson-ish scatter: rejection-sample `count` points at least `minD` apart inside radius rad. */
function scatter(r, count, rad, minD) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    let best = null, bestD = -1;
    for (let t = 0; t < 6; t++) {
      const p = inDisc(r, rad);
      let dmin = 1e9;
      for (const q of pts) dmin = Math.min(dmin, Math.hypot(p[0] - q[0], p[1] - q[1]));
      if (dmin > bestD) { bestD = dmin; best = p; }
      if (dmin >= minD) break;
    }
    pts.push(best);
  }
  return pts;
}

/** Tint variety for cutout foliage: tiny hue/value shifts so patches do not look stamped. */
const vary = (r, base = 1, spread = 0.1) => {
  const v = base + r.float(-spread, spread);
  return [v * r.float(0.96, 1.06), v, v * r.float(0.94, 1.04)];
};

/** Meadow flowers (pink / yellow / blue) sprinkled among grass tufts. */
export function flowerPatch(kit, { x, z, rot = 0, scale = 1, y, r: rad, count, tufts, kinds }) {
  rad = num(rad, 3, 0.5, 14); count = int(count, 14, 1, 40); tufts = tufts !== false;
  kinds = Array.isArray(kinds) ? kinds.filter((k) => FLOWERS.includes(k)) : [];
  if (!kinds.length) kinds = FLOWERS;
  const r = kit.rng(x, z, 83);
  kit.at(x, z, { rot, scale, y }, () => {
    const pts = scatter(r, count, rad, 0.75);
    pts.forEach((p, i) => {
      const k = kinds[Math.floor(r.next() * kinds.length)];
      const s = r.float(0.7, 1.0);
      cross(kit.b(k, CUT), p[0], -0.05, p[1], 0.72 * s, 0.78 * s, r.float(0, 3), { color: vary(r, 1.12, 0.06) });
    });
    if (tufts) {
      const n = Math.round(count * 0.45);
      scatter(r, n, rad * 1.05, 0.9).forEach((p) => {
        const s = r.float(0.8, 1.2);
        cross(kit.b('tuft', CUT), p[0], -0.05, p[1], 1.1 * s, 0.95 * s, r.float(0, 3), { color: vary(r, 1.0, 0.1) });
      });
    }
  });
}

/** Clumps of tall grass. */
export function tuftPatch(kit, { x, z, rot = 0, scale = 1, y, r: rad, count, teal }) {
  rad = num(rad, 2.6, 0.5, 14); count = int(count, 12, 1, 40); teal = !!teal;
  const r = kit.rng(x, z, 89);
  kit.at(x, z, { rot, scale, y }, () => {
    scatter(r, count, rad, 0.8).forEach((p) => {
      const s = r.float(0.75, 1.3);
      const tint = teal ? [0.85, 1.05, 1.0] : vary(r, 1.0, 0.1);
      cross(kit.b('tuft', CUT), p[0], -0.05, p[1], 1.15 * s, 1.0 * s, r.float(0, 3), { color: tint });
    });
  });
}

/** Fern rosettes: fronds arching out from a centre. */
export function fernPatch(kit, { x, z, rot = 0, scale = 1, y, r: rad, count }) {
  rad = num(rad, 2.4, 0.5, 14); count = int(count, 3, 1, 10);
  const r = kit.rng(x, z, 97);
  kit.at(x, z, { rot, scale, y }, () => {
    const centres = count === 1 ? [[0, 0]] : scatter(r, count, rad, 1.7);
    centres.forEach((c) => {
      const nF = 5 + r.int(0, 2);
      const a0 = r.float(0, TAU);
      const s = r.float(0.85, 1.2);
      for (let i = 0; i < nF; i++) {
        const a = a0 + (i / nF) * TAU + r.float(-0.2, 0.2);
        card(kit.b('fern', CUT), c[0] + Math.sin(a) * 0.15, -0.05, c[1] + Math.cos(a) * 0.15, 1.5 * s, 1.5 * s, a, { lean: r.float(0.65, 0.95), color: vary(r, 1.02, 0.08) });
      }
    });
  });
}

/** Cattail reeds: crossed cards standing at the water's edge (pass y for a pond's edge level). */
export function reeds(kit, { x, z, rot = 0, scale = 1, y, r: rad, count }) {
  rad = num(rad, 2, 0.5, 14); count = int(count, 8, 1, 30);
  const r = kit.rng(x, z, 101);
  kit.at(x, z, { rot, scale, y }, () => {
    scatter(r, count, rad, 0.6).forEach((p) => {
      const s = r.float(0.8, 1.25);
      cross(kit.b('reeds', CUT), p[0], -0.1, p[1], 1.05 * s, 2.5 * s, r.float(0, 3), { color: vary(r, 1.0, 0.08) });
    });
  });
}

/** Lilypads floating at y (pass the water level). Some carry a blossom. */
export function lilypads(kit, { x, z, rot = 0, scale = 1, y, r: rad, count }) {
  rad = num(rad, 3.5, 0.8, 14); count = int(count, 8, 1, 24);
  const r = kit.rng(x, z, 103);
  kit.at(x, z, { rot, scale, y }, () => {
    const pad = kit.b('lilypad', { mode: 'cutout', double: true });
    scatter(r, count, rad, 1.9).forEach((p, i) => {
      const s = r.float(1.3, 2.1);
      flat(pad, p[0], 0.09, p[1], s, r.float(0, TAU), { color: vary(r, 1.0, 0.08) });
      if (i % 4 === 1) card(kit.b('flower_pink', CUT), p[0], 0.09, p[1], 0.7, 0.7, r.float(0, 3), { lean: 0, color: [1.15, 1.1, 1.1] });
    });
  });
}

/** A fallen log lying along local x (len 5-7), with moss and a couple of stubs. */
export function fallenLog(kit, { x, z, rot = 0, scale = 1, y, len, pale }) {
  len = num(len, 6.2, 3, 12); pale = !!pale;
  const r = kit.rng(x, z, 107);
  const L = len * r.float(0.92, 1.08);
  const R0 = r.float(0.62, 0.78);
  kit.at(x, z, { rot, scale, y }, () => {
    const bark = kit.b(pale ? 'bark_pale' : 'bark');
    const cy = R0 * 0.82;
    const col = shade(-0.2, [0.66, 0.6, 0.64], R0 * 2, [1.16, 1.06, 1.0], 0.04);
    const pts = [[-L / 2, cy, 0], [-L * 0.2, cy + 0.05, r.float(-0.15, 0.15)], [L * 0.2, cy, r.float(-0.15, 0.15)], [L / 2, cy + 0.08, 0]];
    // axis along +x: the tube's frames follow the polyline
    tube(bark, pts, [R0 * 1.05, R0, R0 * 0.94, R0 * 0.85], { segs: 6, tile: 3, color: col, capStart: 'flat', capEnd: 'flat', aspect: 0.5 });
    // stubs
    for (let i = 0; i < 2; i++) {
      const t = r.float(-0.3, 0.3) * L, side = i ? 1 : -1;
      tube(bark, [[t, cy + R0 * 0.6, side * R0 * 0.55], [t + r.float(-0.3, 0.3), cy + R0 * 1.4, side * R0 * 1.15]], [R0 * 0.28, R0 * 0.15], { segs: 4, tile: 3, color: col, capEnd: 'flat' });
    }
    // moss on top
    const moss = kit.b('moss');
    for (let i = 0; i < 2; i++) {
      const t = (i ? 0.22 : -0.24) * L;
      lump(moss, r, [t, cy + R0 * 0.72, r.float(-0.1, 0.1)], R0 * 0.85, { detail: 'o1', noise: 0.15, sy: 0.4, sx: 1.5, sz: 0.85, tile: 3, smooth: 0.3, skipDown: 0.05, color: shade(0, [0.9, 1.0, 0.8], 2, [1.0, 1.14, 0.86], 0.05) });
    }
    kit.box(0, 0, L / 2, R0 * 0.95, 0, R0 * 1.75, { top: true });
    kit.caster(0, 0, R0 * 1.5, R0 * 2, 0.3);
  });
}

/** Cut tree stump with a mossy top and root flare. */
export function stump(kit, { x, z, rot = 0, scale = 1, y, pale }) {
  pale = !!pale;
  const r = kit.rng(x, z, 109);
  const R0 = r.float(0.95, 1.25), H = r.float(1.0, 1.5);
  kit.at(x, z, { rot, scale, y }, () => {
    const bark = kit.b(pale ? 'bark_pale' : 'bark');
    const col = shade(-0.2, [0.5, 0.46, 0.5], H, [1.02, 0.96, 0.92], 0.04);
    tube(bark, [[0, -0.4, 0], [0, 0.3, 0], [0.04, H, 0.02]], [R0 * 1.35, R0 * 1.06, R0 * 0.9], { segs: 7, tile: 3, color: col, capEnd: 'flat', capLen: 0 });
    const a0 = r.float(0, TAU);
    for (let i = 0; i < 3; i++) {
      const a = a0 + (i / 3) * TAU + r.float(-0.4, 0.4), c = Math.cos(a), s = Math.sin(a);
      tube(bark, [[c * R0 * 0.75, 0.55, s * R0 * 0.75], [c * (R0 + 1.0), -0.2, s * (R0 + 1.0)]], [R0 * 0.4, 0], { segs: 4, tile: 3, color: col });
    }
    // moss cap slightly above the cut
    lump(kit.b('moss'), r, [0, H + 0.02, 0], R0 * 0.85, { detail: 'o1', noise: 0.08, sy: 0.16, tile: 3, smooth: 0.3, skipDown: 0.05, color: [0.95, 1.1, 0.85] });
    kit.cyl(0, 0, R0 * 0.95, 0, H, { top: true });
    kit.caster(0, 0, R0, H + 0.4, 0.3);
  });
}

function lineup(kit, { x, z }) {
  flowerPatch(kit, { x: x - 18, z });
  tuftPatch(kit, { x: x - 11, z });
  fernPatch(kit, { x: x - 5, z });
  reeds(kit, { x: x + 1, z });
  lilypads(kit, { x: x + 8, z, y: 3.2 });
  fallenLog(kit, { x: x + 17, z });
  stump(kit, { x: x + 25, z });
}

export const GROUND = {
  flower_patch: { fn: flowerPatch, size: 6, note: 'meadow flowers (pink/yellow/blue) + tufts, sway; r, count, tufts, kinds', defaults: { r: 3, count: 14 } },
  tuft_patch: { fn: tuftPatch, size: 5, note: 'clumps of tall grass; r, count, teal', defaults: { r: 2.6, count: 12 } },
  fern_patch: { fn: fernPatch, size: 5, note: 'fern rosettes; r, count', defaults: { r: 2.4, count: 3 } },
  reeds: { fn: reeds, size: 4, note: 'cattail reeds at the water edge (pass y = shore level); r, count', defaults: { r: 2, count: 8 } },
  lilypads: { fn: lilypads, size: 7, note: 'lilypads on the water (PASS y = water level); r, count', defaults: { r: 3.5, count: 8 } },
  fallen_log: { fn: fallenLog, size: 7, note: 'fallen log along local x with moss, walkable top; len', defaults: { len: 6.2 } },
  stump: { fn: stump, size: 3.4, note: 'tree stump with mossy top, walkable', defaults: {} },
  _ground: { fn: lineup, size: 80, note: 'dev lineup' },
};
