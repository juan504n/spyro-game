// Turns the height grid into PS1-style render meshes: one texture per triangle (hard region borders, like real PS1
// level geometry), Gouraud vertex colours baked for both lighting environments, planar UVs by world position.
import * as THREE from 'three';
import { Builder } from '../engine/builder.js';
import { valueNoise, fbm } from '../engine/textures/pix.js';
import { WATER_LEVEL } from './level.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash01 = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

const nTint = valueNoise(7001), nPatch = valueNoise(7002), nFlower = valueNoise(7003);

export const GROUND_TILE = 6;

/**
 * Which texture the ground gets: the rules, factored out of the mesh builder so the debug readout can answer "why does the ground under
 * me look like this?" with exactly the same code the mesh was built with.
 *   tris(i, j)  the two triangles of grid cell (i, j), split like grid.heightAt does: { p: [3 corners], idx: [3 grid indices], slope, tex, why }
 *   at(x, z)    the triangle under a world position: { tex, why, slope, i, j, tri }
 * `why` names the rule that chose the texture (a short lowercase phrase).
 */
export function terrainPicker(grid) {
  const { n, cell, half, heights: H, pathDist } = grid;
  const L = grid.level;
  const s = n + 1;
  const V = L.valley;
  const vrAt = (x, z) => Math.hypot((x - V.x) / V.rx, (z - V.z) / V.rz);
  const lake = L.lake;
  const flowerAt = (x, z) => fbm(nFlower, x * 0.04 + 3, z * 0.04, 2);
  const pickRule = (x, z, h, slope, nx, nz, i, j, pd, surface) => {
    const dL = Math.hypot((x - lake.x) / lake.rx, (z - lake.z) / lake.rz);
    const r = hash01(i, j);
    if (h < WATER_LEVEL + 0.05 && dL < 1.6) return ['sand', 'lake floor'];
    if (h < WATER_LEVEL + 0.8 && dL < 1.45 && slope < 0.5) return [r < 0.22 && h > WATER_LEVEL + 0.1 ? 'shore_pebbles' : 'sand', 'lake shore'];
    // (the Dawn Gate's surroundings are all one rock: the red cascade rock used to start ten metres from its pillars, and a
    // random mix of rock and grass on the steep flanks of its forecourt looked torn)
    const nearGate = Math.hypot(x - L.gate.x, z - L.gate.z) < 34;
    const warm = !nearGate && (Math.hypot(x - L.mesa.x, z - L.mesa.z) < 60 || Math.hypot(x - L.cascade.x, z - L.cascade.z) < 55 || Math.hypot(x - L.heron.x, z - L.heron.z) < 25);
    if (vrAt(x, z) > 0.965 && slope > 0.3) return ['far_rock', 'valley rim, slope > 0.3'];
    if (slope > 0.74) return [warm ? 'cliff_warm' : 'cliff', 'steep, slope > 0.74'];
    if (h > 30 && slope > 0.42) return [warm ? 'cliff_warm' : 'cliff', 'high and sloping, y > 30 and slope > 0.42'];
    if (slope > 0.5 && (r < (slope - 0.5) * 3.5 || nearGate)) return [warm ? 'cliff_warm' : 'cliff', nearGate ? 'sloping near the Dawn Gate, slope > 0.5' : 'sloping, rock and grass mix, slope > 0.5'];
    if (h > 42) return ['far_rock', 'very high, y > 42'];
    if (Math.hypot(x - L.village.x, z - (L.village.z - 4)) < 9.5) return ['flagstone', 'village plaza'];
    if (surface === 'flagstone' && pd < 1.2) return ['flagstone', 'paved forecourt'];                // a paved forecourt is paved right through (the cells are coarser than the paving)
    if (pd < 0.3) return ['dirt', 'on a road'];
    const K = L.hollow;
    if (Math.hypot(x - K.x, z - K.z) < K.r * 0.9) return ['moss', 'crystal hollow'];
    if (dL < 1.5 && h < 1.5) return [r < 0.5 ? 'moss' : 'grass_b', 'lake margin'];
    const f = flowerAt(x, z);
    if (f > 0.6 && r < 0.9) return ['grass_flowers', 'flower noise'];
    const p = fbm(nPatch, x * 0.05 + 40, z * 0.05, 2);
    if (p > 0.58) return ['grass_b', 'grass patch noise'];
    return ['grass_a', 'default grass'];
  };

  const P = (i, j) => [-half + i * cell, H[j * s + i], -half + j * cell];
  const tris = (i, j) => {
    const A = P(i, j), B = P(i + 1, j), C = P(i, j + 1), D = P(i + 1, j + 1);
    const pd = (pathDist[j * s + i] + pathDist[j * s + i + 1] + pathDist[(j + 1) * s + i] + pathDist[(j + 1) * s + i + 1]) / 4;
    // what kind of road is nearest (the corner that is closest to a road edge decides)
    let near = j * s + i;
    for (const k of [j * s + i + 1, (j + 1) * s + i, (j + 1) * s + i + 1]) if (pathDist[k] < pathDist[near]) near = k;
    const surface = grid.pathIdx[near] >= 0 ? grid.paths[grid.pathIdx[near]].surface : '';
    const split = ((i + j) & 1) === 0 ? [[A, D, B, [i, j], [i + 1, j + 1], [i + 1, j]], [A, C, D, [i, j], [i, j + 1], [i + 1, j + 1]]]
      : [[A, C, B, [i, j], [i, j + 1], [i + 1, j]], [B, C, D, [i + 1, j], [i, j + 1], [i + 1, j + 1]]];
    return split.map(([p0, p1, p2, i0, i1, i2]) => {
      const cx = (p0[0] + p1[0] + p2[0]) / 3, cz = (p0[2] + p1[2] + p2[2]) / 3, ch = (p0[1] + p1[1] + p2[1]) / 3;
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const slope = Math.acos(clamp(Math.abs(ny)));
      const [tex, why] = pickRule(cx, cz, ch, slope, nx, nz, i, j, pd, surface);
      return { p: [p0, p1, p2], idx: [i0, i1, i2], slope, tex, why };
    });
  };

  const at = (x, z) => {
    const fx = clamp((x + half) / cell, 0, n - 1e-4), fz = clamp((z + half) / cell, 0, n - 1e-4);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const first = ((i + j) & 1) === 0 ? tx > tz : tx + tz < 1;         // (the same split as grid.heightAt)
    const t = tris(i, j)[first ? 0 : 1];
    return { tex: t.tex, why: t.why, slope: t.slope, i, j, tri: first ? 0 : 1 };
  };
  return { tris, at };
}

export function buildTerrainMeshes(grid, lighting, assets) {
  const { n, cell, half, heights: H } = grid;
  const L = grid.level;
  const s = n + 1;

  // ---- ambient occlusion from concavity ---------------------------------------------------------------------
  const ao = new Float32Array(s * s);
  for (let j = 0; j < s; j++) {
    for (let i = 0; i < s; i++) {
      let sum = 0, c = 0;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const ii = Math.round(i + Math.cos(a) * 3), jj = Math.round(j + Math.sin(a) * 3);
        if (ii < 0 || jj < 0 || ii >= s || jj >= s) continue;
        sum += H[jj * s + ii]; c++;
      }
      const conc = (H[j * s + i] - sum / c) / 2.4;    // negative in hollows
      ao[j * s + i] = clamp(0.86 + conc * 0.16, 0.55, 1.05);
    }
  }
  const aoFn = (x, y, z) => {
    const i = clamp(Math.round((x + half) / cell), 0, n), j = clamp(Math.round((z + half) / cell), 0, n);
    return ao[j * s + i];
  };

  // ---- per-vertex tint (painterly variation + water absorption) -------------------------------------------------
  const V = L.valley;
  const vrAt = (x, z) => Math.hypot((x - V.x) / V.rx, (z - V.z) / V.rz);
  const tintFn = (x, y, z) => {
    const a = fbm(nTint, x * 0.09, z * 0.09, 2);
    const rimK = 1 - 0.3 * smooth(0.9, 1.08, vrAt(x, z));
    const b = fbm(nPatch, x * 0.03 + 9, z * 0.03, 2);
    let r = 0.93 + 0.14 * a, g = 0.95 + 0.10 * a + 0.05 * (b - 0.5), bl = 0.93 + 0.12 * (1 - a);
    r *= rimK; g *= rimK; bl *= rimK;
    if (y < WATER_LEVEL) {
      const d = clamp((WATER_LEVEL - y) / 4.5);
      const k = 1 - 0.3 * d;
      r *= 0.36 * k; g *= 0.86 * k; bl *= 1.05 * k;
    }
    return [r, g, bl];
  };

  // ---- texture selection: see terrainPicker -------------------------------------------------------------------
  const picker = terrainPicker(grid);

  const builders = new Map();
  const getB = (name) => {
    let b = builders.get(name);
    if (!b) { b = new Builder({ lighting }); b.defaults.tile = GROUND_TILE; builders.set(name, b); }
    return b;
  };

  const NV = (i, j) => grid.vertexNormal(i, j);
  const opts = { aoFn, color: tintFn };

  const emit = (name, slope, va, vb, vc, ia, ib, ic) => {
    // ensure counter-clockwise from above
    const ux = vb[0] - va[0], uz = vb[2] - va[2], vx = vc[0] - va[0], vz = vc[2] - va[2];
    if (uz * vx - ux * vz < 0) { [vb, vc] = [vc, vb]; [ib, ic] = [ic, ib]; }
    const b = getB(name);
    // rock is laid out like a wall from a gentler slope on (its strata are horizontal bands: mapped from above they ran straight
    // up any hillside that faces east or west, in stripes that broke against the neighbouring, steeper triangles)
    const wall = slope > 0.62 || (slope > 0.35 && (name === 'cliff' || name === 'cliff_warm'));
    const uvOf = (p, nrm) => {
      if (wall) {
        // wall-ish: project along the dominant horizontal axis so strata stay horizontal
        return Math.abs(nrm[0]) > Math.abs(nrm[2]) ? [p[2] / GROUND_TILE, p[1] / GROUND_TILE] : [p[0] / GROUND_TILE, p[1] / GROUND_TILE];
      }
      return [p[0] / GROUND_TILE, p[2] / GROUND_TILE];
    };
    const fn = [NV(...ia), NV(...ib), NV(...ic)];
    const faceN = [fn[0][0] + fn[1][0] + fn[2][0], fn[0][1] + fn[1][1] + fn[2][1], fn[0][2] + fn[1][2] + fn[2][2]];
    b.tri(va, vb, vc, uvOf(va, faceN), uvOf(vb, faceN), uvOf(vc, faceN), opts, fn);
  };

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      for (const t of picker.tris(i, j)) emit(t.tex, t.slope, t.p[0], t.p[1], t.p[2], t.idx[0], t.idx[1], t.idx[2]);
    }
  }

  const group = new THREE.Group();
  group.name = 'terrain';
  const stats = {};
  for (const [name, b] of builders) {
    const geo = b.build();
    const mesh = new THREE.Mesh(geo, assets.mat(name));
    mesh.name = 'terrain:' + name;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    stats[name] = b.triangleCount;
    b.release();
  }
  return { group, stats };
}
