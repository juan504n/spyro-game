// Water surfaces: the lake, ponds and the river. PS1 water is a 50%-blended scrolling texture over the bed, with a
// faint additive shimmer layer on top.
import * as THREE from 'three';
import { Builder } from '../engine/builder.js';
import { WATER_LEVEL } from './level.js';
import { makeDraper, clipScalar, isConvex, area } from './drape.js';
import { riverWaterLength, riverReach } from './river.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** the tints of the river's water: darker and more cyan in the shallows, lighter over the deeps (the old ribbon shaded its edge lanes and its middle the same way) */
const SHALLOW = [0.6, 0.85, 1.0], DEEP = [0.88, 1.0, 1.12];

/**
 * The river's water, laid on the terrain like the roads are (drape.js). Its surface is flat across the river and follows the river's own profile (river.js), and it exists exactly where the
 * ground is below it: the ribbon is cut against the terrain triangles under it and only the wet part is kept, so the water's edge is the waterline wherever the bank is, and no sheet of it
 * ever hangs over lower ground. (It used to be a flat ribbon 7.9 m wide: the carved channel is wider than that, so on 107 of its 110 edge samples the edge hung 0.2 to 1.3 m above the
 * bank, and near the lake it floated over a dry hollow: translucent planes in the air.) Vertex alpha fades towards the shore.
 */
export function buildRiverWater(grid, lighting) {
  const L = grid.level;
  const b = new Builder({ lighting });
  const draper = makeDraper(grid);
  const stats = { footprint: 0, wet: 0 };
  for (const r of grid.rivers) {
    const m = riverWaterLength(L, r.pts);
    if (m < 2) continue;
    const pts = r.pts.slice(0, m), surf = r.surf.slice(0, m);
    const W = 2 * riverReach(r.width) + 0.6, tile = 5;
    const Rn = pts.map((p, i) => {
      const a = pts[Math.max(i - 1, 0)], c = pts[Math.min(i + 1, pts.length - 1)];
      const fx = c[0] - a[0], fz = c[2] - a[2], l = Math.hypot(fx, fz) || 1;
      return [-fz / l, fx / l];
    });
    const dists = [0];
    for (let i = 1; i < pts.length; i++) dists.push(dists[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
    // a vertex: [x, z, surface height, u, v]
    const lane = (i, k) => [pts[i][0] + Rn[i][0] * (W / 2) * k, pts[i][2] + Rn[i][1] * (W / 2) * k, surf[i], ((k + 1) / 2) * (W / tile), dists[i] / tile];
    const polygon = (poly) => {
      stats.footprint += area(poly);
      draper.cut(poly, (piece, F) => {
        const wet = clipScalar(piece, (v) => v[2] - draper.heightOn(F, v[0], v[1]));          // where the ground is below the water
        if (wet.length < 3 || area(wet) < 1e-6) return;
        stats.wet += area(wet);
        const vs = wet.map((v) => {
          const depth = Math.max(0, v[2] - draper.heightOn(F, v[0], v[1])), t = clamp(depth / 1.2);
          return { x: v[0], y: v[2], z: v[1], uv: [v[3], v[4]], tint: [SHALLOW[0] + (DEEP[0] - SHALLOW[0]) * t, SHALLOW[1] + (DEEP[1] - SHALLOW[1]) * t, SHALLOW[2] + (DEEP[2] - SHALLOW[2]) * t], alpha: 0.4 + 0.6 * smoothstep(0, 0.7, depth) };
        });
        for (let k = 1; k < vs.length - 1; k++) {
          let [p, q, w] = [vs[0], vs[k], vs[k + 1]];
          const ux = q.x - p.x, uz = q.z - p.z, vx = w.x - p.x, vz = w.z - p.z;
          if (uz * vx - ux * vz < 0) [q, w] = [w, q];                                       // (counter-clockwise from above: the materials are single-sided)
          b.tri([p.x, p.y, p.z], [q.x, q.y, q.z], [w.x, w.y, w.z], p.uv, q.uv, w.uv, { emissive: 0.4, tints: [p.tint, q.tint, w.tint], alphas: [p.alpha, q.alpha, w.alpha] }, [0, 1, 0]);
        }
      });
    };
    for (let i = 0; i < pts.length - 1; i++) {
      const BL = lane(i, -1), BR = lane(i, 1), TR = lane(i + 1, 1), TL = lane(i + 1, -1);
      if (isConvex([BL, BR, TR, TL])) polygon([BL, BR, TR, TL]);
      else { polygon([BL, BR, TR]); polygon([BL, TR, TL]); }
    }
  }
  return { builder: b, stats };
}

function disc(b, cx, cz, rx, rz, y, segs, rings, depthFn, o) {
  const ring = (k, a) => {
    const t = k / rings;
    return [cx + Math.sin(a) * rx * t, y, cz + Math.cos(a) * rz * t];
  };
  for (let k = 0; k < rings; k++) {
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const p00 = ring(k, a0), p01 = ring(k, a1), p10 = ring(k + 1, a0), p11 = ring(k + 1, a1);
      const tint = (p) => depthFn(p[0], p[2]);
      // (counter-clockwise seen from above so the surface faces up: the materials are single-sided)
      const uv = (p) => [p[0] / o.tile, p[2] / o.tile];
      if (k === 0) {
        b.tri(p00, p10, p11, uv(p00), uv(p10), uv(p11), { ...o, tints: [tint(p00), tint(p10), tint(p11)] }, [0, 1, 0]);
      } else {
        b.tri(p00, p11, p01, uv(p00), uv(p11), uv(p01), { ...o, tints: [tint(p00), tint(p11), tint(p01)] }, [0, 1, 0]);
        b.tri(p00, p10, p11, uv(p00), uv(p10), uv(p11), { ...o, tints: [tint(p00), tint(p10), tint(p11)] }, [0, 1, 0]);
      }
    }
  }
}

/**
 * The lake, the ponds and the river. A realm whose lake is not water says so with `level.liquid` (Emberfall Crags' lava): { texture, shallow, deep (the tints of the surface over the shallows and over
 * the deeps), shimmer (the tint of the additive layer that moves over it), emissive (1: it lights itself), scroll, tile, splash ('lava': sparks), burnDepth (metres of depth that kill: 0.95 for water,
 * a touch for lava) }. The surface is opaque and self-lit; what it does to the hero is the player's rule about the ground under him (player.js _water).
 */
export function buildWater(grid, lighting, assets) {
  const L = grid.level;
  const lq = L.liquid || null;
  const group = new THREE.Group();
  group.name = 'water';
  const depthTint = (x, z) => {
    const h = grid.heightAt(x, z);
    const d = clamp((WATER_LEVEL - h) / 4.2);
    if (lq) return [lq.shallow[0] + (lq.deep[0] - lq.shallow[0]) * d, lq.shallow[1] + (lq.deep[1] - lq.shallow[1]) * d, lq.shallow[2] + (lq.deep[2] - lq.shallow[2]) * d];
    // shallow = light teal, deep = indigo-blue
    return [0.40 - 0.20 * d, 0.68 - 0.32 * d, 0.98 - 0.16 * d];
  };
  const shimmer = lq ? () => lq.shimmer : () => [0.24, 0.34, 0.42];

  const surf = new Builder({ lighting });
  const shim = new Builder({ lighting });
  const base = lq ? { tile: lq.tile ?? 6, emissive: lq.emissive ?? 1, alpha: 1 } : { tile: 5, emissive: 0.1, alpha: 1 };
  const k = L.lake;
  disc(surf, k.x, k.z, k.rx * 1.12, k.rz * 1.12, WATER_LEVEL, 44, 7, depthTint, { ...base });
  disc(shim, k.x, k.z, k.rx * 1.12, k.rz * 1.12, WATER_LEVEL + 0.03, 44, 4, shimmer, { ...base, tile: lq ? (lq.tile ?? 6) * 0.7 : 3.5 });
  for (const p of L.ponds) {
    disc(surf, p.x, p.z, p.rx * 1.15, p.rz * 1.15, WATER_LEVEL, 24, 4, depthTint, { ...base });
    disc(shim, p.x, p.z, p.rx * 1.15, p.rz * 1.15, WATER_LEVEL + 0.03, 24, 3, shimmer, { ...base, tile: lq ? (lq.tile ?? 6) * 0.7 : 3.5 });
  }
  // the river: its own surface, cut to the banks (see buildRiverWater)
  const river = buildRiverWater(grid, lighting).builder;

  const add = (b, mat, order) => {
    if (b.triangleCount === 0) return null;
    const m = new THREE.Mesh(b.build(), mat);
    m.renderOrder = order;
    group.add(m);
    return m;
  };
  if (lq) {
    add(surf, assets.mat(lq.texture, { scroll: lq.scroll || [0.012, 0.005], decal: true }), 5);                      // (opaque and self-lit: it glows in the dusk)
    add(shim, assets.mat(lq.texture, { mode: 'add', scroll: [-0.01, 0.016], decal: true }), 6);
  } else {
    add(surf, assets.mat('water', { mode: 'half', scroll: [0.018, 0.007], decal: true, alpha: 1.0 }), 5);
    add(shim, assets.mat('water', { mode: 'add', scroll: [-0.014, 0.022], decal: true }), 6);
  }
  add(river, assets.mat('water', { mode: 'half', scroll: [0, -0.32], decal: true }), 5);
  return group;
}
