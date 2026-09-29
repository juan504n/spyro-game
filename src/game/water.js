// Water surfaces: the lake, ponds and the river. PS1 water is a 50%-blended scrolling texture over the bed, with a
// faint additive shimmer layer on top.
import * as THREE from 'three';
import { Builder } from '../engine/builder.js';
import { WATER_LEVEL } from './level.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

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
      if (k === 0) {
        b.tri(p00, p11, p10, [p00[0] / o.tile, p00[2] / o.tile], [p11[0] / o.tile, p11[2] / o.tile], [p10[0] / o.tile, p10[2] / o.tile],
          { ...o, tints: [tint(p00), tint(p11), tint(p10)] }, [0, 1, 0]);
      } else {
        const uv = (p) => [p[0] / o.tile, p[2] / o.tile];
        b.tri(p00, p01, p11, uv(p00), uv(p01), uv(p11), { ...o, tints: [tint(p00), tint(p01), tint(p11)] }, [0, 1, 0]);
        b.tri(p00, p11, p10, uv(p00), uv(p11), uv(p10), { ...o, tints: [tint(p00), tint(p11), tint(p10)] }, [0, 1, 0]);
      }
    }
  }
}

export function buildWater(grid, lighting, assets) {
  const L = grid.level;
  const group = new THREE.Group();
  group.name = 'water';
  const depthTint = (x, z) => {
    const h = grid.heightAt(x, z);
    const d = clamp((WATER_LEVEL - h) / 4.2);
    // shallow = light teal, deep = indigo-blue
    return [0.62 - 0.30 * d, 1.18 - 0.30 * d, 1.22 - 0.05 * d];
  };

  const surf = new Builder({ lighting });
  const shim = new Builder({ lighting });
  const base = { tile: 5, emissive: 0.35, alpha: 1 };
  const k = L.lake;
  disc(surf, k.x, k.z, k.rx * 1.12, k.rz * 1.12, WATER_LEVEL, 44, 7, depthTint, { ...base });
  disc(shim, k.x, k.z, k.rx * 1.12, k.rz * 1.12, WATER_LEVEL + 0.03, 44, 4, () => [0.36, 0.5, 0.56], { ...base, tile: 3.5 });
  for (const p of L.ponds) {
    disc(surf, p.x, p.z, p.rx * 1.15, p.rz * 1.15, WATER_LEVEL, 24, 4, depthTint, { ...base });
    disc(shim, p.x, p.z, p.rx * 1.15, p.rz * 1.15, WATER_LEVEL + 0.03, 24, 3, () => [0.36, 0.5, 0.56], { ...base, tile: 3.5 });
  }
  // river ribbons: surface pinned to the river's own profile
  const river = new Builder({ lighting });
  for (const r of grid.rivers) {
    const pts = r.pts.map((p) => [p[0], p[1] - 0.12, p[2]]);
    river.ribbon(pts, r.width + 1.4, { tile: 5, edgeTint: [0.6, 0.85, 1.0], centerTint: [0.85, 1.0, 1.1], emissive: 0.4, uSpan: 1 });
  }

  const add = (b, mat, order) => {
    if (b.triangleCount === 0) return null;
    const m = new THREE.Mesh(b.build(), mat);
    m.renderOrder = order;
    group.add(m);
    return m;
  };
  add(surf, assets.mat('water', { mode: 'half', scroll: [0.018, 0.007], decal: true, alpha: 1.32 }), 5);
  add(shim, assets.mat('water', { mode: 'add', scroll: [-0.014, 0.022], decal: true }), 6);
  add(river, assets.mat('water', { mode: 'half', scroll: [0, -0.32], decal: true }), 5);
  return group;
}
