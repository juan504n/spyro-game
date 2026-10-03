// Tideglass Reach's own props: the bridges of glass that carry the hero out over the sea, the lighthouse on the headland, the post that gauges the tide, the cairns that are the flats' refuges, and the
// fall that hangs over the mouth of the sea cave. Made of the realm's slate-teal stone (the skin remaps `cliff`), brass and sea-glass (`glass`, drawn half-blended: the water shows through it).
// None of the things that stand over the sea looks at the terrain's shadow map (unshadowed): the ground far below would smear dark streaks over the glass.
import { lump, num, int, TAU, shade, unshadowed, clamp } from './util.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** a quad A B C D (a rectangle or a parallelogram) wound so that it faces `want` (a vector it must look along), whichever way the corners were given */
function facing(b, A, B, C, D, want, o) {
  const n = cross(sub(B, A), sub(D, A));
  if (dot(n, want) < 0) b.quad(A, D, C, B, o); else b.quad(A, B, C, D, o);
}

/**
 * A straight slab from s0 to s1 along the bridge (local +z), x0..x1 across it, its top rising from ya to yb, `t` thick: the six faces, each facing out. The bridges' girders and aprons are these.
 */
function slab(b, x0, x1, s0, s1, ya, yb, t, o) {
  const T = (x, s, y) => [x, y, s];
  const ta = ya, tb = yb;
  facing(b, T(x0, s0, ta), T(x1, s0, ta), T(x1, s1, tb), T(x0, s1, tb), [0, 1, 0], o);                       // top
  facing(b, T(x0, s0, ta - t), T(x1, s0, ta - t), T(x1, s1, tb - t), T(x0, s1, tb - t), [0, -1, 0], o);       // bottom
  facing(b, T(x1, s0, ta - t), T(x1, s1, tb - t), T(x1, s1, tb), T(x1, s0, ta), [1, 0, 0], o);                // +x side
  facing(b, T(x0, s0, ta - t), T(x0, s1, tb - t), T(x0, s1, tb), T(x0, s0, ta), [-1, 0, 0], o);               // -x side
  facing(b, T(x0, s0, ta - t), T(x1, s0, ta - t), T(x1, s0, ta), T(x0, s0, ta), [0, 0, -1], o);               // start end
  facing(b, T(x0, s1, tb - t), T(x1, s1, tb - t), T(x1, s1, tb), T(x0, s1, tb), [0, 0, 1], o);                // far end
}

/**
 * A bridge of glass: from (x, z) at deck height `y1` to (x2, z2) at `y2` (the heights the hero stands at: the layout asks the ground at each end), `width` metres across. Panes of sea-glass in lead
 * (half-blended: the sea shows through) between two brass girders on a stone apron at each end, a post with a lantern every 4 m. A box collider under each pane lets the hero walk it. ORIGIN = the
 * start of the span; the deck is where the params say, whatever the ground is under it.
 */
export function glassBridge(kit, { x, z, x2, z2, y1, y2, width }) {
  width = num(width, 3.6, 2, 8);
  const dx = (x2 ?? x) - x, dz = (z2 ?? z + 10) - z, L = Math.max(4, Math.hypot(dx, dz)), yaw = Math.atan2(dx, dz);
  y1 = num(y1, 12, -20, 80); y2 = num(y2, y1, -20, 80);
  const n = Math.max(2, Math.round(L / 2.2)), seg = L / n, W = width / 2;
  const yAt = (s) => y1 + (y2 - y1) * (s / L);
  kit.at(x, z, { rot: yaw, y: 0 }, () => unshadowed(kit, () => {
    const glass = kit.b('glass', { mode: 'half', double: true }), brass = kit.b('metal_brass'), iron = kit.b('metal_iron'), stone = kit.b('cliff');
    const GC = [0.92, 1.0, 1.0], BC = [1.1, 1.0, 0.82], IC = [0.62, 0.95, 0.95];
    for (let i = 0; i < n; i++) {
      const s0 = i * seg, s1 = (i + 1) * seg, a = yAt(s0), b = yAt(s1), sm = (s0 + s1) / 2;
      // the pane: 2 m of tile to a pane, so a pane of glass is a metre across
      glass.quad([-W + 0.16, a - 0.05, s0], [W - 0.16, a - 0.05, s0], [W - 0.16, b - 0.05, s1], [-W + 0.16, b - 0.05, s1], { uv: [0, s0 / 2, (2 * W - 0.32) / 2, s1 / 2], color: GC, emissive: 0.55, tile: 2 }, [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]]);
      // the girders (either side of the deck) and a tie beam under it, every pane
      for (const sd of [-1, 1]) { const gx = sd * (W - 0.15); slab(iron, gx - 0.15, gx + 0.15, s0, s1, a + 0.02, b + 0.02, 0.5, { tile: 2, color: IC }); }
      slab(iron, -W + 0.2, W - 0.2, sm - 0.12, sm + 0.12, yAt(sm) - 0.35, yAt(sm) - 0.35, 0.16, { tile: 2, color: [0.5, 0.78, 0.78] });
      kit.box(0, sm, W, seg / 2 + 0.04, yAt(sm) - 0.7, yAt(sm), { top: true, tag: 'glass_bridge' });
    }
    // posts with a lantern, every ~4 m either side
    const np = Math.max(2, Math.round(L / 4));
    for (let i = 0; i <= np; i++) {
      const s = (i / np) * L, y = yAt(s);
      for (const sd of [-1, 1]) {
        const px = sd * (W - 0.02);
        brass.at(px, y, s, (q) => { q.cyl(0.13, 0.1, 1.15, 6, { tile: 2, color: BC }); q.at(0, 1.15, 0, (g) => g.sphere(0.24, 6, 4, { tile: 2, color: [1.25, 1.2, 1.0], emissive: 0.8 })); });
        kit.glow(px, y + 1.4, s, { color: [0.62, 1.0, 0.9], size: 2.3, pool: 0 });
      }
    }
    // the stone aprons the span rests on, a little into the ground at each end
    for (const [s0, s1, yy] of [[-1.6, 1.0, y1], [L - 1.0, L + 1.6, y2]]) slab(stone, -W - 0.5, W + 0.5, s0, s1, yy + 0.02, yy + 0.02, 2.2, { tile: 3, color: [0.9, 1.0, 0.98] });
  }));
}

/**
 * The lighthouse of the headland: a stone plinth, a tapering tower banded white and sea-green, a gallery, the lantern room - panes of sea-glass between brass bars, a light in it that shines over the whole
 * Reach - and a copper roof with a finial. A door at the foot facing +z. ORIGIN = the ground at its foot; 40 m tall. Solid.
 */
export function lighthouse(kit, { x, z, rot = 0, scale = 1, y }) {
  kit.at(x, z, { rot, scale, y }, () => {
    const stone = kit.b('cliff'), brass = kit.b('metal_brass'), glass = kit.b('glass', { mode: 'half', double: true }), cap = kit.b('flagstone');
    const band = (yy, pale) => (Math.floor(yy / 4.2) % 2 === 0 ? [1.18, 1.2, 1.12] : pale);
    // the plinth: two steps
    cap.lathe([[8.2, 0], [8.2, 0.6], [7.2, 0.6], [7.2, 1.2], [6.4, 1.2], [6.4, 1.6]], 14, { tile: 3, color: [1.0, 1.02, 1.0], smooth: false });
    // the shaft: a taper from 5.2 to 3.3 over 28 m, banded (a colour function of the height)
    stone.lathe([[5.2, 1.6], [4.8, 8], [4.3, 16], [3.8, 24], [3.4, 29]], 14, { tile: 3.4, color: (px, py) => band(py, [0.56, 0.9, 0.82]), smooth: true });
    // the door and two windows
    const door = kit.b('door');
    door.quad([-1.1, 1.6, 5.15], [1.1, 1.6, 5.15], [1.1, 4.4, 5.15], [-1.1, 4.4, 5.15], { uv: [0, 0, 1, 1], color: [1.0, 0.95, 0.9] }, [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]]);
    brass.box(0, 4.6, 5.12, 2.8, 0.3, 0.3, { tile: 2, color: [1.1, 1.0, 0.8] });
    const win = kit.b('window');
    for (const [wy, wr] of [[12, 4.45], [20, 3.95]]) for (const a of [0.6, 2.6]) {
      const wx = Math.sin(a) * (wr + 0.05), wz = Math.cos(a) * (wr + 0.05);
      win.quad([wx - Math.cos(a) * 0.5, wy, wz + Math.sin(a) * 0.5], [wx + Math.cos(a) * 0.5, wy, wz - Math.sin(a) * 0.5], [wx + Math.cos(a) * 0.5, wy + 1.5, wz - Math.sin(a) * 0.5], [wx - Math.cos(a) * 0.5, wy + 1.5, wz + Math.sin(a) * 0.5], { uv: [0, 0, 1, 1], color: [1.0, 1.0, 0.9], emissive: 0.6 });
    }
    // the gallery: a brass floor ring with a rail
    brass.lathe([[3.4, 29], [5.2, 29.0], [5.2, 29.5], [3.5, 29.5]], 14, { tile: 2, color: [1.1, 1.0, 0.8], smooth: false });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU, px = Math.sin(a) * 5.0, pz = Math.cos(a) * 5.0;
      brass.box(px, 30.1, pz, 0.14, 1.2, 0.14, { tile: 2, color: [1.15, 1.05, 0.82] });
    }
    brass.lathe([[5.1, 30.65], [5.1, 30.8], [4.95, 30.8], [4.95, 30.65]], 14, { tile: 2, color: [1.15, 1.05, 0.82], smooth: false });
    // the lantern room: eight brass bars, panes of glass between them, a floor and a roof
    const R = 2.7;
    glass.lathe([[R, 29.6], [R, 34.4]], 16, { tile: 2, color: [0.95, 1.0, 1.0], emissive: 0.7, smooth: true });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; brass.box(Math.sin(a) * R, 32, Math.cos(a) * R, 0.16, 4.9, 0.16, { tile: 2, color: [1.15, 1.05, 0.82] }); }
    brass.lathe([[R + 0.2, 29.5], [R + 0.2, 29.9], [R, 29.9]], 16, { tile: 2, color: [1.1, 1.0, 0.8], smooth: false });
    brass.lathe([[R + 0.2, 34.3], [R + 0.25, 34.7], [R - 0.1, 34.7]], 16, { tile: 2, color: [1.1, 1.0, 0.8], smooth: false });
    // the roof: a cone of copper gone green, a ball and a vane's spike on top
    const roof = kit.b('roof_teal');
    roof.lathe([[R + 0.7, 34.6], [R * 0.7, 36.2], [R * 0.3, 37.6], [0.18, 38.2]], 16, { tile: 2.4, color: [1.1, 1.14, 1.08], smooth: true });
    brass.at(0, 38.2, 0, (q) => { q.sphere(0.34, 6, 5, { tile: 2, color: [1.3, 1.18, 0.86] }); q.cyl(0.07, 0.03, 1.6, 5, { tile: 2, color: [1.2, 1.1, 0.84] }); });
    // the light: a warm-white glow in the lantern that reaches far over the water, and glints
    kit.glow(0, 32.2, 0, { color: [0.82, 1.0, 0.92], size: 16, pool: 0, flicker: 0.05 });
    kit.glow(0, 32.2, 0, { color: [1.0, 0.96, 0.74], size: 7, pool: 0 });
    kit.emitter(0, 32, 0, { kind: 'sparkle', rate: 2.5, radius: 2.2 });
    // the beams: two fans of light flat in the air, one each way across the Reach (additive)
    const beam = kit.b('beam', { mode: 'add', double: true });
    for (const sd of [-1, 1]) {
      const fx = sd * 60;
      beam.quad([0, 32.2, -1.2], [fx, 33.4, -16], [fx, 33.4, 16], [0, 32.2, 1.2], { uv: [0, 0, 1, 2], color: [0.6, 1.0, 0.9], emissive: 0.8, alpha: 0.4 }, [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]]);
    }
    kit.cyl(0, 0, 8.0, 0, 1.0, { top: true });
    kit.cyl(0, 0, 5.2, 0, 30);
    kit.caster(0, 0, 7, 36, 0.3);
  });
}

/**
 * The tide post: a timber post standing in the sea with three bands painted on it at the heights the water reaches - green at the low tide (`lo`), white at the mean level, red at the high tide (`hi`) -
 * and a lantern on top. Read the water against it. ORIGIN = the sea floor under it (pass `lo` and `hi` as the world heights, not relative to the origin); a thin solid column.
 */
export function tidePost(kit, { x, z, rot = 0, scale = 1, y, lo, hi }) {
  lo = num(lo, -1.4, -6, 0); hi = num(hi, 1.4, 0, 6);
  kit.at(x, z, { rot, scale, y }, () => unshadowed(kit, () => {
    const oy = kit.origin.y, wood = kit.b('wood_beam'), paint = kit.b(null), brass = kit.b('metal_brass');
    const top = hi + 3.4 - oy;
    wood.box(0, top / 2 - 0.2, 0, 0.5, top + 0.4, 0.5, { tile: 2.4, color: [0.84, 0.86, 0.8] });
    // the bands: a plank of paint round the post at each mark (a hair proud of it), and a tick above and below
    for (const [lvl, c] of [[lo, [0.3, 0.85, 0.55]], [0, [0.95, 0.97, 0.95]], [hi, [0.95, 0.3, 0.25]]]) {
      const yy = lvl - oy;
      paint.box(0, yy, 0, 0.56, 0.3, 0.56, { color: c, emissive: 0.25 });
      paint.box(0, yy + 0.3, 0, 0.54, 0.06, 0.54, { color: [0.12, 0.1, 0.1] });
      paint.box(0, yy - 0.3, 0, 0.54, 0.06, 0.54, { color: [0.12, 0.1, 0.1] });
    }
    // a board on top with a lantern over it
    brass.box(0, top + 0.05, 0, 0.9, 0.12, 0.9, { tile: 2, color: [1.1, 1.0, 0.8] });
    brass.at(0, top + 0.11, 0, (q) => { q.cyl(0.12, 0.1, 0.5, 6, { tile: 2, color: [1.1, 1.0, 0.8] }); q.at(0, 0.5, 0, (g) => g.sphere(0.3, 6, 4, { tile: 2, color: [1.3, 1.25, 1.05], emissive: 0.8 })); });
    kit.glow(0, top + 0.8, 0, { color: [0.62, 1.0, 0.9], size: 3, pool: 0 });
    kit.cyl(0, 0, 0.3, 0, top + 0.4);
    kit.caster(0, 0, 0.4, 4, 0.1);
  }));
}

/**
 * A cairn: a heap of flat stones on the top of a bank of the flats, with a lantern of sea-glass on it that shines at night - a refuge: the tide wades the bank but never drowns the hero on it, and the
 * lights are the channel markers of the causeway. ORIGIN = the ground at its foot (the top of the bank).
 */
export function tideCairn(kit, { x, z, rot = 0, scale = 1, y }) {
  const rng = kit.rng(x, z, 907);
  kit.at(x, z, { rot, scale, y }, () => {
    const stone = kit.b('cliff'), brass = kit.b('metal_brass');
    let yy = 0, r = 1.3;
    for (let i = 0; i < 4; i++) {
      lump(stone, rng, [rng.float(-0.12, 0.12), yy + r * 0.28, rng.float(-0.12, 0.12)], r, { detail: 'o1', noise: 0.14, sy: 0.4, tile: 2.6, smooth: 0.1, skipDown: 0.4, color: shade(0, [0.74, 0.88, 0.86], 2, [1.1, 1.14, 1.08], 0.05) });
      yy += r * 0.5; r *= 0.74;
    }
    // the lantern: a brass cap, a ball of glass lit from within
    brass.at(0, yy + 0.2, 0, (q) => {
      q.cyl(0.32, 0.26, 0.2, 6, { tile: 2, color: [1.1, 1.0, 0.8] });
      q.at(0, 0.2, 0, (g) => g.sphere(0.42, 7, 5, { tile: 2, color: [0.95, 1.25, 1.15], emissive: 0.85 }));
      q.at(0, 0.8, 0, (g) => g.cyl(0.2, 0.0, 0.3, 6, { tile: 2, color: [1.1, 1.0, 0.8] }));
    });
    kit.glow(0, yy + 0.75, 0, { color: [0.6, 1.0, 0.9], size: 3.4, pool: 2.4, flicker: 0.08 });
    kit.cyl(0, 0, 1.0, 0, yy + 0.6);
    kit.caster(0, 0, 1.2, yy + 1, 0.2);
  });
}

/**
 * The Weeping Fall over the mouth of the sea cave: a curtain of falling water `w` metres wide hanging from a lip of rock `h` metres up to the ground, in front of the rock face (it faces +z; ORIGIN = the
 * ground at its foot, the face 0.6 m behind). Two translucent sheets, the front one longer-streaked, so that what is behind them - the cave's light, the lens - is seen through water; foam at the foot,
 * mist rising. Not solid: the hero walks through it.
 */
export function caveFall(kit, { x, z, rot = 0, scale = 1, y, w, h }) {
  w = num(w, 12, 5, 20); h = num(h, 13, 6, 24);
  const rng = kit.rng(x, z, 911);
  kit.at(x, z, { rot, scale, y }, () => {
    const sheet = kit.b('waterfall', { mode: 'half', double: true, scroll: [0, -1.2] }), back = kit.b('waterfall', { mode: 'half', double: true, scroll: [0, -0.8] });
    const stone = kit.b('cliff');
    const cols = Math.max(3, Math.round(w / 2.2)), rows = Math.max(2, Math.ceil(h / 5));
    const P = (i, j, zz, ww) => { const t = i / rows; return [(j / cols - 0.5) * ww * (1 + 0.1 * t), h * (1 - t), zz + 0.35 * t + 0.5 * t * t * t * t]; };
    const alphaOf = (i, j) => (j === 0 || j === cols ? 0.45 : 0.9) * (i === 0 ? 0.8 : 1);
    for (const [b, zz, ww, k] of [[back, 0.7, w * 0.94, 0.8], [sheet, 1.15, w, 1.0]]) {
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        const a = P(i + 1, j, zz, ww), c = P(i + 1, j + 1, zz, ww), d = P(i, j + 1, zz, ww), e = P(i, j, zz, ww);
        b.quad(a, c, d, e, { uv: [a[0] / 2.4 + 0.3, (h - a[1]) / 5, c[0] / 2.4 + 0.3, (h - e[1]) / 5], emissive: 0.5, color: [0.92 * k + 0.08, 1.02, 1.08], alphas: [alphaOf(i + 1, j) * k, alphaOf(i + 1, j + 1) * k, alphaOf(i, j + 1) * k, alphaOf(i, j) * k] }, [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]]);
      }
    }
    // the lip it spills over: a row of wet flat rocks
    for (let i = 0; i < 4; i++) {
      const lx = (i - 1.5) * (w / 4.2) + rng.float(-0.3, 0.3);
      lump(stone, rng, [lx, h - 0.2, 0.1], w * 0.14 + 0.5, { detail: 'o1', noise: 0.15, sy: 0.5, sz: 1.1, tile: 3, smooth: 0.1, skipDown: 0.4, color: shade(h - 1, [0.5, 0.64, 0.66], h + 1, [0.95, 1.05, 1.02], 0.05) });
    }
    // foam at the foot and a curtain of it where the water lands, mist over it
    const foam = kit.b('foam', { mode: 'cutout', double: true });
    for (let i = 0; i < 5; i++) {
      const px = (i - 2) * (w * 0.22), pz = 2.0 + rng.float(-0.4, 1.0), s = w * 0.3 + 1.2, a = rng.float(0, TAU), cs = Math.cos(a) * s / 2, sn = Math.sin(a) * s / 2;
      foam.quad([px - cs + sn, 0.12 + i * 0.02, pz + sn + cs], [px + cs + sn, 0.12 + i * 0.02, pz - sn + cs], [px + cs - sn, 0.12 + i * 0.02, pz - sn - cs], [px - cs - sn, 0.12 + i * 0.02, pz + sn - cs], { uv: [0, 0, s / 3.4, s / 3.4], color: [1.05, 1.08, 1.12], emissive: 0.4 }, [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]]);
    }
    const bw = w * 1.08;
    foam.quad([-bw / 2, -0.1, 1.7], [bw / 2, -0.1, 1.7], [bw / 2, 1.2, 1.5], [-bw / 2, 1.2, 1.5], { uv: [0, 0, bw / 3.4, 0.5], emissive: 0.4, color: [1.05, 1.08, 1.12] }, [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]]);
    kit.emitter(0, 1.2, 1.9, { kind: 'mist', rate: 8, radius: w * 0.4 });
    kit.emitter(0, h - 0.5, 1.2, { kind: 'mist', rate: 2, radius: w * 0.3 });
  });
}

export const TIDE = {
  glass_bridge: { fn: glassBridge, size: 4, note: 'a bridge of sea-glass from (x, z) at deck height y1 to (x2, z2) at y2, width across: half-blended panes between brass girders, a lantern post every 4 m, a box collider under each pane to walk on; origin = the start of the span (the deck is where the params say)', defaults: { width: 3.6 } },
  lighthouse: { fn: lighthouse, size: 18, note: 'the lighthouse: a banded tower 38 m tall on a stepped plinth, a gallery, a lantern room of glass with a light that shines far over the sea, a green roof; solid; a door at the foot facing +z; origin = the ground at its foot', defaults: {} },
  tide_post: { fn: tidePost, size: 2, note: 'a tide gauge: a timber post with a green band at the low tide (lo), white at the mean level and red at the high tide (hi), world heights; a lantern on top; origin = the sea floor', defaults: { lo: -1.4, hi: 1.4 } },
  tide_cairn: { fn: tideCairn, size: 3, note: 'a cairn of flat stones with a lantern of sea-glass that shines: the refuge on a bank of the flats; origin = the ground at its foot', defaults: {} },
  cave_fall: { fn: caveFall, size: 16, note: 'a curtain of falling water over the mouth of a cave, w wide, h high, facing +z (the rock face 0.6 m behind it): two translucent sheets, foam, mist; not solid; origin = the ground at its foot', defaults: { w: 12, h: 13 } },
};
void int; void clamp;
