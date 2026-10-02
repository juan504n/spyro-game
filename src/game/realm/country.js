// A COUNTRY: ground made of parts, the way Dawnhaven is (and not like a plaza with spokes). A realm's land is a handful of REGIONS - ribbons of open ground, each a line of points
// [x, z, ground height, half width] - between mountains that fill all the rest; where two ribbons meet their heights blend (a ramp, a pass), and the line of a ribbon is also where a road runs.
// This module is the shared recipe (see .claude/skills/new-realm): the ribbons' blend, the mountains, and the few landforms every realm wants (a lake's bowl, a mound, a flat shelf, a glade
// walled in by rock). It is pure JS (no three, no DOM): terrain.js calls a level's `height` from Node tools as well as from the game, and what is built here must come out the same every time.
//
// Dawnhaven (home/level.js) is built on it; a new realm's level.js is generated on it (tools/new-realm.mjs).
import { valueNoise, fbm } from '../../engine/textures/pix.js';
import { nearOnLine } from '../massif.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/**
 * A ribbon's hold on the ground at (x, z): `w` is 1 on the ribbon (out to its half width) and eases to 0 over `fall` metres beyond it; `h` is the ground height of the ribbon's line at the
 * nearest point (interpolated between its points); `over` is how far outside the ribbon the point lies.
 */
export function regionAt(R, x, z) {
  const n = nearOnLine(R.pts, x, z);
  const a = R.pts[n.i], b = R.pts[Math.min(n.i + 1, R.pts.length - 1)];
  const hw = lerp(a[3], b[3], n.u), h = lerp(a[2], b[2], n.u);
  const over = Math.max(0, n.d - hw);
  return { w: 1 - smooth(0, R.fall, over), h, over };
}

/**
 * The ground of a country before any landform is cut into it.
 *   regions   [{ id, fall, pts: [[x, z, height, halfWidth], ...] }]
 *   seed      the country's noise (each realm its own: the rolling of the ground and the shape of the mountains come from it)
 *   mountain  { base, ridge, rough, margin }: the mountains that fill whatever is not open ground are `base` metres high, ridged by up to `ridge` more, roughened by `rough`. `margin` (metres,
 *             off by default): a country with HIGH ribbons (a rim at 24 m, a gorge climbing to 34) needs walls, and the noise alone makes mountains of 35 m beside a floor of 34 that the hero can
 *             simply walk up; with a margin the mountains stand at least that many metres over the floor of the ribbons beside them (the walk check, tools/realm-check.mjs, finds the ones that do not)
 *   roll      { amp, fine }: how much the open ground rolls (metres, broad and fine)
 * Returns { ground(x, z), open(x, z), peaks(x, z), n2, nA, nB, nC, nR }: `ground` is the height of the land (the blend of the ribbons' floors, risen to the mountains outside them),
 * `open` how much open ground there is at a point (0..1), `peaks` the mountains alone; the noise tables are for the landforms and ground rules of the level that wants a bit more of the same.
 */
export function makeCountry({ seed = 1000, regions, mountain = {}, roll = {} }) {
  const nA = valueNoise(seed + 101), nB = valueNoise(seed + 202), nR = valueNoise(seed + 303), nC = valueNoise(seed + 404);
  const n2 = (noise, x, z, s, oct = 3) => fbm(noise, x * s, z * s, oct);
  const base = mountain.base ?? 34, ridgeH = mountain.ridge ?? 17, rough = mountain.rough ?? 12, margin = mountain.margin;
  const amp = roll.amp ?? 3.0, fine = roll.fine ?? 0.9;

  /** the mountains that fill whatever is not open ground: always well above any floor */
  const peaks = (x, z) => {
    const ridge = 1 - Math.abs(2 * n2(nR, x + 60, z, 0.017, 3) - 1);
    return base + ridgeH * ridge + (n2(nC, x, z - 30, 0.03, 2) - 0.5) * rough;
  };

  const ground = (x, z) => {
    // the open ground: a blend of the regions' floors
    let open = 0, wsum = 0, hsum = 0;
    for (const R of regions) {
      const q = regionAt(R, x, z);
      if (q.w <= 0) continue;
      open = 1 - (1 - open) * (1 - q.w);
      const w2 = q.w * q.w + 1e-6;
      wsum += w2; hsum += w2 * q.h;
    }
    const M0 = peaks(x, z);
    if (wsum > 0) {
      let floor = hsum / wsum;
      // (with a margin the mountains rise to stand that far over the floor beside them, eased in from where the ribbons' reach begins, so that there is no step in them)
      const M = margin === undefined ? M0 : M0 + Math.max(0, floor + margin - M0) * smooth(0, 0.5, open);
      floor += (n2(nA, x + 140, z - 60, 0.014, 3) - 0.5) * amp * open + (n2(nB, x, z, 0.05, 2) - 0.5) * fine * open;       // (the ground rolls a little)
      return lerp(M, floor, open);
    }
    return M0;
  };

  const openAt = (x, z) => {
    let open = 0;
    for (const R of regions) { const q = regionAt(R, x, z); if (q.w > 0) open = 1 - (1 - open) * (1 - q.w); }
    return open;
  };

  return { ground, open: openAt, peaks, n2, nA, nB, nC, nR };
}

// ---- landforms ------------------------------------------------------------------------------------------------------------------------------------------
// Each takes the height `h` the ground has so far at (x, z) and returns the new one, so a level's height function is a few of them in a row.

/**
 * A lake's bowl: a flat-ish bed (`k.bed` metres, negative) with steepening walls, the shore exactly where d = 1 (d being the distance from the lake's middle in units of its radii). `wob`
 * (a metre amplitude, or a function that gives one: it is called only inside the bowl) lets the bed wobble, fading to nothing at the shore. The ground outside rises to meet the land over
 * the next third of the radius.
 */
export function basin(h, x, z, k, wob = 0) {
  const d = Math.hypot((x - k.x) / k.rx, (z - k.z) / k.rz);
  if (d >= 1.34) return h;
  const w = typeof wob === 'function' ? wob() : wob;                       // (a function is asked only where the bowl is: the noise costs)
  const inner = k.bed * (1 - Math.pow(d, 3.2)) + w * (1 - d) * (d < 1 ? 1 : 0);
  const outer = lerp(0.0, h, smooth(1.0, 1.34, d));
  return d < 1 ? Math.min(h, inner) : Math.min(h, outer + 0.0);
}

/** A mound of ground rising out of low ground (an islet in a lake, a knoll): `top` metres high at its middle, `r` the radius of its crest. `floor` is what it rises from. */
export function mound(h, x, z, m, floor) {
  const di = Math.hypot(x - m.x, z - m.z);
  return Math.max(h, floor + (m.top - floor) * (1 - smooth(m.r * 0.45, m.r * 1.25, di)));
}

/** No accidental puddles: outside a lake the ground stays above the waterline (eased in: a hard switch would leave a ledge along the shore). */
export function dryLand(h, x, z, k, level = 0.75) {
  const dWet = Math.hypot((x - k.x) / k.rx, (z - k.z) / k.rz);
  const kk = smooth(1.14, 1.44, dWet);
  return kk > 0 ? lerp(h, Math.max(h, level), kk) : h;
}

/** Flatten the ground to `target` inside radius `r`, easing back to what it was over `fall` metres (a shelf, a pad for a building, a plateau's top). `wobble` roughens the outline. */
export function flatten(h, x, z, cx, cz, r, fall, target, wobble = 0) {
  const d = Math.hypot(x - cx, z - cz) + wobble;
  return lerp(h, target, 1 - smooth(r, r + fall, d));
}

/**
 * A glade walled in by rock: a round floor (radius `G.r`, height `G.h`) ringed by a flat crest `G.wall` metres over the floor, open only along a strip (`G.gap` m half width) that looks at
 * angle `G.open` (radians from east towards south), where the way in runs. Where there are mountains already they simply stay. (A grid of 2.4 m draws a crest of 4 m cleanly.)
 */
export function glade(h, x, z, G) {
  const dx = x - G.x, dz = z - G.z, d = Math.hypot(dx, dz);
  if (d >= G.r + 14) return h;
  const along = dx * Math.cos(G.open) + dz * Math.sin(G.open), lateral = Math.abs(dx * Math.sin(G.open) - dz * Math.cos(G.open));
  const gap = along > 0 ? 1 - smooth(G.gap, G.gap + 0.8, lateral) : 0;
  const ring = smooth(G.r + 0.4, G.r + 3.2, d) * (1 - smooth(G.r + 7.4, G.r + 12.2, d));
  h = lerp(h, Math.max(h, G.h + G.wall), ring * (1 - gap));
  return lerp(h, G.h, 1 - smooth(G.r, G.r + 2.2, d));
}

/**
 * A ravine: the ground cut away along a line (a polyline of [x, z] points) down to `floor` metres, `hw` half width of the floor, its walls easing out over `fall` metres. The cut only ever
 * lowers the ground. A chasm to glide across is a ravine between two shelves.
 */
export function ravine(h, x, z, pts, hw, floor, fall) {
  const n = nearOnLine(pts, x, z);
  const w = 1 - smooth(hw, hw + fall, n.d);
  return w > 0 ? Math.min(h, lerp(h, floor, w)) : h;
}

/** The point of a ribbon's line `t` (0..1 along it): [x, z, ground height, half width], for placing things on the ribbon by where along it they are. */
export function pointOn(R, t) {
  const pts = R.pts;
  let total = 0;
  const lens = [];
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); lens.push(l); total += l; }
  let s = clamp(t) * total, i = 0;
  while (i < lens.length - 1 && s > lens[i]) { s -= lens[i]; i++; }
  const a = pts[i], b = pts[i + 1] || pts[i], u = lens[i] ? s / lens[i] : 0;
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u), lerp(a[3], b[3], u)];
}
