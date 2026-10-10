// THE CRAG: the mountain in the middle of Dawnhaven, with a way through it. A rock mass (see ../massif.js) standing on a plinth of level ground: a mountain of three heights, a tunnel
// from the south forecourt to the Echo Hall, the winding stair down to the Frost Grotto (where the Frostbloom door stands), the north passage out to the Ascent, an east passage to the
// canyon road, and a ledge road that climbs the mountain's flank to a summit, where the Skyweaver door waits.
//
// Everything here is plain data and functions of (x, z) / (x, y, z): the terrain (level.js) shapes the cave floors after `cragTerrain`, the layout (layout.js) places the doors and the
// crystals after the same numbers, the tests walk the same lines, and `makeCrag` turns it all into the Massif the engine draws and collides with.
import { Massif, smin, smax, tunnelAir, chamberAir, shaftAir, noise3, fbm3, nearOnLine } from '../massif.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** how soft the union of the caves' air is (metres) */
const AIR_BLEND = 2.4;

/** the level ground the mountain stands on (the forecourt's height) */
export const CRAG_Y = 9.0;

/** the mountain's body: heights above the plinth of a few overlapping mounds. `flat` = the share of the radius where the top is level; the foot falls away over the rest. */
export const MOUNDS = [
  { x: 6, z: -54, rx: 44, rz: 40, h: 22, flat: 0.5 },          // the main mass, a high shoulder
  { x: 32, z: -90, rx: 30, rz: 30, h: 31, flat: 0.3 },         // the summit tower, in the north-east (the Frost Grotto lies under it)
  { x: -22, z: -64, rx: 22, rz: 26, h: 15, flat: 0.45 },       // the western shoulder
  { x: 6, z: -34, rx: 27, rz: 24, h: 24, flat: 0.62 },         // the southern bastion: a cliff face, in which the south mouth stands
  { x: -4, z: -96, rx: 30, rz: 26, h: 23, flat: 0.45 },        // the north-western spur (over the winding stair)
];

/** the summit: a level pad on the tower (the Skyweaver door stands here) */
export const SUMMIT = { x: 34, z: -94, y: CRAG_Y + 26.4, r: 12.5 };

/**
 * The ways inside. Each tunnel is [x, z, floorY, halfWidth, height] points. The floors are the terrain (it follows these numbers, see cragTerrain), so they are walkable ramps.
 */
export const TUNNELS = {
  // south mouth -> the Echo Hall
  gate: [[6, 4, CRAG_Y, 5.4, 7.6], [6, -14, CRAG_Y, 5.0, 7.0], [5, -30, CRAG_Y, 5.0, 7.0], [4, -42, CRAG_Y, 5.2, 7.2]],
  // the Echo Hall -> west, then the winding stair down (north, east) to the Frost Grotto
  stair: [[-8, -52, CRAG_Y, 4.6, 6.4], [-18, -62, 8.2, 4.4, 6.2], [-20, -74, 6.6, 4.4, 6.0], [-10, -86, 5.2, 4.4, 6.2], [4, -90, 4.6, 4.6, 6.6], [18, -86, 4.5, 5.0, 7.0]],
  // the Echo Hall -> east: out of the mountain on its east side (toward the canyon road)
  east: [[14, -50, CRAG_Y, 4.4, 6.0], [30, -46, 8.6, 4.2, 5.8], [44, -42, 8.0, 4.4, 6.0], [58, -40, 7.4, 4.6, 6.4]],
  // the Frost Grotto -> north: a ramp up and out onto the Ascent
  north: [[29, -93, 4.6, 4.4, 6.8], [34, -102, 6.0, 4.2, 6.4], [37, -114, 8.6, 4.4, 6.4], [34, -128, 11.2, 4.8, 6.8]],
  // the crystal vault: a short way north out of the Echo Hall, shut with a cracked wall (the hall's secret)
  vault: [[3, -61, CRAG_Y, 3.2, 5.4], [3, -70, CRAG_Y, 3.2, 5.4]],
};

/** chambers: domes of air on a flat floor */
export const CHAMBERS = {
  hall: { x: 3, z: -50, rx: 17, rz: 13, rot: 0.2, H: 12.5, floorY: CRAG_Y },
  grotto: { x: 32, z: -84, rx: 19, rz: 15, rot: -0.3, H: 15, floorY: 4.5 },
  vault: { x: 3, z: -77, rx: 7.5, rz: 7, rot: 0.2, H: 7.5, floorY: CRAG_Y },
};
/** skylights: shafts of air from a chamber's roof to the sky (the light comes down through them) */
export const SHAFTS = [{ x: 3, z: -50, r: 2.6, y0: CRAG_Y + 6, y1: 80 }];

/** a place along a tunnel: `s` metres from its start (clamped), `side` metres to the right of the way in; { x, z, y (floor), yaw (the way in), hw (its half width) } */
export function tunnelAt(name, s, side = 0) {
  const pts = TUNNELS[name];
  let left = Math.max(0, s);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= L || i === pts.length - 2) {
      const u = Math.min(1, left / L), dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
      // (the right hand of a walker going +dz north on the map... x grows east, z south: right of (dx, dz) is (-dz, dx))
      return { x: lerp(a[0], b[0], u) - dz * side, z: lerp(a[1], b[1], u) + dx * side, y: lerp(a[2], b[2], u), yaw: Math.atan2(dx, dz), hw: lerp(a[3], b[3], u) };
    }
    left -= L;
  }
  return null;
}
export const tunnelLength = (name) => { const pts = TUNNELS[name]; let L = 0; for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); return L; };

/** the floor of the nearest tunnel/chamber at (x, z): { y, over, kind } (over = how far outside its edge: negative inside); null when there are none */
export function cragFloor(x, z) {
  let best = null;
  for (const name of Object.keys(TUNNELS)) {
    const pts = TUNNELS[name];
    const n = nearOnLine(pts, x, z);
    const a = pts[n.i], b = pts[n.i + 1];
    const hw = lerp(a[3], b[3], n.u);
    const over = n.d - hw;
    if (!best || over < best.over) best = { y: lerp(a[2], b[2], n.u), over, kind: name };
  }
  for (const name of Object.keys(CHAMBERS)) {
    const c = CHAMBERS[name];
    const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    const dx = x - c.x, dz = z - c.z, lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
    const u = Math.hypot(lx / c.rx, lz / c.rz);
    const over = (u - 1) * Math.min(c.rx, c.rz);
    if (!best || over < best.over) best = { y: c.floorY, over, kind: name };
  }
  return best;
}

/**
 * How the terrain follows the caves: the height the ground has under (x, z) inside the mountain, and how strongly (0..1). Level inside the tunnels' width (0.6 m of margin),
 * easing over a few metres into the plinth under the rest of the mass.
 */
export function cragTerrain(x, z) {
  const f = cragFloor(x, z);
  if (!f) return null;
  return { y: f.y, w: 1 - smooth(-0.6, 3.2, f.over), over: f.over, kind: f.kind };
}

/** the body's height at (x, z): the mounds, rough on the outside, with the summit pad levelled */
export function bodyHeight(x, z) {
  let h = null;
  for (const m of MOUNDS) {
    const d = Math.hypot((x - m.x) / m.rx, (z - m.z) / m.rz);
    const top = d < 1 ? m.h * (1 - smooth(m.flat, 1, d)) : -(d - 1) * 40;
    h = h === null ? top : smax(h, top, 3.5);                                                       // (a smooth union: the highest wins, rounded over 3.5 m)
  }
  // a rough surface: broad lumps, finer crags (they fade out low down, so that the mass's foot is clean)
  const rough = (fbm3(x * 0.045, 0.5, z * 0.045, 3) - 0.5) * 9 + (fbm3(x * 0.16, 3.1, z * 0.16, 2) - 0.5) * 2.6;
  const y = CRAG_Y - 5 + h + rough * smooth(3, 14, h);
  const sd = Math.hypot(x - SUMMIT.x, z - SUMMIT.z);
  return lerp(y, SUMMIT.y, 1 - smooth(SUMMIT.r, SUMMIT.r + 9, sd));
}

/**
 * The ledge road up the mountain: [x, z, y, halfWidth] points. It winds once round the mountain from the north passage's mouth, clockwise on the map, climbing along the flank:
 * at each step the radius is found where the body's surface has the height the road should have, so the road lies on the flank wherever the flank is (and is cut into it or built out from it).
 */
export const LEDGE = { a0: 2.11, dir: 1, turns: 1.15, ease: 2.3, approach: [[-25, -2], [-20, -14]] };
export function ledgeRoad({ a0, dir, turns, ease, approach = [] } = LEDGE) {
  const C = [26, -86], steps = 96, sweep = Math.PI * 2 * turns;
  const y0 = CRAG_Y + 0.3;
  const raw = [];
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = a0 + dir * sweep * t;
    const y = lerp(y0, SUMMIT.y, 1 - Math.pow(1 - t, ease));
    const dx = Math.cos(a), dz = Math.sin(a);
    // the outermost radius at which the body reaches the road's height (the flank's foot-side contour, whatever the mounds do further in)
    let r = 90;
    while (r > 7 && bodyHeight(C[0] + dx * r, C[1] + dz * r) < y) r -= 1;
    if (r <= 7 && prev !== null) r = prev - 1.2;                                                   // (no flank at this height in this direction: keep winding in)
    let lo = r, hi = r + 1;
    for (let k = 0; k < 8; k++) { const mid = (lo + hi) / 2; if (bodyHeight(C[0] + dx * mid, C[1] + dz * mid) > y) lo = mid; else hi = mid; }
    prev = (lo + hi) / 2;
    raw.push([a, prev, y]);
  }
  // smooth the radius so the road does not follow every crag of the rough surface (and never turns back on itself)
  const out = [];
  for (let i = 0; i <= steps; i++) {
    let s = 0, n = 0;
    for (let k = -6; k <= 6; k++) { const j = i + k; if (j >= 0 && j <= steps) { s += raw[j][1]; n++; } }
    const r = s / n, [a, , y] = raw[i];
    out.push([C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r, y, 3.2]);
  }
  // (the road starts on the open ground of the forecourt's west side: the first points lead in to where the flank begins)
  return [...approach.map(([x, z]) => [x, z, y0, 3.2]), ...out];
}

/** a polyline with a coarse grid that finds the segments near a point without walking them all */
class Line {
  constructor(pts, cell = 8, reach = 10) {
    this.pts = pts; this.cell = cell;
    this.map = new Map();
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const x0 = Math.floor((Math.min(a[0], b[0]) - reach) / cell), x1 = Math.floor((Math.max(a[0], b[0]) + reach) / cell);
      const z0 = Math.floor((Math.min(a[1], b[1]) - reach) / cell), z1 = Math.floor((Math.max(a[1], b[1]) + reach) / cell);
      for (let u = x0; u <= x1; u++) for (let v = z0; v <= z1; v++) { const k = u * 4096 + v; let l = this.map.get(k); if (!l) this.map.set(k, l = []); l.push(i); }
    }
  }
  /** { d, i, u } of the nearest segment among those listed near (x, z), or null */
  near(x, z) {
    const l = this.map.get(Math.floor(x / this.cell) * 4096 + Math.floor(z / this.cell));
    if (!l) return null;
    let best = Infinity, bi = 0, bu = 0;
    for (let k = 0; k < l.length; k++) {
      const i = l[k], a = this.pts[i], b = this.pts[i + 1];
      const vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz || 1;
      const u = clamp(((x - a[0]) * vx + (z - a[1]) * vz) / l2);
      const d = Math.hypot(x - (a[0] + vx * u), z - (a[1] + vz * u));
      if (d < best) { best = d; bi = i; bu = u; }
    }
    return best === Infinity ? null : { d: best, i: bi, u: bu };
  }
}

export const RAMP = ledgeRoad();
const RAMP_LINE = new Line(RAMP, 8, 14);

/** the rock mass of the Crag */
export function makeCrag() {
  const air = [];
  for (const k of Object.keys(TUNNELS)) air.push(tunnelAir(TUNNELS[k]));
  for (const k of Object.keys(CHAMBERS)) air.push(chamberAir(CHAMBERS[k]));
  for (const s of SHAFTS) air.push(shaftAir(s));
  // (the field is sampled column by column, a few dozen heights at the same (x, z): what depends on (x, z) alone is worked out once per column)
  let cx = NaN, cz = NaN, cBody = 0, cNear = null;
  const field = (x, y, z) => {
    if (x !== cx || z !== cz) { cx = x; cz = z; cBody = bodyHeight(x, z); cNear = RAMP_LINE.near(x, z); }
    let d = y - cBody;
    // the ledge road: rock under it (a retaining wall) and a notch cut into the flank above it
    let cut = Infinity, flat = 0;
    if (y > CRAG_Y - 2 && y < SUMMIT.y + 8) {
      const n = cNear;
      if (n) {
        const a = RAMP[n.i], b = RAMP[n.i + 1];
        const ry = lerp(a[2], b[2], n.u), hw = lerp(a[3], b[3], n.u);
        const slab = Math.max(n.d - (hw + 0.6), y - ry);
        d = Math.min(d, slab);
        cut = Math.max(n.d - hw, ry - y, y - (ry + 7));
        flat = (1 - smooth(hw, hw + 2.4, n.d)) * (1 - smooth(1.0, 2.4, Math.abs(y - ry)));            // (close to the road's surface the rock is not rough: the hero walks on it)
      }
      const sd = Math.hypot(x - SUMMIT.x, z - SUMMIT.z);
      flat = Math.max(flat, (1 - smooth(SUMMIT.r, SUMMIT.r + 3, sd)) * (1 - smooth(1.0, 2.4, Math.abs(y - SUMMIT.y))));    // ... nor on the summit's pad
    }
    // the air: the ways and rooms united with a soft edge, so that where a tunnel meets a hall or a dome the junction is a rounded fillet and not a sharp crease
    let a = cut;
    for (let i = 0; i < air.length; i++) { const v = air[i](x, y, z); a = a > 8 || v > 8 ? Math.min(a, v) : smin(a, v, AIR_BLEND); }
    d = smax(d, -a, 0.9);
    return d + ((noise3(x * 0.19, y * 0.19, z * 0.19) - 0.5) * 0.9 + (noise3(x * 0.55, y * 0.55, z * 0.55) - 0.5) * 0.3) * (1 - 0.94 * flat);
  };
  return new Massif({
    id: 'crag', name: 'THE CRAG',
    box: [-60, 0, -140, 74, 50, 14],
    field, cell: 1.5,
    style: {
      rock: 'cliff_bare', interior: 'cliff_bare', top: 'grass_a', ambient: [0.2, 0.25, 0.36],
      // what the rock is made of: the ledge road is cobbled, gentle ground that sees the sky is grass, the rest is the cliff (inside and out: the same stone, so no seam shows at a cave's mouth).
      // Scores, read at the vertices: the mesh is cut along their zero lines, so the borders are smooth lines (see Massif.build)
      layers: [
        {
          name: 'cobble',
          score({ x, y, z, ny, sky }) {
            const n = RAMP_LINE.near(x, z);
            if (!n) return -1;
            return Math.min(lerp(RAMP[n.i][3], RAMP[n.i + 1][3], n.u) + 1.1 - n.d, 1.2 - Math.abs(y - lerp(RAMP[n.i][2], RAMP[n.i + 1][2], n.u)), (ny - 0.5) * 3, (sky - 0.7) * 3);
          },
        },
        { name: 'grass_a', score: ({ ny, sky }) => Math.min((ny - 0.6) * 3, (sky - 0.12) * 3) },        // (the flat start of the ramp was bare rock, projected from above into a smooth grey slab on the lawn)
        { name: 'flagstone', score: ({ ny, sky }) => Math.min((ny - 0.8) * 3, (0.12 - sky) * 6) },        // (a flat floor under the mountain's brow is paved: it was bare rock projected from above, a smooth grey slab)
      ],
    },
  });
}
