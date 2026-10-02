// Props of the frozen country (Frostbloom Hollow): the Icefall, a waterfall frozen where it fell.
import { lump, shade, num, TAU } from './util.js';
import { column } from './rocks.js';

/**
 * The Icefall: a frozen waterfall, faces +z. ORIGIN = the ground at its foot; the lip is at local y = h, the flows of ice stand round bulges at the foot, snow lies on the lip and icicles hang
 * from it. `gap` (metres, the middle of the curtain) opens a way: the flows there hang from the lip and end in points at `gapH`, so that a cave's mouth behind them is under the fall; the others
 * reach the ground and are solid. Cold light and a few sparks at its foot.
 */
export function iceFall(kit, { x, z, rot = 0, scale = 1, y, h, w, gap, gapH }) {
  h = num(h, 16, 6, 34); w = num(w, 20, 6, 36); gap = num(gap, 0, 0, w - 4); gapH = num(gapH, 8, 3, h - 3);
  const r = kit.rng(x, z, 211);
  kit.at(x, z, { rot, scale, y }, () => {
    const flow = kit.b('waterfall'), ice = kit.b('ice'), snow = kit.b('snow');         // (the flows are the waterfall's own streaks, standing still)
    const n = Math.max(3, Math.round(w / 2.3));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, cx = (t - 0.5) * w + r.float(-0.3, 0.3);
      const hh = h * (1 - Math.pow(Math.abs(t - 0.5) * 2, 2) * 0.26) * r.float(0.95, 1.04);
      const R = r.float(1.0, 1.3);
      const col = shade(0, [0.78, 0.92, 1.08], hh, [1.1, 1.16, 1.2], 0.05);
      if (Math.abs(cx) < gap / 2) {
        const y0 = gapH + r.float(-0.9, 1.5);
        column(flow, r, [{ y: y0, r: 0.12, dx: cx, dz: 0 }, { y: y0 + (hh - y0) * 0.35, r: R * 0.55, dx: cx, dz: 0.1 }, { y: hh - 0.6, r: R * 0.95, dx: cx, dz: 0.2 }],
          { sides: 5, tile: 4, color: col, peak: [0, 0.5, 0], rot0: r.float(0, 1) });
      } else {
        column(flow, r, [{ y: -0.6, r: R * 1.45, dx: cx, dz: 0.5 }, { y: hh * 0.3, r: R * 1.05, dx: cx, dz: 0.1 }, { y: hh * 0.7, r: R * 0.95, dx: cx, dz: 0 }, { y: hh, r: R * 0.9, dx: cx, dz: -0.1 }],
          { sides: 6, tile: 4, color: col, peak: [0, 0.6, 0], rot0: r.float(0, 1) });
        kit.cyl(cx, 0, R * 1.05, 0, hh);
      }
    }
    // icicles along the lip, hanging in front of the flows (long over the gap)
    const m = Math.max(4, Math.round(w / 1.6));
    for (let k = 0; k < m; k++) {
      const cx = ((k + 0.5) / m - 0.5) * w + r.float(-0.4, 0.4), L = (Math.abs(cx) < gap / 2 ? r.float(3.5, 6) : r.float(1.6, 3.6));
      column(flow, r, [{ y: h - L, r: 0.07, dx: cx, dz: 1.0 }, { y: h - 0.3, r: 0.42, dx: cx, dz: 1.0 }], { sides: 4, tile: 3, color: [1.1, 1.18, 1.22], peak: [0, 0.4, 0], rot0: r.float(0, 1) });
    }
    // snow on the lip, and a frozen splash at the foot
    for (let k = 0; k < 5; k++) lump(snow, r, [((k + 0.5) / 5 - 0.5) * w * 0.9, h + 0.15, 0], r.float(1.4, 2.0), { detail: 'o1', noise: 0.2, sy: 0.4, tile: 3, smooth: 0.3, skipDown: 0.1, color: [1.04, 1.1, 1.2] });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU, cx = ((k + 0.5) / 4 - 0.5) * w * 0.8 + Math.cos(a) * 0.4;
      lump(ice, r, [cx, 0.2, 1.9 + r.float(0, 0.8)], r.float(1.3, 2.0), { detail: 'o1', noise: 0.18, sy: 0.45, tile: 3, smooth: 0.3, skipDown: 0.2, color: [0.95, 1.08, 1.2] });
    }
    kit.glow(0, 2.2, 2.6, { color: [0.55, 0.85, 1.0], size: 8, pool: 4.5, lightR: 15, lightK: 0.45 });
    kit.emitter(0, h * 0.4, 1.4, { kind: 'sparkle', rate: 2.5, radius: w * 0.34 });
    for (const c of [-w / 3, 0, w / 3]) kit.caster(c, 0.5, w / 7, h * 0.9, 0.25);
  });
}

export const FROST = {
  ice_fall: { fn: iceFall, size: 20, note: 'a waterfall frozen where it fell, facing +z: ORIGIN = the foot of the fall, lip at y+h, flows of ice (solid) and icicles; gap/gapH leave an opening under the fall (the flows over it hang from the lip); h 6-34, w 6-36', defaults: { h: 16, w: 20 }, anchors: { base: [0, 0, 0], lip: [0, 16, 0] } },
};
