// Turns the height grid into PS1-style render meshes: one texture per triangle (hard region borders, like real PS1
// level geometry), Gouraud vertex colours baked for both lighting environments, planar UVs by world position.
import * as THREE from 'three';
import { Builder } from '../engine/builder.js';
import { valueNoise, fbm } from '../engine/textures/pix.js';
import { WATER_LEVEL } from './level.js';
import { ROAD_MAX_SLOPE, underRoadAt } from './roads.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash01 = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

const nTint = valueNoise(7001), nPatch = valueNoise(7002), nFlower = valueNoise(7003), nRock = valueNoise(7004), nBank = valueNoise(7005);

export const GROUND_TILE = 6;

/**
 * Which texture the ground gets: the rules, factored out of the mesh builder so the debug readout can answer "why does the ground under
 * me look like this?" with exactly the same code the mesh was built with.
 *   tris(i, j)  the two triangles of grid cell (i, j), split like grid.heightAt does: { p: [3 corners], idx: [3 grid indices], slope, tex, why }
 *   at(x, z)    the triangle under a world position: { tex, why, slope, i, j, tri }
 * `why` names the rule that chose the texture (a short lowercase phrase).
 */
/** how close to the river (metres from its edge, averaged over a cell's corners) the ground is its bank: the carve's shoulder is 3 m wide */
export const RIVER_ZONE = 3.4;
/** a road texture goes on a terrain triangle only when the road ribbon covers all of it (a corner this far inside the ribbon's edge counts: the ribbon is 0.5 m narrower than the carve) */
export const UNDER_ROAD = -0.4;
/** the ribbons fade out at their edges, so the terrain beneath them wears the ground's own texture (a hard-edged block of road texture under a soft edge would show through) */
export const SOFT_ROADS = true;
/**
 * The ground is chosen one texture per triangle, so every border between two grounds (grass and sand, snow and cobble, ash and cinder) was a stair of 2.4 m teeth: a hard-edged block. Now
 * every border is laid in a soft blend: each grid vertex knows how much of each ground lies around it (counted over `BLEND_RADIUS` cells and blurred), and a triangle is drawn in its own
 * texture and, wherever a neighbouring ground reaches its corners, once more in that ground with alpha = that weight at each corner. The blend is as wide as the radius says (about 6 m each way).
 * Rock blends like the rest (each overlay is laid in the projection its own texture takes on that triangle); a level that names its steep limit has the cut along the contour instead. Turn it off with false (the old, hard borders).
 */
export const BLEND_GROUND = true;
export const BLEND_RADIUS = 2;
/** paving (a court, a plaza, a quay) is laid FIRM: its weight counts this many times, so a small pad is not washed away by the lawn around it */
const FIRM = /^(flagstone|cobble)/, FIRM_WEIGHT = 2.6;

/**
 * Between 0.5 and 0.74 (29 and 42 degrees) a hillside is part grass and part rock. Which part used to be a coin toss per cell (a hash of the cell), so a plain 33 degree flank was a
 * salt-and-pepper of grass and cliff triangles; now rock begins where the slope passes this limit, which wanders slowly with the position (about 15 m between its highs and lows), so the rock
 * lies in patches and outcrops with ragged but connected edges, and a steeper stretch is rock sooner than a gentler one. (The fbm of two octaves stays between about 0.2 and 0.8.)
 */
export const rockLimit = (x, z) => 0.5 + 0.24 * clamp((fbm(nRock, x * 0.07 + 21, z * 0.07 + 8, 2) - 0.2) / 0.6);

/** the (unnormalised) geometric normal of a triangle */
export const triangleNormal = (a, b, c) => {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
};

/**
 * How a ground triangle's texture is laid on it: 'planar' (from above: u = x, v = z), 'wallX' (u = z, v = y: the face looks along x) or 'wallZ' (u = x, v = y).
 * Rock is laid out like a wall from a gentle slope on (its strata are horizontal bands: mapped from above they ran straight up any hillside that faces east or west, in stripes that broke
 * against the neighbouring, steeper triangles): the axis comes from the smoothed normal of the triangle's corners (`faceN`), so neighbouring rock faces agree; the far rock of the rim does
 * the same from 0.62. Everything else (grass, sand, moss, pebbles, the road's own texture...) takes whichever of the three projections its plane is most nearly parallel to, the dominant axis
 * of its own geometric normal `geoN`, which bounds the stretch of the texture at 1.73 (the square root of 3): a grass bank of 36 degrees used to be projected as a wall like the rock,
 * which drops the sideways direction of the slope from the texture's coordinates and smeared the grass over it (120 triangles of the realm were stretched more than 1.8 times, 23 more than 3).
 */
export function uvProjection(name, slope, faceN, geoN) {
  const rock = name.startsWith('cliff'), far = name.startsWith('far_');        // (a realm's own rock textures are named like the first: cliff_frost, far_frost)
  if (rock ? slope > 0.35 : far ? slope > 0.62 : false) return Math.abs(faceN[0]) > Math.abs(faceN[2]) ? 'wallX' : 'wallZ';
  if (rock || far) return 'planar';
  const ax = Math.abs(geoN[0]), ay = Math.abs(geoN[1]), az = Math.abs(geoN[2]);
  return ay >= ax && ay >= az ? 'planar' : ax > az ? 'wallX' : 'wallZ';
}
/** the texture coordinates of a point (a corner) for a projection */
export const projectUV = (p, mode) => (mode === 'wallX' ? [p[2] / GROUND_TILE, p[1] / GROUND_TILE] : mode === 'wallZ' ? [p[0] / GROUND_TILE, p[1] / GROUND_TILE] : [p[0] / GROUND_TILE, p[2] / GROUND_TILE]);

export function terrainPicker(grid) {
  const { n, cell, half, heights: H, pathDist, riverDist, riverSurf } = grid;
  const L = grid.level;
  const s = n + 1;
  const V = L.valley;
  const vrAt = (x, z) => Math.hypot((x - V.x) / V.rx, (z - V.z) / V.rz);
  const lake = L.lake;
  const land = L.landing;
  const pickRule = (x, z, h, slope, nx, nz, i, j, pd, surface, underRoad, rd, rs, hTop) => {
    const dL = Math.hypot((x - lake.x) / lake.rx, (z - lake.z) / lake.rz);
    const r = hash01(i, j);
    // The pier's landing is ONE calm lawn. The rules below pick moss or grass cell by cell along a shore, scatter pebbles, flower cells and patches of a second
    // green, and leave scraps of cliff on the road's embankments: round the foot of the pier, where the main road reaches the lake, that made a mosaic of half a dozen
    // textures. In this zone the ground is sand at the water's edge, dirt where a road runs, and a single grass everywhere else; it fades back into the usual rules
    // over `land.fade` metres (cell by cell, so there is no ring).
    const dLand = land ? Math.hypot(x - land.x, z - land.z) : 1e9;
    const tidy = land !== undefined && dLand < land.r + land.fade && (dLand < land.r || r > (dLand - land.r) / land.fade);
    // (a level can name the textures of its lake: Frostbloom Hollow's is frozen at the edges, ice and snow where Mirrormere has sand)
    const LT = L.lakeTextures || {};
    if (h < WATER_LEVEL + 0.05 && dL < 1.6) return [LT.floor || 'sand', 'lake floor'];
    // The shore is ONE ground. It used to scatter a second texture over the sand cell by cell (a fifth of the cells were pebbles), and in the smooth look, where the pebbles are drawn sharp and
    // are bluer and bigger than the sand's grains, that was a scatter of hard-edged squares of cobbles lying on the beach. A realm that wants a second ground at its water's edge (snow on the ice,
    // ash on the cinder: `lakeTextures.pebbles`) gets it in banks, where a slow noise says so, not cell by cell; the Vale has none.
    if (h < WATER_LEVEL + 0.8 && dL < 1.45 && slope < 0.5) return [LT.pebbles && h > WATER_LEVEL + 0.1 && !tidy && fbm(nBank, x * 0.11 + 5, z * 0.11 + 17, 2) > 0.57 ? LT.pebbles : (LT.shore || 'sand'), 'lake shore'];
    // A road lies over the ground it runs on (roads.js drapes it on the terrain mesh): only the triangles the ribbon covers entirely carry its texture, so the road's edge is the
    // ribbon's smooth one and not a stair-step of dirt cells beside it.
    if (underRoad) return [(L.roadTextures && L.roadTextures[underRoad]) || underRoad, 'under a road'];      // (a level can wear its roads in its own textures: Frostbloom Hollow's are frosted)
    // The river (river.js): sand on its bed and along the water's edge, grass on the banks, however steep the carve makes them: they used to turn into walls of purple rock (and, where
    // a road ran along the top, into a wedge of dirt over a wall).
    if (rs !== undefined && rd < RIVER_ZONE) {
      if (hTop < rs + 0.05) return ['sand', 'river bed'];                                            // (all of it under the water)
      if (hTop < rs + 0.6 && slope < 1.1) return ['sand', 'river shore'];   // (a thin band along the water's edge, not the whole bank: one ground, like the lake's)
      if (slope > 0.45 && slope < 1.35) return ['grass_a', 'river bank, slope > 0.45'];                 // (only a wall that is all but vertical stays rock)
    }
    // (the Dawn Gate's surroundings are all one rock: the red cascade rock used to start ten metres from its pillars, and a
    // random mix of rock and grass on the steep flanks of its forecourt looked torn)
    const near = (f, r) => !!f && Math.hypot(x - f.x, z - f.z) < r;           // (a level without that landmark simply has no such zone)
    const nearGate = near(L.gate, 34);
    const warm = !nearGate && (near(L.mesa, 60) || near(L.cascade, 55) || near(L.heron, 25) || (L.warmRock ? L.warmRock(x, z, h) : false));
    const FAR = L.farRock || 'far_rock';                                       // (the far mountains' rock: a level can name its own)
    if (vrAt(x, z) > 0.965 && slope > 0.3) return [FAR, 'valley rim, slope > 0.3'];
    const banks = L.roadBanks && pd < L.roadBanks.zone ? L.roadBanks.steep : 0;          // (a level can say the same of the banks its roads are cut into a hillside with)
    const steep = L.steepSlope ?? (tidy ? 1.05 : banks || 0.74);        // (the landing's road embankments are not cliffs until they really are; a level can name one limit for all its ground: the homeworld does, so that the border of rock and grass is one smooth line)
    // a level can name its own cliff textures (the homeworld's tall mountains have no moss lip on every band): L.cliffs = { cool, warm }
    const cliff = L.cliffs ? (warm ? L.cliffs.warm : L.cliffs.cool) : (warm ? 'cliff_warm' : 'cliff');
    if (slope > steep) return [cliff, `steep, slope > ${steep}`];
    if (L.steepSlope === undefined && h > 30 && slope > 0.42) return [cliff, 'high and sloping, y > 30 and slope > 0.42'];
    // (a level can have no patches: a hillside is then grass right up to the steep limit above, the homeworld's hills are domes of grass, and no ragged border of rock and grass lies across their flanks)
    if (!tidy && !L.noRockPatches && slope > 0.5 && (slope > rockLimit(x, z) || nearGate)) return [warm ? 'cliff_warm' : 'cliff', nearGate ? 'sloping near the Dawn Gate, slope > 0.5' : 'sloping, rock and grass patches, slope > 0.5'];
    if (h > (L.rockLine ?? 42)) return [FAR, `very high, y > ${L.rockLine ?? 42}`];            // (a realm of high islands moves the line: level.rockLine)
    // a level with grounds of its own (a paved court, garden beds...) names them here: L.groundRule(x, z, h, slope, { r, surface, pd }) -> [texture, rule] or nothing
    if (L.groundRule) { const c = L.groundRule(x, z, h, slope, { r, surface, pd }); if (c) return c; }
    if (L.village && Math.hypot(x - L.village.x, z - (L.village.z - 4)) < 9.5) return ['flagstone', 'village plaza'];
    if (surface === 'flagstone' && pd < 1.2) return ['flagstone', 'paved forecourt'];                // a paved forecourt is paved right through (the cells are coarser than the paving)
    const K = L.hollow;
    if (K && Math.hypot(x - K.x, z - K.z) < K.r * 0.9) return ['grass_a', 'crystal hollow'];
    if (tidy) return ['grass_a', 'the pier\'s landing lawn: one calm grass'];
    if (dL < 1.5 && h < 1.5) return ['grass_a', 'lake margin'];       // (one grass: a second green, or moss, laid in patches reads as squares of turf, a checkerboard; the damp is the vertex tint's, see tintFn)
    // (ONE grass on all gentle ground. There used to be a second, teal one in patches and a third with flowers painted in: the rules choose a texture for a whole triangle, so every border between
    // two grasses was a staircase of squares, however the noise was shaped. The variety is smooth now, the per-vertex tint of tintFn; the flowers are props that stand on the ground)
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
    // the river: how far the cell is from its edge, and the drawn surface height by the corner nearest the water
    const corners4 = [j * s + i, j * s + i + 1, (j + 1) * s + i, (j + 1) * s + i + 1];
    const rd = (riverDist[corners4[0]] + riverDist[corners4[1]] + riverDist[corners4[2]] + riverDist[corners4[3]]) / 4;
    let rs;
    if (riverSurf && rd < RIVER_ZONE) {
      let nr = corners4[0];
      for (const k of corners4) if (riverDist[k] < riverDist[nr]) nr = k;
      if (Number.isFinite(riverSurf[nr])) rs = riverSurf[nr];
    }
    const split = ((i + j) & 1) === 0 ? [[A, D, B, [i, j], [i + 1, j + 1], [i + 1, j]], [A, C, D, [i, j], [i, j + 1], [i + 1, j + 1]]]
      : [[A, C, B, [i, j], [i, j + 1], [i + 1, j]], [B, C, D, [i + 1, j], [i, j + 1], [i + 1, j + 1]]];
    return split.map(([p0, p1, p2, i0, i1, i2]) => {
      const cx = (p0[0] + p1[0] + p2[0]) / 3, cz = (p0[2] + p1[2] + p2[2]) / 3, ch = (p0[1] + p1[1] + p2[1]) / 3;
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const slope = Math.acos(clamp(Math.abs(ny)));
      // under a road: all three corners are inside the ribbon (dirt and cobble roads have one; a paved forecourt is the terrain's own texture)
      const pdTri = Math.max(pathDist[i0[1] * s + i0[0]], pathDist[i1[1] * s + i1[0]], pathDist[i2[1] * s + i2[0]]);
      let underRoad = pdTri <= UNDER_ROAD && slope <= ROAD_MAX_SLOPE && (surface === 'dirt' || surface === 'cobble') ? surface : null;     // (a road is not drawn on ground steeper than that: see roads.js)
      // ... and the ribbon is as long as its path: the carve's distance field has a round cap past a road's end, where no ribbon is drawn, and the triangles there came out textured as a road
      // (a patch of dirt of the terrain's own look beyond the end of the ribbon, which has the road's own), so every corner must lie under the flat-ended ribbon too
      if (SOFT_ROADS) underRoad = null;                                                  // (the roads melt into the ground at their edges (roads.js SOFT_EDGE): the ground under a road is the ground's own texture, not a block of the road's)
      if (underRoad && !(underRoadAt(grid, p0[0], p0[2]) && underRoadAt(grid, p1[0], p1[2]) && underRoadAt(grid, p2[0], p2[2]))) underRoad = null;
      const [tex, why] = pickRule(cx, cz, ch, slope, nx, nz, i, j, pd, surface, underRoad, rd, rs, Math.max(p0[1], p1[1], p2[1]));
      const rec = { p: [p0, p1, p2], idx: [i0, i1, i2], slope, tex, why };
      // (a level that names its steep limit has the border of its rock cut along a contour, see buildTerrainMeshes: it asks again what this triangle would be at another slope)
      if (L.steepSlope !== undefined) { const hTop = Math.max(p0[1], p1[1], p2[1]); rec.re = (sl) => pickRule(cx, cz, ch, sl, nx, nz, i, j, pd, surface, underRoad, rd, rs, hTop); }
      return rec;
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

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const unit3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/**
 * Cut a triangle along a contour: its corners are { p: [x, y, z], nv: normal, sc: a score (positive on the rock side), key: a number that is the same for the same grid vertex in every
 * triangle }. Returns { rock, soft }: the polygons (lists of corners, none, one or both) where the score is positive and where it is not. A corner made on an edge lies where the score
 * interpolated along the edge passes zero, worked out from the end with the lower key, so that the two triangles that share the edge make the very same corner.
 */
export function cutByContour(corner) {
  const rock = [], soft = [];
  for (let k = 0; k < corner.length; k++) {
    const a = corner[k], b = corner[(k + 1) % corner.length];
    (a.sc > 0 ? rock : soft).push(a);
    if ((a.sc > 0) !== (b.sc > 0)) {
      const [lo, hi] = a.key < b.key ? [a, b] : [b, a], t = lo.sc / (lo.sc - hi.sc);
      const x = { p: lerp3(lo.p, hi.p, t), nv: unit3(lerp3(lo.nv, hi.nv, t)), sc: 0, key: -1 };
      rock.push(x); soft.push(x);
    }
  }
  return { rock: rock.length >= 3 ? rock : [], soft: soft.length >= 3 ? soft : [] };
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
    // the ground is one texture, so its variety lives here, and it is smooth: a broad swell of light and shade (about 60 m across: sunlit rises, deeper hollows), with a drift between a warm
    // yellow green and a cool blue green at about twice that, as the meadows of the old games are drawn (there, too, the vertex colour does it all)
    const big = fbm(nPatch, x * 0.017 + 31, z * 0.017 + 5, 3), drift = fbm(nBank, x * 0.011 + 3, z * 0.011 + 71, 2);
    const v = 0.8 + 0.4 * big, warmK = drift - 0.5;
    let r = (0.93 + 0.14 * a + 0.2 * warmK) * v, g = (0.95 + 0.10 * a + 0.05 * (b - 0.5) + 0.04 * warmK) * v, bl = (0.93 + 0.12 * (1 - a) - 0.24 * warmK) * v;
    r *= rimK; g *= rimK; bl *= rimK;
    // (a finer mottling, 6 m and 2.5 m across: a wide flat of one ground is lit in broad facets, one flat shade per triangle, and read as slabs; this breaks the plates up without making a pattern)
    const mot = 1 + 0.3 * (fbm(nTint, x * 0.17 + 40, z * 0.17 + 13, 2) - 0.5) + 0.2 * (fbm(nPatch, x * 0.41 + 3, z * 0.41 + 77, 2) - 0.5);
    r *= mot; g *= mot; bl *= mot;
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
  const isSoft = (name) => true;                        // (rock too: its border with the grass was the worst staircase of all)
  const softTris = [];            // (whole triangles of a blendable ground: the blend pass below)

  const emitN = (name, slope, va, vb, vc, na, nb, nc) => {
    // ensure counter-clockwise from above
    const ux = vb[0] - va[0], uz = vb[2] - va[2], vx = vc[0] - va[0], vz = vc[2] - va[2];
    if (uz * vx - ux * vz < 0) { [vb, vc] = [vc, vb]; [nb, nc] = [nc, nb]; }
    const b = getB(name);
    const fn = [na, nb, nc];
    const faceN = [fn[0][0] + fn[1][0] + fn[2][0], fn[0][1] + fn[1][1] + fn[2][1], fn[0][2] + fn[1][2] + fn[2][2]];
    const mode = uvProjection(name, slope, faceN, triangleNormal(va, vb, vc));
    b.tri(va, vb, vc, projectUV(va, mode), projectUV(vb, mode), projectUV(vc, mode), opts, fn);
  };
  const emit = (name, slope, va, vb, vc, ia, ib, ic) => emitN(name, slope, va, vb, vc, NV(...ia), NV(...ib), NV(...ic));

  // The border between rock and grass. The rules choose a texture for a whole triangle, so a border is a staircase of triangles, with a tooth every cell (2.4 m) along every foot of a mountain.
  // A level that names its steep limit (`steepSlope`: the homeworld) has it cut instead along the contour of that slope read at the VERTICES (the smooth normal of the grid, over four metres): a
  // triangle that straddles the contour is cut in two along it, one part rock and the other what the rules give a gentle slope there, and the new corners are shared with the neighbour across the edge.
  const steepL = L.steepSlope;
  const vSlope = steepL === undefined ? null : new Float32Array(s * s).fill(-1);
  const slopeV = (i, j) => { const k = j * s + i; if (vSlope[k] < 0) vSlope[k] = Math.acos(clamp(grid.vertexNormal(i, j)[1])); return vSlope[k]; };
  const emitCut = (t, rockName, softName) => {
    const corner = t.idx.map(([a, b], k) => ({ p: t.p[k], nv: NV(a, b), sc: slopeV(a, b) - steepL, key: b * (n + 1) + a }));
    const { rock, soft } = cutByContour(corner);
    for (const [poly, name] of [[rock, rockName], [soft, softName]]) {
      for (let k = 1; k + 1 < poly.length; k++) emitN(name, t.slope, poly[0].p, poly[k].p, poly[k + 1].p, poly[0].nv, poly[k].nv, poly[k + 1].nv);
    }
  };

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      for (const t of picker.tris(i, j)) {
        if (steepL !== undefined) {
          const sv = t.idx.map(([a, b]) => slopeV(a, b)), up = sv.filter((v) => v > steepL).length;
          if (t.why.startsWith('steep') || up > 0) {
            // (only where the rules would make it rock at all: a lake floor, a road, a river bank, the valley's rim and the like have decided already)
            const rock = t.re(steepL + 0.05);
            if (rock[1].startsWith('steep')) {
              const soft = t.re(Math.min(t.slope, steepL - 0.05));
              if (BLEND_GROUND) {
                // (the soft blend makes the border: a triangle is the ground the majority of its corners are, and the neighbours' grounds are laid in over it)
                const name = (up >= 2 && t.slope > steepL - 0.2) || t.slope > steepL + 0.12 ? rock[0] : soft[0];          // (a flat top near an edge has steep corner slopes (the vertex normals are smoothed over 4 m): its own face decides, or a narrow pillar's whole top came out as rock)
                emit(name, t.slope, t.p[0], t.p[1], t.p[2], t.idx[0], t.idx[1], t.idx[2]);
                softTris.push({ ...t, tex: name });
              } else if (up === 3) emit(rock[0], t.slope, t.p[0], t.p[1], t.p[2], t.idx[0], t.idx[1], t.idx[2]);
              else if (up === 0) emit(soft[0], t.slope, t.p[0], t.p[1], t.p[2], t.idx[0], t.idx[1], t.idx[2]);
              else emitCut(t, rock[0], soft[0]);
              continue;
            }
          }
        }
        emit(t.tex, t.slope, t.p[0], t.p[1], t.p[2], t.idx[0], t.idx[1], t.idx[2]);
        if (BLEND_GROUND && isSoft(t.tex)) softTris.push(t);
      }
    }
  }

  // ---- the blend: how much of each ground lies around every grid vertex, and the triangles that wear the neighbours' grounds in at their corners ------------------------------------------
  const blendB = new Map();
  if (BLEND_GROUND && softTris.length) {
    const acc = new Map();                                                       // texture -> Float32Array(s*s): triangles of that texture touching each vertex
    const field = (name) => { let f = acc.get(name); if (!f) { f = new Float32Array(s * s); acc.set(name, f); } return f; };
    for (const t of softTris) { const f = field(t.tex); for (const [a, b] of t.idx) f[b * s + a] += 1; }
    const box = (f, r) => {                                                      // (separable box blur, twice: a tent)
      const tmp = new Float32Array(s * s), out = new Float32Array(s * s);
      for (let pass = 0; pass < 2; pass++) {
        const src = pass ? out.slice() : f;
        for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) { let sum = 0; for (let k = -r; k <= r; k++) sum += src[j * s + clamp(i + k, 0, n)]; tmp[j * s + i] = sum / (2 * r + 1); }
        for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) { let sum = 0; for (let k = -r; k <= r; k++) sum += tmp[clamp(j + k, 0, n) * s + i]; out[j * s + i] = sum / (2 * r + 1); }
      }
      return out;
    };
    const wf = new Map(), total = new Float32Array(s * s);
    for (const [name, f] of acc) { const b = box(f, BLEND_RADIUS); if (FIRM.test(name)) for (let k = 0; k < b.length; k++) b[k] *= FIRM_WEIGHT; wf.set(name, b); for (let k = 0; k < b.length; k++) total[k] += b[k]; }
    const names = [...wf.keys()];
    if (names.length > 1) {
      const getBlend = (name) => {
        let b = blendB.get(name);
        if (!b) { b = new Builder({ lighting }); b.defaults.tile = GROUND_TILE; blendB.set(name, b); }
        return b;
      };
      for (const t of softTris) {
        for (const name of names) {
          if (name === t.tex) continue;
          const f = wf.get(name);
          const al = t.idx.map(([a, b]) => { const k = b * s + a; const w = total[k] > 0 ? f[k] / total[k] : 0; return w < 0.02 ? 0 : clamp(w); });         // (exactly the weight: where two neighbours meet, each shows the other at the very share the other shows it, so the edge between them is continuous)
          if (al[0] === 0 && al[1] === 0 && al[2] === 0) continue;
          let [va, vb, vc] = t.p, [ia, ib, ic] = t.idx, aa = al;
          const ux = vb[0] - va[0], uz = vb[2] - va[2], vx = vc[0] - va[0], vz = vc[2] - va[2];
          if (uz * vx - ux * vz < 0) { [vb, vc] = [vc, vb]; [ib, ic] = [ic, ib]; aa = [al[0], al[2], al[1]]; }
          const fn = [NV(...ia), NV(...ib), NV(...ic)];
          const faceN = [fn[0][0] + fn[1][0] + fn[2][0], fn[0][1] + fn[1][1] + fn[2][1], fn[0][2] + fn[1][2] + fn[2][2]];
          const mode = uvProjection(name, t.slope, faceN, triangleNormal(va, vb, vc));
          getBlend(name).tri(va, vb, vc, projectUV(va, mode), projectUV(vb, mode), projectUV(vc, mode), { ...opts, alphas: aa }, fn);
        }
      }
    }
  }

  const group = new THREE.Group();
  group.name = 'terrain';
  const stats = {}, blendStats = {};
  for (const [name, b] of builders) {
    const geo = b.build();
    const mesh = new THREE.Mesh(geo, assets.mat(name));
    mesh.name = 'terrain:' + name;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    stats[name] = b.triangleCount;
    b.release();
  }
  for (const [name, b] of blendB) {
    const geo = b.build();
    const mesh = new THREE.Mesh(geo, assets.mat(name, { decal: 0.5, mode: 'half', alpha: 2, depthWrite: false }));
    mesh.name = 'terrain-blend:' + name;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = -1;
    group.add(mesh);
    blendStats[name] = b.triangleCount;
    b.release();
  }
  return { group, stats, blendStats };
}
