// A ROCK MASS: a mountain with a way through it, described as data. It is the recipe of Dawnhaven's Crag (home/crag.js) made general: a body of mounds standing on a level plinth of ground,
// tunnels and chambers of air cut into it, skylights from the chambers' roofs to the sky, and the Massif (massif.js) that the engine draws and collides with. The ground stays a heightfield
// (it is the floor of every cave: `landform` shapes it after the tunnels' floors), the rock is the one function `field(x, y, z)`.
//
//   const GLACIER = rockMass({ id: 'glacier', name: 'THE GLACIER', plinth: 11,
//     mounds:   [{ x, z, rx, rz, h, flat }],                 heights above the plinth of overlapping mounds (flat: the share of the radius where the top is level)
//     tunnels:  { mouth: [[x, z, floorY, halfWidth, height], ...] },     arched ways, the floor interpolated along the line
//     chambers: { heart: { x, z, rx, rz, rot, H, floorY } },             domes of air on a flat floor
//     shafts:   [{ x, z, r, y0, y1 }],                                   skylights
//     box: [x0, y0, z0, x1, y1, z1], style: { rock, interior, top, ambient, layers } })
//
// A level uses it in three places: its regions include a ribbon of level ground at `plinth` under the mass (the mass stands on it), its `landforms` call `GLACIER.landform(h, x, z)` (the ground
// follows the caves' floors), and its `massifs` give `[GLACIER.massif()]`. The layout places things in the caves by `GLACIER.at(name, s, side)`.
import { Massif, smin, smax, tunnelAir, chamberAir, shaftAir, noise3, fbm3, nearOnLine } from '../massif.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function rockMass(spec) {
  const { id, name = id, plinth, mounds, tunnels = {}, chambers = {}, shafts = [], box, cell = 1.5, blend = 2.4, rough = [9, 2.6], style = {} } = spec;

  /** the body's height at (x, z): the mounds united with a soft maximum, a rough surface on top (it fades out low down, so that the mass's foot is clean) */
  const body = (x, z) => {
    let h = null;
    for (const m of mounds) {
      const d = Math.hypot((x - m.x) / m.rx, (z - m.z) / m.rz);
      const top = d < 1 ? m.h * (1 - smooth(m.flat ?? 0.4, 1, d)) : -(d - 1) * 40;
      h = h === null ? top : smax(h, top, 3.5);
    }
    const r = (fbm3(x * 0.045, 0.5, z * 0.045, 3) - 0.5) * rough[0] + (fbm3(x * 0.16, 3.1, z * 0.16, 2) - 0.5) * rough[1];
    return plinth - 5 + h + r * smooth(3, 14, h);
  };

  /** a place along a tunnel: `s` metres from its start (clamped), `side` metres to the right of the way in; { x, z, y (floor), yaw (the way in), hw (its half width) } */
  const at = (tunnel, s, side = 0) => {
    const pts = tunnels[tunnel];
    if (!pts) throw new Error(`rockMass '${id}': no tunnel '${tunnel}'`);
    let left = Math.max(0, s);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (left <= L || i === pts.length - 2) {
        const u = Math.min(1, left / L), dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
        return { x: lerp(a[0], b[0], u) - dz * side, z: lerp(a[1], b[1], u) + dx * side, y: lerp(a[2], b[2], u), yaw: Math.atan2(dx, dz), hw: lerp(a[3], b[3], u) };
      }
      left -= L;
    }
    return null;
  };
  const length = (tunnel) => { const pts = tunnels[tunnel]; let L = 0; for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); return L; };

  /** the floor of the nearest tunnel or chamber at (x, z): { y, over (how far outside its edge: negative inside), kind }; null when the mass has none */
  const floor = (x, z) => {
    let best = null;
    for (const k of Object.keys(tunnels)) {
      const pts = tunnels[k], n = nearOnLine(pts, x, z), a = pts[n.i], b = pts[n.i + 1];
      const over = n.d - lerp(a[3], b[3], n.u);
      if (!best || over < best.over) best = { y: lerp(a[2], b[2], n.u), over, kind: k };
    }
    for (const k of Object.keys(chambers)) {
      const c = chambers[k], cs = Math.cos(c.rot || 0), sn = Math.sin(c.rot || 0);
      const dx = x - c.x, dz = z - c.z, lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
      const over = (Math.hypot(lx / c.rx, lz / (c.rz || c.rx)) - 1) * Math.min(c.rx, c.rz || c.rx);
      if (!best || over < best.over) best = { y: c.floorY, over, kind: k };
    }
    return best;
  };

  /** how the ground follows the caves: the height it has under (x, z) inside the mass and how strongly (0..1): level inside a tunnel's width, easing over a few metres into the plinth */
  const terrain = (x, z) => {
    const f = floor(x, z);
    return f ? { y: f.y, w: 1 - smooth(-0.6, 3.2, f.over), over: f.over, kind: f.kind } : null;
  };

  /** the landform of a level (realm/level.js `landforms`): the ground h at (x, z) with the caves' floors cut into it under the mountain */
  const landform = (h, x, z) => {
    const c = terrain(x, z);
    if (c && c.w > 0) {
      const under = smooth(plinth - 3, plinth + 4, body(x, z));          // (is there mountain over this spot?)
      if (under > 0) h = lerp(h, lerp(plinth, c.y, c.w), under);
    }
    return h;
  };
  /** inside the mass, on a cave's floor: for a level's ground rule */
  const inside = (x, z) => { const c = terrain(x, z); return !!c && c.w > 0.5 && body(x, z) > plinth + 2 ? c : null; };

  const massif = () => {
    const air = [];
    for (const k of Object.keys(tunnels)) air.push(tunnelAir(tunnels[k]));
    for (const k of Object.keys(chambers)) air.push(chamberAir({ rot: 0, ...chambers[k] }));
    for (const s of shafts) air.push(shaftAir(s));
    // (the field is sampled column by column, a few dozen heights at the same (x, z): what depends on (x, z) alone is worked out once per column)
    let cx = NaN, cz = NaN, cBody = 0;
    const field = (x, y, z) => {
      if (x !== cx || z !== cz) { cx = x; cz = z; cBody = body(x, z); }
      let d = y - cBody;
      // the air: the ways and rooms united with a soft edge, so that where a tunnel meets a hall the junction is a rounded fillet and not a sharp crease
      let a = Infinity;
      for (let i = 0; i < air.length; i++) { const v = air[i](x, y, z); a = a > 8 || v > 8 ? Math.min(a, v) : smin(a, v, blend); }
      d = smax(d, -a, 0.9);
      return d + (noise3(x * 0.19, y * 0.19, z * 0.19) - 0.5) * 0.9 + (noise3(x * 0.55, y * 0.55, z * 0.55) - 0.5) * 0.3;
    };
    return new Massif({ id, name, box, field, cell, style });
  };

  return { id, name, plinth, mounds, tunnels, chambers, shafts, body, at, length, floor, terrain, landform, inside, massif };
}
