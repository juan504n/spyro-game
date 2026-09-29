// Houses: cottage (4 variants), long hall, round house.
import {
  PI, TAU, clamp, lerp, mixc, mulc, TINT, vgrad, grid, fan, quadUV, cells, frustum, FACE, onFace, roofGable, pick,
} from './common.js';
import { lanternWall, chimneyStack, windowUnit, doorUnit, porch, porchGable, cupola } from './details.js';

// ---------------------------------------------------------------------------------------------------------------
// Generic gabled house.  Built in an "L-frame": ridge along +X, span along Z, then rotated into the prop frame.
//   ridge 'x' : L = prop X extent, S = prop Z extent, front (+Z) is a long eave side       (house_long)
//   ridge 'z' : L = prop Z extent, S = prop X extent, front (+Z) is a gable end            (cottages)
// ---------------------------------------------------------------------------------------------------------------

// prop-frame face -> L-frame face
const FACEMAP = {
  x: { front: '+z', back: '-z', right: '+x', left: '-x' },
  z: { front: '+x', back: '-x', right: '-z', left: '+z' },
};

/**
 * spec: {
 *  ridge, L, S, Hw, base, slope,
 *  bands: [{ tex, y1, tint, timber?, panel?, tile? }]  // bottom to top; the last band reaches Hw and carries the gables
 *  roof: { tex, tint, ...roofGable opts }, plinthTex, plinthTint,
 *  features: [{ face:'front'|'back'|'left'|'right', u, y, kind:'window'|'door'|'lantern'|'custom', glow?:{...} }],
 *  chimney: { x, z, sx, sz, tex, above }   (L-frame coords)
 * }
 */
export function gableHouse(kit, spec) {
  const { ridge, L, S, Hw, base = 0.5, slope = 1.05 } = spec;
  const theta = ridge === 'x' ? 0 : -PI / 2;
  const fm = FACEMAP[ridge];
  const bands = spec.bands;
  const info = { theta };
  const cs = Math.cos(theta), sn = Math.sin(theta);
  const toProp = (xl, zl) => [xl * cs + zl * sn, -xl * sn + zl * cs];
  info.toProp = toProp;
  kit.xf.push();
  if (theta) kit.xf.rotateY(theta);

  // ---- plinth (stone foundation, sunk below ground so slopes never show a gap)
  {
    const pb = kit.b(spec.plinthTex || 'brick');
    const ptint = spec.plinthTint || [1.0, 0.93, 0.92];
    const h = base + 0.9, cy = (base - 0.9) / 2;
    const hl = L / 2 + 0.22, hs = S / 2 + 0.22;
    pb.box(0, cy, 0, 2 * hl, h, 2 * hs, { tile: 3.2, faces: ['+z', '-z', '+x', '-x', '+y'], color: vgrad(-0.9, mulc(ptint, 0.6), base, ptint), emissive: 0.2 });
  }

  // ---- wall bands
  let yb = base;
  const nxL = cells(L, 3), nxS = cells(S, 3);
  const faces = [
    { f: '+z', O: [-L / 2, 0, S / 2], U: [1, 0, 0], len: L, nx: nxL },
    { f: '-z', O: [L / 2, 0, -S / 2], U: [-1, 0, 0], len: L, nx: nxL },
    { f: '+x', O: [L / 2, 0, S / 2], U: [0, 0, -1], len: S, nx: nxS, gable: true },
    { f: '-x', O: [-L / 2, 0, -S / 2], U: [0, 0, 1], len: S, nx: nxS, gable: true },
  ];
  bands.forEach((band, bi) => {
    const top = band.y1 ?? Hw;
    const last = bi === bands.length - 1;
    const wb = kit.b(band.tex);
    const panel = band.panel || 2.7;
    const bt = band.tint || TINT.white;
    for (const F of faces) {
      const nu = band.timber ? Math.max(1, Math.round(F.len / panel)) : F.len / (band.tile || 3.0);
      const nv = band.timber ? Math.max(1, Math.round((top - yb) / panel)) : (top - yb) / (band.tile || 3.0);
      const ny = cells(top - yb, 2.8);
      const colr = last ? vgrad(top - 1.6, bt, top, mulc(bt, 0.8)) : vgrad(yb, mulc(bt, bi === 0 ? 0.82 : 0.95), yb + 1.8, bt);
      grid(wb, [F.O[0], yb, F.O[2]], [F.U[0] * F.len, 0, F.U[2] * F.len], [0, top - yb, 0], F.nx, ny, { nu, nv, color: colr, emissive: spec.lift ?? 0.24 });
      if (last && F.gable) {
        // gable triangle up to the roof underside, fan from the apex so it shares the wall's top-edge vertices
        const apexY = Hw + slope * (S / 2);
        const pts = [[F.O[0] + F.U[0] * F.len / 2, apexY, F.O[2] + F.U[2] * F.len / 2]];
        for (let i = 0; i <= F.nx; i++) pts.push([F.O[0] + F.U[0] * F.len * i / F.nx, Hw, F.O[2] + F.U[2] * F.len * i / F.nx]);
        const uvOf = (p) => {
          const s = ((p[0] - F.O[0]) * F.U[0] + (p[2] - F.O[2]) * F.U[2]) / F.len;
          return [nu * s, nv * (p[1] - yb) / (top - yb)];
        };
        fan(wb, pts, uvOf, { color: vgrad(Hw - 0.5, mulc(bt, 0.88), Hw + 3.6, bt), emissive: spec.lift ?? 0.24 });
      }
    }
    yb = top;
  });

  // ---- floor beam between bands (jetty-style ledge)
  if (spec.beam !== undefined) {
    kit.b('wood_plank').box(0, spec.beam, 0, L + 0.5, 0.36, S + 0.5, { tile: 2.4, color: TINT.warm, faces: ['+z', '-z', '+x', '-x', '+y', '-y'] });
  }

  // ---- roof
  const rinfo = roofGable(kit, { L, S, Hw, slope, ...spec.roof });
  Object.assign(info, rinfo);

  // ---- wall features
  for (const ft of spec.features || []) {
    const lf = fm[ft.face];
    const dist = lf === '+z' || lf === '-z' ? S / 2 : L / 2;
    const yy = ft.kind === 'door' ? base : (ft.y ?? base);
    if (ft.kind === 'window') onFace(kit.xf, lf, dist, ft.u, ft.y, () => windowUnit(kit, ft));
    else if (ft.kind === 'door') onFace(kit.xf, lf, dist, ft.u, base, () => doorUnit(kit, { ...ft, base }));
    else if (ft.kind === 'lantern') onFace(kit.xf, lf, dist, ft.u, ft.y, () => lanternWall(kit, ft));
    else if (ft.kind === 'custom') onFace(kit.xf, lf, dist, ft.u, yy, () => ft.fn(kit));
    if (ft.glow) info.glows = (info.glows || []).concat([{ lf, dist, u: ft.u, y: ft.y ?? base + 2, ...ft.glow }]);
  }

  // ---- chimney(s)
  for (const c of [].concat(spec.chimney || [])) {
    const top = rinfo.ytR + (c.above ?? 1.6);
    chimneyStack(kit, { ...c, top, y0: Hw - 1 });
    info.chimneyTops = (info.chimneyTops || []).concat([[...toProp(c.x ?? 0, c.z ?? 0), top + 0.4]]);
  }
  if (spec.cupola) cupola(kit, spec.cupola.x ?? 0, spec.cupola.z ?? 0, rinfo.ytR, spec.cupola);
  kit.xf.pop();
  return info;
}

/** Register the glow points recorded by gableHouse (must run outside the rotated frame, i.e. prop-local). */
export function houseGlows(kit, info, S, L) {
  for (const g of info.glows || []) {
    const F = FACE[g.lf];
    const n = g.out ?? 0.7;
    const [px, pz] = info.toProp(F.N[0] * (g.dist + n) + F.U[0] * g.u, F.N[2] * (g.dist + n) + F.U[2] * g.u);
    kit.glow(px, g.y, pz, { color: g.color || [1, 0.72, 0.36], size: g.size ?? 3.4, pool: g.pool ?? 0, flicker: g.flicker || 0 });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Colliders in the prop frame
// ---------------------------------------------------------------------------------------------------------------
export function houseCollider(kit, { ridge, L, S, Hw, ytR }) {
  const hx = ridge === 'x' ? L / 2 : S / 2, hz = ridge === 'x' ? S / 2 : L / 2;
  kit.box(0, 0, hx + 0.1, hz + 0.1, -1, Hw + 0.4, { tag: 'wall' });
  // roof volume: narrower block so Spyro cannot glide into the middle of the roof
  const rs = ridge === 'x' ? [hx + 0.1, hz * 0.6] : [hx * 0.6, hz + 0.1];
  kit.box(0, 0, rs[0], rs[1], Hw + 0.4, ytR + 0.3, { tag: 'roof' });
}

// ---------------------------------------------------------------------------------------------------------------
// house_cottage
// ---------------------------------------------------------------------------------------------------------------
const SHUT = [TINT.teal, TINT.coral, [0.78, 0.58, 1.0], [0.55, 0.92, 0.8]];
const FLOWERS = [[[1.0, 0.45, 0.4], [1.0, 0.85, 0.35]], [[0.75, 0.55, 1.0], [1.0, 0.6, 0.7]], [[1.0, 0.85, 0.35], [0.5, 0.8, 1.0]]];

export function houseCottage(kit, p) {
  const { x, z, rot = 0, scale = 1, y, variant = 0 } = p;
  const w = clamp(p.w ?? 8, 7, 9.3), d = clamp(p.d ?? 7, 6, 10);      // layout assumes 3 panel columns on the front
  const v = ((Math.round(variant) % 4) + 4) % 4;
  const rng = kit.rng(x, z, 11 + v);
  kit.at(x, z, { rot, scale, y }, () => {
    const S = w, L = d;
    const shut = SHUT[(v + (rng.next() < 0.5 ? 1 : 0)) % 4];
    const fl = FLOWERS[v % 3];
    const pw = S / Math.max(1, Math.round(S / 2.7));       // panel width on the front (gable) face
    const uc = [-pw, 0, pw];
    const feats = [];
    let spec;
    const glowWin = { pool: 3, size: 3.6 };
    if (v === 0) {
      // half-timbered, red scallop roof, door centred
      const Hw = 5.4;
      feats.push({ face: 'front', kind: 'door', u: 0 });
      for (const i of [0, 2]) {
        feats.push({ face: 'front', kind: 'window', u: uc[i], y: 2.5, shutter: shut, shutterL: i === 2, shutterR: i === 0, flowers: true, palette: fl, glow: i === 0 ? glowWin : null });
        feats.push({ face: 'front', kind: 'window', u: uc[i], y: 4.7, shutter: shut, shutterL: i === 2, shutterR: i === 0 });
      }
      feats.push({ face: 'front', kind: 'window', u: 0, y: 5.15, w: 1.2, h: 1.2 });
      feats.push({ face: 'front', kind: 'lantern', u: 1.6, y: 2.75, glow: { pool: 3.4, size: 3 } });
      feats.push({ face: 'left', kind: 'window', u: 0, y: 3.0, shutter: shut });
      feats.push({ face: 'right', kind: 'window', u: 0, y: 3.0, shutter: shut });
      feats.push({ face: 'back', kind: 'window', u: 0, y: 3.0, shutter: shut });
      spec = {
        ridge: 'z', L, S, Hw, base: 0.5, slope: 1.0,
        bands: [{ tex: 'timber', timber: true, tint: [1.12, 1.06, 1.0] }],
        roof: { tex: 'roof_red', oe: 0.8, og: 0.65, T: 0.34 },
        features: feats, chimney: { x: L / 4, z: 0, sx: 1.3, sz: 1.3, tex: 'brick' },
      };
    } else if (v === 1) {
      // stone ground floor, plaster upper floor, teal slate roof, porch over a right-hand door
      const Hw = 5.6;
      feats.push({ face: 'front', kind: 'door', u: uc[2] });
      feats.push({ face: 'front', kind: 'custom', u: uc[2], fn: (k) => porch(k, { w: 2.7, d: 1.5, y: 3.95, tex: 'roof_teal' }) });
      feats.push({ face: 'front', kind: 'window', u: uc[0], y: 2.0, w: 1.2, h: 1.2, shutter: shut, shutterL: true, shutterR: false, flowers: true, palette: fl, glow: glowWin });
      feats.push({ face: 'front', kind: 'window', u: uc[1], y: 2.0, w: 1.2, h: 1.2, shutter: shut, shutterL: false, shutterR: true, flowers: true, palette: fl });
      for (const i of [0, 1, 2]) feats.push({ face: 'front', kind: 'window', u: uc[i], y: 5.0, shutter: shut, shutterL: i === 0, shutterR: i === 2 });
      feats.push({ face: 'front', kind: 'lantern', u: uc[2] - 1.65, y: 2.4, glow: { pool: 3.4, size: 3 } });
      feats.push({ face: 'left', kind: 'window', u: 0, y: 4.3 });
      feats.push({ face: 'right', kind: 'window', u: 0, y: 4.3 });
      feats.push({ face: 'back', kind: 'window', u: -1.5, y: 2.0, w: 1.2, h: 1.2, shutter: shut });
      feats.push({ face: 'back', kind: 'window', u: 1.5, y: 4.8, shutter: shut });
      spec = {
        ridge: 'z', L, S, Hw, base: 0.5, slope: 1.12,
        bands: [
          { tex: 'brick', y1: 3.1, tint: [1.0, 0.98, 1.08] },
          { tex: 'plaster', tint: [1.14, 1.06, 1.02], tile: 2.9 },
        ],
        roof: { tex: 'roof_teal', oe: 0.9, og: 0.7, T: 0.34 },
        features: feats, chimney: { x: -L / 4, z: 0, sx: 1.3, sz: 1.3, tex: 'brick_warm' },
        beam: 3.1,
      };
    } else if (v === 2) {
      // warm brick cottage with a fat thatched roof, door on the left
      const Hw = 5.0;
      feats.push({ face: 'front', kind: 'door', u: uc[0] });
      feats.push({ face: 'front', kind: 'window', u: uc[1], y: 2.4, w: 1.2, h: 1.2, shutter: shut, flowers: true, palette: fl, glow: glowWin });
      feats.push({ face: 'front', kind: 'window', u: uc[2], y: 2.4, w: 1.2, h: 1.2, shutter: shut, shutterL: false, shutterR: true });
      feats.push({ face: 'front', kind: 'window', u: uc[0], y: 5.4, w: 1.1, h: 1.1 });
      feats.push({ face: 'front', kind: 'window', u: uc[2], y: 5.4, w: 1.1, h: 1.1 });
      feats.push({ face: 'front', kind: 'lantern', u: uc[0] + 1.6, y: 2.75, glow: { pool: 3.4, size: 3 } });
      feats.push({ face: 'left', kind: 'window', u: 0, y: 2.8, w: 1.2, h: 1.2, shutter: shut });
      feats.push({ face: 'right', kind: 'window', u: 0, y: 2.8, w: 1.2, h: 1.2, shutter: shut });
      feats.push({ face: 'back', kind: 'window', u: 0, y: 2.8, w: 1.2, h: 1.2, shutter: shut });
      spec = {
        ridge: 'z', L, S, Hw, base: 0.5, slope: 1.18,
        bands: [{ tex: 'brick_warm', tint: [1.1, 1.04, 1.0], tile: 2.9 }],
        roof: { tex: 'thatch', oe: 1.0, og: 0.85, T: 0.62, tint: [1.0, 0.96, 0.9], ridgeTex: 'thatch', ridgeTint: [0.8, 0.72, 0.6], ridgeH: 0.5, ridgeW: 0.9, tile: 3.0 },
        features: feats, chimney: { x: -L / 2 + 1.4, z: 0, sx: 1.5, sz: 1.5, tex: 'brick_warm', above: 1.9 },
      };
    } else {
      // two-storey "manor": stone ground floor, timber upper floor, steep teal roof
      const Hw = 7.6;
      feats.push({ face: 'front', kind: 'door', u: 0 });
      feats.push({ face: 'front', kind: 'custom', u: 0, fn: (k) => porch(k, { w: 3.1, d: 1.5, y: 3.95, tex: 'roof_teal' }) });
      for (const i of [0, 2]) {
        feats.push({ face: 'front', kind: 'window', u: uc[i], y: 2.0, w: 1.2, h: 1.2, shutter: shut, shutterL: i === 2, shutterR: i === 0, flowers: true, palette: fl, glow: i === 0 ? glowWin : null });
        feats.push({ face: 'front', kind: 'window', u: uc[i], y: 4.7, shutter: shut, shutterL: i === 2, shutterR: i === 0 });
        feats.push({ face: 'front', kind: 'window', u: uc[i], y: 7.0, w: 1.1, h: 1.1 });
      }
      feats.push({ face: 'front', kind: 'window', u: 0, y: 5.6, w: 1.3, h: 1.3, shutter: shut });
      feats.push({ face: 'front', kind: 'lantern', u: 1.65, y: 2.4, glow: { pool: 3.4, size: 3 } });
      feats.push({ face: 'left', kind: 'window', u: 0, y: 2.6 });
      feats.push({ face: 'left', kind: 'window', u: 0, y: 5.4, shutter: shut });
      feats.push({ face: 'right', kind: 'window', u: 0, y: 2.6 });
      feats.push({ face: 'right', kind: 'window', u: 0, y: 5.4, shutter: shut });
      feats.push({ face: 'back', kind: 'window', u: 0, y: 5.4, shutter: shut });
      spec = {
        ridge: 'z', L, S, Hw, base: 0.5, slope: 1.25,
        bands: [
          { tex: 'brick', y1: 3.1, tint: [1.0, 0.98, 1.08] },
          { tex: 'timber', timber: true, tint: [1.12, 1.06, 1.02], panel: 2.6 },
        ],
        roof: { tex: 'roof_teal', oe: 0.9, og: 0.7, T: 0.36 },
        features: feats, chimney: { x: L / 4, z: 0, sx: 1.4, sz: 1.4, tex: 'brick_warm', above: 2.0 },
        beam: 3.1,
      };
    }
    const info = gableHouse(kit, spec);
    houseGlows(kit, info, S, L);
    for (const c of info.chimneyTops || []) kit.emitter(c[0], c[2], c[1], { kind: 'smoke', rate: 1.6, radius: 0.3 });
    houseCollider(kit, { ridge: 'z', L, S, Hw: spec.Hw, ytR: info.ytR });
    kit.caster(0, 0, Math.min(S, L) * 0.36, spec.Hw + 3.5, 0.45);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// house_long : the great hall / tavern (ridge along X, front = long side)
// ---------------------------------------------------------------------------------------------------------------
export function houseLong(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  const w = clamp(p.w ?? 14, 11, 19), d = clamp(p.d ?? 7, 6, 9);
  const rng = kit.rng(x, z, 31);
  kit.at(x, z, { rot, scale, y }, () => {
    const L = w, S = d, Hw = 5.9;
    const n = Math.max(3, Math.round(L / 2.7)), pw = L / n;
    const col = (i) => (i - (n - 1) / 2) * pw;
    const shut = SHUT[rng.next() < 0.5 ? 0 : 1];
    const fl = FLOWERS[1];
    const feats = [];
    const dcol = Math.floor((n - 1) / 2);
    feats.push({ face: 'front', kind: 'door', u: col(dcol) });
    feats.push({ face: 'front', kind: 'custom', u: col(dcol), fn: (k) => porchGable(k, { w: 3.6, d: 2.2, ye: 3.95, rise: 1.5, tex: 'roof_teal' }) });
    feats.push({ face: 'front', kind: 'lantern', u: col(dcol) + 1.5, y: 2.4, glow: { pool: 3.4, size: 3 } });
    for (let i = 0; i < n; i++) {
      if (i === dcol) continue;
      const near = Math.abs(i - dcol) === 1;
      const sl = !near || i > dcol, sr = !near || i < dcol;
      feats.push({ face: 'front', kind: 'window', u: col(i), y: 2.45, w: 1.25, h: 1.25, shutter: shut, shutterL: sl, shutterR: sr, flowers: near, palette: fl, glow: i === 0 ? { pool: 3, size: 3.6 } : null });
      feats.push({ face: 'front', kind: 'window', u: col(i), y: 4.6, w: 1.25, h: 1.25, shutter: shut, shutterL: sl, shutterR: sr, sill: false });
    }
    feats.push({ face: 'front', kind: 'window', u: col(dcol), y: 5.0, w: 1.2, h: 1.2, sill: false });
    for (let i = 0; i < n; i += 2) feats.push({ face: 'back', kind: 'window', u: col(i), y: 2.6, w: 1.25, h: 1.25 });
    for (const f of ['left', 'right']) {
      feats.push({ face: f, kind: 'window', u: 0, y: 2.7, shutter: shut });
      feats.push({ face: f, kind: 'window', u: 0, y: 6.6, w: 1.1, h: 1.1, sill: false });
    }
    const spec = {
      ridge: 'x', L, S, Hw, base: 0.5, slope: 1.0,
      bands: [
        { tex: 'brick_warm', y1: 3.1, tint: [1.08, 1.02, 1.0], tile: 2.9 },
        { tex: 'timber', timber: true, tint: [1.12, 1.06, 1.0] },
      ],
      beam: 3.1,
      roof: { tex: 'roof_teal', oe: 0.9, og: 0.7, T: 0.36 },
      features: feats,
      chimney: [{ x: -L / 3, z: 0, sx: 1.4, sz: 1.4, tex: 'brick', above: 1.7 }, { x: L / 3, z: 0, sx: 1.4, sz: 1.4, tex: 'brick', above: 1.7 }],
      cupola: { x: 0, z: 0, tex: 'roof_teal' },
    };
    const info = gableHouse(kit, spec);
    houseGlows(kit, info, S, L);
    for (const c of info.chimneyTops || []) kit.emitter(c[0], c[2], c[1], { kind: 'smoke', rate: 1.6, radius: 0.3 });
    houseCollider(kit, { ridge: 'x', L, S, Hw, ytR: info.ytR });
    kit.caster(-L / 4, 0, S * 0.34, Hw + 3.2, 0.42);
    kit.caster(L / 4, 0, S * 0.34, Hw + 3.2, 0.42);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// house_round : stone roundhouse with a fat conical thatch roof
// ---------------------------------------------------------------------------------------------------------------
export function houseRound(kit, p) {
  const { x, z, rot = 0, scale = 1, y } = p;
  const r = clamp(p.r ?? 3.6, 3, 4.6);
  const rng = kit.rng(x, z, 41);
  kit.at(x, z, { rot, scale, y }, () => {
    const N = 10, rr = -PI / N;
    const ap = r * Math.cos(PI / N);            // distance from the centre to a wall facet
    const base = 0.5, T = 0.6, s = 1.0, ye = 3.0;
    const R0 = r + 1.15;
    const h = ye + (R0 - r) * s;                // where the roof underside meets the wall
    const yA = ye + T + R0 * s;
    const fl = FLOWERS[rng.int(0, 3)];
    const facet = (k, dist, y0, fn) => {
      const phi = (k * TAU) / N;
      kit.xf.push().translate(Math.sin(phi) * dist, y0, Math.cos(phi) * dist).rotateY(phi);
      fn();
      kit.xf.pop();
    };
    const toXZ = (k, dist) => [Math.sin((k * TAU) / N) * dist, Math.cos((k * TAU) / N) * dist];

    // stone plinth ring (sunk below the ground)
    kit.xf.push().translate(0, -0.9, 0);
    kit.b('brick').cyl(r + 0.3, r + 0.3, base + 0.9, N, { tile: 3.0, smooth: false, rot: rr, uWrap: 9, caps: 'top', emissive: 0.2, color: vgrad(0, [0.6, 0.56, 0.56], base + 0.9, [1.0, 0.93, 0.92]) });
    kit.xf.pop();
    // walls
    kit.b('brick_warm').lathe([[r, base], [r, base + 1.9], [r, h]], N, { tile: 2.9, uWrap: 8, smooth: false, rot: rr, emissive: 0.24, color: vgrad(base, [0.9, 0.88, 0.92], base + 2, [1.12, 1.06, 1.0]) });
    // ring beam under the eaves
    kit.b('wood_plank').lathe([[r + 0.1, h - 0.55], [r + 0.1, h - 0.15]], N, { tile: 2.4, uWrap: 8, smooth: false, rot: rr, color: TINT.warm });
    // thatch roof: soffit, fascia, two rings up the cone
    const mid = [R0 * 0.5, ye + T + R0 * 0.5 * s];
    kit.b('thatch').lathe([[r, h], [R0, ye], [R0, ye + T], mid, [0, yA]], N, { tile: 3.0, uWrap: 9, smooth: false, rot: rr, emissive: 0.16, color: vgrad(ye, [0.86, 0.8, 0.72], yA, [1.08, 1.04, 0.96]) });
    // finial + smoke hole
    kit.b('wood_beam').box(0, yA + 0.35, 0, 0.3, 0.9, 0.3, { tile: 2.4, faces: ['+z', '-z', '+x', '-x'] });
    kit.b('wood_beam').box(0, yA + 0.6, 0, 0.9, 0.14, 0.14, { tile: 2.4, faces: ['+z', '-z', '+x', '-x', '+y'] });
    // door (facet 0 faces +Z), windows, lantern
    facet(0, ap, base, () => doorUnit(kit, { w: 1.7, h: 3.0, base }));
    facet(1, ap, 0, () => {});
    const win = (k, yy, glow) => facet(k, ap, yy, () => windowUnit(kit, { w: 1.15, h: 1.15, flowers: yy < 3, palette: fl, sill: true }));
    win(2, 2.5); win(3, 2.5); win(5, 2.6); win(7, 2.5); win(8, 2.5);
    facet(1, ap, 2.7, () => lanternWall(kit, {}));
    const wg = toXZ(8, ap + 0.8);
    kit.glow(wg[0], 2.5, wg[1], { color: [1, 0.72, 0.36], size: 3.4, pool: 3 });
    const lg = toXZ(1, ap + 0.9);
    kit.glow(lg[0], 2.7, lg[1], { color: [1, 0.72, 0.36], size: 3, pool: 3.4 });
    kit.emitter(0, yA + 0.6, 0, { kind: 'smoke', rate: 1.6, radius: 0.35 });
    // colliders + shadow
    kit.cyl(0, 0, r + 0.32, -1, h + 0.4, { tag: 'wall' });
    kit.cyl(0, 0, r * 0.55, h + 0.4, yA, { tag: 'roof' });
    kit.caster(0, 0, r * 0.62, h + 3.5, 0.45);
  });
}

export const HOUSES = {
  house_cottage: {
    fn: houseCottage, size: 11,
    note: 'Cottage, front (door) on +Z, default 8x7 footprint (w,d), 10-13 tall. variant 0..3: 0 half-timbered + red roof (door centre), 1 stone/plaster + teal roof + porch (door x=+2.7), 2 warm brick + thatch (door x=-2.7), 3 two-storey manor (door centre). anchors.door = ground spot 2.5 in front of the door for variants 0 and 3; door_v1 (x=+2.7) for variant 1; door_v2 (x=-2.7) for variant 2 (assumes default w=8).',
    defaults: { variant: 0 },
    anchors: { door: [0, 0, 6.0], door_v1: [2.7, 0, 6.0], door_v2: [-2.7, 0, 6.0] },
  },
  house_long: {
    fn: houseLong, size: 17,
    note: 'Long hall / tavern, 14x7 footprint (w,d), ridge along X, FRONT (door + gabled porch) on the long +Z side, ~10 tall, cupola on the ridge. anchors.door in front of the porch.',
    anchors: { door: [0, 0, 6.8] },
  },
  house_round: {
    fn: houseRound, size: 11,
    note: 'Round stone hut r=3.6 with fat conical thatch roof (~8.8 tall), door on +Z. anchors.door in front of the door.',
    anchors: { door: [0, 0, 5.5] },
  },
};
